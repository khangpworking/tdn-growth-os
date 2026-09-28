import assert from 'node:assert/strict';
import test from 'node:test';
import { generatedProductWorkspaceKey, submitOwnerProductWorkspace, submitOwnerProductWorkspaceAndReload, b9LockBlocker, b9SaveBlocker, b9LockDisabled, b9SaveDisabled, clearanceMatchesCurrent, exactCurrentPassDecisionIds, frontendMode, loadFrontendAvailability, loadRealWorkspaceState, ownerClearanceDisabled, ownerDecisionDisabled, OwnerWriteError, stableSegmentKey, submitB9AndReload, submitOwnerB8Clearance, submitOwnerB8Decision, submitOwnerB9Lock, submitOwnerB9Working, submitOwnerClearanceAndReload, submitOwnerDecisionAndReload, submitOwnerB10Decision, submitOwnerB10AndReload, ownerB10Blocker, ownerB10Disabled, generatedWorkspaceKey, ownerWorkspaceDisabled, submitOwnerWorkspace, submitOwnerWorkspaceAndReload, generatedCandidateKey, ownerCandidateDisabled, submitOwnerCandidate, submitOwnerCandidateRevision, submitOwnerCandidateAndReload, generatedBasketKey, ownerBasketDisabled, submitOwnerBasket, submitOwnerBasketAndReload, ownerB7Disabled, submitOwnerB7Decision, submitOwnerB7AndReload, WorkspaceDataSourceError } from '../src/data-source';
import { validStpDraft } from '../src/B9Editor';
import { loadReportHistory, loadReportInterpretations, loadWorkspaceReportIndex, reportArtifactUrl } from '../src/data-source';

const ids = {
  w1: '11111111-1111-4111-8111-111111111111', w2: '11111111-1111-4111-8111-222222222222',
  c1: '22222222-2222-4222-8222-111111111111', p1: '33333333-3333-4333-8333-111111111111',
  basket: '44444444-4444-4444-8444-111111111111', b7: '55555555-5555-4555-8555-111111111111',
  d1: '66666666-6666-4666-8666-111111111111', d2: '66666666-6666-4666-8666-222222222222', d3: '66666666-6666-4666-8666-333333333333',
} as const;
const at = '2026-10-01T00:00:00.000Z';
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const workspace = (workspaceId: string, candidateCount: number, productCount: number) => ({ workspaceId, workspaceKey: `key-${workspaceId}`, state: 'ACTIVE', title: 'Trùng tên', createdAt: at, candidateCount, productCount });
const productSummary = { productWorkspaceId: ids.p1, productWorkspaceKey: 'product-one', state: 'ACTIVE', entryStep: 'B8', title: 'Sản phẩm', createdAt: at };

function validResponses(): Map<string, unknown> {
  const w1 = workspace(ids.w1, 1, 1); const w2 = workspace(ids.w2, 0, 0);
  return new Map<string, unknown>([
    ['/api/workspaces', { contractVersion: '1.0.0', workspaces: [w1, w2] }],
    [`/api/workspaces/${ids.w1}`, { contractVersion: '1.0.0', workspace: w1, candidates: [{ candidateId: ids.c1, candidateKey: 'candidate-one', state: 'EXPLORING', version: 3, label: 'Ứng viên', createdAt: at }], products: [productSummary] }],
    [`/api/workspaces/${ids.w2}`, { contractVersion: '1.0.0', workspace: w2, candidates: [], products: [] }],
    [`/api/workspaces/${ids.w1}/candidate-baskets`, { contractVersion: '1.0.0', workspaceId: ids.w1, baskets: [{ basketId: ids.basket, workspaceId: ids.w1, basketKey: 'basket-one', version: 1, frozenAt: at, candidates: [{ candidateId: ids.c1, candidateKey: 'candidate-one', candidateVersion: 3, label: 'Ứng viên', state: 'EXPLORING' }] }] }],
    [`/api/workspaces/${ids.w2}/candidate-baskets`, { contractVersion: '1.0.0', workspaceId: ids.w2, baskets: [] }],
    [`/api/workspaces/${ids.w1}/candidate-baskets/${ids.basket}/b7`, { contractVersion: '1.0.0', workspaceId: ids.w1, basketId: ids.basket, basketKey: 'basket-one', basketVersion: 1, frozenAt: at, candidates: [{ candidateId: ids.c1, candidateKey: 'candidate-one', candidateVersion: 3, label: 'Ứng viên', state: 'EXPLORING', effectiveState: 'PASS', decisionId: ids.b7, decidedAt: at, productWorkspace: { productWorkspaceId: ids.p1, productWorkspaceKey: 'product-one', title: 'Sản phẩm', state: 'ACTIVE', entryStep: 'B8', createdAt: at } }] }],
    [`/api/product-workspaces/${ids.p1}/b9`, { contractVersion: '1.0.0', productWorkspaceId: ids.p1, state: 'NOT_STARTED' }],
    [`/api/product-workspaces/${ids.p1}/b10`, { contractVersion: '1.0.0', productWorkspaceId: ids.p1, history: [], effective: null, readyForB11: false }],
    [`/api/product-workspaces/${ids.p1}`, { contractVersion: '1.0.0', product: { ...productSummary, sourceWorkspaceId: ids.w1, sourceBasketId: ids.basket, sourceBasketKey: 'basket-one', sourceBasketVersion: 1, sourceCandidateId: ids.c1, sourceCandidateKey: 'candidate-one', sourceCandidateVersion: 3, sourceCandidateLabel: 'Ứng viên', sourceB7DecisionId: ids.b7, sourceB7DecidedAt: at }, b8: { readyForB9: false, lanes: [
      { lane: 'LEGAL', effectiveState: 'PASS', decisionId: ids.d1, decisionVersion: 1, decidedAt: at }, { lane: 'SCIENTIFIC', effectiveState: 'NO_DECISION' }, { lane: 'QUALITY', effectiveState: 'HOLD', decisionId: ids.d2, decisionVersion: 1, decidedAt: at }, { lane: 'FINANCE', effectiveState: 'REJECT', decisionId: ids.d3, decisionVersion: 1, decidedAt: at },
    ] } }],
  ]);
}
const fetchFrom = (responses: Map<string, unknown>) => (async (input: string | URL | Request) => json(responses.get(String(input)))) as typeof fetch;

test('real mode is default and demo requires an explicit URL parameter', () => {
  assert.equal(frontendMode(''), 'real');
  assert.equal(frontendMode('?mode=real'), 'real');
  assert.equal(frontendMode('?mode=demo'), 'demo');
});

test('loads an explicit report series and predecessor-bound history without choosing a version', async () => {
  const reportId = ids.c1;
  const index = { contractVersion: '1.0.0', workspaceId: ids.w1, reports: [{ reportId, reportKey: 'market-canxi', createdAt: at }] };
  const version = {
    versionId: ids.d1, version: 1, previousSemanticVersionId: null, semanticVersionId: 'a'.repeat(64), createdAt: at,
    status: 'DRAFT', interpretationState: 'NONE', reviewState: 'UNREVIEWED',
    scope: { key: 'canxi', platform: 'shopee', selection: 'ON', start: '2024-08-10', end: '2026-08-10', periodBasis: 'Metric filter', acquiredAt: null },
    sectionCounts: { total: 30, partialDeterministicDraft: 4, methodOnly: 13, blocked: 12, manualReviewRequired: 1, notImplemented: 0 },
    selectedSourceCount: 2,
    artifacts: [{ fileName: 'report.html', mediaType: 'text/html; charset=utf-8', byteSize: 1200 }, { fileName: 'packet.json', mediaType: 'application/json', byteSize: 800 }],
  };
  const history = { contractVersion: '1.0.0', reportId, reportKey: 'market-canxi', workspaceId: ids.w1, versions: [version] };
  const fetcher = (async (input: string | URL | Request) => json(String(input).endsWith('/versions') ? history : index)) as typeof fetch;
  assert.deepEqual((await loadWorkspaceReportIndex(ids.w1, fetcher)).reports.map(item => item.reportId), [reportId]);
  assert.equal((await loadReportHistory(reportId, fetcher)).versions[0]?.sectionCounts.partialDeterministicDraft, 4);
  assert.equal(reportArtifactUrl(reportId, 1, 'report.html'), `/api/reports/${reportId}/versions/1/files/report.html`);
  await assert.rejects(loadReportHistory(reportId, (async () => json({ ...history, versions: [{ ...version, previousSemanticVersionId: 'b'.repeat(64) }] })) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
});

test('validates the exact-version interpretation index from the canonical closed contract', async () => {
  const summary = { interpretationId: ids.d2, interpretationNumber: 1, interpretationContentSha256: 'b'.repeat(64), completedAt: at, storedAt: at, sourceSemanticVersionId: 'a'.repeat(64), sourcePacketId: 'c'.repeat(64), providerId: 'offline-fixture', modelId: 'model-pinned', promptId: 'report-insight', promptVersion: 1, itemCount: 1, sectionIds: ['M01'] };
  const response = { contractVersion: '1.0.0', reportId: ids.c1, reportVersion: 1, interpretations: [summary] };
  assert.equal((await loadReportInterpretations(ids.c1, 1, (async () => json(response)) as typeof fetch)).interpretations[0]?.interpretationId, ids.d2);
  await assert.rejects(loadReportInterpretations(ids.c1, 1, (async () => json({ ...response, interpretations: [{ ...summary, providerRequestId: 'private' }] })) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
});

test('loads real portfolio/details by IDs and exact candidate versions without inferring duplicate names', async () => {
  const state = await loadRealWorkspaceState(fetchFrom(validResponses()));
  assert.deepEqual(state.markets.map((market) => [market.id, market.name]), [[ids.w1, 'Trùng tên'], [ids.w2, 'Trùng tên']]);
  assert.deepEqual(state.candidates.map((candidate) => [candidate.marketId, candidate.version]), [[ids.w1, 3]]);
  assert.deepEqual(state.products.map((product) => [product.marketId, product.candidateVersion]), [[ids.w1, 3]]);
  assert.deepEqual(state.products[0]?.states, { LEGAL: 'PASS', SCIENTIFIC: 'NONE', QUALITY: 'HOLD', FINANCE: 'REJECT' });
  assert.deepEqual(state.products[0]?.versions, { LEGAL: 1, SCIENTIFIC: 0, QUALITY: 1, FINANCE: 1 });
  assert.deepEqual(state.products[0]?.decisionIds, { LEGAL: ids.d1, SCIENTIFIC: null, QUALITY: ids.d2, FINANCE: ids.d3 });
});

test('truthfully preserves an empty real portfolio', async () => {
  const state = await loadRealWorkspaceState((async () => json({ contractVersion: '1.0.0', workspaces: [] })) as typeof fetch);
  assert.deepEqual(state.markets, []);
  assert.deepEqual(state.products, []);
});

test('rejects malformed nested responses and inconsistent relationships', async () => {
  for (const mutate of [
    (responses: Map<string, unknown>) => { (responses.get(`/api/workspaces/${ids.w1}`) as any).workspace.candidateCount = 2; },
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).product.sourceCandidateVersion = 4; },
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).b8.lanes[0].decisionVersion = '1'; },
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).b8.readyForB9 = true; },
  ]) {
    const responses = validResponses(); mutate(responses);
    await assert.rejects(loadRealWorkspaceState(fetchFrom(responses)), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
  }
});

test('connection and integrity failures remain distinct without demo fallback', async () => {
  await assert.rejects(loadRealWorkspaceState((async () => { throw new Error('private path'); }) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'connection');
  await assert.rejects(loadRealWorkspaceState((async () => json({ error: { code: 'integrity_error' } }, 500)) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
});

test('maps read-only B9 working/locked content and ordered B10 correction history', async () => {
  const responses = validResponses();
  responses.set(`/api/product-workspaces/${ids.p1}/b9`, { contractVersion: '1.0.0', productWorkspaceId: ids.p1, state: 'LOCKED', working: { workingStpId: ids.basket, workingRevision: `wr1_${'a'.repeat(43)}`, b8ClearanceId: ids.b7, content: { segments: [{ key: 'adult', label: 'Người lớn' }, { key: 'senior', label: 'Người cao tuổi' }], primaryTargetSegmentKey: 'adult', secondaryTargetSegmentKeys: ['senior'], positioningStatement: 'Định vị đã khóa.' }, createdAt: at, updatedAt: at }, locked: { lockId: ids.d1, state: 'LOCKED_STP', lockedAt: at } });
  responses.set(`/api/product-workspaces/${ids.p1}/b10`, { contractVersion: '1.0.0', productWorkspaceId: ids.p1, history: [{ decisionId: ids.d2, decisionNumber: 1, previousDecisionId: null, decision: 'HOLD', decidedAt: at, lockedStpId: ids.d1 }, { decisionId: ids.d3, decisionNumber: 2, previousDecisionId: ids.d2, decision: 'APPROVE', decidedAt: at, lockedStpId: ids.d1 }], effective: { decisionId: ids.d3, decisionNumber: 2, previousDecisionId: ids.d2, decision: 'APPROVE', decidedAt: at, lockedStpId: ids.d1 }, readyForB11: true });
  const state = await loadRealWorkspaceState(fetchFrom(responses)); const product = state.products[0]!;
  assert.equal(product.b9.state, 'LOCKED'); assert.deepEqual(product.b9.working?.segments.map((segment) => segment.key), ['adult', 'senior']); assert.equal(product.b10.history.length, 2); assert.equal(product.b10.effective?.decision, 'APPROVE'); assert.equal(product.b10.readyForB11, true);
});

test('OWNER submission sends only closed decision input and token in memory request headers', async () => {
  let observed: RequestInit | undefined;
  const receipt = await submitOwnerB8Decision({ productWorkspaceId: ids.p1, lane: 'LEGAL', expectedVersion: 1, decision: 'HOLD', token: 'x'.repeat(31) + '1' }, (async (_url, init) => { observed = init; return json({ contractVersion: '1.0.0', decisionId: ids.d2, decisionVersion: 2, lane: 'LEGAL', decision: 'HOLD', decidedAt: at, exactRetry: false }, 201); }) as typeof fetch);
  assert.equal((observed?.headers as Record<string,string>).Authorization, `Bearer ${'x'.repeat(31) + '1'}`);
  assert.deepEqual(JSON.parse(String(observed?.body)), { contractVersion: '1.0.0', lane: 'LEGAL', expectedVersion: 1, decision: 'HOLD' });
  assert.equal(receipt.decisionVersion, 2);
});

test('OWNER 409 is explicit and never falls back to demo data', async () => {
  await assert.rejects(submitOwnerB8Decision({ productWorkspaceId: ids.p1, lane: 'LEGAL', expectedVersion: 1, decision: 'HOLD', token: 'x'.repeat(31) + '1' }, (async () => json({ error: { code: 'conflict', message: 'conflict' } }, 409)) as typeof fetch), (error) => error instanceof OwnerWriteError && error.kind === 'conflict');
});

test('frontend source keeps OWNER token out of persistent browser APIs', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'));
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'URLSearchParams']) assert.equal(source.includes(forbidden), false);
});

test('real OWNER controls stay disabled while locked, pending, or matching effective state', () => {
  assert.equal(ownerDecisionDisabled({ unlocked: false, pending: false, effective: 'NONE', decision: 'PASS' }), true);
  assert.equal(ownerDecisionDisabled({ unlocked: true, pending: true, effective: 'NONE', decision: 'PASS' }), true);
  assert.equal(ownerDecisionDisabled({ unlocked: true, pending: false, effective: 'PASS', decision: 'PASS' }), true);
  assert.equal(ownerDecisionDisabled({ unlocked: true, pending: false, effective: 'HOLD', decision: 'PASS' }), false);
});

test('success and 409 both reload authoritative read data exactly once', async () => {
  let reloads = 0; const input = { productWorkspaceId: ids.p1, lane: 'LEGAL' as const, expectedVersion: 1, decision: 'HOLD' as const, token: 'x'.repeat(31) + '1' };
  const success = await submitOwnerDecisionAndReload(input, async () => { reloads++; }, (async () => json({ contractVersion: '1.0.0', decisionId: ids.d2, decisionVersion: 2, lane: 'LEGAL', decision: 'HOLD', decidedAt: at, exactRetry: false }, 201)) as typeof fetch);
  assert.equal(success, 'success'); assert.equal(reloads, 1);
  const conflict = await submitOwnerDecisionAndReload(input, async () => { reloads++; }, (async () => json({ error: { code: 'conflict', message: 'conflict' } }, 409)) as typeof fetch);
  assert.equal(conflict, 'conflict'); assert.equal(reloads, 2);
});

test('clearance eligibility requires unlocked exact four current PASS IDs, no clearance, and no pending request', async () => {
  const product = (await loadRealWorkspaceState(fetchFrom(validResponses()))).products[0]!;
  const ready = { ...product, states: { LEGAL: 'PASS', SCIENTIFIC: 'PASS', QUALITY: 'PASS', FINANCE: 'PASS' } as const, decisionIds: { LEGAL: ids.d1, SCIENTIFIC: ids.d2, QUALITY: ids.d3, FINANCE: ids.b7 } };
  assert.equal(ownerClearanceDisabled({ unlocked: false, pending: false, product: ready }), true);
  assert.equal(ownerClearanceDisabled({ unlocked: true, pending: true, product: ready }), true);
  assert.deepEqual(exactCurrentPassDecisionIds(ready), ready.decisionIds);
  assert.equal(ownerClearanceDisabled({ unlocked: true, pending: false, product: ready }), false);
  assert.equal(ownerClearanceDisabled({ unlocked: true, pending: false, product: { ...ready, decisionIds: { ...ready.decisionIds, LEGAL: null } } }), true);
  assert.equal(ownerClearanceDisabled({ unlocked: true, pending: false, product: { ...ready, clearance: { id: ids.w2, time: at, decisionIds: ready.decisionIds } } }), true);
});

test('clearance submission sends exact closed decision IDs and success/conflict reload authoritative reads', async () => {
  const decisionIds = { LEGAL: ids.d1, SCIENTIFIC: ids.d2, QUALITY: ids.d3, FINANCE: ids.b7 } as const; let observed: RequestInit | undefined;
  const input = { productWorkspaceId: ids.p1, decisionIds, token: 'x'.repeat(31) + '1' }; let reloads = 0;
  const receipt = await submitOwnerB8Clearance(input, (async (_url, init) => { observed = init; return json({ contractVersion: '1.0.0', clearanceId: ids.w2, state: 'READY_FOR_B9', clearedAt: at, exactRetry: false }, 201); }) as typeof fetch);
  assert.deepEqual(JSON.parse(String(observed?.body)), { contractVersion: '1.0.0', decisionIds }); assert.equal(receipt.state, 'READY_FOR_B9');
  const success = await submitOwnerClearanceAndReload(input, async () => { reloads++; }, (async () => json({ contractVersion: '1.0.0', clearanceId: ids.w2, state: 'READY_FOR_B9', clearedAt: at, exactRetry: false }, 201)) as typeof fetch);
  const conflict = await submitOwnerClearanceAndReload(input, async () => { reloads++; }, (async () => json({ error: { code: 'conflict', message: 'conflict' } }, 409)) as typeof fetch);
  assert.deepEqual([success, conflict, reloads], ['success', 'conflict', 2]);
});

test('historical clearance comparison detects any later B8 decision change', async () => {
  const product = (await loadRealWorkspaceState(fetchFrom(validResponses()))).products[0]!; const frozen = { LEGAL: ids.d1, SCIENTIFIC: ids.d2, QUALITY: ids.d3, FINANCE: ids.b7 };
  const historical = { ...product, states: { LEGAL: 'PASS', SCIENTIFIC: 'PASS', QUALITY: 'PASS', FINANCE: 'PASS' } as const, decisionIds: frozen, clearance: { id: ids.w2, time: at, decisionIds: frozen } };
  assert.equal(clearanceMatchesCurrent(historical), true);
  assert.equal(clearanceMatchesCurrent({ ...historical, decisionIds: { ...frozen, LEGAL: ids.c1 } }), false);
  const [source, dialog] = await Promise.all([import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')), import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/ConfirmDialog.tsx', import.meta.url), 'utf8'))]);
  assert.match(dialog, /role="dialog"/); assert.match(source, /Đóng băng bốn quyết định Đạt hiện tại/); assert.match(source, /Sang B9/);
});

test('B9 editor validates targets/order/limits and generates stable internal keys without user input', () => {
  const valid = { segments: [{ key: 'segment-1', label: 'Người lớn' }, { key: 'segment-2', label: 'Người cao tuổi' }], primary: 'segment-1', secondary: ['segment-2'], positioning: 'Định vị rõ ràng.' };
  assert.equal(validStpDraft(valid), true); assert.equal(validStpDraft({ ...valid, primary: 'missing' }), false); assert.equal(validStpDraft({ ...valid, secondary: ['segment-1'] }), false); assert.equal(validStpDraft({ ...valid, secondary: ['segment-2', 'segment-2'] }), false); assert.equal(validStpDraft({ ...valid, positioning: '' }), false); assert.equal(validStpDraft({ ...valid, segments: [{ key: 'segment-1', label: 'x'.repeat(201) }] }), false);
  assert.equal(stableSegmentKey(2, ['segment-1', 'segment-2']), 'segment-3'); assert.deepEqual(valid.segments.map((item) => item.key), ['segment-1', 'segment-2']);
});

test('B9 controls enforce unlock, pending, dirty, saved revision and post-lock states', () => {
  const revision = `wr1_${'a'.repeat(43)}`;
  assert.equal(b9SaveDisabled({ unlocked: false, pending: false, locked: false, valid: true }), true); assert.equal(b9SaveDisabled({ unlocked: true, pending: true, locked: false, valid: true }), true); assert.equal(b9SaveDisabled({ unlocked: true, pending: false, locked: false, valid: true }), false);
  assert.equal(b9LockDisabled({ unlocked: true, pending: false, locked: false, dirty: false, revision }), false); assert.equal(b9LockDisabled({ unlocked: true, pending: false, locked: false, dirty: true, revision }), true); assert.equal(b9LockDisabled({ unlocked: true, pending: false, locked: true, dirty: false, revision }), true); assert.equal(b9LockDisabled({ unlocked: false, pending: false, locked: false, dirty: false, revision }), true);
});

test('B9 blockers distinguish runtime, OWNER, input, unsaved changes and business prerequisites', () => {
  const revision = `wr1_${'a'.repeat(43)}`;
  assert.equal(b9SaveBlocker({ writesAvailable: false, unlocked: false, pending: false, locked: false, valid: true, clearanceId: ids.b7 }), 'runtime_unavailable');
  assert.equal(b9SaveBlocker({ writesAvailable: true, unlocked: false, pending: false, locked: false, valid: true, clearanceId: ids.b7 }), 'owner_locked');
  assert.equal(b9SaveBlocker({ writesAvailable: true, unlocked: true, pending: false, locked: false, valid: true, clearanceId: null }), 'business_prerequisite');
  assert.equal(b9SaveBlocker({ writesAvailable: true, unlocked: true, pending: false, locked: false, valid: false, clearanceId: ids.b7 }), 'invalid_input');
  assert.equal(b9LockBlocker({ writesAvailable: true, unlocked: true, pending: false, locked: false, dirty: true, revision, clearanceId: ids.b7 }), 'unsaved_changes');
  assert.equal(b9LockBlocker({ writesAvailable: true, unlocked: true, pending: false, locked: false, dirty: false, revision: null, clearanceId: ids.b7 }), 'business_prerequisite');
});

test('B9 save and lock send closed exact revisions and success/conflict reload authoritative state', async () => {
  const revision = `wr1_${'a'.repeat(43)}`; const token = 'x'.repeat(31) + '1'; const calls: { url: string; init?: RequestInit }[] = [];
  const draft = { b8ClearanceId: ids.w2, expectedWorkingRevision: null, segments: [{ key: 'segment-1', label: 'Người lớn' }], primaryTargetSegmentKey: 'segment-1', positioningStatement: 'Định vị.' };
  await submitOwnerB9Working(ids.p1, draft, token, (async (url, init) => { calls.push({ url: String(url), init }); return json({ contractVersion: '1.0.0', workingStpId: ids.basket, productWorkspaceId: ids.p1, workingRevision: revision, createdAt: at, updatedAt: at, exactRetry: false }, 201); }) as typeof fetch);
  await submitOwnerB9Lock(ids.p1, revision, token, (async (url, init) => { calls.push({ url: String(url), init }); return json({ contractVersion: '1.0.0', lockId: ids.d1, state: 'LOCKED_STP', lockedAt: at, exactRetry: false }, 201); }) as typeof fetch);
  assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), { contractVersion: '1.0.0', ...draft }); assert.deepEqual(JSON.parse(String(calls[1]!.init?.body)), { contractVersion: '1.0.0', expectedWorkingRevision: revision });
  let reloads = 0; assert.equal(await submitB9AndReload(async () => true, async () => { reloads++; }), 'success'); assert.equal(await submitB9AndReload(async () => { throw new OwnerWriteError('conflict', 'changed'); }, async () => { reloads++; }), 'conflict'); assert.equal(reloads, 2);
});

test('real B9 source has explicit save/lock, dirty navigation warning, no autosave and demo isolation', async () => {
  const [app, editor] = await Promise.all([import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')), import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/B9Editor.tsx', import.meta.url), 'utf8'))]);
  assert.match(editor, /Lưu bản nháp/); assert.match(editor, /product\.name/); assert.match(editor, /Lưu gần nhất/); assert.match(editor, /Khóa STP chính thức/); assert.match(editor, /beforeunload/); assert.match(app, /window\.confirm/); assert.doesNotMatch(editor, /setInterval|autosave/i); assert.match(app, /mode === 'real'.*<B9Editor/); assert.match(editor, /Sang B10/);
});

test('B10 OWNER request is closed and exact, and success/conflict reload authoritative reads', async () => {
  const revision = { productWorkspaceId: ids.p1, lockedStpId: ids.d1, previousDecisionId: null, decision: 'APPROVE' as const, token: 'x'.repeat(31) + '1' }; let observed: RequestInit | undefined;
  await submitOwnerB10Decision(revision, (async (_url, init) => { observed = init; return json({ contractVersion: '1.0.0', decisionId: ids.d2, decisionNumber: 1, previousDecisionId: null, decision: 'APPROVE', decidedAt: at, readyForB11: true, exactRetry: false }, 201); }) as typeof fetch);
  assert.deepEqual(JSON.parse(String(observed?.body)), { contractVersion: '1.0.0', lockedStpId: ids.d1, previousDecisionId: null, decision: 'APPROVE' });
  let reloads = 0; assert.equal(await submitOwnerB10AndReload(revision, async () => { reloads++; }, (async () => json({ contractVersion: '1.0.0', decisionId: ids.d2, decisionNumber: 1, previousDecisionId: null, decision: 'APPROVE', decidedAt: at, readyForB11: true, exactRetry: false }, 201)) as typeof fetch), 'success');
  assert.equal(await submitOwnerB10AndReload(revision, async () => { reloads++; }, (async () => json({ error: { code: 'conflict', message: 'changed' } }, 409)) as typeof fetch), 'conflict'); assert.equal(reloads, 2);
});

test('B10 controls require unlock and verified lock, prevent pending and repeated effective state', () => {
  assert.equal(ownerB10Disabled({ unlocked: false, pending: false, lockedStpId: ids.d1, effective: null, decision: 'APPROVE' }), true); assert.equal(ownerB10Disabled({ unlocked: true, pending: false, lockedStpId: null, effective: null, decision: 'APPROVE' }), true); assert.equal(ownerB10Disabled({ unlocked: true, pending: true, lockedStpId: ids.d1, effective: null, decision: 'APPROVE' }), true); assert.equal(ownerB10Disabled({ unlocked: true, pending: false, lockedStpId: ids.d1, effective: 'APPROVE', decision: 'APPROVE' }), true); assert.equal(ownerB10Disabled({ unlocked: true, pending: false, lockedStpId: ids.d1, effective: 'HOLD', decision: 'APPROVE' }), false);
});

test('B10 blockers distinguish runtime, missing lock, OWNER, pending and unchanged decisions', () => {
  assert.equal(ownerB10Blocker({ writesAvailable: false, unlocked: false, pending: false, lockedStpId: null, effective: null, decision: 'APPROVE' }), 'runtime_unavailable');
  assert.equal(ownerB10Blocker({ writesAvailable: true, unlocked: true, pending: false, lockedStpId: null, effective: null, decision: 'APPROVE' }), 'business_prerequisite');
  assert.equal(ownerB10Blocker({ writesAvailable: true, unlocked: false, pending: false, lockedStpId: ids.d1, effective: null, decision: 'APPROVE' }), 'owner_locked');
  assert.equal(ownerB10Blocker({ writesAvailable: true, unlocked: true, pending: true, lockedStpId: ids.d1, effective: null, decision: 'APPROVE' }), 'request_pending');
  assert.equal(ownerB10Blocker({ writesAvailable: true, unlocked: true, pending: false, lockedStpId: ids.d1, effective: 'APPROVE', decision: 'APPROVE' }), 'business_prerequisite');
});

test('real B10 panel has first/correction confirmations, funding clarification, no forbidden fields, and demo isolation', async () => {
  const [app, panel] = await Promise.all([import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')), import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/B10DecisionPanel.tsx', import.meta.url), 'utf8'))]);
  assert.match(panel, /Duyệt danh mục và cho phép nhận cấp vốn/); assert.match(panel, /quyết định B10 đầu tiên/); assert.match(panel, /bản sửa nối tiếp/); assert.match(panel, /không phân bổ, chuyển hoặc chi tiền/); assert.doesNotMatch(panel, /<input|<textarea/i); assert.match(app, /mode === 'real'.*<B10DecisionPanel/);
});


test('workspace key generation is stable, hidden, Task025-valid, and requests are closed', async () => {
  const key = generatedWorkspaceKey('77777777-7777-4777-8777-777777777777'); assert.equal(key, 'market-77777777777747778777777777777777'); assert.match(key, /^[a-z][a-z0-9_-]{2,79}$/);
  let observed: RequestInit | undefined; await submitOwnerWorkspace({ workspaceKey: key, title: 'Trùng tên', description: 'Rộng', token: 'x'.repeat(31) + '1' }, (async (_url, init) => { observed = init; return json({ contractVersion: '1.0.0', workspaceId: ids.w2, workspaceKey: key, state: 'ACTIVE', title: 'Trùng tên', description: 'Rộng', createdAt: at, exactRetry: false }, 201); }) as typeof fetch);
  assert.deepEqual(JSON.parse(String(observed?.body)), { contractVersion: '1.0.0', workspaceKey: key, title: 'Trùng tên', description: 'Rộng' });
  assert.equal(ownerWorkspaceDisabled({ unlocked: false, pending: false, title: 'A' }), true); assert.equal(ownerWorkspaceDisabled({ unlocked: true, pending: true, title: 'A' }), true); assert.equal(ownerWorkspaceDisabled({ unlocked: true, pending: false, title: ' ' }), true); assert.equal(ownerWorkspaceDisabled({ unlocked: true, pending: false, title: 'A' }), false);
});

test('workspace creation reloads authoritative portfolio and validates exact empty returned ID before navigation', async () => {
  const key = generatedWorkspaceKey('77777777-7777-4777-8777-777777777777'); const input = { workspaceKey: key, title: 'Trùng tên', token: 'x'.repeat(31) + '1' };
  const emptyState = { markets: [{ id: ids.w2, name: 'Trùng tên', keywords: '', note: 'Chưa có mô tả workspace.' }], candidates: [], products: [], sequence: 1 };
  let reloads = 0; const result = await submitOwnerWorkspaceAndReload(input, async () => { reloads++; return emptyState; }, (async () => json({ contractVersion: '1.0.0', workspaceId: ids.w2, workspaceKey: key, state: 'ACTIVE', title: 'Trùng tên', createdAt: at, exactRetry: false }, 201)) as typeof fetch);
  assert.equal(result.kind, 'success'); assert.equal(reloads, 1); assert.equal(result.state.markets[0]?.id, ids.w2);
  const conflict = await submitOwnerWorkspaceAndReload(input, async () => { reloads++; return emptyState; }, (async () => json({ error: { code: 'conflict', message: 'used' } }, 409)) as typeof fetch); assert.equal(conflict.kind, 'conflict'); assert.equal(reloads, 2);
});

test('ambiguous workspace failure preserves retry identity and real/demo UI remain isolated', async () => {
  const key = generatedWorkspaceKey('77777777-7777-4777-8777-777777777777'); const bodies: string[] = []; const input = { workspaceKey: key, title: 'Cơ hội rộng', token: 'x'.repeat(31) + '1' };
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(submitOwnerWorkspace(input, (async (_url, init) => { bodies.push(String(init?.body)); throw new Error('ambiguous'); }) as typeof fetch), (error) => error instanceof OwnerWriteError && error.kind === 'connection');
  assert.equal(bodies[0], bodies[1]);
  const [app, panel] = await Promise.all([import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')), import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/WorkspaceCreatePanel.tsx', import.meta.url), 'utf8'))]);
  assert.doesNotMatch(panel, /name="workspaceKey"|Workspace key/); assert.match(panel, /useState\(\(\) => generatedWorkspaceKey\(\)\)/); assert.match(panel, /Thao tác này chỉ tạo một vùng nghiên cứu trống/); assert.match(panel, /mode === 'demo'/); assert.match(app, /Create new research/); assert.match(app, /ownerToken=.*reloadReal=/);
});


test('workspace receipt validation rejects status mismatch and malformed or extra receipt data', async () => {
  const key = generatedWorkspaceKey('77777777-7777-4777-8777-777777777777'); const input = { workspaceKey: key, title: 'Cơ hội', token: 'x'.repeat(31) + '1' }; const valid = { contractVersion: '1.0.0', workspaceId: ids.w2, workspaceKey: key, state: 'ACTIVE', title: 'Cơ hội', createdAt: at, exactRetry: false };
  for (const [body, status] of [[{ ...valid, extra: true }, 201], [{ ...valid, workspaceKey: 'wrong-key' }, 201], [{ ...valid, workspaceId: 'bad' }, 201], [{ ...valid, createdAt: 'bad' }, 201], [{ ...valid, exactRetry: true }, 201], [{ ...valid, exactRetry: false }, 200]] as const) await assert.rejects(submitOwnerWorkspace(input, (async () => json(body, status)) as typeof fetch), (error) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('workspace create panel includes a synchronous in-flight double-submit guard', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/WorkspaceCreatePanel.tsx', import.meta.url), 'utf8'));
  assert.match(panel, /const inFlight = useRef\(false\)/); assert.match(panel, /if \(inFlight\.current\) return/); assert.match(panel, /inFlight\.current = true/); assert.match(panel, /inFlight\.current = false/);
});


test('candidate create uses a hidden stable key and validates the exact authoritative ID/version before success', async()=>{
  const key=generatedCandidateKey('77777777-7777-4777-8777-777777777777');assert.equal(key,'candidate-77777777777747778777777777777777');
  const token='x'.repeat(31)+'1';let observed:RequestInit|undefined;
  const receipt={contractVersion:'1.0.0',candidateId:ids.c1,workspaceId:ids.w1,candidateKey:key,state:'EXPLORING',version:1,label:'Ứng viên mới',summary:'Tổng hợp.',createdAt:at,exactRetry:false};
  await submitOwnerCandidate({workspaceId:ids.w1,candidateKey:key,label:'Ứng viên mới',summary:'Tổng hợp.',token},(async(_url,init)=>{observed=init;return json(receipt,201);}) as typeof fetch);
  assert.deepEqual(JSON.parse(String(observed?.body)),{contractVersion:'1.0.0',candidateKey:key,label:'Ứng viên mới',summary:'Tổng hợp.'});
  const authoritative={markets:[{id:ids.w1,name:'Thị trường',keywords:'',note:''}],candidates:[{id:ids.c1,marketId:ids.w1,key,version:1,name:'Ứng viên mới',summary:'Tổng hợp.',productId:null,productCandidateVersion:null}],products:[{id:ids.p1,marketId:ids.w1,basketId:ids.basket,basketKey:'basket',basketVersion:1,candidateId:ids.c1,candidateVersion:3,name:'Frozen candidate',summary:'Frozen summary',states:{LEGAL:'NONE',SCIENTIFIC:'NONE',QUALITY:'NONE',FINANCE:'NONE'},versions:{LEGAL:0,SCIENTIFIC:0,QUALITY:0,FINANCE:0},decisionIds:{LEGAL:null,SCIENTIFIC:null,QUALITY:null,FINANCE:null},history:[],clearance:null,b9:{state:'NOT_STARTED',working:null,locked:null},b10:{history:[],effective:null,readyForB11:false}}],sequence:1};
  const outcome=await submitOwnerCandidateAndReload({workspaceId:ids.w1,candidateKey:key,label:'Ứng viên mới',summary:'Tổng hợp.',token},async()=>authoritative,(async()=>json(receipt,201)) as typeof fetch);assert.equal(outcome.kind,'success');
  await assert.rejects(submitOwnerCandidateAndReload({workspaceId:ids.w1,candidateKey:key,label:'Ứng viên mới',summary:'Tổng hợp.',token},async()=>({...authoritative,candidates:[{...authoritative.candidates[0]!,version:2}]}),(async()=>json(receipt,201)) as typeof fetch),(error)=>error instanceof OwnerWriteError&&error.kind==='integrity');
});

test('candidate revision sends expected latest version, reloads on success and conflict, and never optimistically mutates',async()=>{
 const token='x'.repeat(31)+'1',input={workspaceId:ids.w1,candidateId:ids.c1,expectedVersion:3,label:'Tên v4',token};let body:unknown;
 const receipt={contractVersion:'1.0.0',candidateId:ids.c1,workspaceId:ids.w1,candidateKey:'candidate-one',state:'EXPLORING',version:4,label:'Tên v4',createdAt:at,exactRetry:false};
 await submitOwnerCandidateRevision(input,(async(_url,init)=>{body=JSON.parse(String(init?.body));return json(receipt,201);}) as typeof fetch);assert.deepEqual(body,{contractVersion:'1.0.0',expectedVersion:3,label:'Tên v4'});
 let reloads=0;const state={markets:[],candidates:[{id:ids.c1,marketId:ids.w1,key:'candidate-one',version:4,name:'Tên v4',summary:'',productId:ids.p1,productCandidateVersion:3}],products:[{id:ids.p1,marketId:ids.w1,basketId:ids.basket,basketKey:'basket',basketVersion:1,candidateId:ids.c1,candidateVersion:3,name:'Frozen candidate',summary:'Frozen summary',states:{LEGAL:'NONE',SCIENTIFIC:'NONE',QUALITY:'NONE',FINANCE:'NONE'},versions:{LEGAL:0,SCIENTIFIC:0,QUALITY:0,FINANCE:0},decisionIds:{LEGAL:null,SCIENTIFIC:null,QUALITY:null,FINANCE:null},history:[],clearance:null,b9:{state:'NOT_STARTED',working:null,locked:null},b10:{history:[],effective:null,readyForB11:false}}],sequence:1};
 assert.equal((await submitOwnerCandidateAndReload(input,async()=>{reloads++;return state},(async()=>json(receipt,201)) as typeof fetch)).kind,'success');
 assert.equal((await submitOwnerCandidateAndReload(input,async()=>{reloads++;return state},(async()=>json({error:{code:'conflict'}},409)) as typeof fetch)).kind,'conflict');assert.equal(reloads,2);
 assert.equal(ownerCandidateDisabled({unlocked:true,pending:false,label:'Tên',summary:''}),false);
});

test('latest candidate and historical product source version coexist and UI keeps real/demo writes isolated',async()=>{
 const responses=validResponses();(responses.get(`/api/workspaces/${ids.w1}`) as any).candidates[0].version=4;
 const state=await loadRealWorkspaceState(fetchFrom(responses));assert.equal(state.candidates[0]?.version,4);assert.equal(state.candidates[0]?.productCandidateVersion,3);assert.equal(state.candidates[0]?.productId,ids.p1);
 const [app,panel]=await Promise.all([import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/App.tsx',import.meta.url),'utf8')),import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/CandidateEditor.tsx',import.meta.url),'utf8'))]);
 assert.doesNotMatch(panel,/name=["']candidateKey|Khóa ứng viên/);assert.match(panel,/useState\(\(\)=>candidate\?\.key \?\? generatedCandidateKey\(\)\)/);assert.match(panel,/mode==='demo'/);assert.match(app,/Workspace sản phẩm hiện có vẫn giữ snapshot của phiên bản ứng viên đã dùng tại B7/);
});


test('Task042 basket POST is closed, uses an explicit version, and has a stable hidden generated key', async () => {
  const basketKey = generatedBasketKey('77777777-7777-4777-8777-777777777777');
  assert.equal(basketKey, 'basket-77777777777747778777777777777777');
  assert.match(basketKey, /^[a-z][a-z0-9_-]{2,79}$/);
  const input = { workspaceId: ids.w1, basketKey, version: 2, candidates: [{ candidateId: ids.c1, candidateVersion: 3 }], token: 'x'.repeat(31) + '1' };
  let url = ''; let observed: RequestInit | undefined;
  await submitOwnerBasket(input, (async (requestUrl, init) => {
    url = String(requestUrl); observed = init;
    return json({ contractVersion: '1.0.0', basketId: ids.basket, workspaceId: ids.w1, basketKey, version: 2, frozenAt: at, candidateCount: 1, exactRetry: false }, 201);
  }) as typeof fetch);
  assert.equal(url, `/owner-api/workspaces/${ids.w1}/candidate-baskets`);
  assert.equal(observed?.method, 'POST');
  assert.deepEqual(JSON.parse(String(observed?.body)), { contractVersion: '1.0.0', basketKey, version: 2, candidates: [{ candidateId: ids.c1, candidateVersion: 3 }] });
  assert.equal(String(observed?.body).includes('expectedLatestVersion'), false);
});

test('Task042 accepts only exact 201-created and 200-exact-retry basket receipts', async () => {
  const basketKey = generatedBasketKey('77777777-7777-4777-8777-777777777777');
  const input = { workspaceId: ids.w1, basketKey, version: 1, candidates: [{ candidateId: ids.c1, candidateVersion: 3 }], token: 'x'.repeat(31) + '1' };
  const base = { contractVersion: '1.0.0', basketId: ids.basket, workspaceId: ids.w1, basketKey, version: 1, frozenAt: at, candidateCount: 1 };
  assert.equal((await submitOwnerBasket(input, (async () => json({ ...base, exactRetry: false }, 201)) as typeof fetch)).exactRetry, false);
  assert.equal((await submitOwnerBasket(input, (async () => json({ ...base, exactRetry: true }, 200)) as typeof fetch)).exactRetry, true);
  for (const [body, status] of [
    [{ ...base, exactRetry: true }, 201], [{ ...base, exactRetry: false }, 200],
    [{ ...base, exactRetry: false, extra: true }, 201], [{ ...base, exactRetry: false, basketId: 'bad' }, 201],
    [{ ...base, exactRetry: false, basketKey: 'basket-wrong' }, 201], [{ ...base, exactRetry: false, version: 2 }, 201],
    [{ ...base, exactRetry: false, candidateCount: 2 }, 201], [{ ...base, exactRetry: false, frozenAt: 'not-a-date' }, 201],
    [{ ...base, exactRetry: false }, 202],
  ] as const) {
    await assert.rejects(submitOwnerBasket(input, (async () => json(body, status)) as typeof fetch), (error) => error instanceof OwnerWriteError && error.kind === 'integrity');
  }
});

test('Task042 success verifies authoritative basket identity, key, version, and exact membership', async () => {
  const basketKey = generatedBasketKey('77777777-7777-4777-8777-777777777777');
  const secondCandidateId = '22222222-2222-4222-8222-222222222222';
  const selections = [{ candidateId: secondCandidateId, candidateVersion: 5 }, { candidateId: ids.c1, candidateVersion: 3 }];
  const input = { workspaceId: ids.w1, basketKey, version: 1, candidates: selections, token: 'x'.repeat(31) + '1' };
  const receipt = { contractVersion: '1.0.0', basketId: ids.basket, workspaceId: ids.w1, basketKey, version: 1, frozenAt: at, candidateCount: 2, exactRetry: false };
  const authoritative = { markets: [], candidates: [], products: [], baskets: [{ id: ids.basket, marketId: ids.w1, key: basketKey, version: 1, frozenAt: at, candidates: [
    { candidateId: ids.c1, candidateKey: 'candidate-one', candidateVersion: 3, name: 'Một', summary: 'Tóm tắt một' },
    { candidateId: secondCandidateId, candidateKey: 'candidate-two', candidateVersion: 5, name: 'Hai', summary: 'Tóm tắt hai' },
  ] }], sequence: 1 };
  let reloads = 0;
  const outcome = await submitOwnerBasketAndReload(input, async () => { reloads++; return authoritative; }, (async () => json(receipt, 201)) as typeof fetch);
  assert.equal(outcome.kind, 'success'); assert.equal(reloads, 1);
  for (const mutate of [
    () => ({ ...authoritative, baskets: [{ ...authoritative.baskets[0]!, id: ids.w2 }] }),
    () => ({ ...authoritative, baskets: [{ ...authoritative.baskets[0]!, key: 'basket-other' }] }),
    () => ({ ...authoritative, baskets: [{ ...authoritative.baskets[0]!, version: 2 }] }),
    () => ({ ...authoritative, baskets: [{ ...authoritative.baskets[0]!, candidates: authoritative.baskets[0]!.candidates.slice(0, 1) }] }),
    () => ({ ...authoritative, baskets: [{ ...authoritative.baskets[0]!, candidates: [{ ...authoritative.baskets[0]!.candidates[0]!, candidateVersion: 4 }, authoritative.baskets[0]!.candidates[1]!] }] }),
  ]) await assert.rejects(submitOwnerBasketAndReload(input, async () => mutate(), (async () => json(receipt, 201)) as typeof fetch), (error) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('Task042 conflict reloads once and ambiguous retries preserve byte-identical basket request', async () => {
  const input = { workspaceId: ids.w1, basketKey: generatedBasketKey('77777777-7777-4777-8777-777777777777'), version: 4, candidates: [{ candidateId: ids.c1, candidateVersion: 3 }], token: 'x'.repeat(31) + '1' };
  const state = { markets: [], candidates: [], baskets: [], products: [], sequence: 1 };
  let reloads = 0;
  const conflict = await submitOwnerBasketAndReload(input, async () => { reloads++; return state; }, (async () => json({ error: { code: 'conflict' } }, 409)) as typeof fetch);
  assert.equal(conflict.kind, 'conflict'); assert.equal(reloads, 1);
  const bodies: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(submitOwnerBasket(input, (async (_url, init) => { bodies.push(String(init?.body)); throw new Error('ambiguous'); }) as typeof fetch), (error) => error instanceof OwnerWriteError && error.kind === 'connection');
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
});

test('Task042 basket controls require OWNER, selection and no pending request', () => {
  assert.equal(ownerBasketDisabled({ unlocked: false, pending: false, selectedCount: 1 }), true);
  assert.equal(ownerBasketDisabled({ unlocked: true, pending: true, selectedCount: 1 }), true);
  assert.equal(ownerBasketDisabled({ unlocked: true, pending: false, selectedCount: 0 }), true);
  assert.equal(ownerBasketDisabled({ unlocked: true, pending: false, selectedCount: 2 }), false);
});

test('Task042 basket panel starts unchecked and preserves an immutable confirmation snapshot', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'));
  assert.match(panel, /useState<readonly string\[]>\(\(\) => initialCandidateIds/);
  assert.match(panel, /checked=\{selected\.includes\(candidate\.id\)\}/);
  assert.match(panel, /const \[requestSnapshot, setRequestSnapshot\] = useState<\{ basketKey: string; version: number; candidates:/);
  assert.match(panel, /const snapshot = requestSnapshot \?\?/);
  assert.match(panel, /requestSnapshot\.candidates\.map\(\(\{ candidateId, candidateVersion \}\)/);
  assert.doesNotMatch(panel, /candidateVersion:\s*candidates\.find.*freeze/s);
});

test('Task042 panel has exact Vietnamese action, section, confirmation, and immutable-snapshot warning', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'));
  for (const text of ['Đóng băng rổ ứng viên', 'Đóng băng rổ cơ hội', 'Xác nhận đóng băng rổ cơ hội', 'Rổ này sẽ giữ nguyên các phiên bản ứng viên đã chọn. Chỉnh sửa ứng viên sau này không thay đổi snapshot này.']) assert.equal(panel.includes(text), true);
  assert.match(panel, /<ConfirmDialog/); assert.match(panel, /titleId="basket-confirm-title"/); assert.match(panel, /descriptionId="basket-confirm-description"/);
  assert.match(panel, /Đang khám phá · phiên bản hiện tại v\{candidate\.version\}/);
  assert.match(panel, /candidate\.summary && <small>\{candidate\.summary\}<\/small>/);
});

test('Task042 panel exposes all basket families with explicit next versions and no arbitrary global latest', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'));
  assert.match(panel, /new Set\(baskets\.map\(\(basket\) => basket\.key\)\)/);
  assert.match(panel, /familyKeys\.map\(\(key\) => \[key, Math\.max\(\.\.\.baskets\.filter/);
  assert.match(panel, /familyKeys\.map\(\(key, index\) => <option/);
  assert.match(panel, /Tạo rổ mới · phiên bản 1/);
  assert.match(panel, /Rổ \{index \+ 1\} · tạo phiên bản \{versionByFamily\.get\(key\) \?\? 1\}/);
  assert.doesNotMatch(panel, /latestBasketVersion|expectedLatestVersion/);
});

test('Task042 OWNER flow guards doubles, waits for authoritative reload, and does not navigate or optimistically append', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'));
  assert.match(panel, /const inFlight = useRef\(false\)/); assert.match(panel, /if \(inFlight\.current\) return/);
  assert.match(panel, /inFlight\.current = true/); assert.match(panel, /await submitOwnerBasketAndReload/);
  assert.match(panel, /else onSaved\(\)/); assert.doesNotMatch(panel, /navigate|window\.location|history\.pushState/);
  assert.doesNotMatch(panel, /dispatch\(|setBaskets|\.push\(/);
});

test('Task042 App renders grouped historical versions and every frozen member without choosing one family as latest', async () => {
  const app = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'));
  assert.match(app, /new Set\(baskets\.map\(\(basket\) => basket\.key\)\)/);
  assert.match(app, /families\.map\(\(key, familyIndex\)/); assert.match(app, /basket\.version/);
  assert.match(app, /basket\.candidates\.map\(\(candidate\)/); assert.match(app, /candidate\.candidateVersion/);
  assert.match(app, /candidate\.summary/); assert.match(app, />EXPLORING</);
  assert.match(app, /Mỗi nhóm rổ có lịch sử phiên bản riêng/);
  assert.doesNotMatch(app, /latestBasketVersion\(/);
});

test('Task042 demo uses the same confirmation but never invokes OWNER basket API', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'));
  assert.match(panel, /setConfirm\(true\)/);
  assert.match(panel, /if \(mode === 'demo'\) \{ onDemoFreeze/);
  const demoBranch = panel.slice(panel.indexOf("if (mode === 'demo')"), panel.indexOf('if (!ownerToken) return'));
  assert.doesNotMatch(demoBranch, /submitOwnerBasket|owner-api|fetch/);
});


test('B7 loads exact frozen state and OWNER request is closed with strict receipt/reload verification', async()=>{
  const state=await loadRealWorkspaceState(fetchFrom(validResponses())); const member=state.baskets[0]!.candidates[0]!;
  assert.deepEqual([member.candidateVersion,member.b7State,member.b7DecisionId],[3,'PASS',ids.b7]);
  const input={workspaceId:ids.w1,basketId:ids.basket,candidateId:ids.c1,candidateVersion:3,decision:'HOLD' as const,token:'x'.repeat(31)+'1'};let body='';
  await submitOwnerB7Decision(input,(async(_url,init)=>{body=String(init?.body);return json({contractVersion:'1.0.0',decisionId:ids.d1,workspaceId:ids.w1,basketId:ids.basket,candidateId:ids.c1,candidateVersion:3,decision:'HOLD',decidedAt:at,exactRetry:false},201);}) as typeof fetch);
  assert.deepEqual(JSON.parse(body),{contractVersion:'1.0.0',candidateId:ids.c1,candidateVersion:3,decision:'HOLD'});
  for(const malformed of [{contractVersion:'1.0.0',decisionId:ids.d1,workspaceId:ids.w1,basketId:ids.basket,candidateId:ids.c1,candidateVersion:4,decision:'HOLD',decidedAt:at,exactRetry:false},{contractVersion:'1.0.0',decisionId:ids.d1,workspaceId:ids.w1,basketId:ids.basket,candidateId:ids.c1,candidateVersion:3,decision:'HOLD',decidedAt:at,exactRetry:false,extra:true}]) await assert.rejects(submitOwnerB7Decision(input,(async()=>json(malformed,201)) as typeof fetch),error=>error instanceof OwnerWriteError&&error.kind==='integrity');
  assert.equal(ownerB7Disabled({unlocked:true,pending:false,complete:true,effective:'NO_DECISION'}),false); assert.equal(ownerB7Disabled({unlocked:true,pending:false,complete:true,effective:'PASS'}),true);
  let reloads=0;const conflict=await submitOwnerB7AndReload(input,async()=>{reloads++;return state;},(async()=>json({error:{code:'conflict'}},409)) as typeof fetch);assert.equal(conflict.kind,'conflict');assert.equal(reloads,1);
});

test('B7 UI has three exact controls, compact immutable confirmation, no reason/product creation, and demo isolation',async()=>{const panel=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/B7DecisionPanel.tsx',import.meta.url),'utf8'));assert.match(panel,/Đạt/);assert.match(panel,/Tạm giữ/);assert.match(panel,/Loại/);assert.match(panel,/Xác nhận quyết định B7/);assert.match(panel,/phiên bản trong rổ này/);assert.doesNotMatch(panel,/<input|<textarea|reason|lý do/i);assert.match(panel,/mode==='demo'/);assert.doesNotMatch(panel,/Tạo.*sản phẩm/);});


test('Task044 product workspace request is closed, stable, strict and reload-verified',async()=>{
  const key=generatedProductWorkspaceKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');assert.equal(key,'product-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa');
  const input={workspaceId:ids.w1,basketId:ids.basket,candidateId:ids.c1,candidateVersion:3,decisionId:ids.b7,productWorkspaceKey:key,token:'x'.repeat(31)+'1'};let body='';
  const receipt={contractVersion:'1.0.0' as const,productWorkspaceId:ids.p1,productWorkspaceKey:key,workspaceId:ids.w1,basketId:ids.basket,candidateId:ids.c1,candidateVersion:3,b7DecisionId:ids.b7,state:'ACTIVE' as const,entryStep:'B8' as const,title:'Frozen candidate',createdAt:at,exactRetry:false};
  await submitOwnerProductWorkspace(input,(async(url,init)=>{assert.match(String(url),new RegExp(`${ids.b7}/product-workspace$`));body=String(init?.body);return json(receipt,201);}) as typeof fetch);
  assert.deepEqual(JSON.parse(body),{contractVersion:'1.0.0',productWorkspaceKey:key});
  await assert.rejects(submitOwnerProductWorkspace(input,(async()=>json({...receipt,actor:'forbidden'},201)) as typeof fetch),error=>error instanceof OwnerWriteError&&error.kind==='integrity');
  const member={candidateId:ids.c1,candidateKey:'candidate-one',candidateVersion:3,name:'Frozen candidate',summary:'Frozen summary',b7State:'PASS' as const,b7DecisionId:ids.b7,b7DecidedAt:at,productWorkspace:{id:ids.p1,key,title:'Frozen candidate',state:'ACTIVE' as const,entryStep:'B8' as const,createdAt:new Date(at).toLocaleString('vi-VN')}};
  const state={markets:[],candidates:[],baskets:[{id:ids.basket,marketId:ids.w1,key:'basket',version:1,frozenAt:at,candidates:[member]}],products:[{id:ids.p1,marketId:ids.w1,basketId:ids.basket,basketKey:'basket',basketVersion:1,candidateId:ids.c1,candidateVersion:3,name:'Frozen candidate',summary:'Frozen summary',states:{LEGAL:'NONE',SCIENTIFIC:'NONE',QUALITY:'NONE',FINANCE:'NONE'},versions:{LEGAL:0,SCIENTIFIC:0,QUALITY:0,FINANCE:0},decisionIds:{LEGAL:null,SCIENTIFIC:null,QUALITY:null,FINANCE:null},history:[],clearance:null,b9:{state:'NOT_STARTED',working:null,locked:null},b10:{history:[],effective:null,readyForB11:false}}],sequence:1};let reloads=0;
  const outcome=await submitOwnerProductWorkspaceAndReload(input,async()=>{reloads++;return state;},(async()=>json(receipt,201)) as typeof fetch);assert.equal(outcome.kind,'success');assert.equal(reloads,1);
  const conflict=await submitOwnerProductWorkspaceAndReload(input,async()=>{reloads++;return state;},(async()=>json({error:{code:'conflict'}},409)) as typeof fetch);assert.equal(conflict.kind,'conflict');assert.equal(reloads,2);
});

test('Task044 UI keeps product creation separate, explicit, hidden-key and demo isolated',async()=>{const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/ProductWorkspaceCreatePanel.tsx',import.meta.url),'utf8'));assert.match(source,/Tạo workspace sản phẩm riêng/);assert.match(source,/Tạo workspace sản phẩm/);assert.match(source,/exact B7 PASS/);assert.match(source,/chưa thực hiện bất kỳ quyết định B8 nào/);assert.match(source,/Đã tạo workspace sản phẩm/);assert.match(source,/Mở hồ sơ B8/);assert.match(source,/generatedProductWorkspaceKey/);assert.doesNotMatch(source,/<input|<textarea|reason|rationale|notes|funding/i);assert.match(source,/mode==='demo'/);assert.match(source,/inFlight\.current=true;try\{onDemoCreate/);assert.match(source,/const value=snapshot\?\?/);assert.match(source,/workspaceId,basketId:basket\.id,candidateId:member\.candidateId,candidateVersion:member\.candidateVersion,decisionId:member\.b7DecisionId/);assert.doesNotMatch(source,/onOpen\([^)]*productWorkspaceId[^)]*\).*submitOwnerProductWorkspace/s);});


test('Task045 health availability uses relative /healthz and accepts only the closed contract', async () => {
  let observedUrl = ''; let observedInit: RequestInit | undefined;
  const available = await loadFrontendAvailability((async (url, init) => { observedUrl = String(url); observedInit = init; return json({ status: 'ok', version: '0.1.0', ownerWritesEnabled: true }); }) as typeof fetch);
  assert.equal(observedUrl, '/healthz');
  assert.deepEqual(observedInit, { headers: { Accept: 'application/json' } });
  assert.deepEqual(available, { status: 'ok', version: '0.1.0', ownerWritesEnabled: true });
  assert.equal((await loadFrontendAvailability((async () => json({ status: 'ok', version: '0.1.0', ownerWritesEnabled: false })) as typeof fetch)).ownerWritesEnabled, false);
  for (const malformed of [
    { status: 'down', version: '0.1.0', ownerWritesEnabled: true },
    { status: 'ok', version: '', ownerWritesEnabled: true },
    { status: 'ok', version: '0.1.0', ownerWritesEnabled: 'true' },
    { status: 'ok', version: '0.1.0', ownerWritesEnabled: true, extra: true },
  ]) await assert.rejects(loadFrontendAvailability((async () => json(malformed)) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
});

test('Task045 unavailable or unreachable health fails OWNER closed without coupling truthful reads or demo mode', async () => {
  await assert.rejects(loadFrontendAvailability((async () => { throw new Error('offline'); }) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'connection');
  await assert.rejects(loadFrontendAvailability((async () => json({ error: 'offline' }, 503)) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'connection');
  const state = await loadRealWorkspaceState((async () => json({ contractVersion: '1.0.0', workspaces: [] })) as typeof fetch);
  assert.deepEqual(state.markets, []);
  assert.equal(frontendMode('?mode=demo'), 'demo');
});

test('Task045 boot UI gates the memory-only unlock form on health and production requests contain no dev origin', async () => {
  const [app, dataSource] = await Promise.all([
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')),
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/data-source.ts', import.meta.url), 'utf8')),
  ]);
  assert.match(app, /loadFrontendAvailability\(\)/);
  assert.match(app, /ownerAvailability !== 'available' \? null/);
  assert.match(app, /Ghi OWNER hiện không khả dụng/);
  assert.match(app, /setOwnerToken\(null\); setTokenDraft\(''\)/);
  assert.doesNotMatch(`${app}\n${dataSource}`, /https?:\/\/[^'"`\s]+|(?:localhost|127\.0\.0\.1):\d+/);
  for (const path of ['/healthz', '/api/', '/owner-api/']) assert.equal(dataSource.includes(path), true);
});


test('Task046 route panels, truthful copy, HOLD reconsideration and dialog accessibility are explicit', async () => {
  const fs = await import('node:fs/promises');
  const [app, b7, b9, b10, basket, dialog] = await Promise.all([
    fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/B7DecisionPanel.tsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/B9Editor.tsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/B10DecisionPanel.tsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/ConfirmDialog.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /section === 'b8' && <aside/); assert.match(app, /section === 'b9' && <aside/); assert.match(app, /section === 'b10' && <aside/);
  assert.match(b9, /Chưa có bản nháp/); assert.match(b9, /Bản nháp đã lưu · Chưa khóa/); assert.match(b9, /Có thay đổi chưa lưu/); assert.match(b9, /STP chính thức đã khóa/); assert.match(b9, /Lưu bản nháp không khóa STP/);
  assert.match(b10, /Chưa thể quyết định B10 vì STP chưa khóa/); assert.match(b10, /Đã duyệt · Đủ điều kiện B11/); assert.match(b10, /B11 chưa được triển khai/);
  assert.match(b7, /Xem xét lại/); assert.match(b7, /member\.productWorkspace/); assert.doesNotMatch(b7, /ID …/);
  assert.match(app, /onReconsider=.*setBasketDraft\(\{familyKey,candidateIds:\[candidateId\]\}\)/); assert.match(basket, /initialFamilyKey/); assert.match(basket, /initialCandidateIds/);
  assert.match(dialog, /role="dialog"/); assert.match(dialog, /aria-modal="true"/); assert.match(dialog, /aria-labelledby=\{titleId\}/); assert.match(dialog, /aria-describedby=\{descriptionId\}/);
});


test('Task046 correction keeps locked OWNER editable but disables confirmation entry with truthful copy', async () => {
  const panel = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'));
  assert.match(panel, /ownerBasketDisabled\(\{ unlocked: ownerToken !== null, pending, selectedCount: selected\.length \}\)/);
  assert.match(panel, /type="checkbox" checked=\{selected\.includes\(candidate\.id\)\} disabled=\{pending\}/);
  assert.match(panel, /OWNER đang khóa\. Bạn vẫn có thể xem và sửa lựa chọn, nhưng phải mở khóa OWNER trước khi mở bước xác nhận và đóng băng rổ\./);
  assert.match(panel, /selected\.length === 0 \|\| \(mode === 'real' && !ownerToken\)/);
});

test('Task046 basket confirmation is component-wired and browser acceptance proves trapped/restored focus without writes', async () => {
  const fs = await import('node:fs/promises');
  const [panel, acceptance] = await Promise.all([
    fs.readFile(new URL('../src/CandidateBasketPanel.tsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../scripts/task046-browser-acceptance.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(panel, /import ConfirmDialog from '\.\/ConfirmDialog'/);
  assert.match(panel, /confirm && requestSnapshot && <ConfirmDialog/);
  assert.doesNotMatch(panel, /<div className="confirm-backdrop"/);
  assert.match(panel, /onCancel=\{\(\) => setConfirm\(false\)\}/);
  assert.match(panel, /onConfirm=\{\(\) => void freeze\(\)\}/);
  assert.match(panel, /OWNER đang khóa\. Bạn vẫn có thể xem và sửa lựa chọn, nhưng phải mở khóa OWNER trước khi mở bước xác nhận và đóng băng rổ\./);
  assert.match(panel, /selected\.length === 0 \|\| \(mode === 'real' && !ownerToken\)/);
  const openPath = panel.slice(panel.indexOf('const submit ='), panel.indexOf('const freeze ='));
  assert.match(openPath, /setRequestSnapshot\(snapshot\)/);
  assert.match(openPath, /setConfirm\(true\)/);
  assert.doesNotMatch(openPath, /submitOwnerBasketAndReload|onDemoFreeze/);

  assert.match(acceptance, /\?mode=demo#\/markets\/calcium/);
  assert.match(acceptance, /\['POST', 'PUT', 'PATCH', 'DELETE'\]\.includes\(request\.method\(\)\)/);
  for (const exactName of ['Đóng băng rổ ứng viên', 'Đóng băng rổ cơ hội', 'Xác nhận đóng băng rổ cơ hội']) assert.equal(acceptance.includes(`name: '${exactName}', exact: true`), true);
  assert.match(acceptance, /getByRole\('checkbox'\)\.first\(\)\.check\(\)/);
  assert.match(acceptance, /node\.contains\(document\.activeElement\)/);
  assert.match(acceptance, /keyboard\.press\('Tab'\)/);
  assert.match(acceptance, /keyboard\.press\('Shift\+Tab'\)/);
  assert.match(acceptance, /keyboard\.press\('Escape'\)/);
  assert.match(acceptance, /writeRequests\.length !== 0/);
  assert.match(acceptance, /submitOpenerHandle\.evaluate\(\(node\) => node === document\.activeElement\)/);
});

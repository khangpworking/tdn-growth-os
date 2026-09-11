import assert from 'node:assert/strict';
import test from 'node:test';
import { clearanceMatchesCurrent, exactCurrentPassDecisionIds, frontendMode, loadRealWorkspaceState, ownerClearanceDisabled, ownerDecisionDisabled, OwnerWriteError, submitOwnerB8Clearance, submitOwnerB8Decision, submitOwnerClearanceAndReload, submitOwnerDecisionAndReload, WorkspaceDataSourceError } from '../src/data-source';

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
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).product.sourceCandidateVersion = 2; },
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
  responses.set(`/api/product-workspaces/${ids.p1}/b9`, { contractVersion: '1.0.0', productWorkspaceId: ids.p1, state: 'LOCKED', working: { workingStpId: ids.basket, workingDigest: 'a'.repeat(64), b8ClearanceId: ids.b7, content: { segments: [{ key: 'adult', label: 'Người lớn' }, { key: 'senior', label: 'Người cao tuổi' }], primaryTargetSegmentKey: 'adult', secondaryTargetSegmentKeys: ['senior'], positioningStatement: 'Định vị đã khóa.' }, createdAt: at, updatedAt: at }, locked: { lockId: ids.d1, state: 'LOCKED_STP', lockedAt: at } });
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
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'));
  assert.match(source, /role="dialog"/); assert.match(source, /Đóng băng bốn quyết định PASS hiện tại/); assert.match(source, /Xem B9/);
});

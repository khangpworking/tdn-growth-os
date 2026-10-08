import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { AutomationMetricMethodBridge } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { readMetricSalesNameEvidence } from '../../src/modules/analysis/research-automation/metric-sales-name-evidence.js';
import type { AutomationConfirmedSourceSet } from '../../contracts/analysis/automation-confirmed-source-set.generated.js';
import type { MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { draftKeywordLists } from '../../src/modules/analysis/keyword-list-drafting.js';
import { retainKeywordListDraft, replayKeywordListDraft, retainSourceKeywordListDraft, replaySourceKeywordListDraft, type KeywordListDraftRecord, type KeywordListDraftRecordV3, type MetricKeywordDraftEvidenceContext } from '../../src/modules/analysis/keyword-list-draft-record.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-09T00:00:00.000Z');
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const title = '  Thạch dừa  nguyên văn – An Nhiên 350g  ';
async function fixture(t: TestContext, cells: Record<string, unknown> = {}, profile = 'v2') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-sales-names-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-sales-names', title: 'Synthetic Metric sales names' });
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: workspaces,
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'CATEGORY', keyword: 'thạch dừa', reports: ['MARKET'], requestedPeriod: { startDate: '2026-08-17', endDate: '2026-09-15' } });
  await service.processNext();
  const scope = { definition: 'Synthetic retained Metric names', includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'],
    selectedProductIds: [], peerProductIds: [] };
  const raw = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    input: JSON.stringify({ profile, cells: { A2: { type: 's', value: title }, ...(profile === 'v2' ? { A3: { type: 's', value: 'Thạch dứa riêng biệt' } } : {}), ...cells } }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(raw.status, 0, raw.stderr.toString());
  const prepared = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1',
    requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision, scope,
    sourceLabel: 'Synthetic exact export', acquiredAt: null, measurementPeriod: { startDate: '2026-08-17', endDate: '2026-09-15', basis: 'Synthetic period' },
    precision: { revenue: 'unknown', units: 'unknown' }, selection: 'UNSPECIFIED', sourceContext: 'Synthetic workbook; provider unverified' }, raw.stdout);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, ...scope,
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  const row = db.prepare('SELECT start_request_sha256 startSha,scope_request_sha256 scopeSha,confirmed_source_set_sha256 sourceSha,scope_confirmed_at confirmedAt FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { startSha: string; scopeSha: string; sourceSha: string; confirmedAt: string };
  const sources = JSON.parse((await artifacts.read(row.sourceSha)).toString()) as AutomationConfirmedSourceSet;
  const input: MetricRunInput = { runId, start: JSON.parse((await artifacts.read(row.startSha)).toString()),
    scope: JSON.parse((await artifacts.read(row.scopeSha)).toString()), scopeConfirmedAt: row.confirmedAt };
  const options = { artifacts, reader: new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts })),
    authority: new AutomationMetricMethodBridge({ db, artifactStore: artifacts, workspaces, now }) };
  return { root, db, artifacts, service, sources, input, sourceSetDigest: row.sourceSha, options };
}

async function retainedFixture(t: TestContext) {
  const f = await fixture(t, { A3: { type: 's', value: title } });
  const metric = await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest);
  assert.ok(metric);
  const prompt = 'Synthetic retained exact Metric names: ' + canonicalJson(metric.names.map(row => row.name));
  const record: KeywordListDraftRecordV3 = {
    contractVersion: 'l9-keyword-list-draft-record-v3', run: { workspaceId, runId }, scopeDigest: digest(f.input.scope), sourceSetDigest: f.sourceSetDigest,
    salesNameRefs: metric.names.map(cell => ({ kind: 'metric-workbook-title-cell-v1', sourcePackage: metric.sourcePackage,
      workbook: metric.workbook, row: cell.row, locator: cell.locator })) as KeywordListDraftRecordV3['salesNameRefs'],
    seeds: { productNames: metric.names.map(cell => cell.name) as [string, ...string[]], includeTerms: [...f.input.scope.includeTerms], excludeTerms: [...f.input.scope.excludeTerms] },
    dataVersion: 'synthetic-metric-keyword-v3', category: 'thạch dừa',
    model: { identity: 'synthetic-model', promptVersion: 'synthetic-v1', prompt, promptSha256: createHash('sha256').update(prompt).digest('hex'), configuration: null },
    output: { contractVersion: 'l9-keyword-data-v1', dataVersion: 'synthetic-metric-keyword-v3', category: 'thạch dừa', provenance: 'MODEL_DRAFTED',
      keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic separate term' }] },
  };
  const context: MetricKeywordDraftEvidenceContext = { options: f.options, input: f.input, sources: f.sources, sourceSetDigest: f.sourceSetDigest };
  return { ...f, record, context, metric };
}

test('admitted actual prepared Metric package yields exact current-profile Sheet1 title cells, never display normalization', async t => {
  const f = await fixture(t);
  const before = f.db.prepare('SELECT total_changes() n').get();
  const result = await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest);
  assert.ok(result);
  assert.deepEqual(result.names, [{ name: title, row: 2, locator: 'Sheet1!A2' }, { name: 'Thạch dứa riêng biệt', row: 3, locator: 'Sheet1!A3' }]);
  assert.deepEqual(result.sourcePackage, f.sources.metric.decision === 'ADMITTED' ? f.sources.metric.sourcePackage : null);
  assert.equal(result.workbook.logicalPath, 'metric/export.xlsx');
  assert.deepEqual(await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest), result);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
});

test('Metric names reject wrong run/scope/source-set/package/digest or damaged workbook before exposing cells', async t => {
  const f = await fixture(t);
  for (const field of ['runId', 'workspaceId', 'scopeSha256', 'startSha256', 'confirmedAt'] as const) {
    const wrong = structuredClone(f.sources);
    wrong[field] = field.endsWith('Id') ? randomUUID() : field === 'confirmedAt' ? '2026-10-10T00:00:00.000Z' : 'f'.repeat(64);
    const stored = await f.artifacts.put(Buffer.from(canonicalJson(wrong)));
    await assert.rejects(readMetricSalesNameEvidence(f.options, f.input, wrong, stored.sha256));
  }
  assert.equal(await readMetricSalesNameEvidence(f.options, f.input, { ...f.sources, metric: { decision: 'ABSENT' } }, f.sourceSetDigest), null);
  assert.equal(await readMetricSalesNameEvidence(f.options, f.input, { ...f.sources, metric: { decision: 'SKIPPED' } }, f.sourceSetDigest), null);
  const wrong = structuredClone(f.sources);
  assert.equal(wrong.metric.decision, 'ADMITTED');
  if (wrong.metric.decision !== 'ADMITTED') throw new Error('fixture');
  wrong.metric.sourcePackage.packageId = randomUUID();
  const stored = await f.artifacts.put(Buffer.from(canonicalJson(wrong)));
  await assert.rejects(readMetricSalesNameEvidence(f.options, f.input, wrong, stored.sha256));
  for (const field of ['manifestArtifactSha256', 'packageContentSha256'] as const) {
    const wrongIdentity = structuredClone(f.sources);
    if (wrongIdentity.metric.decision !== 'ADMITTED') throw new Error('fixture');
    wrongIdentity.metric.sourcePackage[field] = 'f'.repeat(64);
    const retained = await f.artifacts.put(Buffer.from(canonicalJson(wrongIdentity)));
    await assert.rejects(readMetricSalesNameEvidence(f.options, f.input, wrongIdentity, retained.sha256));
  }
  const result = await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest);
  assert.ok(result);
  const file = f.artifacts.pathForDigest(result.workbook.sha256), bytes = await fs.readFile(file);
  await fs.writeFile(file, 'corrupt synthetic workbook');
  try { await assert.rejects(readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest)); }
  finally { await fs.writeFile(file, bytes); }
  assert.equal(digest(f.sources), f.sourceSetDigest);
});

test('actual prepare rejects changed current-profile headers before confirmation or title admission', async t => {
  await assert.rejects(fixture(t, { A1: { type: 's', value: 'Invented product title header' } }));
});

test('legitimate equal title strings retain both original cells and identities', async t => {
  const f = await fixture(t, { A3: { type: 's', value: title } });
  const result = await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest);
  assert.ok(result);
  assert.deepEqual(result.names, [{ name: title, row: 2, locator: 'Sheet1!A2' }, { name: title, row: 3, locator: 'Sheet1!A3' }]);
});

test('combined current-header workbook uses only the existing normalizer selected-platform rows', async t => {
  const f = await fixture(t, {}, 'v3');
  const evidence = await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest);
  assert.ok(evidence);
  assert.deepEqual(evidence.names, [{ name: title, row: 2, locator: 'Sheet1!A2' }, { name: 'Synthetic B', row: 4, locator: 'Sheet1!A4' }]);
});

test('exact long title cells remain untruncated and the existing keyword seed budget rejects before a model call', async t => {
  const longTitle = 'Thạch dừa '.repeat(51);
  const f = await fixture(t, { A2: { type: 's', value: longTitle } });
  const evidence = await readMetricSalesNameEvidence(f.options, f.input, f.sources, f.sourceSetDigest);
  assert.ok(evidence);
  assert.equal(evidence.names[0]!.name, longTitle);
  let calls = 0;
  await assert.rejects(draftKeywordLists({ draftLists: async () => { calls++; return { keywords: ['thạch dừa'], exclusions: [] }; } }, {
    contractVersion: 'l9-keyword-list-draft-v1', category: 'thạch dừa', dataVersion: 'synthetic-long-title',
    seeds: { productNames: evidence.names.map(row => row.name) as [string, ...string[]], includeTerms: ['thạch dừa'], excludeTerms: [] },
  }), /canonical schema/);
  assert.equal(calls, 0);
});

test('absent/skipped Metric and mismatched source-set digest perform no package discovery or inspection', async t => {
  const f = await fixture(t);
  let calls = 0;
  const rejectCall = async (): Promise<never> => { calls++; throw new Error('unexpected package authority call'); };
  const options = { artifacts: f.artifacts, reader: { readFinalizedSourcePackage: rejectCall },
    authority: { verifySelection: rejectCall, inspectPrepared: rejectCall } };
  for (const decision of ['ABSENT', 'SKIPPED'] as const) {
    assert.equal(await readMetricSalesNameEvidence(options, f.input, { ...f.sources, metric: { decision } }, f.sourceSetDigest), null);
  }
  await assert.rejects(readMetricSalesNameEvidence(options, f.input, f.sources, 'f'.repeat(64)), /confirmed workbook source/);
  assert.equal(calls, 0);
});

test('v3 retains exact confirmed package/workbook/cell identity and replays without runtime model configuration', async t => {
  const f = await retainedFixture(t);
  const before = f.db.prepare('SELECT total_changes() n').get();
  const receipt = await retainSourceKeywordListDraft(f.artifacts, f.record, f.context);
  assert.equal(receipt.digest, digest(f.record));
  assert.equal((await f.artifacts.read(receipt.digest)).toString(), canonicalJson(f.record));
  assert.deepEqual(await replaySourceKeywordListDraft(f.artifacts, receipt.digest, f.context), f.record);
  assert.equal((await retainSourceKeywordListDraft(f.artifacts, f.record, f.context)).digest, receipt.digest);
  await assert.rejects(replaySourceKeywordListDraft(f.artifacts, receipt.digest), /owning-service frozen source context/);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
});

test('v3 rejects wrong frozen identity, package/workbook/hash/row/locator or literal seed before retention', async t => {
  const f = await retainedFixture(t);
  const mutate: Array<(record: KeywordListDraftRecordV3) => void> = [
    r => { r.run.workspaceId = randomUUID(); }, r => { r.run.runId = randomUUID(); },
    r => { r.scopeDigest = 'f'.repeat(64); }, r => { r.sourceSetDigest = 'f'.repeat(64); },
    r => { r.seeds.productNames[0] = title.trim(); },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].sourcePackage.packageId = randomUUID(); },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].sourcePackage.manifestArtifactSha256 = 'f'.repeat(64); },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].sourcePackage.packageContentSha256 = 'f'.repeat(64); },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].workbook.sha256 = 'f'.repeat(64); },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].workbook.logicalPath = 'other/workbook.xlsx'; },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].workbook.byteSize++; },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].row = 3; },
    r => { if ('kind' in r.salesNameRefs[0]) r.salesNameRefs[0].locator = 'Sheet1!A3'; },
    r => { r.salesNameRefs[1] = structuredClone(r.salesNameRefs[0]); },
  ];
  for (const change of mutate) {
    const wrong = structuredClone(f.record); change(wrong);
    await assert.rejects(retainSourceKeywordListDraft(f.artifacts, wrong, f.context));
  }
  await assert.rejects(retainSourceKeywordListDraft(f.artifacts, f.record, { ...f.context,
    sources: { ...f.sources, metric: { decision: 'SKIPPED' } } }), /not admitted/);
});

test('v3 replay reauthenticates original workbook bytes even when retained record digest is valid', async t => {
  const f = await retainedFixture(t);
  const receipt = await retainSourceKeywordListDraft(f.artifacts, f.record, f.context);
  const file = f.artifacts.pathForDigest(f.metric.workbook.sha256), original = await fs.readFile(file);
  await fs.writeFile(file, 'damaged synthetic retained workbook');
  try { await assert.rejects(replaySourceKeywordListDraft(f.artifacts, receipt.digest, f.context)); }
  finally { await fs.writeFile(file, original); }
  assert.deepEqual(await replaySourceKeywordListDraft(f.artifacts, receipt.digest, f.context), f.record);
});

test('new versioned dispatch retains and replays historical v2 bytes identically without Metric context', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-legacy-dispatch-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const scope = { workspaceId, runId, includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'], selectedProductIds: ['kalodata:12345'], peerProductIds: [] };
  const scopeDigest = (await store.put(Buffer.from(JSON.stringify(scope)))).sha256;
  const raw = Buffer.from(JSON.stringify({ data: [{ product_id: '12345', product_name: title }] }));
  const source = await store.put(raw);
  const capture = await store.put(Buffer.from(JSON.stringify({ contractVersion: 'research-automation-capture-v1', provider: 'KALODATA', operation: 'kalodata.product.rank',
    outcome: 'OK', responseBytesBase64: raw.toString('base64'), responseSha256: source.sha256, responseByteLength: raw.length })));
  const record: KeywordListDraftRecord = { contractVersion: 'l9-keyword-list-draft-record-v2', run: { workspaceId, runId }, scopeDigest, sourceSetDigest: null,
    salesNameRefs: [{ digest: source.sha256, locator: '/data/0/product_name', captureDigest: capture.sha256 }],
    seeds: { productNames: [title], includeTerms: scope.includeTerms, excludeTerms: scope.excludeTerms }, category: 'thạch dừa', dataVersion: 'synthetic-legacy-v2',
    model: { configuration: null, identity: 'synthetic-legacy-model', promptVersion: 'synthetic-v1', prompt: 'Legacy retained prompt',
      promptSha256: createHash('sha256').update('Legacy retained prompt').digest('hex') },
    output: { contractVersion: 'l9-keyword-data-v1', category: 'thạch dừa', dataVersion: 'synthetic-legacy-v2', provenance: 'MODEL_DRAFTED',
      keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic separate term' }] } };
  const oldReceipt = await retainKeywordListDraft(store, record);
  assert.deepEqual(await retainSourceKeywordListDraft(store, record), oldReceipt);
  assert.equal(oldReceipt.digest, digest(record));
  assert.deepEqual(await replaySourceKeywordListDraft(store, oldReceipt.digest), await replayKeywordListDraft(store, oldReceipt.digest));
  assert.equal((await store.read(oldReceipt.digest)).toString(), canonicalJson(record));
});

test('OWNER HTTP workbook upload and explicit package confirmation supply authenticated exact Metric cells', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-names-owner-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-names-owner', title: 'Synthetic OWNER Metric upload' });
  const server = http.createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = 'synthetic-owner-token-0-not-a-live-credential';
  let app: ReturnType<typeof openResearchAutomationApi> | undefined;
  t.after(async () => {
    try { await app?.close(); }
    finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      db.close(); await fs.rm(root, { recursive: true, force: true });
    }
  });
  app = openResearchAutomationApi({ databasePath, artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { databasePath, artifactRoot, writeEnabled: true, token, actorId: 'synthetic-owner', allowedOrigin: origin } });
  server.on('request', app.handler);
  const ownerRoot = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs`;
  const headers = { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const started = await fetch(ownerRoot, { method: 'POST', headers, body: JSON.stringify({
    contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'thạch dừa',
    reports: ['MARKET'], requestedPeriod: { startDate: '2026-08-17', endDate: '2026-09-15' } }) });
  assert.equal(started.status, 202, await started.clone().text());
  const startedBody = await started.json() as { run: { runId: string } };
  const id = startedBody.run.runId;
  const readRun = async () => {
    const response = await fetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${id}`);
    assert.equal(response.status, 200);
    return response.json() as Promise<{ status: string; revision: number }>;
  };
  let awaiting = await readRun();
  for (let n = 0; awaiting.status !== 'AWAITING_SCOPE' && n < 100; n++) {
    assert.ok(['QUICK_SEARCH_QUEUED', 'QUICK_SEARCH_RUNNING'].includes(awaiting.status), awaiting.status);
    await new Promise(resolve => setTimeout(resolve, 50)); awaiting = await readRun();
  }
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  const scope = { definition: 'Synthetic exact OWNER names', includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'], selectedProductIds: [], peerProductIds: [] };
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    input: JSON.stringify({ profile: 'v2', cells: { A2: { type: 's', value: title } } }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const form = new FormData();
  form.set('metadata', JSON.stringify({ contractVersion: 'automation-metric-prepare-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    scope, sourceLabel: 'Synthetic owner attached export', acquiredAt: null, measurementPeriod: { startDate: '2026-08-17', endDate: '2026-09-15', basis: 'Synthetic period' },
    precision: { revenue: 'unknown', units: 'unknown' }, selection: 'UNSPECIFIED', sourceContext: 'Synthetic workbook, not provider verified' }));
  form.set('workbook', new File([new Uint8Array(generated.stdout)], 'synthetic.xlsx'));
  const uploadUrl = `${ownerRoot}/${id}/sources/metric`;
  const rejected = await fetch(uploadUrl, { method: 'POST', headers: { Origin: origin }, body: form });
  assert.equal(rejected.status, 401);
  const upload = await fetch(uploadUrl, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}` }, body: form });
  assert.equal(upload.status, 201, await upload.clone().text());
  const prepared = await upload.json() as { packageId: string };
  const confirm = await fetch(`${ownerRoot}/${id}/confirm-scope`, { method: 'POST', headers, body: JSON.stringify({
    contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(), expectedRevision: (await readRun()).revision, ...scope,
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } }) });
  assert.equal(confirm.status, 202, await confirm.clone().text());
  const row = db.prepare('SELECT start_request_sha256 startSha,scope_request_sha256 scopeSha,confirmed_source_set_sha256 sourceSha,scope_confirmed_at confirmedAt FROM analysis_research_automation_runs WHERE run_id=?').get(id) as { startSha: string; scopeSha: string; sourceSha: string; confirmedAt: string };
  const sources = JSON.parse((await artifacts.read(row.sourceSha)).toString()) as AutomationConfirmedSourceSet;
  const input: MetricRunInput = { runId: id, start: JSON.parse((await artifacts.read(row.startSha)).toString()),
    scope: JSON.parse((await artifacts.read(row.scopeSha)).toString()), scopeConfirmedAt: row.confirmedAt };
  const options = { artifacts, reader: new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts })),
    authority: new AutomationMetricMethodBridge({ db, artifactStore: artifacts, workspaces: new FlowDiscoveryWorkspaceReader(discovery), now }) };
  const evidence = await readMetricSalesNameEvidence(options, input, sources, row.sourceSha);
  assert.ok(evidence);
  assert.equal(evidence.sourcePackage.packageId, prepared.packageId);
  assert.deepEqual(evidence.names[0], { name: title, row: 2, locator: 'Sheet1!A2' });
});

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
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

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-09T00:00:00.000Z');
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const title = '  Thạch dừa  nguyên văn – An Nhiên 350g  ';
async function fixture(t: TestContext, cells: Record<string, unknown> = {}) {
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
    input: JSON.stringify({ profile: 'v2', cells: { A2: { type: 's', value: title }, A3: { type: 's', value: 'Thạch dứa riêng biệt' }, ...cells } }), maxBuffer: 4 * 1024 * 1024 });
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

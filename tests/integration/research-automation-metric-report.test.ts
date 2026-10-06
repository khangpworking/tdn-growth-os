import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { METRIC_METHOD_FAILURE_CODES, type MetricRunInput, type AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-03T01:00:00.000Z');
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));

async function fixture(t: TestContext, invalidBinding = false) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-report-'));
  const db = openDatabase({ databasePath: path.join(directory, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-report', title: 'Synthetic Metric report' });
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const inputs = new Map<'MARKET' | 'INSIGHT', Parameters<typeof buildResearchAutomationReport>[0]>();
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: workspaces, now, uuid: () => runId,
    renderer: (input, kind) => {
      inputs.set(kind, input);
      const rendered = buildResearchAutomationReport(input, kind);
      const { metricMethods: _presentationOmitted, ...semantic } = rendered.semantic as Record<string, unknown>;
      return { ...rendered, semantic };
    } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'synthetic', requestedPeriod: { startDate: '2026-08-17', endDate: '2026-09-16' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic export subset', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
  await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'RENDERING');
  const row = db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope,scope_confirmed_at confirmed FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { start: string; scope: string; confirmed: string };
  const input: MetricRunInput = { runId, start: JSON.parse((await artifacts.read(row.start)).toString()),
    scope: JSON.parse((await artifacts.read(row.scope)).toString()), scopeConfirmedAt: row.confirmed };
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2' }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const workbook = generated.stdout;
  const manifest = json({ contractVersion: '1.0.0', profileId: 'metric-shopee-product-list-sheet1-v2', profileVersion: '2.0.0',
    source: { sha256: sha(workbook), label: 'Synthetic export', provenanceBasis: 'Synthetic fixture, not collected', evidenceFamily: 'synthetic-metric',
      sheetName: 'Sheet1', headerSha256: 'b5b493190917fac69bd1e2cf1aa618aae175a7fd314ec635e44bcf29aab6f7ac', lastRow: 3 },
    scope: { key: 'synthetic-subset', platform: 'shopee', selection: 'UNSPECIFIED', start: '2026-08-17', end: '2026-09-15',
      periodBasis: 'Synthetic export measurement period', acquiredAt: null }, precision: { revenue: 'unknown', units: 'unknown' },
    labelCodebookVersion: 'unassigned-v1', wideUnknownPolicy: 'exclude' });
  const descriptor = json({ contractVersion: 'automation-metric-source-v1', runId, workspaceId,
    runBindingSha256: invalidBinding ? 'f'.repeat(64) : sha(json(input)), keyword: 'synthetic', workbookPath: 'metric/workbook.xlsx',
    manifestPath: 'metric/manifest.json', labelsPath: null, sourceContextPath: 'metric/context.json' });
  const documents = [
    { path: 'metric/workbook.xlsx', bytes: workbook, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', representationRole: 'structured' as const },
    { path: 'metric/manifest.json', bytes: manifest, mediaType: 'application/json', representationRole: 'derived' as const },
    { path: 'metric/context.json', bytes: json({ synthetic: true, coverage: 'bounded export only' }), mediaType: 'application/json', representationRole: 'derived' as const },
    { path: 'normalized/automation-metric-source.json', bytes: descriptor, mediaType: 'application/json', representationRole: 'derived' as const },
  ];
  await new SourcePackageService({ db, artifactStore: artifacts, now }).intake({ contractVersion: '1.0.0',
    packageKey: `automation-metric-source:${runId}`, version: 1, sourceLabel: 'Synthetic run-attached original Metric sources', sourceAcquiredAt: null,
    files: documents.map(file => ({ path: file.path, sha256: sha(file.bytes), byteSize: file.bytes.length, mediaType: file.mediaType,
      representationRole: file.representationRole, evidenceFamily: 'synthetic-metric', independence: 'non_independent',
      providerProvenance: 'operator_supplied_unverified', provenanceBasis: 'Synthetic fixture modeling operator attachment; no provider collection' })) }, new Map(documents.map(file => [file.path, file.bytes])));
  await service.processNext();
  const ready = await service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await artifacts.read(ready.outputs.market.versionId)).toString()) as Record<string, unknown>;
  const insightSemantic = JSON.parse((await artifacts.read(ready.outputs.insight.versionId)).toString()) as Record<string, unknown>;
  return { db, artifacts, service, workspaces, semantic, insightSemantic, marketInput: inputs.get('MARKET')! };
}

// Primary owner is the REPORTS lifecycle: the bridge's tests cannot detect an
// omitted service connection, wrong report-kind placement or presentation drift.
test('REPORTS computes attached raw Metric rows, retains the full method independently of the renderer and serves frozen reports without Python', async t => {
  const f = await fixture(t);
  const snapshot = f.semantic.metricMethods as AutomationMetricMethodSnapshot;
  assert.ok(snapshot);
  assert.equal(snapshot.result.scopes[0]!.revenue.value, '150');
  assert.equal(snapshot.result.scopes[0]!.units.value, '2');
  assert.equal(snapshot.result.scopes[0]!.concentration[0]!.share!.percent, '66.67');
  assert.equal(snapshot.result.scopes[1]!.status, 'BLOCKED_LABELS');
  assert.equal(snapshot.result.scopes[2]!.status, 'BLOCKED_LABELS');
  assert.equal((f.semantic.completion as { completedAnalyticalSections: number }).completedAnalyticalSections, 0);
  assert.equal(f.insightSemantic.metricMethods, undefined);
  assert.equal(f.insightSemantic.metricMethodsFailure, undefined);
  const original = await f.service.readReport(workspaceId, runId, 'MARKET');
  const doc = new JSDOM(original.bytes.toString()).window.document;
  assert.match(doc.getElementById('M03')!.textContent!, /150 VND/);
  assert.match(doc.getElementById('M03')!.textContent!, /2026-08-17 đến 2026-09-15/);
  assert.match(doc.getElementById('M03')!.textContent!, /WIDE và CORE chưa được tính/);
  assert.match(doc.getElementById('M04')!.textContent!, /66\.67%/);
  assert.equal(doc.getElementById('M04')!.querySelectorAll('svg').length, 1);
  assert.equal(doc.querySelectorAll('script').length, 0);
  const reading = doc.querySelector('#M03 .reader-summary')!.textContent!;
  assert.match(reading, /150 VND/);
  assert.match(reading, /tổng của mẫu xuất, không phải ước tính quy mô toàn thị trường/);
  const context = doc.querySelector('#M03 .reader-context')!.textContent!;
  assert.doesNotMatch(context, /Synthetic export measurement period/);
  const evidence = [...doc.querySelectorAll('#M03 details.evidence-trace')].at(-1)!.textContent!;
  assert.ok(evidence.includes(snapshot.result.input.scope.periodBasis), 'original period basis remains in evidence');
  assert.ok(evidence.includes(snapshot.result.methodVersion) && evidence.includes(snapshot.result.rounding));
  assert.match(doc.querySelector('#M04 .reader-summary')!.textContent!, /66\.67%/);
  const scopeText = doc.getElementById('M02')!.textContent!;
  assert.match(scopeText, /2026-08-17 đến 2026-09-16/); // Requested period is longer.
  assert.match(scopeText, /2026-08-17 đến 2026-09-15/); // Retained source declaration.
  assert.match(scopeText, /Thời điểm lấy nguồnChưa xác nhận/);
  assert.match(scopeText, /ALL: CALCULATED; WIDE: BLOCKED_LABELS; CORE: BLOCKED_LABELS/);
  assert.match(scopeText, /Quy tắc phân loại Metric không tự áp dụng cho Kalodata/);
  assert.ok(doc.getElementById('M13')!.textContent!.includes(snapshot.originalSourcePackage.packageContentSha256));
  assert.ok(doc.getElementById('M13')!.textContent!.includes(snapshot.preparation.selectedSources.workbook.sha256));
  assert.ok(doc.getElementById('M04')!.querySelector('svg title'));
  const changes = (f.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  const priorPath = process.env.PATH;
  f.db.pragma('query_only=ON');
  try {
    process.env.PATH = '/no-python-for-historical-read';
    const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaces,
      now: () => { throw new Error('historical report read must not use the clock'); } });
    assert.deepEqual((await reader.readReport(workspaceId, runId, 'MARKET')).bytes, original.bytes);
    await reader.readReport(workspaceId, runId, 'INSIGHT');
    assert.equal((f.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count, changes);
  } finally { process.env.PATH = priorPath; }
});

test('a wrong Metric run binding keeps its closed reason, never the exception text, stays blocked beside Insight and is served frozen', async t => {
  const f = await fixture(t, true);
  assert.equal(f.semantic.metricMethodsFailure, 'METRIC_SOURCE_RUN_MISMATCH');
  assert.equal(f.semantic.metricMethods, null);
  const original = await f.service.readReport(workspaceId, runId, 'MARKET');
  const doc = new JSDOM(original.bytes.toString()).window.document;
  assert.match(doc.getElementById('M03')!.textContent!, /Mã đối chiếu: METRIC_SOURCE_RUN_MISMATCH\./);
  // The bridge's exception text and the generic fallback never reach stored output.
  for (const stored of [original.bytes.toString(), JSON.stringify(f.semantic)])
    assert.doesNotMatch(stored, /not bound to this confirmed run|METRIC_METHOD_FAILED/);
  assert.equal(doc.getElementById('M03')!.querySelector('table'), null);
  assert.equal(doc.getElementById('M04')!.querySelector('svg'), null);
  assert.equal(f.insightSemantic.metricMethodsFailure, undefined);
  assert.ok((await f.service.readReport(workspaceId, runId, 'INSIGHT')).bytes.length);
  const changes = (f.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  const priorPath = process.env.PATH;
  f.db.pragma('query_only=ON');
  try {
    process.env.PATH = '/no-python-for-historical-read';
    const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaces,
      now: () => { throw new Error('historical report read must not use the clock'); } });
    assert.deepEqual((await reader.readReport(workspaceId, runId, 'MARKET')).bytes, original.bytes);
    assert.equal((f.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count, changes);
  } finally { process.env.PATH = priorPath; }
});

test('each closed Metric failure renders its own fixed explanation and next step, never totals, and the generic fallback keeps its copy', async t => {
  const f = await fixture(t, true);
  const { metricMethods: _metricMethods, metricMethodsFailure: _failure, ...base } = f.marketInput;
  const explanations = new Set<string>();
  const nextSteps = new Set<string>();
  for (const code of METRIC_METHOD_FAILURE_CODES) {
    const rendered = buildResearchAutomationReport({ ...base, metricMethodsFailure: code }, 'MARKET');
    assert.equal((rendered.semantic as Record<string, unknown>).metricMethodsFailure, code);
    const doc = new JSDOM(rendered.html.toString()).window.document;
    for (const id of ['M03', 'M04']) {
      const section = doc.getElementById(id)!;
      assert.equal(section.querySelector('table, svg'), null);
      const explanation = section.querySelector('header + p')!.textContent!;
      const warning = section.querySelector('p.warning')!.textContent!;
      const reference = ` Mã đối chiếu: ${code}.`;
      assert.ok(warning.endsWith(reference), `${code} ${id}: ${warning}`);
      if (id === 'M03') { explanations.add(explanation); nextSteps.add(warning.slice(0, -reference.length)); }
      // Unclassified failures keep the copy shown before closed reasons existed.
      if (code === 'METRIC_METHOD_FAILED') {
        assert.equal(explanation, 'Gói Metric được gắn với lượt này chưa vượt qua kiểm tra nguồn, kỳ hoặc phương pháp. Không dùng số liệu chưa xác minh; cần sửa gói đầu vào cho lượt mới. Không tự gọi lại nguồn.');
        assert.equal(warning, 'Chưa tính được từ gói Metric gắn với lượt này. Kiểm tra nguồn, kỳ đo và liên kết phạm vi trước khi tạo lượt mới. Mã đối chiếu: METRIC_METHOD_FAILED.');
      }
    }
  }
  assert.equal(explanations.size, METRIC_METHOD_FAILURE_CODES.length);
  assert.equal(nextSteps.size, METRIC_METHOD_FAILURE_CODES.length);
});

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { readerRowsFromMetricWorkbook } from '../../src/modules/analysis/reader-report/metric-rows.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import type { UnitPricePacket } from '../../src/modules/analysis/reader-report/market-unit-prices.js';
import type { AutomationMarketPresentationMethod } from '../../contracts/analysis/automation-market-presentation-method.generated.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
const now = () => new Date('2026-02-01T00:00:00Z');
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
const request = (pair: string, receipt?: string) => ({ contractVersion: 'automation-market-presentation-revision-v1',
  requestKey: randomUUID(), previousPairId: pair, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
  ...(receipt ? { unitSpecIntakeSha256: receipt } : {}) });

function retainedSalesSource(onCall: () => void): AutomationSourcePort {
  const source = syntheticProductSource();
  return { ...source,
    quickSearch: async (input, options) => {
      onCall();
      const result = await source.quickSearch(input, options);
      const bytes = Buffer.from(JSON.stringify({ data: [{ product_id: '12345', product_name: 'Synthetic jar from sales response' }] }));
      return { ...result, result: { ...result.result, captures: result.result.captures.map(capture => ({ ...capture, responseBytes: bytes,
        responseSha256: createHash('sha256').update(bytes).digest('hex'), responseByteLength: bytes.length })) } };
    },
    collect: async (input, options) => {
      onCall();
      const result = await source.collect(input, options);
      return { ...result, result: { ...result.result, captures: [] } };
    },
  };
}

async function fixture(t: TestContext, cells: Record<string, unknown> = {}, forgedAdapter = false, skipMetric = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-auto-market-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'auto-market', title: 'Synthetic Market presentation' });
  let renders = 0, sourceCalls = 0, modelCalls = 0;
  const rendererControl = { forgedHtml: false };
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces), metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    source: retainedSalesSource(() => { sourceCalls++; }), sourceEvidence: { modelIdentity: 'synthetic-fake-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => { modelCalls++; return { keywords: ['synthetic jar'], exclusions: [] }; } } },
    ...(forgedAdapter ? { renderer: (input, kind) => {
      renders++;
      const report = buildResearchAutomationReport(input, kind);
      return { ...report, ...(rendererControl.forgedHtml ? { html: Buffer.from('<p>999999 invented</p>') } : {}), semantic: { ...report.semantic as Record<string, unknown>,
        ...(input.marketPresentation ? { sections: [{ sectionId: 'M01', explanation: '999999 invented' }], scope: 'forged scope' } : {}),
        marketPresentation: { findings: [{ statement: '999999 invented' }] }, marketPresentationArtifact: { sha256: 'f'.repeat(64), byteSize: 7 } } };
    } } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const workbook = generated.stdout;
  const scope = { definition: 'Synthetic product export scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [] };
  const prepared = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1',
    requestKey: randomUUID(), expectedRevision: awaiting.revision, scope, sourceLabel: 'Synthetic export', sourceContext: 'Synthetic fixture only.',
    measurementPeriod: { ...period, basis: 'Declared export window' }, selection: 'UNSPECIFIED', acquiredAt: null,
    precision: { revenue: 'unknown', units: 'unknown' } }, workbook);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: awaiting.revision, ...scope, sources: { metric: skipMetric ? { decision: 'SKIPPED' } : { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  const original = await service.readReport(workspaceId, runId, 'MARKET', false, pair.pairId);
  return { db, artifacts, service, workbook, prepared, pair, original, rendererControl, renders: () => renders, modelCalls: () => modelCalls, sourceCalls: () => sourceCalls };
}

test('actual auto service builds source-bound findings/unit tables and immutable reports while stripping adapter injection', async t => {
  const f = await fixture(t, {}, true);
  const units = unitPriceFixture(readerRowsFromMetricWorkbook(f.workbook, ['shopee']));
  const intake = await f.service.prepareReaderUnitSpecs(workspaceId, runId, { contractVersion: 'reader-unit-spec-intake-v1',
    metricPackageId: f.prepared.packageId, platforms: ['shopee'], unitPrices: units.packet },
    new Map(units.retained.map(source => [source.sha256, source.bytes])), owner);
  const recordBytes = await f.artifacts.read(intake.intakeSha256);
  const record = JSON.parse(recordBytes.toString());
  for (const change of [ { workspaceId: randomUUID() }, { runId: randomUUID() }, { draftPairId: 'e'.repeat(64) },
    { workbookSha256: 'd'.repeat(64) }, { request: { ...record.request, metricPackageId: randomUUID() } },
    { request: { ...record.request, platforms: ['tiktok'] } } ]) {
    const bytes = Buffer.from(canonicalJson({ ...record, ...change }));
    const artifact = await f.artifacts.put(bytes);
    f.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,?,?,?,?,'active',?)`).run(artifact.sha256, artifact.byteSize, 'application/vnd.tdn.reader-unit-spec-intake+json',
        artifact.relativePath, now().toISOString(), 'reader-unit-spec-intake-record-v1', now().toISOString());
    await assert.rejects(f.service.requestReportRevision(workspaceId, runId, request(f.pair.pairId, artifact.sha256)));
  }
  assert.equal((await f.service.listReportAttempts(workspaceId, runId)).length, 0);
  f.rendererControl.forgedHtml = true;
  const forged = await f.service.requestReportRevision(workspaceId, runId, request(f.pair.pairId));
  await f.service.processNext();
  assert.equal((await f.service.getReportRevision(workspaceId, runId, forged.attemptId)).state, 'FAILED');
  assert.equal((await f.service.listReportVersions(workspaceId, runId)).length, 1);
  f.rendererControl.forgedHtml = false;
  const input = request(f.pair.pairId, intake.intakeSha256);
  const sourceCalls = f.sourceCalls(), modelCalls = f.modelCalls();
  assert.equal(modelCalls, 1, 'original collection uses only one synthetic keyword transport call');
  const receipt = await f.service.requestReportRevision(workspaceId, runId, input);
  await f.service.processNext();
  const committed = await f.service.getReportRevision(workspaceId, runId, receipt.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  assert.equal(f.sourceCalls(), sourceCalls, 'deterministic revision performs no new collection');
  assert.equal(f.modelCalls(), modelCalls, 'deterministic revision performs no new application model call');
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v20');
  assert.equal(semantic.sourceEvidence.contractVersion, 'automation-source-evidence-v1');
  const method = semantic.marketPresentation as AutomationMarketPresentationMethod;
  assert.equal(method.binding.previousPairId, f.pair.pairId);
  assert.equal(method.input.unitSpec!.sha256, intake.intakeSha256);
  assert.equal(method.findings.length, 5);
  assert.equal(method.unitPrices.length, 2);
  assert.equal(method.unitPrices[0]!.value, 5000);
  assert.ok(!JSON.stringify(semantic).includes('999999 invented'));
  assert.notEqual(semantic.scope, 'forged scope');
  const retained = await f.artifacts.read(semantic.marketPresentationArtifact.sha256);
  assert.deepEqual(JSON.parse(retained.toString()), method);
  const doc = new JSDOM(report.bytes.toString()).window.document;
  assert.equal(doc.querySelectorAll('#M01 ul.market-findings > li').length, 5);
  assert.ok(doc.querySelector('#M01')!.textContent!.includes('2026-01-01 đến 2026-01-29'));
  assert.ok(doc.querySelector('#M08')!.textContent!.includes('đồng/100g'));
  assert.ok(doc.querySelector('#M01 .citation-mark, #M01 sup, #M01 a[href*="citation"]'));
  assert.ok(lintVisibleReportText(report.bytes.toString()).every(check => check.ok));
  assert.ok(!report.bytes.toString().includes('adSpend') && !report.bytes.toString().includes('adShare'));
  const citations = { mark: () => '[1]' };
  const metric = semantic.metricMethods;
  const oldM03 = metricMethodSection(metric, 'M03', undefined, citations);
  assert.equal(metricMethodSection(metric, 'M03', undefined, citations, false), oldM03);
  assert.ok(oldM03.includes('không nhất thiết'));
  assert.equal(metricMethodSection(metric, 'M03', undefined, citations, true), oldM03.replace('không nhất thiết là', 'chưa chứng minh'));
  const rendererInput: Parameters<typeof buildResearchAutomationReport>[0] = { run: await f.service.getRun(workspaceId, runId), start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', description: null, interview: null, keyword: 'synthetic jar',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET', 'INSIGHT'] }, scope: semantic.scope,
    collection: null, captures: [], marketPresentation: method };
  const superlative = structuredClone(rendererInput);
  superlative.marketPresentation!.findings[0]!.statement = 'Sản phẩm tốt nhất.';
  assert.throws(() => buildResearchAutomationReport(superlative, 'MARKET'), /MARKET_VISIBLE_TEXT_LINT_FAILED:U13_SUPERLATIVE/);
  const pending = structuredClone(rendererInput);
  pending.marketPresentation!.findings[0]!.pending = true;
  pending.marketPresentation!.findings[0]!.statement = 'Có 2 bản ghi. Có 3 gian hàng.';
  assert.throws(() => buildResearchAutomationReport(pending, 'MARKET'), /MARKET_VISIBLE_TEXT_LINT_FAILED:U13_PENDING_NUMBER/);
  const renders = f.renders(), changes = f.db.prepare('SELECT total_changes() n').get() as { n: number };
  f.db.pragma('query_only = ON');
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = '/no-python-for-market-read';
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!)).bytes, report.bytes);
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, f.pair.pairId)).bytes, f.original.bytes);
    assert.deepEqual(await f.artifacts.read(semantic.marketPresentationArtifact.sha256), retained);
    assert.equal(f.renders(), renders);
    assert.equal(f.modelCalls(), modelCalls);
    assert.equal(f.sourceCalls(), sourceCalls);
    assert.equal((f.db.prepare('SELECT total_changes() n').get() as { n: number }).n, changes.n);
  } finally { process.env.PATH = previousPath; f.db.pragma('query_only = OFF'); }
  assert.deepEqual(await f.service.requestReportRevision(workspaceId, runId, input), { ...committed, exactRetry: true });
  const unitSource = (method.input.unitSpec!.record.request.unitPrices as UnitPricePacket).sources[0]!.sha256;
  const sourcePath = f.artifacts.pathForDigest(unitSource), originalBytes = await fs.readFile(sourcePath);
  await fs.writeFile(sourcePath, Buffer.from('{"tampered":true}'));
  await assert.rejects(f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!));
  await fs.writeFile(sourcePath, originalBytes);
  const methodPath = f.artifacts.pathForDigest(semantic.marketPresentationArtifact.sha256);
  await fs.writeFile(methodPath, Buffer.from('{"findings":[]}'));
  await assert.rejects(f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!));
  await fs.writeFile(methodPath, retained);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!)).bytes, report.bytes);
});

test('auto presentation without a receipt preserves zero/missing, keeps references unavailable and rejects unrelated digests before queuing', async t => {
  const f = await fixture(t, { E2: { value: '0' }, E3: { value: '0' }, D2: null, D3: null });
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId, request(f.pair.pairId, 'f'.repeat(64))));
  assert.equal((await f.service.listReportAttempts(workspaceId, runId)).length, 0);
  const receipt = await f.service.requestReportRevision(workspaceId, runId, request(f.pair.pairId));
  await f.service.processNext();
  const committed = await f.service.getReportRevision(workspaceId, runId, receipt.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.marketPresentation.findings.length, 4);
  assert.ok(semantic.marketPresentation.findings[1].statement.includes('0 VND'));
  assert.ok(semantic.marketPresentation.findings[1].statement.includes('chưa có tổng đơn vị bán'));
  assert.equal(semantic.marketPresentation.input.metric.scopes[0].units.value, null);
  assert.equal(semantic.marketPresentation.unitPrices.length, 0);
  assert.ok(report.bytes.toString().includes('Chưa tính giá theo đơn vị chuẩn'));
  assert.ok(report.bytes.toString().includes('Chưa có trường ROAS hoặc CPA'));
});

test('actual auto revision never discovers an unselected prepared package or fabricates findings from missing inputs', async t => {
  const f = await fixture(t, {}, false, true);
  const revision = await f.service.requestReportRevision(workspaceId, runId, request(f.pair.pairId));
  await f.service.processNext();
  const committed = await f.service.getReportRevision(workspaceId, runId, revision.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.marketPresentation.binding.metric, null);
  assert.deepEqual(semantic.marketPresentation.findings, []);
  assert.deepEqual(semantic.marketPresentation.unitPrices, []);
  assert.ok(report.bytes.toString().includes('Chưa đủ bằng chứng để có bốn nhận định'));
  assert.ok(report.bytes.toString().includes('Chưa tính giá theo đơn vị chuẩn'));
});

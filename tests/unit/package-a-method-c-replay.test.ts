import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AutomationMetricMethodBridge } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { type CaptureRelevanceAi, type CaptureRelevanceRecord } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { relevanceHarness, relevanceNow, relevanceHash } from '../helpers/capture-relevance-fixture.js';
import { methodCArchive, normalRow, referenceRows } from '../helpers/method-c-fixture.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import path from 'node:path';

const cases = [
  { keyword: 'giày thể thao', title: 'Cho bé: giày thể thao đế mềm' },
  { keyword: 'đèn lumo', title: 'Dành cho phòng nhỏ: đèn lumo mẫu nhỏ' },
  { keyword: 'bánh nori', title: 'Cho bữa sáng: bánh nori mẫu nhỏ' },
];
type Harness = Awaited<ReturnType<typeof relevanceHarness>>;
const bridge = (f: Harness, ai?: CaptureRelevanceAi) => new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts,
  workspaces: f.workspaces, now: relevanceNow, ...(ai ? { captureRelevance: ai } : {}) });
function failingAi(kind: 'throw' | 'invalid' | 'timeout') {
  let calls = 0;
  const ai: CaptureRelevanceAi = { configuration: captureRelevanceConfiguration('synthetic-unavailable-model'), classifier: { async classify() {
    calls++;
    if (kind === 'invalid') return [];
    if (kind === 'timeout') throw new DOMException('Synthetic unavailable', 'TimeoutError');
    throw new Error('Synthetic unavailable');
  } } };
  return { ai, get calls() { return calls; } };
}
async function retainedState(f: Harness, packageId: string) {
  const artifacts = f.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all() as { sha256: string }[];
  const tableNames = f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return { package: await f.packages.readVerified(packageId),
    tables: ['foundation_source_packages', 'foundation_source_package_files', 'foundation_source_attachment_origins', 'artifact_manifests'].map(table => f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    rowCounts: tableNames.map(({ name }) => ({ table: name, count: f.db.prepare(`SELECT count(*) n FROM "${name.replaceAll('"', '""')}"`).get() })),
    artifacts: await Promise.all(artifacts.map(async ({ sha256 }) => ({ sha256, bytes: await f.artifacts.read(sha256) }))),
    changes: f.db.prepare('SELECT total_changes() n').get() };
}

for (const { keyword, title } of cases) for (const kind of ['throw', 'invalid', 'timeout'] as const) {
  test(`${keyword}: real ${kind} path freezes 41 nulls before metrics and replays without classification or new stored intake`, async t => {
    const rows = [...referenceRows(keyword), normalRow(title)];
    const archive = await methodCArchive(keyword, rows);
    const f = await relevanceHarness(t, undefined, archive);
    const fake = failingAi(kind);
    const read = fs.readFile.bind(fs);
    let checked = false;
    const readMock = t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]).endsWith('/docs/research/report-section-catalog-v1.json')) {
        const saved = f.db.prepare("SELECT package_id id FROM foundation_source_packages WHERE package_key LIKE '%-capture-relevance' AND finalized_at IS NOT NULL").get() as { id: string };
        assert.ok(saved, 'checkpoint is finalized before calculation');
        const pkg = await f.packages.readVerified(saved.id);
        const record = JSON.parse(pkg.files.find(file => file.path === 'methods/capture-relevance.json')!.bytes.toString()) as CaptureRelevanceRecord;
        assert.equal(record.decisions.length, 41);
        assert.ok(record.decisions.every(d => d.label === null));
        checked = true;
      }
      return read(...args);
    });
    const method = (await bridge(f, fake.ai).execute(f.input))!;
    readMock.mock.restore();
    assert.equal(checked, true);
    assert.equal(fake.calls, 4, 'two logical batches, one retry each');
    const record = method.capture!.relevance!;
    assert.deepEqual(record.methodNotes, { batches: 2, retriedBatches: 2, failedBatches: 2, cappedTitles: 0 });
    assert.equal(record.decisions.length, 41);
    assert.ok(record.decisions.every(d => d.label === null));
    assert.equal(method.capture!.rowPolicyVersion, CAPTURE_ROW_PROFILE);
    assert.equal(method.result.input.records.length, 41);
    assert.ok(method.result.input.records.some(r => r.title === title));
    const all = method.result.scopes.find(s => s.key === 'all')!;
    assert.equal(all.revenue.value, '4100');
    assert.equal(all.shopCount, 41);
    assert.equal(all.shops.length, 41, 'every synthetic shop remains in ranking membership');
    assert.deepEqual(method.capture!.excludedRows, []);
    const projection = readerRowsFromMetricCapture(archive.snapshot, ['shopee'], CAPTURE_ROW_PROFILE, record);
    assert.deepEqual(projection.rows.map(r => r.title), method.result.input.records.map(r => r.title));
    assert.equal(projection.rows.reduce((sum, r) => sum + r.rev!, 0), 4100);
    assert.equal(new Set(projection.rows.map(r => r.shop)).size, 41);
    assert.deepEqual(projection.excluded, []);
    const before = await retainedState(f, method.sourcePackage.packageId);
    const original = canonicalJson(method);
    const inputBefore = canonicalJson(f.input);
    const intake = t.mock.method(SourcePackageService.prototype, 'intake');
    let replacementCalls = 0;
    const replacement: CaptureRelevanceAi = { configuration: captureRelevanceConfiguration('synthetic-replacement-model'), classifier: { async classify() {
      replacementCalls++; assert.fail('retained null labels cannot be replaced');
    } } };
    for (const ai of [replacement, undefined]) {
      const replay = bridge(f, ai);
      const firstReplayCall = intake.mock.callCount();
      const executed = await replay.execute(f.input);
      const verified = await replay.verify(method, f.input);
      assert.deepEqual(executed, method);
      assert.deepEqual(verified, method);
      assert.equal(canonicalJson(executed), original);
      assert.equal(canonicalJson(verified), original);
      for (const call of intake.mock.calls.slice(firstReplayCall)) {
        const receipt = await call.result;
        assert.ok(receipt, 'every replay intake returns a retained-package receipt');
        assert.equal(receipt.packageId, method.sourcePackage.packageId);
        assert.equal(receipt.manifestArtifactSha256, method.sourcePackage.manifestArtifactSha256);
        assert.equal(receipt.packageContentSha256, method.sourcePackage.packageContentSha256);
        assert.equal((call.arguments[0] as { version: number }).version, 1);
        assert.equal((await f.packages.readVerified(receipt.packageId)).manifest.version, 1);
        assert.equal(receipt.deduplicated, true);
        assert.equal(receipt.databaseMutations, 0);
      }
      assert.deepEqual(await retainedState(f, method.sourcePackage.packageId), before);
      assert.equal(replacementCalls, 0);
      assert.equal(fake.calls, 4);
    }
    assert.equal(canonicalJson(method), original);
    assert.equal(canonicalJson(f.input), inputBefore);
    assert.equal(replacementCalls, 0);
    assert.equal(fake.calls, 4);
  });
}

for (const { keyword, title } of cases) for (const replacement of ['changed', 'removed'] as const) {
  test(`${keyword}: failure after null checkpoint resumes with model ${replacement} and no reclassification`, async t => {
    const f = await relevanceHarness(t, undefined, await methodCArchive(keyword, [...referenceRows(keyword), normalRow(title)]));
    const fake = failingAi('throw');
    const read = fs.readFile.bind(fs);
    let checkpointBytes: Buffer | undefined;
    let checkpointId = '';
    const mock = t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
      if (!checkpointBytes && String(args[0]).endsWith('/docs/research/report-section-catalog-v1.json')) {
        const saved = f.db.prepare("SELECT package_id id FROM foundation_source_packages WHERE package_key LIKE '%-capture-relevance' AND finalized_at IS NOT NULL").get() as { id: string };
        checkpointId = saved.id;
        checkpointBytes = (await f.packages.readVerified(saved.id)).files.find(file => file.path === 'methods/capture-relevance.json')!.bytes;
        throw new Error('Synthetic stop after checkpoint');
      }
      return read(...args);
    });
    await assert.rejects(bridge(f, fake.ai).execute(f.input), /Synthetic stop after checkpoint/);
    mock.mock.restore();
    assert.ok(checkpointBytes);
    assert.equal(fake.calls, 4);
    const checkpointBefore = await f.packages.readVerified(checkpointId);
    let replacementCalls = 0;
    const ai: CaptureRelevanceAi = { configuration: captureRelevanceConfiguration('synthetic-replacement-model'), classifier: { async classify() {
      replacementCalls++; assert.fail('resume must read checkpoint');
    } } };
    const resumed = (await bridge(f, replacement === 'changed' ? ai : undefined).execute(f.input))!;
    assert.equal(canonicalJson(resumed.capture!.relevance), checkpointBytes.toString());
    assert.equal(resumed.result.input.records.length, 41);
    assert.equal(resumed.result.scopes.find(s => s.key === 'all')!.revenue.value, '4100');
    assert.equal(resumed.result.scopes.find(s => s.key === 'all')!.shopCount, 41);
    assert.deepEqual(resumed.capture!.excludedRows, []);
    assert.deepEqual(await f.packages.readVerified(checkpointId), checkpointBefore);
    const final = await retainedState(f, resumed.sourcePackage.packageId);
    assert.deepEqual(await bridge(f, ai).execute(f.input), resumed);
    assert.deepEqual(await bridge(f).verify(resumed, f.input), resumed);
    assert.deepEqual(await retainedState(f, resumed.sourcePackage.packageId), final);
    assert.equal(replacementCalls, 0);
  });
}

for (const { keyword, title } of cases) test(`${keyword}: all-null finalized method builds and reads saved public report without replacement calls`, async t => {
  const archive = await methodCArchive(keyword, [...referenceRows(keyword), normalRow(title)]);
  const f = await relevanceHarness(t, undefined, archive);
  const fake = failingAi('throw');
  const runId = '99999999-9999-4999-8999-999999999999';
  const workspaceId = f.input.start.workspaceId;
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaces, now: relevanceNow,
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(f.root, 'artifacts')), uuid: () => runId, readerReportFlint: false, captureRelevance: fake.ai });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '55555555-5555-4555-8555-555555555555',
    mode: 'CATEGORY', keyword, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const prepared = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1', requestKey: '66666666-6666-4666-8666-666666666666',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, sourceContext: 'Synthetic source' }, archive.snapshotBytes, archive.manifestBytes);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '77777777-7777-4777-8777-777777777777',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic scope', includeTerms: [keyword], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 20 && await service.processNext(); i++);
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  assert.equal(fake.calls, 4);
  const draft = await service.readReport(workspaceId, runId, 'MARKET', false);
  const original = (await f.artifacts.read(draft.versionId)).toString();
  const method = JSON.parse(original).metricMethods;
  assert.equal(method.result.input.records.length, 41);
  for (const changed of [true, false]) {
    let replacementCalls = 0;
    const replay = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaces, now: relevanceNow, readerReportFlint: false,
      ...(changed ? { captureRelevance: { configuration: captureRelevanceConfiguration('synthetic-replacement-model'), classifier: { async classify() {
        replacementCalls++; assert.fail('reader uses retained labels');
      } } } } : {}) });
    const verified = await replay.readReport(workspaceId, runId, 'MARKET', false);
    assert.equal(relevanceHash(verified.bytes), relevanceHash(draft.bytes));
    const built = await replay.buildReaderReport(workspaceId, runId, { contractVersion: 'reader-report-build-v1.2', requestKey: changed ? '88888888-8888-4888-8888-888888888888' : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metricPackageId: prepared.packageId, platforms: ['shopee'], profile: sync1ReaderFixture().profile, cover: null,
      source: deriveReaderSource(verifyWebSnapshot(archive.snapshot, webSnapshotDigest(archive.snapshot)), 5000, { nullable: true }) }, { actorId: 'owner:synthetic', role: 'OWNER' });
    const saved = f.db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { sha: string };
    const record = JSON.parse((await f.artifacts.read(saved.sha)).toString());
    assert.equal(record.input.rows.length, 41);
    assert.equal(record.captureRowPolicy, CAPTURE_ROW_PROFILE);
    assert.deepEqual(record.captureExcludedRows, []);
    const reader = await replay.readReaderReport(workspaceId, runId, built.revision.revisionId);
    assert.match(reader.bytes.toString(), /Những tiêu đề AI chưa phân loại được hoặc còn chưa chắc chắn vẫn được giữ trong mẫu\./u);
    const before = f.db.prepare('SELECT total_changes() n').get();
    assert.deepEqual((await replay.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes, reader.bytes);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
    assert.equal(replacementCalls, 0);
    assert.equal((await f.artifacts.read(draft.versionId)).toString(), original);
  }
  assert.equal(fake.calls, 4);
});


for (const product of [
  { keyword: 'đèn lumo', accessory: 'Vỏ dùng cho đèn lumo', gift: 'Túi mẫu tặng đèn lumo' },
  { keyword: 'giày vesa', accessory: 'Bao dùng cho giày vesa', gift: 'Hộp mẫu tặng giày vesa' },
  { keyword: 'bánh nori', accessory: 'Hộp đựng bánh nori', gift: 'Túi mẫu tặng bánh nori' },
]) test(`${product.keyword}: saved NOT_MAIN accessory and gift decisions survive checkpoint resume and final replay`, async t => {
  const { keyword, accessory, gift } = product;
  const rows = [...referenceRows(keyword), normalRow(accessory), normalRow(gift), normalRow(`Cho bé: ${keyword} mẫu nhỏ`)];
  const f = await relevanceHarness(t, undefined, await methodCArchive(keyword, rows));
  let calls = 0;
  const ai: CaptureRelevanceAi = { configuration: captureRelevanceConfiguration('synthetic-label-model'), classifier: { async classify({ items }) {
    calls++; return items.map(({ id, title }) => ({ id, label: title === accessory || title === gift ? 'NOT_MAIN' : title.startsWith('Cho bé') ? 'UNSURE' : 'MAIN' }));
  } } };
  const read = fs.readFile.bind(fs);
  let checkpoint: Buffer | undefined;
  let checkpointId = '';
  const mock = t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (!checkpoint && String(args[0]).endsWith('/docs/research/report-section-catalog-v1.json')) {
      const saved = f.db.prepare("SELECT package_id id FROM foundation_source_packages WHERE package_key LIKE '%-capture-relevance' AND finalized_at IS NOT NULL").get() as { id: string };
      checkpointId = saved.id;
      checkpoint = (await f.packages.readVerified(saved.id)).files.find(file => file.path === 'methods/capture-relevance.json')!.bytes;
      throw new Error('Synthetic stop after labelled checkpoint');
    }
    return read(...args);
  });
  await assert.rejects(bridge(f, ai).execute(f.input), /Synthetic stop after labelled checkpoint/);
  mock.mock.restore();
  assert.equal(calls, 2);
  assert.ok(checkpoint);
  const checkpointBefore = await f.packages.readVerified(checkpointId);
  const method = (await bridge(f).execute(f.input))!;
  assert.equal(canonicalJson(method.capture!.relevance), checkpoint.toString());
  assert.deepEqual(method.capture!.excludedRows!.map(r => [r.title, r.reason]), [[accessory, 'NOT_MAIN_PRODUCT'], [gift, 'NOT_MAIN_PRODUCT']]);
  assert.equal(method.result.input.records.length, 41);
  const expected = readerRowsFromMetricCapture(f.archive.snapshot, ['shopee'], CAPTURE_ROW_PROFILE, method.capture!.relevance);
  assert.deepEqual(expected.rows.map(r => r.title), method.result.input.records.map(r => r.title));
  assert.equal(expected.rows.reduce((sum, r) => sum + r.rev!, 0), 4100);
  const before = await retainedState(f, method.sourcePackage.packageId);
  assert.deepEqual(await bridge(f, ai).execute(f.input), method);
  assert.deepEqual(await bridge(f).verify(method, f.input), method);
  assert.deepEqual(await retainedState(f, method.sourcePackage.packageId), before);
  assert.deepEqual(await f.packages.readVerified(checkpointId), checkpointBefore);
  assert.equal(calls, 2, 'saved NOT_MAIN and UNSURE decisions are never reclassified');
});

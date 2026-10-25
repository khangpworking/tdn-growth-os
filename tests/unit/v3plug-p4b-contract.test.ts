import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { buildRevisionValue } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { CONTEXT_PATH, MANIFEST_PATH, SNAPSHOT_PATH, type MetricRawResponsesRef } from '../../src/modules/analysis/research-automation/metric-capture-intake.js';
import { resolveMarketRawSource } from '../../src/modules/analysis/research-automation/market-raw-series.js';
import type { MarketNumberTrace } from '../../src/modules/analysis/research-automation/market-trace-map.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { autorun, captureFiles, drain, driveUntil, fixture, withRawResponses, workspaceId } from '../helpers/autorun-harness.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import zinc30 from '../fixtures/market-raw-series/zinc-30d-4platform.synthetic.raw-responses.json' with { type: 'json' };

// P4b owns the capture -> stored artifact -> autorun report boundary. P3/P4
// already own parsing and individual block arithmetic. All input is derived
// from committed fixtures; no capture executor, browser or provider is called.
const keyword = 'viên uống kẽm';
const period = { startDate: '2026-09-21', endDate: '2026-10-20' };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface Scenario { second?: boolean; tamper?: boolean; secrets?: boolean; excluded?: boolean; noHeadlines?: boolean }

async function zincRun(t: TestContext, options: Scenario = {}) {
  const captures: Array<{ dir: string; rawBytes: Buffer; manifestBytes: Buffer }> = [];
  // Override the shared harness opt-out through its service configuration: W4
  // must exercise the same Flint requirement as the published Reader.
  const rendering = { renderer: buildResearchAutomationReport, readerReportFlint: true };
  const f = await fixture(t, 'on', undefined, capture => async (_config, request) => {
    capture.calls.push(request);
    const number = request.second ? 2 : 1;
    const files = captureFiles(request.runId, period);
    const snapshot = JSON.parse(files.snapshotBytes.toString());
    snapshot.captureId += `-${number}`;
    snapshot.scope.keywords = request.second?.keywords ?? [keyword];
    snapshot.scope.platforms = ['shopee', 'tiktok'];
    snapshot.scope.category = request.second?.category ?? null;
    if (!options.excluded) for (const row of snapshot.groups.W12_topProducts.rows) row.cells.name.text = `${keyword} ${row.cells.name.text}`;
    const tiktok = snapshot.groups.W12_topProducts.rows[1].cells;
    tiktok.platform.text = 'tiktok';
    tiktok.revenue.platform = 'tiktok';
    tiktok.units.platform = 'tiktok';
    const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
    const manifest = JSON.parse(files.manifestBytes.toString());
    manifest.captureId = snapshot.captureId;
    manifest.appliedFilters = { ...manifest.appliedFilters, ...snapshot.scope };
    manifest.files[0] = { ...manifest.files[0], sha256: hash(snapshotBytes), byteSize: snapshotBytes.length };
    const raw = structuredClone(zinc30);
    const searchData = raw[0]!.body.data;
    assert.ok(!Array.isArray(searchData), 'the zinc fixture starts with search-basic data');
    const search = searchData.search_basic;
    // Capture 1 deliberately has different values when the scope needs capture 2.
    if (options.second && number === 1) {
      const revenues = search.aggregations.find(item => item.aggregation === 'REVENUE_TOTAL_CUSTOM')!;
      for (const platform of revenues.entity.platforms) platform.value /= 10;
    }
    // The product endpoint supplies the pick with the existing harness rows.
    const products = JSON.parse(files.rawBytes.toString()).responses[0].body.data.map((row: Record<string, unknown>) => ({
      ...row, product_name: keyword,
      ...(options.second ? { bee_categories: [{ id: 'c1000000001', name: 'Sức Khoẻ', level: 0 }] } : {}),
    }));
    if (options.second) (search.aggregations as unknown[]).push({ aggregation: 'REVENUE__BY__CATEGORIES_CUSTOM', entities: [
      { key: 'c1000000001', platforms: [{ platform_id: 1, value: 90 }, { platform_id: 8, value: 90 }] },
      { key: 'c1000000002', platforms: [{ platform_id: 1, value: 10 }, { platform_id: 8, value: 10 }] },
    ] });
    if (options.noHeadlines) search.aggregations = [];
    const responses: unknown[] = [...raw, { urlPath: '/v2/market/analytics/products/', responseOrder: 30, status: 200,
      requestBody: raw[0]!.requestBody, body: { data: { products } } }];
    if (options.secrets) responses.push({ account: { id: 'synthetic-account' }, session: 'synthetic-session',
      nested: [{ access_token: 'synthetic-token', kept: 'fixture evidence' }] });
    const rawBytes = Buffer.from(JSON.stringify(responses));
    const manifestBytes = withRawResponses(Buffer.from(JSON.stringify(manifest)), rawBytes);
    const dir = join(capture.captureRoot, request.runId, `run${number}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'snapshot.json'), snapshotBytes);
    await writeFile(join(dir, 'manifest.json'), manifestBytes);
    // Valid JSON with a byte mismatch reaches the PREPARE integrity guard.
    await writeFile(join(dir, 'raw-responses.json'), options.tamper ? Buffer.concat([rawBytes, Buffer.from(' ')]) : rawBytes);
    captures.push({ dir, rawBytes, manifestBytes });
    return { ok: true, captureDir: dir, period, executorCalls: 0 };
  }, undefined, rendering);
  const receipt = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'CATEGORY', keyword, requestedPeriod: period, reports: ['MARKET'] });
  return { ...f, runId: receipt.run.runId, captures };
}
type ZincRun = Awaited<ReturnType<typeof zincRun>>;

async function prepared(f: ZincRun) {
  const packageId = autorun(f.db, f.runId)!.packageId;
  assert.ok(packageId, 'PREPARE retains a source package');
  const source = await new SourcePackageService({ db: f.db, artifactStore: f.artifacts }).readVerified(packageId);
  const json = (path: string) => {
    const file = source.files.find(file => file.path === path);
    assert.ok(file, `stored package contains ${path}`);
    return JSON.parse(file.bytes.toString());
  };
  return { packageId, context: json(CONTEXT_PATH) as { contractVersion: string; rawResponses: MetricRawResponsesRef[] },
    manifest: json(MANIFEST_PATH), snapshot: json(SNAPSHOT_PATH) };
}

async function report(f: ZincRun, service = f.service) {
  const pair = (await service.listReportVersions(workspaceId, f.runId)).at(-1);
  assert.ok(pair, 'autorun must commit a report');
  const html = await service.readReport(workspaceId, f.runId, 'MARKET', false, pair.pairId);
  const semantic = JSON.parse((await f.artifacts.read(html.versionId)).toString()) as {
    marketRawResponses: { usedSha256: string; captures: Array<{ captureNumber: number; sha256: string; byteSize: number }> };
    marketNumberTrace: MarketNumberTrace;
  };
  return { pair, bytes: html.bytes, semantic };
}

function withDocument(bytes: Uint8Array, check: (document: Document) => void): void {
  const dom = new JSDOM(Buffer.from(bytes).toString());
  try { check(dom.window.document); } finally { dom.window.close(); }
}

function assertZincBlocks(document: ParentNode): void {
  const block = document.querySelector('[data-market-raw-period="30d"]');
  assert.ok(block, 'W4 report includes the stored zinc raw-number blocks');
  assert.deepEqual([...block.querySelectorAll('[data-kpi] b')].map(card => card.textContent),
    ['35,0 tỷ', '193,5 nghìn', '956', '390'], 'all-platform headline KPIs retain the fixture values');
  assert.match(block.querySelector('[data-market-raw-split]')!.textContent!, /Shopee 7,9 tỷ.*TikTok Shop 27,0 tỷ.*Cộng 2 sàn 34,9 tỷ/u);
  const intervals = [...block.querySelectorAll('table[data-market-raw-intervals="weekly"] tbody tr')];
  assert.equal(intervals.length, 5, 'all five stored weekly intervals remain readable');
  for (const row of intervals) assert.deepEqual([...row.querySelectorAll('td')].slice(1).map(cell => cell.textContent),
    ['1,6 tỷ', '5,4 tỷ'], 'the interval table retains each platform revenue');
  const charts = [...block.querySelectorAll('figure[data-market-raw-chart]')];
  assert.equal(charts.length, 1, 'the fixture has one weekly chart');
  for (const chart of charts) {
    assert.equal(chart.querySelector('[data-engine]')?.getAttribute('data-engine'), 'flint');
    // Flint line paths, rather than the builder's claimed series count.
    assert.equal(chart.querySelectorAll('svg .mark-line path').length, 2, 'W4 chart draws two platform lines');
    assert.equal(chart.querySelectorAll('svg .mark-symbol.role-mark path[fill="#ffffff"]').length, 2,
      'the final partial interval is a hollow point on each platform line');
    assert.equal(chart.querySelectorAll('svg .mark-line path[aria-label], svg .mark-symbol.role-mark path[aria-label]').length, 0,
      'chart marks do not introduce untraced numeric aria values');
    assert.match(chart.textContent!, /Shopee/u);
    assert.match(chart.textContent!, /TikTok Shop/u);
  }
}

async function buildReader(f: ZincRun) {
  const source = await prepared(f);
  return f.service.buildReaderReport(workspaceId, f.runId, {
    contractVersion: 'reader-report-build-v1.2', requestKey: randomUUID(), metricPackageId: source.packageId,
    platforms: ['shopee', 'tiktok'], profile: sync1ReaderFixture().profile, cover: null,
    source: deriveReaderSource(verifyWebSnapshot(source.snapshot, webSnapshotDigest(source.snapshot)), 5000, { nullable: true }),
  }, { actorId: 'owner:synthetic', role: 'OWNER' });
}

test('W1 PREPARE stores manifest-verified raw bytes and hashes sanitized stored bytes', async t => {
  for (const secrets of [false, true]) {
    const f = await zincRun(t, { secrets });
    await driveUntil(f.service, () => ['PICK', 'STOPPED'].includes(autorun(f.db, f.runId)!.phase));
    assert.equal(autorun(f.db, f.runId)!.phase, 'PICK');
    const { context, manifest } = await prepared(f);
    assert.equal(context.contractVersion, 'automation-metric-capture-context-v3');
    assert.equal(context.rawResponses.length, 1);
    const ref = context.rawResponses[0]!;
    const entry = manifest.files.find((file: { path: string }) => file.path === manifest.archive.rawResponses);
    assert.ok(entry, 'the retained capture manifest names raw responses');
    assert.equal(ref.captureNumber, 1);
    assert.equal(ref.manifestSha256, entry.sha256);
    assert.equal(ref.manifestByteSize, entry.byteSize);
    assert.equal(hash(f.captures[0]!.rawBytes), entry.sha256);
    assert.equal(f.captures[0]!.rawBytes.length, entry.byteSize);
    const stored = await f.artifacts.read(ref.sha256);
    assert.equal(hash(stored), ref.sha256, 'stored digest names the actual stored bytes');
    assert.equal(stored.length, ref.byteSize);
    assert.equal(ref.stripped, secrets);
    if (secrets) {
      assert.notEqual(ref.sha256, entry.sha256);
      assert.deepEqual(JSON.parse(stored.toString()).at(-1), { nested: [{ kept: 'fixture evidence' }] },
        'account/session/token fields are removed without discarding adjacent evidence');
    } else {
      assert.deepEqual(stored, f.captures[0]!.rawBytes);
      assert.equal(ref.sha256, entry.sha256);
      assert.equal(ref.byteSize, entry.byteSize);
    }
  }
});

test('W2 tampered capture bytes or stored artifact stop the run without publishing a report', async t => {
  const capture = await zincRun(t, { tamper: true });
  await drain(capture.service);
  assert.deepEqual([autorun(capture.db, capture.runId)!.phase, autorun(capture.db, capture.runId)!.stopCode],
    ['STOPPED', 'CAPTURE_RAW_MISMATCH']);
  assert.deepEqual(await capture.service.listReportVersions(workspaceId, capture.runId), []);

  const stored = await zincRun(t);
  await driveUntil(stored.service, () => autorun(stored.db, stored.runId)!.phase === 'PICK');
  const ref = (await prepared(stored)).context.rawResponses[0]!;
  const bytes = await stored.artifacts.read(ref.sha256);
  // Same length, still JSON, different digest: a size-only guard must not pass.
  const tampered = Buffer.from(bytes.toString().replace('7900000000', '6900000000'));
  assert.equal(tampered.length, bytes.length);
  assert.notEqual(hash(tampered), ref.sha256);
  await writeFile(stored.artifacts.pathForDigest(ref.sha256), tampered);
  await drain(stored.service);
  const run = await stored.service.getRun(workspaceId, stored.runId);
  assert.equal(run.status, 'FAILED');
  assert.equal(run.steps.find(step => step.stepId === 'REPORTS')?.code, 'REPORT_RENDER_FAILED');
  assert.equal(autorun(stored.db, stored.runId)!.stopCode, 'RUN_FAILED');
  assert.deepEqual(await stored.service.listReportVersions(workspaceId, stored.runId), []);
});

test('W3 historical capture without a raw artifact retains its frozen report bytes', async () => {
  // The pre-change v1 capture is independently frozen, including its context and
  // whole-report digest. Do not derive a new expected value from the renderer.
  const legacy = JSON.parse(await readFile(new URL('../fixtures/metric-capture-legacy-v1.json', import.meta.url), 'utf8')) as {
    reportInput: AutomationReportInput; htmlSha256: string; artifacts: Array<{ metadata: { sha256: string }; text: string }>;
  };
  const capture = legacy.reportInput.metricMethods!.capture!;
  const retained = legacy.artifacts.find(artifact => artifact.metadata.sha256 === capture.contextSha256);
  assert.ok(retained, 'legacy report pins its retained capture context');
  const context = JSON.parse(retained.text);
  assert.equal(context.contractVersion, 'automation-metric-capture-context-v1');
  assert.equal(context.rawResponses, undefined, 'this fixture predates raw-artifact storage');
  assert.equal(legacy.reportInput.marketRawSeries, undefined);
  const built = buildResearchAutomationReport(legacy.reportInput, 'MARKET');
  assert.equal(hash(built.html), legacy.htmlSha256, 'the historical complete HTML byte pin stays frozen');
  assert.equal((built.semantic as Record<string, unknown>).marketRawResponses, undefined);
});

test('W4 zinc P4 KPIs and two Flint lines survive PRESENT into the stored Reader without average price', async t => {
  const f = await zincRun(t);
  await drain(f.service);
  assert.equal(autorun(f.db, f.runId)!.phase, 'DONE', JSON.stringify(await f.service.getRun(workspaceId, f.runId)));
  const built = await report(f);
  withDocument(built.bytes, assertZincBlocks);
  const receipt = await buildReader(f);
  const reader = await f.service.readReaderReport(workspaceId, f.runId, receipt.revision.revisionId);
  withDocument(reader.bytes, document => {
    const scope = document.querySelector('#phan-2 .market-capture-scope');
    assert.ok(scope, 'Reader retains the raw capture scope in its methods section');
    assert.match(scope.textContent!, /viên uống kẽm/u);
    assert.match(scope.textContent!, /Tìm trong tất cả danh mục/u);
    const scale = document.querySelector('#phan-3');
    assert.ok(scale, 'Reader has its scale section');
    // Check the persisted Reader served to the PDF path, not only the draft.
    assertZincBlocks(scale);
    assert.ok(document.querySelectorAll('#phu-luc tbody tr').length > 0, 'the coherent product sample remains published');
    assert.doesNotMatch(document.body.textContent!, /giá\s*(?:TB|(?:bán\s+)?trung bình|bình quân)/iu);
  });
});

test('W4b Reader still refuses publication when every product is excluded from the sample', async t => {
  const f = await zincRun(t, { excluded: true });
  await drain(f.service);
  assert.equal(autorun(f.db, f.runId)!.phase, 'DONE');
  await assert.rejects(() => buildReader(f), (error: unknown) => {
    assert.ok(error instanceof Error && error.cause instanceof Error);
    assert.match(error.cause.message, /^MARKET_14_RULES_FAILED:(?:\d+,)*7(?:,\d+)*$/u);
    return true;
  });
  assert.deepEqual((await f.service.listReaderReports(workspaceId, f.runId)).revisions, [], 'the failed Reader build publishes no revision');
});

test('W4 available raw interval revenues survive missing headline KPIs', async t => {
  const f = await zincRun(t, { noHeadlines: true });
  await drain(f.service);
  assert.equal(autorun(f.db, f.runId)!.phase, 'DONE');
  const built = await report(f);
  withDocument(built.bytes, document => {
    const block = document.querySelector('[data-market-raw-period="30d"]');
    assert.ok(block, 'available interval data must not silently fall back to the old report');
    assert.equal(block.querySelector('[data-kpi="revenue"] b')!.textContent, 'Chưa có số');
    assert.equal(block.querySelectorAll('figure svg .mark-line path').length, 2);
    assert.equal(block.querySelectorAll('table[data-market-raw-intervals] tbody tr').length, 5);
  });
});

test('W5 capture 2 supplies report values and artifact pointers while capture 1 stays retained', async t => {
  const f = await zincRun(t, { second: true });
  await drain(f.service);
  assert.equal(autorun(f.db, f.runId)!.phase, 'DONE', JSON.stringify(await f.service.getRun(workspaceId, f.runId)));
  assert.equal(f.captures.length, 2, 'category evidence really triggers a second capture');
  const refs = (await prepared(f)).context.rawResponses;
  assert.deepEqual(refs.map(ref => ref.captureNumber), [1, 2]);
  assert.notEqual(refs[0]!.sha256, refs[1]!.sha256, 'the two captures have different raw revenues');
  const built = await report(f);
  withDocument(built.bytes, assertZincBlocks);
  assert.equal(built.semantic.marketRawResponses.usedSha256, refs[1]!.sha256);
  assert.deepEqual(built.semantic.marketRawResponses.captures, refs.map(({ captureNumber, sha256, byteSize }) => ({ captureNumber, sha256, byteSize })));
  for (const [i, ref] of refs.entries()) {
    assert.deepEqual(await f.artifacts.read(ref.sha256), f.captures[i]!.rawBytes, `capture ${i + 1} remains stored`);
  }
  const trace = built.semantic.marketNumberTrace.entries;
  const rawEntries = trace.filter(entry => entry.blockId.startsWith('M03.30d.'));
  assert.ok(rawEntries.length > 0, 'raw report numbers have trace entries');
  const used = JSON.parse((await f.artifacts.read(refs[1]!.sha256)).toString());
  for (const entry of rawEntries) for (const input of entry.inputs) {
    assert.equal(input.captureId, refs[1]!.sha256, 'trace names the capture 2 stored artifact');
    assert.notEqual(resolveMarketRawSource(used, input), undefined, 'each trace pointer resolves inside that artifact');
  }
  const shopee = rawEntries.find(entry => entry.token === '7,9 tỷ');
  assert.ok(shopee, 'capture 2 Shopee revenue is traced');
  assert.deepEqual(shopee.inputs.map(input => resolveMarketRawSource(used, input)), [7_900_000_000]);
});

async function rebuild(f: ZincRun): Promise<Buffer> {
  // A new service and a new revision force source loading and rendering again;
  // simply rereading a previously saved HTML artifact would not test W6.
  const service = f.make();
  const previous = await report(f, service);
  const receipt = await service.requestReportRevision(workspaceId, f.runId, {
    ...buildRevisionValue({ runId: f.runId, previousPairId: previous.pair.pairId }), requestKey: randomUUID(),
  });
  await drain(service);
  assert.equal((await service.getReportRevision(workspaceId, f.runId, receipt.attemptId)).state, 'COMMITTED');
  const built = await report(f, service);
  assert.equal(built.pair.attemptId, receipt.attemptId, 'read the newly rebuilt version');
  return built.bytes;
}

async function assertW6(expected: Buffer, loader: () => Promise<Buffer>): Promise<void> {
  assert.deepEqual(await loader(), expected, 'W6 rebuilding from stored data must preserve every HTML byte');
}

test('W6 a new service rebuilds identical report HTML after the entire capture folder is removed', async t => {
  const f = await zincRun(t);
  await drain(f.service);
  const before = await report(f);
  await rm(f.capture.captureRoot, { recursive: true });
  await assertW6(before.bytes, () => rebuild(f));
  assert.equal(f.capture.calls.length, 1, 'rebuild does not recollect the source');
});

test('W6 negative control rejects a render-time loader that depends on the capture folder', async t => {
  const f = await zincRun(t);
  await drain(f.service);
  const before = await report(f);
  // This deliberately wrong loader has the forbidden filesystem dependency.
  // First prove it works while the capture exists, then use the same W6 check.
  const wrongLoader = async () => {
    await readFile(join(f.captures[0]!.dir, 'raw-responses.json'));
    return rebuild(f);
  };
  await assertW6(before.bytes, wrongLoader);
  await rm(f.capture.captureRoot, { recursive: true });
  await assert.rejects(() => assertW6(before.bytes, wrongLoader), { code: 'ENOENT' },
    'the named wrong loader fails W6 at its forbidden capture-folder read');
  await assertW6(before.bytes, () => rebuild(f));
});

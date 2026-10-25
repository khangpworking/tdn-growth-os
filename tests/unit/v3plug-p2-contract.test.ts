import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import type { KeywordListDraftTransport } from '../../src/modules/analysis/keyword-list-drafting.js';
import type { MetricCaptureSpec } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import type { AutorunScopeRecord } from '../../src/modules/analysis/research-automation/autorun-scope.js';
import { CONTEXT_PATH, SNAPSHOT_PATH } from '../../src/modules/analysis/research-automation/metric-capture-intake.js';
import { runMetricCapture } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { autorun, captureFiles, driveUntil, fixture, untilIdle, workspaceId } from '../helpers/autorun-harness.js';
import zincRaw from '../fixtures/market-raw-series/zinc-30d-dev.raw-responses.json' with { type: 'json' };

// Offline, synthetic category breakdowns and titles derived from the committed
// raw-response envelope and capture harness. No new real captures or provider calls.
// Category ids are invented; labels use the brief/code-result examples.
const health = { id: 'c1000000001', label: 'Sức Khoẻ' };
const electric = { id: 'c1000000002', label: 'Điện Gia Dụng' };
const beauty = { id: 'c1000000003', label: 'Làm Đẹp' };
const other = { id: 'c1000000004', label: 'Danh mục khác' };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

interface Scenario {
  readonly keyword: string;
  readonly productType?: string;
  readonly category: typeof health;
  readonly topPercent: number;
  readonly titles?: readonly string[];
  readonly brands?: readonly string[];
}

const zinc: Scenario = { keyword: 'viên uống kẽm', category: health, topPercent: 93 };
const fan: Scenario = { keyword: 'quạt điện', productType: 'quạt điện', category: electric, topPercent: 85 };
const lipstick: Scenario = { keyword: 'son môi', productType: 'son môi', category: beauty, topPercent: 88 };
const zincTitles = ['Viên kẽm Alpha', 'Viên kẽm Beta', 'Viên kẽm Gamma', 'Viên kẽm Delta', 'Viên kẽm Epsilon', 'Viên uống kẽm'];

function rawCapture(scenario: Scenario) {
  const raw = structuredClone(zincRaw);
  const searched = raw[1]!;
  // Keep the captured endpoint/request shape, replacing only scoped fixture data.
  const request = JSON.parse(searched.requestBody!);
  request.include_query.queries = [scenario.keyword];
  const requestBody = JSON.stringify(request);
  const aggregation = (category: typeof health, shopee: number, tiktok: number) => ({
    key: category.id, platforms: [{ platform_id: 1, value: shopee }, { platform_id: 8, value: tiktok }],
  });
  // Shopee alone prefers the other category (70%); the combined total is 1000.
  // This catches choosing the first platform, averaging shares, or omitting TikTok.
  const targetRevenue = scenario.topPercent * 10;
  const searchBody = { data: { search_basic: { aggregations: [{ aggregation: 'REVENUE__BY__CATEGORIES_CUSTOM', entities: [
    aggregation(other, 70, 930 - targetRevenue), aggregation(scenario.category, 30, targetRevenue - 30),
  ] }] } } };
  const titles = scenario.titles ?? Array.from({ length: 6 }, () => scenario.keyword);
  const products = titles.map((title, i) => ({
    product_base_id: `${i % 2 === 0 ? 1 : 8}__${101 + i}__${201 + i}`,
    product_name: title, shop_base_id: String(201 + i), revenue_custom: 1000 - i * 10, order_custom: 10,
    brand: scenario.brands?.[i] ?? `Synthetic brand ${i + 1}`,
    bee_categories: [{ id: scenario.category.id, name: scenario.category.label, level: 0 }, { id: other.id, name: other.label, level: 0 }],
  }));
  return [
    // A stale, unsearched page load must not make every product a health product.
    { ...raw[0], requestBody: JSON.stringify({ include_query: { queries: [] } }), body: { data: { search_basic: {
      aggregations: [{ aggregation: 'REVENUE__BY__CATEGORIES_CUSTOM', entities: [aggregation(health, 9999, 9999)] }],
    } } } },
    { ...searched, requestBody, body: searchBody },
    { urlPath: '/v2/market/analytics/products/', responseOrder: 10, status: 200, requestBody, body: { data: { products } } },
  ];
}

async function scopeRun(t: TestContext, scenario: Scenario, transport?: KeywordListDraftTransport) {
  const payloads: MetricCaptureSpec[] = [];
  const adapterManifest = Buffer.from('synthetic pinned adapter manifest');
  const raw = rawCapture(scenario);
  const f = await fixture(t, 'on', undefined, () => async (config, request) => runMetricCapture({
    ...config as { enabledEnv: string; captureRoot: string },
    adapterManifestPath: '/synthetic/adapter/manifest.json', adapterManifestSha256: hash(adapterManifest),
  }, request, {
    sourceEnv: {}, readManifest: async () => adapterManifest,
    createProcessRunner: () => async (_executable, argv) => {
      // Observe the actual final app-side payload, as in the P1 contract tests.
      const specPath = argv[argv.indexOf('--spec') + 1]!;
      const output = argv[argv.indexOf('--out') + 1]!;
      const spec = JSON.parse(await readFile(specPath, 'utf8')) as MetricCaptureSpec;
      payloads.push(spec);
      const base = captureFiles(request.runId, spec.period);
      const snapshot = JSON.parse(base.snapshotBytes.toString());
      snapshot.captureId += `-${payloads.length}`;
      snapshot.specDigest = hash(Buffer.from(JSON.stringify(spec)));
      snapshot.scope = { ...snapshot.scope, keywords: spec.keywords, platforms: spec.platforms, category: spec.category };
      const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
      const manifest = JSON.parse(base.manifestBytes.toString());
      manifest.captureId = snapshot.captureId;
      manifest.specDigest = snapshot.specDigest;
      manifest.appliedFilters = { ...manifest.appliedFilters, ...snapshot.scope, smartQuery: spec.smartQuery };
      manifest.files[0] = { ...manifest.files[0], sha256: hash(snapshotBytes), byteSize: snapshotBytes.length };
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'snapshot.json'), snapshotBytes);
      await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest));
      await writeFile(join(output, 'raw-responses.json'), JSON.stringify(raw));
      return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout: '[{"status":"READY"}]', stderr: '' }) };
    },
  }), undefined, {
    renderer: buildResearchAutomationReport,
    ...(transport ? { sourceEvidence: { modelIdentity: 'synthetic:model', promptVersion: 'synthetic-prompt-v1', transport } } : {}),
  });
  const receipt = await f.service.start(workspaceId, {
    contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: scenario.keyword,
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'],
    ...(scenario.productType ? { interview: { productType: scenario.productType } } : {}),
  });
  const runId = receipt.run.runId;
  return { ...f, payloads, runId,
    scope: async () => JSON.parse(await readFile(join(f.capture.captureRoot, runId, 'scope.json'), 'utf8')) as AutorunScopeRecord,
  };
}

type ScopeRun = Awaited<ReturnType<typeof scopeRun>>;

async function reach(f: ScopeRun, phase: string): Promise<void> {
  await driveUntil(f.service, () => [phase, 'STOPPED'].includes(autorun(f.db, f.runId)!.phase));
  const row = autorun(f.db, f.runId)!;
  assert.equal(row.phase, phase, `expected ${phase}, got ${row.stopCode}: ${row.stopDetail}`);
}

async function prepared(f: ScopeRun) {
  const packageId = autorun(f.db, f.runId)!.packageId;
  assert.ok(packageId, 'the automatic capture was prepared through the real intake');
  const source = await new SourcePackageService({ db: f.db, artifactStore: f.artifacts }).readVerified(packageId);
  const json = (filePath: string) => {
    const file = source.files.find(file => file.path === filePath);
    assert.ok(file, `prepared package contains ${filePath}`);
    return JSON.parse(file.bytes.toString());
  };
  return { snapshot: json(SNAPSHOT_PATH), context: json(CONTEXT_PATH) };
}

function assertCategory(spec: Pick<MetricCaptureSpec, 'category'>, expected: string, row: string): void {
  assert.equal(spec.category, expected, `${row} second capture must use the data-backed category`);
}

async function assertChosen(f: ScopeRun, scenario: Scenario, row: string): Promise<void> {
  await reach(f, 'CONFIRM');
  assert.equal(f.payloads.length, 2, 'first capture plus one second capture of the same run');
  assert.equal(f.payloads[0]!.category, null, 'capture 1 searches All');
  assertCategory(f.payloads[1]!, scenario.category.label, row);
  assert.equal(f.payloads[1]!.smartQuery, true);
  assert.deepEqual(f.payloads[1]!.keywords, [scenario.keyword]);
  const scope = await f.scope();
  assert.equal(scope.category.reason, 'DOMINANT');
  assert.equal(scope.category.top?.share, scenario.topPercent / 100);
  assert.equal(scope.category.category?.id, scenario.category.id);
  assert.equal(scope.category.shares?.platforms.shopee[0]?.id, other.id, 'combined revenue overrules Shopee alone');
  assert.equal(scope.capture2?.outcome, 'OK');
  const { snapshot } = await prepared(f);
  assert.equal(snapshot.scope.category, scenario.category.label, 'the retained report source is capture 2');
  const pickId = autorun(f.db, f.runId)!.pickId;
  assert.ok(pickId);
  const pick = JSON.parse((await f.artifacts.read(pickId)).toString());
  assert.equal(pick.scope.category.reason, 'DOMINANT', 'the pick trace retains the category decision');
}

async function assertAllWithNote(f: ScopeRun, reason: string, note: string, reportNote = note): Promise<void> {
  await reach(f, 'CONFIRM');
  assert.equal(f.payloads.length, 1, 'All is retained without another lookup');
  assert.equal(f.payloads[0]!.category, null);
  assert.equal((await f.scope()).category.reason, reason);
  const { snapshot, context } = await prepared(f);
  assert.equal(snapshot.scope.category, null);
  assert.deepEqual(context.searchScope.lines, [note], 'the prepared source carries the report note');
  // Stop at the draft, before PRESENT: this row owns the report scope note only.
  for (let i = 0; i < 100; i++) {
    const run = await f.service.getRun(workspaceId, f.runId);
    if (run.status === 'DRAFT_READY') break;
    assert.ok(!['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status), `draft stopped: ${run.status}`);
    await f.service.processNext();
    await f.service.settleAutoRunCaptures();
  }
  assert.equal((await f.service.getRun(workspaceId, f.runId)).status, 'DRAFT_READY');
  const report = await f.service.readReport(workspaceId, f.runId, 'MARKET');
  assert.ok(report.bytes.toString().includes(reportNote), 'the retained Market HTML includes the scope note');
}

test('C1 zinc-like combined health share 0.93 chooses health in the second capture', async t => {
  const f = await scopeRun(t, zinc);
  await assertChosen(f, zinc, 'C1');
  assert.equal((await f.scope()).category.interviewMatch, null, 'empty product type lets data decide');
});

test('C2 fan share 0.85 and productType quạt điện choose home-electric', async t => {
  const f = await scopeRun(t, fan);
  await assertChosen(f, fan, 'C2');
  assert.equal((await f.scope()).category.interviewMatch, true);
});

test('C3 lipstick share 0.88 and productType son môi choose beauty', async t => {
  const f = await scopeRun(t, lipstick);
  await assertChosen(f, lipstick, 'C3');
  assert.equal((await f.scope()).category.interviewMatch, true);
});

test('C4 top share 0.62 retains All and the NO_DOMINANT report note', async t => {
  const f = await scopeRun(t, { ...zinc, topPercent: 62 });
  // Existing capture-report prose spells percentages out; stored scope stays numeric.
  await assertAllWithNote(f, 'NO_DOMINANT',
    'Phạm vi: tất cả danh mục — không có danh mục nào chiếm từ 80% doanh thu.',
    'Phạm vi: tất cả danh mục — không có danh mục nào chiếm từ 80 phần trăm doanh thu.');
});

test('C5 health share 0.90 conflicts with quạt điện and retains All with INTERVIEW_MISMATCH note', async t => {
  const f = await scopeRun(t, { ...zinc, topPercent: 90, productType: 'quạt điện' });
  await assertAllWithNote(f, 'INTERVIEW_MISMATCH', 'Phạm vi: tất cả danh mục — danh mục trong dữ liệu khác loại sản phẩm đã khai.');
});

async function assertSuggestion(f: ScopeRun, term: string): Promise<void> {
  await reach(f, 'STOPPED');
  const run = await f.service.getRun(workspaceId, f.runId);
  assert.equal(run.status, 'AWAITING_SCOPE');
  assert.equal(run.autoRun?.stopCode, 'KEYWORD2_AWAITING');
  assert.equal(run.autoRun.keyword2Suggestion?.term, term);
  await untilIdle(f.service);
  assert.equal(f.payloads.length, 1, 'the suggested term waits for the owner before capture 2');
}

async function answer(f: ScopeRun, keyword2: string | null) {
  return f.service.retryAutoRunCapture(workspaceId, f.runId, {
    contractVersion: 'research-automation-autorun-keyword-v1', requestKey: randomUUID(), keyword2,
  });
}

test('K1 zinc titles mostly Viên kẽm suggest viên kẽm and capture it only after Accept', async t => {
  const f = await scopeRun(t, { ...zinc, titles: zincTitles });
  await assertSuggestion(f, 'viên kẽm');
  const chosen = (await f.scope()).keyword2.chosen;
  assert.equal(chosen?.term, 'viên kẽm');
  assert.equal(chosen.titles, 5);
  assert.equal(chosen.brands, 5);
  assert.equal(chosen.revenue, 4900);
  await answer(f, 'viên kẽm');
  await reach(f, 'CONFIRM');
  assert.deepEqual(f.payloads[1]!.keywords, ['viên uống kẽm', 'viên kẽm']);
  const { snapshot } = await prepared(f);
  assert.deepEqual(snapshot.scope.keywords, ['viên uống kẽm', 'viên kẽm'], 'the real intake admits both terms');
});

test('K2 canxi titles back the model variant calcium at 20% and three brands', async t => {
  const titles = ['Calcium Alpha', 'Calcium Beta', 'Calcium Gamma', ...Array.from({ length: 12 }, () => 'Canxi')];
  const modelInputs: Parameters<KeywordListDraftTransport['draftLists']>[0][] = [];
  const f = await scopeRun(t, { ...zinc, keyword: 'canxi', titles }, { draftLists: async input => {
    modelInputs.push(input);
    return { keywords: ['calcium', 'zinc'], exclusions: [] };
  } });
  await assertSuggestion(f, 'calcium');
  assert.equal(modelInputs.length, 1);
  assert.deepEqual(modelInputs[0]!.productNames, titles, 'the existing drafting transport receives captured titles');
  const result = (await f.scope()).keyword2;
  assert.equal(result.modelVariants, 'USED');
  assert.equal(result.chosen?.source, 'MODEL');
  assert.equal(result.chosen?.titles, 3);
  assert.equal(result.chosen?.titleShare, 0.2);
  assert.equal(result.chosen?.brands, 3);
  assert.equal(result.candidates.find(candidate => candidate.term === 'zinc')?.rejected, 'LOW_TITLE_SHARE');
  await answer(f, 'calcium');
  await reach(f, 'CONFIRM');
  assert.deepEqual(f.payloads[1]!.keywords, ['canxi', 'calcium']);
  assert.deepEqual((await prepared(f)).snapshot.scope.keywords, ['canxi', 'calcium']);
});

test('K3 a phrase occurring in only one brand is rejected despite high title share', async t => {
  const f = await scopeRun(t, { ...zinc, titles: zincTitles, brands: Array.from({ length: 6 }, () => 'Synthetic single brand') });
  await reach(f, 'CONFIRM');
  const result = (await f.scope()).keyword2;
  const phrase = result.candidates.find(candidate => candidate.term === 'viên kẽm');
  assert.ok(phrase, 'the phrase was considered, rather than silently absent');
  assert.equal(phrase.titles, 5);
  assert.equal(phrase.brands, 1);
  assert.equal(phrase.kept, false);
  assert.equal(phrase.rejected, 'FEW_BRANDS');
  assert.equal(result.chosen, null);
  assert.equal(f.payloads.length, 2);
  assert.deepEqual(f.payloads[1]!.keywords, ['viên uống kẽm']);
});

test('K4 Remove at scope confirmation runs the second capture with keyword 1 only', async t => {
  const f = await scopeRun(t, { ...zinc, titles: zincTitles });
  await assertSuggestion(f, 'viên kẽm');
  const receipt = await answer(f, null);
  assert.equal(receipt.exactRetry, false);
  await reach(f, 'CONFIRM');
  assert.equal(f.payloads.length, 2);
  assert.deepEqual(f.payloads[1]!.keywords, ['viên uống kẽm']);
  assert.equal(f.payloads[1]!.smartQuery, true);
  assert.equal(f.payloads[1]!.category, health.label);
  assert.equal((await f.scope()).keyword2.owner?.decision, 'REMOVED');
  assert.deepEqual((await prepared(f)).snapshot.scope.keywords, ['viên uống kẽm']);
});

test('C2/C3 negative control: always choosing health fails both category row assertions', () => {
  const alwaysHealth = (_raw: unknown) => ({ category: health.label });
  for (const [row, scenario] of [['C2', fan], ['C3', lipstick]] as const) {
    assert.throws(() => assertCategory(alwaysHealth(rawCapture(scenario)), scenario.category.label, row), {
      code: 'ERR_ASSERTION', message: new RegExp(`${row} second capture must use the data-backed category`),
    });
  }
});

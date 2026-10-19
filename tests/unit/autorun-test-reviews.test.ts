import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { researchAutomationProviderConfigFromEnv } from '../../src/modules/analysis/research-automation/providers.js';
import { buildConfirmValue } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { buildResearchAutomationReport, marketSourceRows, marketSourceTypes } from '../../src/modules/analysis/research-automation/reports.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { ApifyShopeeCollector, FixtureShopeeCollector, shopeeActorInputSha256, type ShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { autorun, captureFiles, drain, fixture, rewindStartKey, startRun, workspaceId } from '../helpers/autorun-harness.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';

const baseEnv = { TDN_APIFY_TOKEN: 'synthetic-not-a-live-token', TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '1', TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: '20' };
const confirmInput = { runId: workspaceId, expectedRevision: 1, keyword: 'synthetic', includeTerms: ['synthetic'],
  principalProductIds: ['synthetic-card'], exactShopeeUrls: ['https://shopee.vn/product/201/101'], packageId: workspaceId };
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

function fakeCollector(counts: readonly number[], cap = 20) {
  const calls: string[][] = [];
  const collector: ShopeeCollector = { mode: 'live', maxReviewsPerProduct: cap,
    async collect(selected, requestSha, runKey, signal) {
      calls.push(selected.map(row => row.productUrl));
      const rows = selected.flatMap((listing, i) => Array.from({ length: counts[i] ?? cap }, (_, n) => ({
        shopId: listing.shopId, itemId: listing.itemId, reviewId: `${listing.itemId}-${n}`, comment: 'Synthetic source text', ratingStar: 4,
      })));
      const result = await new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows))).collect(selected, requestSha, runKey, signal);
      return { ...result, mode: 'live', actor: { ...result.actor, runId: 'SYNTHETIC_RUN', datasetId: 'SYNTHETIC_DATASET', status: 'SUCCEEDED', retrievedAt: '2026-02-01T00:00:00.000Z',
        settings: { ...result.actor.settings, maxReviewsPerProduct: cap, maxChargeUsd: 1 },
        inputSha256: shopeeActorInputSha256(selected, cap), stopReason: 'collection_limit_reached' as const } };
    } };
  return { calls, factory: () => ({ collector, requestsIssued: () => calls.length }) };
}

test('test review opt-in requires exactly 1, a configured collector and an explicit cap at most 20', () => {
  for (const env of [{}, baseEnv, { ...baseEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: 'true' },
    { TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' },
    { TDN_APIFY_TOKEN: baseEnv.TDN_APIFY_TOKEN, TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '1', TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' },
    ...['21', '50', '51', '300', '500'].map(cap => ({ ...baseEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1', TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: cap }))]) {
    const config = researchAutomationProviderConfigFromEnv(env);
    assert.equal(config.autorunTestReviewCap, undefined);
    const built = buildConfirmValue({ ...confirmInput, ...(config.autorunTestReviewCap !== undefined ? { testReviewCap: config.autorunTestReviewCap } : {}) });
    assert.ok(built.ok); assert.equal(built.value.sources.nativeReview, 'SKIP');
  }
  for (const cap of ['1', '19', '20']) {
    const config = researchAutomationProviderConfigFromEnv({ ...baseEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1', TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: cap });
    assert.equal(config.autorunTestReviewCap, Number(cap));
    const built = buildConfirmValue({ ...confirmInput, testReviewCap: config.autorunTestReviewCap! });
    assert.ok(built.ok); assert.deepEqual(built.value.sources.nativeReview, { decision: 'COLLECT_EXACT_TEST', maxReviewsPerProduct: Number(cap) });
  }
});

test('flag absent: configured collector stays unused and Market report bytes equal the original SKIP path', async t => {
  const fake = fakeCollector([20, 20, 20]);
  const original = await fixture(t);
  const configured = await fixture(t, 'on', undefined, undefined, { factory: fake.factory });
  const a = await startRun(original.service); rewindStartKey();
  const b = await startRun(configured.service);
  await drain(original.service); await drain(configured.service);
  assert.equal((configured.service.confirms[0] as any).sources.nativeReview, 'SKIP');
  assert.equal(fake.calls.length, 0);
  const first = await original.service.readReport(workspaceId, a, 'MARKET', false, (await original.service.listReportVersions(workspaceId, a)).at(-1)!.pairId);
  const second = await configured.service.readReport(workspaceId, b, 'MARKET', false, (await configured.service.listReportVersions(workspaceId, b)).at(-1)!.pairId);
  assert.deepEqual(second.bytes, first.bytes);
});

for (const counts of [[20, 20, 20], [20, 7, 0], [0, 0, 0]]) test(`Market-only auto-run collects exact trial sample ${counts.join(',')} and passes reader gates`, async t => {
  const fake = fakeCollector(counts);
  const config = researchAutomationProviderConfigFromEnv({ ...baseEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' });
  const f = await fixture(t, 'on', undefined, undefined, { factory: fake.factory, cap: config.autorunTestReviewCap! });
  const runId = await startRun(f.service); await drain(f.service);
  assert.equal(autorun(f.db, runId)?.phase, 'DONE');
  const run = await f.service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY'); assert.deepEqual(run.reports, ['MARKET']);
  const body = f.service.confirms[0] as any;
  assert.deepEqual(body.sources.nativeReview, { decision: 'COLLECT_EXACT_TEST', maxReviewsPerProduct: 20 });
  assert.deepEqual(fake.calls, [body.exactShopeeUrls]);
  assert.equal(fake.calls[0]!.length, 3);
  const source = f.db.prepare('SELECT source_set_sha256 sha FROM analysis_research_automation_source_sets WHERE run_id=?').get(runId) as { sha: string };
  const readJson = async (sha: string) => JSON.parse(await fs.readFile(path.join(f.artifactRoot, 'sha256', sha.slice(0, 2), sha), 'utf8'));
  assert.deepEqual((await readJson(source.sha)).nativeReview, { decision: 'NONE' });
  const step = f.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { sha: string };
  const collection = await readJson(step.sha) as StepResultDocument;
  assert.ok(collection.exactShopee); assert.equal(collection.nativeReview, undefined);
  assert.deepEqual(collection.exactShopeeOutcome?.listings.map(row => row.reviews), counts);
  assert.equal(collection.exactShopeeOutcome?.outcome, counts.every(n => n === 20) ? 'OK' : counts.some(n => n > 0) ? 'PARTIAL_LISTINGS' : 'PROVIDER_BLOCKED');
  assert.deepEqual(collection.exactShopeeOutcome?.listings.map(row => row.shortfallReason), counts.map(n => n < 20 ? 'RETURNED_COUNT_BELOW_REQUESTED' : undefined));
  const coverage = collection.coverage.find(row => row.provider === 'apify-shopee')!;
  assert.equal(coverage.state, counts.every(n => n === 20) ? 'COLLECTED' : 'PARTIAL');
  assert.equal(coverage.truncated, !counts.every(n => n === 20));
  // Reading re-verifies the scope, retained collection, summary and presentation: no integrity error.
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId);
  const html = report.bytes.toString('utf8');
  assert.match(html, /mẫu thử nhỏ, tối đa 20 đánh giá mỗi sản phẩm, được thu cho báo cáo thử nghiệm/u);
  assert.match(html, /Mẫu này không đại diện cho toàn bộ đánh giá/u);
  if (counts.some(n => n === 20)) assert.match(html, /Đã thu đủ giới hạn thử 20 đánh giá/u);
  else { assert.match(html, /Chưa thu được đánh giá/u); assert.doesNotMatch(html, /Đã thu đủ giới hạn thử/u); }
  if (counts[1] === 7) { assert.match(html, /Chỉ thu được 7 đánh giá, ít hơn giới hạn thử 20/u); assert.match(html, /Chưa thu được đánh giá/u); }
  const sample = html.match(/<div class="test-review-sample">[\s\S]*?<\/div>/u)![0];
  assert.doesNotMatch(sample.replace(/<[^>]*>/gu, ''), /\/300|%|\b0\b|apify|zen-studio|Google/iu);
  assert.doesNotMatch(html, /\/300/u);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  const rules = auditMarket14(html);
  assert.equal(rules.length, 14); assert.deepEqual(rules.filter(rule => rule.kind === 'machine' && !rule.ok), []);
  assert.deepEqual(rules.filter(rule => rule.kind === 'evidence').map(rule => rule.rule), ['6', '8', '10', '14'], 'human evidence reads remain explicit, including the unconfigured cover');
  // Exercise the production reader context through the retained capture source,
  // then replay solely from the frozen reader record (no current run evidence).
  const readerSnapshot: unknown = JSON.parse(captureFiles(runId).snapshotBytes.toString());
  const readerRequest = { contractVersion: 'reader-report-build-v1.2', requestKey: randomUUID(),
    metricPackageId: body.sources.metric.packageId, platforms: ['shopee'], profile: sync1ReaderFixture().profile, cover: null,
    source: deriveReaderSource(verifyWebSnapshot(readerSnapshot, webSnapshotDigest(readerSnapshot)), 5000, { nullable: true }) };
  const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
  const built = await f.service.buildReaderReport(workspaceId, runId, readerRequest, owner);
  const reader = await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId);
  const readerSample = reader.bytes.toString().match(/<div class="test-review-sample">[\s\S]*?<\/div>/u)![0];
  const plain = (value: string) => value.replace(/<sup class="cite">[\s\S]*?<\/sup>/gu, '').replace(/<[^>]*>/gu, '').replace(/\s+/gu, ' ').trim();
  assert.equal(plain(readerSample), plain(sample));
  assert.doesNotThrow(() => assertMarketBusinessGate(reader.bytes.toString(), { presentation: false }));
  const recordRow = f.db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { sha: string };
  const record = await readJson(recordRow.sha);
  assert.deepEqual(record.testReviewSample.collection, { exactShopee: collection.exactShopee, exactShopeeOutcome: collection.exactShopeeOutcome });
  assert.deepEqual(record.testReviewSample.scope, { testReviewCap: 20 });
  const replay = await buildMarketReport(computeReaderReportData(record.input), { limitations: record.limitations, builtOn: '01/02/2026',
    flint: false, webResults: record.webResults, captureSource: true, testReviewSample: record.testReviewSample,
    captureRowPolicy: record.captureRowPolicy, captureExcludedRows: record.captureExcludedRows });
  assert.equal(replay.html, reader.bytes.toString());
  const restarted = f.make();
  assert.deepEqual((await restarted.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes, reader.bytes);
  assert.deepEqual(await restarted.buildReaderReport(workspaceId, runId, readerRequest, owner), { ...built, exactRetry: true });
  assert.equal(fake.calls.length, 1, 'presentation never collects again');
});

test('injected flag without collector, missing cap or production cap keeps the original SKIP', async t => {
  for (const options of [{ cap: 20 }, { factory: fakeCollector([20]).factory }, { cap: 21, factory: fakeCollector([20]).factory }, { cap: 300, factory: fakeCollector([20]).factory }]) {
    const f = await fixture(t, 'on', undefined, undefined, options);
    const runId = await startRun(f.service); await drain(f.service);
    assert.equal((f.service.confirms[0] as any).sources.nativeReview, 'SKIP');
    assert.equal(autorun(f.db, runId)?.phase, 'DONE');
  }
});


test('collector cap drift cannot dispatch a production collection through trial confirmation', async t => {
  const fake = fakeCollector([20, 20, 20], 300);
  const f = await fixture(t, 'on', undefined, undefined, { factory: fake.factory, cap: 20 });
  const runId = await startRun(f.service); await drain(f.service);
  assert.deepEqual((f.service.confirms[0] as any).sources.nativeReview, { decision: 'COLLECT_EXACT_TEST', maxReviewsPerProduct: 20 });
  assert.equal(fake.calls.length, 0, 'cap is checked before collection');
  const run = await f.service.getRun(workspaceId, runId);
  assert.ok(run.coverage.sources.some(row => row.provider === 'apify-shopee' && row.state === 'FAILED'));
});

test('frozen default report digests from the base commit remain unchanged (Market and Insight)', async () => {
  const input = await fullMarket14Input();
  const market = buildResearchAutomationReport(input, 'MARKET');
  // Reader and trace bytes re-pinned for the intended Market reader inventory/peer wording and descriptive reader copy (M05/M06/M07/M09) the plain owner copy for periods, peers and ads, and the per-platform Phần 11 and dated Phần 12 proposals. Reader dates/terms are localized while source quotes stay verbatim.
  assert.equal(digest(market.html), '864d022a9e285d70cfe7b509eb372dcd5b5a599db0ebc4f53fdc7ee97b32aa25');
  // Against 21d0909a this fixture changes M04.title, M10.explanation and the M11/M12 proposal state and explanation; it has no default-peer rule to exercise M07.
  assert.equal(digest(canonicalJson(market.semantic)), 'f0848a6b8ed0a967ed928caff7a6b47f8b2e83790df4ca4f7f9c3f9c26b44fc4');
  assert.equal(digest(market.traceHtml!), 'fda1a3ddd806e5b763af8057e434068982088c35b09cba4c556a82f4a72504c5');
  const insight = buildResearchAutomationReport(input, 'INSIGHT');
  assert.equal(digest(insight.html), '7163940cc6c424f6c1a2fc73c7af9458e1a50d3957adaa8d43802a8caf6ba08d');
  assert.equal(digest(canonicalJson(insight.semantic)), '21c5fa1d4be2b577cc196d0508e84342b0953f1a16ed6505eccbb784b8f05294');
});

test('source table describes the exact trial sample without depending on an Insight corpus', async () => {
  const input = await fullMarket14Input();
  const trial = { ...input, scope: { ...input.scope, testReviewCap: 20 }, collection: { ...input.collection!,
    exactShopee: { collectionId: 'synthetic', collectionSha256: 'a'.repeat(64), requestSha256: 'b'.repeat(64) },
    exactShopeeOutcome: { outcome: 'OK' as const, testReviewCap: 20, listings: [{ listingUrl: confirmInput.exactShopeeUrls[0]!, reviews: 20 }], attemptedAt: '2026-02-01T00:00:00Z', providerMessage: null, reused: false } } };
  assert.equal(trial.reviewCorpus, undefined);
  assert.match(marketSourceRows(trial, 0, false).find(([label]) => label === 'Dữ liệu đánh giá sản phẩm trên nền tảng')![1], /mẫu thử Shopee, tối đa 20/u);
  assert.equal(marketSourceTypes(trial, 0, []).used.filter(label => /đánh giá|bình luận/u.test(label)).length, 1);
  const { marketPresentation: _presentation, ...draft } = trial;
  for (const reportInput of [trial, draft]) {
    const html = buildResearchAutomationReport(reportInput, 'MARKET').html.toString();
    const sample = html.match(/<div class="test-review-sample">[\s\S]*?<\/div>/u)![0].replace(/<[^>]*>/gu, '');
    assert.match(sample, /Mẫu này không đại diện cho toàn bộ đánh giá/u);
    assert.doesNotMatch(sample, /%|\b0\b|apify|zen-studio|Metric|Kalodata|Google/iu);
    const empty = { ...reportInput, collection: { ...reportInput.collection, exactShopeeOutcome: {
      ...reportInput.collection.exactShopeeOutcome, outcome: 'PROVIDER_BLOCKED' as const,
      listings: [{ listingUrl: confirmInput.exactShopeeUrls[0]!, reviews: 0 }] } } };
    const emptyHtml = buildResearchAutomationReport(empty, 'MARKET').html.toString();
    const emptySample = emptyHtml.match(/<div class="test-review-sample">[\s\S]*?<\/div>/u)![0].replace(/<[^>]*>/gu, '');
    assert.match(emptySample, /Chưa thu được đánh giá/u);
    assert.doesNotMatch(emptySample, /%|\b0\b|apify|zen-studio|Metric|Kalodata|Google/iu);
    assert.equal(marketSourceTypes(empty, 0, []).used.some(label => /đánh giá|bình luận/u.test(label)), false);
  }
});

test('trial configuration leaves paired reports on SKIP and Insight bytes unchanged', async t => {
  const fake = fakeCollector([20, 20, 20]);
  const f = await fixture(t, 'on', undefined, undefined, { factory: fake.factory, cap: 20 });
  const baseline = await fixture(t);
  const request = { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET', 'INSIGHT'] };
  const started = await f.service.start(workspaceId, request);
  await baseline.service.start(workspaceId, request);
  const runId = started.run.runId;
  await drain(f.service); await drain(baseline.service);
  assert.equal((f.service.confirms[0] as any).sources.nativeReview, 'SKIP');
  const pair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  const before = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  const baselinePair = (await baseline.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.deepEqual(before.bytes, (await baseline.service.readReport(workspaceId, runId, 'INSIGHT', false, baselinePair.pairId)).bytes);
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1',
    requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } });
  await drain(f.service);
  const revised = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.notEqual(revised.pairId, pair.pairId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, revised.pairId);
  const semantic = JSON.parse(await fs.readFile(path.join(f.artifactRoot, 'sha256', report.versionId.slice(0, 2), report.versionId), 'utf8'));
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v19');
  assert.equal(fake.calls.length, 0);
});

test('owner confirmation cannot enable a trial without its configuration or for Insight', async t => {
  const fake = fakeCollector([20]);
  for (const [autoRun, options, reports, cap] of [
    ['on', { factory: fake.factory }, ['MARKET'], 20],
    ['on', { cap: 20 }, ['MARKET'], 20],
    ['off', { factory: fake.factory, cap: 20 }, ['MARKET'], 20],
    ['on', { factory: fake.factory, cap: 20 }, ['MARKET'], 19],
    ['on', { factory: fake.factory, cap: 21 }, ['MARKET'], 21],
    ['on', { factory: fake.factory, cap: 20 }, ['INSIGHT'], 20],
    ['on', { factory: fake.factory, cap: 20 }, ['MARKET', 'INSIGHT'], 20],
  ] as const) {
    const f = await fixture(t, autoRun, undefined, undefined, options);
    const { run } = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
      mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports });
    await f.service.processNext();
    const awaiting = await f.service.getRun(workspaceId, run.runId);
    const before = f.db.prepare('SELECT total_changes() n').get();
    await assert.rejects(f.service.confirmScope(workspaceId, run.runId, { contractVersion: 'research-automation-confirm-v2',
      requestKey: randomUUID(), expectedRevision: awaiting.revision, definition: 'Synthetic trial', includeTerms: [], excludeTerms: [],
      selectedProductIds: [], peerProductIds: [], exactShopeeUrls: confirmInput.exactShopeeUrls,
      sources: { metric: { decision: 'ABSENT' }, nativeReview: { decision: 'COLLECT_EXACT_TEST', maxReviewsPerProduct: cap } } }),
    /Trial reviews require|Invalid source-bound scope confirmation/);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  }
  assert.equal(fake.calls.length, 0);
});

test('trial restart and collection replay preserve the real collector cap and a single paid POST', async t => {
  let posts = 0, requests = 0, journalRoot = '';
  let rows: object[] = [];
  const transport: typeof fetch = async (urlLike, init) => {
    requests++;
    const url = new URL(String(urlLike));
    if (init?.method === 'POST') {
      posts++;
      assert.equal(url.searchParams.get('maxTotalChargeUsd'), '1');
      const input = JSON.parse(String(init.body));
      assert.equal(input.maxReviewsPerProduct, 20);
      assert.ok(input.startUrls.length > 0 && input.startUrls.length <= 5);
      rows = input.startUrls.flatMap((entry: { url: string }) => {
        const [, shopId, itemId] = new URL(entry.url).pathname.match(/\/product\/(\d+)\/(\d+)/)!;
        return Array.from({ length: 20 }, (_, n) => ({ shopId, itemId, reviewId: `${itemId}-${n}`, comment: 'Synthetic source text' }));
      });
      return Response.json({ data: { id: 'TrialRun', defaultDatasetId: 'TrialDataset', status: 'SUCCEEDED', usageTotalUsd: 0 } });
    }
    assert.match(url.pathname, /\/datasets\/TrialDataset\/items$/);
    const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
    return Response.json(rows.slice(offset, offset + limit), { headers: { 'x-apify-pagination-total': String(rows.length) } });
  };
  const factory = () => ({ collector: new ApifyShopeeCollector({ token: 'synthetic-token', maxChargeUsd: 1,
    maxReviewsPerProduct: 20, journalRoot, fetch: transport, contentFilter: 'all' }), requestsIssued: () => requests });
  const f = await fixture(t, 'on', undefined, undefined, { factory, cap: 20 });
  journalRoot = path.join(f.root, 'journal');
  const runId = await startRun(f.service);
  f.service.hangAfterConfirm = true;
  for (let i = 0; i < 50; i++) {
    const moved = await Promise.race([f.service.processNext(), f.service.hung]);
    if (moved === 'hung') break;
    if (!moved) await f.service.settleAutoRunCaptures();
  }
  assert.equal(posts, 0);
  assert.equal(f.service.confirms.length, 1);
  const restarted = f.make();
  await restarted.recoverOnStart(); await drain(restarted);
  assert.equal(autorun(f.db, runId)?.phase, 'DONE');
  assert.equal(posts, 1);
  const requestsBeforeRead = requests;
  for (const pair of await restarted.listReportVersions(workspaceId, runId))
    await restarted.readReport(workspaceId, runId, 'MARKET', false, pair.pairId);
  await restarted.recoverOnStart(); await drain(restarted);
  assert.equal(requests, requestsBeforeRead);
  assert.equal(posts, 1);
});

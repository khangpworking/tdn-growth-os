import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { researchAutomationProviderConfigFromEnv } from '../../src/modules/analysis/research-automation/providers.js';
import { buildConfirmValue } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { buildResearchAutomationReport, marketSourceRows } from '../../src/modules/analysis/research-automation/reports.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { FixtureShopeeCollector, shopeeActorInputSha256, type ShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { autorun, drain, fixture, rewindStartKey, startRun, workspaceId } from '../helpers/autorun-harness.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

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

test('test review opt-in requires exactly 1, a configured collector and an explicit cap at most 50', () => {
  for (const env of [{}, baseEnv, { ...baseEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: 'true' },
    { TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' },
    { TDN_APIFY_TOKEN: baseEnv.TDN_APIFY_TOKEN, TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '1', TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' },
    ...['51', '300', '500'].map(cap => ({ ...baseEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1', TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: cap }))]) {
    const config = researchAutomationProviderConfigFromEnv(env);
    assert.equal(config.autorunTestReviewCap, undefined);
    const built = buildConfirmValue({ ...confirmInput, ...(config.autorunTestReviewCap !== undefined ? { testReviewCap: config.autorunTestReviewCap } : {}) });
    assert.ok(built.ok); assert.equal(built.value.sources.nativeReview, 'SKIP');
  }
  for (const cap of ['1', '20', '50']) {
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
  assert.equal(fake.calls.length, 1, 'presentation never collects again');
});

test('injected flag without collector, missing cap or production cap keeps the original SKIP', async t => {
  for (const options of [{ cap: 20 }, { factory: fakeCollector([20]).factory }, { cap: 51, factory: fakeCollector([20]).factory }, { cap: 300, factory: fakeCollector([20]).factory }]) {
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
  assert.equal(digest(market.html), '5287d313c0575914044ee6237bd401daac2a3f56bc1b7f1e4acd266b934ced8a');
  // Frozen from the archived, unmodified base renderer at 30f35dfe.
  assert.equal(digest(canonicalJson(market.semantic)), '9a65613c430df3db8cc1bec00e94fff95c157524ce50e02772e2f758d6afdeb8');
  assert.equal(digest(market.traceHtml!), 'cb7b409dbf692d4cad5840bdfeef6a6a2a91f407fc9413fdbaa077688f9c6d0a');
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
});

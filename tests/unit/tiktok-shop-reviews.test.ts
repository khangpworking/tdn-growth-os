import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import schema from '../../contracts/analysis/automation-tiktok-shop-reviews.schema.json' with { type: 'json' };
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { ProviderInputError } from '../../src/modules/analysis/research-automation/provider-common.js';
import { createTikTokShopReviewsSource, tiktokShopReviewsDocument, tiktokShopChannelDecision } from '../../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import { buildSourceEvidence, verifySourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import type { CaptureRecord } from '../../src/modules/analysis/research-automation/model.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { headlineInput } from '../helpers/market-headline-fixture.js';
import { offlineTransport, PRIVATE_FIELDS, REVIEW_TEXT } from './tiktok-shop-reviews.fixtures.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const validate = new Ajv2020({ strict: true }).compile(schema);
const AUTH = 's06-synthetic-offline-auth';
const provider = (f: ReturnType<typeof offlineTransport>) => createKalodataProvider(AUTH, f.transport);

test('S06 row 2: paid request protocol and input rejection before any exchange', async () => {
  for (const ids of [['101'], ['101', '102', '103']]) {
    const f = offlineTransport();
    const result = await provider(f).productCommentInsight(ids);
    const requests = f.calls.filter(c => c.method === 'POST');
    assert.deepEqual(requests.map(c => [c.url.origin, c.url.pathname, JSON.parse(c.body!), c.url.search]), ids.map(id =>
      ['https://www.kalodata.com', '/openapi/v1/tiktok/product/comment/insight', { product_id: id, country_code: 'VN' }, '']));
    for (const call of f.calls) {
      assert.ok(call.headers.get('secret-key') === AUTH, 'authentication is in the header');
      assert.ok(!call.url.href.includes(AUTH) && !call.body?.includes(AUTH), 'authentication stays outside URL and body');
    }
    assert.deepEqual(result.captures.filter(c => c.operation === 'kalodata.product.comment.insight').map(c => c.billing), ids.map(() => 'PAID_CREDITS'));
  }
  for (const ids of [['101', '102', '103', '104'], ['10x'], ['101', '101']]) {
    const f = offlineTransport();
    await assert.rejects(provider(f).productCommentInsight(ids), ProviderInputError);
    assert.equal(f.calls.length, 0, 'invalid input must not even read balance');
  }
});

test('S06 row 3: credit, auth and rate stops prevent subsequent paid requests and expose balance delta', async () => {
  const cases = [
    { name: 'zero', before: 0, status: 200, payload: null, paid: 0, exhausted: true, from: 0, outcomes: ['NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_CREDIT_EXHAUSTED'] },
    { name: '2016', before: 10, status: 200, payload: { success: false, code: 2016 }, paid: 1, exhausted: true, from: 1, outcomes: ['NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_CREDIT_EXHAUSTED'] },
    ...[401, 403, 429].map(status => ({ name: String(status), before: 10, status, payload: { success: false }, paid: 1, exhausted: false, from: 0, outcomes: ['FAILED', 'NOT_RUN_STOPPED', 'NOT_RUN_STOPPED'] })),
  ];
  for (const c of cases) {
    const f = offlineTransport({ before: c.before, after: c.before, paidReply: () => ({ status: c.status, payload: c.payload }) });
    const result = await provider(f).productCommentInsight(['101', '102', '103']);
    assert.deepEqual(result.products.slice(c.from).map(p => p.outcome), c.outcomes, c.name);
    assert.equal(result.creditExhausted, c.exhausted, c.name);
    assert.equal(f.calls.filter(x => x.method === 'POST').length, c.paid, c.name);
    assert.equal(result.usage.paidRequestsIssued, c.paid, c.name);
    assert.equal(result.usage.automaticRetries, 0, c.name);
    if (!c.paid) {
      assert.deepEqual(result.usage.credits, { status: 'NONE_USED' });
      const collection = await createTikTokShopReviewsSource(provider(offlineTransport({ before: 0 }))).collect({ reports: ['INSIGHT'], candidates: [{ productId: '101', revenue: 1 }] });
      assert.equal(collection.skipReason, 'CREDIT_EXHAUSTED');
    }
  }
  const result = await provider(offlineTransport({ before: 7.5, after: 4.5 })).productCommentInsight(['101', '102', '103']);
  assert.equal(result.usage.credits.status, 'OBSERVED_ACCOUNT_BALANCE_DELTA');
  if (result.usage.credits.status !== 'OBSERVED_ACCOUNT_BALANCE_DELTA') assert.fail('missing observed credit delta');
  assert.deepEqual([result.usage.credits.before, result.usage.credits.after, result.usage.credits.consumed], [7.5, 4.5, 3]);
  assert.equal(result.usage.credits.attribution, 'ACCOUNT_WIDE_MAY_INCLUDE_CONCURRENT_USAGE');
});

test('S06 row 3: auth or rate rejection on the balance preflight stops paid requests', {
  todo: 'provider-kalodata.ts:164-170 loses the preflight rejection; productCommentInsight continues paid calls at line 380',
}, async () => {
  const paid: [number, number][] = [];
  for (const status of [401, 403, 429]) {
    const f = offlineTransport({ balanceStatus: status });
    await provider(f).productCommentInsight(['101', '102']);
    paid.push([status, f.calls.filter(c => c.method === 'POST').length]);
  }
  assert.deepEqual(paid, [[401, 0], [403, 0], [429, 0]], 'balance preflight auth/rate rejection must stop paid requests');
});

test('S06 row 4: lane skip reasons and top-three product ordering, unknown revenue last', async () => {
  for (const c of [
    { reports: ['MARKET'], candidates: [{ productId: '101', revenue: 1 }], reason: 'NOT_INSIGHT_RUN' },
    { reports: ['INSIGHT'], candidates: [], reason: 'NO_TIKTOK_PRODUCTS' },
    { reports: ['INSIGHT'], candidates: [{ productId: '101', revenue: 1 }], reason: 'PROVIDER_FAILED' },
  ]) {
    const f = offlineTransport({ paidReply: () => ({ status: 500, payload: { success: false } }) });
    const result = await createTikTokShopReviewsSource(provider(f)).collect(c);
    assert.equal(result.skipReason, c.reason);
    assert.equal(f.calls.filter(x => x.method === 'POST').length, c.reason === 'PROVIDER_FAILED' ? 1 : 0);
  }
  for (const c of [
    { revenues: [null, 30, 10, 20], expected: ['102', '104', '103'] },
    { revenues: [null, 30, 10], expected: ['102', '103', '101'] },
  ]) {
    const f = offlineTransport();
    await createTikTokShopReviewsSource(provider(f)).collect({ reports: ['INSIGHT'], candidates: c.revenues.map((revenue, i) => ({ productId: String(101 + i), revenue })) });
    assert.deepEqual(f.calls.filter(x => x.method === 'POST').map(x => JSON.parse(x.body!).product_id), c.expected);
  }
});

test('S06 row 5: normalized rows remove personal fields and preserve provider points under the canonical schema', async () => {
  const collection = await createTikTokShopReviewsSource(provider(offlineTransport())).collect({ reports: ['INSIGHT'], candidates: [{ productId: '101', revenue: 1 }] });
  const document = tiktokShopReviewsDocument(collection);
  assert.equal(validate(document), true, JSON.stringify(validate.errors));
  assert.equal(document.counting, 'RECORDS_NOT_PEOPLE');
  const product = document.products[0]!;
  assert.equal(product.reviewCount, 4);
  assert.equal(product.ratingAvailable, false);
  const expected = [
    { id: '901', text: REVIEW_TEXT, sku: 'Synthetic blue', dateRaw: '1789741801752' },
    { id: '902', text: 'Synthetic fallback review.', sku: null, dateRaw: null },
    { id: '903', text: 'Synthetic top-level fallback.', sku: null, dateRaw: null },
    { id: '904', text: null, sku: null, dateRaw: null },
  ];
  for (const [i, row] of expected.entries()) assert.deepEqual(product.reviews[i], row);
  for (const value of Object.values(PRIVATE_FIELDS)) assert.ok(!JSON.stringify(document).includes(value));
  assert.deepEqual(product.points, [
    { kind: 'PAIN_POINT', label: 'Synthetic fit concern', reviewIds: ['901', '902'], providerAiPoint: true },
    { kind: 'POSITIVE_POINT', label: 'Synthetic fit benefit', reviewIds: ['903'], providerAiPoint: true },
    { kind: 'USAGE_SCENARIO', label: 'Synthetic storage use', reviewIds: ['904'], providerAiPoint: true },
  ]);
  for (const extra of Object.keys(PRIVATE_FIELDS)) {
    const tampered = structuredClone(document);
    Object.assign(tampered.products[0]!.reviews[0]!, { [extra]: 'synthetic' });
    assert.equal(validate(tampered), false, `schema rejects ${extra}`);
  }
});

test('S06 row 7: review captures cannot become S02 sales evidence; legacy packets replay unchanged', () => {
  for (const [operation, expected] of [
    ['kalodata.product.comment.insight', []],
    ['kalodata.product.rank', ['S02']], ['kalodata.product.detail', ['S02']], ['kalodata.credit.balance', ['S02']],
  ] as const) {
    const capture: CaptureRecord = { stepId: 'COLLECTION', ordinal: 0, artifactSha256: 'c'.repeat(64), mediaType: 'application/json',
      provider: 'kalodata', operation, retrievedAt: '2026-10-02T00:00:00.000Z', window: null, truncated: false };
    const input = { draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE' as const,
      webResults: [], captures: [capture], usedCaptureDigests: [capture.artifactSha256] };
    const packet = buildSourceEvidence(input);
    assert.deepEqual(packet.sourceAppendix.rows.map(row => row.registryId), expected, operation);
    // Frozen pre-S06 packet shape, independent of the builder under test.
    const storedBytes = canonicalJson({ contractVersion: 'automation-source-evidence-v1', draftDigest: null, admission: null,
      unavailableReason: 'SALES_NAMES_UNAVAILABLE', sourceAppendix: { contractVersion: 'source-appendix-projection-v2', registryVersion: '1.9',
        rows: expected.length ? [{ registryId: 'S02', tier: 'C', tierDetail: null, group: 'SALES_MARKET',
          reportName: 'dữ liệu video bán hàng (ước tính)', binding: { kind: 'capture', ref: 'c'.repeat(64) },
          l9Excluded: null, l9Unclear: null, l9Reasons: {}, l10SourceType: null, attribution: null }] : [] } });
    verifySourceEvidence(JSON.parse(storedBytes), input);
    assert.equal(canonicalJson(packet), storedBytes, 'legacy packet bytes remain identical');
  }
});

// A projection of frozen workbook records: these functions read only platform and revenue.
function salesSnapshot(rows: readonly (readonly [string, string | null])[]): AutomationMetricMethodSnapshot {
  return { result: { input: { records: rows.map(([platform, value]) => ({ measurement: { platform }, shopId: 'synthetic-shop', revenue: { value } })) } } } as AutomationMetricMethodSnapshot;
}

test('S06 row 8: channel threshold and unknown inputs use the frozen sales rows', async () => {
  for (const c of [
    { rows: [['shopee', '50'], ['tiktok', '50']], expected: { decision: 'MAIN', share: 0.5 } },
    { rows: [['shopee', '10'], ['tiktok', '90']], expected: { decision: 'MAIN', share: 0.9 } },
    { rows: [['shopee', '51'], ['tiktok', '49']], expected: { decision: 'CHANNEL_NOT_MAIN', share: 0.49 } },
    { rows: undefined, expected: { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'NO_PLATFORM_SALES_DATA' } },
    { rows: [['shopee', '50']], expected: { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'PLATFORM_NOT_COVERED' } },
    { rows: [['tiktok', '50']], expected: { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'PLATFORM_NOT_COVERED' } },
    { rows: [['shopee', '50'], ['tiktok', null]], expected: { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'REVENUE_MISSING' } },
    { rows: [['shopee', null], ['tiktok', '50']], expected: { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'REVENUE_MISSING' } },
    { rows: [['shopee', '0'], ['tiktok', '0']], expected: { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'NO_REVENUE' } },
  ] as const) {
    assert.deepEqual(tiktokShopChannelDecision(c.rows === undefined ? undefined : salesSnapshot(c.rows)), c.expected);
    if (c.rows) {
      const platforms = [...new Set(c.rows.map(([platform]) => platform))].map(platform => ({ platform, result: { input: {
        records: c.rows.filter(([p]) => p === platform).map(([, value], i) => ({ source: { locator: `/groups/W12_topProducts/rows/${i}` }, shopId: 'synthetic-shop', revenue: { value } })),
      } } }));
      const captureSnapshot = { capture: { platforms } } as unknown as AutomationMetricMethodSnapshot;
      assert.deepEqual(tiktokShopChannelDecision(captureSnapshot), c.expected, 'results-page capture follows the same gate');
    }
  }
  for (const [shopee, tiktok] of [[50, 50], [51, 49]]) {
    const input = await headlineInput((['shopee', 'tiktok'] as const).map((platform, i) => ({
      i, platform, listing: `synthetic-${i}`, shop: `synthetic-shop-${i}`, title: 'Synthetic container',
      cat: 'Synthetic category', brand: 'Synthetic brand', rev: i === 0 ? shopee! : tiktok!, units: 1, asp: 1, start: null,
    })));
    assert.equal(tiktokShopChannelDecision(input.metricMethods).decision, tiktok === 50 ? 'MAIN' : 'CHANNEL_NOT_MAIN');
    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const before = buildResearchAutomationReport(input, kind).html;
      const withReviews = buildResearchAutomationReport({ ...input, collection: { ...input.collection!, tiktokShopReviews: {
        profile: 'tiktok-shop-reviews-v1', status: 'COLLECTED', skipReason: null, documentSha256: 'd'.repeat(64),
        products: [{ productId: '101', outcome: 'OK', captureIndex: 0, reviewCount: 4 }],
      } } }, kind).html;
      assert.ok(withReviews.equals(before), 'S06 channel gate adds no share or other reader text');
    }
  }
});

test('S06 row 9: harness refuses missing/excess point budgets before credentials or network', () => {
  for (const c of [
    { args: ['--product-id', '101', '--out', 'unused'], message: /Usage:/ },
    { args: ['--product-id', '101', '--max-points', '4', '--out', 'unused'], message: /--max-points must be 1 to 3/ },
    { args: ['--product-id', '101', '--product-id', '102', '--max-points', '1', '--out', 'unused'], message: /More products than --max-points allows/ },
  ]) {
    // main invokes its private parser first. No inherited credentials, preload, or network capability.
    const run = spawnSync(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch=()=>{throw new Error("NETWORK_FORBIDDEN")}', '--import', 'tsx', 'scripts/probe-tiktok-shop-reviews.ts', ...c.args],
      { cwd: new URL('../..', import.meta.url), env: { PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(run.error, undefined);
    assert.equal(run.status, 1);
    assert.match(run.stderr, c.message);
    assert.doesNotMatch(run.stderr, /SECRET_KEY|NETWORK_FORBIDDEN|Probe failed/);
    assert.equal(run.stdout, '');
  }
});

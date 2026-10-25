import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import automationApiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import sourceConfirmSchema from '../../contracts/api/research-automation-source-api.schema.json' with { type: 'json' };
import metricCaptureIntakeSchema from '../../contracts/api/research-automation-metric-capture-intake-api.schema.json' with { type: 'json' };
import presentationRevisionSchema from '../../contracts/analysis/automation-market-presentation-revision.schema.json' with { type: 'json' };
import {
  AUTORUN_PICK_RULE_VERSION, AUTORUN_PICK_RULE_VERSION_V2, autorunRequestKey, buildCaptureSpec, buildConfirmValue, buildPrepareValue, buildRevisionValue, decidePeriodRetry,
  deriveIncludeTerms, firstAttemptPeriod, parseObservedPeriod, periodInside, pickShopeeLinks, planCapturePeriod, sourceContextVi,
} from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { retainedRelevance } from '../helpers/capture-relevance-fixture.js';
import { selectExactShopeeListings } from '../../src/modules/foundation/shopee-exact-selection.js';

// Synthetic fixtures only: invented names, brands, shops and ids.
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
ajv.addSchema(automationApiSchema);
const validateConfirm = ajv.compile(sourceConfirmSchema);
ajv.addSchema(metricCaptureIntakeSchema);
const validatePrepare = ajv.compile({ $ref: `${metricCaptureIntakeSchema.$id}#/$defs/request` });
const validateRevision = ajv.compile(presentationRevisionSchema);

const runId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const runPeriod = { startDate: '2025-10-05', endDate: '2026-10-02' };

let nextItem = 1000;
const row = (name: string, shop: number, revenue: number | string | null, extra: Record<string, unknown> = {}) =>
  ({ product_base_id: `1__${nextItem++}__${shop}`, product_name: name, shop_base_id: String(shop), revenue_custom: revenue, order_custom: 1, ...extra });
const raw = (rows: unknown[]) => ({ code: 0, data: { page: 1, list: rows.slice(0, 2) }, more: [{ nested: { items: rows.slice(2) } }] });

test('son keyword picks son, never sơn, sonic or person', () => {
  const rows = [
    row('Son kem lì Hoa Giấy đỏ gạch', 11, 500, { brand: 'Hoa Giấy' }),
    row('Sơn tường nội thất trắng sứ', 12, 900, { brand: 'Nhà Xanh' }),
    row('Sonic đồ chơi xe đua', 13, 800, { brand: 'Đồ Chơi Vui' }),
    row('Person quà tặng bộ cốc', 14, 700, { brand: 'Cốc Xinh' }),
    row('Thỏi SON-môi lì mềm', 15, 400, { final_brand: 'Mây Hồng', brand: 'ignored' }),
  ];
  const result = pickShopeeLinks(raw(rows), ['son']);
  assert.equal(result.pickRuleVersion, AUTORUN_PICK_RULE_VERSION_V2);
  assert.deepEqual(result.links.map(link => link.brand), ['Hoa Giấy', 'Mây Hồng']);
  assert.deepEqual(result.counts, { walked: 5, deleted: 0, notIncluded: 1, tokenGuardRejected: 2, eligible: 2, picked: 2 });
  assert.match(result.urls[0]!, /^https:\/\/shopee\.vn\/product\/11\/\d+$/);
});

test('pass 1 spreads brands; pass 2 fills by unseen shop, a brand may repeat; max five', () => {
  const r = [
    row('son A1', 11, 100, { brand: 'Brand A' }),
    row('son A2', 12, 90, { brand: 'brand a ' }), // same brand after trim+lowercase
    row('son B on a seen shop', 11, 80, { brand: 'Brand B' }),
    row('son no brand 1', 13, 70),
    row('son C', 14, 60, { brand: 'Brand C' }),
    row('son no brand on a seen shop', 13, 50),
    row('son D', 15, 40, { brand: 'Brand D' }),
    row('son no brand 2', 16, 30, { brand: '  ' }),
    row('son no brand 3', 17, 20),
  ];
  const result = pickShopeeLinks(raw(r), ['son']);
  // Pass 1: A1, C, D (B sits on A1's shop). Pass 2 by revenue: A2 (brand A again, new shop), then no-brand 1.
  assert.deepEqual(result.links.map(link => link.productBaseId), [r[0], r[4], r[6], r[1], r[3]].map(x => x!.product_base_id));
  assert.equal(new Set(result.links.map(link => link.shopId)).size, 5);
  assert.equal(result.urls.length, 5);
  for (const link of result.links) assert.equal(link.url, `https://shopee.vn/product/${link.shopId}/${link.itemId}`);
});

test('deleted, non-Shopee and duplicate rows are dropped; fewer than five is returned as is', () => {
  const kept = row('son kem', 21, 50, { brand: 'Kem' });
  const rows = [kept, { ...kept }, row('son xóa', 22, 999, { brand: 'Xoá', is_deleted: true }),
    { product_base_id: '2__555__666', product_name: 'son tiktok', revenue_custom: 1000 }, { product_base_id: '1__0__5', product_name: 'son' }];
  const result = pickShopeeLinks(raw(rows), ['son']);
  assert.equal(result.counts.walked, 2); assert.equal(result.counts.deleted, 1);
  assert.deepEqual(result.urls, [`https://shopee.vn/product/21/${kept.product_base_id.split('__')[1]}`]);
  assert.equal(pickShopeeLinks({ nothing: true }, ['son']).links.length, 0);
  assert.equal(pickShopeeLinks(raw(rows), []).links.length, 0);
});

test('revenue ties break by product_base_id regardless of input order', () => {
  const a = { product_base_id: '1__300__31', product_name: 'son a', shop_base_id: '31', revenue_custom: '77', order_custom: 1, brand: 'X1' };
  const b = { product_base_id: '1__200__32', product_name: 'son b', shop_base_id: '32', revenue_custom: 77, order_custom: 1, brand: 'X2' };
  const c = { product_base_id: '1__100__33', product_name: 'son c', shop_base_id: '33', revenue_custom: 'n/a', brand: 'X3' };
  const one = pickShopeeLinks([a, b, c], ['son']);
  const two = pickShopeeLinks([c, b, a], ['son']);
  assert.deepEqual(one, two);
  assert.deepEqual(one.links.map(link => link.productBaseId), ['1__200__32', '1__300__31', '1__100__33']);
  assert.equal(one.links[2]!.revenue, null);
});

test('picked URLs are accepted by the existing exact Shopee URL validator', () => {
  const result = pickShopeeLinks(raw([row('son 1', 41, 3, { brand: 'P' }), row('son 2', 42, 2, { brand: 'Q' })]), ['son']);
  const selected = selectExactShopeeListings({ contractVersion: '2.0.0', runKey: 'scope-validation', topic: 'URL validation', selectionBasis: 'OWNER_EXACT_URL',
    source: { label: 'Synthetic', acquiredAt: '2026-01-01T00:00:00.000Z' }, productUrls: [...result.urls] }).selected;
  assert.equal(selected.length, 2);
});

test('period window: first attempt, pre-check, observed parse and retry decision', () => {
  assert.deepEqual(firstAttemptPeriod(runPeriod), { startDate: '2026-09-03', endDate: '2026-10-02' });
  assert.deepEqual(planCapturePeriod(runPeriod), { ok: true, period: { startDate: '2026-09-03', endDate: '2026-10-02' } });
  assert.deepEqual(planCapturePeriod({ startDate: '2026-09-20', endDate: '2026-10-02' }), { ok: false, code: 'PERIOD_OUTSIDE_RUN' });
  assert.deepEqual(planCapturePeriod({ startDate: '2026-10-02', endDate: '2026-09-01' }), { ok: false, code: 'PERIOD_OUTSIDE_RUN' });
  assert.equal(periodInside({ startDate: '2026-02-01', endDate: '2026-02-30' }, runPeriod), false);

  const plain = 'METRIC_PERIOD_UNSUPPORTED: Metric lookups currently support only the page default period; details={"observedPeriod":{"startDate":"2026-09-01","endDate":"2026-09-30"},"requestedPeriod":{"startDate":"2026-09-03","endDate":"2026-10-02"}}';
  const escaped = JSON.stringify({ error: { message: plain } });
  for (const message of [plain, escaped]) assert.deepEqual(parseObservedPeriod(message), { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.equal(parseObservedPeriod('details={"observedPeriod":null,"requestedPeriod":{}}'), null);
  assert.equal(parseObservedPeriod('details={"observedPeriod":{"startDate":"2026-09-31","endDate":"2026-10-30"}}'), null);

  const attempted = firstAttemptPeriod(runPeriod);
  assert.deepEqual(decidePeriodRetry(plain, runPeriod, attempted), { retry: true, period: { startDate: '2026-09-01', endDate: '2026-09-30' } });
  const narrow = { startDate: '2026-09-03', endDate: '2026-10-02' };
  assert.deepEqual(decidePeriodRetry(plain, narrow, attempted), { retry: false, code: 'PERIOD_OUTSIDE_RUN', observed: { startDate: '2026-09-01', endDate: '2026-09-30' } });
  assert.deepEqual(decidePeriodRetry('garbled', runPeriod, attempted), { retry: false, code: 'METRIC_PERIOD_UNSUPPORTED', observed: null });
  const same = plain.replace('2026-09-01', '2026-09-03').replace('2026-09-30', '2026-10-02');
  assert.equal(decidePeriodRetry(same, runPeriod, attempted).retry, false);
});

test('capture spec is the fixed derived shape', () => {
  assert.deepEqual(buildCaptureSpec('  son môi ', { startDate: '2026-09-03', endDate: '2026-10-02' }),
    { keywords: ['son môi'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-09-03', endDate: '2026-10-02' }, category: null, smartQuery: true });
  assert.throws(() => buildCaptureSpec(' ', firstAttemptPeriod(runPeriod)));
});

test('includeTerms picks the longest prefix in at least half the principal titles', () => {
  assert.deepEqual(deriveIncludeTerms('Son môi', ['Son kem lì Hoa', 'Son thỏi Mây', 'son môi Gió', null]), ['son']);
  assert.deepEqual(deriveIncludeTerms('son môi', ['Son môi kem', 'SON MÔI thỏi', 'son dưỡng']), ['son môi']);
  assert.deepEqual(deriveIncludeTerms('quạt điện', ['Máy lạnh mini', 'Đèn bàn']), ['quạt điện']);
  assert.deepEqual(deriveIncludeTerms('quạt điện', [null, null]), ['quạt điện']);
  // whole tokens with exact diacritics: "sơn" and "sonic" are not "son"
  assert.deepEqual(deriveIncludeTerms('son môi', ['Sơn tường', 'Sonic xe']), ['son môi']);
});

test('request values validate against the owner-route contracts; nativeReview is always SKIP', () => {
  const prepare = buildPrepareValue({ runId, expectedRevision: 3, sourceContext: sourceContextVi('son môi', { startDate: '2026-09-03', endDate: '2026-10-02' }) });
  assert.ok(validatePrepare(prepare), JSON.stringify(validatePrepare.errors));

  const base = { runId, expectedRevision: 4, keyword: 'son môi', description: '  Son môi bán trên Shopee  ', includeTerms: ['son', 'Son'],
    principalProductIds: ['synthetic-search:p-001', 'synthetic-search:p-002', 'synthetic-search:p-001'],
    exactShopeeUrls: ['https://shopee.vn/product/11/1001'], packageId: '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e' };
  const confirmed = buildConfirmValue(base);
  assert.ok(confirmed.ok);
  if (!confirmed.ok) return;
  assert.ok(validateConfirm(confirmed.value), JSON.stringify(validateConfirm.errors));
  assert.equal(confirmed.value.sources.nativeReview, 'SKIP');
  assert.deepEqual(confirmed.value.includeTerms, ['son']);
  assert.deepEqual(confirmed.value.selectedProductIds, ['synthetic-search:p-001', 'synthetic-search:p-002']);
  assert.equal(confirmed.value.definition, 'Son môi bán trên Shopee');
  // No input can switch native reviews on, even smuggled extra fields.
  const smuggled = buildConfirmValue({ ...base, nativeReview: 'AUTO_REUSE', sources: { nativeReview: 'AUTO_REUSE' } } as any);
  assert.ok(smuggled.ok && smuggled.value.sources.nativeReview === 'SKIP');
  const noLinks = buildConfirmValue({ ...base, description: null, exactShopeeUrls: [] });
  assert.ok(noLinks.ok && validateConfirm(noLinks.value) && noLinks.value.definition === 'son môi');
  assert.deepEqual(buildConfirmValue({ ...base, principalProductIds: [] }), { ok: false, code: 'NO_PRINCIPAL_PRODUCTS' });

  const revision = buildRevisionValue({ runId, previousPairId: 'c'.repeat(64) });
  assert.ok(validateRevision(revision), JSON.stringify(validateRevision.errors));
});

test('request keys are fixed per run and step and differ between steps', () => {
  const keys = (['prepare', 'confirm', 'revision'] as const).map(step => autorunRequestKey(runId, step));
  assert.deepEqual(keys, (['prepare', 'confirm', 'revision'] as const).map(step => autorunRequestKey(runId, step)));
  assert.equal(new Set(keys).size, 3);
  for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(autorunRequestKey('1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'prepare'), keys[0]);
});

test('sourceContext is plain Vietnamese and names no data provider', () => {
  const text = sourceContextVi('son môi', { startDate: '2026-09-03', endDate: '2026-10-02' });
  assert.match(text, /Shopee/); assert.match(text, /TikTok Shop/);
  assert.ok(text.includes('2026-09-03') && text.includes('2026-10-02'));
  for (const name of ['metric', 'kalodata', 'tradeint', 'dami', 'apify', 'serpapi', 'opencli', 'fastmoss', 'zen-studio']) {
    assert.ok(!text.toLowerCase().includes(name), name);
  }
});


test('Shopee pick rejects accessories and implausible revenue using the same generic row policy', () => {
  const rows = [row('Bình giữ nhiệt A', 61, 1000000, { order_custom: 10 }),
    row('Bình giữ nhiệt B', 62, 2000000, { order_custom: 20 }),
    row('Bình giữ nhiệt C', 63, 3000000, { order_custom: 30 }),
    row('Nắp bình giữ nhiệt', 64, 99000000, { order_custom: 1 }),
    row('Bình giữ nhiệt D', 65, 57200000, { order_custom: 1 }),
    row('Bình giữ nhiệt E', 66, 5000000, { order_custom: 0 }),
    row('Bình giữ nhiệt F', 67, 6000000, { order_custom: null })];
  assert.deepEqual(pickShopeeLinks(raw(rows), ['bình giữ nhiệt']).links.map(link => link.shopId), ['63','62','61']);
});

test('pick v3 conserves ambiguous parts on the floor and excludes retained NOT_MAIN, keeping product titles', () => {
  assert.equal(AUTORUN_PICK_RULE_VERSION, 'autorun-pick-v3');
  const rows = [row('Trục quạt điện mẫu thử', 71, 900, { order_custom: 9 }),
    row('Chiết áp mẫu thử Quạt điện', 72, 800, { order_custom: 8 }),
    row('Quạt điện mẫu thử xoay đầu tự động', 73, 300, { order_custom: 3 }),
    row('Đầu mùa sale Quạt điện mẫu thử', 74, 200, { order_custom: 2 })];
  const picked = pickShopeeLinks(raw(rows), ['quạt điện'], { profile: CAPTURE_ROW_PROFILE });
  assert.equal(picked.pickRuleVersion, 'autorun-pick-v3');
  assert.deepEqual(picked.links.map(link => link.shopId), ['71', '72', '73', '74']);
  assert.equal(picked.counts.eligible, 4);
  const relevance = retainedRelevance(rows.map(row => ({ title: row.product_name })), 'quạt điện',
    title => title === rows[0]!.product_name || title === rows[1]!.product_name ? 'NOT_MAIN' : 'MAIN');
  const decided = pickShopeeLinks(raw(rows), ['quạt điện'], { profile: CAPTURE_ROW_PROFILE, relevance });
  assert.deepEqual(decided.links.map(link => link.shopId), ['73', '74']);
  assert.equal(decided.counts.eligible, 2);
  assert.deepEqual(pickShopeeLinks(raw(rows.slice(0, 2)), ['quạt điện'], { profile: CAPTURE_ROW_PROFILE, relevance }).links, []);
});

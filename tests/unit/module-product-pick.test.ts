import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_PICK_POLICY, ProductPickError, derivePeriodProductPick, pickProductsWithJev, rankedMetricProducts } from '../../scripts/module-product-pick.js';
import { PICK_JEV_QUESTION_VERSION, PICK_JEV_TEXTS, pickQuestionVersion } from '../../scripts/module-product-pick-jev.js';
import { answer, fakeJev, noWait, type Scripted } from '../helpers/fake-pick-jev.js';

// Synthetic rows only. Titles exercise the accepted finite title convention; the
// rows never claim chemical identity beyond the retained name and brand fields.
type Row = Record<string, unknown>;
let nextItem = 7100;
const product = (title: string, revenue: number, extra: Row = {}): Row => ({
  product_base_id: `1__${nextItem++}__301`, product_name: title, shop_base_id: '301', platform_id: 1,
  revenue_custom: revenue, brand: 'DHC', final_brand: 'DHC', ...extra,
});
const part = { window: { id: 'selected', period: { startDate: '2026-10-01', endDate: '2026-10-31' } },
  sourceMap: { products: 'raw-responses.json#/0/body/data' } };
const capture = (rows: Row[], request: Row = {}) => [{
  urlPath: '/v2/market/analytics/products/', status: 200,
  requestBody: { sort_by: 'revenue_custom__desc', page: 0, limit: 20, ...request },
  body: { status: 'success', data: { products: rows } },
}];
const pick = (rows: Row[]) => derivePeriodProductPick(capture(rows), part, 'a'.repeat(64));
const descending = (titles: readonly string[]) =>
  titles.map((title, i) => product(title, 1000 - i * 10));

test('the finite title convention merges pack/duration spellings and keeps true formula differences', () => {
  const cases: [string, string, string, boolean][] = [
    ['pack quantity', 'DHC Kẽm 60 viên', 'DHC Kẽm 120 viên', true],
    ['duration quantity', 'DHC Kẽm 60 ngày', 'DHC Kẽm 120 ngày', true],
    ['component order', 'DHC Kẽm + Vitamin C', 'DHC Vitamin C + Kẽm', true],
    ['distinct component combo', 'DHC Kẽm + Vitamin C', 'DHC Kẽm + Biotin', false],
    ['true dose difference', 'DHC Kẽm 20mg', 'DHC Kẽm 30mg', false],
    ['equivalent decimal spelling', 'DHC Kẽm 20mg', 'DHC Kẽm 20.0mg', true],
    ['equivalent zero-padded spelling', 'DHC Kẽm 20mg', 'DHC Kẽm 020mg', true],
    ['equivalent mass unit spelling', 'DHC Kẽm 1mg', 'DHC Kẽm 1000mcg', true],
  ];
  for (const [name, first, second, same] of cases) {
    const rows = [product(first, 500), product(second, 400)];
    const picked = pick(rows);
    if (same) {
      assert.equal(picked.links.length, 1, `${name}: one named group`);
      assert.equal(picked.links[0]!.productBaseId, rows[0]!.product_base_id as string, `${name}: first source link`);
      assert.equal(picked.links[0]!.revenue, 500, `${name}: first source revenue retained, never summed`);
      assert.deepEqual(picked.selectionProof.skipped.map((s: any) => [s.sourceRank, s.reason, s.duplicateOfRank]),
        [[2, 'SAME_TITLE_COMPONENT_GROUP', 1]], `${name}: later spelling is the known duplicate`);
    } else {
      assert.equal(picked.links.length, 2, `${name}: two named groups`);
      assert.notEqual(picked.links[0]!.groupKey, picked.links[1]!.groupKey, `${name}: different group keys`);
    }
  }
});

test('an ambiguous title before the fifth pick is unresolved, while later distinct rows still fill the list', () => {
  const rows = descending([
    'DHC Kẽm 60 ngày', 'DHC Vitamin C 60 ngày', 'DHC Kẽm / DHC Vitamin C', 'DHC Biotin 60 ngày',
    'DHC Magiê 60 ngày', 'DHC Canxi 60 ngày',
  ]);
  const picked = pick(rows);
  assert.deepEqual(picked.links.map(l => [l.rank, l.sourceRank]), [[1, 1], [2, 2], [3, 4], [4, 5], [5, 6]]);
  assert.deepEqual(picked.selectionProof.skipped.map((s: any) => [s.sourceRank, s.reason]), [[3, 'PICK_TITLE_GROUP_UNRESOLVED']]);
  assert.equal(picked.selectionProof.unresolvedCount, 1);
  assert.equal(picked.selectionProof.shortageReason, 'PICK_TITLE_GROUP_UNRESOLVED',
    'five resolved rows still cannot claim five distinct groups while a relevant earlier title is unresolved');
});

test('fewer than five distinct captured products reports a shortage without padding', () => {
  const picked = pick(descending(['DHC Kẽm', 'DHC Vitamin C', 'DHC Biotin']));
  assert.equal(picked.links.length, 3);
  assert.equal(picked.selectionProof.shortageReason, 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS');
  assert.equal(picked.selectionProof.skipped.length, 0);
});

test('same-shop distinct formulas are separate groups under the named policy', () => {
  const titles = ['DHC Kẽm', 'DHC Vitamin C', 'DHC Biotin', 'DHC Magiê', 'DHC Canxi'];
  const rows = titles.map((title, i) => ({ ...product(title, 900 - i * 10), shop_base_id: '301', product_base_id: `1__${7200 + i}__301` }));
  const picked = pick(rows);
  assert.deepEqual(picked.links.map(l => [l.shopId, l.sourceRank]), titles.map((_, i) => ['301', i + 1]));
  assert.equal(picked.selectionProof.shortageReason, null);
});

test('every captured candidate is retained in native order while only five distinct groups are linked', () => {
  const titles = ['DHC Kẽm', 'DHC Vitamin C', 'DHC Biotin', 'DHC Magiê', 'DHC Canxi'];
  const rows = [...titles, ...Array.from({ length: 15 }, () => 'DHC Kẽm 120 viên')]
    .map((title, i) => product(title, 10_000 - i * 100));
  const picked = pick(rows);
  assert.equal(rankedMetricProducts(capture(rows), part).rows.length, 20);
  assert.equal(picked.counts.walked, 20);
  assert.equal(picked.selectionProof.candidateCount, 20);
  assert.equal(picked.links.length, 5);
  assert.equal(picked.pickRuleVersion, MODULE_PICK_POLICY);
});

test('the picker refuses products that are not in native period-revenue order', () => {
  const rows = descending(['DHC Kẽm', 'DHC Vitamin C']);
  const refused = (raw: unknown, message: string) =>
    assert.throws(() => derivePeriodProductPick(raw, part, 'a'.repeat(64)),
      (error: unknown) => error instanceof ProductPickError && error.message === message);
  refused([{ ...capture(rows)[0], requestBody: { sort_by: 'revenue_custom_sum__desc', page: 0, limit: 20 } }],
    'PICK_NATIVE_PERIOD_ORDER_UNVERIFIED');
  refused([{ ...capture(rows)[0], requestBody: { sort_by: 'revenue_custom__desc', page: 1, limit: 20 } }],
    'PICK_NATIVE_PERIOD_ORDER_UNVERIFIED');
  refused([{ ...capture(rows)[0], status: 200, body: { status: 'success', data: { products: [rows[1], rows[0]] } } }],
    'PICK_NATIVE_PERIOD_ORDER_UNVERIFIED');
  refused([{ ...capture(rows)[0], body: { status: 'success', data: { products: [product('DHC Kẽm', null as any)] } } }],
    'PICK_NATIVE_PERIOD_ORDER_UNVERIFIED');
});

// Rule v2: a scripted fake Jev; nothing reaches the network.
const pickV2 = (rows: Row[], script: Scripted[]) => {
  const fake = fakeJev(script);
  return { fake, result: pickProductsWithJev(capture(rows), part, 'a'.repeat(64), fake.jev, noWait) };
};
const otherPlatform = (prefix: string, revenue: number): Row =>
  ({ product_base_id: prefix + '__1__2', product_name: 'Synthetic other', revenue_custom: revenue });

test('v2 picks the first Shopee row without a question and skips other platforms silently', async () => {
  const rows = [otherPlatform('2', 1000), otherPlatform('3', 990), product('Synthetic first', 980), otherPlatform('8', 970),
    product('Synthetic second', 960)];
  const { fake, result } = pickV2(rows, [answer(1, 'MOI', 0.9)]);
  const picked = await result;
  assert.deepEqual(picked.links.map(l => l.sourceRank), [3, 5]);
  assert.equal(picked.links[0]!.reason, 'Hạng nguồn 3; sản phẩm đầu tiên bán trên Shopee.');
  assert.equal(picked.links[1]!.reason, 'Hạng nguồn 5; khác các sản phẩm đã chọn.');
  assert.equal(fake.asked.length, 1, 'only the second Shopee row is asked about');
  assert.deepEqual(picked.selectionProof.skipped, [], 'other platforms leave no skip record');
  assert.deepEqual(picked.selectionProof.decisions.map(d => d.sourceRank), [5]);
});

test('v2 decides by the chosen option and the 0.70 threshold, at and just below the mark', async () => {
  const rows = descending(['Synthetic A', 'Synthetic B', 'Synthetic A again', 'Synthetic C', 'Synthetic D']);
  const { result } = pickV2(rows, [answer(1, 'MOI', 0.7), answer(2, 'SP1', 0.7), answer(2, 'MOI', 0.6999), answer(2, 'SP2', 0.69)]);
  const picked = await result;
  assert.deepEqual(picked.links.map(l => l.sourceRank), [1, 2]);
  assert.deepEqual(picked.selectionProof.decisions.map(d => [d.sourceRank, d.choice, d.outcome]),
    [[2, 'MOI', 'PICKED'], [3, 'SP1', 'DUPLICATE'], [4, 'MOI', 'UNSURE'], [5, 'SP2', 'UNSURE']]);
  assert.deepEqual(picked.selectionProof.skipped, [
    { sourceRank: 3, productBaseId: rows[2]!.product_base_id, reason: 'SAME_PRODUCT', duplicateOfRank: 1 },
    { sourceRank: 4, productBaseId: rows[3]!.product_base_id, reason: 'PRODUCT_MATCH_UNSURE', duplicateOfRank: null },
    { sourceRank: 5, productBaseId: rows[4]!.product_base_id, reason: 'PRODUCT_MATCH_UNSURE', duplicateOfRank: null }]);
});

test('v2 stops asking after the fifth pick', async () => {
  const { fake, result } = pickV2(descending(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']), [1, 2, 3, 4].map(n => answer(n, 'MOI', 0.9)));
  assert.equal((await result).links.length, 5);
  assert.equal(fake.asked.length, 4);
});

test('v2 ends with five picks despite skips, or a shortage named by its cause', async () => {
  const outcome = async (titles: string[], script: Scripted[]) => {
    const proof = (await pickV2(descending(titles), script).result).selectionProof;
    return [proof.distinctCount, proof.unresolvedCount, proof.shortageReason];
  };
  assert.deepEqual(await outcome(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    [answer(1, 'MOI', 0.5), answer(1, 'MOI', 0.9), answer(2, 'MOI', 0.9), answer(3, 'MOI', 0.9), answer(4, 'MOI', 0.9)]), [5, 1, null]);
  assert.deepEqual(await outcome(['S1', 'S2', 'S3'], [answer(1, 'MOI', 0.9), answer(2, 'SP1', 0.6)]), [2, 1, 'PICK_PRODUCT_UNRESOLVED']);
  assert.deepEqual(await outcome(['S1', 'S2', 'S3'], [answer(1, 'MOI', 0.9), answer(2, 'SP2', 0.9)]), [2, 0, 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS']);
});

test('v2 sends the approved question word for word, options in pick order, and versions its texts', async () => {
  const rows = [
    product('  Synthetic   Alpha\n60  caps ', 1000, { final_brand: 'Brand A', shop_name: 'Shop A' }),
    product('Synthetic Beta', 990, { final_brand: '', brand: 'Brand B', shop_name: '' }),
    product('Synthetic Gamma', 980, { final_brand: null, brand: null, shop_name: 'Shop C' }),
  ];
  const { fake, result } = pickV2(rows, [answer(1, 'MOI', 0.9), answer(2, 'MOI', 0.9)]);
  await result;
  assert.deepEqual(fake.asked[1], [{
    id: 'PICK',
    state: 'Tin đăng cần xét: Synthetic Gamma (thương hiệu: không rõ; shop: Shop C)',
    instructions: 'The state is one Shopee listing. Options SP1, SP2... are products already on the list. Choose an existing product if the listing sells that same product (same brand, same product line, same main ingredients), even when the seller, pack size, days of supply, gift or title wording differ. Choose MOI if the listing sells a product that is not on the list.',
    criteria: {
      SP1: 'The listing sells this same product: Synthetic Alpha 60 caps (thương hiệu: Brand A; shop: Shop A)',
      SP2: 'The listing sells this same product: Synthetic Beta (thương hiệu: Brand B; shop: không rõ)',
      MOI: 'A new product: not the same as any product already on the list',
    },
  }]);
  assert.deepEqual(Object.keys(fake.asked[1]![0]!.criteria), ['SP1', 'SP2', 'MOI']);
  assert.ok(fake.asked.every(request => request.length === 1), 'one question per request');
  assert.equal(PICK_JEV_QUESTION_VERSION, pickQuestionVersion(PICK_JEV_TEXTS));
  assert.notEqual(pickQuestionVersion({ ...PICK_JEV_TEXTS, newOption: PICK_JEV_TEXTS.newOption.replace('new', 'different') }),
    PICK_JEV_QUESTION_VERSION);
});

test('v2 retries a failed question and gives up after three attempts; a malformed answer is a failure', async () => {
  const rows = descending(['S1', 'S2']);
  const waits: number[] = [];
  const sleep = async (ms: number) => { waits.push(ms); };
  const recovered = fakeJev(['http-error', answer(1, 'MOI', 0.9)]);
  assert.equal((await pickProductsWithJev(capture(rows), part, 'a'.repeat(64), recovered.jev, sleep)).links.length, 2);
  assert.deepEqual(waits, [1000]);
  const failed = fakeJev(['throws', 'malformed', 'http-error']);
  await assert.rejects(pickProductsWithJev(capture(rows), part, 'a'.repeat(64), failed.jev, sleep),
    (error: unknown) => error instanceof ProductPickError && error.message === 'PICK_JEV_UNAVAILABLE');
  assert.equal(failed.asked.length, 3);
  assert.deepEqual(waits, [1000, 1000, 3000]);
});

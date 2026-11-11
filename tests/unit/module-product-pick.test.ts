import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_PICK_POLICY, ProductPickError, derivePeriodProductPick, rankedMetricProducts } from '../../scripts/module-product-pick.js';

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

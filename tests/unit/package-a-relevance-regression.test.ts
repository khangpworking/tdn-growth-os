import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCaptureRows, assessCaptureTitle, type CaptureQualityRow } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { classifyCaptureRelevance, captureTitleSha256, readCaptureRelevanceRecord, type CaptureRelevanceLabel } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { retainedRelevance } from '../helpers/capture-relevance-fixture.js';

// Invented lighting, footwear and food products; no captured listing titles.
const products = [
  { keyword: 'đèn lumo', title: 'Mini đèn lumo mẫu', category: 'Đồ chiếu sáng mẫu' },
  { keyword: 'giày vesa', title: 'Đôi giày vesa mẫu', category: 'Đồ đi chân mẫu' },
  { keyword: 'bánh nori', title: 'Ăn sáng bánh nori mẫu', category: 'Thực phẩm mẫu' },
];
const row = (title: string, categoryText = 'Danh mục hiếm mẫu'): CaptureQualityRow =>
  ({ title, categoryText, platform: 'shopee', price: 100, revenue: 100, units: 1 });
const anchors = (keyword: string) => Array.from({ length: 40 }, (_, i) => row(`${keyword} mẫu ${i}`, 'Danh mục chính mẫu'));
const labels = ['absent', null, 'UNSURE', 'MAIN'] as const;
const saved = (rows: readonly CaptureQualityRow[], keyword: string, label: typeof labels[number]) =>
  label === 'absent' ? undefined : retainedRelevance(rows, keyword, () => label);

for (const { keyword, title, category } of products) for (const label of labels) {
  test(`modifier plus rare category keeps ${keyword}, label=${label}`, () => {
    const rows = [...anchors(keyword), row(title, category)];
    const result = assessCaptureRows(rows, [keyword], 'BATCH', saved(rows, keyword, label));
    assert.equal(result.cohorts[0]!.categoryAvailable, true);
    const decision = result.decisions[40]!;
    assert.equal(decision.evidence[0]!.rareCategory, true);
    assert.ok(decision.evidence[0]!.title.weak.includes('MODIFIER_BEFORE_TARGET'));
    assert.ok(decision.review.includes('UNCERTAIN_TARGET'));
    assert.equal(decision.reason, null);
    assert.equal(decision.decision, 'KEEP');
    assert.deepEqual([...result.exclusions], []);
  });

  test(`weak relation plus rare category is diagnostic for ${keyword}, label=${label}`, () => {
    const rows = [...anchors(keyword), row(`Giá dành cho ${keyword}`, category)];
    const result = assessCaptureRows(rows, [keyword], 'BATCH', saved(rows, keyword, label));
    const decision = result.decisions[40]!;
    assert.equal(result.cohorts[0]!.categoryAvailable, true);
    assert.ok(decision.evidence[0]!.title.weak.includes('WEAK_RELATION'));
    assert.equal(decision.evidence[0]!.title.protectedScope, false);
    assert.equal(decision.evidence[0]!.rareCategory, true);
    assert.equal(decision.reason, null);
    assert.deepEqual([...result.exclusions], []);
  });
}

for (const { keyword } of products) test(`explicit relations stay diagnostic and only NOT_MAIN excludes for ${keyword}`, () => {
  const rows = [...anchors(keyword), row(`Bao dùng cho ${keyword}`), row(`Túi tặng ${keyword}`), row(`${keyword} mẫu riêng`)];
  const record = retainedRelevance(rows, keyword, title => title.endsWith('riêng') ? 'NOT_MAIN' : 'MAIN');
  const result = assessCaptureRows(rows, [keyword], 'BATCH', record);
  assert.equal(result.decisions[40]!.reason, null);
  assert.equal(result.decisions[40]!.evidence[0]!.title.reason, 'ACCESSORY_FOR_TARGET');
  assert.equal(result.decisions[41]!.reason, null);
  assert.equal(result.decisions[41]!.evidence[0]!.title.reason, 'SECONDARY_GIFT');
  assert.equal(result.decisions[42]!.reason, null);
  assert.equal(result.decisions[42]!.aiExcluded, true);
  assert.deepEqual([...result.exclusions], [[42, 'NOT_MAIN_PRODUCT']]);
});

test('partial target and later title segment plus rarity retain uncertainty without a category drop', () => {
  const keyword = 'đèn lumo';
  const rows = [...anchors(keyword), row('Mini đèn mẫu'), row('Mẫu thử; đèn lumo nhỏ')];
  for (const label of labels) {
    const result = assessCaptureRows(rows, [keyword], 'BATCH', saved(rows, keyword, label));
    for (const [i, signal] of [[40, 'PARTIAL_TARGET'], [41, 'LATER_SEGMENT']] as const) {
      assert.ok(result.decisions[i]!.evidence[0]!.title.weak.includes(signal));
      assert.ok(result.decisions[i]!.review.includes('UNCERTAIN_TARGET'));
      assert.equal(result.decisions[i]!.evidence[0]!.rareCategory, true);
      assert.equal(result.decisions[i]!.decision, 'KEEP');
    }
  }
});

test('category inference requires an unprotected relation and a reference in the same platform', () => {
  const keyword = 'đèn lumo';
  const rows = [...anchors(keyword), row('Combo giá dành cho đèn lumo'), row('Ruột thay thế cho đèn lumo'),
    { ...row('Giá dành cho đèn lumo'), platform: 'tiktok' }];
  const result = assessCaptureRows(rows, [keyword]);
  assert.ok(result.decisions[40]!.evidence[0]!.title.protectedScope);
  assert.ok(result.decisions[41]!.evidence[0]!.title.protectedScope);
  assert.equal(result.cohorts.find(c => c.platform === 'tiktok')!.categoryAvailable, false);
  assert.deepEqual([...result.exclusions], []);
});

test('category reference thresholds retain anchors and never borrow another platform', () => {
  const keyword = 'đèn lumo';
  for (const [A, N, C, available] of [[40,160,40,true], [40,161,40,false], [39,40,39,false], [50,60,40,true], [51,60,40,false], [9,10,9,false]] as const) {
    const rows: CaptureQualityRow[] = Array.from({ length: N }, (_, i) => ({ ...row(i < A ? `${keyword} mẫu ${i}` : `Giá dành cho ${keyword}`),
      categoryText: i < C ? 'Danh mục chính mẫu' : i < A ? null : 'Danh mục hiếm mẫu' }));
    rows.push({ ...row(`Giá dành cho ${keyword}`), platform: 'tiktok' });
    const result = assessCaptureRows(rows, [keyword]);
    assert.equal(result.cohorts[0]!.categoryAvailable, available, JSON.stringify({ A, N, C }));
    assert.equal(result.exclusions.has(A), false, 'an eligible reference remains diagnostic');
    assert.equal(result.exclusions.has(N), false, 'no reference on the second platform');
    assert.ok(rows.slice(0, A).every((_, i) => !result.exclusions.has(i)), 'anchors survive');
  }
});

test('multi-keyword category hints remain diagnostic for every label combination', () => {
  const keywords = ['đèn lumo', 'giày vesa'];
  const title = 'Giá dành cho đèn lumo và giày vesa';
  const rows = [...keywords.flatMap(anchors), row(title)];
  const record = (pair: readonly (CaptureRelevanceLabel | null)[]) => {
    const parts = keywords.map((keyword, i) => retainedRelevance(rows, keyword, () => pair[i]!));
    return readCaptureRelevanceRecord({ ...parts[0]!, decisions: parts.flatMap(part => part.decisions) }, rows, keywords);
  };
  for (const pair of [[null, null], ['UNSURE', 'UNSURE'], ['MAIN', null], [null, 'MAIN'], ['MAIN', 'MAIN']] as const) {
    const result = assessCaptureRows(rows, keywords, 'BATCH', record(pair));
    assert.deepEqual(result.decisions[80]!.evidence.map(e => e.reason), pair.map(() => null));
    assert.equal(result.exclusions.has(80), false, JSON.stringify(pair));
  }
  const oneReference = [...anchors(keywords[0]!), row(title)];
  const result = assessCaptureRows(oneReference, keywords);
  assert.deepEqual(result.decisions[40]!.evidence.map(e => e.reason), [null, null]);
  assert.equal(result.exclusions.has(40), false, 'one keyword diagnostic hint cannot exclude');
});

test('multi-keyword AI needs all NOT_MAIN and never mixes one diagnostic hint with another AI reason', () => {
  const keywords = ['đèn lumo', 'giày vesa'];
  const rows = [...anchors(keywords[0]!), row('Giá dành cho đèn lumo và giày vesa')];
  for (const pair of [['NOT_MAIN','NOT_MAIN'], ['NOT_MAIN','MAIN'], ['NOT_MAIN','UNSURE'], ['NOT_MAIN',null], [null,'NOT_MAIN']] as const) {
    const parts = keywords.map((keyword, i) => retainedRelevance(rows, keyword, () => pair[i]!));
    const record = readCaptureRelevanceRecord({ ...parts[0]!, decisions: parts.flatMap(part => part.decisions) }, rows, keywords);
    const result = assessCaptureRows(rows, keywords, 'BATCH', record);
    assert.deepEqual(result.decisions[40]!.evidence.map(e => e.reason), [null, null]);
    assert.equal(result.decisions[40]!.aiExcluded, pair.every(label => label === 'NOT_MAIN'));
    assert.equal(result.exclusions.has(40), pair.every(label => label === 'NOT_MAIN'), JSON.stringify(pair));
  }
});

test('MAIN cannot rescue missing units or a unit-revenue outlier after relevance', () => {
  const keyword = 'đèn lumo';
  const rows = [...anchors(keyword), { ...row('Mini đèn lumo thiếu đơn vị'), units: null },
    { ...row('Mini đèn lumo đơn vị không'), units: 0 }, { ...row('Mini đèn lumo bất thường'), revenue: 2001 },
    { ...row('Mini đèn lumo đúng ngưỡng'), revenue: 2000 },
    { ...row('Mini đèn lumo sàn khác'), platform: 'tiktok', revenue: 9000000 }];
  const result = assessCaptureRows(rows, [keyword], 'BATCH', retainedRelevance(rows, keyword, () => 'MAIN'));
  assert.ok(result.decisions.slice(40).every(d => d.reason === null && !d.aiExcluded), 'all pass relevance');
  assert.deepEqual([...result.exclusions], [[40, 'REVENUE_WITHOUT_UNITS'], [41, 'REVENUE_WITHOUT_UNITS'], [42, 'UNIT_REVENUE_OUTLIER']]);
});

test('synthetic accessory, gift, bundle, refill, multipack and accent adversaries', () => {
  for (const { keyword } of products) {
    for (const [title, reason] of [
      [`Bao dùng cho ${keyword}`, 'ACCESSORY_FOR_TARGET'], [`Túi tặng ${keyword}`, 'SECONDARY_GIFT'],
      [`${keyword} tặng túi`, null], [`Combo túi và ${keyword}`, null], [`Ruột thay thế ${keyword}`, null],
      [`Bộ 2 chiếc ${keyword}`, null], [keyword.normalize('NFD'), null],
    ] as const) assert.equal(assessCaptureTitle(title, keyword).reason, reason, title);
  }
});

test('classifier receives keyword and only title-hash id, title and category from an enriched synthetic row', async () => {
  const rows = [{ title: 'Mini đèn lumo mẫu', categoryText: 'Đồ chiếu sáng mẫu', price: 100,
    shop: 'Gian hàng mẫu', productId: 'synthetic-product', apiKey: 'synthetic-redacted', token: 'synthetic-redacted', credentials: { password: 'synthetic-redacted' } }];
  const calls: unknown[] = [];
  await classifyCaptureRelevance(rows, ['đèn lumo'], {
    configuration: captureRelevanceConfiguration('synthetic-lumo-model'), classifier: { async classify(input) {
      calls.push(input);
      return input.items.map(({ id }) => ({ id, label: 'MAIN' }));
    } },
  });
  assert.deepEqual(calls, [{ keyword: 'đèn lumo', items: [{ id: captureTitleSha256(rows[0]!.title), title: rows[0]!.title, category: rows[0]!.categoryText }] }]);
});

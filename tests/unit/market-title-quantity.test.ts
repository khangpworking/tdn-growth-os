import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseUnitProfile, parseTitleQuantity, projectTitleUnitPrices,
  type TitleQuantityKind, type TitleUnitRow, type UnitProfile } from '../../src/modules/analysis/reader-report/market-title-quantity.js';

const row = (title: string, revenue: number | null = 120_000, units: number | null = 2): TitleUnitRow =>
  ({ title, revenue, units, platform: 'shopee' });
const profile = (kind: TitleQuantityKind, standard: string, countKind: string | null = null): UnitProfile =>
  ({ kind, countKind, standard, convertedRevenueShare: 1 });

test('C1 parseTitleQuantity: one explicit quantity, ambiguity and non-quantity numbers', () => {
  // A labelled identifier can resemble a size or pack count; a separate real size still counts.
  const labelledCodes = ['mã', 'ma', 'MÃ', 'model', 'MSP', 'SKU', 'art', 'code'].flatMap(label => [
    [`Mực in ${label} X3-100G`, 'ITEM', 1, 1, null, ''],
    [`Mực in ${label} X3-100G 200g`, 'MASS', 200, 1, null, '200g'],
    [`Nước hoa ${label}: X2-50ML 100ml`, 'VOLUME', 100, 1, null, '100ml'],
    [`Khăn ${label}#X3-12CAI 6 cái`, 'COUNT', 6, 1, 'cái', '6 cái'],
  ] as const);
  const cases: readonly (readonly [string, TitleQuantityKind, number, number, string | null])[] = [
    ...labelledCodes.map(([title, kind, perItem, multiplier, countKind]) => [title, kind, perItem, multiplier, countKind] as const),
    ['Bột ngũ cốc 1,5kg', 'MASS', 1500, 1, null],
    ['Muối 1.5kg', 'MASS', 1500, 1, null],
    ['Kem dưỡng 1.000g', 'MASS', 1000, 1, null],
    ...['g', 'gr', 'gram', 'gam', 'GAM'].map(unit => [`Bánh 20${unit}`, 'MASS', 20, 1, null] as const),
    ['Nước hoa 200ml', 'VOLUME', 200, 1, null],
    ...['l', 'lít', 'lit'].map(unit => [`Sữa tắm 1,5${unit}`, 'VOLUME', 1500, 1, null] as const),
    ...['viên', 'gói', 'túi', 'hộp', 'chai', 'lọ', 'hũ', 'cái', 'miếng', 'thanh', 'ống', 'tép', 'lon', 'cốc', 'ly']
      .map(word => [`Hàng mẫu 12 ${word}`, 'COUNT', 12, 1, word] as const),
    ['HOP 12 GOI', 'COUNT', 12, 1, 'gói'],
    ['Combo 2 hộp 30 viên', 'COUNT', 30, 2, 'viên'],
    ['Hộp 12 gói x 20g', 'MASS', 20, 12, null],
    ['Bột 500g (100 viên)', 'MASS', 500, 1, null],
    ['Bột 500g [100 viên]', 'MASS', 500, 1, null],
    ['Bột 500g/100 viên', 'MASS', 500, 1, null],
    ['Sữa tắm 200ml (30 viên)', 'VOLUME', 200, 1, null],
    ['Bánh 500g … 500g', 'MASS', 500, 1, null],
    ...['x3', '3x', 'x 3', 'combo 3', 'set 3', 'bộ 3', 'lốc 6', 'thùng 24', 'pack 3'].map(token =>
      [`Bánh 20g ${token}`, 'MASS', 20, token === 'lốc 6' ? 6 : token === 'thùng 24' ? 24 : 3, null] as const),
    ['Quạt đứng 16 inch', 'ITEM', 1, 1, null],
    ['Son 3CE', 'ITEM', 1, 1, null],
    ['Máy ảnh X100V', 'ITEM', 1, 1, null],
    ['Quạt x100s', 'ITEM', 1, 1, null],
    ['Kem dưỡng x100s 50g', 'MASS', 50, 1, null],
    ...['x3', 'x 3', '3x'].map(token => [`Máy ảnh X100V ${token}`, 'ITEM', 1, 3, null] as const),
    ['Điện thoại 5G', 'ITEM', 1, 1, null],
    ['SIM 4g', 'ITEM', 1, 1, null],
    ['Giày size 40 năm 2026 100%', 'ITEM', 1, 1, null],
    ['Quạt 30x40cm 45w 2000mah', 'ITEM', 1, 1, null],
    // Dimensions and explicitly labelled model codes describe one item, not a pack.
    ['Khăn 30cm x 50cm 100g', 'MASS', 100, 1, null],
    ['Khăn 30cm x 50cm 100g x3', 'MASS', 100, 3, null],
    ['Mực in model X3 100g', 'MASS', 100, 1, null],
    ['Mực in model X3 100g pack 2', 'MASS', 100, 2, null],
    ['Mực in model X3-100G', 'ITEM', 1, 1, null],
    ['Mực in model X3-100G 200g', 'MASS', 200, 1, null],
    ['Nước hoa model X2-50ML 100ml', 'VOLUME', 100, 1, null],
    ['Khăn model X3-12CAI 6 cái', 'COUNT', 6, 1, 'cái'],
    ['Bánh 100g x3', 'MASS', 100, 3, null],
    ['🍪 Bánh 100g', 'MASS', 100, 1, null],
    ['🥿 Giày', 'ITEM', 1, 1, null],
    ['2026 40 100', 'ITEM', 1, 1, null],
    [`${'Mô tả mẫu '.repeat(500)}100g`, 'MASS', 100, 1, null],
    ['Hộp 12 gói'.normalize('NFD'), 'COUNT', 12, 1, 'gói'],
    ['Giày', 'ITEM', 1, 1, null],
    ['Bộ 3 quạt', 'ITEM', 1, 3, null],
    ['Bánh 5g', 'MASS', 5, 1, null],
  ];
  for (const [title, kind, perItem, multiplier, countKind] of cases) {
    const parsed = parseTitleQuantity(title);
    assert.equal(parsed.state, 'ONE', title);
    if (parsed.state !== 'ONE') assert.fail(title);
    assert.deepEqual({ kind: parsed.kind, perItem: parsed.perItem, multiplier: parsed.multiplier,
      total: parsed.total, countKind: parsed.countKind }, { kind, perItem, multiplier, total: perItem * multiplier, countKind }, title);
  }
  for (const title of ['Thạch dừa 100g/500g', 'Bánh 100g - 500g', 'Kem 500g 1kg'])
    assert.deepEqual(parseTitleQuantity(title), { state: 'MANY', reason: 'MULTIPLE_SIZES' }, title);
  assert.deepEqual(parseTitleQuantity('Kem 100g 200ml'), { state: 'MANY', reason: 'MIXED_KINDS' });
  assert.deepEqual(parseTitleQuantity('Bánh 20g x2 combo 3'), { state: 'MANY', reason: 'MULTIPLE_MULTIPLIERS' });
  for (const title of ['', ' \t\n ']) assert.deepEqual(parseTitleQuantity(title), { state: 'NONE' });
  assert.equal((parseTitleQuantity('Hộp 12 gói x 20g') as { matched: string }).matched, '12 gói · 20g');
  assert.equal((parseTitleQuantity('Bánh 500g … 500g') as { matched: string }).matched, '500g');
  for (const title of ['Khăn 30cm x 50cm 100g', 'Mực in model X3 100g', '🍪 Bánh 100g'])
    assert.equal((parseTitleQuantity(title) as { matched: string }).matched, '100g', title);
  for (const [title, matched] of [
    ['Mực in model X3-100G', ''], ['Mực in model X3-100G 200g', '200g'],
    ['Nước hoa model X2-50ML 100ml', '100ml'], ['Khăn model X3-12CAI 6 cái', '6 cái'],
  ] as const) assert.equal((parseTitleQuantity(title) as { matched: string }).matched, matched, title);
  for (const [title, , , , , matched] of labelledCodes)
    assert.equal((parseTitleQuantity(title) as { matched: string }).matched, matched, title);
  for (const title of ['Máy ảnh X100V', 'Quạt x100s'])
    assert.equal((parseTitleQuantity(title) as { matched: string }).matched, '', 'model suffixes are not pack evidence');
  assert.equal((parseTitleQuantity('Kem dưỡng x100s 50g') as { matched: string }).matched, '50g');
  assert.equal((parseTitleQuantity('Hộp 12 gói'.normalize('NFD')) as { matched: string }).matched, '12 gói');
});

test('C2 chooseUnitProfile: revenue majority, inclusive half and distinct count kinds', () => {
  assert.deepEqual(chooseUnitProfile([row('Bánh 100g', 50), row('Thạch dừa 100g/500g', 50)]),
    { kind: 'MASS', countKind: null, standard: 'đồng/100g', convertedRevenueShare: 0.5 });
  assert.equal(chooseUnitProfile([row('Bánh 100g', 49), row('Thạch dừa 100g/500g', 51)]), null,
    'ambiguous revenue stays in the denominator');
  const mixed = [row('Trà 12 gói', 40), row('Nước hoa 100ml', 35), row('Quạt đứng 16 inch', 25)];
  assert.equal(chooseUnitProfile(mixed), null, 'the largest group holds only 40%, not a majority');
  assert.equal(chooseUnitProfile([row('Trà 12 gói', 30), row('Khăn 12 túi', 30), row('Giày size 40', 40)]), null,
    'gói and túi must not merge into a 60% COUNT group');
  for (const [title, expected] of [
    ['Sữa tắm 200ml', profile('VOLUME', 'đồng/100ml')],
    ['Trà 12 gói', profile('COUNT', 'đồng/gói', 'gói')],
    ['Son 3CE', profile('ITEM', 'đồng/sản phẩm')],
  ] as const) assert.deepEqual(chooseUnitProfile([row(title, 100, null)]), expected);
  assert.equal(chooseUnitProfile([]), null);
  assert.equal(chooseUnitProfile([row('Bánh 100g', 0)]), null);
});

test('C3 projectTitleUnitPrices: converted prices retain evidence and rejected rows retain n', () => {
  const mass = profile('MASS', 'đồng/100g');
  const rows = [row('Bột 500g x2'), row('Thạch dừa 100g/500g'), row('Nước hoa 100ml'),
    row('Bánh 100g', 0), row('Bánh 100g', -10), row('Bánh 100g', null),
    row('Bánh 100g', 100, 0), row('Bánh 100g', 100, -1), row('Bánh 100g', 100, null), row('')];
  const projected = projectTitleUnitPrices(rows, mass);
  assert.equal(projected.totalCount, 10);
  assert.equal(projected.convertedCount, 1);
  assert.equal(projected.rows[0]!.unitPrice, 6000, '(120000 / 2) / (500 * 2) * 100');
  for (const [title, expected] of [
    ['Khăn 30cm x 50cm 100g', 60_000], ['Mực in model X3 100g', 60_000], ['Bánh 100g x3', 20_000],
  ] as const) assert.equal(projectTitleUnitPrices([row(title)], mass).rows[0]!.unitPrice, expected, title);
  assert.deepEqual({ label: projected.rows[0]!.label, basis: projected.rows[0]!.basis, matched: projected.rows[0]!.matched },
    { label: 'đồng/100g', basis: 'quy cách theo tên sản phẩm', matched: '500g · x2' });
  for (const price of projected.rows.slice(1)) assert.deepEqual(
    { unitPrice: price.unitPrice, label: price.label, basis: price.basis, matched: price.matched },
    { unitPrice: null, label: 'chưa quy đổi được', basis: null, matched: null });
  for (const [title, selected, expected] of [
    ['Sữa tắm 200ml', profile('VOLUME', 'đồng/100ml'), 30_000],
    ['Trà 12 gói', profile('COUNT', 'đồng/gói', 'gói'), 5000],
    ['Trà 12 túi', profile('COUNT', 'đồng/gói', 'gói'), null],
    ['Quạt đứng 16 inch', profile('ITEM', 'đồng/sản phẩm'), 60_000],
    ['Son 3CE', profile('ITEM', 'đồng/sản phẩm'), 60_000],
    ['Điện thoại 5G', profile('ITEM', 'đồng/sản phẩm'), 60_000],
    ['Máy ảnh X100V', profile('ITEM', 'đồng/sản phẩm'), 60_000],
    ['Quạt x100s', profile('ITEM', 'đồng/sản phẩm'), 60_000],
    ...['x3', 'x 3', '3x'].map(token =>
      [`Máy ảnh X100V ${token}`, profile('ITEM', 'đồng/sản phẩm'), null] as const),
    ['Bộ 3 giày', profile('ITEM', 'đồng/sản phẩm'), null],
  ] as const) assert.equal(projectTitleUnitPrices([row(title)], selected).rows[0]!.unitPrice, expected, title);
  const durables = ['Máy ảnh X100V', 'Quạt x100s', 'Son 3CE', 'Giày size 40', 'Điện thoại 5G', 'Quạt đứng 16 inch'].map(title => row(title));
  const durablePrices = projectTitleUnitPrices(durables, chooseUnitProfile(durables));
  assert.deepEqual({ convertedCount: durablePrices.convertedCount, totalCount: durablePrices.totalCount },
    { convertedCount: 6, totalCount: 6 }, 'model suffixes must not remove single items from comparison');
  assert.deepEqual(durablePrices.rows.map(price => price.unitPrice), Array(6).fill(60_000));
  assert.equal(projectTitleUnitPrices([row('Bánh 100g')], null).convertedCount, 0);
  assert.equal(projectTitleUnitPrices([row('Bánh 100g', Number.MAX_VALUE, Number.MIN_VALUE)], mass).rows[0]!.unitPrice, null,
    'an infinite result is not a price');
});

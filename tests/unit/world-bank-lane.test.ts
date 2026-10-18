import assert from 'node:assert/strict';
import test from 'node:test';
import type { StepWorldBankIndicator, StepWorldBankRow } from '../../src/modules/analysis/research-automation/model.js';
import { formatWorldBankValue, worldBankTableNote, worldBankUnitText, WORLD_BANK_NOTE } from '../../src/modules/analysis/research-automation/world-bank-lane.js';

const row: StepWorldBankRow = { indicatorName: 'Dân số cả nước', value: '1234.5', unit: null, year: '2024', lastUpdated: '2026-01-01',
  statusLiteral: '', footnote: null, locator: '/1/0' };
const item = (fields: Partial<StepWorldBankRow>): StepWorldBankIndicator => ({ code: 'SP.POP.TOTL', status: 'COLLECTED', reason: null,
  retrievedAt: '2026-01-01T00:00:00.000Z', captureIndex: 1, metadataCaptureIndex: 2, sourceSha256: 'a'.repeat(64), metadataSha256: 'b'.repeat(64), row: { ...row, ...fields } });

test('source precision rounds exact decimal strings half away from zero, including carries and unsafe integers', () => {
  for (const [value, decimal, expected] of [
    ['2381.8882523638', 0, '2.382'], ['101598527', 0, '101.598.527'],
    ['1234.5', 0, '1.235'], ['-1234.5', 0, '-1.235'], ['-1234.499999999999999999', 0, '-1.234'],
    ['1.005', 2, '1,01'], ['-1.005', 2, '-1,01'], ['999.995', 2, '1.000,00'], ['9.995', 2, '10,00'],
    ['9007199254740993.5', 0, '9.007.199.254.740.994'], ['-9007199254740993.5', 0, '-9.007.199.254.740.994'],
    ['0.000000000000000000005', 20, '0,00000000000000000001'],
    ['12', 3, '12,000'], ['1.2', 3, '1,200'], ['12.3400', 2, '12,34'], ['0', 0, '0'], ['-0', 0, '0'],
    ['-0.00', 2, '0,00'], ['-0.4', 0, '0'], ['-0.5', 0, '-1'],
  ] as const) assert.equal(formatWorldBankValue(value, decimal), expected, `${value} at ${decimal} places`);
});

test('absent precision preserves old World Bank and Comtrade exact digits', () => {
  for (const [value, expected] of [['1234.5000', '1.234,5000'], ['2381.8882523638', '2.381,8882523638'],
    ['-9007199254740993.5000', '-9.007.199.254.740.993,5000'], ['0', '0'], ['-0.00', '-0,00'], ['not a number', 'not a number']])
    assert.equal(formatWorldBankValue(value!), expected);
});

test('units prefer the source unit; only exact source-name patterns can supply a missing unit', () => {
  const unit = (name: string, code = 'NE.CON.PRVT.PC.KD', explicit: string | null = null) =>
    worldBankUnitText({ ...row, sourceIndicatorName: name, unit: explicit }, code);
  assert.equal(unit('Households and NPISHs Final consumption expenditure per capita (constant 2015 US$)'), 'USD, giá cố định năm 2015');
  assert.equal(unit('GDP (constant 2020 US$)'), 'USD, giá cố định năm 2020');
  assert.equal(unit('GDP (current US$)'), 'USD, giá hiện hành');
  assert.equal(unit('Population, total', 'SP.POP.TOTL'), 'người');
  assert.equal(unit('Population, total', 'SP.POP.TOTL', '  người nguồn  '), '  người nguồn  ');
  assert.equal(unit('GDP (constant 2015 US$)', 'NE.CON.PRVT.PC.KD', 'EUR'), 'EUR');
  assert.equal(unit('GDP (current US$)', 'NE.CON.PRVT.PC.KD', ' \t '), 'USD, giá hiện hành');
  for (const name of ['Population, total', 'Population, total ', 'population, total', 'Population total', 'GDP (constant 2015 USD)',
    'GDP (Constant 2015 US$)', 'GDP (constant 15 US$)', 'GDP (current USD)', 'GDP (current US$ )', 'Synthetic population indicator', 'GDP (%)'])
    assert.equal(unit(name), 'nguồn chưa ghi đơn vị', name);
  assert.equal(unit('Population, total ', 'SP.POP.TOTL'), 'nguồn chưa ghi đơn vị');
  assert.equal(worldBankUnitText({ ...row, indicatorName: 'Population, total' }, 'SP.POP.TOTL'), 'nguồn chưa ghi đơn vị', 'old display names are not source evidence');
});

test('table notes retain old bytes and disclose rounding only for drawn values that lose nonzero digits', () => {
  assert.equal(worldBankTableNote([item({})]), 'Số liệu của cả nước Việt Nam, chỉ để làm nền: không nói về sản phẩm này và không so sánh được với số liệu mẫu trong báo cáo. Đơn vị giữ nguyên như nguồn; đây không phải một nguồn xác nhận độc lập.');
  assert.equal(worldBankTableNote([item({ decimal: 0, value: '101598527' })]), WORLD_BANK_NOTE);
  assert.equal(worldBankTableNote([item({ decimal: 2, value: '12.3400' })]), WORLD_BANK_NOTE);
  const note = worldBankTableNote([item({ decimal: 0 }), item({ decimal: 2, value: '-1.001' })]);
  assert.equal(note, WORLD_BANK_NOTE + ' Các giá trị được làm tròn theo độ chính xác do nguồn công bố.');
});

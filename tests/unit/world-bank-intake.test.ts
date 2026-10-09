import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWorldBankSource, rejectMacroSampleArithmetic, WorldBankSourceRejection } from '../../src/modules/analysis/research-automation/world-bank-intake.js';
import { inspectOfficialStatisticsSource, OfficialStatisticsSourceRejection } from '../../src/modules/analysis/research-automation/official-statistics-intake.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';

const inspect = (f: ReturnType<typeof worldBankFixture>) => inspectWorldBankSource(f.observations, f.metadata, f.sourceUrl, f.metadataUrl);
test('original numeric tokens retain exact decimals, null, zero, blank units and literal notes for both fixed indicators', () => {
  for (const code of ['SP.POP.TOTL', 'NE.CON.PRVT.PC.KD']) {
    const f = worldBankFixture(code), p = inspect(f);
    assert.equal(p.rows[0]!.value, '12345678901234567890.123456789');
    assert.equal(p.rows[0]!.valueLexeme, '12345678901234567890.123456789');
    assert.equal(p.rows[1]!.value, '0'); assert.equal(p.rows[2]!.value, null);
    assert.equal(p.rows[0]!.unit, null); assert.equal(p.rows[0]!.unitLiteral, '');
    assert.equal(p.rows[0]!.footnote, 'Synthetic estimate note'); assert.equal(p.rows[1]!.footnote, null);
    assert.equal(p.rows[0]!.statusLiteral, ''); assert.equal(p.rows[0]!.locator, '/1/0');
    assert.equal(p.rows[0]!.lastUpdated, '2026-07-13');
    assert.deepEqual(inspect(f), p);
  }
});
test('source decimal exponents expand without rounding or unsafe Number reencoding', () => {
  const p = inspect(worldBankFixture('SP.POP.TOTL', ['9.001e22', '-12.50e-2']));
  assert.equal(p.rows[0]!.value, '90010000000000000000000');
  assert.equal(p.rows[1]!.value, '-0.1250');
  assert.equal(p.rows[0]!.valueLexeme, '9.001e22');
});
test('country/code/name/year/dataset/unit/header corruption and incomplete pages reject before admission', () => {
  const changes: [string, string][] = [['"id":"VN"', '"id":"US"'], ['"countryiso3code":"VNM"', '"countryiso3code":"USA"'],
    ['"date":"2024"', '"date":"2025"'], ['"sourceid":"2"', '"sourceid":"3"'],
    ['"pages":1', '"pages":2'], ['"lastupdated":"2026-07-13"', '"lastupdated":"2026-02-30"'],
    ['"unit":""', '"unit":"invented USD"'], ['"value":"Synthetic population indicator"', '"value":"Other indicator"']];
  for (const [before, after] of changes) {
    const f = worldBankFixture(); f.observations = Buffer.from(f.observations.toString().replace(before, after));
    assert.throws(() => inspect(f), WorldBankSourceRejection, `${before} must fail`);
  }
  assert.throws(() => inspect(worldBankFixture('UNREVIEWED.CODE')), WorldBankSourceRejection);
  const f = worldBankFixture(); f.sourceUrl += '&redirect=elsewhere'; assert.throws(() => inspect(f), WorldBankSourceRejection);
});
test('E13 condition needs actual nonmissing multiple years, and ambiguous/quoted numeric evidence rejects', () => {
  for (const values of [['1'], ['1', 'null'], ['"9007199254740993"', '1'], ['1e999', '1']]) {
    assert.throws(() => inspect(worldBankFixture('SP.POP.TOTL', values)), WorldBankSourceRejection);
  }
  const f = worldBankFixture(); f.observations = Buffer.from(f.observations.toString().replace('"date":"2025"', '"date":"2024","date":"2025"'));
  assert.throws(() => inspect(f), (e: unknown) => e instanceof WorldBankSourceRejection && e.code === 'DUPLICATE_JSON_KEY');
  assert.throws(() => inspect({ ...worldBankFixture(), metadata: Buffer.from([0xff]) }), WorldBankSourceRejection);
});
test('unwitnessed official XLSX remains unavailable and a real attempted mixed ratio rejects', () => {
  assert.throws(() => inspectOfficialStatisticsSource(Buffer.from('synthetic unrecognized workbook')),
    (e: unknown) => e instanceof OfficialStatisticsSourceRejection && e.code === 'OFFICIAL_STATS_LAYOUT_UNKNOWN');
  assert.throws(() => inspectOfficialStatisticsSource(Buffer.alloc(20 * 1024 * 1024 + 1)),
    (e: unknown) => e instanceof OfficialStatisticsSourceRejection && e.code === 'OFFICIAL_STATS_FILE_SIZE_LIMIT');
  assert.throws(() => rejectMacroSampleArithmetic('DIVIDE', '20', '100'),
    (e: unknown) => e instanceof WorldBankSourceRejection && e.code === 'MACRO_SAMPLE_ARITHMETIC_FORBIDDEN');
});

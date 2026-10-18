import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWorldBankSource, rejectMacroSampleArithmetic, worldBankUrls, WorldBankSourceRejection } from '../../src/modules/analysis/research-automation/world-bank-intake.js';
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
  for (const values of [['1'], ['1', 'null'], ['"9007199254740993"', '1'], ['{"numericLexeme":"9007199254740993"}', '1'], ['1e999', '1']]) {
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

test('the automated source=2 per_page=100 observation URL is accepted for a 66-row page with early nulls; the earlier forms still are; nothing else is', () => {
  const code = 'NE.CON.PRVT.PC.KD', values = Array.from({ length: 66 }, (_, i) => i >= 40 ? 'null' : String(1000 + i));
  const f = worldBankFixture(code, values), urls = worldBankUrls(code);
  assert.equal(urls.sourceUrl, `https://api.worldbank.org/v2/country/VN/indicator/${code}?source=2&format=json&per_page=100`);
  assert.equal(urls.perPageSourceUrl, `${f.sourceUrl}&per_page=100`);
  assert.equal(urls.legacySourceUrl, f.sourceUrl);
  const p = inspectWorldBankSource(f.observations, f.metadata, urls.sourceUrl, f.metadataUrl);
  assert.equal(p.rows.length, 66);
  assert.equal(inspectWorldBankSource(f.observations, f.metadata, urls.perPageSourceUrl, f.metadataUrl).rows.length, 66);
  assert.equal(inspectWorldBankSource(f.observations, f.metadata, f.sourceUrl, f.metadataUrl).rows.length, 66);
  const base = f.sourceUrl.slice(0, f.sourceUrl.indexOf('?'));
  for (const other of [`${f.sourceUrl}&per_page=50`, `${urls.sourceUrl}&x=1`, `${f.sourceUrl}&per_page=100&per_page=100`, `${f.sourceUrl}&per_page=1000`, `${f.sourceUrl}&page=2`,
    `${base}?source=3&format=json&per_page=100`, `${base}?format=json&per_page=100&source=2`, `${base}?source=2&format=json`])
    assert.throws(() => inspectWorldBankSource(f.observations, f.metadata, other, f.metadataUrl), WorldBankSourceRejection, other);
});

test('a single-row answer without a dataset id (what the API now returns without source=) is refused, not shown as the latest value', () => {
  const f = worldBankFixture('SP.POP.TOTL', ['101598527']), urls = worldBankUrls('SP.POP.TOTL');
  const observations = Buffer.from(f.observations.toString().replace(/"sourceid":"[^"]*"/, '"sourceid":null'));
  assert.notEqual(observations.toString(), f.observations.toString());
  for (const url of [urls.sourceUrl, urls.perPageSourceUrl])
    assert.throws(() => inspectWorldBankSource(observations, f.metadata, url, f.metadataUrl), (e: unknown) => e instanceof WorldBankSourceRejection && e.code === 'DATASET_MISMATCH');
});

test('a two-page answer is still rejected on the per_page=100 URL', () => {
  const f = worldBankFixture('SP.POP.TOTL', ['1', '2']), urls = worldBankUrls('SP.POP.TOTL');
  const paged = Buffer.from(f.observations.toString().replace('"pages":1', '"pages":2'));
  assert.throws(() => inspectWorldBankSource(paged, f.metadata, urls.sourceUrl, f.metadataUrl), (e: unknown) => e instanceof WorldBankSourceRejection && e.code === 'INCOMPLETE_PAGE');
});

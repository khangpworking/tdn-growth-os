// Offline builder for the S28 whole-population baseline file. Pure: CSV text in, three count tables out.
// Reads only the count columns (region, zone, sex, age_band, n); education and occupation are summed away.
import type { PopulationBaselineV1 } from '../../../../contracts/analysis/population-baseline-v1.generated.js';
import { checkPopulationBaseline } from './population-baseline.js';

export class PopulationBaselineBuildError extends Error {}

const HEADER = ['region', 'zone', 'sex', 'age_band', 'education_level', 'occupation', 'n'];
const SEX: Readonly<Record<string, 'MALE' | 'FEMALE'>> = { Nam: 'MALE', 'Nữ': 'FEMALE' };
const ZONE: Readonly<Record<string, 'URBAN' | 'RURAL'>> = { 'Đô Thị': 'URBAN', 'Nông Thôn': 'RURAL' };
const REGIONS = new Set(['Trung du và miền núi phía Bắc', 'Đồng bằng sông Hồng', 'Bắc Trung Bộ và Duyên hải miền Trung', 'Tây Nguyên',
  'Đông Nam Bộ', 'Đồng bằng sông Cửu Long']);
const AGE_BANDS = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90]);

/** RFC 4180 records: quoted fields may hold commas, doubled quotes and line breaks. */
function* csvRecords(text: string): Generator<string[]> {
  let field = '', record: string[] = [], quoted = false, i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      yield record; record = [];
    } else field += c;
  }
  if (quoted) throw new PopulationBaselineBuildError('CSV ends inside a quoted field');
  if (field !== '' || record.length) { record.push(field); yield record; }
}

export function buildPopulationBaseline(csv: string, sourceRevision: string, builtAt: string): PopulationBaselineV1 {
  const sexAge = new Map<string, number>(), region = new Map<string, number>(), zone = new Map<string, number>();
  let rowCount = 0, total = 0, header = true;
  for (const record of csvRecords(csv)) {
    if (header) {
      if (record.join(',') !== HEADER.join(',')) throw new PopulationBaselineBuildError('CSV header differs from region,zone,sex,age_band,education_level,occupation,n');
      header = false; continue;
    }
    if (record.length === 1 && record[0] === '') continue;
    const line = rowCount + 2;
    if (record.length !== HEADER.length) throw new PopulationBaselineBuildError(`CSV row ${line} has ${record.length} fields`);
    const [regionName, zoneName, sexName, band, , , count] = record as [string, string, string, string, string, string, string];
    const sex = SEX[sexName], zoneCode = ZONE[zoneName], ageBand = Number(band), n = Number(count);
    if (!REGIONS.has(regionName) || !sex || !zoneCode || !/^\d+$/u.test(band) || !AGE_BANDS.has(ageBand) || !/^\d+$/u.test(count) || !Number.isSafeInteger(n))
      throw new PopulationBaselineBuildError(`CSV row ${line} has a value outside the expected set`);
    rowCount++; total += n;
    sexAge.set(`${sex}:${ageBand}`, (sexAge.get(`${sex}:${ageBand}`) ?? 0) + n);
    region.set(regionName, (region.get(regionName) ?? 0) + n);
    zone.set(zoneCode, (zone.get(zoneCode) ?? 0) + n);
  }
  if (rowCount === 0) throw new PopulationBaselineBuildError('CSV has no data rows');
  const value = {
    contractVersion: 'population-baseline-v1', sourceRevision, rowCount, builtAt, total,
    sexAge: { total, rows: [...sexAge].map(([key, n]) => { const [sex, band] = key.split(':'); return { sex, ageBand: Number(band), n }; })
      .sort((a, b) => a.ageBand - b.ageBand || (a.sex === 'MALE' ? -1 : 1)) },
    region: { total, rows: [...region].map(([name, n]) => ({ region: name, n })).sort((a, b) => a.region.localeCompare(b.region, 'vi')) },
    zone: { total, rows: [...zone].map(([code, n]) => ({ zone: code, n })).sort((a, b) => a.zone.localeCompare(b.zone)) },
  };
  if (!checkPopulationBaseline(value)) throw new PopulationBaselineBuildError('Built file does not match population-baseline-v1');
  return value;
}

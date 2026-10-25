// Whole-population baseline lane (S28) for Insight I02. Off unless the flag is exactly "1".
//
// Reads one small built file (scripts/build-population-baseline.ts) from a local absolute path: no network, no paid call.
// The numbers are simulated population counts, used only as an unnamed "mốc toàn dân" beside the customer evidence,
// never as evidence about buyers. Reader text never names the dataset, its publisher or the model.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import schema from '../../../../contracts/analysis/population-baseline-v1.schema.json' with { type: 'json' };
import type { PopulationBaselineV1 } from '../../../../contracts/analysis/population-baseline-v1.generated.js';
import { sha256 } from './provider-common.js';
import type { ProviderRawCapture } from './providers.js';
import type { StepPopulationBaseline, StepResultDocument } from './model.js';
import { worldBankRenderableRows } from './world-bank-lane.js';

export type { PopulationBaselineV1 } from '../../../../contracts/analysis/population-baseline-v1.generated.js';
export const POPULATION_BASELINE_FLAG = 'TDN_RESEARCH_POPULATION_BASELINE_ENABLED';
export const POPULATION_BASELINE_PATH_ENV = 'TDN_RESEARCH_POPULATION_BASELINE_PATH';
export const POPULATION_BASELINE_PROVIDER = 'POPULATION-BASELINE' as const;
export const POPULATION_BASELINE_OPERATION = 'populationbaseline.read' as const;
export const POPULATION_BASELINE_PROFILE = 'population-baseline-v1' as const;
export const MAX_POPULATION_BASELINE_BYTES = 256 * 1024;
export const POPULATION_BASELINE_NOTE = 'Mốc toàn dân từ dữ liệu dân số mô phỏng, không phải người mua.';
export const POPULATION_BASELINE_NOT_COMPARED = 'chưa so với số dân chính thức';

export type PopulationBaselineSkip = 'FLAG_OFF' | 'NOT_INSIGHT_RUN' | 'FILE_MISSING' | 'FILE_INVALID';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
const validateSchema = ajv.compile<PopulationBaselineV1>(schema);

/** Schema plus the arithmetic the schema cannot state: every table sums to its total, every total equals the file total, no key repeats. */
export function checkPopulationBaseline(value: unknown): value is PopulationBaselineV1 {
  if (!validateSchema(value)) return false;
  const tables = [
    { total: value.sexAge.total, keys: value.sexAge.rows.map(row => `${row.sex}:${row.ageBand}`), counts: value.sexAge.rows.map(row => row.n) },
    { total: value.region.total, keys: value.region.rows.map(row => row.region), counts: value.region.rows.map(row => row.n) },
    { total: value.zone.total, keys: value.zone.rows.map(row => row.zone), counts: value.zone.rows.map(row => row.n) },
  ];
  return tables.every(table => table.keys.length > 0 && new Set(table.keys).size === table.keys.length && table.total === value.total &&
    table.counts.reduce((sum, n) => sum + n, 0) === table.total);
}

export interface PopulationBaselineConfig { readonly path: string }
/** Flag exactly "1" turns the lane on; then the path must be an absolute file path, otherwise start-up fails. Any other flag value is off. */
export function populationBaselineConfig(env: Readonly<Record<string, string | undefined>>): PopulationBaselineConfig | null {
  if (env[POPULATION_BASELINE_FLAG] !== '1') return null;
  const file = env[POPULATION_BASELINE_PATH_ENV];
  if (typeof file !== 'string' || file === '' || file.trim() !== file || !path.isAbsolute(file) || path.normalize(file) !== file || /[\0\r\n]/u.test(file))
    throw new TypeError(`${POPULATION_BASELINE_PATH_ENV} must be an absolute normalized file path when ${POPULATION_BASELINE_FLAG} is 1`);
  return { path: file };
}

/** One read. A skipped read keeps a reason code only; nothing is retried or repaired. */
export interface PopulationBaselineAttempt {
  readonly reason: PopulationBaselineSkip | null;
  readonly baseline: PopulationBaselineV1 | null;
  readonly sourceSha256: string | null;
  readonly capture: ProviderRawCapture | null;
}

/** The executor-side port. */
export interface PopulationBaselineSource {
  read(input: { readonly reports: readonly string[] }): Promise<PopulationBaselineAttempt>;
}

const skipped = (reason: PopulationBaselineSkip): PopulationBaselineAttempt => ({ reason, baseline: null, sourceSha256: null, capture: null });

export function createPopulationBaselineSource(config: PopulationBaselineConfig | null, now: () => Date = () => new Date()): PopulationBaselineSource {
  return {
    async read({ reports }) {
      if (!config) return skipped('FLAG_OFF');
      if (!reports.includes('INSIGHT')) return skipped('NOT_INSIGHT_RUN');
      const requestedAt = now().toISOString();
      let bytes: Buffer;
      try {
        const handle = await fs.open(config.path, 'r');
        try {
          const stat = await handle.stat();
          if (!stat.isFile()) return skipped('FILE_MISSING');
          if (stat.size > MAX_POPULATION_BASELINE_BYTES) return skipped('FILE_INVALID');
          bytes = await handle.readFile();
        } finally { await handle.close(); }
      } catch { return skipped('FILE_MISSING'); }
      if (bytes.byteLength > MAX_POPULATION_BASELINE_BYTES) return skipped('FILE_INVALID');
      let value: unknown;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { return skipped('FILE_INVALID'); }
      if (!checkPopulationBaseline(value)) return skipped('FILE_INVALID');
      const digest = sha256(bytes);
      const capture: ProviderRawCapture = {
        captureId: 'population-baseline-0001', provider: POPULATION_BASELINE_PROVIDER, operation: POPULATION_BASELINE_OPERATION,
        billing: 'FREE_ACCOUNT_QUERY', method: 'GET', endpoint: `file:///${path.basename(config.path)}`,
        requestParameters: { sourceRevision: value.sourceRevision }, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null,
        requestedAt, completedAt: now().toISOString(), outcome: 'OK', httpStatus: null,
        responseBytes: bytes, responseSha256: digest, responseByteLength: bytes.byteLength, providerCode: null,
      };
      return { reason: null, baseline: value, sourceSha256: digest, capture };
    },
  };
}

/** The stored step field; `captureIndex` is the step capture ordinal of the stored read. Null for a run that does not keep the field. */
export function populationBaselineDocument(attempt: PopulationBaselineAttempt, captureIndex: number | null): StepPopulationBaseline | null {
  if (attempt.reason === 'FLAG_OFF' || attempt.reason === 'NOT_INSIGHT_RUN') return null;
  if (attempt.reason === null && attempt.baseline && attempt.capture && attempt.sourceSha256 && captureIndex !== null)
    return { profile: POPULATION_BASELINE_PROFILE, status: 'COLLECTED', reason: null, captureIndex, retrievedAt: attempt.capture.completedAt,
      sourceSha256: attempt.sourceSha256, baseline: attempt.baseline };
  return { profile: POPULATION_BASELINE_PROFILE, status: 'SKIPPED', reason: attempt.reason === 'FILE_MISSING' ? 'FILE_MISSING' : 'FILE_INVALID',
    captureIndex: null, retrievedAt: null, sourceSha256: null, baseline: null };
}

/** Stored-document check used when a step document is read back. */
export function validPopulationBaseline(value: unknown): value is StepPopulationBaseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join() !== 'baseline,captureIndex,profile,reason,retrievedAt,sourceSha256,status' || item.profile !== POPULATION_BASELINE_PROFILE) return false;
  if (item.status === 'SKIPPED') return (item.reason === 'FILE_MISSING' || item.reason === 'FILE_INVALID') && item.captureIndex === null &&
    item.retrievedAt === null && item.sourceSha256 === null && item.baseline === null;
  return item.status === 'COLLECTED' && item.reason === null && Number.isSafeInteger(item.captureIndex) && (item.captureIndex as number) >= 0 &&
    typeof item.retrievedAt === 'string' && Number.isFinite(Date.parse(item.retrievedAt)) && typeof item.sourceSha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(item.sourceSha256) && checkPopulationBaseline(item.baseline);
}

type Collected = Extract<StepPopulationBaseline, { status: 'COLLECTED' }>;
/** The one predicate shared by the renderers and the source packet: S28 is used only when the I02 block is drawn. */
export const populationBaselineRenderable = (value: StepPopulationBaseline | null | undefined): value is Collected =>
  Boolean(value) && validPopulationBaseline(value) && value!.status === 'COLLECTED';

const AGE_LABELS: Readonly<Record<number, string>> = { 10: '18–19', 20: '20–29', 30: '30–39', 40: '40–49', 50: '50–59', 60: '60–69', 70: '70–79', 80: '80–89', 90: '90' };
const SEX_LABELS = { MALE: 'Nam', FEMALE: 'Nữ' } as const;
const ZONE_LABELS = { URBAN: 'Thành thị', RURAL: 'Nông thôn' } as const;
const REGION_ORDER: readonly PopulationBaselineV1['region']['rows'][number]['region'][] = ['Trung du và miền núi phía Bắc', 'Đồng bằng sông Hồng',
  'Bắc Trung Bộ và Duyên hải miền Trung', 'Tây Nguyên', 'Đông Nam Bộ', 'Đồng bằng sông Cửu Long'];
const esc = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const percent = (n: number, total: number): number => total > 0 ? n * 100 / total : 0;
/** One decimal, Vietnamese comma. */
const pct = (value: number): string => `${value.toFixed(1).replace('.', ',')}%`;
const count = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
/** The table date: the day the file was built, Vietnam time. */
const dataDate = (builtAt: string): string => {
  const day = new Date(Date.parse(builtAt) + 7 * 3600_000).toISOString().slice(0, 10).split('-');
  return `${day[2]}/${day[1]}/${day[0]}`;
};

export interface PopulationBaselineShares {
  readonly total: number;
  readonly sexAge: readonly { readonly ageBand: number; readonly male: number; readonly female: number }[];
  readonly female: number;
  readonly region: readonly { readonly region: string; readonly share: number }[];
  readonly urban: number;
}
/** Shares in percent of each table's own total (unrounded). */
export function populationBaselineShares(baseline: PopulationBaselineV1): PopulationBaselineShares {
  const cell = (sex: 'MALE' | 'FEMALE', band: number) => baseline.sexAge.rows.find(row => row.sex === sex && row.ageBand === band)?.n ?? 0;
  const bands = [...new Set(baseline.sexAge.rows.map(row => row.ageBand))].sort((a, b) => a - b);
  return {
    total: baseline.total,
    sexAge: bands.map(band => ({ ageBand: band, male: percent(cell('MALE', band), baseline.sexAge.total), female: percent(cell('FEMALE', band), baseline.sexAge.total) })),
    female: percent(baseline.sexAge.rows.filter(row => row.sex === 'FEMALE').reduce((sum, row) => sum + row.n, 0), baseline.sexAge.total),
    region: REGION_ORDER.flatMap(region => {
      const row = baseline.region.rows.find(item => item.region === region);
      return row ? [{ region, share: percent(row.n, baseline.region.total) }] : [];
    }),
    urban: percent(baseline.zone.rows.find(row => row.zone === 'URBAN')?.n ?? 0, baseline.zone.total),
  };
}

/** Official figure of the run for one dimension, when the run kept a comparable indicator (percent of the whole population). */
interface OfficialShare { readonly value: number; readonly year: string }
/** Comparable official indicators. The run's official lane keeps only these codes when it has them; age structure has none. */
const OFFICIAL_FEMALE_SHARE = 'SP.POP.TOTL.FE.ZS', OFFICIAL_URBAN_SHARE = 'SP.URB.TOTL.IN.ZS';
function officialShare(collection: Pick<StepResultDocument, 'worldBank'> | null | undefined, code: string): OfficialShare | null {
  const row = worldBankRenderableRows(collection?.worldBank).find(item => item.code === code)?.row;
  const value = row ? Number(row.value) : NaN;
  return row && Number.isFinite(value) ? { value, year: row.year } : null;
}
/** One plain line per dimension. A gap is stated, never adjusted. */
export function populationBaselineComparisons(baseline: PopulationBaselineV1, collection: Pick<StepResultDocument, 'worldBank'> | null | undefined): string[] {
  const shares = populationBaselineShares(baseline);
  const line = (label: string, simulated: number, official: OfficialShare | null): string => official === null
    ? `${label}: ${pct(simulated)} trong dữ liệu dân số mô phỏng; ${POPULATION_BASELINE_NOT_COMPARED}.`
    : `${label}: ${pct(simulated)} trong dữ liệu dân số mô phỏng, lệch ${Math.abs(simulated - official.value).toFixed(1).replace('.', ',')} điểm phần trăm so với số dân chính thức (${pct(official.value)}, năm ${official.year}).`;
  return [
    `Cơ cấu tuổi: ${POPULATION_BASELINE_NOT_COMPARED}.`,
    line('Tỷ lệ nữ', shares.female, officialShare(collection, OFFICIAL_FEMALE_SHARE)),
    line('Tỷ lệ thành thị', shares.urban, officialShare(collection, OFFICIAL_URBAN_SHARE)),
  ];
}

/** The I02 block: three share tables, the note line and the comparison lines. Empty string unless the stored read is renderable. */
export function populationBaselineSection(collection: Pick<StepResultDocument, 'populationBaseline' | 'worldBank'> | null | undefined): string {
  const stored = collection?.populationBaseline;
  if (!populationBaselineRenderable(stored)) return '';
  const baseline = stored.baseline, shares = populationBaselineShares(baseline), date = dataDate(baseline.builtAt);
  const of = (what: string, total: number) => `Tỷ lệ trên tổng số ${count(total)} hồ sơ người từ 18 tuổi trở lên${what ? ` ${what}` : ''} trong dữ liệu dân số mô phỏng; bảng lập ngày ${date}`;
  const table = (label: string, caption: string, head: string, body: string) =>
    `<div class="table-wrap" role="region" aria-label="${esc(label)}" tabindex="0"><table><caption>${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  const sexAge = table('Mốc toàn dân theo giới và nhóm tuổi', `${of('theo giới và nhóm tuổi', baseline.sexAge.total)}.`,
    `<th>Nhóm tuổi</th><th>${SEX_LABELS.MALE}</th><th>${SEX_LABELS.FEMALE}</th>`,
    shares.sexAge.map(row => `<tr><td>${esc(AGE_LABELS[row.ageBand] ?? String(row.ageBand))}</td><td>${pct(row.male)}</td><td>${pct(row.female)}</td></tr>`).join(''));
  const region = table('Mốc toàn dân theo vùng', `${of('theo sáu vùng kinh tế', baseline.region.total)}.`, '<th>Vùng</th><th>Tỷ lệ</th>',
    shares.region.map(row => `<tr><td>${esc(row.region)}</td><td>${pct(row.share)}</td></tr>`).join(''));
  const zone = table('Mốc toàn dân theo thành thị và nông thôn', `${of('theo nơi ở', baseline.zone.total)}.`, '<th>Nơi ở</th><th>Tỷ lệ</th>',
    (['URBAN', 'RURAL'] as const).map(code => `<tr><td>${ZONE_LABELS[code]}</td><td>${pct(percent(baseline.zone.rows.find(row => row.zone === code)?.n ?? 0, baseline.zone.total))}</td></tr>`).join(''));
  const comparisons = populationBaselineComparisons(baseline, collection);
  return `<div class="population-baseline" data-population-baseline="1"><h3>Mốc toàn dân</h3><p>Chú thích: ${esc(POPULATION_BASELINE_NOTE)} Mỗi tỷ lệ tính trên tổng của bảng đó và làm tròn một chữ số thập phân.</p>` +
    sexAge + region + zone + `<p>So với số dân chính thức:</p><ul>${comparisons.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`;
}

// World Bank open-data lane for the automated Market flow (S23). Off unless the flag is exactly "1".
//
// Country-level background for Vietnam, fetched once per run from the two pinned URLs per indicator that the manual
// intake inspector already accepts (so at most 4 GET requests), and shown beside the sample numbers, never combined with them.
import { boundedRequest, CaptureLog, defaultProviderTransport, ProviderInputError, type ProviderTransport } from './provider-common.js';
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';
import type { StepWorldBank, StepWorldBankIndicator, StepWorldBankPoint, StepWorldBankRow } from './model.js';
import { inspectWorldBankSource, MAX_WORLD_BANK_FILE_BYTES, WORLD_BANK_INDICATORS, WORLD_BANK_PROFILE, worldBankUrls, WorldBankSourceRejection } from './world-bank-intake.js';
import type { Projection } from '../../../../contracts/analysis/world-bank-intake-v1.generated.js';

export const WORLD_BANK_FLAG = 'TDN_RESEARCH_WORLD_BANK_ENABLED';
/** Usage ordinal inside the collection step (0 Kalodata, 1 exact Shopee, 2 web, 3 trends, 4-6 extra searches). */
export const WORLD_BANK_USAGE_ORDINAL = 7;
export const WORLD_BANK_TIMEOUT_MS = 20_000;
export const WORLD_BANK_PROVIDER = 'WORLD-BANK' as const;

export const WORLD_BANK_SOURCE_LABEL = 'Bối cảnh vĩ mô cả nước';
export const WORLD_BANK_TITLE = 'Bối cảnh vĩ mô cả nước của Việt Nam, đặt cạnh phần nhu cầu';
export const WORLD_BANK_SRC = 'Ngân hàng Thế giới (World Bank Open Data), giấy phép CC BY 4.0.';
const LEGACY_WORLD_BANK_NOTE = 'Số liệu của cả nước Việt Nam, chỉ để làm nền: không nói về sản phẩm này và không so sánh được với số liệu mẫu trong báo cáo. Đơn vị giữ nguyên như nguồn; đây không phải một nguồn xác nhận độc lập.';
export const WORLD_BANK_NOTE = 'Số liệu của cả nước Việt Nam, chỉ để làm nền: không nói về sản phẩm này và không so sánh được với số liệu mẫu trong báo cáo. Đơn vị lấy từ thông tin đơn vị hoặc tên chỉ số do nguồn công bố; đây không phải một nguồn xác nhận độc lập.';
export const WORLD_BANK_LIMIT = 'Số liệu cả nước chỉ là bối cảnh; không dùng để ước lượng thị trường của sản phẩm và không ghép với số bán của mẫu.';
const NAMES: Readonly<Record<string, string>> = {
  'NE.CON.PRVT.PC.KD': 'Chi tiêu tiêu dùng hộ gia đình bình quân đầu người',
  'SP.POP.TOTL': 'Dân số cả nước',
};

export function worldBankEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[WORLD_BANK_FLAG] === '1';
}

interface Exchange { readonly capture: ProviderRawCapture; readonly bytes: Buffer }
/** One indicator's outcome. A failed one keeps a reason code only; nothing is repaired or retried. */
export interface WorldBankAttempt {
  readonly code: string;
  readonly requests: number;
  readonly reason: string | null;
  readonly projection: Projection | null;
  readonly observation: ProviderRawCapture | null;
  readonly metadata: ProviderRawCapture | null;
}

/** The executor-side port. It makes at most 2 requests per indicator and never retries. */
export interface WorldBankSource {
  collect(options?: ProviderCallOptions): Promise<WorldBankAttempt[]>;
}

export function createWorldBankSource(transport: ProviderTransport = defaultProviderTransport, timeoutMs = WORLD_BANK_TIMEOUT_MS): WorldBankSource {
  return {
    async collect(options = {}) {
      const log = new CaptureLog(WORLD_BANK_PROVIDER, transport, undefined, WORLD_BANK_INDICATORS.length * 2);
      let requests = 0;
      const get = async (url: string, operation: 'worldbank.observations' | 'worldbank.metadata'): Promise<Exchange | string> => {
        requests++;
        const requestedAt = log.timestamp();
        let outcome;
        try {
          outcome = await boundedRequest(transport, { url: new URL(url), method: 'GET', headers: { accept: 'application/json' }, body: null,
            timeoutMs, maxBytes: MAX_WORLD_BANK_FILE_BYTES, signal: options.signal });
        } catch (error) { return error instanceof ProviderInputError ? 'REQUEST_REFUSED' : 'TRANSPORT'; }
        if (outcome.kind === 'ABORTED') return 'CANCELLED';
        if (outcome.kind === 'OVERSIZE') return 'FILE_SIZE_LIMIT';
        if (outcome.kind !== 'RECEIVED') return outcome.kind;
        if (outcome.status !== 200) return 'HTTP_ERROR';
        const parsed = new URL(url);
        const capture = log.record({ operation, billing: 'FREE_ACCOUNT_QUERY', method: 'GET', endpoint: `${parsed.origin}${parsed.pathname}`,
          requestParameters: { format: 'json' }, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null },
          requestedAt, 'OK', 200, outcome.bytes, null);
        return { capture, bytes: outcome.bytes };
      };
      const out: WorldBankAttempt[] = [];
      for (const code of WORLD_BANK_INDICATORS) {
        const fail = (reason: string, issued: number): WorldBankAttempt => ({ code, requests: issued, reason, projection: null, observation: null, metadata: null });
        if (options.signal?.aborted) { out.push(fail('CANCELLED', 0)); continue; }
        const urls = worldBankUrls(code), before = requests;
        const observation = await get(urls.sourceUrl, 'worldbank.observations');
        if (typeof observation === 'string') { out.push(fail(observation, requests - before)); continue; }
        const metadata = await get(urls.metadataUrl, 'worldbank.metadata');
        if (typeof metadata === 'string') { out.push(fail(metadata, requests - before)); continue; }
        try {
          const projection = inspectWorldBankSource(observation.bytes, metadata.bytes, urls.sourceUrl, urls.metadataUrl);
          if (projection.rows.every(row => row.indicatorCode !== code)) throw new WorldBankSourceRejection('INDICATOR_NOT_ALLOWED', 'source');
          if (latestRow(projection, code) === null) { out.push(fail('NO_OBSERVATION', requests - before)); continue; }
          out.push({ code, requests: requests - before, reason: null, projection, observation: observation.capture, metadata: metadata.capture });
        } catch (error) { out.push(fail(error instanceof WorldBankSourceRejection ? error.code : 'INSPECTION_FAILED', requests - before)); }
      }
      return out;
    },
  };
}

/** Latest year whose value is present; a missing value is never carried forward from an older year. */
function latestRow(projection: Projection, code: string): StepWorldBankRow | null {
  let best: Projection['rows'][number] | null = null;
  for (const row of projection.rows) if (row.indicatorCode === code && row.value !== null && (best === null || Number(row.year) > Number(best.year))) best = row;
  return best === null || best.value === null ? null
    : { indicatorName: NAMES[code] ?? best.indicatorName, sourceIndicatorName: best.indicatorName, decimal: best.decimal,
      value: best.value, unit: best.unit, year: best.year, lastUpdated: best.lastUpdated,
      statusLiteral: best.statusLiteral, footnote: best.footnote, locator: best.locator };
}

export const WORLD_BANK_SERIES_YEARS = 10;
/** Up to the last 10 years ending at the latest year with a value (the table row's year). A year the source does not list, or lists
 * without a value, is a null gap: nothing is carried forward or interpolated, and value strings are kept exactly. */
export function worldBankSeries(projection: Projection, code: string, latest: StepWorldBankRow): StepWorldBankPoint[] {
  const rows = projection.rows.filter(row => row.indicatorCode === code);
  const end = Number(latest.year), first = Math.max(end - WORLD_BANK_SERIES_YEARS + 1, Math.min(...rows.map(row => Number(row.year))));
  const out: StepWorldBankPoint[] = [];
  for (let year = first; year <= end; year++) {
    const text = String(year).padStart(4, '0');
    out.push({ year: text, value: rows.find(row => row.year === text)?.value ?? null });
  }
  return out;
}

/** The stored step field. `indexes` are the step capture ordinals of each stored attempt (observation, metadata), null when none was stored. */
export function worldBankDocument(attempts: readonly WorldBankAttempt[], indexes: readonly (readonly [number, number] | null)[]): StepWorldBank {
  return { profile: WORLD_BANK_PROFILE, indicators: attempts.map((attempt, i): StepWorldBankIndicator => {
    const index = indexes[i] ?? null, row = attempt.projection && index ? latestRow(attempt.projection, attempt.code) : null;
    if (!attempt.projection || !attempt.observation || !attempt.metadata || !index || !row) return { code: attempt.code, status: 'FAILED',
      reason: attempt.reason ?? 'DOCUMENT_INVALID', retrievedAt: null, captureIndex: null, metadataCaptureIndex: null, sourceSha256: null, metadataSha256: null, row: null };
    return { code: attempt.code, status: 'COLLECTED', reason: null, retrievedAt: attempt.observation.completedAt, captureIndex: index[0], metadataCaptureIndex: index[1],
      sourceSha256: attempt.projection.sourceSha256, metadataSha256: attempt.projection.metadataSha256, row, series: worldBankSeries(attempt.projection, attempt.code, row) };
  }) };
}

/** The chart window of one drawn indicator: its stored series when it ends at the table row and has at least 2 values; otherwise null (no chart). */
export function worldBankChartSeries(item: StepWorldBankIndicator): readonly StepWorldBankPoint[] | null {
  const series = item.series, row = item.row;
  if (!series || !row || series.length === 0) return null;
  const last = series[series.length - 1]!;
  if (last.year !== row.year || last.value !== row.value) return null;
  return series.filter(point => point.value !== null).length >= 2 ? series : null;
}

/** Every attempt failed with one reason (thrown run, storage refusal). */
export function worldBankFailed(reason: string): StepWorldBank {
  return { profile: WORLD_BANK_PROFILE, indicators: WORLD_BANK_INDICATORS.map(code => ({ code, status: 'FAILED' as const, reason, retrievedAt: null,
    captureIndex: null, metadataCaptureIndex: null, sourceSha256: null, metadataSha256: null, row: null })) };
}

type Collected = StepWorldBankIndicator & { readonly row: StepWorldBankRow; readonly captureIndex: number; readonly metadataCaptureIndex: number;
  readonly sourceSha256: string; readonly retrievedAt: string };
/** The one predicate shared by both renderers and the evidence packet: S23 is used only for rows that are drawn. */
export function worldBankRenderableRows(value: StepWorldBank | null | undefined): Collected[] {
  return (value?.indicators ?? []).filter((item): item is Collected => item.status === 'COLLECTED' && item.row !== null && item.captureIndex !== null
    && item.metadataCaptureIndex !== null && item.sourceSha256 !== null && item.retrievedAt !== null);
}
export const worldBankRenderable = (value: StepWorldBank | null | undefined): value is StepWorldBank => worldBankRenderableRows(value).length > 0;

/** The WB lane reads public open data: no paid request, no credits. */
export function worldBankUsage(attempts: readonly WorldBankAttempt[]): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'NONE_USED' } };
} {
  return { provider: WORLD_BANK_PROVIDER, usage: { requestsIssued: attempts.reduce((sum, a) => sum + a.requests, 0), paidRequestsIssued: 0, ambiguousPaidRequests: 0,
    credits: { status: 'NONE_USED' } } };
}

/** Round exact decimal digits half away from zero; retain the source string when precision is absent. */
export function roundWorldBankValue(value: string, decimal?: number): string {
  if (decimal !== undefined && Number.isInteger(decimal) && decimal >= 0 && decimal <= 100) {
    const parts = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
    if (parts) {
      const fraction = parts[3] ?? '';
      const kept = parts[2]! + fraction.slice(0, decimal).padEnd(decimal, '0');
      const magnitude = BigInt(kept) + ((fraction[decimal] ?? '0') >= '5' ? 1n : 0n);
      const digits = String(magnitude).padStart(decimal + 1, '0');
      value = (magnitude === 0n ? '' : parts[1]!) + (decimal === 0 ? digits : `${digits.slice(0, -decimal)}.${digits.slice(-decimal)}`);
    }
  }
  return value;
}

/** "." groups thousands, "," starts the fraction. Without precision, preserve every digit (old documents and Comtrade). */
export function formatWorldBankValue(value: string, decimal?: number): string {
  value = roundWorldBankValue(value, decimal);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!m) return value;
  return `${m[1]}${m[2]!.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')}${m[3] ? `,${m[3]}` : ''}`;
}
export const WORLD_BANK_UNKNOWN_UNIT = 'nguồn chưa ghi đơn vị';
export const worldBankPerPerson = (row: StepWorldBankRow, code?: string): boolean =>
  code === 'NE.CON.PRVT.PC.KD' || /\bper capita\b/iu.test(row.sourceIndicatorName ?? '') || /(?:USD|US\$)\/(?:người|person)/iu.test(row.unit ?? '');
/** Use only the source's explicit unit or these exact source-name patterns; the Vietnamese display label is never evidence. */
export function worldBankUnitText(row: StepWorldBankRow, code?: string): string {
  const name = row.sourceIndicatorName;
  const constant = /\(constant (\d{4}) US\$\)/u.exec(name ?? '');
  const perPerson = worldBankPerPerson(row, code);
  if (row.unit && row.unit.trim() !== '') {
    const unit = perPerson ? row.unit.trim().replace(/^(?:USD|US\$)(?:\/(?:người|person))?(?=,|$)/u, 'USD/người') : row.unit;
    if (unit === 'USD/người' && constant) return `${unit}, giá cố định năm ${constant[1]}`;
    if (unit === 'USD/người' && name?.includes('(current US$)')) return `${unit}, giá hiện hành`;
    return unit;
  }
  if (name !== undefined) {
    const usd = perPerson ? 'USD/người' : 'USD';
    if (constant) return `${usd}, giá cố định năm ${constant[1]}`;
    if (name.includes('(current US$)')) return `${usd}, giá hiện hành`;
    if (code === 'SP.POP.TOTL' && name === 'Population, total') return 'người';
  }
  return WORLD_BANK_UNKNOWN_UNIT;
}
/** Old documents retain their original note bytes. Mention rounding only when a drawn value loses nonzero digits. */
export function worldBankTableNote(items: readonly StepWorldBankIndicator[]): string {
  const rows = items.flatMap(item => item.row ? [item.row] : []);
  const note = rows.some(row => row.sourceIndicatorName !== undefined || row.decimal !== undefined) ? WORLD_BANK_NOTE : LEGACY_WORLD_BANK_NOTE;
  const rounded = rows.some(row => row.decimal !== undefined && /[1-9]/u.test((row.value.split('.')[1] ?? '').slice(row.decimal)));
  return note + (rounded ? ' Các giá trị được làm tròn theo độ chính xác do nguồn công bố.' : '');
}
/** The source's own status or footnote text, shown as-is; "ước tính" is never inferred. */
export const worldBankSourceNote = (row: StepWorldBankRow): string => [row.statusLiteral, row.footnote ?? ''].map(s => s.trim()).filter(Boolean).join('; ') || 'nguồn chưa ghi chú';

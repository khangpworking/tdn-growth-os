// Search-interest lane for the automated Market flow (S20). Off unless the flag is exactly "1".
//
// One relative index series (0-100, peak = 100) for the report keyword. It is a relative index, never a count
// of searches and never sales, and it is shown beside the sales sections, never in the same total or axis.
import { defaultProviderTransport, isAmbiguous, type ProviderTransport } from './provider-common.js';
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';
import { MAX_SEARCH_INTEREST_POINTS, MAX_SEARCH_INTEREST_RANGE_POINTS, type SearchInterestReason, type StepSearchInterest, type StepSearchInterestPoint } from './model.js';
import { fetchTrends, planTrendsRequests, type TrendsCallResult, type TrendsDateRange } from './search-trends.js';

export const SEARCH_TRENDS_FLAG = 'TDN_RESEARCH_SEARCH_TRENDS_ENABLED';
/** Usage ordinal of the trends call inside the collection step (0 Kalodata, 1 exact Shopee, 2 web, 3 trends). */
export const SEARCH_INTEREST_USAGE_ORDINAL = 3;
/** The provider's default window (last 12 months of weekly points). Kept for documents stored before the report period was sent; no longer a gate. */
export const SEARCH_INTEREST_WINDOW_DAYS = 372;
/** A series with fewer dated, non-empty points is not drawn. */
export const SEARCH_INTEREST_MIN_POINTS = 4;

export const SEARCH_INTEREST_SOURCE_LABEL = 'Mức quan tâm tìm kiếm';
export const SEARCH_INTEREST_FIGURE_TITLE = 'Mức quan tâm tìm kiếm theo tuần, chỉ số tương đối';
/** Current reader: the figure title without the unit, which the unit span states once. */
export const SEARCH_INTEREST_READER_TITLE = 'Mức quan tâm tìm kiếm theo tuần';
export const SEARCH_INTEREST_UNIT = 'chỉ số tương đối 0–100';
export const SEARCH_INTEREST_SRC = 'Mức quan tâm tìm kiếm đã lưu cho từ khóa của báo cáo, Việt Nam, 12 tháng gần đây.';
export const SEARCH_INTEREST_NOTE = 'Chỉ số tương đối từ 0 đến 100: 100 là tuần quan tâm cao của chính từ khóa này trong khoảng đã lấy. Không phải số lượt tìm kiếm, không phải doanh số; chỉ so các tuần của cùng chuỗi. Tuần thiếu số để trống.';
export const SEARCH_INTEREST_EMPTY = 'Chưa có tuần đã kết thúc có số liệu tìm kiếm để hiển thị trong bản này.';
export const SEARCH_INTEREST_LIMIT = 'Chỉ số tìm kiếm là mức tương đối, chỉ cho từ khóa này; không đo số người tìm và không cộng hay so với số bán.';

export function searchTrendsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SEARCH_TRENDS_FLAG] === '1';
}

/** The executor-side port. It makes at most one paid request and never retries it. */
export interface SearchInterestSource {
  readonly id: 'SERPAPI';
  /** `range` is the report period the provider is asked for; without it the provider's default last 12 months is used. */
  collect(keyword: string, options?: ProviderCallOptions, range?: SearchInterestRange): Promise<TrendsCallResult>;
}

export type SearchInterestRange = TrendsDateRange;

export function createSearchInterestSource(apiKey: string | null, transport: ProviderTransport = defaultProviderTransport): SearchInterestSource {
  return {
    id: 'SERPAPI',
    async collect(keyword, options = {}, range) {
      const request = planTrendsRequests([keyword]).find(item => item.dataType === 'TIMESERIES');
      if (!request) return { status: 'FAILED', facts: null, captures: [] };
      return fetchTrends(apiKey, transport, range ? { ...request, range } : request, options);
    },
  };
}

/** The provider has no data before this day. */
export const SEARCH_INTEREST_EARLIEST_DAY = '2004-01-01';

/** Why the report period cannot be asked for (null when it can). Checked before any paid call; each case has its own reason. */
export function searchInterestPeriodSkip(period: { readonly startDate: string; readonly endDate: string }, nowMs: number): Extract<SearchInterestReason, 'PERIOD_INVALID' | 'PERIOD_BEFORE_PROVIDER_START' | 'PERIOD_IN_FUTURE'> | null {
  const parseDay = (value: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
  };
  const start = parseDay(period.startDate), end = parseDay(period.endDate);
  if (start === null || end === null || start > end) return 'PERIOD_INVALID';
  if (start < Date.parse(`${SEARCH_INTEREST_EARLIEST_DAY}T00:00:00Z`)) return 'PERIOD_BEFORE_PROVIDER_START';
  if (end > nowMs + 86_400_000) return 'PERIOD_IN_FUTURE';
  return null;
}

/** True when the provider can be asked for the measurement period (no paid call otherwise). */
export function searchInterestCoversPeriod(period: { readonly startDate: string; readonly endDate: string }, nowMs: number): boolean {
  return searchInterestPeriodSkip(period, nowMs) === null;
}

/** The range sent to the provider: the report period, with an end day after today pulled back to today. */
export function searchInterestRange(period: { readonly startDate: string; readonly endDate: string }, nowMs: number): SearchInterestRange {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const endDate = period.endDate > today ? today : period.endDate;
  return { startDate: period.startDate, endDate: endDate < period.startDate ? period.startDate : endDate };
}

/** dd/mm/yyyy for a stored ISO day. */
const dayText = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Report text for the range a stored series or map was asked for. */
export function searchRangeText(range: SearchInterestRange): string {
  return `từ ${dayText(range.startDate)} đến ${dayText(range.endDate)}`;
}
/** Source line of the series or map: the asked range when the document carries one, else the older fixed text. */
export function searchInterestSourceText(value: { readonly requestedRange?: SearchInterestRange }): string {
  return value.requestedRange ? `Mức quan tâm tìm kiếm đã lưu cho từ khóa của báo cáo, Việt Nam, ${searchRangeText(value.requestedRange)}.` : SEARCH_INTEREST_SRC;
}

export type SearchInterestAttempt =
  | { readonly kind: 'SKIPPED'; readonly keyword: string; readonly reason: SearchInterestReason }
  | { readonly kind: 'THROWN'; readonly keyword: string; readonly range?: SearchInterestRange }
  | { readonly kind: 'CALLED'; readonly keyword: string; readonly result: TrendsCallResult; readonly range?: SearchInterestRange };

/** NFC, trimmed, single-spaced and case-folded; diacritics are kept because a different word is a different query. */
const queryKey = (text: string): string => text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC');
const nonNull = (points: readonly StepSearchInterestPoint[]): number => points.filter(point => point.index !== null).length;

/** The stored step field. A failure keeps a reason code and no points; it never changes the step outcome. */
export function searchInterestDocument(attempt: SearchInterestAttempt, captureIndex: number | null): StepSearchInterest {
  // A skipped attempt made no call, so it carries no range; a called one binds the document to the range it asked for.
  const range = attempt.kind === 'SKIPPED' ? undefined : attempt.range;
  const base = { keyword: attempt.keyword, geo: 'VN', unit: 'INDEX_0_100', window: range ? 'REQUESTED_RANGE' : 'LAST_12_MONTHS', ...(range ? { requestedRange: { startDate: range.startDate, endDate: range.endDate } } : {}) } as const;
  const failed = (reason: SearchInterestReason, retrievedAt: string | null, index: number | null): StepSearchInterest =>
    ({ status: 'FAILED', reason, ...base, retrievedAt, points: [], captureIndex: index });
  if (attempt.kind === 'SKIPPED') return { status: 'SKIPPED', reason: attempt.reason, ...base, retrievedAt: null, points: [], captureIndex: null };
  if (attempt.kind === 'THROWN') return failed('PROVIDER_FAILED', null, null);
  const { result } = attempt, last = result.captures.at(-1);
  const retrievedAt = last?.completedAt ?? null, index = last ? captureIndex : null;
  if (result.status === 'CANCELLED') return failed('CANCELLED', retrievedAt, index);
  if (result.status !== 'OK' || result.facts?.kind !== 'TIMESERIES') return failed('PROVIDER_FAILED', retrievedAt, index);
  // Only the series the provider echoes for the requested keyword is trusted; a different query (diacritics count) is never used instead.
  const wanted = queryKey(attempt.keyword), matches = result.facts.series.filter(item => queryKey(item.keyword) === wanted);
  if (matches.length !== 1) return failed('PROVIDER_FAILED', retrievedAt, index);
  const series = matches[0]!.points;
  if (range && series.length > MAX_SEARCH_INTEREST_RANGE_POINTS) return failed('PROVIDER_FAILED', retrievedAt, index);
  const points = (range ? series : series.slice(-MAX_SEARCH_INTEREST_POINTS)).map(point => ({ period: point.period, index: point.index }));
  if (nonNull(points) < SEARCH_INTEREST_MIN_POINTS) return failed('EMPTY_SERIES', retrievedAt, index);
  return { status: 'COLLECTED', reason: null, ...base, retrievedAt, points, captureIndex: index };
}

/** The one predicate shared by the renderers and the evidence packet: S20 is used only when the series is drawn. */
export function searchInterestRenderable(value: StepSearchInterest | null | undefined): value is StepSearchInterest {
  return value?.status === 'COLLECTED' && value.captureIndex !== null && nonNull(value.points) >= SEARCH_INTEREST_MIN_POINTS;
}

/** The trends result carries no usage object; the paid request count comes from its own captures. */
export function searchInterestUsage(captures: readonly ProviderRawCapture[]): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'UNKNOWN' } };
} {
  return { provider: 'SERPAPI', usage: {
    requestsIssued: captures.length, paidRequestsIssued: captures.length,
    ambiguousPaidRequests: captures.filter(capture => isAmbiguous(capture.outcome)).length, credits: { status: 'UNKNOWN' },
  } };
}

const DAY = 86_400_000;
const calendarDate = (year: number, month: number, day: number): number | null => {
  const time = Date.UTC(year, month - 1, day), date = new Date(time);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
};

function searchDay(period: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(period.trim());
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const vi = /^(\d{1,2})\s+thg\s+(\d{1,2}),?\s+(\d{4})$/u.exec(period.trim());
  return vi ? calendarDate(Number(vi[3]), Number(vi[2]), Number(vi[1])) : null;
}

/** Localized single dates are daily; ISO dates need a sub-week cadence to distinguish them from week starts. */
export function searchInterestIsDaily(value: StepSearchInterest): boolean {
  if (value.window !== 'REQUESTED_RANGE') return false;
  const days = value.points.map(point => searchDay(point.period)).filter((day): day is number => day !== null);
  return value.points.some(point => /thg/u.test(point.period) && searchDay(point.period) !== null)
    || days.some((day, i) => i > 0 && Math.abs(day - days[i - 1]!) > 0 && Math.abs(day - days[i - 1]!) < 7 * DAY);
}

/** Keep weekly reader wording for stored default-window documents and weekly custom-range responses. */
export function searchInterestIntervalText(value: StepSearchInterest, text: string): string {
  return searchInterestIsDaily(value) ? text.replace(/tuần/gu, 'ngày').replace(/Tuần/gu, 'Ngày') : text;
}

/** ISO periods name the week's first day; localized ranges explicitly name both ends. Unknown dates are withheld. */
function searchWeek(period: string): { start: number; end: number } | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:\s*[–—/]\s*(\d{4})-(\d{2})-(\d{2}))?$/u.exec(period);
  if (iso) {
    const start = calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const end = iso[4] ? calendarDate(Number(iso[4]), Number(iso[5]), Number(iso[6])) : start === null ? null : start + 6 * DAY;
    return start !== null && end !== null && end - start === 6 * DAY ? { start, end } : null;
  }
  const vi = /^(\d{1,2})(?:\s+thg\s+(\d{1,2}))?(?:,?\s+(\d{4}))?\s*[–—-]\s*(\d{1,2})\s+thg\s+(\d{1,2}),?\s+(\d{4})$/u.exec(period.trim());
  if (!vi) return null;
  const endYear = Number(vi[6]), endMonth = Number(vi[5]), startMonth = Number(vi[2] ?? vi[5]);
  const startYear = vi[3] ? Number(vi[3]) : endYear - (startMonth > endMonth ? 1 : 0);
  const start = calendarDate(startYear, startMonth, Number(vi[1])), end = calendarDate(endYear, endMonth, Number(vi[4]));
  return start !== null && end !== null && end - start === 6 * DAY ? { start, end } : null;
}

function searchWeekLabel({ start, end }: { start: number; end: number }): string {
  const first = new Date(start).toISOString().slice(0, 10), last = new Date(end).toISOString().slice(0, 10);
  const date = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return first.slice(0, 4) !== last.slice(0, 4) ? `${date(first)}–${date(last)}`
    : first.slice(5, 7) !== last.slice(5, 7) ? `${date(first).slice(0, 5)}–${date(last)}` : `${first.slice(8, 10)}–${date(last)}`;
}

/** Rendering only: retained step bytes and their replay/digest inputs stay unchanged. A period ending today is still in progress. */
export function searchInterestReadingPoints(value: StepSearchInterest): StepSearchInterestPoint[] {
  const retrieved = value.retrievedAt ? Date.parse(value.retrievedAt) : NaN;
  if (!Number.isFinite(retrieved)) return [];
  // The source periods are Vietnam calendar days (UTC+7), independent of the host timezone.
  const cutoff = Math.floor((retrieved + 7 * 60 * 60 * 1000) / DAY) * DAY;
  const daily = searchInterestIsDaily(value);
  return value.points.flatMap(point => {
    if (daily) {
      const day = searchDay(point.period);
      return day !== null && day < cutoff ? [{ period: dayText(new Date(day).toISOString().slice(0, 10)), index: point.index }] : [];
    }
    const week = searchWeek(point.period);
    return week && week.end < cutoff ? [{ period: searchWeekLabel(week), index: point.index }] : [];
  });
}

export function searchInterestChartPoints(value: StepSearchInterest, legacy = false): { readonly label: string; readonly value: number | null }[] {
  // Frozen labels for reports without marketPresentation.
  if (legacy) {
    const label = (period: string, withYear: boolean): string => {
      const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(period);
      return iso ? `${iso[3]}/${iso[2]}${withYear ? `/${iso[1]!.slice(2)}` : ''}` : period;
    };
    const unique = (labels: readonly string[]): boolean => new Set(labels).size === labels.length;
    const short = value.points.map(point => label(point.period, false));
    const labels = unique(short) ? short : value.points.map(point => label(point.period, true));
    return value.points.map((point, i) => ({ label: unique(labels) ? labels[i]! : `${labels[i]} (${i + 1})`, value: point.index }));
  }
  return searchInterestReadingPoints(value).map(point => ({ label: point.period, value: point.index }));
}

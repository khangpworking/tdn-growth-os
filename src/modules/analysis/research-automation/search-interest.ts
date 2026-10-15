// Search-interest lane for the automated Market flow (S20). Off unless the flag is exactly "1".
//
// One relative index series (0-100, peak = 100) for the report keyword. It is a relative index, never a count
// of searches and never sales, and it is shown beside the sales sections, never in the same total or axis.
import { defaultProviderTransport, isAmbiguous, type ProviderTransport } from './provider-common.js';
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';
import { MAX_SEARCH_INTEREST_POINTS, type SearchInterestReason, type StepSearchInterest, type StepSearchInterestPoint } from './model.js';
import { fetchTrends, planTrendsRequests, type TrendsCallResult } from './search-trends.js';

export const SEARCH_TRENDS_FLAG = 'TDN_RESEARCH_SEARCH_TRENDS_ENABLED';
/** Usage ordinal of the trends call inside the collection step (0 Kalodata, 1 exact Shopee, 2 web, 3 trends). */
export const SEARCH_INTEREST_USAGE_ORDINAL = 3;
/** The provider window is fixed at the last 12 months; a longer or older period is skipped before any paid call. */
export const SEARCH_INTEREST_WINDOW_DAYS = 360;
/** A series with fewer dated, non-empty points is not drawn. */
export const SEARCH_INTEREST_MIN_POINTS = 4;

export const SEARCH_INTEREST_SOURCE_LABEL = 'Mức quan tâm tìm kiếm';
export const SEARCH_INTEREST_FIGURE_TITLE = 'Mức quan tâm tìm kiếm theo tuần, chỉ số tương đối';
export const SEARCH_INTEREST_UNIT = 'chỉ số tương đối 0–100';
export const SEARCH_INTEREST_SRC = 'Mức quan tâm tìm kiếm đã lưu cho từ khóa của báo cáo, Việt Nam, 12 tháng gần đây.';
export const SEARCH_INTEREST_NOTE = 'Chỉ số tương đối từ 0 đến 100: 100 là tuần quan tâm cao của chính từ khóa này trong khoảng đã lấy. Không phải số lượt tìm kiếm, không phải doanh số; chỉ so các tuần của cùng chuỗi. Tuần thiếu số để trống.';
export const SEARCH_INTEREST_LIMIT = 'Chỉ số tìm kiếm là mức tương đối, chỉ cho từ khóa này; không đo số người tìm và không cộng hay so với số bán.';

export function searchTrendsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SEARCH_TRENDS_FLAG] === '1';
}

/** The executor-side port. It makes at most one paid request and never retries it. */
export interface SearchInterestSource {
  readonly id: 'SERPAPI';
  collect(keyword: string, options?: ProviderCallOptions): Promise<TrendsCallResult>;
}

export function createSearchInterestSource(apiKey: string | null, transport: ProviderTransport = defaultProviderTransport): SearchInterestSource {
  return {
    id: 'SERPAPI',
    async collect(keyword, options = {}) {
      const request = planTrendsRequests([keyword]).find(item => item.dataType === 'TIMESERIES');
      if (!request) return { status: 'FAILED', facts: null, captures: [] };
      return fetchTrends(apiKey, transport, request, options);
    },
  };
}

/** True when the measurement period lies inside the provider's last-12-months window (no paid call otherwise). */
export function searchInterestCoversPeriod(period: { readonly startDate: string; readonly endDate: string }, nowMs: number): boolean {
  const start = Date.parse(`${period.startDate}T00:00:00Z`), end = Date.parse(`${period.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start >= nowMs - SEARCH_INTEREST_WINDOW_DAYS * 86_400_000 && end <= nowMs + 86_400_000;
}

export type SearchInterestAttempt =
  | { readonly kind: 'SKIPPED'; readonly keyword: string; readonly reason: SearchInterestReason }
  | { readonly kind: 'THROWN'; readonly keyword: string }
  | { readonly kind: 'CALLED'; readonly keyword: string; readonly result: TrendsCallResult };

const nonNull = (points: readonly StepSearchInterestPoint[]): number => points.filter(point => point.index !== null).length;

/** The stored step field. A failure keeps a reason code and no points; it never changes the step outcome. */
export function searchInterestDocument(attempt: SearchInterestAttempt, captureIndex: number | null): StepSearchInterest {
  const base = { keyword: attempt.keyword, geo: 'VN', unit: 'INDEX_0_100', window: 'LAST_12_MONTHS' } as const;
  const failed = (reason: SearchInterestReason, retrievedAt: string | null, index: number | null): StepSearchInterest =>
    ({ status: 'FAILED', reason, ...base, retrievedAt, points: [], captureIndex: index });
  if (attempt.kind === 'SKIPPED') return { status: 'SKIPPED', reason: attempt.reason, ...base, retrievedAt: null, points: [], captureIndex: null };
  if (attempt.kind === 'THROWN') return failed('PROVIDER_FAILED', null, null);
  const { result } = attempt, last = result.captures.at(-1);
  const retrievedAt = last?.completedAt ?? null, index = last ? captureIndex : null;
  if (result.status === 'CANCELLED') return failed('CANCELLED', retrievedAt, index);
  if (result.status !== 'OK' || result.facts?.kind !== 'TIMESERIES') return failed('PROVIDER_FAILED', retrievedAt, index);
  const wanted = attempt.keyword.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
  const series = result.facts.series.find(item => item.keyword.normalize('NFC').toLowerCase() === wanted) ?? result.facts.series[0];
  const points = (series?.points ?? []).slice(-MAX_SEARCH_INTEREST_POINTS).map(point => ({ period: point.period, index: point.index }));
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

/** Axis labels: ISO dates become dd/mm (dd/mm/yy when two weeks would collide); any other period text is kept as stored. */
export function searchInterestChartPoints(value: StepSearchInterest): { readonly label: string; readonly value: number | null }[] {
  const label = (period: string, withYear: boolean): string => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(period);
    return iso ? `${iso[3]}/${iso[2]}${withYear ? `/${iso[1]!.slice(2)}` : ''}` : period;
  };
  const unique = (labels: readonly string[]): boolean => new Set(labels).size === labels.length;
  const short = value.points.map(point => label(point.period, false));
  const labels = unique(short) ? short : value.points.map(point => label(point.period, true));
  return value.points.map((point, i) => ({ label: unique(labels) ? labels[i]! : `${labels[i]} (${i + 1})`, value: point.index }));
}

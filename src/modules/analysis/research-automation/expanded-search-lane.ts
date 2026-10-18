// Expanded-search lane for the automated Market flow (S19 pointers). Off unless the flag is exactly "1".
//
// At most three extra paid searches per run, decided here and not by an environment value or a model:
// the report keyword limited to the report window, and the report keyword on each of the two marketplaces.
// Each is one request, never retried. Rows go through the same L9 admission and page typing as the plain web rows.
import { defaultProviderTransport, type ProviderTransport } from './provider-common.js';
import { createSerpApiProvider } from './provider-serpapi.js';
import { planExpandedSearch, SearchCallBudget, type ExpandedSearchRequest } from './expanded-search-queries.js';
import type { CollectInput, CollectResult, ProviderCallOptions } from './providers.js';
import { toWebResults } from './source-binding.js';
import {
  MAX_WEB_RESULTS, ResearchAutomationProviderOutputError,
  type ExpandedSearchKind, type ExpandedSearchReason, type StepExpandedQuery, type StepExpandedSearch, type StepWebResult,
} from './model.js';

export const EXPANDED_SEARCH_FLAG = 'TDN_RESEARCH_EXPANDED_SEARCH_ENABLED';
/** Hard ceiling of extra paid searches per run (on top of the one plain web search). */
export const EXPANDED_SEARCH_MAX_CALLS = 3;
/** Usage ordinals inside the collection step: 0 Kalodata, 1 exact Shopee, 2 web, 3 trends, then 4 / 5 / 6 by kind. */
export const EXPANDED_SEARCH_USAGE_ORDINAL: Readonly<Record<ExpandedSearchKind, number>> = Object.freeze({ WINDOW: 4, SHOPEE: 5, TIKTOK: 6 });

/** The fixed set, in call order. A dated search carries the report window; a site search carries one marketplace domain. */
export const EXPANDED_SEARCH_PLAN: readonly { readonly kind: ExpandedSearchKind; readonly windowed: boolean; readonly siteDomain: string | null }[] = Object.freeze([
  { kind: 'WINDOW', windowed: true, siteDomain: null },
  { kind: 'SHOPEE', windowed: false, siteDomain: 'shopee.vn' },
  { kind: 'TIKTOK', windowed: false, siteDomain: 'tiktok.com' },
]);

/** Legacy labels for report paths outside Market reader mode. */
export const EXPANDED_SEARCH_LABEL: Readonly<Record<ExpandedSearchKind, string>> = Object.freeze({
  WINDOW: 'Trong kỳ báo cáo', SHOPEE: 'Trên Shopee', TIKTOK: 'Trên TikTok Shop',
});
/** Render-time label: the TikTok domain search also finds videos and news. Retained query bytes stay unchanged. */
export function expandedSearchReaderLabel(row: { readonly origin?: ExpandedSearchKind; readonly url: string }): string {
  if (!row.origin) return '';
  if (row.origin !== 'TIKTOK') return EXPANDED_SEARCH_LABEL[row.origin];
  try {
    const url = new URL(row.url);
    if ((url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))
      && /^\/(?:view\/product|shop\/(?:[^/]+\/)?(?:pdp|product))\/[^/]+(?:\/|$)/u.test(url.pathname)) return 'Trên TikTok Shop';
  } catch { /* An unrecognized address never establishes a shop product page. */ }
  return 'Trên TikTok';
}
/** Column title and the one note about the dated search: the window is the period asked for, never an event date. */
export const EXPANDED_SEARCH_COLUMN = 'Lượt tìm';
export const EXPANDED_SEARCH_NOTE = 'Các dòng có nhãn lượt tìm là kết quả của thêm một lượt tìm theo kỳ báo cáo hoặc theo sàn; kỳ tìm là khoảng ngày đã yêu cầu, không phải ngày xảy ra sự việc.';

export function expandedSearchEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[EXPANDED_SEARCH_FLAG] === '1';
}

export type ExpandedSearchAttempt =
  | { readonly kind: ExpandedSearchKind; readonly state: 'SKIPPED'; readonly reason: ExpandedSearchReason }
  | { readonly kind: ExpandedSearchKind; readonly state: 'THROWN' }
  | { readonly kind: ExpandedSearchKind; readonly state: 'CALLED'; readonly result: CollectResult;
      readonly requestedWindow: { readonly startDate: string; readonly endDate: string } | null };

/** The executor-side port. collect() never throws: it returns one attempt per planned kind, in plan order. */
export interface ExpandedSearchSource {
  readonly id: 'SERPAPI';
  collect(input: CollectInput, options?: ProviderCallOptions): Promise<readonly ExpandedSearchAttempt[]>;
}

export function createExpandedSearchSource(apiKey: string | null, transport: ProviderTransport = defaultProviderTransport): ExpandedSearchSource {
  const provider = createSerpApiProvider(apiKey, transport);
  return {
    id: 'SERPAPI',
    async collect(input, options = {}) {
      // One budget per run: the ceiling holds even if the plan were extended by mistake.
      const budget = new SearchCallBudget({ trends: 0, search: EXPANDED_SEARCH_MAX_CALLS });
      const attempts: ExpandedSearchAttempt[] = [];
      for (const item of EXPANDED_SEARCH_PLAN.slice(0, EXPANDED_SEARCH_MAX_CALLS)) {
        if (options.signal?.aborted) { attempts.push({ kind: item.kind, state: 'SKIPPED', reason: 'CANCELLED' }); continue; }
        const requestedWindow = item.windowed ? { startDate: input.requestedPeriod.startDate, endDate: input.requestedPeriod.endDate } : null;
        const request: ExpandedSearchRequest = { version: 'expanded-search-request-v1', confirmedProducts: [], confirmedBrands: [],
          requestedWindow, siteDomain: item.siteDomain, exactKeyword: input.keyword };
        try { planExpandedSearch(request); }
        catch { attempts.push({ kind: item.kind, state: 'SKIPPED', reason: 'NOT_PLANNED' }); continue; }
        try {
          const result = await provider.collectExpanded(input, request, 0, budget, options);
          attempts.push({ kind: item.kind, state: 'CALLED', result, requestedWindow });
        } catch { attempts.push({ kind: item.kind, state: 'THROWN' }); }
      }
      return attempts;
    },
  };
}

/** Same page seen through another search: scheme, case of the host, a trailing slash and a fragment do not make a new page. */
export function webResultUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}${parsed.port}${parsed.pathname.replace(/\/+$/u, '')}${parsed.search}`;
  } catch { return url; }
}

/**
 * The stored form of one attempt. `offset` is the step capture index of its capture; `seen` holds the URL keys of the plain
 * rows and of earlier expanded rows (plain wins, then plan order). A failure keeps a reason code and no rows.
 */
export function expandedQueryDocument(attempt: ExpandedSearchAttempt, offset: number | null, seen: Set<string>): StepExpandedQuery {
  const base = { kind: attempt.kind, requestedWindow: attempt.kind === 'WINDOW' && attempt.state === 'CALLED' ? attempt.requestedWindow : null } as const;
  const none = (status: StepExpandedQuery['status'], reason: ExpandedSearchReason, retrievedAt: string | null, captureIndex: number | null): StepExpandedQuery =>
    ({ ...base, status, reason, retrievedAt, captureIndex, results: [] });
  if (attempt.state === 'SKIPPED') return none('SKIPPED', attempt.reason, null, null);
  if (attempt.state === 'THROWN') return none('FAILED', 'PROVIDER_FAILED', null, null);
  const { result } = attempt, last = result.captures.at(-1);
  const retrievedAt = last?.completedAt ?? null, captureIndex = last && offset !== null ? offset : null;
  if (result.status === 'WAITING_FOR_INPUT' && !last) return none('SKIPPED', 'BUDGET_EXHAUSTED', null, null);
  if (result.status === 'CANCELLED') return none('FAILED', 'CANCELLED', retrievedAt, captureIndex);
  if (result.status !== 'SUCCEEDED' || captureIndex === null) return none('FAILED', 'PROVIDER_FAILED', retrievedAt, captureIndex);
  let rows: StepWebResult[];
  try { rows = toWebResults(result).map(row => ({ ...row, captureIndex })); }
  catch (error) {
    if (!(error instanceof ResearchAutomationProviderOutputError)) throw error;
    return none('FAILED', 'PROVIDER_FAILED', retrievedAt, captureIndex);
  }
  const results: StepWebResult[] = [];
  for (const row of rows) {
    const key = webResultUrlKey(row.url);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(row);
    if (results.length === MAX_WEB_RESULTS) break;
  }
  return { ...base, status: 'COLLECTED', reason: null, retrievedAt, captureIndex, results };
}

/** Plain web rows first, then the extra-search rows in plan order: the one list used for admission, page typing and replay. */
export function collectionWebRows(document: { readonly webResults?: readonly StepWebResult[]; readonly expandedSearch?: StepExpandedSearch } | null | undefined): StepWebResult[] {
  return [...(document?.webResults ?? []), ...expandedWebRows(document?.expandedSearch?.queries)];
}

/** The rows of every collected query, tagged with the kind that produced them (in memory only; storage keeps them per query). */
export function expandedWebRows(queries: readonly StepExpandedQuery[] | undefined): StepWebResult[] {
  return (queries ?? []).flatMap(query => query.results.map(row => ({ ...row, origin: query.kind })));
}

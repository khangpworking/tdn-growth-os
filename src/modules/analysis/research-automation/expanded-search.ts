// Explicit P5 sidepath executor. It is not connected to run Start, source-board activity,
// storage or report publication: those owning service boundaries still require Phase 0 GO.
import type { KeywordMeaningFilterData } from '../keyword-meaning-filter.js';
import { emptyUsage, type ProviderTransport } from './provider-common.js';
import { createSerpApiProvider } from './provider-serpapi.js';
import {
  expandedSearchRequestCacheKey, planExpandedSearch,
  type ExpandedSearchRequest, type SearchCallBudget,
} from './expanded-search-queries.js';
import { filterSerpApiResults, serpApiResultRecordId, type SerpApiL9FilterOutput } from './serpapi-l9-filter.js';
import type { CollectInput, CollectResult, DateWindow, ProviderCallOptions, ProviderUsage, WebDiscoveryResult } from './providers.js';

export interface ExpandedSearchEvidence {
  readonly runId: string;
  readonly query: string;
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly requestedWindow: DateWindow | null;
  readonly siteDomain: string | null;
  /** Original provider attempt, including its historical paid receipt and exact raw captures. */
  readonly attempt: CollectResult;
  /** Only calls issued by this invocation; replay does not create another paid receipt. */
  readonly invocationUsage: ProviderUsage;
  readonly rows: readonly {
    readonly recordId: string;
    readonly result: WebDiscoveryResult;
    readonly requestedWindow: DateWindow | null;
    readonly siteDomain: string | null;
  }[];
  readonly admission: SerpApiL9FilterOutput;
  /** Count of INCLUDED result records, not a unique-entity count or a market statistic. */
  readonly mainCount: number;
}

function copyAttempt(result: CollectResult): CollectResult {
  const copy = structuredClone(result);
  return { ...copy, captures: copy.captures.map(capture => ({ ...capture,
    responseBytes: capture.responseBytes === null ? null : Buffer.from(capture.responseBytes),
    requestBodyBytes: capture.requestBodyBytes === null ? null : Buffer.from(capture.requestBodyBytes),
  })) };
}

/** One explicit run scope, fixed credentials/transport, sharing the caller's existing 4/10 budget.
 * Paid attempts (including ambiguous failures) replay without automatic retry on the same day.
 * No mutable caller result is retained in the cache; L9 is evaluated for each supplied data version.
 */
export function createExpandedSearchRunner(input: {
  readonly run: Omit<CollectInput, 'keyword'>;
  readonly apiKey: string | null;
  readonly transport: ProviderTransport;
  readonly budget: SearchCallBudget;
}): { execute(request: ExpandedSearchRequest, filter: KeywordMeaningFilterData,
  options?: ProviderCallOptions): Promise<readonly ExpandedSearchEvidence[]> } {
  const run = structuredClone(input.run);
  const { transport, budget } = input;
  const provider = createSerpApiProvider(input.apiKey, transport);
  const cache = new Map<string, CollectResult>();
  let active = false;
  return {
    async execute(request, filter, options = {}) {
      if (active) throw new Error('Expanded search runner already active');
      const frozenRequest = structuredClone(request);
      const plan = planExpandedSearch(frozenRequest);
      const frozenFilter = structuredClone(filter);
      // Actual canonical L9 validation before any transport effect.
      filterSerpApiResults({ results: [], filter: frozenFilter });
      active = true;
      try {
        const evidence: ExpandedSearchEvidence[] = [];
        for (const [index, query] of plan.entries()) {
          if (options.signal?.aborted) break;
          const day = new Date(transport.now()).toISOString().slice(0, 10);
          let cacheKey = expandedSearchRequestCacheKey(query, day);
          const saved = cache.get(cacheKey);
          const attempt = saved ? copyAttempt(saved) : await provider.collectExpanded(
            { ...run, keyword: query.query }, frozenRequest, index, budget, options,
          );
          // Never retry a settled paid attempt implicitly. No-key/cancel/budget skips have no capture.
          if (!saved && attempt.captures.length > 0) {
            // A limiter/response can cross midnight: cache the actual receipt's retrieval day.
            cacheKey = expandedSearchRequestCacheKey(query, attempt.captures[0]!.completedAt.slice(0, 10));
            cache.set(cacheKey, copyAttempt(attempt));
          }
          const admission = filterSerpApiResults({ results: attempt.webResults, filter: frozenFilter });
          evidence.push({
            runId: run.runId, query: query.query, cacheKey, cacheHit: saved !== undefined,
            requestedWindow: query.requestedWindow, siteDomain: query.siteDomain, attempt,
            invocationUsage: saved ? emptyUsage('SERPAPI') : attempt.usage,
            rows: attempt.webResults.map(result => ({ recordId: serpApiResultRecordId(result), result,
              requestedWindow: query.requestedWindow, siteDomain: query.siteDomain })),
            admission, mainCount: admission.includedRecordIds.length,
          });
          if (attempt.status === 'NOT_CONFIGURED' || attempt.status === 'CANCELLED'
            || attempt.status === 'WAITING_FOR_INPUT') break;
        }
        return evidence;
      } finally { active = false; }
    },
  };
}

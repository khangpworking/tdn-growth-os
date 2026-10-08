// L9 meaning filter for SerpApi web-discovery results (plan P5/G-13 consumer).
//
// Retained search results carry provider-reported identity (endpoint URL plus
// result position); each result becomes one filter record with its title plus
// snippet as candidate text and no resolving context. INCLUDED rows stay
// eligible for main counts and quotations; EXCLUDED rows carry their retained
// reason; UNCLEAR rows stay out. Reason accounting flows to the source
// appendix (U-27). This module is pure and provider-free: collection,
// retention and report admission belong to the owning service paths, which are
// allocated separately.

import {
  filterKeywordMeanings,
  type KeywordMeaningFilterData,
  type KeywordMeaningFilterResult,
} from '../keyword-meaning-filter.js';
import type { WebDiscoveryResult } from './providers.js';

export interface SerpApiL9FilterInput {
  /** Retained SerpApi web results in provider order. */
  readonly results: readonly Pick<WebDiscoveryResult, 'captureId' | 'position' | 'title' | 'snippet'>[];
  /** Versioned keyword/exclusion data already validated at its boundary. */
  readonly filter: KeywordMeaningFilterData;
}

export interface SerpApiL9FilterOutput {
  readonly contractVersion: 'serpapi-l9-filter-v1';
  readonly dataVersion: string;
  /** Record IDs admitted to main counts/quotations, in provider order. */
  readonly includedRecordIds: string[];
  /** Full frozen filter result with per-record reasons and accounting. */
  readonly result: KeywordMeaningFilterResult;
}

/**
 * Stable retained identity: the capture holding the result plus its position
 * within that capture. URLs are provider-reported text and can repeat or
 * shift across pages, so they never serve as identity.
 */
export function serpApiResultRecordId(result: Pick<WebDiscoveryResult, 'captureId' | 'position'>): string {
  return `${result.captureId}#${result.position}`;
}

function candidateText(result: Pick<WebDiscoveryResult, 'title' | 'snippet'>): string {
  return [result.title, result.snippet ?? ''].filter(part => part.length > 0).join('\n');
}

/**
 * Classify every retained result. Empty candidate text classifies UNCLEAR and
 * stays out; nothing here invents, drops or reorders provider evidence.
 */
export function filterSerpApiResults(input: SerpApiL9FilterInput): SerpApiL9FilterOutput {
  if (!input || typeof input !== 'object' || !Array.isArray(input.results)) {
    throw new TypeError('INVALID_SERPAPI_L9_INPUT: results must be a list');
  }
  const seen = new Set<string>();
  const records = input.results.map(result => {
    const recordId = serpApiResultRecordId(result);
    if (seen.has(recordId)) throw new TypeError(`INVALID_SERPAPI_L9_INPUT: duplicate result identity ${recordId}`);
    seen.add(recordId);
    return { recordId, text: candidateText(result), contextText: null as string | null };
  });
  const result = filterKeywordMeanings(input.filter, records);
  return {
    contractVersion: 'serpapi-l9-filter-v1',
    dataVersion: result.dataVersion,
    includedRecordIds: result.results.filter(row => row.decision === 'INCLUDED').map(row => row.recordId),
    result,
  };
}

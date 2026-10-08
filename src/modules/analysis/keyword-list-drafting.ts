// Versioned AI drafting for L9 keyword/exclusion lists (Ultimate v1.8+, plan U-12).
//
// The AI drafts per-category keyword and exclusion lists from product names in
// sales data (E11), seeded by frozen scope include/exclude terms. The model
// runs only behind an injected transport (synthetic fakes in tests; never a
// live application call from this module), and its output is validated against
// the canonical keyword-meaning-filter data contract before anything consumes
// it. Original frozen term bytes are preserved exactly: matching folds case
// and marks internally, but stored terms are never normalized or rewritten.
// Provenance is MODEL_DRAFTED, kept distinct from source evidence; drafting is
// not human approval and never becomes source truth by itself.

import {
  KEYWORD_MEANING_FILTER_DATA_CONTRACT,
  validatesKeywordMeaningFilterData,
  type KeywordMeaningExclusion,
  type KeywordMeaningFilterData,
} from './keyword-meaning-filter.js';

export const KEYWORD_LIST_DRAFT_CONTRACT = 'l9-keyword-list-draft-v1' as const;

export interface KeywordListDraftSeeds {
  /** Product names from retained sales data (E11 basis for the draft). */
  readonly productNames: readonly string[];
  /** Frozen scope include terms seeding the keyword list. */
  readonly includeTerms: readonly string[];
  /** Frozen scope exclude terms seeding the exclusion list. */
  readonly excludeTerms: readonly string[];
}

/** Narrow model port for list drafting. Implementations must not retain, mutate or transmit anything beyond the returned lists. */
export interface KeywordListDraftTransport {
  draftLists(input: {
    readonly productNames: readonly string[];
    readonly includeTerms: readonly string[];
    readonly excludeTerms: readonly string[];
  }): Promise<{ readonly keywords: readonly unknown[]; readonly exclusions: readonly unknown[] }>;
}

export interface KeywordListDraftRequest {
  readonly contractVersion: typeof KEYWORD_LIST_DRAFT_CONTRACT;
  /** Versioned keyword/exclusion set identity, e.g. `l9-thach-dua-v1`. */
  readonly dataVersion: string;
  readonly category: string;
  readonly seeds: KeywordListDraftSeeds;
}

export class KeywordListDraftError extends Error {
  readonly code = 'INVALID_KEYWORD_LIST_DRAFT';
}

function fail(message: string): never {
  throw new KeywordListDraftError(message);
}

function checkText(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) fail(`${what} must be a non-empty string within ${max} characters`);
  return value as string;
}

function checkSeeds(seeds: KeywordListDraftSeeds): void {
  if (!seeds || typeof seeds !== 'object') fail('seeds must be an object');
  for (const [key, values] of Object.entries(seeds) as [keyof KeywordListDraftSeeds, unknown][]) {
    if (!Array.isArray(values) || values.length > 200) fail(`seeds.${key} must be a list of at most 200 terms`);
    for (const term of values) checkText(term, `seeds.${key} term`, 200);
  }
  if (seeds.productNames.length === 0) fail('seeds.productNames must not be empty');
}

/**
 * Draft one versioned keyword/exclusion set through the injected transport and
 * freeze it as canonical filter data. Transport output is validated, never
 * trusted: malformed, empty or duplicate terms fail closed with no partial
 * retention. The returned terms keep their exact drafted bytes.
 */
export async function draftKeywordLists(
  transport: KeywordListDraftTransport,
  request: KeywordListDraftRequest,
): Promise<KeywordMeaningFilterData> {
  if (!request || typeof request !== 'object') fail('request must be an object');
  if (request.contractVersion !== KEYWORD_LIST_DRAFT_CONTRACT) fail('request contract version mismatch');
  checkText(request.dataVersion, 'dataVersion', 80);
  checkText(request.category, 'category', 120);
  checkSeeds(request.seeds);
  let drafted: { readonly keywords: readonly unknown[]; readonly exclusions: readonly unknown[] };
  try {
    drafted = await transport.draftLists({
      productNames: [...request.seeds.productNames],
      includeTerms: [...request.seeds.includeTerms],
      excludeTerms: [...request.seeds.excludeTerms],
    });
  } catch {
    fail('draft transport failed without retaining a list');
  }
  if (!drafted! || typeof drafted !== 'object') fail('draft transport returned no lists');
  if (!Array.isArray(drafted.keywords) || drafted.keywords.length === 0) fail('drafted keywords must be a non-empty list');
  if (!Array.isArray(drafted.exclusions)) fail('drafted exclusions must be a list');
  const data: KeywordMeaningFilterData = {
    contractVersion: KEYWORD_MEANING_FILTER_DATA_CONTRACT,
    dataVersion: request.dataVersion,
    category: request.category,
    provenance: 'MODEL_DRAFTED',
    keywords: drafted.keywords as [string, ...string[]],
    exclusions: drafted.exclusions as KeywordMeaningExclusion[],
  };
  if (!validatesKeywordMeaningFilterData(data)) fail('drafted lists failed canonical data validation');
  const folded = new Set<string>();
  for (const term of data.keywords) {
    const key = term.toLowerCase();
    if (folded.has(key)) fail(`duplicate drafted keyword: ${term}`);
    folded.add(key);
  }
  return data;
}

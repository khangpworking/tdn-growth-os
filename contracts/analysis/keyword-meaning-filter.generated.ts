/* Generated from keyword-meaning-filter.schema.json. Do not edit by hand. */

/**
 * Deterministic L9 keyword-meaning filter (Ultimate v1.8+, plan U-12). Versioned keyword/exclusion data plus frozen included/excluded/unclear decisions retaining exact record/context references and reasons. Matching keeps Vietnamese diacritics; undiacritized candidates resolve only from their own marked context. No provider, model or approval semantics.
 */
export type KeywordMeaningFilter = KeywordMeaningFilterData | KeywordMeaningFilterResult | KeywordMeaningRecords;
/**
 * Who drafted the keyword/exclusion data. Source and model-drafted provenance stay distinct; neither implies human approval.
 */
export type KeywordListProvenance = 'OPERATOR_SUPPLIED' | 'MODEL_DRAFTED';
export type Term = string;
export type ReasonText = string;
export type KeywordMeaningDecision = 'INCLUDED' | 'EXCLUDED' | 'UNCLEAR';
export type KeywordMeaningReason =
  | 'MATCHED_KEYWORD'
  | 'RESOLVED_BY_CONTEXT'
  | 'EXCLUDED_TERM'
  | 'EXCLUDED_CONTEXT'
  | 'UNRESOLVED_UNDIACRITICIZED'
  | 'UNLISTED_ACCENTED_LOOKALIKE'
  | 'NO_KEYWORD_MATCH'
  | 'EMPTY_TEXT';
/**
 * @maxItems 5000
 */
export type KeywordMeaningRecords = KeywordMeaningRecord[];

export interface KeywordMeaningFilterData {
  contractVersion: 'l9-keyword-data-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: [Term, ...Term[]];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
}
export interface KeywordMeaningExclusion {
  term: Term;
  reason: ReasonText;
}
export interface KeywordMeaningFilterResult {
  contractVersion: 'keyword-meaning-filter-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: [Term, ...Term[]];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
  /**
   * @maxItems 5000
   */
  results: KeywordMeaningRecordResult[];
  accounting: {
    included: number;
    excluded: number;
    unclear: number;
    byReason: {
      [k: string]: number;
    };
  };
}
export interface KeywordMeaningRecordResult {
  recordId: string;
  decision: KeywordMeaningDecision;
  reason: KeywordMeaningReason;
  matchedKeyword: Term | null;
  excludedBy: Term | null;
  exclusionReason: ReasonText | null;
  text: string;
  contextText: string | null;
}
/**
 * One collected candidate record at the trust boundary. Empty text is admitted and classifies UNCLEAR; identity is byte-exact.
 */
export interface KeywordMeaningRecord {
  recordId: string;
  text: string;
  contextText?: string | null;
}

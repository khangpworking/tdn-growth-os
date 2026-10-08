/* Generated from automation-source-evidence.schema.json. Do not edit by hand. */

/**
 * Who drafted the keyword/exclusion data. Source and model-drafted provenance stay distinct; neither implies human approval.
 */
export type KeywordListProvenance = 'OPERATOR_SUPPLIED' | 'MODEL_DRAFTED';
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

export interface AutomationSourceEvidence {
  contractVersion: 'automation-source-evidence-v1';
  draftDigest: string | null;
  admission: {
    contractVersion: 'serpapi-l9-filter-v1';
    dataVersion: string;
    /**
     * @minItems 0
     * @maxItems 5000
     */
    includedRecordIds: string[];
    result: KeywordMeaningFilterResult;
  } | null;
  unavailableReason: ('MODEL_NOT_CONFIGURED' | 'SALES_NAMES_UNAVAILABLE' | 'DRAFT_FAILED') | null;
  sourceAppendix: SourceAppendixProjection;
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
  keywords: [string, ...string[]];
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
export interface KeywordMeaningExclusion {
  term: string;
  reason: string;
}
export interface KeywordMeaningRecordResult {
  recordId: string;
  decision: KeywordMeaningDecision;
  reason: KeywordMeaningReason;
  matchedKeyword: string | null;
  excludedBy: string | null;
  exclusionReason: string | null;
  text: string;
  contextText: string | null;
}
export interface SourceAppendixProjection {
  contractVersion: 'source-appendix-projection-v2';
  registryVersion: '1.9';
  /**
   * @minItems 0
   * @maxItems 1024
   */
  rows: SourceAppendixRow[];
}
export interface SourceAppendixRow {
  registryId:
    | 'S01'
    | 'S02'
    | 'S03'
    | 'S04'
    | 'S05'
    | 'S06'
    | 'S07'
    | 'S08'
    | 'S09'
    | 'S10'
    | 'S11'
    | 'S12'
    | 'S13'
    | 'S14'
    | 'S15'
    | 'S16'
    | 'S17'
    | 'S18'
    | 'S19'
    | 'S20'
    | 'S21'
    | 'S22'
    | 'S23'
    | 'S24'
    | 'S25'
    | 'S26'
    | 'S27';
  tier: ('A' | 'B' | 'C') | null;
  tierDetail: string | null;
  group: string;
  reportName: string;
  binding: {
    kind: 'package' | 'capture' | 'upload' | 'fetch';
    ref: string;
  };
  l9Excluded: number | null;
  l9Unclear: number | null;
  l9Reasons: {
    [k: string]: number;
  };
  l10SourceType: ('review-video' | 'seller-video') | null;
  attribution: string | null;
}

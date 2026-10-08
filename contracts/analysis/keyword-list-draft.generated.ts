/* Generated from keyword-list-draft.schema.json. Do not edit by hand. */

export interface KeywordListDraftRequest {
  contractVersion: 'l9-keyword-list-draft-v1';
  dataVersion: string;
  category: string;
  seeds: KeywordListDraftSeeds;
}
export interface KeywordListDraftSeeds {
  /**
   * @minItems 1
   * @maxItems 500
   */
  productNames: [string, ...string[]];
  /**
   * @minItems 0
   * @maxItems 500
   */
  includeTerms: string[];
  /**
   * @minItems 0
   * @maxItems 500
   */
  excludeTerms: string[];
}

/* Generated from shopee-review-coding-model-v1.schema.json. Do not edit by hand. */

/**
 * Bounded model exchange for retained Shopee U22 draft coding: versioned admission source, exact model-facing input, frozen prompt and validated candidates. Only eligible retained review rows are admitted; quotes are exact retained substrings. Candidates are pending AI suggestions, never human review or approval.
 */
export type ShopeeReviewCodingModelV1 =
  ShopeeCodingModelSource | ShopeeCodingModelInput | ShopeeCodingModelPrompt | ShopeeCodingModelCandidates;
export type Uuid = string;
export type Digest = string;

export interface ShopeeCodingModelSource {
  contractVersion: 'shopee-coding-source-v1';
  request: {
    requestKey: Uuid;
    /**
     * @minItems 1
     * @maxItems 6000
     */
    recordIndexes?: [number, ...number[]];
  };
  binding: {
    workspaceId: Uuid;
    runId: Uuid;
    scopeSha256: Digest;
    sourceSetSha256: Digest;
    requestedPeriod: {
      startDate: string;
      endDate: string;
    };
  };
  sample: {
    sampleId: Digest;
    corpusArtifactSha256: Digest;
    corpusSha256: Digest;
  };
  keywordDigest: Digest;
}
export interface ShopeeCodingModelInput {
  contractVersion: 'shopee-coding-input-v1';
  brief: string;
  /**
   * @minItems 1
   * @maxItems 6000
   */
  records: [
    {
      recordIndex: number;
      text: string;
      shopId: string;
      itemId: string;
    },
    ...{
      recordIndex: number;
      text: string;
      shopId: string;
      itemId: string;
    }[],
  ];
}
export interface ShopeeCodingModelPrompt {
  contractVersion: 'shopee-review-coding-prompt-v1';
  systemText: string;
}
export interface ShopeeCodingModelCandidates {
  contractVersion: 'shopee-coding-candidates-v1';
  /**
   * @minItems 0
   * @maxItems 6000
   */
  codes: {
    code: string;
    label: string;
    recordIndex: number;
    quote: {
      text: string;
      start: number;
      end: number;
    };
  }[];
}

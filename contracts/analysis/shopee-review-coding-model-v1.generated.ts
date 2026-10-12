/* Generated from shopee-review-coding-model-v1.schema.json. Do not edit by hand. */

/**
 * Bounded model exchange for retained Shopee U22 draft coding: versioned admission source, exact model-facing input, frozen prompt and validated candidates. Only eligible retained review rows are admitted; quotes are exact retained substrings. Candidates are pending AI suggestions, never human review or approval.
 */
export type ShopeeReviewCodingModelV1 =
  ShopeeCodingModelSource | ShopeeCodingModelInput | ShopeeCodingModelPrompt | ShopeeCodingModelCandidates;
export type Uuid = string;
export type Digest = string;
export type ShopeeCodingModelCandidates = ShopeeCodingModelCandidatesV1 | ShopeeCodingModelCandidatesV2;

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
    sourceSetSha256: string | null;
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
  keywordDigest: string | null;
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
      shopId: string | null;
      itemId: string | null;
    },
    ...{
      recordIndex: number;
      text: string;
      shopId: string | null;
      itemId: string | null;
    }[],
  ];
}
export interface ShopeeCodingModelPrompt {
  contractVersion: 'shopee-review-coding-prompt-v1' | 'shopee-review-coding-prompt-v2';
  systemText: string;
}
export interface ShopeeCodingModelCandidatesV1 {
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
    polarity?: 'KHEN' | 'CHE' | 'KHONG_RO';
    topic?: string | null;
  }[];
}
export interface ShopeeCodingModelCandidatesV2 {
  contractVersion: 'shopee-coding-candidates-v2';
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
    polarity: 'KHEN' | 'CHE' | 'KHONG_RO';
    topic: string | null;
  }[];
}

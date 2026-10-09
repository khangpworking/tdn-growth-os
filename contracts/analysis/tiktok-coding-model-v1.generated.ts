/* Generated from tiktok-coding-model-v1.schema.json. Do not edit by hand. */

/**
 * Bounded model exchange for retained S07 draft coding: versioned admission source, exact model-facing input, frozen prompt and validated candidates. Only eligible INCLUDED CUSTOMER records are admitted; quotes are exact retained substrings. Candidates are pending AI suggestions, never human review or approval.
 */
export type TikTokCodingModelV1 =
  TikTokCodingModelSource | TikTokCodingModelInput | TikTokCodingModelPrompt | TikTokCodingModelCandidates;
export type Uuid = string;
export type Digest = string;

export interface TikTokCodingModelSource {
  contractVersion: 'tiktok-coding-source-v1';
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
  corpus: {
    packageId: Uuid;
    manifestArtifactSha256: Digest;
    packageContentSha256: Digest;
    corpusSha256: Digest;
  };
  keywordDigest: Digest;
}
export interface TikTokCodingModelInput {
  contractVersion: 'tiktok-coding-input-v1';
  brief: string;
  /**
   * @minItems 1
   * @maxItems 6000
   */
  records: [
    {
      recordIndex: number;
      text: string;
      videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO';
      sourceType: 'COMMENT_UNDER_REVIEW_VIDEO' | 'COMMENT_UNDER_SELLER_VIDEO';
    },
    ...{
      recordIndex: number;
      text: string;
      videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO';
      sourceType: 'COMMENT_UNDER_REVIEW_VIDEO' | 'COMMENT_UNDER_SELLER_VIDEO';
    }[],
  ];
}
export interface TikTokCodingModelPrompt {
  contractVersion: 'tiktok-coding-prompt-v1';
  systemText: string;
}
export interface TikTokCodingModelCandidates {
  contractVersion: 'tiktok-coding-candidates-v1';
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

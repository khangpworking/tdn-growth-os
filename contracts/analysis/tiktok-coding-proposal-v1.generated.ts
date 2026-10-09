/* Generated from tiktok-coding-proposal-v1.schema.json. Do not edit by hand. */

/**
 * Run/source-bound draft coding of a retained S07 TikTok comment corpus. Only eligible INCLUDED CUSTOMER records are coded, with exact retained quotes; seller/creator/reply/tag/emoji/conflict/excluded/unclear rows stay reasoned evidence outside primary counts. Counts are proposed and await owner review, never human approval. No raw author identity, key material, cross-platform joins, population estimates, personas, or second classification. Source period remains unknown/unverified.
 */
export type TikTokCodingProposalV1 =
  | TikTokCodingProposeRequest
  | TikTokDraftCoding
  | TikTokCodingReceipt
  | TikTokCodingHistory
  | TikTokCodedReport
  | TikTokCodingReadView
  | TikTokCodingContextView;
export type Uuid = string;
export type Digest = string;

export interface TikTokCodingProposeRequest {
  contractVersion: 'tiktok-coding-propose-v1';
  requestKey: Uuid;
  expectedRevision?: number;
  binding: TikTokCodingBinding;
  corpus: TikTokCodingCorpusIdentity;
  keywordDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 6000
   */
  recordIndexes?: [number, ...number[]];
}
export interface TikTokCodingBinding {
  workspaceId: Uuid;
  runId: Uuid;
  scopeSha256: Digest;
  sourceSetSha256: Digest;
  requestedPeriod: {
    startDate: string;
    endDate: string;
  };
}
export interface TikTokCodingCorpusIdentity {
  packageId: Uuid;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
}
export interface TikTokDraftCoding {
  contractVersion: 'tiktok-draft-coding-v1';
  proposalId: Uuid;
  requestKey: Uuid;
  binding: TikTokCodingBinding;
  corpus: TikTokCodingCorpusIdentity;
  keywordDigest: Digest;
  promptVersion: 'tiktok-coding-prompt-v1';
  /**
   * @minItems 0
   * @maxItems 6000
   */
  codes: TikTokDraftCode[];
  counts: {
    recordsCoded: number;
    codesProposed: number;
    quotesCited: number;
  };
  status: 'PROPOSED_AWAITING_REVIEW';
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
export interface TikTokDraftCode {
  code: string;
  label: string;
  recordIndex: number;
  quote: TikTokCodingQuote;
  citationId: number;
}
export interface TikTokCodingQuote {
  text: string;
  start: number;
  end: number;
}
export interface TikTokCodingReceipt {
  contractVersion: 'tiktok-coding-receipt-v1';
  proposalId: Uuid;
  requestKey: Uuid;
  exactRetry: boolean;
}
export interface TikTokCodingHistory {
  contractVersion: 'tiktok-coding-history-v1';
  sources: {
    proposalId: Uuid;
    requestKey: Uuid;
    packageId: string;
    manifestArtifactSha256: string;
    packageContentSha256: string;
    createdAt: string;
    status: 'PROPOSED_AWAITING_REVIEW';
  }[];
}
export interface TikTokCodedReport {
  contractVersion: 'tiktok-coded-report-v1';
  proposalId: string;
  draftSha256: string;
  corpus: TikTokCodingCorpusIdentity;
  keywordDigest: string;
  /**
   * @minItems 0
   * @maxItems 6
   */
  findings:
    | []
    | [TikTokCodedFinding]
    | [TikTokCodedFinding, TikTokCodedFinding]
    | [TikTokCodedFinding, TikTokCodedFinding, TikTokCodedFinding]
    | [TikTokCodedFinding, TikTokCodedFinding, TikTokCodedFinding, TikTokCodedFinding]
    | [TikTokCodedFinding, TikTokCodedFinding, TikTokCodedFinding, TikTokCodedFinding, TikTokCodedFinding]
    | [
        TikTokCodedFinding,
        TikTokCodedFinding,
        TikTokCodedFinding,
        TikTokCodedFinding,
        TikTokCodedFinding,
        TikTokCodedFinding,
      ];
  counts: {
    recordsCoded: number;
    codesProposed: number;
    quotesCited: number;
  };
  status: 'PROPOSED_AWAITING_REVIEW';
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
export interface TikTokCodedFinding {
  sectionId: 'I02' | 'I10' | 'I17';
  code: string;
  label: string;
  template: string;
  status: 'PROPOSED_AWAITING_REVIEW';
  scope: string;
  /**
   * @minItems 1
   * @maxItems 6000
   */
  citations: [TikTokFindingCitation, ...TikTokFindingCitation[]];
}
export interface TikTokFindingCitation {
  citationId: number;
  locator: string;
  url: string | null;
}
export interface TikTokCodingReadView {
  contractVersion: 'tiktok-coding-read-v1';
  draft: TikTokDraftCoding;
  report: TikTokCodedReport;
  citations: TikTokReadCitation[];
  finalizedAt: string;
}
export interface TikTokReadCitation {
  citationId: number;
  locator: string;
  url: string | null;
}
export interface TikTokCodingContextView {
  contractVersion: 'tiktok-coding-context-v1';
  binding: TikTokCodingBinding;
  corpus: TikTokCodingCorpusIdentity;
  keywordDigest: string;
  counts: TikTokCodingContextCounts;
}
export interface TikTokCodingContextCounts {
  eligible: number;
  excluded: number;
  unclear: number;
}

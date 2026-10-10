/* Generated from shopee-review-coding-v1.schema.json. Do not edit by hand. */

/**
 * Run/source-bound draft coding of a retained Shopee U22 review sample. Only eligible SELECTED_TEXT reviews with readable text are coded, with exact retained quotes; excluded/unreadable rows stay reasoned evidence outside primary counts. Counts are proposed and await owner review, never human approval. No author identities, cross-platform joins, population estimates, personas, or second classification. Source period remains unknown/unverified.
 */
export type ShopeeReviewCodingV1 =
  | ShopeeCodingProposeRequest
  | ShopeeDraftCoding
  | ShopeeCitedSynthesis
  | ShopeeCodingReceipt
  | ShopeeCodingHistory
  | ShopeeCodingReadView
  | ShopeeCodingContextView
  | ShopeeConsumptionView
  | ShopeeSampleSelection;

export interface ShopeeCodingProposeRequest {
  contractVersion: 'shopee-coding-propose-v1';
  requestKey: string;
  expectedRevision?: number;
  binding: ShopeeCodingBinding;
  sample: ShopeeCodingSampleIdentity;
  keywordDigest: string | null;
  /**
   * @minItems 1
   * @maxItems 6000
   */
  recordIndexes?: [number, ...number[]];
}
export interface ShopeeCodingBinding {
  workspaceId: string;
  runId: string;
  scopeSha256: string;
  sourceSetSha256: string | null;
  requestedPeriod: ShopeeRequestedPeriod;
}
export interface ShopeeRequestedPeriod {
  startDate: string;
  endDate: string;
}
export interface ShopeeCodingSampleIdentity {
  sampleId: string;
  corpusArtifactSha256: string;
}
export interface ShopeeDraftCoding {
  contractVersion: 'shopee-draft-coding-v1';
  proposalId: string;
  requestKey: string;
  binding: ShopeeCodingBinding;
  sample: ShopeeCodingSampleIdentity;
  keywordDigest: string | null;
  promptVersion: 'shopee-review-coding-prompt-v1';
  /**
   * @minItems 0
   * @maxItems 6000
   */
  codes: ShopeeDraftCode[];
  counts: ShopeeCodingCounts;
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
export interface ShopeeDraftCode {
  code: string;
  label: string;
  recordIndex: number;
  quote: ShopeeCodingQuote;
  citationId: number;
}
export interface ShopeeCodingQuote {
  text: string;
  start: number;
  end: number;
}
export interface ShopeeCodingCounts {
  recordsCoded: number;
  codesProposed: number;
  quotesCited: number;
}
export interface ShopeeCitedSynthesis {
  contractVersion: 'shopee-cited-synthesis-v1';
  proposalId: string;
  draftSha256: string;
  sample: ShopeeCodingSampleIdentity;
  keywordDigest: string | null;
  /**
   * @minItems 0
   * @maxItems 6
   */
  findings:
    | []
    | [ShopeeCitedFinding]
    | [ShopeeCitedFinding, ShopeeCitedFinding]
    | [ShopeeCitedFinding, ShopeeCitedFinding, ShopeeCitedFinding]
    | [ShopeeCitedFinding, ShopeeCitedFinding, ShopeeCitedFinding, ShopeeCitedFinding]
    | [ShopeeCitedFinding, ShopeeCitedFinding, ShopeeCitedFinding, ShopeeCitedFinding, ShopeeCitedFinding]
    | [
        ShopeeCitedFinding,
        ShopeeCitedFinding,
        ShopeeCitedFinding,
        ShopeeCitedFinding,
        ShopeeCitedFinding,
        ShopeeCitedFinding,
      ];
  counts: ShopeeCodingCounts;
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
export interface ShopeeCitedFinding {
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
  citations: [ShopeeFindingCitation, ...ShopeeFindingCitation[]];
}
export interface ShopeeFindingCitation {
  citationId: number;
  locator: string;
  url?: string | null;
}
export interface ShopeeCodingReceipt {
  contractVersion: 'shopee-coding-receipt-v1';
  proposalId: string;
  requestKey: string;
  exactRetry: boolean;
}
export interface ShopeeCodingHistory {
  contractVersion: 'shopee-coding-history-v1';
  sources: ShopeeHistorySource[];
}
export interface ShopeeHistorySource {
  proposalId: string;
  requestKey: string;
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
  createdAt: string;
  status: 'PROPOSED_AWAITING_REVIEW';
}
export interface ShopeeCodingReadView {
  contractVersion: 'shopee-coding-read-v1';
  draft: ShopeeDraftCoding;
  report: ShopeeCitedSynthesis;
  citations: ShopeeReadCitation[];
  finalizedAt: string;
}
export interface ShopeeReadCitation {
  citationId: number;
  locator: string;
  context: string;
  recordIndex: number;
  url: string | null;
}
export interface ShopeeCodingContextView {
  contractVersion: 'shopee-coding-context-v1';
  binding: ShopeeCodingBinding;
  sample: ShopeeCodingSampleIdentity;
  keywordDigest: string | null;
  counts: ShopeeCodingContextCounts;
}
export interface ShopeeCodingContextCounts {
  eligible: number;
  excluded: number;
  unreadable: number;
}
export interface ShopeeConsumptionView {
  contractVersion: 'shopee-consumption-view-v1';
  entries: ShopeeConsumptionEntry[];
}
export interface ShopeeConsumptionEntry {
  revisionId: string;
  reportIdentitySha256: string;
  sampleId: string;
  codingDraftSha256: string;
  actorId: string;
  consumedAt: string;
}
export interface ShopeeSampleSelection {
  contractVersion: 'shopee-sample-selection-v1';
  binding: ShopeeCodingBinding;
  sample: ShopeeCodingSampleIdentity;
  counts: ShopeeSampleSelectionCounts;
}
export interface ShopeeSampleSelectionCounts {
  eligible: number;
  excluded: number;
  unreadable: number;
}

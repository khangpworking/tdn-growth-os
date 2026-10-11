/* Generated from automation-insight-report-revision.schema.json. Do not edit by hand. */

/**
 * Owner report-revision request carrying either accepted coding receipts (v1) or one versioned receipt-free draft selection. Exactly one variant validates; historical v1 payloads match only the accepted branch.
 */
export type AutomationInsightReportRevisionRequest =
  | AutomationInsightAcceptedReportRevisionRequest
  | AutomationInsightDraftReportRevisionRequest
  | AutomationInsightLiteralReportRevisionRequest
  | AutomationInsightDefaultReportRevisionRequest
  | AutomationInsightCrosscheckReportRevisionRequest
  | AutomationInsightQualitativeReportRevisionRequest;
export type InsightDraftSelection = InsightDraftSelectionV1 | InsightDraftSelectionV2;
export type QualitativeDraftAuthorState =
  | {
      state: 'VERIFIED_HASHED';
      hash: string;
    }
  | {
      state: 'MISSING' | 'INVALID' | 'UNAVAILABLE';
      hash: null;
    };

export interface AutomationInsightAcceptedReportRevisionRequest {
  contractVersion: 'automation-insight-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  acceptedInsight: InsightReportSelection;
}
export interface InsightRevisionSources {
  metric: Keep;
  nativeReview: Keep;
}
export interface Keep {
  decision: 'KEEP';
}
export interface InsightReportSelection {
  proposalId: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  receiptIds: [string, ...string[]];
}
export interface AutomationInsightDraftReportRevisionRequest {
  contractVersion: 'automation-insight-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  draftInsight: InsightDraftSelection;
}
/**
 * Versioned receipt-free draft selection of one exact retained proposal. Zero receipts by construction; never an implicit latest, never approval.
 */
export interface InsightDraftSelectionV1 {
  contractVersion: 'insight-draft-select-v1';
  proposalId: string;
}
/**
 * Versioned receipt-free draft selection of one exact retained proposal. Zero receipts by construction; never an implicit latest, never approval.
 */
export interface InsightDraftSelectionV2 {
  contractVersion: 'insight-draft-select-v2';
  proposalId: string;
}
/**
 * Explicit source-only literal projection from the exact previous pair. Does not create coding adoption or bypass existing inherited coding lineage.
 */
export interface AutomationInsightLiteralReportRevisionRequest {
  contractVersion: 'automation-insight-literal-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  literalInsight: InsightLiteralSelection;
}
export interface InsightLiteralSelection {
  contractVersion: 'insight-literal-select-v1';
}
export interface AutomationInsightDefaultReportRevisionRequest {
  contractVersion: 'automation-insight-default-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  defaultInsight: InsightDefaultDraftSelection;
}
export interface InsightDefaultDraftSelection {
  contractVersion: 'insight-default-draft-select-v1';
  proposalId: string;
  proposalSha256: string;
}
export interface AutomationInsightCrosscheckReportRevisionRequest {
  contractVersion: 'automation-insight-crosscheck-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  defaultInsight: InsightDefaultDraftSelection;
  crosscheckInsight: InsightCrosscheckSelection;
}
export interface InsightCrosscheckSelection {
  contractVersion: 'insight-crosscheck-select-v1';
  requestKey: string;
  snapshotSha256: string;
  firstProposalId: string;
  firstProposalSha256: string;
}
/**
 * Explicit source-bound qualitative draft admission. The owning service replays the exact retained S05/S07 source before this request can create an Insight revision.
 */
export interface AutomationInsightQualitativeReportRevisionRequest {
  contractVersion: 'automation-insight-qualitative-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  qualitativeDraft: AutomationQualitativeDraft;
}
export interface AutomationQualitativeDraft {
  contractVersion: 'automation-qualitative-draft-v1';
  draftId: string;
  requestKey: string;
  binding: QualitativeDraftBinding;
  source: QualitativeDraftSourceIdentity;
  /**
   * @minItems 1
   * @maxItems 6000
   */
  records: [QualitativeDraftSourceRecord, ...QualitativeDraftSourceRecord[]];
  /**
   * @maxItems 6000
   */
  classifications: QualitativeDraftClassification[];
  /**
   * @maxItems 100
   */
  cards: QualitativeDraftEvidenceCard[];
  counts: {
    included: number;
    excluded: number;
    unclear: number;
    classified: number;
    unclassified: number;
  };
  policy: {
    status: 'PROPOSED_AWAITING_REVIEW';
    reliability: {
      state: 'UNAVAILABLE';
      code: 'U11_STATISTIC_UNAVAILABLE';
    };
    releaseEligibility: 'UNAVAILABLE';
    mainConclusionUse: 'EXCLUDED';
  };
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
export interface QualitativeDraftBinding {
  workspaceId: string;
  runId: string;
  scopeSha256: string;
  sourceSetSha256: string | null;
  requestedPeriod: {
    startDate: string;
    endDate: string;
  };
}
export interface QualitativeDraftSourceIdentity {
  platform: 'SHOPEE' | 'TIKTOK';
  sourceType: 'S05_LOCATED_REVIEW' | 'S07_TIKTOK_COMMENT';
  sourceSha256: string;
  sourcePackageId: string | null;
  sourceManifestSha256: string | null;
  sourceContentSha256: string | null;
}
export interface QualitativeDraftSourceRecord {
  recordIndex: number;
  recordId: string;
  text: string | null;
  locator: QualitativeDraftLocator;
  sourceHash: string;
  author: QualitativeDraftAuthorState;
  admission: 'INCLUDED' | 'EXCLUDED' | 'UNCLEAR';
  admissionReason: string | null;
}
export interface QualitativeDraftLocator {
  owner: string;
  pageSha256: string;
  pageIndex: number;
  rowIndex: number;
  textPointer: string;
}
export interface QualitativeDraftClassification {
  recordIndex: number;
  recordId: string;
  status: 'CLASSIFIED' | 'UNCLASSIFIED' | 'UNAVAILABLE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'AMBIGUOUS' | 'UNAVAILABLE';
  situation: string | null;
  journey: string | null;
  topic: string | null;
  statedSentiment: ('POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'NOT_STATED' | 'AMBIGUOUS') | null;
  /**
   * @maxItems 8
   */
  quotes:
    | []
    | [QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ];
  uncertainty: {
    state: 'AMBIGUOUS' | 'UNAVAILABLE';
    detail: string;
  } | null;
}
export interface QualitativeDraftQuote {
  recordIndex: number;
  recordId: string;
  locator: QualitativeDraftLocator;
  text: string;
  start: number;
  end: number;
}
export interface QualitativeDraftEvidenceCard {
  cardId: string;
  situation: QualitativeDraftAttribute;
  journey: QualitativeDraftAttribute | null;
  /**
   * @minItems 2
   * @maxItems 6000
   */
  recordIndexes: [number, number, ...number[]];
  /**
   * @minItems 2
   * @maxItems 16
   */
  quotes:
    | [QualitativeDraftQuote, QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ];
  /**
   * @maxItems 8
   */
  attributes:
    | []
    | [QualitativeDraftAttribute]
    | [QualitativeDraftAttribute, QualitativeDraftAttribute]
    | [QualitativeDraftAttribute, QualitativeDraftAttribute, QualitativeDraftAttribute]
    | [QualitativeDraftAttribute, QualitativeDraftAttribute, QualitativeDraftAttribute, QualitativeDraftAttribute]
    | [
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
      ]
    | [
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
      ]
    | [
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
      ]
    | [
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
        QualitativeDraftAttribute,
      ];
  authorEvidence: 'VERIFIED_DISTINCT_AUTHORS' | 'NO_VERIFIED_AUTHOR_IDS' | 'UNAVAILABLE';
  identityLimitation: string;
  status: 'PROPOSED';
}
export interface QualitativeDraftAttribute {
  kind: 'SITUATION' | 'NEED' | 'WORRY' | 'PURCHASE_REASON' | 'CHANNEL';
  value: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  quotes:
    | [QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote]
    | [QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote, QualitativeDraftQuote]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ]
    | [
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
        QualitativeDraftQuote,
      ];
}

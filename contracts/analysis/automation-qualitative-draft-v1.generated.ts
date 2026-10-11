/* Generated from automation-qualitative-draft-v1.schema.json. Do not edit by hand. */

/**
 * Additive source-bound qualitative draft for retained S05 Shopee reviews and S07 TikTok comments. It preserves platform/source separation, exact retained quote pointers and explicit ambiguity/unavailability. All classifications and evidence cards are pending proposals; U11 reliability, release eligibility and main-conclusion use are unavailable.
 */
export type AutomationQualitativeDraftV1 =
  | AutomationQualitativeDraft
  | QualitativeDraftBinding
  | QualitativeDraftSourceIdentity
  | QualitativeDraftSourceRecord
  | QualitativeDraftClassification
  | QualitativeDraftEvidenceCard;
export type Uuid = string;
export type Digest = string;
export type QualitativeDraftAuthorState =
  | {
      state: 'VERIFIED_HASHED';
      hash: Digest;
    }
  | {
      state: 'MISSING' | 'INVALID' | 'UNAVAILABLE';
      hash: null;
    };

export interface AutomationQualitativeDraft {
  contractVersion: 'automation-qualitative-draft-v1';
  draftId: Uuid;
  requestKey: Uuid;
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
  workspaceId: Uuid;
  runId: Uuid;
  scopeSha256: Digest;
  sourceSetSha256: Digest | null;
  requestedPeriod: {
    startDate: string;
    endDate: string;
  };
}
export interface QualitativeDraftSourceIdentity {
  platform: 'SHOPEE' | 'TIKTOK';
  sourceType: 'S05_LOCATED_REVIEW' | 'S07_TIKTOK_COMMENT';
  sourceSha256: Digest;
  sourcePackageId: Uuid | null;
  sourceManifestSha256: Digest | null;
  sourceContentSha256: Digest | null;
}
export interface QualitativeDraftSourceRecord {
  recordIndex: number;
  recordId: string;
  text: string | null;
  locator: QualitativeDraftLocator;
  sourceHash: Digest;
  author: QualitativeDraftAuthorState;
  admission: 'INCLUDED' | 'EXCLUDED' | 'UNCLEAR';
  admissionReason: string | null;
}
export interface QualitativeDraftLocator {
  owner: string;
  pageSha256: Digest;
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
  cardId: Digest;
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

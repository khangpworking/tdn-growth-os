/* Generated from research-automation-reader-report-api.schema.json. Do not edit by hand. */

/**
 * Reader page for the OWNER built from a DRAFT_READY run, and the OWNER decision on it. Building restates the draft; it never edits the draft, admits sources or calls a provider.
 */
export type ResearchAutomationReaderReportApi =
  | ResearchAutomationReaderBuildRequest
  | ResearchAutomationReaderBuildReceipt
  | ResearchAutomationReaderDecisionRequest
  | ResearchAutomationReaderDecisionReceipt
  | ResearchAutomationReaderRevisionList
  | ResearchAutomationUnitSpecIntakeRequest
  | ResearchAutomationUnitSpecIntakeRecord
  | ResearchAutomationUnitSpecIntakeReceipt
  | ResearchAutomationIntakeBoundReaderBuildRequest;
export type Platform = 'shopee' | 'tiktok';
export type Sha256 = string;
export type Timestamp = string;

export interface ResearchAutomationReaderBuildRequest {
  contractVersion: 'reader-report-build-v1' | 'reader-report-build-v1.1' | 'reader-report-build-v1.2';
  requestKey: string;
  metricPackageId: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: Platform[];
  profile: Profile;
  cover: null | ResearchAutomationReaderCover;
  source?: Source;
  /**
   * Opaque retained search-page snapshot; checked by the snapshot validator and canonical digest.
   */
  webSnapshot?: {
    [k: string]: unknown;
  };
  webSnapshotSha256?: Sha256;
  unitPrices?: UnitPrices;
}
export interface Profile {
  slug: string;
  product: string;
  status: 'proposed' | 'approved';
  segments: TextMap;
  short: TextMap;
  /**
   * @minItems 1
   * @maxItems 30
   */
  core: string[];
  /**
   * @maxItems 30
   */
  non: string[];
  labelOverrides?: TextMap;
  /**
   * @minItems 1
   * @maxItems 500
   */
  rules: Rule[];
  primaryNouns?: {
    [k: string]: string;
  };
  stripBeforePrimary?: string;
  measure?: {
    unit: string;
    re: string;
    toBase: {
      [k: string]: number;
    };
  };
  /**
   * Pairs of [label, title pattern].
   *
   * @maxItems 30
   */
  signals: string[][];
  benchmark?: {
    label: string;
    titleRe?: string;
    /**
     * @minItems 2
     * @maxItems 2
     */
    measureRange?: number[];
    excludeRe?: string;
  };
  brandAlias?: TextMap1;
}
export interface TextMap {
  [k: string]: string;
}
export interface Rule {
  seg: string;
  when: Condition;
  why?: string;
}
export interface Condition {
  /**
   * @maxItems 20000
   */
  idIn?: number[];
  labelEq?: string;
  labelPrefix?: string;
  titleRe?: string;
  notTitleRe?: string;
  aspGte?: number;
  measureGte?: number;
  measureMinGte?: number;
  /**
   * @maxItems 50
   */
  primaryIn?: string[];
  /**
   * @minItems 1
   * @maxItems 50
   */
  any?: Condition[];
}
/**
 * Lower-case brand spelling to the canonical brand name.
 */
export interface TextMap1 {
  [k: string]: string;
}
export interface ResearchAutomationReaderCover {
  imageBase64: string;
  licence: 'CC0' | 'public-domain' | 'owner-supplied';
  credit?: string;
}
/**
 * What the export screen displayed for the broader query. Used only to state coverage of the exported rows.
 */
export interface Source {
  measurementPeriod: {
    start: string;
    end: string;
  };
  rowCap: number;
  displayedHeadlines: {
    revenueVnd: number | null;
    soldListings: number | null;
    shops: number | null;
    units: number | null;
  };
  platformBreakdown: {
    shopee?: PlatformDisplay;
    tiktok?: PlatformDisplay;
  };
}
export interface PlatformDisplay {
  displayedRevenueVnd: number | null;
}
export interface UnitPrices {
  contractVersion: 'market-unit-prices-v1';
  /**
   * @minItems 1
   * @maxItems 500
   */
  sources: {
    sha256: string;
    role: 'LISTING_SPEC' | 'OWNER_DECLARATION';
  }[];
  /**
   * @maxItems 500
   */
  records: {
    rowI: number;
    source: {
      sourceSha256: string;
      locator: string;
    };
    observation: UnitPriceObservation;
    quantityOverride?: {
      source: {
        sourceSha256: string;
        locator: string;
      };
      observation: UnitPriceObservation;
    };
  }[];
}
export interface UnitPriceObservation {
  platform: 'shopee' | 'tiktok';
  listing: string;
  variant: string;
  category: {
    label: string;
    kind: 'MASS' | 'VOLUME' | 'COUNT' | 'DURABLE' | 'COMBO';
    massBasis: 'NET' | 'DRAINED' | 'NOT_APPLICABLE';
    countKind: string | null;
    specGroup: string | null;
  };
  price: {
    value: number | null;
    currency: 'VND';
    kind: 'LISTED' | 'PAYMENT' | 'CONDITIONAL_PROMO';
    /**
     * @maxItems 20
     */
    conditions: string[];
  };
  quantity: {
    value: number | null;
    unit: 'g' | 'ml' | 'count' | 'item' | 'combo';
  };
  period: {
    start: string;
    end: string;
  };
}
export interface ResearchAutomationReaderBuildReceipt {
  contractVersion: 'reader-report-build-receipt-v1';
  exactRetry: boolean;
  revision: ResearchAutomationReaderRevision;
}
export interface ResearchAutomationReaderRevision {
  revisionId: string;
  revisionNumber: number;
  workspaceId: string;
  runId: string;
  state: 'PENDING_OWNER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  draftPairId: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: Platform[];
  profileStatus: 'proposed' | 'approved';
  htmlSha256: Sha256;
  createdAt: Timestamp;
  decision: null | {
    decision: 'APPROVED' | 'REJECTED';
    reason: string | null;
    decidedAt: Timestamp;
  };
}
export interface ResearchAutomationReaderDecisionRequest {
  contractVersion: 'reader-report-decision-v1';
  requestKey: string;
  revisionId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: null | string;
}
export interface ResearchAutomationReaderDecisionReceipt {
  contractVersion: 'reader-report-decision-receipt-v1';
  exactRetry: boolean;
  revision: ResearchAutomationReaderRevision;
}
export interface ResearchAutomationReaderRevisionList {
  contractVersion: 'reader-report-list-v1';
  workspaceId: string;
  runId: string;
  /**
   * @maxItems 10000
   */
  revisions: ResearchAutomationReaderRevision[];
}
export interface ResearchAutomationUnitSpecIntakeRequest {
  contractVersion: 'reader-unit-spec-intake-v1';
  metricPackageId: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: Platform[];
  unitPrices: UnitPrices1;
}
export interface UnitPrices1 {
  contractVersion: 'market-unit-prices-v1';
  /**
   * @minItems 1
   * @maxItems 500
   */
  sources: {
    sha256: string;
    role: 'LISTING_SPEC' | 'OWNER_DECLARATION';
  }[];
  /**
   * @maxItems 500
   */
  records: {
    rowI: number;
    source: {
      sourceSha256: string;
      locator: string;
    };
    observation: UnitPriceObservation;
    quantityOverride?: {
      source: {
        sourceSha256: string;
        locator: string;
      };
      observation: UnitPriceObservation;
    };
  }[];
}
export interface ResearchAutomationUnitSpecIntakeRecord {
  contractVersion: 'reader-unit-spec-intake-record-v1';
  workspaceId: string;
  runId: string;
  draftPairId: Sha256;
  workbookSha256: Sha256;
  actorId: string;
  request: ResearchAutomationUnitSpecIntakeRequest;
}
export interface ResearchAutomationUnitSpecIntakeReceipt {
  contractVersion: 'reader-unit-spec-intake-receipt-v1';
  exactRetry: boolean;
  intakeSha256: Sha256;
  workspaceId: string;
  runId: string;
  request: ResearchAutomationUnitSpecIntakeRequest;
}
export interface ResearchAutomationIntakeBoundReaderBuildRequest {
  contractVersion: 'reader-report-unit-spec-build-v1';
  intakeSha256: Sha256;
  request: ResearchAutomationReaderBuildRequest & {
    contractVersion?: 'reader-report-build-v1.2';
    unitPrices: unknown;
    [k: string]: unknown;
  };
}

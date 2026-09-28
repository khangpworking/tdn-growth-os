/* Generated from report-api.schema.json. Do not edit by hand. */

export type ResearchReportReadAPIResponses =
  | WorkspaceReportIndexResponse
  | ReportHistoryResponse
  | ReportInterpretationIndexResponse
  | ReportInterpretationDetailResponse
  | ReportReviewTarget
  | ReportApiErrorResponse;
export type Uuid = string;
export type DateTime = string;
export type Digest = string;

export interface WorkspaceReportIndexResponse {
  contractVersion: '1.0.0';
  workspaceId: Uuid;
  /**
   * @maxItems 1000
   */
  reports: ReportSeriesSummary[];
}
export interface ReportSeriesSummary {
  reportId: Uuid;
  reportKey: string;
  createdAt: DateTime;
}
export interface ReportHistoryResponse {
  contractVersion: '1.0.0';
  reportId: Uuid;
  reportKey: string;
  workspaceId: Uuid;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  versions: ReportVersionSummary[];
}
export interface ReportVersionSummary {
  versionId: Uuid;
  version: number;
  previousSemanticVersionId: null | Digest;
  semanticVersionId: Digest;
  createdAt: DateTime;
  status: 'DRAFT';
  interpretationState: 'NONE';
  reviewState: 'UNREVIEWED';
  scope: Scope;
  sectionCounts: SectionCounts;
  selectedSourceCount: number;
  /**
   * @minItems 1
   * @maxItems 40
   */
  artifacts: Artifact[];
}
export interface Scope {
  key: string;
  platform: 'shopee' | 'tiktok';
  selection: 'ON' | 'OFF' | 'UNSPECIFIED';
  start: string;
  end: string;
  periodBasis: string;
  acquiredAt: null | DateTime;
}
export interface SectionCounts {
  total: number;
  partialDeterministicDraft: number;
  methodOnly: number;
  blocked: number;
  manualReviewRequired: number;
  notImplemented: number;
}
export interface Artifact {
  fileName: string;
  mediaType: string;
  byteSize: number;
}
export interface ReportInterpretationIndexResponse {
  contractVersion: '1.0.0';
  reportId: Uuid;
  reportVersion: number;
  /**
   * @maxItems 1000
   */
  interpretations: ReportInterpretationSummary[];
}
export interface ReportInterpretationSummary {
  interpretationId: Uuid;
  interpretationNumber: number;
  interpretationContentSha256: Digest;
  completedAt: DateTime;
  storedAt: DateTime;
  sourceSemanticVersionId: Digest;
  sourcePacketId: Digest;
  providerId: string;
  modelId: string;
  promptId: string;
  promptVersion: number;
  itemCount: number;
  /**
   * @minItems 1
   * @maxItems 30
   */
  sectionIds: string[];
}
export interface ReportInterpretationDetailResponse {
  contractVersion: '1.0.0';
  reportId: Uuid;
  reportVersion: number;
  interpretation: ReportInterpretationDetail;
}
export interface ReportInterpretationDetail {
  interpretationId: Uuid;
  interpretationNumber: number;
  interpretationContentSha256: Digest;
  completedAt: DateTime;
  storedAt: DateTime;
  source: InterpretationSource;
  generation: InterpretationGeneration;
  /**
   * @minItems 1
   * @maxItems 30
   */
  items: InterpretationItem[];
  /**
   * @minItems 2
   * @maxItems 12
   */
  limitations: string[];
}
export interface InterpretationSource {
  semanticVersionId: Digest;
  packetId: Digest;
  packetSha256: Digest;
  claimsSha256: Digest;
}
export interface InterpretationGeneration {
  providerId: string;
  modelId: string;
  promptId: string;
  promptVersion: number;
  outputSchemaVersion: '1.0.0';
}
export interface InterpretationItem {
  itemId: Digest;
  sectionId: string;
  kind: 'INTERPRETATION' | 'HYPOTHESIS';
  conclusion: string;
  evidenceLogic: string;
  /**
   * @minItems 1
   * @maxItems 12
   */
  supportingClaimIds: string[];
  /**
   * @minItems 1
   * @maxItems 12
   */
  citations: Citation[];
  /**
   * @maxItems 8
   */
  assumptions: string[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  limitations: string[];
}
export interface Citation {
  claimId: string;
  sectionId: string;
  statementKind: 'LISTING_COUNT' | 'SHOP_COUNT' | 'OBSERVED_REVENUE' | 'OBSERVED_UNITS' | 'TOP_SHOP_SHARE';
  scopeKey: 'all' | 'wide' | 'core';
  value: string | number;
  unit: 'listing' | 'shop' | 'VND' | 'unit' | 'percent';
  metricPointer: string;
  scopePointer: '/input/scope';
  membershipPointer: string;
  denominatorPointer: string | null;
  coveragePointer: string | null;
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations: string[];
}
export interface ReportReviewTarget {
  contractVersion: '1.0.0';
  reviewTargetId: string;
  policyVersion: 'report-review-target-v1';
  report: {
    reportId: string;
    reportKey: string;
    versionId: string;
    version: number;
    semanticVersionId: string;
    createdAt: string;
  };
  approvalScope: {
    workspaceId: string;
    sourcePackageId: string;
    sourcePackageManifestSha256: string;
    packageContentSha256: string;
    /**
     * @minItems 2
     * @maxItems 20
     */
    selectedSources: {
      ordinal: number;
      role: 'workbook' | 'manifest' | 'labels';
      logicalPath: string;
      sha256: string;
    }[];
    marketKey: string;
    productKey: string | null;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    acquiredAt: string | null;
    geography: 'UNSPECIFIED';
    intendedUse: string;
    sourceRights: 'UNSPECIFIED';
  };
  renderedReport: {
    fileName: 'report.html';
    sha256: string;
    mediaType: 'text/html; charset=utf-8';
    byteSize: number;
  };
  calculation: {
    packetId: string;
    packetSha256: string;
    catalogSha256: string;
    resultSha256: string;
    claimsSha256: string;
    packetPolicyVersion: string;
    metricMethodVersion: string;
    metricRounding: string;
    /**
     * @minItems 1
     * @maxItems 100
     */
    sections: {
      sectionId: string;
      sectionContentSha256: string;
      deliveryState:
        'PARTIAL_DETERMINISTIC_DRAFT' | 'METHOD_ONLY' | 'BLOCKED' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
    }[];
  };
  interpretation: {
    interpretationId: string;
    reportVersionId: string;
    sourceSemanticVersionId: string;
    interpretationNumber: number;
    interpretationContentSha256: string;
    artifactSha256: string;
    completedAt: string;
    providerId: string;
    modelId: string;
    promptId: string;
    promptVersion: number;
    promptSha256: string;
    outputSchemaVersion: '1.0.0';
  };
  reviewableContent: {
    purpose: 'INTERNAL_REVIEW_ONLY';
    /**
     * @minItems 1
     * @maxItems 100
     */
    reportSectionIds: string[];
    /**
     * @minItems 1
     * @maxItems 30
     */
    interpretationSectionIds: string[];
    /**
     * @minItems 1
     * @maxItems 100
     */
    interpretationItemIds: string[];
    /**
     * @minItems 1
     * @maxItems 100
     */
    claimIds: string[];
  };
  /**
   * @minItems 4
   * @maxItems 12
   */
  limitations: string[];
}
export interface ReportApiErrorResponse {
  error: {
    code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error';
    message: string;
  };
}

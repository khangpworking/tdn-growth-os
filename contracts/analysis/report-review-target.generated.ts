/* Generated from report-review-target.schema.json. Do not edit by hand. */

export type Digest = string;

export interface ReportReviewTarget {
  contractVersion: '1.0.0';
  reviewTargetId: Digest;
  policyVersion: 'report-review-target-v1';
  report: {
    reportId: string;
    reportKey: string;
    versionId: string;
    version: number;
    semanticVersionId: Digest;
    createdAt: string;
  };
  approvalScope: {
    workspaceId: string;
    sourcePackageId: string;
    sourcePackageManifestSha256: Digest;
    packageContentSha256: Digest;
    /**
     * @minItems 2
     * @maxItems 20
     */
    selectedSources: {
      ordinal: number;
      role: 'workbook' | 'manifest' | 'labels';
      logicalPath: string;
      sha256: Digest;
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
    sha256: Digest;
    mediaType: 'text/html; charset=utf-8';
    byteSize: number;
  };
  calculation: {
    packetId: Digest;
    packetSha256: Digest;
    catalogSha256: Digest;
    resultSha256: Digest;
    claimsSha256: Digest;
    packetPolicyVersion: string;
    metricMethodVersion: string;
    metricRounding: string;
    /**
     * @minItems 1
     * @maxItems 100
     */
    sections: {
      sectionId: string;
      sectionContentSha256: Digest;
      deliveryState:
        'PARTIAL_DETERMINISTIC_DRAFT' | 'METHOD_ONLY' | 'BLOCKED' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
    }[];
  };
  interpretation: {
    interpretationId: string;
    reportVersionId: string;
    sourceSemanticVersionId: Digest;
    interpretationNumber: number;
    interpretationContentSha256: Digest;
    artifactSha256: Digest;
    completedAt: string;
    providerId: string;
    modelId: string;
    promptId: string;
    promptVersion: number;
    promptSha256: Digest;
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
    interpretationItemIds: Digest[];
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

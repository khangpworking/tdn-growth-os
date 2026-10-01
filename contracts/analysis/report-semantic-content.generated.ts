/* Generated from report-semantic-content.schema.json. Do not edit by hand. */

export type Digest = string;

export interface ReportSemanticContent {
  contractVersion: '1.0.0';
  semanticVersionId: Digest;
  policyVersion: 'report-semantic-content-v1';
  descriptiveMethodsSha256?: Digest;
  locatedInsightMethodsSha256?: Digest;
  methodPacketsSha256?: Digest;
  sourceLayer: {
    workspaceId: string;
    sourceEvidenceSha256: Digest;
    sourcePackageId: string;
    sourcePackageManifestSha256: Digest;
    packageContentSha256: Digest;
    /**
     * @minItems 2
     * @maxItems 20
     */
    selectedSourceSha256s: Digest[];
  };
  calculationLayer: {
    packetPolicyVersion: string;
    metricMethodVersion: string;
    metricRounding: string;
    normalizedInputSha256: Digest;
    metricResultContentSha256: Digest;
    catalogContentSha256: Digest;
    claimsSha256: Digest;
    chartContentSha256: Digest;
    chartSpecContentSha256: Digest;
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
  interpretationLayer: {
    state: 'NONE';
    /**
     * @maxItems 0
     */
    artifacts: unknown[];
  };
  /**
   * @minItems 2
   * @maxItems 20
   */
  limitations: string[];
}

/* Generated from prepared-report-semantic-content.schema.json. Do not edit by hand. */

export type Digest = string;

export interface PreparedReportSemanticContent {
  contractVersion: 'prepared-report-v1';
  semanticVersionId: Digest;
  policyVersion: 'prepared-report-semantic-content-v1';
  descriptiveMethodsSha256?: Digest;
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
  preparationLayer: {
    preparationSha256: Digest;
    workspaceId: string;
    sourcePackageId: string;
    sourcePackageManifestSha256: Digest;
    packageContentSha256: Digest;
    normalizedInputSha256: Digest;
    normalizedInputValueSha256: Digest;
    normalizationReceiptSha256: Digest;
  };
  readinessLayer: {
    readinessSha256: Digest;
    readinessProfile: 'metric-preparation-readiness-v1';
    catalogId: string;
    catalogVersion: string;
    catalogSha256: Digest;
    totalSections: number;
    readyToCalculate: number;
    blocked: number;
    invalid: number;
  };
  retainedSectionLayer: {
    sectionId: 'M03';
    sectionArtifactSha256: Digest;
    preparationSha256: Digest;
    metricSetSha256: Digest;
    chartBundleSha256: Digest;
    envelopeSha256: Digest;
    narrativeSha256: Digest;
    htmlSha256: Digest;
  };
  assemblyLayer: {
    assemblySha256: Digest;
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

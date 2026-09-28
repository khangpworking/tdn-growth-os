/* Generated from report-interpretation-artifact.schema.json. Do not edit by hand. */

export type Digest = string;

export interface ReportInterpretationArtifact {
  contractVersion: '1.0.0';
  interpretationId: string;
  interpretationContentSha256: Digest;
  requestSha256: Digest;
  completedAt: string;
  source: {
    semanticVersionId: Digest;
    packetId: Digest;
    packetSha256: Digest;
    claimsSha256: Digest;
  };
  generation: {
    providerId: string;
    modelId: string;
    promptId: string;
    promptVersion: number;
    promptSha256: Digest;
    outputSchemaVersion: '1.0.0';
    providerRequestId?: string;
    inputTokenCount?: number;
    outputTokenCount?: number;
    latencyMs?: number;
  };
  /**
   * @minItems 1
   * @maxItems 30
   */
  items: ResolvedItem[];
  /**
   * @minItems 2
   * @maxItems 12
   */
  limitations: string[];
}
export interface ResolvedItem {
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

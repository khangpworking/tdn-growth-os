/* Generated from versioned-report-packet.schema.json. Do not edit by hand. */

/**
 * @minItems 1
 * @maxItems 100
 */
export type Sources = {
  sha256: string;
  label: string;
  representationRole: 'primary' | 'structured' | 'derived';
  evidenceFamily: string;
  provenanceBasis: string;
}[];

export interface VersionedReportPacket {
  contractVersion: '1.0.0';
  packetId: string;
  policyVersion: 'report-packet-a3a-v1';
  rendererVersion: 'report-packet-vi-v1';
  status: 'DRAFT';
  approvalState: 'UNREVIEWED';
  sourceVerification: 'NORMALIZED_INPUT_ONLY';
  claimPolicy: 'APPLICATION_DERIVED_FACT_OBSERVATIONS_ONLY';
  catalogSha256: string;
  metricResultSha256: string;
  inputSha256: string;
  metricMethodVersion: 'metric-scope-v1';
  metricRounding: 'percent-half-even-2-v1';
  metricRendererVersion: 'metric-draft-vi-v1';
  catalog: ReportSectionCatalog;
  scope: Scope;
  declaredSources: Sources;
  /**
   * @maxItems 100
   */
  sections: SectionPacket[];
  /**
   * @maxItems 100
   */
  claims: FactObservation[];
}
export interface ReportSectionCatalog {
  contractVersion: '1.0.0';
  catalogId: string;
  catalogVersion: string;
  authority: 'PLANNING_METADATA_NOT_EXECUTABLE_METHOD';
  /**
   * @minItems 1
   * @maxItems 100
   */
  sections: SectionDefinition[];
}
export interface SectionDefinition {
  sectionId: string;
  title: string;
  methodId: string;
  methodVersion: string;
  historicalTemplateMaturity: 'PILOT' | 'SYNTHESIS' | 'METHOD' | 'SCENARIO';
  /**
   * @minItems 1
   * @maxItems 10
   */
  moduleIds: string[];
  /**
   * @maxItems 20
   */
  requiredInputs: string[];
  reopenCondition: string;
  fallbackState: 'BLOCKED' | 'METHOD_ONLY' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
  /**
   * @minItems 1
   * @maxItems 20
   */
  fallbackReasons: string[];
}
export interface Scope {
  key: string;
  platform: 'shopee' | 'tiktok';
  selection: 'ON' | 'OFF' | 'UNSPECIFIED';
  start: string;
  end: string;
  periodBasis: string;
  /**
   * Declared acquisition time, or explicit null when unconfirmed. Never inferred from the reporting period or filesystem timestamp.
   */
  acquiredAt: string | null;
}
export interface SectionPacket {
  sectionId: string;
  deliveryState:
    'PARTIAL_DETERMINISTIC_DRAFT' | 'METHOD_ONLY' | 'BLOCKED' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
  /**
   * @maxItems 100
   */
  claimIds: string[];
  /**
   * @maxItems 10
   */
  contextPointers: string[];
  /**
   * @maxItems 50
   */
  blockers: string[];
  sectionSha256: string;
  methodArtifact?: {
    fileName: 'm02-scope-method.json' | 'm13-provenance-appendix.json';
    sha256: string;
    methodOutputId: string;
  };
}
export interface FactObservation {
  claimId: string;
  sectionId: string;
  claimType: 'FACT';
  evidenceState: 'DETERMINISTIC_NORMALIZED_OBSERVATION';
  approvalState: 'UNREVIEWED';
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

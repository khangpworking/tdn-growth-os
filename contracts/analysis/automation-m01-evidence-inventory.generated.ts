/* Generated from automation-m01-evidence-inventory.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;
export type Text = string;
export type NullableText = Text | null;
export type Decimal = string;

export interface AutomationM01EvidenceInventory {
  contractVersion: '1.0.0';
  methodId: 'automation-m01-evidence-inventory';
  methodVersion: '1.0.0' | '1.1.0';
  sectionId: 'M01';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  sourceClaims: {
    methodId: 'automation-source-claims';
    methodVersion: '1.0.0';
    claimsSha256: Digest;
  };
  ownerQuestion: {
    state: 'UNSET';
    text: null;
  };
  ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED';
  status: 'UNRANKED_INVENTORY' | 'INSUFFICIENT_EVIDENCE';
  insufficientEvidence: 'NO_ELIGIBLE_UPSTREAM_CLAIMS' | null;
  conclusion: null;
  /**
   * @maxItems 20000
   */
  items: InventoryItem[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: [Text, ...Text[]];
}
export interface InventoryItem {
  claimId: Digest;
  sectionId: 'M05' | 'I02' | 'I04';
  basis: 'SOURCE_OBSERVED' | 'DECLARED';
  evidenceKind: 'SOURCE_OBSERVATION' | 'SELF_REPORTED_DECLARATION';
  state: 'observed_zero' | 'observed_value' | 'DECLARED';
  method: Method;
  source: SourceLocator;
  measure: {
    literal: Text;
    definition: Text;
    entityLabel: NullableText;
  } | null;
  value: Decimal | null;
  unit: NullableText;
  precision: 'exact' | 'non_exact' | 'not_applicable';
  period: Period | null;
  periodText: NullableText;
  scope: Scope;
  coverage: Coverage;
  declaration: Declaration | null;
  /**
   * @minItems 1
   * @maxItems 30
   */
  observationLimitations: [Text, ...Text[]];
  /**
   * @minItems 1
   * @maxItems 30
   */
  claimLimitations: [Text, ...Text[]];
}
export interface Method {
  methodId: Text;
  methodVersion: Text;
  methodOutputId: Digest;
  artifact: Package;
  outputPointer: string;
}
export interface Package {
  packageId: Uuid;
  version: number;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
}
export interface SourceLocator {
  package: Package;
  logicalPath: Text;
  sha256: Digest;
  locator: string;
  recordLocator: string | null;
  attribution: NullableText;
}
export interface Period {
  start: string;
  end: string;
  timezone: Text;
  basis: Text;
}
export interface Scope {
  scopeSha256: Digest;
  universe: NullableText;
  geography: NullableText;
  frame: NullableText;
  inclusionRule: NullableText;
  exclusionRule: NullableText;
  variantRule: NullableText;
  description: Text;
}
export interface Coverage {
  unit: 'SOURCE_OBSERVATIONS' | 'LOCATED_RECORDS';
  observedCount: number;
  zeroCount: number;
  missingCount: number;
  unknownCount: number;
  nonExactCount: number;
  description: Text;
}
export interface Declaration {
  sourceAttribution: Text;
  annotationAttribution: NullableText;
  provenance: {
    basis: 'DECLARED';
    coderRole: Text;
    adjudication: NullableText;
    disagreement: NullableText;
  };
}

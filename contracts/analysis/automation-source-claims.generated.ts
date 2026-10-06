/* Generated from automation-source-claims.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;
export type Text = string;
export type NullableText = Text | null;
export type Decimal = string;

export interface AutomationSourceClaims {
  contractVersion: '1.0.0';
  methodId: 'automation-source-claims';
  methodVersion: '1.0.0';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  claimsSha256: Digest;
  /**
   * @maxItems 20000
   */
  claims: Claim[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: [Text, ...Text[]];
}
export interface Claim {
  claimId: Digest;
  sectionId: 'M05' | 'I02' | 'I04';
  method: Method;
  source: SourceFile;
  observation: Observation;
  declaration: Declaration | null;
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: [Text, ...Text[]];
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
export interface SourceFile {
  package: Package;
  logicalPath: Text;
  sha256: Digest;
  locator: string;
  recordLocator: string | null;
  statement: NullableText;
  attribution: NullableText;
  /**
   * @maxItems 100
   */
  spans: Span[];
}
export interface Span {
  role: 'RECORD' | 'DECLARATION' | 'QUALIFIER' | 'COUNTEREVIDENCE' | 'CONTEXT';
  start: number;
  end: number;
  quote: string;
}
export interface Observation {
  basis: 'SOURCE_OBSERVED' | 'DECLARED';
  state: 'observed_zero' | 'observed_value' | 'DECLARED';
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
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: [Text, ...Text[]];
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

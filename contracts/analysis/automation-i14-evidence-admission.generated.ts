/* Generated from automation-i14-evidence-admission.schema.json. Do not edit by hand. */

export type AutomationI14EvidenceAdmission = {
  [k: string]: unknown;
} & {
  contractVersion: '1.0.0';
  methodId: 'automation-i14-evidence-admission';
  methodVersion: '1.0.0' | '1.1.0';
  sectionId: 'I14';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  sourceClaims: {
    methodId: 'automation-source-claims';
    methodVersion: '1.0.0';
    claimsSha256: Digest;
  };
  locatedMethodOutputId: Digest | null;
  ownerQuestion: {
    state: 'UNSET';
    text: null;
  };
  admissionRule:
    'I02_SOURCE_STATED_SITUATION_TASK_OR_SETTING_WITHOUT_QUALIFIERS_V1' | 'I02_VERIFIED_LITERAL_MATCHER_DUPLICATES_V2';
  literalProjection?: null | {
    policySha256: 'ba676c8e9e89f7ba0f05ec6157b82414524f6af48697900afe61ac7e0dc64f42';
    projectionId: Digest;
    projectionSha256: Digest;
    methodArtifact: Package;
    methodOutputId: Digest;
  };
  status: 'USE_CONTEXT_ADMITTED' | 'INSUFFICIENT_EVIDENCE';
  insufficientEvidence: 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT' | null;
  /**
   * @maxItems 20000
   */
  anchors: Anchor[];
  /**
   * @maxItems 20000
   */
  unassigned: UnassignedClaim[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: Text[];
};
export type Uuid = string;
export type Digest = string;
export type Text = string;
export type NullableText = Text | null;

export interface Package {
  packageId: Uuid;
  version: number;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
}
export interface Anchor {
  claimId: Digest;
  method: Method;
  source: SourceLocator;
  /**
   * @minItems 1
   * @maxItems 5
   */
  contextFields: ContextField[];
  /**
   * @maxItems 100
   */
  counterevidenceSpans: Span[];
  declaration: Declaration;
}
export interface Method {
  methodId: Text;
  methodVersion: Text;
  methodOutputId: Digest;
  artifact: Package;
  outputPointer: string;
}
export interface SourceLocator {
  package: Package;
  logicalPath: Text;
  sha256: Digest;
  locator: string;
  recordLocator: string | null;
  attribution: NullableText;
}
export interface ContextField {
  field: 'role' | 'situation' | 'task' | 'setting' | 'time';
  span: Span;
}
export interface Span {
  start: number;
  end: number;
  quote: string;
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
export interface UnassignedClaim {
  claimId: Digest;
  sectionId: 'M05' | 'I02' | 'I04';
  reason:
    | 'NOT_A_LOCATED_DECLARATION'
    | 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT'
    | 'NO_SOURCE_STATED_USE_CONTEXT_FIELD'
    | 'CONTEXT_FIELD_CONFLICTING'
    | 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED';
}

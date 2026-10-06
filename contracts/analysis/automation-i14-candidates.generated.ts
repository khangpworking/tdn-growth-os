/* Generated from automation-i14-candidates.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;
export type Text = string;
/**
 * Untrusted layer-3 draft text. It must contain a non-space character and no Unicode number character; numeric facts stay application-owned claim bindings.
 */
export type AiText = string;

export interface AutomationI14Candidates {
  contractVersion: '1.0.0';
  methodId: 'automation-i14-candidates';
  methodVersion: '1.0.0';
  sectionId: 'I14';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  admission: {
    methodId: 'automation-i14-evidence-admission';
    methodVersion: '1.0.0' | '1.1.0';
    admissionSha256: Digest;
  };
  ownerQuestion: {
    state: 'UNSET';
    text: null;
  };
  /**
   * Owner-authored direction labels. Always empty in this version; AI candidates never populate it.
   *
   * @maxItems 0
   */
  ownerDirections: Text[];
  /**
   * @maxItems 20
   */
  aiCandidates: Candidate[];
  validation: {
    structural: 'SCHEMA_AND_REFERENCES_PASSED';
    semantic: 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED';
  };
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: Text[];
}
export interface Candidate {
  candidateType: 'HYPOTHESIS' | 'OPPORTUNITY_DIRECTION';
  candidateStatus: 'HUMAN_REVIEW_REQUIRED';
  layer: 3;
  text: AiText;
  conciseEvidenceLinkedRationale: AiText;
  /**
   * @minItems 1
   * @maxItems 20
   */
  citedClaimRefs: Digest[];
  /**
   * Empty means none was supplied, not that no counterevidence exists.
   *
   * @maxItems 20
   */
  counterevidenceRefs: Digest[];
  /**
   * @minItems 1
   * @maxItems 10
   */
  assumptions: AiText[];
  /**
   * @maxItems 10
   */
  unknowns: AiText[];
  /**
   * @maxItems 10
   */
  evidenceGaps: AiText[];
  /**
   * @minItems 1
   * @maxItems 10
   */
  limitations: AiText[];
}

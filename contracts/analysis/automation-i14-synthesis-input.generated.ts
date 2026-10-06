/* Generated from automation-i14-synthesis-input.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;
export type Text = string;
export type Quote = string;

export interface AutomationI14SynthesisInput {
  contractVersion: '1.0.0';
  methodId: 'automation-i14-synthesis-input';
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
   * Owner-authored constraints. Always empty in this version; the model cannot complete them.
   *
   * @maxItems 0
   */
  ownerConstraints: [];
  /**
   * Admitted I14 anchors in admission order, which is not a priority. Only these claim ids may be cited as support.
   *
   * @minItems 1
   * @maxItems 20000
   */
  supportEligible: [SupportClaim, ...SupportClaim[]];
  /**
   * Unassigned I02/I04 claims in admission order. They may be cited only as counterevidence.
   *
   * @maxItems 20000
   */
  counterevidenceOnly: CounterevidenceClaim[];
  outputContract: {
    methodId: 'automation-i14-candidates';
    methodVersion: '1.0.0';
  };
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: [Text, ...Text[]];
}
export interface SupportClaim {
  claimId: Digest;
  sourceAttribution: Text;
  /**
   * @minItems 1
   * @maxItems 5
   */
  contextFields:
    | [
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
      ]
    | [
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
      ]
    | [
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
      ]
    | [
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
      ]
    | [
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
        {
          field: 'role' | 'situation' | 'task' | 'setting' | 'time';
          quote: Quote;
        },
      ];
  /**
   * If the claim is cited as support, these quotes must be acknowledged in the rationale or limitations and the claim id must not be duplicated in counterevidenceRefs. Empty means none encoded, not that none exists.
   *
   * @maxItems 100
   */
  counterevidenceQuotes: Quote[];
}
export interface CounterevidenceClaim {
  claimId: Digest;
  sectionId: 'I02' | 'I04';
  reason:
    | 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT'
    | 'NO_SOURCE_STATED_USE_CONTEXT_FIELD'
    | 'CONTEXT_FIELD_CONFLICTING'
    | 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED';
  sourceAttribution: Text;
  /**
   * @maxItems 100
   */
  quotes: {
    role: 'RECORD' | 'DECLARATION' | 'QUALIFIER' | 'COUNTEREVIDENCE' | 'CONTEXT';
    quote: Quote;
  }[];
}

/* Generated from research-automation-insight-coding-api.schema.json. Do not edit by hand. */

/**
 * OWNER HTTP boundary for exact-source Insight coding. Requests reuse the closed domain contracts; the server supplies the trusted OWNER actor. Views are verified pair history, never an implicit latest selection or report admission.
 */
export type ResearchAutomationInsightCodingApi =
  | InsightCodingAdoptRequest
  | InsightCodingProposeRequest
  | InsightLiteralProposeRequest
  | InsightCodingAcceptRequest
  | ResearchInsightCodingMutation
  | ResearchInsightCodingView;
/**
 * @maxItems 10000
 */
export type Assignments = {
  recordIndex: number;
  code: string;
  span: Span;
  provenance: Provenance;
}[];
/**
 * @maxItems 10000
 */
export type Dispositions = {
  recordIndex: number;
  state: 'CODED' | 'UNCODED' | 'UNCLEAR' | 'PENDING';
  provenance: Provenance;
}[];
/**
 * @maxItems 10000
 */
export type I02 = Context[];
/**
 * @maxItems 10000
 */
export type I04 = Behavior[];
/**
 * @maxItems 10000
 */
export type I05 = Attitude[];
/**
 * @maxItems 10000
 */
export type I07 = Reason[];
/**
 * @maxItems 10000
 */
export type I08 = Barrier[];
/**
 * @maxItems 10000
 */
export type I06 = Journey[];
/**
 * @maxItems 10000
 */
export type I09 = Gap[];
/**
 * @maxItems 10000
 */
export type I13Mentions = {
  recordIndex: number;
  span: Span;
  provenance: Provenance;
}[];
/**
 * @maxItems 10000
 */
export type Indexes = number[];
export type Kind = 'ADOPTION' | 'PROPOSAL' | 'RECEIPT';

export interface InsightCodingAdoptRequest {
  contractVersion: 'insight-coding-adopt-v1';
  requestKey: string;
  binding: InsightSourceBinding;
  rules: InsightCodingRules;
}
export interface InsightSourceBinding {
  workspaceId: string;
  runId: string;
  pairId: string;
  scopeSha256: string;
  reportSha256: string;
  sourceKind: 'NATIVE' | 'EXACT_SHOPEE';
  sourcePackageSha256: string;
  inputSha256: string;
}
export interface InsightCodingRules {
  ruleId: string;
  revision: number;
  question: string;
  inclusionRule: string;
  adjudicationRule: string;
  /**
   * @maxItems 100
   */
  corpora: (Corpus & {
    /**
     * @maxItems 0
     */
    assignments?: [];
    /**
     * @maxItems 0
     */
    dispositions?: [];
    [k: string]: unknown;
  })[];
}
export interface Corpus {
  sectionId: 'I10' | 'I13';
  /**
   * @maxItems 10000
   */
  recordIndexes: number[];
  question: string;
  unit: string;
  period: string | null;
  frame: string | null;
  channel: string | null;
  inclusionRule: string;
  membershipComplete: boolean;
  multiCode: boolean;
  externalSampling: string;
  codebook: {
    revision: string;
    /**
     * @maxItems 10000
     */
    codes: {
      code: string;
      label: string;
      phrase: string;
      firstRecordIndex: number | null;
      firstSpan: Span | null;
    }[];
  };
  assignments: Assignments;
  dispositions: Dispositions;
}
/**
 * Half-open UTF-16 offsets in the exact record text, with no Unicode or whitespace normalization.
 */
export interface Span {
  start: number;
  end: number;
  quote: string;
}
/**
 * Declared annotation provenance, never authenticated application approval. Pointer resolution proves text location only, not semantic truth or human authority. AI suggestions remain pending.
 */
export interface Provenance {
  basis: 'DECLARED' | 'HUMAN_REVIEWED' | 'PENDING_AI';
  coderRole: string;
  adjudication: string | null;
  disagreement: string | null;
}
export interface InsightCodingProposeRequest {
  contractVersion: 'insight-coding-propose-v1';
  requestKey: string;
  adoptionId: string;
  previousProposalId: string | null;
  annotations: InsightProposedAnnotations;
}
export interface InsightProposedAnnotations {
  i02?: I02;
  i04?: I04;
  i05?: I05;
  i07?: I07;
  i08?: I08;
  i06: I06;
  i09: I09;
  i13Mentions: I13Mentions;
  /**
   * @maxItems 100
   */
  corpora: InsightProposedCorpusCoding[];
}
export interface Context {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  role: Field;
  situation: Field;
  task: Field;
  setting: Field;
  time: Field;
}
export interface Field {
  state: 'SOURCE_STATED' | 'NOT_STATED' | 'UNKNOWN' | 'CONFLICTING' | 'UNLOCATED';
  span: Span | null;
}
export interface Behavior {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  span: Span;
  eventKind:
    'ATTEMPT_REPORTED' | 'ACTION_REPORTED' | 'COMPLETION_REPORTED' | 'NO_ACTION_EXPLICIT' | 'NOT_REPORTED' | 'UNKNOWN';
  attribution: 'SOURCE_LOGGED' | 'SELF_REPORTED' | 'OTHER_REPORTED' | 'UNKNOWN';
}
export interface Attitude {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  span: Span;
  polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'UNCLEAR' | 'NOT_STATED';
  target: Field;
  speakerAttribution: Field;
}
export interface Reason {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  choiceText: Span;
  reasonClause: Span;
  relation: Relation;
  reasonFacet:
    | 'PRICE_COST'
    | 'ACCESS_AVAILABILITY'
    | 'FIT_NEED'
    | 'PRODUCT_ATTRIBUTE'
    | 'INFORMATION_TRUST'
    | 'OTHER_EXPLICIT'
    | 'UNCLEAR';
  reasonPolarity: 'AFFIRMED' | 'NEGATED' | 'CONDITIONAL' | 'UNCLEAR';
  speakerBasis: 'SELF_STATED' | 'OTHER_REPORTED' | 'SOURCE_ATTRIBUTED' | 'UNKNOWN';
  resultState: Field;
}
export interface Relation {
  context: Span;
  link: Span;
}
export interface Barrier {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  attemptedTask: Span;
  obstacleClause: Span;
  relation: Relation;
  barrierFacet:
    | 'PRICE_COST'
    | 'ACCESS_AVAILABILITY'
    | 'FIT_NEED'
    | 'PRODUCT_ATTRIBUTE'
    | 'INFORMATION_TRUST'
    | 'OTHER_EXPLICIT'
    | 'UNCLEAR';
  resolutionState: Field;
}
export interface Journey {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  firstEvent: Span;
  secondEvent: Span;
  relation: Relation | null;
}
export interface Gap {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  desiredState: Span | null;
  currentState: Span | null;
  relation: Relation | null;
  workaround: Field;
}
export interface InsightProposedCorpusCoding {
  corpusIndex: number;
  assignments: Assignments;
  dispositions: Dispositions;
}
/**
 * Generate only literal phrase candidates under an exact adopted codebook. No semantic inference, acceptance, provider call or implicit predecessor selection.
 */
export interface InsightLiteralProposeRequest {
  contractVersion: 'insight-coding-literal-propose-v1';
  requestKey: string;
  adoptionId: string;
  previousProposalId: string | null;
}
export interface InsightCodingAcceptRequest {
  contractVersion: 'insight-coding-accept-v1';
  requestKey: string;
  proposalId: string;
  proposalSha256: string;
  selection: AutomationInsightSelection;
}
/**
 * Exact indexes within one immutable located Insight proposal. Selection is not authenticated acceptance; the owning receipt must bind the proposal and adoption separately.
 */
export interface AutomationInsightSelection {
  contractVersion: 'automation-insight-selection-v1' | 'automation-insight-selection-v2';
  i02?: Indexes;
  i04?: Indexes;
  i05?: Indexes;
  i07?: Indexes;
  i08?: Indexes;
  i06: Indexes;
  i09: Indexes;
  i13Mentions: Indexes;
  /**
   * @maxItems 100
   */
  corpora: InsightCorpusSelection[];
}
export interface InsightCorpusSelection {
  corpusIndex: number;
  assignments: Indexes;
  dispositions: Indexes;
}
export interface ResearchInsightCodingMutation {
  contractVersion: 'insight-coding-mutation-v1';
  kind: Kind;
  evidenceId: string;
  exactRetry: boolean;
}
/**
 * Exact source context and the full bounded coding history of one explicit report pair. An over-limit history is rejected, never truncated.
 */
export interface ResearchInsightCodingView {
  contractVersion: 'insight-coding-view-v1';
  context: ResearchInsightSourceContext;
  /**
   * @maxItems 1000
   */
  evidence: ResearchInsightCodingEvidenceView[];
}
export interface ResearchInsightSourceContext {
  binding: InsightSourceBinding;
  input: Input;
}
export interface Input {
  contractVersion: '1.0.0';
  codebookId: 'located-evidence-v1-draft';
  profileSha256: '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded';
  adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
  question: string | null;
  inclusionRule: string;
  codingUnit: 'LOCATED_RECORD';
  adjudicationRule: string;
  /**
   * @maxItems 10000
   */
  sources: {
    logicalPath: string;
    sha256: string;
  }[];
  /**
   * @maxItems 10000
   */
  records: Record[];
  brief: Brief | null;
  i02: I02;
  i04: I04;
  i05: I05;
  i06: I06;
  i07: I07;
  i08: I08;
  i09: I09;
  /**
   * @maxItems 10000
   */
  corpora: Corpus[];
  i13Mentions: I13Mentions;
}
export interface Record {
  sourceSha256: string;
  locator: string;
  text: string | null;
  sourceAttribution: string;
  timeText: string | null;
  disposition: 'INCLUDED' | 'EXCLUDED' | 'UNREADABLE';
  dispositionReason: string | null;
}
export interface Brief {
  version: string;
  questionText: OwnerField;
  decisionToInform: OwnerField;
  intendedAudience: OwnerField;
  scope: OwnerField;
  knownConstraints: OwnerField;
  /**
   * @maxItems 10000
   */
  selectedSectionIds: string[];
}
export interface OwnerField {
  state: 'SUPPLIED' | 'UNSET';
  text: string | null;
}
/**
 * Verified immutable evidence without actor identity. sha256 is the digest of the full verified artifact and is the exact proposalSha256 an acceptance must name.
 */
export interface ResearchInsightCodingEvidenceView {
  evidenceId: string;
  kind: Kind;
  sequence: number;
  binding: InsightSourceBinding;
  request: InsightCodingAdoptRequest | InsightCodingProposeRequest | InsightCodingAcceptRequest;
  createdAt: string;
  sha256: string;
}

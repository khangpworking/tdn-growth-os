/* Generated from automation-insight-coding.schema.json. Do not edit by hand. */

export type AutomationInsightCoding =
  | InsightCodingAdoptRequest
  | InsightCodingProposeRequest
  | InsightCodingAcceptRequest
  | InsightCodingEvidence
  | InsightDefaultRuleRequest
  | InsightDefaultCodingProposeRequest
  | InsightDefaultCodingEvidence;
export type Uuid = string;
export type Digest = string;
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

export interface InsightCodingAdoptRequest {
  contractVersion: 'insight-coding-adopt-v1';
  requestKey: Uuid;
  binding: InsightSourceBinding;
  rules: InsightCodingRules;
}
export interface InsightSourceBinding {
  workspaceId: Uuid;
  runId: Uuid;
  pairId: Digest;
  scopeSha256: Digest;
  reportSha256: Digest;
  sourceKind: 'NATIVE' | 'EXACT_SHOPEE';
  sourcePackageSha256: Digest;
  inputSha256: Digest;
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
  requestKey: Uuid;
  adoptionId: Uuid;
  previousProposalId: Uuid | null;
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
export interface InsightCodingAcceptRequest {
  contractVersion: 'insight-coding-accept-v1';
  requestKey: Uuid;
  proposalId: Uuid;
  proposalSha256: Digest;
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
export interface InsightCodingEvidence {
  contractVersion: 'insight-coding-evidence-v1';
  evidenceId: Uuid;
  sequence: number;
  binding: InsightSourceBinding;
  request: InsightCodingAdoptRequest | InsightCodingProposeRequest | InsightCodingAcceptRequest;
  parentSha256: Digest | null;
  actorId: string;
  actorRole: 'OWNER';
  createdAt: string;
}
export interface InsightDefaultRuleRequest {
  contractVersion: 'insight-coding-default-rule-v1';
  kind: 'DEFAULT_RULE';
  status: 'PROPOSED';
  requestKey: Uuid;
  originatingRequestKey: Uuid;
  binding: InsightSourceBinding;
  policyVersion: 'source-default-coding-v1';
  rules: InsightCodingRules;
}
export interface InsightDefaultCodingProposeRequest {
  contractVersion: 'insight-coding-default-propose-v1';
  status: 'PROPOSED';
  requestKey: Uuid;
  defaultRuleId: Uuid;
  defaultRuleSha256: Digest;
  previousProposalId: Uuid | null;
  previousProposalSha256: Digest | null;
  executionId: Uuid;
  /**
   * @minItems 1
   * @maxItems 100
   */
  recordIndexes: [number, ...number[]];
  rules: InsightCodingRules;
  codebookSha256: Digest;
  annotations: InsightProposedAnnotations;
}
export interface InsightDefaultCodingEvidence {
  contractVersion: 'insight-coding-default-evidence-v1';
  evidenceId: Uuid;
  sequence: number;
  binding: InsightSourceBinding;
  request: InsightDefaultRuleRequest | InsightDefaultCodingProposeRequest;
  parentSha256: Digest | null;
  actorId: string;
  actorRole: 'OWNER';
  createdAt: string;
}

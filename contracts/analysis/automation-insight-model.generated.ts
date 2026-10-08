/* Generated from automation-insight-model.schema.json. Do not edit by hand. */

export type AutomationInsightModel =
  | InsightModelRequest
  | InsightModelSource
  | InsightModelInput
  | InsightModelPrompt
  | InsightModelConfiguration
  | InsightDefaultModelRequest
  | InsightDefaultModelSource
  | InsightDefaultModelCandidates
  | InsightDefaultModelPrompt;
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
export type I06 = Journey[];
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
export type I09 = Gap[];
/**
 * @maxItems 10000
 */
export type Codes = {
  code: string;
  label: string;
  phrase: string;
  firstRecordIndex: number | null;
  firstSpan: Span | null;
}[];
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
export type I13Mentions = {
  recordIndex: number;
  span: Span;
  provenance: Provenance;
}[];
/**
 * Draft-eligibility semantics. Absent keeps the historical accepted-only output byte-identical.
 */
export type DraftCountsVersion = 'draft-counts-v1' | 'draft-counts-v2';
export type InsightDefaultModelRequest = {
  contractVersion: 'insight-default-model-request-v1';
  requestKey: string;
  binding: InsightSourceBinding;
  defaultRuleId: string | null;
  defaultRuleSha256: string | null;
  previousProposalId: string | null;
  previousProposalSha256: string | null;
  /**
   * @minItems 1
   * @maxItems 100
   */
  recordIndexes: number[];
} & {
  [k: string]: unknown;
};

export interface InsightModelRequest {
  contractVersion: 'insight-model-request-v1';
  requestKey: string;
  adoptionId: string;
  previousProposalId: string | null;
  /**
   * @minItems 1
   * @maxItems 100
   */
  recordIndexes: number[];
}
export interface InsightModelSource {
  contractVersion: 'insight-model-source-v1';
  request: InsightModelRequest;
  binding: InsightSourceBinding;
  adoptionSha256: string;
  actorId: string;
  input: Input;
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
  semanticsVersion?: '1.0.0' | '1.1.0';
  draftCountsVersion?: DraftCountsVersion;
  workingQuestionProposal?: string | null;
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
/**
 * Declared annotation provenance, never authenticated application approval. Pointer resolution proves text location only, not semantic truth or human authority. AI suggestions remain pending.
 */
export interface Provenance {
  basis: 'DECLARED' | 'HUMAN_REVIEWED' | 'PENDING_AI';
  coderRole: string;
  adjudication: string | null;
  disagreement: string | null;
}
/**
 * Half-open UTF-16 offsets in the exact record text, with no Unicode or whitespace normalization.
 */
export interface Span {
  start: number;
  end: number;
  quote: string;
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
export interface Relation {
  context: Span;
  link: Span;
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
    codes: Codes;
  };
  assignments: Assignments;
  dispositions: Dispositions;
}
export interface InsightModelInput {
  contractVersion: 'insight-model-input-v1';
  question: string | null;
  inclusionRule: string;
  adjudicationRule: string;
  /**
   * @maxItems 100
   */
  records: {
    recordIndex: number;
    record: Record;
  }[];
  /**
   * @maxItems 100
   */
  corpora: {
    corpusIndex: number;
    sectionId: 'I10' | 'I13';
    recordIndexes: number[];
    multiCode: boolean;
    codes: {
      code: string;
      label: string;
      phrase: string;
    }[];
  }[];
}
export interface InsightModelPrompt {
  contractVersion:
    'insight-model-prompt-v1' | 'insight-model-prompt-v2' | 'insight-model-prompt-v3' | 'insight-model-prompt-v4';
  systemText: string;
}
export interface InsightModelConfiguration {
  contractVersion: 'insight-model-configuration-v1';
  providerId: string;
  modelId: string;
  temperature: number | null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface InsightDefaultModelSource {
  contractVersion: 'insight-default-model-source-v1';
  request: InsightDefaultModelRequest;
  binding: InsightSourceBinding;
  defaultRuleId: string;
  defaultRuleSha256: string;
  codebookSha256: string;
  actorId: string;
  input: Input;
}
export interface InsightDefaultModelCandidates {
  /**
   * @maxItems 100
   */
  codebooks: InsightDefaultCodebookAddition[];
  annotations: InsightProposedAnnotations;
}
export interface InsightDefaultCodebookAddition {
  corpusIndex: number;
  codes: Codes;
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
export interface InsightProposedCorpusCoding {
  corpusIndex: number;
  assignments: Assignments;
  dispositions: Dispositions;
}
export interface InsightDefaultModelPrompt {
  contractVersion: 'insight-model-prompt-v5';
  systemText: string;
}

/* Generated from automation-insight-crosscheck.schema.json. Do not edit by hand. */

export type AutomationInsightCrosscheckContract =
  | InsightCrosscheckRequest
  | InsightCrosscheckSource
  | InsightCrosscheckBlindedInput
  | InsightCrosscheckPrompt
  | InsightCrosscheckCandidates
  | InsightCrosscheckSnapshot
  | InsightCrosscheckSelection;
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

export interface InsightCrosscheckRequest {
  contractVersion: 'insight-crosscheck-request-v1';
  requestKey: string;
  binding: InsightSourceBinding;
  firstProposalId: string;
  firstProposalSha256: string;
  codebookSha256: string;
  seed: string;
  secondConfigurationSha256: string;
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
export interface InsightCrosscheckSource {
  contractVersion: 'insight-crosscheck-source-v1';
  request: InsightCrosscheckRequest;
  binding: InsightSourceBinding;
  actorId: string;
  defaultRuleId: string;
  defaultRuleSha256: string;
  input: Input;
  plan: InsightCrosscheckPlan;
  batchIndex: number;
  previousSecondAnnotations: InsightProposedAnnotations;
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
export interface InsightCrosscheckPlan {
  sampleVersion: 'sha256-ranked-source-records-v1';
  seed: string;
  /**
   * @minItems 0
   * @maxItems 10000
   */
  eligible: InsightCrosscheckSourceRecord[];
  eligibleSha256: string;
  /**
   * @minItems 0
   * @maxItems 200
   */
  sample: InsightCrosscheckSourceRecord[];
  sampleSha256: string;
  /**
   * @minItems 0
   * @maxItems 2
   */
  batches: number[][];
  /**
   * @minItems 1
   * @maxItems 1000
   */
  firstExecutions: InsightCrosscheckFirstExecution[];
  secondConfiguration: InsightModelConfiguration;
  secondConfigurationSha256: string;
}
export interface InsightCrosscheckSourceRecord {
  recordIndex: number;
  sourceSha256: string;
  locator: string;
}
export interface InsightCrosscheckFirstExecution {
  executionId: string;
  proposalId: string;
  proposalSha256: string;
  admissionSha256: string;
  inputSha256: string;
  promptSha256: string;
  configurationSha256: string;
  configuration: InsightModelConfiguration;
  candidatesSha256: string;
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
export interface InsightCrosscheckBlindedInput {
  projectionVersion: 'insight-crosscheck-blinded-v1';
  codebookSha256: string;
  question: string | null;
  inclusionRule: string | null;
  adjudicationRule: string | null;
  /**
   * @minItems 1
   * @maxItems 100
   */
  records: InsightCrosscheckBlindedRecord[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  corpora: InsightCrosscheckBlindedCorpus[];
}
export interface InsightCrosscheckBlindedRecord {
  recordIndex: number;
  sourceSha256: string;
  locator: string;
  text: string;
}
export interface InsightCrosscheckBlindedCorpus {
  corpusIndex: number;
  sectionId: 'I10' | 'I13';
  /**
   * @minItems 0
   * @maxItems 10000
   */
  recordIndexes: number[];
  multiCode: boolean;
  /**
   * @minItems 0
   * @maxItems 10000
   */
  codes: InsightCrosscheckCodeMeaning[];
}
export interface InsightCrosscheckCodeMeaning {
  code: string;
  label: string;
  phrase: string;
}
export interface InsightCrosscheckPrompt {
  contractVersion: 'insight-crosscheck-prompt-v1';
  systemText: string;
}
export interface InsightCrosscheckCandidates {
  contractVersion: 'insight-crosscheck-candidates-v1';
  completionText: string;
  batchAnnotations: InsightProposedAnnotations;
  annotations: InsightProposedAnnotations;
}
export interface InsightCrosscheckSnapshot {
  contractVersion: 'insight-crosscheck-snapshot-v1';
  request: InsightCrosscheckRequest;
  actorId: string;
  defaultRuleId: string;
  defaultRuleSha256: string;
  plan: InsightCrosscheckPlan;
  /**
   * @minItems 1
   * @maxItems 2
   */
  secondExecutions: InsightCrosscheckExecutionReference[];
  secondAnnotations: InsightProposedAnnotations;
  /**
   * @minItems 0
   * @maxItems 200
   */
  literalRows: InsightCrosscheckLiteralRow[];
  firstWireCompletion: 'NOT_RETAINED_BY_ORIGINAL_EXECUTION';
  releaseState: 'U11_STATISTIC_UNAVAILABLE';
}
export interface InsightCrosscheckExecutionReference {
  executionId: string;
  admissionSha256: string;
  inputSha256: string;
  promptSha256: string;
  configurationSha256: string;
  candidatesSha256: string;
}
export interface InsightCrosscheckLiteralRow {
  recordIndex: number;
  sourceSha256: string;
  locator: string;
  text: string;
  first: InsightProposedAnnotations;
  second: InsightProposedAnnotations;
  /**
   * @minItems 0
   * @maxItems 9
   */
  literalDifferences: ('i02' | 'i04' | 'i05' | 'i06' | 'i07' | 'i08' | 'i09' | 'i13Mentions' | 'corpora')[];
}
export interface InsightCrosscheckSelection {
  contractVersion: 'insight-crosscheck-select-v1';
  requestKey: string;
  snapshotSha256: string;
  firstProposalId: string;
  firstProposalSha256: string;
}

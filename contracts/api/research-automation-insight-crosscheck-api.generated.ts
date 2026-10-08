/* Generated from research-automation-insight-crosscheck-api.schema.json. Do not edit by hand. */

export type ResearchAutomationInsightCrosscheckApiContract =
  InsightCrosscheckRequest | ResearchInsightCrosscheckAvailability | ResearchInsightCrosscheckResponse;
export type ResearchInsightCrosscheckResponse =
  | ResearchInsightCrosscheckValid
  | ResearchInsightCrosscheckNotDispatched
  | ResearchInsightCrosscheckPending
  | ResearchInsightCrosscheckInvalid
  | ResearchInsightCrosscheckUnknown;
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
export interface ResearchInsightCrosscheckAvailability {
  contractVersion: 'insight-crosscheck-availability-v1';
  binding: InsightSourceBinding;
  secondConfiguration: InsightModelConfiguration | null;
  secondConfigurationSha256: string | null;
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
export interface ResearchInsightCrosscheckValid {
  contractVersion: 'insight-crosscheck-response-v1';
  status: 'VALID';
  requestKey: string;
  snapshotSha256: string;
  snapshot: InsightCrosscheckSnapshot;
  exactRetry: boolean;
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
export interface InsightCrosscheckExecutionReference {
  executionId: string;
  admissionSha256: string;
  inputSha256: string;
  promptSha256: string;
  configurationSha256: string;
  candidatesSha256: string;
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
export interface ResearchInsightCrosscheckNotDispatched {
  contractVersion: 'insight-crosscheck-response-v1';
  status: 'NOT_DISPATCHED';
  requestKey: string;
  reason: 'AI_NOT_CONFIGURED' | 'INSUFFICIENT_EVIDENCE';
}
export interface ResearchInsightCrosscheckPending {
  contractVersion: 'insight-crosscheck-response-v1';
  status: 'PREPARED' | 'DISPATCHING' | 'INCOMPLETE';
  requestKey: string;
  executionId: string;
}
export interface ResearchInsightCrosscheckInvalid {
  contractVersion: 'insight-crosscheck-response-v1';
  status: 'INVALID';
  requestKey: string;
  executionId: string;
  code: 'RESPONSE_NOT_TEXT' | 'RESPONSE_TOO_LARGE' | 'RESPONSE_NOT_JSON' | 'INVALID_INSIGHT_CODING_RESPONSE';
  rawCompletion: 'NOT_RETAINED';
}
export interface ResearchInsightCrosscheckUnknown {
  contractVersion: 'insight-crosscheck-response-v1';
  status: 'DISPATCH_UNKNOWN';
  requestKey: string;
  executionId: string;
  code: 'INTERRUPTED_AFTER_CLAIM' | 'TRANSPORT_OUTCOME_AMBIGUOUS' | 'RESPONSE_NOT_RETAINED';
  rawCompletion: 'NOT_RETAINED';
}

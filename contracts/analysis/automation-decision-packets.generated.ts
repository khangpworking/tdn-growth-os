/* Generated from automation-decision-packets.schema.json. Do not edit by hand. */

/**
 * Source-neutral M11/I15/M12 deterministic packets and their separate optional retained AI candidate envelopes. Structural and reference validation does not verify semantic truth or authenticate raw sources.
 */
export type AutomationDecisionPackets = AutomationDecisionPacket | AutomationDecisionCandidates;
export type AutomationDecisionPacket =
  AutomationM11DecisionPacket | AutomationI15DecisionPacket | AutomationM12DecisionPacket;
export type Uuid = string;
export type Digest = string;
export type Text = string;
/**
 * Owner-authored entries. Always empty in this version; AI candidates never populate it.
 *
 * @maxItems 0
 */
export type EmptyOwnerList = Text[];
/**
 * @maxItems 20000
 */
export type PacketItems = DecisionPacketItem[];
/**
 * @minItems 1
 * @maxItems 10
 */
export type EvidenceGaps = (
  | 'WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER'
  | 'OWNER_QUESTION_UNSET'
  | 'NO_ELIGIBLE_UPSTREAM_CLAIMS'
  | 'NO_SOURCE_OBSERVATION_CLAIMS'
  | 'NO_LOCATED_DECLARATION_CLAIMS'
  | 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT'
  | 'CROSS_CLAIM_COUNTEREVIDENCE_NOT_ASSIGNED_WITHOUT_OWNER_HYPOTHESIS'
  | 'UPSTREAM_CLAIM_ADAPTERS_LIMITED_TO_M05_I02_I04'
  | 'SUPPORT_ADAPTER_COVERS_ONLY_I02_SOURCE_STATED_USE_CONTEXT'
  | 'NO_ADMISSIBLE_DECISION_SUPPORT'
  | 'SUPPORT_ADAPTER_ADMITS_LITERAL_OBSERVATIONS_AND_CONTAINED_BEHAVIOR_NOT_VERIFIED_PATTERNS'
)[];
/**
 * Untrusted layer-3 draft text. It must contain a non-space character and no Unicode number character; numeric facts stay application-owned claim bindings.
 */
export type AiText = string;
/**
 * @minItems 1
 * @maxItems 30
 */
export type Limitations = Text[];
export type AutomationDecisionCandidates =
  AutomationM11DecisionCandidates | AutomationI15DecisionCandidates | AutomationM12DecisionCandidates;
export type CandidateInsufficientEvidence =
  ('NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT' | 'NO_ADMISSIBLE_DECISION_SUPPORT') | null;
/**
 * Exact upstream claim ids that the CURRENT adapter admits as use-context anchors of the bound packet. Candidate ids or indexes are not evidence.
 *
 * @minItems 1
 * @maxItems 20
 */
export type SupportRefs = Digest[];
/**
 * Exact upstream claim ids of the bound packet proposed as counterevidence. Each needs exactly one counterevidenceRelations entry. Empty means none was supplied, not that no counterevidence exists.
 *
 * @maxItems 20
 */
export type CounterevidenceRefs = Digest[];
/**
 * @minItems 1
 * @maxItems 10
 */
export type RequiredAiTexts = AiText[];
/**
 * Exactly one relation per distinct counterevidenceRefs entry. A claim without a retained relation is separate context, not counterevidence.
 *
 * @maxItems 20
 */
export type CounterevidenceRelations = DecisionCounterevidenceRelation[];
/**
 * @maxItems 10
 */
export type OptionalAiTexts = AiText[];
/**
 * Conditions the option depends on while owner objective, cost, capability and horizon remain unknown. Not a feasibility or preference assertion.
 *
 * @minItems 1
 * @maxItems 10
 */
export type RequiredAiTexts1 = AiText[];
/**
 * What must be true or decided before the proposed operation could be considered. No actor, budget, deadline, choice or execution is assigned.
 *
 * @minItems 1
 * @maxItems 10
 */
export type RequiredAiTexts2 = AiText[];

export interface AutomationM11DecisionPacket {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-packet';
  methodVersion: '1.0.0' | '1.1.0' | '1.2.0';
  sectionId: 'M11';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  sourceClaims: SourceClaimsBinding;
  useContextAdmission: AdmissionBinding;
  authority: Authority;
  ownerQuestion: Unset;
  ownerConstraints: EmptyOwnerList;
  ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED';
  status: 'UNRANKED_EVIDENCE_INVENTORY' | 'INSUFFICIENT_EVIDENCE';
  insufficientEvidence: 'NO_ELIGIBLE_UPSTREAM_CLAIMS' | null;
  items: PacketItems;
  evidenceGaps: EvidenceGaps;
  candidateEligibility: CandidateEligibility;
  opportunity: {
    ownerHypotheses: EmptyOwnerList;
    opportunityDefinition: Unset;
    size: Unset;
    weights: Unset;
    risk: Unset;
    expectedReturn: Unset;
    priority: null;
    aiProposal?: {
      label: Text;
      immediateTask: AiText | null;
      proposedOwner: AiText | null;
      proposedDeadline: AiText | null;
    };
  };
  limitations: Limitations;
}
export interface SourceClaimsBinding {
  methodId: 'automation-source-claims';
  methodVersion: '1.0.0';
  claimsSha256: Digest;
}
/**
 * The exact I14 use-context admission rebuilt from the same claims. It is the CURRENT support adapter: its I02 anchors are the only claims this version lets a candidate cite as support. That is a temporary adapter coverage limit, not the business eligibility rule.
 */
export interface AdmissionBinding {
  methodId: 'automation-i14-evidence-admission';
  methodVersion: '1.0.0' | '1.1.0';
  admissionSha256: Digest;
}
export interface Authority {
  synthesisProfileSha256: '5fd879f42d6c9c82cbc87710b69206aaac2fc8d6bac2da18ba158825f910225a';
  adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
  policyRevision: 'a41-source-neutral-decision-packets-v1';
}
/**
 * An owner input that was not supplied. This version admits no owner-authored value; AI output cannot complete it.
 */
export interface Unset {
  state: 'UNSET';
  text: null;
}
/**
 * A reference to one verified upstream claim; never a new fact. Statements, spans, values and bindings stay in the referenced claims artifact.
 */
export interface DecisionPacketItem {
  claimId: Digest;
  sectionId: 'M05' | 'I02' | 'I04';
  basis: 'SOURCE_OBSERVED' | 'DECLARED';
  evidenceKind: 'SOURCE_OBSERVATION' | 'SELF_REPORTED_DECLARATION';
  /**
   * Whether the CURRENT I14 adapter admits the claim as candidate support. NOT_ADMITTED_BY_CURRENT_ADAPTER is adapter coverage, not a business finding that the claim cannot support a candidate.
   */
  currentAdapterSupport:
    'USE_CONTEXT_ANCHOR' | 'NOT_ADMITTED_BY_CURRENT_ADAPTER' | 'OBSERVED_LITERAL' | 'BEHAVIOR_WITH_USE_CONTEXT';
  /**
   * The exact I14 unassigned reason, or null for an anchor. M05 and I04 reasons record what the current adapter does not encode.
   */
  currentAdapterReason:
    | (
        | 'NOT_A_LOCATED_DECLARATION'
        | 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT'
        | 'NO_SOURCE_STATED_USE_CONTEXT_FIELD'
        | 'CONTEXT_FIELD_CONFLICTING'
        | 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED'
        | 'OBSERVATION_IDENTIFICATION_INCOMPLETE'
        | 'BEHAVIOR_CONTEXT_NOT_ADMITTED'
      )
    | null;
  /**
   * Count of COUNTEREVIDENCE spans encoded on the claim. Zero means none encoded, not that none exists.
   */
  encodedCounterevidenceSpans: number;
  encodedQualifierSpans: number;
  /**
   * @minItems 1
   * @maxItems 20000
   */
  contextClaimRefs?: Digest[];
}
export interface CandidateEligibility {
  rule:
    | 'CURRENT_ADAPTER_I14_SOURCE_STATED_USE_CONTEXT_ANCHORS_V1'
    | 'LITERAL_OBSERVATION_AND_SOURCE_CONTEXT_DRAFT_SUPPORT_V2';
  status: 'SUPPORT_ANCHORS_AVAILABLE' | 'INSUFFICIENT_EVIDENCE';
  insufficientEvidence: ('NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT' | 'NO_ADMISSIBLE_DECISION_SUPPORT') | null;
}
export interface AutomationI15DecisionPacket {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-packet';
  methodVersion: '1.0.0' | '1.1.0' | '1.2.0';
  sectionId: 'I15';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  sourceClaims: SourceClaimsBinding;
  useContextAdmission: AdmissionBinding;
  authority: Authority;
  ownerQuestion: Unset;
  ownerConstraints: EmptyOwnerList;
  ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED';
  status: 'UNRANKED_EVIDENCE_INVENTORY' | 'INSUFFICIENT_EVIDENCE';
  insufficientEvidence: 'NO_ELIGIBLE_UPSTREAM_CLAIMS' | null;
  items: PacketItems;
  evidenceGaps: EvidenceGaps;
  candidateEligibility: CandidateEligibility;
  strategy: {
    ownerOptions: EmptyOwnerList;
    objective: Unset;
    horizon: Unset;
    riskAppetite: Unset;
    tradeOffWeights: Unset;
    capability: Unset;
    cost: Unset;
    reviewTrigger: Unset;
    preferredOption: null;
    aiProposal?: {
      label: Text;
      immediateTask: AiText | null;
      proposedOwner: AiText | null;
      proposedDeadline: AiText | null;
    };
  };
  limitations: Limitations;
}
export interface AutomationM12DecisionPacket {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-packet';
  methodVersion: '1.0.0' | '1.1.0' | '1.2.0';
  sectionId: 'M12';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  sourceClaims: SourceClaimsBinding;
  useContextAdmission: AdmissionBinding;
  authority: Authority;
  ownerQuestion: Unset;
  ownerConstraints: EmptyOwnerList;
  ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED';
  status: 'UNRANKED_EVIDENCE_INVENTORY' | 'INSUFFICIENT_EVIDENCE';
  insufficientEvidence: 'NO_ELIGIBLE_UPSTREAM_CLAIMS' | null;
  items: PacketItems;
  evidenceGaps: EvidenceGaps;
  candidateEligibility: CandidateEligibility;
  action: {
    decisionState: 'OPEN';
    ownerOptions: EmptyOwnerList;
    accountableOwner: Unset;
    budget: Unset;
    capability: Unset;
    risk: Unset;
    criteria: Unset;
    timing: Unset;
    chosen: null;
    executionAuthorization: null;
    aiProposal?: {
      label: Text;
      immediateTask: AiText | null;
      proposedOwner: AiText | null;
      proposedDeadline: AiText | null;
    };
  };
  limitations: Limitations;
}
export interface AutomationM11DecisionCandidates {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-candidates';
  methodVersion: '1.0.0';
  sectionId: 'M11';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  packet: PacketBinding;
  insufficientEvidence: CandidateInsufficientEvidence;
  /**
   * @maxItems 20
   */
  aiCandidates: DecisionHypothesisCandidate[];
  validation: Validation;
  limitations: Limitations;
}
export interface PacketBinding {
  methodId: 'automation-decision-packet';
  methodVersion: '1.0.0' | '1.1.0' | '1.2.0';
  packetSha256: Digest;
}
export interface DecisionHypothesisCandidate {
  candidateType: 'HYPOTHESIS' | 'OPPORTUNITY_DIRECTION';
  candidateStatus: 'HUMAN_REVIEW_REQUIRED';
  layer: 3;
  text: AiText;
  conciseEvidenceLinkedRationale: AiText;
  citedClaimRefs: SupportRefs;
  counterevidenceRefs: CounterevidenceRefs;
  counterevidenceRelations: CounterevidenceRelations;
  assumptions: RequiredAiTexts;
  unknowns: OptionalAiTexts;
  evidenceGaps: OptionalAiTexts;
  limitations: RequiredAiTexts;
  immediateTask?: AiText | null;
  proposedOwner?: AiText | null;
  proposedDeadline?: AiText | null;
}
/**
 * A PROPOSED layer-3 draft saying how one referenced upstream claim may counter this candidate. It is not a verified counterclaim, a new source claim or owner input. Only the claim reference and the exact target binding are machine-checked. Whether the claim counters the target, and every compatibility statement, are unverified human-review drafts, not machine proof.
 */
export interface DecisionCounterevidenceRelation {
  /**
   * Exactly one entry of this candidate's counterevidenceRefs, unchanged.
   */
  claimRef: string;
  relationType: 'PROPOSED_COUNTEREVIDENCE';
  relationStatus: 'HUMAN_REVIEW_REQUIRED';
  layer: 3;
  /**
   * Untrusted layer-3 draft text. It must contain a non-space character and no Unicode number character; numeric facts stay application-owned claim bindings.
   */
  counteredTarget: string;
  /**
   * Draft statement per dimension of whether the referenced claim and the countered target concern a compatible entity, measure, unit, period, scope and denominator, or the explicit unresolved mismatch. Unverified; not machine proof.
   */
  compatibility: {
    entity: AiText;
    measure: AiText;
    unit: AiText;
    period: AiText;
    scope: AiText;
    denominator: AiText;
  };
  inferentialLimitations: RequiredAiTexts;
}
export interface Validation {
  structural: 'SCHEMA_AND_REFERENCES_PASSED';
  semantic: 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED';
}
export interface AutomationI15DecisionCandidates {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-candidates';
  methodVersion: '1.0.0';
  sectionId: 'I15';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  packet: PacketBinding;
  insufficientEvidence: CandidateInsufficientEvidence;
  /**
   * @maxItems 20
   */
  aiCandidates: DecisionStrategyOptionCandidate[];
  validation: Validation;
  limitations: Limitations;
}
export interface DecisionStrategyOptionCandidate {
  candidateType: 'STRATEGY_OPTION';
  candidateStatus: 'HUMAN_REVIEW_REQUIRED';
  layer: 3;
  text: AiText;
  conciseEvidenceLinkedRationale: AiText;
  citedClaimRefs: SupportRefs;
  counterevidenceRefs: CounterevidenceRefs;
  counterevidenceRelations: CounterevidenceRelations;
  conditions: RequiredAiTexts1;
  assumptions: RequiredAiTexts;
  unknowns: OptionalAiTexts;
  evidenceGaps: OptionalAiTexts;
  limitations: RequiredAiTexts;
  immediateTask?: AiText | null;
  proposedOwner?: AiText | null;
  proposedDeadline?: AiText | null;
}
export interface AutomationM12DecisionCandidates {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-candidates';
  methodVersion: '1.0.0';
  sectionId: 'M12';
  runId: Uuid;
  workspaceId: Uuid;
  scopeSha256: Digest;
  packet: PacketBinding;
  insufficientEvidence: CandidateInsufficientEvidence;
  /**
   * @maxItems 20
   */
  aiCandidates: DecisionActionOptionCandidate[];
  validation: Validation;
  limitations: Limitations;
}
export interface DecisionActionOptionCandidate {
  candidateType: 'ACTION_OPTION';
  candidateStatus: 'HUMAN_REVIEW_REQUIRED';
  layer: 3;
  text: AiText;
  conciseEvidenceLinkedRationale: AiText;
  citedClaimRefs: SupportRefs;
  counterevidenceRefs: CounterevidenceRefs;
  counterevidenceRelations: CounterevidenceRelations;
  prerequisites: RequiredAiTexts2;
  assumptions: RequiredAiTexts;
  unknowns: OptionalAiTexts;
  evidenceGaps: OptionalAiTexts;
  limitations: RequiredAiTexts;
  immediateTask?: AiText | null;
  proposedOwner?: AiText | null;
  proposedDeadline?: AiText | null;
}

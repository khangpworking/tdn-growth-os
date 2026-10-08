import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-decision-packets.schema.json' with { type: 'json' };
// Generated on Linux by root; regenerate after any schema change.
import type { AutomationDecisionCandidates, AutomationDecisionPacket, DecisionPacketItem } from '../../../../contracts/analysis/automation-decision-packets.generated.js';
import { buildAutomationI14EvidenceAdmission, type AutomationI14EvidenceAdmissionInput } from './i14-evidence-admission.js';
import { validateAutomationSourceClaims, type AutomationSourceClaim } from './source-claims.js';
import { decisionAdditionalSupport } from './decision-support.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv); ajv.addSchema(schema);
const validatePacketSchema = ajv.compile<AutomationDecisionPacket>({ $ref: `${schema.$id}#/$defs/packet` });
const validateCandidatesSchema = ajv.compile<AutomationDecisionCandidates>({ $ref: `${schema.$id}#/$defs/candidates` });

export const MAX_DECISION_PACKET_BYTES = 64 * 1024 * 1024;
export type AutomationDecisionSectionId = AutomationDecisionPacket['sectionId'];
type CandidateType = AutomationDecisionCandidates['aiCandidates'][number]['candidateType'];
type Gap = AutomationDecisionPacket['evidenceGaps'][number];
/** Adopted D12 type/section binding. A candidate of another type is rejected, never re-labelled. */
export const DECISION_CANDIDATE_TYPES: Readonly<Record<AutomationDecisionSectionId, readonly CandidateType[]>> = {
  M11: ['HYPOTHESIS', 'OPPORTUNITY_DIRECTION'], I15: ['STRATEGY_OPTION'], M12: ['ACTION_OPTION'],
};
/** Report catalog order of the upstream claim sections; it is not a priority. */
const SECTION_ORDER = ['M05', 'I02', 'I04'] as const;
/** Pinned A41 synthesis profile and adoption bytes; the schema rejects any other identity. */
const AUTHORITY = {
  synthesisProfileSha256: '5fd879f42d6c9c82cbc87710b69206aaac2fc8d6bac2da18ba158825f910225a',
  adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
  policyRevision: 'a41-source-neutral-decision-packets-v1',
} as const;
const UNSET = { state: 'UNSET', text: null } as const;
/**
 * U-07 (E2/E6): packet 1.2.0 carries an explicit AI-proposal slot instead of hard UNSET, capped at three candidates.
 * 1.0.0/1.1.0 keep their historical bytes; an omitted version retains 1.0.0.
 */
export type DecisionPacketVersion = '1.0.0' | '1.1.0' | '1.2.0';
export const AI_PROPOSAL_LABEL = 'đề xuất, chờ chủ duyệt';
const MAX_AI_CANDIDATES_V1 = 20;
const MAX_AI_CANDIDATES_V2 = 3;
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export class AutomationDecisionPacketValidationError extends TypeError {}
function fail(code: string): never { throw new AutomationDecisionPacketValidationError(code); }

export interface AutomationDecisionPacketInput {
  readonly sectionId: AutomationDecisionSectionId;
  /** Explicit opt-in; omission retains the historical adapter and exact bytes. */
  readonly packetVersion?: DecisionPacketVersion;
  /**
   * The exact frozen inputs the owning report attempt used for its I14 admission, with the saved admission version.
   * `sourceClaims` must be the artifact the owning Analysis service reconstructed and replay-verified from the exact
   * source/method snapshots. This module revalidates structure and identities only; it is not raw-source authentication.
   */
  readonly evidence: AutomationI14EvidenceAdmissionInput & { readonly admissionVersion: NonNullable<AutomationI14EvidenceAdmissionInput['admissionVersion']> };
}

const SECTION_LIMITATIONS: Readonly<Record<AutomationDecisionSectionId, string>> = {
  M11: 'M11_OPPORTUNITY_DEFINITION_SIZE_WEIGHTS_RISK_AND_RETURN_ARE_UNSET_AND_PRIORITY_IS_NULL',
  I15: 'I15_OWNER_OPTIONS_ARE_EMPTY_OBJECTIVE_COST_CAPABILITY_AND_HORIZON_ARE_UNKNOWN_AND_PREFERRED_OPTION_IS_NULL',
  M12: 'M12_DECISION_IS_OPEN_WITH_NO_ACTOR_BUDGET_DEADLINE_CHOICE_OR_EXECUTION_AUTHORIZATION',
};

/** Packet 1.2.0 declares an AI-proposal slot (label + null values); the values live only in the candidate envelope. */
const AI_PROPOSAL_SLOT = { label: AI_PROPOSAL_LABEL, immediateTask: null, proposedOwner: null, proposedDeadline: null } as const;

/**
 * U-16 (L8): authored draft text must never suggest a trial order or a purchase. Applied only to packet 1.2.0 so a
 * retained 1.0.0/1.1.0 candidate always replays. Text values only; ids, enums and locators never match these phrases.
 */
const PURCHASE_SUGGESTION = /(?:đặt\s*hàng\s*thử|mua\s*thử|thử\s*mua|đặt\s*mua|order\s+(?:a\s+|an\s+)?(?:trial|sample|test)\b|buy\s+(?:a\s+|an\s+)?(?:trial|sample|test)\b|place\s+(?:a\s+|an\s+)?(?:trial\s+)?order\b)/iu;
function assertNoPurchaseSuggestion(candidates: AutomationDecisionCandidates): void {
  const texts: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(candidates.aiCandidates);
  if (texts.some(text => PURCHASE_SUGGESTION.test(text))) fail('PURCHASE_SUGGESTION_NOT_ALLOWED');
}

function sectionFields(sectionId: AutomationDecisionSectionId, version: DecisionPacketVersion) {
  const proposal = version === '1.2.0' ? { aiProposal: AI_PROPOSAL_SLOT } : {};
  if (sectionId === 'M11') return { opportunity: { ownerHypotheses: [], opportunityDefinition: UNSET, size: UNSET, weights: UNSET, risk: UNSET, expectedReturn: UNSET, priority: null, ...proposal } };
  if (sectionId === 'I15') return { strategy: { ownerOptions: [], objective: UNSET, horizon: UNSET, riskAppetite: UNSET, tradeOffWeights: UNSET,
    capability: UNSET, cost: UNSET, reviewTrigger: UNSET, preferredOption: null, ...proposal } };
  return { action: { decisionState: 'OPEN', ownerOptions: [], accountableOwner: UNSET, budget: UNSET, capability: UNSET, risk: UNSET,
    criteria: UNSET, timing: UNSET, chosen: null, executionAuthorization: null, ...proposal } };
}

function item(claim: AutomationSourceClaim, reason: DecisionPacketItem['currentAdapterReason'] | undefined): DecisionPacketItem {
  const basis = claim.observation.basis;
  return {
    claimId: claim.claimId, sectionId: claim.sectionId, basis,
    evidenceKind: basis === 'DECLARED' ? 'SELF_REPORTED_DECLARATION' : 'SOURCE_OBSERVATION',
    currentAdapterSupport: reason === undefined ? 'USE_CONTEXT_ANCHOR' : 'NOT_ADMITTED_BY_CURRENT_ADAPTER',
    currentAdapterReason: reason ?? null,
    encodedCounterevidenceSpans: claim.source.spans.filter(({ role }) => role === 'COUNTEREVIDENCE').length,
    encodedQualifierSpans: claim.source.spans.filter(({ role }) => role === 'QUALIFIER').length,
  };
}

/**
 * Build the unranked M11/I15/M12 evidence packet from the exact verified claims and their rebuilt I14 use-context
 * admission. No AI, owner input, ranking, preference, choice or execution is produced.
 */
export function buildAutomationDecisionPacket(input: AutomationDecisionPacketInput): { readonly artifact: AutomationDecisionPacket; readonly bytes: Buffer } {
  if (!Object.hasOwn(DECISION_CANDIDATE_TYPES, input.sectionId)) fail('DECISION_SECTION_UNSUPPORTED');
  if (!input.evidence.admissionVersion) fail('ADMISSION_VERSION_REQUIRED');
  // The admission builder checks run/scope/workspace/claims identities and replays any located output it reads.
  const { artifact: admission, bytes: admissionBytes } = buildAutomationI14EvidenceAdmission(input.evidence);
  const claims = validateAutomationSourceClaims(input.evidence.sourceClaims);
  if (claims.claimsSha256 !== admission.sourceClaims.claimsSha256) fail('CLAIMS_IDENTITY_MISMATCH');
  const version = input.packetVersion ?? '1.0.0';
  const additional = version === '1.0.0' ? null : decisionAdditionalSupport(claims.claims, admission, input.evidence);
  // CURRENT adapter coverage only: I14 admits I02 source-stated use contexts. M05 supported patterns/constraints and
  // I04 actions with related context are business-eligible support but await a content-specific admission; until then
  // they are recorded as not admitted by this adapter, never as ineligible evidence.
  const anchors = new Set(admission.anchors.map(({ claimId }) => claimId));
  const reasons = new Map(admission.unassigned.map(({ claimId, reason }) => [claimId, reason]));
  if (anchors.size + reasons.size !== claims.claims.length || claims.claims.some(({ claimId }) => anchors.has(claimId) === reasons.has(claimId)))
    fail('ADMISSION_CLAIM_COVERAGE_MISMATCH');
  // Group by catalog section only; within a section the upstream artifact order is kept unchanged.
  const items = SECTION_ORDER.flatMap((sectionId) => claims.claims.filter((claim) => claim.sectionId === sectionId)
    .map((claim): DecisionPacketItem => {
      const current = item(claim, anchors.has(claim.claimId) ? undefined : reasons.get(claim.claimId));
      if (additional?.observations.has(claim.claimId)) return { ...current, currentAdapterSupport: 'OBSERVED_LITERAL', currentAdapterReason: null };
      const behavior = additional?.behaviors.get(claim.claimId);
      if (behavior) return { ...current, currentAdapterSupport: 'BEHAVIOR_WITH_USE_CONTEXT', currentAdapterReason: null, contextClaimRefs: behavior.contextClaimRefs };
      if (additional && claim.sectionId === 'M05') return { ...current, currentAdapterReason: 'OBSERVATION_IDENTIFICATION_INCOMPLETE' };
      if (additional && claim.sectionId === 'I04') return { ...current, currentAdapterReason: 'BEHAVIOR_CONTEXT_NOT_ADMITTED' };
      return current;
    }));
  const supportAvailable = items.some(entry => entry.currentAdapterSupport !== 'NOT_ADMITTED_BY_CURRENT_ADAPTER');
  const insufficient = version === '1.0.0' ? 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT' : 'NO_ADMISSIBLE_DECISION_SUPPORT';
  // U-02 (E7): packet 1.2.0 states the working-question state instead of the old hard "owner question unset" gap.
  const gaps: Gap[] = [
    version === '1.2.0' ? 'WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER' : 'OWNER_QUESTION_UNSET',
    ...(items.length ? [] : ['NO_ELIGIBLE_UPSTREAM_CLAIMS'] as const),
    ...(items.some(({ sectionId }) => sectionId === 'M05') ? [] : ['NO_SOURCE_OBSERVATION_CLAIMS'] as const),
    ...(items.some(({ sectionId }) => sectionId !== 'M05') ? [] : ['NO_LOCATED_DECLARATION_CLAIMS'] as const),
    ...(supportAvailable ? [] : [insufficient] as const),
    'CROSS_CLAIM_COUNTEREVIDENCE_NOT_ASSIGNED_WITHOUT_OWNER_HYPOTHESIS',
    'UPSTREAM_CLAIM_ADAPTERS_LIMITED_TO_M05_I02_I04',
    version === '1.0.0' ? 'SUPPORT_ADAPTER_COVERS_ONLY_I02_SOURCE_STATED_USE_CONTEXT' : 'SUPPORT_ADAPTER_ADMITS_LITERAL_OBSERVATIONS_AND_CONTAINED_BEHAVIOR_NOT_VERIFIED_PATTERNS',
  ];
  const artifact = {
    contractVersion: '1.0.0', methodId: 'automation-decision-packet', methodVersion: version, sectionId: input.sectionId,
    runId: claims.runId, workspaceId: claims.workspaceId, scopeSha256: claims.scopeSha256,
    sourceClaims: { methodId: claims.methodId, methodVersion: claims.methodVersion, claimsSha256: claims.claimsSha256 },
    useContextAdmission: { methodId: admission.methodId, methodVersion: admission.methodVersion, admissionSha256: sha256(admissionBytes) },
    authority: AUTHORITY,
    ownerQuestion: UNSET,
    ownerConstraints: [],
    ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED',
    status: items.length ? 'UNRANKED_EVIDENCE_INVENTORY' : 'INSUFFICIENT_EVIDENCE',
    insufficientEvidence: items.length ? null : 'NO_ELIGIBLE_UPSTREAM_CLAIMS',
    items,
    evidenceGaps: gaps,
    candidateEligibility: {
      rule: version === '1.0.0' ? 'CURRENT_ADAPTER_I14_SOURCE_STATED_USE_CONTEXT_ANCHORS_V1' : 'LITERAL_OBSERVATION_AND_SOURCE_CONTEXT_DRAFT_SUPPORT_V2',
      status: supportAvailable ? 'SUPPORT_ANCHORS_AVAILABLE' : 'INSUFFICIENT_EVIDENCE',
      insufficientEvidence: supportAvailable ? null : insufficient,
    },
    ...sectionFields(input.sectionId, version),
    limitations: [
      'PACKET_ITEMS_REFERENCE_UPSTREAM_CLAIMS_AND_ARE_NOT_NEW_FACTS',
      'OWNER_QUESTION_CONSTRAINTS_AND_OPTIONS_ARE_UNSET_AND_ARE_NOT_INFERRED_OR_COMPLETED_BY_AI',
      'CATALOG_SECTION_ORDER_AND_UPSTREAM_ARTIFACT_ORDER_ARE_NOT_PRIORITY_OR_RANK',
      'NO_SCORE_RANK_ROI_PREFERENCE_CHOICE_OR_EXECUTION_IS_PRODUCED',
      ...(version === '1.0.0' ? [
        'CURRENT_SUPPORT_ADAPTER_ADMITS_ONLY_I02_SOURCE_STATED_USE_CONTEXT_A_TEMPORARY_COVERAGE_LIMIT_NOT_THE_BUSINESS_ELIGIBILITY_RULE',
        'M05_SUPPORTED_PATTERN_OR_CONSTRAINT_AND_I04_ACTION_WITH_RELATED_CONTEXT_AWAIT_CONTENT_SPECIFIC_ADMISSION',
      ] : [
        'LITERAL_OBSERVATION_IS_NOT_A_VERIFIED_PATTERN_CONSTRAINT_DEMAND_OR_OPPORTUNITY',
        'CONTAINED_CONTEXT_IS_NOT_PROOF_OF_REASON_PURPOSE_RESULT_OR_CAUSALITY',
        'NO_MODEL_CALCULATION_COMPARISON_TREND_RATIO_SUM_THRESHOLD_OR_BASELINE_IS_ADMITTED',
        'I04_SUPPORT_REQUIRES_ITS_EXACT_I02_CONTEXT_REFS_QUALIFIERS_AND_COUNTEREVIDENCE',
      ]),
      'A_BARE_PURCHASE_OR_USE_ALONE_DOES_NOT_SUPPORT_UNMET_NEED_OR_MARKET_GAP',
      ...(version === '1.2.0' ? [
        'OWNER_FIELDS_STAY_UNSET_AND_A_LABELLED_AI_PROPOSAL_AWAITING_OWNER_IS_A_SEPARATE_UNREVIEWED_DRAFT',
        'AT_MOST_THREE_AI_PROPOSALS_FOR_M12_AND_I15_ARE_NEVER_OWNER_OPTIONS_PREFERRED_OR_DECIDED',
      ] : []),
      'CO_LISTED_SECTIONS_DO_NOT_IMPLY_PRODUCT_PERSON_LISTING_OR_PERIOD_JOIN_DENOMINATOR_MERGE_OR_INDEPENDENCE',
      'DECLARATIONS_ARE_ATTRIBUTED_SELF_REPORT_NOT_AUTHENTICATED_TRUTH',
      'LOCATED_RECORD_IS_NOT_A_PERSON_OR_POPULATION',
      'ZERO_ENCODED_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS',
      'REQUESTED_DATE_WINDOW_IS_NOT_ASSUMED_TO_BE_THE_OBSERVED_PERIOD',
      'ONLY_THE_BOUND_SOURCE_CLAIMS_ARTIFACT_IS_INVENTORIED',
      'STRUCTURAL_REPLAY_IS_NOT_RAW_SOURCE_AUTHENTICATION',
      SECTION_LIMITATIONS[input.sectionId],
      'NO_AI_OR_PROVIDER_CALL_WAS_MADE',
    ],
  };
  if (!validatePacketSchema(artifact)) fail(`INVALID_DECISION_PACKET:${ajv.errorsText(validatePacketSchema.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(artifact)}\n`, 'utf8');
  if (bytes.length > MAX_DECISION_PACKET_BYTES) fail('DECISION_PACKET_TOO_LARGE');
  return { artifact: JSON.parse(canonicalJson(artifact)) as AutomationDecisionPacket, bytes };
}

/** Replay a retained packet against the exact claims and admission inputs it must have been built from. */
export function verifyAutomationDecisionPacket(untrusted: unknown, input: AutomationDecisionPacketInput): AutomationDecisionPacket {
  if (!validatePacketSchema(untrusted)) fail(`INVALID_DECISION_PACKET:${ajv.errorsText(validatePacketSchema.errors)}`);
  if (untrusted.sectionId !== input.sectionId) fail('DECISION_SECTION_MISMATCH');
  if (untrusted.useContextAdmission.methodVersion !== input.evidence.admissionVersion) fail('ADMISSION_VERSION_MISMATCH');
  const expected = buildAutomationDecisionPacket({ ...input, packetVersion: untrusted.methodVersion }).artifact;
  if (canonicalJson(untrusted) !== canonicalJson(expected)) fail('DECISION_PACKET_REPLAY_MISMATCH');
  return expected;
}

/**
 * Validate an untrusted `{ aiCandidates }` response against the packet rebuilt from the exact inputs.
 * Passing proves structure and reference membership only; it does not verify that any candidate text is true.
 */
export function validateAutomationDecisionCandidateResponse(untrustedResponse: unknown, input: AutomationDecisionPacketInput): { readonly artifact: AutomationDecisionCandidates; readonly bytes: Buffer } {
  const { artifact: packet, bytes: packetBytes } = buildAutomationDecisionPacket(input);
  if (!untrustedResponse || typeof untrustedResponse !== 'object' || Array.isArray(untrustedResponse) ||
      Object.keys(untrustedResponse).join('\n') !== 'aiCandidates') fail('CANDIDATE_RESPONSE_FIELDS_INVALID');
  const aiCandidates = (untrustedResponse as { readonly aiCandidates: unknown }).aiCandidates;
  if (Array.isArray(aiCandidates) && aiCandidates.some((candidate: unknown) => candidate && typeof candidate === 'object' &&
      !(DECISION_CANDIDATE_TYPES[packet.sectionId] as readonly unknown[]).includes((candidate as { readonly candidateType?: unknown }).candidateType)))
    fail('CANDIDATE_TYPE_SECTION_MISMATCH');
  const envelope = {
    contractVersion: '1.0.0', methodId: 'automation-decision-candidates', methodVersion: '1.0.0', sectionId: packet.sectionId,
    runId: packet.runId, workspaceId: packet.workspaceId, scopeSha256: packet.scopeSha256,
    packet: { methodId: packet.methodId, methodVersion: packet.methodVersion, packetSha256: sha256(packetBytes) },
    insufficientEvidence: packet.candidateEligibility.insufficientEvidence,
    aiCandidates,
    validation: { structural: 'SCHEMA_AND_REFERENCES_PASSED', semantic: 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED' },
    limitations: [
      'AI_CANDIDATES_ARE_UNREVIEWED_LAYER_THREE_DRAFTS_NOT_FACTS_OR_DECISIONS',
      'STRUCTURAL_AND_REFERENCE_VALIDATION_DOES_NOT_VERIFY_SEMANTIC_TRUTH',
      'CANDIDATES_ARE_NEVER_SOURCE_EVIDENCE_OWNER_OPTIONS_PREFERENCES_OR_CHOICES',
      'ONLY_UPSTREAM_CLAIM_IDS_RESOLVE_CANDIDATE_TO_CANDIDATE_CITATION_IS_NOT_EVIDENCE',
      packet.methodVersion === '1.0.0' ? 'SUPPORT_REFS_ARE_LIMITED_BY_THE_CURRENT_I02_USE_CONTEXT_ADAPTER_NOT_BY_BUSINESS_ELIGIBILITY'
        : 'SUPPORT_REFS_ARE_LITERAL_OBSERVATIONS_OR_SOURCE_CONTEXT_FOR_UNREVIEWED_RELATIONS_NOT_VERIFIED_PATTERNS',
      'EMPTY_COUNTEREVIDENCE_REFS_MEAN_NONE_SUPPLIED_NOT_NONE_EXISTS',
      'COUNTEREVIDENCE_RELATIONS_ARE_PROPOSED_UNVERIFIED_DRAFTS_NOT_VERIFIED_COUNTERCLAIMS_OR_NEW_SOURCE_CLAIMS',
      'REFERENCE_MEMBERSHIP_DOES_NOT_VERIFY_THAT_A_REFERENCED_CLAIM_COUNTERS_THE_TARGET',
      'COMPATIBILITY_TEXT_IS_NOT_MACHINE_PROOF_OF_ENTITY_MEASURE_UNIT_PERIOD_SCOPE_OR_DENOMINATOR_MATCH',
      'A_CLAIM_WITHOUT_A_RETAINED_RELATION_IS_SEPARATE_CONTEXT_NOT_COUNTEREVIDENCE',
      'AI_TEXT_REJECTS_NUMBER_CHARACTERS_BUT_NOT_SPELLED_OUT_QUANTITIES',
      'NUMBER_FREE_AI_TEXT_DESCRIBES_PERIODS_AND_DENOMINATORS_WITHOUT_QUOTING_CLAIM_VALUES',
      'ACTOR_BUDGET_DEADLINE_FEASIBILITY_OR_PREFERENCE_WORDING_REQUIRES_HUMAN_REVIEW',
      'ONLY_CONCISE_EVIDENCE_LINKED_RATIONALE_IS_RETAINED_NOT_HIDDEN_REASONING',
      'CANDIDATE_ORDER_IS_RESPONSE_ORDER_NOT_PRIORITY_OR_RANK',
    ],
  };
  if (!validateCandidatesSchema(envelope)) fail(`INVALID_DECISION_CANDIDATES:${ajv.errorsText(validateCandidatesSchema.errors)}`);
  const artifact = JSON.parse(canonicalJson(envelope)) as AutomationDecisionCandidates;
  if (packet.methodVersion === '1.2.0') {
    // U-07 (E2/E6): M12 and I15 admit at most three labelled proposals; U-16 rejects any authored purchase suggestion.
    if ((packet.sectionId === 'M12' || packet.sectionId === 'I15') && artifact.aiCandidates.length > MAX_AI_CANDIDATES_V2)
      fail('CANDIDATE_COUNT_EXCEEDS_PROPOSAL_LIMIT');
    assertNoPurchaseSuggestion(artifact);
  }
  if (artifact.aiCandidates.length && packet.candidateEligibility.status !== 'SUPPORT_ANCHORS_AVAILABLE') fail('CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT');
  const known = new Set(packet.items.map(({ claimId }) => claimId));
  const anchors = new Set(packet.items.filter(({ currentAdapterSupport }) => currentAdapterSupport !== 'NOT_ADMITTED_BY_CURRENT_ADAPTER').map(({ claimId }) => claimId));
  for (const candidate of artifact.aiCandidates) {
    if (![...candidate.citedClaimRefs, ...candidate.counterevidenceRefs].every((ref) => known.has(ref))) fail('UNKNOWN_CLAIM_REFERENCE');
    if (!candidate.citedClaimRefs.every((ref) => anchors.has(ref))) fail('CITED_CLAIM_NOT_ADMITTED');
    for (const ref of candidate.citedClaimRefs) {
      const member = packet.items.find(entry => entry.claimId === ref)!;
      if (member.contextClaimRefs?.some(contextRef => !candidate.citedClaimRefs.includes(contextRef))) fail('CITED_BEHAVIOR_CONTEXT_MISSING');
    }
    if (candidate.counterevidenceRefs.some((ref) => candidate.citedClaimRefs.includes(ref))) fail('CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE');
    // Exactly one proposed relation per counterevidence ref. Only the claim binding and the verbatim target are
    // checked; whether the claim counters the target and every compatibility statement stay human review.
    const proposed = new Set(candidate.counterevidenceRefs);
    const related = new Set<string>();
    for (const relation of candidate.counterevidenceRelations) {
      if (!known.has(relation.claimRef)) fail('UNKNOWN_CLAIM_REFERENCE');
      if (!proposed.has(relation.claimRef)) fail('COUNTEREVIDENCE_RELATION_UNBOUND');
      if (related.has(relation.claimRef)) fail('COUNTEREVIDENCE_RELATION_DUPLICATE');
      related.add(relation.claimRef);
      if (relation.counteredTarget !== candidate.text && !candidate.assumptions.includes(relation.counteredTarget))
        fail('COUNTEREVIDENCE_TARGET_NOT_IN_CANDIDATE');
    }
    if (related.size !== proposed.size) fail('COUNTEREVIDENCE_RELATION_MISSING');
  }
  return { artifact, bytes: Buffer.from(`${canonicalJson(artifact)}\n`, 'utf8') };
}

/** Replay retained candidates: revalidate the exact retained `aiCandidates` against the rebuilt packet and compare bytes. */
export function verifyAutomationDecisionCandidates(untrusted: unknown, input: AutomationDecisionPacketInput): AutomationDecisionCandidates {
  if (!validateCandidatesSchema(untrusted)) fail(`INVALID_DECISION_CANDIDATES:${ajv.errorsText(validateCandidatesSchema.errors)}`);
  if (untrusted.sectionId !== input.sectionId) fail('DECISION_SECTION_MISMATCH');
  const expected = validateAutomationDecisionCandidateResponse({ aiCandidates: untrusted.aiCandidates }, { ...input, packetVersion: untrusted.packet.methodVersion }).artifact;
  if (canonicalJson(untrusted) !== canonicalJson(expected)) fail('DECISION_CANDIDATES_REPLAY_MISMATCH');
  return expected;
}

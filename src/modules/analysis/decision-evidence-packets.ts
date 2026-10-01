import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/decision-evidence-packets.schema.json' with { type: 'json' };
import packetSchema from '../../../contracts/analysis/versioned-report-packet.schema.json' with { type: 'json' };
import catalogSchema from '../../../contracts/analysis/report-section-catalog.schema.json' with { type: 'json' };
import metricInputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import type { DecisionEvidencePackets } from '../../../contracts/analysis/decision-evidence-packets.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

type Input = DecisionEvidencePackets['input'];
type Claim = Input['claims'][number];
type Group = DecisionEvidencePackets['sections']['M11']['groups'][number];
type Inventory = DecisionEvidencePackets['inventory'];
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const contract of [metricInputSchema, catalogSchema, packetSchema, schema]) ajv.addSchema(contract);
const validInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validOutput = ajv.getSchema<DecisionEvidencePackets>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;
const unique = (values: readonly string[]): string[] => [...new Set(values)];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sectionOrder = (id: string): number => (id.startsWith('M') ? 0 : 13) + Number(id.slice(1));

export class DecisionEvidencePacketsValidationError extends TypeError {}
function fail(code: string): never { throw new DecisionEvidencePacketsValidationError(code); }

/** Structural validation only. The report boundary verifies calculation bytes and exact current packet claims. */
export function validateDecisionEvidencePacketsInput(untrusted: unknown): Input {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('DECISION_INPUT_TOO_LARGE');
  if (!validInput(untrusted)) fail(`INVALID_DECISION_EVIDENCE_INPUT:${ajv.errorsText(validInput.errors)}`);
  const input = JSON.parse(serialized) as Input;
  const fields = [input.question, ...Object.values(input.constraints),
    ...input.ownerOptions.flatMap(option => Object.values(option.constraints))];
  for (const field of fields) {
    if ((field.state === 'UNSET') !== (field.text === null) || (field.text !== null && field.text.trim().length === 0)) {
      fail('OWNER_FIELD_STATE_MISMATCH');
    }
  }
  if (input.question.state === 'UNSET' && input.questionClaimKeys.length) fail('QUESTION_LINKS_WITHOUT_QUESTION');
  const byKey = new Map<string, Claim>();
  const byReference = new Map<string, string>();
  for (const claim of input.claims) {
    if (claim.claimKey !== `${claim.payload.claimId}@${claim.reference.sha256}`) fail('CLAIM_KEY_IDENTITY_MISMATCH');
    if (!/^(M(0[1-9]|1[0-3])|I(0[1-9]|1[0-7]))$/.test(claim.payload.sectionId)) fail('UNKNOWN_CATALOG_SECTION');
    const prior = byKey.get(claim.claimKey);
    if (prior && canonicalJson(prior) !== canonicalJson(claim)) fail('CLAIM_IDENTITY_DRIFT');
    const referenceKey = canonicalJson(claim.reference);
    if (byReference.has(referenceKey) && byReference.get(referenceKey) !== claim.claimKey) fail('CLAIM_REFERENCE_COLLISION');
    byKey.set(claim.claimKey, claim);
    byReference.set(referenceKey, claim.claimKey);
  }
  function checkKeys(keys: readonly string[]): void {
    for (const key of keys) if (!byKey.has(key)) fail('UNKNOWN_CLAIM_KEY');
  }
  for (const claim of byKey.values()) {
    checkKeys(claim.counterclaimKeys);
    if (claim.counterclaimKeys.includes(claim.claimKey)) fail('SELF_COUNTERCLAIM');
  }
  checkKeys(input.questionClaimKeys);
  for (const groups of [input.ownerHypotheses, input.ownerDirections, input.ownerOptions]) {
    const labels = new Set<string>();
    for (const group of groups) {
      if (group.label.trim().length === 0) fail('EMPTY_OWNER_LABEL');
      if (labels.has(group.label)) fail('DUPLICATE_OWNER_LABEL');
      labels.add(group.label);
      checkKeys(group.claimKeys);
      checkKeys(group.counterclaimKeys);
    }
  }
  return input;
}

function inventoryOf(input: Input): Inventory {
  const first = new Map<string, number>();
  input.claims.forEach((claim, index) => { if (!first.has(claim.claimKey)) first.set(claim.claimKey, index); });
  return [...first].map(([claimKey, inputIndex]) => {
    const claim = input.claims[inputIndex]!;
    return {
      claimKey, inputIndex, sectionId: claim.payload.sectionId, reviewState: claim.reviewDeclaration.state,
      counterclaimKeys: [...claim.counterclaimKeys], decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED' as const,
    };
  }).sort((a, b) => sectionOrder(a.sectionId) - sectionOrder(b.sectionId)
    || compare(input.claims[a.inputIndex]!.payload.claimId, input.claims[b.inputIndex]!.payload.claimId)
    || compare(input.claims[a.inputIndex]!.reference.sha256, input.claims[b.inputIndex]!.reference.sha256));
}

export function buildDecisionEvidencePackets(untrusted: unknown): { output: DecisionEvidencePackets; bytes: Buffer } {
  const input = validateDecisionEvidencePacketsInput(untrusted);
  const inventory = inventoryOf(input);
  const keys = inventory.map(item => item.claimKey);
  const byKey = new Map(inventory.map(item => [item.claimKey, input.claims[item.inputIndex]!]));
  const excluded = (key: string): boolean => byKey.get(key)!.reviewDeclaration.state === 'EXCLUDED';
  const counterclaims = (claimKeys: readonly string[], explicit: readonly string[]): string[] => unique([
    ...explicit, ...claimKeys.flatMap(key => byKey.get(key)!.counterclaimKeys),
  ]);
  function groupOf(group: Input['ownerHypotheses'][number], ownerIndex: number | null): Group {
    const counters = counterclaims(group.claimKeys, group.counterclaimKeys);
    const all = unique([...group.claimKeys, ...counters]);
    return {
      basis: ownerIndex === null ? 'SOURCE_SECTION' : 'OWNER_DECLARATION', ownerIndex, label: group.label,
      claimKeys: group.claimKeys.filter(key => !excluded(key)), counterclaimKeys: counters,
      excludedClaimKeys: all.filter(excluded), missingEvidence: [...group.missingEvidence],
      priority: null, decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED',
    };
  }
  const hypotheses = input.ownerHypotheses.length
    ? input.ownerHypotheses.map(groupOf)
    : unique(inventory.map(item => item.sectionId)).map(sectionId => groupOf({
      label: sectionId, claimKeys: inventory.filter(item => item.sectionId === sectionId).map(item => item.claimKey),
      counterclaimKeys: [], missingEvidence: [],
    }, null));
  const directions = input.ownerDirections.map(groupOf);
  const options = input.ownerOptions.map((option, ownerIndex) => {
    const group = groupOf(option, ownerIndex);
    return {
      ownerIndex, label: option.label, claimKeys: group.claimKeys, counterclaimKeys: group.counterclaimKeys,
      excludedClaimKeys: group.excludedClaimKeys, constraints: option.constraints,
      missingEvidence: [...option.missingEvidence], priority: null, decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED' as const,
    };
  });
  const referenced = (groups: readonly Group[]): Set<string> => new Set(groups.flatMap(group => [
    ...group.claimKeys, ...group.counterclaimKeys, ...group.excludedClaimKeys,
  ]));
  const hypothesisKeys = referenced(hypotheses);
  const directionKeys = referenced(directions);
  const optionKeys = new Set(options.flatMap(option => [...option.claimKeys, ...option.counterclaimKeys, ...option.excludedClaimKeys]));
  const ambiguousClaims = keys.flatMap(claimKey => {
    const directionIndexes = directions.flatMap((direction, index) =>
      [...direction.claimKeys, ...direction.counterclaimKeys, ...direction.excludedClaimKeys].includes(claimKey) ? [index] : []);
    return directionIndexes.length > 1 ? [{ claimKey, directionIndexes }] : [];
  });
  const questionKeys = new Set(input.questionClaimKeys);
  const baseBlockers = ['HUMAN_REVIEW_REQUIRED',
    ...(input.question.state === 'UNSET' ? ['OWNER_QUESTION_UNSET'] : []),
    ...(inventory.length ? [] : ['NO_PACKET_FACT_CLAIMS'])];
  const hasConflict = inventory.some(item => item.counterclaimKeys.length) ||
    [...hypotheses, ...directions, ...options].some(group => group.counterclaimKeys.length);
  const body: Omit<DecisionEvidencePackets, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'decision-evidence-packets', methodVersion: '1.0.0', input, inventory,
    duplicateReferenceCount: input.claims.length - inventory.length,
    sections: {
      M01: {
        claimKeys: keys, questionClaimKeys: keys.filter(key => questionKeys.has(key)),
        unassignedClaimKeys: keys.filter(key => !questionKeys.has(key)),
        declaredReviewedClaimKeys: inventory.filter(item => item.reviewState === 'DECLARED_REVIEWED').map(item => item.claimKey),
        unreviewedClaimKeys: inventory.filter(item => item.reviewState === 'UNREVIEWED').map(item => item.claimKey),
        excludedClaimKeys: keys.filter(excluded), conclusion: null, conclusionState: 'UNRANKED_INVENTORY',
        decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED', blockers: [...baseBlockers, 'SYNTHESIS_POLICY_UNAPPROVED'],
      },
      M11: {
        groups: hypotheses, unassignedClaimKeys: keys.filter(key => !hypothesisKeys.has(key)), priority: null,
        decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED', blockers: [...baseBlockers, 'PRIORITY_POLICY_UNAPPROVED',
          ...(input.ownerHypotheses.length ? [] : ['OWNER_HYPOTHESES_UNSET_SOURCE_SECTION_INVENTORY_ONLY'])],
      },
      I14: {
        directions, unassignedClaimKeys: keys.filter(key => !directionKeys.has(key)), ambiguousClaims, priority: null,
        decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED', blockers: [...baseBlockers, 'PRIORITY_POLICY_UNAPPROVED',
          ...(directions.length ? [] : ['OWNER_DIRECTIONS_UNSET']), ...(ambiguousClaims.length ? ['DIRECTION_ASSIGNMENT_AMBIGUOUS'] : [])],
      },
      I15: {
        options, unassignedClaimKeys: keys.filter(key => !optionKeys.has(key)), preferredOption: null,
        decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED', blockers: [...baseBlockers, 'CHOICE_POLICY_UNAPPROVED',
          ...(options.length ? [] : ['OWNER_OPTIONS_UNSET']),
          ...(options.some(option => Object.values(option.constraints).some(field => field.state === 'UNSET')) ? ['OPTION_CONSTRAINTS_UNSET'] : [])],
      },
      M12: {
        question: input.question, claimKeys: keys, ownerOptionIndexes: options.map(option => option.ownerIndex),
        constraints: input.constraints, decisionState: 'OPEN', chosen: null, executionAuthorization: null,
        decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED', blockers: [...baseBlockers, 'AUTHENTICATED_DECISION_AUTHORITY_REQUIRED',
          ...Object.entries(input.constraints).filter(([, value]) => value.state === 'UNSET').map(([key]) => `CONSTRAINT_UNSET:${key}`),
          ...(options.length ? [] : ['OWNER_OPTIONS_UNSET']), ...(hasConflict ? ['EVIDENCE_CONFLICT_REQUIRES_REVIEW'] : [])],
      },
    },
    limitations: [
      'EXACT_CALCULATION_BYTES_AND_CURRENT_PACKET_CLAIMS_REQUIRE_REPORT_BOUNDARY_VERIFICATION',
      'FACT_OBSERVATIONS_RETAIN_NORMALIZED_INPUT_SCOPE_AND_UNREVIEWED_APPROVAL_STATE',
      'IMPORTED_REVIEW_AND_OWNER_DECLARATIONS_ARE_NOT_AUTHENTICATED_AUTHORITY',
      'QUESTION_AND_GROUP_RELEVANCE_ARE_EXPLICIT_DECLARATIONS_NOT_SEMANTIC_VALIDATION',
      'UNREVIEWED_AND_EXCLUDED_EVIDENCE_REMAIN_VISIBLE_NOT_APPROVED_DECISION_SUPPORT',
      'INCOMPATIBLE_SCOPES_UNITS_PERIODS_AND_DENOMINATORS_ARE_NOT_COMBINED',
      'MISSING_EVIDENCE_IS_NOT_NEGATIVE_EVIDENCE_AND_UNKNOWN_IS_NOT_ZERO',
      'NO_CONCLUSION_PRIORITY_PREFERENCE_CHOICE_EXECUTION_OR_AI_GENERATION',
    ],
  };
  const output: DecisionEvidencePackets = { ...body, methodOutputId: createHash('sha256').update(canonicalJson(body)).digest('hex') };
  if (!validOutput(output)) fail(`INVALID_DECISION_EVIDENCE_OUTPUT:${ajv.errorsText(validOutput.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.byteLength > MAX_BYTES) fail('DECISION_OUTPUT_TOO_LARGE');
  return { output, bytes };
}

export function verifyDecisionEvidencePackets(untrusted: unknown): { output: DecisionEvidencePackets; bytes: Buffer } {
  if (!validOutput(untrusted)) fail(`INVALID_DECISION_EVIDENCE_OUTPUT:${ajv.errorsText(validOutput.errors)}`);
  const rebuilt = buildDecisionEvidencePackets((untrusted as DecisionEvidencePackets).input);
  if (canonicalJson(untrusted) !== canonicalJson(rebuilt.output)) fail('DECISION_EVIDENCE_REPLAY_MISMATCH');
  return rebuilt;
}

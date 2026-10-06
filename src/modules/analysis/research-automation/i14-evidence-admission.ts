import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import admissionSchema from '../../../../contracts/analysis/automation-i14-evidence-admission.schema.json' with { type: 'json' };
import candidatesSchema from '../../../../contracts/analysis/automation-i14-candidates.schema.json' with { type: 'json' };
import type { Anchor, AutomationI14EvidenceAdmission, ContextField, UnassignedClaim } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import type { AutomationI14Candidates } from '../../../../contracts/analysis/automation-i14-candidates.generated.js';
import type { Behavior, Context, LocatedInsightMethods, Span } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { verifyLocatedInsightMethods } from '../located-insight-methods.js';
import type { ScopeSnapshot } from './model.js';
import { validateAutomationSourceClaims, type AutomationSourceClaim } from './source-claims.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { AutomationLocatedReviewAdoptedSnapshot } from './located-review-bridge.js';
import type { NativeSourceReviewSnapshot } from './native-source-review-bridge.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateAdmissionSchema = ajv.compile<AutomationI14EvidenceAdmission>(admissionSchema);
const validateCandidatesSchema = ajv.compile<AutomationI14Candidates>(candidatesSchema);

export const MAX_I14_EVIDENCE_ADMISSION_BYTES = 64 * 1024 * 1024;
/** Adopted structured I02 fields that state the situation, task or setting of a reported use. */
const USE_CONTEXT_FIELDS: readonly ContextField['field'][] = ['situation', 'task', 'setting'];
/** Every structured I02 field in contract order. Role and time are carried with an anchor but never admit one alone. */
const CONTEXT_FIELDS = ['role', 'situation', 'task', 'setting', 'time'] as const;
const LOCATED_POINTER = /^\/input\/(i02|i04)\/(0|[1-9][0-9]*)$/;
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export class AutomationI14ValidationError extends TypeError {}
function fail(code: string): never { throw new AutomationI14ValidationError(code); }

export interface AutomationI14EvidenceAdmissionInput {
  /** Omitted means the historical v1 rule. Report owners select the new rule explicitly. */
  readonly admissionVersion?: AutomationI14EvidenceAdmission['methodVersion'];
  /** Only the snapshot returned by the owning verified native/located bridge, never API/model input. */
  readonly literalSnapshot?: AutomationLocatedReviewAdoptedSnapshot | NativeSourceReviewSnapshot | null;
  readonly run: { readonly runId: string; readonly workspaceId: string };
  /** The exact frozen scope snapshot. Its digest is computed here; callers cannot author a scope hash. */
  readonly scope: ScopeSnapshot;
  /** `claimsSha256` of the exact source-claims artifact the owning service replayed. */
  readonly claimsSha256: string;
  /** Untrusted retained source-claims artifact; it is fully revalidated before use. */
  readonly sourceClaims: unknown;
  /**
   * `output` of the owning-verified adopted located or native snapshot whose I02/I04 rows produced the claims,
   * or null when the run has none. It is revalidated and replayed here before any row is read.
   */
  readonly locatedMethodOutput: unknown;
}

const spanKey = ({ start, end, quote }: Span): string => canonicalJson({ start, end, quote });

function rowSpans(row: Context | Behavior): Span[] {
  if ('span' in row) return [row.span, ...row.qualifiers, ...row.counterevidence];
  const context: Context = row;
  return [...CONTEXT_FIELDS.flatMap((field) => context[field].span ?? []), ...context.qualifiers, ...context.counterevidence];
}

/** Resolve the exact frozen I02/I04 row a located claim was built from and require every source binding to match it. */
export function boundLocatedClaimRow(claim: AutomationSourceClaim, output: LocatedInsightMethods | null): Context | Behavior {
  if (!output) fail('LOCATED_METHOD_OUTPUT_REQUIRED');
  const { method, source, declaration } = claim;
  if (method.methodId !== output.methodId || method.methodVersion !== output.methodVersion || method.methodOutputId !== output.methodOutputId)
    fail('LOCATED_METHOD_BINDING_MISMATCH');
  const pointer = LOCATED_POINTER.exec(method.outputPointer);
  const sectionId = claim.sectionId === 'I02' ? 'I02' : 'I04';
  if (!pointer || pointer[1] !== sectionId.toLowerCase() || !output.sections[sectionId].annotationPointers.includes(method.outputPointer))
    fail('LOCATED_OUTPUT_POINTER_NOT_ADMITTED');
  const index = Number(pointer[2]);
  const row: Context | Behavior | undefined = sectionId === 'I02' ? output.input.i02[index] : output.input.i04[index];
  const record = row ? output.input.records[row.recordIndex] : undefined;
  const file = record ? output.input.sources.find((value) => value.sha256 === record.sourceSha256) : undefined;
  if (!row || !record || !file || record.locator !== source.locator || record.locator !== source.recordLocator ||
      record.sourceSha256 !== source.sha256 || file.logicalPath !== source.logicalPath || record.sourceAttribution !== source.attribution)
    fail('LOCATED_SOURCE_RECORD_MISMATCH');
  // The claim must carry exactly this row's spans and declared provenance, not a lookalike row's.
  const expected = new Set(rowSpans(row).map(spanKey));
  const actual = new Set(source.spans.map(spanKey));
  if (!declaration || declaration.sourceAttribution !== record.sourceAttribution || canonicalJson(declaration.provenance) !== canonicalJson(row.provenance) ||
      expected.size !== actual.size || [...expected].some((key) => !actual.has(key)))
    fail('LOCATED_ROW_BINDING_MISMATCH');
  return row;
}

/** Read only the adopted structured I02 fields. No keyword, product name or free span text is interpreted. */
function useContext(row: Context, verifiedLiteral: boolean): ContextField[] | UnassignedClaim['reason'] {
  if (CONTEXT_FIELDS.some((field) => row[field].state === 'CONFLICTING')) return 'CONTEXT_FIELD_CONFLICTING';
  const stated = CONTEXT_FIELDS.flatMap((field): ContextField[] => {
    const { state, span } = row[field];
    return state === 'SOURCE_STATED' && span ? [{ field, span: { start: span.start, end: span.end, quote: span.quote } }] : [];
  });
  if (!stated.some(({ field }) => USE_CONTEXT_FIELDS.includes(field))) return 'NO_SOURCE_STATED_USE_CONTEXT_FIELD';
  // The pinned literal parser duplicates matched situation/time spans in this
  // array. Equality alone is NOT authority for generic or custom-coded rows.
  const matcherSpans = new Set(stated.filter(({ field }) => field === 'situation' || field === 'time').map(({ span }) => spanKey(span)));
  if (row.qualifiers.length && (!verifiedLiteral || row.qualifiers.some(span => !matcherSpans.has(spanKey(span)))))
    return 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED';
  return stated;
}

function literalAuthority(input: AutomationI14EvidenceAdmissionInput, output: LocatedInsightMethods | null): Exclude<AutomationI14EvidenceAdmission['literalProjection'], undefined> {
  const snapshot = input.literalSnapshot;
  if (!snapshot) return null;
  if (!output || snapshot.runId !== input.run.runId || snapshot.authorityState !== 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS' ||
      !['automation-located-review-snapshot-v2', 'automation-native-review-snapshot-v1', 'automation-native-review-snapshot-v2'].includes(snapshot.contractVersion) ||
      snapshot.policySha256 !== 'ba676c8e9e89f7ba0f05ec6157b82414524f6af48697900afe61ac7e0dc64f42' ||
      snapshot.projection.policyRevision !== 'literal-source-bound-v1' || canonicalJson(snapshot.output) !== canonicalJson(output) ||
      canonicalJson(snapshot.projection.candidates.i02) !== canonicalJson(output.input.i02)) fail('LITERAL_PROJECTION_BINDING_MISMATCH');
  const pkg = snapshot.sourcePackage;
  return { policySha256: snapshot.policySha256, projectionId: snapshot.projectionId, projectionSha256: snapshot.projectionSha256,
    methodArtifact: { packageId: pkg.packageId, version: pkg.manifest.version,
      manifestArtifactSha256: pkg.manifestArtifactSha256, packageContentSha256: pkg.packageContentSha256 },
    methodOutputId: output.methodOutputId };
}

/** The saved version selects replay semantics; a new deployment never upgrades historical admission. */
export function automationI14AdmissionVersion(untrusted: unknown): AutomationI14EvidenceAdmission['methodVersion'] {
  if (!validateAdmissionSchema(untrusted)) fail('INVALID_I14_EVIDENCE_ADMISSION');
  return untrusted.methodVersion;
}

/** Admit exact source-stated I02 use contexts as I14 anchors. No AI, ranking, owner direction or conclusion is produced. */
export function buildAutomationI14EvidenceAdmission(input: AutomationI14EvidenceAdmissionInput): { readonly artifact: AutomationI14EvidenceAdmission; readonly bytes: Buffer } {
  if (!input.scope || input.scope.runId !== input.run.runId || input.scope.workspaceId !== input.run.workspaceId) fail('RUN_SCOPE_IDENTITY_MISMATCH');
  const claims = validateAutomationSourceClaims(input.sourceClaims);
  if (claims.runId !== input.run.runId) fail('RUN_IDENTITY_MISMATCH');
  if (claims.workspaceId !== input.run.workspaceId) fail('WORKSPACE_IDENTITY_MISMATCH');
  if (claims.scopeSha256 !== sha256(canonicalJson(input.scope))) fail('SCOPE_IDENTITY_MISMATCH');
  if (claims.claimsSha256 !== input.claimsSha256) fail('CLAIMS_IDENTITY_MISMATCH');
  const output = input.locatedMethodOutput === null ? null : verifyLocatedInsightMethods(input.locatedMethodOutput).output;
  const version = input.admissionVersion ?? '1.0.0';
  const authority = version === '1.1.0' ? literalAuthority(input, output) : null;
  const anchors: Anchor[] = [];
  const unassigned: UnassignedClaim[] = [];
  // Upstream artifact order is kept; it is not a priority.
  for (const claim of claims.claims) {
    if (claim.sectionId === 'M05') {
      unassigned.push({ claimId: claim.claimId, sectionId: 'M05', reason: 'NOT_A_LOCATED_DECLARATION' });
      continue;
    }
    const row = boundLocatedClaimRow(claim, output);
    if ('span' in row) {
      unassigned.push({ claimId: claim.claimId, sectionId: 'I04', reason: 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT' });
      continue;
    }
    let verifiedLiteral = false;
    if (authority) {
      const index = Number(LOCATED_POINTER.exec(claim.method.outputPointer)![2]);
      const member = input.literalSnapshot!.projection.admitted.filter(entry => entry.family === 'I02')[index];
      if (canonicalJson(authority.methodArtifact) !== canonicalJson(claim.method.artifact) ||
          !member || member.recordIndex !== row.recordIndex ||
          canonicalJson(input.literalSnapshot!.projection.candidates.i02[index]) !== canonicalJson(row))
        fail('LITERAL_PROJECTION_MEMBER_MISMATCH');
      verifiedLiteral = true;
    }
    const context = useContext(row, verifiedLiteral);
    if (typeof context === 'string') {
      unassigned.push({ claimId: claim.claimId, sectionId: 'I02', reason: context });
      continue;
    }
    const { source } = claim;
    anchors.push({
      claimId: claim.claimId, method: claim.method,
      source: { package: source.package, logicalPath: source.logicalPath, sha256: source.sha256, locator: source.locator,
        recordLocator: source.recordLocator, attribution: source.attribution },
      contextFields: context,
      counterevidenceSpans: row.counterevidence.map(({ start, end, quote }) => ({ start, end, quote })),
      declaration: claim.declaration!,
    });
  }
  const artifact: AutomationI14EvidenceAdmission = {
    contractVersion: '1.0.0', methodId: 'automation-i14-evidence-admission', methodVersion: version, sectionId: 'I14',
    runId: claims.runId, workspaceId: claims.workspaceId, scopeSha256: claims.scopeSha256,
    sourceClaims: { methodId: claims.methodId, methodVersion: claims.methodVersion, claimsSha256: claims.claimsSha256 },
    locatedMethodOutputId: output?.methodOutputId ?? null,
    ownerQuestion: { state: 'UNSET', text: null },
    admissionRule: version === '1.0.0' ? 'I02_SOURCE_STATED_SITUATION_TASK_OR_SETTING_WITHOUT_QUALIFIERS_V1' : 'I02_VERIFIED_LITERAL_MATCHER_DUPLICATES_V2',
    ...(version === '1.1.0' ? { literalProjection: authority } : {}),
    status: anchors.length ? 'USE_CONTEXT_ADMITTED' : 'INSUFFICIENT_EVIDENCE',
    insufficientEvidence: anchors.length ? null : 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT',
    anchors,
    unassigned,
    limitations: [
      'ADMISSION_READS_ADOPTED_STRUCTURED_I02_FIELDS_NOT_KEYWORDS_PRODUCT_NAMES_OR_FREE_TEXT',
      'ROLE_OR_TIME_ALONE_DOES_NOT_ADMIT_A_USE_CONTEXT',
      version === '1.0.0' ? 'QUALIFIED_I02_ROWS_ARE_NOT_ADMITTED_BECAUSE_FIELD_LEVEL_NEGATION_OR_CONDITION_IS_NOT_ENCODED'
        : 'ONLY_VERIFIED_ADOPTED_LITERAL_MATCHER_DUPLICATES_ARE_ALLOWED_OTHER_QUALIFIERS_REMAIN_BLOCKED',
      'I04_BEHAVIOR_IS_NOT_LINKED_TO_I02_CONTEXT_AND_DOES_NOT_ADMIT_A_USE_CONTEXT',
      'AN_ADMITTED_USE_CONTEXT_SUPPORTS_ONLY_A_NARROW_CONDITIONAL_FIT_HYPOTHESIS',
      'NOT_MARKET_DEMAND_PREVALENCE_PRODUCT_SUPERIORITY_OR_RANKED_OPPORTUNITY',
      'DECLARATIONS_ARE_ATTRIBUTED_SELF_REPORT_NOT_AUTHENTICATED_TRUTH',
      'LOCATED_RECORD_IS_NOT_A_PERSON_OR_POPULATION',
      'EMPTY_COUNTEREVIDENCE_SPANS_MEAN_NONE_ENCODED_NOT_NONE_EXISTS',
      'OWNER_QUESTION_AND_OWNER_DIRECTIONS_ARE_UNSET',
      'ANCHOR_ORDER_IS_UPSTREAM_ARTIFACT_ORDER_NOT_PRIORITY_OR_RANK',
      'NO_AI_OR_PROVIDER_CALL_WAS_MADE',
    ],
  };
  if (!validateAdmissionSchema(artifact)) fail(`INVALID_I14_EVIDENCE_ADMISSION:${ajv.errorsText(validateAdmissionSchema.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(artifact)}\n`, 'utf8');
  if (bytes.length > MAX_I14_EVIDENCE_ADMISSION_BYTES) fail('I14_EVIDENCE_ADMISSION_TOO_LARGE');
  return { artifact: JSON.parse(canonicalJson(artifact)) as AutomationI14EvidenceAdmission, bytes };
}

/** Replay a retained I14 admission against the exact claims and frozen located output it must have been built from. */
export function verifyAutomationI14EvidenceAdmission(untrusted: unknown, input: AutomationI14EvidenceAdmissionInput): AutomationI14EvidenceAdmission {
  if (!validateAdmissionSchema(untrusted)) fail(`INVALID_I14_EVIDENCE_ADMISSION:${ajv.errorsText(validateAdmissionSchema.errors)}`);
  const expected = buildAutomationI14EvidenceAdmission({ ...input, admissionVersion: untrusted.methodVersion }).artifact;
  if (canonicalJson(untrusted) !== canonicalJson(expected)) fail('I14_EVIDENCE_ADMISSION_REPLAY_MISMATCH');
  return expected;
}

/**
 * Validate an untrusted `{ aiCandidates }` response against the admission rebuilt from the exact inputs.
 * Passing proves structure and reference membership only; it does not verify that any candidate text is true.
 */
export function validateAutomationI14CandidateResponse(untrustedResponse: unknown, input: AutomationI14EvidenceAdmissionInput): { readonly artifact: AutomationI14Candidates; readonly bytes: Buffer } {
  const { artifact: admission, bytes: admissionBytes } = buildAutomationI14EvidenceAdmission(input);
  if (!untrustedResponse || typeof untrustedResponse !== 'object' || Array.isArray(untrustedResponse) ||
      Object.keys(untrustedResponse).join('\n') !== 'aiCandidates') fail('CANDIDATE_RESPONSE_FIELDS_INVALID');
  const envelope = {
    contractVersion: '1.0.0', methodId: 'automation-i14-candidates', methodVersion: '1.0.0', sectionId: 'I14',
    runId: admission.runId, workspaceId: admission.workspaceId, scopeSha256: admission.scopeSha256,
    admission: { methodId: admission.methodId, methodVersion: admission.methodVersion, admissionSha256: sha256(admissionBytes) },
    ownerQuestion: { state: 'UNSET', text: null },
    ownerDirections: [],
    aiCandidates: (untrustedResponse as { readonly aiCandidates: unknown }).aiCandidates,
    validation: { structural: 'SCHEMA_AND_REFERENCES_PASSED', semantic: 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED' },
    limitations: [
      'AI_CANDIDATES_ARE_UNREVIEWED_LAYER_THREE_DRAFTS_NOT_FACTS_OR_DECISIONS',
      'STRUCTURAL_AND_REFERENCE_VALIDATION_DOES_NOT_VERIFY_SEMANTIC_TRUTH',
      'A_REPORTED_USE_CONTEXT_SUPPORTS_ONLY_A_NARROW_CONDITIONAL_FIT_HYPOTHESIS',
      'NOT_MARKET_DEMAND_PREVALENCE_PRODUCT_SUPERIORITY_OR_RANKED_OPPORTUNITY',
      'EMPTY_COUNTEREVIDENCE_REFS_MEAN_NONE_SUPPLIED_NOT_NONE_EXISTS',
      'AI_TEXT_REJECTS_NUMBER_CHARACTERS_BUT_NOT_SPELLED_OUT_QUANTITIES',
      'AI_CANDIDATES_ARE_NOT_OWNER_DIRECTIONS_AND_NEVER_POPULATE_THEM',
      'ONLY_CONCISE_EVIDENCE_LINKED_RATIONALE_IS_RETAINED_NOT_HIDDEN_REASONING',
      'CANDIDATE_ORDER_IS_RESPONSE_ORDER_NOT_PRIORITY_OR_RANK',
    ],
  };
  if (!validateCandidatesSchema(envelope)) fail(`INVALID_I14_CANDIDATES:${ajv.errorsText(validateCandidatesSchema.errors)}`);
  const artifact = JSON.parse(canonicalJson(envelope)) as AutomationI14Candidates;
  if (artifact.aiCandidates.length && admission.status !== 'USE_CONTEXT_ADMITTED') fail('CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT');
  const anchorIds = new Set(admission.anchors.map(({ claimId }) => claimId));
  const locatedIds = new Set([...anchorIds, ...admission.unassigned.filter(({ sectionId }) => sectionId !== 'M05').map(({ claimId }) => claimId)]);
  for (const candidate of artifact.aiCandidates) {
    if (!candidate.citedClaimRefs.every((ref) => anchorIds.has(ref))) fail('CITED_CLAIM_NOT_ADMITTED');
    if (!candidate.counterevidenceRefs.every((ref) => locatedIds.has(ref))) fail('COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE');
    if (candidate.counterevidenceRefs.some((ref) => candidate.citedClaimRefs.includes(ref))) fail('CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE');
  }
  return { artifact, bytes: Buffer.from(`${canonicalJson(artifact)}\n`, 'utf8') };
}

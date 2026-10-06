import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import admissionSchema from '../../../../contracts/analysis/automation-i14-evidence-admission.schema.json' with { type: 'json' };
import inputSchema from '../../../../contracts/analysis/automation-i14-synthesis-input.schema.json' with { type: 'json' };
import promptSchema from '../../../../contracts/analysis/automation-i14-synthesis-prompt.schema.json' with { type: 'json' };
import configurationSchema from '../../../../contracts/analysis/automation-i14-synthesis-configuration.schema.json' with { type: 'json' };
import type { AutomationI14Candidates } from '../../../../contracts/analysis/automation-i14-candidates.generated.js';
import type { AutomationI14EvidenceAdmission } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import type { AutomationI14SynthesisConfiguration } from '../../../../contracts/analysis/automation-i14-synthesis-configuration.generated.js';
import type { AutomationI14SynthesisInput, CounterevidenceClaim } from '../../../../contracts/analysis/automation-i14-synthesis-input.generated.js';
import type { AutomationI14SynthesisPrompt } from '../../../../contracts/analysis/automation-i14-synthesis-prompt.generated.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import {
  AutomationI14ValidationError, buildAutomationI14EvidenceAdmission, validateAutomationI14CandidateResponse,
  MAX_I14_EVIDENCE_ADMISSION_BYTES, type AutomationI14EvidenceAdmissionInput,
} from './i14-evidence-admission.js';
import { validateAutomationSourceClaims } from './source-claims.js';
import {
  AutomationSynthesisExecutionIntegrityError, AutomationSynthesisExecutionKernel, type AutomationSynthesisAdapter,
  type AutomationSynthesisExecutionParent, type AutomationSynthesisUnknownCode,
} from './synthesis-execution.js';

export type { AutomationI14SynthesisConfiguration } from '../../../../contracts/analysis/automation-i14-synthesis-configuration.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateInputSchema = ajv.compile<AutomationI14SynthesisInput>(inputSchema);
const validateAdmissionSchema = ajv.compile<AutomationI14EvidenceAdmission>(admissionSchema);
const validatePromptSchema = ajv.compile<AutomationI14SynthesisPrompt>(promptSchema);
const validateConfigurationSchema = ajv.compile<AutomationI14SynthesisConfiguration>(configurationSchema);

export const MAX_I14_SYNTHESIS_INPUT_BYTES = 1024 * 1024;
/** Upper bound of `maxResponseBytes`; the validated envelope adds only fixed fields to a response this size. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_CANDIDATES_BYTES = MAX_RESPONSE_BYTES + 64 * 1024;
const MAX_SMALL_ARTIFACT_BYTES = 64 * 1024;
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

/** Unadopted draft encoding of the accepted I14 boundary. Retaining it records what a dispatch used; it activates nothing. */
const PROMPT: AutomationI14SynthesisPrompt = {
  contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-prompt', promptId: 'automation-i14-synthesis', promptVersion: '1.0.0',
  inputContract: { methodId: 'automation-i14-synthesis-input', methodVersion: '1.0.0' },
  responseContract: { methodId: 'automation-i14-candidates', methodVersion: '1.0.0', shape: 'JSON_OBJECT_WITH_ONLY_AI_CANDIDATES' },
  systemText: [
    'You draft I14 opportunity-direction candidates for human review. You decide nothing; every candidate stays HUMAN_REVIEW_REQUIRED.',
    'The user message is one JSON input. Use only it. Do not add outside knowledge or invent sources, products, people, quotes or facts.',
    'Each supportEligible entry is one attributed, self-reported located record that states a use context. It is not a person, segment, population or market, and entry order is not a priority.',
    'A candidate may state only a narrow conditional fit: something may fit someone in the quoted context, under stated assumptions.',
    'Do not state or imply demand, prevalence, popularity, trend, causality, superiority, size, likelihood, return or priority. Do not rank, score, weight or compare candidates, and do not recommend an action.',
    'Do not write any digit or other number character in any text field, and do not state quantities.',
    'The owner question, owner directions and owner constraints are unset. Do not invent them or present a candidate as an owner choice.',
    'citedClaimRefs must contain 1 to 20 distinct claimId values from supportEligible. counterevidenceRefs may contain up to 20 distinct claimId values from supportEligible or counterevidenceOnly, never a claim also cited as support. When a supportEligible record has counterevidenceQuotes, acknowledge those quotes in the rationale or limitations while citing that record only in citedClaimRefs; do not duplicate its claimId in counterevidenceRefs. A supportEligible record not cited as support, or a counterevidenceOnly claim that weakens the candidate, may be cited as counterevidence. An empty counterevidenceRefs means none was supplied, not that none exists.',
    'Return exactly one JSON object and nothing else, with "aiCandidates" as its only field. Return {"aiCandidates":[]} when no candidate is supported.',
    'aiCandidates holds at most 20 distinct objects. Each has exactly these fields: candidateType ("HYPOTHESIS" or "OPPORTUNITY_DIRECTION"), candidateStatus ("HUMAN_REVIEW_REQUIRED"), layer (the number 3), text, conciseEvidenceLinkedRationale, citedClaimRefs, counterevidenceRefs, assumptions (1 to 10 distinct strings), unknowns (0 to 10), evidenceGaps (0 to 10) and limitations (1 to 10). Every text value is a non-empty string of at most 1000 characters.',
    'Give only a concise evidence-linked rationale. Do not include hidden reasoning, scratch work or any other field.',
  ].join('\n'),
};
const PROMPT_BYTES = json(PROMPT);

export type AutomationI14ExecutionParent = AutomationSynthesisExecutionParent;

export interface AutomationI14TextRequest {
  readonly configuration: AutomationI14SynthesisConfiguration;
  readonly systemText: string;
  /** The exact retained synthesis-input artifact bytes as UTF-8 text. */
  readonly userText: string;
  /** Aborted on caller cancellation or `configuration.timeoutMs`. The outcome is then unknown, never retried. */
  readonly signal: AbortSignal;
}

/** Explicit text transport. It returns only the generated text; credentials and provider payloads stay inside it. */
export interface AutomationI14TextPort {
  generateText(request: AutomationI14TextRequest): Promise<{ readonly text: string }>;
}

export interface AutomationI14ExecutionRequest {
  readonly parent: AutomationI14ExecutionParent;
  /** The exact frozen inputs the owning report execution built its I14 admission from. */
  readonly admission: AutomationI14EvidenceAdmissionInput;
  /** Resolved transport and non-secret configuration, or null when AI is not configured. Never consulted to replay a settled execution. */
  readonly ai: { readonly port: AutomationI14TextPort; readonly configuration: AutomationI14SynthesisConfiguration } | null;
  readonly signal?: AbortSignal;
}

export type AutomationI14ValidationCode =
  | 'RESPONSE_NOT_TEXT' | 'RESPONSE_TOO_LARGE' | 'RESPONSE_NOT_JSON' | 'CANDIDATE_RESPONSE_FIELDS_INVALID' | 'INVALID_I14_CANDIDATES'
  | 'CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT' | 'CITED_CLAIM_NOT_ADMITTED' | 'COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE'
  | 'CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE';
/** Response-content codes the I14 adapter may report; the shared kernel classifies the RESPONSE_* transport codes. */
const VALIDATION_CODES: ReadonlySet<AutomationI14ValidationCode> = new Set<AutomationI14ValidationCode>([
  'CANDIDATE_RESPONSE_FIELDS_INVALID', 'INVALID_I14_CANDIDATES', 'CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT', 'CITED_CLAIM_NOT_ADMITTED',
  'COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE', 'CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE',
]);
export type AutomationI14UnknownCode = AutomationSynthesisUnknownCode;

/** Validated, retained candidates. Structure and references passed; every candidate stays HUMAN_REVIEW_REQUIRED. */
export interface AutomationI14RetainedCandidates {
  readonly artifact: AutomationI14Candidates;
  readonly bytes: Buffer;
  readonly sha256: string;
}

export type AutomationI14ExecutionOutcome =
  | { readonly status: 'NOT_DISPATCHED'; readonly reason: 'INSUFFICIENT_EVIDENCE' | 'AI_NOT_CONFIGURED' }
  | { readonly status: 'PREPARED'; readonly executionId: string }
  | { readonly status: 'VALID'; readonly executionId: string; readonly dispatched: boolean; readonly candidates: AutomationI14RetainedCandidates }
  | { readonly status: 'INVALID'; readonly executionId: string; readonly dispatched: boolean; readonly validationCode: AutomationI14ValidationCode }
  | { readonly status: 'DISPATCH_UNKNOWN'; readonly executionId: string; readonly dispatched: boolean; readonly unknownCode: AutomationI14UnknownCode };

export type AutomationI14ExecutionView =
  | AutomationI14ExecutionOutcome
  | { readonly status: 'ABSENT' }
  | { readonly status: 'DISPATCHING'; readonly executionId: string };

export type AutomationI14ExecutionErrorCode =
  | 'PARENT_NOT_FOUND' | 'PARENT_RUN_MISMATCH' | 'PARENT_WORKSPACE_MISMATCH' | 'PARENT_SCOPE_MISMATCH' | 'PARENT_REPORTS_EXCLUDE_INSIGHT'
  | 'PARENT_NOT_RUNNING' | 'INVALID_SYNTHESIS_CONFIGURATION' | 'SYNTHESIS_INPUT_TOO_LARGE' | 'EXECUTION_IDENTITY_CONFLICT'
  | 'EXECUTION_IN_PROGRESS' | 'ACTIVE_DISPATCH_IN_PROCESS';
export class AutomationI14ExecutionError extends Error {
  constructor(readonly code: AutomationI14ExecutionErrorCode) { super(code); }
}
export class AutomationI14ExecutionIntegrityError extends AutomationSynthesisExecutionIntegrityError {
  constructor() { super('I14 execution retained record failed integrity verification.'); }
}
const fail = (code: AutomationI14ExecutionErrorCode): never => { throw new AutomationI14ExecutionError(code); };

/** Project an admitted I14 admission into the exact model-facing input: claim ids, attribution and source quotes only. */
function synthesisInput(admission: AutomationI14EvidenceAdmission, admissionBytes: Buffer, sourceClaims: unknown): Buffer {
  const claims = new Map(validateAutomationSourceClaims(sourceClaims).claims.map((claim) => [claim.claimId, claim]));
  const supportEligible = admission.anchors.map((anchor) => ({
    claimId: anchor.claimId, sourceAttribution: anchor.declaration.sourceAttribution,
    contextFields: anchor.contextFields.map(({ field, span }) => ({ field, quote: span.quote })),
    counterevidenceQuotes: anchor.counterevidenceSpans.map(({ quote }) => quote),
  }));
  if (supportEligible.length === 0) throw new AutomationI14ValidationError('CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT');
  const input = {
    contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-input', methodVersion: '1.0.0', sectionId: 'I14',
    runId: admission.runId, workspaceId: admission.workspaceId, scopeSha256: admission.scopeSha256,
    admission: { methodId: admission.methodId, methodVersion: admission.methodVersion, admissionSha256: sha256(admissionBytes) },
    ownerQuestion: { state: 'UNSET', text: null },
    ownerConstraints: [],
    supportEligible: [supportEligible[0]!, ...supportEligible.slice(1)],
    // M05 observations are never eligible counterevidence for I14.
    counterevidenceOnly: admission.unassigned.flatMap((entry): CounterevidenceClaim[] => {
      if (entry.sectionId === 'M05') return [];
      const claim = claims.get(entry.claimId);
      if (!claim?.declaration) throw new AutomationI14ValidationError('COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE');
      return [{ claimId: entry.claimId, sectionId: entry.sectionId, reason: entry.reason as CounterevidenceClaim['reason'],
        sourceAttribution: claim.declaration.sourceAttribution, quotes: claim.source.spans.map(({ role, quote }) => ({ role, quote })) }];
    }),
    outputContract: { methodId: 'automation-i14-candidates', methodVersion: '1.0.0' },
    limitations: [
      'SUPPORT_ELIGIBLE_CLAIMS_ARE_ATTRIBUTED_SELF_REPORTED_LOCATED_RECORDS_NOT_PEOPLE_OR_POPULATIONS',
      'A_REPORTED_USE_CONTEXT_SUPPORTS_ONLY_A_NARROW_CONDITIONAL_FIT_HYPOTHESIS',
      'NOT_MARKET_DEMAND_PREVALENCE_PRODUCT_SUPERIORITY_OR_RANKED_OPPORTUNITY',
      'CLAIM_ORDER_IS_ADMISSION_ORDER_NOT_PRIORITY_OR_RANK',
      'EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS',
      'OWNER_QUESTION_DIRECTIONS_AND_CONSTRAINTS_ARE_UNSET',
    ],
  };
  if (!validateInputSchema(input)) throw new AutomationI14ValidationError(`INVALID_I14_SYNTHESIS_INPUT:${ajv.errorsText(validateInputSchema.errors)}`);
  const bytes = json(input);
  if (bytes.length > MAX_I14_SYNTHESIS_INPUT_BYTES) fail('SYNTHESIS_INPUT_TOO_LARGE');
  return bytes;
}

const isValidationCode = (code: string): code is AutomationI14ValidationCode => (VALIDATION_CODES as ReadonlySet<string>).has(code);

interface I14Types {
  readonly source: AutomationI14EvidenceAdmissionInput;
  readonly admission: AutomationI14EvidenceAdmission;
  readonly input: AutomationI14SynthesisInput;
  readonly prompt: AutomationI14SynthesisPrompt;
  readonly configuration: AutomationI14SynthesisConfiguration;
  readonly candidates: AutomationI14Candidates;
  readonly validationCode: AutomationI14ValidationCode;
}

/** I14 section adapter for the shared execution kernel: admission, input, prompt, response and replay rules only. */
const I14_ADAPTER: AutomationSynthesisAdapter<I14Types> = {
  sectionId: 'I14',
  admission: { maxBytes: MAX_I14_EVIDENCE_ADMISSION_BYTES, validate: validateAdmissionSchema },
  input: { maxBytes: MAX_I14_SYNTHESIS_INPUT_BYTES, validate: validateInputSchema },
  prompt: { maxBytes: MAX_SMALL_ARTIFACT_BYTES, validate: validatePromptSchema },
  configuration: { maxBytes: MAX_SMALL_ARTIFACT_BYTES, validate: validateConfigurationSchema },
  candidatesMaxBytes: MAX_CANDIDATES_BYTES,
  validationCodes: VALIDATION_CODES,
  promptBytes: PROMPT_BYTES,
  // An INSIGHT-section kernel never reports a Market exclusion; treat one as a defect, not a caller error.
  executionError: (code) => code === 'PARENT_REPORTS_EXCLUDE_MARKET' ? new AutomationI14ExecutionIntegrityError() : new AutomationI14ExecutionError(code),
  integrityError: () => new AutomationI14ExecutionIntegrityError(),
  build(source) {
    const { artifact: admission, bytes: admissionBytes } = buildAutomationI14EvidenceAdmission(source);
    const inputBytes = admission.status === 'USE_CONTEXT_ADMITTED' ? synthesisInput(admission, admissionBytes, source.sourceClaims) : null;
    return { admission, admissionBytes, inputBytes };
  },
  identity: ({ runId, workspaceId, scopeSha256 }) => ({ runId, workspaceId, scopeSha256 }),
  atRetainedVersion: (source, admission) => ({ ...source, admissionVersion: admission.methodVersion }),
  bindsRetained: ({ input, prompt }, expected) =>
    input.runId === expected.runId && input.workspaceId === expected.workspaceId && input.scopeSha256 === expected.scopeSha256 &&
    input.admission.admissionSha256 === expected.admissionSha256 &&
    prompt.inputContract.methodId === input.methodId && prompt.inputContract.methodVersion === input.methodVersion &&
    prompt.responseContract.methodId === 'automation-i14-candidates' && prompt.responseContract.methodVersion === '1.0.0',
  systemText: (prompt) => prompt.systemText,
  /** Only a defined `{ aiCandidates }` that passes the existing I14 validator is VALID. */
  classifyResponse(parsed, source) {
    try {
      return { status: 'VALID', candidates: validateAutomationI14CandidateResponse(parsed, source) };
    } catch (error) {
      const code = error instanceof AutomationI14ValidationError ? error.message.split(':', 1)[0]! : '';
      if (isValidationCode(code)) return { status: 'INVALID', code };
      throw error;
    }
  },
  replayCandidates(stored, source, retained) {
    const replayed = validateAutomationI14CandidateResponse({ aiCandidates: (stored as { readonly aiCandidates?: unknown } | null)?.aiCandidates }, source);
    const { artifact } = replayed;
    return artifact.admission.admissionSha256 === sha256(retained.admissionBytes) && artifact.runId === retained.admission.runId &&
      artifact.workspaceId === retained.admission.workspaceId && artifact.scopeSha256 === retained.admission.scopeSha256 ? replayed : undefined;
  },
};

/**
 * Analysis-owned I14 synthesis execution subrecord for one exact parent: the initial REPORTS step or one supplemental
 * report attempt. It retains exact input, prompt and configuration before a durable dispatch claim, makes at most one
 * dispatch per execution identity and replays a settled outcome without a call. It never publishes a report, ranks,
 * approves or records an owner direction. Do not call it while holding the database mutation mutex.
 * The lifecycle is the shared `AutomationSynthesisExecutionKernel`; this wrapper binds the I14 adapter.
 */
export class AutomationI14SynthesisExecutions {
  readonly #kernel: AutomationSynthesisExecutionKernel<I14Types>;

  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date; uuid?: () => string }) {
    this.#kernel = new AutomationSynthesisExecutionKernel({ ...options, adapter: I14_ADAPTER });
  }

  /** Write owner: prepare/claim a running parent once, or replay a settled exact-parent outcome without current AI config. */
  async execute(request: AutomationI14ExecutionRequest): Promise<AutomationI14ExecutionOutcome> {
    return this.#kernel.execute({ parent: request.parent, source: request.admission, ai: request.ai, signal: request.signal });
  }

  /** Query-only replay for report reads and PDFs. It never dispatches, settles or recovers anything. */
  async read(parent: AutomationI14ExecutionParent, admission: AutomationI14EvidenceAdmissionInput): Promise<AutomationI14ExecutionView> {
    return this.#kernel.read(parent, admission);
  }

  /**
   * Executor-start recovery, centralized for every synthesis section in this database: every claimed dispatch without
   * a settled outcome becomes terminal DISPATCH_UNKNOWN. It refuses while any section's dispatch is active in this
   * process. Only the single write owner may call it, while it holds the database mutation mutex and before it
   * requeues any report parent. PREPARED rows are left alone because nothing was dispatched.
   */
  recoverInterruptedDispatches(): number {
    return this.#kernel.recoverInterruptedDispatches();
  }

  /** Recorded I14 lifecycle only. A dispatch claim is not proof of provider receipt or billing. */
  async readActivity(workspaceId: string, runId: string) {
    const i14 = await this.#kernel.readActivity(workspaceId, runId);
    return i14 ? { i14 } : undefined;
  }
}

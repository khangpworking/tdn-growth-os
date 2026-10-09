import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import packetSchema from '../../../../contracts/analysis/automation-decision-packets.schema.json' with { type: 'json' };
import inputSchema from '../../../../contracts/analysis/automation-decision-synthesis-input.schema.json' with { type: 'json' };
import promptSchema from '../../../../contracts/analysis/automation-decision-synthesis-prompt.schema.json' with { type: 'json' };
import configurationSchema from '../../../../contracts/analysis/automation-decision-synthesis-configuration.schema.json' with { type: 'json' };
import type { AutomationDecisionPacket, AutomationDecisionCandidates } from '../../../../contracts/analysis/automation-decision-packets.generated.js';
import type { AutomationDecisionSynthesisInput } from '../../../../contracts/analysis/automation-decision-synthesis-input.generated.js';
import type { AutomationDecisionSynthesisPrompt } from '../../../../contracts/analysis/automation-decision-synthesis-prompt.generated.js';
import type { AutomationDecisionSynthesisConfiguration } from '../../../../contracts/analysis/automation-decision-synthesis-configuration.generated.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import {
  AutomationDecisionPacketValidationError, buildAutomationDecisionPacket, DECISION_CANDIDATE_TYPES, MAX_DECISION_PACKET_BYTES,
  validateAutomationDecisionCandidateResponse, verifyAutomationDecisionCandidates,
  type AutomationDecisionPacketInput, type AutomationDecisionSectionId,
} from './decision-packets.js';
import { automationDecisionSynthesisPrompt, MAX_DECISION_SYNTHESIS_INPUT_BYTES, prepareAutomationDecisionSynthesis } from './decision-synthesis-input.js';
import {
  AutomationSynthesisExecutionKernel, AutomationSynthesisExecutionError, AutomationSynthesisExecutionIntegrityError,
  type AutomationSynthesisAdapter, type AutomationSynthesisExecutionRequest, type AutomationSynthesisExecutionParent,
  type AutomationSynthesisExecutionOutcome, type AutomationSynthesisTextPort,
} from './synthesis-execution.js';

export type { AutomationDecisionSynthesisConfiguration } from '../../../../contracts/analysis/automation-decision-synthesis-configuration.generated.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(packetSchema);
const validatePacket = ajv.compile<AutomationDecisionPacket>({ $ref: `${packetSchema.$id}#/$defs/packet` });
const validateInput = ajv.compile<AutomationDecisionSynthesisInput>(inputSchema);
const validatePrompt = ajv.compile<AutomationDecisionSynthesisPrompt>(promptSchema);
const validateConfiguration = ajv.compile<AutomationDecisionSynthesisConfiguration>(configurationSchema);

const CODES = [
  'CANDIDATE_RESPONSE_FIELDS_INVALID', 'INVALID_DECISION_CANDIDATES', 'CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT',
  'CANDIDATE_TYPE_SECTION_MISMATCH', 'UNKNOWN_CLAIM_REFERENCE', 'CITED_CLAIM_NOT_ADMITTED',
  'CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE', 'COUNTEREVIDENCE_RELATION_UNBOUND', 'COUNTEREVIDENCE_RELATION_DUPLICATE',
  'COUNTEREVIDENCE_TARGET_NOT_IN_CANDIDATE', 'COUNTEREVIDENCE_RELATION_MISSING',
  'CITED_BEHAVIOR_CONTEXT_MISSING',
] as const;
/** U-07/U-16 model-response rejections. The validator keeps its precise guard code, but the retained ledger only
 * supports the stable generic decision-candidate code, so the stored verdict maps onto it. Without the mapping the
 * rejection would escape the adapter as a dispatch failure instead of being retained as INVALID. */
const VERSION_GUARD_CODES: ReadonlySet<string> = new Set([
  'CANDIDATE_COUNT_EXCEEDS_PROPOSAL_LIMIT', 'CANDIDATE_PROPOSAL_FIELDS_REQUIRED', 'PURCHASE_SUGGESTION_NOT_ALLOWED',
]);
type DecisionValidationCode = typeof CODES[number];
const validationCodes: ReadonlySet<string> = new Set(CODES);
interface DecisionAdapterTypes {
  source: AutomationDecisionPacketInput;
  admission: AutomationDecisionPacket;
  input: AutomationDecisionSynthesisInput;
  prompt: AutomationDecisionSynthesisPrompt;
  configuration: AutomationDecisionSynthesisConfiguration;
  candidates: AutomationDecisionCandidates;
  validationCode: DecisionValidationCode;
}
export type AutomationDecisionTextPort = AutomationSynthesisTextPort<AutomationDecisionSynthesisConfiguration>;
export type AutomationDecisionExecutionRequest = AutomationSynthesisExecutionRequest<AutomationDecisionPacketInput, AutomationDecisionSynthesisConfiguration>;
export type AutomationDecisionExecutionOutcome = AutomationSynthesisExecutionOutcome<AutomationDecisionCandidates, DecisionValidationCode>;

function adapter(sectionId: AutomationDecisionSectionId): AutomationSynthesisAdapter<DecisionAdapterTypes> {
  return {
    sectionId,
    admission: { maxBytes: MAX_DECISION_PACKET_BYTES, validate: (value): value is AutomationDecisionPacket => validatePacket(value) && value.sectionId === sectionId },
    input: { maxBytes: MAX_DECISION_SYNTHESIS_INPUT_BYTES, validate: (value): value is AutomationDecisionSynthesisInput => validateInput(value) && value.sectionId === sectionId },
    prompt: { maxBytes: 64 * 1024, validate: (value): value is AutomationDecisionSynthesisPrompt => validatePrompt(value) && value.sectionId === sectionId },
    configuration: { maxBytes: 64 * 1024, validate: (value): value is AutomationDecisionSynthesisConfiguration => validateConfiguration(value) && value.sectionId === sectionId },
    candidatesMaxBytes: 1024 * 1024 + 64 * 1024,
    validationCodes: new Set(CODES),
    promptBytes: automationDecisionSynthesisPrompt(sectionId).bytes,
    executionError: code => new AutomationSynthesisExecutionError(code),
    integrityError: () => new AutomationSynthesisExecutionIntegrityError(),
    build(source) {
      if (source.sectionId !== sectionId) throw new AutomationDecisionPacketValidationError('DECISION_SECTION_MISMATCH');
      const prepared = prepareAutomationDecisionSynthesis(source);
      return { admission: prepared.packet.artifact, admissionBytes: prepared.packet.bytes,
        ...(prepared.status === 'READY' ? { promptBytes: prepared.prompt.bytes } : {}),
        inputBytes: prepared.status === 'READY' ? prepared.input.bytes : null };
    },
    identity: ({ runId, workspaceId, scopeSha256 }) => ({ runId, workspaceId, scopeSha256 }),
    atRetainedVersion: (source, admission) => ({ ...source, packetVersion: admission.methodVersion, evidence: { ...source.evidence, admissionVersion: admission.useContextAdmission.methodVersion } }),
    bindsRetained({ admission, input, prompt, configuration }, expected) {
      return admission.sectionId === sectionId && input.sectionId === sectionId && prompt.sectionId === sectionId && configuration.sectionId === sectionId &&
        input.runId === expected.runId && input.workspaceId === expected.workspaceId && input.scopeSha256 === expected.scopeSha256 &&
        input.packet.packetSha256 === expected.admissionSha256 && input.packet.methodId === admission.methodId && input.packet.methodVersion === admission.methodVersion &&
        canonicalJson(input.sourceClaims) === canonicalJson(admission.sourceClaims) &&
        canonicalJson(input.useContextAdmission) === canonicalJson(admission.useContextAdmission) &&
        canonicalJson(input.authority) === canonicalJson(admission.authority) &&
        prompt.inputContract.methodId === input.methodId && prompt.inputContract.methodVersion === input.methodVersion &&
        (admission.methodVersion === '1.0.0' ? prompt.promptVersion === '1.0.0'
          : admission.methodVersion === '1.1.0' ? prompt.promptVersion === '1.1.0' || prompt.promptVersion === '1.2.0' : admission.methodVersion === '1.2.0' ? prompt.promptVersion === '1.3.0' : prompt.promptVersion === '1.4.0') &&
        input.methodVersion === admission.methodVersion &&
        canonicalJson(prompt.candidateTypes) === canonicalJson(DECISION_CANDIDATE_TYPES[sectionId]);
    },
    systemText: prompt => prompt.systemText,
    classifyResponse(parsed, source) {
      // Source defects are not model-response defects, even if a later validator
      // reuses the packet builder internally.
      buildAutomationDecisionPacket(source);
      try {
        return { status: 'VALID', candidates: validateAutomationDecisionCandidateResponse(parsed, source) };
      } catch (error) {
        const code = error instanceof AutomationDecisionPacketValidationError ? error.message.split(':')[0] : undefined;
        if (code && validationCodes.has(code)) return { status: 'INVALID', code: code as DecisionValidationCode };
        if (code && VERSION_GUARD_CODES.has(code)) return { status: 'INVALID', code: 'INVALID_DECISION_CANDIDATES' };
        throw error;
      }
    },
    replayCandidates(stored, source) {
      const artifact = verifyAutomationDecisionCandidates(stored, source);
      return { artifact, bytes: Buffer.from(`${canonicalJson(artifact)}\n`, 'utf8') };
    },
  };
}

/** One section of the existing shared ledger. No provider is enabled by constructing this owner. */
export class AutomationDecisionSynthesisExecutions {
  readonly #kernel: AutomationSynthesisExecutionKernel<DecisionAdapterTypes>;
  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date;
    uuid?: () => string; sectionId: AutomationDecisionSectionId }) {
    this.#kernel = new AutomationSynthesisExecutionKernel({ ...options, adapter: adapter(options.sectionId) });
  }
  execute(request: AutomationDecisionExecutionRequest): Promise<AutomationDecisionExecutionOutcome> { return this.#kernel.execute(request); }
  read(parent: AutomationSynthesisExecutionParent, source: AutomationDecisionPacketInput) { return this.#kernel.read(parent, source); }
  readActivity(workspaceId: string, runId: string) { return this.#kernel.readActivity(workspaceId, runId); }
  recoverInterruptedDispatches() { return this.#kernel.recoverInterruptedDispatches(); }
}

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { InsightCrosscheckSource, InsightCrosscheckCandidates, InsightCrosscheckPrompt } from '../../../../contracts/analysis/automation-insight-crosscheck.generated.js';
import type { InsightModelConfiguration } from '../../../../contracts/analysis/automation-insight-model.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { blindedCrosscheckBatch, crosscheckEligibleRecords, sampleCrosscheckRecords } from './insight-crosscheck-preparation.js';
import { composeDefaultInsightInput, sourceDefaultInsightRules, mergeInsightBatch, insightCodingDigest } from './insight-default-coding.js';
import { validateSemanticCodingResponse } from './semantic-coding-response.js';
import { insightModelPrompt, type InsightModelAI } from './insight-model-execution.js';
import { crosscheckSourceValid, crosscheckInputValid, crosscheckPromptValid, crosscheckConfigurationValid, crosscheckCandidatesValid } from './insight-crosscheck-contracts.js';
import { AutomationSynthesisExecutionKernel, AutomationSynthesisExecutionError, AutomationSynthesisExecutionIntegrityError, type AutomationSynthesisAdapter } from './synthesis-execution.js';
const json = (value: unknown) => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const MAX_BYTES = 8 * 1024 * 1024;
const prompt: InsightCrosscheckPrompt = { contractVersion: 'insight-crosscheck-prompt-v1', systemText: insightModelPrompt('insight-model-prompt-v4').systemText +
  '\nIndependent second coding of the frozen source sample. No first annotations or predictions are supplied. Use only the closed code meanings supplied, no codebook additions or changes. Return the annotations object directly. Keep uncertainty and missing/unclassifiable evidence explicit; absent annotations do not mean reviewed negatives. This is pending evidence preparation, never cross-checked release or a reliability statistic.' };
export function crosscheckBatchKey(requestKey: string, batchIndex: number) {
  if (batchIndex === 0) return requestKey;
  const digest = createHash('sha256').update(canonicalJson(['insight-crosscheck-batch-v1', requestKey, batchIndex])).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function build(source: InsightCrosscheckSource) {
  if (!crosscheckSourceValid(source) || json(source).length > MAX_BYTES || canonicalJson(source.binding) !== canonicalJson(source.request.binding) ||
    source.request.seed !== source.plan.seed || source.request.secondConfigurationSha256 !== source.plan.secondConfigurationSha256 ||
    insightCodingDigest(source.plan.secondConfiguration) !== source.plan.secondConfigurationSha256 ||
    insightCodingDigest(source.input.corpora.map(c => c.codebook)) !== source.request.codebookSha256) throw new TypeError('INVALID_INSIGHT_CROSSCHECK_SOURCE');
  const identities = (indexes: number[]) => indexes.map(recordIndex => { const record = source.input.records[recordIndex]!;
    return { recordIndex, sourceSha256: record.sourceSha256, locator: record.locator }; });
  const eligible = identities(crosscheckEligibleRecords(source.input)), sample = identities(sampleCrosscheckRecords(source.input, source.plan.seed));
  const batches = sample.reduce<number[][]>((all, row, at) => { if (at % 100 === 0) all.push([]); all.at(-1)!.push(row.recordIndex); return all; }, []);
  if (canonicalJson(eligible) !== canonicalJson(source.plan.eligible) || canonicalJson(sample) !== canonicalJson(source.plan.sample) ||
    insightCodingDigest(eligible) !== source.plan.eligibleSha256 || insightCodingDigest(sample) !== source.plan.sampleSha256 ||
    canonicalJson(batches) !== canonicalJson(source.plan.batches) || source.batchIndex >= batches.length ||
    source.plan.firstExecutions.some(row => row.configuration.providerId === source.plan.secondConfiguration.providerId && row.configuration.modelId === source.plan.secondConfiguration.modelId))
    throw new TypeError('INVALID_INSIGHT_CROSSCHECK_SOURCE');
  const input = blindedCrosscheckBatch(source.input, batches[source.batchIndex]!);
  if (!crosscheckInputValid(input) || json(input).length > 1024 * 1024) throw new TypeError('INVALID_INSIGHT_CROSSCHECK_SOURCE');
  return input;
}
function candidates(value: unknown, source: InsightCrosscheckSource): InsightCrosscheckCandidates {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !('completionText' in value) || typeof value.completionText !== 'string' ||
    Buffer.byteLength(value.completionText) > source.plan.secondConfiguration.maxResponseBytes) throw new TypeError('INVALID_INSIGHT_CROSSCHECK_RESPONSE');
  const parsed: unknown = JSON.parse(value.completionText);
  const blankInput = composeDefaultInsightInput(source.input, sourceDefaultInsightRules(source.input));
  const batchAnnotations = validateSemanticCodingResponse(parsed, blankInput, source.plan.batches[source.batchIndex]!);
  const annotations = mergeInsightBatch(batchAnnotations, source.previousSecondAnnotations, source.plan.batches[source.batchIndex]!);
  // This full composition check runs before the kernel can persist terminal VALID, including duplicate-source conflicts.
  composeDefaultInsightInput(blankInput, sourceDefaultInsightRules(blankInput), annotations);
  const result: InsightCrosscheckCandidates = { contractVersion: 'insight-crosscheck-candidates-v1', completionText: value.completionText, batchAnnotations, annotations };
  if (!crosscheckCandidatesValid(result) || json(result).length > MAX_BYTES) throw new TypeError('INVALID_INSIGHT_CROSSCHECK_RESPONSE');
  return result;
}
interface Types {
  source: InsightCrosscheckSource; admission: InsightCrosscheckSource; input: ReturnType<typeof build>;
  prompt: InsightCrosscheckPrompt; configuration: InsightModelConfiguration; candidates: InsightCrosscheckCandidates;
  validationCode: 'INVALID_INSIGHT_CODING_RESPONSE';
}
const adapter: AutomationSynthesisAdapter<Types> = {
  sectionId: 'INSIGHT_CODING', admission: { maxBytes: MAX_BYTES, validate: crosscheckSourceValid },
  input: { maxBytes: 1024 * 1024, validate: crosscheckInputValid }, prompt: { maxBytes: 256 * 1024, validate: crosscheckPromptValid },
  configuration: { maxBytes: 64 * 1024, validate: crosscheckConfigurationValid }, candidatesMaxBytes: MAX_BYTES,
  validationCodes: new Set(['INVALID_INSIGHT_CODING_RESPONSE']), promptBytes: json(prompt),
  executionError: code => new AutomationSynthesisExecutionError(code), integrityError: () => new AutomationSynthesisExecutionIntegrityError(),
  build(source) { return { admission: source, admissionBytes: json(source), inputBytes: json(build(source)) }; },
  identity: source => ({ runId: source.binding.runId, workspaceId: source.binding.workspaceId, scopeSha256: source.binding.scopeSha256 }),
  atRetainedVersion: source => source,
  bindsRetained: retained => canonicalJson(build(retained.admission)) === canonicalJson(retained.input) &&
    canonicalJson(retained.admission.plan.secondConfiguration) === canonicalJson(retained.configuration),
  systemText: value => value.systemText,
  classifyResponse(value, source) {
    build(source);
    try { const artifact = candidates(value, source); return { status: 'VALID', candidates: { artifact, bytes: json(artifact) } }; }
    catch (error) { if (!(error instanceof TypeError || error instanceof SyntaxError)) throw error; return { status: 'INVALID', code: 'INVALID_INSIGHT_CODING_RESPONSE' }; }
  },
  replayCandidates(value, source) {
    if (!crosscheckCandidatesValid(value)) return undefined;
    const artifact = candidates({ completionText: value.completionText }, source);
    return { artifact, bytes: json(artifact) };
  },
};
export class AutomationInsightCrosscheckExecution {
  readonly #kernel: AutomationSynthesisExecutionKernel<Types>;
  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now(): Date }) {
    this.#kernel = new AutomationSynthesisExecutionKernel({ ...options, adapter });
  }
  private parent(source: InsightCrosscheckSource) { return { kind: 'INSIGHT_CODING' as const, runId: source.binding.runId,
    adoptionId: source.defaultRuleId, requestKey: crosscheckBatchKey(source.request.requestKey, source.batchIndex), previousProposalId: source.request.firstProposalId }; }
  read(source: InsightCrosscheckSource) { return this.#kernel.read(this.parent(source), source); }
  execute(source: InsightCrosscheckSource, ai: InsightModelAI, signal?: AbortSignal) {
    const wrapped = ai ? { configuration: ai.configuration, port: { async generateText(request: Parameters<typeof ai.port.generateText>[0]) {
      const response = await ai.port.generateText(request);
      // This trusted envelope is created by the transport, never requested from or trusted to the model.
      return { text: canonicalJson({ completionText: response.text }) };
    } } } : null;
    return this.#kernel.execute({ parent: this.parent(source), source, ai: wrapped, signal });
  }
}

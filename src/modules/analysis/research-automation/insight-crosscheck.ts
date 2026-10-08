import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { InsightCrosscheckRequest, InsightCrosscheckSource, InsightCrosscheckSnapshot } from '../../../../contracts/analysis/automation-insight-crosscheck.generated.js';
import type { ResearchInsightCrosscheckResponse } from '../../../../contracts/api/research-automation-insight-crosscheck-api.generated.js';
import type { InsightProposedAnnotations } from '../../../../contracts/analysis/automation-insight-coding.generated.js';
import type { InsightModelAI } from './insight-model-execution.js';
import type { AutomationInsightCoding } from './insight-coding.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { insightCodingDigest } from './insight-default-coding.js';
import { crosscheckEligibleRecords, sampleCrosscheckRecords, literalCrosscheckRows, CROSSCHECK_SAMPLE_VERSION } from './insight-crosscheck-preparation.js';
import { AutomationInsightCrosscheckExecution } from './insight-crosscheck-execution.js';
import { crosscheckRequestValid, crosscheckSourceValid, crosscheckConfigurationValid, crosscheckSnapshotValid } from './insight-crosscheck-contracts.js';
import { ResearchAutomationValidationError, ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError } from './model.js';
const MAX_BYTES = 8 * 1024 * 1024;
const blank = (): InsightProposedAnnotations => ({ i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] });
const invalid = (message: string): never => { throw new ResearchAutomationValidationError(message); };
function corrupt(): never { throw new ResearchAutomationIntegrityError('Crosscheck retained evidence failed verification.'); }
function conflict(): never { throw new ResearchAutomationConflictError('revision_conflict', 'Crosscheck source, request, actor or model configuration differs.'); }
type Lineage = Awaited<ReturnType<AutomationInsightCoding['readDefaultModelLineage']>>;
type Options = { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now(): Date;
  readLineage: AutomationInsightCoding['readDefaultModelLineage'] };

/** Existing Insight owning service uses this bounded execution preparation; the synthesis kernel is its only writer. */
export class AutomationInsightCrosscheck {
  readonly execution: AutomationInsightCrosscheckExecution;
  constructor(private readonly options: Options) { this.execution = new AutomationInsightCrosscheckExecution(options); }
  private async readSource(requestKey: string): Promise<InsightCrosscheckSource | null> {
    const row = this.options.db.prepare(`SELECT admission_sha256 FROM analysis_research_automation_ai_executions WHERE coding_request_key=?`).get(requestKey) as { admission_sha256: string } | undefined;
    if (!row) return null;
    const source = await this.readJson(row.admission_sha256, MAX_BYTES);
    if (!crosscheckSourceValid(source) || source.batchIndex !== 0 || source.request.requestKey !== requestKey) conflict();
    return source as InsightCrosscheckSource;
  }
  private async readJson(digest: string, limit: number): Promise<unknown> {
    const manifest = this.options.db.prepare('SELECT * FROM artifact_manifests WHERE sha256=?').get(digest) as Record<string, unknown> | undefined;
    if (!manifest || manifest.media_type !== 'application/json' || manifest.retention_status !== 'active' || manifest.contract_version !== '1.0.0' ||
      manifest.relative_path !== `sha256/${digest.slice(0,2)}/${digest}` || Number(manifest.byte_size) > limit || !String(manifest.acquired_at ?? '').trim()) corrupt();
    try {
      const bytes = await this.options.artifactStore.read(digest, { maxBytes: limit });
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      if (bytes.length !== Number(manifest.byte_size) || bytes.toString('utf8') !== `${canonicalJson(value)}\n`) corrupt();
      return value;
    } catch { return corrupt(); }
  }
  private firstReferences(lineage: Lineage) {
    return lineage.executions.map(execution => {
      const row = this.options.db.prepare(`SELECT evidence_id,artifact_sha256 FROM analysis_insight_coding_evidence
        WHERE request_key=? AND kind='PROPOSAL'`).get(execution.admission.value.request.requestKey) as { evidence_id: string; artifact_sha256: string } | undefined;
      if (!row) corrupt();
      return { executionId: execution.executionId, proposalId: row.evidence_id, proposalSha256: row.artifact_sha256,
        admissionSha256: execution.admission.sha256, inputSha256: execution.input.sha256, promptSha256: execution.prompt.sha256,
        configurationSha256: execution.configuration.sha256, configuration: execution.configuration.value, candidatesSha256: execution.candidates.sha256 };
    });
  }
  private async verifyFirst(source: InsightCrosscheckSource, current: boolean) {
    const lineage = await this.options.readLineage(source.binding.workspaceId, source.binding.runId, source.binding,
      { contractVersion: 'insight-default-draft-select-v1', proposalId: source.request.firstProposalId, proposalSha256: source.request.firstProposalSha256 }, current);
    if (lineage.root.evidenceId !== source.defaultRuleId || insightCodingDigest(lineage.root) !== source.defaultRuleSha256 ||
      canonicalJson(lineage.input) !== canonicalJson(source.input) || canonicalJson(this.firstReferences(lineage)) !== canonicalJson(source.plan.firstExecutions) ||
      lineage.codebookSha256 !== source.request.codebookSha256) corrupt();
  }
  async prepare(workspaceId: string, runId: string, value: unknown, owner: { actorId: string; role: 'OWNER' }, ai: InsightModelAI, signal?: AbortSignal): Promise<ResearchInsightCrosscheckResponse> {
    if (owner.role !== 'OWNER' || !owner.actorId.trim() || owner.actorId.length > 200 || !crosscheckRequestValid(value)) invalid('Invalid authenticated crosscheck request.');
    const request = structuredClone(value as InsightCrosscheckRequest);
    if (request.binding.workspaceId !== workspaceId || request.binding.runId !== runId) invalid('Crosscheck workspace/run binding differs.');
    signal?.throwIfAborted();
    let source = await this.readSource(request.requestKey);
    const exactRetry = source !== null;
    if (source) {
      if (canonicalJson(source.request) !== canonicalJson(request) || source.actorId !== owner.actorId) conflict();
      await this.verifyFirst(source, false);
    } else {
      if (!ai || !crosscheckConfigurationValid(ai.configuration)) invalid('Independent second model configuration is required.');
      if (insightCodingDigest(ai!.configuration) !== request.secondConfigurationSha256) conflict();
      const lineage = await this.options.readLineage(workspaceId, runId, request.binding,
        { contractVersion: 'insight-default-draft-select-v1', proposalId: request.firstProposalId, proposalSha256: request.firstProposalSha256 }, true);
      if (lineage.codebookSha256 !== request.codebookSha256) conflict();
      if (lineage.executions.some(row => row.configuration.value.providerId === ai!.configuration.providerId && row.configuration.value.modelId === ai!.configuration.modelId))
        invalid('Second provider/model identity must differ from every retained first execution.');
      const identities = (indexes: number[]) => indexes.map(recordIndex => { const row = lineage.input.records[recordIndex]!; return { recordIndex, sourceSha256: row.sourceSha256, locator: row.locator }; });
      const eligible = identities(crosscheckEligibleRecords(lineage.input)), sample = identities(sampleCrosscheckRecords(lineage.input, request.seed));
      if (!sample.length) return { contractVersion: 'insight-crosscheck-response-v1', status: 'NOT_DISPATCHED', requestKey: request.requestKey, reason: 'INSUFFICIENT_EVIDENCE' };
      const batches = sample.reduce<number[][]>((all, row, index) => { if (index % 100 === 0) all.push([]); all.at(-1)!.push(row.recordIndex); return all; }, []);
      source = { contractVersion: 'insight-crosscheck-source-v1', request, binding: request.binding, actorId: owner.actorId,
        defaultRuleId: lineage.root.evidenceId, defaultRuleSha256: insightCodingDigest(lineage.root), input: lineage.input, batchIndex: 0, previousSecondAnnotations: blank(),
        plan: { sampleVersion: CROSSCHECK_SAMPLE_VERSION, seed: request.seed, eligible, eligibleSha256: insightCodingDigest(eligible), sample, sampleSha256: insightCodingDigest(sample),
          batches, firstExecutions: this.firstReferences(lineage), secondConfiguration: structuredClone(ai!.configuration), secondConfigurationSha256: request.secondConfigurationSha256 } };
    }
    return this.run(source!, exactRetry, ai, signal, true);
  }
  async read(workspaceId: string, runId: string, requestKey: string): Promise<ResearchInsightCrosscheckResponse> {
    const source = await this.readSource(requestKey);
    if (!source || source.binding.workspaceId !== workspaceId || source.binding.runId !== runId)
      throw new ResearchAutomationNotFoundError('insight_coding_not_found', 'Crosscheck was not found.');
    await this.verifyFirst(source, false);
    return this.run(source, true, null, undefined, false);
  }
  private async run(initial: InsightCrosscheckSource, exactRetry: boolean, ai: InsightModelAI, signal: AbortSignal | undefined, dispatch: boolean): Promise<ResearchInsightCrosscheckResponse> {
    const requestKey = initial.request.requestKey;
    const secondExecutions: InsightCrosscheckSnapshot['secondExecutions'] = [];
    let annotations = blank();
    for (let batchIndex = 0; batchIndex < initial.plan.batches.length; batchIndex++) {
      const source = { ...initial, batchIndex, previousSecondAnnotations: annotations };
      let outcome = await this.execution.read(source);
      if (outcome.status === 'ABSENT' || outcome.status === 'PREPARED') {
        if (!dispatch) return { contractVersion: 'insight-crosscheck-response-v1', status: batchIndex ? 'INCOMPLETE' : 'PREPARED', requestKey,
          executionId: 'executionId' in outcome ? outcome.executionId : secondExecutions.at(-1)!.executionId };
        signal?.throwIfAborted();
        if (!ai || canonicalJson(ai.configuration) !== canonicalJson(initial.plan.secondConfiguration)) conflict();
        await this.verifyFirst(initial, true);
        outcome = await this.execution.execute(source, ai, signal);
      }
      if (outcome.status === 'NOT_DISPATCHED') return { contractVersion: 'insight-crosscheck-response-v1', status: 'NOT_DISPATCHED', requestKey, reason: outcome.reason };
      if (outcome.status === 'INVALID') return { contractVersion: 'insight-crosscheck-response-v1', status: 'INVALID', requestKey, executionId: outcome.executionId, code: outcome.validationCode, rawCompletion: 'NOT_RETAINED' };
      if (outcome.status === 'DISPATCH_UNKNOWN') return { contractVersion: 'insight-crosscheck-response-v1', status: 'DISPATCH_UNKNOWN', requestKey, executionId: outcome.executionId, code: outcome.unknownCode, rawCompletion: 'NOT_RETAINED' };
      if (outcome.status !== 'VALID') {
        return { contractVersion: 'insight-crosscheck-response-v1', status: outcome.status, requestKey, executionId: outcome.executionId };
      }
      annotations = outcome.candidates.artifact.annotations;
      const row = this.options.db.prepare(`SELECT admission_sha256,input_sha256,prompt_sha256,configuration_sha256,candidates_sha256
        FROM analysis_research_automation_ai_executions WHERE execution_id=?`).get(outcome.executionId) as Record<string, string>;
      secondExecutions.push({ executionId: outcome.executionId, admissionSha256: row.admission_sha256!, inputSha256: row.input_sha256!,
        promptSha256: row.prompt_sha256!, configurationSha256: row.configuration_sha256!, candidatesSha256: row.candidates_sha256! });
    }
    const snapshot: InsightCrosscheckSnapshot = { contractVersion: 'insight-crosscheck-snapshot-v1', request: initial.request, actorId: initial.actorId,
      defaultRuleId: initial.defaultRuleId, defaultRuleSha256: initial.defaultRuleSha256, plan: initial.plan, secondExecutions, secondAnnotations: annotations,
      literalRows: literalCrosscheckRows(initial.input, initial.plan.sample.map(row => row.recordIndex), annotations),
      firstWireCompletion: 'NOT_RETAINED_BY_ORIGINAL_EXECUTION', releaseState: 'U11_STATISTIC_UNAVAILABLE' };
    if (!crosscheckSnapshotValid(snapshot) || Buffer.byteLength(canonicalJson(snapshot)) > 32 * 1024 * 1024) corrupt();
    return { contractVersion: 'insight-crosscheck-response-v1', status: 'VALID', requestKey, snapshotSha256: insightCodingDigest(snapshot), snapshot, exactRetry };
  }
}

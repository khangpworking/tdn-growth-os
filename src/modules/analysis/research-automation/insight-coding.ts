import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import schema from '../../../../contracts/analysis/automation-insight-coding.schema.json' with { type: 'json' };
import locatedSchema from '../../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import selectionSchema from '../../../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import reportRevisionSchema from '../../../../contracts/analysis/automation-insight-report-revision.schema.json' with { type: 'json' };
import classifiedRevisionSchema from '../../../../contracts/analysis/automation-classified-report-revision.schema.json' with { type: 'json' };
import snapshotSchema from '../../../../contracts/analysis/automation-insight-coding-snapshot.schema.json' with { type: 'json' };
import type {
  AutomationInsightCodingAcceptedSnapshot,
  AutomationInsightCodingDraftSnapshot,
  AutomationInsightCodingFamilyDraftSnapshot, AutomationInsightCodingDefaultDraftSnapshot,
  AutomationInsightCodingSnapshot,
} from '../../../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import type { InsightReportSelection, InsightDraftSelection, InsightDefaultDraftSelection } from '../../../../contracts/analysis/automation-insight-report-revision.generated.js';
import type { InsightCodingAdoptRequest, InsightCodingProposeRequest, InsightCodingAcceptRequest, InsightCodingEvidence, InsightSourceBinding, InsightDefaultCodingEvidence, InsightDefaultRuleRequest, InsightDefaultCodingProposeRequest } from '../../../../contracts/analysis/automation-insight-coding.generated.js';
import type { AutomationInsightSelection } from '../../../../contracts/analysis/automation-insight-selection.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput, buildLocatedInsightMethods } from '../located-insight-methods.js';
import { projectSelectedInsightCandidates, projectDraftInsightGroupCounts } from './selected-insight-projection.js';
import { sourceDefaultInsightRules, composeDefaultInsightInput, appendDefaultCodebooks, mergeInsightBatch, insightCodingDigest, DEFAULT_INSIGHT_POLICY } from './insight-default-coding.js';
import { proposeLiteralCodebook } from './literal-codebook-proposal.js';
import { AutomationInsightModelExecution, AutomationInsightDefaultModelExecution, validateInsightDefaultModelRequest, validateInsightModelRequest, type InsightModelAI } from './insight-model-execution.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema(locatedSchema); ajv.addSchema(selectionSchema); ajv.addSchema(schema);
ajv.addSchema(classifiedRevisionSchema); ajv.addSchema(reportRevisionSchema);
const snapshotValid = ajv.compile<AutomationInsightCodingSnapshot>(snapshotSchema);
const adoptValid = ajv.compile<InsightCodingAdoptRequest>({ $ref: `${schema.$id}#/$defs/adopt` });
const proposeValid = ajv.compile<InsightCodingProposeRequest>({ $ref: `${schema.$id}#/$defs/propose` });
type LiteralRequest = Omit<InsightCodingProposeRequest, 'contractVersion' | 'annotations'> & { contractVersion: 'insight-coding-literal-propose-v1' };
const literalValid = ajv.compile<LiteralRequest>({ $ref: `${schema.$id}#/$defs/literalPropose` });
const acceptValid = ajv.compile<InsightCodingAcceptRequest>({ $ref: `${schema.$id}#/$defs/accept` });
const evidenceValid = ajv.compile<Evidence>({ oneOf: [{ $ref: `${schema.$id}#/$defs/evidence` }, { $ref: `${schema.$id}#/$defs/defaultEvidence` }] });
const json = canonicalJson;
const hash = (value: unknown): string => createHash('sha256').update(json(value)).digest('hex');
const clone = <T>(value: T): T => JSON.parse(json(value)) as T;
export const MAX_INSIGHT_CODING_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = MAX_INSIGHT_CODING_BYTES;
// One pair view is bounded explicitly; an over-limit history is rejected, never truncated.
const MAX_VIEW_EVIDENCE = 1000;
const MAX_VIEW_BYTES = 32 * 1024 * 1024;
function invalid(): never { throw new ResearchAutomationValidationError('Invalid source-bound Insight coding request.'); }
function corrupt(): never { throw new ResearchAutomationIntegrityError('Insight coding evidence failed verification.'); }
function conflict(): never { throw new ResearchAutomationConflictError('revision_conflict', 'Insight source, rules or proposal changed. Reload before confirming.'); }
function tooLarge(): never { throw new ResearchAutomationConflictError('invalid_state', 'Insight coding history exceeds the bounded pair view.'); }
type Evidence = InsightCodingEvidence | InsightDefaultCodingEvidence;
type Request = Evidence['request'];
type Kind = 'ADOPTION' | 'PROPOSAL' | 'RECEIPT';
interface Row { evidence_id: string; kind: Kind; run_id: string; pair_sha256: string; parent_id: string | null; request_key: string; sequence: number | bigint; artifact_sha256: string; artifact_json: string }
interface Owner { actorId: string; role: 'OWNER' }
export interface InsightSourceContext { binding: InsightSourceBinding; input: LocatedInsightMethods['input']; verifiedPlatform?: 'SHOPEE' }
type SourceReads = Map<string, Promise<InsightSourceContext>>;
interface Options {
  db: Database.Database; artifacts: ContentAddressedArtifactStore; staging?: RequestScopedArtifactStore;
  context(workspaceId: string, runId: string, pairId: string): Promise<InsightSourceContext>;
  assertCurrent(binding: InsightSourceBinding): Promise<void>; now(): Date;
}
const kindOf = (request: Request): Kind => request.contractVersion === 'insight-coding-adopt-v1' || request.contractVersion === 'insight-coding-default-rule-v1' ? 'ADOPTION' : request.contractVersion === 'insight-coding-propose-v1' || request.contractVersion === 'insight-coding-default-propose-v1' ? 'PROPOSAL' : 'RECEIPT';
const publicKind = (request: Request) => request.contractVersion === 'insight-coding-default-rule-v1' ? 'DEFAULT_RULE' as const : kindOf(request);

/** Owns exact Insight rules, proposals and selected receipts; never runs a provider or approves a report. */
export class AutomationInsightCoding {
  constructor(private readonly options: Options) {}

  async adopt(workspaceId: string, runId: string, value: unknown, owner: Owner) {
    this.owner(owner); if (!adoptValid(value)) invalid();
    const request = clone(value);
    return this.write(workspaceId, runId, request, owner, async () => {
      const context = await this.context(workspaceId, runId, request.binding.pairId);
      if (json(context.binding) !== json(request.binding)) conflict();
      await this.options.assertCurrent(context.binding);
      const previous = this.options.db.prepare(`SELECT * FROM analysis_insight_coding_evidence WHERE run_id=? AND pair_sha256=? AND kind='ADOPTION'
        AND json_extract(artifact_json,'$.request.contractVersion')='insight-coding-adopt-v1'
        AND json_extract(artifact_json,'$.request.rules.ruleId')=? ORDER BY json_extract(artifact_json,'$.request.rules.revision') DESC LIMIT 1`)
        .get(runId, context.binding.pairId, request.rules.ruleId) as Row | undefined;
      if (previous) {
        const prior = await this.read(previous.evidence_id, workspaceId, runId);
        if (prior.request.contractVersion !== 'insight-coding-adopt-v1') corrupt();
        if (request.rules.revision <= prior.request.rules.revision) conflict();
      }
      this.compose(context, request);
      return { binding: context.binding, parent: null, sequence: 1 };
    });
  }

  async propose(workspaceId: string, runId: string, value: unknown, owner: Owner) {
    this.owner(owner); if (!proposeValid(value)) invalid();
    const request = clone(value);
    return this.write(workspaceId, runId, request, owner, async () => {
      const adoption = await this.read(request.adoptionId, workspaceId, runId);
      if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') invalid();
      await this.currentAdoption(adoption);
      const prior = this.latest(request.adoptionId, 'PROPOSAL');
      if ((prior?.evidence_id ?? null) !== request.previousProposalId) conflict();
      if (prior) await this.read(prior.evidence_id, workspaceId, runId);
      this.compose(await this.context(workspaceId, runId, adoption.binding.pairId), adoption.request, request);
      return { binding: adoption.binding, parent: adoption, sequence: Number(prior?.sequence ?? 0) + 1 };
    });
  }

  async proposeLiteral(workspaceId: string, runId: string, value: unknown, owner: Owner) {
    this.owner(owner); if (!literalValid(value)) invalid();
    const request = clone(value);
    const adoption = await this.read(request.adoptionId, workspaceId, runId);
    if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') invalid();
    let previous: InsightCodingProposeRequest | undefined;
    if (request.previousProposalId !== null) {
      const evidence = await this.read(request.previousProposalId, workspaceId, runId);
      if (evidence.request.contractVersion !== 'insight-coding-propose-v1' || evidence.request.adoptionId !== request.adoptionId) invalid();
      previous = evidence.request;
    }
    const context = await this.context(workspaceId, runId, adoption.binding.pairId);
    const annotations = proposeLiteralCodebook(this.compose(context, adoption.request), previous?.annotations);
    // Same persistence/receipt path as authored proposals. Currency is checked
    // under its write lock; an exact historical retry remains available.
    return this.propose(workspaceId, runId, { ...request, contractVersion: 'insight-coding-propose-v1', annotations }, owner);
  }

  /** Explicit bounded model request. Only the existing proposal owner may publish
   * the pending result; neither dispatch nor VALID grants acceptance. */
  async proposeModel(workspaceId: string, runId: string, value: unknown, owner: Owner, ai: InsightModelAI, signal?: AbortSignal) {
    this.owner(owner);
    if (!validateInsightModelRequest(value) || !this.options.staging) invalid();
    const request = clone(value); request.recordIndexes.sort((a, b) => a - b);
    // Do not pay for a model request using an identity already consumed by a
    // manually authored action. A retained model retry owns both records.
    const usedKey = this.options.db.prepare('SELECT evidence_id FROM analysis_insight_coding_evidence WHERE request_key=?').get(request.requestKey);
    if (usedKey && !this.options.db.prepare('SELECT execution_id FROM analysis_research_automation_ai_executions WHERE coding_request_key=?').get(request.requestKey)) conflict();
    const adoption = await this.read(request.adoptionId, workspaceId, runId);
    if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') invalid();
    let previous: InsightCodingProposeRequest | undefined;
    if (request.previousProposalId !== null) {
      const evidence = await this.read(request.previousProposalId, workspaceId, runId);
      if (evidence.request.contractVersion !== 'insight-coding-propose-v1' || evidence.request.adoptionId !== request.adoptionId) invalid();
      previous = evidence.request;
    }
    const context = await this.context(workspaceId, runId, adoption.binding.pairId);
    const execution = new AutomationInsightModelExecution({ db: this.options.db, artifactStore: this.options.artifacts, now: this.options.now });
    const outcome = await execution.execute({ contractVersion: 'insight-model-source-v1', request, binding: adoption.binding,
      adoptionSha256: hash(adoption), actorId: owner.actorId, input: this.compose(context, adoption.request) }, ai, signal);
    if (outcome.status !== 'VALID') return { execution: outcome };
    const annotations = clone(outcome.candidates.artifact);
    // Each request replaces only its explicit record batch. Other proposal rows
    // remain intact, and the full source corpus remains the denominator universe.
    const batch = new Set(request.recordIndexes);
    if (previous) {
      for (const family of ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions'] as const) {
        const kept = (previous.annotations[family] ?? []).filter(row => !batch.has(row.recordIndex));
        Object.assign(annotations, { [family]: [...kept, ...annotations[family]!] });
      }
      for (const old of previous.annotations.corpora) {
        const current = annotations.corpora.find(item => item.corpusIndex === old.corpusIndex);
        const retained = { corpusIndex: old.corpusIndex,
          assignments: old.assignments.filter(row => !batch.has(row.recordIndex)),
          dispositions: old.dispositions.filter(row => !batch.has(row.recordIndex)) };
        if (current) {
          current.assignments.unshift(...retained.assignments); current.dispositions.unshift(...retained.dispositions);
        } else annotations.corpora.push(retained);
      }
    }
    // Currency/predecessor is checked again under the proposal transaction after
    // the model returns. A stale result is retained, never forced into a new pair.
    const proposal = await this.propose(workspaceId, runId, { contractVersion: 'insight-coding-propose-v1',
      requestKey: request.requestKey, adoptionId: request.adoptionId, previousProposalId: request.previousProposalId, annotations }, owner);
    return { execution: outcome, proposal };
  }

  /** Explicit default action; no human adoption, selection receipt or implicit model permission. */
  async proposeDefaultModel(workspaceId: string, runId: string, value: unknown, owner: Owner, ai: InsightModelAI, signal?: AbortSignal) {
    this.owner(owner);
    if (!validateInsightDefaultModelRequest(value) || !this.options.staging) invalid();
    signal?.throwIfAborted();
    const request = clone(value); request.recordIndexes.sort((a, b) => a - b);
    const context = await this.context(workspaceId, runId, request.binding.pairId);
    if (json(context.binding) !== json(request.binding)) conflict();
    for (const index of request.recordIndexes) if (!context.input.records[index] || context.input.records[index]!.disposition !== 'INCLUDED' || context.input.records[index]!.text === null) invalid();
    const used = this.options.db.prepare('SELECT evidence_id FROM analysis_insight_coding_evidence WHERE request_key=?').get(request.requestKey);
    if (used && !this.options.db.prepare('SELECT execution_id FROM analysis_research_automation_ai_executions WHERE coding_request_key=?').get(request.requestKey)) conflict();
    let root: Evidence;
    if (request.defaultRuleId === null) {
      // Stable subordinate identity shares the existing immutable request ledger, never a parallel store.
      const digest = hash({ policy: DEFAULT_INSIGHT_POLICY, requestKey: request.requestKey });
      const rootKey = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
      const rootRequest: InsightDefaultRuleRequest = { contractVersion: 'insight-coding-default-rule-v1', kind: 'DEFAULT_RULE', status: 'PROPOSED',
        requestKey: rootKey, originatingRequestKey: request.requestKey, binding: context.binding, policyVersion: DEFAULT_INSIGHT_POLICY, rules: sourceDefaultInsightRules(context.input) };
      root = (await this.write(workspaceId, runId, rootRequest, owner, async () => {
        await this.options.assertCurrent(context.binding);
        return { binding: context.binding, parent: null, sequence: 1 };
      })).evidence;
    } else root = await this.read(request.defaultRuleId, workspaceId, runId);
    if (root.request.contractVersion !== 'insight-coding-default-rule-v1' || json(root.binding) !== json(request.binding) ||
      (request.defaultRuleSha256 !== null && hash(root) !== request.defaultRuleSha256)) invalid();
    let previous: InsightDefaultCodingProposeRequest | undefined;
    if (request.previousProposalId !== null) {
      const prior = await this.read(request.previousProposalId, workspaceId, runId);
      if (prior.request.contractVersion !== 'insight-coding-default-propose-v1' || prior.request.defaultRuleId !== root.evidenceId || hash(prior) !== request.previousProposalSha256) invalid();
      previous = prior.request;
    }
    const rules = previous?.rules ?? root.request.rules;
    const input = composeDefaultInsightInput(context.input, rules);
    const source = { contractVersion: 'insight-default-model-source-v1' as const, request, binding: context.binding,
      defaultRuleId: root.evidenceId, defaultRuleSha256: hash(root), codebookSha256: hash(input.corpora.map(corpus => corpus.codebook)), actorId: owner.actorId, input };
    const execution = new AutomationInsightDefaultModelExecution({ db: this.options.db, artifactStore: this.options.artifacts, now: this.options.now });
    const outcome = await execution.execute(source, ai, signal);
    if (outcome.status !== 'VALID') return { execution: outcome };
    const coded = appendDefaultCodebooks(input, outcome.candidates.artifact.codebooks, request.recordIndexes);
    const proposedRules = clone(rules); proposedRules.corpora = coded.corpora.map(corpus => ({ ...corpus, assignments: [] as [], dispositions: [] as [] }));
    const annotations = mergeInsightBatch(outcome.candidates.artifact.annotations, previous?.annotations, request.recordIndexes);
    const proposalRequest: InsightDefaultCodingProposeRequest = { contractVersion: 'insight-coding-default-propose-v1', status: 'PROPOSED',
      requestKey: request.requestKey, defaultRuleId: root.evidenceId, defaultRuleSha256: hash(root), previousProposalId: request.previousProposalId,
      previousProposalSha256: request.previousProposalSha256, executionId: outcome.executionId, recordIndexes: request.recordIndexes as [number, ...number[]],
      rules: proposedRules, codebookSha256: hash(proposedRules.corpora.map(corpus => corpus.codebook)), annotations };
    const proposal = await this.write(workspaceId, runId, proposalRequest, owner, async () => {
      await this.options.assertCurrent(root.binding);
      const prior = this.latest(root.evidenceId, 'PROPOSAL');
      if ((prior?.evidence_id ?? null) !== request.previousProposalId) conflict();
      composeDefaultInsightInput(context.input, proposedRules, annotations);
      return { binding: root.binding, parent: root, sequence: Number(prior?.sequence ?? 0) + 1 };
    });
    return { execution: outcome, proposal };
  }

  private async verifyDefaultEvidence(value: Evidence, row: Row, context: InsightSourceContext, sourceReads: SourceReads) {
    const request = value.request;
    if (request.contractVersion === 'insight-coding-default-rule-v1') {
      if (row.parent_id !== null || value.parentSha256 !== null || Number(row.sequence) !== 1 || json(request.binding) !== json(value.binding) ||
        json(request.rules) !== json(sourceDefaultInsightRules(context.input))) corrupt();
      return;
    }
    if (request.contractVersion !== 'insight-coding-default-propose-v1' || row.parent_id !== request.defaultRuleId || row.parent_id === value.evidenceId) corrupt();
    const rootRow = this.row(request.defaultRuleId);
    if (!rootRow || rootRow.kind !== 'ADOPTION' || rootRow.parent_id !== null) corrupt();
    const root = await this.read(request.defaultRuleId, value.binding.workspaceId, value.binding.runId, false, sourceReads);
    if (root.request.contractVersion !== 'insight-coding-default-rule-v1' || hash(root) !== request.defaultRuleSha256 || value.parentSha256 !== hash(root) || json(root.binding) !== json(value.binding)) corrupt();
    const priorRow = this.options.db.prepare(`SELECT * FROM analysis_insight_coding_evidence WHERE parent_id=? AND kind='PROPOSAL' AND sequence=?`)
      .get(root.evidenceId, Number(row.sequence) - 1) as Row | undefined;
    if ((priorRow?.evidence_id ?? null) !== request.previousProposalId || (Number(row.sequence) > 1 && !priorRow)) corrupt();
    let previous: InsightDefaultCodingProposeRequest | undefined;
    if (priorRow) {
      const prior = await this.read(priorRow.evidence_id, value.binding.workspaceId, value.binding.runId, false, sourceReads);
      if (prior.request.contractVersion !== 'insight-coding-default-propose-v1' || hash(prior) !== request.previousProposalSha256) corrupt();
      previous = prior.request;
    } else if (request.previousProposalSha256 !== null) corrupt();
    const rules = previous?.rules ?? root.request.rules;
    const input = composeDefaultInsightInput(context.input, rules);
    const first = root.request.originatingRequestKey === request.requestKey;
    const source = { contractVersion: 'insight-default-model-source-v1' as const, binding: value.binding, defaultRuleId: root.evidenceId,
      defaultRuleSha256: hash(root), codebookSha256: hash(input.corpora.map(corpus => corpus.codebook)), actorId: value.actorId, input,
      request: { contractVersion: 'insight-default-model-request-v1' as const, requestKey: request.requestKey, binding: value.binding,
        defaultRuleId: first ? null : root.evidenceId, defaultRuleSha256: first ? null : hash(root), previousProposalId: request.previousProposalId,
        previousProposalSha256: request.previousProposalSha256, recordIndexes: request.recordIndexes } };
    const outcome = await new AutomationInsightDefaultModelExecution({ db: this.options.db, artifactStore: this.options.artifacts, now: this.options.now }).read(source);
    if (outcome.status !== 'VALID' || outcome.executionId !== request.executionId) corrupt();
    const coded = appendDefaultCodebooks(input, outcome.candidates.artifact.codebooks, request.recordIndexes);
    const expectedRules = clone(rules); expectedRules.corpora = coded.corpora.map(corpus => ({ ...corpus, assignments: [] as [], dispositions: [] as [] }));
    if (json(expectedRules) !== json(request.rules) || hash(request.rules.corpora.map(corpus => corpus.codebook)) !== request.codebookSha256 ||
      json(mergeInsightBatch(outcome.candidates.artifact.annotations, previous?.annotations, request.recordIndexes)) !== json(request.annotations)) corrupt();
    composeDefaultInsightInput(context.input, request.rules, request.annotations);
  }

  async reportDefaultDraftSnapshot(workspaceId: string, runId: string, pairId: string, draft: InsightDefaultDraftSelection, current = false): Promise<AutomationInsightCodingDefaultDraftSnapshot> {
    const proposal = await this.read(draft.proposalId, workspaceId, runId);
    if (proposal.request.contractVersion !== 'insight-coding-default-propose-v1' || hash(proposal) !== draft.proposalSha256) invalid();
    if (proposal.binding.pairId !== pairId) conflict();
    if (current) await this.options.assertCurrent(proposal.binding);
    const context = await this.context(workspaceId, runId, pairId);
    const input = composeDefaultInsightInput(context.input, proposal.request.rules, proposal.request.annotations);
    input.semanticsVersion = '1.1.0'; input.draftCountsVersion = 'draft-counts-v2';
    const { output } = buildLocatedInsightMethods(input);
    const snapshot: AutomationInsightCodingDefaultDraftSnapshot = { contractVersion: 'automation-insight-coding-snapshot-v4', binding: proposal.binding,
      selection: { proposalId: proposal.evidenceId, receiptIds: [] }, proposalSha256: hash(proposal), receipts: [], draftSelection: clone(draft),
      defaultRuleId: proposal.request.defaultRuleId, defaultRuleSha256: proposal.request.defaultRuleSha256, codebookSha256: proposal.request.codebookSha256,
      executionId: proposal.request.executionId, output, groupCounts: projectDraftInsightGroupCounts(output, context.verifiedPlatform) };
    if (!snapshotValid(snapshot)) corrupt();
    return snapshot;
  }
  async verifyReportDefaultDraftSnapshot(value: unknown, workspaceId: string, runId: string, pairId: string, draft: InsightDefaultDraftSelection) {
    if (!snapshotValid(value) || json(value) !== json(await this.reportDefaultDraftSnapshot(workspaceId, runId, pairId, draft))) corrupt();
    return value as AutomationInsightCodingDefaultDraftSnapshot;
  }

  async accept(workspaceId: string, runId: string, value: unknown, owner: Owner) {
    this.owner(owner); if (!acceptValid(value)) invalid();
    const request = clone(value); request.selection = this.orderedSelection(request.selection);
    return this.write(workspaceId, runId, request, owner, async () => {
      const proposal = await this.read(request.proposalId, workspaceId, runId);
      if (proposal.request.contractVersion !== 'insight-coding-propose-v1') invalid();
      if (proposal.request.annotations.i02 !== undefined && request.selection.contractVersion !== 'automation-insight-selection-v2') invalid();
      if (hash(proposal) !== request.proposalSha256 || this.latest(proposal.request.adoptionId, 'PROPOSAL')?.evidence_id !== proposal.evidenceId) conflict();
      const adoption = await this.read(proposal.request.adoptionId, workspaceId, runId);
      await this.currentAdoption(adoption);
      if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') corrupt();
      const input = this.compose(await this.context(workspaceId, runId, proposal.binding.pairId), adoption.request, proposal.request);
      projectSelectedInsightCandidates(input, request.selection);
      const previous = this.latest(proposal.evidenceId, 'RECEIPT');
      return { binding: proposal.binding, parent: proposal, sequence: Number(previous?.sequence ?? 0) + 1 };
    });
  }

  /** Explicit receipt list, same immutable proposal. Pending rows stay in the original corpus. */
  async resolve(workspaceId: string, runId: string, proposalId: string, receiptIds: readonly string[]) {
    if (!receiptIds.length || receiptIds.length > 1000 || new Set(receiptIds).size !== receiptIds.length) invalid();
    const sourceReads: SourceReads = new Map();
    const proposal = await this.read(proposalId, workspaceId, runId, false, sourceReads);
    if (proposal.request.contractVersion !== 'insight-coding-propose-v1') invalid();
    const adoption = await this.read(proposal.request.adoptionId, workspaceId, runId, false, sourceReads);
    if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') corrupt();
    const selection: AutomationInsightSelection = { contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [], corpora: [] };
    const receipts: Evidence[] = [];
    for (const id of [...receiptIds].sort()) {
      const receipt = await this.read(id, workspaceId, runId, false, sourceReads);
      if (receipt.request.contractVersion !== 'insight-coding-accept-v1' || receipt.request.proposalId !== proposalId || receipt.parentSha256 !== hash(proposal)) invalid();
      receipts.push(receipt);
      if (receipt.request.selection.contractVersion === 'automation-insight-selection-v2') {
        selection.contractVersion = 'automation-insight-selection-v2';
        for (const family of ['i02', 'i04', 'i05', 'i07', 'i08'] as const) {
          (selection[family] ??= []).push(...receipt.request.selection[family]!);
        }
      }
      for (const family of ['i06', 'i09', 'i13Mentions'] as const) selection[family].push(...receipt.request.selection[family]);
      for (const entry of receipt.request.selection.corpora) {
        let corpus = selection.corpora.find(c => c.corpusIndex === entry.corpusIndex);
        if (!corpus) { corpus = { corpusIndex: entry.corpusIndex, assignments: [], dispositions: [] }; selection.corpora.push(corpus); }
        corpus.assignments.push(...entry.assignments); corpus.dispositions.push(...entry.dispositions);
      }
    }
    const context = await this.context(workspaceId, runId, proposal.binding.pairId, sourceReads);
    return { binding: proposal.binding, adoption, proposal, receipts, selectionContractVersion: selection.contractVersion,
      ...projectSelectedInsightCandidates(this.compose(context, adoption.request, proposal.request), this.orderedSelection(selection)) };
  }

  async read(id: string, workspaceId: string, runId: string, repair = false, sourceReads: SourceReads = new Map()): Promise<Evidence> {
    const row = this.row(id);
    if (!row || row.run_id !== runId) throw new ResearchAutomationNotFoundError('insight_coding_not_found', 'Insight coding evidence was not found.');
    const value = await this.load(row, repair);
    if (value.binding.workspaceId !== workspaceId) throw new ResearchAutomationNotFoundError('insight_coding_not_found', 'Insight coding evidence was not found.');
    const context = await this.context(workspaceId, runId, value.binding.pairId, sourceReads);
    if (json(context.binding) !== json(value.binding)) corrupt();
    try {
      if (value.request.contractVersion === 'insight-coding-default-rule-v1' || value.request.contractVersion === 'insight-coding-default-propose-v1') {
        await this.verifyDefaultEvidence(value, row, context, sourceReads);
      } else if (value.request.contractVersion === 'insight-coding-adopt-v1') {
        if (row.parent_id !== null || value.parentSha256 !== null || json(value.request.binding) !== json(value.binding)) corrupt();
        this.compose(context, value.request);
      } else {
        const parentId = value.request.contractVersion === 'insight-coding-propose-v1' ? value.request.adoptionId : value.request.proposalId;
        if (parentId !== row.parent_id || parentId === id) corrupt();
        const parentRow = this.row(parentId);
        // Enforce the finite adoption -> proposal -> receipt chain before recursion.
        if (!parentRow || parentRow.kind !== (row.kind === 'PROPOSAL' ? 'ADOPTION' : 'PROPOSAL')) corrupt();
        const parent = await this.read(parentId, workspaceId, runId, false, sourceReads);
        if (hash(parent) !== value.parentSha256 || json(parent.binding) !== json(value.binding)) corrupt();
        if (value.request.contractVersion === 'insight-coding-propose-v1') {
          if (parent.request.contractVersion !== 'insight-coding-adopt-v1') corrupt();
          this.compose(context, parent.request, value.request);
          const previous = this.options.db.prepare(`SELECT evidence_id FROM analysis_insight_coding_evidence WHERE parent_id=? AND kind='PROPOSAL' AND sequence=?`)
            .get(parentId, Number(row.sequence) - 1) as { evidence_id: string } | undefined;
          if ((previous?.evidence_id ?? null) !== value.request.previousProposalId || (Number(row.sequence) > 1 && !previous)) corrupt();
        } else {
          if (parent.request.contractVersion !== 'insight-coding-propose-v1' || value.request.proposalSha256 !== hash(parent)) corrupt();
          if (parent.request.annotations.i02 !== undefined && value.request.selection.contractVersion !== 'automation-insight-selection-v2') corrupt();
          const adoption = await this.read(parent.request.adoptionId, workspaceId, runId, false, sourceReads);
          if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') corrupt();
          projectSelectedInsightCandidates(this.compose(context, adoption.request, parent.request), value.request.selection);
        }
      }
    } catch (error) { if (error instanceof ResearchAutomationIntegrityError) throw error; corrupt(); }
    return value;
  }

  /** Query-only history of one explicit pair. Every row passes the exact reader; no latest selection, currency claim or repair. */
  async view(workspaceId: string, runId: string, pairId: string) {
    const sourceReads: SourceReads = new Map();
    // Source context first: wrong workspace, run or pair fails before any coding row is inspected.
    const context = await this.context(workspaceId, runId, pairId, sourceReads);
    // Stable domain order over the full corpus (all kinds, superseded rows included); IDs only until verified.
    const rows = this.options.db.prepare(`SELECT evidence_id FROM analysis_insight_coding_evidence WHERE run_id=? AND pair_sha256=?
      ORDER BY CASE kind WHEN 'ADOPTION' THEN 0 WHEN 'PROPOSAL' THEN 1 ELSE 2 END, parent_id, sequence, evidence_id LIMIT ?`)
      .all(runId, pairId, MAX_VIEW_EVIDENCE + 1) as { evidence_id: string }[];
    if (rows.length > MAX_VIEW_EVIDENCE) tooLarge();
    const evidence: { evidenceId: string; kind: Kind | 'DEFAULT_RULE'; sequence: number; binding: InsightSourceBinding; request: Request; createdAt: string; sha256: string }[] = [];
    const view = { contractVersion: 'insight-coding-view-v1' as 'insight-coding-view-v1' | 'insight-coding-view-v2', context: { binding: context.binding, input: context.input }, evidence };
    let viewBytes = Buffer.byteLength(json(view));
    if (viewBytes > MAX_VIEW_BYTES) tooLarge();
    for (const { evidence_id: id } of rows) {
      const value = await this.read(id, workspaceId, runId, false, sourceReads);
      // Actor identity stays in the immutable artifact; sha256 is the exact digest an acceptance names.
      const item = { evidenceId: value.evidenceId, kind: publicKind(value.request), sequence: value.sequence, binding: value.binding,
        request: value.request, createdAt: value.createdAt, sha256: hash(value) };
      viewBytes += Buffer.byteLength(json(item)) + (evidence.length ? 1 : 0);
      if (viewBytes > MAX_VIEW_BYTES) tooLarge();
      evidence.push(item);
      if (value.contractVersion === 'insight-coding-default-evidence-v1') view.contractVersion = 'insight-coding-view-v2';
    }
    return view;
  }

  /** A report freezes exactly the selected receipts, not all receipts saved later. */
  async reportSnapshot(workspaceId: string, runId: string, pairId: string, selection: InsightReportSelection, current = false): Promise<AutomationInsightCodingAcceptedSnapshot> {
    const resolved = await this.resolve(workspaceId, runId, selection.proposalId, selection.receiptIds);
    if (resolved.binding.pairId !== pairId) conflict();
    if (current) {
      await this.currentAdoption(resolved.adoption);
      if (this.latest(resolved.adoption.evidenceId, 'PROPOSAL')?.evidence_id !== resolved.proposal.evidenceId) conflict();
    }
    const snapshot = {
      contractVersion: 'automation-insight-coding-snapshot-v1', binding: resolved.binding,
      ...(resolved.selectionContractVersion === 'automation-insight-selection-v2' ? { selectionContractVersion: resolved.selectionContractVersion } : {}),
      selection: { proposalId: selection.proposalId, receiptIds: [...selection.receiptIds].sort() },
      adoptionId: resolved.adoption.evidenceId, proposalSha256: hash(resolved.proposal),
      receipts: resolved.receipts.map(receipt => ({ receiptId: receipt.evidenceId, sha256: hash(receipt) })),
      output: resolved.output,
    };
    if (!snapshotValid(snapshot)) corrupt();
    return snapshot;
  }

  async verifyReportSnapshot(value: unknown, workspaceId: string, runId: string, pairId: string, selection: InsightReportSelection): Promise<AutomationInsightCodingAcceptedSnapshot> {
    if (!snapshotValid(value)) corrupt();
    const expected = await this.reportSnapshot(workspaceId, runId, pairId, selection);
    if (json(expected) !== json(value)) corrupt();
    return expected;
  }

  /**
   * Explicit exact proposal with zero receipts. Nothing is selected, admitted
   * or approved: the composed input keeps retained PENDING_AI provenance, and
   * the draft flag emits labelled draft counts through the owned builder.
   * The derived computation input explicitly selects current method semantics;
   * retained evidence, binding and provenance are never rewritten.
   */
  async resolveDraftProposal(workspaceId: string, runId: string, proposalId: string, version: InsightDraftSelection['contractVersion'] = 'insight-draft-select-v1') {
    const sourceReads: SourceReads = new Map();
    const proposal = await this.read(proposalId, workspaceId, runId, false, sourceReads);
    if (proposal.request.contractVersion !== 'insight-coding-propose-v1') invalid();
    const adoption = await this.read(proposal.request.adoptionId, workspaceId, runId, false, sourceReads);
    if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') corrupt();
    const context = await this.context(workspaceId, runId, proposal.binding.pairId, sourceReads);
    const input = this.compose(context, adoption.request, proposal.request);
    input.semanticsVersion = '1.1.0';
    input.draftCountsVersion = version === 'insight-draft-select-v2' ? 'draft-counts-v2' : 'draft-counts-v1';
    const { output } = buildLocatedInsightMethods(input);
    return { binding: proposal.binding, adoption, proposal, receipts: [] as InsightCodingEvidence[], output,
      ...(version === 'insight-draft-select-v2' ? { groupCounts: projectDraftInsightGroupCounts(output, context.verifiedPlatform) } : {}) };
  }

  /** A report freezes exactly the named draft proposal with zero receipts, not an implicit latest. */
  async reportDraftSnapshot(workspaceId: string, runId: string, pairId: string, draft: InsightDraftSelection, current = false): Promise<AutomationInsightCodingDraftSnapshot | AutomationInsightCodingFamilyDraftSnapshot> {
    const resolved = await this.resolveDraftProposal(workspaceId, runId, draft.proposalId, draft.contractVersion);
    if (resolved.binding.pairId !== pairId) conflict();
    if (current) {
      await this.currentAdoption(resolved.adoption);
      if (this.latest(resolved.adoption.evidenceId, 'PROPOSAL')?.evidence_id !== resolved.proposal.evidenceId) conflict();
    }
    const snapshot = {
      contractVersion: draft.contractVersion === 'insight-draft-select-v2' ? 'automation-insight-coding-snapshot-v3' : 'automation-insight-coding-snapshot-v2', binding: resolved.binding,
      selection: { proposalId: draft.proposalId, receiptIds: [] as string[] },
      adoptionId: resolved.adoption.evidenceId, proposalSha256: hash(resolved.proposal),
      receipts: [] as { receiptId: string; sha256: string }[],
      draftSelection: clone(draft),
      output: resolved.output,
      ...(resolved.groupCounts ? { groupCounts: resolved.groupCounts } : {}),
    };
    if (!snapshotValid(snapshot)) corrupt();
    return snapshot;
  }

  async verifyReportDraftSnapshot(value: unknown, workspaceId: string, runId: string, pairId: string, draft: InsightDraftSelection): Promise<AutomationInsightCodingDraftSnapshot | AutomationInsightCodingFamilyDraftSnapshot> {
    if (!snapshotValid(value)) corrupt();
    const expected = await this.reportDraftSnapshot(workspaceId, runId, pairId, draft);
    if (json(expected) !== json(value)) corrupt();
    return expected;
  }

  private async context(workspaceId: string, runId: string, pairId: string, sourceReads?: SourceReads): Promise<InsightSourceContext> {
    // Reuse only within this resolution. Every later request verifies storage again.
    const key = `${workspaceId}/${runId}/${pairId}`;
    let reading = sourceReads?.get(key);
    if (!reading) { reading = this.options.context(workspaceId, runId, pairId); sourceReads?.set(key, reading); }
    const context = await reading;
    if (context.binding.workspaceId !== workspaceId || context.binding.runId !== runId || context.binding.pairId !== pairId || hash(context.input) !== context.binding.inputSha256) corrupt();
    return context;
  }
  private compose(context: InsightSourceContext, adoption: InsightCodingAdoptRequest, proposal?: InsightCodingProposeRequest): LocatedInsightMethods['input'] {
    const input = clone(context.input);
    input.question = adoption.rules.question; input.inclusionRule = adoption.rules.inclusionRule; input.adjudicationRule = adoption.rules.adjudicationRule;
    input.corpora = clone(adoption.rules.corpora);
    input.i06 = clone(proposal?.annotations.i06 ?? []); input.i09 = clone(proposal?.annotations.i09 ?? []); input.i13Mentions = clone(proposal?.annotations.i13Mentions ?? []);
    if (proposal?.annotations.i02 !== undefined) {
      // All five fields are present together under the closed contract. Absence
      // is the historical four-family path, not an implicit empty replacement.
      input.i02 = clone(proposal.annotations.i02);
      input.i04 = clone(proposal.annotations.i04!); input.i05 = clone(proposal.annotations.i05!);
      input.i07 = clone(proposal.annotations.i07!); input.i08 = clone(proposal.annotations.i08!);
    }
    const seen = new Set<number>();
    for (const coding of proposal?.annotations.corpora ?? []) {
      if (seen.has(coding.corpusIndex) || !input.corpora[coding.corpusIndex]) invalid();
      seen.add(coding.corpusIndex);
      Object.assign(input.corpora[coding.corpusIndex]!, { assignments: clone(coding.assignments), dispositions: clone(coding.dispositions) });
    }
    // Existing owner validates literal codebooks, membership, record-local relations,
    // contradictions and every span against the exact source text. No new formulas.
    return validateLocatedInsightInput(input);
  }
  private async currentAdoption(adoption: Evidence) {
    if (adoption.request.contractVersion !== 'insight-coding-adopt-v1') invalid();
    await this.options.assertCurrent(adoption.binding);
    const newer = this.options.db.prepare(`SELECT evidence_id FROM analysis_insight_coding_evidence WHERE run_id=? AND pair_sha256=? AND kind='ADOPTION'
      AND json_extract(artifact_json,'$.request.contractVersion')='insight-coding-adopt-v1'
        AND json_extract(artifact_json,'$.request.rules.ruleId')=? AND json_extract(artifact_json,'$.request.rules.revision')>? LIMIT 1`)
      .get(adoption.binding.runId, adoption.binding.pairId, adoption.request.rules.ruleId, adoption.request.rules.revision);
    if (newer) conflict();
  }
  private owner(owner: Owner) { if (owner.role !== 'OWNER' || !owner.actorId.trim() || owner.actorId.length > 200) invalid(); }
  private orderedSelection(selection: AutomationInsightSelection): AutomationInsightSelection {
    const order = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
    return { ...selection,
      ...(selection.contractVersion === 'automation-insight-selection-v2' ? {
        i02: order(selection.i02!), i04: order(selection.i04!), i05: order(selection.i05!), i07: order(selection.i07!), i08: order(selection.i08!),
      } : {}),
      i06: order(selection.i06), i09: order(selection.i09), i13Mentions: order(selection.i13Mentions),
      corpora: selection.corpora.map(c => ({ ...c, assignments: order(c.assignments), dispositions: order(c.dispositions) })).sort((a, b) => a.corpusIndex - b.corpusIndex) };
  }
  private row(id: string): Row | undefined { return this.options.db.prepare('SELECT * FROM analysis_insight_coding_evidence WHERE evidence_id=?').get(id) as Row | undefined; }
  private latest(parent: string, kind: Kind): Row | undefined { return this.options.db.prepare('SELECT * FROM analysis_insight_coding_evidence WHERE parent_id=? AND kind=? ORDER BY sequence DESC LIMIT 1').get(parent, kind) as Row | undefined; }
  private async write(workspaceId: string, runId: string, request: Request, owner: Owner,
    prepare: () => Promise<{ binding: InsightSourceBinding; parent: Evidence | null; sequence: number }>) {
    const store = this.options.staging; if (!store || Buffer.byteLength(json(request)) > MAX_BYTES) invalid();
    return withDatabaseMutationMutex(this.options.db, () => store.withOwnership(async () => {
      this.options.db.exec('BEGIN IMMEDIATE');
      let evidence: Evidence; let digest: string; let exactRetry = false;
      try {
        const prior = this.options.db.prepare('SELECT * FROM analysis_insight_coding_evidence WHERE request_key=?').get(request.requestKey) as Row | undefined;
        if (prior) {
          evidence = await this.read(prior.evidence_id, workspaceId, runId, true);
          if (json(evidence.request) !== json(request) || evidence.actorId !== owner.actorId) conflict();
          digest = prior.artifact_sha256; exactRetry = true;
        } else {
          const context = await prepare();
          const candidate = { contractVersion: request.contractVersion.startsWith('insight-coding-default-') ? 'insight-coding-default-evidence-v1' : 'insight-coding-evidence-v1', evidenceId: randomUUID(), sequence: context.sequence, binding: context.binding, request,
            parentSha256: context.parent ? hash(context.parent) : null, actorId: owner.actorId, actorRole: 'OWNER', createdAt: this.options.now().toISOString() };
          if (!evidenceValid(candidate)) corrupt();
          evidence = candidate;
          const buffer = Buffer.from(json(evidence)); if (buffer.length > MAX_BYTES) invalid();
          const stored = await store.put(buffer); digest = stored.sha256;
          this.options.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
            VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`)
            .run(digest, stored.byteSize, stored.relativePath, evidence.createdAt, evidence.createdAt);
          this.options.db.prepare(`INSERT INTO analysis_insight_coding_evidence(evidence_id,kind,run_id,pair_sha256,parent_id,request_key,sequence,artifact_sha256,artifact_json)
            VALUES (?,?,?,?,?,?,?,?,?)`).run(evidence.evidenceId, kindOf(request), runId, context.binding.pairId, context.parent?.evidenceId ?? null, request.requestKey, context.sequence, digest, json(evidence));
          await this.read(evidence.evidenceId, workspaceId, runId);
        }
        this.options.db.exec('COMMIT');
      } catch (error) { if (this.options.db.inTransaction) this.options.db.exec('ROLLBACK'); throw error; }
      await store.publishOwned(digest);
      return { evidence, sha256: digest, exactRetry };
    }));
  }
  private async load(row: Row, repair: boolean): Promise<Evidence> {
    let value: unknown; try { value = JSON.parse(row.artifact_json); } catch { return corrupt(); }
    if (!evidenceValid(value) || json(value) !== row.artifact_json || hash(value) !== row.artifact_sha256 || value.evidenceId !== row.evidence_id ||
        value.binding.runId !== row.run_id || value.binding.pairId !== row.pair_sha256 || value.request.requestKey !== row.request_key || kindOf(value.request) !== row.kind || value.sequence !== Number(row.sequence)) corrupt();
    const expected = Buffer.from(row.artifact_json);
    const manifest = this.options.db.prepare('SELECT * FROM artifact_manifests WHERE sha256=?').get(row.artifact_sha256) as Record<string, unknown> | undefined;
    if (!manifest || Number(manifest.byte_size) !== expected.length || manifest.media_type !== 'application/json' || manifest.contract_version !== '1.0.0' ||
        manifest.retention_status !== 'active' || manifest.relative_path !== `sha256/${row.artifact_sha256.slice(0, 2)}/${row.artifact_sha256}` || manifest.acquired_at !== value.createdAt || manifest.created_at !== value.createdAt) corrupt();
    let content: Buffer;
    try { content = await (this.options.staging ?? this.options.artifacts).read(row.artifact_sha256, { maxBytes: MAX_BYTES }); }
    catch (error) {
      if (!repair || !this.options.staging || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.options.staging.put(expected); content = await this.options.staging.read(row.artifact_sha256, { maxBytes: MAX_BYTES });
    }
    if (!content.equals(expected)) corrupt();
    return value;
  }
}

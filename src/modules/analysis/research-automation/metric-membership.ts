import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import schema from '../../../../contracts/analysis/automation-metric-membership.schema.json' with { type: 'json' };
import type { MetricMembershipBinding, MetricMembershipAssignment, MetricMembershipProposal, MetricMembershipReceipt, MetricMembershipProposeRequest, MetricMembershipAcceptRequest } from '../../../../contracts/analysis/automation-metric-membership.generated.js';
import type { AutomationMetricRuleAdoptionArtifact } from '../../../../contracts/analysis/automation-metric-rule-adoption.generated.js';
import type { MetricScopeInput } from '../../../../contracts/analysis/metric-scope-input.generated.js';
import type { MetricAcceptanceSelection } from '../../../../contracts/analysis/automation-classified-report-revision.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv); ajv.addSchema(schema);
const proposeValid = ajv.compile<MetricMembershipProposeRequest>({ $ref: `${schema.$id}#/$defs/propose` });
const acceptValid = ajv.compile<MetricMembershipAcceptRequest>({ $ref: `${schema.$id}#/$defs/accept` });
const proposalValid = ajv.compile<MetricMembershipProposal>({ $ref: `${schema.$id}#/$defs/proposal` });
const receiptValid = ajv.compile<MetricMembershipReceipt>({ $ref: `${schema.$id}#/$defs/receipt` });
const json = canonicalJson;
const sha = (value: unknown): string => createHash('sha256').update(json(value)).digest('hex');
const bad = (): never => { throw new ResearchAutomationIntegrityError('Metric membership evidence failed verification.'); };
const conflict = (): never => { throw new ResearchAutomationConflictError('revision_conflict', 'Metric membership changed or the selected assignment conflicts.'); };
type Evidence = MetricMembershipProposal | MetricMembershipReceipt;
type Kind = 'proposals' | 'receipts';
interface Row {
  proposal_id: string; receipt_id?: string; run_id: string; adoption_id: string; preparation_sha256: string; pair_sha256: string;
  request_key: string; artifact_sha256: string; artifact_json: string;
}
interface AcceptedRow { record_key: string; proposal_id: string; receipt_id: string }
export interface MetricMembershipContext {
  readonly binding: MetricMembershipBinding;
  readonly input: MetricScopeInput;
  readonly adoption: AutomationMetricRuleAdoptionArtifact;
}
interface Owner { actorId: string; role: 'OWNER' }
interface Options {
  db: Database.Database; artifacts: ContentAddressedArtifactStore; staging?: RequestScopedArtifactStore;
  context(workspaceId: string, runId: string, pairId: string, adoptionId: string): Promise<MetricMembershipContext>;
  assertCurrent(context: MetricMembershipContext): Promise<void>;
  now(): Date;
}

/** Only Metric assignments: proposals are inert and acceptance never shrinks the source universe. */
export class AutomationMetricMembership {
  constructor(private readonly options: Options) {}

  async propose(workspaceId: string, runId: string, value: unknown, owner: Owner) {
    this.assertOwner(owner);
    if (!proposeValid(value) || new Set(value.assignments.map(a => a.recordKey)).size !== value.assignments.length)
      throw new ResearchAutomationValidationError('Invalid Metric membership proposal.');
    const request = JSON.parse(json(value)) as MetricMembershipProposeRequest;
    request.assignments.sort((a, b) => a.recordKey < b.recordKey ? -1 : a.recordKey > b.recordKey ? 1 : 0);
    return this.write(async store => {
      const prior = this.row('proposals', 'request_key', request.requestKey);
      if (prior) {
        const proposal = await this.readProposal(prior.proposal_id, workspaceId, runId, true);
        if (json(proposal.request) !== json(request) || proposal.actorId !== owner.actorId) conflict();
        return { evidence: proposal, exactRetry: true, digest: prior.artifact_sha256 };
      }
      const context = await this.options.context(workspaceId, runId, request.pairId, request.adoptionId);
      await this.options.assertCurrent(context);
      this.verifyAssignments(request.assignments, context);
      const proposal: MetricMembershipProposal = { contractVersion: 'metric-membership-proposal-v1', proposalId: randomUUID(),
        binding: context.binding, request, actorId: owner.actorId, createdAt: this.options.now().toISOString() };
      const digest = await this.store('proposals', proposal, store);
      return { evidence: proposal, exactRetry: false, digest };
    });
  }

  async accept(workspaceId: string, runId: string, value: unknown, owner: Owner) {
    this.assertOwner(owner);
    if (!acceptValid(value)) throw new ResearchAutomationValidationError('Invalid Metric acceptance request.');
    const request = JSON.parse(json(value)) as MetricMembershipAcceptRequest; request.selectedRecordKeys.sort();
    return this.write(async store => {
      const prior = this.row('receipts', 'request_key', request.requestKey);
      if (prior) {
        const receipt = await this.readReceipt(prior.receipt_id!, workspaceId, runId, true);
        if (json(receipt.request) !== json(request) || receipt.actorId !== owner.actorId) conflict();
        return { evidence: receipt, exactRetry: true, digest: prior.artifact_sha256 };
      }
      const proposal = await this.readProposal(request.proposalId, workspaceId, runId);
      const context = await this.options.context(workspaceId, runId, proposal.binding.pairId, proposal.binding.adoptionId);
      await this.options.assertCurrent(context);
      const priorAssignments = await this.accepted(context);
      for (const key of request.selectedRecordKeys) {
        if (!proposal.request.assignments.some(a => a.recordKey === key)) throw new ResearchAutomationValidationError('Selected record is absent from this exact proposal.');
        const priorAssignment = priorAssignments.get(key);
        if (priorAssignment && priorAssignment.proposalId !== proposal.proposalId) conflict();
      }
      const receipt: MetricMembershipReceipt = { contractVersion: 'metric-membership-receipt-v1', receiptId: randomUUID(),
        binding: proposal.binding, request, proposalSha256: sha(proposal), actorId: owner.actorId, actorRole: 'OWNER', acceptedAt: this.options.now().toISOString() };
      const digest = await this.store('receipts', receipt, store);
      for (const recordKey of request.selectedRecordKeys) if (!priorAssignments.has(recordKey)) {
        this.options.db.prepare(`INSERT INTO analysis_metric_membership_accepted(run_id,adoption_id,preparation_sha256,pair_sha256,record_key,proposal_id,receipt_id)
          VALUES (?,?,?,?,?,?,?)`).run(runId, context.binding.adoptionId, context.binding.preparationSha256, context.binding.pairId, recordKey, proposal.proposalId, receipt.receiptId);
      }
      await this.accepted(context);
      return { evidence: receipt, exactRetry: false, digest };
    });
  }

  async review(workspaceId: string, runId: string, pairId: string, adoptionId: string) {
    const context = await this.options.context(workspaceId, runId, pairId, adoptionId);
    const accepted = await this.accepted(context);
    const records = [...this.records(context)].map(([recordKey, record]) => {
      const match = accepted.get(recordKey);
      return { recordKey, title: record.title, category: record.category, shopId: record.shopId, listingId: record.listingId,
        locator: record.source.locator, state: match ? 'ACCEPTED' as const : 'PENDING' as const,
        classification: match?.assignment.classification ?? null, group: match?.assignment.group ?? null, proposalId: match?.proposalId ?? null };
    });
    return { contractVersion: 'metric-membership-review-v1' as const, workspaceId, runId, pairId, adoptionId,
      recordCount: records.length, acceptedCount: accepted.size, pendingCount: records.length - accepted.size,
      complete: records.length > 0 && accepted.size === records.length,
      acceptedReceiptIds: [...new Set([...accepted.values()].map(value => value.receiptId))].sort(), records };
  }

  /** Explicit frozen receipt set for a new calculation; never infer acceptance from recency. */
  async resolveSelection(workspaceId: string, runId: string, pairId: string, selection: MetricAcceptanceSelection, current = false) {
    const context = await this.options.context(workspaceId, runId, pairId, selection.adoptionId);
    if (current) await this.options.assertCurrent(context);
    const assignments = new Map<string, { assignment: MetricMembershipAssignment; proposalId: string; receiptIndex: number; selectionIndex: number }>();
    const receipts: MetricMembershipReceipt[] = [];
    for (const id of [...selection.receiptIds].sort()) {
      const receipt = await this.readReceipt(id, workspaceId, runId);
      if (json(receipt.binding) !== json(context.binding)) conflict();
      const proposal = await this.readProposal(receipt.request.proposalId, workspaceId, runId);
      for (const [selectionIndex, key] of receipt.request.selectedRecordKeys.entries()) {
        const prior = assignments.get(key);
        if (prior && prior.proposalId !== proposal.proposalId) conflict();
        if (!prior) assignments.set(key, { assignment: proposal.request.assignments.find(a => a.recordKey === key)!,
          proposalId: proposal.proposalId, receiptIndex: receipts.length, selectionIndex });
      }
      receipts.push(receipt);
    }
    const records = this.records(context);
    if (!records.size || assignments.size !== records.size || [...records.keys()].some(key => !assignments.has(key)))
      throw new ResearchAutomationValidationError('Every source record needs an explicit accepted disposition before classified calculation.');
    return { context, records, assignments, receipts };
  }

  async readProposal(proposalId: string, workspaceId: string, runId: string, repair = false): Promise<MetricMembershipProposal> {
    const row = this.row('proposals', 'proposal_id', proposalId);
    if (!row || row.run_id !== runId) throw new ResearchAutomationNotFoundError('membership_not_found', 'Metric proposal was not found.');
    const value = await this.load('proposals', row, repair);
    if (!proposalValid(value) || value.binding.workspaceId !== workspaceId || value.request.pairId !== value.binding.pairId || value.request.adoptionId !== value.binding.adoptionId) return bad();
    const context = await this.options.context(workspaceId, runId, value.binding.pairId, value.binding.adoptionId);
    if (json(value.binding) !== json(context.binding)) return bad();
    try { this.verifyAssignments(value.request.assignments, context); } catch { return bad(); }
    return value;
  }

  async readReceipt(receiptId: string, workspaceId: string, runId: string, repair = false, verifyProjection = true): Promise<MetricMembershipReceipt> {
    const row = this.row('receipts', 'receipt_id', receiptId);
    if (!row || row.run_id !== runId) throw new ResearchAutomationNotFoundError('membership_not_found', 'Metric acceptance was not found.');
    const value = await this.load('receipts', row, repair);
    if (!receiptValid(value) || value.binding.workspaceId !== workspaceId) return bad();
    const proposal = await this.readProposal(value.request.proposalId, workspaceId, runId);
    if (sha(proposal) !== value.proposalSha256 || json(proposal.binding) !== json(value.binding) ||
        value.request.selectedRecordKeys.some(key => !proposal.request.assignments.some(a => a.recordKey === key))) return bad();
    if (verifyProjection) await this.verifySelectedProjection(value);
    return value;
  }

  private async verifySelectedProjection(receipt: MetricMembershipReceipt) {
    const { workspaceId, runId, adoptionId, preparationSha256, pairId } = receipt.binding;
    for (const key of receipt.request.selectedRecordKeys) {
      const row = this.options.db.prepare(`SELECT record_key,proposal_id,receipt_id FROM analysis_metric_membership_accepted
        WHERE run_id=? AND adoption_id=? AND preparation_sha256=? AND pair_sha256=? AND record_key=?`)
        .get(runId, adoptionId, preparationSha256, pairId, key) as AcceptedRow | undefined;
      if (!row || row.proposal_id !== receipt.request.proposalId) return bad();
      if (row.receipt_id === receipt.receiptId) continue;
      // Overlapping selections retain the first acceptance, never an unrelated later batch.
      const original = await this.readReceipt(row.receipt_id, workspaceId, runId, false, false);
      if (json(original.binding) !== json(receipt.binding) || original.request.proposalId !== receipt.request.proposalId ||
          !original.request.selectedRecordKeys.includes(key)) return bad();
    }
  }

  private async accepted(context: MetricMembershipContext) {
    const { workspaceId, runId, adoptionId, preparationSha256, pairId } = context.binding;
    const rows = this.options.db.prepare(`SELECT * FROM analysis_metric_membership_receipts WHERE run_id=? AND adoption_id=? AND preparation_sha256=? AND pair_sha256=? ORDER BY rowid`)
      .all(runId, adoptionId, preparationSha256, pairId) as Row[];
    const result = new Map<string, { assignment: MetricMembershipAssignment; proposalId: string; receiptId: string }>();
    for (const row of rows) {
      const receipt = await this.readReceipt(row.receipt_id!, workspaceId, runId, false, false);
      if (json(receipt.binding) !== json(context.binding)) return bad();
      const proposal = await this.readProposal(receipt.request.proposalId, workspaceId, runId);
      for (const key of receipt.request.selectedRecordKeys) {
        const assignment = proposal.request.assignments.find(a => a.recordKey === key)!;
        const prior = result.get(key);
        if (prior && prior.proposalId !== proposal.proposalId) return bad();
        if (!prior) result.set(key, { assignment, proposalId: proposal.proposalId, receiptId: receipt.receiptId });
      }
    }
    const persisted = this.options.db.prepare(`SELECT record_key,proposal_id,receipt_id FROM analysis_metric_membership_accepted
      WHERE run_id=? AND adoption_id=? AND preparation_sha256=? AND pair_sha256=? ORDER BY record_key`).all(runId, adoptionId, preparationSha256, pairId) as AcceptedRow[];
    const expected = [...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([record_key, value]) => ({ record_key, proposal_id: value.proposalId, receipt_id: value.receiptId }));
    const universe = this.records(context);
    if (json(persisted) !== json(expected) || [...result.keys()].some(key => !universe.has(key))) return bad();
    return result;
  }

  private records(context: MetricMembershipContext) {
    const entries = context.input.records.map(record => [sha({ source: record.source, shopId: record.shopId, listingId: record.listingId }), record] as const);
    const records = new Map(entries);
    if (records.size !== entries.length || sha(context.input) !== context.binding.inputSha256 || context.input.records.some(record => record.label !== null)) return bad();
    return records;
  }
  private verifyAssignments(assignments: MetricMembershipAssignment[], context: MetricMembershipContext) {
    const records = this.records(context); const groups = new Set(context.adoption.request.rulebook.groups.map(group => group.key));
    if (new Set(assignments.map(a => a.recordKey)).size !== assignments.length || assignments.some(a => !records.has(a.recordKey) || !groups.has(a.group)))
      throw new ResearchAutomationValidationError('Assignment must identify an exact source record and adopted group.');
  }
  private assertOwner(owner: Owner) {
    if (owner.role !== 'OWNER' || !owner.actorId.trim() || owner.actorId.length > 200) throw new ResearchAutomationValidationError('Trusted OWNER is required.');
  }
  private row(kind: Kind, column: 'request_key' | 'proposal_id' | 'receipt_id', value: string): Row | undefined {
    return this.options.db.prepare(`SELECT * FROM analysis_metric_membership_${kind} WHERE ${column}=?`).get(value) as Row | undefined;
  }
  private async write<T extends Evidence>(operation: (store: RequestScopedArtifactStore) => Promise<{ evidence: T; digest: string; exactRetry: boolean }>) {
    const store = this.options.staging;
    if (!store) throw new ResearchAutomationValidationError('Membership writes are unavailable on this handle.');
    return withDatabaseMutationMutex(this.options.db, () => store.withOwnership(async () => {
      this.options.db.exec('BEGIN IMMEDIATE');
      let result: Awaited<ReturnType<typeof operation>>;
      try { result = await operation(store); this.options.db.exec('COMMIT'); }
      catch (error) { if (this.options.db.inTransaction) this.options.db.exec('ROLLBACK'); throw error; }
      await store.publishOwned(result.digest);
      return { evidence: result.evidence, exactRetry: result.exactRetry };
    }));
  }
  private async store(kind: Kind, value: Evidence, store: RequestScopedArtifactStore): Promise<string> {
    if (!(kind === 'proposals' ? proposalValid(value) : receiptValid(value))) return bad();
    const content = Buffer.from(json(value));
    if (content.length > 64 * 1024) throw new ResearchAutomationValidationError('Membership artifact exceeds the request bound.');
    const stored = await store.put(content);
    const time = 'createdAt' in value ? value.createdAt : value.acceptedAt;
    this.options.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`).run(stored.sha256, stored.byteSize, stored.relativePath, time, time);
    const binding = value.binding;
    if ('proposalId' in value) this.options.db.prepare(`INSERT INTO analysis_metric_membership_proposals(proposal_id,run_id,adoption_id,preparation_sha256,pair_sha256,request_key,artifact_sha256,artifact_json)
      VALUES (?,?,?,?,?,?,?,?)`).run(value.proposalId, binding.runId, binding.adoptionId, binding.preparationSha256, binding.pairId, value.request.requestKey, stored.sha256, json(value));
    else this.options.db.prepare(`INSERT INTO analysis_metric_membership_receipts(receipt_id,proposal_id,run_id,adoption_id,preparation_sha256,pair_sha256,request_key,artifact_sha256,artifact_json)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(value.receiptId, value.request.proposalId, binding.runId, binding.adoptionId, binding.preparationSha256, binding.pairId, value.request.requestKey, stored.sha256, json(value));
    await this.load(kind, this.row(kind, 'request_key', value.request.requestKey)!, false);
    return stored.sha256;
  }
  private async load(kind: Kind, row: Row, repair: boolean): Promise<Evidence> {
    let value: unknown; try { value = JSON.parse(row.artifact_json); } catch { return bad(); }
    if (!proposalValid(value) && !receiptValid(value)) return bad();
    if (json(value) !== row.artifact_json || sha(value) !== row.artifact_sha256 || value.binding.runId !== row.run_id ||
        value.binding.adoptionId !== row.adoption_id || value.binding.preparationSha256 !== row.preparation_sha256 || value.binding.pairId !== row.pair_sha256 || value.request.requestKey !== row.request_key ||
        (kind === 'proposals' ? !('proposalId' in value) || value.proposalId !== row.proposal_id : !('receiptId' in value) || value.receiptId !== row.receipt_id || value.request.proposalId !== row.proposal_id)) return bad();
    const at = 'createdAt' in value ? value.createdAt : value.acceptedAt;
    const manifest = this.options.db.prepare('SELECT * FROM artifact_manifests WHERE sha256=?').get(row.artifact_sha256) as Record<string, unknown> | undefined;
    const expected = Buffer.from(row.artifact_json);
    if (!manifest || Number(manifest.byte_size) !== expected.length || manifest.media_type !== 'application/json' || manifest.contract_version !== '1.0.0' ||
        manifest.retention_status !== 'active' || manifest.relative_path !== `sha256/${row.artifact_sha256.slice(0, 2)}/${row.artifact_sha256}` || manifest.acquired_at !== at || manifest.created_at !== at) return bad();
    const store = this.options.staging ?? this.options.artifacts;
    let retained: Buffer;
    try { retained = await store.read(row.artifact_sha256, { maxBytes: 64 * 1024 }); }
    catch (error) {
      if (!repair || !this.options.staging || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.options.staging.put(expected); retained = await store.read(row.artifact_sha256, { maxBytes: 64 * 1024 });
    }
    if (!retained.equals(expected)) return bad();
    return value;
  }
}

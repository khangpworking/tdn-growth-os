import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import schema from '../../../../contracts/analysis/automation-metric-rule-adoption.schema.json' with { type: 'json' };
import type { AutomationMetricRuleAdoptionRequest, AutomationMetricRuleAdoptionArtifact, AutomationMetricRuleAdoptionReceipt } from '../../../../contracts/analysis/automation-metric-rule-adoption.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv); ajv.addSchema(schema);
const validRequest = ajv.compile<AutomationMetricRuleAdoptionRequest>({ $ref: `${schema.$id}#/$defs/request` });
const validArtifact = ajv.compile<AutomationMetricRuleAdoptionArtifact>({ $ref: `${schema.$id}#/$defs/artifact` });
const bytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const digest = (value: unknown): string => createHash('sha256').update(bytes(value)).digest('hex');
const failIntegrity = (): never => { throw new ResearchAutomationIntegrityError('Metric rule adoption failed verification.'); };

export interface MetricRuleBinding {
  readonly workspaceId: string; readonly runId: string; readonly startSha256: string; readonly scopeSha256: string;
}
interface Row {
  adoption_id: string; workspace_id: string; run_id: string; request_key: string; request_json: string;
  rule_id: string; rule_revision: number | bigint; start_sha256: string; scope_sha256: string;
  rulebook_sha256: string; artifact_sha256: string; actor_id: string; adopted_at: string;
}

/** Analysis-owned rule adoption. It never accepts product assignments or queues research. */
export class AutomationMetricRuleAdoptions {
  constructor(private readonly db: Database.Database, private readonly artifacts: ContentAddressedArtifactStore,
    private readonly staging: RequestScopedArtifactStore | undefined, private readonly now: () => Date) {}

  async adopt(binding: MetricRuleBinding, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<AutomationMetricRuleAdoptionReceipt> {
    if (actor.role !== 'OWNER' || !actor.actorId.trim() || actor.actorId.length > 200)
      throw new ResearchAutomationValidationError('A trusted OWNER actor is required.');
    if (!validRequest(value) || new Set(value.rulebook.groups.map(group => group.key)).size !== value.rulebook.groups.length)
      throw new ResearchAutomationValidationError('Invalid Metric rule adoption request.');
    const request = JSON.parse(canonicalJson(value)) as AutomationMetricRuleAdoptionRequest;
    if (bytes(request).length > 16 * 1024) throw new ResearchAutomationValidationError('Rule adoption exceeds the request limit.');
    const store = this.staging;
    if (!store) throw new ResearchAutomationValidationError('Metric rule adoption is unavailable on this handle.');
    return store.withOwnership(async () => {
      // Serialize across other SQLite connections as well as the application mutex.
      this.db.exec('BEGIN IMMEDIATE');
      let row: Row;
      let exactRetry = false;
      try {
        const prior = this.db.prepare('SELECT * FROM analysis_metric_rule_adoptions WHERE request_key=?').get(request.requestKey) as Row | undefined;
        if (prior) {
          // Verify original content before reporting a changed-request conflict.
          await this.verify(prior, undefined, true);
          if (prior.request_json !== canonicalJson(request) || prior.actor_id !== actor.actorId ||
              prior.workspace_id !== binding.workspaceId || prior.run_id !== binding.runId ||
              prior.start_sha256 !== binding.startSha256 || prior.scope_sha256 !== binding.scopeSha256)
            throw new ResearchAutomationConflictError('request_key_conflict', 'Rule adoption identity is bound to different content.');
          row = prior; exactRetry = true;
        } else {
          const current = this.db.prepare(`SELECT revision, start_request_sha256, scope_request_sha256, scope_confirmed_at
            FROM analysis_research_automation_runs WHERE run_id=? AND workspace_id=?`).get(binding.runId, binding.workspaceId) as
            { revision: number | bigint; start_request_sha256: string; scope_request_sha256: string | null; scope_confirmed_at: string | null } | undefined;
          if (!current || Number(current.revision) !== request.expectedRevision || current.start_request_sha256 !== binding.startSha256 ||
              current.scope_request_sha256 !== binding.scopeSha256 || !current.scope_confirmed_at)
            throw new ResearchAutomationConflictError('revision_conflict', 'Confirm and reload the scope before adopting rules.');
          const existing = this.db.prepare('SELECT * FROM analysis_metric_rule_adoptions WHERE run_id=? AND rule_id=? AND rule_revision=?')
            .get(binding.runId, request.rulebook.ruleId, request.rulebook.revision) as Row | undefined;
          if (existing) {
            await this.verify(existing, binding, false);
            throw new ResearchAutomationConflictError('revision_conflict', 'This rule revision is already immutable.');
          }
          const artifact: AutomationMetricRuleAdoptionArtifact = {
            contractVersion: 'automation-metric-rule-adoption-v1', adoptionId: randomUUID(), ...binding,
            request, rulebookSha256: digest(request.rulebook), actorId: actor.actorId, actorRole: 'OWNER', adoptedAt: this.now().toISOString(),
          };
          if (!validArtifact(artifact)) failIntegrity();
          const stored = await store.put(bytes(artifact));
          this.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
            VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`)
            .run(stored.sha256, stored.byteSize, stored.relativePath, artifact.adoptedAt, artifact.adoptedAt);
          row = { adoption_id: artifact.adoptionId, workspace_id: binding.workspaceId, run_id: binding.runId,
            request_key: request.requestKey, request_json: canonicalJson(request), rule_id: request.rulebook.ruleId,
            rule_revision: request.rulebook.revision, start_sha256: binding.startSha256, scope_sha256: binding.scopeSha256,
            rulebook_sha256: artifact.rulebookSha256, artifact_sha256: stored.sha256, actor_id: actor.actorId, adopted_at: artifact.adoptedAt };
          this.db.prepare(`INSERT INTO analysis_metric_rule_adoptions(adoption_id,workspace_id,run_id,request_key,request_json,rule_id,rule_revision,
            start_sha256,scope_sha256,rulebook_sha256,artifact_sha256,actor_id,adopted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(row.adoption_id, row.workspace_id, row.run_id, row.request_key, row.request_json, row.rule_id, row.rule_revision,
              row.start_sha256, row.scope_sha256, row.rulebook_sha256, row.artifact_sha256, row.actor_id, row.adopted_at);
          await this.verify(row, binding, false);
        }
        this.db.exec('COMMIT');
      } catch (error) { if (this.db.inTransaction) this.db.exec('ROLLBACK'); throw error; }
      // Only the exact committed adoption artifact, never a root sweep or unrelated staged files.
      await store.publishOwned(row.artifact_sha256);
      return this.receipt(await this.verify(row, binding, false), exactRetry);
    });
  }

  async list(binding: MetricRuleBinding): Promise<AutomationMetricRuleAdoptionReceipt[]> {
    const rows = this.db.prepare('SELECT * FROM analysis_metric_rule_adoptions WHERE run_id=? ORDER BY adopted_at,adoption_id').all(binding.runId) as Row[];
    const result: AutomationMetricRuleAdoptionReceipt[] = [];
    for (const row of rows) result.push(this.receipt(await this.verify(row, binding, false), false));
    return result;
  }

  async read(binding: MetricRuleBinding, adoptionId: string): Promise<AutomationMetricRuleAdoptionArtifact> {
    const row = this.db.prepare('SELECT * FROM analysis_metric_rule_adoptions WHERE adoption_id=? AND run_id=?').get(adoptionId, binding.runId) as Row | undefined;
    if (!row) throw new ResearchAutomationNotFoundError('rule_adoption_not_found', 'Metric rule adoption was not found.');
    return this.verify(row, binding, false);
  }

  private receipt(artifact: AutomationMetricRuleAdoptionArtifact, exactRetry: boolean): AutomationMetricRuleAdoptionReceipt {
    return { contractVersion: 'automation-metric-rule-receipt-v1', adoptionId: artifact.adoptionId,
      workspaceId: artifact.workspaceId, runId: artifact.runId, adoptedAt: artifact.adoptedAt, rulebook: artifact.request.rulebook, exactRetry };
  }

  private async verify(row: Row, binding: MetricRuleBinding | undefined, repairMissing: boolean): Promise<AutomationMetricRuleAdoptionArtifact> {
    let request: unknown;
    try { request = JSON.parse(row.request_json); } catch { return failIntegrity(); }
    if (!validRequest(request) || canonicalJson(request) !== row.request_json || request.requestKey !== row.request_key ||
        request.rulebook.ruleId !== row.rule_id || request.rulebook.revision !== Number(row.rule_revision) ||
        new Set(request.rulebook.groups.map(group => group.key)).size !== request.rulebook.groups.length ||
        digest(request.rulebook) !== row.rulebook_sha256) return failIntegrity();
    const artifact: AutomationMetricRuleAdoptionArtifact = {
      contractVersion: 'automation-metric-rule-adoption-v1', adoptionId: row.adoption_id, workspaceId: row.workspace_id,
      runId: row.run_id, startSha256: row.start_sha256, scopeSha256: row.scope_sha256, request,
      rulebookSha256: row.rulebook_sha256, actorId: row.actor_id, actorRole: 'OWNER', adoptedAt: row.adopted_at,
    };
    if (!validArtifact(artifact) || digest(artifact) !== row.artifact_sha256) return failIntegrity();
    if (binding && (artifact.workspaceId !== binding.workspaceId || artifact.runId !== binding.runId ||
        artifact.startSha256 !== binding.startSha256 || artifact.scopeSha256 !== binding.scopeSha256)) return failIntegrity();
    const manifest = this.db.prepare(`SELECT byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at
      FROM artifact_manifests WHERE sha256=?`).get(row.artifact_sha256) as
      { byte_size: number | bigint; media_type: string; relative_path: string; acquired_at: string;
        contract_version: string; retention_status: string; created_at: string } | undefined;
    const expected = bytes(artifact);
    if (!manifest || Number(manifest.byte_size) !== expected.length || manifest.media_type !== 'application/json' ||
        manifest.relative_path !== `sha256/${row.artifact_sha256.slice(0, 2)}/${row.artifact_sha256}` ||
        manifest.contract_version !== '1.0.0' || manifest.retention_status !== 'active' ||
        manifest.acquired_at !== row.adopted_at || manifest.created_at !== row.adopted_at) return failIntegrity();
    let stored: Buffer;
    try { stored = await (this.staging ?? this.artifacts).read(row.artifact_sha256, { maxBytes: 32 * 1024 }); }
    catch (error) {
      if (!repairMissing || !this.staging || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // The immutable row reconstructs the exact registered bytes. Only an authorized exact retry publishes them.
      await this.staging.put(expected);
      stored = await this.staging.read(row.artifact_sha256, { maxBytes: 32 * 1024 });
    }
    if (!stored.equals(expected)) return failIntegrity();
    return artifact;
  }
}

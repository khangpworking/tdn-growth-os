import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { ContentInsightArtifact, ContentInsightContent } from '../../../contracts/flow/content-insight-artifact.generated.js';
import type { ContentInsightB10Clearance, ContentInsightLockArtifact } from '../../../contracts/flow/content-insight-lock-artifact.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import type { ProductB10DecisionByIdReader, ProductB10EffectiveStatusReader } from '../governance/index.js';
import {
  assertContentUuid,
  canonicalBytes,
  canonicalDigest,
  canonicalSnapshot,
  readCanonicalJsonArtifact,
  registerContentManifest,
  sha256,
} from './content-artifacts.js';
import type { ContentCampaignService } from './content-campaign-service.js';
import type { LockedStpReader } from './locked-stp-reader.js';
import {
  FlowValidationError,
  validateContentInsightArtifact,
  validateContentInsightLockArtifact,
  validateContentInsightLockRequest,
  validateContentInsightRevisionRequest,
} from './validation.js';

export class ContentInsightConflictError extends Error {}

/** An STP-sourced insight names a locked STP that is missing or belongs to another research product. */
export class ContentInsightReferenceError extends Error {}

/** D26: a campaign linked to a research product cannot lock its insight until B10 approved that product. */
export class ContentInsightGateError extends Error {
  readonly reason: string;
  constructor(message: string, reason: string) { super(message); this.reason = reason; }
}

export const INSIGHT_GATE_NOT_APPROVED = 'Sản phẩm nghiên cứu chưa được duyệt ở B10 — chưa thể khóa Insight';
export const INSIGHT_GATE_UNAVAILABLE = 'Không đọc được trạng thái duyệt B10 của sản phẩm nghiên cứu — chưa thể khóa Insight';

export type ContentInsightB10Reader = ProductB10EffectiveStatusReader & ProductB10DecisionByIdReader;

export interface ContentInsightExecution {
  readonly campaignId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface ContentInsightLockExecution {
  readonly campaignId: string;
  readonly insightVersion: number;
  readonly campaignVersion: number;
  readonly lockedAt: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface ContentInsightHistoryRow {
  readonly version: number;
  readonly sourceKind: 'TYPED' | 'STP';
  readonly createdAt: string;
}

interface InsightRow {
  readonly campaignId: string;
  readonly version: number;
  readonly sourceKind: 'TYPED' | 'STP';
  readonly lockedStpId: string | null;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

interface LockRow {
  readonly campaignId: string;
  readonly insightVersion: number;
  readonly campaignVersion: number;
  readonly b10DecisionId: string | null;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

/** Campaign insight (Task 050a, B11 step 3): immutable customer/pain/insight versions, then one lock gated by B10 (D26). */
export class ContentInsightService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #campaigns: ContentCampaignService;
  readonly #lockedStps: LockedStpReader | undefined;
  readonly #b10: ContentInsightB10Reader | undefined;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly campaigns: ContentCampaignService;
    readonly lockedStpReader?: LockedStpReader;
    readonly b10Reader?: ContentInsightB10Reader;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#campaigns = options.campaigns;
    this.#lockedStps = options.lockedStpReader;
    this.#b10 = options.b10Reader;
    this.#now = options.now ?? (() => new Date());
  }

  async reviseInsight(untrustedInput: unknown): Promise<ContentInsightExecution> {
    const input = canonicalSnapshot(validateContentInsightRevisionRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    if (!this.#campaigns.campaignExists(input.campaignId)) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const targetVersion = input.expectedVersion + 1;
    const existingTarget = this.#insight(input.campaignId, targetVersion);
    if (existingTarget) {
      const result = revisionRetry(requestSha256, existingTarget);
      await this.readInsight(input.campaignId, targetVersion);
      return result;
    }
    this.#assertWritable(input.campaignId, input.expectedVersion);
    if (input.insight.source.kind === 'STP') await this.#assertStpSource(input.campaignId, input.insight.source.lockedStpId);

    const createdAt = this.#now().toISOString();
    const artifact = insightArtifact(input.campaignId, targetVersion, input.insight, createdAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentInsightArtifact(artifact)));
    const lockedStpId = input.insight.source.kind === 'STP' ? input.insight.source.lockedStpId : null;

    const execute = this.#db.transaction((): ContentInsightExecution => {
      const concurrentTarget = this.#insight(input.campaignId, targetVersion);
      if (concurrentTarget) return revisionRetry(requestSha256, concurrentTarget);
      this.#assertWritable(input.campaignId, input.expectedVersion);
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_content_insight_revisions(campaign_id, version, source_kind, locked_stp_id, request_sha256, insight_artifact_sha256, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.campaignId, targetVersion, input.insight.source.kind, lockedStpId, requestSha256, stored.sha256, createdAt).changes;
      return { campaignId: input.campaignId, version: targetVersion, createdAt, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readInsight(result.campaignId, result.version);
    return result;
  }

  async lockInsight(untrustedInput: unknown): Promise<ContentInsightLockExecution> {
    const input = canonicalSnapshot(validateContentInsightLockRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    if (!this.#campaigns.campaignExists(input.campaignId)) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const existing = this.#lock(input.campaignId);
    if (existing) {
      const result = lockRetry(requestSha256, existing);
      await this.readLock(input.campaignId);
      return result;
    }
    this.#assertLockable(input.campaignId, input.insightVersion, input.campaignVersion);
    const insight = this.#insight(input.campaignId, input.insightVersion)!;
    const source = (await this.readInsight(input.campaignId, input.insightVersion)).insight.source;
    // The campaign may have been relinked or unlinked after an STP-sourced revision was saved.
    if (source.kind === 'STP') {
      try { await this.#assertStpSource(input.campaignId, source.lockedStpId); }
      catch (error) {
        if (error instanceof ContentInsightReferenceError) throw new ContentInsightConflictError(`Insight STP source no longer matches the campaign: ${error.message}`);
        throw error;
      }
    }
    const campaign = await this.#campaigns.readCampaign(input.campaignId, input.campaignVersion);
    const campaignArtifactSha256 = this.#campaignArtifactSha256(input.campaignId, input.campaignVersion);
    const b10 = await this.#clearance(campaign.campaign.researchProductWorkspaceId);

    const lockedAt = this.#now().toISOString();
    const artifact = lockArtifact(input.campaignId, input.insightVersion, input.campaignVersion, insight.artifactSha256, campaignArtifactSha256, b10, lockedAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentInsightLockArtifact(artifact)));

    const execute = this.#db.transaction((): ContentInsightLockExecution => {
      const concurrent = this.#lock(input.campaignId);
      if (concurrent) return lockRetry(requestSha256, concurrent);
      this.#assertLockable(input.campaignId, input.insightVersion, input.campaignVersion);
      let databaseMutations = registerContentManifest(this.#db, stored, lockedAt, 'application/json');
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_content_insight_locks(campaign_id, insight_version, campaign_version, b10_decision_id, request_sha256, lock_artifact_sha256, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.campaignId, input.insightVersion, input.campaignVersion, b10?.effectiveDecisionId ?? null, requestSha256, stored.sha256, lockedAt).changes;
      return { campaignId: input.campaignId, insightVersion: input.insightVersion, campaignVersion: input.campaignVersion, lockedAt, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readLock(result.campaignId);
    return result;
  }

  async readInsight(campaignId: string, version?: number): Promise<ContentInsightArtifact> {
    assertId(campaignId);
    const row = version === undefined ? this.#latestInsight(campaignId) : this.#insight(campaignId, version);
    if (!row) throw new FlowValidationError(`Insight revision not found: ${campaignId}`);
    const artifact = validateContentInsightArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const request = validateContentInsightRevisionRequest({ contractVersion: '1.0.0', campaignId: artifact.campaignId, expectedVersion: artifact.version - 1, insight: artifact.insight });
    const source = artifact.insight.source;
    if (
      canonicalDigest(request) !== artifact.requestSha256 ||
      artifact.campaignId !== row.campaignId ||
      artifact.version !== row.version ||
      source.kind !== row.sourceKind ||
      (source.kind === 'STP' ? source.lockedStpId : null) !== row.lockedStpId ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new ContentInsightConflictError('Insight artifact does not match immutable metadata');
    return artifact;
  }

  async readLock(campaignId: string): Promise<ContentInsightLockArtifact | undefined> {
    assertId(campaignId);
    const row = this.#lock(campaignId);
    if (!row) return undefined;
    const artifact = validateContentInsightLockArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const request = validateContentInsightLockRequest({ contractVersion: '1.0.0', campaignId: artifact.campaignId, insightVersion: artifact.insightVersion, campaignVersion: artifact.campaignVersion });
    if (
      canonicalDigest(request) !== artifact.requestSha256 ||
      artifact.campaignId !== row.campaignId ||
      artifact.insightVersion !== row.insightVersion ||
      artifact.campaignVersion !== row.campaignVersion ||
      (artifact.b10?.effectiveDecisionId ?? null) !== row.b10DecisionId ||
      artifact.insightArtifactSha256 !== this.#insight(campaignId, row.insightVersion)?.artifactSha256 ||
      artifact.campaignArtifactSha256 !== this.#campaignArtifactSha256(campaignId, row.campaignVersion) ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.lockedAt !== row.createdAt
    ) throw new ContentInsightConflictError('Insight lock artifact does not match immutable metadata');
    return artifact;
  }

  history(campaignId: string): ContentInsightHistoryRow[] {
    return (this.#db.prepare('SELECT version, source_kind sourceKind, created_at createdAt FROM flow_content_insight_revisions WHERE campaign_id = ? ORDER BY version').all(campaignId) as { version: bigint | number; sourceKind: 'TYPED' | 'STP'; createdAt: string }[])
      .map((row) => ({ ...row, version: Number(row.version) }));
  }

  latestVersion(campaignId: string): number { return this.#latestInsight(campaignId)?.version ?? 0; }

  isLocked(campaignId: string): boolean { return this.#lock(campaignId) !== undefined; }

  /** D26 for display: whether this campaign's research product (if any) currently clears B10. */
  async gate(researchProductWorkspaceId: string | undefined): Promise<{ required: boolean; ready: boolean; effectiveDecision?: 'APPROVE' | 'HOLD' | 'REJECT'; reason?: string }> {
    if (researchProductWorkspaceId === undefined) return { required: false, ready: true };
    if (!this.#b10) return { required: true, ready: false, reason: INSIGHT_GATE_UNAVAILABLE };
    const status = await this.#b10.readStatusByProductWorkspace(researchProductWorkspaceId);
    if (!status.decisionExists) return { required: true, ready: false, reason: INSIGHT_GATE_NOT_APPROVED };
    return { required: true, ready: status.readyForB11, effectiveDecision: status.effectiveDecision, ...(status.readyForB11 ? {} : { reason: INSIGHT_GATE_NOT_APPROVED }) };
  }

  /** Re-stages the exact artifact of a committed revision or lock whose artifact file was never published. */
  async restoreExactArtifact(untrustedInput: unknown): Promise<boolean> {
    const isRevision = typeof untrustedInput === 'object' && untrustedInput !== null && 'insight' in untrustedInput;
    return isRevision ? this.#restoreRevision(untrustedInput) : this.#restoreLock(untrustedInput);
  }

  async #restoreRevision(untrustedInput: unknown): Promise<boolean> {
    const input = canonicalSnapshot(validateContentInsightRevisionRequest(untrustedInput));
    const row = this.#insight(input.campaignId, input.expectedVersion + 1);
    if (!row || row.requestSha256 !== canonicalDigest(input) || !(await this.#missing(row.artifactSha256))) return false;
    const restored = canonicalBytes(validateContentInsightArtifact(insightArtifact(row.campaignId, row.version, input.insight, row.createdAt, row.requestSha256)));
    if (sha256(restored) !== row.artifactSha256) throw new ContentInsightConflictError('Committed insight artifact cannot be reconstructed');
    await this.#artifacts.put(restored);
    return true;
  }

  async #restoreLock(untrustedInput: unknown): Promise<boolean> {
    const input = canonicalSnapshot(validateContentInsightLockRequest(untrustedInput));
    const row = this.#lock(input.campaignId);
    if (!row || row.requestSha256 !== canonicalDigest(input) || !(await this.#missing(row.artifactSha256))) return false;
    let b10: ContentInsightB10Clearance | undefined;
    if (row.b10DecisionId !== null) {
      if (!this.#b10) throw new ContentInsightConflictError('Committed insight lock cannot be reconstructed without B10 decisions');
      const decision = await this.#b10.readVerifiedDecision(row.b10DecisionId);
      b10 = { productWorkspaceId: decision.productWorkspaceId, lockedStpId: decision.lockedStp.lockId, effectiveDecisionId: decision.decisionId, effectiveDecisionNumber: decision.decisionNumber, effectiveDecision: 'APPROVE' };
    }
    const insightSha = this.#insight(row.campaignId, row.insightVersion)!.artifactSha256;
    const artifact = lockArtifact(row.campaignId, row.insightVersion, row.campaignVersion, insightSha, this.#campaignArtifactSha256(row.campaignId, row.campaignVersion), b10, row.createdAt, row.requestSha256);
    const restored = canonicalBytes(validateContentInsightLockArtifact(artifact));
    if (sha256(restored) !== row.artifactSha256) throw new ContentInsightConflictError('Committed insight lock artifact cannot be reconstructed');
    await this.#artifacts.put(restored);
    return true;
  }

  async #missing(digest: string): Promise<boolean> {
    try { await fs.access(this.#artifacts.pathForDigest(digest)); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return true; }
  }

  #assertWritable(campaignId: string, expectedVersion: number): void {
    if (this.latestVersion(campaignId) !== expectedVersion) throw new ContentInsightConflictError('Insight version or content drift');
    if (this.#lock(campaignId)) throw new ContentInsightConflictError('Insight is locked and cannot be revised');
    if (this.#campaigns.lifecycleState(campaignId).deleted) throw new ContentInsightConflictError('Campaign is deleted and its insight cannot change');
  }

  #assertLockable(campaignId: string, insightVersion: number, campaignVersion: number): void {
    const latestCampaign = this.#campaigns.campaignVersions(campaignId).at(-1);
    if (this.latestVersion(campaignId) !== insightVersion || latestCampaign !== campaignVersion) throw new ContentInsightConflictError('Insight or campaign version drift');
    if (this.#campaigns.lifecycleState(campaignId).deleted) throw new ContentInsightConflictError('Campaign is deleted and its insight cannot be locked');
  }

  /** An STP-sourced insight must come from the locked STP of the campaign's own research product. */
  async #assertStpSource(campaignId: string, lockedStpId: string): Promise<void> {
    const workspaceId = (await this.#campaigns.readCampaign(campaignId)).campaign.researchProductWorkspaceId;
    if (workspaceId === undefined) throw new ContentInsightReferenceError('Campaign has no research product to take an STP from');
    if (!this.#lockedStps) throw new ContentInsightReferenceError('Locked STPs are not available');
    let locked;
    try { locked = await this.#lockedStps.readVerifiedLockedStp(lockedStpId); }
    catch (error) {
      if (error instanceof FlowValidationError && /^Locked STP not found/.test(error.details)) throw new ContentInsightReferenceError(`Unknown locked STP: ${lockedStpId}`);
      throw error;
    }
    if (locked.productWorkspace.artifact.productWorkspaceId !== workspaceId) throw new ContentInsightReferenceError('Locked STP belongs to another research product');
  }

  async #clearance(workspaceId: string | undefined): Promise<ContentInsightB10Clearance | undefined> {
    if (workspaceId === undefined) return undefined;
    if (!this.#b10) throw new ContentInsightGateError('B10 status is not available', INSIGHT_GATE_UNAVAILABLE);
    const status = await this.#b10.readStatusByProductWorkspace(workspaceId);
    if (!status.decisionExists || !status.readyForB11 || status.effectiveDecision !== 'APPROVE') throw new ContentInsightGateError('Research product is not B10-approved', INSIGHT_GATE_NOT_APPROVED);
    return { productWorkspaceId: status.productWorkspaceId, lockedStpId: status.lockedStpId, effectiveDecisionId: status.effectiveDecisionId, effectiveDecisionNumber: status.effectiveDecisionNumber, effectiveDecision: 'APPROVE' };
  }

  #campaignArtifactSha256(campaignId: string, version: number): string {
    const row = this.#db.prepare('SELECT campaign_artifact_sha256 sha FROM flow_content_campaign_revisions WHERE campaign_id = ? AND version = ?').get(campaignId, version) as { sha: string } | undefined;
    if (!row) throw new ContentInsightConflictError('Campaign revision is missing');
    return row.sha;
  }

  #insight(campaignId: string, version: number): InsightRow | undefined {
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive safe integer');
    return this.#insightQuery('campaign_id = ? AND version = ?', campaignId, version);
  }

  #latestInsight(campaignId: string): InsightRow | undefined { return this.#insightQuery('campaign_id = ?', campaignId); }

  #insightQuery(where: string, ...values: unknown[]): InsightRow | undefined {
    const row = this.#db.prepare(`
      SELECT campaign_id campaignId, version, source_kind sourceKind, locked_stp_id lockedStpId, request_sha256 requestSha256,
        insight_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_content_insight_revisions WHERE ${where} ORDER BY version DESC LIMIT 1
    `).get(...values) as (Omit<InsightRow, 'version'> & { version: bigint | number }) | undefined;
    return row ? { ...row, version: Number(row.version) } : undefined;
  }

  #lock(campaignId: string): LockRow | undefined {
    const row = this.#db.prepare(`
      SELECT campaign_id campaignId, insight_version insightVersion, campaign_version campaignVersion, b10_decision_id b10DecisionId,
        request_sha256 requestSha256, lock_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_content_insight_locks WHERE campaign_id = ?
    `).get(campaignId) as (Omit<LockRow, 'insightVersion' | 'campaignVersion'> & { insightVersion: bigint | number; campaignVersion: bigint | number }) | undefined;
    return row ? { ...row, insightVersion: Number(row.insightVersion), campaignVersion: Number(row.campaignVersion) } : undefined;
  }
}

function revisionRetry(requestSha256: string, row: InsightRow): ContentInsightExecution {
  if (row.requestSha256 !== requestSha256) throw new ContentInsightConflictError('Insight version already exists with changed content');
  return { campaignId: row.campaignId, version: row.version, createdAt: row.createdAt, deduplicated: true, databaseMutations: 0 };
}

function lockRetry(requestSha256: string, row: LockRow): ContentInsightLockExecution {
  if (row.requestSha256 !== requestSha256) throw new ContentInsightConflictError('Insight is already locked with changed content');
  return { campaignId: row.campaignId, insightVersion: row.insightVersion, campaignVersion: row.campaignVersion, lockedAt: row.createdAt, deduplicated: true, databaseMutations: 0 };
}

function insightArtifact(campaignId: string, version: number, insight: ContentInsightContent, createdAt: string, requestSha256: string): ContentInsightArtifact {
  return { contractVersion: '1.0.0', campaignId, version, insight, createdAt, requestSha256 };
}

function lockArtifact(
  campaignId: string, insightVersion: number, campaignVersion: number, insightArtifactSha256: string, campaignArtifactSha256: string,
  b10: ContentInsightB10Clearance | undefined, lockedAt: string, requestSha256: string,
): ContentInsightLockArtifact {
  return { contractVersion: '1.0.0', campaignId, insightVersion, campaignVersion, insightArtifactSha256, campaignArtifactSha256, ...(b10 ? { b10 } : {}), lockedAt, requestSha256 };
}

function assertId(value: string): void {
  try { assertContentUuid(value); } catch { throw new FlowValidationError('ID must be a UUID'); }
}

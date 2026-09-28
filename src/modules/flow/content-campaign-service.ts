import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { ContentCampaignArtifact } from '../../../contracts/flow/content-campaign-artifact.generated.js';
import type { ContentCampaignContent } from '../../../contracts/flow/content-campaign-create-request.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import {
  assertContentUuid,
  canonicalBytes,
  canonicalDigest,
  canonicalSnapshot,
  readCanonicalJsonArtifact,
  registerContentManifest,
  sha256,
} from './content-artifacts.js';
import type { ContentCatalogService } from './content-catalog-service.js';
import type { ProductWorkspaceReader } from './product-workspace-reader.js';
import {
  FlowValidationError,
  validateContentCampaignArtifact,
  validateContentCampaignCreateRequest,
  validateContentCampaignLifecycleRequest,
  validateContentCampaignRevisionRequest,
} from './validation.js';

export class ContentCampaignConflictError extends Error {}

/** A campaign points at a brand, catalog item version, tier or research workspace that does not exist. */
export class ContentCampaignReferenceError extends Error {}

/** Deleted campaigns stay restorable for this long; the database enforces the same window. */
export const CAMPAIGN_RESTORE_DAYS = 30;

export interface ContentCampaignExecution {
  readonly campaignId: string;
  readonly campaignArtifactSha256: string;
  readonly version: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface ContentCampaignRow {
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly brandId: string;
  readonly version: number;
  readonly campaignName: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

export interface ContentCampaignLifecycleState {
  readonly sequence: number;
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
  readonly expired: boolean;
}

export interface ContentCampaignLifecycleExecution {
  readonly campaignId: string;
  readonly sequence: number;
  readonly action: 'DELETE' | 'RESTORE';
  readonly createdAt: string;
  readonly restorableUntil?: string;
  readonly deduplicated: boolean;
}

/** Brand-scoped content campaigns (Task 048d): immutable versions over exact catalog item versions, plus a delete/restore lifecycle. */
export class ContentCampaignService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #catalog: ContentCatalogService;
  readonly #workspaces: ProductWorkspaceReader | undefined;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly catalog: ContentCatalogService;
    readonly workspaceReader?: ProductWorkspaceReader;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#catalog = options.catalog;
    this.#workspaces = options.workspaceReader;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createCampaign(untrustedInput: unknown): Promise<ContentCampaignExecution> {
    const input = canonicalSnapshot(validateContentCampaignCreateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const existing = this.#byKey(input.campaignKey);
    if (existing) {
      const result = this.#retry(requestSha256, this.#versionOne(existing.campaignId));
      await this.readCampaign(result.campaignId, 1);
      return result;
    }
    await this.#assertReferences(input.brandId, input.campaign);

    const campaignId = this.#uuid();
    assertId(campaignId);
    const createdAt = this.#now().toISOString();
    const artifact = campaignArtifact(campaignId, input.campaignKey, input.brandId, 1, input.campaign, createdAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentCampaignArtifact(artifact)));

    const execute = this.#db.transaction((): ContentCampaignExecution => {
      const concurrent = this.#byKey(input.campaignKey);
      if (concurrent) return this.#retry(requestSha256, this.#versionOne(concurrent.campaignId));
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#db.prepare('INSERT INTO flow_content_campaigns(campaign_id, campaign_key, brand_id, created_at) VALUES (?, ?, ?, ?)').run(campaignId, input.campaignKey, input.brandId, createdAt).changes;
      databaseMutations += this.#insertRevision(campaignId, 1, input.campaign.name, requestSha256, stored.sha256, createdAt);
      return { campaignId, campaignArtifactSha256: stored.sha256, version: 1, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readCampaign(result.campaignId, 1);
    return result;
  }

  async reviseCampaign(untrustedInput: unknown): Promise<ContentCampaignExecution> {
    const input = canonicalSnapshot(validateContentCampaignRevisionRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const current = this.#byId(input.campaignId);
    if (!current) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const targetVersion = input.expectedVersion + 1;
    const existingTarget = this.#version(input.campaignId, targetVersion);
    if (existingTarget) {
      const result = this.#retry(requestSha256, existingTarget);
      await this.readCampaign(input.campaignId, targetVersion);
      return result;
    }
    if (current.version !== input.expectedVersion) throw new ContentCampaignConflictError('Campaign version or content drift');
    if (this.lifecycleState(input.campaignId).deleted) throw new ContentCampaignConflictError('Campaign is deleted and cannot be revised');
    // Once the insight is locked (Task 050a), the products and research link it was locked against stay fixed.
    const insightLocked = this.#insightLocked(input.campaignId);
    if (insightLocked && lockPinned(input.campaign) !== lockPinned((await this.readCampaign(input.campaignId)).campaign)) {
      throw new ContentCampaignConflictError('Campaign insight lock prevents changed content');
    }
    await this.#assertReferences(current.brandId, input.campaign);

    const createdAt = this.#now().toISOString();
    const artifact = campaignArtifact(current.campaignId, current.campaignKey, current.brandId, targetVersion, input.campaign, createdAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentCampaignArtifact(artifact)));

    const execute = this.#db.transaction((): ContentCampaignExecution => {
      const concurrentTarget = this.#version(input.campaignId, targetVersion);
      if (concurrentTarget) return this.#retry(requestSha256, concurrentTarget);
      if (this.#byId(input.campaignId)!.version !== input.expectedVersion) throw new ContentCampaignConflictError('Campaign version or content drift');
      if (this.lifecycleState(input.campaignId).deleted) throw new ContentCampaignConflictError('Campaign is deleted and cannot be revised');
      if (!insightLocked && this.#insightLocked(input.campaignId)) throw new ContentCampaignConflictError('Campaign insight lock drift');
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#insertRevision(input.campaignId, targetVersion, input.campaign.name, requestSha256, stored.sha256, createdAt);
      return { campaignId: input.campaignId, campaignArtifactSha256: stored.sha256, version: targetVersion, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readCampaign(result.campaignId, result.version);
    return result;
  }

  async readCampaign(campaignId: string, version?: number): Promise<ContentCampaignArtifact> {
    assertId(campaignId);
    const row = version === undefined ? this.#byId(campaignId) : this.#version(campaignId, version);
    if (!row) throw new FlowValidationError(`Campaign revision not found: ${campaignId}`);
    const artifact = validateContentCampaignArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const request = artifact.version === 1
      ? validateContentCampaignCreateRequest({ contractVersion: '1.0.0', campaignKey: artifact.campaignKey, brandId: artifact.brandId, campaign: artifact.campaign })
      : validateContentCampaignRevisionRequest({ contractVersion: '1.0.0', campaignId: artifact.campaignId, expectedVersion: artifact.version - 1, campaign: artifact.campaign });
    if (
      canonicalDigest(request) !== artifact.requestSha256 ||
      artifact.campaignId !== row.campaignId ||
      artifact.campaignKey !== row.campaignKey ||
      artifact.brandId !== row.brandId ||
      artifact.version !== row.version ||
      artifact.campaign.name !== row.campaignName ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new ContentCampaignConflictError('Campaign artifact does not match immutable metadata');
    return artifact;
  }

  async changeLifecycle(untrustedInput: unknown): Promise<ContentCampaignLifecycleExecution> {
    const input = validateContentCampaignLifecycleRequest(untrustedInput);
    if (!this.#byId(input.campaignId)) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const execute = this.#db.transaction((): ContentCampaignLifecycleExecution => {
      const target = this.#lifecycleRow(input.campaignId, input.expectedSequence + 1);
      if (target) {
        if (target.action !== input.action) throw new ContentCampaignConflictError('Campaign lifecycle drift');
        return lifecycleExecution(input.campaignId, target.sequence, target.action, target.createdAt, true);
      }
      const state = this.lifecycleState(input.campaignId);
      if (state.sequence !== input.expectedSequence) throw new ContentCampaignConflictError('Campaign lifecycle drift');
      if (input.action === 'DELETE' && state.deleted) throw new ContentCampaignConflictError('Campaign is already deleted');
      if (input.action === 'RESTORE' && (!state.deleted || state.expired)) throw new ContentCampaignConflictError(state.deleted ? 'Campaign restore window expired' : 'Campaign is not deleted');
      const createdAt = this.#now().toISOString();
      const last = this.#lifecycleRow(input.campaignId, state.sequence);
      if (last && Date.parse(createdAt) < Date.parse(last.createdAt)) throw new ContentCampaignConflictError('Campaign lifecycle change predates the last one');
      this.#db.prepare('INSERT INTO flow_content_campaign_lifecycle(campaign_id, sequence, action, created_at) VALUES (?, ?, ?, ?)').run(input.campaignId, input.expectedSequence + 1, input.action, createdAt);
      return lifecycleExecution(input.campaignId, input.expectedSequence + 1, input.action, createdAt, false);
    });
    return execute();
  }

  lifecycleState(campaignId: string): ContentCampaignLifecycleState {
    const last = this.#db.prepare('SELECT sequence, action, created_at createdAt FROM flow_content_campaign_lifecycle WHERE campaign_id = ? ORDER BY sequence DESC LIMIT 1').get(campaignId) as { sequence: bigint | number; action: 'DELETE' | 'RESTORE'; createdAt: string } | undefined;
    if (!last) return { sequence: 0, expired: false };
    if (last.action === 'RESTORE') return { sequence: Number(last.sequence), expired: false };
    const restorableUntil = campaignRestoreDeadline(last.createdAt);
    return { sequence: Number(last.sequence), deleted: { deletedAt: last.createdAt, restorableUntil }, expired: this.#now().getTime() > Date.parse(restorableUntil) };
  }

  /** Latest revision row of every campaign, in creation order. */
  listCampaigns(): ContentCampaignRow[] {
    return (this.#db.prepare(`
      SELECT ${ROW_COLUMNS} FROM flow_content_campaigns c JOIN flow_content_campaign_revisions r ON r.campaign_id = c.campaign_id
      WHERE r.version = (SELECT max(version) FROM flow_content_campaign_revisions WHERE campaign_id = c.campaign_id)
      ORDER BY c.created_at, c.campaign_id
    `).all() as RawRow[]).map(toRow);
  }

  campaignVersions(campaignId: string): number[] {
    return (this.#db.prepare('SELECT version FROM flow_content_campaign_revisions WHERE campaign_id = ? ORDER BY version').all(campaignId) as { version: bigint | number }[]).map((row) => Number(row.version));
  }

  campaignExists(campaignId: string): boolean { return this.#byId(campaignId) !== undefined; }

  campaignBrand(campaignId: string): string | undefined { return /^[0-9a-f-]{36}$/i.test(campaignId) ? this.#byId(campaignId)?.brandId : undefined; }

  /** Re-stages the exact artifact of a committed create/revision whose artifact file was never published. */
  async restoreExactArtifact(untrustedInput: unknown): Promise<boolean> {
    const isRevision = typeof untrustedInput === 'object' && untrustedInput !== null && 'campaignId' in untrustedInput;
    const input = canonicalSnapshot(isRevision ? validateContentCampaignRevisionRequest(untrustedInput) : validateContentCampaignCreateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const row = 'campaignId' in input
      ? this.#version(input.campaignId, input.expectedVersion + 1)
      : (() => { const existing = this.#byKey(input.campaignKey); return existing ? this.#version(existing.campaignId, 1) : undefined; })();
    if (!row || row.requestSha256 !== requestSha256) return false;
    try { await fs.access(this.#artifacts.pathForDigest(row.artifactSha256)); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const restored = canonicalBytes(validateContentCampaignArtifact(campaignArtifact(row.campaignId, row.campaignKey, row.brandId, row.version, input.campaign, row.createdAt, row.requestSha256)));
    if (sha256(restored) !== row.artifactSha256) throw new ContentCampaignConflictError('Committed campaign artifact cannot be reconstructed');
    await this.#artifacts.put(restored);
    return true;
  }

  /** Brand, exact item versions of that brand, their tiers and the optional research workspace must all exist and verify. */
  async #assertReferences(brandId: string, campaign: ContentCampaignContent): Promise<void> {
    if (!this.#db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?').get(brandId)) throw new ContentCampaignReferenceError(`Unknown brand: ${brandId}`);
    for (const ref of campaign.items) {
      if (this.#catalog.itemBrand(ref.itemId) !== brandId || !this.#catalog.itemVersions(ref.itemId).includes(ref.itemVersion)) {
        throw new ContentCampaignReferenceError(`Unknown catalog item version for this brand: ${ref.itemId} v${ref.itemVersion}`);
      }
      const item = await this.#catalog.readItem(ref.itemId, ref.itemVersion);
      const tierKeys = new Set(item.item.tiers.map((tier) => tier.tierKey));
      const missing = (ref.tierKeys ?? []).filter((tierKey) => !tierKeys.has(tierKey));
      if (missing.length > 0) throw new ContentCampaignReferenceError(`Unknown tier ${missing.join(', ')} of ${ref.itemId} v${ref.itemVersion}`);
    }
    const workspaceId = campaign.researchProductWorkspaceId;
    if (workspaceId === undefined) return;
    if (!this.#workspaces) throw new ContentCampaignReferenceError('Research product workspaces are not available');
    try { await this.#workspaces.readVerifiedProductWorkspace(workspaceId); }
    catch (error) {
      if (error instanceof FlowValidationError && /^Product workspace not found/.test(error.details)) throw new ContentCampaignReferenceError(`Unknown research product workspace: ${workspaceId}`);
      throw error;
    }
  }

  #retry(requestSha256: string, row: ContentCampaignRow): ContentCampaignExecution {
    if (row.requestSha256 !== requestSha256) throw new ContentCampaignConflictError('Campaign key or version already exists with changed content');
    return { campaignId: row.campaignId, campaignArtifactSha256: row.artifactSha256, version: row.version, deduplicated: true, databaseMutations: 0 };
  }

  #versionOne(campaignId: string): ContentCampaignRow {
    const row = this.#version(campaignId, 1);
    if (!row) throw new ContentCampaignConflictError('Campaign is missing version 1');
    return row;
  }

  #insertRevision(campaignId: string, version: number, name: string, requestSha256: string, artifactSha256: string, createdAt: string): number {
    return this.#db.prepare(`
      INSERT INTO flow_content_campaign_revisions(campaign_id, version, campaign_name, request_sha256, campaign_artifact_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(campaignId, version, name, requestSha256, artifactSha256, createdAt).changes;
  }

  #insightLocked(campaignId: string): boolean {
    return this.#db.prepare('SELECT 1 FROM flow_content_insight_locks WHERE campaign_id = ?').get(campaignId) !== undefined;
  }

  #lifecycleRow(campaignId: string, sequence: number): { sequence: number; action: 'DELETE' | 'RESTORE'; createdAt: string } | undefined {
    const row = this.#db.prepare('SELECT sequence, action, created_at createdAt FROM flow_content_campaign_lifecycle WHERE campaign_id = ? AND sequence = ?').get(campaignId, sequence) as { sequence: bigint | number; action: 'DELETE' | 'RESTORE'; createdAt: string } | undefined;
    return row ? { ...row, sequence: Number(row.sequence) } : undefined;
  }

  #byKey(campaignKey: string): ContentCampaignRow | undefined { return this.#query('c.campaign_key = ?', campaignKey); }
  #byId(campaignId: string): ContentCampaignRow | undefined { return this.#query('c.campaign_id = ?', campaignId); }
  #version(campaignId: string, version: number): ContentCampaignRow | undefined {
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive safe integer');
    return this.#query('c.campaign_id = ? AND r.version = ?', campaignId, version);
  }

  #query(where: string, ...values: unknown[]): ContentCampaignRow | undefined {
    const row = this.#db.prepare(`
      SELECT ${ROW_COLUMNS} FROM flow_content_campaigns c JOIN flow_content_campaign_revisions r ON r.campaign_id = c.campaign_id
      WHERE ${where} ORDER BY r.version DESC LIMIT 1
    `).get(...values) as RawRow | undefined;
    return row ? toRow(row) : undefined;
  }
}

const ROW_COLUMNS = `c.campaign_id campaignId, c.campaign_key campaignKey, c.brand_id brandId, r.version, r.campaign_name campaignName,
  r.request_sha256 requestSha256, r.campaign_artifact_sha256 artifactSha256, r.created_at createdAt`;
type RawRow = Omit<ContentCampaignRow, 'version'> & { version: bigint | number };
function toRow(row: RawRow): ContentCampaignRow { return { ...row, version: Number(row.version) }; }

function lockPinned(campaign: ContentCampaignContent): string {
  return canonicalDigest({ items: campaign.items, researchProductWorkspaceId: campaign.researchProductWorkspaceId ?? null });
}

export function campaignRestoreDeadline(deletedAt: string): string {
  return new Date(Date.parse(deletedAt) + CAMPAIGN_RESTORE_DAYS * 86_400_000).toISOString();
}

function lifecycleExecution(campaignId: string, sequence: number, action: 'DELETE' | 'RESTORE', createdAt: string, deduplicated: boolean): ContentCampaignLifecycleExecution {
  return { campaignId, sequence, action, createdAt, ...(action === 'DELETE' ? { restorableUntil: campaignRestoreDeadline(createdAt) } : {}), deduplicated };
}

function campaignArtifact(campaignId: string, campaignKey: string, brandId: string, version: number, campaign: ContentCampaignContent, createdAt: string, requestSha256: string): ContentCampaignArtifact {
  return { contractVersion: '1.0.0', campaignId, campaignKey, brandId, version, campaign, createdAt, requestSha256 };
}

function assertId(value: string): void {
  try { assertContentUuid(value); } catch { throw new FlowValidationError('ID must be a UUID'); }
}

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { ContentCatalogItemArtifact } from '../../../contracts/flow/content-catalog-item-artifact.generated.js';
import type { ContentCatalogItemContent } from '../../../contracts/flow/content-catalog-item-create-request.generated.js';
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
import { registeredContentMedia } from './content-media-service.js';
import {
  FlowValidationError,
  validateContentCatalogItemArtifact,
  validateContentCatalogItemCreateRequest,
  validateContentCatalogItemRevisionRequest,
} from './validation.js';

export class ContentCatalogIdentityConflictError extends Error {}

export interface ContentCatalogExecution {
  readonly itemId: string;
  readonly brandId: string;
  readonly itemArtifactSha256: string;
  readonly version: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface ContentCatalogRow {
  readonly itemId: string;
  readonly brandId: string;
  readonly itemKey: string;
  readonly version: number;
  readonly itemName: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

/** Catalog items (Task 048b): products and services of one brand, with tiers and photos; immutable sequential revisions. */
export class ContentCatalogService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: { readonly db: Database.Database; readonly artifactStore: ContentAddressedArtifactStore; readonly now?: () => Date; readonly uuid?: () => string }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createItem(untrustedInput: unknown): Promise<ContentCatalogExecution> {
    const input = canonicalSnapshot(validateContentCatalogItemCreateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const existing = this.#itemByKey(input.brandId, input.itemKey);
    if (existing) {
      const result = this.#retry(requestSha256, this.#versionOne(existing.itemId));
      await this.readItem(result.itemId, 1);
      return result;
    }
    if (!this.#db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?').get(input.brandId)) throw new FlowValidationError(`Content brand not found: ${input.brandId}`);
    this.#assertPhotos(input.brandId, input.item);

    const itemId = this.#uuid();
    assertId(itemId);
    const createdAt = this.#now().toISOString();
    const artifact = itemArtifact(itemId, input.brandId, input.itemKey, 1, input.item, createdAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentCatalogItemArtifact(artifact)));

    const execute = this.#db.transaction((): ContentCatalogExecution => {
      const concurrent = this.#itemByKey(input.brandId, input.itemKey);
      if (concurrent) return this.#retry(requestSha256, this.#versionOne(concurrent.itemId));
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#db.prepare('INSERT INTO flow_content_catalog_items(item_id, brand_id, item_key, created_at) VALUES (?, ?, ?, ?)').run(itemId, input.brandId, input.itemKey, createdAt).changes;
      databaseMutations += this.#insertRevision(itemId, 1, input.item.name, requestSha256, stored.sha256, createdAt);
      return { itemId, brandId: input.brandId, itemArtifactSha256: stored.sha256, version: 1, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readItem(result.itemId, 1);
    return result;
  }

  async reviseItem(untrustedInput: unknown): Promise<ContentCatalogExecution> {
    const input = canonicalSnapshot(validateContentCatalogItemRevisionRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const current = this.#itemById(input.itemId);
    if (!current) throw new FlowValidationError(`Catalog item not found: ${input.itemId}`);
    const targetVersion = input.expectedVersion + 1;
    const existingTarget = this.#itemVersion(input.itemId, targetVersion);
    if (existingTarget) {
      const result = this.#retry(requestSha256, existingTarget);
      await this.readItem(input.itemId, targetVersion);
      return result;
    }
    if (current.version !== input.expectedVersion) throw new ContentCatalogIdentityConflictError('Catalog item version or content drift');
    this.#assertPhotos(current.brandId, input.item);

    const createdAt = this.#now().toISOString();
    const artifact = itemArtifact(current.itemId, current.brandId, current.itemKey, targetVersion, input.item, createdAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentCatalogItemArtifact(artifact)));

    const execute = this.#db.transaction((): ContentCatalogExecution => {
      const concurrentTarget = this.#itemVersion(input.itemId, targetVersion);
      if (concurrentTarget) return this.#retry(requestSha256, concurrentTarget);
      const concurrent = this.#itemById(input.itemId)!;
      if (concurrent.version !== input.expectedVersion) throw new ContentCatalogIdentityConflictError('Catalog item version or content drift');
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#insertRevision(input.itemId, targetVersion, input.item.name, requestSha256, stored.sha256, createdAt);
      return { itemId: input.itemId, brandId: current.brandId, itemArtifactSha256: stored.sha256, version: targetVersion, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readItem(result.itemId, result.version);
    return result;
  }

  async readItem(itemId: string, version?: number): Promise<ContentCatalogItemArtifact> {
    assertId(itemId);
    const row = version === undefined ? this.#itemById(itemId) : this.#itemVersion(itemId, version);
    if (!row) throw new FlowValidationError(`Catalog item revision not found: ${itemId}`);
    const artifact = validateContentCatalogItemArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const request = artifact.version === 1
      ? validateContentCatalogItemCreateRequest({ contractVersion: '1.0.0', brandId: artifact.brandId, itemKey: artifact.itemKey, item: artifact.item })
      : validateContentCatalogItemRevisionRequest({ contractVersion: '1.0.0', itemId: artifact.itemId, expectedVersion: artifact.version - 1, item: artifact.item });
    if (
      canonicalDigest(request) !== artifact.requestSha256 ||
      artifact.itemId !== row.itemId ||
      artifact.brandId !== row.brandId ||
      artifact.itemKey !== row.itemKey ||
      artifact.version !== row.version ||
      artifact.item.name !== row.itemName ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new ContentCatalogIdentityConflictError('Catalog item artifact does not match immutable metadata');
    this.#assertPhotos(artifact.brandId, artifact.item);
    return artifact;
  }

  /** Latest revision row of every item of a brand, in creation order. */
  listItems(brandId: string): ContentCatalogRow[] {
    return (this.#db.prepare(`
      SELECT ${ROW_COLUMNS} FROM flow_content_catalog_items i
      JOIN flow_content_catalog_item_revisions r ON r.item_id = i.item_id
      WHERE i.brand_id = ? AND r.version = (SELECT max(version) FROM flow_content_catalog_item_revisions WHERE item_id = i.item_id)
      ORDER BY i.created_at, i.item_id
    `).all(brandId) as RawRow[]).map(toRow);
  }

  /** Revision numbers of an item, in order. */
  itemVersions(itemId: string): number[] {
    return (this.#db.prepare('SELECT version FROM flow_content_catalog_item_revisions WHERE item_id = ? ORDER BY version').all(itemId) as { version: bigint | number }[]).map((row) => Number(row.version));
  }

  itemBrand(itemId: string): string | undefined {
    return (this.#db.prepare('SELECT brand_id brandId FROM flow_content_catalog_items WHERE item_id = ?').get(itemId) as { brandId: string } | undefined)?.brandId;
  }

  /** Re-stages the exact artifact of a committed create/revision whose artifact file was never published. */
  async restoreExactArtifact(untrustedInput: unknown): Promise<boolean> {
    const isRevision = typeof untrustedInput === 'object' && untrustedInput !== null && 'itemId' in untrustedInput;
    const requestSha256 = canonicalDigest(canonicalSnapshot(isRevision ? validateContentCatalogItemRevisionRequest(untrustedInput) : validateContentCatalogItemCreateRequest(untrustedInput)));
    const input = untrustedInput as { itemId?: string; expectedVersion?: number; brandId?: string; itemKey?: string; item: ContentCatalogItemContent };
    const row = isRevision
      ? this.#itemVersion(input.itemId!, input.expectedVersion! + 1)
      : (() => { const existing = this.#itemByKey(input.brandId!, input.itemKey!); return existing ? this.#itemVersion(existing.itemId, 1) : undefined; })();
    if (!row || row.requestSha256 !== requestSha256) return false;
    try { await fs.access(this.#artifacts.pathForDigest(row.artifactSha256)); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const restored = canonicalBytes(validateContentCatalogItemArtifact(itemArtifact(row.itemId, row.brandId, row.itemKey, row.version, canonicalSnapshot(input.item), row.createdAt, row.requestSha256)));
    if (sha256(restored) !== row.artifactSha256) throw new ContentCatalogIdentityConflictError('Committed catalog artifact cannot be reconstructed');
    await this.#artifacts.put(restored);
    return true;
  }

  #assertPhotos(brandId: string, item: ContentCatalogItemContent): void {
    for (const photo of item.photos) {
      if (!registeredContentMedia(this.#db, brandId, 'PHOTO', photo.mediaSha256)) throw new FlowValidationError(`Catalog photo is not a registered photo of this brand: ${photo.mediaSha256}`);
    }
  }

  #retry(requestSha256: string, row: ContentCatalogRow): ContentCatalogExecution {
    if (row.requestSha256 !== requestSha256) throw new ContentCatalogIdentityConflictError('Catalog item key or version already exists with changed content');
    return { itemId: row.itemId, brandId: row.brandId, itemArtifactSha256: row.artifactSha256, version: row.version, deduplicated: true, databaseMutations: 0 };
  }

  #versionOne(itemId: string): ContentCatalogRow {
    const row = this.#itemVersion(itemId, 1);
    if (!row) throw new ContentCatalogIdentityConflictError('Catalog item is missing version 1');
    return row;
  }

  #insertRevision(itemId: string, version: number, name: string, requestSha256: string, artifactSha256: string, createdAt: string): number {
    return this.#db.prepare(`
      INSERT INTO flow_content_catalog_item_revisions(item_id, version, item_name, request_sha256, item_artifact_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(itemId, version, name, requestSha256, artifactSha256, createdAt).changes;
  }

  #itemByKey(brandId: string, itemKey: string): ContentCatalogRow | undefined { return this.#query('i.brand_id = ? AND i.item_key = ?', brandId, itemKey); }
  #itemById(itemId: string): ContentCatalogRow | undefined { return this.#query('i.item_id = ?', itemId); }
  #itemVersion(itemId: string, version: number): ContentCatalogRow | undefined {
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive safe integer');
    return this.#query('i.item_id = ? AND r.version = ?', itemId, version);
  }

  #query(where: string, ...values: unknown[]): ContentCatalogRow | undefined {
    const row = this.#db.prepare(`
      SELECT ${ROW_COLUMNS} FROM flow_content_catalog_items i
      JOIN flow_content_catalog_item_revisions r ON r.item_id = i.item_id
      WHERE ${where} ORDER BY r.version DESC LIMIT 1
    `).get(...values) as RawRow | undefined;
    return row ? toRow(row) : undefined;
  }
}

const ROW_COLUMNS = `i.item_id itemId, i.brand_id brandId, i.item_key itemKey, r.version, r.item_name itemName,
  r.request_sha256 requestSha256, r.item_artifact_sha256 artifactSha256, r.created_at createdAt`;
type RawRow = Omit<ContentCatalogRow, 'version'> & { version: bigint | number };
function toRow(row: RawRow): ContentCatalogRow { return { ...row, version: Number(row.version) }; }

function itemArtifact(itemId: string, brandId: string, itemKey: string, version: number, item: ContentCatalogItemContent, createdAt: string, requestSha256: string): ContentCatalogItemArtifact {
  return { contractVersion: '1.0.0', itemId, brandId, itemKey, version, item, createdAt, requestSha256 };
}

function assertId(value: string): void {
  try { assertContentUuid(value); } catch { throw new FlowValidationError('ID must be a UUID'); }
}

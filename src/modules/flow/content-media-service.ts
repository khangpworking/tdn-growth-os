import type Database from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { assertContentManifest, assertContentUuid, ContentArtifactIntegrityError, registerContentManifest, sha256 } from './content-artifacts.js';
import { inspectContentImage, type ContentImageType, type ContentMediaKind } from './content-image.js';
import { FlowValidationError } from './validation.js';

export interface ContentMediaRecord {
  readonly brandId: string;
  readonly kind: ContentMediaKind;
  readonly mediaSha256: string;
  readonly mediaType: ContentImageType;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

interface MediaRow { brandId: string; kind: ContentMediaKind; mediaSha256: string; mediaType: ContentImageType; width: bigint | number; height: bigint | number; byteSize: bigint | number }

const MEDIA_COLUMNS = 'brand_id brandId, media_kind kind, media_sha256 mediaSha256, media_type mediaType, width, height, byte_size byteSize';

/** Returns the registered media row, or undefined; checks that its manifest agrees. */
export function registeredContentMedia(db: Database.Database, brandId: string, kind: ContentMediaKind, mediaSha256: string): ContentMediaRecord | undefined {
  const row = db.prepare(`SELECT ${MEDIA_COLUMNS} FROM flow_content_media WHERE brand_id = ? AND media_kind = ? AND media_sha256 = ?`).get(brandId, kind, mediaSha256) as MediaRow | undefined;
  if (!row) return undefined;
  const record = toRecord(row);
  assertContentManifest(db, record.mediaSha256, record.byteSize, record.mediaType);
  return record;
}

/**
 * Brand-scoped reference images (logo, catalog photos). Bytes live in the private
 * content-addressed store; each upload is validated structurally and registered once
 * per brand and kind. Rows are immutable.
 */
export class ContentMediaService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;

  constructor(options: { readonly db: Database.Database; readonly artifactStore: ContentAddressedArtifactStore; readonly now?: () => Date }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#now = options.now ?? (() => new Date());
  }

  async registerMedia(input: { readonly brandId: string; readonly kind: ContentMediaKind; readonly declaredType: string; readonly bytes: Buffer }): Promise<ContentMediaRecord & { readonly exactRetry: boolean }> {
    assertBrandId(input.brandId);
    if (!this.#brandExists(input.brandId)) throw new FlowValidationError(`Content brand not found: ${input.brandId}`);
    const info = inspectContentImage(input.bytes, { declaredType: input.declaredType, kind: input.kind });
    const stored = await this.#artifacts.put(input.bytes);
    const createdAt = this.#now().toISOString();
    const execute = this.#db.transaction((): boolean => {
      const existing = registeredContentMedia(this.#db, input.brandId, input.kind, stored.sha256);
      if (existing) {
        if (existing.mediaType !== info.mediaType || existing.width !== info.width || existing.height !== info.height || existing.byteSize !== info.byteSize) throw new ContentArtifactIntegrityError('Registered media metadata mismatch');
        return true;
      }
      registerContentManifest(this.#db, stored, createdAt, info.mediaType);
      this.#db.prepare(`
        INSERT INTO flow_content_media(brand_id, media_kind, media_sha256, media_type, width, height, byte_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.brandId, input.kind, stored.sha256, info.mediaType, info.width, info.height, info.byteSize, createdAt);
      return false;
    });
    const exactRetry = execute();
    return { brandId: input.brandId, kind: input.kind, mediaSha256: stored.sha256, mediaType: info.mediaType, width: info.width, height: info.height, byteSize: info.byteSize, exactRetry };
  }

  /** Reads media registered for a brand under any kind, verifying manifest, digest and image structure. */
  async readMedia(brandId: string, mediaSha256: string): Promise<{ readonly media: ContentMediaRecord; readonly bytes: Buffer }> {
    assertBrandId(brandId);
    if (!/^[0-9a-f]{64}$/.test(mediaSha256)) throw new FlowValidationError('Media digest must be a SHA-256 hex digest');
    const rows = (this.#db.prepare(`SELECT ${MEDIA_COLUMNS} FROM flow_content_media WHERE brand_id = ? AND media_sha256 = ? ORDER BY media_kind`).all(brandId, mediaSha256) as MediaRow[]).map(toRecord);
    if (rows.length === 0) throw new FlowValidationError(`Content media not found: ${mediaSha256}`);
    return { media: rows[0]!, bytes: await this.verifyMedia(rows[0]!, rows) };
  }

  /** Verifies the stored bytes of a registered media row (used before a record references it). */
  async verifyRegistered(brandId: string, kind: ContentMediaKind, mediaSha256: string): Promise<ContentMediaRecord> {
    const record = registeredContentMedia(this.#db, brandId, kind, mediaSha256);
    if (!record) throw new FlowValidationError(`Content media not registered as ${kind}: ${mediaSha256}`);
    await this.verifyMedia(record, [record]);
    return record;
  }

  async verifyMedia(record: ContentMediaRecord, sameBytes: readonly ContentMediaRecord[]): Promise<Buffer> {
    const bytes = await this.#artifacts.read(record.mediaSha256);
    if (sha256(bytes) !== record.mediaSha256) throw new ContentArtifactIntegrityError('Media digest mismatch');
    assertContentManifest(this.#db, record.mediaSha256, bytes.byteLength, record.mediaType);
    for (const row of sameBytes) {
      const info = inspectContentImage(bytes, { declaredType: row.mediaType, kind: row.kind });
      if (info.width !== row.width || info.height !== row.height || info.byteSize !== row.byteSize) throw new ContentArtifactIntegrityError('Media metadata mismatch');
    }
    return bytes;
  }

  #brandExists(brandId: string): boolean {
    return this.#db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?').get(brandId) !== undefined;
  }
}

function toRecord(row: MediaRow): ContentMediaRecord {
  return { brandId: row.brandId, kind: row.kind, mediaSha256: row.mediaSha256, mediaType: row.mediaType, width: Number(row.width), height: Number(row.height), byteSize: Number(row.byteSize) };
}

function assertBrandId(brandId: string): void {
  try { assertContentUuid(brandId); } catch { throw new FlowValidationError('Brand ID must be a UUID'); }
}

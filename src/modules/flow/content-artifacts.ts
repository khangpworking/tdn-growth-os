import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { canonicalJson } from '../foundation/index.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../platform/artifacts/index.js';

/** Shared canonical-JSON and manifest helpers for Content Studio records (brands, catalog, media). */

export class ContentArtifactIntegrityError extends Error {}

export function canonicalSnapshot<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), 'utf8');
}

export function canonicalDigest(value: unknown): string {
  return sha256(canonicalBytes(value));
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertContentUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new TypeError('ID must be a UUID');
}

/** Registers (or confirms) the manifest row of a stored artifact; returns the number of inserted rows. */
export function registerContentManifest(db: Database.Database, stored: StoredArtifact, acquiredAt: string, mediaType: string): number {
  const changes = db.prepare(`
    INSERT INTO artifact_manifests(
      sha256, byte_size, media_type, relative_path, acquired_at,
      contract_version, retention_status, created_at
    ) VALUES (?, ?, ?, ?, ?, '1.0.0', 'active', ?)
    ON CONFLICT(sha256) DO NOTHING
  `).run(stored.sha256, stored.byteSize, mediaType, stored.relativePath, acquiredAt, acquiredAt);
  assertContentManifest(db, stored.sha256, stored.byteSize, mediaType);
  return changes.changes;
}

export function assertContentManifest(db: Database.Database, digest: string, byteSize: number, mediaType: string): void {
  const row = db.prepare(`
    SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion
    FROM artifact_manifests WHERE sha256 = ?
  `).get(digest) as { byteSize: bigint | number; mediaType: string; relativePath: string; contractVersion: string } | undefined;
  if (
    !row ||
    BigInt(row.byteSize) !== BigInt(byteSize) ||
    row.mediaType !== mediaType ||
    row.relativePath !== `sha256/${digest.slice(0, 2)}/${digest}` ||
    row.contractVersion !== '1.0.0'
  ) throw new ContentArtifactIntegrityError('Artifact manifest metadata mismatch');
}

/** Reads a canonical JSON artifact, checking its manifest, digest and canonical encoding. */
export async function readCanonicalJsonArtifact(db: Database.Database, store: ContentAddressedArtifactStore, digest: string): Promise<unknown> {
  const data = await store.read(digest);
  assertContentManifest(db, digest, data.byteLength, 'application/json');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
  catch { throw new ContentArtifactIntegrityError('Artifact is not valid UTF-8 JSON'); }
  if (!data.equals(canonicalBytes(parsed))) throw new ContentArtifactIntegrityError('Artifact is not canonical JSON');
  return parsed;
}

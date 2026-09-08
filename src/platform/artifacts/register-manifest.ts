import type Database from 'better-sqlite3';
import type { StoredArtifact } from './artifact-store.js';

// Shared artifact metadata, not cross-Box business writes. Caller owns transaction.
export function registerManifest(db: Database.Database, artifact: StoredArtifact, acquiredAt: string): void {
  db.prepare(`INSERT INTO artifact_manifests
    (sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
    VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?) ON CONFLICT(sha256) DO NOTHING`)
    .run(artifact.sha256, artifact.byteSize, artifact.relativePath, acquiredAt, acquiredAt);
  const row = db.prepare('SELECT byte_size, media_type, relative_path, contract_version FROM artifact_manifests WHERE sha256=?')
    .get(artifact.sha256) as { byte_size: bigint; media_type: string; relative_path: string; contract_version: string };
  if (BigInt(row.byte_size) !== BigInt(artifact.byteSize) || row.media_type !== 'application/json' ||
      row.relative_path !== artifact.relativePath || row.contract_version !== '1.0.0') {
    throw new Error('Artifact manifest conflict');
  }
}

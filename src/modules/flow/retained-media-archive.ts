import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { R2ArchiveError, type R2MediaArchive } from '../../platform/artifacts/r2-media-archive.js';
import { assertContentManifest } from './content-artifacts.js';
import { inspectContentImage } from './content-image.js';

/** Operator selects one retained image, never a latest item or a directory scan. */
export async function archiveRetainedMedia(db: Database.Database, local: ContentAddressedArtifactStore,
  archive: R2MediaArchive, sha256: string): Promise<Awaited<ReturnType<R2MediaArchive['copy']>>> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new R2ArchiveError('invalid_input');
  const manifest = db.prepare('SELECT media_type mediaType, retention_status retentionStatus FROM artifact_manifests WHERE sha256 = ?')
    .get(sha256) as { mediaType: string; retentionStatus: string } | undefined;
  if (!manifest || manifest.retentionStatus !== 'active' ||
    (manifest.mediaType !== 'image/png' && manifest.mediaType !== 'image/jpeg')) throw new R2ArchiveError('invalid_input');
  const bytes = await local.read(sha256, { maxBytes: 8 * 1024 * 1024 });
  assertContentManifest(db, sha256, bytes.length, manifest.mediaType);
  inspectContentImage(bytes, { declaredType: manifest.mediaType, kind: 'PHOTO' });
  return archive.copy(bytes, sha256, manifest.mediaType);
}

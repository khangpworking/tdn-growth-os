import type Database from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../platform/artifacts/index.js';
import type { R2MediaArchive } from '../platform/artifacts/r2-media-archive.js';
import { archiveRetainedMedia } from '../modules/flow/retained-media-archive.js';

/** Post-commit copies are awaited, but cannot undo a successful local write. */
export class ContentMediaMirror {
  #lastCopy: 'not_attempted' | 'verified' | 'failed' = 'not_attempted';
  readonly #local: ContentAddressedArtifactStore;
  constructor(private readonly db: Database.Database, artifactRoot: string, private readonly archive: R2MediaArchive) {
    this.#local = new ContentAddressedArtifactStore(artifactRoot);
  }
  get status() { return { mode: 'private-r2' as const, lastCopy: this.#lastCopy }; }
  async copy(sha256: string): Promise<void> {
    try {
      await archiveRetainedMedia(this.db, this.#local, this.archive, sha256);
      this.#lastCopy = 'verified';
    } catch {
      this.#lastCopy = 'failed';
      console.warn('Private R2 copy failed; committed local media remains available. Use the explicit archive command to retry.');
    }
  }
}

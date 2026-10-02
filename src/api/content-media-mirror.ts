import type Database from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../platform/artifacts/index.js';
import type { R2MediaArchive } from '../platform/artifacts/r2-media-archive.js';
import { archiveRetainedMedia } from '../modules/flow/retained-media-archive.js';

/** Post-commit copies are awaited, but cannot undo a successful local write. */
export class ContentMediaMirror {
  #lastCopy: 'not_attempted' | 'verified' | 'failed' = 'not_attempted';
  #failedCopyAttemptsSinceStart = 0;
  readonly #pending = new Set<Promise<void>>();
  readonly #local: ContentAddressedArtifactStore;
  constructor(private readonly db: Database.Database, artifactRoot: string, private readonly archive: R2MediaArchive) {
    this.#local = new ContentAddressedArtifactStore(artifactRoot);
  }
  get status() { return { mode: 'private-r2' as const, lastCopy: this.#lastCopy, failedCopyAttemptsSinceStart: this.#failedCopyAttemptsSinceStart }; }
  copy(sha256: string): Promise<void> {
    const operation = (async () => {
      try {
        await archiveRetainedMedia(this.db, this.#local, this.archive, sha256);
        this.#lastCopy = 'verified';
      } catch {
        this.#lastCopy = 'failed';
        this.#failedCopyAttemptsSinceStart++;
        const safeDigest = /^[0-9a-f]{64}$/.test(sha256) ? sha256 : '[invalid-digest]';
        console.warn(`Private R2 copy failed for sha256=${safeDigest}; committed local media remains available. Retry this exact digest with media:r2:archive.`);
      }
    })();
    this.#pending.add(operation);
    void operation.finally(() => this.#pending.delete(operation));
    return operation;
  }
  async drain(): Promise<void> { while (this.#pending.size) await Promise.all([...this.#pending]); }
}

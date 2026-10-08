import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import callbackFs from 'node:fs';
import path from 'node:path';

export interface StoredArtifact {
  readonly sha256: string;
  readonly byteSize: number;
  readonly relativePath: string;
  readonly absolutePath: string;
}

export interface ArtifactReadOptions {
  /** Reject before allocating when the opened regular file is larger than this bound. */
  readonly maxBytes?: number;
}

export class ArtifactIntegrityError extends Error {}

export class ContentAddressedArtifactStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async put(bytes: Uint8Array): Promise<StoredArtifact> {
    const buffer = Buffer.from(bytes);
    const sha256 = digest(buffer);
    const relativePath = path.posix.join('sha256', sha256.slice(0, 2), sha256);
    const absolutePath = path.join(this.#root, ...relativePath.split('/'));
    const directory = path.dirname(absolutePath);
    await fs.mkdir(directory, { recursive: true });

    if (await exists(absolutePath)) {
      await this.#verifyPath(absolutePath, sha256, buffer.byteLength);
      return { sha256, byteSize: buffer.byteLength, relativePath, absolutePath };
    }

    const temporaryPath = path.join(directory, `.${sha256}.${process.pid}.${randomUUID()}.tmp`);
    const handle = await fs.open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(buffer);
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await this.#verifyPath(temporaryPath, sha256, buffer.byteLength);
      await fs.rename(temporaryPath, absolutePath);
    } catch (error) {
      try {
        if (await exists(absolutePath)) {
          await this.#verifyPath(absolutePath, sha256, buffer.byteLength);
        } else {
          throw error;
        }
      } finally {
        await fs.rm(temporaryPath, { force: true });
      }
    }

    return { sha256, byteSize: buffer.byteLength, relativePath, absolutePath };
  }

  async read(sha256: string, options?: ArtifactReadOptions): Promise<Buffer> {
    assertDigest(sha256);
    const absolutePath = this.pathForDigest(sha256);
    if (options?.maxBytes !== undefined) {
      assertReadLimit(options.maxBytes);
      return this.#readBounded(absolutePath, sha256, options.maxBytes);
    }
    const bytes = await fs.readFile(absolutePath);
    if (digest(bytes) !== sha256) throw new ArtifactIntegrityError(`Artifact digest mismatch: ${sha256}`);
    return bytes;
  }

  pathForDigest(sha256: string): string {
    assertDigest(sha256);
    return path.join(this.#root, 'sha256', sha256.slice(0, 2), sha256);
  }

  async #verifyPath(filePath: string, expectedDigest: string, expectedSize: number): Promise<void> {
    const bytes = await fs.readFile(filePath);
    if (bytes.byteLength !== expectedSize || digest(bytes) !== expectedDigest) {
      throw new ArtifactIntegrityError(`Artifact integrity check failed: ${expectedDigest}`);
    }
  }

  async #readBounded(filePath: string, expectedDigest: string, maxBytes: number): Promise<Buffer> {
    // Keep descriptor IO asynchronous without FileHandle's per-operation promise
    // machinery. Every read still authenticates the opened file and exact bytes.
    return new Promise<Buffer>((resolve, reject) => {
      callbackFs.open(filePath, 'r', (openError, fd) => {
        if (openError) { reject(openError); return; }
        let closing = false;
        const finish = (outcome: { bytes: Buffer } | { error: unknown }): void => {
          if (closing) return;
          closing = true;
          try {
            callbackFs.close(fd, closeError => {
              // Match the original finally: close errors override earlier errors.
              if (closeError) reject(closeError);
              else if ('error' in outcome) reject(outcome.error);
              else resolve(outcome.bytes);
            });
          } catch (error) { reject(error); }
        };
        const attempt = (operation: () => void): void => {
          try { operation(); } catch (error) { finish({ error }); }
        };
        attempt(() => callbackFs.fstat(fd, (statError, opened) => attempt(() => {
          if (statError) throw statError;
          if (!opened.isFile()) throw new ArtifactIntegrityError(`Artifact is not a regular file: ${expectedDigest}`);
          if (opened.size > maxBytes) throw new ArtifactIntegrityError(`Artifact exceeds read limit: ${expectedDigest}`);
          const bytes = Buffer.alloc(opened.size);
          let offset = 0;
          const verify = (): void => attempt(() => callbackFs.fstat(fd, (statError, closed) => attempt(() => {
            if (statError) throw statError;
            if (closed.size !== opened.size) throw new ArtifactIntegrityError(`Artifact changed while reading: ${expectedDigest}`);
            if (digest(bytes) !== expectedDigest) throw new ArtifactIntegrityError(`Artifact digest mismatch: ${expectedDigest}`);
            finish({ bytes });
          })));
          const read = (): void => attempt(() => callbackFs.read(fd, bytes, offset, opened.size - offset, offset,
            (readError, bytesRead) => attempt(() => {
              if (readError) throw readError;
              if (bytesRead === 0) throw new ArtifactIntegrityError(`Artifact truncated while reading: ${expectedDigest}`);
              offset += bytesRead;
              if (offset < opened.size) read(); else verify();
            })));
          if (opened.size === 0) verify(); else read();
        })));
      });
    });
  }
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDigest(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError('Invalid SHA-256 digest');
}

function assertReadLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid artifact read limit');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

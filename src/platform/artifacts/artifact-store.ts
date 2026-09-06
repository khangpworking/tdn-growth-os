import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface StoredArtifact {
  readonly sha256: string;
  readonly byteSize: number;
  readonly relativePath: string;
  readonly absolutePath: string;
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

  async read(sha256: string): Promise<Buffer> {
    assertDigest(sha256);
    const absolutePath = this.pathForDigest(sha256);
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
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDigest(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError('Invalid SHA-256 digest');
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

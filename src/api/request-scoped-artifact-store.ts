import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ContentAddressedArtifactStore, ArtifactIntegrityError, type StoredArtifact } from '../platform/artifacts/artifact-store.js';

interface StagedArtifact extends StoredArtifact { readonly stagedPath: string }
interface RequestScope { readonly directory: string; readonly staged: Map<string, StagedArtifact> }

export class RequestScopedArtifactStore extends ContentAddressedArtifactStore {
  readonly #root: string;
  readonly #scope = new AsyncLocalStorage<RequestScope>();

  constructor(root: string) { super(root); this.#root = path.resolve(root); }

  async withOwnership<T>(operation: () => Promise<T>): Promise<T> {
    const parent = path.join(this.#root, '.owner-api-requests');
    await fs.mkdir(parent, { recursive: true, mode: 0o700 });
    const directory = path.join(parent, randomUUID());
    await fs.mkdir(directory, { mode: 0o700 });
    const scope: RequestScope = { directory, staged: new Map() };
    try { return await this.#scope.run(scope, operation); }
    finally { await fs.rm(directory, { recursive: true, force: true }); }
  }

  override async put(bytes: Uint8Array): Promise<StoredArtifact> {
    const scope = this.#scope.getStore();
    if (!scope) return super.put(bytes);
    const buffer = Buffer.from(bytes);
    const sha256 = digest(buffer);
    const relativePath = path.posix.join('sha256', sha256.slice(0, 2), sha256);
    const absolutePath = path.join(this.#root, ...relativePath.split('/'));
    try {
      await verifyPath(absolutePath, sha256, buffer.byteLength);
      return { sha256, byteSize: buffer.byteLength, relativePath, absolutePath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const prior = scope.staged.get(sha256);
    if (prior) { await verifyPath(prior.stagedPath, sha256, buffer.byteLength); return prior; }
    const stagedPath = path.join(scope.directory, sha256);
    const handle = await fs.open(stagedPath, 'wx', 0o600);
    try { await handle.writeFile(buffer); await handle.sync(); }
    finally { await handle.close(); }
    await verifyPath(stagedPath, sha256, buffer.byteLength);
    const staged = Object.freeze({ sha256, byteSize: buffer.byteLength, relativePath, absolutePath, stagedPath });
    scope.staged.set(sha256, staged);
    return staged;
  }

  override async read(sha256: string): Promise<Buffer> {
    const scope = this.#scope.getStore();
    const staged = scope?.staged.get(sha256);
    if (!staged) return super.read(sha256);
    await verifyPath(staged.stagedPath, staged.sha256, staged.byteSize);
    return fs.readFile(staged.stagedPath);
  }

  async publishOwned(sha256?: string): Promise<void> {
    const scope = this.#scope.getStore();
    if (!scope) throw new Error('No request-scoped artifact operation is active');
    const artifacts = sha256 === undefined ? [...scope.staged.values()] : [scope.staged.get(sha256)].filter((value): value is StagedArtifact => value !== undefined);
    for (const artifact of artifacts) {
      await fs.mkdir(path.dirname(artifact.absolutePath), { recursive: true });
      try { await fs.link(artifact.stagedPath, artifact.absolutePath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      await verifyPath(artifact.absolutePath, artifact.sha256, artifact.byteSize);
    }
  }
}

function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
async function verifyPath(filePath: string, expectedDigest: string, expectedSize: number): Promise<void> {
  const bytes = await fs.readFile(filePath);
  if (bytes.byteLength !== expectedSize || digest(bytes) !== expectedDigest) throw new ArtifactIntegrityError(`Artifact integrity check failed: ${expectedDigest}`);
}

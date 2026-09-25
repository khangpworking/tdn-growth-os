import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { ContentPromptArtifact } from '../../../contracts/flow/content-prompt-artifact.generated.js';
import type { ContentPromptContent, ContentPromptLineage, ContentPromptType } from '../../../contracts/flow/content-prompt-create-request.generated.js';
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
import type { ContentPromptLibrary } from './content-prompt-library.js';
import {
  assertContentPromptContent,
  FlowValidationError,
  validateContentPromptArtifact,
  validateContentPromptCreateRequest,
  validateContentPromptLifecycleRequest,
  validateContentPromptRevisionRequest,
} from './validation.js';

export class ContentPromptConflictError extends Error {}

/** Deleted prompts stay restorable for this long (Task 047 §1); the database enforces the same window. */
export const PROMPT_RESTORE_DAYS = 30;

export interface ContentPromptExecution {
  readonly promptId: string;
  readonly promptArtifactSha256: string;
  readonly version: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface ContentPromptRow {
  readonly promptId: string;
  readonly promptKey: string;
  readonly promptType: ContentPromptType;
  readonly version: number;
  readonly promptName: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

export interface ContentPromptLifecycleState {
  readonly sequence: number;
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
  readonly expired: boolean;
}

export interface ContentPromptLifecycleExecution {
  readonly promptId: string;
  readonly sequence: number;
  readonly action: 'DELETE' | 'RESTORE';
  readonly createdAt: string;
  readonly restorableUntil?: string;
  readonly deduplicated: boolean;
}

/** User prompts of the Content Studio prompt library (Task 048c): immutable versions plus a delete/restore lifecycle. */
export class ContentPromptService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #library: ContentPromptLibrary;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: { readonly db: Database.Database; readonly artifactStore: ContentAddressedArtifactStore; readonly library: ContentPromptLibrary; readonly now?: () => Date; readonly uuid?: () => string }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#library = options.library;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createPrompt(untrustedInput: unknown): Promise<ContentPromptExecution> {
    const input = canonicalSnapshot(validateContentPromptCreateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const existing = this.#byKey(input.promptKey);
    if (existing) {
      const result = this.#retry(requestSha256, this.#versionOne(existing.promptId));
      await this.readPrompt(result.promptId, 1);
      return result;
    }
    if (input.duplicatedFrom) await this.#assertLineage(input.promptType, input.duplicatedFrom);

    const promptId = this.#uuid();
    assertId(promptId);
    const createdAt = this.#now().toISOString();
    const artifact = promptArtifact(promptId, input.promptKey, input.promptType, 1, input.prompt, createdAt, requestSha256, input.duplicatedFrom);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentPromptArtifact(artifact)));

    const execute = this.#db.transaction((): ContentPromptExecution => {
      const concurrent = this.#byKey(input.promptKey);
      if (concurrent) return this.#retry(requestSha256, this.#versionOne(concurrent.promptId));
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#db.prepare('INSERT INTO flow_content_prompts(prompt_id, prompt_key, prompt_type, created_at) VALUES (?, ?, ?, ?)').run(promptId, input.promptKey, input.promptType, createdAt).changes;
      databaseMutations += this.#insertRevision(promptId, 1, input.prompt.name, requestSha256, stored.sha256, createdAt);
      return { promptId, promptArtifactSha256: stored.sha256, version: 1, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readPrompt(result.promptId, 1);
    return result;
  }

  async revisePrompt(untrustedInput: unknown): Promise<ContentPromptExecution> {
    const input = canonicalSnapshot(validateContentPromptRevisionRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const current = this.#byId(input.promptId);
    if (!current) throw new FlowValidationError(`Prompt not found: ${input.promptId}`);
    const targetVersion = input.expectedVersion + 1;
    const existingTarget = this.#version(input.promptId, targetVersion);
    if (existingTarget) {
      const result = this.#retry(requestSha256, existingTarget);
      await this.readPrompt(input.promptId, targetVersion);
      return result;
    }
    if (current.version !== input.expectedVersion) throw new ContentPromptConflictError('Prompt version or content drift');
    assertContentPromptContent(current.promptType, input.prompt);
    if (this.lifecycleState(input.promptId).deleted) throw new ContentPromptConflictError('Prompt is deleted and cannot be revised');

    const createdAt = this.#now().toISOString();
    const artifact = promptArtifact(current.promptId, current.promptKey, current.promptType, targetVersion, input.prompt, createdAt, requestSha256);
    const stored = await this.#artifacts.put(canonicalBytes(validateContentPromptArtifact(artifact)));

    const execute = this.#db.transaction((): ContentPromptExecution => {
      const concurrentTarget = this.#version(input.promptId, targetVersion);
      if (concurrentTarget) return this.#retry(requestSha256, concurrentTarget);
      if (this.#byId(input.promptId)!.version !== input.expectedVersion) throw new ContentPromptConflictError('Prompt version or content drift');
      if (this.lifecycleState(input.promptId).deleted) throw new ContentPromptConflictError('Prompt is deleted and cannot be revised');
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
      databaseMutations += this.#insertRevision(input.promptId, targetVersion, input.prompt.name, requestSha256, stored.sha256, createdAt);
      return { promptId: input.promptId, promptArtifactSha256: stored.sha256, version: targetVersion, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.readPrompt(result.promptId, result.version);
    return result;
  }

  async readPrompt(promptId: string, version?: number): Promise<ContentPromptArtifact> {
    assertId(promptId);
    const row = version === undefined ? this.#byId(promptId) : this.#version(promptId, version);
    if (!row) throw new FlowValidationError(`Prompt revision not found: ${promptId}`);
    const artifact = validateContentPromptArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const request = artifact.version === 1
      ? validateContentPromptCreateRequest({ contractVersion: '1.0.0', promptKey: artifact.promptKey, promptType: artifact.promptType, prompt: artifact.prompt, ...(artifact.duplicatedFrom ? { duplicatedFrom: artifact.duplicatedFrom } : {}) })
      : validateContentPromptRevisionRequest({ contractVersion: '1.0.0', promptId: artifact.promptId, expectedVersion: artifact.version - 1, prompt: artifact.prompt });
    if (
      canonicalDigest(request) !== artifact.requestSha256 ||
      artifact.promptId !== row.promptId ||
      artifact.promptKey !== row.promptKey ||
      artifact.promptType !== row.promptType ||
      artifact.version !== row.version ||
      artifact.prompt.name !== row.promptName ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new ContentPromptConflictError('Prompt artifact does not match immutable metadata');
    return artifact;
  }

  async changeLifecycle(untrustedInput: unknown): Promise<ContentPromptLifecycleExecution> {
    const input = validateContentPromptLifecycleRequest(untrustedInput);
    if (!this.#byId(input.promptId)) throw new FlowValidationError(`Prompt not found: ${input.promptId}`);
    const execute = this.#db.transaction((): ContentPromptLifecycleExecution => {
      const target = this.#lifecycleRow(input.promptId, input.expectedSequence + 1);
      if (target) {
        if (target.action !== input.action) throw new ContentPromptConflictError('Prompt lifecycle drift');
        return lifecycleExecution(input.promptId, target.sequence, target.action, target.createdAt, true);
      }
      const state = this.lifecycleState(input.promptId);
      if (state.sequence !== input.expectedSequence) throw new ContentPromptConflictError('Prompt lifecycle drift');
      if (input.action === 'DELETE' && state.deleted) throw new ContentPromptConflictError('Prompt is already deleted');
      if (input.action === 'RESTORE' && (!state.deleted || state.expired)) throw new ContentPromptConflictError(state.deleted ? 'Prompt restore window expired' : 'Prompt is not deleted');
      const createdAt = this.#now().toISOString();
      this.#db.prepare('INSERT INTO flow_content_prompt_lifecycle(prompt_id, sequence, action, created_at) VALUES (?, ?, ?, ?)').run(input.promptId, input.expectedSequence + 1, input.action, createdAt);
      return lifecycleExecution(input.promptId, input.expectedSequence + 1, input.action, createdAt, false);
    });
    return execute();
  }

  lifecycleState(promptId: string): ContentPromptLifecycleState {
    const last = this.#db.prepare('SELECT sequence, action, created_at createdAt FROM flow_content_prompt_lifecycle WHERE prompt_id = ? ORDER BY sequence DESC LIMIT 1').get(promptId) as { sequence: bigint | number; action: 'DELETE' | 'RESTORE'; createdAt: string } | undefined;
    if (!last) return { sequence: 0, expired: false };
    if (last.action === 'RESTORE') return { sequence: Number(last.sequence), expired: false };
    const restorableUntil = restoreDeadline(last.createdAt);
    return { sequence: Number(last.sequence), deleted: { deletedAt: last.createdAt, restorableUntil }, expired: this.#now().getTime() > Date.parse(restorableUntil) };
  }

  /** Latest revision row of every user prompt, in creation order. */
  listPrompts(): ContentPromptRow[] {
    return (this.#db.prepare(`
      SELECT ${ROW_COLUMNS} FROM flow_content_prompts p JOIN flow_content_prompt_revisions r ON r.prompt_id = p.prompt_id
      WHERE r.version = (SELECT max(version) FROM flow_content_prompt_revisions WHERE prompt_id = p.prompt_id)
      ORDER BY p.created_at, p.prompt_id
    `).all() as RawRow[]).map(toRow);
  }

  promptVersions(promptId: string): number[] {
    return (this.#db.prepare('SELECT version FROM flow_content_prompt_revisions WHERE prompt_id = ? ORDER BY version').all(promptId) as { version: bigint | number }[]).map((row) => Number(row.version));
  }

  promptExists(promptId: string): boolean { return this.#byId(promptId) !== undefined; }

  promptTypeOf(promptId: string): ContentPromptType | undefined { return /^[0-9a-f-]{36}$/i.test(promptId) ? this.#byId(promptId)?.promptType : undefined; }

  /** Re-stages the exact artifact of a committed create/revision whose artifact file was never published. */
  async restoreExactArtifact(untrustedInput: unknown): Promise<boolean> {
    const isRevision = typeof untrustedInput === 'object' && untrustedInput !== null && 'promptId' in untrustedInput;
    const input = canonicalSnapshot(isRevision ? validateContentPromptRevisionRequest(untrustedInput) : validateContentPromptCreateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const row = 'promptId' in input
      ? this.#version(input.promptId, input.expectedVersion + 1)
      : (() => { const existing = this.#byKey(input.promptKey); return existing ? this.#version(existing.promptId, 1) : undefined; })();
    if (!row || row.requestSha256 !== requestSha256) return false;
    try { await fs.access(this.#artifacts.pathForDigest(row.artifactSha256)); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const lineage = 'duplicatedFrom' in input ? input.duplicatedFrom : undefined;
    const restored = canonicalBytes(validateContentPromptArtifact(promptArtifact(row.promptId, row.promptKey, row.promptType, row.version, input.prompt, row.createdAt, row.requestSha256, lineage)));
    if (sha256(restored) !== row.artifactSha256) throw new ContentPromptConflictError('Committed prompt artifact cannot be reconstructed');
    await this.#artifacts.put(restored);
    return true;
  }

  async #assertLineage(promptType: ContentPromptType, lineage: ContentPromptLineage): Promise<void> {
    if (lineage.kind === 'SYSTEM') {
      const entry = this.#library.find(lineage.id, lineage.version);
      if (!entry || entry.promptType !== promptType) throw new FlowValidationError(`Unknown ${promptType} system prompt version: ${lineage.id} v${lineage.version}`);
      this.#library.read(lineage.id, lineage.version);
      return;
    }
    const row = this.#version(lineage.id, lineage.version);
    if (!row || row.promptType !== promptType) throw new FlowValidationError(`Unknown ${promptType} prompt version: ${lineage.id} v${lineage.version}`);
    await this.readPrompt(lineage.id, lineage.version);
  }

  #retry(requestSha256: string, row: ContentPromptRow): ContentPromptExecution {
    if (row.requestSha256 !== requestSha256) throw new ContentPromptConflictError('Prompt key or version already exists with changed content');
    return { promptId: row.promptId, promptArtifactSha256: row.artifactSha256, version: row.version, deduplicated: true, databaseMutations: 0 };
  }

  #versionOne(promptId: string): ContentPromptRow {
    const row = this.#version(promptId, 1);
    if (!row) throw new ContentPromptConflictError('Prompt is missing version 1');
    return row;
  }

  #insertRevision(promptId: string, version: number, name: string, requestSha256: string, artifactSha256: string, createdAt: string): number {
    return this.#db.prepare(`
      INSERT INTO flow_content_prompt_revisions(prompt_id, version, prompt_name, request_sha256, prompt_artifact_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(promptId, version, name, requestSha256, artifactSha256, createdAt).changes;
  }

  #lifecycleRow(promptId: string, sequence: number): { sequence: number; action: 'DELETE' | 'RESTORE'; createdAt: string } | undefined {
    const row = this.#db.prepare('SELECT sequence, action, created_at createdAt FROM flow_content_prompt_lifecycle WHERE prompt_id = ? AND sequence = ?').get(promptId, sequence) as { sequence: bigint | number; action: 'DELETE' | 'RESTORE'; createdAt: string } | undefined;
    return row ? { ...row, sequence: Number(row.sequence) } : undefined;
  }

  #byKey(promptKey: string): ContentPromptRow | undefined { return this.#query('p.prompt_key = ?', promptKey); }
  #byId(promptId: string): ContentPromptRow | undefined { return this.#query('p.prompt_id = ?', promptId); }
  #version(promptId: string, version: number): ContentPromptRow | undefined {
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive safe integer');
    return this.#query('p.prompt_id = ? AND r.version = ?', promptId, version);
  }

  #query(where: string, ...values: unknown[]): ContentPromptRow | undefined {
    const row = this.#db.prepare(`
      SELECT ${ROW_COLUMNS} FROM flow_content_prompts p JOIN flow_content_prompt_revisions r ON r.prompt_id = p.prompt_id
      WHERE ${where} ORDER BY r.version DESC LIMIT 1
    `).get(...values) as RawRow | undefined;
    return row ? toRow(row) : undefined;
  }
}

const ROW_COLUMNS = `p.prompt_id promptId, p.prompt_key promptKey, p.prompt_type promptType, r.version, r.prompt_name promptName,
  r.request_sha256 requestSha256, r.prompt_artifact_sha256 artifactSha256, r.created_at createdAt`;
type RawRow = Omit<ContentPromptRow, 'version'> & { version: bigint | number };
function toRow(row: RawRow): ContentPromptRow { return { ...row, version: Number(row.version) }; }

export function restoreDeadline(deletedAt: string): string {
  return new Date(Date.parse(deletedAt) + PROMPT_RESTORE_DAYS * 86_400_000).toISOString();
}

function lifecycleExecution(promptId: string, sequence: number, action: 'DELETE' | 'RESTORE', createdAt: string, deduplicated: boolean): ContentPromptLifecycleExecution {
  return { promptId, sequence, action, createdAt, ...(action === 'DELETE' ? { restorableUntil: restoreDeadline(createdAt) } : {}), deduplicated };
}

function promptArtifact(promptId: string, promptKey: string, promptType: ContentPromptType, version: number, prompt: ContentPromptContent, createdAt: string, requestSha256: string, duplicatedFrom?: ContentPromptLineage): ContentPromptArtifact {
  return { contractVersion: '1.0.0', promptId, promptKey, promptType, version, prompt, ...(duplicatedFrom ? { duplicatedFrom } : {}), createdAt, requestSha256 };
}

function assertId(value: string): void {
  try { assertContentUuid(value); } catch { throw new FlowValidationError('ID must be a UUID'); }
}

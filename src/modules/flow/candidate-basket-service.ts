import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CandidateBasketArtifact } from '../../../contracts/flow/candidate-basket-artifact.generated.js';
import type { CandidateBasketFreezeRequest } from '../../../contracts/flow/candidate-basket-freeze-request.generated.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import type { DiscoveryWorkspaceReader } from './discovery-workspace-reader.js';
import type { ProductCandidateReader } from './product-candidate-reader.js';
import {
  FlowValidationError,
  validateCandidateBasketArtifact,
  validateCandidateBasketFreezeRequest,
} from './validation.js';

export class CandidateBasketIdentityConflictError extends Error {}

export interface CandidateBasketExecution {
  readonly basketId: string;
  readonly basketArtifactSha256: string;
  readonly workspaceId: string;
  readonly basketKey: string;
  readonly version: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

type FrozenMember = CandidateBasketArtifact['candidates'][number];

interface BasketRow {
  basketId: string;
  workspaceId: string;
  basketKey: string;
  version: bigint;
  requestSha256: string;
  artifactSha256: string;
  memberCount: bigint;
  frozenAt: string;
}

interface MemberRow {
  position: bigint;
  candidateId: string;
  candidateVersion: bigint;
  candidateArtifactSha256: string;
  candidateKey: string;
  label: string;
  summary: string | null;
  state: string;
}

export class CandidateBasketService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #workspaces: DiscoveryWorkspaceReader;
  readonly #candidates: ProductCandidateReader;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly workspaceReader: DiscoveryWorkspaceReader;
    readonly candidateReader: ProductCandidateReader;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#workspaces = options.workspaceReader;
    this.#candidates = options.candidateReader;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async freezeBasket(untrustedInput: unknown): Promise<CandidateBasketExecution> {
    const validated = snapshot(validateCandidateBasketFreezeRequest(untrustedInput));
    assertUniqueCandidateIds(validated);
    const sortedSelections = [...validated.candidates].sort(compareSelections);
    const input: CandidateBasketFreezeRequest = {
      ...validated,
      candidates: sortedSelections as CandidateBasketFreezeRequest['candidates'],
    };
    const requestSha256 = digest(input);
    const existing = this.#basketByIdentity(input.workspaceId, input.basketKey, input.version);
    if (existing) {
      const result = this.#retry(requestSha256, existing);
      await this.readBasket(existing.basketId);
      return result;
    }

    const workspace = await this.#workspaces.readVerifiedWorkspace(input.workspaceId);
    if (workspace.workspaceId !== input.workspaceId) {
      throw new CandidateBasketIdentityConflictError('Verified workspace reader returned the wrong workspace');
    }
    if (workspace.state !== 'ACTIVE') throw new FlowValidationError('Discovery workspace must be ACTIVE');
    const members = await Promise.all(input.candidates.map(async (selection): Promise<FrozenMember> => {
      const candidate = await this.#candidates.readVerifiedCandidate(selection.candidateId, selection.candidateVersion);
      if (candidate.candidateId !== selection.candidateId || candidate.version !== selection.candidateVersion) {
        throw new CandidateBasketIdentityConflictError('Verified candidate reader returned the wrong historical revision');
      }
      if (candidate.workspaceId !== input.workspaceId) throw new FlowValidationError('Candidate belongs to a different workspace');
      return {
        candidateId: candidate.candidateId,
        candidateKey: candidate.candidateKey,
        candidateVersion: candidate.version,
        candidateArtifactSha256: digest(candidate),
        label: candidate.label,
        ...(candidate.summary === undefined ? {} : { summary: candidate.summary }),
        state: candidate.state,
      };
    }));
    members.sort(compareMembers);

    const basketId = this.#validUuid();
    const frozenAt = this.#now().toISOString();
    const artifact: CandidateBasketArtifact = {
      contractVersion: '1.0.0', basketId, workspaceId: input.workspaceId, basketKey: input.basketKey,
      version: input.version, frozenAt, requestSha256,
      candidates: members as CandidateBasketArtifact['candidates'],
    };
    validateCandidateBasketArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): CandidateBasketExecution => {
      const concurrent = this.#basketByIdentity(input.workspaceId, input.basketKey, input.version);
      if (concurrent) return this.#retry(requestSha256, concurrent);
      let databaseMutations = this.#registerArtifact(stored, frozenAt);
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_candidate_baskets(
          basket_id, workspace_id, basket_key, version, request_sha256, basket_artifact_sha256, member_count, frozen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(basketId, input.workspaceId, input.basketKey, input.version, requestSha256, stored.sha256, members.length, frozenAt).changes;
      const insertMember = this.#db.prepare(`
        INSERT INTO flow_candidate_basket_members(
          basket_id, position, candidate_id, candidate_version, candidate_artifact_sha256,
          candidate_key, label, summary, state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [position, member] of members.entries()) {
        databaseMutations += insertMember.run(
          basketId, position, member.candidateId, member.candidateVersion, member.candidateArtifactSha256,
          member.candidateKey, member.label, member.summary ?? null, member.state,
        ).changes;
      }
      return {
        basketId, basketArtifactSha256: stored.sha256, workspaceId: input.workspaceId,
        basketKey: input.basketKey, version: input.version, deduplicated: false, databaseMutations,
      };
    });

    const result = execute();
    if (result.deduplicated) await this.readBasket(result.basketId);
    return result;
  }

  async readBasket(basketId: string): Promise<CandidateBasketArtifact> {
    assertUuid(basketId);
    const row = this.#basketById(basketId);
    if (!row) throw new FlowValidationError(`Candidate basket not found: ${basketId}`);
    const artifact = await this.#readArtifact(row.artifactSha256);
    const members = this.#members(basketId);
    const ownerRequest = validateCandidateBasketFreezeRequest({
      contractVersion: '1.0.0', workspaceId: artifact.workspaceId, basketKey: artifact.basketKey,
      version: artifact.version,
      candidates: artifact.candidates.map((member) => ({ candidateId: member.candidateId, candidateVersion: member.candidateVersion })),
    });
    const sortedCandidates = [...artifact.candidates].sort(compareMembers);
    if (
      artifact.basketId !== row.basketId || artifact.workspaceId !== row.workspaceId || artifact.basketKey !== row.basketKey ||
      BigInt(artifact.version) !== row.version || artifact.frozenAt !== row.frozenAt ||
      row.memberCount !== BigInt(artifact.candidates.length) || members.length !== artifact.candidates.length ||
      artifact.requestSha256 !== row.requestSha256 || digest(ownerRequest) !== artifact.requestSha256 ||
      canonicalJson(artifact.candidates) !== canonicalJson(sortedCandidates) ||
      canonicalJson(artifact.candidates) !== canonicalJson(members.map(memberFromRow))
    ) throw new CandidateBasketIdentityConflictError('Candidate basket artifact does not match immutable metadata');

    const workspace = await this.#workspaces.readVerifiedWorkspace(artifact.workspaceId);
    if (workspace.workspaceId !== artifact.workspaceId || workspace.state !== 'ACTIVE') {
      throw new CandidateBasketIdentityConflictError('Frozen basket workspace does not match verified workspace');
    }
    for (const member of artifact.candidates) {
      const candidate = await this.#candidates.readVerifiedCandidate(member.candidateId, member.candidateVersion);
      const candidateDigest = digest(candidate);
      if (
        candidate.candidateId !== member.candidateId || candidate.version !== member.candidateVersion ||
        candidate.workspaceId !== artifact.workspaceId || candidateDigest !== member.candidateArtifactSha256 ||
        candidate.candidateKey !== member.candidateKey || candidate.label !== member.label ||
        (candidate.summary ?? null) !== (member.summary ?? null) || candidate.state !== member.state
      ) throw new CandidateBasketIdentityConflictError('Frozen candidate does not match verified historical artifact');
    }
    return artifact;
  }

  #retry(requestSha256: string, row: BasketRow): CandidateBasketExecution {
    if (row.requestSha256 !== requestSha256) throw new CandidateBasketIdentityConflictError('Basket identity/version already exists with changed membership or metadata');
    return {
      basketId: row.basketId, basketArtifactSha256: row.artifactSha256, workspaceId: row.workspaceId,
      basketKey: row.basketKey, version: Number(row.version), deduplicated: true, databaseMutations: 0,
    };
  }

  #basketByIdentity(workspaceId: string, basketKey: string, version: number): BasketRow | undefined {
    return this.#basketQuery('workspace_id = ? AND basket_key = ? AND version = ?', workspaceId, basketKey, version);
  }

  #basketById(basketId: string): BasketRow | undefined {
    return this.#basketQuery('basket_id = ?', basketId);
  }

  #basketQuery(where: string, ...values: unknown[]): BasketRow | undefined {
    return this.#db.prepare(`
      SELECT basket_id basketId, workspace_id workspaceId, basket_key basketKey, version,
             request_sha256 requestSha256, basket_artifact_sha256 artifactSha256,
             member_count memberCount, frozen_at frozenAt
      FROM flow_candidate_baskets WHERE ${where}
    `).get(...values) as BasketRow | undefined;
  }

  #members(basketId: string): MemberRow[] {
    return this.#db.prepare(`
      SELECT position, candidate_id candidateId, candidate_version candidateVersion,
             candidate_artifact_sha256 candidateArtifactSha256, candidate_key candidateKey,
             label, summary, state
      FROM flow_candidate_basket_members WHERE basket_id = ? ORDER BY position
    `).all(basketId) as MemberRow[];
  }

  #registerArtifact(stored: StoredArtifact, acquiredAt: string): number {
    const changes = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at
      ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, stored.relativePath, acquiredAt, acquiredAt);
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion
      FROM artifact_manifests WHERE sha256 = ?
    `).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
    if (row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' ||
        row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0') {
      throw new CandidateBasketIdentityConflictError('Artifact metadata conflict');
    }
    return changes.changes;
  }

  async #readArtifact(sha256: string): Promise<CandidateBasketArtifact> {
    const manifest = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion
      FROM artifact_manifests WHERE sha256 = ?
    `).get(sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    const data = await this.#artifacts.read(sha256);
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' ||
        manifest.relativePath !== `sha256/${sha256.slice(0, 2)}/${sha256}` || manifest.contractVersion !== '1.0.0') {
      throw new CandidateBasketIdentityConflictError('Artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    } catch (error) {
      throw new FlowValidationError(`Invalid artifact JSON: ${(error as Error).message}`);
    }
    const artifact = validateCandidateBasketArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('Artifact is not canonical JSON');
    return artifact;
  }

  #validUuid(): string {
    const value = this.#uuid();
    assertUuid(value);
    return value;
  }
}

function memberFromRow(row: MemberRow): FrozenMember {
  if (row.state !== 'EXPLORING') throw new CandidateBasketIdentityConflictError('Invalid persisted candidate state');
  return {
    candidateId: row.candidateId, candidateKey: row.candidateKey, candidateVersion: Number(row.candidateVersion),
    candidateArtifactSha256: row.candidateArtifactSha256, label: row.label,
    ...(row.summary === null ? {} : { summary: row.summary }), state: row.state,
  };
}

function compareMembers(left: FrozenMember, right: FrozenMember): number {
  return compareStrings(left.candidateId, right.candidateId) || left.candidateVersion - right.candidateVersion;
}

function compareSelections(
  left: CandidateBasketFreezeRequest['candidates'][number],
  right: CandidateBasketFreezeRequest['candidates'][number],
): number {
  return compareStrings(left.candidateId, right.candidateId) || left.candidateVersion - right.candidateVersion;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUniqueCandidateIds(input: CandidateBasketFreezeRequest): void {
  const ids = input.candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) throw new FlowValidationError('Duplicate candidate IDs are not allowed');
}

function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new FlowValidationError('ID must be a UUID');
  }
}

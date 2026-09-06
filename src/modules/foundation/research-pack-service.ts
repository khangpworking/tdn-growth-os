import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ResearchPackManifest } from '../../../contracts/foundation/research-pack-manifest.generated.js';
import type { ResearchPackRequest } from '../../../contracts/foundation/research-pack-request.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from './canonical-json.js';
import { FoundationIdentityConflictError } from './foundation-service.js';
import { FoundationValidationError, validateResearchPackManifest, validateResearchPackRequest } from './validation.js';

export interface ResearchPackResult {
  readonly packId: string;
  readonly manifestArtifactSha256: string;
  readonly documentIds: readonly string[];
  readonly deduplicated: boolean;
}

export interface VerifiedResearchDocument {
  readonly documentId: string;
  readonly bytes: Buffer;
  readonly text: string;
}

export interface VerifiedFinalizedResearchPack {
  readonly researchPackId: string;
  readonly manifestArtifactSha256: string;
  readonly manifest: ResearchPackManifest;
  readonly documents: readonly VerifiedResearchDocument[];
}

interface DocumentRow {
  readonly documentId: string;
  readonly documentType: ResearchPackManifest['documents'][number]['documentType'];
  readonly title: string;
  readonly sourceLocator: string;
  readonly languageTag: string;
  readonly publishedAt: string | null;
  readonly rightsStatus: ResearchPackManifest['documents'][number]['rightsStatus'];
  readonly rightsBasis: string;
  readonly evidenceId: string;
  readonly evidenceGrade: ResearchPackManifest['documents'][number]['evidence']['grade'];
  readonly evidenceGradeBasis: string;
  readonly sourceId: string;
  readonly ingestionId: string;
  readonly acquiredAt: string;
  readonly rawArtifactSha256: string;
  readonly evidenceArtifactSha256: string;
  readonly ingestionArtifactSha256: string | null;
  readonly ingestionStatus: string;
  readonly artifactByteSize: bigint;
  readonly artifactMediaType: string;
  readonly artifactRelativePath: string;
  readonly artifactContractVersion: string;
}

interface PackRow {
  readonly packKey: string;
  readonly version: bigint;
  readonly purpose: string;
  readonly requestSha256: string;
  readonly manifestArtifactSha256: string;
  readonly supersedesPackId: string | null;
  readonly finalizedAt: string;
}

export class ResearchPackService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#now = options.now ?? (() => new Date());
  }

  async finalize(untrustedInput: unknown): Promise<ResearchPackResult> {
    const input = validateResearchPackRequest(untrustedInput);
    const documentIds = [...input.documentIds].sort();
    const semanticRequest = {
      contractVersion: input.contractVersion,
      documentIds,
      packKey: input.packKey,
      purpose: input.purpose,
      ...(input.supersedesPackId === undefined ? {} : { supersedesPackId: input.supersedesPackId }),
      version: input.version,
    };
    const requestSha256 = sha256(Buffer.from(canonicalJson(semanticRequest), 'utf8'));
    const existing = this.#db.prepare(
      `SELECT pack_id AS packId, request_sha256 AS requestSha256,
              manifest_artifact_sha256 AS manifestArtifactSha256, finalized_at AS finalizedAt
         FROM foundation_research_packs WHERE pack_key = ? AND version = ?`,
    ).get(input.packKey, input.version) as {
      packId: string; requestSha256: string; manifestArtifactSha256: string; finalizedAt: string | null;
    } | undefined;
    if (existing) {
      if (existing.requestSha256 !== requestSha256 || existing.finalizedAt === null) {
        throw new FoundationIdentityConflictError('Research Pack key and version already exist with different input');
      }
      return {
        packId: existing.packId,
        manifestArtifactSha256: existing.manifestArtifactSha256,
        documentIds: this.#membership(existing.packId),
        deduplicated: true,
      };
    }

    this.#validateSupersession(input);
    const rows = this.#loadDocuments(documentIds);
    const found = new Set(rows.map((row) => row.documentId));
    const missing = documentIds.filter((id) => !found.has(id));
    if (missing.length > 0) throw new FoundationValidationError(`research documents not found: ${missing.join(', ')}`);
    await this.#verifyRawDocuments(rows);
    const finalizedAt = this.#now().toISOString();
    const manifest = buildManifest(input, rows, finalizedAt);
    validateResearchPackManifest(manifest);
    const stored = await this.#artifacts.put(Buffer.from(canonicalJson(manifest), 'utf8'));
    const packId = randomUUID();
    const transaction = this.#db.transaction((): ResearchPackResult => {
      this.#db.prepare(
        `INSERT INTO artifact_manifests(
           sha256, byte_size, media_type, relative_path, acquired_at,
           contract_version, retention_status, created_at
         ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
         ON CONFLICT(sha256) DO NOTHING`,
      ).run(stored.sha256, stored.byteSize, stored.relativePath, finalizedAt, finalizedAt);
      const artifact = this.#db.prepare(
        `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
                contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
      ).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
      if (artifact.byteSize !== BigInt(stored.byteSize) || artifact.mediaType !== 'application/json' ||
          artifact.relativePath !== stored.relativePath || artifact.contractVersion !== '1.0.0') {
        throw new FoundationIdentityConflictError('Research Pack artifact manifest metadata conflict');
      }
      this.#db.prepare(
        `INSERT INTO foundation_research_packs(
           pack_id, pack_key, version, purpose, request_sha256,
           manifest_artifact_sha256, supersedes_pack_id, finalized_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(packId, input.packKey, input.version, input.purpose, requestSha256,
        stored.sha256, input.supersedesPackId ?? null);
      const insert = this.#db.prepare(
        'INSERT INTO foundation_research_pack_items(pack_id, document_id) VALUES (?, ?)',
      );
      for (const documentId of documentIds) insert.run(packId, documentId);
      this.#db.prepare('UPDATE foundation_research_packs SET finalized_at = ? WHERE pack_id = ?').run(finalizedAt, packId);
      return { packId, manifestArtifactSha256: stored.sha256, documentIds, deduplicated: false };
    });
    return transaction();
  }

  async readVerified(packId: string): Promise<VerifiedFinalizedResearchPack> {
    const pack = this.#db.prepare(
      `SELECT pack_key AS packKey, version, purpose, request_sha256 AS requestSha256,
              manifest_artifact_sha256 AS manifestArtifactSha256,
              supersedes_pack_id AS supersedesPackId, finalized_at AS finalizedAt
         FROM foundation_research_packs WHERE pack_id = ? AND finalized_at IS NOT NULL`,
    ).get(packId) as PackRow | undefined;
    if (!pack) throw new FoundationValidationError(`Finalized Research Pack not found: ${packId}`);
    const manifestArtifact = this.#artifactMetadata(pack.manifestArtifactSha256);
    if (manifestArtifact.mediaType !== 'application/json' || manifestArtifact.contractVersion !== '1.0.0' ||
        manifestArtifact.relativePath !== expectedPath(pack.manifestArtifactSha256)) {
      throw new FoundationIdentityConflictError('Research Pack manifest artifact metadata mismatch');
    }
    const manifestBytes = await this.#artifacts.read(pack.manifestArtifactSha256);
    if (manifestArtifact.byteSize !== BigInt(manifestBytes.byteLength)) {
      throw new FoundationIdentityConflictError('Research Pack manifest artifact size mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)) as unknown;
    } catch (error) {
      throw new FoundationValidationError(`Invalid Research Pack manifest JSON: ${(error as Error).message}`);
    }
    const manifest = validateResearchPackManifest(parsed);
    if (!manifestBytes.equals(Buffer.from(canonicalJson(manifest), 'utf8'))) {
      throw new FoundationValidationError('Research Pack manifest is not canonical JSON');
    }
    const documentIds = this.#membership(packId);
    const rows = this.#loadDocuments(documentIds);
    if (rows.length !== documentIds.length) throw new FoundationIdentityConflictError('Research Pack membership is incomplete');
    const expectedManifest = buildManifest({
      contractVersion: '1.0.0', packKey: pack.packKey, version: Number(pack.version), purpose: pack.purpose,
      documentIds: documentIds as [string, ...string[]],
      ...(pack.supersedesPackId === null ? {} : { supersedesPackId: pack.supersedesPackId }),
    }, rows, pack.finalizedAt);
    if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
      throw new FoundationIdentityConflictError('Research Pack manifest does not match immutable metadata or membership');
    }
    const expectedRequestSha256 = sha256(Buffer.from(canonicalJson({
      contractVersion: '1.0.0', documentIds, packKey: pack.packKey, purpose: pack.purpose,
      ...(pack.supersedesPackId === null ? {} : { supersedesPackId: pack.supersedesPackId }), version: Number(pack.version),
    }), 'utf8'));
    if (expectedRequestSha256 !== pack.requestSha256) {
      throw new FoundationIdentityConflictError('Research Pack semantic request metadata mismatch');
    }

    const documents = await this.#verifyRawDocuments(rows);
    return { researchPackId: packId, manifestArtifactSha256: pack.manifestArtifactSha256, manifest, documents };
  }

  async #verifyRawDocuments(rows: readonly DocumentRow[]): Promise<VerifiedResearchDocument[]> {
    const documents: VerifiedResearchDocument[] = [];
    for (const row of rows) {
      if (row.evidenceArtifactSha256 !== row.rawArtifactSha256 || row.ingestionArtifactSha256 !== row.rawArtifactSha256 ||
          row.ingestionStatus !== 'completed') {
        throw new FoundationIdentityConflictError(`Research document lineage mismatch: ${row.documentId}`);
      }
      if (row.artifactMediaType !== 'text/plain' || row.artifactRelativePath !== expectedPath(row.rawArtifactSha256) ||
          row.artifactContractVersion !== '1.0.0') {
        throw new FoundationIdentityConflictError(`Research document artifact metadata mismatch: ${row.documentId}`);
      }
      const bytes = await this.#artifacts.read(row.rawArtifactSha256);
      if (row.artifactByteSize !== BigInt(bytes.byteLength)) {
        throw new FoundationIdentityConflictError(`Research document artifact size mismatch: ${row.documentId}`);
      }
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (error) {
        throw new FoundationValidationError(`Invalid UTF-8 research document ${row.documentId}: ${(error as Error).message}`);
      }
      if (text.trim().length === 0 || bytes.includes(0)) {
        throw new FoundationValidationError(`Invalid empty or NUL research document: ${row.documentId}`);
      }
      documents.push({ documentId: row.documentId, bytes, text });
    }
    return documents;
  }

  #validateSupersession(input: ResearchPackRequest): void {
    if (input.supersedesPackId === undefined) return;
    const prior = this.#db.prepare(
      'SELECT pack_key AS packKey, version, finalized_at AS finalizedAt FROM foundation_research_packs WHERE pack_id = ?',
    ).get(input.supersedesPackId) as { packKey: string; version: bigint; finalizedAt: string | null } | undefined;
    if (!prior || prior.finalizedAt === null || prior.packKey !== input.packKey || prior.version >= BigInt(input.version)) {
      throw new FoundationValidationError('Superseded Research Pack must be finalized with the same key and a lower version');
    }
  }

  #membership(packId: string): string[] {
    return (this.#db.prepare(
      'SELECT document_id AS documentId FROM foundation_research_pack_items WHERE pack_id = ? ORDER BY document_id',
    ).all(packId) as Array<{ documentId: string }>).map((row) => row.documentId);
  }

  #loadDocuments(documentIds: readonly string[]): DocumentRow[] {
    if (documentIds.length === 0) return [];
    const rows: DocumentRow[] = [];
    for (let offset = 0; offset < documentIds.length; offset += 500) {
      const chunk = documentIds.slice(offset, offset + 500);
      rows.push(...this.#db.prepare(
        `SELECT d.document_id AS documentId, d.document_type AS documentType, d.title,
                d.source_locator AS sourceLocator, d.language_tag AS languageTag, d.published_at AS publishedAt,
                d.rights_status AS rightsStatus, d.rights_basis AS rightsBasis,
                e.evidence_id AS evidenceId, e.evidence_grade AS evidenceGrade,
                e.evidence_grade_basis AS evidenceGradeBasis, i.source_id AS sourceId,
                i.ingestion_id AS ingestionId, i.acquired_at AS acquiredAt, i.status AS ingestionStatus,
                i.artifact_sha256 AS ingestionArtifactSha256,
                d.raw_artifact_sha256 AS rawArtifactSha256, e.artifact_sha256 AS evidenceArtifactSha256,
                a.byte_size AS artifactByteSize,
                a.media_type AS artifactMediaType, a.relative_path AS artifactRelativePath,
                a.contract_version AS artifactContractVersion
           FROM foundation_research_documents d
           JOIN foundation_evidence e ON e.evidence_id = d.evidence_id
           JOIN foundation_ingestion_runs i ON i.ingestion_id = e.ingestion_id
           JOIN artifact_manifests a ON a.sha256 = d.raw_artifact_sha256
          WHERE d.document_id IN (${chunk.map(() => '?').join(', ')})`,
      ).all(...chunk) as DocumentRow[]);
    }
    return rows.sort((left, right) => left.documentId.localeCompare(right.documentId));
  }

  #artifactMetadata(sha256Value: string): { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } {
    const row = this.#db.prepare(
      `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
              contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
    ).get(sha256Value) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!row) throw new FoundationIdentityConflictError(`Artifact manifest not found: ${sha256Value}`);
    return row;
  }
}

function buildManifest(input: ResearchPackRequest, rows: readonly DocumentRow[], finalizedAt: string): ResearchPackManifest {
  return {
    contractVersion: '1.0.0', packKey: input.packKey, version: input.version, purpose: input.purpose, finalizedAt,
    ...(input.supersedesPackId === undefined ? {} : { supersedesPackId: input.supersedesPackId }),
    documents: rows.map((row) => ({
      documentId: row.documentId, documentType: row.documentType, title: row.title,
      sourceLocator: row.sourceLocator, languageTag: row.languageTag,
      ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt }),
      rightsStatus: row.rightsStatus, rightsBasis: row.rightsBasis,
      evidence: { evidenceId: row.evidenceId, grade: row.evidenceGrade, basis: row.evidenceGradeBasis },
      source: { sourceId: row.sourceId },
      ingestion: { ingestionId: row.ingestionId, acquiredAt: row.acquiredAt },
      rawArtifact: { sha256: row.rawArtifactSha256, byteSize: Number(row.artifactByteSize), mediaType: 'text/plain' },
    })) as ResearchPackManifest['documents'],
  };
}

function expectedPath(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

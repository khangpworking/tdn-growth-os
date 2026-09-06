import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ResearchDocumentImport } from '../../../contracts/foundation/research-document-import.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from './canonical-json.js';
import { FoundationIdentityConflictError } from './foundation-service.js';
import { FoundationValidationError, validateResearchDocumentImport } from './validation.js';

export const RESEARCH_DOCUMENT_MAX_BYTES = 1024 * 1024;

export interface ResearchDocumentImportResult {
  readonly documentId: string;
  readonly ingestionId: string;
  readonly evidenceId: string;
  readonly artifactSha256: string;
  readonly deduplicated: boolean;
}

interface ExistingDocumentImport extends ResearchDocumentImportResult {
  readonly requestSha256: string;
  readonly evidenceArtifactSha256: string | null;
  readonly documentArtifactSha256: string | null;
  readonly status: string;
  readonly artifactByteSize: bigint | null;
  readonly artifactMediaType: string | null;
  readonly artifactRelativePath: string | null;
  readonly artifactContractVersion: string | null;
}

export class ResearchDocumentService {
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

  async importManualDocument(untrustedMetadata: unknown, suppliedBytes: Uint8Array): Promise<ResearchDocumentImportResult> {
    const metadata = validateResearchDocumentImport(untrustedMetadata);
    const exactBytes = validateDocumentBytes(suppliedBytes);
    const artifactSha256 = sha256(exactBytes);
    const requestSha256 = sha256(Buffer.from(canonicalJson({ metadata, artifactSha256 }), 'utf8'));
    const existing = this.#existing(metadata.source.sourceId, metadata.ingestion.idempotencyKey);
    if (existing) {
      if (existing.requestSha256 !== requestSha256 || existing.artifactSha256 !== artifactSha256) {
        throw new FoundationIdentityConflictError('Ingestion idempotency key was already used for different document metadata or bytes');
      }
      if (existing.status !== 'completed' || existing.evidenceArtifactSha256 !== artifactSha256 ||
          existing.documentArtifactSha256 !== artifactSha256 || existing.artifactByteSize !== BigInt(exactBytes.byteLength) ||
          existing.artifactMediaType !== 'text/plain' || existing.artifactRelativePath !== expectedPath(artifactSha256) ||
          existing.artifactContractVersion !== metadata.contractVersion) {
        throw new FoundationIdentityConflictError('Existing research document lineage or artifact metadata is incompatible');
      }
      const existingBytes = await this.#artifacts.read(artifactSha256);
      if (!existingBytes.equals(exactBytes)) {
        throw new FoundationIdentityConflictError('Existing research document artifact bytes do not match the request');
      }
      return {
        documentId: existing.documentId,
        ingestionId: existing.ingestionId,
        evidenceId: existing.evidenceId,
        artifactSha256: existing.artifactSha256,
        deduplicated: true,
      };
    }

    const stored = await this.#artifacts.put(exactBytes);
    const now = this.#now().toISOString();
    const ingestionId = randomUUID();
    const evidenceId = randomUUID();
    const documentId = randomUUID();
    const transaction = this.#db.transaction((): ResearchDocumentImportResult => {
      this.#db.prepare(
        `INSERT INTO foundation_sources(source_id, source_type, display_name, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(source_id) DO NOTHING`,
      ).run(metadata.source.sourceId, metadata.source.sourceType, metadata.source.displayName, now);
      const source = this.#db.prepare(
        'SELECT source_type AS sourceType, display_name AS displayName FROM foundation_sources WHERE source_id = ?',
      ).get(metadata.source.sourceId) as { sourceType: string; displayName: string };
      if (source.sourceType !== metadata.source.sourceType || source.displayName !== metadata.source.displayName) {
        throw new FoundationIdentityConflictError('Source identity already exists with different metadata');
      }

      this.#db.prepare(
        `INSERT INTO foundation_ingestion_runs(
           ingestion_id, source_id, idempotency_key, status, acquired_at, started_at,
           completed_at, artifact_sha256, request_sha256, contract_version
         ) VALUES (?, ?, ?, 'processing', ?, ?, NULL, NULL, ?, ?)`,
      ).run(ingestionId, metadata.source.sourceId, metadata.ingestion.idempotencyKey,
        metadata.ingestion.acquiredAt, now, requestSha256, metadata.contractVersion);

      this.#db.prepare(
        `INSERT INTO artifact_manifests(
           sha256, byte_size, media_type, relative_path, acquired_at,
           contract_version, retention_status, created_at
         ) VALUES (?, ?, 'text/plain', ?, ?, ?, 'active', ?)
         ON CONFLICT(sha256) DO NOTHING`,
      ).run(stored.sha256, stored.byteSize, stored.relativePath, metadata.ingestion.acquiredAt, metadata.contractVersion, now);
      const artifact = this.#db.prepare(
        `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
                contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
      ).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
      if (artifact.byteSize !== BigInt(stored.byteSize) || artifact.mediaType !== 'text/plain' ||
          artifact.relativePath !== stored.relativePath || artifact.contractVersion !== metadata.contractVersion) {
        throw new FoundationIdentityConflictError('Document artifact manifest metadata conflict');
      }

      this.#db.prepare(
        `INSERT INTO foundation_evidence(
           evidence_id, ingestion_id, artifact_sha256, evidence_grade, evidence_grade_basis, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(evidenceId, ingestionId, stored.sha256, metadata.ingestion.evidenceGrade.grade,
        metadata.ingestion.evidenceGrade.basis, now);
      this.#db.prepare(
        `INSERT INTO foundation_research_documents(
           document_id, evidence_id, document_type, title, source_locator, language_tag,
           published_at, rights_status, rights_basis, raw_artifact_sha256, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(documentId, evidenceId, metadata.document.documentType, metadata.document.title,
        metadata.document.sourceLocator, metadata.document.languageTag, metadata.document.publishedAt ?? null,
        metadata.document.rightsStatus, metadata.document.rightsBasis, stored.sha256, now);
      this.#db.prepare(
        `UPDATE foundation_ingestion_runs SET status = 'completed', completed_at = ?, artifact_sha256 = ?
          WHERE ingestion_id = ?`,
      ).run(now, stored.sha256, ingestionId);
      return { documentId, ingestionId, evidenceId, artifactSha256: stored.sha256, deduplicated: false };
    });
    return transaction();
  }

  #existing(sourceId: string, idempotencyKey: string): ExistingDocumentImport | undefined {
    return this.#db.prepare(
      `SELECT d.document_id AS documentId, i.ingestion_id AS ingestionId, e.evidence_id AS evidenceId,
              i.artifact_sha256 AS artifactSha256, i.request_sha256 AS requestSha256, i.status,
              e.artifact_sha256 AS evidenceArtifactSha256, d.raw_artifact_sha256 AS documentArtifactSha256,
              a.byte_size AS artifactByteSize, a.media_type AS artifactMediaType,
              a.relative_path AS artifactRelativePath, a.contract_version AS artifactContractVersion,
              1 AS deduplicated
         FROM foundation_ingestion_runs i
         LEFT JOIN foundation_evidence e ON e.ingestion_id = i.ingestion_id
         LEFT JOIN foundation_research_documents d ON d.evidence_id = e.evidence_id
         LEFT JOIN artifact_manifests a ON a.sha256 = i.artifact_sha256
        WHERE i.source_id = ? AND i.idempotency_key = ?`,
    ).get(sourceId, idempotencyKey) as ExistingDocumentImport | undefined;
  }
}

function validateDocumentBytes(suppliedBytes: Uint8Array): Buffer {
  const exactBytes = Buffer.from(suppliedBytes);
  if (exactBytes.byteLength > RESEARCH_DOCUMENT_MAX_BYTES) {
    throw new FoundationValidationError(`research document exceeds ${RESEARCH_DOCUMENT_MAX_BYTES} byte limit`);
  }
  if (exactBytes.includes(0)) throw new FoundationValidationError('research document contains a NUL byte');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(exactBytes);
  } catch (error) {
    throw new FoundationValidationError(`invalid UTF-8 research document: ${(error as Error).message}`);
  }
  if (text.trim().length === 0) throw new FoundationValidationError('research document must contain non-whitespace text');
  return exactBytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectedPath(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}`;
}

import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ResearchEvidenceIndexRequest } from '../../../contracts/analysis/research-evidence-index-request.generated.js';
import type { ResearchEvidenceIndexResult } from '../../../contracts/analysis/research-evidence-index-result.generated.js';
import type { FinalizedResearchPackReader, VerifiedFinalizedResearchPack } from '../foundation/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { AnalysisIdentityConflictError } from './market-snapshot-service.js';
import { segmentResearchDocument } from './research-evidence-segmentation.js';
import {
  AnalysisValidationError,
  validateResearchEvidenceIndexRequest,
  validateResearchEvidenceIndexResult,
} from './validation.js';

export interface ResearchEvidenceIndexExecution {
  readonly resultId: string;
  readonly resultArtifactSha256: string;
  readonly deduplicated: boolean;
}

interface ResultRow {
  readonly researchPackId: string;
  readonly sourceManifestArtifactSha256: string;
  readonly calculationKey: string;
  readonly calculationVersion: bigint;
  readonly requestSha256: string;
  readonly resultArtifactSha256: string;
  readonly completedAt: string;
  readonly artifactByteSize: bigint;
  readonly artifactMediaType: string;
  readonly artifactRelativePath: string;
  readonly artifactContractVersion: string;
}

export class ResearchEvidenceIndexService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #researchPacks: FinalizedResearchPackReader;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly researchPackReader: FinalizedResearchPackReader;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#researchPacks = options.researchPackReader;
    this.#now = options.now ?? (() => new Date());
  }

  async calculate(untrustedInput: unknown): Promise<ResearchEvidenceIndexExecution> {
    const input = validateResearchEvidenceIndexRequest(untrustedInput);
    const requestSha256 = sha256(Buffer.from(canonicalJson(input), 'utf8'));
    const frozen = await this.#researchPacks.readFinalizedResearchPack(input.researchPackId);
    assertResearchPackIdentity(frozen, input.researchPackId);
    const existing = this.#existing(input);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw new AnalysisIdentityConflictError('Research evidence Result identity already exists with different input');
      }
      return { resultId: existing.resultId, resultArtifactSha256: existing.resultArtifactSha256, deduplicated: true };
    }

    const resultId = randomUUID();
    const completedAt = this.#now().toISOString();
    const result = buildResearchEvidenceIndexResult(input, frozen, resultId, completedAt);
    validateResearchEvidenceIndexResult(result);
    const resultBytes = Buffer.from(canonicalJson(result), 'utf8');
    const stored = await this.#artifacts.put(resultBytes);
    const transaction = this.#db.transaction((): ResearchEvidenceIndexExecution => {
      this.#db.prepare(
        `INSERT INTO artifact_manifests(
           sha256, byte_size, media_type, relative_path, acquired_at,
           contract_version, retention_status, created_at
         ) VALUES (?, ?, 'application/json', ?, ?, ?, 'active', ?)
         ON CONFLICT(sha256) DO NOTHING`,
      ).run(stored.sha256, stored.byteSize, stored.relativePath, completedAt, input.contractVersion, completedAt);
      const artifact = this.#db.prepare(
        `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
                contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
      ).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
      if (artifact.byteSize !== BigInt(stored.byteSize) || artifact.mediaType !== 'application/json' ||
          artifact.relativePath !== stored.relativePath || artifact.contractVersion !== input.contractVersion) {
        throw new AnalysisIdentityConflictError('Research evidence Result artifact manifest metadata conflict');
      }
      this.#db.prepare(
        `INSERT INTO analysis_research_results(
           result_id, research_pack_id, source_manifest_artifact_sha256, calculation_key,
           calculation_version, request_sha256, result_artifact_sha256, completed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(resultId, input.researchPackId, frozen.manifestArtifactSha256, input.calculationKey,
        input.calculationVersion, requestSha256, stored.sha256, completedAt);
      return { resultId, resultArtifactSha256: stored.sha256, deduplicated: false };
    });
    return transaction();
  }

  getResultArtifactSha256(resultId: string): string {
    const row = this.#db.prepare(
      'SELECT result_artifact_sha256 AS resultArtifactSha256 FROM analysis_research_results WHERE result_id = ?',
    ).get(resultId) as { resultArtifactSha256: string } | undefined;
    if (!row) throw new AnalysisValidationError(`Research evidence Result not found: ${resultId}`);
    return row.resultArtifactSha256;
  }

  async replay(resultId: string): Promise<ResearchEvidenceIndexResult> {
    const row = this.#db.prepare(
      `SELECT r.research_pack_id AS researchPackId,
              r.source_manifest_artifact_sha256 AS sourceManifestArtifactSha256,
              r.calculation_key AS calculationKey, r.calculation_version AS calculationVersion,
              r.request_sha256 AS requestSha256, r.result_artifact_sha256 AS resultArtifactSha256,
              r.completed_at AS completedAt, a.byte_size AS artifactByteSize,
              a.media_type AS artifactMediaType, a.relative_path AS artifactRelativePath,
              a.contract_version AS artifactContractVersion
         FROM analysis_research_results r
         JOIN artifact_manifests a ON a.sha256 = r.result_artifact_sha256
        WHERE r.result_id = ?`,
    ).get(resultId) as ResultRow | undefined;
    if (!row) throw new AnalysisValidationError(`Research evidence Result not found: ${resultId}`);
    const bytes = await this.#artifacts.read(row.resultArtifactSha256);
    if (row.artifactByteSize !== BigInt(bytes.byteLength) || row.artifactMediaType !== 'application/json' ||
        row.artifactRelativePath !== expectedPath(row.resultArtifactSha256) || row.artifactContractVersion !== '1.0.0') {
      throw new AnalysisIdentityConflictError('Research evidence Result artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new AnalysisValidationError(`Invalid Research evidence Result JSON: ${(error as Error).message}`);
    }
    const result = validateResearchEvidenceIndexResult(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(result), 'utf8'))) {
      throw new AnalysisValidationError('Research evidence Result is not canonical JSON');
    }
    const request = {
      contractVersion: '1.0.0',
      researchPackId: row.researchPackId,
      calculationKey: row.calculationKey,
      calculationVersion: Number(row.calculationVersion),
    };
    const validatedRequest = validateResearchEvidenceIndexRequest(request);
    const frozen = await this.#researchPacks.readFinalizedResearchPack(row.researchPackId);
    assertResearchPackIdentity(frozen, row.researchPackId);
    const recomputed = buildResearchEvidenceIndexResult(validatedRequest, frozen, resultId, row.completedAt);
    validateResearchEvidenceIndexResult(recomputed);
    if (sha256(Buffer.from(canonicalJson(validatedRequest), 'utf8')) !== row.requestSha256 ||
        row.sourceManifestArtifactSha256 !== frozen.manifestArtifactSha256 ||
        result.researchPack.manifestArtifactSha256 !== row.sourceManifestArtifactSha256 ||
        canonicalJson(result) !== canonicalJson(recomputed)) {
      throw new AnalysisIdentityConflictError('Research evidence Result does not match immutable source or database metadata');
    }
    return result;
  }

  #existing(input: ResearchEvidenceIndexRequest): (ResearchEvidenceIndexExecution & { requestSha256: string }) | undefined {
    return this.#db.prepare(
      `SELECT result_id AS resultId, request_sha256 AS requestSha256,
              result_artifact_sha256 AS resultArtifactSha256, 1 AS deduplicated
         FROM analysis_research_results
        WHERE research_pack_id = ? AND calculation_key = ? AND calculation_version = ?`,
    ).get(input.researchPackId, input.calculationKey, input.calculationVersion) as
      (ResearchEvidenceIndexExecution & { requestSha256: string }) | undefined;
  }
}

function buildResearchEvidenceIndexResult(
  input: ResearchEvidenceIndexRequest,
  frozen: VerifiedFinalizedResearchPack,
  resultId: string,
  completedAt: string,
): ResearchEvidenceIndexResult {
  const bytesByDocumentId = new Map(frozen.documents.map((document) => [document.documentId, document.bytes]));
  let retainedSegmentCount = 0;
  const documents = frozen.manifest.documents.map((document, documentIndex) => {
    const bytes = bytesByDocumentId.get(document.documentId);
    if (!bytes) throw new AnalysisIdentityConflictError(`Verified Research Pack bytes missing for document: ${document.documentId}`);
    const rawSegments = segmentResearchDocument(bytes);
    if (rawSegments.length === 0) {
      throw new AnalysisValidationError(`Research document yields zero retained segments: ${document.documentId}`);
    }
    const segments = rawSegments.map((segment) => ({
      ...segment,
      citationPointer: `/documents/${documentIndex}/segments/${segment.segmentIndex}/text`,
    }));
    retainedSegmentCount += segments.length;
    return {
      documentId: document.documentId,
      rawArtifactSha256: document.rawArtifact.sha256,
      languageTag: document.languageTag,
      documentType: document.documentType,
      title: document.title,
      sourceLocator: document.sourceLocator,
      segments,
    };
  });
  return {
    contractVersion: '1.0.0', resultId, calculationKey: input.calculationKey,
    calculationVersion: input.calculationVersion, completedAt,
    researchPack: { researchPackId: frozen.researchPackId, manifestArtifactSha256: frozen.manifestArtifactSha256 },
    coverage: { documentCount: documents.length, retainedSegmentCount },
    documents: documents as ResearchEvidenceIndexResult['documents'],
  };
}

function expectedPath(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertResearchPackIdentity(frozen: VerifiedFinalizedResearchPack, expectedResearchPackId: string): void {
  if (frozen.researchPackId !== expectedResearchPackId) {
    throw new AnalysisIdentityConflictError('Verified Research Pack identity does not match the requested source');
  }
}

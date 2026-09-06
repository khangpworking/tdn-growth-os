import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ResearchEvidenceAudit } from '../../../contracts/analysis/research-evidence-audit.generated.js';
import type { ResearchEvidenceAuditOutput } from '../../../contracts/analysis/research-evidence-audit-output.generated.js';
import type { ResearchEvidenceAuditRequest } from '../../../contracts/analysis/research-evidence-audit-request.generated.js';
import outputSchema from '../../../contracts/analysis/research-evidence-audit-output.schema.json' with { type: 'json' };
import type { AiGateway, AiGatewayResponse } from '../../platform/ai/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/index.js';
import type { ResearchEvidenceIndexResultReader, VerifiedResearchEvidenceIndexResult } from './research-evidence-index-result-reader.js';
import {
  AnalysisValidationError,
  validateResearchEvidenceAudit,
  validateResearchEvidenceAuditOutput,
  validateResearchEvidenceAuditRequest,
} from './validation.js';

export interface ResearchEvidenceAuditConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly promptText: string;
  readonly outputSchemaVersion: '1.0.0';
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export interface ResearchEvidenceAuditExecution {
  readonly auditId: string;
  readonly outputArtifactSha256: string;
  readonly deduplicated: boolean;
}

interface ExistingAudit extends ResearchEvidenceAuditExecution {
  readonly sourceResultArtifactSha256: string;
  readonly promptSha256: string;
  readonly requestSha256: string;
}

interface AuditRow {
  readonly sourceResultId: string;
  readonly sourceResultArtifactSha256: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptId: string;
  readonly promptVersion: bigint;
  readonly promptSha256: string;
  readonly outputSchemaVersion: string;
  readonly requestSha256: string;
  readonly outputArtifactSha256: string;
  readonly completedAt: string;
  readonly providerRequestId: string | null;
  readonly inputTokenCount: bigint | null;
  readonly outputTokenCount: bigint | null;
  readonly latencyMs: bigint | null;
  readonly artifactByteSize: bigint;
  readonly artifactMediaType: string;
  readonly artifactRelativePath: string;
  readonly artifactContractVersion: string;
}

export class ResearchEvidenceAuditIdentityConflictError extends Error {}

export class ResearchEvidenceAuditService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #results: ResearchEvidenceIndexResultReader;
  readonly #gateway: AiGateway;
  readonly #config: ResearchEvidenceAuditConfiguration;
  readonly #promptSha256: string;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly resultReader: ResearchEvidenceIndexResultReader;
    readonly gateway: AiGateway;
    readonly configuration: ResearchEvidenceAuditConfiguration;
    readonly now?: () => Date;
  }) {
    assertConfiguration(options.configuration);
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#results = options.resultReader;
    this.#gateway = options.gateway;
    this.#config = options.configuration;
    this.#promptSha256 = sha256(Buffer.from(options.configuration.promptText, 'utf8'));
    this.#now = options.now ?? (() => new Date());
  }

  async audit(untrustedInput: unknown): Promise<ResearchEvidenceAuditExecution> {
    const input = validateResearchEvidenceAuditRequest(untrustedInput);
    const verified = await this.#results.readVerifiedResearchEvidenceIndexResult(input.resultId);
    assertVerifiedIdentity(verified, input.resultId);
    this.#assertPromptIdentity();
    const requestSha256 = this.#requestSha256(input, verified.resultArtifactSha256);
    const existing = this.#existing(input.resultId);
    if (existing) {
      if (existing.sourceResultArtifactSha256 !== verified.resultArtifactSha256 ||
          existing.promptSha256 !== this.#promptSha256 || existing.requestSha256 !== requestSha256) {
        throw new ResearchEvidenceAuditIdentityConflictError('Research audit identity exists with prompt or request drift');
      }
      return { auditId: existing.auditId, outputArtifactSha256: existing.outputArtifactSha256, deduplicated: true };
    }

    const auditId = randomUUID();
    const response = await this.#gateway.execute({
      runId: auditId,
      providerId: this.#config.providerId,
      modelId: this.#config.modelId,
      prompt: { id: this.#config.promptId, version: this.#config.promptVersion, text: this.#config.promptText, sha256: this.#promptSha256 },
      input: { resultId: verified.resultId, resultArtifactSha256: verified.resultArtifactSha256, result: verified.result },
      output: { schemaVersion: this.#config.outputSchemaVersion, jsonSchema: outputSchema },
      limits: { timeoutMs: this.#config.timeoutMs, maxOutputTokens: this.#config.maxOutputTokens },
      tools: [],
    });
    const output = validateResearchEvidenceAuditOutput(response.output);
    validateAuditSemantics(output, verified);
    validateGatewayMetadata(response);
    const completedAt = this.#now().toISOString();
    const envelope = buildEnvelope(auditId, completedAt, verified, this.#config, this.#promptSha256, response, output);
    validateResearchEvidenceAudit(envelope);
    const stored = await this.#artifacts.put(Buffer.from(canonicalJson(envelope), 'utf8'));

    const transaction = this.#db.transaction((): ResearchEvidenceAuditExecution => {
      this.#db.prepare(
        `INSERT INTO artifact_manifests(
           sha256, byte_size, media_type, relative_path, acquired_at,
           contract_version, retention_status, created_at
         ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
         ON CONFLICT(sha256) DO NOTHING`,
      ).run(stored.sha256, stored.byteSize, stored.relativePath, completedAt, completedAt);
      const artifact = this.#db.prepare(
        `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
                contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
      ).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
      if (artifact.byteSize !== BigInt(stored.byteSize) || artifact.mediaType !== 'application/json' ||
          artifact.relativePath !== stored.relativePath || artifact.contractVersion !== '1.0.0') {
        throw new ResearchEvidenceAuditIdentityConflictError('Research audit artifact metadata conflict');
      }
      this.#db.prepare(
        `INSERT INTO analysis_research_audits(
           audit_id, source_result_id, source_result_artifact_sha256, provider_id, model_id,
           prompt_id, prompt_version, prompt_sha256, output_schema_version, request_sha256,
           output_artifact_sha256, completed_at, provider_request_id, input_token_count,
           output_token_count, latency_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(auditId, verified.resultId, verified.resultArtifactSha256, this.#config.providerId, this.#config.modelId,
        this.#config.promptId, this.#config.promptVersion, this.#promptSha256, this.#config.outputSchemaVersion,
        requestSha256, stored.sha256, completedAt, response.providerRequestId ?? null,
        response.usage?.inputTokens ?? null, response.usage?.outputTokens ?? null, response.latencyMs ?? null);
      return { auditId, outputArtifactSha256: stored.sha256, deduplicated: false };
    });
    return transaction();
  }

  getOutputArtifactSha256(auditId: string): string {
    const row = this.#db.prepare(
      'SELECT output_artifact_sha256 AS outputArtifactSha256 FROM analysis_research_audits WHERE audit_id = ?',
    ).get(auditId) as { outputArtifactSha256: string } | undefined;
    if (!row) throw new AnalysisValidationError(`Research evidence audit not found: ${auditId}`);
    return row.outputArtifactSha256;
  }

  async replay(auditId: string): Promise<ResearchEvidenceAudit> {
    const row = this.#db.prepare(
      `SELECT r.source_result_id AS sourceResultId,
              r.source_result_artifact_sha256 AS sourceResultArtifactSha256,
              r.provider_id AS providerId, r.model_id AS modelId, r.prompt_id AS promptId,
              r.prompt_version AS promptVersion, r.prompt_sha256 AS promptSha256,
              r.output_schema_version AS outputSchemaVersion, r.request_sha256 AS requestSha256,
              r.output_artifact_sha256 AS outputArtifactSha256, r.completed_at AS completedAt,
              r.provider_request_id AS providerRequestId, r.input_token_count AS inputTokenCount,
              r.output_token_count AS outputTokenCount, r.latency_ms AS latencyMs,
              a.byte_size AS artifactByteSize, a.media_type AS artifactMediaType,
              a.relative_path AS artifactRelativePath, a.contract_version AS artifactContractVersion
         FROM analysis_research_audits r
         JOIN artifact_manifests a ON a.sha256 = r.output_artifact_sha256
        WHERE r.audit_id = ?`,
    ).get(auditId) as AuditRow | undefined;
    if (!row) throw new AnalysisValidationError(`Research evidence audit not found: ${auditId}`);
    const bytes = await this.#artifacts.read(row.outputArtifactSha256);
    if (row.artifactByteSize !== BigInt(bytes.byteLength) || row.artifactMediaType !== 'application/json' ||
        row.artifactRelativePath !== expectedPath(row.outputArtifactSha256) || row.artifactContractVersion !== '1.0.0') {
      throw new ResearchEvidenceAuditIdentityConflictError('Research audit artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new AnalysisValidationError(`Invalid research audit JSON: ${(error as Error).message}`);
    }
    const envelope = validateResearchEvidenceAudit(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(envelope), 'utf8'))) {
      throw new AnalysisValidationError('Research evidence audit is not canonical JSON');
    }
    const verified = await this.#results.readVerifiedResearchEvidenceIndexResult(row.sourceResultId);
    assertVerifiedIdentity(verified, row.sourceResultId);
    validateAuditSemantics(envelope.output, verified);
    const expectedRequestSha256 = this.#requestSha256(
      { contractVersion: '1.0.0', resultId: row.sourceResultId },
      row.sourceResultArtifactSha256,
    );
    if (expectedRequestSha256 !== row.requestSha256 || row.promptSha256 !== this.#promptSha256 ||
        envelope.auditId !== auditId || envelope.completedAt !== row.completedAt ||
        envelope.sourceResult.resultId !== row.sourceResultId ||
        envelope.sourceResult.resultArtifactSha256 !== row.sourceResultArtifactSha256 ||
        verified.resultArtifactSha256 !== row.sourceResultArtifactSha256 ||
        envelope.gateway.providerId !== row.providerId || envelope.gateway.providerId !== this.#config.providerId ||
        envelope.gateway.modelId !== row.modelId || envelope.gateway.modelId !== this.#config.modelId ||
        envelope.prompt.promptId !== row.promptId || envelope.prompt.promptId !== this.#config.promptId ||
        BigInt(envelope.prompt.promptVersion) !== row.promptVersion || envelope.prompt.promptVersion !== this.#config.promptVersion ||
        envelope.prompt.promptSha256 !== row.promptSha256 ||
        envelope.outputSchemaVersion !== row.outputSchemaVersion || envelope.outputSchemaVersion !== this.#config.outputSchemaVersion ||
        (envelope.gateway.providerRequestId ?? null) !== row.providerRequestId ||
        optionalBigInt(envelope.gateway.inputTokenCount) !== row.inputTokenCount ||
        optionalBigInt(envelope.gateway.outputTokenCount) !== row.outputTokenCount ||
        optionalBigInt(envelope.gateway.latencyMs) !== row.latencyMs) {
      throw new ResearchEvidenceAuditIdentityConflictError('Research audit artifact does not match immutable metadata');
    }
    return envelope;
  }

  #assertPromptIdentity(): void {
    const row = this.#db.prepare(
      `SELECT prompt_sha256 AS promptSha256 FROM analysis_research_audits
        WHERE prompt_id = ? AND prompt_version = ? LIMIT 1`,
    ).get(this.#config.promptId, this.#config.promptVersion) as { promptSha256: string } | undefined;
    if (row && row.promptSha256 !== this.#promptSha256) {
      throw new ResearchEvidenceAuditIdentityConflictError('Prompt ID and version already exist with different content');
    }
  }

  #existing(resultId: string): ExistingAudit | undefined {
    return this.#db.prepare(
      `SELECT audit_id AS auditId, source_result_artifact_sha256 AS sourceResultArtifactSha256,
              prompt_sha256 AS promptSha256, request_sha256 AS requestSha256,
              output_artifact_sha256 AS outputArtifactSha256, 0 AS deduplicated
         FROM analysis_research_audits
        WHERE source_result_id = ? AND provider_id = ? AND model_id = ?
          AND prompt_id = ? AND prompt_version = ? AND output_schema_version = ?`,
    ).get(resultId, this.#config.providerId, this.#config.modelId, this.#config.promptId,
      this.#config.promptVersion, this.#config.outputSchemaVersion) as ExistingAudit | undefined;
  }

  #requestSha256(input: ResearchEvidenceAuditRequest, resultArtifactSha256: string): string {
    return sha256(Buffer.from(canonicalJson({
      contractVersion: input.contractVersion, resultId: input.resultId, resultArtifactSha256,
      providerId: this.#config.providerId, modelId: this.#config.modelId,
      promptId: this.#config.promptId, promptVersion: this.#config.promptVersion,
      promptSha256: this.#promptSha256, outputSchemaVersion: this.#config.outputSchemaVersion,
    }), 'utf8'));
  }
}

function buildEnvelope(
  auditId: string,
  completedAt: string,
  verified: VerifiedResearchEvidenceIndexResult,
  config: ResearchEvidenceAuditConfiguration,
  promptSha256: string,
  response: AiGatewayResponse,
  output: ResearchEvidenceAuditOutput,
): ResearchEvidenceAudit {
  return {
    contractVersion: '1.0.0', auditId, completedAt,
    sourceResult: { resultId: verified.resultId, resultArtifactSha256: verified.resultArtifactSha256 },
    gateway: {
      providerId: config.providerId, modelId: config.modelId,
      ...(response.providerRequestId === undefined ? {} : { providerRequestId: response.providerRequestId }),
      ...(response.usage?.inputTokens === undefined ? {} : { inputTokenCount: response.usage.inputTokens }),
      ...(response.usage?.outputTokens === undefined ? {} : { outputTokenCount: response.usage.outputTokens }),
      ...(response.latencyMs === undefined ? {} : { latencyMs: response.latencyMs }),
    },
    prompt: { promptId: config.promptId, promptVersion: config.promptVersion, promptSha256 },
    outputSchemaVersion: config.outputSchemaVersion,
    output,
  };
}

export function validateResearchEvidenceAuditSemantics(
  output: ResearchEvidenceAuditOutput,
  verified: VerifiedResearchEvidenceIndexResult,
): void {
  validateAuditSemantics(output, verified);
}

function validateAuditSemantics(output: ResearchEvidenceAuditOutput, verified: VerifiedResearchEvidenceIndexResult): void {
  const allowed = new Map<string, string>();
  for (const [documentIndex, document] of verified.result.documents.entries()) {
    for (const [segmentIndex, segment] of document.segments.entries()) {
      const pointer = `/documents/${documentIndex}/segments/${segmentIndex}/text`;
      if (segment.citationPointer !== pointer) {
        throw new AnalysisValidationError(`Source segment citation pointer is not canonical: ${segment.citationPointer}`);
      }
      allowed.set(pointer, segment.text);
    }
  }
  const claimCodes = output.claims.map((claim) => claim.code);
  if (new Set(claimCodes).size !== claimCodes.length) throw new AnalysisValidationError('Duplicate claim code');
  const validateCitations = (citations: readonly string[]): void => {
    if (new Set(citations).size !== citations.length) throw new AnalysisValidationError('Duplicate citation pointer');
    for (const pointer of citations) {
      if (!/^\/documents\/(0|[1-9][0-9]*)\/segments\/(0|[1-9][0-9]*)\/text$/.test(pointer) || !allowed.has(pointer)) {
        throw new AnalysisValidationError(`Citation pointer is not an exact allowlisted segment: ${pointer}`);
      }
      if (resolveJsonPointer(verified.result, pointer) !== allowed.get(pointer)) {
        throw new AnalysisValidationError(`Citation pointer does not resolve to exact segment text: ${pointer}`);
      }
    }
  };
  for (const claim of output.claims) {
    validateCitations(claim.claimCitations);
    validateCitations(claim.supportingCitations);
    validateCitations(claim.contradictingCitations);
    if (claim.assessment === 'supported' && claim.supportingCitations.length === 0) {
      throw new AnalysisValidationError('Supported claim requires supporting citations');
    }
    if (claim.assessment === 'contradicted' && claim.contradictingCitations.length === 0) {
      throw new AnalysisValidationError('Contradicted claim requires contradicting citations');
    }
    if (claim.assessment === 'mixed' && (claim.supportingCitations.length === 0 || claim.contradictingCitations.length === 0)) {
      throw new AnalysisValidationError('Mixed claim requires supporting and contradicting citations');
    }
    if (claim.assessment === 'insufficient_evidence' &&
        (claim.supportingCitations.length > 0 || claim.contradictingCitations.length > 0)) {
      throw new AnalysisValidationError('Insufficient-evidence claim cannot assert supporting or contradicting citations');
    }
  }
  for (const question of output.unansweredQuestions) validateCitations(question.triggerCitations ?? []);
}

function resolveJsonPointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const part of pointer.slice(1).split('/').map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (typeof current !== 'object' || current === null || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function assertVerifiedIdentity(verified: VerifiedResearchEvidenceIndexResult, expectedResultId: string): void {
  if (verified.resultId !== expectedResultId || verified.result.resultId !== expectedResultId) {
    throw new ResearchEvidenceAuditIdentityConflictError('Verified Research Evidence Index identity mismatch');
  }
}

function validateGatewayMetadata(response: AiGatewayResponse): void {
  if (response.providerRequestId !== undefined && (response.providerRequestId.length < 1 || response.providerRequestId.length > 300)) {
    throw new AnalysisValidationError('Invalid provider request ID');
  }
  for (const [name, value] of Object.entries({ inputTokens: response.usage?.inputTokens, outputTokens: response.usage?.outputTokens, latencyMs: response.latencyMs })) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new AnalysisValidationError(`Invalid ${name}`);
  }
}

function assertConfiguration(config: ResearchEvidenceAuditConfiguration): void {
  if (!config.providerId.trim() || config.providerId.length > 120) throw new TypeError('Invalid provider ID');
  if (!config.modelId.trim() || config.modelId.length > 160) throw new TypeError('Invalid model ID');
  if (!config.promptId.trim() || config.promptId.length > 160 || !config.promptText) throw new TypeError('Invalid prompt configuration');
  if (!Number.isSafeInteger(config.promptVersion) || config.promptVersion < 1) throw new TypeError('Invalid prompt version');
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) throw new TypeError('Invalid timeout');
  if (!Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 1) throw new TypeError('Invalid max output tokens');
}

function expectedPath(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}`;
}
function optionalBigInt(value: number | undefined): bigint | null {
  return value === undefined ? null : BigInt(value);
}
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

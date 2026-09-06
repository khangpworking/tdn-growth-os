import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { MarketSnapshotInterpretation } from '../../../contracts/analysis/market-snapshot-interpretation.generated.js';
import type { MarketSnapshotInterpretationRequest } from '../../../contracts/analysis/market-snapshot-interpretation-request.generated.js';
import type { MarketSnapshotInterpretationOutput } from '../../../contracts/analysis/market-snapshot-interpretation-output.generated.js';
import outputSchema from '../../../contracts/analysis/market-snapshot-interpretation-output.schema.json' with { type: 'json' };
import type { AiGateway, AiGatewayResponse } from '../../platform/ai/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/index.js';
import type { MarketSnapshotResultReader } from './result-reader.js';
import {
  AnalysisValidationError,
  validateMarketSnapshotInterpretation,
  validateMarketSnapshotInterpretationOutput,
  validateMarketSnapshotInterpretationRequest,
} from './validation.js';

export interface InterpretationConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly promptText: string;
  readonly outputSchemaVersion: '1.0.0';
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export interface InterpretationExecution {
  readonly interpretationId: string;
  readonly outputArtifactSha256: string;
  readonly deduplicated: boolean;
}

interface ExistingInterpretation {
  readonly interpretationId: string;
  readonly promptSha256: string;
  readonly requestSha256: string;
  readonly outputArtifactSha256: string;
}

interface InterpretationRow {
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

const allowedCitationPointers = new Set([
  '/period/scope',
  '/period/start',
  '/period/end',
  '/period/grain',
  '/totals/periodRevenueVndTotal',
  '/totals/periodUnitsSoldTotal',
  '/coverage/selectedObservationCount',
  '/coverage/uniqueProductCount',
  '/coverage/periodRevenueObservedProductCount',
  '/coverage/periodUnitsSoldObservedProductCount',
  '/ignoredMetricCodes',
]);
const forbiddenDecisionLanguage = /\b(recommend(?:ation|ed|s)?|approv(?:al|e|ed|es)|should|must|action|autonomous)\b|\bgo\s*\/\s*no-go\b|\bno-go\b/i;

export class InterpretationIdentityConflictError extends Error {}

export class MarketSnapshotInterpretationService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #results: MarketSnapshotResultReader;
  readonly #gateway: AiGateway;
  readonly #config: InterpretationConfiguration;
  readonly #promptSha256: string;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly resultReader: MarketSnapshotResultReader;
    readonly gateway: AiGateway;
    readonly configuration: InterpretationConfiguration;
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

  async interpret(untrustedInput: unknown): Promise<InterpretationExecution> {
    const input = validateMarketSnapshotInterpretationRequest(untrustedInput);
    const verified = await this.#results.readVerifiedResult(input.resultId);
    this.#assertPromptIdentity();
    const requestSha256 = this.#requestSha256(input);
    const existing = this.#existing(input.resultId);
    if (existing) {
      if (existing.promptSha256 !== this.#promptSha256 || existing.requestSha256 !== requestSha256) {
        throw new InterpretationIdentityConflictError('Interpretation identity exists with prompt or request drift');
      }
      return {
        interpretationId: existing.interpretationId,
        outputArtifactSha256: existing.outputArtifactSha256,
        deduplicated: true,
      };
    }

    const interpretationId = randomUUID();
    const response = await this.#gateway.execute({
      runId: interpretationId,
      providerId: this.#config.providerId,
      modelId: this.#config.modelId,
      prompt: {
        id: this.#config.promptId,
        version: this.#config.promptVersion,
        text: this.#config.promptText,
        sha256: this.#promptSha256,
      },
      input: {
        resultId: verified.resultId,
        resultArtifactSha256: verified.resultArtifactSha256,
        result: verified.result,
      },
      output: {
        schemaVersion: this.#config.outputSchemaVersion,
        jsonSchema: outputSchema,
      },
      limits: {
        timeoutMs: this.#config.timeoutMs,
        maxOutputTokens: this.#config.maxOutputTokens,
      },
      tools: [],
    });
    const output = validateMarketSnapshotInterpretationOutput(response.output);
    validateOutputSemantics(output, verified.result);
    validateGatewayMetadata(response);

    const completedAt = this.#now().toISOString();
    const envelope = buildEnvelope(
      interpretationId,
      completedAt,
      verified.resultId,
      verified.resultArtifactSha256,
      this.#config,
      this.#promptSha256,
      response,
      output,
    );
    validateMarketSnapshotInterpretation(envelope);
    const bytes = Buffer.from(canonicalJson(envelope), 'utf8');
    const stored = await this.#artifacts.put(bytes);

    const transaction = this.#db.transaction((): InterpretationExecution => {
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
      if (
        artifact.byteSize !== BigInt(stored.byteSize) ||
        artifact.mediaType !== 'application/json' ||
        artifact.relativePath !== stored.relativePath ||
        artifact.contractVersion !== '1.0.0'
      ) throw new InterpretationIdentityConflictError('Interpretation artifact metadata conflict');

      this.#db.prepare(
        `INSERT INTO analysis_interpretations(
           interpretation_id, source_result_id, source_result_artifact_sha256,
           provider_id, model_id, prompt_id, prompt_version, prompt_sha256,
           output_schema_version, request_sha256, output_artifact_sha256, completed_at,
           provider_request_id, input_token_count, output_token_count, latency_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        interpretationId,
        verified.resultId,
        verified.resultArtifactSha256,
        this.#config.providerId,
        this.#config.modelId,
        this.#config.promptId,
        this.#config.promptVersion,
        this.#promptSha256,
        this.#config.outputSchemaVersion,
        requestSha256,
        stored.sha256,
        completedAt,
        response.providerRequestId ?? null,
        response.usage?.inputTokens ?? null,
        response.usage?.outputTokens ?? null,
        response.latencyMs ?? null,
      );
      return { interpretationId, outputArtifactSha256: stored.sha256, deduplicated: false };
    });
    return transaction();
  }

  async replay(interpretationId: string): Promise<MarketSnapshotInterpretation> {
    const row = this.#db.prepare(
      `SELECT i.source_result_id AS sourceResultId,
              i.source_result_artifact_sha256 AS sourceResultArtifactSha256,
              i.provider_id AS providerId, i.model_id AS modelId,
              i.prompt_id AS promptId, i.prompt_version AS promptVersion,
              i.prompt_sha256 AS promptSha256, i.output_schema_version AS outputSchemaVersion,
              i.request_sha256 AS requestSha256, i.output_artifact_sha256 AS outputArtifactSha256,
              i.completed_at AS completedAt, i.provider_request_id AS providerRequestId,
              i.input_token_count AS inputTokenCount, i.output_token_count AS outputTokenCount,
              i.latency_ms AS latencyMs, a.byte_size AS artifactByteSize,
              a.media_type AS artifactMediaType, a.relative_path AS artifactRelativePath,
              a.contract_version AS artifactContractVersion
         FROM analysis_interpretations i
         JOIN artifact_manifests a ON a.sha256 = i.output_artifact_sha256
        WHERE i.interpretation_id = ?`,
    ).get(interpretationId) as InterpretationRow | undefined;
    if (!row) throw new AnalysisValidationError(`Interpretation not found: ${interpretationId}`);
    const bytes = await this.#artifacts.read(row.outputArtifactSha256);
    if (
      row.artifactByteSize !== BigInt(bytes.byteLength) ||
      row.artifactMediaType !== 'application/json' ||
      row.artifactRelativePath !== `sha256/${row.outputArtifactSha256.slice(0, 2)}/${row.outputArtifactSha256}` ||
      row.artifactContractVersion !== '1.0.0'
    ) throw new InterpretationIdentityConflictError('Interpretation artifact manifest metadata mismatch');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new AnalysisValidationError(`Invalid interpretation JSON: ${(error as Error).message}`);
    }
    const envelope = validateMarketSnapshotInterpretation(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(envelope), 'utf8'))) {
      throw new AnalysisValidationError('Interpretation is not canonical JSON');
    }
    const verified = await this.#results.readVerifiedResult(row.sourceResultId);
    validateOutputSemantics(envelope.output, verified.result);
    const expectedRequestSha256 = this.#requestSha256({ contractVersion: '1.0.0', resultId: row.sourceResultId });
    if (
      expectedRequestSha256 !== row.requestSha256 ||
      row.promptSha256 !== this.#promptSha256 ||
      envelope.interpretationId !== interpretationId ||
      envelope.completedAt !== row.completedAt ||
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
      optionalBigInt(envelope.gateway.latencyMs) !== row.latencyMs
    ) throw new InterpretationIdentityConflictError('Interpretation artifact does not match immutable metadata');
    return envelope;
  }

  #assertPromptIdentity(): void {
    const row = this.#db.prepare(
      `SELECT prompt_sha256 AS promptSha256 FROM analysis_interpretations
        WHERE prompt_id = ? AND prompt_version = ? LIMIT 1`,
    ).get(this.#config.promptId, this.#config.promptVersion) as { promptSha256: string } | undefined;
    if (row && row.promptSha256 !== this.#promptSha256) {
      throw new InterpretationIdentityConflictError('Prompt ID and version already exist with different content');
    }
  }

  #existing(resultId: string): ExistingInterpretation | undefined {
    return this.#db.prepare(
      `SELECT interpretation_id AS interpretationId, prompt_sha256 AS promptSha256,
              request_sha256 AS requestSha256, output_artifact_sha256 AS outputArtifactSha256
         FROM analysis_interpretations
        WHERE source_result_id = ? AND provider_id = ? AND model_id = ?
          AND prompt_id = ? AND prompt_version = ? AND output_schema_version = ?`,
    ).get(
      resultId,
      this.#config.providerId,
      this.#config.modelId,
      this.#config.promptId,
      this.#config.promptVersion,
      this.#config.outputSchemaVersion,
    ) as ExistingInterpretation | undefined;
  }

  #requestSha256(input: MarketSnapshotInterpretationRequest): string {
    return sha256(Buffer.from(canonicalJson({
      contractVersion: input.contractVersion,
      resultId: input.resultId,
      providerId: this.#config.providerId,
      modelId: this.#config.modelId,
      promptId: this.#config.promptId,
      promptVersion: this.#config.promptVersion,
      promptSha256: this.#promptSha256,
      outputSchemaVersion: this.#config.outputSchemaVersion,
    }), 'utf8'));
  }
}

function buildEnvelope(
  interpretationId: string,
  completedAt: string,
  resultId: string,
  resultArtifactSha256: string,
  config: InterpretationConfiguration,
  promptSha256: string,
  response: AiGatewayResponse,
  output: MarketSnapshotInterpretationOutput,
): MarketSnapshotInterpretation {
  return {
    contractVersion: '1.0.0', interpretationId, completedAt,
    sourceResult: { resultId, resultArtifactSha256 },
    gateway: {
      providerId: config.providerId,
      modelId: config.modelId,
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

function validateOutputSemantics(output: MarketSnapshotInterpretationOutput, result: unknown): void {
  const texts = [output.summary, ...output.findings.map((finding) => finding.statement), ...output.uncertainties];
  if (texts.some((text) => forbiddenDecisionLanguage.test(text))) {
    throw new AnalysisValidationError('Interpretation cannot recommend, approve, instruct, or define autonomous action');
  }
  for (const finding of output.findings) {
    for (const pointer of finding.citations) {
      if (!isAllowedCitationPointer(pointer)) throw new AnalysisValidationError(`Citation pointer is not allowlisted: ${pointer}`);
      if (!jsonPointerExists(result, pointer)) throw new AnalysisValidationError(`Citation pointer does not exist: ${pointer}`);
    }
  }
}

function isAllowedCitationPointer(pointer: string): boolean {
  return allowedCitationPointers.has(pointer) || /^\/ignoredMetricCodes\/(0|[1-9][0-9]*)$/.test(pointer);
}

function jsonPointerExists(value: unknown, pointer: string): boolean {
  let current = value;
  for (const segment of pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (typeof current !== 'object' || current === null || !(segment in current)) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

function validateGatewayMetadata(response: AiGatewayResponse): void {
  if (response.providerRequestId !== undefined && (response.providerRequestId.length < 1 || response.providerRequestId.length > 300)) {
    throw new AnalysisValidationError('Invalid provider request ID');
  }
  for (const [name, value] of Object.entries({
    inputTokens: response.usage?.inputTokens,
    outputTokens: response.usage?.outputTokens,
    latencyMs: response.latencyMs,
  })) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new AnalysisValidationError(`Invalid ${name}`);
  }
}

function assertConfiguration(config: InterpretationConfiguration): void {
  if (!config.providerId.trim() || config.providerId.length > 120) throw new TypeError('Invalid provider ID');
  if (!config.modelId.trim() || config.modelId.length > 160) throw new TypeError('Invalid model ID');
  if (!config.promptId.trim() || config.promptId.length > 160 || !config.promptText) throw new TypeError('Invalid prompt configuration');
  if (!Number.isSafeInteger(config.promptVersion) || config.promptVersion < 1) throw new TypeError('Invalid prompt version');
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) throw new TypeError('Invalid timeout');
  if (!Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 1) throw new TypeError('Invalid max output tokens');
}

function optionalBigInt(value: number | undefined): bigint | null {
  return value === undefined ? null : BigInt(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

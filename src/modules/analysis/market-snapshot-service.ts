import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { MarketSnapshotRequest } from '../../../contracts/analysis/market-snapshot-request.generated.js';
import type { MarketSnapshotResult } from '../../../contracts/analysis/market-snapshot-result.generated.js';
import type { DataPackManifest } from '../../../contracts/foundation/data-pack-manifest.generated.js';
import type { FinalizedDataPackReader } from '../foundation/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import {
  AnalysisValidationError,
  validateMarketSnapshotRequest,
  validateMarketSnapshotResult,
} from './validation.js';

export interface MarketSnapshotExecution {
  readonly resultId: string;
  readonly resultArtifactSha256: string;
  readonly deduplicated: boolean;
}

interface ExistingResult {
  readonly resultId: string;
  readonly requestSha256: string;
  readonly resultArtifactSha256: string;
}

interface ResultRow {
  readonly dataPackId: string;
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

export class AnalysisIdentityConflictError extends Error {}

export class MarketSnapshotService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #dataPacks: FinalizedDataPackReader;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly dataPackReader: FinalizedDataPackReader;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#dataPacks = options.dataPackReader;
    this.#now = options.now ?? (() => new Date());
  }

  async calculate(untrustedInput: unknown): Promise<MarketSnapshotExecution> {
    const input = validateMarketSnapshotRequest(untrustedInput);
    const requestSha256 = sha256(Buffer.from(canonicalJson(input), 'utf8'));
    const frozen = await this.#dataPacks.readFinalizedDataPack(input.dataPackId);
    const existing = this.#existing(input);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw new AnalysisIdentityConflictError('Analysis Result identity already exists with different input');
      }
      return {
        resultId: existing.resultId,
        resultArtifactSha256: existing.resultArtifactSha256,
        deduplicated: true,
      };
    }

    const supported = frozen.manifest.observations.filter(
      (observation) => observation.metricCode === 'period_revenue_vnd' || observation.metricCode === 'units_sold',
    );
    if (supported.length === 0) {
      throw new AnalysisValidationError('Data Pack contains no supported market_snapshot_v1 metrics');
    }

    const resultId = randomUUID();
    const completedAt = this.#now().toISOString();
    const result = buildResult(input, frozen.dataPackId, frozen.manifestArtifactSha256, frozen.manifest, resultId, completedAt);
    validateMarketSnapshotResult(result);
    const resultBytes = Buffer.from(canonicalJson(result), 'utf8');
    const stored = await this.#artifacts.put(resultBytes);

    const transaction = this.#db.transaction((): MarketSnapshotExecution => {
      this.#db
        .prepare(
          `INSERT INTO artifact_manifests(
             sha256, byte_size, media_type, relative_path, acquired_at,
             contract_version, retention_status, created_at
           ) VALUES (?, ?, 'application/json', ?, ?, ?, 'active', ?)
           ON CONFLICT(sha256) DO NOTHING`,
        )
        .run(stored.sha256, stored.byteSize, stored.relativePath, completedAt, input.contractVersion, completedAt);
      const artifact = this.#db
        .prepare(
          `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath
             FROM artifact_manifests WHERE sha256 = ?`,
        )
        .get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string };
      if (
        artifact.byteSize !== BigInt(stored.byteSize) ||
        artifact.mediaType !== 'application/json' ||
        artifact.relativePath !== stored.relativePath
      ) {
        throw new AnalysisIdentityConflictError('Result artifact manifest metadata conflict');
      }
      this.#db
        .prepare(
          `INSERT INTO analysis_results(
             result_id, data_pack_id, calculation_key, calculation_version,
             request_sha256, result_artifact_sha256, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          resultId,
          input.dataPackId,
          input.calculationKey,
          input.calculationVersion,
          requestSha256,
          stored.sha256,
          completedAt,
        );
      return { resultId, resultArtifactSha256: stored.sha256, deduplicated: false };
    });
    return transaction();
  }

  async replay(resultId: string): Promise<MarketSnapshotResult> {
    const row = this.#db
      .prepare(
        `SELECT r.data_pack_id AS dataPackId, r.calculation_key AS calculationKey,
                r.calculation_version AS calculationVersion, r.request_sha256 AS requestSha256,
                r.result_artifact_sha256 AS resultArtifactSha256, r.completed_at AS completedAt,
                a.byte_size AS artifactByteSize, a.media_type AS artifactMediaType,
                a.relative_path AS artifactRelativePath, a.contract_version AS artifactContractVersion
           FROM analysis_results r
           JOIN artifact_manifests a ON a.sha256 = r.result_artifact_sha256
          WHERE r.result_id = ?`,
      )
      .get(resultId) as ResultRow | undefined;
    if (!row) throw new AnalysisValidationError(`Analysis Result not found: ${resultId}`);
    const bytes = await this.#artifacts.read(row.resultArtifactSha256);
    const expectedRelativePath = `sha256/${row.resultArtifactSha256.slice(0, 2)}/${row.resultArtifactSha256}`;
    if (
      row.artifactByteSize !== BigInt(bytes.byteLength) ||
      row.artifactMediaType !== 'application/json' ||
      row.artifactRelativePath !== expectedRelativePath ||
      row.artifactContractVersion !== '1.0.0'
    ) {
      throw new AnalysisIdentityConflictError('Result artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new AnalysisValidationError(`Invalid Result JSON: ${(error as Error).message}`);
    }
    const result = validateMarketSnapshotResult(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(result), 'utf8'))) {
      throw new AnalysisValidationError('Analysis Result is not canonical JSON');
    }
    const frozen = await this.#dataPacks.readFinalizedDataPack(row.dataPackId);
    const canonicalRequest = canonicalJson({
      contractVersion: '1.0.0',
      dataPackId: row.dataPackId,
      calculationKey: row.calculationKey,
      calculationVersion: Number(row.calculationVersion),
    });
    if (
      sha256(Buffer.from(canonicalRequest, 'utf8')) !== row.requestSha256 ||
      result.resultId !== resultId ||
      result.dataPack.dataPackId !== row.dataPackId ||
      result.dataPack.packKey !== frozen.manifest.packKey ||
      BigInt(result.dataPack.version) !== BigInt(frozen.manifest.version) ||
      result.dataPack.manifestArtifactSha256 !== frozen.manifestArtifactSha256 ||
      canonicalJson(result.period) !== canonicalJson(frozen.manifest.period) ||
      result.calculationKey !== row.calculationKey ||
      BigInt(result.calculationVersion) !== row.calculationVersion ||
      result.completedAt !== row.completedAt
    ) {
      throw new AnalysisIdentityConflictError('Result artifact does not match immutable database metadata');
    }
    return result;
  }

  #existing(input: MarketSnapshotRequest): ExistingResult | undefined {
    return this.#db
      .prepare(
        `SELECT result_id AS resultId, request_sha256 AS requestSha256,
                result_artifact_sha256 AS resultArtifactSha256
           FROM analysis_results
          WHERE data_pack_id = ? AND calculation_key = ? AND calculation_version = ?`,
      )
      .get(input.dataPackId, input.calculationKey, input.calculationVersion) as ExistingResult | undefined;
  }
}

function buildResult(
  input: MarketSnapshotRequest,
  dataPackId: string,
  manifestArtifactSha256: string,
  manifest: DataPackManifest,
  resultId: string,
  completedAt: string,
): MarketSnapshotResult {
  let revenueTotal = 0n;
  let unitsTotal = 0n;
  let revenuePresent = false;
  let unitsPresent = false;
  const products = new Set<string>();
  const revenueProducts = new Set<string>();
  const unitsProducts = new Set<string>();
  const ignored = new Set<string>();

  for (const observation of manifest.observations) {
    const productKey = `${observation.platform}\u0000${observation.platformProductId}`;
    products.add(productKey);
    if (observation.metricCode === 'period_revenue_vnd') {
      revenuePresent = true;
      revenueTotal += BigInt(observation.integerValue);
      revenueProducts.add(productKey);
    } else if (observation.metricCode === 'units_sold') {
      unitsPresent = true;
      unitsTotal += BigInt(observation.integerValue);
      unitsProducts.add(productKey);
    } else {
      ignored.add(observation.metricCode);
    }
  }

  return {
    contractVersion: '1.0.0',
    resultId,
    calculationKey: input.calculationKey,
    calculationVersion: input.calculationVersion,
    completedAt,
    dataPack: {
      dataPackId,
      packKey: manifest.packKey,
      version: manifest.version,
      manifestArtifactSha256,
    },
    period: manifest.period,
    coverage: {
      selectedObservationCount: manifest.observations.length,
      uniqueProductCount: products.size,
      periodRevenueObservedProductCount: revenueProducts.size,
      periodUnitsSoldObservedProductCount: unitsProducts.size,
    },
    totals: {
      periodRevenueVndTotal: revenuePresent ? revenueTotal.toString() : null,
      periodUnitsSoldTotal: unitsPresent ? unitsTotal.toString() : null,
    },
    ignoredMetricCodes: [...ignored].sort(),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

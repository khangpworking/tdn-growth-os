import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ManualObservationInput } from '../../../contracts/foundation/manual-observation.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from './canonical-json.js';
import { validateManualObservationInput } from './validation.js';

type MetricCode =
  | 'period_revenue_vnd'
  | 'lifetime_revenue_vnd'
  | 'units_sold'
  | 'revenue_growth_percent'
  | 'trends_interest_index';

interface MetricValue {
  readonly code: MetricCode;
  readonly value: number;
  readonly unit: 'VND' | 'count' | 'percent' | 'relative_interest_index_0_100';
  readonly scale: number | null;
  readonly identityKey: string;
}

export interface FoundationLineage {
  readonly observationId: bigint;
  readonly observationIdentityKey: string;
  readonly metricCode: MetricCode;
  readonly integerValue: bigint;
  readonly unit: string;
  readonly scale: bigint | null;
  readonly productId: bigint;
  readonly platform: string;
  readonly platformProductId: string;
  readonly productName: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodGrain: string;
  readonly sourceId: string;
  readonly sourceType: string;
  readonly ingestionId: string;
  readonly idempotencyKey: string;
  readonly acquiredAt: string;
  readonly evidenceId: string;
  readonly evidenceGrade: string;
  readonly evidenceGradeBasis: string;
  readonly artifactSha256: string;
  readonly artifactByteSize: bigint;
  readonly artifactMediaType: string;
  readonly artifactRelativePath: string;
}

export interface ImportResult {
  readonly ingestionId: string;
  readonly observationIds: readonly bigint[];
  readonly artifactSha256: string;
  readonly deduplicated: boolean;
}

export class FoundationIdentityConflictError extends Error {}

export class FoundationService {
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

  async importManualObservation(untrustedInput: unknown): Promise<ImportResult> {
    const input = validateManualObservationInput(untrustedInput);
    const requestSha256 = sha256(canonicalJson(input));
    const metrics = metricsFrom(input);

    const existingIngestion = this.#db
      .prepare(
        `SELECT ingestion_id AS ingestionId, request_sha256 AS requestSha256, artifact_sha256 AS artifactSha256
           FROM foundation_ingestion_runs
          WHERE source_id = ? AND idempotency_key = ?`,
      )
      .get(input.source.sourceId, input.ingestion.idempotencyKey) as
      | { ingestionId: string; requestSha256: string; artifactSha256: string | null }
      | undefined;

    if (existingIngestion) {
      if (existingIngestion.requestSha256 !== requestSha256 || !existingIngestion.artifactSha256) {
        throw new FoundationIdentityConflictError('Ingestion idempotency key was already used for different input');
      }
      const observationIds = this.#observationIdsForIngestion(existingIngestion.ingestionId);
      return {
        ingestionId: existingIngestion.ingestionId,
        observationIds,
        artifactSha256: existingIngestion.artifactSha256,
        deduplicated: true,
      };
    }

    metrics.forEach((metric) => {
      const existing = this.#existingMetric(metric.identityKey);
      if (existing) assertSameMetric(metric, existing);
    });

    const rawBytes = Buffer.from(canonicalJson(input.rawPayload), 'utf8');
    const stored = await this.#artifacts.put(rawBytes);
    const now = this.#now().toISOString();
    const ingestionId = randomUUID();
    const evidenceId = randomUUID();

    const transaction = this.#db.transaction((): ImportResult => {
      this.#db
        .prepare(
          `INSERT INTO foundation_sources(source_id, source_type, display_name, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(source_id) DO NOTHING`,
        )
        .run(input.source.sourceId, input.source.sourceType, input.source.displayName, now);

      const source = this.#db
        .prepare('SELECT source_type AS sourceType, display_name AS displayName FROM foundation_sources WHERE source_id = ?')
        .get(input.source.sourceId) as { sourceType: string; displayName: string };
      if (source.sourceType !== input.source.sourceType || source.displayName !== input.source.displayName) {
        throw new FoundationIdentityConflictError('Source identity already exists with different metadata');
      }

      this.#db
        .prepare(
          `INSERT INTO foundation_ingestion_runs(
             ingestion_id, source_id, idempotency_key, status, acquired_at, started_at,
             completed_at, artifact_sha256, request_sha256, contract_version
           ) VALUES (?, ?, ?, 'processing', ?, ?, NULL, NULL, ?, ?)`,
        )
        .run(
          ingestionId,
          input.source.sourceId,
          input.ingestion.idempotencyKey,
          input.ingestion.acquiredAt,
          now,
          requestSha256,
          input.contractVersion,
        );

      this.#db
        .prepare(
          `INSERT INTO artifact_manifests(
             sha256, byte_size, media_type, relative_path, acquired_at,
             contract_version, retention_status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
           ON CONFLICT(sha256) DO NOTHING`,
        )
        .run(
          stored.sha256,
          stored.byteSize,
          input.ingestion.mediaType,
          stored.relativePath,
          input.ingestion.acquiredAt,
          input.contractVersion,
          now,
        );

      const manifest = this.#db
        .prepare('SELECT byte_size AS byteSize, relative_path AS relativePath FROM artifact_manifests WHERE sha256 = ?')
        .get(stored.sha256) as { byteSize: bigint; relativePath: string };
      if (manifest.byteSize !== BigInt(stored.byteSize) || manifest.relativePath !== stored.relativePath) {
        throw new FoundationIdentityConflictError('Artifact digest already exists with inconsistent manifest metadata');
      }

      this.#db
        .prepare(
          `INSERT INTO foundation_evidence(
             evidence_id, ingestion_id, artifact_sha256, evidence_grade, evidence_grade_basis, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidenceId,
          ingestionId,
          stored.sha256,
          input.ingestion.evidenceGrade.grade,
          input.ingestion.evidenceGrade.basis,
          now,
        );

      const product = this.#db
        .prepare(
          `INSERT INTO foundation_products(
             platform, platform_product_id, product_name, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(platform, platform_product_id) DO UPDATE SET
             product_name = excluded.product_name,
             updated_at = excluded.updated_at
           RETURNING product_id AS productId`,
        )
        .get(input.product.platform, input.product.platformProductId, input.product.productName, now, now) as {
        productId: bigint;
      };

      const observationIds = metrics.map((metric) => {
        const existing = this.#existingMetric(metric.identityKey);
        if (existing) assertSameMetric(metric, existing);
        const observation = existing ??
          (this.#db
            .prepare(
              `INSERT INTO foundation_observations(
                 identity_key, product_id, metric_code, integer_value, unit, scale, scope,
                 period_start, period_end, period_grain, observed_at, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING observation_id AS observationId`,
            )
            .get(
              metric.identityKey,
              product.productId,
              metric.code,
              metric.value,
              metric.unit,
              metric.scale,
              input.observation.scope,
              input.observation.period.start,
              input.observation.period.end,
              input.observation.period.grain,
              input.observation.observedAt,
              now,
            ) as ExistingMetric);
        this.#db
          .prepare('INSERT INTO foundation_observation_evidence(observation_id, evidence_id) VALUES (?, ?)')
          .run(observation.observationId, evidenceId);
        return observation.observationId;
      });

      this.#db
        .prepare(
          `UPDATE foundation_ingestion_runs
              SET status = 'completed', completed_at = ?, artifact_sha256 = ?
            WHERE ingestion_id = ?`,
        )
        .run(now, stored.sha256, ingestionId);

      return { ingestionId, observationIds, artifactSha256: stored.sha256, deduplicated: false };
    });

    return transaction();
  }

  getLineage(observationId: bigint | number): FoundationLineage {
    const row = this.getLineageRecords(observationId)[0];
    if (!row) throw new Error(`Observation not found: ${observationId}`);
    return row;
  }

  getLineageRecords(observationId: bigint | number): readonly FoundationLineage[] {
    const rows = this.#db
      .prepare(
        `SELECT
           o.observation_id AS observationId,
           o.identity_key AS observationIdentityKey,
           o.metric_code AS metricCode,
           o.integer_value AS integerValue,
           o.unit,
           o.scale,
           p.product_id AS productId,
           p.platform,
           p.platform_product_id AS platformProductId,
           p.product_name AS productName,
           o.period_start AS periodStart,
           o.period_end AS periodEnd,
           o.period_grain AS periodGrain,
           s.source_id AS sourceId,
           s.source_type AS sourceType,
           i.ingestion_id AS ingestionId,
           i.idempotency_key AS idempotencyKey,
           i.acquired_at AS acquiredAt,
           e.evidence_id AS evidenceId,
           e.evidence_grade AS evidenceGrade,
           e.evidence_grade_basis AS evidenceGradeBasis,
           a.sha256 AS artifactSha256,
           a.byte_size AS artifactByteSize,
           a.media_type AS artifactMediaType,
           a.relative_path AS artifactRelativePath
         FROM foundation_observations o
         JOIN foundation_products p ON p.product_id = o.product_id
         JOIN foundation_observation_evidence oe ON oe.observation_id = o.observation_id
         JOIN foundation_evidence e ON e.evidence_id = oe.evidence_id
         JOIN foundation_ingestion_runs i ON i.ingestion_id = e.ingestion_id
         JOIN foundation_sources s ON s.source_id = i.source_id
         JOIN artifact_manifests a ON a.sha256 = e.artifact_sha256
         WHERE o.observation_id = ?
         ORDER BY i.started_at, e.evidence_id`,
      )
      .all(observationId) as FoundationLineage[];
    return rows;
  }

  #observationIdsForIngestion(ingestionId: string): readonly bigint[] {
    const rows = this.#db
      .prepare(
        `SELECT oe.observation_id AS observationId
           FROM foundation_evidence e
           JOIN foundation_observation_evidence oe ON oe.evidence_id = e.evidence_id
          WHERE e.ingestion_id = ?
          ORDER BY oe.observation_id`,
      )
      .all(ingestionId) as Array<{ observationId: bigint }>;
    if (rows.length === 0) throw new Error(`Completed ingestion has no observations: ${ingestionId}`);
    return rows.map((row) => row.observationId);
  }

  #existingMetric(identityKey: string): ExistingMetric | undefined {
    return this.#db
      .prepare(
        `SELECT observation_id AS observationId, integer_value AS integerValue, unit, scale
           FROM foundation_observations WHERE identity_key = ?`,
      )
      .get(identityKey) as ExistingMetric | undefined;
  }
}

interface ExistingMetric {
  readonly observationId: bigint;
  readonly integerValue: bigint;
  readonly unit: string;
  readonly scale: bigint | null;
}

function metricsFrom(input: ManualObservationInput): readonly MetricValue[] {
  const values: Array<Omit<MetricValue, 'identityKey'>> = [];
  if (input.observation.periodRevenueVnd !== undefined) {
    values.push({ code: 'period_revenue_vnd', value: input.observation.periodRevenueVnd, unit: 'VND', scale: null });
  }
  if (input.observation.lifetimeRevenueVnd !== undefined) {
    values.push({ code: 'lifetime_revenue_vnd', value: input.observation.lifetimeRevenueVnd, unit: 'VND', scale: null });
  }
  if (input.observation.unitsSold !== undefined) {
    values.push({ code: 'units_sold', value: input.observation.unitsSold, unit: 'count', scale: null });
  }
  if (input.observation.revenueGrowth !== undefined) {
    values.push({
      code: 'revenue_growth_percent',
      value: input.observation.revenueGrowth.value,
      unit: input.observation.revenueGrowth.unit,
      scale: input.observation.revenueGrowth.scale,
    });
  }
  if (input.observation.trendsInterestIndex !== undefined) {
    values.push({
      code: 'trends_interest_index',
      value: input.observation.trendsInterestIndex.value,
      unit: input.observation.trendsInterestIndex.unit,
      scale: null,
    });
  }
  return values.map((metric) => ({
    ...metric,
    identityKey: sha256(
      canonicalJson({
        platform: input.product.platform,
        platformProductId: input.product.platformProductId,
        scope: input.observation.scope,
        period: input.observation.period,
        metricCode: metric.code,
      }),
    ),
  }));
}

function assertSameMetric(expected: MetricValue, actual: ExistingMetric): void {
  if (
    BigInt(expected.value) !== actual.integerValue ||
    expected.unit !== actual.unit ||
    (expected.scale === null ? actual.scale !== null : BigInt(expected.scale) !== actual.scale)
  ) {
    throw new FoundationIdentityConflictError(`Observation identity conflict for metric ${expected.code}`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

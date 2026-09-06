import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DataPackManifest } from '../../../contracts/foundation/data-pack-manifest.generated.js';
import type { DataPackRequest } from '../../../contracts/foundation/data-pack-request.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from './canonical-json.js';
import { FoundationIdentityConflictError } from './foundation-service.js';
import { FoundationValidationError, validateDataPackManifest, validateDataPackRequest } from './validation.js';

export interface DataPackResult {
  readonly packId: string;
  readonly manifestArtifactSha256: string;
  readonly observationIds: readonly bigint[];
  readonly deduplicated: boolean;
}

interface SnapshotRow {
  readonly observationId: bigint;
  readonly identityKey: string;
  readonly platform: string;
  readonly platformProductId: string;
  readonly productName: string;
  readonly metricCode: string;
  readonly integerValue: bigint;
  readonly unit: string;
  readonly scale: bigint | null;
  readonly scope: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodGrain: string;
  readonly evidenceId: string;
  readonly evidenceGrade: string;
  readonly evidenceGradeBasis: string;
  readonly sourceId: string;
  readonly ingestionId: string;
  readonly rawArtifactSha256: string;
}

interface ExistingPack {
  readonly packId: string;
  readonly requestSha256: string;
  readonly manifestArtifactSha256: string;
  readonly finalizedAt: string | null;
}

const sqliteIntegerMax = 9223372036854775807n;

export class DataPackService {
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

  async finalize(untrustedInput: unknown): Promise<DataPackResult> {
    const input = validateDataPackRequest(untrustedInput);
    const observationIds = input.observationIds.map(parseObservationId).sort(compareBigint);
    const semanticRequest = {
      contractVersion: input.contractVersion,
      observationIds: observationIds.map(String),
      packKey: input.packKey,
      purpose: input.purpose,
      ...(input.supersedesPackId === undefined ? {} : { supersedesPackId: input.supersedesPackId }),
      version: input.version,
    };
    const requestSha256 = sha256(Buffer.from(canonicalJson(semanticRequest), 'utf8'));
    const existing = this.#existingPack(input.packKey, input.version);
    if (existing) {
      if (existing.requestSha256 !== requestSha256 || existing.finalizedAt === null) {
        throw new FoundationIdentityConflictError('Data Pack key and version already exist with different input');
      }
      return {
        packId: existing.packId,
        manifestArtifactSha256: existing.manifestArtifactSha256,
        observationIds: this.#packObservationIds(existing.packId),
        deduplicated: true,
      };
    }

    this.#validateSupersession(input);
    const rows = this.#loadSnapshotRows(observationIds);
    const foundIds = new Set(rows.map((row) => row.observationId.toString()));
    const missingIds = observationIds.filter((id) => !foundIds.has(id.toString()));
    if (missingIds.length > 0) {
      throw new FoundationValidationError(`observations not found: ${missingIds.join(', ')}`);
    }
    const first = rows[0];
    if (!first) throw new FoundationValidationError('Data Pack requires at least one observation');
    for (const row of rows) {
      if (
        row.scope !== first.scope ||
        row.periodStart !== first.periodStart ||
        row.periodEnd !== first.periodEnd ||
        row.periodGrain !== first.periodGrain
      ) {
        throw new FoundationValidationError('Data Pack observations must share exact scope and period');
      }
    }

    const finalizedAt = this.#now().toISOString();
    const manifest = buildManifest(input, rows, finalizedAt);
    validateDataPackManifest(manifest);
    const manifestBytes = Buffer.from(canonicalJson(manifest), 'utf8');
    const stored = await this.#artifacts.put(manifestBytes);
    const packId = randomUUID();

    const transaction = this.#db.transaction((): DataPackResult => {
      this.#db
        .prepare(
          `INSERT INTO artifact_manifests(
             sha256, byte_size, media_type, relative_path, acquired_at,
             contract_version, retention_status, created_at
           ) VALUES (?, ?, 'application/json', ?, ?, ?, 'active', ?)
           ON CONFLICT(sha256) DO NOTHING`,
        )
        .run(stored.sha256, stored.byteSize, stored.relativePath, finalizedAt, input.contractVersion, finalizedAt);
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
        throw new FoundationIdentityConflictError('Data Pack artifact manifest metadata conflict');
      }

      this.#db
        .prepare(
          `INSERT INTO foundation_data_packs(
             pack_id, pack_key, version, purpose, request_sha256,
             manifest_artifact_sha256, supersedes_pack_id, finalized_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          packId,
          input.packKey,
          input.version,
          input.purpose,
          requestSha256,
          stored.sha256,
          input.supersedesPackId ?? null,
        );
      const insertItem = this.#db.prepare(
        'INSERT INTO foundation_data_pack_items(pack_id, observation_id) VALUES (?, ?)',
      );
      for (const observationId of observationIds) insertItem.run(packId, observationId);
      this.#db.prepare('UPDATE foundation_data_packs SET finalized_at = ? WHERE pack_id = ?').run(finalizedAt, packId);
      return { packId, manifestArtifactSha256: stored.sha256, observationIds, deduplicated: false };
    });
    return transaction();
  }

  async replay(packId: string): Promise<DataPackManifest> {
    const pack = this.#db
      .prepare(
        `SELECT pack_key AS packKey, version, purpose,
                manifest_artifact_sha256 AS manifestArtifactSha256,
                supersedes_pack_id AS supersedesPackId, finalized_at AS finalizedAt
           FROM foundation_data_packs WHERE pack_id = ? AND finalized_at IS NOT NULL`,
      )
      .get(packId) as
      | {
          packKey: string;
          version: bigint;
          purpose: string;
          manifestArtifactSha256: string;
          supersedesPackId: string | null;
          finalizedAt: string;
        }
      | undefined;
    if (!pack) throw new FoundationValidationError(`Finalized Data Pack not found: ${packId}`);

    const bytes = await this.#artifacts.read(pack.manifestArtifactSha256);
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new FoundationValidationError(`Invalid Data Pack manifest JSON: ${(error as Error).message}`);
    }
    const manifest = validateDataPackManifest(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(manifest), 'utf8'))) {
      throw new FoundationValidationError('Data Pack manifest is not canonical JSON');
    }
    if (
      manifest.packKey !== pack.packKey ||
      BigInt(manifest.version) !== pack.version ||
      manifest.purpose !== pack.purpose ||
      manifest.finalizedAt !== pack.finalizedAt ||
      (manifest.supersedesPackId ?? null) !== pack.supersedesPackId
    ) {
      throw new FoundationIdentityConflictError('Data Pack manifest does not match finalized pack metadata');
    }
    return manifest;
  }

  #existingPack(packKey: string, version: number): ExistingPack | undefined {
    return this.#db
      .prepare(
        `SELECT pack_id AS packId, request_sha256 AS requestSha256,
                manifest_artifact_sha256 AS manifestArtifactSha256, finalized_at AS finalizedAt
           FROM foundation_data_packs WHERE pack_key = ? AND version = ?`,
      )
      .get(packKey, version) as ExistingPack | undefined;
  }

  #packObservationIds(packId: string): readonly bigint[] {
    return (
      this.#db
        .prepare(
          `SELECT observation_id AS observationId FROM foundation_data_pack_items
            WHERE pack_id = ? ORDER BY observation_id`,
        )
        .all(packId) as Array<{ observationId: bigint }>
    ).map((row) => row.observationId);
  }

  #validateSupersession(input: DataPackRequest): void {
    if (input.supersedesPackId === undefined) return;
    const superseded = this.#db
      .prepare(
        `SELECT pack_key AS packKey, version, finalized_at AS finalizedAt
           FROM foundation_data_packs WHERE pack_id = ?`,
      )
      .get(input.supersedesPackId) as { packKey: string; version: bigint; finalizedAt: string | null } | undefined;
    if (!superseded || superseded.finalizedAt === null) {
      throw new FoundationValidationError('Superseded Data Pack must exist and be finalized');
    }
    if (superseded.packKey !== input.packKey || superseded.version >= BigInt(input.version)) {
      throw new FoundationValidationError('Superseded Data Pack must have the same pack key and a lower version');
    }
  }

  #loadSnapshotRows(observationIds: readonly bigint[]): readonly SnapshotRow[] {
    const rows: SnapshotRow[] = [];
    const chunkSize = 500;
    for (let offset = 0; offset < observationIds.length; offset += chunkSize) {
      const chunk = observationIds.slice(offset, offset + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      rows.push(
        ...(this.#db
          .prepare(
            `SELECT o.observation_id AS observationId, o.identity_key AS identityKey,
                    p.platform, p.platform_product_id AS platformProductId, p.product_name AS productName,
                    o.metric_code AS metricCode, o.integer_value AS integerValue, o.unit, o.scale,
                    o.scope, o.period_start AS periodStart, o.period_end AS periodEnd, o.period_grain AS periodGrain,
                    e.evidence_id AS evidenceId, e.evidence_grade AS evidenceGrade,
                    e.evidence_grade_basis AS evidenceGradeBasis, s.source_id AS sourceId,
                    i.ingestion_id AS ingestionId, e.artifact_sha256 AS rawArtifactSha256
               FROM foundation_observations o
               JOIN foundation_products p ON p.product_id = o.product_id
               JOIN foundation_observation_evidence oe ON oe.observation_id = o.observation_id
               JOIN foundation_evidence e ON e.evidence_id = oe.evidence_id
               JOIN foundation_ingestion_runs i ON i.ingestion_id = e.ingestion_id
               JOIN foundation_sources s ON s.source_id = i.source_id
              WHERE o.observation_id IN (${placeholders})`,
          )
          .all(...chunk) as SnapshotRow[]),
      );
    }
    return rows.sort(
      (left, right) => compareBigint(left.observationId, right.observationId) || left.evidenceId.localeCompare(right.evidenceId),
    );
  }
}

function buildManifest(input: DataPackRequest, rows: readonly SnapshotRow[], finalizedAt: string): DataPackManifest {
  const observations = new Map<string, DataPackManifest['observations'][number]>();
  for (const row of rows) {
    const key = row.observationId.toString();
    let observation = observations.get(key);
    if (!observation) {
      observation = {
        observationId: key,
        identityKey: row.identityKey,
        platform: row.platform,
        platformProductId: row.platformProductId,
        productName: row.productName,
        metricCode: row.metricCode,
        integerValue: row.integerValue.toString(),
        unit: row.unit,
        scale: row.scale?.toString() ?? null,
        evidence: [] as unknown as DataPackManifest['observations'][number]['evidence'],
      };
      observations.set(key, observation);
    }
    observation.evidence.push({
      evidenceId: row.evidenceId,
      grade: row.evidenceGrade,
      basis: row.evidenceGradeBasis,
      sourceId: row.sourceId,
      ingestionId: row.ingestionId,
      rawArtifactSha256: row.rawArtifactSha256,
    });
  }
  const first = rows[0]!;
  return {
    contractVersion: '1.0.0',
    packKey: input.packKey,
    version: input.version,
    purpose: input.purpose,
    finalizedAt,
    ...(input.supersedesPackId === undefined ? {} : { supersedesPackId: input.supersedesPackId }),
    period: { scope: first.scope, start: first.periodStart, end: first.periodEnd, grain: first.periodGrain },
    observations: [...observations.values()] as DataPackManifest['observations'],
  };
}

function parseObservationId(value: string): bigint {
  const parsed = BigInt(value);
  if (parsed > sqliteIntegerMax) throw new FoundationValidationError(`Observation ID exceeds SQLite INTEGER: ${value}`);
  return parsed;
}

function compareBigint(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

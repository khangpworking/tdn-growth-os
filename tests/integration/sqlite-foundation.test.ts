import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import {
  canonicalJson,
  FoundationIdentityConflictError,
  FoundationService,
  FoundationValidationError,
} from '../../src/modules/foundation/index.js';

const fixturePath = path.resolve('tests/fixtures/manual-observation.synthetic.json');
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function fixture(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;
}

function setup(): {
  root: string;
  db: Database.Database;
  artifacts: ContentAddressedArtifactStore;
  service: FoundationService;
  migrationApplied: readonly number[];
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-foundation-'));
  roots.push(root);
  const opened = openDatabase({
    databasePath: path.join(root, 'runtime', 'foundation.sqlite'),
    now: () => new Date('2026-09-05T10:00:00.000Z'),
  });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  return {
    root,
    db: opened.db,
    artifacts,
    service: new FoundationService({
      db: opened.db,
      artifactStore: artifacts,
      now: () => new Date('2026-09-05T10:00:00.000Z'),
    }),
    migrationApplied: opened.migration.applied,
  };
}

test('opens a fresh WAL database and a second migration run is idempotent', () => {
  const first = setup();
  assert.deepEqual(first.migrationApplied, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47]);
  assert.equal(first.db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(first.db.pragma('foreign_keys', { simple: true }), 1n);
  assert.equal(first.db.pragma('busy_timeout', { simple: true }), 5000n);
  assert.equal(first.db.pragma('user_version', { simple: true }), 47n);
  const databasePath = first.db.name;
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(databasePath).mode & 0o777, 0o600);
  }
  first.db.close();

  const second = openDatabase({ databasePath });
  assert.deepEqual(second.migration.applied, []);
  assert.equal(second.migration.currentVersion, 47);
  assert.deepEqual(second.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [
    { version: 1n },
    { version: 2n },
    { version: 3n },
    { version: 4n },
    { version: 5n },
    { version: 6n },
    { version: 7n },
    { version: 8n },
    { version: 9n },
    { version: 10n },
    { version: 11n },
    { version: 12n },
    { version: 13n },
    { version: 14n },
    { version: 15n },
    { version: 16n },
    { version: 17n },
    { version: 18n },
    { version: 19n },
    { version: 20n },
    { version: 21n },
    { version: 22n },
    { version: 23n },
    { version: 24n },
    { version: 25n },
    { version: 26n },
    { version: 27n },
    { version: 28n },
    { version: 29n },
    { version: 30n },
    { version: 31n },
    { version: 32n },
    { version: 33n },
    { version: 34n },
    { version: 35n },
    { version: 36n },
    { version: 37n },
    { version: 38n },
    { version: 39n },
    { version: 40n },
    { version: 41n },
    { version: 42n },
    { version: 43n },
    { version: 44n },
    { version: 45n },
    { version: 46n },
    { version: 47n },
  ]);
  second.db.close();
});

test('migration 0038 upgrades a version-37 database once and reruns idempotently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-foundation-0038-'));
  roots.push(root);
  const priorDirectory = path.join(root, 'migrations-v37');
  const version38Directory = path.join(root, 'migrations-v38');
  fs.mkdirSync(priorDirectory);
  fs.mkdirSync(version38Directory);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 38).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(version38Directory, name));
  for (const name of fs.readdirSync('migrations').filter((candidate) => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 37).sort()) {
    fs.copyFileSync(path.join('migrations', name), path.join(priorDirectory, name));
  }
  const databasePath = path.join(root, 'runtime', 'foundation.sqlite');
  const version37 = openDatabase({ databasePath, migrationsDirectory: priorDirectory });
  assert.equal(version37.migration.currentVersion, 37);
  assert.equal(version37.db.pragma('user_version', { simple: true }), 37n);
  version37.db.close();

  const upgraded = openDatabase({ databasePath, migrationsDirectory: version38Directory });
  assert.deepEqual(upgraded.migration.applied, [38]);
  assert.equal(upgraded.migration.currentVersion, 38);
  assert.equal(upgraded.db.pragma('user_version', { simple: true }), 38n);
  assert.ok(upgraded.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='analysis_research_automation_runs'").get());
  upgraded.db.close();

  const rerun = openDatabase({ databasePath, migrationsDirectory: version38Directory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 38);
  rerun.db.close();
});

test('migrations 0039 through 0045 upgrade their exact prior versions without changing existing evidence and rerun with zero migrations', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-foundation-0039-'));
  roots.push(root);
  const priorDirectory = path.join(root, 'migrations-v38');
  const nextDirectory = path.join(root, 'migrations-v39');
  fs.mkdirSync(priorDirectory);
  fs.mkdirSync(nextDirectory);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 38).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(priorDirectory, name));
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 39).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(nextDirectory, name));
  const databasePath = path.join(root, 'foundation.sqlite');
  const prior = openDatabase({ databasePath, migrationsDirectory: priorDirectory });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const service = new FoundationService({ db: prior.db, artifactStore: artifacts });
  const receipt = await service.importManualObservation(fixture());
  const lineage = service.getLineageRecords(receipt.observationIds[0]!);
  const migrationLedger = prior.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  prior.db.close();
  const upgraded = openDatabase({ databasePath, migrationsDirectory: nextDirectory });
  assert.deepEqual(upgraded.migration.applied, [39]);
  assert.equal(upgraded.migration.currentVersion, 39);
  assert.deepEqual(upgraded.db.prepare('SELECT * FROM schema_migrations WHERE version<=38 ORDER BY version').all(), migrationLedger);
  assert.deepEqual(new FoundationService({ db: upgraded.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  assert.deepEqual(upgraded.db.prepare('SELECT * FROM foundation_source_attachment_origins').all(), []);
  upgraded.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: nextDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.db.pragma('user_version', { simple: true }), 39n);
  const ledger39 = rerun.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  rerun.db.close();
  const directory40 = path.join(root, 'migrations-v40');
  fs.mkdirSync(directory40);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 40).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(directory40, name));
  const upgraded40 = openDatabase({ databasePath, migrationsDirectory: directory40 });
  assert.deepEqual(upgraded40.migration.applied, [40]);
  assert.equal(upgraded40.db.pragma('user_version', { simple: true }), 40n);
  assert.deepEqual(upgraded40.db.prepare('SELECT * FROM schema_migrations WHERE version<=39 ORDER BY version').all(), ledger39);
  assert.deepEqual(new FoundationService({ db: upgraded40.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  assert.deepEqual(upgraded40.db.prepare('SELECT * FROM analysis_research_automation_source_sets').all(), []);
  upgraded40.db.close();
  const repeat40 = openDatabase({ databasePath, migrationsDirectory: directory40 });
  assert.deepEqual(repeat40.migration.applied, []);
  assert.equal(repeat40.db.pragma('user_version', { simple: true }), 40n);
  const ledger40 = repeat40.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  repeat40.db.close();
  const directory41 = path.join(root, 'migrations-v41');
  fs.mkdirSync(directory41);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 41).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(directory41, name));
  const upgraded41 = openDatabase({ databasePath, migrationsDirectory: directory41 });
  assert.deepEqual(upgraded41.migration.applied, [41]);
  assert.equal(upgraded41.db.pragma('user_version', { simple: true }), 41n);
  assert.deepEqual(upgraded41.db.prepare('SELECT * FROM schema_migrations WHERE version<=40 ORDER BY version').all(), ledger40);
  assert.deepEqual(new FoundationService({ db: upgraded41.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  assert.deepEqual(upgraded41.db.prepare('SELECT * FROM analysis_research_automation_attempts').all(), []);
  upgraded41.db.close();
  const repeat41 = openDatabase({ databasePath, migrationsDirectory: directory41 });
  assert.deepEqual(repeat41.migration.applied, []);
  assert.equal(repeat41.db.pragma('user_version', { simple: true }), 41n);
  const ledger41 = repeat41.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  repeat41.db.close();
  const directory42 = path.join(root, 'migrations-v42');
  fs.mkdirSync(directory42);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 42).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(directory42, name));
  const upgraded42 = openDatabase({ databasePath, migrationsDirectory: directory42 });
  assert.deepEqual(upgraded42.migration.applied, [42]);
  assert.equal(upgraded42.db.pragma('user_version', { simple: true }), 42n);
  assert.deepEqual(upgraded42.db.prepare('SELECT * FROM schema_migrations WHERE version<=41 ORDER BY version').all(), ledger41);
  assert.deepEqual(new FoundationService({ db: upgraded42.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  assert.deepEqual(upgraded42.db.prepare('SELECT * FROM analysis_research_automation_ai_executions').all(), []);
  upgraded42.db.close();
  const repeat42 = openDatabase({ databasePath, migrationsDirectory: directory42 });
  assert.deepEqual(repeat42.migration.applied, []);
  assert.equal(repeat42.migration.currentVersion, 42);
  const ledger42 = repeat42.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  repeat42.db.close();
  const directory43 = path.join(root, 'migrations-v43');
  fs.mkdirSync(directory43);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 43).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(directory43, name));
  const upgraded43 = openDatabase({ databasePath, migrationsDirectory: directory43 });
  assert.deepEqual(upgraded43.migration.applied, [43]);
  assert.equal(upgraded43.db.pragma('user_version', { simple: true }), 43n);
  assert.deepEqual(upgraded43.db.prepare('SELECT * FROM schema_migrations WHERE version<=42 ORDER BY version').all(), ledger42);
  assert.deepEqual(new FoundationService({ db: upgraded43.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  assert.deepEqual(upgraded43.db.prepare('SELECT * FROM analysis_metric_rule_adoptions').all(), []);
  upgraded43.db.close();
  const repeat43 = openDatabase({ databasePath, migrationsDirectory: directory43 });
  assert.deepEqual(repeat43.migration.applied, []);
  assert.equal(repeat43.migration.currentVersion, 43);
  const ledger43 = repeat43.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  repeat43.db.close();
  const directory44 = path.join(root, 'migrations-v44');
  fs.mkdirSync(directory44);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 44).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(directory44, name));
  const upgraded44 = openDatabase({ databasePath, migrationsDirectory: directory44 });
  assert.deepEqual(upgraded44.migration.applied, [44]);
  assert.equal(upgraded44.db.pragma('user_version', { simple: true }), 44n);
  assert.deepEqual(upgraded44.db.prepare('SELECT * FROM schema_migrations WHERE version<=43 ORDER BY version').all(), ledger43);
  assert.deepEqual(new FoundationService({ db: upgraded44.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  for (const table of ['analysis_metric_membership_proposals', 'analysis_metric_membership_receipts', 'analysis_metric_membership_accepted'])
    assert.deepEqual(upgraded44.db.prepare(`SELECT * FROM ${table}`).all(), []);
  upgraded44.db.close();
  const repeat44 = openDatabase({ databasePath, migrationsDirectory: directory44 });
  assert.deepEqual(repeat44.migration.applied, []);
  assert.equal(repeat44.migration.currentVersion, 44);
  const ledger44 = repeat44.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  repeat44.db.close();
  const directory45 = path.join(root, 'migrations-v45');
  fs.mkdirSync(directory45);
  for (const name of fs.readdirSync('migrations').filter(candidate => /^\d{4}_.+\.sql$/.test(candidate) && Number(candidate.slice(0, 4)) <= 45).sort())
    fs.copyFileSync(path.join('migrations', name), path.join(directory45, name));
  const upgraded45 = openDatabase({ databasePath, migrationsDirectory: directory45 });
  assert.deepEqual(upgraded45.migration.applied, [45]);
  assert.equal(upgraded45.db.pragma('user_version', { simple: true }), 45n);
  assert.deepEqual(upgraded45.db.prepare('SELECT * FROM schema_migrations WHERE version<=44 ORDER BY version').all(), ledger44);
  assert.deepEqual(new FoundationService({ db: upgraded45.db, artifactStore: artifacts }).getLineageRecords(receipt.observationIds[0]!), lineage);
  assert.deepEqual(upgraded45.db.prepare('SELECT * FROM analysis_insight_coding_evidence').all(), []);
  upgraded45.db.close();
  const repeat45 = openDatabase({ databasePath, migrationsDirectory: directory45 });
  assert.deepEqual(repeat45.migration.applied, []);
  assert.equal(repeat45.migration.currentVersion, 45);
  repeat45.db.close();
});

test('AJV rejects missing required input and SQLite rejects invalid foreign keys', async () => {
  const { db, service } = setup();
  const invalid = fixture();
  delete invalid.product;
  await assert.rejects(service.importManualObservation(invalid), FoundationValidationError);

  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO foundation_ingestion_runs(
             ingestion_id, source_id, idempotency_key, status, acquired_at, started_at,
             completed_at, artifact_sha256, request_sha256, contract_version
           ) VALUES (?, ?, ?, 'processing', ?, ?, NULL, NULL, ?, ?)`,
        )
        .run(
          '00000000-0000-4000-8000-000000000000',
          'manual:missing',
          'bad-fk',
          '2026-09-05T10:00:00.000Z',
          '2026-09-05T10:00:00.000Z',
          '0'.repeat(64),
          '1.0.0',
        ),
    /FOREIGN KEY constraint failed/,
  );
  db.close();
});

test('a failed service transaction leaves no partial authoritative state', async () => {
  const input = fixture() as any;
  const { db, service } = setup();
  const rawBytes = Buffer.from(canonicalJson(input.rawPayload), 'utf8');
  const digest = createHash('sha256').update(rawBytes).digest('hex');
  db.prepare(
    `INSERT INTO artifact_manifests(
       sha256, byte_size, media_type, relative_path, acquired_at,
       contract_version, retention_status, created_at
     ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)`,
  ).run(
    digest,
    rawBytes.byteLength,
    `sha256/00/${digest}`,
    '2026-09-05T10:00:00.000Z',
    '2026-09-05T10:00:00.000Z',
  );

  await assert.rejects(service.importManualObservation(input), /inconsistent manifest metadata/);
  for (const table of [
    'foundation_sources',
    'foundation_ingestion_runs',
    'foundation_evidence',
    'foundation_products',
    'foundation_observations',
    'foundation_observation_evidence',
  ]) {
    assert.equal((db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count, 0n, table);
  }
  assert.equal((db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as { count: bigint }).count, 1n);
  db.close();
});

test('manual import creates lineage, round-trips artifact bytes/hash, and preserves integer VND', async () => {
  const input = fixture();
  const { db, artifacts, service } = setup();
  const imported = await service.importManualObservation(input);
  assert.equal(imported.deduplicated, false);
  assert.equal(imported.observationIds.length, 4);

  const revenueRow = db
    .prepare("SELECT observation_id AS observationId FROM foundation_observations WHERE metric_code = 'period_revenue_vnd'")
    .get() as { observationId: bigint };
  const lineage = service.getLineage(revenueRow.observationId);
  assert.equal(lineage.sourceId, 'manual:synthetic-calcium-001');
  assert.equal(lineage.sourceType, 'manual');
  assert.equal(lineage.ingestionId, imported.ingestionId);
  assert.equal(lineage.periodStart, '2026-08-01T00:00:00.000Z');
  assert.equal(lineage.periodEnd, '2026-08-31T23:59:59.999Z');
  assert.equal(lineage.periodGrain, 'calendar_month');
  assert.equal(lineage.evidenceGrade, 'synthetic');
  assert.match(lineage.evidenceGradeBasis, /synthetic integration fixture/i);
  assert.equal(lineage.integerValue, 9007199254740991n);
  assert.equal(lineage.unit, 'VND');

  const rawPayload = (input.rawPayload ?? null) as unknown;
  const expectedBytes = Buffer.from(canonicalJson(rawPayload), 'utf8');
  const artifactBytes = await artifacts.read(lineage.artifactSha256);
  assert.deepEqual(artifactBytes, expectedBytes);
  assert.equal(createHash('sha256').update(artifactBytes).digest('hex'), lineage.artifactSha256);
  assert.equal(lineage.artifactByteSize, BigInt(expectedBytes.byteLength));

  const zeroLifetime = db
    .prepare("SELECT integer_value AS value FROM foundation_observations WHERE metric_code = 'lifetime_revenue_vnd'")
    .get() as { value: bigint };
  assert.equal(zeroLifetime.value, 0n, 'observed zero is stored');
  assert.equal(
    (db.prepare("SELECT count(*) AS count FROM foundation_observations WHERE metric_code = 'units_sold'").get() as { count: bigint })
      .count,
    0n,
    'missing metric has no row and is distinct from zero',
  );

  const percent = db
    .prepare("SELECT integer_value AS value, unit, scale FROM foundation_observations WHERE metric_code = 'revenue_growth_percent'")
    .get();
  assert.deepEqual(percent, { value: 1250n, unit: 'percent', scale: 100n });
  const trends = db
    .prepare("SELECT integer_value AS value, unit FROM foundation_observations WHERE metric_code = 'trends_interest_index'")
    .get();
  assert.deepEqual(trends, { value: 64n, unit: 'relative_interest_index_0_100' });
  db.close();
});

test('reimport is idempotent and product identity does not use product_name', async () => {
  const firstInput = fixture();
  const { db, service } = setup();
  const first = await service.importManualObservation(firstInput);
  const second = await service.importManualObservation(firstInput);
  assert.equal(second.deduplicated, true);
  assert.equal(second.ingestionId, first.ingestionId);
  assert.deepEqual(second.observationIds, first.observationIds);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_products').get() as { count: bigint }).count, 1n);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_observations').get() as { count: bigint }).count, 4n);

  const crossProvider = structuredClone(firstInput) as any;
  crossProvider.source = {
    sourceId: 'provider-export:synthetic-second-provider',
    sourceType: 'provider_export',
    displayName: 'Synthetic second provider',
  };
  crossProvider.ingestion.idempotencyKey = 'provider-run-001';
  crossProvider.product.productName = 'Renamed display label, same platform identity';
  crossProvider.rawPayload = { provider: 'second', values: 'same metrics' };
  const third = await service.importManualObservation(crossProvider);
  assert.equal(third.deduplicated, false);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_products').get() as { count: bigint }).count, 1n);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_observations').get() as { count: bigint }).count, 4n);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_evidence').get() as { count: bigint }).count, 2n);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_observation_evidence').get() as { count: bigint }).count, 8n);
  const evidenceLineage = service.getLineageRecords(first.observationIds[0]!);
  assert.deepEqual(
    evidenceLineage.map((row) => row.sourceId).sort(),
    ['manual:synthetic-calcium-001', 'provider-export:synthetic-second-provider'],
  );
  db.close();
});

test('same observation identity with a conflicting provider value is rejected before database writes', async () => {
  const { db, service } = setup();
  await service.importManualObservation(fixture());
  const conflict = fixture() as any;
  conflict.source = {
    sourceId: 'provider-api:synthetic-conflict',
    sourceType: 'provider_api',
    displayName: 'Synthetic conflicting provider',
  };
  conflict.ingestion.idempotencyKey = 'conflicting-run';
  conflict.observation.periodRevenueVnd = 123;
  await assert.rejects(service.importManualObservation(conflict), FoundationIdentityConflictError);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_sources').get() as { count: bigint }).count, 1n);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_ingestion_runs').get() as { count: bigint }).count, 1n);
  db.close();
});

test('period ordering uses actual instants while preserving supplied timezone-offset strings', async () => {
  const input = fixture() as any;
  input.observation.period.start = '2026-08-01T10:00:00+02:00';
  input.observation.period.end = '2026-08-01T09:30:00+00:00';
  const { db, service } = setup();

  const imported = await service.importManualObservation(input);
  const lineage = service.getLineage(imported.observationIds[0]!);
  assert.equal(lineage.periodStart, input.observation.period.start);
  assert.equal(lineage.periodEnd, input.observation.period.end);
  db.close();
});

test('reversed actual period instants and unparseable database timestamps are rejected', async () => {
  const input = fixture() as any;
  input.observation.period.start = '2026-08-01T08:00:00-02:00';
  input.observation.period.end = '2026-08-01T09:00:00+00:00';
  const { db, service } = setup();

  await assert.rejects(
    service.importManualObservation(input),
    /period\.start must not be after observation\.period\.end/,
  );

  const valid = await service.importManualObservation(fixture());
  const productId = service.getLineage(valid.observationIds[0]!).productId;
  const insertPeriod = db.prepare(
    `INSERT INTO foundation_observations(
       identity_key, product_id, metric_code, integer_value, unit, scale, scope,
       period_start, period_end, period_grain, observed_at, created_at
     ) VALUES (?, ?, 'units_sold', 1, 'count', NULL, 'constraint_probe', ?, ?, 'custom', ?, ?)`,
  );
  const now = '2026-09-05T10:00:00.000Z';
  assert.throws(
    () => insertPeriod.run('a'.repeat(64), productId, input.observation.period.start, input.observation.period.end, now, now),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => insertPeriod.run('b'.repeat(64), productId, 'not-a-timestamp', now, now, now),
    /CHECK constraint failed/,
  );
  db.close();
});

test('non-JSON artifact media types are rejected at the contract boundary', async () => {
  const input = fixture() as any;
  input.ingestion.mediaType = 'text/plain';
  const { db, service } = setup();

  await assert.rejects(service.importManualObservation(input), FoundationValidationError);
  assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_ingestion_runs').get() as { count: bigint }).count, 0n);
  assert.equal((db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as { count: bigint }).count, 0n);
  db.close();
});

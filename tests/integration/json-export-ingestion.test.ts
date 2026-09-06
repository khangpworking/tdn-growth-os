import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  FoundationIdentityConflictError,
  FoundationService,
  FoundationValidationError,
} from '../../src/modules/foundation/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const fixturePath = path.resolve('tests/fixtures/json-export.synthetic.json');
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function fixtureBytes(): Buffer {
  return fs.readFileSync(fixturePath);
}

function fixture(): any {
  return JSON.parse(fixtureBytes().toString('utf8'));
}

function bytes(value: unknown, indentation = 2): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, indentation)}\n`, 'utf8');
}

function setup(): {
  root: string;
  db: Database.Database;
  artifacts: ContentAddressedArtifactStore;
  service: FoundationService;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-json-export-'));
  roots.push(root);
  const { db } = openDatabase({
    databasePath: path.join(root, 'runtime', 'foundation.sqlite'),
    now: () => new Date('2026-09-05T10:00:00.000Z'),
  });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  return {
    root,
    db,
    artifacts,
    service: new FoundationService({
      db,
      artifactStore: artifacts,
      now: () => new Date('2026-09-05T10:00:00.000Z'),
    }),
  };
}

function counts(db: Database.Database): Record<string, bigint> {
  return Object.fromEntries(
    [
      'artifact_manifests',
      'foundation_sources',
      'foundation_ingestion_runs',
      'foundation_evidence',
      'foundation_products',
      'foundation_observations',
      'foundation_observation_evidence',
    ].map((table) => [table, (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count]),
  );
}

test('invalid JSON and invalid contracts are rejected before artifacts or database records', async () => {
  const { root, db, service } = setup();
  await assert.rejects(service.importJsonExport(Buffer.from('{ invalid')), FoundationValidationError);
  await assert.rejects(
    service.importJsonExport(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])),
    FoundationValidationError,
  );
  const invalid = fixture();
  invalid.rows = [];
  await assert.rejects(service.importJsonExport(bytes(invalid)), FoundationValidationError);
  assert.deepEqual(counts(db), {
    artifact_manifests: 0n,
    foundation_sources: 0n,
    foundation_ingestion_runs: 0n,
    foundation_evidence: 0n,
    foundation_products: 0n,
    foundation_observations: 0n,
    foundation_observation_evidence: 0n,
  });
  assert.equal(fs.existsSync(path.join(root, 'artifacts')), false);
  db.close();
});

test('one multi-product export stores exact bytes and shares one lineage artifact and evidence', async () => {
  const exactBytes = fixtureBytes();
  const { db, artifacts, service } = setup();
  const imported = await service.importJsonExport(exactBytes);
  assert.equal(imported.deduplicated, false);
  assert.equal(imported.observationIds.length, 6);
  assert.deepEqual(counts(db), {
    artifact_manifests: 1n,
    foundation_sources: 1n,
    foundation_ingestion_runs: 1n,
    foundation_evidence: 1n,
    foundation_products: 2n,
    foundation_observations: 6n,
    foundation_observation_evidence: 6n,
  });

  const stored = await artifacts.read(imported.artifactSha256);
  assert.deepEqual(stored, exactBytes);
  assert.equal(createHash('sha256').update(exactBytes).digest('hex'), imported.artifactSha256);
  const lineages = imported.observationIds.map((id) => service.getLineage(id));
  assert.equal(new Set(lineages.map((lineage) => lineage.artifactSha256)).size, 1);
  assert.equal(new Set(lineages.map((lineage) => lineage.evidenceId)).size, 1);
  assert.equal(new Set(lineages.map((lineage) => lineage.ingestionId)).size, 1);
  assert.deepEqual(new Set(lineages.map((lineage) => lineage.platformProductId)), new Set([
    'synthetic-metric-item-001',
    'synthetic-metric-item-002',
  ]));
  assert.ok(lineages.every((lineage) => lineage.periodStart === '2026-08-01T10:00:00+02:00'));
  assert.ok(lineages.every((lineage) => lineage.periodEnd === '2026-08-31T09:30:00+00:00'));

  const maxRevenue = db
    .prepare("SELECT integer_value AS value FROM foundation_observations WHERE metric_code = 'period_revenue_vnd' ORDER BY integer_value DESC LIMIT 1")
    .get();
  assert.deepEqual(maxRevenue, { value: 9007199254740991n });
  assert.deepEqual(
    db.prepare(
      `SELECT integer_value AS value, unit
         FROM foundation_observations
        WHERE metric_code = 'units_sold'
        ORDER BY integer_value`,
    ).all(),
    [
      { value: 0n, unit: 'count' },
      { value: 84n, unit: 'count' },
    ],
  );
  assert.deepEqual(
    db.prepare(
      `SELECT integer_value AS value, unit, scale
         FROM foundation_observations
        WHERE metric_code = 'revenue_growth_percent'`,
    ).get(),
    { value: 1250n, unit: 'percent', scale: 100n },
  );
  assert.equal(
    (db.prepare("SELECT count(*) AS count FROM foundation_observations WHERE metric_code = 'lifetime_revenue_vnd'").get() as { count: bigint }).count,
    1n,
    'missing lifetime revenue creates no row for the second product',
  );
  assert.equal(
    (db.prepare("SELECT integer_value AS value FROM foundation_observations WHERE metric_code = 'lifetime_revenue_vnd'").get() as { value: bigint }).value,
    0n,
    'observed zero remains a row',
  );
  db.close();
});

test('same key and exact bytes are idempotent while different bytes conflict', async () => {
  const exactBytes = fixtureBytes();
  const { db, service } = setup();
  const first = await service.importJsonExport(exactBytes);
  const second = await service.importJsonExport(exactBytes);
  assert.equal(second.deduplicated, true);
  assert.equal(second.ingestionId, first.ingestionId);
  assert.deepEqual(second.observationIds, first.observationIds);

  const changedWhitespace = Buffer.concat([exactBytes, Buffer.from('\n')]);
  await assert.rejects(service.importJsonExport(changedWhitespace), FoundationIdentityConflictError);
  assert.equal(counts(db).foundation_ingestion_runs, 1n);
  assert.equal(counts(db).artifact_manifests, 1n);
  db.close();
});

test('duplicate identities dedupe equal values and conflicting values reject before all writes', async () => {
  const equalDuplicate = fixture();
  equalDuplicate.rows.push(structuredClone(equalDuplicate.rows[0]));
  const firstSetup = setup();
  const imported = await firstSetup.service.importJsonExport(bytes(equalDuplicate));
  assert.equal(imported.observationIds.length, 6);
  assert.equal(counts(firstSetup.db).foundation_products, 2n);
  assert.equal(counts(firstSetup.db).foundation_observations, 6n);
  firstSetup.db.close();

  const conflict = fixture();
  const conflictingRow = structuredClone(conflict.rows[0]);
  conflictingRow.periodRevenueVnd = 123;
  conflict.rows.push(conflictingRow);
  const secondSetup = setup();
  await assert.rejects(secondSetup.service.importJsonExport(bytes(conflict)), FoundationIdentityConflictError);
  assert.deepEqual(counts(secondSetup.db), {
    artifact_manifests: 0n,
    foundation_sources: 0n,
    foundation_ingestion_runs: 0n,
    foundation_evidence: 0n,
    foundation_products: 0n,
    foundation_observations: 0n,
    foundation_observation_evidence: 0n,
  });
  assert.equal(fs.existsSync(path.join(secondSetup.root, 'artifacts')), false);
  secondSetup.db.close();
});

test('export periods compare actual offset instants and reject reversed actual order before writes', async () => {
  const valid = fixture();
  valid.period.start = '2026-08-01T10:00:00+02:00';
  valid.period.end = '2026-08-01T09:30:00+00:00';
  const validSetup = setup();
  const imported = await validSetup.service.importJsonExport(bytes(valid));
  const lineage = validSetup.service.getLineage(imported.observationIds[0]!);
  assert.equal(lineage.periodStart, valid.period.start);
  assert.equal(lineage.periodEnd, valid.period.end);
  validSetup.db.close();

  const reversed = fixture();
  reversed.period.start = '2026-08-01T08:00:00-02:00';
  reversed.period.end = '2026-08-01T09:00:00+00:00';
  const reversedSetup = setup();
  await assert.rejects(reversedSetup.service.importJsonExport(bytes(reversed)), FoundationValidationError);
  assert.equal(counts(reversedSetup.db).foundation_ingestion_runs, 0n);
  assert.equal(counts(reversedSetup.db).artifact_manifests, 0n);
  assert.equal(fs.existsSync(path.join(reversedSetup.root, 'artifacts')), false);
  reversedSetup.db.close();
});

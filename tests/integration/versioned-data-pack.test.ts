import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { DataPackRequest } from '../../contracts/foundation/data-pack-request.generated.js';
import {
  canonicalJson,
  DataPackService,
  FoundationIdentityConflictError,
  FoundationService,
  FoundationValidationError,
} from '../../src/modules/foundation/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const exportFixturePath = path.resolve('tests/fixtures/json-export.synthetic.json');
const migrationOnePath = path.resolve('migrations/0001_foundation.sql');
const expectedMigrationOneSha256 = 'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup(): {
  root: string;
  db: Database.Database;
  artifacts: ContentAddressedArtifactStore;
  foundation: FoundationService;
  packs: DataPackService;
  migrationApplied: readonly number[];
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-data-pack-'));
  roots.push(root);
  const opened = openDatabase({
    databasePath: path.join(root, 'runtime', 'foundation.sqlite'),
    now: () => new Date('2026-09-06T10:00:00.000Z'),
  });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  return {
    root,
    db: opened.db,
    artifacts,
    foundation: new FoundationService({
      db: opened.db,
      artifactStore: artifacts,
      now: () => new Date('2026-09-06T10:00:00.000Z'),
    }),
    packs: new DataPackService({
      db: opened.db,
      artifactStore: artifacts,
      now: () => new Date('2026-09-06T12:00:00.000Z'),
    }),
    migrationApplied: opened.migration.applied,
  };
}

async function imported(setupResult: ReturnType<typeof setup>) {
  return setupResult.foundation.importJsonExport(fs.readFileSync(exportFixturePath));
}

function request(observationIds: readonly bigint[], overrides: Partial<DataPackRequest> = {}): DataPackRequest {
  assert.ok(observationIds.length > 0);
  return {
    contractVersion: '1.0.0',
    packKey: 'analysis:synthetic-product-card-august',
    version: 1,
    purpose: 'Freeze synthetic Product Card observations for deterministic calculation input.',
    observationIds: observationIds.map(String) as [string, ...string[]],
    ...overrides,
  };
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

test('migration 0002 upgrades version 1 once, reruns idempotently, and migration 0001 is unchanged', () => {
  assert.equal(createHash('sha256').update(fs.readFileSync(migrationOnePath)).digest('hex'), expectedMigrationOneSha256);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-data-pack-migration-'));
  roots.push(root);
  const migrationsDirectory = path.join(root, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  fs.copyFileSync(migrationOnePath, path.join(migrationsDirectory, '0001_foundation.sql'));
  const databasePath = path.join(root, 'foundation.sqlite');

  const versionOne = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(versionOne.migration.applied, [1]);
  assert.equal(versionOne.db.pragma('user_version', { simple: true }), 1n);
  versionOne.db.close();

  fs.copyFileSync(path.resolve('migrations/0002_data_packs.sql'), path.join(migrationsDirectory, '0002_data_packs.sql'));
  const upgraded = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(upgraded.migration.applied, [2]);
  assert.equal(upgraded.db.pragma('user_version', { simple: true }), 2n);
  assert.deepEqual(upgraded.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [
    { version: 1n },
    { version: 2n },
  ]);
  upgraded.db.close();

  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 2);
  rerun.db.close();
});

test('explicit observations freeze one deterministic lossless manifest and replay its evidence lineage', async () => {
  const state = setup();
  const source = await imported(state);
  const selected = [source.observationIds[5]!, source.observationIds[0]!, source.observationIds[2]!];
  const frozen = await state.packs.finalize(request(selected));
  assert.equal(frozen.deduplicated, false);
  assert.deepEqual(frozen.observationIds, [...selected].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.equal(count(state.db, 'foundation_data_packs'), 1n);
  assert.equal(count(state.db, 'foundation_data_pack_items'), 3n);

  const artifactBytes = await state.artifacts.read(frozen.manifestArtifactSha256);
  assert.equal(createHash('sha256').update(artifactBytes).digest('hex'), frozen.manifestArtifactSha256);
  const replayed = await state.packs.replay(frozen.packId);
  assert.equal(artifactBytes.toString('utf8'), canonicalJson(replayed));
  assert.equal(replayed.finalizedAt, '2026-09-06T12:00:00.000Z');
  assert.equal(replayed.period.scope, 'product_card_performance');
  assert.equal(replayed.period.start, '2026-08-01T10:00:00+02:00');
  assert.deepEqual(replayed.observations.map((row) => row.observationId), frozen.observationIds.map(String));
  const maximum = replayed.observations.find((row) => row.integerValue === '9007199254740991');
  assert.ok(maximum, 'safe maximum integer VND is encoded losslessly as a decimal string');
  assert.equal(maximum.scale, null);
  for (const observation of replayed.observations) {
    assert.ok(observation.identityKey.length === 64);
    assert.ok(observation.productName.startsWith('Synthetic'));
    assert.equal(observation.evidence.length, 1);
    assert.equal(observation.evidence[0]!.grade, 'synthetic');
    assert.equal(observation.evidence[0]!.rawArtifactSha256, source.artifactSha256);
  }
  state.db.close();
});

test('input order is semantic, same request is idempotent, and changed request conflicts', async () => {
  const state = setup();
  const source = await imported(state);
  const selected = [source.observationIds[0]!, source.observationIds[1]!, source.observationIds[2]!];
  const first = await state.packs.finalize(request(selected));
  const firstBytes = await state.artifacts.read(first.manifestArtifactSha256);
  const reordered = await state.packs.finalize(request([...selected].reverse()));
  assert.equal(reordered.deduplicated, true);
  assert.equal(reordered.packId, first.packId);
  assert.equal(reordered.manifestArtifactSha256, first.manifestArtifactSha256);
  assert.deepEqual(await state.artifacts.read(reordered.manifestArtifactSha256), firstBytes);
  assert.equal(count(state.db, 'foundation_data_packs'), 1n);
  assert.equal(count(state.db, 'foundation_data_pack_items'), 3n);

  await assert.rejects(
    state.packs.finalize(request(selected, { purpose: 'Changed purpose for the same key and version.' })),
    FoundationIdentityConflictError,
  );
  assert.equal(count(state.db, 'foundation_data_packs'), 1n);
  state.db.close();
});

test('missing and mixed-period selections reject before Data Pack or manifest writes', async () => {
  const state = setup();
  const source = await imported(state);
  const baselineArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(state.packs.finalize(request([source.observationIds[0]!, 999999n])), FoundationValidationError);
  assert.equal(count(state.db, 'foundation_data_packs'), 0n);
  assert.equal(count(state.db, 'artifact_manifests'), baselineArtifacts);

  const changedPeriod = JSON.parse(fs.readFileSync(exportFixturePath, 'utf8')) as any;
  changedPeriod.ingestion.idempotencyKey = 'synthetic-product-card-2026-09';
  changedPeriod.period.start = '2026-09-01T00:00:00.000Z';
  changedPeriod.period.end = '2026-09-30T23:59:59.999Z';
  const changedPeriodImport = await state.foundation.importJsonExport(Buffer.from(JSON.stringify(changedPeriod)));
  const beforeMixedPeriodArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(
    state.packs.finalize(request([source.observationIds[0]!, changedPeriodImport.observationIds[0]!])),
    /share exact scope and period/,
  );
  assert.equal(count(state.db, 'foundation_data_packs'), 0n);
  assert.equal(count(state.db, 'artifact_manifests'), beforeMixedPeriodArtifacts);

  const changedScope = JSON.parse(fs.readFileSync(exportFixturePath, 'utf8')) as any;
  changedScope.ingestion.idempotencyKey = 'synthetic-product-card-other-scope';
  changedScope.period.scope = 'other_product_scope';
  const changedScopeImport = await state.foundation.importJsonExport(Buffer.from(JSON.stringify(changedScope)));
  const beforeMixedScopeArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(
    state.packs.finalize(request([source.observationIds[0]!, changedScopeImport.observationIds[0]!])),
    /share exact scope and period/,
  );
  assert.equal(count(state.db, 'foundation_data_packs'), 0n);
  assert.equal(count(state.db, 'artifact_manifests'), beforeMixedScopeArtifacts);
  state.db.close();
});

test('a higher same-key version supersedes without mutating old bytes or rows', async () => {
  const state = setup();
  const source = await imported(state);
  const first = await state.packs.finalize(request(source.observationIds.slice(0, 2)));
  const oldBytes = await state.artifacts.read(first.manifestArtifactSha256);
  const oldRow = state.db.prepare('SELECT * FROM foundation_data_packs WHERE pack_id = ?').get(first.packId);
  const second = await state.packs.finalize(
    request(source.observationIds.slice(0, 3), { version: 2, supersedesPackId: first.packId }),
  );
  assert.notEqual(second.packId, first.packId);
  assert.equal(count(state.db, 'foundation_data_packs'), 2n);
  assert.deepEqual(await state.artifacts.read(first.manifestArtifactSha256), oldBytes);
  assert.deepEqual(state.db.prepare('SELECT * FROM foundation_data_packs WHERE pack_id = ?').get(first.packId), oldRow);
  assert.equal((await state.packs.replay(second.packId)).supersedesPackId, first.packId);

  await assert.rejects(
    state.packs.finalize(
      request(source.observationIds.slice(0, 2), {
        packKey: 'analysis:different-key',
        version: 3,
        supersedesPackId: first.packId,
      }),
    ),
    /same pack key and a lower version/,
  );
  assert.equal(count(state.db, 'foundation_data_packs'), 2n);
  state.db.close();

  const nonLower = setup();
  const nonLowerSource = await imported(nonLower);
  const versionTwo = await nonLower.packs.finalize(
    request(nonLowerSource.observationIds.slice(0, 2), { version: 2 }),
  );
  await assert.rejects(
    nonLower.packs.finalize(
      request(nonLowerSource.observationIds.slice(0, 2), { version: 1, supersedesPackId: versionTwo.packId }),
    ),
    /same pack key and a lower version/,
  );
  assert.equal(count(nonLower.db, 'foundation_data_packs'), 1n);
  nonLower.db.close();
});

test('finalized packs and memberships reject direct mutation', async () => {
  const state = setup();
  const source = await imported(state);
  const frozen = await state.packs.finalize(request(source.observationIds.slice(0, 2)));
  assert.throws(
    () => state.db.prepare('UPDATE foundation_data_packs SET purpose = ? WHERE pack_id = ?').run('rewrite', frozen.packId),
    /foundation_data_pack_finalized_immutable/,
  );
  assert.throws(
    () => state.db.prepare('DELETE FROM foundation_data_packs WHERE pack_id = ?').run(frozen.packId),
    /foundation_data_pack_immutable/,
  );
  assert.throws(
    () => state.db.prepare('DELETE FROM foundation_data_pack_items WHERE pack_id = ?').run(frozen.packId),
    /foundation_data_pack_membership_immutable/,
  );
  assert.throws(
    () =>
      state.db
        .prepare('UPDATE foundation_data_pack_items SET observation_id = ? WHERE pack_id = ?')
        .run(source.observationIds[2]!, frozen.packId),
    /foundation_data_pack_membership_immutable/,
  );
  assert.throws(
    () =>
      state.db
        .prepare('INSERT INTO foundation_data_pack_items(pack_id, observation_id) VALUES (?, ?)')
        .run(frozen.packId, source.observationIds[2]!),
    /foundation_data_pack_membership_immutable/,
  );
  state.db.close();
});

test('replay detects missing and corrupt manifest artifacts', async () => {
  const missing = setup();
  const missingSource = await imported(missing);
  const missingPack = await missing.packs.finalize(request(missingSource.observationIds.slice(0, 2)));
  await fsp.rm(missing.artifacts.pathForDigest(missingPack.manifestArtifactSha256));
  await assert.rejects(missing.packs.replay(missingPack.packId), /ENOENT/);
  missing.db.close();

  const corrupt = setup();
  const corruptSource = await imported(corrupt);
  const corruptPack = await corrupt.packs.finalize(request(corruptSource.observationIds.slice(0, 2)));
  await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptPack.manifestArtifactSha256), Buffer.from('{}'));
  await assert.rejects(corrupt.packs.replay(corruptPack.packId), ArtifactIntegrityError);
  corrupt.db.close();
});

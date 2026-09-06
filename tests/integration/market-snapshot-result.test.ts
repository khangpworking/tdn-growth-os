import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  AnalysisIdentityConflictError,
  AnalysisValidationError,
  MarketSnapshotService,
} from '../../src/modules/analysis/index.js';
import {
  canonicalJson,
  DataPackService,
  FoundationDataPackReader,
  FoundationService,
} from '../../src/modules/foundation/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const fixturePath = path.resolve('tests/fixtures/json-export.synthetic.json');
const migrationPaths = [1, 2].map((version) => path.resolve(`migrations/000${version}_${version === 1 ? 'foundation' : 'data_packs'}.sql`));
const expectedPriorMigrationDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
];
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
  analysis: MarketSnapshotService;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-market-snapshot-'));
  roots.push(root);
  const { db } = openDatabase({
    databasePath: path.join(root, 'runtime', 'foundation.sqlite'),
    now: () => new Date('2026-09-07T08:00:00.000Z'),
  });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const foundation = new FoundationService({ db, artifactStore: artifacts, now: () => new Date('2026-09-07T09:00:00.000Z') });
  const packs = new DataPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-07T10:00:00.000Z') });
  return {
    root,
    db,
    artifacts,
    foundation,
    packs,
    analysis: new MarketSnapshotService({
      db,
      artifactStore: artifacts,
      dataPackReader: new FoundationDataPackReader(packs),
      now: () => new Date('2026-09-07T11:00:00.000Z'),
    }),
  };
}

function fixture(): any {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

async function importAndPack(state: ReturnType<typeof setup>, select?: (ids: readonly bigint[]) => readonly bigint[]) {
  const imported = await state.foundation.importJsonExport(fs.readFileSync(fixturePath));
  const observationIds = select ? select(imported.observationIds) : imported.observationIds;
  const pack = await state.packs.finalize({
    contractVersion: '1.0.0',
    packKey: `analysis:market-snapshot-${randomUUID()}`,
    version: 1,
    purpose: 'Synthetic deterministic market snapshot input.',
    observationIds: observationIds.map(String),
  });
  return { imported, pack };
}

function request(dataPackId: string) {
  return {
    contractVersion: '1.0.0',
    dataPackId,
    calculationKey: 'market_snapshot_v1',
    calculationVersion: 1,
  } as const;
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

test('migration 0003 upgrades version 2 once and prior migrations remain byte-identical', () => {
  assert.deepEqual(
    migrationPaths.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')),
    expectedPriorMigrationDigests,
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-analysis-migration-'));
  roots.push(root);
  const migrationsDirectory = path.join(root, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  for (const migrationPath of migrationPaths) fs.copyFileSync(migrationPath, path.join(migrationsDirectory, path.basename(migrationPath)));
  const databasePath = path.join(root, 'foundation.sqlite');
  const versionTwo = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(versionTwo.migration.applied, [1, 2]);
  assert.equal(versionTwo.db.pragma('user_version', { simple: true }), 2n);
  versionTwo.db.close();

  fs.copyFileSync(path.resolve('migrations/0003_analysis_results.sql'), path.join(migrationsDirectory, '0003_analysis_results.sql'));
  const upgraded = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(upgraded.migration.applied, [3]);
  assert.equal(upgraded.db.pragma('user_version', { simple: true }), 3n);
  upgraded.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 3);
  rerun.db.close();
});

test('market_snapshot_v1 calculates exact BigInt totals, coverage, ignored metrics, and canonical replay', async () => {
  const state = setup();
  const { imported, pack } = await importAndPack(state);
  const execution = await state.analysis.calculate(request(pack.packId));
  assert.equal(execution.deduplicated, false);
  assert.equal(count(state.db, 'analysis_results'), 1n);
  const result = await state.analysis.replay(execution.resultId);
  assert.equal(result.resultId, execution.resultId);
  assert.deepEqual(result.totals, {
    periodRevenueVndTotal: '9007199296740991',
    periodUnitsSoldTotal: '84',
  });
  assert.deepEqual(result.coverage, {
    selectedObservationCount: 6,
    uniqueProductCount: 2,
    periodRevenueObservedProductCount: 2,
    periodUnitsSoldObservedProductCount: 2,
  });
  assert.deepEqual(result.ignoredMetricCodes, ['lifetime_revenue_vnd', 'revenue_growth_percent']);
  assert.equal(result.dataPack.dataPackId, pack.packId);
  assert.equal(result.dataPack.manifestArtifactSha256, pack.manifestArtifactSha256);
  assert.equal(result.period.start, '2026-08-01T10:00:00+02:00');
  const bytes = await state.artifacts.read(execution.resultArtifactSha256);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), execution.resultArtifactSha256);
  assert.equal(JSON.stringify(JSON.parse(bytes.toString('utf8'))), bytes.toString('utf8'));
  assert.equal(imported.observationIds.length, 6);
  state.db.close();
});

test('observed zero differs from a missing supported metric', async () => {
  const state = setup();
  const imported = await state.foundation.importJsonExport(fs.readFileSync(fixturePath));
  const manifestRows = await Promise.all(imported.observationIds.map(async (id) => ({ id, row: state.foundation.getLineage(id) })));
  const zeroUnits = manifestRows.find(({ row }) => row.metricCode === 'units_sold' && row.integerValue === 0n)!.id;
  const revenue = manifestRows.find(({ row }) => row.metricCode === 'period_revenue_vnd')!.id;

  const zeroPack = await state.packs.finalize({
    contractVersion: '1.0.0', packKey: 'analysis:zero-units', version: 1, purpose: 'Observed zero.', observationIds: [String(zeroUnits)],
  });
  const zeroResult = await state.analysis.replay((await state.analysis.calculate(request(zeroPack.packId))).resultId);
  assert.equal(zeroResult.totals.periodUnitsSoldTotal, '0');
  assert.equal(zeroResult.coverage.periodUnitsSoldObservedProductCount, 1);
  assert.equal(zeroResult.totals.periodRevenueVndTotal, null);
  assert.equal(zeroResult.coverage.periodRevenueObservedProductCount, 0);

  const revenuePack = await state.packs.finalize({
    contractVersion: '1.0.0', packKey: 'analysis:missing-units', version: 1, purpose: 'Units absent.', observationIds: [String(revenue)],
  });
  const revenueResult = await state.analysis.replay((await state.analysis.calculate(request(revenuePack.packId))).resultId);
  assert.equal(revenueResult.totals.periodUnitsSoldTotal, null);
  assert.equal(revenueResult.coverage.periodUnitsSoldObservedProductCount, 0);
  state.db.close();
});

test('multiple evidence does not multiply totals and calculation ignores mutable current tables', async () => {
  const state = setup();
  const first = await state.foundation.importJsonExport(fs.readFileSync(fixturePath));
  const secondInput = fixture();
  secondInput.source = { sourceId: 'provider-export:second-synthetic-source', sourceType: 'provider_export', displayName: 'Second synthetic source' };
  secondInput.ingestion.idempotencyKey = 'second-synthetic-delivery';
  await state.foundation.importJsonExport(Buffer.from(JSON.stringify(secondInput)));
  const pack = await state.packs.finalize({
    contractVersion: '1.0.0', packKey: 'analysis:multi-evidence', version: 1, purpose: 'Multiple evidence lineage.', observationIds: first.observationIds.map(String),
  });
  const frozen = await state.packs.replay(pack.packId);
  assert.ok(frozen.observations.every((observation) => observation.evidence.length === 2));

  state.db.prepare("UPDATE foundation_products SET product_name = 'MUTATED CURRENT NAME'").run();
  state.db.prepare("UPDATE foundation_observations SET integer_value = 1 WHERE metric_code IN ('period_revenue_vnd', 'units_sold')").run();
  const result = await state.analysis.replay((await state.analysis.calculate(request(pack.packId))).resultId);
  assert.equal(result.totals.periodRevenueVndTotal, '9007199296740991');
  assert.equal(result.totals.periodUnitsSoldTotal, '84');
  assert.deepEqual(result.coverage, {
    selectedObservationCount: 6,
    uniqueProductCount: 2,
    periodRevenueObservedProductCount: 2,
    periodUnitsSoldObservedProductCount: 2,
  });
  state.db.close();
});

test('same calculation is idempotent and invalid, missing, or unsupported inputs write nothing', async () => {
  const state = setup();
  const { pack } = await importAndPack(state);
  const first = await state.analysis.calculate(request(pack.packId));
  const artifactsAfterFirst = count(state.db, 'artifact_manifests');
  const second = await state.analysis.calculate(request(pack.packId));
  assert.equal(second.deduplicated, true);
  assert.equal(second.resultId, first.resultId);
  assert.equal(second.resultArtifactSha256, first.resultArtifactSha256);
  assert.equal(count(state.db, 'analysis_results'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), artifactsAfterFirst);

  await assert.rejects(state.analysis.calculate({ ...request(pack.packId), calculationVersion: 2 }), AnalysisValidationError);
  await assert.rejects(state.analysis.calculate(request(randomUUID())), /Finalized Data Pack not found/);
  const nonFinalizedPackId = randomUUID();
  state.db.prepare(
    `INSERT INTO foundation_data_packs(
       pack_id, pack_key, version, purpose, request_sha256,
       manifest_artifact_sha256, supersedes_pack_id, finalized_at
     ) VALUES (?, 'analysis:non-finalized', 1, 'Non-finalized probe.', ?, ?, NULL, NULL)`,
  ).run(nonFinalizedPackId, '0'.repeat(64), pack.manifestArtifactSha256);
  const beforeNonFinalizedArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(state.analysis.calculate(request(nonFinalizedPackId)), /Finalized Data Pack not found/);
  assert.equal(count(state.db, 'analysis_results'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), beforeNonFinalizedArtifacts);

  const imported = await state.foundation.importJsonExport(fs.readFileSync(fixturePath));
  const ignoredIds = imported.observationIds.filter((id) => {
    const code = state.foundation.getLineage(id).metricCode;
    return code !== 'period_revenue_vnd' && code !== 'units_sold';
  });
  const ignoredPack = await state.packs.finalize({
    contractVersion: '1.0.0', packKey: 'analysis:unsupported-only', version: 1, purpose: 'Unsupported metrics only.', observationIds: ignoredIds.map(String),
  });
  const beforeUnsupportedArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(state.analysis.calculate(request(ignoredPack.packId)), /no supported/);
  assert.equal(count(state.db, 'analysis_results'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), beforeUnsupportedArtifacts);
  state.db.close();
});

test('Result rows are immutable and replay detects missing, corrupt, and metadata-mismatched artifacts', async () => {
  const immutable = setup();
  const { pack } = await importAndPack(immutable);
  const execution = await immutable.analysis.calculate(request(pack.packId));
  assert.throws(() => immutable.db.prepare('UPDATE analysis_results SET completed_at = ? WHERE result_id = ?').run('rewrite', execution.resultId), /analysis_result_immutable/);
  assert.throws(() => immutable.db.prepare('DELETE FROM analysis_results WHERE result_id = ?').run(execution.resultId), /analysis_result_immutable/);
  immutable.db.exec('DROP TRIGGER analysis_results_no_update');
  immutable.db.prepare('UPDATE analysis_results SET request_sha256 = ? WHERE result_id = ?').run('0'.repeat(64), execution.resultId);
  await assert.rejects(immutable.analysis.replay(execution.resultId), /does not match immutable database metadata/);
  immutable.db.close();

  const manifestMismatch = setup();
  const manifestMismatchPack = (await importAndPack(manifestMismatch)).pack;
  const manifestMismatchResult = await manifestMismatch.analysis.calculate(request(manifestMismatchPack.packId));
  manifestMismatch.db.exec('DROP TRIGGER analysis_results_no_update');
  const manifestRow = manifestMismatch.db.prepare(
    `SELECT result_artifact_sha256 AS digest FROM analysis_results WHERE result_id = ?`,
  ).get(manifestMismatchResult.resultId) as { digest: string };
  manifestMismatch.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('text/plain', manifestRow.digest);
  await assert.rejects(manifestMismatch.analysis.replay(manifestMismatchResult.resultId), /artifact manifest metadata mismatch/);
  manifestMismatch.db.close();

  const missing = setup();
  const missingPack = (await importAndPack(missing)).pack;
  const missingResult = await missing.analysis.calculate(request(missingPack.packId));
  await fsp.rm(missing.artifacts.pathForDigest(missingResult.resultArtifactSha256));
  await assert.rejects(missing.analysis.replay(missingResult.resultId), /ENOENT/);
  missing.db.close();

  const corrupt = setup();
  const corruptPack = (await importAndPack(corrupt)).pack;
  const corruptResult = await corrupt.analysis.calculate(request(corruptPack.packId));
  await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptResult.resultArtifactSha256), Buffer.from('{}'));
  await assert.rejects(corrupt.analysis.replay(corruptResult.resultId), ArtifactIntegrityError);
  corrupt.db.close();

  const mismatch = setup();
  const mismatchPack = (await importAndPack(mismatch)).pack;
  const mismatchResult = await mismatch.analysis.calculate(request(mismatchPack.packId));
  const bytes = await mismatch.artifacts.read(mismatchResult.resultArtifactSha256);
  const parsed = JSON.parse(bytes.toString('utf8'));
  parsed.resultId = randomUUID();
  const replacement = Buffer.from(canonicalJson(parsed));
  const digest = createHash('sha256').update(replacement).digest('hex');
  const relativePath = `sha256/${digest.slice(0, 2)}/${digest}`;
  await fsp.mkdir(path.dirname(mismatch.artifacts.pathForDigest(digest)), { recursive: true });
  await fsp.writeFile(mismatch.artifacts.pathForDigest(digest), replacement, { mode: 0o600 });
  mismatch.db.prepare(
    `INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
     VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)`,
  ).run(digest, replacement.byteLength, relativePath, '2026-09-07T11:00:00.000Z', '2026-09-07T11:00:00.000Z');
  const secondPack = await mismatch.packs.finalize({
    contractVersion: '1.0.0',
    packKey: 'analysis:metadata-mismatch-second-pack',
    version: 1,
    purpose: 'Second pack for metadata mismatch replay.',
    observationIds: mismatchPack.observationIds.map(String),
  });
  const alternateResultId = randomUUID();
  mismatch.db.prepare(
    `INSERT INTO analysis_results(result_id, data_pack_id, calculation_key, calculation_version, request_sha256, result_artifact_sha256, completed_at)
     VALUES (?, ?, 'market_snapshot_v1', 1, ?, ?, ?)`,
  ).run(alternateResultId, secondPack.packId, '0'.repeat(64), digest, '2026-09-07T11:00:00.000Z');
  await assert.rejects(mismatch.analysis.replay(alternateResultId), AnalysisIdentityConflictError);
  mismatch.db.close();
});

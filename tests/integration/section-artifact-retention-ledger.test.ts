import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  SectionArtifactRetentionConflictError,
  SectionArtifactRetentionLedgerService,
  SectionArtifactRetentionValidationError,
} from '../../src/modules/analysis/section-artifact-retention-ledger.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import {
  artifactByteSha256,
  m03SectionRetentionFixture,
  seedSyntheticPreparation,
} from '../fixtures/m03-section-retention-synthetic.js';

const temporaryRoots: string[] = [];
const databases: ReturnType<typeof openDatabase>['db'][] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) if (database.open) database.close();
  await Promise.all(temporaryRoots.splice(0).map(directory => fsp.rm(directory, { recursive: true, force: true })));
});

// Test-authoring gate: this is the single persistence/replay owner for A37.
// A32-A36 retain ownership of calculation, charts, citations, prose and HTML.
test('retains exact M03 section bytes, retries without mutation, and recovers only a missing canonical member', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-section-retention-'));
  temporaryRoots.push(directory);
  const opened = openDatabase({ databasePath: path.join(directory, 'retention.sqlite') });
  databases.push(opened.db);
  const fixture = m03SectionRetentionFixture();
  seedSyntheticPreparation(opened.db, fixture);
  const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
  const service = new SectionArtifactRetentionLedgerService({
    db: opened.db,
    artifactStore: artifacts,
    now: () => new Date('2026-09-30T01:00:00.000Z'),
  });

  const created = await service.retain(fixture.request, fixture.bytes);
  assert.equal(created.deduplicated, false);
  assert.ok(created.databaseMutations > 0);
  assert.equal(count(opened.db, 'analysis_section_artifacts'), 1n);
  assert.equal(count(opened.db, 'analysis_section_artifact_members'), 6n);

  const verified = await service.read(created.sectionArtifactSha256);
  assert.equal(verified.html, fixture.rendered.html);
  assert.equal(verified.record.members.metricSet.artifactSha256, artifactByteSha256(fixture.bytes.metricSet));
  assert.equal(verified.record.members.receipt.artifactSha256, artifactByteSha256(fixture.bytes.receipt));
  assert.equal(verified.record.members.html.artifactSha256, fixture.request.htmlSha256);

  const retry = await service.retain(fixture.request, fixture.bytes);
  assert.deepEqual(retry, { ...created, deduplicated: true, databaseMutations: 0 });
  assert.equal(count(opened.db, 'analysis_section_artifacts'), 1n);
  assert.equal(count(opened.db, 'analysis_section_artifact_members'), 6n);

  const changedRepresentation = {
    ...fixture.bytes,
    metricSet: Buffer.from(JSON.stringify(fixture.chain.metricSet, null, 2), 'utf8'),
  };
  await assert.rejects(
    service.retain(fixture.request, changedRepresentation),
    (error: unknown) => error instanceof SectionArtifactRetentionConflictError && /metric_set/.test(error.message),
  );
  assert.equal(count(opened.db, 'analysis_section_artifacts'), 1n);

  const oversized = {
    ...fixture.bytes,
    metricSet: Buffer.concat([fixture.bytes.metricSet, Buffer.alloc(8 * 1024 * 1024, 0x20)]),
  };
  await assert.rejects(
    service.retain(fixture.request, oversized),
    (error: unknown) => error instanceof SectionArtifactRetentionValidationError && /maximum retained size/.test(error.message),
  );
  assert.equal(count(opened.db, 'analysis_section_artifacts'), 1n);

  const receiptPath = artifacts.pathForDigest(verified.record.members.receipt.artifactSha256);
  await fsp.rm(receiptPath);
  const recovered = await service.retain(fixture.request, fixture.bytes);
  assert.equal(recovered.deduplicated, true);
  assert.equal(recovered.databaseMutations, 0);
  assert.equal(artifactByteSha256(await fsp.readFile(receiptPath)), verified.record.members.receipt.artifactSha256);
  assert.equal((await service.read(created.sectionArtifactSha256)).html, fixture.rendered.html);

  assert.throws(
    () => opened.db.prepare('UPDATE analysis_section_artifacts SET retained_at = ? WHERE section_artifact_sha256 = ?')
      .run('2026-10-01T00:00:00.000Z', created.sectionArtifactSha256),
    /immutable/,
  );
});

test('migration 0037 upgrades v36 once and creates an empty immutable section-artifact ledger', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-section-retention-migration-'));
  temporaryRoots.push(directory);
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  const prior = fs.readdirSync('migrations').filter(name => /^00(?:0[1-9]|[12][0-9]|3[0-6])_/.test(name)).sort();
  assert.equal(prior.length, 36);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(migrationsDirectory, name));
  const databasePath = path.join(directory, 'upgrade.sqlite');
  const v36 = openDatabase({ databasePath, migrationsDirectory });
  assert.equal(v36.migration.currentVersion, 36);
  v36.db.close();
  fs.copyFileSync(
    'migrations/0037_analysis_section_artifacts.sql',
    path.join(migrationsDirectory, '0037_analysis_section_artifacts.sql'),
  );
  const v37 = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(v37.migration.applied, [37]);
  assert.equal(v37.migration.currentVersion, 37);
  assert.equal(count(v37.db, 'analysis_section_artifacts'), 0n);
  assert.equal(count(v37.db, 'analysis_section_artifact_members'), 0n);
  v37.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 37);
  rerun.db.close();
});

function count(db: ReturnType<typeof openDatabase>['db'], table: string): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}

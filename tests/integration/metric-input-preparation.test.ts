import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import { MetricInputPreparationService } from '../../src/modules/analysis/metric-input-preparation-service.js';
import { normalizeMetricWorkbookInput } from '../../src/modules/analysis/metric-source-profile.js';
import { FoundationSourcePackageReader, SourcePackageService } from '../../src/modules/foundation/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporaryRoots: string[] = [];
const databases: ReturnType<typeof openDatabase>['db'][] = [];
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

afterEach(async () => {
  for (const database of databases.splice(0)) if (database.open) database.close();
  await Promise.all(temporaryRoots.splice(0).map(directory => fsp.rm(directory, { recursive: true, force: true })));
});

function workbookFixture(): Buffer {
  const result = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    cwd: root,
    input: JSON.stringify({ cells: { D2: null } }),
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr.toString('utf8'));
  return result.stdout;
}

function sourceManifest(workbook: Buffer): Buffer {
  return Buffer.from(JSON.stringify({
    contractVersion: '1.0.0',
    profileId: 'metric-shopee-product-list-sheet1-v1',
    profileVersion: '1.0.0',
    source: {
      sha256: sha256(workbook), label: 'Synthetic preparation workbook',
      provenanceBasis: 'Synthetic integration fixture only', evidenceFamily: 'synthetic-metric-preparation',
      sheetName: 'Sheet1',
      headerSha256: '8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba',
      lastRow: 3,
    },
    scope: {
      key: 'synthetic-preparation', platform: 'shopee', selection: 'ON',
      start: '2026-08-17', end: '2026-09-15', periodBasis: 'Synthetic declared period',
      acquiredAt: '2026-09-16T01:00:00.000Z',
    },
    precision: { revenue: 'unknown', units: 'unknown' },
    labelCodebookVersion: 'synthetic-preparation-v1',
    wideUnknownPolicy: 'exclude',
  }), 'utf8');
}

function labelSidecar(workbook: Buffer, manifest: Buffer): Buffer {
  const normalized = normalizeMetricWorkbookInput(workbook, manifest);
  return Buffer.from(JSON.stringify({
    contractVersion: '1.0.0',
    sourceSha256: normalized.receipt.sourceSha256,
    codebookVersion: 'synthetic-preparation-v1',
    provenanceBasis: 'Synthetic labels used only to verify UNKNOWN preservation',
    rows: normalized.receipt.evidence.map((evidence, index) => ({
      row: evidence.row,
      rowSha256: evidence.rowSha256,
      shopId: evidence.shopId,
      listingId: evidence.listingId,
      contentSha256: evidence.contentSha256,
      classification: index === 0 ? 'UNKNOWN' : 'CORE_CANDIDATE',
      group: index === 0 ? 'UNKNOWN' : 'Synthetic core',
      methodVersion: 'synthetic-preparation-v1',
      adjudication: 'unknown',
    })),
  }), 'utf8');
}

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-metric-preparation-'));
  temporaryRoots.push(directory);
  const opened = openDatabase({ databasePath: path.join(directory, 'preparation.sqlite') });
  databases.push(opened.db);
  const artifactRoot = path.join(directory, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const packages = new SourcePackageService({
    db: opened.db, artifactStore: artifacts, now: () => new Date('2026-10-02T01:00:00.000Z'),
  });
  const workspaces = new DiscoveryWorkspaceService({
    db: opened.db, artifactStore: artifacts, now: () => new Date('2026-10-02T02:00:00.000Z'),
    uuid: () => '11111111-1111-4111-8111-111111111111',
  });
  const workbook = workbookFixture();
  const manifest = sourceManifest(workbook);
  const labels = labelSidecar(workbook, manifest);
  const files = [
    {
      path: 'metric/workbook.xlsx', bytes: workbook,
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      representationRole: 'structured' as const, independence: 'non_independent' as const,
      provenanceBasis: 'Generated fixture; not provider evidence',
    },
    {
      path: 'metric/manifest.json', bytes: manifest, mediaType: 'application/json',
      representationRole: 'derived' as const, independence: 'non_independent' as const,
      provenanceBasis: 'Generated source declaration',
    },
    {
      path: 'metric/labels.json', bytes: labels, mediaType: 'application/json',
      representationRole: 'derived' as const, independence: 'non_independent' as const,
      provenanceBasis: 'Generated classification sidecar',
    },
  ];
  const sourcePackage = await packages.intake({
    contractVersion: '1.0.0', packageKey: 'metric:synthetic-preparation', version: 1,
    sourceAcquiredAt: null, sourceLabel: 'Synthetic normalized preparation package',
    files: files.map(file => ({
      path: file.path, sha256: sha256(file.bytes), byteSize: file.bytes.length, mediaType: file.mediaType,
      evidenceFamily: 'synthetic-metric-preparation', representationRole: file.representationRole,
      independence: file.independence, providerProvenance: 'synthetic' as const,
      provenanceBasis: file.provenanceBasis,
    })),
  }, new Map(files.map(file => [file.path, file.bytes])));
  const workspace = await workspaces.createWorkspace({
    contractVersion: '1.0.0', workspaceKey: 'synthetic-metric-preparation',
    title: 'Synthetic metric preparation',
  });
  const service = new MetricInputPreparationService({
    db: opened.db,
    artifactStore: artifacts,
    sourcePackages: new FoundationSourcePackageReader(packages),
    workspaces: new FlowDiscoveryWorkspaceReader(workspaces),
    now: () => new Date('2026-10-02T03:00:00.000Z'),
  });
  const request = {
    contractVersion: '1.0.0' as const,
    workspaceId: workspace.workspaceId,
    packageId: sourcePackage.packageId,
    packageManifestSha256: sourcePackage.manifestArtifactSha256,
    workbookPath: 'metric/workbook.xlsx',
    manifestPath: 'metric/manifest.json',
    labelsPath: 'metric/labels.json',
  };
  return { db: opened.db, artifacts, service, request };
}

function count(db: ReturnType<typeof openDatabase>['db'], table: string): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}

test('prepares and replays one exact normalized dataset before any calculation or report', async () => {
  const state = await fixture();
  const created = await state.service.prepare(state.request);
  assert.equal(created.deduplicated, false);
  assert.ok(created.databaseMutations > 0);
  const verified = await state.service.readVerified(created.preparationSha256);
  assert.equal(verified.result.normalizedInput.artifactSha256, created.normalizedInputSha256);
  assert.equal(verified.input.records[0]!.units.state, 'missing');
  assert.equal(verified.input.records[0]!.units.value, null);
  assert.equal(verified.input.records[1]!.units.state, 'observed_zero');
  assert.equal(verified.input.records[1]!.units.value, '0');
  assert.equal(verified.input.records[0]!.label!.classification, 'UNKNOWN');
  assert.equal(verified.input.wideUnknownPolicy, 'exclude');
  assert.equal(count(state.db, 'analysis_metric_input_preparations'), 1n);
  assert.equal(count(state.db, 'analysis_metric_datasets'), 1n);
  assert.equal(count(state.db, 'analysis_report_versions'), 0n);

  const retried = await state.service.prepare({ ...state.request });
  assert.deepEqual(retried, { ...created, deduplicated: true, databaseMutations: 0 });
  assert.equal(count(state.db, 'analysis_metric_input_preparations'), 1n);
  assert.equal(count(state.db, 'analysis_metric_datasets'), 1n);

  await assert.rejects(
    state.service.prepare({ ...state.request, labelsPath: state.request.workbookPath }),
    /SELECTED_PATHS_NOT_DISTINCT/,
  );
  assert.equal(count(state.db, 'analysis_metric_input_preparations'), 1n);

  await fsp.writeFile(state.artifacts.pathForDigest(created.normalizedInputSha256), Buffer.from('{}\n'));
  await assert.rejects(state.service.readVerified(created.preparationSha256), /digest|integrity/i);
});

test('migration 0036 upgrades v35 once and preserves an empty immutable preparation ledger', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-metric-preparation-migration-'));
  temporaryRoots.push(directory);
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  const prior = fs.readdirSync('migrations').filter(name => /^00(?:0[1-9]|[12][0-9]|3[0-5])_/.test(name)).sort();
  assert.equal(prior.length, 35);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(migrationsDirectory, name));
  const databasePath = path.join(directory, 'upgrade.sqlite');
  const v35 = openDatabase({ databasePath, migrationsDirectory });
  assert.equal(v35.migration.currentVersion, 35);
  v35.db.close();
  fs.copyFileSync(
    'migrations/0036_analysis_metric_input_preparations.sql',
    path.join(migrationsDirectory, '0036_analysis_metric_input_preparations.sql'),
  );
  const v36 = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(v36.migration.applied, [36]);
  assert.equal(v36.migration.currentVersion, 36);
  assert.equal(count(v36.db, 'analysis_metric_input_preparations'), 0n);
  v36.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 36);
  rerun.db.close();
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import {
  FoundationSourcePackageReader,
  SourcePackageService,
} from '../../src/modules/foundation/index.js';
import {
  DiscoveryWorkspaceService,
  FlowDiscoveryWorkspaceReader,
} from '../../src/modules/flow/index.js';
import {
  ReportVersionIdentityConflictError,
  ReportVersionIntegrityError,
  ReportVersionService,
  ReportVersionValidationError,
} from '../../src/modules/analysis/report-version-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tempRoots: string[] = [];
const databases: ReturnType<typeof openDatabase>['db'][] = [];
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

afterEach(async () => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  await Promise.all(tempRoots.splice(0).map(directory => fsp.rm(directory, { recursive: true, force: true })));
});

function workbookFixture(): Buffer {
  const result = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    cwd: root,
    input: '{}',
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
      sha256: sha256(workbook), label: 'Synthetic report workbook',
      provenanceBasis: 'Synthetic integration fixture only', evidenceFamily: 'synthetic-metric',
      sheetName: 'Sheet1',
      headerSha256: '8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba',
      lastRow: 3,
    },
    scope: {
      key: 'synthetic', platform: 'shopee', selection: 'ON',
      start: '2026-08-17', end: '2026-09-15',
      periodBasis: 'Synthetic declared period', acquiredAt: '2026-09-16T01:00:00+07:00',
    },
    precision: { revenue: 'unknown', units: 'unknown' },
    labelCodebookVersion: 'synthetic-v1',
    wideUnknownPolicy: 'exclude',
  }), 'utf8');
}

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-report-version-'));
  tempRoots.push(directory);
  const opened = openDatabase({
    databasePath: path.join(directory, 'report.sqlite'),
    now: () => new Date('2026-10-01T00:00:00.000Z'),
  });
  databases.push(opened.db);
  const artifactRoot = path.join(directory, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const sourcePackages = new SourcePackageService({
    db: opened.db, artifactStore: artifacts, now: () => new Date('2026-10-01T01:00:00.000Z'),
  });
  const workspaces = new DiscoveryWorkspaceService({
    db: opened.db, artifactStore: artifacts, now: () => new Date('2026-10-01T02:00:00.000Z'),
    uuid: () => '11111111-1111-4111-8111-111111111111',
  });
  const workbook = workbookFixture();
  const manifest = sourceManifest(workbook);
  const sourcePackage = await sourcePackages.intake({
    contractVersion: '1.0.0', packageKey: 'metric:synthetic-versioned-report', version: 1,
    sourceAcquiredAt: null, sourceLabel: 'Synthetic versioned report package',
    files: [
      {
        path: 'metric/workbook.xlsx', sha256: sha256(workbook), byteSize: workbook.length,
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        evidenceFamily: 'synthetic-metric', representationRole: 'structured', independence: 'non_independent',
        providerProvenance: 'synthetic', provenanceBasis: 'Generated fixture; not provider evidence',
      },
      {
        path: 'metric/manifest.json', sha256: sha256(manifest), byteSize: manifest.length,
        mediaType: 'application/json', evidenceFamily: 'synthetic-metric', representationRole: 'derived',
        independence: 'non_independent', providerProvenance: 'synthetic',
        provenanceBasis: 'Generated fixture declaration',
      },
    ],
  }, new Map([['metric/workbook.xlsx', workbook], ['metric/manifest.json', manifest]]));
  const workspace = await workspaces.createWorkspace({
    contractVersion: '1.0.0', workspaceKey: 'synthetic-versioned-report', title: 'Synthetic report ledger',
  });
  const catalogBytes = canonicalBytes(catalog);
  const sourceRequest = {
    contractVersion: '1.0.0' as const,
    workspaceId: workspace.workspaceId,
    packageId: sourcePackage.packageId,
    packageManifestSha256: sourcePackage.manifestArtifactSha256,
    workbookPath: 'metric/workbook.xlsx',
    manifestPath: 'metric/manifest.json',
    labelsPath: null,
    catalogSha256: sha256(catalogBytes),
  };
  const ids = [
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ];
  const service = new ReportVersionService({
    db: opened.db,
    artifactStore: artifacts,
    dependencies: {
      sourcePackages: new FoundationSourcePackageReader(sourcePackages),
      workspaces: new FlowDiscoveryWorkspaceReader(workspaces),
    },
    now: () => new Date('2026-10-01T03:00:00.000Z'),
    uuid: () => ids.shift()!,
  });
  const request = {
    contractVersion: '1.0.0' as const,
    reportKey: 'synthetic-market-report',
    version: 1,
    previousSemanticVersionId: null,
    sourceRequest,
  };
  return { db: opened.db, artifacts, artifactRoot, service, request, catalogBytes };
}

function count(db: ReturnType<typeof openDatabase>['db'], table: string): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}

function artifactTree(rootDirectory: string): string {
  const rows: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) rows.push(`${path.relative(rootDirectory, absolute)}:${sha256(fs.readFileSync(absolute))}`);
    }
  };
  visit(rootDirectory);
  return rows.sort().join('\n');
}

test('persists one exact unreviewed report version and replays it without read-side writes', async () => {
  const state = await fixture();
  const created = await state.service.createVersion(state.request, state.catalogBytes);
  assert.equal(created.version, 1);
  assert.equal(created.deduplicated, false);
  assert.ok(created.databaseMutations > 0);

  const record = await state.service.readVersion(created.reportId, 1);
  assert.equal(record.semanticVersionId, created.semanticVersionId);
  assert.equal(record.interpretationState, 'NONE');
  assert.equal(record.reviewState, 'UNREVIEWED');
  assert.match(record.workspaceSnapshotSha256, /^[0-9a-f]{64}$/);
  assert.match(record.sourcePackageManifestSha256, /^[0-9a-f]{64}$/);
  assert.match(record.packageContentSha256, /^[0-9a-f]{64}$/);
  assert.equal(
    record.semanticContentSha256,
    record.artifacts.find(item => item.fileName === 'semantic-content.json')?.sha256,
  );
  assert.equal(record.selectedSources.length, 2);
  assert.ok(record.artifacts.some(item => item.fileName === 'report.html'));
  assert.ok(record.artifacts.some(item => item.fileName === 'export-manifest.json'));
  assert.ok(record.artifacts.some(item => item.fileName === 'raw-workbook.xlsx'));

  const changesBefore = (state.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  const filesBefore = artifactTree(state.artifactRoot);
  const retry = await state.service.createVersion(state.request, state.catalogBytes);
  const replay = await state.service.readVersion(created.reportId, 1);
  const changesAfter = (state.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  assert.equal(retry.versionId, created.versionId);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.databaseMutations, 0);
  assert.equal(replay.versionId, created.versionId);
  assert.equal(changesAfter, changesBefore);
  assert.equal(artifactTree(state.artifactRoot), filesBefore);

  await assert.rejects(
    state.service.createVersion(state.request, Buffer.from('not-the-declared-catalog', 'utf8')),
    ReportVersionValidationError,
  );
});

test('requires an explicit semantic predecessor and preserves every historical version', async () => {
  const state = await fixture();
  const first = await state.service.createVersion(state.request, state.catalogBytes);
  const changedCatalog = JSON.parse(JSON.stringify(catalog)) as typeof catalog;
  changedCatalog.catalogVersion = '0.1.1';
  changedCatalog.sections[0]!.title = 'Kết luận chính — phiên bản thử nghiệm';
  const changedCatalogBytes = canonicalBytes(changedCatalog);
  const secondRequest = {
    ...state.request,
    version: 2,
    previousSemanticVersionId: first.semanticVersionId,
    sourceRequest: { ...state.request.sourceRequest, catalogSha256: sha256(changedCatalogBytes) },
  };

  await assert.rejects(
    state.service.createVersion({ ...secondRequest, previousSemanticVersionId: '0'.repeat(64) }, changedCatalogBytes),
    ReportVersionValidationError,
  );
  await assert.rejects(
    state.service.createVersion({
      ...secondRequest,
      sourceRequest: { ...secondRequest.sourceRequest, workspaceId: '99999999-9999-4999-8999-999999999999' },
    }, changedCatalogBytes),
    ReportVersionIdentityConflictError,
  );
  const second = await state.service.createVersion(secondRequest, changedCatalogBytes);
  assert.notEqual(second.semanticVersionId, first.semanticVersionId);
  const history = await state.service.readHistory(first.reportId);
  assert.deepEqual(history.map(item => item.version), [1, 2]);
  assert.equal(history[0]!.semanticVersionId, first.semanticVersionId);
  assert.equal(history[1]!.previousSemanticVersionId, first.semanticVersionId);

  const artifact = history[0]!.artifacts[0]!;
  assert.throws(() => state.db.prepare(`
    INSERT INTO analysis_report_version_artifacts(
      report_id, version, file_name, artifact_sha256, media_type, byte_size
    ) VALUES (?, 1, 'late-file.json', ?, 'application/json', ?)
  `).run(first.reportId, artifact.sha256, artifact.byteSize), /artifact_frozen/);
  const source = history[0]!.selectedSources[0]!;
  assert.throws(() => state.db.prepare(`
    INSERT INTO analysis_report_version_sources(
      report_id, version, ordinal, role, logical_path, source_sha256
    ) VALUES (?, 1, 19, 'labels', 'late-labels.json', ?)
  `).run(first.reportId, source.sha256), /source_frozen/);
});

test('fails closed on changed identity and on a missing immutable artifact', async () => {
  const state = await fixture();
  const created = await state.service.createVersion(state.request, state.catalogBytes);
  await assert.rejects(
    state.service.createVersion({ ...state.request, sourceRequest: { ...state.request.sourceRequest, labelsPath: 'labels.json' } }, state.catalogBytes),
    ReportVersionIdentityConflictError,
  );

  const record = await state.service.readVersion(created.reportId, 1);
  const semantic = record.artifacts.find(item => item.fileName === 'semantic-content.json')!;
  fs.rmSync(state.artifacts.pathForDigest(semantic.sha256));
  await assert.rejects(state.service.readVersion(created.reportId, 1), ReportVersionIntegrityError);
  assert.equal(count(state.db, 'analysis_report_versions'), 1n);
  assert.equal(count(state.db, 'analysis_report_version_artifacts'), BigInt(record.artifacts.length));
});

test('offline CLI creates the same bounded ledger receipt without AI or provider calls', async () => {
  const state = await fixture();
  const directory = path.dirname(state.db.name);
  const databasePath = state.db.name;
  const requestPath = path.join(directory, 'report-request.json');
  const catalogPath = path.join(directory, 'section-catalog.json');
  fs.writeFileSync(requestPath, JSON.stringify(state.request));
  fs.writeFileSync(catalogPath, state.catalogBytes);
  state.db.close();

  const run = spawnSync(process.execPath, [
    '--import', 'tsx', 'scripts/create-report-version.ts',
    databasePath, state.artifactRoot, requestPath, catalogPath,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(run.stdout) as {
    version: number; deduplicated: boolean; aiCalls: number; providerCalls: number;
    interpretationState: string; reviewState: string;
  };
  assert.deepEqual(
    [receipt.version, receipt.deduplicated, receipt.aiCalls, receipt.providerCalls, receipt.interpretationState, receipt.reviewState],
    [1, false, 0, 0, 'NONE', 'UNREVIEWED'],
  );

  const reopened = openDatabase({ databasePath });
  databases.push(reopened.db);
  assert.equal(count(reopened.db, 'analysis_report_versions'), 1n);
});

test('upgrades an existing v29 database to v30 exactly once', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-report-version-migration-'));
  tempRoots.push(directory);
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  const prior = fs.readdirSync('migrations')
    .filter(name => /^00(?:0[1-9]|1[0-9]|2[0-9])_/.test(name))
    .sort();
  assert.equal(prior.length, 29);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(migrationsDirectory, name));
  const databasePath = path.join(directory, 'report.sqlite');
  const v29 = openDatabase({ databasePath, migrationsDirectory });
  assert.equal(v29.migration.currentVersion, 29);
  v29.db.close();

  fs.copyFileSync('migrations/0030_analysis_report_versions.sql', path.join(migrationsDirectory, '0030_analysis_report_versions.sql'));
  const v30 = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(v30.migration.applied, [30]);
  assert.equal(v30.migration.currentVersion, 30);
  assert.equal(count(v30.db, 'analysis_report_versions'), 0n);
  v30.db.close();

  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 30);
  rerun.db.close();
});

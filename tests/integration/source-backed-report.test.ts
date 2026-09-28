import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import BetterSqlite3 from 'better-sqlite3';
import { JSDOM } from 'jsdom';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import {
  FoundationSourcePackageReader,
  SourcePackageService,
} from '../../src/modules/foundation/index.js';
import {
  DiscoveryWorkspaceService,
  FlowDiscoveryWorkspaceReader,
} from '../../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import type { ArtifactReadOptions } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildSourceBackedReport, type SourceBackedReportDependencies } from '../../src/modules/analysis/source-backed-report.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tempRoots: string[] = [];
const databases: ReturnType<typeof openDatabase>['db'][] = [];

class CountingArtifactStore extends ContentAddressedArtifactStore {
  readCount = 0;

  override async read(sha256: string, options?: ArtifactReadOptions): Promise<Buffer> {
    this.readCount++;
    return super.read(sha256, options);
  }
}

afterEach(async () => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  await Promise.all(tempRoots.splice(0).map(directory => fsp.rm(directory, { recursive: true, force: true })));
});

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value), 'utf8');
const readBudget = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } as const;

function workbookFixture(): Buffer {
  const result = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    cwd: root,
    input: '{}',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr.toString('utf8'));
  return result.stdout;
}

function sourceManifest(workbook: Buffer): object {
  return {
    contractVersion: '1.0.0',
    profileId: 'metric-shopee-product-list-sheet1-v1',
    profileVersion: '1.0.0',
    source: {
      sha256: sha256(workbook),
      label: 'Synthetic report workbook',
      provenanceBasis: 'Synthetic integration fixture only',
      evidenceFamily: 'synthetic-metric',
      sheetName: 'Sheet1',
      headerSha256: '8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba',
      lastRow: 3,
    },
    scope: {
      key: 'synthetic',
      platform: 'shopee',
      selection: 'ON',
      start: '2026-08-17',
      end: '2026-09-15',
      periodBasis: 'Synthetic declared period',
      acquiredAt: '2026-09-16T01:00:00+07:00',
    },
    precision: { revenue: 'unknown', units: 'unknown' },
    labelCodebookVersion: 'synthetic-v1',
    wideUnknownPolicy: 'exclude',
  };
}

async function persistedFixture(oversizedMember = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-source-backed-report-'));
  tempRoots.push(directory);
  const opened = openDatabase({
    databasePath: path.join(directory, 'report.sqlite'),
    now: () => new Date('2026-10-01T00:00:00.000Z'),
  });
  databases.push(opened.db);
  const artifacts = new CountingArtifactStore(path.join(directory, 'artifacts'));
  const sourcePackages = new SourcePackageService({
    db: opened.db,
    artifactStore: artifacts,
    now: () => new Date('2026-10-01T01:00:00.000Z'),
  });
  const workspaces = new DiscoveryWorkspaceService({
    db: opened.db,
    artifactStore: artifacts,
    now: () => new Date('2026-10-01T02:00:00.000Z'),
    uuid: () => '11111111-1111-4111-8111-111111111111',
  });
  const workbook = workbookFixture();
  const manifest = jsonBytes(sourceManifest(workbook));
  const oversized = oversizedMember ? Buffer.alloc(readBudget.maxFileBytes + 1, 0x5a) : null;
  const sourcePackage = await sourcePackages.intake({
    contractVersion: '1.0.0',
    packageKey: 'metric:synthetic-report',
    version: 1,
    sourceAcquiredAt: null,
    sourceLabel: 'Synthetic report package',
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
        independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Generated fixture declaration',
      },
      ...(oversized === null ? [] : [{
        path: 'metric/oversized.bin', sha256: sha256(oversized), byteSize: oversized.length,
        mediaType: 'application/octet-stream', evidenceFamily: 'synthetic-metric', representationRole: 'primary',
        independence: 'independent', providerProvenance: 'synthetic', provenanceBasis: 'Generated oversized regression fixture',
      }]),
    ],
  }, new Map([
    ['metric/workbook.xlsx', workbook], ['metric/manifest.json', manifest],
    ...(oversized === null ? [] : [['metric/oversized.bin', oversized] as const]),
  ]));
  const workspace = await workspaces.createWorkspace({
    contractVersion: '1.0.0', workspaceKey: 'synthetic-report', title: 'Synthetic <Report> & "Evidence"',
  });
  const catalogBytes = Buffer.from(canonicalJson(catalog) + '\n', 'utf8');
  const request = {
    contractVersion: '1.0.0',
    workspaceId: workspace.workspaceId,
    packageId: sourcePackage.packageId,
    packageManifestSha256: sourcePackage.manifestArtifactSha256,
    workbookPath: 'metric/workbook.xlsx',
    manifestPath: 'metric/manifest.json',
    labelsPath: null,
    catalogSha256: sha256(catalogBytes),
  } as const;
  const databasePath = path.join(directory, 'report.sqlite');
  const artifactRoot = path.join(directory, 'artifacts');
  const requestPath = path.join(directory, 'request.json');
  const catalogPath = path.join(directory, 'catalog.json');
  fs.writeFileSync(requestPath, JSON.stringify(request));
  fs.writeFileSync(catalogPath, catalogBytes);
  const dependencies: SourceBackedReportDependencies = {
    sourcePackages: new FoundationSourcePackageReader(sourcePackages),
    workspaces: new FlowDiscoveryWorkspaceReader(workspaces),
  };
  return { db: opened.db, artifacts, directory, databasePath, artifactRoot, requestPath, catalogPath, workbook, manifest, request, catalogBytes, dependencies };
}

function databaseReadSnapshot(db: ReturnType<typeof openDatabase>['db']): string {
  const tables = ['artifact_manifests', 'foundation_source_packages', 'foundation_source_package_files', 'flow_discovery_workspaces'];
  const totalChanges = (db.prepare('SELECT total_changes() AS count').get() as { count: bigint }).count;
  return JSON.stringify({
    totalChanges: String(totalChanges),
    rows: tables.map(table => String((db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count)),
  });
}

function fileTreeSnapshot(directory: string): string {
  const entries: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) entries.push(`${path.relative(directory, absolute)}:${sha256(fs.readFileSync(absolute))}`);
    }
  };
  visit(directory);
  return entries.sort().join('\n');
}

test('replays persisted package/workspace bytes into a deterministic evidence envelope without DB writes', async () => {
  const state = await persistedFixture();
  const before = databaseReadSnapshot(state.db);
  const first = await buildSourceBackedReport(state.request, state.catalogBytes, state.dependencies);
  const after = databaseReadSnapshot(state.db);

  assert.equal(after, before);
  assert.equal(first.result.scopes[0]!.revenue.value, '150');
  assert.equal(first.packet.claims.find(claim => claim.claimId === 'M03:all:revenue')?.value, '150');
  const chartPoint = first.charts.totals.scopes[0]!.points.find(point => point.metric === 'revenue');
  assert.equal(chartPoint?.value, '150');
  assert.equal(chartPoint?.metricPointer, '/scopes/0/revenue/value');
  assert.equal(first.envelope.artifacts.metricResultSha256, sha256(first.files.get('metric-result.json')!));
  assert.equal(first.envelope.artifacts.sourcePackageManifestSha256, sha256(first.files.get('source-package-manifest.json')!));
  assert.equal(first.envelope.workspace.snapshotSha256, sha256(first.files.get('workspace.json')!));
  assert.deepEqual(first.files.get('raw-workbook.xlsx'), state.workbook);
  assert.deepEqual(first.files.get('raw-manifest.json'), state.manifest);
  assert.equal(first.envelope.rawByteMappings[0]!.rawByteSha256, sha256(state.workbook));
  assert.equal(first.envelope.selectedSources[0]!.providerProvenance, 'synthetic');
  assert.equal(first.envelope.artifacts.packetSha256, sha256(first.files.get('packet.json')!));
  assert.match(first.envelope.limitations.join('\n'), /DO_NOT_AUTHENTICATE_PROVIDER_COLLECTION/);

  const second = await buildSourceBackedReport(state.request, state.catalogBytes, state.dependencies);
  assert.deepEqual(second.envelopeBytes, first.envelopeBytes);
  assert.equal(second.packet.packetId, first.packet.packetId);
  assert.deepEqual([...second.files.entries()], [...first.files.entries()]);
  assert.equal(databaseReadSnapshot(state.db), before);
});

test('rejects wrong source selectors and corrupt raw bytes before normalization', async () => {
  const state = await persistedFixture();
  await assert.rejects(
    buildSourceBackedReport({ ...state.request, workbookPath: 'metric/manifest.json' }, state.catalogBytes, state.dependencies),
    /SELECTED_PATHS_NOT_DISTINCT|MEDIA_TYPE_MISMATCH/,
  );
  await assert.rejects(
    buildSourceBackedReport({ ...state.request, manifestPath: 'metric/missing.json' }, state.catalogBytes, state.dependencies),
    /FILE_NOT_FOUND/,
  );

  const corrupting: SourceBackedReportDependencies = {
    ...state.dependencies,
    sourcePackages: {
      async readFinalizedSourcePackage(packageId) {
        const packageValue = await state.dependencies.sourcePackages.readFinalizedSourcePackage(packageId);
        return {
          ...packageValue,
          files: packageValue.files.map(file => file.path === state.request.workbookPath
            ? { ...file, bytes: Buffer.from('corrupt') }
            : file),
        };
      },
    },
  };
  await assert.rejects(buildSourceBackedReport(state.request, state.catalogBytes, corrupting), /FILE_BYTES_MISMATCH/);
});

test('rejects a persisted oversized package member before any package artifact is materialized', async () => {
  const state = await persistedFixture(true);
  assert.equal(state.artifacts.readCount, 0);
  const packageReader = state.dependencies.sourcePackages;
  await assert.rejects(
    packageReader.readFinalizedSourcePackage(state.request.packageId, readBudget),
    /FILE_SIZE_LIMIT/,
  );
  assert.equal(state.artifacts.readCount, 0);

  state.artifacts.readCount = 0;
  await assert.rejects(
    buildSourceBackedReport(state.request, state.catalogBytes, state.dependencies),
    /FILE_SIZE_LIMIT/,
  );
  // The workspace reader reads its own small artifact; the source-package reader
  // must reject during metadata preflight and perform no package artifact read.
  assert.equal(state.artifacts.readCount, 1);
});

test('CLI reopens the seeded database read-only, publishes exact links, and escapes persisted workspace text', async () => {
  const state = await persistedFixture();
  state.db.close();
  const baseline = new BetterSqlite3(state.databasePath, { readonly: true, fileMustExist: true });
  baseline.pragma('query_only = ON');
  baseline.defaultSafeIntegers(true);
  const before = databaseReadSnapshot(baseline);
  baseline.close();
  const databaseBytesBefore = fs.readFileSync(state.databasePath);
  const artifactBytesBefore = fileTreeSnapshot(state.artifactRoot);
  const output = path.join(state.directory, 'outside-git-report');
  const run = spawnSync(process.execPath, [
    '--import', 'tsx', 'scripts/export-source-backed-report.ts', state.databasePath, state.artifactRoot,
    state.requestPath, state.catalogPath, output,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const summary = JSON.parse(run.stdout.trim()) as { databaseMutations: number; providerAuthenticity: string; aiCalls: number; providerCalls: number };
  assert.equal(summary.databaseMutations, 0);
  assert.equal(summary.providerAuthenticity, 'NOT_ESTABLISHED');
  assert.equal(summary.aiCalls, 0);
  assert.equal(summary.providerCalls, 0);

  const readonly = new BetterSqlite3(state.databasePath, { readonly: true, fileMustExist: true });
  try {
    readonly.pragma('query_only = ON');
    readonly.defaultSafeIntegers(true);
    assert.equal(databaseReadSnapshot(readonly), before);
  } finally {
    readonly.close();
  }

  const html = fs.readFileSync(path.join(output, 'report.html'), 'utf8');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('h1')?.textContent, 'Synthetic <Report> & "Evidence" · Báo cáo bằng chứng');
  assert.ok(document.querySelector('.meta')?.textContent?.includes('Thu nhận (theo nguồn): 16/09/2026'));
  assert.ok([...document.querySelectorAll('header code')].some(element => element.textContent === '2026-09-16T01:00:00+07:00'));
  assert.ok(html.includes('&lt;Report&gt; &amp; &quot;Evidence&quot;'));
  assert.ok(!html.includes('<Report> & "Evidence"'));
  const links = [...document.querySelectorAll('a[download]')].map(anchor => anchor.getAttribute('href')).filter((href): href is string => href !== null);
  const expected = [
    'raw-workbook.xlsx', 'raw-manifest.json', 'source-package-manifest.json', 'normalized-input.json',
    'receipt.json', 'metric-result.json', 'charts.json', 'packet.json', 'section-catalog.json', 'evidence-envelope.json',
  ];
  assert.deepEqual([...new Set(links)].sort(), [...expected].sort());
  for (const link of links) assert.ok(fs.statSync(path.join(output, link)).isFile(), link);
  assert.equal(links.includes('raw-labels.json'), false);
  for (const anchor of [...document.querySelectorAll('a[href^="#"]')]) {
    const href = anchor.getAttribute('href')!;
    assert.ok(document.getElementById(decodeURIComponent(href.slice(1))), href);
  }
  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(document.querySelector('report'), null);
  assert.ok(fs.statSync(path.join(output, 'evidence-envelope.json')).isFile());
  assert.ok(fs.statSync(path.join(output, 'export-manifest.json')).isFile());
  assert.deepEqual(fs.readFileSync(path.join(output, 'raw-workbook.xlsx')), state.workbook);
  assert.deepEqual(fs.readFileSync(path.join(output, 'raw-manifest.json')), state.manifest);
  assert.deepEqual(fs.readFileSync(state.databasePath), databaseBytesBefore);
  assert.equal(fileTreeSnapshot(state.artifactRoot), artifactBytesBefore);

  const htmlBeforeRetry = fs.readFileSync(path.join(output, 'report.html'));
  const exportManifestBeforeRetry = fs.readFileSync(path.join(output, 'export-manifest.json'));
  const htmlMtimeBeforeRetry = fs.statSync(path.join(output, 'report.html')).mtimeMs;
  const retry = spawnSync(process.execPath, [
    '--import', 'tsx', 'scripts/export-source-backed-report.ts', state.databasePath, state.artifactRoot,
    state.requestPath, state.catalogPath, output,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.equal(retry.status, 0, retry.stderr);
  const retrySummary = JSON.parse(retry.stdout.trim()) as { reused: boolean };
  assert.equal(retrySummary.reused, true);
  assert.deepEqual(fs.readFileSync(path.join(output, 'report.html')), htmlBeforeRetry);
  assert.deepEqual(fs.readFileSync(path.join(output, 'export-manifest.json')), exportManifestBeforeRetry);
  assert.equal(fs.statSync(path.join(output, 'report.html')).mtimeMs, htmlMtimeBeforeRetry);

  const preview = process.env.TDN_RESEARCH_PREVIEW_DIR;
  if (preview) {
    const previewRoot = path.resolve(preview);
    fs.mkdirSync(previewRoot, { recursive: true });
    const target = path.join(previewRoot, 'source-backed-report-fixture');
    fs.cpSync(output, target, { recursive: true, force: false, errorOnExist: true });
  }
});

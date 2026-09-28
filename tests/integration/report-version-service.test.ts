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
  AnalysisReportVersionReader,
  ReportVersionIdentityConflictError,
  ReportVersionIntegrityError,
  ReportVersionService,
  ReportVersionValidationError,
} from '../../src/modules/analysis/report-version-service.js';
import { buildEvidenceBoundReportInterpretation } from '../../src/modules/analysis/report-interpretation.js';
import {
  ReportInterpretationLedgerConflictError,
  ReportInterpretationLedgerIntegrityError,
  ReportInterpretationLedgerService,
  ReportInterpretationLedgerValidationError,
} from '../../src/modules/analysis/report-interpretation-ledger.js';
import { NormalizedMetricObservationStore } from '../../src/modules/analysis/normalized-metric-observation-store.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { createReportApiServer } from '../../src/api/report-api.js';

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

async function interpretationFixture(
  state: Awaited<ReturnType<typeof fixture>>,
  report: { reportId: string; version: number; semanticVersionId: string },
) {
  const reports = new AnalysisReportVersionReader(state.service);
  const source = await reports.readInterpretationSource(report.reportId, report.version);
  const promptText = 'bounded synthetic interpretation prompt';
  const configuration = {
    providerId: 'synthetic-provider', modelId: 'synthetic-model', promptId: 'market-report-interpretation',
    promptVersion: 1, promptText, outputSchemaVersion: '1.0.0' as const,
  };
  const request = {
    contractVersion: '1.0.0', semanticVersionId: report.semanticVersionId,
    packetId: source.bundle.packet.packetId, sectionIds: ['M03'],
  };
  const baseOutput = {
    items: [{
      sectionId: 'M03', kind: 'INTERPRETATION',
      conclusion: 'Doanh thu quan sát tập trung trong toàn bộ phạm vi đã khai báo.',
      evidenceLogic: 'Diễn giải chỉ nối tổng hợp đã xác minh với phạm vi all.',
      supportingClaimIds: ['M03:all:revenue'], assumptions: [],
      limitations: ['Không suy rộng ra toàn thị trường.'],
    }],
  };
  return { reports, source, promptText, configuration, request, baseOutput };
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

test('materializes one immutable row-queryable projection of the exact normalized input', async () => {
  const state = await fixture();
  const created = await state.service.createVersion(state.request, state.catalogBytes);
  const store = new NormalizedMetricObservationStore({
    db: state.db,
    reports: new AnalysisReportVersionReader(state.service),
  });

  const first = await store.materializeReportVersion(created.reportId, created.version);
  assert.equal(first.deduplicated, false);
  assert.equal(first.rowCount, 2);
  assert.equal(first.sourceCount, 2);
  assert.ok(first.databaseMutations > 0);
  const verified = await store.readVerifiedForReport(created.reportId, created.version);
  assert.equal(verified.scope.acquiredAt, '2026-09-16T01:00:00+07:00');
  assert.deepEqual(verified.records.map(row => [row.units.state, row.units.value, row.units.source.locator]), [
    ['observed_value', '2', 'Sheet1!D2'],
    ['observed_zero', '0', 'Sheet1!D3'],
  ]);
  assert.deepEqual(
    state.db.prepare(`
      SELECT record_index recordIndex, units_state unitsState, units_value unitsValue,
             units_source_locator unitsSourceLocator
      FROM analysis_metric_dataset_rows ORDER BY record_index
    `).all(),
    [
      { recordIndex: 0n, unitsState: 'observed_value', unitsValue: '2', unitsSourceLocator: 'Sheet1!D2' },
      { recordIndex: 1n, unitsState: 'observed_zero', unitsValue: '0', unitsSourceLocator: 'Sheet1!D3' },
    ],
  );

  const mutationsBefore = (state.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  const retry = await store.materializeReportVersion(created.reportId, created.version);
  const mutationsAfter = (state.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  assert.equal(retry.normalizedInputSha256, first.normalizedInputSha256);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.databaseMutations, 0);
  assert.equal(mutationsAfter, mutationsBefore);
  assert.throws(
    () => state.db.prepare(`UPDATE analysis_metric_dataset_rows SET units_value = '3' WHERE record_index = 0`).run(),
    /analysis_metric_dataset_row_immutable/,
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

// Test-authoring gate: this integration test owns A13 persistence/replay. A8's
// unit test remains the owner of language and citation-validation cases.
test('retains every evidence-bound interpretation run and replays exact evidence without regeneration', async () => {
  const state = await fixture();
  const report = await state.service.createVersion(state.request, state.catalogBytes);
  const { reports, source, promptText, configuration, request, baseOutput } = await interpretationFixture(state, report);
  const firstBuilt = buildEvidenceBoundReportInterpretation({
    request, output: baseOutput, bundle: source.bundle, configuration,
    telemetry: { providerRequestId: 'synthetic-run-a', inputTokenCount: 10, outputTokenCount: 20, latencyMs: 30 },
    now: () => new Date('2026-10-01T04:00:00.000Z'),
    createId: () => '55555555-5555-4555-8555-555555555555',
  });
  const ledger = new ReportInterpretationLedgerService({
    db: state.db, artifactStore: state.artifacts, reports,
    now: () => new Date('2026-10-01T05:00:00.000Z'),
  });
  const first = await ledger.persist({
    reportId: report.reportId, reportVersion: report.version,
    artifactBytes: firstBuilt.artifactBytes, promptText,
  });
  assert.equal(first.interpretationNumber, 1);
  assert.equal(first.deduplicated, false);
  const filesBeforeRetry = artifactTree(state.artifactRoot);
  const changesBeforeRetry = (state.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count;
  const retry = await ledger.persist({
    reportId: report.reportId, reportVersion: report.version,
    artifactBytes: firstBuilt.artifactBytes, promptText,
  });
  assert.equal(retry.interpretationId, first.interpretationId);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.databaseMutations, 0);
  assert.equal((state.db.prepare('SELECT total_changes() count').get() as { count: bigint }).count, changesBeforeRetry);
  assert.equal(artifactTree(state.artifactRoot), filesBeforeRetry);

  const alternateBuilt = buildEvidenceBoundReportInterpretation({
    request,
    output: {
      items: [{
        ...baseOutput.items[0]!,
        conclusion: 'Phạm vi đã phân loại cho thấy một cách đọc khác của cùng quan sát.',
      }],
    },
    bundle: source.bundle, configuration,
    telemetry: { providerRequestId: 'synthetic-run-b', inputTokenCount: 10, outputTokenCount: 22, latencyMs: 31 },
    now: () => new Date('2026-10-01T04:01:00.000Z'),
    createId: () => '66666666-6666-4666-8666-666666666666',
  });
  const alternate = await ledger.persist({
    reportId: report.reportId, reportVersion: report.version,
    artifactBytes: alternateBuilt.artifactBytes, promptText,
  });
  assert.equal(alternate.interpretationNumber, 2);
  assert.notEqual(alternate.interpretationContentSha256, first.interpretationContentSha256);
  const history = await ledger.list(report.reportId, report.version);
  assert.deepEqual(history.map(item => item.record.interpretationNumber), [1, 2]);
  assert.ok(history[0]!.artifactBytes.equals(firstBuilt.artifactBytes));
  assert.ok(!('chainOfThought' in history[0]!.artifact));
  assert.ok(!('promptText' in history[0]!.artifact.generation));

  const changedCatalog = JSON.parse(JSON.stringify(catalog)) as typeof catalog;
  changedCatalog.catalogVersion = '0.1.1';
  changedCatalog.sections[0]!.title = 'Kết luận chính — phiên bản thử nghiệm';
  const changedCatalogBytes = canonicalBytes(changedCatalog);
  const secondReportVersion = await state.service.createVersion({
    ...state.request,
    version: 2,
    previousSemanticVersionId: report.semanticVersionId,
    sourceRequest: { ...state.request.sourceRequest, catalogSha256: sha256(changedCatalogBytes) },
  }, changedCatalogBytes);
  assert.notEqual(secondReportVersion.semanticVersionId, report.semanticVersionId);
  assert.ok((await ledger.read(report.reportId, 1, first.interpretationId)).artifactBytes.equals(firstBuilt.artifactBytes));
  await assert.rejects(
    ledger.read(report.reportId, 2, first.interpretationId),
    ReportInterpretationLedgerValidationError,
  );

  const failedBuilt = buildEvidenceBoundReportInterpretation({
    request,
    output: {
      items: [{ ...baseOutput.items[0]!, conclusion: 'Diễn giải tổng hợp dùng để kiểm tra rollback artifact.' }],
    },
    bundle: source.bundle, configuration,
    now: () => new Date('2026-10-01T04:02:00.000Z'),
    createId: () => '77777777-7777-4777-8777-777777777777',
  });
  const filesBeforeFailedPersist = artifactTree(state.artifactRoot);
  state.db.exec(`
    CREATE TEMP TRIGGER reject_synthetic_interpretation
    BEFORE INSERT ON analysis_report_interpretation_runs
    BEGIN
      SELECT RAISE(ABORT, 'synthetic interpretation insert failure');
    END
  `);
  try {
    await assert.rejects(ledger.persist({
      reportId: report.reportId, reportVersion: 1,
      artifactBytes: failedBuilt.artifactBytes, promptText,
    }), /synthetic interpretation insert failure/);
  } finally {
    state.db.exec('DROP TRIGGER reject_synthetic_interpretation');
  }
  assert.equal(artifactTree(state.artifactRoot), filesBeforeFailedPersist);
  assert.equal(count(state.db, 'analysis_report_interpretation_runs'), 2n);

  const changedSameIdentity = buildEvidenceBoundReportInterpretation({
    request, output: {
      items: [{ ...baseOutput.items[0]!, conclusion: 'Một diễn giải thay đổi không được ghi đè cùng danh tính.' }],
    },
    bundle: source.bundle, configuration,
    now: () => new Date('2026-10-01T04:00:00.000Z'),
    createId: () => first.interpretationId,
  });
  await assert.rejects(ledger.persist({
    reportId: report.reportId, reportVersion: report.version,
    artifactBytes: changedSameIdentity.artifactBytes, promptText,
  }), ReportInterpretationLedgerConflictError);
  assert.equal(count(state.db, 'analysis_report_interpretation_runs'), 2n);
  assert.throws(
    () => state.db.prepare(`UPDATE analysis_report_interpretation_runs SET model_id = 'changed' WHERE interpretation_id = ?`).run(first.interpretationId),
    /analysis_report_interpretation_immutable/,
  );

  fs.rmSync(state.artifacts.pathForDigest(history[0]!.record.artifactSha256));
  await assert.rejects(
    ledger.read(report.reportId, report.version, first.interpretationId),
    ReportInterpretationLedgerIntegrityError,
  );
});

test('read API lists workspace series, verifies explicit history, and serves only exact member bytes', async () => {
  const state = await fixture();
  const created = await state.service.createVersion(state.request, state.catalogBytes);
  const interpretation = await interpretationFixture(state, created);
  const built = buildEvidenceBoundReportInterpretation({
    request: interpretation.request,
    output: interpretation.baseOutput,
    bundle: interpretation.source.bundle,
    configuration: interpretation.configuration,
    telemetry: { providerRequestId: 'private-provider-request', inputTokenCount: 10, outputTokenCount: 20, latencyMs: 30 },
    now: () => new Date('2026-10-01T04:00:00.000Z'),
    createId: () => '88888888-8888-4888-8888-888888888888',
  });
  const ledger = new ReportInterpretationLedgerService({
    db: state.db, artifactStore: state.artifacts, reports: interpretation.reports,
    now: () => new Date('2026-10-01T05:00:00.000Z'),
  });
  const persisted = await ledger.persist({
    reportId: created.reportId, reportVersion: created.version,
    artifactBytes: built.artifactBytes, promptText: interpretation.promptText,
  });
  const application = createReportApiServer({ databasePath: state.db.name, artifactRoot: state.artifactRoot });
  await new Promise<void>(resolve => application.server.listen(0, '127.0.0.1', resolve));
  const address = application.server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const indexResponse = await fetch(`${base}/api/workspaces/${state.request.sourceRequest.workspaceId}/reports`);
    assert.equal(indexResponse.status, 200);
    assert.deepEqual((await indexResponse.json() as any).reports, [{
      reportId: created.reportId,
      reportKey: state.request.reportKey,
      createdAt: '2026-10-01T03:00:00.000Z',
    }]);

    const historyResponse = await fetch(`${base}/api/reports/${created.reportId}/versions`);
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json() as any;
    assert.equal(history.workspaceId, state.request.sourceRequest.workspaceId);
    assert.deepEqual(history.versions.map((item: any) => item.version), [1]);
    assert.deepEqual(history.versions[0].sectionCounts, {
      total: 30,
      partialDeterministicDraft: 4,
      methodOnly: 13,
      blocked: 12,
      manualReviewRequired: 1,
      notImplemented: 0,
    });
    assert.equal(history.versions[0].interpretationState, 'NONE');
    assert.equal(history.versions[0].reviewState, 'UNREVIEWED');

    const interpretationIndexResponse = await fetch(`${base}/api/reports/${created.reportId}/versions/1/interpretations`);
    assert.equal(interpretationIndexResponse.status, 200);
    const interpretationIndex = await interpretationIndexResponse.json() as any;
    assert.deepEqual(interpretationIndex.interpretations, [{
      interpretationId: persisted.interpretationId,
      interpretationNumber: 1,
      interpretationContentSha256: persisted.interpretationContentSha256,
      completedAt: '2026-10-01T04:00:00.000Z',
      storedAt: '2026-10-01T05:00:00.000Z',
      sourceSemanticVersionId: created.semanticVersionId,
      sourcePacketId: interpretation.source.bundle.packet.packetId,
      providerId: 'synthetic-provider',
      modelId: 'synthetic-model',
      promptId: 'market-report-interpretation',
      promptVersion: 1,
      itemCount: 1,
      sectionIds: ['M03'],
    }]);
    assert.ok(!JSON.stringify(interpretationIndex).includes('private-provider-request'));

    const interpretationDetailResponse = await fetch(`${base}/api/reports/${created.reportId}/versions/1/interpretations/${persisted.interpretationId}`);
    assert.equal(interpretationDetailResponse.status, 200);
    const interpretationDetail = await interpretationDetailResponse.json() as any;
    assert.equal(interpretationDetail.interpretation.source.semanticVersionId, created.semanticVersionId);
    assert.equal(interpretationDetail.interpretation.source.packetId, interpretation.source.bundle.packet.packetId);
    assert.equal(interpretationDetail.interpretation.items[0].conclusion, interpretation.baseOutput.items[0]!.conclusion);
    assert.equal(interpretationDetail.interpretation.items[0].evidenceLogic, interpretation.baseOutput.items[0]!.evidenceLogic);
    assert.equal(interpretationDetail.interpretation.items[0].citations[0].claimId, 'M03:all:revenue');
    assert.equal(interpretationDetail.interpretation.items[0].citations[0].scopePointer, '/input/scope');
    for (const privateField of ['promptText', 'promptSha256', 'providerRequestId', 'inputTokenCount', 'outputTokenCount', 'latencyMs', 'artifactSha256', 'relativePath']) {
      assert.ok(!JSON.stringify(interpretationDetail).includes(privateField));
    }
    assert.equal((await fetch(`${base}/api/reports/${created.reportId}/versions/2/interpretations`)).status, 404);
    assert.equal((await fetch(`${base}/api/reports/${created.reportId}/versions/1/interpretations/99999999-9999-4999-8999-999999999999`)).status, 404);
    assert.equal((await fetch(`${base}/api/reports/${created.reportId}/versions/1/interpretations/not-a-uuid`)).status, 400);

    const expectedHtml = await state.service.readArtifact(created.reportId, 1, 'report.html');
    const htmlResponse = await fetch(`${base}/api/reports/${created.reportId}/versions/1/files/report.html`);
    assert.equal(htmlResponse.status, 200);
    assert.equal(htmlResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.match(htmlResponse.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.deepEqual(Buffer.from(await htmlResponse.arrayBuffer()), expectedHtml.bytes);
    assert.equal((await fetch(`${base}/api/reports/${created.reportId}/versions/1/files/not-member.json`)).status, 404);
    assert.equal((await fetch(`${base}/api/reports/${created.reportId}/versions/1/files/%2e%2e%2fsecret`)).status, 400);

    const record = await state.service.readVersion(created.reportId, 1);
    const packet = record.artifacts.find(item => item.fileName === 'packet.json')!;
    fs.writeFileSync(state.artifacts.pathForDigest(packet.sha256), 'corrupt');
    const corrupt = await fetch(`${base}/api/reports/${created.reportId}/versions`);
    assert.equal(corrupt.status, 500);
    assert.deepEqual(await corrupt.json(), { error: { code: 'integrity_error', message: 'Stored report data failed integrity verification' } });
    const corruptInterpretation = await fetch(`${base}/api/reports/${created.reportId}/versions/1/interpretations/${persisted.interpretationId}`);
    assert.equal(corruptInterpretation.status, 500);
    assert.deepEqual(await corruptInterpretation.json(), { error: { code: 'integrity_error', message: 'Stored report data failed integrity verification' } });
  } finally {
    await application.close();
  }
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
    normalized: { normalizedInputSha256: string; rowCount: number; sourceCount: number; deduplicated: boolean };
  };
  assert.deepEqual(
    [receipt.version, receipt.deduplicated, receipt.aiCalls, receipt.providerCalls, receipt.interpretationState, receipt.reviewState],
    [1, false, 0, 0, 'NONE', 'UNREVIEWED'],
  );
  assert.match(receipt.normalized.normalizedInputSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    [receipt.normalized.rowCount, receipt.normalized.sourceCount, receipt.normalized.deduplicated],
    [2, 2, false],
  );

  const reopened = openDatabase({ databasePath });
  databases.push(reopened.db);
  assert.equal(count(reopened.db, 'analysis_report_versions'), 1n);
  assert.equal(count(reopened.db, 'analysis_metric_datasets'), 1n);
  assert.equal(count(reopened.db, 'analysis_metric_dataset_rows'), 2n);
  assert.equal(count(reopened.db, 'analysis_metric_dataset_origins'), 1n);
});

test('upgrades an existing v30 database to v31 exactly once', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-normalized-observation-migration-'));
  tempRoots.push(directory);
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  const prior = fs.readdirSync('migrations')
    .filter(name => /^00(?:0[1-9]|[12][0-9]|30)_/.test(name))
    .sort();
  assert.equal(prior.length, 30);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(migrationsDirectory, name));
  const databasePath = path.join(directory, 'report.sqlite');
  const v30 = openDatabase({ databasePath, migrationsDirectory });
  assert.equal(v30.migration.currentVersion, 30);
  v30.db.close();

  fs.copyFileSync(
    'migrations/0031_analysis_normalized_metric_observations.sql',
    path.join(migrationsDirectory, '0031_analysis_normalized_metric_observations.sql'),
  );
  const v31 = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(v31.migration.applied, [31]);
  assert.equal(v31.migration.currentVersion, 31);
  assert.equal(count(v31.db, 'analysis_metric_datasets'), 0n);
  v31.db.close();

  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 31);
  rerun.db.close();
});

test('upgrades an existing v31 database to v32 exactly once', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-report-interpretation-ledger-migration-'));
  tempRoots.push(directory);
  const migrationsDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  const prior = fs.readdirSync('migrations')
    .filter(name => /^00(?:0[1-9]|[12][0-9]|3[01])_/.test(name))
    .sort();
  assert.equal(prior.length, 31);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(migrationsDirectory, name));
  const databasePath = path.join(directory, 'report.sqlite');
  const v31 = openDatabase({ databasePath, migrationsDirectory });
  assert.equal(v31.migration.currentVersion, 31);
  v31.db.close();

  fs.copyFileSync(
    'migrations/0032_analysis_report_interpretations.sql',
    path.join(migrationsDirectory, '0032_analysis_report_interpretations.sql'),
  );
  const v32 = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(v32.migration.applied, [32]);
  assert.equal(v32.migration.currentVersion, 32);
  assert.equal(count(v32.db, 'analysis_report_interpretation_runs'), 0n);
  v32.db.close();

  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 32);
  rerun.db.close();
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

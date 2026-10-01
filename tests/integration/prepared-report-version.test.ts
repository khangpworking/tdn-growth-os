import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { PreparedReportCreateRequest } from '../../contracts/analysis/prepared-report-create-request.generated.js';
import type { PreparedReportSemanticContent } from '../../contracts/analysis/prepared-report-semantic-content.generated.js';
import type { ReportAssemblySnapshot } from '../../contracts/analysis/report-assembly-snapshot.generated.js';
import {
  AnalysisReportVersionReader, ReportVersionService, ReportVersionIdentityConflictError, ReportVersionIntegrityError, ReportVersionValidationError,
} from '../../src/modules/analysis/report-version-service.js';
import {
  NormalizedMetricObservationStore, type NormalizedMetricObservationExecution,
} from '../../src/modules/analysis/normalized-metric-observation-store.js';
import { buildSourceBackedReport } from '../../src/modules/analysis/source-backed-report.js';
import { preparedReportFixture, mutationSnapshot, byteDigest } from '../helpers/prepared-report-fixture.js';

type Fixture = Awaited<ReturnType<typeof preparedReportFixture>>;

function reportService(state: Fixture) {
  return new ReportVersionService({
    db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies,
    preparations: state.preparations, sectionArtifacts: state.sectionArtifacts,
  });
}

function preparedRequest(state: Fixture): PreparedReportCreateRequest {
  return {
    contractVersion: 'prepared-report-v1' as const,
    reportKey: 'synthetic-prepared-report', version: 1, previousSemanticVersionId: null as string | null,
    sourceRequest: state.sourceRequest,
    preparationSha256: state.preparation.result.preparationSha256,
    readinessSha256: state.readiness.readinessSha256,
    sectionArtifactSha256: state.retainedM03.record.sectionArtifactSha256,
  };
}

async function persistedFiles(state: Fixture, record: Awaited<ReturnType<ReportVersionService['readVersion']>>) {
  const files = new Map<string, Buffer>();
  for (const member of record.artifacts) {
    const bytes = await fs.readFile(state.artifacts.pathForDigest(member.sha256));
    assert.equal(byteDigest(bytes), member.sha256, member.fileName);
    assert.equal(bytes.length, member.byteSize, member.fileName);
    files.set(member.fileName, bytes);
  }
  return files;
}

// A10 owns persistence and profile replay; arithmetic and A37 retention remain
// in their existing owners. This fixture reaches both through real services.
test('creates the first prepared report and reopens exact artifacts with mutation-free retry', async t => {
  const state = await preparedReportFixture(true);
  t.after(state.cleanup);
  const service = reportService(state);
  const request = preparedRequest(state);
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 0n });
  const existingMetadata = state.db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all() as Array<{ sha256: string }>;

  const created = await service.createPreparedVersion(request, state.catalogBytes);
  assert.equal(created.version, 1);
  assert.equal(created.deduplicated, false);
  assert.ok(created.databaseMutations > 0);
  const record = await service.readVersion(created.reportId, 1);
  const reopenedService = new ReportVersionService({
    db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies,
  });
  assert.deepEqual(await reopenedService.readVersion(created.reportId, 1), record);
  assert.equal(record.previousSemanticVersionId, null);
  assert.equal(record.interpretationState, 'NONE');
  assert.equal(record.reviewState, 'UNREVIEWED');
  const files = await persistedFiles(state, record);
  assert.ok(files.get('report.html')?.length);
  assert.deepEqual(JSON.parse(files.get('create-request.json')!.toString('utf8')), request);
  const semantic = JSON.parse(files.get('semantic-content.json')!.toString('utf8')) as PreparedReportSemanticContent;
  assert.equal(semantic.contractVersion, 'prepared-report-v1');
  assert.equal(semantic.semanticVersionId, created.semanticVersionId);
  assert.equal(semantic.preparationLayer.preparationSha256, request.preparationSha256);
  assert.equal(semantic.preparationLayer.normalizedInputSha256, state.preparation.result.normalizedInput.artifactSha256);
  assert.equal(semantic.readinessLayer.readinessSha256, request.readinessSha256);
  assert.equal(semantic.retainedSectionLayer.sectionArtifactSha256, request.sectionArtifactSha256);
  assert.equal(semantic.retainedSectionLayer.htmlSha256, state.retainedM03.record.members.html.artifactSha256);
  assert.deepEqual(semantic.interpretationLayer, { state: 'NONE', artifacts: [] });
  const snapshot = JSON.parse(files.get('assembly-snapshot.json')!.toString('utf8')) as ReportAssemblySnapshot;
  assert.equal(snapshot.assemblySha256, semantic.assemblyLayer.assemblySha256);
  assert.ok(files.get('report.html')!.includes(Buffer.from(snapshot.assemblySha256)));
  const document = new JSDOM(files.get('report.html')!.toString('utf8')).window.document;
  assert.ok(document.querySelector('a[href="semantic-content.json"][download]'));
  assert.ok(document.querySelector('a[href="review-state.json"][download]'));
  for (const anchor of document.querySelectorAll('a[download]')) {
    const fileName = anchor.getAttribute('href');
    assert.ok(fileName !== null && files.has(fileName), `Unretained report download: ${fileName}`);
  }
  for (const [role, member] of Object.entries(state.retainedM03.record.members)) {
    assert.ok(record.artifacts.some(artifact => artifact.sha256 === member.artifactSha256), `Retained M03 ${role}`);
  }
  assert.equal(files.get('i17-evidence-trace.json')!.includes(Buffer.from(created.semanticVersionId)), false);
  for (const row of existingMetadata) {
    assert.deepEqual(state.db.prepare('SELECT * FROM artifact_manifests WHERE sha256 = ?').get(row.sha256), row);
  }

  const beforeRetry = mutationSnapshot(state);
  const retry = await service.createPreparedVersion(structuredClone(request), Buffer.from(state.catalogBytes));
  assert.deepEqual(retry, { ...created, deduplicated: true, databaseMutations: 0 });
  assert.deepEqual(await service.readVersion(created.reportId, 1), record);
  assert.deepEqual(mutationSnapshot(state), beforeRetry);
  await assert.rejects(service.createPreparedVersion({
    ...request, sourceRequest: { ...request.sourceRequest, tabletQuoteSourcePath: null, tabletQuoteInputPath: null },
  }, state.catalogBytes), ReportVersionIdentityConflictError);
  assert.deepEqual(mutationSnapshot(state), beforeRetry);

  const htmlMember = record.artifacts.find(member => member.fileName === 'report.html')!;
  const htmlPath = state.artifacts.pathForDigest(htmlMember.sha256);
  await fs.unlink(htmlPath);
  const beforeMissingRead = mutationSnapshot(state);
  await assert.rejects(service.readVersion(created.reportId, 1), ReportVersionIntegrityError);
  assert.deepEqual(mutationSnapshot(state), beforeMissingRead);
  const recovered = await service.createPreparedVersion(request, state.catalogBytes);
  assert.deepEqual(recovered, { ...created, deduplicated: true, databaseMutations: 0 });
  assert.deepEqual(await fs.readFile(htmlPath), files.get('report.html'));
  const afterRecovery = mutationSnapshot(state);
  assert.deepEqual(afterRecovery.changes, beforeMissingRead.changes);
  assert.deepEqual(afterRecovery.manifests, beforeMissingRead.manifests);
  const recoveredPathPrefix = `${path.relative(state.artifactRoot, htmlPath)}:`;
  assert.deepEqual(afterRecovery.files.filter(file => !file.startsWith(recoveredPathPrefix)), beforeMissingRead.files);

  const previewDirectory = process.env.TDN_RESEARCH_ASSEMBLY_PREVIEW_DIR;
  if (previewDirectory) {
    const destination = path.resolve(previewDirectory);
    await fs.mkdir(destination, { recursive: true });
    for (const [fileName, bytes] of files) {
      await fs.writeFile(path.join(destination, fileName), bytes, { flag: 'wx', mode: 0o600 });
    }
  }
  await fs.writeFile(htmlPath, Buffer.from('<html>tampered report</html>'));
  const beforeCorruptReplay = mutationSnapshot(state);
  await assert.rejects(service.readVersion(created.reportId, 1), ReportVersionIntegrityError);
  await assert.rejects(service.createPreparedVersion(request, state.catalogBytes), ReportVersionIntegrityError);
  assert.deepEqual(mutationSnapshot(state), beforeCorruptReplay);
});

test('rejects prepared report lineage drift before any artifact or database write', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const service = reportService(state);
  const request = preparedRequest(state);
  const source = request.sourceRequest;
  const wrongDigest = 'f'.repeat(64);
  const aliasSelection = { ...source, workbookPath: 'metric/workbook-alias.xlsx' };
  const aliasBundle = await buildSourceBackedReport(aliasSelection, state.catalogBytes, state.dependencies);
  assert.deepEqual(aliasBundle.input, state.preparation.input);
  const cases = [
    { name: 'workspace', request: { ...request, sourceRequest: { ...source, workspaceId: '99999999-9999-4999-8999-999999999999' } } },
    { name: 'package', request: { ...request, sourceRequest: { ...source, packageId: '99999999-9999-4999-8999-999999999999' } } },
    { name: 'package manifest', request: { ...request, sourceRequest: { ...source, packageManifestSha256: wrongDigest } } },
    { name: 'source selection', request: { ...request, sourceRequest: { ...source, labelsPath: null } } },
    { name: 'same-byte workbook alias', request: { ...request, sourceRequest: aliasSelection } },
    { name: 'readiness', request: { ...request, readinessSha256: wrongDigest } },
    { name: 'retained M03', request: { ...request, sectionArtifactSha256: wrongDigest } },
  ];
  for (const candidate of cases) {
    const before = mutationSnapshot(state);
    await assert.rejects(service.createPreparedVersion(candidate.request, state.catalogBytes), candidate.name);
    assert.deepEqual(mutationSnapshot(state), before, candidate.name);
  }
  const catalog = JSON.parse(state.catalogBytes.toString('utf8')) as { catalogVersion: string };
  catalog.catalogVersion = '99.0.0';
  const catalogBytes = Buffer.from(JSON.stringify(catalog), 'utf8');
  const beforeCatalog = mutationSnapshot(state);
  await assert.rejects(service.createPreparedVersion({
    ...request, sourceRequest: { ...source, catalogSha256: byteDigest(catalogBytes) },
  }, catalogBytes));
  assert.deepEqual(mutationSnapshot(state), beforeCatalog);

  const normalizedPath = state.artifacts.pathForDigest(state.preparation.result.normalizedInput.artifactSha256);
  await fs.writeFile(normalizedPath, Buffer.from('{}\n'));
  const beforeNormalized = mutationSnapshot(state);
  await assert.rejects(service.createPreparedVersion(request, state.catalogBytes));
  assert.deepEqual(mutationSnapshot(state), beforeNormalized);
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 0n });
});

test('appends the prepared profile to an exact legacy predecessor without changing historical bytes', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const service = reportService(state);
  const request = preparedRequest(state);
  const legacyRequest = {
    contractVersion: '1.0.0' as const, reportKey: request.reportKey, version: 1,
    previousSemanticVersionId: null, sourceRequest: state.sourceRequest,
  };
  const first = await service.createVersion(legacyRequest, state.catalogBytes);
  const historical = await service.readVersion(first.reportId, 1);
  const historicalFiles = await persistedFiles(state, historical);
  const append = { ...request, version: 2, previousSemanticVersionId: first.semanticVersionId };
  const beforeRejectedPredecessor = mutationSnapshot(state);
  await assert.rejects(service.createPreparedVersion({ ...append, previousSemanticVersionId: 'f'.repeat(64) }, state.catalogBytes), ReportVersionValidationError);
  assert.deepEqual(mutationSnapshot(state), beforeRejectedPredecessor);

  const second = await service.createPreparedVersion(append, state.catalogBytes);
  assert.equal(second.reportId, first.reportId);
  assert.equal(second.version, 2);
  assert.notEqual(second.semanticVersionId, first.semanticVersionId);
  const history = await service.readHistory(first.reportId);
  assert.deepEqual(history.map(item => [item.version, item.previousSemanticVersionId]), [[1, null], [2, first.semanticVersionId]]);
  assert.deepEqual(history[0], historical);
  assert.deepEqual(await persistedFiles(state, history[0]!), historicalFiles);
  assert.deepEqual(await service.createVersion(legacyRequest, state.catalogBytes), {
    ...first, deduplicated: true, databaseMutations: 0,
  });
});

test('failed prepared version creation leaves no artifact residue and preserves unrelated existing files', async t => {
  const state = await preparedReportFixture(true);
  t.after(state.cleanup);
  const unrelatedBytes = Buffer.from('Unregistered artifact from an unrelated operation.\n', 'utf8');
  const unrelated = await state.artifacts.put(unrelatedBytes);
  const before = mutationSnapshot(state);
  state.db.exec(`
    CREATE TEMP TRIGGER reject_synthetic_prepared_report
    BEFORE INSERT ON analysis_report_versions
    BEGIN
      SELECT RAISE(ABORT, 'synthetic prepared insert failure');
    END
  `);
  try {
    await assert.rejects(reportService(state).createPreparedVersion(preparedRequest(state), state.catalogBytes),
      /synthetic prepared insert failure/);
  } finally {
    state.db.exec('DROP TRIGGER reject_synthetic_prepared_report');
  }
  const after = mutationSnapshot(state);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(after.manifests, before.manifests);
  assert.deepEqual(await fs.readFile(unrelated.absolutePath), unrelatedBytes);
  assert.equal(state.db.inTransaction, false);
  for (const table of ['analysis_report_series', 'analysis_report_versions', 'analysis_report_version_artifacts']) {
    assert.deepEqual(state.db.prepare(`SELECT count(*) count FROM ${table}`).get(), { count: 0n }, table);
  }
});

test('prepared report CLI rejects invalid input before writing and returns a reopenable retained version', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const requestPath = path.join(state.directory, 'cli-request.json');
  const catalogPath = path.join(state.directory, 'cli-catalog.json');
  await fs.writeFile(requestPath, '{');
  await fs.writeFile(catalogPath, state.catalogBytes);
  const args = [state.databasePath, state.artifactRoot, requestPath, catalogPath];
  const run = (selected = args) => spawnSync(process.execPath, [
    '--import', 'tsx', 'scripts/assemble-prepared-report.ts', ...selected,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });

  const before = mutationSnapshot(state);
  const invalid = run();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /not valid JSON/);
  assert.deepEqual(mutationSnapshot(state), before);
  await fs.writeFile(requestPath, JSON.stringify(preparedRequest(state)));
  const insideRepository = run([state.databasePath, root, requestPath, catalogPath]);
  assert.notEqual(insideRepository.status, 0);
  assert.match(insideRepository.stderr, /Artifact root must be outside the Git repository/);
  assert.deepEqual(mutationSnapshot(state), before);
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 0n });

  const created = run();
  assert.equal(created.status, 0, created.stderr);
  const receipt = JSON.parse(created.stdout) as {
    reportId: string; version: number; semanticVersionId: string; interpretationState: string; reviewState: string;
    normalized: NormalizedMetricObservationExecution;
  };
  const reader = new ReportVersionService({
    db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies,
  });
  const record = await reader.readVersion(receipt.reportId, receipt.version);
  assert.equal(record.version, 1);
  assert.equal(record.semanticVersionId, receipt.semanticVersionId);
  assert.equal(record.interpretationState, receipt.interpretationState);
  assert.equal(record.reviewState, receipt.reviewState);
  assert.equal(created.stdout.includes(state.directory), false);
  const observations = new NormalizedMetricObservationStore({
    db: state.db, reports: new AnalysisReportVersionReader(reader),
  });
  const projection = await observations.readVerifiedProjectionForReport(receipt.reportId, receipt.version);
  assert.equal(projection.normalizedInputSha256, state.preparation.result.normalizedInput.artifactSha256);
  assert.deepEqual(projection.input, state.preparation.input);
  assert.equal(receipt.normalized.normalizedInputSha256, projection.normalizedInputSha256);
  assert.equal(receipt.normalized.deduplicated, false);
  assert.ok(receipt.normalized.databaseMutations > 0);
  assert.deepEqual(state.db.prepare(`
    SELECT normalized_input_sha256 normalizedInputSha256, source_package_id sourcePackageId,
           source_package_manifest_sha256 sourcePackageManifestSha256, package_content_sha256 packageContentSha256
    FROM analysis_metric_dataset_origins WHERE report_id = ? AND report_version = ?
  `).get(receipt.reportId, receipt.version), {
    normalizedInputSha256: projection.normalizedInputSha256,
    sourcePackageId: state.preparation.result.sourcePackage.packageId,
    sourcePackageManifestSha256: state.preparation.result.sourcePackage.manifestArtifactSha256,
    packageContentSha256: state.preparation.result.sourcePackage.packageContentSha256,
  });
  const normalizedState = () => ({
    datasets: state.db.prepare('SELECT * FROM analysis_metric_datasets ORDER BY normalized_input_sha256').all(),
    sources: state.db.prepare('SELECT * FROM analysis_metric_dataset_sources ORDER BY normalized_input_sha256, ordinal').all(),
    rows: state.db.prepare('SELECT * FROM analysis_metric_dataset_rows ORDER BY normalized_input_sha256, record_index').all(),
    origins: state.db.prepare('SELECT * FROM analysis_metric_dataset_origins ORDER BY report_id, report_version').all(),
  });
  const beforeRetry = normalizedState();
  const retry = run();
  assert.equal(retry.status, 0, retry.stderr);
  const retried = JSON.parse(retry.stdout) as { normalized: NormalizedMetricObservationExecution };
  assert.deepEqual(retried.normalized, { ...receipt.normalized, deduplicated: true, databaseMutations: 0 });
  assert.deepEqual(normalizedState(), beforeRetry);
  assert.deepEqual(await observations.readVerifiedProjectionForReport(receipt.reportId, receipt.version), projection);
});

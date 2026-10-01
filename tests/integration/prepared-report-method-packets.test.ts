import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type { PreparedReportCreateRequest } from '../../contracts/analysis/prepared-report-create-request.generated.js';
import type { BoundedAnalysisGates } from '../../contracts/analysis/bounded-analysis-gates.generated.js';
import type { DecisionEvidencePackets } from '../../contracts/analysis/decision-evidence-packets.generated.js';
import type { VersionedReportPacket } from '../../contracts/analysis/versioned-report-packet.generated.js';
import { ReportVersionService } from '../../src/modules/analysis/report-version-service.js';
import { byteDigest, mutationSnapshot, preparedReportFixture } from '../helpers/prepared-report-fixture.js';

type Fixture = Awaited<ReturnType<typeof preparedReportFixture>>;

function reportService(state: Fixture): ReportVersionService {
  return new ReportVersionService({
    db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies,
    preparations: state.preparations, sectionArtifacts: state.sectionArtifacts,
  });
}

function preparedRequest(state: Fixture): PreparedReportCreateRequest {
  return {
    contractVersion: 'prepared-report-v1', reportKey: 'synthetic-method-packets', version: 1,
    previousSemanticVersionId: null,
    sourceRequest: state.sourceRequest,
    preparationSha256: state.preparation.result.preparationSha256,
    readinessSha256: state.readiness.readinessSha256,
    sectionArtifactSha256: state.retainedM03.record.sectionArtifactSha256,
  };
}

async function persistedFiles(state: Fixture, report: Awaited<ReturnType<ReportVersionService['readVersion']>>) {
  const files = new Map<string, Buffer>();
  for (const member of report.artifacts) {
    const bytes = await fs.readFile(state.artifacts.pathForDigest(member.sha256));
    assert.equal(byteDigest(bytes), member.sha256, member.fileName);
    assert.equal(bytes.length, member.byteSize, member.fileName);
    files.set(member.fileName, bytes);
  }
  return files;
}

function evidenceFile(evidence: { files: { logicalPath: string; sha256: string; bytesBase64: string }[] }, logicalPath: string): Buffer {
  const file = evidence.files.find(candidate => candidate.logicalPath === logicalPath);
  assert.ok(file, `Missing retained method source: ${logicalPath}`);
  assert.equal(byteDigest(Buffer.from(file.bytesBase64, 'base64')), file.sha256);
  return Buffer.from(file.bytesBase64, 'base64');
}

test('persists gate and synthesis method packets with exact sources, embedded supplements, replay and bounded retry', async t => {
  const state = await preparedReportFixture(true, true, true, true);
  t.after(state.cleanup);
  assert.ok(state.methods && state.descriptive && state.located);
  const service = reportService(state);

  // Preserve the historical standalone descriptive files when the new path is
  // absent. The method request below is a separate report series.
  const legacyRequest: PreparedReportCreateRequest = {
    ...preparedRequest(state), reportKey: 'synthetic-method-packets-legacy', reportPresentation: 'report-kit-v1',
    descriptiveMethodsPath: state.descriptive.logicalPath, locatedInsightMethodsPath: state.located.logicalPath,
  } as PreparedReportCreateRequest;
  const legacy = await service.createPreparedVersion(legacyRequest, state.catalogBytes);
  const legacyFiles = await persistedFiles(state, await service.readVersion(legacy.reportId, 1));

  const request: PreparedReportCreateRequest = {
    ...legacyRequest, reportKey: 'synthetic-method-packets', methodPacketsPath: state.methods.logicalPath,
  } as PreparedReportCreateRequest;
  const created = await service.createPreparedVersion(request, state.catalogBytes);
  const record = await service.readVersion(created.reportId, 1);
  const files = await persistedFiles(state, record);
  assert.ok(files.size <= 40, 'The combined report remains under the unchanged artifact limit');
  assert.ok(files.has('report-method-evidence.json'));
  assert.ok(files.has('located-insight-bundle.json'));
  for (const name of ['descriptive-market-input.json', 'descriptive-market-methods.json', 'descriptive-evidence-files.json']) {
    assert.equal(files.has(name), false, `Embedded supplement must replace standalone ${name}`);
  }

  const evidence = JSON.parse(files.get('report-method-evidence.json')!.toString('utf8')) as {
    contractVersion: string;
    gates: BoundedAnalysisGates;
    decisions: DecisionEvidencePackets;
    calculation: { fileName: string; sha256: string };
    claimProjection: { fileName: string; sha256: string };
    embeddedSupplements: { fileName: string; sha256: string; byteSize: number; bytesBase64: string }[];
    files: { logicalPath: string; sha256: string; bytesBase64: string }[];
  };
  assert.equal(evidence.contractVersion, 'report-method-evidence-v1');
  assert.equal((evidence.gates.sections.M10 as { status: string }).status, 'BLOCKED');
  assert.equal((evidence.gates.sections.I11 as { publicationStatus: string }).publicationStatus, 'NOT_AUTHORIZED');
  assert.equal((evidence.gates.sections.I12 as { joins: null; effectiveness: null }).joins, null);
  assert.equal((evidence.gates.sections.I16 as { executionState: string; estimate: null }).executionState, 'NOT_EXECUTED');
  assert.ok(evidence.decisions.input.claims.length > 0);
  const metricResultBytes = files.get('metric-result.json')!;
  const metricResultSha256 = byteDigest(metricResultBytes);
  const firstClaim = evidence.decisions.input.claims[0]!;
  const packet = JSON.parse(files.get('packet.json')!.toString('utf8')) as VersionedReportPacket;
  assert.equal(firstClaim.reference.fileName, 'metric-result.json');
  assert.equal(firstClaim.reference.sha256, metricResultSha256);
  assert.equal(firstClaim.reference.claimPointer, '/claims/0');
  assert.equal(firstClaim.claimKey, `${firstClaim.payload.claimId}@${metricResultSha256}`);
  assert.deepEqual(firstClaim.payload, packet.claims[0]);
  for (const claim of evidence.decisions.input.claims) {
    const index = Number(claim.reference.claimPointer.slice('/claims/'.length));
    assert.equal(claim.reference.fileName, 'metric-result.json');
    assert.equal(claim.reference.sha256, metricResultSha256);
    assert.equal(claim.claimKey, `${claim.payload.claimId}@${metricResultSha256}`);
    assert.deepEqual(claim.payload, packet.claims[index]);
  }
  assert.equal(evidence.calculation.fileName, 'metric-result.json');
  assert.equal(evidence.calculation.sha256, metricResultSha256);
  assert.equal(evidence.claimProjection.fileName, 'packet.json');
  assert.equal(evidence.claimProjection.sha256, byteDigest(files.get('packet.json')!));
  assert.equal(evidence.decisions.sections.M01.conclusion, null);
  assert.equal(evidence.decisions.sections.I15.preferredOption, null);
  assert.equal(evidence.decisions.sections.M12.chosen, null);
  assert.equal(evidence.decisions.sections.M12.executionAuthorization, null);

  // The gate source is the recursively normalized source document. A retained
  // nested pointer must identify the exact source bytes and exact payload.
  const row = evidence.gates.input.m10!.series[0]!.rows[0]!;
  const gateSourceBytes = evidenceFile(evidence, state.methods.gateSourcePath);
  const gateSource = JSON.parse(gateSourceBytes.toString('utf8')) as {
    m10: { series: { rows: { date: string; observation: unknown }[] }[] };
  };
  assert.equal(row.source.logicalPath, state.methods.gateSourcePath);
  assert.equal(row.source.sha256, byteDigest(gateSourceBytes));
  assert.equal(row.source.locator, '/m10/series/0/rows/0');
  assert.deepEqual(gateSource.m10.series[0]!.rows[0], { date: row.date, observation: row.observation });

  // The three old descriptive artifacts are retained byte-for-byte inside the
  // single method evidence download, keeping the public limit unchanged.
  const embedded = new Map(evidence.embeddedSupplements.map(item => [item.fileName, item]));
  for (const name of ['descriptive-market-input.json', 'descriptive-market-methods.json', 'descriptive-evidence-files.json']) {
    const item = embedded.get(name);
    assert.ok(item, `Missing embedded descriptive file: ${name}`);
    const oldBytes = legacyFiles.get(name);
    assert.ok(oldBytes, `Legacy descriptive file was not retained: ${name}`);
    assert.equal(item.sha256, byteDigest(oldBytes));
    assert.equal(item.byteSize, oldBytes.length);
    assert.deepEqual(Buffer.from(item.bytesBase64, 'base64'), oldBytes);
  }

  const beforeRetry = mutationSnapshot(state);
  assert.deepEqual(await service.createPreparedVersion(structuredClone(request), Buffer.from(state.catalogBytes)), {
    ...created, deduplicated: true, databaseMutations: 0,
  });
  assert.deepEqual(await persistedFiles(state, await service.readVersion(created.reportId, 1)), files);
  assert.deepEqual(await persistedFiles(state, await service.readVersion(legacy.reportId, 1)), legacyFiles);
  assert.deepEqual(mutationSnapshot(state), beforeRetry);
  const html = files.get('report.html')!.toString('utf8');
  for (const id of ['M01', 'M10', 'M11', 'M12', 'I11', 'I12', 'I14', 'I15', 'I16']) {
    assert.ok(html.includes(`id="section-${id}"`), `${id} must be rendered`);
  }
  assert.ok(html.includes('report-method-evidence.json'));
  assert.ok(html.includes('Chưa thực hiện dự báo'));
  assert.ok(html.includes('Quyết định còn mở'));

  const preview = process.env.TDN_RESEARCH_METHODS_PREVIEW_DIR;
  if (preview) {
    assert.ok(path.isAbsolute(preview));
    await fs.mkdir(preview, { recursive: true, mode: 0o700 });
    for (const [name, bytes] of files) await fs.writeFile(path.join(preview, name), bytes, { mode: 0o600 });
  }
});

test('rejects changed retained source and claim references before persistence', async t => {
  const state = await preparedReportFixture(true, true, true, true);
  t.after(state.cleanup);
  assert.ok(state.methods);
  const service = reportService(state);
  const base = {
    ...preparedRequest(state), reportPresentation: 'report-kit-v1', methodPacketsPath: state.methods.logicalPath,
  } as PreparedReportCreateRequest;
  for (const [name, methodPacketsPath, pattern] of [
    ['source', state.methods.sourceDriftPath, /METHOD_PACKET_LITERAL_PAYLOAD_MISMATCH/],
    ['claim', state.methods.claimDriftPath, /METHOD_PACKET_CLAIM_REPLAY_MISMATCH/],
  ] as const) {
    const before = mutationSnapshot(state);
    await assert.rejects(
      service.createPreparedVersion({ ...base, reportKey: `synthetic-method-${name}-drift`, methodPacketsPath }, state.catalogBytes),
      error => error instanceof TypeError && pattern.test(error.message),
    );
    assert.deepEqual(mutationSnapshot(state), before, name);
    assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 0n }, name);
  }
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { DiscoveryWorkspaceArtifact } from '../../contracts/flow/discovery-workspace-artifact.generated.js';
import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2, type CaptureRowExclusionReason } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { AutomationMetricMethodBridge, type AutomationMetricMethodSnapshot, type MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationIntegrityError } from '../../src/modules/analysis/research-automation/model.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { policyHash, policyNow, policyRun, policyRunId, policyWorkspaceId } from '../helpers/capture-policy-harness.js';

type StoredRow = Record<string, string | number | null>;
type RetainedFixture = {
  generatedFromRevision: string; method: AutomationMetricMethodSnapshot; input: MetricRunInput; workspace: DiscoveryWorkspaceArtifact;
  packages: StoredRow[]; files: StoredRow[]; origins: StoredRow[]; artifacts: { metadata: StoredRow; text: string }[];
};

async function retainedV2(t: TestContext, omitMethod = false) {
  // Captured using the actual parent implementation cd4f0a58, with synthetic titles.
  // It includes two parts v2 kept and v3 excludes; re-labelling a v3 method cannot satisfy this test.
  const fixture = JSON.parse(await fs.readFile(new URL('../fixtures/metric-capture-retained-v2.json', import.meta.url), 'utf8')) as RetainedFixture;
  assert.equal(fixture.generatedFromRevision, 'cd4f0a58');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-policy-retained-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const insert = (table: string, row: StoredRow) => {
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  };
  for (const artifact of fixture.artifacts) {
    assert.equal((await artifacts.put(Buffer.from(artifact.text))).sha256, artifact.metadata.sha256);
    insert('artifact_manifests', artifact.metadata);
  }
  const originalId = fixture.method.originalSourcePackage.packageId;
  const keep = (row: StoredRow) => !omitMethod || row.package_id === originalId;
  for (const row of fixture.packages.filter(keep)) insert('foundation_source_packages', { ...row, finalized_at: null });
  for (const row of fixture.files.filter(keep)) insert('foundation_source_package_files', row);
  for (const row of fixture.origins.filter(keep)) insert('foundation_source_attachment_origins', row);
  for (const row of fixture.packages.filter(keep)) db.prepare('UPDATE foundation_source_packages SET finalized_at=? WHERE package_id=?').run(row.finalized_at, row.package_id);
  const bridge = new AutomationMetricMethodBridge({ db, artifactStore: artifacts, workspaces: { readVerifiedWorkspace: async () => fixture.workspace }, now: policyNow });
  return { fixture, db, artifacts, bridge };
}

test('new capture freezes v3, all three exclusion reasons and exact source-row indices', async t => {
  const f = await policyRun(t);
  const report = await f.service.readReport(policyWorkspaceId, policyRunId, 'MARKET', false);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString()) as { metricMethods: AutomationMetricMethodSnapshot };
  const method = semantic.metricMethods;
  assert.equal(method.result.input.profileId, CAPTURE_ROW_PROFILE);
  assert.equal(method.capture!.rowPolicyVersion, CAPTURE_ROW_PROFILE);
  assert.equal(method.capture!.snapshotSha256, policyHash(f.first.snapshotBytes));
  assert.deepEqual(method.capture!.excludedRows!.map(row => [row.rowIndex, row.reason]).sort((a, b) => Number(a[0]) - Number(b[0])),
    [[1, 'NOT_MAIN_PRODUCT'], [2, 'NOT_MAIN_PRODUCT'], [3, 'NOT_MAIN_PRODUCT'], [6, 'UNIT_REVENUE_OUTLIER'], [7, 'REVENUE_WITHOUT_UNITS']]);
  assert.equal(method.result.input.records.length, 3);
  const file = f.db.prepare('SELECT artifact_sha256 sha FROM foundation_source_package_files WHERE package_id=? AND logical_path=?')
    .get(method.sourcePackage.packageId, 'methods/metric-run.json') as { sha: string };
  const config = JSON.parse((await f.artifacts.read(file.sha)).toString()) as { input: MetricRunInput };
  const receiptFile = f.db.prepare('SELECT artifact_sha256 sha FROM foundation_source_package_files WHERE package_id=? AND logical_path=?')
    .get(method.sourcePackage.packageId, 'methods/metric-normalization-receipt.json') as { sha: string };
  const receipt = JSON.parse((await f.artifacts.read(receiptFile.sha)).toString()) as { rowPolicyVersion: string; excludedRows: unknown };
  assert.equal(receipt.rowPolicyVersion, CAPTURE_ROW_PROFILE);
  assert.deepEqual(receipt.excludedRows, method.capture!.excludedRows, 'exclusions are frozen in the retained receipt as well as the draft');
  const bridge = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts, workspaces: f.workspaces, now: policyNow });
  assert.deepEqual(await bridge.verify(method, config.input), method);
  const tampered = { ...method, capture: { ...method.capture!, excludedRows: [] } };
  await assert.rejects(bridge.verify(tampered, config.input), ResearchAutomationIntegrityError);
});

test('retained v2 verifies using its frozen term list, without writes or a frozen-row-policy error', async t => {
  const { fixture, bridge, db } = await retainedV2(t);
  assert.equal(fixture.method.result.input.profileId, CAPTURE_ROW_PROFILE_V2);
  assert.equal(fixture.method.result.input.records.length, 5, 'v2 kept both newly recognized parts');
  const before = db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await bridge.verify(fixture.method, fixture.input), fixture.method);
  assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before);
  // Only changing the claimed row policy must never silently reinterpret retained bytes.
  const tampered = { ...fixture.method, capture: { ...fixture.method.capture!, rowPolicyVersion: CAPTURE_ROW_PROFILE } };
  await assert.rejects(bridge.verify(tampered, fixture.input), ResearchAutomationIntegrityError);
});

for (const profile of ['automation-metric-capture-v3', 'automation-metric-capture-v4']) test(`coherent retained results with ${profile} reject at the policy integrity gate`, async t => {
  const { fixture, db, artifacts, bridge } = await retainedV2(t, true);
  const method = structuredClone(fixture.method);
  const metadata = fixture.packages.find(row => row.package_id === method.sourcePackage.packageId)!;
  const manifestArtifact = fixture.artifacts.find(item => item.metadata.sha256 === metadata.manifest_artifact_sha256)!;
  const manifest = JSON.parse(manifestArtifact.text) as { packageKey: string; sourceLabel: string; sourceAcquiredAt: string };
  const files = new Map(fixture.files.filter(row => row.package_id === method.sourcePackage.packageId).map(row => [String(row.logical_path),
    Buffer.from(fixture.artifacts.find(item => item.metadata.sha256 === row.artifact_sha256)!.text)]));
  const results = JSON.parse(files.get('methods/metric-capture-results.json')!.toString()) as { platform: 'shopee'; result: AutomationMetricMethodSnapshot['result'] }[];
  for (const entry of results) {
    const input = entry.result.input;
    input.profileId = profile;
    for (const row of input.records) row.measurement.profileId = profile;
    entry.result = calculateMetricScopes(input);
  }
  const alteredResult = results[0]!.result;
  files.set('methods/metric-capture-results.json', Buffer.from(canonicalJson(results)));
  files.set('methods/metric-scope-output.json', Buffer.from(canonicalJson(alteredResult)));
  files.set('methods/metric-normalized-input.json', Buffer.from(canonicalJson(alteredResult.input) + '\n'));
  const source = new SourcePackageService({ db, artifactStore: artifacts });
  const originalManifest = (await source.readVerified(method.originalSourcePackage.packageId, { maxFileBytes: 8 * 1024 * 1024, maxTotalBytes: 24 * 1024 * 1024 })).manifest;
  const frozenManifest = JSON.parse(manifestArtifact.text) as { files: typeof originalManifest.files };
  const receipt = await source.intake({ contractVersion: '1.0.0', packageKey: manifest.packageKey, version: 1, sourceLabel: manifest.sourceLabel,
    sourceAcquiredAt: manifest.sourceAcquiredAt, files: frozenManifest.files.map(row => ({ ...row, sha256: policyHash(files.get(row.path)!), byteSize: files.get(row.path)!.length })) }, files);
  const altered = { ...method, result: alteredResult, sourcePackage: { packageId: receipt.packageId, manifestArtifactSha256: receipt.manifestArtifactSha256, packageContentSha256: receipt.packageContentSha256 } };
  await assert.rejects(bridge.verify(altered, fixture.input), (error: unknown) => error instanceof ResearchAutomationIntegrityError &&
    error.message === (profile.endsWith('v4') ? 'Unknown capture row profile.' : 'Capture rows differ from the frozen row policy.'));
});

async function buildAndReadPolicy(f: Awaited<ReturnType<typeof policyRun>>, packageId: string) {
  const snapshot = packageId === f.first.packageId ? f.first.snapshot : f.second!.snapshot;
  const request = { contractVersion: 'reader-report-build-v1.2', requestKey: randomUUID(), metricPackageId: packageId,
    platforms: ['shopee'], profile: sync1ReaderFixture().profile, cover: null,
    source: deriveReaderSource(verifyWebSnapshot(snapshot, webSnapshotDigest(snapshot)), 5000, { nullable: true }) };
  const built = await f.service.buildReaderReport(policyWorkspaceId, policyRunId, request, { actorId: 'owner:synthetic', role: 'OWNER' });
  const row = f.db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { sha: string };
  const record = JSON.parse((await f.artifacts.read(row.sha)).toString()) as {
    input: ReaderReportInput; captureRowPolicy: string; captureExcludedRows: { title: string; platform: string; reason: CaptureRowExclusionReason }[]; limitations: string[]; webResults: [];
  };
  const replay = await buildMarketReport(computeReaderReportData(record.input), { builtOn: '01/02/2026', flint: false,
    limitations: record.limitations, webResults: record.webResults, captureSource: true,
    captureRowPolicy: record.input.captureRowPolicy!, captureExcludedRows: record.captureExcludedRows });
  const report = await f.service.readReaderReport(policyWorkspaceId, policyRunId, built.revision.revisionId);
  assert.equal(replay.html, report.bytes.toString(), 'revision replays from its stored policy and rows');
  assert.equal(record.captureRowPolicy, record.input.captureRowPolicy);
  return record;
}

test('public reader build uses v3 for the matching verified draft snapshot and v2 for a different prepared snapshot', async t => {
  const f = await policyRun(t, 'USE_PREPARED', true);
  assert.notEqual(policyHash(f.first.snapshotBytes), policyHash(f.second!.snapshotBytes));
  const matching = await buildAndReadPolicy(f, f.first.packageId);
  assert.equal(matching.captureRowPolicy, CAPTURE_ROW_PROFILE);
  assert.equal(matching.input.rows.length, 3);
  assert.equal(matching.captureExcludedRows.length, 5);
  const mismatched = await buildAndReadPolicy(f, f.second!.packageId);
  assert.equal(mismatched.captureRowPolicy, CAPTURE_ROW_PROFILE_V2);
  assert.equal(mismatched.input.rows.length, 5);
  assert.equal(mismatched.captureExcludedRows.length, 3);
});

test('public reader build without draft Metric methods falls back to v2', async t => {
  const f = await policyRun(t, 'SKIPPED');
  const record = await buildAndReadPolicy(f, f.first.packageId);
  assert.equal(record.captureRowPolicy, CAPTURE_ROW_PROFILE_V2);
  assert.equal(record.input.rows.length, 5);
});

for (const rowPolicyVersion of [CAPTURE_ROW_PROFILE_V2, undefined]) test(`verified-report public seam with ${rowPolicyVersion ?? 'missing policy'} keeps reader v2`, async t => {
  const f = await policyRun(t);
  const verified = await f.service.readReport(policyWorkspaceId, policyRunId, 'MARKET', false);
  const semantic = JSON.parse((await f.artifacts.read(verified.versionId)).toString()) as { metricMethods: AutomationMetricMethodSnapshot };
  const { rowPolicyVersion: _policy, ...capture } = semantic.metricMethods.capture!;
  const metricMethods = { ...semantic.metricMethods, capture: { ...capture, ...(rowPolicyVersion ? { rowPolicyVersion } : {}) } };
  const stored = await f.artifacts.put(Buffer.from(canonicalJson({ ...semantic, metricMethods })));
  const at = policyNow().toISOString();
  f.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,'application/json',?,?,'1.0.0','active',?)`).run(stored.sha256, stored.byteSize, stored.relativePath, at, at);
  // Isolate the policy decision at the public verified-report boundary. Full v2 integrity
  // replay is exercised above; these variants do not claim to replay an altered draft.
  t.mock.method(f.service, 'readReport', async () => ({ ...verified, versionId: stored.sha256 }));
  assert.equal(metricMethods.capture.snapshotSha256, policyHash(f.first.snapshotBytes), 'matching sha alone cannot upgrade a historical policy');
  const record = await buildAndReadPolicy(f, f.first.packageId);
  assert.equal(record.captureRowPolicy, CAPTURE_ROW_PROFILE_V2);
  assert.equal(record.input.rows.length, 5);
});

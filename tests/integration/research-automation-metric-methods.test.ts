import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import type { DiscoveryWorkspaceReader } from '../../src/modules/flow/discovery-workspace-reader.js';
import { AutomationMetricMethodBridge, metricMethodFailureCode, type MetricMethodFailureCode, type MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';

// Primary owner: the Metric source/formula bridge boundary. Profile cell
// mapping belongs to metric-source-profile tests; service placement and HTML
// presentation belong to research-automation-metric-report.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const seededAt = () => new Date('2026-09-20T00:00:00.000Z');
const executedAt = () => new Date('2026-10-03T01:00:00.000Z');
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));

function runInput(requestedPeriod = { startDate: '2026-08-17', endDate: '2026-09-15', dayCount: 30 }): MetricRunInput {
  return { runId, scopeConfirmedAt: '2026-10-03T00:30:00.000Z',
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'PRODUCT', keyword: 'nồi chiên',
      description: null, interview: null, requestedPeriod, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic export subset',
      includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] } };
}

function workbook(): Buffer {
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2' }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  return generated.stdout;
}

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-methods-'));
  const db = openDatabase({ databasePath: path.join(directory, 'db.sqlite'), now: seededAt }).db;
  const artifactStore = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore, now: seededAt, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-methods', title: 'Synthetic Metric methods' });
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const bridge = new AutomationMetricMethodBridge({ db, artifactStore, workspaces, now: executedAt });
  const changes = () => (db.prepare('SELECT total_changes() count').get() as { count: number | bigint }).count;
  const acquiredAt = (digest: string) => (db.prepare('SELECT acquired_at acquiredAt FROM artifact_manifests WHERE sha256=?').get(digest) as { acquiredAt: string }).acquiredAt;
  const raw = workbook();
  async function attach(input: MetricRunInput, options: { version?: number; binding?: string; end?: string; runId?: string; profileId?: string; lastRow?: number; workbook?: Buffer;
    preparedKey?: string } = {}) {
    const attachedRunId = options.runId ?? runId;
    const workbookBytes = options.workbook ?? raw;
    const manifest = json({ contractVersion: '1.0.0', profileId: options.profileId ?? 'metric-shopee-product-list-sheet1-v2', profileVersion: '2.0.0',
      source: { sha256: sha(workbookBytes), label: 'Synthetic keyword export', provenanceBasis: 'Synthetic fixture, not collected', evidenceFamily: 'synthetic-metric',
        sheetName: 'Sheet1', headerSha256: 'b5b493190917fac69bd1e2cf1aa618aae175a7fd314ec635e44bcf29aab6f7ac', lastRow: options.lastRow ?? 3 },
      scope: { key: 'synthetic-keyword-export', platform: 'shopee', selection: 'UNSPECIFIED', start: '2026-08-17', end: options.end ?? '2026-09-15',
        periodBasis: 'Synthetic export measurement period', acquiredAt: null }, precision: { revenue: 'unknown', units: 'unknown' },
      labelCodebookVersion: 'unassigned-v1', wideUnknownPolicy: 'exclude' });
    const stableInput = { runId: input.runId, start: input.start, scope: input.scope };
    const descriptor = json({ contractVersion: options.preparedKey ? 'automation-metric-source-v2' : 'automation-metric-source-v1',
      runId: attachedRunId, workspaceId, runBindingSha256: options.binding ?? sha(json(options.preparedKey ? stableInput : input)),
      keyword: 'nồi chiên', workbookPath: 'metric/export.xlsx', manifestPath: 'metric/manifest.json', labelsPath: null, sourceContextPath: 'metric/context.txt' });
    const documents = [
      { path: 'metric/export.xlsx', bytes: workbookBytes, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', representationRole: 'structured' as const },
      { path: 'metric/manifest.json', bytes: manifest, mediaType: 'application/json', representationRole: 'derived' as const },
      { path: 'metric/context.txt', bytes: Buffer.from('Keyword typed by operator: nồi chiên. Export filters not captured.\n'), mediaType: 'text/plain', representationRole: 'derived' as const },
      { path: 'normalized/automation-metric-source.json', bytes: descriptor, mediaType: 'application/json', representationRole: 'derived' as const },
    ];
    const packages = new SourcePackageService({ db, artifactStore, now: seededAt });
    const request = { contractVersion: '1.0.0', packageKey: options.preparedKey ?? `automation-metric-source:${attachedRunId}`,
      version: options.version ?? 1, sourceLabel: 'Synthetic run-attached Metric export', sourceAcquiredAt: '2026-09-16T08:00:00.000Z',
      files: documents.map(file => ({ path: file.path, sha256: sha(file.bytes), byteSize: file.bytes.length, mediaType: file.mediaType,
        representationRole: file.representationRole, evidenceFamily: 'synthetic-metric', independence: 'non_independent' as const,
        providerProvenance: 'operator_supplied_unverified' as const, provenanceBasis: 'Synthetic fixture modeling an operator attachment' })) };
    const bytes = new Map(documents.map(file => [file.path, file.bytes]));
    return options.preparedKey ? packages.intakeAutomationAttachment(request, bytes, sha(json(stableInput))) : packages.intake(request, bytes);
  }
  return { db, artifactStore, workspaces, bridge, changes, acquiredAt, raw, attach };
}

test('source-bound confirmation admits the prepared Metric bytes before collection and replays its exact selection despite later alternatives', async t => {
  const f = await fixture(t);
  const input = runInput();
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifactStore, workspaceReader: f.workspaces,
    now: executedAt, uuid: () => runId, renderer: buildResearchAutomationReport });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: input.start.mode, keyword: input.start.keyword, requestedPeriod: { startDate: input.start.requestedPeriod.startDate,
      endDate: input.start.requestedPeriod.endDate }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  // New starts freeze the peer policy before discovery. A prepared source must
  // bind that exact retained start, not the marker-free historical fixture.
  const stale = await f.attach(input, { preparedKey: 'prepared-metric:marker-free' });
  const beforeStale = f.changes();
  await assert.rejects(service.confirmScope(workspaceId, runId, {
    contractVersion: 'research-automation-confirm-v2', requestKey: '45454545-4545-4545-8545-454545454545',
    expectedRevision: awaiting.revision, definition: input.scope.definition, includeTerms: [], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], sources: { metric: { decision: 'USE_PREPARED', packageId: stale.packageId }, nativeReview: 'SKIP' },
  }), (error: unknown) => metricMethodFailureCode(error) === 'METRIC_SOURCE_RUN_MISMATCH');
  assert.equal(f.changes(), beforeStale, 'A mismatched prepared source cannot persist confirmation or admission.');
  const startRow = f.db.prepare('SELECT start_request_sha256 sha FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { sha: string };
  input.start = JSON.parse((await f.artifactStore.read(startRow.sha)).toString()) as MetricRunInput['start'];
  const source = await f.attach(input, { preparedKey: 'prepared-metric:first' });
  const request = { contractVersion: 'research-automation-confirm-v2', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: input.scope.definition, includeTerms: [], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], sources: { metric: { decision: 'USE_PREPARED', packageId: source.packageId }, nativeReview: 'SKIP' } };
  await service.confirmScope(workspaceId, runId, request);
  const admission = f.db.prepare('SELECT source_set_sha256 sha FROM analysis_research_automation_source_sets WHERE run_id=?').get(runId) as { sha: string };
  const frozen = JSON.parse((await f.artifactStore.read(admission.sha)).toString());
  assert.equal(frozen.metric.sourcePackage.packageId, source.packageId);
  assert.equal(frozen.metric.sourcePackage.packageContentSha256, source.packageContentSha256);
  await f.attach(input, { preparedKey: 'prepared-metric:second', end: '2026-09-14' });
  const changes = f.changes();
  assert.equal((await service.confirmScope(workspaceId, runId, request)).exactRetry, true);
  assert.equal(f.changes(), changes);
  await service.processNext(); await service.processNext();
  const ready = await service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  const semantic = JSON.parse((await f.artifactStore.read(ready.outputs!.market!.versionId)).toString());
  assert.equal(semantic.confirmedSourceSetSha256, admission.sha);
  assert.equal(semantic.metricMethods.contractVersion, 'automation-metric-method-snapshot-v2');
  assert.equal(semantic.metricMethods.originalSourcePackage.packageId, source.packageId);
  assert.equal(semantic.metricMethods.result.scopes[0].revenue.value, '150');
  const beforeRead = f.changes();
  const priorPath = process.env.PATH;
  try {
    process.env.PATH = '/no-python';
    f.db.pragma('query_only = ON');
    await service.readReport(workspaceId, runId, 'MARKET');
    assert.equal(f.changes(), beforeRead);
  } finally { process.env.PATH = priorPath; f.db.pragma('query_only = OFF'); }
  const firstPair = (await service.listReportVersions(workspaceId, runId))[0]!;
  const nextSource = await f.attach(input, { preparedKey: 'automation-attachment:later-explicit-period', end: '2026-09-14' });
  const supplement = { contractVersion: 'automation-report-revision-v1', requestKey: '73737373-7373-4373-8373-737373737373', previousPairId: firstPair.pairId,
    sources: { metric: { decision: 'USE_PREPARED', packageId: nextSource.packageId }, nativeReview: { decision: 'KEEP' } } };
  await service.requestReportRevision(workspaceId, runId, supplement);
  await service.processNext();
  const secondPair = (await service.listReportVersions(workspaceId, runId))[1]!;
  const secondSemantic = JSON.parse((await f.artifactStore.read(secondPair.outputs[0]!.versionId)).toString());
  assert.equal(secondSemantic.metricMethods.originalSourcePackage.packageId, nextSource.packageId);
  assert.equal(secondSemantic.metricMethods.result.input.scope.end, '2026-09-14');
  const packagesBeforeKeep = f.db.prepare('SELECT count(*) n FROM foundation_source_packages').get();
  await service.requestReportRevision(workspaceId, runId, { ...supplement, requestKey: '74747474-7474-4474-8474-747474747474', previousPairId: secondPair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  const beforePath = process.env.PATH;
  try {
    process.env.PATH = '/no-normalizer-for-unchanged-method';
    await service.processNext();
    const versions = await service.listReportVersions(workspaceId, runId);
    assert.deepEqual(versions.map(pair => pair.versionNumber), [1, 2, 3]);
    const keptSemantic = JSON.parse((await f.artifactStore.read(versions[2]!.outputs[0]!.versionId)).toString());
    assert.deepEqual(keptSemantic.metricMethods, secondSemantic.metricMethods, 'An unchanged source reuses its exact retained method, not a new calculation.');
    assert.deepEqual(f.db.prepare('SELECT count(*) n FROM foundation_source_packages').get(), packagesBeforeKeep);
    for (const pair of versions) await service.readReport(workspaceId, runId, 'MARKET', false, pair.pairId);
  } finally { process.env.PATH = beforePath; }
});

test('attached raw Metric export computes the full generic ALL scope, keeps label-dependent scopes and M03/M04 blocked, and freezes every input', async t => {
  const f = await fixture(t);
  const input = runInput();
  await f.attach(input);
  const snapshot = await f.bridge.execute(input);
  assert.ok(snapshot);
  const [all, wide, core] = snapshot.result.scopes;
  assert.equal(all!.status, 'CALCULATED');
  assert.equal(all!.revenue.value, '150');
  assert.equal(all!.units.value, '2');
  assert.equal(all!.listingCount, 2);
  assert.equal(all!.shopCount, 2);
  const top1 = all!.concentration.find(row => row.k === 1)!;
  assert.deepEqual([top1.usedShopCount, top1.share!.numerator, top1.share!.denominator, top1.share!.percent], [1, '100', '150', '66.67']);
  assert.equal(all!.withoutTopShop!.removedShopKey, '["shopee","10"]');
  assert.equal(all!.withoutTopShop!.revenue.value, '50');
  assert.deepEqual([wide!.status, core!.status], ['BLOCKED_LABELS', 'BLOCKED_LABELS']);
  assert.equal(snapshot.result.labelIssues.length, 2);
  assert.deepEqual(snapshot.result.comparisons, []);
  assert.deepEqual(snapshot.result.input.records.map(row => [row.revenue.source.locator, row.units.source.locator]), [['Sheet1!E2', 'Sheet1!D2'], ['Sheet1!E3', 'Sheet1!D3']]);
  assert.equal(snapshot.result.input.sources[0]!.sha256, sha(f.raw));
  const state = new Map(snapshot.readiness.sections.map(section => [section.sectionId, section.state]));
  assert.deepEqual([state.get('M03'), state.get('M04')], ['BLOCKED', 'BLOCKED']);
  assert.equal(snapshot.preparation.request.labelsPath, null);
  assert.ok(snapshot.limitations.includes('ALL_SCOPE_IS_BOUNDED_OBSERVED_KEYWORD_EXPORT_SAMPLE_NOT_WHOLE_MARKET'));
  assert.ok(snapshot.limitations.includes('CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED'));

  const retained = await new SourcePackageService({ db: f.db, artifactStore: f.artifactStore }).readVerified(snapshot.sourcePackage.packageId);
  assert.equal(retained.manifest.packageKey, `automation-method:${runId}-metric-v1`);
  assert.equal(retained.manifest.sourceAcquiredAt, '2026-09-16T08:00:00.000Z');
  assert.ok(retained.files.find(file => file.path === 'metric/export.xlsx')!.bytes.equals(f.raw));
  assert.equal(retained.files.find(file => file.path === 'metric/export.xlsx')!.representationRole, 'structured');
  assert.ok(retained.files.find(file => file.path === 'authority/report-section-catalog-v1.json')!.bytes
    .equals(await fs.readFile(new URL('../../docs/research/report-section-catalog-v1.json', import.meta.url))));
  assert.ok(retained.files.every(file => file.independence === 'non_independent'));
  const config = JSON.parse(retained.files.find(file => file.path === 'methods/metric-run.json')!.bytes.toString());
  assert.deepEqual(config.period, { requested: input.start.requestedPeriod, source: { start: '2026-08-17', end: '2026-09-15' }, coverage: 'EXACT_REQUESTED_PERIOD' });
  assert.equal(config.sourceContext.logicalPath, 'metric/context.txt');
  // The method intake runs at executedAt; first storage of the shared raw bytes stays authoritative.
  assert.equal(f.acquiredAt(sha(f.raw)), '2026-09-20T00:00:00.000Z');

  const before = f.changes();
  assert.deepEqual(await f.bridge.execute(input), snapshot);
  assert.equal(f.changes(), before);
});

test('historical verify replays only frozen bytes: no Python, live workspace, clock, calculator or writes', async t => {
  const f = await fixture(t);
  const input = runInput();
  await f.attach(input);
  const snapshot = JSON.parse(JSON.stringify(await f.bridge.execute(input)));
  const before = f.changes();
  const unavailable = { readVerifiedWorkspace: () => { throw new Error('historical verify must not read the live workspace'); } } as unknown as DiscoveryWorkspaceReader;
  const historical = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifactStore, workspaces: unavailable,
    now: () => { throw new Error('historical verify must not use the clock'); } });
  const priorPath = process.env.PATH;
  f.db.pragma('query_only=ON');
  try {
    process.env.PATH = '/no-python-for-historical-verify';
    assert.deepEqual(await historical.verify(snapshot, input), snapshot);
  } finally { process.env.PATH = priorPath; f.db.pragma('query_only=OFF'); }
  assert.equal(f.changes(), before);

  await assert.rejects(historical.verify(snapshot, { ...input, scopeConfirmedAt: '2026-10-03T00:31:00.000Z' }), /snapshot identity is invalid/);
  const altered = structuredClone(snapshot);
  altered.result.scopes[0].revenue.value = '151';
  await assert.rejects(historical.verify(altered, input), /differs from its frozen retained bytes/);
  const retainedResult = f.artifactStore.pathForDigest(sha(json(snapshot.result)));
  const exact = await fs.readFile(retainedResult);
  await fs.writeFile(retainedResult, Buffer.from(exact.toString().replace('"150"', '"151"')));
  await assert.rejects(historical.verify(snapshot, input), ArtifactIntegrityError);
  await fs.rm(retainedResult);
  await assert.rejects(historical.verify(snapshot, input), { code: 'ENOENT' });
});

test('warm retained Metric compilation cannot bypass schema, source, output or manifest corruption', async t => {
  const f = await fixture(t);
  const input = runInput();
  await f.attach(input);
  const snapshot = await f.bridge.execute(input);
  assert.ok(snapshot);
  const packages = new SourcePackageService({ db: f.db, artifactStore: f.artifactStore });
  const retained = await packages.readVerified(snapshot.sourcePackage.packageId);
  let clockCalls = 0, workspaceCalls = 0, puts = 0;
  const historical = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifactStore,
    workspaces: { readVerifiedWorkspace: () => { workspaceCalls++; throw new Error('No live workspace'); } } as unknown as DiscoveryWorkspaceReader,
    now: () => { clockCalls++; throw new Error('No live clock'); } });
  f.artifactStore.put = async () => { puts++; throw new Error('No CAS writes'); };
  const tables = () => JSON.stringify((f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map(row => [row.name, f.db.prepare('SELECT * FROM ' + JSON.stringify(row.name)).all()]), (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  const before = tables(), changes = f.changes();
  const priorPath = process.env.PATH;
  f.db.pragma('query_only=ON');
  try {
    process.env.PATH = '/no-python-for-warm-retained-verify';
    assert.deepEqual(await historical.verify(snapshot, input), snapshot);
    assert.deepEqual(await historical.verify(snapshot, input), snapshot);
    for (const logicalPath of ['profiles/metric-scope-output.schema.json', 'metric/export.xlsx',
      'methods/metric-normalized-input.json', 'methods/metric-scope-output.json']) {
      const member = retained.files.find(value => value.path === logicalPath)!;
      const physical = f.artifactStore.pathForDigest(member.sha256);
      const exact = await fs.readFile(physical);
      try {
        await fs.writeFile(physical, Buffer.from('corrupt retained ' + logicalPath));
        await assert.rejects(historical.verify(snapshot, input), ArtifactIntegrityError);
        assert.equal(tables(), before);
        assert.equal(f.changes(), changes);
      } finally { await fs.writeFile(physical, exact); }
      assert.deepEqual(await historical.verify(snapshot, input), snapshot);
    }
    const changed = structuredClone(snapshot);
    changed.result.scopes[0]!.revenue.value = '151';
    await assert.rejects(historical.verify(changed, input), /differs from its frozen retained bytes/);
    await assert.rejects(historical.verify(snapshot, { ...input, runId: '33333333-3333-4333-8333-333333333333' }), /snapshot identity is invalid/);
    assert.equal(tables(), before);
    assert.equal(f.changes(), changes);
  } finally { process.env.PATH = priorPath; f.db.pragma('query_only=OFF'); }
  const profile = retained.files.find(value => value.path === 'profiles/metric-scope-output.schema.json')!;
  const media = f.db.prepare('SELECT media_type value FROM artifact_manifests WHERE sha256=?').get(profile.sha256) as { value: string };
  f.db.prepare("UPDATE artifact_manifests SET media_type='text/plain' WHERE sha256=?").run(profile.sha256);
  const altered = tables(), afterHarnessWrite = f.changes();
  f.db.pragma('query_only=ON');
  try {
    await assert.rejects(historical.verify(snapshot, input), /Artifact manifest mismatch/);
    assert.equal(tables(), altered);
    assert.equal(f.changes(), afterHarnessWrite);
  } finally {
    f.db.pragma('query_only=OFF');
    f.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run(media.value, profile.sha256);
  }
  f.db.pragma('query_only=ON');
  try { assert.deepEqual(await historical.verify(snapshot, input), snapshot); assert.equal(tables(), before); }
  finally { f.db.pragma('query_only=OFF'); }
  assert.deepEqual({ clockCalls, workspaceCalls, puts }, { clockCalls: 0, workspaceCalls: 0, puts: 0 });
});

test('explicit attachment only: absent is undefined without writes; a shorter declared period is kept, not expanded', async t => {
  const absent = await fixture(t);
  const before = absent.changes();
  assert.equal(await absent.bridge.execute(runInput()), undefined);
  assert.equal(absent.changes(), before);

  const shorter = await fixture(t);
  const wider = runInput({ startDate: '2026-08-17', endDate: '2026-09-16', dayCount: 31 });
  await shorter.attach(wider);
  const snapshot = await shorter.bridge.execute(wider);
  assert.ok(snapshot!.limitations.includes('SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED'));
  assert.deepEqual([snapshot!.result.input.scope.start, snapshot!.result.input.scope.end], ['2026-08-17', '2026-09-15']);
  assert.equal(snapshot!.result.scopes[0]!.revenue.value, '150');
});

test('frozen Metric selections use exact prepared source identities and execution-specific snapshots without changing v1 replay', async t => {
  const f = await fixture(t);
  const input = runInput();
  await f.attach(input);
  const legacy = await f.bridge.execute(input);
  assert.equal(legacy!.contractVersion, 'automation-metric-method-snapshot-v1');
  const first = await f.attach(input, { preparedKey: 'automation-attachment:synthetic-first' });
  const selected: MetricRunInput = { ...input, scopeConfirmedAt: '2026-10-03T00:45:00.000Z', sourceSelection: {
    executionId: '44444444-4444-4444-8444-444444444444', sourcePackage: { packageId: first.packageId,
      manifestArtifactSha256: first.manifestArtifactSha256, packageContentSha256: first.packageContentSha256 } } };
  const original = await f.bridge.execute(selected);
  assert.equal(original!.contractVersion, 'automation-metric-method-snapshot-v2');
  assert.deepEqual(original!.originalSourcePackage, selected.sourceSelection!.sourcePackage);
  const firstMethod = await new SourcePackageService({ db: f.db, artifactStore: f.artifactStore }).readVerified(original!.sourcePackage.packageId);
  assert.equal(firstMethod.manifest.packageKey, `automation-method:${runId}-metric-v2-44444444-4444-4444-8444-444444444444`);
  const second = await f.attach(input, { preparedKey: 'automation-attachment:synthetic-supplement', end: '2026-09-14' });
  const supplementary: MetricRunInput = { ...selected, sourceSelection: { executionId: '55555555-5555-4555-8555-555555555555',
    sourcePackage: { packageId: second.packageId, manifestArtifactSha256: second.manifestArtifactSha256, packageContentSha256: second.packageContentSha256 } } };
  const revised = await f.bridge.execute(supplementary);
  assert.notEqual(revised!.sourcePackage.packageId, original!.sourcePackage.packageId);
  assert.notEqual(revised!.runBindingSha256, original!.runBindingSha256);
  assert.ok(revised!.limitations.includes('SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED'));
  const before = f.changes();
  assert.deepEqual(await f.bridge.execute(selected), original);
  assert.equal(f.changes(), before);
  await assert.rejects(f.bridge.execute({ ...selected, scope: { ...selected.scope, definition: 'changed scope' } }),
    error => metricMethodFailureCode(error) === 'METRIC_SOURCE_RUN_MISMATCH');
  await assert.rejects(f.bridge.execute({ ...selected, sourceSelection: { ...selected.sourceSelection!, sourcePackage: {
    ...selected.sourceSelection!.sourcePackage!, packageContentSha256: 'f'.repeat(64) } } }),
    error => metricMethodFailureCode(error) === 'METRIC_SOURCE_INTEGRITY_FAILED');
  assert.equal(f.changes(), before);
  const absent = { ...selected, sourceSelection: { executionId: '66666666-6666-4666-8666-666666666666', sourcePackage: null } };
  assert.equal(await f.bridge.execute(absent), undefined, 'A frozen absence cannot discover the existing legacy or prepared packages');
  const priorPath = process.env.PATH;
  f.db.pragma('query_only=ON');
  try {
    process.env.PATH = '/no-python-for-v2-replay';
    assert.deepEqual(await f.bridge.verify(legacy, input), legacy);
    assert.deepEqual(await f.bridge.verify(original, selected), original);
    assert.deepEqual(await f.bridge.verify(revised, supplementary), revised);
    await assert.rejects(f.bridge.verify(original, supplementary), /snapshot identity is invalid/);
    await assert.rejects(f.bridge.verify(original, input), /snapshot identity is invalid/);
    assert.equal(f.changes(), before);
  } finally { process.env.PATH = priorPath; f.db.pragma('query_only=OFF'); }
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
const narrower = runInput({ startDate: '2026-08-20', endDate: '2026-09-15', dayCount: 27 });
// Failure is never absence. Each attached failure keeps only the closed reason its owner establishes; anything else stays generic.
const failures: ReadonlyArray<{ name: string; code: MetricMethodFailureCode; input?: MetricRunInput; withoutLocalReader?: true; unstructuredReaderFailure?: true;
  arrange: (f: Fixture, input: MetricRunInput) => Promise<unknown> }> = [
  { name: 'damaged retained bytes', code: 'METRIC_SOURCE_INTEGRITY_FAILED', arrange: async (f, input) => {
    const damaged = await f.attach(input);
    await fs.writeFile(f.artifactStore.pathForDigest(damaged.manifestArtifactSha256), 'damaged attachment manifest');
  } },
  // A supported version beside another version of the same run key is never chosen silently.
  { name: 'two versions of the run key', code: 'METRIC_SOURCE_AMBIGUOUS', arrange: async (f, input) => { await f.attach(input, { version: 2 }); await f.attach(input); } },
  { name: 'unsupported attachment version', code: 'METRIC_SOURCE_UNSUPPORTED', arrange: (f, input) => f.attach(input, { version: 2 }) },
  { name: 'unsupported export profile', code: 'METRIC_SOURCE_UNSUPPORTED', arrange: (f, input) => f.attach(input, { profileId: 'metric-shopee-product-list-sheet1-v9' }) },
  { name: 'descriptor bound to another confirmed run', code: 'METRIC_SOURCE_RUN_MISMATCH', arrange: (f, input) => f.attach(input, { binding: 'f'.repeat(64) }) },
  { name: 'declared period outside the request', code: 'METRIC_SOURCE_PERIOD_CONFLICT', input: narrower, arrange: (f, input) => f.attach(input) },
  { name: 'export rows differ from the manifest', code: 'METRIC_SOURCE_INPUT_REJECTED', arrange: (f, input) => f.attach(input, { lastRow: 4 }) },
  // The profile owner's unavailable local reader is not evidence about the source or its rows.
  { name: 'local reader unavailable', code: 'METRIC_METHOD_FAILED', withoutLocalReader: true, arrange: (f, input) => f.attach(input) },
  { name: 'invalid workbook archive', code: 'METRIC_SOURCE_INPUT_REJECTED', arrange: (f, input) => f.attach(input, { workbook: Buffer.from('synthetic bytes that are not an OOXML zip') }) },
  // A reader crash without a structured diagnostic is not evidence of rejected source data.
  { name: 'unstructured reader failure', code: 'METRIC_METHOD_FAILED', unstructuredReaderFailure: true, arrange: (f, input) => f.attach(input) },
];
for (const { name, code, input = runInput(), withoutLocalReader, unstructuredReaderFailure, arrange } of failures) {
  test(`attached Metric failure keeps its closed reason without writes: ${name}`, async t => {
    const f = await fixture(t);
    await arrange(f, input);
    const before = f.changes();
    const priorPath = process.env.PATH;
    let readerDirectory: string | undefined;
    if (unstructuredReaderFailure) {
      readerDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-reader-failure-'));
      t.after(() => fs.rm(readerDirectory!, { recursive: true, force: true }));
      await fs.writeFile(path.join(readerDirectory, 'python3'), '#!/bin/sh\nprintf \'%s\\n\' \'synthetic reader failure\' >&2\nexit 1\n', { mode: 0o700 });
    }
    let error: unknown;
    try {
      if (withoutLocalReader) process.env.PATH = '/no-python-for-metric-reader';
      if (readerDirectory) process.env.PATH = readerDirectory;
      error = await f.bridge.execute(input).then(() => assert.fail('an attached Metric failure must not be skipped'), (value: unknown) => value);
    } finally { process.env.PATH = priorPath; }
    assert.equal(metricMethodFailureCode(error), code);
    assert.equal(f.changes(), before, 'attached Metric failures reject before any preparation or method writes');
  });
}

test('run-attached Metric resolution reads only its exact key: over 100 other attachments, one damaged, cannot block it', async t => {
  const f = await fixture(t);
  const input = runInput();
  const others = [];
  for (let index = 0; index < 101; index += 1)
    others.push(await f.attach(input, { runId: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}` }));
  await fs.writeFile(f.artifactStore.pathForDigest(others[0]!.manifestArtifactSha256), 'damaged unrelated attachment manifest');
  const attached = await f.attach(input);
  const snapshot = await f.bridge.execute(input);
  assert.deepEqual(snapshot!.originalSourcePackage, { packageId: attached.packageId,
    manifestArtifactSha256: attached.manifestArtifactSha256, packageContentSha256: attached.packageContentSha256 });
});

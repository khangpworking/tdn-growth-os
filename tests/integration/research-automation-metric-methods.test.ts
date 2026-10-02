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
import { AutomationMetricMethodBridge, type MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationIntegrityError } from '../../src/modules/analysis/research-automation/model.js';

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
  async function attach(input: MetricRunInput, options: { version?: number; binding?: string; end?: string } = {}) {
    const manifest = json({ contractVersion: '1.0.0', profileId: 'metric-shopee-product-list-sheet1-v2', profileVersion: '2.0.0',
      source: { sha256: sha(raw), label: 'Synthetic keyword export', provenanceBasis: 'Synthetic fixture, not collected', evidenceFamily: 'synthetic-metric',
        sheetName: 'Sheet1', headerSha256: 'b5b493190917fac69bd1e2cf1aa618aae175a7fd314ec635e44bcf29aab6f7ac', lastRow: 3 },
      scope: { key: 'synthetic-keyword-export', platform: 'shopee', selection: 'UNSPECIFIED', start: '2026-08-17', end: options.end ?? '2026-09-15',
        periodBasis: 'Synthetic export measurement period', acquiredAt: null }, precision: { revenue: 'unknown', units: 'unknown' },
      labelCodebookVersion: 'unassigned-v1', wideUnknownPolicy: 'exclude' });
    const descriptor = json({ contractVersion: 'automation-metric-source-v1', runId, workspaceId, runBindingSha256: options.binding ?? sha(json(input)),
      keyword: 'nồi chiên', workbookPath: 'metric/export.xlsx', manifestPath: 'metric/manifest.json', labelsPath: null, sourceContextPath: 'metric/context.txt' });
    const documents = [
      { path: 'metric/export.xlsx', bytes: raw, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', representationRole: 'structured' as const },
      { path: 'metric/manifest.json', bytes: manifest, mediaType: 'application/json', representationRole: 'derived' as const },
      { path: 'metric/context.txt', bytes: Buffer.from('Keyword typed by operator: nồi chiên. Export filters not captured.\n'), mediaType: 'text/plain', representationRole: 'derived' as const },
      { path: 'normalized/automation-metric-source.json', bytes: descriptor, mediaType: 'application/json', representationRole: 'derived' as const },
    ];
    return new SourcePackageService({ db, artifactStore, now: seededAt }).intake({ contractVersion: '1.0.0', packageKey: `automation-metric-source:${runId}`,
      version: options.version ?? 1, sourceLabel: 'Synthetic run-attached Metric export', sourceAcquiredAt: '2026-09-16T08:00:00.000Z',
      files: documents.map(file => ({ path: file.path, sha256: sha(file.bytes), byteSize: file.bytes.length, mediaType: file.mediaType,
        representationRole: file.representationRole, evidenceFamily: 'synthetic-metric', independence: 'non_independent' as const,
        providerProvenance: 'operator_supplied_unverified' as const, provenanceBasis: 'Synthetic fixture modeling an operator attachment' })) },
    new Map(documents.map(file => [file.path, file.bytes])));
  }
  return { db, artifactStore, workspaces, bridge, changes, acquiredAt, raw, attach };
}

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

test('explicit attachment only: absent is undefined, while wrong binding, unsupported version and out-of-range periods fail closed', async t => {
  const absent = await fixture(t);
  const before = absent.changes();
  assert.equal(await absent.bridge.execute(runInput()), undefined);
  assert.equal(absent.changes(), before);

  const unbound = await fixture(t);
  await unbound.attach(runInput(), { binding: 'f'.repeat(64) });
  await assert.rejects(unbound.bridge.execute(runInput()), (error: unknown) => error instanceof ResearchAutomationIntegrityError && /not bound to this confirmed run/.test(error.message));

  const future = await fixture(t);
  await future.attach(runInput(), { version: 2 });
  await assert.rejects(future.bridge.execute(runInput()), (error: unknown) => error instanceof ResearchAutomationIntegrityError && /version is unsupported/.test(error.message));

  const outside = await fixture(t);
  const narrower = runInput({ startDate: '2026-08-20', endDate: '2026-09-15', dayCount: 27 });
  await outside.attach(narrower);
  const beforeOutside = outside.changes();
  await assert.rejects(outside.bridge.execute(narrower), /outside the requested dates/);
  assert.equal(outside.changes(), beforeOutside, 'out-of-request source dates must reject before any preparation writes');

  const shorter = await fixture(t);
  const wider = runInput({ startDate: '2026-08-17', endDate: '2026-09-16', dayCount: 31 });
  await shorter.attach(wider);
  const snapshot = await shorter.bridge.execute(wider);
  assert.ok(snapshot!.limitations.includes('SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED'));
  assert.deepEqual([snapshot!.result.input.scope.start, snapshot!.result.input.scope.end], ['2026-08-17', '2026-09-15']);
  assert.equal(snapshot!.result.scopes[0]!.revenue.value, '150');
});

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { reportMethodPacketsFixture } from '../helpers/report-method-packets-fixture.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';
import type { AutomationBoundedMethodSnapshot } from '../../contracts/analysis/automation-bounded-method-snapshot.generated.js';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date('2026-10-04T00:00:00.000Z');

// The persisted REPORTS lifecycle owns source admission, inheritance and report
// delivery together. Source-helper tests cannot detect a missing production wire.
test('exact non-Metric package flows through a bounded revision, frozen replay, KEEP and SKIP without analytical completion', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-bounded-revision-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const workspaceId = randomUUID(), runId = randomUUID();
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'bounded-source', title: 'Synthetic independent package' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now, uuid: () => runId,
    renderer: (input, kind) => {
      const rendered = buildResearchAutomationReport(input, kind);
      // Presentation must not invent or replace the persisted method proof.
      return { ...rendered, semantic: { ...rendered.semantic, boundedMethods: { forged: true } } };
    } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'synthetic generic category', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: awaiting.revision, definition: 'Synthetic category', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
  await service.processNext(); await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const original = (await service.listReportVersions(workspaceId, runId))[0]!;
  const originalHtml = (await service.readReport(workspaceId, runId, 'MARKET')).bytes;
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  const fixture = reportMethodPacketsFixture();
  const intake = async (decisions = false, drift = false) => {
    const descriptor = structuredClone(fixture.descriptor);
    if (!decisions) descriptor.decisions = null;
    if (drift) descriptor.gates!.m10!.series[0]!.rows[0]!.source.locator = '/m10/series/0/rows/1';
    const bytes = Buffer.from(canonicalJson(descriptor));
    const files = fixture.files.filter(file => file.path === fixture.gateSourcePath ||
      file.path === 'method-packets/advanced-profile.md' || file.path === 'method-packets/adoption.md' ||
      (decisions && file.path === 'method-packets/synthesis-ai-profile.md'));
    files.push({ ...fixture.files.find(file => file.path === fixture.logicalPath)!, bytes, byteSize: bytes.length, sha256: hash(bytes) });
    const receipt = await packages.intake({ contractVersion: '1.0.0', packageKey: `synthetic:g-${randomUUID()}`, version: 1,
      sourceLabel: 'Synthetic source-only methods', sourceAcquiredAt: null,
      files: files.map(({ bytes: _bytes, ...metadata }) => metadata) }, new Map(files.map(file => [file.path, file.bytes])));
    return { decision: 'USE_PACKAGE' as const, packageId: receipt.packageId, manifestArtifactSha256: receipt.manifestArtifactSha256,
      packageContentSha256: receipt.packageContentSha256, descriptorPath: fixture.logicalPath };
  };
  const selection = await intake();
  const request = { contractVersion: 'automation-bounded-report-revision-v1', requestKey: randomUUID(), previousPairId: original.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, boundedMethods: selection };
  const invalidSelections = [
    { ...selection, packageContentSha256: 'f'.repeat(64) },
    { ...selection, manifestArtifactSha256: 'f'.repeat(64) },
    { ...selection, descriptorPath: 'missing.json' }, await intake(true), await intake(false, true),
  ];
  const changes = () => db.prepare('SELECT total_changes() n').get();
  for (const invalid of invalidSelections) {
    const before = changes();
    await assert.rejects(service.requestReportRevision(workspaceId, runId, { ...request, requestKey: randomUUID(), boundedMethods: invalid }));
    assert.deepEqual(changes(), before, 'Invalid source admission must not enqueue or register artifacts');
  }
  const queued = await service.requestReportRevision(workspaceId, runId, request);
  const beforeRetry = changes();
  assert.equal((await service.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  assert.deepEqual(changes(), beforeRetry);
  await service.processNext();
  const versions = await service.listReportVersions(workspaceId, runId);
  assert.equal(versions.length, 2);
  const pair = versions[1]!;
  assert.equal(pair.attemptId, queued.attemptId);
  const saved = new Map<string, Buffer>();
  let snapshot: AutomationBoundedMethodSnapshot | undefined;
  for (const kind of ['MARKET', 'INSIGHT'] as const) {
    const report = await service.readReport(workspaceId, runId, kind, false, pair.pairId);
    saved.set(kind, report.bytes);
    const semantic = JSON.parse((await artifacts.read(report.versionId)).toString());
    const current = semantic.boundedMethods as AutomationBoundedMethodSnapshot;
    snapshot ??= current;
    assert.deepEqual(current, snapshot);
    assert.deepEqual(current.selection, selection);
    assert.equal(current.binding.previousPairId, original.pairId);
    assert.equal(current.output.sections.M10.forecasts, null);
    assert.equal(current.output.sections.I11.publicationStatus, 'NOT_AUTHORIZED');
    assert.equal(current.output.sections.I12.rates, null);
    assert.equal(current.output.sections.I16.estimate, null);
    assert.deepEqual(current.output.sections.M10.partitions[0]!.observedZeroDates, ['2026-01-02']);
    assert.equal(semantic.completion.completedAnalyticalSections, 0);
    const expectedIds = kind === 'MARKET' ? ['M10'] : ['I11', 'I12', 'I16'];
    const doc = new JSDOM(report.bytes.toString()).window.document;
    for (const id of expectedIds) {
      assert.ok(semantic.completion.evidenceInventorySectionIds.includes(id));
      assert.ok(!semantic.completion.boundedMethodOutputSectionIds.includes(id));
      const link = doc.querySelector(`#${id} a[href="#bounded-method-evidence"]`);
      assert.ok(link, 'Source-backed gate body must be visible, not only its state badge');
      assert.equal(link.hasAttribute('download'), false);
    }
    assert.equal(doc.querySelector('a[href="report-method-evidence.json"]'), null);
    assert.deepEqual(JSON.parse(doc.querySelector('#bounded-method-evidence pre')!.textContent!), current);
    assert.equal(doc.querySelectorAll('script').length, 0);
    const html = report.bytes.toString();
    assert.deepEqual(visibleTextViolations(reportVisibleText(doc)), [], 'reader text keeps provider names, digests and status codes out');
    assert.deepEqual(providerNameViolations(html), [], 'no disclosure may name the provider');
    assert.deepEqual(citationRegisterViolations(doc), [], 'one register holds exactly the cited sources');
  }
  const keep = await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1',
    requestKey: randomUUID(), previousPairId: pair.pairId, sources: request.sources });
  await service.processNext();
  const keptPair = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.equal(keptPair.attemptId, keep.attemptId);
  const keptReport = await service.readReport(workspaceId, runId, 'MARKET', false, keptPair.pairId);
  assert.deepEqual(JSON.parse((await artifacts.read(keptReport.versionId)).toString()).boundedMethods, snapshot);
  await service.requestReportRevision(workspaceId, runId, { ...request, requestKey: randomUUID(), previousPairId: keptPair.pairId, boundedMethods: { decision: 'SKIP' } });
  await service.processNext();
  const skipPair = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  const skipped = await service.readReport(workspaceId, runId, 'MARKET', false, skipPair.pairId);
  assert.equal(JSON.parse((await artifacts.read(skipped.versionId)).toString()).boundedMethods, undefined);
  assert.deepEqual((await service.readReport(workspaceId, runId, 'MARKET')).bytes, originalHtml);
  const frozenChanges = changes();
  assert.equal((await service.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  assert.deepEqual(changes(), frozenChanges, 'A historical retry must not recreate or rebind the selected source');
  db.pragma('query_only=ON');
  const reader = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now: () => { throw new Error('No clock on replay'); } });
  for (const kind of ['MARKET', 'INSIGHT'] as const)
    assert.deepEqual((await reader.readReport(workspaceId, runId, kind, false, pair.pairId)).bytes, saved.get(kind));
  assert.deepEqual(changes(), frozenChanges);
  const sourceDigest = fixture.files.find(file => file.path === fixture.gateSourcePath)!.sha256;
  const originalSource = await artifacts.read(sourceDigest);
  await fs.writeFile(artifacts.pathForDigest(sourceDigest), Buffer.from('corrupt synthetic source'));
  await assert.rejects(reader.readReport(workspaceId, runId, 'MARKET', false, pair.pairId), /Bounded method snapshot failed source replay/);
  await fs.writeFile(artifacts.pathForDigest(sourceDigest), originalSource);
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'MARKET', false, pair.pairId)).bytes, saved.get('MARKET'));
  assert.deepEqual(changes(), frozenChanges);
});

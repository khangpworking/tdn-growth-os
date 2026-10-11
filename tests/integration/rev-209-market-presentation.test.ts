import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore, type ArtifactReadOptions } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildAutomationMarketPresentation } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { MAX_JSON_ARTIFACT_BYTES } from '../../src/modules/analysis/research-automation/model.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import type { AutomationMarketPresentationMethod } from '../../contracts/analysis/automation-market-presentation-method.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00Z');

class MutableReadArtifactStore extends ContentAddressedArtifactStore {
  readonly overrides = new Map<string, Buffer>();

  override async read(sha256: string, options?: ArtifactReadOptions): Promise<Buffer> {
    const bytes = this.overrides.get(sha256);
    if (!bytes) return super.read(sha256, options);
    if (options?.maxBytes !== undefined && bytes.byteLength > options.maxBytes) throw new Error('synthetic bounded read');
    return Buffer.from(bytes);
  }
}

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-rev-209-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new MutableReadArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'rev-209', title: 'Synthetic REV-209' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces), metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    source: syntheticProductSource() });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const scope = { definition: 'Synthetic REV-209 scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  return { db, artifacts, service, pair };
}

function presentationRequest(previousPairId: string) {
  return { contractVersion: 'automation-market-presentation-revision-v1', requestKey: randomUUID(), previousPairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } } as const;
}

async function readSemantic(f: Awaited<ReturnType<typeof fixture>>, pairId: string) {
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, pairId);
  return { report, semantic: JSON.parse((await f.artifacts.read(report.versionId)).toString()) as Record<string, any> };
}

async function withSemanticOverride(f: Awaited<ReturnType<typeof fixture>>, versionId: string, semantic: Record<string, unknown>, action: () => Promise<void>) {
  const manifest = f.db.prepare('SELECT byte_size byteSize FROM artifact_manifests WHERE sha256=?').get(versionId) as { byteSize: number };
  const bytes = Buffer.from(canonicalJson(semantic));
  f.artifacts.overrides.set(versionId, bytes);
  f.db.prepare('UPDATE artifact_manifests SET byte_size=? WHERE sha256=?').run(bytes.byteLength, versionId);
  try { await action(); } finally {
    f.artifacts.overrides.delete(versionId);
    f.db.prepare('UPDATE artifact_manifests SET byte_size=? WHERE sha256=?').run(manifest.byteSize, versionId);
  }
}

test('REV-209 reference-only Market presentation semantic verifies and legacy inline replay remains byte-identical', async t => {
  const f = await fixture(t);
  const receipt = await f.service.requestReportRevision(workspaceId, runId, presentationRequest(f.pair.pairId));
  await f.service.processNext();
  const committed = await f.service.getReportRevision(workspaceId, runId, receipt.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  const { report, semantic } = await readSemantic(f, committed.pairId!);
  assert.equal(semantic.marketPresentation, undefined);
  assert.equal(semantic.marketPresentationArtifact.contractVersion, 'automation-market-presentation-reference-v1');
  const method = JSON.parse((await f.artifacts.read(semantic.marketPresentationArtifact.sha256)).toString()) as AutomationMarketPresentationMethod;
  assert.equal(method.binding.previousPairId, f.pair.pairId);
  const savedBytes = report.bytes;
  const largeMethod = buildAutomationMarketPresentation(method.binding, { metric: null, rows: Array.from({ length: 10_000 }, (_, i) => ({
    i, platform: 'shopee' as const, listing: `listing-${i}`, shop: `shop-${i}`, cat: 'synthetic', rev: 1, units: 1, asp: 1,
    brand: 'synthetic', title: 'synthetic '.repeat(60),
  })), unitSpec: null });
  const largeBytes = Buffer.from(canonicalJson(largeMethod));
  assert.ok(largeBytes.byteLength < MAX_JSON_ARTIFACT_BYTES);
  const boundedSemantic = { ...semantic, syntheticBoundPadding: 'x'.repeat(1_500_000) };
  assert.ok(Buffer.byteLength(canonicalJson(boundedSemantic)) < MAX_JSON_ARTIFACT_BYTES);
  assert.ok(Buffer.byteLength(canonicalJson({ ...boundedSemantic, marketPresentation: largeMethod })) > MAX_JSON_ARTIFACT_BYTES);
  const legacy = { ...semantic, marketPresentation: method };
  await withSemanticOverride(f, report.versionId, legacy, async () => {
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!)).bytes, savedBytes);
  });
});

test('REV-209 rejects tampered, mismatched, non-canonical, input-different and missing presentation references', async t => {
  const f = await fixture(t);
  const receipt = await f.service.requestReportRevision(workspaceId, runId, presentationRequest(f.pair.pairId));
  await f.service.processNext();
  const committed = await f.service.getReportRevision(workspaceId, runId, receipt.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  const { report, semantic } = await readSemantic(f, committed.pairId!);
  const ref = semantic.marketPresentationArtifact as { sha256: string; byteSize: number };
  const method = JSON.parse((await f.artifacts.read(ref.sha256)).toString()) as AutomationMarketPresentationMethod;
  const read = () => f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!);

  const tampered = { ...method, advertising: 'tampered' };
  await withSemanticOverride(f, report.versionId, semantic, async () => {
    const bytes = Buffer.from(canonicalJson(tampered));
    f.artifacts.overrides.set(ref.sha256, bytes);
    f.db.prepare('UPDATE artifact_manifests SET byte_size=? WHERE sha256=?').run(bytes.byteLength, ref.sha256);
    try { await assert.rejects(read()); } finally {
      f.artifacts.overrides.delete(ref.sha256);
      f.db.prepare('UPDATE artifact_manifests SET byte_size=? WHERE sha256=?').run(ref.byteSize, ref.sha256);
    }
  });

  await withSemanticOverride(f, report.versionId, { ...semantic, marketPresentationArtifact: { ...ref, byteSize: ref.byteSize + 1 } }, async () => {
    await assert.rejects(read());
  });
  await withSemanticOverride(f, report.versionId, { ...semantic, marketPresentationArtifact: { ...ref, sha256: 'f'.repeat(64) } }, async () => {
    await assert.rejects(read());
  });

  const nonCanonical = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(method).reverse())));
  assert.equal(nonCanonical.byteLength, ref.byteSize);
  await withSemanticOverride(f, report.versionId, semantic, async () => {
    f.artifacts.overrides.set(ref.sha256, nonCanonical);
    try { await assert.rejects(read()); } finally { f.artifacts.overrides.delete(ref.sha256); }
  });

  const differentInput = { ...method, binding: { ...method.binding, previousPairId: '3'.repeat(64) } };
  const differentBytes = Buffer.from(canonicalJson(differentInput));
  assert.equal(differentBytes.byteLength, ref.byteSize);
  await withSemanticOverride(f, report.versionId, semantic, async () => {
    f.artifacts.overrides.set(ref.sha256, differentBytes);
    try { await assert.rejects(read()); } finally { f.artifacts.overrides.delete(ref.sha256); }
  });

  const { marketPresentationArtifact: _missing, ...missingReference } = semantic;
  await withSemanticOverride(f, report.versionId, missingReference, async () => {
    await assert.rejects(read());
  });
  await withSemanticOverride(f, report.versionId, { ...missingReference, marketPresentation: method }, async () => {
    await assert.rejects(read());
  });
});

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { MARKET_COVER_MODEL, marketCoverAlt, marketCoverPrompt, type MarketCoverAi } from '../../src/modules/analysis/research-automation/market-cover.js';
import { syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { syntheticPng } from '../helpers/synthetic-png.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00Z');
const presentation = (pair: string) => ({ contractVersion: 'automation-market-presentation-revision-v1', requestKey: randomUUID(), previousPairId: pair,
  sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });

async function fixture(t: TestContext, marketCoverAi?: MarketCoverAi) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-market-cover-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'market-cover', title: 'Synthetic Market cover' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces), metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    source: syntheticProductSource(), sourceEvidence: { modelIdentity: 'synthetic-fake-model', promptVersion: 'synthetic-v1',
      transport: { draftLists: async () => ({ keywords: ['synthetic jar'], exclusions: [] }) } },
    ...(marketCoverAi ? { marketCoverAi } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    definition: 'Synthetic product scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  const revise = async (previous: string) => {
    const receipt = await service.requestReportRevision(workspaceId, runId, presentation(previous));
    await service.processNext();
    const committed = await service.getReportRevision(workspaceId, runId, receipt.attemptId);
    assert.equal(committed.state, 'COMMITTED', JSON.stringify(committed));
    const report = await service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!);
    return { pairId: committed.pairId!, report, html: report.bytes.toString('utf8'), semantic: JSON.parse((await artifacts.read(report.versionId)).toString()) };
  };
  return { db, artifacts, service, pair, revise };
}

const manifest = (db: ReturnType<typeof openDatabase>['db'], sha: string) =>
  db.prepare('SELECT media_type, byte_size FROM artifact_manifests WHERE sha256 = ?').get(sha) as { media_type: string; byte_size: number | bigint } | undefined;

test('Market presentation stores one AI cover, registers it, verifies it on read and reuses it on the next attempt', async t => {
  const prompts: string[] = [];
  const ai: MarketCoverAi = { generate: async prompt => { prompts.push(prompt); return { bytes: syntheticPng(1536, 1024, 3, (x, y) => [180, (x * 2 + y) & 255, 90]), model: MARKET_COVER_MODEL }; } };
  const f = await fixture(t, ai);
  const first = await f.revise(f.pair.pairId);
  assert.deepEqual(prompts, [marketCoverPrompt('synthetic jar')]);
  const record = first.semantic.marketCover;
  assert.equal(record.provenance, 'ai-generated'); assert.equal(record.model, 'gpt-image-2');
  const image = await f.artifacts.read(record.imageSha256);
  assert.equal(createHash('sha256').update(image).digest('hex'), record.imageSha256);
  assert.equal(image.byteLength, record.byteSize);
  const row = manifest(f.db, record.imageSha256)!;
  assert.equal(row.media_type, 'image/jpeg'); assert.equal(Number(row.byte_size), record.byteSize);
  const img = new JSDOM(first.html).window.document.querySelector('section.cover img.cv-art')!;
  assert.equal(img.getAttribute('src'), `data:image/jpeg;base64,${image.toString('base64')}`);
  assert.equal(img.getAttribute('alt'), marketCoverAlt('synthetic jar', 'ai-generated'));
  const second = await f.revise(first.pairId);
  assert.equal(prompts.length, 1, 'the second attempt reuses the verified prior cover');
  assert.deepEqual(second.semantic.marketCover, record);
  const imagePath = f.artifacts.pathForDigest(record.imageSha256);
  await fs.writeFile(imagePath, Buffer.from('tampered'));
  await assert.rejects(f.service.readReport(workspaceId, runId, 'MARKET', false, second.pairId));
  await fs.writeFile(imagePath, image);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, second.pairId)).bytes, second.report.bytes);
});

test('without a configured model the Market presentation gets the procedural fallback cover', async t => {
  const f = await fixture(t);
  const first = await f.revise(f.pair.pairId);
  assert.equal(first.semantic.marketCover.provenance, 'fallback');
  assert.equal(first.semantic.marketCover.fallbackReason, 'COVER_AI_NOT_CONFIGURED');
  assert.match(first.html, /data-cover-provenance="fallback"/);
  assert.equal(manifest(f.db, first.semantic.marketCover.imageSha256)!.media_type, 'image/jpeg');
  const draft = JSON.parse((await f.artifacts.read((await f.service.readReport(workspaceId, runId, 'MARKET', false, f.pair.pairId)).versionId)).toString());
  assert.equal(draft.marketCover, undefined, 'a draft without presentation has no cover');
});

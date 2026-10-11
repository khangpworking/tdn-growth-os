import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationKalodataVideoIntake } from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import { p9PackagePrefix } from '../../src/modules/analysis/research-automation/p9-source-intake.js';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-12T00:00:00.000Z');
const videoUrl = 'https://www.tiktok.com/@synthetic/video/1000';
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const csv = Buffer.from(`video,creator,revenue,views,units,ad_spend,publish_date,product_link\n${videoUrl},synthetic,10,,,,,`);

function jev(): TypesafeJevClient {
  return new TypesafeJevClient({ enabled: true, apiKey: 'synthetic-key', model: 'jev-1.13.0' }, async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { state: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(body.state).map(id => [id, { type: 'choice', choice: 'ABOUT_PRODUCT',
      probabilities: { ABOUT_PRODUCT: 0.97, NOT_ABOUT_PRODUCT: 0.02, UNRESOLVED: 0.01 }, confidence: 0.95 }]));
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers }));
  });
}

test('service passes L9 triage into P9 and retains the sidecar with the comment package', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-jev-209b-p9-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'jev-p9', title: 'Synthetic Jev P9' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const base = syntheticProductSource();
  const source: AutomationSourcePort = { ...base, quickSearch: async (input, options) => {
    const result = await base.quickSearch(input, options);
    const bytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Thạch dừa"}]}');
    return { ...result, result: { ...result.result, captures: result.result.captures.map(capture => ({ ...capture, responseBytes: bytes, responseSha256: hash(bytes), responseByteLength: bytes.length })) } };
  }, collect: async (input, options) => { const result = await base.collect(input, options); return { ...result, result: { ...result.result, captures: [] } }; } };
  const transport: TikTokCommentsTransport = { start: async () => ({ runId: 'synthetic', datasetId: 'synthetic', buildId: null, status: 'SUCCEEDED', retrievedAt: now().toISOString(), providerTotalRows: 1, usageTotalUsd: 0 }),
    readPage: async () => Buffer.from(JSON.stringify([{ video_id: '1000', comment_id: '2000', item_type: 'comment', text: 'thach dua', created_at_utc: '2026-09-03T00:00:00.000Z', like_count: 0, user_id: 'synthetic' }])) };
  const collector = new ApifyTikTokCommentsCollector({ transport, privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 17), keyId: randomUUID() }), approvedMaxTotalChargeUsd: 0.1 });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now, uuid: () => runId,
    source, renderer: (input, kind) => buildResearchAutomationReport(input, kind), tikTokCommentsCollector: collector, l9Jev: jev(),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => ({ keywords: ['Thạch dừa'], exclusions: [] }) } } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'Thạch dừa', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision,
    definition: 'Synthetic', includeTerms: ['Thạch dừa'], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  await service.processNext(); await service.processNext();
  const prepared = await new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(path.join(root, 'artifacts')), db, now).prepare({ contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(), table: 'video', sourceLabel: 'Synthetic P4', acquiredAt: null }, csv, 'synthetic.csv', { workspaceId, runId });
  const selected = await service.selectTikTokCommentVideos(workspaceId, runId, { contractVersion: 'tiktok-video-selection-request-v1', requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision,
    sourcePackage: { packageId: prepared.packageId, manifestArtifactSha256: prepared.manifestArtifactSha256, packageContentSha256: prepared.packageContentSha256 }, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [] });
  const receipt = await service.collectTikTokComments(workspaceId, runId, selected);
  const retained = await new SourcePackageService({ db, artifactStore: artifacts }).readVerified(receipt.package.packageId);
  assert.ok(retained.files.some(file => file.path === 'l9-jev-triage.json'));
  assert.equal(JSON.parse(retained.files.find(file => file.path === 'l9-jev-triage.json')!.bytes.toString()).status, 'COMPLETED');
  assert.equal((await service.readP9Source(workspaceId, runId, 'comments', receipt.package.packageId)).view.rows.length, 1);
  assert.equal((await new SourcePackageService({ db, artifactStore: artifacts }).findAutomationAttachmentPackagesByKeyPrefix(p9PackagePrefix(runId, 'comments'))).length, 1);
});

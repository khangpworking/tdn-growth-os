import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationKalodataVideoIntake } from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import { p9PackagePrefix } from '../../src/modules/analysis/research-automation/p9-source-intake.js';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { tiktokCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import type { TikTokCodingAI } from '../../src/modules/analysis/research-automation/tiktok-coding.js';
import type { TikTokCodingConfiguration } from '../../contracts/analysis/tiktok-coding-configuration-v1.generated.js';
import type { TikTokCodingModelInput } from '../../contracts/analysis/tiktok-coding-model-v1.generated.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';

export const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
export const now = () => new Date('2026-10-09T00:00:00Z');
export const url = (id: number) => `https://www.tiktok.com/@synthetic_creator/video/${id}`;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const csv = Buffer.from('video,creator,revenue,views,units,ad_spend,publish_date,product_link\n' +
  [1000, 1001, 1002, 1003, 1004].map((id, i) => `${url(id)},synthetic,${[40, 40, 10, 5, 5][i]},,,,,`).join('\n'));
const rows = [
  { comment_id: '2000', text: 'thạch dừa ngon tuyệt', user_id: '998877' },
  { comment_id: '2001', text: 'thạch dừa ngon tuyệt', user_id: '998877' },
  { comment_id: '2002', text: 'giao hàng nhanh đóng gói cẩn thận', user_id: '776655' },
  { comment_id: '2003', text: 'thạch dừa từ người bán', user_id: '887766', username: 'synthetic_creator' },
  { comment_id: '2004', text: '@tag' }, { comment_id: '2005', text: '😀' },
  { comment_id: '2006', text: 'thạch dừa trả lời', item_type: 'reply', reply_to_comment_id: '2000' },
  { comment_id: '2007', text: 'giá hơi cao nhưng chất lượng ổn', user_id: '665544' },
  { comment_id: '2008', text: 'thạch dừa mát lạnh', user_id: '554433' },
  { comment_id: '2009', text: 'thạch dừa thơm ngon bổ rẻ', user_id: '443322' },
].map(row => ({ video_id: '1000', item_type: 'comment', created_at_utc: '2026-09-03T00:00:00Z', like_count: 0, ...row }));

const title = '  Thạch dừa  nguyên văn – An Nhiên 350g  ';
const period = { startDate: '2026-09-01', endDate: '2026-09-30' };

/** Fake cliproxy text port: returns structurally valid candidates derived from the actual input
 * records (exact substrings only). It never decides retention, idempotency, or acceptance.
 * Honors abort like a real transport: an aborted call throws before producing anything. */
export function fakeCodingPort(onDispatch?: () => void): NonNullable<TikTokCodingAI>['port'] & { dispatches(): number } {
  let dispatches = 0;
  const port = {
    dispatches: () => dispatches,
    async generateText(request: { userText: string; signal: AbortSignal }) {
      if (request.signal.aborted) throw new Error('aborted');
      dispatches++;
      onDispatch?.();
      const input = JSON.parse(request.userText) as TikTokCodingModelInput;
      return { text: JSON.stringify({ codes: input.records.slice(0, 3).map((record, i) => {
        const text = record.text.slice(0, 10);
        return { code: `TOPIC_${i}`, label: `chủ đề ${i}`, recordIndex: record.recordIndex,
          quote: { text, start: 0, end: text.length } };
      }) }) };
    },
  };
  return port as NonNullable<TikTokCodingAI>['port'] & { dispatches(): number };
}

export function fakeCodingAi(port: NonNullable<TikTokCodingAI>['port'], configuration?: TikTokCodingConfiguration): NonNullable<TikTokCodingAI> {
  return { port, configuration: configuration ?? tiktokCodingCliproxyConfiguration('synthetic-tiktok-coding-model') };
}

export async function tiktokFixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-tiktok-coding-'));
  const seeded = await seedTikTokCodingHarness(root);
  t.after(async () => { seeded.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, ...seeded };
}

/** Seed keyword-v3 + P4 + S07 into an explicit root without cleanup. The caller owns
 * close() (before an operator opens the same database) and later root removal. */
export async function seedTikTokCodingHarness(root: string) {
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const close = async () => { db.close(); };
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'tiktok-coding-synthetic', title: 'Synthetic TikTok coding fixture' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const source = syntheticProductSource();
  const sales: AutomationSourcePort = { ...source, quickSearch: async (input, options) => {
    const result = await source.quickSearch(input, options);
    const responseBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Thạch dừa từ nguồn bán hàng"}]}');
    return { ...result, result: { ...result.result, captures: result.result.captures.map(c => ({ ...c, responseBytes,
      responseSha256: hash(responseBytes), responseByteLength: responseBytes.length })) } };
  }, collect: async (input, options) => { const result = await source.collect(input, options); return { ...result, result: { ...result.result, captures: [] } }; } };
  const transport: TikTokCommentsTransport = { start: async () => {
    assert.equal(new SourcePackageService({ db, artifactStore: artifacts }).findAutomationAttachmentPackagesByKeyPrefix(p9PackagePrefix(runId, 'intent')).length, 1);
    return { runId: 'synthetic_run', datasetId: 'synthetic_dataset', buildId: null, status: 'SUCCEEDED', retrievedAt: now().toISOString(),
      providerTotalRows: rows.length, usageTotalUsd: 0.01 };
  }, readPage: async () => Buffer.from(JSON.stringify(rows)) };
  const collector = new ApifyTikTokCommentsCollector({ transport, privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 17), keyId: randomUUID() }), approvedMaxTotalChargeUsd: 0.1 });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now, uuid: () => runId,
    source: sales, webSource: syntheticWebSource(() => {}, []), metricAttachmentStore: new RequestScopedArtifactStore(artifactRoot),
    renderer: buildResearchAutomationReport, tikTokCommentsCollector: collector,
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => {
      return { keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic different term' }] };
    } } } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'thạch dừa',
    requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  // Metric workbook intake so the retained keyword draft carries exact title cells (v3 journey).
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    input: JSON.stringify({ profile: 'v3', cells: { A2: { type: 's', value: title }, A4: { type: 's', value: title } } }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const awaiting = await service.getRun(workspaceId, runId);
  const scope = { definition: 'Synthetic TikTok coding scope', includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] };
  const prepared = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1', requestKey: randomUUID(),
    expectedRevision: awaiting.revision, scope,
    sourceLabel: 'Synthetic Metric export', acquiredAt: null, measurementPeriod: { ...period, basis: 'Synthetic period' },
    precision: { revenue: 'unknown', units: 'unknown' }, selection: 'UNSPECIFIED', sourceContext: 'Synthetic owner workbook; not provider verified' },
    new Uint8Array(generated.stdout));
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, ...scope,
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  await service.processNext(); await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  // P4 prepare + explicit A/C selection + fake bounded collection => retained S07 corpus.
  const videoPrepared = await new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(artifactRoot), db, now).prepare({
    contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(), table: 'video', sourceLabel: 'Synthetic P4', acquiredAt: null }, csv, 'synthetic.csv', { workspaceId, runId });
  const sourcePackage = { packageId: videoPrepared.packageId, manifestArtifactSha256: videoPrepared.manifestArtifactSha256, packageContentSha256: videoPrepared.packageContentSha256 };
  const selected = await service.selectTikTokCommentVideos(workspaceId, runId, { contractVersion: 'tiktok-video-selection-request-v1',
    requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision,
    sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [] });
  const collected = await service.collectTikTokComments(workspaceId, runId, selected);
  assert.equal(collected.exactRetry, false);
  const packet = await service.readSourceEvidence(workspaceId, runId);
  assert.ok(packet?.draftDigest);
  const keyword = await service.readSourceKeywordDraft(workspaceId, runId, packet.draftDigest);
  return { db, artifacts, databasePath, artifactRoot, workspaceReader, service, sourcePackage, selected,
    collected, corpusPackage: collected.package, keywordDigest: packet.draftDigest, keyword, collector, close };
}

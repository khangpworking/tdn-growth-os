import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
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
import { prepareVideoReading } from '../../src/modules/analysis/research-automation/video-reading-intake.js';
import { p9PackagePrefix } from '../../src/modules/analysis/research-automation/p9-source-intake.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SELLER_VIDEO_NOTE, SELLER_VIDEO_READING_TITLE, SELLER_VIDEO_TABLE_TITLE } from '../../src/modules/analysis/research-automation/seller-video.js';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import type { SourcePackageIntakeRequest } from '../../contracts/foundation/source-package-intake-request.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-09T00:00:00Z');
const url = (id: number) => `https://www.tiktok.com/@synthetic_creator/video/${id}`;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const csv = Buffer.from('video,creator,revenue,views,units,ad_spend,publish_date,product_link\n' +
  Array.from({ length: 12 }, (_, i) => `${url(1000 + i)},synthetic_creator,${(12 - i) * 1000},${(12 - i) * 300},${i === 1 ? '' : i + 2},777,${i === 2 ? '' : '2026-09-0' + ((i % 9) + 1)},https://example.test/p/${i}`).join('\n'));
const forbidden = /synthetic_creator|tiktok\.com|example\.test|ad_spend|\b777\b|người theo dõi|PageIndex|Google|Kalodata|SerpApi|Apify|TradeInt|Dami\b/iu;
const withoutDataUris = (html: string): string => html.replace(/data:[^"')]*;base64,[A-Za-z0-9+/=]+/gu, '');
const blockOf = (html: string): string => { const start = html.indexOf(`<h3>${SELLER_VIDEO_TABLE_TITLE}`); return start < 0 ? '' : html.slice(start, html.indexOf('</ul>', start) + 5); };

async function fixture(t: TestContext, uploads: boolean) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-seller-video-'));
  const artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'seller-video', title: 'Synthetic seller video run' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const calls = { model: 0, starts: 0, pages: 0 };
  const transport: TikTokCommentsTransport = { start: async () => { calls.starts++; throw new Error('no collection in this test'); }, readPage: async () => { calls.pages++; return Buffer.from('[]'); } };
  const collector = new ApifyTikTokCommentsCollector({ transport, privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 17), keyId: randomUUID() }), approvedMaxTotalChargeUsd: 0.1 });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now, uuid: () => runId,
    source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, [{ position: 1, title: 'thạch dừa', link: 'https://example.test/source', snippet: 'Synthetic' }]),
    renderer: buildResearchAutomationReport, tikTokCommentsCollector: collector,
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => {
      calls.model++; return { keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic different term' }] };
    } } } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'thạch dừa',
    requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic frozen scope', includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'RENDERING');
  const packages = new SourcePackageService({ db, artifactStore: artifacts });
  const frame = Buffer.from('synthetic frame bytes'), frames = new Map([['frames/synthetic.png', frame]]);
  let selected: Awaited<ReturnType<typeof service.selectTikTokCommentVideos>> | undefined;
  const upload = async () => {
    const prepared = await new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(artifactRoot), db, now).prepare({
      contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(), table: 'video', sourceLabel: 'Synthetic video table', acquiredAt: null }, csv, 'synthetic.csv', { workspaceId, runId });
    const sourcePackage = { packageId: prepared.packageId, manifestArtifactSha256: prepared.manifestArtifactSha256, packageContentSha256: prepared.packageContentSha256 };
    selected = await service.selectTikTokCommentVideos(workspaceId, runId, { contractVersion: 'tiktok-video-selection-request-v1', requestKey: randomUUID(),
      expectedRevision: (await service.getRun(workspaceId, runId)).revision, sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [url(1090)] });
  };
  const reading = async (videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO', videoUrl: string, texts: string[]) => service.prepareP9VideoReading(workspaceId, runId, {
    contractVersion: 'video-reading-prepare-request-v1', requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision, selectionPackage: selected!,
    input: { videoUrl, videoKind, durationSeconds: 60, segments: texts.map((text, i) => ({ startSeconds: i * 4 + 0.5, endSeconds: i * 4 + 3, text, captionSource: 'NATIVE' as const })),
      onScreenText: [{ startSeconds: 1, endSeconds: 2, text: 'chữ trên màn hình không hiển thị' }], frames: [{ atSeconds: 1, logicalPath: 'frames/synthetic.png', sha256: hash(frame) }] } }, frames);
  const legacy = async (videoUrl: string, text: string) => {
    const selection = JSON.parse((await packages.readVerified(selected!.packageId)).files.find(file => file.path === 'selection.json')!.bytes.toString());
    const binding = { workspaceId, runId, scopeSha256: selection.scopeSha256, sourceSetSha256: selection.sourceSetSha256, selectionSha256: hash(canonicalJson(selection)) };
    const attachmentBinding = { workspaceId, runId, scopeSha256: selection.scopeSha256, sourceSetSha256: selection.sourceSetSha256, requestedPeriod: selection.requestedPeriod };
    const request = { contractVersion: 'video-reading-prepare-request-v1', requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision, selectionPackage: selected!,
      input: { videoUrl, videoKind: 'REVIEW_VIDEO' as const, durationSeconds: 30, segments: [{ startSeconds: 2, endSeconds: 5, text, captionSource: 'NATIVE' as const }], onScreenText: [],
        frames: [{ atSeconds: 1, logicalPath: 'frames/synthetic.png', sha256: hash(frame) }] } };
    const bytes = Buffer.from(canonicalJson({ ...prepareVideoReading(request.input, frames, binding).reading, contractVersion: 'video-reading-v1', voice: 'CREATOR' }));
    const files = new Map<string, Uint8Array>([['request.json', Buffer.from(canonicalJson(request))], ['reading.json', bytes], ...frames]);
    const intake: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: p9PackagePrefix(runId, 'reading') + request.requestKey, version: 1, sourceLabel: 'P9 reading: synthetic legacy v1', sourceAcquiredAt: null,
      files: [...files].map(([name, value]) => ({ path: name, sha256: hash(value), byteSize: value.byteLength, mediaType: name.endsWith('.png') ? 'image/png' : 'application/json',
        evidenceFamily: 'p9-reading-v1', representationRole: 'derived', independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
        provenanceBasis: 'Synthetic legacy v1 fixture.' })) as SourcePackageIntakeRequest['files'] };
    return packages.intakeAutomationAttachment(intake, files, hash(canonicalJson(attachmentBinding)));
  };
  if (uploads) {
    await upload();
    await reading('SELLER_VIDEO', url(1000), ['Thạch dừa giòn dai ăn rất mát', 'Mỗi hũ có nhiều thạch', 'Mua ngay trên Shopee nhé', 'Hũ nhỏ dễ mang theo', 'Câu thứ năm không được hiện']);
    await reading('REVIEW_VIDEO', url(1090), ['Mình ăn thử thấy ngọt vừa']);
    await legacy(url(1090), 'Bản ghi cũ vẫn đọc được');
  }
  await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const html = async (pairId?: string) => (await service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8');
  const semantic = async (): Promise<Record<string, unknown>> => {
    const row = db.prepare('SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?').get(runId, 'MARKET') as { sha: string };
    return JSON.parse((await artifacts.read(row.sha)).toString('utf8')) as Record<string, unknown>;
  };
  return { db, artifacts, workspaceReader, service, calls, html, semantic, reading, upload };
}

type Evidence = { sellerVideos?: boolean; sourceAppendix: { rows: { registryId: string; binding: { kind: string; ref: string } }[] } };

test('stored uploads draw a capped video table and seller speech in M09, register S02 and S14 once each, pin the packages and never call a provider', async t => {
  const f = await fixture(t, true);
  const initialCalls = { ...f.calls };
  assert.equal(initialCalls.starts + initialCalls.pages, 0);
  const html = await f.html();
  const block = blockOf(html);
  assert.ok(block.includes(`<h3>${SELLER_VIDEO_READING_TITLE}`));
  assert.equal(html.split(SELLER_VIDEO_TABLE_TITLE).length - 1, 1);
  assert.equal((block.match(/<tr><td>Video \d+<\/td>/gu) ?? []).length, 10, 'at most 10 rows');
  assert.match(block, /<tr><td>Video 1<\/td><td>12000<\/td><td>3600<\/td><td>2<\/td><td>2026-09-01<\/td><\/tr>/u, 'values exactly as stored, in stored order');
  assert.match(block, /<tr><td>Video 2<\/td><td>11000<\/td><td>3300<\/td><td>không có dữ liệu<\/td>/u);
  assert.match(block, /<tr><td>Video 3<\/td><td>10000<\/td><td>3000<\/td><td>4<\/td><td>không có dữ liệu<\/td><\/tr>/u);
  assert.equal((block.match(/<blockquote data-quote>/gu) ?? []).length, 5, 'three shown segments of the seller video (one left out as not reader safe, one over the first three), one review, one legacy');
  assert.match(block, /Thạch dừa giòn dai ăn rất mát/u); assert.match(block, /Lời người bán; giây 0,5–3; do người vận hành ghi lại từ video, chưa xác minh\./u);
  assert.match(block, /Bản ghi cũ vẫn đọc được<\/p><footer>Lời người làm video review;/u, 'a stored v1 reading is projected in memory as seller voice');
  assert.doesNotMatch(block, /Shopee|Câu thứ năm|chữ trên màn hình/u);
  assert.ok(!forbidden.test(withoutDataUris(block)), 'no creator, link, ad spend or provider name');
  assert.ok(html.includes(SELLER_VIDEO_NOTE));
  const stored = await f.semantic();
  const evidence = stored.sourceEvidence as Evidence;
  assert.equal(evidence.sellerVideos, true);
  assert.equal(evidence.sourceAppendix.rows.filter(row => row.registryId === 'S02').length, 1);
  assert.equal(evidence.sourceAppendix.rows.filter(row => row.registryId === 'S14').length, 3);
  assert.equal(new Set(evidence.sourceAppendix.rows.filter(row => row.registryId === 'S14').map(row => row.binding.ref)).size, 3);
  assert.equal(evidence.sourceAppendix.rows.some(row => row.registryId === 'S04'), false);
  const videos = stored.sellerVideos as { sources: { tables: unknown[]; readings: unknown[] }; leftOut: { reason: string }[] };
  assert.equal(videos.sources.tables.length, 1); assert.equal(videos.sources.readings.length, 3);
  assert.deepEqual(videos.leftOut.map(item => item.reason).sort(), ['NOT_READER_SAFE', 'OVER_10_ROWS', 'OVER_3_SEGMENTS']);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  assert.ok(auditMarketReportHtml(html, { presentation: false }).some(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL' && item.ok));
  const failed = (text: string) => auditMarket14(text).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  assert.deepEqual(failed(html), failed(html.replace(block, '')), 'the block adds no machine-rule failure');

  // A later upload never changes the existing version: read and verify re-read exactly the pinned packages.
  await f.reading('SELLER_VIDEO', url(1000), ['Câu tải lên sau khi dựng']);
  assert.equal(await f.html(), html);
  const cold = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaceReader, now: () => { throw new Error('a stored read must not consult the clock'); } });
  assert.equal((await cold.readReport(workspaceId, runId, 'MARKET')).bytes.toString('utf8'), html, 'cold replay is byte-identical');

  // A revision re-renders from the pinned packages only, with no provider call.
  const previousPairId = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId;
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  await f.service.processNext();
  const revised = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.notEqual(revised.pairId, previousPairId);
  const revisedHtml = await f.html(revised.pairId);
  assert.equal(blockOf(revisedHtml), block, 'the revision shows the same pinned uploads');
  assert.doesNotMatch(revisedHtml, /Câu tải lên sau khi dựng/u);
  assert.equal(await f.html(previousPairId), html, 'the earlier version still verifies unchanged');
  assert.equal(f.calls.starts + f.calls.pages, 0);
  assert.equal(f.calls.model, initialCalls.model, 'no model call on revision');
});

test('a run without uploads has no block, no marker, no S02 or S14 and no stored uploads', async t => {
  const f = await fixture(t, false);
  const html = await f.html();
  assert.ok(!html.includes(SELLER_VIDEO_TABLE_TITLE) && !html.includes(SELLER_VIDEO_READING_TITLE) && !html.includes(SELLER_VIDEO_NOTE) && !html.includes('seller-video'));
  const stored = await f.semantic();
  const evidence = stored.sourceEvidence as Evidence;
  assert.equal(evidence.sellerVideos, undefined); assert.equal(stored.sellerVideos, undefined);
  assert.equal(evidence.sourceAppendix.rows.filter(row => ['S02', 'S14'].includes(row.registryId)).length, 0);
  // Uploads after the first build appear only in a new run: a revision of an unmarked version draws nothing.
  await f.upload();
  await f.reading('SELLER_VIDEO', url(1000), ['Câu tải lên sau khi dựng']);
  assert.equal(await f.html(), html);
  const previousPairId = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId;
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  await f.service.processNext();
  const revised = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.ok(!(await f.html(revised.pairId)).includes(SELLER_VIDEO_TABLE_TITLE));
  assert.equal(f.calls.starts + f.calls.pages, 0);
});

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationKalodataVideoIntake } from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import { p9PackagePrefix, P9PublicationArtifactStore } from '../../src/modules/analysis/research-automation/p9-source-intake.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { TikTokSourcePackageIdentity, TikTokCommentSourceReceipt } from '../../contracts/analysis/tiktok-comment-collection-v1.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-09T00:00:00Z');
const url = (id: number) => `https://www.tiktok.com/@synthetic_creator/video/${id}`;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const csv = Buffer.from('video,creator,revenue,views,units,ad_spend,publish_date,product_link\n' +
  [1000,1001,1002,1003,1004].map((id, i) => `${url(id)},synthetic,${[40,40,10,5,5][i]},,,,,`).join('\n'));
const rows = [
  { comment_id: '2000', text: 'thạch dừa ngon', user_id: '998877', username: 'private_handle', user_name: 'PRIVATE AUTHOR', profile_url: 'https://private.test/name' },
  { comment_id: '2001', text: 'thạch dừa ngon', user_id: '998877' },
  { comment_id: '2002', text: 'thạch dừa gọi 0901234567 mail fixture@example.test @private_handle', user_id: 'wrong' },
  { comment_id: '2003', text: 'thạch dừa từ người bán', user_id: '887766', username: 'synthetic_creator' },
  { comment_id: '2004', text: '@tag' }, { comment_id: '2005', text: '😀' }, { comment_id: '2006', text: '' },
  { comment_id: '2007', text: 'thach dua' }, { comment_id: '2008', text: 'thạch dứa' },
  { comment_id: '2009', text: 'thạch dừa trả lời', item_type: 'reply', reply_to_comment_id: '2000' },
  { comment_id: '2010', text: 'thạch dừa phiên bản1' }, { comment_id: '2010', text: 'thạch dừa phiên bản2' },
  { comment_id: '2000', text: 'thạch dừa ngon', user_id: '998877', username: 'private_handle' },
].map(row => ({ video_id: '1000', item_type: 'comment', created_at_utc: '2026-09-03T00:00:00Z', like_count: 0, ...row }));

async function fixture(t: TestContext, status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INCOMPLETE' = 'SUCCEEDED', finishReports = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-p9-owning-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'p9-synthetic', title: 'Synthetic P9 source fixture' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  let modelCalls = 0, starts = 0, pages = 0;
  const source = syntheticProductSource();
  const sales: AutomationSourcePort = { ...source, quickSearch: async (input, options) => {
    const result = await source.quickSearch(input, options);
    const responseBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Thạch dừa từ nguồn bán hàng"}]}');
    return { ...result, result: { ...result.result, captures: result.result.captures.map(c => ({ ...c, responseBytes,
      responseSha256: hash(responseBytes), responseByteLength: responseBytes.length })) } };
  }, collect: async (input, options) => { const result = await source.collect(input, options); return { ...result, result: { ...result.result, captures: [] } }; } };
  const transport: TikTokCommentsTransport = { start: async () => {
    starts++;
    // Prove the owning before-call intent is already durably retained.
    assert.equal(new SourcePackageService({ db, artifactStore: artifacts }).findAutomationAttachmentPackagesByKeyPrefix(p9PackagePrefix(runId, 'intent')).length, 1);
    return { runId: 'synthetic_run', datasetId: 'synthetic_dataset', buildId: null, status, retrievedAt: now().toISOString(),
      providerTotalRows: rows.length, usageTotalUsd: 0.01 };
  }, readPage: async () => { pages++; return Buffer.from(JSON.stringify(rows)); } };
  const collector = new ApifyTikTokCommentsCollector({ transport, privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 17), keyId: randomUUID() }), approvedMaxTotalChargeUsd: 0.1 });
  const make = (configured = true) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now, uuid: () => runId,
    ...(configured ? { tikTokCommentsCollector: collector } : {}) });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now, uuid: () => runId,
    source: sales, webSource: syntheticWebSource(() => {}, [{ position: 1, title: 'thạch dừa', link: 'https://example.test/source', snippet: 'Synthetic' }]),
    renderer: buildResearchAutomationReport, tikTokCommentsCollector: collector,
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => {
      modelCalls++; return { keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic different term' }] };
    } } } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'thạch dừa',
    requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic frozen P9 scope', includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  await service.processNext(); if (finishReports) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, finishReports ? 'DRAFT_READY' : 'RENDERING'); assert.equal(modelCalls, 1);
  const prepared = await new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(artifactRoot), db, now).prepare({
    contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(), table: 'video', sourceLabel: 'Synthetic P4', acquiredAt: null }, csv, 'synthetic.csv', { workspaceId, runId });
  const sourcePackage = { packageId: prepared.packageId, manifestArtifactSha256: prepared.manifestArtifactSha256, packageContentSha256: prepared.packageContentSha256 };
  const requestKey = randomUUID();
  const request = { contractVersion: 'tiktok-video-selection-request-v1', requestKey, expectedRevision: (await service.getRun(workspaceId, runId)).revision,
    sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [url(1090)] };
  const selected = await service.selectTikTokCommentVideos(workspaceId, runId, request);
  const packages = new SourcePackageService({ db, artifactStore: artifacts });
  return { root, db, artifacts, databasePath, artifactRoot, workspaceReader, service, make, collector, transport, request, selected, sourcePackage, packages,
    calls: () => ({ modelCalls, starts, pages }) };
}

test('real retained P4 -> before-call intent -> fake collector -> private L9 corpus -> owning cited read/history/replay', async t => {
  const f = await fixture(t);
  const beforeReports = await Promise.all(['MARKET', 'INSIGHT'].map(kind => f.service.readReport(workspaceId, runId, kind as 'MARKET' | 'INSIGHT')));
  const receipt = await f.service.collectTikTokComments(workspaceId, runId, f.selected);
  assert.equal(receipt.exactRetry, false);
  const read = await f.service.readP9Source(workspaceId, runId, 'comments', receipt.package.packageId);
  assert.equal(read.view.registryId, 'S07'); assert.equal(read.view.rows.length, 3);
  assert.deepEqual(read.view.rows.slice(0,2).map(r => r.text), ['thạch dừa ngon', 'thạch dừa ngon']);
  const accounting = 'accounting' in read.view ? read.view.accounting : assert.fail('S07 expected');
  assert.equal(accounting.uniqueComments, 11); assert.equal(accounting.equalDuplicateRows, 1); assert.equal(accounting.conflictingCommentGroups, 1);
  assert.equal(accounting.byReason.REPLY, 1); assert.equal(accounting.byReason.SELLER_OR_CREATOR, 1);
  assert.equal(accounting.byReason.TAG_ONLY, 1); assert.equal(accounting.byReason.EMOJI_ONLY, 1); assert.equal(accounting.byReason.EMPTY, 1);
  assert.ok(read.citations.every(c => c.url === url(1000) && c.locatorText?.includes('bình luận')));
  const publicBytes = canonicalJson({ view: read.view, citations: read.citations });
  assert.doesNotMatch(publicBytes, /authorIdentity|keyId|keyCommitment|voicePolicyCommitment|PRIVATE AUTHOR|private_handle|998877|887766|0901234567|fixture@example/);
  const retained = await f.packages.readVerified(receipt.package.packageId);
  const corpus = JSON.parse(retained.files.find(file => file.path === 'corpus.json')!.bytes.toString());
  assert.equal(corpus.records[0].authorIdentity.hash, corpus.records[1].authorIdentity.hash);
  assert.equal(corpus.records[2].authorIdentity.state, 'INVALID'); assert.equal(corpus.records[4].authorIdentity.state, 'MISSING');
  for (const file of retained.files) assert.doesNotMatch(file.bytes.toString(), /PRIVATE AUTHOR|private_handle|998877|887766|0901234567|fixture@example|private\.test/);
  const calls = f.calls(), dbBefore = Buffer.from(f.db.serialize());
  const files = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  f.db.pragma('query_only = ON');
  const cold = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaceReader,
    now: () => { throw new Error('retained read must not consult clock'); } });
  assert.deepEqual((await cold.collectTikTokComments(workspaceId, runId, f.selected)).package, receipt.package);
  assert.deepEqual((await cold.readP9Source(workspaceId, runId, 'comments', receipt.package.packageId)).view, read.view);
  assert.equal((await cold.readP9SourceHistory(workspaceId, runId)).comments.sources.length, 1);
  assert.equal((await cold.readSourceActivity(workspaceId))['apify-tiktok-comments'].dataCount, 1);
  for (const original of beforeReports) assert.ok((await cold.readReport(workspaceId, runId, original.kind)).bytes.equals(original.bytes));
  assert.deepEqual(f.calls(), calls); assert.deepEqual(f.db.serialize(), dbBefore);
  assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), files);
  const reopened = spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/p9-cold-replay.ts', f.root, workspaceId, runId,
    receipt.package.packageId, hash(canonicalJson(read.view)), canonicalJson(f.selected)],
    { env: { ...process.env, PATH: '/no-python-for-p9-cold' }, maxBuffer: 1024 * 1024 });
  assert.equal(reopened.status, 0, reopened.stderr.toString());
  assert.match(reopened.stdout.toString(), /P9 cold reopened configured-free replay passed/);
  assert.deepEqual(f.db.serialize(), dbBefore);
});

test('configured-free/wrong source/digest/key and corrupted retained proof refuse before transport or writes', async t => {
  const f = await fixture(t);
  const before = Buffer.from(f.db.serialize()), files = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  await assert.rejects(f.make(false).collectTikTokComments(workspaceId, runId, f.selected));
  await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, { ...f.selected, packageContentSha256: 'f'.repeat(64) }));
  await assert.rejects(f.service.selectTikTokCommentVideos(workspaceId, runId, { ...f.request, option: 'C_CUMULATIVE_80_PERCENT' }));
  await assert.rejects(f.service.collectTikTokComments(randomUUID(), runId, f.selected));
  const selected = await f.packages.readVerified(f.selected.packageId), file = selected.files.find(v => v.path === 'selection.json')!;
  const original = file.bytes;
  try { await fs.writeFile(f.artifacts.pathForDigest(file.sha256), Buffer.from('{}')); await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, f.selected)); }
  finally { await fs.writeFile(f.artifacts.pathForDigest(file.sha256), original); }
  assert.deepEqual(f.db.serialize(), before); assert.deepEqual(f.calls(), { modelCalls: 1, starts: 0, pages: 0 });
  assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), files);
});

test('pre-abort and authentic configured 201st comment refusal never finalize usable corpus or authorize automatic retry', async t => {
  const f = await fixture(t); const controller = new AbortController(); controller.abort();
  const before = Buffer.from(f.db.serialize()), files = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, f.selected, controller.signal));
  assert.deepEqual(f.db.serialize(), before); assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), files);
  assert.equal(f.calls().starts, 0);
  f.transport.start = async () => ({ runId: 'synthetic_oversize', datasetId: 'synthetic_oversize_data', buildId: null, status: 'SUCCEEDED',
    retrievedAt: now().toISOString(), providerTotalRows: 201, usageTotalUsd: 0.01 });
  let pages = 0;
  f.transport.readPage = async () => { pages++; return Buffer.from(JSON.stringify(Array.from({ length: 201 }, (_, i) => ({
    video_id: '1000', comment_id: String(3000+i), item_type: 'comment', text: 'thạch dừa nguyên văn' })))); };
  await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, f.selected));
  assert.equal(pages, 1); assert.equal((await f.service.readP9SourceHistory(workspaceId, runId)).comments.sources.length, 0);
  await assert.rejects(f.make().collectTikTokComments(workspaceId, runId, f.selected)); assert.equal(pages, 1);
});

test('two independent configured owning service instances reserve one intent before a single transport', async t => {
  const f = await fixture(t);
  const independent = new ApifyTikTokCommentsCollector({ transport: f.transport, approvedMaxTotalChargeUsd: 0.1,
    privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 17), keyId: f.collector.privacyProfile.keyId }) });
  const second = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaceReader, now,
    tikTokCommentsCollector: independent });
  const outcomes = await Promise.allSettled([f.service.collectTikTokComments(workspaceId, runId, f.selected),
    second.collectTikTokComments(workspaceId, runId, f.selected)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
  assert.deepEqual(f.calls(), { modelCalls: 1, starts: 1, pages: 1 });
  assert.equal((await f.service.readP9SourceHistory(workspaceId, runId)).comments.sources.length, 1);
});

test('failed/cancelled/incomplete provider receipts retain sanitized usage diagnostic only and refuse redispatch', async t => {
  for (const status of ['FAILED', 'CANCELLED', 'INCOMPLETE'] as const) {
    const f = await fixture(t, status);
    await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, f.selected));
    const entries = f.packages.findFinalizedSourcePackagesByKey(p9PackagePrefix(runId, 'diagnostic') + f.request.requestKey);
    assert.equal(entries.length, 1);
    const journal = await f.packages.readVerified(entries[0]!.packageId);
    assert.equal(JSON.parse(journal.files.find(file => file.path === 'provider-receipt.json')!.bytes.toString()).status, status);
    assert.equal(JSON.parse(journal.files.find(file => file.path === 'provider-receipt.json')!.bytes.toString()).usageTotalUsd, 0.01);
    assert.equal((await f.service.readP9SourceHistory(workspaceId, runId)).comments.sources.length, 0);
    const before = Buffer.from(f.db.serialize()), files = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
    await assert.rejects(f.make().collectTikTokComments(workspaceId, runId, f.selected));
    assert.deepEqual(f.db.serialize(), before); assert.deepEqual(f.calls(), { modelCalls: 1, starts: 1, pages: 0 });
    assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), files);
  }
});

test('supplied abort during source file or final manifest CAS retains no finalized corpus/catalog publication', async t => {
  for (const boundary of ['file', 'manifest'] as const) {
    const f = await fixture(t); const controller = new AbortController();
    const catalog = () => ['artifact_manifests', 'foundation_source_packages', 'foundation_source_package_files', 'foundation_source_attachment_origins']
      .map(table => f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get());
    const put = f.artifacts.put.bind(f.artifacts); let fired = false, catalogBefore: unknown;
    f.artifacts.put = async value => {
      const stored = await put(value); const text = Buffer.from(value).toString();
      const target = boundary === 'file' ? text.includes('"tiktok-comment-corpus-v1"') :
        text.includes(`"packageKey":"${p9PackagePrefix(runId, 'comments')}${f.request.requestKey}"`);
      if (!fired && target) { fired = true; catalogBefore = catalog(); controller.abort(); }
      return stored;
    };
    await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, f.selected, controller.signal));
    assert.equal(fired, true); assert.deepEqual(catalog(), catalogBefore);
    assert.equal(f.packages.findFinalizedSourcePackagesByKey(p9PackagePrefix(runId, 'comments') + f.request.requestKey).length, 0);
    assert.equal((await f.service.readP9SourceHistory(workspaceId, runId)).comments.sources.length, 0);
    assert.equal(f.packages.findFinalizedSourcePackagesByKey(p9PackagePrefix(runId, 'diagnostic') + f.request.requestKey).length, 1);
    assert.deepEqual(f.calls(), { modelCalls: 1, starts: 1, pages: 1 });
  }
  assert.throws(() => new P9PublicationArtifactStore(new RequestScopedArtifactStore('/unused-p9-synthetic'), () => {}));
});

test('changed collector config replays original frozen source and tampered source/intent/page/corpus bytes reject without calls', async t => {
  const f = await fixture(t);
  const receipt = await f.service.collectTikTokComments(workspaceId, runId, f.selected);
  const configured = new ApifyTikTokCommentsCollector({ privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 33), keyId: randomUUID() }),
    actor: 'clockworks/tiktok-comments-scraper', approvedMaxTotalChargeUsd: 0.05, maxCommentsPerVideo: 100,
    transport: { start: async () => { throw new Error('replay dispatched changed provider'); }, readPage: async () => { throw new Error('replay read provider'); } } });
  const changed = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaceReader, tikTokCommentsCollector: configured,
    now: () => { throw new Error('replay consulted current clock'); } });
  const before = Buffer.from(f.db.serialize()), calls = f.calls(), files = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  assert.equal((await changed.collectTikTokComments(workspaceId, runId, f.selected)).package.packageId, receipt.package.packageId);
  const retained = await f.packages.readVerified(receipt.package.packageId);
  for (const name of ['intent.json', 'selection-package.json', 'keyword-draft.json', 'capture.json', 'pages/0.json', 'corpus.json']) {
    const file = retained.files.find(file => file.path === name)!;
    try { await fs.writeFile(f.artifacts.pathForDigest(file.sha256), Buffer.from('{"corrupt":true}'));
      await assert.rejects(changed.readP9Source(workspaceId, runId, 'comments', receipt.package.packageId));
    } finally { await fs.writeFile(f.artifacts.pathForDigest(file.sha256), file.bytes); }
  }
  assert.deepEqual(f.calls(), calls); assert.deepEqual(f.db.serialize(), before);
  assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), files);
});

test('OWNER cancellation requested during final publication is accepted only after preexisting source commit', async t => {
  const f = await fixture(t, 'SUCCEEDED', false);
  const put = f.artifacts.put.bind(f.artifacts); let cancellation: ReturnType<typeof f.service.cancel> | undefined;
  let beforeCancelledCommit = false;
  f.artifacts.put = async value => {
    const result = await put(value);
    if (!cancellation && Buffer.from(value).toString().includes('"tiktok-comment-corpus-v1"')) {
      cancellation = f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: randomUUID(),
        expectedRevision: (await f.service.getRun(workspaceId, runId)).revision });
      const current = f.db.prepare('SELECT status FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { status: string };
      assert.equal(current.status, 'RENDERING'); beforeCancelledCommit = true;
    }
    return result;
  };
  await f.service.collectTikTokComments(workspaceId, runId, f.selected);
  assert.equal(beforeCancelledCommit, true); assert.ok(cancellation);
  await cancellation;
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'CANCELLED');
  // The source finalized while OWNER cancellation was still queued under the
  // existing mutex. Accepted cancellation never authorizes another source.
  assert.equal(f.packages.findFinalizedSourcePackagesByKey(p9PackagePrefix(runId, 'comments') + f.request.requestKey).length, 1);
  const before = Buffer.from(f.db.serialize()), calls = f.calls();
  assert.equal((await f.make(false).collectTikTokComments(workspaceId, runId, f.selected)).exactRetry, true);
  assert.deepEqual(f.db.serialize(), before); assert.deepEqual(f.calls(), calls);
});

test('actual OWNER accepted cancellation during awaited page read preserves usage but no corpus or repeat call', async t => {
  const f = await fixture(t, 'SUCCEEDED', false);
  f.transport.readPage = async () => {
    await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: randomUUID(),
      expectedRevision: (await f.service.getRun(workspaceId, runId)).revision });
    return Buffer.from(JSON.stringify(rows));
  };
  await assert.rejects(f.service.collectTikTokComments(workspaceId, runId, f.selected));
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'CANCELLED');
  assert.equal(f.packages.findFinalizedSourcePackagesByKey(p9PackagePrefix(runId, 'comments') + f.request.requestKey).length, 0);
  const before = Buffer.from(f.db.serialize()); await assert.rejects(f.make().collectTikTokComments(workspaceId, runId, f.selected));
  assert.deepEqual(f.db.serialize(), before); assert.equal(f.calls().starts, 1);
});

test('S14 owning inert reading rejects wrong scope/video/frames and reloads exact seller/creator citations without writes', async t => {
  const f = await fixture(t);
  const frame = Buffer.from('synthetic frame bytes');
  const readingRequest = { contractVersion: 'video-reading-prepare-request-v1', requestKey: randomUUID(),
    expectedRevision: (await f.service.getRun(workspaceId, runId)).revision, selectionPackage: f.selected,
    input: { videoUrl: url(1000), videoKind: 'SELLER_VIDEO', durationSeconds: 12,
      segments: [{ startSeconds: 1, endSeconds: 3, text: 'Nội dung nguyên văn từ người bán', captionSource: 'NATIVE' }],
      onScreenText: [{ startSeconds: 1, endSeconds: 2, text: '350g' }], frames: [{ atSeconds: 1, logicalPath: 'frames/synthetic.png', sha256: hash(frame) }] } };
  const frames = new Map([['frames/synthetic.png', frame]]);
  for (const input of [ { ...readingRequest.input, segments: [] }, { ...readingRequest.input, videoUrl: url(1001) },
    { ...readingRequest.input, segments: [{ ...readingRequest.input.segments[0], endSeconds: 13 }] } ])
    await assert.rejects(f.service.prepareP9VideoReading(workspaceId, runId, { ...readingRequest, input }, frames));
  await assert.rejects(f.service.prepareP9VideoReading(workspaceId, runId, readingRequest, new Map([['frames/synthetic.png', Buffer.from('wrong')]])));
  const receipt = await f.service.prepareP9VideoReading(workspaceId, runId, readingRequest, frames);
  assert.equal(receipt.exactRetry, false); assert.equal(receipt.state, 'PREPARED_NOT_ADMITTED');
  const read = await f.service.readP9Source(workspaceId, runId, 'reading', receipt.package.packageId);
  assert.equal(read.view.rows[0]!.voice, 'SELLER'); assert.match(read.citations[0]!.locatorText!, /1.*3/);
  const creatorRequest = { ...readingRequest, requestKey: randomUUID(), input: { ...readingRequest.input, videoUrl: url(1090), videoKind: 'REVIEW_VIDEO' } };
  const creator = await f.service.prepareP9VideoReading(workspaceId, runId, creatorRequest, frames);
  assert.equal((await f.service.readP9Source(workspaceId, runId, 'reading', creator.package.packageId)).view.rows[0]!.voice, 'CREATOR');
  const before = Buffer.from(f.db.serialize()), files = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  f.db.pragma('query_only = ON');
  assert.equal((await f.make(false).prepareP9VideoReading(workspaceId, runId, readingRequest, frames)).exactRetry, true);
  assert.equal((await f.make(false).readP9SourceHistory(workspaceId, runId)).readings.sources.length, 2);
  assert.equal((await f.make(false).readSourceActivity(workspaceId))['video-reading'].dataCount, 2);
  assert.deepEqual(f.db.serialize(), before); assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), files);
  assert.deepEqual(f.calls(), { modelCalls: 1, starts: 0, pages: 0 });
});

test('actual authenticated OWNER P4 upload/selection/comment and S14 routes expose retained author-free source reads/history', async t => {
  const f = await fixture(t);
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = 'synthetic-owner-token-0-not-a-live-credential';
  const app = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    tikTokCommentsCollector: f.collector,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: true, apifyTikTokComments: { maxChargeUsd: 0.1 } },
    owner: { databasePath: f.databasePath, artifactRoot: f.artifactRoot, writeEnabled: true, token, actorId: 'synthetic-owner', allowedOrigin: origin } });
  server.on('request', app.handler);
  t.after(async () => { await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const ownerRoot = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
  const readRoot = `${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
  const headers = { Origin: origin, Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
  const form = new FormData(); form.set('metadata', JSON.stringify({ contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(),
    table: 'video', sourceLabel: 'Synthetic OWNER P4', acquiredAt: null })); form.set('file', new File([new Uint8Array(csv)], 'synthetic.csv', { type: 'text/csv' }));
  assert.equal((await fetch(`${ownerRoot}/sources/kalodata-video`, { method: 'POST', headers: { Origin: origin }, body: form })).status, 401);
  const uploaded = await fetch(`${ownerRoot}/sources/kalodata-video`, { method: 'POST', headers, body: form });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const source = await uploaded.json() as TikTokSourcePackageIdentity;
  const selectionRequest = { ...f.request, requestKey: randomUUID(), sourcePackage: { packageId: source.packageId,
    manifestArtifactSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256 }, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [] };
  const selected = await fetch(`${ownerRoot}/sources/tiktok-comments/selections`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(selectionRequest) });
  assert.equal(selected.status, 200, await selected.clone().text());
  const identity = await selected.json();
  const unauthorized = await fetch(`${ownerRoot}/sources/tiktok-comments/collect`, { method: 'POST', headers: { ...headers, Origin: 'https://wrong.test' }, body: JSON.stringify(identity) });
  assert.equal(unauthorized.status, 403); assert.equal(f.calls().starts, 0);
  const collected = await fetch(`${ownerRoot}/sources/tiktok-comments/collect`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(identity) });
  assert.equal(collected.status, 201, await collected.clone().text());
  const receipt = await collected.json() as TikTokCommentSourceReceipt;
  const view = await fetch(`${readRoot}/sources/tiktok-comments/${receipt.package.packageId}`);
  assert.equal(view.status, 200, await view.clone().text());
  const publicText = await view.text(); assert.doesNotMatch(publicText, /authorIdentity|keyId|PRIVATE AUTHOR|private_handle|998877/);
  const citations = await fetch(`${readRoot}/sources/tiktok-comments/${receipt.package.packageId}/citations`);
  assert.equal(citations.status, 200); assert.match(await citations.text(), /bình luận/);
  const readings = new FormData(); readings.set('metadata', JSON.stringify({ contractVersion: 'video-reading-prepare-request-v1', requestKey: randomUUID(),
    expectedRevision: f.request.expectedRevision, selectionPackage: identity, input: { videoUrl: url(1000), videoKind: 'SELLER_VIDEO', durationSeconds: 5,
      segments: [{ startSeconds: 0, endSeconds: 2, text: 'Nguyên văn mẫu', captionSource: 'NATIVE' }], onScreenText: [], frames: [] } }));
  const reading = await fetch(`${ownerRoot}/sources/video-reading`, { method: 'POST', headers, body: readings });
  assert.equal(reading.status, 201, await reading.clone().text());
  const readingReceipt = await reading.json() as { package: TikTokSourcePackageIdentity };
  assert.equal((await fetch(`${readRoot}/sources/video-reading/${readingReceipt.package.packageId}`)).status, 200);
  const before = Buffer.from(f.db.serialize()), calls = f.calls();
  const retry = await fetch(`${ownerRoot}/sources/tiktok-comments/collect`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(identity) });
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.equal((await (await fetch(`${readRoot}/sources/tiktok-comments`)).json() as { sources: unknown[] }).sources.length, 1);
  assert.equal((await (await fetch(`${readRoot}/sources/video-reading`)).json() as { sources: unknown[] }).sources.length, 1);
  const status = await fetch(`${origin}/api/workspaces/${workspaceId}/research-automation/source-status`);
  assert.equal(status.status, 200, await status.clone().text());
  const board = await status.json() as { sources: { source: string; state: string; dataCount: number; pendingPackage: string | null; spendCapUsd: number | null }[] };
  const commentsCard = board.sources.find(card => card.source === 'APIFY_TIKTOK_COMMENTS')!;
  const readingCard = board.sources.find(card => card.source === 'VIDEO_READING')!;
  assert.equal(commentsCard.state, 'READY'); assert.equal(commentsCard.pendingPackage, null);
  assert.equal(commentsCard.dataCount, 1); assert.equal(commentsCard.spendCapUsd, 0.1);
  assert.equal(readingCard.state, 'MANUAL_IMPORT'); assert.equal(readingCard.dataCount, 1);
  assert.equal(board.sources.find(card => card.source === 'META_AD_LIBRARY')!.state, 'NOT_BUILT');
  assert.deepEqual(f.calls(), calls); assert.deepEqual(f.db.serialize(), before);
});

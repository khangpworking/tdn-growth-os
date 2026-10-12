import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../src/platform/artifacts/artifact-store.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import type { ResearchAutomationReaderBuildReceiptV2, ResearchAutomationReaderRevisionListV2 } from '../../contracts/api/research-automation-reader-report-api.generated.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('collected literal19 OWNER reader publishes once, preserves evidence and replays without calls or writes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-collected-reader-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const now = () => new Date('2026-10-09T00:00:00.000Z');
  const db = openDatabase({ databasePath, now }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const workspaceId = randomUUID(), runId = randomUUID(), owner = { actorId: 'owner:collected-reader', role: 'OWNER' as const };
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'collected-reader', title: 'Synthetic collected reader' });
  const quote = 'Tôi thích kích thước.';
  const raw = Buffer.from(JSON.stringify([
    { reviewId: 'one', comment: quote, ratingStar: 4 },
    { reviewId: 'two', comment: quote, ratingStar: null },
    { reviewId: 'three', comment: '', ratingStar: 1 },
  ].map(row => ({ shopId: '78085196', itemId: '17678138164', ...row }))));
  let collectorCalls = 0;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    shopeeCollectorFactory: () => { collectorCalls++; return { requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }; } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT',
    keyword: 'Synthetic collected reader', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic collected listing only',
    includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] });
  await service.processNext(); await service.processNext();
  const original = (await service.listReportVersions(workspaceId, runId))[0]!;
  const literal = await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1',
    requestKey: randomUUID(), previousPairId: original.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    literalInsight: { contractVersion: 'insight-literal-select-v1' } });
  await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId)).find(row => row.attemptId === literal.attemptId)!;
  assert.ok(pair);
  const source = await service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  assert.equal(JSON.parse((await artifacts.read(source.versionId)).toString()).rendererVersion, 'automation-report-kit-v19');

  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token = 'synthetic-collected-reader-token-12345678901234567890';
  let providerCalls = 0;
  const api = openResearchAutomationApi({ databasePath, artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { databasePath, artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: owner.actorId } },
    { now: () => Date.now(), sleep: async () => {}, fetch: async () => { providerCalls++; throw new Error('No reader provider calls'); } });
  server.on('request', api.handler);
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await api.close(); });
  const base = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/reader-reports`;
  const readBase = `${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reader-reports`;
  const post = (action: string, body: unknown, authorized = true, requestOrigin = origin) => fetch(`${base}/${action}`, {
    method: 'POST', headers: { Origin: requestOrigin, ...(authorized ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  const snapshot = async () => ({ db: sha(db.serialize()), cas: await Promise.all((await fs.readdir(artifactRoot, { recursive: true })).sort()
    .map(async name => { const file = path.join(artifactRoot, name); return (await fs.stat(file)).isFile() ? [name, sha(await fs.readFile(file))] : [name]; })) });
  const request = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: pair.pairId, semanticSha256: source.versionId };
  const before = await snapshot(), initialCollectorCalls = collectorCalls;
  assert.equal((await post('insight', request, false)).status, 401);
  assert.equal((await post('insight', request, true, 'http://127.0.0.1:1')).status, 403);
  assert.equal((await post('insight', { ...request, semanticSha256: '0'.repeat(64) })).status, 400);
  assert.equal((await post('insight', { ...request, draftPairId: '0'.repeat(64) })).status, 404);
  assert.deepEqual(await snapshot(), before);
  const result = await post('insight', request);
  assert.equal(result.status, 201, await result.clone().text());
  const receipt = await result.json() as ResearchAutomationReaderBuildReceiptV2;
  assert.equal(receipt.exactRetry, false); assert.equal(receipt.revision.builderVersion, 'reader-report-insight-v1');
  assert.equal(Number((db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number | bigint }).n), 1);
  assert.notDeepEqual(await snapshot(), before, 'the first successful build persists its reader artifacts and ledger');
  const row = db.prepare('SELECT input_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?').get(receipt.revision.revisionId) as { input_sha256: string };
  const record = JSON.parse((await artifacts.read(row.input_sha256)).toString());
  assert.equal(record.input.semanticSha256, source.versionId); assert.equal(record.input.sourceReportSha256, sha(source.bytes));
  for (const kind of ['CORPUS', 'LOCATED', 'LITERAL']) assert.ok(record.input.retainedMethods.some((method: { kind: string }) => method.kind === kind));
  const get = () => fetch(`${readBase}/${receipt.revision.revisionId}/html`);
  const page = await get(); assert.equal(page.status, 200);
  const bytes = Buffer.from(await page.arrayBuffer()); assert.equal(sha(bytes), receipt.revision.htmlSha256);
  const html = bytes.toString(); assert.ok(html.includes(quote)); assert.match(html, /4\/5/);
  assert.match(html, /Thiếu điểm đánh giá/); assert.match(html, /Nguồn không có phần chữ/);
  assert.match(html, /Trùng chữ không xác minh cùng tác giả/); assert.match(html, /id="cite-1"/);
  assert.ok(!html.includes('reviewerId')); assert.ok(!html.includes('authorHash'));
  const saved = await snapshot();
  const list = await (await fetch(`${readBase}/v2`)).json() as ResearchAutomationReaderRevisionListV2;
  assert.equal(list.revisions.length, 1); assert.equal(list.revisions[0]!.revisionId, receipt.revision.revisionId);
  const retry = await post('insight', request); assert.equal(retry.status, 200);
  const retried = await retry.json() as ResearchAutomationReaderBuildReceiptV2;
  assert.equal(retried.exactRetry, true); assert.equal(retried.revision.revisionId, receipt.revision.revisionId);
  assert.deepEqual(await snapshot(), saved);
  // A nonexistent semantic identity fails source validation before the ledger.
  assert.equal((await post('insight', { ...request, semanticSha256: '0'.repeat(64) })).status, 400);
  await assert.rejects(service.buildInsightReaderReport(workspaceId, runId, request, { ...owner, actorId: 'owner:other' }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'request_key_conflict');
  assert.deepEqual(await snapshot(), saved);

  for (const digest of [row.input_sha256, receipt.revision.htmlSha256]) {
    const file = artifacts.pathForDigest(digest), retained = await fs.readFile(file);
    try {
      await fs.writeFile(file, 'synthetic corrupted saved reader'); const damaged = await snapshot();
      for (const response of [await get(), await post('insight', request)]) {
        assert.equal(response.status, 500); assert.equal((await response.json() as { error: { code: string } }).error.code, 'integrity_error');
      }
      assert.deepEqual(await snapshot(), damaged);
    } finally { await fs.writeFile(file, retained); }
  }
  const semanticFile = artifacts.pathForDigest(source.versionId), semanticBytes = await fs.readFile(semanticFile);
  try {
    await fs.writeFile(semanticFile, 'synthetic corrupted current source'); const damaged = await snapshot();
    assert.deepEqual(Buffer.from(await (await get()).arrayBuffer()), bytes);
    assert.equal((await post('insight', { ...request, requestKey: randomUUID() })).status, 500);
    assert.equal((await post('insight', request)).status, 500);
    assert.deepEqual(await snapshot(), damaged);
  } finally { await fs.writeFile(semanticFile, semanticBytes); }

  let clockCalls = 0, casWrites = 0;
  class NoPut extends ContentAddressedArtifactStore {
    override async put(_bytes: Uint8Array): Promise<StoredArtifact> { casWrites++; throw new Error('No replay CAS writes'); }
  }
  const reopened = new ResearchAutomationService({ db, artifactStore: new NoPut(artifactRoot), now: () => { clockCalls++; throw new Error('No replay clock'); },
    workspaceReader: { async readVerifiedWorkspace() { throw new Error('No current workspace reads'); } } });
  assert.deepEqual((await reopened.readReaderReport(workspaceId, runId, receipt.revision.revisionId)).bytes, bytes);
  assert.equal((await reopened.listReaderReportsV2(workspaceId, runId)).revisions.length, 1);
  assert.equal((await reopened.buildInsightReaderReport(workspaceId, runId, request, owner)).exactRetry, true);
  assert.deepEqual(await snapshot(), saved); assert.equal(clockCalls, 0); assert.equal(casWrites, 0);
  const decision = { contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(), revisionId: receipt.revision.revisionId,
    htmlSha256: receipt.revision.htmlSha256, decision: 'APPROVED', reason: null };
  assert.equal((await post('decisions/v2', { ...decision, reportKind: 'MARKET' })).status, 409);
  assert.deepEqual(await snapshot(), saved);
  assert.equal((await post('decisions/v2', decision)).status, 201);
  const decided = await snapshot(); assert.notDeepEqual(decided, saved);
  assert.equal((await post('decisions/v2', decision)).status, 200);
  assert.deepEqual(Buffer.from(await (await get()).arrayBuffer()), bytes); assert.deepEqual(await snapshot(), decided);
  assert.equal(providerCalls, 0); assert.equal(collectorCalls, initialCollectorCalls);
  assert.deepEqual(await service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId), source);
});

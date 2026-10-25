import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { Socket } from 'node:net';
import { Duplex } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { createTikTokShopReviewsSource } from '../../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import { insightCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { ShopeePublicReviewCollector } from '../../src/platform/collectors/shopee-public-reviews.js';
import { FakeClock, FakeTransport, ORIGIN, successfulScript } from './shopee-public-fakes.js';
import { PRODUCTS, result, row, TOKEN } from '../fixtures/shopee-public-results.js';
import { offlineTransport } from '../unit/tiktok-shop-reviews.fixtures.js';
import { syntheticProductSource, SYNTHETIC_CARD_ID } from './research-synthetic-sources.js';
import { seedNativeDamiPackage } from './native-dami-package-fixture.js';
import { captureFiles } from './autorun-harness.js';

export const workspaceId = '11111111-1111-4111-8111-111111111111';
export const runId = '22222222-2222-4222-8222-222222222222';
export const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export type Source = 'PUBLIC' | 'NATIVE' | 'EXACT' | 'NONE';

// All mapping branches, in source order; the two conflict versions form one corpus record.
export const publicRows = [
  row(0, { review_id: 'readable', comment: 'Synthetic lid fits.', stars: 4 }),
  row(0, { review_id: 'unreadable', comment: null }),
  row(0, { review_id: 'attributes', comment: '', content_type: 'attributes_only' }),
  row(0, { review_id: 'empty', comment: '', attributes: [] }),
  row(0, { review_id: 'conflict', comment: 'Synthetic first version.' }),
  row(0, { review_id: 'conflict', comment: 'Synthetic second version.' }),
  row(0, { review_id: null, comment: 'Synthetic row without identity.' }),
];

export async function publicCodingFixture(t: TestContext, options: { source?: Source; s06?: boolean; lowShare?: boolean } = {}) {
  const source = options.source ?? 'PUBLIC';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-public-insight-coding-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const clock = new FakeClock();
  const db = openDatabase({ databasePath, now: clock.now }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now: clock.now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'public-insight-coding', title: 'Synthetic coding' });
  if (source === 'NATIVE') await seedNativeDamiPackage(new SourcePackageService({ db, artifactStore: artifacts, now: clock.now }), {
    selected: PRODUCTS[0], rawRows: [{ type: 'review', shopid: PRODUCTS[0].shopId, itemid: PRODUCTS[0].itemId,
      cmtid: 'synthetic-native', comment: 'Synthetic native lid fits.', rating_star: 4 }],
  });
  const script = successfulScript([publicRows.length]);
  script.find(exchange => exchange.path.endsWith('/result'))!.body = result(0, publicRows);
  const wire = new FakeTransport(script, () => clock.milliseconds);
  const reviews = offlineTransport();
  const provider = createKalodataProvider('synthetic-auth', { ...reviews.transport, async fetch(input, init) {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/comment/insight') || url.pathname.endsWith('/credit/balance')) return reviews.transport.fetch(input, init);
    const body = JSON.parse(String(init?.body));
    const payload = url.pathname.endsWith('/product/rank')
      ? { success: true, data: [{ product_id: '12345', product_name: 'Synthetic container', unit_price: 10 }] }
      : url.pathname.endsWith('/product/detail')
        ? { success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
          product_name: 'Synthetic container', revenue: 10, sales_volumn: 1, unit_price: 10 } }
        : assert.fail('Unexpected offline sales endpoint');
    return Response.json(payload);
  } });
  const collectedInputs: AutomationReportInput[] = [];
  let sequence = 0;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now: clock.now,
    uuid: () => sequence++ === 0 ? runId : `99999999-9999-4999-8999-${String(sequence).padStart(12, '0')}`,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: options.s06 ? bindResearchAutomationProvider(provider) : syntheticProductSource(),
    metricAttachmentStore: new RequestScopedArtifactStore(artifactRoot), readerReportFlint: false,
    renderer: (input, kind) => { collectedInputs.push(input); return buildResearchAutomationReport(input, kind); },
    ...(source === 'PUBLIC' ? { shopeePublicReviews: { maxReviewsPerProduct: 20, factory: stage => {
      const collector = new ShopeePublicReviewCollector({ token: TOKEN, baseUrl: ORIGIN, journalRoot: path.join(root, 'journal'),
        confirmedSourceSetSha256: stage.confirmedSourceSetSha256, maxReviewsPerProduct: stage.maxReviewsPerProduct,
        sampleMode: stage.sampleMode, fetch: wire.fetch, sleep: clock.sleep, clock: clock.now });
      return { collector, requestsIssued: collector.requestsIssued };
    } } } : {}),
    ...(source === 'EXACT' ? { shopeeCollectorFactory: () => ({ requestsIssued: () => 0,
      collector: new FixtureShopeeCollector(Buffer.from(JSON.stringify([{ shopId: PRODUCTS[0].shopId, itemId: PRODUCTS[0].itemId,
        reviewId: 'synthetic-exact', comment: 'Synthetic exact lid fits.', ratingStar: 5 }]))) }) } : {}),
    ...(options.s06 ? { tiktokShopReviewsSource: createTikTokShopReviewsSource(provider) } : {}),
  });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT',
    keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-29' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  let metric: { decision: 'ABSENT' } | { decision: 'USE_PREPARED'; packageId: string } = { decision: 'ABSENT' };
  if (options.lowShare) {
    const files = captureFiles(runId);
    const snapshot = JSON.parse(files.snapshotBytes.toString());
    snapshot.scope.platforms = ['shopee', 'tiktok'];
    const rows = snapshot.groups.W12_topProducts.rows;
    const small = structuredClone(rows[0]);
    small.cells.name.text = 'Synthetic small channel'; small.cells.platform.text = 'tiktok';
    for (const key of ['revenue', 'units']) { small.cells[key].platform = 'tiktok'; small.cells[key].value = 1; small.cells[key].displayed = '1'; }
    rows.push(small);
    const bytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
    const manifest = JSON.parse(files.manifestBytes.toString());
    manifest.appliedFilters.platforms = ['shopee', 'tiktok']; manifest.resultCount = 4;
    manifest.productPagination.rowsRead = 4; manifest.productPagination.cap = 4; manifest.productPagination.pageSize = 4;
    manifest.files[0].sha256 = createHash('sha256').update(bytes).digest('hex'); manifest.files[0].byteSize = bytes.length;
    const prepared = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
      requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision, sourceContext: 'Synthetic channel split' },
    bytes, Buffer.from(JSON.stringify(manifest)));
    metric = { decision: 'USE_PREPARED', packageId: prepared.packageId };
  }
  const common = { requestKey: randomUUID(), expectedRevision: (await service.getRun(workspaceId, runId)).revision,
    definition: 'Synthetic coding scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [],
    exactShopeeUrls: source === 'NONE' ? [] : [PRODUCTS[0].productUrl] };
  await service.confirmScope(workspaceId, runId, source === 'PUBLIC'
    ? { ...common, contractVersion: 'research-automation-confirm-v3', sources: { metric,
      nativeReview: { decision: 'COLLECT_EXACT', providerId: 'shopee-public-review', maxReviewsPerProduct: 20 } } }
    : { ...common, contractVersion: 'research-automation-confirm-v2', sources: { metric,
      nativeReview: source === 'NONE' ? 'SKIP' : 'AUTO_REUSE' } });
  const drain = async () => { for (let i = 0; i < 30 && await service.processNext(); i++) { /* bounded synthetic worker */ } };
  await drain();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  if (source === 'PUBLIC') wire.done();
  const pair = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  const context = (pairId = pair.pairId) => service.readInsightSourceContext(workspaceId, runId, pairId);
  const revise = async (decision: 'KEEP' | 'SKIP' = 'KEEP', previousPairId = pair.pairId) => {
    const receipt = await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1',
      requestKey: randomUUID(), previousPairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision } } });
    await drain();
    const attempt = await service.getReportRevision(workspaceId, runId, receipt.attemptId);
    assert.equal(attempt.state, 'COMMITTED', JSON.stringify(attempt));
    return (await service.listReportVersions(workspaceId, runId)).find(value => value.attemptId === receipt.attemptId)!;
  };
  return { root, databasePath, artifactRoot, db, artifacts, service, pair, context, revise, collectedInputs, reviews };
}

export type PublicCodingFixture = Awaited<ReturnType<typeof publicCodingFixture>>;

// Runs real Node HTTP messages through the authenticated handler without opening sockets.
export async function codingApi(t: TestContext, f: PublicCodingFixture) {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), 'http://127.0.0.1:43124/v1/chat/completions');
    calls++;
    const envelope = JSON.parse(String(init?.body)), payload = JSON.parse(envelope.messages[1].content);
    const record = payload.records[0];
    const text = record.record.text as string;
    const annotations = { i02: [], i04: [], i05: [{ recordIndex: record.recordIndex,
      span: { start: 0, end: text.length, quote: text }, polarity: 'POSITIVE', target: { state: 'NOT_STATED', span: null },
      speakerAttribution: { state: 'NOT_STATED', span: null }, qualifiers: [], counterevidence: [],
      provenance: { basis: 'PENDING_AI', coderRole: 'synthetic-model', adjudication: null, disagreement: null } }],
    i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
    return Response.json({ choices: [{ message: { content: JSON.stringify({ codebooks: [], annotations }) } }] });
  });
  const origin = 'http://127.0.0.1:43123';
  const token = 'synthetic-owner-token-abcdefghijklmnopqrstuvwxyz123456';
  const application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: 'owner:synthetic-coding' },
    insightCoding: { cliproxy: { baseUrl: 'http://127.0.0.1:43124', apiKey: 'synthetic-key-123456' },
      configuration: insightCodingCliproxyConfiguration('synthetic-model') } });
  t.after(() => application.close());
  const request = (method: 'GET' | 'POST', suffix: string, body?: unknown) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    const req = new http.IncomingMessage(socket as Socket);
    req.method = method;
    req.url = `/${method === 'POST' ? 'owner-api' : 'api'}/workspaces/${workspaceId}/research-automation/runs/${runId}/${suffix}`;
    req.headers = { host: new URL(origin).host, origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1; req.complete = true;
    const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
    req.headers['content-length'] = String(bytes?.length ?? 0);
    if (bytes) req.push(bytes);
    req.push(null);
    const response = new http.ServerResponse(req);
    response.assignSocket(socket as Socket);
    response.on('error', reject);
    response.on('finish', () => {
      try {
        const wire = Buffer.concat(chunks).toString();
        resolve({ status: response.statusCode, body: JSON.parse(wire.slice(wire.indexOf('\r\n\r\n') + 4)) });
      } catch (error) { reject(error); }
      finally { socket.destroy(); }
    });
    application.handler(req, response);
  });
  return { get: (pairId = f.pair.pairId) => request('GET', `insight-coding/${pairId}`),
    post: (action: string, body: unknown) => request('POST', action, body), modelCalls: () => calls };
}

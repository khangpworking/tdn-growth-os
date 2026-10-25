import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import {
  pdfLane, runSaveStepLane, videoLane, type CaptureEnvelope, type PdfLaneFacts,
  type SaveStepContext, type VideoLaneFacts,
} from '../../src/modules/analysis/research-automation/collection-lanes-save-step.js';
import { MAX_CAPTURES_PER_STEP, type CaptureRecord, type StepResultDocument, type StepWebResult } from '../../src/modules/analysis/research-automation/model.js';
import { MARKET_CAPTURE_READ_BUDGET_BYTES } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import { CaptureLog } from '../../src/modules/analysis/research-automation/provider-common.js';
import type { CollectInput, ProviderRawCapture, ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { createPdfDiscoverySource, type PdfDiscoverySource } from '../../src/modules/analysis/research-automation/pdf-discovery-lane.js';
import { VideoWatchLane } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { SYNTHETIC_SERP_KEY } from '../helpers/research-synthetic-sources.js';

const now = () => new Date('2026-10-02T00:00:00.000Z');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const keyword = 'synthetic product';
const step: StepResultDocument = {
  contractVersion: 'research-automation-step-result-v1', runId: '22222222-2222-4222-8222-222222222222',
  stepId: 'COLLECTION', outcome: 'PARTIAL', productCards: [], comparables: [], coverage: [],
  limitations: [{ code: 'EARLIER_LANE', provider: null, message: 'Preserve earlier lane content.' }],
};
const input: CollectInput = { runId: step.runId, mode: 'CATEGORY', keyword,
  requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, country: 'VN', selectedProductRefs: [], peerProductRefs: [] };
const videoUrls = ['1234567890123456789', '1234567890123456790'].map(id => `https://www.tiktok.com/@synthetic/video/${id}`);
const pdfUrl = (n: number) => `https://reports.example/market-${n}.pdf`;
const webRow = (url: string, position = 1): StepWebResult => ({ url, position, title: keyword, snippet: keyword, captureIndex: 0, retrievedAt: now().toISOString() });
const fail = async (): Promise<never> => { throw new Error('unexpected provider or publication call'); };
const transport: ProviderTransport = { fetch: fail, sleep: async () => {}, now: () => now().getTime() };
function capture(label: string, video = false): ProviderRawCapture {
  const log = new CaptureLog(video ? 'VIDEO-WATCH' : 'KALODATA', transport, undefined, 1);
  return log.record({ operation: video ? 'videowatch.generate' : 'kalodata.product.rank', billing: 'FREE_ACCOUNT_QUERY',
    method: 'GET', endpoint: 'https://synthetic.example/capture', requestParameters: {}, requestBodyBytes: null,
    queryWindow: null, pageNumber: null, productRef: null }, log.timestamp(), 'OK', 200, Buffer.from(label), null);
}
function envelope(value: ProviderRawCapture): CaptureEnvelope {
  const { requestBodyBytes, responseBytes, ...rest } = value;
  return { capture: value, body: Buffer.from(JSON.stringify({ contractVersion: 'research-automation-capture-v1', ...rest,
    requestBodyBytesBase64: requestBodyBytes?.toString('base64') ?? null, responseBytesBase64: responseBytes?.toString('base64') ?? null })) };
}

// A memory capture store, not a persistence receipt stub: rows and sizes derive only from bytes actually put.
function captureStore() {
  const records: CaptureRecord[] = [], artifacts = new Map<string, Buffer>();
  let bytes = 0, rejectDownloads = false;
  const context: SaveStepContext = {
    stepId: 'COLLECTION', signal: undefined, check: () => {}, captures: {
      envelopes: values => values.map(envelope), rows: () => records, byteSize: () => bytes,
      put: async values => {
        for (const { capture: value, body } of values) {
          if (rejectDownloads && value.operation === 'pdfdiscovery.download') throw new Error('synthetic capture write failure');
          const digest = sha(body);
          artifacts.set(digest, body); bytes += body.byteLength;
          records.push({ stepId: 'COLLECTION', ordinal: records.length, artifactSha256: digest, mediaType: 'application/json',
            provider: value.provider.toLowerCase(), operation: value.operation, retrievedAt: value.completedAt, window: value.queryWindow, truncated: false });
        }
      },
    },
  };
  return { context, records, artifacts, rejectDownloads: () => { rejectDownloads = true; },
    read: async (digest: string) => { const body = artifacts.get(digest); assert.ok(body, 'artifact was put'); return body; } };
}
async function videoSource(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-save-step-video-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new VideoWatchLane({ media: { mediaDir: root, ytdlpBin: 'unused', ffprobeBin: 'unused' }, model: null, now, runner: fail });
}
function videoFacts(overrides: Partial<VideoLaneFacts> = {}): VideoLaneFacts {
  return { market: true, context: async () => ({ binding: { workspaceId: '11111111-1111-4111-8111-111111111111', runId: step.runId,
    scopeSha256: 'a'.repeat(64), sourceSetSha256: null }, productKeyword: keyword,
    selectionVideos: videoUrls.map(url => ({ url })), topSellingVideos: [], topSellingGap: false }), publish: fail, ...overrides };
}

function pdfFixture(overrides: Partial<PdfLaneFacts> = {}) {
  const store = captureStore(), retained = new Map<string, { bytes: Buffer; title: string | null }>();
  const calls = { search: 0, downloads: [] as string[] };
  const pdfTransport: ProviderTransport = { ...transport, fetch: async request => {
    const url = new URL(String(request));
    if (url.pathname === '/search.json') {
      calls.search++;
      return Response.json({ search_parameters: { q: url.searchParams.get('q') },
        organic_results: [{ position: 1, title: `${keyword} report`, snippet: keyword, link: pdfUrl(3) }] });
    }
    calls.downloads.push(url.href);
    return new Response(Buffer.from(`%PDF-1.4\n% ${url.pathname}\n%%EOF\n`), { headers: { 'content-type': 'application/pdf' } });
  } };
  const source = createPdfDiscoverySource(SYNTHETIC_SERP_KEY, pdfTransport, async () => ['203.0.113.10'], pdfTransport.fetch);
  const facts: PdfLaneFacts = { input, market: true, aborted: false, readerOn: () => true, remainingPdfSlots: () => 2 - retained.size,
    admittedRows: async () => [webRow(pdfUrl(1)), webRow(pdfUrl(2), 2)], keywordFilter: null,
    readArtifact: store.read, pageCheck: async () => 'OK', runPdfShas: () => [...retained.values()].map(file => sha(file.bytes)),
    retainPdf: async (name, bytes, title) => { assert.ok(!retained.has(name)); retained.set(name, { bytes: Buffer.from(bytes), title }); }, ...overrides };
  return { ...store, source, facts, calls, retained };
}

// Service characterization owns durable receipts/bytes. These rows own the new save-step interface:
// lazy facts, evolving step, capture-store refusals/budgets and returned usage (not DB-sorted usage).
test('save-step row 1: QUICK_SEARCH and lane-off preserve the step without building facts', async t => {
  const source = await videoSource(t), f = pdfFixture();
  for (const lane of [videoLane(source), pdfLane(f.source)]) {
    const lazy = () => { assert.fail('disabled lane built facts'); };
    const quick = { ...step, stepId: 'QUICK_SEARCH' as const };
    const skipped = await runSaveStepLane<never>(lane, quick, { ...f.context, stepId: 'QUICK_SEARCH' }, lazy);
    assert.equal(skipped.step, quick); assert.deepEqual(skipped.usage, []);
    const off = await runSaveStepLane(undefined, step, f.context, lazy);
    assert.equal(off.step, step); assert.deepEqual(off.usage, []);
  }
  const enabled = await runSaveStepLane(pdfLane(f.source), step, f.context, () => f.facts);
  assert.equal(enabled.step.pdfDiscovery?.files.length, 2, 'COLLECTION control runs the lane');
});

test('save-step row 2: video still runs after abort and skips every candidate as CANCELLED', async t => {
  const source = await videoSource(t), store = captureStore();
  for (const aborted of [false, true]) {
    const controller = new AbortController();
    if (aborted) controller.abort();
    const result = await runSaveStepLane(videoLane(source), step, { ...store.context, signal: controller.signal }, () => videoFacts());
    assert.deepEqual(result.step.videoWatch?.videos.map(video => [video.videoId, video.status, video.reason, video.captureIndex]),
      videoUrls.map(url => [url.split('/').at(-1), 'SKIPPED', aborted ? 'CANCELLED' : 'VIDEO_MODEL_NOT_CONFIGURED', null]));
    assert.deepEqual(result.usage, []); assert.equal(result.step.outcome, step.outcome);
  }
  assert.equal(store.records.length, 0);
});

test('save-step row 3: video uses the evolving step and indexes each last capture after put', async t => {
  const source = await videoSource(t), store = captureStore();
  await store.context.captures.put([envelope(capture('earlier'))]);
  // Substitute only the executor port. Candidate planning, merges, indexes and usage stay real.
  source.run = async ({ candidates }) => candidates.map((candidate, index) => ({ candidate, reason: 'MODEL_FAILED',
    media: null, reading: null, captures: [capture(`attempt-${index}`, true), capture(`answer-${index}`, true)], requests: 2, paidRequests: 2, downloads: 1 }));
  const evolving: StepResultDocument = { ...step, limitations: [...step.limitations], expandedSearch: { queries: [{ kind: 'TIKTOK', status: 'COLLECTED', reason: null,
    requestedWindow: null, retrievedAt: now().toISOString(), captureIndex: 0, results: [webRow(videoUrls[1]!)] }] } };
  const facts = videoFacts();
  const result = await runSaveStepLane(videoLane(source), evolving, store.context, () => videoFacts({ context: async current => {
    // Like the service's context function, this may append a limitation to the supplied evolving step.
    Object.assign(current, { limitations: [...current.limitations, { code: 'CONTEXT_LIMIT', provider: null, message: 'Keep context limitation.' }] });
    return { ...await facts.context(current), selectionVideos: [{ url: videoUrls[0]! }], topSellingGap: true };
  } }));
  assert.deepEqual(result.step.videoWatch?.videos.map(video => [video.videoId, video.captureIndex]), [
    ['1234567890123456789', 2], ['1234567890123456790', 4],
  ]);
  assert.deepEqual(result.step.limitations.map(item => item.code), ['EARLIER_LANE', 'CONTEXT_LIMIT', 'TOP_SELLING_VIDEO_LOCATORS_UNAVAILABLE']);
  assert.deepEqual(result.step.expandedSearch, evolving.expandedSearch);
  assert.deepEqual(store.records.map(record => record.ordinal), [0, 1, 2, 3, 4]);
  assert.equal(result.step.outcome, step.outcome);
});

test('save-step row 4: a video executor throw returns exactly one UNKNOWN settlement at ordinal 8', async t => {
  const source = await videoSource(t);
  for (const thrown of [false, true]) {
    const store = captureStore();
    if (thrown) source.run = fail;
    const result = await runSaveStepLane(videoLane(source), step, store.context, () => videoFacts());
    assert.deepEqual(result.usage, thrown ? [{ kind: 'UNSETTLED', ordinal: 8, provider: 'video-watch' }] : []);
    assert.deepEqual(result.step.videoWatch?.videos.map(video => video.reason), Array(2).fill(thrown ? 'PROVIDER_FAILED' : 'VIDEO_MODEL_NOT_CONFIGURED'));
    assert.equal(result.step.outcome, step.outcome);
  }
});

test('save-step row 5: PDF gates Market, collection input and abort, and downloads only admitted rows', async () => {
  for (const gate of ['allowed', 'insight', 'no-input', 'aborted', 'signal', 'no-admission'] as const) {
    const controller = new AbortController();
    if (gate === 'signal') controller.abort();
    const f = pdfFixture({ market: gate !== 'insight', input: gate === 'no-input' ? undefined : input, aborted: gate === 'aborted',
      ...(gate === 'no-admission' ? { admittedRows: async () => [] } : {}) });
    // Unadmitted step rows must not be used in place of the explicit admittedRows input.
    const current = { ...step, webResults: [webRow(pdfUrl(99))] };
    const result = await runSaveStepLane(pdfLane(f.source), current, { ...f.context, signal: controller.signal }, () => f.facts);
    assert.deepEqual(f.calls.downloads, gate === 'allowed' ? [pdfUrl(1), pdfUrl(2)] : [], gate);
    assert.equal(f.calls.search, 0, gate);
    if (gate === 'no-admission') assert.equal(result.step.pdfDiscovery?.reason, 'SEARCH_NO_ADMISSION');
    else if (gate !== 'allowed') { assert.equal(result.step, current); assert.deepEqual(result.usage, []); }
    else assert.deepEqual(result.step.pdfDiscovery?.files.map(file => [file.origin, file.url]), [['RUN_ROWS', pdfUrl(1)], ['RUN_ROWS', pdfUrl(2)]]);
  }
});

test('save-step row 6: PDF capture and read budgets bound storage; retained names and question slots stay stable', async () => {
  for (const boundary of ['count-fits', 'count-full', 'bytes-fit', 'bytes-full', 'one-slot'] as const) {
    const f = pdfFixture();
    const probe = await f.source.download([{ url: pdfUrl(1), origin: 'RUN_ROWS' }]);
    const item = probe.items[0]; assert.equal(item?.kind, 'DOWNLOADED');
    const downloadSize = envelope(item.capture).body.byteLength;
    f.calls.downloads.length = 0;
    const prefixCount = boundary.startsWith('count') ? MAX_CAPTURES_PER_STEP - (boundary === 'count-fits' ? 1 : 0) : 2;
    const prefix = envelope(capture('prefix'));
    await f.context.captures.put(Array.from({ length: prefixCount }, () => prefix));
    if (boundary.startsWith('bytes')) {
      const target = MARKET_CAPTURE_READ_BUDGET_BYTES - downloadSize - (boundary === 'bytes-fit' ? 0 : -1);
      // Put real bounded envelopes until the existing bytes leave exactly one file's space (or one byte less).
      while (f.context.captures.byteSize() < target) {
        const remaining = target - f.context.captures.byteSize();
        const base = capture('padding');
        const empty = envelope({ ...base, requestParameters: { padding: '' } });
        const body = envelope({ ...base, requestParameters: { padding: 'x'.repeat(Math.min(16 * 1024 * 1024, remaining) - empty.body.byteLength) } });
        await f.context.captures.put([body]);
      }
    }
    const before = f.records.length;
    const facts = boundary === 'one-slot' ? { ...f.facts, remainingPdfSlots: () => 1 - f.retained.size } : f.facts;
    const result = await runSaveStepLane(pdfLane(f.source), step, f.context, () => facts);
    const fits = boundary === 'count-fits' || boundary === 'bytes-fit' || boundary === 'one-slot';
    assert.deepEqual(result.step.pdfDiscovery?.files.map(file => [file.status, file.reason, file.captureIndex]),
      boundary === 'one-slot' ? [['DOWNLOADED', null, before]] : fits
        ? [['DOWNLOADED', null, before], ['FAILED', 'BRIDGE_BUDGET_LIMIT', null]]
        : [['FAILED', 'BRIDGE_BUDGET_LIMIT', null], ['FAILED', 'BRIDGE_BUDGET_LIMIT', null]], boundary);
    assert.deepEqual([...f.retained.keys()], fits ? [`source-${before + 1}.pdf`] : [], boundary);
    assert.equal(f.records.length, before + (fits ? 1 : 0), boundary);
    assert.equal(f.calls.downloads.length, boundary === 'one-slot' ? 1 : 2, boundary);
  }
});

test('save-step row 7 TODAY: PDF write refusal is TRANSPORT; a download throw adds no UNKNOWN row', async () => {
  for (const failure of ['none', 'write', 'download', 'document'] as const) {
    const f = pdfFixture();
    if (failure === 'write') f.rejectDownloads();
    const source: PdfDiscoverySource = failure === 'download' ? { ...f.source, download: fail } : f.source;
    const context = failure === 'document' ? { ...f.context, check: () => { throw new Error('synthetic document rejection'); } } : f.context;
    const result = await runSaveStepLane(pdfLane(source), step, context, () => f.facts);
    assert.equal(result.step.pdfDiscovery?.reason, failure === 'none' ? null : failure === 'document' ? 'DOCUMENT_INVALID' : 'TRANSPORT', failure);
    assert.deepEqual(result.usage.map(row => [row.kind, row.ordinal]), failure === 'download' ? [] : [['USAGE', 15]], failure);
    assert.equal(result.step.outcome, step.outcome);
    assert.equal(f.retained.size, failure === 'none' || failure === 'document' ? 2 : 0);
    if (failure === 'write') assert.deepEqual(result.step.pdfDiscovery?.files.map(file => [file.reason, file.captureIndex]), [['TRANSPORT', null], ['TRANSPORT', null]]);
  }
});

test('save-step row 8: returned usage keeps video before PDF search then PDF download', async t => {
  const source = await videoSource(t);
  source.run = async ({ candidates }) => candidates.map(candidate => ({ candidate, reason: 'MODEL_FAILED', media: null, reading: null,
    captures: [capture('answer', true)], requests: 1, paidRequests: 1, downloads: 1 }));
  const f = pdfFixture({ admittedRows: async () => [], keywordFilter: { contractVersion: 'l9-keyword-data-v1', dataVersion: 'synthetic-v1',
    category: 'synthetic', provenance: 'OPERATOR_SUPPLIED', keywords: [keyword], exclusions: [] } });
  const video = await runSaveStepLane(videoLane(source), step, f.context, () => videoFacts());
  const pdf = await runSaveStepLane(pdfLane(f.source), video.step, f.context, () => f.facts);
  assert.equal(pdf.step.pdfDiscovery?.reason, null);
  assert.deepEqual([...video.usage, ...pdf.usage].map(row => [row.kind, row.ordinal,
    row.kind === 'USAGE' ? row.result.provider : row.provider,
    row.kind === 'USAGE' ? row.result.usage.requestsIssued : null]), [
    ['USAGE', 8, 'VIDEO-WATCH', 2], ['USAGE', 14, 'SERPAPI', 1], ['USAGE', 15, 'PDF-DISCOVERY', 1],
  ]);
  assert.equal(f.calls.search, 1); assert.deepEqual(f.calls.downloads, [pdfUrl(3)]);
  assert.equal(pdf.step.pdfDiscovery?.search.captureIndex, 2);
  assert.equal(pdf.step.pdfDiscovery?.files[0]?.captureIndex, 3);
});

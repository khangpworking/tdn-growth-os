import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { deriveReaderSource } from '../../src/modules/analysis/reader-report/web-facts.js';
import { normaliseMetricWebSnapshot } from '../../src/modules/analysis/research-automation/metric-web-facts.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { CaptureLog } from '../../src/modules/analysis/research-automation/provider-common.js';
import { MAX_CAPTURE_BYTES } from '../../src/modules/analysis/research-automation/model.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { PDF_DISCOVERY_MISSING, PDF_DISCOVERY_NOT_READ_IN_TIME, PDF_DISCOVERY_SOURCE_LABEL, PDF_EXCERPT_TITLE } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { createPdfDiscoverySource, type PdfDiscoverySource, type PdfResolver } from '../../src/modules/analysis/research-automation/pdf-discovery-lane.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import { captureFiles } from '../helpers/autorun-harness.js';

const KEYWORD = 'bình giữ nhiệt';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const RUN_PDF = 'https://bao-cao.example/nganh/binh-giu-nhiet-2026.pdf';
const RUN_PDF_2 = 'https://bao-cao.example/nganh/binh-giu-nhiet-2025.pdf';
const SEARCH_PDF = 'https://thong-ke.example/bao-cao/binh-giu-nhiet.pdf';
const pdfBytes = (label: string) => Buffer.from(`%PDF-1.4\n% synthetic ${label}\n%%EOF\n`, 'latin1');
const publicDns: PdfResolver = async () => ['203.0.113.10'];
const privateDns: PdfResolver = async () => ['10.0.0.8'];
const row = (position: number, link: string, title = `Báo cáo ngành ${KEYWORD} ${position}`) => ({ position, title, link, snippet: `Số liệu ${KEYWORD} theo năm` });
const blockOf = (html: string): string => { const start = html.indexOf(`<h3>${PDF_EXCERPT_TITLE}`); return start < 0 ? '' : html.slice(start, html.indexOf('</ul>', start) + 5); };

/** The older draft has no source-status table without these optional lanes; only that new table may differ. */
function assertMissingPdfStatus(html: string, offHtml: string): void {
  const dom = new JSDOM(html);
  const rows = [...dom.window.document.querySelectorAll('tr')].filter(row => row.firstElementChild?.textContent === PDF_DISCOVERY_SOURCE_LABEL);
  assert.equal(rows.length, 1, 'one source-status row');
  assert.equal(rows[0]!.lastElementChild?.textContent, PDF_DISCOVERY_MISSING);
  assert.equal(rows[0]!.closest('details'), null, 'status is visible');
  assert.doesNotMatch(rows[0]!.textContent!, /%|0|Google|https?:|studocu|scribd|metric/iu);
  assert.deepEqual(providerNameViolations(html), []);
  dom.window.close();
  assert.equal(html.replace(/<div class="table-wrap market14-sources">[\s\S]*?<\/table><\/div>/u, ''), offHtml,
    'outside the sources table, report bytes are unchanged');
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  const failures = (text: string) => auditMarket14(text).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  assert.deepEqual(failures(html).filter(rule => !failures(offHtml).includes(rule)), [], 'no new 14-rule failures');
}

/** One transport for the extra search and the downloads; counts each kind. */
function pdfTransport(searchRows: unknown[], large = false, failSearch = false) {
  const calls = { search: 0, download: 0, queries: [] as string[], headers: [] as Headers[] };
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/search.json') {
        calls.search += 1; calls.queries.push(url.searchParams.get('q') ?? '');
        if (failSearch) return new Response('synthetic failure', { status: 503 });
        return new Response(JSON.stringify({ search_parameters: { q: url.searchParams.get('q') }, organic_results: searchRows }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      calls.download += 1; calls.headers.push(new Headers(init?.headers));
      const bytes = large ? Buffer.alloc(MAX_CAPTURE_BYTES, 32) : pdfBytes(url.pathname);
      if (large) bytes.set(pdfBytes(url.pathname));
      return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return { transport, calls };
}

/** PageIndex fake that keeps each uploaded file name, so citations name the retained `source-N.pdf`. */
function pageIndexFake() {
  let notReady = false;
  const docs = new Map<string, string>();
  const calls = { upload: 0, question: 0, localReads: 0, titleReads: 0 };
  const fetchFake: typeof fetch = async (input, init) => {
    const pathname = new URL(String(input)).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    const docOf = (id: string) => ({ id, name: docs.get(id)!, pageNum: 1, status: 'completed' });
    if (pathname === '/doc/') { calls.upload += 1; const id = `pi-${docs.size + 1}`; docs.set(id, ((init?.body as FormData).get('file') as File).name); return Response.json({ ...docOf(id), status: 'processing' }); }
    if (pathname === '/docs') return Response.json({ documents: [...docs.keys()].map(docOf) });
    const match = /^\/doc\/([^/]+)\/(metadata|block\/p1_text_1\/)$/u.exec(pathname);
    if (match?.[2] === 'metadata') return Response.json({ ...docOf(match[1]!), status: notReady ? 'processing' : 'completed' });
    if (match) return Response.json({ doc_id: match[1], page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20], text: 'Thị trường tăng đều theo quý' });
    if (pathname === '/chat/completions') {
      calls.question += 1;
      const name = docs.get(String(body.doc_id))!;
      return Response.json({ choices: [{ message: { content: `x <doc=${name};page=1;block=p1_text_1>` } }], citations: [{ document: name, page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20] }] });
    }
    throw new Error(`Unexpected connector request ${pathname}`);
  };
  return { fetchFake, calls, markNotReady: () => { notReady = true; } };
}

interface RunOptions {
  readonly organic: unknown[]; readonly searchRows?: unknown[]; readonly resolve?: PdfResolver; readonly lane: boolean;
  readonly large?: boolean; readonly failSearch?: boolean; readonly throwDownload?: boolean; readonly throwSearch?: boolean; readonly failCaptureWrite?: boolean; readonly failPdfRetention?: boolean; readonly ownerPdf?: boolean;
  readonly ownerPdfLabel?: string; readonly questionCap?: number; readonly noAdmission?: boolean;
  /** Local page count per file (default 1); a file whose bytes contain `longLabel` reports `longPages`. */
  readonly longLabel?: string; readonly longPages?: number; readonly maxPages?: number; readonly readerOff?: boolean;
  readonly genericPdfLabel?: string; readonly uncountableLabel?: string;
  readonly reports?: ('MARKET' | 'INSIGHT')[]; readonly notReady?: boolean;
}
async function runToDraft(t: TestContext, options: RunOptions) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pdf-discovery-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const put = artifacts.put.bind(artifacts);
  artifacts.put = async bytes => {
    const buffer = Buffer.from(bytes);
    if (options.failCaptureWrite && buffer.includes(Buffer.from('"operation":"pdfdiscovery.download"'))) throw new Error('synthetic capture write failure');
    if (options.failPdfRetention && buffer.subarray(0, 5).toString() === '%PDF-') throw new Error('synthetic PDF retention failure');
    return put(bytes);
  };
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'pdf-discovery', title: 'Synthetic report PDF run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const pdf = pdfTransport(options.searchRows ?? [], options.large, options.failSearch);
  const pageIndex = pageIndexFake();
  const sourceCalls = { quickSearch: 0, collect: 0, web: 0, keywords: 0 };
  let elapsed = 0;
  // The keyword draft needs the sales capture to carry the product name (same wrapper as the P9 source test).
  const product = syntheticProductSource();
  const sales: AutomationSourcePort = { ...product, quickSearch: async (input, opts) => {
    sourceCalls.quickSearch++;
    const result = await product.quickSearch(input, opts);
    const responseBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Bình giữ nhiệt từ nguồn bán hàng"}]}');
    return { ...result, result: { ...result.result, captures: result.result.captures.map(c => ({ ...c, responseBytes,
      responseSha256: createHash('sha256').update(responseBytes).digest('hex'), responseByteLength: responseBytes.length })) } };
  }, collect: async (input, opts) => {
    sourceCalls.collect++;
    const result = await product.collect(input, opts);
    // Two bounded synthetic exchanges leave room for one full-size PDF, but not two.
    const log = new CaptureLog('KALODATA', pdf.transport, undefined, 2);
    const padding = options.large ? [0, 1].map(() => log.record({ operation: 'none', billing: 'FREE_ACCOUNT_QUERY',
      method: 'POST', endpoint: 'https://sales.example/padding', requestParameters: {}, requestBodyBytes: null,
      queryWindow: null, pageNumber: null, productRef: null }, log.timestamp(), 'OK', 200, Buffer.alloc(14 * 1024 * 1024, 32), null)) : [];
    const generic = options.genericPdfLabel ? [log.record({ operation: 'none', billing: 'FREE_ACCOUNT_QUERY',
      method: 'GET', endpoint: 'https://sales.example/report.pdf', requestParameters: {}, requestBodyBytes: null,
      queryWindow: null, pageNumber: null, productRef: null }, log.timestamp(), 'OK', 200, pdfBytes(options.genericPdfLabel), null)] : [];
    return { ...result, result: { ...result.result, captures: [...padding, ...generic] } };
  } };
  const reportInputs = new Map<string, AutomationReportInput>();
  const source: PdfDiscoverySource = createPdfDiscoverySource(SYNTHETIC_SERP_KEY, pdf.transport, options.resolve ?? publicDns, pdf.transport.fetch);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => runId, now: () => new Date(now().getTime() + elapsed),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), readerReportFlint: false,
    readerRows: () => [0, 1, 2].map(i => ({ i, platform: 'shopee', listing: `listing-${i}`, shop: `shop-${i}`,
      cat: 'Bình', title: `Bình thử ${i}`, brand: '(không ghi)', rev: (i + 1) * 100, units: 2, asp: (i + 1) * 50, start: null })),
    renderer: (input, kind) => { reportInputs.set(kind, input); return buildResearchAutomationReport(input, kind); }, source: sales, webSource: syntheticWebSource(() => { sourceCalls.web++; }, options.organic),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => { sourceCalls.keywords++; if (options.noAdmission) throw new Error('synthetic admission failure'); return { keywords: [KEYWORD], exclusions: [] }; } } },
    pageIndex: { readyWaitCapMs: 40_000, readyPollIntervalMs: 20_000, sleep: async ms => { elapsed += ms; }, enabled: !options.readerOff, apiKey: 'synthetic-pdf-key', fetch: pageIndex.fetchFake, startingCreditMicroDollars: 10_000_000, maxQuestionsPerRun: options.questionCap ?? 10,
      readPdfTitle: async () => { pageIndex.calls.titleReads += 1; return null; },
      extractPdf: async bytes => { pageIndex.calls.localReads += 1;
        if (options.uncountableLabel && Buffer.from(bytes).includes(Buffer.from(options.uncountableLabel))) throw new Error('synthetic local reader unavailable');
        const pages = options.longLabel && Buffer.from(bytes).includes(Buffer.from(options.longLabel)) ? options.longPages ?? 61 : 1;
        return Array.from({ length: pages }, (_, i) => ({ page: i + 1, text: 'Thị trường tăng đều theo quý' })); } },
    ...(options.maxPages !== undefined ? { pdfCaptureMaxPages: options.maxPages } : {}),
    ...(options.lane ? { pdfDiscoverySource: { ...source,
      ...(options.throwDownload ? { download: async () => { throw new Error('synthetic port failure'); } } : {}),
      ...(options.throwSearch ? { search: async () => { throw new Error('synthetic pre-send failure'); } } : {}) } } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: KEYWORD, requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: options.reports ?? ['MARKET'] });
  await service.processNext();
  if (options.ownerPdf) await service.attachRunPdf(workspaceId, runId, 'owner.pdf', pdfBytes(options.ownerPdfLabel ?? 'owner'));
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) {
    if (options.notReady && db.prepare("SELECT 1 FROM analysis_research_automation_steps WHERE run_id=? AND step_id='REPORTS' AND state='QUEUED'").get(runId)) {
      db.prepare("UPDATE analysis_pageindex_documents SET status='INDEXING'").run();
      pageIndex.markNotReady();
    }
    await service.processNext();
  }
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY', 'a report PDF never fails the run');
  const step = db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { sha: string };
  const document = JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider, request_count n FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(value => { const r = value as { ordinal: bigint | number; provider: string; n: bigint | number }; return [Number(r.ordinal), r.provider, Number(r.n)] as const; });
  const captures = db.prepare(`SELECT ordinal, provider, operation, artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(value => { const r = value as { ordinal: bigint | number; provider: string; operation: string; sha: string }; return { ordinal: Number(r.ordinal), provider: r.provider, operation: r.operation, sha: r.sha }; });
  const runPdfs = db.prepare('SELECT source_sha256 sha, file_name name, document_title title FROM analysis_pageindex_run_pdfs WHERE run_id=? ORDER BY file_name').all(runId) as { sha: string; name: string; title: string | null }[];
  const html = async (pairId?: string) => (await service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8');
  const semantic = async (): Promise<Record<string, unknown>> => {
    const out = db.prepare('SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?').get(runId, 'MARKET') as { sha: string };
    return JSON.parse((await artifacts.read(out.sha)).toString('utf8')) as Record<string, unknown>;
  };
  return { db, artifacts, service, document, usage, captures, runPdfs, html, semantic, pdf, pageIndex, sourceCalls, reportInputs };
}

async function buildPdfReader(t: TestContext, f: Awaited<ReturnType<typeof runToDraft>>, kind: 'WORKBOOK' | 'CAPTURE') {
  const period = { startDate: '2025-10-01', endDate: '2026-09-30' };
  const expectedRevision = (await f.service.getRun(workspaceId, runId)).revision;
  let readerSource: ReturnType<typeof deriveReaderSource> = { measurementPeriod: { start: period.startDate, end: period.endDate }, rowCap: 5000,
    displayedHeadlines: { revenueVnd: 600, soldListings: 3, shops: 3, units: 6 }, platformBreakdown: { shopee: { displayedRevenueVnd: 600 } } };
  let packageId: string;
  let restore = () => {};
  if (kind === 'WORKBOOK') {
    // Workbook parsing is outside this contract; the readerRows seam supplies synthetic rows.
    // Keep real finalized-package verification and stub only the prepared-source inventory.
    const bytes = Buffer.from('Synthetic workbook for injected reader rows');
    const packages = new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now });
    const stored = await packages.intakeAutomationAttachment({ contractVersion: '1.0.0',
      packageKey: `synthetic-pdf-reader-workbook:${runId}`, version: 1, sourceLabel: 'Synthetic workbook', sourceAcquiredAt: null,
      files: [{ path: 'metric/export.xlsx', sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length,
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', representationRole: 'structured',
        evidenceFamily: 'synthetic-pdf-reader', independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic reader fixture' }] },
    new Map([['metric/export.xlsx', bytes]]), 'a'.repeat(64));
    packageId = stored.packageId;
    const inventory = t.mock.method(f.service, 'listPreparedMetricSources', async () => ({
      contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId,
      sources: [{ packageId, request: { measurementPeriod: period } }],
    }));
    restore = () => inventory.mock.restore();
  } else {
    const archive = captureFiles(runId, period);
    const snapshot = JSON.parse(archive.snapshotBytes.toString());
    snapshot.scope.keywords = [KEYWORD];
    for (const [index, entry] of snapshot.groups.W12_topProducts.rows.entries()) entry.cells.name.text = `${KEYWORD} mẫu ${index + 1}`;
    readerSource = deriveReaderSource(normaliseMetricWebSnapshot(snapshot), 5000, { nullable: true });
    const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
    const manifest = JSON.parse(archive.manifestBytes.toString());
    manifest.appliedFilters.keywords = [KEYWORD];
    manifest.files[0].sha256 = createHash('sha256').update(snapshotBytes).digest('hex');
    manifest.files[0].byteSize = snapshotBytes.length;
    const receipt = await f.service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
      requestKey: '66666666-6666-4666-8666-666666666666', expectedRevision, sourceContext: 'Synthetic PDF reader fixture' },
    snapshotBytes, Buffer.from(JSON.stringify(manifest)));
    packageId = receipt.packageId;
  }
  const request = { contractVersion: 'reader-report-build-v1.2',
    requestKey: kind === 'WORKBOOK' ? '77777777-7777-4777-8777-777777777777' : '88888888-8888-4888-8888-888888888888',
    metricPackageId: packageId, platforms: ['shopee'], cover: null,
    profile: { slug: 'synthetic-pdf-reader', product: 'Bình thử nghiệm', status: 'proposed', segments: { S1: 'Bình nhỏ', N1: 'Hàng khác' },
      short: { S1: 'Nhỏ' }, core: ['S1'], non: ['N1'], rules: [{ seg: 'S1', when: {} }], signals: [] },
    source: readerSource };
  const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
  try {
    const built = await f.service.buildReaderReport(workspaceId, runId, request, owner).catch((cause: unknown) => { throw new Error(`${kind} reader build failed`, { cause }); });
    const saved = await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId);
    assert.deepEqual(await f.service.buildReaderReport(workspaceId, runId, request, owner), { ...built, exactRetry: true });
    assert.deepEqual((await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes, saved.bytes);
    return saved.bytes.toString();
  } finally { restore(); }
}

type Appendix = { sourceAppendix: { rows: { registryId: string; binding: { kind: string; ref: string } }[] } };

test('flag on: one run-row PDF plus one admitted search PDF are downloaded, retained, read, and cited by capture', async t => {
  const f = await runToDraft(t, { lane: true, organic: [row(1, 'https://example.test/brand'), row(2, RUN_PDF)],
    searchRows: [row(1, SEARCH_PDF), row(2, 'https://shopee.example/bao-cao.pdf'), row(3, 'https://khac.example/khong-lien-quan.pdf', 'Tài liệu nấu ăn')] });
  const found = f.document.pdfDiscovery!;
  assert.ok(found);
  assert.equal(f.pdf.calls.search, 1, 'exactly one extra search');
  assert.deepEqual(f.pdf.calls.queries, [`báo cáo thị trường ${KEYWORD} filetype:pdf -site:studocu.vn -site:scribd.com`]);
  assert.equal(found.search.status, 'CALLED');
  assert.deepEqual(found.files.map(file => [file.origin, file.url, file.status]), [['RUN_ROWS', RUN_PDF, 'DOWNLOADED'], ['PDF_SEARCH', SEARCH_PDF, 'DOWNLOADED']]);
  assert.equal(found.reason, null);
  assert.equal(f.pdf.calls.download, 2, 'at most 2 downloads, never the blocked or non-admitted rows');
  assert.equal(f.pageIndex.calls.titleReads, 0, 'safe search titles take priority over embedded metadata');
  for (const headers of f.pdf.calls.headers) assert.equal(headers.has('cookie') || headers.has('authorization'), false);
  const searchCapture = f.captures.find(c => c.ordinal === found.search.captureIndex)!;
  assert.deepEqual([searchCapture.provider, searchCapture.operation], ['serpapi', 'serpapi.google.search']);
  const fileCaptures = f.captures.filter(c => c.provider === 'pdf-discovery');
  assert.deepEqual(fileCaptures.map(c => c.operation), ['pdfdiscovery.download', 'pdfdiscovery.download']);
  assert.deepEqual(found.files.map(file => file.captureIndex), fileCaptures.map(c => c.ordinal));
  for (const capture of fileCaptures) {
    const envelope = JSON.parse((await f.artifacts.read(capture.sha)).toString());
    const bytes = Buffer.from(envelope.responseBytesBase64, 'base64');
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(envelope.responseSha256, sha);
    assert.equal(found.files.find(file => file.captureIndex === capture.ordinal)?.sourceSha256, sha);
  }
  assert.deepEqual(f.usage.filter(u => u[0] >= 14), [[14, 'serpapi', 1], [15, 'pdf-discovery', 2]]);
  // Retention: both files reach the run-PDF table through the existing collection-capture path and were read once each.
  assert.deepEqual(f.runPdfs.map(p => p.sha).sort(), found.files.map(file => file.sourceSha256).sort());
  assert.ok(f.runPdfs.every(p => /^source-\d+\.pdf$/u.test(p.name)));
  assert.deepEqual(found.files.map(file => f.runPdfs.find(p => p.sha === file.sourceSha256)?.title), [`Báo cáo ngành ${KEYWORD} 2`, `Báo cáo ngành ${KEYWORD} 1`],
    'each file keeps the title of the search row it came from, for the citation label');
  assert.equal(f.pageIndex.calls.upload, 2);
  const html = await f.html();
  const block = blockOf(html);
  assert.ok(block.includes('Thị trường tăng đều theo quý'), 'the M09 excerpt block draws from the auto PDFs');
  assert.doesNotMatch(block, /bao-cao\.example|thong-ke\.example|source-\d+\.pdf/u);
  assert.deepEqual(providerNameViolations(html), []);
  const rows = ((await f.semantic()).sourceEvidence as Appendix).sourceAppendix.rows.filter(r => r.registryId === 'S25');
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.equal(r.binding.kind, 'capture', 'auto PDFs cite S25 by capture');
    assert.ok(fileCaptures.some(c => c.sha === r.binding.ref));
  }
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  const failed = (text: string) => auditMarket14(text).filter(item => item.kind === 'machine' && !item.ok);
  assert.deepEqual(failed(html), failed(html.replace(block, '')), 'the block adds no 14-rule machine failure');
  assert.equal(html.includes(PDF_DISCOVERY_SOURCE_LABEL), false, 'excerpts suppress the missing-source row');
  const input = f.reportInputs.get('MARKET')!;
  const collection = { ...input.collection!, pdfDiscovery: { ...input.collection!.pdfDiscovery!, files: [], reason: 'NO_CANDIDATE' as const } };
  assert.deepEqual(buildResearchAutomationReport({ ...input, collection }, 'MARKET').html,
    buildResearchAutomationReport(input, 'MARKET').html, 'with excerpts, the discovery outcome changes no HTML bytes');
  // Replay is read-only: no new search or download.
  const before = { ...f.pdf.calls };
  assert.equal(await f.html(), html);
  assert.deepEqual({ search: f.pdf.calls.search, download: f.pdf.calls.download }, { search: before.search, download: before.download });
});

test('flag on: two run-row PDFs skip the extra search', async t => {
  const f = await runToDraft(t, { lane: true, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)], searchRows: [row(1, SEARCH_PDF)] });
  const found = f.document.pdfDiscovery!;
  assert.deepEqual(found.search, { status: 'SKIPPED', reason: 'SEARCH_SKIPPED_ENOUGH', captureIndex: null, retrievedAt: null });
  assert.equal(f.pdf.calls.search, 0);
  assert.equal(f.usage.some(u => u[0] === 14), false);
  assert.deepEqual(found.files.map(file => [file.url, file.status]), [[RUN_PDF, 'DOWNLOADED'], [RUN_PDF_2, 'DOWNLOADED']]);
  assert.deepEqual(f.usage.filter(u => u[0] === 15), [[15, 'pdf-discovery', 2]]);
});

test('document-sharing and analytics-vendor PDFs in both search paths never download or reach the reader', async t => {
  const blocked = ['https://cdn.studocu.vn/report.pdf', 'https://scribd.com/report.pdf', 'https://metric.vn/report.pdf', 'https://www.kalodata.com/report.pdf'];
  const f = await runToDraft(t, { lane: true, organic: blocked.map((url, i) => row(i + 1, url)), searchRows: blocked.map((url, i) => row(i + 1, url)) });
  assert.equal(f.pdf.calls.search, 1, 'blocked run-row PDFs do not suppress the single extra search');
  assert.equal(f.pdf.calls.download, 0);
  assert.equal(f.runPdfs.length, 0);
  assert.equal(f.pageIndex.calls.upload, 0);
  assert.deepEqual(f.document.pdfDiscovery!.files, []);
  assert.deepEqual(f.usage.filter(u => u[0] >= 14), [[14, 'serpapi', 1]]);
  const html = await f.html();
  assert.ok(html.includes(PDF_DISCOVERY_SOURCE_LABEL));
  assert.deepEqual(providerNameViolations(html), []);
});

test('flag on, every download refused: no file and one plain missing-source row', async t => {
  // Two run-row candidates skip the extra search, so the only difference from a flag-off run is the refused downloads.
  const organic = [row(1, RUN_PDF), row(2, RUN_PDF_2)];
  const off = await runToDraft(t, { lane: false, organic });
  const refused = await runToDraft(t, { lane: true, organic, resolve: privateDns });
  const found = refused.document.pdfDiscovery!;
  assert.deepEqual(found.files.map(file => [file.url, file.status, file.reason]), [[RUN_PDF, 'FAILED', 'PRIVATE_ADDRESS'], [RUN_PDF_2, 'FAILED', 'PRIVATE_ADDRESS']]);
  assert.equal(found.reason, 'PRIVATE_ADDRESS');
  assert.equal(refused.pdf.calls.download, 0, 'a private DNS answer stops before any request');
  assert.equal(refused.runPdfs.length, 0);
  assert.equal(refused.usage.some(u => u[0] === 15), false, 'no download request, no download usage row');
  const html = await refused.html();
  assert.equal(html.includes(PDF_EXCERPT_TITLE), false);
  assertMissingPdfStatus(html, await off.html());
});

test('flag off: no call, no field, no capture, no usage row, and no S25 row', async t => {
  const f = await runToDraft(t, { lane: false, reports: ['MARKET', 'INSIGHT'], organic: [row(1, 'https://report.example/brand'), row(2, RUN_PDF)], searchRows: [row(1, SEARCH_PDF)] });
  assert.equal(JSON.stringify(f.document).includes('pdfDiscovery'), false);
  assert.deepEqual(f.pdf.calls, { search: 0, download: 0, queries: [], headers: [] });
  assert.equal(f.captures.some(c => c.provider === 'pdf-discovery'), false);
  assert.equal(f.usage.some(u => u[0] === 14 || u[0] === 15), false);
  assert.equal(f.runPdfs.length, 0);
  const html = await f.html();
  assert.equal(html.includes(PDF_EXCERPT_TITLE), false);
  assert.equal(html.includes(PDF_DISCOVERY_SOURCE_LABEL), false);
  assert.equal(((await f.semantic()).sourceEvidence as Appendix).sourceAppendix.rows.some(r => r.registryId === 'S25'), false);
  // Frozen on e009d9ee with this same synthetic fixture: stored documents and both renderers are byte-identical.
  // WEBTITLE-209 re-froze only the two HTML digests: copied web titles are now wrapped in <q data-quote>; documents, captures, usage and semantic digests are unchanged.
  const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(JSON.stringify(f.document)), 'e0c90c1116c96b18508dff74c646c3ce594a89aee6e46e1507a735357eff1018');
  assert.equal(digest(JSON.stringify(f.captures)), '6fe81a13cc6fe4a54417efde083d79eb8beb34ecdd242a868b4a35eeee14201a');
  assert.equal(digest(JSON.stringify(f.usage)), '2a267b2f584266350053a7a4d917439936a5ff8a4bdc5587ad3430180707ceaa');
  for (const [kind, htmlDigest, semanticDigest] of [
    ['MARKET', '12733eaf88146b941e32f0a49b8732ae3d8ecc7aa556b9de231a0b930f335d3a', '04d5cec28cfaf12284fb5b64055f261915fa01128c5bf690ffa75d09b51bdd8f'],
    ['INSIGHT', '94724e129362d437a4622b87d33c33e52ecf8f1c7a898c97d5dac312c8f61559', '836f890780481d66e8227069107804fea6e5ecd28f64dae345681485219855bc'],
  ] as const) {
    const report = buildResearchAutomationReport(f.reportInputs.get(kind)!, kind);
    assert.equal(digest(report.html), htmlDigest, kind);
    assert.equal(digest(JSON.stringify(report.semantic)), semanticDigest, kind);
  }
  // This step document has no pdfDiscovery field (like every document written before it existed) and the verified read above accepted it.
});


test('search with no usable PDF shows the missing-source row in Market; lane off and Insight stay unchanged', async t => {
  for (const failSearch of [false, true]) {
    const options = { organic: [row(1, 'https://report.example/brand')], reports: ['MARKET', 'INSIGHT'] as ('MARKET' | 'INSIGHT')[] };
    const off = await runToDraft(t, { ...options, lane: false });
    const on = await runToDraft(t, { ...options, lane: true, failSearch, searchRows: [
      row(1, 'https://studocu.vn/document/bai-luan'), row(2, 'https://scribd.com/document/luan-van'),
      row(3, 'https://researchgate.net/publication/bao-cao'), row(4, 'https://phuong.example/tin-tuc.html'),
      row(5, 'https://vnexpress.net/tag/binh-giu-nhiet'), row(6, 'https://metric.vn/insights/nganh-hang'),
    ] });
    assert.equal(on.pdf.calls.search, 1);
    assert.equal(on.pdf.calls.download, 0);
    assert.equal(on.runPdfs.length, 0);
    assert.equal(on.document.pdfDiscovery?.reason, failSearch ? 'SEARCH_FAILED' : 'NO_CANDIDATE');
    for (const kind of options.reports) {
      const left = buildResearchAutomationReport(off.reportInputs.get(kind)!, kind);
      const right = buildResearchAutomationReport(on.reportInputs.get(kind)!, kind);
      if (kind === 'MARKET') assertMissingPdfStatus(right.html.toString(), left.html.toString());
      else assert.deepEqual(right.html, left.html, kind);
    }
  }
});

test('a throwing download port never fails collection, report or gate', async t => {
  const off = await runToDraft(t, { lane: false, organic: [row(1, RUN_PDF)] });
  const on = await runToDraft(t, { lane: true, organic: [row(1, RUN_PDF)], throwDownload: true });
  assert.equal(on.document.pdfDiscovery?.reason, 'TRANSPORT');
  assertMissingPdfStatus(await on.html(), await off.html());
  assert.doesNotThrow(() => assertMarketBusinessGate(buildResearchAutomationReport(on.reportInputs.get('MARKET')!, 'MARKET').html.toString(), { presentation: false }));
});

test('Insight-only runs never enter the Market PDF lane', async t => {
  const f = await runToDraft(t, { lane: true, reports: ['INSIGHT'], organic: [row(1, RUN_PDF)] });
  assert.equal(f.document.pdfDiscovery, undefined);
  assert.equal(f.pdf.calls.search + f.pdf.calls.download, 0);
  assert.equal(f.usage.some(u => u[0] >= 14), false);
});

test('bridge budget skips the second full-size PDF before capture and reader retention; owner upload is preserved', async t => {
  const f = await runToDraft(t, { lane: true, large: true, ownerPdf: true, questionCap: 21, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)] });
  assert.deepEqual(f.document.pdfDiscovery!.files.map(file => [file.status, file.reason]),
    [['DOWNLOADED', null], ['FAILED', 'BRIDGE_BUDGET_LIMIT']]);
  assert.equal(f.pdf.calls.download, 2);
  assert.equal(f.captures.filter(c => c.provider === 'pdf-discovery').length, 1);
  assert.equal(f.runPdfs.length, 2, 'one owner upload plus one auto PDF');
  assert.equal(f.pageIndex.calls.upload, 2, 'the skipped PDF never reaches the reader');
  assert.ok(f.runPdfs.some(pdf => pdf.name === 'owner.pdf'));
  const rows = ((await f.semantic()).sourceEvidence as Appendix).sourceAppendix.rows.filter(r => r.registryId === 'S25');
  assert.ok(rows.some(row => row.binding.kind === 'package'), 'owner lineage is unchanged');
  assert.ok(rows.some(row => row.binding.kind === 'capture'), 'the kept automatic PDF keeps capture lineage');
  assert.equal(f.usage.find(u => u[0] === 15)?.[2], 2, 'discarded bytes still count as an attempted download');
});


test('owner uploads are asked first; automatic PDFs share only what the cap leaves', async t => {
  const f = await runToDraft(t, { lane: true, ownerPdf: true, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)] });
  assert.equal(f.runPdfs.length, 2, 'only one automatic PDF can still get a question');
  assert.equal(f.pdf.calls.download, 1, 'the other automatic PDF is never downloaded');
  assert.equal(f.pageIndex.calls.upload, 2, 'only the owner upload and the usable automatic PDF are indexed');
  assert.equal(f.captures.filter(c => c.provider === 'pdf-discovery').length, 1);
  const ownerSha = createHash('sha256').update(pdfBytes('owner')).digest('hex');
  const origins = f.db.prepare('SELECT source_sha256 sha, origin FROM analysis_pageindex_run_pdfs WHERE run_id=?').all(runId) as { sha: string; origin: string }[];
  assert.deepEqual(origins.map(o => [o.sha === ownerSha, o.origin]).sort(), [[false, 'CAPTURE'], [true, 'UPLOAD']]);
  const asked = f.db.prepare('SELECT source_sha256 sha, count(*) n FROM analysis_pageindex_questions WHERE run_id=? GROUP BY source_sha256').all(runId) as { sha: string; n: number | bigint }[];
  assert.equal(f.pageIndex.calls.question, 10);
  assert.equal(Number(asked.find(a => a.sha === ownerSha)?.n), 7, 'the upload gets all seven Market sections whatever its sha order');
  assert.equal(asked.filter(a => a.sha !== ownerSha).reduce((sum, a) => sum + Number(a.n), 0), 3);
});

test('existing generic captures consume question slots before discovery searches or downloads', async t => {
  for (const [ownerPdf, questionCap, downloads] of [[false, 10, 1], [true, 10, 0]] as const) {
    const f = await runToDraft(t, { lane: true, ownerPdf, questionCap, genericPdfLabel: 'generic',
      organic: [row(1, RUN_PDF)], searchRows: [row(1, SEARCH_PDF)] });
    assert.equal(f.pdf.calls.search, 0, 'existing admitted candidates fill the remaining slots, or none remain');
    assert.equal(f.pdf.calls.download, downloads);
    assert.equal(f.runPdfs.length, 2);
    assert.equal(f.pageIndex.calls.upload, 2);
    assert.equal(f.pageIndex.calls.question, 10);
    assert.equal(f.document.pdfDiscovery?.search.reason, downloads ? 'SEARCH_SKIPPED_ENOUGH' : 'SKIPPED_NO_QUESTION_BUDGET');
    const asked = f.db.prepare('SELECT DISTINCT source_sha256 sha FROM analysis_pageindex_questions WHERE run_id=?').all(runId) as { sha: string }[];
    assert.ok(f.runPdfs.every(pdf => asked.some(question => question.sha === pdf.sha)));
  }
});

test('generic capture intake shares the limits only with discovery on; uncountable PDFs fail closed', async t => {
  for (const uncountable of [false, true]) {
    const options = { genericPdfLabel: 'generic', organic: [], longLabel: 'generic', longPages: 61,
      ...(uncountable ? { uncountableLabel: 'generic' } : {}) };
    const on = await runToDraft(t, { ...options, lane: true });
    assert.equal(on.runPdfs.length, 0);
    assert.equal(on.pageIndex.calls.upload, 0);
    assert.ok(on.captures.some(c => c.provider === 'kalodata'), 'the original generic exchange remains evidence');
    const off = await runToDraft(t, { ...options, lane: false });
    assert.equal(off.runPdfs.length, 1, 'flag off retains the generic PDF just as the base does');
    assert.equal(off.pageIndex.calls.upload, uncountable ? 0 : 1);
    assert.equal(off.document.pdfDiscovery, undefined);
  }
  const full = await runToDraft(t, { lane: true, ownerPdf: true, questionCap: 7, genericPdfLabel: 'generic', organic: [] });
  assert.deepEqual(full.runPdfs.map(pdf => pdf.name), ['owner.pdf']);
  assert.equal(full.pageIndex.calls.upload, 1);
});

test('an owner re-upload of captured bytes changes origin to UPLOAD without another indexing upload', async t => {
  const f = await runToDraft(t, { lane: true, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)] });
  const bytes = pdfBytes(new URL(RUN_PDF).pathname);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const origin = () => (f.db.prepare('SELECT origin FROM analysis_pageindex_run_pdfs WHERE run_id=? AND source_sha256=?').get(runId, sha) as { origin: string }).origin;
  assert.equal(origin(), 'CAPTURE');
  const uploads = f.pageIndex.calls.upload;
  await f.service.attachRunPdf(workspaceId, runId, 'owner.pdf', bytes);
  assert.equal(origin(), 'UPLOAD');
  assert.equal(f.pageIndex.calls.upload, uploads);
});

test('owner uploads already filling the question cap: no extra search, no download, nothing indexed', async t => {
  // One upload × seven Market sections ≥ cap 7. One run-row candidate alone would otherwise trigger the extra search.
  const f = await runToDraft(t, { lane: true, ownerPdf: true, questionCap: 7, organic: [row(1, RUN_PDF)], searchRows: [row(1, SEARCH_PDF)] });
  const found = f.document.pdfDiscovery!;
  assert.deepEqual(found.search, { status: 'SKIPPED', reason: 'SKIPPED_NO_QUESTION_BUDGET', captureIndex: null, retrievedAt: null });
  assert.deepEqual(found.files, []);
  assert.equal(found.reason, 'SKIPPED_NO_QUESTION_BUDGET');
  assert.deepEqual({ search: f.pdf.calls.search, download: f.pdf.calls.download }, { search: 0, download: 0 });
  assert.equal(f.usage.some(u => u[0] === 14 || u[0] === 15), false);
  assert.deepEqual(f.runPdfs.map(p => p.name), ['owner.pdf']);
  assert.equal(f.pageIndex.calls.upload, 1);
  assert.equal(f.pageIndex.calls.question, 7);
});

test('a captured PDF over the page cap is neither stored, retained nor indexed; the next one is kept', async t => {
  const label = new URL(RUN_PDF).pathname;
  const f = await runToDraft(t, { lane: true, longLabel: label, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)] });
  const found = f.document.pdfDiscovery!;
  assert.deepEqual(found.files.map(file => [file.url, file.status, file.reason]), [[RUN_PDF, 'FAILED', 'PAGE_LIMIT'], [RUN_PDF_2, 'DOWNLOADED', null]]);
  assert.equal(found.reason, null);
  assert.equal(f.pdf.calls.download, 2);
  assert.equal(f.usage.find(u => u[0] === 15)?.[2], 2, 'the refused file still counts as an attempted download');
  assert.equal(f.captures.filter(c => c.provider === 'pdf-discovery').length, 1, 'no capture for the over-cap file');
  const longSha = createHash('sha256').update(pdfBytes(label)).digest('hex');
  assert.equal(f.runPdfs.length, 1);
  assert.equal(f.runPdfs.some(p => p.sha === longSha), false);
  assert.equal(f.pageIndex.calls.upload, 1, 'the over-cap file never reaches the reader');
  const rows = ((await f.semantic()).sourceEvidence as Appendix).sourceAppendix.rows.filter(r => r.registryId === 'S25');
  assert.ok(rows.every(r => r.binding.kind === 'capture'));
  // A raised cap (option, as the env would) keeps the same 61-page file.
  const raised = await runToDraft(t, { lane: true, longLabel: label, maxPages: 61, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)] });
  assert.deepEqual(raised.document.pdfDiscovery!.files.map(file => file.status), ['DOWNLOADED', 'DOWNLOADED']);
});

test('document reader off: automatic PDFs could add no excerpt, so no extra search and no download', async t => {
  const f = await runToDraft(t, { lane: true, readerOff: true, organic: [row(1, RUN_PDF)], searchRows: [row(1, SEARCH_PDF)] });
  const found = f.document.pdfDiscovery!;
  assert.deepEqual(found.search, { status: 'SKIPPED', reason: 'SKIPPED_READER_OFF', captureIndex: null, retrievedAt: null });
  assert.deepEqual(found.files, []);
  assert.equal(found.reason, 'SKIPPED_READER_OFF');
  assert.deepEqual({ search: f.pdf.calls.search, download: f.pdf.calls.download }, { search: 0, download: 0 });
  assert.equal(f.usage.some(u => u[0] === 14 || u[0] === 15), false);
  assert.deepEqual(f.runPdfs, []);
  assert.equal(f.captures.filter(c => c.provider === 'pdf-discovery').length, 0);
  assert.equal(f.pageIndex.calls.upload, 0);
});
test('owner uploads are never page-capped', async t => {
  const f = await runToDraft(t, { lane: false, ownerPdf: true, longLabel: 'owner', longPages: 500, organic: [row(1, 'https://example.test/brand')] });
  assert.deepEqual(f.runPdfs.map(p => p.name), ['owner.pdf']);
  assert.equal(f.pageIndex.calls.upload, 1);
});

test('unadmitted run rows neither suppress the extra search nor become PDF candidates', async t => {
  const f = await runToDraft(t, { lane: true, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)], noAdmission: true });
  assert.equal(f.document.pdfDiscovery?.search.reason, 'SEARCH_NO_ADMISSION');
  assert.equal(f.pdf.calls.search + f.pdf.calls.download, 0);
  assert.equal(f.runPdfs.length, 0);
});


test('bytes already uploaded by the owner are skipped without changing owner-upload package lineage', async t => {
  const label = new URL(RUN_PDF).pathname;
  const f = await runToDraft(t, { lane: true, ownerPdf: true, ownerPdfLabel: label, organic: [row(1, RUN_PDF), row(2, RUN_PDF_2)] });
  assert.deepEqual(f.document.pdfDiscovery!.files.map(file => [file.status, file.reason]),
    [['FAILED', 'DUPLICATE'], ['DOWNLOADED', null]]);
  assert.equal(f.runPdfs.length, 2);
  assert.equal(f.pageIndex.calls.upload, 2);
  const sha = createHash('sha256').update(pdfBytes(label)).digest('hex');
  const rows = ((await f.semantic()).sourceEvidence as Appendix).sourceAppendix.rows.filter(r => r.registryId === 'S25');
  assert.ok(rows.some(row => row.binding.kind === 'package' && row.binding.ref === sha));
  assert.equal(f.captures.filter(c => c.provider === 'pdf-discovery').length, 1);
});


test('a pre-send search exception records zero requests and does not fail the run', async t => {
  const f = await runToDraft(t, { lane: true, throwSearch: true, organic: [row(1, RUN_PDF)] });
  assert.equal(f.pdf.calls.search, 0);
  assert.deepEqual(f.usage.find(row => row[0] === 14), [14, 'serpapi', 0]);
  assert.equal(f.document.pdfDiscovery!.search.reason, 'SEARCH_FAILED');
  assert.equal(f.runPdfs.length, 1);
});


test('optional capture and run-PDF storage failures show the missing-source row and retain technical reasons', async t => {
  const organic = [row(1, RUN_PDF), row(2, RUN_PDF_2)];
  const off = await runToDraft(t, { lane: false, organic });
  for (const options of [{ failCaptureWrite: true }, { failPdfRetention: true }]) {
    const f = await runToDraft(t, { lane: true, organic, ...options });
    assert.equal(f.runPdfs.length, 0);
    assert.ok(f.document.pdfDiscovery!.files.every(file => file.status === 'FAILED' && file.reason ===
      ('failCaptureWrite' in options ? 'TRANSPORT' : 'DOCUMENT_INVALID')));
    assertMissingPdfStatus(await f.html(), await off.html());
    assert.equal(f.usage.find(row => row[0] === 15)?.[2], 2);
  }
});

test('both search paths vet original titles before bounded projections can hide a file extension', async t => {
  const unsafe = `Báo cáo ngành ${KEYWORD}${' '.repeat(600)}.pdf`;
  const f = await runToDraft(t, { lane: true, organic: [row(1, RUN_PDF, unsafe)], searchRows: [row(1, SEARCH_PDF, unsafe)] });
  assert.equal(f.runPdfs.length, 2);
  assert.deepEqual(f.runPdfs.map(pdf => pdf.title), [null, null]);
  const block = blockOf(await f.html());
  assert.match(block, /Tài liệu PDF số 1, trang 1/u);
  assert.match(block, /Tài liệu PDF số 2, trang 1/u);
  assert.doesNotMatch(block, /Báo cáo ngành|source-\d+\.pdf/u);
});


test('SRC3 S25 SEARCH_FAILED and NOT_ADMITTED retain reasons without relaxing admission', async t => {
  const failed = await runToDraft(t, { lane: true, throwSearch: true, organic: [row(1, 'https://example.test/brand')] });
  assert.equal(failed.document.pdfDiscovery?.search.reason, 'SEARCH_FAILED');
  assert.equal(failed.runPdfs.length, 0);
  const refused = await runToDraft(t, { lane: true, organic: [row(1, 'https://example.test/brand')], searchRows: [{ ...row(1, 'https://irrelevant.example.test/cooking.pdf', 'Tài liệu nấu ăn'), snippet: 'Công thức nấu ăn tổng hợp' }] });
  assert.equal(refused.document.pdfDiscovery?.search.reason, 'NOT_ADMITTED');
  assert.equal(refused.pdf.calls.download, 0, 'an irrelevant discovery result cannot be retained');
  assert.equal(refused.runPdfs.length, 0);
});


test('SRC3 S25 Poll cap exceeded renders found-but-unread state from stored service outcomes', async t => {
  const late = await runToDraft(t, { organic: [row(1, RUN_PDF)], lane: true, notReady: true });
  const absent = await runToDraft(t, { organic: [], lane: true });
  assert.ok(late.runPdfs.length > 0);
  assert.equal(late.pageIndex.calls.question, 0);
  const html = await late.html();
  assert.ok(html.includes('Đã tìm thấy tài liệu nhưng chưa đọc kịp trong lượt này'), 'rendered timeout state must come from persisted service outcomes');
  const readings = await late.service.readPageIndexQuotes(workspaceId, runId);
  assert.ok(readings?.documents?.length);
  assert.ok(readings.documents.every(document => document.state === 'NOT_READY_AFTER_WAIT'));
  assert.ok(!html.includes(PDF_DISCOVERY_MISSING), 'retained files cannot be rendered as undiscovered');
  assert.ok((await absent.html()).includes(PDF_DISCOVERY_MISSING), 'a run with no retained file keeps its missing-document state');
  assert.ok(!(await absent.html()).includes('Đã tìm thấy tài liệu nhưng chưa đọc kịp'));
});

test('SRC3 S25 Timeout preserves found-but-unread wording in both reader branches; no retained PDFs preserves missing-document wording without extra calls', async t => {
  const late = await runToDraft(t, { organic: [row(1, RUN_PDF)], lane: true, notReady: true });
  const absent = await runToDraft(t, { organic: [], lane: true });
  assert.ok(late.runPdfs.length > 0);
  assert.equal(absent.runPdfs.length, 0);
  assert.equal(late.pageIndex.calls.question, 0);
  assert.ok((await late.service.readPageIndexQuotes(workspaceId, runId))?.documents?.every(document => document.state === 'NOT_READY_AFTER_WAIT'));
  for (const f of [late, absent]) {
    const calls = { pdf: { ...f.pdf.calls, queries: [...f.pdf.calls.queries], headers: [...f.pdf.calls.headers] }, pageIndex: { ...f.pageIndex.calls }, sources: { ...f.sourceCalls } };
    for (const kind of ['WORKBOOK', 'CAPTURE'] as const) {
      const html = await buildPdfReader(t, f, kind);
      const expected = f === late ? PDF_DISCOVERY_NOT_READ_IN_TIME : PDF_DISCOVERY_MISSING;
      const forbidden = f === late ? PDF_DISCOVERY_MISSING : PDF_DISCOVERY_NOT_READ_IN_TIME;
      const dom = new JSDOM(html);
      try {
        const rows = [...dom.window.document.querySelectorAll('tr')].filter(row => row.firstElementChild?.textContent === PDF_DISCOVERY_SOURCE_LABEL);
        assert.equal(rows.length, 1, `${kind} has one visible PDF source row`);
        assert.equal(rows[0]!.lastElementChild?.textContent, expected, kind);
        assert.equal(rows[0]!.closest('details'), null, `${kind} PDF status is visible`);
      } finally { dom.window.close(); }
      assert.ok(!html.includes(forbidden), `${kind} must not substitute the opposite PDF state`);
      assert.deepEqual(providerNameViolations(html), []);
      assert.deepEqual({ pdf: f.pdf.calls, pageIndex: f.pageIndex.calls, sources: f.sourceCalls }, calls, `${kind} reader builds and exact retries are offline`);
    }
  }
});

test('SRC3 S25 Report rebuilds reuse saved reading outcomes; legacy and successfully read documents retain existing behavior', async t => {
  for (const state of ['TIMEOUT', 'READ', 'LEGACY'] as const) {
    const f = await runToDraft(t, { organic: [row(1, RUN_PDF)], lane: true, reports: ['MARKET', 'INSIGHT'],
      ...(state === 'TIMEOUT' ? { notReady: true } : state === 'LEGACY' ? { readerOff: true, ownerPdf: true } : {}) });
    assert.ok(f.runPdfs.length > 0);
    assert.equal(f.document.pdfDiscovery?.readState, undefined, 'the stored COLLECTION has no report-time overlay');
    const outcomes = await f.service.readPageIndexQuotes(workspaceId, runId);
    if (state === 'LEGACY') assert.equal(outcomes, null, 'older runs have no saved reading outcomes');
    else assert.ok(outcomes?.documents?.every(document => document.state === (state === 'TIMEOUT' ? 'NOT_READY_AFTER_WAIT' : 'READ')));
    const calls = { pdf: { ...f.pdf.calls, queries: [...f.pdf.calls.queries], headers: [...f.pdf.calls.headers] }, pageIndex: { ...f.pageIndex.calls }, sources: { ...f.sourceCalls } };
    const previousPairId = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId;
    await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1',
      requestKey: '99999999-9999-4999-8999-999999999999', previousPairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
    assert.equal(await f.service.processNext(), true);
    const revised = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
    assert.notEqual(revised.pairId, previousPairId);
    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const input = f.reportInputs.get(kind)!;
      assert.equal(input.collection?.pdfDiscovery?.readState, state === 'TIMEOUT' ? 'NOT_READ_IN_TIME' : undefined, `${kind} rebuild context`);
      const saved = await f.service.readReport(workspaceId, runId, kind, false, revised.pairId);
      const html = saved.bytes.toString();
      if (state === 'TIMEOUT') {
        if (kind === 'MARKET') {
          assert.ok(html.includes(PDF_DISCOVERY_NOT_READ_IN_TIME), kind);
          assert.ok(!html.includes(PDF_DISCOVERY_MISSING), `${kind} retained PDFs cannot be reported as missing`);
        }
      } else {
        assert.ok(!html.includes(PDF_DISCOVERY_NOT_READ_IN_TIME), `${kind} cannot acquire a timeout`);
        if (kind === 'MARKET') {
          assert.equal(html.includes(PDF_DISCOVERY_MISSING), state === 'LEGACY');
          assert.equal(html.includes(`<h3>${PDF_EXCERPT_TITLE}`), state === 'READ');
        }
      }
      assert.deepEqual((await f.service.readReport(workspaceId, runId, kind, false, revised.pairId)).bytes, saved.bytes);
    }
    assert.deepEqual(await f.service.readPageIndexQuotes(workspaceId, runId), outcomes, 'revisions cannot replace the saved outcomes');
    assert.deepEqual({ pdf: f.pdf.calls, pageIndex: f.pageIndex.calls, sources: f.sourceCalls }, calls, 'revisions and verified reads cannot poll, upload, download or ask again');
  }
});

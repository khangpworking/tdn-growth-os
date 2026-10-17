import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { PDF_EXCERPT_TITLE } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { createPdfDiscoverySource, type PdfResolver } from '../../src/modules/analysis/research-automation/pdf-discovery-lane.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';

const KEYWORD = 'bình giữ nhiệt';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const RUN_PDF = 'https://bao-cao.example/nganh/binh-giu-nhiet-2026.pdf';
const RUN_PDF_2 = 'https://bao-cao.example/nganh/binh-giu-nhiet-2025.pdf';
const SEARCH_PDF = 'https://thong-ke.example/bao-cao/binh-giu-nhiet.pdf';
const pdfBytes = (label: string) => Buffer.from(`%PDF-1.4\n% synthetic ${label}\n%%EOF\n`, 'latin1');
const publicDns: PdfResolver = async () => ['93.184.216.34'];
const privateDns: PdfResolver = async () => ['10.0.0.8'];
const row = (position: number, link: string, title = `Báo cáo ngành ${KEYWORD} ${position}`) => ({ position, title, link, snippet: `Số liệu ${KEYWORD} theo năm` });
const blockOf = (html: string): string => { const start = html.indexOf(`<h3>${PDF_EXCERPT_TITLE}`); return start < 0 ? '' : html.slice(start, html.indexOf('</ul>', start) + 5); };

/** One transport for the extra search and the downloads; counts each kind. */
function pdfTransport(searchRows: unknown[]) {
  const calls = { search: 0, download: 0, queries: [] as string[], headers: [] as Headers[] };
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === 'serpapi.com') {
        calls.search += 1; calls.queries.push(url.searchParams.get('q') ?? '');
        return new Response(JSON.stringify({ search_parameters: { q: url.searchParams.get('q') }, organic_results: searchRows }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      calls.download += 1; calls.headers.push(new Headers(init?.headers));
      return new Response(pdfBytes(url.pathname), { status: 200, headers: { 'content-type': 'application/pdf' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return { transport, calls };
}

/** PageIndex fake that keeps each uploaded file name, so citations name the retained `source-N.pdf`. */
function pageIndexFake() {
  const docs = new Map<string, string>();
  const calls = { upload: 0, question: 0 };
  const fetchFake: typeof fetch = async (input, init) => {
    const pathname = new URL(String(input)).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    const docOf = (id: string) => ({ id, name: docs.get(id)!, pageNum: 1, status: 'completed' });
    if (pathname === '/doc/upload') { calls.upload += 1; const id = `pi-${docs.size + 1}`; docs.set(id, String(body.file_name)); return Response.json({ ...docOf(id), status: 'processing' }); }
    if (pathname === '/doc/list') return Response.json({ documents: [...docs.keys()].map(docOf) });
    const match = /^\/doc\/([^/]+)\/(metadata|block\/p1_text_1\/)$/u.exec(pathname);
    if (match?.[2] === 'metadata') return Response.json(docOf(match[1]!));
    if (match) return Response.json({ doc_id: match[1], page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20], text: 'Thị trường tăng đều theo quý' });
    if (pathname === '/chat/completions') {
      calls.question += 1;
      const name = docs.get(String(body.doc_id))!;
      return Response.json({ choices: [{ message: { content: `x <doc=${name};page=1;block=p1_text_1>` } }], citations: [{ document: name, page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20] }] });
    }
    throw new Error(`Unexpected connector request ${pathname}`);
  };
  return { fetchFake, calls };
}

interface RunOptions { readonly organic: unknown[]; readonly searchRows?: unknown[]; readonly resolve?: PdfResolver; readonly lane: boolean }
async function runToDraft(t: TestContext, options: RunOptions) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pdf-discovery-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'pdf-discovery', title: 'Synthetic report PDF run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const pdf = pdfTransport(options.searchRows ?? []);
  const pageIndex = pageIndexFake();
  // The keyword draft needs the sales capture to carry the product name (same wrapper as the P9 source test).
  const product = syntheticProductSource();
  const sales: AutomationSourcePort = { ...product, quickSearch: async (input, opts) => {
    const result = await product.quickSearch(input, opts);
    const responseBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Bình giữ nhiệt từ nguồn bán hàng"}]}');
    return { ...result, result: { ...result.result, captures: result.result.captures.map(c => ({ ...c, responseBytes,
      responseSha256: createHash('sha256').update(responseBytes).digest('hex'), responseByteLength: responseBytes.length })) } };
  }, collect: async (input, opts) => { const result = await product.collect(input, opts); return { ...result, result: { ...result.result, captures: [] } }; } };
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => runId, now,
    renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: sales, webSource: syntheticWebSource(() => {}, options.organic),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => ({ keywords: [KEYWORD], exclusions: [] }) } },
    pageIndex: { enabled: true, apiKey: 'synthetic-pdf-key', fetch: pageIndex.fetchFake, startingCreditMicroDollars: 10_000_000, maxQuestionsPerRun: 10,
      extractPdf: async () => [{ page: 1, text: 'Thị trường tăng đều theo quý' }] },
    ...(options.lane ? { pdfDiscoverySource: createPdfDiscoverySource(SYNTHETIC_SERP_KEY, pdf.transport, options.resolve ?? publicDns) } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: KEYWORD, requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY', 'a report PDF never fails the run');
  const step = db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { sha: string };
  const document = JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider, request_count n FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(value => { const r = value as { ordinal: bigint | number; provider: string; n: bigint | number }; return [Number(r.ordinal), r.provider, Number(r.n)] as const; });
  const captures = db.prepare(`SELECT ordinal, provider, operation, artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(value => { const r = value as { ordinal: bigint | number; provider: string; operation: string; sha: string }; return { ordinal: Number(r.ordinal), provider: r.provider, operation: r.operation, sha: r.sha }; });
  const runPdfs = db.prepare('SELECT source_sha256 sha, file_name name FROM analysis_pageindex_run_pdfs WHERE run_id=? ORDER BY file_name').all(runId) as { sha: string; name: string }[];
  const html = async (pairId?: string) => (await service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8');
  const semantic = async (): Promise<Record<string, unknown>> => {
    const out = db.prepare('SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?').get(runId, 'MARKET') as { sha: string };
    return JSON.parse((await artifacts.read(out.sha)).toString('utf8')) as Record<string, unknown>;
  };
  return { db, artifacts, service, document, usage, captures, runPdfs, html, semantic, pdf, pageIndex };
}

type Appendix = { sourceAppendix: { rows: { registryId: string; binding: { kind: string; ref: string } }[] } };

test('flag on: one run-row PDF plus one admitted search PDF are downloaded, retained, read, and cited by capture', async t => {
  const f = await runToDraft(t, { lane: true, organic: [row(1, 'https://example.test/brand'), row(2, RUN_PDF)],
    searchRows: [row(1, SEARCH_PDF), row(2, 'https://shopee.vn/bao-cao.pdf'), row(3, 'https://khac.example/khong-lien-quan.pdf', 'Tài liệu nấu ăn')] });
  const found = f.document.pdfDiscovery!;
  assert.ok(found);
  assert.equal(f.pdf.calls.search, 1, 'exactly one extra search');
  assert.deepEqual(f.pdf.calls.queries, [`${KEYWORD} báo cáo filetype:pdf`]);
  assert.equal(found.search.status, 'CALLED');
  assert.deepEqual(found.files.map(file => [file.origin, file.url, file.status]), [['RUN_ROWS', RUN_PDF, 'DOWNLOADED'], ['PDF_SEARCH', SEARCH_PDF, 'DOWNLOADED']]);
  assert.equal(found.reason, null);
  assert.equal(f.pdf.calls.download, 2, 'at most 2 downloads, never the blocked or non-admitted rows');
  for (const headers of f.pdf.calls.headers) assert.equal(headers.has('cookie') || headers.has('authorization'), false);
  const searchCapture = f.captures.find(c => c.ordinal === found.search.captureIndex)!;
  assert.deepEqual([searchCapture.provider, searchCapture.operation], ['serpapi', 'serpapi.google.search']);
  const fileCaptures = f.captures.filter(c => c.provider === 'pdf-discovery');
  assert.deepEqual(fileCaptures.map(c => c.operation), ['pdfdiscovery.download', 'pdfdiscovery.download']);
  assert.deepEqual(found.files.map(file => file.captureIndex), fileCaptures.map(c => c.ordinal));
  assert.deepEqual(f.usage.filter(u => u[0] >= 14), [[14, 'serpapi', 1], [15, 'pdf-discovery', 2]]);
  // Retention: both files reach the run-PDF table through the existing collection-capture path and were read once each.
  assert.deepEqual(f.runPdfs.map(p => p.sha).sort(), found.files.map(file => file.sourceSha256).sort());
  assert.ok(f.runPdfs.every(p => /^source-\d+\.pdf$/u.test(p.name)));
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

test('flag on, every download refused: reason codes only, no file, and the report bytes match a flag-off run', async t => {
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
  assert.equal(html, await off.html(), 'a failed lane never changes the rendered report');
});

test('flag off: no call, no field, no capture, no usage row, and no S25 row', async t => {
  const f = await runToDraft(t, { lane: false, organic: [row(1, 'https://example.test/brand'), row(2, RUN_PDF)], searchRows: [row(1, SEARCH_PDF)] });
  assert.equal(JSON.stringify(f.document).includes('pdfDiscovery'), false);
  assert.deepEqual(f.pdf.calls, { search: 0, download: 0, queries: [], headers: [] });
  assert.equal(f.captures.some(c => c.provider === 'pdf-discovery'), false);
  assert.equal(f.usage.some(u => u[0] === 14 || u[0] === 15), false);
  assert.equal(f.runPdfs.length, 0);
  const html = await f.html();
  assert.equal(html.includes(PDF_EXCERPT_TITLE), false);
  assert.equal(((await f.semantic()).sourceEvidence as Appendix).sourceAppendix.rows.some(r => r.registryId === 'S25'), false);
  // This step document has no pdfDiscovery field (like every document written before it existed) and the verified read above accepted it.
});

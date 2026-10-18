import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { PDF_EXCERPT_TITLE, PDF_EXCERPT_MAX_PER_DOCUMENT } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const PDF_BYTES = Buffer.from('%PDF-1.4\n% synthetic fixture, the local text reader is fake in this test\n%%EOF\n');
const providerWords = /PageIndex|Google|Kalodata|SerpApi|Apify|TradeInt|Dami|pi-fixture/iu;
const withoutDataUris = (html: string): string => html.replace(/data:[^"')]*;base64,[A-Za-z0-9+/=]+/gu, '');
const blockOf = (html: string): string => html.slice(html.indexOf(`<h3>${PDF_EXCERPT_TITLE}`), html.indexOf('</ul>', html.indexOf(`<h3>${PDF_EXCERPT_TITLE}`)) + 5);

interface Calls { upload: number; question: number; other: number }
async function fixture(options: { pdf: boolean; pageIndex: boolean; pdfTitle?: string | null }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pdf-excerpt-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'pdf-excerpt', title: 'Synthetic excerpt run' });
  const calls: Calls = { upload: 0, question: 0, other: 0 };
  let titleReads = 0;
  const fakeFetch: typeof fetch = async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/doc/') { calls.upload += 1; return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'processing' }); }
    if (pathname === '/chat/completions') {
      calls.question += 1;
      return Response.json({ choices: [{ message: { content: 'x <doc=fixture.pdf;page=1;block=p1_text_1>' } }], citations: [{ document: 'fixture.pdf', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20] }] });
    }
    calls.other += 1;
    if (pathname === '/docs') return Response.json({ documents: [{ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'completed' }] });
    if (pathname.endsWith('/metadata')) return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'completed' });
    if (pathname.endsWith('/block/p1_text_1/')) return Response.json({ doc_id: 'pi-fixture', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20], text: 'Hàm lượng 120 mg' });
    throw new Error('Unexpected connector request');
  };
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => runId, now,
    renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'prompt-v1' },
    ...(options.pageIndex ? { pageIndex: { enabled: true, apiKey: 'synthetic-pdf-key', fetch: fakeFetch, startingCreditMicroDollars: 10_000_000, maxQuestionsPerRun: 10,
      extractPdf: async () => [{ page: 1, text: 'Hàm lượng 120 mg' }], readPdfTitle: async () => { titleReads += 1; return options.pdfTitle ?? null; } } } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY', keyword: 'bình giữ nhiệt',
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  if (options.pdf) await service.attachRunPdf(workspaceId, runId, 'fixture.pdf', PDF_BYTES);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision,
    definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let index = 0; index < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; index += 1) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const html = async (pairId?: string) => (await service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8');
  const semantic = async (): Promise<Record<string, unknown>> => {
    const row = db.prepare('SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?').get(runId, 'MARKET') as { sha: string };
    return JSON.parse((await artifacts.read(row.sha)).toString('utf8')) as Record<string, unknown>;
  };
  return { root, db, service, calls, html, semantic, titleReads: () => titleReads };
}

test('a run with a verified PDF draws a capped excerpt block that verifies, registers S25 once and never re-asks the PDF client', async () => {
  const f = await fixture({ pdf: true, pageIndex: true });
  try {
    assert.equal(f.calls.upload, 1);
    const initialCalls = { ...f.calls };
    assert.ok(initialCalls.question >= PDF_EXCERPT_MAX_PER_DOCUMENT + 1, 'The run stored more verified quotes than the block may show');
    const html = await f.html();
    const block = blockOf(html);
    assert.ok(block.length > 0 && html.includes(`<h3>${PDF_EXCERPT_TITLE}`));
    assert.equal((block.match(/<blockquote data-quote>/gu) ?? []).length, PDF_EXCERPT_MAX_PER_DOCUMENT);
    assert.match(block, /Hàm lượng 120 mg/u); assert.match(block, /Tài liệu PDF số 1, trang 1;/u);
    assert.doesNotMatch(block, /fixture\.pdf|tên tệp/u, 'the file name is never shown; a PDF without a title is named by its order');
    assert.match(block, /nhà xuất bản: chưa ghi; năm: chưa ghi; độ tin cậy: chưa xếp hạng độ tin cậy/u);
    assert.ok(!/hạng A|grade A|S22/u.test(block));
    assert.ok(!providerWords.test(withoutDataUris(block)), 'No provider name inside the block');
    const evidence = (await f.semantic()).sourceEvidence as { pdfExcerpts?: boolean; sourceAppendix: { rows: { registryId: string; binding: { kind: string; ref: string } }[] } };
    assert.equal(evidence.pdfExcerpts, true);
    assert.equal(evidence.sourceAppendix.rows.filter(row => row.registryId === 'S25').length, 1, 'One S25 row for the one document');
    assert.equal(evidence.sourceAppendix.rows.filter(row => row.registryId === 'S22').length, 0);
    assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
    // The per-section appendix is not the 14-rule reader report; the block must add no machine failure that the same report lacks without it.
    const failed = (text: string) => auditMarket14(text).filter(item => item.kind === 'machine' && !item.ok);
    assert.deepEqual(failed(html), failed(html.replace(block, '')));
    // Reading, a second PDF attach of the same bytes and a revision are read-only for the PDF client.
    await f.html(); await f.service.attachRunPdf(workspaceId, runId, 'fixture.pdf', PDF_BYTES);
    const previousPairId = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId;
    await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: '66666666-6666-4666-8666-666666666666', previousPairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
    await f.service.processNext();
    const revised = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
    assert.notEqual(revised.pairId, previousPairId);
    const revisedHtml = await f.html(revised.pairId);
    assert.equal(blockOf(revisedHtml), block, 'The revision shows the same stored excerpts');
    assert.deepEqual(f.calls, initialCalls, 'No upload, question or other PDF client call after the initial build');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});

test('a PDF whose own metadata holds a plain Vietnamese title is cited by that title and page, read once, never by its file name', async () => {
  const f = await fixture({ pdf: true, pageIndex: true, pdfTitle: '  BÁO CÁO thị trường bình giữ nhiệt năm 2025 ' });
  const g = await fixture({ pdf: true, pageIndex: true, pdfTitle: 'fixture-report.pdf' });
  try {
    const block = blockOf(await f.html());
    assert.equal((block.match(/BÁO CÁO thị trường bình giữ nhiệt năm 2025, trang 1;/gu) ?? []).length, PDF_EXCERPT_MAX_PER_DOCUMENT);
    assert.doesNotMatch(block, /fixture|Tài liệu PDF số/u);
    assert.equal((f.db.prepare('SELECT document_title t FROM analysis_pageindex_run_pdfs WHERE run_id=?').get(runId) as { t: string }).t, 'BÁO CÁO thị trường bình giữ nhiệt năm 2025');
    assert.equal(f.titleReads(), 1, 'the stored title is not read again');
    // A metadata title that is itself a file name is not stored and the order wording is used.
    const fallback = blockOf(await g.html());
    assert.match(fallback, /Tài liệu PDF số 1, trang 1;/u);
    assert.doesNotMatch(fallback, /fixture/u);
    assert.equal((g.db.prepare('SELECT document_title t FROM analysis_pageindex_run_pdfs WHERE run_id=?').get(runId) as { t: string | null }).t, null);
  } finally { for (const x of [f, g]) { x.db.close(); await fs.rm(x.root, { recursive: true, force: true }); } }
});

test('a run without a PDF, or with the document connector off, has no block, no marker and the same wording as before', async () => {
  const bare = await fixture({ pdf: false, pageIndex: true });
  const off = await fixture({ pdf: true, pageIndex: false });
  try {
    for (const f of [bare, off]) {
      const html = await f.html();
      assert.ok(!html.includes(PDF_EXCERPT_TITLE) && !html.includes('pdf-excerpts'));
      const evidence = (await f.semantic()).sourceEvidence as { pdfExcerpts?: boolean; sourceAppendix: { rows: { registryId: string }[] } };
      assert.equal(evidence.pdfExcerpts, undefined);
      assert.equal(evidence.sourceAppendix.rows.filter(row => row.registryId === 'S25').length, 0);
      assert.equal((await f.semantic()).pdfExcerpts, undefined);
    }
    assert.equal(bare.calls.upload + bare.calls.question + off.calls.upload + off.calls.question, 0);
    assert.equal(await bare.html(), await off.html(), 'Both runs without excerpts render the identical report');
  } finally { for (const f of [bare, off]) { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); } }
});

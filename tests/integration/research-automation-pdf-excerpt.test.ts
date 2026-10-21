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
import type { PageIndexQuotesArtifact } from '../../src/modules/analysis/pageindex-questions.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const PDF_BYTES = Buffer.from('%PDF-1.4\n% synthetic fixture, the local text reader is fake in this test\n%%EOF\n');
const providerWords = /PageIndex|Google|Kalodata|SerpApi|Apify|TradeInt|Dami|pi-fixture/iu;
const withoutDataUris = (html: string): string => html.replace(/data:[^"')]*;base64,[A-Za-z0-9+/=]+/gu, '');
const blockOf = (html: string): string => html.slice(html.indexOf(`<h3>${PDF_EXCERPT_TITLE}`), html.indexOf('</ul>', html.indexOf(`<h3>${PDF_EXCERPT_TITLE}`)) + 5);

interface Calls { upload: number; question: number; other: number }
interface ReportStep { state: string; sha: string | null; startedAt: string | null; finishedAt: string | null; messageCode: string | null }
interface FixtureOptions {
  pdf: boolean; pageIndex: boolean; pdfTitle?: string | null; statuses?: string[]; maxQuestions?: number;
  queryFails?: boolean; abortDuringWait?: boolean; waitCap?: number; statusElapsed?: number; secondPdf?: boolean;
  abortDuringMetadata?: boolean; context?: test.TestContext; trackSettlement?: boolean; renderOutcome?: 'FAILED' | 'CANCELLED';
  ownerCancelDuring?: 'POLLING' | 'RENDERING';
}
async function fixture(options: FixtureOptions) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pdf-excerpt-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  options.context?.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const reportStep = () => db.prepare(`SELECT state,result_sha256 sha,started_at startedAt,finished_at finishedAt,message_code messageCode
    FROM analysis_research_automation_steps WHERE run_id=? AND step_id='REPORTS'`).get(runId) as ReportStep;
  const renderSnapshots: { step: ReportStep; quotes: PageIndexQuotesArtifact | null; quotesSha: string | null }[] = [];
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'pdf-excerpt', title: 'Synthetic excerpt run' });
  let elapsed = 0, polling = false, statusCalls = 0;
  const waits: number[] = [];
  const controller = new AbortController();
  const clock = () => new Date(now().getTime() + elapsed);
  let settled = false;
  const statuses = [...(options.statuses ?? ['completed'])];
  const calls: Calls = { upload: 0, question: 0, other: 0 };
  const cancellations: { status: string; step: ReportStep; calls: Calls }[] = [];
  const cancelAsOwner = async () => {
    for (const requestKey of ['77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888']) {
      const current = await service.getRun(workspaceId, runId);
      const receipt = await service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey, expectedRevision: current.revision });
      cancellations.push({ status: receipt.run.status, step: reportStep(), calls: { ...calls } });
    }
  };
  let titleReads = 0;
  const fakeFetch: typeof fetch = async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/doc/') { calls.upload += 1; return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'processing' }); }
    if (pathname === '/chat/completions') {
      calls.question += 1;
      if (options.queryFails) throw new Error('synthetic_query_failure');
      return Response.json({ choices: [{ message: { content: 'x <doc=fixture.pdf;page=1;block=p1_text_1>' } }], citations: [{ document: 'fixture.pdf', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20] }] });
    }
    calls.other += 1;
    if (pathname === '/docs') return Response.json({ documents: [{ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'completed' }] });
    if (pathname.endsWith('/metadata')) {
      if (settled) { if (options.abortDuringMetadata) controller.abort(); return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'completed' }); }
      if (polling && !settled) { statusCalls++; elapsed += options.statusElapsed ?? 0; }
      if (polling && options.statuses?.[0] === 'throw') throw new Error('synthetic_status_failure');
      const status = polling && calls.question === 0 ? (statuses.length > 1 ? statuses.shift()! : statuses[0]!) : 'completed';
      if (polling && (status === 'completed' || status === 'failed')) settled = true;
      return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status });
    }
    if (pathname.endsWith('/block/p1_text_1/')) return Response.json({ doc_id: 'pi-fixture', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20], text: 'Hàm lượng 120 mg' });
    throw new Error('Unexpected connector request');
  };
  const service: ResearchAutomationService = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => runId, now: clock,
    renderer: async (input, kind) => {
      if (options.trackSettlement || options.renderOutcome) {
        const row = db.prepare('SELECT artifact_sha256 sha FROM analysis_pageindex_run_quotes WHERE run_id=?').get(runId) as { sha: string } | undefined;
        renderSnapshots.push({ step: reportStep(), quotes: await service.readPageIndexQuotes(workspaceId, runId), quotesSha: row?.sha ?? null });
      }
      if (options.renderOutcome) {
        if (options.renderOutcome === 'CANCELLED') controller.abort();
        throw new Error('synthetic_render_failure');
      }
      if (options.ownerCancelDuring === 'RENDERING') await cancelAsOwner();
      return buildResearchAutomationReport(input, kind);
    }, source: syntheticProductSource(),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'prompt-v1' },
    ...(options.pageIndex ? { pageIndex: { enabled: true, apiKey: 'synthetic-pdf-key', fetch: fakeFetch, startingCreditMicroDollars: 10_000_000, maxQuestionsPerRun: options.maxQuestions ?? 10,
      readyPollIntervalMs: 20_000, readyWaitCapMs: options.waitCap ?? 40_000,
      sleep: async ms => { waits.push(ms); elapsed += ms; if (options.abortDuringWait) controller.abort(); if (options.ownerCancelDuring === 'POLLING') await cancelAsOwner(); },
      extractPdf: async () => [{ page: 1, text: 'Hàm lượng 120 mg' }], readPdfTitle: async () => { titleReads += 1; return options.pdfTitle ?? null; } } } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY', keyword: 'bình giữ nhiệt',
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  if (options.pdf) await service.attachRunPdf(workspaceId, runId, 'fixture.pdf', PDF_BYTES);
  if (options.secondPdf) await service.attachRunPdf(workspaceId, runId, 'fixture.pdf', Buffer.concat([PDF_BYTES, Buffer.from('synthetic second PDF')]));
  if (options.statuses) {
    db.prepare("UPDATE analysis_pageindex_documents SET status='INDEXING'").run();
    polling = true;
  }
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision,
    definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let index = 0; index < 10 && !controller.signal.aborted; index += 1) {
    if (['DRAFT_READY', 'FAILED', 'CANCELLED'].includes((await service.getRun(workspaceId, runId)).status)) break;
    await service.processNext(controller.signal);
  }
  assert.equal((await service.getRun(workspaceId, runId)).status, options.renderOutcome ?? (options.abortDuringWait || options.abortDuringMetadata || options.ownerCancelDuring ? 'CANCELLED' : 'DRAFT_READY'));
  const html = async (pairId?: string) => (await service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8');
  const semantic = async (): Promise<Record<string, unknown>> => {
    const row = db.prepare('SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?').get(runId, 'MARKET') as { sha: string };
    return JSON.parse((await artifacts.read(row.sha)).toString('utf8')) as Record<string, unknown>;
  };
  const outcomes = async () => {
    const row = db.prepare('SELECT artifact_sha256 sha FROM analysis_pageindex_run_quotes WHERE run_id=?').get(runId) as { sha: string };
    assert.ok(row?.sha, 'REPORTS must durably retain the run quotes and document outcomes');
    return JSON.parse((await artifacts.read(row.sha)).toString()) as { documents?: { state: string }[] };
  };
  return { root, db, artifacts, service, calls, html, semantic, outcomes, waits, reportStep, renderSnapshots, cancellations, statusCalls: () => statusCalls, titleReads: () => titleReads };
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
  const f = await fixture({ pdf: true, pageIndex: true, pdfTitle: '  BÁO CÁO thị trường bình giữ nhiệt năm 2025 ... - VnExpress ' });
  const g = await fixture({ pdf: true, pageIndex: true, pdfTitle: 'fixture-report.pdf' });
  try {
    const block = blockOf(await f.html());
    assert.equal((block.match(/BÁO CÁO thị trường bình giữ nhiệt năm 2025, trang 1;/gu) ?? []).length, PDF_EXCERPT_MAX_PER_DOCUMENT);
    assert.doesNotMatch(block, /fixture|Tài liệu PDF số/u);
    assert.equal((f.db.prepare('SELECT document_title t FROM analysis_pageindex_run_pdfs WHERE run_id=?').get(runId) as { t: string }).t, 'BÁO CÁO thị trường bình giữ nhiệt năm 2025');
    assert.equal(f.titleReads(), 1, 'the stored title is not read again');
    const saved = await f.html();
    f.db.prepare('UPDATE analysis_pageindex_run_pdfs SET document_title=NULL WHERE run_id=?').run(runId);
    assert.equal(await f.html(), saved, 'saved labels and HTML remain frozen even if the current title changes');
    assert.equal(f.titleReads(), 1, 'reading saved drafts does not parse metadata again');
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


test('SRC3 S25 INDEXING → READY: questions may run; FAILED is never queried', async () => {
  const ready = await fixture({ pdf: true, pageIndex: true, statuses: ['processing', 'completed'] });
  const failed = await fixture({ pdf: true, pageIndex: true, statuses: ['failed'] });
  try {
    assert.equal(failed.calls.question, 0, 'failed indexing never reaches the question endpoint');
    assert.equal((failed.db.prepare('SELECT status FROM analysis_pageindex_documents').get() as { status: string }).status, 'FAILED');
    assert.equal((ready.db.prepare('SELECT status FROM analysis_pageindex_documents').get() as { status: string }).status, 'READY');
    assert.equal(ready.statusCalls(), 2);
    assert.equal(failed.statusCalls(), 1);
    assert.deepEqual(ready.waits, [20_000]);
    assert.deepEqual(failed.waits, []);
    assert.ok(ready.calls.question > 0);
    assert.equal(ready.calls.upload, 1);
    assert.equal(failed.calls.upload, 1);
    assert.equal((await ready.outcomes()).documents?.[0]?.state, 'READ');
    assert.equal((await failed.outcomes()).documents?.[0]?.state, 'INDEX_FAILED');
  } finally { for (const f of [ready, failed]) { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); } }
});

test('SRC3 S25 Missing question: recorded per-document; no question call', async () => {
  const f = await fixture({ pdf: true, pageIndex: true, maxQuestions: 0 });
  try {
    assert.equal(f.calls.question, 0);
    assert.equal((await f.outcomes()).documents?.[0]?.state, 'NO_QUESTION_PLANNED');
    assert.equal(f.calls.upload, 1, 'report planning does not re-upload');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});

test('SRC3 S25 Question errors: recorded and logged instead of swallowed', async t => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const f = await fixture({ pdf: true, pageIndex: true, queryFails: true });
  try {
    assert.ok(f.calls.question > 0);
    assert.equal((await f.outcomes()).documents?.[0]?.state, 'QUESTION_FAILED');
    assert.ok(logged.some(args => args.some(value => String(value).includes('research_automation_pdf'))));
    const rows = f.db.prepare('SELECT failure_code FROM analysis_pageindex_questions').all() as { failure_code: string | null }[];
    assert.ok(rows.length > 0 && rows.every(row => row.failure_code !== null), 'no silent successful question');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});

test('SRC3 S25 Bounded polling honours abort: no status or question after cancellation', async t => {
  const f = await fixture({ pdf: true, pageIndex: true, statuses: ['processing', 'completed'], abortDuringWait: true, context: t });
  try {
    assert.deepEqual(f.waits, [20_000]);
    assert.equal(f.statusCalls(), 1, 'no status refresh after the injected wait aborts');
    assert.equal(f.calls.question, 0, 'an aborted report must not spend on questions');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});


test('SRC3 S25 Status failures stop after two attempts with recorded reasons; no third dispatch', async t => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const f = await fixture({ pdf: true, pageIndex: true, statuses: ['throw'], context: t });
  try {
    assert.equal(f.calls.question, 0);
    assert.equal((await f.outcomes()).documents?.[0]?.state, 'STATUS_FAILED');
    assert.equal(f.statusCalls(), 2);
    assert.deepEqual(f.waits, []);
    const step = f.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='REPORTS'").get(runId) as { sha: string };
    const saved = JSON.parse((await f.artifacts.read(step.sha)).toString());
    assert.deepEqual(saved.pdfReadings[0].statusAttempts, Array(2).fill({ state: 'error', reason: 'synthetic_status_failure' }));
    assert.equal(saved.pdfReadings[0].reason, 'synthetic_status_failure');
    assert.ok(logged.some(args => args.some(value => String(value).includes('synthetic_status_failure'))), 'the transport cause must be logged');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});


test('SRC3 S25 All readiness checks share ten minutes; slow requests cannot multiply the deadline', async () => {
  const f = await fixture({ pdf: true, pageIndex: true, statuses: ['processing'], waitCap: 600_000, statusElapsed: 90_000, secondPdf: true });
  try {
    assert.equal((f.db.prepare('SELECT count(*) n FROM analysis_pageindex_documents').get() as { n: bigint }).n, 2n);
    assert.equal(f.statusCalls(), 6, 'request duration consumes the same deadline as sleeps');
    assert.equal(f.calls.question, 0);
    assert.equal((await f.outcomes()).documents?.[0]?.state, 'NOT_READY_AFTER_WAIT');
    assert.ok(f.waits.reduce((sum, ms) => sum + ms, 0) <= 100_000, 'no fresh ten-minute budget after a slow request');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});

test('SRC3 S25 Cancellation prevents subsequent dispatches; abort during metadata prevents paid question', async () => {
  const f = await fixture({ pdf: true, pageIndex: true, statuses: ['completed'], abortDuringMetadata: true });
  try {
    assert.equal(f.calls.question, 0);
    assert.equal(f.statusCalls(), 1);
    assert.equal((await f.outcomes()).documents?.[0]?.state, 'CANCELLED');
  } finally { f.db.close(); await fs.rm(f.root, { recursive: true, force: true }); }
});

test('SRC3 S25 Optional reading diagnostics survive step-document replay; older documents without diagnostics still parse', async () => {
  const f = await fixture({ pdf: true, pageIndex: true });
  const old = await fixture({ pdf: false, pageIndex: false });
  try {
    assert.ok((await old.html()).includes('<html'), 'older documents without diagnostics still render');
    assert.equal(await old.service.readPageIndexQuotes(workspaceId, runId), null);
    const row = f.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='REPORTS'").get(runId) as { sha: string };
    assert.ok(row?.sha, 'REPORTS diagnostics must survive persistence');
    const step = JSON.parse((await f.artifacts.read(row.sha)).toString());
    assert.equal(step.stepId, 'REPORTS');
    assert.equal(step.pdfReadings[0].state, 'READ');
    assert.ok(step.pdfReadings[0].questionAttempts.every((a: { state: string }) => a.state === 'ANSWERED'));
    assert.deepEqual(step.pdfReadings, (await f.service.readPageIndexQuotes(workspaceId, runId))?.documents);
    assert.equal(await f.html(), await f.html());
  } finally { for (const x of [f, old]) { x.db.close(); await fs.rm(x.root, { recursive: true, force: true }); } }
});

test('SRC3 S25 REPORTS diagnostics attach at settlement; RUNNING keeps result_sha256 NULL', async t => {
  t.mock.method(console, 'error', () => {});
  for (const outcome of ['SUCCEEDED', 'FAILED', 'CANCELLED'] as const) {
    const f = await fixture({ pdf: true, pageIndex: true, trackSettlement: true, context: t,
      ...(outcome === 'SUCCEEDED' ? {} : { renderOutcome: outcome }) });
    assert.equal(f.renderSnapshots.length, 1);
    const running = f.renderSnapshots[0]!;
    assert.equal(running.step.state, 'RUNNING');
    assert.ok(running.step.startedAt);
    assert.equal(running.step.sha, null, 'diagnostics cannot be attached before the terminal transition');
    assert.equal(running.step.finishedAt, null);
    assert.equal(running.quotes?.documents?.[0]?.state, 'READ');
    const settled = f.reportStep();
    assert.equal(settled.state, outcome);
    assert.ok(settled.finishedAt);
    assert.ok(settled.sha, 'diagnostics attach on success, failure and cancellation');
    const document = JSON.parse((await f.artifacts.read(settled.sha)).toString()) as StepResultDocument;
    assert.equal(document.contractVersion, 'research-automation-step-result-v1');
    assert.equal(document.runId, runId);
    assert.equal(document.stepId, 'REPORTS');
    assert.equal(document.outcome, outcome);
    assert.deepEqual(document.pdfReadings, running.quotes?.documents);
    assert.equal((await f.service.getRun(workspaceId, runId)).status, outcome === 'SUCCEEDED' ? 'DRAFT_READY' : outcome);
  }
});

test('SRC3 S25 Saved quotes survive rendering failure; failed rendering cannot roll back quotes', async t => {
  t.mock.method(console, 'error', () => {});
  const f = await fixture({ pdf: true, pageIndex: true, renderOutcome: 'FAILED', context: t });
  const before = f.renderSnapshots[0]!;
  assert.ok(before.quotesSha, 'quotes are committed before rendering starts');
  assert.ok(before.quotes && before.quotes.quotes.length > 0);
  assert.ok(before.quotes.quotes.every(quote => quote.quoteVerification === 'EXTERNAL_VERIFIER_ATTESTED'));
  const after = f.db.prepare('SELECT artifact_sha256 sha FROM analysis_pageindex_run_quotes WHERE run_id=?').get(runId) as { sha: string };
  assert.equal(after.sha, before.quotesSha, 'render failure must not remove or replace the retained quotes');
  const calls = { ...f.calls };
  assert.deepEqual(await f.service.readPageIndexQuotes(workspaceId, runId), before.quotes);
  assert.deepEqual(f.calls, calls, 'saved quotes replay without new provider dispatches');
  assert.equal(f.reportStep().state, 'FAILED');
  assert.equal(f.reportStep().messageCode, 'REPORT_RENDER_FAILED');
  assert.equal((f.db.prepare('SELECT count(*) n FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { n: bigint }).n, 0n,
    'a failed render must not publish a report');
});

test('SRC3 S25 Owner cancellation during polling/rendering preserves diagnostics; no subsequent paid call', async t => {
  t.mock.method(console, 'error', () => {});
  for (const phase of ['POLLING', 'RENDERING'] as const) {
    const f = await fixture({ pdf: true, pageIndex: true, context: t, ownerCancelDuring: phase,
      trackSettlement: true, statuses: phase === 'POLLING' ? ['processing', 'completed'] : ['completed'] });
    assert.equal(f.cancellations.length, 2, 'a repeated owner cancellation must also defer settlement');
    for (const snapshot of f.cancellations) {
      assert.equal(snapshot.status, 'CANCELLING');
      assert.equal(snapshot.step.state, 'RUNNING');
      assert.equal(snapshot.step.sha, null);
      assert.equal(snapshot.step.finishedAt, null);
      assert.deepEqual(f.calls, snapshot.calls, 'no connector dispatch follows either owner cancellation');
    }
    const settled = f.reportStep();
    assert.equal(settled.state, 'CANCELLED');
    assert.ok(settled.finishedAt);
    assert.ok(settled.sha, 'owner cancellation must attach final REPORTS diagnostics');
    const saved = JSON.parse((await f.artifacts.read(settled.sha)).toString()) as StepResultDocument;
    assert.equal(saved.stepId, 'REPORTS');
    assert.equal(saved.runId, runId);
    assert.equal(saved.outcome, 'CANCELLED');
    const quotes = await f.service.readPageIndexQuotes(workspaceId, runId);
    assert.deepEqual(saved.pdfReadings, quotes?.documents);
    assert.ok(saved.pdfReadings);
    assert.equal(saved.pdfReadings?.length, 1);
    assert.equal(saved.pdfReadings[0]!.state, phase === 'POLLING' ? 'CANCELLED' : 'READ');
    assert.deepEqual(saved.pdfReadings[0]!.statusAttempts, [{ state: phase === 'POLLING' ? 'processing' : 'completed' }]);
    if (phase === 'POLLING') {
      assert.equal(f.statusCalls(), 1);
      assert.equal(f.calls.question, 0, 'the later READY response cannot authorize a paid question');
      assert.equal(f.renderSnapshots.length, 0);
    } else {
      assert.equal(f.renderSnapshots.length, 1);
      assert.ok(quotes && quotes.quotes.length > 0, 'completed quotes survive owner cancellation during rendering');
    }
    assert.equal((f.db.prepare('SELECT count(*) n FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { n: bigint }).n, 0n);
    assert.equal(await f.service.processNext(), false);
    assert.deepEqual(f.calls, f.cancellations[0]!.calls, 'replay cannot resume cancelled work');
  }
});

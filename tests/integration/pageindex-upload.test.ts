import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { openDatabase } from '../../src/platform/db/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { buildResearchAutomationSourceStatus } from '../../src/modules/analysis/research-automation/source-status.js';
import sourceStatusSchema from '../../contracts/api/research-automation-source-status-api.schema.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(sourceStatusSchema);
const validateStatus = ajv.getSchema(`${(sourceStatusSchema as { $id: string }).$id}#/$defs/status`)!;

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const fixedNow = () => new Date('2026-10-07T00:00:00.000Z');

function pdfFixture(): Buffer {
  const text = 'BT /F1 12 Tf 20 100 Td (Calcium 120 mg) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

// The service owns attachment, indexing, local verification and artifact persistence;
// only HTTP responses are fake, so the fixture cannot supply missing wiring.
test('fixture run indexes attached PDF once, persists verified quotes and exposes live stored states', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pageindex-upload-'));
  const opened = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  try {
    const db = opened.db; const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
    const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now: fixedNow });
    await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'pageindex-workflow', title: 'Synthetic PDF workflow' });
    const bytes = pdfFixture(); let uploads = 0; let questions = 0; let lists = 0; let failQuestion = false; let unknownPages = false; let exhausted = false;
    const fakeFetch: typeof fetch = async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === '/doc/upload') { uploads += 1; return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'processing' }); }
      if (pathname === '/doc/list') {
        lists += 1;
        return exhausted ? Response.json({ code: 'USAGE_LIMIT_REACHED' }, { status: 403 })
          : Response.json({ documents: [{ id: 'pi-fixture', name: 'fixture.pdf', pageNum: unknownPages ? null : 1, status: 'completed' }] });
      }
      if (pathname.endsWith('/metadata')) return Response.json({ id: 'pi-fixture', name: 'fixture.pdf', pageNum: 1, status: 'completed' });
      if (pathname === '/chat/completions') {
        questions += 1;
        if (failQuestion) { failQuestion = false; throw new Error('Synthetic uncertain response'); }
        assert.ok(JSON.parse(String(init?.body)).messages[0].content);
        return Response.json({ choices: [{ message: { content: 'Raw answer is not evidence <doc=fixture.pdf;page=1;block=p1_text_1>' } }],
          citations: [{ document: 'fixture.pdf', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20] }] });
      }
      if (pathname.endsWith('/block/p1_text_1/')) return Response.json({ doc_id: 'pi-fixture', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [1, 1, 20, 20], text: 'Calcium 120 mg' });
      throw new Error('Unexpected connector request');
    };
    const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now: fixedNow,
      pageIndex: { enabled: true, apiKey: 'synthetic-pdf-key', fetch: fakeFetch, startingCreditMicroDollars: 10_000_000, maxQuestionsPerRun: 2 },
      renderer: (input, kind) => ({ semantic: { contractVersion: 'research-automation-report-v1', runId: input.run.runId, workspaceId, kind }, html: Buffer.from(`<html>${kind}</html>`) }) });
    async function run(key: string, expectedQuotes = 2) {
      const receipt = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: key, mode: 'CATEGORY', keyword: 'synthetic PDF',
        requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
      await service.processNext();
      const run = await service.getRun(workspaceId, receipt.run.runId);
      assert.equal(run.status, 'AWAITING_SCOPE');
      const states = await service.attachRunPdf(workspaceId, run.runId, 'fixture.pdf', bytes);
      assert.deepEqual(states.documents.map(doc => doc.state), ['READY']);
      await service.confirmScope(workspaceId, run.runId, { contractVersion: 'research-automation-confirm-v2', requestKey: key.replace(/^./, 'f'), expectedRevision: run.revision,
        definition: 'Synthetic unchanged scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
      await service.processNext(); await service.processNext();
      assert.equal((await service.getRun(workspaceId, run.runId)).status, 'DRAFT_READY');
      const quotes = await service.readPageIndexQuotes(workspaceId, run.runId);
      assert.equal(quotes?.quotes.length, expectedQuotes);
      if (expectedQuotes > 0) {
        assert.equal(quotes?.quotes[0]?.quoteVerification, 'EXTERNAL_VERIFIER_ATTESTED');
        assert.equal(quotes?.quotes[0]?.quote, 'Calcium 120 mg');
      }
      assert.ok(!JSON.stringify(quotes).includes('Raw answer'));
      const row = db.prepare('SELECT artifact_sha256 sha FROM analysis_pageindex_run_quotes WHERE run_id=?').get(run.runId) as { sha: string };
      assert.deepEqual(JSON.parse((await artifacts.read(row.sha)).toString()), quotes);
      return run.runId;
    }
    const firstRun = await run('33333333-3333-4333-8333-333333333333');
    assert.equal(uploads, 1); assert.equal(questions, 2);
    const firstQuotes = await service.readPageIndexQuotes(workspaceId, firstRun);
    await service.attachRunPdf(workspaceId, firstRun, 'fixture.pdf', bytes);
    assert.deepEqual(await service.readPageIndexQuotes(workspaceId, firstRun), firstQuotes);
    await run('44444444-4444-4444-8444-444444444444');
    assert.equal(uploads, 1); assert.equal(questions, 4);
    failQuestion = true;
    const thirdRun = await run('55555555-5555-4555-8555-555555555555', 1);
    assert.equal(questions, 6, 'Failed dispatch consumes one of the durable run cap slots');
    const beforeQuotes = await service.readPageIndexQuotes(workspaceId, thirdRun);
    const previousPairId = (await service.listReportVersions(workspaceId, thirdRun)).at(-1)!.pairId;
    await service.requestReportRevision(workspaceId, thirdRun, { contractVersion: 'automation-report-revision-v1',
      requestKey: '66666666-6666-4666-8666-666666666666', previousPairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
    await service.processNext();
    assert.equal(questions, 6, 'A report revision cannot retry a reserved failed question');
    assert.deepEqual(await service.readPageIndexQuotes(workspaceId, thirdRun), beforeQuotes, 'Previously verified results survive a repeated REPORTS step');
    db.exec(`CREATE TRIGGER reject_question_ack BEFORE UPDATE ON analysis_pageindex_questions
      WHEN NEW.result_sha256 IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic_question_ack_failure'); END;`);
    const fourthRun = await run('77777777-7777-4777-8777-777777777777', 0);
    db.exec('DROP TRIGGER reject_question_ack');
    const fourthPair = (await service.listReportVersions(workspaceId, fourthRun)).at(-1)!.pairId;
    await service.requestReportRevision(workspaceId, fourthRun, { contractVersion: 'automation-report-revision-v1',
      requestKey: '88888888-8888-4888-8888-888888888888', previousPairId: fourthPair,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
    await service.processNext();
    assert.equal(questions, 8, 'Uncertain question acknowledgement must not spend again on revision');
    const summary = service.pageIndexStatusSummary();
    assert.equal(summary.documentsSent, 1); assert.equal(summary.activePages, 1); assert.equal(summary.balanceMicroDollars, 9_990_000);
    assert.equal(summary.keyConfigured, true); assert.equal(summary.lastCallAt, fixedNow().toISOString());
    await service.recheckPageIndex(); assert.equal(lists, 1); assert.equal(uploads, 1); assert.equal(questions, 8);
    unknownPages = true;
    const unknown = await service.recheckPageIndex();
    assert.equal(unknown.activePages, null); assert.equal(unknown.balanceMicroDollars, null); assert.equal(unknown.lowBalance, true);
    exhausted = true;
    assert.equal((await service.recheckPageIndex()).usageLimited, true, 'A free-list usage signal pauses future paid calls');
    db.pragma('query_only = ON');
    assert.equal((await service.pageIndexStatesForRun(workspaceId, firstRun)).documents[0]?.state, 'READY');
    assert.equal(service.pageIndexStatusSummary().documentsSent, 1);
    assert.equal(lists, 3, 'read-only page loads never issue a provider call');
  } finally { opened.db.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('low balance pauses automatic indexing on the status card', () => {
  const status = buildResearchAutomationSourceStatus({
    workspaceId, checkedAt: '2026-10-07T00:00:00.000Z', executorEnabled: true, providers: undefined,
    wired: { kalodata: false, serpapi: false, apifyShopee: false },
    activity: {
      kalodata: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
      serpapi: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
      'apify-shopee': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
      metric: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    },
    pageindex: {
      keyConfigured: true, enabled: true, lastCallAt: null, documentsSent: 2,
      balanceMicroDollars: 400_000, balanceCheckedAt: '2026-10-07T00:00:00.000Z', billingUrl: null,
      activePages: 1500, estimatedMonthlyCostMicroDollars: 500_000, lowBalance: true, usageLimited: false,
    },
  });
  assert.equal(validateStatus(status), true, JSON.stringify(validateStatus.errors));
  const card = status.sources.find(entry => entry.source === 'PAGEINDEX')!;
  assert.equal(card.state, 'READY');
  assert.equal(card.pageindex?.automaticState, 'PAUSED_LOW_BALANCE');
});

test('production upload gates account for accrued storage, prospective indexing and unknown credit', async t => {
  for (const scenario of ['storage', 'prospective', 'unknown'] as const) await t.test(scenario, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pageindex-gate-'));
    const opened = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
    try {
      const db = opened.db; const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
      const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now: fixedNow });
      await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'pageindex-gate', title: 'Synthetic balance gate' });
      if (scenario === 'storage') for (const digest of ['a', 'b']) db.prepare(`INSERT INTO analysis_pageindex_documents
        (source_sha256,cloud_doc_id,cloud_file_name,page_count,uploaded_at,status,updated_at,upload_attempted,upload_attempted_at)
        VALUES (?,?,?,1000,'2026-08-01T00:00:00.000Z','READY','2026-08-01T00:00:00.000Z',1,'2026-08-01T00:00:00.000Z')`)
        .run(digest.repeat(64), `pi-${digest}`, `${digest}.pdf`);
      let calls = 0;
      const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now: fixedNow,
        pageIndex: { enabled: true, apiKey: 'synthetic-gate-key', ...(scenario === 'unknown' ? {} : { startingCreditMicroDollars: scenario === 'storage' ? 27_000_000 : 10_000_000 }),
          extractPdf: async () => Array.from({ length: scenario === 'prospective' ? 1000 : 1 }, (_, index) => ({ page: index + 1, text: 'Synthetic local verifier' })),
          fetch: async () => { calls++; throw new Error('Gate must prevent dispatch'); } } });
      const receipt = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '99999999-9999-4999-8999-999999999999',
        mode: 'CATEGORY', keyword: 'synthetic gate', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
      await service.processNext();
      const states = await service.attachRunPdf(workspaceId, receipt.run.runId, 'fixture.pdf', pdfFixture());
      assert.equal(states.documents[0]?.state, 'SKIPPED_LOW_BALANCE'); assert.equal(calls, 0);
      if (scenario === 'unknown') assert.equal(service.pageIndexStatusSummary().balanceMicroDollars, null);
      if (scenario === 'storage') assert.equal(service.pageIndexStatusSummary().balanceMicroDollars, 4_806_452);
    } finally { opened.db.close(); await fs.rm(root, { recursive: true, force: true }); }
  });
});

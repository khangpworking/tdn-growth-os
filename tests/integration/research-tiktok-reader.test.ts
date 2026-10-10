import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { tiktokFixture, workspaceId, runId, fakeCodingPort, fakeCodingAi } from '../fixtures/tiktok-coding-fixture.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';
import { readerBrowserPath } from '../helpers/reader-render-check.js';

const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

async function proposed(t: TestContext) {
  const f = await tiktokFixture(t);
  assert.equal(f.keyword.contractVersion, 'l9-keyword-list-draft-record-v3');
  assert.ok(f.keyword.sourceSetDigest);
  const port = fakeCodingPort();
  const receipt = await f.service.proposeTikTokCoding(workspaceId, runId, {
    contractVersion: 'tiktok-coding-propose-v1', requestKey: randomUUID(),
    binding: { workspaceId, runId, scopeSha256: f.keyword.scopeDigest, sourceSetSha256: f.keyword.sourceSetDigest!,
      requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } },
    corpus: { ...f.corpusPackage }, keywordDigest: f.keywordDigest }, fakeCodingAi(port));
  const history = await f.service.listTikTokCodingHistory(workspaceId, runId);
  const source = history.sources[0]!;
  const read = await f.service.readTikTokCoding(workspaceId, runId, source.packageId);
  return { f, receipt, source, read, draftDigest: sha(read.draft), reportDigest: sha(read.report) };
}

function buildRequest(draftDigest: string, reportDigest: string, requestKey = randomUUID()) {
  return { contractVersion: 'insight-reader-build-tiktok-v1', reportKind: 'INSIGHT', requestKey,
    draftPairId: draftDigest, semanticSha256: reportDigest, sourceKind: 'TIKTOK' };
}

test('build retained TikTok reader -> consumption ledger -> open/reopen/decide journey', async t => {
  const { f, read, draftDigest, reportDigest } = await proposed(t);
  const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
  const key = randomUUID();
  const receipt = await f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest, key), owner);
  assert.equal(receipt.exactRetry, false);
  assert.equal(receipt.revision.builderVersion, 'reader-report-insight-tiktok-v1');
  assert.equal(receipt.revision.reportKind, 'INSIGHT');
  const consumption = await f.service.readTikTokReportConsumption(workspaceId, runId);
  assert.equal(consumption.entries.length, 1);
  assert.equal(consumption.entries[0]!.revisionId, receipt.revision.revisionId);
  assert.equal(consumption.entries[0]!.reportIdentitySha256, reportDigest);
  assert.equal(consumption.entries[0]!.codingDraftSha256, draftDigest);
  assert.equal(consumption.entries[0]!.corpusPackageId, read.draft.corpus.packageId);
  const list = await f.service.listReaderReportsV2(workspaceId, runId);
  const listed = list.revisions.find(item => item.revisionId === receipt.revision.revisionId);
  assert.ok(listed && listed.reportKind === 'INSIGHT');
  const first = await f.service.readReaderReport(workspaceId, runId, receipt.revision.revisionId);
  const html = first.bytes.toString('utf8');
  assert.ok(html.includes('đề xuất, chờ chủ duyệt'));
  assert.ok(html.includes(read.draft.codes[0]!.quote.text));
  assert.ok(html.includes('S07'));
  assert.ok(html.includes('EXCLUDED'));
  const second = await f.service.readReaderReport(workspaceId, runId, receipt.revision.revisionId);
  assert.ok(second.bytes.equals(first.bytes));
  assert.equal((await f.service.readTikTokReportConsumption(workspaceId, runId)).entries.length, 1,
    'reopen writes no ledger rows');
  const rebuilt = await f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest, key), owner);
  assert.equal(rebuilt.exactRetry, true);
  assert.equal((await f.service.readTikTokReportConsumption(workspaceId, runId)).entries.length, 1,
    'exact retry writes no ledger rows');
  const decided = await f.service.decideReaderReportV2(workspaceId, runId, { contractVersion: 'reader-report-decision-v2',
    requestKey: randomUUID(), revisionId: receipt.revision.revisionId, decision: 'APPROVED', reason: null,
    reportKind: 'INSIGHT', htmlSha256: receipt.revision.htmlSha256 }, owner);
  assert.equal(decided.exactRetry, false);
  await assert.rejects(f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest), owner),
    'approved reader blocks a second build');
});

test('TikTok build request is explicitly refused on the old Insight route', async t => {
  const { f, draftDigest, reportDigest } = await proposed(t);
  const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
  await assert.rejects(f.service.buildInsightReaderReport(workspaceId, runId, {
    contractVersion: 'insight-reader-build-tiktok-v1', reportKind: 'INSIGHT', requestKey: randomUUID(),
    draftPairId: draftDigest, semanticSha256: reportDigest, sourceKind: 'TIKTOK' }, owner),
    /reader-reports\/tiktok/);
  assert.equal((await f.service.listReaderReportsV2(workspaceId, runId)).revisions.length, 0);
  assert.equal((await f.service.readTikTokReportConsumption(workspaceId, runId)).entries.length, 0);
});

test('mismatched build identity refuses before any retained write', async t => {
  const { f, draftDigest, reportDigest } = await proposed(t);
  const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
  await assert.rejects(f.service.buildTikTokReaderReport(workspaceId, runId,
    buildRequest('0'.repeat(64), reportDigest), owner), 'unknown draft digest refuses');
  await assert.rejects(f.service.buildTikTokReaderReport(workspaceId, runId,
    buildRequest(draftDigest, '0'.repeat(64)), owner), 'unknown report digest refuses');
  assert.equal((await f.service.listReaderReportsV2(workspaceId, runId)).revisions.length, 0);
  assert.equal((await f.service.readTikTokReportConsumption(workspaceId, runId)).entries.length, 0);
});

test('owned ledger rows are immutable; illegal execution transitions refuse', async t => {
  const { f, draftDigest, reportDigest } = await proposed(t);
  const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
  const receipt = await f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest), owner);
  assert.throws(() => f.db.prepare(`UPDATE analysis_tiktok_report_consumption SET actor_id='mallory' WHERE revision_id=?`)
    .run(receipt.revision.revisionId), /immutable_tiktok_report_consumption/);
  assert.throws(() => f.db.prepare('DELETE FROM analysis_tiktok_report_consumption').run(), /immutable_tiktok_report_consumption/);
  assert.throws(() => f.db.prepare(`UPDATE analysis_tiktok_coding_executions SET state='DISPATCHING' WHERE state='COMPLETED'`).run(),
    /invalid_tiktok_coding_execution_transition/);
  assert.throws(() => f.db.prepare('DELETE FROM analysis_tiktok_coding_executions').run(), /immutable_tiktok_coding_execution/);
});

const pdfExecutable = readerBrowserPath() ?? process.env.TDN_RESEARCH_PDF_CHROMIUM ?? undefined;
test('retained TikTok revision HTML prints to a real PDF without rebuild', { skip: !pdfExecutable }, async t => {
  const { f, draftDigest, reportDigest } = await proposed(t);
  const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
  const receipt = await f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest), owner);
  const saved = await f.service.readReaderReport(workspaceId, runId, receipt.revision.revisionId);
  assert.equal(createHash('sha256').update(saved.bytes).digest('hex'), receipt.revision.htmlSha256);
  const renderer = createChromiumPdfRenderer({ executablePath: pdfExecutable! });
  try {
    const printed = await renderer.render(saved.bytes);
    assert.ok(printed.length > 0 && printed.subarray(0, 5).toString('latin1') === '%PDF-');
  } finally { await renderer.close(); }
});

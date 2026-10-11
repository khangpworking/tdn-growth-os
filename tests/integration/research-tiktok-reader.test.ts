import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { tiktokFixture, workspaceId, runId, fakeCodingPort, fakeCodingAi } from '../fixtures/tiktok-coding-fixture.js';
import type { TikTokCodingAI } from '../../src/modules/analysis/research-automation/tiktok-coding.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';
import { readerBrowserPath } from '../helpers/reader-render-check.js';
import { prepareTikTokReaderBuild } from '../../src/modules/analysis/reader-report/tiktok-build-v1.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import type { TikTokCommentCorpus } from '../../contracts/analysis/tiktok-comment-collection-v1.generated.js';

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
  assert.ok(html.includes('<th>Hạng</th>'));
  assert.ok(html.includes('Khen/chê'));
  assert.ok(html.includes('Khác'));
  assert.ok(html.includes('Không khen không chê: 0 lượt nhắc.'));
  assert.ok(html.includes('Ngữ cảnh bản ghi'));
  assert.doesNotMatch(html, /nhắc nhiều|frequent.*important/i);
  const retained = await new FoundationSourcePackageReader(new SourcePackageService({ db: f.db, artifactStore: f.artifacts }))
    .readFinalizedSourcePackage(f.corpusPackage.packageId, { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
  const corpusBytes = retained.files.find(file => file.path === 'corpus.json')!.bytes;
  const corpus = JSON.parse(corpusBytes.toString('utf8')) as TikTokCommentCorpus;
  const firstRecordIndex = read.draft.codes[0]!.recordIndex;
  const firstRecord = corpus.records[firstRecordIndex]!;
  const sourceView = await f.service.readP9Source(workspaceId, runId, 'comments', read.draft.corpus.packageId);
  assert.equal(sourceView.view.contractVersion, 'tiktok-comment-read-v1');
  assert.equal(sourceView.view.rows.find(row => row.createdAt !== null)!.createdAt, firstRecord.createdAt);
  assert.ok(html.includes('<span class="cite-date">ngày 03/09/2026</span>'));
  assert.ok(!html.includes('<span class="cite-date">ngày 09/10/2026</span>'));
  assert.ok(html.includes(firstRecord.videoUrl));
  assert.ok(html.includes(`bình luận ${firstRecord.commentId}`));
  // U-27 Reader appendix: the saved I17 carries the S07 registry identity (ID, tier, report
  // name), the L10 source-type split counted from retained records, and the retained L9
  // keyword-data version behind the exclusion tallies.
  assert.ok(html.includes('Nguồn S07 · hạng B · bình luận công khai dưới video'));
  assert.ok(html.includes('Loại nguồn:'));
  assert.ok(html.includes('video bán hàng') || html.includes('video review'));
  assert.ok(html.includes('Lọc nghĩa L9 theo bộ từ khóa đã lưu'));
  const second = await f.service.readReaderReport(workspaceId, runId, receipt.revision.revisionId);
  assert.ok(second.bytes.equals(first.bytes));
  assert.equal((await f.service.readTikTokReportConsumption(workspaceId, runId)).entries.length, 1,
    'reopen writes no ledger rows');
  const rebuilt = await f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest, key), owner);
  assert.equal(rebuilt.exactRetry, true);
  assert.equal((await f.service.readTikTokReportConsumption(workspaceId, runId)).entries.length, 1,
    'exact retry writes no ledger rows');
  const missingDateCorpus = { ...corpus, records: corpus.records.map((record, recordIndex) =>
    recordIndex === firstRecordIndex ? { ...record, createdAt: null } : record) };
  const missingDatePage = prepareTikTokReaderBuild({ workspaceId, runId, draftPairId: draftDigest,
    semanticSha256: reportDigest, sourceReportSha256: reportDigest, frozenStartSha256: '0'.repeat(64),
    frozenScopeSha256: '1'.repeat(64), sourceRendererVersion: 'tiktok-reader-kit-v1' }, read.draft, read.report,
    missingDateCorpus, '2026-10-09T00:00:00.000Z', { keyword: 'thạch dừa', definition: 'Synthetic TikTok coding scope',
      requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } });
  assert.equal(missingDatePage.page.registry.entries()[0]!.retrievedAt, null,
    'missing retained comment dates stay undated rather than using capture time');
  const decided = await f.service.decideReaderReportV2(workspaceId, runId, { contractVersion: 'reader-report-decision-v2',
    requestKey: randomUUID(), revisionId: receipt.revision.revisionId, decision: 'APPROVED', reason: null,
    reportKind: 'INSIGHT', htmlSha256: receipt.revision.htmlSha256 }, owner);
  assert.equal(decided.exactRetry, false);
  await assert.rejects(f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(draftDigest, reportDigest), owner),
    'approved reader blocks a second build');
});

test('v2 reader ranking renders tied ranks, labels, counts, KHONG_RO, and capped Khác quotes', async t => {
  const f = await tiktokFixture(t);
  const port: NonNullable<TikTokCodingAI>['port'] = { generateText: async request => {
    const input = JSON.parse((request as { userText: string }).userText) as { records: { recordIndex: number; text: string }[] };
    const specs = [
      ...input.records.slice(0, 4).flatMap((record, i) => [
        { code: `A${i}`, topic: 'Bao bì', polarity: 'KHEN' },
        { code: `B${i}`, topic: 'Hương vị', polarity: 'CHE' },
        { code: `X${i}`, topic: null, polarity: 'KHEN' },
      ]),
      ...input.records.slice(0, 3).map((record, i) => ({ code: `C${i}`, topic: 'Giá', polarity: 'CHE' })),
      { code: 'R0', topic: 'Bỏ qua', polarity: 'KHONG_RO' },
    ];
    return { text: JSON.stringify({ contractVersion: 'tiktok-coding-candidates-v2', codes: specs.map((spec, i) => {
      const record = input.records[i % input.records.length]!;
      const text = record.text.slice(0, 10);
      return { ...spec, label: spec.topic ?? 'Khác', recordIndex: record.recordIndex, quote: { text, start: 0, end: text.length } };
    }) }) };
  } };
  const codingRequest = { contractVersion: 'tiktok-coding-propose-v1', requestKey: randomUUID(),
    binding: { workspaceId, runId, scopeSha256: f.keyword.scopeDigest, sourceSetSha256: f.keyword.sourceSetDigest!, requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } },
    corpus: { ...f.corpusPackage }, keywordDigest: f.keywordDigest };
  const receipt = await f.service.proposeTikTokCoding(workspaceId, runId, codingRequest, fakeCodingAi(port));
  const source = (await f.service.listTikTokCodingHistory(workspaceId, runId)).sources[0]!;
  const read = await f.service.readTikTokCoding(workspaceId, runId, source.packageId);
  const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
  const built = await f.service.buildTikTokReaderReport(workspaceId, runId, buildRequest(digest(read.draft), digest(read.report)), { actorId: 'synthetic-owner', role: 'OWNER' });
  assert.equal(receipt.exactRetry, false);
  const html = (await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes.toString('utf8');
  assert.ok(html.includes('<tr><td>1</td><td>Bao bì</td><td>KHEN</td><td>4</td>'));
  assert.ok(html.includes('<tr><td>1</td><td>Hương vị</td><td>CHE</td><td>4</td>'));
  assert.ok(html.includes('<tr><td>3</td><td>Giá</td><td>CHE</td><td>3</td>'));
  assert.ok(html.includes('<tr><td></td><td>Khác</td><td></td><td>4</td><td><details><summary>Xem 3 trích dẫn</summary>'));
  assert.ok(html.includes('Không khen không chê: 1 lượt nhắc.'));
});

test('retained v1 coding read and reader revision replay the origin HTML golden', async t => {
  const f = await tiktokFixture(t);
  const port = fakeCodingPort(undefined, 'v1');
  const request = { contractVersion: 'tiktok-coding-propose-v1', requestKey: randomUUID(), binding: { workspaceId, runId, scopeSha256: f.keyword.scopeDigest, sourceSetSha256: f.keyword.sourceSetDigest!, requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } }, corpus: { ...f.corpusPackage }, keywordDigest: f.keywordDigest };
  await f.service.proposeTikTokCoding(workspaceId, runId, request, fakeCodingAi(port));
  const source = (await f.service.listTikTokCodingHistory(workspaceId, runId)).sources[0]!;
  const read = await f.service.readTikTokCoding(workspaceId, runId, source.packageId);
  assert.equal(read.draft.promptVersion, 'tiktok-coding-prompt-v1');
  const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
  const built = await f.service.buildTikTokReaderReport(workspaceId, runId, { contractVersion: 'insight-reader-build-tiktok-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: digest(read.draft), semanticSha256: digest(read.report), sourceKind: 'TIKTOK' }, { actorId: 'synthetic-owner', role: 'OWNER' });
  const saved = await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId);
  const i10 = saved.bytes.toString('utf8').match(/<section id="I10">.*?<\/section>/s)?.[0];
  assert.equal(i10, fs.readFileSync('tests/fixtures/tiktok-v1-reader-i10-golden.html', 'utf8'));
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

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { insightReaderFixture, readerRunId, readerWorkspaceId, readerOwner, readerNow } from '../helpers/insight-reader-fixture.js';
import { AutomationReaderReports, type InsightReaderDraftContext } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { prepareInsightReaderBuild } from '../../src/modules/analysis/reader-report/insight-build-v1.js';

const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const binding = { workspaceId: readerWorkspaceId, runId: readerRunId };

test('synthetic Insight-only run retains exact literal source methods without a Metric package', async t => {
  const fixture = await insightReaderFixture(t);
  assert.equal(fixture.input.run.runId, readerRunId);
  assert.equal(fixture.input.metricMethods, undefined);
  assert.ok(fixture.input.insightLiteral);
  const before = fixture.calls();
  const reread = await fixture.service.readReport(readerWorkspaceId, readerRunId, 'INSIGHT', false, fixture.pair.pairId);
  assert.deepEqual(reread, fixture.report);
  assert.equal(fixture.calls(), before);
});

test('Insight ledger retains actual method pages, exact retries and owner decisions without Metric fields', async t => {
  const fixture = await insightReaderFixture(t);
  const frozen = fixture.db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope FROM analysis_research_automation_runs WHERE run_id=?')
    .get(readerRunId) as { start: string; scope: string };
  const identity = { ...binding, draftPairId: fixture.pair.pairId,
    semanticSha256: fixture.report.versionId, sourceReportSha256: sha(fixture.report.bytes),
    frozenStartSha256: frozen.start, frozenScopeSha256: frozen.scope, sourceRendererVersion: 'automation-report-kit-v19' as const };
  const prepared = prepareInsightReaderBuild(identity, fixture.input);
  assert.throws(() => prepareInsightReaderBuild(identity, { ...fixture.input, scope: { ...fixture.input.scope, definition: 'Injected scope' } }), /authenticated frozen scope/);
  assert.throws(() => prepareInsightReaderBuild(identity, { ...fixture.input, start: { ...fixture.input.start, keyword: 'Injected keyword' } }), /authenticated frozen scope/);
  assert.throws(() => prepareInsightReaderBuild({ ...identity, runId: randomUUID() }, fixture.input), /authenticated frozen scope/);
  const context: InsightReaderDraftContext = { ...binding, ...prepared };
  // Direct ledger coverage only; HTTP owning-service reconstruction is tested in the serial integration phase.
  const readers = new AutomationReaderReports(fixture.db, fixture.artifacts, readerNow, { flint: false });
  const request = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(),
    draftPairId: fixture.pair.pairId, semanticSha256: fixture.report.versionId };
  const beforeCalls = fixture.calls();
  const first = await readers.buildInsight(context, request, readerOwner);
  assert.equal(first.exactRetry, false); assert.equal(first.revision.reportKind, 'INSIGHT'); assert.equal(first.revision.revisionNumber, 1);
  const row = fixture.db.prepare('SELECT metric_package_id,profile_sha256,profile_status,platforms FROM analysis_reader_report_revisions WHERE revision_id=?').get(first.revision.revisionId);
  assert.deepEqual(row, { metric_package_id: null, profile_sha256: null, profile_status: null, platforms: null });
  const page = await readers.html(binding, first.revision.revisionId);
  assert.equal(sha(page.bytes), first.revision.htmlSha256); assert.match(page.bytes.toString(), /Nguồn có trường sao nhưng thiếu giá trị/);
  assert.match(page.bytes.toString(), /Không có chữ; cảm nhận chưa biết/); assert.match(page.bytes.toString(), /Trùng chữ không xác minh cùng tác giả/);
  assert.equal(readers.list(binding).revisions.length, 0, 'v1 remains Market-only');
  const count = () => fixture.db.prepare('SELECT COUNT(*) n FROM artifact_manifests').get() as { n: bigint };
  const before = count();
  assert.equal((await readers.buildInsight(context, request, readerOwner)).exactRetry, true); assert.deepEqual(count(), before);
  await assert.rejects(readers.buildInsight(context, { ...request, semanticSha256: '0'.repeat(64) }, readerOwner), /binding/);
  await assert.rejects(readers.buildInsight(context, request, { ...readerOwner, actorId: 'other-owner' }), /Mã yêu cầu/);
  const second = await readers.buildInsight(context, { ...request, requestKey: randomUUID() }, readerOwner);
  assert.equal(second.revision.htmlSha256, first.revision.htmlSha256, 'repeat composition preserves exact citation numbering and HTML');
  assert.deepEqual(readers.listV2(binding).revisions.map(revision => revision.state), ['SUPERSEDED', 'PENDING_OWNER_REVIEW']);
  const decision = { contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(),
    revisionId: second.revision.revisionId, htmlSha256: second.revision.htmlSha256, decision: 'APPROVED', reason: null };
  await assert.rejects(readers.decideV2(binding, { ...decision, revisionId: first.revision.revisionId }, readerOwner), /mới hơn/);
  await assert.rejects(readers.decideV2(binding, { ...decision, reportKind: 'MARKET' }, readerOwner), /Loại hoặc nội dung/);
  await assert.rejects(readers.decideV2(binding, { ...decision, htmlSha256: '0'.repeat(64) }, readerOwner), /Loại hoặc nội dung/);
  await assert.rejects(readers.decideV2({ ...binding, workspaceId: randomUUID() }, decision, readerOwner), /Loại hoặc nội dung/);
  await assert.rejects(readers.decideV2({ ...binding, runId: randomUUID() }, decision, readerOwner), /Loại hoặc nội dung/);
  assert.equal((await readers.decideV2(binding, decision, readerOwner)).revision.state, 'APPROVED');
  assert.equal((await readers.decideV2(binding, decision, readerOwner)).exactRetry, true);
  await assert.rejects(readers.decideV2(binding, { ...decision, decision: 'REJECTED' }, readerOwner), /Mã yêu cầu/);
  await assert.rejects(readers.buildInsight(context, { ...request, requestKey: randomUUID() }, readerOwner), /đã được chủ duyệt/);
  assert.deepEqual((await readers.html(binding, first.revision.revisionId)).bytes, page.bytes);
  assert.equal(fixture.calls(), beforeCalls, 'reader build/list/read/decision performs no transport calls');
});

for (const sourceRegistry of [false, true]) test(`real reader consumes retained family renderer${sourceRegistry ? '18' : '17'} and ignores generic semantic scope/sections`, async t => {
  const f = await insightReaderFixture(t, false, { familyDraft: true, sourceRegistry, injectedRendererScope: true });
  assert.ok(f.input.insightCoding); assert.equal(f.input.metricMethods, undefined);
  const request = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: f.pair.pairId, semanticSha256: f.report.versionId };
  const before = f.calls();
  const built = await f.service.buildInsightReaderReport(readerWorkspaceId, readerRunId, request, readerOwner);
  const html = (await f.service.readReaderReport(readerWorkspaceId, readerRunId, built.revision.revisionId)).bytes.toString();
  assert.equal(built.revision.reportKind, 'INSIGHT'); assert.equal(built.revision.builderVersion, 'reader-report-insight-v1');
  assert.match(html, /Synthetic native listing only/); assert.match(html, /đề xuất, chờ chủ duyệt/);
  assert.doesNotMatch(html, /Injected scope|Injected keyword|Injected finding|99999/);
  assert.match(html, /Trong mẫu lời nguồn, 1 bản ghi/);
  if (sourceRegistry) assert.match(html, /S05|S27/);
  else assert.match(html, /chưa có bản kê nguồn/);
  assert.equal(f.calls(), before);
});

for (const default21 of [false, true]) test(`saved Insight${default21 ? '21' : '19'} reads remain byte-equal while a corrupt source is rejected on a fresh build`, async t => {
  const f = await insightReaderFixture(t, default21);
  const request = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: f.pair.pairId, semanticSha256: f.report.versionId };
  const built = await f.service.buildInsightReaderReport(readerWorkspaceId, readerRunId, request, readerOwner);
  const before = await f.service.readReaderReport(readerWorkspaceId, readerRunId, built.revision.revisionId);
  const changes = f.db.prepare('SELECT total_changes() n').get(), calls = f.calls(), modelCalls = f.modelCalls();
  const { default: fs } = await import('node:fs/promises');
  const { default: path } = await import('node:path');
  // Only the task's synthetic content-addressed semantic artifact is corrupted.
  // Saved reader GET/list/decisions never need the source semantic to be reopened.
  const sourcePath = path.join(f.artifactRoot, 'sha256', f.report.versionId.slice(0, 2), f.report.versionId);
  await fs.writeFile(sourcePath, '{"synthetic":"corrupt"}');
  assert.deepEqual(await f.service.readReaderReport(readerWorkspaceId, readerRunId, built.revision.revisionId), before);
  assert.equal((await f.service.listReaderReportsV2(readerWorkspaceId, readerRunId)).revisions[0]!.state, 'PENDING_OWNER_REVIEW');
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  await assert.rejects(f.service.buildInsightReaderReport(readerWorkspaceId, readerRunId, { ...request, requestKey: randomUUID() }, readerOwner), /integrity|verification|digest|bytes/i);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  assert.equal(f.calls(), calls); assert.equal(f.modelCalls(), modelCalls);
  const decided = await f.service.decideReaderReportV2(readerWorkspaceId, readerRunId, {
    contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(), revisionId: built.revision.revisionId,
    htmlSha256: built.revision.htmlSha256, decision: 'REJECTED', reason: 'Synthetic review rejection',
  }, readerOwner);
  assert.equal(decided.revision.state, 'REJECTED');
  assert.deepEqual((await f.service.readReaderReport(readerWorkspaceId, readerRunId, built.revision.revisionId)).bytes, before.bytes);
});

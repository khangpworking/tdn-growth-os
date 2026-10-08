import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { insightReaderFixture, readerRunId, readerWorkspaceId, readerOwner, readerNow } from '../helpers/insight-reader-fixture.js';
import { AutomationReaderReports, type InsightReaderDraftContext } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationMarkOrMissing } from '../../src/modules/analysis/citation-register-html.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { insightLiteralSection } from '../../src/modules/analysis/research-automation/review-corpus-report.js';
import { projectInsightFindings } from '../../src/modules/analysis/reader-report/insight-projection.js';
import type { InsightReaderSection } from '../../src/modules/analysis/reader-report/insight-template.js';

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
  const input = fixture.input, registry = new CitationRegistry();
  const citations = { mark: (value: Parameters<CitationRegistry['cite']>[0]) => renderCitationMarkOrMissing(registry.cite(value)) };
  const sections: InsightReaderSection[] = (['I01', 'I02', 'I04', 'I05', 'I07', 'I08'] as const).map(id => ({ id,
    body: renderLocatedInsightSection(input.nativeReview!.output, id, { bundleDownload: false, showAnnotationPendingCount: false, citations })!,
    explanation: 'Khai báo bám lời nguồn, chưa phải nhận định đã xác thực.' }));
  for (const id of ['I05', 'I07', 'I08', 'I13', 'I17'] as const) {
    const body = insightLiteralSection(input.insightLiteral!, id, citations), existing = sections.find(section => section.id === id);
    if (existing) sections[sections.indexOf(existing)] = { ...existing, body: existing.body + body };
    else sections.push({ id, body, explanation: 'Số sao, nguyên văn trùng và lời người bán giữ riêng theo nguồn.' });
  }
  const frozen = fixture.db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope FROM analysis_research_automation_runs WHERE run_id=?')
    .get(readerRunId) as { start: string; scope: string };
  const context: InsightReaderDraftContext = { ...binding,
    input: { contractVersion: 'insight-reader-input-v1', reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-v1', ...binding,
      draftPairId: fixture.pair.pairId, semanticSha256: fixture.report.versionId, sourceReportSha256: sha(fixture.report.bytes),
      frozenStartSha256: frozen.start, frozenScopeSha256: frozen.scope, sourceRendererVersion: 'automation-report-kit-v19',
      scope: { keyword: input.start.keyword, definition: input.scope.definition, requestedPeriod: { startDate: input.start.requestedPeriod.startDate, endDate: input.start.requestedPeriod.endDate } },
      retainedMethods: [{ kind: 'NATIVE', sha256: sha(canonicalJson(input.nativeReview)) }, { kind: 'LITERAL', sha256: sha(canonicalJson(input.insightLiteral)) }] },
    page: { keyword: input.start.keyword, definition: input.scope.definition,
      period: { startDate: input.start.requestedPeriod.startDate, endDate: input.start.requestedPeriod.endDate }, sections, registry, findings: projectInsightFindings(input) } };
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

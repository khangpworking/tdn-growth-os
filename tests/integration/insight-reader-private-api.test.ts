import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { privateReaderFixture } from '../helpers/insight-reader-private-fixture.js';
import { readerWorkspaceId as workspaceId, readerRunId as runId, readerOwner } from '../helpers/insight-reader-fixture.js';
import { prepareInsightReaderBuild } from '../../src/modules/analysis/reader-report/insight-build-v1.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { ResearchAutomationReaderBuildReceiptV2 } from '../../contracts/api/research-automation-reader-report-api.generated.js';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const forbidden = ['918273645', 'PRIVATE_AUTHOR_NAME', 'PRIVATE_AVATAR', 'PRIVATE_STATUS', 'synthetic-token',
  'authorIdentity', 'authorHash', 'reportedAuthorHashes', 'keyId', 'keyCommitment', 'privacy', 'salt'];
const noIdentity = (value: string) => { for (const name of forbidden) assert.equal(value.includes(name), false, name); };

for (const literal of [false, true]) test(`private22 actual OWNER reader ${literal ? 'with literal' : 'source only'} preserves frozen evidence and kind/version boundaries`, async t => {
  const f = await privateReaderFixture(t, literal);
  let providerCalls = 0;
  let api: ReturnType<typeof openResearchAutomationApi>;
  const server = http.createServer((req, res) => api.handler(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token = 'synthetic-private-reader-owner-token-123456-abcdefghijklmnopqrstuvwxyz';
  api = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: readerOwner.actorId } },
    { now: () => Date.now(), sleep: async () => {}, fetch: async () => { providerCalls++; throw new Error('Reader cannot call providers'); } });
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await api.close(); });
  const root = (owner = false, wid = workspaceId, rid = runId) => `${origin}/${owner ? 'owner-api' : 'api'}/workspaces/${wid}/research-automation/runs/${rid}/reader-reports`;
  const post = (action: string, body: unknown, options: { token?: string; origin?: string; wid?: string; rid?: string } = {}) => fetch(`${root(true, options.wid, options.rid)}/${action}`, {
    method: 'POST', headers: { Origin: options.origin ?? origin, Authorization: `Bearer ${options.token ?? token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const request = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: f.pair.pairId, semanticSha256: f.report.versionId };
  assert.equal((await post('insight', request, { token: 'wrong' })).status, 401);
  assert.equal((await post('insight', request, { origin: 'http://127.0.0.1:1' })).status, 403);
  assert.equal((await post('insight', request, { wid: randomUUID() })).status, 404);
  assert.equal((await post('insight', request, { rid: randomUUID() })).status, 404);
  assert.equal((await post('insight', { ...request, draftPairId: '0'.repeat(64) })).status, 404);
  assert.equal((await post('insight', { ...request, semanticSha256: '0'.repeat(64) })).status, 400);
  assert.equal((await post('insight', { ...request, metricPackageId: randomUUID() })).status, 400);
  const calls = f.calls.length;
  const result = await post('insight', request); assert.equal(result.status, 201, await result.clone().text());
  const built = await result.json() as ResearchAutomationReaderBuildReceiptV2;
  assert.equal(built.revision.builderVersion, 'reader-report-insight-v3'); assert.equal(built.revision.reportKind, 'INSIGHT');
  assert.equal(built.revision.state, 'PENDING_OWNER_REVIEW');
  const page = () => fetch(`${root()}/${built.revision.revisionId}/html`);
  const bytes = Buffer.from(await (await page()).arrayBuffer()), html = bytes.toString();
  assert.equal(sha(bytes), built.revision.htmlSha256); noIdentity(html); noIdentity(JSON.stringify(built));
  for (let index = 1; index <= 17; index++) assert.match(html, new RegExp(`id="I${String(index).padStart(2, '0')}"`));
  assert.match(html, /Chưa đủ bằng chứng/); assert.match(html, /Chưa mã hóa nội dung/);
  assert.match(html, /Exact synthetic evidence\./); assert.match(html, /Nguồn có trường sao nhưng thiếu giá trị/);
  assert.match(html, /nguồn không có số sao/); assert.match(html, /Nguồn không có phần chữ/);
  assert.match(html, /Phần chữ không đọc được/); assert.match(html, /S05/);
  assert.equal(html.includes('data-narrative-value='), false, 'source inventory is not an inferred finding');
  if (literal) { assert.match(html, /Trùng chữ không xác minh cùng tác giả/); assert.match(html, /Số sao không tự chuyển thành khen hoặc chê/); }
  const row = f.db.prepare('SELECT * FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { input_sha256: string; metric_package_id: null; profile_sha256: null; platforms: null };
  assert.equal(row.metric_package_id, null); assert.equal(row.profile_sha256, null); assert.equal(row.platforms, null);
  const record = JSON.parse((await f.artifacts.read(row.input_sha256)).toString()); noIdentity(JSON.stringify(record));
  assert.equal(record.input.contractVersion, 'insight-reader-input-v3');
  assert.equal(record.input.sourceReportSha256, sha(f.report.bytes)); assert.equal(record.input.semanticSha256, f.report.versionId);
  assert.deepEqual(record.input.scope, { keyword: f.input.start.keyword, definition: f.input.scope.definition, requestedPeriod: { startDate: f.input.start.requestedPeriod.startDate, endDate: f.input.start.requestedPeriod.endDate } });
  assert.deepEqual(record.input.retainedMethods.find((r: { kind: string }) => r.kind === 'PRIVATE_CORPUS'), { kind: 'PRIVATE_CORPUS', sha256: sha(canonicalJson(f.input.privateReviewCorpus)) });
  assert.ok(record.input.retainedMethods.every((r: { kind: string }) => ['PRIVATE_CORPUS', 'LITERAL', 'SOURCE_EVIDENCE'].includes(r.kind)));
  assert.equal(record.input.retainedMethods.some((r: { kind: string }) => r.kind === 'CODING'), false);
  assert.match(html, /Chưa có phương án hoặc đề xuất đã lưu đủ điều kiện trình bày/);
  assert.equal(record.input.retainedMethods.some((r: { kind: string }) => r.kind === 'LITERAL'), literal);
  assert.deepEqual((await (await fetch(root())).json()).revisions, []);
  const state = () => ({ revisions: f.db.prepare('SELECT * FROM analysis_reader_report_revisions').all(), manifests: f.db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(), decisions: f.db.prepare('SELECT * FROM analysis_reader_report_decisions').all() });
  const beforeRetry = state(); assert.equal((await post('insight', request)).status, 200); assert.deepEqual(state(), beforeRetry);
  for (const artifactSha of [row.input_sha256, built.revision.htmlSha256]) {
    const artifactPath = path.join(f.artifactRoot, 'sha256', artifactSha.slice(0, 2), artifactSha), saved = await fs.readFile(artifactPath);
    try {
      await fs.writeFile(artifactPath, 'corrupt synthetic reader artifact');
      assert.equal((await page()).status, 500); assert.equal((await post('insight', request)).status, 500); assert.deepEqual(state(), beforeRetry);
    } finally { await fs.writeFile(artifactPath, saved); }
    assert.deepEqual(Buffer.from(await (await page()).arrayBuffer()), bytes);
  }
  const nextResponse = await post('insight', { ...request, requestKey: randomUUID() }); assert.equal(nextResponse.status, 201);
  const next = await nextResponse.json() as ResearchAutomationReaderBuildReceiptV2;
  assert.equal(next.revision.revisionNumber, 2); assert.equal(next.revision.htmlSha256, built.revision.htmlSha256);
  const decision = { contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(), revisionId: next.revision.revisionId,
    htmlSha256: next.revision.htmlSha256, decision: 'APPROVED', reason: null };
  assert.equal((await post('decisions/v2', { ...decision, revisionId: built.revision.revisionId })).status, 409);
  assert.equal((await post('decisions/v2', { ...decision, reportKind: 'MARKET' })).status, 409);
  assert.equal((await post('decisions/v2', { ...decision, htmlSha256: '0'.repeat(64) })).status, 409);
  // Mutating task-owned upstream bytes cannot invalidate immutable saved reader
  // reads, history or decisions; fresh builds/retries must still verify source.
  for (const upstream of [f.report.versionId, f.semantic.privateReviewCorpus.corpus.artifactSha256]) {
    const artifactPath = path.join(f.artifactRoot, 'sha256', upstream.slice(0, 2), upstream), saved = await fs.readFile(artifactPath), before = state();
    try {
      await fs.writeFile(artifactPath, 'corrupt synthetic source');
      assert.deepEqual(Buffer.from(await (await page()).arrayBuffer()), bytes);
      const list = await (await fetch(`${root()}/v2`)).json(); noIdentity(JSON.stringify(list)); assert.equal(list.revisions.length, 2);
      assert.deepEqual(state(), before);
      assert.equal((await post('insight', { ...request, requestKey: randomUUID() })).status, 500);
      assert.equal((await post('insight', request)).status, 500); assert.deepEqual(state(), before);
      if (upstream === f.report.versionId) assert.equal((await post('decisions/v2', decision)).status, 201);
    } finally { await fs.writeFile(artifactPath, saved); }
  }
  assert.equal((await post('decisions/v2', decision)).status, 200);
  assert.equal((await post('decisions/v2', { ...decision, decision: 'REJECTED' })).status, 409);
  assert.equal((await post('insight', { ...request, requestKey: randomUUID() })).status, 409);
  assert.equal(providerCalls, 0); assert.equal(f.calls.length, calls);
  assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId), f.report);
  const identity = { workspaceId, runId, draftPairId: f.pair.pairId, semanticSha256: f.report.versionId, sourceReportSha256: sha(f.report.bytes),
    frozenStartSha256: sha(canonicalJson(f.input.start)), frozenScopeSha256: sha(canonicalJson(f.input.scope)), sourceRendererVersion: 'automation-report-kit-v22' as const };
  const { privateReviewCorpus: _private, ...withoutPrivate } = f.input;
  const composed = prepareInsightReaderBuild(identity, f.input);
  assert.equal(composed.page.findings.findings.length, 0);
  assert.equal(composed.page.sections.some(s => s.id === 'I14' || s.id === 'I15'), false);
  assert.throws(() => prepareInsightReaderBuild(identity, withoutPrivate), /source-only/);
  assert.throws(() => prepareInsightReaderBuild(identity, { ...f.input, reviewCorpus: {} as never }), /source-only/);
  assert.throws(() => prepareInsightReaderBuild({ ...identity, sourceRendererVersion: 'automation-report-kit-v21' }, f.input), /source-only/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { insightReaderFixture, readerRunId, readerWorkspaceId, readerOwner } from '../helpers/insight-reader-fixture.js';
import type { ResearchAutomationReaderBuildReceiptV2, ResearchAutomationReaderRevisionListV2 } from '../../contracts/api/research-automation-reader-report-api.generated.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

for (const default21 of [false, true]) test(`authenticated OWNER Insight${default21 ? '21' : '19'} build binds exact methods, retains HTML and immutable kind-specific decisions without Metric or providers`, async t => {
  const f = await insightReaderFixture(t, default21);
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, token = 'synthetic-insight-reader-owner-token-123456-abcdefghijklmnopqrstuvwxyz';
  let providerCalls = 0;
  const api = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin: base,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: base, actorId: readerOwner.actorId } },
    { now: () => Date.now(), sleep: async () => {}, fetch: async () => { providerCalls++; throw new Error('Reader must never dispatch providers'); } });
  const server = http.createServer(api.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await api.close(); });
  const root = (prefix = 'api', wid = readerWorkspaceId, rid = readerRunId) => `${base}/${prefix}/workspaces/${wid}/research-automation/runs/${rid}/reader-reports`;
  const post = (action: string, body: unknown, options: { authorization?: boolean; origin?: string; wid?: string; rid?: string } = {}) => fetch(`${root('owner-api', options.wid, options.rid)}/${action}`, {
    method: 'POST', headers: { Origin: options.origin ?? base, ...(options.authorization === false ? {} : { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const request = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: f.pair.pairId, semanticSha256: f.report.versionId };
  assert.equal((await post('insight', request, { authorization: false })).status, 401);
  assert.equal((await post('insight', request, { origin: 'http://127.0.0.1:1' })).status, 403);
  assert.equal((await post('insight', { ...request, metricPackageId: randomUUID() })).status, 400);
  assert.equal((await post('insight', { ...request, reportKind: 'MARKET' })).status, 400);
  assert.equal((await post('insight', request, { wid: randomUUID() })).status, 404);
  assert.equal((await post('insight', request, { rid: randomUUID() })).status, 404);
  assert.equal((await post('insight', { ...request, draftPairId: '0'.repeat(64) })).status, 404);
  assert.equal((await post('insight', { ...request, semanticSha256: '0'.repeat(64) })).status, 400);
  const result = await post('insight', request);
  assert.equal(result.status, 201, await result.clone().text());
  const built = await result.json() as ResearchAutomationReaderBuildReceiptV2;
  assert.equal(built.revision.reportKind, 'INSIGHT'); assert.equal(built.revision.state, 'PENDING_OWNER_REVIEW');
  assert.equal(built.revision.builderVersion, default21 ? 'reader-report-insight-v2' : 'reader-report-insight-v1');
  const getPage = (id: string) => fetch(`${root()}/${id}/html`);
  const page = await getPage(built.revision.revisionId);
  assert.equal(page.status, 200); assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(page.headers.get('content-security-policy')!, /default-src 'none'/);
  const bytes = new Uint8Array(await page.arrayBuffer()), html = Buffer.from(bytes).toString();
  assert.equal(sha(bytes), built.revision.htmlSha256);
  for (let index = 1; index <= 17; index++) assert.match(html, new RegExp(`id="I${String(index).padStart(2, '0')}"`));
  assert.match(html, /Synthetic native listing only/); assert.match(html, /Nguồn có trường sao nhưng thiếu giá trị/);
  assert.match(html, /Trùng chữ không xác minh cùng tác giả/);
  const row = f.db.prepare('SELECT input_sha256,metric_package_id,profile_sha256,platforms FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { input_sha256: string; metric_package_id: null; profile_sha256: null; platforms: null };
  assert.equal(row.metric_package_id, null); assert.equal(row.profile_sha256, null); assert.equal(row.platforms, null);
  const record = JSON.parse((await f.artifacts.read(row.input_sha256)).toString());
  assert.equal(record.input.semanticSha256, f.report.versionId); assert.equal(record.input.sourceReportSha256, sha(f.report.bytes));
  assert.equal(record.input.scope.keyword, f.input.start.keyword); assert.equal(record.input.scope.definition, f.input.scope.definition);
  assert.ok(record.input.retainedMethods.some((method: { kind: string }) => method.kind === 'LITERAL'));
  assert.deepEqual((await (await fetch(root())).json()).revisions, [], 'list-v1 stays Market-only');
  assert.equal((await post('insight', request)).status, 200);
  // The saved reader envelope and HTML both authenticate on GET and exact
  // retries. Damage only task-owned fixture files and restore their exact bytes.
  for (const artifactSha of [row.input_sha256, built.revision.htmlSha256]) {
    const retainedPath = path.join(f.artifactRoot, 'sha256', artifactSha.slice(0, 2), artifactSha);
    const saved = await fs.readFile(retainedPath);
    const state = () => ({ revisions: f.db.prepare('SELECT * FROM analysis_reader_report_revisions').all(),
      manifests: f.db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(),
      decisions: f.db.prepare('SELECT * FROM analysis_reader_report_decisions').all() });
    const priorState = state(), priorCalls = f.calls(), priorModels = f.modelCalls();
    try {
      await fs.writeFile(retainedPath, 'synthetic damaged reader artifact');
      assert.equal((await getPage(built.revision.revisionId)).status, 500);
      assert.equal((await post('insight', request)).status, 500);
      assert.deepEqual(state(), priorState); assert.equal(f.calls(), priorCalls); assert.equal(f.modelCalls(), priorModels);
      const conflicting = { ...request, draftPairId: f.literalPair.pairId, semanticSha256: f.literalReport.versionId };
      if (default21) assert.equal((await post('insight', conflicting)).status, 409, 'request conflict precedes retained-artifact read');
    } finally { await fs.writeFile(retainedPath, saved); }
    assert.deepEqual(new Uint8Array(await (await getPage(built.revision.revisionId)).arrayBuffer()), bytes);
    assert.equal((await post('insight', request)).status, 200);
  }
  const secondResponse = await post('insight', { ...request, requestKey: randomUUID() });
  assert.equal(secondResponse.status, 201, await secondResponse.clone().text());
  const second = await secondResponse.json() as ResearchAutomationReaderBuildReceiptV2;
  assert.equal(second.revision.revisionNumber, 2); assert.equal(second.revision.htmlSha256, built.revision.htmlSha256);
  const list = await (await fetch(`${root()}/v2`)).json() as ResearchAutomationReaderRevisionListV2;
  assert.deepEqual(list.revisions.map(row => row.state), ['SUPERSEDED', 'PENDING_OWNER_REVIEW']);
  const decision = { contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(), revisionId: second.revision.revisionId,
    htmlSha256: second.revision.htmlSha256, decision: 'APPROVED', reason: null };
  assert.equal((await post('decisions/v2', { ...decision, revisionId: built.revision.revisionId })).status, 409);
  assert.equal((await post('decisions/v2', { ...decision, reportKind: 'MARKET' })).status, 409);
  assert.equal((await post('decisions/v2', { ...decision, htmlSha256: '0'.repeat(64) })).status, 409);
  assert.equal((await post('decisions/v2', decision)).status, 201);
  assert.equal((await post('decisions/v2', decision)).status, 200);
  assert.equal((await post('decisions/v2', { ...decision, decision: 'REJECTED' })).status, 409);
  assert.equal((await post('insight', { ...request, requestKey: randomUUID() })).status, 409);
  // Immutable reads only: retained source files are not consulted after build.
  const manifestsBefore = f.db.prepare('SELECT count(*) n FROM artifact_manifests').get();
  assert.deepEqual(new Uint8Array(await (await getPage(built.revision.revisionId)).arrayBuffer()), bytes);
  assert.deepEqual(f.db.prepare('SELECT count(*) n FROM artifact_manifests').get(), manifestsBefore);
  assert.equal(providerCalls, 0); assert.equal(f.modelCalls(), default21 ? 1 : 0);
  assert.deepEqual(await f.service.readReport(readerWorkspaceId, readerRunId, 'INSIGHT', false, f.literalPair.pairId), f.literalReport);
});

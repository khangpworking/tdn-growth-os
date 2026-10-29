import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import { cihFixture, statement, handoff, expectedInsight, campaignContent, typed, lockRequest, rows, inventory, id, at, fullSentence } from '../helpers/content-insight-handoff-fixture.js';
import { locked, lockId, workspaceId } from '../helpers/content-insight-handoff-b10.js';
import { readerWorkspaceId, readerRunId, readerOwner } from '../helpers/insight-reader-fixture.js';
import { InsightReportStatementError } from '../../src/modules/analysis/insight-report-statements.js';
import { ContentInsightService, ContentInsightReferenceError, ContentInsightConflictError } from '../../src/modules/flow/content-insight-service.js';
import { validateContentInsightRevisionRequest } from '../../src/modules/flow/validation.js';
import { validateContentInsightFromReportRequest } from '../../src/modules/flow/insight-report-validation.js';
import { canonicalBytes } from '../../src/modules/flow/content-artifacts.js';
import { applyMigrations } from '../../src/platform/db/migrations.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';

const origin = 'http://127.0.0.1:5173';
const token = 'synthetic-owner-token-at-least-32-characters';
async function api(t: TestContext, f: Awaited<ReturnType<typeof cihFixture>>) {
  const owner = openContentOwnerApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:synthetic', gateway: f.gateway });
  const read = openContentReadApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot });
  const servers = [http.createServer(owner.handler), http.createServer(read.handler)];
  for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } owner.close(); read.close(); });
  const base = (n: number) => `http://127.0.0.1:${(servers[n]!.address() as AddressInfo).port}`;
  return { get: (url: string) => fetch(base(1) + url), post: (url: string, body: unknown, auth = true, method = 'POST') => fetch(base(0) + url, { method, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), origin, 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }) };
}
const route = (campaignId: string) => `/owner-api/content/campaigns/${campaignId}/insight/from-report`;
const revisionRoute = (campaignId: string) => `/owner-api/content/campaigns/${campaignId}/insight/revisions`;
const detailRoute = (campaignId: string) => `/api/content/campaigns/${campaignId}/insight`;

test('CIH-Q1 required business groups, stages, confidence and UUIDs reject without retention', async t => {
  const f = await cihFixture(t), valid = statement(f.revisionId);
  for (const field of ['purchaseStage', 'customer', 'hiddenTruth', 'motivation', 'conflict', 'insight', 'evidence', 'confidence']) {
    const bad = { ...valid } as Record<string, unknown>; delete bad[field];
    assert.throws(() => f.statements.retainStatement(bad), new RegExp(field));
  }
  for (const patch of [{ conflict: ' \n ' }, { customer: '' }, { purchaseStage: 'UNKNOWN' }, { confidence: { level: 'HIGH', hypothesis: false } }, { confidence: { level: 'FAIR', hypothesis: 'true' } }, { statementId: 'bad' }, { revisionId: 'bad' }])
    assert.throws(() => f.statements.retainStatement({ ...valid, ...patch }), InsightReportStatementError);
  assert.deepEqual(rows(f.db, 'analysis_insight_report_statements'), []);
  assert.deepEqual(f.statements.retainStatement(valid), valid);
});

test('CIH-Q2 optional 3C accepts absent/null/full and refuses partial/free text', async t => {
  const f = await cihFixture(t);
  for (const threeC of [undefined, null, { customer: 'C', brand: 'B', category: 'K' }]) {
    const s = statement(f.revisionId); if (threeC === undefined) delete s.threeC; else s.threeC = threeC;
    assert.deepEqual(f.statements.retainStatement(s), s);
  }
  const before = rows(f.db, 'analysis_insight_report_statements');
  for (const threeC of ['synthetic text', { customer: 'C', brand: 'B' }, { customer: 'C', brand: ' ', category: 'K' }]) assert.throws(() => f.statements.retainStatement({ ...statement(f.revisionId), threeC }), /threeC/);
  assert.deepEqual(rows(f.db, 'analysis_insight_report_statements'), before);
});

test('CIH-Q3 closed objects reject unknown keys at statement/source/request boundaries', async t => {
  const f = await cihFixture(t), s = statement(f.revisionId);
  for (const bad of [{ ...s, extra: 1 }, { ...s, confidence: { ...s.confidence, extra: 1 } }, { ...s, threeC: { ...s.threeC, extra: 1 } }, { ...s, evidence: [{ platform: 'shopee', count: 1, extra: 1 }] }]) assert.throws(() => f.statements.retainStatement(bad), /additional properties/);
  const request = { contractVersion: '1.0.0', campaignId: id(3), expectedVersion: 0, insight: expectedInsight(s) };
  validateContentInsightRevisionRequest(request); validateContentInsightFromReportRequest(handoff(s));
  for (const source of [{ ...request.insight.source, extra: 1 }, { ...request.insight.source, snapshot: { ...s, extra: 1 } }]) assert.throws(() => validateContentInsightRevisionRequest({ ...request, insight: { ...request.insight, source } }));
  assert.throws(() => validateContentInsightFromReportRequest({ ...handoff(s), extra: 1 }), /additional properties/);
  assert.deepEqual(rows(f.db, 'analysis_insight_report_statements'), []);
});

test('CIH-Q4 numeric separate-platform evidence preserves missing N and rejects copied/free text', async t => {
  const f = await cihFixture(t), s = statement(f.revisionId);
  for (const evidence of [['Synthetic copied review'], [{ platform: 'shopee', count: 1, text: 'Synthetic copied review' }], [{ platform: 'tiktok', count: 1, quote: 'Synthetic quote' }], [{ platform: 'shopee', count: 1, summary: 'Synthetic text' }], [{ platform: 'shopee,tiktok', count: 2 }], [{ platform: 'shopee', count: 2, denominator: 1 }], [], [{ platform: 'shopee', count: -1 }], [{ platform: 'shopee', count: 1.5 }], [{ platform: 'shopee', count: Number.MAX_SAFE_INTEGER + 1 }]]) {
    assert.throws(() => f.statements.retainStatement({ ...s, evidence }), /evidence|Evidence/); assert.deepEqual(rows(f.db, 'analysis_insight_report_statements'), []);
  }
  assert.deepEqual(f.statements.retainStatement(s).evidence, [{ platform: 'shopee', count: 7, denominator: 19 }, { platform: 'tiktok', count: 3 }]);
  assert.deepEqual(f.statements.retainStatement(statement(f.revisionId, { evidence: [{ platform: 'tiktok', count: 0, denominator: 0 }] })).evidence, [{ platform: 'tiktok', count: 0, denominator: 0 }]);
});

test('CIH-Q5 statement FK/kind, identity, exact retry and immutable storage', async t => {
  const f = await cihFixture(t), s = statement(f.revisionId);
  assert.throws(() => f.statements.retainStatement({ ...s, revisionId: randomUUID() }), /insight_statement_requires_insight_revision/);
  const market = await f.appendReader({ kind: 'MARKET' });
  assert.throws(() => f.statements.retainStatement({ ...s, revisionId: market }), /insight_statement_requires_insight_revision/);
  f.statements.retainStatement(s); const before = f.db.prepare('SELECT total_changes() n').get();
  f.statements.retainStatement(s); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  assert.throws(() => f.statements.retainStatement({ ...s, conflict: 'Changed content' }), /different content/);
  assert.throws(() => f.db.prepare('UPDATE analysis_insight_report_statements SET payload_json=payload_json').run(), /immutable_insight_report_statement/);
  assert.throws(() => f.db.prepare('DELETE FROM analysis_insight_report_statements').run(), /immutable_insight_report_statement/);
  assert.deepEqual(f.db.pragma('foreign_key_check'), []);
});

test('CIH-Q6 authoritative report source refuses forged snapshots/identities and keeps TYPED valid', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign();
  await f.insights.receiveReport(c.campaignId, handoff(s));
  assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight.source, expectedInsight(s).source);
  for (const source of [{ ...expectedInsight(s).source, snapshot: { ...s, hiddenTruth: 'Forged hidden truth' } }, { ...expectedInsight(s).source, statementId: randomUUID() }, { ...expectedInsight(s).source, revisionId: randomUUID() }])
    await assert.rejects(f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 1, insight: { ...expectedInsight(s), source } }), ContentInsightReferenceError);
  const typedCampaign = await f.createCampaign(); await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: typedCampaign.campaignId, expectedVersion: 0, insight: typed });
  assert.deepEqual((await f.insights.readInsight(typedCampaign.campaignId)).insight.source, { kind: 'TYPED' });
});

test('CIH-Q7 populated 0061 upgrade preserves service-created revisions, locks, decisions and artifact bytes', async t => {
  const f = await cihFixture(t, { pre62: true });
  await f.decide(f.revisionId, 'APPROVED');
  const c = await f.createCampaign(); await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 0, insight: typed });
  await f.insights.lockInsight(lockRequest(c.campaignId));
  const stpCampaign = await f.createCampaign(undefined, { researchProductWorkspaceId: workspaceId });
  const stpInsights = new ContentInsightService({ db: f.db, artifactStore: f.artifacts, campaigns: f.campaigns, lockedStpReader: { async readVerifiedLockedStp() { return locked(); } } });
  const stpContent = { ...typed, source: { kind: 'STP', lockedStpId: lockId } };
  await stpInsights.reviseInsight({ contractVersion: '1.0.0', campaignId: stpCampaign.campaignId, expectedVersion: 0, insight: stpContent });
  const tables = ['flow_content_campaigns', 'flow_content_campaign_revisions', 'flow_content_insight_revisions', 'flow_content_insight_locks', 'analysis_reader_report_revisions', 'analysis_reader_report_decisions', 'artifact_manifests'];
  const before = tables.map(table => rows(f.db, table)); const files = inventory(f.artifactRoot).map(p => [p, fs.readFileSync(p)] as const);
  f.db.defaultSafeIntegers(false);
  assert.deepEqual(applyMigrations(f.db).applied, [62]);
  f.db.defaultSafeIntegers(true);
  assert.deepEqual(tables.map(table => rows(f.db, table)), before);
  for (const [p, bytes] of files) assert.deepEqual(fs.readFileSync(p), bytes);
  assert.deepEqual(f.db.pragma('foreign_key_check'), []); assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight, typed); assert.ok(await f.insights.readLock(c.campaignId)); assert.deepEqual((await stpInsights.readInsight(stpCampaign.campaignId)).insight, stpContent);
  const insert = f.db.prepare('INSERT INTO flow_content_insight_revisions VALUES (?,?,?,?,?,?,?)');
  const sha = (rows(f.db, 'flow_content_insight_revisions')[0] as { insight_artifact_sha256: string }).insight_artifact_sha256;
  assert.throws(() => insert.run(c.campaignId, 2, 'TYPED', null, 'a'.repeat(64), sha, at), /flow_content_insight_locked/);
  const open = await f.createCampaign();
  assert.throws(() => insert.run(open.campaignId, 2, 'TYPED', null, 'a'.repeat(64), sha, at), /not_sequential/);
  assert.throws(() => insert.run(open.campaignId, 1, 'INSIGHT_REPORT', id(8), 'a'.repeat(64), sha, at), /CHECK constraint/);
  assert.throws(() => insert.run(open.campaignId, 1, 'STP', null, 'a'.repeat(64), sha, at), /CHECK constraint/);
  for (const table of ['flow_content_insight_revisions', 'flow_content_insight_locks', 'analysis_reader_report_decisions']) {
    const key = Object.keys(rows(f.db, table)[0] as object)[0]!;
    assert.throws(() => f.db.prepare(`UPDATE ${table} SET ${key}=${key}`).run(), /immutable/); assert.throws(() => f.db.prepare(`DELETE FROM ${table}`).run(), /immutable/);
  }
});

test('CIH-Q8 Box 2 exact-ID interface returns only the selected retained statement', async t => {
  const f = await cihFixture(t), s = await f.approved(); const sibling = statement(f.revisionId); f.statements.retainStatement(sibling);
  assert.deepEqual(await f.query.readApprovedStatement(s.revisionId, s.statementId), s);
  assert.equal(await f.query.readApprovedStatement(s.revisionId, randomUUID()), undefined);
  assert.equal(await f.query.readApprovedStatement(randomUUID(), s.statementId), undefined);
  assert.deepEqual(new Set((await f.query.readApprovedStatements(s.revisionId))!.statements.map(v => v.statementId)), new Set([s.statementId, sibling.statementId]));
});

test('CIH-Q9 report GET contracts validate identity/status and never mutate state', async t => {
  const f = await cihFixture(t), s = await f.approved(), a = await api(t, f);
  const before = rows(f.db, 'artifact_manifests'), statements = rows(f.db, 'analysis_insight_report_statements'), files = inventory(f.artifactRoot);
  const list = await a.get('/api/content/insight-reports'); assert.equal(list.status, 200); const value = await list.json() as any;
  assert.equal(value.contractVersion, '1.0.0'); assert.deepEqual(value.reports.map((r: any) => r.revisionId), [s.revisionId]);
  const detail = await (await a.get(`/api/content/insight-reports/${s.revisionId}/statements`)).json() as any; assert.deepEqual(detail.statements, [s]);
  assert.equal((await a.get('/api/content/insight-reports/not-uuid/statements')).status, 400);
  assert.equal((await a.get(`/api/content/insight-reports/${randomUUID()}/statements`)).status, 404);
  assert.equal((await a.get(`/api/reports/${s.revisionId}/versions/1`)).status, 404);
  assert.deepEqual(rows(f.db, 'artifact_manifests'), before); assert.deepEqual(rows(f.db, 'analysis_insight_report_statements'), statements); assert.deepEqual(inventory(f.artifactRoot), files);
});

test('CIH-Q10 authenticated closed single-selection POST and general-route bypass guard', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign(), a = await api(t, f);
  const sibling = statement(s.revisionId); f.statements.retainStatement(sibling);
  for (const [body, status, auth, method] of [[handoff(s), 401, false, 'POST'], [{ ...handoff(s), extra: 1 }, 400, true, 'POST'], [{ ...handoff(s), statementId: [s.statementId, sibling.statementId] }, 400, true, 'POST'], [handoff(s), 405, true, 'GET'], [handoff(s, 4), 409, true, 'POST']] as const) {
    assert.equal((await a.post(route(c.campaignId), body, auth, method)).status, status); assert.equal(f.insights.latestVersion(c.campaignId), 0);
  }
  assert.equal((await a.post(revisionRoute(c.campaignId), { contractVersion: '1.0.0', expectedVersion: 0, insight: expectedInsight(s) })).status, 409);
  assert.equal((await a.post(route(c.campaignId), handoff(s))).status, 201); assert.equal(f.insights.isLocked(c.campaignId), false);
});

test('CIH-Q11 full campaign form is mandatory and create/handoff returns both receipts atomically', async t => {
  const f = await cihFixture(t), s = await f.approved(), a = await api(t, f);
  const body = { contractVersion: '1.0.0', campaignKey: 'new-cih', brandId: id(1), campaign: campaignContent, revisionId: s.revisionId, statementId: s.statementId };
  for (const campaign of [{ name: 'Only a name' }, { ...campaignContent, objective: '' }, { ...campaignContent, items: [] }]) assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', { ...body, campaign })).status, 400);
  const { brandId: _brand, ...missingBrand } = body;
  assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', missingBrand)).status, 400);
  assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', { ...body, brandId: randomUUID() })).status, 404);
  const pendingRevision = await f.appendReader(); const pendingStatement = statement(pendingRevision); f.statements.retainStatement(pendingStatement);
  assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', { ...body, revisionId: pendingRevision, statementId: pendingStatement.statementId })).status, 400);
  assert.deepEqual(rows(f.db, 'flow_content_campaigns'), []);
  assert.deepEqual(rows(f.db, 'flow_content_insight_revisions'), []);
  const response = await a.post('/owner-api/content/campaigns/from-insight-report', body); assert.equal(response.status, 201); const receipt = await response.json() as any;
  assert.equal(receipt.version, 1); assert.equal(receipt.insight.version, 1); assert.equal(receipt.insight.campaignId, receipt.campaignId);
  assert.deepEqual((await f.insights.readInsight(receipt.campaignId)).insight, expectedInsight(s));
  assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', body)).status, 200); assert.equal(rows(f.db, 'flow_content_campaigns').length, 1);
  assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', { ...body, campaign: { ...campaignContent, name: 'Different' } })).status, 409);
});

test('CIH-Q12 feature reads on a statement-empty runtime seed nothing and dispatch no AI', async t => {
  const f = await cihFixture(t), a = await api(t, f); const before = [rows(f.db, 'flow_content_campaigns'), rows(f.db, 'artifact_manifests'), inventory(f.artifactRoot)];
  assert.deepEqual(await (await a.get('/api/content/insight-reports')).json(), { contractVersion: '1.0.0', reports: [] });
  assert.equal((await a.get(`/api/content/insight-reports/${f.revisionId}/statements`)).status, 404);
  assert.deepEqual(rows(f.db, 'analysis_insight_report_statements'), []); assert.deepEqual([rows(f.db, 'flow_content_campaigns'), rows(f.db, 'artifact_manifests'), inventory(f.artifactRoot)], before); assert.deepEqual(f.gateway.calls, []);
});

test('CIH-Q13 R-C02 approved-only exact revision eligibility excludes pending/rejected/Market/empty', async t => {
  const f = await cihFixture(t); const eligible = await f.appendReader(); await f.decide(eligible, 'APPROVED'); const first = statement(eligible); f.statements.retainStatement(first);
  const rejected = await f.appendReader(); f.statements.retainStatement(statement(rejected)); await f.decide(rejected, 'REJECTED');
  const superseded = f.revisionId; f.statements.retainStatement(statement(superseded));
  await f.service.buildInsightReaderReport(readerWorkspaceId, readerRunId, { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: f.pair.pairId, semanticSha256: f.report.versionId }, readerOwner);
  const pending = await f.appendReader(); f.statements.retainStatement(statement(pending));
  const empty = await f.appendReader(); await f.decide(empty, 'APPROVED');
  const market = await f.appendReader({ kind: 'MARKET' }); await f.decide(market, 'APPROVED');
  assert.deepEqual((await f.query.listApprovedReports()).map(r => r.revisionId), [first.revisionId]);
  for (const excluded of [rejected, superseded, pending, empty, market]) assert.equal(await f.query.readApprovedStatements(excluded), undefined, excluded);
});

test('CIH-Q14 direct IDs cannot bypass undecided/rejected approval or spoof it in request', async t => {
  const f = await cihFixture(t), a = await api(t, f), c = await f.createCampaign();
  const pending = statement(f.revisionId); f.statements.retainStatement(pending);
  for (const decision of [null, 'REJECTED'] as const) {
    if (decision) await f.decide(f.revisionId, decision);
    assert.equal((await a.get(`/api/content/insight-reports/${pending.revisionId}/statements`)).status, 404);
    assert.equal((await a.post(route(c.campaignId), handoff(pending))).status, 400);
    assert.equal((await a.post(revisionRoute(c.campaignId), { contractVersion: '1.0.0', expectedVersion: 0, insight: expectedInsight(pending) })).status, 400);
    assert.equal(f.insights.latestVersion(c.campaignId), 0);
  }
  assert.equal((await a.post(route(c.campaignId), { ...handoff(pending), approved: true })).status, 400);
  const revision = await f.appendReader(); await f.decide(revision, 'APPROVED'); const s = statement(revision); f.statements.retainStatement(s);
  assert.equal((await a.post(route(c.campaignId), handoff(s))).status, 201);
});

test('CIH-Q16 report order uses frozen creation time, revision, UUID ties and scope', async t => {
  const f = await cihFixture(t); const first = await f.approved();
  const second = await f.appendReader({ revisionCount: 2, keyword: 'Same keyword', createdAt: '2026-10-09T00:00:00.000Z' }); await f.decide(second, 'APPROVED'); f.statements.retainStatement(statement(second));
  const third = await f.appendReader({ revisionCount: 3, keyword: 'Same keyword', createdAt: '2026-10-09T00:00:00.000Z' }); await f.decide(third, 'APPROVED'); f.statements.retainStatement(statement(third));
  const other = await f.appendReader({ runId: id(70), keyword: 'Same keyword', createdAt: '2026-10-09T00:00:00.000Z' }); await f.decide(other, 'APPROVED'); f.statements.retainStatement(statement(other));
  const tied = await f.appendReader({ runId: id(71), keyword: 'Same keyword', createdAt: '2026-10-09T00:00:00.000Z' }); await f.decide(tied, 'APPROVED'); f.statements.retainStatement(statement(tied));
  assert.deepEqual((await f.query.listApprovedReports()).map(r => r.revisionId), [third, second, ...[other, tied].sort(), first.revisionId]);
  const list = await f.query.listApprovedReports(); assert.equal(list[0]!.keyword, 'Same keyword'); assert.deepEqual(list.at(-1)!.period, { startDate: '2025-10-01', endDate: '2026-09-30' });
});

test('CIH-Q17 NONE is refused by handoff and general revision while WEAK remains selectable', async t => {
  const f = await cihFixture(t), none = await f.approved({ confidence: { level: 'NONE', hypothesis: false } }), c = await f.createCampaign();
  await assert.rejects(f.insights.receiveReport(c.campaignId, handoff(none)), /Approved selectable/);
  await assert.rejects(f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 0, insight: expectedInsight(none) }), /Approved selectable/);
  assert.equal(f.insights.latestVersion(c.campaignId), 0);
  const weak = statement(f.revisionId); f.statements.retainStatement(weak); await f.insights.receiveReport(c.campaignId, handoff(weak)); assert.equal(f.insights.latestVersion(c.campaignId), 1);
});

test('CIH-Q18 weak/hypothesis provenance survives save/reload/edit and cannot be upgraded', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign(); await f.insights.receiveReport(c.campaignId, handoff(s));
  const edited = { ...expectedInsight(s), insight: 'They choose a revised routine.' };
  await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 1, insight: edited });
  assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight, edited);
  await assert.rejects(f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 2, insight: { ...edited, source: { ...edited.source, snapshot: { ...s, confidence: { level: 'CERTAIN', hypothesis: false } } } } }), /snapshot differs/);
});

test('CIH-Q20 push/pull HTTP handoffs map independently expected drafts without side effects', async t => {
  const f = await cihFixture(t), s = await f.approved(), a = await api(t, f), campaigns = [await f.createCampaign(), await f.createCampaign()];
  const before = ['analysis_reader_report_decisions', 'flow_content_ideas', 'flow_content_ai_attempts', 'flow_content_campaign_revisions'].map(table => rows(f.db, table));
  for (const c of campaigns) {
    assert.equal((await a.post(route(c.campaignId), handoff(s))).status, 201);
    assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight, expectedInsight(s)); assert.equal(await f.insights.readLock(c.campaignId), undefined);
  }
  assert.deepEqual(['analysis_reader_report_decisions', 'flow_content_ideas', 'flow_content_ai_attempts', 'flow_content_campaign_revisions'].map(table => rows(f.db, table)), before); assert.deepEqual(f.gateway.calls, []);
});

test('CIH-Q21 full-form new-campaign handoff rolls back a failure after campaign insert', async t => {
  const f = await cihFixture(t), s = await f.approved(), a = await api(t, f);
  const body = { contractVersion: '1.0.0', campaignKey: 'rollback-cih', brandId: id(1), campaign: campaignContent, revisionId: s.revisionId, statementId: s.statementId };
  f.db.exec("CREATE TRIGGER cih_test_fail_insight BEFORE INSERT ON flow_content_insight_revisions BEGIN SELECT RAISE(ABORT,'synthetic_downstream_failure'); END");
  const before = [rows(f.db, 'flow_content_campaigns'), rows(f.db, 'flow_content_campaign_revisions'), rows(f.db, 'artifact_manifests'), inventory(f.artifactRoot)];
  assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', body)).status, 500);
  assert.deepEqual([rows(f.db, 'flow_content_campaigns'), rows(f.db, 'flow_content_campaign_revisions'), rows(f.db, 'artifact_manifests'), inventory(f.artifactRoot)], before);
  assert.deepEqual(rows(f.db, 'flow_content_insight_revisions'), []);
  f.db.exec('DROP TRIGGER cih_test_fail_insight'); assert.equal((await a.post('/owner-api/content/campaigns/from-insight-report', body)).status, 201);
});

test('CIH-Q22 R-C05 maps customer/conflict/full insight distinctly and freezes all nine groups', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign();
  await f.insights.receiveReport(c.campaignId, handoff(s));
  const saved = (await f.insights.readInsight(c.campaignId)).insight;
  assert.equal(saved.customer, 'Nhóm chăm sóc giả định'); assert.equal(saved.painPoint, 'Muốn uống đều, nhưng sợ táo bón'); assert.equal(saved.insight, fullSentence);
  assert.notEqual(saved.painPoint, s.motivation); assert.notEqual(saved.painPoint, s.hiddenTruth); assert.deepEqual(saved.source, expectedInsight(s).source);
});

test('CIH-Q24 saved drafts require confirmation and append rather than overwrite', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign();
  await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 0, insight: typed }); const before = await f.insights.readInsight(c.campaignId);
  await assert.rejects(f.insights.receiveReport(c.campaignId, handoff(s, 1)), /Confirm Insight replacement/); assert.deepEqual(await f.insights.readInsight(c.campaignId), before);
  await f.insights.receiveReport(c.campaignId, handoff(s, 1, true)); assert.equal(f.insights.latestVersion(c.campaignId), 2); assert.deepEqual(await f.insights.readInsight(c.campaignId, 1), before);
});

test('CIH-Q25 R-C06 locked handoffs and general-route bypass return exact 409 without mutation', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign(), a = await api(t, f);
  await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 0, insight: typed }); await f.insights.lockInsight(lockRequest(c.campaignId));
  const before = [rows(f.db, 'flow_content_insight_revisions'), rows(f.db, 'flow_content_insight_locks'), inventory(f.artifactRoot)];
  for (const url of [route(c.campaignId), revisionRoute(c.campaignId)]) {
    const body = url.endsWith('revisions') ? { contractVersion: '1.0.0', expectedVersion: 1, insight: expectedInsight(s) } : handoff(s, 1, true);
    const response = await a.post(url, body); assert.equal(response.status, 409); const error = await response.json() as any; assert.equal(error.error.message, 'Insight đã chốt, hãy tạo chiến dịch mới');
  }
  assert.deepEqual([rows(f.db, 'flow_content_insight_revisions'), rows(f.db, 'flow_content_insight_locks'), inventory(f.artifactRoot)], before);
  const open = await f.createCampaign(); assert.equal((await a.post(route(open.campaignId), handoff(s))).status, 201);
});

test('CIH-Q27 unlinked report draft locks manually without B10 and pins products/link', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign(); await f.insights.receiveReport(c.campaignId, handoff(s)); assert.equal(await f.insights.readLock(c.campaignId), undefined);
  await f.insights.lockInsight(lockRequest(c.campaignId)); assert.equal((await f.insights.readLock(c.campaignId))!.b10, undefined);
  await assert.rejects(f.campaigns.reviseCampaign({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 1, campaign: { ...campaignContent, researchProductWorkspaceId: id(99) } }), /lock/i);
  assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight.source, expectedInsight(s).source);
});

test('CIH-Q28 TYPED edits/replay remain unchanged while discovery cannot convert the source', async t => {
  const f = await cihFixture(t), c = await f.createCampaign(); await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 0, insight: typed });
  const before = canonicalBytes(await f.insights.readInsight(c.campaignId)); await f.approved(); await f.query.listApprovedReports(); assert.deepEqual(canonicalBytes(await f.insights.readInsight(c.campaignId)), before);
  await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 1, insight: { ...typed, customer: 'Edited typed customer' } }); assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight.source, { kind: 'TYPED' });
  await assert.rejects(f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 2, insight: { ...typed, source: { kind: 'STP', lockedStpId: id(90) } } }), /no research product/i);
});

test('CIH-Q29 each editable field appends with the original snapshot and rejects source edits', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign(); await f.insights.receiveReport(c.campaignId, handoff(s));
  let version = 1; const content = expectedInsight(s);
  for (const field of ['customer', 'painPoint', 'insight'] as const) { content[field] = `Edited ${field}`; await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: version++, insight: content }); assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight.source, expectedInsight(s).source); }
  await assert.rejects(f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: version, insight: { ...content, source: { ...content.source, snapshot: { ...s, customer: 'Forged original' } } } }), /snapshot differs/);
  const offline = new ContentInsightService({ db: f.db, artifactStore: f.artifacts, campaigns: f.campaigns });
  assert.deepEqual((await offline.readInsight(c.campaignId)).insight, content);
});

test('CIH-Q33 empty, approved-zero and rejected-only APIs return true empty lists; eligible twin appears', async t => {
  const f = await cihFixture(t), a = await api(t, f);
  assert.deepEqual((await (await a.get('/api/content/insight-reports')).json() as any).reports, []); await f.decide(f.revisionId, 'REJECTED'); f.statements.retainStatement(statement(f.revisionId));
  assert.deepEqual((await (await a.get('/api/content/insight-reports')).json() as any).reports, []);
  const r = await f.appendReader(); await f.decide(r, 'APPROVED'); assert.deepEqual((await (await a.get('/api/content/insight-reports')).json() as any).reports, []);
  f.statements.retainStatement(statement(r)); assert.deepEqual((await (await a.get('/api/content/insight-reports')).json() as any).reports.map((r: any) => r.revisionId), [r]);
});

test('CIH-Q34 exact retry is mutation-free; different selection/stale version/lock cannot append', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign(); const other = statement(s.revisionId); f.statements.retainStatement(other);
  const first = await f.insights.receiveReport(c.campaignId, handoff(s)); const before = rows(f.db, 'flow_content_insight_revisions');
  assert.deepEqual(await f.insights.receiveReport(c.campaignId, handoff(s)), { ...first, deduplicated: true, databaseMutations: 0 });
  await assert.rejects(f.insights.receiveReport(c.campaignId, handoff(other)), ContentInsightConflictError); await assert.rejects(f.insights.receiveReport(c.campaignId, handoff(other, 5, true)), ContentInsightConflictError);
  await f.insights.lockInsight(lockRequest(c.campaignId)); await assert.rejects(f.insights.receiveReport(c.campaignId, handoff(other, 1, true)), /Insight đã chốt/); assert.deepEqual(rows(f.db, 'flow_content_insight_revisions'), before);
});

test('CIH-Q35 complete synthetic third-person sentence is retained verbatim through handoff', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign();
  // Reader-reviewed fixture: subject “Người chăm sóc”, third-person “họ”, full
  // motivation/conflict. Counterexamples: “Tôi muốn…” and “Nhưng sợ gián đoạn”.
  await f.insights.receiveReport(c.campaignId, handoff(s)); const saved = (await f.insights.readInsight(c.campaignId)).insight;
  assert.equal(saved.insight, fullSentence); assert.notEqual(saved.insight, s.conflict); assert.notEqual(saved.insight, 'Tôi muốn duy trì thói quen.'); assert.notEqual(saved.insight, 'Nhưng sợ gián đoạn');
});

test('CIH-Q36 product/research links do not filter exact report eligibility or change source selection', async t => {
  const f = await cihFixture(t), s = await f.approved(), a = await api(t, f);
  const unlinked = await f.createCampaign(), linked = await f.createCampaign(`cih-${randomUUID()}`, { researchProductWorkspaceId: id(50) });
  for (const c of [unlinked, linked]) { const reports = await (await a.get('/api/content/insight-reports')).json() as any; assert.deepEqual(reports.reports.map((r: any) => r.revisionId), [s.revisionId]); await f.insights.receiveReport(c.campaignId, handoff(s)); assert.deepEqual((await f.insights.readInsight(c.campaignId)).insight.source, expectedInsight(s).source); }
  assert.equal(rows(f.db, 'flow_content_campaigns').length, 2); assert.deepEqual(f.gateway.calls, []);
});

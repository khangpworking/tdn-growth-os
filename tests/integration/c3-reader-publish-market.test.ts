import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { Bundle } from '../../src/modules/analysis/reader-report/bundle.js';
import { computeReaderReportData } from '../../src/modules/analysis/reader-report/build.js';
import { buildMarketReport } from '../../src/modules/analysis/reader-report/market-template.js';
import { prepareTikTokReaderBuild } from '../../src/modules/analysis/reader-report/tiktok-build-v1.js';
import { prepareShopeeReaderBuild } from '../../src/modules/analysis/reader-report/shopee-build-v1.js';
import { publishMarketRevision, type MarketPublish } from '../../src/modules/analysis/research-automation/reader-publish.js';
import { AutomationReaderReports, type ReaderDraftContext, type InsightReaderDraftContext } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

const at = '2026-10-08T00:00:00.000Z';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const metricPackageId = '44444444-4444-4444-8444-444444444444';
const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

// PR3 owns the new Market guards, family scope additions and deferred Market
// retry semantics. PR1 row 5 already interleaves Market/Insight in the same run;
// PR1's oversized-page row does not exercise the exact byte boundary.
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-c3-market-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: () => new Date(at) }).db;
  const artifactRoot = path.join(root, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  async function retain(bytes: Buffer) {
    const artifact = await artifacts.put(bytes);
    db.prepare(`INSERT OR IGNORE INTO artifact_manifests
      (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,'application/json',?,?,'1.0.0','active',?)`)
      .run(artifact.sha256, artifact.byteSize, artifact.relativePath, at, at);
    return artifact.sha256;
  }
  const sourceSha256 = await retain(Buffer.from('{"synthetic":"PR3 source"}'));
  db.prepare(`INSERT INTO analysis_research_automation_runs
    (run_id,workspace_id,revision,status,mode,keyword,period_start,period_end,reports,start_request_sha256,actor_id,created_at,updated_at)
    VALUES (?,?,1,'DRAFT_READY','CATEGORY','Synthetic','2026-01-01','2026-01-31','MARKET,INSIGHT',?,?,?,?)`)
    .run(runId, workspaceId, sourceSha256, owner.actorId, at, at);
  const sample = sync1ReaderFixture();
  const readers = new AutomationReaderReports(db, artifacts, () => new Date(at), { flint: false, rows: () => sample.rows });
  const market: ReaderDraftContext = { workspaceId, runId, draftPairId: digest('PR3 draft'), marketSemantic: {},
    metric: { packageId: metricPackageId, workbook: Buffer.from('synthetic workbook'),
      measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } } };
  const request = { contractVersion: 'reader-report-build-v1', requestKey: randomUUID(), metricPackageId,
    platforms: sample.platforms, profile: sample.profile, source: sample.source, cover: null };
  const snapshot = () => ({
    revisions: db.prepare('SELECT * FROM analysis_reader_report_revisions ORDER BY revision_id').all(),
    manifests: db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(),
    decisions: db.prepare('SELECT * FROM analysis_reader_report_decisions ORDER BY revision_id').all(),
    tiktok: db.prepare('SELECT * FROM analysis_tiktok_report_consumption ORDER BY revision_id').all(),
    shopee: db.prepare('SELECT * FROM analysis_shopee_report_consumption ORDER BY revision_id').all(),
  });
  async function marketPublish(): Promise<MarketPublish> {
    const page = await buildMarketReport(computeReaderReportData(sample), sync1Options);
    return { workspaceId, runId, actorId: owner.actorId, draftPairId: market.draftPairId,
      requestKey: request.requestKey, requestSha256: digest(canonicalJson(request)), contractVersion: request.contractVersion,
      metricPackageId, platforms: sample.platforms, profile: sample.profile, builderVersion: 'reader-report-market-v3',
      publicReviewSource: false, requireFlint: false, createdAt: at, cover: null, page,
      record: ids => ({ contractVersion: 'reader-report-build-record-v1', ...ids, workspaceId, runId,
        draftPairId: market.draftPairId, input: sample, actorId: owner.actorId, createdAt: at }) };
  }
  return { db, artifacts, artifactRoot, readers, market, request, snapshot, marketPublish, retain, sourceSha256 };
}

function conflict(code: string, message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ResearchAutomationConflictError);
    assert.equal(error.code, code); assert.equal(error.message, message); return true;
  };
}
const integrity = (message: string) => (error: unknown) => {
  assert.ok(error instanceof ResearchAutomationIntegrityError);
  assert.equal(error.message, message); return true;
};

// No public adapter path can bypass its early APPROVED check without a seam.
// Mutation control: omit the transaction's latest-APPROVED guard for Market.
test('D8 Market transaction refuses latest APPROVED without DB writes; latest REJECTED publishes', async t => {
  for (const decision of ['APPROVED', 'REJECTED'] as const) {
    const f = await fixture(t), first = await f.readers.build(f.market, f.request, owner);
    await f.readers.decide(f.market, { contractVersion: 'reader-report-decision-v1', requestKey: randomUUID(),
      revisionId: first.revision.revisionId, decision, reason: decision === 'REJECTED' ? 'Synthetic rejection' : null }, owner);
    const build = { ...await f.marketPublish(), requestKey: randomUUID() };
    const before = f.snapshot(), changes = f.db.prepare('SELECT total_changes() n').get();
    if (decision === 'APPROVED') {
      await assert.rejects(publishMarketRevision(f.db, f.artifacts, build),
        conflict('invalid_state', 'Bản đọc mới nhất đã được chủ duyệt.'));
      assert.deepEqual(f.snapshot(), before);
      assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
      assert.equal(f.db.inTransaction, false);
    } else {
      const outcome = await publishMarketRevision(f.db, f.artifacts, build);
      if (outcome.exactRetry) assert.fail('REJECTED latest must permit a new revision');
      assert.deepEqual(f.db.prepare('SELECT revision_number FROM analysis_reader_report_revisions WHERE revision_id=?')
        .get(outcome.revisionId), { revision_number: 2n });
    }
  }
});

// Mutation controls: >= rejects the control; character counting accepts +1 byte.
test('D9 Market accepts exactly 32 MiB and refuses one byte more without revisions or manifests', async t => {
  const f = await fixture(t), build = await f.marketPublish(), limit = 32 * 1024 * 1024;
  const html = build.page.html.replace('</body>', '<p>é</p></body>');
  const padding = limit - Buffer.byteLength(html);
  const chunk = `<p>${'x'.repeat(8192)}</p>`;
  const filler = chunk.repeat(Math.floor(padding / chunk.length)) + 'x'.repeat(padding % chunk.length);
  const exact = html.replace('</body>', filler + '</body>');
  assert.equal(Buffer.byteLength(exact), limit);
  const oversized = exact + 'x';
  assert.equal(Buffer.byteLength(oversized), limit + 1);
  const before = f.snapshot(), changes = f.db.prepare('SELECT total_changes() n').get();
  await assert.rejects(publishMarketRevision(f.db, f.artifacts, { ...build, page: { ...build.page, html: oversized } }), error => {
    assert.ok(error instanceof ResearchAutomationValidationError);
    assert.equal(error.message, 'Bản đọc vượt giới hạn bản lưu; không cắt dữ liệu hoặc tự thu lại.'); return true;
  });
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  const outcome = await publishMarketRevision(f.db, f.artifacts, { ...build, page: { ...build.page, html: exact } });
  if (outcome.exactRetry) assert.fail('oversize refusal must leave no retry row');
  const row = f.db.prepare('SELECT html_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?')
    .get(outcome.revisionId) as { html_sha256: string };
  assert.equal((await f.artifacts.read(row.html_sha256)).byteLength, limit);
  assert.deepEqual(f.db.prepare('SELECT byte_size FROM artifact_manifests WHERE sha256=?').get(row.html_sha256), { byte_size: BigInt(limit) });
});

// Mutation control: omit any one of the shared scope comparisons for a family.
for (const family of ['TikTok', 'Shopee'] as const) {
  test(`D3 ${family} refuses each page scope mismatch; matching frozen scope publishes`, async t => {
    const f = await fixture(t);
    type Frozen<P extends (...args: never[]) => unknown> = {
      identity: Parameters<P>[0]; draft: Parameters<P>[1]; report: Parameters<P>[2];
      source: Parameters<P>[3]; acquiredAt: Parameters<P>[4]; scope: Parameters<P>[5];
    };
    const tik = JSON.parse(await fs.readFile(new URL('../fixtures/tiktok-v1-reader-origin-input.json', import.meta.url), 'utf8')) as Frozen<typeof prepareTikTokReaderBuild>;
    const shop = JSON.parse(await fs.readFile(new URL('../fixtures/shopee-v1-reader-origin-input.json', import.meta.url), 'utf8')) as Frozen<typeof prepareShopeeReaderBuild>;
    shop.identity.workspaceId = workspaceId; shop.draft.binding.workspaceId = workspaceId;
    shop.identity.draftPairId = digest(canonicalJson(shop.draft)); shop.report.draftSha256 = shop.identity.draftPairId;
    shop.identity.semanticSha256 = shop.identity.sourceReportSha256 = digest(canonicalJson(shop.report));
    await f.retain(Buffer.from(canonicalJson(family === 'TikTok' ? tik.report : shop.report)));
    const tiktok = { workspaceId, runId, ...prepareTikTokReaderBuild(tik.identity, tik.draft, tik.report, tik.source, tik.acquiredAt, tik.scope) };
    const shopee = { workspaceId, runId, ...prepareShopeeReaderBuild(shop.identity, shop.draft, shop.report, shop.source, shop.acquiredAt, shop.scope) };
    const context = family === 'TikTok' ? tiktok : shopee;
    const request = { contractVersion: family === 'TikTok' ? 'insight-reader-build-tiktok-v1' : 'insight-reader-build-shopee-v1',
      reportKind: 'INSIGHT', sourceKind: family === 'TikTok' ? 'TIKTOK' : 'SHOPEE', requestKey: randomUUID(),
      draftPairId: context.input.draftPairId, semanticSha256: context.input.semanticSha256 };
    const build = (page = context.page) => family === 'TikTok'
      ? f.readers.buildTikTok({ ...tiktok, page, consumption: { corpusPackageId: tik.draft.corpus.packageId,
        corpusPackageContentSha256: tik.draft.corpus.packageContentSha256, codingDraftSha256: tik.identity.draftPairId,
        reportIdentitySha256: tik.identity.semanticSha256 } }, request, owner)
      : f.readers.buildShopee({ ...shopee, page, consumption: { sampleId: shop.draft.sample.sampleId,
        codingDraftSha256: shop.identity.draftPairId, reportIdentitySha256: shop.identity.semanticSha256 } }, request, owner);
    const before = f.snapshot();
    for (const page of [
      { ...context.page, keyword: context.page.keyword + ' changed' },
      { ...context.page, definition: context.page.definition + ' changed' },
      { ...context.page, period: { ...context.page.period, endDate: '2026-02-01' } },
    ]) {
      await assert.rejects(build(page), integrity(`${family} reader context differs from its exact frozen binding.`));
      assert.deepEqual(f.snapshot(), before);
    }
    assert.equal((await build()).exactRetry, false);
    assert.equal(f.snapshot().revisions.length, 1);
  });
}

// Mutation control: defer Insight's existing scope check until shared publication,
// allowing the later persona guard to win instead of the original binding error.
test('D3 Insight keeps its binding message before persona checks; matching legacy scope builds', async t => {
  const f = await fixture(t), scope = { keyword: 'Synthetic', definition: 'Synthetic frozen scope',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } };
  const context: InsightReaderDraftContext = { workspaceId, runId,
    input: { contractVersion: 'insight-reader-input-v1', reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-v1',
      workspaceId, runId, draftPairId: f.market.draftPairId, semanticSha256: f.sourceSha256, sourceReportSha256: f.sourceSha256,
      frozenStartSha256: f.sourceSha256, frozenScopeSha256: f.sourceSha256, sourceRendererVersion: 'automation-report-kit-v19',
      scope, retainedMethods: [] },
    page: { keyword: scope.keyword, definition: scope.definition, period: scope.requestedPeriod,
      sections: [], findings: { bundle: new Bundle(), findings: [] }, registry: new CitationRegistry() } };
  type PersonaInput = Extract<InsightReaderDraftContext['input'], { contractVersion: 'insight-reader-input-v6' }>;
  const personaInput: PersonaInput = { ...context.input,
    contractVersion: 'insight-reader-input-v6', builderVersion: 'reader-report-insight-v6', sourceRendererVersion: 'automation-report-kit-v26',
    // Generated JSON Schema `contains` adds an index signature to this array;
    // buildInsight still validates the fixture against the canonical schema.
    retainedMethods: [{ kind: 'PERSONA', sha256: f.sourceSha256 }, { kind: 'PERSONA_SOURCE', sha256: f.sourceSha256 }] as unknown as PersonaInput['retainedMethods'],
    personaProposalId: randomUUID(), personaProposalSha256: f.sourceSha256,
    personaSourcePairId: f.market.draftPairId, personaSourceSha256: f.sourceSha256 };
  const persona = { ...context, input: personaInput };
  const request = { contractVersion: 'insight-reader-build-v3', reportKind: 'INSIGHT', sourceKind: 'PERSONA', requestKey: randomUUID(),
    draftPairId: persona.input.draftPairId, semanticSha256: persona.input.semanticSha256,
    personaProposalId: persona.input.personaProposalId, personaProposalSha256: digest('different persona'),
    personaSourcePairId: persona.input.personaSourcePairId, personaSourceSha256: persona.input.personaSourceSha256 };
  const before = f.snapshot();
  await assert.rejects(f.readers.buildInsight({ ...persona, page: { ...persona.page, definition: 'Changed scope' } }, request, owner),
    integrity('Insight reader context differs from its exact frozen binding.'));
  await assert.rejects(f.readers.buildInsight(persona, request, owner),
    integrity('Persona reader context differs from its exact selected proposal and source.'));
  assert.deepEqual(f.snapshot(), before);
  assert.equal((await f.readers.buildInsight(context, { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT',
    requestKey: randomUUID(), draftPairId: context.input.draftPairId, semanticSha256: context.input.semanticSha256 }, owner)).exactRetry, false);
});

// Mutation controls: add strict artifact replay or draft-pair equality to Market retry.
test('Market retry returns the retained revision despite missing artifacts or a changed draft pair (b2 deferred)', async t => {
  const f = await fixture(t), first = await f.readers.build(f.market, f.request, owner);
  const before = f.snapshot();
  // Filesystem failure proves retry does not replay any stored artifact, without spying.
  await fs.rm(f.artifactRoot, { recursive: true, force: true });
  const changes = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.readers.build(f.market, f.request, owner), { ...first, exactRetry: true });
  const changed = { ...f.market, draftPairId: digest('new frozen draft pair') };
  assert.deepEqual(await f.readers.build(changed, f.request, owner), { ...first, exactRetry: true });
  await assert.rejects(f.readers.build(changed, { ...f.request, profile: { ...f.request.profile, product: 'Changed product' } }, owner),
    conflict('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.'));
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  await assert.rejects(fs.stat(f.artifactRoot), { code: 'ENOENT' });
});

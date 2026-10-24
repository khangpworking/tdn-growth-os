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
import { prepareTikTokReaderBuild } from '../../src/modules/analysis/reader-report/tiktok-build-v1.js';
import { prepareShopeeReaderBuild } from '../../src/modules/analysis/reader-report/shopee-build-v1.js';
import { buildInsightReaderTemplate, type InsightReaderPage } from '../../src/modules/analysis/reader-report/insight-template.js';
import { AutomationReaderReports, MAX_READER_HTML_BYTES, type ReaderDraftContext,
  type InsightReaderDraftContext, type TikTokReaderDraftContext, type ShopeeReaderDraftContext,
} from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { ResearchAutomationConflictError, ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

// Same binding and clock as insight-reader-fixture, without importing its service workflow.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
const now = () => new Date('2026-10-08T00:00:00.000Z');

type Family = 'Market' | 'Insight' | 'TikTok' | 'Shopee';
const families: readonly Family[] = ['Market', 'Insight', 'TikTok', 'Shopee'];
const otherRunId = '22222222-2222-4222-8222-222222222223';
const fixedKey = '33333333-3333-4333-8333-333333333333';
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const draftPairId = digest('synthetic reader draft');
const metricPackageId = '44444444-4444-4444-8444-444444444444';
const at = now().toISOString();

// Contract owner: publication at AutomationReaderReports, using migrated SQLite and CAS.
// Source reconstruction/collection is owned by insight-reader, research-tiktok-reader and
// research-shopee-coding. Only prerequisite run/source rows are seeded here; every revision,
// manifest produced by publication, decision and consumption receipt comes from the real API.
// Credible regressions: lost retry/actor guards, changed errors/numbering, pre-commit ledger
// writes, a skipped gate, or changed canonical record bytes. No new production seams.
async function fixture(t: TestContext, status = 'DRAFT_READY') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-c3-publish-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  async function retain(bytes: Buffer) {
    const artifact = await artifacts.put(bytes);
    db.prepare(`INSERT OR IGNORE INTO artifact_manifests
      (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,'application/json',?,?,'1.0.0','active',?)`)
      .run(artifact.sha256, artifact.byteSize, artifact.relativePath, at, at);
    return artifact.sha256;
  }
  const sourceSha = await retain(Buffer.from('{"synthetic":"Insight source"}'));
  for (const [id, state] of [[runId, status], [otherRunId, 'DRAFT_READY']] as const) {
    db.prepare(`INSERT INTO analysis_research_automation_runs
      (run_id,workspace_id,revision,status,mode,keyword,period_start,period_end,reports,start_request_sha256,actor_id,created_at,updated_at)
      VALUES (?,?,1,?,'CATEGORY','Synthetic','2026-01-01','2026-01-31','MARKET,INSIGHT',?,?,?,?)`)
      .run(id, workspaceId, state, sourceSha, owner.actorId, at, at);
  }
  const sample = sync1ReaderFixture();
  const readers = new AutomationReaderReports(db, artifacts, now, { flint: false, rows: () => sample.rows });
  const market: ReaderDraftContext = { workspaceId, runId, draftPairId, marketSemantic: {},
    metric: { packageId: metricPackageId, workbook: Buffer.from('synthetic workbook bytes'),
      measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } } };
  const scope = { keyword: 'Synthetic source', definition: 'Synthetic frozen scope',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } };
  const insight: InsightReaderDraftContext = { workspaceId, runId,
    input: { contractVersion: 'insight-reader-input-v1', reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-v1',
      workspaceId, runId, draftPairId, semanticSha256: sourceSha, sourceReportSha256: sourceSha,
      frozenStartSha256: sourceSha, frozenScopeSha256: sourceSha, sourceRendererVersion: 'automation-report-kit-v19',
      scope, retainedMethods: [] },
    page: { keyword: scope.keyword, definition: scope.definition, period: scope.requestedPeriod,
      sections: [], findings: { bundle: new Bundle(), findings: [] }, registry: new CitationRegistry() } };
  type Frozen<P extends (...args: never[]) => unknown> = {
    identity: Parameters<P>[0]; draft: Parameters<P>[1]; report: Parameters<P>[2];
    source: Parameters<P>[3]; acquiredAt: Parameters<P>[4]; scope: Parameters<P>[5];
  };
  const tik = JSON.parse(await fs.readFile(new URL('../fixtures/tiktok-v1-reader-origin-input.json', import.meta.url), 'utf8')) as Frozen<typeof prepareTikTokReaderBuild>;
  const shop = JSON.parse(await fs.readFile(new URL('../fixtures/shopee-v1-reader-origin-input.json', import.meta.url), 'utf8')) as Frozen<typeof prepareShopeeReaderBuild>;
  // The Shopee origin fixture uses another synthetic workspace; bind its draft/report
  // to this fixture's run before passing through the real family preparer.
  shop.identity.workspaceId = workspaceId; shop.draft.binding.workspaceId = workspaceId;
  shop.identity.draftPairId = digest(canonicalJson(shop.draft));
  shop.report.draftSha256 = shop.identity.draftPairId;
  shop.identity.semanticSha256 = shop.identity.sourceReportSha256 = digest(canonicalJson(shop.report));
  await retain(Buffer.from(canonicalJson(tik.report)));
  await retain(Buffer.from(canonicalJson(shop.report)));
  const tiktok: TikTokReaderDraftContext = { workspaceId, runId,
    ...prepareTikTokReaderBuild(tik.identity, tik.draft, tik.report, tik.source, tik.acquiredAt, tik.scope),
    consumption: { corpusPackageId: tik.draft.corpus.packageId, corpusPackageContentSha256: tik.draft.corpus.packageContentSha256,
      codingDraftSha256: tik.identity.draftPairId, reportIdentitySha256: tik.identity.semanticSha256 } };
  const shopee: ShopeeReaderDraftContext = { workspaceId, runId,
    ...prepareShopeeReaderBuild(shop.identity, shop.draft, shop.report, shop.source, shop.acquiredAt, shop.scope),
    consumption: { sampleId: shop.draft.sample.sampleId, codingDraftSha256: shop.identity.draftPairId,
      reportIdentitySha256: shop.identity.semanticSha256 } };
  function adapter(family: Family, id = runId) {
    const context = family === 'Market' ? { ...market, runId: id }
      : family === 'Insight' ? { ...insight, runId: id, input: { ...insight.input, runId: id } }
      : family === 'TikTok' ? { ...tiktok, runId: id, input: { ...tiktok.input, runId: id } }
      : { ...shopee, runId: id, input: { ...shopee.input, runId: id } };
    const request = family === 'Market' ? { contractVersion: 'reader-report-build-v1', requestKey: fixedKey,
      metricPackageId, platforms: sample.platforms, profile: sample.profile, source: sample.source, cover: null }
      : { contractVersion: family === 'Insight' ? 'insight-reader-build-v1' : family === 'TikTok' ? 'insight-reader-build-tiktok-v1' : 'insight-reader-build-shopee-v1',
        reportKind: 'INSIGHT', requestKey: fixedKey, draftPairId: (context as InsightReaderDraftContext).input.draftPairId,
        semanticSha256: (context as InsightReaderDraftContext).input.semanticSha256,
        ...(family === 'Insight' ? {} : { sourceKind: family === 'TikTok' ? 'TIKTOK' : 'SHOPEE' }) };
    const build = (value: unknown = request, actor = owner, selected = context) => family === 'Market'
      ? readers.build(selected as ReaderDraftContext, value, actor)
      : family === 'Insight' ? readers.buildInsight(selected as InsightReaderDraftContext, value, actor)
      : family === 'TikTok' ? readers.buildTikTok(selected as TikTokReaderDraftContext, value, actor)
      : readers.buildShopee(selected as ShopeeReaderDraftContext, value, actor);
    return { context, request, build };
  }
  const snapshot = () => ({
    revisions: db.prepare('SELECT * FROM analysis_reader_report_revisions ORDER BY revision_id').all(),
    manifests: db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(),
    tiktok: db.prepare('SELECT * FROM analysis_tiktok_report_consumption ORDER BY revision_id').all(),
    shopee: db.prepare('SELECT * FROM analysis_shopee_report_consumption ORDER BY revision_id').all(),
  });
  const files = async () => (await fs.readdir(path.join(root, 'artifacts', 'sha256'), { recursive: true })).sort();
  return { root, db, artifacts, readers, adapter, snapshot, files };
}

function conflict(code: string, message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ResearchAutomationConflictError);
    assert.equal(error.code, code); assert.equal(error.message, message); return true;
  };
}
const keyConflict = () => conflict('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.');

for (const family of families) {
  test(`row 1 ${family}: exact retry is mutation-free; one changed request byte conflicts`, async t => {
    const f = await fixture(t), a = f.adapter(family);
    const first = await a.build();
    assert.equal(first.exactRetry, false);
    const before = f.snapshot(), changes = f.db.prepare('SELECT total_changes() n').get(), files = await f.files();
    const retry = await a.build();
    assert.equal(retry.exactRetry, true); assert.deepEqual(retry.revision, first.revision);
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(await f.files(), files);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
    if (family === 'TikTok' || family === 'Shopee') {
      const ledger = family === 'TikTok' ? before.tiktok : before.shopee;
      assert.equal(ledger.length, 1);
      assert.equal((ledger[0] as { revision_id: string }).revision_id, first.revision.revisionId);
    }
    if (family === 'Market') {
      await assert.rejects(a.build({ ...a.request, profile: { ...a.request.profile!, product: 'Bình thử!' } }), keyConflict());
    } else {
      // Keep the trusted binding consistent so this reaches request-key reuse, not the earlier binding guard.
      const context = a.context as InsightReaderDraftContext;
      const changed = (context.input.semanticSha256[0] === '0' ? '1' : '0') + context.input.semanticSha256.slice(1);
      await assert.rejects(a.build({ ...a.request, semanticSha256: changed }, owner,
        { ...context, input: { ...context.input, semanticSha256: changed } } as typeof a.context), keyConflict());
    }
    assert.deepEqual(f.snapshot(), before);
  });

  test(`row 2 ${family}: another actor or run cannot reuse the key; identical binding retries`, async t => {
    const f = await fixture(t), a = f.adapter(family);
    const first = await a.build(), before = f.snapshot();
    await assert.rejects(a.build(a.request, { ...owner, actorId: 'other-owner' }), keyConflict());
    await assert.rejects(f.adapter(family, otherRunId).build(), keyConflict());
    assert.equal((await a.build()).revision.revisionId, first.revision.revisionId);
    assert.deepEqual(f.snapshot(), before);
  });

  test(`row 5 ${family}: revisions are 1,2,3 per run and kind`, async t => {
    const f = await fixture(t), a = f.adapter(family), otherKind = f.adapter(family === 'Market' ? 'Insight' : 'Market');
    for (const n of [1, 2, 3]) {
      assert.equal((await a.build({ ...a.request, requestKey: randomUUID() })).revision.revisionNumber, n);
      assert.equal((await otherKind.build({ ...otherKind.request, requestKey: randomUUID() })).revision.revisionNumber, n);
    }
    const otherRun = f.adapter(family, otherRunId);
    assert.equal((await otherRun.build({ ...otherRun.request, requestKey: randomUUID() })).revision.revisionNumber, 1);
  });

  test(`row 6 ${family}: non-DRAFT_READY maps to today's invalid_state; ready run builds`, async t => {
    const f = await fixture(t, 'CANCELLED'), a = f.adapter(family), before = f.snapshot();
    await assert.rejects(a.build(), conflict('invalid_state', 'Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.'));
    assert.deepEqual(f.snapshot(), before);
    assert.equal((await f.adapter(family, otherRunId).build()).revision.revisionNumber, 1);
  });

  test(`row 8 ${family}: gate failure stores no revision; clean page commits`, async t => {
    const f = await fixture(t), a = f.adapter(family), before = f.snapshot();
    if (family === 'Market') {
      // Owner Q2 via c2 PR3: plain Vietnamese reasons for the owner; rule ids stay in the cause.
      await assert.rejects(a.build({ ...a.request, profile: { ...a.request.profile!, product: 'NaN' } }),
        (error: unknown) => {
          assert.ok(error instanceof ResearchAutomationValidationError);
          assert.doesNotMatch(error.message, /[A-Z][A-Z0-9]*_[A-Z0-9_]+/);
          assert.doesNotMatch(error.message, /\bF3\b/);
          assert.equal(error.message,
            'Bản đọc chưa đạt kiểm tra bằng chứng hoặc cách trình bày: Trang còn sót chữ máy như undefined, NaN hoặc null. Hãy kiểm tra nguồn, nhận định và nhãn phân loại chờ chủ duyệt trước khi tạo phiên bản mới.');
          assert.ok(error.cause instanceof Error);
          assert.match(error.cause.message, /\bF3\b/);
          return true;
        });
    } else {
      const context = a.context as InsightReaderDraftContext;
      const page: InsightReaderPage = { ...context.page, sections: [...context.page.sections,
        { id: 'I01', body: '<p>NaN</p>', explanation: 'Synthetic invalid rendering' }] };
      await assert.rejects(a.build(a.request, owner, { ...context, page } as typeof a.context),
        (error: unknown) => error instanceof ResearchAutomationValidationError && error.message ===
          `Bản đọc ${family === 'Insight' ? 'insight' : family} chưa đạt kiểm tra bằng chứng hoặc cách trình bày.`);
    }
    assert.deepEqual(f.snapshot().revisions, before.revisions);
    assert.equal((await a.build()).revision.revisionNumber, 1);
  });
}

// Approved refusal already belongs to research-reader-report.test.ts (~272, Market)
// and insight-reader.test.ts (~66, Insight); do not repeat those rows here.
for (const family of ['TikTok', 'Shopee'] as const) {
  test(`row 3 ${family}: APPROVED blocks with exact error; REJECTED permits another build`, async t => {
    const f = await fixture(t), a = f.adapter(family), first = await a.build();
    const binding = { workspaceId, runId };
    await f.readers.decideV2(binding, { contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(),
      revisionId: first.revision.revisionId, htmlSha256: first.revision.htmlSha256, decision: 'REJECTED', reason: 'Synthetic rejection' }, owner);
    const second = await a.build({ ...a.request, requestKey: randomUUID() });
    assert.equal(second.revision.revisionNumber, 2);
    await f.readers.decideV2(binding, { contractVersion: 'reader-report-decision-v2', reportKind: 'INSIGHT', requestKey: randomUUID(),
      revisionId: second.revision.revisionId, htmlSha256: second.revision.htmlSha256, decision: 'APPROVED', reason: null }, owner);
    const before = f.snapshot();
    await assert.rejects(a.build({ ...a.request, requestKey: randomUUID() }),
      conflict('invalid_state', 'Bản đọc insight mới nhất đã được chủ duyệt.'));
    assert.deepEqual(f.snapshot(), before);
  });

  test(`row 7 ${family}: ledger constraint failure rolls back publication; success commits both`, async t => {
    const f = await fixture(t), a = f.adapter(family), before = f.snapshot();
    const context = family === 'TikTok'
      ? { ...(a.context as TikTokReaderDraftContext), consumption: { ...(a.context as TikTokReaderDraftContext).consumption, corpusPackageContentSha256: 'invalid' } }
      : { ...(a.context as ShopeeReaderDraftContext), consumption: { ...(a.context as ShopeeReaderDraftContext).consumption, sampleId: 'invalid' } };
    await assert.rejects(a.build(a.request, owner, context as typeof a.context), /CHECK constraint failed/);
    assert.deepEqual(f.snapshot(), before); assert.equal(f.db.inTransaction, false);
    const built = await a.build(), after = f.snapshot();
    assert.equal(built.revision.revisionNumber, 1); assert.equal(after.revisions.length, 1);
    const ledger = family === 'TikTok' ? after.tiktok : after.shopee;
    assert.equal(ledger.length, 1);
    assert.equal((ledger[0] as { revision_id: string }).revision_id, built.revision.revisionId);
  });
}

for (const family of ['Insight', 'TikTok', 'Shopee'] as const) {
  test(`row 4 ${family}: oversized HTML is refused before storing anything`, async t => {
    const f = await fixture(t), a = f.adapter(family), before = f.snapshot(), files = await f.files();
    const context = a.context as InsightReaderDraftContext;
    const page: InsightReaderPage = { ...context.page, sections: [...context.page.sections, { id: 'I01', body: 'x'.repeat(MAX_READER_HTML_BYTES), explanation: 'Synthetic size boundary' }] };
    assert.ok(Buffer.byteLength(buildInsightReaderTemplate(page).html) > MAX_READER_HTML_BYTES);
    await assert.rejects(a.build(a.request, owner, { ...context, page } as typeof a.context),
      (error: unknown) => error instanceof ResearchAutomationValidationError && error.message ===
        `Bản đọc ${family === 'Insight' ? 'insight' : family} vượt giới hạn bản lưu; không cắt dữ liệu hoặc tự thu lại.`);
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(await f.files(), files);
    assert.equal((await a.build()).revision.revisionNumber, 1);
  });
}

// Re-bound in c3 PR3: owner c3 Q2 refuses Market pages above the cap at build, like Insight.
test('row 4 Market: oversized HTML is refused before any revision row (owner c3 Q2)', async t => {
  const f = await fixture(t), a = f.adapter('Market'), before = f.snapshot();
  const context: ReaderDraftContext = { ...(a.context as ReaderDraftContext), // Bounded text nodes avoid a regex stack limit unrelated to the total-page cap.
    webResults: Array.from({ length: 1024 }, (_, i) => ({ position: i + 1, title: 'Synthetic retained page',
      url: 'https://example.com/synthetic', snippet: 'x'.repeat(MAX_READER_HTML_BYTES / 1024), retrievedAt: at })) };
  await assert.rejects(a.build(a.request, owner, context),
    (error: unknown) => error instanceof ResearchAutomationValidationError && error.message === 'Bản đọc vượt giới hạn bản lưu; không cắt dữ liệu hoặc tự thu lại.');
  assert.deepEqual(f.snapshot(), before);
});

// randomUUID is deliberately not mocked. Pin every stored byte after replacing only the
// generated revision UUID with a fixed UUID; no parsing/reserialization may hide byte drift.
for (const [family, expected] of [
  ['Market', 'e42bcf8fd76815296093b96069dfe458b9d8ecc963ec238417b65730bf54619a'], ['Insight', 'e1d63f57e9cf6a062e677617daeb2f8a91fe574daed523239329becf523e6b1c'],
] as const) {
  test(`row 9 ${family}: fixed-input canonical build record bytes stay unchanged`, async t => {
    const f = await fixture(t), a = f.adapter(family), built = await a.build();
    const row = f.db.prepare('SELECT input_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?')
      .get(built.revision.revisionId) as { input_sha256: string };
    const bytes = await f.artifacts.read(row.input_sha256);
    assert.equal(digest(bytes), row.input_sha256);
    const record = JSON.parse(bytes.toString()) as { revisionId: string; createdAt: string };
    assert.equal(record.revisionId, built.revision.revisionId); assert.equal(record.createdAt, at);
    assert.equal(bytes.toString(), canonicalJson(record));
    const normalized = bytes.toString().replace(`"revisionId":"${built.revision.revisionId}"`, `"revisionId":"${fixedKey}"`);
    assert.equal(digest(normalized), expected);
  });
}

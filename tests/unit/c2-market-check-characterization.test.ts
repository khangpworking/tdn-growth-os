import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { PublicReviewSource } from '../../contracts/foundation/shopee-public-collection.generated.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { projectDraftInsightGroupCounts } from '../../src/modules/analysis/research-automation/selected-insight-projection.js';
import { assertMarketBusinessGate, auditMarketReportHtml, type MarketBusinessGateOptions } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { assertMarket14MachineRules, auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { policyRun } from '../helpers/capture-policy-harness.js';

// c2 PR1: observable contracts only. TODAY rows preserve drift, not desired fixes.
// Existing gate tests own individual lexical rules; these rows own their combination,
// caller options, version boundaries and operational error strings (c2.md §6 rows 1–9).
const U13 = ['U13_SUPERLATIVE', 'U13_PRIORITY', 'U13_PENDING_NUMBER', 'U13_METRIC_CODE', 'U13_REAL_PRICE', 'L20_RANKING_WORD'];
const CONTENT = ['G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL', 'E2_NO_REVENUE_ORDER',
  'PARTIAL_TOTAL_FORBIDDEN', 'NO_LEAK', 'SEARCH_INTEREST_NOT_COUNT', ...U13];
const PRESENTATION = [...CONTENT.slice(0, 3), 'SECTIONS_PRESENT', 'M12_PROPOSAL_LABEL', ...CONTENT.slice(3)];
const RULES14 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];
const ids = (rows: readonly { rule: string }[]) => rows.map(row => row.rule);
const failures = (rows: readonly { rule: string; ok: boolean }[]) => ids(rows.filter(row => !row.ok));
const gate = (html: string, options: MarketBusinessGateOptions = {}) => auditMarketReportHtml(html, { presentation: false, ...options });
const verdict = (rows: readonly { rule: string; ok: boolean }[], rule: string) => {
  const row = rows.find(item => item.rule === rule);
  assert.ok(row, `missing result: ${rule}`);
  return row.ok;
};
const readerVerdict = (html: string, prefix: string) => {
  const row = lint(html, { visibleTextRules: true }).find(item => item.rule.startsWith(prefix));
  assert.ok(row, `missing Reader result: ${prefix}`);
  return row.ok;
};
function presentation(extra = ''): string {
  return '<html><body>' + Array.from({ length: 13 }, (_, i) =>
    `<section id="M${String(i + 1).padStart(2, '0')}"></section>`).join('') + extra + '</body></html>';
}
let inputPromise: Promise<AutomationReportInput> | undefined;
const draftInput = async () => structuredClone(await (inputPromise ??= fullMarket14Input()));
const render = (input: AutomationReportInput) => buildResearchAutomationReport(input, 'MARKET').html.toString();

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };

// Use the real service/version dispatch and a temporary synthetic run, so removing
// its v1.2-only 14-rule guard changes a verdict rather than merely a call count.
async function readerRun(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'c2-reader-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'c2-reader', title: 'Synthetic c2 reader' });
  const fixture = sync1ReaderFixture();
  const service = new ResearchAutomationService({ db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, readerReportFlint: false, readerRows: () => fixture.rows });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1',
    requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY', keyword: 'synthetic jar',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'],
    { input: JSON.stringify({ profile: 'v2', cells: {} }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const scope = { definition: 'Synthetic c2 scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  const prepared = await service.prepareMetricSource(workspaceId, runId, {
    contractVersion: 'automation-metric-prepare-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, scope, sourceLabel: 'Synthetic export', sourceContext: 'Synthetic fixture only.',
    measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', basis: 'Synthetic declared period' },
    selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' },
  }, generated.stdout);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2',
    requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: awaiting.revision, ...scope,
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  return { service, request: (version: string, requestKey: string, product: string) => ({
    contractVersion: version, requestKey, metricPackageId: prepared.packageId,
    platforms: fixture.platforms, profile: { ...fixture.profile, product }, cover: null, source: fixture.source,
  }) };
}

async function snapshotReaderRun(t: TestContext) {
  // A retained capture exercises v1.1 without the workbook renderer's unrelated U13 refusal.
  const { service, first } = await policyRun(t);
  const profile = sync1ReaderFixture().profile;
  return { service, request: (version: string, requestKey: string, product: string) => ({
    contractVersion: version, requestKey, metricPackageId: first.packageId,
    platforms: ['shopee'], profile: { ...profile, product }, cover: null,
    webSnapshot: first.snapshot, webSnapshotSha256: webSnapshotDigest(first.snapshot),
  }) };
}

type Row = { name: string; run: (t: TestContext) => void | Promise<void> };
const rows: Row[] = [
  { name: 'row 1/7: draft builder preserves the business-gate prefix before 14 rules', run: async () => {
    const input = await draftInput();
    const clean = render(input);
    assert.deepEqual(failures(auditMarketReportHtml(clean)), []);
    (input.start.requestedPeriod as { startDate: string }).startDate = 'Metric';
    assert.throws(() => render(input), { name: 'TypeError', message: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME' });
  } },
  { name: 'row 7: raw draft U13 preserves its prefix and ordered ids', run: async () => {
    const input = await draftInput();
    assert.doesNotThrow(() => render(input));
    // Stored findings are reprojected by today's builder; this period label reaches its raw lint boundary.
    (input.start.requestedPeriod as { startDate: string }).startDate = 'Sản phẩm tốt nhất. Làm ngay việc A, tiếp theo việc B.';
    assert.throws(() => render(input), { name: 'TypeError', message: 'MARKET_VISIBLE_TEXT_LINT_FAILED:U13_SUPERLATIVE,U13_PRIORITY,L20_RANKING_WORD' });
  } },
  { name: 'row 7: non-presentation public-review builder preserves its refusal prefix', run: async () => {
    const { marketPresentation: _presentation, ...base } = await draftInput();
    const source: PublicReviewSource = {
      acquisition: { contractVersion: 'shopee-public-review-stage-v1', state: 'FINAL', confirmedSourceSetSha256: 'a'.repeat(64),
        providerId: 'shopee-public-review', maxReviewsPerProduct: 300, mappingRevision: 'shopee-public-review-row-v1', sampleMode: 'STANDARD' },
      reference: null, outcome: { outcome: 'PROVIDER_TIMEOUT_NO_REVIEWS', listings: [{ listingUrl: 'https://shopee.vn/product/1/2', reviews: 0 }],
        providerMessage: null, attemptedAt: now().toISOString(), reused: false },
      corpusSha256: null, corpusUnavailableReason: 'PUBLIC_REVIEW_NOT_CONFIGURED', humanBlocked: false,
      products: [{ records: 0, readableComments: 0 }], accounting: { sourceRows: 0, uniqueScopedGroups: 0,
        equalDuplicates: 0, conflictingGroups: 0, quarantinedRows: 0, capturedReviewRecords: 0, readableCommentRecords: 0,
        attributesOnlyRecords: 0, emptyComments: 0, unreadableComments: 0, missingRatings: 0, invalidRatings: 0, sourceExcludedIds: 0 },
    };
    const input = { ...base, publicReviewSource: source };
    assert.doesNotThrow(() => render(input));
    (input.start.requestedPeriod as { startDate: string }).startDate = 'Metric';
    assert.throws(() => render(input), { name: 'TypeError', message: 'PUBLIC_REVIEW_READER_NAME_REFUSED' });
  } },
  { name: 'row 7: Insight retains its own visible-text prefix', run: async () => {
    const { marketPresentation: _presentation, ...input } = await draftInput();
    const proposal = nextInsightFixture(); proposal.draftCountsVersion = 'draft-counts-v2';
    const output = buildLocatedInsightMethods(proposal).output;
    const insightCoding = { contractVersion: 'automation-insight-coding-snapshot-v3' as const,
      binding: { workspaceId, runId, pairId: '8'.repeat(64), scopeSha256: '9'.repeat(64), reportSha256: 'a'.repeat(64),
        sourceKind: 'NATIVE' as const, sourcePackageSha256: 'b'.repeat(64), inputSha256: 'c'.repeat(64) },
      selection: { proposalId: workspaceId, receiptIds: [] as [] }, adoptionId: runId, proposalSha256: 'd'.repeat(64), receipts: [] as [],
      draftSelection: { contractVersion: 'insight-draft-select-v2' as const, proposalId: workspaceId },
      output, groupCounts: projectDraftInsightGroupCounts(output, 'SHOPEE') };
    const clean = { ...input, insightCoding };
    assert.doesNotThrow(() => buildResearchAutomationReport(clean, 'INSIGHT'));
    clean.insightCoding.groupCounts.groups[0]!.scope.frame = 'Ưu tiên số 1.';
    assert.throws(() => buildResearchAutomationReport(clean, 'INSIGHT'),
      { name: 'TypeError', message: 'INSIGHT_VISIBLE_TEXT_LINT_FAILED:U13_PRIORITY,L20_RANKING_WORD' });
  } },
  { name: 'row 2: a partial total fails only with supplied totals', run: () => {
    const html = '<p>Doanh thu là 1.234 VND.</p>';
    assert.deepEqual(failures(gate(html)), []);
    assert.deepEqual(failures(gate(html, { partialTotals: [{ measure: 'revenue', value: '1234' }] })), ['PARTIAL_TOTAL_FORBIDDEN']);
    assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
    assert.throws(() => assertMarketBusinessGate(html, { presentation: false, partialTotals: [{ measure: 'revenue', value: '1234' }] }),
      { name: 'TypeError', message: 'MARKET_BUSINESS_GATE_FAILED:PARTIAL_TOTAL_FORBIDDEN' });
  } },
  ...(['reader-report-build-v1', 'reader-report-build-v1.1', 'reader-report-build-v1.2'] as const).map(version => ({
    name: `row 3: ${version} ${version.endsWith('v1.2') ? 'enforces' : 'omits'} the 14-rule presentation check`,
    run: async (t: TestContext) => {
      const f = version === 'reader-report-build-v1.1' ? await snapshotReaderRun(t) : await readerRun(t);
      const clean = await f.service.buildReaderReport(workspaceId, runId,
        f.request(version, '10000000-0000-4000-8000-000000000001', 'Bình thử'), owner);
      const cleanHtml = (await f.service.readReaderReport(workspaceId, runId, clean.revision.revisionId)).bytes.toString();
      assert.doesNotThrow(() => assertMarketBusinessGate(cleanHtml, { presentation: false }));
      const bad = f.request(version, '10000000-0000-4000-8000-000000000002', 'M01');
      if (version === 'reader-report-build-v1.2') {
        // c2 PR3 owner Q2: the owner sees the plain reason for rule 2, not its code.
        await assert.rejects(f.service.buildReaderReport(workspaceId, runId, bad, owner), /Trang thiếu nhãn Phần\/Phụ lục hoặc còn hiện mã kỹ thuật của phần\./u);
      } else {
        const saved = await f.service.buildReaderReport(workspaceId, runId, bad, owner);
        const html = (await f.service.readReaderReport(workspaceId, runId, saved.revision.revisionId)).bytes.toString();
        assert.equal(verdict(auditMarket14(html), '2'), false, 'legacy delivery retains the visible technical label');
      }
    },
  })),
  ...([
    ['provider', 'Metric', 'G08_PROVIDER_NAME', 'F1 '],
    ['total', 'tổng hai sàn', 'U32_NO_CROSS_PLATFORM_TOTAL', 'W3 '],
    ['ranking', 'xếp hạng theo doanh thu', 'E2_NO_REVENUE_ORDER', 'F5 '],
    ['superlative', 'Sản phẩm tốt nhất.', 'U13_SUPERLATIVE', 'U13_SUPERLATIVE'],
  ] as const).map(([label, text, rule, readerRule]) => ({ name: `row 4: shared ${label} verdict agrees on ordinary prose`, run: () => {
    for (const [html, ok] of [['<p>Bằng chứng được ghi riêng.</p>', true], [`<p>${text}</p>`, false]] as const) {
      assert.equal(verdict(auditMarketReportHtml(presentation(html)), rule), ok);
      assert.equal(verdict(gate(html), rule), ok);
      assert.equal(readerVerdict(html, readerRule), ok);
    }
  } })),
  { name: 'row 5: name attributes are refused in public and non-public contexts after c4', run: () => {
    for (const publicReviewSource of [false, true]) {
      const options = { presentation: false, publicReviewSource };
      assert.equal(verdict(gate('<img alt="Nguồn mẫu">', options), 'G08_PROVIDER_NAME'), true);
      assert.equal(verdict(gate('<img alt="Metric">', options), 'G08_PROVIDER_NAME'), false);
      assert.equal(verdict(lint('<img alt="Metric">', options), 'F1 tên nhà cung cấp số liệu'), false);
      assert.equal(verdict(lint('<img alt="Nguồn mẫu">', options), 'F1 tên nhà cung cấp số liệu'), true);
    }
  } },
  { name: 'rows 6/7: ordered gate results and error ids contain each rule once', run: () => {
    const clean = presentation(), bad = presentation('<p>Metric; tổng hai sàn; xếp hạng theo doanh thu.</p>');
    assert.deepEqual(ids(auditMarketReportHtml(clean)), PRESENTATION);
    assert.deepEqual(ids(gate(clean)), CONTENT);
    assert.deepEqual(ids(lintVisibleReportText(clean)), U13);
    assert.deepEqual(lint(clean, { visibleTextRules: true }).map(row => row.rule.split(' ')[0]),
      ['F1', 'F2', 'F3', 'F5', 'F6', 'F7', 'F8', 'F0', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', ...U13]);
    assert.deepEqual(failures(auditMarketReportHtml(clean)), []);
    assert.deepEqual(failures(auditMarketReportHtml(bad)), ['G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL', 'E2_NO_REVENUE_ORDER']);
    assert.deepEqual(ids(auditMarketReportHtml(bad)), PRESENTATION);
    assert.doesNotThrow(() => assertMarketBusinessGate(clean));
    assert.throws(() => assertMarketBusinessGate(bad), { name: 'TypeError',
      message: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME,U32_NO_CROSS_PLATFORM_TOTAL,E2_NO_REVENUE_ORDER' });
  } },
  { name: 'rows 6/7: auditMarket14 computes its own gate and preserves rule/error order', run: async () => {
    const clean = render(await draftInput());
    const base = auditMarket14(clean);
    assert.deepEqual(ids(base), RULES14);
    assert.deepEqual(base.map(row => row.kind), ['machine', 'machine', 'machine', 'machine', 'machine', 'evidence',
      'machine', 'evidence', 'machine', 'evidence', 'machine', 'machine', 'machine', 'evidence']);
    assert.deepEqual(failures(base), ['10'], 'a cover without AI provenance requires evidence review, not machine refusal');
    assert.doesNotThrow(() => assertMarket14MachineRules(clean));
    const bad = clean.replace('</body>', '<p>Metric; tổng hai sàn.</p></body>');
    assert.deepEqual(ids(auditMarket14(bad)), RULES14);
    assert.deepEqual(failures(auditMarket14(bad)), ['4', '10']);
    assert.throws(() => assertMarket14MachineRules(bad), { name: 'TypeError', message: 'MARKET_14_RULES_FAILED:4' });
  } },
  ...([
    ['WORLD_BANK_NOT_ARITHMETIC', 'Bối cảnh vĩ mô', 'Bối cảnh vĩ mô cộng doanh thu.'],
    ['PDF_EXCERPT_NOT_MARKET_NUMBER', 'Trích đoạn nguyên văn từ tài liệu PDF', 'Trích đoạn là tổng doanh thu.'],
    ['SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL', 'Lời nói trong video bán hàng', 'Video là ý kiến khách hàng.'],
  ] as const).map(([rule, title, misuse]) => ({ name: `row 8: ${rule} appears only with its lane`, run: () => {
    assert.deepEqual(ids(gate('<p>Nguồn mẫu.</p>')), CONTENT);
    const expected = [...CONTENT.slice(0, 6), rule, ...U13];
    const clean = `<h2>${title}</h2><p>Nguồn mẫu.</p>`;
    assert.deepEqual(ids(gate(clean)), expected);
    assert.deepEqual(failures(gate(clean)), []);
    assert.equal(verdict(gate(`<h2>${title}</h2><p>${misuse}</p>`), rule), false);
    assert.deepEqual(ids(gate(`<h2 hidden>${title}</h2><p>Nguồn mẫu.</p>`)), CONTENT);
  } })),
  { name: 'row 9: snippet probe accepts quoted ranking and refuses authored ranking against a clean baseline', run: () => {
    assert.deepEqual(failures(gate('<p>Thông tin nguồn.</p>')), []);
    assert.deepEqual(failures(gate('<p><span data-quote>xếp hạng theo doanh thu</span></p>')), []);
    assert.deepEqual(failures(gate('<p>xếp hạng theo doanh thu</p>')), ['E2_NO_REVENUE_ORDER']);
  } },
  ...(['hidden', 'aria-hidden="true"', 'style="display:none"'] as const).map(attribute => ({
    name: `PR3: A2 hidden inline ${attribute} passes raw and gate U13`, run: () => {
      const html = `<p><span ${attribute}>Sản phẩm tốt nhất.</span></p>`;
      assert.deepEqual(failures(lintVisibleReportText(html)), []);
      // c2 PR3 owner Q3: hidden text no longer counts for U13 inside the gate.
      assert.deepEqual(failures(gate(html)), []);
      assert.equal(readerVerdict(html, 'U13_SUPERLATIVE'), true);
      assert.deepEqual(failures(gate(`<p><span ${attribute}>Thông tin nguồn.</span></p>`)), []);
      assert.deepEqual(failures(lintVisibleReportText('<p>Sản phẩm tốt nhất.</p>')), ['U13_SUPERLATIVE', 'L20_RANKING_WORD']);
    },
  })),
  ...(['<p aria-hidden="1">TEXT</p>', '<template><p>TEXT</p></template>'] as const).map(markup => ({
    name: `PR3: A3 ${markup.split('>')[0]}> hides E2 and U13 alike`, run: () => {
      const html = markup.replace('TEXT', 'Sản phẩm tốt nhất. xếp hạng theo doanh thu.');
      // c2 PR3 owner Q3 / b5: one hidden definition (aria-hidden="1", template) for gate, raw and Reader U13.
      assert.deepEqual(failures(gate(html)), []);
      assert.deepEqual(failures(lintVisibleReportText(html)), []);
      assert.equal(readerVerdict(html, 'U13_SUPERLATIVE'), true);
      assert.deepEqual(failures(gate(markup.replace('TEXT', 'Thông tin nguồn.'))), []);
      assert.equal(verdict(gate('<p>xếp hạng theo doanh thu.</p>'), 'E2_NO_REVENUE_ORDER'), false);
    },
  })),
  { name: 'TODAY: A3 hidden block names count while hidden block wording does not', run: () => {
    // expected to change in c2 PR3 (owner Q3, 24/10/2026)
    const html = '<p hidden>Metric; tổng hai sàn; xếp hạng theo doanh thu; Sản phẩm tốt nhất.</p>';
    assert.deepEqual(failures(gate(html)), ['G08_PROVIDER_NAME']);
    assert.equal(readerVerdict(html, 'F1 '), false);
    assert.equal(readerVerdict(html, 'W3 '), false);
    assert.equal(readerVerdict(html, 'F5 '), false);
    assert.equal(readerVerdict(html, 'U13_SUPERLATIVE'), true);
    assert.deepEqual(failures(gate('<p hidden>Thông tin nguồn.</p>')), []);
  } },
  ...([
    ['tổng cả hai sàn', true, false],
    ['Shopee + TikTok', false, true],
  ] as const).map(([text]) => ({ name: `PR3: C9 ${text} is refused by both U32 and Reader W3`, run: () => {
    // c2 PR3 handoff totals decision: one phrase list (union) for U32 and W3; totals still refused.
    assert.equal(verdict(auditMarketReportHtml(presentation(`<p>${text}</p>`)), 'U32_NO_CROSS_PLATFORM_TOTAL'), false);
    assert.equal(readerVerdict(`<p>${text}</p>`, 'W3 '), false);
    assert.equal(verdict(gate('<p>Shopee và TikTok Shop được ghi riêng.</p>'), 'U32_NO_CROSS_PLATFORM_TOTAL'), true);
    assert.equal(readerVerdict('<p>Shopee và TikTok Shop được ghi riêng.</p>', 'W3 '), true);
  } })),
  { name: 'PR3: verify 10 hidden statements no longer count for partial totals and drawn lanes', run: () => {
    const cases = [
      ['PARTIAL_TOTAL_FORBIDDEN', '', 'Doanh thu là 1.234 VND.'],
      ['SEARCH_INTEREST_NOT_COUNT', 'Mức quan tâm tìm kiếm', 'Có 80 lượt tìm kiếm.'],
      ['WORLD_BANK_NOT_ARITHMETIC', 'Bối cảnh vĩ mô', 'Bối cảnh vĩ mô cộng doanh thu.'],
      ['PDF_EXCERPT_NOT_MARKET_NUMBER', 'Trích đoạn nguyên văn từ tài liệu PDF', 'Trích đoạn là tổng doanh thu.'],
      ['SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL', 'Lời nói trong video bán hàng', 'Video là ý kiến khách hàng.'],
    ];
    const options = { partialTotals: [{ measure: 'revenue' as const, value: '1234' }] };
    for (const [rule, title, statement] of cases) {
      assert.ok(rule);
      // c2 PR3 owner Q3: hidden text is not a statement.
      assert.equal(verdict(gate(`<h2>${title}</h2><p hidden>${statement}</p>`, options), rule), true, rule);
      assert.equal(verdict(gate(`<h2>${title}</h2><p>${statement}</p>`, options), rule), false, rule);
      assert.equal(verdict(gate(`<h2>${title}</h2><p hidden>Thông tin nguồn.</p>`, options), rule), true, rule);
    }
  } },
  { name: 'TODAY: verify 11 hidden technical labels count in 14 rules but hidden M12 wording does not in the gate', run: () => {
    // expected to change in c2 PR3 (owner Q3, 24/10/2026)
    const clean = '<p>Phần 1 Phần 2 Phần 3 Phần 4 Phần 5 Phần 6 Phần 7 Phần 8 Phần 9 Phần 10 Phần 11 Phần 12 Phụ lục Bảng PL.1</p>';
    assert.equal(verdict(auditMarket14(clean), '2'), true);
    assert.equal(verdict(auditMarket14(clean + '<p hidden>M01</p>'), '2'), false);
    const hiddenProposal = presentation().replace('id="M12">', 'id="M12"><p hidden>Phương án A</p>');
    assert.equal(verdict(auditMarketReportHtml(hiddenProposal), 'M12_PROPOSAL_LABEL'), true);
    assert.equal(verdict(auditMarketReportHtml(hiddenProposal.replace(' hidden', '')), 'M12_PROPOSAL_LABEL'), false);
  } },
  { name: 'row 4: inline word joining makes gate U13 stricter than raw and Reader U13', run: () => {
    const html = '<p>Sản phẩm tốt nh<span>ất</span>.</p>';
    assert.deepEqual(failures(gate(html)), ['U13_SUPERLATIVE', 'L20_RANKING_WORD']);
    assert.deepEqual(failures(lintVisibleReportText(html)), []);
    assert.equal(readerVerdict(html, 'U13_SUPERLATIVE'), true);
    assert.deepEqual(failures(gate('<p>Sản phẩm thông thường.</p>')), []);
  } },
  { name: 'row 9: balanced blockquote exempts E2 while Reader F5 and W4 count the quote', run: () => {
    const html = '<blockquote><p>xếp hạng theo doanh thu và thị phần</p></blockquote>';
    assert.deepEqual(failures(gate(html)), []);
    assert.equal(readerVerdict(html, 'F5 '), false);
    assert.equal(readerVerdict(html, 'W4 '), false);
    const marked = html.replace('<blockquote>', '<blockquote data-quote>');
    assert.equal(readerVerdict(marked, 'F5 '), true);
    assert.equal(readerVerdict(marked, 'W4 '), true);
  } },
];

for (const row of rows) test(row.name, row.run);

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { ReaderReportGateError } from '../../src/modules/analysis/reader-report/build.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { checkMarketReport, marketSnippetWordingPasses } from '../../src/modules/analysis/research-automation/market-report-check.js';
import { ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { policyRun, policyRunId, policyWorkspaceId } from '../helpers/capture-policy-harness.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

// PR2 owns the old entry contract; these rows own the PR3 Reader/wording decisions.
// Each changed verdict has a passing control; Q2 exercises real publication errors.
const draft = { kind: 'DRAFT_PRESENTATION', requireFlint: false } as const;
const reader = { kind: 'READER', contractVersion: 'reader-report-build-v1.2', requireFlint: false } as const;
const u13 = ['U13_SUPERLATIVE', 'U13_PRIORITY', 'U13_PENDING_NUMBER'];
const ids = (rows: readonly { rule: string }[]) => rows.map(row => row.rule);
const verdict = (rows: readonly { rule: string; ok: boolean }[], rule: string) => {
  const found = rows.find(row => row.rule === rule);
  assert.ok(found, `missing result: ${rule}`);
  return found.ok;
};
const append = (html: string, fragment: string) => html.replace('</body>', `${fragment}</body>`);
let cleanPromise: Promise<string> | undefined;
const cleanReport = () => cleanPromise ??= fullMarket14Input().then(input =>
  buildResearchAutomationReport(input, 'MARKET').html.toString());

type Row = { name: string; run: (t: TestContext) => void | Promise<void> };
const shared: readonly [string, string, string, boolean][] = [
  ['provider', '<p>Kalodata</p>', 'G08_PROVIDER_NAME', false],
  ['total formerly only refused by W3', '<p>tổng cả hai sàn</p>', 'U32_NO_CROSS_PLATFORM_TOTAL', false],
  ['revenue ordering', '<p>xếp hạng theo doanh thu.</p>', 'E2_NO_REVENUE_ORDER', false],
  ['shown superlative', '<p>Sản phẩm tốt nhất.</p>', 'U13_SUPERLATIVE', false],
  ['hidden inline superlative', '<p><span hidden>Sản phẩm tốt nhất.</span></p>', 'U13_SUPERLATIVE', true],
  ['aria-hidden numeric value', '<p aria-hidden="1">Sản phẩm tốt nhất.</p>', 'U13_SUPERLATIVE', true],
  ['template content', '<template><p>Sản phẩm tốt nhất.</p></template>', 'U13_SUPERLATIVE', true],
  ['hidden revenue ordering', '<p><span hidden>xếp hạng theo doanh thu.</span></p>', 'E2_NO_REVENUE_ORDER', true],
];
const reasons = [
  { label: 'gate', version: 'reader-report-build-v1.1', product: 'Hũ OpenAI',
    cause: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME',
    sentences: ['Trang có tên nhà cung cấp số liệu hoặc công cụ.'] },
  { label: 'ordered gate ids', version: 'reader-report-build-v1.1', product: 'OpenAI; tổng hai sàn',
    cause: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME,U32_NO_CROSS_PLATFORM_TOTAL',
    sentences: ['Trang có tên nhà cung cấp số liệu hoặc công cụ.', 'Trang cộng gộp số của Shopee và TikTok Shop thành một tổng.'] },
  { label: '14-rule', version: 'reader-report-build-v1.2', product: 'M01',
    cause: 'MARKET_14_RULES_FAILED:2',
    sentences: ['Trang thiếu nhãn Phần/Phụ lục hoặc còn hiện mã kỹ thuật của phần.'] },
  { label: 'legacy RR lint', version: 'reader-report-build-v1.1', product: 'undefined',
    cause: 'bản đọc chưa qua cổng kiểm: F3 không sót undefined/NaN/null/{{}}; số viết tay 0; số ngoài bundle 0',
    sentences: ['Trang còn sót chữ máy như undefined, NaN hoặc null.'] },
] as const;

const rows: Row[] = [
  ...shared.map(([label, fragment, rule, ok]): Row => ({
    name: `row 1: draft and Reader agree on ${label}`, run: async () => {
      const clean = await cleanReport();
      for (const context of [draft, reader]) {
        const control = checkMarketReport(clean, context);
        assert.equal(control.failure, null);
        assert.equal(verdict(control.results, rule), true);
        assert.equal(verdict(checkMarketReport(append(clean, fragment), context).results, rule), ok);
        if (ok) {
          const shown = fragment.replace(/<[^>]*>/g, '');
          assert.equal(verdict(checkMarketReport(append(clean, `<p>${shown}</p>`), context).results, rule), false);
        }
      }
    },
  })),
  { name: 'row 2: hidden provider names still fail G08 in draft and Reader', run: async () => {
    const clean = await cleanReport();
    for (const context of [draft, reader]) {
      assert.equal(verdict(checkMarketReport(append(clean, '<p>Shopee</p>'), context).results, 'G08_PROVIDER_NAME'), true);
      assert.equal(verdict(checkMarketReport(append(clean, '<span hidden>Kalodata</span>'), context).results, 'G08_PROVIDER_NAME'), false);
    }
  } },
  ...(['reader-report-build-v1', 'reader-report-build-v1.1', 'reader-report-build-v1.2'] as const).map((version): Row => ({
    name: `row 3: ${version} keeps its versioned 14-rule verdict`, run: async () => {
      const clean = await cleanReport();
      const context = { ...reader, contractVersion: version };
      assert.equal(checkMarketReport(clean, context).failure, null);
      const bad = append(clean, '<p>M01</p>');
      const checked = checkMarketReport(bad, context);
      if (version === 'reader-report-build-v1.2') {
        assert.deepEqual(checked.failure, { failed: ['2'], message: 'MARKET_14_RULES_FAILED:2' });
        assert.equal(verdict(checked.results, '2'), false);
      } else {
        assert.equal(checked.failure, null);
        assert.equal(checked.results.some(row => /^\d+$/.test(row.rule)), false);
        assert.deepEqual(checkMarketReport(bad, reader).failure?.failed, ['2']);
      }
    },
  })),
  { name: 'row 4: Reader v1.2 lists U13 once in its existing observable order', run: async () => {
    const clean = await cleanReport();
    const checked = checkMarketReport(clean, reader);
    assert.equal(checked.failure, null);
    assert.deepEqual(ids(checked.results.filter(row => row.rule.startsWith('U13_'))), u13);
    assert.deepEqual(ids(checked.results).slice(-17), [...u13,
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']);
    const bad = checkMarketReport(append(clean, '<p>Sản phẩm tốt nhất. Ưu tiên số 1.</p>'), reader);
    assert.deepEqual(ids(bad.results.filter(row => row.rule.startsWith('U13_'))), u13);
    assert.deepEqual(bad.failure?.failed, ['U13_SUPERLATIVE', 'U13_PRIORITY']);
  } },
  { name: 'row 5: U32 and W3 refuse the union of total phrases', run: () => {
    const phrases = [
      'tổng hai sàn', 'cộng hai sàn', 'tổng cộng hai nền tảng', 'Shopee + TikTok', 'Shopee + TikTok Shop',
      'gộp Shopee và TikTok', 'gộp Shopee và TikTok Shop', 'gộp TikTok và Shopee', 'gộp TikTok Shop và Shopee',
      'cộng Shopee và TikTok', 'cộng Shopee và TikTok Shop', 'cộng TikTok và Shopee', 'cộng TikTok Shop và Shopee',
      'tổng cả hai sàn', 'tổng Shopee và TikTok', 'tổng TikTok và Shopee',
    ];
    for (const [text, ok] of [
      ['Shopee và TikTok Shop đều có số liệu riêng.', true],
      ...phrases.map(phrase => [phrase, false] as const),
    ] as const) {
      const html = `<p>${text}</p>`;
      assert.equal(verdict(auditMarketReportHtml(html, { presentation: false }), 'U32_NO_CROSS_PLATFORM_TOTAL'), ok, `U32: ${text}`);
      assert.equal(verdict(lint(html), 'W3 không cộng gộp sàn khi trang không ghi tổng'), ok, `W3: ${text}`);
    }
  } },
  { name: 'row 6: M12 requires the full proposal label', run: () => {
    const presentation = (label: string) => '<html><body>' + Array.from({ length: 13 }, (_, i) =>
      `<section id="M${String(i + 1).padStart(2, '0')}">${i === 11
        ? `<table><tr><td>Phương án A</td><td>${label}</td><td>Chủ</td><td>31/10/2026</td></tr></table>` : ''}</section>`).join('') + '</body></html>';
    const full = auditMarketReportHtml(presentation('đề xuất, chờ chủ duyệt'));
    assert.deepEqual(ids(full.filter(row => !row.ok)), []);
    const weak = auditMarketReportHtml(presentation('đề xuất'));
    assert.deepEqual(ids(weak.filter(row => !row.ok)), ['M12_PROPOSAL_LABEL']);
  } },
  ...reasons.map(({ label, version, product, cause, sentences }): Row => ({
    name: `row 7: ${label} publish failure has plain reasons and its original cause`, run: async t => {
      const { service, first } = await policyRun(t);
      const digest = webSnapshotDigest(first.snapshot);
      const request = (name: string) => ({ contractVersion: version, requestKey: randomUUID(),
        metricPackageId: first.packageId, platforms: ['shopee'],
        profile: { ...sync1ReaderFixture().profile, product: name }, cover: null,
        webSnapshot: first.snapshot, webSnapshotSha256: digest,
        ...(version === 'reader-report-build-v1.2'
          ? { source: deriveReaderSource(verifyWebSnapshot(first.snapshot, digest), 8, { nullable: true }) } : {}) });
      const good = await service.buildReaderReport(policyWorkspaceId, policyRunId, request('Hũ thử'),
        { actorId: 'owner:synthetic', role: 'OWNER' });
      assert.ok(good.revision.revisionId);
      await assert.rejects(service.buildReaderReport(policyWorkspaceId, policyRunId, request(product),
        { actorId: 'owner:synthetic', role: 'OWNER' }), (error: unknown) => {
        assert.ok(error instanceof ResearchAutomationValidationError);
        assert.doesNotMatch(error.message, /[A-Z][A-Z0-9]*_[A-Z0-9_]+/);
        assert.doesNotMatch(error.message, /quy tắc:\s*\d/iu);
        let previous = -1;
        for (const sentence of sentences) {
          const position = error.message.indexOf(sentence);
          assert.ok(position > previous, `missing or unordered reason: ${sentence}`);
          previous = position;
        }
        assert.ok(error.cause instanceof Error);
        assert.equal(error.cause.message, cause);
        if (label === 'legacy RR lint') {
          assert.ok(error.cause instanceof ReaderReportGateError);
          assert.deepEqual(ids(error.cause.lint.filter(row => !row.ok)), ['F3 không sót undefined/NaN/null/{{}}']);
        } else assert.ok(error.cause instanceof TypeError);
        return true;
      });
    },
  })),
  { name: 'row 8: Insight U13 ignores hidden wording and refuses the same shown wording', run: () => {
    const insight = (fragment: string) => `<html><body><section id="I04">${fragment}</section></body></html>`;
    for (const fragment of [
      '<span hidden>Sản phẩm tốt nhất.</span>',
      '<p aria-hidden="1">Sản phẩm tốt nhất.</p>',
      '<template><p>Sản phẩm tốt nhất.</p></template>',
    ]) assert.deepEqual(ids(lintVisibleReportText(insight(fragment)).filter(row => !row.ok)), []);
    assert.deepEqual(ids(lintVisibleReportText(insight('<p>Sản phẩm tốt nhất.</p>')).filter(row => !row.ok)), ['U13_SUPERLATIVE']);
  } },
  { name: 'row 9: a class containing hidden leaves wording visible', run: async () => {
    // HTML hides via the hidden attribute; a class token alone has no such meaning.
    const clean = await cleanReport();
    const hidden = '<span hidden>Sản phẩm tốt nhất.</span>';
    const shown = '<span class="x hidden">Sản phẩm tốt nhất.</span>';
    assert.equal(verdict(lintVisibleReportText(hidden), 'U13_SUPERLATIVE'), true);
    assert.equal(verdict(lintVisibleReportText(shown), 'U13_SUPERLATIVE'), false);
    for (const context of [draft, reader]) {
      assert.equal(verdict(checkMarketReport(append(clean, hidden), context).results, 'U13_SUPERLATIVE'), true);
      assert.equal(verdict(checkMarketReport(append(clean, shown), context).results, 'U13_SUPERLATIVE'), false);
    }
  } },
  ...([
    ['neutral official statistic', '<p>Cơ quan thống kê công bố số liệu theo năm.</p>', true],
    ['verbatim source quotation', '<p><q>Sản phẩm tốt nhất.</q></p>', true],
    ['authored superlative', '<p>Sản phẩm tốt nhất.</p>', false],
    ['unconditional priority', '<p>Ưu tiên số 1.</p>', false],
  ] as const).map(([label, fragment, ok]): Row => ({
    name: `row 10: official statistics snippet ${label}`, run: () => {
      assert.equal(marketSnippetWordingPasses(fragment), ok);
    },
  })),
];

for (const row of rows) test(row.name, row.run);

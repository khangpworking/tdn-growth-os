import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { publishReaderReport, ReaderReportGateError } from '../../src/modules/analysis/reader-report/build.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { checkMarketReport, marketSnippetWordingPasses } from '../../src/modules/analysis/research-automation/market-report-check.js';
import { ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { policyRun, policyRunId, policyWorkspaceId } from '../helpers/capture-policy-harness.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

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
  { name: 'review Sol-2: legacy claims retain the complete PR2 lint array bytes', run: async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'c2-legacy-review-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = new ContentAddressedArtifactStore(directory);
    // Frozen from a8bcafe7 lint on these synthetic legacy pages; includes order and every detail.
    for (const [version, digest] of [
      ['1.0.0', 'd92e49525b35276233198f007fcac3b8ddbfb0b8e00da99ef4b6cf7f8408acca'],
      ['1.3.0', '8a1e5598587bd8228b57c4da87bc5702c9555dc9d654afd93b9eafd6e4c7b981'],
    ] as const) {
      const input = sync1ReaderFixture(version);
      if (version === '1.3.0') input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
      const built = await buildMarketReport(computeReaderReportData(input), sync1Options);
      const published = await publishReaderReport(store, { html: built.html, narrator: built.narrator, extraOk: built.extraOk });
      const claims = JSON.parse((await store.read(published.claims.sha256)).toString()) as { lint: unknown };
      assert.equal(createHash('sha256').update(canonicalJson(claims.lint)).digest('hex'), digest);
    }
  } },
  { name: 'review Sol-1: Reader keeps raw inline U13 failures at publication', run: async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'c2-reader-review-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = new ContentAddressedArtifactStore(directory);
    const built = await buildMarketReport(computeReaderReportData({ ...sync1ReaderFixture('1.4.0'), peerRule: { ...DEFAULT_MARKET_PEER_RULE } }), sync1Options);
    const clean = built.html;
    for (const phrase of ['hàng<span>đầu</span>', 'tốt<span>nhất</span>']) {
      for (const bad of [false, true]) {
        const html = append(clean, `<p>${bad ? phrase : phrase.replace(/<[^>]*>/g, '')}</p>`);
        const checked = checkMarketReport(html, reader);
        assert.equal(checked.failure, null);
        assert.ok(checked.visibleText);
        const published = publishReaderReport(store, { html, narrator: built.narrator, extraOk: built.extraOk,
          visibleTextRules: true, visibleTextResults: checked.visibleText });
        if (bad) await assert.rejects(published, (error: unknown) => {
          assert.ok(error instanceof ReaderReportGateError);
          assert.deepEqual(ids(error.lint.filter(row => !row.ok)), ['U13_SUPERLATIVE']);
          assert.match(error.message, /^bản đọc chưa qua cổng kiểm: U13_SUPERLATIVE;/u);
          return true;
        });
        else await published;
      }
    }
  } },
  { name: 'review Sol-2: totals union leaves Insight W3 verdicts unchanged', run: () => {
    for (const phrase of ['Shopee + TikTok', 'gộp Shopee và TikTok', 'tổng cả hai sàn']) {
      const html = `<p>${phrase}</p>`;
      assert.equal(verdict(lint(html, { reportKind: 'INSIGHT' }), 'W3 không cộng gộp sàn khi trang không ghi tổng'), phrase !== 'tổng cả hai sàn');
      assert.equal(verdict(lint(html), 'W3 không cộng gộp sàn khi trang không ghi tổng'), false);
    }
  } },
  { name: 'review O1: hidden inline subtrees cannot split a visible superlative', run: () => {
    for (const hidden of ['hidden', 'aria-hidden="1"', 'style="display:none!important"']) {
      const bad = `<p>Sản phẩm tốt nh<span ${hidden}>chữ ẩn</span>ất.</p>`;
      assert.equal(verdict(auditMarketReportHtml(bad, { presentation: false }), 'U13_SUPERLATIVE'), false);
      assert.equal(verdict(auditMarketReportHtml(`<p>Sản phẩm tốt nhất.</p>`, { presentation: false }), 'U13_SUPERLATIVE'), false);
      assert.equal(verdict(auditMarketReportHtml(`<p><span ${hidden}>Sản phẩm tốt nhất.</span></p>`, { presentation: false }), 'U13_SUPERLATIVE'), true);
    }
  } },
  { name: 'review O2: nested templates keep lane statements hidden', run: () => {
    const title = '<p>mức quan tâm tìm kiếm</p>';
    const statement = '<p>10 lượt tìm kiếm.</p>';
    const hidden = `${title}<template><template></template>${statement}</template>`;
    assert.equal(verdict(auditMarketReportHtml(hidden, { presentation: false }), 'SEARCH_INTEREST_NOT_COUNT'), true);
    assert.equal(verdict(auditMarketReportHtml(title + statement, { presentation: false }), 'SEARCH_INTEREST_NOT_COUNT'), false);
  } },
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

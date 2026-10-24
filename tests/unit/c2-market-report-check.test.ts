import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMarketReport, checkMarketReport, marketSnippetPasses, type MarketCheckContext,
} from '../../src/modules/analysis/research-automation/market-report-check.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

// The existing characterization suite owns caller/version behavior and lexical drift.
// These rows own the new module's context, combined results and error contracts.
const draft = { kind: 'DRAFT_PRESENTATION' } as const;
const totals = [{ measure: 'revenue', value: '1234' }] as const;
const u13 = ['U13_SUPERLATIVE', 'U13_PRIORITY', 'U13_PENDING_NUMBER'];
const ids = (rows: readonly { rule: string }[]) => rows.map(row => row.rule);
const failed = (rows: readonly { rule: string; ok: boolean }[]) => ids(rows.filter(row => !row.ok));
const append = (html: string, fragment: string) => html.replace('</body>', `${fragment}</body>`);
let cleanPromise: Promise<string> | undefined;
const cleanReport = () => cleanPromise ??= fullMarket14Input().then(input =>
  buildResearchAutomationReport(input, 'MARKET').html.toString());

type Row = { name: string; run: () => void | Promise<void> };
const errors: readonly {
  label: string; fragment: string; context: MarketCheckContext; message: string;
}[] = [
  { label: 'business gate precedes the 14 rules', fragment: '<p>Metric; M01.</p>', context: draft,
    message: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME' },
  { label: 'raw U13 precedes the business gate',
    fragment: '<p>Sản phẩm tốt nhất. Làm ngay việc A, tiếp theo việc B. Metric.</p>', context: draft,
    message: 'MARKET_VISIBLE_TEXT_LINT_FAILED:U13_SUPERLATIVE,U13_PRIORITY' },
  { label: '14-rule machine refusal retains its rule number', fragment: '<p>M01</p>', context: draft,
    message: 'MARKET_14_RULES_FAILED:2' },
  { label: 'plain public-review name refusal retains its message', fragment: '<img alt="Metric">',
    context: { kind: 'DRAFT_PLAIN', publicReviewSource: true }, message: 'PUBLIC_REVIEW_READER_NAME_REFUSED' },
];

const rows: Row[] = [
  { name: 'row 1: a presentation provider failure lists G08 once; clean HTML passes', run: async () => {
    const clean = await cleanReport();
    assert.equal(checkMarketReport(clean, draft).failure, null);
    const result = checkMarketReport(append(clean, '<p>Metric</p>'), draft);
    assert.deepEqual(result.failure, { failed: ['G08_PROVIDER_NAME'], message: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME' });
    assert.deepEqual(failed(result.results), ['G08_PROVIDER_NAME']);
    assert.equal(result.results.filter(row => row.rule === 'G08_PROVIDER_NAME').length, 1);
  } },
  { name: 'row 2: presentation partial totals are checked only when supplied', run: async () => {
    const html = append(await cleanReport(), '<p>Doanh thu là 1.234 VND.</p>');
    assert.equal(checkMarketReport(html, draft).failure, null);
    const result = checkMarketReport(html, { ...draft, partialTotals: totals });
    assert.deepEqual(result.failure, { failed: ['PARTIAL_TOTAL_FORBIDDEN'], message: 'MARKET_BUSINESS_GATE_FAILED:PARTIAL_TOTAL_FORBIDDEN' });
    assert.deepEqual(failed(result.results), ['PARTIAL_TOTAL_FORBIDDEN']);
  } },
  { name: 'row 3: two failing ids retain gate order and repeated U13 results appear once', run: async () => {
    const clean = await cleanReport();
    assert.equal(checkMarketReport(clean, draft).failure, null);
    const result = checkMarketReport(append(clean, '<p>Metric; tổng hai sàn.</p>'), draft);
    assert.deepEqual(result.failure, { failed: ['G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL'],
      message: 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME,U32_NO_CROSS_PLATFORM_TOTAL' });
    assert.deepEqual(failed(result.results), ['G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL']);
    assert.deepEqual(ids(result.results), [...u13, 'G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL',
      'E2_NO_REVENUE_ORDER', 'SECTIONS_PRESENT', 'M12_PROPOSAL_LABEL', 'PARTIAL_TOTAL_FORBIDDEN',
      'NO_LEAK', 'SEARCH_INTEREST_NOT_COUNT', 'WORLD_BANK_NOT_ARITHMETIC']);
  } },
  { name: 'row 3: a failing gate U13 replaces its earlier passing raw result', run: async () => {
    const clean = await cleanReport();
    assert.equal(checkMarketReport(append(clean, '<p>Sản phẩm thông thường.</p>'), draft).failure, null);
    const result = checkMarketReport(append(clean, '<p>Sản phẩm tốt nh<span>ất</span>.</p>'), draft);
    assert.deepEqual(result.failure, { failed: ['U13_SUPERLATIVE'], message: 'MARKET_BUSINESS_GATE_FAILED:U13_SUPERLATIVE' });
    assert.deepEqual(failed(result.results), ['U13_SUPERLATIVE']);
    assert.equal(result.results.filter(row => row.rule === 'U13_SUPERLATIVE').length, 1);
  } },
  ...errors.map(({ label, fragment, context, message }): Row => ({ name: `row 4: ${label}`, run: async () => {
    const clean = await cleanReport();
    assert.doesNotThrow(() => assertMarketReport(clean, context));
    const html = append(clean, fragment);
    assert.equal(checkMarketReport(html, context).failure?.message, message);
    assert.throws(() => assertMarketReport(html, context), { constructor: TypeError, message });
  } })),
  { name: 'row 5: stored presentation flag selects section checks', run: () => {
    const html = '<p>Thông tin nguồn.</p>';
    const plain = checkMarketReport(html, { kind: 'STORED', presentation: false });
    assert.equal(plain.failure, null);
    assert.equal(ids(plain.results).includes('SECTIONS_PRESENT'), false);
    const presentation = checkMarketReport(html, { kind: 'STORED', presentation: true });
    assert.deepEqual(presentation.failure?.failed, ['SECTIONS_PRESENT']);
    assert.deepEqual(failed(presentation.results), ['SECTIONS_PRESENT']);
  } },
  ...([false, true] as const).map((presentation): Row => ({
    name: `row 5: stored presentation=${presentation} preserves supplied partial totals`, run: async () => {
      const html = append(await cleanReport(), '<p>Doanh thu là 1.234 VND.</p>');
      const context = { kind: 'STORED', presentation } as const;
      assert.equal(checkMarketReport(html, context).failure, null);
      const result = checkMarketReport(html, { ...context, partialTotals: totals });
      assert.deepEqual(result.failure, { failed: ['PARTIAL_TOTAL_FORBIDDEN'], message: 'MARKET_BUSINESS_GATE_FAILED:PARTIAL_TOTAL_FORBIDDEN' });
      assert.deepEqual(failed(result.results), ['PARTIAL_TOTAL_FORBIDDEN']);
    },
  })),
  { name: 'row 5: stored context accepts a 14-rule-only failure', run: async () => {
    const html = append(await cleanReport(), '<p>M01</p>');
    assert.deepEqual(checkMarketReport(html, draft).failure?.failed, ['2']);
    for (const presentation of [false, true]) {
      const result = checkMarketReport(html, { kind: 'STORED', presentation });
      assert.equal(result.failure, null);
      assert.deepEqual(failed(result.results), []);
      assert.equal(ids(result.results).includes('2'), false);
    }
  } },
  { name: 'row 5: stored public-review context checks provider metadata', run: () => {
    const html = '<p data-source="Metric">Thông tin nguồn.</p>';
    const context = { kind: 'STORED', presentation: false } as const;
    assert.equal(checkMarketReport(html, context).failure, null);
    assert.deepEqual(checkMarketReport(html, { ...context, publicReviewSource: true }).failure?.failed, ['G08_PROVIDER_NAME']);
  } },
  { name: 'plain draft omits business and U13 checks but enforces public-review names', run: () => {
    const html = '<p>Metric; Sản phẩm tốt nhất.</p>';
    assert.deepEqual(checkMarketReport(html, { kind: 'DRAFT_PLAIN' }), { results: [], failure: null });
    assert.equal(checkMarketReport(html, { kind: 'DRAFT_PLAIN', publicReviewSource: true }).failure?.message,
      'PUBLIC_REVIEW_READER_NAME_REFUSED');
  } },
  ...([
    ['clean', '', []],
    ['provider and total', '<p>Metric; tổng hai sàn.</p>', ['4', '7']],
  ] as const).map(([label, fragment, expected]): Row => ({
    name: `row 6: default and precomputed 14-rule gate agree for ${label} HTML`, run: async () => {
      const html = append(await cleanReport(), fragment);
      const fallback = auditMarket14(html);
      const gate = auditMarketReportHtml(html, { presentation: false });
      assert.deepEqual(failed(fallback.filter(row => row.kind === 'machine')), expected);
      assert.deepEqual(auditMarket14(html, undefined, { gate }), fallback);
    },
  })),
  { name: 'row 6: a disagreeing supplied gate changes rules 4 and 7', run: async () => {
    const html = await cleanReport();
    const gate = auditMarketReportHtml(html, { presentation: false });
    const clean = auditMarket14(html, undefined, { gate });
    assert.deepEqual(failed(clean.filter(row => row.kind === 'machine')), []);
    const disagrees = gate.map(row => ['G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL'].includes(row.rule)
      ? { ...row, ok: false, detail: 'synthetic precomputed refusal' } : row);
    const result = auditMarket14(html, undefined, { gate: disagrees });
    assert.deepEqual(failed(result.filter(row => row.kind === 'machine')), ['4', '7']);
    assert.deepEqual(result.filter(row => !['4', '7'].includes(row.rule)), clean.filter(row => !['4', '7'].includes(row.rule)));
  } },
  { name: 'row 7: snippet baseline accepts identical and quoted snippets, refuses authored ranking', run: () => {
    const baseline = '<p>Thông tin nguồn.</p>';
    assert.equal(marketSnippetPasses(baseline, baseline), true);
    assert.equal(marketSnippetPasses('<p><span data-quote>xếp hạng theo doanh thu</span></p>', baseline), true);
    assert.equal(marketSnippetPasses('<p>xếp hạng theo doanh thu</p>', baseline), false);
  } },
];

for (const row of rows) test(row.name, row.run);

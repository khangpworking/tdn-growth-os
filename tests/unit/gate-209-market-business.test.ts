import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

function reportHtml(extra = ''): string {
  const sections = Array.from({ length: 13 }, (_, index) => {
    const id = `M${String(index + 1).padStart(2, '0')}`;
    return `<section id="${id}"><h2>${id}</h2>${id === 'M12' ? '<p>Chưa có kết quả cho mục này.</p>' : ''}</section>`;
  }).join('');
  return `<!doctype html><html><head><title>Synthetic Market</title></head><body>${sections}${extra}</body></html>`;
}

function check(html: string, rule: string) {
  return auditMarketReportHtml(html).find(result => result.rule === rule)!;
}

test('synthetic Market HTML passes the complete business gate and includes all U13 checks', () => {
  const results = auditMarketReportHtml(reportHtml());
  assert.ok(results.every(result => result.ok), JSON.stringify(results));
  assert.deepEqual(results.slice(-3).map(result => result.rule), ['U13_SUPERLATIVE', 'U13_PRIORITY', 'U13_PENDING_NUMBER']);
  assert.ok(results.every(result => result.detail.length <= 3 * 160 + 6));
});

const failingRules: readonly [string, string][] = [
  ['G08_PROVIDER_NAME', '<details><summary>Metric</summary><p>Provider text</p></details>'],
  ['U32_NO_CROSS_PLATFORM_TOTAL', '<p>tổng hai sàn</p>'],
  ['E2_NO_REVENUE_ORDER', '<p>top 3 theo doanh thu</p>'],
  ['SECTIONS_PRESENT', '<section id="M13"><p>duplicate</p></section>'],
  ['M12_PROPOSAL_LABEL', '<p>Phương án A</p>'],
  ['NO_LEAK', '<p>owner@example.test</p>'],
];

for (const [rule, extra] of failingRules) {
  test(`${rule} fails`, () => {
    const html = rule === 'M12_PROPOSAL_LABEL' ? reportHtml().replace('Chưa có kết quả cho mục này.', 'Phương án A') : reportHtml(extra);
    assert.equal(check(html, rule).ok, false);
  });
}

test('hidden and script provider text do not trigger G08', () => {
  assert.equal(check(reportHtml('<div hidden>Metric OpenAI</div><script>Anthropic</script><p>Shopee TikTok</p>'), 'G08_PROVIDER_NAME').ok, true);
});

test('G08 checks reader-visible provider attributes but ignores href URLs', () => {
  assert.equal(check(reportHtml('<img alt="OpenAI"><div title="Anthropic" aria-label="gpt-4o"></div>'), 'G08_PROVIDER_NAME').ok, false);
  assert.equal(check(reportHtml('<a href="https://OpenAI.example/source">source</a>'), 'G08_PROVIDER_NAME').ok, true);
});

test('quoted ranking text does not trigger E2', () => {
  const result = check(reportHtml('<blockquote>top 3 theo doanh thu và thị phần</blockquote><q data-quote>xếp hạng</q>'), 'E2_NO_REVENUE_ORDER');
  assert.equal(result.ok, true);
});

test('Shopee and TikTok names alone pass the cross-platform total rule', () => {
  assert.equal(check(reportHtml('<p>Shopee và TikTok Shop được hiển thị riêng.</p>'), 'U32_NO_CROSS_PLATFORM_TOTAL').ok, true);
});

test('inline tags are concatenated for every lexical gate', () => {
  assert.equal(check(reportHtml('<p>Ope<span>nAI</span></p>'), 'G08_PROVIDER_NAME').ok, false);
  assert.equal(check(reportHtml('<p>tổ<span>ng hai sàn</span></p>'), 'U32_NO_CROSS_PLATFORM_TOTAL').ok, false);
  assert.equal(check(reportHtml('<p>to<span>p 3</span></p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  const proposal = reportHtml().replace('Chưa có kết quả cho mục này.', 'phương <span>án</span> A');
  assert.equal(check(proposal, 'M12_PROPOSAL_LABEL').ok, false);
});

test('NO_LEAK decodes entities and catches bare path prefixes at end of text', () => {
  for (const value of ['owner&#64;example.com', 'owner&#x40;example.com', 'C:\\', 'D:\\']) {
    assert.equal(check(reportHtml(`<p>${value}</p>`), 'NO_LEAK').ok, false, value);
  }
});

test('SECTIONS_PRESENT counts parsed sections, not script or comment strings', () => {
  const ids = Array.from({ length: 13 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`).join('');
  const html = '<script>' + ids.replace(/M\d\d/gu, id => `<section id="${id}"></section>`) + '</script><!-- ' +
    ids.replace(/M\d\d/gu, id => `<section id="${id}"></section>`) + ' -->';
  assert.equal(check(html, 'SECTIONS_PRESENT').ok, false);
});

test('assertion helper applies only content rules to non-presentation Market HTML', () => {
  const html = '<p>Market content Shopee và TikTok Shop.</p>';
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
});

test('the gate includes failing U13 results from visible-text lint', () => {
  assert.equal(check(reportHtml('<p>Sản phẩm tốt nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p>Làm ngay việc A, tiếp theo việc B.</p>'), 'U13_PRIORITY').ok, false);
  assert.equal(check(reportHtml('<p data-classified="pending">Có 2 bản ghi.</p>'), 'U13_PENDING_NUMBER').ok, false);
});

test('provider names in a Market build fail inside buildResearchAutomationReport', () => {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  const input = { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: null, captures: [], marketPresentation } as unknown as AutomationReportInput;
  assert.doesNotThrow(() => buildResearchAutomationReport(input, 'MARKET'));
  const bad = structuredClone(input);
  (bad.marketPresentation as NonNullable<AutomationReportInput['marketPresentation']>).findings[0]!.statement = 'Metric';
  assert.throws(() => buildResearchAutomationReport(bad, 'MARKET'), /MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME/);
});

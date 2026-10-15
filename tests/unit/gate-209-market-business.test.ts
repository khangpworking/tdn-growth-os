import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { assertMarketBusinessGate, auditMarketReportHtml, partialRowTotals, type PartialRowTotal } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';

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

test('plain balanced q text does not trigger U13, but a stray q cannot hide a claim', () => {
  assert.equal(check(reportHtml('<p><q>Sản phẩm tốt nhất.</q></p>'), 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Sản phẩm tốt nhất.<q>x</q></p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p><q>Sản phẩm tốt nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
});

test('renderer ranking disclaimers do not trigger E2', () => {
  const phrases = [
    'Danh mục chưa xếp hạng',
    'không so sánh, xếp hạng hay tính thị phần',
    'thứ tự không phải xếp hạng',
    'không phải xếp hạng năng lực',
    'không xếp hạng, chấm điểm, tính chênh lệch hay tỷ lệ',
    'Chỉ có một quote; không so sánh, xếp hạng hoặc khuyến nghị.',
    'không cộng hoặc xếp hạng',
    'không phải bảng xếp hạng',
    'không phải thị phần toàn thị trường',
  ];
  for (const phrase of phrases) {
    assert.equal(check(reportHtml(`<p>${phrase}</p>`), 'E2_NO_REVENUE_ORDER').ok, true, phrase);
  }
});

test('affirmative ranking and market-share language still fails E2', () => {
  const phrases = [
    'xếp hạng theo doanh thu',
    'Bảng xếp hạng',
    'thị phần của X là 30%',
    'Thứ tự theo doanh thu',
    'top 3',
  ];
  for (const phrase of phrases) {
    assert.equal(check(reportHtml(`<p>${phrase}</p>`), 'E2_NO_REVENUE_ORDER').ok, false, phrase);
  }
});

test('a negation in a previous sentence does not exempt later affirmative E2 text', () => {
  const result = check(reportHtml('<p>Không xếp hạng. Xếp hạng theo doanh thu.</p>'), 'E2_NO_REVENUE_ORDER');
  assert.equal(result.ok, false);
});

test('an unrelated negation does not exempt a later E2 ranking claim', () => {
  assert.equal(check(reportHtml('<p>Không có dữ liệu đối chiếu nên xếp hạng theo doanh thu được trình bày.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Không có dữ liệu đối chiếu, xếp hạng theo doanh thu hay thị phần được trình bày dưới đây.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
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

test('round 3: E2 negation stops at a contrast or a bare comma list', () => {
  assert.equal(check(reportHtml('<p>Không có dữ liệu đối chiếu, nhưng xếp hạng theo doanh thu vẫn được trình bày.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Không có dữ liệu đối chiếu, xếp hạng theo doanh thu được trình bày.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Không so sánh, xếp hạng hay tính thị phần.</p>'), 'E2_NO_REVENUE_ORDER').ok, true);
});

test('round 10: a negated verb with a closed object list covers ranking (quote-method limit)', () => {
  assert.equal(check(reportHtml('<p>Không tính chi phí, lợi nhuận hoặc xếp hạng chào bán.</p>'), 'E2_NO_REVENUE_ORDER').ok, true);
  assert.equal(check(reportHtml('<p>Không tính chi phí hoặc xếp hạng theo doanh thu được trình bày.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Không tính chi phí, xếp hạng theo doanh thu.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Không tính chi phí hoặc xếp hạng 3 sản phẩm.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
});

test('round 3: a closed quote span does not hide the claim that follows it', () => {
  assert.equal(check(reportHtml('<p><span data-quote>trích</span> Sản phẩm tốt nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<span data-quote>source</span><p>Sản phẩm tốt nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p><span data-quote>Sản phẩm tốt nhất</span></p>'), 'U13_SUPERLATIVE').ok, true);
});

test('round 3: the common-word brand matches only as written, not inside method identifiers', () => {
  assert.equal(check(reportHtml('<p>Phương pháp metric-scope-v1 · percent-half-even-2-v1.</p>'), 'G08_PROVIDER_NAME').ok, true);
  assert.equal(check(reportHtml('<p>Nguồn Metric.</p>'), 'G08_PROVIDER_NAME').ok, false);
  assert.equal(check(reportHtml('<p>Nguồn METRIC.</p>'), 'G08_PROVIDER_NAME').ok, false);
});

test('round 3: method wording about records is not a superlative', () => {
  assert.equal(check(reportHtml('<p>Số bản ghi không nhất thiết là số sản phẩm hoặc biến thể riêng biệt.</p>'), 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Số đối tượng duy nhất: chưa xác định.</p>'), 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Tệp chỉ gồm 3<sup>[1]</sup> sản phẩm doanh thu cao nhất (giới hạn 5.000 dòng).</p>'), 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Đề xuất chọn 3 sản phẩm doanh thu cao nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p>Sản phẩm A là đối tượng duy nhất đáp ứng yêu cầu.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p>Sản phẩm A có doanh thu cao nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
});

test('round 8: distinct-record count labels are not superlatives', () => {
  assert.equal(check(reportHtml('<dl><dt>Khai báo được đưa vào</dt><dd>201</dd><dt>Bản ghi duy nhất</dt><dd>201</dd></dl>'), 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Đối chiếu 201 bản ghi duy nhất trong lớp mã hóa.</p>'), 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Sản phẩm A là đối tượng duy nhất đáp ứng yêu cầu.</p>'), 'U13_SUPERLATIVE').ok, false);
});

test('round 9: renderer limitation wording is not revenue ranking or a superlative', () => {
  const html = reportHtml('<p>Không suy ra tỷ lệ, tổng thể hay thị phần.</p><p>M06 đếm bản ghi; không phải đối tượng duy nhất, tồn kho hay toàn bộ nguồn cung.</p>');
  assert.equal(check(html, 'E2_NO_REVENUE_ORDER').ok, true);
  assert.equal(check(html, 'U13_SUPERLATIVE').ok, true);
  assert.equal(check(reportHtml('<p>Bản lưu không cung cấp quy mô thị trường, tăng trưởng năm hoặc thị phần toàn thị trường.</p>'), 'E2_NO_REVENUE_ORDER').ok, true);
  assert.equal(check(reportHtml('<p>Chưa xác lập thị phần hoặc mức cạnh tranh của toàn thị trường.</p>'), 'E2_NO_REVENUE_ORDER').ok, true);
  assert.equal(check(reportHtml('<p>Không cung cấp dữ liệu đối chiếu, thị phần của X là 30%.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Không cung cấp dữ liệu đối chiếu hay thị phần của X là 30%.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>Thị phần của A là 30%.</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p>A là đối tượng duy nhất đáp ứng yêu cầu.</p>'), 'U13_SUPERLATIVE').ok, false);
});

test('round 12: negated market-share lists reject every affirmative predicate tail', () => {
  const predicates = ['cao', 'là cao', 'cao hơn B', 'lớn hơn B', 'dẫn đầu B', 'vượt B', 'đứng đầu', 'chiếm', 'tăng', 'giảm', 'ưu thế', 'nhất'];
  for (const predicate of predicates) {
    const phrase = `Không cung cấp dữ liệu đối chiếu hay thị phần của A ${predicate}.`;
    assert.equal(check(reportHtml(`<p>${phrase}</p>`), 'E2_NO_REVENUE_ORDER').ok, false, phrase);
  }
});

test('round 12: round-10 negated verb lists reject affirmative market-share tails', () => {
  const predicates = ['cao', 'là cao', 'cao hơn B', 'lớn hơn B', 'dẫn đầu B', 'vượt B', 'đứng đầu', 'chiếm', 'tăng', 'giảm', 'ưu thế', 'nhất'];
  for (const predicate of predicates) {
    for (const prefix of ['Không tính chi phí hoặc', 'Không tính chi phí, lợi nhuận hoặc']) {
      const phrase = `${prefix} thị phần của A ${predicate}.`;
      assert.equal(check(reportHtml(`<p>${phrase}</p>`), 'E2_NO_REVENUE_ORDER').ok, false, phrase);
    }
  }
});

test('round 12: true absence lists and Unicode predicate boundaries remain correct', () => {
  const accepted = [
    'Không cung cấp dữ liệu đối chiếu hay thị phần.',
    'Bản lưu không cung cấp quy mô thị trường, tăng trưởng năm hoặc thị phần toàn thị trường.',
    'Chưa xác lập thị phần hoặc mức cạnh tranh của toàn thị trường.',
    'Không tính chi phí, lợi nhuận hoặc xếp hạng chào bán.',
  ];
  for (const phrase of accepted) {
    assert.equal(check(reportHtml(`<p>${phrase}</p>`), 'E2_NO_REVENUE_ORDER').ok, true, phrase);
  }
  for (const predicate of ['là cao', 'có cao', 'chiếm', 'chiếm ưu thế', 'tăng', 'giảm', 'nhất']) {
    const phrase = `Không cung cấp dữ liệu đối chiếu hay thị phần của A ${predicate}.`;
    assert.equal(check(reportHtml(`<p>${phrase}</p>`), 'E2_NO_REVENUE_ORDER').ok, false, phrase);
  }
});

test('provider names in a Market build fail inside buildResearchAutomationReport', async () => {
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
    collection: null, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows) } as unknown as AutomationReportInput;
  assert.doesNotThrow(() => buildResearchAutomationReport(input, 'MARKET'));
  const html = buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');
  const charts = [...html.matchAll(/<div class="chart flint" data-engine="([^"]+)">/gu)].map(match => match[1]);
  assert.deepEqual(charts, ['flint', 'flint', 'flint'], 'revenue by platform, concentration and product rows are Flint charts');
  assert.doesNotMatch(html, /market-concentration/, 'the hand-drawn concentration chart is replaced');
  const { marketPresentationCharts: _charts, ...withoutCharts } = input;
  assert.throws(() => buildResearchAutomationReport(withoutCharts as AutomationReportInput, 'MARKET'), /MARKET_14_RULES_FAILED:.*11/u, 'a presentation without its charts fails rule 11');
  const readerSanitized = structuredClone(input);
  (readerSanitized.marketPresentation as NonNullable<AutomationReportInput['marketPresentation']>).findings[0]!.statement = 'Metric';
  assert.doesNotThrow(() => buildResearchAutomationReport(readerSanitized, 'MARKET'));
  const leaking = structuredClone(input);
  (leaking.start.requestedPeriod as { startDate: string }).startDate = 'Metric';
  assert.throws(() => buildResearchAutomationReport(leaking, 'MARKET'), /MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME/);
});

test('round 5: an unmatched or nested unbalanced quote cannot hide an E2 claim', () => {
  assert.equal(check(reportHtml('<p><q>xếp hạng theo doanh thu</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p><q><q>trích</q> xếp hạng theo doanh thu</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p><span data-quote>top 3 sản phẩm</p>'), 'E2_NO_REVENUE_ORDER').ok, false);
  assert.equal(check(reportHtml('<p><q>xếp hạng theo doanh thu</q></p>'), 'E2_NO_REVENUE_ORDER').ok, true);
  assert.equal(check(reportHtml('<blockquote><p>top 3 theo doanh thu</p></blockquote>'), 'E2_NO_REVENUE_ORDER').ok, true);
});

test('round 5: a sampling sentence does not exempt a later recommendation in the same block', () => {
  assert.equal(check(reportHtml('<p>Tệp gồm 3 sản phẩm doanh thu cao nhất. Đề xuất chọn 3 sản phẩm doanh thu cao nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p>Đề xuất chọn 3 sản phẩm doanh thu cao nhất. Tệp gồm 3 sản phẩm doanh thu cao nhất.</p>'), 'U13_SUPERLATIVE').ok, false);
  assert.equal(check(reportHtml('<p>Tệp gồm 3 sản phẩm doanh thu cao nhất. Mẫu lấy 1.200 sản phẩm doanh thu cao nhất.</p>'), 'U13_SUPERLATIVE').ok, true);
});
test('round 6: an unclosed quote in the visible-text rules cannot hide a superlative', () => {
  for (const html of ['<p><span data-quote>Sản phẩm tốt nhất.</p>', '<blockquote><p>Sản phẩm tốt nhất.</p>', '<p><q>Sản phẩm tốt nhất.</p>', '<p><q><q>trích</q> Sản phẩm tốt nhất.</p>'])
    assert.equal(check(reportHtml(html), 'U13_SUPERLATIVE').ok, false, html);
  for (const html of ['<p><q>Sản phẩm tốt nhất.</q></p>', '<blockquote><p>Sản phẩm tốt nhất.</p></blockquote>', '<p><span data-quote>Sản phẩm tốt nhất.</span></p>'])
    assert.equal(check(reportHtml(html), 'U13_SUPERLATIVE').ok, true, html);
});

test('round 7: mis-nested, raw-text, and hidden closes cannot hide claims', () => {
  const superlative = 'S\u1ea3n ph\u1ea9m t\u1ed1t nh\u1ea5t.';
  const revenueOrder = 'x\u1ebfp h\u1ea1ng theo doanh thu';
  const malformed = [
    `<p><q><span>${superlative}</q></span></p>`,
    `<p><q>${superlative}<script></q></script></p>`,
    `<p><q><span hidden>fake close </q></span>${superlative}</p>`,
    `<p><span data-quote><b>${superlative}</span></b></p>`,
    `<p><blockquote><span>${superlative}</blockquote></span></p>`,
  ];
  for (const extra of malformed) {
    assert.equal(check(reportHtml(extra), 'U13_SUPERLATIVE').ok, false, extra);
    assert.equal(check(reportHtml(extra.replaceAll(superlative, revenueOrder)), 'E2_NO_REVENUE_ORDER').ok, false, extra);
  }
  for (const extra of [
    `<p><q><span>${superlative}</span></q></p>`,
    `<p><q>${superlative}<script>x</script></q></p>`,
    `<p><q><span hidden>hidden</span>${superlative}</q></p>`,
    `<p><span data-quote><b>${superlative}</b></span></p>`,
  ]) {
    assert.equal(check(reportHtml(extra), 'U13_SUPERLATIVE').ok, true, extra);
    assert.equal(check(reportHtml(extra.replaceAll(superlative, revenueOrder)), 'E2_NO_REVENUE_ORDER').ok, true, extra);
  }
});

function partialCheck(extra: string, partialTotals: readonly PartialRowTotal[]) {
  return auditMarketReportHtml(reportHtml(extra), { partialTotals }).find(result => result.rule === 'PARTIAL_TOTAL_FORBIDDEN')!;
}

test('PARTIAL_TOTAL_FORBIDDEN: a row sum with a missing member is never stated as a revenue or units figure', () => {
  const revenue: PartialRowTotal[] = [{ measure: 'revenue', value: '1300000000' }];
  const statement = '<p>Doanh thu quan sát: <strong>1.300.000.000 VND</strong>; sản lượng: <strong>không có số liệu</strong>; 15 dòng, 9 gian hàng.</p>';
  assert.equal(partialCheck(statement, revenue).ok, false);
  assert.match(partialCheck(statement, revenue).detail, /1\.300\.000\.000 VND/u);
  assert.equal(partialCheck(statement.replace('</p>', ' Đây là số của cả tập kết quả theo bộ lọc trên trang.</p>'), revenue).ok, false, 'a label does not make a partial sum a total');
  assert.equal(partialCheck('<p>Doanh thu: 1300000000 VND</p>', revenue).ok, true, 'only the formatted figure the renderer prints is matched');
  assert.equal(partialCheck('<p>Doanh thu: 21.300.000.000 VND; 1.300.000.0001 VND</p>', revenue).ok, true, 'a longer number is a different figure');
  assert.equal(partialCheck('<table><tr><td>1.300.000.000 VND</td></tr></table>', revenue).ok, true, 'one row value in a row table is not a total');
  assert.equal(partialCheck('<li>Bảng dòng<table><tr><td>1.300.000.000 VND</td></tr></table></li>', revenue).ok, true);
  assert.equal(partialCheck('<!-- <p>1.300.000.000 VND</p> -->', revenue).ok, true);
  const price: PartialRowTotal[] = [{ measure: 'revenue', value: '1300000' }];
  assert.equal(partialCheck('<p>Giá niêm yết: 1.300.000 VND; mức giá sau giảm 1.300.000 VND.</p>', price).ok, true, 'a quoted unit price is not a total');
  assert.equal(partialCheck('<p>Doanh thu 5.000.000 VND, giá 1.300.000 VND.</p>', price).ok, true, 'the nearest measure word since the previous number decides');
  assert.equal(partialCheck('<p>Giá bán cao nên doanh thu 1.300.000 VND.</p>', price).ok, false, 'a revenue figure after a price word still fails');
  assert.equal(partialCheck('<p>Giá niêm yết 1.300.000 VND; tổng 1.300.000 VND.</p>', price).ok, false, 'each occurrence is checked');
  assert.equal(partialCheck('<p>Tổng giá trị 1.300.000 VND; đánh giá 1.300.000 VND.</p>', price).ok, false, '"giá trị" and "đánh giá" are not prices');

  const demand: PartialRowTotal[] = [{ measure: 'revenue', value: '21200000' }, { measure: 'units', value: '34' }];
  const quat = '<li><strong>Doanh số (ước tính)</strong> Mẫu lưu ghi nhận 21.200.000 VND doanh thu (ước tính); 34 đơn vị bán (ước tính) trên cả hai nền tảng.</li>';
  assert.equal(partialCheck(quat, demand).ok, false);
  assert.equal(partialCheck(quat.replace('21.200.000 VND doanh thu (ước tính); ', ''), [{ measure: 'units', value: '34' }]).ok, false, 'units alone');
  assert.equal(partialCheck('<p>Doanh thu quan sát: <strong>chưa xác định</strong>; sản lượng: <strong>34</strong>; 2 dòng.</p>', [{ measure: 'units', value: '34' }]).ok, false);
  assert.equal(partialCheck('<p>34 dòng, 34 gian hàng; giá 34.000 VND.</p>', [{ measure: 'units', value: '34' }]).ok, true, 'a count of rows or shops is not units');

  const clean = auditMarketReportHtml(reportHtml(statement));
  assert.ok(clean.some(result => result.rule === 'PARTIAL_TOTAL_FORBIDDEN' && result.ok), 'without partial totals the rule is present and passes');
  assert.ok(auditMarketReportHtml(reportHtml(statement), { presentation: false, partialTotals: revenue }).some(result => result.rule === 'PARTIAL_TOTAL_FORBIDDEN' && !result.ok));
  assert.throws(() => assertMarketBusinessGate(reportHtml(statement), { partialTotals: revenue }), /MARKET_BUSINESS_GATE_FAILED:PARTIAL_TOTAL_FORBIDDEN/u);
});

test('partialRowTotals keeps only non-zero row sums with a missing member, once each', () => {
  const total = (value: string | null, missingCount: number) => ({ value, observedCount: 2, missingCount, nonExactCount: 0, complete: missingCount === 0 && value !== null });
  const scope = (revenue: ReturnType<typeof total>, units: ReturnType<typeof total>, key = 'all', sensitivity = total('70', 1)) => ({ key, revenue, units,
    groups: [{ revenue, units: total('9', 0) }], withoutTopShop: { revenue: sensitivity } });
  const found = partialRowTotals([
    { scopes: [scope(total('100', 1), total('7', 0)), scope(total('100', 1), total('0', 3))] },
    { scopes: [scope(total('500', 0), total(null, 2))] },
    null, undefined,
  ] as unknown as Parameters<typeof partialRowTotals>[0]);
  assert.deepEqual(found, [{ measure: 'revenue', value: '100' }, { measure: 'revenue', value: '70' }]);
  const one = [{ scopes: [scope(total('100', 1), total('7', 0))] }] as unknown as Parameters<typeof partialRowTotals>[0];
  assert.deepEqual(partialRowTotals(one, [{ measure: 'revenue', value: '100' }]), [{ measure: 'revenue', value: '70' }],
    'a value the report also states as a complete page figure is left out');
  assert.deepEqual(partialRowTotals(one, [{ measure: 'units', value: '100' }]), found,'only the same measure is left out');
  assert.deepEqual(partialRowTotals([...one, { scopes: [scope(total('70', 0), total('7', 0))] }] as unknown as Parameters<typeof partialRowTotals>[0]),
    [{ measure: 'revenue', value: '100' }], 'a value another ALL scope states as a complete total is left out');
  assert.deepEqual(partialRowTotals([...one, { scopes: [scope(total('70', 0), total('7', 0), 'wide', total('5', 0))] }] as unknown as Parameters<typeof partialRowTotals>[0]),
    found, 'a WIDE/CORE total is only shown in a row table, so it never clears a partial value');
  assert.deepEqual(partialRowTotals([...one, { scopes: [scope(total('5', 0), total('7', 0), 'core', total('100', 0))] }] as unknown as Parameters<typeof partialRowTotals>[0]),
    [{ measure: 'revenue', value: '70' }], 'a complete sensitivity revenue is stated in prose, so it is left out');
  const complete = calculateMetricScopes(metricFixture());
  assert.deepEqual(partialRowTotals([complete]), [], 'a fully observed fixture has no partial sums');
});

test('a Market build with a missing row states no partial sum and passes the gate', async () => {
  const fixture = metricFixture();
  fixture.records[0]!.revenue = { ...fixture.records[0]!.revenue, state: 'missing', value: null, displayedValue: null };
  const metric = calculateMetricScopes(fixture);
  const partial = partialRowTotals([metric]);
  assert.ok(partial.some(total => total.measure === 'revenue'), JSON.stringify(partial));
  const rows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  assert.equal(marketPresentation.findings.some(finding => finding.id === 'demand' && /\d VND doanh thu/u.test(finding.statement)), false);
  const input = { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: null, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows) } as unknown as AutomationReportInput;
  const html = buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');
  assert.equal(auditMarketReportHtml(html, { partialTotals: partial }).find(result => result.rule === 'PARTIAL_TOTAL_FORBIDDEN')!.ok, true);
});

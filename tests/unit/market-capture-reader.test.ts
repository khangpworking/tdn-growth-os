import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { CitationRegistry, type CitationEntry } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationMarkOrMissing } from '../../src/modules/analysis/citation-register-html.js';
import { UNKNOWN_SHOP } from '../../src/modules/analysis/reader-report/market-charts.js';
import { plainCaptureNumbers } from '../../src/modules/analysis/reader-report/format.js';
import { renderAutomationMarketFindings } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import { buildAutomationMarketPresentation, marketPresentationDigest } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { captureSampleSentence, marketSourceScopeSection, projectMarketSourceScope } from '../../src/modules/analysis/research-automation/market-scope-report.js';
import { deliverMarketReader, stripTraceDetails } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { buildAutomationSourceClaims } from '../../src/modules/analysis/research-automation/source-claims.js';
import { buildAutomationM01EvidenceInventory } from '../../src/modules/analysis/research-automation/m01-evidence-inventory.js';
import type { CaptureMetricMethodDetails } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import type { ReportCitations } from '../../src/modules/analysis/research-automation/descriptive-report.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2, type CaptureRowExclusionReason } from '../../src/modules/analysis/research-automation/capture-row-quality.js';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const banned = /%|toàn thị trường|tổng|cộng|gộp|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|zen-studio|Google|nhất|hàng đầu|ưu tiên/iu;
const text = (node: Element) => node.textContent!.replace(/\s+/gu, ' ').trim();
const registry = () => {
  const source = new CitationRegistry();
  const citations: ReportCitations = { mark: entry => renderCitationMarkOrMissing(source.cite(entry)) };
  return { source, citations };
};
function platformResult(platform: 'shopee' | 'tiktok', count: number, missing = false) {
  const input = metricFixture();
  input.scope.platform = platform;
  input.records = input.records.slice(0, count).map(row => ({ ...row, shopId: UNKNOWN_SHOP, label: null,
    measurement: { ...row.measurement, platform },
    revenue: { ...row.revenue, state: missing ? 'missing' : 'observed_value', value: missing ? null : platform === 'tiktok' ? '700' : '100', displayedValue: null },
  }));
  return calculateMetricScopes(input);
}
async function fixture() {
  const input = await fullMarket14Input();
  const capture: CaptureMetricMethodDetails = { ...input.metricMethods!.capture!, platforms: [
    { platform: 'shopee', result: platformResult('shopee', 2) },
    { platform: 'tiktok', result: platformResult('tiktok', 1) },
  ] };
  return { input, capture };
}

function assertCitations(document: Document) {
  const ids = [...document.querySelectorAll('.citation-register li')].map(li => li.id);
  const marks = [...document.querySelectorAll('sup.cite')].map(mark => `cite-${mark.textContent!.slice(1, -1)}`);
  assert.deepEqual([...new Set(marks)], ids, 'every mark resolves, with no unused source entries');
}

function excludedRow(platform: 'shopee' | 'tiktok', reason: CaptureRowExclusionReason, rowIndex = 1) {
  return { platform, reason, rowIndex, listingId: `synthetic-excluded-${platform}-${rowIndex}`, title: 'Mẫu thử bị loại', shop: UNKNOWN_SHOP, revenue: null, units: null };
}

test('capture sample sentence uses final v3 copy and frozen v2 copy for none, parts, outliers or both', async () => {
  const { capture } = await fixture();
  const base = { ...capture, capture: { ...capture.capture, keyword: '<b>x</b>' }, rowPolicyVersion: CAPTURE_ROW_PROFILE };
  const cases: [CaptureRowExclusionReason[], string, string][] = [
    [[], '', 'không có dòng nào phải loại trước khi tính'],
    [['NOT_MAIN_PRODUCT'], 'đã loại dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét trước khi tính', 'đã loại phụ kiện, linh kiện hoặc sản phẩm khác trước khi tính'],
    [['UNIT_REVENUE_OUTLIER'], 'đã loại dòng có doanh thu hoặc đơn vị bán bất thường trước khi tính', 'đã loại dòng có doanh thu hoặc đơn vị bán bất thường trước khi tính'],
    [['REVENUE_WITHOUT_UNITS'], 'đã loại dòng có doanh thu hoặc đơn vị bán bất thường trước khi tính', 'đã loại dòng có doanh thu hoặc đơn vị bán bất thường trước khi tính'],
    [['NOT_MAIN_PRODUCT', 'UNIT_REVENUE_OUTLIER', 'REVENUE_WITHOUT_UNITS'], 'đã loại dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét và dòng có doanh thu hoặc đơn vị bán bất thường trước khi tính', 'đã loại phụ kiện, linh kiện hoặc sản phẩm khác và dòng có doanh thu hoặc đơn vị bán bất thường trước khi tính'],
  ];
  for (const [reasons, current, frozen] of cases) for (const profile of [CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2]) {
    const phrase = profile === CAPTURE_ROW_PROFILE ? current : frozen;
    const actual = captureSampleSentence({ ...base, rowPolicyVersion: profile, excludedRows: reasons.map((reason, i) => excludedRow('shopee', reason, i)) });
    assert.equal(actual, `Mẫu gồm các sản phẩm trả về cho từ khóa “&lt;b&gt;x&lt;/b&gt;”${phrase ? `; ${phrase}` : ''}; chưa chia nhóm sản phẩm.`, profile);
    assert.doesNotMatch(actual, /<b>|%|\b0\b|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|Google/iu);
  }
  assert.equal(captureSampleSentence(base), captureSampleSentence({ ...base, excludedRows: [] }), 'missing exclusions mean none');
});

test('sample filter withholds provider-bearing keywords without changing retained evidence', async () => {
  const { input, capture } = await fixture();
  for (const name of ['Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'SerpApi', 'PageIndex', 'Gemini', 'OpenCLI', 'zen-studio', 'Agent-Reach', 'Google']) {
    const value = { ...capture, rowPolicyVersion: CAPTURE_ROW_PROFILE, capture: { ...capture.capture, keyword: `quạt ${name}` } };
    const before = canonicalJson(value);
    const html = stripTraceDetails(marketSourceScopeSection(projectMarketSourceScope(input), 'M02', registry().citations, true, value));
    assert.ok(!html.toLowerCase().includes(name.toLowerCase()), name);
    assert.match(html, /Từ khóa được giữ trong bản lưu/u);
    assert.equal(canonicalJson(value), before);
  }
});

test('Phần 2 reports removed rows per platform only for v3, including empty and untouched platforms', async () => {
  const { input, capture } = await fixture();
  const excludedRows = [excludedRow('shopee', 'NOT_MAIN_PRODUCT'), excludedRow('shopee', 'UNIT_REVENUE_OUTLIER', 2), excludedRow('tiktok', 'REVENUE_WITHOUT_UNITS', 3)];
  const render = (value: CaptureMetricMethodDetails) => stripTraceDetails(marketSourceScopeSection(projectMarketSourceScope(input), 'M02', registry().citations, true, value));
  for (const empty of [false, true]) {
    const filtered = { ...capture, rowPolicyVersion: CAPTURE_ROW_PROFILE, excludedRows,
      platforms: empty ? [{ platform: 'shopee' as const, result: platformResult('shopee', 0) }] : capture.platforms };
    const dom = new JSDOM(render(filtered));
    const lines = [...dom.window.document.querySelectorAll('ul > li')].map(text);
    assert.equal(lines.length, 2);
    assert.ok(lines[0]!.endsWith('; đã loại 2 dòng trước khi tính.'));
    assert.ok(lines[1]!.endsWith('; đã loại 1 dòng trước khi tính.'));
    if (empty) for (const line of lines) assert.match(line, /không còn dòng phù hợp sau khi lọc;/u);
    assert.doesNotMatch(dom.window.document.body.textContent!, /đã loại 3|%|\b0\b|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|Google/iu);
    dom.window.close();
  }
  const noRemoved = new JSDOM(render({ ...capture, rowPolicyVersion: CAPTURE_ROW_PROFILE, excludedRows: excludedRows.slice(0, 2) }));
  const tiktokLine = [...noRemoved.window.document.querySelectorAll('li')].find(li => text(li).startsWith('TikTok Shop:'))!;
  assert.doesNotMatch(text(tiktokLine), /đã loại/u);
  noRemoved.window.close();
  const { rowPolicyVersion: _policy, excludedRows: _excluded, ...legacy } = capture;
  assert.equal(render({ ...legacy, excludedRows }), render(legacy), 'no policy keeps every old scope byte despite stray exclusions');
  assert.equal(render({ ...legacy, rowPolicyVersion: CAPTURE_ROW_PROFILE_V2, excludedRows }), render(legacy), 'retained v2 keeps the main scope bytes, including when it excluded rows');
  assert.match(render(legacy), /Chưa áp dụng phân loại đã duyệt; không suy phạm vi rộng hoặc phạm vi cốt lõi từ từ khóa\./u);
});

test('capture reader scope declares its sample filter only for v3; historical scope wording stays exact', async () => {
  const input = await fullMarket14Input();
  const original = { ...input, scope: { ...input.scope, includeTerms: [], excludeTerms: [] } };
  const before = buildResearchAutomationReport(original, 'MARKET');
  const beforeDom = new JSDOM(before.html.toString());
  const legacy = beforeDom.window.document.querySelector('#M02')!.innerHTML;
  assert.equal((legacy.match(/Không thêm điều kiện/gu) ?? []).length, 2);
  assert.ok(legacy.includes('Chưa phân loại phạm vi.'));
  assert.ok(!legacy.includes('Bộ lọc mẫu'));
  for (const rowPolicyVersion of [CAPTURE_ROW_PROFILE]) {
    const metricMethods = { ...original.metricMethods!, capture: { ...original.metricMethods!.capture!, rowPolicyVersion, excludedRows: [] } };
    const report = buildResearchAutomationReport({ ...original, metricMethods }, 'MARKET');
    const dom = new JSDOM(report.html.toString());
    const scope = dom.window.document.querySelector('#M02')!;
    assert.match(text(scope), /Bộ lọc mẫu/u);
    assert.match(text(scope), /Mọi sản phẩm trả về cho từ khóa đã tìm/u);
    assert.match(text(scope), /Không có điều kiện riêng ngoài bộ lọc mẫu/u);
    assert.match(text(scope), /Chưa chia nhóm sản phẩm\./u);
    assert.doesNotMatch(text(scope), /Không thêm điều kiện|Chưa phân loại phạm vi|%|\b0\b|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|Google/iu);
    const { rowPolicyVersion: _policy, excludedRows: _excluded, ...noPolicy } = metricMethods.capture;
    const historical = buildResearchAutomationReport({ ...original, metricMethods: { ...metricMethods, capture: noPolicy } }, 'MARKET');
    assert.deepEqual(historical.html, before.html, 'removing the marker restores the complete legacy report bytes');
    assert.deepEqual(historical.traceHtml, before.traceHtml);
    dom.window.close();
  }
  beforeDom.window.close();
});

test('capture findings read platforms separately, suppress unknown shops, and retain every M03 finding and citation in trace', async () => {
  const { input, capture } = await fixture();
  const retained = canonicalJson(input);
  const { citations } = registry();
  const fragment = new JSDOM(renderAutomationMarketFindings(input.marketPresentation!, citations, true, capture));
  const reader = new JSDOM(stripTraceDetails(fragment.window.document.body.innerHTML));
  const items = [...reader.window.document.querySelectorAll('.market-findings > li')].slice(0, 4);
  assert.equal(items.length, 4);
  assert.match(text(items[0]!), /Shopee: mẫu đã lưu có 2 dòng sản phẩm, kỳ 17\/08\/2026 đến 15\/09\/2026/u);
  assert.match(text(items[1]!), /Shopee:.*200 VND/u);
  assert.match(text(items[2]!), /TikTok Shop: mẫu đã lưu có 1 dòng sản phẩm/u);
  assert.match(text(items[3]!), /TikTok Shop:.*700 VND/u);
  assert.doesNotMatch(reader.window.document.body.textContent!, /gian hàng|tập trung|900 VND/u);
  assert.doesNotMatch(reader.window.document.body.textContent!, banned);
  for (const item of items) assert.ok(item.querySelector('sup.cite'));
  const old = new JSDOM(renderAutomationMarketFindings(input.marketPresentation!, registry().citations, true));
  for (const doc of [old, fragment]) doc.window.document.querySelectorAll('sup.cite').forEach(mark => mark.remove());
  const retainedItems = [...fragment.window.document.querySelectorAll('details.evidence-trace li')].map(text);
  assert.deepEqual(retainedItems, [...old.window.document.querySelectorAll('.market-findings > li')].slice(0, 4).map(text));
  const report = buildResearchAutomationReport(input, 'MARKET');
  const semantic = report.semantic as { citationEntries: CitationEntry[] };
  assert.equal(semantic.citationEntries.length, 9);
  assert.ok(semantic.citationEntries.some(entry => entry.label === 'Phép tính mẫu xuất đã lưu'));
  for (const html of [report.html, report.traceHtml!]) {
    const dom = new JSDOM(html.toString());
    assertCitations(dom.window.document);
    dom.window.close();
  }
  assert.ok(report.traceHtml!.toString().includes('<summary>Nhận định Phần 3 đã lưu</summary>'));
  assert.ok(!report.html.toString().includes('Nhận định Phần 3 đã lưu'));
  assert.equal(canonicalJson(input), retained, 'rendering never changes retained method inputs');
  for (const dom of [fragment, reader, old]) dom.window.close();
});

test('page figures keep their own citation even without attributed rows; missing rows never become a partial sum or zero', async () => {
  const { input, capture } = await fixture();
  const page = { platform: 'tiktok' as const, revenue: { value: '12345', precision: 'exact' as const, locator: '/groups/W3/tiktok/revenue' }, units: null };
  for (const withRows of [true, false]) {
    const missingResult = platformResult('tiktok', 1, true);
    const varied = { ...capture, platforms: withRows ? [capture.platforms[0]!, { platform: 'tiktok' as const, result: missingResult }] : capture.platforms.slice(0, 1), platformHeadlines: [page] };
    const { source, citations } = registry();
    const dom = new JSDOM(stripTraceDetails(renderAutomationMarketFindings(input.marketPresentation!, citations, true, varied)));
    const pageItem = [...dom.window.document.querySelectorAll('li')].find(li => text(li).includes('12.345 VND'))!;
    assert.ok(pageItem, 'a page figure does not depend on attributed sample rows');
    assert.match(text(pageItem), /chưa có số đơn vị bán/u);
    const n = Number(pageItem.querySelector('sup.cite')!.textContent!.slice(1, -1));
    assert.equal(source.entries().find(entry => entry.number === n)!.label, 'Số liệu nền tảng trong bản lưu nguồn');
    const trace = source.technicalTrace().entries.find(entry => entry.number === n)!;
    assert.equal(trace.identity, capture.snapshotSha256);
    assert.equal(trace.technical.locator, page.revenue.locator);
    if (withRows) {
      assert.match(text(pageItem), /1 dòng thiếu doanh thu/u);
      const rowMark = pageItem.querySelectorAll('sup.cite')[1]!;
      const rowNumber = Number(rowMark.textContent!.slice(1, -1));
      assert.equal(source.technicalTrace().entries.find(entry => entry.number === rowNumber)!.identity, missingResult.inputSha256);
    }
    assert.doesNotMatch(dom.window.document.body.textContent!, banned);
    dom.window.close();
  }
  for (const count of [0, 2]) {
    const varied = { ...capture, platforms: [{ platform: 'shopee' as const, result: platformResult('shopee', count, true) }] };
    const dom = new JSDOM(stripTraceDetails(renderAutomationMarketFindings(input.marketPresentation!, registry().citations, true, varied)));
    assert.doesNotMatch(dom.window.document.body.textContent!, /\b0\b|gian hàng|\d[\d.]* VND/u);
    assert.match(dom.window.document.body.textContent!, /TikTok Shop: chưa có dòng nào/u);
    if (count) assert.match(dom.window.document.body.textContent!, /chưa xác định vì có dòng thiếu số liệu/u);
    dom.window.close();
  }
  const partial = metricFixture();
  partial.records[0]!.revenue = { ...partial.records[0]!.revenue, state: 'missing', value: null };
  const result = calculateMetricScopes(partial);
  const html = stripTraceDetails(renderAutomationMarketFindings(input.marketPresentation!, registry().citations, true,
    { ...capture, platforms: [{ platform: 'shopee', result }] }));
  assert.doesNotMatch(html, /85 VND/u, 'the remaining rows are not reported as a complete figure');
});

test('capture source scope localizes dates, excludes unattributed rows and escapes interpolated dates', async () => {
  const { input, capture } = await fixture();
  const scope = projectMarketSourceScope(input);
  const render = (value: CaptureMetricMethodDetails) => stripTraceDetails(marketSourceScopeSection(scope, 'M02', registry().citations, true, value));
  const dom = new JSDOM(render(capture));
  assert.match(dom.window.document.body.textContent!, /Shopee: lấy ngày 16\/09\/2026; 2 dòng sản phẩm; kỳ 17\/08\/2026 đến 15\/09\/2026/u);
  assert.match(dom.window.document.body.textContent!, /TikTok Shop: lấy ngày 16\/09\/2026; 1 dòng sản phẩm/u);
  assert.doesNotMatch(dom.window.document.body.textContent!, /\b0\b|\/\/|\d{4}-\d{2}-\d{2}/u);
  const unattributed = [{ rowIndex: 0, listingId: 'synthetic-unattributed', title: 'Synthetic item', shop: UNKNOWN_SHOP, revenue: null, units: null }];
  assert.match(render({ ...capture, unattributedRows: unattributed }), /1 dòng không ghi rõ sàn nên không dùng trong số liệu/u);
  const empty = { ...capture, platforms: [{ platform: 'shopee' as const, result: platformResult('shopee', 0) }] };
  assert.doesNotMatch(render(empty), /\b0\b/u);
  const hostile = structuredClone(capture);
  hostile.platforms[0]!.result.input.scope.start = '<img src=x onerror=bad>';
  const escaped = render(hostile);
  assert.ok(escaped.includes('&lt;img src=x onerror=bad&gt;'));
  assert.doesNotMatch(escaped, /<img/u);
  const findings = stripTraceDetails(renderAutomationMarketFindings(input.marketPresentation!, registry().citations, true, hostile));
  assert.ok(findings.includes('&lt;img src=x onerror=bad&gt;'));
  assert.doesNotMatch(findings, /<img/u);
  dom.window.close();
});

for (const profile of [CAPTURE_ROW_PROFILE_V2, CAPTURE_ROW_PROFILE]) test(`${profile}: filtered-empty capture keeps the empty-sample notice and each platform page figure in the reader`, async () => {
  const { input, capture } = await fixture();
  const empty = metricFixture();
  empty.profileId = profile;
  empty.records = [];
  const result = calculateMetricScopes(empty);
  const method = buildAutomationMarketPresentation({ ...input.marketPresentation!.binding,
    metric: { ...input.marketPresentation!.binding.metric!, resultSha256: marketPresentationDigest(result) } },
  { metric: result, rows: [], unitSpec: null });
  const filtered: CaptureMetricMethodDetails = { ...capture, rowPolicyVersion: profile,
    platforms: capture.platforms.map(({ platform }) => ({ platform,
      result: calculateMetricScopes({ ...empty, scope: { ...empty.scope, platform } }) })),
    platformHeadlines: [
      { platform: 'shopee', revenue: { value: '12345', precision: 'exact', locator: '/groups/W3_platformSplit/0/revenue' }, units: null },
      { platform: 'tiktok', revenue: { value: '67890', precision: 'exact', locator: '/groups/W3_platformSplit/1/revenue' }, units: null },
    ] };
  const { source, citations } = registry();
  const reader = new JSDOM(stripTraceDetails(renderAutomationMarketFindings(method, citations, true, filtered)));
  const visible = reader.window.document.body.textContent!;
  assert.match(visible, /Chưa có số lượng mẫu phù hợp để phân tích sau khi lọc/u);
  assert.match(visible, /Shopee:.*12\.345 VND/u);
  assert.match(visible, /TikTok Shop:.*67\.890 VND/u);
  assert.doesNotMatch(visible, /80\.235|\b0\b|%/u);
  for (const platform of ['Shopee', 'TikTok Shop']) {
    const item = [...reader.window.document.querySelectorAll('li')].find(li => text(li).startsWith(`Nhận định: ${platform}: bảng`))!;
    const mark = Number(item.querySelector('sup.cite')!.textContent!.slice(1, -1));
    // The register deduplicates both figures at their shared source and reader locator.
    assert.equal(source.technicalTrace().entries.find(entry => entry.number === mark)!.identity, capture.snapshotSha256);
    assert.equal(source.entries().find(entry => entry.number === mark)!.label, 'Số liệu nền tảng trong bản lưu nguồn');
  }
  const emptyNotice = '<p>Chưa có số lượng mẫu phù hợp để phân tích sau khi lọc. Không suy ra doanh số, số người mua hoặc quy mô ngoài mẫu.</p>';
  assert.equal(renderAutomationMarketFindings(method, registry().citations, true), emptyNotice);
  assert.equal(renderAutomationMarketFindings(method, registry().citations, false, filtered), emptyNotice);
  const report = buildResearchAutomationReport({ ...input, marketPresentation: method, marketPresentationCharts: [],
    metricMethods: { ...input.metricMethods!, result, capture: filtered } }, 'MARKET');
  const page = new JSDOM(report.html.toString());
  assert.match(page.window.document.querySelector('#M01')!.textContent!, /Shopee:.*12\.345 VND/u);
  assert.match(page.window.document.querySelector('#M01')!.textContent!, /TikTok Shop:.*67\.890 VND/u);
  assertCitations(page.window.document);
  page.window.close();
  reader.window.close();
});

test('capture sample wording is idempotent, avoids repeated saved wording, and preserves all quote containers', () => {
  const quote = 'Mẫu xuất đã lưu, mẫu xuất; 2026-10-19';
  const containers = ['q', 'blockquote', 'code', 'pre'];
  const protectedHtml = containers.map(tag => `<${tag}><span>${quote}</span></${tag}>`).join('') + `<span data-quote>${quote}</span>`;
  const html = `<div id="sections"><section class="sheet" id="M01"><p>Mẫu xuất đã lưu; mẫu xuất theo từ khóa.</p>${protectedHtml}</section></div><footer></footer>`;
  const output = deliverMarketReader(html, undefined, true);
  assert.ok(output.includes('<p>Mẫu đã lưu; mẫu đã lưu theo từ khóa.</p>'));
  assert.ok(output.includes(protectedHtml));
  assert.doesNotMatch(output, /đã lưu đã lưu/u);
  assert.equal(deliverMarketReader(output, undefined, true), output);
  assert.ok(deliverMarketReader(html).includes('<p>Mẫu xuất đã lưu; mẫu xuất theo từ khóa.</p>'), 'no capture retains prior wording');
});

// Without capture, 2480414f changes M13's scope pointer and explanation in both
// rendered outputs and the semantic explanation. M04 and M05 stay unchanged.
// The no-presentation html differs only by the fixture's charts from the current renderers; legacy chart bytes stay pinned at bfdaca27 in macro-charts-report.
test('automation reports without capture pin the M13 pointer; without presentation all bytes stay unchanged', async () => {
  const input = await fullMarket14Input();
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  const { marketPresentation: _presentation, ...noPresentation } = input;
  const variants = [
    { value: { ...input, metricMethods }, html: '8adbfe602d5e8798b804ddbf69cbf557890528d2802dc9986f7ea6ed46622bf2', semantic: 'cfefb08635d39a3ddecef46ab0475becb75c7391a2ba5fffc6858dbb1f88047d', trace: 'bf439c8cf5ec7b736a34775c507550d141519a39c04795dfd14762c64ae1ba55' },
    { value: noPresentation, html: '92ada31fa0a8a276d05aedc38fe418c3b5204f0750ef89020453a998526c6da9', semantic: '89b388819561c90b6082847afb079b85aa911457862ca7d542d5335860c3f8a5', trace: null },
  ];
  for (const variant of variants) {
    const report = buildResearchAutomationReport(variant.value, 'MARKET');
    assert.equal(hash(report.html), variant.html);
    assert.equal(hash(canonicalJson(report.semantic)), variant.semantic);
    assert.equal(report.traceHtml ? hash(report.traceHtml) : null, variant.trace);
  }
});

test('retained v1 and v2 capture HTML and trace match main edfcfc98, including excluded rows', async () => {
  const input = await fullMarket14Input();
  // Recomputed on clean origin/main edfcfc98 with this same synthetic input.
  // These cover the scope copy and removed-row list that method-only replay cannot check.
  const variants = [
    { policy: undefined, presentation: true, html: '26dfed26aa57eda26c6dfd2e5698a5531272bc579193ca3fd0d3d8f9d3a9081d', trace: 'd8fc19a9141a1f4cea26794628e4ae93c221f9f8f0aae43baa3bc3b38a7f4bb0' },
    { policy: undefined, presentation: false, html: '4678e1fbce3e75dd8c6485bdc690f32bcf8fbbb74fde862e9179941b480ec7af', trace: null },
    { policy: CAPTURE_ROW_PROFILE_V2, presentation: true, html: '1714b2b03af353c658d908d59b8046650c20b72646adf6069f4c8d7eeb4206db', trace: '2bfd2eca5cb00166104344a56c39e4c874ed6b419890ec6e2c713cfa0704ac66' },
    { policy: CAPTURE_ROW_PROFILE_V2, presentation: false, html: '1b755331abea5bd7428e64c005fefaf91b17869006daf388bec03d82a9d58f69', trace: null },
  ];
  for (const variant of variants) {
    const { marketPresentation: _presentation, ...noPresentation } = input;
    const metricMethods = { ...input.metricMethods!, capture: { ...input.metricMethods!.capture!,
      ...(variant.policy ? { rowPolicyVersion: variant.policy } : {}),
      excludedRows: [{ platform: 'shopee' as const, reason: 'NOT_MAIN_PRODUCT' as const, rowIndex: 0,
        listingId: 'synthetic-excluded', title: 'Synthetic part', shop: 'Gian hàng mẫu', revenue: null, units: null }] } };
    const report = buildResearchAutomationReport({ ...(variant.presentation ? input : noPresentation), metricMethods }, 'MARKET');
    assert.equal(hash(report.html), variant.html);
    assert.equal(report.traceHtml ? hash(report.traceHtml) : null, variant.trace);
  }
});

test('v2 preserves main wording; v3 changes exactly the sample scope copy, retaining semantic citations and all other bytes', async t => {
  const input = await fullMarket14Input();
  const retained = canonicalJson(input);
  for (const presentation of [true, false]) for (const rowPolicyVersion of [CAPTURE_ROW_PROFILE_V2, CAPTURE_ROW_PROFILE]) {
    const { marketPresentation: _presentation, ...noPresentation } = input;
    const original = presentation ? input : noPresentation;
    const withPolicy = { ...original, metricMethods: { ...original.metricMethods!,
      capture: { ...original.metricMethods!.capture!, rowPolicyVersion } } };
    for (const kind of ['MARKET', 'INSIGHT'] as const) await t.test(`${rowPolicyVersion}, ${kind}, presentation=${presentation}`, () => {
      const before = buildResearchAutomationReport(original, kind);
      const after = buildResearchAutomationReport(withPolicy, kind);
      const chartSvgs = (html: string) => html.match(/<svg\b[\s\S]*?<\/svg>/gu) ?? [];
      assert.deepEqual(chartSvgs(after.html.toString()), chartSvgs(before.html.toString()),
        `${kind}, presentation=${presentation}: number formatting must preserve chart SVG bytes, including zero ticks`);
      // Main also changes M03's authored missing-value phrase for this marker.
      const expectedHtml = kind === 'MARKET' ? plainCaptureNumbers(before.html.toString()
        .replaceAll('không đổi thành 0.</p><dl class="reader-context">', 'không đổi thành số không.</p><dl class="reader-context">'))
        .replaceAll('không thay bằng số không.</p><dl class="reader-context">', 'không đổi thành số không.</p><dl class="reader-context">') : before.html.toString();
      // The declared scope copy occurs both in M02 and the source appendix.
      // Enumerate every allowed byte change, preserving the original whole-report assertion.
      const scopeCopy = (html: string) => rowPolicyVersion === CAPTURE_ROW_PROFILE && kind === 'MARKET' && presentation ? html
        .replaceAll('<dt>Điều kiện bao gồm</dt><dd>Không thêm điều kiện</dd><dt>Điều kiện loại trừ</dt><dd>Không thêm điều kiện</dd></dl>',
          '<dt>Điều kiện bao gồm</dt><dd>Mọi sản phẩm trả về cho từ khóa đã tìm</dd><dt>Điều kiện loại trừ</dt><dd>Không có điều kiện riêng ngoài bộ lọc mẫu</dd><dt>Bộ lọc mẫu</dt><dd>Loại phụ kiện, linh kiện, sản phẩm khác và dòng có doanh thu hoặc đơn vị bán bất thường khỏi mẫu tính; số dòng đã loại của từng sàn ghi tại mục Phạm vi từng nguồn.</dd></dl>')
        .replaceAll('Điều kiện trên là ý định nghiên cứu đã lưu. Chưa xác nhận các truy vấn nguồn áp dụng đầy đủ điều kiện này.',
          'Điều kiện bao gồm và loại trừ là ý định nghiên cứu đã lưu; chưa xác nhận truy vấn nguồn áp dụng đầy đủ. Bộ lọc mẫu do hệ thống áp dụng trên bảng kết quả đã lưu.')
        .replaceAll('Chưa phân loại phạm vi.', 'Chưa chia nhóm sản phẩm.')
        .replaceAll('Chưa áp dụng phân loại đã duyệt; không suy phạm vi rộng hoặc phạm vi cốt lõi từ từ khóa.',
          'Mẫu gồm các sản phẩm trả về cho từ khóa “synthetic jar”; chưa chia nhóm sản phẩm.') : html;
      assert.equal(hash(after.html), hash(scopeCopy(expectedHtml)), `${rowPolicyVersion}, ${kind}, presentation=${presentation}`);
      const expectedTrace = before.traceHtml?.toString().replaceAll('không đổi thành 0.</p><dl class="reader-context">', 'không đổi thành số không.</p><dl class="reader-context">');
      assert.equal(after.traceHtml ? hash(after.traceHtml) : undefined, expectedTrace ? hash(scopeCopy(expectedTrace)) : undefined);
      // The input marker itself is retained; the formatting pass changes no semantic content.
      assert.deepEqual(after.semantic, kind === 'MARKET' ? { ...before.semantic, metricMethods: withPolicy.metricMethods } : before.semantic);
      const dom = new JSDOM(after.html.toString());
      if (rowPolicyVersion === CAPTURE_ROW_PROFILE && kind === 'MARKET' && presentation) {
        // This whole-report fixture uses M02 for the capture source/sample notice.
        assert.doesNotMatch(text(dom.window.document.querySelector('#M02')!), /%|\b0\b|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|zen-studio|Google|cliproxy|synthetic-lumo-model|OpenAI|Anthropic/iu);
      }
      assertCitations(dom.window.document);
      dom.window.close();
    });
  }
  assert.equal(canonicalJson(input), retained);
});

test('M01 period inventory stays cited in trace and is hidden only for the capture reader', async () => {
  const input = await fullMarket14Input();
  const sourceClaims = buildAutomationSourceClaims({ run: input.run, scope: input.scope, descriptive: { output: input.descriptiveMethods! } }).artifact;
  const m01Inventory = buildAutomationM01EvidenceInventory({ run: input.run, scope: input.scope, sourceClaims, claimsSha256: sourceClaims.claimsSha256 }).artifact;
  assert.ok(m01Inventory.items.length);
  const retained = canonicalJson({ sourceClaims, m01Inventory });
  const { capture: _capture, ...withoutCapture } = input.metricMethods!;
  for (const [metricMethods, hasCapture] of [[input.metricMethods!, true], [withoutCapture, false]] as const) {
    const report = buildResearchAutomationReport({ ...input, metricMethods, sourceClaims, m01Inventory }, 'MARKET');
    const trace = new JSDOM(report.traceHtml!.toString());
    const reader = new JSDOM(report.html.toString());
    const table = trace.window.document.querySelector('#M01 table.evidence-table')!;
    assert.ok(table);
    assert.equal(table.querySelectorAll('tbody tr').length, m01Inventory.items.length);
    assert.equal(!!table.closest('details.evidence-trace'), hasCapture);
    assert.equal(!!reader.window.document.querySelector('#M01 table.evidence-table'), !hasCapture);
    assert.ok(table.querySelector('sup.cite'));
    assertCitations(trace.window.document);
    assertCitations(reader.window.document);
    trace.window.close(); reader.window.close();
  }
  assert.equal(canonicalJson({ sourceClaims, m01Inventory }), retained);
});

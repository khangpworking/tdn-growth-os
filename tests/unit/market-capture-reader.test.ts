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
import { marketSourceScopeSection, projectMarketSourceScope } from '../../src/modules/analysis/research-automation/market-scope-report.js';
import { deliverMarketReader, stripTraceDetails } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { buildAutomationSourceClaims } from '../../src/modules/analysis/research-automation/source-claims.js';
import { buildAutomationM01EvidenceInventory } from '../../src/modules/analysis/research-automation/m01-evidence-inventory.js';
import type { CaptureMetricMethodDetails } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import type { ReportCitations } from '../../src/modules/analysis/research-automation/descriptive-report.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

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

test('filtered-empty capture keeps the empty-sample notice and each platform page figure in the reader', async () => {
  const { input, capture } = await fixture();
  const empty = metricFixture();
  empty.profileId = 'automation-metric-capture-v2';
  empty.records = [];
  const result = calculateMetricScopes(empty);
  const method = buildAutomationMarketPresentation({ ...input.marketPresentation!.binding,
    metric: { ...input.marketPresentation!.binding.metric!, resultSha256: marketPresentationDigest(result) } },
  { metric: result, rows: [], unitSpec: null });
  const filtered: CaptureMetricMethodDetails = { ...capture, rowPolicyVersion: 'automation-metric-capture-v2',
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

// Without capture, the presentation copy changes only by the reader proofread, the context copy and the reference-price badge; semantic bytes stay at eedcb369.
// The no-presentation html differs only by the fixture's charts from the current renderers; legacy chart bytes stay pinned at bfdaca27 in macro-charts-report.
test('automation reports without capture or presentation retain semantic pins with explained rendering changes', async () => {
  const input = await fullMarket14Input();
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  const { marketPresentation: _presentation, ...noPresentation } = input;
  const variants = [
    { value: { ...input, metricMethods }, html: '5367992cbab9988a9a996695b3a9e6fbfc67ad561a4ae4bf07de74f237d4ef49', semantic: 'f09ff348de6036dbf7866d069d8dc833c37ab9a52c6e1b0ea82eaed9bb7742ab', trace: '6d6a13d0eaf09314fa4edadec8adc20d43b68f235b47322cf03c6893edb65009' },
    { value: noPresentation, html: '92ada31fa0a8a276d05aedc38fe418c3b5204f0750ef89020453a998526c6da9', semantic: '89b388819561c90b6082847afb079b85aa911457862ca7d542d5335860c3f8a5', trace: null },
  ];
  for (const variant of variants) {
    const report = buildResearchAutomationReport(variant.value, 'MARKET');
    assert.equal(hash(report.html), variant.html);
    assert.equal(hash(canonicalJson(report.semantic)), variant.semantic);
    assert.equal(report.traceHtml ? hash(report.traceHtml) : null, variant.trace);
  }
});

test('row policy number formatting runs after reader delivery and leaves semantic citations and trace bytes intact', async () => {
  const input = await fullMarket14Input();
  const retained = canonicalJson(input);
  for (const presentation of [true, false]) {
    const { marketPresentation: _presentation, ...noPresentation } = input;
    const original = presentation ? input : noPresentation;
    const withPolicy = { ...original, metricMethods: { ...original.metricMethods!,
      capture: { ...original.metricMethods!.capture!, rowPolicyVersion: 'automation-metric-capture-v2' as const } } };
    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const before = buildResearchAutomationReport(original, kind);
      const after = buildResearchAutomationReport(withPolicy, kind);
      const chartSvgs = (html: string) => html.match(/<svg\b[\s\S]*?<\/svg>/gu) ?? [];
      assert.deepEqual(chartSvgs(after.html.toString()), chartSvgs(before.html.toString()),
        `${kind}, presentation=${presentation}: number formatting must preserve chart SVG bytes, including zero ticks`);
      // Main also changes M03's authored missing-value phrase for this marker.
      const expectedHtml = kind === 'MARKET' ? plainCaptureNumbers(before.html.toString()
        .replaceAll('không đổi thành 0.</p><dl class="reader-context">', 'không đổi thành số không.</p><dl class="reader-context">'))
        .replaceAll('không thay bằng số không.</p><dl class="reader-context">', 'không đổi thành số không.</p><dl class="reader-context">') : before.html.toString();
      assert.equal(hash(after.html), hash(expectedHtml), `${kind}, presentation=${presentation}`);
      const expectedTrace = before.traceHtml?.toString().replaceAll('không đổi thành 0.</p><dl class="reader-context">', 'không đổi thành số không.</p><dl class="reader-context">');
      assert.equal(after.traceHtml ? hash(after.traceHtml) : undefined, expectedTrace ? hash(expectedTrace) : undefined);
      // The input marker itself is retained; the formatting pass changes no semantic content.
      assert.deepEqual(after.semantic, kind === 'MARKET' ? { ...before.semantic, metricMethods: withPolicy.metricMethods } : before.semantic);
      const dom = new JSDOM(after.html.toString());
      assertCitations(dom.window.document);
      dom.window.close();
    }
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

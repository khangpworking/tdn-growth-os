import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { hasHiddenName } from '../../src/modules/analysis/report-language/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import * as marketCharts from '../../src/modules/analysis/reader-report/market-charts.js';
import type { MarketChartRow } from '../../src/modules/analysis/reader-report/market-charts.js';
import { marketActionPlan } from '../../src/modules/analysis/reader-report/market-actions.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { headlineInput, headlineRows } from '../helpers/market-headline-fixture.js';
import { citationRegisterViolations, reportVisibleText } from '../helpers/report-visible-text.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

const text = (node: Element) => node.textContent!.replace(/\s+/gu, ' ').trim();
// Namespace import lets the main comparison reach each assertion even before
// marketShares exists there, instead of failing the entire file at import time.
const { marketShares, renderMarketCharts, UNKNOWN_SHOP } = marketCharts;
const scope = (platform: string, n: number) => ` (n = ${n} dòng, kỳ ${platform === 'shopee' ? '17/08/2026 đến 15/09/2026' : '01/08/2026 đến 30/08/2026'}).`;

function reader(input: AutomationReportInput) {
  const report = buildResearchAutomationReport(input, 'MARKET'), dom = new JSDOM(report.html.toString());
  const section = dom.window.document.querySelector('#M01')!;
  assert.ok(section, 'Phần 1 is delivered');
  return { report, dom, section };
}
function finding(section: Element, exhibit: string): Element {
  const item = [...section.querySelectorAll('.market-findings > li')].find(li => text(li).includes(exhibit));
  assert.ok(item, exhibit);
  return item;
}
const statement = (item: Element) => text(item.querySelector('p')!).replace(/^Nhận định: /u, '');
const hasExhibit = (section: Element, exhibit: string) => [...section.querySelectorAll('.market-findings > li a')].some(a => text(a).includes(exhibit));

test('marketShares uses each platform denominator and aggregates shops before ranking', () => {
  assert.deepEqual(marketShares(headlineRows()), [
    { platform: 'shopee', n: 6, total: 10_000_000, top: 40, top5: 96, shops: [65, 90, 100, null] },
    { platform: 'tiktok', n: 6, total: 16_000_000, top: 56.25, top5: 96.875, shops: [56.25, 100, null, null] },
  ]);
});

test('marketShares values equal the data Hình 4.2 renders in both chart engines', async () => {
  for (const flint of [false, true]) {
    const chart = (await renderMarketCharts(headlineRows(), { flint })).find(chart => chart.kind === 'concentration')!;
    assert.equal(chart.engine, flint ? 'flint' : 'svg-fallback');
    const dom = new JSDOM(chart.svg);
    try {
      const shares = marketShares(headlineRows());
      if (flint) {
        // Flint text labels round to whole numbers. Its accessible bar labels
        // carry the plotted one-decimal data and identify both platform/group.
        const bars = [...dom.window.document.querySelectorAll('[aria-roledescription="bar"]')].map(bar => bar.getAttribute('aria-label')!);
        assert.equal(bars.length, 5);
        for (const [p, label] of ['Shopee', 'TikTok Shop'].entries()) {
          for (const [j, k] of [1, 3, 5, 10].entries()) {
            const bar = bars.find(bar => bar.includes(`: ${k} gian hàng`) && bar.includes(`Sàn: ${label}`));
            const value = shares[p]!.shops![j];
            if (value === null) assert.equal(bar, undefined, `${label}, ${k} shops is absent`);
            else {
              assert.ok(bar);
              assert.equal(Number(bar.match(/\(%\): ([\d,]+)/u)![1]!.replace(',', '.')), +value!.toFixed(1));
            }
          }
        }
      } else {
        const labels = [...dom.window.document.querySelectorAll('text.vl')].map(text);
        assert.deepEqual(labels, ['65,0%', '56,3%', '90,0%', '100,0%', '100,0%']);
        assert.deepEqual(labels.map(value => parseFloat(value.replace(',', '.'))),
          [shares[0]!.shops![0], shares[1]!.shops![0], shares[0]!.shops![1], shares[1]!.shops![1], shares[0]!.shops![2]].map(value => +value!.toFixed(1)));
      }
    } finally { dom.window.close(); }
  }
});

test('marketShares top5 is null below five rows and available at five rows', () => {
  const rows = headlineRows().filter(row => row.platform === 'shopee');
  assert.equal(marketShares(rows.slice(0, 4))[0]!.top5, null);
  assert.equal(marketShares(rows.slice(0, 5))[0]!.top5, 100);
});

test('marketShares shops is null for a platform with an unrecorded shop', () => {
  const rows = headlineRows().map(row => row.i === 0 ? { ...row, shop: UNKNOWN_SHOP } : row);
  assert.equal(marketShares(rows)[0]!.shops, null);
  assert.deepEqual(marketShares(rows)[1]!.shops, [56.25, 100, null, null]);
});

test('marketShares shop groups are null below 1/3/5/10 shops and available at each threshold', () => {
  for (const count of [1, 2, 3, 4, 5, 9, 10]) {
    const rows: MarketChartRow[] = Array.from({ length: count }, (_, i) => ({ i, platform: 'shopee', shop: `shop-${i}`, rev: 10 }));
    assert.deepEqual(marketShares(rows)[0]!.shops, [1, 3, 5, 10].map(k => count < k ? null : 100 * k / count));
  }
});

test('marketShares excludes incomplete, zero-total and unsupported platforms', () => {
  for (const rev of [null, undefined, -1, NaN, Infinity]) {
    const rows = headlineRows().map(row => row.i === 10 ? { ...row, rev } : row);
    assert.deepEqual(marketShares(rows).map(share => share.platform), ['shopee']);
  }
  assert.deepEqual(marketShares([{ i: 0, platform: 'shopee', shop: 'shop', rev: 0 }, { i: 1, platform: 'other', shop: 'shop', rev: 50 }]), []);
});

test('Phần 1 shares with at least five rows state distinct product shares and platform scope', async () => {
  const { dom, section } = reader(await headlineInput());
  try {
    const item = finding(section, 'Hình 4.1');
    assert.equal(statement(item), 'Shopee: 1 sản phẩm doanh thu cao giữ 40,0 phần trăm doanh thu trong mẫu của sàn; 5 sản phẩm doanh thu cao giữ 96,0 phần trăm' + scope('shopee', 6) +
      ' TikTok Shop: 1 sản phẩm doanh thu cao giữ 56,3 phần trăm doanh thu trong mẫu của sàn; 5 sản phẩm doanh thu cao giữ 96,9 phần trăm' + scope('tiktok', 6));
    assert.deepEqual([...item.querySelectorAll('a')].map(a => a.getAttribute('href')), ['#M04', '#M07']);
  } finally { dom.window.close(); }
});

test('Phần 1 shares below five rows omit only that platform five-product clause', async () => {
  const rows = headlineRows().filter(row => row.platform === 'shopee' || row.i === 10 || row.i === 11);
  const { dom, section } = reader(await headlineInput(rows));
  try {
    assert.equal(statement(finding(section, 'Hình 4.1')), 'Shopee: 1 sản phẩm doanh thu cao giữ 40,0 phần trăm doanh thu trong mẫu của sàn; 5 sản phẩm doanh thu cao giữ 96,0 phần trăm' + scope('shopee', 6) +
      ' TikTok Shop: 1 sản phẩm doanh thu cao giữ 75,0 phần trăm doanh thu trong mẫu của sàn' + scope('tiktok', 2));
  } finally { dom.window.close(); }
});

test('Phần 1 shops use the five-shop clause when filled', async () => {
  const { dom, section } = reader(await headlineInput());
  try {
    assert.equal(statement(finding(section, 'Hình 4.2')).split(' TikTok Shop:')[0],
      'Shopee: 1 gian hàng doanh thu cao giữ 65,0 phần trăm doanh thu trong mẫu của sàn; 5 gian hàng doanh thu cao giữ 100,0 phần trăm' + scope('shopee', 6));
  } finally { dom.window.close(); }
});

test('Phần 1 shops fall back to the three-shop clause', async () => {
  const { dom, section } = reader(await headlineInput());
  try {
    assert.equal(statement(finding(section, 'Hình 4.2')).split(' TikTok Shop:')[1],
      ' 1 gian hàng doanh thu cao giữ 56,3 phần trăm doanh thu trong mẫu của sàn; 3 gian hàng doanh thu cao giữ 100,0 phần trăm' + scope('tiktok', 6));
  } finally { dom.window.close(); }
});

test('Phần 1 shops with one recorded shop state only the one-shop share', async () => {
  const rows = headlineRows().map(row => row.platform === 'tiktok' ? { ...row, shop: 'single-shop' } : row);
  const { dom, section } = reader(await headlineInput(rows));
  try {
    assert.equal(statement(finding(section, 'Hình 4.2')).split(' TikTok Shop:')[1],
      ' 1 gian hàng doanh thu cao giữ 100,0 phần trăm doanh thu trong mẫu của sàn' + scope('tiktok', 6));
  } finally { dom.window.close(); }
});

test('Phần 1 omits shops without a concentration chart and omits platforms with unrecorded shops', async () => {
  const input = await headlineInput();
  const noChart = reader({ ...input, marketPresentationCharts: input.marketPresentationCharts!.filter(chart => chart.kind !== 'concentration') });
  try { assert.equal(hasExhibit(noChart.section, 'Hình 4.2'), false); } finally { noChart.dom.window.close(); }
  const unknown = reader(await headlineInput(headlineRows().map(row => row.platform === 'tiktok' ? { ...row, shop: UNKNOWN_SHOP } : row)));
  try { assert.doesNotMatch(statement(finding(unknown.section, 'Hình 4.2')), /TikTok/u); } finally { unknown.dom.window.close(); }
});

test('Phần 1 price band with low equal high prints one value from Bảng 11.1', async () => {
  const { dom, section } = reader(await headlineInput());
  try {
    assert.equal(statement(finding(section, 'Bảng 11.1')).split(' TikTok Shop:')[0],
      'Shopee: nhóm giá 100.000 đồng/sản phẩm có doanh thu lớn trong ba nhóm giá của sàn, 6.500.000 VND từ 2 sản phẩm quy đổi được theo quy cách trong tên sản phẩm' + scope('shopee', 6));
    const cells = [...dom.window.document.querySelector('#M11 tbody tr')!.querySelectorAll('td')].map(text);
    assert.deepEqual(cells.slice(0, 4), ['Shopee', '100.000–100.000', '6.500.000', '2']);
  } finally { dom.window.close(); }
});

test('Phần 1 price band with low below high prints that platform range from Bảng 11.1', async () => {
  const { dom, section } = reader(await headlineInput());
  try {
    assert.equal(statement(finding(section, 'Bảng 11.1')).split(' TikTok Shop:')[1],
      ' nhóm giá 300.000–900.000 đồng/sản phẩm có doanh thu lớn trong ba nhóm giá của sàn, 12.000.000 VND từ 2 sản phẩm quy đổi được theo quy cách trong tên sản phẩm' + scope('tiktok', 6));
    const cells = [...dom.window.document.querySelectorAll('#M11 tbody tr')[1]!.querySelectorAll('td')].map(text);
    assert.deepEqual(cells.slice(0, 4), ['TikTok Shop', '300.000–900.000', '12.000.000', '2']);
  } finally { dom.window.close(); }
});

test('Phần 1 reads frozen capture rows when no presentation rows exist', async () => {
  const { dom, section } = reader(await headlineInput(headlineRows(), { fallback: true }));
  try {
    assert.match(statement(finding(section, 'Hình 4.1')), /TikTok Shop:.*56,3 phần trăm.*96,9 phần trăm/u);
    assert.match(statement(finding(section, 'Bảng 11.1')), /TikTok Shop: nhóm giá 300\.000–900\.000.*12\.000\.000 VND/u);
  } finally { dom.window.close(); }
});

test('Phần 1 search peak uses the first highest completed week and only weeks with a value', async () => {
  const input = await headlineInput(), interest = input.collection!.searchInterest!;
  const points = interest.points.map((point, i) => ({ ...point, index: i === 5 ? null : i === 2 || i === 30 || i === 51 ? 100 : 20 }));
  const searchInterest = { ...interest, points };
  const { dom, section } = reader({ ...input, collection: { ...input.collection!, searchInterest },
    searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)) });
  try {
    assert.equal(statement(finding(section, 'Hình 5.1')),
      'Mức quan tâm tìm kiếm của từ khóa cao ở tuần 19–25/10/2025, chỉ số 100 trên thang 0–100; đây là chỉ số tương đối, không phải số người tìm hay doanh số (n = 50 tuần có số).');
    assert.equal(finding(section, 'Hình 5.1').querySelector('sup.cite'), null);
  } finally { dom.window.close(); }
});

test('Phần 1 omits the search peak when its index is zero', async () => {
  const input = await headlineInput();
  const searchInterest = { ...input.collection!.searchInterest!, points: input.collection!.searchInterest!.points.map(point => ({ ...point, index: 0 })) };
  const { dom, section } = reader({ ...input, collection: { ...input.collection!, searchInterest } });
  try { assert.equal(hasExhibit(section, 'Hình 5.1'), false); } finally { dom.window.close(); }
});

test('Phần 1 omits the search peak when there is no renderable series', async () => {
  const input = await headlineInput();
  const searchInterest = { ...input.collection!.searchInterest!, points: [] };
  const { dom, section } = reader({ ...input, collection: { ...input.collection!, searchInterest } });
  try { assert.equal(hasExhibit(section, 'Hình 5.1'), false); } finally { dom.window.close(); }
});

test('Phần 1 omits the search peak when every week is missing', async () => {
  const input = await headlineInput();
  const searchInterest = { ...input.collection!.searchInterest!, points: input.collection!.searchInterest!.points.map(point => ({ ...point, index: null })) };
  const { dom, section } = reader({ ...input, collection: { ...input.collection!, searchInterest } });
  try { assert.equal(hasExhibit(section, 'Hình 5.1'), false); } finally { dom.window.close(); }
});

test('Phần 1 points to Phần 12 when the plan has figures', async () => {
  assert.equal(marketActionPlan(headlineRows(), { reviewsCollected: false, startDay: null }).hasFigures, true);
  const { dom, section } = reader(await headlineInput());
  try {
    assert.equal(statement(finding(section, 'Bảng 12.1')), 'Ba phương án ở Phần 12 đọc từ các số trong mẫu này (đề xuất, chờ chủ duyệt).');
    assert.equal(finding(section, 'Bảng 12.1').querySelector('a')!.getAttribute('href'), '#M12');
    assert.ok(dom.window.document.querySelector('#M12 .has-figures'));
  } finally { dom.window.close(); }
});

test('Phần 1 has a lead but no Phần 12 pointer when the plan has no figures', async () => {
  const rows = headlineRows().filter(row => row.i === 0 || row.i === 10);
  assert.equal(marketActionPlan(rows, { reviewsCollected: false, startDay: null }).hasFigures, false);
  const { dom, section } = reader(await headlineInput(rows));
  try {
    assert.ok(section.querySelector('[data-market-headline="1"]'));
    assert.equal(hasExhibit(section, 'Bảng 12.1'), false);
    assert.equal(dom.window.document.querySelector('#M12 .has-figures'), null);
  } finally { dom.window.close(); }
});

test('rendered Phần 1 has no banned claims, provider names, product titles or bare zero figure', async () => {
  const input = await headlineInput();
  for (const value of [input, await headlineInput(headlineRows().filter(row => row.i === 0 || row.i === 10))]) {
    const { dom, section } = reader(value);
    try {
      const visible = reportVisibleText(section.outerHTML);
      assert.doesNotMatch(visible, /%|thị phần|quy mô thị trường|nhất|hàng đầu|Google/iu);
      assert.equal(hasHiddenName(visible, 'CITATION'), false);
      for (const row of headlineRows()) assert.equal(visible.includes(row.title), false, row.title);
      // Decimal shares (100,0) and the explicit relative scale (0–100) are allowed.
      assert.doesNotMatch(visible.replaceAll('0–100', '').replace(/\d+(?:[.,]\d+)*/gu, token => token === '0' ? '0' : ''), /(?<!\d)0(?!\d)/u);
    } finally { dom.window.close(); }
  }
});

test('M01 badge says Có số liệu with a lead and keeps its old value without one', async () => {
  const input = await headlineInput(), { capture: _capture, ...metricMethods } = input.metricMethods!;
  for (const [value, badge, lead] of [
    [input, 'Có số liệu', true],
    [{ ...input, marketPresentationCharts: input.marketPresentationCharts!.filter(chart => chart.kind !== 'platform-revenue') }, 'Chưa đủ dữ liệu', false],
    [{ ...input, metricMethods }, 'Chưa đủ dữ liệu', false],
  ] as const) {
    const { dom, section } = reader(value);
    try {
      assert.equal(section.querySelector('.state')!.textContent, badge);
      assert.equal(Boolean(section.querySelector('[data-market-headline="1"]')), lead);
    } finally { dom.window.close(); }
  }
});

test('headline citations reuse all existing numbers and every reader/trace register entry is referenced', async () => {
  // The old reader path is still available with no drawn Hình 4.1.
  for (const input of [await fullMarket14Input(), await headlineInput()]) {
    const before = canonicalJson(input), current = reader(input);
    const old = reader({ ...input, marketPresentationCharts: input.marketPresentationCharts!.filter(chart => chart.kind !== 'platform-revenue') });
    try {
      const entries = (current.report.semantic as { citationEntries: unknown[] }).citationEntries;
      assert.deepEqual(entries, (old.report.semantic as { citationEntries: unknown[] }).citationEntries, 'no source added or renumbered');
      if (input.marketPresentation!.input.unitSpec) assert.equal(entries.length, 9);
      for (const html of [current.report.html, current.report.traceHtml!]) {
        const dom = new JSDOM(html.toString());
        try { assert.deepEqual(citationRegisterViolations(dom.window.document), []); } finally { dom.window.close(); }
      }
      const numbers = (section: Element) => [...new Set([...section.querySelectorAll('sup.cite')].map(text))].sort();
      assert.deepEqual(numbers(current.section), numbers(old.section), 'Phần 1 keeps marks formerly carried only by traced statements');
      assert.equal(canonicalJson(input), before, 'no retained input changes');
      assert.doesNotMatch(current.section.innerHTML, /Số liệu mẫu đã lưu từng sàn/u);
      assert.match(current.report.traceHtml!.toString(), /Số liệu mẫu đã lưu từng sàn/u);
    } finally { current.dom.window.close(); old.dom.window.close(); }
  }
});

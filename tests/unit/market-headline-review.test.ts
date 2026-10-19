import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { searchInterestChartPoints, searchInterestReadingPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { headlineInput, headlineRows } from '../helpers/market-headline-fixture.js';
import { citationRegisterViolations } from '../helpers/report-visible-text.js';

test('product finding is absent when Hình 7.1 is absent', async () => {
  const input = await headlineInput();
  const report = buildResearchAutomationReport({ ...input,
    marketPresentationCharts: input.marketPresentationCharts!.filter(chart => chart.kind !== 'product-ranking'),
  }, 'MARKET');
  const dom = new JSDOM(report.html.toString());
  try {
    assert.doesNotMatch(dom.window.document.querySelector('#M07')!.textContent!, /Hình 7\.1/u);
    assert.doesNotMatch(dom.window.document.querySelector('#M01 .market-findings')!.textContent!, /sản phẩm doanh thu cao giữ/u);
    assert.match(dom.window.document.querySelector('#M01 .market-findings')!.textContent!, /gian hàng doanh thu cao giữ/u);
    assert.deepEqual(citationRegisterViolations(dom.window.document), []);
  } finally { dom.window.close(); }
});

test('product findings omit a platform whose products are outside Hình 7.1', async () => {
  const template = headlineRows()[0]!;
  const rows = [...Array.from({ length: 10 }, (_, i) => ({ ...template, i,
    listing: `synthetic-large-${i}`, shop: `synthetic-shop-${i}`, rev: 20_000_000 + i * 1_000_000,
  })), ...headlineRows().filter(row => row.platform === 'tiktok')];
  const report = buildResearchAutomationReport(await headlineInput(rows), 'MARKET');
  const dom = new JSDOM(report.html.toString());
  try {
    const bars = [...dom.window.document.querySelectorAll('#M07 [aria-roledescription="bar"]')];
    assert.equal(bars.length, 10);
    assert.ok(bars.every(bar => bar.getAttribute('aria-label')!.includes('Sàn: Shopee')));
    const item = [...dom.window.document.querySelectorAll('#M01 .market-findings > li')]
      .find(li => li.textContent!.includes('Hình 7.1'))!;
    assert.ok(item);
    assert.match(item.textContent!, /Shopee:/u);
    assert.doesNotMatch(item.textContent!, /TikTok Shop:/u);
    assert.deepEqual(citationRegisterViolations(dom.window.document), []);
  } finally { dom.window.close(); }
});

test('a displayed leading product does not imply five products are displayed', async () => {
  const template = headlineRows()[0]!;
  const rows = [...Array.from({ length: 9 }, (_, i) => ({ ...template, i,
    listing: `synthetic-large-${i}`, shop: `synthetic-shop-${i}`, rev: 20_000_000 + i * 1_000_000,
  })), ...headlineRows().filter(row => row.platform === 'tiktok')];
  const report = buildResearchAutomationReport(await headlineInput(rows), 'MARKET');
  const dom = new JSDOM(report.html.toString());
  try {
    const bars = [...dom.window.document.querySelectorAll('#M07 [aria-roledescription="bar"]')];
    assert.equal(bars.filter(bar => bar.getAttribute('aria-label')!.includes('Sàn: TikTok Shop')).length, 1);
    const item = [...dom.window.document.querySelectorAll('#M01 .market-findings > li')]
      .find(li => li.textContent!.includes('Hình 7.1'))!;
    const sentence = item.querySelector('p')!.textContent!.split('TikTok Shop:')[1]!;
    assert.match(sentence, /1 sản phẩm doanh thu cao giữ 56,3 phần trăm/u);
    assert.doesNotMatch(sentence, /5 sản phẩm/u);
    assert.deepEqual(citationRegisterViolations(dom.window.document), []);
  } finally { dom.window.close(); }
});

test('the first array entry is retained when it is the search peak', async () => {
  const input = await headlineInput(), interest = input.collection!.searchInterest!;
  const searchInterest = { ...interest, points: interest.points.map((point, i) => ({ ...point, index: i === 0 ? 100 : 20 })) };
  const report = buildResearchAutomationReport({ ...input, collection: { ...input.collection!, searchInterest },
    searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)),
  }, 'MARKET');
  const dom = new JSDOM(report.html.toString());
  try {
    const item = [...dom.window.document.querySelectorAll('#M01 .market-findings > li')]
      .find(li => li.textContent!.includes('Hình 5.1'))!;
    assert.ok(item);
    assert.ok(item.textContent!.includes(`tuần ${searchInterestReadingPoints(searchInterest)[0]!.period}, chỉ số 100`));
  } finally { dom.window.close(); }
});

test('headline price band does not emit a price rounded to bare zero', async () => {
  const rows = headlineRows().map(row => ({ ...row, rev: 1, units: 10, asp: 0.1 }));
  const report = buildResearchAutomationReport(await headlineInput(rows), 'MARKET');
  const dom = new JSDOM(report.html.toString());
  try {
    assert.doesNotMatch(dom.window.document.querySelector('#M01 .market-findings')!.textContent!, /nhóm giá 0(?:[\s–])/u);
    assert.doesNotMatch(dom.window.document.querySelector('#M01 .market-findings')!.textContent!, /Bảng 11\.1/u);
  } finally { dom.window.close(); }
});

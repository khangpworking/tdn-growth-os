import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCaptureCountCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { captureSampleCounts, renderCaptureSampleCharts } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import type { CaptureMetricMethodDetails } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import type { ReportCitations } from '../../src/modules/analysis/research-automation/descriptive-report.js';

const platformResult = (count: number, status = 'CALCULATED') => ({
  inputSha256: 'a'.repeat(64),
  input: { scope: { start: '2026-09-01', end: '2026-09-30' } },
  scopes: [{ key: 'all', status, listingCount: count }],
});
const capture = { platforms: [
  { platform: 'shopee', result: platformResult(40) },
  { platform: 'tiktok', result: platformResult(25) },
] } as unknown as CaptureMetricMethodDetails;
const citations = { mark: () => '<sup class="cite">[1]</sup>' } as unknown as ReportCitations;
const chartDivs = (html: string): string[] => [...html.matchAll(/<div\b[^>]*\bclass="[^"]*\bchart\b[^"]*"[^>]*>/gu)].map(match => match[0]);

test('capture record counts are drawn by Flint, one chart per platform, never summed', async () => {
  const charts = await renderCaptureCountCharts(captureSampleCounts(capture));
  assert.deepEqual(charts.map(chart => [chart.platform, chart.engine]), [['shopee', 'flint'], ['tiktok', 'flint']]);
  for (const chart of charts) assert.match(chart.svg, /<svg\b[\s\S]*<\/svg>/);
  assert.doesNotMatch(charts.map(chart => chart.svg).join(''), />65</, 'no cross-platform total');
  const html = renderCaptureSampleCharts(capture, citations, charts);
  const divs = chartDivs(html);
  assert.equal(divs.length, 2);
  for (const div of divs) assert.match(div, /class="chart flint" data-engine="flint"/);
  assert.match(html, /n = 40 bản ghi[\s\S]*n = 25 bản ghi/);
});

test('without a drawn chart the capture figure keeps its count and source but no svg-fallback chart', () => {
  const html = renderCaptureSampleCharts(capture, citations);
  assert.deepEqual(chartDivs(html), []);
  assert.doesNotMatch(html, /svg-fallback/);
  assert.match(html, /n = 40 bản ghi[\s\S]*Nguồn:/);
});

test('a platform whose whole-sample scope is not calculated gets no figure', async () => {
  const partial = { platforms: [{ platform: 'shopee', result: platformResult(40) }, { platform: 'tiktok', result: platformResult(25, 'NOT_CALCULATED') }] } as unknown as CaptureMetricMethodDetails;
  assert.deepEqual(captureSampleCounts(partial).map(sample => sample.platform), ['shopee']);
  const charts = await renderCaptureCountCharts(captureSampleCounts(partial), { flint: false });
  assert.deepEqual(charts.map(chart => chart.engine), ['svg-fallback']);
  assert.doesNotMatch(renderCaptureSampleCharts(partial, citations, charts), /TikTok/);
});

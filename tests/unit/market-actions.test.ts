import assert from 'node:assert/strict';
import test from 'node:test';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';

import { JSDOM } from 'jsdom';
import { actionStartDay, dayPlus, isoFromReaderDay, marketActionPlan, opportunityRows, platformSignals, type ActionRow } from '../../src/modules/analysis/reader-report/market-actions.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

// Synthetic sample: six priced Shopee rows (unit prices 10–60) and two TikTok Shop rows, one without units.
const rows: ActionRow[] = [
  { platform: 'tiktok', rev: 900, units: null },
  { platform: 'shopee', rev: 100, units: 10 }, { platform: 'shopee', rev: 200, units: 10 },
  { platform: 'shopee', rev: 3000, units: 100 }, { platform: 'shopee', rev: 4000, units: 100 },
  { platform: 'shopee', rev: 500, units: 10 }, { platform: 'shopee', rev: 600, units: 10 },
  { platform: 'shopee', rev: null, units: 5 }, { platform: 'tiktok', rev: 100, units: 1 },
];

test('platform signals read each platform on its own, Shopee first', () => {
  const [shopee, tiktok, ...rest] = platformSignals(rows);
  assert.equal(rest.length, 0);
  assert.deepEqual(shopee, { platform: 'shopee', name: 'Shopee', band: { low: 30, high: 40, revenue: 7000, count: 2 }, leaders: { revenue: 8300, count: 5 } });
  assert.deepEqual(tiktok, { platform: 'tiktok', name: 'TikTok Shop', band: null, leaders: { revenue: 1000, count: 2 } });
});

test('a revenue tie between price groups keeps the lower group', () => {
  const even = [10, 20, 30, 40, 50, 60].map(price => ({ platform: 'shopee', rev: 600, units: 600 / price }));
  assert.deepEqual(platformSignals(even)[0]?.band, { low: 10, high: 20, revenue: 1200, count: 2 });
});

test('the plan states per-platform related revenue and dated deadlines, never a cross-platform total', () => {
  const plan = marketActionPlan(rows, { reviewsCollected: false, startDay: '2026-10-19' });
  assert.equal(plan.hasFigures, true);
  assert.deepEqual(plan.options.map(option => option.related), [
    ['Shopee: 7.000 VND từ 2 sản phẩm giá 30–40 VND mỗi đơn vị bán', 'TikTok Shop: chưa đủ dòng có cả doanh thu và đơn vị bán'],
    ['Shopee: 8.300 VND từ 5 sản phẩm doanh thu lớn', 'TikTok Shop: 1.000 VND từ 2 sản phẩm doanh thu lớn'],
    ['Cùng nhóm sản phẩm với phương án B; không cộng thêm'],
  ]);
  assert.deepEqual(plan.options.map(option => option.deadline), ['26/10/2026', '26/10/2026', '02/11/2026']);
  assert.deepEqual(plan.quickWins.map(win => win.deadline), ['22/10/2026', '22/10/2026']);
  for (const row of [...plan.options.map(option => option.owner), ...plan.quickWins.map(win => win.owner)]) assert.match(row, /\(đề xuất, chờ chủ duyệt\)$/u);
  assert.doesNotMatch(JSON.stringify(plan), /9\.300|8\.000/u);
  assert.match(plan.options[2]!.firstStep, /chưa thu đánh giá/u);
  assert.match(marketActionPlan(rows, { reviewsCollected: true, startDay: '2026-10-19' }).options[2]!.firstStep, /^Đọc đánh giá đã lưu/u);
});

test('an empty sample keeps the three options without figures', () => {
  const plan = marketActionPlan([], { reviewsCollected: false, startDay: '2026-10-19' });
  assert.equal(plan.hasFigures, false);
  assert.deepEqual(plan.options.slice(0, 2).map(option => option.related), [['Chưa có dòng doanh thu trong mẫu'], ['Chưa có dòng doanh thu trong mẫu']]);
  assert.equal(plan.options.length, 3);
});

test('opportunity rows keep missing cells as words, not zeros', () => {
  assert.deepEqual(opportunityRows(platformSignals(rows)), [
    ['Shopee', '30–40', '7.000', '2', '8.300', '5'],
    ['TikTok Shop', 'chưa đủ dòng có cả doanh thu và đơn vị bán', 'chưa có dữ liệu', 'chưa có dữ liệu', '1.000', '2'],
  ]);
});

test('deadline days cross month and year ends and reject malformed days', () => {
  assert.equal(dayPlus('2026-12-30', 3), '02/01/2027');
  assert.equal(isoFromReaderDay('19/10/2026'), '2026-10-19');
  assert.throws(() => dayPlus('2026-02-30', 1), RangeError);
  assert.throws(() => dayPlus('19/10/2026', 1), RangeError);
  assert.throws(() => isoFromReaderDay('2026-10-19'), RangeError);
});

test('invalid proposal dates use retained fallback days and never invent a date', () => {
  assert.equal(actionStartDay('bad', '2026-02-30', '2026-01-31'), '2026-01-31');
  assert.equal(actionStartDay('9999-12-31', undefined, null), null);
  assert.throws(() => dayPlus('9999-12-31', 14), RangeError);
  const plan = marketActionPlan(rows, { reviewsCollected: false, startDay: 'bad' });
  for (const row of [...plan.options, ...plan.quickWins]) assert.equal(row.deadline, 'Chưa có ngày bắt đầu hợp lệ');
});

test('missing, zero and negative revenues do not create action figures', () => {
  const empty = ['shopee', 'tiktok'].flatMap(platform => [null, undefined, 0, -10, Number.NaN, Infinity].map(rev => ({ platform, rev, units: 10 })));
  const plan = marketActionPlan(empty, { reviewsCollected: false, startDay: '2026-10-19' });
  assert.equal(plan.hasFigures, false);
  for (const signal of plan.signals) assert.deepEqual([signal.band, signal.leaders], [null, null]);
  assert.doesNotMatch(opportunityRows(plan.signals).flat().join(' '), /\b0\b/u);
  assert.doesNotMatch(plan.options.flatMap(option => option.related).join(' '), /\b0\b/u);
});

test('automation deadlines use the Vietnam day and survive missing or malformed run and period dates', async () => {
  const input = await fullMarket14Input();
  const deadline = (createdAt: string | undefined, endDate = '2026-01-30'): string => {
    const built = buildResearchAutomationReport({ ...input, run: { ...input.run, createdAt: createdAt as string },
      start: { ...input.start, requestedPeriod: { ...input.start.requestedPeriod, endDate } } }, 'MARKET');
    return new JSDOM(built.html).window.document.querySelector('#M12 tbody tr td:last-child')!.textContent!;
  };
  assert.equal(deadline('2026-10-19T16:59:59Z'), '26/10/2026');
  assert.equal(deadline('2026-10-19T17:00:00Z'), '27/10/2026');
  assert.equal(deadline('2026-10-20T00:00:00+07:00'), '27/10/2026');
  assert.equal(deadline(undefined), '06/02/2026');
  for (const createdAt of [undefined, 'bad', '+275760-09-13T00:00:00.000Z']) {
    assert.equal(deadline(createdAt, 'bad'), '08/01/2026');
  }
});

test('1.4.0 Phần 11 and 12 share sample signals, independent of classification, with robust dates', async () => {
  const input = sync1ReaderFixture('1.4.0');
  input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const data = computeReaderReportData(input);
  const render = async (builtOn: string) => new JSDOM((await buildMarketReport(data, { ...sync1Options, builtOn })).html).window.document;
  const doc = await render(sync1Options.builtOn);
  const expected = opportunityRows(platformSignals(data.rows));
  assert.deepEqual([...doc.querySelectorAll('#phan-11 tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)), expected);
  assert.equal(doc.querySelector('#phan-11 [data-classified]'), null);
  const sections = ['#phan-11', '#phan-12'].map(id => doc.querySelector(id)!.textContent!).join(' ');
  assert.doesNotMatch(sections, /%|\b0 VND\b|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|zen-studio|Google|số 1 thị trường|tốt nhất|dẫn đầu ngành|hàng đầu|ưu tiên/iu);
  assert.ok(lintVisibleReportText(['#phan-11', '#phan-12'].map(id => doc.querySelector(id)!.outerHTML).join('')).every(row => row.ok));
  assert.match(sections, /không cộng thêm/u);
  assert.equal((await render('31/02/2026')).querySelector('#phan-12 tbody tr td:last-child')!.textContent, '07/02/2026');
  // Simulate malformed retained metadata after the normal input validation boundary.
  data.input.source!.measurementPeriod.end = 'bad';
  for (const builtOn of ['bad', '2026-10-19', '31/02/2026']) {
    assert.equal((await render(builtOn)).querySelector('#phan-12 tbody tr td:last-child')!.textContent, '08/01/2026');
  }
});

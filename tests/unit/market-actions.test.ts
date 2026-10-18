import assert from 'node:assert/strict';
import test from 'node:test';

import { dayPlus, isoFromReaderDay, marketActionPlan, opportunityRows, platformSignals, type ActionRow } from '../../src/modules/analysis/reader-report/market-actions.js';

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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

const snapshot = () => JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));
const input = (): ReaderReportInput => ({ ...sync1ReaderFixture('1.4.0'), peerRule: { ...DEFAULT_MARKET_PEER_RULE } });
async function documentFor(value: ReaderReportInput) {
  const dom = new JSDOM((await buildMarketReport(computeReaderReportData(value), sync1Options)).html);
  return dom;
}
function exhibit(doc: Document, number: string): Element {
  const found = [...doc.querySelectorAll('.ex')].find(node => node.querySelector('.exn')?.textContent === `Bảng ${number}`);
  assert.ok(found, `missing table ${number}`);
  return found;
}
const text = (node: Element) => {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('sup.cite').forEach(cite => cite.remove());
  return copy.textContent!.replace(/\(đề xuất, chờ chủ duyệt\)/g, '').replace(/\s+/g, ' ').trim();
};

test('R-M18 v2 withholds numeric totals in tables 1.1 and 6.3 when a platform measurement is missing', async () => {
  const complete = await documentFor(input());
  try {
    const table = exhibit(complete.window.document, '1.1');
    assert.deepEqual([...table.querySelectorAll('thead th')].map(text), ['Chỉ số', 'Shopee', 'TikTok Shop', 'Cộng 2 sàn']);
    assert.deepEqual([...table.querySelectorAll('tbody tr td:last-child')].map(text), ['0,06 tỷ', '420']);
  } finally { complete.window.close(); }
  for (const field of ['rev', 'units'] as const) {
    const value = input();
    value.rows.find(row => row.platform === 'tiktok')![field] = null;
    value.rows.find(row => row.platform === 'tiktok')!.asp = null;
    const dom = await documentFor(value);
    try {
      const doc = dom.window.document;
      assert.doesNotMatch(exhibit(doc, '1.1').textContent!, /Cộng 2 sàn/);
      if (field === 'rev') {
        const cells = exhibit(doc, '6.3').querySelectorAll('tbody tr:first-child td');
        assert.equal(text(cells[1]!), 'Chưa có dữ liệu');
        assert.equal(text(cells[3]!), 'Chưa có dữ liệu');
      }
    } finally { dom.window.close(); }
  }
});

test('R-M34 v2 names the sales average and explains daily units and voucher limits on a Chú thích line', async () => {
  const dom = await documentFor(input());
  try {
    const sales = [...dom.window.document.querySelectorAll('.ex')].find(node => node.querySelector('th:last-child')?.textContent === 'Giá bán trung bình');
    assert.ok(sales, 'sales table has the approved price name');
    assert.match(sales.querySelector('.ex-note')!.textContent!, /^Chú thích:.*giá bán trung bình.*doanh thu ÷ đơn vị bán.*lượt bán từng ngày.*không phải giá người mua trả sau voucher\./iu);
    assert.doesNotMatch(dom.window.document.body.textContent!, /giá thật/iu);
  } finally { dom.window.close(); }
});

test('R-M37/L5 v2 merges exact brands, sums platform revenue and orders the top ten before unknown totals', async () => {
  const value = input();
  const brands: [string, number | null, number][] = [
    ['Unknown Z', null, 8], ['Now', 2, 3], ['Unknown B', null, 9], ['Now Food', 4, 0],
    ['A', 4, 6], ['G', 0, 0], ['F', 0.2, 0.3], ['C', 1, 2], ['E', 0.4, 0.6], ['D', 1, 1], ['Unknown C', null, 10],
  ];
  value.rows = brands.flatMap(([brand, shopee, tiktok], b) => (['shopee', 'tiktok'] as const).map((platform, p) => {
    const rev = [shopee, tiktok][p];
    return { ...value.rows[0]!, i: 2 * b + p, listing: `brand-${b}-${p}`, brand, platform,
      title: 'Bình nhỏ', rev: rev === null ? null : rev! * 1e9, units: 1, asp: rev === null ? null : rev! * 1e9 };
  }));
  const dom = await documentFor(value);
  try {
    const table = exhibit(dom.window.document, '6.3');
    assert.deepEqual([...table.querySelectorAll('thead th')].map(text), ['Nhãn thương hiệu', 'Cộng 2 sàn', 'Shopee', 'TikTok Shop']);
    const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(text));
    assert.deepEqual(rows.map(row => row[0]), ['A', 'Now', 'Now Food', 'C', 'D', 'E', 'F', 'G', 'Unknown Z', 'Unknown B']);
    assert.deepEqual(rows.slice(0, 3), [['A', '10,00 tỷ', '4,00 tỷ', '6,00 tỷ'], ['Now', '5,00 tỷ', '2,00 tỷ', '3,00 tỷ'], ['Now Food', '4,00 tỷ', '4,00 tỷ', '0,00 tỷ']]);
    assert.deepEqual(rows.slice(-2).map(row => row[1]), ['Chưa có dữ liệu', 'Chưa có dữ liệu']);
  } finally { dom.window.close(); }
});

test('R-M35 every v2 comparison carries its metric and dd/mm–dd/mm/yyyy period beside the value', async () => {
  const dom = await documentFor(input());
  try {
    const doc = dom.window.document;
    const shares = [...exhibit(doc, '4.1').querySelectorAll('tbody tr td:last-child')];
    assert.equal(shares.length, 4);
    for (const cell of shares) {
      assert.match(cell.textContent!, /%/);
      const note = cell.querySelector('small');
      assert.ok(note, 'each share has its own comparison note');
      assert.match(note.textContent!, /doanh thu lõi của nhóm so với doanh thu lõi của (Shopee|TikTok Shop), kỳ 01\/01–31\/01\/2026/);
    }
    const structure = [...doc.querySelectorAll('.market-findings li')].find(node => /Bảng 4\.1/.test(node.textContent!));
    assert.ok(structure, 'the structure comparison is printed');
    assert.match(structure.querySelector('small')!.textContent!, /tỷ trọng doanh thu lõi của từng nhóm so với doanh thu lõi của sàn, kỳ 01\/01–31\/01\/2026/);
    for (const note of doc.querySelectorAll('small.cmp-note')) {
      assert.match(note.textContent!, /doanh thu.*kỳ 01\/01–31\/01\/2026/);
    }
  } finally { dom.window.close(); }
});

test('R-M36 v2 monthly lines contain only Shopee and TikTok Shop, without a total series', async () => {
  const value = input(); delete value.source;
  value.webSnapshot = snapshot(); value.webSnapshotSha256 = webSnapshotDigest(value.webSnapshot);
  const dom = await documentFor(value);
  try {
    const chart = [...dom.window.document.querySelectorAll('figure.ex')].find(node => node.querySelector('.exn')?.textContent === 'Hình 3.1');
    assert.ok(chart, 'monthly line chart is drawn');
    assert.deepEqual([...new Set([...chart.querySelectorAll('[data-series]')].map(node => node.getAttribute('data-series')))], ['Shopee', 'TikTok Shop']);
    assert.equal(chart.querySelectorAll('polyline').length, 2, 'exactly one line for each platform');
  } finally { dom.window.close(); }
});

for (const version of ['1.2.0', '1.3.0'] as const) for (const missing of [false, true]) {
  test(`R-L20 Market ${version} web titles 7.4–7.6 ${missing ? 'drop ranking when sample count is absent' : 'name revenue, counted sample, platforms and period'}`, async () => {
    const value = { ...sync1ReaderFixture(version), ...(version === '1.3.0' ? { peerRule: { ...DEFAULT_MARKET_PEER_RULE } } : {}) };
    delete value.source;
    const web = snapshot();
    if (missing) { web.groups.W2_kpi.soldListings.current.value = null; web.groups.W2_kpi.soldListings.current.displayed = '—'; }
    value.webSnapshot = web; value.webSnapshotSha256 = webSnapshotDigest(web);
    const dom = await documentFor(value);
    try {
      for (const number of ['7.4', '7.5', '7.6']) {
        const caption = exhibit(dom.window.document, number).querySelector('.ext')!;
        const title = text(caption);
        assert.match(title, /doanh thu.*Shopee và TikTok Shop, kỳ 15\/09\/2025 – 20\/09\/2026/);
        if (missing) assert.doesNotMatch(title, /dẫn đầu|số 1|nhiều nhất/iu);
        else {
          assert.match(title, /dẫn đầu.*\d[\d.]* sản phẩm có lượt bán/);
          assert.deepEqual(lintVisibleReportText(caption.outerHTML).filter(row => !row.ok), [], title);
        }
      }
    } finally { dom.window.close(); }
  });
}

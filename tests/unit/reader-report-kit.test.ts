import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Bundle, Narrator, barChart, classify, cover, lint, makeExhibits, num, page, paretoChart, platIcons,
  readerReportFontCss, renderChart, renderFlintChart, scopeMetrics, section, stripChart, ty, READER_SECTION_ANCHORS, type Profile, type Row,
} from '../../src/modules/analysis/reader-report/index.js';

const profile: Profile = {
  slug: 'synthetic', product: 'Bình thử', status: 'proposed',
  segments: { S1: 'Bình nhỏ', S2: 'Bình lớn', N1: 'Hàng tặng kèm' }, short: { S1: 'Nhỏ', S2: 'Lớn' },
  core: ['S1', 'S2'], non: ['N1'],
  measure: { unit: 'ml', re: '(\\d+(?:\\.\\d+)?)\\s*(ml|lít)', toBase: { ml: 1, 'lít': 1000 } },
  rules: [
    { seg: 'N1', when: { titleRe: 'nước giặt' } },
    { seg: 'S2', when: { measureGte: 1000 } },
    { seg: 'S1', when: {} },
  ],
  signals: [['Quà tặng', 'quà']],
};
const row = (i: number, shop: string, rev: number, units: number, brand: string, title: string): Row =>
  ({ i, platform: 'shopee', listing: `L${i}`, shop, cat: 'Bình', rev, units, asp: rev / units, brand, title });
const fixture = (): Row[] => [
  row(0, 'A', 600, 6, 'X', 'Bình nhỏ 500ml'),
  row(1, 'A', 300, 3, 'X', 'Bình lớn 1 lít'),
  row(2, 'B', 100, 1, '(không ghi)', 'Bình nhỏ làm quà'),
  row(3, 'C', 50, 5, 'Y', 'Nước giặt tặng bình'),
];

test('Vietnamese number formats match the golden report', () => {
  assert.equal(num(1234567), '1.234.567');
  assert.equal(ty(2.5e9), '2,50 tỷ');
});

test('profile rules classify rows and scope metrics are deterministic', () => {
  const rows = fixture();
  assert.deepEqual(classify(rows, profile), { 0: 1, 1: 1, 2: 2 });
  assert.deepEqual(rows.map(r => r.seg), ['S1', 'S2', 'S1', 'N1']);
  assert.deepEqual(rows[1]!.vol, [1000]);
  const B = new Bundle();
  const S = scopeMetrics(B, 'shopee', rows, profile);
  assert.equal(B.v('shopee.all.rev'), 1050);
  assert.equal(B.v('shopee.core.rev'), 1000);
  assert.equal(B.v('shopee.core.n'), 3);
  assert.equal(B.f('shopee.non.share'), '5%');
  assert.equal(B.v('shopee.seg.S1.revShare'), 70);
  assert.equal(B.v('shopee.conc.1'), 90);
  assert.equal(B.v('shopee.shop.ratio12'), 9);
  assert.equal(B.v('shopee.brand.none.rev'), 100);
  assert.equal(B.v('shopee.brand.count'), 1);
  assert.equal(B.v('shopee.sig.0.n'), 1);
  assert.deepEqual(S.shops.map(s => [s.shop, s.rev]), [['A', 900], ['B', 100]]);
  assert.deepEqual(S.segs.map(s => s.top), [[0, 2], [1], [3]]);
});

test('a row that matches no rule fails loudly', () => {
  const strict: Profile = { ...profile, rules: [{ seg: 'S1', when: { titleRe: 'không khớp' } }] };
  assert.throws(() => classify(fixture(), strict), /không khớp luật nào/);
});

test('bundle rejects non-finite metrics and unknown ids', () => {
  const B = new Bundle();
  assert.throws(() => B.set('x', NaN, 'num'), /không hữu hạn/);
  assert.throws(() => B.f('missing'), /thiếu metric/);
});

test('narrative fills placeholders and flags hard-coded numbers per report', () => {
  const rows = fixture(); classify(rows, profile);
  const B = new Bundle(); scopeMetrics(B, 'shopee', rows, profile);
  const a = new Narrator(B), b = new Narrator(B);
  assert.equal(a.nar('Lõi có {{shopee.core.n}} sản phẩm; gian hàng lớn nhất giữ {{shopee.conc.1}}.', 'T1'), 'Lõi có 3 sản phẩm; gian hàng lớn nhất giữ 90,0%.');
  a.nar('Có 12 gian hàng ở Phần 4.', 'T2');
  assert.equal(b.entries.length, 0);
  assert.deepEqual(a.checkHardcoded().hardcoded.map(x => [x.where, x.token]), [['T2', '12']]);
  assert.deepEqual(a.notInBundle().map(x => x.where), []);
  assert.ok(B.used.has('shopee.core.n'));
});

test('charts are plain SVG with no external references', () => {
  for (const svg of [
    barChart(['A', 'B'], [{ name: 'Shopee', values: [1, 2] }, { name: 'TikTok Shop', values: [2, 1] }]),
    paretoChart([{ name: 'Shopee', ys: [50, 80, 100] }]),
    stripChart([{ label: 'Nhỏ', pts: [{ v: 100, s: 1 }, { v: 1000, s: 3 }] }]),
  ]) {
    assert.match(svg, /^<svg class="kc"/);
    assert.doesNotMatch(svg, /NaN|undefined|https?:\/\/(?!www\.w3\.org)/);
  }
});

test('a full reader page embeds local fonts and passes lint', () => {
  const css = readerReportFontCss();
  assert.equal(css.match(/@font-face/g)?.length, 12);
  assert.doesNotMatch(css, /https?:/);
  const { fig, tbl } = makeExhibits('Dữ liệu bán hàng ước tính.');
  const ids = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12', 'M13'];
  const sections = ids.map((id, k) => section(id, `Mục ${k + 1}`, 'Câu trả lời ngắn.',
    id === 'M12' ? '<p>Ba phương án là đề xuất, chờ chủ duyệt.</p>'
      : id === 'M01' ? fig('1.1', 'Doanh thu', 'tỷ đồng', barChart(['A'], [{ name: 'Shopee', values: [1] }]), { note: 'Số ước tính.' }) + '<p>Xem Hình 1.1.</p>'
        : id === 'M13' ? tbl('PL.1', 'Nguồn số liệu', '', ['Nguồn'], [['Shopee']]) : ''));
  const html0 = page({
    title: 'Báo cáo thị trường – Bình thử', coverHtml: cover(null, 'Shopee và TikTok · 05/10/2026', ['Báo cáo thị trường', 'Bình thử', 'Shopee và TikTok Shop']),
    intro: '<div class="box"><h3>Tóm tắt</h3><p>Phân loại là đề xuất, chờ duyệt.</p></div>', toc: ids.map(id => [id, id] as const), sections, foot: 'TDN.',
  });
  const { html, count } = platIcons(html0, { shopee: '#c2410c', tiktok: '#1d2327' });
  assert.ok(count >= 4);
  const results = lint(html, { sectionIds: READER_SECTION_ANCHORS });
  assert.deepEqual(results.filter(r => !r.ok), []);
  assert.equal(results.length, 9);
});

test('lint catches provider names, remote fonts and missing sources', () => {
  const bad = '<html><head><title>Metric</title><link href="https://fonts.googleapis.com/css2" rel="stylesheet"></head><body><section id="phan-1"><div class="ex"><span class="exn">Bảng 1.1</span></div></section></body></html>';
  const failed = lint(bad).filter(r => !r.ok).map(r => r.rule.split(' ')[0]);
  assert.deepEqual(failed.sort(), ['F0', 'F1', 'F2', 'F6', 'F8']);
});

test('flint renders static SVG offline with fixed platform colours, and falls back when it cannot', async () => {
  const input = {
    data: { values: [{ hang: 1, san: 'Shopee', luy_ke: 40.5 }, { hang: 2, san: 'Shopee', luy_ke: 61 }, { hang: 1, san: 'TikTok Shop', luy_ke: 55 }, { hang: 2, san: 'TikTok Shop', luy_ke: 70.25 }] },
    semantic_types: { hang: 'Rank', san: 'Category', luy_ke: 'Number' },
    field_display_names: { hang: 'Số gian hàng', san: 'Sàn', luy_ke: '% doanh thu lõi cộng dồn' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'hang', y: 'luy_ke', color: 'san' } },
  };
  const svg = await renderFlintChart(input, { palette: { san: { Shopee: '#c2410c', 'TikTok Shop': '#1d2327' } } });
  assert.match(svg, /^<svg[^>]* viewBox=/);
  assert.match(svg, /#c2410c/i);
  assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org)|NaN|undefined/);
  const again = await renderFlintChart(input, { palette: { san: { Shopee: '#c2410c', 'TikTok Shop': '#1d2327' } } });
  assert.equal(again, svg, 'same input, same SVG');
  const broken = await renderChart({ ...input, chart_spec: { chartType: 'No Such Chart', encodings: {} } }, () => '<svg class="kc"></svg>');
  assert.equal(broken.engine, 'svg-fallback');
  assert.equal(broken.svg, '<svg class="kc"></svg>');
  assert.ok(broken.error);
});

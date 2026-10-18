import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_COVER_JPEG_BYTES } from '../../src/modules/analysis/research-automation/cover-image-codec.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';

const glossary = `<table data-glossary="true"><tbody>${[
  ['listing', 'sản phẩm'], ['review', 'đánh giá'], ['export', 'tệp dữ liệu'], ['peer set', 'nhóm đối thủ'],
  ['Giá TB', 'giá trung bình'], ['P25 / P75', 'mốc 25% / mốc 75%'], ['NSX', 'nhà sản xuất'], ['H1', 'giả thuyết 1'],
  ['ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo'], ['CPA', 'chi phí trên đơn'], ['AI', 'trí tuệ nhân tạo'],
].map(([term, meaning]) => `<tr><td>${term}</td><td>${meaning}</td></tr>`).join('')}</tbody></table>`;

const sections = [...Array.from({ length: 11 }, (_, i) => `<section id="phan-${i + 1}"><span>Phần ${i + 1}</span><p>Doanh thu 10 trong mẫu (n = 4) sản phẩm.</p></section>`),
  `<section id="phan-12"><span>Phần 12</span><p>Ba phương án là đề xuất, chờ chủ duyệt.</p><table><thead><tr><th>Việc làm ngay</th><th>Người phụ trách</th><th>Hạn</th></tr></thead><tbody>${[
    'Việc làm nhanh: rà dữ liệu', 'Kiểm tra phân loại', 'Đối chiếu đánh giá',
  ].map(name => `<tr><td>${name} (đề xuất, chờ chủ duyệt)</td><td>Chủ dự án (đề xuất, chờ chủ duyệt)</td><td>Hạn: chủ chọn</td></tr>`).join('')}</tbody></table></section>`,
  `<section id="phu-luc"><span>Phụ lục</span>${glossary}<p>Dữ liệu bán hàng, dữ liệu đánh giá sản phẩm trên nền tảng, kết quả tìm kiếm, bình luận đã thu thập.</p><p>Bảng PL.1</p><p class="ex-note"><b>Chú thích:</b> Các số liệu trong mẫu là số ước tính.</p></section>`];

const flintChart = '<div class="chart flint" data-engine="flint"><svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"></rect></svg></div>';
const valid = `<html><head><style>.pi{background-image:url(data:image/svg+xml;base64,AA==)}</style></head><body><header class="cover"></header>
${sections.join('')}
<p>Trong mẫu n = 4 sản phẩm. <i class="pi s">Shopee</i> và <i class="pi t">TikTok Shop</i>.</p>
<table><thead><tr><th>Sàn</th><th>Doanh thu</th></tr></thead><tbody><tr><td><i class="pi s">Shopee</i></td><td>10</td></tr><tr><td><i class="pi t">TikTok Shop</i></td><td>20</td></tr></tbody></table>
${flintChart.repeat(3)}</body></html>`;

const rule = (html: string, number: string, trace?: string) => auditMarket14(html, trace).find(item => item.rule === number)!;

test('listing needs a glossary definition only when the reader still uses that term', () => {
  const localized = valid.replace('<tr><td>listing</td><td>sản phẩm</td></tr>', '');
  assert.equal(rule(localized, '1').ok, true);
  assert.equal(rule(localized.replace('</body>', '<p>listing</p></body>'), '1').ok, false);
});

test('synthetic Market HTML passes all machine rules and marks review-only rules as READ', () => {
  const results = auditMarket14(valid);
  assert.deepEqual(results.filter(item => item.kind === 'machine' && !item.ok), []);
  assert.deepEqual(results.filter(item => item.kind === 'evidence').map(item => item.rule), ['6', '8', '10', '14']);
  assert.equal(rule(valid, '10').ok, false);
  const licensed = valid.replace('<header class="cover">', '<header class="cover" style="background-image:url(\'data:image/png;base64,AAAA\')">');
  assert.equal(rule(licensed, '10', 'owner-supplied asset; licensed for reuse').ok, false, 'a licensed non-AI cover never passes automatically');
  assert.equal(rule(licensed, '10', 'owner-supplied asset; licensed for reuse').kind, 'evidence');
  assert.match(rule(licensed, '10', 'owner-supplied asset; licensed for reuse').detail, /READ: a licensed or owner-supplied cover needs owner review/);
});

const coverImg = (attributes: string) => valid.replace('<header class="cover"></header>', `<header class="cover"><div><img class="cv-art" ${attributes}><p>Báo cáo</p></div></header>`);
const aiSrc = (payload: string) => coverImg(`src="${payload}" alt="Minh hoạ chung do AI tạo" data-cover-provenance="ai-generated"`);
const jpegOf = (length: number) => { const bytes = Buffer.alloc(length, 0x11); bytes[0] = 0xff; bytes[1] = 0xd8; bytes[length - 2] = 0xff; bytes[length - 1] = 0xd9; return bytes.toString('base64'); };

test('rule 10 passes only a bounded base64 JPEG (SOI..EOI) with AI provenance and alt text', () => {
  assert.equal(rule(aiSrc('data:image/jpeg;base64,/9j/2Q=='), '10').ok, true);
  assert.equal(rule(aiSrc(`data:image/jpeg;base64,${jpegOf(MAX_COVER_JPEG_BYTES)}`), '10').ok, true, 'exactly at the size cap');
  const refused: Array<[string, string]> = [
    ['data:image/png;base64,iVBORw0KGgo=', 'PNG'],
    ['data:image/webp;base64,UklGRgAAAABXRUJQ', 'WebP'],
    ['data:image/jpeg;base64,/9j/AA==', 'JPEG without EOI'],
    ['data:image/jpeg;base64,iVBORw0KGgo=', 'PNG bytes labelled JPEG'],
    ['data:image/jpeg;base64,/9j/2Q', 'unpadded base64'],
    ['data:image/jpeg;base64,/9j/2Q==/9j/2Q==', 'padding inside the payload'],
    [`data:image/jpeg;base64,${jpegOf(MAX_COVER_JPEG_BYTES + 3)}`, 'over the size cap'],
  ];
  for (const [src, label] of refused) {
    assert.equal(rule(aiSrc(src), '10').ok, false, label);
    assert.equal(rule(aiSrc(src), '10').kind, 'machine', label);
  }
});

test('rule 10 passes an embedded AI cover with provenance and alt text, without any licence claim', () => {
  const img = coverImg;
  const ai = img('src="data:image/jpeg;base64,/9j/2Q==" alt="Minh hoạ chung do AI tạo" data-cover-provenance="ai-generated" data-cover-model="gpt-image-2"');
  assert.equal(rule(ai, '10').ok, true);
  assert.match(rule(ai, '10').detail, /AI-generated provenance/);
  assert.doesNotMatch(rule(ai, '10').detail, /licen[cs]ed for/);
  for (const [html, label] of [
    [ai.replace('alt="Minh hoạ chung do AI tạo"', 'alt=""'), 'empty alt'],
    [ai.replace('alt="Minh hoạ chung do AI tạo"', 'alt="   "'), 'blank alt'],
    [ai.replace(' alt="Minh hoạ chung do AI tạo"', ''), 'missing alt'],
    [ai.replace('<p>Báo cáo</p>', '<img src="data:image/jpeg;base64,/9j/2Q==" data-cover-provenance="ai-generated"><p>Báo cáo</p>'), 'a second AI cover without alt'],
  ] as const) {
    assert.equal(rule(html, '10').ok, false, label);
    assert.equal(rule(html, '10').kind, 'machine', `${label} is a machine failure, not READ`);
    assert.match(rule(html, '10').detail, /malformed/, label);
  }
  const fallback = img('src="data:image/jpeg;base64,/9j/AA==" alt="Hình trang trí chung" data-cover-provenance="fallback"');
  assert.equal(rule(fallback, '10').ok, false, 'fallback stays READ');
  assert.match(rule(fallback, '10').detail, /READ/);
  assert.equal(rule(ai.replace('class="cover"', 'class="cover-in"'), '10').ok, false, 'cover-in is not the cover');
  assert.equal(rule(img('src="https://example.test/c.jpg" alt="x" data-cover-provenance="ai-generated"'), '10').ok, false, 'external img');
  assert.match(rule(img('src="https://example.test/c.jpg" alt="x" data-cover-provenance="ai-generated"'), '10').detail, /external|remote|malformed/i);
  assert.equal(rule(img('src="data:image/jpeg;base64,***" alt="x" data-cover-provenance="ai-generated"'), '10').ok, false, 'malformed data');
  const nested = valid.replace('<header class="cover"></header>',
    '<section class="cover"><section class="inner"><p>x</p></section><div><img src="data:image/jpeg;base64,/9j/2Q==" alt="Minh hoạ" data-cover-provenance="ai-generated"></div></section>');
  assert.equal(rule(nested, '10').ok, true, 'nested section cover form');
  const outside = valid.replace('</body>', '<img src="data:image/jpeg;base64,/9j/2Q==" alt="x" data-cover-provenance="ai-generated"></body>');
  assert.equal(rule(outside, '10').ok, false, 'an image outside the cover does not count');
});

test('each machine rule has a failing synthetic mutation', () => {
  const mutations: Record<string, string> = {
    '1': valid.replace('<td>review</td><td>đánh giá</td>', '<td>review</td><td></td>'),
    '2': valid.replace('Phần 1</span>', 'M01</span>'),
    '3': valid.replace('</body>', '<p>source_sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef</p></body>'),
    '4': valid.replace('Shopee</i> và', 'Google</i> và'),
    '5': valid.replace('Bảng PL.1', 'Ghi chú: Bảng PL.1'),
    '7': valid.replace('Trong mẫu n = 4 sản phẩm.', 'Trong mẫu 4 sản phẩm.'),
    '9': valid.replace(/Việc làm (?:nhanh|ngay)/gu, 'Bước'),
    '10': valid.replace('<header class="cover">', '<header class="cover" style="background-image:url(\'https://example.test/cover.jpg\')">'),
    '11': valid.replace('data-engine="flint"', 'data-engine="svg"'),
    '12': valid.replace(/TikTok Shop<\/i>/gu, 'TikTok</i>'),
    '13': valid.replace('bình luận đã thu thập', 'ghi chú nội bộ'),
  };
  for (const [number, html] of Object.entries(mutations)) assert.equal(rule(html, number).ok, false, `rule ${number}`);
});

test('rules 6, 8 and 14 remain evidence reads', () => {
  for (const number of ['6', '8', '14']) {
    const result = rule(valid, number);
    assert.equal(result.kind, 'evidence', `rule ${number}`);
    assert.match(result.detail, /READ/);
  }
});

test('empty HTML fails every newly hardened machine rule', () => {
  for (const number of ['5', '7', '9', '11']) assert.equal(rule('', number).ok, false, `rule ${number}`);
});

test('rule 5 requires a standalone renderer note and rejects an inline note', () => {
  const note = '<p class="ex-note"><b>Chú thích:</b> Các số liệu trong mẫu là số ước tính.</p>';
  assert.equal(rule(valid.replace(note, ''), '5').ok, false, 'missing note block');
  assert.equal(rule(valid.replace(note, '<p>Chú thích: note đặt trong câu. Trong mẫu n = 4 sản phẩm.</p>'), '5').ok, false, 'inline note');
  assert.equal(rule(valid.replace('<body>', '<body data-market-platforms="shopee,tiktok">').replace(note, ''), '5').ok, false, 'presentation marker must not waive the note');
});

test('rule 3 rejects technical identifiers that are not legacy snake_case', () => {
  for (const token of [
    'M01_ITEMS_REFERENCE_UPSTREAM_CLAIMS',
    'source-bound-descriptive-market · 1.2.0',
    'normalized/observations.json',
    '/observations/17',
    '{"revenue":0}',
  ]) assert.equal(rule(valid.replace('</body>', `<p>${token}</p></body>`), '3').ok, false, token);
});

test('rule 3 scans technical identifiers inside visible quoted text', () => {
  const quoted = valid.replace('</body>', '<p><span data-quote>normalized/observations.json</span></p></body>');
  assert.equal(rule(quoted, '3').ok, false, 'quoted technical path must remain visible to the gate');
});

test('rule 7 requires an n = sample statement', () => {
  assert.equal(rule(valid.replace(/n = 4/gu, ''), '7').ok, false, 'no n = statement');
  assert.equal(rule(valid.replace(/n = 4/gu, '4'), '7').ok, false, 'malformed sample phrase');
  assert.equal(rule(valid.replace('<p>Trong mẫu n = 4 sản phẩm.', '<p>Trong mẫu n = 0 sản phẩm; doanh thu 10 VND.'), '7').ok, false, 'zero n beside a non-zero figure');
  const readerExclusionCount = valid.replace('<p>Trong mẫu n = 4 sản phẩm.', '<p>Số lần loại dòng ở các nhóm và sàn: 0; doanh thu 10 VND. Trong mẫu n = 4 sản phẩm.');
  assert.equal(rule(readerExclusionCount, '7').ok, true, 'the n in sàn: 0 is not a sample-size declaration');
  const unknown = valid.replace(/n = 4/gu, 'chưa có số lượng mẫu');
  assert.equal(rule(unknown, '7').ok, true, 'unknown stored count is stated without inventing n');
});

test('rule 9 binds approval labels and required fields to exactly three rows', () => {
  const rowLabelsOutsideRows = valid.replace(/ \(đề xuất, chờ chủ duyệt\)/gu, '');
  assert.equal(rule(rowLabelsOutsideRows, '9').ok, false, 'labels only in prose must not count');
  assert.equal(rule(valid.replace('Chủ dự án (đề xuất, chờ chủ duyệt)', ''), '9').ok, false, 'missing owner');
  assert.equal(rule(valid.replace('Hạn: chủ chọn', ''), '9').ok, false, 'missing deadline');
});

test('rule 11 rejects a flint marker with an empty or removed SVG', () => {
  assert.equal(rule(valid.replace(/<svg[\s\S]*?<\/svg>/iu, ''), '11').ok, false, 'removed SVG');
  assert.equal(rule(valid.replace(/<svg[\s\S]*?<\/svg>/iu, '<svg></svg>'), '11').ok, false, 'empty SVG');
});

test('rule 11 accepts only Flint charts and needs all three required charts', () => {
  assert.equal(rule(valid, '11').ok, true, 'three Flint charts');
  const fallback = valid.replace('data-engine="flint"', 'data-engine="svg-fallback"');
  assert.equal(rule(fallback, '11').ok, false, 'svg-fallback chart');
  assert.match(rule(fallback, '11').detail, /svg-fallback/);
  assert.equal(rule(valid.replace(' data-engine="flint"', ''), '11').ok, false, 'missing engine marker');
  const twoCharts = valid.replace(flintChart, '');
  assert.equal(rule(twoCharts, '11').ok, false, 'only two charts for a sample with rows');
  assert.match(rule(twoCharts, '11').detail, /2 of 3 required charts/);
  assert.equal(rule(twoCharts.replace('<body>', '<body data-market-chart-rows="4">'), '11').ok, false, 'marker with rows');
  assert.equal(rule(twoCharts.replace('<body>', '<body data-market-chart-rows="0">'), '11').ok, true, 'no usable rows: charts are skipped, not invented');
  assert.equal(rule(valid.replace('<body>', '<body data-market-chart-rows="4">'), '11').ok, true, 'marker with three Flint charts');
  const unrecorded = twoCharts.replace('<body>', '<body data-market-chart-rows="4" data-market-shops-unrecorded="1">');
  const shopNote = '<p>Không có hình mức tập trung theo gian hàng: nguồn không ghi gian hàng cho từng sản phẩm trong mẫu.</p></body>';
  assert.equal(rule(unrecorded.replace('</body>', shopNote), '11').ok, true, 'no recorded shop, said in the text: two charts suffice');
  assert.equal(rule(unrecorded, '11').ok, false, 'the marker alone does not waive the concentration chart');
  assert.equal(rule(twoCharts.replace('</body>', shopNote), '11').ok, false, 'visible missing-shop wording alone cannot waive a known-shop report');
  assert.equal(rule(unrecorded.replace(flintChart, '').replace('</body>', shopNote), '11').ok, false, 'two charts are still required');
  const macroFallback = flintChart.replace('data-engine="flint"', 'data-engine="svg-fallback" data-chart-id="M06.comtrade.mirror"');
  assert.equal(rule(valid + macroFallback, '11').ok, true, 'country-background fallback is allowed beside the required Flint charts');
  assert.equal(rule(twoCharts + macroFallback, '11').ok, false, 'country-background figures cannot replace a required sample chart');
  assert.equal(rule(valid + macroFallback.replace('M06.comtrade.mirror', 'market.concentration'), '11').ok, false, 'sample fallbacks remain refused');
  assert.equal(rule(valid + macroFallback.replace(/<svg[\s\S]*?<\/svg>/u, ''), '11').ok, false, 'a macro marker without drawn data is still refused');
});


test('rule 1 accepts Vietnamese percentile explanations and still rejects a missing or wrong meaning', () => {
  const vietnamese = valid.replace('mốc 25% / mốc 75%', 'mốc 25 phần trăm / mốc 75 phần trăm');
  assert.equal(rule(vietnamese, '1').ok, true);
  assert.equal(rule(vietnamese.replace('mốc 25 phần trăm', 'mốc 20 phần trăm'), '1').ok, false);
  assert.equal(rule(vietnamese.replace('mốc 75 phần trăm', ''), '1').ok, false);
});

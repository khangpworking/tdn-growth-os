import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { annotateExhibits, deliverMarketReader, figureInterpretation, stripTraceDetails, tableInterpretation } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

const sectionsOf = (html: string): Map<string, string> =>
  new Map([...html.matchAll(/<section class="sheet" id="(M\d\d)">([\s\S]*?)<\/section>/gu)].map(match => [match[1]!, match[2]!]));
const visible = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/gu, '').replace(/<svg[\s\S]*?<\/svg>/gu, '').replace(/<[^>]+>/gu, ' ');

test('trace blocks leave the reader but keep their citation marks, nested blocks included', () => {
  const html = '<p>a</p><details class="evidence-trace"><summary>Xem nguồn <sup class="cite">[2]</sup></summary><details><summary>x</summary>raw</details>Sheet1!A2</details><p>b</p>';
  assert.equal(stripTraceDetails(html), '<p>a</p><sup class="cite">[2]</sup><p>b</p>');
});

test('table interpretation reads each platform on its own and never sums them', () => {
  const table = '<div class="table-wrap"><table><thead><tr><th>Sàn</th><th>Tên</th><th>Doanh thu (VND)</th></tr></thead><tbody>'
    + '<tr><td>Shopee</td><td>A</td><td>100 VND</td></tr><tr><td>Shopee</td><td>B</td><td>chưa có dữ liệu</td></tr>'
    + '<tr><td>TikTok Shop</td><td>C</td><td>40 VND</td></tr><tr><td>TikTok Shop</td><td>D</td><td>70 VND</td></tr></tbody></table></div>';
  const text = tableInterpretation(table);
  assert.match(text, /^Bảng có 4 dòng\./u);
  assert.match(text, /Shopee: cột “Doanh thu \(VND\)” ghi 100 \(A\)\./u);
  assert.match(text, /TikTok Shop: ở cột “Doanh thu \(VND\)”, mức thấp là 40 \(C\) và mức cao là 70 \(D\);/u);
  assert.match(text, /1 dòng chưa có dữ liệu ở cột này\./u);
  assert.doesNotMatch(text, /%|VND \d|170|tổng|cộng/iu);
  // Pending classified cells are counted, never quoted.
  assert.equal(tableInterpretation(table.replace('<td>A</td>', '<td data-classified="pending">A</td>')), 'Bảng có 4 dòng.');
});

test('a table reading is escaped on delivery and stays with its own exhibit', () => {
  const table = '<table><thead><tr><th>Tên</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table>';
  const custom = table.replace('<table>', '<table data-reading="&quot;A&quot; &amp; &lt;img src=x onerror=bad&gt;">');
  const doc = new JSDOM(annotateExhibits(custom + table)).window.document;
  assert.deepEqual([...doc.querySelectorAll('.interp')].map(node => node.textContent),
    ['Diễn giải: "A" & <img src=x onerror=bad>', 'Diễn giải: Bảng có 1 dòng.']);
  assert.equal(doc.querySelector('img'), null);
  assert.equal(doc.querySelector('table')!.getAttribute('data-reading'), '"A" & <img src=x onerror=bad>');
});

test('proposal chips read the M12 table class without leaking from prose or adjacent sections', () => {
  const section = (id: string, body: string) => `<section class="sheet" id="${id}"><span class="state">old</span>${body}</section>`;
  const table = '<div class="table-wrap market14-proposals"><table><tbody><tr><td>Chưa có dữ liệu</td></tr></tbody></table></div>';
  const page = (body: string) => `<div id="sections">${body}</div><footer></footer>`;
  const doc = new JSDOM(deliverMarketReader(page(section('M10', '<p>market14-proposals has-figures</p>') + section('M12', table + table)))).window.document;
  assert.equal(doc.querySelector('#M10 .state')!.textContent, 'Chưa đủ dữ liệu');
  assert.equal(doc.querySelector('#M12 .state')!.textContent, 'Chưa đủ dữ liệu');
  const figured = new JSDOM(deliverMarketReader(page(section('M12', table.replace('market14-proposals', 'market14-proposals has-figures')) + section('M11', '<p>Chưa có dữ liệu</p>')))).window.document;
  assert.equal(figured.querySelector('#M12 .state')!.textContent, 'Có số liệu');
  assert.equal(figured.querySelector('#M11 .state')!.textContent, 'Chưa đủ dữ liệu');
  assert.equal(figured.querySelector('#M12 .interp'), null);
});

test('interpretations never range across unrelated columns or macro indicator units', () => {
  const table = (heads: string[], rows: string[][]) => `<table><thead><tr>${heads.map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  assert.equal(tableInterpretation(table(['Sản phẩm', 'Lượt bán', 'Chi phí'], [['A', '4', '100'], ['B', 'chưa có dữ liệu', '200']])), 'Bảng có 2 dòng.');
  const macro = table(['Chỉ số', 'Giá trị', 'Đơn vị'], Array.from({ length: 5 }, (_, i) => [`Chỉ số ${i + 1}`, `${i + 1}`, `Đơn vị ${i + 1}`]));
  assert.equal(tableInterpretation(macro.replace(/<th>Đơn vị<\/th>/u, '<th>Nguồn</th>')), 'Bảng có 5 dòng. Mỗi dòng là một thước đo riêng, đọc theo đơn vị của chính nó.');
  assert.equal(tableInterpretation(table(['Sản phẩm nguồn', 'Phép đo / đơn vị', 'Giá trị nguồn'], [['A', 'Doanh thu (VND)', '100'], ['A', 'Sản lượng bán', '2']])),
    'Bảng có 2 dòng. Các dòng có thước đo, đơn vị hoặc kỳ khác nhau; đọc riêng từng dòng.');
});

test('search interpretation preserves missing weeks and makes cross-year dates explicit', () => {
  const result = figureInterpretation('<figure><svg></svg></figure>', [
    { period: '2025-10-05', index: 20 }, { period: '2026-01-04', index: null }, { period: '2026-09-27', index: 40 },
  ]);
  assert.match(result, /từ 05\/10\/2025 đến 27\/09\/2026/u);
  assert.match(result, /từ 20 lên 40/u);
  assert.match(result, /1 mốc chưa có dữ liệu/u);
});

test('nested exhibit wrappers remain intact and notes and interpretations stay outside cells and captions', () => {
  const html = '<div class="table-wrap"><div><div>Tiêu đề</div></div><table><caption>Bảng</caption><thead><tr><th>Giá</th></tr></thead><tbody><tr><td>100</td></tr></tbody></table></div><figure><div><div><svg></svg></div></div><figcaption>Hình</figcaption></figure>';
  const doc = new JSDOM(annotateExhibits(html)).window.document;
  assert.equal(doc.querySelector('table')!.outerHTML, new JSDOM(html).window.document.querySelector('table')!.outerHTML);
  assert.equal(doc.querySelectorAll('.interp').length, 2);
  assert.equal(doc.querySelectorAll('.lim').length, 2);
  assert.equal(doc.querySelectorAll('td .interp, th .interp, caption .interp, td .lim, th .lim, caption .lim').length, 0);
  assert.equal(doc.querySelector('figure')!.nextElementSibling!.className, 'lim');
});

test('the default-peer table without a wrapper also receives a standalone note and interpretation', () => {
  const table = '<table><caption>Đối thủ mặc định trong nhóm, đặt cạnh nhau</caption><thead><tr><th>Nhãn nguồn</th><th>Doanh thu ước tính</th></tr></thead><tbody><tr><td>A</td><td>100</td></tr></tbody></table>';
  const doc = new JSDOM(annotateExhibits(table)).window.document;
  assert.equal(doc.querySelector('table')!.outerHTML, table);
  assert.equal(doc.querySelector('table')!.nextElementSibling!.className, 'lim');
  assert.equal(doc.querySelector('.lim')!.nextElementSibling!.className, 'interp');
});

test('reader terms are localized and the removed method target has no reader link', () => {
  const html = '<div id="sections"><section class="sheet" id="M10"><p>listing: search events</p><a href="#bounded-method-evidence">Xem nguồn</a><details id="bounded-method-evidence"><summary>Hồ sơ</summary>raw listing</details></section></div><footer>legacy</footer>';
  const reader = deliverMarketReader(html);
  assert.match(reader, /sản phẩm: lượt ghi nhận tìm kiếm/u);
  assert.doesNotMatch(reader, /listing|search events|href="#bounded-method-evidence"|<details/u);
});

test('share charts are described without their percentage values', () => {
  const aria = (value: string, label: string, platform: string) => `<path aria-label="Tỷ trọng doanh thu trong mẫu (%): ${value};  : ${label}; san: ${platform}; Sàn: ${platform}"/>`;
  const text = figureInterpretation(`<figure class="market-chart"><svg>${aria('42,9', '1 gian hàng', 'Shopee')}${aria('100', '3 gian hàng', 'Shopee')}</svg></figure>`);
  assert.equal(text, 'Shopee: 2 thanh, thanh dài là 3 gian hàng, thanh ngắn là 1 gian hàng. Giá trị đọc theo trục của hình; mỗi thanh đọc riêng.');
});

test('a bar drawn by marks with and without thousands dots is read once, with the unit of its measure', () => {
  const svg = '<path aria-label="Doanh thu trong mẫu (triệu đồng): 5621,7;  : Shopee; san: Shopee; doanh_thu: 5.622"/>'
    + '<path aria-label="Doanh thu trong mẫu (triệu đồng): 5.621,7;  : Shopee"/><path aria-label="Doanh thu trong mẫu (triệu đồng): 5127,3;  : TikTok Shop; san: TikTok Shop"/>';
  assert.equal(figureInterpretation(`<figure class="market-chart"><svg>${svg}</svg></figure>`),
    'Thanh Shopee ở mức 5.621,7 triệu đồng; thanh TikTok Shop ở mức 5.127,3 triệu đồng theo trục của hình. Mỗi sàn đọc riêng.');
});

test('a sales table whose caption mentions search keeps the sample note; a search-interest table keeps the context note', () => {
  const table = (caption: string) => `<div class="table-wrap"><table><caption>${caption}</caption><thead><tr><th>Tên</th><th>Doanh thu (VND)</th></tr></thead><tbody><tr><td>A</td><td>100</td></tr></tbody></table></div>`;
  assert.match(annotateExhibits(table('Shopee · số liệu từ bảng kết quả tìm kiếm đã lưu')), /Số liệu lấy từ các dòng đã lưu của từng sàn/u);
  assert.match(annotateExhibits(table('Thước đo nguồn theo từng dòng; doanh số đo nhu cầu trong mẫu, mức quan tâm tìm kiếm giữ riêng.')), /Số liệu lấy từ các dòng đã lưu của từng sàn/u);
  assert.match(annotateExhibits(table('Mức quan tâm tìm kiếm theo vùng')), /Số liệu nền từ nguồn công khai/u);
});

test('reader wording drops the doubled product word and the English "section", and writes the zero of empty states in words', () => {
  const html = '<div id="sections"><section class="sheet" id="M12"><p>Không chứng minh cùng người, sản phẩm, listing hoặc kỳ đo. Giữ theo section gốc. Đây không phải kết quả bằng 0. Hệ số bằng 0,5.</p></section></div><footer>bằng 0</footer>';
  const reader = deliverMarketReader(html);
  assert.match(reader, /cùng người, sản phẩm hoặc kỳ đo\. Giữ theo phần gốc\. Đây không phải kết quả bằng không\. Hệ số bằng 0,5\./u);
  assert.match(reader, /<footer>bằng 0<\/footer>/u, 'the footer is written by its own builder, outside the reader pass');
});

test('reader dates and terms are localized while source quotes, code and attributes retain their bytes', () => {
  const source = '<q>review 2026-08-17 bằng 0</q><blockquote><p>listing 2026-08-17</p></blockquote>'
    + '<span data-quote><b>review</b> 2026-08-17</span><code>listing_2026-08-17</code>';
  const html = `<div id="sections"><section class="sheet" id="M02"><p>Kỳ 2026-08-17 đến 2026-09-15; thu 2026-09-16T00:00:00Z.</p>`
    + `<p>Ngày review; danh sách top sản phẩm.</p><p>2026-08-17.xlsx; source-2026-08-17</p>${source}<a href="https://example.test/2026-08-17">Nguồn</a></section></div><footer>2026-08-17</footer>`;
  const reader = deliverMarketReader(html);
  assert.match(reader, /Kỳ 17\/08\/2026 đến 15\/09\/2026; thu 16\/09\/2026 00:00:00 UTC\./u);
  assert.match(reader, /Ngày đánh giá; danh sách sản phẩm doanh thu cao\./u);
  assert.ok(reader.includes(source));
  assert.match(reader, /2026-08-17\.xlsx; source-2026-08-17/u);
  assert.match(reader, /href="https:\/\/example.test\/2026-08-17"/u);
  assert.match(reader, /<footer>2026-08-17<\/footer>/u);
  const glossary = '<table data-glossary="true"><tbody><tr><td>review</td><td>đánh giá</td></tr><tr><td>export</td><td>tệp dữ liệu</td></tr></tbody></table>';
  const withGlossary = deliverMarketReader(html.replace('</section>', `${glossary}</section>`));
  assert.match(withGlossary, /<td>review<\/td><td>đánh giá<\/td>/u, 'a term still used by a verbatim quote retains its definition');
  assert.doesNotMatch(withGlossary, /<td>export<\/td>/u, 'an unused English term has no glossary entry');
});

test('full synthetic market14 report is delivered as a reader copy with notes and interpretations; the trace keeps the rest', async () => {
  const input = await fullMarket14Input();
  const built = buildResearchAutomationReport(input, 'MARKET');
  assert.deepEqual(buildResearchAutomationReport(input, 'MARKET'), built, 'delivery is deterministic');
  const html = built.html.toString('utf8');
  assert.ok(built.traceHtml, 'market14 build returns its hidden trace copy');
  const trace = built.traceHtml.toString('utf8');
  const sections = sectionsOf(html);
  assert.equal(sections.size, 13);
  const body = [...sections.values()].join('');
  const doc = new JSDOM(html).window.document;
  for (const id of ['M06', 'M07', 'M09']) {
    assert.equal(doc.querySelector(`#${id} > .section-reading`), null, `${id} uses its concise empty state`);
    const emptyCopy = [...doc.querySelectorAll(`#${id} > p`)].filter(node => /Chưa (?:có|đủ) dữ liệu/.test(node.textContent!));
    assert.equal(emptyCopy.length, 1, `${id} has one empty message`);
    assert.doesNotMatch(emptyCopy[0]!.textContent!, /\b0\b|%/);
  }
  assert.equal(doc.querySelectorAll('td .interp, th .interp, caption .interp, td .lim, th .lim, caption .lim').length, 0);
  assert.doesNotMatch(visible(body), /\blisting\b|search events/iu);
  const prose = doc.cloneNode(true) as Document;
  prose.querySelectorAll('style, script, svg, q, blockquote, code, pre, [data-quote]').forEach(node => node.remove());
  assert.doesNotMatch(prose.body.textContent!, /\d{4}-\d{2}-\d{2}|\breview\b|\bexport\b|peer set|danh sách top sản phẩm/u);
  assert.match(prose.body.textContent!, /tỉnh thiếu số để trống, không thay bằng số không/u);
  assert.match(visible(sections.get('M05')!), /từ 05\/10\/2025 đến 27\/09\/2026/u);
  // A7: no draft framing in the sections; M12 keeps its own approval label.
  const outsideM12 = [...sections].filter(([id]) => id !== 'M12').map(([, inner]) => visible(inner)).join(' ');
  assert.doesNotMatch(outsideM12, /Bản nháp|bản nháp|chưa duyệt|Chưa duyệt|chưa phải phân tích|Mục phân tích hoàn chỉnh/u);
  assert.match(visible(sections.get('M12')!), /đề xuất, chờ chủ duyệt/u);
  assert.doesNotMatch(body, /<details|class="evidence-trace"|Hồ sơ đối chiếu|method-reference|Sheet1/u);
  assert.match(html, /<p class="reader-guide"><b>Cách đọc báo cáo:<\/b>[^<]*<i class="pi s">Shopee<\/i>[\s\S]*?không phải bằng không/u);
  assert.doesNotMatch(html, /<p class="warning">[^<]*Mục phân tích hoàn chỉnh/u);
  for (const chip of body.matchAll(/<span class="state">([^<]*)<\/span>/gu)) assert.match(chip[1]!, /^(?:Có số liệu|Chưa đủ dữ liệu)$/u);
  // D30 + B13: every table and figure of Phần 3–11 has a standalone note and an interpretation right under it.
  let exhibits = 0;
  for (const id of ['M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11']) {
    const inner = sections.get(id)!;
    const count = (inner.match(/<table\b/gu) ?? []).length + (inner.match(/<figure\b/gu) ?? []).length;
    const interps = [...inner.matchAll(/<p class="interp"><b>Diễn giải:<\/b> ([\s\S]*?)<\/p>/gu)].map(match => match[1]!.replace(/<[^>]+>/gu, ''));
    assert.equal(interps.length, count, `${id} interpretations`);
    exhibits += count;
    for (const sentence of interps) {
      assert.doesNotMatch(sentence, /%|toàn thị trường|tổng hai|cộng|gộp/u, sentence);
      assert.ok(sentence.split(/(?<=\.)\s/u).length <= 3, sentence);
    }
    // Each exhibit is followed by its own note (inside the exhibit or right under it) before its interpretation.
    const chunks = inner.split('<p class="interp">').slice(0, -1);
    for (const chunk of chunks) {
      const start = Math.max(chunk.lastIndexOf('<figure'), chunk.lastIndexOf('<div class="table-wrap'));
      assert.match(chunk.slice(start), /<p class="(?:lim|ex-note)"><b>Chú thích:<\/b>/u, `${id} note`);
      assert.match(chunk.slice(start), /(?:<\/figure>|<\/table>[\s\S]*<\/div>)(?:<p class="lim"><b>Chú thích:<\/b>[^<]*<\/p>)?$/u, `${id} interpretation sits right under its exhibit`);
    }
  }
  assert.ok(exhibits >= 25, `synthetic report renders its exhibits (${exhibits})`);
  assertMarket14MachineRules(html);
  assertMarketBusinessGate(html, { presentation: true });
  // Citations still resolve to the register.
  for (const cite of body.matchAll(/href="#(cite-[^"]+)"/gu)) assert.ok(html.includes(`id="${cite[1]}"`), cite[1]);
  // The hidden trace keeps every block reader delivery removed.
  assert.ok((trace.match(/<details class="evidence-trace"/gu) ?? []).length >= 3);
  assert.match(trace, /Hồ sơ đối chiếu/u);
  // M13 method declarations never enter the market14 page; they stay in the semantic record.
  const variantRule = input.descriptiveMethods!.input.scope.variantRule;
  assert.ok(JSON.stringify(built.semantic).includes(variantRule), 'the removed method declaration is retained in the semantic record');
  assert.ok(!visible(body).includes(variantRule), 'the technical declaration is hidden from the reader');
  assert.ok(!visible(trace).includes(variantRule), 'the build drops the declaration before the trace copy');
  assert.doesNotMatch(trace, /<p class="interp">/u);
  assert.doesNotMatch(html, /href="[^"]*trace/iu);
});

test('Market builds without a presentation return no trace copy', async () => {
  const { marketPresentation: _presentation, ...input } = await fullMarket14Input();
  const built = buildResearchAutomationReport(input as Parameters<typeof buildResearchAutomationReport>[0], 'MARKET');
  assert.equal(built.traceHtml, undefined);
});

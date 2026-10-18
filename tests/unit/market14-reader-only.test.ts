import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { figureInterpretation, stripTraceDetails, tableInterpretation } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
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
  assert.match(text, /TikTok Shop: ở cột “Doanh thu \(VND\)”, mức thấp là 40 \(C\) và mức cao là 70 \(D\)\./u);
  assert.match(text, /1 dòng chưa có dữ liệu ở cột này\./u);
  assert.doesNotMatch(text, /%|VND \d|170|tổng|cộng/iu);
  // Pending classified cells are counted, never quoted.
  assert.equal(tableInterpretation(table.replace('<td>A</td>', '<td data-classified="pending">A</td>')), 'Bảng có 4 dòng.');
});

test('share charts are described without their percentage values', () => {
  const aria = (value: string, label: string, platform: string) => `<path aria-label="Tỷ trọng doanh thu trong mẫu (%): ${value};  : ${label}; san: ${platform}; Sàn: ${platform}"/>`;
  const text = figureInterpretation(`<figure class="market-chart"><svg>${aria('42,9', '1 gian hàng', 'Shopee')}${aria('100', '3 gian hàng', 'Shopee')}</svg></figure>`);
  assert.equal(text, 'Shopee: 2 thanh, thanh dài là 3 gian hàng, thanh ngắn là 1 gian hàng. Giá trị đọc theo trục của hình; mỗi thanh đọc riêng.');
});

test('full synthetic market14 report is delivered as a reader copy with notes and interpretations; the trace keeps the rest', async () => {
  const built = buildResearchAutomationReport(await fullMarket14Input(), 'MARKET');
  const html = built.html.toString('utf8');
  assert.ok(built.traceHtml, 'market14 build returns its hidden trace copy');
  const trace = built.traceHtml.toString('utf8');
  const sections = sectionsOf(html);
  assert.equal(sections.size, 13);
  const body = [...sections.values()].join('');
  // A7: no draft framing in the sections; M12 keeps its own approval label.
  const outsideM12 = [...sections].filter(([id]) => id !== 'M12').map(([, inner]) => visible(inner)).join(' ');
  assert.doesNotMatch(outsideM12, /Bản nháp|bản nháp|chưa duyệt|Chưa duyệt|chưa phải phân tích|Mục phân tích hoàn chỉnh/u);
  assert.match(visible(sections.get('M12')!), /đề xuất, chờ chủ duyệt/u);
  assert.doesNotMatch(body, /<details|class="evidence-trace"|Hồ sơ đối chiếu|method-reference|Sheet1/u);
  assert.match(html, /<p class="reader-guide"><b>Cách đọc báo cáo:<\/b>[^<]*<i class="pi s">Shopee<\/i>[\s\S]*?không phải bằng 0/u);
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
      assert.ok(sentence.split(/(?<=\.)\s/u).length <= 4, sentence);
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
  // Citations still resolve to the register.
  for (const cite of body.matchAll(/href="#(cite-[^"]+)"/gu)) assert.ok(html.includes(`id="${cite[1]}"`), cite[1]);
  // The hidden trace keeps every removed block.
  assert.ok((trace.match(/<details/gu) ?? []).length >= 5);
  assert.match(trace, /Hồ sơ đối chiếu/u);
  assert.doesNotMatch(trace, /<p class="interp">/u);
  assert.doesNotMatch(html, /href="[^"]*trace/iu);
});

test('Market builds without a presentation return no trace copy', async () => {
  const { marketPresentation: _presentation, ...input } = await fullMarket14Input();
  const built = buildResearchAutomationReport(input as Parameters<typeof buildResearchAutomationReport>[0], 'MARKET');
  assert.equal(built.traceHtml, undefined);
});

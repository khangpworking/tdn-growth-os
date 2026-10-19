import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationMarkOrMissing, renderCitationRegister } from '../../src/modules/analysis/citation-register-html.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { marketInventorySection } from '../../src/modules/analysis/research-automation/market-inventory-report.js';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import { deliverMarketReader, tableInterpretation } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const caveat = 'Chưa rõ phiên bản, combo hay điều kiện giá.';
const banned = /\b(?:variant|pack)\b|khối lượng (?:tịnh|ráo|cái)|Chưa xác nhận giá|ba chữ số thập phân|không thay bằng giá bán trung bình|%|toàn thị trường|tổng|cộng|gộp|Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|zen-studio|Google|nhất|hàng đầu|ưu tiên/iu;
const labels = new Map(Array.from({ length: 8 }, (_, i) => [`detail:p${i + 1}`, i === 0 ? 'Quạt <mẫu> & A' : `Quạt mẫu ${i + 1}`]));
const context = { platforms: new Map([...labels.keys()].map((key, i) => [key, i === 4 ? 'shopee' : 'tiktok'])) };

function inventory(): AutomationMarketMethodSnapshot {
  const requestedWindow = { start: '2026-09-12', end: '2026-10-11' };
  const rawQuery = { start: '2026-08-01', end: '2026-08-30' };
  const captures = [
    { n: 30, p: 1, at: '2026-09-01', value: '100000', range: ['90000', '110000'] },
    { n: 2, p: 1, at: '2026-09-02', value: '391777', range: ['350000', '450000'] },
    { n: 3, p: 2, at: '2026-09-02', value: '0', range: ['100000', '200000'] },
    { n: 4, p: 3, at: '2026-09-02', value: null, range: null },
    { n: 5, p: 4, at: '2026-09-02', value: '391777', range: ['374467', '374467'] },
    { n: 6, p: 5, at: '2026-09-02', value: '391777', range: ['100000', '200000'] },
    { n: 7, p: 6, at: '2026-09-02', value: '90000', range: ['0', '100000'] },
    { n: 8, p: 7, at: '2026-09-01', value: '52000', range: null },
    { n: 9, p: 7, at: '2026-09-02', value: '0', range: null },
    { n: 10, p: 8, at: '2026-09-02', value: '0.1', range: ['0.1', '0.2'] },
  ];
  const source = (n: number, fieldPointer = '/data') => ({ sourceSha256: hash(`synthetic capture ${n}`), fieldPointer });
  return {
    temporal: { input: { frame: { members: [...labels.keys()].map(memberKey => ({ memberKey })) }, observations: captures.flatMap(row => [
      { observationId: `capture-${row.n}-revenue`, subjectMemberKeys: [`detail:p${row.p}`], retrievedAt: `${row.at}T00:00:00Z`, measure: { literal: 'revenue', unit: 'VND', currency: 'VND' }, value: { decimal: row.value === '0' ? '0' : '123456789', literal: null }, requestedWindow, rawQuery, source: source(row.n, '/data/revenue') },
      { observationId: `capture-${row.n}-sales_volumn`, subjectMemberKeys: [`detail:p${row.p}`], retrievedAt: `${row.at}T00:00:00Z`, measure: { literal: 'sales_volumn', unit: null, currency: null }, value: { decimal: row.value === '0' ? '0' : '25', literal: null }, requestedWindow, rawQuery, source: source(row.n, '/data/sales_volumn') },
    ]) } },
    quotes: { input: { quotes: captures.flatMap(row => {
      const base = { quoteId: `capture-${row.n}-unit-price`, acquiredAt: `${row.at}T00:00:00Z`, offerText: null,
        price: { value: row.value, range: null, currency: 'VND', state: row.value === null ? 'UNREADABLE' : 'NON_EXACT' }, source: source(row.n) };
      return [base, ...(row.range ? [{ ...base, quoteId: `capture-${row.n}-price-range`, price: { ...base.price, value: null, range: { minimum: row.range[0], maximum: row.range[1] }, state: 'RANGE' } }] : [])];
    }) } },
  } as unknown as AutomationMarketMethodSnapshot;
}

function reader(snapshot = inventory(), productLabels = labels) {
  const registry = new CitationRegistry();
  const citations = { mark: (entry: Parameters<CitationRegistry['cite']>[0]) => renderCitationMarkOrMissing(registry.cite(entry)) };
  const section = marketInventorySection(snapshot, 'M08', citations, productLabels, true, context);
  const html = deliverMarketReader(`<div id="sections"><section class="sheet" id="M08"><span class="state">Có số liệu</span>${section}</section></div><footer></footer>` + renderCitationRegister(registry.entries(), { format: 'web' }));
  return { html, section, doc: new JSDOM(html).window.document };
}

test('prices use one latest capture per product, with labels and platform, valid ranges and cited missing states', () => {
  const snapshot = inventory(), before = canonicalJson(snapshot);
  const { doc, html, section } = reader(snapshot);
  const rows = [...doc.querySelectorAll('[data-market-prices] tbody tr')];
  assert.equal(rows.length, 8);
  const cells = rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent));
  assert.deepEqual(cells[0]!.slice(0, 4), ['TikTok Shop', 'Quạt <mẫu> & A', '391.777', '350.000 đến 450.000']);
  for (const i of [1, 2, 6, 7]) assert.deepEqual(cells[i]!.slice(2, 4), ['Chưa có giá đọc được', '—']);
  for (const i of [3, 4, 5]) assert.equal(cells[i]![3], '—', 'equal, outside and zero-ended ranges stay hidden');
  assert.equal(cells[4]![0], 'Shopee');
  assert.match(html, /Quạt &lt;mẫu&gt; &amp; A/u);
  assert.equal(doc.querySelector('mẫu'), null);
  assert.equal(doc.querySelectorAll('details').length, 0);
  assert.equal(doc.querySelector('#M08 .state')!.textContent, 'Có giá tham khảo, chưa xác minh');
  const visible = doc.querySelector('#M08')!.textContent!;
  assert.equal(visible.split(caveat).length - 1, 1);
  assert.doesNotMatch(visible, banned);
  assert.doesNotMatch(visible, /(?:^|\s)0(?:\s|$)|0 VND|#\d|374\.467|52\.000/u);
  assert.match(visible, /Giá bình quân \(doanh thu ÷ số đã bán, nguồn tính\)/u);
  const reading = doc.querySelector('.interp')!;
  assert.ok(reading.querySelector('sup.cite'), 'interpretation carries the price sources');
  assert.doesNotMatch(reading.textContent!, /mức thấp là 0\b/u);
  for (const row of rows) assert.ok(row.querySelector('sup.cite'), 'each row, including a missing price, resolves to its source');
  for (const mark of doc.querySelectorAll('sup.cite')) assert.ok(doc.getElementById(`cite-${mark.textContent!.slice(1, -1)}`));
  assert.match(section, /<details class="evidence-trace">/u);
  assert.match(section, /capture-30-unit-price<\/td><td>100000/u, 'the older source number remains in trace');
  assert.match(section, /capture-3-unit-price<\/td><td>0/u, 'source zero stays in trace');
  assert.equal(canonicalJson(snapshot), before);
});

test('unknown names use product ordinals, and latest missing prices never fall back to older prices', () => {
  const snapshot = inventory();
  for (const quote of snapshot.quotes.input.quotes) { quote.price.value = null; quote.price.range = null; }
  const { doc } = reader(snapshot, new Map());
  assert.equal(doc.querySelector('[data-market-prices] tbody tr td:nth-child(2)')!.textContent, 'Sản phẩm 1');
  assert.equal(doc.querySelector('#M08 .state')!.textContent, 'Chưa có giá đọc được');
  assert.equal(doc.querySelectorAll('[data-market-prices] tbody tr').length, 8);
  assert.equal(doc.querySelectorAll('.interp').length, 0);
  assert.doesNotMatch(doc.querySelector('#M08')!.textContent!, /#\d|0 VND/u);
});

test('price interpretation excludes source zero even if a price cell still carries it', () => {
  const table = '<table data-market-prices="reference"><thead><tr><th>Sàn</th><th>Sản phẩm</th><th>Giá bình quân</th></tr></thead><tbody><tr><td>TikTok Shop</td><td>Quạt A</td><td>0 VND</td></tr><tr><td>TikTok Shop</td><td>Quạt B</td><td>400 VND</td></tr></tbody></table>';
  assert.match(tableInterpretation(table), /ghi 400 \(Quạt B\)/u);
  assert.doesNotMatch(tableInterpretation(table), /ghi 0|thấp là 0/u);
});

test('detail figures show their actual query window and one note explaining the saved sample difference', () => {
  const snapshot = inventory(), before = canonicalJson(snapshot);
  const html = marketInventorySection(snapshot, 'M03', { mark: () => '[1]' }, labels, true, context);
  const doc = new JSDOM(html).window.document;
  for (const row of doc.querySelectorAll('tbody tr')) assert.equal(row.querySelectorAll('td')[1]!.textContent, '01/08/2026 đến 30/08/2026');
  assert.doesNotMatch(doc.body.textContent!, /12\/09\/2026|11\/10\/2026/u);
  assert.equal(doc.querySelectorAll('p.lim').length, 1);
  assert.match(doc.querySelector('p.lim')!.textContent!, /Chú thích: Số liệu mẫu lấy từ trang kết quả tìm kiếm đã lưu; doanh thu chi tiết lấy từ trang sản phẩm theo kỳ riêng/u);
  assert.match(doc.querySelector('p.lim')!.textContent!, /có thể khác nhau/u);
  assert.equal(canonicalJson(snapshot), before);
});

test('automated reader uses the price projection without changing retained inputs or hiding trace numbers', async () => {
  const input = await fullMarket14Input(), snapshot = inventory();
  const reportInput = { ...input, marketInventory: snapshot, marketPresentation: { ...input.marketPresentation!, unitPrices: [] },
    collection: { ...input.collection!, productCards: [...labels].map(([productId, title]) => ({ productId, title, provider: 'kalodata' })) } } as unknown as typeof input;
  const before = canonicalJson(reportInput);
  const report = buildResearchAutomationReport(reportInput, 'MARKET');
  const doc = new JSDOM(report.html.toString()).window.document;
  const section = doc.querySelector('#M08')!;
  assert.equal(section.querySelectorAll('tbody tr').length, 8);
  assert.equal(section.textContent!.split(caveat).length - 1, 1);
  assert.doesNotMatch(section.textContent!, banned);
  for (const mark of doc.querySelectorAll('#M08 sup.cite, #M03 sup.cite')) assert.ok(doc.getElementById(`cite-${mark.textContent!.slice(1, -1)}`));
  const trace = report.traceHtml!.toString();
  assert.match(trace, /capture-30-unit-price<\/td><td>100000/u);
  assert.match(trace, /374467 đến 374467/u);
  assert.equal(canonicalJson(reportInput), before);
  assert.deepEqual((report.semantic as { marketInventory: unknown }).marketInventory, snapshot);
});

test('reports without presentation keep their pinned reader and semantic bytes', async () => {
  const { marketPresentation: _presentation, ...input } = await fullMarket14Input();
  const report = buildResearchAutomationReport(input, 'MARKET');
  assert.equal(hash(report.html), 'bfdaca277bee00e28b823d042b11dd75846dba38381704d3b0042ca06f5cbab5');
  assert.equal(hash(canonicalJson(report.semantic)), '89b388819561c90b6082847afb079b85aa911457862ca7d542d5335860c3f8a5');
  assert.equal(report.traceHtml, undefined);
});

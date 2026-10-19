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
  assert.deepEqual(cells[1]!.slice(2, 4), ['Chưa có giá đọc được', '100.000 đến 200.000']);
  for (const i of [2, 6, 7]) assert.deepEqual(cells[i]!.slice(2, 4), ['Chưa có giá đọc được', '—']);
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
  assert.match(visible, /Giá bình quân \(doanh thu ÷ số đã bán, ước tính\)/u);
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
  assert.equal(tableInterpretation(table.replace('Quạt A', '2026 Quạt A').replace('400 VND', 'Chưa có giá đọc được')), '', 'a model number is not a price');
});

test('valid ranges survive unreadable unit quotes, and decimal comparisons use exact amounts', () => {
  for (const value of [null, '0', '0.0', '00', '1e3']) {
    const snapshot = inventory();
    snapshot.quotes.input.quotes = snapshot.quotes.input.quotes.filter(quote => quote.quoteId.startsWith('capture-3-'));
    snapshot.quotes.input.quotes[0]!.price.value = value;
    const { doc } = reader(snapshot);
    const cells = [...doc.querySelectorAll('[data-market-prices] tbody td')].map(cell => cell.textContent);
    assert.deepEqual(cells.slice(2, 4), ['Chưa có giá đọc được', '100.000 đến 200.000']);
    assert.equal(doc.querySelector('#M08 .state')!.textContent, 'Có giá tham khảo, chưa xác minh');
  }
  for (const [value, minimum, maximum, shown] of [
    ['100.50', '100.5', '101.5', '101 đến 102'],
    ['100.50', '100.5001', '101.5', '—'],
    ['101.5001', '100.5', '101.5', '—'],
    ['100.50', '101.5', '100.5', '—'],
    ['100.50', '100.5', '100.50', '—'],
    ['9007199254740992.5', '9007199254740992.51', '9007199254740994', '—'],
  ]) {
    const snapshot = inventory();
    snapshot.quotes.input.quotes = snapshot.quotes.input.quotes.filter(quote => quote.quoteId.startsWith('capture-3-'));
    snapshot.quotes.input.quotes[0]!.price.value = value!;
    snapshot.quotes.input.quotes[1]!.price.range = { minimum: minimum!, maximum: maximum! };
    assert.equal(reader(snapshot).doc.querySelector('[data-market-prices] tbody td:nth-child(4)')!.textContent, shown);
  }
});

test('capture ties choose the highest ordinal and unidentified captures remain separate', () => {
  const snapshot = inventory();
  snapshot.quotes.input.quotes = snapshot.quotes.input.quotes.filter(quote => /^capture-(?:8|9)-/u.test(quote.quoteId));
  for (const quote of snapshot.quotes.input.quotes) quote.acquiredAt = '2026-09-02T00:00:00Z';
  assert.equal(reader(snapshot).doc.querySelector('[data-market-prices] tbody td:nth-child(3)')!.textContent, 'Chưa có giá đọc được');
  for (const observation of snapshot.temporal.input.observations) observation.subjectMemberKeys = [];
  const { doc } = reader(snapshot);
  assert.equal(doc.querySelectorAll('[data-market-prices] tbody tr').length, 2);
  assert.deepEqual([...doc.querySelectorAll('[data-market-prices] tbody td:nth-child(2)')].map(cell => cell.textContent), ['Sản phẩm 1', 'Sản phẩm 2']);
});

test('member-key order does not duplicate products and quotes can resolve a run card without temporal members', () => {
  const snapshot = inventory();
  snapshot.quotes.input.quotes = snapshot.quotes.input.quotes.filter(quote => /^capture-(?:8|9)-/u.test(quote.quoteId));
  for (const observation of snapshot.temporal.input.observations) observation.subjectMemberKeys = observation.observationId.startsWith('capture-8-')
    ? ['detail:p7', 'detail:p8'] : ['detail:p8', 'detail:p7'];
  assert.equal(reader(snapshot).doc.querySelectorAll('[data-market-prices] tbody tr').length, 1);
  snapshot.temporal.input.frame.members = [];
  for (const observation of snapshot.temporal.input.observations) observation.subjectMemberKeys = [];
  for (const quote of snapshot.quotes.input.quotes) quote.offerText = '{"provider_product_id":"p7"}';
  const { doc } = reader(snapshot);
  assert.equal(doc.querySelectorAll('[data-market-prices] tbody tr').length, 1);
  assert.equal(doc.querySelector('[data-market-prices] tbody td:nth-child(2)')!.textContent, 'Quạt mẫu 7');
  assert.equal(doc.querySelector('[data-market-prices] tbody td:nth-child(3)')!.textContent, 'Chưa có giá đọc được');
});

test('provider names never become product names or platform labels in the price table', () => {
  const snapshot = inventory();
  snapshot.quotes.input.quotes = snapshot.quotes.input.quotes.filter(quote => quote.quoteId.startsWith('capture-3-'));
  for (const name of ['Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'SerpApi', 'PageIndex', 'Gemini', 'OpenCLI', 'zen-studio', 'Agent-Reach', 'Google']) {
    const { doc } = reader(snapshot, new Map([['detail:p2', `Quạt ${name}`]]));
    assert.equal(doc.querySelector('[data-market-prices] tbody td:nth-child(2)')!.textContent, 'Sản phẩm 2');
    assert.doesNotMatch(doc.querySelector('#M08')!.textContent!, new RegExp(name, 'iu'));
  }
  const html = marketInventorySection(snapshot, 'M08', { mark: () => '[1]' }, labels, true, { platforms: new Map([['detail:p2', 'Apify']]) });
  assert.equal(new JSDOM(html).window.document.querySelector('[data-market-prices] tbody td')!.textContent, 'Chưa rõ sàn');
  for (const id of ['detail:p2', 'p2', 'capture-3-unit-price']) {
    assert.equal(reader(snapshot, new Map([['detail:p2', id]])).doc.querySelector('[data-market-prices] tbody td:nth-child(2)')!.textContent, 'Sản phẩm 2');
  }
});

test('M08 badge reads positive price columns, never dates, quantities, names or citations', () => {
  const state = (table: string): string | null => new JSDOM(deliverMarketReader(`<div id="sections"><section class="sheet" id="M08"><span class="state">Có số liệu</span>${table}</section></div><footer></footer>`)).window.document.querySelector('.state')!.textContent;
  const table = (value: string): string => `<table><thead><tr><th>Sản phẩm</th><th>Giá (VND)</th><th>Số lượng</th><th>Kỳ giá</th><th>Nguồn</th></tr></thead><tbody><tr><td>2026 Quạt</td><td>${value}</td><td>5</td><td>12/09/2026</td><td><sup class="cite">[3]</sup></td></tr></tbody></table>`;
  for (const value of ['Chưa rõ', '0', '0 VND', '—']) assert.equal(state(table(value)), 'Chưa đủ dữ liệu');
  assert.equal(state(table('100.000')), 'Có giá tham khảo, chưa xác minh');
  assert.equal(state(table('Chưa rõ').replace('<th>Giá (VND)</th>', '<th>Ngày</th>').replace('<td>Chưa rõ</td>', '<td>12/09/2026</td>')), 'Chưa đủ dữ liệu');
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

test('the delivered appendix localizes each comparable window to dd/mm/yyyy', async () => {
  const input = await fullMarket14Input();
  const window = { startDate: '2026-09-12', endDate: '2026-10-11' };
  const report = buildResearchAutomationReport({ ...input,
    start: { ...input.start, requestedPeriod: { ...window, dayCount: 30 } },
    scope: { ...input.scope, selectedProductIds: ['detail:p1'] },
    captures: input.captures.map(capture => ({ ...capture, window })),
    collection: { ...input.collection!, comparables: [{ productId: 'detail:p1', provider: input.captures[0]!.provider,
      metric: 'GMV_VND', value: '123456', window, captureIndex: input.captures[0]!.ordinal }] },
  }, 'MARKET');
  const appendix = new JSDOM(report.html.toString()).window.document.querySelector('#M13')!;
  assert.equal(appendix.querySelector('table.observations tbody td:nth-child(4)')!.textContent, '12/09/2026 đến 11/10/2026');
  assert.doesNotMatch(appendix.textContent!, /2026-09-12|2026-10-11/u);
});

test('both re-pinned reader digests differ from the parent only in the M08 badge', async () => {
  const input = await fullMarket14Input();
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  for (const [reportInput, parent] of [
    [input, '8764da84f3381754eedfbf670ce6ff7fb445299112f07413195a90c80caf52ce'],
    [{ ...input, metricMethods }, '99e15f75c3f56be58b249d8bf9561ef1c1a751f148ee03064041cd463a39b393'],
  ] as const) {
    const html = buildResearchAutomationReport(reportInput, 'MARKET').html.toString();
    assert.equal(hash(html.replace('<span class="state">Có giá tham khảo, chưa xác minh</span>', '<span class="state">Có số liệu</span>')), parent);
  }
});

test('automated reader uses the price projection without changing retained inputs or hiding trace numbers', async () => {
  const input = await fullMarket14Input(), snapshot = inventory();
  const reportInput = { ...input, marketInventory: snapshot, marketPresentation: { ...input.marketPresentation!, unitPrices: [] },
    collection: { ...input.collection!, productCards: [...labels].map(([productId, title]) => ({ productId, title, provider: 'kalodata' })) } } as unknown as typeof input;
  const before = canonicalJson(reportInput);
  const report = buildResearchAutomationReport(reportInput, 'MARKET');
  // Latest-price review: preserve range-only evidence, explicit estimate wording, and corrected price-only readings.
  assert.equal(hash(report.html), 'bcf956388f8aeac6bd708f1af60055bac3c00b8cebbe13ca7372cb48368c25a8');
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

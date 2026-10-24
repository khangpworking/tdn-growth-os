import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { hasHiddenName } from '../../src/modules/analysis/report-language/index.js';
import { renderCitationMarkOrMissing, renderCitationRegister } from '../../src/modules/analysis/citation-register-html.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { marketInventorySection, type MarketInventoryReaderContext } from '../../src/modules/analysis/research-automation/market-inventory-report.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { deliverMarketReader, tableInterpretation } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { CaptureRecord } from '../../src/modules/analysis/research-automation/model.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { periodByteCases, periodCaptures, periodContext, periodDeliveryCases, periodInventory, periodLabels, periodProducts,
  withPeriodInventory, type PeriodCapture } from '../helpers/package-e-period-fixture.js';
import { SYNTHETIC_CARD_ID } from '../helpers/research-synthetic-sources.js';

// G: the current market14 HTML fixture pin included corrected evidence copy; E periods and legacy pins stay frozen.
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const amount = (value: string | number) => Number(value).toLocaleString('vi-VN');
const cells = (row: Element) => [...row.querySelectorAll('td')].map(cell => cell.textContent!);
const priceHeader = 'Giá bình quân do nguồn tính, ước tính (VND)';
const priceNote = 'Chú thích: Mỗi sản phẩm giữ lần thu sau cùng. Giá bình quân là số nguồn tính, chưa xác minh; chưa dùng để tính giá vốn hoặc lợi nhuận.';
const missingRangeNote = 'Dấu “—” cho biết chưa có khoảng giá nguồn dùng được.';

function view(t: TestContext, section: 'M03' | 'M08', snapshot = periodInventory(), context: MarketInventoryReaderContext = periodContext(), labels = periodLabels()) {
  const registry = new CitationRegistry();
  const block = marketInventorySection(snapshot, section, {
    mark: entry => renderCitationMarkOrMissing(registry.cite(entry)),
  }, labels, true, context);
  const html = deliverMarketReader(`<div id="sections"><section class="sheet" id="${section}"><span class="state">Có số liệu</span>${block}</section></div><footer></footer>` + renderCitationRegister(registry.entries(), { format: 'web' }));
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  const doc = dom.window.document, table = doc.querySelector('table')!;
  return { html, doc, table, rows: [...table.querySelectorAll('tbody tr')],
    note: table.closest('.table-wrap')!.nextElementSibling!, reading: doc.querySelector('.interp') };
}

for (const product of periodProducts) test(`inclusive windows: ${product.label}, full period and final ${product.days} days`, t => {
  const captures = periodCaptures().filter(capture => capture.key === product.key);
  const { rows } = view(t, 'M03', periodInventory(captures), { ...periodContext(), sampleWindow: null });
  assert.equal(rows.length, 2);
  assert.equal(cells(rows[0]!)[2], '01/09/2026 đến 30/09/2026');
  assert.equal(rows[0]!.hasAttribute('data-period-incomplete'), false);
  assert.equal(cells(rows[1]!)[2], `01/10/2026 đến ${product.end.slice(8)}/10/2026${product.days < 30 ? `; kỳ chưa đủ (${product.days} ngày)` : ''}`);
  assert.equal(rows[1]!.getAttribute('data-period-incomplete'), product.days < 30 ? 'true' : null);
  assert.equal(cells(rows[0]!)[3], amount(product.full));
  assert.equal(cells(rows[1]!)[3], amount(product.final));
});

for (const [platform, label] of [['shopee', 'Shopee'], ['tiktok', 'TikTok Shop']] as const) {
  test(`platform column: ${label} only in both inventory tables`, t => {
    const context = { ...periodContext(), platforms: new Map(periodProducts.map(product => [product.key, platform])) };
    for (const section of ['M03', 'M08'] as const) {
      const { table, rows } = view(t, section, periodInventory(), context);
      assert.equal(table.querySelector('th')!.textContent, 'Sàn');
      assert.ok(rows.length > 0);
      assert.deepEqual(rows.map(row => cells(row)[0]), rows.map(() => label));
    }
  });
}

test('mixed platforms resolve maps, explicit frame members and validated references identically for periods and prices', t => {
  const captures = periodCaptures().filter(capture => capture.ordinal % 2 === 1);
  captures[2]!.key = SYNTHETIC_CARD_ID;
  captures.push({ ...captures[0]!, ordinal: 7, key: `${SYNTHETIC_CARD_ID.split(':')[0]}:not-a-product`, revenue: '448451' });
  const snapshot = periodInventory(captures);
  snapshot.temporal.input.frame.members[0]!.platform = 'TIKTOK_SHOP';
  snapshot.temporal.input.frame.members[1]!.platform = 'TIKTOK_SHOP';
  const labels = new Map(captures.map((capture, index) => [capture.key, `Đồ thử nghiệm ${index + 1}`]));
  const context = { ...periodContext(), platforms: new Map([[captures[0]!.key, 'shopee']]) };
  for (const section of ['M03', 'M08'] as const) {
    const { rows, table } = view(t, section, snapshot, context, labels);
    assert.deepEqual(rows.map(row => cells(row)[0]), ['Shopee', 'TikTok Shop', 'TikTok Shop', 'Chưa rõ sàn']);
    assert.equal(table.querySelectorAll('tfoot').length, 0);
  }
});

test('all unknown references omit the platform column in both inventory tables', t => {
  const captures = periodCaptures().map(capture => ({ ...capture, key: `unresolved:${capture.ordinal}` }));
  const snapshot = periodInventory(captures), context = { platforms: new Map<string, string>() };
  const period = view(t, 'M03', snapshot, context, new Map());
  assert.deepEqual([...period.table.querySelectorAll('th')].map(cell => cell.textContent), ['Sản phẩm', 'Kỳ đo', 'Doanh thu (VND)', 'Sản lượng bán (đơn vị bán)', 'Nguồn']);
  assert.equal(period.table.querySelectorAll('th').length, 5);
  assert.ok(period.rows.every(row => cells(row)[1]!.startsWith('01/')));
  const price = view(t, 'M08', snapshot, context, new Map());
  assert.deepEqual([...price.table.querySelectorAll('th')].map(cell => cell.textContent), ['Sản phẩm', priceHeader, 'Khoảng giá nguồn (VND)', 'Nguồn']);
  assert.ok(price.rows.length > 0);
  assert.ok(price.rows.every(row => cells(row)[0]!.startsWith('Sản phẩm ') && cells(row).length === 4));
  for (const result of [period, price]) assert.doesNotMatch(result.doc.body.textContent!, /Shopee|TikTok Shop/u);
});

for (const shape of ['known', 'mixed', 'unknown', 'empty'] as const) {
  test(`full market14 inventory platform columns pass rule 12: ${shape}`, async t => {
    const base = await fullMarket14Input();
    const captures = shape === 'empty' ? [] : periodCaptures();
    const snapshot = periodInventory(captures);
    snapshot.temporal.input.frame.members.forEach((member, index) => {
      if (shape === 'known' || (shape === 'mixed' && index < 2)) member.platform = index === 0 ? 'SHOPEE' : 'TIKTOK_SHOP';
    });
    const report = buildResearchAutomationReport({ ...base, marketInventory: snapshot }, 'MARKET');
    const html = report.html.toString();
    assert.equal(auditMarket14(html).find(rule => rule.rule === '12')!.ok, true);
    assertMarket14MachineRules(html);
    const dom = new JSDOM(html);
    t.after(() => dom.window.close());
    for (const selector of ['[data-market-periods]', '[data-market-prices]']) {
      const table = dom.window.document.querySelector(selector)!;
      assert.ok(table);
      assert.equal([...table.querySelectorAll('th')].some(cell => cell.textContent === 'Sàn'), shape === 'known' || shape === 'mixed');
      if (shape === 'mixed') {
        const labels = [...table.querySelectorAll('tbody tr')].map(row => cells(row)[0]);
        for (const label of ['Shopee', 'TikTok Shop', 'Chưa rõ sàn']) assert.ok(labels.includes(label));
      }
      if (shape === 'empty') assert.equal(table.querySelector('tbody td')!.getAttribute('colspan'), String(table.querySelectorAll('th').length));
    }
  });
}

test('one Shopee row and one unknown row retain platform columns and pass rule 12', async t => {
  const base = await fullMarket14Input();
  const snapshot = periodInventory(periodCaptures().filter(capture => capture.ordinal === 1 || capture.ordinal === 3));
  snapshot.temporal.input.frame.members[0]!.platform = 'SHOPEE';
  const report = buildResearchAutomationReport({ ...base, marketInventory: snapshot }, 'MARKET');
  const html = report.html.toString();
  assertMarket14MachineRules(html);
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  for (const selector of ['[data-market-periods]', '[data-market-prices]']) {
    const table = dom.window.document.querySelector(selector)!;
    assert.ok(table);
    assert.equal(table.querySelector('th')!.textContent, 'Sàn');
    assert.deepEqual([...table.querySelectorAll('tbody tr')].map(row => cells(row)[0]), ['Shopee', 'Chưa rõ sàn']);
    const isolated = `<div data-market-platforms="shopee">${table.outerHTML}</div>`;
    assert.equal(auditMarket14(isolated).find(rule => rule.rule === '12')!.ok, true);
  }
});

test('mixed inventory never displays a cross-platform sum, including interpretations and notes', t => {
  const captures = periodCaptures(), totals = new Set<number>();
  // Every subset containing the first platform and at least one other platform.
  for (let mask = 1; mask < 1 << captures.length; mask++) {
    const selected = captures.filter((_capture, index) => mask & 1 << index);
    if (selected.some(capture => capture.key === periodProducts[0].key) && selected.some(capture => capture.key !== periodProducts[0].key)) {
      totals.add(selected.reduce((total, capture) => total + Number(capture.revenue), 0));
    }
  }
  totals.add(510051 + 610061);
  totals.add(510051 + 710071);
  totals.add(510051 + 610061 + 710071);
  for (const section of ['M03', 'M08'] as const) {
    const result = view(t, section);
    assert.equal(result.table.querySelector('tfoot'), null);
    const visible = result.doc.body.textContent!;
    for (const total of totals) for (const representation of [String(total), amount(total)]) {
      assert.ok(!visible.includes(representation), `unexpected cross-platform sum ${representation}`);
    }
    assert.doesNotMatch(visible, /tổng (?:hai|các|mọi|cả hai) sàn|cộng (?:hai|các) sàn/iu);
  }
});

test('selection wording counts confirmed represented selected products only', t => {
  const context = { ...periodContext(), scope: { selectedProductIds: [...periodProducts.map(product => product.key), periodProducts[0].key, 'absent:1'], peerProductIds: [] } };
  const { doc } = view(t, 'M03', periodInventory(), context);
  const line = [...doc.querySelectorAll('p')].find(node => node.textContent!.startsWith('Gồm '))!;
  assert.equal(line.textContent, 'Gồm 3 sản phẩm chính được chọn trong phạm vi đã xác nhận.');
  assert.doesNotMatch(line.textContent!, /doanh thu|cao nhất|hàng đầu|tự động|đại diện|chủ (?:chọn|duyệt)|vì|do được|ưu tiên/iu);
});

test('selection wording counts confirmed selected and peer membership without a selection rationale', t => {
  const { doc } = view(t, 'M03');
  const lines = [...doc.querySelectorAll('p')].filter(node => node.textContent!.startsWith('Gồm '));
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.textContent, 'Gồm 2 sản phẩm chính và 1 sản phẩm đối chiếu được chọn trong phạm vi đã xác nhận.');
  assert.doesNotMatch(lines[0]!.textContent!, /doanh thu|cao nhất|hàng đầu|tự động|đại diện|chủ (?:chọn|duyệt)|vì|do được|ưu tiên/iu);
  const unknown = view(t, 'M03', periodInventory(), { platforms: periodContext().platforms });
  assert.ok(unknown.doc.body.textContent!.includes('Chưa có thông tin xác nhận vai trò sản phẩm chính và sản phẩm đối chiếu.'));
  assert.doesNotMatch(unknown.doc.body.textContent!, /Gồm 0|\b0 sản phẩm/u);
});

test('short period rows stay out of interpretations and the mixed count includes exactly four full rows', t => {
  const { rows, reading, table } = view(t, 'M03');
  assert.equal(rows.length, 6);
  assert.equal(table.querySelectorAll('[data-period-incomplete="true"]').length, 2);
  assert.equal(reading!.textContent, 'Diễn giải: Diễn giải dùng 4 dòng đủ kỳ. Các dòng có thước đo, đơn vị hoặc kỳ khác nhau; đọc riêng từng dòng.');
  assert.doesNotMatch(reading!.textContent!, /910\.019|820\.028|5 ngày|29 ngày/u);
  const fullOnly = table.cloneNode(true) as Element;
  fullOnly.querySelectorAll('[data-period-incomplete]').forEach(row => row.remove());
  assert.equal(tableInterpretation(table.outerHTML).replace('Diễn giải dùng 4 dòng đủ kỳ.', ''),
    tableInterpretation(fullOnly.outerHTML).replace('Bảng có 4 dòng.', ''));
});

test('short latest prices stay out of numeric readings, while a 30-day latest capture is interpreted', t => {
  const { rows, table, reading } = view(t, 'M08');
  assert.equal(rows.length, 3);
  assert.equal(table.querySelectorAll('[data-period-incomplete="true"]').length, 2);
  assert.ok(reading!.textContent!.includes('Diễn giải dùng 1 dòng đủ kỳ.'));
  assert.ok(reading!.textContent!.includes('710.071'));
  assert.ok(reading!.textContent!.includes(periodProducts[2].label));
  assert.doesNotMatch(reading!.textContent!, /510\.051|610\.061/u);
});

test('all-short inventory generates no period or price interpretation', t => {
  const captures = periodCaptures().filter(capture => capture.ordinal === 2 || capture.ordinal === 4);
  for (const section of ['M03', 'M08'] as const) {
    const { doc, table, rows } = view(t, section, periodInventory(captures));
    assert.equal(rows.length, 2);
    assert.equal(tableInterpretation(table.outerHTML), '');
    assert.equal(doc.querySelector('.interp'), null);
    assert.equal(table.querySelectorAll('[data-period-incomplete="true"]').length, 2);
  }
});

test('short no-sales rows remain separate from adjacent full and short no-sales rows', t => {
  const template = periodCaptures()[0]!;
  const captures = [
    { ...template, revenue: '0' },
    { ...template, ordinal: 2, start: '2026-10-01', end: '2026-10-05', revenue: '0' },
    { ...template, ordinal: 3, start: '2026-10-06', end: '2026-11-03', revenue: '0' },
  ];
  const { rows, reading } = view(t, 'M03', periodInventory(captures), { ...periodContext(), sampleWindow: null });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => cells(row)[2]), ['01/09/2026 đến 30/09/2026',
    '01/10/2026 đến 05/10/2026; kỳ chưa đủ (5 ngày)', '06/10/2026 đến 03/11/2026; kỳ chưa đủ (29 ngày)']);
  assert.ok(rows.every(row => cells(row)[3] === 'Không ghi nhận bán trong kỳ'));
  assert.equal(reading, null);
});

test('sample overruns retain their complete windows and amounts, with one explanatory note', t => {
  const snapshot = periodInventory(), before = canonicalJson(snapshot);
  const { rows, doc, note } = view(t, 'M03', snapshot);
  for (const product of periodProducts) {
    const row = rows.find(row => cells(row)[1] === product.label && cells(row)[2]!.startsWith('01/10/2026'))!;
    assert.equal(cells(row)[2], `01/10/2026 đến ${product.end.slice(8)}/10/2026${product.days < 30 ? `; kỳ chưa đủ (${product.days} ngày)` : ''}; vượt ngày cuối mẫu 03/10/2026`);
    assert.equal(cells(row)[3], amount(product.final));
  }
  assert.equal(doc.querySelectorAll('p.lim').length, 1);
  assert.equal(doc.body.textContent!.split('Số liệu mẫu lấy từ trang kết quả tìm kiếm đã lưu').length - 1, 1);
  assert.ok(note.textContent!.includes('ngày vượt cuối mẫu được giữ đúng bản thu, không cắt hay chia tỷ lệ số liệu.'));
  assert.ok(note.textContent!.includes('Các tháng cao điểm lấy từ trang sản phẩm, không so sánh với mẫu tìm kiếm 30 ngày.'));
  assert.equal(canonicalJson(snapshot), before);
  const boundary = view(t, 'M03', periodInventory([periodCaptures()[0]!]), { ...periodContext(), sampleWindow: { start: '2026-09-01', end: '2026-09-30' } });
  assert.doesNotMatch(boundary.rows[0]!.textContent!, /vượt ngày cuối mẫu/u);
});

test('price header attributes the estimate to the source and matching UTC dates/windows share one basis', t => {
  const captures = periodCaptures().filter(capture => capture.ordinal % 2 === 1).map((capture, index) => ({ ...capture,
    range: ['400000', '500000'] as const,
    retrievedAt: ['2026-11-01T23:30:00-02:00', '2026-11-02T01:30:00Z', '2026-11-02T08:30:00+07:00'][index]!,
  }));
  const { table, note, doc } = view(t, 'M08', periodInventory(captures));
  assert.equal(table.querySelectorAll('th')[2]!.textContent, priceHeader);
  assert.equal(note.textContent, `${priceNote} Tất cả sản phẩm: thu ngày 02/11/2026 (UTC); kỳ 01/09/2026 đến 30/09/2026.`);
  assert.equal(doc.body.textContent!.split('Tất cả sản phẩm:').length - 1, 1);
  assert.doesNotMatch(note.textContent!, /Bản thu giữ lại|Dấu “—”|doanh thu ÷/u);
});

for (const mismatch of ['date', 'window'] as const) test(`price bases are labelled per product when the ${mismatch} differs`, t => {
  const captures = periodCaptures().filter(capture => capture.ordinal % 2 === 1);
  if (mismatch === 'date') captures[1]!.retrievedAt = '2026-11-02T01:00:00Z';
  else { captures[1]!.start = '2026-08-01'; captures[1]!.end = '2026-08-30'; }
  const { note } = view(t, 'M08', periodInventory(captures));
  assert.doesNotMatch(note.textContent!, /Tất cả sản phẩm:/u);
  assert.equal(note.textContent!.split('Bản thu giữ lại của từng sản phẩm:').length - 1, 1);
  captures.forEach((capture, index) => {
    const date = mismatch === 'date' && index === 1 ? '02/11/2026' : '01/11/2026';
    const window = mismatch === 'window' && index === 1 ? '01/08/2026 đến 30/08/2026' : '01/09/2026 đến 30/09/2026';
    assert.ok(note.textContent!.includes(`${index === 0 ? 'Shopee' : 'TikTok Shop'} · ${periodProducts[index]!.label}: thu ngày ${date} (UTC); kỳ ${window}`));
  });
});

test('latest price follows retrievedAt even when quote dates, ordinals and input order disagree', t => {
  const template = periodCaptures()[0]!;
  const captures = [
    { ...template, ordinal: 90, price: '111113', retrievedAt: '2026-11-01T00:00:00Z', acquiredAt: '2026-12-01T00:00:00Z' },
    { ...template, ordinal: 2, price: '222227', retrievedAt: '2026-11-02T23:30:00-02:00', acquiredAt: '2026-01-01T00:00:00Z', start: '2026-08-01', end: '2026-08-30' },
  ];
  for (const ordered of [captures, [...captures].reverse()]) {
    const { rows, note } = view(t, 'M08', periodInventory(ordered));
    assert.equal(rows.length, 1);
    assert.equal(cells(rows[0]!)[2], '222.227');
    assert.ok(note.textContent!.includes('thu ngày 03/11/2026 (UTC); kỳ 01/08/2026 đến 30/08/2026.'));
  }
});

test('equal retrievedAt instants use the highest capture ordinal regardless of input order or quote date', t => {
  const template = periodCaptures()[0]!;
  const captures = [
    { ...template, ordinal: 10, price: '111113', retrievedAt: '2026-11-02T01:00:00Z', acquiredAt: '2026-01-01T00:00:00Z' },
    { ...template, ordinal: 2, price: '222227', retrievedAt: '2026-11-02T08:00:00+07:00', acquiredAt: '2026-12-01T00:00:00Z' },
  ];
  for (const ordered of [captures, [...captures].reverse()]) {
    const { rows, note } = view(t, 'M08', periodInventory(ordered));
    assert.equal(cells(rows[0]!)[2], '111.113');
    assert.ok(note.textContent!.includes('thu ngày 02/11/2026 (UTC)'));
  }
});

test('retained collection metadata supplies latest price date/window without scalar observations', t => {
  const template = periodCaptures()[0]!;
  const captures = [{ ...template, ordinal: 90, price: '111113' }, { ...template, ordinal: 2, price: '222227' }];
  const snapshot = periodInventory(captures);
  snapshot.temporal.input.observations = [];
  const retained = [
    { stepId: 'QUICK_SEARCH', ordinal: 90, retrievedAt: '2099-01-01T00:00:00Z', window: null },
    { stepId: 'COLLECTION', ordinal: 90, retrievedAt: '2026-11-01T00:00:00Z', window: { startDate: '2026-09-01', endDate: '2026-09-30' } },
    { stepId: 'COLLECTION', ordinal: 2, retrievedAt: '2026-11-04T00:00:00Z', window: { startDate: '2026-08-01', endDate: '2026-08-30' } },
  ] as unknown as CaptureRecord[];
  const { rows, note } = view(t, 'M08', snapshot, { ...periodContext(), captures: retained });
  assert.equal(rows.length, 1);
  assert.equal(cells(rows[0]!)[2], '222.227');
  assert.equal(note.textContent, `${priceNote} Tất cả sản phẩm: thu ngày 04/11/2026 (UTC); kỳ 01/08/2026 đến 30/08/2026. ${missingRangeNote}`);
});

test('missing price basis metadata stays explicitly unknown, including partial metadata', t => {
  const snapshot = periodInventory([periodCaptures()[0]!]);
  snapshot.temporal.input.observations = [];
  snapshot.quotes.input.quotes[0]!.acquiredAt = '';
  const missing = view(t, 'M08', snapshot);
  assert.equal(missing.note.textContent, `${priceNote} Tất cả sản phẩm: chưa rõ ngày thu; chưa rõ kỳ đo. ${missingRangeNote}`);
  snapshot.quotes.input.quotes[0]!.acquiredAt = '2026-11-03T23:30:00-02:00';
  const dateOnly = view(t, 'M08', snapshot);
  assert.ok(dateOnly.note.textContent!.includes('thu ngày 04/11/2026 (UTC); chưa rõ kỳ đo.'));
  const windowOnly = periodInventory([{ ...periodCaptures()[0]!, retrievedAt: '', acquiredAt: '' }]);
  assert.ok(view(t, 'M08', windowOnly).note.textContent!.includes('chưa rõ ngày thu; kỳ 01/09/2026 đến 30/09/2026.'));
});

test('missing and unusable ranges display a dash and explain it exactly once', t => {
  const ranges = [null, ['400000', '400000'], ['500000', '400000'], ['0', '500000'], ['100000', '200000']] as const;
  const captures: PeriodCapture[] = ranges.map((range, index) => ({ ...periodCaptures()[0]!, key: `sample:${94000 + index}`, ordinal: index + 1, range }));
  const { rows, note, doc } = view(t, 'M08', periodInventory(captures));
  assert.equal(rows.length, ranges.length);
  assert.deepEqual(rows.map(row => cells(row)[2]), ranges.map(() => '—'));
  assert.equal(note.textContent!.split(missingRangeNote).length - 1, 1);
  assert.equal(doc.body.textContent!.split(missingRangeNote).length - 1, 1);
  assert.doesNotMatch(doc.body.textContent!, /(?:^|\s)0(?:\s|$)/u);
});

test('new reader prose and empty states use plain Vietnamese without percentages, technical names or bare zero', t => {
  const scenarios = [periodInventory(), periodInventory([]),
    periodInventory([{ ...periodCaptures()[0]!, revenue: '0', price: null }])];
  for (const snapshot of scenarios) for (const section of ['M03', 'M08'] as const) {
    const { html, doc } = view(t, section, snapshot);
    const walker = doc.createTreeWalker(doc.querySelector('section')!, 4), text: string[] = [];
    while (walker.nextNode()) text.push(walker.currentNode.textContent ?? '');
    const visible = text.join(' ').replace(/\s+/gu, ' ').trim();
    assert.doesNotMatch(visible, /%|(?:^|\s)0(?:\s|$)|\breview\b|\bexport\b|peer set|listing|variant|pack_size|\d{4}-\d{2}-\d{2}/iu);
    assert.equal(hasHiddenName(visible, 'CITATION'), false, 'technical name in reader text');
    assert.ok(auditMarketReportHtml(html).find(result => result.rule === 'G08_PROVIDER_NAME')!.ok);
    // A complete ASCII word must be an approved Vietnamese word, unit or platform.
    // This also excludes vendor/model names beyond the shared provider denylist.
    const approved = new Set('a b c khay do hay combo ghi ra thu cho chia quy trong theo doanh hai nhau cao so sau tham vi chi minh tin trang vai vnd utc shopee tiktok shop'.split(' '));
    for (const word of visible.match(/(?<![\p{L}\p{N}])[A-Za-z][A-Za-z0-9_-]*(?![\p{L}\p{N}])/gu) ?? []) {
      assert.ok(approved.has(word.toLowerCase()), `unexpected non-Vietnamese word: ${word}`);
    }
    if (!snapshot.temporal.input.observations.length) {
      assert.ok(visible.includes(section === 'M03' ? 'Chưa có số liệu theo kỳ dùng được.' : 'Chưa có giá đọc được'));
    }
  }
});

let fullFixture: ReturnType<typeof fullMarket14Input> | undefined;
const full = () => fullFixture ??= fullMarket14Input();

test('real report builder passes confirmed scope and actual sales-sample end into the market14 inventory', async t => {
  const input = withPeriodInventory(await full());
  const before = canonicalJson(input), report = buildResearchAutomationReport(input, 'MARKET');
  const dom = new JSDOM(report.html.toString());
  t.after(() => dom.window.close());
  const doc = dom.window.document, table = doc.querySelector('[data-market-periods]')!;
  assert.equal(table.querySelector('th')!.textContent, 'Sàn');
  assert.ok(doc.querySelector('#M03')!.textContent!.includes('Gồm 2 sản phẩm chính và 1 sản phẩm đối chiếu được chọn trong phạm vi đã xác nhận.'));
  const sampleEnd = input.marketPresentation!.input.metric!.input.scope.end;
  const displayEnd = sampleEnd.split('-').reverse().join('/');
  for (const row of table.querySelectorAll('tbody tr')) assert.ok(cells(row)[2]!.endsWith(`; vượt ngày cuối mẫu ${displayEnd}`));
  assert.ok(doc.querySelector('#M08')!.textContent!.includes(priceHeader));
  assert.ok(doc.querySelector('#M08')!.textContent!.includes('thu ngày 03/11/2026 (UTC); kỳ 01/10/2026 đến 30/10/2026'));
  assert.equal(canonicalJson(input), before);
  assert.deepEqual((report.semantic as { marketInventory: unknown }).marketInventory, input.marketInventory);
});

test('real report builder forwards retained collection metadata when scalar observations are absent', async t => {
  const base = withPeriodInventory(await full());
  const snapshot = periodInventory([periodCaptures()[0]!]);
  snapshot.temporal.input.observations = [];
  const input = { ...base, marketInventory: snapshot,
    captures: [{ ...base.captures[0]!, stepId: 'COLLECTION', ordinal: 1,
      retrievedAt: '2026-11-05T23:30:00-02:00', window: { startDate: '2026-08-01', endDate: '2026-08-30' } }],
  } as const;
  const before = canonicalJson(input), report = buildResearchAutomationReport(input, 'MARKET');
  const dom = new JSDOM(report.html.toString());
  t.after(() => dom.window.close());
  const table = dom.window.document.querySelector('[data-market-prices]')!;
  assert.equal(table.querySelectorAll('tbody tr').length, 1);
  assert.ok(dom.window.document.querySelector('#M08')!.textContent!.includes('Tất cả sản phẩm: thu ngày 06/11/2026 (UTC); kỳ 01/08/2026 đến 30/08/2026.'));
  assert.equal(canonicalJson(input), before);
});

test('inventory rendering leaves nested inputs, labels and context unchanged and is deterministic', t => {
  const snapshot = periodInventory(), context = periodContext(), labels = periodLabels();
  const before = structuredClone({ snapshot, context, labels });
  for (const section of ['M03', 'M08'] as const) {
    const first = view(t, section, snapshot, context, labels);
    const second = view(t, section, snapshot, context, labels);
    assert.equal(first.html, second.html);
  }
  assert.deepEqual({ snapshot, context, labels }, before);
});

// Generated with main 3f3295dc's own builders and canonical serializer, not copied from head.
const baseline = JSON.parse(readFileSync(new URL('../fixtures/package-e-main-hashes.json', import.meta.url), 'utf8')) as
  Record<string, { html: string; semantic: string; trace: string | null; deliveryIdempotent: boolean }>;

test('empty and no-sales delivery stays idempotent where main was idempotent', t => {
  for (const control of periodDeliveryCases()) for (const section of ['M03', 'M08'] as const) {
    assert.equal(baseline[`${control.name}-${section}`]!.deliveryIdempotent, true, 'main-derived eligibility');
    const { html } = view(t, section, control.snapshot);
    assert.equal(deliverMarketReader(html), html);
  }
});

for (const name of ['insight-with-inventory', 'legacy-market-with-inventory', 'market14-without-inventory', 'market14-with-inventory']) {
  test(`main byte control: ${name}${name === 'market14-with-inventory' ? ' semantic' : ' html, trace and semantic'}`, async () => {
    const control = periodByteCases(await full()).find(control => control.name === name)!;
    const before = canonicalJson(control.input), report = buildResearchAutomationReport(control.input, control.kind), expected = baseline[name]!;
    assert.equal(hash(canonicalJson(report.semantic)), expected.semantic);
    if (name !== 'market14-with-inventory') {
      assert.equal(hash(report.html), expected.html);
      assert.equal(report.traceHtml ? hash(report.traceHtml) : null, expected.trace);
    }
    assert.equal(canonicalJson(control.input), before);
    assert.deepEqual(buildResearchAutomationReport(control.input, control.kind), report);
  });
}

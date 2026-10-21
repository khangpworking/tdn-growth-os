// === R-BUSINESS PHASE-2 BINDING SECTION ===
// Bound to the source handoff string table; expectations originate in contract rows.
// Public builder selects current-reader context. No new imports or options are needed.
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
const renderCurrent = (input: AutomationReportInput) => buildResearchAutomationReport(input, 'MARKET');
const COPY = {
  priceTitle: 'Giá và quy cách sản phẩm',
  separateMeasures: 'Mỗi dòng là một thước đo riêng, đọc theo đơn vị của chính nó.',
  bandHeaders: ['Sàn', 'Khoảng giá (đồng/sản phẩm)', 'Số dòng trong khoảng giá', 'Số sản phẩm quy đổi được', 'Số dòng được giữ'],
  optionTitles: ['A. Kiểm tra mức giá dự kiến trong khoảng giá của mẫu', 'B. Kiểm tra quy cách chào bán trong khoảng giá của mẫu', 'C. Kiểm tra điều kiện bán trong khoảng giá của mẫu'],
  firstSteps: ['Đối chiếu mức giá dự kiến với khoảng giá cùng sàn; trình chủ duyệt trước khi thay đổi giá', 'Đối chiếu quy cách đã xác minh của tối đa năm sản phẩm cùng sàn và khoảng giá; trình chủ duyệt quy cách cần xem xét', 'Đối chiếu điều kiện giao hàng và đổi trả đã lưu của tối đa năm sản phẩm cùng sàn và khoảng giá; trình chủ duyệt điều kiện cần xem xét'],
  quickTasks: ['Kiểm tra mức giá dự kiến cho một quy cách đã xác minh', 'Kiểm tra một điều kiện giao hàng hoặc đổi trả dự kiến'],
  quickOutputs: ['Một mức giá để chủ xem xét; chưa áp dụng thay đổi', 'Một điều kiện bán để chủ xem xét; chưa áp dụng thay đổi'],
  globalFound: 'số dòng tìm thấy theo từng sàn chưa có trong nguồn, không chia số chung cho các sàn.',
  retainedSeries: 'Chưa dự báo: mẫu đã lưu mô tả các sản phẩm trong kỳ báo cáo. Báo cáo cũng giữ riêng số liệu theo từng kỳ của các sản phẩm được chọn. Các chuỗi này chưa xác minh đủ tính tương thích về phép đo, biên kỳ và độ phủ; chưa có bộ đầu vào cùng khoảng thời gian riêng để kiểm tra dự báo.',
  reviewIntro: 'Đây là mẫu nhỏ, tối đa 20 đánh giá mỗi sản phẩm, được hệ thống thu để đọc trong báo cáo. Mẫu này không đại diện cho toàn bộ đánh giá.',
};
// === END PHASE-2 BINDING SECTION ===

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { BUSINESS_CAPTURE_DAY, BUSINESS_EXPECTED, BUSINESS_SHAPES, businessInput, businessReviewEvidence,
  type BusinessShape } from '../helpers/package-r-business-fixture.js';
import { businessByteInput } from '../helpers/package-r-business-byte-input.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { periodCaptures, periodInventory, periodProducts } from '../helpers/package-e-period-fixture.js';
import { syntheticSearchInterest } from '../helpers/search-interest-synthetic.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { headlineInput, headlineRows, type HeadlineRow } from '../helpers/market-headline-fixture.js';
import { chooseUnitProfile } from '../../src/modules/analysis/reader-report/market-title-quantity.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';

const text = (node: Node | null | undefined) => node?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
const amount = (n: number) => n.toLocaleString('vi-VN');
// Existing main text, not proposed replacement strings.
const OLD_REVIEW_CAVEAT = /Kỳ chọn (?:listing|sản phẩm) không giới hạn ngày đăng (?:review|đánh giá)\. Ngày (?:review|đánh giá) phải kiểm tra riêng trong bằng chứng gốc\./u;
const SELF_CHECK = /Mọi dòng đều đã gán sàn|Không có dòng không gán được sàn/u;
const OLD_SINGLE_PERIOD = /chỉ có mẫu đã lưu trong kỳ báo cáo/u;
const REVIEW_WORD = /review|đánh giá|bình luận|nhận xét/iu;
const RUN_WORD = /(?<![\p{L}\p{N}])(?:run|trial|operator|autorun)(?![\p{L}\p{N}])|lượt chạy|chạy thử/iu;
const COMPARISON = /mức thấp|mức cao|lớn hơn|nhỏ hơn|cao hơn|thấp hơn/iu;
const inputs: Partial<Record<BusinessShape, Promise<AutomationReportInput>>> = {};
const inputFor = async (shape: BusinessShape) => structuredClone(await (inputs[shape] ??= businessInput(shape)));

async function documentFor(t: TestContext, shape: BusinessShape, change?: (input: AutomationReportInput) => AutomationReportInput | Promise<AutomationReportInput>) {
  const input = await inputFor(shape), value = change ? await change(input) : input;
  const report = renderCurrent(value), dom = new JSDOM(report.html.toString());
  t.after(() => dom.window.close());
  return { input: value, report, doc: dom.window.document };
}
function section(doc: Document, id: string) {
  const found = doc.getElementById(id);
  assert.ok(found, `public report must contain #${id}`);
  return found;
}
function readingFor(exhibit: Element): string {
  let node: Element | null = exhibit.closest('.table-wrap') ?? exhibit;
  while (node && !node.classList.contains('interp')) node = node.nextElementSibling;
  return node ? text(node) : '';
}
const optionRows = (doc: Document) => [...section(doc, 'M12').querySelectorAll('table')][0]!.querySelectorAll<HTMLTableRowElement>('tbody tr');
const quickRows = (doc: Document) => [...section(doc, 'M12').querySelectorAll('table')][1]!.querySelectorAll<HTMLTableRowElement>('tbody tr');

test('machine rules: all three full contract reports retain every machine PASS', async t => {
  for (const shape of BUSINESS_SHAPES) {
    const { report } = await documentFor(t, shape);
    const html = report.html.toString(), audited = auditMarket14(html);
    assert.equal(audited.length, 14, shape);
    assert.deepEqual(audited.filter(row => row.kind === 'machine' && !row.ok), [], shape);
    assert.doesNotThrow(() => assertMarket14MachineRules(html));
  }
});

for (const shape of BUSINESS_SHAPES) {
  test(`M6 same-unit distinct measures: ${shape} row-label and official-statistics headers`, async t => {
    const { doc } = await documentFor(t, shape);
    for (const header of ['Chỉ số', 'Dòng']) {
      const table = [...section(doc, 'M05').querySelectorAll('table')].find(table =>
        [...table.querySelectorAll('thead th')].some(th => text(th) === header));
      assert.ok(table, `${header} must exercise a real rendered exhibit`);
      const reading = readingFor(table);
      assert.doesNotMatch(reading, COMPARISON, `${header}: different measures cannot be ranked`);
      assert.ok(reading.includes(COPY.separateMeasures));
    }
  });

  test(`M10 band breakdown: ${shape} priced denominator and retained coverage`, async t => {
    const { doc } = await documentFor(t, shape), m04 = section(doc, 'M04');
    for (const [platform, expected] of Object.entries(BUSINESS_EXPECTED[shape])) {
      const name = platform === 'shopee' ? 'Shopee' : 'TikTok Shop';
      if (expected.eligible < 6) {
        assert.ok(text(m04).includes(`${name}: chưa đủ dữ liệu giá để chia khoảng giá trong mẫu.`));
        assert.equal(m04.querySelector(`table[data-platform="${platform}"], tbody[data-platform="${platform}"]`), null);
        continue;
      }
      const marker = m04.querySelector('[data-market-price-bands]');
      assert.ok(marker, 'M04 must expose the contract marker');
      const group = m04.querySelector(`table[data-platform="${platform}"], tbody[data-platform="${platform}"]`);
      assert.ok(group, `${name} gets its own table/body`);
      assert.equal(group.getAttribute('data-market-price-bands'), 'true');
      assert.deepEqual([...group.querySelectorAll('thead th')].map(text), COPY.bandHeaders);
      assert.ok(text(group.querySelector('caption') ?? doc.getElementById(group.getAttribute('aria-labelledby') ?? '')?.querySelector('.ext')).includes(`Cơ cấu khoảng giá trong mẫu · ${name}`));
      assert.ok(group.hasAttribute('data-market-price-bands') || group.closest('[data-market-price-bands]')
        || group.querySelector('[data-market-price-bands]'), 'platform group belongs to the marked exhibit');
      const rows = [...group.querySelectorAll('tr')].filter(row => row.querySelector('td'));
      for (const [low, high, count] of expected.bands) {
        const matching = rows.filter(row => text(row).includes(amount(low)) && text(row).includes(amount(high)));
        assert.equal(matching.length, 1, `${name}: exactly one ${low}–${high} band`);
        assert.deepEqual([...matching[0]!.querySelectorAll('td')].map(text), [name, `${amount(low)}–${amount(high)}`, String(count), String(expected.eligible), String(expected.retained)]);
      }
      const context = [...group.querySelectorAll('caption,th,td')].map(text).join(' ');
      assert.match(context, new RegExp(`(?<!\\d)${expected.eligible}(?!\\d)`, 'u'), 'eligible denominator');
      assert.match(context, new RegExp(`(?<!\\d)${expected.retained}(?!\\d)`, 'u'), 'retained row count');
      assert.doesNotMatch(context, /tổng (?:hai|các|cả hai) sàn|thương hiệu|loại sản phẩm/iu);
    }
  });

  test(`M17 structure and evidence: ${shape} three distinct options with owners and deadlines`, async t => {
    const { doc } = await documentFor(t, shape), rows = [...optionRows(doc)];
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(row => text(row.cells[0])), COPY.optionTitles);
    assert.deepEqual(rows.map(row => text(row.cells[2])), COPY.firstSteps);
    const names = rows.map(row => text(row.cells[0]).replace(/^[ABC][.)]\s*/u, '').toLowerCase());
    assert.equal(new Set(names).size, 3, 'option letters alone do not make titles distinct');
    assert.deepEqual([...quickRows(doc)].map(row => text(row.cells[0])), COPY.quickTasks);
    assert.deepEqual([...quickRows(doc)].map(row => text(row.cells[3])), COPY.quickOutputs);
    for (const row of rows) {
      assert.equal(row.cells.length, 5);
      assert.match(text(row.cells[3]), /đề xuất.*chờ chủ duyệt/u);
      assert.match(text(row.cells[4]), /^\d{2}\/\d{2}\/\d{4}$/u);
      const relevant = text(row);
      assert.match(relevant, /Shopee|TikTok Shop/u, 'each option names an evidenced platform');
      if (shape === 'P1') {
        const evidenced = Object.entries(BUSINESS_EXPECTED.P1).some(([platform, expected]) => {
          const platformName = platform === 'shopee' ? 'Shopee' : 'TikTok Shop';
          return relevant.includes(platformName) && expected.bands.some(([low, high]) => {
            const escaped = (n: number) => amount(n).replace(/\./gu, '\\.');
            return new RegExp(`${escaped(low)}\\s*(?:[–—-]|đến|tới)\\s*${escaped(high)}`, 'u').test(relevant);
          });
        });
        assert.ok(evidenced, 'an option must cite a whole price band from its named platform');
      } else assert.match(text(section(doc, 'M12')), /chưa đủ|chưa có/u, 'thin sample does not invent a band');
    }
    for (const row of quickRows(doc)) {
      assert.match(text(row.cells[1]), /đề xuất.*chờ chủ duyệt/u);
      assert.match(text(row.cells[2]), /^\d{2}\/\d{2}\/\d{4}$/u);
    }
    assert.doesNotMatch(text(section(doc, 'M12')), /cam kết|bảo đảm tăng|tăng doanh thu \d|biên lợi nhuận \d/iu);
  });

  test(`M17 quick wins: ${shape} business checks rather than report chores`, async t => {
    const { doc } = await documentFor(t, shape);
    const cells = [...quickRows(doc)].map(row => `${text(row.cells[0])} ${text(row.cells[3])}`).join(' ');
    assert.doesNotMatch(cells, /viết câu hỏi kinh doanh cho báo cáo|nhãn phân loại|thu(?: thập)? lại|bổ sung dữ liệu|chạy lại|làm lại báo cáo/iu);
    assert.match(cells, /kiểm|đối chiếu|so sánh|xác nhận|xem xét|duyệt|giá|quy cách/iu);
  });

  test(`L8 automated origin: ${shape} retained capture date and no operator/run wording`, async t => {
    const { doc } = await documentFor(t, shape);
    const method = text(section(doc, 'M03'));
    assert.doesNotMatch(method, /người vận hành|nhân viên|operator/iu);
    assert.ok(method.includes(BUSINESS_CAPTURE_DAY), 'date comes from the retained capture, not build/run/sample dates');
    assert.doesNotMatch(text(doc.body), RUN_WORD);
  });

  test(`L12 price wording: ${shape} current M08 title and method name promise prices only`, async t => {
    const { doc } = await documentFor(t, shape), m08 = section(doc, 'M08');
    const title = m08.querySelector('h1,h2');
    assert.ok(title);
    assert.ok(text(title).endsWith(COPY.priceTitle));
    assert.doesNotMatch(text(title), /kinh tế đơn vị|unit economics|lợi nhuận|biên lợi nhuận|chi phí/iu);
    // The method name may occur in TOC, reference copy or a method record. Authored headings cannot promise economics.
    const names = [...doc.querySelectorAll('h1,h2,h3,h4,summary,a[href="#M08"]')].map(text).join(' ');
    assert.doesNotMatch(names, /kinh tế đơn vị|unit economics/iu);
    const authored = m08.cloneNode(true) as Element;
    authored.querySelectorAll('[data-quote],q,blockquote').forEach(node => node.remove());
    assert.doesNotMatch(text(authored), /\bbundle\b|combo pack/iu);
  });
}

for (const shape of ['P1', 'P3'] as const) test(`M17 irrelevant reviews: ${shape} option and quick-win cells have no review dependency`, async t => {
  const { doc } = await documentFor(t, shape);
  assert.doesNotMatch(text(section(doc, 'M12')), REVIEW_WORD);
  assert.doesNotMatch(text(section(doc, 'M11')), REVIEW_WORD, 'opportunity explanation uses the same evidence predicate');
});

test('M6 interior peak: P2 names 100 at 09/02, with no first-to-last rise or fall', async t => {
  const { doc } = await documentFor(t, 'P2');
  const figure = [...section(doc, 'M05').querySelectorAll('figure')].find(node => text(node).includes('Mức quan tâm tìm kiếm'));
  assert.ok(figure);
  const reading = readingFor(figure);
  assert.match(reading, /(?:đỉnh|cao nhất|mức cao).*100|100.*(?:đỉnh|cao nhất|mức cao)/iu);
  assert.match(reading, /09(?:–15)?\/02(?:\/2025)?/u);
  assert.doesNotMatch(reading, /chiều tăng|chiều giảm|giá trị đi từ|mốc đầu và mốc cuối|xu hướng (?:tăng|giảm)/iu);
});

test('M6 interior peak, trough and missing point keep all evidence within three sentences', async t => {
  const { doc } = await documentFor(t, 'P2', async input => {
    const searchInterest = syntheticSearchInterest({ keyword: 'Sản phẩm mẫu', points: [22, 100, null, 5, 23].map((index, i) => ({
      period: new Date(Date.UTC(2025, 0, 5 + 7 * i)).toISOString().slice(0, 10), index,
    })) });
    return { ...input, collection: { ...input.collection!, searchInterest },
      searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)) };
  });
  const figure = [...section(doc, 'M05').querySelectorAll('figure')].find(node => text(node).includes('Mức quan tâm tìm kiếm'));
  assert.ok(figure);
  const reading = readingFor(figure);
  assert.match(reading, /Đỉnh của chuỗi là 100 \(12–18\/01\/2025\)/u);
  assert.match(reading, /Đáy của chuỗi là 5 \(26\/01–01\/02\/2025\)/u);
  assert.match(reading, /1 mốc chưa có dữ liệu, không phải bằng không/u);
  assert.ok(reading.split(/(?<=\.)\s/u).length <= 3, reading);
  assert.doesNotMatch(reading, /chiều tăng|chiều giảm|giá trị đi từ/u);
});

test('M6 keep gates: P1 missing gap; P2 short periods; all readings avoid causal and forecast claims', async t => {
  const p1 = await documentFor(t, 'P1'), p2 = await documentFor(t, 'P2');
  assert.match([...section(p1.doc, 'M05').querySelectorAll('.interp')].map(text).join(' '), /mốc chưa có dữ liệu, không phải bằng không/u);
  const table = section(p2.doc, 'M03').querySelector('[data-market-periods]');
  assert.ok(table);
  assert.ok(table.querySelectorAll('[data-period-incomplete="true"]').length > 0, 'E excludes February shorter than 30 days');
  for (const { doc } of [p1, p2]) {
    // Quoted column names include valid source attribution ("do nguồn tính"); exclude these names from authored causal prose.
    const readings = [...doc.querySelectorAll('.interp')].map(text).join(' ').replace(/“[^”]*”/gu, '');
    assert.doesNotMatch(readings, /(?<![\p{L}])(?:do|nhờ|dẫn đến|dự báo)(?![\p{L}])/iu);
  }
});

test('M10 keep dedupe and unknown shops: P1 platform rows stay separate and no invented shop count', async t => {
  const { doc } = await documentFor(t, 'P1'), m03 = section(doc, 'M03'), m04 = section(doc, 'M04');
  assert.match(text(m03), /n = 7 dòng sản phẩm/u);
  assert.match(text(m03), /n = 6 dòng sản phẩm/u);
  assert.match(text(m03), /nguồn không ghi gian hàng|không đếm số gian hàng/u);
  assert.doesNotMatch(text(m04), /tổng (?:hai|các|cả hai) sàn|13 sản phẩm|13 bản ghi/iu);
  assert.equal(m04.querySelectorAll('table[data-market-periods]').length, 0, 'retained inventory is not duplicated into M04');
});

test('M6 keep incompatible unit and period gates: P3 official rows stay separate', async t => {
  for (const mismatch of ['unit', 'period'] as const) {
    const { doc } = await documentFor(t, 'P3', input => {
      const stored = input.collection!.officialStats!;
      return { ...input, collection: { ...input.collection!, officialStats: { ...stored,
        values: stored.values.map((row, i) => i === 0 ? row : { ...row,
          ...(mismatch === 'unit' ? { unit: 'đồng', measure: 'LEVEL' as const } : { period: 'Tháng 8 năm 2026' }) }),
      } } };
    });
    const table = [...section(doc, 'M05').querySelectorAll('table')].find(table =>
      [...table.querySelectorAll('thead th')].some(th => text(th) === 'Dòng'))!;
    assert.ok(table);
    assert.doesNotMatch(readingFor(table), COMPARISON);
  }
});

test('M6 keep platform gates: P1 sample readings never compare Shopee with TikTok Shop', async t => {
  const { doc } = await documentFor(t, 'P1');
  const readings = [...section(doc, 'M03').querySelectorAll('.interp')].map(text);
  assert.ok(readings.length > 0);
  for (const reading of readings) {
    assert.ok(!(reading.includes('Shopee') && reading.includes('TikTok Shop') && COMPARISON.test(reading)));
  }
});

test('L5 no success self-check: P1 and P2 all-attributed captures omit it', async t => {
  for (const shape of ['P1', 'P2'] as const) {
    const { doc } = await documentFor(t, shape);
    assert.doesNotMatch(text(doc.body), SELF_CHECK, shape);
  }
});

test('L5 warning survives: P3 one unattributed row is shown separately', async t => {
  const { doc } = await documentFor(t, 'P3'), m03 = section(doc, 'M03');
  assert.match(text(m03), /không gán được sàn/u);
  const table = [...m03.querySelectorAll('table')].find(node => /Dòng không gán được sàn/u.test(text(node.querySelector('caption'))));
  assert.ok(table);
  assert.equal(table.querySelectorAll('tbody tr').length, 1);
  assert.match(text(m03), /không cộng vào Shopee hoặc TikTok Shop/u);
});

test('L7 reconciliation: P3 cap 20; platform observed 4=1+3, 3=1+2; unattributed 1 stays separate', async t => {
  const { doc } = await documentFor(t, 'P3'), method = text(section(doc, 'M03'));
  assert.match(method, /(?:giới hạn|tối đa|lấy).*20/u);
  // Each independent platform sentence must carry observed, excluded and retained counts.
  for (const [name, observed, retained] of [['Shopee', 4, 3], ['TikTok Shop', 3, 2]] as const) {
    const statement = method.split(/(?<=[.;])\s+/u).find(part => part.includes(`${name}: đã quan sát`) && /loại/u.test(part) && /giữ/u.test(part));
    assert.ok(statement, `${name}: observed/excluded/retained in the method section`);
    for (const n of [observed, 1, retained]) assert.match(statement, new RegExp(`(?<!\\d)${n}(?!\\d)`, 'u'));
    assert.match(statement, /quan sát|đã đọc|đã thấy|ghi nhận/u);
  }
  assert.ok(method.includes('Có 1 dòng chưa gán sàn, giữ riêng ngoài số từng sàn.'));
  assert.ok(method.includes('Nguồn là bảng kết quả tìm kiếm đã lưu; giới hạn lấy 20 dòng đầu.'));
  assert.ok(method.includes('Đã quan sát 8 dòng trong bảng kết quả'));
  assert.ok(method.includes('Bảng kết quả đã bị cắt theo giới hạn thu; không suy ra phần còn lại.'));
  assert.ok(method.includes('Shopee: đã quan sát 4 dòng đã gán sàn = 1 dòng bị loại + 3 dòng được giữ'));
  assert.ok(method.includes('TikTok Shop: đã quan sát 3 dòng đã gán sàn = 1 dòng bị loại + 2 dòng được giữ'));
  assert.match(method, /cắt|phần còn lại|giới hạn/u);
  assert.doesNotMatch(method, /CAPTURE_RESULTS_PAGE_TOP_N_LIMITED|rowsRead|pagesRead|NOT_MAIN_PRODUCT/u);
});

test('L7 global found count: P3 does not invent platform found counts from global 80', async t => {
  const { doc } = await documentFor(t, 'P3'), method = text(section(doc, 'M03'));
  assert.ok(method.includes(COPY.globalFound));
  assert.doesNotMatch(method, /Shopee[^.;]{0,30}(?:40|80) dòng|TikTok Shop[^.;]{0,30}(?:40|80) dòng/u);
});

test('L8 owner unit attribution: P3 keeps the manually approved specification origin', async t => {
  const { doc } = await documentFor(t, 'P3');
  assert.match(text(section(doc, 'M08')), /chủ (?:dự án|sở hữu)|chủ.*(?:nhập|duyệt|xác nhận|khai báo)/iu);
  assert.match(text(section(doc, 'M08')), /10\.000/u);
});

test('L8 manual export remains distinguishable when the capture branch is absent', async t => {
  const { doc } = await documentFor(t, 'P3', input => {
    const { capture: _capture, ...metricMethods } = input.metricMethods!;
    return { ...input, metricMethods: { ...metricMethods, limitations: ['OPERATOR_ATTACHED_EXPORT_NOT_PROVIDER_AUTHENTICATED'] } };
  });
  assert.match(text(doc.body), /người (?:dùng|vận hành).*(?:gắn|đính|cung cấp)|(?:gắn|đính|cung cấp).*người (?:dùng|vận hành)/iu);
});

test('L9 no-review caveat: P1 omits the review-date caveat and never claims zero reviews', async t => {
  const { doc } = await documentFor(t, 'P1');
  assert.doesNotMatch(text(doc.body), OLD_REVIEW_CAVEAT);
  assert.doesNotMatch(text(doc.body), /(?:0|không có) (?:review|đánh giá của sản phẩm)/iu);
});

test('L9 retained-review caveat: P2 and P3 keep the existing warning', async t => {
  for (const shape of ['P2', 'P3'] as const) {
    const { doc } = await documentFor(t, shape);
    assert.match(text(doc.body), OLD_REVIEW_CAVEAT);
  }
});

test('L9 no returned reviews: P2 blocked collection receipt alone does not require a review-date caveat', async t => {
  const { doc } = await documentFor(t, 'P2', input => businessReviewEvidence(input, [0], { blocked: true }));
  assert.doesNotMatch(text(doc.body), OLD_REVIEW_CAVEAT);
});

test('L12 keep E price basis: full report preserves platform, periods, source estimate, missing range and short-price exclusion', async t => {
  const captures = periodCaptures().map(capture => ({ ...capture, key: capture.key.replace('sample:', 'shopee:') }));
  const { doc } = await documentFor(t, 'P2', input => ({ ...input, marketInventory: periodInventory(captures),
    collection: { ...input.collection!, productCards: periodProducts.map(product => ({ productId: product.key.replace('sample:', 'shopee:'), title: product.label })) as never[] },
  }));
  const m08 = section(doc, 'M08'), table = m08.querySelector('[data-market-prices]');
  assert.ok(table);
  assert.equal(table.querySelectorAll('tbody tr').length, 3);
  assert.equal(table.querySelectorAll('[data-period-incomplete="true"]').length, 2);
  assert.match(text(m08), /Giá bình quân do nguồn tính, ước tính \(VND\)/u);
  assert.match(text(m08), /01\/10\/2026 đến 30\/10\/2026/u);
  assert.match(text(m08), /chưa có khoảng giá nguồn dùng được/iu);
  assert.ok([...table.querySelectorAll('td')].some(cell => text(cell) === '—'));
  const reading = readingFor(table);
  assert.ok(reading.includes('710.071'));
  assert.doesNotMatch(reading, /510\.051|610\.061/u);
  assert.doesNotMatch(text(table), /(?<!\d)0 VND|tổng (?:hai|các) sàn/u);
});

test('L12 keep positive price and missing state: P2 source zero never becomes a price reading', async t => {
  const snapshot = periodInventory([{ ...periodCaptures()[0]!, price: '0', range: ['0', '100000'] }]);
  const { doc } = await documentFor(t, 'P2', input => ({ ...input, marketInventory: snapshot,
    collection: { ...input.collection!, productCards: [{ productId: periodProducts[0].key, title: periodProducts[0].label }] as never[] } }));
  const m08 = section(doc, 'M08'), table = m08.querySelector('[data-market-prices]');
  assert.ok(table);
  assert.match(text(table), /Chưa có giá đọc được/u);
  assert.doesNotMatch(text(table), /(?<!\d)0(?: VND)?(?!\d)/u);
  // UNIT-209 C7 adds a title-unit table with its own reading; no reading may turn the source zero into a price.
  for (const reading of m08.querySelectorAll('.interp')) assert.doesNotMatch(text(reading), /(?<!\d)0(?: VND)?(?!\d)|Giá tham khảo/u);
});

test('L12 keep source quote bytes: P1 bundle words inside a retained title remain verbatim', async t => {
  // Rebuild the source result and presentation bindings for this synthetic quote variant.
  const { doc } = await documentFor(t, 'P1', () => businessInput('P1', { sourceTitle: 'Sản phẩm mẫu bundle combo pack <A> & B' }));
  const quote = [...section(doc, 'M03').querySelectorAll('[data-quote]')].find(node => text(node).includes('bundle'));
  assert.ok(quote);
  assert.equal(text(quote), 'Sản phẩm mẫu bundle combo pack <A> & B');
  assert.equal(quote.querySelector('a,b,script,img'), null);
});

test('L13 retained series: P2 blocked guidance distinguishes sample and twelve monthly product periods', async t => {
  const { doc } = await documentFor(t, 'P2'), m10 = section(doc, 'M10');
  assert.equal(text(m10.querySelector('.state')), 'Chưa đủ dữ liệu');
  assert.doesNotMatch(text(m10), OLD_SINGLE_PERIOD);
  assert.ok(text(m10).includes(COPY.retainedSeries));
  assert.match(text(m10), /mẫu/u);
  assert.match(text(m10), /chuỗi|theo kỳ/u);
  assert.match(text(m10), /cùng (?:một )?(?:cách|thước đo|phương pháp)|so sánh|đồng nhất|tương thích/u);
  assert.match(text(m10), /kiểm tra|kiểm định|dự báo/u);
  assert.doesNotMatch(text(m10), /(?:cần|ít nhất|tối thiểu) \d+ ngày|quy mô thị trường.*\d/u);
  assert.equal(section(doc, 'M03').querySelectorAll('[data-market-periods] tbody tr').length, 12);
});

test('L13 no retained series: P1 keeps main blocked guidance unchanged', async t => {
  const { doc } = await documentFor(t, 'P1');
  assert.equal(text(section(doc, 'M10')), 'Phần 10Dự báo và kịch bảnChưa đủ dữ liệuChưa dự báo: cần chuỗi doanh số theo từng ngày, đo cùng một cách và đủ dài, cùng một khoảng thời gian riêng để kiểm tra lại dự báo. Lượt này chỉ có mẫu đã lưu trong kỳ báo cáo nên chưa đủ để dự báo hay dựng kịch bản. Không tự suy ra quy mô thị trường hoặc hiểu biết về khách hàng từ phần còn thiếu.');
});

test('L16 verified receipt labels: P2 exact listing identity gets retained product title and seven reviews', async t => {
  const { doc } = await documentFor(t, 'P2'), block = doc.querySelector('.test-review-sample');
  assert.ok(block);
  assert.equal(text(block.querySelector('li a')), 'Sản phẩm mẫu 1-1');
  assert.match(text(block), /7 đánh giá/u);
  assert.match(text(block), /20 đánh giá/u);
  assert.ok(text(block).includes(COPY.reviewIntro));
  assert.match(text(block), /không đại diện|không.*toàn bộ/u);
  assert.match(text(block), /không phải số người/u);
});

test('L16 retained source titles survive receipt localization and remain escaped', async t => {
  const title = 'Sản phẩm mẫu bundle combo pack <A> & B';
  const { doc } = await documentFor(t, 'P2', () => businessInput('P2', { sourceTitle: title }));
  const receipt = doc.querySelector('.test-review-sample li a');
  assert.ok(receipt);
  assert.equal(text(receipt), title);
  assert.equal(receipt.querySelector('a,b,script,img'), null);
  assert.ok([...section(doc, 'M03').querySelectorAll('[data-quote]')].some(node => text(node) === title));
});

test('L16 escaping, unsafe and unmatched fallback: five uniform receipt list items with 0/7/20', async t => {
  const { doc } = await documentFor(t, 'P2', input => {
    const withReviews = businessReviewEvidence(input, [0, 7, 20, 7, 0]);
    return { ...withReviews, collection: { ...withReviews.collection!, productCards: [
      { productId: businessListingForTest(0), title: 'Sản phẩm mẫu <A> & B' },
      { productId: businessListingForTest(1), title: 'Sản phẩm mẫu 1-2' },
      { productId: businessListingForTest(2), title: 'Sản phẩm mẫu 1-3' },
      { productId: businessListingForTest(3), title: 'https://example.invalid/unsafe-title' },
    ] as never[] } };
  });
  const block = doc.querySelector('.test-review-sample')!, items = [...block.querySelectorAll('li')];
  assert.equal(items.length, 5);
  assert.deepEqual(items.map(item => text(item.querySelector('a'))), [
    'Sản phẩm mẫu <A> & B', 'Sản phẩm mẫu 1-2', 'Sản phẩm mẫu 1-3', 'Sản phẩm #4', 'Sản phẩm #5',
  ]);
  assert.equal(block.querySelector('a a,script,img,a A'), null);
  assert.equal(new Set(items.map(item => item.getAttribute('class') ?? '')).size, 1);
  assert.ok(items.every(item => !item.hasAttribute('style')));
  assert.doesNotMatch(text(block), /(?<!\d)0 đánh giá|https:\/\/example.invalid/u);
  for (const item of items) {
    assert.equal(item.parentElement?.tagName, 'UL');
    assert.ok(item.querySelector('a'));
    assert.equal(item.querySelector('a')!.getAttribute('rel'), 'noopener noreferrer');
  }
});
const businessListingForTest = (index: number) => `https://shopee.vn/product/201/${101 + index}`;

test('L16 no-source receipt: failed source is honest without implying the product has no reviews', async t => {
  const { doc } = await documentFor(t, 'P2', input => businessReviewEvidence(input, [0, 0], { blocked: true }));
  const block = doc.querySelector('.test-review-sample')!;
  assert.match(text(block), /nguồn tạm thời không trả dữ liệu/u);
  assert.match(text(block), /không suy ra sản phẩm không có đánh giá/u);
  assert.doesNotMatch(text(block), /(?<!\d)0 đánh giá|đã thu hết/u);
  assert.equal(block.querySelectorAll('li').length, 2);
});

test('L16 unsafe technical names are rejected as receipt labels', async t => {
  // Forbidden names occur only as inputs to this rejection test.
  for (const unsafe of ['Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'SerpApi', 'PageIndex', 'Gemini', 'OpenCLI', 'zen-studio', 'Agent-Reach', 'Google', 'Nemotron', 'NVIDIA']) {
    // An outside-group card isolates the receipt label from inventory/table label validation.
    const { doc } = await documentFor(t, 'P3', input => ({ ...input, collection: { ...input.collection!,
      productCards: [{ productId: businessListingForTest(90), title: unsafe }] as never[] } }));
    assert.equal(text(doc.querySelector('.test-review-sample li a')), 'Sản phẩm #1');
  }
});

test('M17 relevant review permission: P2 retained relevant reviews do not become mandatory inputs or people counts', async t => {
  const { doc } = await documentFor(t, 'P2');
  assert.equal(optionRows(doc).length, 3);
  assert.doesNotMatch(text(section(doc, 'M12')), /7 (?:người|khách)|20 (?:người|khách)/u);
  // Contract says MAY use relevant reviews; requiring any specific review sentence would over-specify it.
  assert.match(text(doc.querySelector('.test-review-sample')), /7 đánh giá/u);
});

test('legacy and Insight byte controls: exact main-generated HTML, fixed clock and ids', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T00:00:00.000Z') });
  for (const [name, kind, digest] of [
    ['legacy-market', 'MARKET', '570ae91548e5ee9f96087b052058fc593a851e28e4678ddf3360594fd5a98cf4'],
    ['insight', 'INSIGHT', '47d571e32c98bdd12859402e64c12ac05fdc570b031c878ce873830804d6bd19'],
  ] as const) {
    const expected = readFileSync(new URL(`../fixtures/package-r-business-${name}.html`, import.meta.url));
    assert.equal(createHash('sha256').update(expected).digest('hex'), digest, 'baseline bytes cannot drift');
    assert.deepEqual(buildResearchAutomationReport(businessByteInput(), kind).html, expected);
  }
});

test('shared reader default remains historical: test-review option changes no older reader bytes', async () => {
  const fixture = sync1ReaderFixture('1.3.0');
  fixture.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const data = computeReaderReportData(fixture), base = await buildMarketReport(data, sync1Options);
  const sample = await inputFor('P2');
  const built = await buildMarketReport(data, { ...sync1Options, testReviewSample: sample });
  assert.equal(built.html, base.html);
});

test('shared action default bytes: standalone 1.4 reader retains the main frozen action plan', async () => {
  const input = sync1ReaderFixture('1.4.0');
  input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const report = await buildMarketReport(computeReaderReportData(input), sync1Options);
  // Frozen on main in market-reader-test-reviews.test.ts, not inferred from the R implementation.
  assert.equal(createHash('sha256').update(report.html).digest('hex'), '7895f2f4334a688aadd4bb64049417e37a9e38023d62b92407ef20913a940df9');
});

// UNIT-209: independent, hand-calculated prices. The six sizes are 100,200,500,100,200,500 g.
// Shopee normalized thirds: 10k–20k | 30k–40k (7m revenue) | 50k–60k.
// TikTok normalized thirds: 70k–80k | 90k–100k | 110k–120k (23m revenue).
// The ambiguous Shopee row has revenue, so it stays in n and revenue rankings, but never in a band.
function titleUnitRows(): HeadlineRow[] {
  const templates = headlineRows();
  const titles = ['Bột ngũ cốc 100g', 'Kem dưỡng 200g', 'Trà lá 500g', 'Muối hạt 100g', 'Xà phòng 200g', 'Bánh gạo 500g'];
  const rows = templates.map((row, index) => {
    const j = index % 6, p = index < 6 ? 0 : 1;
    const rev = (p === 0 ? [100_000, 200_000, 3_000_000, 4_000_000, 500_000, 600_000]
      : [700_000, 800_000, 900_000, 1_000_000, 11_000_000, 12_000_000])[j]!;
    const asp = (p * 6 + j + 1) * 10_000 * [1, 2, 5, 1, 2, 5][j]!;
    return { ...row, title: titles[j]!, rev, units: rev / asp, asp };
  });
  rows.push({ ...rows[0]!, i: 6, listing: 'ambiguous-food', title: 'Thạch dừa 100g/500g', rev: 1_000_000, units: 1, asp: 1_000_000 });
  return rows;
}
const titleUnitInput = () => headlineInput(titleUnitRows());
const titleUnitNoCaptureInput = async () => {
  const input = await headlineInput(titleUnitRows().filter(row => row.platform === 'shopee'));
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  return { ...input, metricMethods };
};
const mixedTitleRows = (): HeadlineRow[] => headlineRows().slice(0, 3).map((row, i) => ({ ...row,
  title: ['Trà 12 gói', 'Nước hoa 100ml', 'Quạt đứng 16 inch'][i]!, rev: [40_000, 35_000, 25_000][i]!, units: 1,
}));
const titleUnitNoComparison = 'Chưa so giá giữa các sản phẩm vì quy cách khác nhau hoặc không ghi trong tên sản phẩm.';
const titlePriceTables = (node: Element) => [...node.querySelectorAll('table')].filter(table =>
  [...table.querySelectorAll('thead th')].some(th => /^Đơn giá quy đổi/u.test(text(th))));

test('C4 no cross-product unit sums: keep product sales and per-platform revenue', async t => {
  const { doc, input } = await documentFor(t, 'P1', titleUnitInput);
  const m03 = section(doc, 'M03');
  const productTables = [...m03.querySelectorAll('table')].filter(table =>
    [...table.querySelectorAll('thead th')].some(th => text(th) === 'Lượt bán (đơn vị chào bán)'));
  assert.equal(productTables.length, 2);
  assert.deepEqual(productTables.map(table => table.querySelectorAll('tbody tr').length), [7, 6]);
  for (const table of productTables) {
    const headers = [...table.querySelectorAll('thead th')].map(text), index = headers.indexOf('Lượt bán (đơn vị chào bán)');
    const platform = text(table).includes('TikTok Shop') ? 'tiktok' : 'shopee';
    assert.deepEqual([...table.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[index])),
      titleUnitRows().filter(row => row.platform === platform).map(row => amount(row.units!)));
  }
  assert.ok(text(m03).includes('9.400.000'));
  assert.ok(text(m03).includes('26.400.000'));
  const authored = [...doc.querySelectorAll('p,li,figcaption')].filter(node => !node.closest('table')).map(text).join(' ');
  assert.doesNotMatch(authored, /143 đơn vị bán|97 đơn vị bán|sản lượng\s*:/iu);
  assert.doesNotMatch(text(section(doc, 'M04')), /143|97|240 đơn vị bán/u);
  const demand = input.marketPresentation!.findings.find(finding => finding.id === 'demand');
  assert.ok(demand);
  assert.match(demand.statement, /đơn vị bán chỉ đọc theo từng sản phẩm/u);
  assert.doesNotMatch(demand.statement, /143 đơn vị bán/u);
  // The current reader without a capture uses a separate summary/trace renderer.
  const noCapture = await documentFor(t, 'P1', titleUnitNoCaptureInput);
  assert.equal(noCapture.input.metricMethods!.capture, undefined);
  const source = section(noCapture.doc, 'M03');
  const summary = [...source.querySelectorAll('table')].find(table => text(table.querySelector('thead')).includes('Doanh thu quan sát'));
  assert.ok(summary);
  assert.deepEqual([...summary.querySelectorAll('thead th')].map(text),
    ['Phạm vi', 'Bản ghi sản phẩm', 'Gian hàng', 'Doanh thu quan sát', 'Nguồn']);
  assert.match(text(summary), /9\.400\.000 VND/u);
  assert.doesNotMatch(text(source), /Sản lượng nguồn|143(?: đơn vị|\b)/u);
  assert.ok(noCapture.report.traceHtml);
  const traceDom = new JSDOM(noCapture.report.traceHtml.toString());
  t.after(() => traceDom.window.close());
  const trace = [...section(traceDom.window.document, 'M03').querySelectorAll('table')].find(table =>
    [...table.querySelectorAll('thead th')].some(th => text(th) === 'Lượt bán (đơn vị chào bán)'));
  assert.ok(trace, 'per-product units survive in the no-capture source trace');
  assert.deepEqual([...trace.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[3])),
    ['10', '5', '20', '100', '5', '2', '1']);
});

test('C5 price bands: converted prices only, separate platforms and honest k/n', async t => {
  const { doc } = await documentFor(t, 'P1', titleUnitInput);
  const m04 = section(doc, 'M04');
  for (const [platform, name, eligible, retained, bands] of [
    ['shopee', 'Shopee', 6, 7, ['10.000–20.000', '30.000–40.000', '50.000–60.000']],
    ['tiktok', 'TikTok Shop', 6, 6, ['70.000–80.000', '90.000–100.000', '110.000–120.000']],
  ] as const) {
    const table = m04.querySelector(`table[data-market-price-bands][data-platform="${platform}"]`);
    assert.ok(table);
    assert.deepEqual([...table.querySelectorAll('thead th')].map(text),
      ['Sàn', 'Khoảng giá (đồng/100g)', 'Số dòng trong khoảng giá', 'Số sản phẩm quy đổi được', 'Số dòng được giữ']);
    assert.deepEqual([...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(text)),
      bands.map(band => [name, band, '2', String(eligible), String(retained)]));
  }
  const opportunity = section(doc, 'M11');
  assert.match(text(opportunity.querySelector('thead')), /Khoảng giá có doanh thu lớn \(đồng\/100g\)/u);
  assert.deepEqual([...opportunity.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(text)), [
    ['Shopee', '30.000–40.000', '7.000.000', '2', '9.100.000', '5'],
    ['TikTok Shop', '110.000–120.000', '23.000.000', '2', '25.700.000', '5'],
  ]);
  for (const id of ['M04', 'M11', 'M12']) {
    const content = text(section(doc, id));
    assert.ok(content.includes('Shopee: 6/7 sản phẩm quy đổi được theo quy cách trong tên sản phẩm; 1 sản phẩm chưa quy đổi được, không đưa vào so sánh giá.'), id);
    assert.ok(content.includes('TikTok Shop: 6/6 sản phẩm quy đổi được theo quy cách trong tên sản phẩm.'), id);
    assert.doesNotMatch(content, /0 sản phẩm chưa quy đổi|mỗi đơn vị bán/u);
  }
  const headline = text(section(doc, 'M01')), options = [...optionRows(doc)].map(text);
  assert.match(headline, /Shopee: nhóm giá 30\.000–40\.000 đồng\/100g/u);
  assert.match(headline, /TikTok Shop: nhóm giá 110\.000–120\.000 đồng\/100g/u);
  for (const option of options) {
    assert.match(option, /Shopee: khoảng giá 30\.000–40\.000 đồng\/100g/u);
    assert.match(option, /TikTok Shop: khoảng giá 110\.000–120\.000 đồng\/100g/u);
    assert.doesNotMatch(option, /1\.000\.000–1\.000\.000/u, 'the ambiguous row must never become a band');
  }
  // Six single items must still form bands when a model suffix resembles a pack multiplier.
  const titles = ['Máy ảnh X100V', 'Quạt x100s', 'Son 3CE', 'Giày size 40', 'Điện thoại 5G', 'Quạt đứng 16 inch'];
  const durables = titleUnitRows().slice(0, 6).map((row, i) => ({ ...row, title: titles[i]!, units: row.rev! / ((i + 1) * 10_000) }));
  durables.push({ ...durables[0]!, i: 6, listing: 'durable-pack', title: 'Bộ 3 giày', rev: 1_000_000, units: 1 });
  const durable = await documentFor(t, 'P1', () => headlineInput(durables));
  const durableBand = section(durable.doc, 'M04').querySelector('[data-market-price-bands][data-platform="shopee"]');
  assert.ok(durableBand, 'model suffixes must not reduce six convertible products below the band threshold');
  assert.deepEqual([...durableBand.querySelectorAll('thead th')].map(text),
    ['Sàn', 'Khoảng giá (đồng/sản phẩm)', 'Số dòng trong khoảng giá', 'Số sản phẩm quy đổi được', 'Số dòng được giữ']);
  assert.deepEqual([...durableBand.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(text)),
    ['10.000–20.000', '30.000–40.000', '50.000–60.000'].map(band => ['Shopee', band, '2', '6', '7']));
  assert.deepEqual([...section(durable.doc, 'M11').querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(text)),
    [['Shopee', '30.000–40.000', '7.000.000', '2', '9.100.000', '5']]);
  assert.ok(text(section(durable.doc, 'M04')).includes('Shopee: 6/7 sản phẩm quy đổi được theo quy cách trong tên sản phẩm; 1 sản phẩm chưa quy đổi được, không đưa vào so sánh giá.'));
});

test('C6 no profile or zero conversions: replace bands and retain revenue exhibits', async t => {
  const mixed = mixedTitleRows();
  assert.equal(chooseUnitProfile(mixed.map(row => ({ title: row.title, revenue: row.rev, units: row.units, platform: row.platform }))), null);
  // The positive comparison control ensures absence is caused by the input, not a missing exhibit selector.
  const positive = await documentFor(t, 'P1', titleUnitInput);
  assert.ok(section(positive.doc, 'M04').querySelector('[data-market-price-bands]'));
  for (const rows of [mixed, titleUnitRows().map(row => ({ ...row, units: 0 }))]) {
    const { doc } = await documentFor(t, 'P1', () => headlineInput(rows));
    const m04 = section(doc, 'M04'), m11 = section(doc, 'M11');
    assert.ok(text(m04).includes(titleUnitNoComparison));
    assert.equal(m04.querySelector('[data-market-price-bands]'), null);
    // Contract C6 also applies when a profile exists but k=0: only the band part disappears.
    assert.deepEqual([...m11.querySelectorAll('thead th')].map(text),
      ['Sàn', 'Doanh thu của nhóm sản phẩm doanh thu lớn (VND)', 'Số sản phẩm trong nhóm']);
    assert.ok(text(m11).includes(titleUnitNoComparison));
    assert.ok(m11.querySelector('tbody tr'), 'revenue leaders survive');
    assert.ok(m04.querySelector('figure[data-chart-kind="platform-revenue"], figure[data-chart-id="platform-revenue"]')
      ?? [...m04.querySelectorAll('figure')].find(figure => /Doanh thu/u.test(text(figure))), 'revenue chart survives');
    assert.doesNotMatch(text(section(doc, 'M01')), /nhóm giá [\d.]/u);
    assert.doesNotMatch(text(section(doc, 'M12')), /khoảng giá [\d.]/u);
    assert.doesNotMatch([text(m04), text(m11), text(section(doc, 'M12'))].join(' '), /0\/\d+|0 sản phẩm/u);
  }
  // Six same-platform products retain revenue leaders even when the ambiguous row leaves only five prices.
  const shopee = titleUnitRows().filter(row => row.platform === 'shopee');
  const partial = [...shopee.slice(0, 5), shopee.at(-1)!];
  for (const fallback of [false, true]) {
    const { doc, input } = await documentFor(t, 'P1', () => headlineInput(partial, { fallback }));
    assert.equal(input.marketPresentation!.input.rows.length, fallback ? 0 : 6);
    assert.equal(input.metricMethods!.capture!.platforms[0]!.result.input.records.length, 6);
    const m04 = section(doc, 'M04'), m11 = section(doc, 'M11');
    assert.equal(m04.querySelector('[data-market-price-bands]'), null, 'five converted prices cannot form bands');
    assert.match(text(m04), /Shopee: chưa đủ dữ liệu giá để chia khoảng giá trong mẫu\./u);
    assert.deepEqual([...m11.querySelectorAll('thead th')].map(text),
      ['Sàn', 'Doanh thu của nhóm sản phẩm doanh thu lớn (VND)', 'Số sản phẩm trong nhóm']);
    assert.deepEqual([...m11.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(text)),
      [['Shopee', '8.700.000', '5']], 'top five revenues still include the ambiguous product');
    const coverage = 'Shopee: 5/6 sản phẩm quy đổi được theo quy cách trong tên sản phẩm; 1 sản phẩm chưa quy đổi được, không đưa vào so sánh giá.';
    for (const id of ['M04', 'M11', 'M12']) assert.ok(text(section(doc, id)).includes(coverage), `${id}, fallback: ${fallback}`);
    assert.ok(m04.querySelector('figure[data-chart-kind="platform-revenue"], figure[data-chart-id="platform-revenue"]')
      ?? [...m04.querySelectorAll('figure')].find(figure => /Doanh thu/u.test(text(figure))), 'revenue chart survives partial conversion');
    assert.doesNotMatch(text(section(doc, 'M01')), /nhóm giá [\d.]/u);
    assert.doesNotMatch(text(section(doc, 'M12')), /khoảng giá [\d.]/u);
  }
});

test('C7 unit-price section: title and Metric fallback, revenue order, missing profile and owner precedence', async t => {
  for (const fallback of [false, true]) {
    const { doc, input } = await documentFor(t, 'P1', () => headlineInput(titleUnitRows(), { fallback }));
    assert.equal(input.marketPresentation!.input.rows.length, fallback ? 0 : 13);
    assert.equal(input.marketPresentation!.unitPrices.length, 0, 'no owner unit-price packet');
    assert.deepEqual(input.metricMethods!.capture!.platforms.map(({ result }) => result.input.records.length), [7, 6]);
    const tables = titlePriceTables(section(doc, 'M08'));
    assert.equal(tables.length, 2, `fallback: ${fallback}`);
    for (const [i, name, prices, titles] of [
      [0, 'Shopee', ['40.000', '30.000', '60.000', '50.000', '20.000', '10.000'],
        ['Muối hạt 100g', 'Trà lá 500g', 'Bánh gạo 500g', 'Xà phòng 200g', 'Kem dưỡng 200g', 'Bột ngũ cốc 100g']],
      [1, 'TikTok Shop', ['120.000', '110.000', '100.000', '90.000', '80.000', '70.000'],
        ['Bánh gạo 500g', 'Xà phòng 200g', 'Muối hạt 100g', 'Trà lá 500g', 'Kem dưỡng 200g', 'Bột ngũ cốc 100g']],
    ] as const) {
      const table = tables[i]!;
      assert.match(text(table.querySelector('thead')), /Đơn giá quy đổi \(đồng\/100g\)/u);
      assert.deepEqual([...table.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[4])), prices);
      assert.deepEqual([...table.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[2])), titles);
      for (const tr of table.querySelectorAll('tbody tr')) {
        assert.equal(text(tr.querySelectorAll('td')[0]), name);
        assert.equal(text(tr.querySelectorAll('td')[6]), 'quy cách theo tên sản phẩm');
      }
      assert.doesNotMatch(text(table), /Thạch dừa 100g\/500g/u);
    }
  }
  const missing = await documentFor(t, 'P1', () => headlineInput(mixedTitleRows()));
  assert.equal(titlePriceTables(section(missing.doc, 'M08')).length, 0);
  assert.match(text(section(missing.doc, 'M08')), /Chưa quy đổi được/u);
  const owner = await documentFor(t, 'P3');
  const ownerSection = section(owner.doc, 'M08');
  assert.equal(titlePriceTables(ownerSection).length, 0);
  assert.match(text(ownerSection), /Số lượng do chủ khai báo/u);
  assert.match(text(ownerSection), /10\.000/u);
});

test('C8 per-product quantities: show matched evidence and explicit rejection', async t => {
  const { doc } = await documentFor(t, 'P1', titleUnitInput);
  const tables = [...section(doc, 'M03').querySelectorAll('table')].filter(table =>
    [...table.querySelectorAll('thead th')].some(th => text(th) === 'Lượt bán (đơn vị chào bán)'));
  assert.equal(tables.length, 2);
  for (const table of tables) {
    const headers = [...table.querySelectorAll('thead th')].map(text), quantity = headers.indexOf('Quy cách');
    assert.ok(quantity >= 0);
    for (const tr of table.querySelectorAll('tbody tr')) {
      const cells = [...tr.querySelectorAll('td')];
      const title = text(cells[2]);
      assert.equal(text(cells[quantity]), title === 'Thạch dừa 100g/500g' ? 'chưa quy đổi được' : title.match(/\d+g/u)![0], title);
      assert.equal(text(cells[2]!.querySelector('[data-quote]')), title, 'source title is preserved');
    }
  }
  for (const table of titlePriceTables(section(doc, 'M08'))) {
    assert.equal(text(table.querySelectorAll('thead th')[3]), 'Quy cách');
    for (const tr of table.querySelectorAll('tbody tr'))
      assert.equal(text(tr.querySelectorAll('td')[3]), text(tr.querySelectorAll('td')[2]).match(/\d+g/u)![0]);
  }
  const durable = await documentFor(t, 'P1', () => headlineInput(headlineRows().slice(0, 3).map((row, i) => ({ ...row,
    title: ['Quạt đứng 16 inch', 'Son 3CE', 'Bộ 3 giày'][i]!, rev: 100_000, units: 1 }))));
  const durableTable = [...section(durable.doc, 'M03').querySelectorAll('table')].find(table => text(table.querySelector('thead')).includes('Quy cách'))!;
  const headers = [...durableTable.querySelectorAll('thead th')].map(text);
  assert.deepEqual([...durableTable.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[headers.indexOf('Quy cách')])),
    ['không ghi số lượng; tính 1 sản phẩm', 'không ghi số lượng; tính 1 sản phẩm', 'chưa quy đổi được']);
  const noCapture = await documentFor(t, 'P1', titleUnitNoCaptureInput);
  assert.ok(noCapture.report.traceHtml);
  const traceDom = new JSDOM(noCapture.report.traceHtml.toString());
  t.after(() => traceDom.window.close());
  const sourceTable = [...section(traceDom.window.document, 'M03').querySelectorAll('table')].find(table =>
    [...table.querySelectorAll('thead th')].some(th => text(th) === 'Lượt bán (đơn vị chào bán)'));
  assert.ok(sourceTable, 'exercise the no-capture per-product trace');
  assert.deepEqual([...sourceTable.querySelectorAll('thead th')].map(text),
    ['Mã sản phẩm / gian hàng', 'Tên theo nguồn', 'Doanh thu kỳ (VND)', 'Lượt bán (đơn vị chào bán)', 'Quy cách', 'Nguồn']);
  assert.deepEqual([...sourceTable.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[4])),
    ['100g', '200g', '500g', '100g', '200g', '500g', 'chưa quy đổi được']);
  assert.deepEqual([...sourceTable.querySelectorAll('tbody tr')].map(tr => text(tr.querySelectorAll('td')[1])),
    titleUnitRows().filter(row => row.platform === 'shopee').map(row => row.title));
});

test('C9 unchanged guards: existing fixtures pass and visible provider names are rejected', async t => {
  for (const shape of BUSINESS_SHAPES) {
    const { report, doc } = await documentFor(t, shape), html = report.html.toString();
    assert.deepEqual(auditMarket14(html).filter(row => row.kind === 'machine' && !row.ok), [], shape);
    assert.doesNotThrow(() => assertMarketBusinessGate(html), shape);
    assert.doesNotMatch(text(doc.body), /Google|OpenAI|gpt-4o|Gemini/u);
    for (const node of doc.querySelectorAll('.state, [role="status"], [role="progressbar"], .progress')) {
      assert.notEqual(text(node), '0');
      assert.doesNotMatch(text(node), /%/u);
    }
    for (const forbidden of ['Google', 'gpt-4o']) {
      const bad = html.replace('</body>', `<p>${forbidden}</p></body>`);
      assert.equal(auditMarketReportHtml(bad).find(row => row.rule === 'G08_PROVIDER_NAME')!.ok, false);
      assert.throws(() => assertMarketBusinessGate(bad), /G08_PROVIDER_NAME/u);
    }
  }
});

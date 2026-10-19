import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { renderWorldBankCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import type { StepWorldBank } from '../../src/modules/analysis/research-automation/model.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import {
  G_CLOCK, G_FOOTNOTE, G_MACRO_NAMES, G_OFFICIAL_LABELS, G_QUOTED_TITLE, G_QUOTE_CONTEXTS,
  G_RETRIEVED, G_SCOPE_LIMIT, G_SHAPES, gAdsUnchecked, gByteInput, gEvidenceInput, gTrade, gWithQuoteContexts, type GShape,
} from '../helpers/package-g-evidence-fixture.js';

// ===== PHASE 2 BINDING SECTION (the only location for future imports/options/strings) =====
// The public Market presentation builder selects MacroChart.currentReader automatically.
// Round 2 requires explicit preparation context for HS-only charts; historical calls stay unchanged.
import { renderComtradeCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import { platIcons } from '../../src/modules/analysis/reader-report/layout.js';
const bindCurrentReader = async (input: AutomationReportInput): Promise<AutomationReportInput> => ({
  ...input, comtradeCharts: await renderComtradeCharts(input.collection?.comtrade, { currentReader: true }),
});
const buildCurrentReader = (input: AutomationReportInput) => buildResearchAutomationReport(input, 'MARKET');
const bindMacroCharts = (value: StepWorldBank) => renderWorldBankCharts(value);
// Existing table markers, copied from main, never imported from the proposed implementation.
const MARK = {
  trade: 'Thương mại cả nước theo mã hàng (bối cảnh)',
  official: 'Bối cảnh cả nước theo nhóm hàng (Cục Thống kê)',
  province: 'Chỉ số giá tiêu dùng theo tỉnh, thành phố (Cục Thống kê)',
  macro: 'Bối cảnh vĩ mô cả nước của Việt Nam, đặt cạnh phần nhu cầu',
  geography: 'Mức quan tâm tìm kiếm theo vùng',
  ads: 'Quảng cáo trên công cụ tìm kiếm (thư viện quảng cáo công khai)',
  web: 'Kết quả tìm kiếm trên web đã lưu',
};
// Exact copy from the code handoff, independent of production constants.
const COPY = {
  unknownCountry: 'Nước không rõ',
  hsMirrorTitle: 'Hàng xuất sang Việt Nam theo số từng nước tự báo, năm 2024: Mã HS 888888',
  hsOwnTitle: 'Nhập khẩu và xuất khẩu theo số Việt Nam tự báo, năm 2024: Mã HS 888888',
  reporters: (n: number, m: number) => `Hiển thị ${n} trong ${m} nước báo số hàng xuất sang Việt Nam đã lưu.`,
  scope: `Phạm vi áp dụng: ${G_SCOPE_LIMIT}`,
  scopeEstimate: 'Phạm vi theo mã hàng là ước tính, chưa xác nhận trùng với phạm vi sản phẩm.',
  tiny: 'dưới 0,1',
  preliminary: 'sơ bộ', estimated: 'ước tính', revised: 'điều chỉnh',
  listing: (file: number, date: string) => `Cục Thống kê, tệp số liệu ${file}, số liệu CPI tháng 9/2026, ngày niêm yết ${date}`,
  provinces: 'Các tỉnh, thành phố có trong bảng nguồn: Tỉnh mẫu A, Tỉnh mẫu B.',
  basic: 'Truy vấn cơ bản', window: 'Tìm theo khoảng ngày yêu cầu',
  dateHeader: 'Ngày đăng', unavailable: 'Chưa có ngày đăng',
  retrieved: '02/10/2026 10:04 (giờ Việt Nam)',
  webNote: 'Giữ nguyên vị trí nguồn trả về trong từng lượt tìm; các vị trí bị khuyết do gộp kết quả trùng. Khoảng ngày là yêu cầu tìm kiếm, không xác nhận ngày đăng nằm trong kỳ báo cáo. Nhãn ngày do nguồn ghi được trích nguyên văn; cột Ngày đăng ghi ngày đã chuẩn hóa hoặc tình trạng thiếu ngày. Đoạn trích và liên kết đầy đủ được giữ trong hồ sơ thu đã lưu.',
  zeroProvince: 'không có tỉnh nào đạt ngưỡng',
  geoNote: 'Số liệu cho Việt Nam; không cộng các vùng với nhau.',
  adsHeader: 'Trạng thái kiểm tra', zeroAds: 'không có mẫu quảng cáo',
  unknownAds: 'Đã kiểm tra; chưa có số liệu', failedAds: 'Kiểm tra thất bại',
  skippedAds: 'Chưa kiểm tra', noSiteAds: 'Chưa có trang web để kiểm tra',
  outside: 'Ngoài mẫu hiện tại',
  adsSelection: 'Các thương hiệu được chọn theo doanh thu trong danh sách sản phẩm đã lưu khi chọn thương hiệu, lấy lần lượt các thương hiệu khác nhau; danh sách đó có thể khác mẫu hiện tại.',
  macroSource: 'Ngân hàng Thế giới, giấy phép CC BY 4.0.',
  macroTitle: (name: string, scoped: boolean) => `Diễn biến theo năm: ${name}${scoped ? '' : ', cả nước Việt Nam'}`,
};
const WEB_GROUP = 'tbody[data-web-search-group]';
// ===== END PHASE 2 BINDING SECTION =====

type Rendered = { input: AutomationReportInput; before: string; html: string; trace: string | undefined; dom: JSDOM; doc: Document };
const cache = new Map<GShape, Promise<Rendered>>();
async function render(shape: GShape): Promise<Rendered> {
  let pending = cache.get(shape);
  if (!pending) {
    pending = (async () => {
      const input = await bindCurrentReader(await gEvidenceInput(shape));
      const before = JSON.stringify(input.collection);
      const built = buildCurrentReader(input);
      const html = built.html.toString(), dom = new JSDOM(html);
      return { input, before, html, trace: built.traceHtml?.toString(), dom, doc: dom.window.document };
    })();
    cache.set(shape, pending);
  }
  return pending;
}
after(async () => { for (const pending of cache.values()) (await pending).dom.window.close(); });
const text = (node: Node | null | undefined) => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
const cells = (row: Element) => [...row.querySelectorAll('td')].map(text);
function table(doc: Document, marker: string): HTMLTableElement | undefined {
  return [...doc.querySelectorAll('table')].find(node => node.getAttribute('aria-label') === marker || text(node.querySelector('caption')) === marker
    || text(node.querySelector('caption')).includes(marker)
    || (node.getAttribute('aria-labelledby') ?? '').split(/\s+/u).some(id => text(doc.getElementById(id)?.querySelector('.ext')).includes(marker)));
}
function needTable(doc: Document, marker: string): HTMLTableElement {
  const node = table(doc, marker); assert.ok(node, `missing table: ${marker}`); return node;
}
const wrap = (node: Element) => node.closest('.table-wrap') ?? node.parentElement!;
const bodyRows = (node: Element) => [...node.querySelectorAll('tbody tr')];
const figure = (doc: Document, id: string) => doc.querySelector(`[data-chart-id="${id}"]`)?.closest('figure');
const visibleCopy = (node: Element) => {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('script,style,template,details.evidence-trace').forEach(child => child.remove());
  return text(copy);
};
function checks(entries: Record<string, () => void>): void {
  const failures: string[] = [];
  for (const [name, check] of Object.entries(entries)) {
    try { check(); } catch (error) { failures.push(`${name}: ${(error as Error).message}`); }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
}
const noTechnical = (value: string) => assert.doesNotMatch(value, /NOT_STATED|UOC_TINH|SO_BO|CHINH_THUC|CPI_WORKBOOK|\b(?:II|III)\./u);
const basicRules = (html: string) => auditMarket14(html, undefined, { requireFlint: true }).map(({ rule, kind, ok }) => ({ rule, kind, ok }));
const exceptIcons = (rows: ReturnType<typeof basicRules>) => rows.filter(row => row.rule !== '11');

const contractRows: { item: string; line: number; check: (shape: GShape, rendered: Rendered) => void }[] = [
  { item: 'M13', line: 22, check(shape, { doc, input }) {
    if (shape === 'G3') {
      assert.equal(table(doc, MARK.trade), undefined);
      assert.equal(doc.querySelector('[data-chart-id^="M06.comtrade"]'), null); return;
    }
    const trade = needTable(doc, MARK.trade), copy = visibleCopy(wrap(trade));
    const rows = bodyRows(trade).map(cells);
    const amounts = shape === 'G1' ? ['5.130.001', '1.270.000', '6.543.211', '4.321.988', '1.234.568', '234.567', '12']
      : ['5.130.001', '1.270.000', '7.000.000', '2.000.000', '1.000.000'];
    checks({
      'Vietnamese scope, no automatic text': () => {
        assert.doesNotMatch(copy, /Synthetic commodity|mô tả chính thức|tiếng Anh|diễn giải tự động/iu);
        assert.match(copy, shape === 'G1' ? /Nhóm hàng mẫu/u : /Mã HS\s*888888/iu);
        assert.match(copy, /có thể rộng hơn/iu);
        assert.ok(copy.includes(COPY.scope)); assert.ok(copy.includes(COPY.scopeEstimate));
      },
      'whole USD, no added totals': () => {
        assert.equal(rows.length, amounts.length);
        assert.deepEqual(rows.map(row => row[3]?.replace(/\s*\[\d+\]/gu, '').trim()), amounts);
        assert.doesNotMatch(rows.map(row => row[3]).join(' '), /,\d/u);
      },
      'actual years by side': () => {
        assert.deepEqual(rows.slice(0, 2).map(row => row[2]), shape === 'G1' ? ['2022', '2022'] : ['2024', '2024']);
        assert.ok(rows.slice(2).every(row => row[2] === '2024'));
        assert.match(text(figure(doc, 'M06.comtrade.own')), shape === 'G1' ? /2022/u : /2024/u);
        assert.match(text(figure(doc, 'M06.comtrade.mirror')), /2024/u);
        if (shape === 'G2') {
          assert.equal(text(figure(doc, 'M06.comtrade.mirror')?.querySelector('.ext')), COPY.hsMirrorTitle);
          assert.equal(text(figure(doc, 'M06.comtrade.own')?.querySelector('.ext')), COPY.hsOwnTitle);
        }
        if (shape === 'G1') assert.doesNotMatch(copy, /cùng năm|cùng kỳ năm|so (?:với|sánh).*2024/iu);
      },
      'shown / retained reporters and unknown country': () => {
        if (shape === 'G1') {
          assert.ok(copy.includes(COPY.reporters(5, 7)));
          assert.equal(rows[6]![0], COPY.unknownCountry); assert.doesNotMatch(rows[6]![0]!, /999/u);
        } else assert.equal(rows.length - 2, 3);
      },
      'million USD chart labels and tiny positive': () => {
        for (const id of ['M06.comtrade.mirror', 'M06.comtrade.own']) {
          const f = figure(doc, id); assert.ok(f); assert.match(text(f), /triệu USD/u);
          const chart = text(f.querySelector('svg'));
          assert.doesNotMatch(chart, /\d,\d{2,}|\d\.\d{2,}/u);
          if (id.endsWith('own')) { assert.match(chart, /5,1/u); assert.match(chart, /1,3/u); }
          if (shape === 'G1' && id.endsWith('mirror')) {
            assert.match(chart, /6,5/u); assert.match(chart, /4,3/u); assert.match(chart, /1,2/u);
            assert.ok(chart.includes(COPY.tiny));
          }
        }
      },
      'stored raw trade': () => {
        assert.equal(input.collection!.comtrade!.officialDescription, shape === 'G1' ? 'Synthetic commodity alpha' : 'Synthetic commodity beta');
        assert.equal(input.collection!.comtrade!.rows[0]!.value, '5130000.55');
        assert.equal(input.collection!.comtrade!.reasonVi, G_SCOPE_LIMIT);
      },
    });
  } },
  { item: 'M18', line: 23, check(shape, { doc }) {
    if (shape === 'G3') { assert.equal(table(doc, MARK.official), undefined); assert.equal(table(doc, MARK.province), undefined); return; }
    const national = needTable(doc, MARK.official), province = needTable(doc, MARK.province);
    const n = visibleCopy(wrap(national)), p = visibleCopy(wrap(province));
    checks({
      'status only when meaningful; display labels only': () => {
        for (const row of bodyRows(national)) noTechnical(cells(row)[1]!);
        for (const row of bodyRows(province)) noTechnical(cells(row)[0]!);
        assert.doesNotMatch(n + p, /NOT_STATED|UOC_TINH|SO_BO|CHINH_THUC|CPI_WORKBOOK/u);
        if (shape === 'G1') assert.ok(![...national.querySelectorAll('th')].some(th => /trạng thái/iu.test(text(th))));
        else {
          assert.ok(text(bodyRows(national)[0]).includes(COPY.revised));
          assert.ok(!text(bodyRows(national)[1]).includes(COPY.revised));
        }
        for (const value of ['102,25', '108,75']) assert.match(n, new RegExp(value, 'u'));
        assert.match(n, /tháng trước/iu); assert.match(p, /tháng trước/iu);
      },
      'one identical displayed citation per table': () => {
        const source = text(wrap(province).querySelector('.ex-src'));
        assert.equal((source.match(/01\/10\/2026/gu) ?? []).length, shape === 'G1' ? 1 : 0);
        if (shape === 'G2') assert.equal((source.match(/08\/10\/2026/gu) ?? []).length, 1);
      },
      'listing dates are not publication; file dates stay separate': () => {
        const nationalSource = text(wrap(national).querySelector('.ex-src'));
        const provinceSource = text(wrap(province).querySelector('.ex-src'));
        assert.ok(nationalSource.includes(COPY.listing(shape === 'G1' ? 1 : 1, shape === 'G1' ? '01/10/2026' : '03/10/2026')));
        assert.ok(provinceSource.includes(COPY.listing(shape === 'G1' ? 1 : 2, shape === 'G1' ? '01/10/2026' : '08/10/2026')));
        assert.doesNotMatch(nationalSource + provinceSource, /(?:công bố|xuất bản)\s+\d/iu);
        assert.match(nationalSource, /(?:niêm yết|liệt kê|danh sách|đăng danh mục)/iu);
        assert.match(n, shape === 'G1' ? /01\/10\/2026/u : /03\/10\/2026/u);
        assert.match(p, shape === 'G1' ? /01\/10\/2026/u : /08\/10\/2026/u);
        if (shape === 'G2') {
          assert.doesNotMatch(p, /03\/10\/2026/u);
          assert.equal((nationalSource.match(/03\/10\/2026/gu) ?? []).length, 1);
          assert.equal((nationalSource.match(/08\/10\/2026/gu) ?? []).length, 1);
        }
      },
      'actual province subset with no inferred ranking': () => {
        assert.match(p, /Tỉnh mẫu A/u); assert.match(p, /Tỉnh mẫu B/u);
        assert.ok(p.includes(COPY.provinces));
        assert.match(p, /(?:có trong|được (?:ghi|liệt kê)|nguồn|bảng).*(?:tỉnh|địa phương)|(?:tỉnh|địa phương).*(?:nguồn|bảng)/iu);
        assert.doesNotMatch(p, /lớn nhất|hàng đầu|\btop\b/iu);
      },
    });
  } },
  { item: 'M19', line: 24, check(shape, { doc, input }) {
    const web = needTable(doc, MARK.web), rows = bodyRows(web), copy = visibleCopy(wrap(web));
    checks({
      'metadata display dates, no guessed unknowns': () => {
        const dateAt = [...web.querySelectorAll('th')].map(text).indexOf(COPY.dateHeader);
        assert.ok(dateAt >= 0);
        const dates = rows.map(row => cells(row)[dateAt]);
        if (shape === 'G2') {
          assert.deepEqual(dates, [COPY.unavailable, COPY.unavailable]);
          // Raw malformed source labels stay quoted; availability belongs to metadata.
          assert.ok([...web.querySelectorAll('q,[data-quote]')].some(quote => text(quote) === 'ngày không xác định'));
        } else {
          assert.deepEqual(dates, rows.map((_, i) => i % 2 ? '17/12/2025' : '15/12/2025'));
          assert.doesNotMatch(copy, /15 tháng 12, 2025|2025-12-17/u);
        }
        assert.doesNotMatch(copy, /2026-10-02T|\.678|\bZ\b|03:04:05/u);
        assert.ok(rows.every(row => text(row).includes(COPY.retrieved)));
        if (/\d{2}:\d{2}/u.test(copy)) { assert.match(copy, /10:04/u); assert.match(copy, /Việt Nam|UTC\+7|\+07:00/u); }
        // Metadata must not gain quote protection: titles keep their separate quote boundary.
        for (const quote of web.querySelectorAll('q,[data-quote]')) assert.doesNotMatch(text(quote), /^\d{2}\/\d{2}\/\d{4}$/u);
      },
      'retained groups, labelled basic query and explained gaps': () => {
        const titles = input.collection!.webResults!;
        assert.deepEqual(rows.map(row => Number(cells(row)[0])), titles.map(row => row.position));
        assert.match(copy + text(wrap(web).parentElement), /(?:hạng|vị trí|thứ tự).*(?:gốc|ban đầu|nguồn).*(?:trùng|gộp)|(?:trùng|gộp).*(?:hạng|vị trí|thứ tự)/iu);
        assert.ok(copy.includes(COPY.basic));
        assert.equal(text(wrap(web).nextElementSibling), COPY.webNote);
        assert.deepEqual([...web.querySelectorAll(WEB_GROUP)].map(group => group.getAttribute('aria-label')), shape === 'G1' ? [COPY.basic, COPY.window, 'Trên Shopee'] : [COPY.basic]);
        if (shape === 'G1') {
          assert.doesNotMatch(copy, /Trong kỳ báo cáo/u);
          assert.match(copy, /(?:yêu cầu|đã gửi|truy vấn)/iu);
          // A contiguous retained capture group must have a visible label or group header.
          const headers = [...web.querySelectorAll('thead th')].map(text);
          const index = headers.findIndex(head => /lượt tìm|nhóm|truy vấn/iu.test(head));
          assert.ok(index >= 0 || web.querySelectorAll('tbody').length >= 3, 'three retained origin/capture groups');
          if (index >= 0) assert.ok(rows.every(row => cells(row)[index]?.trim()), 'basic and extra groups labelled');
        }
      },
      'quoted title, link identity and stored ordering': () => {
        for (const row of input.collection!.webResults!) {
          assert.ok([...web.querySelectorAll('q,[data-quote]')].some(quote => text(quote) === row.title));
          assert.ok([...doc.querySelectorAll('a')].some(link => link.getAttribute('href') === row.url), row.url);
        }
      },
    });
  } },
  { item: 'L10', line: 25, check(shape, { doc, input }) {
    const geo = needTable(doc, MARK.geography), copy = visibleCopy(wrap(geo));
    checks({
      'basis and additivity together in geography note': () => {
        const note = text(wrap(geo).querySelector('.lim,.ex-note'));
        assert.match(note, /63 tỉnh.*2025/u); assert.ok(note.includes(COPY.geoNote));
        assert.equal([...doc.querySelectorAll('.sec-note')].filter(node => /^(?:Số liệu cho Việt Nam\.|Không cộng các dòng với nhau\.)$/u.test(text(node))).length, 0);
      },
      'explicit zero-province phrase': () => {
        const counts = bodyRows(geo).map(row => cells(row)[2]!);
        assert.equal(counts.length, 6);
        assert.ok(counts.every(count => !/^(?:0|không|none)$/iu.test(count)));
        if (shape === 'G1') assert.ok(counts.includes(COPY.zeroProvince));
        if (shape === 'G3') assert.ok(counts.every(count => /^[1-9]\d*$/u.test(count)));
      },
      'old-boundary alias and unmapped area do not invent allocations': () => {
        assert.match(copy, /2025/u);
        if (shape === 'G2') {
          assert.ok(input.collection!.searchGeo!.provinces.some(row => row.name === 'Tỉnh Thanh Hoá'));
          assert.ok(input.collection!.searchGeo!.provinces.some(row => row.name === 'Khu vực mẫu sáp nhập'));
          assert.match(text(geo.closest('section')), /chưa.*(?:gán|xếp|xác định)|không.*(?:gán|khớp|xác định)|chưa có vùng/iu);
          assert.doesNotMatch(copy, /Khu vực mẫu sáp nhập/u);
        }
      },
    });
  } },
  { item: 'M14-ads', line: 26, check(shape, { doc, input }) {
    if (shape === 'G3') { assert.equal(table(doc, MARK.ads), undefined); return; }
    const ads = needTable(doc, MARK.ads), area = wrap(ads), copy = visibleCopy(area);
    const row = (label: string) => [...area.querySelectorAll('tr,p')].find(node => text(node).includes(label));
    checks({
      'known zero and unknown metric differ': () => {
        const zero = row('Nhãn mẫu A'); assert.ok(zero);
        assert.ok(text(zero).includes(COPY.zeroAds));
        assert.ok([...ads.querySelectorAll('th')].some(th => text(th) === COPY.adsHeader));
        if (shape === 'G1') {
          const unknown = row('Nhãn mẫu ngoài'); assert.ok(unknown);
          assert.ok(text(unknown).includes(COPY.unknownAds));
          assert.doesNotMatch(text(unknown), /không có (?:mẫu )?quảng cáo|không ghi nhận quảng cáo/iu);
          assert.notEqual(cells(zero)[2], cells(unknown)[2]);
        } else assert.match(text(row('Nhãn mẫu B')), /\b3\b/u);
      },
      'failure shown distinctly, selection and membership disclosed': () => {
        assert.ok(copy.includes(COPY.adsSelection));
        if (shape === 'G1') {
          const failure = row('Nhãn mẫu lỗi'); assert.ok(failure, 'failed state is in the ads evidence block');
          assert.ok(text(failure).includes(COPY.failedAds));
          assert.doesNotMatch(text(failure), /không có (?:mẫu )?quảng cáo/iu);
          assert.ok(text(row('Nhãn mẫu ngoài')).includes(COPY.outside));
        } else assert.doesNotMatch(copy, /ngoài mẫu/u);
      },
      'retained brand order and metrics': () => {
        assert.deepEqual(input.collection!.searchAds!.brands.map(brand => brand.creativeCount), shape === 'G1' ? [0, null, null] : [0, 3]);
      },
    });
  } },
  { item: 'L15', line: 27, check(shape, { doc, input }) {
    checks({
      'verbatim quoted titles have no icons': () => {
        assert.equal(doc.querySelectorAll('q .pi,blockquote .pi,[data-quote] .pi').length, 0);
        for (const row of input.collection!.webResults!) assert.ok([...doc.querySelectorAll('q,[data-quote]')].some(quote => text(quote) === row.title));
        if (shape === 'G1') assert.ok([...doc.querySelectorAll('q')].some(quote => quote.textContent === G_QUOTED_TITLE));
        if (shape === 'G3') assert.equal([...doc.querySelectorAll('q,[data-quote]')].filter(quote => /Shopee|TikTok/u.test(text(quote))).length, 0);
      },
      'authored labels retain icons; SVG untouched': () => {
        assert.ok(doc.querySelectorAll('i.pi.s').length > 0); assert.ok(doc.querySelectorAll('i.pi.t').length > 0);
        assert.equal(doc.querySelectorAll('svg .pi').length, 0);
        assert.ok(doc.querySelectorAll('svg').length >= 3);
      },
    });
  } },
  { item: 'L11', line: 28, check(shape, { doc }) {
    if (shape === 'G3') { assert.equal(table(doc, MARK.macro), undefined); assert.equal(doc.querySelector('[data-chart-id^="M05.world-bank"]'), null); return; }
    const macro = needTable(doc, MARK.macro), headers = [...macro.querySelectorAll('th')].map(text), rows = bodyRows(macro).map(cells);
    checks({
      'empty note column omitted; substantive note retained': () => {
        const index = headers.findIndex(head => /ghi chú.*nguồn/iu.test(head));
        if (shape === 'G1') assert.equal(index, -1);
        else { assert.ok(index >= 0); assert.equal(rows[0]![index], G_FOOTNOTE); assert.equal(rows[1]![index], ''); }
        assert.doesNotMatch(visibleCopy(wrap(macro)), /nguồn chưa ghi chú/u);
      },
      'institution and license': () => {
        const copy = visibleCopy(doc.body);
        assert.ok(copy.includes(COPY.macroSource));
        assert.doesNotMatch(copy, /World Bank|Open Data/u);
      },
      'scope phrase appears once, other parenthetical and unscoped behaviour retained': () => {
        const figures = [...doc.querySelectorAll('[data-chart-id^="M05.world-bank"]')].map(chart => chart.closest('figure')!);
        assert.equal(figures.length, 2);
        const title0 = text(figures[0]!.querySelector('.ext')), title1 = text(figures[1]!.querySelector('.ext'));
        assert.equal(title0, COPY.macroTitle(G_MACRO_NAMES[0], true)); assert.equal(title1, COPY.macroTitle(G_MACRO_NAMES[1], false));
        assert.equal((title0.match(/toàn quốc|cả nước/giu) ?? []).length, 1);
        assert.match(title1, /cả nước Việt Nam/u);
        assert.deepEqual(rows.map(row => row[0]), [...G_MACRO_NAMES]);
        assert.ok(rows.every(row => row.some(cell => /123,5.*điểm mẫu/u.test(cell))));
      },
    });
  } },
];

// One table-driven test per contract row and shape; all 32 cases stay live after binding.
for (const { item, line, check } of contractRows) for (const shape of G_SHAPES) {
  test(`[contract ${line}] ${item}/${shape} current reader and keep-list`, async () => check(shape, await render(shape)));
}

test('[contract 10,22–28] stored step evidence retains raw values, dates, ranks and coordinates', async () => {
  for (const shape of G_SHAPES) {
    const { input, before } = await render(shape);
    assert.equal(JSON.stringify(input.collection), before, `${shape}: public build mutated retained evidence`);
    assert.deepEqual(input.collection!.webResults!.map(row => row.position), shape === 'G1' ? [1, 3, 1, 3, 1, 3] : [1, 3]);
    assert.ok(input.collection!.webResults!.every(row => row.retrievedAt === G_RETRIEVED));
    if (shape === 'G2') assert.deepEqual(input.collection!.webResults!.map(row => row.published), ['ngày không xác định', null]);
    else assert.deepEqual(input.collection!.webResults!.slice(0, 2).map(row => row.published), ['15 tháng 12, 2025', '2025-12-17']);
    if (shape === 'G3') continue;
    const trade = input.collection!.comtrade!, official = input.collection!.officialStats!;
    assert.equal(trade.rows[0]!.value, '5130000.55'); assert.equal(trade.hsCode, shape === 'G1' ? '999999' : '888888');
    assert.equal(trade.officialDescription, shape === 'G1' ? 'Synthetic commodity alpha' : 'Synthetic commodity beta');
    assert.deepEqual(official.values.map(row => row.label), [...G_OFFICIAL_LABELS]);
    assert.equal(official.values[0]!.base, 'tháng trước'); assert.equal(official.values[0]!.cell, 'C14');
    assert.equal(official.values[0]!.value, '102.25'); assert.equal(official.values[0]!.status, 'NOT_STATED');
    assert.deepEqual(official.files.map(file => file.listedAt), shape === 'G1' ? ['2026-10-01T00:00:00'] : ['2026-10-03T00:00:00', '2026-10-08T00:00:00']);
    assert.equal(official.provinces!.values[0]!.cell, 'B9');
    assert.equal(input.collection!.worldBank!.indicators[0]!.row!.indicatorName, G_MACRO_NAMES[0]);
  }
});

test('[contract 9,16,27] all machine rules pass; every non-icon rule matches main on all full reports', async () => {
  const main = JSON.parse(await readFile(new URL('../fixtures/package-g-evidence-main-audit.json', import.meta.url), 'utf8')) as Record<GShape, ReturnType<typeof basicRules>>;
  for (const shape of G_SHAPES) {
    const built = await render(shape);
    assert.deepEqual(exceptIcons(basicRules(built.html)), exceptIcons(main[shape]), shape);
    assertMarket14MachineRules(built.html, built.trace, { requireFlint: true });
  }
});

test('[contract 27d] negative control: an authored platform mention without an icon still fails rule 11', async () => {
  for (const shape of G_SHAPES) {
    const { html } = await render(shape);
    for (const attrs of ['', 'title=" data-quote "', 'data-label=" data-quote "']) {
      const missing = html.replace('</main>', `<p id="g-missing-icon" ${attrs}>Shopee</p></main>`);
      assert.equal(basicRules(missing).find(rule => rule.rule === '11')!.ok, false, `${shape}: ${attrs}`);
      assert.deepEqual(exceptIcons(basicRules(missing)), exceptIcons(basicRules(html)));
    }
  }
});

test('[contract 27a,b] a quote-attribute name inside another attribute value does not suppress authored icons', () => {
  for (const attrs of ['title=" data-quote "', "data-label=' data-quote '"]) {
    const result = platIcons(`<style></style><p ${attrs}>Shopee và TikTok Shop</p>`, { shopee: 'red', tiktok: 'black' }, undefined,
      { compoundPlatformLabels: true, preserveQuotes: true });
    const dom = new JSDOM(result.html);
    try { assert.equal(dom.window.document.querySelectorAll('p .pi').length, 2); }
    finally { dom.window.close(); }
  }
});

test('[contract 27d] defect detector: quote-only icon removal does not fail the checker', async () => {
  const { html } = await render('G1');
  const quotedIcons = '<q><i class="pi s">Shopee</i></q><blockquote><i class="pi t">TikTok Shop</i></blockquote><span data-quote><i class="pi s">Shopee</i></span>';
  const withIcons = html.replace('</main>', `${quotedIcons}</main>`), dom = new JSDOM(withIcons);
  try {
    const icons = dom.window.document.querySelectorAll('q .pi,blockquote .pi,[data-quote] .pi');
    assert.equal(icons.length, 3, 'the negative control must remove actual quote icons');
    assert.equal(basicRules(withIcons).find(rule => rule.rule === '11')!.ok, true);
    for (const icon of icons) icon.replaceWith(...icon.childNodes);
    const protectedQuotes = dom.serialize();
    assert.equal(basicRules(protectedQuotes).find(rule => rule.rule === '11')!.ok, true);
    assert.deepEqual(exceptIcons(basicRules(protectedQuotes)), exceptIcons(basicRules(html)));
  } finally { dom.window.close(); }
});

test('[contract 27a–c] defect detector: nested q, blockquote, data-quote and SVG through public builder', async () => {
  const input = gWithQuoteContexts((await render('G1')).input);
  const built = buildCurrentReader(input), dom = new JSDOM(built.html.toString()), original = new JSDOM(G_QUOTE_CONTEXTS);
  try {
    checks({
      'quote containers byte-equivalent after escaping/HTML serialization': () => {
        for (const id of ['g-q', 'g-block', 'g-data', 'g-nested']) {
          assert.equal(dom.window.document.getElementById(id)?.outerHTML, original.window.document.getElementById(id)!.outerHTML);
        }
      },
      'authored icon and valid SVG namespace': () => {
        assert.equal(dom.window.document.querySelectorAll('#g-authored .pi').length, 2);
        for (const id of ['g-svg-axis', 'g-svg-legend']) {
          const node = dom.window.document.getElementById(id); assert.ok(node);
          assert.equal(node.namespaceURI, 'http://www.w3.org/2000/svg'); assert.equal(node.querySelector('.pi'), null);
        }
      },
    });
  } finally { dom.window.close(); original.window.close(); }
});

test('[contract 26a] defect detector: unchecked and no-website states stay distinct from checked zero', async () => {
  const base = (await render('G1')).input, ads = gAdsUnchecked();
  const built = buildCurrentReader({ ...base, collection: { ...base.collection!, searchAds: ads } });
  const dom = new JSDOM(built.html.toString());
  try {
    const block = wrap(needTable(dom.window.document, MARK.ads));
    for (const [label, pattern] of [['Nhãn mẫu chưa kiểm', COPY.skippedAds], ['Nhãn mẫu thiếu trang', COPY.noSiteAds]] as const) {
      const row = [...block.querySelectorAll('tr')].find(node => text(node).includes(label));
      assert.ok(row, `${label} is an explicit table state`); assert.ok(text(row).includes(pattern));
      assert.doesNotMatch(text(row), /không có (?:mẫu )?quảng cáo/iu);
    }
    assert.deepEqual(ads.brands.map(brand => brand.status), ['OK', 'CANCELLED', 'SKIPPED_NO_DOMAIN']);
  } finally { dom.window.close(); }
});

test('[contract 24a] malformed ISO publication metadata never becomes a guessed date', async () => {
  const base = (await render('G3')).input;
  for (const published of ['2026-10-02Tbad', '2026-10-02T99:99:99Z', '2026-10-02T', '2026-02-30']) {
    const webResults = base.collection!.webResults!.map(row => ({ ...row, published }));
    const built = buildCurrentReader({ ...base, collection: { ...base.collection!, webResults } });
    const dom = new JSDOM(built.html.toString());
    try {
      const web = needTable(dom.window.document, MARK.web);
      const dateAt = [...web.querySelectorAll('th')].map(text).indexOf(COPY.dateHeader);
      assert.ok(dateAt >= 0);
      assert.ok(bodyRows(web).every(row => cells(row)[dateAt] === COPY.unavailable), published);
      assert.ok(webResults.every(row => row.published === published));
    } finally { dom.window.close(); }
  }
});

test('[contract 10,24,27] unsafe source titles are withheld whole rather than rewritten inside quotes', async () => {
  const base = (await render('G3')).input;
  for (const title of ['Mẫu CORE Shopee -- 2025-12-15', 'Mẫu UNKNOWN Shopee', 'Mẫu shop_label Shopee', 'Mẫu M05 Shopee']) {
    const webResults = base.collection!.webResults!.map(row => ({ ...row, title }));
    const built = buildCurrentReader({ ...base, collection: { ...base.collection!, webResults } });
    const dom = new JSDOM(built.html.toString());
    try {
      const web = needTable(dom.window.document, MARK.web);
      assert.ok(bodyRows(web).every(row => cells(row)[1] === 'Tiêu đề được giữ trong bản lưu nguồn'));
      assert.equal(web.querySelectorAll('q').length, webResults.length, 'only the unchanged site names remain quoted');
      assert.ok([...web.querySelectorAll('q')].every(quote => text(quote) === 'Trang mẫu'));
      assert.ok(webResults.every(row => row.title === title));
    } finally { dom.window.close(); }
  }
});

test('[contract 22] HS-only trade is disclosed in the current used-source list', async () => {
  const { doc } = await render('G2');
  const sources = [...doc.querySelectorAll('.pl-srclist li')].map(text);
  assert.match(sources.join(' '), /Cơ sở dữ liệu thương mại của Liên Hợp Quốc/u);
});

test('[contract 23a] preliminary and estimated status facts stay on their own row', async () => {
  const base = (await render('G1')).input, original = base.collection!.officialStats!;
  const officialStats = { ...original, values: original.values.map((row, i) => ({ ...row,
    status: i ? 'UOC_TINH' as const : 'SO_BO' as const })) };
  const built = buildCurrentReader({ ...base, collection: { ...base.collection!, officialStats } });
  const dom = new JSDOM(built.html.toString());
  try {
    const rows = bodyRows(needTable(dom.window.document, MARK.official));
    assert.match(text(rows[0]), /sơ bộ/iu); assert.doesNotMatch(text(rows[0]), /ước tính/iu);
    assert.match(text(rows[1]), /ước tính/iu); assert.doesNotMatch(text(rows[1]), /sơ bộ/iu);
    assert.doesNotMatch(text(rows[0]) + text(rows[1]), /SO_BO|UOC_TINH/u);
  } finally { dom.window.close(); }
});

test('[contract 28a,c] defect detector: no-note placeholder and uppercase nationwide qualifier', async () => {
  const base = (await render('G1')).input, original = base.collection!.worldBank!;
  for (const name of ['Chỉ số mẫu CẢ NƯỚC (phạm vi mẫu)', 'Chỉ số mẫu ToÀn QuỐc (phạm vi mẫu)']) {
    const worldBank = { ...original, indicators: original.indicators.map((indicator, i) => ({ ...indicator,
      row: { ...indicator.row!, indicatorName: i ? G_MACRO_NAMES[1] : name, footnote: 'nguồn chưa ghi chú' } })) };
    const charts = await bindMacroCharts(worldBank);
    const built = buildCurrentReader({ ...base, collection: { ...base.collection!, worldBank }, worldBankCharts: charts });
    const dom = new JSDOM(built.html.toString());
    try {
      const macro = needTable(dom.window.document, MARK.macro);
      assert.ok(![...macro.querySelectorAll('th')].some(th => /ghi chú.*nguồn/iu.test(text(th))));
      const title = text(figure(dom.window.document, 'M05.world-bank.SP.POP.TOTL')?.querySelector('.ext'));
      assert.ok(title.includes(name)); assert.equal((title.match(/toàn quốc|cả nước/giu) ?? []).length, 1);
    } finally { dom.window.close(); }
  }
});

for (const [name, kind] of [['legacy-market', 'MARKET'], ['insight', 'INSIGHT']] as const) {
  test(`[contract 6,7,27] ${name} byte baseline`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse(G_CLOCK) });
    const expected = await readFile(new URL(`../fixtures/package-g-evidence-${name}.html`, import.meta.url));
    assert.deepEqual(buildResearchAutomationReport(await gByteInput(), kind).html, expected);
  });
}
test('[contract 6,7,22] versioned market-template shared trade helpers byte baseline', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(G_CLOCK) });
  const raw = sync1ReaderFixture('1.4.0'); raw.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const built = await buildMarketReport(computeReaderReportData(raw), {
    limitations: ['Nguồn bán hàng là số ước tính.'], builtOn: '19/10/2026', flint: false, comtrade: gTrade('G1'),
  });
  assert.deepEqual(Buffer.from(built.html), await readFile(new URL('../fixtures/package-g-evidence-versioned-market.html', import.meta.url)));
});

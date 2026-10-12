import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import type { AutomationMarketPresentationMethod } from '../../contracts/analysis/automation-market-presentation-method.generated.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { renderAutomationMarketUnitPrices } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import { quoteMethodSection } from '../../src/modules/analysis/research-automation/quote-method-report.js';
import type { AutomationQuoteMethodSnapshot } from '../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import {
  formatReaderNumber, formatReaderValue, readerDateBasis, readerJsonLiteral, readerLocator, readerMeasureName,
  readerExactNumber, readerMethodName, readerPriceState, readerProductLabel, readerQuoteLabel, readerQuotePriceState,
  readerQuoteRange, readerQuoteValueState, readerStoredOrJson, readerScopeText,
} from '../../src/modules/analysis/research-automation/reader-plain-text.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

const ORIGIN_QUOTE_BYTES = "<p class=\"warning\">Tính từ bản ghi có cấu trúc đã lưu, không tự suy quy cách từ tên sản phẩm. Kiểm tra này chứng minh phép tính và sự khớp trường, không xác nhận nội dung của trang bán hàng, giao dịch hay việc người dùng đã duyệt. Không tính chi phí, lợi nhuận hoặc xếp hạng chào bán.</p><p>Gói đã chọn không có bản ghi giá.</p><p>Số hiển thị làm tròn đến hai chữ số thập phân theo half-even; phân số chính xác được giữ riêng. Giá có điều kiện không trở thành giá thanh toán vô điều kiện.</p>";
const ORIGIN_QUOTE_NONEMPTY_BYTES = "<p class=\"warning\">Tính từ bản ghi có cấu trúc đã lưu, không tự suy quy cách từ tên sản phẩm. Kiểm tra này chứng minh phép tính và sự khớp trường, không xác nhận nội dung của trang bán hàng, giao dịch hay việc người dùng đã duyệt. Không tính chi phí, lợi nhuận hoặc xếp hạng chào bán.</p><h3>capture-12-unit-price</h3><p>1 item. Giá niêm yết: 85991856.58 VND.</p>\n      <p>Biến thể: UNKNOWN. Điều kiện: Không có điều kiện được ghi trong nguồn; chưa xác nhận vô điều kiện. Thuế: UNKNOWN; vận chuyển: UNKNOWN.</p>\n      <p>Thời điểm quan sát: Chưa xác định, không coi là giá hiện tại. Thời điểm thu nhận được khai báo: 2026-01-01T00:00:00Z.</p>\n      <div class=\"table-wrap\" role=\"region\" aria-label=\"Phép tính giá chào bán 1\" tabindex=\"0\"><table><caption>Giá theo từng cơ sở, giữ riêng khối lượng tịnh và ráo</caption><thead><tr><th scope=\"col\">Cơ sở</th><th scope=\"col\">Kết quả</th><th scope=\"col\">Điều kiện và phần thiếu</th></tr></thead><tbody><tr><th scope=\"row\">Mỗi gói mua</th><td>1234567.89 VND<br><small>Giá trị chính xác: 1234567 / 100</small></td><td>Từ trường trong bản ghi nguồn, chưa xác minh thực tế</td></tr><tr><th scope=\"row\">Mỗi món hàng</th><td>1234567.89 VND<br><small>Giá trị chính xác: 1234567 / 100</small></td><td>Từ trường trong bản ghi nguồn, chưa xác minh thực tế</td></tr><tr><th scope=\"row\">Mỗi 100 g tịnh</th><td>1234567.89 VND<br><small>Giá trị chính xác: 1234567 / 100</small></td><td>Từ trường trong bản ghi nguồn, chưa xác minh thực tế</td></tr><tr><th scope=\"row\">Mỗi 100 g ráo</th><td>1234567.89 VND<br><small>Giá trị chính xác: 1234567 / 100</small></td><td>Từ trường trong bản ghi nguồn, chưa xác minh thực tế</td></tr></tbody></table></div>\n      <p>Nguồn: [1]. Xuất xứ khai báo trong gói: synthetic; Synthetic source. <a href=\"#quote-method-evidence\">Xem trường nguồn và phép tính tại M13</a>.</p><p>Số hiển thị làm tròn đến hai chữ số thập phân theo half-even; phân số chính xác được giữ riêng. Giá có điều kiện không trở thành giá thanh toán vô điều kiện.</p>";
const ORIGIN_METRIC_BYTES = "<dl class=\"reader-context\"><dt>Nguồn / nền tảng</dt><dd>Nền tảng shopee. Bản xuất do người vận hành cung cấp; chưa xác minh độc lập nguồn gốc thu thập của nhà cung cấp.</dd><dt>Kỳ số liệu thực tế</dt><dd>2026-08-17 đến 2026-09-15</dd><dt>Căn cứ sử dụng kỳ đo</dt><dd>Theo kỳ khai báo của tệp nguồn, không tự kéo dài hoặc chia tỷ lệ để khớp kỳ yêu cầu. Nội dung khai báo nguyên văn nằm trong hồ sơ đối chiếu bên dưới.</dd><dt>Thời điểm thu nguồn</dt><dd>2026-09-16T00:00:00Z</dd></dl><p class=\"reader-summary\">Mẫu số liệu này gồm 5 bản ghi sản phẩm của 3 gian hàng. Doanh thu quan sát là 185 VND, tính trên các dòng có số liệu trong kỳ nguồn khai báo. Đây là tổng của mẫu xuất, không phải ước tính quy mô toàn thị trường. Số bản ghi không nhất thiết là số sản phẩm hoặc biến thể riêng biệt.</p><p class=\"warning\">Đây là mẫu sản phẩm xuất theo từ khóa, chưa phải thị trường đã phân loại. Toàn bộ mẫu (ALL) gồm cả hàng ngoài phạm vi và hàng chưa rõ. Không dùng tổng mẫu làm quy mô toàn ngành, không cộng với nguồn sàn khác hoặc các phạm vi WIDE/CORE. Các phạm vi lồng nhau không được cộng thành tổng.</p><p><strong>Phương pháp chuyên biệt M03:</strong> Chưa đủ điều kiện. Phép tính mẫu dưới đây không thay thế toàn bộ yêu cầu của mục này.</p><div class=\"table-wrap\" role=\"region\" aria-label=\"Tổng trong mẫu xuất, giữ nguyên các dòng nguồn\" tabindex=\"0\"><table><caption>Tổng trong mẫu xuất, giữ nguyên các dòng nguồn</caption><thead><tr><th scope=\"col\">Phạm vi</th><th scope=\"col\">Bản ghi sản phẩm</th><th scope=\"col\">Gian hàng</th><th scope=\"col\">Doanh thu quan sát</th><th scope=\"col\">Sản lượng nguồn</th><th scope=\"col\">Nguồn</th></tr></thead><tbody><tr><th scope=\"row\">Toàn bộ mẫu xuất (ALL)</th><td>5</td><td>3</td><td>185 VND<br><small>5 dòng có số liệu; 0 dòng thiếu; 0 dòng chưa được xác nhận có độ chính xác tuyệt đối.</small></td><td>23 đơn vị nguồn<br><small>5 dòng có số liệu; 0 dòng thiếu; 0 dòng chưa được xác nhận có độ chính xác tuyệt đối.</small></td><td>[1]</td></tr><tr><th scope=\"row\">Phạm vi rộng (WIDE)</th><td>4</td><td>2</td><td>175 VND<br><small>4 dòng có số liệu; 0 dòng thiếu; 0 dòng chưa được xác nhận có độ chính xác tuyệt đối.</small></td><td>22 đơn vị nguồn<br><small>4 dòng có số liệu; 0 dòng thiếu; 0 dòng chưa được xác nhận có độ chính xác tuyệt đối.</small></td><td>[1]</td></tr><tr><th scope=\"row\">Phạm vi cốt lõi (CORE)</th><td>2</td><td>1</td><td>150 VND<br><small>2 dòng có số liệu; 0 dòng thiếu; 0 dòng chưa được xác nhận có độ chính xác tuyệt đối.</small></td><td>15 đơn vị nguồn<br><small>2 dòng có số liệu; 0 dòng thiếu; 0 dòng chưa được xác nhận có độ chính xác tuyệt đối.</small></td><td>[1]</td></tr></tbody></table></div><p>Không quy đổi sản lượng nguồn thành kg, số gói, số người mua hoặc doanh số từng biến thể.</p><details class=\"evidence-trace\"><summary>Đối chiếu các dòng sản phẩm gốc</summary><div class=\"table-wrap\" role=\"region\" aria-label=\"Tối đa 10 dòng đầu theo thứ tự nguồn, không phải bảng xếp hạng\" tabindex=\"0\"><table><caption>Tối đa 10 dòng đầu theo thứ tự nguồn, không phải bảng xếp hạng</caption><thead><tr><th scope=\"col\">Mã sản phẩm / gian hàng</th><th scope=\"col\">Tên theo nguồn</th><th scope=\"col\">Doanh thu kỳ (VND)</th><th scope=\"col\">Sản lượng kỳ (đơn vị nguồn)</th><th scope=\"col\">Nguồn</th></tr></thead><tbody><tr><td>L1<br>Gian hàng S1</td><td>Synthetic L1</td><td>100</td><td>10</td><td>[1]<br>[1]</td></tr><tr><td>L2<br>Gian hàng S1</td><td>Synthetic L2</td><td>50</td><td>5</td><td>[1]<br>[1]</td></tr><tr><td>L3<br>Gian hàng S2</td><td>Synthetic L3</td><td>25</td><td>5</td><td>[1]<br>[1]</td></tr><tr><td>L4<br>Gian hàng S2</td><td>Synthetic L4</td><td>0</td><td>2</td><td>[1]<br>[1]</td></tr><tr><td>L5<br>Gian hàng S3</td><td>Synthetic L5</td><td>10</td><td>1</td><td>[1]<br>[1]</td></tr></tbody></table></div><p>Hiển thị 5/5 dòng; toàn bộ dòng, giá trị thiếu, độ chính xác và vị trí nguồn được giữ trong hồ sơ tính đã lưu.</p></details><details class=\"evidence-trace\"><summary>Hồ sơ đối chiếu: khai báo gốc, phương pháp và giới hạn</summary><p>Chuẩn hóa từ ô bảng tính; không dùng một tổng số nhập sẵn thay cho các dòng nguồn.</p><dl><dt>Cơ sở kỳ đo, nguyên văn</dt><dd>Synthetic declared period</dd><dt>Phương pháp / làm tròn</dt><dd><span>Phép tính trên mẫu số liệu đã lưu, phiên bản 1</span> · <span>Làm tròn tỷ lệ phần trăm tới 2 chữ số thập phân (nửa về số chẵn)</span></dd><dt>Bản kê nguồn</dt><dd><code>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</code></dd></dl><ul></ul><p>Đầu vào tính: <code>07e3404e03ebbde390b122bd1777d15018b2435398f29d377e55433c3586b4fb</code>. Biên nhận chuẩn hóa: <code>cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc</code>.</p></details>";
const ORIGIN_MARKET_PRESENTATION_BYTES = "<p>Chưa có biên nhận quy cách và giá tương thích đã xác minh cho bản nháp này. Chưa tính giá theo đơn vị chuẩn; không đoán số lượng từ tiêu đề.</p><p>Giá hiển thị tối đa ba chữ số thập phân; sắp xếp theo giá trị chưa làm tròn. Chỉ sắp xếp cùng sàn, ngành hàng, đơn vị hoặc cơ sở, nhóm quy cách, loại giá, điều kiện và kỳ. Khối lượng tịnh và khối lượng cái giữ riêng; hàng dùng lâu và combo không chia nhỏ. Kỳ quan sát giá giữ riêng với kỳ doanh số.</p><p>Giá niêm yết, thanh toán và khuyến mãi có điều kiện giữ riêng; không thay bằng giá bán trung bình từ doanh thu và đơn vị bán. Đối chiếu khai báo với bản lưu không xác thực người bán; không suy chất lượng, giá vốn hoặc lợi nhuận.</p><div class=\"market-advertising-reference\"><h4>Chỉ số quảng cáo tham khảo</h4><p>Kỳ: chưa xác định trong bản lưu · Đối tượng: video: chưa xác định trong đầu vào Market.</p><ul><li>ROAS: chưa khả dụng · Lý do: Chưa có trường ROAS hoặc CPA với nguồn và ngữ nghĩa đã xác nhận; đầu vào Market chưa có trường chi phí quảng cáo và số đơn đã xác nhận</li><li>CPA: chưa khả dụng · Lý do: Chưa có trường ROAS hoặc CPA với nguồn và ngữ nghĩa đã xác nhận; đầu vào Market chưa có trường chi phí quảng cáo và số đơn đã xác nhận</li></ul><p class=\"warning\">Đây là số ước tính tham khảo theo cùng một nguồn và kỳ; không suy ra lợi nhuận hoặc “có lãi”, không so sánh kênh và không trộn với số liệu bán hàng từ nguồn khác.</p></div><p>Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế.</p>";

test('reader plain text formats exact numbers without float conversion', () => {
  assert.equal(formatReaderNumber('85991856.58', 'money'), '85.991.857');
  assert.equal(formatReaderNumber('183248.41', 'money'), '183.248');
  assert.equal(formatReaderNumber('127792.55', 'decimal'), '127.792,55');
  assert.equal(formatReaderNumber('9007199254740993.25', 'money'), '9.007.199.254.740.993');
  assert.equal(formatReaderNumber('-1234567.5', 'money'), '-1.234.568');
  assert.equal(formatReaderNumber('1.235', 'decimal'), '1,24');
  assert.equal(formatReaderNumber('9.999', 'decimal'), '10');
  assert.equal(formatReaderNumber('0.995', 'decimal'), '1');
  assert.equal(formatReaderNumber('-0.004', 'decimal'), '0');
  assert.equal(formatReaderNumber('1.2e5', 'decimal'), '120.000');
  assert.equal(formatReaderNumber('-3E-2', 'decimal'), '-0,03');
  assert.equal(formatReaderNumber('9.999', 'money'), '10');
  assert.equal(formatReaderNumber('9.999', 'count'), '10');
  assert.equal(formatReaderNumber('0', 'count'), '0');
  assert.equal(formatReaderNumber(null, 'money'), null);
  assert.equal(formatReaderValue('7082', { measure: 'sales_volumn' }), '7.082');
  assert.equal(formatReaderValue('111598280.07', { measure: 'revenue', unit: 'VND' }), '111.598.280');
});

test('reader plain text maps measures, JSON literals, prices, scope and locators', () => {
  assert.equal(readerMeasureName('revenue'), 'Doanh thu');
  assert.equal(readerMeasureName('sales_volumn'), 'Sản lượng bán');
  assert.equal(readerMeasureName('sales_volume'), 'Sản lượng bán');
  assert.equal(readerMeasureName('untrusted_field'), 'chỉ số nguồn');
  assert.equal(readerJsonLiteral('{"revenue":111598280.07}'), 'Doanh thu: 111.598.280');
  assert.equal(readerJsonLiteral('{"revenue":9007199254740993.25}'), 'Doanh thu: 9.007.199.254.740.993');
  assert.equal(readerJsonLiteral('{"sales_volumn":7082}'), 'Sản lượng bán: 7.082');
  assert.equal(readerJsonLiteral('{"launch_date":"2024-08-31"}'), 'ngày ra mắt do nguồn khai báo: 2024-08-31');
  assert.equal(readerJsonLiteral('{"broken": [1, 2]}'), 'Giá trị nguồn được giữ trong bản lưu');
  assert.equal(readerPriceState('NON_EXACT'), 'giá ước tính, chưa chính xác tuyệt đối');
  assert.equal(readerPriceState('REPORTED_NON_EXACT'), 'nguồn ghi giá không chính xác tuyệt đối');
  assert.equal(readerPriceState('RANGE'), 'khoảng giá');
  assert.equal(readerPriceState('MISSING'), 'không có giá');
  assert.equal(readerPriceState('UNREADABLE'), 'không đọc được giá');
  assert.equal(readerPriceState('OBSERVED_ZERO'), 'giá ghi nhận bằng 0');
  assert.equal(readerPriceState('EXACT'), 'giá chính xác');
  assert.equal(readerPriceState('FUTURE'), 'trạng thái giá chưa rõ');
  assert.equal(readerQuoteLabel('capture-12-unit-price', 1), 'Bản ghi giá #12 · giá đơn vị');
  assert.equal(readerQuoteLabel('capture-40-price-range', 1), 'Bản ghi giá #40 · khoảng giá');
  assert.equal(readerQuotePriceState('LISTED'), 'giá niêm yết');
  assert.equal(readerQuoteValueState('UNKNOWN'), 'chưa rõ');
  assert.equal(readerQuoteRange('127792.55', '132237.87', 'VND'), '127.793 đến 132.238');
  assert.equal(readerExactNumber('9007199254740993'), '9.007.199.254.740.993');
  assert.equal(readerScopeText('Source-declared M05 observation scope; not a market universe.'), 'Phạm vi quan sát do nguồn khai báo; không phải toàn bộ thị trường.');
  assert.equal(readerScopeText('Source text not approved'), 'Phạm vi và nội dung được giữ trong bản lưu nguồn');
  assert.equal(readerScopeText('Synthetic area'), 'Phạm vi và nội dung được giữ trong bản lưu nguồn');
  assert.equal(readerLocator('/data/revenue'), 'mục Doanh thu');
  assert.equal(readerLocator('/data/sales_volumn'), 'mục Sản lượng bán');
  assert.equal(readerLocator('/data/launch_date'), 'mục dữ liệu nguồn');
  assert.equal(readerMethodName('M05'), 'Nhu cầu');
  assert.equal(readerDateBasis('Ngày do nguồn khai báo tại launch_date, không phải ngày thu thập.'), 'Ngày do nguồn khai báo (ngày ra mắt theo nguồn), không phải ngày thu thập.');
  assert.equal(readerProductLabel('kalodata:sku_101', 'Bình giữ nhiệt tổng hợp'), 'Bình giữ nhiệt tổng hợp');
  assert.equal(readerProductLabel('123456', null, 2), 'Sản phẩm #2');
});

test('visible reader text uses quote and metric render paths without raw IDs or states', () => {
  const sourceSha256 = 'a'.repeat(64);
  const quoteInput = {
    quoteId: 'capture-12-unit-price', source: { sourceSha256, locator: '/offer/price', fieldPointer: '/offer/price' }, acquiredAt: '2026-01-01T00:00:00Z', observedAt: null,
    identity: { variantId: null, variantState: 'UNKNOWN' }, offerText: null, packText: '1 item',
    price: { value: '85991856.58', range: null, currency: 'VND', priceState: 'LISTED', conditions: [], tax: 'UNKNOWN', shipping: 'UNKNOWN' },
  };
  const available = { status: 'AVAILABLE', basis: 'SOURCED', reasons: [], exact: { numerator: '1234567', denominator: '100' }, display: '1234567.89' };
  const quoteSnapshot = { output: { input: { quotes: [quoteInput] }, quotes: [{ ...Object.fromEntries([
    ['pricePerPurchasedPack', available], ['pricePerPhysicalItem', available], ['pricePer100gNet', available], ['pricePer100gDrained', available],
  ]) }] }, sourceMetadata: [{ sha256: sourceSha256, path: '', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic source' }] } as unknown as AutomationQuoteMethodSnapshot;
  const quoteHtml = quoteMethodSection(quoteSnapshot, { mark: () => '[1]' });
  assert.match(quoteHtml, /Bản ghi giá #12/);
  assert.match(quoteHtml, /85\.991\.857 VND/);
  assert.match(quoteHtml, /1\.234\.567,89/);
  assert.doesNotMatch(quoteHtml, /capture-12|UNKNOWN|1234567/);

  const metricResult = calculateMetricScopes(metricFixture());
  const metricInput = { ...metricResult.input, records: metricResult.input.records.map((row, index) => index === 0 ? { ...row, listingId: '123456', shopId: '987654', title: '' } : row) };
  const metricSnapshot = { result: { ...metricResult, input: metricInput }, readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] }, limitations: [], originalSourcePackage: { manifestArtifactSha256: 'b'.repeat(64) }, preparation: { normalizationReceiptSha256: 'c'.repeat(64) } } as unknown as AutomationMetricMethodSnapshot;
  const metricHtml = metricMethodSection(metricSnapshot, 'M03', undefined, { mark: () => '[1]' });
  assert.match(metricHtml, /Sản phẩm #1/);
  assert.match(metricHtml, /Gian hàng #1/);
  assert.match(metricHtml, /chưa rõ/);
  assert.doesNotMatch(metricHtml, /123456|987654|UNKNOWN/);
});

function inventory(): AutomationMarketMethodSnapshot {
  const source = { sourceSha256: 'a'.repeat(64), fieldPointer: '/data/revenue' };
  return {
    contractVersion: 'automation-market-method-snapshot-v1', runId: '11111111-1111-4111-8111-111111111111',
    sourcePackage: {} as AutomationMarketMethodSnapshot['sourcePackage'], mappingRevision: 'kalodata-product-detail-market-inventory-v1',
    sourceRequirements: { temporal: [], quotes: [] },
    temporal: { input: { observations: [
      { subjectMemberKeys: ['kalodata:sku_101'], measure: { literal: 'revenue', unit: null, currency: 'VND' }, value: { literal: '{"revenue":111598280.07}' }, requestedWindow: { start: '2026-01-01', end: '2026-01-31' }, source,
      },
      { subjectMemberKeys: ['kalodata:sku_101'], measure: { literal: 'sales_volumn', unit: 'units', currency: null }, value: { literal: '{"sales_volumn":7082}' }, requestedWindow: { start: '2026-01-01', end: '2026-01-31' }, source,
      },
    ] } } as AutomationMarketMethodSnapshot['temporal'],
    quotes: { input: { quotes: [
      { quoteId: 'capture-12-unit-price', price: { value: '85991856.58', range: null, currency: 'VND', state: 'NON_EXACT' }, source },
      { quoteId: 'capture-40-price-range', price: { value: null, range: { minimum: '127792.55', maximum: '132237.87' }, currency: 'VND', state: 'RANGE' }, source },
    ] } } as AutomationMarketMethodSnapshot['quotes'],
  } as AutomationMarketMethodSnapshot;
}

test('Market HTML hides machine literals in visible text while retaining technical details', () => {
  const fixture = descriptiveMarketFixture();
  const descriptor = {
    ...fixture.descriptor,
    scope: { ...fixture.descriptor.scope, universe: 'Source-declared M05 observation scope; not a market universe.' },
    m05: fixture.descriptor.m05.map(row => ({ ...row, scope: { ...row.scope, universe: 'Source-declared M05 observation scope; not a market universe.' }, sourceWording: '{"sales_volumn":7082}', measureLiteral: 'sales_volumn', unit: 'units', observation: { ...row.observation, value: '7082' } })),
    m09: [{
      source: fixture.descriptor.m05[0]!.source, statementType: 'UNCLASSIFIED' as const, sourceWording: '{"launch_date":"2024-08-31"}', attribution: 'Synthetic source',
      publicationDate: '2024-08-31', eventDate: '2024-08-31', dateBasis: 'Ngày do nguồn khai báo tại launch_date, không phải ngày thu thập hoặc kỳ đo lường.',
      namedScope: 'Synthetic product', targetLink: null, affectedMetricLiteral: 'revenue', conflictRefs: [],
    }],
  };
  const methods = buildDescriptiveMarketMethods({ ...descriptor, sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) } }, { methodVersion: '1.1.0' }).output;
  const runId = '11111111-1111-4111-8111-111111111111';
  const product = { productId: 'kalodata:sku_101', provider: 'kalodata', sourceProductId: '101', role: 'PRINCIPAL' as const, title: 'Bình giữ nhiệt tổng hợp', sourceUrl: null, imageUrl: null, description: null, descriptionState: 'EMPTY' as const, observedWindow: null, retrievedAt: '2026-02-01T00:00:00.000Z' };
  const sourceEvidence = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = {
    run: { contractVersion: 'research-automation-run-v1' as const, runId, workspaceId: '22222222-2222-4222-8222-222222222222', revision: 1, status: 'RENDERING' as const, country: 'VN' as const, mode: 'CATEGORY' as const, keyword: 'synthetic', description: null, interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, reports: ['MARKET'] as ['MARKET'], definition: null, productCards: [product], coverage: { requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
    start: { contractVersion: 'research-automation-start-snapshot-v1' as const, workspaceId: '22222222-2222-4222-8222-222222222222', country: 'VN' as const, mode: 'CATEGORY' as const, keyword: 'synthetic', description: null, interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, reports: ['MARKET'] as ['MARKET'], sourceEvidenceVersion: 'automation-source-evidence-v1' as const },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1' as const, workspaceId: '22222222-2222-4222-8222-222222222222', runId, definition: 'Synthetic', includeTerms: [], excludeTerms: [], selectedProductIds: ['kalodata:sku_101'], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1' as const, runId, stepId: 'COLLECTION' as const, outcome: 'SUCCEEDED' as const, productCards: [product], comparables: [], coverage: [], limitations: [] }, captures: [], sourceEvidence, descriptiveMethods: methods, marketInventory: inventory(),
  } as Parameters<typeof buildResearchAutomationReport>[0];
  const document = new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString()).window.document;
  for (const selector of ['details', 'script', 'style']) document.querySelectorAll(selector).forEach(node => node.remove());
  const visible = document.body.textContent ?? '';
  assert.doesNotMatch(visible, /\{"[a-z_]+":/);
  assert.doesNotMatch(visible, /\b[a-z]+_[a-z_]+\b/);
  assert.doesNotMatch(visible, /\b[A-Z]{2,}_[A-Z_]+\b/);
  assert.deepEqual(visible.match(/\b\d{5,}(\.\d+)?\b/g) ?? [], [], 'visible large-number leaks');
  assert.doesNotMatch(visible, /capture-\d+/);
  assert.doesNotMatch(visible, /\/data\//);
  assert.doesNotMatch(visible, /UNKNOWN/);
  assert.doesNotMatch(visible, /Source-declared M05 observation scope; not a market universe\./);
  assert.match(visible, /Doanh thu: 111\.598\.280/);
  assert.match(visible, /Sản lượng bán: 7\.082/);
  assert.match(visible, /Bản ghi giá #12 · giá đơn vị/);
  assert.match(visible, /85\.991\.857 VND/);
  assert.match(visible, /ngày ra mắt do nguồn khai báo: 2024-08-31/);
  assert.match(visible, /Chỉ số nêu: Doanh thu/);
  assert.match(visible, /Phạm vi quan sát do nguồn khai báo; không phải toàn bộ thị trường\./);
});

test('marker-free quote, metric and market-presentation renderers replay origin/main bytes', () => {
  const citations = { mark: () => '[1]' };
  const quote = { output: { input: { quotes: [] }, quotes: [] }, sourceMetadata: [] } as unknown as AutomationQuoteMethodSnapshot;
  assert.equal(quoteMethodSection(quote, citations, false), ORIGIN_QUOTE_BYTES);

  const sourceSha256 = 'a'.repeat(64);
  const quoteInput = { quoteId: 'capture-12-unit-price', source: { sourceSha256, locator: '/offer/price', fieldPointer: '/offer/price' }, acquiredAt: '2026-01-01T00:00:00Z', observedAt: null, identity: { variantId: null, variantState: 'UNKNOWN' }, offerText: null, packText: '1 item', price: { value: '85991856.58', range: null, currency: 'VND', priceState: 'LISTED', conditions: [], tax: 'UNKNOWN', shipping: 'UNKNOWN' } };
  const available = { status: 'AVAILABLE', basis: 'SOURCED', reasons: [], exact: { numerator: '1234567', denominator: '100' }, display: '1234567.89' };
  const nonemptyQuote = { output: { input: { quotes: [quoteInput] }, quotes: [{ pricePerPurchasedPack: available, pricePerPhysicalItem: available, pricePer100gNet: available, pricePer100gDrained: available }] }, sourceMetadata: [{ sha256: sourceSha256, path: '', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic source' }] } as unknown as AutomationQuoteMethodSnapshot;
  assert.equal(quoteMethodSection(nonemptyQuote, citations, false), ORIGIN_QUOTE_NONEMPTY_BYTES);

  const metricResult = calculateMetricScopes(metricFixture());
  const metric = { result: metricResult, readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] }, limitations: [], originalSourcePackage: { manifestArtifactSha256: 'b'.repeat(64) }, preparation: { normalizationReceiptSha256: 'c'.repeat(64) } } as unknown as AutomationMetricMethodSnapshot;
  assert.equal(metricMethodSection(metric, 'M03', undefined, citations, false), ORIGIN_METRIC_BYTES);

  const market = { input: { rows: [], metric: null }, unitPrices: [], binding: { metric: null } } as unknown as AutomationMarketPresentationMethod;
  assert.equal(renderAutomationMarketUnitPrices(market, citations, false), ORIGIN_MARKET_PRESENTATION_BYTES);
});

test('reader-on market body withholds unsafe tokens and formats large values', () => {
  const market = {
    input: { rows: [{ i: 0, platform: 'shopee', listing: 'kalodata:123', title: 'snake_case' }], metric: null },
    unitPrices: [{ rowI: 0, value: 10000, comparisonKey: 'synthetic', ownerDeclared: false, missing: 'NON_EXACT', sources: [], standard: 'snake_case', observation: {
      platform: 'shopee', listing: 'kalodata:123', variant: 'UNKNOWN', category: { label: 'snake_case' },
      price: { value: 10000, kind: 'LISTED', conditions: [] }, quantity: { value: 10000, unit: 'units' }, period: { start: '2026-01-01', end: '2026-01-31' },
    } }], binding: { metric: null },
  } as unknown as AutomationMarketPresentationMethod;
  const visible = renderAutomationMarketUnitPrices(market, { mark: () => '[1]' }, true);
  assert.doesNotMatch(visible, /snake_case|UNKNOWN|kalodata:123|10000/);
  assert.match(visible, /10\.000/);
  assert.match(visible, /giá ước tính, chưa chính xác tuyệt đối/);
  assert.equal(readerQuoteLabel('capture-10000-unit-price', 1), 'Bản ghi giá #10.000 · giá đơn vị');
  assert.equal(readerProductLabel('kalodata:123', 'snake_case', 10000), 'Sản phẩm #10.000');
  assert.equal(readerStoredOrJson('{"status":"UNKNOWN"}', 'Nội dung được giữ trong bản lưu'), 'Nội dung được giữ trong bản lưu');
});

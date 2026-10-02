import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';

function fixture(): AutomationReportInput {
  const period = { startDate: '2025-01-01', endDate: '2025-12-31', dayCount: 365 };
  const run: ResearchAutomationRun = {
    contractVersion: 'research-automation-run-v1', runId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222',
    revision: 3, status: 'RENDERING', country: 'VN', mode: 'PRODUCT', keyword: '<script>alert(1)</script>', description: null, interview: null,
    requestedPeriod: period, reports: ['MARKET', 'INSIGHT'], definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
    usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    run, start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId: run.workspaceId, country: 'VN', mode: 'PRODUCT', keyword: run.keyword, description: null, interview: null, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: run.workspaceId, runId: run.runId, definition: 'Sản phẩm mẫu', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: ['kalodata:1', 'kalodata:2'] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId: run.runId, stepId: 'COLLECTION', outcome: 'PARTIAL', productCards: [], comparables: [], coverage: [], limitations: [] }, captures: [],
  };
}

test('separate deterministic drafts keep all 30 section slots truthful and user text inert', () => {
  const input = fixture();
  const market = buildResearchAutomationReport(input, 'MARKET');
  const insight = buildResearchAutomationReport(input, 'INSIGHT');
  assert.deepEqual(buildResearchAutomationReport(input, 'MARKET'), market);
  const m = new JSDOM(market.html.toString()).window.document;
  const i = new JSDOM(insight.html.toString()).window.document;
  assert.equal(m.querySelectorAll('.sheet').length, 13);
  assert.equal(i.querySelectorAll('.sheet').length, 17);
  assert.equal(m.querySelectorAll('script').length, 0);
  assert.equal(m.querySelectorAll('img[src^="http"]').length, 0);
  assert.match(m.body.textContent!, /<script>alert\(1\)<\/script>/);
  assert.match(m.getElementById('M03')!.textContent!, /Chưa đủ dữ liệu/);
  assert.match(i.getElementById('I01')!.textContent!, /không phải nhận định AI/);
  assert.equal(m.getElementById('I01'), null);
  assert.equal(i.getElementById('M01'), null);
});

test('peer evidence requires every explicit peer, exact compatible period and intact source captures', () => {
  const input = fixture();
  const capture = { stepId: 'COLLECTION' as const, ordinal: 7, artifactSha256: 'a'.repeat(64), mediaType: 'application/json', provider: 'KALODATA', operation: 'detail', retrievedAt: input.run.createdAt, window: { startDate: '2025-12-01', endDate: '2025-12-31' }, truncated: false };
  const second = { ...capture, ordinal: 9, artifactSha256: 'b'.repeat(64) };
  const captures = [second, { ...capture, stepId: 'QUICK_SEARCH' as const, artifactSha256: 'c'.repeat(64) }, capture];
  const rows = ['kalodata:1', 'kalodata:2'].map((productId, index) => ({ productId, provider: 'KALODATA', metric: 'GMV_VND' as const, value: '9007199254740993.25', window: capture.window, captureIndex: index === 0 ? 7 : 9 }));
  const document = (comparables = rows, sourceCaptures = captures) => new JSDOM(buildResearchAutomationReport({ ...input, captures: sourceCaptures, collection: { ...input.collection!, comparables } }, 'MARKET').html.toString()).window.document;
  const render = (comparables = rows, sourceCaptures = captures) => document(comparables, sourceCaptures).getElementById('M07')!;
  assert.equal(render().querySelectorAll('tbody tr').length, 2);
  assert.match(render().textContent!, /9007199254740993\.25/);
  assert.match(render().textContent!, /Không đại diện toàn thị trường/);
  assert.equal(render(rows.slice(0, 1)).querySelector('table'), null);
  assert.equal(render([rows[0]!, { ...rows[1]!, window: { ...capture.window, startDate: '2025-11-01' } }]).querySelector('table'), null);
  assert.equal(render(rows, [{ ...capture, truncated: true }]).querySelector('table'), null);
  for (const section of ['M07', 'M13']) {
    const evidenceRows = [...document().querySelectorAll(`#${section} table.observations tbody tr`)];
    assert.equal(evidenceRows.length, 2);
    assert.equal(evidenceRows[0]!.querySelector('code')!.textContent, capture.artifactSha256);
    assert.equal(evidenceRows[1]!.querySelector('code')!.textContent, second.artifactSha256);
  }
  assert.throws(() => document(rows, [...captures, { ...capture, artifactSha256: 'd'.repeat(64) }]), /capture ordinal/i);
});

test('actual local Chromium prints two independent PDFs without model calls', { skip: !process.env.TDN_RESEARCH_PDF_CHROMIUM }, async () => {
  const renderer = createChromiumPdfRenderer({ executablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM! });
  try {
    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const pdf = await renderer.render(buildResearchAutomationReport(fixture(), kind).html);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 1000);
    }
  } finally { await renderer.close(); }
  await assert.rejects(renderer.render(Buffer.from('<html></html>')));
});

test('peer report keeps every comparable window and metric instead of silently choosing the first', () => {
  const input = fixture();
  const windows = [{ startDate: '2025-11-01', endDate: '2025-11-30' }, { startDate: '2025-12-01', endDate: '2025-12-31' }];
  const captures = windows.map((window, ordinal) => ({ stepId: 'COLLECTION' as const, ordinal, artifactSha256: String(ordinal + 1).repeat(64), mediaType: 'application/json', provider: 'kalodata', operation: 'detail', retrievedAt: input.run.createdAt, window, truncated: false }));
  const comparables = windows.flatMap((window, captureIndex) => ['kalodata:1', 'kalodata:2'].flatMap(productId => (['GMV_VND', 'UNITS_SOLD'] as const).map(metric => ({ productId, provider: 'kalodata', metric, value: metric === 'GMV_VND' ? '125.50' : '0', window, captureIndex }))));
  const render = (rows = comparables) => new JSDOM(buildResearchAutomationReport({ ...input, captures, collection: { ...input.collection!, comparables: rows } }, 'MARKET').html.toString()).window.document;
  assert.equal(render().getElementById('M07')!.querySelectorAll('tbody tr').length, 8);
  assert.match(render().getElementById('M07')!.textContent!, /2025-11-01/);
  assert.match(render().getElementById('M07')!.textContent!, /2025-12-31/);
  assert.equal(render([{ ...comparables[0]!, window: { startDate: '2024-11-01', endDate: '2024-11-30' } }, ...comparables.slice(1)]).getElementById('M07')!.querySelectorAll('tbody tr').length, 6);
});

test('selected listing observations remain inspectable without silently approving a peer set or completed analysis', () => {
  const input = fixture();
  const window = { startDate: '2025-12-01', endDate: '2025-12-31' };
  const capture = { stepId: 'COLLECTION' as const, ordinal: 0, artifactSha256: 'b'.repeat(64), mediaType: 'application/json', provider: 'kalodata', operation: 'kalodata.product.detail', retrievedAt: input.run.createdAt, window, truncated: false };
  const row = { productId: 'kalodata:1', provider: 'kalodata', metric: 'UNITS_SOLD' as const, value: '0', window, captureIndex: 0 };
  const report = buildResearchAutomationReport({ ...input, scope: { ...input.scope, selectedProductIds: ['kalodata:1'], peerProductIds: [] }, captures: [capture], collection: { ...input.collection!, comparables: [row, { ...row, productId: 'unselected' }] } }, 'MARKET');
  const document = new JSDOM(report.html.toString()).window.document;
  const rows = document.querySelectorAll('#M13 table.observations tbody tr');
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.textContent!, /kalodata:1/);
  assert.match(rows[0]!.textContent!, /UNITS_SOLD/);
  assert.equal(rows[0]!.querySelectorAll('td')[2]!.textContent, '0');
  assert.match(rows[0]!.textContent!, new RegExp(capture.artifactSha256));
  assert.equal(document.querySelector('#M07 table'), null);
  assert.match(document.getElementById('M03')!.textContent!, /Chưa nối phương pháp/);
  assert.match(document.body.textContent!, /Mục phân tích hoàn chỉnh: 0\./);
});

type DescriptiveInput = DescriptiveMarketMethods['input'];
type Literal = DescriptiveInput['m05'][number];
const listingSha = 'c'.repeat(64);
const configSha = 'd'.repeat(64);
const at = (locator: string, sourceSha256 = listingSha) => ({ sourceSha256, locator });
const listingScope: DescriptiveInput['scope'] = {
  universe: 'Listing nguồn mẫu', geography: 'Việt Nam', frame: 'Bảng nguồn tháng 1',
  inclusionRule: 'Listing được khai báo', exclusionRule: 'Không', variantRule: 'Theo listing nguồn',
};
function literal(locator: string, entityLabel: string, state: Literal['observation']['state'], value: string | null, measureLiteral = 'Đã bán', unit = 'lượt bán'): Literal {
  return {
    source: at(locator), sourceWording: `${entityLabel}: ${value ?? 'không có số'}`, entityLabel, measureLiteral,
    measureDefinition: `${measureLiteral} theo nguồn`, unit, period: { start: '2026-01-01', end: '2026-01-31', timezone: 'Asia/Ho_Chi_Minh', basis: 'tháng báo cáo của nguồn' },
    scope: { ...listingScope }, observation: { state, value, precision: 'exact' }, aggregation: null,
  };
}
function methods(records: Partial<Pick<DescriptiveInput, 'm05' | 'm06' | 'm07' | 'peerSet' | 'm09'>> = {}): DescriptiveMarketMethods {
  return buildDescriptiveMarketMethods({
    contractVersion: '1.0.0',
    sourcePackage: { packageId: '00000000-0000-4000-8000-0000000000aa', version: 2, manifestArtifactSha256: 'e'.repeat(64), packageContentSha256: 'f'.repeat(64) },
    sources: [
      { logicalPath: 'kalodata/listings.json', sha256: listingSha, evidenceFamily: 'kalodata-listing', providerProvenance: 'provider_reported' },
      { logicalPath: 'owner/run-config.json', sha256: configSha, evidenceFamily: 'owner-declaration', providerProvenance: 'operator_supplied_unverified' },
    ],
    configuration: {
      profileId: 'source-bound-descriptive-market-v1', profileVersion: '1.0.0', policyRevision: 'A41-adoption-2026-10-01',
      profileSha256: '5'.repeat(64), adoptionSha256: '6'.repeat(64), runConfiguration: at('/run', configSha),
    },
    question: 'Nguồn nói gì về listing đã chọn?', scope: { ...listingScope },
    m05: [], m06: [], m07: [], peerSet: null, m09: [], ...records,
  }).output;
}
const additive = (key: string): NonNullable<Literal['aggregation']> => ({
  additive: true, aggregationUnit: 'cửa hàng nguồn', sourceKeyNamespace: 'mau/cua-hang',
  members: [{ sourceKey: key, source: at(`/stores/${key}`) }], requiredMemberKeys: ['A', 'B'], proof: at('/membership'),
});
const marketDocument = (report: { html: Buffer }) => new JSDOM(report.html.toString()).window.document;
const cellTexts = (element: Element) => [...element.querySelectorAll('td')].map(cell => cell.textContent);

test('supplied descriptive method output renders source records per section without counting a complete analysis', () => {
  const input = fixture();
  const output = methods({
    m05: [
      literal('/rows/0/sold', 'Quạt A', 'observed_value', '1520'), literal('/rows/1/sold', 'Quạt B', 'observed_zero', '0'),
      { ...literal('/rows/0/search', 'Cửa hàng A', 'observed_value', '12', 'Lượt tìm kiếm', 'lượt tìm kiếm'), aggregation: additive('A') },
      { ...literal('/rows/1/search', 'Cửa hàng B', 'observed_value', '8', 'Lượt tìm kiếm', 'lượt tìm kiếm'), aggregation: additive('B') },
    ],
    m06: [{ observation: literal('/rows/2/listing', 'Quạt C', 'missing', null), objectLiteral: 'Listing Quạt C', statusLiteral: 'đang bán', dateMeaning: 'ngày chụp nguồn' }],
    m07: [literal('/rows/3/sold', 'Quạt D', 'observed_value', '77')],
    m09: [{
      source: at('/news/0'), statementType: 'DOCUMENTED_EVENT', sourceWording: '<img src=x onerror=alert(1)> Shop giảm giá', attribution: 'Trang tin mẫu',
      publicationDate: '2026-01-05', eventDate: null, dateBasis: 'ngày đăng bài', namedScope: 'Quạt cầm tay', targetLink: null, affectedMetricLiteral: null, conflictRefs: [],
    }],
  });
  const market = buildResearchAutomationReport({ ...input, descriptiveMethods: output }, 'MARKET');
  const document = marketDocument(market);
  const m05 = document.getElementById('M05')!;
  assert.equal(m05.querySelectorAll('tbody tr').length, 4);
  assert.match(m05.textContent!, /Kết quả phương pháp mô tả · Chưa phải phân tích hoàn chỉnh/);
  assert.match(m05.textContent!, /1520 lượt bán/);
  assert.match(m05.textContent!, /Nguồn ghi bằng 0/);
  assert.match(m05.textContent!, /Tổng theo khung thành viên nguồn đã khai báo: 20 lượt tìm kiếm/);
  assert.match(m05.textContent!, /Không tính tổng\. Chưa đủ điều kiện cộng các dòng; không hiển thị bằng 0\./);
  assert.match(m05.textContent!, /2026-01-01 đến 2026-01-31/);
  assert.match(m05.textContent!, /kalodata\/listings\.json/);
  assert.match(m05.textContent!, /không phải nhu cầu hay quy mô thị trường/);
  const m06 = document.getElementById('M06')!;
  assert.match(m06.textContent!, /Phương pháp đã chạy · Không có bản ghi dùng được/);
  assert.match(m06.textContent!, /Listing Quạt C/);
  assert.match(m06.textContent!, /Thiếu giá trị · không phải 0/);
  assert.ok(!cellTexts(m06).includes('0'));
  const m07 = document.getElementById('M07')!;
  assert.match(m07.textContent!, /Danh mục chưa xếp hạng: 1 quan sát/);
  assert.match(m07.textContent!, /77 lượt bán/);
  assert.ok(![...m07.querySelectorAll('th')].some(cell => cell.textContent === 'Mốc'));
  const m09 = document.getElementById('M09')!;
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.match(m09.textContent!, /<img src=x onerror=alert\(1\)> Shop giảm giá/);
  assert.match(m09.textContent!, /Người nêu: Trang tin mẫu/);
  assert.match(m09.textContent!, /Ngày sự kiện: chưa rõ/);
  assert.match(document.getElementById('M13')!.textContent!, /00000000-0000-4000-8000-0000000000aa · phiên bản 2/);
  const headline = document.querySelector('#sections > .warning')!.textContent!;
  assert.match(headline, /Mục phân tích hoàn chỉnh: 0\./);
  assert.match(headline, /3 mục \(M05, M07, M09\)/);
  assert.match(headline, /không có bản ghi dùng được: M06\./);
  const semantic = market.semantic as { completion: unknown; descriptiveMethods: unknown };
  assert.deepEqual(semantic.completion, {
    completedAnalyticalSections: 0, boundedMethodOutputSections: 3, boundedMethodOutputSectionIds: ['M05', 'M07', 'M09'],
    boundedMethodNoUsableRecordSectionIds: ['M06'], contextSections: 2, sourceTableSections: 0, blockedSections: 7,
  });
  assert.deepEqual(semantic.descriptiveMethods, output);
  assert.deepEqual(buildResearchAutomationReport({ ...input, descriptiveMethods: output }, 'INSIGHT'), buildResearchAutomationReport(input, 'INSIGHT'));
});

test('declared peers render side by side while missing and unknown values stay unavailable instead of zero', () => {
  const input = fixture();
  const output = methods({
    m05: [literal('/rows/20/sold', 'Bình E', 'missing', null), literal('/rows/21/sold', 'Bình F', 'UNKNOWN', null)],
    m07: [literal('/rows/10/sold', 'Bình mốc', 'observed_zero', '0'), literal('/rows/11/sold', 'Bình đối thủ', 'missing', null)],
    peerSet: { anchorRef: at('/rows/10/sold'), peerRefs: [at('/rows/11/sold')], membershipBasis: 'Người dùng chọn', scope: { ...listingScope }, membershipRevision: 'peer-rev-1', declaration: at('/peers') },
  });
  const report = buildResearchAutomationReport({ ...input, descriptiveMethods: output }, 'MARKET');
  const m07 = marketDocument(report).getElementById('M07')!;
  const comparison = [...m07.querySelectorAll('table')].find(table => table.querySelector('th')!.textContent === 'Mốc')!;
  const cells = comparison.querySelectorAll('tbody td');
  assert.equal(comparison.querySelectorAll('tbody tr').length, 1);
  assert.match(cells[0]!.textContent!, /Bình mốc/);
  assert.match(cells[0]!.textContent!, /Nguồn ghi bằng 0/);
  assert.match(cells[1]!.textContent!, /Bình đối thủ/);
  assert.match(cells[1]!.textContent!, /Thiếu giá trị · không phải 0/);
  assert.equal(cells[2]!.textContent, 'Không so sánh được');
  assert.match(cells[3]!.textContent!, /Thiếu giá trị ở một số dòng\./);
  assert.match(m07.textContent!, /peer-rev-1/);
  assert.doesNotMatch(m07.textContent!, /Danh mục chưa xếp hạng/);
  const m05 = marketDocument(report).getElementById('M05')!;
  assert.match(m05.textContent!, /Phương pháp đã chạy · Không có bản ghi dùng được/);
  assert.match(m05.textContent!, /UNKNOWN · không phải 0/);
  assert.match(m05.textContent!, /Không tính tổng/);
  assert.ok(!cellTexts(m05).includes('0'));
  assert.deepEqual((report.semantic as { completion: { boundedMethodOutputSectionIds: unknown } }).completion.boundedMethodOutputSectionIds, ['M07']);
});

test('absent, empty or unresolvable descriptive output keeps M05-M09 honest instead of showing content', () => {
  const input = fixture();
  const absent = buildResearchAutomationReport(input, 'MARKET');
  const absentDocument = marketDocument(absent);
  for (const id of ['M05', 'M06', 'M07', 'M09']) assert.match(absentDocument.getElementById(id)!.textContent!, /Chưa nối phương pháp của mục này/);
  assert.match(absentDocument.querySelector('#sections > .warning')!.textContent!, /Phương pháp mô tả thị trường chưa được nối vào lượt này\./);
  assert.match(absentDocument.getElementById('M13')!.textContent!, /Hồ sơ phương pháp mô tả thị trường\s*Chưa được nối vào lượt này/);
  assert.equal((absent.semantic as { descriptiveMethods: unknown }).descriptiveMethods, null);

  const failed = marketDocument(buildResearchAutomationReport({ ...input, descriptiveMethodFailure: 'DESCRIPTIVE_METHOD_FAILED' }, 'MARKET'));
  assert.match(failed.getElementById('M13')!.textContent!, /DESCRIPTIVE_METHOD_FAILED/);
  assert.doesNotMatch(failed.getElementById('M13')!.textContent!, /Chưa được nối vào lượt này/);

  const empty = buildResearchAutomationReport({ ...input, descriptiveMethods: methods() }, 'MARKET');
  const emptyDocument = marketDocument(empty);
  for (const id of ['M05', 'M06', 'M07', 'M09']) {
    assert.match(emptyDocument.getElementById(id)!.textContent!, /Phương pháp đã chạy · Không có bản ghi dùng được/);
    assert.equal(emptyDocument.querySelector(`#${id} tbody`), null);
  }
  assert.deepEqual((empty.semantic as { completion: unknown }).completion, {
    completedAnalyticalSections: 0, boundedMethodOutputSections: 0, boundedMethodOutputSectionIds: [],
    boundedMethodNoUsableRecordSectionIds: ['M05', 'M06', 'M07', 'M09'], contextSections: 2, sourceTableSections: 0, blockedSections: 7,
  });

  const event = { source: at('/news/1'), statementType: 'UNCLASSIFIED' as const, sourceWording: 'Bài viết mẫu', attribution: 'Nguồn mẫu', publicationDate: null, eventDate: null, dateBasis: 'không nêu', namedScope: 'Bình giữ nhiệt', targetLink: null, affectedMetricLiteral: null, conflictRefs: [] };
  const located = methods({ m09: [event] });
  const tampered = { ...located, sections: { ...located.sections, M09: { ...located.sections.M09, events: [{ ...located.sections.M09.events[0]!, recordPointer: '/input/m09/7' }] } } };
  const m09 = marketDocument(buildResearchAutomationReport({ ...input, descriptiveMethods: tampered }, 'MARKET')).getElementById('M09')!;
  assert.match(m09.textContent!, /Không phân giải được con trỏ\/input\/m09\/7/);
  assert.match(m09.textContent!, /Không có bản ghi dùng được/);
  assert.doesNotMatch(m09.textContent!, /Bài viết mẫu/);
});

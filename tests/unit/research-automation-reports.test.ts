import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';
import type { AutomationInsightCodingAcceptedSnapshot, AutomationInsightCodingFamilyDraftSnapshot } from '../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import type { AutomationInsightSelection } from '../../contracts/analysis/automation-insight-selection.generated.js';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { projectDraftInsightGroupCounts, projectSelectedInsightCandidates } from '../../src/modules/analysis/research-automation/selected-insight-projection.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

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

type CitationTrace = { entries: { number: number; identity: string }[] };
/** The stored semantic is opaque to the renderer contract; this reads its declared citation trace field for tests. */
const citationsOf = (report: { semantic: object }): CitationTrace => (report.semantic as { citations: CitationTrace }).citations;

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
  const market = buildResearchAutomationReport({ ...input, captures, collection: { ...input.collection!, comparables: rows } }, 'MARKET');
  const marketDocument = new JSDOM(market.html.toString()).window.document;
  const entries = citationsOf(market).entries;
  const numberToIdentity = new Map(entries.map(entry => [entry.number, entry.identity]));
  for (const section of ['M07', 'M13']) {
    const evidenceRows = [...marketDocument.querySelectorAll(`#${section} table.observations tbody tr`)];
    assert.equal(evidenceRows.length, 2);
    // P1-02/P1-01: a row's number resolves to its own capture digest in the stored trace, and the same capture keeps
    // one number in every section; the digest itself is the citation identity, never reader text.
    assert.deepEqual(evidenceRows.map(row => numberToIdentity.get(Number(row.querySelector('.cite')!.textContent!.replace(/\D/g, '')))),
      [capture.artifactSha256, second.artifactSha256]);
  }
  assert.deepEqual(entries.filter(entry => [capture.artifactSha256, second.artifactSha256].includes(entry.identity)).map(entry => entry.identity).sort(),
    [capture.artifactSha256, second.artifactSha256].sort(), 'each capture owns exactly one entry');
  assert.throws(() => document(rows, [...captures, { ...capture, artifactSha256: 'd'.repeat(64) }]), /capture ordinal/i);
});

test('M02 keeps query windows and listing selection separate from measured coverage and review dates', () => {
  const base = fixture();
  const capture = { stepId: 'COLLECTION' as const, ordinal: 0, artifactSha256: 'b'.repeat(64), mediaType: 'application/json',
    provider: 'kalodata', operation: 'kalodata.product.detail', retrievedAt: base.run.createdAt,
    window: { startDate: '2025-12-01', endDate: '2025-12-30' }, truncated: false };
  const input: AutomationReportInput = { ...base, captures: [capture, { ...capture, ordinal: 1, artifactSha256: 'c'.repeat(64) },
    { ...capture, stepId: 'QUICK_SEARCH', ordinal: 0, operation: 'kalodata.product.rank', window: { startDate: '2025-11-01', endDate: '2025-11-30' } },
    { ...capture, ordinal: 2, operation: 'kalodata.credit.balance', window: null }] };
  const result = buildResearchAutomationReport(input, 'MARKET');
  const document = new JSDOM(result.html.toString()).window.document;
  const section = document.getElementById('M02')!;
  assert.match(section.textContent!, /2025-01-01 đến 2025-12-31/);
  assert.match(section.textContent!, /1 khoảng truy vấn khác nhau, 2 bản thu/);
  assert.match(section.textContent!, /không chứng minh nguồn có dữ liệu đo đủ cả kỳ/);
  assert.match(section.textContent!, /Kỳ chọn listing không giới hạn ngày đăng review/);
  assert.match(section.textContent!, /Không xem thiếu nguồn là doanh số bằng 0/);
  assert.doesNotMatch(section.textContent!, /credit.balance/);
  assert.equal(section.querySelector('a[href="#M13"]')?.getAttribute('href'), '#M13');
  assert.ok(document.getElementById('M13'));
  const semantic = result.semantic as { sourceScope: { queries: unknown[]; metric: unknown }; completion: { completedAnalyticalSections: number } };
  assert.equal(semantic.sourceScope.queries.length, 2);
  assert.equal(semantic.sourceScope.metric, null);
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
  assert.equal('sourceScope' in buildResearchAutomationReport(input, 'INSIGHT').semantic, false);
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

const pdftotextAvailable = (() => {
  try { return spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error === undefined; } catch { return false; }
})();
test('printed PDF text shows retained citation-register URLs instead of bare open-links', {
  skip: !process.env.TDN_RESEARCH_PDF_CHROMIUM || !pdftotextAvailable,
}, async () => {
  const renderer = createChromiumPdfRenderer({ executablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM! });
  try {
    const html = Buffer.from(`<html><head><meta charset="utf-8"></head><body><main>
      <p>Nhận định <sup class="cite">[1]</sup>.</p>
      <section class="citation-register"><h2>Nguồn tham khảo</h2><ol>
      <li id="cite-1"><span class="cite-number">[1]</span> · <span class="cite-label">Đánh giá khách hàng</span> · <a href="https://shopee.vn/product/10/101" rel="noopener noreferrer">Mở nguồn</a></li>
      </ol></section></main></body></html>`, 'utf8');
    const pdf = await renderer.render(html);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pdf-text-'));
    try {
      await fs.writeFile(path.join(root, 'printed.pdf'), pdf);
      const converted = spawnSync('pdftotext', [path.join(root, 'printed.pdf'), path.join(root, 'printed.txt')]);
      assert.equal(converted.status, 0, String(converted.stderr));
      const text = await fs.readFile(path.join(root, 'printed.txt'), 'utf8');
      assert.match(text, /shopee\.vn\/product\/10\/101/);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  } finally { await renderer.close(); }
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
  assert.equal(rows[0]!.querySelectorAll('td')[0]!.textContent, '1');
  assert.match(rows[0]!.textContent!, /Lượt bán/);
  assert.equal(rows[0]!.querySelectorAll('td')[2]!.textContent, '0');
  assert.equal(rows[0]!.querySelector('.cite')!.textContent, '[1]');
  assert.equal(document.querySelector('#M07 table'), null);
  assert.match(document.getElementById('M03')!.textContent!, /Lượt này không có gói số liệu thị trường gắn kèm và không có inventory từ bản thu nguồn/);
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
  assert.equal((market.semantic as { rendererVersion: string }).rendererVersion, 'automation-report-kit-v13');
  const legacyMethods = buildDescriptiveMarketMethods(output.input, { methodVersion: '1.0.0' }).output;
  const legacyMarket = buildResearchAutomationReport({ ...input, descriptiveMethods: legacyMethods }, 'MARKET');
  assert.equal((legacyMarket.semantic as { rendererVersion: string }).rendererVersion, 'automation-report-kit-v12');
  assert.match(marketDocument(legacyMarket).getElementById('M05')!.textContent!, /không phải nhu cầu hay quy mô thị trường/);
  const document = marketDocument(market);
  const m05 = document.getElementById('M05')!;
  assert.equal(m05.querySelectorAll('tbody tr').length, 4);
  assert.match(m05.textContent!, /Kết quả phương pháp mô tả · Chưa phải phân tích hoàn chỉnh/);
  assert.match(m05.textContent!, /1520 lượt bán/);
  assert.match(m05.textContent!, /Nguồn ghi bằng 0/);
  assert.match(m05.textContent!, /Tổng theo khung thành viên nguồn đã khai báo: 20 lượt tìm kiếm/);
  assert.match(m05.textContent!, /Không tính tổng\. Chưa đủ điều kiện cộng các dòng; không hiển thị bằng 0\./);
  assert.match(m05.textContent!, /2026-01-01 đến 2026-01-31/);
  // P1-02: the provider-named path, family and raw locator stay in the citation trace; the reader sees the number and
  // the provenance gloss. P1 changed this assertion (the stored path used to be reader text).
  assert.equal(m05.querySelectorAll('sup.cite').length, 4, 'every located record keeps its own numbered source');
  assert.equal(m05.querySelector('tbody tr td:last-child')!.textContent, '[1] Nhà cung cấp tự báo');
  assert.doesNotMatch(m05.textContent!, /kalodata/i);
  assert.match(m05.textContent!, /Nhu cầu, đo bằng doanh số \(ước tính\) trong mẫu/);
  assert.match(m05.textContent!, /Mức quan tâm tìm kiếm ghi riêng/);
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
    boundedMethodNoUsableRecordSectionIds: ['M06'], evidenceInventorySectionIds: [], contextSections: 2, sourceTableSections: 0, blockedSections: 7,
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
  for (const id of ['M05', 'M06', 'M07', 'M09']) assert.match(absentDocument.getElementById(id)!.textContent!, /Phương pháp mô tả không có kết quả trong lượt này: lượt này không có quan sát sản phẩm từ bản thu nguồn mới\./);
  assert.match(absentDocument.querySelector('#sections > .warning')!.textContent!, /Không có kết quả phương pháp mô tả thị trường: lượt này không có quan sát sản phẩm từ bản thu nguồn mới\./);
  assert.match(absentDocument.getElementById('M13')!.textContent!, /Hồ sơ đối chiếu phương pháp mô tả thị trường\s*Không có kết quả trong lượt này\./);
  assert.equal((absent.semantic as { descriptiveMethods: unknown }).descriptiveMethods, null);

  const failed = marketDocument(buildResearchAutomationReport({ ...input, descriptiveMethodFailure: 'DESCRIPTIVE_METHOD_FAILED' }, 'MARKET'));
  assert.match(failed.getElementById('M13')!.textContent!, /DESCRIPTIVE_METHOD_FAILED/);
  assert.doesNotMatch(failed.getElementById('M13')!.textContent!, /Không có kết quả trong lượt này/);

  const empty = buildResearchAutomationReport({ ...input, descriptiveMethods: methods() }, 'MARKET');
  const emptyDocument = marketDocument(empty);
  for (const id of ['M05', 'M06', 'M07', 'M09']) {
    assert.match(emptyDocument.getElementById(id)!.textContent!, /Phương pháp đã chạy · Không có bản ghi dùng được/);
    assert.equal(emptyDocument.querySelector(`#${id} tbody`), null);
  }
  assert.deepEqual((empty.semantic as { completion: unknown }).completion, {
    completedAnalyticalSections: 0, boundedMethodOutputSections: 0, boundedMethodOutputSectionIds: [],
    boundedMethodNoUsableRecordSectionIds: ['M05', 'M06', 'M07', 'M09'], evidenceInventorySectionIds: [], contextSections: 2, sourceTableSections: 0, blockedSections: 7,
  });

  const event = { source: at('/news/1'), statementType: 'UNCLASSIFIED' as const, sourceWording: 'Bài viết mẫu', attribution: 'Nguồn mẫu', publicationDate: null, eventDate: null, dateBasis: 'không nêu', namedScope: 'Bình giữ nhiệt', targetLink: null, affectedMetricLiteral: null, conflictRefs: [] };
  const located = methods({ m09: [event] });
  const tampered = { ...located, sections: { ...located.sections, M09: { ...located.sections.M09, events: [{ ...located.sections.M09.events[0]!, recordPointer: '/input/m09/7' }] } } };
  const m09 = marketDocument(buildResearchAutomationReport({ ...input, descriptiveMethods: tampered }, 'MARKET')).getElementById('M09')!;
  assert.match(m09.textContent!, /Không phân giải được con trỏ\/input\/m09\/7/);
  assert.match(m09.textContent!, /Không có bản ghi dùng được/);
  assert.doesNotMatch(m09.textContent!, /Bài viết mẫu/);
});

type LocatedInput = LocatedInsightMethods['input'];
const product = '<img src=x onerror=alert(1)>';
const proposalId = '33333333-3333-4333-8333-333333333333';
const receipt = { receiptId: '44444444-4444-4444-8444-444444444444', sha256: '7'.repeat(64) };
const firstRecord = `Tôi xem nhãn rồi mua ${product}. Muốn nhỏ hơn nhưng hiện còn to.`;
function codingProposal(): LocatedInput {
  const input = locatedInsightFixture();
  const declared = (): LocatedInput['i06'][number]['provenance'] => ({ basis: 'DECLARED', coderRole: 'synthetic proposer', adjudication: null, disagreement: null });
  const texts = [firstRecord, `Tôi muốn ${product} nhỏ hơn.`, 'Không nêu chủ đề.'];
  const span = (index: number, quote: string) => locatedSpan(texts[index]!, quote);
  input.records = texts.map((text, index) => ({ sourceSha256: input.sources[0]!.sha256, locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic self-report', timeText: null, disposition: 'INCLUDED', dispositionReason: null }));
  input.i06 = [{ recordIndex: 0, provenance: declared(), qualifiers: [], counterevidence: [],
    firstEvent: span(0, 'xem nhãn'), secondEvent: span(0, `mua ${product}`), relation: { context: span(0, firstRecord), link: span(0, 'rồi') } }];
  input.i09 = [
    { recordIndex: 0, provenance: declared(), qualifiers: [], counterevidence: [], desiredState: span(0, 'nhỏ hơn'), currentState: span(0, 'còn to'),
      relation: { context: span(0, firstRecord), link: span(0, 'nhưng') }, workaround: { state: 'NOT_STATED', span: null } },
    { recordIndex: 1, provenance: declared(), qualifiers: [], counterevidence: [], desiredState: span(1, 'nhỏ hơn'), currentState: null,
      relation: null, workaround: { state: 'NOT_STATED', span: null } },
  ];
  input.i13Mentions = [0, 1].map(recordIndex => ({ recordIndex, span: span(recordIndex, product), provenance: declared() }));
  input.corpora = (['I10', 'I13'] as const).map(sectionId => {
    const phrase = sectionId === 'I10' ? 'nhỏ hơn' : product;
    return { sectionId, recordIndexes: [0, 1, 2], question: 'Which literal references occur?', unit: 'source-native record',
      period: 'Synthetic retained sample, January 2026', frame: 'Three exact records', channel: 'synthetic review', inclusionRule: 'All retained records',
      membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
      codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: 0, firstSpan: span(0, phrase) }] },
      assignments: [0, 1].map(recordIndex => ({ recordIndex, code: 'C1', span: span(recordIndex, phrase), provenance: declared() })),
      dispositions: [0, 1, 2].map(recordIndex => ({ recordIndex, state: recordIndex === 2 ? 'UNCODED' as const : 'CODED' as const, provenance: declared() })),
    };
  });
  return input;
}
/** Synthetic renderer input treated as already verified; persistence, adoption and receipt verification belong to the Insight coding owner. */
function codingSnapshot(input: AutomationReportInput, selection: AutomationInsightSelection): AutomationInsightCodingAcceptedSnapshot {
  return {
    contractVersion: 'automation-insight-coding-snapshot-v1',
    binding: { workspaceId: input.run.workspaceId, runId: input.run.runId, pairId: '8'.repeat(64), scopeSha256: '9'.repeat(64), reportSha256: 'a'.repeat(64),
      sourceKind: 'NATIVE', sourcePackageSha256: 'b'.repeat(64), inputSha256: 'c'.repeat(64) },
    selection: { proposalId, receiptIds: [receipt.receiptId] }, adoptionId: '55555555-5555-4555-8555-555555555555', proposalSha256: 'd'.repeat(64), receipts: [receipt],
    output: projectSelectedInsightCandidates(codingProposal(), selection).output,
  };
}
type Completion = { completedAnalyticalSections: number; boundedMethodOutputSectionIds: string[]; boundedMethodNoUsableRecordSectionIds: string[] };
const completionOf = (report: { semantic: object }) => (report.semantic as { completion: Completion }).completion;
const ratioCell = (document: Document, id: string) => [...document.querySelectorAll(`#${id} table.obs`)].at(-1)!.querySelector('tbody tr')!.lastElementChild!.textContent;

test('selected Insight coding renders I06/I09/I10/I13 from the calculated output without completing any section', () => {
  const input = fixture();
  const baseDocument = marketDocument(buildResearchAutomationReport(input, 'INSIGHT'));
  const partialCoding = codingSnapshot(input, { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [0], i13Mentions: [],
    corpora: [{ corpusIndex: 0, assignments: [0], dispositions: [0] }] });
  const partial = buildResearchAutomationReport({ ...input, insightCoding: partialCoding }, 'INSIGHT');
  const document = marketDocument(partial);
  const text = (id: string) => document.getElementById(id)!.textContent!;
  for (const id of ['I06', 'I09', 'I10']) assert.match(text(id), /Mã hóa lời nguồn · Kết quả từng phần/);
  assert.match(text('I06'), /không phải quan sát độc lập và chưa phải mục phân tích hoàn chỉnh/);
  assert.ok(text('I06').includes(firstRecord), 'the original record text stays inspectable');
  assert.match(text('I09'), /Cặp chênh lệch được nêu/);
  assert.match(text('I09'), /1 chú giải đang chờ xử lý/);
  assert.equal(ratioCell(document, 'I10'), 'Chưa công bố');
  assert.match(text('I13'), /Phương pháp đã chạy · Không có bản ghi dùng được/);
  assert.match(text('I13'), /2 cụm nhắc đang chờ xử lý/);
  assert.match(text('I13'), /không phải kết quả bằng 0/);
  assert.equal(document.querySelectorAll('img, script, a[download]').length, 0);
  assert.ok(text('I13').includes(product));
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href')!;
    assert.ok(href.startsWith('#') && document.getElementById(href.slice(1)), `dead link ${href}`);
  }
  assert.ok(text('I03').includes(proposalId));
  assert.ok(text('I17').includes(receipt.receiptId) && text('I17').includes(partialCoding.proposalSha256));
  assert.match(text('I17'), /Không nâng cấp bằng chứng nguồn/);
  const headline = document.querySelector('#sections > .warning')!.textContent!;
  assert.match(headline, /Mục phân tích hoàn chỉnh: 0\./);
  assert.match(headline, /có kết quả dùng được ở I06, I09, I10\./);
  assert.deepEqual(completionOf(partial), { ...completionOf(partial), completedAnalyticalSections: 0, boundedMethodOutputSectionIds: ['I06', 'I09', 'I10'], boundedMethodNoUsableRecordSectionIds: ['I13'] });
  for (const id of ['I01', 'I02', 'I04', 'I05', 'I07', 'I08', 'I14']) assert.equal(document.getElementById(id)!.outerHTML, baseDocument.getElementById(id)!.outerHTML, id);
  assert.deepEqual(buildResearchAutomationReport({ ...input, insightCoding: partialCoding }, 'MARKET'), buildResearchAutomationReport(input, 'MARKET'));

  const complete = buildResearchAutomationReport({ ...input, insightCoding: codingSnapshot(input, { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [0, 1], i13Mentions: [0, 1],
    corpora: [0, 1].map(corpusIndex => ({ corpusIndex, assignments: [0, 1], dispositions: [0, 1, 2] })) }) }, 'INSIGHT');
  const completeDocument = marketDocument(complete);
  for (const id of ['I10', 'I13']) assert.equal(ratioCell(completeDocument, id), '2/3', id);
  assert.match(completeDocument.getElementById('I10')!.textContent!, /không phải tỷ lệ thị trường/);
  assert.equal(completionOf(complete).completedAnalyticalSections, 0);
  assert.deepEqual(completionOf(complete).boundedMethodOutputSectionIds, ['I06', 'I09', 'I10', 'I13']);

  // A fully reviewed zero count is a result, unlike a missing/pending count.
  const zeroInput = codingProposal();
  zeroInput.i13Mentions = [];
  for (const corpus of zeroInput.corpora) {
    corpus.assignments = [];
    for (const disposition of corpus.dispositions) disposition.state = 'UNCODED';
  }
  const zeroOutput = projectSelectedInsightCandidates(zeroInput, { contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [],
    corpora: [0, 1].map(corpusIndex => ({ corpusIndex, assignments: [], dispositions: [0, 1, 2] })) }).output;
  const zero = buildResearchAutomationReport({ ...input, insightCoding: { ...partialCoding, output: zeroOutput } }, 'INSIGHT');
  const zeroDocument = marketDocument(zero);
  for (const id of ['I10', 'I13']) {
    assert.equal(ratioCell(zeroDocument, id), '0/3');
    assert.ok(completionOf(zero).boundedMethodOutputSectionIds.includes(id), `${id}: verified zero must remain method output`);
    assert.doesNotMatch(zeroDocument.getElementById(id)!.textContent!, /Đây không phải kết quả bằng 0/);
  }

  assert.throws(() => buildResearchAutomationReport({ ...input, insightCoding: { ...partialCoding, binding: { ...partialCoding.binding, runId: '66666666-6666-4666-8666-666666666666' } } }, 'INSIGHT'), /insight coding lineage/);
  assert.throws(() => buildResearchAutomationReport({ ...input, insightCoding: { ...partialCoding, selection: { proposalId, receiptIds: ['77777777-7777-4777-8777-777777777777'] } } }, 'INSIGHT'), /insight coding receipt/);
});

// Display-only guidance: each fallback names only a cause the run actually carries; states, methods and counts stay as before.
test('blocked fallbacks name only causes present in the run and keep the catalog method as an unrun reference', () => {
  const input = fixture();
  const market = buildResearchAutomationReport(input, 'MARKET');
  const insight = buildResearchAutomationReport(input, 'INSIGHT');
  const m = marketDocument(market);
  const i = marketDocument(insight);
  for (const document of [m, i]) assert.doesNotMatch(document.body.textContent!, /Chưa nối phương pháp/);
  assert.match(m.getElementById('M10')!.textContent!, /chỉ chạy trên hồ sơ nguồn bổ sung do người dùng chọn; lượt này chưa có hồ sơ đó\./);
  assert.match(m.getElementById('M11')!.textContent!, /không đủ thông tin để xác định riêng nguyên nhân là thiếu đầu vào, còn chờ duyệt hay phương pháp chưa chạy/);
  for (const id of ['I02', 'I06']) {
    assert.match(i.getElementById(id)!.textContent!, /Lượt này chưa có review nguồn gắn kèm\. Không suy ra nguồn không nhắc tới nội dung này\./, id);
  }
  const sections = (market.semantic as { sections: { sectionId: string; state: string; method: string }[] }).sections;
  const m08 = sections.find(section => section.sectionId === 'M08')!;
  assert.deepEqual([m08.state, m08.method], ['BLOCKED', 'tablet-quote-normalization@2.0.0']);
  assert.match(m.getElementById('M08')!.textContent!, /Phương pháp ghi trong danh mục, chưa chạy trong lượt này: tablet-quote-normalization@2\.0\.0/);
  assert.match(m.getElementById('M02')!.textContent!, /Phương pháp: automation-source-context-v1/);
});

test('M08 fallback names the generic quote method for any keyword without importing tablet inputs or units from titles', () => {
  const base = fixture();
  const keyword = 'Nước mắm cá cơm chai 500ml thùng 12';
  const input: AutomationReportInput = { ...base, run: { ...base.run, keyword }, start: { ...base.start, keyword }, scope: { ...base.scope, definition: keyword } };
  const report = buildResearchAutomationReport(input, 'MARKET');
  const m08 = marketDocument(report).getElementById('M08')!;
  const text = m08.textContent!;
  assert.match(text, /chưa chạy phép tính giá theo đơn vị generic-quote-unit-v1@1\.0\.0/);
  assert.match(text, /quy cách mỗi gói \(khối lượng hoặc số món\) và biến thể được nguồn ghi rõ kèm vị trí; không suy ra quy cách hay biến thể từ tên sản phẩm/);
  assert.match(text, /chưa xác lập phương pháp đó áp dụng cho sản phẩm của lượt này/);
  assert.doesNotMatch(text, /báo giá viên|số viên/);
  assert.ok(!text.includes('500ml') && !text.includes('thùng 12'), 'pack size must not be read from the keyword or title');
  const semantic = report.semantic as { sections: { sectionId: string; state: string }[]; completion: { completedAnalyticalSections: number } };
  assert.equal(semantic.sections.find(section => section.sectionId === 'M08')!.state, 'BLOCKED');
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
});

test('retained review failures are not presented as missing sources or as usable coding', () => {
  const base = fixture();
  const collection = { ...base.collection!, exactShopee: { collectionId: 'retained-synthetic', collectionSha256: 'a'.repeat(64), requestSha256: 'b'.repeat(64) } };
  const identity = methods().input.sourcePackage;
  const sourcePackage: NonNullable<AutomationReportInput['locatedReviewFallback']>['sourcePackage'] = {
    ...identity,
    manifest: { contractVersion: '1.0.0', packageId: identity.packageId, packageKey: 'synthetic-retained-review', version: identity.version,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic retained review, not provider evidence', finalizedAt: base.run.createdAt,
      packageContentSha256: identity.packageContentSha256,
      files: [{ path: 'synthetic/reviews.json', sha256: 'a'.repeat(64), byteSize: 2, mediaType: 'application/json', evidenceFamily: 'synthetic-review',
        representationRole: 'structured', independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Renderer fixture; no provider collection' }] },
  };
  const cases: Partial<AutomationReportInput>[] = [
    { collection },
    { collection, reviewCorpusFailure: 'REVIEW_CORPUS_FAILED' },
    { collection, reviewCorpusFailure: 'REVIEW_CORPUS_REPORT_TOO_LARGE', locatedReviewFallback: { sourcePackage } },
    { nativeReviewFailure: 'NATIVE_REVIEW_REPORT_TOO_LARGE', nativeReviewFallback: { sourcePackage } },
    { collection, locatedReviewFailure: 'LOCATED_REVIEW_METHOD_FAILED' },
  ];
  for (const extra of cases) {
    const report = buildResearchAutomationReport({ ...base, ...extra }, 'INSIGHT');
    const window = new JSDOM(report.html.toString()).window;
    try {
      for (const id of ['I02', 'I06', 'I09', 'I10', 'I13']) {
        const text = window.document.getElementById(id)!.textContent!;
        assert.doesNotMatch(text, /chưa có review nguồn gắn kèm/, id);
        assert.match(text, /đã được lưu|vẫn được giữ/, id);
        assert.match(text, /Không suy ra nguồn không nhắc/, id);
        assert.match(text, /I03/, id);
      }
      const semantic = report.semantic as { sections: { sectionId: string; state: string }[]; completion: Completion };
      assert.equal(semantic.sections.find(section => section.sectionId === 'I06')!.state, 'BLOCKED');
      assert.equal(semantic.completion.completedAnalyticalSections, 0);
      if (extra.reviewCorpusFailure || extra.nativeReviewFailure || extra.locatedReviewFailure) {
        assert.match(window.document.getElementById('I03')!.textContent!, /đã được lưu|vẫn được giữ|Đã lưu collection/);
      }
    } finally { window.close(); }
  }
});

test('cover summary counts exactly the rendered section states and never claims a complete report', () => {
  const report = buildResearchAutomationReport(fixture(), 'MARKET');
  const document = marketDocument(report);
  const states = (report.semantic as { sections: { state: string }[] }).sections.map(section => section.state);
  assert.deepEqual([states.length, states.filter(state => state === 'SOURCE_CONTEXT').length, states.filter(state => state === 'BLOCKED').length], [13, 2, 11]);
  const summary = [...document.querySelectorAll('.cv-meta span')].at(-1)!.textContent;
  assert.equal(summary, 'Trong 13 mục: 2 mục ngữ cảnh nguồn; 11 mục chưa có kết quả. Mục phân tích hoàn chỉnh: 0; không tuyên bố báo cáo hoàn chỉnh.');
});

test('frozen M01 sources with zero eligible claims and retained non-query sources are described separately from new query captures', () => {
  const input = fixture();
  const digest = 'e'.repeat(64);
  const sourceClaims: NonNullable<AutomationReportInput['sourceClaims']> = { contractVersion: '1.0.0', methodId: 'automation-source-claims', methodVersion: '1.0.0',
    runId: input.run.runId, workspaceId: input.run.workspaceId, scopeSha256: digest, claimsSha256: digest, claims: [], limitations: ['Synthetic empty claims'] };
  const m01Inventory: NonNullable<AutomationReportInput['m01Inventory']> = { contractVersion: '1.0.0', methodId: 'automation-m01-evidence-inventory', methodVersion: '1.0.0', sectionId: 'M01',
    runId: input.run.runId, workspaceId: input.run.workspaceId, scopeSha256: digest, sourceClaims: { methodId: 'automation-source-claims', methodVersion: '1.0.0', claimsSha256: digest },
    ownerQuestion: { state: 'UNSET', text: null }, ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED', status: 'INSUFFICIENT_EVIDENCE',
    insufficientEvidence: 'NO_ELIGIBLE_UPSTREAM_CLAIMS', conclusion: null, items: [], limitations: ['Synthetic empty inventory'] };
  const document = marketDocument(buildResearchAutomationReport({ ...input, sourceClaims, m01Inventory }, 'MARKET'));
  const m01 = document.getElementById('M01')!.textContent!;
  assert.match(m01, /chưa có mục bằng chứng nào đủ điều kiện cho M01\. Nguồn đã chốt vẫn được giữ; khoảng trống này không phải kết luận\./);
  assert.doesNotMatch(m01, /Bằng chứng đầu nguồn đã được chốt với phiên bản này\. Danh sách/);
  const captureRow = document.querySelector('#M13 [aria-label="Bản thu từ truy vấn nguồn"] tbody tr')!.textContent!;
  assert.match(captureRow, /Lượt này không có bản thu từ truy vấn nguồn mới\. Nguồn đã lưu và gắn với lượt vẫn được dùng ở: bằng chứng đầu nguồn \(M01\)\./);
  const plain = marketDocument(buildResearchAutomationReport(input, 'MARKET')).querySelector('#M13 [aria-label="Bản thu từ truy vấn nguồn"] tbody tr')!.textContent!;
  assert.equal(plain, 'Lượt này không có bản thu từ truy vấn nguồn mới.');
});

test('v18 neutral method identity wording preserves retained input and marker-free renderer bytes', () => {
  const input = fixture();
  const output = methods({ m06: [{ observation: literal('/rows/0', 'Sản phẩm mẫu', 'observed_value', '1'),
    objectLiteral: 'Sản phẩm', statusLiteral: null, dateMeaning: 'Ngày quan sát' }] });
  output.input.scope.variantRule = 'Giữ mã sản phẩm của nguồn; chưa hợp nhất listing hoặc chuẩn hóa biến thể.';
  const retainedInput = structuredClone(output.input);
  const legacy = buildResearchAutomationReport({ ...input, descriptiveMethods: output }, 'MARKET');
  assert.match(legacy.html.toString(), /Số đối tượng duy nhất/);
  assert.match(legacy.html.toString(), /chưa hợp nhất listing/);
  const packet = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const current = buildResearchAutomationReport({ ...input, descriptiveMethods: output,
    start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, sourceEvidence: packet }, 'MARKET');
  assert.equal((current.semantic as { rendererVersion: string }).rendererVersion, 'automation-report-kit-v18');
  assert.match(current.html.toString(), /Số đối tượng phân biệt/);
  assert.match(current.html.toString(), /chưa gộp listing/);
  assert.deepEqual(output.input, retainedInput);
  assert.deepEqual(buildResearchAutomationReport({ ...input, descriptiveMethods: output }, 'MARKET'), legacy);
});

test('source v18 preserves accepted Insight method output outside the family-draft lint boundary', () => {
  const input = fixture();
  const insightCoding = codingSnapshot(input, { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [0, 1], i13Mentions: [0, 1],
    corpora: [0, 1].map(corpusIndex => ({ corpusIndex, assignments: [0, 1], dispositions: [0, 1, 2] })) });
  const legacy = buildResearchAutomationReport({ ...input, insightCoding }, 'INSIGHT');
  const sourceEvidence = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const current = buildResearchAutomationReport({ ...input, insightCoding, sourceEvidence,
    start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' } }, 'INSIGHT');
  assert.equal((current.semantic as { rendererVersion: string }).rendererVersion, 'automation-report-kit-v18');
  for (const id of ['I06', 'I09', 'I10', 'I13']) {
    assert.equal(marketDocument(current).getElementById(id)!.outerHTML, marketDocument(legacy).getElementById(id)!.outerHTML);
  }
  assert.match(current.html.toString(), /Thành viên duy nhất/);
  assert.equal(lintVisibleReportText(current.html.toString()).find(check => check.rule === 'U13_SUPERLATIVE')!.ok, false,
    'historical accepted-method copy is outside the separately approved family-draft lint gate');
});

test('marker-free Market peer policy retains renderer v14 and exact replay', () => {
  const base = fixture();
  const input = { ...base, start: { ...base.start, defaultPeerRule: { ...DEFAULT_MARKET_PEER_RULE } } };
  const legacy = buildResearchAutomationReport(input, 'MARKET');
  const semantic = legacy.semantic as { rendererVersion: string; sourceEvidence?: unknown };
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v14');
  assert.equal(semantic.sourceEvidence, undefined);
  assert.deepEqual(buildResearchAutomationReport(input, 'MARKET'), legacy);
});

test('family-draft renderer enforces applicable lint with and without source v18 marker', () => {
  const input = fixture();
  const proposal = nextInsightFixture(); proposal.draftCountsVersion = 'draft-counts-v2';
  const output = buildLocatedInsightMethods(proposal).output;
  const accepted = codingSnapshot(input, { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [], i13Mentions: [], corpora: [] });
  const insightCoding: AutomationInsightCodingFamilyDraftSnapshot = {
    contractVersion: 'automation-insight-coding-snapshot-v3', binding: accepted.binding,
    selection: { proposalId, receiptIds: [] }, adoptionId: accepted.adoptionId, proposalSha256: accepted.proposalSha256,
    receipts: [], draftSelection: { contractVersion: 'insight-draft-select-v2', proposalId }, output,
    groupCounts: projectDraftInsightGroupCounts(output, 'SHOPEE'),
  };
  const sourceEvidence = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  for (const marker of [undefined, sourceEvidence]) {
    const reportInput = { ...input, insightCoding, ...(marker ? { sourceEvidence: marker,
      start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' as const } } : {}) };
    const current = buildResearchAutomationReport(reportInput, 'INSIGHT');
    assert.equal((current.semantic as { rendererVersion: string }).rendererVersion, marker ? 'automation-report-kit-v18' : 'automation-report-kit-v17');
    assert.ok(lintVisibleReportText(current.html.toString()).every(check => check.ok));
    const unsupportedPriority = structuredClone(reportInput);
    unsupportedPriority.insightCoding.groupCounts.groups[0]!.scope.frame = 'Ưu tiên số 1.';
    assert.throws(() => buildResearchAutomationReport(unsupportedPriority, 'INSIGHT'), /INSIGHT_VISIBLE_TEXT_LINT_FAILED:U13_PRIORITY/,
      'the actual renderer rejects generated unqualified priority prose under both identities');
  }
});


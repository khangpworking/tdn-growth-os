import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { PDF_EXCERPT_TITLE, pdfExcerptReaderCitation, type PdfExcerpt } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
const TITLE_A = 'Báo cáo thị trường bình giữ nhiệt năm 2025';
/** Two synthetic excerpts as `selectPdfExcerpts` stores them: one document with a title, one numbered by order. */
const EXCERPTS: PdfExcerpt[] = [
  { sourceSha256: SHA_A, page: 4, text: 'Nhu cầu bình giữ nhiệt tăng đều ở các đô thị lớn.', label: `${TITLE_A}, trang 4` },
  { sourceSha256: SHA_B, page: 2, text: 'Quy định ghi nhãn vật liệu tiếp xúc thực phẩm áp dụng từ năm trước.', label: 'Tài liệu PDF số 1, trang 2' },
];

async function presentationInput(): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: null, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows) } as unknown as AutomationReportInput;
}
/** The retained source packet with S25 drawn, as the service builds it (`sourceEvidenceForReport`). */
const withExcerpts = (input: AutomationReportInput): AutomationReportInput => {
  const packet = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const sourceEvidence = sourceEvidenceForReport(packet, { collection: null, pdfExcerpts: EXCERPTS } as unknown as Parameters<typeof sourceEvidenceForReport>[1], 'MARKET');
  assert.equal(sourceEvidence.pdfExcerpts, true);
  return { ...input, start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, sourceEvidence, pdfExcerpts: EXCERPTS } as unknown as AutomationReportInput;
};

function assertRegister(document: Document): void {
  assert.equal(document.querySelectorAll('section.citation-register').length, 1);
  const entries = [...document.querySelectorAll('section.citation-register li')];
  const ids = entries.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate entries');
  const marks = [...document.querySelectorAll('sup.cite')].map(mark => {
    assert.match(mark.textContent!, /^\[\d+\]$/u);
    return `cite-${mark.textContent!.slice(1, -1)}`;
  });
  assert.deepEqual(new Set(marks), new Set(ids), 'no dangling marks or uncited entries');
  assert.deepEqual([...new Set(marks)], ids, 'numbers follow first appearance');
  assert.deepEqual(ids, entries.map((_entry, i) => `cite-${i + 1}`), 'consecutive register numbers');
}

test('reader citation: the document name alone (the register adds the page), same source and page, no digest', () => {
  const [a, b] = EXCERPTS.map(pdfExcerptReaderCitation);
  assert.equal(a!.label, TITLE_A);
  assert.equal(b!.label, 'Tài liệu PDF số 1');
  assert.deepEqual(a!.locator, { kind: 'pdf', page: 4, fragment: null });
  assert.equal(a!.sourceKind, 'PDF_PAGE');
  assert.ok(![a!.label, b!.label].some(label => /[0-9a-f]{32,}/u.test(label)));
});

test('market14: each PDF excerpt carries a visible [n] that resolves to a register entry with its page, and the 14 rules pass', async () => {
  const input = await presentationInput();
  const plain = buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');
  const html = buildResearchAutomationReport(withExcerpts(input), 'MARKET').html.toString('utf8');
  const document = new JSDOM(html).window.document;
  assertRegister(document);
  const block = document.querySelector('#M09 ul.pdf-excerpts');
  assert.ok(block, `the block sits in M09 under "${PDF_EXCERPT_TITLE}"`);
  const items = [...block!.querySelectorAll('li')];
  assert.equal(items.length, 2);
  const registerItems = new Map([...document.querySelectorAll('section.citation-register li')].map(li => [li.id, li.textContent!.replace(/\s+/gu, ' ')]));
  const numbers: number[] = [];
  for (const [index, li] of items.entries()) {
    const mark = li.querySelector(':scope > sup.cite');
    assert.ok(mark, 'the mark is a direct child of the excerpt item, outside the quote and outside any details block');
    assert.equal(mark!.closest('details, blockquote, td, th, caption, figcaption'), null);
    assert.equal(mark!.previousElementSibling?.tagName, 'BLOCKQUOTE');
    const number = Number(/^\[(\d+)\]$/u.exec(mark!.textContent!)![1]);
    numbers.push(number);
    const entry = registerItems.get(`cite-${number}`);
    assert.ok(entry, `[${number}] resolves to a register entry`);
    const excerpt = EXCERPTS[index]!;
    assert.equal(entry, `[${number}] · ${pdfExcerptReaderCitation(excerpt).label}, trang ${excerpt.page}`, 'one name with its page');
    assert.ok(!entry!.includes('.pdf') && !entry!.includes('tên tệp'), 'never a file name');
    assert.ok(!/[0-9a-f]{32,}/u.test(entry!) && !entry!.includes('mã nguồn'), 'no digest in the entry');
    assert.deepEqual(providerNameViolations(entry!), []);
  }
  assert.equal(new Set(numbers).size, 2, 'two documents, two entries');
  assert.equal(registerItems.get(`cite-${numbers[0]}`), `[${numbers[0]}] · ${TITLE_A}, trang 4`);
  assert.equal(registerItems.get(`cite-${numbers[1]}`), `[${numbers[1]}] · Tài liệu PDF số 1, trang 2`);
  assert.doesNotThrow(() => assertMarket14MachineRules(html));
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  assert.doesNotThrow(() => assertMarket14MachineRules(plain));
  assert.ok(!plain.includes('pdf-excerpts'), 'without excerpts the report has no block');
});

test('market14: an automatic PDF attempt without excerpts shows a plain source row; excerpts keep existing bytes', async () => {
  const input = await fullMarket14Input();
  const discovery = { search: { status: 'CALLED' as const, reason: null, captureIndex: 0, retrievedAt: '2026-10-18T00:00:00.000Z' }, files: [], reason: 'NO_CANDIDATE' as const };
  const on = { ...input, collection: { ...input.collection!, pdfDiscovery: discovery } };
  const offHtml = buildResearchAutomationReport(input, 'MARKET').html.toString();
  const html = buildResearchAutomationReport(on, 'MARKET').html.toString();
  const dom = new JSDOM(html);
  const rows = [...dom.window.document.querySelectorAll('.market14-sources tr')].filter(row => row.firstElementChild?.textContent === 'Tài liệu ngành dạng PDF');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.lastElementChild?.textContent, 'Chưa tìm thấy tài liệu phù hợp trong lượt này.');
  assert.equal(rows[0]!.closest('details'), null);
  assert.equal(html.replace(/<table><caption>Trạng thái tài liệu ngành<\/caption>[\s\S]*?<\/table>/u, ''), offHtml);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  assert.doesNotThrow(() => assertMarket14MachineRules(html));
  assert.deepEqual(providerNameViolations(html), []);
  assert.deepEqual(buildResearchAutomationReport(withExcerpts(on), 'MARKET').html,
    buildResearchAutomationReport(withExcerpts(input), 'MARKET').html);
  dom.window.close();
});

test('PDF marks and page entries survive full P2 delivery while the trace resolves its own register', async () => {
  const report = buildResearchAutomationReport(withExcerpts(await fullMarket14Input()), 'MARKET');
  assert.ok(report.traceHtml);
  const reader = new JSDOM(report.html.toString('utf8')).window.document;
  const trace = new JSDOM(report.traceHtml.toString('utf8')).window.document;
  assert.ok(trace.querySelector('details'), 'the fixture exercises trace removal');
  assert.equal(reader.querySelector('details'), null);
  for (const document of [reader, trace]) {
    assertRegister(document);
    const marks = [...document.querySelectorAll('#M09 ul.pdf-excerpts > li > sup.cite')];
    assert.equal(marks.length, 2);
    for (const [index, mark] of marks.entries()) {
      assert.equal(mark.closest('details, blockquote, td, th, caption, figcaption'), null);
      const entry = document.getElementById(`cite-${mark.textContent!.slice(1, -1)}`)!;
      assert.equal(entry.querySelector('.cite-label')!.textContent, pdfExcerptReaderCitation(EXCERPTS[index]!).label);
      assert.equal(entry.querySelector('.cite-locator')!.textContent, `trang ${EXCERPTS[index]!.page}`);
    }
  }
  assert.doesNotThrow(() => assertMarket14MachineRules(report.html.toString('utf8')));
  assert.doesNotThrow(() => assertMarketBusinessGate(report.html.toString('utf8'), { presentation: true }));
});

test('legacy (non-market14) Market drafts keep the excerpt block without citation marks', async () => {
  const input = await presentationInput();
  const legacy = { ...withExcerpts(input), marketPresentation: undefined, marketPresentationCharts: undefined } as unknown as AutomationReportInput;
  const html = buildResearchAutomationReport(legacy, 'MARKET').html.toString('utf8');
  const block = new JSDOM(html).window.document.querySelector('ul.pdf-excerpts');
  assert.ok(block);
  assert.equal(block!.querySelectorAll('sup.cite').length, 0);
});

test('regenerating the Market reader and trace from old labels never republishes file names', async () => {
  const input = withExcerpts(await fullMarket14Input());
  const report = await buildResearchAutomationReport({ ...input, pdfExcerpts: EXCERPTS.map(excerpt => ({ ...excerpt,
    label: `Tài liệu bao-cao-nganh.pdf, trang ${excerpt.page}` })) }, 'MARKET');
  for (const html of [report.html.toString('utf8'), report.traceHtml!.toString('utf8')]) {
    const document = new JSDOM(html).window.document;
    assert.doesNotMatch(document.body.textContent!, /bao-cao-nganh\.pdf|tên tệp/u);
    const labels = [...document.querySelectorAll('#M09 .pdf-excerpts footer')].map(item => item.textContent!.split(';')[0]);
    assert.deepEqual(labels, ['Tài liệu PDF số 1, trang 4', 'Tài liệu PDF số 2, trang 2']);
    assertRegister(document);
  }
  assert.doesNotThrow(() => assertMarket14MachineRules(report.html.toString('utf8')));
  assert.doesNotThrow(() => assertMarketBusinessGate(report.html.toString('utf8'), { presentation: true }));
});

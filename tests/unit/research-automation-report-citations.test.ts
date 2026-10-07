import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import type { CitationEntry, CitationTrace } from '../../src/modules/analysis/citation-registry.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const period = { startDate: '2025-01-01', endDate: '2025-12-31', dayCount: 365 };
const window = { startDate: '2025-12-01', endDate: '2025-12-31' };
const capture = (ordinal: number, artifactSha256: string) => ({ stepId: 'COLLECTION' as const, ordinal, artifactSha256,
  mediaType: 'application/json', provider: 'kalodata', operation: 'kalodata.product.detail', retrievedAt: '2026-01-01T00:00:00.000Z', window, truncated: false });
const firstCapture = 'a'.repeat(64);
const secondCapture = 'b'.repeat(64);

function fixture(): AutomationReportInput {
  const run: ResearchAutomationRun = {
    contractVersion: 'research-automation-run-v1', runId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222',
    revision: 3, status: 'RENDERING', country: 'VN', mode: 'PRODUCT', keyword: 'bình giữ nhiệt', description: null, interview: null,
    requestedPeriod: period, reports: ['MARKET'], definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
    usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const row = (productId: string, captureIndex: number, value: string) => ({ productId, provider: 'kalodata', metric: 'UNITS_SOLD' as const, value, window, captureIndex });
  return {
    run, start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId: run.workspaceId, country: 'VN', mode: 'PRODUCT', keyword: run.keyword, description: null, interview: null, requestedPeriod: period, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: run.workspaceId, runId: run.runId, definition: 'Sản phẩm mẫu', includeTerms: [], excludeTerms: [],
      selectedProductIds: ['kalodata:3'], peerProductIds: ['kalodata:1', 'kalodata:2'] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId: run.runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], coverage: [], limitations: [],
      comparables: [row('kalodata:1', 0, '10'), row('kalodata:2', 2, '20'), row('kalodata:3', 1, '30')] },
    captures: [capture(0, firstCapture), capture(1, ''), capture(2, secondCapture)],
  };
}

type ReportSemantic = { rendererVersion: string; citationEntries: CitationEntry[]; citations: CitationTrace };
/** The renderer returns an opaque semantic object; this reads the fields this test owns. */
const semanticOf = (report: { semantic: object }): ReportSemantic => report.semantic as ReportSemantic;
const marks = (document: Document, selector: string) => [...document.querySelectorAll(`${selector} tbody tr`)].map(row =>
  row.querySelector('.cite')?.textContent ?? row.querySelector('.cite-missing')?.textContent);

test('one source keeps its number across sections, numbers follow the page and a value without lineage shows no number', () => {
  const input = fixture();
  const report = buildResearchAutomationReport(input, 'MARKET');
  const html = report.html.toString();
  const document = new JSDOM(html).window.document;
  // M07 is rendered before M13: the first capture seen on the page is [1], the second is [2].
  assert.deepEqual(marks(document, '#M07 table.observations'), ['[1]', '[2]']);
  // M13 reuses those numbers for the same captures and keeps the unlined value out of the register.
  assert.deepEqual(marks(document, '#M13 table.observations'), ['[1]', '[2]', 'Chưa có nguồn']);
  const register = document.querySelectorAll('.citation-register');
  assert.equal(register.length, 1, 'one register per report');
  assert.ok(document.getElementById('sections')!.nextElementSibling!.classList.contains('citation-register'), 'register sits after the sections');
  assert.deepEqual([...register[0]!.querySelectorAll('li')].map(item => item.id), ['cite-1', 'cite-2'], 'the register has no gap');
  assert.deepEqual([...register[0]!.querySelectorAll('.cite-label')].map(label => label.textContent), ['Bản thu dữ liệu nguồn', 'Bản thu dữ liệu nguồn']);
  // Every mark on the page resolves to a register entry, and nothing else does.
  assert.deepEqual([...new Set([...document.querySelectorAll('.cite')].map(mark => mark.textContent))].sort(), ['[1]', '[2]']);
  const semantic = semanticOf(report);
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v12');
  assert.deepEqual(semantic.citationEntries.map(entry => entry.number), [1, 2]);
  assert.deepEqual(semantic.citations.entries.map(entry => [entry.number, entry.identity]), [[1, firstCapture], [2, secondCapture]]);
  assert.deepEqual(visibleTextViolations(reportVisibleText(html)), [], 'reader text keeps provider names, digests and codes out');
  assert.deepEqual(providerNameViolations(html), [], 'no disclosure may name the provider');
  assert.deepEqual(buildResearchAutomationReport(input, 'MARKET'), report, 'two renders are byte-identical');
});

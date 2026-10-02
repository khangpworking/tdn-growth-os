import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
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
  const capture = { stepId: 'COLLECTION' as const, ordinal: 0, artifactSha256: 'a'.repeat(64), mediaType: 'application/json', provider: 'KALODATA', operation: 'detail', retrievedAt: input.run.createdAt, window: { startDate: '2025-12-01', endDate: '2025-12-31' }, truncated: false };
  const rows = ['kalodata:1', 'kalodata:2'].map(productId => ({ productId, provider: 'KALODATA', metric: 'GMV_VND' as const, value: '9007199254740993.25', window: capture.window, captureIndex: 0 }));
  const render = (comparables = rows, captures = [capture]) => new JSDOM(buildResearchAutomationReport({ ...input, captures, collection: { ...input.collection!, comparables } }, 'MARKET').html.toString()).window.document.getElementById('M07')!;
  assert.equal(render().querySelectorAll('tbody tr').length, 2);
  assert.match(render().textContent!, /9007199254740993\.25/);
  assert.match(render().textContent!, /Không đại diện toàn thị trường/);
  assert.equal(render(rows.slice(0, 1)).querySelector('table'), null);
  assert.equal(render([rows[0]!, { ...rows[1]!, window: { ...capture.window, startDate: '2025-11-01' } }]).querySelector('table'), null);
  assert.equal(render(rows, [{ ...capture, truncated: true }]).querySelector('table'), null);
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

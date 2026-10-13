import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

/**
 * RENDERFAIL-209. A results-page Metric capture stores the source's own product
 * names. One of them carried a superlative ("mới nhất") and the owned-wording
 * U13 rule treated that copied source text as the report's own claim, so a
 * complete run failed at RENDERING with REPORT_RENDER_FAILED and no draft.
 * These fixtures are synthetic; no stored run, source product name or link is used.
 */
const runId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const citations = { mark: () => '[1]' } as const;
const sourceSha = 'a'.repeat(64);
const SOURCE_TITLE = 'Bình giữ nhiệt synthetic 209 bản mới nhất, tốt nhất';

/** Capture-backed Metric snapshot with the source-declared platform set of the reported run. */
function captureSnapshot(title = SOURCE_TITLE): AutomationMetricMethodSnapshot {
  const result = calculateMetricScopes(metricFixture());
  const records = result.input.records.map((row, index) => index === 0 ? { ...row, title } : row);
  return {
    contractVersion: 'automation-metric-method-snapshot-v2', runId, runBindingSha256: 'b'.repeat(64),
    sourcePackage: { packageId: 'synthetic-method-package', manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
    originalSourcePackage: { packageId: 'synthetic-capture-package', manifestArtifactSha256: 'e'.repeat(64), packageContentSha256: 'f'.repeat(64) },
    preparation: { preparationSha256: '1'.repeat(64), normalizedInput: { rowCount: records.length }, selectedSources: {} },
    readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] },
    result, limitations: ['CAPTURE_RESULTS_PAGE_TOP_N_LIMITED'],
    capture: {
      provenance: 'RESULTS_PAGE_CAPTURE', snapshotSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64),
      contextSha256: '4'.repeat(64), descriptorSha256: '5'.repeat(64),
      platforms: [{ platform: 'shopee', result: { ...result, input: { ...result.input, records } } }],
      unattributedRows: [{ listingId: 'synthetic-unattributed-1', title, shop: 'Gian hàng synthetic 209', revenue: null, units: null }],
      capture: { captureId: 'capture-synthetic-209', keyword: 'synthetic-keyword', specDigest: '6'.repeat(64),
        measurementPeriod: { startDate: result.input.scope.start, endDate: result.input.scope.end },
        platforms: ['shopee', 'tiktok'], truncation: { cap: 200, totalShown: null, pagesRead: 1, rowsRead: records.length, truncated: false } },
    },
  } as unknown as AutomationMetricMethodSnapshot;
}

/** Market input whose collected shape matches the reported run: capture-backed Metric, a declared platform with no rows, three listings with one review each, failed review actor. */
function marketInput(title = SOURCE_TITLE): AutomationReportInput {
  const period = { startDate: '2026-09-03', endDate: '2026-10-02', dayCount: 30 };
  const run: ResearchAutomationRun = {
    contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 8, status: 'RENDERING', country: 'VN', mode: 'CATEGORY',
    keyword: 'synthetic-keyword', description: null, interview: null, requestedPeriod: period, reports: ['MARKET'], definition: null, productCards: [],
    coverage: { requestedPeriod: period, sources: [{ provider: 'synthetic-provider', dataset: 'synthetic', state: 'PARTIAL', observedStartDate: null, observedEndDate: null, truncated: false, note: null }] },
    usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: '2026-10-13T14:19:02.265Z', updatedAt: '2026-10-13T14:30:13.683Z',
  };
  const capture = { stepId: 'COLLECTION' as const, ordinal: 0, artifactSha256: sourceSha, mediaType: 'application/vnd.tdn.research-automation.capture+json',
    provider: 'synthetic-provider', operation: 'synthetic.operation', retrievedAt: '2026-10-13T14:29:50.318Z', window: { startDate: period.startDate, endDate: period.endDate }, truncated: false };
  return {
    run,
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: run.keyword, description: null, interview: null, requestedPeriod: period, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic market scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId, stepId: 'COLLECTION', outcome: 'PARTIAL', productCards: [], comparables: [], coverage: [], limitations: [],
      exactShopee: { collectionId: 'synthetic-collection', collectionSha256: '7'.repeat(64), requestSha256: '8'.repeat(64) },
      exactShopeeOutcome: { outcome: 'PARTIAL_LISTINGS', providerMessage: null, attemptedAt: '2026-10-13T14:29:50.000Z', reused: false,
        listings: [{ listingUrl: 'https://example.invalid/a', reviews: 1, shortfallReason: 'RETURNED_COUNT_BELOW_REQUESTED' },
          { listingUrl: 'https://example.invalid/b', reviews: 1, shortfallReason: 'RETURNED_COUNT_BELOW_REQUESTED' },
          { listingUrl: 'https://example.invalid/c', reviews: 1, shortfallReason: 'RETURNED_COUNT_BELOW_REQUESTED' }] } },
    captures: [capture], metricMethods: captureSnapshot(title),
  };
}

test('RENDERFAIL-209: a capture source name never fails the Market business gate', () => {
  const section = metricMethodSection(captureSnapshot(), 'M03', undefined, citations);
  assert.match(section, new RegExp(`<span data-quote>${SOURCE_TITLE}</span>`), 'the retained source name keeps its marker');
  assert.equal(lintVisibleReportText(section).find(check => check.rule === 'U13_SUPERLATIVE')?.ok, true);

  const report = buildResearchAutomationReport(marketInput(), 'MARKET');
  const html = report.html.toString('utf8');
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  // The source keeps its own wording: nothing is dropped, rewritten or reworded.
  assert.ok(html.includes(SOURCE_TITLE));
  // The declared platform with no captured rows stays an explicit gap, never a zero.
  assert.match(html, /TikTok Shop: <strong>không có số liệu<\/strong> trong lượt này/);
});

test('RENDERFAIL-209: the retained-source exemption leaves every other Market rule armed', () => {
  const html = buildResearchAutomationReport(marketInput(), 'MARKET').html.toString('utf8');
  const gateThrows = (value: string, rule: string) =>
    assert.throws(() => assertMarketBusinessGate(value, { presentation: false }), new RegExp(`MARKET_BUSINESS_GATE_FAILED:.*${rule}`));

  // Without the retained-source marker the copied superlative is the report's own wording again.
  gateThrows(html.replaceAll('<span data-quote>', '<span>'), 'U13_SUPERLATIVE');
  // A provider name inside retained source text is still a leak, marked or not.
  gateThrows(html.replace(SOURCE_TITLE, `Kalodata ${SOURCE_TITLE}`), 'G08_PROVIDER_NAME');
  // Authored text is unaffected by the source marker.
  gateThrows(html.replace('</body>', '<p>Sản phẩm synthetic 209 là lựa chọn tốt nhất.</p></body>'), 'U13_SUPERLATIVE');
  // The unmarked variant is exactly what the failing run rendered before the fix.
  assert.throws(() => assertMarketBusinessGate(metricMethodSection(captureSnapshot(), 'M03', undefined, citations)
    .replaceAll('<span data-quote>', '<span>'), { presentation: false }), /MARKET_BUSINESS_GATE_FAILED:U13_SUPERLATIVE/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

const period = { startDate: '2025-01-01', endDate: '2025-12-31', dayCount: 365 };

/** One MARKET report input; only the renderer-identity dispatch is under test here. */
function marketReportInput(descriptiveMethods?: DescriptiveMarketMethods): AutomationReportInput {
  const run: ResearchAutomationRun = {
    contractVersion: 'research-automation-run-v1', runId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222',
    revision: 3, status: 'RENDERING', country: 'VN', mode: 'PRODUCT', keyword: 'bình giữ nhiệt', description: null, interview: null,
    requestedPeriod: period, reports: ['MARKET'], definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
    usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    run,
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId: run.workspaceId, country: 'VN', mode: 'PRODUCT', keyword: run.keyword,
      description: null, interview: null, requestedPeriod: period, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: run.workspaceId, runId: run.runId, definition: 'Sản phẩm mẫu',
      includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId: run.runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED',
      productCards: [], coverage: [], limitations: [], comparables: [] },
    captures: [], ...(descriptiveMethods ? { descriptiveMethods } : {}),
  };
}

function descriptiveMethods(methodVersion: string): DescriptiveMarketMethods {
  const descriptor = descriptiveMarketFixture().descriptor;
  const built = buildDescriptiveMarketMethods({ ...descriptor, sourcePackage: {
    packageId: '33333333-3333-4333-8333-333333333333', version: 1, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64),
  } }).output;
  // The generated type still narrows methodVersion to 1.0.0; SYNC-1 widens it to 1.0.0|1.1.0. The dispatch under test is
  // runtime behavior, so the synthetic version is asserted here rather than pinned to the current generated literal.
  return { ...built, methodVersion } as DescriptiveMarketMethods;
}

const rendererVersion = (input: AutomationReportInput): string => (buildResearchAutomationReport(input, 'MARKET').semantic as { rendererVersion: string }).rendererVersion;

test('a non-legacy descriptive method version renders under the new kit identity; legacy 1.0.0 keeps v12', () => {
  assert.equal(rendererVersion(marketReportInput()), 'automation-report-kit-v12');
  assert.equal(rendererVersion(marketReportInput(descriptiveMethods('1.0.0'))), 'automation-report-kit-v12');
  assert.equal(rendererVersion(marketReportInput(descriptiveMethods('1.1.0'))), 'automation-report-kit-v13');
});

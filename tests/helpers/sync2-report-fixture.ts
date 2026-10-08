import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { descriptiveMarketFixture } from './descriptive-market-fixture.js';

/** Synthetic immutable legacy/new-policy draft boundary; no discovery membership or provider calls. */
export function sync2ReportFixture(methodVersion: '1.0.0' | '1.1.0' = '1.1.0'): AutomationReportInput {
  const period = { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 };
  const runId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
  const fixture = descriptiveMarketFixture();
  const descriptiveMethods = buildDescriptiveMarketMethods({ ...fixture.descriptor,
    sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) },
  }, { methodVersion }).output;
  return {
    run: {
      contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 3, status: 'RENDERING', country: 'VN', mode: 'CATEGORY',
      keyword: 'Synthetic product', description: null, interview: null, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'],
      definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
      usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [],
      createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY',
      keyword: 'Synthetic product', description: null, interview: null, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic declared scope',
      includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: ['owner:addition'] },
    collection: null, captures: [], descriptiveMethods,
  };
}

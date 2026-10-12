import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpandedSearchRunner } from '../../src/modules/analysis/research-automation/expanded-search.js';
import { SearchCallBudget } from '../../src/modules/analysis/research-automation/expanded-search-queries.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';

const filter: KeywordMeaningFilterData = {
  contractVersion: 'l9-keyword-data-v1', dataVersion: 'synthetic-kw-209-v1', category: 'synthetic',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'],
  exclusions: [{ term: 'thạch dứa', reason: 'Synthetic separate product' }],
};

function transport(): ProviderTransport {
  return {
    now: () => Date.parse('2026-10-11T00:00:00.000Z'),
    sleep: async () => undefined,
    fetch: async input => {
      const query = new URL(input.toString()).searchParams.get('q');
      return new Response(JSON.stringify({ search_parameters: { q: query }, organic_results: [
        { position: 1, title: 'Thạch dừa synthetic review', link: 'https://example.test/included', snippet: null },
        { position: 2, title: 'Thạch dứa synthetic review', link: 'https://example.test/excluded', snippet: null },
        { position: 3, title: 'Tin synthetic không liên quan', link: 'https://example.test/unclear', snippet: null },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

test('P5 expanded search admits only filtered web rows and retains exclusion accounting', async () => {
  const runner = createExpandedSearchRunner({
    run: { runId: 'synthetic-run', mode: 'CATEGORY', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' },
    country: 'VN', selectedProductRefs: [], peerProductRefs: [] },
    apiKey: 'synthetic-api-key', transport: transport(), budget: new SearchCallBudget({ trends: 0, search: 3 }),
  });
  const evidence = await runner.execute({ version: 'expanded-search-request-v1', confirmedProducts: ['thạch dừa'], confirmedBrands: [], requestedWindow: null, siteDomain: null }, filter);
  assert.equal(evidence.length, 3);
  const first = evidence[0]!;
  assert.equal(first.rows.length, 3);
  assert.equal(first.mainCount, 1);
  assert.deepEqual(first.admission.includedRecordIds, ['serpapi-expanded-1-serpapi-0001#1']);
  assert.deepEqual(first.admission.result.accounting, { included: 1, excluded: 1, unclear: 1,
    byReason: { EXCLUDED_TERM: 1, NO_KEYWORD_MATCH: 1 } });
  assert.equal(first.admission.result.results[1]!.excludedBy, 'thạch dứa');
});

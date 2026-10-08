import assert from 'node:assert/strict';
import test from 'node:test';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { buildResearchReviewCorpus } from '../../src/modules/analysis/research-automation/review-corpus.js';
import { selectExactShopeeListings, validateExactShopeeCollection } from '../../src/modules/foundation/shopee-exact-selection.js';
import { digest, jsonBytes } from '../../src/modules/foundation/shopee-selection.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { ShopeeExactRequest } from '../../contracts/foundation/shopee-exact-request.generated.js';

/** Fixed synthetic v2 source and marker-free v1 report inputs, captured from pre-consumer a8e9b843. */
export async function historicalPrivateCompatibilityHashes() {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const runId = '22222222-2222-4222-8222-222222222222';
  const at = '2026-10-02T00:00:00.000Z';
  const request: ShopeeExactRequest = { contractVersion: '2.0.0', runKey: `auto-${runId}`, topic: 'Synthetic replay',
    selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Synthetic owner source', acquiredAt: at },
    productUrls: ['https://shopee.vn/product/2001/3001'] };
  const raw = jsonBytes([{ shopId: '2001', itemId: '3001', reviewId: '101', authorId: '99901',
    comment: 'Exact first synthetic text.', ratingStar: 5 }, { shopId: '2001', itemId: '3001', reviewId: '102',
    comment: 'Exact second synthetic text.', ratingStar: null }]);
  const selection = selectExactShopeeListings(request);
  const capture = await new FixtureShopeeCollector(raw).collect(selection.selected);
  capture.actor.retrievedAt = at;
  const packet = validateExactShopeeCollection({ contractVersion: '2.0.0', selectionBasis: request.selectionBasis,
    collectionId: '33333333-3333-4333-8333-333333333333', runKey: request.runKey, requestSha256: digest(jsonBytes(request)),
    createdAt: at, mode: 'fixture', selected: selection.selected, selectionWarnings: selection.warnings,
    collectorWarnings: capture.warnings, actor: capture.actor, pages: [{ sha256: digest(raw), byteSize: raw.length, offset: 0 }] });
  const corpus = buildResearchReviewCorpus({ packet, request, sha256: digest(jsonBytes(packet)),
    pages: [{ bytes: raw, sha256: digest(raw), offset: 0 }] });
  const period = { startDate: '2025-10-01', endDate: '2026-09-30', dayCount: 365 };
  const input: AutomationReportInput = {
    run: { contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 3, status: 'RENDERING', country: 'VN',
      mode: 'PRODUCT', keyword: 'Synthetic replay', description: null, interview: null, requestedPeriod: period,
      reports: ['MARKET', 'INSIGHT'], definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
      usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: at, updatedAt: at },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'PRODUCT', keyword: 'Synthetic replay',
      description: null, interview: null, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic exact source',
      includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: request.productUrls },
    collection: { contractVersion: 'research-automation-step-result-v1', runId, stepId: 'COLLECTION', outcome: 'PARTIAL', productCards: [],
      comparables: [], coverage: [], limitations: [], exactShopee: { collectionId: packet.collectionId,
        collectionSha256: digest(jsonBytes(packet)), requestSha256: packet.requestSha256 } }, captures: [], reviewCorpus: corpus.output,
  };
  const insight = buildResearchAutomationReport(input, 'INSIGHT');
  const market = buildResearchAutomationReport(input, 'MARKET');
  return { rawPage: digest(raw), rawPacket: digest(jsonBytes(packet)), rawCorpus: digest(corpus.bytes),
    insightSemantic: digest(jsonBytes(insight.semantic)), insightHtml: digest(insight.html),
    marketSemantic: digest(jsonBytes(market.semantic)), marketHtml: digest(market.html) };
}

test('historical raw v2 corpus and marker-free v1 report SHA256 stay byte-identical to pre-consumer baseline', async () => {
  assert.deepEqual(await historicalPrivateCompatibilityHashes(), {"rawPage":"c5d52855d1d08f6ab4f3153a721d037a47d4fab20da0d6a6a52fd38b837ac297","rawPacket":"2970a44f6f35285efd6449e83368247e431decc2379337ea570ffa741f1fc2e1","rawCorpus":"ada1806822a31a95de7ceeb5c8db1f105e31f5b2601a7e6cd6fd6c1a8b348de5","insightSemantic":"7cbfbcbc22955c8625ddceb1cb3008d3a8e2fda614585bdfda97154e34e3c85c","insightHtml":"da43f057f66c821e4c21369a146c7e0277472db8f813c80ec4c5613a12688002","marketSemantic":"a029f2d029ab9bce2fa36e05a0872f77d4e2c6014775ab78109b61dc9fe30544","marketHtml":"4804012b4bf193e970c46c5383ffd63387d2cdbc6f84810f0a5c0c2f5785de08"});
});

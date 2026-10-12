import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { TestContext } from 'node:test';
import { ApifyShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationExactShopeeBridge, type ExactShopeeRunInput } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { reviewCollectionPolicy } from '../../src/modules/analysis/research-automation/review-collection-policy.js';

export const policyHash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export async function reviewPolicyFixture(t: TestContext, counts = [30, 300], cost: number | null = null) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-policy-'));
  const db = openDatabase({ databasePath: path.join(root, 'synthetic.sqlite') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const salt = Buffer.alloc(32, 29), privacy = createShopeePrivateIntake({ salt, keyId: '11111111-1111-4111-8111-111111111111' });
  const policy = reviewCollectionPolicy({ contractVersion: 'automation-review-collection-policy-v1', selectionBasis: 'OWNER_EXACT_URL',
    targetReviews: 300, hardMaximum: 500, comparisonTextMinimum: 30, saturation: 'SOURCE_BOUND_CODING_UNAVAILABLE',
    privateSource: { contractVersion: 'automation-private-shopee-source-v1', profile: privacy.profile },
    collector: { actorId: 'zen-studio/shopee-product-reviews-scraper', maxReviewsPerProduct: 300, contentFilter: 'with comments', maxChargeUsd: 1 } });
  const input: ExactShopeeRunInput = { runId: '22222222-2222-4222-8222-222222222222',
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId: '33333333-3333-4333-8333-333333333333',
      country: 'VN', mode: 'CATEGORY', keyword: 'Synthetic review policy', description: null, interview: null,
      requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, reports: ['INSIGHT'],
      privateShopeeSource: policy.privateSource, reviewCollectionPolicy: policy },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: '33333333-3333-4333-8333-333333333333',
      runId: '22222222-2222-4222-8222-222222222222', definition: 'Explicit owner selection, no coverage admission',
      selectedProductIds: [], peerProductIds: [], includeTerms: [], excludeTerms: [],
      exactShopeeUrls: counts.map((_, i) => `https://shopee.vn/product/10/${101 + i}`) }, scopeConfirmedAt: '2026-10-09T00:00:00.000Z' };
  const calls: string[] = [];
  let onPage = () => {};
  const rows = counts.flatMap((count, product) => Array.from({ length: count }, (_, i) => ({ shopId: '10', itemId: String(101 + product),
    reviewId: String((product + 1) * 1000 + i + 1), comment: i < 30 ? 'Equal literal source text.' : '', ratingStar: i % 2 ? 5 : null,
    authorId: '987654321', author: 'SYNTHETIC_AUTHOR', profileUrl: 'https://example.test/SYNTHETIC_PROFILE' })));
  const transport: typeof fetch = async (urlLike, init) => {
    const url = new URL(String(urlLike)); calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/runs')) {
      assert.equal(url.searchParams.get('maxTotalChargeUsd'), '1');
      const body = JSON.parse(String(init?.body)); assert.equal(body.maxReviewsPerProduct, 300);
      assert.equal(body.startUrls.length, counts.length);
      const journal = JSON.parse(await fs.readFile(path.join(root, 'journal', `auto-${input.runId}`, 'start.json'), 'utf8'));
      assert.deepEqual(journal.input, body); assert.equal(journal.maxChargeUsd, 1); assert.match(journal.requestSha256, /^[a-f0-9]{64}$/);
      return Response.json({ data: { id: 'PolicyRun', defaultDatasetId: 'PolicyDataset', status: 'SUCCEEDED', buildId: 'PolicyBuild', usageTotalUsd: cost } });
    }
    onPage();
    const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
    return Response.json(rows.slice(offset, offset + limit), { headers: { 'x-apify-pagination-total': String(rows.length) } });
  };
  const factory = () => ({ collector: new ApifyShopeeCollector({ token: 'synthetic-token', journalRoot: path.join(root, 'journal'),
    maxChargeUsd: 1, maxReviewsPerProduct: 300, retainReturnedPages: true, fetch: transport }, privacy), requestsIssued: () => calls.length });
  const bridge = new AutomationExactShopeeBridge(db, artifacts, undefined, undefined, { policy, factory });
  const binding = { workspaceId: input.start.workspaceId, runId: input.runId, startSha256: policyHash(input.start),
    scopeSha256: policyHash(input.scope), scopeConfirmedAt: input.scopeConfirmedAt, confirmedSourceSetSha256: 'a'.repeat(64) };
  return { root, db, artifacts, input, binding, policy, privacy, factory, bridge, calls, salt,
    setOnPage: (callback: () => void) => { onPage = callback; } };
}

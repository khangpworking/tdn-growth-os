import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { TestContext } from 'node:test';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { PublicCollectedPages, PublicReviewEnvelope } from '../../src/platform/collectors/shopee-public-reviews.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { ShopeeReviewAnalysisService } from '../../src/modules/analysis/shopee-review-service.js';
import { selectShopeeListings, validateListingRequest } from '../../src/modules/foundation/shopee-selection.js';
import { fixture, startRun, driveUntil, autorun } from '../helpers/autorun-harness.js';

const json = (value: unknown) => Buffer.from(canonicalJson(value));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const ATTEMPTED_AT = '2026-11-03T00:00:00.000Z';
export const COMPLETED_AT = ['2026-11-03T00:00:09.000Z', '2026-11-03T00:00:19.000Z'] as const;
// Identities and names match captureFiles()'s synthetic Metric rows. Names are retained by
// the real auto-run preparation/pick services, never added to v4's closed selection schema.
export const PRODUCTS = [
  { itemId: '101', shopId: '201', productUrl: 'https://shopee.vn/product/201/101', name: 'Synthetic jar mini' },
  { itemId: '102', shopId: '202', productUrl: 'https://shopee.vn/product/202/102', name: 'Synthetic jar large' },
] as const;

export function collectionInput(overlapOnly = false): PublicCollectedPages {
  const envelopes: PublicReviewEnvelope[] = PRODUCTS.map((p, index) => {
    const row = (reviewId: string, sourceRow: number, comment: string | null) => ({
      reviewId, shopId: p.shopId, itemId: p.itemId, postedAtLocal: null,
      createdAt: index === 0 ? '2026-11-03T03:04:00+07:00' : '2026-11-01T08:02:00+07:00',
      variation: '  Synthetic variant\n', ratingStar: 4, ratingState: 'VALID' as const,
      comment, attributes: ['Synthetic material', 'Synthetic size'], contentType: 'COMMENT' as const,
      sourcePage: 2 + index, sourceUrl: p.productUrl, sourceRow, admissionReasons: [],
    });
    const rows = overlapOnly
      ? index === 0 ? [row('synthetic-review-a', 0, 'Changed on the second collection')] : []
      : index === 0 ? [row('synthetic-review-a', 0, '  Exact synthetic comment\n<&>  '), row('synthetic-stars-only', 1, '')]
        : [row('synthetic-review-b', 0, 'Synthetic comment B')];
    return {
      contractVersion: 'shopee-public-sanitized-result-v1', jobId: '10000000-0000-4000-8000-000000000001',
      productUrl: p.productUrl, shopId: p.shopId, itemId: p.itemId, maxReviewsPerProduct: 20,
      complete: true, stopReason: 'last_page', filter: 'HAS_COMMENTS', expectedWithComments: rows.length,
      startedAt: ATTEMPTED_AT, finishedAt: COMPLETED_AT[index]!, excluded: [], diagnostics: [],
      pages: [{ page: 2 + index, cards: rows.length, collected: rows.length, ids: rows.map(r => r.reviewId) }], rows,
    };
  });
  let offset = 0;
  return {
    mode: 'fixture', confirmedSourceSetSha256: 'c'.repeat(64), providerId: 'shopee-public-review',
    mappingRevision: 'shopee-public-review-row-v1', maxReviewsPerProduct: 20, usageTotalUsd: 0, warnings: [],
    attemptedAt: ATTEMPTED_AT, reused: false, envelopes,
    pages: envelopes.map(e => { const page = { bytes: json(e.rows), offset }; offset += e.rows.length; return page; }),
    listings: envelopes.map((e, index) => ({
      productUrl: e.productUrl, shopId: e.shopId, itemId: e.itemId,
      inputSha256: hash(json({ url: e.productUrl, max_comments: 20 })), jobId: e.jobId,
      state: 'succeeded', stopCode: null, createdAt: ATTEMPTED_AT, observedAt: COMPLETED_AT[index]!,
      attemptedAt: ATTEMPTED_AT, complete: true, stopReason: e.stopReason,
      resultAvailable: true, resultSha256: hash(json(e)), resultByteSize: json(e).length,
      requestCount: 5, requestCountUncertain: false, timedOut: false, cancelIntent: false,
    })),
  };
}

export async function rawDbFixture(t: TestContext, names = true) {
  const f = await fixture(t, names ? 'on' : 'off');
  const foundation = new ShopeeCollectionService(f.db, f.artifacts);
  async function saveRun(overlapOnly = false) {
    const runId = await startRun(f.service);
    if (names) {
      // Stop before collection: only the in-process synthetic Metric capture has run.
      await driveUntil(f.service, () => autorun(f.db, runId)?.phase === 'CONFIRM');
    }
    const collected = collectionInput(overlapOnly);
    const request = { contractVersion: '2.0.0', runKey: `auto-${runId}`, topic: 'Synthetic raw review load',
      selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Synthetic exact products', acquiredAt: ATTEMPTED_AT },
      productUrls: PRODUCTS.map(p => p.productUrl) };
    const source = await foundation.savePublicExact(json(request), collected);
    return { runId, source };
  }
  return { ...f, foundation, saveRun, ...await saveRun() };
}

/** A real, nonempty analysis row makes rule 9 detect accidental analysis deletion. */
export async function seedExistingAnalysis(f: Awaited<ReturnType<typeof rawDbFixture>>) {
  const request = validateListingRequest(JSON.parse(await fs.readFile(new URL('./shopee-listings.synthetic.json', import.meta.url), 'utf8')));
  request.runKey = 'synthetic-unrelated-analysis';
  const collected = await new FixtureShopeeCollector(await fs.readFile(new URL('./shopee-reviews.synthetic.json', import.meta.url)))
    .collect(selectShopeeListings(request).selected);
  const source = await f.foundation.save(json(request), collected);
  await new ShopeeReviewAnalysisService({ db: f.db, artifactStore: f.artifacts, reader: f.foundation,
    ...(process.env.TDN_PYTHON ? { pythonExecutable: process.env.TDN_PYTHON } : {}) }).analyze(source.packet.collectionId);
}

// The v4 public-row schema only admits minute-precision +07:00. The existing v1
// verified reader retains UTC offsets, so it owns the brief's UTC-input case.
export async function utcCollectionFixture(t: TestContext) {
  const f = await fixture(t, 'off');
  const runId = await startRun(f.service);
  const request = validateListingRequest({ contractVersion: '1.0.0', runKey: `auto-${runId}`,
    topic: 'Synthetic UTC review input', period: { start: '2026-11-01T00:00:00+07:00', end: '2026-11-03T23:59:59+07:00' },
    source: { label: 'Synthetic UTC listing selection', acquiredAt: ATTEMPTED_AT },
    listings: PRODUCTS.map((p, index) => ({ platform: 'shopee', shopId: p.shopId, itemId: p.itemId,
      productKey: `synthetic-product-${index}`, groupingBasis: 'Synthetic distinct products', productName: p.name,
      productUrl: p.productUrl, periodRevenueVnd: String(100 - index), revenuePrecision: 'exact' })) });
  const rows = collectionInput().envelopes.flatMap(e => e.rows).map(row => ({ ...row,
    createdAt: row.itemId === '101' ? '2026-11-02T20:04:05Z' : '2026-11-01T01:02:03+00:00' }));
  const collected = await new FixtureShopeeCollector(json(rows)).collect(selectShopeeListings(request).selected);
  const source = await new ShopeeCollectionService(f.db, f.artifacts).save(json(request), collected);
  return { ...f, runId, source };
}

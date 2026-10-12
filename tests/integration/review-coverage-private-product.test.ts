import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ApifyShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { jsonBytes } from '../../src/modules/foundation/shopee-selection.js';
import { privateProductReviewAccounting } from '../../src/modules/analysis/research-automation/review-coverage-selection.js';

async function fixture(t: TestContext, count: number, withText = count, cap = 300, reportedTotal = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-coverage-product-'));
  const db = openDatabase({ databasePath: path.join(root, 'synthetic.sqlite') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const salt = Buffer.alloc(32, 17), keyId = '11111111-1111-4111-8111-111111111111';
  const calls: string[] = [];
  const rows = Array.from({ length: count }, (_, index) => ({ reviewId: String(index + 1), shopId: '10', itemId: '101',
    comment: index < withText ? 'Two equal texts remain two source records.' : '', ratingStar: 5,
    authorId: '918273645', author: 'SYNTHETIC_PRIVATE_NAME', profileUrl: 'https://example.test/SYNTHETIC_PRIVATE_PROFILE' }));
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/runs')) {
      assert.equal(url.searchParams.get('maxTotalChargeUsd'), '1');
      const body = JSON.parse(String(init?.body)); assert.equal(body.maxReviewsPerProduct, cap);
      assert.deepEqual(body.startUrls, [{ url: 'https://shopee.vn/product/10/101' }]);
      const frozen = JSON.parse(await fs.readFile(path.join(root, 'journal', 'review-coverage-private-product', 'start.json'), 'utf8'));
      assert.equal(frozen.maxChargeUsd, 1); assert.deepEqual(frozen.input, body);
      assert.match(frozen.requestSha256, /^[a-f0-9]{64}$/);
      return Response.json({ data: { id: 'SyntheticCoverageRun', defaultDatasetId: 'SyntheticCoverageDataset', status: 'SUCCEEDED',
        buildId: 'SyntheticCoverageBuild', usageTotalUsd: null } });
    }
    assert.match(url.pathname, /\/datasets\/SyntheticCoverageDataset\/items$/);
    const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
    return Response.json(rows.slice(offset, offset + limit), { headers: reportedTotal ? { 'x-apify-pagination-total': String(count) } : {} });
  };
  const factory = () => new ApifyShopeeCollector({ token: 'synthetic-token', maxChargeUsd: 1,
    journalRoot: path.join(root, 'journal'), maxReviewsPerProduct: cap, retainReturnedPages: true, fetch: transport },
  createShopeePrivateIntake({ salt, keyId }));
  const request = jsonBytes({ contractVersion: '2.0.0', runKey: 'review-coverage-private-product', topic: 'Synthetic exact product stop evidence',
    selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Synthetic owner-picked listing, not authenticated revenue coverage', acquiredAt: '2026-10-09T00:00:00.000Z' },
    productUrls: ['https://shopee.vn/product/10/101'] });
  return { root, db, artifacts, factory, calls, request, salt };
}

for (const [count, text, stop, comparable] of [
  [29, 29, 'SOURCE_EXHAUSTED', false], [30, 30, 'SOURCE_EXHAUSTED', true],
  [300, 29, 'A_FIXED_COUNT', false], [300, 30, 'A_FIXED_COUNT', true],
] as const) test(`actual configured private capture: ${count} reviews/${text} text preserves ${stop} and comparison threshold`, async t => {
  const f = await fixture(t, count, text);
  const foundation = new ShopeeCollectionService(f.db, f.artifacts);
  const source = await foundation.collectExact(f.request, f.factory(), { privacy: true });
  const accounting = privateProductReviewAccounting(source);
  assert.equal(accounting.stop, stop); assert.equal(accounting.retainedReviews, count); assert.equal(accounting.textReviews, text);
  assert.equal(accounting.meetsComparisonTextMinimum, comparable); assert.equal(accounting.hardMaximum, 500);
  assert.equal(accounting.saturation, 'SOURCE_BOUND_CODING_UNAVAILABLE');
  assert.equal(source.packet.actor.settings.maxChargeUsd, 1); assert.equal(source.packet.actor.usageTotalUsd, null);
  const projection = await foundation.readPrivateProjection(source.packet.collectionId);
  if (text > 1) {
    assert.equal(projection.records[0]!.authorIdentity.hash, projection.records[1]!.authorIdentity.hash);
    assert.notDeepEqual(projection.records[0]!.locator, projection.records[1]!.locator);
  }
  const publicBytes = jsonBytes(accounting);
  for (const forbidden of ['918273645', 'SYNTHETIC_PRIVATE_NAME', 'SYNTHETIC_PRIVATE_PROFILE', f.salt.toString('hex'), 'authorIdentity', 'keyId'])
    assert.equal(publicBytes.includes(forbidden), false);
  const calls = f.calls.length, changes = f.db.prepare('SELECT total_changes() n').get();
  f.db.pragma('query_only=ON');
  try {
    const reread = await new ShopeeCollectionService(f.db, f.artifacts).readExact(source.packet.collectionId, { privacy: true });
    assert.deepEqual(privateProductReviewAccounting(reread), accounting);
    assert.deepEqual(await new ShopeeCollectionService(f.db, f.artifacts).collectExact(f.request, f.factory(), { privacy: true }), source);
    assert.equal(f.calls.length, calls); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  } finally { f.db.pragma('query_only=OFF'); }
});

test('hard500 is preserved, missing dataset total stays missing, and invalid501 refuses before transport', async t => {
  const f = await fixture(t, 500, 30, 500, false);
  const source = await new ShopeeCollectionService(f.db, f.artifacts).collectExact(f.request, f.factory(), { privacy: true });
  const accounting = privateProductReviewAccounting(source);
  assert.equal(accounting.retainedReviews, 500); assert.equal(accounting.providerDatasetRows, null);
  assert.equal(accounting.collectorStopReason, 'collection_limit_reached');
  assert.equal(accounting.stop, 'A_FIXED_COUNT', 'first documented300 threshold precedes hard500; retained surplus is disclosed');
  const prior = f.calls.length;
  assert.throws(() => new ApifyShopeeCollector({ token: 'synthetic-token', maxChargeUsd: 1,
    journalRoot: path.join(f.root, 'journal'), maxReviewsPerProduct: 501, fetch: async () => { throw new Error('Must not dispatch'); } }), /Reviews per product must be an integer from 1 through 500/);
  assert.equal(f.calls.length, prior);
});

test('independent source services share the existing journal fence and exact retry never redispatches paid capture', async t => {
  const f = await fixture(t, 30);
  const first = new ShopeeCollectionService(f.db, f.artifacts), second = new ShopeeCollectionService(f.db, f.artifacts);
  const results = await Promise.allSettled([
    first.collectExact(f.request, f.factory(), { privacy: true }), second.collectExact(f.request, f.factory(), { privacy: true }),
  ]);
  const completed = results.find(value => value.status === 'fulfilled'); assert.ok(completed && completed.status === 'fulfilled');
  assert.equal(f.calls.filter(call => call.startsWith('POST ')).length, 1);
  const before = f.calls.length;
  assert.deepEqual(await second.collectExact(f.request, f.factory(), { privacy: true }), completed.value);
  const altered = JSON.parse(f.request.toString()); altered.topic = 'Different frozen source identity';
  await assert.rejects(second.collectExact(jsonBytes(altered), f.factory(), { privacy: true }));
  assert.equal(f.calls.length, before);
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import {
  classifyExactShopee, countReviewsPerListing, exactShopeeOutcomeLimitation, type ExactShopeeListingCount,
} from '../../src/modules/analysis/research-automation/exact-shopee-outcome.js';
import { REVIEW_DEPENDENT_SECTIONS } from '../../src/modules/analysis/research-automation/reports.js';
import { ApifyShopeeCollector, FixtureShopeeCollector, providerStatusMessage } from '../../src/platform/collectors/apify-shopee.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { selectExactShopeeListings } from '../../src/modules/foundation/shopee-exact-selection.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { digest } from '../../src/modules/foundation/shopee-selection.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';

// Owner contract (#123): a failed or partial review collection is classified, never retried,
// and explained in plain Vietnamese without provider names or codes.

const listing = (shopId: string, itemId: string) => ({ shopId, itemId, productUrl: `https://shopee.vn/product/${shopId}/${itemId}` });
const page = (rows: unknown[]) => ({ bytes: Buffer.from(JSON.stringify(rows)) });
const counts = (...reviews: number[]): ExactShopeeListingCount[] => reviews.map((value, index) => ({ listingUrl: `https://shopee.vn/product/1/${index + 1}`, reviews: value }));
const PROVIDERS = /apify|zen-studio|serpapi|kalodata|metric|pageindex|tradeint|dami|opencli|agent-reach/i;

test('classification follows the rule table in order', () => {
  const cases: Array<[string, string | null, number[], string]> = [
    ['TIMED-OUT', null, [0, 0], 'PROVIDER_TIMEOUT_NO_REVIEWS'],
    ['FAILED', 'This run hit its time limit before any reviews were collected', [0], 'PROVIDER_TIMEOUT_NO_REVIEWS'],
    ['FAILED', 'Actor TIMED OUT while waiting', [0], 'PROVIDER_TIMEOUT_NO_REVIEWS'],
    ['FAILED', 'Reviews could not be retrieved right now. Please try again later.', [0, 0], 'PROVIDER_BLOCKED'],
    ['FAILED', null, [0], 'PROVIDER_BLOCKED'],
    ['ABORTED', 'time limit', [0], 'PROVIDER_BLOCKED'],
    // Edge case: a run that did not fail but returned no rows still leaves the reader without reviews.
    ['SUCCEEDED', null, [0, 0, 0], 'PROVIDER_BLOCKED'],
    ['FIXTURE', null, [0], 'PROVIDER_BLOCKED'],
    ['SUCCEEDED', null, [3, 0, 1, 0, 0], 'PARTIAL_LISTINGS'],
    ['FAILED', 'time limit', [2, 0], 'PARTIAL_LISTINGS'],
    ['SUCCEEDED', null, [1, 4], 'OK'],
    ['FAILED', null, [1], 'OK'],
  ];
  for (const [actorStatus, statusMessage, reviews, expected] of cases) {
    assert.equal(classifyExactShopee({ actorStatus, statusMessage, counts: counts(...reviews) }), expected, `${actorStatus} ${statusMessage} ${reviews}`);
  }
});

test('counting matches requested listings by item and shop as strings and ignores other rows', () => {
  const selected = [listing('100', '200'), listing('100', '201'), listing('300', '200')];
  const result = countReviewsPerListing(selected, [
    page([{ shopId: 100, itemId: 200 }, { shopId: '100', itemId: '200' }, { itemId: '201' }, { shopId: '999', itemId: '201' }]),
    page([{ shopId: '300', itemId: 200 }, { shopId: '7', itemId: '7' }, null, 'text', { comment: 'no ids' }]),
    page([]),
  ]);
  assert.deepEqual(result, [
    { listingUrl: 'https://shopee.vn/product/100/200', reviews: 2 },
    { listingUrl: 'https://shopee.vn/product/100/201', reviews: 1 },
    { listingUrl: 'https://shopee.vn/product/300/200', reviews: 1 },
  ]);
  assert.deepEqual(countReviewsPerListing(selected, []).map(row => row.reviews), [0, 0, 0]);
});

test('only a non-OK outcome adds a limitation, with a plain count and no provider name', () => {
  assert.equal(exactShopeeOutcomeLimitation('OK', counts(1, 2)), null);
  const blocked = exactShopeeOutcomeLimitation('PROVIDER_BLOCKED', counts(0, 0, 0, 0, 0))!;
  assert.deepEqual([blocked.code, blocked.provider], ['EXACT_SHOPEE_REVIEWS_BLOCKED', 'apify-shopee']);
  assert.match(blocked.message, /^0\/5 sản phẩm có đánh giá\./);
  assert.equal(exactShopeeOutcomeLimitation('PROVIDER_TIMEOUT_NO_REVIEWS', counts(0))!.code, 'EXACT_SHOPEE_REVIEWS_TIMEOUT');
  const partial = exactShopeeOutcomeLimitation('PARTIAL_LISTINGS', counts(4, 0, 2, 0, 0))!;
  assert.deepEqual([partial.code, partial.message], ['EXACT_SHOPEE_REVIEWS_PARTIAL', '2/5 sản phẩm có đánh giá.']);
  for (const value of [blocked, partial]) assert.doesNotMatch(value.message, PROVIDERS);
});

test('run page labels for the three outcomes are plain Vietnamese without provider names', async () => {
  // The frontend module resolves differently from the server typecheck, so read its label map as text.
  const source = await fs.readFile('frontend/src/research-automation/run-status.ts', 'utf8');
  const label = (code: string) => new RegExp(`^  ${code}: '([^']+)',$`, 'm').exec(source)?.[1];
  const blocked = 'Không lấy được đánh giá khách hàng Shopee. Báo cáo vẫn được tạo nhưng thiếu phần ý kiến khách hàng.';
  assert.equal(label('EXACT_SHOPEE_REVIEWS_BLOCKED'), blocked);
  assert.equal(label('EXACT_SHOPEE_REVIEWS_TIMEOUT'), blocked);
  assert.equal(label('EXACT_SHOPEE_REVIEWS_PARTIAL'), 'Chỉ lấy được đánh giá Shopee cho một phần sản phẩm. Phần ý kiến khách hàng trong báo cáo chưa đủ.');
  for (const code of ['EXACT_SHOPEE_REVIEWS_BLOCKED', 'EXACT_SHOPEE_REVIEWS_TIMEOUT', 'EXACT_SHOPEE_REVIEWS_PARTIAL']) assert.doesNotMatch(label(code)!, PROVIDERS);
});

test('provider status message is trimmed, stripped of control characters and capped at 300 chars', () => {
  assert.equal(providerStatusMessage('  Reviews could not\nbe retrieved\u0000 now.\t '), 'Reviews could not be retrieved  now.');
  assert.equal(providerStatusMessage('x'.repeat(400))!.length, 300);
  for (const value of [undefined, null, 42, {}, '   ', '\u0007']) assert.equal(providerStatusMessage(value), null);
});

async function tempRoot(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-exact-outcome-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

const exactRequest = { contractVersion: '2.0.0', runKey: 'auto-synthetic-outcome', topic: 'Synthetic jelly', selectionBasis: 'OWNER_EXACT_URL',
  source: { label: 'Synthetic exact listing', acquiredAt: '2026-10-01T00:00:00.000Z' }, productUrls: ['https://shopee.vn/product/100/200'] };

test('the live collector carries the last provider status message beside, not inside, the actor record', async t => {
  const selected = selectExactShopeeListings(exactRequest as never).selected;
  const run = { data: { id: 'RUN1', defaultDatasetId: 'DATA1', defaultKeyValueStoreId: 'STORE1', buildId: 'BUILD1', status: 'FAILED',
    statusMessage: 'Reviews could not be retrieved right now.\n', usageTotalUsd: 0.01, options: { maxTotalChargeUsd: 1 } } };
  const fetchCalls: string[] = [];
  const live = new ApifyShopeeCollector({ token: 'SYNTHETIC', maxChargeUsd: 1, journalRoot: await tempRoot(t), sleep: async () => {},
    fetch: async url => { fetchCalls.push(new URL(String(url)).pathname); return new Response(String(url).includes('/datasets/') ? '[]' : JSON.stringify(run)); } });
  const collected = await live.collect(selected, digest(Buffer.from(canonicalJson(exactRequest))), exactRequest.runKey);
  assert.equal(collected.actorStatusMessage, 'Reviews could not be retrieved right now.');
  assert.equal(collected.actor.status, 'FAILED');
  assert.equal(JSON.stringify(collected.actor).includes('Reviews could not'), false);
  assert.ok(fetchCalls.some(value => value.includes('/datasets/')));
});

test('the provider message never enters the frozen collection packet', async t => {
  const request = Buffer.from(canonicalJson(exactRequest));
  const selected = selectExactShopeeListings(exactRequest as never).selected;
  const collected = await new FixtureShopeeCollector(Buffer.from(JSON.stringify([{ shopId: '100', itemId: '200', comment: 'Synthetic review' }]))).collect(selected);
  const service = async () => {
    const root = await tempRoot(t);
    const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: () => new Date('2026-10-02T00:00:00.000Z') }).db;
    t.after(() => db.close());
    return { root, collections: new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(root, 'artifacts'))) };
  };
  // Each fresh save mints its own collectionId and createdAt; everything else must match.
  const identity = ({ collectionId: _id, createdAt: _at, ...rest }: Record<string, unknown>) => rest;
  const plain = await (await service()).collections.saveExact(request, collected);
  const store = await service();
  const noted = await store.collections.saveExact(request, { ...collected, actorStatusMessage: 'Synthetic provider note' });
  assert.deepEqual(identity(noted.packet as never), identity(plain.packet as never));
  // Replaying the same pages without the message is the same collection, byte for byte.
  const replay = await store.collections.saveExact(request, collected);
  assert.equal(replay.sha256, noted.sha256);
  for (const file of await fs.readdir(path.join(store.root, 'artifacts'), { recursive: true })) {
    const full = path.join(store.root, 'artifacts', String(file));
    if ((await fs.stat(full)).isFile()) assert.equal((await fs.readFile(full, 'utf8')).includes('Synthetic provider note'), false, String(file));
  }
});

test('review-dependent sections use the catalog titles and only insight sections', async () => {
  const catalog = JSON.parse(await fs.readFile('docs/research/report-section-catalog-v1.json', 'utf8')) as { sections: { sectionId: string; title: string }[] };
  const titles = new Map(catalog.sections.map(section => [section.sectionId, section.title]));
  for (const section of REVIEW_DEPENDENT_SECTIONS) {
    assert.equal(titles.get(section.sectionId), section.title, section.sectionId);
    assert.match(section.sectionId, /^I/);
  }
});

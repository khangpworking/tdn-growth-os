import assert from 'node:assert/strict';
import test from 'node:test';
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { createTikTokShopReviewsSource, tiktokShopReviewsDocument, tiktokShopReviewsStep, verifyTikTokShopReviewsDocument } from '../../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import { offlineTransport } from './tiktok-shop-reviews.fixtures.js';

const cases = [
  { row: 8, name: 'S06 verifier rejects schema and COLLECTION pointer drift', async run() {
    const source = createTikTokShopReviewsSource(createKalodataProvider('synthetic-auth', offlineTransport().transport));
    const document = tiktokShopReviewsDocument(await source.collect({ reports: ['INSIGHT'], candidates: [{ productId: '101', revenue: 1 }] }));
    const step = tiktokShopReviewsStep(document, 'a'.repeat(64), new Map());
    assert.deepEqual(verifyTikTokShopReviewsDocument(structuredClone(document), step), document);
    const mutations: { name: string; change: (value: typeof document) => void; error: RegExp }[] = [
      { name: 'count', change: value => { value.products[0]!.reviewCount++; }, error: /DOCUMENT_DIFFERS/ },
      { name: 'product id', change: value => { value.products[0]!.productId = '999'; }, error: /DOCUMENT_DIFFERS/ },
      { name: 'status', change: value => { value.status = 'PARTIAL'; }, error: /DOCUMENT_DIFFERS/ },
      { name: 'skip reason', change: value => { value.skipReason = 'PROVIDER_FAILED'; }, error: /DOCUMENT_DIFFERS/ },
      { name: 'outcome', change: value => { value.products[0]!.outcome = 'EMPTY'; }, error: /DOCUMENT_DIFFERS/ },
      { name: 'array length', change: value => { value.products[0]!.reviews.pop(); }, error: /DOCUMENT_DIFFERS/ },
      { name: 'schema', change: value => { Object.assign(value, { unexpected: true }); }, error: /DOCUMENT_INVALID/ },
    ];
    for (const mutation of mutations) {
      const changed = structuredClone(document); mutation.change(changed);
      assert.throws(() => verifyTikTokShopReviewsDocument(changed, step), mutation.error, mutation.name);
    }
  } },

];

for (const contract of cases) test(`PUBLIC_REVIEWS row ${contract.row}: ${contract.name}`, contract.run);

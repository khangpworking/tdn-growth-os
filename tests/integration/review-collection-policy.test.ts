import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AutomationExactShopeeBridge } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { reviewCollectionPolicy } from '../../src/modules/analysis/research-automation/review-collection-policy.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { reviewPolicyFixture } from '../helpers/review-policy-fixture.js';

for (const cost of [null, 0.23]) test(`one configured actor/private3 collection accounts for ordered products with actual cost ${cost}`, async t => {
  const f = await reviewPolicyFixture(t, [29, 30, 300], cost);
  const result = await f.bridge.collect(f.input); assert.ok(result.privateReference);
  assert.equal(result.costUsd, cost === null ? null : String(cost));
  assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1);
  const sample = await f.bridge.reviewSample(result.privateReference, f.input, f.binding);
  assert.deepEqual(sample.products.map(p => [p.listing.itemId, p.retainedReviews, p.textReviews, p.meetsComparisonTextMinimum, p.stop]),
    [['101', 29, 29, false, 'PROVIDER_DATASET_EXHAUSTED'], ['102', 30, 30, true, 'PROVIDER_DATASET_EXHAUSTED'], ['103', 300, 30, true, 'A_FIXED_COUNT']]);
  assert.equal(sample.coverageAvailable, false); assert.equal(sample.receipt.providerDatasetRows, 359);
  assert.equal(sample.receipt.usageTotalUsd, cost);
  const corpus = await f.bridge.privateCorpus(result.privateReference, f.input, f.binding);
  assert.equal(corpus.projection.records.length, 359);
  assert.equal(corpus.projection.records[0]!.authorIdentity.hash, corpus.projection.records[29]!.authorIdentity.hash);
  assert.notDeepEqual(corpus.projection.records[0]!.locator, corpus.projection.records[1]!.locator);
  const publicBytes = canonicalJson(sample);
  for (const secret of ['987654321', 'SYNTHETIC_AUTHOR', 'SYNTHETIC_PROFILE', 'authorIdentity', 'keyId', 'profile', f.salt.toString('hex')])
    assert.equal(publicBytes.includes(secret), false);
  const before = f.calls.length, changes = f.db.prepare('SELECT total_changes() n').get();
  f.db.pragma('query_only=ON');
  try {
    const reader = new AutomationExactShopeeBridge(f.db, f.artifacts);
    assert.deepEqual(await reader.verifySample(sample, result.privateReference, f.input, f.binding), sample);
    assert.deepEqual(await reader.privateCorpus(result.privateReference, f.input, f.binding), corpus);
    assert.equal(f.calls.length, before); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  } finally { f.db.pragma('query_only=OFF'); }
  const retry = await f.bridge.collect(f.input); assert.deepEqual(retry.privateReference, result.privateReference);
  assert.equal(retry.costUsd, '0'); assert.equal(f.calls.length, before);
});

test('trusted configuration and frozen bindings refuse mismatches before dispatch, without raw substitution', async t => {
  const f = await reviewPolicyFixture(t);
  for (const field of ['maxChargeUsd', 'maxReviewsPerProduct', 'contentFilter'] as const) {
    const factory = () => {
      const attempt = f.factory();
      if (field === 'maxChargeUsd') attempt.collector.options.maxChargeUsd = 2;
      if (field === 'maxReviewsPerProduct') attempt.collector.options.maxReviewsPerProduct = 500;
      if (field === 'contentFilter') attempt.collector.options.contentFilter = 'all';
      return attempt;
    };
    const bridge = new AutomationExactShopeeBridge(f.db, f.artifacts, undefined, undefined, { policy: f.policy, factory });
    assert.equal((await bridge.collect(f.input)).coverage.state, 'FAILED'); assert.equal(f.calls.length, 0);
  }
  for (const input of [
    { ...f.input, runId: '44444444-4444-4444-8444-444444444444' },
    { ...f.input, scope: { ...f.input.scope, workspaceId: '44444444-4444-4444-8444-444444444444' } },
    { ...f.input, start: { ...f.input.start, privateShopeeSource: undefined } },
  ]) await assert.rejects(f.bridge.collect(input as typeof f.input));
  assert.equal(f.calls.length, 0);
  assert.equal((await new AutomationExactShopeeBridge(f.db, f.artifacts).collect(f.input)).coverage.state, 'UNAVAILABLE');
  assert.throws(() => reviewCollectionPolicy({ ...f.policy, targetReviews: 500 }));
});

test('warm sample/source corruption and changed scope/profile/cap reject; exact restored bytes replay', async t => {
  const f = await reviewPolicyFixture(t);
  const result = await f.bridge.collect(f.input); assert.ok(result.privateReference);
  const sample = await f.bridge.reviewSample(result.privateReference, f.input, f.binding);
  const calls = f.calls.length;
  const changed = structuredClone(sample); changed.products[0]!.textReviews++;
  await assert.rejects(f.bridge.verifySample(changed, result.privateReference, f.input, f.binding));
  await assert.rejects(f.bridge.reviewSample({ ...result.privateReference, collectionSha256: 'f'.repeat(64) }, f.input, f.binding));
  const input = { ...f.input, start: { ...f.input.start, reviewCollectionPolicy: { ...f.policy,
    collector: { ...f.policy.collector, maxChargeUsd: 2 } } } };
  await assert.rejects(f.bridge.reviewSample(result.privateReference, input, { ...f.binding, startSha256: 'f'.repeat(64) }));
  for (const sha of [result.privateReference.collectionSha256, sample.collection.requestSha256]) {
    const physical = f.artifacts.pathForDigest(sha), bytes = await fs.readFile(physical);
    try { await fs.writeFile(physical, 'corrupt'); await assert.rejects(f.bridge.verifySample(sample, result.privateReference, f.input, f.binding)); }
    finally { await fs.writeFile(physical, bytes); }
    assert.deepEqual(await f.bridge.verifySample(sample, result.privateReference, f.input, f.binding), sample);
  }
  const abort = new AbortController(); abort.abort();
  assert.equal((await f.bridge.collect(f.input, abort.signal)).coverage.state, 'CANCELLED');
  assert.equal(f.calls.length, calls);
});

test('independent bridges never duplicate paid dispatch; changed frozen request cannot reuse or recollect', async t => {
  const f = await reviewPolicyFixture(t);
  const second = new AutomationExactShopeeBridge(f.db, f.artifacts, undefined, undefined, { policy: f.policy, factory: f.factory });
  const results = await Promise.all([f.bridge.collect(f.input), second.collect(f.input)]);
  assert.ok(results.some(result => result.privateReference));
  assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1);
  const before = f.calls.length;
  const changed = { ...f.input, start: { ...f.input.start, description: 'Changed frozen scope input' } };
  assert.equal((await second.collect(changed)).coverage.state, 'FAILED');
  assert.equal(f.calls.length, before);
  assert.ok((await second.collect(f.input)).privateReference); assert.equal(f.calls.length, before);
});

test('cancellation during returned pages remains diagnostics-only and does not publish a collection or corpus', async t => {
  const f = await reviewPolicyFixture(t);
  const controller = new AbortController(); f.setOnPage(() => controller.abort());
  const before = f.db.prepare('SELECT COUNT(*) n FROM foundation_shopee_collections').get();
  const result = await f.bridge.collect(f.input, controller.signal);
  assert.equal(result.coverage.state, 'CANCELLED'); assert.equal(result.privateReference, undefined);
  assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM foundation_shopee_collections').get(), before);
  assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1);
});

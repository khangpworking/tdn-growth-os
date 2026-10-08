import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationExactShopeeBridge } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { buildPrivateReviewReportView } from '../../src/modules/analysis/research-automation/private-review-corpus.js';
import { projectPrivateInsightSource } from '../../src/modules/analysis/research-automation/private-insight-source.js';
import { sourceDefaultInsightRules } from '../../src/modules/analysis/research-automation/insight-default-coding.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const row = { reviewId: '101', authorId: '918273645', author: 'PRIVATE_AUTHOR_NAME', authorPortrait: 'PRIVATE_AVATAR',
  shopId: '2001', itemId: '3001', comment: 'Same exact source quote.', ratingStar: 5, region: 'VN' };
async function fixture(t: TestContext, rows: unknown[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-coding-projection-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const privacy = createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId });
  const collector = new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows)), privacy);
  const source = { contractVersion: 'automation-private-shopee-source-v1' as const, profile: privacy.profile };
  const bridge = new AutomationExactShopeeBridge(db, artifacts, undefined, { source, factory: () => ({ collector, requestsIssued: () => 0 }) });
  const start = { contractVersion: 'research-automation-start-snapshot-v1' as const, workspaceId, country: 'VN' as const,
    mode: 'PRODUCT' as const, keyword: 'Synthetic source', description: null, interview: null,
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30', dayCount: 365 }, reports: ['INSIGHT' as const] };
  const scope = { contractVersion: 'research-automation-scope-snapshot-v1' as const, workspaceId, runId,
    definition: 'Synthetic exact source', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/2001/3001'] };
  const scopeConfirmedAt = '2026-10-08T00:00:00.000Z';
  const input = { runId, start, scope, scopeConfirmedAt, privateShopeeSource: source };
  const result = await bridge.collect(input);
  const corpus = await bridge.privateCorpus(result.privateReference!, input, { workspaceId, runId,
    startSha256: hash(start), scopeSha256: hash(scope), confirmedSourceSetSha256: 'b'.repeat(64), scopeConfirmedAt });
  return { corpus, view: buildPrivateReviewReportView(corpus), privacy };
}

test('authentic Foundation3 source projection preserves quotes, ratings, membership and native duplicate limits without private identity metadata', async t => {
  const { ratingStar: _star, ...absent } = row;
  const f = await fixture(t, [row, { ...row, authorId: '918273999' }, { ...row, reviewId: '102' }, { ...absent, reviewId: '103', comment: '' },
    { ...row, reviewId: '104', comment: null, ratingStar: null }, { ...row, reviewId: '105', ratingStar: 3.5 },
    { ...row, reviewId: '106', itemId: '3999' }, { ...row, reviewId: '107', shopId: null }]);
  const { output, sha256 } = projectPrivateInsightSource(f.corpus, f.view);
  assert.equal(sha256, hash(output));
  assert.deepEqual(output.input.records.map(record => record.text), f.view.records.map(record => record.text));
  assert.deepEqual(output.records.map(record => record.rating), f.view.records.map(record => record.rating));
  assert.deepEqual(output.records.map(record => record.locator), f.view.records.map(record => record.locator));
  assert.deepEqual(output.records.map(record => record.duplicateOfRecordIndex), [null, 0, null, null, null, null, null, null]);
  assert.deepEqual(output.input.records.map(record => record.disposition), ['INCLUDED', 'EXCLUDED', 'INCLUDED', 'EXCLUDED', 'UNREADABLE', 'INCLUDED', 'EXCLUDED', 'EXCLUDED']);
  assert.deepEqual(output.records.map(record => record.disposition), output.input.records.map(record => record.disposition));
  assert.deepEqual(output.records.map(record => record.dispositionReason), output.input.records.map(record => record.dispositionReason));
  assert.equal(output.input.records[1]!.dispositionReason, 'DUPLICATE_SOURCE_NATIVE_RECORD');
  assert.notEqual(output.input.records[0]!.locator, output.input.records[2]!.locator, 'same text with another native identity remains separate');
  assert.deepEqual(sourceDefaultInsightRules(output.input).corpora.map(corpus => corpus.recordIndexes), [[0, 2, 5], [0, 2, 5]]);
  assert.deepEqual(output.corpus, f.view.corpus);
  const bytes = canonicalJson(output);
  for (const forbidden of ['918273645', '918273999', 'PRIVATE_AUTHOR_NAME', 'PRIVATE_AVATAR', 'authorIdentity', 'reportedAuthorHashes',
    'keyId', keyId, 'keyCommitment', f.privacy.profile.keyCommitment, 'privacy', 'reviewId', 'profileVersion'])
    assert.equal(bytes.includes(forbidden), false, forbidden);
  assert.deepEqual(projectPrivateInsightSource(f.corpus, f.view), { output, sha256 }, 'exact deterministic replay');
});

test('projection rejects tampered closed view, corpus digest, collection/page/locator membership and conflicting native versions', async t => {
  const f = await fixture(t, [row, { ...row, reviewId: '102' }]);
  const alteredView = structuredClone(f.view); alteredView.records[0]!.text = 'Injected semantic source';
  assert.throws(() => projectPrivateInsightSource(f.corpus, alteredView), /PRIVATE_INSIGHT_SOURCE_INTEGRITY/);
  const alteredCorpus = structuredClone(f.corpus); alteredCorpus.projection.records[0]!.comment = 'Corrupt corpus';
  assert.throws(() => projectPrivateInsightSource(alteredCorpus, f.view), /digest mismatch/);
  for (const mutate of [
    (c: typeof f.corpus) => { c.projection.records[1]!.locator = structuredClone(c.projection.records[0]!.locator); },
    (c: typeof f.corpus) => { c.projection.records[0]!.locator.collectionId = workspaceId; },
    (c: typeof f.corpus) => { c.projection.records[0]!.locator.textPointer = '/999/comment'; },
    (c: typeof f.corpus) => { c.projection.records[1]!.locator.pageSha256 = 'c'.repeat(64); },
    (c: typeof f.corpus) => { c.projection.collectionSha256 = 'c'.repeat(64); },
  ]) {
    const changed = structuredClone(f.corpus); mutate(changed);
    const { corpusId: _id, ...body } = changed; changed.corpusId = hash(body);
    assert.throws(() => projectPrivateInsightSource(changed, buildPrivateReviewReportView(changed)), /PRIVATE_INSIGHT_SOURCE_INTEGRITY/);
  }
  const conflicts = await fixture(t, [row, { ...row, comment: 'Contrary retained version' }]);
  assert.throws(() => projectPrivateInsightSource(conflicts.corpus, conflicts.view), /PRIVATE_INSIGHT_SOURCE_INTEGRITY/);
});

test('projection preserves verbatim potentially identifying free text and missing native identities at separate locators', async t => {
  const comment = 'Source supplied phone 0123456789; do not rewrite this quote.';
  const f = await fixture(t, [{ ...row, reviewId: null, comment }, { ...row, reviewId: null, comment }]);
  const { output } = projectPrivateInsightSource(f.corpus, f.view);
  assert.deepEqual(output.input.records.map(record => record.text), [comment, comment]);
  assert.deepEqual(output.input.records.map(record => record.disposition), ['INCLUDED', 'INCLUDED']);
  assert.deepEqual(output.records.map(record => record.duplicateOfRecordIndex), [null, null]);
});

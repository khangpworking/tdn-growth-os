import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createRequire } from 'node:module';
import sourceSetSchema from '../../contracts/analysis/automation-confirmed-source-set.schema.json' with { type: 'json' };
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationExactShopeeBridge } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { buildPrivateReviewReportView, type PrivateReviewBinding } from '../../src/modules/analysis/research-automation/private-review-corpus.js';
import { registerPrivateReviewSchemas, privateReviewReportView } from '../../src/modules/analysis/research-automation/private-review-contracts.js';
import { AutomationInsightLiteralEvidence } from '../../src/modules/analysis/research-automation/insight-literal-bridge.js';
import { privateReviewCorpusSection } from '../../src/modules/analysis/research-automation/review-corpus-report.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { privateLiteralReviews } from '../../src/modules/analysis/research-automation/insight-literal-source.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const now = '2026-10-08T00:00:00.000Z';
const hash = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');
const intake = () => createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId });
const row = { reviewId: '101', authorId: '918273645', author: 'PRIVATE_AUTHOR', authorPortrait: 'PRIVATE_AVATAR',
  shopId: '2001', itemId: '3001', comment: 'Exact synthetic source text.', createdAt: '2024-01-02T00:00:00Z', region: 'VN', ratingStar: 5 };
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-source-consumer-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const privacy = intake(); let calls = 0;
  const { authorId: _id, ratingStar: _star, ...absent } = row;
  const rows = [row, { ...row, reviewId: '102' }, { ...absent, reviewId: '103' },
    { ...row, reviewId: '104', authorId: 0, ratingStar: null }, { ...row, reviewId: '105', ratingStar: 3.5 }];
  const collector = new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows)), privacy);
  const source = { contractVersion: 'automation-private-shopee-source-v1' as const, profile: privacy.profile };
  const bridge = new AutomationExactShopeeBridge(db, artifacts, undefined, { source,
    factory: () => ({ collector: { mode: collector.mode, privacyProfile: collector.privacyProfile,
      collect: async (...args) => { calls++; return collector.collect(...args); } }, requestsIssued: () => 0 }) });
  const start = { contractVersion: 'research-automation-start-snapshot-v1' as const, workspaceId, country: 'VN' as const,
    mode: 'PRODUCT' as const, keyword: 'Synthetic source', description: null, interview: null,
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30', dayCount: 365 }, reports: ['INSIGHT' as const] };
  const scope = { contractVersion: 'research-automation-scope-snapshot-v1' as const, workspaceId, runId,
    definition: 'Synthetic exact source', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/2001/3001'] };
  const input = { runId, start, scope, scopeConfirmedAt: now, privateShopeeSource: source };
  const binding: PrivateReviewBinding = { workspaceId, runId, startSha256: hash(start), scopeSha256: hash(scope),
    confirmedSourceSetSha256: 'b'.repeat(64), scopeConfirmedAt: now };
  return { root, db, artifacts, bridge, input, binding, collector, calls: () => calls };
}

test('private canonical AJV cascade accepts only explicit closed marker and author-free report view', () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const ajv = new Ajv2020({ strict: true });
  (require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
  registerPrivateReviewSchemas(ajv);
  const validate = ajv.compile(sourceSetSchema);
  const base = { contractVersion: 'automation-confirmed-source-set-v1', runId, workspaceId, executionId: keyId,
    startSha256: 'a'.repeat(64), scopeSha256: 'b'.repeat(64), requestSha256: 'c'.repeat(64), confirmedAt: now,
    metric: { decision: 'ABSENT' }, nativeReview: { decision: 'NONE' } };
  assert.equal(validate(base), true);
  const privateShopeeSource = { contractVersion: 'automation-private-shopee-source-v1', profile: intake().profile };
  assert.equal(validate({ ...base, privateShopeeSource }), true);
  assert.equal(validate({ ...base, privateShopeeSource: { ...privateShopeeSource, salt: 'secret' } }), false);
});

test('configured private bridge -> Foundation3 -> exact retained corpus -> closed literal/report view, no-calls replay', async t => {
  const f = await fixture(t);
  const result = await f.bridge.collect(f.input);
  assert.ok(result.privateReference); assert.equal(result.reference, undefined);
  const source = await f.bridge.readPrivate(result.privateReference, f.input);
  const corpus = await f.bridge.privateCorpus(result.privateReference, f.input, f.binding);
  assert.equal(corpus.contractVersion, 'research-private-review-corpus-v2');
  assert.equal(corpus.projection.records.length, 5);
  assert.equal(corpus.projection.accounting.reportedAuthorHashes, 1);
  assert.equal(corpus.projection.accounting.missingIdentityRecords, 1);
  assert.equal(corpus.projection.accounting.invalidIdentityRecords, 1);
  const view = buildPrivateReviewReportView(corpus);
  assert.equal(view.records[0]!.createdAt, row.createdAt);
  assert.notEqual(view.records[0]!.recordId, view.records[1]!.recordId);
  assert.deepEqual(view.records.map(r => r.rating.state), ['VALID', 'VALID', 'ABSENT', 'MISSING', 'INVALID']);
  assert.equal(view.records[4]!.rating.value, 3.5);
  const literal = privateLiteralReviews(source);
  const literalBridge = new AutomationInsightLiteralEvidence({ db: f.db, artifactStore: f.artifacts, now: () => new Date(now) });
  const literalInput = { ...f.input, previousPairId: 'a'.repeat(64), captures: [],
    collection: { contractVersion: 'research-automation-step-result-v1' as const, runId, stepId: 'COLLECTION' as const,
      outcome: 'PARTIAL' as const, productCards: [], comparables: [], coverage: [], limitations: [], privateShopee: result.privateReference } };
  const literalResult = await literalBridge.build(literalInput);
  assert.equal(literalResult.input.reviews.length, 5);
  assert.equal(literalResult.duplicateTexts[0]!.recordPointers.length, 5);
  await literalBridge.verify(literalResult, literalInput);
  const html = privateReviewCorpusSection(view, 'I03', { mark: () => '[1]' }) + privateReviewCorpusSection(view, 'I17', { mark: () => '[1]' });
  assert.equal(lintVisibleReportText(html).filter(c => !c.ok).length, 0);
  assert.equal(html.split(row.comment).length - 1, 5);
  assert.ok(html.includes(row.createdAt));
  await assert.rejects(literalBridge.build({ ...literalInput, collection: { ...literalInput.collection,
    exactShopee: result.privateReference } }), /substitute/);
  assert.equal(literal.length, 5); assert.equal(literal[4]!.rating.state, 'INVALID'); assert.equal(literal[4]!.rating.value, null);
  for (const value of [source, corpus, literal, view]) for (const forbidden of ['918273645', 'PRIVATE_AUTHOR', 'PRIVATE_AVATAR', Buffer.alloc(32, 7).toString('hex')])
    assert.equal(JSON.stringify(value).includes(forbidden), false, forbidden);
  for (const forbidden of ['authorIdentity', 'keyId', 'keyCommitment', 'privacy', 'reportedAuthorHashes']) assert.equal(JSON.stringify(view).includes(forbidden), false);
  assert.throws(() => privateReviewReportView({ ...view, authorIdentity: 'injected' }), /Invalid/);
  const retained = await f.artifacts.put(Buffer.from(canonicalJson(corpus)));
  assert.equal(retained.sha256, view.corpus.artifactSha256);
  const before = f.db.prepare('SELECT total_changes() n').get();
  await f.bridge.verifyPrivateCorpus(JSON.parse((await f.artifacts.read(retained.sha256)).toString()), result.privateReference, f.input, f.binding);
  assert.deepEqual((await f.bridge.collect(f.input)).privateReference, result.privateReference);
  assert.equal(f.calls(), 1); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  for (const [field, replacement] of [['collectionId', keyId], ['collectionSha256', 'f'.repeat(64)], ['requestSha256', 'f'.repeat(64)]] as const)
    await assert.rejects(f.bridge.readPrivate({ ...result.privateReference, [field]: replacement }, f.input));
  await assert.rejects(f.bridge.readPrivate(result.privateReference, { ...f.input, runId: keyId }));
  const altered = { ...f.input, privateShopeeSource: { ...f.input.privateShopeeSource,
    profile: { ...f.input.privateShopeeSource.profile, keyId } } };
  // A valid distinct public key UUID still cannot replace the frozen profile.
  altered.privateShopeeSource.profile.keyId = workspaceId;
  await assert.rejects(f.bridge.readPrivate(result.privateReference, altered));
  await assert.rejects(f.bridge.verifyPrivateCorpus(corpus, result.privateReference, f.input,
    { ...f.binding, confirmedSourceSetSha256: 'f'.repeat(64) }));
  await assert.rejects(f.bridge.read(result.privateReference, f.input), /substitution/);
});

test('private opt-in is unavailable without exact configured profile and pre-cancellation makes no collection', async t => {
  const f = await fixture(t);
  const disabled = new AutomationExactShopeeBridge(f.db, f.artifacts);
  assert.equal((await disabled.collect(f.input)).coverage.state, 'UNAVAILABLE');
  const controller = new AbortController(); controller.abort();
  const cancelled = await f.bridge.collect(f.input, controller.signal);
  assert.equal(cancelled.coverage.state, 'CANCELLED'); assert.equal(cancelled.privateReference, undefined); assert.equal(f.calls(), 0);
  assert.equal((f.db.prepare('SELECT count(*) n FROM foundation_shopee_collections').get() as { n: bigint }).n, 0n);
});


test('private bridge failure/incomplete/cancellation stays diagnostics-only and profile drift makes no call', async t => {
  for (const status of ['FAILED', 'ABORTED', 'TIMED-OUT', 'INCOMPLETE', 'CANCELLED']) await t.test(status, async t => {
    const f = await fixture(t); let calls = 0;
    const controller = new AbortController();
    const collector = { mode: f.collector.mode, privacyProfile: f.collector.privacyProfile,
      collect: async (...args: Parameters<typeof f.collector.collect>) => {
        calls++; const capture = await f.collector.collect(...args);
        if (status === 'CANCELLED') controller.abort();
        else if (status === 'INCOMPLETE') capture.actor.stopReason = 'review_limit';
        else capture.actor.status = status;
        return capture;
      } };
    const bridge = new AutomationExactShopeeBridge(f.db, f.artifacts, undefined,
      { source: f.input.privateShopeeSource, factory: () => ({ collector, requestsIssued: () => calls }) });
    const result = await bridge.collect(f.input, controller.signal);
    assert.equal(result.privateReference, undefined); assert.equal(calls, 1);
    assert.equal(result.coverage.state, status === 'CANCELLED' ? 'CANCELLED' : 'FAILED');
    assert.equal((f.db.prepare('SELECT count(*) n FROM foundation_shopee_collections').get() as { n: bigint }).n, 0n);
    assert.equal((f.db.prepare('SELECT count(*) n FROM artifact_manifests').get() as { n: bigint }).n, 0n);
  });
  const f = await fixture(t); let calls = 0;
  const changedProfile = createShopeePrivateIntake({ salt: Buffer.alloc(32, 8), keyId }).profile;
  const bridge = new AutomationExactShopeeBridge(f.db, f.artifacts, undefined,
    { source: f.input.privateShopeeSource, factory: () => ({ collector: { mode: 'fixture', privacyProfile: changedProfile,
      collect: async () => { calls++; throw new Error('Profile mismatch must precede calls'); } }, requestsIssued: () => calls }) });
  assert.equal((await bridge.collect(f.input)).coverage.state, 'FAILED'); assert.equal(calls, 0);
  const { privateShopeeSource: _marker, ...historical } = f.input;
  assert.equal((await f.bridge.collect(historical)).coverage.state, 'UNAVAILABLE'); assert.equal(f.calls(), 0);
});

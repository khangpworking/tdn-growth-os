import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { ApifyShopeeCollector, FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { jsonBytes } from '../../src/modules/foundation/shopee-selection.js';
import { projectPrivateShopeeCollection } from '../../src/modules/foundation/shopee-private-projection.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) {
  assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('tdn-private-shopee-'));
  await fs.rm(root, { recursive: true, force: true });
} });
const selected = [{ platform: 'shopee' as const, shopId: '2001', itemId: '3001', productUrl: 'https://shopee.vn/product/2001/3001' }];
const rawRow = { reviewId: '1001', shopId: '2001', itemId: '3001', ratingStar: 5, comment: 'Synthetic exact quote.',
  authorId: '918273645', author: 'PRIVATE_AUTHOR_NAME', authorPortrait: 'https://example.test/PRIVATE_AVATAR',
  profileUrl: 'https://example.test/PRIVATE_PROFILE', nested: { username: 'PRIVATE_NESTED_NAME' } };
const keyId = '11111111-1111-4111-8111-111111111111';
const salt = Buffer.alloc(32, 7);
async function fixture(status = 'SUCCEEDED', abortAfterDataset?: AbortController, rows: unknown[] = [rawRow]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-shopee-')); roots.push(root);
  const calls: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/runs')) return Response.json({ data: { id: 'SyntheticRun01', defaultDatasetId: 'SyntheticData01',
      buildId: 'SyntheticBuild01', status, usageTotalUsd: 0.001, statusMessage: 'PRIVATE_STATUS_NAME authorId 918273645' } });
    assert.match(url.pathname, /\/datasets\/SyntheticData01\/items$/);
    abortAfterDataset?.abort();
    return Response.json(rows, { headers: { 'x-apify-pagination-total': String(rows.length) } });
  };
  const collector = new ApifyShopeeCollector({ token: 'synthetic-token', maxChargeUsd: 1, journalRoot: path.join(root, 'journal'),
    retainReturnedPages: true, maxReviewsPerProduct: 20, fetch: transport }, createShopeePrivateIntake({ salt, keyId }));
  return { root, collector, calls };
}
async function retainedFiles(directory: string): Promise<Buffer[]> {
  const files: Buffer[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await retainedFiles(file)); else files.push(await fs.readFile(file));
  }
  return files;
}
function assertPrivate(bytes: Buffer) {
  for (const secret of ['918273645', 'PRIVATE_AUTHOR_NAME', 'PRIVATE_AVATAR', 'PRIVATE_PROFILE', 'PRIVATE_NESTED_NAME', 'PRIVATE_STATUS_NAME', salt.toString('hex')]) assert.equal(bytes.includes(secret), false, secret);
}

test('real synthetic transport sanitizes before every successful/failed/cancelled returned-page and run journal', async () => {
  for (const status of ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']) {
    const f = await fixture(status);
    const collected = await f.collector.collect(selected, 'a'.repeat(64), `private-${status.toLowerCase()}`);
    assert.equal(f.calls.length, 2); assert.equal(collected.actor.status, status);
    assert.equal(collected.actorStatusMessage, undefined);
    assert.equal(collected.privacy!.profileVersion, 'shopee-author-id-hmac-v1');
    const rows = JSON.parse(collected.pages[0]!.bytes.toString());
    assert.equal(rows[0].comment, rawRow.comment); assert.equal(rows[0].authorIdentity.state, 'HASHED');
    assertPrivate(Buffer.from(JSON.stringify(collected)));
    assertPrivate(Buffer.concat(await retainedFiles(path.join(f.root, 'journal'))));
    assert.equal(JSON.stringify(f.collector).includes(salt.toString('hex')), false);
  }
  const controller = new AbortController(); const f = await fixture('SUCCEEDED', controller);
  const collected = await f.collector.collect(selected, 'a'.repeat(64), 'private-cancelled', controller.signal);
  assert.ok(collected.warnings.includes('collection_cancelled_locally_provider_status_unchanged'));
  assertPrivate(Buffer.concat(await retainedFiles(path.join(f.root, 'journal'))));
});

test('historical fixture pages retain exact bytes; privacy fixture exposes only sanitized pages', async () => {
  const bytes = Buffer.from(JSON.stringify([rawRow], null, 2));
  const legacy = await new FixtureShopeeCollector(bytes).collect(selected);
  assert.equal(legacy.privacy, undefined); assert.deepEqual(legacy.pages[0]!.bytes, bytes);
  const collector = new FixtureShopeeCollector(bytes, createShopeePrivateIntake({ salt, keyId }));
  const current = await collector.collect(selected);
  assertPrivate(Buffer.from(JSON.stringify(collector)));
  assertPrivate(current.pages[0]!.bytes);
  assert.equal(JSON.parse(current.pages[0]!.bytes.toString())[0].comment, rawRow.comment);
});

const requestBytes = (runKey: string) => jsonBytes({ contractVersion: '2.0.0', runKey, topic: 'Synthetic private intake',
  selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Synthetic owner exact request', acquiredAt: '2026-10-08T00:00:00Z' },
  productUrls: selected.map(row => row.productUrl) });

test('real collector -> Foundation v3 retention -> declared source projection verifies exact bytes without extra calls', async () => {
  const { authorId: _id, ...missing } = rawRow;
  const rows = [rawRow, { ...rawRow, reviewId: '1002' }, { ...rawRow, reviewId: '1003', authorId: '918273646', comment: 'Second exact content.' },
    { ...missing, reviewId: '1004', comment: 'Third exact content.' }, { ...rawRow, reviewId: '1005', authorId: 0, comment: 'Fourth exact content.' },
    { ...rawRow, reviewId: '1006', shopId: '9999', comment: 'Different listing.' }];
  const f = await fixture('SUCCEEDED', undefined, rows);
  const db = openDatabase({ databasePath: path.join(f.root, 'test.sqlite') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(f.root, 'artifacts'));
  const foundation = new ShopeeCollectionService(db, artifacts);
  try {
    const bytes = requestBytes('private-roundtrip');
    const saved = await foundation.collectExact(bytes, f.collector, { privacy: true });
    assert.equal(saved.packet.contractVersion, '3.0.0'); assert.equal(saved.request.contractVersion, '2.0.0');
    const before = db.prepare('SELECT total_changes() AS count').get();
    const projection = await foundation.readPrivateProjection(saved.packet.collectionId);
    assert.deepEqual(projection.accounting, { retainedRecords: 6, selectedTextRecords: 5, distinctContents: 4,
      reportedAuthorHashes: 2, missingIdentityRecords: 1, invalidIdentityRecords: 1, identityCoverage: 'PARTIAL' });
    assert.equal(projection.missingIdentityLabel, 'nguồn không có mã người viết');
    assert.equal(projection.fallbackRequirement, '>=5 distinct contents, chưa xác minh là 5 người');
    assert.equal(projection.records[0]!.authorIdentity.hash, projection.records[1]!.authorIdentity.hash);
    assert.notDeepEqual(projection.records[0]!.locator, projection.records[1]!.locator, 'same text at distinct locators remains distinct records');
    assert.equal(projection.records[5]!.admission, 'OTHER_LISTING');
    assert.deepEqual(await new ShopeeCollectionService(db, artifacts).readPrivateProjection(saved.packet.collectionId), projection);
    assert.deepEqual(await foundation.collectExact(bytes, f.collector, { privacy: true }), saved);
    assert.equal(f.calls.length, 2, 'stored projection/read/retry never calls provider or needs salt');
    assert.deepEqual(db.prepare('SELECT total_changes() AS count').get(), before);
    await assert.rejects(foundation.readExact(saved.packet.collectionId), /not an exact URL/);
    assert.throws(() => projectPrivateShopeeCollection({ ...saved, sha256: 'b'.repeat(64) }), /packet integrity/);
    for (const bytes of await retainedFiles(path.join(f.root, 'artifacts'))) assertPrivate(bytes);
    const forged = await new FixtureShopeeCollector(jsonBytes([rawRow])).collect(selected);
    forged.privacy = saved.packet.privacy;
    await assert.rejects(foundation.saveExact(requestBytes('private-forged'), forged, { privacy: true }), /Invalid private Shopee rows/);
    await assert.rejects(foundation.collectExact(requestBytes('private-missing-config'), new FixtureShopeeCollector(jsonBytes([rawRow])), { privacy: true }), /Unverified private Shopee field mapping/);
    const originalPage = await artifacts.read(saved.pages[0]!.sha256);
    await fs.writeFile(artifacts.pathForDigest(saved.pages[0]!.sha256), 'corrupt private page');
    await assert.rejects(foundation.readPrivateProjection(saved.packet.collectionId), /digest mismatch/);
    await fs.writeFile(artifacts.pathForDigest(saved.pages[0]!.sha256), originalPage);
    assert.deepEqual(await foundation.readPrivateProjection(saved.packet.collectionId), projection);
  } finally { db.close(); }
});

test('failed, aborted, timed-out, locally cancelled and interrupted retention never publish a private Foundation collection', async () => {
  for (const status of ['FAILED', 'ABORTED', 'TIMED-OUT', 'CANCELLED', 'RETENTION_CANCELLED']) {
    const controller = new AbortController();
    const f = await fixture(['CANCELLED', 'RETENTION_CANCELLED'].includes(status) ? 'SUCCEEDED' : status, status === 'CANCELLED' ? controller : undefined);
    const db = openDatabase({ databasePath: path.join(f.root, 'test.sqlite') }).db;
    const artifacts = new ContentAddressedArtifactStore(path.join(f.root, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    if (status === 'RETENTION_CANCELLED') {
      const put = artifacts.put.bind(artifacts);
      artifacts.put = async bytes => { const result = await put(bytes); controller.abort(); return result; };
    }
    try {
      await assert.rejects(foundation.collectExact(requestBytes(`private-${status.toLowerCase().replace('_', '-')}`), f.collector, { privacy: true }, controller.signal));
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM foundation_shopee_collections').get() as { n: bigint }).n, 0n);
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM foundation_ingestion_runs').get() as { n: bigint }).n, 0n);
      assertPrivate(Buffer.concat(await retainedFiles(path.join(f.root, 'journal'))));
    } finally { db.close(); }
  }
});

test('historical exact Foundation bytes stay unchanged and cannot be silently resumed as private v3', async () => {
  const f = await fixture(); const db = openDatabase({ databasePath: path.join(f.root, 'test.sqlite') }).db;
  const foundation = new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(f.root, 'artifacts')));
  try {
    const raw = Buffer.from(JSON.stringify([rawRow], null, 2)); const bytes = requestBytes('historical-exact-v2');
    const saved = await foundation.saveExact(bytes, await new FixtureShopeeCollector(raw).collect(selected));
    const packetBefore = jsonBytes(saved.packet);
    await assert.rejects(foundation.collectExact(bytes, new FixtureShopeeCollector(raw, createShopeePrivateIntake({ salt, keyId })), { privacy: true }), /not a sanitized exact/);
    const reread = await foundation.readExact(saved.packet.collectionId);
    assert.equal(reread.packet.contractVersion, '2.0.0'); assert.deepEqual(reread.pages[0]!.bytes, raw);
    assert.deepEqual(jsonBytes(reread.packet), packetBefore); assert.equal(f.calls.length, 0);
  } finally { db.close(); }
});

test('absent documented IDs retain truthful distinct-content fallback and never invent authors', async () => {
  const f = await fixture(); const db = openDatabase({ databasePath: path.join(f.root, 'test.sqlite') }).db;
  const foundation = new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(f.root, 'artifacts')));
  const { authorId: _removed, ...withoutId } = rawRow;
  const values = Array.from({ length: 6 }, (_, index) => ({ ...withoutId, reviewId: String(1100 + index), comment: `Distinct synthetic content ${index % 5}.` }));
  try {
    const saved = await foundation.collectExact(requestBytes('private-absent-id'), new FixtureShopeeCollector(jsonBytes(values), createShopeePrivateIntake({ salt, keyId })), { privacy: true });
    const projection = await foundation.readPrivateProjection(saved.packet.collectionId);
    assert.equal(projection.records.length, 6); assert.equal(projection.accounting.distinctContents, 5);
    assert.equal(projection.accounting.reportedAuthorHashes, null); assert.equal(projection.accounting.identityCoverage, 'UNAVAILABLE');
    assert.equal(projection.accounting.missingIdentityRecords, 6);
    assert.ok(projection.records.every(row => row.authorIdentity.hash === null && row.authorIdentity.state === 'MISSING'));
    assert.equal(projection.fallbackRequirement, '>=5 distinct contents, chưa xác minh là 5 người');
    assertPrivate(Buffer.from(JSON.stringify(projection)));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(foundation.collectExact(requestBytes('private-pre-cancelled'), f.collector, { privacy: true }, controller.signal));
    assert.equal(f.calls.length, 0);
  } finally { db.close(); }
});

test('same public key UUID with changed salt cannot resume journals or reuse finalized author evidence', async () => {
  const f = await fixture(); const db = openDatabase({ databasePath: path.join(f.root, 'test.sqlite') }).db;
  const foundation = new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(f.root, 'artifacts')));
  const original = createShopeePrivateIntake({ salt, keyId });
  const changed = createShopeePrivateIntake({ salt: Buffer.alloc(32, 8), keyId });
  const second = new ApifyShopeeCollector(f.collector.options, changed);
  try {
    assert.notEqual(original.profile.keyCommitment, changed.profile.keyCommitment);
    assert.equal(original.profile.keyCommitment, createShopeePrivateIntake({ salt: Buffer.from(salt), keyId }).profile.keyCommitment);
    const bytes = requestBytes('private-key-continuity');
    const saved = await foundation.collectExact(bytes, f.collector, { privacy: true });
    const projection = await foundation.readPrivateProjection(saved.packet.collectionId);
    await assert.rejects(foundation.collectExact(bytes, second, { privacy: true }), /different private key or mapping/);
    await assert.rejects(second.collect(selected, saved.packet.requestSha256, saved.packet.runKey), /Receipt identity or budget conflict/);
    assert.equal(f.calls.length, 2, 'salt mismatch must fail before a provider request');
    assert.deepEqual(await foundation.readPrivateProjection(saved.packet.collectionId), projection);
    assertPrivate(Buffer.concat(await retainedFiles(path.join(f.root, 'journal'))));
  } finally { db.close(); }
});

test('an incomplete dataset retains only sanitized diagnostic pages and cannot publish Foundation evidence', async () => {
  const f = await fixture(); const db = openDatabase({ databasePath: path.join(f.root, 'test.sqlite') }).db;
  const foundation = new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(f.root, 'artifacts')));
  let datasetReads = 0;
  const transport: typeof fetch = async input => {
    if (String(input).includes('/runs?')) return Response.json({ data: { id: 'SyntheticRun01', defaultDatasetId: 'SyntheticData01',
      buildId: 'SyntheticBuild01', status: 'SUCCEEDED', statusMessage: 'PRIVATE_STATUS_NAME 918273645' } });
    datasetReads++;
    if (datasetReads > 1) throw new Error('PRIVATE_TRANSPORT_DETAIL 918273645');
    return Response.json(Array.from({ length: 100 }, (_, index) => ({ ...rawRow, reviewId: String(2000 + index) })),
      { headers: { 'x-apify-pagination-total': '200' } });
  };
  const collector = new ApifyShopeeCollector({ ...f.collector.options, maxReviewsPerProduct: 500, fetch: transport }, createShopeePrivateIntake({ salt, keyId }));
  try {
    await assert.rejects(foundation.collectExact(requestBytes('private-incomplete'), collector, { privacy: true }), /incomplete intake/);
    assert.equal(datasetReads, 2);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM foundation_shopee_collections').get() as { n: bigint }).n, 0n);
    const files = await retainedFiles(path.join(f.root, 'journal')); assertPrivate(Buffer.concat(files));
    assert.equal(Buffer.concat(files).includes('PRIVATE_TRANSPORT_DETAIL'), false);
    const snapshot = files.map(bytes => JSON.parse(bytes.toString())).find(value => value.receiptVersion === '2.0.0');
    assert.equal(snapshot.actor.stopReason, 'dataset_read_failed'); assert.equal(snapshot.pages.length, 1);
  } finally { db.close(); }
});

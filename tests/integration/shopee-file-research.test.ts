import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import type { ShopeeListingRequest } from '../../contracts/foundation/shopee-listing-request.generated.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { ApifyShopeeCollector, FixtureShopeeCollector, CollectionPendingError } from '../../src/platform/collectors/apify-shopee.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { ShopeeReviewAnalysisService } from '../../src/modules/analysis/shopee-review-service.js';
import { digest, jsonBytes, parseJsonBytes, selectShopeeListings, validateListingRequest } from '../../src/modules/foundation/shopee-selection.js';

const requestBytes = await fs.readFile('tests/fixtures/shopee-listings.synthetic.json');
const reviewBytes = await fs.readFile('tests/fixtures/shopee-reviews.synthetic.json');
const python = process.env.TDN_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const fixtureRequest = (): ShopeeListingRequest => structuredClone(validateListingRequest(parseJsonBytes(requestBytes)));
const roots: string[] = [];
async function root(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-shopee-015-'));
  roots.push(directory); return directory;
}
afterEach(async () => {
  for (const directory of roots.splice(0)) {
    // Only remove paths created by this test under the intended temp root.
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tdn-shopee-015-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('015 selection: distinct Shopee groups, period revenue, not TikTok or alternate sellers', () => {
  const selected = selectShopeeListings(fixtureRequest());
  assert.equal(selected.selected.length, 5);
  assert.deepEqual(selected.selected.map(row => row.itemId), ['101', '201', '202', '203', '204']);
  assert.equal(selected.warnings.length, 0);
  const exact = fixtureRequest();
  exact.listings[3]!.periodRevenueVnd = '900719925474099312345';
  assert.equal(selectShopeeListings(exact).selected[0]!.itemId, '201');
});

test('015 selection: unresolved grouping, ties, rounded/missing revenue, bad URL cannot be silently selected', () => {
  const request = fixtureRequest();
  request.listings[1]!.periodRevenueVnd = request.listings[0]!.periodRevenueVnd;
  request.listings[3]!.productKey = null;
  request.listings[4]!.revenuePrecision = 'rounded';
  request.listings[5]!.periodRevenueVnd = null;
  request.listings[6]!.productUrl = 'https://shopee.vn.evil.example/synthetic-i.24.204';
  const selection = selectShopeeListings(request);
  assert.equal(selection.selected.length, 1);
  assert.ok(selection.warnings.some(w => w.includes('revenue_tie')));
  assert.ok(selection.warnings.some(w => w.includes('grouping_unconfirmed')));
  const conflict = fixtureRequest();
  conflict.listings.push({ ...conflict.listings[0]!, productKey: 'wrong' });
  assert.throws(() => selectShopeeListings(conflict), /Conflicting listing/);
  const boundary = fixtureRequest();
  boundary.listings[7]!.periodRevenueVnd = boundary.listings[6]!.periodRevenueVnd;
  assert.equal(selectShopeeListings(boundary).selected.length, 4);
  assert.throws(() => validateListingRequest({ ...fixtureRequest(), maxProducts: 50 }), /Invalid listing request/);
  assert.throws(() => validateListingRequest({ ...fixtureRequest(), period: {
    start: '2026-08-01T01:00:00+00:00', end: '2026-08-01T02:00:00+07:00',
  } }), /Period/);
  assert.throws(() => parseJsonBytes(Buffer.from([0xff])), /UTF-8/);
});

test('015 fixture → raw SQLite lineage → Python filter → repeat replay without rerunning filter', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const input = await new FixtureShopeeCollector(reviewBytes).collect();
    const saved = await foundation.save(requestBytes, input);
    assert.deepEqual(saved.pages[0]!.bytes, reviewBytes);
    assert.equal(saved.packet.selected.length, 5);
    const analysis = new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation });
    const first = await analysis.analyze(saved.packet.collectionId);
    assert.equal(first.result.summary.invalidRows, 1);
    assert.equal(first.result.summary.collected, 8);
    assert.equal(first.result.reviews.find(r => r.reviewId === '2')!.decision, 'removed');
    assert.equal(first.result.reviews.find(r => r.reviewId === '8')!.decision, 'removed');
    assert.equal(first.result.reviews.find(r => r.reviewId === '5')!.decision, 'kept'); // same text, other product
    assert.ok(first.result.reviews.find(r => r.reviewId === '4')!.negative.length > 0);
    assert.equal(first.result.reviews.find(r => r.reviewId === '3')!.target, 'Người lớn');
    assert.equal(first.result.summary.mode, 'fixture');
    const noPython = new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation, pythonExecutable: 'must-not-run' });
    assert.equal((await noPython.analyze(saved.packet.collectionId)).sha256, first.sha256);
    assert.equal((await foundation.save(requestBytes, input)).packet.collectionId, saved.packet.collectionId);
    assert.throws(() => db.prepare('DELETE FROM foundation_shopee_collections').run(), /immutable/);
    assert.throws(() => db.prepare('UPDATE analysis_shopee_review_results SET created_at=?').run('x'), /immutable/);
    await assert.rejects(() => foundation.existing(jsonBytes({ ...fixtureRequest(), topic: 'changed' }), 'fixture'), /Run key/);
    await assert.rejects(() => foundation.save(requestBytes, { ...input, pages: [{ bytes: Buffer.from('[]'), offset: 0 }] }), /different collection/);
    if (process.platform !== 'win32') {
      for (const file of [path.join(directory, 'test.sqlite'), artifacts.pathForDigest(first.sha256)]) {
        assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
      }
    }
    await fs.writeFile(artifacts.pathForDigest(saved.packet.pages[0]!.sha256), 'corrupt');
    await assert.rejects(() => foundation.read(saved.packet.collectionId), /digest mismatch/);
  } finally { db.close(); }
});

test('015 empty and failed-source collections yield flags, not fabricated reviews', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const saved = await foundation.save(requestBytes, { mode: 'fixture',
      actor: { runId: null, datasetId: null, buildId: null, status: 'FAILED' },
      pages: [{ bytes: Buffer.from('[]'), offset: 0 }], warnings: ['actor_terminal_failed'] });
    const out = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation }).analyze(saved.packet.collectionId);
    assert.equal(out.result.reviews.length, 0);
    assert.ok(out.result.summary.listings.every(row => row.status === 'unavailable'));
    assert.equal(out.result.summary.collected, 0);
  } finally { db.close(); }
});

const runResponse = (status = 'SUCCEEDED') => ({ data: { id: 'RUN1', defaultDatasetId: 'DATA1', buildId: 'BUILD1', status } });
const respond = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 });

test('015 Apify: fixed actor, auth header, charge cap, pagination and same-receipt resume without POST', async () => {
  const directory = await root();
  let posts = 0;
  let pages = 0;
  const offsets: string[] = [];
  const selected = selectShopeeListings(fixtureRequest()).selected.slice(0, 1);
  const fake: typeof fetch = async (url, init) => {
    const endpoint = new URL(String(url));
    assert.equal(endpoint.origin, 'https://api.apify.com');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer SECRET');
    assert.equal(endpoint.searchParams.has('token'), false);
    if (init?.method === 'POST') {
      posts++;
      assert.equal(endpoint.searchParams.get('maxTotalChargeUsd'), '1');
      const body = JSON.parse(String(init.body));
      assert.equal(body.maxReviewsPerProduct, 500);
      assert.equal(body.starFilter, 'all');
      assert.equal(body.contentFilter, 'with comments');
      return respond(runResponse());
    }
    pages++;
    offsets.push(endpoint.searchParams.get('offset')!);
    return respond(Array.from({ length: 100 }, (_, i) => ({ reviewId: (pages - 1) * 100 + i + 1 })));
  };
  const collector = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1, journalRoot: directory, fetch: fake });
  const first = await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(first.pages.length, 5);
  assert.deepEqual(offsets, ['0', '100', '200', '300', '400']);
  await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(posts, 1);
  const budgetChanged = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 2, journalRoot: directory, fetch: fake });
  await assert.rejects(() => budgetChanged.collect(selected, digest(requestBytes), fixtureRequest().runKey), /budget conflict/);
});

test('015 ambiguous POST is never retried, secrets not surfaced, lock removed', async () => {
  const directory = await root();
  let calls = 0;
  const collector = new ApifyShopeeCollector({
    token: 'SECRET', maxChargeUsd: 1, journalRoot: directory,
    fetch: async () => { calls++; throw new Error('SECRET raw provider error'); },
  });
  const selected = selectShopeeListings(fixtureRequest()).selected;
  await assert.rejects(() => collector.collect(selected, digest(requestBytes), fixtureRequest().runKey), error =>
    error instanceof CollectionPendingError && !error.message.includes('SECRET'));
  await assert.rejects(() => collector.collect(selected, digest(requestBytes), fixtureRequest().runKey), /outcome unknown/);
  await assert.rejects(() => collector.collect(selected, 'b'.repeat(64), fixtureRequest().runKey), /identity or budget conflict/);
  assert.equal(calls, 1);
  assert.equal((await fs.readdir(path.join(directory, fixtureRequest().runKey))).includes('active.lock'), false);
});

test('015 pending GET resumes same run, failed terminal run retains partial data', async () => {
  const directory = await root();
  let posts = 0;
  let complete = false;
  const collector = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1, journalRoot: directory,
    maxPolls: 1, sleep: async () => {},
    fetch: async (_url, init) => {
      if (init?.method === 'POST') { posts++; return respond(runResponse('RUNNING')); }
      if (String(_url).includes('/actor-runs/')) return respond(runResponse(complete ? 'FAILED' : 'RUNNING'));
      return new Response(reviewBytes.toString('utf8'));
    },
  });
  const selected = selectShopeeListings(fixtureRequest()).selected;
  await assert.rejects(() => collector.collect(selected, digest(requestBytes), fixtureRequest().runKey), /pending/);
  complete = true;
  const result = await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(posts, 1);
  assert.equal(result.actor.status, 'FAILED');
  assert.ok(result.pages[0]!.bytes.equals(reviewBytes));
  assert.deepEqual(result.warnings, ['actor_terminal_failed']);
});

test('015 callable filter matches original v3 on a representative single-product fixture', async () => {
  const directory = await root();
  const table = '| # | Product | Star | Author | Text |\n|---|---|---|---|---|\n' +
    '|1|A|2|synthetic|Uống bị táo bón, viên to khó nuốt|\n' +
    '|2|A|5|synthetic|Giao hàng nhanh, đóng gói cẩn thận|\n' +
    '|3|A|4|synthetic|chua thay hieu qua sau khi uong|\n';
  const inputPath = path.join(directory, 'reviews.md');
  const outputPath = path.join(directory, 'baseline.json');
  await fs.writeFile(inputPath, table);
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  const baseline = spawnSync(python, ['-B', 'references/reuse/shopee_review_filter.v3.py', inputPath, outputPath], { env, encoding: 'utf8' });
  assert.equal(baseline.status, 0, baseline.stderr);
  const original = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const rows = [
    { id: '1', product: 'A', star: 2, text: 'Uống bị táo bón, viên to khó nuốt' },
    { id: '2', product: 'A', star: 5, text: 'Giao hàng nhanh, đóng gói cẩn thận' },
    { id: '3', product: 'A', star: 4, text: 'chua thay hieu qua sau khi uong' },
  ].map(row => ({ ...row, listingKey: 'shopee:1:1', rawPageSha256: 'a'.repeat(64), rawRowIndex: Number(row.id) - 1 }));
  const adapted = spawnSync(python, ['-B', 'scripts/filter-shopee-reviews.py'], { env, input: JSON.stringify(rows), encoding: 'utf8' });
  assert.equal(adapted.status, 0, adapted.stderr);
  const output = JSON.parse(adapted.stdout) as { reviewId: string; decision: string; score: number; signals: string[] }[];
  assert.deepEqual(output.filter(row => row.decision === 'kept').map(row => row.reviewId),
    original.kept.map((row: { id: number }) => String(row.id)));
  for (const originalRow of original.kept) {
    const row = output.find(r => r.reviewId === String(originalRow.id))!;
    assert.equal(row.score, originalRow._score);
    assert.deepEqual(row.signals, originalRow._sig);
  }
});

test('015 enforces per-listing 500 cap while preserving raw bytes and refusing unselected reviews', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const request = fixtureRequest();
    request.listings = request.listings.slice(0, 4); // two distinct Shopee products
    const rows = Array.from({ length: 501 }, (_, i) => ({
      reviewId: i + 1, shopId: 11, itemId: 101, ratingStar: 5, comment: 'Dễ uống hàng ngày ' + i,
    }));
    rows.push({ reviewId: 999, shopId: 999, itemId: 999, ratingStar: 5, comment: 'Dễ uống' });
    const bytes = jsonBytes(rows);
    const collected = await new FixtureShopeeCollector(bytes).collect();
    const source = await foundation.save(jsonBytes(request), collected);
    const output = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation }).analyze(source.packet.collectionId);
    assert.equal(output.result.summary.fetchedRows, 502);
    assert.equal(output.result.summary.collected, 500);
    assert.equal(output.result.summary.invalidRows, 2);
    assert.ok(source.pages[0]!.bytes.equals(bytes));
    assert.ok(output.result.summary.warnings.includes('per_listing_limit_exceeded'));
  } finally { db.close(); }
});

test('015 version 10 database upgrades only 0011 and reruns idempotently', async () => {
  const directory = await root();
  const oldMigrations = path.join(directory, 'migrations-v10');
  await fs.mkdir(oldMigrations);
  const names = (await fs.readdir('migrations')).filter(name => /^00(0[1-9]|10)_.*\.sql$/.test(name));
  assert.equal(names.length, 10);
  for (const name of names) await fs.copyFile(path.join('migrations', name), path.join(oldMigrations, name));
  const databasePath = path.join(directory, 'test.sqlite');
  const old = openDatabase({ databasePath, migrationsDirectory: oldMigrations });
  assert.equal(old.db.pragma('user_version', { simple: true }), 10n);
  old.db.close();
  const next = openDatabase({ databasePath });
  assert.deepEqual(next.migration.applied, [11]);
  assert.equal(next.db.pragma('user_version', { simple: true }), 11n);
  next.db.close();
  const repeated = openDatabase({ databasePath });
  assert.deepEqual(repeated.migration.applied, []);
  repeated.db.close();
});

test('015 CLI preview and fixture collection run without credentials; changed fixture conflicts', async () => {
  const directory = await root();
  const cli = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/collect-shopee-reviews.ts', ...args],
    { encoding: 'utf8', env: { ...process.env, TDN_APIFY_TOKEN: '', TDN_PYTHON: python }, timeout: 30_000 });
  const preview = cli(['preview', 'tests/fixtures/shopee-listings.synthetic.json']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).networkCalls, 0);
  const copiedRows = path.join(directory, 'rows.json');
  await fs.writeFile(copiedRows, reviewBytes);
  const args = ['collect', path.join(directory, 'test.sqlite'), path.join(directory, 'artifacts'),
    'tests/fixtures/shopee-listings.synthetic.json', '--fixture', copiedRows];
  const first = cli(args);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).summary.fetchedRows, 9);
  assert.equal(JSON.parse(first.stdout).summary.collected, 8);
  const second = cli(args);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).deduplicated, true);
  await fs.writeFile(copiedRows, '[]');
  const changed = cli(args);
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /different collection evidence/);
});

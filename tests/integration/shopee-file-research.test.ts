import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const selectedFixture = () => selectShopeeListings(fixtureRequest()).selected;
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

function fixtureActor(status = 'FIXTURE') {
  return {
    actorId: 'zen-studio/shopee-product-reviews-scraper' as const,
    inputSha256: createHash('sha256').update(jsonBytes({ startUrls: selectedFixture().map(row => ({ url: row.productUrl })),
      maxReviewsPerProduct: 500, starFilter: 'all', contentFilter: 'with comments' })).digest('hex'),
    settings: { maxReviewsPerProduct: 500 as const, starFilter: 'all' as const,
      contentFilter: 'with comments' as const, maxChargeUsd: null },
    runId: null, datasetId: null, buildId: null, status,
    retrievedAt: '2026-09-15T00:00:00.000Z', providerTotalRows: null, usageTotalUsd: null,
    stopReason: status === 'FIXTURE' ? 'fixture_complete' as const : 'actor_terminal_failed' as const,
  };
}

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
  const blankKey = fixtureRequest(); blankKey.listings[0]!.productKey = '   ';
  assert.throws(() => selectShopeeListings(blankKey), /Invalid listing request/);
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
    const input = await new FixtureShopeeCollector(reviewBytes).collect(selectedFixture());
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
    assert.equal(first.result.summary.providerReportedRows, null);
    assert.deepEqual(saved.packet.actor.settings, {
      maxReviewsPerProduct: 500, starFilter: 'all', contentFilter: 'with comments', maxChargeUsd: null,
    });
    assert.equal(saved.packet.actor.stopReason, 'fixture_complete');
    const noPython = new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation, pythonExecutable: 'must-not-run' });
    assert.equal((await noPython.analyze(saved.packet.collectionId)).sha256, first.sha256);
    assert.equal((await foundation.save(requestBytes, input)).packet.collectionId, saved.packet.collectionId);
    assert.throws(() => db.prepare('DELETE FROM foundation_shopee_collections').run(), /immutable/);
    assert.throws(() => db.prepare('UPDATE analysis_shopee_review_results SET created_at=?').run('x'), /immutable/);
    await assert.rejects(() => foundation.existing(jsonBytes({ ...fixtureRequest(), topic: 'changed' }), 'fixture'), /Run key/);
    await assert.rejects(() => foundation.save(requestBytes, { ...input, pages: [{ bytes: Buffer.from('[]'), offset: 0 }] }), /different collection/);
    if (process.platform !== 'win32') {
      db.pragma('wal_checkpoint(PASSIVE)');
      for (const file of [path.join(directory, 'test.sqlite'), path.join(directory, 'test.sqlite-wal'),
        path.join(directory, 'test.sqlite-shm'), artifacts.pathForDigest(digest(requestBytes)),
        artifacts.pathForDigest(saved.sha256), artifacts.pathForDigest(saved.packet.pages[0]!.sha256),
        artifacts.pathForDigest(first.sha256)]) {
        assert.equal((await fs.stat(file)).mode & 0o777, 0o600, file);
      }
    }
    await fs.writeFile(artifacts.pathForDigest(saved.packet.pages[0]!.sha256), 'corrupt');
    await assert.rejects(() => foundation.read(saved.packet.collectionId), /digest mismatch/);
  } finally { db.close(); }
});

test('015 rejects incoherent live collector provenance before writes', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const foundation = new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(directory, 'artifacts')));
    await assert.rejects(foundation.save(requestBytes, {
      mode: 'live', warnings: [], pages: [],
      actor: { ...fixtureActor(), settings: { ...fixtureActor().settings, maxChargeUsd: 1 },
        status: 'SUCCEEDED', stopReason: 'dataset_exhausted' },
    }), /Collector input|Incoherent live collector provenance/);
    await assert.rejects(foundation.save(requestBytes, {
      mode: 'fixture', warnings: [], pages: [], actor: {
        ...fixtureActor(), status: 'NOT_STARTED', stopReason: 'not_started_no_eligible_listings',
      },
    }), /Incoherent fixture collector provenance/);
    await assert.rejects(foundation.save(requestBytes, {
      mode: 'live', warnings: [], pages: [], actor: {
        ...fixtureActor(), settings: { ...fixtureActor().settings, maxChargeUsd: 1 },
        status: 'NOT_STARTED', stopReason: 'not_started_no_eligible_listings',
      },
    }), /Incoherent live collector provenance/);
    await assert.rejects(foundation.save(requestBytes, {
      mode: 'live', warnings: [], pages: [],
      actor: { ...fixtureActor(), inputSha256: 'f'.repeat(64),
        settings: { ...fixtureActor().settings, maxChargeUsd: 1 }, runId: 'RUN', datasetId: 'DATA',
        status: 'SUCCEEDED', stopReason: 'dataset_exhausted' },
    }), /Collector input does not match selected listings/);
    assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_shopee_collections').get() as { count: bigint }).count, 0n);
  } finally { db.close(); }
});

test('015 empty and failed-source collections yield flags, not fabricated reviews', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const saved = await foundation.save(requestBytes, { mode: 'fixture', actor: fixtureActor('FAILED'),
      pages: [{ bytes: Buffer.from('[]'), offset: 0 }], warnings: ['actor_terminal_failed'] });
    const out = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation }).analyze(saved.packet.collectionId);
    assert.equal(out.result.reviews.length, 0);
    assert.ok(out.result.summary.listings.every(row => row.status === 'failed'));
    assert.equal(out.result.summary.collected, 0);
  } finally { db.close(); }
});

const runResponse = (status = 'SUCCEEDED', usageTotalUsd: number | null = null, maxTotalChargeUsd: number | null = null) => ({
  data: { id: 'RUN1', defaultDatasetId: 'DATA1', defaultKeyValueStoreId: 'STORE1', buildId: 'BUILD1',
    status, usageTotalUsd, options: { maxTotalChargeUsd } },
});
const respond = (value: unknown, headers?: HeadersInit): Response => new Response(JSON.stringify(value), {
  status: 200, ...(headers ? { headers } : {}),
});

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
    return respond(Array.from({ length: 100 }, (_, i) => ({ reviewId: (pages - 1) * 100 + i + 1 })),
      { 'x-apify-pagination-total': '700' });
  };
  assert.throws(() => new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 10_001, journalRoot: directory, fetch: fake }), /bounded maximum/);
  assert.equal(posts, 0);
  const collector = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1, journalRoot: directory, fetch: fake });
  const first = await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(first.pages.length, 5);
  assert.equal(first.actor.providerTotalRows, 700);
  assert.equal(first.actor.stopReason, 'collection_limit_reached');
  assert.match(first.actor.inputSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(offsets, ['0', '100', '200', '300', '400']);
  await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(posts, 1);
  if (process.platform !== 'win32') {
    const receiptDirectory = path.join(directory, fixtureRequest().runKey);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(receiptDirectory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(receiptDirectory, 'start.json'))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.join(receiptDirectory, 'run.json'))).mode & 0o777, 0o600);
  }
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

test('015 dataset pagination failure preserves earlier pages and explicit partial provenance', async () => {
  const directory = await root();
  let datasetCalls = 0;
  const collector = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1, journalRoot: directory,
    fetch: async (_url, init) => {
      if (init?.method === 'POST') return respond(runResponse());
      datasetCalls++;
      if (datasetCalls === 2) throw new Error('synthetic later-page failure');
      return respond(Array.from({ length: 100 }, (_, index) => ({
        reviewId: index + 1, shopId: 11, itemId: 101, ratingStar: 5, comment: 'Dễ uống ' + index,
      })));
    },
  });
  const result = await collector.collect(selectShopeeListings(fixtureRequest()).selected.slice(0, 1),
    digest(requestBytes), fixtureRequest().runKey);
  assert.equal(result.pages.length, 1);
  assert.equal(result.actor.stopReason, 'dataset_read_failed');
  assert.deepEqual(result.warnings, ['dataset_read_failed']);
  const databasePath = path.join(directory, 'partial.sqlite');
  const { db } = openDatabase({ databasePath });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'partial-artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const source = await foundation.save(jsonBytes({ ...fixtureRequest(), listings: fixtureRequest().listings.slice(0, 2) }), result);
    const analysis = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation })
      .analyze(source.packet.collectionId);
    assert.equal(analysis.result.summary.listings[0]!.status, 'partial');
  } finally { db.close(); }
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

test('015 multi-listing zero rows are conservatively unavailable without per-listing provider evidence', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const selected = selectedFixture();
    const actor = fixtureActor();
    const source = await foundation.save(requestBytes, { mode: 'live', warnings: [], pages: [], actor: {
      ...actor, settings: { ...actor.settings, maxChargeUsd: 1 },
      inputSha256: createHash('sha256').update(jsonBytes({ startUrls: selected.map(row => ({ url: row.productUrl })),
        maxReviewsPerProduct: 500, starFilter: 'all', contentFilter: 'with comments' })).digest('hex'),
      runId: 'RUN', datasetId: 'DATA', status: 'SUCCEEDED', stopReason: 'dataset_exhausted',
    } });
    const result = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation })
      .analyze(source.packet.collectionId);
    assert.ok(result.result.summary.listings.every(row => row.status === 'unavailable'));
  } finally { db.close(); }
});

test('015 malformed rows tied to a selected listing report partial rather than empty', async () => {
  const directory = await root();
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const bytes = jsonBytes([{ reviewId: 1, shopId: 11, itemId: 101, ratingStar: 0, comment: 'invalid star' }]);
    const source = await foundation.save(requestBytes, await new FixtureShopeeCollector(bytes).collect(selectedFixture()));
    const result = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation })
      .analyze(source.packet.collectionId);
    assert.equal(result.result.summary.listings.find(row => row.listingKey === 'shopee:11:101')!.status, 'partial');
    assert.equal(result.result.summary.invalidRows, 1);
  } finally { db.close(); }
});

test('015 Python filter subprocess does not inherit provider credentials', async () => {
  const source = await fs.readFile('src/modules/analysis/shopee-review-service.ts', 'utf8');
  assert.doesNotMatch(source, /env:\s*\{\s*\.\.\.process\.env/);
  assert.doesNotMatch(source.slice(source.indexOf("const child = spawn")), /TDN_APIFY_TOKEN/);
});

test('020 callable filter preserves the representative fixture decisions and numeric weights', async () => {
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
  assert.equal(output.find(row => row.reviewId === '1')!.score, 24); // unchanged weights applied to the narrower signal set
});

test('015 rejects raw collection evidence above the per-listing 500 cap', async () => {
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
    const collected = await new FixtureShopeeCollector(bytes).collect(selectShopeeListings(request).selected);
    await assert.rejects(foundation.save(jsonBytes(request), collected), /per-listing row budget/);
    assert.equal((db.prepare('SELECT count(*) AS count FROM foundation_shopee_collections').get() as { count: bigint }).count, 0n);
  } finally { db.close(); }
});

test('015 version 10 database upgrades remaining migrations and reruns idempotently', async () => {
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
  assert.deepEqual(next.migration.applied, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
  assert.equal(next.db.pragma('user_version', { simple: true }), 28n);
  assert.throws(() => next.db.prepare(`INSERT INTO analysis_shopee_review_results
    (collection_id, filter_sha256, artifact_sha256, created_at) VALUES (?, ?, ?, ?)`)
    .run('00000000-0000-4000-8000-000000000000', 'a'.repeat(64), 'b'.repeat(64), '2026-09-15T00:00:00.000Z'), /FOREIGN KEY/);
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


test('016 smoke limit is upstream, bounded, persisted, replayed, and does not change production default', async () => {
  const directory = await root();
  let posts = 0;
  let datasetReads = 0;
  const selected = selectShopeeListings(fixtureRequest()).selected.slice(0, 1);
  const fake: typeof fetch = async (_url, init) => {
    if (init?.method === 'POST') {
      posts++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.maxReviewsPerProduct, 20);
      return respond(runResponse('SUCCEEDED', 0.0838));
    }
    datasetReads++;
    const endpoint = new URL(String(_url));
    assert.equal(endpoint.searchParams.get('offset'), '0');
    assert.equal(endpoint.searchParams.get('limit'), '20');
    return respond(Array.from({ length: 20 }, (_, index) => ({
      reviewId: index + 1, shopId: 11, itemId: 101, ratingStar: 5,
      comment: index === 0 ? 'Giao hàng nhanh' : 'Dễ uống hàng ngày ' + index,
    })), { 'x-apify-pagination-total': '20' });
  };
  assert.throws(() => new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1,
    maxReviewsPerProduct: 0, journalRoot: directory, fetch: fake }), /integer from 1 through 500/);
  assert.throws(() => new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1,
    maxReviewsPerProduct: 501, journalRoot: directory, fetch: fake }), /integer from 1 through 500/);
  const collector = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1,
    maxReviewsPerProduct: 20, journalRoot: directory, fetch: fake });
  const collected = await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(posts, 1);
  assert.equal(datasetReads, 1);
  assert.equal(collected.actor.settings.maxReviewsPerProduct, 20);
  assert.equal(collected.actor.usageTotalUsd, 0.0838);
  assert.equal(collected.pages.flatMap(page => JSON.parse(page.bytes.toString())).length, 20);
  const production = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 1,
    journalRoot: path.join(directory, 'production'), fetch: fake });
  assert.equal(production.options.maxReviewsPerProduct, undefined);
  assert.equal((await import('../../src/platform/collectors/apify-shopee.js'))
    .shopeeActorInput(selected).maxReviewsPerProduct, 500);

  const request = fixtureRequest();
  request.listings = request.listings.slice(0, 2);
  const requestForOne = jsonBytes(request);
  const { db } = openDatabase({ databasePath: path.join(directory, 'smoke.sqlite') });
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'smoke-artifacts'));
    const foundation = new ShopeeCollectionService(db, artifacts);
    const source = await foundation.save(requestForOne, collected);
    assert.equal((await fs.stat(artifacts.pathForDigest(source.packet.pages[0]!.sha256))).mode & 0o777, 0o600);
    assert.equal(source.packet.actor.settings.maxReviewsPerProduct, 20);
    assert.equal(source.packet.actor.usageTotalUsd, 0.0838);
    const analysis = new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation });
    const first = await analysis.analyze(source.packet.collectionId);
    assert.equal((await fs.stat(artifacts.pathForDigest(first.sha256))).mode & 0o777, 0o600);
    assert.equal(first.result.summary.maxCommentsPerProduct, 20);
    assert.equal(first.result.summary.fetchedRows, 20);
    assert.equal(first.result.summary.collected, 20);
    assert.equal(first.result.summary.kept + first.result.summary.removed, 20);
    assert.equal(first.result.summary.listings[0]!.status, 'sample_limit');
    assert.equal((await analysis.analyze(source.packet.collectionId)).deduplicated, true);
    assert.equal((await foundation.read(source.packet.collectionId)).pages[0]!.bytes.equals(collected.pages[0]!.bytes), true);
  } finally { db.close(); }
});


test('016 existing-run verification is GET-only and binds run, dataset, cap, content filter and 20-row limit', async () => {
  const directory = await root();
  const selected = selectShopeeListings(fixtureRequest()).selected.slice(0, 1);
  let posts = 0;
  const endpoints: string[] = [];
  const fake: typeof fetch = async (url, init) => {
    if (init?.method === 'POST') posts++;
    const endpoint = new URL(String(url));
    endpoints.push(endpoint.pathname);
    if (endpoint.pathname.includes('/actor-runs/')) return respond(runResponse('SUCCEEDED', 0.0838, 0.1));
    if (endpoint.pathname.includes('/key-value-stores/')) return respond({
      startUrls: selected.map(row => ({ url: row.productUrl })), maxReviewsPerProduct: 20,
      starFilter: 'all', contentFilter: 'all',
    });
    assert.equal(endpoint.searchParams.get('limit'), '20');
    return respond(Array.from({ length: 20 }, (_, index) => ({
      reviewId: index + 1, shopId: 11, itemId: 101, ratingStar: 5, comment: 'Dễ uống ' + index,
    })), { 'x-apify-pagination-total': '20' });
  };
  const collector = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 0.1,
    maxReviewsPerProduct: 20, contentFilter: 'all', journalRoot: directory,
    existingRun: { runId: 'RUN1', datasetId: 'DATA1' }, fetch: fake });
  const result = await collector.collect(selected, digest(requestBytes), fixtureRequest().runKey);
  assert.equal(posts, 0);
  assert.deepEqual(endpoints, ['/v2/actor-runs/RUN1', '/v2/key-value-stores/STORE1/records/INPUT',
    '/v2/datasets/DATA1/items']);
  assert.equal(result.actor.settings.contentFilter, 'all');
  assert.equal(result.actor.settings.maxChargeUsd, 0.1);
  assert.equal(result.actor.inputSha256, createHash('sha256').update(jsonBytes({
    startUrls: selected.map(row => ({ url: row.productUrl })), maxReviewsPerProduct: 20,
    starFilter: 'all', contentFilter: 'all',
  })).digest('hex'));
  const wrongCap = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 0.2,
    maxReviewsPerProduct: 20, contentFilter: 'all', journalRoot: directory,
    existingRun: { runId: 'RUN1', datasetId: 'DATA1' }, fetch: fake });
  await assert.rejects(() => wrongCap.collect(selected, digest(requestBytes), fixtureRequest().runKey), /charge cap mismatch/);
  const wrongInput = new ApifyShopeeCollector({ token: 'SECRET', maxChargeUsd: 0.1,
    maxReviewsPerProduct: 20, contentFilter: 'with comments', journalRoot: directory,
    existingRun: { runId: 'RUN1', datasetId: 'DATA1' }, fetch: fake });
  await assert.rejects(() => wrongInput.collect(selected, digest(requestBytes), fixtureRequest().runKey), /input mismatch/);
  assert.equal(posts, 0);
});


test('018 guided-field parsing preserves ambiguous text without changing original reviews', () => {
  const rows = [
    { id: 'single', text: 'Công dụng:bổ sung canxi Uống thấy đỡ chuột rút' },
    { id: 'double', text: 'Công dụng:bổ sung canxi  Uống thấy đỡ chuột rút' },
    { id: 'multiple', text: 'Công dụng:bổ sung Đối tượng sử dụng:người lớn Uống dễ chịu' },
    { id: 'signal-final', text: 'Độ dễ uống:vị nhẹ Bé uống hàng ngày' },
    { id: 'field-only', text: 'Công dụng:bổ sung canxi' },
    { id: 'free', text: 'Uống thấy đỡ chuột rút' },
  ].map((row, index) => ({ ...row, product: 'synthetic-calcium', star: 5,
    listingKey: 'shopee:1:1', rawPageSha256: 'a'.repeat(64), rawRowIndex: index }));
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  const adapted = spawnSync(python, ['-B', 'scripts/filter-shopee-reviews.py'], {
    env, input: JSON.stringify(rows), encoding: 'utf8',
  });
  assert.equal(adapted.status, 0, adapted.stderr);
  const output = JSON.parse(adapted.stdout) as Array<{
    reviewId: string; text: string; content: string; target: string;
    guidedFieldBoundary: string; decision: string; signals: string[];
  }>;
  const byId = new Map(output.map(row => [row.reviewId, row]));
  assert.deepEqual(output.map(row => row.text).sort(), rows.map(row => row.text).sort());
  assert.deepEqual(byId.get('single'), {
    ...byId.get('single'), content: 'bổ sung canxi Uống thấy đỡ chuột rút', target: '',
    guidedFieldBoundary: 'ambiguous-preserved', decision: 'kept',
  });
  assert.equal(byId.get('single')!.signals.includes('thấy đỡ'), true);
  assert.equal(byId.get('double')!.content, 'Uống thấy đỡ chuột rút');
  assert.equal(byId.get('double')!.guidedFieldBoundary, 'explicit');
  assert.equal(byId.get('multiple')!.content, 'người lớn Uống dễ chịu');
  assert.equal(byId.get('multiple')!.target, 'người lớn Uống dễ chịu');
  assert.equal(byId.get('multiple')!.guidedFieldBoundary, 'ambiguous-preserved');
  assert.equal(byId.get('signal-final')!.content, 'độ dễ uống: vị nhẹ Bé uống hàng ngày');
  assert.equal(byId.get('signal-final')!.guidedFieldBoundary, 'ambiguous-preserved');
  assert.equal(byId.get('signal-final')!.text, 'Độ dễ uống:vị nhẹ Bé uống hàng ngày');
  assert.equal(byId.get('field-only')!.content, 'bổ sung canxi');
  assert.equal(byId.get('field-only')!.guidedFieldBoundary, 'ambiguous-preserved');
  assert.equal(byId.get('free')!.content, 'Uống thấy đỡ chuột rút');
  assert.equal(byId.get('free')!.guidedFieldBoundary, 'none');
});


test('020 product-use policy boundaries are narrow, mixed-comment eligible, and negation-aware', () => {
  const cases = [
    ['taste', 'Vị chua nhẹ, mùi sữa thơm', 'kept'],
    ['opening', 'Ống dễ bẻ và không bị vụn', 'kept'],
    ['preparation', 'Bột dễ pha với nước', 'kept'],
    ['effect', 'Dùng một tháng thấy đỡ đau lưng', 'kept'],
    ['no-effect', 'Uống hết hộp vẫn chưa thấy hiệu quả', 'kept'],
    ['mixed', 'Giao hàng nhanh, giá tốt nhưng vị ngọt nhẹ và dễ uống', 'kept'],
    ['price', 'Giá rẻ, săn sale rất hời', 'removed'],
    ['service', 'Shop tư vấn nhiệt tình, giao hàng nhanh', 'removed'],
    ['authenticity', 'Hàng chính hãng, tem phụ đầy đủ nên yên tâm', 'removed'],
    ['motivation', 'Mua để bổ sung canxi cho mẹ', 'removed'],
    ['symptom-motivation', 'Mua cho mẹ bị đau lưng', 'removed'],
    ['reordered-symptom-motivation', 'Mẹ bị đau lưng nên tôi mua loại này', 'removed'],
    ['reordered-constipation-motivation', 'Bị táo bón nên mua loại này', 'removed'],
    ['reordered-numbness-motivation', 'Mẹ bị tê chân nên đặt loại này', 'removed'],
    ['hearsay-attribute', 'Nghe nói loại này dễ uống', 'kept'],
    ['hearsay-effect', 'Người quen giới thiệu loại này không gây táo bón', 'kept'],
    ['doctor-hearsay', 'Bác sĩ bảo loại này không gây táo bón', 'kept'],
    ['hearsay-then-use', 'Bác sĩ bảo loại này không gây táo bón. Tôi uống thấy dễ uống', 'kept'],
    ['abbreviated-hearsay', 'Mình được một ng bạn gt dùng, thấy khá tốt k bị táo', 'kept'],
    ['generic-hearsay', 'Nghe nói sản phẩm tốt', 'removed'],
    ['repurchase', 'Đã dùng nhiều lần, sẽ mua lại', 'removed'],
    ['generic', 'Sản phẩm tốt, dùng rất ổn', 'removed'],
    ['just-started', 'Giờ mới bắt đầu dùng, chưa biết chất lượng', 'removed'],
    ['not-used-question', 'Chưa dùng thử, không biết có bị táo không', 'removed'],
    ['purchase-then-use', 'Mua hộp này rồi uống bị đau bụng', 'kept'],
    ['not-used-then-use', 'Chưa dùng trước đây nhưng hôm nay uống thấy vị chua', 'kept'],
    ['field-label', 'Xương chắc khỏe:ok Tăng chiều cao:giờ mới dùng', 'removed'],
    ['negated-complaint', 'Siro không khó uống và không gây khó chịu', 'kept'],
    ['modified-negation', 'Siro không quá khó uống', 'kept'],
    ['not-a-complaint', 'Siro không phải là khó uống', 'kept'],
    ['negated-positive', 'Uống thử thấy không dễ uống', 'kept'],
    ['no-benefit', 'Uống một tháng nhưng không thấy đỡ đau', 'kept'],
    ['not-constipated', 'Uống loại này không bị táo bón', 'kept'],
    ['reported-no-improvement', 'Đã uống 20 ngày mà chưa thấy cải thiện giấc ngủ', 'kept'],
    ['reported-no-effect', 'Đã dùng hai tháng nhưng chưa thấy tác dụng', 'kept'],
    ['reported-no-change', 'Đã hết liệu trình nhưng chưa thấy sự thay đổi', 'kept'],
    ['reported-no-adverse', 'Đang uống và chưa thấy bất thường gì', 'kept'],
    ['opening-fragments', 'Uống mấy ống mà lúc bẻ ống rớt miểng liên tục', 'kept'],
    ['future-effect', 'Để thử mấy tháng xem có cao lên không', 'removed'],
    ['shipping-word-collision', 'Giao hàng cực kỳ nhanh chóng mặt', 'removed'],
  ] as const;
  const rows = cases.map(([id, text], index) => ({ id, text, product: 'synthetic-calcium', star: 5,
    listingKey: 'shopee:1:1', rawPageSha256: 'a'.repeat(64), rawRowIndex: index }));
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  const adapted = spawnSync(python, ['-B', 'scripts/filter-shopee-reviews.py'], {
    env, input: JSON.stringify(rows), encoding: 'utf8',
  });
  assert.equal(adapted.status, 0, adapted.stderr);
  const output = JSON.parse(adapted.stdout) as Array<{
    reviewId: string; text: string; decision: string; reason: string; negative: string[];
  }>;
  const byId = new Map(output.map(row => [row.reviewId, row]));
  for (const [id, , decision] of cases) assert.equal(byId.get(id)!.decision, decision, id);
  assert.equal(byId.get('hearsay-attribute')!.text, 'Nghe nói loại này dễ uống');
  assert.deepEqual(byId.get('negated-complaint')!.negative, []);
  assert.deepEqual(byId.get('modified-negation')!.negative, []);
  assert.deepEqual(byId.get('not-a-complaint')!.negative, []);
  assert.deepEqual(byId.get('negated-positive')!.negative, ['không dễ uống']);
  assert.deepEqual(byId.get('no-benefit')!.negative, ['không thấy đỡ']);
  assert.deepEqual(byId.get('not-constipated')!.negative, []);
  assert.deepEqual(byId.get('reported-no-improvement')!.negative, ['chưa thấy cải thiện']);
  assert.deepEqual(byId.get('reported-no-effect')!.negative, ['chưa thấy tác dụng']);
  assert.deepEqual(byId.get('reported-no-change')!.negative, ['chưa thấy sự thay đổi']);
  assert.deepEqual(byId.get('reported-no-adverse')!.negative, []);
  assert.equal(byId.get('field-label')!.reason, 'Không có trải nghiệm sử dụng sản phẩm cụ thể');
});

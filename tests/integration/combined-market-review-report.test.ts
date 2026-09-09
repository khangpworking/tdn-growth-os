import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import {
  AnalysisResultReader,
  AnalysisShopeeReviewResultReader,
  CombinedMarketReviewReportReader,
  MarketSnapshotService,
  renderCombinedMarketReviewReport,
} from '../../src/modules/analysis/index.js';
import {
  DataPackService,
  FoundationDataPackReader,
  FoundationService,
  ShopeeCollectionService,
} from '../../src/modules/foundation/index.js';
import { jsonBytes, parseJsonBytes, selectShopeeListings, validateListingRequest } from '../../src/modules/foundation/shopee-selection.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { registerManifest } from '../../src/platform/artifacts/register-manifest.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ShopeeReviewAnalysisService } from '../../src/modules/analysis/shopee-review-service.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))));

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-combined-022-'));
  roots.push(root);
  const databasePath = path.join(root, 'foundation.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);

  const foundation = new FoundationService({ db, artifactStore: artifacts, now: () => new Date('2026-09-07T08:00:00Z') });
  const imported = await foundation.importJsonExport(await fs.readFile('tests/fixtures/json-export.synthetic.json'));
  const packs = new DataPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-07T09:00:00Z') });
  const pack = await packs.finalize({ contractVersion: '1.0.0', packKey: `analysis:combined-${randomUUID()}`, version: 1,
    purpose: 'Synthetic combined report market input.', observationIds: imported.observationIds.map(String) });
  const marketService = new MarketSnapshotService({ db, artifactStore: artifacts,
    dataPackReader: new FoundationDataPackReader(packs), now: () => new Date('2026-09-07T10:00:00Z') });
  const market = await marketService.calculate({ contractVersion: '1.0.0', dataPackId: pack.packId,
    calculationKey: 'market_snapshot_v1', calculationVersion: 1 });

  const request = validateListingRequest(parseJsonBytes(await fs.readFile('tests/fixtures/shopee-listings.synthetic.json')));
  request.runKey = `combined-review-${randomUUID()}`;
  request.listings = request.listings.slice(0, 2);
  const listing = selectShopeeListings(request).selected[0]!;
  const raw = jsonBytes([{ reviewId: 2201, shopId: Number(listing.shopId), itemId: Number(listing.itemId), ratingStar: 4,
    comment: 'Dễ uống, vị nhẹ', region: 'VN' }]);
  const collected = await new FixtureShopeeCollector(raw).collect([listing]);
  collected.actor.retrievedAt = '2026-09-07T10:30:00Z';
  const collections = new ShopeeCollectionService(db, artifacts);
  const collection = await collections.save(jsonBytes(request), collected);
  const review = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: collections }).analyze(collection.packet.collectionId);
  const reader = new CombinedMarketReviewReportReader({ db, marketResultReader: new AnalysisResultReader(marketService),
    reviewResultReader: new AnalysisShopeeReviewResultReader({ db, artifactStore: artifacts, collectionReader: collections }) });
  return { root, databasePath, artifactRoot, db, artifacts, reader, market, review };
}

function counts(db: ReturnType<typeof openDatabase>['db']) {
  return {
    market: (db.prepare('SELECT count(*) AS count FROM analysis_results').get() as { count: bigint }).count,
    reviews: (db.prepare('SELECT count(*) AS count FROM analysis_shopee_review_results').get() as { count: bigint }).count,
    artifacts: (db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as { count: bigint }).count,
  };
}

test('022 selects exact persisted digests deterministically without database side effects', async () => {
  const state = await setup();
  try {
    const before = counts(state.db);
    const input = await state.reader.read(state.market.resultArtifactSha256, state.review.sha256);
    assert.equal(input.marketResult.resultId, state.market.resultId);
    assert.equal(input.reviewResult.resultSha256, state.review.sha256);
    const report = renderCombinedMarketReviewReport(input);
    assert.equal(renderCombinedMarketReviewReport(await state.reader.read(state.market.resultArtifactSha256, state.review.sha256)), report);
    assert.ok(report.includes(state.market.resultArtifactSha256));
    assert.ok(report.includes(state.review.sha256));
    assert.deepEqual(counts(state.db), before);
    await assert.rejects(() => state.reader.read('f'.repeat(64), state.review.sha256), /not found/);
    await assert.rejects(() => state.reader.read('latest', state.review.sha256), /Invalid Market Result/);
    await assert.rejects(() => state.reader.read(state.market.resultArtifactSha256, 'latest'), /Invalid Result SHA-256/);
    assert.deepEqual(counts(state.db), before);
  } finally { state.db.close(); }
});

test('022 rejects corrupt market and unsupported review Results', async () => {
  const corrupt = await setup();
  try {
    await fs.writeFile(corrupt.artifacts.pathForDigest(corrupt.market.resultArtifactSha256), '{}');
    await assert.rejects(() => corrupt.reader.read(corrupt.market.resultArtifactSha256, corrupt.review.sha256), /digest mismatch/);
  } finally { corrupt.db.close(); }

  const unsupported = await setup();
  try {
    const original = await new AnalysisShopeeReviewResultReader({ db: unsupported.db, artifactStore: unsupported.artifacts,
      collectionReader: new ShopeeCollectionService(unsupported.db, unsupported.artifacts) }).readByDigest(unsupported.review.sha256);
    const result = structuredClone(original.result);
    (result as { filterVersion: string }).filterVersion = 'shopee-calcium-v3-adapter2';
    result.filterSha256 = 'e'.repeat(64);
    const artifact = await unsupported.artifacts.put(jsonBytes(result));
    registerManifest(unsupported.db, artifact, result.createdAt);
    unsupported.db.prepare(`INSERT INTO analysis_shopee_review_results
      (collection_id, filter_sha256, artifact_sha256, created_at) VALUES (?, ?, ?, ?)`)
      .run(result.collectionId, result.filterSha256, artifact.sha256, result.createdAt);
    await assert.rejects(() => unsupported.reader.read(unsupported.market.resultArtifactSha256, artifact.sha256), /Unsupported Shopee filter version/);
  } finally { unsupported.db.close(); }
});

test('022 CLI uses read-only persisted inputs, writes 0600, and refuses overwrite', async () => {
  const state = await setup();
  state.db.pragma('wal_checkpoint(TRUNCATE)');
  state.db.close();
  const output = path.join(state.root, 'combined.md');
  const before = createHash('sha256').update(await fs.readFile(state.databasePath)).digest('hex');
  const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/export-combined-market-review-report.ts',
    state.databasePath, state.artifactRoot, state.market.resultArtifactSha256, state.review.sha256, output],
  { encoding: 'utf8', timeout: 30_000, env: { ...process.env, TDN_APIFY_TOKEN: 'MUST_NOT_USE', TDN_PYTHON: 'must-not-run' } });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).databaseMutations, 0);
  if (process.platform !== 'win32') assert.equal((await fs.stat(output)).mode & 0o777, 0o600);
  assert.equal(createHash('sha256').update(await fs.readFile(state.databasePath)).digest('hex'), before);
  const second = run();
  assert.equal(second.status, 1);
  assert.match(second.stderr, /Refusing to overwrite/);
});

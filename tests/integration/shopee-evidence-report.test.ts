import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import type { ShopeeListingRequest } from '../../contracts/foundation/shopee-listing-request.generated.js';
import { AnalysisShopeeReviewResultReader } from '../../src/modules/analysis/shopee-review-result-reader.js';
import { renderVietnameseShopeeEvidenceReport } from '../../src/modules/analysis/shopee-evidence-report.js';
import { ShopeeReviewAnalysisService } from '../../src/modules/analysis/shopee-review-service.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { digest, jsonBytes, parseJsonBytes, selectShopeeListings, validateListingRequest } from '../../src/modules/foundation/shopee-selection.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { registerManifest } from '../../src/platform/artifacts/register-manifest.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { openDatabase } from '../../src/platform/db/index.js';

const baseRequestBytes = await fs.readFile('tests/fixtures/shopee-listings.synthetic.json');
const baseRequest = validateListingRequest(parseJsonBytes(baseRequestBytes));
const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-shopee-021-'));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of roots.splice(0)) {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tdn-shopee-021-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function oneListingRequest(overrides: Partial<ShopeeListingRequest> = {}): ShopeeListingRequest {
  return {
    ...structuredClone(baseRequest),
    runKey: 'synthetic-report-021',
    topic: 'Canxi tổng hợp — fixture, không phải bằng chứng thị trường',
    source: { label: 'Fixture Metric-shaped đã lưu', acquiredAt: '2026-09-20T08:00:00.000Z' },
    listings: structuredClone(baseRequest.listings.slice(0, 2)),
    ...overrides,
  };
}

function rowsForRequest(request: ShopeeListingRequest): unknown[] {
  const listing = selectShopeeListings(request).selected[0]!;
  return [
    {
      reviewId: 101, shopId: Number(listing.shopId), itemId: Number(listing.itemId), ratingStar: 4,
      comment: 'Độ dễ uống:vị nhẹ\n# tiêu đề giả\n![ảnh](https://evil.example/x) <script>alert(1)</script> & nghe nói dễ uống',
      region: 'VN', authorName: 'KHÔNG-ĐƯỢC-XUẤT',
    },
    {
      reviewId: 102, shopId: Number(listing.shopId), itemId: Number(listing.itemId), ratingStar: 5,
      comment: 'Giao hàng nhanh, đóng gói cẩn thận', region: 'VN', authorName: 'KHÔNG-ĐƯỢC-XUẤT-2',
    },
    {
      reviewId: 102, shopId: Number(listing.shopId), itemId: Number(listing.itemId), ratingStar: 5,
      comment: 'Giao hàng nhanh, đóng gói cẩn thận', region: 'VN', authorName: 'KHÔNG-ĐƯỢC-XUẤT-2',
    },
    {
      reviewId: 103, shopId: Number(listing.shopId), itemId: Number(listing.itemId), ratingStar: 9,
      comment: 'invalid synthetic rating', region: 'VN', authorName: 'KHÔNG-ĐƯỢC-XUẤT-3',
    },
  ];
}

async function persistedFixture(options: { request?: ShopeeListingRequest; rows?: unknown[]; partial?: boolean } = {}) {
  const root = await tempRoot();
  const databasePath = path.join(root, 'evidence.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const request = options.request ?? oneListingRequest();
  const requestBytes = jsonBytes(request);
  const selected = selectShopeeListings(request).selected;
  const rawBytes = jsonBytes(options.rows ?? rowsForRequest(request));
  const collected = await new FixtureShopeeCollector(rawBytes).collect(selected);
  collected.actor.retrievedAt = '2026-09-20T09:00:00.000Z';
  if (options.partial) {
    collected.actor.status = 'FAILED';
    collected.actor.stopReason = 'actor_terminal_failed';
    collected.warnings = ['actor_terminal_failed'];
  }
  const collections = new ShopeeCollectionService(db, artifacts);
  const collection = await collections.save(requestBytes, collected);
  const analysis = await new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: collections })
    .analyze(collection.packet.collectionId);
  const reader = new AnalysisShopeeReviewResultReader({ db, artifactStore: artifacts, collectionReader: collections });
  return { root, databasePath, artifactRoot, db, artifacts, request, rawBytes, collection, analysis, reader };
}

test('021 exports exact digest with accurate counts, source references, safe inert text and deterministic bytes', async () => {
  const state = await persistedFixture();
  try {
    const beforeRows = (state.db.prepare('SELECT count(*) AS count FROM analysis_shopee_review_results').get() as { count: bigint }).count;
    const first = await state.reader.readByDigest(state.analysis.sha256);
    const report = renderVietnameseShopeeEvidenceReport(first);
    assert.equal(renderVietnameseShopeeEvidenceReport(await state.reader.readByDigest(state.analysis.sha256)), report);
    assert.match(report, /Dòng fetched: \*\*4\*\*/);
    assert.match(report, /Dòng normalized: \*\*2\*\*/);
    assert.match(report, /GIỮ: \*\*1\*\*; LOẠI: \*\*1\*\*/);
    assert.match(report, /Không hợp lệ: \*\*1\*\*/);
    assert.match(report, /Trùng lặp: \*\*1\*\*/);
    assert.match(report, /Rating: \*\*4\/5\*\*/);
    assert.match(report, /Matched signals: `dễ uống`/);
    assert.match(report, /Cờ guided field mơ hồ: \*\*Có\*\*/);
    assert.ok(report.includes(state.analysis.sha256));
    assert.ok(report.includes(state.collection.packet.pages[0]!.sha256));
    assert.match(report, /row index: \*\*0\*\*/);
    assert.ok(report.includes('&#10;# tiêu đề giả&#10;![ảnh](https://evil.example/x)'));
    assert.ok(report.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp;'));
    assert.doesNotMatch(report, /^# tiêu đề giả$/m);
    assert.doesNotMatch(report, /<script>|KHÔNG-ĐƯỢC-XUẤT/);
    assert.match(report, /không phải sentiment, confidence/);
    assert.match(report, /Hearsay không phải bằng chứng trải nghiệm trực tiếp/);
    assert.match(report, /không thiết lập quan hệ nhân quả/);
    assert.match(report, /không phải cam kết rằng chính nội dung free text không chứa thông tin cá nhân/);
    assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_shopee_review_results').get() as { count: bigint }).count, beforeRows);
    await assert.rejects(() => state.reader.readByDigest('f'.repeat(64)), /not found/);
    await assert.rejects(() => state.reader.readByDigest('latest'), /Invalid Result SHA-256/);
  } finally { state.db.close(); }
});

test('021 reports empty-kept and partial coverage without inventing metadata or conclusions', async () => {
  const request = oneListingRequest({ runKey: 'synthetic-report-empty-021' });
  const listing = selectShopeeListings(request).selected[0]!;
  const state = await persistedFixture({ request, partial: true, rows: [{
    reviewId: 201, shopId: Number(listing.shopId), itemId: Number(listing.itemId), ratingStar: 5,
    comment: 'Giao hàng nhanh, đóng gói cẩn thận', region: 'VN',
  }] });
  try {
    const report = renderVietnameseShopeeEvidenceReport(await state.reader.readByDigest(state.analysis.sha256));
    assert.match(report, /Không có review nào được filter giữ lại/);
    assert.match(report, /GIỮ: \*\*0\*\*; LOẠI: \*\*1\*\*/);
    assert.match(report, /fewer_than_configured_limit_valid_unique_rows_some_listings_no_backfill/);
    assert.match(report, /trạng thái `partial`/);
    assert.match(report, /actor_terminal_failed/);
    assert.doesNotMatch(report, /E[0-5]\s*:/);
    assert.doesNotMatch(report, /Kết luận thị trường|Chủ đề nổi bật/);
  } finally { state.db.close(); }
});

test('021 rejects corrupted, mismatched, unsupported and ambiguous persisted Results', async () => {
  const state = await persistedFixture();
  try {
    const original = await state.reader.readByDigest(state.analysis.sha256);
    const mismatch = structuredClone(original.result);
    mismatch.summary.kept = 0;
    const mismatchBytes = jsonBytes(mismatch);
    const mismatchArtifact = await state.artifacts.put(mismatchBytes);
    registerManifest(state.db, mismatchArtifact, mismatch.createdAt);
    state.db.exec('DROP TRIGGER analysis_shopee_review_results_no_update');
    state.db.prepare('UPDATE analysis_shopee_review_results SET artifact_sha256=? WHERE artifact_sha256=?')
      .run(mismatchArtifact.sha256, state.analysis.sha256);
    await assert.rejects(() => state.reader.readByDigest(mismatchArtifact.sha256), /replay mismatch/);
    state.db.prepare('UPDATE analysis_shopee_review_results SET artifact_sha256=? WHERE artifact_sha256=?')
      .run(state.analysis.sha256, mismatchArtifact.sha256);

    const unsupported = { ...structuredClone(original.result), filterVersion: 'shopee-calcium-v3-adapter2',
      filterSha256: 'e'.repeat(64) };
    const unsupportedArtifact = await state.artifacts.put(jsonBytes(unsupported));
    registerManifest(state.db, unsupportedArtifact, unsupported.createdAt);
    state.db.prepare(`INSERT INTO analysis_shopee_review_results
      (collection_id, filter_sha256, artifact_sha256, created_at) VALUES (?, ?, ?, ?)`)
      .run(unsupported.collectionId, unsupported.filterSha256, unsupportedArtifact.sha256, unsupported.createdAt);
    await assert.rejects(() => state.reader.readByDigest(unsupportedArtifact.sha256), /Unsupported Shopee filter version.*adapter2/);

    state.db.prepare(`UPDATE analysis_shopee_review_results SET artifact_sha256=? WHERE artifact_sha256=?`)
      .run(state.analysis.sha256, unsupportedArtifact.sha256);
    await assert.rejects(() => state.reader.readByDigest(state.analysis.sha256), /digest is ambiguous/);
  } finally { state.db.close(); }

  const corruptState = await persistedFixture({ request: oneListingRequest({ runKey: 'synthetic-report-corrupt-021' }) });
  try {
    await fs.writeFile(corruptState.artifacts.pathForDigest(corruptState.analysis.sha256), 'corrupt');
    await assert.rejects(() => corruptState.reader.readByDigest(corruptState.analysis.sha256), /digest mismatch/);
  } finally { corruptState.db.close(); }
});

test('021 CLI is read-only, makes zero provider/filter calls, writes 0600 outside Git and refuses overwrite', async () => {
  const state = await persistedFixture();
  state.db.pragma('wal_checkpoint(TRUNCATE)');
  state.db.close();
  const outputPath = path.join(state.root, 'report.md');
  const databaseBefore = createHash('sha256').update(await fs.readFile(state.databasePath)).digest('hex');
  const artifactTreeBefore = await fileTree(state.artifactRoot);
  const cli = (output: string) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/export-shopee-evidence-report.ts',
    state.databasePath, state.artifactRoot, state.analysis.sha256, output], {
    encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TDN_APIFY_TOKEN: 'MUST_NOT_USE', TDN_PYTHON: 'must-not-run' },
  });
  const first = cli(outputPath);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout), {
    resultSha256: state.analysis.sha256,
    outputPath,
    bytes: Buffer.byteLength(await fs.readFile(outputPath, 'utf8'), 'utf8'),
    providerCalls: 0,
    filterCalls: 0,
    databaseMutations: 0,
  });
  if (process.platform !== 'win32') assert.equal((await fs.stat(outputPath)).mode & 0o777, 0o600);
  assert.equal(createHash('sha256').update(await fs.readFile(state.databasePath)).digest('hex'), databaseBefore);
  assert.deepEqual(await fileTree(state.artifactRoot), artifactTreeBefore);
  const second = cli(outputPath);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /Refusing to overwrite/);
  const insideRepo = cli(path.resolve('task-021-must-not-write.md'));
  assert.equal(insideRepo.status, 1);
  assert.match(insideRepo.stderr, /outside the Git repository/);
  await assert.rejects(() => fs.stat('task-021-must-not-write.md'), /ENOENT/);

  const source = await fs.readFile('scripts/export-shopee-evidence-report.ts', 'utf8');
  assert.doesNotMatch(source, /\.analyze\(|ApifyShopeeCollector|filter-shopee-reviews|openDatabase\(/);
  assert.match(source, /readonly: true/);
  assert.match(source, /query_only = ON/);
});

test('021 rejects a self-consistent adapter3 Result with an unrecognized filter digest', async () => {
  const state = await persistedFixture({ request: oneListingRequest({ runKey: 'synthetic-report-wrong-filter-021' }) });
  try {
    const original = await state.reader.readByDigest(state.analysis.sha256);
    const wrong = structuredClone(original.result);
    wrong.filterSha256 = 'c'.repeat(64);
    const artifact = await state.artifacts.put(jsonBytes(wrong));
    registerManifest(state.db, artifact, wrong.createdAt);
    state.db.prepare(`INSERT INTO analysis_shopee_review_results
      (collection_id, filter_sha256, artifact_sha256, created_at) VALUES (?, ?, ?, ?)`)
      .run(wrong.collectionId, wrong.filterSha256, artifact.sha256, wrong.createdAt);
    await assert.rejects(() => state.reader.readByDigest(artifact.sha256), /Unsupported Shopee adapter3 filter digest/);
  } finally { state.db.close(); }
});

async function fileTree(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.push(path.relative(root, path.join(entry.parentPath, entry.name)));
  }
  return files.sort();
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { fixture, startRun } from '../helpers/autorun-harness.js';
import { collectionInput, PRODUCTS } from './raw-db-v1-s05.js';
import { saveKalodataCapture, S02B_DOCUMENT } from './raw-db-v1-s02b.js';
import { prepareVideoReadingCollection } from './raw-db-v1-s14.js';
import { saveGoogleCapture, ANSWER, QUERY } from './raw-db-v1-google.js';
import { tiktokFixture, runId as tiktokRunId } from './tiktok-coding-fixture.js';
import { labelsGolden, type LabelCall } from './raw-db-v1-labels.js';

export const A_AT = '2026-11-03T01:00:01.000Z';
export const A_TEXT = '  Mẫu thử nắp xanh 🧪\nCafe\u0301 <&>  ';
export const A_SOURCES = ['S05', 'S06', 'S07', 'S02b', 'S14', 'S19b', 'S29'] as const;
export const aHash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
type StoredRun = { db: Database.Database; artifacts: ContentAddressedArtifactStore; runId: string };

export function aReviews(ratings: readonly unknown[] = [5, '4']) {
  return ratings.map((rating, index) => ({ product_id: '79001', sku_specification: '  Xanh thử nghiệm 🧪  ', digg_count: index,
    is_anonymous: index === 0, review_user: { name: 'SYNTHETIC_DISPLAY_NAME' },
    review: { review_id: `96000${index}`, display_text: index === 0 ? A_TEXT : `Mẫu giả lập ${index} 🧪`,
      comment: 'Không dùng trường comment này', rating, review_timestamp: 1789741801752,
      reviewer_name: 'SYNTHETIC_DISPLAY_NAME' } }));
}

/** Real retained envelope/artifact contracts; only the upstream provider response is synthetic. */
export async function saveS06Capture(f: StoredRun, rows = aReviews(), ordinal = 20) {
  const body = { success: true, data: { product_id: '79001', original_comments: rows } };
  const response = Buffer.from(JSON.stringify(body));
  const envelope = { contractVersion: 'research-automation-capture-v1', captureId: `synthetic-a-s06-${ordinal}`,
    provider: 'KALODATA', operation: 'kalodata.product.comment.insight', billing: 'PAID_CREDITS', method: 'POST',
    endpoint: 'https://www.kalodata.com/openapi/v1/tiktok/product/comment/insight',
    requestParameters: { product_id: '79001', country_code: 'VN' },
    requestBodyBytesBase64: Buffer.from('{"product_id":"79001","country_code":"VN"}').toString('base64'),
    productRef: 'kalodata:79001', queryWindow: null, pageNumber: null,
    requestedAt: '2026-11-03T01:00:00.000Z', completedAt: A_AT, outcome: 'OK', httpStatus: 200,
    responseBytesBase64: response.toString('base64'), responseSha256: aHash(response), responseByteLength: response.length,
    providerCode: null, responseHeaders: {} };
  return retainEnvelope(f, ordinal, envelope);
}

async function retainEnvelope(f: StoredRun, ordinal: number, envelope: { provider: string; operation: string; responseSha256: string }) {
  const stored = await f.artifacts.put(Buffer.from(canonicalJson(envelope)));
  f.db.prepare(`INSERT OR IGNORE INTO artifact_manifests
    (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
    VALUES (?,?,'application/json',?,?,'1.0.0',?)`).run(stored.sha256, stored.byteSize, stored.relativePath, A_AT, A_AT);
  f.db.prepare(`INSERT INTO analysis_research_automation_captures
    (run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,truncated,retained_at)
    VALUES (?,'COLLECTION',?,?,'application/json',?,?,?,0,?)`)
    .run(f.runId, ordinal, stored.sha256, envelope.provider.toLowerCase(), envelope.operation, A_AT, A_AT);
  return { ...stored, responseSha256: envelope.responseSha256 };
}

export async function s06Fixture(t: TestContext, rows = aReviews()) {
  const f = await fixture(t, 'off'), runId = await startRun(f.service);
  await saveKalodataCapture({ ...f, runId }, 19, 'kalodata.product.detail', { product_id: '79001' },
    { success: true, data: { product_id: '79001', product_name: 'Sản phẩm giả lập 🧪', product_url: 'https://example.test/79001' } });
  const capture = await saveS06Capture({ ...f, runId }, rows);
  return { ...f, runId, capture };
}

/** Seven genuinely retained sources in one run; no loader result or ordering is fabricated. */
export async function autoloadFixture(t: TestContext) {
  const seeded = await tiktokFixture(t, async f => {
    const prepared = await prepareVideoReadingCollection(f, undefined, false);
    return { videoWatch: prepared.document.videoWatch, captures: prepared.result.map(item => item.sourceCapture) };
  });
  const f = { ...seeded, runId: tiktokRunId };
  const privacyFile = path.join(f.root, 'a-privacy.json');
  await fs.writeFile(privacyFile, JSON.stringify({ keyId: f.collector.privacyProfile.keyId,
    salt: Buffer.alloc(32, 17).toString('base64') }), { mode: 0o600 });
  await new ShopeeCollectionService(f.db, f.artifacts).savePublicExact(Buffer.from(JSON.stringify({
    contractVersion: '2.0.0', runKey: `auto-${f.runId}`, topic: 'Synthetic A', selectionBasis: 'OWNER_EXACT_URL',
    source: { label: 'Synthetic A products', acquiredAt: A_AT }, productUrls: PRODUCTS.map(p => p.productUrl),
  })), collectionInput());
  // Existing product rows are an allowed input: names were loaded by an earlier synthetic run.
  f.db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('a-prior-products','a-prior-run','S05','synthetic','synthetic',?,'OK')`).run(A_AT);
  for (const p of PRODUCTS) f.db.prepare(`INSERT INTO product(product_key,platform,item_id,shop_id,product_name,product_url,first_capture_id)
    VALUES (?,'shopee',?,?,?,?,'a-prior-products')`).run(`shopee:${p.itemId}`, p.itemId, p.shopId, p.name, p.productUrl);
  await saveKalodataCapture(f, 30, 'kalodata.product.detail', { product_id: '79001' },
    { success: true, data: { product_id: '79001', product_name: 'Sản phẩm giả lập 🧪' } });
  await saveS06Capture(f, aReviews(), 31);
  await saveKalodataCapture(f, 32, 'kalodata.video.rank', { product_id: '79001', date_range: '2026-09-01~2026-09-30' },
    S02B_DOCUMENT.records[0].response);
  await saveGoogleCapture(f, 'google.suggest', ['thạch dừa a', ['gợi ý giả lập 🧪']], 33);
  const response = Buffer.from(JSON.stringify({ search_parameters: { q: QUERY }, ai_overview: ANSWER }));
  const searchEnvelope = { contractVersion: 'research-automation-capture-v1', captureId: 'synthetic-a-search',
    provider: 'SERPAPI', operation: 'serpapi.google.search', billing: 'PAID_SEARCH_UNLESS_CACHED', method: 'GET',
    endpoint: 'https://serpapi.com/search', requestParameters: { q: QUERY }, requestBodyBytesBase64: null,
    productRef: null, queryWindow: null, pageNumber: 1, requestedAt: A_AT, completedAt: A_AT,
    outcome: 'OK', httpStatus: 200, responseBytesBase64: response.toString('base64'),
    responseSha256: aHash(response), responseByteLength: response.length, providerCode: null, responseHeaders: {} };
  await retainEnvelope(f, 34, searchEnvelope);
  return { ...f, privacyFile };
}

/** Public CLI only; a deny-by-default fetch preload prevents inherited credentials/network use. */
export async function aCli(f: { root: string; databasePath: string; artifactRoot: string }, args: string[],
  options: { jev?: boolean; privacyFile?: string; responses?: number } = {}) {
  const log = path.join(f.root, `a-fetch-${randomUUID()}.jsonl`), config = `${log}.json`;
  await fs.writeFile(log, '');
  await fs.writeFile(config, JSON.stringify({ log, responses: Array.from({ length: options.responses ?? 16 },
    () => ({ raw: labelsGolden.no_theme_response })) }));
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--import',
    fileURLToPath(new URL('./raw-db-v1-labels-fetch.mjs', import.meta.url)), 'scripts/raw-db-load.ts',
    '--db', f.databasePath, '--artifacts', f.artifactRoot, ...args], {
    cwd: path.resolve('.'), encoding: 'utf8', timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC', RAWDB_Y_FETCH_CONFIG: config,
      TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot,
      TDN_RAW_DB_AUTOLOAD_ENABLED: 'false', TDN_RESEARCH_JEV_ENABLED: options.jev ? 'true' : 'false',
      TYPESAFE_API_KEY: 'synthetic-a-unused-key', TDN_RESEARCH_JEV_MODEL: labelsGolden.model,
      ...(options.privacyFile ? { TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: options.privacyFile } : {}) },
  });
  assert.equal(child.error, undefined, child.error?.message);
  const calls = (await fs.readFile(log, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as LabelCall);
  return { ...child, calls, value: child.stdout.trim() ? JSON.parse(child.stdout.trim()) as Record<string, unknown> : null };
}

export const aLoad = async () => (await import(new URL('../../src/modules/raw-db/tiktok-shop-reviews-loader.js', import.meta.url).href)) as {
  loadTikTokShopReviewsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, input: { runId: string }):
    Promise<{ captures: number; products: number; reviewsInserted: number; reviewsAlreadyPresent: number; runReviewsInserted: number; ratingInvalid: number }>;
};

export function aAttempt(db: Database.Database) {
  const rows = db.prepare('SELECT * FROM raw_db_autoload ORDER BY started_at,finished_at').all() as Record<string, unknown>[];
  assert.ok(rows.length, 'every AUTOLOAD invocation records an attempt');
  return rows.at(-1)!;
}

// COMMON-A pins a JSON result per source, but deliberately does not pin column suffixes or receipt wrappers.
export function aResult(row: Record<string, unknown>, source: string): unknown {
  const key = Object.keys(row).find(name => name.toLowerCase() === source || name.toLowerCase() === `${source}_json`
    || name.toLowerCase() === `${source}_result` || name.toLowerCase() === `${source}_result_json`);
  assert.ok(key, `attempt has a ${source} result JSON`);
  return typeof row[key] === 'string' ? JSON.parse(row[key]) as unknown : row[key];
}

export function aHasCode(value: unknown, code: string): boolean {
  if (value === code) return true;
  return value !== null && typeof value === 'object' && Object.values(value).some(child => aHasCode(child, code));
}

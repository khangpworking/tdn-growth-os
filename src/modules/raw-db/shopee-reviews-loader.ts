import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { ShopeeCollectionService } from '../foundation/shopee-collection-service.js';
import { SourcePackageService } from '../foundation/source-package-service.js';
import { CONTEXT_PATH, MAX_METRIC_CAPTURE_BYTES, MAX_METRIC_CAPTURE_TOTAL_BYTES, captureContextRawRefs } from '../analysis/research-automation/metric-capture-intake.js';

/** Rows inserted by one call. reviewsAlreadyPresent: stored reviews this call newly linked to the run (0 on a same-run reload). */
export interface RawDbLoadResult {
  runId: string; collectionId: string; captures: number; products: number;
  reviewsInserted: number; reviewsAlreadyPresent: number; runReviewsInserted: number;
}

const SOURCE = 'S05';
const OPERATION = 'shopee.public_reviews.listing';

/**
 * Copies the Shopee public reviews (S05) of one research-automation run into the db-v1 tables
 * (raw_capture, product, review, run_review). Reads the run's collection only through the verified
 * public reader; a review already stored is never re-inserted (first version wins). One transaction.
 */
export async function loadShopeeReviewsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, { runId }: { runId: string }): Promise<RawDbLoadResult> {
  const row = db.prepare('SELECT collection_id FROM foundation_shopee_collections WHERE run_key=?').get(`auto-${runId}`) as { collection_id: string } | undefined;
  if (!row) throw new Error(`RAW_DB_RUN_NOT_FOUND: no Shopee review collection for run ${runId}`);
  const source = await new ShopeeCollectionService(db, artifacts).readPublicExact(row.collection_id);
  const { packet } = source;

  const captures: (string | number | null)[][] = [];
  const products = new Map<string, { itemId: string; shopId: string; productUrl: string; captureId: string }>();
  const reviews = new Map<string, (string | number | null)[]>();
  let envelopeIndex = 0;
  packet.listings.forEach((listing, index) => {
    const envelope = listing.resultSha256 ? source.envelopes[envelopeIndex++] : undefined;
    const rows = envelope?.rows ?? [];
    const captureId = `${SOURCE}:${packet.collectionId}:${index}`;
    captures.push([captureId, runId, SOURCE, packet.providerId, OPERATION,
      JSON.stringify({ collectionId: packet.collectionId, itemId: listing.itemId, shopId: listing.shopId, productUrl: listing.productUrl, jobId: listing.jobId,
        maxReviewsPerProduct: packet.maxReviewsPerProduct, selectionBasis: packet.selectionBasis, mode: packet.mode, requestCount: listing.requestCount, usageTotalUsd: packet.usageTotalUsd }),
      listing.attemptedAt || packet.attemptedAt, listing.observedAt, listing.complete ? (rows.length > 0 ? 'OK' : 'EMPTY') : 'FAILED',
      'USD', null, listing.resultSha256, `artifact:${source.sha256}#listing=${index}`]);
    const productKey = `shopee:${listing.itemId}`;
    if (!products.has(productKey)) {
      const selected = packet.selected.find(s => s.itemId === listing.itemId && s.shopId === listing.shopId);
      products.set(productKey, { itemId: listing.itemId, shopId: listing.shopId, productUrl: selected?.productUrl ?? listing.productUrl, captureId });
    }
    for (const review of rows) {
      // A row without a native review id has no db-v1 key; it stays only in the raw artifact.
      if (review.reviewId === null) continue;
      const reviewKey = `${SOURCE}:${review.reviewId}`;
      if (reviews.has(reviewKey)) continue;
      reviews.set(reviewKey, [reviewKey, SOURCE, 'shopee', 'product_review', review.reviewId, `shopee:${review.itemId}`, null, null, null, 'not_provided',
        review.ratingStar, review.comment, review.variation, review.attributes.length ? JSON.stringify(review.attributes) : null, vietnamTime(review.createdAt),
        null, null, null, null, review.ratingState, listing.observedAt, captureId, `page=${review.sourcePage ?? ''},row=${review.sourceRow}`]);
    }
  });

  const stored = db.prepare('SELECT 1 FROM product WHERE product_key=?');
  const missing = [...products].filter(([key]) => !stored.get(key));
  const names = missing.length ? await metricProductNames(db, artifacts, runId) : new Map<string, string>();
  const productRows = missing.map(([key, p]) => {
    const name = names.get(`1__${p.itemId}__${p.shopId}`);
    if (!name) throw new Error(`RAW_DB_PRODUCT_NAME_MISSING: no product name for ${key}`);
    return [key, 'shopee', p.itemId, p.shopId, name, p.productUrl, p.captureId];
  });

  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,request_params_json,requested_at,completed_at,outcome,cost_unit,cost_amount,response_sha256,raw_path)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertProduct = db.prepare(`INSERT INTO product(product_key,platform,item_id,shop_id,product_name,product_url,first_capture_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertReview = db.prepare(`INSERT INTO review(review_key,source_code,platform,kind,external_id,product_key,video_url,reviewer_key,reviewer_name,reviewer_name_state,
    rating_star,text,variation,attributes_json,posted_at,like_count,reply_count,replies_to_external_id,media_count,state,collected_at,capture_id,source_position)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertRunReview = db.prepare('INSERT INTO run_review(run_id,review_key,capture_id,source_position) VALUES (?,?,?,?) ON CONFLICT DO NOTHING');
  return db.transaction((): RawDbLoadResult => {
    const result: RawDbLoadResult = { runId, collectionId: packet.collectionId, captures: 0, products: 0, reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0 };
    for (const values of captures) result.captures += insertCapture.run(...values).changes;
    for (const values of productRows) result.products += insertProduct.run(...values).changes;
    for (const values of reviews.values()) {
      const inserted = insertReview.run(...values).changes;
      // run_review keeps this run's capture and position, even when the review row is from an earlier run.
      const linked = insertRunReview.run(runId, values[0], values[21], values[22]).changes;
      result.reviewsInserted += inserted;
      result.runReviewsInserted += linked;
      // An earlier version this call newly links to the run; a same-run reload links nothing and counts 0.
      if (!inserted && linked) result.reviewsAlreadyPresent++;
    }
    return result;
  })();
}

/** Product names of the run's Metric capture rows, keyed by product_base_id (`1__<itemId>__<shopId>`). */
async function metricProductNames(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const autorun = db.prepare('SELECT package_id FROM research_automation_autorun WHERE run_id=?').get(runId) as { package_id: string | null } | undefined;
  if (!autorun?.package_id) return names;
  const pkg = await new SourcePackageService({ db, artifactStore: artifacts })
    .readVerified(autorun.package_id, { maxFileBytes: MAX_METRIC_CAPTURE_BYTES, maxTotalBytes: MAX_METRIC_CAPTURE_TOTAL_BYTES + 128 * 1024 });
  const context = pkg.files.find(file => file.path === CONTEXT_PATH);
  const refs = context ? captureContextRawRefs(JSON.parse(context.bytes.toString('utf8')) as Record<string, unknown>) : null;
  // The last ref is the capture the run used; earlier captures only fill names it lacks.
  for (const ref of [...refs ?? []].reverse()) {
    const bytes = await artifacts.read(ref.sha256, { maxBytes: MAX_METRIC_CAPTURE_BYTES });
    if (bytes.byteLength !== ref.byteSize) throw new Error('Stored raw-responses artifact differs from its capture reference.');
    const stack: unknown[] = [JSON.parse(bytes.toString('utf8'))];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { for (const item of node) stack.push(item); continue; }
      const record = node as Record<string, unknown>;
      const id = record.product_base_id, name = record.product_name;
      if (typeof id === 'string' && typeof name === 'string' && name.trim() && !names.has(id)) names.set(id, name.trim());
      for (const value of Object.values(record)) stack.push(value);
    }
  }
  return names;
}

/** ISO 8601 in Asia/Ho_Chi_Minh (+07:00, no daylight saving); other offsets and Z are converted. */
function vietnamTime(value: string | null): string | null {
  if (value === null || value.endsWith('+07:00')) return value;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const local = new Date(ms + 7 * 3_600_000).toISOString();
  return `${local.slice(0, 19)}${local.slice(19, 23) === '.000' ? '' : local.slice(19, 23)}+07:00`;
}

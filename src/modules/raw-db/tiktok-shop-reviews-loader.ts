import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { assertRun, runCaptures, verifiedCapture } from './google-search-loader.js';
import { vietnamTime } from './shopee-reviews-loader.js';
import { assertAttributesShape } from './attributes-shape.js';

/**
 * Rows inserted by one call. reviewsAlreadyPresent: stored reviews this call newly linked to the run (0 on a same-run reload).
 * ratingInvalid: reviews of this call's new captures whose `review.rating` is not an integer 1–5 (stored as NULL).
 * reviewIdMissing: rows of this call's new captures without a numeric `review.review_id` (not stored).
 */
export interface TikTokShopReviewsLoadResult {
  runId: string; captures: number; products: number; reviewsInserted: number; reviewsAlreadyPresent: number; runReviewsInserted: number;
  ratingInvalid: number; reviewIdMissing: number; productNameSources: number;
}

type Value = string | number | null;
interface PlannedCapture { captureId: string; values: Value[]; productId: string | null; reviews: Value[][]; ratingInvalid: number; reviewIdMissing: number }
interface NameSource { name: string; artifactSha256: string; jsonPath: string }

const SOURCE = 'S06';
const OPERATION = 'kalodata.product.comment.insight';
const DB_OUTCOMES = new Set(['OK', 'EMPTY', 'PROVIDER_REJECTED', 'BLOCKED', 'LOGIN_REQUIRED', 'FAILED', 'NOT_COLLECTED']);
// Same id rule as the app's comment insight parser (provider-kalodata parseCommentInsight).
const NUMERIC_ID = /^\d{1,32}$/;
const MS_TIMESTAMP = /^\d{1,15}$/;

/**
 * Copies S06 TikTok Shop product reviews (the run's stored `kalodata.product.comment.insight` captures) into db-v1
 * `raw_capture`, `product` (only when missing, with a name the same run stored), `review` (kind product_review) and
 * `run_review`. No reviewer name is stored and no key is derived from a display name (owner L2): reviewer_key and
 * reviewer_name are NULL, so S06 writers are counted per review. A review already stored is never re-inserted (first
 * version wins). Idempotent by capture id; one transaction; any invalid capture fails the whole load.
 */
export async function loadTikTokShopReviewsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, { runId }: { runId: string }): Promise<TikTokShopReviewsLoadResult> {
  const { captures, names } = await planFromRun(db, artifacts, runId);
  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,endpoint,request_params_json,keyword,
    requested_at,completed_at,http_status,outcome,billing,cost_unit,cost_amount,response_sha256,raw_path,response_sha256_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const existingCapture = db.prepare('SELECT source_code,operation,request_params_json,requested_at,outcome,response_sha256 FROM raw_capture WHERE capture_id=?');
  const storedProduct = db.prepare('SELECT 1 FROM product WHERE product_key=?');
  const insertProduct = db.prepare(`INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id) VALUES (?,'tiktok_shop',?,?,?) ON CONFLICT DO NOTHING`);
  const unsourcedProduct = db.prepare(`SELECT p.product_name name FROM product p JOIN raw_capture c ON c.capture_id=p.first_capture_id
    LEFT JOIN product_name_source s ON s.product_key=p.product_key WHERE p.product_key=? AND c.run_id=? AND s.product_key IS NULL`);
  const insertSource = db.prepare(`INSERT INTO product_name_source(product_key,source_kind,artifact_sha256,capture_id,json_path,recorded_at)
    VALUES (?,'APP_CAPTURE',?,NULL,?,?) ON CONFLICT DO NOTHING`);
  const recordedAt = vietnamTime(new Date().toISOString())!;
  const insertReview = db.prepare(`INSERT INTO review(review_key,source_code,platform,kind,external_id,product_key,video_url,reviewer_key,reviewer_name,reviewer_name_state,
    rating_star,text,variation,attributes_json,posted_at,like_count,reply_count,replies_to_external_id,media_count,state,collected_at,capture_id,source_position)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertRunReview = db.prepare('INSERT INTO run_review(run_id,review_key,capture_id,source_position) VALUES (?,?,?,?) ON CONFLICT DO NOTHING');
  return db.transaction((): TikTokShopReviewsLoadResult => {
    const result: TikTokShopReviewsLoadResult = { runId, captures: 0, products: 0, reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0,
      ratingInvalid: 0, reviewIdMissing: 0, productNameSources: 0 };
    const seen = new Set<string>();
    const backfillSource = (c: PlannedCapture): void => {
      if (!c.reviews.length) return;
      const key = `tiktok_shop:${c.productId}`, found = names.get(c.productId!);
      const stored = unsourcedProduct.get(key, runId) as { name: string } | undefined;
      if (!stored || !found) return;
      if (stored.name !== found.name) throw new Error(`RAW_DB_PRODUCT_NAME_MISMATCH: ${key} is stored with another name than this run's record`);
      result.productNameSources += insertSource.run(key, found.artifactSha256, found.jsonPath, recordedAt).changes;
    };
    for (const c of captures) {
      // Idempotent by capture id: a stored capture must be this exact observation, and its rows are already there.
      const existing = existingCapture.get(c.captureId) as Record<string, Value> | undefined;
      if (existing) {
        if (existing.source_code !== SOURCE || existing.operation !== OPERATION || existing.request_params_json !== c.values[6] ||
            existing.requested_at !== c.values[8] || existing.outcome !== c.values[11] || existing.response_sha256 !== c.values[15])
          throw new Error(`RAW_DB_CAPTURE_CONFLICT: ${c.captureId} already identifies a different observation`);
        backfillSource(c);
        continue;
      }
      insertCapture.run(...c.values);
      result.captures++;
      result.ratingInvalid += c.ratingInvalid;
      result.reviewIdMissing += c.reviewIdMissing;
      if (!c.reviews.length) continue;
      const key = `tiktok_shop:${c.productId}`;
      if (!storedProduct.get(key)) {
        // product_name is required and never guessed: only a name the same run stored.
        const name = names.get(c.productId!);
        if (name === undefined) throw new Error(`RAW_DB_PRODUCT_NAME_MISSING: no product name for ${key}`);
        result.products += insertProduct.run(key, c.productId, name.name, c.captureId).changes;
      }
      backfillSource(c);
      for (const values of c.reviews) {
        // One review per run: a review repeated in a later capture of the same run keeps its first position.
        if (seen.has(values[0] as string)) continue;
        seen.add(values[0] as string);
        const inserted = insertReview.run(...values).changes;
        // run_review keeps this run's capture and position, even when the review row is from an earlier run.
        const linked = insertRunReview.run(runId, values[0], values[21], values[22]).changes;
        result.reviewsInserted += inserted;
        result.runReviewsInserted += linked;
        if (!inserted && linked) result.reviewsAlreadyPresent++;
      }
    }
    return result;
  })();
}

/** True when the run stored at least one S06 capture (truncated or not). */
export function runHasTikTokShopReviewCaptures(db: Database.Database, runId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM analysis_research_automation_captures WHERE run_id=? AND provider='kalodata' AND operation=? LIMIT 1`).get(runId, OPERATION));
}

async function planFromRun(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<{ captures: PlannedCapture[]; names: Map<string, NameSource> }> {
  const run = assertRun(db, runId);
  // The shared reader excludes truncated captures. Reject them here rather than silently importing a partial run.
  if (db.prepare(`SELECT 1 FROM analysis_research_automation_captures
    WHERE run_id=? AND provider='kalodata' AND operation=? AND truncated<>0`).get(runId, OPERATION))
    throw new Error(`RAW_DB_ARTIFACT_MISMATCH: truncated ${OPERATION} capture in run ${runId}`);
  const rows = runCaptures(db, runId, 'kalodata', OPERATION);
  if (!rows.length) throw new Error(`RAW_DB_RUN_NOT_FOUND: no ${OPERATION} capture for run ${runId}`);
  const captures: PlannedCapture[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const captureId = `${SOURCE}:${runId}:${row.ordinal}`;
    if (ids.has(captureId)) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: run ${runId} has two ${OPERATION} captures at ordinal ${row.ordinal}`);
    ids.add(captureId);
    // The same verified reader as the other run loaders: manifest size and digest, envelope/row match, inner response digest.
    const { envelope, response } = await verifiedCapture(artifacts, row);
    if (!envelope) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: capture ${row.stepId}:${row.ordinal} is not a capture envelope`);
    const { request, requestText } = envelopeRequest(envelope, captureId);
    const productId = typeof request.product_id === 'string' && NUMERIC_ID.test(request.product_id) ? request.product_id : null;
    if (productId === null) throw new Error(`RAW_DB_S06_INVALID_ROW: ${captureId} asks for a product id that is not digits`);
    let data: Record<string, unknown> | null = null;
    if (response) {
      const payload: unknown = JSON.parse(response.text);
      if (!isRecord(payload) || payload.success !== true || !(payload.data === null || payload.data === undefined || isRecord(payload.data)))
        throw new Error(`RAW_DB_ARTIFACT_MISMATCH: successful capture ${row.stepId}:${row.ordinal} has no comment insight record`);
      data = isRecord(payload.data) ? payload.data : null;
      if (data && data.product_id !== productId) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: capture ${row.stepId}:${row.ordinal} answers another product`);
    }
    const comments = data?.original_comments ?? [];
    if (!Array.isArray(comments)) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: capture ${row.stepId}:${row.ordinal} original_comments is not a list`);
    const completedAt = row.retrievedAt;
    const planned: PlannedCapture = { captureId, productId, reviews: [], ratingInvalid: 0, reviewIdMissing: 0, values: [] };
    comments.forEach((item, index) => {
      if (!isRecord(item)) throw new Error(`RAW_DB_S06_INVALID_ROW: ${captureId} row ${index} is not an object`);
      if (item.product_id !== undefined && item.product_id !== null && item.product_id !== '' && item.product_id !== productId)
        throw new Error(`RAW_DB_S06_INVALID_ROW: ${captureId} row ${index} belongs to another product`);
      const review = isRecord(item.review) ? item.review : {};
      const reviewId = typeof review.review_id === 'string' && NUMERIC_ID.test(review.review_id) ? review.review_id : null;
      if (reviewId === null) { planned.reviewIdMissing++; return; }
      const rating = ratingStar(review.rating);
      if (rating === null) planned.ratingInvalid++;
      assertAttributesShape(SOURCE, null, `${captureId} row ${index}`);
      planned.reviews.push([`${SOURCE}:${reviewId}`, SOURCE, 'tiktok_shop', 'product_review', reviewId, `tiktok_shop:${productId}`, null, null, null,
        anonymous(item.is_anonymous) ? 'masked_by_source' : 'not_provided', rating,
        typeof review.display_text === 'string' ? review.display_text : null,
        typeof item.sku_specification === 'string' && item.sku_specification ? item.sku_specification : null, null,
        postedAt(review.review_timestamp), count(item.digg_count), null, null, null, 'VALID', completedAt, captureId, `product=${productId},index=${index}`]);
    });
    const envelopeOutcome = typeof envelope.outcome === 'string' ? envelope.outcome : null;
    const outcome = envelopeOutcome !== null && DB_OUTCOMES.has(envelopeOutcome) ? envelopeOutcome : 'FAILED';
    const responseSha256 = response?.sha256 ?? (typeof envelope.responseSha256 === 'string' ? envelope.responseSha256 : null);
    planned.values = [captureId, runId, SOURCE, 'kalodata', OPERATION, typeof envelope.endpoint === 'string' ? envelope.endpoint : null, requestText, run.keyword,
      typeof envelope.requestedAt === 'string' ? envelope.requestedAt : row.retrievedAt, completedAt,
      typeof envelope.httpStatus === 'number' ? envelope.httpStatus : null, outcome, typeof envelope.billing === 'string' ? envelope.billing : null,
      'kalodata_points', null, responseSha256, `artifact:${row.artifactSha}`, responseSha256 === null ? null : 'ORIGINAL_BYTES'];
    captures.push(planned);
  }
  // Read names for new products and same-run products whose provenance still needs repair.
  const names = new Map<string, NameSource>();
  const hasName = db.prepare(`SELECT 1 FROM product p JOIN raw_capture c ON c.capture_id=p.first_capture_id
    LEFT JOIN product_name_source s ON s.product_key=p.product_key WHERE p.product_key=? AND (c.run_id<>? OR s.product_key IS NOT NULL)`);
  const missing = captures.some(c => c.reviews.length && !hasName.get(`tiktok_shop:${c.productId}`, runId));
  if (missing) {
    for (const operation of ['kalodata.product.detail', 'kalodata.product.rank']) {
      for (const row of runCaptures(db, runId, 'kalodata', operation)) {
        const response = (await verifiedCapture(artifacts, row)).response;
        if (!response) continue;
        const payload: unknown = JSON.parse(response.text);
        const data = isRecord(payload) && payload.success === true ? payload.data : null;
        for (const [index, item] of (Array.isArray(data) ? data : [data]).entries()) {
          if (isRecord(item) && typeof item.product_id === 'string' && typeof item.product_name === 'string' && item.product_name.trim() && !names.has(item.product_id))
            names.set(item.product_id, { name: item.product_name, artifactSha256: row.artifactSha,
              jsonPath: Array.isArray(data) ? `$.data[${index}]` : '$.data' });
        }
      }
    }
  }
  return { captures, names };
}

/** The exact request of a stored capture: its body bytes when kept (they must match the recorded parameters), else the parameters. */
function envelopeRequest(envelope: Record<string, unknown>, captureId: string): { request: Record<string, unknown>; requestText: string } {
  const params = envelope.requestParameters;
  if (!isRecord(params)) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: ${captureId} has no request parameters`);
  if (typeof envelope.requestBodyBytesBase64 !== 'string') return { request: params, requestText: JSON.stringify(params) };
  const requestText = Buffer.from(envelope.requestBodyBytesBase64, 'base64').toString('utf8');
  let body: unknown;
  try { body = JSON.parse(requestText); } catch { body = undefined; }
  if (!isRecord(body) || canonicalJson(body) !== canonicalJson(params)) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: ${captureId} request body differs from its parameters`);
  return { request: body, requestText };
}

/** `review.rating` as an integer 1–5 (a number or a numeric string); anything else is NULL. */
export function ratingStar(value: unknown): number | null {
  const rating = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

/** `review.review_timestamp` in milliseconds (number or digit string) → ISO in Vietnam time (+07:00); anything else NULL. */
function postedAt(value: unknown): string | null {
  const ms = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value
    : typeof value === 'string' && MS_TIMESTAMP.test(value) ? Number(value) : null;
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? vietnamTime(date.toISOString()) : null;
}

function anonymous(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || (typeof value === 'string' && value.toLowerCase() === 'true');
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

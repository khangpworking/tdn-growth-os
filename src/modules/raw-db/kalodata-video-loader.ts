import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { assertRun, readRawFile, runCaptures, verifiedCapture } from './google-search-loader.js';
import type { TikTokCommentsLoadPrivacy } from './tiktok-comments-loader.js';
import { vietnamTime } from './shopee-reviews-loader.js';

/** Input: the stored `kalodata.video.rank` captures of one app run, or one kem-raw-v1 S02b file labelled with a run id. */
export type KalodataVideosLoadInput = { runId: string } | { file: string; runId: string };

/**
 * Rows inserted by one call. videosAlreadyPresent: distinct videos of this call's new captures that were already stored
 * (0 on a reload of the same input, whose captures are all stored already). productNameSources: product_name_source rows
 * inserted (also for a product of this run stored before that table).
 */
export interface KalodataVideosLoadResult {
  runId: string; captures: number; videos: number; videosAlreadyPresent: number; snapshots: number; productsInserted: number; productNameSources: number;
}

/** What response_sha256 covers (KHUON §2.1): run = the provider's response bytes; file = canonical JSON when declared, else the file's own digest. */
type ShaBasis = 'ORIGINAL_BYTES' | 'CANONICAL_JSON' | 'SUPPLIED_FILE';

type Value = string | number | null;
interface PlannedRow { videoId: string; handle: string; snapshot: Value[] }
interface PlannedCapture {
  captureId: string; values: Value[]; productId: string | null; productName: string | null; rows: PlannedRow[];
}
/** The file record or verified app capture's decoded response actually used for a product name. */
interface NameSource { name: string; sourceKind: 'RAW_CAPTURE' | 'APP_CAPTURE'; captureId: string | null; artifactSha256: string | null; jsonPath: string }

const SOURCE = 'S02b';
const OPERATION = 'kalodata.video.rank';
// Same checks as the app's ranked-video parser (provider-kalodata parseVideoRank).
const VIDEO_ID = /^[1-9][0-9]{0,19}$/;
const HANDLE = /^[A-Za-z0-9._]{1,64}$/;
const PRODUCT_ID = /^\d{1,32}$/;
const DATE_RANGE = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/;
const PUBLISH_DATE = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * Copies S02b Kalodata ranked videos into db-v1 `raw_capture`, `video`, `video_snapshot` and, for a product query whose
 * product is not stored yet, a minimal `product` row. The creator is stored only as the S07 HMAC author key; the title is
 * kept exactly as given. A video or product already stored is never re-inserted (first version wins). One transaction;
 * any invalid row fails the whole load.
 */
export async function loadKalodataVideosToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, input: KalodataVideosLoadInput,
  privacy: TikTokCommentsLoadPrivacy | undefined): Promise<KalodataVideosLoadResult> {
  if (!privacy) throw new Error('RAW_DB_PRIVACY_KEY_MISSING: S02b needs the TikTok comment privacy key file');
  const { captures, names } = 'file' in input ? await planFromFile(input.file, input.runId) : await planFromRun(db, artifacts, input.runId);
  const runId = input.runId;
  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,endpoint,request_params_json,keyword,period_start,period_end,
    requested_at,completed_at,http_status,outcome,billing,cost_unit,cost_amount,response_sha256,raw_path,response_sha256_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const existingCapture = db.prepare('SELECT source_code,operation,request_params_json,requested_at,outcome,response_sha256 FROM raw_capture WHERE capture_id=?');
  const storedProduct = db.prepare('SELECT 1 FROM product WHERE product_key=?');
  const insertProduct = db.prepare(`INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id) VALUES (?,'tiktok_shop',?,?,?) ON CONFLICT DO NOTHING`);
  // A product of this run stored before product_name_source existed gets only its missing provenance row.
  const unsourcedProduct = db.prepare(`SELECT p.product_name name FROM product p JOIN raw_capture c ON c.capture_id=p.first_capture_id
    LEFT JOIN product_name_source s ON s.product_key=p.product_key WHERE p.product_key=? AND c.run_id=? AND s.product_key IS NULL`);
  const insertSource = db.prepare(`INSERT INTO product_name_source(product_key,source_kind,artifact_sha256,capture_id,json_path,recorded_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const recordedAt = vietnamTime(new Date().toISOString())!;
  const storedVideo = db.prepare("SELECT video_url FROM video WHERE video_id=? AND platform='tiktok' ORDER BY rowid LIMIT 1");
  const insertVideo = db.prepare(`INSERT INTO video(video_url,video_id,platform,product_key,brand,author_key,link_basis,capture_id)
    VALUES (?,?,'tiktok',?,NULL,?,?,?)`);
  const insertSnapshot = db.prepare(`INSERT INTO video_snapshot(capture_id,video_url,source_code,window_start,window_end,rank,title,published_at,revenue_vnd,
    revenue_growth_rate,views,likes,shares,comments,is_ad,ad_revenue_share_pct,ad_view_share_pct,ads_roas,is_ai_video,precision)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'provider_estimate') ON CONFLICT DO NOTHING`);
  return db.transaction((): KalodataVideosLoadResult => {
    const result: KalodataVideosLoadResult = { runId, captures: 0, videos: 0, videosAlreadyPresent: 0, snapshots: 0, productsInserted: 0, productNameSources: 0 };
    const seen = new Set<string>();
    // A stored product of this run without a provenance row gets it now, when this capture's record gave the same name.
    const backfillSource = (key: string, found: NameSource): void => {
      const stored = unsourcedProduct.get(key, runId) as { name: string } | undefined;
      if (!stored) return;
      if (stored.name !== found.name) throw new Error(`RAW_DB_PRODUCT_NAME_MISMATCH: ${key} is stored with another name than this run's record`);
      result.productNameSources += insertSource.run(key, found.sourceKind, found.artifactSha256, found.captureId, found.jsonPath, recordedAt).changes;
    };
    for (const c of captures) {
      const key = c.rows.length && c.productId !== null ? `tiktok_shop:${c.productId}` : null;
      // product_name is required: without a name from the same input the video stays UNKNOWN (never guessed).
      const mapped = c.productId === null ? undefined : names.get(c.productId);
      const found: NameSource | null = c.productName !== null ? { name: c.productName, sourceKind: 'RAW_CAPTURE', captureId: c.captureId, artifactSha256: null, jsonPath: '$' }
        : mapped ?? null;
      // Idempotent by capture id: a stored capture must be this exact observation, and its rows are already there.
      const existing = existingCapture.get(c.captureId) as Record<string, Value> | undefined;
      if (existing) {
        if (existing.source_code !== SOURCE || existing.operation !== c.values[4] || existing.request_params_json !== c.values[6] ||
            existing.requested_at !== c.values[10] || existing.outcome !== c.values[13] || existing.response_sha256 !== c.values[17])
          throw new Error(`RAW_DB_CAPTURE_CONFLICT: ${c.captureId} already identifies a different observation`);
        if (key !== null && found !== null) backfillSource(key, found);
        continue;
      }
      insertCapture.run(...c.values);
      result.captures++;
      let productKey: string | null = null;
      if (key !== null) {
        if (!storedProduct.get(key) && found !== null) {
          result.productsInserted += insertProduct.run(key, c.productId, found.name, c.captureId).changes;
          result.productNameSources += insertSource.run(key, found.sourceKind, found.artifactSha256, found.captureId, found.jsonPath, recordedAt).changes;
        } else if (found !== null) backfillSource(key, found);
        if (storedProduct.get(key)) productKey = key;
      }
      for (const row of c.rows) {
        // A video already stored under another URL (for example from S07) keeps that URL; no second video row.
        let url = (storedVideo.get(row.videoId) as { video_url: string } | undefined)?.video_url;
        if (url === undefined) {
          url = `https://www.tiktok.com/@${row.handle}/video/${row.videoId}`;
          insertVideo.run(url, row.videoId, productKey, privacy.writerKey('video-author-handle', row.handle), productKey ? 'PROVIDER_LINK' : 'UNKNOWN', c.captureId);
          result.videos++;
          seen.add(row.videoId);
        } else if (!seen.has(row.videoId)) {
          seen.add(row.videoId);
          result.videosAlreadyPresent++;
        }
        if (!insertSnapshot.run(c.captureId, url, ...row.snapshot).changes) throw new Error(`RAW_DB_DUPLICATE_ROW: ${c.captureId} repeats video ${row.videoId}`);
        result.snapshots++;
      }
    }
    return result;
  })();
}

// ---- file (kem-raw-v1) ----

async function planFromFile(file: string, runId: string): Promise<{ captures: PlannedCapture[]; names: Map<string, NameSource> }> {
  let raw: Awaited<ReturnType<typeof readRawFile>>;
  try { raw = await readRawFile(file, SOURCE); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('RAW_DB_FILE_BAD_RECORD: S02b file is not valid JSON');
    throw error;
  }
  const { declare, records, sha12, relative } = raw;
  // Response digests are checked only when the file says they are over the canonical JSON of `response`.
  if (declare.responseSha256Basis !== undefined && declare.responseSha256Basis !== 'canonical-json')
    throw new Error('RAW_DB_FILE_BAD_RECORD: unsupported responseSha256Basis');
  const canonicalDigest = declare.responseSha256Basis === 'canonical-json';
  const captures: PlannedCapture[] = [];
  records.forEach((record, recordIndex) => {
    if (record.operation !== OPERATION) return; // e.g. kalodata.credit.balance
    const where = `S02b record ${recordIndex}`;
    const { requestBody, httpStatus, requestedAt, completedAt, responseSha256, response } = record;
    if (!isRecord(requestBody) || typeof requestedAt !== 'string' || !isRecord(response) || typeof response.success !== 'boolean')
      throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} lacks requestBody, requestedAt or response {success}`);
    if (record.productId !== undefined && record.productId !== null && record.productId !== requestBody.product_id)
      throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} productId differs from its request`);
    let sha = typeof responseSha256 === 'string' ? responseSha256 : null;
    const basis: ShaBasis = canonicalDigest ? 'CANONICAL_JSON' : 'SUPPLIED_FILE';
    if (canonicalDigest) {
      const actual = sha256(canonicalJson(response));
      if (sha !== null && sha !== actual) throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} response differs from its responseSha256`);
      sha = actual;
    }
    const status = typeof httpStatus === 'number' ? httpStatus : null;
    const failed = !response.success || (status !== null && (status < 200 || status > 299));
    if (!failed && !Array.isArray(response.data)) throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} response.data is not a list`);
    const productName = typeof record.productName === 'string' && record.productName.trim() ? record.productName : null;
    captures.push(plannedCapture(`${SOURCE}:${sha12}:${recordIndex}`, runId, requestBody, JSON.stringify(requestBody),
      typeof record.endpoint === 'string' ? record.endpoint : null, requestedAt, typeof completedAt === 'string' ? completedAt : null, status,
      failed ? null : response.data as unknown[], sha, basis, `file:${relative}#${recordIndex}`, productName));
  });
  if (!captures.length) throw new Error(`RAW_DB_FILE_BAD_RECORD: S02b file has no ${OPERATION} record`);
  return { captures, names: new Map() };
}

// ---- run (stored captures) ----

async function planFromRun(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<{ captures: PlannedCapture[]; names: Map<string, NameSource> }> {
  assertRun(db, runId);
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
    // The same verified reader as the Google run loaders: manifest size and digest, envelope/row match, inner response digest.
    const { envelope, response } = await verifiedCapture(artifacts, row);
    if (!envelope) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: capture ${row.stepId}:${row.ordinal} is not a capture envelope`);
    const { request, requestText } = envelopeRequest(envelope, captureId);
    let data: unknown[] | null = null;
    if (response) {
      const payload: unknown = JSON.parse(response.text);
      if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.data))
        throw new Error(`RAW_DB_ARTIFACT_MISMATCH: successful capture ${row.stepId}:${row.ordinal} has no ranked list`);
      data = payload.data;
    }
    captures.push(plannedCapture(captureId, runId, request, requestText, typeof envelope.endpoint === 'string' ? envelope.endpoint : null,
      typeof envelope.requestedAt === 'string' ? envelope.requestedAt : row.retrievedAt, row.retrievedAt,
      typeof envelope.httpStatus === 'number' ? envelope.httpStatus : null, data,
      response?.sha256 ?? (typeof envelope.responseSha256 === 'string' ? envelope.responseSha256 : null), 'ORIGINAL_BYTES', `artifact:${row.artifactSha}`, null));
  }
  // Read names for new products and same-run products whose provenance still needs repair.
  const names = new Map<string, NameSource>();
  const hasName = db.prepare(`SELECT 1 FROM product p JOIN raw_capture c ON c.capture_id=p.first_capture_id
    LEFT JOIN product_name_source s ON s.product_key=p.product_key WHERE p.product_key=? AND (c.run_id<>? OR s.product_key IS NOT NULL)`);
  const missing = captures.some(c => c.rows.length && c.productId !== null && !hasName.get(`tiktok_shop:${c.productId}`, runId));
  if (missing) {
    for (const operation of ['kalodata.product.rank', 'kalodata.product.detail']) {
      for (const row of runCaptures(db, runId, 'kalodata', operation)) {
        const response = (await verifiedCapture(artifacts, row)).response;
        if (!response) continue;
        const payload: unknown = JSON.parse(response.text);
        const data = isRecord(payload) && payload.success === true ? payload.data : null;
        for (const [index, item] of (Array.isArray(data) ? data : [data]).entries()) {
          if (isRecord(item) && typeof item.product_id === 'string' && typeof item.product_name === 'string' && item.product_name.trim() && !names.has(item.product_id))
            names.set(item.product_id, { name: item.product_name, sourceKind: 'APP_CAPTURE', artifactSha256: row.artifactSha, captureId: null,
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

// ---- shared ----

function plannedCapture(captureId: string, runId: string, request: Record<string, unknown>, requestText: string, endpoint: string | null,
  requestedAt: string, completedAt: string | null, httpStatus: number | null, data: unknown[] | null, sha: string | null, basis: ShaBasis, rawPath: string,
  productName: string | null): PlannedCapture {
  const productId = typeof request.product_id === 'string' && PRODUCT_ID.test(request.product_id) ? request.product_id : null;
  if (request.product_id !== undefined && request.product_id !== null && productId === null)
    throw new Error(`RAW_DB_S02B_INVALID_ROW: ${captureId} asks for a product id that is not digits`);
  const range = typeof request.date_range === 'string' ? DATE_RANGE.exec(request.date_range) : null;
  const window = range && validDate(range[1]!) && validDate(range[2]!) && range[1]! <= range[2]! ? { start: range[1]!, end: range[2]! } : null;
  const outcome = data === null ? 'FAILED' : data.length ? 'OK' : 'EMPTY';
  if (outcome === 'OK' && window === null) throw new Error(`RAW_DB_S02B_INVALID_ROW: ${captureId} has ranked rows but no request date_range`);
  const rows = (data ?? []).map((item, index) => plannedRow(item, index, captureId, window!));
  return {
    captureId, productId, productName, rows,
    values: [captureId, runId, SOURCE, 'kalodata', OPERATION, endpoint, requestText, typeof request.keyword === 'string' ? request.keyword : null,
      window?.start ?? null, window?.end ?? null, requestedAt, completedAt, httpStatus, outcome, 'PAID_CREDITS', 'kalodata_points', null, sha, rawPath,
      sha === null ? null : basis],
  };
}

function plannedRow(item: unknown, index: number, captureId: string, window: { start: string; end: string }): PlannedRow {
  const where = `${captureId} row ${index}`;
  if (!isRecord(item)) throw new Error(`RAW_DB_S02B_INVALID_ROW: ${where} is not an object`);
  const id = item.video_id;
  const videoId = typeof id === 'string' ? id : typeof id === 'number' && Number.isSafeInteger(id) ? String(id) : null;
  const handle = item.belonged_creator_handle;
  if (videoId === null || !VIDEO_ID.test(videoId) || typeof handle !== 'string' || !HANDLE.test(handle))
    throw new Error(`RAW_DB_S02B_INVALID_ROW: ${where} lacks a numeric video_id or a plain creator handle`);
  return { videoId, handle, snapshot: [SOURCE, window.start, window.end, index + 1, typeof item.video_title === 'string' ? item.video_title : null,
    publishedAt(item.publish_date), nonNegative(item.revenue), finite(item.revenue_growth_rate), count(item.views), count(item.digg_count),
    count(item.share_count), count(item.comment_count), flag(item.ad), nonNegative(item.ad_revenue_ratio), nonNegative(item.ad_view_ratio),
    nonNegative(item.ads_roas), flag(item.ai_video)] };
}

/** "YYYY/MM/DD HH:MM:SS" (Vietnam time) → ISO with +07:00; anything else → NULL. */
function publishedAt(value: unknown): string | null {
  const m = typeof value === 'string' ? PUBLISH_DATE.exec(value) : null;
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  if (!validDate(`${y}-${mo}-${d}`) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+07:00`;
}

function validDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegative(value: unknown): number | null {
  const n = finite(value);
  return n !== null && n >= 0 ? n : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function flag(value: unknown): number | null {
  return value === 0 || value === 1 ? value : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

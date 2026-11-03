import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { sanitizeTikTokCommentText, tikTokCommentExclusionReason, type TikTokCommentPrivacy } from '../../platform/collectors/apify-tiktok-comments.js';
import type { TikTokCommentCollectionIntent, TikTokCommentRetainedCapture } from '../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { SourcePackageService } from '../foundation/source-package-service.js';
import { DiscoveryWorkspaceService } from '../flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../flow/discovery-workspace-reader.js';
import { ResearchAutomationService } from '../analysis/research-automation/service.js';
import { p9PackagePrefix } from '../analysis/research-automation/p9-source-intake.js';
import { readRawFile } from './google-search-loader.js';
import { vietnamTime } from './shopee-reviews-loader.js';

/** Input: the stored P9 S07 collection of one app run, or one kem-raw-v1 S07 file labelled with a run id (for example `kem-2910`). */
export type TikTokCommentsLoadInput = { runId: string } | { file: string; runId: string };
/** Only the writer-key closure of the configured privacy key; the salt never leaves it. */
export type TikTokCommentsLoadPrivacy = Pick<TikTokCommentPrivacy, 'profile' | 'writerKey'>;

/** Rows inserted by one call. reviewsAlreadyPresent: stored reviews this call newly linked to the run (0 on a same-run reload). */
export interface TikTokCommentsLoadResult {
  runId: string; captures: number; videos: number; reviewsInserted: number; reviewsAlreadyPresent: number; runReviewsInserted: number;
}

type Value = string | number | null;
interface PlannedVideo { url: string; videoId: string; handle: string; captureId: string; productKey: string | null; linkBasis: 'PROVIDER_LINK' | 'SELECTED_FROM_PRODUCT' | 'UNKNOWN' }
interface Plan { captures: Value[][]; videos: PlannedVideo[]; reviews: Map<string, Value[]> }

const SOURCE = 'S07';
const P9_BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 };
// The kẽm public set replaced handles, comment ids and uids with `anon-<hex>` pseudonyms; the app keeps TikTok's own forms.
const VIDEO_URL = /^https:\/\/www\.tiktok\.com\/@([A-Za-z0-9._]{1,64}|anon-[0-9a-f]{6,64})\/video\/([1-9][0-9]{0,19})$/;
const COMMENT_ID = /^(?:[1-9][0-9]{0,19}|anon-[0-9a-f]{6,64})$/;
const UID = /^[1-9][0-9]{0,19}$/;

/**
 * Copies S07 TikTok video comments into db-v1 `raw_capture`, `video`, `review` (kind video_comment) and `run_review`.
 * Writer identity is only the HMAC of the numeric uid (owner F335 (a)); no username is stored. A review or video
 * already stored is never re-inserted (first version wins). One transaction; any invalid comment fails the whole load.
 */
export async function loadTikTokCommentsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, input: TikTokCommentsLoadInput,
  privacy: TikTokCommentsLoadPrivacy | undefined): Promise<TikTokCommentsLoadResult> {
  if (!privacy) throw new Error('RAW_DB_PRIVACY_KEY_MISSING: S07 needs the TikTok comment privacy key file');
  const plan = 'file' in input ? await planFromFile(input.file, input.runId, privacy) : await planFromRun(db, artifacts, input.runId, privacy);
  const runId = input.runId;
  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,request_params_json,keyword,requested_at,completed_at,http_status,
    outcome,cost_unit,cost_amount,response_sha256,raw_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const captureParams = db.prepare('SELECT request_params_json FROM raw_capture WHERE capture_id=?');
  const storedProduct = db.prepare('SELECT 1 FROM product WHERE product_key=?');
  const insertVideo = db.prepare(`INSERT INTO video(video_url,video_id,platform,product_key,brand,author_key,link_basis,capture_id)
    VALUES (?,?,'tiktok',?,NULL,?,?,?) ON CONFLICT DO NOTHING`);
  const insertReview = db.prepare(`INSERT INTO review(review_key,source_code,platform,kind,external_id,product_key,video_url,reviewer_key,reviewer_name,reviewer_name_state,
    rating_star,text,variation,attributes_json,posted_at,like_count,reply_count,replies_to_external_id,media_count,state,collected_at,capture_id,source_position)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertRunReview = db.prepare('INSERT INTO run_review(run_id,review_key,capture_id,source_position) VALUES (?,?,?,?) ON CONFLICT DO NOTHING');
  return db.transaction((): TikTokCommentsLoadResult => {
    const result: TikTokCommentsLoadResult = { runId, captures: 0, videos: 0, reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0 };
    for (const values of plan.captures) {
      const inserted = insertCapture.run(...values).changes;
      const stored = captureParams.get(values[0]) as { request_params_json: string | null };
      if (stored.request_params_json !== values[5]) throw new Error('RAW_DB_S07_CAPTURE_MISMATCH: capture identity already belongs to another input');
      result.captures += inserted;
    }
    for (const v of plan.videos) {
      // A product link is kept only for a product already stored; otherwise the video stays UNKNOWN.
      const linked = v.productKey !== null && v.linkBasis !== 'UNKNOWN' && storedProduct.get(v.productKey);
      result.videos += insertVideo.run(v.url, v.videoId, linked ? v.productKey : null, privacy.writerKey('video-author-handle', v.handle),
        linked ? v.linkBasis : 'UNKNOWN', v.captureId).changes;
    }
    for (const values of plan.reviews.values()) {
      const inserted = insertReview.run(...values).changes;
      // run_review keeps this run's capture and position, even when the review row is from an earlier load.
      const linked = insertRunReview.run(runId, values[0], values[21], values[22]).changes;
      result.reviewsInserted += inserted;
      result.runReviewsInserted += linked;
      if (!inserted && linked) result.reviewsAlreadyPresent++;
    }
    return result;
  })();
}

// ---- file (kem-raw-v1) ----

async function planFromFile(file: string, runId: string, privacy: TikTokCommentsLoadPrivacy): Promise<Plan> {
  let raw: Awaited<ReturnType<typeof readRawFile>>;
  try { raw = await readRawFile(file, SOURCE); }
  catch (error) {
    // JSON parser errors can include source text, including private identities.
    if (error instanceof SyntaxError) throw new Error('RAW_DB_FILE_BAD_RECORD: S07 file is not valid JSON');
    throw error;
  }
  const { declare, records, sha12, relative } = raw;
  const selections = records.filter(r => r.operation === 'video.selection');
  if (selections.length > 1) throw new Error('RAW_DB_FILE_BAD_RECORD: S07 file has more than one video.selection record');
  const selection = selections[0];
  const selected = selection ? stringList(selection.videos, 'video.selection videos') : null;
  const spent = isRecord(declare.cost) && typeof declare.cost.spent === 'number' ? declare.cost.spent : null;
  const apifyCount = records.filter(r => typeof r.operation === 'string' && r.operation.startsWith('apify.')).length;
  const plan: Plan = { captures: [], videos: [], reviews: new Map() };
  const videoUrls = new Set<string>();
  records.forEach((record, recordIndex) => {
    if (record === selection) return; // the selection is the request of the Apify record, not a capture of its own
    const operation = record.operation;
    if (typeof operation !== 'string' || !operation.startsWith('apify.'))
      throw new Error(`RAW_DB_FILE_BAD_RECORD: S07 record ${recordIndex} has an unknown operation`);
    const { requestedAt, completedAt, httpStatus, responseSha256, items, input } = record;
    if (typeof requestedAt !== 'string' || typeof completedAt !== 'string' || !Array.isArray(items) || !isRecord(input))
      throw new Error(`RAW_DB_FILE_BAD_RECORD: S07 record ${recordIndex} lacks requestedAt, completedAt, input or items`);
    // Requested videos: the file's selection, else the Apify input itself.
    const requested = selected ?? stringList(input.postURLs, `record ${recordIndex} input.postURLs`);
    const allowed = new Map(requested.map(url => [url, parseVideoUrl(url, `record ${recordIndex}`)]));
    const captureId = `${SOURCE}:${sha12}:${recordIndex}`;
    const collectedAt = completedAt;
    plan.captures.push([captureId, runId, SOURCE, 'apify', operation,
      JSON.stringify({ input, selectionOrigin: typeof selection?.origin === 'string' ? selection.origin : null }),
      typeof declare.keyword === 'string' ? declare.keyword : null, requestedAt, completedAt, typeof httpStatus === 'number' ? httpStatus : null,
      items.length ? 'OK' : 'EMPTY', 'USD', apifyCount === 1 ? spent : null, typeof responseSha256 === 'string' ? responseSha256 : null, `file:${relative}#${recordIndex}`]);
    for (const [url, video] of allowed) if (!videoUrls.has(url)) {
      videoUrls.add(url);
      plan.videos.push({ url, videoId: video.videoId, handle: video.handle, captureId, productKey: null, linkBasis: 'UNKNOWN' });
    }
    const perVideo = new Map<string, number>();
    items.forEach((item, itemIndex) => {
      const where = `${captureId} item ${itemIndex}`;
      if (!isRecord(item)) throw new Error(`RAW_DB_S07_INVALID_ROW: ${where} is not an object`);
      const url = item.videoWebUrl;
      const video = typeof url === 'string' ? allowed.get(url) : undefined;
      if (!video || typeof url !== 'string') throw new Error(`RAW_DB_S07_INVALID_ROW: ${where} is not under a requested video`);
      const cid = typeof item.cid === 'string' && COMMENT_ID.test(item.cid) ? item.cid : null;
      if (cid === null) throw new Error(`RAW_DB_S07_INVALID_ROW: ${where} has no valid comment id`);
      const index = perVideo.get(video.videoId) ?? 0;
      perVideo.set(video.videoId, index + 1);
      const text = typeof item.text === 'string' ? item.text : null;
      const parent = item.repliesToId;
      const replyTo = parent !== null && parent !== undefined && String(parent) !== '0' ? String(parent) : null;
      const uid = typeof item.uid === 'string' && UID.test(item.uid) ? item.uid : null;
      const attributes: Record<string, unknown> = { textForm: 'SANITIZED' };
      if (typeof item.uniqueId === 'string' && item.uniqueId === video.handle) attributes.byVideoAuthor = true;
      if (typeof item.likedByAuthor === 'boolean') attributes.likedByAuthor = item.likedByAuthor;
      if (typeof item.pinnedByAuthor === 'boolean') attributes.pinnedByAuthor = item.pinnedByAuthor;
      const exclusion = tikTokCommentExclusionReason(text, replyTo !== null);
      if (exclusion !== null) attributes.exclusionReason = exclusion;
      addReview(plan, cid, url, uid === null ? null : privacy.writerKey('author', uid), text,
        typeof item.createTimeISO === 'string' ? vietnamTime(item.createTimeISO) : null, count(item.diggCount), count(item.replyCommentTotal),
        replyTo, Array.isArray(item.images) ? item.images.length : null, attributes, collectedAt, captureId, video.videoId, index);
    });
  });
  if (!plan.captures.length) throw new Error('RAW_DB_FILE_BAD_RECORD: S07 file has no Apify record');
  return plan;
}

// ---- run (stored P9 comments packages) ----

async function planFromRun(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string, privacy: TikTokCommentsLoadPrivacy): Promise<Plan> {
  const packages = new SourcePackageService({ db, artifactStore: artifacts });
  const run = db.prepare('SELECT workspace_id workspaceId FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { workspaceId: string } | undefined;
  const entries = run ? packages.findAutomationAttachmentPackagesByKeyPrefix(p9PackagePrefix(runId, 'comments')) : [];
  if (!run || !entries.length) throw new Error(`RAW_DB_RUN_NOT_FOUND: no S07 comment collection for run ${runId}`);
  if (entries.length >= 101) throw new Error(`RAW_DB_S07_TOO_MANY_PACKAGES: run ${runId} has more S07 packages than the bounded lookup proves complete`);
  // Package-key ordering can change when this run collects another selection.
  // Keep each published ordinal bound to its original package, then append new ones.
  const prefix = `${SOURCE}:${runId}:`;
  const storedCaptures = db.prepare("SELECT capture_id,request_params_json FROM raw_capture WHERE source_code='S07' AND run_id=? AND substr(capture_id,1,?)=?")
    .all(runId, prefix.length, prefix) as { capture_id: string; request_params_json: string | null }[];
  const captureIds = new Map<string, string>();
  let nextOrdinal = 0;
  for (const stored of storedCaptures) {
    const ordinalText = stored.capture_id.slice(prefix.length), ordinal = Number(ordinalText);
    let params: unknown;
    try { params = JSON.parse(stored.request_params_json ?? 'null'); }
    catch { throw new Error('RAW_DB_S07_CAPTURE_MISMATCH: stored capture metadata is invalid'); }
    if (!/^(0|[1-9][0-9]*)$/.test(ordinalText) || !Number.isSafeInteger(ordinal) || ordinal >= Number.MAX_SAFE_INTEGER ||
      !isRecord(params) || typeof params.packageId !== 'string' || captureIds.has(params.packageId))
      throw new Error('RAW_DB_S07_CAPTURE_MISMATCH: stored capture metadata is invalid');
    captureIds.set(params.packageId, stored.capture_id);
    nextOrdinal = Math.max(nextOrdinal, ordinal + 1);
  }
  // The app's own verified P9 reader replays every package (digests, sizes, intent, receipt, corpus) before any row is used.
  const service = new ResearchAutomationService({ db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })) });
  const plan: Plan = { captures: [], videos: [], reviews: new Map() };
  const videoUrls = new Set<string>();
  for (const entry of entries) {
    const read = await service.readP9Source(run.workspaceId, runId, 'comments', entry.packageId);
    const p = await packages.readVerified(entry.packageId, P9_BUDGET);
    if (p.manifestArtifactSha256 !== read.receipt.package.manifestArtifactSha256 || p.packageContentSha256 !== read.receipt.package.packageContentSha256)
      throw new Error(`RAW_DB_ARTIFACT_MISMATCH: S07 package ${entry.packageId} changed after verification`);
    const member = (name: string) => {
      const file = p.files.find(f => f.path === name);
      if (!file) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: S07 package ${entry.packageId} lacks ${name}`);
      return file;
    };
    const intent = JSON.parse(member('intent.json').bytes.toString('utf8')) as TikTokCommentCollectionIntent;
    const captureFile = member('capture.json');
    const capture = JSON.parse(captureFile.bytes.toString('utf8')) as TikTokCommentRetainedCapture;
    // Stored author hashes are under the collection's key; the video author keys must use that same key.
    if (capture.privacy.keyCommitment !== privacy.profile.keyCommitment)
      throw new Error(`RAW_DB_PRIVACY_KEY_MISMATCH: S07 package ${entry.packageId} was collected under another privacy key`);
    const captureId = captureIds.get(entry.packageId) ?? `${prefix}${nextOrdinal++}`;
    const at = capture.receipt.retrievedAt;
    plan.captures.push([captureId, runId, SOURCE, 'apify', capture.actor,
      JSON.stringify({ packageId: entry.packageId, requestKey: intent.requestKey, inputSha256: capture.inputSha256, maxCommentsPerVideo: intent.maxCommentsPerVideo,
        providerRunId: capture.receipt.runId, providerTotalRows: capture.receipt.providerTotalRows }),
      null, at, at, null, capture.pages.some(page => page.rows.length) ? 'OK' : 'EMPTY', 'USD', capture.receipt.usageTotalUsd,
      captureFile.sha256, `artifact:${captureFile.sha256}`]);
    const selected = new Map(intent.selection.videos.map(v => [v.url, parseVideoUrl(v.url, captureId)]));
    // The stored selection records no product for a video, so every app video is UNKNOWN (never guessed).
    for (const [url, video] of selected) if (!videoUrls.has(url)) {
      videoUrls.add(url);
      plan.videos.push({ url, videoId: video.videoId, handle: video.handle, captureId, productKey: null, linkBasis: 'UNKNOWN' });
    }
    const perVideo = new Map<string, number>();
    for (const [pageIndex, page] of capture.pages.entries()) {
      const bytes = member(`pages/${pageIndex}.json`).bytes;
      if (sha256(bytes) !== page.sha256 || !bytes.equals(Buffer.from(canonicalJson(page.rows))))
        throw new Error(`RAW_DB_ARTIFACT_MISMATCH: S07 package ${entry.packageId} page ${pageIndex} differs from its capture`);
      for (const row of page.rows) {
        const video = selected.get(row.videoUrl);
        if (!video || video.videoId !== row.videoId || !COMMENT_ID.test(row.commentId))
          throw new Error(`RAW_DB_S07_INVALID_ROW: ${captureId} page ${pageIndex} row ${row.rowIndex}`);
        const index = perVideo.get(row.videoId) ?? 0;
        perVideo.set(row.videoId, index + 1);
        const attributes: Record<string, unknown> = { textForm: 'SANITIZED' };
        if (row.voice === 'SELLER_OR_CREATOR') attributes.byVideoAuthor = true;
        if (row.exclusionReason !== null) attributes.exclusionReason = row.exclusionReason;
        addReview(plan, row.commentId, row.videoUrl, row.authorIdentity.state === 'HASHED' ? row.authorIdentity.hash : null, row.text,
          vietnamTime(row.createdAt), row.likeCount, null, null, null, attributes, at, captureId, row.videoId, index);
      }
    }
  }
  return plan;
}

// ---- shared ----

function addReview(plan: Plan, cid: string, videoUrl: string, reviewerKey: string | null, text: string | null, postedAt: string | null, likes: number | null,
  replies: number | null, replyTo: string | null, media: number | null, attributes: Record<string, unknown>, collectedAt: string, captureId: string,
  videoId: string, index: number): void {
  const reviewKey = `${SOURCE}:${cid}`;
  if (plan.reviews.has(reviewKey)) return; // the first occurrence in the input wins
  plan.reviews.set(reviewKey, [reviewKey, SOURCE, 'tiktok', 'video_comment', cid, null, videoUrl, reviewerKey, null, 'not_provided',
    null, text === null ? null : sanitizeTikTokCommentText(text), null, JSON.stringify(attributes), postedAt, likes, replies, replyTo, media,
    'VALID', collectedAt, captureId, `video=${videoId},index=${index}`]);
}

function parseVideoUrl(url: string, where: string): { videoId: string; handle: string } {
  const match = VIDEO_URL.exec(url);
  if (!match) throw new Error(`RAW_DB_S07_INVALID_ROW: ${where} has a video URL that is not https://www.tiktok.com/@<handle>/video/<id>`);
  return { handle: match[1]!, videoId: match[2]! };
}

function stringList(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || !value.length || !value.every(item => typeof item === 'string')) throw new Error(`RAW_DB_FILE_BAD_RECORD: S07 ${what} is not a list of URLs`);
  return value as string[];
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

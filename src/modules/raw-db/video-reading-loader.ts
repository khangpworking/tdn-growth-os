import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { DiscoveryWorkspaceService } from '../flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../flow/discovery-workspace-reader.js';
import { ResearchAutomationService } from '../analysis/research-automation/service.js';
import { assertRun, readRawFile, runCaptures, verifiedCapture } from './google-search-loader.js';
import type { TikTokCommentsLoadPrivacy } from './tiktok-comments-loader.js';

/** Input: the stored video readings and `videowatch.generate` captures of one app run, or one kem-raw-v1 S14 file labelled with a run id. */
export type VideoReadingsLoadInput = { runId: string } | { file: string; runId: string };

/**
 * Rows inserted by one call. readingsAlreadyPresent: readings of this call's new captures that were not inserted because the same Gemini
 * answer (response sha256) for the same video is already stored as a reading for this run, for example the same run loaded once from its kẽm file and once from the app
 * (0 on a reload of the same input, whose captures are all stored already).
 */
export interface VideoReadingsLoadResult {
  runId: string; captures: number; readings: number; readingsAlreadyPresent: number; videosInserted: number; segments: number;
}

type Value = string | number | null;
type Origin = 'SELECTION' | 'TOP_SELLING' | 'EXPANDED_SEARCH';
interface Text { start: number | null; end: number | null; text: string }
interface PlannedReading {
  videoUrl: string; videoId: string; handle: string; origin: Origin; durationS: number | null; captionSource: 'NATIVE_SUBTITLE' | 'MODEL_TRANSCRIBED';
  modelId: string; responseSha256: string; mediaSha256: string | null; mediaBytes: number | null; readAt: string; speech: Text[]; onScreen: Text[];
}
interface PlannedCapture { captureId: string; values: Value[]; reading: PlannedReading | null }

const SOURCE = 'S14';
const PROVIDER = 'gemini';
const OPERATION = 'videowatch.generate';
const ORIGINS: readonly string[] = ['SELECTION', 'TOP_SELLING', 'EXPANDED_SEARCH'];
// The kẽm public sets may replace handles with `anon-<hex>` pseudonyms; the app keeps TikTok's own forms.
const VIDEO_URL = /^https:\/\/www\.tiktok\.com\/@([A-Za-z0-9._]{1,64}|anon-[0-9a-f]{6,64})\/video\/([1-9][0-9]{0,19})$/;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Copies S14 video readings into db-v1 `raw_capture` (one per Gemini videowatch.generate call), `video_reading`, `video_segment` and, for a
 * video not stored yet, a `video` row (creator only as the S07 HMAC author key, product never guessed). Text is kept exactly as read; no AI
 * judgement (voice, video kind, about-product) is stored, and every reading is stored whatever the app judged. One transaction; any invalid
 * row fails the whole load.
 */
export async function loadVideoReadingsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, input: VideoReadingsLoadInput,
  privacy: TikTokCommentsLoadPrivacy | undefined): Promise<VideoReadingsLoadResult> {
  if (!privacy) throw new Error('RAW_DB_PRIVACY_KEY_MISSING: S14 needs the TikTok comment privacy key file');
  const fromRun = !('file' in input);
  const captures = 'file' in input ? await planFromFile(input.file, input.runId) : await planFromRun(db, artifacts, input.runId);
  const runId = input.runId;
  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,endpoint,request_params_json,keyword,period_start,period_end,
    requested_at,completed_at,http_status,outcome,billing,cost_unit,cost_amount,response_sha256,raw_path,response_sha256_basis) VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?,?,NULL,NULL,?,?,?)`);
  const existingCapture = db.prepare('SELECT source_code,operation,request_params_json,requested_at,outcome,response_sha256 FROM raw_capture WHERE capture_id=?');
  const storedAnswer = db.prepare(`SELECT 1 FROM video_reading r JOIN raw_capture c ON c.capture_id=r.capture_id
    JOIN video v ON v.video_url=r.video_url
    WHERE c.source_code='S14' AND c.run_id=? AND c.response_sha256=? AND v.video_id=? LIMIT 1`);
  const storedVideo = db.prepare("SELECT video_url FROM video WHERE video_id=? AND platform='tiktok' ORDER BY rowid LIMIT 1");
  const insertVideo = db.prepare(`INSERT INTO video(video_url,video_id,platform,product_key,brand,author_key,link_basis,capture_id)
    VALUES (?,?,'tiktok',NULL,NULL,?,'UNKNOWN',?)`);
  const insertReading = db.prepare(`INSERT INTO video_reading(capture_id,video_url,origin,duration_s,caption_source,model_id,media_sha256,media_bytes,read_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertSegment = db.prepare('INSERT INTO video_segment(capture_id,segment_type,seq,start_s,end_s,text) VALUES (?,?,?,?,?,?)');
  return db.transaction((): VideoReadingsLoadResult => {
    const result: VideoReadingsLoadResult = { runId, captures: 0, readings: 0, readingsAlreadyPresent: 0, videosInserted: 0, segments: 0 };
    for (const c of captures) {
      // Idempotent by capture id: a stored capture must be this exact observation, and its rows are already there.
      const existing = existingCapture.get(c.captureId) as Record<string, Value> | undefined;
      if (existing) {
        if (existing.source_code !== SOURCE || existing.operation !== OPERATION || existing.request_params_json !== c.values[6] ||
            existing.requested_at !== c.values[7] || existing.outcome !== c.values[10] || existing.response_sha256 !== c.values[12])
          throw new Error(`RAW_DB_CAPTURE_CONFLICT: ${c.captureId} already identifies a different observation`);
        continue;
      }
      // An answer imported through another input of this run is already stored; another run is a new observation even with identical bytes.
      const known = c.reading !== null && storedAnswer.get(runId, c.reading.responseSha256, c.reading.videoId) !== undefined;
      insertCapture.run(...c.values);
      result.captures++;
      const r = c.reading;
      if (r === null) continue;
      if (known) { result.readingsAlreadyPresent++; continue; }
      // A video already stored under another URL (for example from S02b or S07) keeps that URL and its product link; no second video row.
      let url = (storedVideo.get(r.videoId) as { video_url: string } | undefined)?.video_url;
      if (url === undefined) {
        // From an app run, a top-selling video's product link comes only from its S02b row; rows are immutable, so S02b must be loaded first.
        if (fromRun && r.origin === 'TOP_SELLING')
          throw new Error(`RAW_DB_S14_LOAD_S02B_FIRST: top-selling video ${r.videoId} of run ${runId} has no video row; load S02b for this run first`);
        url = r.videoUrl;
        insertVideo.run(url, r.videoId, privacy.writerKey('video-author-handle', r.handle), c.captureId);
        result.videosInserted++;
      }
      insertReading.run(c.captureId, url, r.origin, r.durationS, r.captionSource, r.modelId, r.mediaSha256, r.mediaBytes, r.readAt);
      result.readings++;
      for (const [type, list] of [['speech', r.speech], ['on_screen', r.onScreen]] as const) {
        list.forEach((t, seq) => { insertSegment.run(c.captureId, type, seq, t.start, t.end, t.text); });
        result.segments += list.length;
      }
    }
    return result;
  })();
}

// ---- file (kem-raw-v1) ----

async function planFromFile(file: string, runId: string): Promise<PlannedCapture[]> {
  let raw: Awaited<ReturnType<typeof readRawFile>>;
  try { raw = await readRawFile(file, SOURCE); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('RAW_DB_FILE_BAD_RECORD: S14 file is not valid JSON');
    throw error;
  }
  const { records, sha12, relative } = raw;
  const captures: PlannedCapture[] = [];
  const readings: PlannedReading[] = [];
  records.forEach((record, recordIndex) => {
    const where = `S14 record ${recordIndex}`;
    if (record.kind === 'modelCall') {
      if (record.operation !== OPERATION) throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} is not a ${OPERATION} call`);
      const { requestParameters, requestedAt, completedAt, httpStatus, outcome, billing, responseSha256, endpoint } = record;
      if (!isRecord(requestParameters) || typeof requestedAt !== 'string' || typeof outcome !== 'string')
        throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} lacks requestParameters, requestedAt or outcome`);
      captures.push(plannedCapture(`${SOURCE}:${sha12}:${recordIndex}`, runId, typeof endpoint === 'string' ? endpoint : null, requestParameters, requestedAt,
        typeof completedAt === 'string' ? completedAt : null, typeof httpStatus === 'number' ? httpStatus : null, outcome,
        typeof billing === 'string' ? billing : null, typeof responseSha256 === 'string' ? responseSha256 : null, 'SUPPLIED_FILE', `file:${relative}#${recordIndex}`));
      return;
    }
    // A video-reading package: its one reading.json member, whose stored digest must be the canonical JSON of the content.
    if (!Array.isArray(record.files)) throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} is neither a model call nor a reading package`);
    for (const member of record.files) {
      if (!isRecord(member) || member.logicalPath !== 'reading.json' || !isRecord(member.content))
        throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} has a member that is not reading.json`);
      if (typeof member.artifactSha256 === 'string' && member.artifactSha256 !== sha256(canonicalJson(member.content)))
        throw new Error(`RAW_DB_FILE_BAD_RECORD: ${where} reading differs from its artifactSha256`);
      readings.push(plannedReading(member.content, where));
    }
  });
  if (!readings.length) throw new Error('RAW_DB_FILE_BAD_RECORD: S14 file has no video reading');
  return pair(captures, readings);
}

// ---- run (stored readings and captures) ----

async function planFromRun(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<PlannedCapture[]> {
  assertRun(db, runId);
  // The app's own verified reader: package digests and sizes, contract, run/scope/candidate binding; every stored reading, about the product or not.
  const service = new ResearchAutomationService({ db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })) });
  let stored: Awaited<ReturnType<ResearchAutomationService['readStoredVideoWatchReadings']>>;
  try { stored = await service.readStoredVideoWatchReadings(runId); }
  catch (error) { throw new Error(`RAW_DB_ARTIFACT_MISMATCH: stored video readings of run ${runId} do not verify (${error instanceof Error ? error.message : 'unreadable'})`); }
  if (!stored.length) throw new Error(`RAW_DB_RUN_NOT_FOUND: no S14 video reading for run ${runId}`);
  const readings = stored.map(({ packageId, reading }) => plannedReading(reading, `S14 package ${packageId}`));
  // The shared reader excludes truncated captures. Reject them here rather than silently importing a partial run.
  if (db.prepare(`SELECT 1 FROM analysis_research_automation_captures
    WHERE run_id=? AND provider='video-watch' AND operation=? AND truncated<>0`).get(runId, OPERATION))
    throw new Error(`RAW_DB_ARTIFACT_MISMATCH: truncated ${OPERATION} capture in run ${runId}`);
  const captures: PlannedCapture[] = [];
  const ids = new Set<string>();
  for (const row of runCaptures(db, runId, 'video-watch', OPERATION)) {
    const captureId = `${SOURCE}:${runId}:${row.ordinal}`;
    if (ids.has(captureId)) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: run ${runId} has two ${OPERATION} captures at ordinal ${row.ordinal}`);
    ids.add(captureId);
    // The same verified reader as the other run loaders: manifest size and digest, envelope/row match, response digest.
    const { envelope, response } = await verifiedCapture(artifacts, row);
    if (!envelope || !isRecord(envelope.requestParameters) || typeof envelope.outcome !== 'string')
      throw new Error(`RAW_DB_ARTIFACT_MISMATCH: capture ${row.stepId}:${row.ordinal} is not a capture envelope with request parameters`);
    captures.push(plannedCapture(captureId, runId, typeof envelope.endpoint === 'string' ? envelope.endpoint : null, envelope.requestParameters,
      typeof envelope.requestedAt === 'string' ? envelope.requestedAt : row.retrievedAt, row.retrievedAt,
      typeof envelope.httpStatus === 'number' ? envelope.httpStatus : null, envelope.outcome, typeof envelope.billing === 'string' ? envelope.billing : null,
      response?.sha256 ?? (typeof envelope.responseSha256 === 'string' ? envelope.responseSha256 : null), 'ORIGINAL_BYTES', `artifact:${row.artifactSha}`));
  }
  return pair(captures, readings);
}

// ---- shared ----

/** Each reading belongs to the successful Gemini call whose response sha256 is the reading's `model.responseSha256`. */
function pair(captures: PlannedCapture[], readings: PlannedReading[]): PlannedCapture[] {
  for (const reading of readings) {
    const call = captures.find(c => c.reading === null && c.values[10] === 'OK' && c.values[12] === reading.responseSha256);
    if (!call) throw new Error(`RAW_DB_S14_INVALID_ROW: the reading of video ${reading.videoId} has no ${OPERATION} call with its response sha256`);
    call.reading = reading;
  }
  return captures;
}

function plannedCapture(captureId: string, runId: string, endpoint: string | null, requestParameters: Record<string, unknown>, requestedAt: string,
  completedAt: string | null, httpStatus: number | null, outcome: string, billing: string | null, sha: string | null,
  basis: 'ORIGINAL_BYTES' | 'SUPPLIED_FILE', rawPath: string): PlannedCapture {
  // What response_sha256 covers (KHUON §2.1): run = the Gemini response bytes; file = the file's own digest.
  return { captureId, reading: null, values: [captureId, runId, SOURCE, PROVIDER, OPERATION, endpoint, JSON.stringify(requestParameters), requestedAt, completedAt,
    httpStatus, outcome === 'OK' ? 'OK' : 'FAILED', billing, sha, rawPath, sha === null ? null : basis] };
}

function plannedReading(value: unknown, where: string): PlannedReading {
  const fail = (what: string): never => { throw new Error(`RAW_DB_S14_INVALID_ROW: ${where} ${what}`); };
  if (!isRecord(value)) return fail('is not an object');
  const { video, media, model, captionSource } = value;
  if (!isRecord(video) || !isRecord(media) || !isRecord(model)) return fail('lacks video, media or model');
  const match = typeof video.videoUrl === 'string' ? VIDEO_URL.exec(video.videoUrl) : null;
  if (!match || match[2] !== video.videoId) fail('has a video URL that is not https://www.tiktok.com/@<handle>/video/<its videoId>');
  if (typeof video.origin !== 'string' || !ORIGINS.includes(video.origin)) fail('has an unknown video origin');
  if (captionSource !== 'NATIVE_SUBTITLE' && captionSource !== 'MODEL_TRANSCRIBED') fail('has an unknown caption source');
  if (typeof model.modelId !== 'string' || !model.modelId || typeof model.responseSha256 !== 'string' || !HEX64.test(model.responseSha256))
    fail('lacks model.modelId or a model.responseSha256');
  if (typeof media.downloadedAt !== 'string' || !media.downloadedAt) fail('lacks media.downloadedAt');
  return {
    videoUrl: match![0], videoId: match![2]!, handle: match![1]!, origin: video.origin as Origin, durationS: nonNegative(video.durationSeconds),
    captionSource: captionSource as PlannedReading['captionSource'], modelId: model.modelId as string, responseSha256: model.responseSha256 as string,
    mediaSha256: typeof media.sha256 === 'string' ? media.sha256 : null, mediaBytes: count(media.byteSize), readAt: media.downloadedAt as string,
    speech: texts(value.segments, `${where} segments`), onScreen: texts(value.onScreenText, `${where} onScreenText`),
  };
}

/** One list of timed text lines, text exactly as stored. */
function texts(value: unknown, where: string): Text[] {
  if (!Array.isArray(value)) throw new Error(`RAW_DB_S14_INVALID_ROW: ${where} is not a list`);
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.text !== 'string') throw new Error(`RAW_DB_S14_INVALID_ROW: ${where} item ${index} has no text`);
    return { start: nonNegative(item.startSeconds), end: nonNegative(item.endSeconds), text: item.text };
  });
}

function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

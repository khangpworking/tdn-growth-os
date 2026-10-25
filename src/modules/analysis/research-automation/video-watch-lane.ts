// Video-watch lane for the automated Market flow (S14, automated). Off unless the flag is exactly "1".
//
// After the extra searches, the collection step takes at most 10 public TikTok videos (the run's stored selection first, then the
// top-selling videos, then the stored TikTok search rows in position order), first reads each video's own Vietnamese subtitle file:
// when it is valid the segments are copied verbatim and the model is asked ONE text-only question (about the product? what kind of
// video?). Otherwise it downloads the short video into the media folder and asks the model ONE time what was said. The strictly
// validated result is stored as an unverified seller-voice reading.
// A skipped video never fails the run; media bytes never enter Foundation; replay and revisions read only what is stored.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readingSchema from '../../../../contracts/analysis/video-reading-v3.schema.json' with { type: 'json' };
import type { AutomatedVideoReading, VideoWatchModelAnswer, VideoWatchSubtitleAnswer } from '../../../../contracts/analysis/video-reading-v3.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import type { StepExpandedQuery, StepVideoWatch, StepVideoWatchCandidate, StepVideoWatchMedia, StepVideoWatchPath, StepVideoWatchReason, StepVideoWatchVideo } from './model.js';
import type { ProviderRawCapture } from './providers.js';
import { exactTikTokVideoUrl } from './tiktok-video-selection.js';
import { voiceLabelFor } from './video-reading-intake.js';
import { cliproxyConfigurationFromEnvironment, type CliproxyConfiguration } from '../../../platform/ai/cliproxy-configuration.js';
import type { ProviderTransport } from './provider-common.js';
import { createVideoWatchModel, VIDEO_WATCH_MODEL_ID, VIDEO_WATCH_PROVIDER, type VideoWatchModel, type VideoWatchModelResult } from './video-watch-gemini.js';
import { defaultProcessRunner, downloadSubtitles, downloadVideo, sweepVideoMedia, VIDEO_WATCH_MAX_SECONDS, type ProcessRunner, type VideoMediaConfig } from './video-watch-media.js';
import { subtitleCaptionText, type SubtitleSegment } from './video-watch-subtitles.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv); ajv.addSchema(readingSchema);
const validateAnswer = ajv.compile<VideoWatchModelAnswer>({ $ref: `${readingSchema.$id}#/$defs/modelAnswer` });
const validateSubtitleAnswer = ajv.compile<VideoWatchSubtitleAnswer>({ $ref: `${readingSchema.$id}#/$defs/subtitleAnswer` });
const validateReading = ajv.compile<AutomatedVideoReading>({ $ref: `${readingSchema.$id}#/$defs/reading` });

export const VIDEO_WATCH_FLAG = 'TDN_RESEARCH_VIDEO_WATCH_ENABLED';
export const VIDEO_WATCH_PROFILE = 'video-watch-v1' as const;
export const VIDEO_WATCH_MAX_VIDEOS = 10;
/** With the automated top-selling lookup on, at most five TOP_SELLING candidates (owner rule, 22/10). */
export const VIDEO_WATCH_MAX_TOP_SELLING = 5;
/** Usage ordinal inside the collection step (0 Kalodata, 1 exact Shopee, 2 web, 3 trends, 4-6 extra searches, 7 World Bank). */
export const VIDEO_WATCH_USAGE_ORDINAL = 8;
export const VIDEO_WATCH_READING_PATH = 'reading.json';
export const VIDEO_WATCH_EVIDENCE_FAMILY = 'video-watch-reading-v3';
export const VIDEO_WATCH_READ_BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } as const;
const PROVENANCE_BASIS = 'Automated model transcription of one public video of the run; unverified seller voice, not customer opinion and not a fact.';
const SUBTITLE_PROVENANCE_BASIS = 'Verbatim copy of the Vietnamese subtitle file of one public video of the run; unverified seller voice, not customer opinion and not a fact.';
const SOURCE_LABEL = 'Lời nói trong video bán hàng và video đánh giá sản phẩm (ghi lại tự động)';
const SUBTITLE_SOURCE_LABEL = 'Lời nói trong video bán hàng và video đánh giá sản phẩm (lấy từ phụ đề có sẵn)';
export const VIDEO_WATCH_LIMITATIONS: readonly string[] = [
  'Ghi lại tự động từ video, chưa có người kiểm tra.',
  'Đây là lời người bán hoặc người làm video đánh giá, không phải ý kiến khách hàng và không phải sự thật đã kiểm chứng.',
  'Chữ trên màn hình chỉ được lưu lại, không đưa vào báo cáo.',
];
/** A subtitle reading has no on-screen text and its words come from the video's own subtitles, not from the model. */
export const VIDEO_WATCH_SUBTITLE_LIMITATIONS: readonly string[] = [
  'Lấy từ phụ đề có sẵn của video, chưa có người kiểm tra.',
  VIDEO_WATCH_LIMITATIONS[1]!,
];

export const videoWatchPackagePrefix = (runId: string): string => `automation-video-watch:${runId}-`;
const sha = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const HEX64 = /^[a-f0-9]{64}$/;

type Env = Readonly<Record<string, string | undefined>>;
export function videoWatchEnabled(env: Env): boolean { return env[VIDEO_WATCH_FLAG] === '1'; }

export interface VideoWatchConfig extends VideoMediaConfig {
  readonly modelId: string;
  /** The app's existing CLIProxy settings; null when they are missing or unusable (the lane then skips every video as VIDEO_MODEL_NOT_CONFIGURED). */
  readonly cliproxy: CliproxyConfiguration | null;
}
/** Reads the lane's settings. Errors name the setting only, never its value; CLIProxy problems never throw. */
export function videoWatchConfigFromEnv(env: Env): VideoWatchConfig {
  const need = (name: string): string => {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required when ${VIDEO_WATCH_FLAG}=1.`);
    return value.trim();
  };
  const mediaDir = need('TDN_RESEARCH_VIDEO_MEDIA_DIR');
  if (!path.isAbsolute(mediaDir)) throw new TypeError('TDN_RESEARCH_VIDEO_MEDIA_DIR must be an absolute path.');
  const modelId = need('TDN_RESEARCH_VIDEO_WATCH_MODEL');
  if (!VIDEO_WATCH_MODEL_ID.test(modelId)) throw new TypeError('TDN_RESEARCH_VIDEO_WATCH_MODEL must be a plain gemini-* model id.');
  const ytdlpBin = need('TDN_RESEARCH_YTDLP_BIN');
  const ffprobeBin = env.TDN_RESEARCH_FFPROBE_BIN?.trim() || 'ffprobe';
  let cliproxy: CliproxyConfiguration | null;
  try { cliproxy = cliproxyConfigurationFromEnvironment(env as NodeJS.ProcessEnv) ?? null; } catch { cliproxy = null; }
  return { mediaDir: path.resolve(mediaDir), modelId, ytdlpBin, ffprobeBin, cliproxy };
}

/** The lane for the app: the model client exists only when CLIProxy is configured. */
export function videoWatchLaneFromConfig(config: VideoWatchConfig, now: () => Date, transport?: ProviderTransport): VideoWatchLane {
  const model = config.cliproxy ? createVideoWatchModel({ cliproxy: config.cliproxy, modelId: config.modelId, ...(transport ? { transport } : {}) }) : null;
  return new VideoWatchLane({ media: { mediaDir: config.mediaDir, ytdlpBin: config.ytdlpBin, ffprobeBin: config.ffprobeBin }, model, now });
}

export interface VideoWatchPlan {
  readonly candidates: readonly StepVideoWatchCandidate[];
  readonly skipped: readonly { readonly videoId: string; readonly reason: 'OVER_10_VIDEOS' }[];
  readonly candidatesSha256: string;
}
const exact = (url: unknown): { videoId: string; url: string } | null => {
  if (typeof url !== 'string') return null;
  try { const { videoId, url: exactUrl } = exactTikTokVideoUrl(url); return { videoId, url: exactUrl }; } catch { return null; }
};
/** The TikTok account of an exact video URL, compared after NFC + lower-case. Used for ordering only, never shown. */
const accountOf = (url: string): string => (/^https:\/\/www\.tiktok\.com\/@([^/]+)\/video\//u.exec(url)?.[1] ?? url).normalize('NFC').toLowerCase();
/** Pure: round-robin by account (pass 1 = each account's first video in list order, pass 2 = each account's second, ...); order inside an account kept. */
export function spreadAcrossAccounts<T extends { readonly url: string }>(list: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of list) { const key = accountOf(item.url); const group = groups.get(key); if (group) group.push(item); else groups.set(key, [item]); }
  const out: T[] = [];
  for (let pass = 0; out.length < list.length; pass++) for (const group of groups.values()) if (group[pass]) out.push(group[pass]!);
  return out;
}
/** Pure: selection videos first (stored order), then the run's own top-selling videos (best seller first), then exact TikTok video rows of the stored
 * TIKTOK searches in position order; dedupe by video id (first origin wins); spread search rows across accounts; cap 10. The final order is pinned in the step document and never recomputed on replay.
 * `automatedTopSelling` (the automated lookup, on only with its flag) follows the uploaded top-selling videos, and then at most five TOP_SELLING videos are taken in all. */
export function videoWatchCandidates(selectionVideos: readonly { readonly url: string }[], queries: readonly StepExpandedQuery[] | undefined,
  topSellingVideos: readonly { readonly url: string }[] = [], automatedTopSelling?: readonly { readonly url: string }[]): VideoWatchPlan {
  const all: StepVideoWatchCandidate[] = [], seen = new Set<string>();
  const add = (url: unknown, origin: StepVideoWatchCandidate['origin']): void => {
    const video = exact(url);
    if (!video || seen.has(video.videoId)) return;
    seen.add(video.videoId); all.push({ videoId: video.videoId, url: video.url, origin });
  };
  for (const video of selectionVideos) add(video.url, 'SELECTION');
  if (automatedTopSelling === undefined) for (const video of topSellingVideos) add(video.url, 'TOP_SELLING');
  else for (const video of [...topSellingVideos, ...automatedTopSelling]) {
    if (all.filter(item => item.origin === 'TOP_SELLING').length >= VIDEO_WATCH_MAX_TOP_SELLING) break;
    add(video.url, 'TOP_SELLING');
  }
  const rows = (queries ?? []).filter(query => query.kind === 'TIKTOK' && query.status === 'COLLECTED').flatMap(query => query.results)
    .map((row, index) => ({ row, index })).sort((a, b) => a.row.position - b.row.position || a.index - b.index);
  for (const row of spreadAcrossAccounts(rows.map(item => item.row))) add(row.url, 'EXPANDED_SEARCH');
  const spread = all;
  const candidates = spread.slice(0, VIDEO_WATCH_MAX_VIDEOS);
  return { candidates, skipped: spread.slice(VIDEO_WATCH_MAX_VIDEOS).map(video => ({ videoId: video.videoId, reason: 'OVER_10_VIDEOS' as const })),
    candidatesSha256: sha(canonicalJson(candidates)) };
}

/** Strict answer check: exact shape, every interval inside the probed media, speech ordered and not overlapping. Text is kept as said, only trimmed. */
export function validateModelAnswer(value: unknown, durationSeconds: number): VideoWatchModelAnswer | null {
  if (!validateAnswer(value) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const inside = (item: { startSecond: number; endSecond: number }) => Number.isFinite(item.startSecond) && Number.isFinite(item.endSecond)
    && item.startSecond >= 0 && item.startSecond < item.endSecond && item.endSecond <= durationSeconds;
  let end = 0;
  for (const segment of value.segments) {
    if (!inside(segment) || segment.startSecond < end || segment.speech.trim() === '') return null;
    end = segment.endSecond;
  }
  let start = 0;
  for (const text of value.onScreenText) {
    if (!inside(text) || text.startSecond < start || text.text.trim() === '') return null;
    start = text.startSecond;
  }
  return { aboutProduct: value.aboutProduct, videoKind: value.videoKind,
    segments: value.segments.map(s => ({ startSecond: s.startSecond, endSecond: s.endSecond, speech: s.speech.trim() })),
    onScreenText: value.onScreenText.map(s => ({ startSecond: s.startSecond, endSecond: s.endSecond, text: s.text.trim() })) };
}

export interface VideoWatchBinding {
  readonly workspaceId: string;
  readonly runId: string;
  readonly scopeSha256: string;
  /** The frozen source set at collection time; null when the run had none yet. */
  readonly sourceSetSha256: string | null;
  readonly candidatesSha256: string;
}
export const videoWatchBindingSha256 = (binding: VideoWatchBinding): string => sha(canonicalJson({ workspaceId: binding.workspaceId, runId: binding.runId,
  scopeSha256: binding.scopeSha256, sourceSetSha256: binding.sourceSetSha256, candidatesSha256: binding.candidatesSha256 }));

export interface PreparedAutomatedVideoReading { readonly reading: AutomatedVideoReading; readonly bytes: Buffer; readonly readingSha256: string }
function prepareReading(binding: VideoWatchBinding, candidate: StepVideoWatchCandidate, judged: VideoWatchSubtitleAnswer, media: StepVideoWatchMedia,
  model: { readonly modelId: string; readonly responseSha256: string }, said: Pick<AutomatedVideoReading, 'captionSource' | 'segments' | 'onScreenText' | 'limitations'>): PreparedAutomatedVideoReading {
  const reading: AutomatedVideoReading = { contractVersion: 'video-reading-v3', registryId: 'S14', workspaceId: binding.workspaceId, runId: binding.runId,
    scopeSha256: binding.scopeSha256, sourceSetSha256: binding.sourceSetSha256, candidatesSha256: binding.candidatesSha256,
    provenance: 'AUTOMATED_MODEL_UNVERIFIED', state: 'PREPARED_NOT_ADMITTED', voice: 'SELLER', captionSource: said.captionSource,
    video: { videoUrl: candidate.url, videoId: candidate.videoId, origin: candidate.origin, videoKind: judged.videoKind, aboutProduct: judged.aboutProduct,
      durationSeconds: media.durationSeconds },
    segments: said.segments, onScreenText: said.onScreenText,
    media: { sha256: media.sha256, byteSize: media.byteSize, durationSeconds: media.durationSeconds, downloadedAt: media.downloadedAt },
    model: { modelId: model.modelId, responseSha256: model.responseSha256 }, limitations: said.limitations };
  if (!validateReading(reading)) throw new TypeError('The automated video reading does not match its contract.');
  const bytes = Buffer.from(canonicalJson(reading), 'utf8');
  return { reading, bytes, readingSha256: sha(bytes) };
}
export function buildAutomatedVideoReading(binding: VideoWatchBinding, candidate: StepVideoWatchCandidate, answer: VideoWatchModelAnswer, media: StepVideoWatchMedia,
  model: { readonly modelId: string; readonly responseSha256: string }): PreparedAutomatedVideoReading {
  return prepareReading(binding, candidate, answer, media, model, { captionSource: 'MODEL_TRANSCRIBED',
    segments: answer.segments.map(s => ({ startSeconds: s.startSecond, endSeconds: s.endSecond, text: s.speech })),
    onScreenText: answer.onScreenText.map(s => ({ startSeconds: s.startSecond, endSeconds: s.endSecond, text: s.text })), limitations: [...VIDEO_WATCH_LIMITATIONS] });
}
/** A subtitle reading: segments verbatim from the video's own subtitle file, `media` describes that file, no on-screen text; the model only judged
 * `aboutProduct` and `videoKind`. */
export function buildSubtitleVideoReading(binding: VideoWatchBinding, candidate: StepVideoWatchCandidate, answer: VideoWatchSubtitleAnswer,
  segments: readonly SubtitleSegment[], media: StepVideoWatchMedia, model: { readonly modelId: string; readonly responseSha256: string }): PreparedAutomatedVideoReading {
  return prepareReading(binding, candidate, answer, media, model, { captionSource: 'NATIVE_SUBTITLE',
    segments: segments.map(s => ({ startSeconds: s.startSeconds, endSeconds: s.endSeconds, text: s.text })), onScreenText: [], limitations: [...VIDEO_WATCH_SUBTITLE_LIMITATIONS] });
}
/** Strict text-only answer check: exactly `aboutProduct` and `videoKind`. */
export function validateSubtitleModelAnswer(value: unknown): VideoWatchSubtitleAnswer | null {
  return validateSubtitleAnswer(value) ? { aboutProduct: value.aboutProduct, videoKind: value.videoKind } : null;
}

export interface VideoWatchRef { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string }
export const videoWatchPackageKey = (runId: string, videoId: string, readingSha256: string): string => `${videoWatchPackagePrefix(runId)}${videoId}-${readingSha256.slice(0, 16)}`;
type CaptionSource = AutomatedVideoReading['captionSource'];
const fileMetadata = (bytes: Uint8Array, captionSource: CaptionSource): SourcePackageIntakeRequest['files'] => [{ path: VIDEO_WATCH_READING_PATH, sha256: sha(bytes), byteSize: bytes.byteLength, mediaType: 'application/json',
  evidenceFamily: VIDEO_WATCH_EVIDENCE_FAMILY, representationRole: 'derived' as const, independence: 'non_independent' as const,
  providerProvenance: 'provider_reported' as const, provenanceBasis: captionSource === 'NATIVE_SUBTITLE' ? SUBTITLE_PROVENANCE_BASIS : PROVENANCE_BASIS }];

/** The Foundation write the lane needs; the service supplies it under its mutation mutex. */
export interface VideoWatchWriter {
  intakeAutomationAttachment(input: unknown, files: ReadonlyMap<string, Uint8Array>, bindingSha256: string, budget?: { maxFileBytes: number; maxTotalBytes: number }): Promise<VideoWatchRef>;
}
export async function publishAutomatedVideoReading(writer: VideoWatchWriter, binding: VideoWatchBinding, prepared: PreparedAutomatedVideoReading): Promise<VideoWatchRef> {
  const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: videoWatchPackageKey(binding.runId, prepared.reading.video.videoId, prepared.readingSha256),
    version: 1, sourceLabel: prepared.reading.captionSource === 'NATIVE_SUBTITLE' ? SUBTITLE_SOURCE_LABEL : SOURCE_LABEL, sourceAcquiredAt: prepared.reading.media.downloadedAt,
    files: fileMetadata(prepared.bytes, prepared.reading.captionSource) };
  const stored = await writer.intakeAutomationAttachment(request, new Map([[VIDEO_WATCH_READING_PATH, prepared.bytes]]), videoWatchBindingSha256(binding), VIDEO_WATCH_READ_BUDGET);
  return { packageId: stored.packageId, manifestArtifactSha256: stored.manifestArtifactSha256, packageContentSha256: stored.packageContentSha256 };
}

export type VerifiedAutomatedVideoReading = { readonly readingSha256: string; readonly voiceLabel: string; readonly segments: readonly { readonly text: string; readonly startSeconds: number; readonly endSeconds: number }[] };
type Reader = Pick<FoundationSourcePackageReader, 'readFinalizedSourcePackage' | 'readAutomationAttachmentOrigin'>;
/** Network-free re-read of one stored reading against the run and its pinned candidate list. Not about the product, or OTHER, is stored but never drawn. */
export async function verifyAutomatedVideoReading(reader: Reader, ref: VideoWatchRef, expected: {
  readonly workspaceId: string; readonly runId: string; readonly scopeSha256: string; readonly sourceSetSha256: string | null;
  readonly candidates: readonly StepVideoWatchCandidate[]; readonly candidatesSha256: string; readonly readingSha256?: string;
}): Promise<VerifiedAutomatedVideoReading | 'NOT_ABOUT_PRODUCT' | 'NOT_VERIFIED'> {
  try {
    if (sha(canonicalJson(expected.candidates)) !== expected.candidatesSha256) return 'NOT_VERIFIED';
    const source = await reader.readFinalizedSourcePackage(ref.packageId, VIDEO_WATCH_READ_BUDGET);
    if (source.manifestArtifactSha256 !== ref.manifestArtifactSha256 || source.packageContentSha256 !== ref.packageContentSha256 || source.manifest.version !== 1
      || !source.manifest.packageKey.startsWith(videoWatchPackagePrefix(expected.runId)) || source.files.length !== 1) return 'NOT_VERIFIED';
    const member = source.files[0]!;
    if (member.path !== VIDEO_WATCH_READING_PATH || sha(member.bytes) !== member.sha256) return 'NOT_VERIFIED';
    const readingSha256 = sha(member.bytes);
    if (expected.readingSha256 !== undefined && expected.readingSha256 !== readingSha256) return 'NOT_VERIFIED';
    const reading = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(member.bytes)) as unknown;
    if (!validateReading(reading) || canonicalJson(reading) !== Buffer.from(member.bytes).toString('utf8')) return 'NOT_VERIFIED';
    // The file metadata follows from the stored bytes and their caption source (a model-transcribed reading keeps its original metadata).
    if (canonicalJson(fileMetadata(member.bytes, reading.captionSource)) !== canonicalJson(source.files.map(({ bytes: _bytes, ...file }) => file))) return 'NOT_VERIFIED';
    if (reading.captionSource === 'NATIVE_SUBTITLE' && reading.onScreenText.length > 0) return 'NOT_VERIFIED';
    if (reading.workspaceId !== expected.workspaceId || reading.runId !== expected.runId || reading.scopeSha256 !== expected.scopeSha256
      || reading.candidatesSha256 !== expected.candidatesSha256 || reading.sourceSetSha256 !== expected.sourceSetSha256
      || source.manifest.packageKey !== videoWatchPackageKey(expected.runId, reading.video.videoId, readingSha256)) return 'NOT_VERIFIED';
    const origin = await reader.readAutomationAttachmentOrigin(ref.packageId, VIDEO_WATCH_READ_BUDGET);
    if (!origin || origin.manifestArtifactSha256 !== source.manifestArtifactSha256 || origin.bindingSha256 !== videoWatchBindingSha256(reading)) return 'NOT_VERIFIED';
    if (!expected.candidates.some(c => c.videoId === reading.video.videoId && c.url === reading.video.videoUrl && c.origin === reading.video.origin)) return 'NOT_VERIFIED';
    if (!HEX64.test(reading.media.sha256) || reading.video.durationSeconds !== reading.media.durationSeconds) return 'NOT_VERIFIED';
    if (!reading.video.aboutProduct || reading.video.videoKind === 'OTHER') return 'NOT_ABOUT_PRODUCT';
    return { readingSha256, voiceLabel: voiceLabelFor(reading.video.videoKind), segments: reading.segments.map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds })) };
  } catch { return 'NOT_VERIFIED'; }
}

/** One candidate's outcome. Only the model answers are captured; the media file itself stays in the media folder. */
export interface VideoWatchAttempt {
  readonly candidate: StepVideoWatchCandidate;
  /** SUBTITLE when the video's own subtitles were read, VIDEO when the video was downloaded; null when neither was reached. */
  readonly path?: StepVideoWatchPath | null;
  readonly reason: StepVideoWatchReason | null;
  readonly media: StepVideoWatchMedia | null;
  readonly captures: readonly ProviderRawCapture[];
  readonly reading: (VideoWatchRef & { readonly readingSha256: string }) | null;
  readonly requests: number;
  readonly paidRequests: number;
  readonly downloads: number;
}

export interface VideoWatchLaneOptions {
  readonly media: VideoMediaConfig;
  /** null when CLIProxy is not configured: every candidate is then skipped as VIDEO_MODEL_NOT_CONFIGURED, with no download. */
  readonly model: VideoWatchModel | null;
  readonly now: () => Date;
  readonly runner?: ProcessRunner;
  readonly readFile?: (file: string) => Promise<Uint8Array>;
}
/** Sequential, bounded per video; every skip keeps a reason code and never fails the run. */
export class VideoWatchLane {
  readonly #options: VideoWatchLaneOptions;
  constructor(options: VideoWatchLaneOptions) { this.#options = options; }
  get modelId(): string | null { return this.#options.model?.modelId ?? null; }
  sweep(): Promise<{ readonly deleted: number; readonly removedDirs: number }> { return sweepVideoMedia(this.#options.media.mediaDir, this.#options.now()); }

  /** `productKeyword` is the run's frozen product keyword (start snapshot); the model judges "about this product" against it. */
  async run(input: { readonly binding: VideoWatchBinding; readonly productKeyword: string; readonly candidates:readonly StepVideoWatchCandidate[]; readonly signal?: AbortSignal;
    readonly publish: (prepared: PreparedAutomatedVideoReading) => Promise<VideoWatchRef> }): Promise<VideoWatchAttempt[]> {
    try { await this.sweep(); } catch { /* a failed sweep never blocks the lane; the next start sweeps again */ }
    const out: VideoWatchAttempt[] = [];
    const runner = this.#options.runner ?? defaultProcessRunner, read = this.#options.readFile ?? (file => fs.readFile(file));
    for (const candidate of input.candidates) {
      const skip = (reason: StepVideoWatchReason, extra: Partial<VideoWatchAttempt> = {}): VideoWatchAttempt =>
        ({ candidate, path: null, reason, media: null, captures: [], reading: null, requests: 0, paidRequests: 0, downloads: 0, ...extra });
      if (input.signal?.aborted) { out.push(skip('CANCELLED')); continue; }
      const model = this.#options.model;
      if (!model) { out.push(skip('VIDEO_MODEL_NOT_CONFIGURED')); continue; }
      // Subtitles first: a valid Vietnamese subtitle file needs no video download and no video sent to the model.
      const subtitles = await downloadSubtitles(this.#options.media, runner, this.#options.now, input.binding.runId, candidate, input.signal);
      if (subtitles.ok) { out.push(await this.#readSubtitles(input, candidate, model, subtitles.segments, subtitles.media)); continue; }
      if (subtitles.reason === 'CANCELLED') { out.push(skip('CANCELLED')); continue; }
      const downloaded = await downloadVideo(this.#options.media, runner, this.#options.now, input.binding.runId, candidate, input.signal);
      if (!downloaded.ok) { out.push(skip(downloaded.reason, { path: 'VIDEO', downloads: 1 })); continue; }
      const base = { path: 'VIDEO' as const, media: downloaded.media, downloads: 1 };
      let bytes: Uint8Array;
      try { bytes = await read(downloaded.file); } catch { out.push(skip('DOWNLOAD_FAILED', base)); continue; }
      if (bytes.byteLength !== downloaded.media.byteSize || sha(bytes) !== downloaded.media.sha256) { out.push(skip('DOWNLOAD_FAILED', base)); continue; }
      const durationSeconds = Math.min(downloaded.media.durationSeconds, VIDEO_WATCH_MAX_SECONDS);
      const ask = { productKeyword: input.productKeyword, durationSeconds };
      // An answer that fails the strict check (for example a time past the end) gets ONE more model call, counted like any request.
      // Times are never clamped, shifted or repaired; a second invalid answer is MODEL_ANSWER_INVALID.
      const captures: ProviderRawCapture[] = [];
      let requests = 0, paidRequests = 0;
      let watched: VideoWatchModelResult | null = null, answer: VideoWatchModelAnswer | null = null;
      for (let pass = 0; pass < 2 && !answer; pass++) {
        if (pass > 0 && input.signal?.aborted) break;
        watched = await model.watch({ bytes, mimeType: downloaded.mimeType, videoId: candidate.videoId }, ask, input.signal);
        captures.push(...watched.captures); requests += watched.requests; paidRequests += watched.paidRequests;
        if (watched.kind === 'FAILED') break;
        answer = validateModelAnswer(watched.answer, durationSeconds);
      }
      const called = { ...base, captures, requests, paidRequests };
      if (watched?.kind === 'FAILED') { out.push(skip(watched.reason, called)); continue; }
      if (!answer || watched?.kind !== 'ANSWER') { out.push(skip(input.signal?.aborted ? 'CANCELLED' : 'MODEL_ANSWER_INVALID', called)); continue; }
      let prepared: PreparedAutomatedVideoReading;
      try { prepared = buildAutomatedVideoReading(input.binding, candidate, answer, downloaded.media, { modelId: model.modelId, responseSha256: watched.responseSha256 }); }
      catch { out.push(skip('MODEL_ANSWER_INVALID', called)); continue; }
      try {
        const ref = await input.publish(prepared);
        out.push({ candidate, reason: null, ...called, reading: { ...ref, readingSha256: prepared.readingSha256 } });
      } catch { out.push(skip(input.signal?.aborted ? 'CANCELLED' : 'PUBLICATION_FAILED', called)); }
    }
    return out;
  }

  /** The subtitle path: segments verbatim from the file; ONE text-only model question, one more call when the answer fails the strict check. */
  async #readSubtitles(input: Parameters<VideoWatchLane['run']>[0], candidate: StepVideoWatchCandidate, model: VideoWatchModel, segments: readonly SubtitleSegment[],
    media: StepVideoWatchMedia): Promise<VideoWatchAttempt> {
    const captures: ProviderRawCapture[] = [];
    let requests = 0, paidRequests = 0;
    let judged: VideoWatchModelResult | null = null, answer: VideoWatchSubtitleAnswer | null = null;
    const ask = { productKeyword: input.productKeyword, durationSeconds: media.durationSeconds, captionText: subtitleCaptionText(segments) };
    for (let pass = 0; pass < 2 && !answer; pass++) {
      if (pass > 0 && input.signal?.aborted) break;
      judged = await model.readSubtitles(ask, input.signal);
      captures.push(...judged.captures); requests += judged.requests; paidRequests += judged.paidRequests;
      if (judged.kind === 'FAILED') break;
      answer = validateSubtitleModelAnswer(judged.answer);
    }
    const called = { candidate, path: 'SUBTITLE' as const, media, captures, requests, paidRequests, downloads: 1 };
    const skip = (reason: StepVideoWatchReason): VideoWatchAttempt => ({ ...called, reason, reading: null });
    if (judged?.kind === 'FAILED') return skip(judged.reason);
    if (!answer || judged?.kind !== 'ANSWER') return skip(input.signal?.aborted ? 'CANCELLED' : 'MODEL_ANSWER_INVALID');
    let prepared: PreparedAutomatedVideoReading;
    try { prepared = buildSubtitleVideoReading(input.binding, candidate, answer, segments, media, { modelId: model.modelId, responseSha256: judged.responseSha256 }); }
    catch { return skip('MODEL_ANSWER_INVALID'); }
    try {
      const ref = await input.publish(prepared);
      return { ...called, reason: null, reading: { ...ref, readingSha256: prepared.readingSha256 } };
    } catch { return skip(input.signal?.aborted ? 'CANCELLED' : 'PUBLICATION_FAILED'); }
  }
}

/** The stored step field. `indexes[i]` is the step capture ordinal of attempt i's last (answer) capture, null when none was stored. */
export function videoWatchDocument(plan: VideoWatchPlan, attempts: readonly VideoWatchAttempt[], indexes: readonly (number | null)[]): StepVideoWatch {
  return { profile: VIDEO_WATCH_PROFILE, candidatesSha256: plan.candidatesSha256, candidates: plan.candidates, skipped: plan.skipped,
    videos: plan.candidates.map((candidate, i): StepVideoWatchVideo => {
      const attempt = attempts[i], index = indexes[i] ?? null;
      if (!attempt || attempt.candidate.videoId !== candidate.videoId) return { videoId: candidate.videoId, status: 'SKIPPED', reason: 'DOCUMENT_INVALID', captureIndex: null, retrievedAt: null, media: null, reading: null };
      const answer = index === null ? null : attempt.captures[attempt.captures.length - 1] ?? null;
      const stored = { captureIndex: answer ? index : null, retrievedAt: answer?.completedAt ?? null, media: attempt.media, ...(attempt.path ? { path: attempt.path } : {}) };
      if (attempt.reading && answer) return { videoId: candidate.videoId, status: 'READ', reason: null, ...stored, reading: attempt.reading };
      return { videoId: candidate.videoId, status: 'SKIPPED', reason: attempt.reason ?? 'DOCUMENT_INVALID', ...stored, reading: null };
    }) };
}

/** Every candidate skipped with one reason (thrown lane, storage refusal). */
export function videoWatchFailed(plan: VideoWatchPlan, reason: StepVideoWatchReason): StepVideoWatch {
  return { profile: VIDEO_WATCH_PROFILE, candidatesSha256: plan.candidatesSha256, candidates: plan.candidates, skipped: plan.skipped,
    videos: plan.candidates.map(candidate => ({ videoId: candidate.videoId, status: 'SKIPPED' as const, reason, captureIndex: null, retrievedAt: null, media: null, reading: null })) };
}

/** Model answers are paid; the provider reports no attributable credit amount, so the cost stays unknown. */
export function videoWatchUsage(attempts: readonly VideoWatchAttempt[]): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: string } };
} {
  const paid = attempts.reduce((sum, a) => sum + a.paidRequests, 0);
  const ambiguous = attempts.reduce((sum, a) => sum + a.captures.filter(c => c.outcome.endsWith('_AMBIGUOUS')).length, 0);
  return { provider: VIDEO_WATCH_PROVIDER, usage: { requestsIssued: attempts.reduce((sum, a) => sum + a.requests, 0), paidRequestsIssued: paid,
    ambiguousPaidRequests: ambiguous, credits: { status: paid > 0 ? 'NOT_REPORTED' : 'NONE_USED' } } };
}

/** Readings a step document points at, in candidate order: the only automated S14 inputs a Market build may consider. */
export function videoWatchReadingRefs(value: StepVideoWatch | null | undefined): (VideoWatchRef & { readonly readingSha256: string })[] {
  return (value?.videos ?? []).flatMap(video => video.status === 'READ' && video.reading ? [video.reading] : []);
}

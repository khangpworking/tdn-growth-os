import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import keywordSchema from '../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import collectionSchema from '../../../contracts/analysis/tiktok-comment-collection-v1.schema.json' with { type: 'json' };
import type { TikTokCommentRunReceipt, TikTokCommentRetainedCapture, TikTokCommentPrivacyProfile, SanitizedTikTokComment } from '../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
export type { TikTokCommentRunReceipt, SanitizedTikTokComment } from '../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import { canonicalJson } from '../../modules/foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv); ajv.addSchema(keywordSchema); ajv.addSchema(collectionSchema);
const validateProfile = ajv.compile<TikTokCommentPrivacyProfile>({ $ref: `${collectionSchema.$id}#/$defs/privacy` });
const validateReceipt = ajv.compile<TikTokCommentRunReceipt>({ $ref: `${collectionSchema.$id}#/$defs/providerReceipt` });
const validateCapture = ajv.compile<TikTokCommentRetainedCapture>({ $ref: `${collectionSchema.$id}#/$defs/capture` });

export const TIKTOK_COMMENT_ACTORS = {
  default: 'datadoping/tiktok-comment-reply-scraper',
  fallback: 'clockworks/tiktok-comments-scraper',
} as const;
export type TikTokCommentActor = typeof TIKTOK_COMMENT_ACTORS[keyof typeof TIKTOK_COMMENT_ACTORS];
/** Public store documentation, inspected without starting any actor. */
export const TIKTOK_COMMENT_DOCUMENTATION = Object.freeze({
  [TIKTOK_COMMENT_ACTORS.default]: { url: 'https://apify.com/datadoping/tiktok-comment-reply-scraper',
    sha256: 'e5a9b97376b3b469da2a95aa013d0fdf22531ee5c7d9f1f20c824866f1f9995b', retrievedAt: '2026-10-09' },
  [TIKTOK_COMMENT_ACTORS.fallback]: { url: 'https://apify.com/clockworks/tiktok-comments-scraper',
    sha256: '46747bea083f082ab45f5ce86dc56f5b02e7900a90a2c917f5fa48e8b56cfa24', retrievedAt: '2026-10-09' },
});
export class TikTokCommentCollectorError extends Error { readonly code = 'INVALID_TIKTOK_COMMENT_COLLECTION'; }
function fail(): never { throw new TikTokCommentCollectorError('Không thể xác minh lượt thu bình luận trong giới hạn đã chọn.'); }
export function exactTikTokVideoUrl(value: string): { videoId: string; url: string; handle: string } {
  if (!/^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9._]{1,64}\/video\/[1-9][0-9]{0,19}$/.test(value)) fail();
  const match = /^https:\/\/www\.tiktok\.com\/@([^/]+)\/video\/([1-9][0-9]{0,19})$/.exec(value)!;
  return { videoId: match[2]!, url: value, handle: match[1]! };
}
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const numericId = (value: unknown): string | null => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();

export interface TikTokCommentsTransport {
  start(actor: TikTokCommentActor, input: Readonly<Record<string, unknown>>, maxTotalChargeUsd: number, signal?: AbortSignal): Promise<TikTokCommentRunReceipt>;
  readPage(receipt: TikTokCommentRunReceipt, offset: number, limit: number, signal?: AbortSignal): Promise<Buffer>;
}
export function tikTokCommentActorInput(actor: TikTokCommentActor, urls: readonly string[], perVideo = 200): Record<string, unknown> {
  if (!Number.isSafeInteger(perVideo) || perVideo < 1 || perVideo > 200 || urls.length < 1 || urls.length > 30) fail();
  const ids = urls.map(url => exactTikTokVideoUrl(url).videoId); if (new Set(ids).size !== ids.length) fail();
  if (actor === TIKTOK_COMMENT_ACTORS.default) return { video_id_or_url: [...urls], max_comments: perVideo, scrape_replies: false };
  if (actor === TIKTOK_COMMENT_ACTORS.fallback) return { postURLs: [...urls], commentsPerPost: perVideo, topLevelCommentsPerPost: perVideo, maxRepliesPerComment: 0 };
  return fail();
}

/** Only deterministic contact redaction; never rewrites evidence for style.
 * Source text is explicitly labelled SANITIZED rather than verbatim raw prose. */
export function sanitizeTikTokCommentText(value: string): string {
  return value.replace(/https?:\/\/(?:www\.)?tiktok\.com\/@[^\s]+/giu, '[profile removed]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email removed]')
    .replace(/(?<![\p{L}\p{N}])\+?\d(?:[\s().-]*\d){6,14}(?![\p{L}\p{N}])/gu, '[phone removed]')
    .replace(/@[\p{L}\p{N}._-]+/gu, '[handle removed]');
}

/** Salt and raw seller IDs are copied into a closure and never returned.
 * No environment reads, generated key, hash-to-author map or person verification. */
export function createTikTokCommentPrivacy(configuration: { salt: Uint8Array; keyId: string; sellerAuthorIds?: readonly string[] }) {
  if (!(configuration.salt instanceof Uint8Array) || configuration.salt.byteLength < 32 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(configuration.keyId)) fail();
  const salt = Buffer.from(configuration.salt);
  if (['utf8', 'hex', 'base64', 'base64url'].some(encoding => salt.toString(encoding as BufferEncoding) === configuration.keyId)) fail();
  const sellers = new Set(configuration.sellerAuthorIds ?? []); if ([...sellers].some(id => numericId(id) === null)) fail();
  const key = (domain: string, value: string) => createHmac('sha256', salt).update(`tdn:tiktok.com:${domain}:v1\0`).update(value).digest('hex');
  const profile: TikTokCommentPrivacyProfile = Object.freeze({ profileVersion: 'tiktok-comment-privacy-v1' as const, platform: 'tiktok' as const,
    keyId: configuration.keyId, keyCommitment: key('key-continuity', 'configured'),
    voicePolicyCommitment: key('declared-seller-policy', canonicalJson([...sellers].sort())), algorithm: 'HMAC-SHA256' as const });
  if (!validateProfile(profile)) fail();
  const sanitizePage = (actor: TikTokCommentActor, bytes: Buffer, selectedUrls: readonly string[], pageIndex: number) => {
    if (bytes.byteLength > 8 * 1024 * 1024) fail();
    let values: unknown; try { values = JSON.parse(bytes.toString('utf8')); } catch { return fail(); }
    if (!Array.isArray(values) || values.length > 1000 || bytes.byteLength > 8 * 1024 * 1024 || !Number.isSafeInteger(pageIndex) || pageIndex < 0) fail();
    const selected = new Map(selectedUrls.map(url => [exactTikTokVideoUrl(url).videoId, exactTikTokVideoUrl(url)]));
    return values.map((value, rowIndex): SanitizedTikTokComment => {
      const row = object(value), defaultActor = actor === TIKTOK_COMMENT_ACTORS.default;
      if (!defaultActor && actor !== TIKTOK_COMMENT_ACTORS.fallback) fail();
      const originalVideo = defaultActor ? numericId(row.video_id) : typeof row.videoWebUrl === 'string' ? exactTikTokVideoUrl(row.videoWebUrl).videoId : null;
      const video = originalVideo === null ? undefined : selected.get(originalVideo);
      const commentId = numericId(defaultActor ? row.comment_id : row.cid); if (!video || commentId === null) fail();
      if ((!defaultActor && row.videoWebUrl !== video.url) ||
        (defaultActor && Object.hasOwn(row, 'input_url') && row.input_url !== video.url) ||
        (!defaultActor && Object.hasOwn(row, 'submittedVideoUrl') && row.submittedVideoUrl !== null && row.submittedVideoUrl !== video.url)) fail();
      if (defaultActor && row.item_type !== 'comment' && row.item_type !== 'reply') fail();
      const parent = defaultActor ? row.reply_to_comment_id : row.repliesToId;
      const isReply = defaultActor ? row.item_type === 'reply' || (parent !== null && parent !== undefined && parent !== '0')
        : parent !== null && parent !== undefined && parent !== '0';
      const authorField = defaultActor ? 'user_id' : 'uid', author = numericId(row[authorField]);
      const authorIdentity = author === null ? { state: Object.hasOwn(row, authorField) ? 'INVALID' as const : 'MISSING' as const, hash: null }
        : { state: 'HASHED' as const, hash: key('author', author) };
      const text = typeof row.text === 'string' ? row.text : null; if (text !== null && text.length > 20000) fail();
      const handle = defaultActor ? row.username : row.uniqueId;
      const voice = (author !== null && sellers.has(author)) || (typeof handle === 'string' && handle === video.handle)
        ? 'SELLER_OR_CREATOR' as const : 'CUSTOMER' as const;
      // Contact-only text is excluded explicitly before redaction could make
      // the placeholder look meaningful. Human words remain source evidence.
      const withoutTags = text?.replace(/@[\p{L}\p{N}._-]+/gu, '') ?? '';
      const tagOnly = text !== null && /@[\p{L}\p{N}._-]+/u.test(text) && !/[\p{L}\p{N}]/u.test(withoutTags);
      const empty = text === null || !text.trim();
      const emojiOnly = text !== null && !empty && !tagOnly && !/[\p{L}\p{N}]/u.test(text);
      const reason = isReply ? 'REPLY' as const : empty ? 'EMPTY' as const : tagOnly ? 'TAG_ONLY' as const : emojiOnly ? 'EMOJI_ONLY' as const : null;
      return { videoId: video.videoId, commentId, videoUrl: video.url, pageIndex, rowIndex,
        text: text === null ? null : sanitizeTikTokCommentText(text), textForm: 'SANITIZED' as const,
        createdAt: date(defaultActor ? row.created_at_utc : row.createTimeISO), likeCount: count(defaultActor ? row.like_count : row.diggCount),
        authorIdentity, voice, isReply, exclusionReason: reason,
        // Opaque key-scoped conflict witness over supported original content,
        // not a retained raw page digest or a retrievable identity mapping.
        evidenceCommitment: key('comment-content', canonicalJson({ videoId: video.videoId, commentId, text,
          createdAt: defaultActor ? row.created_at_utc ?? null : row.createTimeISO ?? null,
          likeCount: defaultActor ? row.like_count ?? null : row.diggCount ?? null, authorIdentity, voice, isReply })) };
    });
  };
  return Object.freeze({ profile, sanitizePage });
}
export type TikTokCommentPrivacy = ReturnType<typeof createTikTokCommentPrivacy>;

/** Mechanics only. Owning service freezes/retains intent before dispatch and
 * authenticates completed storage on retries. No automatic fallback or retry. */
export class ApifyTikTokCommentsCollector {
  readonly #attempts = new Map<string, { request: string; result?: TikTokCommentCapture }>();
  readonly #configuration;
  constructor(private readonly options: { transport: TikTokCommentsTransport; privacy: TikTokCommentPrivacy;
    actor?: TikTokCommentActor; approvedMaxTotalChargeUsd: number; maxCommentsPerVideo?: number }) {
    if (!Number.isFinite(options.approvedMaxTotalChargeUsd) || options.approvedMaxTotalChargeUsd <= 0 || options.approvedMaxTotalChargeUsd > 10000) fail();
    const actor = options.actor ?? TIKTOK_COMMENT_ACTORS.default;
    const maximum = options.maxCommentsPerVideo ?? 200;
    if (!Object.values(TIKTOK_COMMENT_ACTORS).includes(actor) || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 200 || !validateProfile(options.privacy.profile)) fail();
    this.options = Object.freeze({ ...options, privacy: Object.freeze({ profile: Object.freeze(structuredClone(options.privacy.profile)), sanitizePage: options.privacy.sanitizePage }) });
    this.#configuration = Object.freeze({ actor, approvedMaxTotalChargeUsd: options.approvedMaxTotalChargeUsd, maxCommentsPerVideo: maximum });
  }
  get privacyProfile() { return this.options.privacy.profile; }
  /** Exact copied opt-in settings used by collection; never credentials or salt. */
  get collectionConfiguration() { return this.#configuration; }
  async collect(urls: readonly string[], requestSha256: string, signal?: AbortSignal,
    observeReceipt?: (receipt: TikTokCommentRunReceipt) => Promise<void>): Promise<TikTokCommentCapture> {
    signal?.throwIfAborted(); if (!/^[a-f0-9]{64}$/.test(requestSha256)) fail();
    const { actor, maxCommentsPerVideo: maximum, approvedMaxTotalChargeUsd } = this.#configuration;
    const input = tikTokCommentActorInput(actor, urls, maximum);
    const request = canonicalJson({ input, actor, maxTotalChargeUsd: approvedMaxTotalChargeUsd, privacy: this.privacyProfile });
    const prior = this.#attempts.get(requestSha256);
    if (prior) { if (prior.request !== request || !prior.result) fail(); return cloneCapture(prior.result); }
    this.#attempts.set(requestSha256, { request });
    const returned = await this.options.transport.start(actor, input, approvedMaxTotalChargeUsd, signal);
    // Keep only the closed existing receipt; a transport may attach raw extras.
    const receipt: TikTokCommentRunReceipt = { runId: returned.runId, datasetId: returned.datasetId, buildId: returned.buildId,
      status: returned.status, retrievedAt: returned.retrievedAt, providerTotalRows: returned.providerTotalRows, usageTotalUsd: returned.usageTotalUsd };
    if (!validateReceipt(receipt) || !/^[A-Za-z0-9_-]{1,100}$/.test(receipt.runId) || !/^[A-Za-z0-9_-]{1,100}$/.test(receipt.datasetId) ||
      (receipt.buildId !== null && (typeof receipt.buildId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(receipt.buildId))) || date(receipt.retrievedAt) === null || (receipt.providerTotalRows !== null && count(receipt.providerTotalRows) === null) ||
      (receipt.usageTotalUsd !== null && (!Number.isFinite(receipt.usageTotalUsd) || receipt.usageTotalUsd < 0 || receipt.usageTotalUsd > approvedMaxTotalChargeUsd))) fail();
    await observeReceipt?.(structuredClone(receipt));
    signal?.throwIfAborted();
    if (receipt.status !== 'SUCCEEDED') fail();
    const pages: { sha256: string; bytes: Buffer; offset: number; rows: SanitizedTikTokComment[] }[] = [];
    const perVideo = new Map<string, Set<string>>(); let offset = 0;
    // Bounded audit transport volume is an engineering guard, not sampling.
    // Duplicate/reply noise never consumes the unique top-level quota.
    const maxRows = urls.length * maximum * 4;
    for (let pageIndex = 0; ; pageIndex++) {
      signal?.throwIfAborted();
      const raw = await this.options.transport.readPage(receipt, offset, Math.min(1000, maxRows - offset + 1), signal);
      signal?.throwIfAborted();
      const rows = this.options.privacy.sanitizePage(actor, raw, urls, pageIndex);
      if (!rows.length) break;
      offset += rows.length; if (offset > maxRows) fail();
      for (const row of rows) if (!row.isReply) {
        const ids = perVideo.get(row.videoId) ?? new Set<string>(); ids.add(row.commentId); perVideo.set(row.videoId, ids);
        if (ids.size > maximum) fail();
      }
      const bytes = Buffer.from(canonicalJson(rows)); pages.push({ sha256: sha(bytes), bytes, offset: offset - rows.length, rows });
      if (receipt.providerTotalRows !== null && offset === receipt.providerTotalRows) break;
      if (receipt.providerTotalRows !== null && offset > receipt.providerTotalRows) fail();
    }
    if (receipt.providerTotalRows !== null && offset !== receipt.providerTotalRows) fail();
    const result = { contractVersion: 'tiktok-comment-capture-v1' as const, actor, inputSha256: sha(canonicalJson(input)),
      privacy: this.privacyProfile, receipt: { runId: receipt.runId, datasetId: receipt.datasetId, buildId: receipt.buildId,
        status: receipt.status, retrievedAt: receipt.retrievedAt, providerTotalRows: receipt.providerTotalRows, usageTotalUsd: receipt.usageTotalUsd }, auditForm: 'SANITIZED_ALLOWLIST' as const, pages };
    if (!validateCapture(retainedTikTokCapture(result))) fail();
    signal?.throwIfAborted(); this.#attempts.set(requestSha256, { request, result: cloneCapture(result) });
    return result;
  }
}

/** Buffer bytes are transient mechanics; persisted membership is canonical. */
export type TikTokCommentCapture = Omit<TikTokCommentRetainedCapture, 'pages'> & {
  pages: (TikTokCommentRetainedCapture['pages'][number] & { bytes: Buffer })[];
};
export function retainedTikTokCapture(value: TikTokCommentCapture): TikTokCommentRetainedCapture {
  return { ...value, pages: value.pages.map(({ bytes: _bytes, ...page }) => structuredClone(page)) };
}
function cloneCapture(value: TikTokCommentCapture): TikTokCommentCapture {
  return { ...value, privacy: { ...value.privacy }, receipt: { ...value.receipt },
    pages: value.pages.map(page => ({ ...page, bytes: Buffer.from(page.bytes), rows: structuredClone(page.rows) })) };
}

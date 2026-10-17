// TikTok top-ads auto-read lane for the automated Market flow (S16, AUTO origin). Off unless the flag is exactly "1".
//
// At COLLECTION the app opens TikTok's public top-ads list (creative centre) for region VN and the run's product keyword in
// the lane's own browser session. Production plans one open per run; at most 5 opens, at least 30 s apart, never logged in,
// never typing, clicking or scrolling, no retries. Any captcha, verification, login wall or block message stops the lane at
// once. A browser that is logged in to TikTok stops the lane and nothing of that read is kept.
//
// Parser profile `tiktok-top-ads-visible-text-v1` is UNWITNESSED and fail-closed: the URL table, the label tables and the
// marker tables are data only. A read with no recognised ad-card structure is UI_CHANGED (lane stops, evidence kept).
// Only visible literals are kept (caption, account label, industry, objective, like-count text) with UTF-8 byte spans;
// CTR, budget, conversion and effectiveness figures are never kept. The first canary run is the witness.
// Raw HTML is used in memory only and never stored.
import { createHash } from 'node:crypto';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { containsTechnicalId } from '../citation-registry.js';
import type { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { filterKeywordMeanings } from '../keyword-meaning-filter.js';
import type { MetricOpenCliProcessRunner } from './metric-opencli-executor.js';
import { createMetricOpenCliProcessRunner } from './metric-opencli-process-runner.js';
import { realMetaAutoClock, type MetaAutoClock } from './meta-auto-lane.js';
import type { StepTikTokTopAds, StepTikTokTopAdsCard, StepTikTokTopAdsField, StepTikTokTopAdsRead, StepTikTokTopAdsSpan, StepTikTokTopAdsStatus, StepTikTokTopAdsStop } from './model.js';
import { withOpenCliBrowserLock } from './opencli-browser-lock.js';
import { isRecord } from './provider-common.js';
import { webTextHidden } from './web-page-type.js';

export const TIKTOK_TOP_ADS_FLAG = 'TDN_RESEARCH_TIKTOK_TOPADS_ENABLED';
/** Usage ordinal inside the collection step (11 official statistics, 12 Meta auto-read). */
export const TIKTOK_TOP_ADS_USAGE_ORDINAL = 13;
export const TIKTOK_TOP_ADS_PROVIDER = 'TIKTOK-TOP-ADS' as const;
export const TIKTOK_TOP_ADS_PROFILE = 'tiktok-top-ads-visible-text-v1' as const;
export const TIKTOK_TOP_ADS_SESSION = 'tdntiktok';
export const TIKTOK_TOP_ADS_MAX_OPENS = 5;
export const TIKTOK_TOP_ADS_SPACING_MS = 30_000;
export const TIKTOK_TOP_ADS_TEXT_CAP_BYTES = 1024 * 1024;
export const TIKTOK_TOP_ADS_HTML_MAX_CHARS = 4_000_000;
export const TIKTOK_TOP_ADS_COMMAND_TIMEOUT_MS = 90_000;
export const TIKTOK_TOP_ADS_STREAM_CAP_BYTES = 24 * 1024 * 1024;
export const TIKTOK_TOP_ADS_BROWSER_COMMAND_TIMEOUT = '60';
export const TIKTOK_TOP_ADS_READ_BUDGET = { maxFileBytes: 8 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } as const;
/** Cards parsed per read; later caption lines are not read. */
export const TIKTOK_TOP_ADS_MAX_CARDS_PER_READ = 200;
export const TIKTOK_TOP_ADS_MAX_FIELD_CHARS = 500;
export const TIKTOK_TOP_ADS_MAX_KEYWORD_CHARS = 120;
const MAX_EXTRACT_CHUNKS = 64;
const ENV_ALLOW_LIST = ['PATH', 'HOME', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR'] as const;
const EVIDENCE_FAMILY = 'tiktok-top-ads-auto-read-v1';
const SOURCE_LABEL = 'Quảng cáo nổi bật trên TikTok, máy tự đọc khi không đăng nhập';
const PROVENANCE_BASIS = 'Visible text of the public TikTok top-ads list read by the app without logging in; ads chosen and shown by TikTok at read time.';

export function tiktokTopAdsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[TIKTOK_TOP_ADS_FLAG] === '1';
}

// ---- URL table (data only; the witness follow-up edits only this) ----

export const TIKTOK_TOP_ADS_URL_TABLE = {
  host: 'ads.tiktok.com',
  /** Every allowed list URL and every permitted redirect stays under this path prefix. */
  pathPrefix: '/business/creativecenter/inspiration/topads/',
  /** The path the lane requests. */
  path: '/business/creativecenter/inspiration/topads/pc/vi',
  /** Exact fixed parameters; the keyword parameter is the only other allowed name. */
  fixedParams: [['period', '30'], ['region', 'VN']],
  keywordParam: 'keyword',
  /** Login/verify paths on these hosts stop the lane as LOGIN_REQUIRED/CAPTCHA; any other off-target URL is BLOCKED. */
  stopHostSuffix: 'tiktok.com',
  loginPathWords: ['login', 'signin', 'sign-in', 'passport'],
  verifyPathWords: ['verify', 'captcha', 'challenge', 'security-check'],
} as const;

const URL_KEYS = [...TIKTOK_TOP_ADS_URL_TABLE.fixedParams.map(([k]) => k), TIKTOK_TOP_ADS_URL_TABLE.keywordParam];

/** The product keyword as the lane uses it (NFC, single spaces); null when it cannot be read safely. */
export function tiktokKeyword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const k = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return k.length > 0 && k.length <= TIKTOK_TOP_ADS_MAX_KEYWORD_CHARS && /\p{L}/u.test(k) ? k : null;
}

export function tiktokTopAdsUrl(keyword: string): string {
  const url = new URL(`https://${TIKTOK_TOP_ADS_URL_TABLE.host}${TIKTOK_TOP_ADS_URL_TABLE.path}`);
  for (const [k, v] of TIKTOK_TOP_ADS_URL_TABLE.fixedParams) url.searchParams.set(k, v);
  url.searchParams.set(TIKTOK_TOP_ADS_URL_TABLE.keywordParam, keyword);
  return url.toString();
}

/** The keyword of an allowed list URL; null for anything else (other host, path, scheme, port, fragment or parameter). */
export function tiktokTopAdsUrlKeyword(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const t = TIKTOK_TOP_ADS_URL_TABLE;
  if (url.protocol !== 'https:' || url.hostname !== t.host || url.port !== '' || url.username !== '' || url.password !== '' || url.hash !== '') return null;
  if (!url.pathname.startsWith(t.pathPrefix)) return null;
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.length !== URL_KEYS.length || !URL_KEYS.every(k => keys.includes(k))) return null;
  if (!t.fixedParams.every(([k, v]) => url.searchParams.get(k) === v)) return null;
  const keyword = url.searchParams.get(t.keywordParam) ?? '';
  return tiktokKeyword(keyword) === keyword ? keyword : null;
}

/** The final URL after load: login or verify paths stop; any other host, path or parameter set is a block. */
export function classifyTikTokFinalUrl(value: string): StepTikTokTopAdsStop | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return 'BLOCKED'; }
  const t = TIKTOK_TOP_ADS_URL_TABLE;
  if (url.protocol !== 'https:') return 'BLOCKED';
  const host = url.hostname.toLowerCase();
  if (host === t.stopHostSuffix || host.endsWith(`.${t.stopHostSuffix}`)) {
    const path = url.pathname.toLowerCase();
    if (t.verifyPathWords.some(w => path.includes(w))) return 'CAPTCHA';
    if (t.loginPathWords.some(w => path.includes(w))) return 'LOGIN_REQUIRED';
  }
  return tiktokTopAdsUrlKeyword(value.trim()) === null ? 'BLOCKED' : null;
}

const sameTarget = (requested: string, observed: string): boolean => {
  const a = tiktokTopAdsUrlKeyword(requested);
  return a !== null && tiktokTopAdsUrlKeyword(observed) === a;
};

// ---- profile tables (data only; the witness follow-up edits only these) ----

export const TIKTOK_TOP_ADS_PROFILE_TABLE = {
  profile: TIKTOK_TOP_ADS_PROFILE,
  /** A card starts at a labelled line whose label is one of these; its value is the ad caption or title. */
  captionLabels: ['Ad caption', 'Ad title', 'Caption', 'Nội dung quảng cáo', 'Tiêu đề quảng cáo', 'Chú thích'],
  accountLabels: ['Brand', 'Advertiser', 'Account', 'Thương hiệu', 'Nhà quảng cáo', 'Tài khoản'],
  industryLabels: ['Industry', 'Ngành hàng', 'Ngành'],
  objectiveLabels: ['Objective', 'Mục tiêu quảng cáo', 'Mục tiêu'],
  likeLabels: ['Likes', 'Like', 'Lượt thích'],
  /** Labels whose lines are counted in the fingerprint and never kept. */
  forbiddenLabels: ['CTR', 'Budget', 'Ngân sách', 'Conversion', 'CVR', 'Chuyển đổi', 'Effectiveness', 'Hiệu quả', 'Cost', 'Chi phí', 'CPA', 'CPM', 'CPC', 'ROAS', 'Spend', 'Chi tiêu'],
  /** A kept value must not carry any of these (case-insensitive); a caption that does refuses its card. */
  forbiddenValuePattern: String.raw`[%％٪]|(?<!\p{L})(?:ctr|cvr|cpa|cpm|cpc|roas|budget|conversions?|effectiveness|cost|spend|google|gemini)(?!\p{L})|ngân sách|chuyển đổi|hiệu quả|chi phí|chi tiêu`,
  /** Unwitnessed markdown formatting is refused rather than copied as if it were visible text. */
  nonLiteralPattern: String.raw`\*|__|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}])|~~|\x60|!?\[[^\]]*\](?:\(|\[)|<[^>]*>|&(?:#\w+|\w+);`,
  /** The like-count literal as shown; anything else is not kept. */
  likeValuePattern: String.raw`^\d{1,4}(?:[.,]\d{1,3})*(?:\s?(?:K|M|B|N|Tr|nghìn|triệu))?$`,
  /** A labelled line: optional list mark and bold around the label, then a colon. */
  labelLinePattern: String.raw`^[ \t]*(?:[-*+][ \t]+)?(?:\*\*)?([^\n:*]{1,40}?)(?:\*\*)?[ \t]*[:：](?:\*\*)?[ \t]*([^\n]*?)[ \t]*$`,
  /** Case-insensitive patterns for actual forms/interstitials, not navigation or script vocabulary. */
  stopMarkers: [
    { id: 'login-form', where: 'html', pattern: String.raw`<form\b[^>]*\b(?:id|name|class)\s*=\s*["'][^"']*login`, stop: 'LOGIN_REQUIRED' },
    { id: 'login-wall-en', where: 'text', pattern: '(?:log in|please log in|you (?:need to|must) log in)(?: to tiktok)? to (?:continue|access|view)|(?:^|\n)[ \\t]*please log in[ \\t]*(?=\r?\n|$)', stop: 'LOGIN_REQUIRED' },
    { id: 'login-wall-vi', where: 'text', pattern: '(?:đăng nhập|vui lòng đăng nhập|bạn cần đăng nhập)(?: vào tiktok)? để (?:tiếp tục|truy cập|xem)|(?:^|\n)[ \\t]*vui lòng đăng nhập[ \\t]*(?=\r?\n|$)', stop: 'LOGIN_REQUIRED' },
    { id: 'captcha-box', where: 'html', pattern: String.raw`<(?:div|iframe|form)\b[^>]*\b(?:id|class)\s*=\s*["'][^"']*(?:captcha_verify|captcha-verify|secsdk-captcha|verify-bar)`, stop: 'CAPTCHA' },
    { id: 'verify-en', where: 'text', pattern: 'verify to continue|drag the slider|drag the puzzle|complete the puzzle|select 2 objects|confirm you[\'’]re human', stop: 'CAPTCHA' },
    { id: 'verify-vi', where: 'text', pattern: 'xác minh để tiếp tục|kéo thanh trượt|kéo mảnh ghép|hoàn thành câu đố|xác nhận bạn là con người', stop: 'CAPTCHA' },
    { id: 'blocked-en', where: 'text', pattern: 'temporarily blocked|access denied|too many requests|rate limit exceeded|visiting too frequently|not available in your region', stop: 'BLOCKED' },
    { id: 'blocked-vi', where: 'text', pattern: 'tạm thời bị chặn|bị từ chối truy cập|quá nhiều yêu cầu|truy cập quá thường xuyên|không khả dụng ở khu vực', stop: 'BLOCKED' },
  ],
  /** Viewer-scoped ids only: generic uid/user_id can belong to an advertiser on a logged-out page. */
  viewerIdPatterns: [String.raw`"viewer_id"\s*:\s*"?(\d+)`, String.raw`"(?:viewer|viewerInfo|currentUser|current_user)"\s*:\s*\{[^{}]*?"(?:uid|user_id|core_user_id|id)"\s*:\s*"?(\d+)`],
  viewerStatePatterns: [String.raw`"(?:isLogin|isLoggedIn|is_login|is_logged_in)"\s*:\s*true\b`],
} as const;

type StopMarker = (typeof TIKTOK_TOP_ADS_PROFILE_TABLE.stopMarkers)[number];
type FieldKind = 'caption' | 'account' | 'industry' | 'objective' | 'likes' | 'forbidden';
const T = TIKTOK_TOP_ADS_PROFILE_TABLE;
const LABELS: readonly { readonly text: string; readonly kind: FieldKind }[] = [
  ...T.captionLabels.map(text => ({ text, kind: 'caption' as const })), ...T.accountLabels.map(text => ({ text, kind: 'account' as const })),
  ...T.industryLabels.map(text => ({ text, kind: 'industry' as const })), ...T.objectiveLabels.map(text => ({ text, kind: 'objective' as const })),
  ...T.likeLabels.map(text => ({ text, kind: 'likes' as const })), ...T.forbiddenLabels.map(text => ({ text, kind: 'forbidden' as const })),
];
const labelKey = (s: string): string => s.normalize('NFC').trim().toLowerCase();
const LABEL_BY_KEY = new Map(LABELS.map(l => [labelKey(l.text), l.kind]));
const LINE_RE = new RegExp(T.labelLinePattern, 'dgmu');
const FORBIDDEN_RE = new RegExp(T.forbiddenValuePattern, 'iu');
const NON_LITERAL_RE = new RegExp(T.nonLiteralPattern, 'u');
const safeLiteral = (value: string): boolean => !FORBIDDEN_RE.test(value) && !NON_LITERAL_RE.test(value)
  && !webTextHidden(value) && !containsTechnicalId(value);
const LIKE_RE = new RegExp(T.likeValuePattern, 'u');
const VIEWER_RES = T.viewerIdPatterns.map(p => new RegExp(p, 'gu'));

export function tiktokViewerLoggedIn(html: string): boolean {
  if (T.viewerStatePatterns.some(pattern => new RegExp(pattern, 'u').test(html))) return true;
  for (const re of VIEWER_RES) {
    re.lastIndex = 0;
    for (const m of html.matchAll(re)) if (/[1-9]/u.test(m[1]!)) return true;
  }
  return false;
}
export function tiktokMarkerCounts(html: string, text: string): Record<string, number> {
  const h = html.replace(/<!--[^]*?-->|<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/giu, ''), out: Record<string, number> = {};
  for (const m of T.stopMarkers as readonly StopMarker[]) out[m.id] = [...(m.where === 'html' ? h : text).matchAll(new RegExp(m.pattern, 'giu'))].length;
  return out;
}
export function tiktokMarkerStop(counts: Readonly<Record<string, number>>): StepTikTokTopAdsStop | null {
  for (const m of T.stopMarkers as readonly StopMarker[]) if ((counts[m.id] ?? 0) > 0) return m.stop;
  return null;
}

// ---- read text parser ----

const byteAt = (text: string, index: number): number => Buffer.byteLength(text.slice(0, index), 'utf8');
const span = (text: string, start: number, end: number): StepTikTokTopAdsSpan => ({ start: byteAt(text, start), end: byteAt(text, end) });

export interface TikTokParsedCard {
  readonly caption: StepTikTokTopAdsField;
  readonly account: StepTikTokTopAdsField | null;
  readonly industry: StepTikTokTopAdsField | null;
  readonly objective: StepTikTokTopAdsField | null;
  readonly likes: StepTikTokTopAdsField | null;
}
export interface TikTokReadParse {
  readonly cards: readonly TikTokParsedCard[];
  /** Cards whose caption carried a forbidden figure or was too long; counted, never kept. */
  readonly refusedCards: number;
}
export type TikTokReadParseResult = { readonly ok: true; readonly read: TikTokReadParse; readonly labels: Record<string, number> } | { readonly ok: false; readonly labels: Record<string, number> };

/** Fail-closed read of one list text: no caption-labelled line at all is not a page this profile can read. */
export function parseTikTokTopAds(text: string): TikTokReadParseResult {
  const labels: Record<string, number> = { caption: 0, account: 0, industry: 0, objective: 0, likes: 0, forbidden: 0, unknown: 0, orphan: 0, overflow: 0 };
  const cards: TikTokParsedCard[] = [];
  let refused = 0, current: { -readonly [K in keyof TikTokParsedCard]: TikTokParsedCard[K] } | null = null, skipping = false;
  const flush = (): void => { if (current) cards.push(current); current = null; };
  LINE_RE.lastIndex = 0;
  for (const m of text.matchAll(LINE_RE)) {
    const kind = LABEL_BY_KEY.get(labelKey(m[1]!));
    if (!kind) { labels.unknown!++; continue; }
    labels[kind]!++;
    if (kind === 'forbidden') continue;
    const value = m[2]!, valueStart = m.indices![2]![0];
    const field: StepTikTokTopAdsField | null = value === '' || value.length > TIKTOK_TOP_ADS_MAX_FIELD_CHARS || !safeLiteral(value)
      ? null : { text: value, span: span(text, valueStart, valueStart + value.length) };
    if (kind === 'caption') {
      flush(); skipping = false;
      if (cards.length + refused >= TIKTOK_TOP_ADS_MAX_CARDS_PER_READ) { labels.overflow!++; skipping = true; continue; }
      if (field === null) { refused++; skipping = true; continue; }
      current = { caption: field, account: null, industry: null, objective: null, likes: null };
      continue;
    }
    if (skipping) continue;
    if (!current) { labels.orphan!++; continue; }
    if (current[kind] !== null) continue;
    current[kind] = kind === 'likes' && field !== null && !LIKE_RE.test(field.text) ? null : field;
  }
  flush();
  if (labels.caption === 0) return { ok: false, labels };
  return { ok: true, labels, read: { cards, refusedCards: refused } };
}

/** L9 meaning filter on each caption against the product keyword; only INCLUDED captions are listed. */
export function tiktokCaptionsMatch(keyword: string, captions: readonly string[]): boolean[] {
  if (captions.length === 0) return [];
  const result = filterKeywordMeanings({ contractVersion: 'l9-keyword-data-v1', dataVersion: TIKTOK_TOP_ADS_PROFILE,
    category: 'tiktok-top-ads-caption', provenance: 'OPERATOR_SUPPLIED', keywords: [keyword], exclusions: [] },
  captions.map((text, i) => ({ recordId: String(i), text, contextText: null })));
  return captions.map((_, i) => result.results[i]?.decision === 'INCLUDED');
}

/** Cards of one read split by the meaning filter. */
export function tiktokSelectCards(keyword: string, readIndex: number, parsed: TikTokReadParse): { cards: StepTikTokTopAdsCard[]; dropped: number } {
  const keep = tiktokCaptionsMatch(keyword, parsed.cards.map(c => c.caption.text));
  const cards = parsed.cards.filter((_, i) => keep[i]).map(c => ({ read: readIndex, ...c }));
  return { cards, dropped: parsed.cards.length - cards.length };
}

// ---- process adapter ----

export function tiktokTopAdsEnv(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOW_LIST) {
    const value = source[key] ?? (key === 'PATH' ? source.Path : undefined);
    if (typeof value === 'string' && value !== '') env[key] = value;
  }
  env.OPENCLI_BROWSER_COMMAND_TIMEOUT = TIKTOK_TOP_ADS_BROWSER_COMMAND_TIMEOUT;
  return env;
}

type CommandOutcome = { readonly kind: 'OK'; readonly stdout: string } | { readonly kind: 'FAILED' } | { readonly kind: 'CANCELLED' };
const isAbort = (error: unknown): boolean => isRecord(error) && (error.code === 'ABORT_ERR' || error.name === 'AbortError');
function errorEnvelope(stdout: string): boolean {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return false;
  try { const json = JSON.parse(trimmed) as unknown; return isRecord(json) && json.error !== undefined; } catch { return false; }
}

export interface TikTokTopAdsSourceOptions {
  readonly createRunner?: (signal?: AbortSignal) => MetricOpenCliProcessRunner;
  readonly clock?: MetaAutoClock;
  readonly now?: () => Date;
  readonly executable?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam: the planned list URLs for a keyword. Production plans one open. */
  readonly plan?: (keyword: string) => readonly string[];
  readonly commandTimeoutMs?: number;
}
export interface TikTokTopAdsInput { readonly keyword: string }
export interface TikTokTopAdsFingerprint {
  readonly profile: typeof TIKTOK_TOP_ADS_PROFILE;
  readonly htmlBytes: number;
  readonly textBytes: number;
  readonly textTruncated: boolean;
  readonly markers: Record<string, number>;
  /** Label line counts per kind, including unknown labels (recorded, never interpreted). */
  readonly labels: Record<string, number>;
}
export interface TikTokTopAdsReadCapture {
  readonly read: StepTikTokTopAdsRead;
  /** Retained text (capped at 1 MiB); null when nothing of the read is kept. */
  readonly text: string | null;
  readonly fingerprint: TikTokTopAdsFingerprint | null;
}
export interface TikTokTopAdsCollection {
  readonly status: StepTikTokTopAdsStatus;
  readonly stop: StepTikTokTopAdsStop | null;
  readonly reasonVi: string | null;
  readonly keyword: string | null;
  readonly opens: number;
  readonly reads: readonly TikTokTopAdsReadCapture[];
  readonly cards: readonly StepTikTokTopAdsCard[];
  readonly droppedCards: number;
  readonly refusedCards: number;
}
export interface TikTokTopAdsSource {
  collect(input: TikTokTopAdsInput, options?: { readonly signal?: AbortSignal }): Promise<TikTokTopAdsCollection>;
}

export const TIKTOK_TOP_ADS_LOGGED_IN_REASON = 'Trình duyệt dùng chung đang đăng nhập TikTok; cần đăng xuất trước khi máy tự đọc trang quảng cáo nổi bật.';
export function tiktokTopAdsStopReason(stop: StepTikTokTopAdsStop): string {
  switch (stop) {
    case 'CAPTCHA': return 'Trang quảng cáo nổi bật của TikTok yêu cầu xác minh nên máy dừng đọc ngay.';
    case 'LOGIN_REQUIRED': return 'Trang quảng cáo nổi bật của TikTok yêu cầu đăng nhập nên máy dừng đọc ngay.';
    case 'BLOCKED': return 'Trang quảng cáo nổi bật của TikTok tạm chặn lượt đọc nên máy dừng đọc ngay.';
    case 'UI_CHANGED': return 'Trang quảng cáo nổi bật của TikTok đã đổi cách hiển thị; máy chưa đọc được và đã lưu bản đọc để kiểm tra.';
    case 'LOGGED_IN_SESSION_PRESENT': return TIKTOK_TOP_ADS_LOGGED_IN_REASON;
  }
}

export function createTikTokTopAdsSource(options: TikTokTopAdsSourceOptions = {}): TikTokTopAdsSource {
  const createRunner = options.createRunner ?? ((signal?: AbortSignal) => createMetricOpenCliProcessRunner({ ...(signal ? { signal } : {}), streamCapBytes: TIKTOK_TOP_ADS_STREAM_CAP_BYTES }));
  const clock = options.clock ?? realMetaAutoClock;
  const now = options.now ?? (() => new Date());
  const executable = options.executable ?? 'opencli';
  const plan = options.plan ?? ((keyword: string) => [tiktokTopAdsUrl(keyword)]);
  const timeoutMs = options.commandTimeoutMs ?? TIKTOK_TOP_ADS_COMMAND_TIMEOUT_MS;

  return {
    async collect(input, callOptions = {}) {
      const signal = callOptions.signal;
      const keyword = tiktokKeyword(input.keyword);
      const empty = (status: StepTikTokTopAdsStatus): TikTokTopAdsCollection => ({ status, stop: null, reasonVi: null, keyword, opens: 0, reads: [], cards: [], droppedCards: 0, refusedCards: 0 });
      if (keyword === null) return empty('NO_KEYWORD');
      if (signal?.aborted) return empty('CANCELLED');
      const urls = plan(keyword);
      const env = tiktokTopAdsEnv(options.env ?? process.env);

      const command = async (args: readonly string[], commandSignal: AbortSignal | undefined): Promise<CommandOutcome> => {
        if (commandSignal?.aborted) return { kind: 'CANCELLED' };
        let execution: Awaited<ReturnType<MetricOpenCliProcessRunner>>;
        try {
          execution = await createRunner(commandSignal)(executable, ['browser', TIKTOK_TOP_ADS_SESSION, ...args, '--window', 'background'], { shell: false, detached: true, env });
        } catch (error) { return isAbort(error) ? { kind: 'CANCELLED' } : { kind: 'FAILED' }; }
        const kill = (): void => {
          try { execution.child.killGroup?.('SIGKILL'); } catch { /* gone */ }
          try { execution.child.kill('SIGKILL'); } catch { /* gone */ }
        };
        let onAbort: (() => void) | undefined;
        const aborted = new Promise<'ABORTED'>(resolve => {
          onAbort = () => { kill(); resolve('ABORTED'); };
          commandSignal?.addEventListener('abort', onAbort, { once: true });
          if (commandSignal?.aborted) onAbort();
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<'TIMEOUT'>(resolve => { timer = setTimeout(() => resolve('TIMEOUT'), timeoutMs); timer.unref?.(); });
        try {
          const result = await Promise.race([execution.completion, timedOut, aborted]);
          if (result === 'ABORTED') return { kind: 'CANCELLED' };
          if (result === 'TIMEOUT') { kill(); return { kind: 'FAILED' }; }
          if (commandSignal?.aborted) return { kind: 'CANCELLED' };
          return result.exitCode === 0 && !errorEnvelope(result.stdout) ? { kind: 'OK', stdout: result.stdout } : { kind: 'FAILED' };
        } catch (error) {
          return isAbort(error) || commandSignal?.aborted ? { kind: 'CANCELLED' } : { kind: 'FAILED' };
        } finally {
          if (timer) clearTimeout(timer);
          if (onAbort) commandSignal?.removeEventListener('abort', onAbort);
        }
      };

      const extractText = async (requestedUrl: string): Promise<{ text: string; truncated: boolean; finalUrl: string; stop: StepTikTokTopAdsStop | null } | CommandOutcome> => {
        let text = '', start = 0, finalUrl = requestedUrl;
        for (let chunk = 0; chunk < MAX_EXTRACT_CHUNKS; chunk++) {
          const out = await command(['extract', '--start', String(start)], signal);
          if (out.kind !== 'OK') return out;
          let json: unknown;
          try { json = JSON.parse(out.stdout); } catch { return { kind: 'FAILED' }; }
          if (!isRecord(json) || typeof json.content !== 'string' || typeof json.url !== 'string') return { kind: 'FAILED' };
          finalUrl = json.url.trim();
          const stop = classifyTikTokFinalUrl(finalUrl) ?? (sameTarget(requestedUrl, finalUrl) ? null : 'BLOCKED');
          if (stop) return { text, truncated: false, finalUrl, stop };
          text += json.content;
          const full = Buffer.from(text, 'utf8');
          if (full.byteLength > TIKTOK_TOP_ADS_TEXT_CAP_BYTES) {
            let end = TIKTOK_TOP_ADS_TEXT_CAP_BYTES;
            while (end > 0 && (full[end]! & 0xc0) === 0x80) end--;
            text = full.subarray(0, end).toString('utf8');
            return { text, truncated: true, finalUrl, stop: tiktokMarkerStop(tiktokMarkerCounts('', text)) };
          }
          const textStop = tiktokMarkerStop(tiktokMarkerCounts('', text));
          if (textStop) return { text, truncated: false, finalUrl, stop: textStop };
          const next = json.next_start_char;
          if (next === null || next === undefined) return { text, truncated: false, finalUrl, stop: null };
          if (typeof next !== 'number' || !Number.isSafeInteger(next) || next <= start) return { kind: 'FAILED' };
          start = next;
        }
        return { text, truncated: true, finalUrl, stop: null };
      };

      return withOpenCliBrowserLock(signal, async () => {
        const reads: TikTokTopAdsReadCapture[] = [], cards: StepTikTokTopAdsCard[] = [];
        let opens = 0, lastOpenAt: number | null = null, stop: StepTikTokTopAdsStop | null = null, cancelled = false, spawned = false, dropped = 0, refused = 0, readOk = 0;

        type ReadDone = { kind: 'READ'; index: number; text: string; truncated: boolean } | { kind: 'STOP' } | { kind: 'FAILED' } | { kind: 'CANCELLED' };
        const record = (capture: TikTokTopAdsReadCapture): number => { reads.push(capture); return reads.length - 1; };
        const bare = (requestedUrl: string, outcome: StepTikTokTopAdsRead['outcome']): StepTikTokTopAdsRead => ({
          requestedUrl, finalUrl: null, outcome, stop: null, retained: false, textSha256: null, textBytes: null, readAt: now().toISOString() });

        const readOnce = async (url: string): Promise<ReadDone> => {
          if (tiktokTopAdsUrlKeyword(url) !== keyword) return { kind: 'FAILED' };
          if (!Number.isFinite(clock.monotonicMs())) return { kind: 'FAILED' };
          if (lastOpenAt !== null) {
            const wait = lastOpenAt + TIKTOK_TOP_ADS_SPACING_MS - clock.monotonicMs();
            if (wait > 0) { try { await clock.sleep(wait, signal); } catch { /* treated as abort below */ } }
            if (signal?.aborted || clock.monotonicMs() < lastOpenAt + TIKTOK_TOP_ADS_SPACING_MS) return { kind: 'CANCELLED' };
          }
          if (signal?.aborted) return { kind: 'CANCELLED' };
          const openAt = clock.monotonicMs();
          if (!Number.isFinite(openAt) || (lastOpenAt !== null && openAt < lastOpenAt + TIKTOK_TOP_ADS_SPACING_MS)) return { kind: 'FAILED' };
          lastOpenAt = openAt; opens++; spawned = true;
          const steps: (readonly string[])[] = [['open', url], ['wait', 'time', '10'], ['get', 'url'], ['get', 'html', '--max', String(TIKTOK_TOP_ADS_HTML_MAX_CHARS)]];
          const outputs: string[] = [];
          let urlStop: StepTikTokTopAdsStop | null = null;
          for (const args of steps) {
            const res = await command(args, signal);
            if (res.kind !== 'OK') {
              if (urlStop && res.kind !== 'CANCELLED') { record({ read: { ...bare(url, 'STOPPED'), stop: urlStop }, text: null, fingerprint: null }); return { kind: 'STOP' }; }
              record({ read: bare(url, res.kind), text: null, fingerprint: null });
              return { kind: res.kind };
            }
            outputs.push(res.stdout);
            if (args[0] === 'get' && args[1] === 'url') {
              const observed = res.stdout.trim();
              urlStop = classifyTikTokFinalUrl(observed) ?? (sameTarget(url, observed) ? null : 'BLOCKED');
              if (urlStop) stop = urlStop;
            }
          }
          const html = outputs[3]!;
          // Check the viewer before extracting any visible text from a signed-in session.
          if (tiktokViewerLoggedIn(html)) {
            stop = 'LOGGED_IN_SESSION_PRESENT';
            record({ read: { ...bare(url, 'STOPPED'), stop }, text: null, fingerprint: null });
            return { kind: 'STOP' };
          }
          const observedUrl = outputs[2]!.trim();
          const htmlStop = tiktokMarkerStop(tiktokMarkerCounts(html, ''));
          if (htmlStop && !urlStop) stop = htmlStop;
          const extracted = await extractText(urlStop ? observedUrl : url);
          if ('kind' in extracted) {
            const k = extracted.kind === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
            const halt = urlStop ?? htmlStop;
            if (halt && k !== 'CANCELLED') { record({ read: { ...bare(url, 'STOPPED'), stop: halt }, text: null, fingerprint: null }); return { kind: 'STOP' }; }
            record({ read: bare(url, k), text: null, fingerprint: null });
            return { kind: k };
          }
          const text = extracted.text, markers = tiktokMarkerCounts(html, text), textBytes = Buffer.byteLength(text, 'utf8');
          const fingerprint: TikTokTopAdsFingerprint = { profile: TIKTOK_TOP_ADS_PROFILE, htmlBytes: Buffer.byteLength(html, 'utf8'), textBytes,
            textTruncated: extracted.truncated, markers, labels: parseTikTokTopAds(text).labels };
          const retained = { finalUrl: extracted.finalUrl.slice(0, 2048), retained: true, textSha256: sha(Buffer.from(text, 'utf8')), textBytes };
          const halt = urlStop ?? htmlStop ?? extracted.stop ?? tiktokMarkerStop(markers);
          if (halt) {
            stop = halt;
            record({ read: { ...bare(url, 'STOPPED'), ...retained, stop: halt }, text, fingerprint });
            return { kind: 'STOP' };
          }
          return { kind: 'READ', index: record({ read: { ...bare(url, 'READ'), ...retained }, text, fingerprint }), text, truncated: extracted.truncated };
        };

        try {
          for (const url of urls) {
            if (stop || cancelled || opens >= TIKTOK_TOP_ADS_MAX_OPENS) break;
            const done = await readOnce(url);
            if (done.kind === 'CANCELLED') { cancelled = true; break; }
            if (done.kind !== 'READ') continue;
            const parsed = parseTikTokTopAds(done.text);
            // A cut-off field or card cannot be treated as a complete visible literal.
            if (!parsed.ok || done.truncated) {
              stop = 'UI_CHANGED';
              const prior = reads[done.index]!;
              reads[done.index] = { ...prior, read: { ...prior.read, outcome: 'UI_CHANGED', stop: 'UI_CHANGED' } };
              continue;
            }
            readOk++;
            const picked = tiktokSelectCards(keyword, done.index, parsed.read);
            cards.push(...picked.cards); dropped += picked.dropped; refused += parsed.read.refusedCards;
          }
        } finally {
          // Cleanup gets a fresh attempt even after cancellation; a new cancellation during close still kills it.
          if (spawned) await command(['close'], signal?.aborted ? undefined : signal);
        }
        cancelled ||= signal?.aborted ?? false;
        const status: StepTikTokTopAdsStatus = cancelled ? 'CANCELLED' : stop ? 'STOPPED' : cards.length > 0 ? 'OK' : readOk > 0 ? 'NO_DATA' : 'FAILED';
        return { status, stop, reasonVi: stop ? tiktokTopAdsStopReason(stop) : null, keyword, opens, reads, cards: stop || cancelled ? [] : cards,
          droppedCards: stop || cancelled ? 0 : dropped, refusedCards: stop || cancelled ? 0 : refused };
      }, () => empty('CANCELLED'));
    },
  };
}

// ---- step document, evidence and verification ----

const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/u;
export interface TikTokTopAdsEvidenceRef { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string }

export function tiktokTopAdsDocument(collection: TikTokTopAdsCollection, evidence: TikTokTopAdsEvidenceRef | null): StepTikTokTopAds {
  const reads = collection.reads.map(r => (evidence === null && r.read.retained
    ? { ...r.read, retained: false, finalUrl: null, textSha256: null, textBytes: null } : r.read));
  // Without stored evidence the document keeps no cards or counts.
  const kept = evidence !== null;
  const status: StepTikTokTopAdsStatus = collection.status === 'OK' && !kept ? 'FAILED' : collection.status === 'NO_DATA' && !kept ? 'FAILED' : collection.status;
  return { profile: TIKTOK_TOP_ADS_PROFILE, status, stop: collection.stop, reasonVi: collection.reasonVi, keyword: collection.keyword, opens: collection.opens,
    evidence: evidence ? { packageId: evidence.packageId, manifestArtifactSha256: evidence.manifestArtifactSha256, packageContentSha256: evidence.packageContentSha256 } : null,
    reads, cards: kept ? collection.cards : [], droppedCards: kept ? collection.droppedCards : 0, refusedCards: kept ? collection.refusedCards : 0 };
}
export function tiktokTopAdsFailed(keyword: string | null, status: StepTikTokTopAdsStatus = 'FAILED', opens = 0): StepTikTokTopAds {
  return { profile: TIKTOK_TOP_ADS_PROFILE, status: status === 'OK' || status === 'NO_DATA' ? 'FAILED' : status, stop: null, reasonVi: null,
    keyword: tiktokKeyword(keyword), opens: Math.min(opens, TIKTOK_TOP_ADS_MAX_OPENS), evidence: null, reads: [], cards: [], droppedCards: 0, refusedCards: 0 };
}
export function tiktokTopAdsUsage(opens: number): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'NONE_USED' } };
} {
  return { provider: TIKTOK_TOP_ADS_PROVIDER, usage: { requestsIssued: opens, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } } };
}

const packagePrefix = (runId: string): string => `automation-tiktok-top-ads:${runId}-`;
const collectionBytes = (doc: StepTikTokTopAds): Buffer => Buffer.from(canonicalJson({ ...doc, evidence: null }), 'utf8');
export const tiktokTopAdsBindingSha256 = (runId: string, keyword: string | null): string => sha(canonicalJson({ runId, profile: TIKTOK_TOP_ADS_PROFILE, keyword }));
const readDir = (index: number): string => `reads/${String(index + 1).padStart(2, '0')}-list`;
type FileMeta = SourcePackageIntakeRequest['files'][number];
const fileMeta = (path: string, bytes: Uint8Array, mediaType: string, role: FileMeta['representationRole']): FileMeta => ({ path, sha256: sha(bytes), byteSize: bytes.byteLength,
  mediaType, evidenceFamily: EVIDENCE_FAMILY, representationRole: role, independence: 'non_independent', providerProvenance: 'provider_reported', provenanceBasis: PROVENANCE_BASIS });

function evidenceFiles(doc: StepTikTokTopAds, collection: Pick<TikTokTopAdsCollection, 'reads'>): Map<string, { bytes: Buffer; meta: FileMeta }> {
  const files = new Map<string, { bytes: Buffer; meta: FileMeta }>();
  const put = (path: string, bytes: Buffer, mediaType: string, role: FileMeta['representationRole']): void => { files.set(path, { bytes, meta: fileMeta(path, bytes, mediaType, role) }); };
  put('profile.json', Buffer.from(canonicalJson({ url: TIKTOK_TOP_ADS_URL_TABLE, profile: TIKTOK_TOP_ADS_PROFILE_TABLE }), 'utf8'), 'application/json', 'structured');
  put('collection.json', collectionBytes(doc), 'application/json', 'derived');
  collection.reads.forEach((r, i) => {
    if (!r.read.retained || r.text === null || r.fingerprint === null) return;
    const dir = readDir(i);
    put(`${dir}/url.txt`, Buffer.from(r.read.finalUrl ?? '', 'utf8'), 'text/plain', 'alternate');
    put(`${dir}/text.md`, Buffer.from(r.text, 'utf8'), 'text/markdown', 'primary');
    put(`${dir}/fingerprint.json`, Buffer.from(canonicalJson(r.fingerprint), 'utf8'), 'application/json', 'structured');
  });
  return files;
}

/** The Foundation write the lane needs; the service supplies it under its mutation mutex (same writer as the Meta auto-read). */
export interface TikTokTopAdsWriter {
  intakeAutomationAttachment(input: unknown, files: ReadonlyMap<string, Uint8Array>, bindingSha256: string, budget?: { maxFileBytes: number; maxTotalBytes: number }): Promise<TikTokTopAdsEvidenceRef>;
}
export const tiktokTopAdsHasEvidence = (collection: TikTokTopAdsCollection): boolean => collection.reads.some(r => r.read.retained && r.text !== null);

/** Stores every retained read (final URL, capped text, fingerprint) with the step result it backs. Never raw HTML. */
export async function publishTikTokTopAdsEvidence(writer: TikTokTopAdsWriter, runId: string, collection: TikTokTopAdsCollection): Promise<StepTikTokTopAds> {
  const provisional = tiktokTopAdsDocument(collection, { packageId: 'pending', manifestArtifactSha256: 'pending', packageContentSha256: 'pending' });
  const files = evidenceFiles(provisional, collection);
  const metas = [...files.values()].map(f => f.meta);
  const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: `${packagePrefix(runId)}${sha(collectionBytes(provisional)).slice(0, 16)}`, version: 1,
    sourceLabel: SOURCE_LABEL, sourceAcquiredAt: collection.reads.find(r => r.read.retained)?.read.readAt ?? null, files: [metas[0]!, ...metas.slice(1)] };
  const stored = await writer.intakeAutomationAttachment(request, new Map([...files].map(([path, f]) => [path, f.bytes])), tiktokTopAdsBindingSha256(runId, collection.keyword), TIKTOK_TOP_ADS_READ_BUDGET);
  return tiktokTopAdsDocument(collection, stored);
}

type Reader = Pick<FoundationSourcePackageReader, 'readFinalizedSourcePackage' | 'readAutomationAttachmentOrigin'>;
/** Network-free re-read of the stored evidence: hashes, the stored step copy, and a replay of the parser and meaning filter on every READ. */
export async function verifyTikTokTopAdsEvidence(reader: Reader, doc: StepTikTokTopAds, runId: string): Promise<boolean> {
  try {
    if (!validTikTokTopAds(doc)) return false;
    const ref = doc.evidence;
    if (!ref) return false;
    const source = await reader.readFinalizedSourcePackage(ref.packageId, TIKTOK_TOP_ADS_READ_BUDGET);
    if (source.manifestArtifactSha256 !== ref.manifestArtifactSha256 || source.packageContentSha256 !== ref.packageContentSha256 || source.manifest.version !== 1
      || source.manifest.packageKey !== `${packagePrefix(runId)}${sha(collectionBytes(doc)).slice(0, 16)}`) return false;
    const byPath = new Map(source.files.map(f => [f.path, f]));
    for (const f of source.files) if (sha(f.bytes) !== f.sha256) return false;
    const collection = byPath.get('collection.json');
    if (!collection || !Buffer.from(collection.bytes).equals(collectionBytes(doc))) return false;
    const profile = byPath.get('profile.json');
    if (!profile || Buffer.from(profile.bytes).toString('utf8') !== canonicalJson({ url: TIKTOK_TOP_ADS_URL_TABLE, profile: TIKTOK_TOP_ADS_PROFILE_TABLE })) return false;
    let expectedFiles = 2;
    const cards: StepTikTokTopAdsCard[] = [];
    let dropped = 0, refused = 0;
    for (const [i, read] of doc.reads.entries()) {
      if (!read.retained) continue;
      expectedFiles += 3;
      const dir = readDir(i);
      const url = byPath.get(`${dir}/url.txt`), text = byPath.get(`${dir}/text.md`);
      if (!url || !text || !byPath.has(`${dir}/fingerprint.json`)) return false;
      if (Buffer.from(url.bytes).toString('utf8') !== read.finalUrl || sha(text.bytes) !== read.textSha256 || text.bytes.byteLength !== read.textBytes) return false;
      if (read.outcome !== 'READ') continue;
      const parsed = parseTikTokTopAds(new TextDecoder('utf-8', { fatal: true }).decode(text.bytes));
      if (!parsed.ok) return false;
      const picked = tiktokSelectCards(doc.keyword!, i, parsed.read);
      cards.push(...picked.cards); dropped += picked.dropped; refused += parsed.read.refusedCards;
    }
    if (source.files.length !== expectedFiles) return false;
    const origin = await reader.readAutomationAttachmentOrigin(ref.packageId, TIKTOK_TOP_ADS_READ_BUDGET);
    if (!origin || origin.manifestArtifactSha256 !== source.manifestArtifactSha256 || origin.bindingSha256 !== tiktokTopAdsBindingSha256(runId, doc.keyword)) return false;
    if (doc.status === 'OK' || doc.status === 'NO_DATA') {
      if (canonicalJson({ cards, dropped, refused }) !== canonicalJson({ cards: doc.cards, dropped: doc.droppedCards, refused: doc.refusedCards })) return false;
    }
    return true;
  } catch { return false; }
}

// ---- strict step validator ----

const STATUSES = new Set(['OK', 'NO_DATA', 'NO_KEYWORD', 'STOPPED', 'FAILED', 'CANCELLED']);
const STOPS = new Set(['CAPTCHA', 'LOGIN_REQUIRED', 'BLOCKED', 'UI_CHANGED', 'LOGGED_IN_SESSION_PRESENT']);
const OUTCOMES = new Set(['READ', 'UI_CHANGED', 'STOPPED', 'FAILED', 'CANCELLED']);
const keysExactly = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every(k => k in v);
const nat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const strOrNull = (v: unknown, max: number): boolean => v === null || (typeof v === 'string' && v.length <= max);

function validField(v: unknown, likes = false): boolean {
  if (!isRecord(v) || !keysExactly(v, ['text', 'span']) || typeof v.text !== 'string' || v.text === '' || v.text.length > TIKTOK_TOP_ADS_MAX_FIELD_CHARS) return false;
  if (!safeLiteral(v.text) || (likes && !LIKE_RE.test(v.text))) return false;
  const s = v.span;
  return isRecord(s) && keysExactly(s, ['start', 'end']) && nat(s.start) && nat(s.end) && s.end - s.start === Buffer.byteLength(v.text, 'utf8');
}
const optField = (v: unknown, likes = false): boolean => v === null || validField(v, likes);
function validCard(v: unknown, reads: readonly StepTikTokTopAdsRead[]): boolean {
  if (!isRecord(v) || !keysExactly(v, ['read', 'caption', 'account', 'industry', 'objective', 'likes'])) return false;
  if (!nat(v.read) || v.read >= reads.length || reads[v.read]!.outcome !== 'READ' || !reads[v.read]!.retained) return false;
  return validField(v.caption) && optField(v.account) && optField(v.industry) && optField(v.objective) && optField(v.likes, true);
}
function validRead(v: unknown, keyword: string | null): boolean {
  if (!isRecord(v) || !keysExactly(v, ['requestedUrl', 'finalUrl', 'outcome', 'stop', 'retained', 'textSha256', 'textBytes', 'readAt'])) return false;
  if (typeof v.requestedUrl !== 'string' || keyword === null || tiktokTopAdsUrlKeyword(v.requestedUrl) !== keyword) return false;
  if (!strOrNull(v.finalUrl, 2048) || typeof v.outcome !== 'string' || !OUTCOMES.has(v.outcome) || !(v.stop === null || (typeof v.stop === 'string' && STOPS.has(v.stop)))) return false;
  if (typeof v.retained !== 'boolean' || typeof v.readAt !== 'string' || Number.isNaN(Date.parse(v.readAt))) return false;
  if (v.retained) return typeof v.finalUrl === 'string' && (v.outcome !== 'READ' || sameTarget(v.requestedUrl, v.finalUrl))
    && typeof v.textSha256 === 'string' && HEX64.test(v.textSha256) && nat(v.textBytes) && v.textBytes <= TIKTOK_TOP_ADS_TEXT_CAP_BYTES;
  return v.finalUrl === null && v.textSha256 === null && v.textBytes === null;
}
export function validTikTokTopAds(value: unknown): value is StepTikTokTopAds {
  if (!isRecord(value) || !keysExactly(value, ['profile', 'status', 'stop', 'reasonVi', 'keyword', 'opens', 'evidence', 'reads', 'cards', 'droppedCards', 'refusedCards'])) return false;
  if (value.profile !== TIKTOK_TOP_ADS_PROFILE || typeof value.status !== 'string' || !STATUSES.has(value.status)) return false;
  if (!(value.stop === null || (typeof value.stop === 'string' && STOPS.has(value.stop))) || !strOrNull(value.reasonVi, 400) || (value.stop === null) !== (value.reasonVi === null)) return false;
  if (!(value.keyword === null || (typeof value.keyword === 'string' && tiktokKeyword(value.keyword) === value.keyword))) return false;
  if (!nat(value.opens) || value.opens > TIKTOK_TOP_ADS_MAX_OPENS || !nat(value.droppedCards) || !nat(value.refusedCards)) return false;
  const ev = value.evidence;
  if (!(ev === null || (isRecord(ev) && keysExactly(ev, ['packageId', 'manifestArtifactSha256', 'packageContentSha256']) && typeof ev.packageId === 'string' && ev.packageId.length > 0
    && typeof ev.manifestArtifactSha256 === 'string' && HEX64.test(ev.manifestArtifactSha256) && typeof ev.packageContentSha256 === 'string' && HEX64.test(ev.packageContentSha256)))) return false;
  const reads: unknown = value.reads, cards: unknown = value.cards;
  if (!Array.isArray(reads) || !Array.isArray(cards) || reads.length > TIKTOK_TOP_ADS_MAX_OPENS || cards.length > TIKTOK_TOP_ADS_MAX_OPENS * TIKTOK_TOP_ADS_MAX_CARDS_PER_READ) return false;
  if (!reads.every(r => validRead(r, value.keyword as string | null))) return false;
  if (!cards.every(c => validCard(c, reads as StepTikTokTopAdsRead[]))) return false;
  if (ev === null && (reads.some(r => (r as StepTikTokTopAdsRead).retained) || cards.length > 0 || value.droppedCards !== 0 || value.refusedCards !== 0)) return false;
  if (value.status === 'OK' && cards.length === 0) return false;
  if (value.status !== 'OK' && cards.length > 0) return false;
  if (value.status !== 'OK' && value.status !== 'NO_DATA' && (value.droppedCards !== 0 || value.refusedCards !== 0)) return false;
  if (value.status === 'NO_KEYWORD' && (value.keyword !== null || value.opens !== 0)) return false;
  if (value.status === 'STOPPED' && value.stop === null) return false;
  return true;
}

// ---- report projection (M07 table 7.4, AUTO origin) ----

export const TIKTOK_TOP_ADS_SOURCE_LABEL = 'Quảng cáo nổi bật trên TikTok (máy tự đọc)';
export const TIKTOK_TOP_ADS_SOURCE_NOTE = 'Máy tự đọc trong lượt này, không đăng nhập; quảng cáo do TikTok chọn hiển thị, không phải chi tiêu hay hiệu quả';
export const TIKTOK_TOP_ADS_TABLE_TITLE = 'Quảng cáo nổi bật trên TikTok do máy tự đọc';
export const TIKTOK_TOP_ADS_SRC = 'Trang quảng cáo nổi bật công khai của TikTok, máy tự đọc khi không đăng nhập; chỉ giữ chữ hiển thị trên trang.';
export const TIKTOK_TOP_ADS_CITATION_LABEL = 'Bản tự đọc trang quảng cáo nổi bật của TikTok';
export const TIKTOK_TOP_ADS_MISSING = 'Chưa có';
export const TIKTOK_TOP_ADS_HEADERS = ['Nội dung quảng cáo (nguyên văn)', 'Tài khoản hoặc thương hiệu', 'Ngành', 'Mục tiêu', 'Lượt thích (chữ trên trang)'] as const;
/** Rows listed in the report; the rest are counted in one sentence. */
export const TIKTOK_TOP_ADS_REPORT_ROWS = 10;
export const tiktokTopAdsNote = (readDateDmy: string): string => `Máy tự đọc trang quảng cáo nổi bật của TikTok ngày ${readDateDmy}, không đăng nhập. `
  + 'Đây là quảng cáo TikTok chọn hiển thị lúc đọc, không phải chi tiêu hay hiệu quả. Không đem so hay cộng với số bán trong mẫu.';

export function tiktokTopAdsNotice(status: StepTikTokTopAdsStatus, stop: StepTikTokTopAdsStop | null): string {
  if (status === 'STOPPED' && stop === 'LOGGED_IN_SESSION_PRESENT') return 'Máy dừng đọc vì trình duyệt đang đăng nhập TikTok.';
  if (status === 'STOPPED' && stop === 'UI_CHANGED') return 'Trang đã đổi cách hiển thị nên máy chưa đọc được quảng cáo nào.';
  if (status === 'STOPPED') return 'Máy dừng đọc vì trang yêu cầu đăng nhập, xác minh hoặc tạm chặn.';
  if (status === 'NO_DATA') return 'Máy đọc được trang nhưng chưa có quảng cáo nào khớp nghĩa với từ khoá sản phẩm.';
  if (status === 'CANCELLED') return 'Lượt đọc bị dừng nên chưa có quảng cáo nào.';
  if (status === 'NO_KEYWORD') return 'Lượt này chưa có từ khoá sản phẩm để đọc.';
  return 'Lần này máy chưa đọc được trang quảng cáo nổi bật tự động.';
}

export interface TikTokTopAdsReportRow {
  readonly caption: string;
  readonly account: string | null;
  readonly industry: string | null;
  readonly objective: string | null;
  readonly likes: string | null;
  readonly textSha256: string;
  readonly readAt: string;
}
export interface TikTokTopAdsReportView {
  readonly readDate: string | null;
  readonly rows: readonly TikTokTopAdsReportRow[];
  /** Matching cards beyond the listed rows. */
  readonly moreCards: number;
  /** Cards whose caption did not match the keyword meaning; counted, never listed. */
  readonly droppedCards: number;
  /** Plain-row notice when nothing is listed; null when rows are listed. */
  readonly notice: string | null;
}

/** OK rows need verified evidence; otherwise the table shows one plain row. Never combined with sample numbers. */
export function tiktokTopAdsReportView(doc: StepTikTokTopAds | null | undefined, verified: boolean): TikTokTopAdsReportView | null {
  if (!doc) return null;
  const readDate = doc.reads[0]?.readAt.slice(0, 10) ?? null;
  if (doc.status !== 'OK' || !verified) {
    const notice = doc.status === 'OK' || (doc.status === 'NO_DATA' && !verified) ? 'Bản tự đọc chưa kiểm lại được nên không dùng trong lượt này.' : tiktokTopAdsNotice(doc.status, doc.stop);
    return { readDate, rows: [], moreCards: 0, droppedCards: verified ? doc.droppedCards : 0, notice };
  }
  const rows = doc.cards.slice(0, TIKTOK_TOP_ADS_REPORT_ROWS).map((card): TikTokTopAdsReportRow => {
    const read = doc.reads[card.read]!;
    return { caption: card.caption.text, account: card.account?.text ?? null, industry: card.industry?.text ?? null, objective: card.objective?.text ?? null,
      likes: card.likes?.text ?? null, textSha256: read.textSha256!, readAt: read.readAt };
  });
  return { readDate, rows, moreCards: doc.cards.length - rows.length, droppedCards: doc.droppedCards, notice: null };
}

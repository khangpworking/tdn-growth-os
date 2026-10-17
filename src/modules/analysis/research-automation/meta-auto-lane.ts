// Meta ad library auto-read lane for the automated Market flow (S15, AUTO origin). Off unless the flag is exactly "1".
//
// At COLLECTION the app opens the public Meta ad library in the lane's own browser session for at most two selected brands:
// one keyword-search open to find the brand's page id by an exact normalized name match, then one page open to read that
// page's visible ads. At most 5 opens per run, at least 30 s apart, never logged in, never typing or clicking, no retries.
// Any captcha, checkpoint, login wall or block message stops the whole lane at once. A browser that is logged in to Facebook
// stops the lane and nothing of that read is kept.
//
// Parser profile `meta-ad-library-visible-text-v1` is UNWITNESSED and fail-closed: its label tables are data only, a page
// with no recognised per-ad id label is UI_CHANGED (lane stops, evidence kept), and a date that does not match a known
// form is missing, never guessed. The first canary run is the witness. Raw HTML is used in memory only and never stored.
import { createHash } from 'node:crypto';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { brandLabelOk, brandsFromPick, type SearchAdsBrandInput } from './google-ads-lane.js';
import { filterKeywordMeanings } from '../keyword-meaning-filter.js';
import type { MetricOpenCliProcessRunner } from './metric-opencli-executor.js';
import { createMetricOpenCliProcessRunner } from './metric-opencli-process-runner.js';
import type { StepMetaAuto, StepMetaAutoAd, StepMetaAutoBrand, StepMetaAutoBrandStatus, StepMetaAutoRead, StepMetaAutoSpan, StepMetaAutoStatus, StepMetaAutoStop } from './model.js';
import { withOpenCliBrowserLock } from './opencli-browser-lock.js';
import { isRecord } from './provider-common.js';

export const META_AUTO_FLAG = 'TDN_RESEARCH_META_AUTO_ENABLED';
/** Usage ordinal inside the collection step (10 search ads, 11 official statistics). */
export const META_AUTO_USAGE_ORDINAL = 12;
export const META_AUTO_PROVIDER = 'META-AD-LIBRARY' as const;
export const META_AUTO_PROFILE = 'meta-ad-library-visible-text-v1' as const;
export const META_AUTO_SESSION = 'tdnmeta';
export const META_AUTO_MAX_OPENS = 5;
export const META_AUTO_MAX_BRANDS = 2;
export const META_AUTO_SPACING_MS = 30_000;
export const META_AUTO_TEXT_CAP_BYTES = 1024 * 1024;
export const META_AUTO_HTML_MAX_CHARS = 4_000_000;
export const META_AUTO_COMMAND_TIMEOUT_MS = 90_000;
export const META_AUTO_STREAM_CAP_BYTES = 24 * 1024 * 1024;
export const META_AUTO_BROWSER_COMMAND_TIMEOUT = '60';
export const META_AUTO_READ_BUDGET = { maxFileBytes: 8 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } as const;
const MAX_EXTRACT_CHUNKS = 64;
const ENV_ALLOW_LIST = ['PATH', 'HOME', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR'] as const;
const LIBRARY_HOST = 'www.facebook.com';
const LIBRARY_PATH = '/ads/library/';
const EVIDENCE_FAMILY = 'meta-ad-library-auto-read-v1';
const SOURCE_LABEL = 'Thư viện quảng cáo Meta, máy tự đọc khi không đăng nhập';
const PROVENANCE_BASIS = 'Visible text of the public Meta ad library read by the app without logging in; page chosen by an exact normalized name match, not ownership-verified.';

export function metaAutoEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[META_AUTO_FLAG] === '1';
}

// ---- profile tables (data only; the witness follow-up edits only these) ----

export const META_AUTO_PROFILE_TABLE = {
  profile: META_AUTO_PROFILE,
  idLabels: ['Library ID', 'ID thư viện'],
  startLabels: ['Started running on', 'Bắt đầu chạy vào', 'Bắt đầu chạy từ'],
  /** Longest first; matched only between letter boundaries. Anything else is UNKNOWN. */
  statusWords: [
    { text: 'Không hoạt động', status: 'INACTIVE' },
    { text: 'Đang hoạt động', status: 'ACTIVE' },
    { text: 'Inactive', status: 'INACTIVE' },
    { text: 'Active', status: 'ACTIVE' },
  ],
  monthsEn: { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 },
  dateFormats: [
    { order: 'DMY_EN', pattern: String.raw`(\d{1,2}) ([a-z]+) (\d{4})` },
    { order: 'MDY_EN', pattern: String.raw`([a-z]+) (\d{1,2}), (\d{4})` },
    { order: 'DMY_VI', pattern: String.raw`(\d{1,2}) (?:thg|tháng) (\d{1,2}), (\d{4})` },
  ],
  resultCountWords: ['results', 'result', 'kết quả'],
  candidateAnchorPattern: String.raw`<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([^]*?)</a\s*>`,
  candidateObjectPattern: String.raw`\{[^{}]*"page_id"\s*:[^{}]*\}`,
  /** Case-insensitive patterns for actual forms/interstitials, not navigation or script vocabulary. */
  stopMarkers: [
    { id: 'login-form-id', where: 'html', pattern: String.raw`<form\b[^>]*\bid\s*=\s*["']login_form["']`, stop: 'LOGIN_REQUIRED' },
    { id: 'login-form-name', where: 'html', pattern: String.raw`<form\b[^>]*\bname\s*=\s*["']login["']`, stop: 'LOGIN_REQUIRED' },
    { id: 'login-wall', where: 'text', pattern: 'log in to continue|you must log in|đăng nhập để tiếp tục', stop: 'LOGIN_REQUIRED' },
    { id: 'checkpoint-form', where: 'html', pattern: String.raw`<form\b[^>]*\baction\s*=\s*["'][^"']*/checkpoint/`, stop: 'CAPTCHA' },
    { id: 'checkpoint-text', where: 'text', pattern: 'security checkpoint|kiểm tra bảo mật', stop: 'CAPTCHA' },
    { id: 'captcha-form', where: 'html', pattern: String.raw`<(?:form|iframe)\b[^>]*\b(?:id|name)\s*=\s*["'](?:captcha|captcha_form|captcha-challenge)["']`, stop: 'CAPTCHA' },
    { id: 'captcha', where: 'text', pattern: "please solve this captcha|complete the captcha|confirm you['’]re human|xác nhận bạn là con người|hoàn thành mã xác minh", stop: 'CAPTCHA' },
    { id: 'blocked-en', where: 'text', pattern: 'temporarily blocked', stop: 'BLOCKED' },
    { id: 'too-many-en', where: 'text', pattern: 'too many requests', stop: 'BLOCKED' },
    { id: 'rate-limit-en', where: 'text', pattern: 'rate limit exceeded', stop: 'BLOCKED' },
    { id: 'blocked-vi', where: 'text', pattern: 'tạm thời bị chặn', stop: 'BLOCKED' },
    { id: 'too-many-vi', where: 'text', pattern: 'quá nhiều yêu cầu', stop: 'BLOCKED' },
  ],
  /** A viewer id other than 0 means the shared browser is logged in to Facebook. */
  viewerIdPatterns: ['"USER_ID"\\s*:\\s*"?(\\d+)', '"actorID"\\s*:\\s*"?(\\d+)'],
} as const;

type StopMarker = (typeof META_AUTO_PROFILE_TABLE.stopMarkers)[number];
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const ID_RE = new RegExp(`(?:${META_AUTO_PROFILE_TABLE.idLabels.map(escapeRe).join('|')})\\s*:\\s*(\\d{1,25})(?!\\d)`, 'gu');
const START_RE = new RegExp(`(?:${META_AUTO_PROFILE_TABLE.startLabels.map(escapeRe).join('|')})\\s+`, 'gu');
const STATUS_RE = new RegExp(`(?<!\\p{L})(${META_AUTO_PROFILE_TABLE.statusWords.map(w => escapeRe(w.text)).join('|')})(?!\\p{L})`, 'gu');
const DATE_RES = META_AUTO_PROFILE_TABLE.dateFormats.map(format => ({ ...format, re: new RegExp(`${format.pattern}(?=[ \\t]*(?:\\r?\\n|$))`, 'iuy') }));
const RESULT_RE = new RegExp(`~\\s?\\d[\\d.,]*\\s+(?:${META_AUTO_PROFILE_TABLE.resultCountWords.map(escapeRe).join('|')})(?!\\p{L})`, 'iu');
const VIEWER_RES = META_AUTO_PROFILE_TABLE.viewerIdPatterns.map(p => new RegExp(p, 'gu'));

// ---- URLs ----

const SEARCH_KEYS = ['active_status', 'ad_type', 'country', 'q', 'search_type', 'media_type'] as const;
export function metaSearchUrl(brand: string): string {
  const url = new URL(`https://${LIBRARY_HOST}${LIBRARY_PATH}`);
  url.searchParams.set('active_status', 'all'); url.searchParams.set('ad_type', 'all'); url.searchParams.set('country', 'VN');
  url.searchParams.set('q', brand); url.searchParams.set('search_type', 'keyword_unordered'); url.searchParams.set('media_type', 'all');
  return url.toString();
}
export function metaPageUrl(pageId: string): string {
  if (!/^\d{1,25}$/u.test(pageId)) throw new TypeError('page id must be digits');
  return `https://${LIBRARY_HOST}${LIBRARY_PATH}?view_all_page_id=${pageId}&country=VN`;
}

/** SEARCH or PAGE for an allowed library URL; null for anything else (other host, path, scheme, port, fragment or query key). */
export function metaLibraryUrlKind(value: string): 'SEARCH' | 'PAGE' | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== LIBRARY_HOST || url.port !== '' || url.username !== '' || url.password !== '' || url.hash !== '' || url.pathname !== LIBRARY_PATH) return null;
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) return null;
  const get = (k: string): string | null => url.searchParams.get(k);
  const has = (list: readonly string[]): boolean => keys.length === list.length && list.every(k => keys.includes(k));
  if (has(SEARCH_KEYS)) {
    const q = get('q') ?? '';
    return get('active_status') === 'all' && get('ad_type') === 'all' && get('country') === 'VN' && get('search_type') === 'keyword_unordered'
      && get('media_type') === 'all' && q.trim() !== '' && q.length <= 120 ? 'SEARCH' : null;
  }
  const pageOk = /^\d{1,25}$/u.test(get('view_all_page_id') ?? '') && get('country') === 'VN';
  if (has(['view_all_page_id', 'country'])) return pageOk ? 'PAGE' : null;
  if (has(['view_all_page_id', 'country', 'active_status', 'ad_type'])) return pageOk && get('active_status') === 'all' && get('ad_type') === 'all' ? 'PAGE' : null;
  return null;
}

/** The final URL after load: login or checkpoint paths stop; any other host or path is a block. */
export function classifyFinalUrl(value: string): StepMetaAutoStop | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return 'BLOCKED'; }
  if (url.protocol !== 'https:' || url.hostname !== LIBRARY_HOST) return 'BLOCKED';
  const path = url.pathname.toLowerCase();
  if (path.includes('checkpoint')) return 'CAPTCHA';
  if (path.includes('login')) return 'LOGIN_REQUIRED';
  return metaLibraryUrlKind(value.trim()) === null ? 'BLOCKED' : null;
}

/** A permitted redirect must still describe the requested brand search or the chosen page. */
function sameMetaTarget(requested: string, observed: string): boolean {
  const kind = metaLibraryUrlKind(requested);
  if (!kind || metaLibraryUrlKind(observed) !== kind) return false;
  const key = kind === 'SEARCH' ? 'q' : 'view_all_page_id';
  return new URL(requested).searchParams.get(key) === new URL(observed).searchParams.get(key);
}

export function viewerLoggedIn(html: string): boolean {
  for (const re of VIEWER_RES) {
    re.lastIndex = 0;
    for (const m of html.matchAll(re)) if (/[1-9]/u.test(m[1]!)) return true;
  }
  return false;
}

const countOf = (haystack: string, needle: string): number => {
  let n = 0, i = haystack.indexOf(needle);
  while (i !== -1) { n++; i = haystack.indexOf(needle, i + needle.length); }
  return n;
};
export function markerCounts(html: string, text: string): Record<string, number> {
  const h = html.replace(/<!--[^]*?-->|<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/giu, ''), out: Record<string, number> = {};
  for (const m of META_AUTO_PROFILE_TABLE.stopMarkers as readonly StopMarker[]) {
    out[m.id] = [...(m.where === 'html' ? h : text).matchAll(new RegExp(m.pattern, 'giu'))].length;
  }
  return out;
}
export function markerStop(counts: Readonly<Record<string, number>>): StepMetaAutoStop | null {
  for (const m of META_AUTO_PROFILE_TABLE.stopMarkers as readonly StopMarker[]) if ((counts[m.id] ?? 0) > 0) return m.stop;
  return null;
}

// ---- search page: candidate page ids ----

export interface MetaPageCandidate { readonly pageId: string; readonly name: string | null }
const htmlText = (value: string): string => value.replace(/<[^>]*>/gu, '').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gu,
  entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[entity]!).trim();

export function metaPageCandidates(html: string): MetaPageCandidate[] {
  const out: MetaPageCandidate[] = [];
  // A link's own visible label or fields in the same JSON object supply the name.
  // Nearby unrelated names must never lend their identity to another page id.
  const markup = html.replace(/<!--[^]*?-->|<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/giu, '');
  for (const m of markup.matchAll(new RegExp(META_AUTO_PROFILE_TABLE.candidateAnchorPattern, 'giu'))) {
    try {
      const url = new URL(htmlText(m[1]!), `https://${LIBRARY_HOST}`);
      if (metaLibraryUrlKind(url.toString()) !== 'PAGE') continue;
      const name = htmlText(m[2]!);
      out.push({ pageId: url.searchParams.get('view_all_page_id')!, name: name || null });
    } catch { /* not a permitted page link */ }
  }
  for (const m of html.matchAll(new RegExp(META_AUTO_PROFILE_TABLE.candidateObjectPattern, 'gu'))) {
    try {
      const value: unknown = JSON.parse(m[0]);
      if (isRecord(value) && typeof value.page_id === 'string' && /^\d{1,25}$/u.test(value.page_id))
        out.push({ pageId: value.page_id, name: typeof value.page_name === 'string' ? value.page_name : null });
    } catch { /* not an unambiguous object */ }
  }
  return out;
}

export type MetaPageChoice = { readonly kind: 'PAGE'; readonly pageId: string } | { readonly kind: 'NONE' } | { readonly kind: 'AMBIGUOUS' };
/** L9 preserves Vietnamese diacritics. Whitespace and case alone do not distinguish names. */
export const metaBrandKey = (value: string): string => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
/**
 * The same brand input as the search-ads lane: the top distinct brands of the auto-run pick record, by revenue.
 * E11 peers exist only after REPORTS, so COLLECTION cannot use them. The key keeps diacritics for the exact page-name match.
 */
export function metaBrandsFromPick(pick: unknown): SearchAdsBrandInput[] {
  const out: SearchAdsBrandInput[] = [], seen = new Set<string>();
  for (const { label } of brandsFromPick(pick)) {
    const key = metaBrandKey(label);
    if (seen.has(key)) continue;
    seen.add(key); out.push({ label, key });
    if (out.length === META_AUTO_MAX_BRANDS) break;
  }
  return out;
}
/** The one page id whose nearby page name normalizes exactly to the brand key. A name match is not proof of ownership. */
export function chooseMetaPage(brandKey: string, candidates: readonly MetaPageCandidate[]): MetaPageChoice {
  const exact = candidates.filter(c => c.name !== null && metaBrandKey(c.name) === brandKey);
  const admitted = filterKeywordMeanings({ contractVersion: 'l9-keyword-data-v1', dataVersion: META_AUTO_PROFILE,
    category: 'meta-page-name', provenance: 'OPERATOR_SUPPLIED', keywords: [brandKey], exclusions: [] },
    exact.map((c, i) => ({ recordId: String(i), text: metaBrandKey(c.name!), contextText: null })));
  const ids = new Set(exact.filter((_, i) => admitted.results[i]?.decision === 'INCLUDED').map(c => c.pageId));
  if (ids.size === 0) return { kind: 'NONE' };
  if (ids.size > 1) return { kind: 'AMBIGUOUS' };
  return { kind: 'PAGE', pageId: [...ids][0]! };
}

// ---- page text parser ----

const byteAt = (text: string, index: number): number => Buffer.byteLength(text.slice(0, index), 'utf8');
const span = (text: string, start: number, end: number): StepMetaAutoSpan => ({ start: byteAt(text, start), end: byteAt(text, end) });
const isoDate = (y: number, m: number, d: number): string | null => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};
const monthEn = (word: string): number => (META_AUTO_PROFILE_TABLE.monthsEn as Record<string, number>)[word.toLowerCase()] ?? 0;
function dateAt(text: string, at: number, limit: number): { iso: string; end: number } | null {
  for (const { re, order } of DATE_RES) {
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m || m.index + m[0].length > limit) continue;
    const iso = order === 'DMY_EN' ? isoDate(+m[3]!, monthEn(m[2]!), +m[1]!) : order === 'MDY_EN' ? isoDate(+m[3]!, monthEn(m[1]!), +m[2]!) : isoDate(+m[3]!, +m[2]!, +m[1]!);
    return iso ? { iso, end: m.index + m[0].length } : null;
  }
  return null;
}

export interface MetaAdPageParse {
  readonly ads: readonly StepMetaAutoAd[];
  readonly refusedIds: number;
  readonly resultCount: string | null;
  readonly resultCountSpan: StepMetaAutoSpan | null;
}
export type MetaAdPageParseResult = { readonly ok: true; readonly page: MetaAdPageParse; readonly labels: Record<string, number> } | { readonly ok: false; readonly labels: Record<string, number> };

export function labelCounts(text: string): Record<string, number> {
  const t = text, out: Record<string, number> = {};
  META_AUTO_PROFILE_TABLE.idLabels.forEach((l, i) => { out[`id-${i}`] = countOf(t, l); });
  META_AUTO_PROFILE_TABLE.startLabels.forEach((l, i) => { out[`start-${i}`] = countOf(t, l); });
  META_AUTO_PROFILE_TABLE.statusWords.forEach((w, i) => { out[`status-${i}`] = [...t.matchAll(new RegExp(`(?<!\\p{L})${escapeRe(w.text)}(?!\\p{L})`, 'gu'))].length; });
  out['result-count'] = RESULT_RE.test(t) ? 1 : 0;
  return out;
}

/** Fail-closed read of one page text: no recognised id label at all is not a page this profile can read. */
export function parseMetaAdPage(text: string): MetaAdPageParseResult {
  const labels = labelCounts(text);
  const ids = [...text.matchAll(ID_RE)];
  if (ids.length === 0) return { ok: false, labels };
  const statuses = [...text.matchAll(STATUS_RE)];
  const starts = [...text.matchAll(START_RE)];
  const seen = new Map<string, StepMetaAutoAd>(), refused = new Set<string>();
  ids.forEach((m, i) => {
    const digitsStart = m.index! + m[0].length - m[1]!.length, idEnd = m.index! + m[0].length;
    const prevEnd = i === 0 ? 0 : ids[i - 1]!.index! + ids[i - 1]![0].length;
    const nextStart = i + 1 < ids.length ? ids[i + 1]!.index! : text.length;
    const st = statuses.filter(s => s.index! >= prevEnd && s.index! + s[0].length <= m.index!).at(-1);
    const word = st ? META_AUTO_PROFILE_TABLE.statusWords.find(w => w.text === st[1]) : undefined;
    const label = starts.find(s => s.index! >= idEnd && s.index! + s[0].length <= nextStart);
    const date = label ? dateAt(text, label.index! + label[0].length, nextStart) : null;
    const ad: StepMetaAutoAd = { libraryId: m[1]!, idSpan: span(text, digitsStart, idEnd), status: word?.status ?? 'UNKNOWN',
      statusSpan: st ? span(text, st.index!, st.index! + st[0].length) : null, startedOn: date?.iso ?? null,
      startSpan: date && label ? span(text, label.index! + label[0].length, date.end) : null };
    const prior = seen.get(ad.libraryId);
    if (prior === undefined) { if (!refused.has(ad.libraryId)) seen.set(ad.libraryId, ad); return; }
    if (prior.status !== ad.status || prior.startedOn !== ad.startedOn) { seen.delete(ad.libraryId); refused.add(ad.libraryId); }
  });
  const rc = RESULT_RE.exec(text);
  return { ok: true, labels, page: { ads: [...seen.values()], refusedIds: refused.size, resultCount: rc ? rc[0] : null,
    resultCountSpan: rc ? span(text, rc.index, rc.index + rc[0].length) : null } };
}

// ---- process adapter ----

export interface MetaAutoClock {
  readonly monotonicMs: () => number;
  /** Rejects or resolves early when the signal aborts. */
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}
export const realMetaAutoClock: MetaAutoClock = {
  monotonicMs: () => performance.now(),
  sleep: (ms, signal) => new Promise<void>(resolve => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(done, ms);
    function done(): void { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  }),
};

export function metaAutoEnv(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOW_LIST) {
    const value = source[key] ?? (key === 'PATH' ? source.Path : undefined);
    if (typeof value === 'string' && value !== '') env[key] = value;
  }
  env.OPENCLI_BROWSER_COMMAND_TIMEOUT = META_AUTO_BROWSER_COMMAND_TIMEOUT;
  return env;
}

type CommandOutcome = { readonly kind: 'OK'; readonly stdout: string } | { readonly kind: 'FAILED' } | { readonly kind: 'CANCELLED' };
const isAbort = (error: unknown): boolean => isRecord(error) && (error.code === 'ABORT_ERR' || error.name === 'AbortError');
function errorEnvelope(stdout: string): boolean {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return false;
  try { const json = JSON.parse(trimmed) as unknown; return isRecord(json) && json.error !== undefined; } catch { return false; }
}

export interface MetaAutoSourceOptions {
  readonly createRunner?: (signal?: AbortSignal) => MetricOpenCliProcessRunner;
  readonly clock?: MetaAutoClock;
  readonly now?: () => Date;
  readonly executable?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam; production reads two brands. */
  readonly maxBrands?: number;
  readonly commandTimeoutMs?: number;
}

export interface MetaAutoInput { readonly brands: readonly SearchAdsBrandInput[] }
export interface MetaAutoFingerprint {
  readonly profile: typeof META_AUTO_PROFILE;
  readonly htmlBytes: number;
  readonly textBytes: number;
  readonly textTruncated: boolean;
  readonly candidatePageIds: number;
  readonly markers: Record<string, number>;
  readonly labels: Record<string, number>;
}
export interface MetaAutoReadCapture {
  readonly read: StepMetaAutoRead;
  /** Retained text (capped at 1 MiB); null when nothing of the read is kept. */
  readonly text: string | null;
  readonly fingerprint: MetaAutoFingerprint | null;
}
export interface MetaAutoCollection {
  readonly status: StepMetaAutoStatus;
  readonly stop: StepMetaAutoStop | null;
  readonly reasonVi: string | null;
  readonly opens: number;
  readonly reads: readonly MetaAutoReadCapture[];
  readonly brands: readonly StepMetaAutoBrand[];
}
export interface MetaAutoSource {
  collect(input: MetaAutoInput, options?: { readonly signal?: AbortSignal }): Promise<MetaAutoCollection>;
}

export const META_AUTO_LOGGED_IN_REASON = 'Trình duyệt dùng chung đang đăng nhập Facebook; cần đăng xuất trước khi máy tự đọc thư viện quảng cáo.';
export function metaAutoStopReason(stop: StepMetaAutoStop): string {
  switch (stop) {
    case 'CAPTCHA': return 'Thư viện quảng cáo Meta yêu cầu xác minh nên máy dừng đọc ngay.';
    case 'LOGIN_REQUIRED': return 'Thư viện quảng cáo Meta yêu cầu đăng nhập nên máy dừng đọc ngay.';
    case 'BLOCKED': return 'Thư viện quảng cáo Meta tạm chặn lượt đọc nên máy dừng đọc ngay.';
    case 'UI_CHANGED': return 'Thư viện quảng cáo Meta đã đổi cách hiển thị; máy chưa đọc được và đã lưu bản đọc để kiểm tra.';
    case 'LOGGED_IN_SESSION_PRESENT': return META_AUTO_LOGGED_IN_REASON;
  }
}

const blankBrand = (brand: SearchAdsBrandInput, status: StepMetaAutoBrandStatus): StepMetaAutoBrand => ({ label: brand.label, key: brand.key, status,
  pageId: null, searchRead: null, pageRead: null, resultCount: null, resultCountSpan: null, refusedIds: 0, ads: [] });

export function createMetaAutoSource(options: MetaAutoSourceOptions = {}): MetaAutoSource {
  const createRunner = options.createRunner ?? ((signal?: AbortSignal) => createMetricOpenCliProcessRunner({ ...(signal ? { signal } : {}), streamCapBytes: META_AUTO_STREAM_CAP_BYTES }));
  const clock = options.clock ?? realMetaAutoClock;
  const now = options.now ?? (() => new Date());
  const executable = options.executable ?? 'opencli';
  const maxBrands = options.maxBrands ?? META_AUTO_MAX_BRANDS;
  const timeoutMs = options.commandTimeoutMs ?? META_AUTO_COMMAND_TIMEOUT_MS;

  return {
    async collect(input, callOptions = {}) {
      const signal = callOptions.signal;
      const brands = input.brands.filter(b => brandLabelOk(b.label)).map(b => ({ label: b.label, key: metaBrandKey(b.label) })).slice(0, maxBrands);
      const empty = (status: StepMetaAutoStatus): MetaAutoCollection => ({ status, stop: null, reasonVi: null, opens: 0, reads: [], brands: brands.map(b => blankBrand(b, status === 'CANCELLED' ? 'CANCELLED' : 'NOT_READ')) });
      if (brands.length === 0) return { ...empty('NO_BRANDS'), brands: [] };
      if (signal?.aborted) return empty('CANCELLED');
      const env = metaAutoEnv(options.env ?? process.env);

      const command = async (args: readonly string[], commandSignal: AbortSignal | undefined): Promise<CommandOutcome> => {
        if (commandSignal?.aborted) return { kind: 'CANCELLED' };
        let execution: Awaited<ReturnType<MetricOpenCliProcessRunner>>;
        try {
          execution = await createRunner(commandSignal)(executable, ['browser', META_AUTO_SESSION, ...args, '--window', 'background'], { shell: false, detached: true, env });
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
          if (result === 'TIMEOUT') {
            kill();
            return { kind: 'FAILED' };
          }
          if (commandSignal?.aborted) return { kind: 'CANCELLED' };
          return result.exitCode === 0 && !errorEnvelope(result.stdout) ? { kind: 'OK', stdout: result.stdout } : { kind: 'FAILED' };
        } catch (error) {
          return isAbort(error) || commandSignal?.aborted ? { kind: 'CANCELLED' } : { kind: 'FAILED' };
        } finally {
          if (timer) clearTimeout(timer);
          if (onAbort) commandSignal?.removeEventListener('abort', onAbort);
        }
      };

      const extractText = async (requestedUrl: string): Promise<{ text: string; truncated: boolean; finalUrl: string; stop: StepMetaAutoStop | null } | CommandOutcome> => {
        let text = '', start = 0;
        let finalUrl = requestedUrl;
        for (let chunk = 0; chunk < MAX_EXTRACT_CHUNKS; chunk++) {
          const out = await command(['extract', '--start', String(start)], signal);
          if (out.kind !== 'OK') return out;
          let json: unknown;
          try { json = JSON.parse(out.stdout); } catch { return { kind: 'FAILED' }; }
          if (!isRecord(json) || typeof json.content !== 'string' || typeof json.url !== 'string') return { kind: 'FAILED' };
          finalUrl = json.url.trim();
          const stop = classifyFinalUrl(finalUrl) ?? (sameMetaTarget(requestedUrl, finalUrl) ? null : 'BLOCKED');
          if (stop) return { text, truncated: false, finalUrl, stop };
          text += json.content;
          const full = Buffer.from(text, 'utf8');
          if (full.byteLength > META_AUTO_TEXT_CAP_BYTES) {
            let end = META_AUTO_TEXT_CAP_BYTES;
            while (end > 0 && (full[end]! & 0xc0) === 0x80) end--;
            text = full.subarray(0, end).toString('utf8');
            return { text, truncated: true, finalUrl, stop: markerStop(markerCounts('', text)) };
          }
          const textStop = markerStop(markerCounts('', text));
          if (textStop) return { text, truncated: false, finalUrl, stop: textStop };
          const next = json.next_start_char;
          if (next === null || next === undefined) return { text, truncated: false, finalUrl, stop: null };
          if (typeof next !== 'number' || !Number.isSafeInteger(next) || next <= start) return { kind: 'FAILED' };
          start = next;
        }
        return { text, truncated: true, finalUrl, stop: null };
      };

      return withOpenCliBrowserLock(signal, async () => {
        const reads: MetaAutoReadCapture[] = [], out: StepMetaAutoBrand[] = [];
        let opens = 0, lastOpenAt: number | null = null, stop: StepMetaAutoStop | null = null, cancelled = false, spawned = false;

        type ReadDone = { kind: 'READ'; index: number; html: string; text: string } | { kind: 'STOP'; index: number } | { kind: 'FAILED'; index: number | null } | { kind: 'CANCELLED'; index: number | null };
        const record = (capture: MetaAutoReadCapture): number => { reads.push(capture); return reads.length - 1; };
        const bare = (kind: 'SEARCH' | 'PAGE', brandIndex: number, requestedUrl: string, outcome: StepMetaAutoRead['outcome']): StepMetaAutoRead => ({
          kind, brandIndex, requestedUrl, finalUrl: null, outcome, stop: null, retained: false, textSha256: null, textBytes: null, readAt: now().toISOString() });

        const readOnce = async (kind: 'SEARCH' | 'PAGE', brandIndex: number, url: string): Promise<ReadDone> => {
          if (metaLibraryUrlKind(url) !== kind) return { kind: 'FAILED', index: null };
          if (!Number.isFinite(clock.monotonicMs())) return { kind: 'FAILED', index: null };
          if (lastOpenAt !== null) {
            const wait = lastOpenAt + META_AUTO_SPACING_MS - clock.monotonicMs();
            if (wait > 0) { try { await clock.sleep(wait, signal); } catch { /* treated as abort below */ } }
            if (signal?.aborted || clock.monotonicMs() < lastOpenAt + META_AUTO_SPACING_MS) return { kind: 'CANCELLED', index: null };
          }
          if (signal?.aborted) return { kind: 'CANCELLED', index: null };
          const openAt = clock.monotonicMs();
          if (!Number.isFinite(openAt) || (lastOpenAt !== null && openAt < lastOpenAt + META_AUTO_SPACING_MS)) return { kind: 'FAILED', index: null };
          lastOpenAt = openAt; opens++; spawned = true;
          const steps: (readonly string[])[] = [['open', url], ['wait', 'time', '10'], ['get', 'url'], ['get', 'html', '--max', String(META_AUTO_HTML_MAX_CHARS)]];
          const outputs: string[] = [];
          let urlStop: StepMetaAutoStop | null = null;
          for (const args of steps) {
            const res = await command(args, signal);
            if (res.kind !== 'OK') {
              if (urlStop && res.kind !== 'CANCELLED') return { kind: 'STOP', index: record({ read: { ...bare(kind, brandIndex, url, 'STOPPED'), stop: urlStop }, text: null, fingerprint: null }) };
              return { kind: res.kind, index: record({ read: bare(kind, brandIndex, url, res.kind), text: null, fingerprint: null }) };
            }
            outputs.push(res.stdout);
            if (args[0] === 'get' && args[1] === 'url') {
              const observedUrl = res.stdout.trim();
              urlStop = classifyFinalUrl(observedUrl) ?? (sameMetaTarget(url, observedUrl) ? null : 'BLOCKED');
              if (urlStop) stop = urlStop;
            }
          }
          const html = outputs[3]!;
          // Check the viewer before extracting any visible text from a signed-in session.
          if (viewerLoggedIn(html)) {
            stop = 'LOGGED_IN_SESSION_PRESENT';
            return { kind: 'STOP', index: record({ read: { ...bare(kind, brandIndex, url, 'STOPPED'), stop }, text: null, fingerprint: null }) };
          }
          const observedUrl = outputs[2]!.trim();
          const htmlStop = markerStop(markerCounts(html, ''));
          if (htmlStop && !urlStop) stop = htmlStop;
          const extracted = await extractText(urlStop ? observedUrl : url);
          if ('kind' in extracted) {
            const k = extracted.kind === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
            const halt = urlStop ?? htmlStop;
            if (halt && k !== 'CANCELLED') return { kind: 'STOP', index: record({ read: { ...bare(kind, brandIndex, url, 'STOPPED'), stop: halt }, text: null, fingerprint: null }) };
            return { kind: k, index: record({ read: bare(kind, brandIndex, url, k), text: null, fingerprint: null }) };
          }
          const finalUrl = extracted.finalUrl, text = extracted.text;
          const markers = markerCounts(html, text);
          const textBytes = Buffer.byteLength(text, 'utf8');
          const fingerprint: MetaAutoFingerprint = { profile: META_AUTO_PROFILE, htmlBytes: Buffer.byteLength(html, 'utf8'), textBytes, textTruncated: extracted.truncated,
            candidatePageIds: new Set(metaPageCandidates(html).map(c => c.pageId)).size, markers, labels: labelCounts(text) };
          const retained = { finalUrl: finalUrl.slice(0, 2048), retained: true, textSha256: sha(Buffer.from(text, 'utf8')), textBytes };
          const halt = urlStop ?? htmlStop ?? extracted.stop ?? markerStop(markers);
          if (halt) {
            stop = halt;
            return { kind: 'STOP', index: record({ read: { ...bare(kind, brandIndex, url, 'STOPPED'), ...retained, stop: halt }, text, fingerprint }) };
          }
          return { kind: 'READ', index: record({ read: { ...bare(kind, brandIndex, url, 'READ'), ...retained }, text, fingerprint }), html, text };
        };

        try {
          for (let b = 0; b < brands.length; b++) {
            const brand = brands[b]!;
            if (stop || cancelled) { out.push(blankBrand(brand, 'NOT_READ')); continue; }
            if (opens >= META_AUTO_MAX_OPENS) { out.push(blankBrand(brand, 'NOT_READ')); continue; }
            const search = await readOnce('SEARCH', b, metaSearchUrl(brand.label));
            if (search.kind === 'CANCELLED') { cancelled = true; out.push({ ...blankBrand(brand, 'CANCELLED'), searchRead: search.index }); continue; }
            if (search.kind === 'STOP') { out.push({ ...blankBrand(brand, 'STOPPED'), searchRead: search.index }); continue; }
            if (search.kind === 'FAILED') { out.push({ ...blankBrand(brand, 'READ_FAILED'), searchRead: search.index }); continue; }
            const choice = chooseMetaPage(brand.key, metaPageCandidates(search.html));
            if (choice.kind === 'NONE') { out.push({ ...blankBrand(brand, 'PAGE_NOT_FOUND'), searchRead: search.index }); continue; }
            if (choice.kind === 'AMBIGUOUS') { out.push({ ...blankBrand(brand, 'PAGE_AMBIGUOUS'), searchRead: search.index }); continue; }
            const base = { ...blankBrand(brand, 'NOT_READ'), pageId: choice.pageId, searchRead: search.index };
            if (opens >= META_AUTO_MAX_OPENS) { out.push(base); continue; }
            const page = await readOnce('PAGE', b, metaPageUrl(choice.pageId));
            if (page.kind === 'CANCELLED') { cancelled = true; out.push({ ...base, status: 'CANCELLED', pageRead: page.index }); continue; }
            if (page.kind === 'STOP') { out.push({ ...base, status: 'STOPPED', pageRead: page.index }); continue; }
            if (page.kind === 'FAILED') { out.push({ ...base, status: 'READ_FAILED', pageRead: page.index }); continue; }
            const parsed = parseMetaAdPage(page.text);
            // A readable page with no kept ad (all ids refused) cannot be told apart from a changed layout: same fail-closed path.
            if (!parsed.ok || parsed.page.ads.length === 0) {
              stop = 'UI_CHANGED';
              const prior = reads[page.index]!;
              reads[page.index] = { ...prior, read: { ...prior.read, outcome: 'UI_CHANGED', stop: 'UI_CHANGED' } };
              out.push({ ...base, status: 'UI_CHANGED', pageRead: page.index });
              continue;
            }
            const p = parsed.page;
            out.push({ ...base, status: 'OK', pageRead: page.index, resultCount: p.resultCount, resultCountSpan: p.resultCountSpan, refusedIds: p.refusedIds, ads: p.ads });
          }
        } finally {
          // Cleanup gets a fresh attempt even after cancellation; a new cancellation during close still kills it.
          if (spawned) await command(['close'], signal?.aborted ? undefined : signal);
        }
        cancelled ||= signal?.aborted ?? false;
        const status: StepMetaAutoStatus = cancelled ? 'CANCELLED' : stop ? 'STOPPED' : out.some(b => b.status === 'OK') ? 'OK' : 'NO_DATA';
        return { status, stop, reasonVi: stop ? metaAutoStopReason(stop) : null, opens, reads, brands: out };
      }, () => empty('CANCELLED'));
    },
  };
}

// ---- step document, evidence and verification ----

const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/u;
export interface MetaAutoEvidenceRef { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string }

export function metaAutoDocument(collection: MetaAutoCollection, evidence: MetaAutoEvidenceRef | null): StepMetaAuto {
  const reads = collection.reads.map(r => (evidence === null && r.read.retained
    ? { ...r.read, retained: false, finalUrl: null, textSha256: null, textBytes: null } : r.read));
  // Without stored evidence no brand may carry figures.
  const brands = collection.brands.map(b => (evidence === null && b.status === 'OK'
    ? { ...b, status: 'READ_FAILED' as const, resultCount: null, resultCountSpan: null, refusedIds: 0, ads: [] } : b));
  const status: StepMetaAutoStatus = collection.status === 'OK' && !brands.some(b => b.status === 'OK') ? 'NO_DATA' : collection.status;
  return { profile: META_AUTO_PROFILE, status, stop: collection.stop, reasonVi: collection.reasonVi, opens: collection.opens,
    evidence: evidence ? { packageId: evidence.packageId, manifestArtifactSha256: evidence.manifestArtifactSha256, packageContentSha256: evidence.packageContentSha256 } : null,
    reads, brands };
}
export function metaAutoFailed(status: StepMetaAutoStatus = 'FAILED', opens = 0): StepMetaAuto {
  return { profile: META_AUTO_PROFILE, status: status === 'OK' ? 'FAILED' : status, stop: null, reasonVi: null, opens, evidence: null, reads: [], brands: [] };
}
export function metaAutoUsage(opens: number): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'NONE_USED' } };
} {
  return { provider: META_AUTO_PROVIDER, usage: { requestsIssued: opens, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } } };
}

const metaAutoPackagePrefix = (runId: string): string => `automation-meta-auto:${runId}-`;
const collectionBytes = (doc: StepMetaAuto): Buffer => Buffer.from(canonicalJson({ ...doc, evidence: null }), 'utf8');
export const metaAutoBindingSha256 = (runId: string, brands: readonly Pick<StepMetaAutoBrand, 'label' | 'key'>[]): string =>
  sha(canonicalJson({ runId, profile: META_AUTO_PROFILE, brands: brands.map(b => ({ label: b.label, key: b.key })) }));
const readDir = (index: number, kind: 'SEARCH' | 'PAGE'): string => `reads/${String(index + 1).padStart(2, '0')}-${kind === 'SEARCH' ? 'search' : 'page'}`;
type FileMeta = SourcePackageIntakeRequest['files'][number];
const fileMeta = (path: string, bytes: Uint8Array, mediaType: string, role: FileMeta['representationRole']): FileMeta => ({ path, sha256: sha(bytes), byteSize: bytes.byteLength,
  mediaType, evidenceFamily: EVIDENCE_FAMILY, representationRole: role, independence: 'non_independent', providerProvenance: 'provider_reported', provenanceBasis: PROVENANCE_BASIS });

function evidenceFiles(doc: StepMetaAuto, collection: Pick<MetaAutoCollection, 'reads'> | null): Map<string, { bytes: Buffer; meta: FileMeta }> {
  const files = new Map<string, { bytes: Buffer; meta: FileMeta }>();
  const put = (path: string, bytes: Buffer, mediaType: string, role: FileMeta['representationRole']): void => { files.set(path, { bytes, meta: fileMeta(path, bytes, mediaType, role) }); };
  put('profile.json', Buffer.from(canonicalJson(META_AUTO_PROFILE_TABLE), 'utf8'), 'application/json', 'structured');
  put('collection.json', collectionBytes(doc), 'application/json', 'derived');
  if (collection) collection.reads.forEach((r, i) => {
    if (!r.read.retained || r.text === null || r.fingerprint === null) return;
    const dir = readDir(i, r.read.kind);
    put(`${dir}/url.txt`, Buffer.from(r.read.finalUrl ?? '', 'utf8'), 'text/plain', 'alternate');
    put(`${dir}/text.md`, Buffer.from(r.text, 'utf8'), 'text/markdown', 'primary');
    put(`${dir}/fingerprint.json`, Buffer.from(canonicalJson(r.fingerprint), 'utf8'), 'application/json', 'structured');
  });
  return files;
}

/** The Foundation write the lane needs; the service supplies it under its mutation mutex. */
export interface MetaAutoWriter {
  intakeAutomationAttachment(input: unknown, files: ReadonlyMap<string, Uint8Array>, bindingSha256: string, budget?: { maxFileBytes: number; maxTotalBytes: number }): Promise<MetaAutoEvidenceRef>;
}
export const metaAutoHasEvidence = (collection: MetaAutoCollection): boolean => collection.reads.some(r => r.read.retained && r.text !== null);

/** Stores every retained read (final URL, capped text, fingerprint) with the step result it backs. Never raw HTML. */
export async function publishMetaAutoEvidence(writer: MetaAutoWriter, runId: string, collection: MetaAutoCollection): Promise<StepMetaAuto> {
  const provisional = metaAutoDocument(collection, { packageId: 'pending', manifestArtifactSha256: 'pending', packageContentSha256: 'pending' });
  const files = evidenceFiles(provisional, collection);
  const metas = [...files.values()].map(f => f.meta);
  const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: `${metaAutoPackagePrefix(runId)}${sha(collectionBytes(provisional)).slice(0, 16)}`, version: 1,
    sourceLabel: SOURCE_LABEL, sourceAcquiredAt: collection.reads.find(r => r.read.retained)?.read.readAt ?? null, files: [metas[0]!, ...metas.slice(1)] };
  const stored = await writer.intakeAutomationAttachment(request, new Map([...files].map(([path, f]) => [path, f.bytes])), metaAutoBindingSha256(runId, collection.brands), META_AUTO_READ_BUDGET);
  return metaAutoDocument(collection, stored);
}

type Reader = Pick<FoundationSourcePackageReader, 'readFinalizedSourcePackage' | 'readAutomationAttachmentOrigin'>;
/** Network-free re-read of the stored evidence: hashes, the stored step copy, and a replay of the parser on every OK page. */
export async function verifyMetaAutoEvidence(reader: Reader, doc: StepMetaAuto, runId: string): Promise<boolean> {
  try {
    if (!validMetaAuto(doc)) return false;
    const ref = doc.evidence;
    if (!ref) return false;
    const source = await reader.readFinalizedSourcePackage(ref.packageId, META_AUTO_READ_BUDGET);
    if (source.manifestArtifactSha256 !== ref.manifestArtifactSha256 || source.packageContentSha256 !== ref.packageContentSha256 || source.manifest.version !== 1
      || source.manifest.packageKey !== `${metaAutoPackagePrefix(runId)}${sha(collectionBytes(doc)).slice(0, 16)}`) return false;
    const byPath = new Map(source.files.map(f => [f.path, f]));
    for (const f of source.files) if (sha(f.bytes) !== f.sha256) return false;
    const collection = byPath.get('collection.json');
    if (!collection || !Buffer.from(collection.bytes).equals(collectionBytes(doc))) return false;
    const profile = byPath.get('profile.json');
    if (!profile || Buffer.from(profile.bytes).toString('utf8') !== canonicalJson(META_AUTO_PROFILE_TABLE)) return false;
    const texts = new Map<number, string>();
    let expectedFiles = 2;
    for (const [i, read] of doc.reads.entries()) {
      if (!read.retained) continue;
      expectedFiles += 3;
      const dir = readDir(i, read.kind);
      const url = byPath.get(`${dir}/url.txt`), text = byPath.get(`${dir}/text.md`);
      if (!url || !text || !byPath.has(`${dir}/fingerprint.json`)) return false;
      if (Buffer.from(url.bytes).toString('utf8') !== read.finalUrl || sha(text.bytes) !== read.textSha256 || text.bytes.byteLength !== read.textBytes) return false;
      texts.set(i, new TextDecoder('utf-8', { fatal: true }).decode(text.bytes));
    }
    if (source.files.length !== expectedFiles) return false;
    const origin = await reader.readAutomationAttachmentOrigin(ref.packageId, META_AUTO_READ_BUDGET);
    if (!origin || origin.manifestArtifactSha256 !== source.manifestArtifactSha256 || origin.bindingSha256 !== metaAutoBindingSha256(runId, doc.brands)) return false;
    for (const brand of doc.brands) {
      if (brand.status !== 'OK') continue;
      const text = brand.pageRead === null ? undefined : texts.get(brand.pageRead);
      if (text === undefined) return false;
      const parsed = parseMetaAdPage(text);
      if (!parsed.ok || canonicalJson(parsed.page) !== canonicalJson({ ads: brand.ads, refusedIds: brand.refusedIds, resultCount: brand.resultCount, resultCountSpan: brand.resultCountSpan })) return false;
    }
    return true;
  } catch { return false; }
}

// ---- strict step validator ----

const STATUSES = new Set(['OK', 'NO_DATA', 'NO_BRANDS', 'STOPPED', 'FAILED', 'CANCELLED']);
const STOPS = new Set(['CAPTCHA', 'LOGIN_REQUIRED', 'BLOCKED', 'UI_CHANGED', 'LOGGED_IN_SESSION_PRESENT']);
const BRAND_STATUSES = new Set(['OK', 'PAGE_NOT_FOUND', 'PAGE_AMBIGUOUS', 'UI_CHANGED', 'READ_FAILED', 'STOPPED', 'NOT_READ', 'CANCELLED']);
const OUTCOMES = new Set(['READ', 'UI_CHANGED', 'STOPPED', 'FAILED', 'CANCELLED']);
const DAY = /^\d{4}-\d{2}-\d{2}$/u, DIGITS = /^\d{1,25}$/u;
const keysExactly = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every(k => k in v);
const nat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const validSpan = (v: unknown): boolean => isRecord(v) && keysExactly(v, ['start', 'end']) && nat(v.start) && nat(v.end) && v.end >= v.start;
const optSpan = (v: unknown): boolean => v === null || validSpan(v);
const strOrNull = (v: unknown, max: number): boolean => v === null || (typeof v === 'string' && v.length <= max);
const idxOrNull = (v: unknown, reads: number): boolean => v === null || (nat(v) && v < reads);

function validAd(v: unknown): boolean {
  return isRecord(v) && keysExactly(v, ['libraryId', 'idSpan', 'status', 'statusSpan', 'startedOn', 'startSpan']) && typeof v.libraryId === 'string' && DIGITS.test(v.libraryId)
    && validSpan(v.idSpan) && (v.status === 'ACTIVE' || v.status === 'INACTIVE' || v.status === 'UNKNOWN') && optSpan(v.statusSpan) && (v.status === 'UNKNOWN') === (v.statusSpan === null)
    && (v.startedOn === null || (typeof v.startedOn === 'string' && DAY.test(v.startedOn))) && optSpan(v.startSpan) && (v.startedOn === null) === (v.startSpan === null);
}
function validRead(v: unknown, brands: number): boolean {
  if (!isRecord(v) || !keysExactly(v, ['kind', 'brandIndex', 'requestedUrl', 'finalUrl', 'outcome', 'stop', 'retained', 'textSha256', 'textBytes', 'readAt'])) return false;
  if ((v.kind !== 'SEARCH' && v.kind !== 'PAGE') || !nat(v.brandIndex) || v.brandIndex >= brands || typeof v.requestedUrl !== 'string' || metaLibraryUrlKind(v.requestedUrl) !== v.kind) return false;
  if (!strOrNull(v.finalUrl, 2048) || typeof v.outcome !== 'string' || !OUTCOMES.has(v.outcome) || !(v.stop === null || (typeof v.stop === 'string' && STOPS.has(v.stop)))) return false;
  if (typeof v.retained !== 'boolean' || typeof v.readAt !== 'string' || Number.isNaN(Date.parse(v.readAt))) return false;
  if (v.retained) return typeof v.finalUrl === 'string' && (v.outcome !== 'READ' || sameMetaTarget(v.requestedUrl, v.finalUrl))
    && typeof v.textSha256 === 'string' && HEX64.test(v.textSha256) && nat(v.textBytes) && v.textBytes <= META_AUTO_TEXT_CAP_BYTES;
  return v.finalUrl === null && v.textSha256 === null && v.textBytes === null;
}
function validBrand(v: unknown, reads: number): boolean {
  if (!isRecord(v) || !keysExactly(v, ['label', 'key', 'status', 'pageId', 'searchRead', 'pageRead', 'resultCount', 'resultCountSpan', 'refusedIds', 'ads'])) return false;
  if (!brandLabelOk(v.label) || typeof v.key !== 'string' || metaBrandKey(v.label) !== v.key) return false;
  if (typeof v.status !== 'string' || !BRAND_STATUSES.has(v.status) || !(v.pageId === null || (typeof v.pageId === 'string' && DIGITS.test(v.pageId)))) return false;
  if (!idxOrNull(v.searchRead, reads) || !idxOrNull(v.pageRead, reads) || !strOrNull(v.resultCount, 80) || !optSpan(v.resultCountSpan) || (v.resultCount === null) !== (v.resultCountSpan === null)) return false;
  if (!nat(v.refusedIds) || !Array.isArray(v.ads) || !v.ads.every(validAd) || new Set(v.ads.map(a => (a as StepMetaAutoAd).libraryId)).size !== v.ads.length) return false;
  if (v.status === 'OK') return v.pageId !== null && v.pageRead !== null && v.ads.length > 0;
  return v.ads.length === 0;
}
export function validMetaAuto(value: unknown): value is StepMetaAuto {
  if (!isRecord(value) || !keysExactly(value, ['profile', 'status', 'stop', 'reasonVi', 'opens', 'evidence', 'reads', 'brands'])) return false;
  if (value.profile !== META_AUTO_PROFILE || typeof value.status !== 'string' || !STATUSES.has(value.status)) return false;
  if (!(value.stop === null || (typeof value.stop === 'string' && STOPS.has(value.stop))) || !strOrNull(value.reasonVi, 400) || (value.stop === null) !== (value.reasonVi === null)) return false;
  if (!nat(value.opens) || value.opens > META_AUTO_MAX_OPENS) return false;
  const ev = value.evidence;
  if (!(ev === null || (isRecord(ev) && keysExactly(ev, ['packageId', 'manifestArtifactSha256', 'packageContentSha256']) && typeof ev.packageId === 'string' && ev.packageId.length > 0
    && typeof ev.manifestArtifactSha256 === 'string' && HEX64.test(ev.manifestArtifactSha256) && typeof ev.packageContentSha256 === 'string' && HEX64.test(ev.packageContentSha256)))) return false;
  const reads: unknown = value.reads, brands: unknown = value.brands;
  if (!Array.isArray(reads) || !Array.isArray(brands) || brands.length > 3 || reads.length > META_AUTO_MAX_OPENS) return false;
  if (!reads.every(r => validRead(r, brands.length)) || !brands.every(b => validBrand(b, reads.length))) return false;
  for (const [i, brand] of (brands as StepMetaAutoBrand[]).entries()) {
    const search = brand.searchRead === null ? null : reads[brand.searchRead] as StepMetaAutoRead;
    const page = brand.pageRead === null ? null : reads[brand.pageRead] as StepMetaAutoRead;
    if (search && (search.kind !== 'SEARCH' || search.brandIndex !== i || search.requestedUrl !== metaSearchUrl(brand.label))) return false;
    if (page && (brand.pageId === null || page.kind !== 'PAGE' || page.brandIndex !== i || page.requestedUrl !== metaPageUrl(brand.pageId))) return false;
    if (brand.status === 'OK' && (!search?.retained || search.outcome !== 'READ' || !page?.retained || page.outcome !== 'READ')) return false;
  }
  if (ev === null && reads.some(r => (r as StepMetaAutoRead).retained)) return false;
  if (value.status === 'OK' && !brands.some(b => (b as StepMetaAutoBrand).status === 'OK')) return false;
  return true;
}

// ---- report projection (M07 table 7.2, AUTO origin) ----

export const META_AUTO_SOURCE_LABEL = 'Quảng cáo trên Meta (máy tự đọc)';
export const META_AUTO_SOURCE_NOTE = 'Máy tự đọc trong lượt này, không đăng nhập; trang khớp theo tên, chưa xác minh chủ sở hữu';
export const META_AUTO_TABLE_TITLE = 'Quảng cáo trên Meta do máy tự đọc';
export const META_AUTO_SRC = 'Thư viện quảng cáo của Meta, máy tự đọc khi không đăng nhập; trang khớp theo tên, chưa xác minh chủ sở hữu.';
export const META_AUTO_CITATION_LABEL ='Bản tự đọc thư viện quảng cáo Meta';
export const META_AUTO_NAME_SUFFIX = '(máy tự khớp tên)';
export const META_AUTO_EXCERPT = 'Máy tự đọc, không trích nội dung';
export const META_AUTO_MISSING = 'Chưa có';
export const META_AUTO_SAME_DAY = 'Bắt đầu trong ngày đọc';
export const metaAutoNote = (readDateDmy: string): string => `Máy tự đọc thư viện quảng cáo Meta ngày ${readDateDmy}, không đăng nhập. Trang được khớp với thương hiệu theo tên, chưa xác minh chủ sở hữu. `
  + 'Đây là các quảng cáo hiển thị lúc đọc, không phải mức chi hay kết quả quảng cáo. Số ngày tính theo ngày lịch tới ngày đọc, không chứng minh quảng cáo chạy liên tục. '
  + 'Không đem so hay cộng với số bán trong mẫu.';

export function metaAutoBrandNotice(status: StepMetaAutoBrandStatus, stop: StepMetaAutoStop | null): string {
  switch (status) {
    case 'PAGE_NOT_FOUND': return 'Máy chưa tìm thấy trang Meta trùng tên thương hiệu.';
    case 'PAGE_AMBIGUOUS': return 'Có nhiều trang Meta trùng tên thương hiệu nên máy không chọn trang nào.';
    case 'STOPPED': return stop === 'LOGGED_IN_SESSION_PRESENT' ? 'Máy dừng đọc vì trình duyệt đang đăng nhập Facebook.' : 'Máy dừng đọc vì trang yêu cầu đăng nhập, xác minh hoặc tạm chặn.';
    case 'NOT_READ': return 'Máy chưa đọc tới thương hiệu này trong lượt này.';
    case 'CANCELLED': return 'Lượt đọc bị dừng nên chưa có số liệu.';
    default: return 'Lần này máy chưa đọc được trang này tự động.';
  }
}

export interface MetaAutoReportRow {
  readonly label: string;
  readonly ok: boolean;
  readonly adCount: number | null;
  readonly earliestStart: string | null;
  readonly daysRun: number | null;
  readonly textSha256: string | null;
  readonly readAt: string | null;
  readonly notice: string | null;
}
export interface MetaAutoReportView { readonly readDate: string; readonly rows: readonly MetaAutoReportRow[] }

/**
 * Activity rule (documented, same as 8A): every distinct library id read on the name-matched page counts once, whatever its shown status;
 * ids with conflicting repeats are refused. Days are UTC calendar days from the earliest start date to the read date.
 * OK rows need verified evidence; otherwise they become plain rows.
 */
export function metaAutoReportView(doc: StepMetaAuto | null | undefined, verified: boolean): MetaAutoReportView | null {
  if (!doc || doc.brands.length === 0) return null;
  const firstRead = doc.reads[0]?.readAt;
  if (!firstRead) return null;
  const readDate = firstRead.slice(0, 10);
  const rows = doc.brands.map((brand): MetaAutoReportRow => {
    const page = brand.pageRead === null ? null : doc.reads[brand.pageRead] ?? null;
    if (brand.status !== 'OK' || !verified || !page || !page.textSha256) {
      const notice = brand.status === 'OK' ? 'Bản tự đọc chưa kiểm lại được nên không dùng trong lượt này.' : metaAutoBrandNotice(brand.status, doc.stop);
      return { label: brand.label, ok: false, adCount: null, earliestStart: null, daysRun: null, textSha256: null, readAt: null, notice };
    }
    const starts = brand.ads.map(a => a.startedOn).filter((d): d is string => d !== null).sort();
    const earliest = starts[0] ?? null, day = page.readAt.slice(0, 10);
    const days = earliest === null ? null : Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)) / 86_400_000);
    return { label: brand.label, ok: true, adCount: brand.ads.length, earliestStart: earliest, daysRun: days === null || days < 0 ? null : days, textSha256: page.textSha256, readAt: page.readAt, notice: null };
  });
  return { readDate, rows };
}

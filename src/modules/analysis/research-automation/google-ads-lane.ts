// Public search-ads library lane for the automated Market flow (S17). Off unless the flag is exactly "1".
//
// For the run's top brands, count the ads a brand's own website has in the public search-ads transparency library, shown in
// M07 as table 7.3 beside the Meta table. At most 3 paid calls per run, spaced at least 2 seconds apart, never retried.
// The brand's website comes only from the run's own web search rows; nothing is searched for. Advertiser names, advertiser
// ids, images, links and ad ids are never stored: the library often lists an agency, so only counts, formats and dates are kept.
import { boundedRequest, bytesContainSecret, CaptureLog, defaultProviderTransport, isRecord, parseJson, safeProviderCode, type ProviderTransport } from './provider-common.js';
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';
import type { StepSearchAds, StepSearchAdsBrand, StepSearchAdsBrandStatus, StepSearchAdsStatus } from './model.js';

export const GOOGLE_ADS_FLAG = 'TDN_RESEARCH_GOOGLE_ADS_ENABLED';
/** Usage ordinal inside the collection step (9 Comtrade; 11 is taken by the official-statistics package). */
export const GOOGLE_ADS_USAGE_ORDINAL = 10;
export const GOOGLE_ADS_PROVIDER = 'SERPAPI' as const;
export const GOOGLE_ADS_PROFILE = 'search-ads-v1' as const;
export const GOOGLE_ADS_MAX_BRANDS = 3;
export const GOOGLE_ADS_SPACING_MS = 2_000;
export const GOOGLE_ADS_TIMEOUT_MS = 30_000;
export const GOOGLE_ADS_MAX_BYTES = 8 * 1024 * 1024;
export const GOOGLE_ADS_ORIGIN = 'https://serpapi.com';
export const GOOGLE_ADS_PATH = '/search.json';
export const GOOGLE_ADS_REGION = '2704';
export const GOOGLE_ADS_NUM = 100;
export const GOOGLE_ADS_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_SECONDS = 7 * 3600;

export const SEARCH_ADS_SOURCE_LABEL = 'thư viện quảng cáo công khai của công cụ tìm kiếm';
export const SEARCH_ADS_TABLE_TITLE = 'Quảng cáo trên công cụ tìm kiếm (thư viện quảng cáo công khai)';
export const SEARCH_ADS_NOTE = 'Số ngày hiện là số ngày mẫu quảng cáo được hiển thị, không phải số ngày trả tiền liên tục hay mức chi. Người đăng có thể là đơn vị làm quảng cáo thuê. Không xem được nội dung chữ của quảng cáo. Số này không đem so hay cộng với số bán trong mẫu.';
export const SEARCH_ADS_SOURCE_NOTE = 'Số mẫu quảng cáo của trang web từng thương hiệu; không gồm nội dung chữ và không phải mức chi.';
export const SEARCH_ADS_LIMIT = 'Số mẫu quảng cáo của trang web thương hiệu chỉ là bối cảnh; không phải mức chi và không ghép với số bán của mẫu.';

export function googleAdsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[GOOGLE_ADS_FLAG] === '1';
}

/** A candidate brand taken from the run's sample rows, in revenue order. */
export interface SearchAdsBrandInput { readonly label: string; readonly key: string }
export interface SearchAdsInput {
  /** Distinct brands of the run, best first. Only the first three are used. */
  readonly brands: readonly SearchAdsBrandInput[];
  /** Links of the run's own web search rows. */
  readonly webUrls: readonly string[];
  /** Marketplace hosts that must never be picked (extra to the fixed deny-list). */
  readonly deniedHosts?: readonly string[];
  /** Run period, YYYY-MM-DD, inclusive. */
  readonly periodStartDate: string;
  readonly periodEndDate: string;
}

export interface SearchAdsBrandResult extends Omit<StepSearchAdsBrand, 'captureIndex' | 'retrievedAt' | 'responseSha256'> {
  /** Stored response of this brand's call (any outcome); null when no call was made. */
  readonly capture: ProviderRawCapture | null;
}
export interface SearchAdsCollection {
  readonly status: StepSearchAdsStatus;
  readonly brands: readonly SearchAdsBrandResult[];
  /** Paid requests issued (every call is paid, including a failed or ambiguous one). */
  readonly requests: number;
  readonly ambiguousRequests: number;
}
export interface SearchAdsSource {
  collect(input: SearchAdsInput, options?: ProviderCallOptions): Promise<SearchAdsCollection>;
}

// ---- brands and domains (deterministic, no model) ----

/** NFC, lowercase, Vietnamese diacritics stripped, [a-z0-9] only; null when shorter than 3 characters. */
export function normalizedKey(value: string): string | null {
  const text = value.normalize('NFC').toLowerCase().replace(/đ/gu, 'd').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/gu, '');
  return text.length >= 3 ? text : null;
}

const CONTROL = /[\u0000-\u001f\u007f]/u;
const FORBIDDEN_NAME = /\b(?:google|serpapi|kalodata|tradeint|dami|apify|metric|pageindex|gemini)\b/iu;
/** Brand text may be printed; refuse control characters, percent signs and provider names. */
export const brandLabelOk = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 120 && !CONTROL.test(value) && !value.includes('%') && !FORBIDDEN_NAME.test(value);

/** The top distinct brands of an auto-run pick record, by revenue (a missing revenue sorts last); empty when the record has no usable brand. */
export function brandsFromPick(pick: unknown): SearchAdsBrandInput[] {
  if (!isRecord(pick) || !Array.isArray(pick.links)) return [];
  const rows: { label: string; key: string; revenue: number; order: number }[] = [];
  pick.links.forEach((link, order) => {
    if (!isRecord(link) || typeof link.brand !== 'string') return;
    const label = link.brand.normalize('NFC').trim();
    const key = brandLabelOk(label) ? normalizedKey(label) : null;
    if (key) rows.push({ label, key, revenue: typeof link.revenue === 'number' && Number.isFinite(link.revenue) ? link.revenue : -1, order });
  });
  rows.sort((a, b) => b.revenue - a.revenue || a.order - b.order);
  const seen = new Set<string>(), out: SearchAdsBrandInput[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    out.push({ label: row.label, key: row.key });
    if (out.length === GOOGLE_ADS_MAX_BRANDS) break;
  }
  return out;
}

const DENIED_NAMES = new Set(['shopee', 'lazada', 'tiki', 'tiktok', 'facebook', 'instagram', 'youtube', 'wikipedia']);
export function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/u, '').replace(/^www\./u, '');
    return host.length > 0 && host.includes('.') && /^[a-z0-9.-]+$/u.test(host) ? host : null;
  } catch { return null; }
}
export function hostDenied(host: string, extra: readonly string[] = []): boolean {
  if (host.endsWith('.gov.vn') || host.endsWith('.edu.vn')) return true;
  if (host.split('.').some(label => DENIED_NAMES.has(label))) return true;
  return extra.some(value => { const other = value.toLowerCase().replace(/^www\./u, ''); return other.length > 0 && (host === other || host.endsWith(`.${other}`)); });
}

export type DomainChoice = { readonly kind: 'DOMAIN'; readonly domain: string } | { readonly kind: 'NONE' } | { readonly kind: 'AMBIGUOUS' };
/** The one host whose first label contains the brand key; the most web rows wins, a tie is ambiguous. */
export function chooseDomain(brandKey: string, webUrls: readonly string[], deniedHosts: readonly string[] = []): DomainChoice {
  const counts = new Map<string, number>();
  for (const url of webUrls) {
    const host = hostOf(url);
    if (!host || hostDenied(host, deniedHosts)) continue;
    const first = normalizedKey(host.split('.')[0]!);
    if (first && first.includes(brandKey)) counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  if (counts.size === 0) return { kind: 'NONE' };
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return { kind: 'AMBIGUOUS' };
  return { kind: 'DOMAIN', domain: ranked[0]![0] };
}

// ---- response reading (strict; nothing is repaired) ----

const SECONDS = /^\d{1,11}$/u, DAYS = /^\d{1,6}$/u;
const MAX_SECONDS = 4_102_444_800; // 2100-01-01
const vnDay = (seconds: number): string => new Date((seconds + VN_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);

interface Summary {
  readonly totalResults: number | null;
  readonly creativeCount: number;
  readonly formats: { readonly text: number; readonly image: number; readonly video: number };
  readonly firstShown: string | null;
  readonly lastShown: string | null;
  readonly maxDaysShown: number | null;
  readonly overlapCount: number;
  readonly invalidCount: number;
}
export function summarizeResponse(bytes: Buffer, periodStartDate: string, periodEndDate: string): Summary | null {
  const root = parseJson(bytes);
  if (!isRecord(root) || !isRecord(root.search_metadata) || root.search_metadata.status !== 'Success') return null;
  let totalResults: number | null = null;
  if (root.search_information !== undefined) {
    if (!isRecord(root.search_information)) return null;
    const total = root.search_information.total_results;
    if (total !== undefined) {
      if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) return null;
      totalResults = total;
    }
  }
  const list = root.ad_creatives;
  if (list !== undefined && (!Array.isArray(list) || list.length > GOOGLE_ADS_NUM)) return null;
  const formats = { text: 0, image: 0, video: 0 };
  let invalidCount = 0, count = 0, overlap = 0, minFirst: number | null = null, maxLast: number | null = null, maxDays: number | null = null;
  for (const item of list ?? []) {
    if (!isRecord(item) || (item.format !== 'text' && item.format !== 'image' && item.format !== 'video') ||
        typeof item.first_shown !== 'string' || !SECONDS.test(item.first_shown) || typeof item.last_shown !== 'string' || !SECONDS.test(item.last_shown) ||
        typeof item.total_days_shown !== 'string' || !DAYS.test(item.total_days_shown)) { invalidCount++; continue; }
    const first = Number(item.first_shown), last = Number(item.last_shown), days = Number(item.total_days_shown);
    if (first > MAX_SECONDS || last > MAX_SECONDS || last < first) { invalidCount++; continue; }
    count++;
    formats[item.format]++;
    minFirst = minFirst === null ? first : Math.min(minFirst, first);
    maxLast = maxLast === null ? last : Math.max(maxLast, last);
    maxDays = maxDays === null ? days : Math.max(maxDays, days);
    if (vnDay(first) <= periodEndDate && vnDay(last) >= periodStartDate) overlap++;
  }
  return { totalResults, creativeCount: count, formats, firstShown: minFirst === null ? null : vnDay(minFirst), lastShown: maxLast === null ? null : vnDay(maxLast),
    maxDaysShown: maxDays, overlapCount: overlap, invalidCount };
}

// ---- the lane ----

const skipped = (label: string, domain: string | null, status: StepSearchAdsBrandStatus, reason: string): SearchAdsBrandResult => ({ label, domain, status, reason,
  totalResults: null, creativeCount: null, formats: null, firstShown: null, lastShown: null, maxDaysShown: null, overlapCount: null, invalidCount: null, usageOrdinal: null, capture: null });

/** apiKey is the existing SerpApi key; it is placed only on the request URL and never stored. */
export function createGoogleAdsSource(apiKey: string, transport: ProviderTransport = defaultProviderTransport, timeoutMs = GOOGLE_ADS_TIMEOUT_MS): SearchAdsSource {
  return {
    async collect(input, callOptions = {}) {
      const signal = callOptions.signal;
      const brands = input.brands.slice(0, GOOGLE_ADS_MAX_BRANDS);
      const log = new CaptureLog(GOOGLE_ADS_PROVIDER, transport, undefined, GOOGLE_ADS_MAX_BRANDS);
      const out: SearchAdsBrandResult[] = [];
      let requests = 0, ambiguousRequests = 0, lastEnd: number | null = null;
      const finish = (status: StepSearchAdsStatus): SearchAdsCollection => ({ status, brands: out, requests, ambiguousRequests });
      if (brands.length === 0) return finish('NO_BRANDS');
      if (signal?.aborted) return finish('CANCELLED');
      const pause = async (ms: number): Promise<boolean> => {
        try { await transport.sleep(ms, signal); return !signal?.aborted; } catch { return false; }
      };
      for (const brand of brands) {
        const choice = chooseDomain(brand.key, input.webUrls, input.deniedHosts);
        if (choice.kind === 'NONE') { out.push(skipped(brand.label, null, 'SKIPPED_NO_DOMAIN', 'NO_MATCHING_WEB_ROW')); continue; }
        if (choice.kind === 'AMBIGUOUS') { out.push(skipped(brand.label, null, 'SKIPPED_AMBIGUOUS_DOMAIN', 'TIED_WEB_ROWS')); continue; }
        if (signal?.aborted) { out.push(skipped(brand.label, choice.domain, 'CANCELLED', 'CANCELLED')); return finish('CANCELLED'); }
        if (lastEnd !== null) {
          const wait = lastEnd + GOOGLE_ADS_SPACING_MS - transport.now();
          if (wait > 0 && !(await pause(wait))) { out.push(skipped(brand.label, choice.domain, 'CANCELLED', 'CANCELLED')); return finish('CANCELLED'); }
        }
        const params = { engine: 'google_ads_transparency_center', region: GOOGLE_ADS_REGION, num: String(GOOGLE_ADS_NUM), text: choice.domain } as const;
        const url = new URL(GOOGLE_ADS_ORIGIN + GOOGLE_ADS_PATH);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        url.searchParams.set('api_key', apiKey);
        const context = { operation: 'serpapi.google_ads.transparency' as const, billing: 'PAID_SEARCH_UNLESS_CACHED' as const, method: 'GET' as const,
          endpoint: GOOGLE_ADS_ORIGIN + GOOGLE_ADS_PATH, requestParameters: params, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null };
        requests++;
        const requestedAt = log.timestamp();
        let response: Awaited<ReturnType<typeof boundedRequest>>;
        try {
          response = await boundedRequest(transport, { url, method: 'GET', headers: { Accept: 'application/json' }, body: null, timeoutMs, maxBytes: GOOGLE_ADS_MAX_BYTES, signal });
        } catch { out.push(skipped(brand.label, choice.domain, 'FAILED', 'REQUEST_REFUSED')); continue; }
        lastEnd = transport.now();
        const fail = (reason: string, capture: ProviderRawCapture | null, status: StepSearchAdsBrandStatus = 'FAILED'): void => {
          out.push({ ...skipped(brand.label, choice.domain, status, reason), usageOrdinal: GOOGLE_ADS_USAGE_ORDINAL, capture });
        };
        if (response.kind === 'ABORTED') {
          ambiguousRequests++;
          fail('CANCELLED', log.record(context, requestedAt, 'ABORTED_AMBIGUOUS', null, null, null), 'CANCELLED');
          return finish('CANCELLED');
        }
        if (response.kind === 'TIMEOUT') { ambiguousRequests++; fail('TIMEOUT', log.record(context, requestedAt, 'TIMEOUT_AMBIGUOUS', null, null, null)); continue; }
        if (response.kind === 'TRANSPORT') { ambiguousRequests++; fail('TRANSPORT_ERROR', log.record(context, requestedAt, 'TRANSPORT_AMBIGUOUS', null, null, null)); continue; }
        if (response.kind === 'OVERSIZE') { fail('RESPONSE_TOO_LARGE', log.record(context, requestedAt, 'OVERSIZE', response.status, null, null)); continue; }
        if (response.kind !== 'RECEIVED') { fail('REQUEST_REFUSED', null); continue; }
        if (bytesContainSecret(response.bytes, apiKey)) { fail('CREDENTIAL_ECHO_REFUSED', log.record(context, requestedAt, 'CREDENTIAL_ECHO_REFUSED', response.status, null, null)); continue; }
        const json = parseJson(response.bytes);
        const providerCode = isRecord(json) ? safeProviderCode(json.error_code ?? (isRecord(json.search_metadata) ? json.search_metadata.id : undefined)) : null;
        if (response.status !== 200) { fail('HTTP_ERROR', log.record(context, requestedAt, 'HTTP_ERROR', response.status, response.bytes, providerCode)); continue; }
        const summary = summarizeResponse(response.bytes, input.periodStartDate, input.periodEndDate);
        if (!summary) { fail('INVALID_PAYLOAD', log.record(context, requestedAt, 'INVALID_PAYLOAD', 200, response.bytes, providerCode)); continue; }
        const capture = log.record(context, requestedAt, 'OK', 200, response.bytes, providerCode);
        out.push({ label: brand.label, domain: choice.domain, status: 'OK', reason: null, totalResults: summary.totalResults, creativeCount: summary.creativeCount,
          formats: summary.formats, firstShown: summary.firstShown, lastShown: summary.lastShown, maxDaysShown: summary.maxDaysShown, overlapCount: summary.overlapCount,
          invalidCount: summary.invalidCount, usageOrdinal: GOOGLE_ADS_USAGE_ORDINAL, capture });
      }
      return finish(out.some(item => item.status === 'OK') ? 'OK' : 'NO_DATA');
    },
  };
}

/** The stored step field. `indexes[i]` is the step capture ordinal of `collection.brands[i].capture`, null when it was not stored. */
export function searchAdsDocument(collection: SearchAdsCollection, indexes: readonly (number | null)[]): StepSearchAds {
  const brands: StepSearchAdsBrand[] = collection.brands.map((item, i) => {
    const { capture, ...rest } = item;
    const index = indexes[i] ?? null;
    // Only a response that was stored may back figures; otherwise the brand keeps a status only.
    if (item.status === 'OK' && (index === null || !capture?.responseSha256)) return { ...rest, status: 'FAILED', reason: 'CAPTURE_NOT_STORED', totalResults: null, creativeCount: null,
      formats: null, firstShown: null, lastShown: null, maxDaysShown: null, overlapCount: null, invalidCount: null, captureIndex: null, retrievedAt: null, responseSha256: null };
    return { ...rest, captureIndex: item.status === 'OK' ? index : null, retrievedAt: item.status === 'OK' ? capture!.completedAt : null, responseSha256: item.status === 'OK' ? capture!.responseSha256 : null };
  });
  const status: StepSearchAdsStatus = collection.status === 'OK' && !brands.some(b => b.status === 'OK') ? 'NO_DATA' : collection.status;
  return { profile: GOOGLE_ADS_PROFILE, status, brands };
}

/** No numbers: a status only. */
export function searchAdsFailed(status: StepSearchAdsStatus = 'FAILED'): StepSearchAds {
  return { profile: GOOGLE_ADS_PROFILE, status: status === 'OK' ? 'FAILED' : status, brands: [] };
}

export const searchAdsOkBrands = (value: StepSearchAds | null | undefined): StepSearchAdsBrand[] => (value ? value.brands.filter(b => b.status === 'OK') : []);
/** The one predicate shared by the renderers and the evidence packet: S17 is used only when at least one brand row is drawn. */
export const searchAdsRenderable = (value: StepSearchAds | null | undefined): value is StepSearchAds => searchAdsOkBrands(value).length > 0;

/** One plain sentence per brand whose figures are not drawn, and one for a run without any: no digits, no percent sign. */
export function searchAdsBrandNotice(brand: StepSearchAdsBrand): string {
  switch (brand.status) {
    case 'SKIPPED_NO_DOMAIN': return `${brand.label}: chưa tìm thấy trang web của thương hiệu trong kết quả tìm kiếm của lần chạy này.`;
    case 'SKIPPED_AMBIGUOUS_DOMAIN': return `${brand.label}: có nhiều trang web có thể là của thương hiệu, không chọn được trang nào nên bỏ qua.`;
    case 'CANCELLED': return `${brand.label}: lượt tra bị dừng nên chưa có số liệu.`;
    default: return `${brand.label}: lần này chưa lấy được số liệu từ thư viện quảng cáo công khai.`;
  }
}
export function searchAdsNotice(value: StepSearchAds): string {
  switch (value.status) {
    case 'NO_BRANDS': return 'Lần chạy này chưa có thương hiệu nào đủ rõ để tra thư viện quảng cáo công khai của công cụ tìm kiếm.';
    case 'CANCELLED': return 'Lượt tra thư viện quảng cáo công khai của công cụ tìm kiếm bị dừng nên chưa có số liệu.';
    default: return 'Lần này chưa lấy được số liệu quảng cáo của thương hiệu nào từ thư viện quảng cáo công khai của công cụ tìm kiếm.';
  }
}

/** Every call is paid; an ambiguous one has an unknown outcome. */
export function searchAdsUsage(collection: Pick<SearchAdsCollection, 'requests' | 'ambiguousRequests'>): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'NONE_USED' } };
} {
  return { provider: GOOGLE_ADS_PROVIDER, usage: { requestsIssued: collection.requests, paidRequestsIssued: collection.requests, ambiguousPaidRequests: collection.ambiguousRequests, credits: { status: 'NONE_USED' } } };
}

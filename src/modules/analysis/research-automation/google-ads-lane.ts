// Public search-ads library lane for the automated Market flow (S17). Off unless the flag is exactly "1".
//
// For the run's top brands, count the ads a brand's own website has in the public search-ads transparency library, shown in
// M07 as table 7.3 beside the Meta table. At most 6 paid calls per run (3 site searches and 3 ads reads), spaced at least 2 seconds apart, never retried.
// A website must occur in run rows or one deterministic brand-site search. Advertiser names, advertiser
// ids, images, links and ad ids stay out of the step document: the library often lists an agency, so it keeps only counts, formats and dates.
import { boundedRequest, bytesContainSecret, CaptureLog, defaultProviderTransport, httpsUrl, isRecord, parseJson, safeProviderCode, type ProviderTransport } from './provider-common.js';
import { parse as parseDomain } from 'tldts';
import { createSerpApiProvider } from './provider-serpapi.js';
import { planExpandedSearch, SearchCallBudget, type ExpandedSearchRequest } from './expanded-search-queries.js';
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';
import type { StepSearchAds, StepSearchAdsBrand, StepSearchAdsBrandStatus, StepSearchAdsStatus, SearchAdsBrandV2 } from './model.js';
import { NEWS_DOMAINS, webTextHidden } from './web-page-type.js';

export const GOOGLE_ADS_FLAG = 'TDN_RESEARCH_GOOGLE_ADS_ENABLED';
/** Ads usage remains at 10; 0–16 are occupied by other collection lanes. Discovery uses 17–19. */
export const GOOGLE_ADS_USAGE_ORDINAL = 10;
export const GOOGLE_ADS_PROVIDER = 'SERPAPI' as const;
export const GOOGLE_ADS_DISCOVERY_USAGE_ORDINALS = [17, 18, 19] as const;
export const GOOGLE_ADS_PROFILE = 'search-ads-v2' as const;
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
  /** Links of the run's plain and expanded web rows, ordered by position. */
  readonly webUrls: readonly string[];
  /** Marketplace hosts that must never be picked (extra to the fixed deny-list). */
  readonly deniedHosts?: readonly string[];
  /** Run period, YYYY-MM-DD, inclusive. */
  readonly periodStartDate: string;
  readonly periodEndDate: string;
}

export interface SearchAdsBrandResult extends Omit<SearchAdsBrandV2, 'captureIndex' | 'retrievedAt' | 'responseSha256' | 'discoveryCaptureIndex'> {
  /** Stored response of this brand's call (any outcome); null when no call was made. */
  readonly capture: ProviderRawCapture | null;
  readonly discoveryCapture: ProviderRawCapture | null;
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
const FORBIDDEN_NAME = /\bgemini\b/iu;
/** Brand text may be printed; refuse control characters, percent signs and provider names. */
export const brandLabelOk = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 120 && !CONTROL.test(value) && !value.includes('%') && !FORBIDDEN_NAME.test(value) && !webTextHidden(value);

/**
 * Top distinct pick brands by revenue; empty when none is usable. The default preserves search-ads ranking.
 * Meta requests missingRevenueLast so missing values sort below every finite revenue.
 */
export function brandsFromPick(pick: unknown, options: { readonly missingRevenueLast?: boolean } = {}): SearchAdsBrandInput[] {
  if (!isRecord(pick) || !Array.isArray(pick.links)) return [];
  const rows: { label: string; key: string; revenue: number; order: number }[] = [];
  pick.links.forEach((link, order) => {
    if (!isRecord(link) || typeof link.brand !== 'string') return;
    const label = link.brand.normalize('NFC').trim();
    const key = brandLabelOk(label) ? normalizedKey(label) : null;
    // Keep the search-ads lane's existing ranking; Meta explicitly puts missing values below every finite revenue.
    if (key) rows.push({ label, key, revenue: typeof link.revenue === 'number' && Number.isFinite(link.revenue) ? link.revenue : options.missingRevenueLast ? Number.NEGATIVE_INFINITY : -1, order });
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

export const RETAILER_AGGREGATOR_DENY = new Set(['dienmayxanh', 'nguyenkim', 'mediamart', 'thegioididong', 'cellphones', 'hc', 'pico', 'dienmaycholon', 'websosanh']);
const DENIED_NAMES = new Set(['shopee', 'lazada', 'tiki', 'sendo', 'tiktok', 'facebook', 'instagram', 'youtube', 'wikipedia', 'youtu', 'fb', 'threads', 'twitter', 'x']);
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase().replace(/\.$/u, '');
    return host.length > 0 && host.includes('.') && /^[a-z0-9.-]+$/u.test(host) ? host : null;
  } catch { return null; }
}
export function hostDenied(host: string, extra: readonly string[] = []): boolean {
  if (/\.(?:gov|edu|mil)(?:\.[a-z]{2})?$/u.test(host)) return true;
  if (host.split('.').some(label => DENIED_NAMES.has(label) || RETAILER_AGGREGATOR_DENY.has(label))) return true;
  if (webTextHidden(host) || FORBIDDEN_NAME.test(host) || NEWS_DOMAINS.some(value => host === value || host.endsWith(`.${value}`))) return true;
  return extra.some(value => { const other = value.toLowerCase().replace(/^www\./u, ''); return other.length > 0 && (host === other || host.endsWith(`.${other}`)); });
}

export type DomainChoice = { readonly kind: 'DOMAIN'; readonly domain: string } | { readonly kind: 'NONE' } | { readonly kind: 'AMBIGUOUS' };
/** Exact registrable label only. Different suffixes are ambiguous; subdomains share one domain.
 * Input order is search position order, so the first observed host of that domain wins. */
export function chooseDomain(brandKey: string, webUrls: readonly string[], deniedHosts: readonly string[] = []): DomainChoice {
  const domains = new Map<string, string>();
  for (const url of webUrls) {
    const host = hostOf(url);
    if (!host || hostDenied(host, deniedHosts)) continue;
    const parsed = parseDomain(host, { allowPrivateDomains: true });
    // A tenant name on a shared hosting/shop suffix is not a registered brand domain.
    if (parsed.isPrivate) continue;
    if (parsed.domain && parsed.domainWithoutSuffix && normalizedKey(parsed.domainWithoutSuffix) === brandKey)
      if (!domains.has(parsed.domain)) domains.set(parsed.domain, host);
  }
  if (domains.size === 0) return { kind: 'NONE' };
  if (domains.size > 1) return { kind: 'AMBIGUOUS' };
  return { kind: 'DOMAIN', domain: [...domains.values()][0]! };
}

/** The same plain-word validation as expanded searches; no operators, model or inferred domain. */
export function brandSiteSearchRequest(label: string): ExpandedSearchRequest {
  // Validate the label separately as well, so template words cannot conceal a malformed name.
  planExpandedSearch({ version: 'expanded-search-request-v1', confirmedProducts: [], confirmedBrands: [label], requestedWindow: null, siteDomain: null });
  const request: ExpandedSearchRequest = { version: 'expanded-search-request-v1', confirmedProducts: [], confirmedBrands: [],
    exactKeyword: `${label} trang chủ chính hãng`, requestedWindow: null, siteDomain: null };
  planExpandedSearch(request);
  return request;
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

const skipped = (label: string, domain: string | null, status: StepSearchAdsBrandStatus, reason: Exclude<SearchAdsBrandV2['reason'], null>): SearchAdsBrandResult => ({ label, domain, status, reason,
  totalResults: null, creativeCount: null, formats: null, firstShown: null, lastShown: null, maxDaysShown: null, overlapCount: null, invalidCount: null, usageOrdinal: null, capture: null, domainSource: null, discoveryCapture: null, discoveryUsageOrdinal: null });

/** apiKey is the existing SerpApi key; it is placed only on the request URL and never stored. */
export function createGoogleAdsSource(apiKey: string, transport: ProviderTransport = defaultProviderTransport, timeoutMs = GOOGLE_ADS_TIMEOUT_MS): SearchAdsSource {
  const searchProvider = createSerpApiProvider(apiKey, transport);
  return {
    async collect(input, callOptions = {}) {
      const signal = callOptions.signal;
      const seenBrands = new Set<string>();
      const brands = input.brands.filter(brand => {
        if (seenBrands.has(brand.key)) return false;
        seenBrands.add(brand.key); return true;
      }).slice(0, GOOGLE_ADS_MAX_BRANDS);
      const log = new CaptureLog(GOOGLE_ADS_PROVIDER, transport, undefined, GOOGLE_ADS_MAX_BRANDS * 2);
      const out: SearchAdsBrandResult[] = [];
      let requests = 0, ambiguousRequests = 0, lastEnd: number | null = null;
      const finish = (status: StepSearchAdsStatus): SearchAdsCollection => ({ status, brands: out, requests, ambiguousRequests });
      if (brands.length === 0) return finish('NO_BRANDS');
      if (signal?.aborted) return finish('CANCELLED');
      const pause = async (ms: number): Promise<boolean> => {
        try { await transport.sleep(ms, signal); return !signal?.aborted; } catch { return false; }
      };
      const budget = new SearchCallBudget({ trends: 0, search: GOOGLE_ADS_MAX_BRANDS });
      const ready = async (): Promise<boolean> => {
        if (signal?.aborted) return false;
        const wait = lastEnd === null ? 0 : lastEnd + GOOGLE_ADS_SPACING_MS - transport.now();
        return (wait <= 0 || await pause(wait)) && !signal?.aborted;
      };
      const settledStatus = (): StepSearchAdsStatus => out.some(item => item.status === 'OK') ? 'OK' : 'NO_DATA';
      for (const [brandIndex, brand] of brands.entries()) {
        let choice = chooseDomain(brand.key, input.webUrls, input.deniedHosts);
        let domainSource: SearchAdsBrandV2['domainSource'] = choice.kind === 'DOMAIN' ? 'RUN_ROWS' : null;
        let discoveryCapture: ProviderRawCapture | null = null;
        let discoveryUsageOrdinal: SearchAdsBrandV2['discoveryUsageOrdinal'] = null;
        const statusOnly = (domain: string | null, status: StepSearchAdsBrandStatus, reason: Exclude<SearchAdsBrandV2['reason'], null>): SearchAdsBrandResult => ({
          ...skipped(brand.label, domain, status, reason), domainSource, discoveryCapture, discoveryUsageOrdinal,
        });
        if (choice.kind === 'NONE') {
          let request: ExpandedSearchRequest;
          try { request = brandSiteSearchRequest(brand.label); }
          catch { out.push(statusOnly(null, 'FAILED', 'DISCOVERY_QUERY_REFUSED')); return finish(settledStatus()); }
          if (!(await ready())) { out.push(statusOnly(null, 'CANCELLED', 'CANCELLED')); return finish('CANCELLED'); }
          try {
            const result = await searchProvider.collectExpanded({ runId: 'search-ads', mode: 'CATEGORY', keyword: brand.label, country: 'VN',
              requestedPeriod: { startDate: input.periodStartDate, endDate: input.periodEndDate }, selectedProductRefs: [], peerProductRefs: [] },
              request, 0, budget, callOptions);
            requests += result.usage.requestsIssued;
            if (result.usage.requestsIssued > 0) discoveryUsageOrdinal = GOOGLE_ADS_DISCOVERY_USAGE_ORDINALS[brandIndex]!;
            discoveryCapture = result.captures[0] ?? null;
            lastEnd = transport.now();
            ambiguousRequests += result.usage.ambiguousPaidRequests;
            if (result.status === 'CANCELLED' || signal?.aborted) {
              out.push(statusOnly(null, 'CANCELLED', 'CANCELLED')); return finish('CANCELLED');
            }
            if (result.status !== 'SUCCEEDED' || !discoveryCapture?.responseSha256) {
              out.push(statusOnly(null, 'FAILED', 'DISCOVERY_FAILED')); return finish(settledStatus());
            }
            // The shared parser fills absent/invalid positions from array slots. Only explicit
            // provider ranks in the retained response may qualify for this lane's top five.
            const raw = discoveryCapture.responseBytes ? parseJson(discoveryCapture.responseBytes) : null;
            const ranked = isRecord(raw) && Array.isArray(raw.organic_results) ? raw.organic_results.slice(0, 10).filter(isRecord)
              .filter(row => typeof row.position === 'number' && Number.isSafeInteger(row.position) && row.position >= 1 && row.position <= 5) : [];
            const urls = result.webResults.filter(row => ranked.some(rawRow => rawRow.position === row.position && httpsUrl(rawRow.link) === row.url))
              .sort((a, b) => a.position - b.position).map(row => row.url);
            choice = chooseDomain(brand.key, urls, input.deniedHosts);
            domainSource = choice.kind === 'DOMAIN' ? 'BRAND_SITE_SEARCH' : null;
          } catch {
            discoveryUsageOrdinal = GOOGLE_ADS_DISCOVERY_USAGE_ORDINALS[brandIndex]!;
            requests++;
            lastEnd = transport.now();
            ambiguousRequests++;
            out.push(statusOnly(null, signal?.aborted ? 'CANCELLED' : 'FAILED', 'DISCOVERY_FAILED'));
            return finish(signal?.aborted ? 'CANCELLED' : settledStatus());
          }
          if (choice.kind === 'NONE') { out.push(statusOnly(null, 'SKIPPED_NO_DOMAIN', 'DISCOVERY_NO_MATCH')); continue; }
        }
        if (choice.kind === 'AMBIGUOUS') { out.push(statusOnly(null, 'SKIPPED_AMBIGUOUS_DOMAIN', discoveryUsageOrdinal === null ? 'AMBIGUOUS_RUN_DOMAINS' : 'DISCOVERY_AMBIGUOUS')); continue; }
        if (!(await ready())) { out.push(statusOnly(choice.domain, 'CANCELLED', 'CANCELLED')); return finish('CANCELLED'); }
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
        } catch { ambiguousRequests++; out.push({ ...statusOnly(choice.domain, 'FAILED', 'REQUEST_REFUSED'), usageOrdinal: GOOGLE_ADS_USAGE_ORDINAL }); return finish(settledStatus()); }
        lastEnd = transport.now();
        const fail = (reason: Exclude<SearchAdsBrandV2['reason'], null>, capture: ProviderRawCapture | null, status: StepSearchAdsBrandStatus = 'FAILED'): void => {
          out.push({ ...statusOnly(choice.domain, status, reason), usageOrdinal: GOOGLE_ADS_USAGE_ORDINAL, capture });
        };
        if (response.kind === 'ABORTED' || signal?.aborted) {
          ambiguousRequests++;
          fail('CANCELLED', log.record(context, requestedAt, 'ABORTED_AMBIGUOUS', null, null, null), 'CANCELLED');
          return finish('CANCELLED');
        }
        if (response.kind === 'TIMEOUT') { ambiguousRequests++; fail('TIMEOUT', log.record(context, requestedAt, 'TIMEOUT_AMBIGUOUS', null, null, null)); return finish(settledStatus()); }
        if (response.kind === 'TRANSPORT') { ambiguousRequests++; fail('TRANSPORT_ERROR', log.record(context, requestedAt, 'TRANSPORT_AMBIGUOUS', null, null, null)); return finish(settledStatus()); }
        if (response.kind === 'OVERSIZE') { fail('RESPONSE_TOO_LARGE', log.record(context, requestedAt, 'OVERSIZE', response.status, null, null)); return finish(settledStatus()); }
        if (response.kind !== 'RECEIVED') { fail('REQUEST_REFUSED', null); return finish(settledStatus()); }
        if (bytesContainSecret(response.bytes, apiKey)) { fail('CREDENTIAL_ECHO_REFUSED', log.record(context, requestedAt, 'CREDENTIAL_ECHO_REFUSED', response.status, null, null)); return finish(settledStatus()); }
        const json = parseJson(response.bytes);
        const providerCode = isRecord(json) ? safeProviderCode(json.error_code ?? (isRecord(json.search_metadata) ? json.search_metadata.id : undefined)) : null;
        if (response.status !== 200) { fail('HTTP_ERROR', log.record(context, requestedAt, 'HTTP_ERROR', response.status, response.bytes, providerCode)); return finish(settledStatus()); }
        const summary = summarizeResponse(response.bytes, input.periodStartDate, input.periodEndDate);
        if (!summary) { fail('INVALID_PAYLOAD', log.record(context, requestedAt, 'INVALID_PAYLOAD', 200, response.bytes, providerCode)); return finish(settledStatus()); }
        const capture = log.record(context, requestedAt, 'OK', 200, response.bytes, providerCode);
        out.push({ label: brand.label, domain: choice.domain, status: 'OK', reason: null, totalResults: summary.totalResults, creativeCount: summary.creativeCount,
          formats: summary.formats, firstShown: summary.firstShown, lastShown: summary.lastShown, maxDaysShown: summary.maxDaysShown, overlapCount: summary.overlapCount,
          invalidCount: summary.invalidCount, usageOrdinal: GOOGLE_ADS_USAGE_ORDINAL, capture, domainSource, discoveryCapture, discoveryUsageOrdinal });
      }
      return finish(out.some(item => item.status === 'OK') ? 'OK' : 'NO_DATA');
    },
  };
}

/** The stored step field. `indexes[i]` is the step capture ordinal of `collection.brands[i].capture`, null when it was not stored. */
export function searchAdsDocument(collection: SearchAdsCollection, indexes: readonly (number | null)[], discoveryIndexes: readonly (number | null)[] = []): StepSearchAds {
  const brands: SearchAdsBrandV2[] = collection.brands.map((item, i) => {
    const { capture, discoveryCapture, ...rest } = item;
    const discoveryCaptureIndex = discoveryIndexes[i] ?? null;
    const index = indexes[i] ?? null;
    // Only a response that was stored may back figures; otherwise the brand keeps a status only.
    if (item.status === 'OK' && (index === null || !capture?.responseSha256 || (item.domainSource === 'BRAND_SITE_SEARCH' && (discoveryCaptureIndex === null || !discoveryCapture?.responseSha256)))) return { ...rest, discoveryCaptureIndex, status: 'FAILED', reason: 'CAPTURE_NOT_STORED', totalResults: null, creativeCount: null,
      formats: null, firstShown: null, lastShown: null, maxDaysShown: null, overlapCount: null, invalidCount: null, captureIndex: null, retrievedAt: null, responseSha256: null };
    return { ...rest, discoveryCaptureIndex, captureIndex: item.status === 'OK' ? index : null, retrievedAt: item.status === 'OK' ? capture!.completedAt : null, responseSha256: item.status === 'OK' ? capture!.responseSha256 : null };
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

/** Status wording only; renderers quote the original brand label separately. */
export function searchAdsBrandNotice(brand: StepSearchAdsBrand, profile: StepSearchAds['profile'] = GOOGLE_ADS_PROFILE): string {
  switch (brand.status) {
    case 'SKIPPED_NO_DOMAIN': return profile === 'search-ads-v1'
      ? 'chưa tìm thấy trang web của thương hiệu trong kết quả tìm kiếm của lần chạy này.'
      : 'chưa tìm thấy trang web chính hãng của thương hiệu trong kết quả của lần chạy này và trong lượt tìm trang chủ chính hãng của thương hiệu.';
    case 'SKIPPED_AMBIGUOUS_DOMAIN': return 'có nhiều trang web có thể là của thương hiệu, không chọn được trang nào nên bỏ qua.';
    case 'CANCELLED': return 'lượt tra bị dừng nên chưa có số liệu.';
    default: return 'lần này chưa lấy được số liệu từ thư viện quảng cáo công khai.';
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

/** Ads keep ordinal 10. Each discovery has its own reserved ordinal and one request, including failure. */
export function searchAdsUsageEntries(collection: SearchAdsCollection): { ordinal: number; result: ReturnType<typeof searchAdsUsage> }[] {
  const ambiguous = (capture: ProviderRawCapture | null): number => capture === null || capture.outcome.endsWith('_AMBIGUOUS') ? 1 : 0;
  const ads = collection.brands.filter(brand => brand.usageOrdinal === GOOGLE_ADS_USAGE_ORDINAL);
  return [
    ...(ads.length ? [{ ordinal: GOOGLE_ADS_USAGE_ORDINAL, result: searchAdsUsage({ requests: ads.length,
      ambiguousRequests: ads.reduce((total, brand) => total + ambiguous(brand.capture), 0) }) }] : []),
    ...collection.brands.filter(brand => brand.discoveryUsageOrdinal !== null).map(brand => ({ ordinal: brand.discoveryUsageOrdinal!,
      result: searchAdsUsage({ requests: 1, ambiguousRequests: ambiguous(brand.discoveryCapture) }) })),
  ];
}

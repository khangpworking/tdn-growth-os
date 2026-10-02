// Kalodata OpenAPI adapter (TikTok Shop, Vietnam). Request/response shapes follow the official
// spec served at https://www.kalodata.com/api/open-center/api-docs/public (checked 2026-10-02).
import {
  CaptureLog, ProviderInputError, RateLimiter, boundedRequest, boundedText, bytesContainSecret, emptyUsage,
  finiteNonNegative, formatProviderProductRef, httpsUrl, isAmbiguous, isRecord, parseJson, parseProviderProductRef,
  recentWindowBefore, runStatusFromCoverage, safeProviderCode, splitPeriodIntoWindows, unavailableCoverage,
  validateCountry, validateKeyword, validatePeriod, windowRelation,
  type CaptureContext, type ProviderTransport,
} from './provider-common.js';
import {
  RESEARCH_AUTOMATION_PROVIDER_CONTRACT,
  type CardDescription, type CollectInput, type CollectResult, type CoverageStatus, type CreditUsage, type DateWindow,
  type PeriodSum, type ProductCard, type ProductPeriodSummary, type ProductWindowObservation, type ProviderCallOptions,
  type ProviderCapabilityReport, type ProviderCoverage, type ProviderOperation, type ProviderRawCapture,
  type QueryWindowCoverage, type QuickSearchInput, type QuickSearchResult, type ResearchAutomationProvider,
} from './providers.js';

export const KALODATA_LIMITS = Object.freeze({
  origin: 'https://www.kalodata.com',
  rankWindowMaxDays: 30,
  rankPageSizeMax: 100,
  quickSearchPageSize: 10,
  maxCards: 4,
  rankRequestsPer10s: 10,
  detailRequestsPer10s: 100,
  creditRequestsPer10s: 10,
  requestTimeoutMs: 30_000,
  maxResponseBytes: 8 * 1024 * 1024,
  maxCollectProducts: 24,
  maxCollectDetailRequests: 600,
  descriptionMaxChars: 4_000,
  nameMaxChars: 500,
});

const COMMON = { region: 'VN', language: 'vi-VN', currency: 'VND' } as const;
const RECENT_WINDOW_DAYS = 30;
const QUICK_LIMITATIONS = [
  'RECENT_WINDOW_SNAPSHOT_NOT_REQUESTED_PERIOD_EVIDENCE', 'TOP_N_KEYWORD_RANKING_NOT_MARKET_TOTAL',
  'TIKTOK_SHOP_ONLY', 'LISTING_URL_NOT_RETURNED_BY_PROVIDER', 'DESCRIPTION_BLOCK_SCHEMA_UNDOCUMENTED_TEXT_ONLY',
  'PROVIDER_DATA_CUTOFF_UNVERIFIED',
] as const;
const COLLECT_LIMITATIONS = [
  'SINGLE_PRODUCT_WINDOWS_NOT_MARKET_TOTAL', 'DETAIL_LONG_RANGE_SEMANTICS_UNVERIFIED_SPLIT_30_DAYS',
  'HISTORICAL_AVAILABILITY_UNVERIFIED', 'TIKTOK_SHOP_ONLY',
] as const;

type Rejection = 'AUTH_OR_RATE_REJECTED' | null;

export function createKalodataProvider(secretKey: string | null, transport: ProviderTransport): ResearchAutomationProvider {
  const limiters = {
    rank: new RateLimiter(KALODATA_LIMITS.rankRequestsPer10s, 10_000),
    detail: new RateLimiter(KALODATA_LIMITS.detailRequestsPer10s, 10_000),
    credit: new RateLimiter(KALODATA_LIMITS.creditRequestsPer10s, 10_000),
  };
  const report: ProviderCapabilityReport = {
    provider: 'KALODATA', displayName: 'Kalodata (TikTok Shop)', credentialEnv: 'TDN_KALODATA_SECRET_KEY',
    configured: secretKey !== null,
    operations: {
      QUICK_SEARCH_PRODUCT_CARDS: secretKey
        ? { status: 'AVAILABLE', reason: 'product/rank keyword search over a labelled recent window, product/detail for descriptions.' }
        : { status: 'NOT_CONFIGURED', reason: 'TDN_KALODATA_SECRET_KEY is not set on the server.' },
      PRODUCT_PERIOD_DETAIL: secretKey
        ? { status: 'AVAILABLE', reason: 'product/detail per explicit product over disjoint windows of at most 30 days.' }
        : { status: 'NOT_CONFIGURED', reason: 'TDN_KALODATA_SECRET_KEY is not set on the server.' },
      WEB_DISCOVERY_CURRENT: { status: 'UNSUPPORTED', reason: 'Kalodata is not a web search provider.' },
      METRIC_MARKET_EXPORT: { status: 'UNSUPPORTED', reason: 'Not a Metric source.' },
      SHOPEE_PRODUCT_DETAIL: { status: 'UNSUPPORTED', reason: 'The used Kalodata endpoints are TikTok Shop endpoints.' },
    },
    verification: secretKey ? 'OFFICIAL_DOCS_AND_SYNTHETIC_CONTRACT_TESTS' : 'NONE',
    limitations: [...new Set([...QUICK_LIMITATIONS, ...COLLECT_LIMITATIONS])],
  };

  async function call<T>(log: CaptureLog, key: string, options: ProviderCallOptions,
    request: { operation: ProviderOperation; path: string; method: 'GET' | 'POST'; body: Record<string, unknown> | null;
      queryWindow: DateWindow | null; productRef: string | null },
    parse: (data: unknown) => T | undefined,
  ): Promise<{ capture: ProviderRawCapture; data: T | null; rejection: Rejection } | null> {
    const limiter = request.operation === 'kalodata.product.rank' ? limiters.rank
      : request.operation === 'kalodata.product.detail' ? limiters.detail : limiters.credit;
    if (!await limiter.acquire(transport, options.signal)) return null;
    const bodyText = request.body ? JSON.stringify(request.body) : null;
    const context: CaptureContext = {
      operation: request.operation,
      billing: request.operation === 'kalodata.credit.balance' ? 'FREE_ACCOUNT_QUERY' : 'PAID_CREDITS',
      method: request.method, endpoint: KALODATA_LIMITS.origin + request.path,
      requestParameters: request.body ?? {}, requestBodyBytes: bodyText === null ? null : Buffer.from(bodyText, 'utf8'),
      queryWindow: request.queryWindow, pageNumber: typeof request.body?.page_number === 'number' ? request.body.page_number : null,
      productRef: request.productRef,
    };
    const requestedAt = log.timestamp();
    const headers: Record<string, string> = { Accept: 'application/json', 'secret-key': key };
    if (bodyText !== null) headers['Content-Type'] = 'application/json';
    const result = await boundedRequest(transport, {
      url: new URL(context.endpoint), method: request.method, headers, body: bodyText,
      timeoutMs: KALODATA_LIMITS.requestTimeoutMs, maxBytes: KALODATA_LIMITS.maxResponseBytes, signal: options.signal,
    });
    if (result.kind !== 'RECEIVED' && result.kind !== 'OVERSIZE') {
      const outcome = result.kind === 'TIMEOUT' ? 'TIMEOUT_AMBIGUOUS' : result.kind === 'ABORTED' ? 'ABORTED_AMBIGUOUS' : 'TRANSPORT_AMBIGUOUS';
      return { capture: log.record(context, requestedAt, outcome, null, null, null), data: null, rejection: null };
    }
    if (result.kind === 'OVERSIZE') {
      return { capture: log.record(context, requestedAt, 'OVERSIZE', result.status, null, null), data: null, rejection: null };
    }
    if (bytesContainSecret(result.bytes, key)) {
      return { capture: log.record(context, requestedAt, 'CREDENTIAL_ECHO_REFUSED', result.status, null, null), data: null, rejection: null };
    }
    const rejection: Rejection = [401, 403, 429].includes(result.status) ? 'AUTH_OR_RATE_REJECTED' : null;
    const payload = parseJson(result.bytes);
    const providerCode = isRecord(payload) ? safeProviderCode(payload.code) : null;
    if (result.status < 200 || result.status > 299) {
      return { capture: log.record(context, requestedAt, 'HTTP_ERROR', result.status, result.bytes, providerCode), data: null, rejection };
    }
    if (!isRecord(payload) || typeof payload.success !== 'boolean') {
      return { capture: log.record(context, requestedAt, 'INVALID_PAYLOAD', result.status, result.bytes, null), data: null, rejection: null };
    }
    if (payload.success !== true) {
      return { capture: log.record(context, requestedAt, 'PROVIDER_REJECTED', result.status, result.bytes, providerCode), data: null, rejection: null };
    }
    const data = parse(payload.data);
    if (data === undefined) {
      return { capture: log.record(context, requestedAt, 'INVALID_PAYLOAD', result.status, result.bytes, providerCode), data: null, rejection: null };
    }
    return { capture: log.record(context, requestedAt, 'OK', result.status, result.bytes, providerCode), data, rejection: null };
  }

  async function balance(log: CaptureLog, key: string, options: ProviderCallOptions) {
    const result = await call(log, key, options, {
      operation: 'kalodata.credit.balance', path: '/openapi/v1/credit/balance', method: 'GET', body: null,
      queryWindow: null, productRef: null,
    }, data => isRecord(data) && finiteNonNegative(data.totalRemain) !== null ? finiteNonNegative(data.totalRemain)! : undefined);
    return result?.data === null || result === null ? null : { value: result.data, captureId: result.capture.captureId };
  }

  async function credits(log: CaptureLog, key: string, options: ProviderCallOptions,
    before: { value: number; captureId: string } | null): Promise<CreditUsage> {
    const paid = log.captures.filter(capture => capture.billing === 'PAID_CREDITS');
    if (paid.length === 0) return { status: 'NONE_USED' };
    if (!before) return { status: 'UNKNOWN', unit: 'KALODATA_DISPLAY_POINTS', reason: 'Balance before collection was not observed.' };
    const after = await balance(log, key, options);
    if (!after) return { status: 'UNKNOWN', unit: 'KALODATA_DISPLAY_POINTS', reason: 'Balance after collection was not observed.' };
    if (after.value > before.value) {
      return { status: 'UNKNOWN', unit: 'KALODATA_DISPLAY_POINTS', reason: 'Account balance increased during the run.' };
    }
    return { status: 'OBSERVED_ACCOUNT_BALANCE_DELTA', unit: 'KALODATA_DISPLAY_POINTS', before: before.value,
      after: after.value, consumed: Number((before.value - after.value).toFixed(6)),
      captureIds: [before.captureId, after.captureId], attribution: 'ACCOUNT_WIDE_MAY_INCLUDE_CONCURRENT_USAGE' };
  }

  function detailRequest(id: string, window: DateWindow) {
    return { ...COMMON, product_id: id, date_range: `${window.startDate}~${window.endDate}`, need_image: 1, need_extra: false };
  }

  return {
    id: 'KALODATA',
    capability: () => report,

    async quickSearch(input: QuickSearchInput, options: ProviderCallOptions = {}): Promise<QuickSearchResult> {
      const keyword = validateKeyword(input.keyword);
      validateCountry(input.country);
      const requestedPeriod = validatePeriod(input.requestedPeriod);
      const window = recentWindowBefore(input.asOf, RECENT_WINDOW_DAYS);
      const searchWindow = { window, label: 'QUICK_SEARCH_RECENT_WINDOW' as const,
        basis: 'VN_DATE_BEFORE_AS_OF_30_DAYS' as const, relationToRequestedPeriod: windowRelation(window, requestedPeriod) };
      const emptyPool = { rowsReturned: 0, validDistinctProducts: 0, duplicateRowsCollapsed: 0, invalidRows: 0 };
      if (!secretKey) {
        return { contractVersion: RESEARCH_AUTOMATION_PROVIDER_CONTRACT, provider: 'KALODATA', status: 'NOT_CONFIGURED',
          searchWindow, cards: [], candidatePool: emptyPool,
          coverage: [unavailableCoverage('KALODATA', 'QUICK_SEARCH_PRODUCT_CARDS', 'NOT_CONFIGURED', requestedPeriod, QUICK_LIMITATIONS)],
          usage: emptyUsage('KALODATA'), captures: [], limitations: [...QUICK_LIMITATIONS] };
      }
      const log = new CaptureLog('KALODATA', transport, options.onProgress, 3 + KALODATA_LIMITS.maxCards);
      const before = await balance(log, secretKey, options);
      const rankBody = { ...COMMON, keyword, date_range: `${window.startDate}~${window.endDate}`,
        sort_field: { field: 'revenue', type: 'DESC' }, page_size: KALODATA_LIMITS.quickSearchPageSize, page_number: 1,
        need_all: false, need_image: 1, need_extra: false };
      const rank = await call(log, secretKey, options, {
        operation: 'kalodata.product.rank', path: '/openapi/v1/tiktok/product/rank', method: 'POST', body: rankBody,
        queryWindow: window, productRef: null,
      }, data => Array.isArray(data) && data.length <= KALODATA_LIMITS.quickSearchPageSize ? data : undefined);

      const pool = { ...emptyPool };
      const picked: { id: string; name: string; row: Record<string, unknown>; position: number }[] = [];
      const seen = new Set<string>();
      for (const [index, row] of (rank?.data ?? []).entries()) {
        pool.rowsReturned++;
        const id = isRecord(row) && typeof row.product_id === 'string' && /^\d{1,32}$/.test(row.product_id) ? row.product_id : null;
        const name = isRecord(row) ? boundedText(row.product_name, KALODATA_LIMITS.nameMaxChars) : null;
        if (!id || !name || !isRecord(row)) { pool.invalidRows++; continue; }
        if (seen.has(id)) { pool.duplicateRowsCollapsed++; continue; }
        seen.add(id);
        pool.validDistinctProducts++;
        if (picked.length < KALODATA_LIMITS.maxCards) picked.push({ id, name, row, position: index + 1 });
      }

      const windows: QueryWindowCoverage[] = [{
        window, productRef: null,
        status: !rank ? 'NOT_RUN_CANCELLED' : rank.capture.outcome === 'OK' ? (pool.rowsReturned ? 'OK' : 'EMPTY')
          : isAmbiguous(rank.capture.outcome) ? 'AMBIGUOUS_NO_RETRY' : 'FAILED',
        captureIds: rank ? [rank.capture.captureId] : [], rows: rank?.data ? pool.rowsReturned : null,
        truncated: pool.rowsReturned >= KALODATA_LIMITS.quickSearchPageSize,
      }];
      const cards: ProductCard[] = [];
      let stopped = rank?.rejection != null;
      for (const pick of picked) {
        const ref = formatProviderProductRef('KALODATA', pick.id);
        const detail = stopped ? null : await call(log, secretKey, options, {
          operation: 'kalodata.product.detail', path: '/openapi/v1/tiktok/product/detail', method: 'POST',
          body: detailRequest(pick.id, window), queryWindow: window, productRef: ref,
        }, data => parseDetail(data, pick.id));
        if (detail?.rejection) stopped = true;
          windows.push({ window, productRef: ref, captureIds: detail ? [detail.capture.captureId] : [], rows: null, truncated: false,
            // The provider may reject the request after a paid call. There is no
            // QueryWindowStatus for "not attempted after rejection"; retain the
            // failed operation as FAILED rather than relabelling it cancellation.
            status: !detail ? (options.signal?.aborted ? 'NOT_RUN_CANCELLED' : 'FAILED')
            : detail.capture.outcome === 'OK' ? (detail.data?.record ? 'OK' : 'EMPTY')
            : isAmbiguous(detail.capture.outcome) ? 'AMBIGUOUS_NO_RETRY' : 'FAILED' });
        cards.push(buildCard(ref, pick, window, rank!.capture.captureId, detail?.capture ?? null, detail?.data?.record ?? null));
      }
      const usage = log.usage(await credits(log, secretKey, options, before));
      const cancelled = options.signal?.aborted === true;
      const status = coverageStatus(windows, cancelled);
      const coverage: ProviderCoverage = {
        provider: 'KALODATA', operation: 'QUICK_SEARCH_PRODUCT_CARDS', status, semantics: 'RECENT_RANKING_SNAPSHOT',
        requestedPeriod, queryWindows: windows, truncated: windows[0]!.truncated,
        continuation: { required: false, remainingWindows: [], remainingProductRefs: [] }, limitations: [...QUICK_LIMITATIONS],
      };
      return { contractVersion: RESEARCH_AUTOMATION_PROVIDER_CONTRACT, provider: 'KALODATA',
        status: runStatusFromCoverage([status], cancelled), searchWindow, cards, candidatePool: pool,
        coverage: [coverage], usage, captures: log.captures, limitations: [...QUICK_LIMITATIONS] };
    },

    async collect(input: CollectInput, options: ProviderCallOptions = {}): Promise<CollectResult> {
      validateKeyword(input.keyword);
      validateCountry(input.country);
      const requestedPeriod = validatePeriod(input.requestedPeriod);
      const roles = new Map<string, ProductPeriodSummary['role']>();
      for (const [list, role] of [[input.selectedProductRefs, 'SELECTED'], [input.peerProductRefs, 'PEER']] as const) {
        if (!Array.isArray(list) || list.length > 100) throw new ProviderInputError('Product refs must be a bounded list');
        for (const ref of list) {
          if (!parseProviderProductRef(ref)) throw new ProviderInputError('Unsupported product ref');
          const prior = roles.get(ref);
          roles.set(ref, prior && prior !== role ? 'SELECTED_AND_PEER' : role);
        }
      }
      const base = { contractVersion: RESEARCH_AUTOMATION_PROVIDER_CONTRACT, provider: 'KALODATA' as const, requestedPeriod,
        webResults: [], limitations: [...COLLECT_LIMITATIONS] };
      if (!secretKey) {
        return { ...base, status: 'NOT_CONFIGURED', productObservations: [], productPeriodSummaries: [],
          coverage: [unavailableCoverage('KALODATA', 'PRODUCT_PERIOD_DETAIL', 'NOT_CONFIGURED', requestedPeriod, COLLECT_LIMITATIONS)],
          usage: emptyUsage('KALODATA'), captures: [] };
      }
      const refs = [...roles.keys()];
      const periodWindows = splitPeriodIntoWindows(requestedPeriod, KALODATA_LIMITS.rankWindowMaxDays);
      const plan = refs.slice(0, KALODATA_LIMITS.maxCollectProducts)
        .flatMap(ref => periodWindows.map(window => ({ ref, window })));
      const executable = plan.slice(0, KALODATA_LIMITS.maxCollectDetailRequests);
      const log = new CaptureLog('KALODATA', transport, options.onProgress, executable.length + 2);
      const before = executable.length ? await balance(log, secretKey, options) : null;
      const windows: QueryWindowCoverage[] = [];
      const observations: ProductWindowObservation[] = [];
      let stopped = false;
      for (const task of executable) {
        const id = parseProviderProductRef(task.ref)!.sourceProductId;
        const detail = stopped ? null : await call(log, secretKey, options, {
          operation: 'kalodata.product.detail', path: '/openapi/v1/tiktok/product/detail', method: 'POST',
          body: detailRequest(id, task.window), queryWindow: task.window, productRef: task.ref,
        }, data => parseDetail(data, id));
        if (detail?.rejection) stopped = true;
        const record = detail?.data?.record ?? null;
        if (detail && record) observations.push(observation(task.ref, task.window, detail.capture.captureId, record));
          windows.push({ window: task.window, productRef: task.ref, captureIds: detail ? [detail.capture.captureId] : [],
          rows: detail?.data ? (record ? 1 : 0) : null, truncated: false,
          status: !detail ? (options.signal?.aborted ? 'NOT_RUN_CANCELLED' : 'FAILED')
            : detail.capture.outcome === 'OK' ? (record ? 'OK' : 'EMPTY')
            : isAmbiguous(detail.capture.outcome) ? 'AMBIGUOUS_NO_RETRY' : 'FAILED' });
      }
      const notRun = plan.slice(executable.length);
      for (const task of notRun) {
        windows.push({ window: task.window, productRef: task.ref, status: 'NOT_RUN_BOUND', captureIds: [], rows: null, truncated: false });
      }
      const skippedRefs = refs.slice(KALODATA_LIMITS.maxCollectProducts);
      const pending = windows.filter(row => row.status.startsWith('NOT_RUN') || row.status === 'AMBIGUOUS_NO_RETRY');
      const cancelled = options.signal?.aborted === true;
      const status: CoverageStatus = refs.length === 0 ? 'EMPTY' : skippedRefs.length || notRun.length
        ? (windows.some(row => row.status === 'OK') ? 'PARTIAL' : coverageStatus(windows, cancelled) === 'FAILED' ? 'FAILED' : 'PARTIAL')
        : coverageStatus(windows, cancelled);
      const coverage: ProviderCoverage = {
        provider: 'KALODATA', operation: 'PRODUCT_PERIOD_DETAIL', status, semantics: 'PRODUCT_PERIOD_WINDOWS',
        requestedPeriod, queryWindows: windows, truncated: skippedRefs.length > 0 || notRun.length > 0,
        continuation: {
          required: pending.length > 0 || skippedRefs.length > 0,
          remainingWindows: uniqueWindows(pending.map(row => row.window!)),
          remainingProductRefs: [...new Set([...pending.map(row => row.productRef!), ...skippedRefs])],
        },
        limitations: refs.length ? [...COLLECT_LIMITATIONS] : [...COLLECT_LIMITATIONS, 'NO_APPROVED_PRODUCT_REFS'],
      };
      const summaries = refs.map(ref => summary(ref, roles.get(ref)!, requestedPeriod, periodWindows.length,
        windows.filter(row => row.productRef === ref), observations.filter(row => row.productRef === ref)));
      const usage = log.usage(await credits(log, secretKey, options, before));
      return { ...base, status: refs.length ? runStatusFromCoverage([status], cancelled) : 'SUCCEEDED',
        productObservations: observations, productPeriodSummaries: summaries, coverage: [coverage], usage,
        captures: log.captures };
    },
  };
}

// ---- payload normalization (provider fields only) ----

interface DetailRecord {
  name: string | null; description: Omit<CardDescription, 'captureId'> & { status: CardDescription['status'] };
  descriptionText: { text: string; truncated: boolean; blockCount: number } | null;
  image: string | null; revenue: number | null; salesVolume: number | null; unitPrice: number | null;
  minPrice: number | null; maxPrice: number | null; videoRevenue: number | null; liveRevenue: number | null;
  mallRevenue: number | null; shopId: string | null; categories: [string | null, string | null, string | null];
}

/** Returns undefined for a malformed payload, `{ record: null }` when the provider returned no record. */
function parseDetail(data: unknown, expectedId: string): { record: DetailRecord | null } | undefined {
  if (data === null || data === undefined) return { record: null };
  if (!isRecord(data) || data.product_id !== expectedId) return undefined;
  if (data.product_region !== undefined && data.product_region !== null && data.product_region !== 'VN') return undefined;
  const id = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
  let descriptionText: DetailRecord['descriptionText'] = null;
  let status: CardDescription['status'];
  const blocks = data.product_description;
  if (blocks === undefined || blocks === null) status = 'MISSING_FIELD';
  else if (!Array.isArray(blocks)) status = 'UNRECOGNIZED_STRUCTURE';
  else if (blocks.length === 0) status = 'MISSING_EMPTY';
  else {
    // Block schema is undocumented; only verbatim string `text` properties are used.
    const parts = blocks.flatMap(block => isRecord(block) ? [boundedText(block.text, KALODATA_LIMITS.descriptionMaxChars)] : [])
      .filter((part): part is string => part !== null);
    const joined = parts.join('\n');
    if (joined) {
      status = 'AVAILABLE';
      descriptionText = { text: joined.slice(0, KALODATA_LIMITS.descriptionMaxChars),
        truncated: joined.length > KALODATA_LIMITS.descriptionMaxChars, blockCount: blocks.length };
    } else status = 'UNRECOGNIZED_STRUCTURE';
  }
  const salesVolume = finiteNonNegative(data.sales_volumn ?? data.sales_volume);
  return { record: {
    name: boundedText(data.product_name, KALODATA_LIMITS.nameMaxChars), description: { status }, descriptionText,
    image: httpsUrl(data.master_image_url), revenue: finiteNonNegative(data.revenue),
    salesVolume: salesVolume !== null && Number.isSafeInteger(salesVolume) ? salesVolume : null,
    unitPrice: finiteNonNegative(data.unit_price), minPrice: finiteNonNegative(data.min_price),
    maxPrice: finiteNonNegative(data.max_price), videoRevenue: finiteNonNegative(data.video_revenue),
    liveRevenue: finiteNonNegative(data.live_revenue), mallRevenue: finiteNonNegative(data.shopping_mall_revenue),
    shopId: id(data.product_shop_id), categories: [id(data.pri_cate_id), id(data.sec_cate_id), id(data.ter_cate_id)],
  } };
}

function buildCard(ref: string, pick: { id: string; name: string; row: Record<string, unknown>; position: number },
  window: DateWindow, rankCaptureId: string, detailCapture: ProviderRawCapture | null, detail: DetailRecord | null): ProductCard {
  const imageUrl = httpsUrl(pick.row.master_image_url) ?? detail?.image ?? null;
  const description: CardDescription = !detailCapture || detailCapture.outcome !== 'OK'
    ? { status: 'NOT_FETCHED', captureId: detailCapture?.captureId ?? null }
    : !detail ? { status: 'MISSING_FIELD', captureId: detailCapture.captureId }
    : detail.descriptionText ? { status: 'AVAILABLE', ...detail.descriptionText, sourceField: 'product_description',
      captureId: detailCapture.captureId }
    : { status: detail.description.status as Exclude<CardDescription['status'], 'AVAILABLE'>, captureId: detailCapture.captureId };
  return {
    ref, provider: 'KALODATA', platform: 'TIKTOK_SHOP', country: 'VN', sourceProductId: pick.id, name: pick.name,
    image: imageUrl ? { status: 'AVAILABLE', url: imageUrl, sourceField: 'master_image_url' }
      : { status: 'UNAVAILABLE', reason: pick.row.master_image_url === undefined || pick.row.master_image_url === null
        || pick.row.master_image_url === '' ? 'NOT_RETURNED' : 'INVALID_URL' },
    description,
    providerPageUrl: `${KALODATA_LIMITS.origin}/product/detail?id=${pick.id}`,
    listingUrl: { status: 'NOT_RETURNED_BY_PROVIDER' },
    price: { currency: 'VND', unitPrice: finiteNonNegative(pick.row.unit_price) ?? detail?.unitPrice ?? null,
      minSkuPrice: detail?.minPrice ?? null, maxSkuPrice: detail?.maxPrice ?? null, observedWindow: window },
    shopId: detail?.shopId ?? null,
    rank: { position: pick.position, sortField: 'revenue', window },
    provenance: { rankCaptureId, detailCaptureId: detailCapture?.captureId ?? null },
  };
}

function observation(ref: string, window: DateWindow, captureId: string, record: DetailRecord): ProductWindowObservation {
  return { productRef: ref, window, captureId, currency: 'VND', productName: record.name, revenue: record.revenue,
    salesVolume: record.salesVolume, unitPrice: record.unitPrice, minSkuPrice: record.minPrice, maxSkuPrice: record.maxPrice,
    videoRevenue: record.videoRevenue, liveRevenue: record.liveRevenue, shoppingMallRevenue: record.mallRevenue,
    categoryIds: { primary: record.categories[0], secondary: record.categories[1], tertiary: record.categories[2] },
    shopId: record.shopId };
}

function summary(ref: string, role: ProductPeriodSummary['role'], requestedPeriod: DateWindow, planned: number,
  windows: QueryWindowCoverage[], rows: ProductWindowObservation[]): ProductPeriodSummary {
  const okCount = windows.filter(row => row.status === 'OK').length;
  const complete = okCount === planned && rows.length === planned;
  const sum = (field: 'revenue' | 'salesVolume'): PeriodSum => {
    if (!complete) return { status: 'UNAVAILABLE', reason: 'INCOMPLETE_WINDOWS' };
    const values = rows.map(row => row[field]);
    return values.every((value): value is number => value !== null)
      ? { status: 'SUM_OF_DISJOINT_PROVIDER_WINDOWS', value: values.reduce((total, value) => total + value, 0) }
      : { status: 'UNAVAILABLE', reason: 'FIELD_MISSING_IN_WINDOW' };
  };
  return { productRef: ref, role, requestedPeriod, windowsPlanned: planned, windowsOk: okCount,
    scope: 'SINGLE_PRODUCT_NOT_MARKET_TOTAL', revenue: sum('revenue'), salesVolume: sum('salesVolume') };
}

function coverageStatus(windows: readonly QueryWindowCoverage[], cancelled: boolean): CoverageStatus {
  if (cancelled && windows.some(row => row.status === 'NOT_RUN_CANCELLED' || row.status === 'AMBIGUOUS_NO_RETRY')) return 'CANCELLED';
  if (windows.every(row => row.status === 'OK')) return 'QUERIES_COMPLETE';
  if (windows.every(row => row.status === 'EMPTY')) return 'EMPTY';
  if (windows.every(row => row.status === 'OK' || row.status === 'EMPTY')) return windows[0]?.status === 'EMPTY' && !windows[0].productRef
    ? 'EMPTY' : 'QUERIES_COMPLETE';
  return windows.some(row => row.status === 'OK') ? 'PARTIAL' : 'FAILED';
}

function uniqueWindows(windows: readonly DateWindow[]): DateWindow[] {
  const seen = new Map(windows.map(window => [window.startDate + '~' + window.endDate, window]));
  return [...seen.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

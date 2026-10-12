// Internal provider boundary for automated research. Backend lifecycle code calls this;
// public API schemas stay owned by the backend and are not mirrored here.
import { createKalodataProvider, KALODATA_LIMITS } from './provider-kalodata.js';
import { createSerpApiProvider, SERPAPI_LIMITS } from './provider-serpapi.js';
import type { ExpandedSearchRequest, SearchCallBudget } from './expanded-search-queries.js';
import {
  ProviderInputError, defaultProviderTransport, emptyUsage, unavailableCoverage,
  type ProviderTransport,
} from './provider-common.js';

export {
  ProviderInputError, formatProviderProductRef, parseProviderProductRef, splitPeriodIntoWindows,
  inclusiveDayCount, type ProviderTransport,
} from './provider-common.js';
export { KALODATA_LIMITS, SERPAPI_LIMITS };

export const RESEARCH_AUTOMATION_PROVIDER_CONTRACT = 'research-automation-provider-v1' as const;

export type ResearchAutomationProviderId = 'KALODATA' | 'SERPAPI' | 'METRIC' | 'APIFY_SHOPEE';
export type ResearchMode = 'PRODUCT' | 'CATEGORY';

/** Inclusive calendar dates, `YYYY-MM-DD`, interpreted in Vietnam (UTC+7). */
export interface DateWindow { readonly startDate: string; readonly endDate: string }

export interface QuickSearchInput {
  /** Opaque backend identifiers retained only for provenance/progress correlation. */
  readonly runId: string;
  readonly mode: ResearchMode;
  readonly keyword: string;
  /** Owner-supplied text; not sent to providers in v1 (cards are found by keyword). */
  readonly description: string | null;
  /** The owner's frozen research period. Quick search does NOT query it; it is used only to label the recent window. */
  readonly requestedPeriod: DateWindow;
  readonly country: 'VN';
  /** Frozen run timestamp (ISO 8601). The recent search window ends on the Vietnam date before it. */
  readonly asOf: string;
}

export interface CollectInput {
  readonly runId: string;
  readonly mode: ResearchMode;
  readonly keyword: string;
  readonly requestedPeriod: DateWindow;
  readonly country: 'VN';
  /** Exact provider refs from ProductCard.ref (`kalodata:<id>`). Selection is closeness, not peer approval. */
  readonly selectedProductRefs: readonly string[];
  /** Explicitly confirmed peer refs; never inferred from selections. */
  readonly peerProductRefs: readonly string[];
}

export interface ProviderProgressEvent {
  readonly provider: ResearchAutomationProviderId;
  readonly operation: ProviderOperation;
  readonly completedRequests: number;
  readonly plannedRequests: number;
  readonly queryWindow: DateWindow | null;
  readonly productRef: string | null;
}

export interface ProviderCallOptions {
  /** Cancellation: no new request starts after abort; an in-flight paid request is recorded as ambiguous. */
  readonly signal?: AbortSignal;
  /** Called after each provider request settles. Must not throw; exceptions are ignored. */
  readonly onProgress?: (event: ProviderProgressEvent) => void;
}

export interface ResearchAutomationProvider {
  readonly id: ResearchAutomationProviderId;
  capability(): ProviderCapabilityReport;
  /** Explicit owner Start only. Never call from page load/typing. Results are a recent snapshot, not period evidence. */
  quickSearch(input: QuickSearchInput, options?: ProviderCallOptions): Promise<QuickSearchResult>;
  /** Approved-scope collection over the exact requested period. Never auto-retries paid requests. */
  collect(input: CollectInput, options?: ProviderCallOptions): Promise<CollectResult>;
}

/** Explicit internal P5 caller; ordinary provider collection remains v1 and unchanged. */
export interface ExpandedSearchProvider extends ResearchAutomationProvider {
  collectExpanded(input: CollectInput, request: ExpandedSearchRequest, queryIndex: number,
    budget: SearchCallBudget, options?: ProviderCallOptions): Promise<CollectResult>;
}

export type ProviderOperation =
  | 'kalodata.product.rank' | 'kalodata.product.detail' | 'kalodata.credit.balance'
  | 'serpapi.google.search' | 'none';

export type CaptureOutcome =
  | 'OK' | 'PROVIDER_REJECTED' | 'HTTP_ERROR' | 'INVALID_PAYLOAD' | 'OVERSIZE'
  | 'CREDENTIAL_ECHO_REFUSED' | 'TIMEOUT_AMBIGUOUS' | 'TRANSPORT_AMBIGUOUS' | 'ABORTED_AMBIGUOUS';

export type CaptureBilling = 'PAID_CREDITS' | 'FREE_ACCOUNT_QUERY' | 'PAID_SEARCH_UNLESS_CACHED';

/** One HTTP exchange. Bytes are exact; nothing here contains credentials. */
export interface ProviderRawCapture {
  readonly captureId: string;
  readonly provider: ResearchAutomationProviderId;
  readonly operation: ProviderOperation;
  readonly billing: CaptureBilling;
  readonly method: 'GET' | 'POST';
  /** Scheme, host and path only; never a query string or credential. */
  readonly endpoint: string;
  /** Secret-free request parameters as sent (JSON body or query without api_key). */
  readonly requestParameters: Readonly<Record<string, unknown>>;
  /** Exact request body bytes, or null for GET. */
  readonly requestBodyBytes: Buffer | null;
  readonly queryWindow: DateWindow | null;
  readonly pageNumber: number | null;
  readonly productRef: string | null;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly outcome: CaptureOutcome;
  readonly httpStatus: number | null;
  /** Exact received bytes; null when nothing was received or retention was refused. */
  readonly responseBytes: Buffer | null;
  readonly responseSha256: string | null;
  readonly responseByteLength: number | null;
  /** Sanitized provider code (e.g. Kalodata `code`) when the provider rejected the request. */
  readonly providerCode: string | null;
}

export type ProviderRunStatus =
  | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED' | 'UNSUPPORTED' | 'WAITING_FOR_INPUT' | 'NOT_CONFIGURED';

export type CoverageOperation =
  | 'QUICK_SEARCH_PRODUCT_CARDS' | 'PRODUCT_PERIOD_DETAIL' | 'WEB_DISCOVERY_CURRENT'
  | 'METRIC_MARKET_EXPORT' | 'SHOPEE_PRODUCT_DETAIL';

export type CoverageStatus =
  /** Every planned query succeeded. Never means complete market coverage. */
  | 'QUERIES_COMPLETE'
  | 'PARTIAL' | 'EMPTY' | 'FAILED' | 'CANCELLED' | 'UNSUPPORTED' | 'WAITING_FOR_INPUT' | 'NOT_CONFIGURED';

export type CoverageSemantics =
  | 'RECENT_RANKING_SNAPSHOT' | 'PRODUCT_PERIOD_WINDOWS' | 'CURRENT_WEB_SNAPSHOT' | 'NONE';

export type QueryWindowStatus =
  | 'OK' | 'EMPTY' | 'FAILED' | 'AMBIGUOUS_NO_RETRY' | 'NOT_RUN_BOUND' | 'NOT_RUN_CANCELLED';

export interface QueryWindowCoverage {
  readonly window: DateWindow | null;
  readonly productRef: string | null;
  readonly status: QueryWindowStatus;
  readonly captureIds: readonly string[];
  readonly rows: number | null;
  /** True when the provider may hold more rows than were retrieved (e.g. a full page with no total). */
  readonly truncated: boolean;
}

export interface ProviderCoverage {
  readonly provider: ResearchAutomationProviderId;
  readonly operation: CoverageOperation;
  readonly status: CoverageStatus;
  readonly semantics: CoverageSemantics;
  /** Owner-requested period (null where the operation has no period semantics). */
  readonly requestedPeriod: DateWindow | null;
  readonly queryWindows: readonly QueryWindowCoverage[];
  readonly truncated: boolean;
  /** Work that was planned but not executed; a later explicit run is required to cover it. */
  readonly continuation: {
    readonly required: boolean;
    readonly remainingWindows: readonly DateWindow[];
    readonly remainingProductRefs: readonly string[];
  };
  readonly limitations: readonly string[];
}

export type CreditUsage =
  | {
    readonly status: 'OBSERVED_ACCOUNT_BALANCE_DELTA';
    readonly unit: 'KALODATA_DISPLAY_POINTS';
    readonly before: number; readonly after: number; readonly consumed: number;
    readonly captureIds: readonly [string, string];
    /** The balance is account-wide; concurrent use elsewhere is included. */
    readonly attribution: 'ACCOUNT_WIDE_MAY_INCLUDE_CONCURRENT_USAGE';
  }
  | { readonly status: 'UNKNOWN'; readonly unit: string | null; readonly reason: string }
  | { readonly status: 'NONE_USED' };

export interface ProviderUsage {
  readonly provider: ResearchAutomationProviderId;
  readonly requestsIssued: number;
  readonly paidRequestsIssued: number;
  /** Paid requests whose outcome is unknown. Reconcile with the provider before any replacement. */
  readonly ambiguousPaidRequests: number;
  readonly automaticRetries: 0;
  readonly credits: CreditUsage;
  /** No provider response reports a finalized monetary charge; never estimated here. */
  readonly monetaryCharge: { readonly status: 'UNKNOWN'; readonly reason: string };
}

export type CardImage =
  | { readonly status: 'AVAILABLE'; readonly url: string; readonly sourceField: 'master_image_url' }
  | { readonly status: 'UNAVAILABLE'; readonly reason: 'NOT_RETURNED' | 'INVALID_URL' };

export type CardDescription =
  | {
    readonly status: 'AVAILABLE';
    /** Text taken verbatim from string `text` properties of product_description blocks. */
    readonly text: string;
    readonly truncated: boolean;
    readonly blockCount: number;
    readonly sourceField: 'product_description';
    readonly captureId: string;
  }
  | {
    readonly status: 'MISSING_EMPTY' | 'MISSING_FIELD' | 'UNRECOGNIZED_STRUCTURE' | 'NOT_FETCHED';
    readonly captureId: string | null;
  };

export interface ProductCard {
  /** Exact provider identity, e.g. `kalodata:1729384756`. Use as selected/peer ref. */
  readonly ref: string;
  readonly provider: 'KALODATA';
  readonly platform: 'TIKTOK_SHOP';
  readonly country: 'VN';
  readonly sourceProductId: string;
  readonly name: string;
  readonly image: CardImage;
  readonly description: CardDescription;
  /** Kalodata product page for this ID. The provider does not return the original marketplace listing URL. */
  readonly providerPageUrl: string;
  readonly listingUrl: { readonly status: 'NOT_RETURNED_BY_PROVIDER' };
  /** Observed price within the labelled search window, VND. */
  readonly price: {
    readonly currency: 'VND';
    readonly unitPrice: number | null;
    readonly minSkuPrice: number | null;
    readonly maxSkuPrice: number | null;
    readonly observedWindow: DateWindow;
  };
  readonly shopId: string | null;
  readonly rank: {
    readonly position: number;
    readonly sortField: 'revenue';
    readonly window: DateWindow;
  };
  readonly provenance: { readonly rankCaptureId: string; readonly detailCaptureId: string | null };
}

export interface QuickSearchResult {
  readonly contractVersion: typeof RESEARCH_AUTOMATION_PROVIDER_CONTRACT;
  readonly provider: ResearchAutomationProviderId;
  readonly status: ProviderRunStatus;
  readonly searchWindow: {
    readonly window: DateWindow;
    readonly label: 'QUICK_SEARCH_RECENT_WINDOW';
    readonly basis: 'VN_DATE_BEFORE_AS_OF_30_DAYS';
    readonly relationToRequestedPeriod: 'INSIDE' | 'OVERLAPS' | 'OUTSIDE';
  } | null;
  /** At most 4 principal cards, distinct by exact provider ID. Fewer when data is thin. */
  readonly cards: readonly ProductCard[];
  readonly candidatePool: {
    readonly rowsReturned: number;
    readonly validDistinctProducts: number;
    readonly duplicateRowsCollapsed: number;
    readonly invalidRows: number;
  };
  readonly coverage: readonly ProviderCoverage[];
  readonly usage: ProviderUsage;
  readonly captures: readonly ProviderRawCapture[];
  readonly limitations: readonly string[];
}

/** Provider-reported values for one product in one non-overlapping query window. Absent fields stay null. */
export interface ProductWindowObservation {
  readonly productRef: string;
  readonly window: DateWindow;
  readonly captureId: string;
  readonly currency: 'VND';
  readonly productName: string | null;
  readonly revenue: number | null;
  readonly salesVolume: number | null;
  readonly unitPrice: number | null;
  readonly minSkuPrice: number | null;
  readonly maxSkuPrice: number | null;
  readonly videoRevenue: number | null;
  readonly liveRevenue: number | null;
  readonly shoppingMallRevenue: number | null;
  readonly categoryIds: { readonly primary: string | null; readonly secondary: string | null; readonly tertiary: string | null };
  readonly shopId: string | null;
}

/** Single-product period figure; only present when every disjoint window covering the request succeeded. */
export interface ProductPeriodSummary {
  readonly productRef: string;
  readonly role: 'SELECTED' | 'PEER' | 'SELECTED_AND_PEER';
  readonly requestedPeriod: DateWindow;
  readonly windowsPlanned: number;
  readonly windowsOk: number;
  readonly scope: 'SINGLE_PRODUCT_NOT_MARKET_TOTAL';
  readonly revenue: PeriodSum;
  readonly salesVolume: PeriodSum;
}

export type PeriodSum =
  | { readonly status: 'SUM_OF_DISJOINT_PROVIDER_WINDOWS'; readonly value: number }
  | { readonly status: 'UNAVAILABLE'; readonly reason: 'INCOMPLETE_WINDOWS' | 'FIELD_MISSING_IN_WINDOW' };

export interface WebDiscoveryResult {
  readonly captureId: string;
  readonly position: number;
  readonly title: string;
  readonly url: string;
  readonly displayedLink: string | null;
  readonly snippet: string | null;
  readonly source: string | null;
  /** Publish date exactly as the search engine shows it (may be relative, e.g. "3 ngày trước"). */
  readonly date: string | null;
  readonly retrievedAt: string;
  /** Search results are a current snapshot; never annual or sales evidence. */
  readonly semantics: 'CURRENT_WEB_SNAPSHOT_NOT_PERIOD_EVIDENCE';
}

export interface CollectResult {
  readonly contractVersion: typeof RESEARCH_AUTOMATION_PROVIDER_CONTRACT;
  readonly provider: ResearchAutomationProviderId;
  readonly status: ProviderRunStatus;
  readonly requestedPeriod: DateWindow;
  readonly productObservations: readonly ProductWindowObservation[];
  readonly productPeriodSummaries: readonly ProductPeriodSummary[];
  readonly webResults: readonly WebDiscoveryResult[];
  readonly coverage: readonly ProviderCoverage[];
  readonly usage: ProviderUsage;
  readonly captures: readonly ProviderRawCapture[];
  readonly limitations: readonly string[];
}

export type CapabilityStatus = 'AVAILABLE' | 'NOT_CONFIGURED' | 'WAITING_FOR_INPUT' | 'UNSUPPORTED';

export interface ProviderCapabilityReport {
  readonly provider: ResearchAutomationProviderId;
  readonly displayName: string;
  /** Server environment variable that must hold the credential; null when none applies. Value never exposed. */
  readonly credentialEnv: string | null;
  readonly configured: boolean;
  readonly operations: Readonly<Record<CoverageOperation, { readonly status: CapabilityStatus; readonly reason: string }>>;
  /** AVAILABLE is backed by official docs plus synthetic contract tests, not by a live run in this release. */
  readonly verification: 'OFFICIAL_DOCS_AND_SYNTHETIC_CONTRACT_TESTS' | 'NONE';
  readonly limitations: readonly string[];
}

// ---- configuration and registry ----

export const PROVIDER_CREDENTIAL_ENV = Object.freeze({
  KALODATA: 'TDN_KALODATA_SECRET_KEY',
  SERPAPI: 'TDN_SERPAPI_API_KEY',
  APIFY_SHOPEE: 'TDN_APIFY_TOKEN',
} as const);

export interface ResearchAutomationProviderConfig {
  readonly kalodataSecretKey: string | null;
  readonly serpApiKey: string | null;
  /** Presence only matters for the capability report; no Apify operation is wired here. */
  readonly apifyTokenConfigured: boolean;
  /** Separate opt-in for exact-listing reviews; presence of a token alone does not enable spending. */
  readonly apifyReviews?: { readonly token: string; readonly maxChargeUsd: number; readonly maxReviewsPerProduct?: number };
  /**
   * Independent opt-in cap for TikTok comment test runs (P9, owner approved $3 per
   * test run on 08/10/2026). Config exposure only: no TikTok collector is wired
   * here and this never authorizes collection. Absent stays absent; it is never
   * defaulted to the approved test-run value. Token custody belongs to P9.
   */
  readonly apifyTikTokComments?: { readonly maxChargeUsd: number };
}

export class ProviderConfigurationError extends Error {
  readonly code = 'INVALID_PROVIDER_CONFIGURATION';
}

function credential(value: string | undefined, name: string): string | null {
  if (value === undefined || value === '') return null;
  if (value.length > 512 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new ProviderConfigurationError(`${name} is malformed`);
  }
  return value;
}

/** Reads credentials from server environment only. Error messages name the variable, never the value. */
export function researchAutomationProviderConfigFromEnv(env: NodeJS.ProcessEnv): ResearchAutomationProviderConfig {
  const token = credential(env[PROVIDER_CREDENTIAL_ENV.APIFY_SHOPEE], PROVIDER_CREDENTIAL_ENV.APIFY_SHOPEE);
  const capValue = env.TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD;
  const cap = capValue ? Number(capValue) : null;
  if (capValue && (!token || cap === null || !Number.isFinite(cap) || cap <= 0 || cap > 10000)) throw new ProviderConfigurationError('TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD requires an approved positive cap and APIFY token');
  // Optional per-listing review limit; unset keeps the collector default (500).
  const perListingValue = env.TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT;
  const perListing = perListingValue ? Number(perListingValue) : null;
  if (perListingValue && (cap === null || !/^\d+$/.test(perListingValue) || perListing === null || perListing < 1 || perListing > 500)) throw new ProviderConfigurationError('TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT requires a whole number from 1 to 500 and an approved charge cap');
  // Independent TikTok comment cap (P9). Absent is a distinct state from zero and
  // is never defaulted: the approved $3 test-run policy is not proof a cap is
  // configured. A malformed value fails closed like the Shopee cap.
  const tiktokCapValue = env.TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD;
  const tiktokCap = tiktokCapValue ? Number(tiktokCapValue) : null;
  if (tiktokCapValue && (tiktokCap === null || !Number.isFinite(tiktokCap) || tiktokCap <= 0 || tiktokCap > 10000)) throw new ProviderConfigurationError('TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD requires an approved positive cap');
  return {
    kalodataSecretKey: credential(env[PROVIDER_CREDENTIAL_ENV.KALODATA], PROVIDER_CREDENTIAL_ENV.KALODATA),
    serpApiKey: credential(env[PROVIDER_CREDENTIAL_ENV.SERPAPI], PROVIDER_CREDENTIAL_ENV.SERPAPI),
    apifyTokenConfigured: token !== null,
    ...(token && cap !== null ? { apifyReviews: { token, maxChargeUsd: cap, ...(perListing !== null ? { maxReviewsPerProduct: perListing } : {}) } } : {}),
    ...(tiktokCap !== null ? { apifyTikTokComments: { maxChargeUsd: tiktokCap } } : {}),
  };
}

export interface ResearchAutomationProviderRegistry {
  readonly providers: readonly ResearchAutomationProvider[];
  get(id: ResearchAutomationProviderId): ResearchAutomationProvider;
  capabilities(): ProviderCapabilityReport[];
  /** Providers whose capability for the operation is AVAILABLE (configured and supported). */
  available(operation: CoverageOperation): ResearchAutomationProvider[];
}

export function createResearchAutomationProviderRegistry(
  config: ResearchAutomationProviderConfig,
  transport: ProviderTransport = defaultProviderTransport,
): ResearchAutomationProviderRegistry {
  const providers: ResearchAutomationProvider[] = [
    createKalodataProvider(config.kalodataSecretKey, transport),
    createSerpApiProvider(config.serpApiKey, transport),
    createMetricProvider(),
    createApifyShopeeProvider(config.apifyTokenConfigured),
  ];
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  return {
    providers,
    get(id) {
      const provider = byId.get(id);
      if (!provider) throw new ProviderInputError('Unknown provider');
      return provider;
    },
    capabilities: () => providers.map(provider => provider.capability()),
    available: operation => providers.filter(provider => provider.capability().operations[operation].status === 'AVAILABLE'),
  };
}

// ---- honest non-network providers ----

const UNSUPPORTED_OPS = (reason: string): ProviderCapabilityReport['operations'] => ({
  QUICK_SEARCH_PRODUCT_CARDS: { status: 'UNSUPPORTED', reason },
  PRODUCT_PERIOD_DETAIL: { status: 'UNSUPPORTED', reason },
  WEB_DISCOVERY_CURRENT: { status: 'UNSUPPORTED', reason },
  METRIC_MARKET_EXPORT: { status: 'UNSUPPORTED', reason },
  SHOPEE_PRODUCT_DETAIL: { status: 'UNSUPPORTED', reason },
});

function staticProvider(id: ResearchAutomationProviderId, report: ProviderCapabilityReport,
  coverageOperation: CoverageOperation, status: 'WAITING_FOR_INPUT' | 'UNSUPPORTED'): ResearchAutomationProvider {
  const result = (requestedPeriod: DateWindow) => ({
    contractVersion: RESEARCH_AUTOMATION_PROVIDER_CONTRACT, provider: id, status,
    coverage: [unavailableCoverage(id, coverageOperation, status, requestedPeriod, report.limitations)],
    usage: emptyUsage(id), captures: [], limitations: report.limitations,
  });
  return {
    id,
    capability: () => report,
    async quickSearch(input) {
      return { ...result(input.requestedPeriod), searchWindow: null, cards: [],
        candidatePool: { rowsReturned: 0, validDistinctProducts: 0, duplicateRowsCollapsed: 0, invalidRows: 0 } };
    },
    async collect(input) {
      return { ...result(input.requestedPeriod), requestedPeriod: input.requestedPeriod,
        productObservations: [], productPeriodSummaries: [], webResults: [] };
    },
  };
}

function createMetricProvider(): ResearchAutomationProvider {
  const reason = 'Metric data is a manual authenticated workbook export; no verified unattended API exists.';
  const limitations = ['METRIC_MANUAL_EXPORT_REQUIRED', 'NO_UNATTENDED_METRIC_CONNECTOR'];
  return staticProvider('METRIC', {
    provider: 'METRIC', displayName: 'Metric', credentialEnv: null, configured: false,
    operations: { ...UNSUPPORTED_OPS('Metric provides market exports only.'),
      METRIC_MARKET_EXPORT: { status: 'WAITING_FOR_INPUT', reason } },
    verification: 'NONE', limitations,
  }, 'METRIC_MARKET_EXPORT', 'WAITING_FOR_INPUT');
}

function createApifyShopeeProvider(configured: boolean): ResearchAutomationProvider {
  const reason = 'The configured Apify actor scrapes Shopee reviews only; no verified Shopee product detail/image/description connector exists.';
  const limitations = ['SHOPEE_PRODUCT_DETAIL_CONNECTOR_UNVERIFIED', 'APIFY_REVIEWS_NOT_WIRED_TO_AUTOMATION'];
  return staticProvider('APIFY_SHOPEE', {
    provider: 'APIFY_SHOPEE', displayName: 'Shopee via Apify', credentialEnv: PROVIDER_CREDENTIAL_ENV.APIFY_SHOPEE,
    configured, operations: UNSUPPORTED_OPS(reason), verification: 'NONE', limitations,
  }, 'SHOPEE_PRODUCT_DETAIL', 'UNSUPPORTED');
}

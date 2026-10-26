import type {
  ResearchAutomationCoverageSource, ResearchAutomationInterview, ResearchAutomationMode, ResearchAutomationProductCard,
  ResearchAutomationReportKind, ResearchAutomationRunStatus, ResearchAutomationStepState,
} from '../../../../contracts/api/research-automation-api.generated.js';
import type { NativeSourceReviewReference } from './native-source-review-bridge.js';
import type { ExactShopeeOutcome } from './exact-shopee-outcome.js';
import type { DefaultMarketPeers } from '../../../../contracts/analysis/default-market-peers.generated.js';

export type { InsightCrosscheckSnapshot, InsightCrosscheckSelection } from '../../../../contracts/analysis/automation-insight-crosscheck.generated.js';

// New literal revisions retain their canonical output independently of coding.
export type { InsightLiteralSelection, AutomationInsightLiteralReportRevisionRequest } from '../../../../contracts/analysis/automation-insight-report-revision.generated.js';
export type { InsightLiteralEvidence as AutomationInsightLiteralSnapshot } from '../../../../contracts/analysis/insight-literal-evidence.generated.js';

export type StepId = 'QUICK_SEARCH' | 'COLLECTION' | 'REPORTS';
export type SourceStepId = Exclude<StepId, 'REPORTS'>;
export type RunStatus = ResearchAutomationRunStatus;
export type StepState = ResearchAutomationStepState;

export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(['DRAFT_READY', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
export const STEP_IDS: readonly StepId[] = ['QUICK_SEARCH', 'COLLECTION', 'REPORTS'];
export const MAX_PERIOD_DAYS = 1096;
export const RUN_LIST_LIMIT = 50;
export const MAX_PRINCIPAL_CARDS = 4;
export const MAX_CARDS = 24;
export const MAX_CAPTURES_PER_STEP = 512;
export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
/** Base64 request/response fields plus the bounded capture envelope overhead. */
export const MAX_CAPTURE_ENVELOPE_BYTES = Math.ceil(MAX_CAPTURE_BYTES * 4 / 3) + 8192;
export const MAX_JSON_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const MAX_HTML_BYTES = 16 * 1024 * 1024;
export const MAX_PDF_BYTES = 64 * 1024 * 1024;

/** Exact start snapshot persisted before the run exists; its digest is the request identity. */
export interface StartSnapshot {
  readonly metricV3Preset?: import('./metric-v3-capture-spec.js').MetricV3CaptureSpec;
  readonly reviewCollectionPolicy?: import('../../../../contracts/analysis/automation-review-collection-policy.generated.js').AutomationReviewCollectionPolicy;
  /** Explicit injected source configuration, frozen only for new private starts. No salt. */
  readonly privateShopeeSource?: import('../../../../contracts/analysis/automation-private-shopee-source.generated.js').AutomationPrivateShopeeSource;
  /** Explicit additive source policy; marker-free historical starts retain v1 behavior. */
  readonly sourceEvidenceVersion?: 'automation-source-evidence-v1';
  readonly contractVersion: 'research-automation-start-snapshot-v1';
  readonly workspaceId: string;
  readonly country: 'VN';
  readonly mode: ResearchAutomationMode;
  readonly keyword: string;
  readonly description: string | null;
  readonly interview: ResearchAutomationInterview | null;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string; readonly dayCount: number };
  readonly reports: readonly ResearchAutomationReportKind[];
  /** Start v2 only. False continues with keyword 1 instead of stopping for keyword 2; absent keeps the legacy wait. */
  readonly waitForKeyword2?: boolean;
  /** Frozen before discovery/sales reads; absent on historical starts. */
  readonly defaultPeerRule?: DefaultMarketPeers['input']['rule'];
}

/** Exact owner-approved scope; peers are explicit and never implied by selection. */
export interface ScopeSnapshot {
  /** Frozen by the explicit trial confirmation; never inferred from retained review packages. */
  readonly testReviewCap?: number;
  readonly contractVersion: 'research-automation-scope-snapshot-v1';
  readonly workspaceId: string;
  readonly runId: string;
  readonly definition: string;
  readonly includeTerms: readonly string[];
  readonly excludeTerms: readonly string[];
  readonly selectedProductIds: readonly string[];
  readonly peerProductIds: readonly string[];
  /** Owner-selected listing URLs, absent on historical runs. */
  readonly exactShopeeUrls?: readonly string[];
}

export interface SourceLimitation {
  readonly code: string;
  readonly provider: string | null;
  readonly message: string;
}

/** A typed, source-located measure for one exact product. Never a market total. */
export interface TypedComparable {
  readonly productId: string;
  readonly provider: string;
  readonly metric: 'GMV_VND' | 'UNITS_SOLD';
  readonly value: string;
  readonly window: { readonly startDate: string; readonly endDate: string };
  /** Index into the same step's captures; the exact raw bytes this value was read from. */
  readonly captureIndex: number;
}

/** One web search per collection; the provider requests and keeps at most 10 organic results. */
export const MAX_WEB_RESULTS = 10;

/** One organic web search result as returned at retrieval time; captureIndex locates its raw response. */
export interface StepWebResult {
  readonly position: number;
  readonly title: string;
  readonly url: string;
  readonly snippet: string | null;
  /** Page name and publish date as the search engine shows them; absent in results stored before they were kept. */
  readonly site?: string | null;
  readonly published?: string | null;
  readonly retrievedAt: string;
  readonly captureIndex: number;
  /** In-memory only (never in a stored plain row): which extra search produced this row. */
  readonly origin?: ExpandedSearchKind;
}

/** Extra search pointers of the collection step (S19): at most one per kind per run, a fixed set decided in code. */
export const EXPANDED_SEARCH_KINDS = ['WINDOW', 'SHOPEE', 'TIKTOK'] as const;
export type ExpandedSearchKind = typeof EXPANDED_SEARCH_KINDS[number];
export const EXPANDED_SEARCH_REASONS = ['NOT_PLANNED', 'PROVIDER_FAILED', 'CANCELLED', 'BUDGET_EXHAUSTED'] as const;
export type ExpandedSearchReason = typeof EXPANDED_SEARCH_REASONS[number];

export interface StepExpandedQuery {
  readonly kind: ExpandedSearchKind;
  readonly status: 'COLLECTED' | 'FAILED' | 'SKIPPED';
  readonly reason: ExpandedSearchReason | null;
  /** The report window a dated search was limited to; null for the site-scoped kinds. */
  readonly requestedWindow: { readonly startDate: string; readonly endDate: string } | null;
  readonly retrievedAt: string | null;
  /** Index into the same step's captures; null when no call was made. */
  readonly captureIndex: number | null;
  /** Rows after URL dedupe against the plain web rows; bounded like the plain web rows. */
  readonly results: readonly StepWebResult[];
}

export interface StepExpandedSearch { readonly queries: readonly StepExpandedQuery[] }

/** One relative search-interest series per collection (0-100, peak = 100); never a count of searches. */
export const MAX_SEARCH_INTEREST_POINTS = 128;
/** Custom ranges can return daily or multi-year series; retain the whole response within this bound. */
export const MAX_SEARCH_INTEREST_RANGE_POINTS = 2048;
/** PERIOD_NOT_COVERED is the older single skip reason (last-12-months window); new documents use the three period reasons. */
export const SEARCH_INTEREST_REASONS = ['PERIOD_NOT_COVERED', 'PERIOD_INVALID', 'PERIOD_BEFORE_PROVIDER_START', 'PERIOD_IN_FUTURE', 'PROVIDER_FAILED', 'EMPTY_SERIES', 'CANCELLED'] as const;
export type SearchInterestReason = typeof SEARCH_INTEREST_REASONS[number];

export interface StepSearchInterestPoint {
  readonly period: string;
  readonly index: number | null;
}

/** Present only on runs that had the search-interest lane switched on; failures keep a reason and no points. */
export interface StepSearchInterest {
  readonly status: 'COLLECTED' | 'FAILED' | 'SKIPPED';
  readonly reason: SearchInterestReason | null;
  readonly keyword: string;
  readonly geo: 'VN';
  readonly unit: 'INDEX_0_100';
  /** REQUESTED_RANGE: the provider was asked for requestedRange. LAST_12_MONTHS: older documents. */
  readonly window: 'LAST_12_MONTHS' | 'REQUESTED_RANGE';
  readonly requestedRange?: { readonly startDate: string; readonly endDate: string };
  readonly retrievedAt: string | null;
  readonly points: readonly StepSearchInterestPoint[];
  /** Index into the same step's captures; null when no call was made. */
  readonly captureIndex: number | null;
}

/** One relative search-interest map by province per collection (0-100, top place = 100); never a count of searches or buyers. */
export const MAX_SEARCH_GEO_PROVINCES = 80;
export const SEARCH_GEO_REASONS = ['PERIOD_NOT_COVERED', 'PERIOD_INVALID', 'PERIOD_BEFORE_PROVIDER_START', 'PERIOD_IN_FUTURE', 'PROVIDER_FAILED', 'EMPTY_MAP', 'CANCELLED'] as const;
export type SearchGeoReason = typeof SEARCH_GEO_REASONS[number];

export interface StepSearchGeoProvince {
  readonly name: string;
  readonly index: number | null;
}

/** Present only on runs that had the province lane switched on; regions and the choice are computed at render time. */
export interface StepSearchGeo {
  readonly status: 'COLLECTED' | 'FAILED' | 'SKIPPED';
  readonly reason: SearchGeoReason | null;
  readonly keyword: string;
  readonly geo: 'VN';
  readonly unit: 'INDEX_0_100';
  /** REQUESTED_RANGE: the provider was asked for requestedRange. LAST_12_MONTHS: older documents. */
  readonly window: 'LAST_12_MONTHS' | 'REQUESTED_RANGE';
  readonly requestedRange?: { readonly startDate: string; readonly endDate: string };
  readonly retrievedAt: string | null;
  readonly provinces: readonly StepSearchGeoProvince[];
  /** Index into the same step's captures; null when no call was made. */
  readonly captureIndex: number | null;
}

/** Latest non-null World Bank observation per indicator (open country-level background, S23); source text is kept unchanged. */
export interface StepWorldBankRow {
  readonly indicatorName: string;
  /** Original source name and display precision; absent on older stored documents. */
  readonly sourceIndicatorName?: string;
  readonly decimal?: number;
  readonly value: string;
  readonly unit: string | null;
  readonly year: string;
  readonly lastUpdated: string;
  readonly statusLiteral: string;
  readonly footnote: string | null;
  readonly locator: string;
}
export interface StepWorldBankIndicator {
  readonly code: string;
  readonly status: 'COLLECTED' | 'FAILED';
  /** Reason code of a dropped indicator; null when collected. */
  readonly reason: string | null;
  readonly retrievedAt: string | null;
  /** Indexes into the same step's captures (observation response, metadata response). */
  readonly captureIndex: number | null;
  readonly metadataCaptureIndex: number | null;
  readonly sourceSha256: string | null;
  readonly metadataSha256: string | null;
  readonly row: StepWorldBankRow | null;
  /** Up to the last 10 years ending at `row.year`, read from the same projection; null is a gap (never carried forward).
   * Optional: documents stored before this field have no series and draw no chart. */
  readonly series?: readonly StepWorldBankPoint[];
}
export interface StepWorldBankPoint { readonly year: string; readonly value: string | null }
export interface StepWorldBank { readonly profile: string; readonly indicators: readonly StepWorldBankIndicator[] }
/** S28 whole-population baseline read from a local built file (no network). Only count tables; never evidence about buyers. */
export type StepPopulationBaseline = {
  readonly profile: 'population-baseline-v1'; readonly status: 'COLLECTED'; readonly reason: null; readonly captureIndex: number;
  readonly retrievedAt: string; readonly sourceSha256: string;
  readonly baseline: import('../../../../contracts/analysis/population-baseline-v1.generated.js').PopulationBaselineV1;
} | {
  readonly profile: 'population-baseline-v1'; readonly status: 'SKIPPED'; readonly reason: 'FILE_MISSING' | 'FILE_INVALID'; readonly captureIndex: null;
  readonly retrievedAt: null; readonly sourceSha256: null; readonly baseline: null;
};

/** UN Comtrade country-level trade figures for one estimated HS6 code (S24). Background only; never combined with sample numbers. */
export type StepComtradeStatus = 'OK' | 'HS_CODE_NOT_CONFIRMED' | 'RATE_LIMITED' | 'NO_DATA' | 'MODEL_NOT_CONFIGURED' | 'FAILED' | 'CANCELLED';
export interface StepComtradeRow {
  readonly side: 'OWN' | 'MIRROR';
  readonly reporter: string;
  readonly flow: 'M' | 'X';
  readonly year: string;
  /** USD value exactly as the source gave it (plain decimal). */
  readonly value: string;
  /** Index into the same step's captures (the response this row was read from). */
  readonly captureIndex: number;
}
export interface StepComtradeCall {
  readonly kind: 'MIRROR' | 'OWN_IMPORT' | 'OWN_EXPORT';
  readonly year: string;
  readonly outcome: 'ROWS' | 'EMPTY';
  readonly captureIndex: number;
  readonly retrievedAt: string;
  readonly responseSha256: string;
}
export interface StepComtradeAttempt {
  readonly hsCode: string;
  readonly outcome: 'CONFIRMED' | 'REJECTED' | 'NO_DATA' | 'STOPPED';
  readonly reason: 'OFFICIAL_DESCRIPTION_COVERED' | 'NOT_COVERED' | 'MODEL_ANSWER_INVALID' | 'NO_SOURCE_ROWS' | 'RATE_LIMITED' | 'FAILED' | 'CANCELLED' | 'BUDGET_EXHAUSTED';
}
export interface StepComtrade {
  readonly profile: 'comtrade-v1';
  readonly status: StepComtradeStatus;
  readonly hsCode: string | null;
  /** Official English description from the response; shown with the automatic Vietnamese gloss. */
  readonly officialDescription: string | null;
  readonly descriptionVi: string | null;
  readonly reasonVi: string | null;
  /** Candidate decisions and closed reason codes; model prose is never used as the code. */
  readonly attempts: readonly StepComtradeAttempt[];
  readonly calls: readonly StepComtradeCall[];
  /** Own-side rows plus the top mirror reporters by value. */
  readonly rows: readonly StepComtradeRow[];
  /** Number of reporting countries in the mirror response; null when no mirror response was kept. */
  readonly mirrorReporterCount: number | null;
}

/** Ad counts of each top brand's own website in the public search-ads library (S17). Advertiser names, ids, images, links and ad ids are never stored. */
export type StepSearchAdsStatus = StepSearchAds['status'];
export type StepSearchAdsBrandStatus = StepSearchAdsBrand['status'];
export type { SearchAdsBrandV1, SearchAdsBrandV2 } from '../../../../contracts/analysis/automation-search-ads.generated.js';
export type StepSearchAds = import('../../../../contracts/analysis/automation-search-ads.generated.js').AutomationSearchAds;
export type StepSearchAdsBrand = StepSearchAds['brands'][number];
/** Cục Thống kê monthly workbook figures for one product category group (S21). Background only; never combined with sample numbers. */
export type StepOfficialStatsStatus = 'OK' | 'PARTIAL' | 'NO_DATA' | 'LIST_FAILED' | 'NO_MONTHLY_WORKBOOK' | 'DOWNLOAD_FAILED' | 'READER_UNAVAILABLE'
  | 'LAYOUT_UNKNOWN' | 'CATEGORY_NOT_MAPPED' | 'MODEL_NOT_CONFIGURED' | 'FAILED' | 'CANCELLED';
export type StepOfficialStatsTableId = 'RETAIL' | 'CPI' | 'EXPORT' | 'IMPORT' | 'CPI_WORKBOOK';
/** The status word printed in the table header: Ước tính, Sơ bộ, Chính thức; NOT_STATED when the table prints none. */
export type StepOfficialStatsValueStatus = 'UOC_TINH' | 'SO_BO' | 'CHINH_THUC' | 'NOT_STATED';
export interface StepOfficialStatsFile {
  readonly role: 'MONTHLY' | 'CPI';
  /** Step capture ordinal of the stored workbook bytes. */
  readonly captureIndex: number;
  readonly url: string;
  readonly title: string;
  /** Publication date from the listing (`date` field). */
  readonly listedAt: string;
  readonly retrievedAt: string;
  readonly sha256: string;
  /** True when the listing held an older file for the same month: this file is the newer revision. */
  readonly revised: boolean;
}
export interface StepOfficialStatsTable {
  readonly table: StepOfficialStatsTableId;
  readonly captureIndex: number;
  readonly outcome: 'READ' | 'LAYOUT_UNKNOWN' | 'NOT_FOUND';
  readonly sheet: string | null;
  /** The pinned layout variant the header matched; null unless READ. */
  readonly variant: string | null;
}
export interface StepOfficialStatsValue {
  readonly table: StepOfficialStatsTableId;
  readonly captureIndex: number;
  readonly sheet: string;
  readonly row: number;
  readonly cell: string;
  /** The row label exactly as the sheet prints it (NFC, whitespace collapsed). */
  readonly label: string;
  /** Period from the table header, e.g. "Tháng 9 năm 2026" (digits are the source's own). */
  readonly period: string;
  readonly measure: 'LEVEL' | 'INDEX';
  /** The stored cell value exactly as written in the workbook (plain decimal); null when the cell is blank, "-", ".." or not a number. */
  readonly value: string | null;
  /** The same value rounded to the cell's own display precision (plain decimal, shown with a decimal comma); null when missing. */
  readonly shown: string | null;
  /** Unit of a level, e.g. "tỷ đồng"; null for an index. */
  readonly unit: string | null;
  /** Comparison base of an index taken from the header, e.g. "cùng kỳ năm trước"; null for a level. */
  readonly base: string | null;
  readonly status: StepOfficialStatsValueStatus;
}
export interface StepOfficialStats {
  readonly profile: 'official-stats-v1';
  readonly status: StepOfficialStatsStatus;
  /** One category group of the versioned map; null when none was confirmed. */
  readonly categoryGroup: string | null;
  readonly reasonVi: string | null;
  readonly listCaptureIndex: number | null;
  readonly files: readonly StepOfficialStatsFile[];
  readonly tables: readonly StepOfficialStatsTable[];
  readonly values: readonly StepOfficialStatsValue[];
  /** Province sheet of the same stored CPI workbook (S22). Absent unless the province flag was on and that workbook was stored. */
  readonly provinces?: StepOfficialStatsProvinces;
}
/** One cell of the province sheet: a requested CPI group row at one province/city column. */
export interface StepOfficialStatsProvinceValue {
  readonly row: number;
  readonly cell: string;
  /** The row label exactly as the sheet prints it (NFC, whitespace collapsed). */
  readonly label: string;
  /** The column's province/city name exactly as the header prints it. */
  readonly province: string;
  /** The stored cell value exactly as written in the workbook (plain decimal); null when blank or not a number. */
  readonly value: string | null;
  /** The same value rounded to the cell's display precision; null when missing. */
  readonly shown: string | null;
}
/** Cục Thống kê consumer price index by province/city (S22), read from the stored CPI workbook of the S21 lane; no extra request. */
export interface StepOfficialStatsProvinces {
  /** Step capture ordinal of the stored CPI workbook (the `files` entry with role CPI). */
  readonly captureIndex: number;
  readonly outcome: 'READ' | 'LAYOUT_UNKNOWN' | 'NOT_FOUND';
  readonly sheet: string | null;
  /** The pinned layout variant the header matched; null unless READ. */
  readonly variant: string | null;
  /** "Tháng 9 năm 2026"; null unless READ. */
  readonly period: string | null;
  /** The comparison base as stated by the sheet ("tháng trước"); null unless READ. */
  readonly base: string | null;
  /** Province/city names in sheet order. */
  readonly provinces: readonly string[];
  readonly values: readonly StepOfficialStatsProvinceValue[];
}

/** Automatic Meta ad-library reading (S15, AUTO origin). Spans are UTF-8 byte offsets into the retained read text. */
export type StepMetaAutoStatus = 'OK' | 'NO_DATA' | 'NO_BRANDS' | 'STOPPED' | 'FAILED' | 'CANCELLED';
export type StepMetaAutoStop = 'CAPTCHA' | 'LOGIN_REQUIRED' | 'BLOCKED' | 'UI_CHANGED' | 'LOGGED_IN_SESSION_PRESENT';
export type StepMetaAutoBrandStatus = 'OK' | 'PAGE_NOT_FOUND' | 'PAGE_AMBIGUOUS' | 'UI_CHANGED' | 'READ_FAILED' | 'STOPPED' | 'NOT_READ' | 'CANCELLED';
export interface StepMetaAutoSpan { readonly start: number; readonly end: number }
export interface StepMetaAutoAd {
  readonly libraryId: string;
  readonly idSpan: StepMetaAutoSpan;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  readonly statusSpan: StepMetaAutoSpan | null;
  /** YYYY-MM-DD; null when the start label or its date could not be read (never guessed). */
  readonly startedOn: string | null;
  readonly startSpan: StepMetaAutoSpan | null;
}
export interface StepMetaAutoRead {
  readonly kind: 'SEARCH' | 'PAGE';
  readonly brandIndex: number;
  readonly requestedUrl: string;
  readonly finalUrl: string | null;
  readonly outcome: 'READ' | 'UI_CHANGED' | 'STOPPED' | 'FAILED' | 'CANCELLED';
  readonly stop: StepMetaAutoStop | null;
  /** False when nothing of this read was kept (a logged-in browser, or a failed command). */
  readonly retained: boolean;
  readonly textSha256: string | null;
  readonly textBytes: number | null;
  readonly readAt: string;
}
export interface StepMetaAutoBrand {
  readonly label: string;
  readonly key: string;
  readonly status: StepMetaAutoBrandStatus;
  /** Chosen by an exact normalized name match on the keyword-search page; not ownership-verified. */
  readonly pageId: string | null;
  readonly searchRead: number | null;
  readonly pageRead: number | null;
  /** The page's own "~n results" wording, kept as a literal only. */
  readonly resultCount: string | null;
  readonly resultCountSpan: StepMetaAutoSpan | null;
  /** Library ids seen more than once with conflicting fields; refused and not counted. */
  readonly refusedIds: number;
  readonly ads: readonly StepMetaAutoAd[];
}
export interface StepMetaAuto {
  readonly profile: 'meta-ad-library-visible-text-v1';
  readonly status: StepMetaAutoStatus;
  readonly stop: StepMetaAutoStop | null;
  readonly reasonVi: string | null;
  /** Page opens issued (keyword search and page opens together). */
  readonly opens: number;
  readonly evidence: { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string } | null;
  readonly reads: readonly StepMetaAutoRead[];
  readonly brands: readonly StepMetaAutoBrand[];
}

/** Automatic TikTok top-ads reading (S16, AUTO origin). Spans are UTF-8 byte offsets into the retained read text. */
export type StepTikTokTopAdsStatus = 'OK' | 'NO_DATA' | 'NO_KEYWORD' | 'STOPPED' | 'FAILED' | 'CANCELLED';
export type StepTikTokTopAdsStop = 'CAPTCHA' | 'LOGIN_REQUIRED' | 'BLOCKED' | 'UI_CHANGED' | 'LOGGED_IN_SESSION_PRESENT';
export interface StepTikTokTopAdsSpan { readonly start: number; readonly end: number }
/** A visible literal kept exactly as shown on the page. */
export interface StepTikTokTopAdsField { readonly text: string; readonly span: StepTikTokTopAdsSpan }
export interface StepTikTokTopAdsRead {
  readonly requestedUrl: string;
  readonly finalUrl: string | null;
  readonly outcome: 'READ' | 'UI_CHANGED' | 'STOPPED' | 'FAILED' | 'CANCELLED';
  readonly stop: StepTikTokTopAdsStop | null;
  /** False when nothing of this read was kept (a logged-in browser, or a failed command). */
  readonly retained: boolean;
  readonly textSha256: string | null;
  readonly textBytes: number | null;
  readonly readAt: string;
}
export interface StepTikTokTopAdsCard {
  readonly read: number;
  readonly caption: StepTikTokTopAdsField;
  readonly account: StepTikTokTopAdsField | null;
  readonly industry: StepTikTokTopAdsField | null;
  readonly objective: StepTikTokTopAdsField | null;
  /** The page's like-count wording, kept as a literal only. */
  readonly likes: StepTikTokTopAdsField | null;
}
export interface StepTikTokTopAds {
  readonly profile: 'tiktok-top-ads-visible-text-v1';
  readonly status: StepTikTokTopAdsStatus;
  readonly stop: StepTikTokTopAdsStop | null;
  readonly reasonVi: string | null;
  readonly keyword: string | null;
  readonly opens: number;
  readonly evidence: { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string } | null;
  readonly reads: readonly StepTikTokTopAdsRead[];
  /** Cards whose caption matches the product keyword meaning. */
  readonly cards: readonly StepTikTokTopAdsCard[];
  /** Cards whose caption did not match the keyword meaning; counted, never listed. */
  readonly droppedCards: number;
  /** Cards refused because the caption carried a forbidden figure or was too long. */
  readonly refusedCards: number;
}

/** One considered public TikTok video of the video-watch lane, pinned at collection time. */
export interface StepVideoWatchCandidate { readonly videoId: string; readonly url: string; readonly origin: 'SELECTION' | 'TOP_SELLING' | 'EXPANDED_SEARCH' }
export type StepVideoWatchReason = 'OVER_10_VIDEOS' | 'DOWNLOAD_FAILED' | 'VIDEO_TOO_LONG' | 'VIDEO_TOO_LARGE' | 'NOT_A_VIDEO'
  | 'MODEL_FAILED' | 'MODEL_ANSWER_INVALID' | 'CREDENTIAL_ECHO_REFUSED' | 'PUBLICATION_FAILED' | 'CANCELLED' | 'PROVIDER_FAILED' | 'DOCUMENT_INVALID' | 'VIDEO_MODEL_NOT_CONFIGURED';
export interface StepVideoWatchMedia { readonly sha256: string; readonly byteSize: number; readonly durationSeconds: number; readonly downloadedAt: string }
/** How a video was read: its own Vietnamese subtitle file, or the downloaded video watched by the model. */
export type StepVideoWatchPath = 'SUBTITLE' | 'VIDEO';
export interface StepVideoWatchVideo {
  readonly videoId: string;
  readonly status: 'READ' | 'SKIPPED';
  readonly reason: StepVideoWatchReason | null;
  /** Step capture ordinal of the stored model answer; null when no answer was stored. */
  readonly captureIndex: number | null;
  readonly retrievedAt: string | null;
  /** For a SUBTITLE read, the subtitle file (sha256/size of its bytes, length from the video's metadata). */
  readonly media: StepVideoWatchMedia | null;
  /** Absent when neither path was reached (and on documents stored before subtitles were read). */
  readonly path?: StepVideoWatchPath;
  readonly reading: { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string; readonly readingSha256: string } | null;
}
/** The automated top-selling video lookup (S14): per product its outcome and stored capture, and how many videos were kept. */
export interface StepTopSellingVideoRank {
  readonly creditExhausted: boolean;
  /** Top-selling videos taken from the lookup (at most five), before the candidate cap. */
  readonly kept: number;
  readonly products: readonly { readonly productId: string; readonly outcome: 'OK' | 'EMPTY' | 'FAILED' | 'AMBIGUOUS_NO_RETRY' | 'NOT_RUN_CREDIT_EXHAUSTED' | 'NOT_RUN_STOPPED' | 'NOT_RUN_CANCELLED';
    readonly captureIndex: number | null }[];
}
/** Automated seller-video watching; absent unless the video-watch lane was on for the run. */
export interface StepVideoWatch {
  readonly profile: 'video-watch-v1';
  readonly candidatesSha256: string;
  readonly candidates: readonly StepVideoWatchCandidate[];
  readonly skipped: readonly { readonly videoId: string; readonly reason: 'OVER_10_VIDEOS' }[];
  readonly videos: readonly StepVideoWatchVideo[];
  /** Absent unless the automated top-selling video lookup was on for the run. */
  readonly topSellingRank?: StepTopSellingVideoRank;
}

/** Closed reason codes of the automatic report-PDF lane (S25); a reason never fails the run. */
export type PdfDiscoveryReason =
  | 'NO_CANDIDATE' | 'SEARCH_SKIPPED_ENOUGH' | 'SEARCH_NO_ADMISSION' | 'SEARCH_FAILED' | 'NOT_ADMITTED'
  | 'URL_REFUSED' | 'PRIVATE_ADDRESS' | 'DNS_FAILED' | 'TOO_MANY_REDIRECTS' | 'FILE_SIZE_LIMIT' | 'NOT_A_PDF'
  | 'BRIDGE_BUDGET_LIMIT' | 'TIMEOUT' | 'HTTP_ERROR' | 'DUPLICATE' | 'TRANSPORT' | 'CANCELLED' | 'DOCUMENT_INVALID'
  | 'PAGE_LIMIT' | 'SKIPPED_NO_QUESTION_BUDGET' | 'SKIPPED_READER_OFF';

/** One downloaded (or refused) report PDF. `captureIndex` is the step capture ordinal of the stored file. */
export interface StepPdfDiscoveryFile {
  readonly origin: 'RUN_ROWS' | 'PDF_SEARCH';
  readonly url: string;
  readonly status: 'DOWNLOADED' | 'FAILED';
  readonly reason: PdfDiscoveryReason | null;
  readonly captureIndex: number | null;
  readonly retrievedAt: string | null;
  /** sha256 of the exact PDF bytes (the same identity the retained run PDF and its excerpts carry). */
  readonly sourceSha256: string | null;
  readonly byteSize: number | null;
}

/** Automatic report-PDF discovery of the collection step; absent unless the lane was on for the run. */
export interface StepPdfDiscovery {
  readonly search: {
    readonly status: 'CALLED' | 'SKIPPED' | 'FAILED';
    readonly reason: PdfDiscoveryReason | null;
    readonly captureIndex: number | null;
    readonly retrievedAt: string | null;
  };
  readonly files: readonly StepPdfDiscoveryFile[];
  /** Set when no file was downloaded. */
  readonly reason: PdfDiscoveryReason | null;
  /** Report-time overlay, never stored in the step document: some retained document was not read (late) or was read in full. */
  readonly readState?: 'NOT_READ_IN_TIME' | 'NOT_READ';
}

/** Where a blocked run's number-trace gate result is stored, with its headline counts. */
export interface StepNumberTraceGate {
  readonly gateVersion: string;
  readonly resultSha256: string;
  readonly resultPath: string;
  readonly coveredUntraced: number;
  readonly mismatches: number;
}

/** Normalized step outcome retained as canonical JSON; raw bytes are separate capture artifacts. */
export interface StepResultDocument {
  readonly publicReviewAcquisition?: import('../../../platform/collectors/shopee-public-reviews.js').PublicReviewStage;
  readonly reviewSample?: import('../../../../contracts/analysis/automation-review-sample.generated.js').AutomationReviewSample;
  readonly sourceEvidence?: import('../../../../contracts/analysis/automation-source-evidence.generated.js').AutomationSourceEvidence;
  readonly contractVersion: 'research-automation-step-result-v1';
  readonly runId: string;
  readonly stepId: StepId;
  readonly pdfReadings?: readonly import('../pageindex-questions.js').PageIndexDocumentReading[];
  /** REPORTS step blocked by the Market number-trace gate (P5): the stored gate result, findable from the run without the operator log. */
  readonly numberTraceGate?: StepNumberTraceGate;
  readonly outcome: 'SUCCEEDED' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  readonly productCards: readonly ResearchAutomationProductCard[];
  readonly comparables: readonly TypedComparable[];
  readonly coverage: readonly ResearchAutomationCoverageSource[];
  readonly limitations: readonly SourceLimitation[];
  /** Web search results of the collection step; absent on runs without a web source. */
  readonly webResults?: readonly StepWebResult[];
  /** Relative search interest of the collection step; absent unless the lane was on for the run. */
  readonly searchInterest?: StepSearchInterest;
  /** Relative search interest by province of the collection step; absent unless the province lane was on for the run. */
  readonly searchGeo?: StepSearchGeo;
  /** Extra search pointers; absent unless the lane was on for the run. */
  readonly expandedSearch?: StepExpandedSearch;
  /** Open country-level background; absent unless the World Bank lane was on for the run. */
  readonly worldBank?: StepWorldBank;
  /** Whole-population baseline (S28) for Insight I02; absent unless the lane was on and the run includes INSIGHT. */
  readonly populationBaseline?: StepPopulationBaseline;
  /** Country-level trade figures for the estimated HS code; absent unless the UN Comtrade lane was on for the run. */
  readonly comtrade?: StepComtrade;
  /** Search-ads library counts of the top brands' websites; absent unless the lane was on for the run. */
  readonly searchAds?: StepSearchAds;
  /** Cục Thống kê monthly figures for the product's category group; absent unless the official-statistics lane was on for the run. */
  readonly officialStats?: StepOfficialStats;
  /** Automatic Meta ad-library reading of the selected brands; absent unless the Meta auto lane was on for the run. */
  readonly metaAuto?: StepMetaAuto;
  /** Automatic TikTok top-ads reading for the product keyword; absent unless the TikTok top-ads lane was on for the run. */
  readonly tiktokTopAds?: StepTikTokTopAds;
  /** Automated seller-video speech readings; absent unless the video-watch lane was on for the run. */
  readonly videoWatch?: StepVideoWatch;
  /** Automatically found industry-report PDFs; absent unless the report-PDF lane was on for the run. */
  readonly pdfDiscovery?: StepPdfDiscovery;
  /** TikTok Shop review counts and the private document digest (S06); absent unless the lane was on for the run. Never review text. */
  readonly tiktokShopReviews?: import('../../../../contracts/analysis/automation-tiktok-shop-reviews.generated.js').StepTikTokShopReviews;
  /** Sanitized Foundation3 reference; mutually exclusive with raw/native review. */
  readonly privateShopee?: import('./private-review-corpus.js').PrivateReviewReference;
  readonly exactShopee?: {
    readonly collectionId: string;
    readonly collectionSha256: string;
    readonly requestSha256: string;
  };
  /** Classified exact-Shopee review outcome; absent on runs stored before it was kept. */
  readonly exactShopeeOutcome?: {
    readonly testReviewCap?: number;
    readonly outcome: ExactShopeeOutcome;
    readonly listings: readonly { readonly listingUrl: string; readonly reviews: number; readonly shortfallReason?: 'RETURNED_COUNT_BELOW_REQUESTED' }[];
    readonly providerMessage: string | null;
    readonly attemptedAt: string;
    readonly reused: boolean;
  };
  /** A reused native capture, never projected as a new provider collection. */
  readonly nativeReview?: NativeSourceReviewReference;
}

export interface CaptureRecord {
  readonly stepId: SourceStepId;
  readonly ordinal: number;
  readonly artifactSha256: string;
  readonly mediaType: string;
  readonly provider: string;
  readonly operation: string;
  readonly retrievedAt: string;
  readonly window: { readonly startDate: string; readonly endDate: string } | null;
  readonly truncated: boolean;
}

/** Step message code when the Market number-trace gate blocks the draft (market-number-trace.ts). */
export const MARKET_NUMBER_TRACE_BLOCKED = 'MARKET_NUMBER_TRACE_BLOCKED';

/** Step message and limitation code when the sales-data source stopped for credit. */
export const PROVIDER_CREDIT_EXHAUSTED = 'PROVIDER_CREDIT_EXHAUSTED';

/** Step and limitation code when a provider answered HTTP 5xx or any non-standard status at or above 500. */
export const PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE';

/** Owner-facing text for one observed provider HTTP status. */
export function providerUnavailableMessage(status: number): string {
  return `Máy chủ nguồn dữ liệu trả lỗi (HTTP ${status}) nên bước này dừng. Thường chỉ xảy ra một lần; tạo lượt mới để thử lại.`;
}

/** Fixed, server-authored, safe step/blocker messages. Provider text never reaches these. */
export const MESSAGES: Readonly<Record<string, string>> = {
  PROVIDER_NOT_CONFIGURED: 'No research data provider is configured on this operator; nothing was collected.',
  PROVIDER_FAILED: 'The provider operation failed and was not retried automatically.',
  PROVIDER_UNAVAILABLE: 'Máy chủ nguồn dữ liệu trả lỗi nên bước này dừng. Thường chỉ xảy ra một lần; tạo lượt mới để thử lại.',
  PROVIDER_CREDIT_EXHAUSTED: 'The provider stopped because its credit balance is used up; nothing more was requested. Top up and start a new run; it was not retried automatically.',
  KALODATA_REPLAY_MISS: 'Replay test instance: a sales-data request had no stored answer from the source run, so it was not sent to the live source and its data is missing.',
  KALODATA_REPLAY_SCOPE_MISMATCH: 'Replay test instance: the keyword or period of this run differs from the source run, so it was stopped before any provider request.',
  PROVIDER_OUTPUT_INVALID: 'The provider returned data that failed validation; the result was rejected and nothing was inferred from it.',
  SCOPE_FILTERS_NOT_APPLIED: 'The confirmed scope definition and terms were retained, but provider-side filtering for those criteria is not implemented in this run.',
  STEP_TIMEOUT: 'The provider operation exceeded the operator time bound and was stopped; it was not retried.',
  CANCELLED_BY_OWNER: 'Cancelled by the owner.',
  CANCELLED_DURING_PROVIDER_OPERATION: 'Cancelled while a provider operation was in flight; any charge for that operation is unknown.',
  OPERATOR_STOPPED: 'The operator stopped during a provider operation. It was not retried automatically; start a new run to collect again. Provider captures returned before the stop are preserved; an in-flight response may be unavailable.',
  EXECUTOR_RESTARTED: 'The operator restarted during a provider operation. It was not retried automatically; start a new run to collect again.',
  SKIPPED_AFTER_STOP: 'Not run because an earlier step stopped the run.',
  NO_APPROVED_PRODUCT_REFS: 'No product was approved for collection, so no product period detail was requested or collected.',
  REPORT_RENDER_FAILED: 'Draft rendering failed; collected data and raw captures are preserved.',
  MARKET_NUMBER_TRACE_BLOCKED: 'Báo cáo bị chặn: có con số không truy được về số liệu đã lưu, hoặc tính lại không ra đúng số in. Danh sách số, phần và ngữ cảnh được lưu cùng lần chạy.',
  INTERRUPTED_DURING_PROVIDER_OPERATION: 'A paid provider operation was interrupted. It was not retried automatically; captures returned before interruption are preserved and an in-flight response may be unavailable.',
  USAGE_UNKNOWN: 'At least one provider operation ended without a settled usage receipt; its cost is unknown, not zero.',
  PDF_RENDERER_NOT_CONFIGURED: 'PDF renderer is not configured on this operator.',
  PDF_RENDER_FAILED: 'PDF rendering failed on this operator; the web version is unaffected.',
};

/**
 * Market completeness gate: a paid product-period collection was attempted
 * and n selected products miss at least one planned window. The count is the
 * only parameter; the owner-facing text names no provider and no code.
 */
export const MARKET_SOURCE_WINDOWS_MISSING_PREFIX = 'MARKET_SOURCE_WINDOWS_MISSING_';
export function marketSourceWindowsMissingCode(products: number): string {
  if (!Number.isSafeInteger(products) || products < 1 || products > 999) throw new TypeError('Missing product count is out of range.');
  return MARKET_SOURCE_WINDOWS_MISSING_PREFIX + String(products);
}
export function marketSourceWindowsMissingMessage(products: number): string {
  return `Báo cáo bị chặn: nguồn dữ liệu TikTok Shop không trả đủ doanh thu theo tháng của ${products} sản phẩm. Cần kiểm tra nguồn dữ liệu và lượt truy vấn còn lại rồi chạy lại.`;
}

export function message(code: string): string {
  const missing = /^MARKET_SOURCE_WINDOWS_MISSING_([1-9]\d{0,2})$/.exec(code);
  if (missing) return marketSourceWindowsMissingMessage(Number(missing[1]));
  const text = MESSAGES[code];
  if (text === undefined) throw new TypeError(`Unknown research automation message code: ${code}`);
  return text;
}

export class ResearchAutomationValidationError extends Error {}
export class ResearchAutomationNotFoundError extends Error {
  constructor(readonly code: 'workspace_not_found' | 'run_not_found' | 'report_not_available' | 'pdf_not_available' | 'rule_adoption_not_found' | 'membership_not_found' | 'insight_coding_not_found' | 'reader_report_not_found' | 'tiktok_coding_not_found' | 'shopee_coding_not_found', text: string) { super(text); }
}
export class ResearchAutomationConflictError extends Error {
  constructor(readonly code: 'request_key_conflict' | 'revision_conflict' | 'invalid_state', text: string) { super(text); }
}
export class ResearchAutomationStateError extends ResearchAutomationConflictError {
  constructor(text: string) { super('invalid_state', text); }
}
export class ResearchAutomationIntegrityError extends Error {}
export class ResearchAutomationProviderOutputError extends Error {}

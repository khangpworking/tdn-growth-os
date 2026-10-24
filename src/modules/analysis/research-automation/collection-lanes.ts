// Collection lanes of the COLLECTION step (c1). Each lane keeps its own Source port; this module owns the run order, the
// "source configured, not aborted, COLLECTION only" gate, one try/catch per lane, storing the lane's captures in order,
// the lane's step document with its own failed document, and the lane's usage rows. The service keeps the single final
// transaction: it stores the captures through its own closure and writes the rows this module returns.
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';
import type { SourceStepId, StepResultDocument } from './model.js';
import { SEARCH_INTEREST_USAGE_ORDINAL } from './search-interest.js';
import { SEARCH_GEO_USAGE_ORDINAL } from './search-geo.js';
import { EXPANDED_SEARCH_USAGE_ORDINAL } from './expanded-search-lane.js';
import { WORLD_BANK_PROVIDER, WORLD_BANK_USAGE_ORDINAL, worldBankDocument, worldBankFailed, worldBankUsage, type WorldBankAttempt, type WorldBankSource } from './world-bank-lane.js';
import { COMTRADE_PROVIDER, COMTRADE_USAGE_ORDINAL, comtradeDocument, comtradeFailed, comtradeUsage, type ComtradeCollection, type ComtradeSource } from './comtrade-lane.js';
import { brandsFromPick, GOOGLE_ADS_DISCOVERY_USAGE_ORDINALS, GOOGLE_ADS_PROVIDER, GOOGLE_ADS_USAGE_ORDINAL, searchAdsDocument, searchAdsFailed, searchAdsUsageEntries, type SearchAdsCollection, type SearchAdsSource } from './google-ads-lane.js';
import { OFFICIAL_STATS_PROVIDER, OFFICIAL_STATS_USAGE_ORDINAL, officialStatsDocument, officialStatsFailed, officialStatsUsage, type OfficialStatsCollection, type OfficialStatsSource } from './official-statistics-lane.js';
import { VIDEO_WATCH_USAGE_ORDINAL } from './video-watch-lane.js';
import { VIDEO_WATCH_PROVIDER } from './video-watch-gemini.js';
import { META_AUTO_PROVIDER, META_AUTO_USAGE_ORDINAL } from './meta-auto-lane.js';
import { TIKTOK_TOP_ADS_PROVIDER, TIKTOK_TOP_ADS_USAGE_ORDINAL } from './tiktok-top-ads-lane.js';
import { PDF_DISCOVERY_DOWNLOAD_USAGE_ORDINAL, PDF_DISCOVERY_PROVIDER, PDF_DISCOVERY_SEARCH_USAGE_ORDINAL } from './pdf-discovery-lane.js';

/** Usage ordinal of the plain web search (0 product source, 1 exact Shopee / public tail). */
export const WEB_USAGE_ORDINAL = 2;

export type CollectionLaneName = 'web' | 'trends' | 'expanded' | 'worldBank' | 'video' | 'comtrade' | 'searchAds' | 'officialStats'
  | 'metaAuto' | 'tiktokTopAds' | 'pdfDiscovery' | 'geo';

/**
 * Every lane usage ordinal of the collection step, with the provider an "unsettled-collection" row names. The DB key is
 * (run_id, step_id, ordinal), so a clash would abort the whole save; it is checked once when this module loads.
 * Web's provider is the configured web source's id (null here).
 */
export const COLLECTION_LANE_ORDINALS: readonly { readonly lane: CollectionLaneName; readonly ordinal: number; readonly provider: string | null }[] = [
  { lane: 'web', ordinal: WEB_USAGE_ORDINAL, provider: null },
  { lane: 'trends', ordinal: SEARCH_INTEREST_USAGE_ORDINAL, provider: 'serpapi' },
  ...Object.values(EXPANDED_SEARCH_USAGE_ORDINAL).map(ordinal => ({ lane: 'expanded' as const, ordinal, provider: 'serpapi' })),
  { lane: 'worldBank', ordinal: WORLD_BANK_USAGE_ORDINAL, provider: WORLD_BANK_PROVIDER.toLowerCase() },
  { lane: 'video', ordinal: VIDEO_WATCH_USAGE_ORDINAL, provider: VIDEO_WATCH_PROVIDER.toLowerCase() },
  { lane: 'comtrade', ordinal: COMTRADE_USAGE_ORDINAL, provider: COMTRADE_PROVIDER.toLowerCase() },
  { lane: 'searchAds', ordinal: GOOGLE_ADS_USAGE_ORDINAL, provider: GOOGLE_ADS_PROVIDER.toLowerCase() },
  { lane: 'officialStats', ordinal: OFFICIAL_STATS_USAGE_ORDINAL, provider: OFFICIAL_STATS_PROVIDER.toLowerCase() },
  { lane: 'metaAuto', ordinal: META_AUTO_USAGE_ORDINAL, provider: META_AUTO_PROVIDER.toLowerCase() },
  { lane: 'tiktokTopAds', ordinal: TIKTOK_TOP_ADS_USAGE_ORDINAL, provider: TIKTOK_TOP_ADS_PROVIDER.toLowerCase() },
  { lane: 'pdfDiscovery', ordinal: PDF_DISCOVERY_SEARCH_USAGE_ORDINAL, provider: 'serpapi' },
  { lane: 'pdfDiscovery', ordinal: PDF_DISCOVERY_DOWNLOAD_USAGE_ORDINAL, provider: PDF_DISCOVERY_PROVIDER.toLowerCase() },
  { lane: 'geo', ordinal: SEARCH_GEO_USAGE_ORDINAL, provider: 'serpapi' },
  ...GOOGLE_ADS_DISCOVERY_USAGE_ORDINALS.map(ordinal => ({ lane: 'searchAds' as const, ordinal, provider: GOOGLE_ADS_PROVIDER.toLowerCase() })),
];

function assertDistinctOrdinals(table: typeof COLLECTION_LANE_ORDINALS): void {
  const seen = new Set<number>();
  for (const { ordinal } of table) {
    if (!Number.isInteger(ordinal) || ordinal < 2 || seen.has(ordinal)) throw new Error(`Collection lane usage ordinal ${ordinal} is invalid or reused.`);
    seen.add(ordinal);
  }
}
assertDistinctOrdinals(COLLECTION_LANE_ORDINALS);

/** The lane's ordinals in table order (the search-ads activity query reads ads 10 and discovery 17-19). */
export const collectionLaneOrdinals = (lane: CollectionLaneName): number[] =>
  COLLECTION_LANE_ORDINALS.filter(item => item.lane === lane).map(item => item.ordinal);

const laneEntry = (lane: CollectionLaneName) => COLLECTION_LANE_ORDINALS.find(item => item.lane === lane)!;

/** What earlier work of the run produced, read only by the lanes that need it. */
export interface CollectionLaneContext {
  readonly keyword: string;
  readonly description: string | null;
  readonly mode: string;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string };
  /** Product titles of the product-source result. */
  readonly productTitles: () => string[];
  /** Links of the plain and expanded web rows, ordered by position. */
  readonly webUrls: () => string[];
  /** The auto-run pick record, or null. */
  readonly readPick: () => Promise<unknown>;
}

/** Stores the captures in order through the service's capture closure; returns the first capture's index, null when unstorable. */
export type LaneCaptureStore = (captures: readonly ProviderRawCapture[]) => Promise<number | null>;

export type LaneUsageResult = {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: string; readonly consumed?: number } };
};
export type LaneUsageRow =
  | { readonly kind: 'USAGE'; readonly ordinal: number; readonly result: LaneUsageResult }
  | { readonly kind: 'UNSETTLED'; readonly ordinal: number; readonly provider: string };

type LaneField = 'worldBank' | 'comtrade' | 'searchAds' | 'officialStats';
type LaneDocument<F extends LaneField> = NonNullable<StepResultDocument[F]>;

interface LaneSpec<I, C, F extends LaneField> {
  readonly name: CollectionLaneName;
  readonly field: F;
  /** Builds the lane's own input outside the lane's try/catch. */
  readonly input: (context: CollectionLaneContext) => I | Promise<I>;
  readonly collect: (input: I, options: ProviderCallOptions) => Promise<C>;
  /** Stores the lane's captures and builds its document; `collection` is undefined when collect threw. */
  readonly document: (collection: C | undefined, store: LaneCaptureStore) => Promise<LaneDocument<F>>;
  /** The lane's own document when the built one fails the step or lineage check. */
  readonly failed: () => LaneDocument<F>;
  /** Usage rows of a settled collect. */
  readonly usage: (collection: C) => LaneUsageRow[];
}

/** One lane attempt, settled or thrown. */
export interface CollectionLaneRun {
  readonly name: CollectionLaneName;
  readonly store: (step: StepResultDocument, captures: LaneCaptureStore, check: (probe: StepResultDocument) => void) => Promise<StepResultDocument>;
  readonly usage: () => LaneUsageRow[];
}

export interface CollectionLane {
  readonly name: CollectionLaneName;
  readonly attempt: (context: CollectionLaneContext, signal: AbortSignal) => Promise<CollectionLaneRun>;
}

function lane<I, C, F extends LaneField>(spec: LaneSpec<I, C, F>): CollectionLane {
  return {
    name: spec.name,
    async attempt(context, signal) {
      const input = await spec.input(context);
      let outcome: { readonly collection: C } | { readonly thrown: true };
      try { outcome = { collection: await spec.collect(input, { signal }) }; }
      catch { outcome = { thrown: true }; }
      const collection = 'collection' in outcome ? outcome.collection : undefined;
      return {
        name: spec.name,
        async store(step, captures, check) {
          const probe = { ...step, [spec.field]: await spec.document(collection, captures) };
          try {
            check(probe);
            return probe;
          } catch { return { ...step, [spec.field]: spec.failed() }; }
        },
        // A thrown collect is one ambiguous call: one UNKNOWN row with the lane's own ordinal and provider.
        usage: () => collection !== undefined ? spec.usage(collection)
          : [{ kind: 'UNSETTLED', ordinal: laneEntry(spec.name).ordinal, provider: laneEntry(spec.name).provider! }],
      };
    },
  };
}

// Open country-level data: one attempt per run, never repeated after a restart. A dropped indicator keeps a reason code
// only and never changes the step outcome, coverage or run blockers; only responses that passed the inspector are stored.
function worldBankLane(source: WorldBankSource): CollectionLane {
  return lane<undefined, readonly WorldBankAttempt[], 'worldBank'>({
    name: 'worldBank', field: 'worldBank',
    input: () => undefined,
    collect: (_input, options) => source.collect(options),
    async document(attempts = [], store) {
      const indexes: ([number, number] | null)[] = [];
      for (const attempt of attempts) {
        const index = attempt.observation && attempt.metadata ? await store([attempt.observation, attempt.metadata]) : null;
        indexes.push(index === null ? null : [index, index + 1]);
      }
      return attempts.length ? worldBankDocument(attempts, indexes) : worldBankFailed('PROVIDER_FAILED');
    },
    failed: () => worldBankFailed('DOCUMENT_INVALID'),
    usage: attempts => attempts.some(item => item.requests > 0) ? [{ kind: 'USAGE', ordinal: WORLD_BANK_USAGE_ORDINAL, result: worldBankUsage(attempts) }] : [],
  });
}

// UN Comtrade follows World Bank: one attempt per run, never repeated after a restart. Only responses of the confirmed
// code are stored; without a confirmed code the document is a status only and no number is kept.
function comtradeLane(source: ComtradeSource): CollectionLane {
  return lane<Parameters<ComtradeSource['collect']>[0], ComtradeCollection, 'comtrade'>({
    name: 'comtrade', field: 'comtrade',
    input: context => ({ keyword: context.keyword, description: context.description, mode: context.mode, periodEndDate: context.requestedPeriod.endDate, productTitles: context.productTitles() }),
    collect: (input, options) => source.collect(input, options),
    async document(collection, store) {
      const indexes: (number | null)[] = [];
      for (const item of collection?.calls ?? []) indexes.push(await store([item.capture]));
      return collection ? comtradeDocument(collection, indexes) : comtradeFailed('FAILED');
    },
    failed: () => comtradeFailed('FAILED'),
    usage: collection => collection.requests > 0 ? [{ kind: 'USAGE', ordinal: COMTRADE_USAGE_ORDINAL, result: comtradeUsage(collection) }] : [],
  });
}

// Search-ads library: at most six paid calls including site discovery, never repeated after a restart. Brands come only
// from the auto-run pick record. Discovery and ads responses are stored per called brand; no advertiser detail is kept.
function searchAdsLane(source: SearchAdsSource): CollectionLane {
  return lane<Parameters<SearchAdsSource['collect']>[0], SearchAdsCollection, 'searchAds'>({
    name: 'searchAds', field: 'searchAds',
    input: async context => ({ brands: brandsFromPick(await context.readPick()), webUrls: context.webUrls(),
      periodStartDate: context.requestedPeriod.startDate, periodEndDate: context.requestedPeriod.endDate }),
    collect: (input, options) => source.collect(input, options),
    async document(collection, store) {
      const indexes: (number | null)[] = [], discoveryIndexes: (number | null)[] = [];
      for (const item of collection?.brands ?? []) {
        discoveryIndexes.push(item.discoveryCapture ? await store([item.discoveryCapture]) : null);
        indexes.push(item.capture ? await store([item.capture]) : null);
      }
      return collection ? searchAdsDocument(collection, indexes, discoveryIndexes) : searchAdsFailed('FAILED');
    },
    failed: () => searchAdsFailed('FAILED'),
    usage: collection => searchAdsUsageEntries(collection).map(entry => ({ kind: 'USAGE', ordinal: entry.ordinal, result: entry.result })),
  });
}

// Cục Thống kê follows UN Comtrade: one listing and at most two workbooks per run, never repeated after a restart. The
// listing capture comes first, then each downloaded workbook; without a confirmed category the document is a status only.
function officialStatsLane(source: OfficialStatsSource): CollectionLane {
  return lane<Parameters<OfficialStatsSource['collect']>[0], OfficialStatsCollection, 'officialStats'>({
    name: 'officialStats', field: 'officialStats',
    input: context => ({ keyword: context.keyword, description: context.description, mode: context.mode }),
    collect: (input, options) => source.collect(input, options),
    async document(collection, store) {
      const listIndex = collection?.list ? await store([collection.list]) : null;
      const fileIndexes: (number | null)[] = [];
      for (const item of collection?.files ?? []) fileIndexes.push(await store([item.capture]));
      return collection ? officialStatsDocument(collection, listIndex, fileIndexes) : officialStatsFailed('FAILED');
    },
    failed: () => officialStatsFailed('FAILED'),
    usage: collection => collection.requests > 0 ? [{ kind: 'USAGE', ordinal: OFFICIAL_STATS_USAGE_ORDINAL, result: officialStatsUsage(collection) }] : [],
  });
}

export interface CollectionLaneSources {
  readonly worldBankSource?: WorldBankSource;
  readonly comtradeSource?: ComtradeSource;
  readonly searchAdsSource?: SearchAdsSource;
  readonly officialStatsSource?: OfficialStatsSource;
}

/** The ordered lanes of the configured sources (a source is present only when its flag is on). Order = capture order. */
export function collectionLanes(sources: CollectionLaneSources): readonly CollectionLane[] {
  return [
    ...(sources.worldBankSource ? [worldBankLane(sources.worldBankSource)] : []),
    ...(sources.comtradeSource ? [comtradeLane(sources.comtradeSource)] : []),
    ...(sources.searchAdsSource ? [searchAdsLane(sources.searchAdsSource)] : []),
    ...(sources.officialStatsSource ? [officialStatsLane(sources.officialStatsSource)] : []),
  ];
}

/** Attempts each lane in order; COLLECTION only (QUICK_SEARCH runs none) and never after the run was aborted. */
export async function attemptCollectionLanes(lanes: readonly CollectionLane[], stepId: SourceStepId, context: CollectionLaneContext, signal: AbortSignal): Promise<CollectionLaneRun[]> {
  const runs: CollectionLaneRun[] = [];
  for (const item of lanes) if (stepId === 'COLLECTION' && !signal.aborted) runs.push(await item.attempt(context, signal));
  return runs;
}

/** Stores each attempted lane's captures in run order and merges its document (or its failed document) into the step. */
export async function storeCollectionLanes(runs: readonly CollectionLaneRun[], step: StepResultDocument, captures: LaneCaptureStore, check: (probe: StepResultDocument) => void): Promise<StepResultDocument> {
  for (const run of runs) step = await run.store(step, captures, check);
  return step;
}

/** Usage rows of the attempted lanes, in run order, for the service's final transaction. */
export const collectionLaneUsage = (runs: readonly CollectionLaneRun[]): LaneUsageRow[] => runs.flatMap(run => run.usage());

// Collection lanes of the COLLECTION step (c1). Each lane keeps its own Source port; this module owns the run order, the
// "source configured, not aborted, COLLECTION only" gate, one try/catch per lane, what a lane hands to later lanes,
// storing the lane's captures in order, the lane's step document with its own failed document, and the lane's usage rows.
// The service keeps the single final transaction: it stores the captures through its own closure and writes the rows
// this module returns.
import type { AutomationSourcePort, BoundCollectResult } from './source-binding.js';
import { invalidProviderStep } from './source-binding.js';
import type { CollectInput, ProviderCallOptions, ProviderRawCapture } from './providers.js';
import { message, type SourceStepId, type StepExpandedQuery, type StepResultDocument, type StepWebResult } from './model.js';
import { searchInterestDocument, searchInterestPeriodSkip, searchInterestRange, searchInterestUsage, SEARCH_INTEREST_USAGE_ORDINAL, type SearchInterestAttempt, type SearchInterestSource } from './search-interest.js';
import { searchGeoDocument, SEARCH_GEO_USAGE_ORDINAL, type SearchGeoAttempt, type SearchGeoSource } from './search-geo.js';
import { expandedQueryDocument, EXPANDED_SEARCH_USAGE_ORDINAL, webResultUrlKey, type ExpandedSearchAttempt, type ExpandedSearchSource } from './expanded-search-lane.js';
import { WORLD_BANK_PROVIDER, WORLD_BANK_USAGE_ORDINAL, worldBankDocument, worldBankFailed, worldBankUsage, type WorldBankAttempt, type WorldBankSource } from './world-bank-lane.js';
import { COMTRADE_PROVIDER, COMTRADE_USAGE_ORDINAL, comtradeDocument, comtradeFailed, comtradeUsage, type ComtradeCollection, type ComtradeSource } from './comtrade-lane.js';
import { brandsFromPick, GOOGLE_ADS_DISCOVERY_USAGE_ORDINALS, GOOGLE_ADS_PROVIDER, GOOGLE_ADS_USAGE_ORDINAL, searchAdsDocument, searchAdsFailed, searchAdsUsageEntries, type SearchAdsCollection, type SearchAdsSource } from './google-ads-lane.js';
import { OFFICIAL_STATS_PROVIDER, OFFICIAL_STATS_USAGE_ORDINAL, officialStatsDocument, officialStatsFailed, officialStatsUsage, type OfficialStatsCollection, type OfficialStatsSource } from './official-statistics-lane.js';
import { VIDEO_WATCH_USAGE_ORDINAL } from './video-watch-lane.js';
import { VIDEO_WATCH_PROVIDER } from './video-watch-gemini.js';
import { META_AUTO_PROVIDER, META_AUTO_USAGE_ORDINAL, metaAutoDocument, metaAutoFailed, metaAutoHasEvidence, metaAutoUsage, metaBrandsFromPick, publishMetaAutoEvidence, type MetaAutoCollection, type MetaAutoSource, type MetaAutoWriter } from './meta-auto-lane.js';
import { TIKTOK_TOP_ADS_PROVIDER, TIKTOK_TOP_ADS_USAGE_ORDINAL, publishTikTokTopAdsEvidence, tiktokTopAdsDocument, tiktokTopAdsFailed, tiktokTopAdsHasEvidence, tiktokTopAdsUsage, type TikTokTopAdsCollection, type TikTokTopAdsSource, type TikTokTopAdsWriter } from './tiktok-top-ads-lane.js';
import { PDF_DISCOVERY_DOWNLOAD_USAGE_ORDINAL, PDF_DISCOVERY_PROVIDER, PDF_DISCOVERY_SEARCH_USAGE_ORDINAL } from './pdf-discovery-lane.js';
import { TOP_SELLING_VIDEOS_USAGE_ORDINAL } from './top-selling-videos.js';
import { TIKTOK_SHOP_REVIEWS_DOCUMENT_MEDIA_TYPE, TIKTOK_SHOP_REVIEWS_USAGE_ORDINAL, tiktokShopReviewsDocument, tiktokShopReviewsFailed, tiktokShopReviewsStep, tiktokShopReviewsUsage, type TikTokShopReviewCandidate, type TikTokShopReviewsCollection, type TikTokShopReviewsSource } from './tiktok-shop-reviews.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import { populationBaselineDocument, type PopulationBaselineAttempt, type PopulationBaselineSource } from './population-baseline.js';

/** Usage ordinal of the plain web search (0 product source, 1 exact Shopee / public tail). */
export const WEB_USAGE_ORDINAL = 2;

export type CollectionLaneName = 'web' | 'trends' | 'expanded' | 'worldBank' | 'video' | 'comtrade' | 'searchAds' | 'officialStats'
  | 'metaAuto' | 'tiktokTopAds' | 'pdfDiscovery' | 'geo' | 'tiktokShopReviews' | 'populationBaseline';

/**
 * Every lane usage ordinal of the collection step, with the provider an "unsettled-collection" row names. The DB key is
 * (run_id, step_id, ordinal), so a clash would abort the whole save; it is checked once when this module loads.
 * Web's provider is the configured web source's id (null here). The population baseline is a local file read with no usage row.
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
  { lane: 'tiktokShopReviews', ordinal: TIKTOK_SHOP_REVIEWS_USAGE_ORDINAL, provider: 'kalodata' },
  // The video lane's paid top-selling lookup (its first entry above stays the lane's own ordinal).
  { lane: 'video', ordinal: TOP_SELLING_VIDEOS_USAGE_ORDINAL, provider: 'kalodata' },
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

/** What the service hands every lane of a COLLECTION run, beside what the earlier lanes produced. */
export interface CollectionRunContext {
  readonly keyword: string;
  readonly description: string | null;
  readonly mode: string;
  /** The reports the run asks for (the population baseline reads only for INSIGHT runs). */
  readonly reports: readonly string[];
  /** The run asks for the Market report (the report-PDF lane's fact); without it the Market-only lanes attempt nothing. */
  readonly market: boolean;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string };
  /** Product titles of the product-source result. */
  readonly productTitles: () => string[];
  /** The auto-run pick record, or null. */
  readonly readPick: () => Promise<unknown>;
  /** Run facts of the web, trends, geo, expanded, Meta and TikTok lanes; the service passes them on every run it collects. */
  readonly run?: CollectionRunFacts;
  /** Run facts of the TikTok Shop reviews lane; the service passes them on every run it collects. */
  readonly tiktokShopReviews?: TikTokShopReviewsFacts;
}

export interface TikTokShopReviewsFacts {
  /** The run's report kinds (the lane collects for INSIGHT runs only). */
  readonly reports: readonly string[];
  /** Confirmed products with a quick-search card and the run's own revenue; read inside the lane's try/catch. */
  readonly candidates: () => Promise<TikTokShopReviewCandidate[]>;
  /** Stores the normalized private document; its manifest is registered in the service's final transaction. */
  readonly putDocument: (bytes: Buffer) => Promise<StoredArtifact>;
}

export interface CollectionRunFacts {
  /** The frozen collection input the product source was asked with. */
  readonly input: CollectInput;
  /** A product-source or exact attempt was made: the web outcome then merges with the product outcome. */
  readonly productAttempted: boolean;
  readonly now: () => Date;
  /** Publishes a Foundation attachment under the database mutex, refused once the run can no longer take evidence. */
  readonly publish: <T>(refusal: string, write: (writer: MetaAutoWriter & TikTokTopAdsWriter) => Promise<T>) => Promise<T>;
}

/** What a lane sees: the run context plus the earlier lanes' web rows. */
export interface CollectionLaneContext extends CollectionRunContext {
  /** Links of the earlier plain and expanded web rows, ordered by position. */
  readonly webUrls: () => string[];
}

/**
 * Stores the captures in order through the service's capture closure; returns the first capture's index, null when unstorable.
 * `retainPdf: false` skips the service's `%PDF-` retention.
 */
export type LaneCaptureStore = (captures: readonly ProviderRawCapture[], options?: { readonly retainPdf?: boolean }) => Promise<number | null>;
/** The service's capture list: its length, and a cut back to an earlier length (a lane whose capture write failed keeps none). */
export interface LaneCaptureRewind {
  readonly length: () => number;
  readonly truncate: (length: number) => void;
}
/** The service's step-document check; `lineage: false` skips the capture-lineage check (lanes that store no capture). */
export type LaneCheck = (probe: StepResultDocument, options?: { readonly lineage: boolean }) => void;

export type LaneUsageResult = {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: string; readonly consumed?: number } };
};
export type LaneUsageRow =
  | { readonly kind: 'USAGE'; readonly ordinal: number; readonly result: LaneUsageResult }
  | { readonly kind: 'UNSETTLED'; readonly ordinal: number; readonly provider: string };

/** A private artifact a lane stored, registered with its media type in the service's final transaction. */
export type LaneManifest = { readonly artifact: StoredArtifact; readonly mediaType: string };

/** What a later lane reads from an earlier one. */
export interface LaneProduced {
  /** web: the plain web rows (capture indexes of the web result itself). */
  readonly webRows?: readonly StepWebResult[];
  /** expanded: the extra-search attempts. */
  readonly expandedAttempts?: readonly ExpandedSearchAttempt[];
  /** trends: the keyword and the one period check the province map reuses. */
  readonly searchPeriod?: { readonly keyword: string; readonly skip: ReturnType<typeof searchInterestPeriodSkip>; readonly range: ReturnType<typeof searchInterestRange> };
}

/** One lane attempt, settled or thrown. */
export interface CollectionLaneRun {
  readonly name: CollectionLaneName;
  readonly store: (step: StepResultDocument, captures: LaneCaptureStore, check: LaneCheck) => Promise<StepResultDocument>;
  /** The lane's failed document after one of its capture writes failed (owner c1 Q3); stores no capture. Without it the failure is not contained. */
  readonly writeFailed?: (step: StepResultDocument, check: LaneCheck) => Promise<StepResultDocument>;
  readonly usage: () => LaneUsageRow[];
  /** The lane's own provider result reported a cancelled call (product, web, trends and expanded count for the step outcome). */
  readonly cancelled?: boolean;
  readonly produced?: LaneProduced;
  /** Private artifacts the lane's store kept (read after store). */
  readonly manifests?: () => readonly LaneManifest[];
}

export interface CollectionLane {
  readonly name: CollectionLaneName;
  /** null: the lane has nothing to attempt in this run (the province map without a trends attempt). */
  readonly attempt: (context: CollectionLaneContext, signal: AbortSignal, earlier: readonly CollectionLaneRun[]) => Promise<CollectionLaneRun | null>;
}

interface LaneSpec<I, C> {
  readonly name: CollectionLaneName;
  /** Builds the lane's own input outside the lane's try/catch; null skips the lane. */
  readonly input: (context: CollectionLaneContext, earlier: readonly CollectionLaneRun[]) => I | null | Promise<I | null>;
  readonly collect: (input: I, options: ProviderCallOptions) => Promise<C>;
  /** What a thrown collect leaves; without it the collection is undefined and the lane records one UNKNOWN row. */
  readonly thrown?: (input: I) => C;
  /** Stores the lane's captures and merges its document (or its own failed document) into the step. */
  readonly store: (step: StepResultDocument, collection: C | undefined, input: I, captures: LaneCaptureStore, check: LaneCheck) => Promise<StepResultDocument>;
  /** The failed document after a capture write failed; without it, the document a thrown collect would give. */
  readonly writeFailed?: (step: StepResultDocument, collection: C | undefined, input: I) => StepResultDocument;
  /** Usage rows of a collect that returned (or of the lane's own thrown value). */
  readonly usage: (collection: C) => LaneUsageRow[];
  readonly cancelled?: (collection: C) => boolean;
  readonly produced?: (input: I, collection: C | undefined) => LaneProduced;
  readonly manifests?: (input: I) => readonly LaneManifest[];
}

function lane<I, C>(spec: LaneSpec<I, C>): CollectionLane {
  return {
    name: spec.name,
    async attempt(context, signal, earlier) {
      const input = await spec.input(context, earlier);
      if (input === null) return null;
      let outcome: { readonly collection: C } | { readonly thrown: true };
      try { outcome = { collection: await spec.collect(input, { signal }) }; }
      catch { outcome = spec.thrown ? { collection: spec.thrown(input) } : { thrown: true }; }
      const collection = 'collection' in outcome ? outcome.collection : undefined;
      return {
        name: spec.name,
        store: (step, captures, check) => spec.store(step, collection, input, captures, check),
        writeFailed: async (step, check) => spec.writeFailed ? spec.writeFailed(step, collection, input)
          : spec.store(step, spec.thrown?.(input), input, noCaptureStore, check),
        // A thrown collect is one ambiguous call: one UNKNOWN row with the lane's own ordinal and provider.
        usage: () => collection !== undefined ? spec.usage(collection)
          : [{ kind: 'UNSETTLED', ordinal: laneEntry(spec.name).ordinal, provider: laneEntry(spec.name).provider! }],
        ...(spec.cancelled && collection !== undefined ? { cancelled: spec.cancelled(collection) } : {}),
        ...(spec.produced ? { produced: spec.produced(input, collection) } : {}),
        ...(spec.manifests ? { manifests: () => spec.manifests!(input) } : {}),
      };
    },
  };
}

type LaneField = 'worldBank' | 'comtrade' | 'searchAds' | 'officialStats';
type LaneDocument<F extends LaneField> = NonNullable<StepResultDocument[F]>;

/** A lane whose whole result is one step field, checked with its captures and replaced by the lane's failed document. */
function fieldLane<I, C, F extends LaneField>(spec: Omit<LaneSpec<I, C>, 'store'> & {
  readonly field: F;
  /** Stores the lane's captures and builds its document; `collection` is undefined when collect threw. */
  readonly document: (collection: C | undefined, store: LaneCaptureStore) => Promise<LaneDocument<F>>;
  /** The lane's own document when the built one fails the step or lineage check. */
  readonly failed: () => LaneDocument<F>;
}): CollectionLane {
  return lane<I, C>({
    ...spec,
    async store(step, collection, _input, captures, check) {
      const probe = { ...step, [spec.field]: await spec.document(collection, captures) };
      try {
        check(probe);
        return probe;
      } catch { return { ...step, [spec.field]: spec.failed() }; }
    },
  });
}

// The thrown documents store no capture; an empty capture list still reports where it would start.
const noCaptureStore: LaneCaptureStore = async values => { if (values.length) throw new Error('A failed lane document stores no capture.'); return null; };

const runFacts = (context: CollectionRunContext): CollectionRunFacts => {
  if (!context.run) throw new Error('This collection lane needs the run facts.');
  return context.run;
};
const producedBy = (earlier: readonly CollectionLaneRun[], name: CollectionLaneName) => earlier.find(run => run.name === name)?.produced;

/** Links of the earlier plain and expanded web rows by position; expanded rows already seen in the plain rows are dropped. */
function earlierWebUrls(earlier: readonly CollectionLaneRun[]): string[] {
  const plainRows = producedBy(earlier, 'web')?.webRows ?? [];
  const seen = new Set(plainRows.map(item => webResultUrlKey(item.url)));
  const expandedRows = (producedBy(earlier, 'expanded')?.expandedAttempts ?? []).flatMap(attempt => expandedQueryDocument(attempt, 0, seen).results);
  return [...plainRows, ...expandedRows].sort((a, b) => a.position - b.position).map(item => item.url);
}

type WebAttempt = { readonly bound: BoundCollectResult } | { readonly failedProvider: string };

// Plain web search: its captures follow the product source's captures, so existing comparable indexes stay valid and
// web results are offset past them. Without any product-source attempt the web lane alone decides the outcome.
function webLane(source: AutomationSourcePort): CollectionLane {
  return lane<CollectionRunFacts, WebAttempt>({
    name: 'web',
    input: runFacts,
    collect: async (run, options) => ({ bound: await source.collect(run.input, options) }),
    thrown: () => ({ failedProvider: source.id.toLowerCase() }),
    async store(step, web, run, captures, check) {
      const { runId } = run.input;
      let webStep: StepResultDocument;
      if (web && 'bound' in web) {
        const offset = await captures(web.bound.result.captures);
        const provider = web.bound.result.provider.toLowerCase();
        const shifted = { ...web.bound.step, ...(web.bound.step.webResults ? { webResults: web.bound.step.webResults.map(value => ({ ...value, captureIndex: value.captureIndex + (offset ?? 0) })) } : {}) };
        try {
          if (offset === null) throw new Error('Web search capture exceeds its retention bound.');
          check(shifted);
          webStep = shifted;
        } catch {
          webStep = { ...invalidProviderStep(runId, 'COLLECTION'),
            coverage: [{ provider, dataset: 'web_discovery_current', state: 'FAILED', observedStartDate: null, observedEndDate: null, truncated: false, note: null }],
            limitations: [{ code: 'PROVIDER_OUTPUT_INVALID', provider, message: message('PROVIDER_OUTPUT_INVALID') }] };
        }
      } else {
        const provider = web?.failedProvider ?? source.id.toLowerCase();
        webStep = { ...invalidProviderStep(runId, 'COLLECTION'),
          coverage: [{ provider, dataset: 'web_discovery_current', state: 'FAILED', observedStartDate: null, observedEndDate: null, truncated: false, note: null }],
          limitations: [{ code: 'PROVIDER_FAILED', provider, message: message('PROVIDER_FAILED') }] };
      }
      const useful = (value: StepResultDocument['outcome']) => value === 'SUCCEEDED' || value === 'PARTIAL';
      return { ...step,
        outcome: !run.productAttempted ? webStep.outcome
          : step.outcome === 'SUCCEEDED' && webStep.outcome === 'SUCCEEDED' ? 'SUCCEEDED'
            : useful(step.outcome) || useful(webStep.outcome) ? 'PARTIAL' : step.outcome,
        coverage: [...step.coverage, ...webStep.coverage], limitations: [...step.limitations, ...webStep.limitations],
        ...(webStep.webResults?.length ? { webResults: webStep.webResults } : {}) };
    },
    usage: web => 'bound' in web ? [{ kind: 'USAGE', ordinal: WEB_USAGE_ORDINAL, result: web.bound.result }]
      : [{ kind: 'UNSETTLED', ordinal: WEB_USAGE_ORDINAL, provider: web.failedProvider }],
    cancelled: web => 'bound' in web && web.bound.result.status === 'CANCELLED',
    produced: (_run, web) => ({ webRows: web && 'bound' in web ? web.bound.step.webResults ?? [] : [] }),
  });
}

// Search interest: the provider is asked for the report period itself; only a period it cannot cover is skipped, each
// with its own reason. The capture follows the web captures; its reason code lives only in the step's own field: a
// failed series never changes the step outcome, coverage or run blockers.
function trendsLane(source: SearchInterestSource): CollectionLane {
  return lane<NonNullable<LaneProduced['searchPeriod']>, SearchInterestAttempt>({
    name: 'trends',
    input: context => {
      const nowMs = runFacts(context).now().getTime();
      return { keyword: context.keyword, skip: searchInterestPeriodSkip(context.requestedPeriod, nowMs), range: searchInterestRange(context.requestedPeriod, nowMs) };
    },
    collect: async ({ keyword, skip, range }, options) => skip === null
      ? { kind: 'CALLED', keyword, range, result: await source.collect(keyword, options, range) }
      : { kind: 'SKIPPED', keyword, reason: skip },
    thrown: ({ keyword, range }) => ({ kind: 'THROWN', keyword, range }),
    async store(step, attempt, _input, captures, check) {
      if (!attempt) return step; // unreachable: a thrown collect leaves a THROWN attempt
      // The failed series keeps the range the attempt had (c1 bug 2), so one failed series always gives the same window.
      const thrown: SearchInterestAttempt = { kind: 'THROWN', keyword: attempt.keyword, ...(attempt.kind !== 'SKIPPED' && attempt.range ? { range: attempt.range } : {}) };
      const values = attempt.kind === 'CALLED' ? attempt.result.captures : [];
      const index = await captures(values);
      const probe = { ...step, searchInterest: searchInterestDocument(index !== null ? attempt : thrown, index !== null && values.length ? index + values.length - 1 : null) };
      try {
        check(probe);
        return probe;
      } catch { return { ...step, searchInterest: searchInterestDocument(thrown, null) }; }
    },
    usage: attempt => attempt.kind === 'CALLED' && attempt.result.captures.length
      ? [{ kind: 'USAGE', ordinal: SEARCH_INTEREST_USAGE_ORDINAL, result: searchInterestUsage(attempt.result.captures) }]
      : attempt.kind === 'THROWN' ? [{ kind: 'UNSETTLED', ordinal: SEARCH_INTEREST_USAGE_ORDINAL, provider: 'serpapi' }] : [],
    cancelled: attempt => attempt.kind === 'CALLED' && attempt.result.status === 'CANCELLED',
    produced: period => ({ searchPeriod: period }),
  });
}

// One province map follows the series under the same period check; it is never repeated after a restart. Its capture
// follows the series capture; a failure keeps only its own reason code.
function geoLane(source: SearchGeoSource): CollectionLane {
  return lane<NonNullable<LaneProduced['searchPeriod']>, SearchGeoAttempt>({
    name: 'geo',
    input: (_context, earlier) => producedBy(earlier, 'trends')?.searchPeriod ?? null,
    collect: async ({ keyword, skip, range }, options) => skip !== null ? { kind: 'SKIPPED', keyword, reason: skip }
      : { kind: 'CALLED', keyword, range, result: await source.collect(keyword, options, range) },
    thrown: ({ keyword, range }) => ({ kind: 'THROWN', keyword, range }),
    async store(step, attempt, _input, captures, check) {
      if (!attempt) return step; // unreachable: a thrown collect leaves a THROWN attempt
      const thrown: SearchGeoAttempt = { kind: 'THROWN', keyword: attempt.keyword, ...(attempt.kind !== 'SKIPPED' && attempt.range ? { range: attempt.range } : {}) };
      const values = attempt.kind === 'CALLED' ? attempt.result.captures : [];
      const index = await captures(values);
      try {
        const probe = { ...step, searchGeo: searchGeoDocument(index !== null ? attempt : thrown, index !== null && values.length ? index + values.length - 1 : null) };
        check(probe);
        return probe;
      } catch { return { ...step, searchGeo: searchGeoDocument(thrown, null) }; }
    },
    usage: attempt => attempt.kind === 'CALLED' && attempt.result.captures.length
      ? [{ kind: 'USAGE', ordinal: SEARCH_GEO_USAGE_ORDINAL, result: searchInterestUsage(attempt.result.captures) }]
      : attempt.kind === 'THROWN' ? [{ kind: 'UNSETTLED', ordinal: SEARCH_GEO_USAGE_ORDINAL, provider: 'serpapi' }] : [],
  });
}

// Extra searches run after the series, only when the plain web search is configured, and never repeat after a restart.
// Their captures follow the trends capture. Rows already seen in the plain web rows are dropped (plain wins). Like the
// series, a failed query keeps only a reason code and never changes the step outcome, coverage or run blockers.
function expandedLane(source: ExpandedSearchSource): CollectionLane {
  return lane<CollectionRunFacts, readonly ExpandedSearchAttempt[]>({
    name: 'expanded',
    input: runFacts,
    collect: (run, options) => source.collect(run.input, options),
    // The port never throws; a throw leaves no query and, like every lane, one UNKNOWN row (ordinal 4, owner c1 Q1).
    async store(step, attempts = [], _run, captures, check) {
      if (!attempts.length) return step;
      const seen = new Set((step.webResults ?? []).map(row => webResultUrlKey(row.url)));
      const queries: StepExpandedQuery[] = [];
      for (const attempt of attempts) {
        const values = attempt.state === 'CALLED' ? attempt.result.captures : [];
        const offset = await captures(values);
        const thrown: ExpandedSearchAttempt = { kind: attempt.kind, state: 'THROWN' };
        queries.push(expandedQueryDocument(offset !== null ? attempt : thrown, offset !== null && values.length ? offset : null, seen));
      }
      const probe = { ...step, expandedSearch: { queries } };
      try {
        check(probe);
        return probe;
      } catch {
        return { ...step, expandedSearch: { queries: queries.map(query => ({ kind: query.kind, status: 'FAILED' as const, reason: 'PROVIDER_FAILED' as const,
          requestedWindow: null, retrievedAt: null, captureIndex: null, results: [] })) } };
      }
    },
    // A failed capture write fails every query of the attempt, as a failed check does.
    writeFailed: (step, attempts = []) => !attempts.length ? step : { ...step, expandedSearch: { queries: attempts.map(attempt => ({ kind: attempt.kind,
      status: 'FAILED' as const, reason: 'PROVIDER_FAILED' as const, requestedWindow: null, retrievedAt: null, captureIndex: null, results: [] })) } },
    usage: attempts => [
      ...attempts.flatMap((item): LaneUsageRow[] => item.state === 'CALLED' && item.result.captures.length
        ? [{ kind: 'USAGE', ordinal: EXPANDED_SEARCH_USAGE_ORDINAL[item.kind], result: item.result }] : []),
      ...attempts.flatMap((item): LaneUsageRow[] => item.state === 'THROWN'
        ? [{ kind: 'UNSETTLED', ordinal: EXPANDED_SEARCH_USAGE_ORDINAL[item.kind], provider: 'serpapi' }] : []),
    ],
    cancelled: attempts => attempts.some(item => item.state === 'CALLED' && item.result.status === 'CANCELLED'),
    produced: (_run, attempts) => ({ expandedAttempts: attempts ?? [] }),
  });
}

// Open country-level data: one attempt per run, never repeated after a restart. A dropped indicator keeps a reason code
// only and never changes the step outcome, coverage or run blockers; only responses that passed the inspector are stored.
function worldBankLane(source: WorldBankSource): CollectionLane {
  return fieldLane<undefined, readonly WorldBankAttempt[], 'worldBank'>({
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
  return fieldLane<Parameters<ComtradeSource['collect']>[0], ComtradeCollection, 'comtrade'>({
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
  return fieldLane<Parameters<SearchAdsSource['collect']>[0], SearchAdsCollection, 'searchAds'>({
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
  return fieldLane<Parameters<OfficialStatsSource['collect']>[0], OfficialStatsCollection, 'officialStats'>({
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

// Meta ad library auto-read comes after the paid lanes: at most five logged-out page opens for the top two pick brands
// (the search-ads input; E11 peers exist only after REPORTS), never repeated after a restart. It shares the one browser-CLI
// lock with the Metric capture. Retained reads (final URL, capped text, fingerprint; never raw HTML) go into one Foundation
// attachment bound to this run, not into step captures. Without stored evidence the document keeps no figures.
function metaAutoLane(source: MetaAutoSource): CollectionLane {
  return lane<{ readonly run: CollectionRunFacts; readonly readPick: () => Promise<unknown> }, MetaAutoCollection>({
    name: 'metaAuto',
    input: context => ({ run: runFacts(context), readPick: context.readPick }),
    collect: async ({ readPick }, options) => source.collect({ brands: metaBrandsFromPick(await readPick()) }, options),
    async store(step, collection, { run }, _captures, check) {
      let document = collection ? metaAutoDocument(collection, null) : metaAutoFailed('FAILED');
      if (collection && metaAutoHasEvidence(collection)) {
        try { document = await run.publish('This run cannot publish a Meta ad library read.', writer => publishMetaAutoEvidence(writer, run.input.runId, collection)); }
        catch { /* keeps the evidence-free document */ }
      }
      const probe = { ...step, metaAuto: document };
      try {
        check(probe, { lineage: false });
        return probe;
      } catch { return { ...step, metaAuto: metaAutoFailed('FAILED', collection?.opens ?? 0) }; }
    },
    usage: collection => collection.opens > 0 ? [{ kind: 'USAGE', ordinal: META_AUTO_USAGE_ORDINAL, result: metaAutoUsage(collection.opens) }] : [],
  });
}

// TikTok top-ads auto-read follows the Meta read: one logged-out open of the public top-ads list for the product keyword
// (at most five, 30 s apart), never repeated after a restart. It shares the one browser-CLI lock with Metric and Meta.
// Same evidence rule as the Meta read (final URL, capped text, fingerprint; never raw HTML).
function tiktokTopAdsLane(source: TikTokTopAdsSource): CollectionLane {
  return lane<{ readonly run: CollectionRunFacts; readonly keyword: string }, TikTokTopAdsCollection>({
    name: 'tiktokTopAds',
    input: context => { const run = runFacts(context); return { run, keyword: run.input.keyword }; },
    collect: ({ keyword }, options) => source.collect({ keyword }, options),
    async store(step, collection, { run, keyword: asked }, _captures, check) {
      const keyword = collection ? collection.keyword : asked;
      let document = collection ? tiktokTopAdsDocument(collection, null) : tiktokTopAdsFailed(keyword);
      if (collection && tiktokTopAdsHasEvidence(collection)) {
        try { document = await run.publish('This run cannot publish a TikTok top-ads read.', writer => publishTikTokTopAdsEvidence(writer, run.input.runId, collection)); }
        catch { /* keeps the evidence-free document */ }
      }
      const probe = { ...step, tiktokTopAds: document };
      try {
        check(probe, { lineage: false });
        return probe;
      } catch { return { ...step, tiktokTopAds: tiktokTopAdsFailed(keyword, 'FAILED', collection?.opens ?? 0) }; }
    },
    usage: collection => collection.opens > 0 ? [{ kind: 'USAGE', ordinal: TIKTOK_TOP_ADS_USAGE_ORDINAL, result: tiktokTopAdsUsage(collection.opens) }] : [],
  });
}

// The whole-population baseline is a local file read for runs that include INSIGHT: no network, never repeated after a
// restart. It stores after the report PDFs (collection-lanes-save-step.ts), so earlier capture ordinals stay unchanged.
// A skipped read keeps a reason code only and never changes the step outcome, coverage or run blockers.
function populationBaselineLane(source: PopulationBaselineSource): CollectionLane {
  return lane<readonly string[], PopulationBaselineAttempt | null>({
    name: 'populationBaseline',
    input: context => context.reports,
    collect: reports => source.read({ reports }),
    // A thrown read leaves no document and no usage row (its own null value, so no unknown-cost row). A failed capture
    // write fails only this lane: storeCollectionLanes cuts its capture and stores the thrown document, i.e. none.
    thrown: () => null,
    async store(step, attempt, _reports, captures, check) {
      if (!attempt) return step;
      const index = attempt.capture ? await captures([attempt.capture], { retainPdf: false }) : null;
      const document = populationBaselineDocument(attempt, index);
      if (!document) return step;
      const probe = { ...step, populationBaseline: document };
      try {
        check(probe);
        return probe;
      } catch { return { ...step, populationBaseline: populationBaselineDocument({ reason: 'FILE_INVALID', baseline: null, sourceSha256: null, capture: null }, null)! }; }
    },
    usage: () => [],
  });
}

// TikTok Shop reviews (S06) come last, after the population baseline file read: Insight runs only, at most three confirmed
// and collected TikTok Shop products with a quick-search card (the set the top-selling videos use), top by the run's own
// revenue, one paid call each, never repeated after a restart. The main-channel rule needs the run's sales data and is evaluated at report build. Each raw response is
// a private capture; the normalized document (review text, no personal field) is a separate private artifact. The step
// keeps counts and digests only, never review text.
type TikTokShopReviewsInput = TikTokShopReviewsFacts & { kept: StoredArtifact | null };
function tiktokShopReviewsLane(source: TikTokShopReviewsSource): CollectionLane {
  return lane<TikTokShopReviewsInput, TikTokShopReviewsCollection>({
    name: 'tiktokShopReviews',
    input: context => {
      if (!context.tiktokShopReviews) throw new Error('The TikTok Shop reviews lane needs its run facts.');
      return { ...context.tiktokShopReviews, kept: null };
    },
    collect: async ({ reports, candidates }, options) => source.collect({ reports, candidates: await candidates() }, options),
    async store(step, collection, input, captures, check) {
      let probe: StepResultDocument;
      input.kept = null;
      // A capture write that throws leaves this store: storeCollectionLanes then cuts this lane's captures and stores the
      // thrown-collect document (this store without a collection), so only this lane fails.
      const indexes = new Map<string, number | null>();
      const phase = collection?.result ?? null;
      for (const capture of phase?.captures ?? []) {
        const index = await captures([capture], { retainPdf: false });
        if (index === null) continue;
        const product = phase!.products.find(item => item.captureId === capture.captureId);
        if (product) indexes.set(product.productId, index);
      }
      try {
        if (!collection) throw new Error('TikTok Shop reviews lane failed.');
        const document = tiktokShopReviewsDocument(collection);
        input.kept = document.status === 'SKIPPED' ? null : await input.putDocument(Buffer.from(canonicalJson(document), 'utf8'));
        probe = { ...step, tiktokShopReviews: tiktokShopReviewsStep(document, input.kept?.sha256 ?? null, indexes) };
      } catch { input.kept = null; probe = { ...step, tiktokShopReviews: tiktokShopReviewsFailed() }; }
      try {
        check(probe);
        return probe;
      } catch { input.kept = null; return { ...step, tiktokShopReviews: tiktokShopReviewsFailed() }; }
    },
    usage: collection => collection.result && collection.result.usage.requestsIssued > 0
      ? [{ kind: 'USAGE', ordinal: TIKTOK_SHOP_REVIEWS_USAGE_ORDINAL, result: tiktokShopReviewsUsage(collection.result) }] : [],
    manifests: input => input.kept ? [{ artifact: input.kept, mediaType: TIKTOK_SHOP_REVIEWS_DOCUMENT_MEDIA_TYPE }] : [],
  });
}

export interface CollectionLaneSources {
  readonly webSource?: AutomationSourcePort;
  readonly trendsSource?: SearchInterestSource;
  readonly trendsGeoSource?: SearchGeoSource;
  readonly expandedSource?: ExpandedSearchSource;
  readonly worldBankSource?: WorldBankSource;
  readonly comtradeSource?: ComtradeSource;
  readonly searchAdsSource?: SearchAdsSource;
  readonly officialStatsSource?: OfficialStatsSource;
  readonly metaAutoSource?: MetaAutoSource;
  readonly tiktokTopAdsSource?: TikTokTopAdsSource;
  readonly tiktokShopReviewsSource?: TikTokShopReviewsSource;
  readonly populationBaselineSource?: PopulationBaselineSource;
}

/**
 * The ordered lanes of the configured sources (a source is present only when its flag is on). Order = attempt order =
 * capture order. The province map needs the series, and the extra searches need the plain web search.
 */
export function collectionLanes(sources: CollectionLaneSources): readonly CollectionLane[] {
  return [
    ...(sources.webSource ? [webLane(sources.webSource)] : []),
    ...(sources.trendsSource ? [trendsLane(sources.trendsSource)] : []),
    ...(sources.trendsSource && sources.trendsGeoSource ? [geoLane(sources.trendsGeoSource)] : []),
    ...(sources.webSource && sources.expandedSource ? [expandedLane(sources.expandedSource)] : []),
    ...(sources.worldBankSource ? [worldBankLane(sources.worldBankSource)] : []),
    ...(sources.comtradeSource ? [comtradeLane(sources.comtradeSource)] : []),
    ...(sources.searchAdsSource ? [searchAdsLane(sources.searchAdsSource)] : []),
    ...(sources.officialStatsSource ? [officialStatsLane(sources.officialStatsSource)] : []),
    ...(sources.metaAutoSource ? [metaAutoLane(sources.metaAutoSource)] : []),
    ...(sources.tiktokTopAdsSource ? [tiktokTopAdsLane(sources.tiktokTopAdsSource)] : []),
    ...(sources.populationBaselineSource ? [populationBaselineLane(sources.populationBaselineSource)] : []),
    ...(sources.tiktokShopReviewsSource ? [tiktokShopReviewsLane(sources.tiktokShopReviewsSource)] : []),
  ];
}

// Lanes whose output only the Market report reads (owner Q2): an Insight-only run attempts none of them, so they make no
// provider or model call and leave no document, usage row or capture, like a source that is off.
const MARKET_ONLY: ReadonlySet<CollectionLaneName> = new Set(['trends', 'geo', 'worldBank', 'comtrade', 'searchAds', 'officialStats', 'metaAuto', 'tiktokTopAds']);

/**
 * Attempts each lane in order; COLLECTION only (QUICK_SEARCH runs none) and never after the run was aborted. Each lane
 * sees what the earlier lanes produced.
 */
export async function attemptCollectionLanes(lanes: readonly CollectionLane[], stepId: SourceStepId, context: CollectionRunContext, signal: AbortSignal): Promise<CollectionLaneRun[]> {
  const runs: CollectionLaneRun[] = [];
  const laneContext: CollectionLaneContext = { ...context, webUrls: () => earlierWebUrls(runs) };
  for (const item of lanes) if (stepId === 'COLLECTION' && !signal.aborted && (context.market || !MARKET_ONLY.has(item.name))) {
    const run = await item.attempt(laneContext, signal, [...runs]);
    if (run) runs.push(run);
  }
  return runs;
}

// The Meta and TikTok reads publish attachments after the video readings (collection-lanes-save-step.ts), and the TikTok
// Shop reviews store after them; the population baseline stores after the report PDFs; every other lane stores before the
// video readings.
const AFTER_VIDEO: ReadonlySet<CollectionLaneName> = new Set(['metaAuto', 'tiktokTopAds', 'tiktokShopReviews']);
const AFTER_PDF: ReadonlySet<CollectionLaneName> = new Set(['populationBaseline']);
/** The runs stored (and whose usage is written) before the video readings, in run order. */
export const lanesBeforeVideo = (runs: readonly CollectionLaneRun[]): CollectionLaneRun[] => runs.filter(run => !AFTER_VIDEO.has(run.name) && !AFTER_PDF.has(run.name));
/** The runs stored (and whose usage is written) after the video readings, in run order. */
export const lanesAfterVideo = (runs: readonly CollectionLaneRun[]): CollectionLaneRun[] => runs.filter(run => AFTER_VIDEO.has(run.name));
/** The runs stored (and whose usage is written) after the report PDFs, in run order. */
export const lanesAfterPdf = (runs: readonly CollectionLaneRun[]): CollectionLaneRun[] => runs.filter(run => AFTER_PDF.has(run.name));

/** A capture write of one lane failed. */
class LaneCaptureWriteError extends Error {}

/**
 * Stores each attempted lane's captures in run order and merges its document (or its failed document) into the step.
 * A failed capture write fails only that lane (owner c1 Q3): its captures are cut from the list (`rewind`), it gets its
 * own failed document, its usage rows stay as the attempt made them, and the later lanes still store.
 */
export async function storeCollectionLanes(runs: readonly CollectionLaneRun[], step: StepResultDocument, captures: LaneCaptureStore, check: LaneCheck, rewind?: LaneCaptureRewind): Promise<StepResultDocument> {
  const guarded: LaneCaptureStore = async (values, options) => {
    try { return await captures(values, options); } catch (cause) { throw new LaneCaptureWriteError('A lane capture write failed.', { cause }); }
  };
  for (const run of runs) {
    const length = rewind?.length();
    try { step = await run.store(step, guarded, check); }
    catch (error) {
      if (!(error instanceof LaneCaptureWriteError)) throw error;
      if (!run.writeFailed) throw error.cause;
      if (length !== undefined) rewind!.truncate(length);
      step = await run.writeFailed(step, check);
    }
  }
  return step;
}

/** Usage rows of the attempted lanes, in run order, for the service's final transaction. */
export const collectionLaneUsage = (runs: readonly CollectionLaneRun[]): LaneUsageRow[] => runs.flatMap(run => run.usage());

/** Private artifacts the stored lanes kept, in run order, for the service's final transaction. */
export const collectionLaneManifests = (runs: readonly CollectionLaneRun[]): LaneManifest[] => runs.flatMap(run => run.manifests?.() ?? []);

/** Whether a lane's own provider result reported a cancelled call. */
export const collectionLanesCancelled = (runs: readonly CollectionLaneRun[]): boolean => runs.some(run => run.cancelled === true);

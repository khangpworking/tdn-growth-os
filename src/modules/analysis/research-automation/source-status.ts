import type { ResearchAutomationSourceOperation, ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from '../../../../contracts/api/research-automation-source-status-api.generated.js';
import type { ResearchAutomationProviderConfig } from './providers.js';
import type { ResearchAutomationSerpApiOperation, ResearchAutomationSourceActivity, ResearchAutomationSourceActivityKey } from './service.js';

/** Live document-indexing connector state for the status card. Built server-side; no key value is included. */
export interface PageIndexStatusSummary {
  /** True when the server holds a document-indexing key (value never leaves the server). */
  readonly keyConfigured: boolean;
  /** False when the TDN_PAGEINDEX_CLOUD_ENABLED kill switch is off. */
  readonly enabled: boolean;
  readonly lastCallAt: string | null;
  /** Account-wide ledger count, not a workspace total. Workspace history comes from readSourceActivity. */
  readonly documentsSent: number | null;
  readonly balanceMicroDollars: number | null;
  readonly balanceCheckedAt: string | null;
  readonly billingUrl: string | null;
  readonly activePages: number | null;
  readonly estimatedMonthlyCostMicroDollars: number | null;
  readonly lowBalance: boolean;
  readonly usageLimited: boolean;
}

/** Every card shown on the internal source board. Trends is a SerpApi operation, not a card. */
export type SourceBoardId = ResearchAutomationSourceStatusEntry['source'];

export type SourceRegistryTier = 'A' | 'B' | 'C' | 'D';
export type SourceRegistryGroup = 'SALES_MARKET' | 'CUSTOMER_VOICE' | 'SELLER_VOICE' | 'MACRO' | 'DOCUMENTS';

/** How data can arrive once the collector exists. Determines the honest built-but-unwired state. */
export type FutureCollectorKind = 'MANUAL_UPLOAD' | 'PAID_API' | 'FREE_COLLECT';

/** A credential state usable for readiness: an installed key or explicitly no key required. MISSING is never usable. */
export function collectorCredentialUsable(credential: 'CONFIGURED' | 'MISSING' | 'NOT_REQUIRED'): boolean {
  return credential !== 'MISSING';
}

/**
 * Readiness of a future collector WITHOUT running any integration. Flipping
 * `built` to true never yields READY or run wiring: uploads read MANUAL_IMPORT,
 * collectors read NOT_CONFIGURED until credential/cap evidence exists, then
 * CONFIGURED_NOT_WIRED. Wiring into runs belongs to the owning package.
 */
export function futureCollectorState(input: { readonly built: boolean; readonly kind: FutureCollectorKind;
  readonly credentialPresent: boolean; readonly capUsable: boolean },
): 'NOT_BUILT' | 'MANUAL_IMPORT' | 'NOT_CONFIGURED' | 'CONFIGURED_NOT_WIRED' {
  if (!input.built) return 'NOT_BUILT';
  if (input.kind === 'MANUAL_UPLOAD') return 'MANUAL_IMPORT';
  if (input.kind === 'PAID_API') return input.credentialPresent && input.capUsable ? 'CONFIGURED_NOT_WIRED' : 'NOT_CONFIGURED';
  return input.credentialPresent ? 'CONFIGURED_NOT_WIRED' : 'NOT_CONFIGURED';
}

/** Generated-contract tuple shapes, shared so the builder cannot drift from the schema. */
export type SourceBoardRegistryIds = NonNullable<ResearchAutomationSourceStatusEntry['registryIds']>;
export type SourceBoardOperations = NonNullable<ResearchAutomationSourceStatusEntry['operations']>;
export type SourceBoardOperation = ResearchAutomationSourceOperation;

/**
 * One row of the source registry (input-data-sources-30-sections.md) mirrored
 * for the board. A single scalar tier is only set when every registry ID on the
 * card shares it; mixed connectors keep tier null with a per-ID tierDetail so no
 * aggregate is fabricated.
 */
export interface SourceRegistryCard {
  readonly registryIds: SourceBoardRegistryIds;
  readonly tier: SourceRegistryTier | null;
  readonly tierDetail: string | null;
  readonly group: SourceRegistryGroup;
  readonly reportName: string;
  readonly paid: boolean;
  /** Arrival kind for the built-but-unwired readiness mapping. */
  readonly arrival: FutureCollectorKind;
  /** Owning package that flips the card from NOT_BUILT; null once built. */
  readonly pendingPackage: string | null;
  /** True when the collecting/retaining module is present on this build. Drives the NOT_BUILT transition. */
  readonly built: boolean;
}

/**
 * Single constant mirroring the source registry v1.9 (IDs, tiers, groups, report
 * names) and build capability. Updated in the same PR whenever the registry
 * status of a source changes (Plan B-07).
 */
export const SOURCE_REGISTRY: Record<SourceBoardId, SourceRegistryCard> = {
  METRIC: { registryIds: ['S01', 'S04'], tier: null, tierDetail: 'S01: C; S04: B', group: 'SALES_MARKET',
    reportName: 'dữ liệu bán hàng ước tính trên sàn; trang bán của người bán', paid: false, pendingPackage: null, built: true, arrival: 'MANUAL_UPLOAD' },
  KALODATA: { registryIds: ['S02'], tier: 'C', tierDetail: null, group: 'SALES_MARKET',
    reportName: 'dữ liệu video bán hàng (ước tính)', paid: true, pendingPackage: null, built: true, arrival: 'PAID_API' },
  KALODATA_VIDEO_FILE: { registryIds: ['S02'], tier: 'C', tierDetail: null, group: 'SALES_MARKET',
    reportName: 'dữ liệu video bán hàng (ước tính)', paid: false, pendingPackage: null, built: true, arrival: 'MANUAL_UPLOAD' },
  APIFY_SHOPEE: { registryIds: ['S05'], tier: 'B', tierDetail: null, group: 'CUSTOMER_VOICE',
    reportName: 'review công khai trên Shopee', paid: true, pendingPackage: null, built: true, arrival: 'PAID_API' },
  APIFY_TIKTOK_COMMENTS: { registryIds: ['S07'], tier: 'B', tierDetail: null, group: 'CUSTOMER_VOICE',
    reportName: 'bình luận công khai dưới video', paid: true, pendingPackage: 'P9', built: false, arrival: 'PAID_API' },
  VIDEO_READING: { registryIds: ['S14'], tier: 'B', tierDetail: null, group: 'SELLER_VOICE',
    reportName: 'nội dung video của người bán', paid: false, pendingPackage: 'P9', built: false, arrival: 'MANUAL_UPLOAD' },
  META_AD_LIBRARY: { registryIds: ['S15'], tier: 'B', tierDetail: null, group: 'SELLER_VOICE',
    reportName: 'thư viện quảng cáo công khai của Meta', paid: false, pendingPackage: 'U-23', built: false, arrival: 'FREE_COLLECT' },
  SERPAPI: { registryIds: ['S19', 'S13', 'S26', 'S20'], tier: null, tierDetail: 'S19: theo trang gốc; S13: C; S26: C; S20: B',
    group: 'SALES_MARKET', reportName: 'kết quả tìm kiếm Google; mức quan tâm tìm kiếm trên Google',
    paid: true, pendingPackage: null, built: true, arrival: 'PAID_API' },
  OFFICIAL_STATS: { registryIds: ['S21'], tier: 'A', tierDetail: null, group: 'MACRO',
    reportName: 'Cục Thống kê (nso.gov.vn)', paid: false, pendingPackage: 'P10', built: false, arrival: 'MANUAL_UPLOAD' },
  WORLD_BANK: { registryIds: ['S23'], tier: 'A', tierDetail: null, group: 'MACRO',
    reportName: 'Ngân hàng Thế giới (World Bank Open Data)', paid: false, pendingPackage: 'P10', built: false, arrival: 'FREE_COLLECT' },
  PAGEINDEX: { registryIds: ['S22', 'S25'], tier: null, tierDetail: 'S22: A; S25: B/C', group: 'DOCUMENTS',
    reportName: 'Cục Thống kê (nso.gov.vn); báo cáo đã công bố của nhà xuất bản', paid: true, pendingPackage: null, built: true, arrival: 'PAID_API' },
};

/** Card order follows Plan B1. */
export const SOURCE_BOARD_ORDER: readonly SourceBoardId[] = ['METRIC', 'KALODATA', 'KALODATA_VIDEO_FILE', 'APIFY_SHOPEE',
  'APIFY_TIKTOK_COMMENTS', 'VIDEO_READING', 'META_AD_LIBRARY', 'SERPAPI', 'OFFICIAL_STATS', 'WORLD_BANK', 'PAGEINDEX'];

/**
 * Known SerpApi operations with their registry binding. Counts are stored
 * captures (one row per provider call). P5 owns the Trends collector; if it
 * persists a different operation name, it updates this row in the same PR.
 */
export const SERPAPI_KNOWN_OPERATIONS: readonly { readonly operation: string; readonly registryIds: string[]; readonly tier: SourceRegistryTier | null }[] = [
  { operation: 'serpapi.google.search', registryIds: ['S19', 'S13', 'S26'], tier: null },
  { operation: 'serpapi.google.trends', registryIds: ['S20'], tier: 'B' },
];

export interface SourceStatusInput {
  readonly workspaceId: string;
  readonly checkedAt: string;
  /** True only when this server owns the writer and worker that execute runs. */
  readonly executorEnabled: boolean;
  readonly providers: ResearchAutomationProviderConfig | undefined;
  /** Sources the executor actually calls during a run. Web search is configured separately from run wiring. */
  readonly wired: { readonly kalodata: boolean; readonly serpapi: boolean; readonly apifyShopee: boolean };
  readonly activity: Record<ResearchAutomationSourceActivityKey, ResearchAutomationSourceActivity> & { readonly serpapiOperations: readonly ResearchAutomationSerpApiOperation[] };
  /** Absent until the API route passes live connector state; the card then shows the not-connected copy. */
  readonly pageindex?: PageIndexStatusSummary;
}

/** Configuration and stored history only: no provider is called and no credential value leaves the server. */
export function buildResearchAutomationSourceStatus(input: SourceStatusInput): ResearchAutomationSourceStatus {
  const providers = input.providers;
  type BoardMeta = { readonly pendingPackage: string | null; readonly registryIds: SourceBoardRegistryIds;
    readonly tier: SourceRegistryTier | null; readonly tierDetail: string | null;
    readonly group: SourceRegistryGroup; readonly reportName: string };
  const meta = (source: SourceBoardId): BoardMeta => {
    const card = SOURCE_REGISTRY[source];
    return { pendingPackage: card.pendingPackage, registryIds: card.registryIds, tier: card.tier,
      tierDetail: card.tierDetail, group: card.group, reportName: card.reportName };
  };
  /** EXECUTOR_DISABLED wins over every card; an unbuilt module reads NOT_BUILT. The flag decides, not the call site. */
  const cardState = (source: SourceBoardId, operational: ResearchAutomationSourceStatusEntry['state']): ResearchAutomationSourceStatusEntry['state'] =>
    !input.executorEnabled ? 'EXECUTOR_DISABLED' : !SOURCE_REGISTRY[source].built ? 'NOT_BUILT' : operational;
  const paidSource = (source: 'KALODATA' | 'SERPAPI' | 'APIFY_SHOPEE', key: 'kalodata' | 'serpapi' | 'apify-shopee',
    credentialPresent: boolean, usable: boolean, wired: boolean, spendCapUsd: number | null,
    operations: SourceBoardOperations | null): ResearchAutomationSourceStatusEntry => ({
    source,
    state: cardState(source, !usable ? 'NOT_CONFIGURED' : wired ? 'READY' : 'CONFIGURED_NOT_WIRED'),
    credential: credentialPresent ? 'CONFIGURED' : 'MISSING',
    wiredIntoRuns: wired, paid: true, ...input.activity[key], ...meta(source), spendCapUsd, operations,
  });
  /** Placeholder for a source whose collector is owned by a future package. Never pretends it is built or wired. */
  const notBuilt = (source: SourceBoardId, key: ResearchAutomationSourceActivityKey, credential: 'MISSING' | 'NOT_REQUIRED' | 'CONFIGURED',
    spendCapUsd: number | null): ResearchAutomationSourceStatusEntry => {
    const card = SOURCE_REGISTRY[source];
    return {
      source,
      state: !input.executorEnabled ? 'EXECUTOR_DISABLED' : futureCollectorState({ built: card.built, kind: card.arrival,
        credentialPresent: collectorCredentialUsable(credential), capUsable: spendCapUsd !== null }),
      credential, wiredIntoRuns: false, paid: card.paid, ...input.activity[key],
      ...meta(source), spendCapUsd, operations: null,
    };
  };
  const apifyToken = Boolean(providers?.apifyTokenConfigured || providers?.apifyReviews);
  const pageindex = input.pageindex;
  const pageindexUsable = Boolean(pageindex?.keyConfigured && pageindex?.enabled);
  const manualSource = (source: 'METRIC' | 'KALODATA_VIDEO_FILE', key: 'metric' | 'kalodata-video'): ResearchAutomationSourceStatusEntry => ({
    source, state: cardState(source, 'MANUAL_IMPORT'), credential: 'NOT_REQUIRED',
    wiredIntoRuns: true, paid: false, ...input.activity[key], lastUsageAt: null, ...meta(source), spendCapUsd: null, operations: null,
  });
  const sources: ResearchAutomationSourceStatus['sources'] = [
    manualSource('METRIC', 'metric'),
    paidSource('KALODATA', 'kalodata', Boolean(providers?.kalodataSecretKey), Boolean(providers?.kalodataSecretKey), input.wired.kalodata, null, null),
    manualSource('KALODATA_VIDEO_FILE', 'kalodata-video'),
    // Paid review collection also needs a spending cap; a token alone never starts a collection.
    paidSource('APIFY_SHOPEE', 'apify-shopee', apifyToken, Boolean(providers?.apifyReviews), input.wired.apifyShopee,
      providers?.apifyReviews?.maxChargeUsd ?? null, null),
    // The shared Apify token is credential evidence; the missing independent cap
    // still blocks collection and the card stays NOT_BUILT until P9 lands.
    notBuilt('APIFY_TIKTOK_COMMENTS', 'apify-tiktok-comments', apifyToken ? 'CONFIGURED' : 'MISSING',
      providers?.apifyTikTokComments?.maxChargeUsd ?? null),
    notBuilt('VIDEO_READING', 'video-reading', 'NOT_REQUIRED', null),
    notBuilt('META_AD_LIBRARY', 'meta-ad-library', 'NOT_REQUIRED', null),
    paidSource('SERPAPI', 'serpapi', Boolean(providers?.serpApiKey), Boolean(providers?.serpApiKey), input.wired.serpapi, null,
      buildSerpApiOperations(input.activity.serpapiOperations)),
    notBuilt('OFFICIAL_STATS', 'official-stats', 'NOT_REQUIRED', null),
    notBuilt('WORLD_BANK', 'world-bank', 'NOT_REQUIRED', null),
    {
      source: 'PAGEINDEX',
      state: cardState('PAGEINDEX', !pageindexUsable ? 'NOT_CONFIGURED' : 'READY'),
      credential: pageindex?.keyConfigured ? 'CONFIGURED' : 'MISSING',
      wiredIntoRuns: pageindexUsable,
      paid: true,
      // Workspace totals only. Account-wide ledger numbers stay inside `pageindex`
      // and the board labels them as account totals, never workspace history.
      lastDataAt: input.activity.pageindex.lastDataAt,
      dataCount: input.activity.pageindex.dataCount,
      lastUsageAt: input.activity.pageindex.lastUsageAt,
      ...meta('PAGEINDEX'), spendCapUsd: null, operations: null,
      pageindex: {
        automaticState: !input.executorEnabled || !pageindexUsable ? 'DISABLED' : pageindex?.lowBalance || pageindex?.usageLimited ? 'PAUSED_LOW_BALANCE' : 'INDEXING_PDFS',
        documentsSent: pageindex?.documentsSent ?? null,
        balanceMicroDollars: pageindex?.balanceMicroDollars ?? null,
        balanceCheckedAt: pageindex?.balanceCheckedAt ?? null,
        billingUrl: pageindex?.billingUrl ?? null,
        activePages: pageindex?.activePages ?? null,
        estimatedMonthlyCostMicroDollars: pageindex?.estimatedMonthlyCostMicroDollars ?? null,
        usageLimited: pageindex?.usageLimited ?? false,
      },
    },
  ];
  assertBoardOrder(sources);
  return {
    contractVersion: 'research-automation-source-status-v1',
    workspaceId: input.workspaceId,
    checkedAt: input.checkedAt,
    executorEnabled: input.executorEnabled,
    sources,
  };
}

/** Guards the Plan B1 roster order at runtime; a wrong order fails closed instead of rendering. */
function assertBoardOrder(sources: ResearchAutomationSourceStatus['sources']): void {
  if (sources.length !== SOURCE_BOARD_ORDER.length ||
    !sources.every((entry, index) => entry.source === SOURCE_BOARD_ORDER[index])) {
    throw new Error('Source board roster order changed; update SOURCE_BOARD_ORDER with the registry.');
  }
}

/** Array-to-tuple conversion for registry IDs. The only remaining cast: JSON Schema tuples cannot be built element-wise. */
const asRegistryIds = (ids: readonly string[]): SourceBoardRegistryIds =>
  [...ids] as unknown as SourceBoardRegistryIds;

/** Known operation rows with observed capture counts; unknown observed operations pass through unbound, never dropped. Usage stays provider-level, never per operation. */
function buildSerpApiOperations(observed: readonly ResearchAutomationSerpApiOperation[]): SourceBoardOperations {
  const seen = new Map(observed.map(row => [row.operation, row]));
  const rows: SourceBoardOperation[] = SERPAPI_KNOWN_OPERATIONS.map(known => {
    const row = seen.get(known.operation);
    seen.delete(known.operation);
    return { operation: known.operation, count: row?.count ?? 0, lastDataAt: row?.lastDataAt ?? null,
      lastUsageAt: null, registryIds: asRegistryIds(known.registryIds), tier: known.tier };
  });
  for (const row of seen.values()) {
    rows.push({ operation: row.operation, count: row.count, lastDataAt: row.lastDataAt, lastUsageAt: null });
  }
  return rows as unknown as SourceBoardOperations;
}

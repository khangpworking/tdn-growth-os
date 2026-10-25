// TikTok Shop product reviews lane (S06) for the Insight flow. Off unless the flag is exactly "1".
//
// Collection: only for runs whose reports include INSIGHT, at most three confirmed TikTok Shop products (top by revenue),
// one paid call each through the sales-data provider's comment insight operation. A zero balance before the phase means
// no call; the provider's credit answer stops the phase. Paid calls are never retried.
// Storage: the raw response is the private capture; the normalized document keeps review id, text, variant and raw date
// only (no reviewer name, avatar, user id or other personal field) plus the provider's own AI points, marked as such.
// Channel rule: TikTok Shop must hold at least half of the run's in-scope revenue (Shopee + TikTok Shop, same run's sales
// data). That revenue is known only at report build, so the rule is evaluated there (tiktokShopChannelDecision).
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-tiktok-shop-reviews.schema.json' with { type: 'json' };
import type { AutomationTikTokShopReviews, StepTikTokShopReviews, TikTokShopReviewsSkipReason } from '../../../../contracts/analysis/automation-tiktok-shop-reviews.generated.js';
import { KALODATA_COMMENT_INSIGHT_LIMITS, type KalodataCommentInsightResult, type KalodataProvider } from './provider-kalodata.js';
import type { ProviderCallOptions } from './providers.js';
import type { TypedComparable } from './model.js';
import { parseProviderProductRef } from './provider-common.js';
import type { AutomationMetricMethodSnapshot } from './metric-method-bridge.js';
import { marketChartSource } from './market-presentation-report.js';
export type { AutomationTikTokShopReviews, StepTikTokShopReviews, TikTokShopReviewsSkipReason } from '../../../../contracts/analysis/automation-tiktok-shop-reviews.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema);
const validateDocument = ajv.compile<AutomationTikTokShopReviews>({ $ref: schema.$id });
const validateStep = ajv.compile<StepTikTokShopReviews>({ $ref: `${schema.$id}#/$defs/stepSummary` });

export const TIKTOK_SHOP_REVIEWS_FLAG = 'TDN_RESEARCH_TIKTOK_SHOP_REVIEWS_ENABLED';
/** Usage ordinal inside the collection step (after 19, the last search-ads discovery ordinal). */
export const TIKTOK_SHOP_REVIEWS_USAGE_ORDINAL = 20;
export const TIKTOK_SHOP_REVIEWS_PROFILE = 'tiktok-shop-reviews-v1' as const;
export const TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS = KALODATA_COMMENT_INSIGHT_LIMITS.maxProducts;
/** TikTok Shop is the main channel at or above this share of in-scope revenue. */
export const TIKTOK_SHOP_MAIN_CHANNEL_SHARE = 0.5;
export const TIKTOK_SHOP_REVIEWS_DOCUMENT_MEDIA_TYPE = 'application/vnd.tdn.research-automation.tiktok-shop-reviews+json';

export function tiktokShopReviewsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[TIKTOK_SHOP_REVIEWS_FLAG] === '1';
}

/** A confirmed TikTok Shop product of the run; revenue is the run's own summed product revenue, null when unknown. */
export interface TikTokShopReviewCandidate { readonly productId: string; readonly revenue: number | null }

/** Confirmed products (selected and peers) with a quick-search card, summed by the run's own revenue (GMV); unknown when no figure is usable. */
export function tiktokShopProductCandidates(confirmed: ReadonlySet<string>, carded: ReadonlySet<string>, comparables: readonly TypedComparable[]): TikTokShopReviewCandidate[] {
  const revenue = new Map<string, number | null>();
  for (const value of comparables) {
    if (value.provider !== 'kalodata' || !confirmed.has(value.productId) || !carded.has(value.productId)) continue;
    const amount = value.metric === 'GMV_VND' ? Number(value.value) : NaN;
    const prior = revenue.get(value.productId) ?? null;
    revenue.set(value.productId, Number.isFinite(amount) ? (prior ?? 0) + amount : prior);
  }
  return [...revenue].flatMap(([ref, amount]): TikTokShopReviewCandidate[] => {
    const parsed = parseProviderProductRef(ref);
    return parsed ? [{ productId: parsed.sourceProductId, revenue: amount }] : [];
  });
}

/** Top by revenue (unknown last, then id), at most three distinct numeric ids. */
export function pickTikTokShopReviewProducts(candidates: readonly TikTokShopReviewCandidate[]): string[] {
  const best = new Map<string, number | null>();
  for (const item of candidates) {
    if (!/^\d{1,32}$/.test(item.productId)) continue;
    const revenue = item.revenue !== null && Number.isFinite(item.revenue) ? item.revenue : null;
    const prior = best.get(item.productId);
    if (prior === undefined || (revenue !== null && (prior === null || revenue > prior))) best.set(item.productId, revenue);
  }
  return [...best].sort(([a, ra], [b, rb]) => ra === rb ? (a < b ? -1 : a > b ? 1 : 0) : ra === null ? 1 : rb === null ? -1 : rb - ra)
    .slice(0, TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS).map(([id]) => id);
}

export interface TikTokShopReviewsCollection {
  /** Set when nothing was collected for a closed reason. */
  readonly skipReason: TikTokShopReviewsSkipReason | null;
  /** The provider phase; null when no call was planned. */
  readonly result: KalodataCommentInsightResult | null;
}

export interface TikTokShopReviewsSource {
  collect(input: { readonly reports: readonly string[]; readonly candidates: readonly TikTokShopReviewCandidate[] }, options?: ProviderCallOptions): Promise<TikTokShopReviewsCollection>;
}

export function createTikTokShopReviewsSource(provider: Pick<KalodataProvider, 'productCommentInsight'>, enabled = true): TikTokShopReviewsSource {
  return {
    async collect(input, options = {}) {
      if (!enabled) return { skipReason: 'FLAG_OFF', result: null };
      if (!input.reports.includes('INSIGHT')) return { skipReason: 'NOT_INSIGHT_RUN', result: null };
      const picks = pickTikTokShopReviewProducts(input.candidates);
      if (!picks.length) return { skipReason: 'NO_TIKTOK_PRODUCTS', result: null };
      const result = await provider.productCommentInsight(picks, options);
      const usable = result.products.some(item => item.outcome === 'OK' || item.outcome === 'EMPTY');
      return { skipReason: usable ? null : result.creditExhausted ? 'CREDIT_EXHAUSTED' : 'PROVIDER_FAILED', result };
    },
  };
}

/** The normalized private document. Counts are record counts; points are the provider's AI grouping, never coding. */
export function tiktokShopReviewsDocument(collection: TikTokShopReviewsCollection): AutomationTikTokShopReviews {
  const products = (collection.result?.products ?? []).map(item => ({
    productId: item.productId, outcome: item.outcome, responseSha256: item.responseSha256,
    reviewCount: item.record?.reviews.length ?? 0, ratingAvailable: false as const, cachedAt: item.record?.cachedAt ?? null,
    reviews: (item.record?.reviews ?? []).map(row => ({ id: row.id, text: row.text, sku: row.sku, dateRaw: row.dateRaw })),
    points: (item.record?.points ?? []).map(point => ({ kind: point.kind, label: point.label, reviewIds: [...point.reviewIds], providerAiPoint: true as const })),
  }));
  const settled = products.filter(item => item.outcome === 'OK' || item.outcome === 'EMPTY').length;
  const status = collection.result === null ? 'SKIPPED' as const : settled === 0 ? 'FAILED' as const
    : settled === products.length ? 'COLLECTED' as const : 'PARTIAL' as const;
  const document = { contractVersion: 'automation-tiktok-shop-reviews-v1' as const, country: 'VN' as const, status,
    skipReason: collection.skipReason, counting: 'RECORDS_NOT_PEOPLE' as const, products } as AutomationTikTokShopReviews;
  if (!validateDocument(document)) throw new TypeError('TikTok Shop reviews document failed its canonical schema');
  return document;
}

/** COLLECTION step pointer: counts and digests only. `captureIndexes` maps a product id to its stored capture. */
export function tiktokShopReviewsStep(document: AutomationTikTokShopReviews, documentSha256: string | null,
  captureIndexes: ReadonlyMap<string, number | null>): StepTikTokShopReviews {
  return { profile: TIKTOK_SHOP_REVIEWS_PROFILE, status: document.status, skipReason: document.skipReason,
    documentSha256: document.status === 'SKIPPED' ? null : documentSha256,
    products: document.products.map(item => ({ productId: item.productId, outcome: item.outcome,
      captureIndex: captureIndexes.get(item.productId) ?? null, reviewCount: item.reviewCount })) };
}

export function tiktokShopReviewsFailed(): StepTikTokShopReviews {
  return { profile: TIKTOK_SHOP_REVIEWS_PROFILE, status: 'FAILED', skipReason: 'PROVIDER_FAILED', documentSha256: null, products: [] };
}

export function validTikTokShopReviewsStep(value: unknown): value is StepTikTokShopReviews {
  return validateStep(value);
}

/**
 * A stored S06 document as the coding source: its canonical schema, and the counts and outcomes the COLLECTION step pointer
 * recorded for it. Returns the document; throws when they differ. No provider call, no inference.
 */
export function verifyTikTokShopReviewsDocument(value: unknown, step: StepTikTokShopReviews): AutomationTikTokShopReviews {
  if (!validateDocument(value) || !validateStep(step)) throw new TypeError('TIKTOK_SHOP_REVIEWS_DOCUMENT_INVALID');
  const document = value as AutomationTikTokShopReviews;
  if (document.status !== step.status || document.skipReason !== step.skipReason || document.products.length !== step.products.length ||
    document.products.some((product, index) => {
      const recorded = step.products[index]!;
      return product.productId !== recorded.productId || product.outcome !== recorded.outcome ||
        product.reviewCount !== recorded.reviewCount || product.reviews.length !== product.reviewCount;
    })) throw new TypeError('TIKTOK_SHOP_REVIEWS_DOCUMENT_DIFFERS');
  return document;
}

export function tiktokShopReviewsUsage(result: KalodataCommentInsightResult): { readonly provider: string; readonly usage: KalodataCommentInsightResult['usage'] } {
  return { provider: 'KALODATA', usage: result.usage };
}

export type TikTokShopChannelDecision =
  | { readonly decision: 'MAIN'; readonly share: number }
  | { readonly decision: 'CHANNEL_NOT_MAIN'; readonly share: number }
  | { readonly decision: 'CHANNEL_SHARE_UNKNOWN'; readonly reason: 'NO_PLATFORM_SALES_DATA' | 'PLATFORM_NOT_COVERED' | 'REVENUE_MISSING' | 'NO_REVENUE' };

/**
 * TikTok Shop share of the run's in-scope revenue, read from the frozen sales-data records the Market charts use.
 * Internal gate only: the share and the two-platform total are never printed in a report.
 * Unknown whenever a platform was not covered or any in-scope record lacks revenue; never guessed.
 */
export function tiktokShopChannelDecision(metric: AutomationMetricMethodSnapshot | undefined): TikTokShopChannelDecision {
  if (!metric) return { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'NO_PLATFORM_SALES_DATA' };
  const rows = marketChartSource([], metric).rows;
  const covered = metric.capture ? new Set(metric.capture.platforms.map(item => item.platform)) : new Set(rows.map(row => row.platform));
  if (!covered.has('shopee') || !covered.has('tiktok')) return { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'PLATFORM_NOT_COVERED' };
  if (rows.some(row => typeof row.rev !== 'number' || !Number.isFinite(row.rev) || row.rev < 0)) return { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'REVENUE_MISSING' };
  const sum = (platform: 'shopee' | 'tiktok') => rows.filter(row => row.platform === platform).reduce((total, row) => total + row.rev!, 0);
  const tiktok = sum('tiktok'), total = sum('shopee') + tiktok;
  if (!(total > 0)) return { decision: 'CHANNEL_SHARE_UNKNOWN', reason: 'NO_REVENUE' };
  const share = tiktok / total;
  return share >= TIKTOK_SHOP_MAIN_CHANNEL_SHARE ? { decision: 'MAIN', share } : { decision: 'CHANNEL_NOT_MAIN', share };
}

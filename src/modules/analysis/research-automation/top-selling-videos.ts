// Automated top-selling TikTok videos (S14) for the video-watch lane. Off unless the flag is exactly "1"; off leaves the lane as before.
//
// At COLLECTION, for Market and Insight runs alike: at most three confirmed, collected TikTok Shop products (top by the run's revenue,
// unknown last), one paid ranked-video call each (ten videos by revenue). Rows of all products are merged, ranked by revenue then views
// (largest first, missing last), deduplicated by video id and turned into exact public video URLs; at most five become TOP_SELLING
// candidates. The creator handle only builds the URL: it is never put in step text, reader text or a log line.
import type { KalodataProvider, KalodataVideoRankOutcome, KalodataVideoRankResult } from './provider-kalodata.js';
import type { ProviderCallOptions } from './providers.js';
import type { StepTopSellingVideoRank } from './model.js';
import { exactTikTokVideoUrl } from './tiktok-video-selection.js';
import { pickTikTokShopReviewProducts, type TikTokShopReviewCandidate } from './tiktok-shop-reviews.js';
import { VIDEO_WATCH_MAX_TOP_SELLING } from './video-watch-lane.js';

export const TOP_SELLING_VIDEOS_FLAG = 'TDN_RESEARCH_TOP_SELLING_VIDEOS_ENABLED';
/** Usage ordinal inside the collection step (after 20, the TikTok Shop reviews ordinal). */
export const TOP_SELLING_VIDEOS_USAGE_ORDINAL = 21;
/** At most five top-selling videos are read per run (owner rule, 22/10). */
export const TOP_SELLING_VIDEOS_MAX = VIDEO_WATCH_MAX_TOP_SELLING;
export const TOP_SELLING_VIDEO_RANK_OUTCOMES: readonly KalodataVideoRankOutcome[] = ['OK', 'EMPTY', 'FAILED', 'AMBIGUOUS_NO_RETRY', 'NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_STOPPED', 'NOT_RUN_CANCELLED'];

export function topSellingVideosEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[TOP_SELLING_VIDEOS_FLAG] === '1';
}

export interface TopSellingVideoSource {
  /** One paid ranked-video call per picked product (at most three); null when no product was picked (no call). */
  collect(candidates: readonly TikTokShopReviewCandidate[], options?: ProviderCallOptions): Promise<KalodataVideoRankResult | null>;
}

export function createTopSellingVideoSource(provider: Pick<KalodataProvider, 'topSellingVideos'>): TopSellingVideoSource {
  return {
    async collect(candidates, options = {}) {
      const picks = pickTikTokShopReviewProducts(candidates);
      return picks.length ? provider.topSellingVideos(picks, options) : null;
    },
  };
}

/** Pure: all products' rows merged, ranked by revenue then views (largest first, a missing value last), ties in product then row order,
 * deduplicated by video id, exact URLs only (a row whose URL fails the exact check is left out), at most five. */
export function rankTopSellingVideos(result: KalodataVideoRankResult | null): { videoId: string; url: string }[] {
  const rows = (result?.products ?? []).flatMap(product => product.outcome === 'OK' ? product.rows : []).map((row, order) => ({ row, order }));
  const value = (n: number | null): number => n ?? -1;
  rows.sort((a, b) => value(b.row.revenue) - value(a.row.revenue) || value(b.row.views) - value(a.row.views) || a.order - b.order);
  const out: { videoId: string; url: string }[] = [], seen = new Set<string>();
  for (const { row } of rows) {
    if (out.length >= TOP_SELLING_VIDEOS_MAX || seen.has(row.videoId)) continue;
    let video: ReturnType<typeof exactTikTokVideoUrl>;
    try { video = exactTikTokVideoUrl(`https://www.tiktok.com/@${row.handle}/video/${row.videoId}`); } catch { continue; }
    if (video.videoId !== row.videoId) continue;
    seen.add(row.videoId);
    out.push({ videoId: video.videoId, url: video.url });
  }
  return out;
}

/** The step record: per product its outcome and stored capture, and how many videos were kept. No handle, title or figure. */
export function topSellingVideoRankStep(result: KalodataVideoRankResult | null, captureIndexes: ReadonlyMap<string, number>, kept: number): StepTopSellingVideoRank {
  return { creditExhausted: result?.creditExhausted ?? false, kept,
    products: (result?.products ?? []).map(product => ({ productId: product.productId, outcome: product.outcome,
      captureIndex: product.captureId === null ? null : captureIndexes.get(product.captureId) ?? null })) };
}

export function topSellingVideosUsage(result: KalodataVideoRankResult): { readonly provider: string; readonly usage: KalodataVideoRankResult['usage'] } {
  return { provider: 'KALODATA', usage: result.usage };
}

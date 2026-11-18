import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { SamplingJournal } from '../contracts/foundation/shopee-review-sampling.generated.js';
import { shopeePublicReviewConfigFromEnv } from '../src/modules/analysis/research-automation/providers.js';
import { ShopeeReviewSamplingCollector } from '../src/platform/collectors/shopee-review-sampling.js';
import { validateReviewCounts, type ReviewCounts, type ReviewLink } from '../src/modules/foundation/shopee-review-sampling.js';

/** Contract names (owner F640): one closed list shared by steps 2 and 3. */
export const PRODUCT_LEVEL_CODES = ['PRODUCT_UNAVAILABLE', 'RATINGS_MISSING'] as const;
export const LINK_REJECT_CODES = [...PRODUCT_LEVEL_CODES, 'NO_TARGET_STAR_REVIEWS'] as const;
export type LinkRejectCode = (typeof LINK_REJECT_CODES)[number];
export type StarCounts = Record<'1' | '2' | '3' | '4' | '5', number | null>;

export interface LinkCheckEntry {
  productBaseId: string;
  url: string;
  stage: 'm2';
  result: 'ok' | 'rejected';
  reason: LinkRejectCode | null;
  starCounts: StarCounts | null;
  checkedAt: string;
}

export interface LinkCheckInput { productBaseId: string; shopId: string; itemId: string; url: string }
export type LinkCheckDecision = { result: 'ok'; starCounts: StarCounts | null } | { result: 'rejected'; reason: LinkRejectCode };
/** A rejected candidate is replaced; these stop step 2 without a link verdict. */
export type LinkCheck = (input: LinkCheckInput) => Promise<LinkCheckDecision>;

/** A step-2 stop that is not a link verdict: the owner must act or the check itself failed. */
export class LinkCheckStop extends Error {
  constructor(readonly code: 'HUMAN_LOGIN_REQUIRED' | 'HUMAN_VERIFICATION_REQUIRED' | 'LINK_CHECK_FAILED') { super(code); }
}

export type LinkCollector = Pick<ShopeeReviewSamplingCollector, 'run'>;

/** The review-counts route; any configuration or connection problem stops step 2 as LINK_CHECK_FAILED. */
export function linkCollectorFromEnvironment(environment: NodeJS.ProcessEnv = process.env): LinkCollector {
  try {
    const configuration = shopeePublicReviewConfigFromEnv(environment);
    if (!configuration) throw new LinkCheckStop('LINK_CHECK_FAILED');
    return new ShopeeReviewSamplingCollector({ token: configuration.token, baseUrl: configuration.baseUrl });
  } catch { throw new LinkCheckStop('LINK_CHECK_FAILED'); }
}

const observedStarCounts = (counts: ReviewCounts): StarCounts => Object.fromEntries(
  (['1', '2', '3', '4', '5'] as const).map(star => [star, counts.stars[star].status === 'observed' ? counts.stars[star].value : null]),
) as StarCounts;

/**
 * One count job per accepted candidate, through the same collector client and `/count-jobs` route as review-counts.
 * Every candidate with a verdict (ok or a product-level rejection) appends its entry in walk order.
 */
export function createM2LinkCheck(options: { collector: LinkCollector; policy: { mode: string; stars: readonly number[] } | null;
  journalDir: string; now?: () => Date }) {
  const entries: LinkCheckEntry[] = [];
  const checkedAt = () => (options.now?.() ?? new Date()).toISOString();
  const verdict = (pick: Pick<LinkCheckInput, 'productBaseId' | 'url'>, result: 'ok' | 'rejected', reason: LinkRejectCode | null, starCounts: StarCounts | null) => {
    entries.push({ productBaseId: pick.productBaseId, url: pick.url, stage: 'm2', result, reason, starCounts, checkedAt: checkedAt() });
    return result === 'ok' ? { result: 'ok' as const, starCounts } : { result: 'rejected' as const, reason: reason! };
  };
  const check: LinkCheck = async ({ productBaseId, shopId, itemId, url }) => {
    const link: ReviewLink = { shopId, itemId, url };
    let journal: SamplingJournal;
    try {
      journal = await options.collector.run(join(options.journalDir, `${randomUUID()}.json`),
        { kind: 'counts', url, request_key: randomUUID() }, link, null);
    } catch { throw new LinkCheckStop('LINK_CHECK_FAILED'); }
    const code = journal.errorCode;
    if (code === 'PRODUCT_UNAVAILABLE' || code === 'RATINGS_MISSING')
      return verdict({ productBaseId, url }, 'rejected', code, null);
    if (code === 'HUMAN_LOGIN_REQUIRED' || code === 'HUMAN_VERIFICATION_REQUIRED') throw new LinkCheckStop(code);
    if (code !== null || !journal.terminal || !journal.result || journal.result.format !== 'shopee-review-counts-v1')
      throw new LinkCheckStop('LINK_CHECK_FAILED');
    let counts: ReviewCounts;
    try { counts = validateReviewCounts(journal.result); }
    catch { throw new LinkCheckStop('LINK_CHECK_FAILED'); }
    const starCounts = observedStarCounts(counts);
    const policy = options.policy;
    if (policy?.mode === 'stars' && policy.stars.length > 0 &&
        policy.stars.every(star => starCounts[String(star) as keyof StarCounts] === 0))
      return verdict({ productBaseId, url }, 'rejected', 'NO_TARGET_STAR_REVIEWS', starCounts);
    return verdict({ productBaseId, url }, 'ok', null, starCounts);
  };
  return { check, entries };
}

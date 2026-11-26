import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SamplingJournal } from '../contracts/foundation/shopee-review-sampling.generated.js';
import { shopeePublicReviewConfigFromEnv } from '../src/modules/analysis/research-automation/providers.js';
import { ShopeeReviewSamplingCollector, readSamplingJournal } from '../src/platform/collectors/shopee-review-sampling.js';
import { validateReviewCounts, type ReviewCounts, type ReviewLink } from '../src/modules/foundation/shopee-review-sampling.js';

/** Owner decision: one clock for all count work of one M2 attempt, reconciliation and waits included. */
export const LINK_CHECK_BUDGET_MS = 10 * 60_000;
export const LINK_CHECK_PER_LINK_MS = 30_000;
export const LINK_CHECK_BUDGET_MAX_MS = 60 * 60_000;
/** Contract F644 (measured 26/11: about 20 s per link): max(10 minutes, linksToCheck × 30 s), capped at 60 minutes;
 *  one shared deadline, sized for the whole walk also on a retry. */
export const linkCheckBudgetMs = (linksToCheck: number): number =>
  Math.min(LINK_CHECK_BUDGET_MAX_MS, Math.max(LINK_CHECK_BUDGET_MS, linksToCheck * LINK_CHECK_PER_LINK_MS));

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

const linkFromUrl = (url: string): ReviewLink | null => {
  const match = /^https:\/\/shopee\.vn\/product\/([1-9][0-9]{0,19})\/([1-9][0-9]{0,19})$/.exec(url);
  return match ? { shopId: match[1]!, itemId: match[2]!, url } : null;
};

/**
 * Retry path: a count job whose submission was lost stays on disk and is reconciled before any new submission.
 * An unresolved journal stops step 2 instead of being deleted or resubmitted. The caller's deadline (started
 * before this reconciliation) bounds the recovery; when it has expired the journal stays on disk untouched.
 */
export async function reconcileLinkJournals(options: { collector: LinkCollector; journalDir: string; deadline: number;
    now?: () => Date }): Promise<void> {
  const clock = () => (options.now?.() ?? new Date()).getTime();
  let names: string[];
  try { names = await readdir(options.journalDir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new LinkCheckStop('LINK_CHECK_FAILED'); }
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const file = join(options.journalDir, name);
    let journal: SamplingJournal | null;
    try { journal = await readSamplingJournal(file); } catch { throw new LinkCheckStop('LINK_CHECK_FAILED'); }
    if (!journal || journal.terminal) continue;
    const remaining = options.deadline - clock();
    if (remaining <= 0) throw new LinkCheckStop('LINK_CHECK_FAILED');
    const link = linkFromUrl(journal.request.url);
    if (!link) throw new LinkCheckStop('LINK_CHECK_FAILED');
    let reconciled: SamplingJournal;
    try { reconciled = await options.collector.run(file, journal.request, link, null, true, AbortSignal.timeout(remaining)); }
    catch { throw new LinkCheckStop('LINK_CHECK_FAILED'); }
    // The job can stop on a session that still needs the owner: keep that wait instead of a generic failure.
    if (reconciled.errorCode === 'HUMAN_LOGIN_REQUIRED' || reconciled.errorCode === 'HUMAN_VERIFICATION_REQUIRED')
      throw new LinkCheckStop(reconciled.errorCode);
    if (!reconciled.terminal) throw new LinkCheckStop('LINK_CHECK_FAILED');
  }
}

/**
 * One count job per accepted candidate, through the same collector client and `/count-jobs` route as review-counts.
 * Every candidate with a verdict (ok or a product-level rejection) appends its entry in walk order and is handed
 * to `publish` before the next check starts, so an interrupted walk keeps every completed verdict.
 * The caller's deadline bounds every wait; expiry stops step 2 without a verdict and keeps the journal.
 */
export function createM2LinkCheck(options: { collector: LinkCollector; policy: { mode: string; stars: readonly number[] } | null;
  journalDir: string; deadline: number; now?: () => Date; publish?: (entries: readonly LinkCheckEntry[]) => Promise<void>;
  reuse?: ReadonlyMap<string, LinkCheckEntry> }) {
  const entries: LinkCheckEntry[] = [];
  const clock = () => (options.now?.() ?? new Date()).getTime();
  const checkedAt = () => new Date(clock()).toISOString();
  const verdict = async (pick: Pick<LinkCheckInput, 'productBaseId' | 'url'>, result: 'ok' | 'rejected',
      reason: LinkRejectCode | null, starCounts: StarCounts | null): Promise<LinkCheckDecision> => {
    entries.push({ productBaseId: pick.productBaseId, url: pick.url, stage: 'm2', result, reason, starCounts, checkedAt: checkedAt() });
    if (options.publish) await options.publish(entries);
    return result === 'ok' ? { result: 'ok' as const, starCounts } : { result: 'rejected' as const, reason: reason! };
  };
  const check: LinkCheck = async ({ productBaseId, shopId, itemId, url }) => {
    // A verdict an earlier attempt made on the same basis is published again as is (original checkedAt), with no count job.
    const earlier = options.reuse?.get(productBaseId);
    if (earlier && earlier.url === url) {
      entries.push(earlier);
      if (options.publish) await options.publish(entries);
      return earlier.result === 'ok' ? { result: 'ok' as const, starCounts: earlier.starCounts }
        : { result: 'rejected' as const, reason: earlier.reason! };
    }
    const remaining = options.deadline - clock();
    if (remaining <= 0) throw new LinkCheckStop('LINK_CHECK_FAILED');
    const link: ReviewLink = { shopId, itemId, url };
    let journal: SamplingJournal;
    try {
      journal = await options.collector.run(join(options.journalDir, `${randomUUID()}.json`),
        { kind: 'counts', url, request_key: randomUUID() }, link, null, false, AbortSignal.timeout(remaining));
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

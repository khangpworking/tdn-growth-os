import type { SamplingJobInput } from '../../contracts/foundation/shopee-review-sampling.generated.js';
import type { LinkCollector } from '../../scripts/module-link-check.js';
import { makeReviewCounts, samplingDigest, type ReviewCounts, type ReviewLink } from '../../src/modules/foundation/shopee-review-sampling.js';

const AT = '2026-11-18T03:00:00.000Z';
type StarCounts = Record<'1' | '2' | '3' | '4' | '5', number | null>;
/** `errorCode` ends the job without counts; `stars` overrides individual observed counts (default 3). */
export interface LinkAnswer {
  errorCode?: 'PRODUCT_UNAVAILABLE' | 'RATINGS_MISSING' | 'HUMAN_LOGIN_REQUIRED' | 'HUMAN_VERIFICATION_REQUIRED' | 'SOURCE_ACTION_FAILED';
  stars?: Partial<StarCounts>;
}

const observed = (value: number | null) => value === null
  ? { status: 'missing' as const, value: null }
  : { status: 'observed' as const, value };

function countsFor(link: ReviewLink, stars: Partial<StarCounts>): ReviewCounts {
  return makeReviewCounts(link, {
    stars: Object.fromEntries((['1', '2', '3', '4', '5'] as const).map(star => [star, observed(stars[star] ?? 3)])),
    withComments: observed(5),
  }, AT);
}

/** A count-job stand-in for the step-2 link check: no network, every job terminal on its first poll. */
export function fakeLinkCollector(answer: (url: string) => LinkAnswer = () => ({})) {
  const asked: string[] = [];
  const collector: LinkCollector = {
    run: async (_file, request: SamplingJobInput, link: ReviewLink) => {
      asked.push(link.url);
      const value = answer(link.url), counts = value.errorCode ? null : countsFor(link, value.stars ?? {});
      return { format: 'shopee-sampling-journal-v1', inputSha256: samplingDigest(request), request, intentAt: AT,
        deadline: '2026-11-18T03:02:00.000Z', baselineIds: [], job: null, result: counts,
        resultSha256: counts ? samplingDigest(counts) : null, terminal: true, errorCode: value.errorCode ?? null,
        requestCount: 2, requestCountUncertain: false, cancelIntent: false };
    },
  };
  return { collector, asked };
}

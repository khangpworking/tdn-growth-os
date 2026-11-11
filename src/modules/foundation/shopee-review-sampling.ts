import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/foundation/shopee-review-sampling.schema.json' with { type: 'json' };
import type { ReviewPolicy, ReviewSamplingInput, ShopeeReviewPlan, ReviewCounts, ReviewLink, SamplingResult } from '../../../contracts/foundation/shopee-review-sampling.generated.js';
import { canonicalJson } from './canonical-json.js';

export type { ReviewPolicy, ReviewSamplingInput, ShopeeReviewPlan, ReviewCounts, ReviewLink, SamplingResult };
export class ReviewSamplingError extends Error {
  constructor(readonly code: string) { super(code); }
}
export const samplingDigest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv); ajv.addSchema(schema);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateSampling<T>(definition: string, value: unknown): T {
  let check = validators.get(definition);
  if (!check) { check = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }); validators.set(definition, check); }
  if (!check(value)) throw new ReviewSamplingError('REVIEW_SAMPLING_INVALID');
  return value as T;
}
export function reviewPolicy(input: unknown): ReviewPolicy {
  const value = validateSampling<ReviewSamplingInput>('input', input);
  if (value.mode === 'stars' ? !value.stars.length : value.stars.length !== 0 || value.allocation !== 'pooled')
    throw new ReviewSamplingError('REVIEW_POLICY_INVALID');
  return { format: 'shopee-review-policy-v1', ...value, stars: [...value.stars].sort((a,b) => a-b), textRule: 'comment-or-attributes-v1', order:'native-filter-ascending-stars-v1' };
}
export function validateReviewPolicy(value: unknown): ReviewPolicy {
  const v = validateSampling<ReviewPolicy>('policy', value);
  const normalized = reviewPolicy({ mode:v.mode, stars:v.stars, totalPerLink:v.totalPerLink, allocation:v.allocation });
  if (canonicalJson(v) !== canonicalJson(normalized)) throw new ReviewSamplingError('REVIEW_POLICY_INVALID');
  return v;
}
export function starTargets(policy: ReviewPolicy): ShopeeReviewPlan['targets'] {
  if (policy.allocation !== 'equal-stars') return [];
  const base = Math.floor(policy.totalPerLink / policy.stars.length), remainder = policy.totalPerLink % policy.stars.length;
  return policy.stars.map((star, index) => ({ star, target:base + (index < remainder ? 1 : 0) }));
}
export function validateReviewPlan(value: unknown, expectedDigest?: string): ShopeeReviewPlan {
  const plan = validateSampling<ShopeeReviewPlan>('plan', value);
  validateReviewPolicy(plan.policy);
  if (plan.policySha256 !== samplingDigest(plan.policy) || canonicalJson(plan.targets) !== canonicalJson(starTargets(plan.policy)) ||
      expectedDigest !== undefined && samplingDigest(plan) !== expectedDigest || new Set(plan.links.map(l => l.url)).size !== plan.links.length ||
      plan.links.some(l => l.url !== `https://shopee.vn/product/${l.shopId}/${l.itemId}`))
    throw new ReviewSamplingError('REVIEW_PLAN_CHANGED');
  return plan;
}
export function makeReviewCounts(link: ReviewLink, source: unknown, observedAt: string): ReviewCounts {
  const partial = source !== null && typeof source === 'object' && !Array.isArray(source) ? source as Record<string, unknown> : {};
  const value = { format:'shopee-review-counts-v1', ...link, observedAt, stars:partial.stars, withComments:partial.withComments };
  return validateReviewCounts({ ...value, snapshotDigest:samplingDigest(value) });
}
export function validateReviewCounts(value: unknown): ReviewCounts {
  const counts = validateSampling<ReviewCounts>('counts', value);
  const { snapshotDigest, ...body } = counts;
  if (samplingDigest(body) !== snapshotDigest || counts.url !== `https://shopee.vn/product/${counts.shopId}/${counts.itemId}`)
    throw new ReviewSamplingError('REVIEW_COUNTS_CHANGED');
  return counts;
}
export function validateSamplingResult(value: unknown, plan: ShopeeReviewPlan, planSha256: string, link: ReviewLink, inputSha256: string): SamplingResult {
  const result = validateSampling<SamplingResult>('result', value);
  if (result.planSha256 !== planSha256 || result.policySha256 !== plan.policySha256 || result.inputSha256 !== inputSha256 || canonicalJson(result.link) !== canonicalJson(link))
    throw new ReviewSamplingError('REVIEW_RESULT_CHANGED');
  const policy = plan.policy, ids = new Set<string>();
  if(result.phase==='checkpoint'&&result.complete || result.phase==='terminal'&&result.stopReason==='running')
    throw new ReviewSamplingError('REVIEW_CHECKPOINT_INVALID');
  if (result.rows.length > policy.totalPerLink) throw new ReviewSamplingError('REVIEW_CAP_EXCEEDED');
  for (const row of result.rows) {
    const text = [row.comment ?? '', ...row.attributes].some(v => /[\p{L}\p{N}]/u.test(v));
    if (!row.reviewId || ids.has(row.reviewId) || !text || row.admissionReasons.length || row.shopId !== link.shopId || row.itemId !== link.itemId || row.sourceUrl !== link.url ||
        policy.mode === 'stars' && (row.ratingStar === null || !policy.stars.includes(row.ratingStar)) ||
        !result.pages.some(p => p.page === row.sourcePage && p.ids.includes(row.reviewId!) && p.filter === (policy.mode === 'stars' ? String(row.ratingStar) : policy.mode)))
      throw new ReviewSamplingError('REVIEW_RESULT_INVALID');
    ids.add(row.reviewId);
  }
  for (const target of plan.targets) if (result.rows.filter(r => r.ratingStar === target.star).length > target.target)
    throw new ReviewSamplingError('REVIEW_QUOTA_EXCEEDED');
  const filters = policy.mode === 'stars' ? policy.stars.map(String) : [policy.mode];
  if (result.groups.length !== filters.length || result.groups.some((g,i) => g.filter !== filters[i]) || result.pages.some(p => !filters.includes(p.filter)))
    throw new ReviewSamplingError('REVIEW_RESULT_INVALID');
  if (result.sourceCounts) {
    validateReviewCounts(result.sourceCounts);
    if (result.sourceCounts.url !== link.url) throw new ReviewSamplingError('REVIEW_COUNTS_CHANGED');
  }
  return result;
}

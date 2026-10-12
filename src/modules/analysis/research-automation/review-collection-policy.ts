import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { AutomationReviewCollectionPolicy } from '../../../../contracts/analysis/automation-review-collection-policy.generated.js';
import type { AutomationReviewSample } from '../../../../contracts/analysis/automation-review-sample.generated.js';
import policySchema from '../../../../contracts/analysis/automation-review-collection-policy.schema.json' with { type: 'json' };
import sampleSchema from '../../../../contracts/analysis/automation-review-sample.schema.json' with { type: 'json' };
import { ApifyShopeeCollector, SHOPEE_ACTOR } from '../../../platform/collectors/apify-shopee.js';
import type { VerifiedPrivateShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { projectPrivateShopeeCollection } from '../../foundation/shopee-private-projection.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { registerPrivateReviewSchemas } from './private-review-contracts.js';
import type { PrivateReviewBinding } from './private-review-corpus.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
registerPrivateReviewSchemas(ajv);
const validatePolicy = ajv.compile<AutomationReviewCollectionPolicy>({ $ref: policySchema.$id });
const validateSample = ajv.compile<AutomationReviewSample>({ $ref: sampleSchema.$id });
const hash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

export function reviewCollectionPolicy(value: unknown): AutomationReviewCollectionPolicy {
  if (!validatePolicy(value)) throw new Error('Invalid explicit review collection policy');
  return structuredClone(value);
}

/** Trusted injected production collector, with a fake transport in tests. No caller receipt admits a cap. */
export function assertReviewPolicyCollector(value: unknown, collector: ApifyShopeeCollector): AutomationReviewCollectionPolicy {
  const policy = reviewCollectionPolicy(value);
  if (!(collector instanceof ApifyShopeeCollector) || collector.mode !== 'live' ||
      !equal(collector.privacyProfile, policy.privateSource.profile) ||
      collector.options.maxReviewsPerProduct !== policy.collector.maxReviewsPerProduct ||
      (collector.options.contentFilter ?? 'with comments') !== policy.collector.contentFilter ||
      collector.options.maxChargeUsd !== policy.collector.maxChargeUsd || !collector.options.retainReturnedPages ||
      collector.options.existingRun) throw new Error('Configured review collector differs from frozen policy');
  return policy;
}

/** Every read reauthenticates Foundation bytes and recomputes counts; never consult current configuration. */
export function buildReviewSample(source: VerifiedPrivateShopeeCollection, value: unknown, binding: PrivateReviewBinding): AutomationReviewSample {
  const policy = reviewCollectionPolicy(value), actor = source.packet.actor;
  if (source.request.runKey !== `auto-${binding.runId}` || source.request.source.acquiredAt !== binding.scopeConfirmedAt ||
      hash(source.request) !== source.packet.requestSha256 || source.packet.mode !== 'live' ||
      !equal(source.packet.privacy, policy.privateSource.profile) || actor.actorId !== SHOPEE_ACTOR ||
      actor.settings.maxReviewsPerProduct !== policy.collector.maxReviewsPerProduct ||
      actor.settings.contentFilter !== policy.collector.contentFilter || actor.settings.maxChargeUsd !== policy.collector.maxChargeUsd)
    throw new Error('Retained review source settings or frozen binding differ');
  const projection = projectPrivateShopeeCollection(source);
  const selectedKeys = new Set(source.packet.selected.map(row => `${row.shopId}:${row.itemId}`));
  const products = source.packet.selected.map(listing => {
    const rows = projection.records.filter(row => row.shopId === listing.shopId && row.itemId === listing.itemId);
    if (rows.length > policy.collector.maxReviewsPerProduct) throw new Error('Retained product exceeds frozen capture bound');
    const textReviews = rows.filter(row => row.admission === 'SELECTED_TEXT').length;
    return { listing: { platform: listing.platform, shopId: listing.shopId, itemId: listing.itemId },
      retainedReviews: rows.length, textReviews, targetReviews: policy.targetReviews, hardMaximum: policy.hardMaximum,
      meetsComparisonTextMinimum: textReviews >= policy.comparisonTextMinimum,
      stop: rows.length >= policy.targetReviews ? 'A_FIXED_COUNT' : actor.stopReason === 'dataset_exhausted'
        ? 'PROVIDER_DATASET_EXHAUSTED' : 'CAPTURE_STOPPED_BEFORE_TARGET' };
  });
  const body = { contractVersion: 'automation-review-sample-v1', binding, policySha256: hash(policy),
    collection: { privateVersion: '3.0.0', collectionId: source.packet.collectionId,
      collectionSha256: source.sha256, requestSha256: source.packet.requestSha256 }, products,
    receipt: { runKey: source.request.runKey, actorId: actor.actorId, inputSha256: actor.inputSha256,
      maxReviewsPerProduct: actor.settings.maxReviewsPerProduct, contentFilter: actor.settings.contentFilter,
      maxChargeUsd: actor.settings.maxChargeUsd, usageTotalUsd: actor.usageTotalUsd,
      providerDatasetRows: actor.providerTotalRows, stopReason: actor.stopReason },
    unresolvedOrOtherListingRecords: projection.records.filter(row => !selectedKeys.has(`${row.shopId}:${row.itemId}`)).length,
    coverageAvailable: false, shortage: 'AUTHENTIC_MEASUREMENT_PERIOD_UNAVAILABLE', saturation: policy.saturation,
    limits: ['OWNER_SELECTED_LISTINGS_NOT_REVENUE_COVERAGE', 'PROVIDER_DATASET_EXHAUSTION_NOT_PRODUCT_POPULATION',
      'UNKNOWN_PRODUCT_POPULATION', 'TEXT_MINIMUM_NOT_STATISTICAL_OR_PERSONA_ADMISSION', 'NO_PERSON_VERIFICATION'] };
  const output: unknown = { ...body, sampleId: hash(body) };
  if (!validateSample(output)) throw new Error('Invalid retained review sample');
  return output;
}

export function verifyReviewSample(value: unknown, source: VerifiedPrivateShopeeCollection,
  policy: unknown, binding: PrivateReviewBinding): AutomationReviewSample {
  if (!validateSample(value) || !equal(value, buildReviewSample(source, policy, binding)))
    throw new Error('Retained review sample exact replay differs');
  return value;
}

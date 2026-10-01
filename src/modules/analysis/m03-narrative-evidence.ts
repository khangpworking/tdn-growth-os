import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/m03-narrative-evidence-request.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/m03-narrative-evidence.schema.json' with { type: 'json' };
import type { M03NarrativeEvidenceRequest } from '../../../contracts/analysis/m03-narrative-evidence-request.generated.js';
import type { M03NarrativeEvidence } from '../../../contracts/analysis/m03-narrative-evidence.generated.js';
import type { M03ChartBundle } from '../../../contracts/analysis/m03-chart-bundle.generated.js';
import type { M03VerifiedMetricSet } from '../../../contracts/analysis/m03-verified-metric-set.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { verifyM03ChartBundle } from './m03-chart-bundle.js';
import { verifyM03VerifiedMetricSet } from './m03-section-recipe.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(requestSchema);
const validateRequest = ajv.getSchema<M03NarrativeEvidenceRequest>(requestSchema.$id)!;
const validateResult = ajv.compile<M03NarrativeEvidence>(resultSchema);
type Claim = M03NarrativeEvidence['claims'][number];

export class M03NarrativeEvidenceValidationError extends Error {}
export class M03NarrativeEvidenceIntegrityError extends Error {}

export function verifyM03NarrativeEvidence(
  value: unknown,
  expectedSha256?: string,
  exactMetricSet?: M03VerifiedMetricSet,
  exactChartBundle?: M03ChartBundle,
): M03NarrativeEvidence {
  if (!validateResult(value)) throw new M03NarrativeEvidenceIntegrityError('M03 narrative evidence breaks its contract');
  const result = JSON.parse(canonicalJson(value)) as M03NarrativeEvidence;
  const { envelopeSha256, ...content } = result;
  if (digest(Buffer.from(canonicalJson(content), 'utf8')) !== envelopeSha256 ||
      (expectedSha256 !== undefined && envelopeSha256 !== expectedSha256)) {
    throw new M03NarrativeEvidenceIntegrityError('M03 narrative evidence identity does not match exact content');
  }
  const expectedClaimIds = [
    ...['all', 'wide', 'core'].flatMap(scope => [
      `M03:${scope}:listing_count`, `M03:${scope}:shop_count`,
      `M03:${scope}:observed_revenue`, `M03:${scope}:observed_units`,
    ]),
    'M03:all_to_wide:revenue_membership_delta', 'M03:all_to_wide:units_membership_delta',
    'M03:all_to_core:revenue_membership_delta', 'M03:all_to_core:units_membership_delta',
  ];
  if (result.request.metricSetSha256 !== result.dependencies.metricSetSha256 ||
      result.request.chartBundleSha256 !== result.dependencies.chartBundleSha256 ||
      canonicalJson(result.claims.map(claim => claim.claimId)) !== canonicalJson(expectedClaimIds) ||
      canonicalJson(result.authoringRules) !== canonicalJson([
        'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE',
        'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO',
        'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS',
        'NO_CROSS_PERIOD_COMPARISON',
        'NO_ADDITION_OF_OVERLAPPING_SCOPES',
        'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS',
      ])) {
    throw new M03NarrativeEvidenceIntegrityError('M03 narrative evidence lineage or canonical ordering is inconsistent');
  }
  if (exactMetricSet !== undefined && exactChartBundle !== undefined) {
    const replay = buildM03NarrativeEvidence(result.request, exactMetricSet, exactChartBundle);
    if (canonicalJson(replay) !== canonicalJson(result)) {
      throw new M03NarrativeEvidenceIntegrityError('M03 narrative evidence does not replay from exact dependencies');
    }
  } else if (exactMetricSet !== undefined || exactChartBundle !== undefined) {
    throw new M03NarrativeEvidenceIntegrityError('Both exact M03 dependencies are required for replay');
  }
  return result;
}

export function buildM03NarrativeEvidence(
  untrustedRequest: unknown,
  untrustedMetricSet: unknown,
  untrustedChartBundle: unknown,
): M03NarrativeEvidence {
  if (!validateRequest(untrustedRequest)) {
    throw new M03NarrativeEvidenceValidationError(`Invalid M03 narrative evidence request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  const request = JSON.parse(canonicalJson(untrustedRequest)) as M03NarrativeEvidenceRequest;
  const metricSet = verifyM03VerifiedMetricSet(untrustedMetricSet, request.metricSetSha256);
  const chartBundle = verifyM03ChartBundle(untrustedChartBundle, request.chartBundleSha256, metricSet);
  const claims: Claim[] = [];
  for (const [index, scope] of metricSet.scopes.entries()) {
    claims.push(
      countClaim(scope, index, 'listing_count', 'LISTING_COUNT', 'LISTINGS', scope.listingCount),
      countClaim(scope, index, 'shop_count', 'SHOP_COUNT', 'SHOPS', scope.shopCount),
      totalClaim(scope, index, 'observed_revenue', 'OBSERVED_REVENUE', 'VND', 'revenue', 'm03-observed-revenue-by-scope'),
      totalClaim(scope, index, 'observed_units', 'OBSERVED_UNITS', 'UNITS', 'units', 'm03-observed-units-by-scope'),
    );
  }
  for (const [index, comparison] of metricSet.comparisons.entries()) {
    const context = `all_to_${comparison.to}` as 'all_to_wide' | 'all_to_core';
    claims.push(
      comparisonClaim(comparison, index, context, 'revenue_membership_delta', 'REVENUE_MEMBERSHIP_DELTA', 'VND', 'revenueDelta', ['m03-membership-revenue-sensitivity']),
      comparisonClaim(comparison, index, context, 'units_membership_delta', 'UNITS_MEMBERSHIP_DELTA', 'UNITS', 'unitsDelta', []),
    );
  }
  const content = {
    contractVersion: '1.0.0' as const,
    request,
    section: { sectionId: 'M03' as const, title: 'Quy mô và diễn biến' as const },
    dependencies: {
      preparationSha256: metricSet.preparation.preparationSha256,
      readinessSha256: metricSet.readiness.readinessSha256,
      metricSetSha256: metricSet.metricSetSha256,
      chartBundleSha256: chartBundle.chartBundleSha256,
    },
    claims: claims as M03NarrativeEvidence['claims'],
    authoringRules: [
      'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE',
      'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO',
      'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS',
      'NO_CROSS_PERIOD_COMPARISON',
      'NO_ADDITION_OF_OVERLAPPING_SCOPES',
      'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS',
    ] as M03NarrativeEvidence['authoringRules'],
  };
  const result: M03NarrativeEvidence = {
    ...content,
    envelopeSha256: digest(Buffer.from(canonicalJson(content), 'utf8')),
  };
  if (!validateResult(result)) {
    throw new M03NarrativeEvidenceIntegrityError(`M03 narrative evidence breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
  }
  return verifyM03NarrativeEvidence(result, result.envelopeSha256);
}

function countClaim(
  scope: M03VerifiedMetricSet['scopes'][number],
  index: number,
  suffix: 'listing_count' | 'shop_count',
  metric: 'LISTING_COUNT' | 'SHOP_COUNT',
  unit: 'LISTINGS' | 'SHOPS',
  value: number,
): Claim {
  return {
    claimId: `M03:${scope.key}:${suffix}`,
    statementKind: 'FACT', metric, context: scope.key,
    value: String(value), valueState: 'OBSERVED', unit, coverage: null,
    recordIndices: [...scope.recordIndices], evidencePointer: `/scopes/${index}/${suffix === 'listing_count' ? 'listingCount' : 'shopCount'}`,
    chartIds: [],
  };
}

function totalClaim(
  scope: M03VerifiedMetricSet['scopes'][number],
  index: number,
  suffix: 'observed_revenue' | 'observed_units',
  metric: 'OBSERVED_REVENUE' | 'OBSERVED_UNITS',
  unit: 'VND' | 'UNITS',
  key: 'revenue' | 'units',
  chartId: 'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope',
): Claim {
  const total = scope[key];
  return {
    claimId: `M03:${scope.key}:${suffix}`,
    statementKind: 'FACT', metric, context: scope.key,
    value: total.value, valueState: total.value === null ? 'MISSING' : 'OBSERVED', unit,
    coverage: {
      observedCount: total.observedCount, missingCount: total.missingCount,
      nonExactCount: total.nonExactCount, complete: total.complete,
    },
    recordIndices: [...scope.recordIndices], evidencePointer: `/scopes/${index}/${key}`,
    chartIds: [chartId],
  };
}

function comparisonClaim(
  comparison: M03VerifiedMetricSet['comparisons'][number],
  index: number,
  context: 'all_to_wide' | 'all_to_core',
  suffix: 'revenue_membership_delta' | 'units_membership_delta',
  metric: 'REVENUE_MEMBERSHIP_DELTA' | 'UNITS_MEMBERSHIP_DELTA',
  unit: 'VND' | 'UNITS',
  key: 'revenueDelta' | 'unitsDelta',
  chartIds: Claim['chartIds'],
): Claim {
  const value = comparison[key];
  return {
    claimId: `M03:${context}:${suffix}`,
    statementKind: 'FACT', metric, context,
    value, valueState: value === null ? 'MISSING' : 'OBSERVED', unit, coverage: null,
    recordIndices: [...comparison.removedRecordIndices], evidencePointer: `/comparisons/${index}/${key}`,
    chartIds,
  };
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

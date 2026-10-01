import { createHash } from 'node:crypto';
import type { M03VerifiedMetricSet } from '../../contracts/analysis/m03-verified-metric-set.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

export const syntheticSha = (label: string): string => createHash('sha256').update(label).digest('hex');

export function m03VerifiedMetricSetFixture(): M03VerifiedMetricSet {
  const preparationSha256 = syntheticSha('preparation');
  const readinessSha256 = syntheticSha('readiness');
  const catalogSha256 = syntheticSha('catalog');
  const inputSha256 = syntheticSha('input');
  const content: Omit<M03VerifiedMetricSet, 'metricSetSha256'> = {
    contractVersion: '1.0.0',
    request: {
      contractVersion: '1.0.0', sectionId: 'M03', recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
      preparationSha256, catalogSha256, readinessSha256,
    },
    section: {
      sectionId: 'M03', title: 'Quy mô và diễn biến', methodId: 'metric-scope-packet-totals', methodVersion: '1.0.0',
      recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
    },
    preparation: {
      preparationSha256, normalizedInputArtifactSha256: syntheticSha('input-artifact'), normalizedInputValueSha256: inputSha256,
    },
    readiness: {
      readinessSha256, profile: 'metric-preparation-readiness-v1', catalogId: 'synthetic-catalog',
      catalogVersion: '1.0.0', catalogSha256, state: 'READY_TO_CALCULATE',
    },
    calculation: {
      methodVersion: 'metric-scope-v1', rounding: 'percent-half-even-2-v1',
      verification: 'NORMALIZED_INPUT_ONLY', inputSha256,
    },
    scope: {
      key: 'synthetic', platform: 'shopee', selection: 'ON', start: '2026-01-01', end: '2026-01-31',
      periodBasis: 'Synthetic only', acquiredAt: null,
    },
    labelPolicy: {
      codebookVersion: 'synthetic-v1', wideUnknownPolicy: 'exclude',
      unknownRetention: 'RETAIN_IN_ALL_EXCLUDE_FROM_WIDE',
    },
    sources: [{
      sha256: syntheticSha('source'), label: 'Synthetic', representationRole: 'structured',
      evidenceFamily: 'synthetic', provenanceBasis: 'Test fixture only',
    }],
    scopes: [
      scope('all', [0, 1, 2], null, 2, 1, '12'),
      scope('wide', [0, 1], '0', 2, 0, '10'),
      scope('core', [0], '0', 1, 0, '5'),
    ],
    comparisons: [
      { from: 'all', to: 'wide', revenueDelta: null, unitsDelta: '-2', removedRecordIndices: [2] },
      { from: 'all', to: 'core', revenueDelta: null, unitsDelta: '-7', removedRecordIndices: [1, 2] },
    ],
    limitations: [
      'NORMALIZED_INPUT_ONLY',
      'MISSING_VALUES_ARE_NOT_ZERO',
      'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE',
      'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE',
      'LISTING_IS_NOT_A_UNIQUE_PRODUCT',
      'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION',
    ],
  };
  return { ...content, metricSetSha256: syntheticSha(canonicalJson(content)) };
}

function scope(key: 'all' | 'wide' | 'core', recordIndices: number[], revenue: string | null, observed: number, missing: number, units: string) {
  return {
    key, recordIndices, listingCount: recordIndices.length, shopCount: recordIndices.length,
    revenue: { value: revenue, observedCount: observed, missingCount: missing, nonExactCount: 0, complete: missing === 0 },
    units: { value: units, observedCount: recordIndices.length, missingCount: 0, nonExactCount: 0, complete: true },
    warnings: missing ? ['MISSING_REVENUE' as const] : revenue === '0' ? ['ZERO_REVENUE' as const] : [],
  };
}

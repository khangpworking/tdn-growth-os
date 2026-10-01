import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/m03-chart-bundle-request.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/m03-chart-bundle.schema.json' with { type: 'json' };
import type { M03ChartBundleRequest } from '../../../contracts/analysis/m03-chart-bundle-request.generated.js';
import type { M03ChartBundle, ScopeChart, SensitivityChart } from '../../../contracts/analysis/m03-chart-bundle.generated.js';
import type { M03VerifiedMetricSet } from '../../../contracts/analysis/m03-verified-metric-set.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { verifyM03VerifiedMetricSet } from './m03-section-recipe.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(requestSchema);
const validateRequest = ajv.getSchema<M03ChartBundleRequest>(requestSchema.$id)!;
const validateResult = ajv.compile<M03ChartBundle>(resultSchema);

export class M03ChartBundleValidationError extends Error {}
export class M03ChartBundleIntegrityError extends Error {}

export function verifyM03ChartBundle(
  value: unknown,
  expectedSha256?: string,
  exactMetricSet?: M03VerifiedMetricSet,
): M03ChartBundle {
  if (!validateResult(value)) throw new M03ChartBundleIntegrityError('M03 chart bundle breaks its contract');
  const result = JSON.parse(canonicalJson(value)) as M03ChartBundle;
  const { chartBundleSha256, ...content } = result;
  if (digest(Buffer.from(canonicalJson(content), 'utf8')) !== chartBundleSha256 ||
      (expectedSha256 !== undefined && chartBundleSha256 !== expectedSha256)) {
    throw new M03ChartBundleIntegrityError('M03 chart bundle identity does not match exact content');
  }
  if (result.request.metricSetSha256 !== result.metricSet.metricSetSha256 ||
      canonicalJson(result.charts.map(chart => chart.chartId)) !== canonicalJson([
        'm03-observed-revenue-by-scope',
        'm03-observed-units-by-scope',
        'm03-membership-revenue-sensitivity',
      ]) || canonicalJson(result.limitations) !== canonicalJson([
        'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO',
        'SCOPES_OVERLAP_AND_MUST_NOT_BE_STACKED_OR_SUMMED',
        'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH',
      ])) {
    throw new M03ChartBundleIntegrityError('M03 chart bundle lineage or canonical ordering is inconsistent');
  }
  if (exactMetricSet !== undefined) {
    const verifiedMetricSet = verifyM03VerifiedMetricSet(exactMetricSet, result.metricSet.metricSetSha256);
    const replay = buildM03ChartBundle(result.request, verifiedMetricSet);
    if (canonicalJson(replay) !== canonicalJson(result)) {
      throw new M03ChartBundleIntegrityError('M03 chart bundle does not replay from the exact metric set');
    }
  }
  return result;
}

export function buildM03ChartBundle(untrustedRequest: unknown, untrustedMetricSet: unknown): M03ChartBundle {
  if (!validateRequest(untrustedRequest)) {
    throw new M03ChartBundleValidationError(`Invalid M03 chart request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  const request = JSON.parse(canonicalJson(untrustedRequest)) as M03ChartBundleRequest;
  const metricSet = verifyM03VerifiedMetricSet(untrustedMetricSet, request.metricSetSha256);
  const revenue = scopeChart(metricSet, 'revenue');
  const units = scopeChart(metricSet, 'units');
  const content = {
    contractVersion: '1.0.0' as const,
    request,
    section: { sectionId: 'M03' as const, title: 'Quy mô và diễn biến' as const },
    metricSet: {
      metricSetSha256: metricSet.metricSetSha256,
      preparationSha256: metricSet.preparation.preparationSha256,
      readinessSha256: metricSet.readiness.readinessSha256,
      methodVersion: metricSet.calculation.methodVersion,
      rounding: metricSet.calculation.rounding,
    },
    charts: [
      {
        chartId: 'm03-observed-revenue-by-scope' as const, kind: 'BAR' as const,
        title: 'Doanh thu quan sát theo phạm vi', measure: 'OBSERVED_REVENUE' as const,
        unit: 'VND' as const, points: revenue as ScopeChart['points'],
      },
      {
        chartId: 'm03-observed-units-by-scope' as const, kind: 'BAR' as const,
        title: 'Sản lượng quan sát theo phạm vi', measure: 'OBSERVED_UNITS' as const,
        unit: 'UNITS' as const, points: units as ScopeChart['points'],
      },
      {
        chartId: 'm03-membership-revenue-sensitivity' as const, kind: 'DIVERGING_BAR' as const,
        title: 'Độ nhạy doanh thu quan sát theo membership' as const,
        measure: 'REVENUE_DELTA_FROM_ALL' as const, unit: 'VND' as const,
        points: metricSet.comparisons.map(comparison => ({
          to: comparison.to,
          value: comparison.revenueDelta,
          removedRecordIndices: [...comparison.removedRecordIndices],
        })) as SensitivityChart['points'],
      },
    ] as M03ChartBundle['charts'],
    limitations: [
      'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO',
      'SCOPES_OVERLAP_AND_MUST_NOT_BE_STACKED_OR_SUMMED',
      'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH',
    ] as M03ChartBundle['limitations'],
  };
  const result: M03ChartBundle = {
    ...content,
    chartBundleSha256: digest(Buffer.from(canonicalJson(content), 'utf8')),
  };
  if (!validateResult(result)) {
    throw new M03ChartBundleIntegrityError(`M03 chart bundle breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
  }
  return verifyM03ChartBundle(result, result.chartBundleSha256);
}

function scopeChart(metricSet: M03VerifiedMetricSet, measure: 'revenue' | 'units') {
  return metricSet.scopes.map(scope => ({
    scope: scope.key,
    value: scope[measure].value,
    observedCount: scope[measure].observedCount,
    missingCount: scope[measure].missingCount,
    nonExactCount: scope[measure].nonExactCount,
    complete: scope[measure].complete,
    recordIndices: [...scope.recordIndices],
  }));
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/m03-section-recipe-request.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/m03-verified-metric-set.schema.json' with { type: 'json' };
import type { M03SectionRecipeRequest } from '../../../contracts/analysis/m03-section-recipe-request.generated.js';
import type { M03VerifiedMetricSet } from '../../../contracts/analysis/m03-verified-metric-set.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { calculateMetricScopes } from './metric-scope-calculator.js';
import type { MetricInputPreparationReader } from './metric-input-preparation-service.js';
import { MetricPreparationReadinessService } from './metric-preparation-readiness.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(requestSchema);
const validateRequest = ajv.getSchema<M03SectionRecipeRequest>(requestSchema.$id)!;
const validateResult = ajv.compile<M03VerifiedMetricSet>(resultSchema);

export class M03SectionRecipeValidationError extends Error {}
export class M03SectionRecipeIntegrityError extends Error {}

export function verifyM03VerifiedMetricSet(value: unknown, expectedSha256?: string): M03VerifiedMetricSet {
  if (!validateResult(value)) throw new M03SectionRecipeIntegrityError('M03 metric set breaks its contract');
  const result = JSON.parse(canonicalJson(value)) as M03VerifiedMetricSet;
  const { metricSetSha256, ...content } = result;
  if (digest(Buffer.from(canonicalJson(content), 'utf8')) !== metricSetSha256 ||
      (expectedSha256 !== undefined && metricSetSha256 !== expectedSha256)) {
    throw new M03SectionRecipeIntegrityError('M03 metric set identity does not match exact content');
  }
  if (result.request.preparationSha256 !== result.preparation.preparationSha256 ||
      result.request.readinessSha256 !== result.readiness.readinessSha256 ||
      result.request.catalogSha256 !== result.readiness.catalogSha256 ||
      result.preparation.normalizedInputValueSha256 !== result.calculation.inputSha256 ||
      canonicalJson(result.scopes.map(scope => scope.key)) !== canonicalJson(['all', 'wide', 'core']) ||
      canonicalJson(result.comparisons.map(comparison => comparison.to)) !== canonicalJson(['wide', 'core']) ||
      canonicalJson(result.limitations) !== canonicalJson([
        'NORMALIZED_INPUT_ONLY',
        'MISSING_VALUES_ARE_NOT_ZERO',
        'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE',
        'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE',
        'LISTING_IS_NOT_A_UNIQUE_PRODUCT',
        'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION',
      ])) {
    throw new M03SectionRecipeIntegrityError('M03 metric set lineage or canonical ordering is inconsistent');
  }
  return result;
}

/**
 * Closed M03 calculation recipe. Chart and narrative consumers must bind to the
 * returned metricSetSha256 instead of recalculating or asking a model for numbers.
 */
export class M03SectionRecipeService {
  readonly #readiness: MetricPreparationReadinessService;

  constructor(private readonly preparations: MetricInputPreparationReader) {
    this.#readiness = new MetricPreparationReadinessService(preparations);
  }

  async calculate(
    untrustedRequest: unknown,
    catalogBytes: Buffer,
  ): Promise<M03VerifiedMetricSet> {
    const request = requestSnapshot(untrustedRequest);
    const readiness = await this.#readiness.evaluate(
      request.preparationSha256,
      catalogBytes,
      request.catalogSha256,
    );
    if (readiness.readinessSha256 !== request.readinessSha256) {
      throw new M03SectionRecipeIntegrityError('Readiness identity does not match exact preparation and catalog');
    }
    const section = readiness.sections.find(candidate => candidate.sectionId === 'M03');
    if (!section || section.state !== 'READY_TO_CALCULATE') {
      throw new M03SectionRecipeValidationError('M03 is not ready to calculate');
    }
    if (section.title !== 'Quy mô và diễn biến' || section.methodId !== 'metric-scope-packet-totals' || section.methodVersion !== '1.0.0') {
      throw new M03SectionRecipeIntegrityError('M03 catalog method is not the approved recipe dependency');
    }

    const preparation = await this.preparations.readVerified(request.preparationSha256);
    if (preparation.result.preparationSha256 !== request.preparationSha256) {
      throw new M03SectionRecipeIntegrityError('Preparation reader returned a different identity');
    }
    if (preparation.input.wideUnknownPolicy !== 'exclude') {
      throw new M03SectionRecipeValidationError('M03 v1 requires UNKNOWN retained in ALL and excluded from WIDE');
    }
    const calculated = calculateMetricScopes(preparation.input);
    if (calculated.inputSha256 !== preparation.result.normalizedInput.valueSha256) {
      throw new M03SectionRecipeIntegrityError('Calculation input does not match prepared normalized value');
    }
    if (calculated.labelIssues.length || calculated.scopes.some(scope => scope.status !== 'CALCULATED')) {
      throw new M03SectionRecipeIntegrityError('Readiness and calculation disagree about frozen labels');
    }
    const [all, wide, core] = calculated.scopes;
    const [wideComparison, coreComparison] = calculated.comparisons;
    if (!all || !wide || !core || all.key !== 'all' || wide.key !== 'wide' || core.key !== 'core' ||
        !wideComparison || !coreComparison || wideComparison.to !== 'wide' || coreComparison.to !== 'core') {
      throw new M03SectionRecipeIntegrityError('Calculator returned noncanonical M03 scope order');
    }

    const content = {
      contractVersion: '1.0.0' as const,
      request,
      section: {
        sectionId: 'M03' as const, title: 'Quy mô và diễn biến' as const,
        methodId: 'metric-scope-packet-totals' as const, methodVersion: '1.0.0' as const,
        recipeId: 'm03-scope-totals' as const, recipeVersion: '1.0.0' as const,
      },
      preparation: {
        preparationSha256: preparation.result.preparationSha256,
        normalizedInputArtifactSha256: preparation.result.normalizedInput.artifactSha256,
        normalizedInputValueSha256: preparation.result.normalizedInput.valueSha256,
      },
      readiness: {
        readinessSha256: readiness.readinessSha256,
        profile: 'metric-preparation-readiness-v1' as const,
        catalogId: readiness.catalog.catalogId,
        catalogVersion: readiness.catalog.catalogVersion,
        catalogSha256: readiness.catalog.sha256,
        state: 'READY_TO_CALCULATE' as const,
      },
      calculation: {
        methodVersion: calculated.methodVersion,
        rounding: calculated.rounding,
        verification: calculated.verification,
        inputSha256: calculated.inputSha256,
      },
      scope: structuredClone(preparation.input.scope),
      labelPolicy: {
        codebookVersion: preparation.input.labelCodebookVersion,
        wideUnknownPolicy: 'exclude' as const,
        unknownRetention: 'RETAIN_IN_ALL_EXCLUDE_FROM_WIDE' as const,
      },
      sources: structuredClone(preparation.input.sources) as M03VerifiedMetricSet['sources'],
      scopes: [scopeSummary(all), scopeSummary(wide), scopeSummary(core)] as M03VerifiedMetricSet['scopes'],
      comparisons: [comparisonSummary(wideComparison), comparisonSummary(coreComparison)] as M03VerifiedMetricSet['comparisons'],
      limitations: [
        'NORMALIZED_INPUT_ONLY',
        'MISSING_VALUES_ARE_NOT_ZERO',
        'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE',
        'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE',
        'LISTING_IS_NOT_A_UNIQUE_PRODUCT',
        'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION',
      ] as M03VerifiedMetricSet['limitations'],
    };
    const result: M03VerifiedMetricSet = {
      ...content,
      metricSetSha256: digest(Buffer.from(canonicalJson(content), 'utf8')),
    };
    if (!validateResult(result)) {
      throw new M03SectionRecipeIntegrityError(`M03 metric set breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
    }
    return verifyM03VerifiedMetricSet(result, result.metricSetSha256);
  }
}

function requestSnapshot(value: unknown): M03SectionRecipeRequest {
  if (!validateRequest(value)) {
    throw new M03SectionRecipeValidationError(`Invalid M03 recipe request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  return JSON.parse(canonicalJson(value)) as M03SectionRecipeRequest;
}

function scopeSummary(scope: ReturnType<typeof calculateMetricScopes>['scopes'][number]) {
  return {
    key: scope.key,
    recordIndices: [...scope.recordIndices],
    listingCount: scope.listingCount,
    shopCount: scope.shopCount,
    revenue: structuredClone(scope.revenue),
    units: structuredClone(scope.units),
    warnings: [...scope.warnings],
  };
}

function comparisonSummary(comparison: ReturnType<typeof calculateMetricScopes>['comparisons'][number]) {
  return {
    from: comparison.from,
    to: comparison.to,
    revenueDelta: comparison.revenueDelta,
    unitsDelta: comparison.unitsDelta,
    removedRecordIndices: [...comparison.removedRecordIndices],
  };
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import catalogSchema from '../../../contracts/analysis/report-section-catalog.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/metric-preparation-readiness-result.schema.json' with { type: 'json' };
import type { ReportSectionCatalog } from '../../../contracts/analysis/report-section-catalog.generated.js';
import type { MetricPreparationReadinessResult } from '../../../contracts/analysis/metric-preparation-readiness-result.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { metricLabelFingerprint } from './metric-scope-calculator.js';
import type { MetricInputPreparationReader, VerifiedMetricInputPreparation } from './metric-input-preparation-service.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateCatalog = ajv.compile<ReportSectionCatalog>(catalogSchema);
const validateResult = ajv.compile<MetricPreparationReadinessResult>(resultSchema);
const MAX_CATALOG_BYTES = 1024 * 1024;
const optionalInputs = new Set(['optional-owner-declared-tablet-count']);

type InputCheck = MetricPreparationReadinessResult['inputs'][number];
type EvidenceRef = InputCheck['evidenceRefs'][number];
type SectionReadiness = MetricPreparationReadinessResult['sections'][number];

export class MetricPreparationReadinessValidationError extends Error {}
export class MetricPreparationReadinessIntegrityError extends Error {}

export class MetricPreparationReadinessService {
  constructor(private readonly preparations: MetricInputPreparationReader) {}

  async evaluate(
    preparationSha256: string,
    catalogBytes: Buffer,
    catalogSha256: string,
  ): Promise<MetricPreparationReadinessResult> {
    assertDigest(preparationSha256, 'preparationSha256');
    assertDigest(catalogSha256, 'catalogSha256');
    if (catalogBytes.byteLength > MAX_CATALOG_BYTES || digest(catalogBytes) !== catalogSha256) {
      throw new MetricPreparationReadinessValidationError('Catalog size or digest does not match');
    }
    let catalogValue: unknown;
    try { catalogValue = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(catalogBytes)); }
    catch { throw new MetricPreparationReadinessValidationError('Catalog is not valid UTF-8 JSON'); }
    if (!validateCatalog(catalogValue)) {
      throw new MetricPreparationReadinessValidationError(`Catalog breaks its contract: ${ajv.errorsText(validateCatalog.errors)}`);
    }
    const catalog = JSON.parse(canonicalJson(catalogValue)) as ReportSectionCatalog;
    if (new Set(catalog.sections.map(section => section.sectionId)).size !== catalog.sections.length) {
      throw new MetricPreparationReadinessValidationError('Catalog contains duplicate section IDs');
    }
    const preparation = await this.preparations.readVerified(preparationSha256);
    if (preparation.result.preparationSha256 !== preparationSha256) {
      throw new MetricPreparationReadinessIntegrityError('Preparation reader returned a different identity');
    }
    const inputIds = [...new Set(catalog.sections.flatMap(section => section.requiredInputs))];
    const inputs = inputIds.map(inputId => evaluateInput(inputId, preparation));
    const byInput = new Map(inputs.map(check => [check.inputId, check]));
    const sectionList = catalog.sections.map(section => {
      const checks = section.requiredInputs.map(inputId => byInput.get(inputId)!);
      const state = checks.some(check => check.state === 'INVALID')
        ? 'INVALID' as const
        : checks.some(check => check.blocking)
          ? 'BLOCKED' as const
          : 'READY_TO_CALCULATE' as const;
      return {
        sectionId: section.sectionId,
        title: section.title,
        methodId: section.methodId,
        methodVersion: section.methodVersion,
        state,
        requiredInputs: [...section.requiredInputs] as SectionReadiness['requiredInputs'],
        blockingCodes: [...new Set(checks.filter(check => check.blocking).flatMap(check => check.codes))],
      };
    });
    const firstSection = sectionList[0];
    if (firstSection === undefined) throw new MetricPreparationReadinessIntegrityError('Catalog contains no sections');
    const sections: MetricPreparationReadinessResult['sections'] = [firstSection, ...sectionList.slice(1)];
    const summary = {
      totalSections: sections.length,
      readyToCalculate: sections.filter(section => section.state === 'READY_TO_CALCULATE').length,
      blocked: sections.filter(section => section.state === 'BLOCKED').length,
      invalid: sections.filter(section => section.state === 'INVALID').length,
    };
    const content = {
      contractVersion: '1.0.0' as const,
      readinessProfile: 'metric-preparation-readiness-v1' as const,
      preparationSha256,
      catalog: { catalogId: catalog.catalogId, catalogVersion: catalog.catalogVersion, sha256: catalogSha256 },
      inputs,
      sections,
      summary,
    };
    const result: MetricPreparationReadinessResult = {
      ...content,
      readinessSha256: digest(Buffer.from(canonicalJson(content), 'utf8')),
    };
    if (!validateResult(result)) {
      throw new MetricPreparationReadinessIntegrityError(`Readiness result breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
    }
    return JSON.parse(canonicalJson(result)) as MetricPreparationReadinessResult;
  }
}

function evaluateInput(inputId: string, preparation: VerifiedMetricInputPreparation): InputCheck {
  const { result, input } = preparation;
  const ref = (kind: EvidenceRef['kind'], locator: string, sha256: string): EvidenceRef => ({ kind, locator, sha256 });
  const check = (
    state: InputCheck['state'],
    codes: readonly [string, ...string[]],
    evidenceRefs: readonly EvidenceRef[] = [],
  ): InputCheck => ({
    inputId,
    state,
    blocking: state !== 'PRESENT' && !optionalInputs.has(inputId),
    codes: [...codes] as InputCheck['codes'],
    evidenceRefs: [...evidenceRefs] as InputCheck['evidenceRefs'],
  });
  const preparationRef = ref('PREPARATION_RESULT', `/analysis_metric_input_preparations/${result.preparationSha256}`, result.preparationSha256);
  const inputRef = ref('NORMALIZED_INPUT', '/normalizedInput', result.normalizedInput.artifactSha256);
  const receiptRef = ref('NORMALIZATION_RECEIPT', '/normalizationReceipt', result.normalizationReceiptSha256);
  const packageRef = ref('SOURCE_PACKAGE', `/sourcePackage/${result.sourcePackage.packageId}`, result.sourcePackage.manifestArtifactSha256);
  const source = (role: 'workbook' | 'manifest' | 'labels') => {
    const selected = result.selectedSources[role];
    return selected === null ? null : ref('SELECTED_SOURCE', `/selectedSources/${role}`, selected.sha256);
  };

  switch (inputId) {
    case 'source-manifest': return check('PRESENT', ['EXACT_METRIC_SOURCE_MANIFEST_BOUND'], [source('manifest')!]);
    case 'source-package-manifest': return check('PRESENT', ['EXACT_SOURCE_PACKAGE_MANIFEST_BOUND'], [packageRef]);
    case 'normalized-metric-rows': return check('PRESENT', ['QUERYABLE_NORMALIZED_ROWS_REPLAYED'], [inputRef, preparationRef]);
    case 'normalization-receipt': return check('PRESENT', ['NORMALIZATION_RECEIPT_BOUND'], [receiptRef]);
    case 'scope':
    case 'source-scope': return check('PRESENT', ['EXACT_NORMALIZED_SCOPE_BOUND'], [inputRef]);
    case 'exact-source-package-lineage': return check('PRESENT', ['EXACT_SOURCE_PACKAGE_LINEAGE_REPLAYED'], [packageRef, preparationRef]);
    case 'verified-locators':
      return input.records.length === 0
        ? check('ABSENT', ['NO_NORMALIZED_OBSERVATION_LOCATORS'], [inputRef])
        : check('PRESENT', ['NORMALIZED_SOURCE_LOCATORS_REPLAYED'], [inputRef, source('workbook')!]);
    case 'frozen-label-decisions': {
      const labelRef = source('labels');
      if (labelRef === null || input.records.length === 0) return check('ABSENT', ['LABEL_DECISIONS_NOT_BOUND'], [inputRef]);
      const invalid = input.records.some(row => row.label === null || row.label.methodVersion !== input.labelCodebookVersion ||
        row.label.contentSha256 !== metricLabelFingerprint(input.scope.platform, row));
      return invalid
        ? check('INVALID', ['LABEL_DECISIONS_DO_NOT_COVER_REQUIRED_SCOPE'], [labelRef, inputRef])
        : check('PRESENT', ['FROZEN_LABEL_DECISIONS_REPLAYED'], [labelRef, inputRef]);
    }

  const absentCodes: Readonly<Record<string, string>> = {
    'metric-result': 'METRIC_RESULT_NOT_CALCULATED',
    'validated-metrics': 'VALIDATED_METRICS_NOT_CALCULATED',
    'source-bound-claims': 'SOURCE_BOUND_CLAIMS_NOT_CREATED',
    'owner-question': 'OWNER_BUSINESS_QUESTION_NOT_RECORDED',
    'owner-review': 'OWNER_REVIEW_NOT_RECORDED',
    'domain-specific-evidence': 'DOMAIN_EVIDENCE_NOT_BOUND',
    'case-locators': 'CONSUMER_CASE_LOCATORS_NOT_BOUND',
    'adjudication-provenance': 'CONSUMER_CASE_ADJUDICATION_NOT_BOUND',
    'comparable-groups': 'COMPARABLE_GROUPS_NOT_BOUND',
    denominators: 'COMPARABLE_GROUP_DENOMINATORS_NOT_BOUND',
    'compatible-daily-series': 'COMPATIBLE_DAILY_SERIES_NOT_BOUND',
    'held-out-horizon': 'HELD_OUT_HORIZON_NOT_BOUND',
    'existing-relevant-outcomes': 'RELEVANT_OUTCOMES_NOT_BOUND',
    'measurement-design': 'MEASUREMENT_DESIGN_NOT_BOUND',
    'exact-raw-quote-source-and-locator': 'EXACT_TABLET_QUOTE_SOURCE_NOT_BOUND',
    'canonical-tablet-quote-input': 'CANONICAL_TABLET_QUOTE_INPUT_NOT_BOUND',
    'explicit-price-state-and-observation-time': 'PRICE_STATE_AND_OBSERVATION_TIME_NOT_BOUND',
    'optional-owner-declared-tablet-count': 'OWNER_DECLARED_TABLET_COUNT_NOT_RECORDED',
    'verified-locators-and-denominators': 'VERIFIED_METHOD_CONTEXT_NOT_BOUND',
    'resolved-fact-claim-pointers': 'RESOLVED_FACT_POINTERS_NOT_BOUND',
    'verified-method-artifacts': 'VERIFIED_METHOD_ARTIFACTS_NOT_CREATED',
  };
  const code = absentCodes[inputId];
  if (code === undefined) throw new MetricPreparationReadinessValidationError(`Unknown catalog input ID: ${inputId}`);
  return check('ABSENT', [code]);
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDigest(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new MetricPreparationReadinessValidationError(`${label} is not a SHA-256 digest`);
}

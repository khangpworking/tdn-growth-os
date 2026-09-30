import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/i03-research-method.schema.json' with { type: 'json' };
import type { I03ResearchMethod } from '../../../contracts/analysis/i03-research-method.generated.js';
import type { M02ScopeMethod } from '../../../contracts/analysis/m02-scope-method.generated.js';
import type { M13ProvenanceAppendix } from '../../../contracts/analysis/m13-provenance-appendix.generated.js';
import type { MetricScopeOutput } from '../../../contracts/analysis/metric-scope-output.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { normalizeMetricWorkbook } from './metric-source-profile.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<I03ResearchMethod>(schema);
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const bytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

type Receipt = ReturnType<typeof normalizeMetricWorkbook>['receipt'];

export interface I03ResearchMethodInputs {
  readonly m02: { readonly output: M02ScopeMethod; readonly bytes: Buffer };
  readonly m13: { readonly output: M13ProvenanceAppendix; readonly bytes: Buffer };
  readonly receipt: Receipt;
  readonly receiptBytes: Buffer;
  readonly result: MetricScopeOutput;
  readonly resultBytes: Buffer;
  readonly normalizedInputSha256: string;
}

/** Materializes research-method facts only; it creates no finding, insight, recommendation or approval. */
export function buildI03ResearchMethod(input: I03ResearchMethodInputs): { readonly output: I03ResearchMethod; readonly bytes: Buffer } {
  const { m02, m13, receipt, result } = input;
  if (!m02.bytes.equals(bytes(m02.output)) || !m13.bytes.equals(bytes(m13.output)) ||
      !input.receiptBytes.equals(bytes(receipt)) || !input.resultBytes.equals(bytes(result))) {
    throw new TypeError('I03: CANONICAL_INPUT_BYTES_MISMATCH');
  }
  const receiptSha256 = sha256(input.receiptBytes);
  const resultSha256 = sha256(input.resultBytes);
  if (m13.output.lineage.normalizedInputSha256 !== input.normalizedInputSha256 ||
      m13.output.lineage.normalizationReceiptSha256 !== receiptSha256 ||
      m13.output.lineage.metricResultSha256 !== resultSha256 ||
      receipt.inputSha256 !== result.inputSha256 || receipt.profileId !== result.input.profileId ||
      canonicalJson(m02.output.scope) !== canonicalJson({ ...result.input.scope, currency: 'VND' })) {
    throw new TypeError('I03: LINEAGE_OR_SCOPE_MISMATCH');
  }
  if (m02.output.measurement.recordCount !== result.input.records.length ||
      m13.output.coverage.recordCount !== result.input.records.length ||
      m13.output.recordLineage.length !== result.input.records.length ||
      receipt.evidence.length !== result.input.records.length) {
    throw new TypeError('I03: COVERAGE_DENOMINATOR_MISMATCH');
  }
  const sourceInventory = m13.output.sources.map((source, index) => ({
    ...source,
    m13SourcePointer: `/sources/${index}`,
  }));
  const denominatorRecordCount = result.input.records.length;
  const allScope = result.scopes.find(scope => scope.key === 'all');
  if (!allScope) throw new TypeError('I03: ALL_SCOPE_REQUIRED');
  const payload = {
    contractVersion: '1.0.0',
    sectionId: 'I03',
    sectionTitle: 'Phương pháp nghiên cứu',
    methodId: 'metric-research-method-account',
    methodVersion: '2.0.0',
    deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
    approvalState: 'UNREVIEWED',
    sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED_NOT_PROVIDER_AUTHENTICATED',
    sourcePackage: m13.output.sourcePackage,
    lineage: {
      m02MethodOutputId: m02.output.methodOutputId,
      m02ArtifactSha256: sha256(m02.bytes),
      m13MethodOutputId: m13.output.methodOutputId,
      m13ArtifactSha256: sha256(m13.bytes),
      normalizedInputSha256: input.normalizedInputSha256,
      normalizationReceiptSha256: receiptSha256,
      metricResultSha256: resultSha256,
    },
    normalization: {
      profileId: receipt.profileId,
      profileVersion: receipt.profileVersion,
      verification: receipt.verification,
      rowDigestMethod: receipt.rowDigestMethod,
      numericDisplay: receipt.numericDisplay,
      inputSha256: receipt.inputSha256,
      provenance: receipt.provenance,
    },
    measurementFrame: {
      scopeKey: result.input.scope.key,
      platform: result.input.scope.platform,
      selection: result.input.scope.selection,
      start: result.input.scope.start,
      end: result.input.scope.end,
      periodBasis: result.input.scope.periodBasis,
      acquiredAt: result.input.scope.acquiredAt,
      currency: 'VND',
      wideUnknownPolicy: result.input.wideUnknownPolicy,
      membershipPolicy: 'ALL_ALL_ROWS; WIDE_EXCLUDES_OUTSIDE_AND_FOLLOWS_UNKNOWN_POLICY; CORE_CORE_CANDIDATE_ONLY',
      overlapPolicy: 'ALL_WIDE_CORE_ARE_NESTED_NON_ADDITIVE_SCOPES',
    },
    sourceInventory,
    coverage: {
      denominatorRecordCount,
      selectedSourceCount: sourceInventory.length,
      mappedRecordCount: receipt.evidence.length,
      recordLocatorCount: m13.output.coverage.recordLocatorCount,
      revenueLocatorCount: m13.output.coverage.revenueLocatorCount,
      unitsLocatorCount: m13.output.coverage.unitsLocatorCount,
      labelDenominatorCount: denominatorRecordCount,
      labelLocatorCount: m13.output.coverage.labelLocatorCount,
      labeledRecordCount: m02.output.measurement.labels.labeled,
      unlabeledRecordCount: m02.output.measurement.labels.unlabeled,
      unknownLabelCount: m02.output.measurement.labels.unknown,
      outsideLabelCount: m02.output.measurement.labels.outside,
      revenueMissingCount: m02.output.measurement.revenue.missing,
      revenueObservedZeroCount: m02.output.measurement.revenue.observedZero,
      revenueNonExactCount: allScope.revenue.nonExactCount,
      unitsMissingCount: m02.output.measurement.units.missing,
      unitsObservedZeroCount: m02.output.measurement.units.observedZero,
      unitsNonExactCount: allScope.units.nonExactCount,
      locatorLedgerPointer: 'm13-provenance-appendix.json#/recordLineage',
    },
    scopeMembership: result.scopes.map(scope => ({
      scope: scope.key,
      status: scope.status,
      memberCount: scope.listingCount,
      denominatorRecordCount,
      warningCodes: [...scope.warnings],
    })),
    limitations: [
      'PACKAGE_BYTE_AND_LOCATOR_INTEGRITY_DO_NOT_AUTHENTICATE_PROVIDER_OR_EVIDENCE_TRUTH',
      'OBSERVED_EXPORT_SCOPE_IS_NOT_MARKET_COVERAGE_OR_A_COMPLETE_UNIVERSE',
      'SOURCE_REPRESENTATIVENESS_AND_PERIOD_TRUTH_ARE_NOT_ESTABLISHED',
      'LABEL_RECEIPT_DOES_NOT_ESTABLISH_LABEL_CORRECTNESS',
      'UNKNOWN_REMAINS_DISTINCT_FROM_OUTSIDE_AND_FOLLOWS_THE_FROZEN_WIDE_POLICY',
      'ALL_WIDE_CORE_ARE_NESTED_NON_ADDITIVE_SCOPES',
      'NO_MARKET_CONCLUSION_INSIGHT_RECOMMENDATION_CAUSALITY_EFFECTIVENESS_OR_APPROVAL',
    ],
    reopenConditions: [
      'SOURCE_PACKAGE_OR_SELECTED_SOURCE_MEMBERSHIP_CHANGES',
      'MEASUREMENT_FRAME_PERIOD_OR_SELECTION_POLICY_CHANGES',
      'NORMALIZATION_PROFILE_LABEL_CODEBOOK_OR_WIDE_UNKNOWN_POLICY_CHANGES',
      'REPLAY_DIGEST_LOCATOR_OR_COVERAGE_VERIFICATION_FAILS',
    ],
  } as const;
  const candidate: unknown = { ...payload, methodOutputId: sha256(canonicalJson(payload)) };
  if (!validate(candidate)) throw new TypeError(`I03: INVALID_OUTPUT ${ajv.errorsText(validate.errors)}`);
  const output: I03ResearchMethod = candidate;
  return { output, bytes: bytes(output) };
}

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/m13-provenance-appendix.schema.json' with { type: 'json' };
import type { M13ProvenanceAppendix } from '../../../contracts/analysis/m13-provenance-appendix.generated.js';
import type { MetricScopeInput } from '../../../contracts/analysis/metric-scope-input.generated.js';
import type { SourcePackageManifest } from '../../../contracts/foundation/source-package-manifest.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedRawByteMapping, SourceBackedSourceProvenance } from './source-backed-report.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<M13ProvenanceAppendix>(schema);
const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

export interface M13LineageDigests {
  readonly normalizedInputSha256: string;
  readonly normalizationReceiptSha256: string;
  readonly metricResultSha256: string;
}

function assertDigest(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`M13: INVALID_${label}_DIGEST`);
}

/** Exact source-to-record appendix. It does not authenticate a provider or create an interpretation. */
export function buildM13ProvenanceAppendix(
  input: MetricScopeInput,
  sourcePackage: SourcePackageManifest,
  manifestArtifactSha256: string,
  selectedSources: readonly SourceBackedSourceProvenance[],
  rawByteMappings: readonly SourceBackedRawByteMapping[],
  lineage: M13LineageDigests,
): { readonly output: M13ProvenanceAppendix; readonly bytes: Buffer } {
  assertDigest(manifestArtifactSha256, 'MANIFEST_ARTIFACT');
  for (const [key, value] of Object.entries(lineage)) assertDigest(value, key.toUpperCase());
  if (selectedSources.length < 2 || selectedSources.length > 3 || selectedSources.length !== rawByteMappings.length) {
    throw new TypeError('M13: SOURCE_MEMBERSHIP_MISMATCH');
  }
  const selectedDigests = new Set<string>();
  const sources = selectedSources.map((source, index) => {
    const mapping = rawByteMappings[index];
    if (selectedDigests.has(source.sha256)) throw new TypeError('M13: DUPLICATE_SOURCE_DIGEST');
    selectedDigests.add(source.sha256);
    if (!mapping || mapping.packageId !== sourcePackage.packageId || mapping.role !== source.role ||
        mapping.logicalPath !== source.logicalPath || mapping.exportPath !== source.exportPath ||
        mapping.packageFileSha256 !== source.sha256 || mapping.rawByteSha256 !== source.sha256 ||
        mapping.byteSize !== source.byteSize || mapping.mediaType !== source.mediaType) {
      throw new TypeError('M13: RAW_MAPPING_MISMATCH');
    }
    const declared = sourcePackage.files.find(file => file.path === source.logicalPath);
    if (!declared || declared.sha256 !== source.sha256 || declared.byteSize !== source.byteSize ||
        declared.mediaType !== source.mediaType || declared.evidenceFamily !== source.evidenceFamily ||
        declared.representationRole !== source.representationRole || declared.independence !== source.independence ||
        declared.providerProvenance !== source.providerProvenance || declared.provenanceBasis !== source.provenanceBasis ||
        canonicalJson(declared.period ?? null) !== canonicalJson(source.period ?? null)) {
      throw new TypeError('M13: PACKAGE_SOURCE_METADATA_MISMATCH');
    }
    return {
      role: source.role,
      logicalPath: source.logicalPath,
      exportPath: source.exportPath,
      sha256: source.sha256,
      byteSize: source.byteSize,
      mediaType: source.mediaType,
      evidenceFamily: source.evidenceFamily,
      representationRole: source.representationRole,
      independence: source.independence,
      providerProvenance: source.providerProvenance,
      provenanceBasis: source.provenanceBasis,
      period: source.period ?? null,
    };
  });
  const ref = (value: { readonly sourceSha256: string; readonly locator: string }) => {
    if (!selectedDigests.has(value.sourceSha256)) throw new TypeError('M13: EVIDENCE_SOURCE_NOT_SELECTED');
    return { sourceSha256: value.sourceSha256, locator: value.locator };
  };
  const recordLineage = input.records.map((record, recordIndex) => ({
    recordIndex,
    recordPointer: `/records/${recordIndex}`,
    record: ref(record.source),
    revenue: ref(record.revenue.source),
    units: ref(record.units.source),
    label: record.label === null ? null : ref(record.label.source),
  }));
  const payload = {
    contractVersion: '1.0.0',
    methodId: 'metric-scope-packet-provenance',
    methodVersion: '2.0.0',
    sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED',
    sourcePackage: {
      packageId: sourcePackage.packageId,
      packageKey: sourcePackage.packageKey,
      version: sourcePackage.version,
      manifestArtifactSha256,
      packageContentSha256: sourcePackage.packageContentSha256,
      sourceAcquiredAt: sourcePackage.sourceAcquiredAt,
      finalizedAt: sourcePackage.finalizedAt,
    },
    lineage: { ...lineage },
    sources,
    recordLineage,
    coverage: {
      recordCount: recordLineage.length,
      recordLocatorCount: recordLineage.filter(item => item.record.locator.length > 0).length,
      revenueLocatorCount: recordLineage.filter(item => item.revenue.locator.length > 0).length,
      unitsLocatorCount: recordLineage.filter(item => item.units.locator.length > 0).length,
      labelLocatorCount: recordLineage.filter(item => item.label !== null && item.label.locator.length > 0).length,
      unlabeledRecordCount: recordLineage.filter(item => item.label === null).length,
    },
    limitations: [
      'BYTE_VERIFICATION_DOES_NOT_AUTHENTICATE_PROVIDER_COLLECTION',
      'LOCATORS_IDENTIFY_RETAINED_SOURCE_BYTES; THEY_DO_NOT_PROVE_MARKET_COMPLETENESS',
      'UNLABELED_RECORDS_REMAIN_EXPLICIT',
      'OWNER_REVIEW_REQUIRED_BEFORE_REPORT_USE',
    ],
  };
  const candidate: unknown = { ...payload, methodOutputId: digest(payload) };
  if (!validate(candidate)) throw new TypeError(`M13: INVALID_OUTPUT ${ajv.errorsText(validate.errors)}`);
  const output: M13ProvenanceAppendix = candidate;
  return { output, bytes: Buffer.from(`${canonicalJson(output)}\n`, 'utf8') };
}

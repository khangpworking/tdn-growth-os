import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourcePackageManifest } from '../../contracts/foundation/source-package-manifest.generated.js';
import { buildM13ProvenanceAppendix } from '../../src/modules/analysis/m13-provenance-appendix.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

const workbook = 'a'.repeat(64);
const manifest = 'b'.repeat(64);
const packageId = '00000000-0000-4000-8000-000000000013';
const sources = [
  {
    role: 'workbook' as const,
    logicalPath: 'metric/workbook.xlsx',
    exportPath: 'raw-workbook.xlsx',
    sha256: workbook,
    byteSize: 100,
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    evidenceFamily: 'metric',
    representationRole: 'structured' as const,
    independence: 'non_independent' as const,
    providerProvenance: 'operator_supplied_unverified' as const,
    provenanceBasis: 'Operator-supplied synthetic fixture',
    period: { start: '2024-08-10', end: '2026-08-10' },
  },
  {
    role: 'manifest' as const,
    logicalPath: 'metric/manifest.json',
    exportPath: 'raw-manifest.json',
    sha256: manifest,
    byteSize: 50,
    mediaType: 'application/json',
    evidenceFamily: 'metric',
    representationRole: 'derived' as const,
    independence: 'non_independent' as const,
    providerProvenance: 'synthetic' as const,
    provenanceBasis: 'Synthetic fixture declaration',
  },
];
const mappings = sources.map(source => ({
  role: source.role,
  packageId,
  logicalPath: source.logicalPath,
  packageFileSha256: source.sha256,
  rawByteSha256: source.sha256,
  byteSize: source.byteSize,
  mediaType: source.mediaType,
  evidenceFamily: source.evidenceFamily,
  providerProvenance: source.providerProvenance,
  provenanceBasis: source.provenanceBasis,
  exportPath: source.exportPath,
}));
const packageFile = (source: (typeof sources)[number]): SourcePackageManifest['files'][number] => ({
  path: source.logicalPath,
  sha256: source.sha256,
  byteSize: source.byteSize,
  mediaType: source.mediaType,
  evidenceFamily: source.evidenceFamily,
  representationRole: source.representationRole,
  independence: source.independence,
  providerProvenance: source.providerProvenance,
  provenanceBasis: source.provenanceBasis,
  ...(!('period' in source) || source.period === undefined ? {} : { period: source.period }),
});
const sourcePackage: SourcePackageManifest = {
  contractVersion: '1.0.0',
  packageId,
  packageKey: 'metric:synthetic-provenance',
  version: 1,
  sourceAcquiredAt: '2026-08-14T00:00:00Z',
  sourceLabel: 'Synthetic provenance fixture',
  finalizedAt: '2026-09-28T00:00:00Z',
  packageContentSha256: 'c'.repeat(64),
  files: [packageFile(sources[0]!), packageFile(sources[1]!)],
};
const lineage = {
  normalizedInputSha256: 'd'.repeat(64),
  normalizationReceiptSha256: 'e'.repeat(64),
  metricResultSha256: 'f'.repeat(64),
};

test('M13 binds exact package files, calculation lineage, and every normalized record deterministically', () => {
  const input = metricFixture();
  input.records[0]!.label = null;
  const first = buildM13ProvenanceAppendix(input, sourcePackage, '1'.repeat(64), sources, mappings, lineage);
  const second = buildM13ProvenanceAppendix(input, sourcePackage, '1'.repeat(64), sources, mappings, lineage);

  assert.deepEqual(second, first);
  assert.equal(first.output.sourcePackage.packageContentSha256, sourcePackage.packageContentSha256);
  assert.deepEqual(first.output.lineage, lineage);
  assert.equal(first.output.sources[0]!.sha256, workbook);
  assert.equal(first.output.sources[1]!.sha256, manifest);
  assert.equal(first.output.recordLineage.length, input.records.length);
  assert.equal(first.output.recordLineage[0]!.recordPointer, '/records/0');
  assert.deepEqual(first.output.recordLineage[0]!.record, input.records[0]!.source);
  assert.equal(first.output.recordLineage[0]!.label, null);
  assert.equal(first.output.coverage.recordLocatorCount, input.records.length);
  assert.equal(first.output.coverage.labelLocatorCount, input.records.length - 1);
  assert.equal(first.output.coverage.unlabeledRecordCount, 1);
});

test('M13 rejects source-package mapping drift and evidence outside the selected exact bytes', () => {
  const input = metricFixture();
  assert.throws(
    () => buildM13ProvenanceAppendix(input, sourcePackage, '1'.repeat(64), sources,
      [{ ...mappings[0]!, rawByteSha256: '9'.repeat(64) }, mappings[1]!], lineage),
    /RAW_MAPPING_MISMATCH/,
  );
  const unselected = metricFixture();
  unselected.records[0]!.revenue = {
    ...unselected.records[0]!.revenue,
    source: { ...unselected.records[0]!.revenue.source, sourceSha256: '9'.repeat(64) },
  };
  assert.throws(
    () => buildM13ProvenanceAppendix(unselected, sourcePackage, '1'.repeat(64), sources, mappings, lineage),
    /EVIDENCE_SOURCE_NOT_SELECTED/,
  );
});

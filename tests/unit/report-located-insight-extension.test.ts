import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { VerifiedFinalizedSourcePackage } from '../../src/modules/foundation/source-package-service.js';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { buildPackageLocatedInsightExtension, buildReportLocatedInsightExtension } from '../../src/modules/analysis/report-located-insight-extension.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { locatedInsightPackageFixture } from '../helpers/located-insight-package-fixture.js';

type Fixture = ReturnType<typeof locatedInsightPackageFixture>;
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function boundary(fixture: Fixture) {
  const retained: VerifiedFinalizedSourcePackage = {
    packageId: '00000000-0000-4000-8000-000000000001', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64),
    manifest: {
      contractVersion: '1.0.0', packageId: '00000000-0000-4000-8000-000000000001', packageKey: 'synthetic:located', version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic located source declarations', finalizedAt: '2026-10-01T00:00:00Z', packageContentSha256: 'b'.repeat(64),
      files: fixture.files.map(({ bytes: _bytes, ...metadata }) => metadata) as VerifiedFinalizedSourcePackage['manifest']['files'],
    }, files: fixture.files,
  };
  // Only the reader consumer is tested here. Real package intake and report
  // persistence/replay belong to the prepared-report integration owner.
  const bundle = { envelope: { sourcePackage: {
    packageId: retained.packageId, manifestArtifactSha256: retained.manifestArtifactSha256,
    packageContentSha256: retained.packageContentSha256, manifest: structuredClone(retained.manifest),
  } } } as SourceBackedReportBundle;
  return { retained, bundle, reader: { readFinalizedSourcePackage: async () => retained } };
}

function rewrite(fixture: Fixture): void {
  const bytes = Buffer.from(`${canonicalJson(fixture.descriptor)}\n`);
  fixture.files[0] = { ...fixture.files[0]!, bytes, byteSize: bytes.length, sha256: sha(bytes) };
}

test('located extension is absent without a reader call and retains the exact selected descriptor when present', async () => {
  assert.equal(await buildReportLocatedInsightExtension(undefined, {} as SourceBackedReportBundle, {
    readFinalizedSourcePackage: async () => { throw new Error('absent supplement must not read'); },
  }), undefined);
  const fixture = locatedInsightPackageFixture();
  const { bundle, reader } = boundary(fixture);
  const result = (await buildReportLocatedInsightExtension(fixture.logicalPath, bundle, reader))!;
  assert.equal(result.files.size, 1);
  assert.deepEqual(JSON.parse(result.bytes.toString()).output.input, fixture.descriptor);
  assert.deepEqual((await buildReportLocatedInsightExtension(fixture.logicalPath, bundle, reader))!.bytes, result.bytes);
  const reviewOnly = (await buildPackageLocatedInsightExtension(fixture.logicalPath, bundle.envelope.sourcePackage, reader))!;
  assert.deepEqual(reviewOnly.bytes, result.bytes);
  await assert.rejects(buildPackageLocatedInsightExtension(fixture.logicalPath, undefined, reader), /LOCATED_PACKAGE_IDENTITY_REQUIRED/);
});

test('located supplement rejects mismatched package identity, corrupted source bytes and missing adopted authority', async () => {
  const fixture = locatedInsightPackageFixture();
  const state = boundary(fixture);
  await assert.rejects(buildReportLocatedInsightExtension(fixture.logicalPath, state.bundle, {
    readFinalizedSourcePackage: async () => ({ ...state.retained, packageContentSha256: 'f'.repeat(64) }),
  }), /LOCATED_PACKAGE_IDENTITY_MISMATCH/);
  const corrupt = locatedInsightPackageFixture();
  corrupt.files[1] = { ...corrupt.files[1]!, bytes: Buffer.from('corrupted') };
  const c = boundary(corrupt);
  await assert.rejects(buildReportLocatedInsightExtension(corrupt.logicalPath, c.bundle, c.reader), /LOCATED_SOURCE_BYTES_MISMATCH/);
  const missing = locatedInsightPackageFixture();
  missing.files.pop();
  const m = boundary(missing);
  await assert.rejects(buildReportLocatedInsightExtension(missing.logicalPath, m.bundle, m.reader), /LOCATED_METHOD_AUTHORITY_NOT_RETAINED/);
});

test('normalized record text must equal the exact retained JSON pointer, not merely self-consistent annotations', async () => {
  for (const variant of ['missing-pointer', 'invalid-pointer', 'changed-text', 'wrong-source'] as const) {
    const fixture = locatedInsightPackageFixture();
    if (variant === 'missing-pointer') fixture.descriptor.records[2]!.locator = '/records/99/text';
    if (variant === 'invalid-pointer') fixture.descriptor.records[2]!.locator = '/records/~2/text';
    if (variant === 'changed-text') fixture.descriptor.records[2]!.text = 'Invented but internally consistent unannotated text';
    if (variant === 'wrong-source') fixture.descriptor.sources[0]!.logicalPath = 'not-retained.json';
    rewrite(fixture);
    const { bundle, reader } = boundary(fixture);
    await assert.rejects(buildReportLocatedInsightExtension(fixture.logicalPath, bundle, reader), /LOCATED_POINTER_UNRESOLVED|LOCATED_JSON_POINTER_REQUIRED|INVALID_LOCATED_INSIGHT_INPUT|LOCATED_RECORD_TEXT_MISMATCH|LOCATED_SOURCE_MEMBERSHIP_MISMATCH/);
  }
});

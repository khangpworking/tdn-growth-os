import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { VerifiedFinalizedSourcePackage } from '../../src/modules/foundation/source-package-service.js';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { buildReportDescriptiveExtension } from '../../src/modules/analysis/report-descriptive-extension.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

type Fixture = ReturnType<typeof descriptiveMarketFixture>;
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function retainedFixture(fixture: Fixture) {
  const retained: VerifiedFinalizedSourcePackage = {
    packageId: '00000000-0000-4000-8000-000000000001', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64),
    manifest: {
      contractVersion: '1.0.0', packageId: '00000000-0000-4000-8000-000000000001', packageKey: 'synthetic:market-extension',
      version: 1, sourceAcquiredAt: null, sourceLabel: 'Synthetic market declarations',
      finalizedAt: '2026-10-01T00:00:00Z', packageContentSha256: 'b'.repeat(64),
      files: fixture.files.map(({ bytes: _bytes, ...metadata }) => metadata) as VerifiedFinalizedSourcePackage['manifest']['files'],
    },
    files: fixture.files,
  };
  // This consumer reads only the verified bundle's package identity. Real report
  // creation/replay belongs to ReportVersionService's integration test owner.
  const bundle = { envelope: { sourcePackage: {
    packageId: retained.packageId, manifestArtifactSha256: retained.manifestArtifactSha256,
    packageContentSha256: retained.packageContentSha256, manifest: structuredClone(retained.manifest),
  } } } as SourceBackedReportBundle;
  return { retained, bundle, reader: { readFinalizedSourcePackage: async () => retained } };
}

function rewriteDescriptor(fixture: Fixture, descriptor: unknown = fixture.descriptor): void {
  const index = fixture.files.findIndex(file => file.path === fixture.logicalPath);
  const bytes = Buffer.from(`${canonicalJson(descriptor)}\n`);
  fixture.files[index] = { ...fixture.files[index]!, bytes, byteSize: bytes.byteLength, sha256: sha(bytes) };
}

test('optional descriptive extension performs no read when absent and retains exact selected declarations when present', async () => {
  const absent = await buildReportDescriptiveExtension(undefined, {} as SourceBackedReportBundle, {
    readFinalizedSourcePackage: async () => { throw new Error('absent extension must not read a package'); },
  });
  assert.equal(absent, undefined);
  const fixture = descriptiveMarketFixture();
  const { bundle, reader } = retainedFixture(fixture);
  const extension = (await buildReportDescriptiveExtension(fixture.logicalPath, bundle, reader))!;
  assert.equal(extension.output.sections.M05.partitions[0]!.subtotal, '20');
  assert.equal(extension.output.input.sourcePackage.packageId, '00000000-0000-4000-8000-000000000001');
  assert.equal(extension.inputSha256, fixture.files[0]!.sha256);
  assert.deepEqual(extension.inputBytes, fixture.files[0]!.bytes);
  assert.equal(extension.files.size, 3);
  assert.deepEqual(extension.files.get('descriptive-market-methods.json'), extension.bytes);
  const evidence = JSON.parse(extension.files.get('descriptive-evidence-files.json')!.toString()) as {
    encoding: string; files: { logicalPath: string; sha256: string; bytesBase64: string }[];
  };
  assert.equal(evidence.encoding, 'base64');
  const originalSource = fixture.files.find(file => file.path === 'descriptive/source.json')!;
  const retainedSource = evidence.files.find(file => file.logicalPath === 'descriptive/source.json')!;
  assert.equal(retainedSource.sha256, originalSource.sha256);
  assert.deepEqual(Buffer.from(retainedSource.bytesBase64, 'base64'), originalSource.bytes);
  assert.ok([...extension.files.keys()].every(name => /^[a-z0-9.-]{1,120}$/.test(name)));
  assert.deepEqual((await buildReportDescriptiveExtension(fixture.logicalPath, bundle, reader))!.bytes, extension.bytes);
});

test('descriptive descriptor cannot supply circular package identity or arbitrary policy authority', async () => {
  const withIdentity = descriptiveMarketFixture();
  rewriteDescriptor(withIdentity, { ...withIdentity.descriptor, sourcePackage: {} });
  const identity = retainedFixture(withIdentity);
  await assert.rejects(buildReportDescriptiveExtension(withIdentity.logicalPath, identity.bundle, identity.reader), /DESCRIPTIVE_DESCRIPTOR_PACKAGE_IDENTITY_FORBIDDEN/);
  const wrongAuthority = descriptiveMarketFixture();
  wrongAuthority.descriptor.configuration.adoptionSha256 = 'f'.repeat(64);
  rewriteDescriptor(wrongAuthority);
  const authority = retainedFixture(wrongAuthority);
  await assert.rejects(buildReportDescriptiveExtension(wrongAuthority.logicalPath, authority.bundle, authority.reader), /DESCRIPTIVE_METHOD_AUTHORITY_MISMATCH/);
  const missingAuthority = descriptiveMarketFixture();
  missingAuthority.files = missingAuthority.files.filter(file => file.path !== 'descriptive/adoption.md');
  const missing = retainedFixture(missingAuthority);
  await assert.rejects(buildReportDescriptiveExtension(missingAuthority.logicalPath, missing.bundle, missing.reader), /DESCRIPTIVE_METHOD_AUTHORITY_NOT_RETAINED/);
});

test('exact package binding rejects changed retained identity, source metadata and corrupt bytes', async () => {
  const fixture = descriptiveMarketFixture();
  const changedIdentity = retainedFixture(fixture);
  await assert.rejects(buildReportDescriptiveExtension(fixture.logicalPath, changedIdentity.bundle, {
    readFinalizedSourcePackage: async () => ({ ...changedIdentity.retained, manifestArtifactSha256: 'c'.repeat(64) }),
  }), /DESCRIPTIVE_PACKAGE_IDENTITY_MISMATCH/);
  const metadata = descriptiveMarketFixture();
  metadata.descriptor.sources[0]!.evidenceFamily = 'different-family';
  rewriteDescriptor(metadata);
  const mismatched = retainedFixture(metadata);
  await assert.rejects(buildReportDescriptiveExtension(metadata.logicalPath, mismatched.bundle, mismatched.reader), /DESCRIPTIVE_SOURCE_MEMBERSHIP_MISMATCH/);
  const corrupt = descriptiveMarketFixture();
  const index = corrupt.files.findIndex(file => file.path === 'descriptive/source.json');
  corrupt.files[index] = { ...corrupt.files[index]!, bytes: Buffer.from('altered source') };
  const corrupted = retainedFixture(corrupt);
  await assert.rejects(buildReportDescriptiveExtension(corrupt.logicalPath, corrupted.bundle, corrupted.reader), /DESCRIPTIVE_SOURCE_BYTES_MISMATCH/);
});

test('located declarations must resolve and equal source values and disjointness evidence before calculation', async () => {
  const cases: { change: (fixture: Fixture) => void; error: RegExp }[] = [
    { change: fixture => { fixture.descriptor.m05[0]!.source.locator = '/absent'; }, error: /DESCRIPTIVE_LOCATOR_UNRESOLVED/ },
    { change: fixture => { fixture.descriptor.m05[0]!.source.locator = 'Sheet1!A2'; }, error: /DESCRIPTIVE_JSON_POINTER_REQUIRED/ },
    { change: fixture => { fixture.descriptor.m05[0]!.observation.value = '120'; }, error: /DESCRIPTIVE_OBSERVATION_SOURCE_MISMATCH/ },
    { change: fixture => { fixture.descriptor.m05[0]!.aggregation!.members[0]!.sourceKey = 'invented-key'; }, error: /DESCRIPTIVE_MEMBER_KEY_MISMATCH/ },
    { change: fixture => { fixture.descriptor.m05[0]!.aggregation!.additive = false; }, error: /DESCRIPTIVE_ADDITIVITY_PROOF_MISMATCH/ },
    { change: fixture => { fixture.descriptor.question = 'A different run scope'; }, error: /DESCRIPTIVE_RUN_CONFIGURATION_MISMATCH/ },
  ];
  for (const { change, error } of cases) {
    const fixture = descriptiveMarketFixture();
    change(fixture);
    rewriteDescriptor(fixture);
    const { bundle, reader } = retainedFixture(fixture);
    await assert.rejects(buildReportDescriptiveExtension(fixture.logicalPath, bundle, reader), error);
  }
});

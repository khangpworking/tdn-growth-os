import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { VerifiedFinalizedSourcePackage } from '../../src/modules/foundation/source-package-service.js';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { buildReportMethodPacketsExtension } from '../../src/modules/analysis/report-method-packets-extension.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { reportMethodPacketsFixture } from '../helpers/report-method-packets-fixture.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };

const bytesOf = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`);
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function boundary() {
  const resultBytes = bytesOf(calculateMetricScopes(metricFixture()));
  const catalogBytes = bytesOf(catalog);
  const packet = createResearchReportPacket(resultBytes, sha(resultBytes), catalogBytes, sha(catalogBytes)).packet;
  const packetBytes = bytesOf(packet);
  const fixture = reportMethodPacketsFixture(packet, sha(resultBytes));
  const metadata = fixture.files.map(({bytes: _bytes, ...file}) => file);
  const retained: VerifiedFinalizedSourcePackage = {
    packageId: '00000000-0000-4000-8000-000000000001', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64),
    manifest: {
      contractVersion: '1.0.0', packageId: '00000000-0000-4000-8000-000000000001', packageKey: 'synthetic:methods', version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic method source declarations', finalizedAt: '2026-10-01T00:00:00Z', packageContentSha256: 'b'.repeat(64),
      files: [metadata[0]!, ...metadata.slice(1)],
    }, files: fixture.files,
  };
  // The reader-consumer boundary owns byte/pointer authentication. Real intake,
  // retained version storage and replay are exercised by the integration test.
  const bundle = {
    packet, files: new Map([['packet.json', packetBytes], ['metric-result.json', resultBytes]]),
    envelope: {artifacts: {packetSha256: sha(packetBytes), metricResultSha256: sha(resultBytes)}, sourcePackage: {
      packageId: retained.packageId, manifestArtifactSha256: retained.manifestArtifactSha256,
      packageContentSha256: retained.packageContentSha256, manifest: structuredClone(retained.manifest),
    }},
  } as unknown as SourceBackedReportBundle;
  return {fixture, retained, bundle, reader: {readFinalizedSourcePackage: async () => retained}};
}

function updateDescriptor(state: ReturnType<typeof boundary>): void {
  const index = state.fixture.files.findIndex(file => file.path === state.fixture.logicalPath);
  const bytes = bytesOf(state.fixture.descriptor);
  state.fixture.files[index] = {...state.fixture.files[index]!, bytes, byteSize: bytes.length, sha256: sha(bytes)};
}

test('method supplement absence performs no reader access; presence retains exact source and calculation bytes', async () => {
  assert.equal(await buildReportMethodPacketsExtension(undefined, {} as SourceBackedReportBundle, {
    readFinalizedSourcePackage: async () => { throw new Error('absent method must not access sources'); },
  }), undefined);
  const state = boundary();
  const built = (await buildReportMethodPacketsExtension(state.fixture.logicalPath, state.bundle, state.reader))!;
  const retained = JSON.parse(built.bytes.toString()) as {descriptor: {bytesBase64: string}; calculation: {sha256: string}; claimProjection: {sha256: string}; files: {sha256: string; bytesBase64: string}[]};
  assert.deepEqual(Buffer.from(retained.descriptor.bytesBase64, 'base64'), bytesOf(state.fixture.descriptor));
  assert.equal(retained.calculation.sha256, sha(state.bundle.files.get('metric-result.json')!));
  assert.equal(retained.claimProjection.sha256, sha(state.bundle.files.get('packet.json')!));
  assert.ok(retained.files.length >= 4);
  for (const file of retained.files) assert.equal(sha(Buffer.from(file.bytesBase64, 'base64')), file.sha256);
  assert.equal(built.gates!.sections.M10.forecasts, null);
  assert.equal(built.decisions!.sections.M12.chosen, null);
});

test('method supplement rejects package drift, corrupted bytes and absent adopted authority before rendering', async () => {
  const state = boundary();
  await assert.rejects(buildReportMethodPacketsExtension(state.fixture.logicalPath, state.bundle, {
    readFinalizedSourcePackage: async () => ({...state.retained, packageContentSha256: 'f'.repeat(64)}),
  }), /METHOD_PACKET_PACKAGE_IDENTITY_MISMATCH/);
  const corrupt = boundary();
  const sourceIndex = corrupt.fixture.files.findIndex(file => file.path !== corrupt.fixture.logicalPath && file.mediaType === 'application/json');
  corrupt.fixture.files[sourceIndex] = {...corrupt.fixture.files[sourceIndex]!, bytes: Buffer.from('corrupted')};
  await assert.rejects(buildReportMethodPacketsExtension(corrupt.fixture.logicalPath, corrupt.bundle, corrupt.reader), /METHOD_PACKET_SOURCE_BYTES_MISMATCH/);
  const missing = boundary();
  await assert.rejects(buildReportMethodPacketsExtension(missing.fixture.logicalPath, missing.bundle, {
    readFinalizedSourcePackage: async () => ({...missing.retained, files: missing.retained.files.filter(file => file.sha256 !== 'c4e0f5fbda7f1afbb47571a384c59e59aa31264b2e5b79a38bce97a30605ba63')}),
  }), /METHOD_PACKET_AUTHORITY_MISSING/);
  for (const change of ['result-bytes', 'packet-object', 'result-lineage'] as const) {
    const changed = boundary();
    if (change === 'packet-object') changed.bundle.packet.claims[0]!.value = '999999';
    const bundle = change === 'result-bytes'
      ? {...changed.bundle, files: new Map([...changed.bundle.files, ['metric-result.json', Buffer.from('{}\n')]])}
      : change === 'result-lineage'
      ? {...changed.bundle, envelope: {...changed.bundle.envelope, artifacts: {...changed.bundle.envelope.artifacts, metricResultSha256: 'f'.repeat(64)}}}
      : changed.bundle;
    await assert.rejects(buildReportMethodPacketsExtension(changed.fixture.logicalPath, bundle, changed.reader),
      /METHOD_PACKET_CALCULATION_BYTES_MISMATCH/, change);
  }
});

test('method source locators authenticate the full nested payload, not only the displayed number', async () => {
  const cases = [
    {change: (state: ReturnType<typeof boundary>) => { state.fixture.descriptor.gates!.m10!.series[0]!.rows[0]!.observation.value = '999'; }, error: /METHOD_PACKET_LITERAL_PAYLOAD_MISMATCH/},
    {change: (state: ReturnType<typeof boundary>) => { state.fixture.descriptor.gates!.m10!.series[0]!.unit = 'Invented unit'; }, error: /METHOD_PACKET_LITERAL_PAYLOAD_MISMATCH/},
    {change: (state: ReturnType<typeof boundary>) => { state.fixture.descriptor.gates!.m10!.series[0]!.rows[0]!.source.locator = '/m10/series/0/rows/999'; }, error: /METHOD_PACKET_UNRESOLVED_POINTER/},
    {change: (state: ReturnType<typeof boundary>) => { state.fixture.descriptor.gates!.i11!.cells[0]!.source.sha256 = 'f'.repeat(64); }, error: /METHOD_PACKET_SOURCE_MEMBERSHIP_MISMATCH/},
  ];
  for (const {change, error} of cases) {
    const state = boundary();
    change(state);
    updateDescriptor(state);
    await assert.rejects(buildReportMethodPacketsExtension(state.fixture.logicalPath, state.bundle, state.reader), error);
  }
});

test('synthesis rejects fabricated packet values and reference digests despite internally consistent declarations', async () => {
  for (const change of ['value', 'digest', 'pointer'] as const) {
    const state = boundary();
    const claim = state.fixture.descriptor.decisions!.claims[0]!;
    if (change === 'value') claim.payload.value = '999999';
    if (change === 'digest') { claim.reference.sha256 = 'f'.repeat(64); claim.claimKey = `${claim.payload.claimId}@${claim.reference.sha256}`; }
    if (change === 'pointer') claim.reference.claimPointer = '/claims/999';
    updateDescriptor(state);
    await assert.rejects(buildReportMethodPacketsExtension(state.fixture.logicalPath, state.bundle, state.reader), /METHOD_PACKET_CLAIM_REPLAY_MISMATCH|METHOD_PACKET_UNRESOLVED_POINTER/);
  }
});

test('U-04 descriptive rates are built only from retained INCLUDED text records resolved at the package boundary', async () => {
  const RECORDS_PATH = 'method-packets/located-records.json';
  const build = async (excludedFirstMember: boolean) => {
    const records = Array.from({ length: 71 }, (_, index) => ({ disposition: 'INCLUDED', text: `Retained text record ${index}` }));
    if (excludedFirstMember) records[0] = { disposition: 'EXCLUDED', text: 'Retained but excluded record' };
    const recordsBytes = bytesOf(records);
    const recordsSha256 = sha(recordsBytes);
    const member = (index: number) => ({ logicalPath: RECORDS_PATH, sha256: recordsSha256, locator: `/${index}` });
    const gates = boundedAnalysisGatesFixture();
    const base = gates.i11!.cells[0]!;
    const cell = (pointer: string, platform: string, members: readonly number[], numeratorMembers: readonly number[]) => ({
      ...structuredClone(base), source: { ...base.source, locator: pointer }, group: null,
      countUnit: 'LOCATED_RECORD' as const, identityEvidence: null,
      numerator: { state: 'observed_value' as const, value: String(numeratorMembers.length) },
      denominator: { state: 'observed_value' as const, value: String(members.length) },
      memberSources: members.map(member), numeratorMemberSources: numeratorMembers.map(member),
      groupBasis: {
        platform: { state: 'SOURCE_STATED' as const, value: platform, source: { ...base.source, locator: `${pointer}/groupBasis/platform` } },
        buyerType: { state: 'SOURCE_STATED' as const, value: 'RETAIL', source: { ...base.source, locator: `${pointer}/groupBasis/buyerType` } },
      },
    });
    gates.semanticsVersion = '1.1.0';
    gates.i11 = { ...gates.i11!, groupPolicy: null, cells: [
      cell('/i11/cells/0', 'Shopee', Array.from({ length: 40 }, (_, index) => index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      cell('/i11/cells/1', 'Lazada', Array.from({ length: 31 }, (_, index) => 40 + index), [40, 41, 42, 43, 44]),
    ] };
    const resultBytes = bytesOf(calculateMetricScopes(metricFixture()));
    const catalogBytes = bytesOf(catalog);
    const packet = createResearchReportPacket(resultBytes, sha(resultBytes), catalogBytes, sha(catalogBytes)).packet;
    const packetBytes = bytesOf(packet);
    const fixture = reportMethodPacketsFixture(packet, sha(resultBytes), false, gates);
    fixture.files.push({ path: RECORDS_PATH, bytes: recordsBytes, sha256: recordsSha256, byteSize: recordsBytes.length,
      mediaType: 'application/json', evidenceFamily: 'synthetic-located-records', representationRole: 'structured',
      independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic retained text records' });
    const manifest = { contractVersion: '1.0.0', packageId: '00000000-0000-4000-8000-000000000001', packageKey: 'synthetic:methods', version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic method source declarations', finalizedAt: '2026-10-01T00:00:00Z',
      packageContentSha256: 'b'.repeat(64), files: fixture.files.map(({ bytes: _fileBytes, ...file }) => file) };
    const reader: { readFinalizedSourcePackage: () => Promise<VerifiedFinalizedSourcePackage> } = {
      readFinalizedSourcePackage: async () => ({ packageId: manifest.packageId, manifestArtifactSha256: 'a'.repeat(64),
        packageContentSha256: 'b'.repeat(64), manifest, files: fixture.files }) as unknown as VerifiedFinalizedSourcePackage };
    const bundle = { packet, files: new Map([['packet.json', packetBytes], ['metric-result.json', resultBytes]]),
      envelope: { artifacts: { packetSha256: sha(packetBytes), metricResultSha256: sha(resultBytes) },
        sourcePackage: { packageId: manifest.packageId, manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64),
          manifest: structuredClone(manifest) } } } as unknown as SourceBackedReportBundle;
    return { logicalPath: fixture.logicalPath, bundle, reader };
  };

  const state = await build(false);
  const built = (await buildReportMethodPacketsExtension(state.logicalPath, state.bundle, state.reader))!;
  assert.deepEqual(built.gates!.sections.I11.partitions[0]!.groupOrder, ['Shopee / RETAIL', 'Lazada / RETAIL']);
  assert.deepEqual(built.gates!.sections.I11.rates, { recordsPerGroupMinimum: 30, groups: [
    { partition: 0, group: 'Shopee / RETAIL', numerator: 12, denominator: 40, rate: 0.3 },
    { partition: 0, group: 'Lazada / RETAIL', numerator: 5, denominator: 31, rate: 5 / 31 },
  ] });

  // A member that resolves to a retained but excluded record is not text-record membership, so no rate is built.
  const excluded = await build(true);
  await assert.rejects(buildReportMethodPacketsExtension(excluded.logicalPath, excluded.bundle, excluded.reader),
    /METHOD_PACKET_MEMBER_NOT_AN_INCLUDED_TEXT_RECORD/);
});

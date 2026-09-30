import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import type { ReportVersionRecord } from '../../contracts/analysis/report-version-record.generated.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildReportInputReadiness } from '../../src/modules/analysis/report-input-readiness.js';
import { createResearchReportPacket, type ReportMethodArtifact } from '../../src/modules/analysis/versioned-report-packet.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

// Test-authoring gate: this is the single owner of the closed readiness profile.
// API and UI tests below it own transport validation and presentation only.
const bytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(label);

function fixture() {
  const input = metricFixture();
  const inputBytes = bytes(input);
  const resultBytes = bytes(calculateMetricScopes(input));
  const catalogBytes = bytes(catalog);
  const methodFiles = new Map<string, Buffer>([
    ['m02-scope-method.json', bytes({ method: 'm02' })],
    ['m08-tablet-quote-method.json', bytes({ quote: {
      observationTimeState: 'KNOWN', observedAt: '2026-09-21T10:00:00.000Z', observationPeriod: null,
      priceState: 'DISPLAYED_LISTED',
      packCount: { provenance: { kind: 'OWNER_DECLARED' } },
    } })],
    ['m13-provenance-appendix.json', bytes({ method: 'm13' })],
    ['i03-research-method.json', bytes({ method: 'i03' })],
    ['i17-evidence-trace.json', bytes({ method: 'i17' })],
  ]);
  const method = <T extends ReportMethodArtifact['sectionId'], F extends ReportMethodArtifact['fileName']>(
    sectionId: T,
    fileName: F,
  ) => ({
    sectionId, methodVersion: '2.0.0' as const, fileName,
    sha256: sha256(methodFiles.get(fileName)!), methodOutputId: digest(`output:${sectionId}`),
  });
  const methodArtifacts: ReportMethodArtifact[] = [
    method('M02', 'm02-scope-method.json'), method('M08', 'm08-tablet-quote-method.json'),
    method('M13', 'm13-provenance-appendix.json'), method('I03', 'i03-research-method.json'),
    method('I17', 'i17-evidence-trace.json'),
  ];
  const packet = createResearchReportPacket(
    resultBytes, sha256(resultBytes), catalogBytes, sha256(catalogBytes), methodArtifacts,
  ).packet;
  const sourceManifest = bytes({ package: 'synthetic-readiness-fixture' });
  const receipt = bytes({ profile: 'synthetic-readiness-fixture' });
  const files = new Map<string, Buffer>([
    ['source-package-manifest.json', sourceManifest],
    ['normalized-input.json', inputBytes],
    ['receipt.json', receipt],
    ['metric-result.json', resultBytes],
    ...methodFiles,
  ]);
  const artifacts = [...files].map(([fileName, content]) => ({
    fileName, sha256: sha256(content), mediaType: 'application/json', byteSize: content.byteLength,
  }));
  const record: ReportVersionRecord = {
    contractVersion: '1.0.0', reportId: '11111111-1111-4111-8111-111111111111', reportKey: 'fixture',
    versionId: '22222222-2222-4222-8222-222222222222', version: 1, previousSemanticVersionId: null,
    semanticVersionId: digest('semantic'), requestSha256: digest('request'),
    workspaceId: '33333333-3333-4333-8333-333333333333', workspaceSnapshotSha256: digest('workspace'),
    sourcePackageId: '44444444-4444-4444-8444-444444444444', sourcePackageManifestSha256: sha256(sourceManifest),
    packageContentSha256: digest('package'), evidenceEnvelopeSha256: digest('envelope'),
    semanticContentSha256: digest('semantic-content'), reviewStateSha256: digest('review'),
    interpretationState: 'NONE', reviewState: 'UNREVIEWED', createdAt: '2026-09-30T00:00:00.000Z',
    artifacts,
    selectedSources: [
      { ordinal: 0, role: 'workbook', logicalPath: 'metric.xlsx', sha256: digest('workbook') },
      { ordinal: 1, role: 'manifest', logicalPath: 'manifest.json', sha256: digest('manifest') },
      { ordinal: 2, role: 'labels', logicalPath: 'labels.json', sha256: digest('labels') },
      { ordinal: 3, role: 'tabletQuoteSource', logicalPath: 'quote/source.json', sha256: digest('quote-source') },
      { ordinal: 4, role: 'tabletQuoteInput', logicalPath: 'quote/input.json', sha256: digest('quote-input') },
    ],
  };
  return { record, packet, files };
}

test('classifies every catalog input with exact evidence, optional semantics and fail-closed corruption', () => {
  const { record, packet, files } = fixture();
  const inputIds = [...new Set(catalog.sections.flatMap(section => section.requiredInputs))];
  const checks = buildReportInputReadiness(record, packet, inputIds, files);
  const byId = new Map(checks.map(check => [check.inputId, check]));

  assert.equal(inputIds.length, 30);
  assert.deepEqual(checks.map(check => check.inputId), inputIds);
  assert.deepEqual(byId.get('source-package-manifest')?.evidenceRefs, [{
    kind: 'REPORT_ARTIFACT', locator: 'source-package-manifest.json', sha256: record.sourcePackageManifestSha256,
  }]);
  assert.equal(byId.get('normalized-metric-rows')?.state, 'PRESENT');
  assert.equal(byId.get('verified-method-artifacts')?.evidenceRefs.length, 3);
  assert.equal(byId.get('resolved-fact-claim-pointers')?.state, 'PRESENT');
  assert.equal(byId.get('owner-question')?.state, 'ABSENT');
  assert.equal(byId.get('owner-question')?.blocking, true);
  assert.equal(byId.get('domain-specific-evidence')?.state, 'ABSENT');
  assert.equal(byId.get('optional-owner-declared-tablet-count')?.state, 'PRESENT');
  assert.equal(byId.get('optional-owner-declared-tablet-count')?.blocking, false);

  const m08WithoutCount = bytes({ quote: {
    observationTimeState: 'UNKNOWN', observedAt: null, observationPeriod: null,
    priceState: 'DISPLAYED_LISTED', packCount: null,
  } });
  const m08Digest = sha256(m08WithoutCount);
  const packetWithoutCount = {
    ...packet,
    sections: packet.sections.map(section => section.sectionId === 'M08'
      ? { ...section, methodArtifact: { ...section.methodArtifact!, sha256: m08Digest } }
      : section),
  };
  const recordWithoutCount = {
    ...record,
    artifacts: record.artifacts.map(artifact => artifact.fileName === 'm08-tablet-quote-method.json'
      ? { ...artifact, sha256: m08Digest, byteSize: m08WithoutCount.byteLength }
      : artifact),
  };
  const filesWithoutCount = new Map(files).set('m08-tablet-quote-method.json', m08WithoutCount);
  const optional = buildReportInputReadiness(recordWithoutCount, packetWithoutCount, [
    'explicit-price-state-and-observation-time', 'optional-owner-declared-tablet-count',
  ], filesWithoutCount);
  assert.deepEqual(optional.map(check => [check.state, check.blocking, check.codes[0]]), [
    ['ABSENT', true, 'OBSERVATION_TIME_UNKNOWN'],
    ['ABSENT', false, 'OWNER_DECLARED_TABLET_COUNT_NOT_RECORDED'],
  ]);

  const corruptFiles = new Map(files).set('m13-provenance-appendix.json', Buffer.from('changed'));
  assert.equal(buildReportInputReadiness(record, packet, ['verified-locators'], corruptFiles)[0]?.state, 'INVALID');
  assert.throws(() => buildReportInputReadiness(record, packet, ['future-unregistered-input'], files), /UNKNOWN_INPUT_ID/);
});

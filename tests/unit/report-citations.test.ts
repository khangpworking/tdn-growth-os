import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildResearchReportChartData } from '../../src/modules/analysis/research-report-charts.js';
import { buildResearchChartSpec } from '../../src/modules/analysis/research-chart-spec.js';
import { buildReportCitationProjection, type ReportCitationQuoteCandidate, type ReportCitationQuoteVerifier } from '../../src/modules/analysis/report-citations.js';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildReportSemanticContent } from '../../src/modules/analysis/report-semantic-content.js';

// Authoring gate: these tests own the new projection boundary. They protect
// deterministic numbering, exact retained membership and quote verification;
// they do not repeat A1 arithmetic, A3 packet construction or HTML rendering.
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(Buffer.from(label));
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function fixture(withRawSource = false): SourceBackedReportBundle {
  const input = metricFixture();
  const inputBytes = canonicalBytes(input);
  const result = calculateMetricScopes(input);
  const resultBytes = canonicalBytes(result);
  const catalogBytes = canonicalBytes(catalog);
  const catalogSha256 = sha256(catalogBytes);
  const metricResultSha256 = sha256(resultBytes);
  const packet = createResearchReportPacket(resultBytes, metricResultSha256, catalogBytes, catalogSha256).packet;
  const packetBytes = canonicalBytes(packet);
  const charts = buildResearchReportChartData(resultBytes, metricResultSha256, catalogBytes, catalogSha256);
  const chartBytes = canonicalBytes(charts);
  const chartSpec = buildResearchChartSpec(charts, chartBytes);
  const reportBytes = Buffer.from('renderer');
  const raw = Buffer.from('exact retained workbook bytes', 'utf8');
  const rawSha256 = sha256(raw);
  const selectedSources = withRawSource ? [
    {
      sha256: rawSha256, label: 'Retained workbook', representationRole: 'primary', evidenceFamily: 'synthetic-metric',
      provenanceBasis: 'Synthetic exact bytes', role: 'workbook', logicalPath: 'workbook.xlsx', exportPath: 'raw-workbook.xlsx',
      byteSize: raw.byteLength, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', independence: 'independent', providerProvenance: 'declared',
    },
    {
      sha256: digest('source-two'), label: 'Synthetic second source', representationRole: 'derived', evidenceFamily: 'synthetic-metric',
      provenanceBasis: 'Synthetic exact bytes', role: 'manifest', logicalPath: 'manifest.json', exportPath: 'raw-manifest.json',
      byteSize: 1, mediaType: 'application/json', independence: 'dependent', providerProvenance: 'declared',
    },
  ] : [{ sha256: digest('source-one') }, { sha256: digest('source-two') }];
  const envelope = {
    contractVersion: 'source-backed-report-v1', request: { catalogSha256 } as never,
    workspace: { workspaceId: '11111111-1111-4111-8111-111111111111', state: 'ACTIVE', snapshotSha256: digest('workspace'), snapshot: {} as never },
    sourcePackage: { packageId: '22222222-2222-4222-8222-222222222222', manifestArtifactSha256: digest('manifest'), packageContentSha256: digest('package-content'), manifest: {} as never },
    selectedSources,
    rawByteMappings: withRawSource ? [{ role: 'workbook', packageId: '22222222-2222-4222-8222-222222222222', logicalPath: 'workbook.xlsx', packageFileSha256: rawSha256, rawByteSha256: rawSha256, byteSize: raw.byteLength, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', evidenceFamily: 'synthetic-metric', providerProvenance: 'declared', provenanceBasis: 'Synthetic exact bytes', exportPath: 'raw-workbook.xlsx' }] : [],
    artifacts: {
      workspaceSnapshotSha256: digest('workspace'), sourcePackageManifestSha256: digest('manifest'), normalizedInputSha256: sha256(inputBytes), receiptSha256: digest('receipt'),
      metricResultSha256, catalogSha256, packetSha256: sha256(packetBytes), chartSha256: sha256(chartBytes), chartSpecSha256: sha256(chartSpec.bytes), reportSha256: sha256(reportBytes),
    },
    limitations: [],
  } as never;
  const files = new Map<string, Buffer>([
    ['packet.json', packetBytes], ['normalized-input.json', inputBytes], ['metric-result.json', resultBytes],
    ['charts.json', chartBytes], ['chart-spec.json', chartSpec.bytes], ['section-catalog.json', catalogBytes], ['report.md', reportBytes],
    ...(withRawSource ? [['raw-workbook.xlsx', raw] as const] : []),
  ]);
  return { envelope, envelopeBytes: canonicalBytes(envelope), input, result, receipt: {} as never, packet, charts, chartSpec: chartSpec.spec, files };
}

test('projects exact claim lineage with stable numbered calculation citations', () => {
  const bundle = fixture();
  const first = buildReportCitationProjection({ bundle });
  const second = buildReportCitationProjection({ bundle });
  assert.deepEqual(first, second);
  assert.equal(first.contractVersion, 'report-citations-v1');
  assert.equal(first.report.packetId, bundle.packet.packetId);
  assert.equal(first.report.packetSha256, bundle.envelope.artifacts.packetSha256);
  assert.deepEqual(first.citations.map(citation => citation.number), first.citations.map((_, index) => index + 1));
  const reference = first.references.find(item => item.referenceId === 'M03:all:revenue');
  assert.ok(reference);
  assert.equal(reference.calculationCitationNumbers.length, 1);
  const calculation = first.citations[reference.calculationCitationNumbers[0]! - 1]!;
  assert.equal(calculation.artifact.logicalPath, 'metric-result.json');
  assert.equal(calculation.artifact.sha256, bundle.envelope.artifacts.metricResultSha256);
  assert.deepEqual(calculation.locator, { kind: 'json-pointer', pointer: '/scopes/0/revenue/value' });
  assert.equal(calculation.quote, null);
  assert.equal(calculation.quoteVerification, 'NONE');
});

test('a supplied citation semantic identity must bind canonical retained content and this bundle', () => {
  const original = fixture();
  const files = new Map(original.files);
  const bundle = { ...original, files };
  const semantic = buildReportSemanticContent(bundle);
  assert.throws(() => buildReportCitationProjection({ bundle, semanticVersionId: digest('invented') }), /SEMANTIC_CONTENT_MISSING/);
  bundle.files.set('semantic-content.json', semantic.contentBytes);
  const projection = buildReportCitationProjection({ bundle, semanticVersionId: semantic.content.semanticVersionId });
  assert.equal(projection.report.semanticVersionId, semantic.content.semanticVersionId);
  assert.throws(() => buildReportCitationProjection({ bundle, semanticVersionId: digest('invented') }), /SEMANTIC_CONTENT_BINDING_MISMATCH/);
  const { semanticVersionId: _id, ...payload } = semantic.content;
  const foreignPayload = { ...payload, sourceLayer: { ...payload.sourceLayer, workspaceId: '99999999-9999-4999-8999-999999999999' } };
  const foreignId = sha256(Buffer.from(canonicalJson(foreignPayload)));
  bundle.files.set('semantic-content.json', canonicalBytes({ ...foreignPayload, semanticVersionId: foreignId }));
  assert.throws(() => buildReportCitationProjection({ bundle, semanticVersionId: foreignId }), /SEMANTIC_CONTENT_BINDING_MISMATCH/);
});

test('model reference IDs are an exact retained allowlist; latest and invented IDs fail closed', () => {
  const bundle = fixture();
  const empty = buildReportCitationProjection({ bundle, references: [] });
  assert.deepEqual(empty.citations, []);
  assert.deepEqual(empty.references, []);
  assert.throws(() => buildReportCitationProjection({ bundle, references: ['latest'] }), /UNKNOWN_REFERENCE_ID:latest/);
  assert.throws(() => buildReportCitationProjection({ bundle, references: ['M03:all:revenue', 'M03:all:revenue'] }), /DUPLICATE_REFERENCE_ID/);
  assert.throws(() => buildReportCitationProjection({ bundle, references: ['invented-claim'] }), /UNKNOWN_REFERENCE_ID:invented-claim/);
});

test('PageIndex candidates need exact retained source membership and a verified quote', () => {
  const bundle = fixture(true);
  const sourceSha256 = bundle.envelope.selectedSources[0]!.sha256;
  const candidate = { referenceId: 'M03:all:revenue', sourceSha256, locator: 'pdf:page=7', provider: 'pageindex' as const, quote: 'untrusted candidate' };
  assert.throws(() => buildReportCitationProjection({ bundle, candidates: [candidate] }), /PAGEINDEX_QUOTE_NOT_VERIFIED/);
  const projection = buildReportCitationProjection({
    bundle,
    candidates: [candidate],
    quoteVerifier: (received, source) => {
      assert.equal(received.sourceSha256, source.metadata.sourceSha256);
      assert.deepEqual(Buffer.from(source.bytes), Buffer.from('exact retained workbook bytes'));
      // Synthetic fixture: the verifier return is an external attestation
      // contract, not an independent parser proof of this quote text.
      return { quote: 'verified exact quote', sourceSha256, locator: received.locator };
    },
  });
  const reference = projection.references.find(item => item.referenceId === candidate.referenceId)!;
  assert.equal(reference.candidateCitationNumbers.length, 1);
  const citation = projection.citations[reference.candidateCitationNumbers[0]! - 1]!;
  assert.deepEqual(citation.locator, { kind: 'pdf', page: 7, fragment: null });
  assert.equal(citation.quote, 'verified exact quote');
  assert.equal(citation.quoteVerification, 'EXTERNAL_VERIFIER_ATTESTED');
  assert.equal(citation.role, 'RETRIEVAL_CANDIDATE');
  assert.equal(reference.citationNumbers.includes(citation.number), false);
  assert.equal(citation.source?.sourceSha256, sourceSha256);
});

test('known XLSX and JSON-pointer locators remain typed without inventing quotes', () => {
  const bundle = fixture(true);
  const sourceSha256 = bundle.envelope.selectedSources[0]!.sha256;
  const verifier: ReportCitationQuoteVerifier = (candidate: ReportCitationQuoteCandidate) => ({ quote: 'exact', sourceSha256, locator: candidate.locator });
  const projection = buildReportCitationProjection({
    bundle,
    references: ['M03:all:revenue'],
    candidates: [
      { referenceId: 'M03:all:revenue', sourceSha256, locator: 'Sheet1!E2', provider: 'manual', quote: 'candidate' },
      { referenceId: 'M03:all:revenue', sourceSha256, locator: '/rows/0/revenue', provider: 'manual', quote: 'candidate' },
    ],
    quoteVerifier: verifier,
  });
  const reference = projection.references[0]!;
  const candidateCitations = reference.candidateCitationNumbers.map(number => projection.citations[number - 1]!);
  assert.ok(candidateCitations.some(citation => citation.locator.kind === 'xlsx' && citation.locator.cell === 'E2'));
  assert.ok(candidateCitations.some(citation => citation.locator.kind === 'json-pointer' && citation.locator.pointer === '/rows/0/revenue'));
  assert.ok(candidateCitations.every(citation => citation.quote === 'exact'));
});

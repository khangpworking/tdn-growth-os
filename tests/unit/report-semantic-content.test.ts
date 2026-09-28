import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { buildReportSemanticContent, buildUnreviewedReportState } from '../../src/modules/analysis/report-semantic-content.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

// Test-authoring gate: this unit owns semantic identity, which the export
// lifecycle cannot isolate from rendering. It must fail if renderer-only bytes
// enter content identity or if source/calculation bytes stop affecting it.
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(Buffer.from(label));
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function fixture(options: { readonly report?: string; readonly chart?: string; readonly sourceTwo?: string } = {}): SourceBackedReportBundle {
  const packetId = digest('packet-id');
  const input = { input: 'exact' };
  const inputBytes = canonicalBytes(input);
  const result = { rendererVersion: 'metric-draft-vi-v1', result: 'exact' };
  const resultBytes = canonicalBytes(result);
  const catalog = { catalog: 'exact' };
  const catalogBytes = canonicalBytes(catalog);
  const catalogSha256 = sha256(catalogBytes);
  const metricResultSha256 = sha256(resultBytes);
  const packet = {
    packetId,
    policyVersion: 'report-packet-a3a-v1',
    metricMethodVersion: 'metric-scope-v1',
    metricRounding: 'percent-half-even-2-v1',
    metricResultSha256,
    catalogSha256,
    catalog,
    claims: [],
    sections: [{
      sectionId: 'M03', deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT', sectionSha256: digest('section'),
      claimIds: [], contextPointers: [], blockers: [],
    }],
  } as never;
  const packetBytes = canonicalBytes(packet);
  const charts = {
    chart: options.chart ?? 'exact',
    approvalState: 'UNREVIEWED',
    resultSha256: metricResultSha256,
    catalogSha256,
    computation: {
      inputSha256: digest('input'), methodVersion: 'metric-scope-v1', rounding: 'percent-half-even-2-v1',
      rendererVersion: 'metric-draft-vi-v1', profileId: 'fixture', labelCodebookVersion: 'fixture',
      wideUnknownPolicy: 'exclude',
    },
  } as never;
  const chartBytes = canonicalBytes(charts);
  const envelope = {
    contractVersion: 'source-backed-report-v1',
    request: {} as never,
    workspace: { workspaceId: '11111111-1111-4111-8111-111111111111', state: 'ACTIVE', snapshotSha256: digest('workspace'), snapshot: {} as never },
    sourcePackage: {
      packageId: '22222222-2222-4222-8222-222222222222',
      manifestArtifactSha256: digest('manifest'),
      packageContentSha256: digest('package-content'),
      manifest: {} as never,
    },
    selectedSources: [
      { sha256: digest('source-one') },
      { sha256: digest(options.sourceTwo ?? 'source-two') },
    ] as never,
    rawByteMappings: [],
    artifacts: {
      workspaceSnapshotSha256: digest('workspace'),
      sourcePackageManifestSha256: digest('manifest'),
      normalizedInputSha256: sha256(inputBytes),
      receiptSha256: digest('receipt'),
      metricResultSha256,
      catalogSha256,
      packetSha256: sha256(packetBytes),
      chartSha256: sha256(chartBytes),
      reportSha256: sha256(Buffer.from(options.report ?? 'renderer A')),
    },
    limitations: [],
  } as never;
  const envelopeBytes = canonicalBytes(envelope);
  const files = new Map<string, Buffer>([
    ['packet.json', packetBytes],
    ['normalized-input.json', inputBytes],
    ['metric-result.json', resultBytes],
    ['charts.json', chartBytes],
    ['section-catalog.json', catalogBytes],
    ['report.md', Buffer.from(options.report ?? 'renderer A')],
  ]);
  return {
    envelope,
    envelopeBytes,
    input: input as never,
    result: result as never,
    receipt: {} as never,
    packet,
    charts,
    files,
  };
}

test('semantic identity binds exact evidence and calculations but not renderer or review state', () => {
  const first = buildReportSemanticContent(fixture());
  const same = buildReportSemanticContent(fixture());
  assert.equal(same.content.semanticVersionId, first.content.semanticVersionId);
  assert.deepEqual(same.contentBytes, first.contentBytes);

  const rendererOnly = buildReportSemanticContent(fixture({ report: 'renderer B' }));
  assert.equal(rendererOnly.content.semanticVersionId, first.content.semanticVersionId);
  const changedChart = buildReportSemanticContent(fixture({ chart: '{"chart":"changed"}' }));
  assert.notEqual(changedChart.content.semanticVersionId, first.content.semanticVersionId);
  const changedSource = buildReportSemanticContent(fixture({ sourceTwo: 'source-two-changed' }));
  assert.notEqual(changedSource.content.semanticVersionId, first.content.semanticVersionId);

  assert.equal(first.content.interpretationLayer.state, 'NONE');
  assert.deepEqual(first.content.interpretationLayer.artifacts, []);
  const review = buildUnreviewedReportState(first.content.semanticVersionId);
  assert.equal(review.state.semanticVersionId, first.content.semanticVersionId);
  assert.equal(review.state.state, 'UNREVIEWED');
  assert.deepEqual(review.state.decisionArtifacts, []);
  assert.ok(!first.contentBytes.includes(Buffer.from('OWNER APPROVED')));

  const corrupt = fixture();
  const corruptFiles = new Map(corrupt.files);
  corruptFiles.set('charts.json', Buffer.from('{"chart":"tampered"}\n'));
  assert.throws(() => buildReportSemanticContent({ ...corrupt, files: corruptFiles }), /CHART_DIGEST_MISMATCH/);

  const mismatchedPacket = fixture();
  assert.throws(() => buildReportSemanticContent({
    ...mismatchedPacket,
    packet: {
      ...mismatchedPacket.packet,
      sections: [{ ...mismatchedPacket.packet.sections[0]!, deliveryState: 'BLOCKED' }],
    },
  }), /PACKET_OBJECT_BYTES_MISMATCH/);
});

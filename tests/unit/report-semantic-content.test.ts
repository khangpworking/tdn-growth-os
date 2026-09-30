import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { buildReportSemanticContent, buildUnreviewedReportState } from '../../src/modules/analysis/report-semantic-content.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchChartSpec } from '../../src/modules/analysis/research-chart-spec.js';
import type { ResearchReportChartData } from '../../src/modules/analysis/research-report-charts.js';

// Test-authoring gate: this unit owns semantic identity, which the export
// lifecycle cannot isolate from rendering. It must fail if renderer-only bytes
// enter content identity or if source/calculation bytes stop affecting it.
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(Buffer.from(label));
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function fixture(options: {
  readonly report?: string; readonly chart?: string; readonly sourceTwo?: string;
  readonly resultRenderer?: string; readonly packetRenderer?: string; readonly prettyCatalog?: boolean;
} = {}): SourceBackedReportBundle {
  const packetId = digest(`packet-id:${options.packetRenderer ?? 'report-packet-vi-v1'}`);
  const input = { input: 'exact' };
  const inputBytes = canonicalBytes(input);
  const result = { rendererVersion: options.resultRenderer ?? 'metric-draft-vi-v1', result: 'exact' };
  const resultBytes = canonicalBytes(result);
  const catalog = {
    catalog: 'exact',
    sections: [{ sectionId: 'M03', title: 'Observed totals', methodId: 'fixture-method', methodVersion: '1.0.0' }],
  };
  const catalogBytes = options.prettyCatalog
    ? Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    : canonicalBytes(catalog);
  const catalogSha256 = sha256(catalogBytes);
  const metricResultSha256 = sha256(resultBytes);
  const packet = {
    packetId,
    policyVersion: 'report-packet-a3a-v1',
    rendererVersion: options.packetRenderer ?? 'report-packet-vi-v1',
    metricMethodVersion: 'metric-scope-v1',
    metricRounding: 'percent-half-even-2-v1',
    metricResultSha256,
    catalogSha256,
    catalog,
    claims: [],
    sections: [{
      sectionId: 'M03', deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
      sectionSha256: digest(`section:${metricResultSha256}`),
      claimIds: [], contextPointers: [], blockers: [],
    }],
  } as never;
  const packetBytes = canonicalBytes(packet);
  const scopeKeys = ['all', 'wide', 'core'] as const;
  const blocker = options.chart ?? 'FIXTURE_BLOCKED';
  const chartLane = (scopeKey: typeof scopeKeys[number]) => ({
    scopeKey, state: 'BLOCKED' as const, points: [], blockers: [`${scopeKey}:${blocker}`],
  });
  const totalPoint = {
    metric: 'revenue' as const,
    claimId: 'M03:all:revenue',
    sectionId: 'M03',
    resultSha256: metricResultSha256,
    value: '1', valueText: '1', unit: 'VND' as const, percentText: null, basisPoints: null,
    source: {
      scopeKey: 'all' as const, reportScopeKey: 'fixture', platform: 'shopee' as const, selection: 'ON' as const,
      period: { start: '2026-01-01', end: '2026-01-31', periodBasis: 'Fixture period', acquiredAt: null },
    },
    metricPointer: '/result', scopePointer: '/result', membershipPointer: '/result', coveragePointer: null,
    denominatorPointer: null, numeratorPointer: null, denominator: null, numerator: null, limits: [],
  };
  const charts: ResearchReportChartData = {
    contractVersion: 'research-report-charts-v2',
    approvalState: 'UNREVIEWED',
    resultSha256: metricResultSha256,
    catalogSha256,
    sourcePeriod: {
      start: '2026-01-01', end: '2026-01-31', periodBasis: 'Fixture period', acquiredAt: null,
    },
    computation: {
      inputSha256: digest('input'), methodVersion: 'metric-scope-v1', rounding: 'percent-half-even-2-v1',
      rendererVersion: options.resultRenderer ?? 'metric-draft-vi-v1', profileId: 'fixture', labelCodebookVersion: 'fixture',
      wideUnknownPolicy: 'exclude',
    },
    scopeKeys,
    totals: {
      chartId: 'scope-totals', sectionId: 'M03', sectionDeliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
      state: 'PARTIAL', exactMethodHandler: true, relationship: 'OVERLAPPING_NON_ADDITIVE',
      scopes: [
        { scopeKey: 'all', state: 'PARTIAL', points: [totalPoint], blockers: [] },
        chartLane('wide'), chartLane('core'),
      ],
      blockers: [blocker],
    },
    topShopShare: {
      chartId: 'top-shop-share', sectionId: 'M04', sectionDeliveryState: null,
      state: 'BLOCKED', exactMethodHandler: false, relationship: 'CUMULATIVE_OVERLAPPING_NOT_DONUT',
      scopes: scopeKeys.map(chartLane), blockers: [blocker],
    },
    scopeSensitivity: {
      chartId: 'scope-membership-sensitivity', sectionId: 'M03', state: 'BLOCKED', exactMethodHandler: true,
      relationship: 'FILTER_MEMBERSHIP_EFFECT_NOT_GROWTH', comparisons: [], blockers: [blocker],
    },
    groupComposition: {
      chartId: 'group-composition', sectionId: 'M04', state: 'BLOCKED', exactMethodHandler: false,
      relationship: 'WITHIN_SCOPE_COMPOSITION_OVERLAPPING_SCOPES', scopes: scopeKeys.map(chartLane), blockers: [blocker],
    },
    topShopRemoval: {
      chartId: 'top-shop-removal-sensitivity', sectionId: 'M04', state: 'BLOCKED', exactMethodHandler: false,
      relationship: 'LEADER_REMOVAL_SENSITIVITY_NOT_FORECAST',
      scopes: scopeKeys.map(scopeKey => ({ scopeKey, state: 'BLOCKED', point: null, blockers: [`${scopeKey}:${blocker}`] })),
      blockers: [blocker],
    },
    blockers: [blocker],
  };
  const chartBytes = canonicalBytes(charts);
  const chartSpec = buildResearchChartSpec(charts, chartBytes);
  const envelope = {
    contractVersion: 'source-backed-report-v1',
    request: { catalogSha256 } as never,
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
      chartSpecSha256: sha256(chartSpec.bytes),
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
    ['chart-spec.json', chartSpec.bytes],
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
    chartSpec: chartSpec.spec,
    files,
  };
}

test('semantic identity binds exact evidence and calculations but not renderer or review state', () => {
  const first = buildReportSemanticContent(fixture());
  const same = buildReportSemanticContent(fixture());
  assert.equal(same.content.semanticVersionId, first.content.semanticVersionId);
  assert.deepEqual(same.contentBytes, first.contentBytes);
  const { semanticVersionId: _semanticVersionId, ...semanticPayload } = first.content;
  assert.equal(first.content.semanticVersionId, sha256(Buffer.from(canonicalJson(semanticPayload), 'utf8')));
  assert.notEqual(first.content.semanticVersionId, sha256(canonicalBytes(semanticPayload)));
  assert.match(first.content.calculationLayer.chartSpecContentSha256, /^[0-9a-f]{64}$/);

  const rendererOnly = buildReportSemanticContent(fixture({ report: 'renderer B' }));
  assert.equal(rendererOnly.content.semanticVersionId, first.content.semanticVersionId);
  const resultRendererOnly = buildReportSemanticContent(fixture({ resultRenderer: 'metric-draft-vi-v2' }));
  assert.equal(resultRendererOnly.content.semanticVersionId, first.content.semanticVersionId);
  const packetRendererOnly = buildReportSemanticContent(fixture({ packetRenderer: 'report-packet-vi-v2' }));
  assert.equal(packetRendererOnly.content.semanticVersionId, first.content.semanticVersionId);
  const catalogFormattingOnly = buildReportSemanticContent(fixture({ prettyCatalog: true }));
  assert.equal(catalogFormattingOnly.content.semanticVersionId, first.content.semanticVersionId);
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

  const corruptSpec = fixture();
  const corruptSpecFiles = new Map(corruptSpec.files);
  corruptSpecFiles.set('chart-spec.json', Buffer.from('{"chartSpecId":"tampered"}\n'));
  assert.throws(() => buildReportSemanticContent({ ...corruptSpec, files: corruptSpecFiles }), /CHART_SPEC_DIGEST_MISMATCH/);

  const mismatchedPacket = fixture();
  assert.throws(() => buildReportSemanticContent({
    ...mismatchedPacket,
    packet: {
      ...mismatchedPacket.packet,
      sections: [{ ...mismatchedPacket.packet.sections[0]!, deliveryState: 'BLOCKED' }],
    },
  }), /PACKET_OBJECT_BYTES_MISMATCH/);
});

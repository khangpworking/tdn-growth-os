import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildResearchReportChartData } from '../../src/modules/analysis/research-report-charts.js';
import { buildResearchChartSpec } from '../../src/modules/analysis/research-chart-spec.js';
import { createResearchReportPacket, type ReportMethodArtifact } from '../../src/modules/analysis/versioned-report-packet.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import {
  auditReportFlint,
  type FlintAssemblyInput,
  type FlintAssemblerSet,
  type ReportFlintAuditRequest,
} from '../../src/modules/analysis/report-flint-audit.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

// Test-authoring gate: this test owns the injected-compiler boundary. It
// protects the independently observable receipt status, exact source pins and
// fail-closed category/aggregation audit. A credible regression is a Flint
// upgrade or adapter edit that silently truncates categories, adds stacking or
// calls a blocked section. Existing tests cover ChartData/ChartSpec semantics,
// but cannot observe compiler output or this separate receipt. No production
// test seam is exported; the compiler is an explicit offline dependency.
const bytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const sha = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

function request(
  overrides: Partial<ReportFlintAuditRequest> = {},
  input = metricFixture(),
  methodArtifacts: readonly ReportMethodArtifact[] = [],
): ReportFlintAuditRequest {
  const metricResult = calculateMetricScopes(input);
  const metricBytes = bytes(metricResult);
  const catalogBytes = bytes(catalog);
  const catalogSha = sha(catalogBytes);
  const packet = createResearchReportPacket(metricBytes, sha(metricBytes), catalogBytes, catalogSha, methodArtifacts);
  const packetBytes = bytes(packet.packet);
  const normalizedInputBytes = bytes(metricResult.input);
  const result = buildResearchReportChartData(metricBytes, sha(metricBytes), catalogBytes, catalogSha);
  const chartDataBytes = bytes(result);
  const chartSpec = buildResearchChartSpec(result, chartDataBytes).spec;
  const chartSpecBytes = bytes(chartSpec);
  return {
    chartData: result,
    chartDataBytes,
    chartSpec,
    chartSpecBytes,
    normalizedInputBytes,
    metricResultBytes: metricBytes,
    catalogBytes,
    packetBytes,
    sourcePins: {
      workspaceSnapshotSha256: '1'.repeat(64), sourcePackageManifestSha256: '2'.repeat(64),
      sourcePackageContentSha256: '3'.repeat(64), normalizedInputArtifactSha256: sha(normalizedInputBytes),
      normalizedInputValueSha256: metricResult.inputSha256, metricResultSha256: sha(metricBytes), catalogSha256: catalogSha,
      packetSha256: sha(packetBytes), chartDataSha256: sha(chartDataBytes), chartSpecSha256: sha(chartSpecBytes),
      assemblySha256: '7'.repeat(64), readinessSha256: '8'.repeat(64), descriptiveMethodOutputId: null,
    },
    sections: [
      { sectionId: 'M03', readinessState: 'READY_TO_CALCULATE', deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT', materialized: true, sectionSha256: '9'.repeat(64), blockers: [] },
      { sectionId: 'M04', readinessState: 'READY_TO_CALCULATE', deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT', materialized: true, sectionSha256: 'a'.repeat(64), blockers: [] },
      { sectionId: 'M05', readinessState: 'BLOCKED', deliveryState: 'METHOD_ONLY', materialized: false, sectionSha256: 'b'.repeat(64), blockers: ['DOMAIN_EVIDENCE_REQUIRED'] },
    ],
    ...overrides,
  };
}

function goodOutput(input: FlintAssemblyInput): unknown {
  return { data: { values: input.data.values } };
}

function realisticBackendOutput(input: FlintAssemblyInput): Record<string, unknown> {
  const categoryField = input.chart_spec.encodings.x.field;
  const valueField = input.chart_spec.encodings.y.field;
  return {
    xAxis: { type: 'category', data: input.data.values.map(row => row[categoryField]) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', name: valueField, data: input.data.values.map(row => row[valueField]) }],
  };
}

function assemblers(output: (input: FlintAssemblyInput) => unknown): FlintAssemblerSet {
  return {
    runtime: { name: 'flint-chart', version: '0.5.1', npmGitHead: '34ef4516554b323a740a426bd1a1e6ba31ee8245' },
    assembleVegaLite: output, assembleECharts: output, assembleChartjs: output, assemblePlotly: output,
  };
}

test('authors M03/M04 from existing ChartSpec and rejects compiler data loss without touching blocked M05', () => {
  const audit = auditReportFlint(request(), assemblers(goodOutput));
  assert.equal(audit.receipt.status, 'PASS');
  assert.deepEqual(audit.receipt.variants.map(item => [item.variantId, item.state]), [
    ['M03_SCOPE_TOTALS_REVENUE', 'COMPILED'], ['M04_TOP_SHOP_SHARE_ALL', 'COMPILED'],
  ]);
  assert.equal(audit.receipt.providerCalls, 0);
  assert.equal(audit.receipt.inputs.chartDataSha256, request().sourcePins.chartDataSha256);

  const forgedPin = request();
  assert.throws(
    () => auditReportFlint({
      ...forgedPin,
      sourcePins: { ...forgedPin.sourcePins, metricResultSha256: 'e'.repeat(64) },
    }, assemblers(goodOutput)),
    /retained provenance bytes do not match source pins/,
  );

  const methodArtifactAudit = auditReportFlint(request({}, metricFixture(), [{
    sectionId: 'M02', methodVersion: '2.0.0', fileName: 'm02-scope-method.json',
    sha256: 'f'.repeat(64), methodOutputId: 'e'.repeat(64),
  }]), assemblers(goodOutput));
  assert.equal(methodArtifactAudit.receipt.status, 'PASS', 'packet methodArtifact version comes from catalog transport');

  const unsafeInput = metricFixture();
  unsafeInput.records[0] = {
    ...unsafeInput.records[0]!,
    revenue: { ...unsafeInput.records[0]!.revenue, value: '9007199254740992', displayedValue: '9007199254740992' },
  };
  const unsafeAudit = auditReportFlint(request({}, unsafeInput), assemblers(goodOutput));
  const unsafeM03 = unsafeAudit.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE');
  assert.equal(unsafeM03?.state, 'BLOCKED');
  assert.ok(unsafeM03?.blockers.includes('UNSAFE_NUMBER:scope-totals-revenue:0'));

  const descriptiveFixture = descriptiveMarketFixture();
  const descriptiveMethods = buildDescriptiveMarketMethods({
    ...descriptiveFixture.descriptor,
    sourcePackage: {
      packageId: '00000000-0000-4000-8000-000000000001', version: 1,
      manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64),
    },
  }).output;
  const descriptiveBase = request();
  const descriptiveAudit = auditReportFlint(request({
    descriptiveMethods,
    sourcePins: {
      ...descriptiveBase.sourcePins, sourcePackageManifestSha256: 'c'.repeat(64), sourcePackageContentSha256: 'd'.repeat(64),
      descriptiveMethodOutputId: descriptiveMethods.methodOutputId,
    },
    sections: descriptiveBase.sections.map(section => section.sectionId === 'M05'
      ? { ...section, readinessState: 'READY_TO_CALCULATE' as const, deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT' as const, materialized: true, blockers: [] }
      : section),
  }), assemblers(goodOutput));
  const descriptiveM05 = descriptiveAudit.receipt.variants.filter(item => item.sectionId === 'M05');
  assert.ok(descriptiveM05.length > 0);
  assert.ok(descriptiveM05.every(item => item.state === 'BLOCKED'));
  assert.ok(descriptiveM05.some(item => item.blockers.some(blocker => blocker.startsWith('M05_ENTITY_LABEL_MISSING:'))));

  const labeledMethods = buildDescriptiveMarketMethods({
    ...descriptiveMethods.input,
    m05: descriptiveMethods.input.m05.map((row, index) => ({
      ...row,
      entityLabel: `Entity ${index + 1}`,
    })),
  }).output;
  const labeledAudit = auditReportFlint(request({
    descriptiveMethods: labeledMethods,
    sourcePins: {
      ...descriptiveBase.sourcePins, sourcePackageManifestSha256: 'c'.repeat(64), sourcePackageContentSha256: 'd'.repeat(64),
      descriptiveMethodOutputId: labeledMethods.methodOutputId,
    },
    sections: descriptiveBase.sections.map(section => section.sectionId === 'M05'
      ? { ...section, readinessState: 'READY_TO_CALCULATE' as const, deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT' as const, materialized: true, blockers: [] }
      : section),
  }), assemblers(goodOutput));
  const labeledM05 = labeledAudit.receipt.variants.find(item => item.sectionId === 'M05');
  assert.equal(labeledM05?.state, 'COMPILED', 'valid /input/m05 pointers must resolve before testing numeric or label blockers');
  assert.deepEqual(labeledM05?.expected.map(item => item.valueText).sort(), ['12', '8']);

  const exponentMethods = buildDescriptiveMarketMethods({
    ...labeledMethods.input,
    m05: labeledMethods.input.m05.map((row, index) => ({
      ...row,
      observation: { ...row.observation, value: index === 0 ? '0.0000001' : row.observation.value },
    })),
  }).output;
  const exponentAudit = auditReportFlint(request({
    descriptiveMethods: exponentMethods,
    sourcePins: {
      ...descriptiveBase.sourcePins, sourcePackageManifestSha256: 'c'.repeat(64), sourcePackageContentSha256: 'd'.repeat(64),
      descriptiveMethodOutputId: exponentMethods.methodOutputId,
    },
    sections: descriptiveBase.sections.map(section => section.sectionId === 'M05'
      ? { ...section, readinessState: 'READY_TO_CALCULATE' as const, deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT' as const, materialized: true, blockers: [] }
      : section),
  }), assemblers(input => {
    if (input.semantic_types.observation === 'CategoryCode') throw new Error('M05 should not invoke compiler');
    return goodOutput(input);
  }));
  const exponentM05 = exponentAudit.receipt.variants.find(item => item.sectionId === 'M05');
  assert.equal(exponentM05?.state, 'BLOCKED');
  assert.ok(exponentM05?.blockers.some(blocker => blocker.startsWith('UNSAFE_NUMBER:M05:')));
  assert.ok(exponentM05?.expected.some(item => item.valueText === '0.0000001' && item.value === null));

  const shaped = auditReportFlint(request(), assemblers(realisticBackendOutput));
  const shapedM03 = shaped.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE');
  assert.equal(shapedM03?.state, 'COMPILED');
  for (const backend of ['vegaLite', 'echarts', 'chartjs', 'plotly'] as const) {
    assert.equal(shapedM03?.backends[backend]?.state, 'PASS');
    assert.deepEqual(shapedM03?.backends[backend]?.duplicateCategories, []);
  }

  const mixed = auditReportFlint(request(), {
    ...assemblers(realisticBackendOutput),
    assembleVegaLite: input => ({ ...realisticBackendOutput(input), optional: undefined }),
    assembleECharts: input => ({ ...realisticBackendOutput(input), formatter: () => 'callback' }),
  });
  const mixedM03 = mixed.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE');
  assert.equal(mixedM03?.state, 'COMPILED', 'supported declarative backends remain independently usable');
  assert.equal(mixedM03?.backends.vegaLite?.state, 'PASS', 'optional undefined properties are omitted for declarative JSON');
  assert.equal(mixedM03?.backends.echarts?.state, 'UNSUPPORTED');
  assert.equal(mixedM03?.backends.echarts?.error, 'UNSUPPORTED_CALLBACK_OUTPUT');
  assert.equal(mixedM03?.backends.chartjs?.state, 'PASS');
  assert.equal(mixedM03?.backends.plotly?.state, 'PASS');

  let calls = 0;
  const overflow = (input: FlintAssemblyInput): unknown => {
    calls += 1;
    return {
      data: { values: input.data.values.slice(0, 2) },
      _warnings: [{ severity: 'warning', code: 'overflow', message: '1 value omitted' }],
    };
  };
  const rejected = auditReportFlint(request(), assemblers(overflow));
  assert.equal(rejected.receipt.status, 'REJECTED');
  assert.equal(rejected.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE')?.state, 'REJECTED');
  assert.ok(rejected.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE')?.backends.vegaLite?.missingCategories.length);
  assert.equal(calls, 8, 'only the two eligible variants invoke all four backends');

  const blocked = request({ sections: request().sections.map(section => section.sectionId === 'M03'
    ? { ...section, readinessState: 'BLOCKED' as const, blockers: ['BLOCKED_LABELS'] } : section) });
  const before = structuredClone(blocked.sections);
  const blockedAudit = auditReportFlint(blocked, assemblers(input => {
    if (input.semantic_types.scope === 'CategoryCode') throw new Error('blocked section invoked');
    return goodOutput(input);
  }));
  assert.equal(blockedAudit.receipt.status, 'PASS', 'M04 remains independently eligible');
  assert.equal(blockedAudit.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE')?.state, 'BLOCKED');
  assert.equal(blockedAudit.receipt.variants.find(item => item.variantId === 'M03_SCOPE_TOTALS_REVENUE')?.backends.vegaLite, undefined);
  assert.deepEqual(blocked.sections, before);
});

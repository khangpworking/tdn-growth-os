import assert from 'node:assert/strict';
import test from 'node:test';
import type { BoundedAnalysisGates } from '../../contracts/analysis/bounded-analysis-gates.generated.js';
import { buildBoundedAnalysisGates } from '../../src/modules/analysis/bounded-analysis-gates.js';
import { buildDecisionEvidencePackets } from '../../src/modules/analysis/decision-evidence-packets.js';
import { renderReportMethodPacketSection } from '../../src/modules/analysis/report-method-packets-pages.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';
import { decisionEvidencePacketsFixture } from '../helpers/decision-evidence-packets-fixture.js';

// Test-authoring gate: these tests own the report boundary's user-visible HTML.
// The method tests do not prove escaping, rendered state labels, section coverage,
// bundle paths, or display truncation because those contracts only exist here.

function existingResultInput(): BoundedAnalysisGates['input'] {
  const input = boundedAnalysisGatesFixture();
  const data = input.i16!;
  data.mode = 'EXISTING_RESULT';
  data.protocolRef = { ...data.source, locator: '/i16/protocol' };
  data.fields.attrition = 'None declared in supplied protocol';
  data.fields.estimator = 'Source-declared estimator';
  data.fields.missingRule = 'Source-declared no imputation';
  data.fields.uncertaintyRule = 'Source-declared uncertainty rule';
  data.fields.decisionRule = 'No business decision rule';
  data.outcomes = (['TREATMENT', 'COMPARATOR'] as const).map((arm, index) => ({
    source: { ...data.source, locator: `/i16/outcomes/${index}` }, arm,
    assignmentUnit: data.fields.assignmentUnit, outcome: data.fields.outcome,
    unit: data.fields.unit, window: data.fields.window,
    observation: { state: 'observed_value' as const, value: index === 0 ? '4' : '3' },
    denominator: { state: 'observed_value' as const, value: '10' },
  }));
  return input;
}

function bodyRowCount(html: string): number {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  assert.ok(body, 'expected one rendered table body');
  return (body.match(/<tr>/g) ?? []).length;
}

test('method pages escape retained source and owner text at every visible boundary', () => {
  const gatesInput = boundedAnalysisGatesFixture();
  gatesInput.m10!.source.logicalPath = '<gate>&"\'';
  const gates = buildBoundedAnalysisGates(gatesInput).output;
  const gateHtml = renderReportMethodPacketSection({ gates }, 'M10');
  assert.ok(gateHtml);
  assert.match(gateHtml, /&lt;gate&gt;&amp;&quot;&#39;/);
  assert.doesNotMatch(gateHtml, /<gate>/);

  const decisionsInput = decisionEvidencePacketsFixture();
  decisionsInput.question = { state: 'SUPPLIED', text: '<question>&"\'' };
  decisionsInput.ownerHypotheses = [{ label: '<group>', claimKeys: [], counterclaimKeys: [], missingEvidence: [] }];
  const decisions = buildDecisionEvidencePackets(decisionsInput).output;
  const decisionHtml = renderReportMethodPacketSection({ decisions }, 'M11');
  assert.ok(decisionHtml);
  assert.match(decisionHtml, /&lt;group&gt;/);
  assert.match(decisionHtml, /&lt;question&gt;&amp;&quot;&#39;/);
  assert.match(decisionHtml, /Vị trí claim hiện tại trong packet\.json/);
  assert.match(decisionHtml, /SHA-256 metric-result\.json/);
  assert.doesNotMatch(decisionHtml, /<group>/);
});

test('method pages preserve UNKNOWN, missing and observed-zero labels instead of filling values', () => {
  const input = boundedAnalysisGatesFixture();
  input.m10!.series[0]!.rows[2]!.observation = { state: 'UNKNOWN', value: null };
  input.i11!.cells[0]!.numerator = { state: 'observed_zero', value: '0' };
  input.i11!.cells[0]!.denominator = { state: 'missing', value: null };
  input.i12!.records[1]!.observation = { state: 'observed_zero', value: '0' };
  input.i12!.records[2]!.observation = { state: 'UNKNOWN', value: null };
  const output = buildBoundedAnalysisGates(input).output;

  assert.match(renderReportMethodPacketSection({ gates: output }, 'M10')!, /Chưa rõ \(UNKNOWN\)/);
  const i11 = renderReportMethodPacketSection({ gates: output }, 'I11')!;
  assert.match(i11, /Số 0 được quan sát/);
  assert.match(i11, /Thiếu giá trị \(missing\)/);
  const i12 = renderReportMethodPacketSection({ gates: output }, 'I12')!;
  assert.match(i12, /Số 0 được quan sát/);
  assert.match(i12, /Chưa rõ \(UNKNOWN\)/);
});

test('all nine method sections render and link only the combined evidence bundle', () => {
  const gates = buildBoundedAnalysisGates(boundedAnalysisGatesFixture()).output;
  const decisions = buildDecisionEvidencePackets(decisionEvidencePacketsFixture()).output;
  const sectionIds = ['M10', 'I11', 'I12', 'I16', 'M01', 'M11', 'M12', 'I14', 'I15'] as const;

  for (const sectionId of sectionIds) {
    const html = renderReportMethodPacketSection({ gates, decisions }, sectionId);
    assert.ok(html, sectionId);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert.ok(hrefs.length > 0, sectionId);
    assert.deepEqual([...new Set(hrefs)], ['report-method-evidence.json'], sectionId);
    assert.doesNotMatch(html, /descriptive-(?:market-input|market-methods|evidence-files)\.json/);
  }
});

test('method pages show null execution, estimate, conclusion, preference and authorization states', () => {
  const i16 = buildBoundedAnalysisGates(existingResultInput()).output;
  const i16Html = renderReportMethodPacketSection({ gates: i16 }, 'I16')!;
  assert.match(i16Html, /NOT_EXECUTED/);
  assert.match(i16Html, /Ước lượng và độ bất định chưa có \(null\)/);

  const decisions = buildDecisionEvidencePackets(decisionEvidencePacketsFixture()).output;
  assert.match(renderReportMethodPacketSection({ decisions }, 'M01')!, /Chưa có kết luận tổng hợp \(null\)/);
  assert.match(renderReportMethodPacketSection({ decisions }, 'I15')!, /Chưa có phương án ưu tiên \(null\)/);
  const m12 = renderReportMethodPacketSection({ decisions }, 'M12')!;
  assert.match(m12, /chosen: null/);
  assert.match(m12, /executionAuthorization: null/);
  assert.match(m12, /HUMAN_REVIEW_REQUIRED/);
});

test('method pages cap rendered rows and owner options at twenty while retaining a combined download link', () => {
  const gatesInput = boundedAnalysisGatesFixture();
  const series = gatesInput.m10!.series[0]!;
  series.period = { start: '2026-01-01', end: '2026-01-21' };
  series.splits = {
    train: { start: '2026-01-01', end: '2026-01-10' },
    validation: { start: '2026-01-11', end: '2026-01-15' },
    holdout: { start: '2026-01-16', end: '2026-01-21' },
  };
  series.rows = Array.from({ length: 21 }, (_, index) => ({
    source: { ...series.rows[index % 6]!.source, locator: `/m10/series/0/rows/${index}` },
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    observation: { state: 'observed_value' as const, value: String(index + 1) },
  }));
  const gates = buildBoundedAnalysisGates(gatesInput).output;
  const m10 = renderReportMethodPacketSection({ gates }, 'M10')!;
  assert.equal(bodyRowCount(m10), 20);
  assert.match(m10, /Đang hiển thị 20 trong 21 mục/);
  assert.match(m10, /href="report-method-evidence\.json" download/);

  const decisionsInput = decisionEvidencePacketsFixture();
  const unset = () => ({ state: 'UNSET' as const, text: null });
  decisionsInput.ownerOptions = Array.from({ length: 21 }, (_, index) => ({
    label: `Option ${index + 1}`, claimKeys: [], counterclaimKeys: [], missingEvidence: [],
    constraints: { cost: unset(), capability: unset(), time: unset(), risk: unset() },
  }));
  const decisions = buildDecisionEvidencePackets(decisionsInput).output;
  const i15 = renderReportMethodPacketSection({ decisions }, 'I15')!;
  assert.match(i15, /Đang hiển thị 20 trong 21 mục/);
  assert.match(i15, /Option 20/);
  assert.doesNotMatch(i15, /Option 21/);
});

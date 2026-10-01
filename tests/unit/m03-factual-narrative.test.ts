import assert from 'node:assert/strict';
import test from 'node:test';
import { buildM03ChartBundle } from '../../src/modules/analysis/m03-chart-bundle.js';
import { renderM03FactualNarrative } from '../../src/modules/analysis/m03-factual-narrative.js';
import { buildM03NarrativeEvidence } from '../../src/modules/analysis/m03-narrative-evidence.js';
import { m03VerifiedMetricSetFixture } from '../fixtures/m03-verified-metric-set-synthetic.js';

// Test-authoring gate: one behavior owner for deterministic factual prose.
// AI interpretation and report rendering are explicitly outside this test.
test('renders stable factual Vietnamese prose from cited claims without converting missing to zero', () => {
  const metricSet = m03VerifiedMetricSetFixture();
  const chartBundle = buildM03ChartBundle({
    contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1',
    metricSetSha256: metricSet.metricSetSha256,
  }, metricSet);
  const envelope = buildM03NarrativeEvidence({
    contractVersion: '1.0.0', sectionId: 'M03', profile: 'm03-narrative-evidence-v1',
    metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
  }, metricSet, chartBundle);
  const request = {
    contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-factual-narrative-vi-v1',
    envelopeSha256: envelope.envelopeSha256,
  };
  const first = renderM03FactualNarrative(request, envelope, metricSet, chartBundle);
  assert.deepEqual(renderM03FactualNarrative(request, structuredClone(envelope), structuredClone(metricSet), structuredClone(chartBundle)), first);
  assert.equal(first.paragraphs.length, 6);
  const all = first.paragraphs.find(paragraph => paragraph.paragraphId === 'scope-all');
  const wide = first.paragraphs.find(paragraph => paragraph.paragraphId === 'scope-wide');
  assert.match(all?.text ?? '', /doanh thu quan sát chưa đủ dữ liệu để tính/);
  assert.doesNotMatch(all?.text ?? '', /0 VND/);
  assert.match(wide?.text ?? '', /doanh thu quan sát là 0 VND/);
  assert.equal(first.status, 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED');

  const tampered = structuredClone(envelope);
  tampered.claims[0].value = '999';
  assert.throws(() => renderM03FactualNarrative(request, tampered, metricSet, chartBundle), /identity/);
  assert.throws(() => renderM03FactualNarrative({ ...request, tone: 'confident' }, envelope, metricSet, chartBundle), /Invalid M03 factual narrative request/);
});

import { buildM03ChartBundle } from '../../src/modules/analysis/m03-chart-bundle.js';
import { renderM03FactualNarrative } from '../../src/modules/analysis/m03-factual-narrative.js';
import { buildM03NarrativeEvidence } from '../../src/modules/analysis/m03-narrative-evidence.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { m03VerifiedMetricSetFixture, syntheticSha } from './m03-verified-metric-set-synthetic.js';

export function m03SectionArtifactChainFixture(sourceLabel = 'Synthetic') {
  const metricSet = m03VerifiedMetricSetFixture();
  if (sourceLabel !== metricSet.sources[0]?.label) {
    metricSet.sources[0]!.label = sourceLabel;
    const { metricSetSha256: _discarded, ...content } = metricSet;
    metricSet.metricSetSha256 = syntheticSha(canonicalJson(content));
  }
  const chartBundle = buildM03ChartBundle({
    contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1',
    metricSetSha256: metricSet.metricSetSha256,
  }, metricSet);
  const envelope = buildM03NarrativeEvidence({
    contractVersion: '1.0.0', sectionId: 'M03', profile: 'm03-narrative-evidence-v1',
    metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
  }, metricSet, chartBundle);
  const narrative = renderM03FactualNarrative({
    contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-factual-narrative-vi-v1',
    envelopeSha256: envelope.envelopeSha256,
  }, envelope, metricSet, chartBundle);
  return { metricSet, chartBundle, envelope, narrative };
}

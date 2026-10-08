import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
test('verified owning-method bindings are report-specific and are idempotent without inventing other registry sources', () => {
  const empty = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = { metricMethods: { originalSourcePackage: { manifestArtifactSha256: 'a'.repeat(64) } },
    nativeReview: { nativeSource: { sourcePackage: { manifestArtifactSha256: 'b'.repeat(64) } } } } as Parameters<typeof sourceEvidenceForReport>[1];
  const market = sourceEvidenceForReport(empty, input, 'MARKET');
  assert.deepEqual(market.sourceAppendix.rows.map(row => [row.registryId, row.binding.ref]), [['S01', 'a'.repeat(64)]]);
  const insight = sourceEvidenceForReport(empty, input, 'INSIGHT');
  assert.deepEqual(insight.sourceAppendix.rows.map(row => [row.registryId, row.binding.ref]), [['S27', 'b'.repeat(64)]]);
  assert.deepEqual(sourceEvidenceForReport(insight, input, 'INSIGHT'), insight);
  assert.deepEqual(sourceEvidenceForReport(empty, { collection: null }, 'INSIGHT'), empty);
});

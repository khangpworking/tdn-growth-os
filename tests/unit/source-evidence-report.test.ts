import assert from 'node:assert/strict';
import test from 'node:test';
import type { CaptureRecord } from '../../src/modules/analysis/research-automation/model.js';
import { buildSourceEvidence, sourceEvidenceForReport, verifySourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { syntheticSearchInterest } from '../helpers/search-interest-synthetic.js';
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

const trendsCapture = (over: Partial<CaptureRecord> = {}): CaptureRecord => ({ stepId: 'COLLECTION', ordinal: 1, artifactSha256: 'c'.repeat(64), mediaType: 'application/json',
  provider: 'serpapi', operation: 'serpapi.google.trends', retrievedAt: '2026-10-02T00:00:00.000Z', window: null, truncated: false, ...over });
const base = () => buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
const withInterest = (searchInterest: ReturnType<typeof syntheticSearchInterest>, captures: readonly CaptureRecord[] = [trendsCapture()]) =>
  ({ collection: { searchInterest }, captures }) as unknown as Parameters<typeof sourceEvidenceForReport>[1];

test('search interest (S20) is used only when the Market report draws the stored series', () => {
  const empty = base();
  const market = sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest()), 'MARKET');
  assert.deepEqual(market.sourceAppendix.rows.map(row => [row.registryId, row.binding.kind, row.binding.ref, row.l10SourceType]), [['S20', 'capture', 'c'.repeat(64), null]]);
  assert.deepEqual(sourceEvidenceForReport(market, withInterest(syntheticSearchInterest()), 'MARKET'), market, 'idempotent: no duplicate use');
  assert.deepEqual(sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest()), 'INSIGHT'), empty, 'Insight draws no series');
  for (const unused of [syntheticSearchInterest({ status: 'FAILED', reason: 'PROVIDER_FAILED', points: [] }), syntheticSearchInterest({ status: 'SKIPPED', reason: 'PERIOD_NOT_COVERED', captureIndex: null, points: [] }),
    syntheticSearchInterest({ captureIndex: null }), syntheticSearchInterest({ points: syntheticSearchInterest().points.slice(0, 3) })])
    assert.deepEqual(sourceEvidenceForReport(empty, withInterest(unused), 'MARKET'), empty, unused.status);
  assert.deepEqual(sourceEvidenceForReport(empty, { collection: {} } as Parameters<typeof sourceEvidenceForReport>[1], 'MARKET'), empty, 'a run without the field');
});

test('search interest (S20) sits beside the sales source and keeps its own appendix row', () => {
  const input = { ...withInterest(syntheticSearchInterest()), metricMethods: { originalSourcePackage: { manifestArtifactSha256: 'a'.repeat(64) } } } as Parameters<typeof sourceEvidenceForReport>[1];
  const market = sourceEvidenceForReport(base(), input, 'MARKET');
  assert.deepEqual(market.sourceAppendix.rows.map(row => row.registryId).sort(), ['S01', 'S20']);
  assert.ok(market.sourceAppendix.rows.every(row => row.l10SourceType === null || row.registryId === 'S07'), 'l10SourceType stays S07-only');
});

test('search interest (S20) needs its own trends capture in the collection step', () => {
  const empty = base();
  const lineage = /Search interest capture lineage is unavailable/;
  assert.throws(() => sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest(), []), 'MARKET'), lineage, 'no capture');
  assert.throws(() => sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest(), [trendsCapture({ operation: 'serpapi.google.search' })]), 'MARKET'), lineage, 'a web capture is not a trends capture');
  assert.throws(() => sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest(), [trendsCapture({ provider: 'kalodata' })]), 'MARKET'), lineage, 'another provider');
  assert.throws(() => sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest(), [trendsCapture({ stepId: 'QUICK_SEARCH' })]), 'MARKET'), lineage, 'another step');
  assert.throws(() => sourceEvidenceForReport(empty, withInterest(syntheticSearchInterest(), [trendsCapture({ ordinal: 2 })]), 'MARKET'), lineage, 'another ordinal');
});

test('a collection-time packet never marks search interest used, and a stored packet without it verifies byte-identically', () => {
  const captures = [trendsCapture()];
  const input = { draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE' as const, webResults: [], captures };
  const stored = buildSourceEvidence(input);
  assert.deepEqual(stored.sourceAppendix.rows, [], 'the trends capture alone adds no appendix row');
  assert.doesNotThrow(() => verifySourceEvidence(stored, input));
  assert.equal(JSON.stringify(stored), JSON.stringify(buildSourceEvidence({ ...input, captures: [] })), 'same bytes with or without a trends capture');
  const shown = sourceEvidenceForReport(stored, withInterest(syntheticSearchInterest(), captures), 'MARKET');
  assert.deepEqual(shown.sourceAppendix.rows.map(row => row.registryId), ['S20']);
  assert.deepEqual(stored.sourceAppendix.rows, [], 'the shown packet is a copy; the stored one is untouched');
});

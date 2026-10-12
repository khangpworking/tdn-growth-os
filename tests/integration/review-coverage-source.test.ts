import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AutomationMetricMethodBridge } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { readMetricReviewCoverageBoundary } from '../../src/modules/analysis/research-automation/review-coverage-selection.js';
import { metricCoverageFixture } from '../helpers/review-coverage-fixture.js';

for (const profile of ['v1', 'v2'] as const) test(`verified ${profile} original brand cell stays literal and operator dates cannot admit coverage`, async t => {
  const f = await metricCoverageFixture(t, profile);
  const original = await fs.readFile(f.artifacts.pathForDigest(f.snapshot.preparation.selectedSources.workbook.sha256));
  const before = f.db.prepare('SELECT total_changes() n').get();
  const cold = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts,
    workspaces: { readVerifiedWorkspace: async () => { throw new Error('Current workspace unavailable'); } },
    now: () => { throw new Error('Current clock unavailable'); } });
  const priorPath = process.env.PATH;
  f.artifacts.put = async () => { throw new Error('CAS writes unavailable'); };
  try {
    f.db.pragma('query_only=ON'); process.env.PATH = '/no-python-or-provider';
    const result = await readMetricReviewCoverageBoundary(f.reader, cold, f.snapshot, f.input);
    assert.equal(result.coverageAvailable, false);
    assert.equal(result.shortage, 'AUTHENTIC_MEASUREMENT_PERIOD_UNAVAILABLE');
    assert.equal(result.candidates[0]!.brand.value, '  Nhãn nguồn Đỏ  ');
    assert.equal(result.candidates[0]!.brand.source.locator, `Sheet1!${f.brandCell}`);
    assert.equal(result.candidates[0]!.brand.source.sourceSha256, f.snapshot.preparation.selectedSources.workbook.sha256);
    assert.equal(result.candidates[0]!.revenue.source.locator, 'Sheet1!E2');
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
    assert.deepEqual(await fs.readFile(f.artifacts.pathForDigest(f.snapshot.preparation.selectedSources.workbook.sha256)), original);
    await assert.rejects(readMetricReviewCoverageBoundary(f.reader, cold, f.snapshot,
      { ...f.input, scope: { ...f.input.scope, definition: 'Different scope' } }), /snapshot identity/);
  } finally { process.env.PATH = priorPath; f.db.pragma('query_only=OFF'); }
});

test('missing source brand remains missing; title and shop cannot fill its cell', async t => {
  const f = await metricCoverageFixture(t, 'v2', null);
  const result = await readMetricReviewCoverageBoundary(f.reader, f.bridge, f.snapshot, f.input);
  assert.equal(result.candidates[0]!.brand.value, null);
  assert.equal(result.candidates[0]!.brand.source.locator, 'Sheet1!F2');
  assert.equal(result.coverageAvailable, false);
});

test('actual workbook and retained typed receipt corruption reject warm source reads and restoration is exact', async t => {
  const f = await metricCoverageFixture(t);
  const expected = await readMetricReviewCoverageBoundary(f.reader, f.bridge, f.snapshot, f.input);
  for (const digest of [f.snapshot.preparation.selectedSources.workbook.sha256, f.snapshot.preparation.normalizationReceiptSha256]) {
    const physical = f.artifacts.pathForDigest(digest); const bytes = await fs.readFile(physical);
    try { await fs.writeFile(physical, 'corrupt'); await assert.rejects(readMetricReviewCoverageBoundary(f.reader, f.bridge, f.snapshot, f.input), /digest mismatch/); }
    finally { await fs.writeFile(physical, bytes); }
    assert.deepEqual(await readMetricReviewCoverageBoundary(f.reader, f.bridge, f.snapshot, f.input), expected);
  }
  const altered = { ...f.snapshot, originalSourcePackage: { ...f.snapshot.originalSourcePackage,
    packageId: '33333333-3333-4333-8333-333333333333' } };
  await assert.rejects(readMetricReviewCoverageBoundary(f.reader, f.bridge, altered, f.input));
});

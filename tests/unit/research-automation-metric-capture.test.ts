import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { validateMetricWebSnapshot } from '../../src/modules/analysis/research-automation/metric-web-snapshot.js';
import { MAX_METRIC_CAPTURE_BYTES, MetricCaptureRejection, verifyMetricCaptureArchive } from '../../src/modules/analysis/research-automation/metric-capture-intake.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const rawFixture = (): any => JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));

function snapshotFixture(): AutomationMetricWebSnapshotV1 {
  const snapshot = rawFixture();
  snapshot.captureId = 'capture-synthetic-209';
  snapshot.scope = {
    keywords: ['synthetic jar'], platforms: ['shopee', 'tiktok'],
    period: { startDate: '2026-01-01', endDate: '2026-01-29' }, category: null,
    ticks: [], advancedFilters: [], exclusions: [],
  };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
  const productColumns = ['name', 'shop', 'platform', 'revenue', 'units', 'category'];
  const cell = (label: string, text: string, pointer: string) => ({ label, text, sourcePointer: pointer });
  const value = (label: string, number: number | null, unit: 'VND' | 'COUNT', platform: 'shopee' | 'tiktok' | 'unknown') => ({
    label, displayed: number === null ? '–' : String(number), value: number, unit, precision: 'exact', platform,
    period: snapshot.scope.period, sourcePointer: `${platform}.${label}`,
  });
  snapshot.groups.W12_topProducts = {
    columns: productColumns,
    rows: [
      { cells: { name: cell('Tên', 'Synthetic A', 'products[0].name'), shop: cell('Shop', 'Shop A', 'products[0].shop'), platform: cell('Sàn', 'shopee', 'products[0].platform'), revenue: value('Doanh thu', 1200, 'VND', 'shopee'), units: value('Lượt bán', 3, 'COUNT', 'shopee'), category: cell('Ngành', 'Nhóm A', 'products[0].category') } },
      { cells: { name: cell('Tên', 'Synthetic B', 'products[1].name'), shop: cell('Shop', 'Shop B', 'products[1].shop'), platform: cell('Sàn', 'tiktok', 'products[1].platform'), revenue: value('Doanh thu', 800, 'VND', 'tiktok'), units: value('Lượt bán', 0, 'COUNT', 'tiktok'), category: cell('Ngành', 'Nhóm B', 'products[1].category') } },
      { cells: { name: cell('Tên', 'Synthetic unknown', 'products[2].name'), shop: cell('Shop', 'Shop ?', 'products[2].shop'), platform: cell('Sàn', 'unknown', 'products[2].platform'), revenue: value('Doanh thu', 500, 'VND', 'unknown'), units: value('Lượt bán', null, 'COUNT', 'unknown'), category: cell('Ngành', 'Nhóm ?', 'products[2].category') } },
    ],
  };
  return validateMetricWebSnapshot(snapshot);
}

function archive(snapshot: AutomationMetricWebSnapshotV1, captureGate?: unknown): { snapshot: Buffer; manifest: Buffer } {
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = {
    contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: snapshot.scope, resultCount: 3,
    productPagination: { cap: 3, totalShown: 5, pageSize: 3, pagesRead: 1, rowsRead: 3, truncated: true },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: hash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }],
    screenshotSkips: [], archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true,
    ...(captureGate === undefined ? {} : { captureGate }),
  };
  return { snapshot: snapshotBytes, manifest: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}

test('capture rows split platforms, preserve unknown attribution, and use stable synthetic IDs with honest nulls', () => {
  const snapshot = snapshotFixture();
  const first = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok']);
  const second = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok']);
  assert.deepEqual(first.rows.map(row => row.platform), ['shopee', 'tiktok']);
  assert.equal(first.unattributed.length, 1);
  assert.equal(first.rows[0]!.listingSynthetic, true);
  assert.equal(first.rows[0]!.listing, second.rows[0]!.listing);
  assert.equal(first.rows[0]!.start, null);
  assert.equal(first.rows[0]!.brand, '(không ghi)');
  assert.equal(first.rows[1]!.asp, null);
  assert.equal(first.unattributed[0]!.platform, 'unknown');
});

test('capture archive validates pretty JSON bytes and refuses digest, gate, schema, and size failures with typed codes', () => {
  const valid = archive(snapshotFixture());
  const checked = verifyMetricCaptureArchive(valid.snapshot, valid.manifest);
  assert.equal(checked.capture.truncation.rowsRead, 3);
  const wrongValue = JSON.parse(valid.snapshot.toString('utf8')); wrongValue.capturedAt = '2026-01-01T00:00:01Z';
  const wrongSnapshot = Buffer.from(JSON.stringify(wrongValue, null, 2) + '\n');
  assert.throws(() => verifyMetricCaptureArchive(wrongSnapshot, valid.manifest), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_DIGEST_MISMATCH');
  const uncleared = archive(snapshotFixture(), false);
  assert.throws(() => verifyMetricCaptureArchive(uncleared.snapshot, uncleared.manifest), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_GATE_NOT_CLEARED');
  const invalid = JSON.parse(valid.snapshot.toString('utf8')); invalid.groups.W12_topProducts.rows[0].cells.name = { wrong: true };
  const invalidBytes = Buffer.from(canonicalJson(invalid));
  const invalidManifest = JSON.parse(valid.manifest.toString('utf8')); invalidManifest.files[0].sha256 = hash(invalidBytes); invalidManifest.files[0].byteSize = invalidBytes.length;
  assert.throws(() => verifyMetricCaptureArchive(invalidBytes, Buffer.from(canonicalJson(invalidManifest))), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_SCHEMA_INVALID');
  assert.throws(() => verifyMetricCaptureArchive(Buffer.alloc(MAX_METRIC_CAPTURE_BYTES + 1), valid.manifest), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_OVERSIZE');
});

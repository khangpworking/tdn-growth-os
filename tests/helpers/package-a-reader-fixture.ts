import fs from 'node:fs/promises';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';
import { sync1ReaderFixture } from './sync1-reader-fixture.js';

/** Shared synthetic input for independent main/branch public-reader byte controls. */
export async function packageAReaderFixture(policy: 'automation-metric-capture-v1' | 'automation-metric-capture-v2') {
  const snapshot = JSON.parse(await fs.readFile(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as AutomationMetricWebSnapshotV1;
  snapshot.scope.keywords = ['bình thử'];
  snapshot.groups.W12_topProducts = { columns: ['name', 'shop', 'platform', 'category', 'revenue', 'units'], rows:
    (['shopee', 'tiktok'] as const).flatMap(platform => [
      { title: 'Bình thử nhỏ mẫu', revenue: 100, units: 1 },
      { title: 'Bình thử lớn mẫu', revenue: 200, units: 2 },
      { title: 'Nắp dùng cho bình thử mẫu', revenue: 100, units: 1 },
      { title: 'Bình thử thiếu đơn vị mẫu', revenue: 100, units: null },
      { title: 'Bình thử giá cao mẫu', revenue: 9000, units: 1 },
    ].map((row, i) => ({ cells: {
      name: { label: 'Tên', text: row.title, sourcePointer: `rows[${i}].name` },
      shop: { label: 'Gian hàng', text: `Gian hàng mẫu ${i}`, sourcePointer: `rows[${i}].shop` },
      platform: { label: 'Sàn', text: platform, sourcePointer: `rows[${i}].platform` },
      category: { label: 'Danh mục', text: 'Bình mẫu', sourcePointer: `rows[${i}].category` },
      revenue: { label: 'Doanh thu', value: row.revenue, displayed: String(row.revenue), unit: 'VND', precision: 'exact',
        platform, period: snapshot.scope.period, sourcePointer: `rows[${i}].revenue` },
      units: { label: 'Đơn vị', value: row.units, displayed: row.units === null ? '' : String(row.units), unit: 'COUNT', precision: 'exact',
        platform, period: snapshot.scope.period, sourcePointer: `rows[${i}].units` },
    } }))) };
  const projection = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], policy);
  const input = { ...sync1ReaderFixture(), rows: projection.rows };
  const report = await buildMarketReport(computeReaderReportData(input), {
    builtOn: '01/02/2026', flint: false, captureSource: true, limitations: [], captureExcludedRows: projection.excluded,
    ...(policy === 'automation-metric-capture-v2' ? { captureRowPolicy: policy } : {}),
  });
  return { html: report.html, readerJson: JSON.stringify(projection) };
}

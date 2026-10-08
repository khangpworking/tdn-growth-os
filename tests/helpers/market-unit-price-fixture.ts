import { createHash } from 'node:crypto';
import type { ReaderReportInput, UnitPriceObservation } from '../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { RetainedUnitPriceSource, UnitPricePacket } from '../../src/modules/analysis/reader-report/market-unit-prices.js';

export function unitPriceFixture(rows: readonly ReaderReportInput['rows'][number][]): { packet: UnitPricePacket; retained: RetainedUnitPriceSource[] } {
  const observations: UnitPriceObservation[] = rows.slice(0, 6).map((row, i) => {
    const kind = (['MASS', 'MASS', 'VOLUME', 'COUNT', 'DURABLE', 'COMBO'] as const)[i]!;
    return {
      platform: row.platform, listing: row.listing, variant: 'Biến thể đã lưu',
      category: { label: 'Nhóm quy cách thử', kind, massBasis: kind === 'MASS' ? i === 0 ? 'NET' : 'DRAINED' : 'NOT_APPLICABLE', countKind: kind === 'COUNT' ? 'viên' : null, specGroup: kind === 'DURABLE' ? 'inox, cùng kích thước đã lưu' : null },
      price: { value: (i + 1) * 10000, currency: 'VND', kind: 'LISTED', conditions: [] },
      quantity: { value: kind === 'DURABLE' || kind === 'COMBO' ? 1 : 200, unit: kind === 'MASS' ? 'g' : kind === 'VOLUME' ? 'ml' : kind === 'COUNT' ? 'count' : kind === 'DURABLE' ? 'item' : 'combo' },
      period: { start: '2026-01-01', end: '2026-01-31' },
    };
  });
  const bytes = Buffer.from(canonicalJson({ observations }));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { packet: { contractVersion: 'market-unit-prices-v1', sources: [{ sha256, role: 'LISTING_SPEC' }],
    records: observations.map((observation, i) => ({ rowI: rows[i]!.i, source: { sourceSha256: sha256, locator: `/observations/${i}` }, observation })) }, retained: [{ sha256, bytes }] };
}

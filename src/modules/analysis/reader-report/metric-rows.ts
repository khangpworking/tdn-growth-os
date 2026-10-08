// Rows for the reader report from an already-prepared marketplace product-list
// workbook (Sheet1, current 20-column profile). Read-only: the prepared package
// stays the source of truth; this only restates its rows for the reader page.
// A combined file is split by the "Mã sản phẩm" prefix (1__ Shopee, 8__ TikTok Shop).
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { METRIC_CURRENT_HEADERS, readMetricSheetRows, type MetricSheetCell } from '../metric-source-profile.js';
import type { ReaderPlatform } from './build.js';

export type ReaderRow = ReaderReportInput['rows'][number];
export class ReaderMetricRowsError extends Error {
  constructor(readonly code: string, readonly locator: string) { super(`${locator}: ${code}`); }
}

const PREFIX: Record<string, ReaderPlatform> = { '1': 'shopee', '8': 'tiktok' };
const NO_BRAND = new Set(['', 'no brand', 'none', 'oem']);
const col = (name: string): number => METRIC_CURRENT_HEADERS.indexOf(name);
const text = (cell: MetricSheetCell | undefined): string => (cell?.type === 'blank' ? '' : cell?.value ?? '');
const squash = (s: string): string => s.split(/\s+/).filter(Boolean).join(' ');

function amount(cell: MetricSheetCell | undefined, locator: string, legacy: boolean): number | null {
  const raw = text(cell).trim();
  if (raw === '') return legacy ? 0 : null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) throw new ReaderMetricRowsError('INVALID_AMOUNT', locator);
  return v;
}

function startDate(cell: MetricSheetCell | undefined): string | null {
  if (!cell || cell.type === 'blank') return null;
  const raw = text(cell).trim();
  // Spreadsheet date serials (1900 system) carry a date number format.
  if (cell.type === 'number' && /^\d+(\.\d+)?$/.test(raw) && Number(cell.numberFormatId) >= 14 && Number(cell.numberFormatId) <= 22) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const iso = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? iso : null;
}

/** Sheet1 row n+2 becomes row i = n. Fails closed on an unknown or undeclared marketplace. */
export function readerRowsFromMetricWorkbook(workbook: Buffer, platforms: readonly ReaderPlatform[], options: { version?: '1.0.0' | '1.2.0' } = {}): ReaderRow[] {
  const sheet = readMetricSheetRows(workbook);
  const header = sheet[0]?.cells.map(c => c.value);
  if (!header || header.join('\u0001') !== METRIC_CURRENT_HEADERS.join('\u0001'))
    throw new ReaderMetricRowsError('HEADER_MISMATCH', 'Sheet1!A1:T1');
  const at = {
    title: col('Tên sản phẩm'), units: col('Số đã bán'), rev: col('Doanh thu'), brand: col('Thương hiệu'),
    shopLink: col('Link shop'), id: col('Mã sản phẩm'), cat2: col('Ngành hàng cấp 2'), start: col('Ngày bắt đầu bán'), shopName: col('Tên shop'),
  };
  const rows: ReaderRow[] = [];
  for (const [n, line] of sheet.slice(1).entries()) {
    const r = n + 2, c = line.cells;
    const listing = text(c[at.id]).trim();
    const platform = PREFIX[listing.split('__')[0] ?? ''];
    if (!platform || !listing.includes('__')) throw new ReaderMetricRowsError('UNKNOWN_PLATFORM_PREFIX', `Sheet1!J${r}`);
    if (!platforms.includes(platform)) throw new ReaderMetricRowsError('UNDECLARED_PLATFORM', `Sheet1!J${r}`);
    const rev = amount(c[at.rev], `Sheet1!E${r}`, options.version === '1.0.0'), units = amount(c[at.units], `Sheet1!D${r}`, options.version === '1.0.0');
    const link = text(c[at.shopLink]).trim();
    const shop = link.replace(/\/+$/, '').split('/').pop()?.split('?')[0] ?? '';
    const brandRaw = squash(text(c[at.brand]));
    const title = squash(text(c[at.title]));
    if (!title) throw new ReaderMetricRowsError('BLANK_TITLE', `Sheet1!A${r}`);
    rows.push({
      i: n, platform, listing: listing.slice(0, 100), shop: (shop || listing).slice(0, 100),
      shopName: squash(text(c[at.shopName]) || shop).slice(0, 300),
      cat: (squash(text(c[at.cat2])) || '(trống)').slice(0, 300),
      rev, units, asp: rev !== null && units !== null && units > 0 ? Math.round(rev / units) : options.version === '1.0.0' ? 0 : null,
      brand: (NO_BRAND.has(brandRaw.toLowerCase()) ? '(không ghi)' : brandRaw).slice(0, 300),
      title: title.slice(0, 1000), start: startDate(c[at.start]),
    });
  }
  if (!rows.length) throw new ReaderMetricRowsError('NO_ROWS', 'Sheet1');
  for (const p of platforms) if (!rows.some(x => x.platform === p)) throw new ReaderMetricRowsError('DECLARED_PLATFORM_HAS_NO_ROWS', p);
  return rows;
}

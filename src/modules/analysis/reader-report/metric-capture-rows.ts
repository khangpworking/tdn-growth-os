import { createHash } from 'node:crypto';
import type { AutomationMetricWebSnapshotV1, Table, Value, Text } from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import type { ReaderPlatform } from './build.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { UNKNOWN_SHOP } from './market-charts.js';
import { ReaderMetricRowsError } from './metric-rows.js';

export type ReaderRow = ReaderReportInput['rows'][number];
export type MetricCaptureUnattributedRow = {
  readonly i: number;
  readonly platform: 'unknown';
  readonly listing: string;
  readonly listingSynthetic: true;
  readonly title: string;
  readonly shop: string;
  readonly rev: number | null;
  readonly units: number | null;
};

const NO_BRAND = '(không ghi)';
const squash = (value: string): string => value.split(/\s+/u).filter(Boolean).join(' ');
const isText = (value: Value | Text | undefined): value is Text => typeof value === 'object' && value !== null && 'text' in value;
const isValue = (value: Value | Text | undefined): value is Value => typeof value === 'object' && value !== null && 'value' in value;
const textCell = (value: Value | Text | undefined): string => isText(value) ? squash(value.text) : isValue(value) ? squash(value.displayed) : '';
const numberCell = (value: Value | Text | undefined): number | null => isValue(value) && typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0 ? value.value : null;
const hashId = (platform: string, title: string, shop: string): string =>
  `synthetic-${createHash('sha256').update(canonicalJson([platform, title, shop]), 'utf8').digest('hex').slice(0, 40)}`;

type CaptureTableRow = Table['rows'][number];
const rowCell = (row: CaptureTableRow, key: string): Value | Text | undefined => row.cells[key];

/**
 * Converts only the retained W12 product rows into reader rows. Unknown
 * attribution is returned separately so it can be displayed without entering
 * either platform's arithmetic.
 */
export function readerRowsFromMetricCapture(snapshot: AutomationMetricWebSnapshotV1, platforms: readonly ReaderPlatform[]): {
  readonly rows: ReaderRow[];
  readonly unattributed: MetricCaptureUnattributedRow[];
} {
  const table = snapshot.groups.W12_topProducts;
  if ('absent' in table || table.rows.length === 0) throw new ReaderMetricRowsError('NO_ROWS', 'groups.W12_topProducts');
  const rows: ReaderRow[] = [];
  const unattributed: MetricCaptureUnattributedRow[] = [];
  for (const [i, sourceRow] of table.rows.entries()) {
    const title = textCell(rowCell(sourceRow, 'name'));
    if (!title) throw new ReaderMetricRowsError('BLANK_TITLE', `groups.W12_topProducts.rows[${i}].name`);
    const platformText = textCell(rowCell(sourceRow, 'platform')).toLowerCase();
    const platform = platformText === 'shopee' || platformText === 'tiktok' || platformText === 'unknown' ? platformText : 'unknown';
    const shop = textCell(rowCell(sourceRow, 'shop')) || UNKNOWN_SHOP;
    const rev = numberCell(rowCell(sourceRow, 'revenue'));
    const units = numberCell(rowCell(sourceRow, 'units'));
    if (platform === 'unknown') {
      unattributed.push({ i, platform, listing: hashId(platform, title, shop), listingSynthetic: true,
        title: title.slice(0, 1000), shop: shop.slice(0, 300), rev, units });
      continue;
    }
    if (!platforms.includes(platform)) throw new ReaderMetricRowsError('UNDECLARED_PLATFORM', `groups.W12_topProducts.rows[${i}].platform`);
    const brandCell = rowCell(sourceRow, 'brand');
    const brand = textCell(brandCell) || NO_BRAND;
    const listing = hashId(platform, title, shop);
    rows.push({
      i, platform, listing, listingSynthetic: true, shop: shop.slice(0, 100), shopName: shop.slice(0, 300),
      cat: (textCell(rowCell(sourceRow, 'category')) || '(trống)').slice(0, 300),
      rev, units, asp: rev !== null && units !== null && units > 0 ? Math.round(rev / units) : null,
      brand: brand.slice(0, 300), title: title.slice(0, 1000), start: null,
    });
  }
  if (!rows.length) throw new ReaderMetricRowsError('NO_ATTRIBUTED_ROWS', 'groups.W12_topProducts');
  for (const platform of platforms) if (!rows.some(row => row.platform === platform))
    throw new ReaderMetricRowsError('DECLARED_PLATFORM_HAS_NO_ROWS', platform);
  return { rows, unattributed };
}

import type { AutomationMetricWebSnapshotV1 } from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';

/** App-side policy. Absence on a retained method means the original capture v1 semantics. */
export const CAPTURE_ROW_PROFILE = 'automation-metric-capture-v2' as const;
export type CaptureRowExclusionReason = 'NOT_MAIN_PRODUCT' | 'REVENUE_WITHOUT_UNITS' | 'UNIT_REVENUE_OUTLIER';

/** Counts in this cell are source strings; lifetime sold is never a period observation. */
export function splitCaptureNameCell(name: string, shop: string) {
  const match = /^(.*?)\s+([\d.,]+)\s+reviews\s+Total\s+sold\s+products:\s*([\d.,]+)\s+Created\s+date:\s*(\d{2}\/\d{4})\s*(.*)$/iu.exec(name);
  return match ? { title: match[1]!.trim(), shop: shop || match[5]!.trim(), reviews: match[2]!, lifetimeSold: match[3]!, createdMonth: match[4]! }
    : { title: name, shop, reviews: null, lifetimeSold: null, createdMonth: null };
}

const words = (text: string): string[] => text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
const prefixTerms = [
  'power bank', 'sạc dự phòng', 'sạc', 'pin', 'mô tơ', 'motor', 'moter', 'động cơ', 'tụ', 'dầu', 'cánh', 'lồng',
  'stator', 'bạc đạn', 'công tắc', 'điều khiển', 'remote', 'adapter', 'linh kiện', 'phụ kiện', 'nắp', 'ốp', 'vỏ',
  'dây', 'giá đỡ', 'miếng dán', 'bút', 'cho', 'dùng cho', 'thay', 'thay thế', 'của',
].map(words);

/** Whole words preserve accents. Only text BEFORE the first keyword head can reject a title. */
export function isMainCapturedProduct(title: string, keyword: string): boolean {
  const head = words(keyword)[0];
  if (!head) return false;
  const titleWords = words(title), first = titleWords.indexOf(head);
  if (first < 0) return false;
  const prefix = titleWords.slice(0, first);
  return !prefixTerms.some(term => prefix.some((_, i) => term.every((word, j) => prefix[i + j] === word)));
}

export type CaptureQualityRow = {
  readonly title: string;
  readonly platform: string;
  readonly revenue: number | null;
  readonly units: number | null;
};

/** One pass against the median of relevant rows with defined unit revenue, separately per platform. */
export function captureRowExclusions(rows: readonly CaptureQualityRow[], keywords: readonly string[]): Map<number, CaptureRowExclusionReason> {
  const excluded = new Map<number, CaptureRowExclusionReason>();
  for (const [i, row] of rows.entries()) {
    if (!keywords.some(keyword => isMainCapturedProduct(row.title, keyword))) excluded.set(i, 'NOT_MAIN_PRODUCT');
    else if (row.revenue !== null && row.revenue > 0 && (row.units === null || row.units === 0)) excluded.set(i, 'REVENUE_WITHOUT_UNITS');
  }
  for (const platform of new Set(rows.map(row => row.platform))) {
    const candidates = rows.flatMap((row, i) => row.platform === platform && !excluded.has(i) && row.revenue !== null && row.units !== null && row.units > 0
      ? [{ i, ratio: row.revenue / row.units }] : []);
    const ratios = candidates.map(row => row.ratio).sort((a, b) => a - b);
    if (!ratios.length) continue;
    const middle = Math.floor(ratios.length / 2);
    const median = ratios.length % 2 ? ratios[middle]! : ratios[middle - 1]! / 2 + ratios[middle]! / 2;
    for (const row of candidates) if (row.ratio > 20 * median) excluded.set(row.i, 'UNIT_REVENUE_OUTLIER');
  }
  return excluded;
}

/** One factual line per platform; zero counts are omitted. */
export function captureExclusionNotice(rows: readonly { readonly platform: string; readonly reason: CaptureRowExclusionReason }[], platform: string): string {
  const own = rows.filter(row => row.platform === platform);
  const irrelevant = own.filter(row => row.reason === 'NOT_MAIN_PRODUCT').length;
  const implausible = own.length - irrelevant;
  const parts = [
    ...(irrelevant ? [`${irrelevant} dòng không phải sản phẩm chính (phụ kiện, linh kiện hoặc sản phẩm khác)`] : []),
    ...(implausible ? [`${implausible} dòng có doanh thu hoặc đơn vị bán bất thường`] : []),
  ];
  return parts.length ? `Đã loại ${parts.join(' và ')} khỏi tổng.` : '';
}

/** Both report parsers derive membership from the same untruncated, clean cells. */
export function readCaptureProductRows(snapshot: AutomationMetricWebSnapshotV1) {
  const table = snapshot.groups.W12_topProducts;
  if ('absent' in table) return [];
  return table.rows.map((row, rowIndex) => {
    const text = (key: string): string => {
      const cell = row.cells[key];
      return (cell && 'text' in cell ? cell.text : cell && 'displayed' in cell ? cell.displayed : '').trim().replace(/\s+/gu, ' ');
    };
    const number = (key: string): number | null => {
      const cell = row.cells[key];
      return cell && 'value' in cell && typeof cell.value === 'number' && Number.isFinite(cell.value) && cell.value >= 0 ? cell.value : null;
    };
    return { rowIndex, ...splitCaptureNameCell(text('name'), text('shop')), platform: text('platform').toLowerCase(), revenue: number('revenue'), units: number('units') };
  });
}

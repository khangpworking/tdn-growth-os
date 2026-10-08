import { createHash } from 'node:crypto';
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import {
  normaliseMetricWebSnapshot,
  type MetricWebFacts,
  type MetricWebMonthFact,
} from '../research-automation/metric-web-facts.js';
import { MetricWebSnapshotError, validateMetricWebSnapshot } from '../research-automation/metric-web-snapshot.js';
import type { Bundle } from './bundle.js';

/** Family label every web number must carry in reader-visible text. */
export const WEB_FAMILY_LABEL = 'toàn kết quả tìm kiếm';

/** Family label every in-sample number must carry when web facts are shown. */
export function inSampleLabel(rowCount: number): string {
  return `trong mẫu ${rowCount} sản phẩm`;
}

/** Note appended to values the page only printed rounded. */
export const DISPLAY_ROUNDED_NOTE = 'số làm tròn như trên trang';

/** Method note for the monthly peak/low/last3 keys, stated in M02. */
export const WEB_MONTHLY_METHOD =
  'tháng cao nhất/thấp nhất là tháng có doanh thu toàn kết quả tìm kiếm cao nhất/thấp nhất; ' +
  'mức so ba tháng cuối với ba tháng trước đó = 100×(tổng ba tháng cuối − tổng ba tháng trước đó)/tổng ba tháng trước đó';

export type ReaderSourceErrorCode = 'READER_SOURCE_UNDERIVABLE' | 'READER_SOURCE_MISMATCH';

/**
 * Domain error for web-derived source problems. UNDERIVABLE names the missing
 * field (a null value is never read as 0); MISMATCH names the differing field.
 */
export class ReaderSourceError extends Error {
  constructor(
    readonly code: ReaderSourceErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ReaderSourceError';
  }
}

type EffectiveSource = NonNullable<ReaderReportInput['source']>;

/** sha256 over the canonical JSON of an opaque web snapshot. */
export function webSnapshotDigest(webSnapshot: unknown): string {
  return createHash('sha256').update(canonicalJson(webSnapshot), 'utf8').digest('hex');
}

/**
 * Validates an opaque web snapshot and checks its sha256. Returns the
 * normalised facts. Throws MetricWebSnapshotError on any problem, including a
 * digest mismatch.
 */
export function verifyWebSnapshot(webSnapshot: unknown, sha256: unknown): MetricWebFacts {
  const snapshot = validateMetricWebSnapshot(webSnapshot);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new MetricWebSnapshotError('METRIC_WEB_SNAPSHOT_INVALID', ['webSnapshotSha256 must be a 64-hex digest']);
  }
  const actual = webSnapshotDigest(webSnapshot);
  if (actual !== sha256) {
    throw new MetricWebSnapshotError('METRIC_WEB_SNAPSHOT_INVALID', [
      `webSnapshotSha256 does not match sha256(canonicalJson(webSnapshot)): expected ${sha256}, got ${actual}`,
    ]);
  }
  return normaliseMetricWebSnapshot(snapshot);
}

function requiredNumber(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new ReaderSourceError('READER_SOURCE_UNDERIVABLE', `thiếu số liệu ${field}, trang không hiển thị giá trị`);
  }
  return value;
}

function requiredCount(value: number | null, field: string): number {
  const n = requiredNumber(value, field);
  if (!Number.isInteger(n)) {
    throw new ReaderSourceError('READER_SOURCE_UNDERIVABLE', `số liệu ${field} không phải số nguyên`);
  }
  return n;
}

/**
 * Builds the reader source from web facts: the period from the scope (W1),
 * the four headlines from the W2 current values, and the per-platform revenue
 * from W3. A null value raises READER_SOURCE_UNDERIVABLE naming the field and
 * is never read as 0. Pure and deterministic.
 */
export function deriveReaderSource(facts: MetricWebFacts, rowCap: number, options: { nullable?: boolean } = {}): EffectiveSource {
  if (!Number.isInteger(rowCap) || rowCap < 1 || rowCap > 20000) {
    throw new ReaderSourceError('READER_SOURCE_UNDERIVABLE', 'thiếu số liệu rowCap, giới hạn tải không hợp lệ');
  }
  const measurementPeriod = {
    start: facts.scope.period.startDate,
    end: facts.scope.period.endDate,
  };
  const number = (value: number | null, field: string): number | null => options.nullable ? value : requiredNumber(value, field);
  const count = (value: number | null, field: string): number | null => options.nullable && value === null ? null : requiredCount(value, field);
  const displayedHeadlines = {
    revenueVnd: number(facts.kpi.revenue.current.value, 'displayedHeadlines.revenueVnd'),
    soldListings: count(facts.kpi.soldListings.current.value, 'displayedHeadlines.soldListings'),
    shops: count(facts.kpi.shops.current.value, 'displayedHeadlines.shops'),
    units: number(facts.kpi.units.current.value, 'displayedHeadlines.units'),
  };
  const platformBreakdown: EffectiveSource['platformBreakdown'] = {};
  for (const entry of facts.platformSplit) {
    const revenue = number(entry.revenue.value, `platformBreakdown.${entry.platform}.displayedRevenueVnd`);
    platformBreakdown[entry.platform] = { displayedRevenueVnd: revenue };
  }
  return { measurementPeriod, rowCap, displayedHeadlines, platformBreakdown };
}

/**
 * Compares a request source against the derived source. Returns the derived
 * source when they match; throws READER_SOURCE_MISMATCH naming the first
 * differing field otherwise. Comparison is on canonical JSON per field so key
 * order never matters.
 */
export function checkDerivedSource(
  requested: EffectiveSource,
  derived: EffectiveSource,
): EffectiveSource {
  const fields = ['measurementPeriod', 'rowCap', 'displayedHeadlines', 'platformBreakdown'] as const;
  for (const field of fields) {
    if (canonicalJson(requested[field]) !== canonicalJson(derived[field])) {
      throw new ReaderSourceError(
        'READER_SOURCE_MISMATCH',
        `nguồn khai báo khác số liệu trang ở mục ${field}`,
      );
    }
  }
  return derived;
}

function setIfFinite(B: Bundle, id: string, value: number | null, fmt: string, keys: string[]): void {
  if (value === null || !Number.isFinite(value)) return;
  B.set(id, value, fmt);
  keys.push(id);
}

function monthValues(months: Readonly<Record<string, MetricWebMonthFact>>): { month: string; value: number }[] {
  const out: { month: string; value: number }[] = [];
  for (const month of Object.keys(months).sort()) {
    const point = months[month];
    if (point === undefined) continue;
    const value = point.revenue.value;
    if (value !== null && Number.isFinite(value)) out.push({ month, value });
  }
  return out;
}

/**
 * Monthly peak/low/last3-vs-prior-3 for one platform, from W4 revenues only.
 * No sums across platforms. The final six calendar months must be consecutive
 * and carry values; missing months never compress a comparison window.
 */
export function webMonthlyStats(months: Readonly<Record<string, MetricWebMonthFact>>): {
  peak: { month: string; value: number } | null;
  low: { month: string; value: number } | null;
  last3vsPrev3: number | null;
} {
  const ordered = monthValues(months);
  if (ordered.length === 0) return { peak: null, low: null, last3vsPrev3: null };
  let peak = ordered[0];
  let low = ordered[0];
  for (const point of ordered) {
    if (peak === undefined || point.value > peak.value) peak = point;
    if (low === undefined || point.value < low.value) low = point;
  }
  let last3vsPrev3: number | null = null;
  const calendar = Object.keys(months).sort().slice(-6);
  const monthIndex = (month: string): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5));
  if (calendar.length === 6 && calendar.every((month, i) =>
    Number.isFinite(months[month]?.revenue.value) && months[month]?.revenue.value !== null &&
    (i === 0 || monthIndex(month) === monthIndex(calendar[i - 1]!) + 1))) {
    const window = calendar.map(month => ({ month, value: months[month]!.revenue.value! }));
    const last3 = window.slice(-3);
    const prev3 = window.slice(0, 3);
    const lastSum = last3.reduce((sum, point) => sum + point.value, 0);
    const prevSum = prev3.reduce((sum, point) => sum + point.value, 0);
    if (prevSum > 0 && Number.isFinite(lastSum) && Number.isFinite(prevSum)) {
      last3vsPrev3 = (100 * (lastSum - prevSum)) / prevSum;
    }
  }
  return {
    peak: peak === undefined ? null : { month: peak.month, value: peak.value },
    low: low === undefined ? null : { month: low.month, value: low.value },
    last3vsPrev3,
  };
}

/**
 * Sets every web bundle key from normalised facts. Each key is set only when
 * its page value is present; a null stays missing and is never 0. Platforms
 * are never summed: page totals (W2) are copied, never recomputed. Returns
 * the ids that were set, in a deterministic order.
 */
export function setWebBundleKeys(B: Bundle, facts: MetricWebFacts): string[] {
  const keys: string[] = [];
  setIfFinite(B, 'web.kpi.rev', facts.kpi.revenue.current.value, 'ty1', keys);
  setIfFinite(B, 'web.kpi.units', facts.kpi.units.current.value, 'num', keys);
  setIfFinite(B, 'web.kpi.listings', facts.kpi.soldListings.current.value, 'num', keys);
  setIfFinite(B, 'web.kpi.shops', facts.kpi.shops.current.value, 'num', keys);
  setIfFinite(B, 'web.kpi.rev.chg', facts.kpi.revenue.changePct?.value ?? null, 'pct', keys);
  setIfFinite(B, 'web.kpi.units.chg', facts.kpi.units.changePct?.value ?? null, 'pct', keys);
  setIfFinite(B, 'web.kpi.listings.chg', facts.kpi.soldListings.changePct?.value ?? null, 'pct', keys);
  setIfFinite(B, 'web.kpi.shops.chg', facts.kpi.shops.changePct?.value ?? null, 'pct', keys);
  for (const entry of [...facts.platformSplit].sort((left, right) => (left.platform < right.platform ? -1 : 1))) {
    setIfFinite(B, `web.${entry.platform}.rev`, entry.revenue.value, 'ty1', keys);
    setIfFinite(B, `web.${entry.platform}.share`, entry.share.value, 'pct', keys);
  }
  if (!('absent' in facts.monthly)) {
    for (const platform of Object.keys(facts.monthly).sort()) {
      const months = facts.monthly[platform as keyof typeof facts.monthly];
      if (months === undefined) continue;
      for (const month of Object.keys(months).sort()) {
        const point = months[month];
        if (point === undefined) continue;
        setIfFinite(B, `web.${platform}.m.${month}`, point.revenue.value, 'ty1', keys);
      }
      const stats = webMonthlyStats(months);
      if (stats.peak !== null) setIfFinite(B, `web.${platform}.peak`, stats.peak.value, 'ty1', keys);
      if (stats.low !== null) setIfFinite(B, `web.${platform}.low`, stats.low.value, 'ty1', keys);
      setIfFinite(B, `web.${platform}.last3vsPrev3`, stats.last3vsPrev3, 'pct', keys);
    }
  }
  if (!('absent' in facts.top10Share.brand)) {
    setIfFinite(B, 'web.top10.brand', facts.top10Share.brand.top10.value, 'pct', keys);
  }
  if (!('absent' in facts.top10Share.shop)) {
    setIfFinite(B, 'web.top10.shop', facts.top10Share.shop.top10.value, 'pct', keys);
  }
  if (!('absent' in facts.shopType)) {
    for (const entry of facts.shopType) {
      if (entry.shopType === 'mall') setIfFinite(B, 'web.shopType.mall', entry.share.value, 'pct', keys);
      if (entry.shopType === 'normal') setIfFinite(B, 'web.shopType.normal', entry.share.value, 'pct', keys);
    }
  }
  if (!('absent' in facts.location)) {
    facts.location.forEach((row, index) => {
      const cell = row['share'];
      if (cell !== undefined && 'value' in cell) setIfFinite(B, `web.loc.${index}`, cell.value, 'pct', keys);
    });
  }
  if (!('absent' in facts.category)) {
    facts.category.forEach((row, index) => {
      const cell = row['revenue'];
      if (cell !== undefined && 'value' in cell) setIfFinite(B, `web.cat.${index}.rev`, cell.value, 'ty1', keys);
    });
  }
  if (!('absent' in facts.priceLevel)) {
    facts.priceLevel.forEach((row, index) => {
      const cell = row['revenue'];
      if (cell !== undefined && 'value' in cell) setIfFinite(B, `web.price.${index}.rev`, cell.value, 'ty1', keys);
    });
  }
  if (!('absent' in facts.brandByShopType)) {
    facts.brandByShopType.forEach((row, index) => {
      const normal = row['revenueNormal'];
      const mall = row['revenueMall'];
      if (normal !== undefined && 'value' in normal) {
        setIfFinite(B, `web.bst.${index}.normal`, normal.value, 'ty1', keys);
      }
      if (mall !== undefined && 'value' in mall) {
        setIfFinite(B, `web.bst.${index}.mall`, mall.value, 'ty1', keys);
      }
    });
  }
  if (!('absent' in facts.topProducts)) {
    facts.topProducts.forEach((row, index) => {
      const revenue = row['revenue'];
      const revenueChg = row['revenueChg'];
      const units = row['units'];
      const unitsChg = row['unitsChg'];
      const price = row['price'];
      if (revenue !== undefined && 'value' in revenue) {
        setIfFinite(B, `web.top.product.${index}.rev`, revenue.value, 'ty1', keys);
      }
      if (revenueChg !== undefined && 'value' in revenueChg) {
        setIfFinite(B, `web.top.product.${index}.chg`, revenueChg.value, 'pct', keys);
      }
      if (units !== undefined && 'value' in units) {
        setIfFinite(B, `web.top.product.${index}.units`, units.value, 'num', keys);
      }
      if (unitsChg !== undefined && 'value' in unitsChg) {
        setIfFinite(B, `web.top.product.${index}.unitsChg`, unitsChg.value, 'pct', keys);
      }
      if (price !== undefined && 'value' in price) {
        setIfFinite(B, `web.top.product.${index}.price`, price.value, 'dong', keys);
      }
    });
  }
  if (!('absent' in facts.topShops)) {
    facts.topShops.forEach((row, index) => {
      const revenue = row['revenue'];
      const revenueChg = row['revenueChg'];
      const rankNew = row['rankNew'];
      const rankOld = row['rankOld'];
      if (revenue !== undefined && 'value' in revenue) {
        setIfFinite(B, `web.top.shop.${index}.rev`, revenue.value, 'ty1', keys);
      }
      if (revenueChg !== undefined && 'value' in revenueChg) {
        setIfFinite(B, `web.top.shop.${index}.chg`, revenueChg.value, 'pct', keys);
      }
      if (rankNew !== undefined && 'value' in rankNew) {
        setIfFinite(B, `web.top.shop.${index}.rankNew`, rankNew.value, 'int', keys);
      }
      if (rankOld !== undefined && 'value' in rankOld) {
        setIfFinite(B, `web.top.shop.${index}.rankOld`, rankOld.value, 'int', keys);
      }
    });
  }
  if (!('absent' in facts.topBrands)) {
    facts.topBrands.forEach((row, index) => {
      const revenue = row['revenue'];
      const rankNew = row['rankNew'];
      const rankOld = row['rankOld'];
      if (revenue !== undefined && 'value' in revenue) {
        setIfFinite(B, `web.top.brand.${index}.rev`, revenue.value, 'ty1', keys);
      }
      if (rankNew !== undefined && 'value' in rankNew) {
        setIfFinite(B, `web.top.brand.${index}.rankNew`, rankNew.value, 'int', keys);
      }
      if (rankOld !== undefined && 'value' in rankOld) {
        setIfFinite(B, `web.top.brand.${index}.rankOld`, rankOld.value, 'int', keys);
      }
    });
  }
  return keys;
}

export type WebReconciliationCheck = 'R1' | 'R2' | 'R3' | 'R4';
export type WebReconciliationWarning = {
  code: 'METRIC_WEB_XLSX_MISMATCH';
  check: WebReconciliationCheck;
  detail: string;
  numbers: Record<string, number>;
};

export type WebSampleRow = { platform: string; rev: number | null; units: number | null };

/** Grouped digits for owner-facing warning text; the raw numbers stay in `numbers`. */
function grouped(value: number): string {
  return value.toLocaleString('vi-VN');
}

/**
 * Reconciliation R1–R4 between the xlsx sample rows and the web snapshot.
 * The sample is a top-N slice of the full result, so each sample aggregate
 * must stay at or below its full-result counterpart. Returns warnings only;
 * consistent data yields no warnings. Pure and deterministic.
 */
export function reconcileWebWithRows(
  facts: MetricWebFacts,
  rows: readonly WebSampleRow[],
  options: { perPlatformOnly?: boolean } = {},
): WebReconciliationWarning[] {
  const warnings: WebReconciliationWarning[] = [];
  const combined = !options.perPlatformOnly || new Set(rows.map(row => row.platform)).size === 1;
  const sampleRev = !combined || rows.some(row => row.rev === null) ? null : rows.reduce((sum, row) => sum + row.rev!, 0);
  const sampleUnits = !combined || rows.some(row => row.units === null) ? null : rows.reduce((sum, row) => sum + row.units!, 0);
  const webRev = facts.kpi.revenue.current.value;
  if (webRev !== null && Number.isFinite(webRev) && sampleRev !== null && sampleRev > webRev) {
    warnings.push({
      code: 'METRIC_WEB_XLSX_MISMATCH',
      check: 'R1',
      detail: `doanh thu tệp mẫu vượt doanh thu toàn kết quả tìm kiếm: mẫu ${grouped(sampleRev)}, trang ${grouped(webRev)}`,
      numbers: { sampleRev, webRev },
    });
  }
  const webUnits = facts.kpi.units.current.value;
  if (webUnits !== null && Number.isFinite(webUnits) && sampleUnits !== null && sampleUnits > webUnits) {
    warnings.push({
      code: 'METRIC_WEB_XLSX_MISMATCH',
      check: 'R2',
      detail: `đơn vị bán tệp mẫu vượt đơn vị bán toàn kết quả tìm kiếm: mẫu ${grouped(sampleUnits)}, trang ${grouped(webUnits)}`,
      numbers: { sampleUnits, webUnits },
    });
  }
  const webListings = facts.kpi.soldListings.current.value;
  if (webListings !== null && Number.isFinite(webListings) && rows.length > webListings) {
    warnings.push({
      code: 'METRIC_WEB_XLSX_MISMATCH',
      check: 'R3',
      detail: `số sản phẩm tệp mẫu vượt số sản phẩm có lượt bán toàn kết quả tìm kiếm: mẫu ${grouped(rows.length)}, trang ${grouped(webListings)}`,
      numbers: { sampleRows: rows.length, webListings },
    });
  }
  const breached: Record<string, number> = {};
  for (const entry of facts.platformSplit) {
    const webPlatformRev = entry.revenue.value;
    if (webPlatformRev === null || !Number.isFinite(webPlatformRev)) continue;
    const platformRows = rows.filter(row => row.platform === entry.platform);
    if (platformRows.some(row => row.rev === null)) continue;
    const samplePlatformRev = platformRows.reduce((sum, row) => sum + row.rev!, 0);
    if (samplePlatformRev > webPlatformRev) breached[entry.platform] = samplePlatformRev;
  }
  if (Object.keys(breached).length > 0) {
    const numbers: Record<string, number> = { ...breached };
    for (const entry of facts.platformSplit) {
      const value = entry.revenue.value;
      if (value !== null && Number.isFinite(value)) numbers[`web.${entry.platform}`] = value;
    }
    warnings.push({
      code: 'METRIC_WEB_XLSX_MISMATCH',
      check: 'R4',
      detail: `doanh thu mẫu theo sàn vượt doanh thu toàn kết quả tìm kiếm của sàn: ${Object.keys(breached).sort().map(platform => platform === 'shopee' ? 'Shopee' : 'TikTok Shop').join(', ')}`,
      numbers,
    });
  }
  return warnings.sort((left, right) => (left.check < right.check ? -1 : 1));
}

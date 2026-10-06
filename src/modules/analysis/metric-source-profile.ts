import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import manifestSchema from '../../../contracts/analysis/metric-source-manifest.schema.json' with { type: 'json' };
import labelsSchema from '../../../contracts/analysis/metric-source-labels.schema.json' with { type: 'json' };
import inputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import type { MetricSourceManifest } from '../../../contracts/analysis/metric-source-manifest.generated.js';
import type { MetricSourceLabels } from '../../../contracts/analysis/metric-source-labels.generated.js';
import type { MetricScopeInput, Observation } from '../../../contracts/analysis/metric-scope-input.generated.js';
import { calculateMetricScopes, metricLabelFingerprint, validateMetricScopeInput } from './metric-scope-calculator.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(inputSchema);
const validateManifest = ajv.compile<MetricSourceManifest>(manifestSchema);
const validateLabels = ajv.compile<MetricSourceLabels>(labelsSchema);
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const jsonHash = (v: unknown): string => hash(canonicalJson(v));
const LEGACY_HEADERS = ['Tên sản phẩm', 'Link sản phẩm', 'Giá', 'Số đã bán', 'Doanh thu', 'Ngành hàng', 'Thương hiệu',
  'Giá phân loại cao nhất', 'Giá phân loại nhỏ nhất', 'Link shop', 'Mã sản phẩm', 'Ngành hàng cấp 1', 'Ngành hàng cấp 2',
  'Ngành hàng cấp 3', 'Ngày bắt đầu bán', 'Thumbnail', 'Tên shop', 'Tổng doanh số', 'Tổng số đánh giá', 'Tổng số đã bán'];
// A separately declared export profile, not an auto-detected or repaired legacy workbook.
const CURRENT_HEADERS = ['Tên sản phẩm', 'Link sản phẩm', 'Giá', 'Số đã bán', 'Doanh thu', 'Thương hiệu',
  'Giá phân loại cao nhất', 'Giá phân loại nhỏ nhất', 'Link shop', 'Mã sản phẩm', 'Ngành hàng', 'Ngành hàng cấp 1',
  'Ngành hàng cấp 2', 'Ngành hàng cấp 3', 'Ngày bắt đầu bán', 'Thumbnail', 'Tên shop', 'Tổng doanh số', 'Tổng số đánh giá', 'Tổng số đã bán'];
type Platform = MetricScopeInput['scope']['platform'];
type ListingIdentity = { shopId: string; listingId: string };
const V1 = 'metric-shopee-product-list-sheet1-v1', V2 = 'metric-shopee-product-list-sheet1-v2', V3 = 'metric-marketplace-product-list-sheet1-v3';
const ID = '([1-9][0-9]{0,127})';
const SHOPEE_PRODUCT = new RegExp(`^https://shopee\\.vn/product/${ID}/${ID}$`);
const SHOPEE_SLUG_PRODUCT = new RegExp(`^https://shopee\\.vn/[^/?#]+-i\\.${ID}\\.${ID}$`);
const TIKTOK_PRODUCT = new RegExp(`^https://shop-vn\\.tiktok\\.com/pdp/${ID}$`);
const TIKTOK_SHOP = new RegExp(`^https://short\\.metric\\.vn/shop/8__${ID}$`);
/**
 * Combined-export platform rules keyed by the `Mã sản phẩm` prefix. Each rule
 * reads the listing from the product URL, the shop from the product or shop URL,
 * and states the exact composite id the export must carry.
 */
const PLATFORM_RULES: Readonly<Record<string, {
  platform: Platform;
  product(url: string, slugUrls: boolean): { listingId: string; shopId: string | null } | null;
  shop(url: string, fromProduct: string | null): string | null;
  composite(id: ListingIdentity): string;
}>> = {
  '1': {
    platform: 'shopee',
    product(url, slugUrls) {
      const match = SHOPEE_PRODUCT.exec(url) ?? (slugUrls ? SHOPEE_SLUG_PRODUCT.exec(url) : null);
      return match ? { shopId: match[1]!, listingId: match[2]! } : null;
    },
    shop: (url, fromProduct) => fromProduct !== null && url === `https://shopee.vn/shop/${fromProduct}` ? fromProduct : null,
    composite: ({ shopId, listingId }) => `1__${listingId}__${shopId}`,
  },
  '8': {
    platform: 'tiktok',
    product(url) {
      const match = TIKTOK_PRODUCT.exec(url);
      return match ? { shopId: null, listingId: match[1]! } : null;
    },
    shop: url => TIKTOK_SHOP.exec(url)?.[1] ?? null,
    composite: ({ listingId }) => `8__${listingId}`,
  },
};
const PLATFORMS = Object.values(PLATFORM_RULES).map(rule => rule.platform);
const prefixOf = (composite: string): string => composite.split('__', 1)[0]!;
type PlatformRows = NonNullable<MetricSourceManifest['platformRows']>;
type Cell = { type: string; value: string | null; style: string | null; rawType: string | null; rawValue: string | null; numberFormatId: string };
type RawRow = { row: number; cells: Cell[] };

export class MetricSourceRejection extends Error {
  constructor(readonly locator: string, readonly code: string) { super(`${locator}: ${code}`); }
}
function reject(locator: string, code: string): never { throw new MetricSourceRejection(locator, code); }
function json(bytes: Buffer, locator: string): unknown {
  if (bytes.length > 32 * 1024 * 1024) reject(locator, 'JSON_SIZE_LIMIT');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return reject(locator, 'INVALID_JSON_UTF8'); }
}

function readSheet(bytes: Buffer): RawRow[] {
  if (bytes.length > 32 * 1024 * 1024) reject('workbook', 'WORKBOOK_SIZE_LIMIT');
  const run = spawnSync('python3', ['-I', fileURLToPath(new URL('../../../scripts/read-metric-sheet.py', import.meta.url))],
    { input: bytes, timeout: 30_000, maxBuffer: 64 * 1024 * 1024, shell: false, windowsHide: true });
  if (run.error) reject('workbook', 'OFFLINE_READER_UNAVAILABLE_OR_LIMIT');
  if (run.status !== 0) {
    let diagnostic: { locator?: unknown; code?: unknown } = {};
    try { diagnostic = JSON.parse(run.stderr.toString('utf8')); } catch { /* Safe fixed fallback. */ }
    reject(typeof diagnostic.locator === 'string' ? diagnostic.locator : 'workbook',
      typeof diagnostic.code === 'string' ? diagnostic.code : 'INVALID_XLSX');
  }
  return (JSON.parse(run.stdout.toString('utf8')) as { rows: RawRow[] }).rows;
}

/** Exact observed header/profile for upload preparation, never a repair or a market calculation. */
export function inspectMetricWorkbookProfile(workbook: Buffer): {
  profileId: MetricSourceManifest['profileId']; profileVersion: MetricSourceManifest['profileVersion'];
  headerSha256: MetricSourceManifest['source']['headerSha256']; lastRow: number; platformRows?: PlatformRows;
} {
  const rows = readSheet(workbook);
  const header = rows[0];
  if (!header || header.row !== 1 || header.cells.some(cell => cell.type !== 'text')) reject('Sheet1!A1:T1', 'HEADER_MISMATCH');
  const values = header.cells.map(cell => cell.value);
  const legacy = canonicalJson(values) === canonicalJson(LEGACY_HEADERS);
  const current = canonicalJson(values) === canonicalJson(CURRENT_HEADERS);
  if (!legacy && !current) reject('Sheet1!A1:T1', 'HEADER_MISMATCH');
  if (rows.length < 2 || rows.length > 10001 || rows.some((row, index) => row.row !== index + 1)) reject('Sheet1', 'ROW_RANGE_MISMATCH');
  const headerSha256 = jsonHash(values) as MetricSourceManifest['source']['headerSha256'];
  if (!current) return { profileId: V1, profileVersion: '1.0.0', headerSha256, lastRow: rows.length };
  // A v2-header file with any known non-Shopee prefix is the combined v3 export; every prefix must then be known.
  const composite = CURRENT_HEADERS.indexOf('Mã sản phẩm');
  const prefixes = rows.slice(1).map(row => {
    const cell = row.cells[composite];
    return { row: row.row, prefix: cell?.type === 'text' && cell.value ? prefixOf(cell.value) : null };
  });
  if (!prefixes.some(({ prefix }) => prefix !== null && prefix !== '1' && PLATFORM_RULES[prefix])) {
    return { profileId: V2, profileVersion: '2.0.0', headerSha256, lastRow: rows.length };
  }
  const platformRows: PlatformRows = {};
  for (const { row, prefix } of prefixes) {
    const rule = prefix === null ? undefined : PLATFORM_RULES[prefix];
    if (!rule) reject(`Sheet1!${column(composite)}${row}`, 'UNKNOWN_PLATFORM_PREFIX');
    platformRows[rule.platform] = (platformRows[rule.platform] ?? 0) + 1;
  }
  return { profileId: V3, profileVersion: '3.0.0', headerSha256, lastRow: rows.length, platformRows };
}

const column = (index: number): string => String.fromCharCode(65 + index);

// Exact base-10 conversion from OOXML numeric lexical values; never Number(value).
function integer(cell: Cell, locator: string): string | null {
  if (cell.type === 'blank' || (cell.type === 'text' && cell.value === '')) return null;
  if (cell.type !== 'number' && cell.type !== 'text') reject(locator, 'INVALID_NUMERIC_TYPE');
  if (cell.numberFormatId !== '0') reject(locator, 'UNSUPPORTED_METRIC_NUMBER_FORMAT');
  const raw = cell.value ?? '';
  if (cell.type === 'text') {
    if (!/^(0|[1-9][0-9]{0,39})$/.test(raw)) reject(locator, 'INVALID_INTEGER_TEXT');
    return raw;
  }
  const match = /^(\d+)(?:\.(\d+))?(?:[Ee]([+-]?\d{1,3}))?$/.exec(raw);
  if (!match || raw.length > 200) reject(locator, 'INVALID_NUMERIC_VALUE');
  let digits = match[1]! + (match[2] ?? '');
  const shift = Number(match[3] ?? '0') - (match[2]?.length ?? 0);
  if (Math.abs(shift) > 200) reject(locator, 'NUMERIC_RANGE');
  if (shift >= 0) digits += '0'.repeat(shift);
  else {
    const padded = digits.padStart(-shift + 1, '0');
    if (!/^0*$/.test(padded.slice(shift))) reject(locator, 'FRACTIONAL_VALUE');
    digits = padded.slice(0, shift);
  }
  digits = digits.replace(/^0+(?=\d)/, '');
  if (digits.length > 40) reject(locator, 'NUMERIC_RANGE');
  return digits;
}

/**
 * Exact-byte, one-profile normalization without running a market calculation.
 * Source text remains inert. The returned input is ready for schema/readiness
 * checks and can be calculated only after the caller's explicit gate.
 */
export function normalizeMetricWorkbookInput(workbook: Buffer, manifestBytes: Buffer, labelBytes?: Buffer) {
  const manifest = json(manifestBytes, 'manifest');
  if (!validateManifest(manifest)) reject('manifest', 'INVALID_MANIFEST');
  const combined = manifest.profileId === V3, selected = manifest.scope.platform;
  if ((!combined && selected !== 'shopee') || manifest.scope.start > manifest.scope.end) reject('manifest/scope', 'SCOPE_PERIOD_MISMATCH');
  const sourceSha256 = hash(workbook), manifestSha256 = hash(manifestBytes);
  if (sourceSha256 !== manifest.source.sha256) reject('workbook', 'SOURCE_HASH_MISMATCH');
  const headers = manifest.profileId === V1 ? LEGACY_HEADERS : CURRENT_HEADERS;
  const shopColumn = headers.indexOf('Link shop'), compositeColumn = headers.indexOf('Mã sản phẩm');
  const rows = readSheet(workbook);
  const header = rows[0];
  if (!header || header.row !== 1 || header.cells.some(c => c.type !== 'text') ||
      canonicalJson(header.cells.map(c => c.value)) !== canonicalJson(headers) ||
      jsonHash(header.cells.map(c => c.value)) !== manifest.source.headerSha256) reject('Sheet1!A1:T1', 'HEADER_MISMATCH');
  if (rows.length !== manifest.source.lastRow || rows.some((r, i) => r.row !== i + 1)) reject('Sheet1', 'ROW_RANGE_MISMATCH');
  const input: MetricScopeInput = {
    contractVersion: '1.0.0', profileId: manifest.profileId, scope: manifest.scope,
    wideUnknownPolicy: manifest.wideUnknownPolicy, labelCodebookVersion: manifest.labelCodebookVersion,
    sources: [
      { sha256: sourceSha256, label: manifest.source.label, representationRole: 'structured',
        evidenceFamily: manifest.source.evidenceFamily, provenanceBasis: manifest.source.provenanceBasis },
      { sha256: manifestSha256, label: 'Operator-declared source manifest', representationRole: 'derived',
        evidenceFamily: manifest.source.evidenceFamily, provenanceBasis: 'Explicit scope/acquisition/precision declarations; not independent provider authentication.' },
    ], records: [],
  };
  const seen = new Set<string>();
  const counts = new Map<Platform, number>();
  // Every row is checked, including rows of the other marketplace; only the selected platform becomes records.
  const evidence = rows.slice(1).flatMap(raw => {
    const ref = (column: string) => ({ sourceSha256, locator: `Sheet1!${column}${raw.row}` });
    const text = (index: number): string => {
      const cell = raw.cells[index]!;
      if (cell.type !== 'text' || !cell.value?.trim()) reject(ref(column(index)).locator, 'REQUIRED_TEXT');
      return cell.value;
    };
    const rule = combined ? PLATFORM_RULES[prefixOf(text(compositeColumn))] : PLATFORM_RULES['1'];
    if (!rule) return reject(ref(column(compositeColumn)).locator, 'UNKNOWN_PLATFORM_PREFIX');
    const product = rule.product(text(1), manifest.profileId !== V1);
    if (!product) return reject(ref('B').locator, 'PRODUCT_URL_SHAPE');
    const shopId = rule.shop(text(shopColumn), product.shopId);
    if (shopId === null) return reject(ref(column(shopColumn)).locator, 'SHOP_ID_MISMATCH');
    const listingId = product.listingId;
    if (text(compositeColumn) !== rule.composite({ shopId, listingId })) reject(ref(column(compositeColumn)).locator, 'COMPOSITE_ID_MISMATCH');
    const key = canonicalJson([rule.platform, shopId, listingId]);
    if (seen.has(key)) reject(ref('B').locator, 'DUPLICATE_LISTING');
    seen.add(key);
    counts.set(rule.platform, (counts.get(rule.platform) ?? 0) + 1);
    const observe = (index: number, kind: 'revenue' | 'units'): Observation => {
      const source = ref(column(index));
      const value = integer(raw.cells[index]!, source.locator);
      return { state: value === null ? 'missing' : value === '0' ? 'observed_zero' : 'observed_value', value,
        precision: manifest.precision[kind], source, displayedValue: raw.cells[index]!.value };
    };
    const record: MetricScopeInput['records'][number] = {
      shopId, listingId, title: text(0), category: text(12), source: { sourceSha256, locator: `Sheet1!A${raw.row}:T${raw.row}` },
      revenue: observe(4, 'revenue'), units: observe(3, 'units'), label: null,
      measurement: { profileId: manifest.profileId, scopeKey: manifest.scope.key, platform: selected,
        selection: manifest.scope.selection, start: manifest.scope.start, end: manifest.scope.end, currency: 'VND' },
    };
    if (rule.platform !== selected) return [];
    input.records.push(record);
    return [{ row: raw.row, rowSha256: jsonHash(raw.cells), cells: raw.cells,
      contentSha256: metricLabelFingerprint(selected, record), shopId, listingId, locator: record.source.locator }];
  });
  if (combined) {
    if (PLATFORMS.some(platform => (counts.get(platform) ?? 0) !== (manifest.platformRows?.[platform] ?? 0))) {
      reject('manifest/platformRows', 'PLATFORM_ROW_COUNT_MISMATCH');
    }
    if (evidence.length === 0) reject('manifest/scope', 'EMPTY_PLATFORM_SCOPE');
  }
  const labelSha256 = labelBytes ? hash(labelBytes) : null;
  if (labelBytes) {
    const labels = json(labelBytes, 'labels');
    if (!validateLabels(labels)) reject('labels', 'INVALID_LABEL_SIDECAR');
    if (labels.sourceSha256 !== sourceSha256 || labels.codebookVersion !== manifest.labelCodebookVersion) reject('labels', 'LABEL_SOURCE_OR_CODEBOOK_MISMATCH');
    if (labels.rows.length !== evidence.length) reject('labels/rows', 'LABEL_COVERAGE_MISMATCH');
    const applied = new Set<number>();
    // Labels address real Sheet1 row numbers; a combined file skips the other marketplace's rows.
    const byRow = new Map(evidence.map((row, index) => [row.row, { row, record: input.records[index] }]));
    labels.rows.forEach((label, i) => {
      const locator = `/rows/${i}`;
      const hit = byRow.get(label.row), row = hit?.row, record = hit?.record;
      if (!row || !record || applied.has(label.row)) reject(locator, 'LABEL_DUPLICATE_OR_EXTRA_ROW');
      if (label.rowSha256 !== row.rowSha256 || label.shopId !== row.shopId || label.listingId !== row.listingId ||
          label.contentSha256 !== row.contentSha256 || label.methodVersion !== manifest.labelCodebookVersion) reject(locator, 'STALE_OR_MISMATCHED_LABEL');
      applied.add(label.row);
      record.label = { classification: label.classification, group: label.group, contentSha256: label.contentSha256,
        methodVersion: label.methodVersion, adjudication: label.adjudication, source: { sourceSha256: labelSha256!, locator } };
    });
    input.sources.push({ sha256: labelSha256!, label: 'Frozen classification sidecar', representationRole: 'derived',
      evidenceFamily: manifest.source.evidenceFamily, provenanceBasis: labels.provenanceBasis });
  }
  const verifiedInput = validateMetricScopeInput(input);
  const inputSha256 = jsonHash(verifiedInput);
  return { input: verifiedInput, receipt: {
    contractVersion: '1.0.0', profileId: manifest.profileId, profileVersion: manifest.profileVersion,
    verification: 'EXACT_WORKBOOK_MAPPING_WITH_DECLARED_SCOPE', sourceSha256, manifestSha256, labelSha256,
    headerSha256: manifest.source.headerSha256, rowDigestMethod: 'canonical-typed-cells-v1',
    numericDisplay: 'OOXML lexical value; Excel rendered formatting is not reproduced',
    provenance: 'Operator supplied; byte verification does not authenticate provider collection, periods or adjudication.',
    inputSha256, evidence,
  } };
}

/** Backward-compatible A1 path: normalize first, then run the approved metric calculation. */
export function normalizeMetricWorkbook(workbook: Buffer, manifestBytes: Buffer, labelBytes?: Buffer) {
  const normalized = normalizeMetricWorkbookInput(workbook, manifestBytes, labelBytes);
  const result = calculateMetricScopes(normalized.input);
  if (result.inputSha256 !== normalized.receipt.inputSha256) {
    throw new TypeError('Normalized input identity drifted before calculation');
  }
  return { ...normalized, result };
}

/** Typed Sheet1 cells for read-only consumers such as the reader report; never a normalization. */
export type MetricSheetCell = Cell;
export type MetricSheetRow = RawRow;
export const METRIC_CURRENT_HEADERS: readonly string[] = CURRENT_HEADERS;
export function readMetricSheetRows(workbook: Buffer): MetricSheetRow[] { return readSheet(workbook); }

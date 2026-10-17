// Search-interest-by-province lane for the automated Market flow (S20). Off unless its flag is exactly "1",
// and only effective when the search-interest lane and its key are configured.
//
// One relative index per province (0-100, top place = 100) for the report keyword. Only the provinces are stored;
// the six regions and the region choice are computed by a pure rule at render time. It is a relative index,
// never a count of searches, buyers or sales, and it is never added to or compared with sales numbers.
import { defaultProviderTransport, type ProviderTransport } from './provider-common.js';
import type { ProviderCallOptions } from './providers.js';
import { MAX_SEARCH_GEO_PROVINCES, type SearchGeoReason, type StepSearchGeo, type StepSearchGeoProvince } from './model.js';
import { fetchTrends, planTrendsRequests, type TrendsCallResult } from './search-trends.js';

export const SEARCH_GEO_FLAG = 'TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED';
/** Usage ordinal of the province call inside the collection step (0-15 are taken by the other lanes). */
export const SEARCH_GEO_USAGE_ORDINAL = 16;
/** The rule looks at this many top provinces ... */
export const SEARCH_GEO_TOP = 10;
/** ... and picks a region only when it holds at least this many of them. */
export const SEARCH_GEO_MIN_IN_TOP = 5;
export const SEARCH_GEO_TABLE_NO = '5.2';
export const SEARCH_GEO_TABLE_TITLE = 'Mức quan tâm tìm kiếm theo vùng';
export const SEARCH_GEO_HEADERS = ['Vùng', 'Trung bình mức quan tâm', 'Số tỉnh trong 10 tỉnh đứng đầu'] as const;
export const SEARCH_GEO_NOTE = 'Chỉ số tương đối từ 0 đến 100 theo tỉnh, thành phố: 100 là nơi đứng đầu về mức quan tâm cho chính từ khóa này trong 12 tháng gần đây. ' +
  'Trung bình vùng chỉ tính các tỉnh có số; tỉnh thiếu số để trống, không tính là 0. Vùng theo cách chia 6 vùng của cơ quan thống kê, 63 tỉnh, thành phố trước sáp nhập.';
export const SEARCH_GEO_DONT = 'Đừng hiểu là: đây không phải số lượt tìm kiếm, không phải số người mua hay doanh số; tỉnh đứng đầu có thể do người bán tìm nhiều.';

export function searchGeoEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SEARCH_GEO_FLAG] === '1';
}

/** The executor-side port. It makes at most one paid request and never retries it. */
export interface SearchGeoSource {
  readonly id: 'SERPAPI';
  collect(keyword: string, options?: ProviderCallOptions): Promise<TrendsCallResult>;
}

export function createSearchGeoSource(apiKey: string | null, transport: ProviderTransport = defaultProviderTransport): SearchGeoSource {
  return {
    id: 'SERPAPI',
    async collect(keyword, options = {}) {
      const request = planTrendsRequests([keyword]).find(item => item.dataType === 'GEO_MAP_0');
      if (!request) return { status: 'FAILED', facts: null, captures: [] };
      return fetchTrends(apiKey, transport, request, options);
    },
  };
}

// ---------- province -> region (63 provinces before the 2025 merger, 6 regions, statistics office standard) ----------

export const VN_REGIONS = [
  'Trung du và miền núi phía Bắc',
  'Đồng bằng sông Hồng',
  'Bắc Trung Bộ và Duyên hải miền Trung',
  'Tây Nguyên',
  'Đông Nam Bộ',
  'Đồng bằng sông Cửu Long',
] as const;
export type VnRegion = typeof VN_REGIONS[number];

const REGION_PROVINCES: Readonly<Record<VnRegion, readonly string[]>> = {
  'Trung du và miền núi phía Bắc': ['Hà Giang', 'Cao Bằng', 'Bắc Kạn', 'Tuyên Quang', 'Lào Cai', 'Yên Bái', 'Thái Nguyên', 'Lạng Sơn', 'Bắc Giang', 'Phú Thọ', 'Điện Biên', 'Lai Châu', 'Sơn La', 'Hòa Bình'],
  'Đồng bằng sông Hồng': ['Hà Nội', 'Vĩnh Phúc', 'Bắc Ninh', 'Quảng Ninh', 'Hải Dương', 'Hải Phòng', 'Hưng Yên', 'Thái Bình', 'Hà Nam', 'Nam Định', 'Ninh Bình'],
  'Bắc Trung Bộ và Duyên hải miền Trung': ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa', 'Ninh Thuận', 'Bình Thuận'],
  'Tây Nguyên': ['Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng'],
  'Đông Nam Bộ': ['Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu', 'Hồ Chí Minh'],
  'Đồng bằng sông Cửu Long': ['Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Cần Thơ', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau'],
};

/** Spelling variants the provider may use, after the prefix and accent clean-up. */
const PROVINCE_ALIASES: ReadonlyMap<string, string> = new Map([
  ['thừa thiên - huế', 'Thừa Thiên Huế'], ['huế', 'Thừa Thiên Huế'], ['thua thien hue', 'Thừa Thiên Huế'],
  ['tp.hcm', 'Hồ Chí Minh'], ['hcm', 'Hồ Chí Minh'], ['ho chi minh city', 'Hồ Chí Minh'],
  ['hanoi', 'Hà Nội'], ['ha noi', 'Hà Nội'], ['ba ria - vung tau', 'Bà Rịa - Vũng Tàu'],
]);

/** NFC, old-style accent placement, no leading "tỉnh "/"thành phố ", one spelling of the dash. */
export function normalizeProvince(name: string): string {
  const cleaned = name.normalize('NFC').trim().replace(/\s+/gu, ' ')
    .replace(/^(?:tỉnh|thành phố|tp\.?)\s+/iu, '')
    .replace(/Hoá/gu, 'Hóa').replace(/Hoà/gu, 'Hòa').replace(/Đăk/gu, 'Đắk').replace(/Lăk/gu, 'Lắk')
    .replace(/\s*[-–—]\s*/gu, ' - ').trim();
  return PROVINCE_ALIASES.get(cleaned.toLowerCase()) ?? cleaned;
}

const PROVINCE_REGION: ReadonlyMap<string, VnRegion> = new Map(VN_REGIONS.flatMap(region => REGION_PROVINCES[region].map(province => [normalizeProvince(province), region] as const)));

/** The 63 province names as the map keeps them; exported for tests. */
export const VN_PROVINCES: readonly string[] = [...PROVINCE_REGION.keys()];

export function provinceRegion(name: string): VnRegion | null {
  return PROVINCE_REGION.get(normalizeProvince(name)) ?? null;
}

// ---------- stored document ----------

export type SearchGeoAttempt =
  | { readonly kind: 'SKIPPED'; readonly keyword: string; readonly reason: SearchGeoReason }
  | { readonly kind: 'THROWN'; readonly keyword: string }
  | { readonly kind: 'CALLED'; readonly keyword: string; readonly result: TrendsCallResult };

/** NFC, trimmed, single-spaced and case-folded; diacritics are kept because a different word is a different query. */
const queryKey = (text: string): string => text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC');
const valued = (provinces: readonly StepSearchGeoProvince[]): StepSearchGeoProvince[] => provinces.filter(item => item.index !== null);

/** The stored step field. A failure keeps a reason code and no provinces; it never changes the step outcome. */
export function searchGeoDocument(attempt: SearchGeoAttempt, captureIndex: number | null): StepSearchGeo {
  const base = { keyword: attempt.keyword, geo: 'VN', unit: 'INDEX_0_100', window: 'LAST_12_MONTHS' } as const;
  const failed = (reason: SearchGeoReason, retrievedAt: string | null, index: number | null): StepSearchGeo =>
    ({ status: 'FAILED', reason, ...base, retrievedAt, provinces: [], captureIndex: index });
  if (attempt.kind === 'SKIPPED') return { status: 'SKIPPED', reason: attempt.reason, ...base, retrievedAt: null, provinces: [], captureIndex: null };
  if (attempt.kind === 'THROWN') return failed('PROVIDER_FAILED', null, null);
  const { result } = attempt, last = result.captures.at(-1);
  const retrievedAt = last?.completedAt ?? null, index = last ? captureIndex : null;
  if (result.status === 'CANCELLED') return failed('CANCELLED', retrievedAt, index);
  if (result.status !== 'OK' || result.facts?.kind !== 'GEO_MAP_0') return failed('PROVIDER_FAILED', retrievedAt, index);
  // Only the map the provider echoes for the requested keyword is trusted; a different query (diacritics count) is never used instead.
  if (queryKey(result.facts.keyword) !== queryKey(attempt.keyword)) return failed('PROVIDER_FAILED', retrievedAt, index);
  const seen = new Set<string>(), provinces: StepSearchGeoProvince[] = [];
  for (const item of result.facts.regions) {
    const name = item.region.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (!name || seen.has(normalizeProvince(name))) continue;
    seen.add(normalizeProvince(name));
    provinces.push({ name, index: item.index });
    if (provinces.length === MAX_SEARCH_GEO_PROVINCES) break;
  }
  if (valued(provinces).length === 0) return failed('EMPTY_MAP', retrievedAt, index);
  return { status: 'COLLECTED', reason: null, ...base, retrievedAt, provinces, captureIndex: index };
}

/** The one predicate shared by both renderers and the evidence packet: S20 is bound for the map only when the block is drawn. */
export function searchGeoRenderable(value: StepSearchGeo | null | undefined): value is StepSearchGeo {
  return value?.status === 'COLLECTED' && value.captureIndex !== null && valued(value.provinces).some(item => provinceRegion(item.name) !== null);
}

// ---------- pure rule ----------

export interface SearchGeoRegionRow {
  readonly region: VnRegion;
  /** Average index over the region's provinces that have a value, rounded to one decimal; null when none has a value. */
  readonly average: number | null;
  readonly provincesWithValue: number;
  readonly inTop: number;
}

export type SearchGeoChoice =
  | { readonly kind: 'REGION'; readonly region: VnRegion; readonly inTop: number }
  | { readonly kind: 'NATIONWIDE'; readonly why: 'SPREAD'; readonly leading: readonly VnRegion[]; readonly leadingInTop: number }
  | { readonly kind: 'NATIONWIDE'; readonly why: 'TOO_FEW'; readonly valued: number }
  | { readonly kind: 'NATIONWIDE'; readonly why: 'UNMAPPED'; readonly unmapped: readonly string[] };

export interface SearchGeoSummary {
  readonly regions: readonly SearchGeoRegionRow[];
  /** Up to ten provinces with a value: index high to low, then name. */
  readonly top: readonly { readonly name: string; readonly index: number; readonly region: VnRegion | null }[];
  readonly choice: SearchGeoChoice;
}

const byName = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Top 10 by index (ties by name); a region holding 5 or more of them is the leading region, otherwise nationwide, no filter. */
export function summarizeSearchGeo(provinces: readonly StepSearchGeoProvince[]): SearchGeoSummary {
  const seen = new Set<string>(), rows: { name: string; index: number; region: VnRegion | null }[] = [];
  for (const item of provinces) {
    if (item.index === null || !Number.isFinite(item.index)) continue;
    const key = normalizeProvince(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name: key, index: item.index, region: provinceRegion(key) });
  }
  rows.sort((a, b) => b.index - a.index || byName(a.name, b.name));
  const top = rows.slice(0, SEARCH_GEO_TOP);
  const regions = VN_REGIONS.map(region => {
    const values = rows.filter(row => row.region === region).map(row => row.index);
    return { region, average: values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10 : null,
      provincesWithValue: values.length, inTop: top.filter(row => row.region === region).length };
  });
  let choice: SearchGeoChoice;
  if (rows.length < SEARCH_GEO_TOP) choice = { kind: 'NATIONWIDE', why: 'TOO_FEW', valued: rows.length };
  else if (top.some(row => row.region === null)) choice = { kind: 'NATIONWIDE', why: 'UNMAPPED', unmapped: top.filter(row => row.region === null).map(row => row.name) };
  else {
    const best = Math.max(...regions.map(row => row.inTop));
    const leading = regions.filter(row => row.inTop === best);
    choice = best >= SEARCH_GEO_MIN_IN_TOP && leading.length === 1
      ? { kind: 'REGION', region: leading[0]!.region, inTop: best }
      : { kind: 'NATIONWIDE', why: 'SPREAD', leading: leading.map(row => row.region), leadingInTop: best };
  }
  return { regions, top, choice };
}

// ---------- plain-Vietnamese text shared by both renderers ----------

/** One decimal with a Vietnamese comma; empty cell text when no province of the region has a value. */
export function searchGeoAverageText(value: number | null): string {
  return value === null ? '' : value.toFixed(1).replace('.', ',');
}

export interface SearchGeoText {
  readonly topLine: string;
  readonly result: string;
  readonly seen: string;
  readonly use: string;
  readonly dont: string;
}

export function searchGeoText(summary: SearchGeoSummary): SearchGeoText {
  // Unknown provider labels remain retained evidence, never visible report prose.
  const top5 = summary.top.slice(0, 5);
  const topLine = top5.length && top5.every(row => row.region !== null)
    ? `${top5.length} tỉnh, thành phố đứng đầu về mức quan tâm: ${top5.map(row => `${row.name} (${row.index})`).join(', ')}.` : '';
  const { choice } = summary;
  if (choice.kind === 'REGION') return { topLine,
    result: `Kết quả: vùng nổi bật là ${choice.region} (${choice.inTop} trong 10 tỉnh đứng đầu).`,
    seen: `Thấy gì: trong 10 tỉnh, thành phố đứng đầu về mức quan tâm, ${choice.inTop} tỉnh thuộc ${choice.region}.`,
    use: `Dùng để: chọn vùng ưu tiên khi chạy quảng cáo, hoặc chọn kho giao hàng gần ${choice.region}.`,
    dont: SEARCH_GEO_DONT };
  const use = 'Dùng để: chưa chọn vùng ưu tiên; chạy quảng cáo và giao hàng toàn quốc, không lọc theo vùng.';
  if (choice.why === 'SPREAD') {
    const lead = choice.leading.length <= 2 && choice.leadingInTop >= 2
      ? ` Dẫn đầu: ${choice.leading.join(' và ')} (${choice.leading.length > 1 ? 'mỗi vùng ' : ''}${choice.leadingInTop} tỉnh), không đủ để lọc.` : '';
    return { topLine, result: `Kết quả: toàn quốc, không lọc.${lead}`,
      seen: choice.leadingInTop >= SEARCH_GEO_MIN_IN_TOP
        ? `Thấy gì: hai vùng cùng có ${choice.leadingInTop} tỉnh trong 10 tỉnh, thành phố đứng đầu về mức quan tâm; không chọn riêng một vùng.`
        : `Thấy gì: 10 tỉnh, thành phố đứng đầu về mức quan tâm trải trên nhiều vùng; không vùng nào có từ ${SEARCH_GEO_MIN_IN_TOP} tỉnh trở lên.`, use, dont: SEARCH_GEO_DONT };
  }
  if (choice.why === 'TOO_FEW') return { topLine, result: 'Kết quả: toàn quốc, không lọc.',
    seen: `Thấy gì: chỉ ${choice.valued} tỉnh, thành phố có số; chưa đủ 10 tỉnh để so các vùng.`, use, dont: SEARCH_GEO_DONT };
  return { topLine, result: 'Kết quả: toàn quốc, không lọc.',
    seen: 'Thấy gì: có nơi trong 10 tỉnh đứng đầu không khớp danh sách 63 tỉnh, thành phố; không chọn vùng.', use, dont: SEARCH_GEO_DONT };
}

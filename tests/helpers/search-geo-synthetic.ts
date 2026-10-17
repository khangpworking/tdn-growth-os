import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import type { StepSearchGeo, StepSearchGeoProvince } from '../../src/modules/analysis/research-automation/model.js';
import { createSearchGeoSource, searchGeoDocument, VN_PROVINCES, type SearchGeoSource } from '../../src/modules/analysis/research-automation/search-geo.js';
import { SYNTHETIC_SERP_KEY } from './research-synthetic-sources.js';
import { SYNTHETIC_TRENDS_KEYWORD } from './search-interest-synthetic.js';

/** Top-10 lists that reproduce the region counts of the real 12-month maps (17/10/2026). */
export const GEO_FIXTURES = {
  // Đồng bằng sông Hồng 6 of 10 -> that region.
  'quạt điện': ['Hà Nội', 'Hải Phòng', 'Bắc Ninh', 'Hải Dương', 'Hưng Yên', 'Thái Bình', 'Hồ Chí Minh', 'Đà Nẵng', 'Thanh Hóa', 'Nghệ An'],
  // Đông Nam Bộ 4 and Đồng bằng sông Hồng 4 -> nationwide.
  'bình giữ nhiệt': ['Hồ Chí Minh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu', 'Hà Nội', 'Hải Phòng', 'Bắc Ninh', 'Quảng Ninh', 'Đà Nẵng', 'Cần Thơ'],
  // At most 3 in any region -> nationwide.
  'thạch dừa': ['Hồ Chí Minh', 'Bình Dương', 'Đồng Nai', 'Hà Nội', 'Hải Phòng', 'Bắc Ninh', 'Đà Nẵng', 'Khánh Hòa', 'Thanh Hóa', 'Cần Thơ'],
} as const satisfies Record<string, readonly string[]>;

/** Provider-style spellings for a few provinces, to exercise the clean-up. */
const PROVIDER_SPELLING: Readonly<Record<string, string>> = { 'Hồ Chí Minh': 'Thành phố Hồ Chí Minh', 'Thanh Hóa': 'Tỉnh Thanh Hoá', 'Đắk Lắk': 'Đăk Lăk', 'Bà Rịa - Vũng Tàu': 'Bà Rịa–Vũng Tàu' };

/** All 63 provinces: the top list gets 100..91, the rest 60 and below, and the last three have no value. */
export function syntheticGeoProvinces(top: readonly string[]): StepSearchGeoProvince[] {
  const rest = VN_PROVINCES.filter(name => !top.includes(name));
  return [...top.map((name, i) => ({ name: PROVIDER_SPELLING[name] ?? name, index: 100 - i })),
    ...rest.map((name, i) => ({ name: PROVIDER_SPELLING[name] ?? name, index: i >= rest.length - 3 ? null : Math.max(1, 60 - i) }))];
}

export function syntheticGeoBody(keyword: string, provinces: readonly StepSearchGeoProvince[]): string {
  return JSON.stringify({
    search_parameters: { engine: 'google_trends', q: keyword, data_type: 'GEO_MAP_0', geo: 'VN', hl: 'vi', date: 'today 12-m' },
    interest_by_region: provinces.map((item, i) => ({ geo: `VN-${i}`, location: item.name, max_value_index: 0,
      value: item.index === null ? '<1' : String(item.index), extracted_value: item.index ?? 0 })),
  });
}

export type SyntheticGeoMode = 'ok' | 'http-error' | 'invalid' | 'empty' | 'other-keyword';

/** The real trends client over a synthetic transport; no network, one answer per call. */
export function syntheticGeoSource(onCall: (url: URL) => void, mode: SyntheticGeoMode = 'ok', top: readonly string[] = GEO_FIXTURES['quạt điện'], keyword = SYNTHETIC_TRENDS_KEYWORD): SearchGeoSource {
  const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      onCall(new URL(String(input)));
      if (mode === 'http-error') return json(JSON.stringify({ error: 'synthetic failure' }), 500);
      if (mode === 'invalid') return json(JSON.stringify({ search_parameters: { q: keyword }, interest_by_region: { unexpected: true } }));
      if (mode === 'empty') return json(syntheticGeoBody(keyword, VN_PROVINCES.map(name => ({ name, index: null }))));
      return json(syntheticGeoBody(mode === 'other-keyword' ? 'nồi chiên không dầu' : keyword, syntheticGeoProvinces(top)));
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return createSearchGeoSource(SYNTHETIC_SERP_KEY, transport);
}

/** A stored COLLECTED map as the step document keeps it. */
export function syntheticSearchGeo(top: readonly string[] = GEO_FIXTURES['quạt điện'], overrides: Partial<StepSearchGeo> = {}): StepSearchGeo {
  return { ...searchGeoDocument({ kind: 'SKIPPED', keyword: SYNTHETIC_TRENDS_KEYWORD, reason: 'PERIOD_NOT_COVERED' }, null),
    status: 'COLLECTED', reason: null, retrievedAt: '2026-10-02T00:00:01.000Z', provinces: syntheticGeoProvinces(top), captureIndex: 2, ...overrides };
}

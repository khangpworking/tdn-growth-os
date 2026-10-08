import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';

export const sync1Options = { limitations: ['Nguồn bán hàng là số ước tính.'], builtOn: '08/10/2026', flint: false } as const;
export function sync1ReaderFixture(version: ReaderReportInput['contractVersion'] = '1.2.0'): ReaderReportInput {
  return {
    contractVersion: version,
    profile: {
      slug: 'synthetic-sync', product: 'Bình thử', status: 'proposed',
      segments: { A: 'Bình nhỏ', B: 'Bình lớn' }, short: { A: 'Nhỏ', B: 'Lớn' }, core: ['A', 'B'], non: [],
      rules: [{ seg: 'B', when: { titleRe: 'lớn' }, why: 'Tiêu đề ghi bình lớn' }, { seg: 'A', when: {}, why: 'Các dòng còn lại' }], signals: [],
    },
    platforms: ['shopee', 'tiktok'],
    rows: ['shopee', 'tiktok'].flatMap((platform, p) => Array.from({ length: 6 }, (_, j) => {
      const i = p * 10 + j, rev = (j + 1) * 1_000_000 * (p + 1), units = (j + 1) * 10;
      return { i, platform, listing: `listing-${i}`, shop: `shop-${j % 3}`, shopName: `Shop ${String.fromCharCode(65 + j % 3)}`, cat: 'Bình',
        rev, units, asp: rev / units, brand: 'Tên giống nhau', title: j % 2 ? 'Bình lớn' : 'Bình nhỏ', start: null };
    })) as ReaderReportInput['rows'],
    source: {
      measurementPeriod: { start: '2026-01-01', end: '2026-01-31' }, rowCap: 5000,
      displayedHeadlines: { revenueVnd: 100_000_000, soldListings: 50, shops: 10, units: 2000 },
      platformBreakdown: { shopee: { displayedRevenueVnd: 40_000_000 }, tiktok: { displayedRevenueVnd: 60_000_000 } },
    },
    ...(version === '1.0.0' ? {} : { rowLineage: { sha256: 'a'.repeat(64) } }),
  };
}

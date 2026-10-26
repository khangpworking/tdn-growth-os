import type { MetricV3CaptureSpec } from '../../contracts/analysis/metric-v3-capture-spec.generated.js';

// The verified tree in docs/metric/v3-capture-map.md; no unverified taxonomy is offered.
export const metricV3Category: MetricV3CaptureSpec['preset']['category'] = {
  id: 'c2035652732', label: 'Sức Khoẻ', children: [
    { id: 'c407923064', label: 'Chăm sóc sức khỏe' },
    { id: 'c1221630203', label: 'Dinh dưỡng thể thao, protein' },
    { id: 'c1110582659', label: 'Sức khỏe khác' },
    { id: 'c2140822537', label: 'Thực phẩm chức năng' },
  ],
};

export function metricV3Defaults(keyword1: string, keyword2: string, endDate: string): MetricV3CaptureSpec {
  const start = (days: number) => new Date(Date.parse(endDate) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { contractVersion: 'metric-v3-capture-spec-v1', preset: {
    keywords: [keyword1, keyword2], smartQuery: true, category: structuredClone(metricV3Category),
    usefulFilters: { fake: true, gifts: true, deleted: true },
    advancedFilter: { firstField: 'rating_count', operator: '>', firstRate: 1, secondField: 'order_count', secondRate: 0.02 },
    shopTypes: ['mall', 'regular'], platforms: ['shopee', 'lazada', 'tiki', 'tiktok'],
    aiNormalisation: false, customizeCategory: false, exclusions: [],
  }, windows: [
    { id: '30d', period: { startDate: start(30), endDate }, intervalDays: 7 },
    { id: '12m', period: { startDate: start(365), endDate }, intervalDays: 30 },
  ] };
}

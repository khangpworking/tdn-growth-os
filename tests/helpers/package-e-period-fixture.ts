import { createHash } from 'node:crypto';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';

export const periodProducts = [
  { key: 'shopee:91001', label: 'Bình thử nghiệm A', days: 5, end: '2026-10-05', full: '112213', final: '910019' },
  { key: 'sample:92002', label: 'Khay thử nghiệm B', days: 29, end: '2026-10-29', full: '223327', final: '820028' },
  { key: 'sample:93003', label: 'Giỏ thử nghiệm C', days: 30, end: '2026-10-30', full: '337439', final: '730037' },
] as const;

export interface PeriodCapture {
  ordinal: number;
  key: string;
  start: string;
  end: string;
  revenue: string;
  price?: string | null;
  range?: readonly [string, string] | null;
  retrievedAt?: string;
  acquiredAt?: string;
}

export function periodCaptures(): PeriodCapture[] {
  return periodProducts.flatMap((product, index) => [
    { ordinal: index * 2 + 1, key: product.key, start: '2026-09-01', end: '2026-09-30', revenue: product.full, price: '410041' },
    { ordinal: index * 2 + 2, key: product.key, start: '2026-10-01', end: product.end, revenue: product.final,
      price: String(510051 + index * 100010), retrievedAt: `2026-11-0${index + 1}T01:00:00Z` },
  ]);
}

/** Minimal retained inventory, deliberately independent of the presentation code. */
export function periodInventory(captures = periodCaptures()): AutomationMarketMethodSnapshot {
  const source = (ordinal: number, field: string) => ({
    sourceSha256: createHash('sha256').update(`invented period ${ordinal}`).digest('hex'), fieldPointer: `/data/${field}`,
  });
  return {
    temporal: { input: {
      frame: { members: [...new Set(captures.map(capture => capture.key))].map(memberKey => ({ memberKey })) },
      observations: captures.flatMap(capture => [
        { literal: 'revenue', decimal: capture.revenue, unit: 'VND', currency: 'VND' },
        { literal: 'sales_volumn', decimal: capture.revenue === '0' ? '0' : '17', unit: null, currency: null },
      ].map(measure => ({
        observationId: `capture-${capture.ordinal}-${measure.literal}`, subjectMemberKeys: [capture.key],
        retrievedAt: capture.retrievedAt ?? '2026-11-01T01:00:00Z',
        requestedWindow: { start: '2026-01-01', end: '2026-12-31' }, rawQuery: { start: capture.start, end: capture.end },
        measure: { literal: measure.literal, unit: measure.unit, currency: measure.currency },
        value: { decimal: measure.decimal, literal: null }, source: source(capture.ordinal, measure.literal),
      }))),
    } },
    quotes: { input: { quotes: captures.flatMap(capture => {
      const base = { acquiredAt: capture.acquiredAt ?? '2026-11-01T01:00:00Z',
        offerText: JSON.stringify({ provider_product_id: capture.key.split(':').at(-1) }),
        source: source(capture.ordinal, 'price') };
      return [{ ...base, quoteId: `capture-${capture.ordinal}-unit-price`,
        price: { value: capture.price ?? null, range: null, currency: 'VND', state: capture.price ? 'NON_EXACT' : 'UNREADABLE' } },
      ...(capture.range ? [{ ...base, quoteId: `capture-${capture.ordinal}-price-range`,
        price: { value: null, range: { minimum: capture.range[0], maximum: capture.range[1] }, currency: 'VND', state: 'RANGE' } }] : [])];
    }) } },
  } as unknown as AutomationMarketMethodSnapshot;
}

export const periodLabels = () => new Map(periodProducts.map(product => [product.key as string, product.label as string]));
export const periodContext = () => ({
  platforms: new Map<string, string>(periodProducts.map((product, index) => [product.key, index === 0 ? 'shopee' : 'tiktok'])),
  scope: { selectedProductIds: periodProducts.slice(0, 2).map(product => product.key as string),
    peerProductIds: [periodProducts[2].key as string] },
  sampleWindow: { start: '2026-09-04', end: '2026-10-03' },
});

export function periodDeliveryCases() {
  return [
    { name: 'empty', snapshot: periodInventory([]) },
    { name: 'no-sales', snapshot: periodInventory([{ ...periodCaptures()[0]!, revenue: '0', price: null }]) },
  ];
}

export function withPeriodInventory(base: AutomationReportInput): AutomationReportInput {
  return { ...base, marketInventory: periodInventory(),
    scope: { ...base.scope, ...periodContext().scope },
    collection: { ...base.collection!, productCards: periodProducts.map(product => ({ productId: product.key, title: product.label })) },
    marketPresentation: { ...base.marketPresentation!, unitPrices: [] },
  } as unknown as AutomationReportInput;
}

/** Used with each checkout's own full fixture and builder to obtain byte controls. */
export function periodByteCases(base: AutomationReportInput) {
  const inventory = withPeriodInventory(base);
  const { marketPresentation: _presentation, ...legacy } = inventory;
  return [
    { name: 'insight-with-inventory', input: inventory, kind: 'INSIGHT' },
    { name: 'legacy-market-with-inventory', input: legacy, kind: 'MARKET' },
    { name: 'market14-without-inventory', input: base, kind: 'MARKET' },
    { name: 'market14-with-inventory', input: inventory, kind: 'MARKET' },
  ] as const;
}

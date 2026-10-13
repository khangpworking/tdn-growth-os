import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopeeListingRequest } from '../../contracts/foundation/shopee-listing-request.generated.js';
import { selectShopeeListings } from '../../src/modules/foundation/shopee-selection.js';

const request = (rows: Array<{ shopId: string; itemId: string; revenue: string; brand?: string | null }>): ShopeeListingRequest => ({
  contractVersion: '1.0.0', runKey: 'synthetic-diversity-001', topic: 'Synthetic review selection',
  period: { start: '2026-01-01T00:00:00Z', end: '2026-01-31T23:59:59Z' },
  source: { label: 'Synthetic sales ranking', acquiredAt: '2026-02-01T00:00:00Z' },
  listings: rows.map(row => ({ platform: 'shopee', shopId: row.shopId, itemId: row.itemId,
    ...(row.brand === undefined ? {} : { brand: row.brand }), productKey: `synthetic-${row.itemId}`,
    groupingBasis: 'Synthetic confirmed product row', productName: 'Synthetic product',
    productUrl: `https://shopee.vn/product/${row.shopId}/${row.itemId}`,
    periodRevenueVnd: row.revenue, revenuePrecision: 'exact' })),
});

test('selection walks revenue ranking while enforcing normalized shop and brand diversity', () => {
  const selection = selectShopeeListings(request([
    { shopId: '11', itemId: '101', revenue: '900', brand: '  Bra\u0308nd A  ' },
    { shopId: '11', itemId: '102', revenue: '800', brand: 'Brand B' },
    { shopId: '12', itemId: '103', revenue: '700', brand: 'BRÄND A' },
    { shopId: '12', itemId: '104', revenue: '600', brand: 'Brand C' },
    { shopId: '13', itemId: '105', revenue: '500', brand: 'Brand D' },
    { shopId: '14', itemId: '106', revenue: '400', brand: 'brand d' },
    { shopId: '15', itemId: '107', revenue: '300' },
    { shopId: '16', itemId: '108', revenue: '200', brand: 'Brand E' },
    { shopId: '17', itemId: '109', revenue: '100', brand: 'Brand F' },
  ]));
  assert.deepEqual(selection.selected.map(row => row.itemId), ['101', '104', '105', '107', '108']);
  assert.equal(new Set(selection.selected.map(row => row.shopId)).size, selection.selected.length);
  assert.equal(selection.warnings.length, 0);

  const short = selectShopeeListings(request([
    { shopId: '11', itemId: '201', revenue: '300', brand: 'Brand X' },
    { shopId: '11', itemId: '202', revenue: '200', brand: 'Brand Y' },
    { shopId: '11', itemId: '203', revenue: '100' },
  ]));
  assert.deepEqual(short.selected.map(row => row.itemId), ['201']);
  assert.ok(short.warnings.includes('fewer_than_five_diverse_products'));
});

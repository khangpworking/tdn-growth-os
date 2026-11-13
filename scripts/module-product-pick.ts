import { metricTitleGroup } from '../src/modules/foundation/metric-product-groups.js';

export const MODULE_PICK_POLICY = 'metric-products-unique-v1';
export class ProductPickError extends Error {
  /** True only when a readable row has higher period revenue than the row before it. */
  constructor(message: string, readonly orderBroken = false) { super(message); }
}
type Row = Record<string, unknown>;
export function rankedMetricProducts(raw: unknown, part: Row) {
  const map = part.sourceMap as Row | undefined;
  const pointer = typeof map?.products === 'string' ? /^raw-responses\.json#\/(\d+)\/body\/data$/.exec(map.products) : null;
  const response = pointer && Array.isArray(raw) ? raw[Number(pointer[1])] as Row | undefined : undefined;
  const request = response?.requestBody as Row | undefined, body = response?.body as Row | undefined;
  const data = body?.data as Row | undefined, products = data?.products;
  if (response?.urlPath !== '/v2/market/analytics/products/' || response.status !== 200 || body?.status !== 'success' ||
      request?.sort_by !== 'revenue_custom__desc' || request.page !== 0 || !Array.isArray(products) || products.length > 200)
    throw new ProductPickError('PICK_NATIVE_PERIOD_ORDER_UNVERIFIED');
  const rows: Row[] = [];
  let previous: number | null = null;
  for (const value of products) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductPickError('PICK_CANDIDATE_INVALID');
    const row = value as Row, revenue = row.revenue_custom;
    // No lifetime revenue fallback or numeric conversion that turns missing/empty data into zero.
    if ((typeof revenue !== 'number' && typeof revenue !== 'string') || revenue === '' ||
        (typeof revenue === 'string' && !/^\d+(?:\.\d+)?$/.test(revenue)) ||
        !Number.isFinite(Number(revenue)) || Number(revenue) < 0)
      throw new ProductPickError('PICK_NATIVE_PERIOD_ORDER_UNVERIFIED');
    if (previous !== null && Number(revenue) > previous) throw new ProductPickError('PICK_NATIVE_PERIOD_ORDER_UNVERIFIED', true);
    previous = Number(revenue); rows.push(row);
  }
  return { rows, sourceMap: map!.products as string };
}

export function derivePeriodProductPick(raw: unknown, part: Row, rawSha256: string) {
  const { rows, sourceMap } = rankedMetricProducts(raw, part);
  const links: { rank: number; sourceRank: number; productBaseId: string; shopId: string; itemId: string; url: string;
    productName: string; shopName: string | null; brand: string | null; revenue: number; groupKey: string; groupingBasis: string; reason: string }[] = [];
  const skipped: { sourceRank: number; productBaseId: string | null; reason: string; duplicateOfRank: number | null }[] = [];
  const groups: { group: NonNullable<ReturnType<typeof metricTitleGroup>>; rank: number }[] = [];
  const listingIds = new Set<string>();
  let unresolvedCount = 0;
  for (const [i, row] of rows.entries()) {
    if (links.length === 5) break;
    const sourceRank = i + 1, id = typeof row.product_base_id === 'string' ? row.product_base_id : null;
    if (id && /^[238]__/.test(id)) continue;
    const match = id && /^1__([1-9][0-9]{0,19})__([1-9][0-9]{0,19})$/.exec(id);
    const skip = (reason: string, duplicateOfRank: number | null = null) => skipped.push({ sourceRank, productBaseId: id, reason, duplicateOfRank });
    if (!match || (row.platform_id != null && row.platform_id !== 1) ||
        (row.shop_base_id != null && String(row.shop_base_id) !== match[2])) {
      unresolvedCount++; skip('PICK_LISTING_ID_UNRESOLVED'); continue;
    }
    if (listingIds.has(id!)) throw new ProductPickError('PICK_DUPLICATE_SOURCE_ID');
    listingIds.add(id!);
    const brand = row.final_brand ?? row.brand;
    const group = metricTitleGroup(row.product_name, brand);
    if (!group) { unresolvedCount++; skip('PICK_TITLE_GROUP_UNRESOLVED'); continue; }
    const prior = groups.find(g => g.group.key === group.key);
    if (prior) { skip('SAME_TITLE_COMPONENT_GROUP', prior.rank); continue; }
    const ambiguousStrength = groups.some(g => g.group.base === group.base &&
      g.group.components.some((c, n) => c.strength !== group.components[n]?.strength &&
        (c.strength === null || group.components[n]?.strength === null)));
    if (ambiguousStrength) { unresolvedCount++; skip('PICK_STRENGTH_UNRESOLVED'); continue; }
    const rank = links.length + 1;
    groups.push({ group, rank });
    links.push({ rank, sourceRank, productBaseId: id!, itemId: match[1]!, shopId: match[2]!,
      url: `https://shopee.vn/product/${match[2]}/${match[1]}`, productName: row.product_name as string,
      shopName: typeof row.shop_name === 'string' ? row.shop_name : null,
      brand: typeof brand === 'string' ? brand : null, revenue: Number(row.revenue_custom), groupKey: group.key,
      groupingBasis: group.basis, reason: `Hạng nguồn ${sourceRank}; nhóm tên và thành phần theo finite-title-components-v1.` });
  }
  return { links, pickRuleVersion: MODULE_PICK_POLICY,
    counts: { walked: rows.length, eligible: rows.filter(r => typeof r.product_base_id === 'string' && r.product_base_id.startsWith('1__')).length,
      picked: links.length, deleted: 0, notIncluded: 0, tokenGuardRejected: 0, maskedRows: 0, maskedAboveLowestPick: 0 },
    selectionProof: { sourceMap, rawSha256, windowId: (part.window as Row).id, sortBy: 'revenue_custom__desc',
      candidateCount: rows.length, distinctCount: links.length, unresolvedCount,
      shortageReason: unresolvedCount ? 'PICK_TITLE_GROUP_UNRESOLVED' : links.length < 5 ? 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS' : null, skipped } };
}

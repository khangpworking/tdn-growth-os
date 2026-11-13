import { metricTitleGroup } from '../src/modules/foundation/metric-product-groups.js';
import { PICK_JEV_PROVIDER, PICK_JEV_QUESTION_VERSION, PICK_JEV_THRESHOLD, askPickJev, pickQuestion, validPickProbabilities, type PickJev } from './module-product-pick-jev.js';

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

/** Rule v2 (work package C1, section 3): walk the same rows; one Jev question per row once a product is picked. */
export const MODULE_PICK_POLICY_V2 = 'metric-products-unique-v2';
export type PickDecision = { sourceRank: number; productBaseId: string; choice: string; probabilities: Record<string, number>;
  outcome: 'PICKED' | 'DUPLICATE' | 'UNSURE' };
/** Gives the answer for one row. The live pick asks Jev; the replay reads the saved decisions. */
export type PickClassifier = (input: { sourceRank: number; productBaseId: string; row: Row; picked: readonly Row[] }) =>
  Promise<{ choice: string; probabilities: Record<string, number> }>;

export async function deriveJevProductPick(raw: unknown, part: Row, rawSha256: string, model: string, classify: PickClassifier) {
  const { rows, sourceMap } = rankedMetricProducts(raw, part);
  const links: { rank: number; sourceRank: number; productBaseId: string; shopId: string; itemId: string; url: string;
    productName: string; shopName: string | null; brand: string | null; revenue: number; reason: string }[] = [];
  const skipped: { sourceRank: number; productBaseId: string | null; reason: string; duplicateOfRank: number | null }[] = [];
  const decisions: PickDecision[] = [];
  const pickedRows: Row[] = [];
  const listingIds = new Set<string>();
  let unresolvedCount = 0;
  for (const [i, row] of rows.entries()) {
    if (links.length === 5) break;
    const sourceRank = i + 1, id = typeof row.product_base_id === 'string' ? row.product_base_id : null;
    if (id && /^[238]__/.test(id)) continue;
    const match = id && /^1__([1-9][0-9]{0,19})__([1-9][0-9]{0,19})$/.exec(id);
    const skip = (reason: string, duplicateOfRank: number | null = null) => skipped.push({ sourceRank, productBaseId: id, reason, duplicateOfRank });
    // Real Metric rows carry the platform prefix (`1__<shopId>`); the bare shop id is also accepted.
    if (!match || (row.platform_id != null && row.platform_id !== 1) ||
        (row.shop_base_id != null && String(row.shop_base_id) !== `1__${match[2]}` && String(row.shop_base_id) !== match[2])) {
      unresolvedCount++; skip('PICK_LISTING_ID_UNRESOLVED'); continue;
    }
    if (listingIds.has(id!)) throw new ProductPickError('PICK_DUPLICATE_SOURCE_ID');
    listingIds.add(id!);
    if (typeof row.product_name !== 'string' || !row.product_name.trim()) throw new ProductPickError('PICK_CANDIDATE_INVALID');
    if (pickedRows.length) {
      const { choice, probabilities } = await classify({ sourceRank, productBaseId: id!, row, picked: [...pickedRows] });
      const sure = (probabilities[choice] ?? 0) >= PICK_JEV_THRESHOLD;
      const outcome = !sure ? 'UNSURE' : choice === 'MOI' ? 'PICKED' : 'DUPLICATE';
      decisions.push({ sourceRank, productBaseId: id!, choice, probabilities, outcome });
      if (outcome === 'UNSURE') { unresolvedCount++; skip('PRODUCT_MATCH_UNSURE'); continue; }
      if (outcome === 'DUPLICATE') { skip('SAME_PRODUCT', Number(choice.slice(2))); continue; }
    }
    const brand = row.final_brand ?? row.brand;
    pickedRows.push(row);
    links.push({ rank: links.length + 1, sourceRank, productBaseId: id!, itemId: match[1]!, shopId: match[2]!,
      url: `https://shopee.vn/product/${match[2]}/${match[1]}`, productName: row.product_name,
      shopName: typeof row.shop_name === 'string' ? row.shop_name : null,
      brand: typeof brand === 'string' ? brand : null, revenue: Number(row.revenue_custom),
      reason: links.length ? `Hạng nguồn ${sourceRank}; khác các sản phẩm đã chọn.` : `Hạng nguồn ${sourceRank}; sản phẩm đầu tiên bán trên Shopee.` });
  }
  return { links, pickRuleVersion: MODULE_PICK_POLICY_V2,
    counts: { walked: rows.length, eligible: rows.filter(r => typeof r.product_base_id === 'string' && r.product_base_id.startsWith('1__')).length,
      picked: links.length, deleted: 0, notIncluded: 0, tokenGuardRejected: 0, maskedRows: 0, maskedAboveLowestPick: 0 },
    selectionProof: { sourceMap, rawSha256, windowId: (part.window as Row).id, sortBy: 'revenue_custom__desc',
      candidateCount: rows.length, distinctCount: links.length, unresolvedCount,
      shortageReason: links.length === 5 ? null : unresolvedCount ? 'PICK_PRODUCT_UNRESOLVED' : 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS', skipped,
      matcher: { provider: PICK_JEV_PROVIDER, model, questionVersion: PICK_JEV_QUESTION_VERSION, threshold: PICK_JEV_THRESHOLD },
      decisions } };
}

/** The live v2 pick: one Jev question per row, asked with retries; a failed question throws PICK_JEV_UNAVAILABLE. */
export function pickProductsWithJev(raw: unknown, part: Row, rawSha256: string, jev: PickJev, sleep?: (ms: number) => Promise<void>) {
  return deriveJevProductPick(raw, part, rawSha256, jev.model, async ({ row, picked }) => {
    try { return await askPickJev(jev, pickQuestion(row, picked), sleep); }
    catch { throw new ProductPickError('PICK_JEV_UNAVAILABLE'); }
  });
}

/**
 * Re-runs the v2 walk on the saved step-1 rows with the saved answers, never asking Jev. Each saved decision must be
 * the next question of the walk (same row, options SP1..SPn + MOI) and the list must be used up; otherwise
 * PICK_PROOF_MISMATCH. Outcomes, links and skips are recomputed, so the caller compares the result with the file.
 */
export async function replayJevProductPick(raw: unknown, part: Row, rawSha256: string, model: string, saved: unknown) {
  const mismatch = () => new ProductPickError('PICK_PROOF_MISMATCH');
  if (!Array.isArray(saved)) throw mismatch();
  let next = 0;
  const replay = await deriveJevProductPick(raw, part, rawSha256, model, async ({ sourceRank, productBaseId, picked }) => {
    const decision = saved[next++] as Row | undefined;
    const options = [...picked.map((_, i) => `SP${i + 1}`), 'MOI'];
    if (!decision || decision.sourceRank !== sourceRank || decision.productBaseId !== productBaseId ||
        typeof decision.choice !== 'string' || !options.includes(decision.choice) || !validPickProbabilities(decision.probabilities, options))
      throw mismatch();
    return { choice: decision.choice, probabilities: decision.probabilities };
  });
  if (next !== saved.length) throw mismatch();
  return replay;
}

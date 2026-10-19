import { captureRelevanceLookup, type CaptureRelevanceRecord } from './capture-relevance.js';
import type { AutomationMetricWebSnapshotV1 } from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';

/** App-side policy. Absence on a retained method means the original capture v1 semantics. */
export const CAPTURE_ROW_PROFILE_V2 = 'automation-metric-capture-v2' as const;
/** Opt-in floor; production defaults to v2 until a relevance model is configured. */
export const CAPTURE_ROW_PROFILE = 'automation-metric-capture-v3' as const;
export type CaptureRowProfile = typeof CAPTURE_ROW_PROFILE_V2 | typeof CAPTURE_ROW_PROFILE;
export const isCaptureRowProfile = (value: unknown): value is CaptureRowProfile => value === CAPTURE_ROW_PROFILE_V2 || value === CAPTURE_ROW_PROFILE;
export type CaptureRowExclusionReason = 'NOT_MAIN_PRODUCT' | 'REVENUE_WITHOUT_UNITS' | 'UNIT_REVENUE_OUTLIER';

/** Counts in this cell are source strings; lifetime sold is never a period observation. */
export function splitCaptureNameCell(name: string, shop: string) {
  const match = /^(.*?)\s+([\d.,]+)\s+reviews\s+Total\s+sold\s+products:\s*([\d.,]+)\s+Created\s+date:\s*(\d{2}\/\d{4})\s*(.*)$/iu.exec(name);
  return match ? { title: match[1]!.trim(), shop: shop || match[5]!.trim(), reviews: match[2]!, lifetimeSold: match[3]!, createdMonth: match[4]! }
    : { title: name, shop, reviews: null, lifetimeSold: null, createdMonth: null };
}

const words = (text: string): string[] => text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
const v2PrefixTerms = [
  'power bank', 'sạc dự phòng', 'sạc', 'pin', 'mô tơ', 'motor', 'moter', 'động cơ', 'tụ', 'dầu', 'cánh', 'lồng',
  'stator', 'bạc đạn', 'công tắc', 'điều khiển', 'remote', 'adapter', 'linh kiện', 'phụ kiện', 'nắp', 'ốp', 'vỏ',
  'dây', 'giá đỡ', 'miếng dán', 'bút', 'cho', 'dùng cho', 'thay', 'thay thế', 'của',
].map(words);
/** The v3 boolean is deliberately title-only; metadata decisions require the batch API. */
export function isMainCapturedProduct(title: string, keyword: string, profile: CaptureRowProfile = CAPTURE_ROW_PROFILE_V2): boolean {
  if (profile === CAPTURE_ROW_PROFILE) return assessCaptureTitle(title, keyword).reason === null;
  const head = words(keyword)[0];
  if (!head) return false;
  const titleWords = words(title), first = titleWords.indexOf(head);
  if (first < 0) return false;
  const prefix = titleWords.slice(0, first);
  return !v2PrefixTerms.some(term => prefix.some((_, i) => term.every((word, j) => prefix[i + j] === word)));
}

export type CaptureQualityRow = {
  readonly title: string;
  readonly platform: string;
  readonly revenue: number | null;
  readonly units: number | null;
  readonly categoryText?: string | null;
  readonly price?: number | null;
};

type RelevanceReason = 'ACCESSORY_FOR_TARGET' | 'SECONDARY_GIFT' | 'TITLE_CATEGORY_MISMATCH';
const phrases = (value: string) => value.split('|').map(words);
const has = (seq: readonly string[], at: number, term: readonly string[]) => term.length > 0 && term.every((word, j) => seq[at + j] === word);
const includes = (seq: readonly string[], term: readonly string[]) => seq.some((_, i) => has(seq, i, term));
const strongRelations = phrases('dùng cho|lắp cho|đựng|tương thích với');
const weakRelations = phrases('dành cho|thay thế cho|thay thế|thay cho|cho|của|phụ kiện|linh kiện|phụ tùng');
const promos = phrases('hàng chính hãng|chính hãng|hàng loại 1|loại 1|hỏa tốc|hoả tốc|freeship|giá sỉ siêu tốt|giá sỉ|giá tốt|flash sale|siêu sale|sale|hot|deal|best seller|bán chạy|thanh lý|xả kho|giảm giá');
const quantityUnits = new Set(words('cái chiếc đôi cặp hộp gói thùng bịch túi lọ chai hũ tuýp viên bộ kg g ml l mét cm mm'));
const quantifiers = new Set(words('các mọi những loại dòng mẫu kiểu'));
const bundles = phrases('kèm|gồm|bao gồm|bộ quà tặng|quà tặng|combo|set');
const refills = phrases('ruột thay thế|lõi thay thế|nạp lại|refill');
const attributes = phrases('bổ sung|có chứa|chứa|thành phần|hương|vị|chiết xuất');
const unresolvedPrimary = phrases('sản phẩm|mặt hàng|thiết kế|tính năng|công dụng|phù hợp|sử dụng|hỗ trợ|khuyến mãi|khuyến mại|ưu đãi|mua|thay thế|thay cho');
const soldItem = (seq: readonly string[]) => seq.some(word => /\p{L}/u.test(word)) && !unresolvedPrimary.some(term => includes(seq, term));
const unavailable = /^(?:unknown|uncategori[sz]ed|n\/a|null|undefined|0|[-–—]|\(trống\))$/iu;
const categoryKey = (value: string | null | undefined): string | null => {
  const key = typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
  return !key || unavailable.test(key) ? null : key;
};
const priceValue = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export function assessCaptureTitle(title: string, keyword: string) {
  const original = title.normalize('NFC'), target = words(keyword);
  const tokens = [...original.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].map(match => ({ word: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length }));
  const seq = tokens.map(token => token.word), head = target[0];
  const matches = seq.flatMap((word, i) => word === head ? [{ at: i, full: has(seq, i, target), start: tokens[i]!.start,
    end: tokens[has(seq, i, target) ? i + target.length - 1 : i]!.end }] : []);
  const consumed = new Set<number>();
  let leading = 0;
  while (leading < seq.length) {
    const promo = promos.find(term => !includes(target, term) && has(seq, leading, term));
    const buy = seq[leading] === 'mua' && /^\d+$/u.test(seq[leading + 1] ?? '') && seq[leading + 2] === 'tặng' && /^\d+$/u.test(seq[leading + 3] ?? '');
    const size = promo?.length ?? (buy ? 4 : 0);
    if (!size) break;
    for (let i = leading; i < leading + size; i++) consumed.add(i);
    leading += size;
  }
  for (let i = 0; i < seq.length - 1; i++) if (/^\d+(?:[.,]\d+)?$/u.test(seq[i]!) && quantityUnits.has(seq[i + 1]!) && !matches.some(match => i >= match.at && i < match.at + target.length)) {
    consumed.add(i); consumed.add(i + 1); i++;
  }
  const clue = (terms: readonly string[][], end = seq.length) => terms.some(term => !includes(target, term) && seq.slice(0, end).some((_, i) => has(seq, i, term) && i + term.length <= end));
  const first = matches[0], weak: string[] = [], review: string[] = [];
  const prefix = first ? seq.slice(0, first.at).filter((_, i) => !consumed.has(i)) : [];
  const giftAt = seq.findIndex((word, i) => word === 'tặng' && !consumed.has(i) && seq[i - 1] !== 'quà' && !includes(target, ['tặng']));
  const bundleEnd = giftAt >= 0 && first && giftAt < first.at ? (seq[giftAt - 1] === 'kèm' ? giftAt - 1 : giftAt) : first?.at ?? seq.length;
  const containingTarget = seq.some((word, i) => (word === 'kèm' || word === 'gồm') && !includes(target, [word]) && seq[i - 1] !== 'tặng' && seq[i + 1] !== 'tặng' && matches.some(match => match.at > i));
  const bundle = containingTarget || clue(bundles, bundleEnd) ||
    (prefix[0] === 'bộ' && !includes(target, ['bộ']));
  const refill = clue(refills), attribute = first !== undefined && clue(attributes, first.at);
  const variant = prefix.some(word => /\d/u.test(word));
  const negated = clue(phrases('không|chưa|chẳng'), first?.at ?? seq.length);
  if (!seq.length) review.push('UNUSABLE_ROW');
  else if (!matches.length) review.push('NO_RECOGNIZED_TARGET');
  if (first && !first.full) weak.push('PARTIAL_TARGET');
  if (prefix.length) weak.push('MODIFIER_BEFORE_TARGET');
  if (first && prefix.length && /[|;\/,:.()\[\]–—]|\s-\s/u.test(original.slice(0, first.start))) weak.push('LATER_SEGMENT');
  if (first && clue(weakRelations, first.at)) weak.push('WEAK_RELATION');
  if (clue(bundles) || bundle) review.push('BUNDLE_SCOPE_UNRESOLVED');
  if (refill) review.push('REFILL_SCOPE_UNRESOLVED');
  if (attribute) review.push('ATTRIBUTE_SCOPE_UNRESOLVED');
  if (variant) review.push('VARIANT_SCOPE_UNRESOLVED');
  if (negated) review.push('NEGATED_RELATION');
  const protectedScope = bundle || refill || attribute || negated;
  let reason: RelevanceReason | null = null;
  let relation: { start: number; end: number } | null = null;
  if (first?.full && !protectedScope) {
    let end = first.at;
    while (end > 0 && quantifiers.has(seq[end - 1]!)) end--;
    const term = strongRelations.find(term => !includes(target, term) && has(seq, end - term.length, term));
    if (term) {
      const at = end - term.length, sold = seq.slice(leading, at).filter((_, i) => !consumed.has(leading + i));
      if (soldItem(sold) && !matches.some(match => match.at < at)) {
        reason = 'ACCESSORY_FOR_TARGET'; relation = { start: tokens[at]!.start, end: tokens[end - 1]!.end };
      }
    }
    if (reason === null && giftAt > leading && first.at > giftAt) {
      const sold = seq.slice(leading, giftAt).filter((_, i) => !consumed.has(leading + i));
      let object = giftAt + 1;
      if (seq[object] === 'kèm') object++;
      while (consumed.has(object) || quantifiers.has(seq[object] ?? '')) object++;
      if (soldItem(sold) && object === first.at && !matches.some(match => match.at < giftAt)) {
        reason = 'SECONDARY_GIFT'; relation = { start: tokens[giftAt]!.start, end: tokens[object - 1]!.end };
      }
    }
  }
  if (giftAt >= 0 && reason !== 'SECONDARY_GIFT') review.push('GIFT_SCOPE_UNRESOLVED');
  const roleConflict = reason === 'ACCESSORY_FOR_TARGET' && matches.slice(1).some(match => {
    let end = match.at;
    while (end > 0 && quantifiers.has(seq[end - 1]!)) end--;
    return !strongRelations.some(term => !includes(target, term) && has(seq, end - term.length, term));
  });
  if (roleConflict) { reason = null; review.push('TARGET_ROLE_UNRESOLVED'); }
  if (weak.length) review.push('UNCERTAIN_TARGET');
  const anchor = first?.full === true && prefix.length === 0 && weak.length === 0 && review.length === 0 && reason === null;
  return { normalizedTitle: original, reason, anchor, weak, review, matches, relation, protectedScope: protectedScope || roleConflict || clue(bundles) || variant || (giftAt >= 0 && reason === null),
    consumed: tokens.flatMap((token, i) => consumed.has(i) ? [{ start: token.start, end: token.end }] : []) };
}

/** References are frozen before any relevance or financial-quality exclusion. */
export function assessCaptureRows(rows: readonly CaptureQualityRow[], keywords: readonly string[], mode: 'BATCH' | 'TITLE_ONLY' = 'BATCH', relevance?: CaptureRelevanceRecord) {
  const targets = [...new Set(keywords.map(keyword => words(keyword).join(' ')).filter(Boolean))];
  const aiLabel = captureRelevanceLookup(relevance);
  const signals = targets.map(keyword => rows.map(row => assessCaptureTitle(row.title, keyword)));
  const platforms = rows.map(row => categoryKey(row.platform));
  const categories = rows.map(row => categoryKey(row.categoryText));
  const prices = rows.map(row => priceValue(row.price));
  const cohorts = targets.flatMap((keyword, t) => [...new Set(platforms.filter(platform => platform !== null))].map(platform => {
    const members = rows.flatMap((_, i) => platforms[i] === platform && signals[t]![i]!.matches.length ? [i] : []);
    const anchors = members.filter(i => signals[t]![i]!.anchor), counts = new Map<string, number>();
    for (const i of anchors) if (categories[i] !== null) counts.set(categories[i]!, (counts.get(categories[i]!) ?? 0) + 1);
    const A = anchors.length, N = members.length, C = [...counts.values()].reduce((a, b) => a + b, 0);
    const sortedPrices = anchors.flatMap(i => prices[i] === null ? [] : [prices[i]!]).sort((a, b) => a - b), P = sortedPrices.length;
    const guard = A >= Math.max(10, Math.ceil(0.25 * N)), modal = Math.max(0, ...counts.values());
    return { keyword, platform, N, A, C, P, anchors, categoryCounts: Object.fromEntries(counts),
      modalCategories: [...counts].filter(([, count]) => count === modal).map(([category]) => category), rareLimit: Math.min(2, Math.floor(0.05 * C)),
      categoryAvailable: mode === 'BATCH' && guard && C >= 40 && C / A >= 0.80,
      priceAvailable: mode === 'BATCH' && guard && P >= 30 && P / A >= 0.80,
      p10: P ? sortedPrices[Math.floor((P - 1) * 0.10)]! : null };
  }));
  const exclusions = new Map<number, CaptureRowExclusionReason>();
  const decisions = rows.map((row, i) => {
    const evidence = targets.map((keyword, t) => {
      const title = signals[t]![i]!, cohort = cohorts.find(value => value.keyword === keyword && value.platform === platforms[i]);
      const category = categories[i]!, price = prices[i]!, categoryCount = category === null || !cohort ? null : cohort.categoryCounts[category] ?? 0;
      const rareCategory = cohort?.categoryAvailable === true && category !== null && !cohort.modalCategories.includes(category) && categoryCount! <= cohort.rareLimit;
      const lowPrice = cohort?.priceAvailable === true && price !== null && price < 0.5 * cohort.p10!;
      // A prefix, partial match or later segment can describe the product itself.
      // Category rarity needs an explicit relation clue; a retained MAIN vetoes
      // this category inference, but never a clear accessory or secondary-gift relation.
      const categoryMismatch = title.weak.includes('WEAK_RELATION') && !title.protectedScope && rareCategory && aiLabel(row.title, keyword) !== 'MAIN';
      const reason: RelevanceReason | null = title.reason ?? (categoryMismatch ? 'TITLE_CATEGORY_MISMATCH' : null);
      const review = [...title.review, ...(category === null ? ['CATEGORY_UNAVAILABLE'] : []), ...(price === null ? ['PRICE_UNAVAILABLE'] : []),
        ...(!cohort?.categoryAvailable ? ['INSUFFICIENT_REFERENCE'] : []), ...(!cohort?.priceAvailable ? ['PRICE_REFERENCE_UNAVAILABLE'] : []),
        ...(platforms[i] === null ? ['PLATFORM_UNAVAILABLE'] : []), ...(lowPrice ? ['LOW_PRICE_ONLY'] : [])];
      return { keyword, title, reason, review, category, categoryCount, rareCategory, price, lowPrice };
    });
    const reason = evidence.length && evidence.every(value => value.reason !== null) ? evidence[0]!.reason : null;
    const aiExcluded = targets.length > 0 && targets.every(keyword => aiLabel(row.title, keyword) === 'NOT_MAIN');
    if (reason || aiExcluded) exclusions.set(i, 'NOT_MAIN_PRODUCT');
    return { rowIndex: i, platform: row.platform, usable: row.title.trim().length > 0, reason, aiExcluded,
      review: [...new Set(evidence.flatMap(value => value.review))], evidence };
  });
  salesQualityExclusions(rows, exclusions, true);
  return { profile: CAPTURE_ROW_PROFILE, mode, cohorts, exclusions, decisions: decisions.map(row => ({ ...row,
    decision: exclusions.has(row.rowIndex) ? 'EXCLUDE' as const : 'KEEP' as const, exclusionReason: exclusions.get(row.rowIndex) ?? null })) };
}

export function assessCaptureRowsTitleOnly(rows: readonly CaptureQualityRow[], keywords: readonly string[], profile: CaptureRowProfile = CAPTURE_ROW_PROFILE_V2, relevance?: CaptureRelevanceRecord) {
  return profile === CAPTURE_ROW_PROFILE ? assessCaptureRows(rows, keywords, 'TITLE_ONLY', relevance)
    : { profile, exclusions: captureRowExclusions(rows, keywords, profile) };
}

export function assessCaptureProductRows(snapshot: AutomationMetricWebSnapshotV1, profile: CaptureRowProfile, relevance?: CaptureRelevanceRecord) {
  const rows = readCaptureProductRows(snapshot);
  const assessment = profile === CAPTURE_ROW_PROFILE ? assessCaptureRows(rows, snapshot.scope.keywords, 'BATCH', relevance) : null;
  return { rows, exclusions: assessment?.exclusions ?? captureRowExclusions(rows, snapshot.scope.keywords, profile), assessment };
}

export function captureRowExclusions(rows: readonly CaptureQualityRow[], keywords: readonly string[], profile: CaptureRowProfile = CAPTURE_ROW_PROFILE_V2): Map<number, CaptureRowExclusionReason> {
  if (profile === CAPTURE_ROW_PROFILE) return assessCaptureRows(rows, keywords).exclusions;
  const excluded = new Map<number, CaptureRowExclusionReason>();
  for (const [i, row] of rows.entries()) {
    if (!keywords.some(keyword => isMainCapturedProduct(row.title, keyword, profile))) excluded.set(i, 'NOT_MAIN_PRODUCT');
    else if (row.revenue !== null && row.revenue > 0 && (row.units === null || row.units === 0)) excluded.set(i, 'REVENUE_WITHOUT_UNITS');
  }
  return salesQualityExclusions(rows, excluded);
}

/** Relevance first, then missing units, then one frozen median per platform. */
function salesQualityExclusions(rows: readonly CaptureQualityRow[], excluded: Map<number, CaptureRowExclusionReason>, skipUnusable = false) {
  for (const [i, row] of rows.entries()) if ((!skipUnusable || row.title.trim()) && !excluded.has(i) && row.revenue !== null && row.revenue > 0 && (row.units === null || row.units === 0))
    excluded.set(i, 'REVENUE_WITHOUT_UNITS');
  for (const platform of new Set(rows.map(row => row.platform))) {
    const candidates = rows.flatMap((row, i) => row.platform === platform && (!skipUnusable || row.title.trim()) && !excluded.has(i) && row.revenue !== null && row.units !== null && row.units > 0
      ? [{ i, ratio: row.revenue / row.units }] : []);
    const ratios = candidates.map(row => row.ratio).sort((a, b) => a - b);
    if (!ratios.length) continue;
    const middle = Math.floor(ratios.length / 2);
    const median = ratios.length % 2 ? ratios[middle]! : ratios[middle - 1]! / 2 + ratios[middle]! / 2;
    for (const row of candidates) if (row.ratio > 20 * median) excluded.set(row.i, 'UNIT_REVENUE_OUTLIER');
  }
  return excluded;
}

/** One factual line per platform; zero counts are omitted. */
export function captureExclusionNotice(rows: readonly { readonly platform: string; readonly reason: CaptureRowExclusionReason }[], platform: string, profile: CaptureRowProfile = CAPTURE_ROW_PROFILE_V2): string {
  const own = rows.filter(row => row.platform === platform);
  const irrelevant = own.filter(row => row.reason === 'NOT_MAIN_PRODUCT').length;
  const implausible = own.length - irrelevant;
  const parts = [
    ...(irrelevant ? [profile === CAPTURE_ROW_PROFILE ? `${irrelevant} dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét` : `${irrelevant} dòng không phải sản phẩm chính (phụ kiện, linh kiện hoặc sản phẩm khác)`] : []),
    ...(implausible ? [`${implausible} dòng có doanh thu hoặc đơn vị bán bất thường`] : []),
  ];
  return parts.length ? `Đã loại ${parts.join(' và ')} khỏi mẫu tính toán. Số liệu của toàn bộ kết quả tìm kiếm trên trang nguồn được giữ riêng, chưa áp dụng bộ lọc này.` : '';
}

/** Both report parsers derive membership from the same untruncated, clean cells. */
export function readCaptureProductRows(snapshot: AutomationMetricWebSnapshotV1) {
  const table = snapshot.groups.W12_topProducts;
  if ('absent' in table) return [];
  return table.rows.map((row, rowIndex) => {
    const text = (key: string): string => {
      const cell = row.cells[key];
      return (cell && 'text' in cell ? cell.text : cell && 'displayed' in cell ? cell.displayed : '').trim().replace(/\s+/gu, ' ');
    };
    const number = (key: string): number | null => {
      const cell = row.cells[key];
      return cell && 'value' in cell && typeof cell.value === 'number' && Number.isFinite(cell.value) && cell.value >= 0 ? cell.value : null;
    };
    const categoryCell = row.cells['category'], priceCell = row.cells['price'];
    const categoryText = categoryCell && 'text' in categoryCell ? text('category') : '', price = priceCell && 'unit' in priceCell && priceCell.unit === 'VND' ? number('price') : null;
    return { rowIndex, ...splitCaptureNameCell(text('name'), text('shop')), platform: text('platform').toLowerCase(), revenue: number('revenue'), units: number('units'),
      categoryText: categoryKey(categoryText) === null ? null : categoryText, price: price !== null && price > 0 ? price : null };
  });
}

/**
 * Pack size read from a product title (owner decision 21/10/2026). A size is used
 * only when the title states exactly one; otherwise the row stays counted but is
 * never compared on price. No provider call, no model: plain text rules only.
 */
export type TitleQuantityKind = 'MASS' | 'VOLUME' | 'COUNT' | 'ITEM';
export type TitleQuantity =
  | { state: 'ONE'; kind: TitleQuantityKind; perItem: number; multiplier: number; total: number; countKind: string | null; matched: string }
  | { state: 'MANY'; reason: 'MULTIPLE_SIZES' | 'MIXED_KINDS' | 'MULTIPLE_MULTIPLIERS' }
  | { state: 'NONE' };
export type UnitProfile = { kind: TitleQuantityKind; countKind: string | null; standard: string; convertedRevenueShare: number };
export type TitleUnitRow = { readonly title: string; readonly revenue: number | null | undefined; readonly units: number | null | undefined; readonly platform: string };
export type TitleUnitPrice =
  | { quantity: TitleQuantity; unitPrice: number; label: string; basis: typeof TITLE_UNIT_BASIS; matched: string }
  | { quantity: TitleQuantity; unitPrice: null; label: typeof NOT_CONVERTED; basis: null; matched: null };
export type TitleUnitProjection = { rows: TitleUnitPrice[]; convertedCount: number; totalCount: number };

export const TITLE_UNIT_BASIS = 'quy cách theo tên sản phẩm';
export const NOT_CONVERTED = 'chưa quy đổi được';
export const NO_PRICE_COMPARISON = 'Chưa so giá giữa các sản phẩm vì quy cách khác nhau hoặc không ghi trong tên sản phẩm.';
/** Revenue share the main pack kind needs before products are compared on price. */
export const PROFILE_MIN_SHARE = 0.5;

const COUNT_WORDS: Readonly<Record<string, string>> = { vien: 'viên', goi: 'gói', tui: 'túi', hop: 'hộp', chai: 'chai', lo: 'lọ', hu: 'hũ', cai: 'cái',
  mieng: 'miếng', thanh: 'thanh', ong: 'ống', tep: 'tép', lon: 'lon', coc: 'cốc', ly: 'ly' };
const COUNT_ALT = Object.keys(COUNT_WORDS).sort((a, b) => b.length - a.length).join('|');
const MASS_ALT = 'kg|gram|gam|gr|g', VOLUME_ALT = 'ml|lit|l';
const NUM = '(\\d+(?:[.,]\\d+)*)';
// A number may follow "x" ("2x500g") but no other letter or digit; a unit ends at a non-letter.
const BEFORE = '(?<![\\d.,]|[^\\P{L}x])', END = '(?![\\p{L}\\d])';
const UNIT_AHEAD = `(?!\\s*(?:${MASS_ALT}|${VOLUME_ALT}|${COUNT_ALT})${END})`;
const MASS = new RegExp(`${BEFORE}${NUM}\\s*(${MASS_ALT})${END}`, 'gu');
const VOLUME = new RegExp(`${BEFORE}${NUM}\\s*(${VOLUME_ALT})${END}`, 'gu');
const COUNT = new RegExp(`${BEFORE}${NUM}\\s*(${COUNT_ALT})${END}`, 'gu');
const MULTIPLIERS = [
  new RegExp(`(?<![\\p{L}])x\\s*(\\d+)(?![\\d.,])${UNIT_AHEAD}`, 'gu'),
  new RegExp(`(?<![\\p{L}\\d.,])(\\d+)\\s*x(?![\\p{L}])`, 'gu'),
  new RegExp(`(?<![\\p{L}])(?:combo|set|bo|loc|thung|pack)\\s*(\\d+)(?![\\d.,])${UNIT_AHEAD}`, 'gu'),
];
// Dimensions (30x40cm, 16 x 20 inch) are sizes of one item, never a pack.
const DIMENSION = /\d+(?:[.,]\d+)?\s*[x*]\s*\d+(?:[.,]\d+)?(?:\s*[x*]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|m|inch)(?![\p{L}\d])/gu;

/** Lower case, NFC, diacritics folded one character to one character so match offsets stay on the original text. */
function fold(text: string): string {
  return [...text].map(ch => {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gu, 'd');
    return base.length === 1 ? base : ch;
  }).join('');
}
/** `1,5` and `1.5` are decimals; `1.000` is a thousands group. */
function amount(raw: string): number {
  if (raw.includes(',')) {
    const at = raw.lastIndexOf(',');
    return Number(`${raw.slice(0, at).replace(/[.,]/gu, '')}.${raw.slice(at + 1)}`);
  }
  return /^\d{1,3}(?:\.\d{3})+$/u.test(raw) ? Number(raw.replace(/\./gu, '')) : Number(raw);
}
type Hit = { value: number; word: string; start: number; end: number };
function hits(pattern: RegExp, folded: string): Hit[] {
  return [...folded.matchAll(pattern)].flatMap(m => {
    const value = amount(m[1]!);
    return Number.isFinite(value) && value > 0 ? [{ value, word: m[2] ?? '', start: m.index!, end: m.index! + m[0].length }] : [];
  });
}
const distinct = (values: readonly number[]): number[] => [...new Set(values)];
// "5g" next to a network word is a network generation, not grams.
const NETWORK = /(?<!\p{L})(?:wifi|sim|mang|lte|router|ghz|dien thoai|phone|smartphone|modem)(?!\p{L})/u;
const isNetwork = (hit: Hit, folded: string): boolean => hit.word === 'g' && Number.isInteger(hit.value) && hit.value >= 2 && hit.value <= 6
  && (NETWORK.test(folded.slice(Math.max(0, hit.start - 24), hit.start)) || NETWORK.test(folded.slice(hit.end, hit.end + 24)));
// A count right after a size, in brackets or after "/", describes the contents ("500g (100 viên)").
const describesContents = (hit: Hit, sizes: readonly Hit[], folded: string): boolean =>
  sizes.some(size => size.end <= hit.start && /^\s*[([/]\s*$/u.test(folded.slice(size.end, hit.start)));

/** C1: one pack size from a title, or why there is none. */
export function parseTitleQuantity(title: string): TitleQuantity {
  const original = title.normalize('NFC');
  if (!original.trim()) return { state: 'NONE' };
  const folded = fold(original.toLowerCase()).replace(DIMENSION, part => ' '.repeat(part.length));
  const mass = hits(MASS, folded).filter(hit => !isNetwork(hit, folded)).map(hit => ({ ...hit, value: hit.word === 'kg' ? hit.value * 1000 : hit.value }));
  const volume = hits(VOLUME, folded).map(hit => ({ ...hit, value: hit.word === 'ml' ? hit.value : hit.value * 1000 }));
  const counts = hits(COUNT, folded).filter(hit => !describesContents(hit, [...mass, ...volume], folded));
  const explicit = MULTIPLIERS.flatMap(pattern => [...folded.matchAll(pattern)].flatMap(m => {
    const value = Number(m[1]);
    return value > 0 ? [{ value, word: '', start: m.index!, end: m.index! + m[0].length }] : [];
  }));
  if (mass.length && volume.length) return { state: 'MANY', reason: 'MIXED_KINDS' };
  // Overlapping spans ("combo 2 x") are merged before they are quoted back.
  const span = (list: readonly Hit[]): string => [...new Set([...list].sort((a, b) => a.start - b.start)
    .reduce<{ start: number; end: number }[]>((out, hit) => {
      const last = out.at(-1);
      if (last && hit.start <= last.end) last.end = Math.max(last.end, hit.end); else out.push({ start: hit.start, end: hit.end });
      return out;
    }, []).map(part => original.slice(part.start, part.end).trim()))].join(' · ');
  const result = (kind: TitleQuantityKind, size: Hit | null, multipliers: readonly Hit[], countKind: string | null): TitleQuantity => {
    const values = distinct(multipliers.map(hit => hit.value));
    if (values.length > 1) return { state: 'MANY', reason: 'MULTIPLE_MULTIPLIERS' };
    const perItem = size?.value ?? 1, multiplier = values[0] ?? 1;
    return { state: 'ONE', kind, perItem, multiplier, total: perItem * multiplier, countKind, matched: span([...(size ? [size] : []), ...multipliers]) };
  };
  const measured = mass.length ? mass : volume;
  if (measured.length) {
    if (distinct(measured.map(hit => hit.value)).length > 1) return { state: 'MANY', reason: 'MULTIPLE_SIZES' };
    // A count before a mass or volume is the number of packs ("hộp 12 gói x 20g").
    return result(mass.length ? 'MASS' : 'VOLUME', measured[0]!, [...explicit, ...counts], null);
  }
  if (counts.length) {
    // The last count word is the innermost pack ("2 hộp 12 gói" → gói); outer counts multiply it.
    const inner = counts.reduce((last, hit) => hit.start > last.start ? hit : last);
    const sameWord = counts.filter(hit => hit.word === inner.word);
    if (distinct(sameWord.map(hit => hit.value)).length > 1) return { state: 'MANY', reason: 'MULTIPLE_SIZES' };
    return result('COUNT', inner, [...explicit, ...counts.filter(hit => hit.word !== inner.word)], COUNT_WORDS[inner.word] ?? inner.word);
  }
  return result('ITEM', null, explicit, null);
}

const groupKey = (q: Extract<TitleQuantity, { state: 'ONE' }>): string => `${q.kind}:${q.countKind ?? ''}`;
export const unitStandard = (kind: TitleQuantityKind, countKind: string | null): string =>
  kind === 'MASS' ? 'đồng/100g' : kind === 'VOLUME' ? 'đồng/100ml' : kind === 'COUNT' ? `đồng/${countKind}` : 'đồng/sản phẩm';
const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** C2: the pack kind carrying the most revenue, kept only when it holds at least half of all revenue. */
export function chooseUnitProfile(rows: readonly TitleUnitRow[]): UnitProfile | null {
  const groups = new Map<string, { kind: TitleQuantityKind; countKind: string | null; revenue: number }>();
  let total = 0;
  for (const row of rows) {
    if (!positive(row.revenue)) continue;
    total += row.revenue;
    const q = parseTitleQuantity(row.title);
    if (q.state !== 'ONE') continue;
    const key = groupKey(q), group = groups.get(key) ?? { kind: q.kind, countKind: q.countKind, revenue: 0 };
    group.revenue += row.revenue; groups.set(key, group);
  }
  const top = [...groups.values()].reduce<{ kind: TitleQuantityKind; countKind: string | null; revenue: number } | null>((best, group) => !best || group.revenue > best.revenue ? group : best, null);
  if (!top || total <= 0 || top.revenue / total < PROFILE_MIN_SHARE) return null;
  return { kind: top.kind, countKind: top.countKind, standard: unitStandard(top.kind, top.countKind), convertedRevenueShare: top.revenue / total };
}

/** C3: revenue per unit sold, divided by the title pack size, for rows of the profile's kind only. */
export function projectTitleUnitPrices(rows: readonly TitleUnitRow[], profile: UnitProfile | null): TitleUnitProjection {
  const projected = rows.map((row): TitleUnitPrice => {
    const quantity = parseTitleQuantity(row.title);
    const none = { quantity, unitPrice: null, label: NOT_CONVERTED, basis: null, matched: null } as const;
    if (!profile || quantity.state !== 'ONE' || quantity.kind !== profile.kind || quantity.countKind !== profile.countKind) return none;
    // A durable sold as a pack is never split into single items.
    if (quantity.kind === 'ITEM' && quantity.multiplier > 1) return none;
    if (!positive(row.revenue) || !positive(row.units) || !positive(quantity.total)) return none;
    const unitPrice = row.revenue / row.units / quantity.total * (quantity.kind === 'MASS' || quantity.kind === 'VOLUME' ? 100 : 1);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return none;
    return { quantity, unitPrice, label: profile.standard, basis: TITLE_UNIT_BASIS, matched: quantity.matched };
  });
  return { rows: projected, convertedCount: projected.filter(row => row.unitPrice !== null).length, totalCount: projected.length };
}

/** C5 line under a price table; k = 0 uses the no-comparison sentence and no bare zero is printed. */
export function convertedLine(converted: number, total: number): string {
  if (converted <= 0) return NO_PRICE_COMPARISON;
  const head = `${converted}/${total} sản phẩm quy đổi được theo quy cách trong tên sản phẩm`;
  return total - converted > 0 ? `${head}; ${total - converted} sản phẩm chưa quy đổi được, không đưa vào so sánh giá.` : `${head}.`;
}

/** C8 cell: the title span used, or why the row is not converted. */
export function titleQuantityCell(price: TitleUnitPrice): string {
  return price.unitPrice === null ? NOT_CONVERTED : price.matched || 'không ghi số lượng; tính 1 sản phẩm';
}

// Cross-check of the interview answer "Loại sản phẩm" against a category label
// read from capture data (v3plug P2). The category itself is always chosen from
// the data; this file only says whether the owner's product type fits it.
//
// Match rule: after folding (NFC, lowercase, diacritics removed, đ -> d) the
// product type and the label share a token, or one synonym pair below applies.

/**
 * Small explicit synonym map: product-type phrase -> category-label phrase, both
 * folded. A pair matches when the product type contains the first phrase and the
 * label contains the second, as whole tokens.
 */
export const AUTORUN_CATEGORY_SYNONYMS: readonly (readonly [productType: string, categoryLabel: string])[] = Object.freeze([
  ['thuc pham chuc nang', 'suc khoe'],
  ['vien uong', 'suc khoe'],
  ['vitamin', 'suc khoe'],
  ['quat', 'dien gia dung'],
  ['noi chien', 'dien gia dung'],
  ['son', 'lam dep'],
  ['my pham', 'lam dep'],
  ['kem duong', 'lam dep'],
  ['sua rua mat', 'lam dep'],
]);

/** Folded word tokens: NFC, lowercase, combining marks removed, đ -> d. */
export function foldedTokens(text: string): string[] {
  return text.normalize('NFC').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function hasSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return needle.length > 0;
  }
  return false;
}

/** True when the declared product type fits the category label (token overlap or a synonym pair). */
export function productTypeMatchesCategory(productType: string, categoryLabel: string): boolean {
  const type = foldedTokens(productType), label = foldedTokens(categoryLabel);
  if (type.some(token => label.includes(token))) return true;
  return AUTORUN_CATEGORY_SYNONYMS.some(([from, to]) => hasSequence(type, from.split(' ')) && hasSequence(label, to.split(' ')));
}

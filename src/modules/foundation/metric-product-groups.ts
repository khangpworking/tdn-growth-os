// Explicit finite title convention; this is not independent verification of chemical identity.
// Unknown words/variants remain unresolved. Only explicit pack counts and duration are removed.
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
const aliases: readonly [RegExp, string][] = [
  [/^vitamin\s*k2\b|^k2\b/, 'vitamin-k2'], [/^vitamin\s*d3\b|^d3\b/, 'vitamin-d3'],
  [/^vitamin\s*c(?=\d|\b)|^vit\s*c(?=\d|\b)|^vitaminc(?=\d|\b)/, 'vitamin-c'],
  [/^zinc(?=\d|\b)|^kem\b/, 'zinc'], [/^biotin\b/, 'biotin'],
  [/^calcium\b|^canxi\b/, 'calcium'], [/^magnesium\b|^magie\b/, 'magnesium'],
];
function canonicalStrength(amount: string, unit: string): string {
  const [whole, fraction = ''] = amount.replace(',', '.').split('.');
  // Express mass in micrograms with exact scaled integers; retain IU/% as separate dimensions.
  const scaled = BigInt((whole ?? '0') + fraction) * (unit === 'mg' ? 1000n : 1n);
  const digits = scaled.toString().padStart(fraction.length + 1, '0');
  const numeric = fraction.length ? `${digits.slice(0, -fraction.length)}.${digits.slice(-fraction.length)}`.replace(/0+$/, '').replace(/\.$/, '') : digits;
  return `${numeric} ${['mg', 'mcg', 'ug'].includes(unit) ? 'mcg' : unit}`;
}
export function metricTitleGroup(title: unknown, sourceBrand: unknown) {
  if (typeof title !== 'string' || !title.trim()) return null;
  let text = fold(title).trim();
  // A slash/choice/range can denote selectable formulas, not a count variant.
  if (/[/]|\b(?:hoac|lua chon|phan loai|tuy chon|or|assorted)\b/.test(text)) return null;
  const brand = typeof sourceBrand === 'string' && sourceBrand.trim() && !/^(unknown|no brand|khong thuong hieu)$/i.test(fold(sourceBrand))
    ? fold(sourceBrand).replace(/\s+/g, ' ').trim() : /\bdhc\b/.test(text) ? 'dhc' : null;
  if (!brand) return null;
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' ')
    .replace(/\b(?:combo|bo|set|pack)\s*(?=\d|\b)/g, ' ')
    .replace(/\b\d+\s*(?:hop|lo|chai|tui|goi|vien|ngay|thang|nam|tablets?|capsules?|bottles?|packs?|days?|months?|years?)\b/g, ' ')
    .replace(/\b(?:vien uong|thuc pham bao ve suc khoe|bo sung|chinh hang|nhat ban)\b/g, ' ')
    .replace(/[()[\]{}:;,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const components: { name: string; strength: string | null }[] = [];
  while (text) {
    const alias = aliases.find(([pattern]) => pattern.test(text));
    if (!alias) return null;
    const match = alias[0].exec(text)!;
    text = text.slice(match[0].length).trim();
    const dose = /^(\d+(?:[.,]\d+)?)\s*(mg|mcg|ug|iu|%)\b/.exec(text);
    const strength = dose ? canonicalStrength(dose[1]!, dose[2]!) : null;
    if (dose) text = text.slice(dose[0].length).trim();
    if (components.some(c => c.name === alias[1])) return null;
    components.push({ name: alias[1], strength });
    text = text.replace(/^(?:\+|&|\bva\b|\bwith\b)\s*/, '').trim();
  }
  if (!components.length) return null;
  components.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const base = JSON.stringify([brand, components.map(c => c.name)]);
  return { key: JSON.stringify([brand, components]), base, components, basis: 'finite-title-components-v1' };
}

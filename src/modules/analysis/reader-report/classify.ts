// Profile-driven row classification. A profile is the owner-approved rule set
// for one product; the first matching rule decides a row's segment.
type ReaderRow<Amount> = {
  i: number; platform: string; listing: string; shop: string; shopName?: string; cat: string;
  rev: Amount; units: Amount; asp: Amount; brand: string; title: string; start?: string | null;
  label?: string; seg?: string; vol?: number[]; primary?: string | null; rule?: number;
  [k: string]: unknown;
};

export type Row = ReaderRow<number>;
export type LegacyRow = Row;
export type NullableRow = ReaderRow<number | null>;

export type Cond = {
  idIn?: number[]; labelEq?: string; labelPrefix?: string; titleRe?: string; notTitleRe?: string;
  aspGte?: number; measureGte?: number; measureMinGte?: number; primaryIn?: string[]; any?: Cond[];
};
export type Rule = { seg: string; when: Cond; why?: string };
export type Profile = {
  slug: string; product: string; status: 'proposed' | 'approved';
  segments: Record<string, string>; short: Record<string, string>; core: string[]; non: string[];
  labelOverrides?: Record<string, string>; rules: Rule[];
  primaryNouns?: Record<string, string>; stripBeforePrimary?: string;
  measure?: { unit: string; re: string; toBase: Record<string, number> };
  signals: [string, string][];
  benchmark?: { label: string; titleRe?: string; measureRange?: [number, number]; excludeRe?: string };
};

export const profileRe = (s: string): RegExp => new RegExp(s, 'iu');

export function measures(title: string, p: Profile): number[] {
  const m = p.measure;
  if (!m) return [];
  const t = title.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  return [...t.matchAll(new RegExp(m.re, 'giu'))]
    .map(x => parseFloat(x[1] ?? '') * (m.toBase[(x[2] ?? '').toLowerCase()] ?? 1))
    .filter(v => v > 0);
}

/** Primary noun = the noun group that appears earliest in the title (after stripping gift phrases). */
export function primaryNoun(title: string, p: Profile): string | null {
  if (!p.primaryNouns) return null;
  let t = title.toLowerCase();
  if (p.stripBeforePrimary) t = t.replace(new RegExp(p.stripBeforePrimary, 'giu'), ' ');
  let best: string | null = null, at = Infinity;
  for (const [k, s] of Object.entries(p.primaryNouns)) {
    const m = new RegExp(s, 'iu').exec(t);
    if (m && m.index < at) { at = m.index; best = k; }
  }
  return best;
}

function matches(c: Cond, r: NullableRow): boolean {
  const vol = r.vol ?? [];
  if (c.any && !c.any.some(x => matches(x, r))) return false;
  if (c.idIn && !c.idIn.includes(r.i)) return false;
  if (c.labelEq && r.label !== c.labelEq) return false;
  if (c.labelPrefix && !String(r.label || '').startsWith(c.labelPrefix)) return false;
  if (c.titleRe && !profileRe(c.titleRe).test(r.title)) return false;
  if (c.notTitleRe && profileRe(c.notTitleRe).test(r.title)) return false;
  if (c.aspGte != null && !(r.asp !== null && r.asp >= c.aspGte)) return false;
  if (c.measureGte != null && !(vol.length && Math.max(...vol) >= c.measureGte)) return false;
  if (c.measureMinGte != null && !(vol.length && Math.min(...vol) >= c.measureMinGte)) return false;
  if (c.primaryIn && !c.primaryIn.includes(String(r.primary))) return false;
  return true;
}

/** Sets label/vol/primary/seg/rule on each row in place; returns hits per rule index. */
export function classify(rows: NullableRow[], p: Profile): Record<number, number> {
  const hits: Record<number, number> = {};
  for (const r of rows) {
    const override = p.labelOverrides?.[r.i];
    if (override) r.label = override;
    r.vol = measures(r.title, p);
    r.primary = primaryNoun(r.title, p);
    const k = p.rules.findIndex(x => matches(x.when, r));
    const rule = p.rules[k];
    if (!rule) throw new Error(`dòng ${r.i} không khớp luật nào`);
    r.seg = rule.seg; r.rule = k; hits[k] = (hits[k] ?? 0) + 1;
  }
  return hits;
}

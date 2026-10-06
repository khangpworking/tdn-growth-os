import type { Bundle } from './bundle.js';
import { profileRe, type Profile, type Row } from './classify.js';
import { q } from './format.js';

export type SegmentStat = {
  k: string; name: string | undefined; n: number; rev: number; units: number; shops: number;
  aspMed: number; aspP25: number; aspP75: number; top: number[];
};
export type ShopStat = {
  shop: string; name: string; n: number; rev: number; units: number;
  segs: Record<string, number>; brands: Record<string, number>; top: Row;
};
export type BrandStat = { brand: string; n: number; rev: number; shops: number };
export type Scope = {
  core: Row[]; segs: SegmentStat[]; shops: ShopStat[]; conc: [number, number][]; brands: BrandStat[];
  signals: { label: string; n: number; rev: number }[]; one: Row[]; total: number; cr: number; cu: number;
};

const sum = (a: readonly Row[], k: 'rev' | 'units'): number => a.reduce((s, r) => s + r[k], 0);
export const NO_BRAND = '(không ghi)';

/** Deterministic metrics for one scope (one marketplace). Rows must already be classified. */
export function scopeMetrics(B: Bundle, P: string, rows: readonly Row[], p: Profile): Scope {
  const core = rows.filter(r => r.seg !== undefined && p.core.includes(r.seg));
  if (!core.length) throw new Error(`phạm vi ${P} không có dòng lõi`);
  const total = B.set(`${P}.all.rev`, sum(rows, 'rev'), 'ty', 'Doanh thu toàn mẫu');
  B.set(`${P}.all.units`, sum(rows, 'units'), 'num'); B.set(`${P}.all.n`, rows.length, 'num');
  B.set(`${P}.all.shops`, new Set(rows.map(r => r.shop)).size, 'num');
  B.set(`${P}.all.asp`, total / B.v(`${P}.all.units`), 'num');
  const cr = B.set(`${P}.core.rev`, sum(core, 'rev'), 'ty', 'Doanh thu lõi');
  const cu = B.set(`${P}.core.units`, sum(core, 'units'), 'num'); B.set(`${P}.core.n`, core.length, 'num');
  B.set(`${P}.non.rev`, total - cr, 'ty'); B.set(`${P}.non.share`, 100 * (total - cr) / total, 'pct0'); B.set(`${P}.non.n`, rows.length - core.length, 'num');
  B.set(`${P}.core.asp`, cr / cu, 'num');
  const segs = [...p.core, ...p.non].map((k): SegmentStat => {
    const a = rows.filter(r => r.seg === k), asps = a.map(r => r.asp);
    const s: SegmentStat = {
      k, name: p.segments[k], n: a.length, rev: sum(a, 'rev'), units: sum(a, 'units'), shops: new Set(a.map(r => r.shop)).size,
      aspMed: Math.round(q(asps, .5)), aspP25: Math.round(q(asps, .25)), aspP75: Math.round(q(asps, .75)),
      top: [...a].sort((x, y) => y.rev - x.rev).slice(0, 5).map(r => r.i),
    };
    B.set(`${P}.seg.${k}.n`, s.n, 'num'); B.set(`${P}.seg.${k}.rev`, s.rev, 'ty'); B.set(`${P}.seg.${k}.units`, s.units, 'num'); B.set(`${P}.seg.${k}.shops`, s.shops, 'num');
    if (s.units) B.set(`${P}.seg.${k}.asp`, s.rev / s.units, 'num');
    if (a.length) { B.set(`${P}.seg.${k}.aspMed`, s.aspMed, 'num'); B.set(`${P}.seg.${k}.aspP25`, s.aspP25, 'num'); B.set(`${P}.seg.${k}.aspP75`, s.aspP75, 'num'); }
    if (p.core.includes(k)) { B.set(`${P}.seg.${k}.revShare`, 100 * s.rev / cr, 'pct'); B.set(`${P}.seg.${k}.unitShare`, 100 * s.units / cu, 'pct'); }
    return s;
  });

  // Shops (core only). Plain objects on purpose: their key order (numeric ids
  // first) breaks revenue ties exactly like the approved golden build.
  const sm: Record<string, ShopStat> = {};
  for (const r of core) {
    const s = sm[r.shop] ??= { shop: r.shop, name: r.shopName || r.shop, n: 0, rev: 0, units: 0, segs: {}, brands: {}, top: r };
    const seg = r.seg!;
    s.n++; s.rev += r.rev; s.units += r.units;
    s.segs[seg] = (s.segs[seg] ?? 0) + r.rev;
    s.brands[r.brand] = (s.brands[r.brand] ?? 0) + 1;
    if (r.rev > s.top.rev) s.top = r;
  }
  const shops = Object.values(sm).sort((a, b) => b.rev - a.rev);
  B.set(`${P}.core.shops`, shops.length, 'num');
  const conc = [1, 3, 5, 10, 20].map(n => [n, +(100 * shops.slice(0, n).reduce((s, x) => s + x.rev, 0) / cr).toFixed(2)] as [number, number]);
  for (const [n, v] of conc) B.set(`${P}.conc.${n}`, v, 'pct');
  B.set(`${P}.conc.2to10`, conc[3]![1] - conc[0]![1], 'pct');
  const vals = shops.map(s => s.rev);
  B.set(`${P}.shop.mean`, cr / shops.length, 'tr'); B.set(`${P}.shop.median`, q(vals, .5), 'tr');
  B.set(`${P}.shop.under100m`, vals.filter(v => v < 1e8).length, 'num');
  const [first, second] = shops;
  if (first && second) B.set(`${P}.shop.ratio12`, first.rev / second.rev, 'x');
  B.set(`${P}.shop.top1share`, 100 * first!.rev / cr, 'pct');

  // Brands (core only).
  const bm: Record<string, { brand: string; n: number; rev: number; shops: Set<string> }> = {};
  for (const r of core) {
    const b = bm[r.brand] ??= { brand: r.brand, n: 0, rev: 0, shops: new Set() };
    b.n++; b.rev += r.rev; b.shops.add(r.shop);
  }
  const brands: BrandStat[] = Object.values(bm).sort((a, b) => b.rev - a.rev).map(b => ({ brand: b.brand, n: b.n, rev: b.rev, shops: b.shops.size }));
  const nb = brands.find(b => b.brand === NO_BRAND);
  B.set(`${P}.brand.none.rev`, nb?.rev || 0, 'ty'); B.set(`${P}.brand.none.n`, nb?.n || 0, 'num'); B.set(`${P}.brand.none.share`, 100 * (nb?.rev || 0) / cr, 'pct0');
  const named = brands.filter(b => b.brand !== NO_BRAND);
  B.set(`${P}.brand.count`, named.length, 'num');
  named.slice(0, 10).forEach((b, j) => { B.set(`${P}.brand.top.${j}.rev`, b.rev, 'ty'); B.set(`${P}.brand.top.${j}.n`, b.n, 'num'); B.set(`${P}.brand.top.${j}.shops`, b.shops, 'num'); B.set(`${P}.brand.top.${j}.share`, 100 * b.rev / cr, 'pct'); });
  shops.slice(0, 10).forEach((s, j) => { B.set(`${P}.shop.top.${j}.rev`, s.rev, 'ty'); B.set(`${P}.shop.top.${j}.n`, s.n, 'num'); B.set(`${P}.shop.top.${j}.share`, 100 * s.rev / cr, 'pct'); });
  B.set(`${P}.brand.top5share`, 100 * named.slice(0, 5).reduce((s, b) => s + b.rev, 0) / cr, 'pct0');

  // Title signals (core only).
  const signals = p.signals.map(([label, s], j) => {
    const a = core.filter(r => profileRe(s).test(r.title));
    B.set(`${P}.sig.${j}.n`, a.length, 'num'); B.set(`${P}.sig.${j}.share`, 100 * a.length / core.length, 'pct0');
    B.set(`${P}.sig.${j}.rev`, sum(a, 'rev'), 'ty'); B.set(`${P}.sig.${j}.revShare`, 100 * sum(a, 'rev') / cr, 'pct0');
    return { label, n: a.length, rev: sum(a, 'rev') };
  });

  // Benchmark price point (for example a 1 kg bag or a 500 ml bottle).
  let one: Row[] = [];
  const bench = p.benchmark;
  if (bench) {
    one = core.filter(r => {
      const vol = r.vol ?? [];
      return (!bench.titleRe || profileRe(bench.titleRe).test(r.title))
        && (!bench.measureRange || (vol.length > 0 && Math.min(...vol) >= bench.measureRange[0] && Math.max(...vol) <= bench.measureRange[1]))
        && !(bench.excludeRe && profileRe(bench.excludeRe).test(r.title));
    });
  }
  if (one.length) {
    const qs = (a: Row[], id: string): void => {
      if (!a.length) return;
      B.set(`${id}.n`, a.length, 'num');
      for (const [k, pp] of [['p25', .25], ['med', .5], ['p75', .75]] as const) B.set(`${id}.${k}`, q(a.map(r => r.asp), pp), 'dong100');
      B.set(`${id}.min`, Math.min(...a.map(r => r.asp)), 'dong'); B.set(`${id}.max`, Math.max(...a.map(r => r.asp)), 'dong');
    };
    qs(one, `${P}.bench`);
    for (const k of p.core) qs(one.filter(r => r.seg === k), `${P}.bench.${k}`);
  }
  return { core, segs, shops, conc, brands, signals, one, total, cr, cu };
}

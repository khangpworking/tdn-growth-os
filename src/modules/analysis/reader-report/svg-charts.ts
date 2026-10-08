import { esc, num, q, sp } from './format.js';

// Self-drawn SVG charts. No chart library and no network access.
export const PAL = ['#1d81a2', '#d9962b', '#b8474b', '#3a8d5d', '#7c5fb0', '#b9b6ad', '#5d6870'] as const;
const pal = (j: number): string => PAL[j % PAL.length]!;
const tx = (x: number, y: number, s: string, cls: string, anchor = 'start'): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
const svgWrap = (w: number, h: number, body: string): string =>
  `<svg class="kc" viewBox="0 0 ${w} ${h}" role="img" xmlns="http://www.w3.org/2000/svg" style="background:#fff">${body}</svg>`;

export type BarSeries = { name: string; values: number[]; color?: string };
export type BarOptions = { stacked?: boolean; fmt?: (v: number) => string; labelW?: number; w?: number; barH?: number; gap?: number };

/** Horizontal bars; series are side by side, or stacked. */
export function barChart(cats: readonly string[], series: readonly BarSeries[], options: BarOptions = {}): string {
  const { stacked = false, fmt = (v: number) => sp(v.toFixed(2)), labelW = 230, w = 760, barH = 16, gap = 10 } = options;
  const ns = stacked ? 1 : series.length, rowH = ns * barH + gap, top = series.length > 1 ? 30 : 8, h = top + cats.length * rowH + 30;
  const tot = cats.map((_, i) => stacked ? series.reduce((s, x) => s + (x.values[i] || 0), 0) : Math.max(...series.map(x => x.values[i] || 0)));
  const max = Math.max(...tot) * 1.12 || 1, plotW = w - labelW - 20, X = (v: number) => labelW + plotW * v / max;
  let b = '';
  if (series.length > 1) {
    let lx = labelW;
    series.forEach((s, j) => { b += `<rect x="${lx}" y="8" width="11" height="11" fill="${s.color || pal(j)}"/>` + tx(lx + 15, 18, s.name, 'lg'); lx += 22 + s.name.length * 7; });
  }
  for (let t = 0; t <= 4; t++) { const v = max / 1.12 * t / 4, x = X(v); b += `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${h - 24}" class="gl"/>` + tx(x, h - 10, fmt(v), 'ax', 'middle'); }
  cats.forEach((c, i) => {
    const y0 = top + i * rowH;
    b += tx(labelW - 8, y0 + (ns * barH) / 2 + 4, c.length > 38 ? c.slice(0, 37) + '…' : c, 'lb', 'end');
    let acc = 0;
    series.forEach((s, j) => {
      const v = s.values[i] || 0, x0 = stacked ? X(acc) : labelW, y = stacked ? y0 : y0 + j * barH, bw = Math.max(v > 0 ? 1.5 : 0, X(v) - labelW);
      b += `<rect x="${x0.toFixed(1)}" y="${y + 1}" width="${bw.toFixed(1)}" height="${barH - 3}" fill="${s.color || pal(j)}"/>`;
      if (!stacked && v > 0) b += tx(x0 + bw + 4, y + barH - 4, fmt(v), 'vl');
      acc += v;
    });
    if (stacked) b += tx(X(tot[i]!) + 4, y0 + barH - 4, fmt(tot[i]!), 'vl');
  });
  return svgWrap(w, h, b);
}

export type ParetoLine = { name: string; ys: number[]; color?: string };

/** Calendar line chart. Missing points break the line and are never drawn at zero. */
export function lineChart(months: readonly string[], series: readonly { name: string; values: readonly (number | null)[]; color: string }[]): string {
  const w = 760, h = 300, left = 58, right = 24, top = 34, bottom = 55;
  const present = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const max = Math.max(0, ...present) || 1;
  const X = (i: number) => left + i * (w - left - right) / Math.max(1, months.length - 1);
  const Y = (value: number) => top + (h - top - bottom) * (1 - value / max);
  let body = '';
  for (let i = 0; i <= 4; i++) {
    const value = max * i / 4;
    body += `<line x1="${left}" x2="${w - right}" y1="${Y(value)}" y2="${Y(value)}" class="gl"/>` + tx(left - 6, Y(value) + 4, sp(value.toFixed(1)), 'ax', 'end');
  }
  months.forEach((month, i) => { body += tx(X(i), h - bottom + 22, month, 'ax', 'middle'); });
  let legendX = left;
  for (const s of series) {
    body += `<rect x="${legendX}" y="6" width="11" height="11" fill="${s.color}"/>` + tx(legendX + 15, 16, s.name, 'lg');
    legendX += 30 + s.name.length * 7;
    let segment: string[] = [];
    const flush = () => {
      if (segment.length > 1) body += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${segment.join(' ')}"/>`;
      segment = [];
    };
    months.forEach((month, i) => {
      const value = s.values[i] ?? null;
      if (value === null) { flush(); return; }
      segment.push(`${X(i).toFixed(1)},${Y(value).toFixed(1)}`);
      body += `<circle data-month="${esc(month)}" data-series="${esc(s.name)}" cx="${X(i).toFixed(1)}" cy="${Y(value).toFixed(1)}" r="3" fill="${s.color}"/>`;
    });
    flush();
  }
  return svgWrap(w, h, body);
}

/** Cumulative revenue share (Pareto) per marketplace, log x axis. */
export function paretoChart(lines: readonly ParetoLine[], { w = 760, h = 300, xLabel = 'Số gian hàng (sắp xếp theo doanh thu giảm dần)', maxN = 0 } = {}): string {
  const L = 48, R = 20, T = 30, Bm = 44, n = maxN || Math.max(...lines.map(l => l.ys.length));
  const X = (i: number) => L + (w - L - R) * Math.log10(i) / Math.log10(n), Y = (v: number) => T + (h - T - Bm) * (1 - v / 100);
  let b = '';
  for (const v of [0, 25, 50, 75, 100]) b += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/>` + tx(L - 6, Y(v) + 4, v + '%', 'ax', 'end');
  for (const t of [1, 3, 10, 30, 100, 300, 1000].filter(t => t <= n)) b += `<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${h - Bm}" class="gl"/>` + tx(X(t), h - Bm + 16, String(t), 'ax', 'middle');
  b += tx(L + (w - L - R) / 2, h - 8, xLabel + ' – thang logarit', 'ax', 'middle');
  let lx = L;
  lines.forEach((l, j) => {
    const c = l.color || pal(j);
    b += `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${l.ys.map((v, i) => `${X(i + 1).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
    for (const k of [1, 10]) {
      const y = l.ys[k - 1];
      if (y != null) b += `<circle cx="${X(k)}" cy="${Y(y)}" r="3.5" fill="${c}"/>` + tx(X(k) + 6, Y(y) + (j ? 14 : -6), sp(y.toFixed(0)) + '%', 'vl');
    }
    b += `<rect x="${lx}" y="6" width="11" height="11" fill="${c}"/>` + tx(lx + 15, 16, l.name, 'lg'); lx += 30 + l.name.length * 7;
  });
  return svgWrap(w, h, b);
}

export type StripGroup = { label: string; color?: string; pts: { v: number; s: number }[] };

/** One dot per product; log price axis; dot size by revenue; bar at the median. */
export function stripChart(groups: readonly StripGroup[], { w = 760, labelW = 210, rowH = 34, fmt = (v: number) => num(v) } = {}): string {
  const all = groups.flatMap(g => g.pts.map(p => p.v)).filter(v => v > 0);
  if (!all.length) throw new Error('stripChart: không có giá dương');
  const lo = Math.log10(Math.min(...all)), hi = Math.log10(Math.max(...all));
  const T = 10, h = T + groups.length * rowH + 34, X = (v: number) => labelW + (w - labelW - 20) * (Math.log10(v) - lo) / (hi - lo || 1);
  const smax = Math.max(...groups.flatMap(g => g.pts.map(p => p.s)));
  let b = '';
  for (let e = Math.ceil(lo * 2) / 2; e <= hi; e += 0.5) { const nice = Number((10 ** e).toPrecision(1)); b += `<line x1="${X(nice)}" x2="${X(nice)}" y1="${T}" y2="${h - 26}" class="gl"/>` + tx(X(nice), h - 10, fmt(nice), 'ax', 'middle'); }
  groups.forEach((g, i) => {
    const yc = T + i * rowH + rowH / 2;
    b += tx(labelW - 8, yc + 4, g.label, 'lb', 'end');
    g.pts.forEach((p, k) => { const r = 1.5 + 7 * Math.sqrt(p.s / smax), jit = ((k * 7919) % 13 - 6) * 1.6; b += `<circle cx="${X(p.v).toFixed(1)}" cy="${(yc + jit).toFixed(1)}" r="${r.toFixed(1)}" fill="${g.color || pal(i)}" fill-opacity=".45"/>`; });
    if (g.pts.length) { const md = q(g.pts.map(p => p.v), .5); b += `<line x1="${X(md)}" x2="${X(md)}" y1="${yc - 12}" y2="${yc + 12}" stroke="#1d2327" stroke-width="2"/>`; }
  });
  return svgWrap(w, h, b);
}

// Vietnamese number formats used by the reader report. They match the
// approved golden report byte-for-byte, so do not change them in place.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, c => ESC[c] ?? c);
export const num = (n: number): string => Math.round(n).toLocaleString('vi-VN');
export const ty = (n: number): string => (n / 1e9).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' tỷ';
export const ty1 = (n: number): string => (n / 1e9).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' tỷ';
export const pct = (a: number, b: number, d = 1): string => (100 * a / b).toFixed(d).replace('.', ',') + '%';
export const sp = (x: unknown): string => String(x).replace('.', ',');
export const r100 = (v: number): number => Math.round(v / 100) * 100;

/** Linear-interpolated quantile; NaN for an empty list. */
export function q(values: readonly number[], p: number): number {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return NaN;
  const i = (a.length - 1) * p, lo = Math.floor(i);
  const low = a[lo]!, high = a[Math.ceil(i)]!;
  return low + (high - low) * (i - lo);
}

export const FMT: Readonly<Record<string, (v: number) => string>> = {
  ty, ty1, num,
  grouped: v => v.toLocaleString('vi-VN'),
  int: v => String(Math.round(v)),
  dong: v => num(v) + 'đ',
  dong100: v => num(r100(v)) + 'đ',
  num100: v => num(r100(v)),
  pct: v => sp(v.toFixed(1)) + '%',
  pct2: v => sp(v.toFixed(2)) + '%',
  pct0: v => v.toFixed(0) + '%',
  tr: v => num(v / 1e6),
  x: v => v.toFixed(0),
  x1: v => sp(v.toFixed(1)),
  tynum: v => ty(v).replace(' tỷ', ''),
  k: v => sp((v / 1000).toFixed(1)) + 'k',
};

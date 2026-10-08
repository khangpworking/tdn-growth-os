import { FMT } from './format.js';

// Every number shown in a reader report comes from one metric bundle, keyed by
// a stable id. Narrative text only reaches numbers through {{id}} or {{id:fmt}}.
export type Metric = { id: string; value: number | null; fmt: string; desc: string };

export class Bundle {
  readonly m = new Map<string, Metric>();
  readonly used = new Set<string>();

  set(id: string, value: number, fmt: string, desc = ''): number {
    if (!Number.isFinite(value)) throw new Error(`metric ${id} không hữu hạn: ${value}`);
    if (!FMT[fmt]) throw new Error(`thiếu định dạng ${fmt} cho metric ${id}`);
    this.m.set(id, { id, value, fmt, desc });
    return value;
  }

  setMissing(id: string, fmt: string, desc = ''): void {
    if (!FMT[fmt]) throw new Error(`thiếu định dạng ${fmt}`);
    this.m.set(id, { id, value: null, fmt, desc });
  }

  value(id: string): number | null {
    const x = this.m.get(id);
    if (!x) throw new Error('thiếu metric ' + id);
    return x.value;
  }

  has(id: string): boolean { return this.m.has(id); }

  v(id: string): number {
    const x = this.m.get(id);
    if (!x) throw new Error('thiếu metric ' + id);
    if (x.value === null) throw new Error('metric thiếu giá trị ' + id);
    return x.value;
  }

  f(id: string, fmt?: string): string {
    const x = this.m.get(id);
    if (!x) throw new Error('thiếu metric ' + id);
    const fn = FMT[fmt || x.fmt];
    if (!fn) throw new Error('thiếu định dạng ' + fmt);
    this.used.add(id);
    return x.value === null ? 'Chưa có dữ liệu' : fn(x.value);
  }

  /** Every valid written form of every bundled number (for the number checker). */
  allForms(): Set<string> {
    const s = new Set<string>();
    for (const x of this.m.values()) if (x.value !== null) for (const fn of Object.values(FMT)) s.add(fn(x.value).replace(/ tỷ$|đ$|%$/, ''));
    return s;
  }

  toJSON(): (Metric & { display: string; usedInText: boolean })[] {
    return [...this.m.values()].map(x => ({ ...x, display: x.value === null ? 'Chưa có dữ liệu' : FMT[x.fmt]!(x.value), usedInText: this.used.has(x.id) }));
  }
}

export type NarrativeEntry = { text: string; template: string; where: string };
export type HardcodedNumber = { where: string; token: string; template: string };

// Literal digits allowed in a template: Phần/Hình/Bảng/PL numbers, dates,
// quarter/year, ranges of days/products/shops and "top N".
export const LITERAL_OK: readonly RegExp[] = [
  /(Phần|Hình|Bảng|PL\.|Phụ lục|Giả thuyết|việc|Việc|bước)\s*\d+(\.\d+)?(–\d+)?(,\s*\d+(\.\d+)?)*/g,
  /\d{2}\/\d{2}\/\d{4}/g,
  /quý \d\/\d{4}|[Qq]uý \d năm \d{4}|năm \d{4}/g,
  /\b\d+–\d+ (ngày|sản phẩm|gian hàng)\b/g,
  /\b(top|Top) \d+\b/g,
];

/** Per-report narrative log. One instance per build, never shared. */
export class Narrator {
  readonly entries: NarrativeEntry[] = [];
  constructor(readonly bundle: Bundle) {}

  nar(template: string, where = ''): string {
    const text = template.replace(/\{\{([\w.:-]+)\}\}/g, (_, k: string) => {
      const [id = '', fmt] = k.split(':');
      return this.bundle.f(id, fmt);
    });
    this.entries.push({ text, template, where });
    return text;
  }

  /** extraOk: profile labels that contain digits (price bands, size marks), not measurements. */
  checkHardcoded(extraOk: readonly string[] = []): { checked: number; hardcoded: HardcodedNumber[] } {
    const bad: HardcodedNumber[] = [];
    for (const n of this.entries) {
      let t = n.template.replace(/\{\{[^}]+\}\}/g, '').replace(/<[^>]+>/g, ' ');
      for (const x of extraOk) t = t.split(x).join(' ');
      for (const re of LITERAL_OK) t = t.replace(re, ' ');
      for (const m of t.matchAll(/\d[\d.,]*/g)) bad.push({ where: n.where, token: m[0], template: n.template.slice(0, 120) });
    }
    return { checked: this.entries.length, hardcoded: bad };
  }

  /** Numbers in rendered narrative text that no bundled metric can produce. */
  notInBundle(extraOk: readonly string[] = []): { where: string; t: string }[] {
    const forms = this.bundle.allForms();
    const unsigned = new Set([...forms].map(f => f.replace(/^-/, '')));
    return this.entries.flatMap(x => [...x.text.replace(/<[^>]+>/g, ' ').matchAll(/\d[\d.,]*/g)]
      .map(m => m[0].replace(/[.,]$/, ''))
      .filter(t => !forms.has(t) && !unsigned.has(t) && !extraOk.some(e => e.includes(t)) && !/^\d{1,2}$/.test(t) && !/^\d{2}\/\d{2}\/\d{4}$/.test(t) && !/^(20\d\d)$/.test(t))
      .map(t => ({ where: x.where, t })));
  }
}

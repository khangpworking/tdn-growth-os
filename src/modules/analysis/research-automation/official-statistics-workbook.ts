// Cục Thống kê workbook profiles (S21): locate the four monthly tables and the national CPI table by their printed title
// and header, never by sheet name or position, and read exact cell strings for the confirmed row labels of one category group.
//
// The reader (scripts/read-official-stats-sheet.py) returns stored strings and cached numbers only; no formula is evaluated.
// A header that does not match a pinned variant gives LAYOUT_UNKNOWN for that table only. Blank, "-", ".." and any other
// non-number are MISSING, never 0. Values are background figures: the E12 guard refuses arithmetic with them.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StepOfficialStatsTable, StepOfficialStatsTableId, StepOfficialStatsValue, StepOfficialStatsValueStatus } from './model.js';

export const OFFICIAL_STATS_READER_MAX_BYTES = 20 * 1024 * 1024;
export const OFFICIAL_STATS_READER_TIMEOUT_MS = 30_000;

// ---- reader port ----

export interface OfficialStatsCell { readonly kind: 't' | 'n' | 'o'; readonly text: string; readonly decimals: number | null }
export interface OfficialStatsSheet { readonly name: string; readonly state: string; readonly cells: ReadonlyMap<string, OfficialStatsCell> }
export type OfficialStatsReadResult =
  | { readonly kind: 'OK'; readonly sheets: readonly OfficialStatsSheet[] }
  | { readonly kind: 'UNAVAILABLE' }
  | { readonly kind: 'REJECTED'; readonly code: string };
export type OfficialStatsWorkbookReader = (bytes: Buffer) => OfficialStatsReadResult;

const REF = /^([A-Z]{1,3})([1-9]\d{0,6})$/u;

/** Parses the reader's JSON; anything outside the documented shape is a rejection. */
export function parseReaderOutput(text: string): OfficialStatsReadResult {
  let root: unknown;
  try { root = JSON.parse(text); } catch { return { kind: 'REJECTED', code: 'READER_OUTPUT_INVALID' }; }
  if (typeof root !== 'object' || root === null || !Array.isArray((root as { sheets?: unknown }).sheets)) return { kind: 'REJECTED', code: 'READER_OUTPUT_INVALID' };
  const sheets: OfficialStatsSheet[] = [];
  for (const item of (root as { sheets: unknown[] }).sheets) {
    if (typeof item !== 'object' || item === null) return { kind: 'REJECTED', code: 'READER_OUTPUT_INVALID' };
    const { name, state, cells } = item as { name?: unknown; state?: unknown; cells?: unknown };
    if (typeof name !== 'string' || typeof state !== 'string' || !Array.isArray(cells)) return { kind: 'REJECTED', code: 'READER_OUTPUT_INVALID' };
    const map = new Map<string, OfficialStatsCell>();
    for (const cell of cells) {
      if (!Array.isArray(cell) || cell.length !== 4) return { kind: 'REJECTED', code: 'READER_OUTPUT_INVALID' };
      const [ref, kind, value, decimals] = cell as unknown[];
      if (typeof ref !== 'string' || !REF.test(ref) || (kind !== 't' && kind !== 'n' && kind !== 'o') || typeof value !== 'string'
        || !(decimals === null || (Number.isInteger(decimals) && (decimals as number) >= 0 && (decimals as number) <= 10))) return { kind: 'REJECTED', code: 'READER_OUTPUT_INVALID' };
      map.set(ref, { kind, text: value, decimals: decimals as number | null });
    }
    sheets.push({ name, state, cells: map });
  }
  return { kind: 'OK', sheets };
}

/** Runs the stdlib reader with `python3 -I`, workbook bytes on stdin, a timeout and a size limit. */
export const defaultOfficialStatsWorkbookReader: OfficialStatsWorkbookReader = bytes => {
  if (bytes.byteLength === 0 || bytes.byteLength > OFFICIAL_STATS_READER_MAX_BYTES) return { kind: 'REJECTED', code: 'WORKBOOK_SIZE_LIMIT' };
  const run = spawnSync('python3', ['-I', fileURLToPath(new URL('../../../../scripts/read-official-stats-sheet.py', import.meta.url))],
    { input: bytes, timeout: OFFICIAL_STATS_READER_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, shell: false, windowsHide: true });
  if (run.error) return { kind: 'UNAVAILABLE' };
  if (run.status !== 0) {
    let code = 'INVALID_XLSX';
    try { const parsed = JSON.parse(run.stderr.toString('utf8')) as { code?: unknown }; if (typeof parsed.code === 'string' && /^[A-Z_]{1,60}$/u.test(parsed.code)) code = parsed.code; } catch { /* fixed fallback */ }
    return { kind: 'REJECTED', code };
  }
  return parseReaderOutput(run.stdout.toString('utf8'));
};

// ---- text rules ----

/** NFC, every whitespace run (including line breaks and no-break spaces) collapsed to one space, trimmed. Nothing else. */
export const normalizeOfficialText = (value: string): string => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
/** Sheet titles print a running number ("24. Tổng mức …"); the number moves between editions, the words do not. */
const stripTableNumber = (value: string): string => value.replace(/^\d{1,3}\s*\.\s*/u, '');
const MISSING = new Set(['', '-', '–', '—', '..', '...', '…', 'x', 'X']);
const PLAIN_NUMBER = /^-?\d{1,30}(?:\.\d{1,30})?$/u;

const colNumber = (letters: string): number => [...letters].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
const colLetters = (n: number): string => { let s = ''; for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + ((v - 1) % 26)) + s; return s; };
const text = (sheet: OfficialStatsSheet, ref: string): string => {
  const cell = sheet.cells.get(ref);
  return cell && cell.kind === 't' ? normalizeOfficialText(cell.text) : '';
};
/** Text of a header cell, where a number cell (a year printed as a number) reads as its digits. */
const headerText = (sheet: OfficialStatsSheet, ref: string): string => {
  const cell = sheet.cells.get(ref);
  if (!cell) return '';
  if (cell.kind === 'n') return /^\d{4}$/u.test(cell.text) ? cell.text : '';
  return cell.kind === 't' ? normalizeOfficialText(cell.text) : '';
};

/** Header fingerprint: every non-empty header cell as `REF=text`, digits as "#", a quarter numeral as "#". */
export function officialHeaderHash(sheet: OfficialStatsSheet, firstRow: number, lastRow: number, lastCol: string): string {
  const lines: string[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    for (let c = 1; c <= colNumber(lastCol); c++) {
      const ref = `${colLetters(c)}${r}`, cell = sheet.cells.get(ref);
      if (!cell) continue;
      const value = cell.kind === 'n' ? '#' : cell.kind === 't' ? normalizeOfficialText(cell.text).replace(/\d+/gu, '#').replace(/\bquý [IV]{1,3}\b/giu, 'quý #') : '?';
      if (value !== '') lines.push(`${ref}=${value}`);
    }
  }
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

// ---- display ----

/** Rounds a plain decimal string half away from zero to `decimals` places, in exact decimal arithmetic. */
export function roundDecimalText(value: string, decimals: number): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!m) return value;
  const [, sign, int, frac = ''] = m;
  if (frac.length <= decimals) return `${sign}${int}${decimals ? `.${frac.padEnd(decimals, '0')}` : ''}`;
  let digits = BigInt(int! + frac.slice(0, decimals));
  if (frac.charCodeAt(decimals) >= 53) digits += 1n;
  const raw = digits.toString().padStart(decimals + 1, '0');
  const head = raw.slice(0, raw.length - decimals), tail = raw.slice(raw.length - decimals);
  const zero = /^0*$/u.test(head + tail);
  return `${zero ? '' : sign}${head}${decimals ? `.${tail}` : ''}`;
}
/** Vietnamese display: "." groups thousands, "," marks decimals. */
export function vietnameseDecimal(value: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!m) return value;
  return `${m[1]}${m[2]!.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')}${m[3] ? `,${m[3]}` : ''}`;
}

// ---- E12 guard ----

/** Thrown on any attempt to compute with a Cục Thống kê figure (sum, ratio, share, comparison with sample numbers). */
export class OfficialStatisticsCombinationError extends Error {
  readonly code = 'OFFICIAL_STATS_COMBINATION_REFUSED' as const;
  constructor() {
    super('Official statistics are background only and are never combined with other numbers.');
    this.name = 'OfficialStatisticsCombinationError';
  }
}
/** A printable figure: it converts to its display text and refuses every numeric conversion. */
export interface OfficialStatsFigure { readonly text: string; toString(): string }
export function officialStatsFigure(value: Pick<StepOfficialStatsValue, 'shown'>): OfficialStatsFigure {
  const shown = value.shown === null ? null : vietnameseDecimal(value.shown);
  const figure = {
    text: shown ?? '',
    toString: () => shown ?? '',
    valueOf: (): never => { throw new OfficialStatisticsCombinationError(); },
    [Symbol.toPrimitive]: (hint: string): string => {
      if (hint === 'string') return shown ?? '';
      throw new OfficialStatisticsCombinationError();
    },
  };
  return Object.freeze(figure);
}
/** The single sanctioned entry point for combining an official figure with anything: it always refuses. */
export function refuseOfficialStatsArithmetic(..._operands: readonly unknown[]): never {
  throw new OfficialStatisticsCombinationError();
}

// ---- category map ----

export interface OfficialStatsCategoryLabel { readonly table: StepOfficialStatsTableId; readonly label: string }
export interface OfficialStatsCategoryGroup { readonly categoryGroup: string; readonly labels: readonly OfficialStatsCategoryLabel[] }
/** Confirmed labels only: each one is printed exactly so (after NFC and whitespace collapse) as a row label in a published workbook.
 *  Mirrors `official-statistics-category-map.json` (v2); a test keeps the two equal. */
export const OFFICIAL_STATS_CATEGORY_MAP: readonly OfficialStatsCategoryGroup[] = [
  { categoryGroup: 'Thực phẩm chế biến, đồ ngọt, ăn vặt', labels: [{ table: 'CPI', label: 'Thực phẩm' }, { table: 'CPI_WORKBOOK', label: '2 - Thực phẩm' }, { table: 'EXPORT', label: 'Bánh kẹo và các sản phẩm từ ngũ cốc' }] },
  { categoryGroup: 'Sữa và sản phẩm sữa', labels: [{ table: 'CPI', label: 'Thực phẩm' }, { table: 'CPI_WORKBOOK', label: '2 - Thực phẩm' }, { table: 'IMPORT', label: 'Sữa và sản phẩm sữa' }] },
  { categoryGroup: 'Đồ uống', labels: [{ table: 'CPI', label: 'Đồ uống và thuốc lá' }, { table: 'CPI_WORKBOOK', label: 'II. Đồ uống và thuốc lá' }] },
  { categoryGroup: 'Nguyên liệu cho quán ăn uống (khách mua sỉ)', labels: [{ table: 'CPI', label: 'Ăn uống ngoài gia đình' }, { table: 'CPI_WORKBOOK', label: '3 - Ăn uống ngoài gia đình' }, { table: 'RETAIL', label: 'Dịch vụ lưu trú, ăn uống' }] },
  { categoryGroup: 'Đồ gia dụng, đồ dùng nhà bếp, thiết bị nhỏ', labels: [{ table: 'CPI', label: 'Thiết bị và đồ dùng gia đình' }, { table: 'CPI_WORKBOOK', label: 'V. Thiết bị và đồ dùng gia đình' }] },
  { categoryGroup: 'Thời trang', labels: [{ table: 'CPI', label: 'May mặc, mũ nón và giày dép' }, { table: 'CPI_WORKBOOK', label: 'III. May mặc, mũ nón, giày dép' }, { table: 'EXPORT', label: 'Hàng dệt, may' }, { table: 'EXPORT', label: 'Giày dép' }, { table: 'IMPORT', label: 'Nguyên PL dệt, may, giày dép' }] },
  { categoryGroup: 'Văn phòng phẩm, sách, đồ chơi', labels: [{ table: 'CPI', label: 'Giáo dục' }, { table: 'CPI', label: 'Văn hoá, giải trí và du lịch' }, { table: 'CPI_WORKBOOK', label: 'IX. Giáo dục' }, { table: 'CPI_WORKBOOK', label: 'X. Văn hoá, giải trí và du lịch' }] },
  { categoryGroup: 'Mỹ phẩm, chăm sóc cá nhân, đồ dùng khác', labels: [{ table: 'CPI', label: 'Hàng hóa và dịch vụ khác' }, { table: 'CPI_WORKBOOK', label: 'XI. Hàng hoá và dịch vụ khác' }, { table: 'IMPORT', label: 'Chất thơm, mỹ phẩm và chế phẩm vệ sinh' }] },
  { categoryGroup: 'Mọi ngành hàng', labels: [{ table: 'CPI', label: 'CHỈ SỐ GIÁ TIÊU DÙNG' }, { table: 'CPI_WORKBOOK', label: 'CHỈ SỐ GIÁ TIÊU DÙNG' }] },
];
export const OFFICIAL_STATS_CATEGORY_GROUPS: readonly string[] = OFFICIAL_STATS_CATEGORY_MAP.map(item => item.categoryGroup);
export const officialStatsGroupLabels = (group: string): readonly OfficialStatsCategoryLabel[] =>
  OFFICIAL_STATS_CATEGORY_MAP.find(item => item.categoryGroup === group)?.labels ?? [];

// ---- profiles ----

const STATUS_WORDS: Readonly<Record<string, StepOfficialStatsValueStatus>> = { 'Ước tính': 'UOC_TINH', 'Sơ bộ': 'SO_BO', 'Chính thức': 'CHINH_THUC' };
interface ColumnMeaning {
  readonly col: string;
  readonly measure: 'LEVEL' | 'INDEX';
  readonly unit: string | null;
  readonly base: string | null;
  readonly status: StepOfficialStatsValueStatus;
}
interface Located { readonly period: string; readonly columns: readonly ColumnMeaning[] }
interface Profile {
  readonly table: StepOfficialStatsTableId;
  /** Does this sheet carry the table's printed title? */
  readonly titled: (sheet: OfficialStatsSheet) => boolean;
  readonly header: { readonly first: number; readonly last: number; readonly lastCol: string };
  readonly dataRows: { readonly first: number; readonly last: number };
  readonly labelCols: readonly string[];
  /** Reads the period, units, bases and status words from the header; null when any of them is not the pinned wording. */
  readonly meaning: (sheet: OfficialStatsSheet, variant: string) => Located | null;
}

const monthYear = (month: string, year: string): string => `Tháng ${Number(month)} năm ${year}`;
const lowerFirst = (value: string): string => value.charAt(0).toLocaleLowerCase('vi') + value.slice(1);
const statusOf = (word: string): StepOfficialStatsValueStatus | null => STATUS_WORDS[word] ?? null;

const tradeProfile = (table: 'EXPORT' | 'IMPORT', title: string): Profile => ({
  table,
  titled: sheet => stripTableNumber(text(sheet, 'A1')) === title,
  header: { first: 3, last: 7, lastCol: 'M' },
  dataRows: { first: 9, last: 120 },
  labelCols: ['A', 'B'],
  meaning: sheet => {
    const month = /^Tháng (\d{1,2})$/u.exec(text(sheet, 'C5')), year = /^năm (\d{4})$/u.exec(text(sheet, 'C6'));
    const compareMonth = /^Tháng (\d{1,2})$/u.exec(text(sheet, 'I5')), base = /^So với (.+) \(%\)$/u.exec(text(sheet, 'I4'));
    const status = statusOf(text(sheet, 'C4'));
    if (!month || !year || !compareMonth || compareMonth[1] !== month[1] || !base || !status || text(sheet, 'M3') !== 'Nghìn tấn; Triệu USD'
      || text(sheet, 'D7') !== 'Trị giá' || text(sheet, 'J7') !== 'Trị giá') return null;
    return { period: monthYear(month[1]!, year[1]!), columns: [
      { col: 'D', measure: 'LEVEL', unit: 'triệu USD', base: null, status },
      { col: 'J', measure: 'INDEX', unit: null, base: lowerFirst(base[1]!), status },
    ] };
  },
});

const PROFILES: readonly Profile[] = [
  {
    table: 'RETAIL',
    titled: sheet => stripTableNumber(text(sheet, 'A1')) === 'Tổng mức bán lẻ hàng hóa và doanh thu dịch vụ tiêu dùng',
    header: { first: 3, last: 9, lastCol: 'H' },
    dataRows: { first: 11, last: 30 },
    labelCols: ['A', 'B'],
    meaning: sheet => {
      const month = /^tháng (\d{1,2})$/u.exec(text(sheet, 'D5')), year = headerText(sheet, 'D7');
      const compareMonth = /^Tháng (\d{1,2})$/u.exec(text(sheet, 'G4'));
      const base = /^so với (.+) \(%\)$/u.exec(['G6', 'G7', 'G8', 'G9'].map(ref => text(sheet, ref)).join(' '));
      const status = statusOf(text(sheet, 'D4'));
      if (!month || !/^\d{4}$/u.test(year) || !compareMonth || compareMonth[1] !== month[1] || !base || !status || text(sheet, 'H3') !== 'Tỷ đồng') return null;
      return { period: monthYear(month[1]!, year), columns: [
        { col: 'D', measure: 'LEVEL', unit: 'tỷ đồng', base: null, status },
        { col: 'G', measure: 'INDEX', unit: null, base: base[1]!, status },
      ] };
    },
  },
  tradeProfile('EXPORT', 'Hàng hóa xuất khẩu'),
  tradeProfile('IMPORT', 'Hàng hóa nhập khẩu'),
  {
    table: 'CPI',
    titled: sheet => stripTableNumber(text(sheet, 'A1')) === 'Chỉ số giá tiêu dùng, chỉ số giá vàng, chỉ số giá đô la Mỹ'
      && ['và lạm phát cơ bản', 'và lạm phát cơ bản(*)'].includes(text(sheet, 'A2')),
    header: { first: 4, last: 10, lastCol: 'I' },
    dataRows: { first: 12, last: 40 },
    labelCols: ['A', 'B', 'C'],
    meaning: sheet => {
      const period = /^Tháng (\d{1,2}) năm (\d{4}) so với:$/u.exec(text(sheet, 'D5'));
      const baseOf = (col: string): string | null => {
        const month = /^Tháng (\d{1,2})$/u.exec(text(sheet, `${col}6`)), year = headerText(sheet, `${col}8`);
        return month && text(sheet, `${col}7`) === 'năm' && /^\d{4}$/u.test(year) ? `tháng ${Number(month[1])} năm ${year}` : null;
      };
      const yearAgo = baseOf('E'), monthAgo = baseOf('G');
      if (!period || !yearAgo || !monthAgo || text(sheet, 'E6') !== `Tháng ${period[1]}`) return null;
      return { period: monthYear(period[1]!, period[2]!), columns: [
        { col: 'E', measure: 'INDEX', unit: null, base: yearAgo, status: 'NOT_STATED' },
        { col: 'G', measure: 'INDEX', unit: null, base: monthAgo, status: 'NOT_STATED' },
      ] };
    },
  },
  {
    table: 'CPI_WORKBOOK',
    titled: sheet => text(sheet, 'A1') === 'Biểu 1' && text(sheet, 'A2') === 'CHỈ SỐ GIÁ TIÊU DÙNG,'
      && text(sheet, 'A3') === 'CHỈ SỐ GIÁ VÀNG VÀ CHỈ SỐ GIÁ ĐÔ LA MỸ' && text(sheet, 'A4') === 'CẢ NƯỚC',
    header: { first: 5, last: 9, lastCol: 'G' },
    dataRows: { first: 10, last: 28 },
    labelCols: ['A'],
    meaning: sheet => {
      const period = /^Tháng (\d{1,2}) năm (\d{4})$/u.exec(text(sheet, 'A5'));
      const baseOf = (ref: string): string | null => {
        const m = /^Tháng (\d{1,2}) năm (\d{4})$/u.exec(text(sheet, ref));
        return m ? `tháng ${Number(m[1])} năm ${m[2]}` : null;
      };
      const yearAgo = baseOf('C9'), monthAgo = baseOf('E9');
      if (!period || !yearAgo || !monthAgo) return null;
      return { period: monthYear(period[1]!, period[2]!), columns: [
        { col: 'C', measure: 'INDEX', unit: null, base: yearAgo, status: 'NOT_STATED' },
        { col: 'E', measure: 'INDEX', unit: null, base: monthAgo, status: 'NOT_STATED' },
      ] };
    },
  },
];

/** Header fingerprints of the variants seen in published workbooks (months 7, 8 and 9 of 2026; national CPI workbooks of
 *  months 5, 7, 8 and 9). Variant names describe the visible difference. */
const VARIANTS: Readonly<Record<StepOfficialStatsTableId, Readonly<Record<string, string>>>> = {
  RETAIL: {
    'cong-don': '7d6e1f1149c5a82b2285b0b56eb1a151c2354321606ac2b0425e2d597ef41245',
    'uoc-tinh-luy-ke': '5349394fae3d84dbde8085b74c2db0e638fd2b613ef820969dd1022a6b658bd7',
  },
  EXPORT: { 'thang-va-luy-ke': '84c4634e0a63091478739a75ec7f489bca615650d108bcefd36b9133d7e368ee' },
  IMPORT: { 'thang-va-luy-ke': '84c4634e0a63091478739a75ec7f489bca615650d108bcefd36b9133d7e368ee' },
  CPI: {
    'thang': 'cbcddc06e91ff9fca550f01ea485a433a76a8e2c541718412a6b26f6c988b76d',
    'thang-cuoi-quy': 'cfc204acc1ecfce7743b693084f5f98f5d11b07be13a7882c0fe3e97bf778aa0',
  },
  CPI_WORKBOOK: {
    'don-vi-o-dong-7': 'dcbc94688e00fa43df21ab1f845fcfbb3076b7f9741d5f05a0230a260e5d9459',
    'binh-quan-luy-ke': '60d0b62eeb553a4586e3a2882d705070746015fdf07de25426c71118860379ec',
    'binh-quan-quy-va-luy-ke': '5b92dfcd63f8d051ef2c654562c25287d6e369e6384723e100445ba05a60d500',
  },
};
export const OFFICIAL_STATS_LAYOUT_VARIANTS = VARIANTS;

export interface OfficialStatsTableRead {
  readonly table: StepOfficialStatsTableId;
  readonly outcome: StepOfficialStatsTable['outcome'];
  readonly sheet: string | null;
  readonly variant: string | null;
  readonly headerHash: string | null;
  /** Values for the requested labels, in label order then column order. */
  readonly values: readonly Omit<StepOfficialStatsValue, 'captureIndex'>[];
}

/** Locates one table and reads the requested row labels. Exactly one visible sheet must carry the title. */
export function readOfficialStatsTable(sheets: readonly OfficialStatsSheet[], table: StepOfficialStatsTableId, labels: readonly string[]): OfficialStatsTableRead {
  const profile = PROFILES.find(item => item.table === table)!;
  const titled = sheets.filter(sheet => sheet.state === 'visible' && profile.titled(sheet));
  const none = (outcome: StepOfficialStatsTable['outcome'], sheet: string | null = null, headerHash: string | null = null): OfficialStatsTableRead =>
    ({ table, outcome, sheet, variant: null, headerHash, values: [] });
  if (titled.length === 0) return none('NOT_FOUND');
  if (titled.length > 1) return none('LAYOUT_UNKNOWN');
  const sheet = titled[0]!;
  const hash = officialHeaderHash(sheet, profile.header.first, profile.header.last, profile.header.lastCol);
  const variant = Object.entries(VARIANTS[table]).find(([, pinned]) => pinned === hash)?.[0] ?? null;
  if (variant === null) return none('LAYOUT_UNKNOWN', sheet.name, hash);
  const located = profile.meaning(sheet, variant);
  if (!located) return none('LAYOUT_UNKNOWN', sheet.name, hash);
  const values: Omit<StepOfficialStatsValue, 'captureIndex'>[] = [];
  for (const wanted of labels) {
    const label = normalizeOfficialText(wanted);
    const rows: number[] = [];
    for (let r = profile.dataRows.first; r <= profile.dataRows.last; r++) {
      if (profile.labelCols.some(col => text(sheet, `${col}${r}`) === label)) rows.push(r);
    }
    if (rows.length !== 1) continue; // absent or printed twice: no value is taken
    const row = rows[0]!;
    for (const column of located.columns) {
      const ref = `${column.col}${row}`, cell = sheet.cells.get(ref);
      let value: string | null = null, shown: string | null = null;
      if (cell && cell.kind === 'n' && PLAIN_NUMBER.test(cell.text)) {
        value = cell.text;
        shown = cell.decimals === null ? cell.text : roundDecimalText(cell.text, cell.decimals);
      } else if (cell && cell.kind === 't' && !MISSING.has(normalizeOfficialText(cell.text))) {
        value = null; // printed text in a number column: missing, never parsed
      }
      values.push({ table, sheet: sheet.name, row, cell: ref, label, period: located.period, measure: column.measure, value, shown, unit: column.unit, base: column.base, status: column.status });
    }
  }
  return { table, outcome: 'READ', sheet: sheet.name, variant, headerHash: hash, values };
}

/** Header fingerprint of the sheet carrying a table's title, for pinning a newly seen variant. Null when not exactly one sheet carries it. */
export function officialStatsHeaderProbe(sheets: readonly OfficialStatsSheet[], table: StepOfficialStatsTableId): { readonly sheet: string; readonly headerHash: string; readonly meaningOk: boolean } | null {
  const profile = PROFILES.find(item => item.table === table)!;
  const titled = sheets.filter(sheet => sheet.state === 'visible' && profile.titled(sheet));
  if (titled.length !== 1) return null;
  const sheet = titled[0]!;
  return { sheet: sheet.name, headerHash: officialHeaderHash(sheet, profile.header.first, profile.header.last, profile.header.lastCol), meaningOk: profile.meaning(sheet, '') !== null };
}

export const OFFICIAL_STATS_STATUS_TEXT: Readonly<Record<StepOfficialStatsValueStatus, string>> = {
  UOC_TINH: 'ước tính', SO_BO: 'sơ bộ', CHINH_THUC: 'chính thức', NOT_STATED: 'bảng không ghi',
};

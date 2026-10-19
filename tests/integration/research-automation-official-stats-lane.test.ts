// Cục Thống kê lane (S21, E12). Fake transport, fake clock and synthetic workbooks only; no network.
// Titles and header labels follow the published layout (layout, not data); every number here is synthetic.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import {
  createOfficialStatsSource, officialStatsDocument, officialStatsEnabled, officialStatsMonthKey, officialStatsProvinceEnabled, officialStatsProvinceRows, officialStatsUrlAllowed, parseOfficialStatsListing,
  OFFICIAL_STATS_MAX_CALLS, OFFICIAL_STATS_PROVINCE_NOTE, OFFICIAL_STATS_PROVINCE_TITLE, officialStatsRenderableRows,
  pickCpiWorkbook, pickMonthlyWorkbook, validateGroupPick, validateGroupVerification, validOfficialStats, OFFICIAL_STATS_PICKABLE_GROUPS, type OfficialStatsModelPort, type OfficialStatsSource,
} from '../../src/modules/analysis/research-automation/official-statistics-lane.js';
import {
  defaultOfficialStatsWorkbookReader, officialStatsFigure, readOfficialStatsProvinces, readOfficialStatsTable, refuseOfficialStatsArithmetic, OfficialStatisticsCombinationError, OFFICIAL_STATS_PROVINCE_VARIANTS,
  OFFICIAL_STATS_CATEGORY_MAP, type OfficialStatsSheet, type OfficialStatsWorkbookReader,
} from '../../src/modules/analysis/research-automation/official-statistics-workbook.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import { buildMarketReport, computeReaderReportData, lint } from '../../src/modules/analysis/reader-report/index.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { SOURCE_REGISTRY } from '../../src/modules/analysis/research-automation/source-status.js';
import type { CaptureRecord } from '../../src/modules/analysis/research-automation/model.js';

// ---- synthetic workbooks ----

type Cell = string | { readonly n: string; readonly s?: 1 | 2 };
interface SheetSpec { readonly name: string; readonly hidden?: boolean; readonly cells: Readonly<Record<string, Cell>> }

/** Style 1 is the custom "0.0" format, style 2 the built-in "0.00" format; no style means General (no rounding). */
const DECIMALS: Readonly<Record<number, number>> = { 1: 1, 2: 2 };
function toSheets(specs: readonly SheetSpec[]): OfficialStatsSheet[] {
  return specs.map(spec => ({ name: spec.name, state: spec.hidden ? 'hidden' : 'visible', cells: new Map(Object.entries(spec.cells).map(([ref, cell]) =>
    [ref, typeof cell === 'string' ? { kind: 't' as const, text: cell, decimals: null } : { kind: 'n' as const, text: cell.n, decimals: cell.s ? DECIMALS[cell.s]! : null }])) }));
}

const xmlEscape = (value: string): string => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const refParts = (ref: string): [number, number] => {
  const m = /^([A-Z]+)(\d+)$/u.exec(ref)!;
  return [Number(m[2]), [...m[1]!].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0)];
};
function sheetXml(spec: SheetSpec): string {
  const rows = new Map<number, [number, string][]>();
  for (const [ref, cell] of Object.entries(spec.cells)) {
    const [row, col] = refParts(ref);
    const xml = typeof cell === 'string'
      ? `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`
      : `<c r="${ref}"${cell.s ? ` s="${cell.s}"` : ''}><v>${cell.n}</v></c>`;
    rows.set(row, [...(rows.get(row) ?? []), [col, xml]]);
  }
  const body = [...rows.entries()].sort(([a], [b]) => a - b)
    .map(([row, cells]) => `<row r="${row}">${cells.sort(([a], [b]) => a - b).map(([, xml]) => xml).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN}"><sheetData>${body}</sheetData></worksheet>`;
}
/** A tiny store-only zip writer: local headers, central directory, end record. */
function zip(entries: readonly (readonly [string, string | Buffer])[], compressed = false): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content, fileName = Buffer.from(name, 'utf8'), crc = crc32(data);
    const packed = compressed ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(compressed ? 8 : 0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, packed); centrals.push(central, fileName);
    offset += local.length + fileName.length + packed.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function xlsx(specs: readonly SheetSpec[]): Buffer {
  const sheets = specs.map((spec, i) => `<sheet name="${xmlEscape(spec.name)}" sheetId="${i + 1}"${spec.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('');
  const rels = specs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${OFFICE_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${MAIN}" xmlns:r="${OFFICE_REL}"><sheets>${sheets}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${MAIN}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="2"/></cellXfs></styleSheet>`],
    ...specs.map((spec, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(spec)]),
  ]);
}

// Published header layouts for a synthetic month 9 of 2026 (previous month 8, a year earlier 2025).
type RetailVariant = 'cong-don' | 'uoc-tinh-luy-ke';
function retailSheet(variant: RetailVariant, overrides: Readonly<Record<string, Cell>> = {}): SheetSpec {
  return { name: '5.Tongmuc', cells: {
    A1: '5. Tổng mức bán lẻ hàng hóa và doanh thu dịch vụ tiêu dùng',
    H3: 'Tỷ đồng', C4: 'Sơ bộ', D4: 'Ước tính', E4: variant === 'cong-don' ? 'Cộng dồn 9 tháng' : 'Ước tính 9 tháng', G4: 'Tháng 9 ', H4: '9 tháng',
    C5: 'tháng 8', D5: 'tháng 9', E5: 'năm 2026', G5: 'năm 2026', H5: 'năm 2026', C6: 'năm', D6: 'năm', E6: 'Tổng', F6: 'Cơ', G6: 'so với', H6: 'so với',
    C7: { n: '2026' }, D7: { n: '2026' }, E7: 'mức', F7: 'cấu (%)', G7: 'cùng kỳ', H7: 'cùng kỳ', G8: 'năm', H8: 'năm', G9: 'trước (%)', H9: 'trước (%)',
    A11: 'TỔNG SỐ', D11: { n: '777001.4', s: 1 }, G11: { n: '111.11', s: 2 },
    B12: 'Bán lẻ hàng hóa', D12: { n: '555002.2', s: 1 }, G12: { n: '112.22', s: 2 },
    B13: 'Dịch vụ lưu trú, ăn uống', D13: { n: '88003.36', s: 1 }, G13: { n: '113.336', s: 2 },
    B14: 'Du lịch lữ hành', D14: '-', G14: { n: '114.4', s: 2 },
    ...overrides,
  } };
}
function tradeSheet(table: 'EXPORT' | 'IMPORT', overrides: Readonly<Record<string, Cell>> = {}): SheetSpec {
  const exp = table === 'EXPORT';
  return { name: exp ? '12.XK' : '13.NK', cells: {
    A1: exp ? '12. Hàng hóa xuất khẩu' : '13. Hàng hóa nhập khẩu',
    M3: 'Nghìn tấn; Triệu USD', C4: 'Sơ bộ', I4: 'So với cùng kỳ năm trước (%)', C5: 'Tháng 9', F5: '9 tháng ', I5: 'Tháng 9', L5: '9 tháng ',
    C6: 'năm 2026', F6: 'năm 2026', I6: 'năm 2026', L6: 'năm 2026', C7: 'Lượng', D7: 'Trị giá', F7: 'Lượng', G7: 'Trị giá', I7: 'Lượng', J7: 'Trị giá', L7: 'Lượng', M7: 'Trị giá',
    A9: exp ? 'TỔNG TRỊ GIÁ' : 'TỔNG TRỊ GIÁ', D9: { n: '33301.1', s: 1 }, J9: { n: '121.1', s: 1 },
    B10: exp ? 'Bánh kẹo và các sản phẩm từ ngũ cốc' : 'Sữa và sản phẩm sữa', D10: { n: '222.2', s: 1 }, J10: { n: '122.2', s: 1 },
    B11: exp ? 'Hàng dệt, may' : 'Chất thơm, mỹ phẩm và chế phẩm vệ sinh', D11: { n: '333.3', s: 1 }, J11: { n: '123.3', s: 1 },
    ...overrides,
  } };
}
type CpiVariant = 'thang' | 'thang-cuoi-quy';
function cpiSheet(variant: CpiVariant): SheetSpec {
  const quarter = variant === 'thang-cuoi-quy';
  return { name: '15.CPI', cells: {
    A1: '15. Chỉ số giá tiêu dùng, chỉ số giá vàng, chỉ số giá đô la Mỹ ', A2: quarter ? '       và lạm phát cơ bản(*) ' : '      và lạm phát cơ bản ',
    ...(quarter ? { I4: '%', I5: 'Bình quân', H6: 'quý III', I6: '9 tháng', I7: 'năm 2026', I8: 'so với', I9: 'cùng kỳ', I10: 'năm trước' } : { H4: '%', H6: '9 tháng' }),
    D5: 'Tháng 9 năm 2026 so với:', H5: 'Bình quân', D6: 'Kỳ gốc', E6: 'Tháng 9', F6: 'Tháng 12', G6: 'Tháng 8',
    D7: { n: '2019' }, E7: 'năm ', F7: 'năm ', G7: 'năm ', H7: 'năm 2026', E8: { n: '2025' }, F8: { n: '2025' }, G8: { n: '2026' },
    H8: 'so với', H9: 'cùng kỳ', H10: 'năm trước',
    A12: 'CHỈ SỐ GIÁ TIÊU DÙNG', E12: { n: '101.11', s: 2 }, G12: { n: '102.22', s: 2 },
    B13: 'Hàng ăn và dịch vụ ăn uống', E13: { n: '103.33', s: 2 }, G13: { n: '104.44', s: 2 },
    C14: 'Thực phẩm', E14: { n: '105.55', s: 2 }, G14: { n: '106.66', s: 2 },
    C15: 'Ăn uống ngoài gia đình', E15: { n: '107.77', s: 2 }, G15: { n: '108.88', s: 2 },
    B16: 'Đồ uống và thuốc lá', E16: { n: '109.99', s: 2 }, G16: '-',
    B17: 'May mặc, mũ nón và giày dép', E17: { n: '111.12', s: 2 },
  } };
}
const filler = (count: number, from: number): SheetSpec[] => Array.from({ length: count }, (_, i) => ({ name: `${from + i}.Phu`, cells: { A1: `${from + i}. Biểu phụ giả lập` } }));
/** A monthly workbook: 20 sheets for a non-quarter month, 45 for the quarter's last month, as published. */
function monthlyWorkbook(options: { readonly sheets: 20 | 45; readonly cpi?: boolean; readonly exportOverrides?: Readonly<Record<string, Cell>> }): SheetSpec[] {
  const tables = [retailSheet(options.sheets === 20 ? 'cong-don' : 'uoc-tinh-luy-ke'), tradeSheet('EXPORT', options.exportOverrides), tradeSheet('IMPORT'),
    ...(options.cpi === false ? [] : [cpiSheet(options.sheets === 20 ? 'thang' : 'thang-cuoi-quy')])];
  return [...filler(4, 1), ...tables, ...filler(options.sheets - 4 - tables.length, 20)];
}
type CpiBookVariant = 'don-vi-o-dong-7' | 'binh-quan-luy-ke' | 'binh-quan-quy-va-luy-ke';
function cpiWorkbook(variant: CpiBookVariant): SheetSpec[] {
  const cells: Record<string, Cell> = {
    A1: 'Biểu 1', A2: 'CHỈ SỐ GIÁ TIÊU DÙNG,', A3: ' CHỈ SỐ GIÁ VÀNG VÀ CHỈ SỐ GIÁ ĐÔ LA MỸ', A4: ' CẢ NƯỚC', A5: 'Tháng 9 năm 2026',
    B8: 'CHỈ SỐ GIÁ THÁNG 9 NĂM 2026 SO VỚI',
    B9: 'Kỳ gốc\nnăm 2019', C9: 'Tháng 9\nnăm 2025', D9: 'Tháng 12\nnăm 2025', E9: 'Tháng 8\nnăm 2026',
    A10: 'CHỈ SỐ GIÁ TIÊU DÙNG', C10: { n: '101.51', s: 2 }, E10: { n: '100.51', s: 2 },
    A11: 'I. Hàng ăn và dịch vụ ăn uống', C11: { n: '102.51', s: 2 }, E11: { n: '101.52', s: 2 },
    A12: '2 - Thực phẩm', C12: { n: '103.51', s: 2 }, E12: { n: '101.53', s: 2 },
    A13: '3 - Ăn uống ngoài gia đình', C13: { n: '104.51', s: 2 }, E13: { n: '101.54', s: 2 },
    A14: 'II. Đồ uống và thuốc lá', C14: { n: '105.51', s: 2 }, E14: { n: '101.55', s: 2 },
  };
  if (variant === 'don-vi-o-dong-7') Object.assign(cells, { F7: 'Đơn vị tính: %', F8: 'Bình quân 9 tháng đầu năm 2026 so với cùng kỳ \nnăm 2025' });
  if (variant === 'binh-quan-luy-ke') Object.assign(cells, { F8: 'Bình quân 9 tháng năm 2026 so với cùng kỳ \nnăm 2025' });
  if (variant === 'binh-quan-quy-va-luy-ke') Object.assign(cells, { F7: 'Đơn vị tính: %', F8: 'Bình quân quý III năm 2026 so với cùng kỳ năm 2025', G8: 'Bình quân 9 tháng năm 2026 so với cùng kỳ năm 2025' });
  // A hidden copy of the national sheet must be ignored, and the regional sheets carry other titles.
  return [{ name: 'Cả nước', cells }, { name: 'Thành thị', cells: { A1: 'Biểu 2', A2: 'CHỈ SỐ GIÁ TIÊU DÙNG,' } }, { name: 'Nông thôn', cells: { A1: 'Biểu 3' } },
    { name: 'Vùng', cells: { A1: 'Biểu 4' } }, { name: 'Ẩn', hidden: true, cells }];
}
/** The province sheet ("Biểu 5"): the published header rows 1–7, synthetic province names on row 8 and synthetic numbers.
 *  Column C is in an accounting format (no stated precision), as some published months are. */
function provinceSheet(overrides: Readonly<Record<string, Cell>> = {}, rows: 30 | 84 = 30): SheetSpec {
  return { name: 'Địa phương', cells: {
    A1: 'Biểu 5', A2: 'CHỈ SỐ GIÁ TIÊU DÙNG,', A3: 'CHỈ SỐ GIÁ VÀNG VÀ CHỈ SỐ GIÁ ĐÔ LA MỸ MỘT SỐ ĐỊA PHƯƠNG', A4: 'Tháng 9 năm 2026', A5: '(Tháng trước = 100)',
    J7: 'Đơn vị tính: %', B8: 'Tỉnh A', C8: 'Tỉnh B', D8: 'Thành phố C',
    A9: 'CHỈ SỐ GIÁ TIÊU DÙNG', B9: { n: '100.123', s: 2 }, C9: { n: '99.876543210987654' }, D9: { n: '100.5', s: 2 },
    A10: 'I. Hàng ăn và dịch vụ ăn uống', B10: { n: '101.25', s: 2 }, C10: { n: '100.75' }, D10: '-',
    A11: 'II. Đồ uống và thuốc lá', B11: { n: '102.375', s: 2 }, C11: { n: '99.125' },
    A12: 'Vàng', B12: { n: '105.5', s: 2 },
    [`M${rows}`]: '', // Both published sheet extents share the same pinned header; trailing cells carry no data.
    ...overrides,
  } };
}
const withProvinces = (book: SheetSpec[], sheet: SheetSpec = provinceSheet()): SheetSpec[] => [...book.slice(0, 4), sheet, ...book.slice(4)];

/** In-memory reader for lane tests: looks the synthetic bytes up instead of spawning the stdlib reader. */
function memoryReader(books: readonly (readonly SheetSpec[])[]): { readonly reader: OfficialStatsWorkbookReader; readonly bytes: Buffer[] } {
  const bytes = books.map(book => xlsx(book));
  const byKey = new Map(bytes.map((item, i) => [item.toString('base64'), books[i]!]));
  return { bytes, reader: data => {
    const book = byKey.get(data.toString('base64'));
    return book ? { kind: 'OK', sheets: toSheets(book) } : { kind: 'REJECTED', code: 'INVALID_XLSX' };
  } };
}

// ---- fake listing, transport and model ----

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const UP = 'https://www.nso.gov.vn/wp-content/uploads/2026/10/';
const MONTHLY_URL = `${UP}Bieu-thang-9.2026.xlsx`;
const CPI_URL = `${UP}So-lieu-CPI-T9.2026.xlsx`;
const media = (id: number, date: string, url: string, mime = XLSX_MIME) => ({ id, date, title: { rendered: `Tệp giả lập ${id}` }, source_url: url, mime_type: mime });
const LISTING = [
  media(900, '2026-10-07T10:00:00', `${UP}Bieu-thang-9.2026-EN.xlsx`),
  media(899, '2026-10-07T09:30:00', 'https://nso.example.org/wp-content/uploads/2026/10/Bieu-thang-10.2026.xlsx'),
  media(898, '2026-10-07T09:20:00', `${UP}Bieu-thang-10.2026.xlsx?v=2`),
  media(897, '2026-10-07T09:10:00', 'https://www.nso.gov.vn/khac/Bieu-thang-10.2026.xlsx'),
  media(896, '2026-10-07T09:00:00', `${UP}Bieu-thang-10.2026.pdf`, 'application/pdf'),
  media(895, '2026-10-06T10:00:00', `${UP}So-lieu-CPI-T9.2026_Eng.xlsx`),
  media(890, '2026-10-06T09:00:00', MONTHLY_URL),
  media(880, '2026-10-06T08:00:00', `${UP}Bieu-thang-9.2026-ban-dau.xlsx`),
  media(870, '2026-10-06T07:00:00', CPI_URL),
  media(860, '2026-09-06T07:00:00', `${UP}Bieu-thang-8.2026.xlsx`),
];

function fake(files: Readonly<Record<string, Buffer>>, options: { readonly abortOnSleep?: number; readonly listing?: unknown } = {}) {
  const urls: URL[] = [], at: number[] = [], sleeps: number[] = [];
  let clock = 5_000_000;
  const controller = new AbortController();
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url); at.push(clock);
      clock += 300;
      if (url.pathname === '/wp-json/wp/v2/media') return new Response(JSON.stringify(options.listing ?? LISTING), { status: 200, headers: { 'content-type': 'application/json' } });
      const body = files[url.href];
      return body ? new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': XLSX_MIME } }) : new Response('missing', { status: 404 });
    }) as typeof fetch,
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      if (options.abortOnSleep === sleeps.length) controller.abort();
      if (signal?.aborted) throw new Error('aborted');
      clock += ms;
    },
    now: () => clock,
  };
  return { transport, urls, at, sleeps, controller };
}
function fakeModel(options: { readonly group?: string; readonly covers?: boolean } = {}): OfficialStatsModelPort & { asked: string[] } {
  const asked: string[] = [];
  return { asked, generateText: async request => {
    asked.push(request.systemText);
    if (request.systemText.includes('You place a product')) return JSON.stringify({ categoryGroup: options.group ?? 'Thực phẩm chế biến, đồ ngọt, ăn vặt' });
    return JSON.stringify({ covers: options.covers ?? true, reasonVi: 'Sản phẩm giả lập thuộc nhóm hàng này.' });
  } };
}
const INPUT = { keyword: 'synthetic snack', description: null, mode: 'CATEGORY' } as const;

// ---- flag, URL and listing rules ----

test('the flag is on only for the exact value "1"', () => {
  assert.equal(officialStatsEnabled({ TDN_RESEARCH_OFFICIAL_STATS_ENABLED: '1' }), true);
  for (const v of [undefined, '', '0', 'true', ' 1', '1 ']) assert.equal(officialStatsEnabled({ TDN_RESEARCH_OFFICIAL_STATS_ENABLED: v }), false, String(v));
});

test('a workbook link must be https on the office host, under uploads, an .xlsx file, with no query', () => {
  assert.equal(officialStatsUrlAllowed(MONTHLY_URL), true);
  for (const bad of [
    'http://www.nso.gov.vn/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx',
    'https://nso.gov.vn/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx',
    'https://www.nso.gov.vn.example.org/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx',
    'https://www.nso.gov.vn:8443/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx',
    'https://user@www.nso.gov.vn/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx',
    'https://www.nso.gov.vn/wp-content/plugins/Bieu-thang-9.2026.xlsx',
    'https://www.nso.gov.vn/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx?x=1',
    'https://www.nso.gov.vn/wp-content/uploads/2026/10/Bieu-thang-9.2026.xlsx#a',
    'https://www.nso.gov.vn/wp-content/uploads/2026/10/Bieu-thang-9.2026.pdf',
    `${UP}Bieu-thang-9.2026-%.xlsx`,
    `${UP}Bieu-thang-9.2026-%00.xlsx`,
    `${UP}%2f..%2fBieu-thang-9.2026.xlsx`,
    `${UP}Bieu-thang-9.2026-%5c.xlsx`,
  ]) assert.equal(officialStatsUrlAllowed(bad), false, bad);
});

test('listing: off-host, off-path, queried and non-spreadsheet entries are dropped; a wrong shape is null', () => {
  const items = parseOfficialStatsListing(Buffer.from(JSON.stringify(LISTING)))!;
  assert.deepEqual(items.map(item => item.id), [900, 895, 890, 880, 870, 860]);
  assert.equal(parseOfficialStatsListing(Buffer.from('{"not":"a list"}')), null);
  assert.equal(parseOfficialStatsListing(Buffer.from(JSON.stringify([{ id: 'x' }]))), null);
});

test('the newest Vietnamese revision is picked and English files are skipped', () => {
  const items = parseOfficialStatsListing(Buffer.from(JSON.stringify(LISTING)))!;
  const monthly = pickMonthlyWorkbook(items)!;
  assert.equal(monthly.item.url, MONTHLY_URL);
  assert.equal(monthly.revised, true, 'an older file for the same month was listed');
  assert.equal(pickCpiWorkbook(items)!.url, CPI_URL);
  assert.equal(officialStatsMonthKey('Bieu-thang-9.2026.xlsx'), '2026-09');
  assert.equal(officialStatsMonthKey('Bieu-T7.2026.xlsx'), '2026-07');
  assert.equal(pickMonthlyWorkbook(items.filter(item => item.id !== 880))!.revised, false);
  const newerAnnual = { id: 999, date: '2026-10-09T00:00:00', title: 'Biểu năm giả lập', url: `${UP}Bieu-nam-2025.xlsx` };
  assert.equal(pickMonthlyWorkbook([newerAnnual, ...items])!.item.url, MONTHLY_URL, 'a newer annual table is not a monthly workbook');
});

test('model answers outside the fixed list are invalid; NONE is its own answer', () => {
  assert.equal(validateGroupPick(JSON.stringify({ categoryGroup: 'Đồ uống' })), 'Đồ uống');
  assert.equal(validateGroupPick(JSON.stringify({ categoryGroup: 'NONE' })), 'NONE');
  assert.equal(validateGroupPick(JSON.stringify({ categoryGroup: 'Mọi ngành hàng' })), null, 'the reference line is never picked');
  assert.equal(validateGroupPick(JSON.stringify({ categoryGroup: 'Đồ uống', extra: 1 })), null);
  assert.equal(OFFICIAL_STATS_PICKABLE_GROUPS.includes('Mọi ngành hàng'), false);
  assert.equal(validateGroupVerification(JSON.stringify({ covers: true, reasonVi: 'OpenCLI xác nhận.' })), null);
});

test('the category map JSON mirrors the code map', async () => {
  const raw = await fs.readFile(new URL('../../src/modules/analysis/research-automation/official-statistics-category-map.json', import.meta.url), 'utf8');
  const json = JSON.parse(raw) as { contractVersion: string; groups: { categoryGroup: string; sourceLabelsState: string; labels: { table: string; label: string }[] }[] };
  assert.equal(json.contractVersion, 'official-statistics-category-map-v2');
  assert.ok(json.groups.every(group => group.sourceLabelsState === 'CONFIRMED'));
  assert.deepEqual(json.groups.map(group => ({ categoryGroup: group.categoryGroup, labels: group.labels })),
    OFFICIAL_STATS_CATEGORY_MAP.map(group => ({ categoryGroup: group.categoryGroup, labels: group.labels.map(label => ({ table: label.table, label: label.label })) })));
});

// ---- table location ----

test('20-sheet and 45-sheet monthly layouts both locate every table', () => {
  for (const [count, retail, cpi] of [[20, 'cong-don', 'thang'], [45, 'uoc-tinh-luy-ke', 'thang-cuoi-quy']] as const) {
    const sheets = toSheets(monthlyWorkbook({ sheets: count }));
    assert.equal(sheets.length, count);
    const r = readOfficialStatsTable(sheets, 'RETAIL', ['Dịch vụ lưu trú, ăn uống']);
    assert.deepEqual([r.outcome, r.variant, r.sheet], ['READ', retail, '5.Tongmuc'], `retail ${count}`);
    assert.deepEqual(r.values.map(v => [v.cell, v.value, v.shown, v.measure, v.unit, v.base, v.status, v.period]), [
      ['D13', '88003.36', '88003.4', 'LEVEL', 'tỷ đồng', null, 'UOC_TINH', 'Tháng 9 năm 2026'],
      ['G13', '113.336', '113.34', 'INDEX', null, 'cùng kỳ năm trước', 'UOC_TINH', 'Tháng 9 năm 2026'],
    ]);
    const c = readOfficialStatsTable(sheets, 'CPI', ['Thực phẩm']);
    assert.deepEqual([c.outcome, c.variant], ['READ', cpi], `cpi ${count}`);
    assert.deepEqual(c.values.map(v => [v.cell, v.shown, v.base]), [['E14', '105.55', 'tháng 9 năm 2025'], ['G14', '106.66', 'tháng 8 năm 2026']]);
    for (const table of ['EXPORT', 'IMPORT'] as const) {
      const t = readOfficialStatsTable(sheets, table, [table === 'EXPORT' ? 'Bánh kẹo và các sản phẩm từ ngũ cốc' : 'Sữa và sản phẩm sữa']);
      assert.deepEqual([t.outcome, t.variant], ['READ', 'thang-va-luy-ke'], `${table} ${count}`);
      assert.deepEqual(t.values.map(v => [v.cell, v.shown, v.unit, v.base, v.status]), [['D10', '222.2', 'triệu USD', null, 'SO_BO'], ['J10', '122.2', null, 'cùng kỳ năm trước', 'SO_BO']]);
    }
  }
});

test('the national CPI workbook variants are located; a hidden copy of the sheet is ignored', () => {
  for (const variant of ['don-vi-o-dong-7', 'binh-quan-luy-ke', 'binh-quan-quy-va-luy-ke'] as const) {
    const read = readOfficialStatsTable(toSheets(cpiWorkbook(variant)), 'CPI_WORKBOOK', ['II. Đồ uống và thuốc lá']);
    assert.deepEqual([read.outcome, read.variant, read.sheet], ['READ', variant, 'Cả nước'], variant);
    assert.deepEqual(read.values.map(v => [v.cell, v.shown, v.base]), [['C14', '105.51', 'tháng 9 năm 2025'], ['E14', '101.55', 'tháng 8 năm 2026']]);
  }
  const twice = cpiWorkbook('binh-quan-luy-ke').map(sheet => ({ ...sheet, hidden: false }));
  assert.equal(readOfficialStatsTable(toSheets(twice), 'CPI_WORKBOOK', []).outcome, 'LAYOUT_UNKNOWN', 'two visible sheets with the title are ambiguous');
});

test('an unknown header gives LAYOUT_UNKNOWN for that table only', () => {
  const sheets = toSheets(monthlyWorkbook({ sheets: 20, exportOverrides: { D7: 'Giá trị' } }));
  const exp = readOfficialStatsTable(sheets, 'EXPORT', ['Bánh kẹo và các sản phẩm từ ngũ cốc']);
  assert.equal(exp.outcome, 'LAYOUT_UNKNOWN');
  assert.deepEqual(exp.values, []);
  assert.equal(readOfficialStatsTable(sheets, 'IMPORT', ['Sữa và sản phẩm sữa']).outcome, 'READ');
  assert.equal(readOfficialStatsTable(sheets, 'CPI', ['Thực phẩm']).outcome, 'READ');
  // Same words but a different period meaning (month mismatch) is unknown too.
  const shifted = toSheets(monthlyWorkbook({ sheets: 20, exportOverrides: { I5: 'Tháng 8' } }));
  assert.equal(readOfficialStatsTable(shifted, 'EXPORT', []).outcome, 'LAYOUT_UNKNOWN');
});

test('a blank or "-" cell is missing, never 0; a label printed twice gives no value', () => {
  const sheets = toSheets(monthlyWorkbook({ sheets: 20 }));
  const retail = readOfficialStatsTable(sheets, 'RETAIL', ['Du lịch lữ hành']);
  assert.deepEqual(retail.values.map(v => [v.cell, v.value, v.shown]), [['D14', null, null], ['G14', '114.4', '114.40']]);
  const cpi = readOfficialStatsTable(sheets, 'CPI', ['Đồ uống và thuốc lá', 'May mặc, mũ nón và giày dép']);
  assert.deepEqual(cpi.values.map(v => [v.cell, v.value]), [['E16', '109.99'], ['G16', null], ['E17', '111.12'], ['G17', null]]);
  const twice = toSheets(monthlyWorkbook({ sheets: 20, exportOverrides: { B12: 'Bánh kẹo và các sản phẩm từ ngũ cốc', D12: { n: '1.5' } } }));
  assert.deepEqual(readOfficialStatsTable(twice, 'EXPORT', ['Bánh kẹo và các sản phẩm từ ngũ cốc']).values, []);
  assert.deepEqual(readOfficialStatsTable(sheets, 'CPI', ['thực phẩm', 'Thực phẩm gần đúng']).values, [], 'only exact labels match');
});

// ---- E12 guard ----

test('E12: an official figure prints but refuses every numeric use', () => {
  const figure = officialStatsFigure({ shown: '1234.5' });
  assert.equal(`${figure}`, '1.234,5');
  assert.equal(String(figure), '1.234,5');
  assert.throws(() => +(figure as unknown as number), OfficialStatisticsCombinationError);
  assert.throws(() => (figure as unknown as number) * 2, OfficialStatisticsCombinationError);
  assert.throws(() => (figure as unknown as number) + 1, OfficialStatisticsCombinationError);
  assert.throws(() => (figure as unknown as number) > 1, OfficialStatisticsCombinationError);
  assert.throws(() => refuseOfficialStatsArithmetic(figure, 10), OfficialStatisticsCombinationError);
});

// ---- lane ----

test('happy path: one listing and one download, at least 2 s apart, URL rules enforced', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 20 })]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! });
  const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
  assert.equal(result.status, 'OK');
  assert.equal(result.requests, 2);
  assert.deepEqual(f.urls.map(url => `${url.origin}${url.pathname}`), ['https://www.nso.gov.vn/wp-json/wp/v2/media', MONTHLY_URL]);
  assert.equal(f.urls[0]!.searchParams.get('mime_type'), XLSX_MIME);
  assert.ok(f.at[1]! - f.at[0]! >= 2_000, 'spacing');
  assert.equal(result.categoryGroup, 'Thực phẩm chế biến, đồ ngọt, ăn vặt');
  assert.deepEqual(result.files.map(file => [file.role, file.url, file.revised]), [['MONTHLY', MONTHLY_URL, true]]);
  assert.deepEqual(result.tables.map(t => [t.table, t.outcome, t.variant]), [['CPI', 'READ', 'thang'], ['EXPORT', 'READ', 'thang-va-luy-ke']]);
  assert.deepEqual(result.values.map(v => [v.table, v.label, v.cell]), [
    ['CPI', 'Thực phẩm', 'E14'], ['CPI', 'Thực phẩm', 'G14'], ['CPI', 'CHỈ SỐ GIÁ TIÊU DÙNG', 'E12'], ['CPI', 'CHỈ SỐ GIÁ TIÊU DÙNG', 'G12'],
    ['EXPORT', 'Bánh kẹo và các sản phẩm từ ngũ cốc', 'D10'], ['EXPORT', 'Bánh kẹo và các sản phẩm từ ngũ cốc', 'J10'],
  ]);
  const document = officialStatsDocument(result, 0, [1]);
  assert.equal(document.status, 'OK');
  assert.equal(validOfficialStats(document), true);
});

test('no CPI table in the monthly workbook: the national CPI workbook is the third and last call', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 20, cpi: false }), cpiWorkbook('binh-quan-luy-ke')]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]!, [CPI_URL]: mem.bytes[1]! });
  const result = await createOfficialStatsSource({ model: fakeModel({ group: 'Đồ uống' }), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
  assert.equal(result.status, 'OK');
  assert.deepEqual(f.urls.map(url => url.href.split('?')[0]), ['https://www.nso.gov.vn/wp-json/wp/v2/media', MONTHLY_URL, CPI_URL]);
  for (let i = 1; i < f.at.length; i++) assert.ok(f.at[i]! - f.at[i - 1]! >= 2_000, `gap ${i}`);
  assert.deepEqual(result.tables.map(t => [t.table, t.outcome]), [['CPI', 'NOT_FOUND'], ['CPI_WORKBOOK', 'READ']]);
  assert.deepEqual(result.values.map(v => [v.label, v.cell]), [['II. Đồ uống và thuốc lá', 'C14'], ['II. Đồ uống và thuốc lá', 'E14'], ['CHỈ SỐ GIÁ TIÊU DÙNG', 'C10'], ['CHỈ SỐ GIÁ TIÊU DÙNG', 'E10']]);
});

test('a recognized monthly CPI table without the selected group still triggers the CPI download', async () => {
  for (const missing of [true, false]) {
    const monthly = monthlyWorkbook({ sheets: 20 }).map(sheet => sheet.name === '15.CPI'
      ? { ...sheet, cells: { ...sheet.cells, ...(missing ? { C14: 'thực phẩm' } : { E14: '-', G14: '..' }) } } : sheet);
    const mem = memoryReader([monthly, cpiWorkbook('binh-quan-luy-ke')]);
    const f = fake({ [MONTHLY_URL]: mem.bytes[0]!, [CPI_URL]: mem.bytes[1]! });
    const model = fakeModel();
    const result = await createOfficialStatsSource({ model, transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
    assert.equal(result.requests, 3);
    assert.equal(result.status, 'OK');
    assert.ok(result.values.some(row => row.table === 'CPI_WORKBOOK' && row.label === '2 - Thực phẩm' && row.value !== null));
    for (let i = 1; i < f.at.length; i++) assert.ok(f.at[i]! - f.at[i - 1]! >= 2_000);
  }
});

test('an all-goods reference alone never makes the selected group complete', async () => {
  const monthly = monthlyWorkbook({ sheets: 20 }).map(sheet => sheet.name === '15.CPI'
    ? { ...sheet, cells: { ...sheet.cells, B16: 'Đồ uống gần đúng' } } : sheet);
  const mem = memoryReader([monthly]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! }, { listing: [media(1, '2026-10-06T09:00:00', MONTHLY_URL)] });
  const result = await createOfficialStatsSource({ model: fakeModel({ group: 'Đồ uống' }), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.values.every(row => row.label === 'CHỈ SỐ GIÁ TIÊU DÙNG'));
});

test('verification receives the selected group and its exact official labels', async () => {
  const model: OfficialStatsModelPort = { generateText: async request => {
    if (request.systemText.includes('You place a product')) return JSON.stringify({ categoryGroup: 'Đồ uống' });
    assert.match(request.userText, /"table":"CPI","label":"Đồ uống và thuốc lá"/u);
    return JSON.stringify({ covers: false, reasonVi: 'Chưa xác nhận nhóm hàng.' });
  } };
  const f = fake({});
  assert.equal((await createOfficialStatsSource({ model, transport: f.transport }).collect(INPUT)).status, 'CATEGORY_NOT_MAPPED');
  assert.equal(f.urls.length, 0);
});

test('redirects and HTTP failures stop without a retry or off-host request', async () => {
  for (const status of [301, 302, 307, 308, 429, 500]) {
    const f = fake({});
    let calls = 0;
    const transport: ProviderTransport = { ...f.transport, fetch: (async (url, init) => {
      calls++;
      assert.equal(new URL(String(url)).hostname, 'www.nso.gov.vn');
      assert.equal(init?.redirect, 'error');
      return new Response(null, { status, headers: { location: 'https://example.test/untrusted.xlsx' } });
    }) as typeof fetch };
    const result = await createOfficialStatsSource({ model: fakeModel(), transport }).collect(INPUT);
    assert.equal(result.status, 'LIST_FAILED');
    assert.equal(result.requests, 1);
    assert.equal(calls, 1);
  }
});

test('an oversized HTTP body is cancelled and rejected without a retry', async () => {
  const f = fake({});
  let cancelled = false, calls = 0;
  const transport: ProviderTransport = { ...f.transport, fetch: (async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } }));
  }) as typeof fetch };
  const result = await createOfficialStatsSource({ model: fakeModel(), transport }).collect(INPUT);
  assert.equal(result.status, 'LIST_FAILED');
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});

test('an unknown export header leaves the rest of the run: PARTIAL with the CPI rows', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 45, exportOverrides: { J7: 'Giá trị' } })]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! });
  const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.tables.map(t => [t.table, t.outcome]), [['CPI', 'READ'], ['EXPORT', 'LAYOUT_UNKNOWN']]);
  assert.equal(result.values.some(v => v.table === 'EXPORT'), false);
});

test('a workbook with no recognized title is LAYOUT_UNKNOWN, never an empty known layout', async () => {
  const mem = memoryReader([[{ name: 'Unknown', cells: { A1: 'Bảng giả lập khác', B10: { n: '456.78' } } }]]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! }, { listing: [media(1, '2026-10-06T09:00:00', MONTHLY_URL)] });
  const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
  assert.equal(result.status, 'LAYOUT_UNKNOWN');
  assert.deepEqual(result.values, []);
});

test('NONE or a failed check: CATEGORY_NOT_MAPPED, no request, no numbers', async () => {
  for (const model of [fakeModel({ group: 'NONE' }), fakeModel({ covers: false })]) {
    const f = fake({});
    const result = await createOfficialStatsSource({ model, transport: f.transport, readWorkbook: () => { throw new Error('never read'); } }).collect(INPUT);
    assert.equal(result.status, 'CATEGORY_NOT_MAPPED');
    assert.equal(f.urls.length, 0);
    assert.deepEqual([result.files, result.values, result.requests], [[], [], 0]);
    assert.deepEqual(officialStatsDocument(result, null, []).values, []);
  }
});

test('an invalid model answer is retried once, then rejected', async () => {
  let calls = 0;
  const model: OfficialStatsModelPort = { generateText: async () => { calls++; return 'not json'; } };
  const f = fake({});
  const result = await createOfficialStatsSource({ model, transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'CATEGORY_NOT_MAPPED');
  assert.equal(calls, 2);
  assert.equal(f.urls.length, 0);
});

test('an abort during the spacing wait gives CANCELLED and nothing more is requested', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 20 })]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! }, { abortOnSleep: 1 });
  const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT, { signal: f.controller.signal });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(f.urls.length, 1);
});

test('no model configured, or a listing with no Vietnamese monthly workbook: no download', async () => {
  const f = fake({});
  assert.equal((await createOfficialStatsSource({ transport: f.transport }).collect(INPUT)).status, 'MODEL_NOT_CONFIGURED');
  assert.equal(f.urls.length, 0);
  const g = fake({}, { listing: [LISTING[0], LISTING[5]] });
  assert.equal((await createOfficialStatsSource({ model: fakeModel(), transport: g.transport }).collect(INPUT)).status, 'NO_MONTHLY_WORKBOOK');
  assert.equal(g.urls.length, 1);
});

test('a reader that cannot start gives READER_UNAVAILABLE and no numbers', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 20 })]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! });
  const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: () => ({ kind: 'UNAVAILABLE' }) }).collect(INPUT);
  assert.equal(result.status, 'READER_UNAVAILABLE');
  assert.deepEqual(officialStatsDocument(result, 0, [1]).values, []);
});

// ---- stdlib reader (needs python3; skipped otherwise) ----

const python3 = spawnSync('python3', ['--version'], { windowsHide: true });
// Missing Python may skip on Windows; a present but failing reader must fail the test.
const noPython = (python3.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' ? 'python3 is not available' : false;

test('reader: synthetic workbooks read the same as the in-memory sheets', { skip: noPython }, () => {
  for (const book of [monthlyWorkbook({ sheets: 20 }), monthlyWorkbook({ sheets: 45 }), cpiWorkbook('don-vi-o-dong-7')]) {
    const read = defaultOfficialStatsWorkbookReader(xlsx(book));
    assert.equal(read.kind, 'OK');
    if (read.kind !== 'OK') return;
    const expected = toSheets(book);
    assert.deepEqual(read.sheets.map(sheet => [sheet.name, sheet.state]), expected.map(sheet => [sheet.name, sheet.state]));
    read.sheets.forEach((sheet, i) => assert.deepEqual(new Map([...sheet.cells].sort()), new Map([...expected[i]!.cells].sort()), sheet.name));
  }
  const books = { RETAIL: monthlyWorkbook({ sheets: 45 }), CPI_WORKBOOK: cpiWorkbook('binh-quan-quy-va-luy-ke') };
  for (const [table, book] of Object.entries(books) as [keyof typeof books, SheetSpec[]][]) {
    const read = defaultOfficialStatsWorkbookReader(xlsx(book));
    assert.equal(read.kind === 'OK' && readOfficialStatsTable(read.sheets, table, []).outcome, 'READ', table);
  }
});

test('reader: a damaged archive is rejected, never read', { skip: noPython }, () => {
  assert.equal(defaultOfficialStatsWorkbookReader(Buffer.from('PK\u0003\u0004 not a workbook')).kind, 'REJECTED');
  assert.equal(defaultOfficialStatsWorkbookReader(Buffer.alloc(0)).kind, 'REJECTED');
});

test('reader: ZIP expansion, aggregate size and entry-count limits reject synthetic bombs', { skip: noPython }, () => {
  const oversizedPart = zip([['xl/workbook.xml', Buffer.alloc(48 * 1024 * 1024 + 1, 32)]], true);
  const many = zip(Array.from({ length: 2001 }, (_, i) => [`entry${i}`, ''] as const));
  const aggregate = zip(Array.from({ length: 5 }, (_, i) => [`part${i}`, ''] as const));
  const directory = aggregate.readUInt32LE(aggregate.length - 22 + 16);
  let pos = directory;
  for (let i = 0; i < 5; i++) {
    aggregate.writeUInt32LE(40 * 1024 * 1024, pos + 24);
    pos += 46 + aggregate.readUInt16LE(pos + 28);
  }
  for (const bytes of [oversizedPart, many, aggregate]) {
    assert.deepEqual(defaultOfficialStatsWorkbookReader(bytes), { kind: 'REJECTED', code: 'ZIP_STRUCTURE_OR_SIZE' });
  }
  assert.deepEqual(defaultOfficialStatsWorkbookReader(Buffer.alloc(20 * 1024 * 1024 + 1)), { kind: 'REJECTED', code: 'WORKBOOK_SIZE_LIMIT' });
});

test('reader: XML entities and external resources are rejected; formulas use cached values only', { skip: noPython }, () => {
  for (const xml of [
    '<!DOCTYPE workbook [<!ENTITY x "expanded">]><workbook>&x;</workbook>',
    '<!DOCTYPE workbook SYSTEM "https://example.test/untrusted.dtd"><workbook/>',
    '<!DOCTYPE workbook [<!ENTITY x SYSTEM "https://example.test/untrusted.xml">]><workbook>&x;</workbook>',
  ]) assert.deepEqual(defaultOfficialStatsWorkbookReader(zip([['xl/workbook.xml', xml]])), { kind: 'REJECTED', code: 'UNSUPPORTED_XML' });
  const formula = `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1"><f>1+2</f></c><c r="B1"><f>1+2</f><v>789.125</v></c></row></sheetData></worksheet>`;
  const bytes = zip([
    ['xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${OFFICE_REL}"><sheets><sheet name="Synthetic" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OFFICE_REL}/worksheet" Target="worksheets/synthetic.xml"/></Relationships>`],
    ['xl/worksheets/synthetic.xml', formula],
  ]);
  const read = defaultOfficialStatsWorkbookReader(bytes);
  assert.equal(read.kind, 'OK');
  if (read.kind !== 'OK') return;
  assert.equal(read.sheets[0]!.cells.has('A1'), false);
  assert.equal(read.sheets[0]!.cells.get('B1')!.text, '789.125');
});

// ---- through the run and the Market report ----

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-08T00:00:00.000Z');
async function runToDraft(t: TestContext, officialStatsSource?: OfficialStatsSource) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-official-stats-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'official-stats', title: 'Synthetic official statistics run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(), ...(officialStatsSource ? { officialStatsSource } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic snack', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const step = db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { sha: string };
  const document = JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider, request_count FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(row => { const v = row as { ordinal: bigint | number; provider: string; request_count: bigint | number }; return [Number(v.ordinal), v.provider, Number(v.request_count)] as const; });
  const html = (await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  return { document, usage, html, doc: new JSDOM(html).window.document };
}

test('flag off: no step field, no usage row, no table 5.4', async t => {
  const off = await runToDraft(t);
  assert.equal('officialStats' in off.document, false);
  assert.equal(off.usage.some(([, provider]) => provider === 'official-stats'), false);
  for (const marker of ['Bảng 5.4', 'Cục Thống kê']) assert.equal(off.html.includes(marker), false, marker);
});

test('flag on: table 5.4 in M05 has no percent sign, no bare 0, no provider name and no "Google"', async t => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 20 })]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! });
  const on = await runToDraft(t, createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader }));
  assert.equal(on.document.officialStats?.status, 'OK');
  assert.ok(on.usage.some(([ordinal, provider, count]) => ordinal === 11 && provider === 'official-stats' && count === 2));
  const section = on.doc.querySelector('#M05')!;
  const table = [...section.querySelectorAll('.table-wrap')].find(node => /Bảng 5\.4/u.test(node.textContent!));
  assert.ok(table, 'the table sits in M05');
  const text = table!.textContent!;
  assert.ok(text.includes('chỉ số 105,55 (kỳ gốc = 100)'));
  assert.ok(text.includes('Cục Thống kê (nso.gov.vn)'));
  assert.ok(text.includes('Bieu-thang-9.2026.xlsx'));
  assert.ok(text.includes('Mọi ngành hàng; tham chiếu cả nước'));
  assert.match(on.doc.querySelector('#M13')!.textContent!, /Cục Thống kê \(nso.gov.vn\)/u);
  assert.equal(text.includes('%'), false);
  assert.doesNotMatch(text, /(?<![\p{L}\p{N}.,])0(?![\p{N}.,])/u, 'no bare 0');
  assert.doesNotMatch(text, /\b(?:tổng|total)\b/iu);
  assert.doesNotMatch(on.html, /Google/iu);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(on.html));
});

test('flag on, category not mapped: the report prints no number from this source', async t => {
  const f = fake({});
  const on = await runToDraft(t, createOfficialStatsSource({ model: fakeModel({ group: 'NONE' }), transport: f.transport }));
  assert.equal(on.document.officialStats?.status, 'CATEGORY_NOT_MAPPED');
  assert.deepEqual(on.document.officialStats?.values, []);
  assert.equal(on.html.includes('Bảng 5.4'), false);
  assert.match(on.doc.querySelector('#M05')!.textContent!, /chưa ánh xạ được vào nhóm hàng của Cục Thống kê/u);
});

test('reader report: table 5.4 retains periods, statuses, E12 attribution and the M13 source line', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 45 })]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]! });
  const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader }).collect(INPUT);
  const officialStats = officialStatsDocument(result, 0, [1]);
  const input = sync1ReaderFixture('1.4.0');
  input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows);
  input.unitPrices = units.packet;
  const data = computeReaderReportData(input, units.retained);
  const off = await buildMarketReport(data, sync1Options);
  const on = await buildMarketReport(data, { ...sync1Options, officialStats });
  const doc = new JSDOM(on.html).window.document;
  const table = [...doc.querySelectorAll('table')].find(node => node.textContent!.includes('Mọi ngành hàng; tham chiếu cả nước'));
  assert.ok(table);
  assert.match(table.textContent!, /Tháng 9 năm 2026/u);
  assert.match(table.textContent!, /sơ bộ; tệp đã được nguồn cập nhật lại/u);
  assert.match(table.textContent!, /chỉ số 105,55 \(kỳ gốc = 100\)/u);
  assert.doesNotMatch(table.textContent!, /%/u);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.doesNotMatch(on.html, /Google/u);
  assert.match(doc.querySelector('#phu-luc')!.textContent!, /Cục Thống kê \(nso.gov.vn\)/u);
  assert.match(doc.querySelector('#phu-luc .citation-register')!.textContent!, /công bố 06\/10\/2026/u, 'reader dates are dd/mm/yyyy');
  assert.doesNotMatch(doc.body.textContent!, /công bố 2026-10-06/u);
  const failedRules = (html: string) => auditMarket14(html).filter(check => check.kind === 'machine' && !check.ok).map(check => check.rule);
  assert.deepEqual(failedRules(on.html), failedRules(off.html), 'the new table adds no machine-rule failure');
  const failedLint = (html: string) => lint(html).filter(check => !check.ok).map(check => check.rule);
  assert.deepEqual(failedLint(on.html), failedLint(off.html));
  assert.equal(validOfficialStats({ ...officialStats, files: officialStats.files.map(file => Object.fromEntries(Object.entries(file).reverse())) }), true, 'file key order does not affect validation');
  const unsafe = { ...officialStats, files: officialStats.files.map(file => ({ ...file, url: file.url.replace('.xlsx', '-Google.xlsx') })),
    values: officialStats.values.map(row => ({ ...row, sheet: 'Google OpenCLI rẻ nhất 50%' })) };
  const hidden = await buildMarketReport(data, { ...sync1Options, officialStats: unsafe });
  assert.doesNotMatch(hidden.html, /Google|OpenCLI|rẻ nhất/u);
  const register = new JSDOM(hidden.html).window.document.querySelector('.citation-register')!.textContent!;
  assert.doesNotMatch(register, /%/u);
  assert.match(register, /Cục Thống kê, số liệu CPI tháng 9\/2026, công bố 06\/10\/2026/u, 'the short CPI citation names no stored file or sheet');
  assert.equal(unsafe.values[0]!.sheet, 'Google OpenCLI rẻ nhất 50%', 'source metadata stays intact');
});

// ---- S22: consumer price index by province, from the same CPI workbook ----

const PROVINCE_LABELS = ['II. Đồ uống và thuốc lá', 'CHỈ SỐ GIÁ TIÊU DÙNG'];
/** The run that downloads the CPI workbook: no CPI table in the monthly workbook, group "Đồ uống". */
async function provinceRun(options: { readonly provinces?: boolean; readonly sheet?: SheetSpec | null } = {}) {
  const cpiBook = options.sheet === null ? cpiWorkbook('binh-quan-luy-ke') : withProvinces(cpiWorkbook('binh-quan-luy-ke'), options.sheet);
  const mem = memoryReader([monthlyWorkbook({ sheets: 20, cpi: false }), cpiBook]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]!, [CPI_URL]: mem.bytes[1]! });
  const source = createOfficialStatsSource({ model: fakeModel({ group: 'Đồ uống' }), transport: f.transport, readWorkbook: mem.reader, ...(options.provinces ? { provinces: true } : {}) });
  return { result: await source.collect(INPUT), f, mem };
}
const withoutProvinces = <T extends object>(value: T): Omit<T, 'provinces'> => { const { provinces: _drop, ...rest } = value as T & { provinces?: unknown }; return rest; };

test('S22 flag: on only when both the province flag and the S21 flag are exactly "1"', () => {
  assert.equal(officialStatsProvinceEnabled({ TDN_RESEARCH_OFFICIAL_STATS_ENABLED: '1', TDN_RESEARCH_OFFICIAL_STATS_PROVINCE_ENABLED: '1' }), true);
  for (const [s21, s22] of [['1', undefined], ['1', '0'], ['1', 'true'], ['1', ' 1'], [undefined, '1'], ['0', '1'], ['', '1']] as const)
    assert.equal(officialStatsProvinceEnabled({ TDN_RESEARCH_OFFICIAL_STATS_ENABLED: s21, TDN_RESEARCH_OFFICIAL_STATS_PROVINCE_ENABLED: s22 }), false, `${s21}/${s22}`);
  assert.deepEqual(SOURCE_REGISTRY.OFFICIAL_STATS.registryIds, ['S21', 'S22']);
});

test('S22 province sheet: pinned header, provinces in sheet order, group and reference rows, stored values unchanged', () => {
  const read = readOfficialStatsProvinces(toSheets(withProvinces(cpiWorkbook('binh-quan-luy-ke'))), PROVINCE_LABELS);
  assert.deepEqual([read.outcome, read.sheet, read.variant, read.headerHash], ['READ', 'Địa phương', 'thang-truoc', OFFICIAL_STATS_PROVINCE_VARIANTS['thang-truoc']]);
  assert.deepEqual([read.period, read.base], ['Tháng 9 năm 2026', 'tháng trước']);
  assert.deepEqual(read.provinces, ['Tỉnh A', 'Tỉnh B', 'Thành phố C']);
  assert.deepEqual(read.values.map(v => [v.label, v.province, v.cell, v.value, v.shown]), [
    ['II. Đồ uống và thuốc lá', 'Tỉnh A', 'B11', '102.375', '102.38'],
    ['II. Đồ uống và thuốc lá', 'Tỉnh B', 'C11', '99.125', '99.13'],
    ['II. Đồ uống và thuốc lá', 'Thành phố C', 'D11', null, null],
    ['CHỈ SỐ GIÁ TIÊU DÙNG', 'Tỉnh A', 'B9', '100.123', '100.12'],
    ['CHỈ SỐ GIÁ TIÊU DÙNG', 'Tỉnh B', 'C9', '99.876543210987654', '99.88'],
    ['CHỈ SỐ GIÁ TIÊU DÙNG', 'Thành phố C', 'D9', '100.5', '100.50'],
  ]);
  // Other rows of the sheet (gold) are never taken; a label printed twice gives no value.
  assert.equal(read.values.some(v => v.label === 'Vàng'), false);
  const twice = readOfficialStatsProvinces(toSheets(withProvinces(cpiWorkbook('binh-quan-luy-ke'), provinceSheet({ A12: 'II. Đồ uống và thuốc lá' }))), PROVINCE_LABELS);
  assert.deepEqual(twice.values.map(v => v.label), ['CHỈ SỐ GIÁ TIÊU DÙNG', 'CHỈ SỐ GIÁ TIÊU DÙNG', 'CHỈ SỐ GIÁ TIÊU DÙNG']);
  assert.equal(readOfficialStatsProvinces(toSheets(cpiWorkbook('binh-quan-luy-ke')), PROVINCE_LABELS).outcome, 'NOT_FOUND');
  for (const rows of [30, 84] as const) {
    const variant = toSheets(withProvinces(cpiWorkbook('binh-quan-luy-ke'), provinceSheet({}, rows)));
    assert.deepEqual(readOfficialStatsProvinces(variant, PROVINCE_LABELS), read, `${rows}-row edition uses the same pinned profile`);
  }
  const reordered = readOfficialStatsProvinces(toSheets([provinceSheet({ B8: 'Thành phố C', D8: 'Tỉnh A' })]), PROVINCE_LABELS);
  assert.deepEqual(reordered.provinces, ['Thành phố C', 'Tỉnh B', 'Tỉnh A']);
  assert.deepEqual(reordered.values.slice(0, 3).map(cell => [cell.province, cell.cell, cell.value]), [
    ['Thành phố C', 'B11', '102.375'], ['Tỉnh B', 'C11', '99.125'], ['Tỉnh A', 'D11', null],
  ], 'province membership follows each header column; a blank does not inherit another row or column');
});

test('S22 unknown province header: LAYOUT_UNKNOWN for the province table only; table 5.4 is unaffected', () => {
  for (const overrides of [{ J7: 'Đơn vị tính: chỉ số' }, { A5: '(Kỳ gốc năm 2019 = 100)' }, { A4: 'Quý III năm 2026' }, { E8: { n: '2026' } }, { C8: 'Tỉnh A' }, { A8: 'Địa phương' }] as const) {
    const sheets = toSheets(withProvinces(cpiWorkbook('binh-quan-luy-ke'), provinceSheet(overrides)));
    const read = readOfficialStatsProvinces(sheets, PROVINCE_LABELS);
    assert.equal(read.outcome, 'LAYOUT_UNKNOWN', JSON.stringify(overrides));
    assert.deepEqual([read.provinces, read.values], [[], []]);
    assert.equal(readOfficialStatsTable(sheets, 'CPI_WORKBOOK', ['II. Đồ uống và thuốc lá']).outcome, 'READ', 'the national table still reads');
  }
});

test('S22 lane: the province rows come from the CPI workbook already downloaded; no extra request; old documents validate', async () => {
  const off = await provinceRun();
  const on = await provinceRun({ provinces: true });
  assert.deepEqual([on.result.requests, off.result.requests], [3, 3], 'no extra request');
  assert.deepEqual(on.f.urls.map(url => url.href.split('?')[0]), off.f.urls.map(url => url.href.split('?')[0]));
  assert.equal(on.result.provinces?.outcome, 'READ');
  assert.equal(on.result.provinces?.file, 1);
  assert.equal('provinces' in off.result, false);
  const docOn = officialStatsDocument(on.result, 0, [1, 2]);
  const docOff = officialStatsDocument(off.result, 0, [1, 2]);
  assert.equal(docOn.provinces?.captureIndex, 2, 'same stored CPI workbook as table 5.4');
  assert.deepEqual(docOn.provinces?.provinces, ['Tỉnh A', 'Tỉnh B', 'Thành phố C']);
  assert.equal(docOn.provinces?.values.find(v => v.cell === 'C9')?.value, '99.876543210987654', 'stored exactly as read');
  assert.equal('provinces' in docOff, false);
  assert.equal(JSON.stringify(withoutProvinces(docOn)), JSON.stringify(docOff), 'everything else is byte-identical');
  assert.equal(validOfficialStats(docOn), true);
  assert.equal(validOfficialStats(docOff), true, 'an old document without the field validates');
  const p = docOn.provinces!;
  for (const bad of [
    { ...p, provinces: [...p.provinces, 'Tỉnh A'] },
    { ...p, captureIndex: 1 },
    { ...p, outcome: 'LAYOUT_UNKNOWN' },
    { ...p, values: p.values.map((v, i) => i === 0 ? { ...v, province: 'Tỉnh Z' } : v) },
    { ...p, values: p.values.map((v, i) => i === 0 ? { ...v, shown: null } : v) },
    { ...p, extra: 1 },
  ]) assert.equal(validOfficialStats({ ...docOn, provinces: bad }), false, JSON.stringify(bad).slice(0, 80));
  // Unknown province header: the national table and status are unchanged.
  const unknown = await provinceRun({ provinces: true, sheet: provinceSheet({ J7: 'Đơn vị tính: chỉ số' }) });
  const docUnknown = officialStatsDocument(unknown.result, 0, [1, 2]);
  assert.equal(docUnknown.status, 'OK');
  assert.deepEqual([docUnknown.provinces?.outcome, docUnknown.provinces?.values], ['LAYOUT_UNKNOWN', []]);
  assert.equal(validOfficialStats(docUnknown), true);
  assert.deepEqual(officialStatsProvinceRows(docUnknown), []);
});

test('S22 owner decision 17/10: flag on fetches the CPI workbook even when the monthly rows cover the group; ≤3 requests; table 5.4 and status unchanged', async () => {
  const mem = memoryReader([monthlyWorkbook({ sheets: 20 }), withProvinces(cpiWorkbook('binh-quan-luy-ke'))]);
  const run = async (provinces: boolean, files: Readonly<Record<string, Buffer>> = { [MONTHLY_URL]: mem.bytes[0]!, [CPI_URL]: mem.bytes[1]! }) => {
    const f = fake(files);
    const result = await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader, ...(provinces ? { provinces: true } : {}) }).collect(INPUT);
    return { f, result };
  };
  const paths = (f: ReturnType<typeof fake>) => f.urls.map(url => url.href.split('?')[0]);
  const off = await run(false);
  const on = await run(true);
  // Flag off: exactly as main — listing and monthly workbook only, no CPI download, no province field.
  assert.equal(off.result.requests, 2);
  assert.deepEqual(paths(off.f), ['https://www.nso.gov.vn/wp-json/wp/v2/media', MONTHLY_URL]);
  assert.equal('provinces' in off.result, false);
  // Flag on: one more GET for the CPI workbook, within the call cap, spaced, no retry.
  assert.equal(on.result.requests, 3);
  assert.ok(on.result.requests <= OFFICIAL_STATS_MAX_CALLS && on.f.urls.length <= OFFICIAL_STATS_MAX_CALLS);
  assert.deepEqual(paths(on.f), ['https://www.nso.gov.vn/wp-json/wp/v2/media', MONTHLY_URL, CPI_URL]);
  for (let i = 1; i < on.f.at.length; i++) assert.ok(on.f.at[i]! - on.f.at[i - 1]! >= 2_000, `gap ${i}`);
  // Table 5.4 keeps the monthly rows: same status, tables and values; the CPI workbook is kept only for the province sheet.
  assert.deepEqual([on.result.status, on.result.tables, on.result.values], [off.result.status, off.result.tables, off.result.values]);
  assert.deepEqual(on.result.files.map(file => file.role), ['MONTHLY', 'CPI']);
  assert.deepEqual([on.result.provinces?.outcome, on.result.provinces?.file], ['READ', 1]);
  const docOn = officialStatsDocument(on.result, 0, [1, 2]), docOff = officialStatsDocument(off.result, 0, [1]);
  assert.equal(validOfficialStats(docOn), true);
  assert.deepEqual([docOn.status, docOn.tables, docOn.values], [docOff.status, docOff.tables, docOff.values]);
  assert.deepEqual(officialStatsRenderableRows(docOn), officialStatsRenderableRows(docOff), 'table 5.4 rows are identical');
  assert.ok(officialStatsRenderableRows(docOn).every(row => row.captureIndex === 1), 'table 5.4 still cites the monthly workbook only');
  assert.equal(docOn.provinces?.captureIndex, 2);
  assert.ok(officialStatsProvinceRows(docOn).length > 0, 'table 5.5 is drawn');
  // A failed CPI download changes nothing for S21 and is never retried.
  const failed = await run(true, { [MONTHLY_URL]: mem.bytes[0]! });
  assert.equal(failed.result.requests, 3);
  assert.deepEqual(paths(failed.f), ['https://www.nso.gov.vn/wp-json/wp/v2/media', MONTHLY_URL, CPI_URL]);
  assert.deepEqual([failed.result.status, failed.result.files, failed.result.tables, failed.result.values], [off.result.status, off.result.files, off.result.tables, off.result.values]);
  assert.equal('provinces' in failed.result, false);
  // When S21 already needs the CPI workbook, the province sheet reuses that download: still 3 calls, never a fourth.
  const fallback = await provinceRun({ provinces: true });
  assert.equal(fallback.result.requests, 3);
  assert.equal(fallback.f.urls.length, 3);
});

test('S22 NONE or an unverified group: nothing is downloaded and nothing is stored for provinces', async () => {
  for (const model of [fakeModel({ group: 'NONE' }), fakeModel({ covers: false })]) {
    const f = fake({});
    const result = await createOfficialStatsSource({ model, transport: f.transport, provinces: true }).collect(INPUT);
    assert.equal(result.status, 'CATEGORY_NOT_MAPPED');
    assert.equal('provinces' in officialStatsDocument(result, null, []), false);
  }
});

test('S22 reader report: table 5.5 follows 5.4 with title, source, note, period, base and status; flag off is byte-identical', async () => {
  const on = officialStatsDocument((await provinceRun({ provinces: true })).result, 0, [1, 2]);
  const off = officialStatsDocument((await provinceRun()).result, 0, [1, 2]);
  const input = sync1ReaderFixture('1.4.0');
  input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows);
  input.unitPrices = units.packet;
  const data = computeReaderReportData(input, units.retained);
  const options = { ...sync1Options, flint: true };
  const offHtml = (await buildMarketReport(data, { ...options, officialStats: off })).html;
  assert.equal((await buildMarketReport(data, { ...options, officialStats: withoutProvinces(on) })).html, offHtml, 'no province field: same bytes');
  const unknownDoc = officialStatsDocument((await provinceRun({ provinces: true, sheet: provinceSheet({ J7: 'Đơn vị tính: chỉ số' }) })).result, 0, [1, 2]);
  assert.equal((await buildMarketReport(data, { ...sync1Options, officialStats: unknownDoc })).html.includes(OFFICIAL_STATS_PROVINCE_TITLE), false, 'LAYOUT_UNKNOWN draws no province table');
  const html = (await buildMarketReport(data, { ...options, officialStats: on })).html;
  const doc = new JSDOM(html).window.document;
  const m05 = [...doc.querySelectorAll('section')].find(node => node.querySelector('h2')?.textContent === 'Nhu cầu (tín hiệu bán)')!.textContent!;
  assert.ok(m05.indexOf(OFFICIAL_STATS_PROVINCE_TITLE) > m05.indexOf('Bối cảnh cả nước theo nhóm hàng') && m05.indexOf('Bối cảnh cả nước theo nhóm hàng') >= 0, 'table 5.5 follows table 5.4');
  const table = [...doc.querySelectorAll('table')].find(node => node.textContent!.includes('Tỉnh A'))!;
  assert.ok(table);
  assert.deepEqual([...table.querySelectorAll('th')].map(th => th.textContent!.trim()), ['Dòng', 'Tỉnh A', 'Tỉnh B', 'Thành phố C']);
  assert.match(table.textContent!, /II\. Đồ uống và thuốc lá/u);
  assert.match(table.textContent!, /II\. Đồ uống và thuốc lá \(kỳ gốc: tháng trước = 100\)/u, 'each row names its base');
  assert.match(table.textContent!, /Chỉ số giá tiêu dùng \(Mọi ngành hàng; dòng tham chiếu\) \(kỳ gốc: tháng trước = 100\)/u);
  assert.match(table.textContent!, /102,38/u);
  assert.match(table.textContent!, /không có số/u);
  assert.doesNotMatch(table.textContent!, /%/u);
  for (const text of [OFFICIAL_STATS_PROVINCE_TITLE, OFFICIAL_STATS_PROVINCE_NOTE, 'Kỳ: Tháng 9 năm 2026.'])
    assert.ok(m05.includes(text), text);
  assert.doesNotMatch(m05, /(?<![\p{L}\p{N}.,])0(?![\p{N}.,])/u, 'no bare 0');
  assert.deepEqual(providerNameViolations(html), []);
  assert.doesNotMatch(html, /Google/u);
  assert.match(doc.querySelector('#phu-luc')!.textContent!, /chỉ số giá theo tỉnh, thành phố/u);
  const failedRules = (value: string) => auditMarket14(value).filter(check => check.kind === 'machine' && !check.ok).map(check => check.rule);
  assert.deepEqual(failedRules(html), failedRules(offHtml), 'the province table adds no machine-rule failure (requireFlint)');
  const rule11 = auditMarket14(html, undefined, { requireFlint: true }).find(check => check.rule === '11')!;
  assert.equal(rule11.ok, true, rule11.detail);
  const numbering = lint(html).find(check => check.rule.startsWith('F7 '))!;
  assert.equal(numbering.ok, true, numbering.detail);
  const failedLint = (value: string) => lint(value).filter(check => !check.ok).map(check => check.rule);
  assert.deepEqual(failedLint(html), failedLint(offHtml));
});

test('S22 source evidence: cited only when table 5.5 is drawn, bound to the same CPI workbook capture as S21', async () => {
  const on = officialStatsDocument((await provinceRun({ provinces: true })).result, 0, [1, 2]);
  const capture = (ordinal: number, sha: string): CaptureRecord => ({ stepId: 'COLLECTION', ordinal, artifactSha256: sha, mediaType: XLSX_MIME,
    provider: 'official-stats', operation: 'officialstats.download', retrievedAt: '2026-10-08T00:00:00.000Z', window: null, truncated: false });
  const captures = [capture(1, 'a'.repeat(64)), capture(2, 'b'.repeat(64))];
  const empty = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = (officialStats: unknown) => ({ collection: { officialStats }, captures }) as unknown as Parameters<typeof sourceEvidenceForReport>[1];
  const market = sourceEvidenceForReport(empty, input(on), 'MARKET');
  assert.deepEqual(market.sourceAppendix.rows.map(row => [row.registryId, row.binding.kind, row.binding.ref]), [['S21', 'capture', 'b'.repeat(64)], ['S22', 'capture', 'b'.repeat(64)]]);
  assert.deepEqual(sourceEvidenceForReport(market, input(on), 'MARKET'), market, 'idempotent');
  assert.deepEqual(sourceEvidenceForReport(empty, input(withoutProvinces(on)), 'MARKET').sourceAppendix.rows.map(row => row.registryId), ['S21']);
  const mem = memoryReader([monthlyWorkbook({ sheets: 20 }), withProvinces(cpiWorkbook('binh-quan-luy-ke'))]);
  const f = fake({ [MONTHLY_URL]: mem.bytes[0]!, [CPI_URL]: mem.bytes[1]! });
  const monthly = officialStatsDocument(await createOfficialStatsSource({ model: fakeModel(), transport: f.transport, readWorkbook: mem.reader, provinces: true }).collect(INPUT), 0, [1, 2]);
  assert.deepEqual(sourceEvidenceForReport(empty, input(monthly), 'MARKET').sourceAppendix.rows.map(row => [row.registryId, row.binding.ref]),
    [['S21', 'a'.repeat(64)], ['S22', 'b'.repeat(64)]], 'the extra CPI download binds S22 without changing S21 monthly lineage');
  assert.deepEqual(sourceEvidenceForReport(empty, input(on), 'INSIGHT'), empty);
  assert.throws(() => sourceEvidenceForReport(empty, { collection: { officialStats: on }, captures: [captures[0]!, { ...capture(2, 'c'.repeat(64)), operation: 'officialstats.list' }] } as unknown as Parameters<typeof sourceEvidenceForReport>[1], 'MARKET'),
    /Official statistics/u);
});

test('S22 run: flag off stores nothing; flag on draws table 5.5 in M05 after 5.4 and passes the market gate', async t => {
  const build = (provinces: boolean) => {
    const mem = memoryReader([monthlyWorkbook({ sheets: 20, cpi: false }), withProvinces(cpiWorkbook('binh-quan-luy-ke'))]);
    const f = fake({ [MONTHLY_URL]: mem.bytes[0]!, [CPI_URL]: mem.bytes[1]! });
    return createOfficialStatsSource({ model: fakeModel({ group: 'Đồ uống' }), transport: f.transport, readWorkbook: mem.reader, ...(provinces ? { provinces: true } : {}) });
  };
  const off = await runToDraft(t, build(false));
  assert.equal(off.document.officialStats?.status, 'OK');
  assert.equal('provinces' in off.document.officialStats!, false);
  assert.equal(off.html.includes('Bảng 5.5'), false);
  const on = await runToDraft(t, build(true));
  assert.equal(on.document.officialStats?.provinces?.outcome, 'READ');
  assert.deepEqual(on.usage.filter(([, provider]) => provider === 'official-stats'), off.usage.filter(([, provider]) => provider === 'official-stats'), 'same usage row, no new ordinal');
  const m05 = on.doc.querySelector('#M05')!;
  const tables = [...m05.querySelectorAll('.table-wrap')].map(node => node.textContent!);
  const i54 = tables.findIndex(text => /Bảng 5\.4/u.test(text)), i55 = tables.findIndex(text => /Bảng 5\.5/u.test(text));
  assert.ok(i54 >= 0 && i55 === i54 + 1, 'table 5.5 directly follows 5.4');
  const text = tables[i55]!;
  for (const part of [OFFICIAL_STATS_PROVINCE_TITLE, OFFICIAL_STATS_PROVINCE_NOTE, 'Cục Thống kê (nso.gov.vn)', 'So-lieu-CPI-T9.2026.xlsx', 'Tỉnh A', 'Thành phố C', '102,38', 'không có số'])
    assert.ok(text.includes(part), part);
  assert.match(m05.textContent!, /Kỳ: Tháng 9 năm 2026\. Kỳ gốc: tháng trước = 100\. Trạng thái: bảng không ghi\./u);
  assert.equal(text.includes('%'), false);
  assert.doesNotMatch(text, /(?<![\p{L}\p{N}.,])0(?![\p{N}.,])/u, 'no bare 0');
  assert.match(on.doc.querySelector('#M13')!.textContent!, /chỉ số giá theo tỉnh, thành phố/u);
  assert.doesNotMatch(on.html, /Google/iu);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(on.html));
  const numbering = lint(on.html).find(check => check.rule.startsWith('F7 '))!;
  assert.equal(numbering.ok, true, numbering.detail);
});

test('reader: the province sheet reads the same as the in-memory sheet', { skip: noPython }, () => {
  for (const rows of [30, 84] as const) {
    const book = withProvinces(cpiWorkbook('binh-quan-luy-ke'), provinceSheet({}, rows));
    const read = defaultOfficialStatsWorkbookReader(xlsx(book));
    assert.equal(read.kind, 'OK', `${rows}-row edition`);
    if (read.kind !== 'OK') return;
    assert.deepEqual(readOfficialStatsProvinces(read.sheets, PROVINCE_LABELS), readOfficialStatsProvinces(toSheets(book), PROVINCE_LABELS));
  }
});

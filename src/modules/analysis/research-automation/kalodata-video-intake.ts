import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import intakeSchema from '../../../../contracts/analysis/kalodata-video-intake-v1.schema.json' with { type: 'json' };
import type {
  KalodataCreatorRow,
  KalodataVideoPreparedList,
  KalodataVideoPrepareReceipt,
  KalodataVideoPrepareRequest,
  KalodataVideoRow,
  KalodataVideoTable,
  TableSelector,
} from '../../../../contracts/analysis/kalodata-video-intake-v1.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import type {
  AutomationSourcePackageLookup,
  FinalizedSourcePackageReader,
  SourceAttachmentOriginReader,
} from '../../foundation/source-package-reader.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(intakeSchema);
const validateRequest = ajv.compile<KalodataVideoPrepareRequest>({ $ref: `${intakeSchema.$id}#/$defs/request` });
const validateContext = ajv.compile<VideoSourceContext>({ $ref: `${intakeSchema.$id}#/$defs/context` });
const validateTable = ajv.compile<KalodataVideoTable>({ $ref: `${intakeSchema.$id}#/$defs/table` });

type Request = KalodataVideoPrepareRequest;
type Receipt = KalodataVideoPrepareReceipt;
type FileMetadata = SourcePackageIntakeRequest['files'][number];
type SourceReader = AutomationSourcePackageLookup & FinalizedSourcePackageReader & SourceAttachmentOriginReader;

/** Exact operator-export headers. Unknown, missing or reordered headers are rejected with a typed error. */
export const VIDEO_TABLE_HEADERS = ['video', 'creator', 'revenue', 'views', 'units', 'ad_spend', 'publish_date', 'product_link'] as const;
export const CREATOR_TABLE_HEADERS = ['creator', 'followers', 'revenue', 'video_count'] as const;
/** A missing export value renders with this text and never as zero. There is no transcription code path in this package. */
export const MISSING_VIDEO_VALUE_DISPLAY = 'không có dữ liệu';
/** One operator export per request; mirrors the per-file bound of the sibling intake. */
export const MAX_VIDEO_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_TABLE_ROWS = 5000;
export const MAX_VIDEO_CELL_CHARS = 10000;
export const VIDEO_READ_BUDGET = { maxFileBytes: MAX_VIDEO_UPLOAD_BYTES, maxTotalBytes: MAX_VIDEO_UPLOAD_BYTES + 64 * 1024 } as const;
/** Server-owned member path. The whole directory is reserved so no uploaded file can impersonate it. */
export const VIDEO_CONTEXT_PATH = 'video/context.json';
export const VIDEO_TABLE_PATH = 'video/table.json';
export const VIDEO_DESCRIPTOR_PATH = 'normalized/automation-video-source.json';
const UPLOAD_DECLARATION = 'Operator declarations, not authenticated provider metadata. Preparation is not revision admission.';
const PROVENANCE_BASIS = 'Operator-supplied exact video/creator export. Declared labels and acquisition time are unverified; not provider collection, transcription, review approval or an independent evidence family.';
const CONTEXT_PROVENANCE_BASIS = 'Server-created record of the operator request bound to this run. Its declarations remain unverified; not provider collection, transcription, review approval or an independent evidence family.';
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
/** Formats a missing value for owner-facing reads. Missing stays missing; it is never zero. */
export function formatMissingVideoValue(value: string | null): string {
  return value ?? MISSING_VIDEO_VALUE_DISPLAY;
}

/** Typed intake failure. The message carries only the code so no source identity leaks into owner-facing text. */
export class KalodataVideoRejection extends Error {
  constructor(readonly code: string) {
    super(`Video intake rejected: ${code}`);
  }
}
function reject(code: string): never {
  throw new KalodataVideoRejection(code);
}

/** Failure while reloading a stored preparation. The read fails closed as a whole. */
export class PreparedVideoSourceError extends Error {
  constructor(readonly code: string) {
    super(`Prepared video source failed verification: ${code}`);
  }
}
function fail(code: string): never {
  throw new PreparedVideoSourceError(code);
}

export interface VideoRunBinding {
  readonly runId: string;
  readonly workspaceId: string;
}
/** Persisted server-created member Darren closed form. */
export interface VideoSourceContext {
  contractVersion: 'automation-video-upload-context-v1';
  declaration: typeof UPLOAD_DECLARATION;
  workspaceId: string;
  runId: string;
  runBindingSha256: string;
  request: Request;
}

// ---------------------------------------------------------------------------
// Exact decimal helpers. Source numerics keep their lexical form; derived
// values use scaled BigInt math so there is no binary floating point and no
// division by zero.
// ---------------------------------------------------------------------------

const INTEGER_PATTERN = /^(0|[1-9][0-9]{0,39})$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]{0,39})(\.[0-9]{1,10})?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Splits a validated decimal lexical into a scaled BigInt of value * 10^scale. */
function toScaled(text: string, scale: number): bigint {
  const parts = text.split('.');
  const whole = parts[0] ?? '0';
  const fraction = (parts[1] ?? '').padEnd(scale, '0').slice(0, scale);
  return BigInt(whole + fraction);
}

/** Renders numerator/denominator rounded half-up to fracDigits places, trimming trailing zeros. */
function divideToString(numerator: bigint, denominator: bigint, fracDigits: number): string {
  const scaled = numerator * 10n ** BigInt(fracDigits);
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  const text = rounded.toString().padStart(fracDigits + 1, '0');
  const whole = text.slice(0, text.length - fracDigits);
  const fraction = text.slice(text.length - fracDigits).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/**
 * Units per 1,000 views, rounded to two places. Null when either side is
 * missing or views is zero; a missing value is never zero.
 */
export function deriveUnitsPer1000Views(units: string | null, views: string | null): string | null {
  if (units === null || views === null || !INTEGER_PATTERN.test(units) || !INTEGER_PATTERN.test(views)) return null;
  if (views === '0') return null;
  return divideToString(BigInt(units) * 1000n, BigInt(views), 2);
}

/** Ad spend share of revenue, rounded to four places. Null when either side is missing or revenue is zero. */
export function deriveAdShare(adSpend: string | null, revenue: string | null): string | null {
  if (adSpend === null || revenue === null || !DECIMAL_PATTERN.test(adSpend) || !DECIMAL_PATTERN.test(revenue)) return null;
  const numerator = toScaled(adSpend, 10);
  const denominator = toScaled(revenue, 10);
  if (denominator === 0n) return null;
  return divideToString(numerator, denominator, 4);
}

// ---------------------------------------------------------------------------
// CSV reading. Bounded, dependency-free, strict UTF-8.
// ---------------------------------------------------------------------------

type TextGrid = string[][];

/** Parses one bounded CSV export. Quotes, CRLF and a BOM are admitted; nothing else is repaired. */
export function parseVideoCsv(bytes: Buffer): TextGrid {
  if (bytes.length > MAX_VIDEO_UPLOAD_BYTES) reject('FILE_SIZE_LIMIT');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    reject('INVALID_CSV_UTF8');
  }
  if (text.startsWith('﻿')) text = text.slice(1);
  const grid: TextGrid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  let index = 0;
  const pushCell = (): void => {
    row.push(cell);
    cell = '';
    closedQuote = false;
  };
  while (index < text.length) {
    const char = text[index] ?? '';
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        closedQuote = true;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (closedQuote && char !== ',' && char !== '\r' && char !== '\n') reject('MALFORMED_CSV_QUOTE');
    if (char === '"') {
      if (cell !== '') reject('MALFORMED_CSV_QUOTE');
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      pushCell();
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      pushCell();
      grid.push(row);
      row = [];
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += char;
    index += 1;
  }
  if (quoted) reject('MALFORMED_CSV_QUOTE');
  // A terminal separator starts no further record. Interior blank records
  // remain in the grid so later row locators use the original CSV positions.
  if (cell !== '' || row.length > 0 || !/[\r\n]$/.test(text)) {
    pushCell();
    grid.push(row);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// XLSX reading. Minimal bounded reader for the flat two-sheet profile:
// shared strings, inline strings and lexical numbers only. No formulas,
// no active or external content, no third-party modules.
// ---------------------------------------------------------------------------

function readUInt16LE(bytes: Buffer, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readUInt32LE(bytes: Buffer, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

/** Unpacks the bounded flat-profile members of an XLSX archive. */
function unzipVideoWorkbook(bytes: Buffer): Map<string, Buffer> {
  if (bytes.length < 22 || bytes.length > MAX_VIDEO_UPLOAD_BYTES) reject('FILE_SIZE_LIMIT');
  let directoryOffset = -1;
  let directoryCount = 0;
  const tailStart = Math.max(0, bytes.length - 65557);
  for (let cursor = bytes.length - 22; cursor >= tailStart; cursor -= 1) {
    if (readUInt32LE(bytes, cursor) !== 0x06054b50) continue;
    const commentLength = readUInt16LE(bytes, cursor + 20);
    if (cursor + 22 + commentLength !== bytes.length) continue;
    directoryCount = readUInt16LE(bytes, cursor + 10);
    directoryOffset = readUInt32LE(bytes, cursor + 16);
    break;
  }
  if (directoryOffset < 0 || directoryCount < 1 || directoryCount > 100) reject('WORKBOOK_ARCHIVE_INVALID');
  const members = new Map<string, Buffer>();
  let cursor = directoryOffset;
  let totalUncompressed = 0;
  const seen = new Set<string>();
  for (let entry = 0; entry < directoryCount; entry += 1) {
    if (readUInt32LE(bytes, cursor) !== 0x02014b50) reject('WORKBOOK_ARCHIVE_INVALID');
    const flags = readUInt16LE(bytes, cursor + 8);
    const method = readUInt16LE(bytes, cursor + 10);
    const compressedSize = readUInt32LE(bytes, cursor + 20);
    const nameLength = readUInt16LE(bytes, cursor + 28);
    const extraLength = readUInt16LE(bytes, cursor + 30);
    const commentLength = readUInt16LE(bytes, cursor + 32);
    const localOffset = readUInt32LE(bytes, cursor + 42);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (flags !== 0 || (method !== 0 && method !== 8)) reject('WORKBOOK_ARCHIVE_INVALID');
    if (name === '' || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || seen.has(name)) {
      reject('WORKBOOK_ARCHIVE_INVALID');
    }
    seen.add(name);
    if (readUInt32LE(bytes, localOffset) !== 0x04034b50) reject('WORKBOOK_ARCHIVE_INVALID');
    const localNameLength = readUInt16LE(bytes, localOffset + 26);
    const localExtraLength = readUInt16LE(bytes, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    if (compressed.length !== compressedSize) reject('WORKBOOK_ARCHIVE_INVALID');
    const outputLimit = Math.min(32 * 1024 * 1024, 64 * 1024 * 1024 - totalUncompressed);
    if (method === 0 && compressed.length > outputLimit) reject('WORKBOOK_SIZE_LIMIT');
    let data: Buffer;
    try {
      data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: Math.max(1, outputLimit) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') reject('WORKBOOK_SIZE_LIMIT');
      throw error;
    }
    totalUncompressed += data.length;
    if (totalUncompressed > 64 * 1024 * 1024 || data.length > 32 * 1024 * 1024) reject('WORKBOOK_SIZE_LIMIT');
    members.set(name, data);
  }
  return members;
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&([^&;]*);|&/g, (_match, entity: string | undefined) => {
    if (entity === undefined) reject('UNSUPPORTED_XML');
    switch (entity) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
    }
    const decimal = /^#([0-9]+)$/.exec(entity);
    const hex = /^#x([0-9A-Fa-f]+)$/.exec(entity);
    const point = decimal ? Number(decimal[1]) : hex ? parseInt(hex[1]!, 16) : NaN;
    if (!Number.isInteger(point) || !(point === 9 || point === 10 || point === 13 ||
        (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff))) reject('UNSUPPORTED_XML');
    return String.fromCodePoint(point);
  });
}

function xmlAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : undefined;
}

/** Reads one flat sheet into a text grid; blank cells stay empty strings. Shared-string indexes resolve through the callback. */
function readVideoSheetXml(
  xml: string,
  width: number,
  locator: string,
  resolveShared: (index: string, locator: string) => string,
): TextGrid {
  const data = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1];
  if (data === undefined) reject(`${locator}:SHEET_DATA_COUNT`);
  const grid: TextGrid = [];
  const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  let expected = 0;
  for (;;) {
    rowMatch = rowPattern.exec(data);
    if (rowMatch === null) break;
    const number = Number(xmlAttribute(rowMatch[1] ?? '', 'r'));
    expected += 1;
    if (!Number.isSafeInteger(number) || number !== expected || number > MAX_VIDEO_TABLE_ROWS + 1) reject(`${locator}:ROW_ORDER_OR_LIMIT`);
    const cells = new Array<string>(width).fill('');
    const seenColumns = new Set<number>();
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    for (;;) {
      cellMatch = cellPattern.exec(rowMatch[2] ?? '');
      if (cellMatch === null) break;
      const tag = cellMatch[1] ?? '';
      const inner = cellMatch[2] ?? '';
      if (/<f(?:\s|\/?>)/.test(inner)) reject(`${locator}:FORMULA_NOT_ALLOWED`);
      const reference = xmlAttribute(tag, 'r') ?? '';
      const columnMatch = /^([A-Z]+)(\d+)$/.exec(reference);
      if (!columnMatch || Number(columnMatch[2]) !== number) reject(`${locator}:CELL_OUTSIDE_PROFILE`);
      let column = 0;
      for (const letter of columnMatch[1] ?? '') column = column * 26 + (letter.charCodeAt(0) - 64);
      column -= 1;
      if (column < 0 || column >= width) reject(`${locator}:CELL_OUTSIDE_PROFILE`);
      if (seenColumns.has(column)) reject(`${locator}:DUPLICATE_CELL`);
      seenColumns.add(column);
      const kind = xmlAttribute(tag, 't') ?? 'n';
      if (kind === 'inlineStr') {
        const inline = /<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '';
        const texts = [...inline.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(part => decodeXmlEntities(part[1] ?? ''));
        cells[column] = texts.join('');
      } else if (kind === 's') {
        const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        cells[column] = value === undefined ? '' : resolveShared(decodeXmlEntities(value), locator);
      } else if (kind === 'n') {
        const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        cells[column] = value === undefined ? '' : decodeXmlEntities(value);
      } else {
        reject(`${locator}:UNSUPPORTED_CELL_TYPE`);
      }
      if ((cells[column] ?? '').length > MAX_VIDEO_CELL_CHARS) reject(`${locator}:CELL_TEXT_LIMIT`);
    }
    grid.push(cells);
  }
  if (grid.length === 0) reject(`${locator}:EMPTY_SHEET`);
  return grid;
}

/** Reads the flat two-sheet workbook profile into per-sheet text grids. */
export function parseVideoWorkbook(bytes: Buffer): Map<string, TextGrid> {
  let members: Map<string, Buffer>;
  try {
    members = unzipVideoWorkbook(Buffer.from(bytes));
  } catch (error) {
    if (error instanceof KalodataVideoRejection) throw error;
    reject('WORKBOOK_ARCHIVE_INVALID');
  }
  const readXml = (name: string, locator: string): string => {
    const raw = members.get(name);
    if (!raw) reject(`${locator}:MISSING_XML_PART`);
    if (raw.includes(0) || /<!DOCTYPE/i.test(raw.toString('utf8', 0, Math.min(raw.length, 1024)))) reject(`${locator}:UNSUPPORTED_XML`);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
      reject(`${locator}:UNSUPPORTED_XML`);
    }
  };
  const workbook = readXml('xl/workbook.xml', 'workbook');
  const sheetTags = [...workbook.matchAll(/<sheet\b([^>]*?)\/>/g)];
  const relationTargets = new Map<string, string>();
  for (const relation of readXml('xl/_rels/workbook.xml.rels', 'workbook-rels').matchAll(/<Relationship\b([^>]*?)\/>/g)) {
    const tag = relation[1] ?? '';
    if ((xmlAttribute(tag, 'Type') ?? '').endsWith('/worksheet')) relationTargets.set(xmlAttribute(tag, 'Id') ?? '', xmlAttribute(tag, 'Target') ?? '');
  }
  const shared: string[] = [];
  if (members.has('xl/sharedStrings.xml')) {
    for (const item of readXml('xl/sharedStrings.xml', 'sharedStrings').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const text = [...(item[1] ?? '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(part => decodeXmlEntities(part[1] ?? '')).join('');
      if (text.length > MAX_VIDEO_CELL_CHARS) reject('sharedStrings:CELL_TEXT_LIMIT');
      shared.push(text);
    }
  }
  const sheets = new Map<string, TextGrid>();
  const resolveShared = (index: string, locator: string): string => {
    if (!/^[0-9]{1,8}$/.test(index)) reject(`${locator}:SHARED_STRING_INDEX`);
    const text = shared[Number(index)];
    if (text === undefined) reject(`${locator}:SHARED_STRING_INDEX`);
    return text;
  };
  for (const tag of sheetTags) {
    const attributes = tag[1] ?? '';
    const name = xmlAttribute(attributes, 'name') ?? '';
    const rid = xmlAttribute(attributes, 'r:id') ?? xmlAttribute(attributes, 'id') ?? '';
    const target = relationTargets.get(rid) ?? '';
    const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    if (name !== 'videos' && name !== 'creators') reject(`workbook:SHEET_PROFILE_MISMATCH`);
    if (sheets.has(name)) reject(`workbook:SHEET_PROFILE_MISMATCH`);
    const width = name === 'videos' ? VIDEO_TABLE_HEADERS.length : CREATOR_TABLE_HEADERS.length;
    sheets.set(name, readVideoSheetXml(readXml(normalized, name), width, name, resolveShared));
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// Row mapping. Headers map exactly; missing cells stay null and never zero.
// ---------------------------------------------------------------------------

function checkHeader(actual: readonly string[], expected: readonly string[], locator: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) reject(`${locator}:HEADER_MISMATCH`);
}

function integerOrNull(raw: string, locator: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!INTEGER_PATTERN.test(text)) reject(`${locator}:INVALID_NUMERIC_VALUE`);
  return text;
}

function decimalOrNull(raw: string, locator: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!DECIMAL_PATTERN.test(text)) reject(`${locator}:INVALID_NUMERIC_VALUE`);
  return text;
}

function textOrNull(raw: string, locator: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  if (text.length > MAX_VIDEO_CELL_CHARS) reject(`${locator}:CELL_TEXT_LIMIT`);
  return text;
}

function dateOrNull(raw: string, locator: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  const match = DATE_PATTERN.exec(text);
  if (!match) reject(`${locator}:INVALID_DATE_VALUE`);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const year = Number(match[1]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) reject(`${locator}:INVALID_DATE_VALUE`);
  return text;
}

function linkOrNull(raw: string, locator: string): string | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^https?:\/\/\S+$/.test(text)) reject(`${locator}:INVALID_LINK_VALUE`);
  if (text.length > MAX_VIDEO_CELL_CHARS) reject(`${locator}:CELL_TEXT_LIMIT`);
  return text;
}

function mapVideoRow(cells: readonly string[], line: string): KalodataVideoRow {
  const get = (index: number): string => cells[index] ?? '';
  const units = integerOrNull(get(4), line);
  const views = integerOrNull(get(3), line);
  const adSpend = decimalOrNull(get(5), line);
  const revenue = decimalOrNull(get(2), line);
  return {
    video: textOrNull(get(0), line),
    creator: textOrNull(get(1), line),
    revenue,
    views,
    units,
    adSpend,
    publishDate: dateOrNull(get(6), line),
    productLink: linkOrNull(get(7), line),
    unitsPer1000Views: deriveUnitsPer1000Views(units, views),
    adShare: deriveAdShare(adSpend, revenue),
    line,
  };
}

function mapCreatorRow(cells: readonly string[], line: string): KalodataCreatorRow {
  const get = (index: number): string => cells[index] ?? '';
  return {
    creator: textOrNull(get(0), line),
    followers: integerOrNull(get(1), line),
    revenue: decimalOrNull(get(2), line),
    videoCount: integerOrNull(get(3), line),
    line,
  };
}

/**
 * Builds the validated cited table from one operator export. CSV carries
 * exactly one declared table; XLSX carries exactly the declared sheets.
 */
export function buildVideoTable(fileBytes: Uint8Array, filename: string, table: TableSelector): KalodataVideoTable {
  const bytes = Buffer.from(fileBytes);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_VIDEO_UPLOAD_BYTES) reject('FILE_SIZE_LIMIT');
  const lowered = filename.toLowerCase();
  const kind = lowered.endsWith('.csv') ? 'csv' : lowered.endsWith('.xlsx') ? 'xlsx' : undefined;
  if (!kind) reject('UNSUPPORTED_FILE_TYPE');
  if (kind === 'csv' && table === 'both') reject('TABLE_KIND_MISMATCH');
  const wanted: readonly ('video' | 'creator')[] =
    table === 'both' ? ['video', 'creator'] : table === 'video' || table === 'creator' ? [table] : reject('REQUEST_INVALID');
  const grids = new Map<string, TextGrid>();
  if (kind === 'csv') {
    const single = wanted.length === 1 ? wanted[0] : undefined;
    if (single === undefined) reject('TABLE_KIND_MISMATCH');
    grids.set(single, parseVideoCsv(bytes));
  } else {
    const workbook = parseVideoWorkbook(bytes);
    const names = new Map([['video', 'videos'], ['creator', 'creators']] as const);
    if (workbook.size !== wanted.length || wanted.some(entry => !workbook.has(names.get(entry) ?? ''))) {
      reject('workbook:SHEET_SET_MISMATCH');
    }
    for (const entry of wanted) grids.set(entry, workbook.get(names.get(entry) ?? '') ?? []);
  }
  const videos: KalodataVideoRow[] = [];
  const creators: KalodataCreatorRow[] = [];
  for (const entry of wanted) {
    const grid = grids.get(entry) ?? [];
    const headers = entry === 'video' ? VIDEO_TABLE_HEADERS : CREATOR_TABLE_HEADERS;
    const prefix = kind === 'csv' ? 'csv' : `xlsx:${entry === 'video' ? 'videos' : 'creators'}`;
    if (grid.length < 1) reject(`${prefix}:EMPTY_TABLE`);
    checkHeader(grid[0] ?? [], headers, prefix);
    const rows = grid.slice(1);
    if (rows.length < 1 || rows.length > MAX_VIDEO_TABLE_ROWS) reject(`${prefix}:ROW_RANGE_MISMATCH`);
    rows.forEach((cells, offset) => {
      if (cells.every(cell => cell.trim() === '')) return;
      if (cells.length !== headers.length) reject(`${prefix}:ROW_WIDTH_MISMATCH`);
      const line = `${prefix}:row:${offset + 2}`;
      if (entry === 'video') videos.push(mapVideoRow(cells, line));
      else creators.push(mapCreatorRow(cells, line));
    });
    if ((entry === 'video' ? videos.length : creators.length) < 1) reject(`${prefix}:EMPTY_TABLE`);
  }
  const built: KalodataVideoTable = {
    contractVersion: 'video-intake-table-v1',
    exportSha256: hash(bytes),
    exportKind: kind,
    tables: [...wanted] as KalodataVideoTable['tables'],
    missingDisplay: MISSING_VIDEO_VALUE_DISPLAY,
    videos,
    creators,
  };
  if (!validateTable(built)) reject('TABLE_SCHEMA_MISMATCH');
  return built;
}

/**
 * Parses stored table bytes closed and canonical; undefined unless the value
 * is exactly the validated table form.
 */
export function parseVideoTable(bytes: Uint8Array): KalodataVideoTable | undefined {
  let text = '';
  let value: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!validateTable(value) || canonicalJson(value) !== text) return undefined;
  return value;
}

// ---------------------------------------------------------------------------
// Prepared storage. Reuses the existing source-package store the same way as
// the supplemental intake: inert preparation, no automatic confirmation.
// ---------------------------------------------------------------------------

/** Code-unit path order used for every stored member list. */
export const byVideoPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * Prepared storage only for operator-exported video/creator tables. The
 * intake validates headers, sizes and numerics, keeps row-level lineage for
 * later citations, derives per-row metrics without ever dividing by zero,
 * and stores the exact bytes plus the validated table. Admission belongs to
 * an explicit later report-block selection.
 */
export class AutomationKalodataVideoIntake {
  readonly #packages: SourcePackageService;
  constructor(
    private readonly artifacts: RequestScopedArtifactStore,
    db: Database.Database,
    now: () => Date,
  ) {
    this.#packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  }

  hasRequest(runId: string, requestKey: string): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(videoPackageKey(runId, requestKey)).length > 0;
  }

  /** Caller holds the database mutation mutex. Bytes are snapshotted before any await. */
  async prepare(untrusted: unknown, supplied: Uint8Array, filename: string, bound: VideoRunBinding): Promise<Receipt> {
    if (!validateRequest(untrusted)) reject('REQUEST_INVALID');
    const input = JSON.parse(canonicalJson(untrusted)) as Request;
    const bytes = Buffer.from(supplied);
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_VIDEO_UPLOAD_BYTES) reject('FILE_SIZE_LIMIT');
    const table = buildVideoTable(bytes, filename, input.table);
    const lowered = filename.toLowerCase();
    const exportPath = `video/export.${lowered.endsWith('.xlsx') ? 'xlsx' : 'csv'}`;
    const binding = videoRunBindingSha256(bound);
    const context: VideoSourceContext = {
      contractVersion: 'automation-video-upload-context-v1',
      declaration: UPLOAD_DECLARATION,
      workspaceId: bound.workspaceId,
      runId: bound.runId,
      runBindingSha256: binding,
      request: input,
    };
    const contextBytes = Buffer.from(canonicalJson(context));
    if (!validateContext(JSON.parse(contextBytes.toString('utf8')))) reject('CONTEXT_SCHEMA_MISMATCH');
    const descriptor = {
      contractVersion: 'automation-video-source-v1',
      runId: bound.runId,
      workspaceId: bound.workspaceId,
      runBindingSha256: binding,
      table: input.table,
      exportPath,
      tablePath: VIDEO_TABLE_PATH,
      sourceContextPath: VIDEO_CONTEXT_PATH,
    };
    const tableBytes = Buffer.from(canonicalJson(table));
    const descriptorBytes = Buffer.from(canonicalJson(descriptor));
    const bytesByPath = new Map<string, Buffer>([
      [exportPath, bytes],
      [VIDEO_TABLE_PATH, tableBytes],
      [VIDEO_CONTEXT_PATH, contextBytes],
      [VIDEO_DESCRIPTOR_PATH, descriptorBytes],
    ]);
    const files = expectedVideoMetadata(bound.runId, bytesByPath);
    if (!files) reject('METADATA_SNAPSHOT_INCOMPLETE');
    const packageRequest: SourcePackageIntakeRequest = {
      contractVersion: '1.0.0',
      packageKey: videoPackageKey(bound.runId, input.requestKey),
      version: 1,
      sourceLabel: input.sourceLabel,
      sourceAcquiredAt: input.acquiredAt,
      files: [files[0]!, ...files.slice(1)],
    };
    // Foundation's replay budget includes the manifest. UUIDs and digests
    // have fixed widths; the longest Date.toISOString() reserves its size
    // before any artifact staging or database finalization.
    const manifestSize = Buffer.byteLength(canonicalJson({
      ...packageRequest,
      packageId: input.requestKey,
      finalizedAt: '+999999-12-31T23:59:59.999Z',
      packageContentSha256: binding,
    }));
    if (files.some(file => file.byteSize > VIDEO_READ_BUDGET.maxFileBytes) ||
        manifestSize > VIDEO_READ_BUDGET.maxFileBytes ||
        files.reduce((total, file) => total + file.byteSize, manifestSize) > VIDEO_READ_BUDGET.maxTotalBytes) {
      reject('VIDEO_PACKAGE_TOO_LARGE');
    }
    return this.artifacts.withOwnership(async () => {
      const stored = await this.#packages.intakeAutomationAttachment(
        packageRequest,
        new Map(bytesByPath),
        binding,
      );
      const verified = await this.#packages.readVerified(stored.packageId, VIDEO_READ_BUDGET);
      const origin = await this.#packages.readAutomationAttachmentOrigin(stored.packageId, VIDEO_READ_BUDGET);
      if (
        !origin ||
        origin.bindingSha256 !== binding ||
        origin.manifestArtifactSha256 !== verified.manifestArtifactSha256 ||
        verified.packageContentSha256 !== stored.packageContentSha256 ||
        verified.manifest.packageKey !== videoPackageKey(bound.runId, input.requestKey) ||
        canonicalJson([...verified.files].sort(byVideoPath).map(({ bytes: _bytes, ...file }) => file)) !== canonicalJson(files)
      ) {
        throw new Error('Prepared video package verification failed');
      }
      for (const digest of new Set([verified.manifestArtifactSha256, ...verified.files.map(file => file.sha256)])) {
        await this.artifacts.publishOwned(digest);
      }
      const members = [...verified.files]
        .sort(byVideoPath)
        .map(file => ({ path: file.path, sha256: file.sha256, byteSize: file.byteSize, mediaType: file.mediaType }));
      if (members.length !== 4) throw new Error('Prepared video package verification failed');
      const receiptFiles: Receipt['files'] = [members[0]!, members[1]!, members[2]!, members[3]!];
      return {
        contractVersion: 'automation-video-prepared-v1',
        requestKey: input.requestKey,
        table: input.table,
        packageId: verified.packageId,
        state: 'PREPARED_NOT_ADMITTED',
        exactRetry: stored.deduplicated,
        manifestArtifactSha256: verified.manifestArtifactSha256,
        packageContentSha256: verified.packageContentSha256,
        videoCount: table.videos.length,
        creatorCount: table.creators.length,
        files: receiptFiles,
        sourceLabel: verified.manifest.sourceLabel,
        acquiredAt: verified.manifest.sourceAcquiredAt,
        provenance: 'OPERATOR_SUPPLIED_UNVERIFIED',
      } satisfies Receipt;
    });
  }
}

export function videoPackageKeyPrefix(runId: string): string {
  return `automation-video:${runId}-`;
}

export function videoPackageKey(runId: string, requestKey: string): string {
  return `${videoPackageKeyPrefix(runId)}${requestKey}`;
}

export function videoRunBindingSha256(bound: VideoRunBinding): string {
  return hash(Buffer.from(canonicalJson(bound)));
}

/** Exact server-owned Foundation metadata for the four stored members, sorted by path. */
export function expectedVideoMetadata(runId: string, bytesByPath: ReadonlyMap<string, Uint8Array>): FileMetadata[] | undefined {
  const evidenceFamily = `video-${runId}`;
  const members: { path: string; mediaType: string; representationRole: 'structured' | 'derived'; provenanceBasis: string }[] = [
    { path: VIDEO_TABLE_PATH, mediaType: 'application/json', representationRole: 'derived', provenanceBasis: PROVENANCE_BASIS },
    { path: VIDEO_CONTEXT_PATH, mediaType: 'application/json', representationRole: 'derived', provenanceBasis: CONTEXT_PROVENANCE_BASIS },
    { path: VIDEO_DESCRIPTOR_PATH, mediaType: 'application/json', representationRole: 'derived', provenanceBasis: CONTEXT_PROVENANCE_BASIS },
  ];
  const exportPath = [...bytesByPath.keys()].find(candidate => candidate === 'video/export.csv' || candidate === 'video/export.xlsx');
  if (!exportPath) return undefined;
  members.push({
    path: exportPath,
    mediaType: exportPath.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv',
    representationRole: 'structured' as const,
    provenanceBasis: PROVENANCE_BASIS,
  });
  const files: FileMetadata[] = [];
  for (const member of members.sort(byVideoPath)) {
    const bytes = bytesByPath.get(member.path);
    if (!bytes) return undefined;
    files.push({
      path: member.path,
      sha256: hash(bytes),
      byteSize: bytes.byteLength,
      mediaType: member.mediaType,
      evidenceFamily,
      representationRole: member.representationRole,
      independence: 'non_independent',
      providerProvenance: 'operator_supplied_unverified',
      provenanceBasis: member.provenanceBasis,
    });
  }
  return files;
}

/**
 * Reloadable prepared video sources for one run. Each package is re-verified
 * from Foundation bytes: key prefix, exact origin binding, closed canonical
 * server context, member metadata and the validated cited table. Any mismatch
 * fails the whole read closed; every entry stays PREPARED_NOT_ADMITTED.
 */
export async function readPreparedKalodataVideoSources(reader: SourceReader, bound: VideoRunBinding): Promise<KalodataVideoPreparedList> {
  const sources: KalodataVideoPreparedList['sources'] = [];
  for (const entry of await reader.findAutomationAttachmentPackagesByKeyPrefix(videoPackageKeyPrefix(bound.runId))) {
    const source = await reader.readFinalizedSourcePackage(entry.packageId, VIDEO_READ_BUDGET);
    sources.push(await verifyPreparedVideoSource(reader, bound, source, entry));
  }
  return { contractVersion: 'automation-video-prepared-list-v1', workspaceId: bound.workspaceId, runId: bound.runId, sources };
}

/** Same exact single-package verification for inventory reads and later report-block selection. */
export async function verifyPreparedVideoSource(
  reader: SourceAttachmentOriginReader,
  bound: VideoRunBinding,
  source: VerifiedFinalizedSourcePackage,
  entry: { packageId: string; packageKey: string; manifestArtifactSha256: string; version: number },
): Promise<KalodataVideoPreparedList['sources'][number]> {
  const binding = videoRunBindingSha256(bound);
  if (source.manifest.version !== 1 || entry.version !== 1 || source.packageId !== entry.packageId) fail('PACKAGE_IDENTITY_MISMATCH');
  const origin = await reader.readAutomationAttachmentOrigin(source.packageId, VIDEO_READ_BUDGET);
  if (!origin || origin.bindingSha256 !== binding || origin.manifestArtifactSha256 !== source.manifestArtifactSha256) fail('ORIGIN_BINDING_MISMATCH');
  const contextFiles = source.files.filter(file => file.path === VIDEO_CONTEXT_PATH);
  if (contextFiles.length !== 1 || contextFiles[0]?.mediaType !== 'application/json') fail('CONTEXT_MISSING');
  const context = parseVideoContext(contextFiles[0]?.bytes ?? new Uint8Array());
  if (!context) fail('CONTEXT_INVALID');
  if (context.runId !== bound.runId || context.workspaceId !== bound.workspaceId || context.runBindingSha256 !== binding) fail('CONTEXT_RUN_MISMATCH');
  if (
    source.manifest.packageKey !== videoPackageKey(bound.runId, context.request.requestKey) ||
    source.manifest.packageKey !== entry.packageKey ||
    source.manifest.sourceLabel !== context.request.sourceLabel ||
    source.manifest.sourceAcquiredAt !== context.request.acquiredAt
  ) {
    fail('CONTEXT_REQUEST_MISMATCH');
  }
  const expected = expectedVideoMetadata(bound.runId, new Map(source.files.map(file => [file.path, file.bytes])));
  if (
    !expected ||
    source.files.length !== expected.length ||
    canonicalJson([...source.files].sort(byVideoPath).map(({ bytes: _bytes, ...file }) => file)) !== canonicalJson(expected) ||
    canonicalJson([...source.manifest.files].sort(byVideoPath)) !== canonicalJson(expected)
  ) {
    fail('MEMBER_METADATA_MISMATCH');
  }
  const tableFiles = source.files.filter(file => file.path === VIDEO_TABLE_PATH);
  const table = tableFiles.length === 1 ? parseVideoTable(tableFiles[0]?.bytes ?? new Uint8Array()) : undefined;
  if (!table || table.exportSha256 !== source.files.find(file => file.path.startsWith('video/export.'))?.sha256) fail('TABLE_INVALID');
  const declared: TableSelector[] = context.request.table === 'both' ? ['video', 'creator'] : [context.request.table];
  if (canonicalJson([...table.tables].sort()) !== canonicalJson([...declared].sort())) fail('TABLE_REQUEST_MISMATCH');
  return {
    packageId: source.packageId,
    videoCount: table.videos.length,
    creatorCount: table.creators.length,
    request: context.request,
    provenance: 'OPERATOR_SUPPLIED_UNVERIFIED',
  };
}

/** Parses a stored context member closed and canonical; undefined unless it is exactly the server-created form. */
export function parseVideoContext(bytes: Uint8Array): VideoSourceContext | undefined {
  let text = '';
  let value: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!validateContext(value) || canonicalJson(value) !== text) return undefined;
  return value;
}

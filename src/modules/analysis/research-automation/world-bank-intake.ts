import { createHash } from 'node:crypto';
import type { Projection, Row } from '../../../../contracts/analysis/world-bank-intake-v1.generated.js';

/** Initial public indicators witnessed by ST-20261008-20; never expanded from caller strings. */
export const WORLD_BANK_INDICATORS = ['NE.CON.PRVT.PC.KD', 'SP.POP.TOTL'] as const;
export const MAX_WORLD_BANK_FILE_BYTES = 8 * 1024 * 1024;
export const WORLD_BANK_PROFILE = 'world-bank-vn-two-indicators-v1';

export class WorldBankSourceRejection extends Error {
  constructor(readonly code: string, readonly locator: string) { super(`${locator}: ${code}`); }
}
function reject(code: string, locator: string): never { throw new WorldBankSourceRejection(code, locator); }
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Node 24's source context preserves the JSON number token BEFORE IEEE754 conversion.
 * These transient token objects never enter a stored contract. Original source bytes remain evidence. */
function sourceJson(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_WORLD_BANK_FILE_BYTES) reject('FILE_SIZE_LIMIT', 'json');
  try {
    const parse = JSON.parse as (text: string, reviver: (key: string, value: unknown, context: { source?: string }) => unknown) => unknown;
    const original = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const result = parse(original, (key, value, context) => {
      if (key === 'value' && typeof value === 'number') {
        if (!context.source) reject('LOSSLESS_JSON_UNAVAILABLE', 'value');
        return { numericLexeme: context.source };
      }
      return value;
    });
    // JSON.parse otherwise accepts duplicate names and silently replaces earlier source evidence.
    const stack: (Set<string> | null)[] = [];
    const tokens = original.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)!;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token === '{') stack.push(new Set());
      else if (token === '[') stack.push(null);
      else if (token === '}' || token === ']') stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ':') {
        const key = JSON.parse(token) as string, keys = stack.at(-1);
        if (!keys || keys.has(key)) reject('DUPLICATE_JSON_KEY', 'json');
        keys.add(key);
      }
    }
    return result;
  } catch (error) {
    if (error instanceof WorldBankSourceRejection) throw error;
    return reject('INVALID_JSON_UTF8', 'json');
  }
}
function object(value: unknown, locator: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('OBJECT_REQUIRED', locator);
  return value as Record<string, unknown>;
}
function text(value: unknown, locator: string, blank = false): string {
  if (typeof value !== 'string' || value.length > 10000 || (!blank && !value.trim())) reject('TEXT_REQUIRED', locator);
  return value;
}
function isoDate(value: unknown, locator: string): string {
  const raw = text(value, locator);
  const date = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) reject('DATE_INVALID', locator);
  return raw;
}
function decimal(lexeme: string, locator: string): string {
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(lexeme);
  if (!match || lexeme.length > 200) reject('DECIMAL_INVALID', locator);
  const fractional = match[3] ?? '', shift = Number(match[4] ?? '0') - fractional.length;
  if (Math.abs(shift) > 200) reject('DECIMAL_RANGE', locator);
  const digits = match[2]! + fractional;
  if (shift >= 0) return match[1]! + digits + '0'.repeat(shift);
  const padded = digits.padStart(1 - shift, '0');
  return match[1]! + padded.slice(0, shift) + '.' + padded.slice(shift);
}
function envelope(value: unknown, locator: string) {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[1])) reject('ENVELOPE_INVALID', locator);
  const page = object(value[0], `${locator}/pagination`);
  if (page.page !== 1 || page.pages !== 1 || !Number.isSafeInteger(page.total) || page.total !== value[1].length) reject('INCOMPLETE_PAGE', locator);
  return { page, records: value[1] as unknown[] };
}

/** Pure inert source projection. Metadata is the original indicator endpoint response, not an operator unit declaration.
 * No inferred currency, estimate, unit, geography, or category. Source text stays unchanged. */
export function inspectWorldBankSource(observationBytes: Uint8Array, metadataBytes: Uint8Array, sourceUrl: string, metadataUrl: string): Projection {
  const observation = envelope(sourceJson(observationBytes), 'observations');
  const metadata = envelope(sourceJson(metadataBytes), 'metadata');
  if (metadata.records.length !== 1 || observation.records.length < 1 || observation.records.length > 1000) reject('ROW_COUNT_INVALID', 'source');
  const indicator = object(metadata.records[0], 'metadata/0');
  const code = text(indicator.id, 'metadata/0/id');
  if (!(WORLD_BANK_INDICATORS as readonly string[]).includes(code)) reject('INDICATOR_NOT_ALLOWED', 'metadata/0/id');
  const expectedSource = `https://api.worldbank.org/v2/country/VN/indicator/${code}?format=json`;
  const expectedMetadata = `https://api.worldbank.org/v2/indicator/${code}?format=json`;
  if (sourceUrl !== expectedSource || metadataUrl !== expectedMetadata) reject('SOURCE_URL_MISMATCH', 'source');
  const name = text(indicator.name, 'metadata/0/name');
  const unitLiteral = text(indicator.unit, 'metadata/0/unit', true);
  const sourceNote = text(indicator.sourceNote, 'metadata/0/sourceNote', true);
  const sourceOrganization = text(indicator.sourceOrganization, 'metadata/0/sourceOrganization', true);
  const dataset = object(indicator.source, 'metadata/0/source');
  const datasetId = text(dataset.id, 'metadata/0/source/id');
  const datasetName = text(dataset.value, 'metadata/0/source/value');
  if (observation.page.sourceid !== datasetId) reject('DATASET_MISMATCH', 'observations/pagination/sourceid');
  const lastUpdated = isoDate(observation.page.lastupdated, 'observations/pagination/lastupdated');
  const years = new Set<string>();
  const rows = observation.records.map((raw, index) => {
    const locator = `observations/1/${index}`, row = object(raw, locator);
    const rowIndicator = object(row.indicator, `${locator}/indicator`), country = object(row.country, `${locator}/country`);
    if (rowIndicator.id !== code || rowIndicator.value !== name || country.id !== 'VN' || row.countryiso3code !== 'VNM') reject('SOURCE_IDENTITY_MISMATCH', locator);
    const countryName = text(country.value, `${locator}/country/value`);
    const year = text(row.date, `${locator}/date`);
    if (!/^\d{4}$/.test(year) || years.has(year)) reject('YEAR_INVALID_OR_DUPLICATE', locator);
    years.add(year);
    const rowUnit = text(row.unit, `${locator}/unit`, true);
    if (rowUnit !== '' && rowUnit !== unitLiteral) reject('UNIT_CONFLICT', locator);
    const statusLiteral = text(row.obs_status, `${locator}/obs_status`, true);
    if (!Number.isSafeInteger(row.decimal) || (row.decimal as number) < 0 || (row.decimal as number) > 100) reject('PRECISION_INVALID', locator);
    const footnote = row.footnote === undefined ? null : text(row.footnote, `${locator}/footnote`, true);
    let value: string | null = null, valueLexeme: string | null = null;
    if (row.value !== null) {
      const token = object(row.value, `${locator}/value`);
      valueLexeme = text(token.numericLexeme, `${locator}/value`);
      value = decimal(valueLexeme, `${locator}/value`);
    }
    return { locator: `/1/${index}`, indicatorCode: code as Row['indicatorCode'], indicatorName: name, countryCode: 'VN' as const, countryName, year,
      value, valueLexeme, unit: unitLiteral.trim() === '' ? null : unitLiteral, unitLiteral, observationUnitLiteral: rowUnit,
      lastUpdated, statusLiteral, footnote, decimal: row.decimal as number };
  });
  // The initial owning path supports E13's observed multi-year series condition only.
  // No caller boolean can claim missing official equivalents or international comparability.
  if (rows.filter(row => row.value !== null).length < 2) reject('E13_MULTI_YEAR_SERIES_REQUIRED', 'observations');
  return { profileId: WORLD_BANK_PROFILE, sourceSha256: hash(observationBytes), metadataSha256: hash(metadataBytes),
    sourceUrl, metadataUrl, datasetId, datasetName, sourceNote, sourceOrganization, rows: rows as Projection['rows'] };
}

/** E12/E13 values can accompany a sample; an attempted mixed arithmetic operation is rejected explicitly. */
export function rejectMacroSampleArithmetic(_operation: 'ADD' | 'SUBTRACT' | 'DIVIDE', _sample: string, _macro: string): never {
  return reject('MACRO_SAMPLE_ARITHMETIC_FORBIDDEN', 'display');
}

const WITHHELD = '\u0050h\u1ea1m vi v\u00e0 n\u1ed9i dung \u0111\u01b0\u1ee3c gi\u1eef trong b\u1ea3n l\u01b0u ngu\u1ed3n';

const MEASURE_NAMES: Readonly<Record<string, string>> = {
  revenue: '\u0044oanh thu',
  sales_volumn: '\u0053\u1ea3n l\u01b0\u1ee3ng b\u00e1n',
  sales_volume: '\u0053\u1ea3n l\u01b0\u1ee3ng b\u00e1n',
  launch_date: 'ng\u00e0y ra m\u1eaft do ngu\u1ed3n khai b\u00e1o',
};

const METHOD_NAMES: Readonly<Record<string, string>> = {
  M01: 'K\u1ebft lu\u1eadn ch\u00ednh', M02: 'Ph\u1ea1m vi v\u00e0 ph\u01b0\u01a1ng ph\u00e1p',
  M03: 'Quy m\u00f4 v\u00e0 di\u1ec5n bi\u1ebfn', M04: 'C\u01a1 c\u1ea5u th\u1ecb tr\u01b0\u1eddng',
  M05: 'Nhu c\u1ea7u', M06: 'Ngu\u1ed3n cung', M07: '\u0110\u1ed1i th\u1ee7',
  M08: 'Gi\u00e1 v\u00e0 kinh t\u1ebf \u0111\u01a1n v\u1ecb', M09: '\u0110\u1ed9ng l\u1ef1c v\u00e0 r\u1ee7i ro',
  M10: 'D\u1ef1 b\u00e1o v\u00e0 k\u1ecbch b\u1ea3n', M11: 'C\u01a1 h\u1ed9i', M12: 'H\u00e0nh \u0111\u1ed9ng',
};

const PRICE_STATES: Readonly<Record<string, string>> = {
  NON_EXACT: 'gi\u00e1 \u01b0\u1edbc t\u00ednh, ch\u01b0a ch\u00ednh x\u00e1c tuy\u1ec7t \u0111\u1ed1i',
  REPORTED_NON_EXACT: 'ngu\u1ed3n ghi gi\u00e1 kh\u00f4ng ch\u00ednh x\u00e1c tuy\u1ec7t \u0111\u1ed1i',
  RANGE: 'kho\u1ea3ng gi\u00e1', MISSING: 'kh\u00f4ng c\u00f3 gi\u00e1',
  UNREADABLE: 'kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c gi\u00e1', OBSERVED_ZERO: 'gi\u00e1 ghi nh\u1eadn b\u1eb1ng 0',
  EXACT: 'gi\u00e1 ch\u00ednh x\u00e1c',
};

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function increment(integer: string): string {
  const digits = integer.split('');
  let index = digits.length - 1;
  while (index >= 0 && digits[index] === '9') { digits[index] = '0'; index -= 1; }
  if (index < 0) return `1${digits.join('')}`;
  digits[index] = String(Number(digits[index]) + 1);
  return digits.join('');
}

function grouped(integer: string): string {
  const normalized = integer.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function roundedDecimal(value: string, decimals: number): { sign: string; integer: string; fraction: string } | null {
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  let integer = match[2]!.replace(/^0+(?=\d)/, '') || '0';
  const source = match[3] ?? '';
  const kept = source.slice(0, decimals).padEnd(decimals, '0');
  if (source.length > decimals && source[decimals]! >= '5') integer = increment(integer);
  const sign = match[1] === '-' && (integer !== '0' || /[1-9]/.test(source)) ? '-' : '';
  return { sign, integer, fraction: kept.replace(/0+$/, '') };
}

/** Formats exact decimal text without converting it through a JavaScript number. */
export function formatReaderNumber(value: string | null | undefined, kind: 'money' | 'count' | 'decimal' = 'decimal'): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const decimals = kind === 'decimal' ? 2 : 0;
  const result = roundedDecimal(value, decimals);
  if (!result) return null;
  return `${result.sign}${grouped(result.integer)}${result.fraction ? `,${result.fraction}` : ''}`;
}

function isMoney(measure: string | undefined, unit: string | null | undefined): boolean {
  return measure === 'revenue' || /vnd|\u0111\u1ed3ng/i.test(unit ?? '') || /doanh thu/i.test(measure ?? '');
}

function isCount(measure: string | undefined, unit: string | null | undefined): boolean {
  return measure === 'sales_volumn' || measure === 'sales_volume' || /l\u01b0\u1ee3t|s\u1ea3n l\u01b0\u1ee3ng|\u0111\u01a1n v\u1ecb|unit|count/i.test(`${measure ?? ''} ${unit ?? ''}`);
}

export function formatReaderValue(value: string | null | undefined, options: { readonly measure?: string | undefined; readonly unit?: string | null | undefined; readonly currency?: string | null | undefined } = {}): string | null {
  if (value === null || value === undefined) return null;
  const kind = isMoney(options.measure, options.unit ?? options.currency) ? 'money' : isCount(options.measure, options.unit) ? 'count' : 'decimal';
  return formatReaderNumber(value, kind);
}

export function readerMeasureName(field: string | null | undefined): string {
  return field !== null && field !== undefined && MEASURE_NAMES[field] ? MEASURE_NAMES[field]! : '\u0063h\u1ec9 s\u1ed1 ngu\u1ed3n';
}

/** Converts a stored one-field JSON literal into a short reader sentence. */
export function readerJsonLiteral(value: string | null | undefined, withheld = '\u0047i\u00e1 tr\u1ecb ngu\u1ed3n \u0111\u01b0\u1ee3c gi\u1eef trong b\u1ea3n l\u01b0u'): string {
  if (value === null || value === undefined) return withheld;
  const match = /^\s*\{\s*"([^"\\]+)"\s*:\s*(?:(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|"([^"\\]*)")\s*\}\s*$/.exec(value);
  if (!match) return withheld;
  const field = match[1]!;
  if (match[2] !== undefined) {
    const formatted = formatReaderValue(match[2], { measure: field, unit: field === 'revenue' ? 'VND' : null });
    return formatted === null ? withheld : `${readerMeasureName(field)}: ${formatted}`;
  }
  return field === 'launch_date' ? `${readerMeasureName(field)}: ${match[3]!}` : withheld;
}

export function readerStoredOrJson(value: string | null | undefined, withheld: string): string {
  if (value === null || value === undefined) return withheld;
  return value.trimStart().startsWith('{') ? readerJsonLiteral(value, withheld) : value;
}

export function readerPriceState(state: string): string {
  return PRICE_STATES[state] ?? 'tr\u1ea1ng th\u00e1i gi\u00e1 ch\u01b0a r\u00f5';
}

export function readerQuoteLabel(quoteId: string, fallbackOrdinal: number): string {
  const match = /^capture-(\d+)-(.+)$/.exec(quoteId);
  const ordinal = match ? Number(match[1]) : fallbackOrdinal;
  const kind = match?.[2]?.includes('range') ? 'kho\u1ea3ng gi\u00e1' : 'gi\u00e1 \u0111\u01a1n v\u1ecb';
  return `B\u1ea3n ghi gi\u00e1 #${ordinal} \u00b7 ${kind}`;
}

export function readerMethodName(code: string): string {
  return METHOD_NAMES[code] ?? '\u0050h\u01b0\u01a1ng ph\u00e1p';
}

export function readerScopeText(value: string | null | undefined, fallback = WITHHELD): string {
  if (value === 'Source-declared M05 observation scope; not a market universe.') {
    return 'Ph\u1ea1m vi quan s\u00e1t do ngu\u1ed3n khai b\u00e1o; kh\u00f4ng ph\u1ea3i to\u00e0n b\u1ed9 th\u1ecb tr\u01b0\u1eddng.';
  }
  const hasVietnameseLetter = value !== null && value !== undefined && /[\u00c0-\u024f\u1e00-\u1eff]/.test(value);
  return value !== null && value !== undefined && hasVietnameseLetter && !/\b(?:source|declared|observation|scope|market|universe|not|the|of|and)\b/i.test(value) ? value : fallback;
}

export function readerLocator(pointer: string | null): string | null {
  if (pointer === null || pointer === '') return null;
  if (pointer === '/data/revenue') return 'm\u1ee5c Doanh thu';
  if (pointer === '/data/sales_volumn' || pointer === '/data/sales_volume') return 'm\u1ee5c S\u1ea3n l\u01b0\u1ee3ng b\u00e1n';
  if (pointer.startsWith('/data/')) return 'm\u1ee5c d\u1eef li\u1ec7u ngu\u1ed3n';
  return pointer;
}

export function readerDateBasis(value: string): string {
  if (!value.includes('launch_date')) return value;
  return value.replace(/\s*t\u1ea1i launch_date,?/i, ' (ng\u00e0y ra m\u1eaft theo ngu\u1ed3n),').replace(/launch_date/gi, 'ng\u00e0y ra m\u1eaft do ngu\u1ed3n khai b\u00e1o');
}

export function readerProductLabel(id: string, title: string | null | undefined): string {
  const clean = title?.trim();
  return clean ? clean : id.includes('_') ? '\u0110\u1ed1i t\u01b0\u1ee3ng ngu\u1ed3n' : id;
}

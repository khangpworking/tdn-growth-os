// R-M16 / R-L04: a Market total across Shopee and TikTok Shop must carry the
// label «Cộng 2 sàn» with each platform's own number standing next to it
// (owner F100, 22/10/2026). Insight keeps its own W3 wording (R-L04, R-I06).
// One function for the draft gate (U32) and the Reader lint (W3), so both give
// the same verdict for the same HTML. The phrase list stays explicit: separate
// platform text is allowed and is never matched.
import { withoutHiddenText } from '../report-visible-text.js';

export const CROSS_PLATFORM_TOTAL_LABEL = 'Cộng 2 sàn';
export const CROSS_PLATFORM_TOTAL_PHRASES: readonly string[] = [
  'tổng hai sàn',
  'cộng hai sàn',
  'tổng cộng hai nền tảng',
  'Shopee + TikTok',
  'Shopee + TikTok Shop',
  'gộp Shopee và TikTok',
  'gộp Shopee và TikTok Shop',
  'gộp TikTok và Shopee',
  'gộp TikTok Shop và Shopee',
  'cộng Shopee và TikTok',
  'cộng Shopee và TikTok Shop',
  'cộng TikTok và Shopee',
  'cộng TikTok Shop và Shopee',
];
const LABEL = /cộng\s+2\s+sàn/giu;
const PATTERNS: readonly RegExp[] = [
  ...CROSS_PLATFORM_TOTAL_PHRASES.map(phrase => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')),
  // The Reader's former W3 wording: "tổng" then two platforms, any spacing.
  /tổng\s+(?:hai sàn|cả hai sàn|shopee và tiktok|tiktok và shopee)/giu,
  LABEL,
];
/** How far around a total its label and the two platform numbers may stand. */
const NEXT_TO = 160;
// Every label that may own a number: each platform, «Cộng 2 sàn» and the
// total phrases. Labels become digit-free marks so «2» in «Cộng 2 sàn» is
// never read as a figure and a number is never borrowed across another label.
const OWNER = /cộng\s+2\s+sàn|tổng\s+cộng\s+hai\s+nền\s+tảng|(?:tổng|cộng)\s+(?:cả\s+)?hai\s+sàn|shopee|tiktok(?:\s+shop)?/giu;
const ownerMark = (label: string): string => /^shopee$/iu.test(label) ? '\u0001S\u0001' : /^tiktok/iu.test(label) ? '\u0001T\u0001' : '\u0001X\u0001';
const CITATION = /\[\d+(?:\s*[,–-]\s*\d+)*\]/gu;
/** «Cột Cộng 2 sàn» names a table column; it is not a total of its own. */
const COLUMN_NAME = /cột\s+$/iu;
const NUMBER_CELL = /^[+−-]?\d/u;

const plain = (html: string): string => html.replace(/<!--[\s\S]*?-->/gu, '')
  .replace(/<\/?(?:span|b|strong|em|i|u|s|small|a|sup|sub|q|abbr|mark)\b[^>]*>/giu, '')
  .replace(/<[^>]*>/gu, ' ')
  .replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos|nbsp);/giu, (all, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex || dec) { const code = hex ? parseInt(hex, 16) : Number(dec); return code <= 0x10ffff ? String.fromCodePoint(code) : all; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name!.toLowerCase()]!;
  }).replace(CITATION, ' ').replace(/\s+/gu, ' ').trim();

/** Numbers belong to the platform's clause, never a gap, another label, sample size or date. */
function platformNumber(marked: string, mark: string): boolean {
  const after = new RegExp(`\u0001${mark}\u0001([^\\d\u0001;.!?]{0,60}?)\\d`, 'gu');
  for (const match of marked.matchAll(after)) {
    if (!/chưa|thiếu|không|kỳ|ngày|\bn\s*=/iu.test(match[1]!)) return true;
  }
  const before = new RegExp(`(?<![\\d.,])\\d[\\d.,]*\\s*(?:tỷ|triệu|nghìn|đồng|VND)?\\s+(?:trên|của|ở|tại)\\s*\u0001${mark}\u0001`, 'giu');
  return [...marked.matchAll(before)].some(match => !/\u0001[STX]\u0001[^;.!?]*$/u.test(marked.slice(0, match.index)));
}

/**
 * Every Market cross-platform total in visible HTML (or plain text) that breaks R-M16:
 * a total passes only when «Cộng 2 sàn» and Shopee's and TikTok's own numbers
 * stand within NEXT_TO characters of it. A number belongs to the label it stands
 * with, or to its own column in the same table row. Keep table cells intact:
 * flattening them first lets a blank cell borrow the next column's number.
 */
export function crossPlatformTotalMatches(html: string): string[] {
  const tableFailures: string[] = [];
  const prose = withoutHiddenText(html).replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/giu, table => {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/giu)]
      .map(row => [...row[1]!.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu)].map(cell => plain(cell[2]!)));
    const header = rows.find(cells => cells.some(cell => /^cộng\s+2\s+sàn$/iu.test(cell))
      && cells.some(cell => /^shopee$/iu.test(cell)) && cells.some(cell => /^tiktok(?:\s+shop)?$/iu.test(cell)));
    if (!header) return table;
    const total = header.findIndex(cell => /^cộng\s+2\s+sàn$/iu.test(cell));
    const shopee = header.findIndex(cell => /^shopee$/iu.test(cell));
    const tiktok = header.findIndex(cell => /^tiktok(?:\s+shop)?$/iu.test(cell));
    for (const cells of rows.slice(rows.indexOf(header) + 1)) {
      if (NUMBER_CELL.test(cells[total] ?? '') && (!NUMBER_CELL.test(cells[shopee] ?? '') || !NUMBER_CELL.test(cells[tiktok] ?? ''))) {
        tableFailures.push(CROSS_PLATFORM_TOTAL_LABEL);
      }
    }
    return ' ';
  });
  const flat = plain(prose);
  return [...tableFailures, ...PATTERNS.flatMap(pattern => [...flat.matchAll(pattern)].flatMap(match => {
    const at = match.index ?? 0;
    if (pattern === LABEL && COLUMN_NAME.test(flat.slice(Math.max(0, at - 8), at))
      && !/^\s*(?:[:=]|là|đạt)?\s*\d/iu.test(flat.slice(at + match[0].length))) return [];
    const near = flat.slice(Math.max(0, at - NEXT_TO), at + match[0].length + NEXT_TO);
    const labelled = new RegExp(LABEL.source, 'iu').test(near);
    const marked = near.replace(OWNER, ownerMark);
    return labelled && platformNumber(marked, 'S') && platformNumber(marked, 'T') ? [] : [match[0]];
  }))];
}

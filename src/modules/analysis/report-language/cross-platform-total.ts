// R-M16 / R-L04: a Market total across Shopee and TikTok Shop must carry the
// label «Cộng 2 sàn» with each platform's own number standing next to it
// (owner F100, 22/10/2026). Insight keeps its own W3 wording (R-L04, R-I06).
// One function for the draft gate (U32) and the Reader lint (W3), so both give
// the same verdict for the same text. The phrase list stays explicit: separate
// platform text is allowed and is never matched.
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
/** A platform's own number: «Shopee: 100» after the name with no other label
 * between, or «100 trên Shopee» before it when no label directly claims it. */
const platformNumber = (mark: string): RegExp =>
  new RegExp(`\u0001${mark}\u0001[^\\d\u0001]{0,60}?\\d|(?<!\u0001[STX]\u0001[\\s:]*)(?<![\\d.,])\\d[\\d.,]*[^\\d\u0001]{0,60}?\u0001${mark}\u0001`, 'u');
const SHOPEE_NUMBER = platformNumber('S');
const TIKTOK_NUMBER = platformNumber('T');
/** A table header row read as text: two or more labels side by side. */
const HEADER_RUN = /(?:\u0001[STX]\u0001[\s|,]*){2,}/gu;
/** One cell value after a header row: a number or a stated gap. */
const CELL = /(?<![\d.,])\d[\d.,]*|chưa\s+có\s+(?:dữ\s+liệu|số\s+liệu)|chưa\s+xác\s+định/giu;
const CITATION = /\[\d+(?:\s*[,–-]\s*\d+)*\]/gu;
/** «Cột Cộng 2 sàn» names a table column; it is not a total of its own. */
const COLUMN_NAME = /cột\s+$/iu;

/** Platforms whose header column holds a number in the first row after a header run. */
function tableOwners(marked: string): Set<string> {
  const owners = new Set<string>();
  for (const run of marked.matchAll(HEADER_RUN)) {
    const columns = [...run[0].matchAll(/\u0001([STX])\u0001/gu)].map(column => column[1]!);
    const cells = [...marked.slice((run.index ?? 0) + run[0].length).matchAll(CELL)].slice(0, columns.length);
    columns.forEach((column, i) => { if (/^\d/u.test(cells[i]?.[0] ?? '')) owners.add(column); });
  }
  return owners;
}

/**
 * Every Market cross-platform total in `text` that breaks R-M16, case-insensitive:
 * a total passes only when «Cộng 2 sàn» and Shopee's and TikTok's own numbers
 * stand within NEXT_TO characters of it. A number belongs to the label it stands
 * with, or to its column under a header row; it is never borrowed from another label.
 */
export function crossPlatformTotalMatches(text: string): string[] {
  const flat = text.replace(CITATION, ' ').replace(/\s+/gu, ' ');
  return PATTERNS.flatMap(pattern => [...flat.matchAll(pattern)].flatMap(match => {
    const at = match.index ?? 0;
    if (pattern === LABEL && COLUMN_NAME.test(flat.slice(Math.max(0, at - 8), at))) return [];
    const near = flat.slice(Math.max(0, at - NEXT_TO), at + match[0].length + NEXT_TO);
    const labelled = new RegExp(LABEL.source, 'iu').test(near);
    const marked = near.replace(OWNER, ownerMark);
    const table = tableOwners(marked);
    const owns = (mark: string, own: RegExp): boolean => table.has(mark) || own.test(marked);
    return labelled && owns('S', SHOPEE_NUMBER) && owns('T', TIKTOK_NUMBER) ? [] : [match[0]];
  }));
}

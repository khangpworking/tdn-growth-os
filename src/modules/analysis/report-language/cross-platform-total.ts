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
const platformNumber = (platform: string): RegExp =>
  new RegExp(`\\d[^\\d]{0,60}?${platform}|${platform}[^\\d]{0,60}?\\d`, 'iu');
const SHOPEE_NUMBER = platformNumber('shopee');
const TIKTOK_NUMBER = platformNumber('tiktok');

/**
 * Every Market cross-platform total in `text` that breaks R-M16, case-insensitive:
 * a total passes only when «Cộng 2 sàn» and a number beside Shopee and beside
 * TikTok stand within NEXT_TO characters of it.
 */
export function crossPlatformTotalMatches(text: string): string[] {
  const flat = text.replace(/\s+/gu, ' ');
  return PATTERNS.flatMap(pattern => [...flat.matchAll(pattern)].flatMap(match => {
    const at = match.index ?? 0;
    const near = flat.slice(Math.max(0, at - NEXT_TO), at + match[0].length + NEXT_TO);
    const labelled = new RegExp(LABEL.source, 'iu').test(near);
    return labelled && SHOPEE_NUMBER.test(near) && TIKTOK_NUMBER.test(near) ? [] : [match[0]];
  }));
}

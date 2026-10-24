// R-M16 / R-L04: a report never states one total across Shopee and TikTok Shop.
// One list for the draft gate (U32) and the Reader lint (W3), so both refuse the
// same phrases: the union of the two earlier lists (handoff decision, 24/10/2026).
// This is intentionally an explicit list. Do not replace it with a fuzzy
// cross-platform or arithmetic heuristic: separate platform text is allowed.
const PHRASES: readonly string[] = [
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
const PATTERNS: readonly RegExp[] = [
  ...PHRASES.map(phrase => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')),
  // The Reader's former W3 wording: "tổng" then two platforms, any spacing.
  /tổng\s+(?:hai sàn|cả hai sàn|shopee và tiktok|tiktok và shopee)/giu,
];

/** Every cross-platform total phrase in `text`, case-insensitive. */
export function crossPlatformTotalMatches(text: string): string[] {
  return PATTERNS.flatMap(pattern => [...text.matchAll(pattern)].map(match => match[0]));
}

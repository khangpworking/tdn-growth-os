/** Deterministic page type of an admitted search result: S26 news, S13 how-to article, otherwise S19. No model, no network. */
export type WebPageType = 'S13' | 'S19' | 'S26';
export const WEB_PAGE_TYPE_LABEL: Readonly<Record<WebPageType, string>> = { S13: 'Bài hướng dẫn', S26: 'Tin tức', S19: 'Trang khác' };
const NEWS_DOMAINS = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'vietnamnet.vn', 'znews.vn', 'cafef.vn', 'cafebiz.vn', 'vneconomy.vn',
  'laodong.vn', 'nld.com.vn', 'baomoi.com', 'tienphong.vn', 'plo.vn', 'kenh14.vn', '24h.com.vn'];
const NEWS_PATH = /(?:^|\/)(?:tin-tuc|tin-moi|tin-nong|thoi-su)(?:\/|$)/;
// "cách" alone also means insulation or distance, so it only counts with a doing-verb after it.
const DOING = 'lam|nau|dung|su dung|pha|chon|bao quan|che bien|nuong|chien|uong|ve sinh|khac phuc|tri';
const HOW_TO = new RegExp(`\\b(?:cach (?:${DOING})|huong dan|cong thuc|bi quyet|lam sao)\\b`);
// "mẹo" (tip) folds to the same letters as "mèo" (cat), so it is matched with its marks.
const HOW_TO_ACCENTED = /(?<![\p{L}])mẹo(?![\p{L}])/u;
const HOW_TO_SLUG = new RegExp(`(?:^|/)(?:cach-(?:${DOING.replace(/ /g, '-')})|huong-dan|cong-thuc|meo-|bi-quyet)(?:[a-z0-9-]*)(?:/|$)`);
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
function parts(url: string): { host: string; path: string } | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  // A malformed percent-encoding must not lose the host: fall back to the raw path.
  let raw = parsed.pathname;
  try { raw = decodeURIComponent(raw); } catch { /* keep the raw path */ }
  return { host: parsed.hostname.toLowerCase().replace(/^(?:www|m|amp)\./, ''), path: fold(raw).toLowerCase() };
}
// Shops and marketplaces sell products; a how-to phrase in a product listing is not a how-to article.
const SHOP_HOSTS = ['shopee.vn', 'shopee.com', 'tiktok.com', 'lazada.vn', 'tiki.vn', 'sendo.vn'];
const PRODUCT_PATH = /(?:^|\/)(?:product|products|san-pham|item|dp|p)(?:\/|$)|-i\.\d+\.\d+|(?:^|\/)product\.\d+\.\d+/;
const onHost = (host: string, list: readonly string[]): boolean => list.some(d => host === d || host.endsWith(`.${d}`));
export function classifyWebPage(row: { readonly url: string; readonly title: string; readonly snippet: string | null }): WebPageType {
  const u = parts(row.url);
  if (u && (onHost(u.host, NEWS_DOMAINS) || NEWS_PATH.test(u.path))) return 'S26';
  if (u && (onHost(u.host, SHOP_HOSTS) || PRODUCT_PATH.test(u.path))) return 'S19';
  // The how-to signal must be in the title or the address; a snippet alone is not enough.
  const title = row.title.toLowerCase().normalize('NFC');
  return HOW_TO.test(fold(title)) || HOW_TO_ACCENTED.test(title) || (u !== null && HOW_TO_SLUG.test(u.path)) ? 'S13' : 'S19';
}

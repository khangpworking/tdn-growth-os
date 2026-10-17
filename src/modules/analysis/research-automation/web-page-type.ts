import { CAPTURED_PROVIDER_NAMES } from '../reader-report/lint.js';

/** Deterministic page type of an admitted search result: S26 news, S13 how-to article, otherwise S19. No model, no network. */
export type WebPageType = 'S13' | 'S19' | 'S26';
export const WEB_PAGE_TYPE_LABEL: Readonly<Record<WebPageType, string>> = { S13: 'Bài hướng dẫn', S26: 'Tin tức', S19: 'Trang khác' };
/** Shared wording when a copied search-result title or site is withheld (Market and Insight show the same text). */
export const WEB_TITLE_WITHHELD = 'Tiêu đề được giữ trong bản lưu nguồn';
export const WEB_SITE_WITHHELD = 'Trang nguồn được giữ trong bản lưu';
export const WEB_SNIPPET_WITHHELD = 'Đoạn mô tả được giữ trong bản lưu nguồn';
export const WEB_LINK_WITHHELD = 'Liên kết được giữ trong bản lưu nguồn';
// Every name the report gates reject, plus the search engine itself. A name matches as a whole word even when
// spaces, dots, dashes or invisible marks sit between its letters; "Google" also matches as a word prefix (googleplay).
const HIDDEN_WEB_NAME = new RegExp([...CAPTURED_PROVIDER_NAMES, 'Google', 'Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM'].map(name => {
  const letters = [...name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')].join('[^\\p{L}\\p{N}]*');
  return `(?<![\\p{L}\\p{N}])${letters}${name === 'Google' ? '' : '(?![\\p{L}\\p{N}])'}`;
}).join('|'), 'iu');
const SEARCH_OPERATOR = /(?<![\p{L}\p{N}])(?:site|inurl|intitle|intext|allintitle|allinurl|allintext|filetype|cache|related|cdr|tbs)\s*:/iu;
const MODEL_ID = /(?<![\p{L}\p{N}])(?:gpt|claude)\s*-\s*[\p{L}\p{N}]/iu;
/** Text copied from a search result (title, site, snippet, date, address) is hidden when it names a provider or
 * the search engine, or carries a search operator or model id — also after percent-decoding. */
export function webTextHidden(text: string): boolean {
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* keep the raw text */ }
  return [text, decoded].some(value => {
    const folded = value.normalize('NFKC');
    return HIDDEN_WEB_NAME.test(folded) || SEARCH_OPERATOR.test(folded) || MODEL_ID.test(folded);
  });
}
export const NEWS_DOMAINS = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'vietnamnet.vn', 'znews.vn', 'cafef.vn', 'cafebiz.vn', 'vneconomy.vn',
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

import type { ContentBrandArtifact } from '../../../contracts/flow/content-brand-artifact.generated.js';
import type { ContentCaptionDisplay } from '../../../contracts/flow/content-package-artifact.generated.js';
import type { ContentBrandFactCheckRow, ContentBrandFactElement, ContentBrandFactState } from '../../../contracts/flow/content-package-version-artifact.generated.js';

/**
 * Brand-fact check over a Caption post (Task 051, C7): warns, never blocks. The footer is
 * excluded. Covers the I73 gaps: hotlines starting with "(", quoted taglines (straight or curly
 * quotes) and unlabelled phone numbers; money amounts must equal a pinned tier price.
 */

type BrandProfile = ContentBrandArtifact['profile'];

export const FACT_STATE_LABELS: Readonly<Record<ContentBrandFactState, string>> = {
  MATCH: '✓ Đúng hồ sơ', NOT_MENTIONED: 'Không nhắc', HIDDEN: 'Ẩn theo mục đích', MISMATCH: 'Sai hồ sơ',
};

const MAX_FOUND = 20;
const QUOTES = /["'“”‘’«»]/gu;
// Phone-like runs: optional "+" or "(", then 9–20 digits/separators ending in a digit.
const PHONE = /[+(]?\d[\d\s.()-]{7,18}\d/gu;
const MONEY_AFTER = /^\s*(?:đồng|vnđ|vnd|đ|triệu|tr|nghìn|ngàn|k|tỷ)(?![\p{L}\p{N}])/iu;
const URL = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'“”‘’<>()]*)?/giu;
const MONEY = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(đồng|vnđ|vnd|đ|triệu|tr|nghìn|ngàn|k|tỷ)(?![\p{L}\p{N}])/giu;
const BARE_GROUPED = /\d{1,3}(?:[.,]\d{3})+(?![\d.,]*\d)/gu;
const MULTIPLIER: Readonly<Record<string, number>> = { đồng: 1, vnđ: 1, vnd: 1, đ: 1, triệu: 1_000_000, tr: 1_000_000, nghìn: 1000, ngàn: 1000, k: 1000, tỷ: 1_000_000_000 };
// Abbreviations such as TP.HCM look like hosts; only these top-level domains (or an explicit scheme/www.) count as links.
const TLDS: ReadonlySet<string> = new Set(['com', 'vn', 'net', 'org', 'info', 'biz', 'io', 'co', 'me', 'shop', 'store', 'online', 'site', 'asia', 'edu', 'gov', 'xyz', 'app', 'page', 'link']);
const FANPAGE_HOSTS = /^(?:m\.|web\.)?(?:facebook\.com|fb\.com|fb\.me)(?:\/|$)/u;

export function brandFactCheck(input: {
  readonly post: string;
  readonly profile: BrandProfile;
  readonly display: ContentCaptionDisplay;
  /** priceText of the campaign's pinned tiers. */
  readonly prices: readonly string[];
}): ContentBrandFactCheckRow[] {
  const post = input.post.normalize('NFC');
  const { profile, display } = input;
  const urls = findUrls(post);
  const siteUrls = urls.filter((url) => !FANPAGE_HOSTS.test(canonicalUrl(url)));
  const pageUrls = urls.filter((url) => FANPAGE_HOSTS.test(canonicalUrl(url)));
  return [
    textRow('name', display.name === 'HIDDEN', post, profile.brandName),
    textRow('tagline', display.tagline === 'HIDDEN', post, profile.tagline),
    phoneRow(display.hotline === 'HIDDEN', post, profile.hotline),
    urlRow('website', display.web === 'HIDDEN', siteUrls, profile.website),
    urlRow('fanpage', display.web === 'HIDDEN', pageUrls, profile.fanpage),
    textRow('address', display.address === 'HIDDEN', post, profile.address),
    priceRow(post, input.prices),
  ];
}

function row(element: ContentBrandFactElement, state: ContentBrandFactState, found: readonly string[]): ContentBrandFactCheckRow {
  return { element, state, found: [...new Set(found.map((value) => [...value.trim()].slice(0, 200).join('')).filter((value) => value !== ''))].slice(0, MAX_FOUND) };
}

/** Identity text: a match when the post contains the value, ignoring case, quotes and spacing. */
function textRow(element: ContentBrandFactElement, hidden: boolean, post: string, value: string | undefined): ContentBrandFactCheckRow {
  if (hidden) return row(element, 'HIDDEN', []);
  if (!value) return row(element, 'NOT_MENTIONED', []);
  return comparable(post).includes(comparable(value)) ? row(element, 'MATCH', [value]) : row(element, 'NOT_MENTIONED', []);
}

function phoneRow(hidden: boolean, post: string, hotline: string | undefined): ContentBrandFactCheckRow {
  const found = findPhones(post);
  if (hidden) return row('hotline', 'HIDDEN', found);
  if (found.length === 0) return row('hotline', 'NOT_MENTIONED', []);
  const expected = hotline === undefined ? undefined : canonicalPhone(hotline);
  const wrong = found.filter((phone) => canonicalPhone(phone) !== expected);
  return wrong.length === 0 ? row('hotline', 'MATCH', found) : row('hotline', 'MISMATCH', wrong);
}

function urlRow(element: 'website' | 'fanpage', hidden: boolean, found: readonly string[], value: string | undefined): ContentBrandFactCheckRow {
  if (hidden) return row(element, 'HIDDEN', found);
  if (found.length === 0) return row(element, 'NOT_MENTIONED', []);
  const expected = value === undefined ? undefined : canonicalUrl(value);
  const wrong = found.filter((url) => !urlMatches(canonicalUrl(url), expected));
  return wrong.length === 0 ? row(element, 'MATCH', found) : row(element, 'MISMATCH', wrong);
}

function priceRow(post: string, prices: readonly string[]): ContentBrandFactCheckRow {
  const found = findMoney(post);
  if (found.length === 0) return row('price', 'NOT_MENTIONED', []);
  const allowed = new Set<number>();
  for (const price of prices) {
    for (const money of findMoney(price.normalize('NFC'))) allowed.add(money.amount);
    for (const match of price.normalize('NFC').matchAll(BARE_GROUPED)) allowed.add(Number(match[0].replace(/[.,]/gu, '')));
  }
  const wrong = found.filter((money) => !allowed.has(money.amount));
  return wrong.length === 0 ? row('price', 'MATCH', found.map((money) => money.text)) : row('price', 'MISMATCH', wrong.map((money) => money.text));
}

export function comparable(text: string): string {
  return text.normalize('NFC').replace(QUOTES, '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi');
}

/** Phone-like numbers that are not money: digits only, a leading 84 becomes 0. */
export function findPhones(text: string): string[] {
  const phones: string[] = [];
  for (const match of text.matchAll(PHONE)) {
    const raw = match[0];
    if (MONEY_AFTER.test(text.slice(match.index! + raw.length))) continue;
    const digits = canonicalPhone(raw);
    const mobile = digits.startsWith('0') && digits.length >= 10 && digits.length <= 11;
    const service = /^1[89]00/u.test(digits) && digits.length >= 8 && digits.length <= 10;
    if (mobile || service) phones.push(raw.trim());
  }
  return phones;
}

export function canonicalPhone(text: string): string {
  const digits = text.replace(/\D/gu, '');
  return digits.startsWith('84') && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
}

export function findUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL)) {
    const url = match[0].replace(/[.,;:!?]+$/u, '');
    const host = canonicalUrl(url).split('/')[0]!;
    if (/^(?:https?:\/\/|www\.)/iu.test(url) || TLDS.has(host.slice(host.lastIndexOf('.') + 1))) urls.push(url);
  }
  return urls;
}

/** Lower-case host and path without scheme, `www.` or trailing slashes. */
export function canonicalUrl(text: string): string {
  return text.trim().toLowerCase().replace(/^https?:\/\//u, '').replace(/^www\./u, '').replace(/[.,;:!?]+$/u, '').replace(/\/+$/u, '');
}

function urlMatches(found: string, expected: string | undefined): boolean {
  if (expected === undefined || expected === '') return false;
  // Deeper links under the profile value (a page's posts, a site's pages) also match.
  return found === expected || found.startsWith(`${expected}/`);
}

/** Money amounts in đồng: 1.290.000đ, 1,29 triệu and 1290k are the same amount. */
export function findMoney(text: string): { text: string; amount: number }[] {
  const amounts: { text: string; amount: number }[] = [];
  for (const match of text.matchAll(MONEY)) {
    const number = match[1]!;
    const unit = match[2]!.toLocaleLowerCase('vi');
    const grouped = /^\d{1,3}(?:[.,]\d{3})+$/u.test(number);
    const value = grouped ? Number(number.replace(/[.,]/gu, '')) : Number(number.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    amounts.push({ text: match[0], amount: Math.round(value * MULTIPLIER[unit]!) });
  }
  return amounts;
}

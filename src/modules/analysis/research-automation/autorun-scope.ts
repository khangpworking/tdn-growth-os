import type { MetricV3CaptureSpec } from '../../../../contracts/analysis/metric-v3-capture-spec.generated.js';
// Search scope of the Market auto-runner's second capture (v3plug P2).
//
// The first capture searches keyword 1 in every category. From its stored raw
// responses this file derives, without I/O, clock or model:
// - each category's share of revenue, per platform and for Shopee + TikTok Shop
//   combined, and whether one category dominates (combined share decides); a
//   category without a revenue number leaves no share and no decision;
// - the cross-check of that category with the interview product type;
// - keyword-2 candidates from the top-revenue product titles and their evidence.
// The service runs the model step (name variants) and the second capture; this
// file only scores what it is given, so the same input always gives the same plan.
// A data-backed keyword 2 is only a suggestion: the auto-run waits until the
// owner accepts, edits or removes it, then runs the second capture.
import { MARKET_RAW_PLATFORM_IDS } from './market-raw-series.js';
import { productTypeMatchesCategory } from './autorun-category-match.js';

export const AUTORUN_SCOPE_RECORD_VERSION = 'autorun-scope-record-v2' as const;
/** A category is dominant when its combined revenue share is at least this. */
export const AUTORUN_DOMINANT_CATEGORY_SHARE = 0.8;
/** Keyword-2 evidence is read from this many top-revenue product rows (both platforms). */
export const AUTORUN_KEYWORD2_TOP_ROWS = 100;
/** A keyword-2 candidate must appear in at least this share of those titles... */
export const AUTORUN_KEYWORD2_MIN_TITLE_SHARE = 0.2;
/** ...from at least this many different brands. */
export const AUTORUN_KEYWORD2_MIN_BRANDS = 3;
/** Candidates are token n-grams of 1 to this many tokens. */
export const AUTORUN_KEYWORD2_MAX_TOKENS = 3;
/** Candidates kept in the trace record. */
const MAX_RECORDED_CANDIDATES = 10;
const MAX_RECORDED_SHARES = 5;
const MAX_TERM_LENGTH = 80;
/**
 * Words of a product's form or packaging, not of the product itself. The product noun of a keyword
 * is its first run of other words: «viên uống kẽm» -> «kẽm», «viên uống bổ sung canxi» -> «canxi».
 */
const PRODUCT_FORM_WORDS = new Set(['viên', 'uống', 'nang', 'mềm', 'sủi', 'nhai', 'ngậm', 'kẹo', 'dẻo', 'bột', 'gói', 'hộp', 'chai', 'lọ', 'ống',
  'siro', 'dạng', 'thực', 'phẩm', 'chức', 'năng', 'tpcn', 'bổ', 'sung', 'hỗ', 'trợ']);
/** Joining words that never start or end a title phrase candidate. */
const EDGE_WORDS = new Set(['và', 'cho', 'của', 'với', 'có', 'là', 'loại', 'hàng', 'the', 'and', 'for', 'with', 'of']);

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const PLATFORM_BY_ID: ReadonlyMap<number, 'shopee' | 'tiktok'> = new Map([[MARKET_RAW_PLATFORM_IDS.shopee, 'shopee'], [MARKET_RAW_PLATFORM_IDS.tiktok, 'tiktok']]);

// ---------------------------------------------------------------------------
// Raw responses
// ---------------------------------------------------------------------------

interface Entry { readonly url: string; readonly order: number; readonly body: unknown; readonly request: unknown }

function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function entriesOf(raw: unknown): Entry[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.responses) ? raw.responses : [];
  return list.flatMap((item: unknown, index: number): Entry[] => {
    if (!isRecord(item)) return [];
    const url = [item.urlPath, item.path, item.url].find(value => typeof value === 'string') as string | undefined;
    const status = item.status ?? item.responseStatus;
    if (!url || !(status === undefined || status === null || status === 200)) return [];
    return [{ url: url.split('?')[0]!, order: typeof item.responseOrder === 'number' ? item.responseOrder : index,
      body: parseJsonish(item.body), request: parseJsonish(item.requestBody) }];
  });
}

/** Only responses of the keyword search itself; the page's first unfiltered load has no query. */
function searched(entry: Entry): boolean {
  const query = isRecord(entry.request) && isRecord(entry.request.include_query) ? entry.request.include_query : null;
  return Array.isArray(query?.queries) && query.queries.some(value => typeof value === 'string' && value.trim() !== '');
}

const dataOf = (entry: Entry): Json | null => isRecord(entry.body) && isRecord(entry.body.data) ? entry.body.data : null;
const finite = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
};

interface ProductRow { readonly id: string; readonly platform: 'shopee' | 'tiktok'; readonly title: string; readonly brand: string; readonly revenue: number }

function productRows(entries: readonly Entry[]): { rows: ProductRow[]; labels: Map<string, string> } {
  const rows = new Map<string, ProductRow>();
  const labels = new Map<string, string>();
  for (const entry of [...entries].sort((a, b) => a.order - b.order)) {
    const products = dataOf(entry)?.products;
    if (!Array.isArray(products)) continue;
    for (const product of products) {
      if (!isRecord(product)) continue;
      // Category names come with every product row, also those of the unfiltered first load.
      for (const category of Array.isArray(product.bee_categories) ? product.bee_categories : []) {
        if (isRecord(category) && typeof category.id === 'string' && typeof category.name === 'string' && category.name.trim() && (category.level === 0 || category.level === undefined))
          labels.set(category.id, category.name.normalize('NFC').trim());
      }
      if (!searched(entry) || product.is_deleted === true) continue;
      const id = product.product_base_id;
      const platform = typeof id === 'string' ? PLATFORM_BY_ID.get(Number(id.split('__')[0])) : undefined;
      const title = typeof product.product_name === 'string' ? product.product_name.normalize('NFC').trim().slice(0, 500) : '';
      if (typeof id !== 'string' || !platform || !title) continue;
      const revenue = finite(product.revenue_custom ?? product.revenue);
      // A title without readable revenue cannot be ranked among the top-revenue products.
      if (revenue === null) continue;
      const brand = [product.final_brand, product.brand].find(value => typeof value === 'string' && value.trim()) as string | undefined;
      rows.set(id, { id, platform, title, brand: brand ? brand.normalize('NFC').trim().toLowerCase() : '', revenue });
    }
  }
  return { rows: [...rows.values()], labels };
}

// ---------------------------------------------------------------------------
// Category shares and decision
// ---------------------------------------------------------------------------

export interface CategoryShare { readonly id: string; readonly label: string | null; readonly revenue: number; readonly share: number }
export interface CategoryShares {
  readonly combined: readonly CategoryShare[];
  readonly platforms: { readonly shopee: readonly CategoryShare[]; readonly tiktok: readonly CategoryShare[] };
  /** Categories whose revenue is missing on Shopee or TikTok Shop; when any, the share lists are empty. */
  readonly missingRevenue?: readonly string[];
}

function shareList(revenue: ReadonlyMap<string, number>, labels: ReadonlyMap<string, string>): CategoryShare[] {
  const total = [...revenue.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return [...revenue].map(([id, value]) => ({ id, label: labels.get(id) ?? null, revenue: value, share: value / total }))
    .sort((a, b) => b.revenue - a.revenue || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Revenue share of each category in the latest keyword search response
 * (REVENUE__BY__CATEGORIES_CUSTOM), per platform and Shopee + TikTok Shop
 * combined. Category ids are named from the product rows. Null when the search
 * response has no category breakdown. A missing revenue number is never read as
 * zero: the total would be unknown, so no shares are given, only the categories
 * that lack revenue.
 */
export function readCategoryShares(raw: unknown): CategoryShares | null {
  const entries = entriesOf(raw);
  const { labels } = productRows(entries);
  let found: { order: number; entities: unknown[] } | null = null;
  for (const entry of entries) {
    if (!/\/analytics\/search-basic\/?$/i.test(entry.url) || !searched(entry)) continue;
    const basic = dataOf(entry)?.search_basic;
    const aggregations = isRecord(basic) && Array.isArray(basic.aggregations) ? basic.aggregations : [];
    const category = aggregations.find(item => isRecord(item) && typeof item.aggregation === 'string' && item.aggregation.toUpperCase() === 'REVENUE__BY__CATEGORIES_CUSTOM');
    if (isRecord(category) && Array.isArray(category.entities) && (!found || entry.order >= found.order)) found = { order: entry.order, entities: category.entities };
  }
  if (!found) return null;
  const combined = new Map<string, number>(), shopee = new Map<string, number>(), tiktok = new Map<string, number>();
  const missing = new Set<string>();
  for (const entity of found.entities) {
    if (!isRecord(entity) || typeof entity.key !== 'string' || !entity.key.trim()) continue;
    if (!Array.isArray(entity.platforms)) { missing.add(entity.key); continue; }
    for (const item of entity.platforms) {
      const platform = isRecord(item) ? PLATFORM_BY_ID.get(Number(item.platform_id)) : undefined;
      if (!platform) continue;
      const value = finite((item as Json).value);
      if (value === null) { missing.add(entity.key); continue; }
      const target = platform === 'shopee' ? shopee : tiktok;
      target.set(entity.key, (target.get(entity.key) ?? 0) + value);
      combined.set(entity.key, (combined.get(entity.key) ?? 0) + value);
    }
  }
  if (missing.size) return { combined: [], platforms: { shopee: [], tiktok: [] }, missingRevenue: [...missing].sort() };
  const result = { combined: shareList(combined, labels), platforms: { shopee: shareList(shopee, labels), tiktok: shareList(tiktok, labels) } };
  return result.combined.length ? result : null;
}

export type AutorunCategoryReason = 'DOMINANT' | 'NO_DOMINANT' | 'INTERVIEW_MISMATCH' | 'CATEGORY_NOT_SELECTABLE' | 'NO_CATEGORY_DATA' | 'MISSING_REVENUE';

export interface AutorunCategoryDecision {
  readonly reason: AutorunCategoryReason;
  readonly threshold: number;
  /** Category the second capture asks for (DOMINANT only). */
  readonly category: { readonly id: string; readonly label: string } | null;
  readonly top: CategoryShare | null;
  readonly productType: string | null;
  /** Null when there is no product type or no dominant category to compare. */
  readonly interviewMatch: boolean | null;
  readonly shares: CategoryShares | null;
}

const trimShares = (shares: CategoryShares): CategoryShares => ({ combined: shares.combined.slice(0, MAX_RECORDED_SHARES),
  platforms: { shopee: shares.platforms.shopee.slice(0, MAX_RECORDED_SHARES), tiktok: shares.platforms.tiktok.slice(0, MAX_RECORDED_SHARES) },
  ...(shares.missingRevenue ? { missingRevenue: shares.missingRevenue.slice(0, MAX_RECORDED_SHARES) } : {}) });

/**
 * Dominant = top combined share >= AUTORUN_DOMINANT_CATEGORY_SHARE. A declared
 * product type must fit the category label; an empty one leaves the data to
 * decide alone. A dominant category without a readable name cannot be selected.
 * Missing revenue of any category leaves no decision (MISSING_REVENUE).
 */
export function decideCategory(shares: CategoryShares | null, productType: string | null | undefined): AutorunCategoryDecision {
  const type = typeof productType === 'string' && productType.trim() ? productType.normalize('NFC').trim() : null;
  const base = { threshold: AUTORUN_DOMINANT_CATEGORY_SHARE, productType: type, shares: shares ? trimShares(shares) : null };
  if (shares?.missingRevenue?.length) return { ...base, reason: 'MISSING_REVENUE', category: null, top: null, interviewMatch: null };
  const top = shares?.combined[0] ?? null;
  if (!top) return { ...base, reason: 'NO_CATEGORY_DATA', category: null, top: null, interviewMatch: null };
  if (top.share < AUTORUN_DOMINANT_CATEGORY_SHARE) return { ...base, reason: 'NO_DOMINANT', category: null, top, interviewMatch: null };
  if (top.label === null) return { ...base, reason: 'CATEGORY_NOT_SELECTABLE', category: null, top, interviewMatch: null };
  const interviewMatch = type === null ? null : productTypeMatchesCategory(type, top.label);
  if (interviewMatch === false) return { ...base, reason: 'INTERVIEW_MISMATCH', category: null, top, interviewMatch };
  return { ...base, reason: 'DOMINANT', category: { id: top.id, label: top.label }, top, interviewMatch };
}

// ---------------------------------------------------------------------------
// Keyword 2
// ---------------------------------------------------------------------------

function tokens(text: string): string[] {
  return text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
}

function indexOfSequence(haystack: readonly string[], needle: readonly string[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** First run of tokens that are not form or packaging words; empty when all are. */
function productNoun(words: readonly string[]): string[] {
  const start = words.findIndex(word => !PRODUCT_FORM_WORDS.has(word));
  if (start < 0) return [];
  const end = words.findIndex((word, index) => index > start && PRODUCT_FORM_WORDS.has(word));
  return words.slice(start, end < 0 ? words.length : end);
}

/** Product noun of keyword 1; the whole keyword when it has only form words. */
const keywordNoun = (keyword: readonly string[]): string[] => { const noun = productNoun(keyword); return noun.length ? noun : [...keyword]; };

/**
 * Names of the product a keyword-2 candidate must hold (brief 8b): the product noun of keyword 1 and
 * the product noun of each name variant the keyword drafting model proposed (canxi -> calcium). A
 * variant noun longer than keyword 1's is a description, not another name («chính hãng»), and is left out.
 */
function productNames(keyword1: string, modelTerms: readonly string[]): string[][] {
  const noun = keywordNoun(tokens(keyword1));
  const names = new Map<string, string[]>([[noun.join(' '), noun]]);
  for (const variant of modelTerms.map(term => productNoun(tokens(term))))
    if (variant.length && variant.length <= noun.length) names.set(variant.join(' '), variant);
  return [...names.values()];
}

const holdsName = (words: readonly string[], names: readonly string[][]): boolean => names.some(name => indexOfSequence(words, name) >= 0);

export interface AutorunTitleRow { readonly title: string; readonly brand: string; readonly revenue: number; readonly platform: 'shopee' | 'tiktok' }

/** Product rows of the keyword search (both platforms), highest revenue first, at most AUTORUN_KEYWORD2_TOP_ROWS. */
export function topRevenueTitles(raw: unknown): AutorunTitleRow[] {
  return productRows(entriesOf(raw)).rows
    .sort((a, b) => b.revenue - a.revenue || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, AUTORUN_KEYWORD2_TOP_ROWS)
    .map(row => ({ title: row.title, brand: row.brand, revenue: row.revenue, platform: row.platform }));
}

/**
 * Shorter or alternate phrases of keyword 1 found in the titles: token n-grams
 * of 1-3 tokens holding the product noun of keyword 1 or of a model name
 * variant. A phrase that contains all of keyword 1, or is part of it other than
 * the product noun itself, matches the same titles as keyword 1, so it is not a
 * second name for the product and is left out; so are phrases with digits-only
 * tokens or a joining word at either end.
 */
export function titlePhraseCandidates(keyword1: string, rows: readonly AutorunTitleRow[], modelTerms: readonly string[] = []): string[] {
  const keyword = tokens(keyword1);
  if (!keyword.length) return [];
  const names = productNames(keyword1, modelTerms);
  const noun = keywordNoun(keyword).join(' ');
  const found = new Set<string>();
  for (const row of rows) {
    const words = tokens(row.title);
    for (let length = 1; length <= AUTORUN_KEYWORD2_MAX_TOKENS; length++) {
      for (let i = 0; i + length <= words.length; i++) {
        const gram = words.slice(i, i + length);
        if (!holdsName(gram, names) || gram.some(word => /^\p{N}+$/u.test(word))) continue;
        if (EDGE_WORDS.has(gram[0]!) || EDGE_WORDS.has(gram[gram.length - 1]!)) continue;
        if ((indexOfSequence(keyword, gram) >= 0 && gram.join(' ') !== noun) || indexOfSequence(gram, keyword) >= 0) continue;
        found.add(gram.join(' '));
      }
    }
  }
  return [...found].sort();
}

export type Keyword2Source = 'TITLE' | 'MODEL' | 'OWNER';
export type Keyword2Rejection = 'SAME_AS_KEYWORD' | 'INVALID' | 'NO_PRODUCT_NOUN' | 'LOW_TITLE_SHARE' | 'FEW_BRANDS';
export interface Keyword2Evidence {
  readonly term: string;
  readonly source: Keyword2Source;
  readonly titles: number;
  readonly titleShare: number;
  readonly brands: number;
  readonly revenue: number;
  readonly kept: boolean;
  readonly rejected?: Keyword2Rejection;
}
export interface Keyword2Result {
  /** Number of top-revenue titles the evidence was read from. */
  readonly titleCount: number;
  readonly candidates: readonly Keyword2Evidence[];
  readonly chosen: Keyword2Evidence | null;
}

/**
 * Scores every candidate on the top-revenue titles; a part of keyword 1 (the
 * bare product noun) only on the titles without keyword 1. Kept only when it appears
 * (as whole tokens) in >= AUTORUN_KEYWORD2_MIN_TITLE_SHARE of the titles, from
 * >= AUTORUN_KEYWORD2_MIN_BRANDS brands, is not keyword 1, and (unless the
 * owner typed it) holds a product name: the product noun of keyword 1 or of a
 * MODEL candidate. The kept candidate whose titles hold the most revenue is chosen.
 */
export function chooseKeyword2(keyword1: string, rows: readonly AutorunTitleRow[], candidates: readonly { readonly term: string; readonly source: Keyword2Source }[]): Keyword2Result {
  const keywordWords = tokens(keyword1);
  const keyword = keywordWords.join(' ');
  const titles = rows.map(row => ({ ...row, words: tokens(row.title) }));
  const names = productNames(keyword1, candidates.filter(candidate => candidate.source === 'MODEL' && typeof candidate.term === 'string').map(candidate => candidate.term));
  const seen = new Set<string>(), broad = new Set<string>();
  const scored: Keyword2Evidence[] = [];
  for (const candidate of candidates) {
    const words = typeof candidate.term === 'string' ? tokens(candidate.term) : [];
    const term = words.join(' ');
    if (seen.has(term)) continue;
    seen.add(term);
    if (!words.length || (candidate.source !== 'OWNER' && words.length > AUTORUN_KEYWORD2_MAX_TOKENS) || term.length > MAX_TERM_LENGTH) {
      if (term) scored.push({ term, source: candidate.source, titles: 0, titleShare: 0, brands: 0, revenue: 0, kept: false, rejected: 'INVALID' });
      continue;
    }
    // A part of keyword 1 (the product noun) is in every keyword-1 title; it counts only the titles keyword 1 misses.
    const partOfKeyword = indexOfSequence(keywordWords, words) >= 0;
    const hits = titles.filter(row => indexOfSequence(row.words, words) >= 0 && !(partOfKeyword && indexOfSequence(row.words, keywordWords) >= 0));
    const brands = new Set(hits.map(row => row.brand).filter(Boolean)).size;
    const titleShare = titles.length ? hits.length / titles.length : 0;
    const revenue = hits.reduce((sum, row) => sum + row.revenue, 0);
    const rejected: Keyword2Rejection | undefined = term === keyword ? 'SAME_AS_KEYWORD'
      : candidate.source !== 'OWNER' && !holdsName(words, names) ? 'NO_PRODUCT_NOUN'
      : titleShare < AUTORUN_KEYWORD2_MIN_TITLE_SHARE ? 'LOW_TITLE_SHARE' : brands < AUTORUN_KEYWORD2_MIN_BRANDS ? 'FEW_BRANDS' : undefined;
    scored.push({ term, source: candidate.source, titles: hits.length, titleShare, brands, revenue, kept: !rejected, ...(rejected ? { rejected } : {}) });
    if (partOfKeyword) broad.add(term);
  }
  // The bare product noun is the broadest search; it is chosen only when no other name passes.
  scored.sort((a, b) => Number(b.kept) - Number(a.kept) || Number(broad.has(a.term)) - Number(broad.has(b.term)) || b.revenue - a.revenue || b.titleShare - a.titleShare || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return { titleCount: titles.length, candidates: scored.slice(0, MAX_RECORDED_CANDIDATES), chosen: scored[0]?.kept ? scored[0] : null };
}

// ---------------------------------------------------------------------------
// Scope record and report lines
// ---------------------------------------------------------------------------

export type AutorunModelVariants = 'USED' | 'NOT_CONFIGURED' | 'FAILED' | 'NO_TITLES';

export type AutorunKeyword2Decision = 'ACCEPTED' | 'EDITED' | 'REMOVED';

/** Written after the first capture; the owner's answer, the second capture and the report read it back. */
export interface AutorunScopeRecord {
  readonly contractVersion: typeof AUTORUN_SCOPE_RECORD_VERSION | 'autorun-scope-record-v1';
  readonly metricV3Preset?: MetricV3CaptureSpec;
  readonly runId: string;
  readonly keyword1: string;
  readonly category: AutorunCategoryDecision;
  readonly keyword2: Keyword2Result & {
    readonly modelVariants: AutorunModelVariants;
    /** The owner's answer to `chosen`, with the evidence of the term kept (an edited term is scored on the same titles). */
    readonly owner?: { readonly decision: AutorunKeyword2Decision; readonly evidence: Keyword2Evidence | null };
  };
  /**
   * Null when the first capture already is the final one. AWAITING_KEYWORD2: a data-backed keyword 2
   * waits for the owner; PENDING: the second capture is due.
   */
  readonly capture2: null | {
    readonly keywords: readonly string[];
    readonly category: string | null;
    readonly outcome: 'AWAITING_KEYWORD2' | 'PENDING' | 'OK' | 'CATEGORY_NOT_SELECTABLE';
  };
}

function captureTwo(keyword1: string, keyword2: string | null, category: string | null): AutorunScopeRecord['capture2'] {
  return keyword2 !== null || category !== null ? { keywords: keyword2 !== null ? [keyword1, keyword2] : [keyword1], category, outcome: 'PENDING' } : null;
}

export function planScope(input: { runId: string; keyword1: string; category: AutorunCategoryDecision; keyword2: AutorunScopeRecord['keyword2'] }): AutorunScopeRecord {
  const keyword1 = input.keyword1.normalize('NFC').trim();
  const category = input.category.category?.label ?? null;
  const chosen = input.keyword2.chosen;
  return { contractVersion: AUTORUN_SCOPE_RECORD_VERSION, runId: input.runId, keyword1, category: input.category, keyword2: input.keyword2,
    capture2: chosen ? { keywords: [keyword1, chosen.term], category, outcome: 'AWAITING_KEYWORD2' } : captureTwo(keyword1, null, category) };
}

/**
 * The owner's answer while the record waits: the suggested term (ACCEPTED), another term (EDITED,
 * scored on the same titles as `evidence`), or null (REMOVED: the second capture keeps keyword 1 only).
 * A second capture that would repeat the first one (keyword 1, all categories) is dropped.
 */
export function answerKeyword2(record: AutorunScopeRecord, term: string | null, evidence: Keyword2Evidence | null): AutorunScopeRecord {
  if (record.capture2?.outcome !== 'AWAITING_KEYWORD2' || !record.keyword2.chosen) throw new RangeError('scope record is not waiting for keyword 2');
  const value = term === null ? null : term.normalize('NFC').trim().toLowerCase().split(/\s+/u).join(' ');
  if (value !== null && (!value || value === record.keyword1.toLowerCase().split(/\s+/u).join(' '))) throw new RangeError('keyword 2 must differ from keyword 1');
  const decision: AutorunKeyword2Decision = value === null ? 'REMOVED' : value === record.keyword2.chosen.term ? 'ACCEPTED' : 'EDITED';
  return { ...record, keyword2: { ...record.keyword2, owner: { decision, evidence: decision === 'ACCEPTED' ? record.keyword2.chosen : value === null ? null : evidence } },
    capture2: captureTwo(record.keyword1, value, record.capture2.category) };
}

/** The second capture's category could not be selected: the run keeps the first capture (All, keyword 1). */
export function categoryNotSelectable(record: AutorunScopeRecord): AutorunScopeRecord {
  return { ...record, category: { ...record.category, reason: 'CATEGORY_NOT_SELECTABLE' },
    capture2: record.capture2 ? { ...record.capture2, outcome: 'CATEGORY_NOT_SELECTABLE' } : null };
}

/**
 * The second capture succeeded. A retry after a saved CATEGORY_NOT_SELECTABLE did select the
 * category, so the decision returns to DOMINANT (the only reason that names a category).
 */
export function captureTwoOk(record: AutorunScopeRecord): AutorunScopeRecord {
  if (!record.capture2) throw new RangeError('scope record has no second capture');
  const category = record.category.reason === 'CATEGORY_NOT_SELECTABLE' && record.category.category && record.capture2.category !== null
    ? { ...record.category, reason: 'DOMINANT' as const } : record.category;
  return { ...record, category, capture2: { ...record.capture2, outcome: 'OK' } };
}

/** Keywords and category of the capture the report uses. */
export function usedScope(record: AutorunScopeRecord | null): { keywords: readonly string[]; category: string | null; captureNumber: 1 | 2 } | null {
  if (!record) return null;
  if (record.capture2?.outcome === 'OK') return { keywords: record.capture2.keywords, category: record.capture2.category, captureNumber: 2 };
  return { keywords: [record.keyword1], category: null, captureNumber: 1 };
}

/** Share as a Vietnamese percent, truncated (never rounded up to a threshold) to one decimal. */
function percent(share: number): string {
  return `${(Math.floor(share * 1000) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

/**
 * Fixed Vietnamese scope lines for the report. Name Shopee and TikTok Shop only,
 * never a data provider. Empty when the auto-run changed nothing.
 */
export function scopeLinesVi(record: AutorunScopeRecord | null): string[] {
  const used = usedScope(record);
  if (!record || !used) return [];
  const lines: string[] = [];
  const keyword2 = used.keywords[1];
  const evidence = record.keyword2.owner ? record.keyword2.owner.evidence : record.keyword2.chosen;
  if (keyword2 && evidence) lines.push(`Từ khóa: "${used.keywords[0]}" và "${keyword2}"${record.keyword2.owner?.decision === 'EDITED' ? ' (từ khóa 2 do người dùng sửa)' : ''}. Từ khóa 2 có trong ${percent(evidence.titleShare)} tên sản phẩm, xét ${record.keyword2.titleCount} sản phẩm doanh thu cao ở lượt tìm đầu, thuộc ${evidence.brands} thương hiệu.`);
  const decision = record.category;
  const all = 'Phạm vi: tất cả danh mục — ';
  if (decision.reason === 'DOMINANT' && used.category && decision.top) lines.push(`Danh mục: ${used.category}, chiếm ${percent(decision.top.share)} doanh thu ở lượt tìm đầu (Shopee và TikTok Shop gộp).`);
  else if (decision.reason === 'NO_DOMINANT') lines.push(`${all}không có danh mục nào chiếm từ ${percent(decision.threshold)} doanh thu.`);
  else if (decision.reason === 'INTERVIEW_MISMATCH') lines.push(`${all}danh mục trong dữ liệu khác loại sản phẩm đã khai.`);
  else if (decision.reason === 'MISSING_REVENUE') lines.push(`${all}thiếu doanh thu của một số danh mục nên chưa chọn danh mục.`);
  else if (decision.reason === 'CATEGORY_NOT_SELECTABLE') lines.push(`${all}chưa chọn được trên trang tìm kiếm danh mục chiếm từ ${percent(decision.threshold)} doanh thu.`);
  return lines;
}

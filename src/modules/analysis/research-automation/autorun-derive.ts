// Pure derivations for the Market auto-runner (P6-209 follow-up, PR1).
//
// Every value the operator used to type by hand is derived here from run data
// only: capture spec and period, include terms, the Shopee link pick, and the
// three owner-route request bodies. No I/O, no clock, no randomness, no model:
// the same input always yields the same output, so a restarted step replays the
// exact same request.
import { createHash } from 'node:crypto';
import type { ResearchAutomationSourceConfirmRequest } from '../../../../contracts/api/research-automation-source-api.generated.js';
import type { ResearchAutomationMetricCapturePrepareRequest } from '../../../../contracts/api/research-automation-metric-capture-intake-api.generated.js';
import type { AutomationMarketPresentationRevisionRequest } from '../../../../contracts/analysis/automation-market-presentation-revision.generated.js';
import { filterKeywordMeanings, type KeywordMeaningFilterData } from '../keyword-meaning-filter.js';
import { captureRowExclusions, splitCaptureNameCell, type CaptureRowExclusionReason } from './capture-row-quality.js';
import { MAX_PRINCIPAL_CARDS } from './model.js';
import type { MetricCaptureStopCode } from './metric-capture-runner.js';

// Every runner and executor result code: a stop in the CAPTURE phase itself. The record
// type forces a new runner/executor code to be classified here. Only these stops may be
// re-run, and only by the owner's explicit "Thử lại"; intake, pick, confirm, present,
// run-end and owner stops are never retryable.
const CAPTURE_STOP_CODE_SET: Readonly<Record<MetricCaptureStopCode, true>> = {
  METRIC_LOGIN_REQUIRED: true, METRIC_CAPTCHA: true, METRIC_PERIOD_UNSUPPORTED: true, METRIC_UI_CHANGED: true,
  METRIC_FILTER_MISMATCH: true, METRIC_ROW_CAP: true, METRIC_SEARCH_NOT_APPLIED: true, BRIDGE_DISCONNECTED: true,
  EXECUTOR_DISABLED: true, TIMEOUT: true, MANIFEST_HASH_MISMATCH: true, EXECUTOR_NOT_CONFIGURED: true,
  PERIOD_OUTSIDE_RUN: true, CAPTURE_INTERRUPTED: true, CAPTURE_INPUT_INVALID: true, CAPTURE_IO_FAILED: true,
};
/** CAPTURE-family stop codes: the only stops the owner's "Thử lại" may re-run. */
export const AUTORUN_CAPTURE_STOP_CODES: readonly MetricCaptureStopCode[] = Object.freeze(Object.keys(CAPTURE_STOP_CODE_SET) as MetricCaptureStopCode[]);
export function isAutorunCaptureStopCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CAPTURE_STOP_CODE_SET, code);
}

export const AUTORUN_PICK_RULE_VERSION = 'autorun-pick-v3' as const;
export const AUTORUN_MAX_SHOPEE_LINKS = 5;
/** Metric's results window is 30 inclusive days. */
export const AUTORUN_CAPTURE_WINDOW_DAYS = 30;

export interface DatePeriod { readonly startDate: string; readonly endDate: string }

// ---------------------------------------------------------------------------
// Request keys
// ---------------------------------------------------------------------------

export type AutorunStep = 'prepare' | 'confirm' | 'revision';

/**
 * Fixed per-run request key for one step. The owner-route contracts require a
 * v4-shaped UUID, so the stable name `autorun:<runId>:<step>` is hashed into
 * that shape instead of being sent verbatim. Same run and step, same key.
 */
export function autorunRequestKey(runId: string, step: AutorunStep): string {
  const hex = createHash('sha256').update(`autorun:${runId}:${step}`, 'utf8').digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Period (decision D1)
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  if (!isIsoDate(date)) throw new RangeError('invalid ISO date');
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isPeriod(value: unknown): value is DatePeriod {
  if (!value || typeof value !== 'object') return false;
  const { startDate, endDate } = value as { startDate?: unknown; endDate?: unknown };
  return isIsoDate(startDate) && isIsoDate(endDate) && startDate <= endDate;
}

/** True when `inner` is a valid period lying fully inside the valid period `outer`. */
export function periodInside(inner: unknown, outer: unknown): boolean {
  return isPeriod(inner) && isPeriod(outer) && outer.startDate <= inner.startDate && inner.endDate <= outer.endDate;
}

/** D1 step 1: the 30 inclusive days ending at the run's requested end date. */
export function firstAttemptPeriod(requested: DatePeriod): DatePeriod {
  return { startDate: addDays(requested.endDate, -(AUTORUN_CAPTURE_WINDOW_DAYS - 1)), endDate: requested.endDate };
}

/** Pre-check before any lookup: the first window must lie inside the run. */
export function planCapturePeriod(requested: DatePeriod): { ok: true; period: DatePeriod } | { ok: false; code: 'PERIOD_OUTSIDE_RUN' } {
  if (!isPeriod(requested)) return { ok: false, code: 'PERIOD_OUTSIDE_RUN' };
  const period = firstAttemptPeriod(requested);
  return periodInside(period, requested) ? { ok: true, period } : { ok: false, code: 'PERIOD_OUTSIDE_RUN' };
}

const OBSERVED_PERIOD = /observedPeriod\\*"\s*:\s*\{\s*\\*"startDate\\*"\s*:\s*\\*"(\d{4}-\d{2}-\d{2})\\*"\s*,\s*\\*"endDate\\*"\s*:\s*\\*"(\d{4}-\d{2}-\d{2})\\*"/g;

/**
 * D1 step 2: read the page default window from an adapter
 * METRIC_PERIOD_UNSUPPORTED message (`...; details={"observedPeriod":{...}}`),
 * also when the message was re-escaped inside JSON output. Returns null when
 * absent, invalid, or when several different windows are reported.
 */
export function parseObservedPeriod(message: string): DatePeriod | null {
  if (typeof message !== 'string') return null;
  let found: DatePeriod | null = null;
  for (const match of message.matchAll(OBSERVED_PERIOD)) {
    const period = { startDate: match[1]!, endDate: match[2]! };
    if (!isPeriod(period)) return null;
    if (found && (found.startDate !== period.startDate || found.endDate !== period.endDate)) return null;
    found = period;
  }
  return found;
}

export type PeriodRetryDecision =
  | { readonly retry: true; readonly period: DatePeriod }
  | { readonly retry: false; readonly code: 'PERIOD_OUTSIDE_RUN' | 'METRIC_PERIOD_UNSUPPORTED'; readonly observed: DatePeriod | null };

/**
 * D1 steps 3-4: retry once with exactly the observed window when it lies fully
 * inside the run; otherwise stop. A window equal to the one already attempted
 * cannot succeed on retry and stops as unsupported.
 */
export function decidePeriodRetry(executorMessage: string, requested: DatePeriod, attempted: DatePeriod): PeriodRetryDecision {
  const observed = parseObservedPeriod(executorMessage);
  if (!observed) return { retry: false, code: 'METRIC_PERIOD_UNSUPPORTED', observed: null };
  if (observed.startDate === attempted.startDate && observed.endDate === attempted.endDate) return { retry: false, code: 'METRIC_PERIOD_UNSUPPORTED', observed };
  if (!periodInside(observed, requested)) return { retry: false, code: 'PERIOD_OUTSIDE_RUN', observed };
  return { retry: true, period: observed };
}

// ---------------------------------------------------------------------------
// Capture spec
// ---------------------------------------------------------------------------

export interface MetricCaptureSpec {
  readonly keywords: readonly [string];
  readonly platforms: readonly ['shopee', 'tiktok'];
  readonly period: DatePeriod;
  readonly category: null;
}

export function buildCaptureSpec(keyword: string, period: DatePeriod): MetricCaptureSpec {
  const normalized = keyword.normalize('NFC').trim();
  if (!normalized) throw new RangeError('capture keyword is empty');
  if (!isPeriod(period)) throw new RangeError('capture period is invalid');
  return { keywords: [normalized], platforms: ['shopee', 'tiktok'], period: { startDate: period.startDate, endDate: period.endDate }, category: null };
}

// ---------------------------------------------------------------------------
// includeTerms
// ---------------------------------------------------------------------------

const TOKEN_SPLIT = /[^\p{L}\p{N}\p{M}]+/u;
const MAX_TERM_LENGTH = 80;

function tokens(text: string): string[] {
  return text.normalize('NFC').toLowerCase().split(TOKEN_SPLIT).filter(Boolean);
}

function containsTokenSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Longest keyword prefix (whole tokens, exact diacritics) present in at least
 * half of the non-null PRINCIPAL titles; the full keyword when none qualifies.
 */
export function deriveIncludeTerms(keyword: string, principalTitles: readonly (string | null | undefined)[]): string[] {
  const keywordTokens = tokens(keyword);
  if (keywordTokens.length === 0) {
    const fallback = keyword.normalize('NFC').trim().toLowerCase();
    return fallback && fallback.length <= MAX_TERM_LENGTH ? [fallback] : [];
  }
  const titles = principalTitles.filter((title): title is string => typeof title === 'string').map(tokens);
  const candidates: string[][] = [];
  for (let length = keywordTokens.length; length >= 1; length--) candidates.push(keywordTokens.slice(0, length));
  const fits = (candidate: string[]) => candidate.join(' ').length <= MAX_TERM_LENGTH;
  if (titles.length > 0) {
    for (const candidate of candidates) {
      if (!fits(candidate)) continue;
      const hits = titles.filter(title => containsTokenSequence(title, candidate)).length;
      if (hits * 2 >= titles.length) return [candidate.join(' ')];
    }
  }
  const full = candidates.find(fits);
  return full ? [full.join(' ')] : [];
}

// ---------------------------------------------------------------------------
// Shopee link pick
// ---------------------------------------------------------------------------

const SHOPEE_BASE_ID = /^1__([1-9][0-9]{0,19})__([1-9][0-9]{0,19})$/;
const FILTER_RECORD_CHUNK = 5000;
const FILTER_TEXT_MAX = 10000;

export interface PickedShopeeLink {
  readonly productBaseId: string;
  readonly itemId: string;
  readonly shopId: string;
  readonly revenue: number | null;
  readonly brand: string | null;
  readonly url: string;
}

export interface PickResult {
  readonly pickRuleVersion: typeof AUTORUN_PICK_RULE_VERSION;
  readonly terms: readonly string[];
  readonly links: readonly PickedShopeeLink[];
  readonly urls: readonly string[];
  readonly excludedRows: readonly { readonly productBaseId: string; readonly reason: CaptureRowExclusionReason }[];
  readonly counts: {
    readonly walked: number;
    readonly deleted: number;
    readonly notIncluded: number;
    readonly tokenGuardRejected: number;
    readonly eligible: number;
    readonly picked: number;
  };
}

interface Candidate {
  id: string; itemId: string; shopId: string; shopKey: string; name: string;
  revenue: number | null; units: number | null; brand: string | null; brandKey: string; deleted: boolean;
}

function collectShopeeRows(raw: unknown): Candidate[] {
  const seen = new Set<string>();
  const rows: Candidate[] = [];
  const stack: unknown[] = [raw];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]); continue; }
    const record = node as Record<string, unknown>;
    const id = record.product_base_id;
    const match = typeof id === 'string' ? SHOPEE_BASE_ID.exec(id) : null;
    if (match && typeof id === 'string' && !seen.has(id)) {
      seen.add(id);
      const itemId = match[1]!; const shopId = match[2]!;
      const shopBase = record.shop_base_id;
      const shopKey = (typeof shopBase === 'string' && shopBase.trim()) || (typeof shopBase === 'number' && Number.isFinite(shopBase)) ? String(shopBase).trim() : shopId;
      const rawBrand = [record.final_brand, record.brand].find(value => typeof value === 'string' && value.trim()) as string | undefined;
      const brand = rawBrand ? rawBrand.trim() : null;
      const revenueValue = record.revenue_custom ?? record.revenue;
      const revenueNumber = Number(revenueValue);
      const unitsValue = record.order_custom ?? record.order_count;
      const unitsNumber = (typeof unitsValue === 'string' && unitsValue.trim()) || typeof unitsValue === 'number' ? Number(unitsValue) : NaN;
      const name = typeof record.product_name === 'string' && record.product_name.length <= FILTER_TEXT_MAX ? record.product_name : '';
      rows.push({ id, itemId, shopId, shopKey, name, revenue: revenueValue !== null && revenueValue !== undefined && revenueValue !== '' && Number.isFinite(revenueNumber) && revenueNumber >= 0 ? revenueNumber : null,
        units: Number.isFinite(unitsNumber) && unitsNumber >= 0 ? unitsNumber : null,
        brand, brandKey: brand ? brand.normalize('NFC').toLowerCase() : '', deleted: record.is_deleted === true });
    }
    const values = Object.values(record);
    for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
  }
  return rows;
}

function escapeRegExp(text: string): string {
  // Only syntax characters: identity escapes of others are invalid under the `u` flag.
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function uniqueTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    if (typeof term !== 'string' || !term.trim()) continue;
    const key = term.normalize('NFC').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(term.normalize('NFC'));
  }
  return out;
}

/**
 * Picks up to five Shopee product links from a capture's raw responses: rows
 * whose name means the run's terms (L9 filter keeps diacritics) and contains a
 * term as a whole token, sorted by revenue then id, at most one per brand and
 * per shop. Pure: no I/O, and the result keeps only audit fields.
 */
export function pickShopeeLinks(rawResponses: unknown, terms: readonly string[]): PickResult {
  const keywords = uniqueTerms(terms);
  const rows = collectShopeeRows(rawResponses);
  const live = rows.filter(row => !row.deleted);
  const deleted = rows.length - live.length;
  let included: Candidate[] = [];
  if (keywords.length > 0) {
    const data: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: AUTORUN_PICK_RULE_VERSION,
      category: 'autorun-shopee-pick', provenance: 'OPERATOR_SUPPLIED', keywords: keywords as [string, ...string[]], exclusions: [] };
    const decisions = new Map<string, string>();
    for (let start = 0; start < live.length; start += FILTER_RECORD_CHUNK) {
      const chunk = live.slice(start, start + FILTER_RECORD_CHUNK);
      const result = filterKeywordMeanings(data, chunk.map(row => ({ recordId: row.id, text: row.name })));
      for (const item of result.results) decisions.set(item.recordId as string, item.decision);
    }
    included = live.filter(row => decisions.get(row.id) === 'INCLUDED');
  }
  const notIncluded = live.length - included.length;
  const guards = keywords.map(term => new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escapeRegExp(term.toLowerCase())}(?![\\p{L}\\p{N}\\p{M}])`, 'u'));
  const excluded = captureRowExclusions(live.map(row => ({ title: splitCaptureNameCell(row.name, '').title, platform: 'shopee', revenue: row.revenue, units: row.units })), keywords);
  const qualityRejected = new Set([...excluded.keys()].map(i => live[i]!.id));
  const eligible = included.filter(row => {
    if (qualityRejected.has(row.id)) return false;
    const name = row.name.normalize('NFC').toLowerCase();
    return guards.some(guard => guard.test(name));
  });
  const tokenGuardRejected = included.length - eligible.length;
  eligible.sort((a, b) => {
    const ra = a.revenue ?? Number.NEGATIVE_INFINITY; const rb = b.revenue ?? Number.NEGATIVE_INFINITY;
    if (ra !== rb) return rb > ra ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const picked: Candidate[] = [];
  const seenBrands = new Set<string>(); const seenShops = new Set<string>();
  const take = (row: Candidate) => { picked.push(row); seenShops.add(row.shopKey); if (row.brandKey) seenBrands.add(row.brandKey); };
  for (const row of eligible) {
    if (picked.length >= AUTORUN_MAX_SHOPEE_LINKS) break;
    if (row.brandKey && !seenBrands.has(row.brandKey) && !seenShops.has(row.shopKey)) take(row);
  }
  for (const row of eligible) {
    if (picked.length >= AUTORUN_MAX_SHOPEE_LINKS) break;
    // Fill: a brand may repeat (owner example: 2 of one brand + 3 others), a shop may not.
    if (picked.includes(row) || seenShops.has(row.shopKey)) continue;
    take(row);
  }
  const links = picked.map(row => ({ productBaseId: row.id, itemId: row.itemId, shopId: row.shopId, revenue: row.revenue, brand: row.brand,
    url: `https://shopee.vn/product/${row.shopId}/${row.itemId}` }));
  return { pickRuleVersion: AUTORUN_PICK_RULE_VERSION, terms: keywords, links, urls: links.map(link => link.url),
    excludedRows: [...excluded].map(([i, reason]) => ({ productBaseId: live[i]!.id, reason })).sort((a, b) => a.productBaseId < b.productBaseId ? -1 : a.productBaseId > b.productBaseId ? 1 : 0),
    counts: { walked: rows.length, deleted, notIncluded, tokenGuardRejected, eligible: eligible.length, picked: links.length } };
}

// ---------------------------------------------------------------------------
// Owner-route request values
// ---------------------------------------------------------------------------

/** Plain Vietnamese capture context. Names only Shopee and TikTok Shop, never a data provider or tool. */
export function sourceContextVi(keyword: string, period: DatePeriod): string {
  const name = keyword.normalize('NFC').trim();
  return `Tự động thu thập số liệu bán hàng Shopee và TikTok Shop cho từ khóa "${name}", từ ngày ${period.startDate} đến ngày ${period.endDate}.`;
}

export function buildPrepareValue(input: { runId: string; expectedRevision: number; sourceContext: string }): ResearchAutomationMetricCapturePrepareRequest {
  return { contractVersion: 'automation-metric-capture-prepare-v1', requestKey: autorunRequestKey(input.runId, 'prepare'),
    expectedRevision: input.expectedRevision, sourceContext: input.sourceContext };
}

export interface ConfirmValueInput {
  readonly runId: string;
  readonly expectedRevision: number;
  readonly keyword: string;
  readonly description?: string | null;
  readonly includeTerms: readonly string[];
  readonly principalProductIds: readonly string[];
  readonly exactShopeeUrls: readonly string[];
  readonly packageId: string;
  readonly testReviewCap?: number;
}

/** Trial collection is distinct from AUTO_REUSE; marker-free confirmations keep their exact bytes. */
export function buildConfirmValue(input: ConfirmValueInput): { ok: true; value: ResearchAutomationSourceConfirmRequest } | { ok: false; code: 'NO_PRINCIPAL_PRODUCTS' } {
  const selected = [...new Set(input.principalProductIds)].slice(0, MAX_PRINCIPAL_CARDS);
  if (selected.length === 0) return { ok: false, code: 'NO_PRINCIPAL_PRODUCTS' };
  const definition = (input.description ?? '').trim() || input.keyword.normalize('NFC').trim();
  return { ok: true, value: {
    contractVersion: 'research-automation-confirm-v2', requestKey: autorunRequestKey(input.runId, 'confirm'), expectedRevision: input.expectedRevision,
    definition, includeTerms: uniqueTerms(input.includeTerms), excludeTerms: [], selectedProductIds: selected, peerProductIds: [],
    exactShopeeUrls: [...new Set(input.exactShopeeUrls)].slice(0, AUTORUN_MAX_SHOPEE_LINKS),
    sources: { metric: { decision: 'USE_PREPARED', packageId: input.packageId }, nativeReview:
      input.exactShopeeUrls.length > 0 && Number.isInteger(input.testReviewCap) && input.testReviewCap! >= 1 && input.testReviewCap! <= 20
        ? { decision: 'COLLECT_EXACT_TEST', maxReviewsPerProduct: input.testReviewCap! } : 'SKIP' },
  } };
}

export function buildRevisionValue(input: { runId: string; previousPairId: string }): AutomationMarketPresentationRevisionRequest {
  return { contractVersion: 'automation-market-presentation-revision-v1', requestKey: autorunRequestKey(input.runId, 'revision'),
    previousPairId: input.previousPairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
}

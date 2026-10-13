import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/foundation/shopee-listing-request.schema.json' with { type: 'json' };
import collectionSchema from '../../../contracts/foundation/shopee-collection.schema.json' with { type: 'json' };
import rowsSchema from '../../../contracts/foundation/apify-shopee-rows.schema.json' with { type: 'json' };
import type { ShopeeListingRequest } from '../../../contracts/foundation/shopee-listing-request.generated.js';
import type { ShopeeCollection } from '../../../contracts/foundation/shopee-collection.generated.js';
import type { ApifyShopeeRows } from '../../../contracts/foundation/apify-shopee-rows.generated.js';
import { canonicalJson } from './canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const requestValidator = ajv.compile(requestSchema);
const collectionValidator = ajv.compile(collectionSchema);
const rowValidator = ajv.compile(rowsSchema.items);

export const MAX_PRODUCTS = 5;
export const MAX_COMMENTS = 500;
export type SelectedListing = ShopeeCollection['selected'][number];
export type ProviderReview = ApifyShopeeRows[number];
export const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value), 'utf8');

export function parseJsonBytes(bytes: Uint8Array, maxBytes = 8 * 1024 * 1024): unknown {
  if (bytes.byteLength > maxBytes) throw new Error('Input exceeds byte limit');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Invalid UTF-8 JSON'); }
}

export function validateListingRequest(value: unknown): ShopeeListingRequest {
  if (!requestValidator(value)) throw new Error('Invalid listing request: ' + ajv.errorsText(requestValidator.errors));
  const request = value as unknown as ShopeeListingRequest;
  if (Date.parse(request.period.start) > Date.parse(request.period.end)) throw new Error('Period start is after end');
  return request;
}

export function validateCollection(value: unknown): ShopeeCollection {
  if (!collectionValidator(value)) throw new Error('Invalid collection: ' + ajv.errorsText(collectionValidator.errors));
  return value as unknown as ShopeeCollection;
}

export function validProviderRow(value: unknown): value is ProviderReview {
  return Boolean(rowValidator(value));
}

export function listingKey(row: { platform: string; shopId: string; itemId: string }): string {
  return [row.platform, row.shopId, row.itemId].join(':');
}

export function shopeeUrlMatches(row: { productUrl: string | null; shopId: string; itemId: string }): boolean {
  if (!row.productUrl) return false;
  try {
    const url = new URL(row.productUrl);
    if (url.protocol !== 'https:' || !['shopee.vn', 'www.shopee.vn'].includes(url.hostname) ||
        url.username || url.password || url.port || url.hash || url.search) return false;
    const match = url.pathname.match(/-i\.([1-9][0-9]*)\.([1-9][0-9]*)\/?$/) ??
      url.pathname.match(/^\/product\/([1-9][0-9]*)\/([1-9][0-9]*)\/?$/);
    return match?.[1] === row.shopId && match[2] === row.itemId;
  } catch { return false; }
}

export function selectShopeeListings(request: ShopeeListingRequest): {
  selected: SelectedListing[]; warnings: string[];
} {
  // Revalidate callers that did not enter through the CLI.
  validateListingRequest(request);
  const warnings: string[] = [];
  const seen = new Map<string, string>();
  const groups = new Map<string, ShopeeListingRequest['listings']>();
  for (const row of request.listings) {
    if (row.platform !== 'shopee') continue;
    const key = listingKey(row);
    const identity = canonicalJson(row);
    if (seen.has(key)) {
      if (seen.get(key) !== identity) throw new Error('Conflicting listing identity: ' + key);
      continue;
    }
    seen.set(key, identity);
    if (!row.productKey || !row.groupingBasis?.trim()) {
      warnings.push(key + ': grouping_unconfirmed'); continue;
    }
    const group = groups.get(row.productKey) ?? [];
    group.push(row);
    groups.set(row.productKey, group);
  }
  const candidates: SelectedListing[] = [];
  for (const [key, group] of groups) {
    if (group.some(row => row.periodRevenueVnd === null || row.revenuePrecision !== 'exact')) {
      warnings.push(key + ': comparable_exact_period_revenue_missing'); continue;
    }
    group.sort((a, b) => compareRevenue(a.periodRevenueVnd!, b.periodRevenueVnd!));
    const highest = group[0]!;
    if (group[1]?.periodRevenueVnd === highest.periodRevenueVnd) {
      warnings.push(key + ': representative_revenue_tie_requires_confirmation'); continue;
    }
    // Do not silently replace the top listing with a lower-revenue valid URL.
    if (!shopeeUrlMatches(highest)) {
      warnings.push(key + ': representative_url_missing_or_mismatched'); continue;
    }
    candidates.push(highest as SelectedListing);
  }
  candidates.sort((a, b) => compareRevenue(a.periodRevenueVnd, b.periodRevenueVnd) ||
    a.productKey.localeCompare(b.productKey, 'en'));

  // The ranking remains the authority for order, but a high-ranking product
  // cannot consume a second slot for its shop or stored brand. Continue down
  // the ranking after every skipped row; never use a repeated shop as a fill.
  const selected: SelectedListing[] = [];
  const shops = new Set<string>();
  const brands = new Set<string>();
  for (const candidate of candidates) {
    const shop = normalizedSelectionKey(candidate.shopId);
    const brand = typeof candidate.brand === 'string' ? normalizedSelectionKey(candidate.brand) : '';
    if (shops.has(shop) || (brand !== '' && brands.has(brand))) continue;
    selected.push(candidate);
    shops.add(shop);
    if (brand !== '') brands.add(brand);
    if (selected.length === MAX_PRODUCTS) break;
  }

  const boundary = selected[MAX_PRODUCTS - 1];
  const boundaryIndex = boundary === undefined ? -1 : candidates.indexOf(boundary);
  if (boundary !== undefined && candidates.slice(boundaryIndex + 1).some(row => row.periodRevenueVnd === boundary.periodRevenueVnd)) {
    const tiedRevenue = boundary.periodRevenueVnd;
    selected.splice(0, selected.length, ...selected.filter(row => row.periodRevenueVnd !== tiedRevenue));
    warnings.push('top_five_boundary_revenue_tie_requires_confirmation');
  }
  if (selected.length < MAX_PRODUCTS) {
    warnings.push('fewer_than_five_resolved_products');
    warnings.push('fewer_than_five_diverse_products');
  }
  return { selected, warnings: warnings.sort() };
}

/** Comparison key for owner diversity rules: trim, NFC-normalize and case-fold. */
function normalizedSelectionKey(value: string): string {
  return value.trim().normalize('NFC').toLocaleLowerCase('und').normalize('NFC');
}

function compareRevenue(a: string, b: string): number {
  return BigInt(a) === BigInt(b) ? 0 : BigInt(a) > BigInt(b) ? -1 : 1;
}

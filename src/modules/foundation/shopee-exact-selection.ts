import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/foundation/shopee-exact-request.schema.json' with { type: 'json' };
import collectionSchema from '../../../contracts/foundation/shopee-exact-collection.schema.json' with { type: 'json' };
import legacyRequestSchema from '../../../contracts/foundation/shopee-listing-request.schema.json' with { type: 'json' };
import legacyCollectionSchema from '../../../contracts/foundation/shopee-collection.schema.json' with { type: 'json' };
import type { ShopeeExactRequest } from '../../../contracts/foundation/shopee-exact-request.generated.js';
import type { ShopeeExactCollection } from '../../../contracts/foundation/shopee-exact-collection.generated.js';
import { shopeeUrlMatches } from './shopee-selection.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(legacyRequestSchema, 'shopee-listing-request.schema.json');
ajv.addSchema(legacyCollectionSchema, 'shopee-collection.schema.json');
const requestValidator = ajv.compile<ShopeeExactRequest>(requestSchema);
const collectionValidator = ajv.compile<ShopeeExactCollection>(collectionSchema);

export function validateExactShopeeRequest(value: unknown): ShopeeExactRequest {
  if (!requestValidator(value)) throw new Error('Invalid exact Shopee request');
  return value;
}

export function validateExactShopeeCollection(value: unknown): ShopeeExactCollection {
  if (!collectionValidator(value)) throw new Error('Invalid exact Shopee collection');
  return value;
}

/** Parses an owner-supplied identity; does not attest the listing exists or its price/period. */
export function selectExactShopeeListings(input: ShopeeExactRequest): {
  selected: ShopeeExactCollection['selected']; warnings: string[];
} {
  const request = validateExactShopeeRequest(input);
  const seen = new Set<string>();
  const selected = request.productUrls.map(submittedUrl => {
    let url: URL;
    try { url = new URL(submittedUrl); } catch { throw new Error('Invalid exact Shopee URL'); }
    if (submittedUrl !== submittedUrl.trim() || url.protocol !== 'https:' ||
      !['shopee.vn', 'www.shopee.vn'].includes(url.hostname) || url.username || url.password || url.port || url.hash) {
      throw new Error('Invalid exact Shopee URL authority');
    }
    const match = url.pathname.match(/-i\.([1-9][0-9]{0,19})\.([1-9][0-9]{0,19})\/?$/) ??
      url.pathname.match(/^\/product\/([1-9][0-9]{0,19})\/([1-9][0-9]{0,19})\/?$/);
    if (!match) throw new Error('Exact Shopee URL lacks shop/item identity');
    const shopId = match[1]!; const itemId = match[2]!;
    const key = `${shopId}:${itemId}`;
    if (seen.has(key)) throw new Error('Duplicate exact Shopee listing identity');
    seen.add(key);
    const row = { platform: 'shopee' as const, shopId, itemId,
      productUrl: `https://shopee.vn/product/${shopId}/${itemId}`, submittedUrl };
    if (!shopeeUrlMatches(row)) throw new Error('Exact Shopee URL identity mismatch');
    return row;
  });
  return { selected, warnings: ['owner_url_identity_not_provider_verification', 'listing_level_reviews_not_selected_variant', 'review_dates_not_constrained_by_listing_selection'] };
}

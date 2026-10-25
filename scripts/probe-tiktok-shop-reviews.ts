import fs from 'node:fs/promises';
import path from 'node:path';
import { createKalodataProvider } from '../src/modules/analysis/research-automation/provider-kalodata.js';
import { defaultProviderTransport } from '../src/modules/analysis/research-automation/provider-common.js';
import { createTikTokShopReviewsSource, tiktokShopReviewsDocument, TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS } from '../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

// S06 live harness: paid, at most three points. No database write. Prints counts only, never review text or the key.
const USAGE = 'Usage: tsx scripts/probe-tiktok-shop-reviews.ts --product-id <digits> [--product-id <digits> ...] --max-points <1-3> --out <dir>';

function parseArgs(argv: readonly string[]): { productIds: string[]; maxPoints: number; out: string } {
  const productIds: string[] = [];
  let maxPoints: number | null = null, out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (value === undefined) throw new Error(USAGE);
    if (flag === '--product-id') {
      if (!/^\d{1,32}$/.test(value)) throw new Error('--product-id must be digits');
      productIds.push(value);
    } else if (flag === '--max-points') {
      if (!/^\d+$/.test(value)) throw new Error('--max-points must be a whole number');
      maxPoints = Number(value);
    } else if (flag === '--out') out = value;
    else throw new Error(USAGE);
    i++;
  }
  if (maxPoints === null || out === null || productIds.length === 0) throw new Error(USAGE);
  if (maxPoints < 1 || maxPoints > TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS) throw new Error(`--max-points must be 1 to ${TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS}`);
  if (new Set(productIds).size !== productIds.length) throw new Error('--product-id values must be distinct');
  if (productIds.length > TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS) throw new Error(`At most ${TIKTOK_SHOP_REVIEWS_MAX_PRODUCTS} products`);
  // One point per product call: the product count may not exceed the point cap.
  if (productIds.length > maxPoints) throw new Error('More products than --max-points allows (1 point per product)');
  return { productIds, maxPoints, out };
}

async function main(): Promise<void> {
  const { productIds, maxPoints, out } = parseArgs(process.argv.slice(2));
  const key = process.env.TDN_KALODATA_SECRET_KEY;
  if (!key || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) throw new Error('TDN_KALODATA_SECRET_KEY is not set or malformed');
  const provider = createKalodataProvider(key, defaultProviderTransport);
  const balanceBefore = await provider.creditBalance();
  console.log(`balance_before=${balanceBefore ?? 'unobserved'}`);
  if (balanceBefore === null) { console.log('skip_reason=PROVIDER_FAILED (balance not observed; no paid call made)'); process.exitCode = 2; return; }
  if (balanceBefore < productIds.length) { console.log('skip_reason=CREDIT_EXHAUSTED (balance below planned points; no paid call made)'); process.exitCode = 2; return; }
  const collection = await createTikTokShopReviewsSource(provider).collect({ reports: ['INSIGHT'],
    candidates: productIds.map(productId => ({ productId, revenue: null })) });
  const document = tiktokShopReviewsDocument(collection);
  const directory = path.resolve(out);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'tiktok-shop-reviews.json');
  await fs.writeFile(file, canonicalJson(document) + '\n', { mode: 0o600 });
  const credits = collection.result?.usage.credits;
  const observed = credits?.status === 'OBSERVED_ACCOUNT_BALANCE_DELTA' ? credits : null;
  for (const product of document.products)
    console.log(`product=${product.productId} outcome=${product.outcome} reviews=${product.reviewCount} reviews_with_text=${product.reviews.filter(row => row.text !== null).length} provider_points=${product.points.length}`);
  console.log(`status=${document.status} skip_reason=${document.skipReason ?? 'none'}`);
  console.log(`paid_requests=${collection.result?.usage.paidRequestsIssued ?? 0} ambiguous_paid_requests=${collection.result?.usage.ambiguousPaidRequests ?? 0}`);
  console.log(`points_used=${observed ? observed.consumed : credits?.status === 'NONE_USED' ? 0 : 'unknown'} cap=${maxPoints}`);
  console.log(`balance_after=${observed ? observed.after : credits?.status === 'NONE_USED' ? balanceBefore : 'unobserved'}`);
  console.log(`document_written=${path.basename(file)}`);
  if (observed && observed.consumed > maxPoints) { console.log('WARNING points_used above cap (account-wide balance may include concurrent use)'); process.exitCode = 3; }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Probe failed'); process.exitCode = 1; });

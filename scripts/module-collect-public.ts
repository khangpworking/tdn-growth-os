import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ShopeePublicReviewCollector, ShopeePublicReviewError, validatePublicEnvelope, type PublicCollectedPages } from '../src/platform/collectors/shopee-public-reviews.js';
import type { ShopeeTransportListing } from '../src/platform/collectors/apify-shopee.js';
import { shopeePublicReviewConfigFromEnv } from '../src/modules/analysis/research-automation/providers.js';
import { classifyPublicExactShopee, countReviewsPerListing } from '../src/modules/analysis/research-automation/exact-shopee-outcome.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import rowsSchema from '../contracts/foundation/shopee-public-rows.schema.json' with { type: 'json' };
import type { ShopeePublicRows } from '../contracts/foundation/shopee-public-rows.generated.js';
import { atomicJson, failureResult, hashFile, ModuleError, object, prerequisite, readJson, readRequest, repoRoot, safePath, validateModuleValue } from './module-pick.js';

export interface CollectDependencies {
  runDir: string;
  collector?: Pick<ShopeePublicReviewCollector, 'collect'>;
}
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
const validRows = ajv.compile<ShopeePublicRows>(rowsSchema);
async function writable(): Promise<void> {
  const state = process.env.SHOPEE_FLOW_STATE ?? join(homedir(), '.local/state/tdn-growth-os');
  if (process.env.TDN_SHOPEE_FLOW_READONLY === '1') throw new ModuleError('READONLY_ON');
  try { await access(join(state, 'shopee-flow/READONLY')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new ModuleError('READONLY_ON');
}
function publicRows(collected: PublicCollectedPages): ShopeePublicRows {
  const envelopes = collected.envelopes.map(validatePublicEnvelope);
  if (envelopes.length !== collected.pages.length) throw new ModuleError('SHOPEE_REVIEW_INVALID_RESPONSE');
  let offset = 0;
  for (let i = 0; i < envelopes.length; i++) {
    const page = collected.pages[i]!, rows = envelopes[i]!.rows;
    if (page.offset !== offset || canonicalJson(JSON.parse(page.bytes.toString('utf8'))) !== canonicalJson(rows))
      throw new ModuleError('SHOPEE_REVIEW_INVALID_RESPONSE');
    offset += rows.length;
  }
  // mapPublicReviewResult, called inside the app collector, already produced these rows.
  const rows = envelopes.flatMap(e => e.rows);
  if (!validRows(rows)) throw new ModuleError('SHOPEE_REVIEW_INVALID_RESPONSE');
  return rows;
}
export async function main(deps: CollectDependencies) {
  const run = resolve(deps.runDir);
  const confirmedSourceSetSha256 = await prerequisite(run, 'm2');
  // An injected collector never constructs a live client or reads credentials.
  if (!deps.collector) await writable();
  const request = await readRequest(run);
  const selection = object(await readJson(run, 'm2/selection.json'));
  await validateModuleValue('selection-v1', selection);
  if (selection.runId !== basename(run)) throw new ModuleError('MODULE_INPUT_INVALID');
  const selected: ShopeeTransportListing[] = (selection.links as unknown[]).map(value => {
    const link = object(value);
    if (link.productBaseId !== `1__${link.itemId}__${link.shopId}` || link.url !== `https://shopee.vn/product/${link.shopId}/${link.itemId}`)
      throw new ModuleError('MODULE_INPUT_INVALID');
    return { platform: 'shopee', shopId: link.shopId as string, itemId: link.itemId as string, productUrl: link.url as string };
  });
  const requestSha256 = await hashFile(run, 'request.json');
  const config = object(await readJson(repoRoot, 'skills/tdn-shopee-flow/modules.json'));
  const handover = object(config.params).handToOwnerCodes as string[];
  let verdict: string, errorCode: string | null, rows: ShopeePublicRows = [];
  try {
    let collector = deps.collector;
    if (!collector) {
      // Use the app's env parser, at execution time only. Never read another process's
      // environment or a credential file. The launching owner supplies these env vars.
      const configuration = shopeePublicReviewConfigFromEnv(process.env);
      if (!configuration) throw new ModuleError('COLLECTOR_NOT_CONFIGURED');
      collector = new ShopeePublicReviewCollector({ token: configuration.token, baseUrl: configuration.baseUrl,
        maxReviewsPerProduct: request.reviewCapPerLink, confirmedSourceSetSha256,
        journalRoot: await safePath(run, 'm3-journal') });
    }
    const collected = await collector.collect(selected, requestSha256, basename(run));
    if (collected.confirmedSourceSetSha256 !== confirmedSourceSetSha256 || collected.maxReviewsPerProduct !== request.reviewCapPerLink)
      throw new ModuleError('SHOPEE_REVIEW_INVALID_RESPONSE');
    const mapped = publicRows(collected);
    const counts = countReviewsPerListing(selected, collected.pages);
    verdict = classifyPublicExactShopee({ receipts: collected.listings, counts, maxReviewsPerProduct: request.reviewCapPerLink });
    errorCode = verdict === 'OK' ? null : verdict;
    rows = verdict === 'OK' ? mapped : [];
  } catch (error) {
    const candidate = error instanceof ShopeePublicReviewError || error instanceof ModuleError ? error.code : null;
    verdict = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : 'MODULE_FAILED';
    errorCode = verdict;
  }
  // Invalidate any previous success metadata before replacing rows. A crash leaves
  // a failed sidecar, never a new row array paired with an old OK outcome.
  await atomicJson(run, 'm3/outcome.json', { format: 'm3-outcome-v1', verdict: 'RUN_INTERRUPTED', errorCode: 'RUN_INTERRUPTED' });
  await atomicJson(run, 'm3/reviews.json', rows);
  await atomicJson(run, 'm3/outcome.json', { format: 'm3-outcome-v1', verdict, errorCode });
  return { format: 'module-script-result-v1', verdict: verdict === 'OK' ? 'PASS' : handover.includes(verdict) ? 'WAIT_OWNER' : 'FAIL',
    errorCode, exitCode: verdict === 'OK' ? 0 : handover.includes(verdict) ? 21 : 20, reviews: rows.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv.length === 3 ? main({ runDir: process.argv[2]! }) : Promise.reject(new ModuleError('USAGE', 2));
  void task.catch(failureResult).then(result => { process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.exitCode; });
}

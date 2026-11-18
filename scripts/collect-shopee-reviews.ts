import fs from 'node:fs/promises';
import path from 'node:path';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';
import { ApifyShopeeCollector, FixtureShopeeCollector, CollectionPendingError,
  PRODUCTION_MAX_REVIEWS_PER_PRODUCT, SMOKE_MAX_REVIEWS_PER_PRODUCT,
  type CollectedPages, type ShopeeCollector } from '../src/platform/collectors/apify-shopee.js';
import { ShopeeCollectionService } from '../src/modules/foundation/shopee-collection-service.js';
import { ShopeeReviewAnalysisService } from '../src/modules/analysis/shopee-review-service.js';
import { digest, parseJsonBytes, selectShopeeListings, validateListingRequest } from '../src/modules/foundation/shopee-selection.js';

const args = process.argv.slice(2);
try {
  if (args[0] === 'preview' && args.length === 2) {
    const bytes = await readBounded(args[1]!, 2 * 1024 * 1024);
    const request = validateListingRequest(parseJsonBytes(bytes));
    const selection = selectShopeeListings(request);
    console.log(JSON.stringify({ runKey: request.runKey, topic: request.topic, period: request.period,
      ...selection, limits: { products: 5, commentsPerProduct: 500 },
      filters: { starFilter: 'all', contentFilter: 'with comments' },
      metricLogin: 'NOT_USED_FILE_INPUT', networkCalls: 0 }, null, 2));
  } else if (args[0] === 'collect' && args.length >= 6) {
    const [_, databasePath, artifactRoot, inputPath, ...flags] = args;
    const bytes = await readBounded(inputPath!, 2 * 1024 * 1024);
    const request = validateListingRequest(parseJsonBytes(bytes));
    const selection = selectShopeeListings(request);
    let collectorMode: 'fixture' | 'live';
    let collector: ShopeeCollector | undefined;
    let maxChargeUsd: number | null = null;
    let maxReviewsPerProduct: number = PRODUCTION_MAX_REVIEWS_PER_PRODUCT;
    let contentFilter: 'all' | 'with comments' = 'with comments';
    let existingRun: { runId: string; datasetId: string } | undefined;
    if (flags.length === 2 && flags[0] === '--fixture') {
      collectorMode = 'fixture';
      if (selection.selected.length) collector = new FixtureShopeeCollector(await readBounded(flags[1]!, 8 * 1024 * 1024));
    } else if ([3, 5, 11].includes(flags.length) && flags[0] === '--live' &&
        flags[1] === '--max-charge-usd') {
      collectorMode = 'live';
      maxChargeUsd = Number(flags[2]);
      if (!Number.isFinite(maxChargeUsd) || maxChargeUsd <= 0 || maxChargeUsd > 10_000) {
        throw new Error('Live collection requires a positive approved charge cap at most 10000 USD');
      }
      if (flags.length >= 5) {
        if (flags[3] !== '--smoke-max-reviews' || Number(flags[4]) !== SMOKE_MAX_REVIEWS_PER_PRODUCT ||
            selection.selected.length !== 1) {
          throw new Error('The isolated smoke configuration requires exactly one listing and --smoke-max-reviews 20');
        }
        maxReviewsPerProduct = SMOKE_MAX_REVIEWS_PER_PRODUCT;
      }
      if (flags.length === 11) {
        if (flags[5] !== '--existing-run' || flags[7] !== '--dataset' || flags[9] !== '--content-filter' || flags[10] !== 'all') {
          throw new Error('Existing smoke verification requires --existing-run <id> --dataset <id> --content-filter all');
        }
        existingRun = { runId: flags[6]!, datasetId: flags[8]! };
        contentFilter = 'all';
      }
    } else throw new Error('Choose --fixture <rows.json> OR --live --max-charge-usd <approved-cap> [--smoke-max-reviews 20] [--existing-run <id> --dataset <id> --content-filter all]');
    const { db } = openDatabase({ databasePath: path.resolve(databasePath!) });
    try {
      const artifacts = new ContentAddressedArtifactStore(path.resolve(artifactRoot!));
      const foundation = new ShopeeCollectionService(db, artifacts);
      let collection = await foundation.existing(bytes, collectorMode);
      if (collection && (collection.packet.actor.settings.maxReviewsPerProduct !== maxReviewsPerProduct ||
          collection.packet.actor.settings.maxChargeUsd !== maxChargeUsd ||
          collection.packet.actor.settings.contentFilter !== contentFilter ||
          (existingRun !== undefined && (collection.packet.actor.runId !== existingRun.runId ||
            collection.packet.actor.datasetId !== existingRun.datasetId)))) {
        throw new Error('Existing collection uses different run identity or settings; use an isolated run key and storage');
      }
      if (!collection || collectorMode === 'fixture') {
        if (selection.selected.length && collectorMode === 'live') collector = new ApifyShopeeCollector({
          token: process.env.TDN_APIFY_TOKEN ?? '', maxChargeUsd: maxChargeUsd!, maxReviewsPerProduct,
          contentFilter, ...(existingRun ? { existingRun } : {}),
          journalRoot: path.join(path.resolve(artifactRoot!), 'apify-receipts'),
        });
        const collected: CollectedPages = selection.selected.length
          ? await collector!.collect(selection.selected, digest(bytes), request.runKey)
          : { mode: collectorMode, pages: [], warnings: ['no_eligible_listings_no_provider_call'],
              actor: {
                actorId: 'zen-studio/shopee-product-reviews-scraper',
                settings: { maxReviewsPerProduct, starFilter: 'all', contentFilter,
                  maxChargeUsd },
                inputSha256: '0'.repeat(64), runId: null, datasetId: null, buildId: null, status: 'NOT_STARTED',
                retrievedAt: new Date().toISOString(), providerTotalRows: null, usageTotalUsd: null,
                stopReason: 'not_started_no_eligible_listings',
              } };
        collection = await foundation.save(bytes, collected);
      }
      const analysis = new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation,
        ...(process.env.TDN_PYTHON ? { pythonExecutable: process.env.TDN_PYTHON } : {}) });
      const output = await analysis.analyze(collection.packet.collectionId);
      console.log(JSON.stringify({ collectionId: collection.packet.collectionId, collectionSha256: collection.sha256,
        resultSha256: output.sha256, deduplicated: output.deduplicated, summary: output.result.summary,
        charge: { approvedCapUsd: collection.packet.actor.settings.maxChargeUsd,
          providerUsageTotalUsd: collection.packet.actor.usageTotalUsd },
        metricLogin: 'NOT_USED_FILE_INPUT' }, null, 2));
    } finally { db.close(); }
  } else {
    throw new Error('Usage: npm run research:shopee -- preview <listings.json> OR collect <db.sqlite> <artifacts> <listings.json> --fixture <rows.json> OR collect <db.sqlite> <artifacts> <listings.json> --live --max-charge-usd <cap> [--smoke-max-reviews 20] [--existing-run <id> --dataset <id> --content-filter all]');
  }
} catch (error) {
  console.error(error instanceof CollectionPendingError ? 'PENDING: ' + error.message :
    error instanceof Error ? error.message : 'Collection failed');
  process.exitCode = error instanceof CollectionPendingError ? 3 : 1;
}

async function readBounded(file: string, max: number): Promise<Buffer> {
  if ((await fs.stat(file)).size > max) throw new Error('Input file exceeds size limit');
  return fs.readFile(file);
}

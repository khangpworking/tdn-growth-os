import fs from 'node:fs/promises';
import path from 'node:path';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';
import { ApifyShopeeCollector, FixtureShopeeCollector, CollectionPendingError, type CollectedPages, type ShopeeCollector } from '../src/platform/collectors/apify-shopee.js';
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
    if (flags.length === 2 && flags[0] === '--fixture') {
      collectorMode = 'fixture';
      if (selection.selected.length) collector = new FixtureShopeeCollector(await readBounded(flags[1]!, 8 * 1024 * 1024));
    } else if (flags.length === 3 && flags[0] === '--live' && flags[1] === '--max-charge-usd') {
      collectorMode = 'live';
      maxChargeUsd = Number(flags[2]);
      if (!Number.isFinite(maxChargeUsd) || maxChargeUsd <= 0 || maxChargeUsd > 10_000) {
        throw new Error('Live collection requires a positive approved charge cap at most 10000 USD');
      }
    } else throw new Error('Choose --fixture <rows.json> OR --live --max-charge-usd <approved-cap>');
    const { db } = openDatabase({ databasePath: path.resolve(databasePath!) });
    try {
      const artifacts = new ContentAddressedArtifactStore(path.resolve(artifactRoot!));
      const foundation = new ShopeeCollectionService(db, artifacts);
      let collection = await foundation.existing(bytes, collectorMode);
      if (!collection || collectorMode === 'fixture') {
        if (selection.selected.length && collectorMode === 'live') collector = new ApifyShopeeCollector({
          token: process.env.TDN_APIFY_TOKEN ?? '', maxChargeUsd: maxChargeUsd!,
          journalRoot: path.join(path.resolve(artifactRoot!), 'apify-receipts'),
        });
        const collected: CollectedPages = selection.selected.length
          ? await collector!.collect(selection.selected, digest(bytes), request.runKey)
          : { mode: collectorMode, pages: [], warnings: ['no_eligible_listings_no_provider_call'],
              actor: {
                actorId: 'zen-studio/shopee-product-reviews-scraper',
                settings: { maxReviewsPerProduct: 500, starFilter: 'all', contentFilter: 'with comments',
                  maxChargeUsd },
                inputSha256: '0'.repeat(64), runId: null, datasetId: null, buildId: null, status: 'NOT_STARTED',
                retrievedAt: new Date().toISOString(), providerTotalRows: null,
                stopReason: 'not_started_no_eligible_listings',
              } };
        collection = await foundation.save(bytes, collected);
      }
      const analysis = new ShopeeReviewAnalysisService({ db, artifactStore: artifacts, reader: foundation,
        ...(process.env.TDN_PYTHON ? { pythonExecutable: process.env.TDN_PYTHON } : {}) });
      const output = await analysis.analyze(collection.packet.collectionId);
      console.log(JSON.stringify({ collectionId: collection.packet.collectionId, collectionSha256: collection.sha256,
        resultSha256: output.sha256, deduplicated: output.deduplicated, summary: output.result.summary,
        metricLogin: 'NOT_USED_FILE_INPUT' }, null, 2));
    } finally { db.close(); }
  } else {
    throw new Error('Usage: npm run research:shopee -- preview <listings.json> OR collect <db.sqlite> <artifacts> <listings.json> --fixture <rows.json> OR collect <db.sqlite> <artifacts> <listings.json> --live --max-charge-usd <cap>');
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

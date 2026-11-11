import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { ShopeeCollectionService } from '../foundation/shopee-collection-service.js';
import { SourcePackageService } from '../foundation/source-package-service.js';
import { CONTEXT_PATH, MAX_METRIC_CAPTURE_BYTES, MAX_METRIC_CAPTURE_TOTAL_BYTES, captureContextRawRefs } from '../analysis/research-automation/metric-capture-intake.js';
import { assertAttributesShape } from './attributes-shape.js';
import { registerManifest } from '../../platform/artifacts/register-manifest.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { assertReviewDataWritable, reviewArchive, reviewDataHash, validateReviewData, type VerifiedModuleReviewCollection } from '../foundation/shopee-module-review-data.js';
import type { ReviewDataSaved } from '../../../contracts/foundation/shopee-module-review-data.generated.js';
import { ModuleError } from '../../../scripts/module-pick.js';

/**
 * Rows inserted by one call. reviewsAlreadyPresent: stored reviews this call newly linked to the run (0 on a same-run reload).
 * productNameSources: product_name_source rows inserted (also for a product of this run stored before that table).
 * ratingInvalid: inserted reviews whose star was missing or invalid (stored with rating_star NULL, state VALID).
 */
export interface RawDbLoadResult {
  runId: string; collectionId: string; captures: number; products: number; productNameSources: number;
  reviewsInserted: number; reviewsAlreadyPresent: number; runReviewsInserted: number; ratingInvalid: number;
}

/** A Metric product name and the record it was read from (raw-responses artifact + JSON path of the record). */
interface MetricName { name: string; artifactSha256: string; jsonPath: string }

const SOURCE = 'S05';
const OPERATION = 'shopee.public_reviews.listing';
// response_sha256 is the listing's resultSha256: the digest of the app's retained result envelope, not of provider bytes.
const SHA_BASIS = 'RETAINED_ENVELOPE';

/**
 * Copies the Shopee public reviews (S05) of one research-automation run into the db-v1 tables
 * (raw_capture, product, review, run_review). Reads the run's collection only through the verified
 * public reader; a review already stored is never re-inserted (first version wins). One transaction.
 */
export async function loadShopeeReviewsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, { runId }: { runId: string }): Promise<RawDbLoadResult> {
  const row = db.prepare('SELECT collection_id FROM foundation_shopee_collections WHERE run_key=?').get(`auto-${runId}`) as { collection_id: string } | undefined;
  if (!row) throw new Error(`RAW_DB_RUN_NOT_FOUND: no Shopee review collection for run ${runId}`);
  const source = await new ShopeeCollectionService(db, artifacts).readPublicExact(row.collection_id);
  const { packet } = source;

  const captures: (string | number | null)[][] = [];
  const products = new Map<string, { itemId: string; shopId: string; productUrl: string; captureId: string }>();
  const reviews = new Map<string, (string | number | null)[]>();
  const ratingInvalid = new Set<string>();
  let envelopeIndex = 0;
  packet.listings.forEach((listing, index) => {
    const envelope = listing.resultSha256 ? source.envelopes[envelopeIndex++] : undefined;
    const rows = envelope?.rows ?? [];
    const captureId = `${SOURCE}:${packet.collectionId}:${index}`;
    captures.push([captureId, runId, SOURCE, packet.providerId, OPERATION,
      JSON.stringify({ collectionId: packet.collectionId, itemId: listing.itemId, shopId: listing.shopId, productUrl: listing.productUrl, jobId: listing.jobId,
        maxReviewsPerProduct: packet.maxReviewsPerProduct, selectionBasis: packet.selectionBasis, mode: packet.mode, requestCount: listing.requestCount, usageTotalUsd: packet.usageTotalUsd }),
      listing.attemptedAt || packet.attemptedAt, listing.observedAt, listing.complete ? (rows.length > 0 ? 'OK' : 'EMPTY') : 'FAILED',
      'USD', null, listing.resultSha256, `artifact:${source.sha256}#listing=${index}`, listing.resultSha256 === null ? null : SHA_BASIS]);
    const productKey = `shopee:${listing.itemId}`;
    if (!products.has(productKey)) {
      const selected = packet.selected.find(s => s.itemId === listing.itemId && s.shopId === listing.shopId);
      products.set(productKey, { itemId: listing.itemId, shopId: listing.shopId, productUrl: selected?.productUrl ?? listing.productUrl, captureId });
    }
    for (const review of rows) {
      // db-v1 requires the native identity; fail the whole load rather than silently omit a row.
      if (review.reviewId === null) throw new Error(`RAW_DB_REVIEW_ID_MISSING: ${captureId} row ${review.sourceRow}`);
      const reviewKey = `${SOURCE}:${review.reviewId}`;
      if (reviews.has(reviewKey)) continue;
      const attributesJson = review.attributes.length ? JSON.stringify(review.attributes) : null;
      assertAttributesShape(SOURCE, attributesJson, `${captureId} row ${review.sourceRow}`);
      // review.state is the review's own state; a missing or invalid star is only rating_star NULL (counted in ratingInvalid).
      const validStar = review.ratingState === 'VALID' ? review.ratingStar : null;
      if (validStar === null) ratingInvalid.add(reviewKey);
      reviews.set(reviewKey, [reviewKey, SOURCE, 'shopee', 'product_review', review.reviewId, `shopee:${review.itemId}`, null, null, null, 'not_provided',
        validStar, review.comment, review.variation, attributesJson, vietnamTime(review.createdAt),
        null, null, null, null, 'VALID', listing.observedAt, captureId, `page=${review.sourcePage ?? ''},row=${review.sourceRow}`]);
    }
  });

  // A product of this run stored before product_name_source existed gets only its missing provenance row.
  const stored = db.prepare(`SELECT p.product_name name, c.run_id runId, s.product_key provenance FROM product p
    JOIN raw_capture c ON c.capture_id=p.first_capture_id LEFT JOIN product_name_source s ON s.product_key=p.product_key WHERE p.product_key=?`);
  const plannedProducts = [...products].map(([key, p]) => ({ key, p, stored: stored.get(key) as { name: string; runId: string | null; provenance: string | null } | undefined }));
  const missing = plannedProducts.filter(x => !x.stored);
  const unsourced = plannedProducts.filter(x => x.stored && x.stored.runId === runId && x.stored.provenance === null);
  const names = missing.length || unsourced.length ? await metricProductNames(db, artifacts, runId) : new Map<string, MetricName>();
  const recordedAt = vietnamTime(new Date().toISOString())!;
  const sourceRow = (key: string, n: MetricName) => [key, 'METRIC_LIST', n.artifactSha256, null, n.jsonPath, recordedAt];
  const productRows = missing.map(({ key, p }) => {
    const found = names.get(`1__${p.itemId}__${p.shopId}`);
    if (!found) throw new Error(`RAW_DB_PRODUCT_NAME_MISSING: no product name for ${key}`);
    return [key, 'shopee', p.itemId, p.shopId, found.name, p.productUrl, p.captureId];
  });
  const sourceRows = missing.map(({ key, p }) => sourceRow(key, names.get(`1__${p.itemId}__${p.shopId}`)!));
  for (const { key, p, stored: row } of unsourced) {
    const found = names.get(`1__${p.itemId}__${p.shopId}`);
    if (!found) continue; // no record of the stored name in this run: provenance stays unknown
    if (found.name !== row!.name) throw new Error(`RAW_DB_PRODUCT_NAME_MISMATCH: ${key} is stored with another name than this run's record`);
    sourceRows.push(sourceRow(key, found));
  }

  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,request_params_json,requested_at,completed_at,outcome,cost_unit,cost_amount,response_sha256,raw_path,
    response_sha256_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertProduct = db.prepare(`INSERT INTO product(product_key,platform,item_id,shop_id,product_name,product_url,first_capture_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertReview = db.prepare(`INSERT INTO review(review_key,source_code,platform,kind,external_id,product_key,video_url,reviewer_key,reviewer_name,reviewer_name_state,
    rating_star,text,variation,attributes_json,posted_at,like_count,reply_count,replies_to_external_id,media_count,state,collected_at,capture_id,source_position)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const insertRunReview = db.prepare('INSERT INTO run_review(run_id,review_key,capture_id,source_position) VALUES (?,?,?,?) ON CONFLICT DO NOTHING');
  const insertSource = db.prepare('INSERT INTO product_name_source(product_key,source_kind,artifact_sha256,capture_id,json_path,recorded_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING');
  return db.transaction((): RawDbLoadResult => {
    const result: RawDbLoadResult = { runId, collectionId: packet.collectionId, captures: 0, products: 0, productNameSources: 0,
      reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0, ratingInvalid: 0 };
    for (const values of captures) result.captures += insertCapture.run(...values).changes;
    for (const values of productRows) result.products += insertProduct.run(...values).changes;
    for (const values of sourceRows) result.productNameSources += insertSource.run(...values).changes;
    for (const values of reviews.values()) {
      const inserted = insertReview.run(...values).changes;
      if (inserted && ratingInvalid.has(values[0] as string)) result.ratingInvalid++;
      // run_review keeps this run's capture and position, even when the review row is from an earlier run.
      const linked = insertRunReview.run(runId, values[0], values[21], values[22]).changes;
      result.reviewsInserted += inserted;
      result.runReviewsInserted += linked;
      // An earlier version this call newly links to the run; a same-run reload links nothing and counts 0.
      if (!inserted && linked) result.reviewsAlreadyPresent++;
    }
    return result;
  })();
}

/**
 * Product names of the run's Metric capture rows, keyed by product_base_id (`1__<itemId>__<shopId>`), each with the
 * raw-responses artifact and the JSON path (for example `$[206].body.data.products[2]`) of the record it was read from.
 */
async function metricProductNames(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<Map<string, MetricName>> {
  const names = new Map<string, MetricName>();
  const autorun = db.prepare('SELECT package_id FROM research_automation_autorun WHERE run_id=?').get(runId) as { package_id: string | null } | undefined;
  if (!autorun?.package_id) return names;
  const pkg = await new SourcePackageService({ db, artifactStore: artifacts })
    .readVerified(autorun.package_id, { maxFileBytes: MAX_METRIC_CAPTURE_BYTES, maxTotalBytes: MAX_METRIC_CAPTURE_TOTAL_BYTES + 128 * 1024 });
  const context = pkg.files.find(file => file.path === CONTEXT_PATH);
  const refs = context ? captureContextRawRefs(JSON.parse(context.bytes.toString('utf8')) as Record<string, unknown>) : null;
  // The last ref is the capture the run used; earlier captures only fill names it lacks.
  for (const ref of [...refs ?? []].reverse()) {
    const bytes = await artifacts.read(ref.sha256, { maxBytes: MAX_METRIC_CAPTURE_BYTES });
    if (bytes.byteLength !== ref.byteSize) throw new Error('Stored raw-responses artifact differs from its capture reference.');
    const stack: { node: unknown; path: string }[] = [{ node: JSON.parse(bytes.toString('utf8')), path: '$' }];
    while (stack.length) {
      const { node, path } = stack.pop()!;
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { node.forEach((item, i) => stack.push({ node: item, path: `${path}[${i}]` })); continue; }
      const record = node as Record<string, unknown>;
      const id = record.product_base_id, name = record.product_name;
      if (typeof id === 'string' && typeof name === 'string' && name.trim() && !names.has(id)) names.set(id, { name: name.trim(), artifactSha256: ref.sha256, jsonPath: path });
      for (const [key, value] of Object.entries(record)) stack.push({ node: value, path: `${path}${/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`}` });
    }
  }
  return names;
}

/** ISO 8601 in Asia/Ho_Chi_Minh (+07:00, no daylight saving); other offsets and Z are converted. */
export function vietnamTime(value: string | null): string | null {
  if (value === null || value.endsWith('+07:00')) return value;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const local = new Date(ms + 7 * 3_600_000).toISOString();
  return `${local.slice(0, 19)}${local.slice(19, 23) === '.000' ? '' : local.slice(19, 23)}+07:00`;
}

export interface ModuleProductName { name: string; bytes: Buffer; jsonPath: string }
export function moduleImportReceipt(db: Database.Database, source: VerifiedModuleReviewCollection): ReviewDataSaved | null {
  const row = db.prepare('SELECT * FROM raw_db_module_review_import WHERE source_sha256=?').get(source.sourceSha256) as
    { import_policy_version: string; module_run_id: string; source_kind: string; attempt_id: string|null; dataset_id: string; archive_sha256: string; row_count: number|bigint; receipt_json: string } | undefined;
  if (!row) return null;
  const receipt = validateReviewData<ReviewDataSaved>('saved',JSON.parse(row.receipt_json));
  if (row.import_policy_version !== 'module-m3-s05-v1' || row.module_run_id !== source.runId || row.source_kind !== source.kind || row.attempt_id !== source.attemptId ||
      row.archive_sha256 !== reviewDataHash(canonicalJson(reviewArchive(source))) ||
      Number(row.row_count) !== source.rows.length || receipt.sourceSha256 !== source.sourceSha256 || receipt.datasetId !== row.dataset_id || receipt.rowCount !== source.rows.length)
    throw new ModuleError('DB_IMPORT_CONFLICT');
  return { ...receipt, reviewsInserted:0, reviewsAlreadyPresent:source.rows.length, runReviewsInserted:0, reused:true };
}
export function assertModuleImportable(db: Database.Database, source: VerifiedModuleReviewCollection, names: ReadonlyMap<string,ModuleProductName>): void {
  if (source.gateVerdict !== 'PASS' || source.status !== 'SUCCEEDED') throw new ModuleError('REVIEW_SOURCE_NOT_DB_ELIGIBLE');
  for (const link of source.links) {
    if (!source.collectedAt.has(link.url)) throw new ModuleError('COLLECTION_TIME_UNAVAILABLE');
    const stored = db.prepare('SELECT item_id,shop_id,product_name FROM product WHERE product_key=?').get(`shopee:${link.itemId}`) as {item_id:string;shop_id:string|null;product_name:string}|undefined;
    if (stored && (stored.item_id !== link.itemId || stored.shop_id !== link.shopId)) throw new ModuleError('DB_IMPORT_CONFLICT');
    if (!stored && !names.has(`1__${link.itemId}__${link.shopId}`)) throw new ModuleError('PRODUCT_NAME_PROVENANCE_MISSING');
  }
  const seen = new Set<string>();
  for (const row of source.rows) {
    if (!row.reviewId || seen.has(row.reviewId) || !source.links.some(link=>link.itemId===row.itemId&&link.shopId===row.shopId&&link.url===row.sourceUrl)) throw new ModuleError('DB_IMPORT_CONFLICT'); seen.add(row.reviewId);
    const stored = db.prepare('SELECT product_key FROM review WHERE review_key=?').get(`S05:${row.reviewId}`) as {product_key:string}|undefined;
    if (stored && stored.product_key !== `shopee:${row.itemId}`) throw new ModuleError('DB_IMPORT_CONFLICT');
  }
}
/** Owning S05 persistence-only entry point. No collection, labelling, filtering or snapshot side effect. */
export async function loadModuleShopeeReviewsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore,
  source: VerifiedModuleReviewCollection, names: ReadonlyMap<string,ModuleProductName>): Promise<ReviewDataSaved> {
  assertModuleImportable(db,source,names);
  const prior = moduleImportReceipt(db,source); if (prior) return prior;
  const archive = await artifacts.put(Buffer.from(canonicalJson(reviewArchive(source))));
  const nameArtifacts = new Map<string,Awaited<ReturnType<ContentAddressedArtifactStore['put']>>>();
  for (const [id,name] of names) nameArtifacts.set(id,await artifacts.put(name.bytes));
  await assertReviewDataWritable();
  const importedAt = new Date().toISOString(), datasetId = `module-m3:${source.runId}:${source.sourceSha256}`;
  return db.transaction((): ReviewDataSaved => {
    const repeated = moduleImportReceipt(db,source); if (repeated) return repeated;
    assertModuleImportable(db,source,names);
    registerManifest(db,archive,importedAt);
    for (const artifact of nameArtifacts.values()) registerManifest(db,artifact,importedAt);
    const result: ReviewDataSaved = {format:'review-data-saved-v1',runId:source.runId,sourceSha256:source.sourceSha256,datasetId,importPolicyVersion:'module-m3-s05-v1',
      importedAt,rowCount:source.rows.length,reviewsInserted:0,reviewsAlreadyPresent:0,runReviewsInserted:0,firstVersionDiffers:0,reused:false};
    for (const [index,link] of source.links.entries()) {
      const captureId = `S05:module:${source.sourceSha256}:${index}`;
      const collectedAt = source.collectedAt.get(link.url)!;
      db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,request_params_json,requested_at,completed_at,outcome,response_sha256,raw_path,response_sha256_basis)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(captureId,datasetId,'S05','shopee-public-review','shopee.module_reviews.import',
        canonicalJson({moduleRunId:source.runId,sourceSha256:source.sourceSha256,attemptId:source.attemptId,planSha256:source.planSha256,
          requestSha256:source.requestSha256,m2Digest:source.m2Digest,link,collectionTimeBasis:source.kind==='legacy'?'retained-observed-at':'provider-terminal-updated-at',importedAt}),
        collectedAt,collectedAt,link.actual===0?'EMPTY':'OK',archive.sha256,`artifact:${archive.sha256}`,'RETAINED_ENVELOPE');
      const productKey = `shopee:${link.itemId}`, name = names.get(`1__${link.itemId}__${link.shopId}`);
      if (!db.prepare('SELECT 1 FROM product WHERE product_key=?').get(productKey)) {
        if (!name) throw new ModuleError('PRODUCT_NAME_PROVENANCE_MISSING');
        const nameArtifact = nameArtifacts.get(`1__${link.itemId}__${link.shopId}`)!;
        db.prepare('INSERT INTO product(product_key,platform,item_id,shop_id,product_name,product_url,first_capture_id) VALUES (?,?,?,?,?,?,?)')
          .run(productKey,'shopee',link.itemId,link.shopId,name.name,link.url,captureId);
        db.prepare('INSERT INTO product_name_source(product_key,source_kind,artifact_sha256,capture_id,json_path,recorded_at) VALUES (?,?,?,?,?,?)')
          .run(productKey,'APP_CAPTURE',nameArtifact.sha256,null,name.jsonPath,importedAt);
      }
      for (const row of source.rows.filter(row => row.shopId === link.shopId && row.itemId === link.itemId)) {
        const reviewKey = `S05:${row.reviewId}`, attributesJson = row.attributes.length ? JSON.stringify(row.attributes) : null;
        assertAttributesShape('S05',attributesJson,captureId);
        const old = db.prepare('SELECT text,attributes_json,rating_star,posted_at,variation FROM review WHERE review_key=?').get(reviewKey) as
          {text:string|null;attributes_json:string|null;rating_star:number|bigint|null;posted_at:string|null;variation:string|null}|undefined;
        if (old && (old.text !== row.comment || old.attributes_json !== attributesJson || (old.rating_star===null?null:Number(old.rating_star)) !== row.ratingStar ||
            old.posted_at !== vietnamTime(row.createdAt) || old.variation !== row.variation)) result.firstVersionDiffers++;
        const inserted = db.prepare(`INSERT INTO review(review_key,source_code,platform,kind,external_id,product_key,reviewer_name_state,rating_star,text,variation,attributes_json,posted_at,state,collected_at,capture_id,source_position)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(review_key) DO NOTHING`).run(reviewKey,'S05','shopee','product_review',row.reviewId,productKey,'not_provided',
          row.ratingState==='VALID'?row.ratingStar:null,row.comment,row.variation,attributesJson,vietnamTime(row.createdAt),'VALID',collectedAt,captureId,`page=${row.sourcePage??''},row=${row.sourceRow}`).changes;
        result.reviewsInserted += inserted; if (!inserted) result.reviewsAlreadyPresent++;
        result.runReviewsInserted += db.prepare('INSERT INTO run_review(run_id,review_key,capture_id,source_position) VALUES (?,?,?,?)').run(datasetId,reviewKey,captureId,`page=${row.sourcePage??''},row=${row.sourceRow}`).changes;
      }
    }
    validateReviewData('saved',result);
    db.prepare(`INSERT INTO raw_db_module_review_import(source_sha256,import_policy_version,module_run_id,source_kind,attempt_id,dataset_id,archive_sha256,row_count,imported_at,receipt_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(source.sourceSha256,'module-m3-s05-v1',source.runId,source.kind,source.attemptId,datasetId,archive.sha256,source.rows.length,importedAt,canonicalJson(result));
    return result;
  }).immediate();
}

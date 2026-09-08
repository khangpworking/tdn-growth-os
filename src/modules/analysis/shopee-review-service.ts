import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import resultSchema from '../../../contracts/analysis/shopee-review-result.schema.json' with { type: 'json' };
import type { ShopeeReviewResult } from '../../../contracts/analysis/shopee-review-result.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { registerManifest } from '../../platform/artifacts/register-manifest.js';
import type { ShopeeCollectionReader, VerifiedShopeeCollection } from '../foundation/shopee-collection-service.js';
import { digest, jsonBytes, listingKey, parseJsonBytes, validProviderRow } from '../foundation/shopee-selection.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(resultSchema);
const validateReviews = ajv.compile(resultSchema.properties.reviews);
const FILTER_PATH = fileURLToPath(new URL('../../../scripts/filter-shopee-reviews.py', import.meta.url));
const FILTER_VERSION = 'shopee-calcium-v3-adapter1' as const;
type Review = ShopeeReviewResult['reviews'][number];
interface FilterInput {
  id: string; product: string; listingKey: string; star: number; text: string;
  rawPageSha256: string; rawRowIndex: number;
}

export class ShopeeReviewAnalysisService {
  constructor(readonly options: {
    db: Database.Database; artifactStore: ContentAddressedArtifactStore;
    reader: ShopeeCollectionReader; pythonExecutable?: string;
  }) {}

  async analyze(collectionId: string): Promise<{ result: ShopeeReviewResult; sha256: string; deduplicated: boolean }> {
    const source = await this.options.reader.read(collectionId);
    const filterSha256 = digest(await fs.readFile(FILTER_PATH));
    const normalized = normalize(source);
    const existing = this.options.db.prepare(
      'SELECT artifact_sha256, created_at FROM analysis_shopee_review_results WHERE collection_id=? AND filter_sha256=?',
    ).get(collectionId, filterSha256) as { artifact_sha256: string; created_at: string } | undefined;
    if (existing) {
      const bytes = await this.options.artifactStore.read(existing.artifact_sha256);
      const result = parseJsonBytes(bytes, 128 * 1024 * 1024);
      if (!validate(result)) throw new Error('Invalid persisted filter result');
      const typed = result as unknown as ShopeeReviewResult;
      assertFilterLineage(typed.reviews, normalized.rows);
      const expectedSummary = buildSummary(source, normalized, typed.reviews);
      if (!jsonBytes(typed).equals(bytes) || typed.collectionId !== collectionId ||
          typed.collectionSha256 !== source.sha256 || typed.filterSha256 !== filterSha256 ||
          typed.createdAt !== existing.created_at || !jsonBytes(typed.summary).equals(jsonBytes(expectedSummary))) {
        throw new Error('Filter result replay mismatch');
      }
      const artifact = this.options.db.prepare('SELECT byte_size, media_type, relative_path, contract_version FROM artifact_manifests WHERE sha256=?')
        .get(existing.artifact_sha256) as { byte_size: bigint; media_type: string; relative_path: string; contract_version: string } | undefined;
      if (!artifact || BigInt(artifact.byte_size) !== BigInt(bytes.length) || artifact.media_type !== 'application/json' ||
          artifact.contract_version !== '1.0.0' ||
          artifact.relative_path !== 'sha256/' + existing.artifact_sha256.slice(0, 2) + '/' + existing.artifact_sha256) {
        throw new Error('Filter artifact metadata mismatch');
      }
      return { result: typed, sha256: existing.artifact_sha256, deduplicated: true };
    }
    const output = await runFilter(normalized.rows, this.options.pythonExecutable ?? (process.platform === 'win32' ? 'python' : 'python3'));
    if (!validateReviews(output)) throw new Error('Filter output violates result contract');
    const reviews = output as Review[];
    assertFilterLineage(reviews, normalized.rows);
    const result: ShopeeReviewResult = {
      contractVersion: '1.0.0', collectionId, collectionSha256: source.sha256,
      filterVersion: FILTER_VERSION, filterSha256, createdAt: new Date().toISOString(),
      summary: buildSummary(source, normalized, reviews), reviews,
    };
    if (!validate(result)) throw new Error('Invalid filter result: ' + ajv.errorsText(validate.errors));
    const stored = await this.options.artifactStore.put(jsonBytes(result));
    this.options.db.transaction(() => {
      registerManifest(this.options.db, stored, result.createdAt);
      this.options.db.prepare(`INSERT INTO analysis_shopee_review_results
        (collection_id, filter_sha256, artifact_sha256, created_at) VALUES (?, ?, ?, ?)`)
        .run(collectionId, filterSha256, stored.sha256, result.createdAt);
    })();
    return { result, sha256: stored.sha256, deduplicated: false };
  }
}

function normalize(source: VerifiedShopeeCollection): {
  rows: FilterInput[]; invalidRows: number; duplicateRows: number; warnings: string[];
  rawRowsByListing: ReadonlyMap<string, number>;
} {
  const selected = new Map(source.packet.selected.map(row => [listingKey(row), row]));
  const perListingLimit = source.packet.actor.settings.maxReviewsPerProduct;
  const rows = new Map<string, FilterInput>();
  const seen = new Map<string, string>();
  const conflicts = new Set<string>();
  const consumed = new Map<string, number>();
  const rawRowsByListing = new Map<string, number>();
  let invalidRows = 0;
  let duplicateRows = 0;
  const warnings = new Set<string>();
  for (const page of source.pages) {
    const values = parseJsonBytes(page.bytes) as unknown[];
    for (const [index, value] of values.entries()) {
      const rawKey = rawListingKey(value);
      if (rawKey && selected.has(rawKey)) rawRowsByListing.set(rawKey, (rawRowsByListing.get(rawKey) ?? 0) + 1);
      if (!validProviderRow(value)) { invalidRows++; warnings.add('invalid_provider_rows_excluded'); continue; }
      const key = 'shopee:' + value.shopId + ':' + value.itemId;
      const product = selected.get(key);
      if (!product || (value.region && value.region !== 'VN')) {
        invalidRows++; warnings.add('unselected_or_non_vn_listing_rows_excluded'); continue;
      }
      const used = (consumed.get(key) ?? 0) + 1;
      consumed.set(key, used);
      if (used > perListingLimit) { invalidRows++; warnings.add('per_listing_limit_exceeded'); continue; }
      const reviewKey = key + ':' + value.reviewId;
      // Preserve actor extras in raw, but only expose needed fields to the filter.
      const identity = jsonBytes(value).toString('utf8');
      if (seen.has(reviewKey)) {
        duplicateRows++;
        if (seen.get(reviewKey) !== identity) {
          conflicts.add(reviewKey); rows.delete(reviewKey); warnings.add('conflicting_review_ids_excluded');
        }
        continue;
      }
      seen.set(reviewKey, identity);
      if (!conflicts.has(reviewKey)) rows.set(reviewKey, {
        id: String(value.reviewId), product: product.productKey, listingKey: key,
        star: value.ratingStar, text: value.comment, rawPageSha256: page.sha256, rawRowIndex: index,
      });
    }
  }
  invalidRows += conflicts.size;
  return { rows: [...rows.values()], invalidRows, duplicateRows, warnings: [...warnings].sort(), rawRowsByListing };
}

function buildSummary(source: VerifiedShopeeCollection, normalized: ReturnType<typeof normalize>, reviews: Review[]): ShopeeReviewResult['summary'] {
  const incomplete = !['FIXTURE', 'SUCCEEDED'].includes(source.packet.actor.status) ||
    source.packet.actor.stopReason === 'dataset_read_failed';
  const warnings = [...source.packet.selectionWarnings, ...source.packet.collectorWarnings, ...normalized.warnings,
    'bestseller_listing_sample_not_market_population',
    'review_dates_not_restricted_to_revenue_selection_period',
    'filter_score_is_not_confidence_or_market_sentiment',
    'E0_E5_mapping_not_calibrated'];
  const perListingLimit = source.packet.actor.settings.maxReviewsPerProduct;
  const listings = source.packet.selected.map(selected => {
    const key = listingKey(selected);
    const records = reviews.filter(row => row.listingKey === key);
    const terminalFailure = ['FAILED', 'TIMED-OUT', 'ABORTED'].includes(source.packet.actor.status);
    return { productKey: selected.productKey, listingKey: key, collected: records.length,
      kept: records.filter(row => row.decision === 'kept').length,
      status: terminalFailure ? (records.length ? 'partial' : 'failed')
        : incomplete ? (records.length ? 'partial' : 'unavailable')
          : records.length === 0 && (normalized.rawRowsByListing.get(key) ?? 0) > 0 ? 'partial'
            : records.length === 0 && source.packet.selected.length === 1 &&
              source.packet.actor.stopReason === 'dataset_exhausted' ? 'empty'
              : records.length === 0 ? 'unavailable'
                : records.length === perListingLimit ? 'sample_limit' : 'below_limit' };
  }) as ShopeeReviewResult['summary']['listings'];
  if (listings.some(row => row.collected < perListingLimit)) {
    warnings.push('fewer_than_configured_limit_valid_unique_rows_some_listings_no_backfill');
  }
  if (listings.some(row => row.status === 'empty')) warnings.push('empty_collection_does_not_prove_zero_source_reviews');
  const kept = reviews.filter(row => row.decision === 'kept').length;
  return { mode: source.packet.mode, requestedProducts: 5, maxCommentsPerProduct: perListingLimit,
    fetchedRows: source.pages.reduce((total, page) => total + (parseJsonBytes(page.bytes) as unknown[]).length, 0),
    selectedProducts: listings.length, collected: reviews.length, kept, removed: reviews.length - kept,
    invalidRows: normalized.invalidRows, duplicateRows: normalized.duplicateRows,
    providerReportedRows: source.packet.actor.providerTotalRows,
    warnings: [...new Set(warnings)].sort(), listings };
}

function assertFilterLineage(reviews: Review[], inputs: FilterInput[]): void {
  const expected = new Map(inputs.map(row => [row.listingKey + ':' + row.id, row]));
  if (reviews.length !== inputs.length) throw new Error('Filter lost input records');
  for (const review of reviews) {
    const key = review.listingKey + ':' + review.reviewId;
    const input = expected.get(key);
    if (!input || review.productKey !== input.product || review.text !== input.text ||
        review.rawPageSha256 !== input.rawPageSha256 || review.rawRowIndex !== input.rawRowIndex) throw new Error('Filter lineage mismatch');
    expected.delete(key);
  }
}

async function runFilter(rows: FilterInput[], python: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-B', FILTER_PATH], {
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        LANG: process.env.LANG ?? 'C.UTF-8',
        LC_ALL: process.env.LC_ALL ?? 'C.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure = false;
    const timer = setTimeout(() => { failure = true; child.kill(); }, 30_000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Python filter could not start; configure TDN_PYTHON')); });
    child.stdin.on('error', () => { failure = true; });
    child.stderr.resume(); // Do not surface raw data in tracebacks.
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 128 * 1024 * 1024) { failure = true; child.kill(); } else chunks.push(chunk);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || failure) { reject(new Error('Filter failed or exceeded limits')); return; }
      try { resolve(parseJsonBytes(Buffer.concat(chunks), 128 * 1024 * 1024)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(rows));
  });
}

function rawListingKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const normalizeId = (id: unknown): string | null =>
    typeof id === 'string' && /^[1-9][0-9]{0,19}$/.test(id) ? id
      : typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? String(id) : null;
  const shopId = normalizeId(record.shopId);
  const itemId = normalizeId(record.itemId);
  return shopId && itemId ? `shopee:${shopId}:${itemId}` : null;
}

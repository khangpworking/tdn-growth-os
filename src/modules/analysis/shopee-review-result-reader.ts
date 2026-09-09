import type Database from 'better-sqlite3';
import type { ShopeeReviewResult } from '../../../contracts/analysis/shopee-review-result.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import type {
  ShopeeCollectionReader,
  VerifiedShopeeCollection,
} from '../foundation/shopee-collection-service.js';
import { verifyPersistedShopeeReviewResult } from './shopee-review-service.js';

interface ResultRow {
  collection_id: string;
  filter_sha256: string;
  created_at: string;
}

export interface VerifiedShopeeReviewResult {
  readonly result: ShopeeReviewResult;
  readonly resultSha256: string;
  readonly collection: VerifiedShopeeCollection;
  readonly ratings: ReadonlyMap<string, number>;
}

export interface ShopeeReviewResultReader {
  readByDigest(resultSha256: string): Promise<VerifiedShopeeReviewResult>;
}

export class AnalysisShopeeReviewResultReader implements ShopeeReviewResultReader {
  constructor(readonly options: {
    db: Database.Database;
    artifactStore: ContentAddressedArtifactStore;
    collectionReader: ShopeeCollectionReader;
  }) {}

  async readByDigest(resultSha256: string): Promise<VerifiedShopeeReviewResult> {
    if (!/^[a-f0-9]{64}$/.test(resultSha256)) throw new Error('Invalid Result SHA-256 digest');
    const rows = this.options.db.prepare(`SELECT collection_id, filter_sha256, created_at
      FROM analysis_shopee_review_results WHERE artifact_sha256=?`).all(resultSha256) as ResultRow[];
    if (rows.length === 0) throw new Error(`Shopee analysis Result not found for digest: ${resultSha256}`);
    if (rows.length !== 1) throw new Error(`Shopee analysis Result digest is ambiguous: ${resultSha256}`);
    const row = rows[0]!;
    const collection = await this.options.collectionReader.read(row.collection_id);
    const verified = await verifyPersistedShopeeReviewResult({
      db: this.options.db,
      artifactStore: this.options.artifactStore,
      source: collection,
      resultSha256,
      row: { collectionId: row.collection_id, filterSha256: row.filter_sha256, createdAt: row.created_at },
    });
    return {
      result: verified.result,
      resultSha256,
      collection,
      ratings: new Map(verified.inputs.map(input => [input.listingKey + ':' + input.id, input.star])),
    };
  }
}

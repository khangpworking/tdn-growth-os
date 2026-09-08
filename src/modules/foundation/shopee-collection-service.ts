import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ShopeeCollection } from '../../../contracts/foundation/shopee-collection.generated.js';
import type { CollectedPages } from '../../platform/collectors/apify-shopee.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import type { StoredArtifact } from '../../platform/artifacts/artifact-store.js';
import { registerManifest } from '../../platform/artifacts/register-manifest.js';
import { digest, jsonBytes, parseJsonBytes, selectShopeeListings, validateCollection, validateListingRequest } from './shopee-selection.js';

export interface VerifiedShopeeCollection {
  packet: ShopeeCollection; sha256: string; pages: { bytes: Buffer; sha256: string; offset: number }[];
}
export interface ShopeeCollectionReader { read(id: string): Promise<VerifiedShopeeCollection> }
interface Row { collection_id: string; request_sha256: string; artifact_sha256: string; evidence_id: string; created_at: string; run_key: string }

export class ShopeeCollectionService implements ShopeeCollectionReader {
  constructor(readonly db: Database.Database, readonly artifacts: ContentAddressedArtifactStore) {}

  async existing(requestBytes: Buffer, mode: 'fixture' | 'live'): Promise<VerifiedShopeeCollection | null> {
    const request = validateListingRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    const row = this.db.prepare('SELECT * FROM foundation_shopee_collections WHERE run_key=?').get(request.runKey) as Row | undefined;
    if (!row) return null;
    if (row.request_sha256 !== digest(requestBytes)) throw new Error('Run key already used for different input bytes');
    const verified = await this.read(row.collection_id);
    if (verified.packet.mode !== mode) throw new Error('Run key already used for different collection mode');
    return verified;
  }

  async save(requestBytes: Buffer, collected: CollectedPages): Promise<VerifiedShopeeCollection> {
    requestBytes = Buffer.from(requestBytes);
    collected = { ...structuredClone({ mode: collected.mode, actor: collected.actor, warnings: collected.warnings }),
      pages: collected.pages.map(page => ({ offset: page.offset, bytes: Buffer.from(page.bytes) })) };
    const request = validateListingRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    const selection = selectShopeeListings(request);
    let rows = 0;
    for (const page of collected.pages) {
      const data = parseJsonBytes(page.bytes);
      if (!Array.isArray(data) || page.offset !== rows) throw new Error('Invalid collection page or offset');
      rows += data.length;
    }
    if (rows > selection.selected.length * 500) throw new Error('Collection exceeds selected-product row budget');
    const prior = await this.existing(requestBytes, collected.mode);
    if (prior) {
      if (!jsonBytes(prior.packet.pages.map(p => ({ sha256: p.sha256, offset: p.offset })))
        .equals(jsonBytes(collected.pages.map(p => ({ sha256: digest(p.bytes), offset: p.offset })))) ||
          !jsonBytes(prior.packet.actor).equals(jsonBytes(collected.actor)) ||
          !jsonBytes(prior.packet.collectorWarnings).equals(jsonBytes(collected.warnings))) {
        throw new Error('Run key already used for different collection evidence');
      }
      return prior;
    }
    const now = new Date().toISOString();
    const packet = validateCollection({
      contractVersion: '1.0.0', collectionId: randomUUID(), runKey: request.runKey,
      requestSha256: digest(requestBytes), createdAt: now, mode: collected.mode,
      selected: selection.selected, selectionWarnings: selection.warnings, collectorWarnings: collected.warnings,
      actor: collected.actor,
      pages: collected.pages.map(p => ({ sha256: digest(p.bytes), byteSize: p.bytes.length, offset: p.offset })),
    });
    const requestArtifact = await this.artifacts.put(requestBytes);
    const rawArtifacts: StoredArtifact[] = [];
    for (const page of collected.pages) rawArtifacts.push(await this.artifacts.put(page.bytes));
    const packetArtifact = await this.artifacts.put(jsonBytes(packet));
    const sourceId = collected.mode === 'fixture' ? 'synthetic:shopee-reviews' : 'provider:apify-shopee-reviews';
    const evidenceId = randomUUID();
    const ingestionId = randomUUID();
    this.db.transaction(() => {
      for (const artifact of [requestArtifact, ...rawArtifacts, packetArtifact]) registerManifest(this.db, artifact, now);
      this.db.prepare(`INSERT INTO foundation_sources(source_id, source_type, display_name, created_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(source_id) DO NOTHING`)
        .run(sourceId, collected.mode === 'fixture' ? 'manual' : 'provider_api',
          collected.mode === 'fixture' ? 'Synthetic Shopee reviews' : 'Apify Shopee reviews', now);
      this.db.prepare(`INSERT INTO foundation_ingestion_runs
        (ingestion_id, source_id, idempotency_key, status, acquired_at, started_at, completed_at,
         artifact_sha256, request_sha256, contract_version)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, '1.0.0')`)
        .run(ingestionId, sourceId, request.runKey, now, now, now, packetArtifact.sha256, packet.requestSha256);
      this.db.prepare(`INSERT INTO foundation_evidence
        (evidence_id, ingestion_id, artifact_sha256, evidence_grade, evidence_grade_basis, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(evidenceId, ingestionId, packetArtifact.sha256, collected.mode === 'fixture' ? 'synthetic' : 'unverified',
          collected.mode === 'fixture' ? 'Synthetic offline fixture; no market evidence'
            : 'Third-party scraped reviews; not independently verified; E0-E5 calibration not applied', now);
      this.db.prepare(`INSERT INTO foundation_shopee_collections
        (collection_id, run_key, request_sha256, artifact_sha256, evidence_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(packet.collectionId, packet.runKey, packet.requestSha256, packetArtifact.sha256, evidenceId, now);
    })();
    return this.read(packet.collectionId);
  }

  async read(id: string): Promise<VerifiedShopeeCollection> {
    const row = this.db.prepare('SELECT * FROM foundation_shopee_collections WHERE collection_id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Collection not found');
    const bytes = await this.#verifiedArtifact(row.artifact_sha256);
    const packet = validateCollection(parseJsonBytes(bytes));
    if (!jsonBytes(packet).equals(bytes) || packet.collectionId !== row.collection_id ||
        packet.runKey !== row.run_key || packet.createdAt !== row.created_at || packet.requestSha256 !== row.request_sha256) {
      throw new Error('Collection metadata mismatch');
    }
    const requestBytes = await this.#verifiedArtifact(packet.requestSha256);
    const request = validateListingRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    const selection = selectShopeeListings(request);
    if (request.runKey !== packet.runKey || !jsonBytes(selection.selected).equals(jsonBytes(packet.selected)) ||
        !jsonBytes(selection.warnings).equals(jsonBytes(packet.selectionWarnings))) throw new Error('Selection replay mismatch');
    const evidence = this.db.prepare(`SELECT e.artifact_sha256, e.evidence_grade, i.request_sha256,
      i.idempotency_key, i.source_id, i.status FROM foundation_evidence e
      JOIN foundation_ingestion_runs i ON i.ingestion_id=e.ingestion_id WHERE e.evidence_id=?`)
      .get(row.evidence_id) as Record<string, string> | undefined;
    if (!evidence || evidence.artifact_sha256 !== row.artifact_sha256 ||
        evidence.request_sha256 !== packet.requestSha256 || evidence.idempotency_key !== packet.runKey ||
        evidence.status !== 'completed' ||
        evidence.source_id !== (packet.mode === 'fixture' ? 'synthetic:shopee-reviews' : 'provider:apify-shopee-reviews') ||
        evidence.evidence_grade !== (packet.mode === 'fixture' ? 'synthetic' : 'unverified')) throw new Error('Collection lineage mismatch');
    const pages = [];
    let offset = 0;
    for (const page of packet.pages) {
      const raw = await this.#verifiedArtifact(page.sha256);
      const values = parseJsonBytes(raw);
      if (raw.length !== page.byteSize || !Array.isArray(values) || page.offset !== offset) throw new Error('Raw page metadata mismatch');
      offset += values.length;
      pages.push({ bytes: raw, sha256: page.sha256, offset: page.offset });
    }
    if (offset > packet.selected.length * 500) throw new Error('Collection row budget mismatch');
    return { packet, sha256: row.artifact_sha256, pages };
  }

  async #verifiedArtifact(sha: string): Promise<Buffer> {
    const bytes = await this.artifacts.read(sha);
    const metadata = this.db.prepare('SELECT byte_size, media_type, relative_path, contract_version FROM artifact_manifests WHERE sha256=?')
      .get(sha) as { byte_size: bigint; media_type: string; relative_path: string; contract_version: string } | undefined;
    if (!metadata || BigInt(metadata.byte_size) !== BigInt(bytes.length) || metadata.media_type !== 'application/json' ||
        metadata.relative_path !== 'sha256/' + sha.slice(0, 2) + '/' + sha || metadata.contract_version !== '1.0.0') {
      throw new Error('Collection artifact manifest mismatch');
    }
    return bytes;
  }
}

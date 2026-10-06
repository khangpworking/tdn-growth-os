import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ShopeeCollection } from '../../../contracts/foundation/shopee-collection.generated.js';
import type { ShopeeListingRequest } from '../../../contracts/foundation/shopee-listing-request.generated.js';
import type { ShopeeExactRequest } from '../../../contracts/foundation/shopee-exact-request.generated.js';
import type { ShopeeExactCollection } from '../../../contracts/foundation/shopee-exact-collection.generated.js';
import { shopeeActorInputSha256, type CollectedPages, type ShopeeTransportListing } from '../../platform/collectors/apify-shopee.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import type { StoredArtifact } from '../../platform/artifacts/artifact-store.js';
import { registerManifest } from '../../platform/artifacts/register-manifest.js';
import { withDatabaseMutationMutex } from '../../platform/db/database-mutation-mutex.js';
import { digest, jsonBytes, parseJsonBytes, selectShopeeListings, validateCollection, validateListingRequest } from './shopee-selection.js';
import { selectExactShopeeListings, validateExactShopeeCollection, validateExactShopeeRequest } from './shopee-exact-selection.js';

export interface VerifiedShopeeCollection {
  packet: ShopeeCollection;
  request: ShopeeListingRequest;
  sha256: string;
  pages: { bytes: Buffer; sha256: string; offset: number }[];
}
export interface ShopeeCollectionReader { read(id: string): Promise<VerifiedShopeeCollection> }
export interface VerifiedExactShopeeCollection {
  packet: ShopeeExactCollection;
  request: ShopeeExactRequest;
  sha256: string;
  pages: { bytes: Buffer; sha256: string; offset: number }[];
}
type AnyRequest = ShopeeListingRequest | ShopeeExactRequest;
interface AnyVerifiedCollection {
  packet: ShopeeCollection | ShopeeExactCollection;
  request: AnyRequest;
  sha256: string;
  pages: { bytes: Buffer; sha256: string; offset: number }[];
}
interface Row { collection_id: string; request_sha256: string; artifact_sha256: string; evidence_id: string; created_at: string; run_key: string }

export class ShopeeCollectionService implements ShopeeCollectionReader {
  constructor(readonly db: Database.Database, readonly artifacts: ContentAddressedArtifactStore) {}

  async existing(requestBytes: Buffer, mode: 'fixture' | 'live'): Promise<VerifiedShopeeCollection | null> {
    validateListingRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    const prior = await this.#existingAny(requestBytes, mode);
    return prior ? legacyCollection(prior) : null;
  }

  async existingExact(requestBytes: Buffer, mode: 'fixture' | 'live'): Promise<VerifiedExactShopeeCollection | null> {
    validateExactShopeeRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    const prior = await this.#existingAny(requestBytes, mode);
    return prior ? exactCollection(prior) : null;
  }

  async #existingAny(requestBytes: Buffer, mode: 'fixture' | 'live'): Promise<AnyVerifiedCollection | null> {
    const request = readRequest(requestBytes);
    const row = this.db.prepare('SELECT * FROM foundation_shopee_collections WHERE run_key=?').get(request.runKey) as Row | undefined;
    if (!row) return null;
    if (row.request_sha256 !== digest(requestBytes)) throw new Error('Run key already used for different input bytes');
    const verified = await this.#readAny(row.collection_id);
    if (verified.packet.mode !== mode) throw new Error('Run key already used for different collection mode');
    return verified;
  }

  async save(requestBytes: Buffer, collected: CollectedPages): Promise<VerifiedShopeeCollection> {
    validateListingRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    return legacyCollection(await this.#saveAny(requestBytes, collected));
  }

  async saveExact(requestBytes: Buffer, collected: CollectedPages): Promise<VerifiedExactShopeeCollection> {
    validateExactShopeeRequest(parseJsonBytes(requestBytes, 2 * 1024 * 1024));
    const frozenBytes = Buffer.from(requestBytes);
    const frozenCollection = { ...structuredClone({ mode: collected.mode, actor: collected.actor, warnings: collected.warnings }),
      pages: collected.pages.map(page => ({ offset: page.offset, bytes: Buffer.from(page.bytes) })) };
    return withDatabaseMutationMutex(this.db, async () => exactCollection(await this.#saveAny(frozenBytes, frozenCollection)));
  }

  async #saveAny(requestBytes: Buffer, collected: CollectedPages): Promise<AnyVerifiedCollection> {
    requestBytes = Buffer.from(requestBytes);
    collected = { ...structuredClone({ mode: collected.mode, actor: collected.actor, warnings: collected.warnings }),
      pages: collected.pages.map(page => ({ offset: page.offset, bytes: Buffer.from(page.bytes) })) };
    const request = readRequest(requestBytes);
    const selection = selectRequest(request);
    assertCollectorMetadata(collected, selection.selected);
    let rows = 0;
    const perListingLimit = collected.actor.settings.maxReviewsPerProduct;
    const perListing = new Map<string, number>();
    const selectedKeys = new Set(selection.selected.map(row => row.platform + ':' + row.shopId + ':' + row.itemId));
    for (const page of collected.pages) {
      const data = parseJsonBytes(page.bytes);
      if (!Array.isArray(data) || page.offset !== rows) throw new Error('Invalid collection page or offset');
      rows += data.length;
      for (const value of data) {
        if (!value || typeof value !== 'object') continue;
        const record = value as Record<string, unknown>;
        const key = `shopee:${String(record.shopId)}:${String(record.itemId)}`;
        if (!selectedKeys.has(key)) continue;
        const count = (perListing.get(key) ?? 0) + 1;
        if (count > perListingLimit) throw new Error('Collection exceeds per-listing row budget');
        perListing.set(key, count);
      }
    }
    if (rows > selection.selected.length * perListingLimit) throw new Error('Collection exceeds selected-product row budget');
    if (collected.actor.providerTotalRows !== null && collected.actor.providerTotalRows < rows) {
      throw new Error('Provider total is below fetched rows');
    }
    const prior = await this.#existingAny(requestBytes, collected.mode);
    if (prior) {
      if (!jsonBytes(prior.packet.pages.map(p => ({ sha256: p.sha256, offset: p.offset })))
        .equals(jsonBytes(collected.pages.map(p => ({ sha256: digest(p.bytes), offset: p.offset })))) ||
          !jsonBytes(actorIdentity(prior.packet.actor)).equals(jsonBytes(actorIdentity(collected.actor))) ||
          !jsonBytes(prior.packet.collectorWarnings).equals(jsonBytes(collected.warnings))) {
        throw new Error('Run key already used for different collection evidence');
      }
      return prior;
    }
    const now = new Date().toISOString();
    const packet = readPacket({
      contractVersion: request.contractVersion,
      ...(request.contractVersion === '2.0.0' ? { selectionBasis: request.selectionBasis } : {}),
      collectionId: randomUUID(), runKey: request.runKey,
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
        VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`)
        .run(ingestionId, sourceId, request.runKey, now, now, now, packetArtifact.sha256, packet.requestSha256, packet.contractVersion);
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
    return this.#readAny(packet.collectionId);
  }

  async read(id: string): Promise<VerifiedShopeeCollection> {
    return legacyCollection(await this.#readAny(id));
  }

  async readExact(id: string): Promise<VerifiedExactShopeeCollection> {
    return exactCollection(await this.#readAny(id));
  }

  async #readAny(id: string): Promise<AnyVerifiedCollection> {
    const row = this.db.prepare('SELECT * FROM foundation_shopee_collections WHERE collection_id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Collection not found');
    const bytes = await this.#verifiedArtifact(row.artifact_sha256);
    const packet = readPacket(parseJsonBytes(bytes));
    assertCollectorMetadata({ mode: packet.mode, actor: packet.actor, warnings: packet.collectorWarnings, pages: [] }, packet.selected);
    if (!jsonBytes(packet).equals(bytes) || packet.collectionId !== row.collection_id ||
        packet.runKey !== row.run_key || packet.createdAt !== row.created_at || packet.requestSha256 !== row.request_sha256) {
      throw new Error('Collection metadata mismatch');
    }
    const requestBytes = await this.#verifiedArtifact(packet.requestSha256);
    const request = readRequest(requestBytes);
    const selection = selectRequest(request);
    if (request.contractVersion !== packet.contractVersion || request.runKey !== packet.runKey || !jsonBytes(selection.selected).equals(jsonBytes(packet.selected)) ||
        !jsonBytes(selection.warnings).equals(jsonBytes(packet.selectionWarnings))) throw new Error('Selection replay mismatch');
    const evidence = this.db.prepare(`SELECT e.artifact_sha256, e.evidence_grade, i.request_sha256,
      i.idempotency_key, i.source_id, i.status, i.contract_version FROM foundation_evidence e
      JOIN foundation_ingestion_runs i ON i.ingestion_id=e.ingestion_id WHERE e.evidence_id=?`)
      .get(row.evidence_id) as Record<string, string> | undefined;
    if (!evidence || evidence.artifact_sha256 !== row.artifact_sha256 ||
        evidence.request_sha256 !== packet.requestSha256 || evidence.idempotency_key !== packet.runKey ||
        evidence.status !== 'completed' || evidence.contract_version !== packet.contractVersion ||
        evidence.source_id !== (packet.mode === 'fixture' ? 'synthetic:shopee-reviews' : 'provider:apify-shopee-reviews') ||
        evidence.evidence_grade !== (packet.mode === 'fixture' ? 'synthetic' : 'unverified')) throw new Error('Collection lineage mismatch');
    const pages = [];
    let offset = 0;
    const perListingLimit = packet.actor.settings.maxReviewsPerProduct;
    const perListing = new Map<string, number>();
    const selectedKeys = new Set(packet.selected.map(row => row.platform + ':' + row.shopId + ':' + row.itemId));
    for (const page of packet.pages) {
      const raw = await this.#verifiedArtifact(page.sha256);
      const values = parseJsonBytes(raw);
      if (raw.length !== page.byteSize || !Array.isArray(values) || page.offset !== offset) throw new Error('Raw page metadata mismatch');
      offset += values.length;
      for (const value of values) {
        if (!value || typeof value !== 'object') continue;
        const record = value as Record<string, unknown>;
        const key = `shopee:${String(record.shopId)}:${String(record.itemId)}`;
        if (!selectedKeys.has(key)) continue;
        const count = (perListing.get(key) ?? 0) + 1;
        if (count > perListingLimit) throw new Error('Collection per-listing row budget mismatch');
        perListing.set(key, count);
      }
      pages.push({ bytes: raw, sha256: page.sha256, offset: page.offset });
    }
    if (offset > packet.selected.length * perListingLimit) throw new Error('Collection row budget mismatch');
    if (packet.actor.providerTotalRows !== null && packet.actor.providerTotalRows < offset) {
      throw new Error('Collection provider total mismatch');
    }
    return { packet, request, sha256: row.artifact_sha256, pages };
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

function readRequest(bytes: Buffer): AnyRequest {
  const value = parseJsonBytes(bytes, 2 * 1024 * 1024);
  return typeof value === 'object' && value !== null && 'contractVersion' in value && value.contractVersion === '2.0.0'
    ? validateExactShopeeRequest(value) : validateListingRequest(value);
}

function readPacket(value: unknown): ShopeeCollection | ShopeeExactCollection {
  return typeof value === 'object' && value !== null && 'contractVersion' in value && value.contractVersion === '2.0.0'
    ? validateExactShopeeCollection(value) : validateCollection(value);
}

function selectRequest(request: AnyRequest) {
  return request.contractVersion === '2.0.0' ? selectExactShopeeListings(request) : selectShopeeListings(request);
}

function legacyCollection(value: AnyVerifiedCollection): VerifiedShopeeCollection {
  if (value.packet.contractVersion !== '1.0.0' || value.request.contractVersion !== '1.0.0') {
    throw new Error('Exact URL collection is not a revenue-ranked v1 collection');
  }
  return { ...value, packet: value.packet, request: value.request };
}

function exactCollection(value: AnyVerifiedCollection): VerifiedExactShopeeCollection {
  if (value.packet.contractVersion !== '2.0.0' || value.request.contractVersion !== '2.0.0') {
    throw new Error('Revenue-ranked collection is not an exact URL collection');
  }
  return { ...value, packet: value.packet, request: value.request };
}

function actorIdentity(actor: ShopeeCollection['actor']): Omit<ShopeeCollection['actor'], 'retrievedAt'> {
  const { retrievedAt: _, ...identity } = actor;
  return identity;
}

function assertCollectorMetadata(collected: CollectedPages, selected: readonly ShopeeTransportListing[]): void {
  const actor = collected.actor;
  if (actor.actorId !== 'zen-studio/shopee-product-reviews-scraper' ||
      !Number.isSafeInteger(actor.settings.maxReviewsPerProduct) || actor.settings.maxReviewsPerProduct < 1 ||
      actor.settings.maxReviewsPerProduct > 500 || actor.settings.starFilter !== 'all' ||
      (actor.usageTotalUsd !== null && (!Number.isFinite(actor.usageTotalUsd) || actor.usageTotalUsd < 0 ||
        actor.usageTotalUsd > 10_000)) ||
      !['all', 'with comments'].includes(actor.settings.contentFilter) ||
      (collected.mode === 'fixture' ? actor.settings.maxChargeUsd !== null
        : actor.settings.maxChargeUsd === null || !Number.isFinite(actor.settings.maxChargeUsd) ||
          actor.settings.maxChargeUsd <= 0 || actor.settings.maxChargeUsd > 10_000)) {
    throw new Error('Invalid fixed collector provenance');
  }
  const expectedInputSha256 = selected.length === 0 ? '0'.repeat(64)
    : shopeeActorInputSha256(selected, actor.settings.maxReviewsPerProduct, actor.settings.contentFilter);
  if (actor.inputSha256 !== expectedInputSha256) throw new Error('Collector input does not match selected listings');
  if (collected.mode === 'fixture') {
    if (actor.settings.maxReviewsPerProduct !== 500 || actor.runId !== null || actor.datasetId !== null || actor.buildId !== null ||
        !((actor.status === 'FIXTURE' && actor.stopReason === 'fixture_complete') ||
          (actor.status === 'FAILED' && actor.stopReason === 'actor_terminal_failed') ||
          (actor.status === 'NOT_STARTED' && actor.stopReason === 'not_started_no_eligible_listings' &&
            selected.length === 0 && collected.pages.length === 0))) {
      throw new Error('Incoherent fixture collector provenance');
    }
    return;
  }
  if (actor.status === 'NOT_STARTED' && actor.stopReason === 'not_started_no_eligible_listings' &&
      actor.runId === null && actor.datasetId === null && actor.buildId === null &&
      selected.length === 0 && collected.pages.length === 0) return;
  if (actor.runId === null || actor.datasetId === null ||
      !((actor.status === 'SUCCEEDED' && ['dataset_exhausted', 'collection_limit_reached', 'dataset_read_failed'].includes(actor.stopReason)) ||
        (actor.status === 'FAILED' && actor.stopReason === 'actor_terminal_failed') ||
        (actor.status === 'TIMED-OUT' && actor.stopReason === 'actor_terminal_timed-out') ||
        (actor.status === 'ABORTED' && actor.stopReason === 'actor_terminal_aborted'))) {
    throw new Error('Incoherent live collector provenance');
  }
}

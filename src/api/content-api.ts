import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type {
  ContentApiErrorResponse,
  ContentBrandDetailResponse,
  ContentBrandHistoryItem,
  ContentBrandListResponse,
  ContentCatalogDetailResponse,
  ContentCatalogHistoryItem,
  ContentCatalogListResponse,
  ContentPromptDetailResponse,
  ContentPromptHistoryItem,
  ContentPromptListResponse,
  ContentPromptSystemLayer,
  ContentSystemPromptDetailResponse,
} from '../../contracts/api/content-api.generated.js';
import type {
  OwnerContentApiErrorResponse,
  OwnerContentBrandReceipt,
} from '../../contracts/api/owner-content-brand-api.generated.js';
import type {
  OwnerContentCatalogItemReceipt,
  OwnerContentMediaReceipt,
  OwnerContentMediaRejection,
} from '../../contracts/api/owner-content-catalog-api.generated.js';
import type { OwnerContentPromptLifecycleReceipt, OwnerContentPromptReceipt } from '../../contracts/api/owner-content-prompt-api.generated.js';
import type { ContentPromptArtifact } from '../../contracts/flow/content-prompt-artifact.generated.js';
import type { ContentPromptContent, ContentPromptLineage, ContentPromptType } from '../../contracts/flow/content-prompt-create-request.generated.js';
import type { ContentBrandArtifact } from '../../contracts/flow/content-brand-artifact.generated.js';
import type { ContentCatalogItemArtifact } from '../../contracts/flow/content-catalog-item-artifact.generated.js';
import type { ContentCatalogItemContent } from '../../contracts/flow/content-catalog-item-create-request.generated.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../platform/db/database-mutation-mutex.js';
import { ContentBrandIdentityConflictError, ContentBrandService } from '../modules/flow/content-brand-service.js';
import { ContentCatalogIdentityConflictError, ContentCatalogService } from '../modules/flow/content-catalog-service.js';
import { CONTENT_MEDIA_LIMITS, ContentImageError, type ContentMediaKind } from '../modules/flow/content-image.js';
import { ContentMediaService, registeredContentMedia, type ContentMediaRecord } from '../modules/flow/content-media-service.js';
import { ContentPromptLibrary } from '../modules/flow/content-prompt-library.js';
import { ContentPromptConflictError, ContentPromptService } from '../modules/flow/content-prompt-service.js';
import {
  assertContentPromptContent,
  FlowValidationError,
  validateContentBrandCreateRequest,
  validateContentBrandRevisionRequest,
  validateContentCatalogItemCreateRequest,
  validateContentCatalogItemRevisionRequest,
  validateContentPromptCreateRequest,
  validateContentPromptLifecycleRequest,
  validateContentPromptRevisionRequest,
} from '../modules/flow/validation.js';
import { RequestScopedArtifactStore } from './request-scoped-artifact-store.js';
import {
  assertOwnerHttpConfiguration,
  EmptyBodyError,
  ownerAuthorized,
  ownerCors,
  PayloadTooLargeError,
  readOwnerBytes,
  sendApiJson,
  singleHeader,
  type OwnerHttpConfiguration,
} from './owner-http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const BRAND_BODY_BYTES = 16 * 1024;
const CATALOG_BODY_BYTES = 64 * 1024;
const PROMPT_BODY_BYTES = 96 * 1024;
const SYSTEM_PROMPT_ID = /^system-[a-z0-9-]{3,60}$/;
const REQUIRED_TABLES = ['artifact_manifests', 'flow_content_brands', 'flow_content_brand_revisions', 'flow_content_media', 'flow_content_catalog_items', 'flow_content_catalog_item_revisions', 'flow_content_prompts', 'flow_content_prompt_revisions', 'flow_content_prompt_lifecycle'];
const MEDIA_KINDS: Readonly<Record<string, ContentMediaKind>> = { logo: 'LOGO', photo: 'PHOTO' };

export interface ContentReadApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
  /** Clock used to decide whether deleted prompts are still restorable (tests only). */
  readonly now?: () => Date;
}
export interface ContentOwnerApiConfiguration extends OwnerHttpConfiguration {
  readonly now?: () => Date;
  readonly uuid?: () => string;
}
export interface ContentApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  close(): void;
}

interface ReadHandlers {
  list(): Promise<ContentBrandListResponse>;
  detail(brandId: string): Promise<ContentBrandDetailResponse | undefined>;
  catalogList(brandId: string): Promise<ContentCatalogListResponse | undefined>;
  catalogDetail(brandId: string, itemId: string): Promise<ContentCatalogDetailResponse | undefined>;
  media(brandId: string, mediaSha256: string): Promise<{ readonly media: ContentMediaRecord; readonly bytes: Buffer } | undefined>;
  promptList(): Promise<ContentPromptListResponse>;
  promptDetail(promptId: string): Promise<ContentPromptDetailResponse | undefined>;
  systemPrompt(id: string): Promise<ContentSystemPromptDetailResponse | undefined>;
}

function systemLayer(library: ContentPromptLibrary, promptType: ContentPromptType): ContentPromptSystemLayer {
  const layer = library.layer(promptType);
  return { promptType, version: layer.version, sha256: layer.sha256, text: layer.text };
}

/** Verified, query-only read paths for Content Studio (`/api/content/*`). */
export function openContentReadApi(configuration: ContentReadApiConfiguration): ContentApiApplication {
  if (!configuration.databasePath || !configuration.artifactRoot) throw new TypeError('Explicit databasePath and artifactRoot are required');
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertTables(db);
    const artifactStore = new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot));
    const brands = new ContentBrandService({ db, artifactStore });
    const catalog = new ContentCatalogService({ db, artifactStore });
    const media = new ContentMediaService({ db, artifactStore });
    const library = new ContentPromptLibrary();
    const prompts = new ContentPromptService({ db, artifactStore, library, ...(configuration.now ? { now: configuration.now } : {}) });
    const brandCatalog = db.prepare(`
      SELECT b.brand_id brandId, max(r.version) version
      FROM flow_content_brands b JOIN flow_content_brand_revisions r ON r.brand_id = b.brand_id
      GROUP BY b.brand_id ORDER BY b.created_at, b.brand_id
    `);
    const versions = db.prepare('SELECT version FROM flow_content_brand_revisions WHERE brand_id = ? ORDER BY version');
    const brandExists = db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?');
    const mediaExists = db.prepare('SELECT 1 FROM flow_content_media WHERE brand_id = ? AND media_sha256 = ?');

    const handlers: ReadHandlers = {
      async list() {
        const result: ContentBrandListResponse['brands'] = [];
        for (const row of brandCatalog.all() as { brandId: string; version: bigint }[]) {
          const brand = await brands.readBrand(row.brandId, Number(row.version));
          if (brand.brandId !== row.brandId || BigInt(brand.version) !== row.version) throw new Error('Brand catalog identity mismatch');
          result.push({ brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, brandName: brand.profile.brandName, updatedAt: brand.createdAt });
        }
        return { contractVersion: '1.0.0', brands: result };
      },
      async detail(brandId) {
        const rows = versions.all(brandId) as { version: bigint }[];
        if (rows.length === 0) return undefined;
        const history: ContentBrandHistoryItem[] = [];
        let latest: ContentBrandArtifact | undefined;
        for (const row of rows) {
          latest = await brands.readBrand(brandId, Number(row.version));
          history.push({ version: latest.version, brandName: latest.profile.brandName, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Brand history is empty');
        const brand = latest;
        return {
          contractVersion: '1.0.0',
          brand: {
            brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, profile: brand.profile, displayRules: brand.displayRules,
            ...(brand.logoMediaSha256 === undefined ? {} : { logoMediaSha256: brand.logoMediaSha256 }), createdAt: brand.createdAt,
          },
          history: [first, ...rest],
        };
      },
      async catalogList(brandId) {
        if (!brandExists.get(brandId)) return undefined;
        const items: ContentCatalogListResponse['items'] = [];
        for (const row of catalog.listItems(brandId)) {
          const artifact = await catalog.readItem(row.itemId, row.version);
          if (artifact.itemId !== row.itemId || artifact.brandId !== brandId || artifact.version !== row.version) throw new Error('Catalog identity mismatch');
          items.push({
            itemId: artifact.itemId, itemKey: artifact.itemKey, version: artifact.version, itemType: artifact.item.itemType, name: artifact.item.name,
            tierNames: artifact.item.tiers.map((tier) => tier.name), photoCount: artifact.item.photos.length, updatedAt: artifact.createdAt,
          });
        }
        return { contractVersion: '1.0.0', brandId, items };
      },
      async catalogDetail(brandId, itemId) {
        if (catalog.itemBrand(itemId) !== brandId) return undefined;
        const history: ContentCatalogHistoryItem[] = [];
        let latest: ContentCatalogItemArtifact | undefined;
        for (const version of catalog.itemVersions(itemId)) {
          latest = await catalog.readItem(itemId, version);
          if (latest.brandId !== brandId) throw new Error('Catalog brand mismatch');
          history.push({ version: latest.version, name: latest.item.name, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Catalog history is empty');
        return {
          contractVersion: '1.0.0',
          item: { itemId: latest.itemId, brandId: latest.brandId, itemKey: latest.itemKey, version: latest.version, item: latest.item, createdAt: latest.createdAt },
          history: [first, ...rest],
        };
      },
      async media(brandId, mediaSha256) {
        if (!mediaExists.get(brandId, mediaSha256)) return undefined;
        return media.readMedia(brandId, mediaSha256);
      },
      async promptList() {
        const systemPrompts: ContentPromptListResponse['systemPrompts'] = library.list().map((entry) => {
          library.read(entry.id, entry.version);
          return { id: entry.id, promptType: entry.promptType, version: entry.version, name: entry.name, description: entry.description, recommendedModel: entry.recommendedModel, tags: [...entry.tags], isDefault: entry.isDefault };
        });
        const summaries: ContentPromptListResponse['prompts'] = [];
        for (const row of prompts.listPrompts()) {
          const state = prompts.lifecycleState(row.promptId);
          if (state.deleted && state.expired) continue;
          const artifact = await prompts.readPrompt(row.promptId, row.version);
          summaries.push({
            promptId: artifact.promptId, promptKey: artifact.promptKey, promptType: artifact.promptType, version: artifact.version, name: artifact.prompt.name,
            recommendedModel: artifact.prompt.recommendedModel, tags: [...artifact.prompt.tags], updatedAt: artifact.createdAt, ...(state.deleted ? { deleted: state.deleted } : {}),
          });
        }
        return { contractVersion: '1.0.0', systemPrompts, prompts: summaries };
      },
      async promptDetail(promptId) {
        if (!prompts.promptExists(promptId)) return undefined;
        const history: ContentPromptHistoryItem[] = [];
        let latest: ContentPromptArtifact | undefined;
        let lineage: ContentPromptLineage | undefined;
        for (const version of prompts.promptVersions(promptId)) {
          latest = await prompts.readPrompt(promptId, version);
          if (version === 1) lineage = latest.duplicatedFrom;
          history.push({ version: latest.version, name: latest.prompt.name, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Prompt history is empty');
        const state = prompts.lifecycleState(promptId);
        return {
          contractVersion: '1.0.0',
          prompt: {
            promptId: latest.promptId, promptKey: latest.promptKey, promptType: latest.promptType, version: latest.version, prompt: latest.prompt,
            ...(lineage ? { duplicatedFrom: lineage } : {}),
            createdAt: latest.createdAt,
          },
          history: [first, ...rest],
          lifecycle: { sequence: state.sequence, ...(state.deleted ? { deleted: state.deleted } : {}) },
          systemLayer: systemLayer(library, latest.promptType),
        };
      },
      async systemPrompt(id) {
        const entry = library.find(id);
        if (!entry) return undefined;
        const { prompt } = library.read(entry.id, entry.version);
        return {
          contractVersion: '1.0.0',
          systemPrompt: { id: entry.id, promptType: entry.promptType, version: entry.version, sha256: entry.sha256, prompt, isDefault: entry.isDefault },
          systemLayer: systemLayer(library, entry.promptType),
        };
      },
    };
    const handler = (request: IncomingMessage, response: ServerResponse): void => { void routeRead(request, response, handlers); };
    return { handler, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

async function routeRead(request: IncomingMessage, response: ServerResponse, handlers: ReadHandlers): Promise<void> {
  try {
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return sendReadError(response, 405, 'method_not_allowed', 'Only GET is supported'); }
    const parts = pathParts(request.url);
    if (parts === null) return sendReadError(response, 400, 'bad_request', 'Malformed request URL');
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'prompts' && parts.length <= 4) {
      if (parts.length === 3) return sendApiJson(response, 200, await handlers.promptList());
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Prompt ID must be a UUID');
      const result = await handlers.promptDetail(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Prompt not found');
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'system-prompts' && parts.length === 4) {
      if (!SYSTEM_PROMPT_ID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'System prompt ID is invalid');
      const result = await handlers.systemPrompt(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'System prompt not found');
    }
    if (parts[0] !== 'api' || parts[1] !== 'content' || parts[2] !== 'brands') return sendReadError(response, 404, 'not_found', 'Route not found');
    if (parts.length === 3) return sendApiJson(response, 200, await handlers.list());
    const brandId = parts[3]!;
    if (!UUID.test(brandId)) return sendReadError(response, 400, 'bad_request', 'Brand ID must be a UUID');
    if (parts.length === 4) {
      const result = await handlers.detail(brandId);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Brand not found');
    }
    if (parts[4] === 'catalog' && parts.length === 5) {
      const result = await handlers.catalogList(brandId);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Brand not found');
    }
    if (parts[4] === 'catalog' && parts.length === 6) {
      if (!UUID.test(parts[5]!)) return sendReadError(response, 400, 'bad_request', 'Item ID must be a UUID');
      const result = await handlers.catalogDetail(brandId, parts[5]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Catalog item not found');
    }
    if (parts[4] === 'media' && parts.length === 6) {
      if (!SHA256.test(parts[5]!)) return sendReadError(response, 400, 'bad_request', 'Media ID must be a SHA-256 digest');
      const result = await handlers.media(brandId, parts[5]!);
      if (!result) return sendReadError(response, 404, 'not_found', 'Media not found');
      response.writeHead(200, {
        'Content-Type': result.media.mediaType,
        'Content-Length': result.bytes.byteLength,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      response.end(result.bytes);
      return;
    }
    return sendReadError(response, 404, 'not_found', 'Route not found');
  } catch {
    return sendReadError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

class UnknownBrandError extends Error {}
class UnknownItemError extends Error {}
class InvalidReferenceError extends Error {}
class UnknownPromptError extends Error {}
class InvalidPromptRequestError extends Error {}
class ExistingContentIntegrityError extends Error {}

type OwnerRoute =
  | { readonly kind: 'brand-create' }
  | { readonly kind: 'brand-revision'; readonly brandId: string }
  | { readonly kind: 'media'; readonly brandId: string; readonly mediaKind: ContentMediaKind }
  | { readonly kind: 'item-create'; readonly brandId: string }
  | { readonly kind: 'item-revision'; readonly brandId: string; readonly itemId: string }
  | { readonly kind: 'prompt-create' }
  | { readonly kind: 'prompt-revision'; readonly promptId: string }
  | { readonly kind: 'prompt-lifecycle'; readonly promptId: string };

interface OwnerWriters {
  brand(serviceRequest: Record<string, unknown>, revision: boolean): Promise<OwnerContentBrandReceipt>;
  media(brandId: string, kind: ContentMediaKind, declaredType: string, bytes: Buffer): Promise<OwnerContentMediaReceipt>;
  item(serviceRequest: Record<string, unknown>, brandId: string, itemId: string | undefined): Promise<OwnerContentCatalogItemReceipt>;
  prompt(serviceRequest: Record<string, unknown>, promptId: string | undefined): Promise<OwnerContentPromptReceipt>;
  promptLifecycle(serviceRequest: Record<string, unknown>): Promise<OwnerContentPromptLifecycleReceipt>;
}

/** OWNER write paths for Content Studio (`/owner-api/content/*`). */
export function openContentOwnerApi(configuration: ContentOwnerApiConfiguration): ContentApiApplication {
  assertOwnerHttpConfiguration(configuration);
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertTables(db);
    const artifacts = new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot));
    const clock = {
      ...(configuration.now ? { now: configuration.now } : {}),
      ...(configuration.uuid ? { uuid: configuration.uuid } : {}),
    };
    const brands = new ContentBrandService({ db, artifactStore: artifacts, ...clock });
    const catalog = new ContentCatalogService({ db, artifactStore: artifacts, ...clock });
    const media = new ContentMediaService({ db, artifactStore: artifacts, ...(configuration.now ? { now: configuration.now } : {}) });
    const library = new ContentPromptLibrary();
    const prompts = new ContentPromptService({ db, artifactStore: artifacts, library, ...clock });
    const brandExists = db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?');
    const brandHistory = db.prepare('SELECT version FROM flow_content_brand_revisions WHERE brand_id = ? ORDER BY version');

    const integrity = async <T>(operation: () => Promise<T>): Promise<T> => {
      try { return await operation(); } catch { throw new ExistingContentIntegrityError(); }
    };
    const verifyBrandHistory = (brandId: string) => integrity(async () => {
      const rows = brandHistory.all(brandId) as { version: bigint }[];
      for (const [index, row] of rows.entries()) {
        if (row.version !== BigInt(index + 1)) throw new Error('Brand history is not sequential');
        await brands.readBrand(brandId, index + 1);
      }
    });
    const verifyItemHistory = (itemId: string) => integrity(async () => {
      for (const [index, version] of catalog.itemVersions(itemId).entries()) {
        if (version !== index + 1) throw new Error('Catalog history is not sequential');
        await catalog.readItem(itemId, version);
      }
    });
    const verifyPromptHistory = (promptId: string) => integrity(async () => {
      for (const [index, version] of prompts.promptVersions(promptId).entries()) {
        if (version !== index + 1) throw new Error('Prompt history is not sequential');
        await prompts.readPrompt(promptId, version);
      }
    });
    const assertPromptReferences = (type: ContentPromptType, prompt: ContentPromptContent, lineage: ContentPromptLineage | undefined) => {
      try { assertContentPromptContent(type, prompt); } catch { throw new InvalidPromptRequestError(); }
      if (!lineage) return;
      const known = lineage.kind === 'SYSTEM'
        ? library.find(lineage.id, lineage.version)?.promptType === type
        : prompts.promptTypeOf(lineage.id) === type && prompts.promptVersions(lineage.id).includes(lineage.version);
      if (!known) throw new InvalidPromptRequestError();
    };
    const verifyMedia = async (brandId: string, kind: ContentMediaKind, digests: readonly string[]) => {
      for (const digest of digests) if (!registeredContentMedia(db, brandId, kind, digest)) throw new InvalidReferenceError();
      await integrity(async () => { for (const digest of digests) await media.verifyRegistered(brandId, kind, digest); });
    };

    const writers: OwnerWriters = {
      brand: (serviceRequest, revision) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (revision && !brandExists.get(serviceRequest.brandId)) throw new UnknownBrandError();
        await brands.restoreExactArtifact(serviceRequest);
        if (revision) {
          await verifyBrandHistory(serviceRequest.brandId as string);
          if (typeof serviceRequest.logoMediaSha256 === 'string') await verifyMedia(serviceRequest.brandId as string, 'LOGO', [serviceRequest.logoMediaSha256]);
        }
        const result = revision ? await brands.reviseBrand(serviceRequest) : await brands.createBrand(serviceRequest);
        if (!revision && result.deduplicated) await verifyBrandHistory(result.brandId);
        await artifacts.publishOwned();
        const verified = await integrity(() => brands.readBrand(result.brandId, result.version));
        return {
          contractVersion: '1.0.0', brandId: verified.brandId, brandKey: verified.brandKey, version: verified.version,
          brandName: verified.profile.brandName, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      media: (brandId, kind, declaredType, bytes) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (!brandExists.get(brandId)) throw new UnknownBrandError();
        await verifyBrandHistory(brandId);
        const result = await media.registerMedia({ brandId, kind, declaredType, bytes });
        await artifacts.publishOwned();
        await integrity(() => media.verifyRegistered(brandId, kind, result.mediaSha256));
        return {
          contractVersion: '1.0.0', brandId, mediaKind: kind, mediaSha256: result.mediaSha256, mediaType: result.mediaType,
          width: result.width, height: result.height, byteSize: result.byteSize, exactRetry: result.exactRetry,
        };
      })),
      item: (serviceRequest, brandId, itemId) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (!brandExists.get(brandId)) throw new UnknownBrandError();
        if (itemId !== undefined && catalog.itemBrand(itemId) !== brandId) throw new UnknownItemError();
        await verifyBrandHistory(brandId);
        await catalog.restoreExactArtifact(serviceRequest);
        if (itemId !== undefined) await verifyItemHistory(itemId);
        const content = serviceRequest.item as ContentCatalogItemContent;
        await verifyMedia(brandId, 'PHOTO', content.photos.map((photo) => photo.mediaSha256));
        const result = itemId === undefined ? await catalog.createItem(serviceRequest) : await catalog.reviseItem(serviceRequest);
        if (itemId === undefined && result.deduplicated) await verifyItemHistory(result.itemId);
        await artifacts.publishOwned();
        const verified = await integrity(() => catalog.readItem(result.itemId, result.version));
        return {
          contractVersion: '1.0.0', brandId: verified.brandId, itemId: verified.itemId, itemKey: verified.itemKey, version: verified.version,
          name: verified.item.name, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      prompt: (serviceRequest, promptId) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        const type = promptId === undefined ? serviceRequest.promptType as ContentPromptType : prompts.promptTypeOf(promptId);
        if (!type) throw new UnknownPromptError();
        assertPromptReferences(type, serviceRequest.prompt as ContentPromptContent, serviceRequest.duplicatedFrom as ContentPromptLineage | undefined);
        await prompts.restoreExactArtifact(serviceRequest);
        if (promptId !== undefined) await verifyPromptHistory(promptId);
        const lineage = serviceRequest.duplicatedFrom as ContentPromptLineage | undefined;
        if (lineage?.kind === 'USER') await integrity(() => prompts.readPrompt(lineage.id, lineage.version));
        if (lineage?.kind === 'SYSTEM') await integrity(async () => library.read(lineage.id, lineage.version));
        const result = promptId === undefined ? await prompts.createPrompt(serviceRequest) : await prompts.revisePrompt(serviceRequest);
        if (promptId === undefined && result.deduplicated) await verifyPromptHistory(result.promptId);
        await artifacts.publishOwned();
        const verified = await integrity(() => prompts.readPrompt(result.promptId, result.version));
        return {
          contractVersion: '1.0.0', promptId: verified.promptId, promptKey: verified.promptKey, promptType: verified.promptType, version: verified.version,
          name: verified.prompt.name, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      promptLifecycle: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
        const promptId = serviceRequest.promptId as string;
        if (!prompts.promptExists(promptId)) throw new UnknownPromptError();
        await verifyPromptHistory(promptId);
        const result = await prompts.changeLifecycle(serviceRequest);
        return {
          contractVersion: '1.0.0', promptId: result.promptId, sequence: result.sequence, action: result.action, createdAt: result.createdAt,
          ...(result.restorableUntil ? { restorableUntil: result.restorableUntil } : {}), exactRetry: result.deduplicated,
        };
      }),
    };

    const handler = (request: IncomingMessage, response: ServerResponse): void => { void routeOwner(request, response, configuration, writers); };
    return { handler, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

function ownerRoute(parts: string[] | null): OwnerRoute | 'invalid-id' | null {
  if (parts !== null && parts[0] === 'owner-api' && parts[1] === 'content' && parts[2] === 'prompts') {
    if (parts.length === 3) return { kind: 'prompt-create' };
    if (parts.length !== 5 || (parts[4] !== 'revisions' && parts[4] !== 'lifecycle')) return null;
    if (!UUID.test(parts[3]!)) return 'invalid-id';
    return parts[4] === 'revisions' ? { kind: 'prompt-revision', promptId: parts[3]! } : { kind: 'prompt-lifecycle', promptId: parts[3]! };
  }
  if (parts === null || parts[0] !== 'owner-api' || parts[1] !== 'content' || parts[2] !== 'brands') return null;
  if (parts.length === 3) return { kind: 'brand-create' };
  const brandId = parts[3]!;
  const shape = parts.slice(4).join('/');
  const known = shape === 'revisions' || shape === 'catalog' || (parts.length === 6 && parts[4] === 'media' && parts[5]! in MEDIA_KINDS) || (parts.length === 7 && parts[4] === 'catalog' && parts[6] === 'revisions');
  if (!known) return null;
  if (!UUID.test(brandId)) return 'invalid-id';
  if (shape === 'revisions') return { kind: 'brand-revision', brandId };
  if (shape === 'catalog') return { kind: 'item-create', brandId };
  if (parts[4] === 'media') return { kind: 'media', brandId, mediaKind: MEDIA_KINDS[parts[5]!]! };
  if (!UUID.test(parts[5]!)) return 'invalid-id';
  return { kind: 'item-revision', brandId, itemId: parts[5]! };
}

async function routeOwner(request: IncomingMessage, response: ServerResponse, configuration: ContentOwnerApiConfiguration, writers: OwnerWriters): Promise<void> {
  const origin = singleHeader(request.headers.origin);
  if (origin !== undefined && origin !== configuration.allowedOrigin) return sendOwnerError(response, 403, 'forbidden', 'Origin is not allowed');
  if (origin) ownerCors(response, origin);
  const route = ownerRoute(pathParts(request.url));
  if (route === null) return sendOwnerError(response, 404, 'not_found', 'Route not found');
  if (route === 'invalid-id') return sendOwnerError(response, 400, 'bad_request', 'Route IDs must be UUIDs');
  if (request.method === 'OPTIONS') {
    if (!origin || singleHeader(request.headers['access-control-request-method']) !== 'POST' || singleHeader(request.headers['access-control-request-headers'])?.toLowerCase() !== 'authorization, content-type') return sendOwnerError(response, 403, 'forbidden', 'Preflight is not allowed');
    response.writeHead(204, { Allow: 'POST, OPTIONS', 'Access-Control-Max-Age': '600', 'Content-Length': '0' }); response.end(); return;
  }
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); return sendOwnerError(response, 405, 'method_not_allowed', 'Only POST is supported'); }
  if (!ownerAuthorized(request, configuration.token)) return sendOwnerError(response, 401, 'unauthorized', 'Authentication required', { 'WWW-Authenticate': 'Bearer' });
  const contentType = singleHeader(request.headers['content-type']);
  try {
    if (route.kind === 'media') {
      if (!contentType?.startsWith('image/')) return sendOwnerError(response, 400, 'bad_request', 'Content-Type must be image/png or image/jpeg');
      const bytes = await readOwnerBytes(request, CONTENT_MEDIA_LIMITS[route.mediaKind].maxBytes);
      const receipt = await writers.media(route.brandId, route.mediaKind, contentType, bytes);
      return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (contentType !== 'application/json') return sendOwnerError(response, 400, 'bad_request', 'Content-Type must be application/json');
    const catalogRoute = route.kind === 'item-create' || route.kind === 'item-revision';
    const promptRoute = route.kind === 'prompt-create' || route.kind === 'prompt-revision' || route.kind === 'prompt-lifecycle';
    const raw = (await readOwnerBytes(request, promptRoute ? PROMPT_BODY_BYTES : catalogRoute ? CATALOG_BODY_BYTES : BRAND_BODY_BYTES)).toString('utf8');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return sendOwnerError(response, 400, 'bad_request', 'Request body must be valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendOwnerError(response, 400, 'bad_request', 'Invalid request');
    const fields = body as Record<string, unknown>;
    const optional = route.kind === 'brand-revision' ? 'logoMediaSha256' : route.kind === 'prompt-create' ? 'duplicatedFrom' : undefined;
    const keys = Object.keys(fields).filter((key) => key !== optional).sort().join(',');
    const expectedKeys = {
      'brand-create': 'brandKey,contractVersion,displayRules,profile',
      'brand-revision': 'contractVersion,displayRules,expectedVersion,profile',
      'item-create': 'contractVersion,item,itemKey',
      'item-revision': 'contractVersion,expectedVersion,item',
      'prompt-create': 'contractVersion,prompt,promptKey,promptType',
      'prompt-revision': 'contractVersion,expectedVersion,prompt',
      'prompt-lifecycle': 'action,contractVersion,expectedSequence',
    }[route.kind];
    if (keys !== expectedKeys) return sendOwnerError(response, 400, 'bad_request', 'Invalid request');
    const serviceRequest = route.kind === 'brand-create' ? { ...fields }
      : route.kind === 'brand-revision' ? { ...fields, brandId: route.brandId }
      : route.kind === 'item-create' ? { ...fields, brandId: route.brandId }
      : route.kind === 'item-revision' ? { ...fields, itemId: route.itemId }
      : route.kind === 'prompt-create' ? { ...fields }
      : { ...fields, promptId: route.promptId };
    try {
      if (route.kind === 'brand-create') validateContentBrandCreateRequest(serviceRequest);
      else if (route.kind === 'brand-revision') validateContentBrandRevisionRequest(serviceRequest);
      else if (route.kind === 'item-create') validateContentCatalogItemCreateRequest(serviceRequest);
      else if (route.kind === 'item-revision') validateContentCatalogItemRevisionRequest(serviceRequest);
      else if (route.kind === 'prompt-create') validateContentPromptCreateRequest(serviceRequest);
      else if (route.kind === 'prompt-revision') validateContentPromptRevisionRequest(serviceRequest);
      else validateContentPromptLifecycleRequest(serviceRequest);
    } catch (error) {
      if (error instanceof FlowValidationError) return sendOwnerError(response, 400, 'bad_request', 'Invalid request');
      throw error;
    }
    const receipt = route.kind === 'brand-create' || route.kind === 'brand-revision' ? await writers.brand(serviceRequest, route.kind === 'brand-revision')
      : route.kind === 'item-create' || route.kind === 'item-revision' ? await writers.item(serviceRequest, route.brandId, route.kind === 'item-revision' ? route.itemId : undefined)
      : route.kind === 'prompt-lifecycle' ? await writers.promptLifecycle(serviceRequest)
      : await writers.prompt(serviceRequest, route.kind === 'prompt-revision' ? route.promptId : undefined);
    return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return sendOwnerError(response, 400, 'bad_request', 'Request body is too large', {}, route.kind === 'media' ? 'too_large' : undefined);
    if (error instanceof EmptyBodyError) return sendOwnerError(response, 400, 'bad_request', 'Request body is required');
    if (error instanceof ContentImageError) return sendOwnerError(response, 400, 'bad_request', 'Image was rejected', {}, error.code);
    if (error instanceof UnknownBrandError) return sendOwnerError(response, 404, 'not_found', 'Brand not found');
    if (error instanceof UnknownItemError) return sendOwnerError(response, 404, 'not_found', 'Catalog item not found');
    if (error instanceof InvalidReferenceError) return sendOwnerError(response, 400, 'bad_request', 'Referenced media is not registered for this brand');
    if (error instanceof UnknownPromptError) return sendOwnerError(response, 404, 'not_found', 'Prompt not found');
    if (error instanceof InvalidPromptRequestError) return sendOwnerError(response, 400, 'bad_request', 'Invalid prompt request');
    if (error instanceof ContentPromptConflictError && /drift|changed content|deleted|restore window/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Request conflicts with current state');
    if ((error instanceof ContentBrandIdentityConflictError || error instanceof ContentCatalogIdentityConflictError) && /changed content|drift/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Request conflicts with current state');
    return sendOwnerError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

function pathParts(raw: string | undefined): string[] | null {
  if (!raw || /%(?:2e|2f|5c)/i.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, 'http://content-api.local'); } catch { return null; }
  if (url.search || url.hash || url.pathname.includes('//')) return null;
  let parts: string[];
  try { parts = url.pathname.split('/').slice(1).map((part) => decodeURIComponent(part)); } catch { return null; }
  if (parts.some((part) => part === '.' || part === '..' || part.includes('/') || part.includes('\\') || part.includes('\0'))) return null;
  return parts;
}

function assertTables(db: BetterSqlite3.Database): void {
  const names = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(({ name }) => name));
  if (REQUIRED_TABLES.some((name) => !names.has(name))) throw new Error('Database is missing required content tables');
}

function sendReadError(response: ServerResponse, status: number, code: ContentApiErrorResponse['error']['code'], message: string): void {
  sendApiJson(response, status, { error: { code, message } } satisfies ContentApiErrorResponse);
}

function sendOwnerError(response: ServerResponse, status: number, code: OwnerContentApiErrorResponse['error']['code'], message: string, extra: Record<string, string> = {}, reason?: OwnerContentMediaRejection): void {
  sendApiJson(response, status, { error: { code, message, ...(reason === undefined ? {} : { reason }) } }, extra);
}

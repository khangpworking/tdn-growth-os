import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type {
  ContentApiErrorResponse,
  ContentBrandDetailResponse,
  ContentBrandHistoryItem,
  ContentBrandListResponse,
} from '../../contracts/api/content-api.generated.js';
import type {
  OwnerContentApiErrorResponse,
  OwnerContentBrandReceipt,
} from '../../contracts/api/owner-content-brand-api.generated.js';
import type { ContentBrandArtifact } from '../../contracts/flow/content-brand-artifact.generated.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../platform/db/database-mutation-mutex.js';
import { ContentBrandIdentityConflictError, ContentBrandService } from '../modules/flow/content-brand-service.js';
import { FlowValidationError, validateContentBrandCreateRequest, validateContentBrandRevisionRequest } from '../modules/flow/validation.js';
import { RequestScopedArtifactStore } from './request-scoped-artifact-store.js';
import {
  assertOwnerHttpConfiguration,
  EmptyBodyError,
  ownerAuthorized,
  ownerCors,
  PayloadTooLargeError,
  readOwnerBody,
  sendApiJson,
  singleHeader,
  type OwnerHttpConfiguration,
} from './owner-http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16 * 1024;
const REQUIRED_TABLES = ['artifact_manifests', 'flow_content_brands', 'flow_content_brand_revisions'];

export interface ContentReadApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
}
export interface ContentOwnerApiConfiguration extends OwnerHttpConfiguration {
  readonly now?: () => Date;
  readonly uuid?: () => string;
}
export interface ContentApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  close(): void;
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
    const brands = new ContentBrandService({ db, artifactStore: new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot)) });
    const catalog = db.prepare(`
      SELECT b.brand_id brandId, max(r.version) version
      FROM flow_content_brands b JOIN flow_content_brand_revisions r ON r.brand_id = b.brand_id
      GROUP BY b.brand_id ORDER BY b.created_at, b.brand_id
    `);
    const versions = db.prepare('SELECT version FROM flow_content_brand_revisions WHERE brand_id = ? ORDER BY version');

    const list = async (): Promise<ContentBrandListResponse> => {
      const result: ContentBrandListResponse['brands'] = [];
      for (const row of catalog.all() as { brandId: string; version: bigint }[]) {
        const brand = await brands.readBrand(row.brandId, Number(row.version));
        if (brand.brandId !== row.brandId || BigInt(brand.version) !== row.version) throw new Error('Brand catalog identity mismatch');
        result.push({ brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, brandName: brand.profile.brandName, updatedAt: brand.createdAt });
      }
      return { contractVersion: '1.0.0', brands: result };
    };
    const detail = async (brandId: string): Promise<ContentBrandDetailResponse | undefined> => {
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
        brand: { brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, profile: brand.profile, displayRules: brand.displayRules, createdAt: brand.createdAt },
        history: [first, ...rest],
      };
    };
    const handler = (request: IncomingMessage, response: ServerResponse): void => { void routeRead(request, response, list, detail); };
    return { handler, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

async function routeRead(
  request: IncomingMessage,
  response: ServerResponse,
  list: () => Promise<ContentBrandListResponse>,
  detail: (brandId: string) => Promise<ContentBrandDetailResponse | undefined>,
): Promise<void> {
  try {
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return sendReadError(response, 405, 'method_not_allowed', 'Only GET is supported'); }
    const parts = pathParts(request.url);
    if (parts === null) return sendReadError(response, 400, 'bad_request', 'Malformed request URL');
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'brands') return sendApiJson(response, 200, await list());
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'brands') {
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Brand ID must be a UUID');
      const result = await detail(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Brand not found');
    }
    return sendReadError(response, 404, 'not_found', 'Route not found');
  } catch {
    return sendReadError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

class UnknownBrandError extends Error {}
class ExistingBrandIntegrityError extends Error {}

/** OWNER write paths for Content Studio (`/owner-api/content/*`). */
export function openContentOwnerApi(configuration: ContentOwnerApiConfiguration): ContentApiApplication {
  assertOwnerHttpConfiguration(configuration);
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertTables(db);
    const artifacts = new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot));
    const brands = new ContentBrandService({
      db, artifactStore: artifacts,
      ...(configuration.now ? { now: configuration.now } : {}),
      ...(configuration.uuid ? { uuid: configuration.uuid } : {}),
    });
    const brandExists = db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?');
    const brandHistory = db.prepare('SELECT version FROM flow_content_brand_revisions WHERE brand_id = ? ORDER BY version');
    const verifyHistory = async (brandId: string): Promise<void> => {
      try {
        const rows = brandHistory.all(brandId) as { version: bigint }[];
        for (const [index, row] of rows.entries()) {
          if (row.version !== BigInt(index + 1)) throw new Error('Brand history is not sequential');
          await brands.readBrand(brandId, index + 1);
        }
      } catch { throw new ExistingBrandIntegrityError(); }
    };

    const write = (serviceRequest: Record<string, unknown>, revision: boolean): Promise<OwnerContentBrandReceipt> =>
      withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (revision && !brandExists.get(serviceRequest.brandId)) throw new UnknownBrandError();
        await brands.restoreExactArtifact(serviceRequest);
        if (revision) await verifyHistory(serviceRequest.brandId as string);
        const result = revision ? await brands.reviseBrand(serviceRequest) : await brands.createBrand(serviceRequest);
        await artifacts.publishOwned();
        const verified = await brands.readBrand(result.brandId, result.version);
        return {
          contractVersion: '1.0.0', brandId: verified.brandId, brandKey: verified.brandKey, version: verified.version,
          brandName: verified.profile.brandName, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      }));

    const handler = (request: IncomingMessage, response: ServerResponse): void => { void routeOwner(request, response, configuration, write); };
    return { handler, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

async function routeOwner(
  request: IncomingMessage,
  response: ServerResponse,
  configuration: ContentOwnerApiConfiguration,
  write: (serviceRequest: Record<string, unknown>, revision: boolean) => Promise<OwnerContentBrandReceipt>,
): Promise<void> {
  const origin = singleHeader(request.headers.origin);
  if (origin !== undefined && origin !== configuration.allowedOrigin) return sendOwnerError(response, 403, 'forbidden', 'Origin is not allowed');
  if (origin) ownerCors(response, origin);
  const parts = pathParts(request.url);
  const create = parts !== null && parts.length === 3 && parts[0] === 'owner-api' && parts[1] === 'content' && parts[2] === 'brands';
  const revision = parts !== null && parts.length === 5 && parts[0] === 'owner-api' && parts[1] === 'content' && parts[2] === 'brands' && parts[4] === 'revisions';
  if (!create && !revision) return sendOwnerError(response, 404, 'not_found', 'Route not found');
  const brandId = revision ? parts![3]! : undefined;
  if (brandId !== undefined && !UUID.test(brandId)) return sendOwnerError(response, 400, 'bad_request', 'Brand ID must be a UUID');
  if (request.method === 'OPTIONS') {
    if (!origin || singleHeader(request.headers['access-control-request-method']) !== 'POST' || singleHeader(request.headers['access-control-request-headers'])?.toLowerCase() !== 'authorization, content-type') return sendOwnerError(response, 403, 'forbidden', 'Preflight is not allowed');
    response.writeHead(204, { Allow: 'POST, OPTIONS', 'Access-Control-Max-Age': '600', 'Content-Length': '0' }); response.end(); return;
  }
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); return sendOwnerError(response, 405, 'method_not_allowed', 'Only POST is supported'); }
  if (!ownerAuthorized(request, configuration.token)) return sendOwnerError(response, 401, 'unauthorized', 'Authentication required', { 'WWW-Authenticate': 'Bearer' });
  if (singleHeader(request.headers['content-type']) !== 'application/json') return sendOwnerError(response, 400, 'bad_request', 'Content-Type must be application/json');
  try {
    const raw = await readOwnerBody(request, MAX_BODY_BYTES);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return sendOwnerError(response, 400, 'bad_request', 'Request body must be valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendOwnerError(response, 400, 'bad_request', 'Invalid brand request');
    const keys = Object.keys(body).sort().join(',');
    const expectedKeys = create ? 'brandKey,contractVersion,displayRules,profile' : 'contractVersion,displayRules,expectedVersion,profile';
    if (keys !== expectedKeys) return sendOwnerError(response, 400, 'bad_request', 'Invalid brand request');
    const serviceRequest = create ? { ...(body as Record<string, unknown>) } : { ...(body as Record<string, unknown>), brandId };
    try {
      if (create) validateContentBrandCreateRequest(serviceRequest);
      else validateContentBrandRevisionRequest(serviceRequest);
    } catch (error) {
      if (error instanceof FlowValidationError) return sendOwnerError(response, 400, 'bad_request', 'Invalid brand request');
      throw error;
    }
    const receipt = await write(serviceRequest, revision);
    return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return sendOwnerError(response, 400, 'bad_request', 'Request body is too large');
    if (error instanceof EmptyBodyError) return sendOwnerError(response, 400, 'bad_request', 'Request body is required');
    if (error instanceof ExistingBrandIntegrityError) return sendOwnerError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
    if (error instanceof UnknownBrandError) return sendOwnerError(response, 404, 'not_found', 'Brand not found');
    if (error instanceof ContentBrandIdentityConflictError && /changed content|drift/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Brand conflicts with current state');
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

function sendOwnerError(response: ServerResponse, status: number, code: OwnerContentApiErrorResponse['error']['code'], message: string, extra: Record<string, string> = {}): void {
  sendApiJson(response, status, { error: { code, message } } satisfies OwnerContentApiErrorResponse, extra);
}

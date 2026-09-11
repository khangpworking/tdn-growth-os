import { timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { OwnerApiErrorResponse, OwnerB8DecisionReceipt, OwnerB8DecisionRequest } from '../../contracts/api/owner-b8-decision-api.generated.js';
import type { OwnerB8ClearanceReceipt, OwnerB8ClearanceRequest } from '../../contracts/api/owner-b8-clearance-api.generated.js';
import type { OwnerB9LockReceipt, OwnerB9LockRequest, OwnerB9WorkingReceipt, OwnerB9WorkingRequest } from '../../contracts/api/owner-b9-stp-api.generated.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { CandidateB7DecisionService, CANDIDATE_B7_DECISION_CAPABILITY, CANDIDATE_B7_DECISION_POLICY_ID } from '../modules/governance/candidate-b7-decision-service.js';
import { GovernanceCandidateB7DecisionReader } from '../modules/governance/candidate-b7-decision-reader.js';
import { CandidateBasketService } from '../modules/flow/candidate-basket-service.js';
import { FlowCandidateBasketReader } from '../modules/flow/candidate-basket-reader.js';
import { DiscoveryWorkspaceService } from '../modules/flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../modules/flow/discovery-workspace-reader.js';
import { ProductCandidateService } from '../modules/flow/product-candidate-service.js';
import { FlowProductCandidateReader } from '../modules/flow/product-candidate-reader.js';
import { ProductWorkspaceService } from '../modules/flow/product-workspace-service.js';
import { FlowProductWorkspaceReader } from '../modules/flow/product-workspace-reader.js';
import { GovernanceValidationError } from '../modules/governance/validation.js';
import { ProductB8DecisionIdentityConflictError, ProductB8LaneDecisionService, PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B8_REVIEW_POLICY_ID } from '../modules/governance/product-b8-lane-decision-service.js';
import { GovernanceProductB8Reader } from '../modules/governance/product-b8-status-reader.js';
import { B8ClearanceIdentityConflictError, B8ClearanceService } from '../modules/flow/b8-clearance-service.js';
import { FlowValidationError } from '../modules/flow/validation.js';
import { FlowB8ClearanceReader } from '../modules/flow/b8-clearance-reader.js';
import { PRODUCT_B9_LOCK_CAPABILITY, StpIdentityConflictError, StpService } from '../modules/flow/stp-service.js';
import { b9WorkingRevision, matchesB9WorkingRevision, validB9WorkingRevision } from './b9-working-revision.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7e]{32,512}$/;
const MAX_BODY_BYTES = 4096;

export interface OwnerApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly writeEnabled: boolean;
  readonly token: string;
  readonly allowedOrigin: string;
  readonly actorId: string;
  readonly now?: () => Date;
  readonly uuid?: () => string;
}
export interface OwnerApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  close(): void;
}

export function openOwnerApi(configuration: OwnerApiConfiguration): OwnerApiApplication {
  assertConfiguration(configuration);
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertOwnerTables(db);
    const artifacts = new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot));
    const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts });
    const candidates = new ProductCandidateService({ db, artifactStore: artifacts });
    const baskets = new CandidateBasketService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), candidateReader: new FlowProductCandidateReader(candidates) });
    const b7 = new CandidateB7DecisionService({ db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets), configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY } });
    const products = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(b7) });
    const service = new ProductB8LaneDecisionService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(products), configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY }, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const b8Reader = new GovernanceProductB8Reader(service);
    const clearances = new B8ClearanceService({ db, artifactStore: artifacts, decisionReader: b8Reader, statusReader: b8Reader, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const stps = new StpService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(products), b8ClearanceReader: new FlowB8ClearanceReader(clearances), ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const actor = Object.freeze({ actorId: configuration.actorId, roleSnapshot: 'OWNER' as const, capabilities: new Set<string>([PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B9_LOCK_CAPABILITY]) });
    const productExists = db.prepare('SELECT 1 FROM flow_product_workspaces WHERE product_workspace_id=?');
    const clearanceExists = db.prepare('SELECT 1 FROM flow_b8_clearances WHERE product_workspace_id=?');
    const clearanceByProduct = db.prepare('SELECT clearance_id clearanceId FROM flow_b8_clearances WHERE product_workspace_id=?');
    const workingExists = db.prepare('SELECT 1 FROM flow_stp_working_records WHERE product_workspace_id=?');
    const lockExists = db.prepare('SELECT 1 FROM flow_locked_stps WHERE product_workspace_id=?');
    const handler = (request: IncomingMessage, response: ServerResponse): void => { void route(request, response, configuration, async (productWorkspaceId, body) => {
      if (!productExists.get(productWorkspaceId)) throw new UnknownProductWorkspaceError();
      const result = await service.decide({ ...body, productWorkspaceId }, actor);
      const verified = await service.replay(result.decisionId);
      return { contractVersion: '1.0.0', decisionId: result.decisionId, decisionVersion: result.decisionVersion, lane: result.lane, decision: result.decision, decidedAt: verified.decidedAt, exactRetry: result.deduplicated };
    }, async (productWorkspaceId, body) => {
      if (!productExists.get(productWorkspaceId)) throw new UnknownProductWorkspaceError();
      const existing = !!clearanceExists.get(productWorkspaceId);
      try {
        const result = await clearances.createClearance({ contractVersion: body.contractVersion, productWorkspaceId, decisions: body.decisionIds });
        const verified = await clearances.replay(result.clearanceId);
        return { contractVersion: '1.0.0', clearanceId: result.clearanceId, state: result.state, clearedAt: verified.clearedAt, exactRetry: result.deduplicated };
      } catch (error) {
        if (existing && !(error instanceof B8ClearanceIdentityConflictError)) throw new ExistingClearanceIntegrityError();
        throw error;
      }
    }, async (productWorkspaceId, body) => {
      if (!productExists.get(productWorkspaceId)) throw new UnknownProductWorkspaceError();
      const clearance = clearanceByProduct.get(productWorkspaceId) as { clearanceId: string } | undefined;
      if (!clearance || clearance.clearanceId !== body.b8ClearanceId) throw new StpIdentityConflictError('B9 working requires the product current B8 clearance');
      const existed = !!workingExists.get(productWorkspaceId);
      let expectedWorkingDigest: string | null = null;
      if (body.expectedWorkingRevision !== null) {
        let current;
        try { current = await stps.readVerifiedWorking(productWorkspaceId); }
        catch { if (!existed) throw new StpIdentityConflictError('B9 working record is missing'); throw new ExistingStpIntegrityError(); }
        if (!matchesB9WorkingRevision(body.expectedWorkingRevision, current.workingDigest)) throw new StpIdentityConflictError('STP working revision is stale');
        expectedWorkingDigest = current.workingDigest;
      }
      const { expectedWorkingRevision: _, ...content } = body;
      const result = await stps.saveWorking({ ...content, productWorkspaceId, expectedWorkingDigest });
      let verified;
      try { verified = await stps.readVerifiedWorking(productWorkspaceId); } catch { throw new ExistingStpIntegrityError(); }
      return { contractVersion: '1.0.0', workingStpId: result.workingStpId, productWorkspaceId: verified.productWorkspaceId, workingRevision: b9WorkingRevision(verified.workingDigest), createdAt: verified.createdAt, updatedAt: verified.updatedAt, exactRetry: result.deduplicated, created: !existed && !result.deduplicated };
    }, async (productWorkspaceId, body) => {
      if (!productExists.get(productWorkspaceId)) throw new UnknownProductWorkspaceError();
      const existed = !!workingExists.get(productWorkspaceId);
      if (!existed) throw new StpIdentityConflictError('B9 lock working record is missing');
      let working;
      try { working = await stps.readVerifiedWorking(productWorkspaceId); } catch { throw new ExistingStpIntegrityError(); }
      if (!matchesB9WorkingRevision(body.expectedWorkingRevision, working.workingDigest)) throw new StpIdentityConflictError('B9 lock working revision is stale');
      const hadLock = !!lockExists.get(productWorkspaceId);
      let result;
      try { result = await stps.lock({ contractVersion: body.contractVersion, productWorkspaceId, expectedWorkingDigest: working.workingDigest }, actor); }
      catch (error) { if (hadLock) throw new ExistingStpIntegrityError(); throw error; }
      let verified;
      try { verified = await stps.replayLocked(result.lockId); } catch { throw new ExistingStpIntegrityError(); }
      return { contractVersion: '1.0.0', lockId: result.lockId, state: result.state, lockedAt: verified.lockedAt, exactRetry: result.deduplicated };
    }); };
    return { handler, close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}

export function createOwnerApiServer(configuration: OwnerApiConfiguration): { server: http.Server; close(): Promise<void> } {
  const application = openOwnerApi(configuration);
  const server = http.createServer(application.handler);
  return { server, close: () => new Promise<void>((resolve, reject) => server.close((error) => { application.close(); error ? reject(error) : resolve(); })) };
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  configuration: OwnerApiConfiguration,
  decide: (id: string, body: OwnerB8DecisionRequest) => Promise<OwnerB8DecisionReceipt>,
  clear: (id: string, body: OwnerB8ClearanceRequest) => Promise<OwnerB8ClearanceReceipt>,
  saveWorking: (id: string, body: OwnerB9WorkingRequest) => Promise<OwnerB9WorkingReceipt & { created: boolean }>,
  lock: (id: string, body: OwnerB9LockRequest) => Promise<OwnerB9LockReceipt>,
): Promise<void> {
  const origin = singleHeader(request.headers.origin);
  if (origin !== undefined && origin !== configuration.allowedOrigin) return sendError(response, 403, 'forbidden', 'Origin is not allowed');
  if (origin) cors(response, origin);
  const matched = ownerRoute(request.url);
  if (matched === null) return sendError(response, 404, 'not_found', 'Route not found');
  const { productWorkspaceId } = matched;
  if (!UUID.test(productWorkspaceId)) return sendError(response, 400, 'bad_request', 'Product workspace ID must be a UUID');
  if (request.method === 'OPTIONS') {
    if (!origin || singleHeader(request.headers['access-control-request-method']) !== 'POST' || singleHeader(request.headers['access-control-request-headers'])?.toLowerCase() !== 'authorization, content-type') return sendError(response, 403, 'forbidden', 'Preflight is not allowed');
    response.writeHead(204, { Allow: 'POST, OPTIONS', 'Access-Control-Max-Age': '600', 'Content-Length': '0' }); response.end(); return;
  }
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); return sendError(response, 405, 'method_not_allowed', 'Only POST is supported'); }
  if (!authorized(request, configuration.token)) return sendError(response, 401, 'unauthorized', 'Authentication required', { 'WWW-Authenticate': 'Bearer' });
  if (singleHeader(request.headers['content-type']) !== 'application/json') return sendError(response, 400, 'bad_request', 'Content-Type must be application/json');
  try {
    const raw = await readBody(request);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return sendError(response, 400, 'bad_request', 'Request body must be valid JSON'); }
    if (matched.operation === 'decision') {
      if (!ownerDecisionBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B8 decision request');
      const receipt = await decide(productWorkspaceId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'clearance') {
      if (!ownerClearanceBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B8 clearance request');
      const receipt = await clear(productWorkspaceId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'working') {
      if (!ownerWorkingBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B9 working request');
      const receipt = await saveWorking(productWorkspaceId, body);
      const { created, ...closedReceipt } = receipt;
      return sendJson(response, created ? 201 : 200, closedReceipt);
    }
    if (!ownerLockBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B9 lock request');
    const receipt = await lock(productWorkspaceId, body);
    return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof ExistingClearanceIntegrityError || error instanceof ExistingStpIntegrityError) return sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof PayloadTooLargeError) return sendError(response, 400, 'bad_request', 'Request body is too large');
    if (error instanceof ProductB8DecisionIdentityConflictError) return sendError(response, 409, 'conflict', 'B8 decision conflicts with current state');
    if (error instanceof B8ClearanceIdentityConflictError) return clearanceSemanticConflict(error) ? sendError(response, 409, 'conflict', 'B8 clearance conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof UnknownProductWorkspaceError) return sendError(response, 404, 'not_found', 'Product workspace not found');
    if (error instanceof StpIdentityConflictError) return sendError(response, 409, 'conflict', matched.operation === 'working' ? 'B9 working conflicts with current state' : 'B9 lock conflicts with current state');
    if (error instanceof GovernanceValidationError) {
      if (matched.operation === 'clearance') return clearanceSemanticConflict(error) ? sendError(response, 409, 'conflict', 'B8 clearance conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
      if (/must change the effective decision/i.test(error.message)) return sendError(response, 409, 'conflict', 'B8 decision conflicts with current state');
      return sendError(response, 400, 'bad_request', 'Invalid B8 decision request');
    }
    if (error instanceof FlowValidationError) {
      if (matched.operation === 'working') return /locked|not found|requires null/i.test(error.message) ? sendError(response, 409, 'conflict', 'B9 working conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid B9 working request');
      if (matched.operation === 'lock') return /locked|requires one existing|trusted OWNER/i.test(error.message) ? sendError(response, 409, 'conflict', 'B9 lock conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid B9 lock request');
      return clearanceSemanticConflict(error) ? sendError(response, 409, 'conflict', 'B8 clearance conflicts with current state') : /distinct exact decision/i.test(error.message) ? sendError(response, 400, 'bad_request', 'Invalid B8 clearance request') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    }
    return sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
  }
}

function clearanceSemanticConflict(error: Error): boolean { return /not found|must belong to|must be PASS|belongs to another|identical frozen|not currently ready|not the current effective PASS|cannot be assigned|already has a B8 clearance|different exact decision set|wrong .* decision/i.test(error.message); }
function ownerDecisionBodyShape(value: unknown): value is OwnerB8DecisionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 4 && keys.join(',') === 'contractVersion,decision,expectedVersion,lane';
}
function ownerClearanceBodyShape(value: unknown): value is OwnerB8ClearanceRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'contractVersion,decisionIds' || body.contractVersion !== '1.0.0' || !body.decisionIds || typeof body.decisionIds !== 'object' || Array.isArray(body.decisionIds)) return false;
  const ids = body.decisionIds as Record<string, unknown>;
  return Object.keys(ids).sort().join(',') === 'FINANCE,LEGAL,QUALITY,SCIENTIFIC' && ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'].every((lane) => typeof ids[lane] === 'string' && UUID.test(ids[lane]));
}
function ownerWorkingBodyShape(value: unknown): value is OwnerB9WorkingRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const allowed = new Set(['contractVersion', 'b8ClearanceId', 'expectedWorkingRevision', 'segments', 'primaryTargetSegmentKey', 'secondaryTargetSegmentKeys', 'positioningStatement']);
  return Object.keys(body).every((key) => allowed.has(key)) && ['contractVersion', 'b8ClearanceId', 'expectedWorkingRevision', 'segments', 'primaryTargetSegmentKey', 'positioningStatement'].every((key) => Object.hasOwn(body, key)) && body.contractVersion === '1.0.0' && typeof body.b8ClearanceId === 'string' && UUID.test(body.b8ClearanceId) && (body.expectedWorkingRevision === null || validB9WorkingRevision(body.expectedWorkingRevision));
}
function ownerLockBodyShape(value: unknown): value is OwnerB9LockRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).sort().join(',') === 'contractVersion,expectedWorkingRevision' && body.contractVersion === '1.0.0' && validB9WorkingRevision(body.expectedWorkingRevision);
}
function assertConfiguration(value: OwnerApiConfiguration): void {
  if (value.writeEnabled !== true) throw new TypeError('OWNER API write mode must be explicitly enabled');
  if (!value.databasePath || !value.artifactRoot) throw new TypeError('Explicit databasePath and artifactRoot are required');
  if (!TOKEN.test(value.token)) throw new TypeError('OWNER API token must be 32-512 printable non-space ASCII characters containing letters and digits');
  let origin: URL; try { origin = new URL(value.allowedOrigin); } catch { throw new TypeError('OWNER API allowed origin must be an exact HTTP(S) origin'); }
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== value.allowedOrigin || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new TypeError('OWNER API allowed origin must be an exact HTTP(S) origin');
  if (!/^[a-z][a-z0-9:_-]{2,119}$/.test(value.actorId)) throw new TypeError('OWNER API actor ID is invalid');
}
function authorized(request: IncomingMessage, expected: string): boolean {
  const value = singleHeader(request.headers.authorization);
  const supplied = value?.startsWith('Bearer ') ? value.slice(7) : '';
  const expectedDigest = Buffer.from(expected); const suppliedDigest = Buffer.from(supplied);
  const padded = Buffer.alloc(expectedDigest.length); suppliedDigest.copy(padded, 0, 0, expectedDigest.length);
  const digestMatches = timingSafeEqual(padded, expectedDigest);
  return digestMatches && suppliedDigest.length === expectedDigest.length;
}
function singleHeader(value: string | string[] | undefined): string | undefined { return typeof value === 'string' ? value : undefined; }
function ownerRoute(raw: string | undefined): { productWorkspaceId: string; operation: 'decision' | 'clearance' | 'working' | 'lock' } | null {
  if (!raw || /%(?:2e|2f|5c)/i.test(raw)) return null;
  let url: URL; try { url = new URL(raw, 'http://owner-api.local'); } catch { return null; }
  if (url.search || url.hash || url.pathname.includes('//')) return null;
  const match = /^\/owner-api\/product-workspaces\/([^/]+)\/(b8-decisions|b8-clearance|b9\/working|b9\/lock)$/.exec(url.pathname); if (!match) return null;
  try { const id = decodeURIComponent(match[1]!); const operation = match[2] === 'b8-decisions' ? 'decision' : match[2] === 'b8-clearance' ? 'clearance' : match[2] === 'b9/working' ? 'working' : 'lock'; return id.includes('/') || id.includes('\\') || id.includes('\0') ? null : { productWorkspaceId: id, operation }; } catch { return null; }
}
class ExistingClearanceIntegrityError extends Error {}
class ExistingStpIntegrityError extends Error {}
class PayloadTooLargeError extends Error {}
class UnknownProductWorkspaceError extends Error {}
async function readBody(request: IncomingMessage): Promise<string> {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) { request.resume(); throw new PayloadTooLargeError(); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError(); chunks.push(bytes); }
  if (size === 0) throw new GovernanceValidationError('Request body is required');
  return Buffer.concat(chunks).toString('utf8');
}
function cors(response: ServerResponse, origin: string): void { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Methods', 'POST'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); response.setHeader('Vary', 'Origin'); }
function sendJson(response: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void { const bytes = Buffer.from(JSON.stringify(body)); response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }); response.end(bytes); }
function sendError(response: ServerResponse, status: number, code: OwnerApiErrorResponse['error']['code'], message: string, extra: Record<string, string> = {}): void { sendJson(response, status, { error: { code, message } } satisfies OwnerApiErrorResponse, extra); }
function assertOwnerTables(db: BetterSqlite3.Database): void { const names = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(({ name }) => name)); for (const required of ['artifact_manifests', 'flow_discovery_workspaces', 'flow_product_candidates', 'flow_product_candidate_revisions', 'flow_candidate_baskets', 'flow_candidate_basket_members', 'governance_candidate_b7_decisions', 'flow_product_workspaces', 'governance_product_b8_lane_decisions', 'flow_b8_clearances', 'flow_b8_clearance_decisions', 'flow_stp_working_records', 'flow_locked_stps']) if (!names.has(required)) throw new Error('Database is missing required owner tables'); }

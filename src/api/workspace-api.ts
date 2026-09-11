import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type {
  B8ClearanceSummary,
  DiscoveryWorkspaceDetailResponse,
  ProductWorkspaceDetailResponse,
  WorkspaceApiErrorResponse,
  WorkspaceCandidateSummary,
  WorkspacePortfolioItem,
  WorkspacePortfolioResponse,
} from '../../contracts/api/workspace-api.generated.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService } from '../modules/flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../modules/flow/discovery-workspace-reader.js';
import { ProductCandidateService } from '../modules/flow/product-candidate-service.js';
import { FlowProductCandidateReader } from '../modules/flow/product-candidate-reader.js';
import { CandidateBasketService } from '../modules/flow/candidate-basket-service.js';
import { FlowCandidateBasketReader } from '../modules/flow/candidate-basket-reader.js';
import {
  CANDIDATE_B7_DECISION_CAPABILITY,
  CANDIDATE_B7_DECISION_POLICY_ID,
  CandidateB7DecisionService,
} from '../modules/governance/candidate-b7-decision-service.js';
import { GovernanceCandidateB7DecisionReader } from '../modules/governance/candidate-b7-decision-reader.js';
import { ProductWorkspaceService } from '../modules/flow/product-workspace-service.js';
import { FlowProductWorkspaceReader } from '../modules/flow/product-workspace-reader.js';
import {
  PRODUCT_B8_REVIEW_CAPABILITY,
  PRODUCT_B8_REVIEW_POLICY_ID,
  ProductB8LaneDecisionService,
} from '../modules/governance/product-b8-lane-decision-service.js';
import { GovernanceProductB8Reader } from '../modules/governance/product-b8-status-reader.js';
import { B8ClearanceService } from '../modules/flow/b8-clearance-service.js';
import { FlowB8ClearanceReader } from '../modules/flow/b8-clearance-reader.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkspaceApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
}
export interface WorkspaceApiDiagnostics {
  readonly queryOnly: boolean;
}
export interface WorkspaceApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  diagnostics(): WorkspaceApiDiagnostics;
  close(): void;
}

type DiscoveryCatalogRow = { workspaceId: string };
type CandidateCatalogRow = { candidateId: string; version: bigint };
type ProductCatalogRow = { productWorkspaceId: string };
type ClearanceCatalogRow = { clearanceId: string };

export function openWorkspaceApi(configuration: WorkspaceApiConfiguration): WorkspaceApiApplication {
  if (!configuration.databasePath || !configuration.artifactRoot) throw new TypeError('Explicit databasePath and artifactRoot are required');
  const databasePath = path.resolve(configuration.databasePath);
  const artifactRoot = path.resolve(configuration.artifactRoot);
  const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertOwnerTables(db);

    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts });
    const discoveryReader = new FlowDiscoveryWorkspaceReader(discoveries);
    const candidates = new ProductCandidateService({ db, artifactStore: artifacts });
    const candidateReader = new FlowProductCandidateReader(candidates);
    const baskets = new CandidateBasketService({ db, artifactStore: artifacts, workspaceReader: discoveryReader, candidateReader });
    const b7 = new CandidateB7DecisionService({
      db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets),
      configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY },
    });
    const products = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(b7) });
    const productReader = new FlowProductWorkspaceReader(products);
    const b8 = new ProductB8LaneDecisionService({
      db, artifactStore: artifacts, productWorkspaceReader: productReader,
      configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY },
    });
    const b8Reader = new GovernanceProductB8Reader(b8);
    const clearances = new B8ClearanceService({ db, artifactStore: artifacts, decisionReader: b8Reader, statusReader: b8Reader });
    const clearanceReader = new FlowB8ClearanceReader(clearances);

    const portfolioRows = db.prepare(`
      SELECT w.workspace_id workspaceId
      FROM flow_discovery_workspaces w ORDER BY w.created_at, w.workspace_id
    `);
    const discoveryRow = db.prepare(`
      SELECT w.workspace_id workspaceId
      FROM flow_discovery_workspaces w WHERE w.workspace_id=?
    `);
    const candidateRows = db.prepare(`
      SELECT c.candidate_id candidateId, max(r.version) version
      FROM flow_product_candidates c JOIN flow_product_candidate_revisions r ON r.candidate_id=c.candidate_id
      WHERE c.workspace_id=? GROUP BY c.candidate_id ORDER BY c.created_at, c.candidate_id
    `);
    const productRows = db.prepare(`SELECT product_workspace_id productWorkspaceId FROM flow_product_workspaces WHERE source_workspace_id=? ORDER BY created_at, product_workspace_id`);
    const productExists = db.prepare(`SELECT product_workspace_id productWorkspaceId FROM flow_product_workspaces WHERE product_workspace_id=?`);
    const clearanceRow = db.prepare(`SELECT clearance_id clearanceId FROM flow_b8_clearances WHERE product_workspace_id=?`);

    const verifiedWorkspace = async (row: DiscoveryCatalogRow): Promise<{
      workspace: WorkspacePortfolioItem;
      candidates: WorkspaceCandidateSummary[];
      products: ReturnType<typeof productSummary>[];
    }> => {
      const value = await discoveryReader.readVerifiedWorkspace(row.workspaceId);
      if (value.workspaceId !== row.workspaceId) throw new Error('Verified discovery workspace has wrong identity');
      const candidateResults: WorkspaceCandidateSummary[] = [];
      for (const candidateRow of candidateRows.all(row.workspaceId) as CandidateCatalogRow[]) {
        const version = safeVersion(candidateRow.version);
        const candidate = await candidateReader.readVerifiedCandidate(candidateRow.candidateId, version);
        if (candidate.candidateId !== candidateRow.candidateId || candidate.version !== version || candidate.workspaceId !== row.workspaceId) throw new Error('Verified candidate has wrong identity or workspace');
        candidateResults.push({ candidateId: candidate.candidateId, candidateKey: candidate.candidateKey, state: candidate.state, version: candidate.version, label: candidate.label, ...(candidate.summary === undefined ? {} : { summary: candidate.summary }), createdAt: candidate.createdAt });
      }
      const productResults = [];
      for (const productRow of productRows.all(row.workspaceId) as ProductCatalogRow[]) {
        const product = await productReader.readVerifiedProductWorkspace(productRow.productWorkspaceId);
        if (product.productWorkspaceId !== productRow.productWorkspaceId || product.source.discoveryWorkspace.workspaceId !== row.workspaceId) throw new Error('Verified product workspace has wrong identity or discovery workspace');
        productResults.push(productSummary(product));
      }
      return {
        workspace: {
          workspaceId: value.workspaceId, workspaceKey: value.workspaceKey, state: value.state, title: value.title,
          ...(value.description === undefined ? {} : { description: value.description }), createdAt: value.createdAt,
          candidateCount: candidateResults.length, productCount: productResults.length,
        },
        candidates: candidateResults,
        products: productResults,
      };
    };
    const portfolio = async (): Promise<WorkspacePortfolioResponse> => {
      const workspaces: WorkspacePortfolioItem[] = [];
      for (const row of portfolioRows.all() as DiscoveryCatalogRow[]) workspaces.push((await verifiedWorkspace(row)).workspace);
      return { contractVersion: '1.0.0', workspaces };
    };
    const discoveryDetail = async (id: string): Promise<DiscoveryWorkspaceDetailResponse | undefined> => {
      const row = discoveryRow.get(id) as DiscoveryCatalogRow | undefined;
      if (!row) return undefined;
      const verified = await verifiedWorkspace(row);
      return { contractVersion: '1.0.0', ...verified };
    };
    const productDetail = async (id: string): Promise<ProductWorkspaceDetailResponse | undefined> => {
      if (!productExists.get(id)) return undefined;
      const value = await productReader.readVerifiedProductWorkspace(id);
      const status = await b8Reader.readStatus(id);
      const lanes: ProductWorkspaceDetailResponse['b8']['lanes'] = [];
      for (const lane of status.lanes) {
        if (lane.effectiveState === 'NO_DECISION') lanes.push({ lane: lane.lane, effectiveState: lane.effectiveState });
        else {
          const decision = await b8Reader.readVerifiedDecision(lane.decisionId);
          lanes.push({ lane: lane.lane, effectiveState: lane.effectiveState, decisionId: lane.decisionId, decisionVersion: lane.decisionVersion, decidedAt: decision.decidedAt });
        }
      }
      const foundClearance = clearanceRow.get(id) as ClearanceCatalogRow | undefined;
      let clearance: B8ClearanceSummary | undefined;
      if (foundClearance) {
        const verified = await clearanceReader.readVerifiedClearance(foundClearance.clearanceId);
        clearance = { clearanceId: verified.clearanceId, state: verified.state, clearedAt: verified.clearedAt, decisions: verified.decisions.map((decision) => ({ lane: decision.lane, decisionId: decision.decisionId, decisionVersion: decision.decisionVersion, decidedAt: decision.decidedAt })) };
      }
      return {
        contractVersion: '1.0.0',
        product: {
          ...productSummary(value), sourceWorkspaceId: value.source.discoveryWorkspace.workspaceId,
          sourceBasketId: value.source.basket.basketId, sourceBasketKey: value.source.basket.basketKey, sourceBasketVersion: value.source.basket.basketVersion,
          sourceCandidateId: value.source.candidate.candidateId, sourceCandidateKey: value.source.candidate.candidateKey,
          sourceCandidateVersion: value.source.candidate.candidateVersion, sourceCandidateLabel: value.source.candidate.label,
          ...(value.source.candidate.summary === undefined ? {} : { sourceCandidateSummary: value.source.candidate.summary }),
          sourceB7DecisionId: value.source.b7Decision.decisionId, sourceB7DecidedAt: value.source.b7Decision.decidedAt,
        },
        b8: { lanes, readyForB9: status.readyForB9 }, ...(clearance ? { clearance } : {}),
      };
    };

    const handler = (request: IncomingMessage, response: ServerResponse): void => {
      void route(request, response, { portfolio, discoveryDetail, productDetail });
    };
    return {
      handler,
      diagnostics: () => ({ queryOnly: db.pragma('query_only', { simple: true }) === 1n }),
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function createWorkspaceApiServer(configuration: WorkspaceApiConfiguration): { server: http.Server; close(): Promise<void> } {
  const application = openWorkspaceApi(configuration);
  const server = http.createServer(application.handler);
  return {
    server,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => { application.close(); error ? reject(error) : resolve(); })),
  };
}

async function route(request: IncomingMessage, response: ServerResponse, methods: {
  portfolio(): Promise<WorkspacePortfolioResponse>;
  discoveryDetail(id: string): Promise<DiscoveryWorkspaceDetailResponse | undefined>;
  productDetail(id: string): Promise<ProductWorkspaceDetailResponse | undefined>;
}): Promise<void> {
  try {
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return sendError(response, 405, 'method_not_allowed', 'Only GET is supported'); }
    if (!request.url || /%(?:2e|2f|5c)/i.test(request.url)) return sendError(response, 400, 'bad_request', 'Malformed request URL');
    let url: URL;
    try { url = new URL(request.url, 'http://workspace-api.local'); } catch { return sendError(response, 400, 'bad_request', 'Malformed request URL'); }
    if (url.search || url.hash || url.pathname.includes('//')) return sendError(response, 400, 'bad_request', 'Malformed request URL');
    let parts: string[];
    try { parts = url.pathname.split('/').slice(1).map((part) => decodeURIComponent(part)); } catch { return sendError(response, 400, 'bad_request', 'Malformed request URL'); }
    if (parts.some((part) => part === '.' || part === '..' || part.includes('/') || part.includes('\\') || part.includes('\0'))) return sendError(response, 400, 'bad_request', 'Malformed request URL');
    if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'workspaces') return sendJson(response, 200, await methods.portfolio());
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'workspaces') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Workspace ID must be a UUID');
      const result = await methods.discoveryDetail(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Workspace not found');
    }
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'product-workspaces') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Product workspace ID must be a UUID');
      const result = await methods.productDetail(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Product workspace not found');
    }
    return sendError(response, 404, 'not_found', 'Route not found');
  } catch {
    return sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
  }
}

function productSummary(value: Awaited<ReturnType<FlowProductWorkspaceReader['readVerifiedProductWorkspace']>>) {
  return { productWorkspaceId: value.productWorkspaceId, productWorkspaceKey: value.productWorkspaceKey, state: value.state, entryStep: value.entryStep, title: value.title, createdAt: value.createdAt };
}
function safeCount(value: bigint): number { const result = Number(value); if (!Number.isSafeInteger(result) || result < 0) throw new Error('Invalid catalog count'); return result; }
function safeVersion(value: bigint): number { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new Error('Invalid catalog version'); return result; }
function sendJson(response: ServerResponse, status: number, body: unknown): void { const bytes = Buffer.from(JSON.stringify(body)); response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(bytes); }
function sendError(response: ServerResponse, status: number, code: WorkspaceApiErrorResponse['error']['code'], message: string): void { sendJson(response, status, { error: { code, message } } satisfies WorkspaceApiErrorResponse); }
function assertOwnerTables(db: BetterSqlite3.Database): void {
  const required = ['artifact_manifests', 'flow_discovery_workspaces', 'flow_product_candidates', 'flow_product_candidate_revisions', 'flow_candidate_baskets', 'flow_candidate_basket_members', 'governance_candidate_b7_decisions', 'flow_product_workspaces', 'governance_product_b8_lane_decisions', 'flow_b8_clearances', 'flow_b8_clearance_decisions'];
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
  const names = new Set(rows.map((row) => row.name));
  if (required.some((name) => !names.has(name))) throw new Error('Database is missing required owner tables');
}

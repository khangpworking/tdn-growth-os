import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type {
  B8ClearanceSummary,
  DiscoveryWorkspaceDetailResponse,
  ProductWorkspaceDetailResponse,
  ProductB9Response,
  ProductB10Response,
  WorkspaceApiErrorResponse,
  WorkspaceCandidateSummary,
  WorkspaceCandidateBasketsResponse,
  WorkspaceCandidateBasketB7Response,
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
import { StpService } from '../modules/flow/stp-service.js';
import { FlowLockedStpReader } from '../modules/flow/locked-stp-reader.js';
import { ProductB10DecisionService } from '../modules/governance/product-b10-decision-service.js';
import { GovernanceProductB10Reader } from '../modules/governance/product-b10-decision-reader.js';
import { b9WorkingRevision } from './b9-working-revision.js';

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
type BasketCatalogRow = { basketId: string; basketKey: string; version: bigint };
type ProductCatalogRow = { productWorkspaceId: string };
type ClearanceCatalogRow = { clearanceId: string };
type WorkingCatalogRow = { workingStpId: string };
type LockCatalogRow = { lockId: string };
type B10CatalogRow = { decisionId: string };

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
    const basketReader = new FlowCandidateBasketReader(baskets);
    const b7 = new CandidateB7DecisionService({
      db, artifactStore: artifacts, basketReader,
      configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY },
    });
    const b7Reader = new GovernanceCandidateB7DecisionReader(b7);
    const products = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(b7) });
    const productReader = new FlowProductWorkspaceReader(products);
    const b8 = new ProductB8LaneDecisionService({
      db, artifactStore: artifacts, productWorkspaceReader: productReader,
      configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY },
    });
    const b8Reader = new GovernanceProductB8Reader(b8);
    const clearances = new B8ClearanceService({ db, artifactStore: artifacts, decisionReader: b8Reader, statusReader: b8Reader });
    const clearanceReader = new FlowB8ClearanceReader(clearances);
    const stps = new StpService({ db, artifactStore: artifacts, productWorkspaceReader: productReader, b8ClearanceReader: clearanceReader });
    const stpReader = new FlowLockedStpReader(stps);
    const b10Reader = new GovernanceProductB10Reader(new ProductB10DecisionService({ db, artifactStore: artifacts, lockedStpReader: stpReader }));

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
    const basketRows = db.prepare(`SELECT basket_id basketId, basket_key basketKey, version FROM flow_candidate_baskets WHERE workspace_id=? ORDER BY basket_key, version`);
    const productRows = db.prepare(`SELECT product_workspace_id productWorkspaceId FROM flow_product_workspaces WHERE source_workspace_id=? ORDER BY created_at, product_workspace_id`);
    const productByB7Decision = db.prepare(`SELECT product_workspace_id productWorkspaceId FROM flow_product_workspaces WHERE source_b7_decision_id=?`);
    const productExists = db.prepare(`SELECT product_workspace_id productWorkspaceId FROM flow_product_workspaces WHERE product_workspace_id=?`);
    const clearanceRow = db.prepare(`SELECT clearance_id clearanceId FROM flow_b8_clearances WHERE product_workspace_id=?`);
    const workingRow = db.prepare(`SELECT working_stp_id workingStpId FROM flow_stp_working_records WHERE product_workspace_id=?`);
    const lockRow = db.prepare(`SELECT lock_id lockId FROM flow_locked_stps WHERE product_workspace_id=?`);
    const b10Rows = db.prepare(`SELECT decision_id decisionId FROM governance_product_b10_decisions WHERE product_workspace_id=? ORDER BY decision_number, decision_id`);

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
    const candidateBaskets = async (id: string): Promise<WorkspaceCandidateBasketsResponse | undefined> => {
      const row = discoveryRow.get(id) as DiscoveryCatalogRow | undefined;
      if (!row) return undefined;
      const workspace = await discoveryReader.readVerifiedWorkspace(id);
      if (workspace.workspaceId !== id) throw new Error('Verified discovery workspace has wrong identity');
      const results: WorkspaceCandidateBasketsResponse['baskets'] = [];
      const familyVersions = new Map<string, number>();
      for (const catalog of basketRows.all(id) as BasketCatalogRow[]) {
        const version = safeVersion(catalog.version);
        const expectedVersion = (familyVersions.get(catalog.basketKey) ?? 0) + 1;
        if (version !== expectedVersion) throw new Error('Candidate basket family has a non-sequential version history');
        familyVersions.set(catalog.basketKey, version);
        const basket = await basketReader.readVerifiedBasket(catalog.basketId);
        if (basket.basketId !== catalog.basketId || basket.workspaceId !== id || basket.basketKey !== catalog.basketKey || basket.version !== version) throw new Error('Verified basket has wrong identity, workspace, key, or version');
        results.push({ basketId: basket.basketId, workspaceId: basket.workspaceId, basketKey: basket.basketKey, version: basket.version, frozenAt: basket.frozenAt, candidates: basket.candidates.map((candidate) => ({ candidateId: candidate.candidateId, candidateKey: candidate.candidateKey, candidateVersion: candidate.candidateVersion, label: candidate.label, ...(candidate.summary === undefined ? {} : { summary: candidate.summary }), state: candidate.state })) });
      }
      return { contractVersion: '1.0.0', workspaceId: id, baskets: results };
    };
    const candidateBasketB7 = async (workspaceId: string, basketId: string): Promise<WorkspaceCandidateBasketB7Response | undefined> => {
      if (!discoveryRow.get(workspaceId)) return undefined;
      const workspace = await discoveryReader.readVerifiedWorkspace(workspaceId);
      if (workspace.workspaceId !== workspaceId) throw new Error('Verified discovery workspace has wrong identity');
      let basket;
      try { basket = await basketReader.readVerifiedBasket(basketId); } catch (error) {
        if (/not found/i.test((error as Error).message)) return undefined;
        throw error;
      }
      if (basket.basketId !== basketId || basket.workspaceId !== workspaceId) return undefined;
      const result: WorkspaceCandidateBasketB7Response['candidates'] = [];
      for (const member of basket.candidates) {
        const effective = await b7Reader.readEffectiveDecision(basketId, member.candidateId, member.candidateVersion);
        if (effective.basketId !== basketId || effective.candidateId !== member.candidateId || effective.candidateVersion !== member.candidateVersion) throw new Error('B7 decision reader returned wrong identity');
        const base = { candidateId: member.candidateId, candidateKey: member.candidateKey, candidateVersion: member.candidateVersion, label: member.label, ...(member.summary === undefined ? {} : { summary: member.summary }), state: member.state, effectiveState: effective.effectiveState };
        if (effective.effectiveState === 'NO_DECISION') result.push(base);
        else {
          if (effective.decision.basket.basketId !== basketId || effective.decision.candidate.candidateId !== member.candidateId || effective.decision.candidate.candidateVersion !== member.candidateVersion || effective.decision.decision !== effective.effectiveState) throw new Error('B7 decision identity mismatch');
          const productRow = productByB7Decision.get(effective.decision.decisionId) as ProductCatalogRow | undefined;
          if (!productRow) result.push({ ...base, decisionId: effective.decision.decisionId, decidedAt: effective.decision.decidedAt });
          else {
            if (effective.effectiveState !== 'PASS') throw new Error('A non-PASS B7 decision has a product workspace');
            const product = await productReader.readVerifiedProductWorkspace(productRow.productWorkspaceId);
            if (product.productWorkspaceId !== productRow.productWorkspaceId || product.source.discoveryWorkspace.workspaceId !== workspaceId ||
                product.source.basket.basketId !== basketId || product.source.basket.basketKey !== basket.basketKey || product.source.basket.basketVersion !== basket.version ||
                product.source.candidate.candidateId !== member.candidateId || product.source.candidate.candidateVersion !== member.candidateVersion ||
                product.source.candidate.candidateKey !== member.candidateKey || product.source.candidate.label !== member.label ||
                product.source.candidate.summary !== member.summary || product.source.candidate.state !== member.state ||
                product.source.b7Decision.decisionId !== effective.decision.decisionId || product.source.b7Decision.decidedAt !== effective.decision.decidedAt ||
                product.source.b7Decision.decision !== 'PASS') throw new Error('Product workspace frozen source lineage mismatch');
            result.push({ ...base, decisionId: effective.decision.decisionId, decidedAt: effective.decision.decidedAt, productWorkspace: productSummary(product) });
          }
        }
      }
      return { contractVersion: '1.0.0', workspaceId, basketId, basketKey: basket.basketKey, basketVersion: basket.version, frozenAt: basket.frozenAt, candidates: result };
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

    const productB9 = async (id: string): Promise<ProductB9Response | undefined> => {
      if (!productExists.get(id)) return undefined;
      await productReader.readVerifiedProductWorkspace(id);
      const catalogWorking = workingRow.get(id) as WorkingCatalogRow | undefined;
      const catalogLock = lockRow.get(id) as LockCatalogRow | undefined;
      if (!catalogWorking) {
        if (catalogLock) throw new Error('B9 lock catalog has no working record');
        return { contractVersion: '1.0.0', productWorkspaceId: id, state: 'NOT_STARTED' };
      }
      const status = await stpReader.readStatusByProductWorkspace(id);
      if (status.state === 'NOT_STARTED' || status.working.workingStpId !== catalogWorking.workingStpId) throw new Error('B9 catalog identity mismatch');
      const working = { workingStpId: status.working.workingStpId, b8ClearanceId: status.working.b8ClearanceId, workingRevision: b9WorkingRevision(status.working.workingDigest), content: status.working.content, createdAt: status.working.createdAt, updatedAt: status.working.updatedAt };
      if (status.state === 'WORKING') {
        if (catalogLock) throw new Error('B9 lock catalog mismatch');
        return { contractVersion: '1.0.0', productWorkspaceId: id, state: 'WORKING', working };
      }
      if (!catalogLock || status.locked.lockId !== catalogLock.lockId) throw new Error('B9 lock catalog identity mismatch');
      return { contractVersion: '1.0.0', productWorkspaceId: id, state: 'LOCKED', working, locked: { lockId: status.locked.lockId, state: status.locked.state, lockedAt: status.locked.lockedAt } };
    };
    const productB10 = async (id: string): Promise<ProductB10Response | undefined> => {
      if (!productExists.get(id)) return undefined;
      await productReader.readVerifiedProductWorkspace(id);
      const catalog = b10Rows.all(id) as B10CatalogRow[];
      const verified = await b10Reader.readHistoryByProductWorkspace(id);
      if (catalog.length !== verified.decisions.length || catalog.some((row, index) => row.decisionId !== verified.decisions[index]?.decisionId)) throw new Error('B10 catalog identity mismatch');
      const history = verified.decisions.map((decision) => ({ decisionId: decision.decisionId, decisionNumber: decision.decisionNumber, previousDecisionId: decision.previousDecisionId, decision: decision.decision, decidedAt: decision.decidedAt, lockedStpId: decision.lockedStp.lockId }));
      return { contractVersion: '1.0.0', productWorkspaceId: id, history, effective: history.at(-1) ?? null, readyForB11: verified.status.readyForB11 };
    };
    const handler = (request: IncomingMessage, response: ServerResponse): void => {
      void route(request, response, { portfolio, discoveryDetail, candidateBaskets, candidateBasketB7, productDetail, productB9, productB10 });
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
  candidateBaskets(id: string): Promise<WorkspaceCandidateBasketsResponse | undefined>;
  candidateBasketB7(workspaceId: string, basketId: string): Promise<WorkspaceCandidateBasketB7Response | undefined>;
  productDetail(id: string): Promise<ProductWorkspaceDetailResponse | undefined>;
  productB9(id: string): Promise<ProductB9Response | undefined>;
  productB10(id: string): Promise<ProductB10Response | undefined>;
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
    if (parts.length === 6 && parts[0] === 'api' && parts[1] === 'workspaces' && parts[3] === 'candidate-baskets' && parts[5] === 'b7') {
      if (!UUID.test(parts[2]!) || !UUID.test(parts[4]!)) return sendError(response, 400, 'bad_request', 'Workspace and basket IDs must be UUIDs');
      const result = await methods.candidateBasketB7(parts[2]!, parts[4]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Workspace or candidate basket not found');
    }
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspaces' && parts[3] === 'candidate-baskets') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Workspace ID must be a UUID');
      const result = await methods.candidateBaskets(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Workspace not found');
    }
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'workspaces') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Workspace ID must be a UUID');
      const result = await methods.discoveryDetail(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Workspace not found');
    }
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'product-workspaces' && (parts[3] === 'b9' || parts[3] === 'b10')) {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Product workspace ID must be a UUID');
      const result = parts[3] === 'b9' ? await methods.productB9(parts[2]!) : await methods.productB10(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Product workspace not found');
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
  const required = ['artifact_manifests', 'flow_discovery_workspaces', 'flow_product_candidates', 'flow_product_candidate_revisions', 'flow_candidate_baskets', 'flow_candidate_basket_members', 'governance_candidate_b7_decisions', 'flow_product_workspaces', 'governance_product_b8_lane_decisions', 'flow_b8_clearances', 'flow_b8_clearance_decisions', 'flow_stp_working_records', 'flow_locked_stps', 'governance_product_b10_decisions'];
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
  const names = new Set(rows.map((row) => row.name));
  if (required.some((name) => !names.has(name))) throw new Error('Database is missing required owner tables');
}

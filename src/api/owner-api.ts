import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { OwnerApiErrorResponse, OwnerB8DecisionReceipt, OwnerB8DecisionRequest } from '../../contracts/api/owner-b8-decision-api.generated.js';
import type { OwnerB8ClearanceReceipt, OwnerB8ClearanceRequest } from '../../contracts/api/owner-b8-clearance-api.generated.js';
import type { OwnerB9LockReceipt, OwnerB9LockRequest, OwnerB9WorkingReceipt, OwnerB9WorkingRequest } from '../../contracts/api/owner-b9-stp-api.generated.js';
import type { OwnerB10DecisionReceipt, OwnerB10DecisionRequest } from '../../contracts/api/owner-b10-decision-api.generated.js';
import type { OwnerDiscoveryWorkspaceReceipt, OwnerDiscoveryWorkspaceRequest } from '../../contracts/api/owner-discovery-workspace-api.generated.js';
import type { OwnerProductCandidateCreateRequest, OwnerProductCandidateReceipt, OwnerProductCandidateRevisionRequest } from '../../contracts/api/owner-product-candidate-api.generated.js';
import type { OwnerCandidateBasketRequest, OwnerCandidateBasketReceipt } from '../../contracts/api/owner-candidate-basket-api.generated.js';
import type { OwnerB7DecisionReceipt, OwnerB7DecisionRequest } from '../../contracts/api/owner-b7-decision-api.generated.js';
import type { OwnerProductWorkspaceReceipt, OwnerProductWorkspaceRequest } from '../../contracts/api/owner-product-workspace-api.generated.js';
import { RequestScopedArtifactStore } from './request-scoped-artifact-store.js';
import { withDatabaseMutationMutex } from '../platform/db/index.js';
import { CandidateB7DecisionIdentityConflictError, CandidateB7DecisionService, CANDIDATE_B7_DECISION_CAPABILITY, CANDIDATE_B7_DECISION_POLICY_ID } from '../modules/governance/candidate-b7-decision-service.js';
import { GovernanceCandidateB7DecisionReader } from '../modules/governance/candidate-b7-decision-reader.js';
import { CandidateBasketIdentityConflictError, CandidateBasketService } from '../modules/flow/candidate-basket-service.js';
import { FlowCandidateBasketReader } from '../modules/flow/candidate-basket-reader.js';
import { DiscoveryWorkspaceIdentityConflictError, DiscoveryWorkspaceService } from '../modules/flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../modules/flow/discovery-workspace-reader.js';
import { ProductCandidateIdentityConflictError, ProductCandidateService } from '../modules/flow/product-candidate-service.js';
import { FlowProductCandidateReader } from '../modules/flow/product-candidate-reader.js';
import { ProductWorkspaceIdentityConflictError, ProductWorkspaceService } from '../modules/flow/product-workspace-service.js';
import { FlowProductWorkspaceReader } from '../modules/flow/product-workspace-reader.js';
import { GovernanceValidationError } from '../modules/governance/validation.js';
import { ProductB8DecisionIdentityConflictError, ProductB8LaneDecisionService, PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B8_REVIEW_POLICY_ID } from '../modules/governance/product-b8-lane-decision-service.js';
import { GovernanceProductB8Reader } from '../modules/governance/product-b8-status-reader.js';
import { B8ClearanceIdentityConflictError, B8ClearanceService } from '../modules/flow/b8-clearance-service.js';
import { FlowValidationError, validateCandidateBasketFreezeRequest, validateDiscoveryWorkspaceRequest, validateProductCandidateCreateRequest, validateProductCandidateRevisionRequest, validateProductWorkspaceCreateRequest } from '../modules/flow/validation.js';
import { FlowB8ClearanceReader } from '../modules/flow/b8-clearance-reader.js';
import { PRODUCT_B9_LOCK_CAPABILITY, StpIdentityConflictError, StpService } from '../modules/flow/stp-service.js';
import { FlowLockedStpReader } from '../modules/flow/locked-stp-reader.js';
import { ProductB10DecisionIdentityConflictError, ProductB10DecisionService, PRODUCT_B10_REVIEW_CAPABILITY } from '../modules/governance/product-b10-decision-service.js';
import { b9WorkingRevision, matchesB9WorkingRevision, validB9WorkingRevision } from './b9-working-revision.js';
import { canonicalJson } from '../modules/foundation/canonical-json.js';

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
    const artifacts = new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot));
    const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const candidates = new ProductCandidateService({ db, artifactStore: artifacts, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const baskets = new CandidateBasketService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), candidateReader: new FlowProductCandidateReader(candidates), ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const b7 = new CandidateB7DecisionService({ db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets), configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY }, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const products = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(b7), ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const service = new ProductB8LaneDecisionService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(products), configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY }, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const b8Reader = new GovernanceProductB8Reader(service);
    const clearances = new B8ClearanceService({ db, artifactStore: artifacts, decisionReader: b8Reader, statusReader: b8Reader, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const stps = new StpService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(products), b8ClearanceReader: new FlowB8ClearanceReader(clearances), ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const lockedStps = new FlowLockedStpReader(stps);
    const b10 = new ProductB10DecisionService({ db, artifactStore: artifacts, lockedStpReader: lockedStps, ...(configuration.now ? { now: configuration.now } : {}), ...(configuration.uuid ? { uuid: configuration.uuid } : {}) });
    const actor = Object.freeze({ actorId: configuration.actorId, roleSnapshot: 'OWNER' as const, capabilities: new Set<string>([CANDIDATE_B7_DECISION_CAPABILITY, PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B9_LOCK_CAPABILITY, PRODUCT_B10_REVIEW_CAPABILITY]) });
    const workspaceByKey = db.prepare(`SELECT workspace_id workspaceId, workspace_key workspaceKey, state, title, description,
      request_sha256 requestSha256, workspace_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_discovery_workspaces WHERE workspace_key=?`);
    const workspaceManifest = db.prepare('SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, acquired_at acquiredAt, contract_version contractVersion, retention_status retentionStatus, created_at createdAt FROM artifact_manifests WHERE sha256=?');
    const discoveryExists = db.prepare('SELECT 1 FROM flow_discovery_workspaces WHERE workspace_id=?');
    const candidateByKey = db.prepare(`SELECT c.candidate_id candidateId, c.workspace_id workspaceId, c.candidate_key candidateKey, c.state,
      r.version, r.label, r.summary, r.request_sha256 requestSha256, r.candidate_artifact_sha256 artifactSha256, r.created_at createdAt
      FROM flow_product_candidates c JOIN flow_product_candidate_revisions r ON r.candidate_id=c.candidate_id
      WHERE c.workspace_id=? AND c.candidate_key=? AND r.version=1`);
    const candidateByVersion = db.prepare(`SELECT c.candidate_id candidateId, c.workspace_id workspaceId, c.candidate_key candidateKey, c.state,
      r.version, r.label, r.summary, r.request_sha256 requestSha256, r.candidate_artifact_sha256 artifactSha256, r.created_at createdAt
      FROM flow_product_candidates c JOIN flow_product_candidate_revisions r ON r.candidate_id=c.candidate_id
      WHERE c.candidate_id=? AND r.version=?`);
    const candidateWorkspace = db.prepare('SELECT workspace_id workspaceId FROM flow_product_candidates WHERE candidate_id=?');
    const candidateHistory = db.prepare('SELECT version FROM flow_product_candidate_revisions WHERE candidate_id=? ORDER BY version');
    const basketFamily = db.prepare('SELECT basket_id basketId, version, request_sha256 requestSha256, basket_artifact_sha256 artifactSha256, member_count memberCount, frozen_at frozenAt FROM flow_candidate_baskets WHERE workspace_id=? AND basket_key=? ORDER BY version');
    const basketMembers = db.prepare('SELECT position, candidate_id candidateId, candidate_version candidateVersion, candidate_artifact_sha256 candidateArtifactSha256, candidate_key candidateKey, label, summary, state FROM flow_candidate_basket_members WHERE basket_id=? ORDER BY position');
    const basketWorkspace = db.prepare('SELECT workspace_id workspaceId FROM flow_candidate_baskets WHERE basket_id=?');
    const b7Existing = db.prepare(`SELECT decision_id decisionId, basket_id basketId, candidate_id candidateId,
      candidate_version candidateVersion, decision, actor_id actorId, role_snapshot roleSnapshot,
      required_capability requiredCapability, policy_id policyId, policy_version policyVersion,
      request_sha256 requestSha256, decision_artifact_sha256 artifactSha256, decided_at decidedAt
      FROM governance_candidate_b7_decisions WHERE basket_id=? AND candidate_id=? AND candidate_version=?`);
    const productByDecision = db.prepare(`SELECT product_workspace_id productWorkspaceId, product_workspace_key productWorkspaceKey, state, entry_step entryStep, title,
      source_workspace_id sourceWorkspaceId, source_basket_id sourceBasketId, source_candidate_id sourceCandidateId,
      source_candidate_version sourceCandidateVersion, source_b7_decision_id sourceB7DecisionId,
      request_sha256 requestSha256, product_workspace_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_product_workspaces WHERE source_b7_decision_id=?`);
    const productByKey = db.prepare(`SELECT product_workspace_id productWorkspaceId, product_workspace_key productWorkspaceKey, state, entry_step entryStep, title,
      source_workspace_id sourceWorkspaceId, source_basket_id sourceBasketId, source_candidate_id sourceCandidateId,
      source_candidate_version sourceCandidateVersion, source_b7_decision_id sourceB7DecisionId,
      request_sha256 requestSha256, product_workspace_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_product_workspaces WHERE product_workspace_key=?`);
    const productExists = db.prepare('SELECT 1 FROM flow_product_workspaces WHERE product_workspace_id=?');
    const clearanceExists = db.prepare('SELECT 1 FROM flow_b8_clearances WHERE product_workspace_id=?');
    const clearanceByProduct = db.prepare('SELECT clearance_id clearanceId FROM flow_b8_clearances WHERE product_workspace_id=?');
    const workingExists = db.prepare('SELECT 1 FROM flow_stp_working_records WHERE product_workspace_id=?');
    const lockExists = db.prepare('SELECT 1 FROM flow_locked_stps WHERE product_workspace_id=?');
    const lockById = db.prepare('SELECT product_workspace_id productWorkspaceId FROM flow_locked_stps WHERE lock_id=?');
    const b10History = db.prepare('SELECT decision_id decisionId FROM governance_product_b10_decisions WHERE product_workspace_id=? ORDER BY decision_number');
    const handler = (request: IncomingMessage, response: ServerResponse): void => { void route(request, response, configuration, async (body) => withDatabaseMutationMutex(db, async () => artifacts.withOwnership(async () => {
        const existing = workspaceByKey.get(body.workspaceKey) as ExistingWorkspaceRow | undefined;
        if (existing) {
          try { await discoveries.readWorkspace(existing.workspaceId); }
          catch {
            try { await recoverExactMissingWorkspaceArtifact(body, existing, workspaceManifest, artifacts); await discoveries.readWorkspace(existing.workspaceId); }
            catch { throw new ExistingDiscoveryWorkspaceIntegrityError(); }
          }
        }
        const result = await discoveries.createWorkspace(body);
        await artifacts.publishOwned();
        let verified;
        try { verified = await discoveries.readWorkspace(result.workspaceId); } catch { throw new ExistingDiscoveryWorkspaceIntegrityError(); }
        const receipt: OwnerDiscoveryWorkspaceReceipt = {
          contractVersion: '1.0.0', workspaceId: verified.workspaceId, workspaceKey: verified.workspaceKey, state: 'ACTIVE', title: verified.title,
          ...(verified.description === undefined ? {} : { description: verified.description }), createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
        assertOwnerWorkspaceReceipt(receipt);
        return receipt;
      })), async (workspaceId, body) => withDatabaseMutationMutex(db, async () => artifacts.withOwnership(async () => {
        if (!discoveryExists.get(workspaceId)) throw new UnknownDiscoveryWorkspaceError();
        try { await discoveries.readWorkspace(workspaceId); } catch { throw new ExistingDiscoveryWorkspaceIntegrityError(); }
        const serviceRequest = { ...body, workspaceId };
        const existing = candidateByKey.get(workspaceId, body.candidateKey) as ExistingCandidateRow | undefined;
        if (existing) await ensureCandidateTargetReadable(serviceRequest, existing, workspaceManifest, artifacts, candidates);
        const result = await candidates.createCandidate(serviceRequest);
        await artifacts.publishOwned();
        const verified = await readCandidateOrIntegrity(candidates, result.candidateId, 1);
        return candidateReceipt(verified, result.deduplicated);
      })), async (workspaceId, candidateId, body) => withDatabaseMutationMutex(db, async () => artifacts.withOwnership(async () => {
        if (!discoveryExists.get(workspaceId)) throw new UnknownDiscoveryWorkspaceError();
        try { await discoveries.readWorkspace(workspaceId); } catch { throw new ExistingDiscoveryWorkspaceIntegrityError(); }
        const membership = candidateWorkspace.get(candidateId) as { workspaceId: string } | undefined;
        if (!membership) throw new UnknownProductCandidateError();
        const serviceRequest = { ...body, candidateId };
        let currentCandidate;
        try { currentCandidate = await new FlowProductCandidateReader(candidates).readVerifiedCandidate(candidateId); }
        catch {
          const target = candidateByVersion.get(candidateId, body.expectedVersion + 1) as ExistingCandidateRow | undefined;
          if (!target || membership.workspaceId !== workspaceId) throw new ExistingProductCandidateIntegrityError();
          await ensureCandidateTargetReadable(serviceRequest, target, workspaceManifest, artifacts, candidates);
          try { currentCandidate = await new FlowProductCandidateReader(candidates).readVerifiedCandidate(candidateId); }
          catch { throw new ExistingProductCandidateIntegrityError(); }
        }
        if (currentCandidate.workspaceId !== workspaceId || membership.workspaceId !== currentCandidate.workspaceId) throw new ProductCandidatePairingConflictError();
        const target = candidateByVersion.get(candidateId, body.expectedVersion + 1) as ExistingCandidateRow | undefined;
        if (target) await ensureCandidateTargetReadable(serviceRequest, target, workspaceManifest, artifacts, candidates);
        try { for (const row of candidateHistory.all(candidateId) as { version: bigint }[]) await candidates.readCandidate(candidateId, Number(row.version)); }
        catch { throw new ExistingProductCandidateIntegrityError(); }
        const result = await candidates.reviseCandidate(serviceRequest);
        await artifacts.publishOwned();
        const verified = await readCandidateOrIntegrity(candidates, result.candidateId, result.version);
        return candidateReceipt(verified, result.deduplicated);
      })), async (workspaceId, body) => withDatabaseMutationMutex(db, async () => artifacts.withOwnership(async () => {
        if (!discoveryExists.get(workspaceId)) throw new UnknownDiscoveryWorkspaceError();
        try { const workspace = await discoveries.readWorkspace(workspaceId); if (workspace.workspaceId !== workspaceId) throw new Error(); } catch { throw new ExistingCandidateBasketIntegrityError(); }
        for (const selection of body.candidates) {
          const membership = candidateWorkspace.get(selection.candidateId) as { workspaceId: string } | undefined;
          if (!membership || !candidateByVersion.get(selection.candidateId, selection.candidateVersion)) throw new UnknownProductCandidateError();
          let verifiedCandidate;
          try { verifiedCandidate = await new FlowProductCandidateReader(candidates).readVerifiedCandidate(selection.candidateId, selection.candidateVersion); }
          catch { throw new ExistingCandidateBasketIntegrityError(); }
          if (membership.workspaceId !== workspaceId || verifiedCandidate.workspaceId !== workspaceId) throw new ProductCandidatePairingConflictError();
        }
        const family = basketFamily.all(workspaceId, body.basketKey) as ExistingBasketRow[];
        assertSequentialBasketFamily(family);
        const target = family.find((row) => Number(row.version) === body.version);
        const serviceRequest = { ...body, workspaceId };
        if (target) await ensureBasketTargetReadable(serviceRequest, target, workspaceManifest, basketMembers, artifacts, baskets);
        try { for (const row of family) await baskets.readBasket(row.basketId); } catch { throw new ExistingCandidateBasketIntegrityError(); }
        const expectedVersion = family.length === 0 ? 1 : Number(family.at(-1)!.version) + 1;
        if (!target && body.version !== expectedVersion) throw new CandidateBasketVersionConflictError();
        const result = await baskets.freezeBasket(serviceRequest);
        await artifacts.publishOwned();
        let verified; try { verified = await baskets.readBasket(result.basketId); } catch { throw new ExistingCandidateBasketIntegrityError(); }
        return { contractVersion: '1.0.0', basketId: verified.basketId, workspaceId: verified.workspaceId, basketKey: verified.basketKey, version: verified.version, frozenAt: verified.frozenAt, candidateCount: verified.candidates.length, exactRetry: result.deduplicated };
      })), async (workspaceId, basketId, body) => withDatabaseMutationMutex(db, async () => artifacts.withOwnership(async () => {
        if (!discoveryExists.get(workspaceId)) throw new UnknownDiscoveryWorkspaceError();
        const basketRow = basketWorkspace.get(basketId) as { workspaceId: string } | undefined;
        if (!basketRow) throw new UnknownCandidateBasketError();
        if (basketRow.workspaceId !== workspaceId) throw new CandidateBasketPairingConflictError();
        let verifiedBasket; try { verifiedBasket = await baskets.readBasket(basketId); if (verifiedBasket.workspaceId !== workspaceId) throw new Error(); } catch { throw new ExistingB7IntegrityError(); }
        const existing = b7Existing.get(basketId, body.candidateId, body.candidateVersion) as ExistingB7Row | undefined;
        if (existing) {
          try { await b7.replay(existing.decisionId); }
          catch { try { await recoverExactMissingB7Artifact({ ...body, basketId }, existing, verifiedBasket, actor, workspaceManifest, artifacts); } catch { throw new ExistingB7IntegrityError(); } }
        }
        const result = await b7.decide({ ...body, basketId }, actor);
        await artifacts.publishOwned(result.decisionArtifactSha256);
        let verified; try { verified = await b7.replay(result.decisionId); } catch { throw new ExistingB7IntegrityError(); }
        return { contractVersion: '1.0.0', decisionId: verified.decisionId, workspaceId: verified.basket.workspaceId, basketId: verified.basket.basketId, candidateId: verified.candidate.candidateId, candidateVersion: verified.candidate.candidateVersion, decision: verified.decision, decidedAt: verified.decidedAt, exactRetry: result.deduplicated };
      })), async (workspaceId, basketId, decisionId, body) => withDatabaseMutationMutex(db, async () => artifacts.withOwnership(async () => {
        if (!discoveryExists.get(workspaceId)) throw new UnknownDiscoveryWorkspaceError();
        const basketRow = basketWorkspace.get(basketId) as { workspaceId: string } | undefined;
        if (!basketRow) throw new UnknownCandidateBasketError();
        if (basketRow.workspaceId !== workspaceId) throw new CandidateBasketPairingConflictError();
        let pass;
        try { pass = await b7.replay(decisionId); } catch (error) { if (/not found/i.test((error as Error).message)) throw new UnknownB7DecisionError(); throw new ExistingProductWorkspaceIntegrityError(); }
        if (pass.basket.workspaceId !== workspaceId || pass.basket.basketId !== basketId) throw new ProductWorkspacePairingConflictError();
        if (pass.decision !== 'PASS') throw new ProductWorkspaceEligibilityConflictError();
        const existingByDecision = productByDecision.get(decisionId) as ExistingProductWorkspaceRow | undefined;
        const existingByKey = productByKey.get(body.productWorkspaceKey) as ExistingProductWorkspaceRow | undefined;
        const existingRows = new Map([existingByDecision, existingByKey].filter((row): row is ExistingProductWorkspaceRow => row !== undefined).map((row) => [row.productWorkspaceId, row]));
        for (const existing of existingRows.values()) {
          try { await products.replay(existing.productWorkspaceId); }
          catch {
            const isExactTarget = existing.sourceB7DecisionId === decisionId && existing.productWorkspaceKey === body.productWorkspaceKey;
            if (!isExactTarget) throw new ExistingProductWorkspaceIntegrityError();
            try { await recoverExactMissingProductWorkspaceArtifact({ ...body, decisionId }, existing, pass, workspaceManifest, artifacts); await products.replay(existing.productWorkspaceId); }
            catch { throw new ExistingProductWorkspaceIntegrityError(); }
          }
        }
        const result = await products.createWorkspace({ ...body, decisionId });
        await artifacts.publishOwned(result.productWorkspaceArtifactSha256);
        let verified; try { verified = await products.replay(result.productWorkspaceId); } catch { throw new ExistingProductWorkspaceIntegrityError(); }
        const receipt: OwnerProductWorkspaceReceipt = { contractVersion: '1.0.0', productWorkspaceId: verified.productWorkspaceId, productWorkspaceKey: verified.productWorkspaceKey, workspaceId: verified.source.discoveryWorkspace.workspaceId, basketId: verified.source.basket.basketId, candidateId: verified.source.candidate.candidateId, candidateVersion: verified.source.candidate.candidateVersion, b7DecisionId: verified.source.b7Decision.decisionId, state: 'ACTIVE', entryStep: 'B8', title: verified.title, createdAt: verified.createdAt, exactRetry: result.deduplicated };
        return receipt;
      })), async (productWorkspaceId, body) => {
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
      const { expectedWorkingRevision: _, ...content } = body;
      let expectedWorkingDigest: string | null = null;
      if (existed) {
        let current;
        try { current = await stps.readVerifiedWorking(productWorkspaceId); } catch { throw new ExistingStpIntegrityError(); }
        const requestedContent = { segments: content.segments, primaryTargetSegmentKey: content.primaryTargetSegmentKey, ...(content.secondaryTargetSegmentKeys === undefined ? {} : { secondaryTargetSegmentKeys: content.secondaryTargetSegmentKeys }), positioningStatement: content.positioningStatement };
        const unchanged = canonicalJson(requestedContent) === canonicalJson(current.content);
        if (body.expectedWorkingRevision === null) {
          if (!unchanged) throw new StpIdentityConflictError('Initial B9 working revision is stale');
        } else if (matchesB9WorkingRevision(body.expectedWorkingRevision, current.workingDigest)) expectedWorkingDigest = current.workingDigest;
        else if (!unchanged) throw new StpIdentityConflictError('STP working revision is stale');
      } else if (body.expectedWorkingRevision !== null) throw new StpIdentityConflictError('B9 working record is missing');
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
    }, async (productWorkspaceId, body) => {
      if (!productExists.get(productWorkspaceId)) throw new UnknownProductWorkspaceError();
      const lockRow = lockById.get(body.lockedStpId) as { productWorkspaceId: string } | undefined;
      if (!lockRow) throw new UnknownLockedStpError();
      if (lockRow.productWorkspaceId !== productWorkspaceId) throw new ProductB10DecisionIdentityConflictError('B10 locked STP belongs to another product workspace');
      let locked;
      try { locked = await lockedStps.readVerifiedLockedStp(body.lockedStpId); } catch { throw new ExistingB10IntegrityError(); }
      if (locked.productWorkspace.artifact.productWorkspaceId !== productWorkspaceId) throw new ProductB10DecisionIdentityConflictError('B10 locked STP belongs to another product workspace');
      try { for (const row of b10History.all(productWorkspaceId) as { decisionId: string }[]) await b10.replay(row.decisionId); } catch { throw new ExistingB10IntegrityError(); }
      const result = await b10.decide(body, actor);
      let verified;
      try { verified = await b10.replay(result.decisionId); } catch { throw new ExistingB10IntegrityError(); }
      return { contractVersion: '1.0.0', decisionId: result.decisionId, decisionNumber: result.decisionNumber, previousDecisionId: verified.previousDecisionId, decision: result.decision, decidedAt: verified.decidedAt, readyForB11: result.decision === 'APPROVE', exactRetry: result.deduplicated };
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
  createWorkspace: (body: OwnerDiscoveryWorkspaceRequest) => Promise<OwnerDiscoveryWorkspaceReceipt>,
  createCandidate: (workspaceId: string, body: OwnerProductCandidateCreateRequest) => Promise<OwnerProductCandidateReceipt>,
  reviseCandidate: (workspaceId: string, candidateId: string, body: OwnerProductCandidateRevisionRequest) => Promise<OwnerProductCandidateReceipt>,
  freezeBasket: (workspaceId: string, body: OwnerCandidateBasketRequest) => Promise<OwnerCandidateBasketReceipt>,
  decideB7: (workspaceId: string, basketId: string, body: OwnerB7DecisionRequest) => Promise<OwnerB7DecisionReceipt>,
  createProductWorkspace: (workspaceId: string, basketId: string, decisionId: string, body: OwnerProductWorkspaceRequest) => Promise<OwnerProductWorkspaceReceipt>,
  decide: (id: string, body: OwnerB8DecisionRequest) => Promise<OwnerB8DecisionReceipt>,
  clear: (id: string, body: OwnerB8ClearanceRequest) => Promise<OwnerB8ClearanceReceipt>,
  saveWorking: (id: string, body: OwnerB9WorkingRequest) => Promise<OwnerB9WorkingReceipt & { created: boolean }>,
  lock: (id: string, body: OwnerB9LockRequest) => Promise<OwnerB9LockReceipt>,
  decideB10: (id: string, body: OwnerB10DecisionRequest) => Promise<OwnerB10DecisionReceipt>,
): Promise<void> {
  const origin = singleHeader(request.headers.origin);
  if (origin !== undefined && origin !== configuration.allowedOrigin) return sendError(response, 403, 'forbidden', 'Origin is not allowed');
  if (origin) cors(response, origin);
  const matched = ownerRoute(request.url);
  if (matched === null) return sendError(response, 404, 'not_found', 'Route not found');
  if (matched.operation === 'candidateCreate' && !UUID.test(matched.workspaceId)) return sendError(response, 400, 'bad_request', 'Workspace ID must be a UUID');
  if ((matched.operation === 'candidateCreate' || matched.operation === 'basketCreate') && !UUID.test(matched.workspaceId)) return sendError(response, 400, 'bad_request', 'Workspace ID must be a UUID');
  if (matched.operation === 'candidateRevision' && (!UUID.test(matched.workspaceId) || !UUID.test(matched.candidateId))) return sendError(response, 400, 'bad_request', 'Workspace and candidate IDs must be UUIDs');
  if ((matched.operation === 'b7Decision' || matched.operation === 'productWorkspaceCreate') && (!UUID.test(matched.workspaceId) || !UUID.test(matched.basketId))) return sendError(response, 400, 'bad_request', 'Workspace and basket IDs must be UUIDs');
  if (matched.operation === 'productWorkspaceCreate' && !UUID.test(matched.decisionId)) return sendError(response, 400, 'bad_request', 'B7 decision ID must be a UUID');
  if ('productWorkspaceId' in matched && !UUID.test(matched.productWorkspaceId)) return sendError(response, 400, 'bad_request', 'Product workspace ID must be a UUID');
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
    if (matched.operation === 'workspace') {
      if (!ownerWorkspaceBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid discovery workspace request');
      try { validateDiscoveryWorkspaceRequest(body); } catch (error) { if (error instanceof FlowValidationError) return sendError(response, 400, 'bad_request', 'Invalid discovery workspace request'); throw error; }
      const receipt = await createWorkspace(body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'candidateCreate') {
      if (!ownerCandidateCreateBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid product candidate create request');
      try { validateProductCandidateCreateRequest({ ...body, workspaceId: matched.workspaceId }); } catch (error) { if (error instanceof FlowValidationError) return sendError(response, 400, 'bad_request', 'Invalid product candidate create request'); throw error; }
      const receipt = await createCandidate(matched.workspaceId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'basketCreate') {
      if (!ownerCandidateBasketBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid candidate basket request');
      try { validateCandidateBasketFreezeRequest({ ...body, workspaceId: matched.workspaceId }); } catch (error) { if (error instanceof FlowValidationError) return sendError(response, 400, 'bad_request', 'Invalid candidate basket request'); throw error; }
      const receipt = await freezeBasket(matched.workspaceId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'b7Decision') {
      if (!ownerB7DecisionBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B7 decision request');
      const receipt = await decideB7(matched.workspaceId, matched.basketId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'productWorkspaceCreate') {
      if (!ownerProductWorkspaceBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid product workspace request');
      try { validateProductWorkspaceCreateRequest({ ...body, decisionId: matched.decisionId }); } catch (error) { if (error instanceof FlowValidationError) return sendError(response, 400, 'bad_request', 'Invalid product workspace request'); throw error; }
      const receipt = await createProductWorkspace(matched.workspaceId, matched.basketId, matched.decisionId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (matched.operation === 'candidateRevision') {
      if (!ownerCandidateRevisionBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid product candidate revision request');
      try { validateProductCandidateRevisionRequest({ ...body, candidateId: matched.candidateId }); } catch (error) { if (error instanceof FlowValidationError) return sendError(response, 400, 'bad_request', 'Invalid product candidate revision request'); throw error; }
      const receipt = await reviseCandidate(matched.workspaceId, matched.candidateId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (!('productWorkspaceId' in matched)) return sendError(response, 404, 'not_found', 'Route not found');
    const productWorkspaceId = matched.productWorkspaceId;
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
    if (matched.operation === 'lock') {
      if (!ownerLockBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B9 lock request');
      const receipt = await lock(productWorkspaceId, body);
      return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (!ownerB10DecisionBodyShape(body)) return sendError(response, 400, 'bad_request', 'Invalid B10 decision request');
    const receipt = await decideB10(productWorkspaceId, body);
    return sendJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof ExistingClearanceIntegrityError || error instanceof ExistingStpIntegrityError || error instanceof ExistingB10IntegrityError || error instanceof ExistingDiscoveryWorkspaceIntegrityError || error instanceof ExistingProductCandidateIntegrityError || error instanceof ExistingCandidateBasketIntegrityError || error instanceof ExistingB7IntegrityError || error instanceof ExistingProductWorkspaceIntegrityError) return sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof PayloadTooLargeError) return sendError(response, 400, 'bad_request', 'Request body is too large');
    if (error instanceof DiscoveryWorkspaceIdentityConflictError) return matched.operation === 'workspace' && /changed content/i.test(error.message) ? sendError(response, 409, 'conflict', 'Discovery workspace key conflicts with existing content') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof ProductCandidatePairingConflictError) return sendError(response, 409, 'conflict', 'Product candidate belongs to another workspace');
    if (error instanceof ProductCandidateIdentityConflictError) return candidateSemanticConflict(error) ? sendError(response, 409, 'conflict', 'Product candidate conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof CandidateBasketVersionConflictError) return sendError(response, 409, 'conflict', 'Candidate basket version conflicts with current state');
    if (error instanceof CandidateBasketIdentityConflictError) return /already exists with changed membership or metadata/i.test(error.message) ? sendError(response, 409, 'conflict', 'Candidate basket conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof CandidateB7DecisionIdentityConflictError) return /already has a B7 decision with changed request/i.test(error.message) ? sendError(response, 409, 'conflict', 'B7 decision conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof CandidateBasketPairingConflictError) return sendError(response, 409, 'conflict', 'Candidate basket belongs to another workspace');
    if (error instanceof ProductWorkspacePairingConflictError || error instanceof ProductWorkspaceEligibilityConflictError) return sendError(response, 409, 'conflict', 'Product workspace conflicts with B7 source state');
    if (error instanceof ProductWorkspaceIdentityConflictError) return /key or B7 PASS already exists with changed identity/i.test(error.message) ? sendError(response, 409, 'conflict', 'Product workspace conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof ProductB8DecisionIdentityConflictError) return sendError(response, 409, 'conflict', 'B8 decision conflicts with current state');
    if (error instanceof ProductB10DecisionIdentityConflictError) return b10SemanticConflict(error) ? sendError(response, 409, 'conflict', 'B10 decision conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof B8ClearanceIdentityConflictError) return clearanceSemanticConflict(error) ? sendError(response, 409, 'conflict', 'B8 clearance conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    if (error instanceof UnknownDiscoveryWorkspaceError) return sendError(response, 404, 'not_found', 'Discovery workspace not found');
    if (error instanceof UnknownProductCandidateError) return sendError(response, 404, 'not_found', 'Product candidate not found');
    if (error instanceof UnknownCandidateBasketError) return sendError(response, 404, 'not_found', 'Candidate basket not found');
    if (error instanceof UnknownB7DecisionError) return sendError(response, 404, 'not_found', 'B7 decision not found');
    if (error instanceof UnknownProductWorkspaceError) return sendError(response, 404, 'not_found', 'Product workspace not found');
    if (error instanceof UnknownLockedStpError) return sendError(response, 404, 'not_found', 'Locked STP not found');
    if (error instanceof StpIdentityConflictError) return sendError(response, 409, 'conflict', matched.operation === 'working' ? 'B9 working conflicts with current state' : 'B9 lock conflicts with current state');
    if (error instanceof GovernanceValidationError) {
      if (matched.operation === 'b7Decision') return /exact membership/i.test(error.message) ? sendError(response, 409, 'conflict', 'B7 decision conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid B7 decision request');
      if (matched.operation === 'b10') return /invalid .*json|not canonical/i.test(error.message) ? sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification') : /not found|must change|requires previous|exact current|locked stp/i.test(error.message) ? sendError(response, 409, 'conflict', 'B10 decision conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid B10 decision request');
      if (matched.operation === 'clearance') return clearanceSemanticConflict(error) ? sendError(response, 409, 'conflict', 'B8 clearance conflicts with current state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
      if (/must change the effective decision/i.test(error.message)) return sendError(response, 409, 'conflict', 'B8 decision conflicts with current state');
      return sendError(response, 400, 'bad_request', 'Invalid B8 decision request');
    }
    if (error instanceof FlowValidationError) {
      if (matched.operation === 'productWorkspaceCreate') return /must be PASS/i.test(error.message) ? sendError(response, 409, 'conflict', 'Product workspace conflicts with B7 source state') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
      if (matched.operation === 'workspace') return sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
      if (matched.operation === 'candidateCreate' || matched.operation === 'candidateRevision') return /not found|version/i.test(error.message) ? sendError(response, 409, 'conflict', 'Product candidate conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid product candidate request');
      if (matched.operation === 'basketCreate') return /different workspace/i.test(error.message) ? sendError(response, 409, 'conflict', 'Candidate basket conflicts with current state') : /not found/i.test(error.message) ? sendError(response, 404, 'not_found', 'Candidate not found') : sendError(response, 400, 'bad_request', 'Invalid candidate basket request');
      if (matched.operation === 'working') return /locked|not found|requires null/i.test(error.message) ? sendError(response, 409, 'conflict', 'B9 working conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid B9 working request');
      if (matched.operation === 'lock') return /locked|requires one existing|trusted OWNER/i.test(error.message) ? sendError(response, 409, 'conflict', 'B9 lock conflicts with current state') : sendError(response, 400, 'bad_request', 'Invalid B9 lock request');
      return clearanceSemanticConflict(error) ? sendError(response, 409, 'conflict', 'B8 clearance conflicts with current state') : /distinct exact decision/i.test(error.message) ? sendError(response, 400, 'bad_request', 'Invalid B8 clearance request') : sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
    }
    return sendError(response, 500, 'integrity_error', 'Stored workspace data failed integrity verification');
  }
}

function ownerWorkspaceBodyShape(value: unknown): value is OwnerDiscoveryWorkspaceRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const allowed = new Set(['contractVersion', 'workspaceKey', 'title', 'description']);
  return Object.keys(body).every((key) => allowed.has(key)) && ['contractVersion', 'workspaceKey', 'title'].every((key) => Object.hasOwn(body, key));
}
type ExistingWorkspaceRow = { workspaceId: string; workspaceKey: string; state: string; title: string; description: string | null; requestSha256: string; artifactSha256: string; createdAt: string };
async function recoverExactMissingWorkspaceArtifact(body: OwnerDiscoveryWorkspaceRequest, row: ExistingWorkspaceRow, manifestStatement: BetterSqlite3.Statement, artifacts: RequestScopedArtifactStore): Promise<void> {
  const canonicalRequest = canonicalJson(body); const requestSha256 = createHash('sha256').update(Buffer.from(canonicalRequest, 'utf8')).digest('hex');
  if (row.workspaceKey !== body.workspaceKey || row.state !== 'ACTIVE' || row.title !== body.title || row.description !== (body.description ?? null) || row.requestSha256 !== requestSha256) throw new ExistingDiscoveryWorkspaceIntegrityError();
  const artifact = { contractVersion: '1.0.0', workspaceId: row.workspaceId, workspaceKey: row.workspaceKey, state: 'ACTIVE', title: row.title, ...(row.description === null ? {} : { description: row.description }), createdAt: row.createdAt, requestSha256: row.requestSha256 };
  const bytes = Buffer.from(canonicalJson(artifact), 'utf8'); const digest = createHash('sha256').update(bytes).digest('hex'); const relativePath = `sha256/${digest.slice(0, 2)}/${digest}`;
  const manifest = manifestStatement.get(row.artifactSha256) as { byteSize: bigint; mediaType: string; relativePath: string; acquiredAt: string; contractVersion: string; retentionStatus: string; createdAt: string } | undefined;
  if (digest !== row.artifactSha256 || !manifest || manifest.byteSize !== BigInt(bytes.byteLength) || manifest.mediaType !== 'application/json' || manifest.relativePath !== relativePath || manifest.acquiredAt !== row.createdAt || manifest.contractVersion !== '1.0.0' || manifest.retentionStatus !== 'active' || manifest.createdAt !== row.createdAt) throw new ExistingDiscoveryWorkspaceIntegrityError();
  try { await fs.access(artifacts.pathForDigest(digest)); throw new ExistingDiscoveryWorkspaceIntegrityError(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const staged = await artifacts.put(bytes); if (staged.sha256 !== digest || staged.relativePath !== relativePath) throw new ExistingDiscoveryWorkspaceIntegrityError();
  await artifacts.publishOwned();
}
function assertOwnerWorkspaceReceipt(value: OwnerDiscoveryWorkspaceReceipt): void { const keys = Object.keys(value).sort().join(','); const expected = ['contractVersion','workspaceId','workspaceKey','state','title','createdAt','exactRetry', ...(value.description === undefined ? [] : ['description'])].sort().join(','); if (keys !== expected || value.contractVersion !== '1.0.0' || !UUID.test(value.workspaceId) || !/^[a-z][a-z0-9_-]{2,79}$/.test(value.workspaceKey) || value.state !== 'ACTIVE' || value.title.length < 1 || value.title.length > 200 || (value.description !== undefined && (value.description.length < 1 || value.description.length > 1000)) || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.exactRetry !== 'boolean') throw new ExistingDiscoveryWorkspaceIntegrityError(); }
function ownerCandidateCreateBodyShape(value: unknown): value is OwnerProductCandidateCreateRequest { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const body=value as Record<string,unknown>; const allowed=new Set(['contractVersion','candidateKey','label','summary']); return Object.keys(body).every((key)=>allowed.has(key)) && ['contractVersion','candidateKey','label'].every((key)=>Object.hasOwn(body,key)); }
function ownerCandidateRevisionBodyShape(value: unknown): value is OwnerProductCandidateRevisionRequest { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const body=value as Record<string,unknown>; const allowed=new Set(['contractVersion','expectedVersion','label','summary']); return Object.keys(body).every((key)=>allowed.has(key)) && ['contractVersion','expectedVersion','label'].every((key)=>Object.hasOwn(body,key)); }
type ExistingCandidateRow = { candidateId:string; workspaceId:string; candidateKey:string; state:string; version:bigint; label:string; summary:string|null; requestSha256:string; artifactSha256:string; createdAt:string };
type CandidateRequest = { contractVersion:'1.0.0'; workspaceId:string; candidateKey:string; label:string; summary?:string } | { contractVersion:'1.0.0'; candidateId:string; expectedVersion:number; label:string; summary?:string };
async function ensureCandidateTargetReadable(request: CandidateRequest, row: ExistingCandidateRow, manifest: BetterSqlite3.Statement, artifacts: RequestScopedArtifactStore, candidates: ProductCandidateService): Promise<void> { try { await candidates.readCandidate(row.candidateId, Number(row.version)); } catch { try { await recoverExactMissingCandidateArtifact(request,row,manifest,artifacts); await candidates.readCandidate(row.candidateId,Number(row.version)); } catch { throw new ExistingProductCandidateIntegrityError(); } } }
async function recoverExactMissingCandidateArtifact(request: CandidateRequest, row: ExistingCandidateRow, manifestStatement: BetterSqlite3.Statement, artifacts: RequestScopedArtifactStore): Promise<void> {
  const requestSha256=createHash('sha256').update(Buffer.from(canonicalJson(request),'utf8')).digest('hex'); const isCreate='workspaceId' in request; const expectedVersion=isCreate?1:request.expectedVersion+1;
  if (row.version!==BigInt(expectedVersion) || row.state!=='EXPLORING' || row.requestSha256!==requestSha256 || row.label!==request.label || row.summary!==(request.summary??null) || (isCreate && (row.workspaceId!==request.workspaceId || row.candidateKey!==request.candidateKey)) || (!isCreate && row.candidateId!==request.candidateId)) throw new ExistingProductCandidateIntegrityError();
  const artifact={contractVersion:'1.0.0',candidateId:row.candidateId,workspaceId:row.workspaceId,candidateKey:row.candidateKey,state:'EXPLORING',version:expectedVersion,label:row.label,...(row.summary===null?{}:{summary:row.summary}),createdAt:row.createdAt,requestSha256:row.requestSha256};
  const bytes=Buffer.from(canonicalJson(artifact),'utf8'); const digest=createHash('sha256').update(bytes).digest('hex'); const relativePath=`sha256/${digest.slice(0,2)}/${digest}`; const manifest=manifestStatement.get(row.artifactSha256) as {byteSize:bigint;mediaType:string;relativePath:string;acquiredAt:string;contractVersion:string;retentionStatus:string;createdAt:string}|undefined;
  if (digest!==row.artifactSha256 || !manifest || manifest.byteSize!==BigInt(bytes.byteLength) || manifest.mediaType!=='application/json' || manifest.relativePath!==relativePath || manifest.acquiredAt!==row.createdAt || manifest.contractVersion!=='1.0.0' || manifest.retentionStatus!=='active' || manifest.createdAt!==row.createdAt) throw new ExistingProductCandidateIntegrityError();
  try { await fs.access(artifacts.pathForDigest(digest)); throw new ExistingProductCandidateIntegrityError(); } catch(error) { if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
  const staged=await artifacts.put(bytes); if(staged.sha256!==digest || staged.byteSize!==bytes.byteLength || staged.relativePath!==relativePath) throw new ExistingProductCandidateIntegrityError(); await artifacts.publishOwned();
}
async function readCandidateOrIntegrity(candidates:ProductCandidateService,candidateId:string,version:number) { try{return await candidates.readCandidate(candidateId,version);}catch{throw new ExistingProductCandidateIntegrityError();} }
function candidateReceipt(artifact:Awaited<ReturnType<ProductCandidateService['readCandidate']>>,exactRetry:boolean):OwnerProductCandidateReceipt { return {contractVersion:'1.0.0',candidateId:artifact.candidateId,workspaceId:artifact.workspaceId,candidateKey:artifact.candidateKey,state:'EXPLORING',version:artifact.version,label:artifact.label,...(artifact.summary===undefined?{}:{summary:artifact.summary}),createdAt:artifact.createdAt,exactRetry}; }
function ownerCandidateBasketBodyShape(value: unknown): value is OwnerCandidateBasketRequest { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const body=value as Record<string,unknown>; return Object.keys(body).sort().join(',')==='basketKey,candidates,contractVersion,version'; }
function ownerB7DecisionBodyShape(value: unknown): value is OwnerB7DecisionRequest { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const body=value as Record<string,unknown>; return Object.keys(body).sort().join(',')==='candidateId,candidateVersion,contractVersion,decision' && body.contractVersion==='1.0.0' && typeof body.candidateId==='string' && UUID.test(body.candidateId) && Number.isSafeInteger(body.candidateVersion) && (body.candidateVersion as number)>=1 && ['PASS','HOLD','REJECT'].includes(body.decision as string); }
function ownerProductWorkspaceBodyShape(value: unknown): value is OwnerProductWorkspaceRequest { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const body=value as Record<string,unknown>; return Object.keys(body).sort().join(',')==='contractVersion,productWorkspaceKey' && body.contractVersion==='1.0.0' && typeof body.productWorkspaceKey==='string' && /^[a-z][a-z0-9_-]{2,79}$/.test(body.productWorkspaceKey); }
type ExistingBasketRow = { basketId:string; version:bigint; requestSha256:string; artifactSha256:string; memberCount:bigint; frozenAt:string };
type ExistingBasketMemberRow = { position:bigint; candidateId:string; candidateVersion:bigint; candidateArtifactSha256:string; candidateKey:string; label:string; summary:string|null; state:string };
function assertSequentialBasketFamily(rows:ExistingBasketRow[]):void { rows.forEach((row,index)=>{ if(row.version!==BigInt(index+1)) throw new ExistingCandidateBasketIntegrityError(); }); }
async function ensureBasketTargetReadable(request:OwnerCandidateBasketRequest & {workspaceId:string},row:ExistingBasketRow,manifestStatement:BetterSqlite3.Statement,membersStatement:BetterSqlite3.Statement,artifacts:RequestScopedArtifactStore,baskets:CandidateBasketService):Promise<void>{ try{await baskets.readBasket(row.basketId);}catch{try{await recoverExactMissingBasketArtifact(request,row,manifestStatement,membersStatement,artifacts);await baskets.readBasket(row.basketId);}catch(error){if(error instanceof CandidateBasketIdentityConflictError) throw new ExistingCandidateBasketIntegrityError();throw new ExistingCandidateBasketIntegrityError();}} }
async function recoverExactMissingBasketArtifact(request:OwnerCandidateBasketRequest & {workspaceId:string},row:ExistingBasketRow,manifestStatement:BetterSqlite3.Statement,membersStatement:BetterSqlite3.Statement,artifacts:RequestScopedArtifactStore):Promise<void>{
  if(row.version!==BigInt(request.version)) throw new ExistingCandidateBasketIntegrityError();
  const sortedSelections=[...request.candidates].sort((a,b)=>a.candidateId<b.candidateId?-1:a.candidateId>b.candidateId?1:a.candidateVersion-b.candidateVersion);
  const canonicalRequest={...request,candidates:sortedSelections}; const requestSha256=createHash('sha256').update(Buffer.from(canonicalJson(canonicalRequest),'utf8')).digest('hex');
  if(row.requestSha256!==requestSha256) throw new CandidateBasketIdentityConflictError('Basket identity/version already exists with changed membership or metadata');
  const members=membersStatement.all(row.basketId) as ExistingBasketMemberRow[]; if(row.memberCount!==BigInt(members.length)||members.length!==sortedSelections.length) throw new ExistingCandidateBasketIntegrityError();
  const candidates=members.map((member,index)=>{const selection=sortedSelections[index];if(member.position!==BigInt(index)||member.candidateId!==selection?.candidateId||member.candidateVersion!==BigInt(selection.candidateVersion)||member.state!=='EXPLORING')throw new ExistingCandidateBasketIntegrityError();return {candidateId:member.candidateId,candidateKey:member.candidateKey,candidateVersion:Number(member.candidateVersion),candidateArtifactSha256:member.candidateArtifactSha256,label:member.label,...(member.summary===null?{}:{summary:member.summary}),state:'EXPLORING' as const};});
  const artifact={contractVersion:'1.0.0',basketId:row.basketId,workspaceId:request.workspaceId,basketKey:request.basketKey,version:request.version,frozenAt:row.frozenAt,requestSha256:row.requestSha256,candidates}; const bytes=Buffer.from(canonicalJson(artifact),'utf8'); const digest=createHash('sha256').update(bytes).digest('hex'); const relativePath=`sha256/${digest.slice(0,2)}/${digest}`;
  const manifest=manifestStatement.get(row.artifactSha256) as {byteSize:bigint;mediaType:string;relativePath:string;acquiredAt:string;contractVersion:string;retentionStatus:string;createdAt:string}|undefined; if(digest!==row.artifactSha256||!manifest||manifest.byteSize!==BigInt(bytes.byteLength)||manifest.mediaType!=='application/json'||manifest.relativePath!==relativePath||manifest.acquiredAt!==row.frozenAt||manifest.contractVersion!=='1.0.0'||manifest.retentionStatus!=='active'||manifest.createdAt!==row.frozenAt)throw new ExistingCandidateBasketIntegrityError();
  try{await fs.access(artifacts.pathForDigest(digest));throw new ExistingCandidateBasketIntegrityError();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;} const staged=await artifacts.put(bytes);if(staged.sha256!==digest||staged.byteSize!==bytes.byteLength||staged.relativePath!==relativePath)throw new ExistingCandidateBasketIntegrityError();await artifacts.publishOwned();
}
type ExistingB7Row = { decisionId:string; basketId:string; candidateId:string; candidateVersion:bigint; decision:'PASS'|'HOLD'|'REJECT'; actorId:string; roleSnapshot:string; requiredCapability:string; policyId:string; policyVersion:bigint; requestSha256:string; artifactSha256:string; decidedAt:string };
type VerifiedBasket = Awaited<ReturnType<CandidateBasketService['readBasket']>>;
async function recoverExactMissingB7Artifact(request:OwnerB7DecisionRequest & {basketId:string},row:ExistingB7Row,basket:VerifiedBasket,actor:{actorId:string;roleSnapshot:'OWNER'},manifestStatement:BetterSqlite3.Statement,artifacts:RequestScopedArtifactStore):Promise<void>{
  const member=basket.candidates.find((value)=>value.candidateId===request.candidateId&&value.candidateVersion===request.candidateVersion);
  if(!member||basket.basketId!==request.basketId||member.state!=='EXPLORING')throw new ExistingB7IntegrityError();
  const basketArtifactSha256=createHash('sha256').update(Buffer.from(canonicalJson(basket),'utf8')).digest('hex');
  const actorSnapshot={actorId:actor.actorId,roleSnapshot:'OWNER' as const};
  const requestSha256=createHash('sha256').update(Buffer.from(canonicalJson({request,basketArtifactSha256,frozenMember:member,actor:actorSnapshot,requiredCapability:CANDIDATE_B7_DECISION_CAPABILITY,policy:{policyId:CANDIDATE_B7_DECISION_POLICY_ID,policyVersion:1}}),'utf8')).digest('hex');
  if(row.basketId!==request.basketId||row.candidateId!==request.candidateId||row.candidateVersion!==BigInt(request.candidateVersion)||row.decision!==request.decision||row.actorId!==actor.actorId||row.roleSnapshot!=='OWNER'||row.requiredCapability!==CANDIDATE_B7_DECISION_CAPABILITY||row.policyId!==CANDIDATE_B7_DECISION_POLICY_ID||row.policyVersion!==1n||row.requestSha256!==requestSha256)throw new ExistingB7IntegrityError();
  const envelope={contractVersion:'1.0.0',decisionId:row.decisionId,decidedAt:row.decidedAt,basket:{basketId:basket.basketId,basketArtifactSha256,workspaceId:basket.workspaceId,basketKey:basket.basketKey,basketVersion:basket.version},candidate:{candidateId:member.candidateId,candidateVersion:member.candidateVersion,candidateArtifactSha256:member.candidateArtifactSha256,candidateKey:member.candidateKey,label:member.label,...(member.summary===undefined?{}:{summary:member.summary}),state:'EXPLORING'},decision:row.decision,actor:{actorId:row.actorId,roleSnapshot:'OWNER'},requiredCapability:CANDIDATE_B7_DECISION_CAPABILITY,policy:{policyId:CANDIDATE_B7_DECISION_POLICY_ID,policyVersion:1},requestSha256:row.requestSha256};
  const bytes=Buffer.from(canonicalJson(envelope),'utf8'); const digest=createHash('sha256').update(bytes).digest('hex'); const relativePath=`sha256/${digest.slice(0,2)}/${digest}`;
  const manifest=manifestStatement.get(row.artifactSha256) as {byteSize:bigint;mediaType:string;relativePath:string;acquiredAt:string;contractVersion:string;retentionStatus:string;createdAt:string}|undefined;
  if(digest!==row.artifactSha256||!manifest||manifest.byteSize!==BigInt(bytes.byteLength)||manifest.mediaType!=='application/json'||manifest.relativePath!==relativePath||manifest.acquiredAt!==row.decidedAt||manifest.contractVersion!=='1.0.0'||manifest.retentionStatus!=='active'||manifest.createdAt!==row.decidedAt)throw new ExistingB7IntegrityError();
  try{await fs.access(artifacts.pathForDigest(digest));throw new ExistingB7IntegrityError();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const staged=await artifacts.put(bytes);if(staged.sha256!==digest||staged.byteSize!==bytes.byteLength||staged.relativePath!==relativePath)throw new ExistingB7IntegrityError();
}
type ExistingProductWorkspaceRow = { productWorkspaceId:string; productWorkspaceKey:string; state:string; entryStep:string; title:string; sourceWorkspaceId:string; sourceBasketId:string; sourceCandidateId:string; sourceCandidateVersion:bigint; sourceB7DecisionId:string; requestSha256:string; artifactSha256:string; createdAt:string };
type VerifiedB7Decision = Awaited<ReturnType<CandidateB7DecisionService['replay']>>;
async function recoverExactMissingProductWorkspaceArtifact(request:OwnerProductWorkspaceRequest & {decisionId:string},row:ExistingProductWorkspaceRow,decision:VerifiedB7Decision,manifestStatement:BetterSqlite3.Statement,artifacts:RequestScopedArtifactStore):Promise<void>{
  const requestSha256=createHash('sha256').update(Buffer.from(canonicalJson(request),'utf8')).digest('hex');
  if(decision.decision!=='PASS'||decision.decisionId!==request.decisionId||row.productWorkspaceKey!==request.productWorkspaceKey||row.state!=='ACTIVE'||row.entryStep!=='B8'||row.title!==decision.candidate.label||row.sourceWorkspaceId!==decision.basket.workspaceId||row.sourceBasketId!==decision.basket.basketId||row.sourceCandidateId!==decision.candidate.candidateId||row.sourceCandidateVersion!==BigInt(decision.candidate.candidateVersion)||row.sourceB7DecisionId!==decision.decisionId||row.requestSha256!==requestSha256)throw new ExistingProductWorkspaceIntegrityError();
  const decisionArtifactSha256=createHash('sha256').update(Buffer.from(canonicalJson(decision),'utf8')).digest('hex');
  const source={discoveryWorkspace:{workspaceId:decision.basket.workspaceId},basket:{...decision.basket},candidate:{...decision.candidate},b7Decision:{contractVersion:decision.contractVersion,decisionId:decision.decisionId,decisionArtifactSha256,decidedAt:decision.decidedAt,decision:'PASS' as const,actor:{...decision.actor},requiredCapability:decision.requiredCapability,policy:{...decision.policy},requestSha256:decision.requestSha256}};
  const artifact={contractVersion:'1.0.0',productWorkspaceId:row.productWorkspaceId,productWorkspaceKey:row.productWorkspaceKey,state:'ACTIVE',entryStep:'B8',title:row.title,createdAt:row.createdAt,requestSha256:row.requestSha256,source};
  const bytes=Buffer.from(canonicalJson(artifact),'utf8');const digest=createHash('sha256').update(bytes).digest('hex');const relativePath=`sha256/${digest.slice(0,2)}/${digest}`;
  const manifest=manifestStatement.get(row.artifactSha256) as {byteSize:bigint;mediaType:string;relativePath:string;acquiredAt:string;contractVersion:string;retentionStatus:string;createdAt:string}|undefined;
  if(digest!==row.artifactSha256||!manifest||manifest.byteSize!==BigInt(bytes.byteLength)||manifest.mediaType!=='application/json'||manifest.relativePath!==relativePath||manifest.acquiredAt!==row.createdAt||manifest.contractVersion!=='1.0.0'||manifest.retentionStatus!=='active'||manifest.createdAt!==row.createdAt)throw new ExistingProductWorkspaceIntegrityError();
  try{await fs.access(artifacts.pathForDigest(digest));throw new ExistingProductWorkspaceIntegrityError();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const staged=await artifacts.put(bytes);if(staged.sha256!==digest||staged.byteSize!==bytes.byteLength||staged.relativePath!==relativePath)throw new ExistingProductWorkspaceIntegrityError();
}
function candidateSemanticConflict(error:Error):boolean { return /already exists with changed content|revision version or content drift/i.test(error.message); }
function clearanceSemanticConflict(error: Error): boolean { return /not found|must belong to|must be PASS|belongs to another|identical frozen|not currently ready|not the current effective PASS|cannot be assigned|already has a B8 clearance|different exact decision set|wrong .* decision/i.test(error.message); }
function b10SemanticConflict(error: Error): boolean { return /belongs to another|wrong lock|previousDecisionId|first B10 decision|changed request|actor|predecessor|decision/i.test(error.message) && !/artifact|manifest|immutable row|historical|digest mismatch/i.test(error.message); }
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
function ownerB10DecisionBodyShape(value: unknown): value is OwnerB10DecisionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).sort().join(',') === 'contractVersion,decision,lockedStpId,previousDecisionId' && body.contractVersion === '1.0.0' && typeof body.lockedStpId === 'string' && UUID.test(body.lockedStpId) && (body.previousDecisionId === null || (typeof body.previousDecisionId === 'string' && UUID.test(body.previousDecisionId))) && ['APPROVE', 'HOLD', 'REJECT'].includes(body.decision as string);
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
type OwnerRoute = { operation: 'workspace' } | { operation:'candidateCreate'|'basketCreate'; workspaceId:string } | { operation:'candidateRevision'; workspaceId:string; candidateId:string } | { operation:'b7Decision'; workspaceId:string; basketId:string } | { operation:'productWorkspaceCreate'; workspaceId:string; basketId:string; decisionId:string } | { productWorkspaceId: string; operation: 'decision' | 'clearance' | 'working' | 'lock' | 'b10' };
function ownerRoute(raw: string | undefined): OwnerRoute | null {
  if (!raw || /%(?:2e|2f|5c)/i.test(raw)) return null;
  let url: URL; try { url = new URL(raw, 'http://owner-api.local'); } catch { return null; }
  if (url.search || url.hash || url.pathname.includes('//')) return null;
  if (url.pathname === '/owner-api/workspaces') return { operation: 'workspace' };
  const productCreateMatch=/^\/owner-api\/workspaces\/([^/]+)\/candidate-baskets\/([^/]+)\/b7-decisions\/([^/]+)\/product-workspace$/.exec(url.pathname); if(productCreateMatch){try{const workspaceId=decodeURIComponent(productCreateMatch[1]!),basketId=decodeURIComponent(productCreateMatch[2]!),decisionId=decodeURIComponent(productCreateMatch[3]!);return [workspaceId,basketId,decisionId].some(id=>id.includes('/')||id.includes('\\')||id.includes('\0'))?null:{operation:'productWorkspaceCreate',workspaceId,basketId,decisionId};}catch{return null;}}
  const b7Match=/^\/owner-api\/workspaces\/([^/]+)\/candidate-baskets\/([^/]+)\/b7-decisions$/.exec(url.pathname); if(b7Match){try{const workspaceId=decodeURIComponent(b7Match[1]!),basketId=decodeURIComponent(b7Match[2]!);return [workspaceId,basketId].some(id=>id.includes('/')||id.includes('\\')||id.includes('\0'))?null:{operation:'b7Decision',workspaceId,basketId};}catch{return null;}}
  const basketMatch=/^\/owner-api\/workspaces\/([^/]+)\/candidate-baskets$/.exec(url.pathname); if(basketMatch){try{const workspaceId=decodeURIComponent(basketMatch[1]!);return workspaceId.includes('/')||workspaceId.includes('\\')||workspaceId.includes('\0')?null:{operation:'basketCreate',workspaceId};}catch{return null;}}
  const candidateMatch=/^\/owner-api\/workspaces\/([^/]+)\/candidates(?:\/([^/]+)\/revisions)?$/.exec(url.pathname);
  if(candidateMatch) { try { const workspaceId=decodeURIComponent(candidateMatch[1]!); const candidateId=candidateMatch[2]===undefined?undefined:decodeURIComponent(candidateMatch[2]); if([workspaceId,candidateId].some((id)=>id?.includes('/')||id?.includes('\\')||id?.includes('\0'))) return null; return candidateId===undefined?{operation:'candidateCreate',workspaceId}:{operation:'candidateRevision',workspaceId,candidateId}; } catch{return null;} }
  const match = /^\/owner-api\/product-workspaces\/([^/]+)\/(b8-decisions|b8-clearance|b9\/working|b9\/lock|b10-decisions)$/.exec(url.pathname); if (!match) return null;
  try { const id = decodeURIComponent(match[1]!); const operation = match[2] === 'b8-decisions' ? 'decision' : match[2] === 'b8-clearance' ? 'clearance' : match[2] === 'b9/working' ? 'working' : match[2] === 'b9/lock' ? 'lock' : 'b10'; return id.includes('/') || id.includes('\\') || id.includes('\0') ? null : { productWorkspaceId: id, operation }; } catch { return null; }
}
class ExistingClearanceIntegrityError extends Error {}
class ExistingStpIntegrityError extends Error {}
class PayloadTooLargeError extends Error {}
class UnknownDiscoveryWorkspaceError extends Error {}
class UnknownProductCandidateError extends Error {}
class ProductCandidatePairingConflictError extends Error {}
class ExistingProductCandidateIntegrityError extends Error {}
class ExistingCandidateBasketIntegrityError extends Error {}
class ExistingB7IntegrityError extends Error {}
class ExistingProductWorkspaceIntegrityError extends Error {}
class ProductWorkspacePairingConflictError extends Error {}
class ProductWorkspaceEligibilityConflictError extends Error {}
class UnknownB7DecisionError extends Error {}
class UnknownCandidateBasketError extends Error {}
class CandidateBasketPairingConflictError extends Error {}
class CandidateBasketVersionConflictError extends Error {}
class UnknownProductWorkspaceError extends Error {}
class UnknownLockedStpError extends Error {}
class ExistingB10IntegrityError extends Error {}
class ExistingDiscoveryWorkspaceIntegrityError extends Error {}
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
function assertOwnerTables(db: BetterSqlite3.Database): void { const names = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(({ name }) => name)); for (const required of ['artifact_manifests', 'flow_discovery_workspaces', 'flow_product_candidates', 'flow_product_candidate_revisions', 'flow_candidate_baskets', 'flow_candidate_basket_members', 'governance_candidate_b7_decisions', 'flow_product_workspaces', 'governance_product_b8_lane_decisions', 'flow_b8_clearances', 'flow_b8_clearance_decisions', 'flow_stp_working_records', 'flow_locked_stps', 'governance_product_b10_decisions']) if (!names.has(required)) throw new Error('Database is missing required owner tables'); }

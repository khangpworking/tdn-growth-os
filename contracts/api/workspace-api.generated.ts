/* Generated manually from the adjacent Task 034 API schemas. */

export type B8Lane = 'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE';
export type B8EffectiveState = 'NO_DECISION' | 'PASS' | 'HOLD' | 'REJECT';

export interface WorkspacePortfolioResponse {
  contractVersion: '1.0.0';
  workspaces: WorkspacePortfolioItem[];
}
export interface WorkspacePortfolioItem {
  workspaceId: string;
  workspaceKey: string;
  state: 'ACTIVE';
  title: string;
  description?: string;
  createdAt: string;
  candidateCount: number;
  productCount: number;
}
export interface WorkspaceCandidateSummary {
  candidateId: string;
  candidateKey: string;
  state: 'EXPLORING';
  version: number;
  label: string;
  summary?: string;
  createdAt: string;
}
export interface ProductWorkspaceSummary {
  productWorkspaceId: string;
  productWorkspaceKey: string;
  state: 'ACTIVE';
  entryStep: 'B8';
  title: string;
  createdAt: string;
}
export interface DiscoveryWorkspaceDetailResponse {
  contractVersion: '1.0.0';
  workspace: WorkspacePortfolioItem;
  candidates: WorkspaceCandidateSummary[];
  products: ProductWorkspaceSummary[];
}
export interface B8LaneSummary {
  lane: B8Lane;
  effectiveState: B8EffectiveState;
  decisionId?: string;
  decisionVersion?: number;
  decidedAt?: string;
}
export interface B8ClearanceSummary {
  clearanceId: string;
  state: 'READY_FOR_B9';
  clearedAt: string;
  decisions: { lane: B8Lane; decisionId: string; decisionVersion: number; decidedAt: string }[];
}
export interface ProductWorkspaceDetailResponse {
  contractVersion: '1.0.0';
  product: ProductWorkspaceSummary & {
    sourceWorkspaceId: string;
    sourceBasketId: string;
    sourceBasketKey: string;
    sourceBasketVersion: number;
    sourceCandidateId: string;
    sourceCandidateKey: string;
    sourceCandidateVersion: number;
    sourceCandidateLabel: string;
    sourceCandidateSummary?: string;
    sourceB7DecisionId: string;
    sourceB7DecidedAt: string;
  };
  b8: { lanes: B8LaneSummary[]; readyForB9: boolean };
  clearance?: B8ClearanceSummary;
}
export interface ProductB9Response {
  contractVersion: '1.0.0';
  productWorkspaceId: string;
  state: 'NOT_STARTED' | 'WORKING' | 'LOCKED';
  working?: {
    workingStpId: string;
    workingDigest: string;
    b8ClearanceId: string;
    content: { segments: { key: string; label: string }[]; primaryTargetSegmentKey: string; secondaryTargetSegmentKeys?: string[]; positioningStatement: string };
    createdAt: string;
    updatedAt: string;
  };
  locked?: { lockId: string; state: 'LOCKED_STP'; lockedAt: string };
}
export interface ProductB10DecisionSummary {
  decisionId: string;
  decisionNumber: number;
  previousDecisionId: string | null;
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
  decidedAt: string;
  lockedStpId: string;
}
export interface ProductB10Response {
  contractVersion: '1.0.0';
  productWorkspaceId: string;
  history: ProductB10DecisionSummary[];
  effective: null | ProductB10DecisionSummary;
  readyForB11: boolean;
}
export interface WorkspaceApiErrorResponse {
  error: { code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error'; message: string };
}

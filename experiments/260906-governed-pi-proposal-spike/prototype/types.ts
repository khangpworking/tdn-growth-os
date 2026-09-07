import type { AnalysisBackedProposalSubmission } from '../../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import type { VerifiedResearchEvidenceAudit } from '../../../src/modules/analysis/index.js';

export interface BoundedAuditClaim {
  readonly code: string;
  readonly claimText: string;
  readonly assessment: 'supported' | 'contradicted' | 'mixed' | 'insufficient_evidence';
  readonly reasoning: string;
  readonly uncertainty: string;
}

export interface BoundedPiProposalRequest {
  readonly prompt: { readonly id: 'experiment:governed-pi-proposal'; readonly version: 1; readonly sha256: string; readonly text: string };
  readonly outputContract: { readonly id: 'analysis_backed_proposal_v1'; readonly version: '1.0.0' };
  readonly trusted: {
    readonly proposalKey: string;
    readonly proposalVersion: number;
    readonly objective: AnalysisBackedProposalSubmission['objective'];
    readonly requestedNextStep: 'request_human_review';
  };
  readonly sourceAudit: {
    readonly auditId: string;
    readonly outputArtifactSha256: string;
    readonly summary: string;
    readonly claims: readonly BoundedAuditClaim[];
    readonly unansweredQuestions: readonly { readonly question: string; readonly whyMaterial: string }[];
    readonly overallAssessment: string;
    readonly limitations: readonly string[];
  };
  readonly limits: {
    readonly maxInputBytes: number;
    readonly maxOutputBytes: number;
    readonly timeoutMs: number;
    readonly maxRepairTurns: 1;
  };
}

export interface PiRuntimeResult {
  readonly output: unknown;
  readonly repairTurns: 0 | 1;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly elapsedMs: number;
  readonly processExit: 'terminated_after_settled';
  readonly reportedTokens?: number;
  readonly reportedCostUsd?: number;
}

export interface PiProposalRuntime {
  generate(request: BoundedPiProposalRequest): Promise<PiRuntimeResult>;
}

export interface DisposableProposalBoundary {
  readonly submitAndReplay: (submission: AnalysisBackedProposalSubmission) => Promise<{ readonly proposalId: string; readonly proposalArtifactSha256: string }>;
  readonly cleanup: () => Promise<void>;
}

export interface ExperimentMeasurements {
  readonly schemaPass: boolean;
  readonly evidenceSemanticPass: boolean;
  readonly inventedClaimCodeCount: number;
  readonly forbiddenAuthorityFieldCount: number;
  readonly repairTurns: 0 | 1;
  readonly elapsedMs: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly processExit: 'terminated_after_settled';
  readonly operatorSteps: number;
  readonly qualitativeUsefulnessScore: number;
  readonly reportedTokens: number | null;
  readonly reportedCostUsd: number | null;
  readonly disposableCleanup: true;
}

export interface VerifiedFixtureInput {
  readonly verifiedAudit: VerifiedResearchEvidenceAudit;
  readonly proposalKey: string;
  readonly proposalVersion: number;
  readonly objective: AnalysisBackedProposalSubmission['objective'];
}

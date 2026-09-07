import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { AnalysisBackedProposalSubmission } from '../../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import { validateResearchEvidenceAudit } from '../../../src/modules/analysis/index.js';
import { buildSubmission, countForbiddenAuthorityFields, countInventedClaimCodes, validateProposalOutput } from './proposal-validation.js';
import type {
  BoundedPiProposalRequest,
  DisposableProposalBoundary,
  ExperimentMeasurements,
  PiProposalRuntime,
  VerifiedFixtureInput,
} from './types.js';

export const SPIKE_LIMITS = Object.freeze({
  maxInputBytes: 128 * 1024,
  maxOutputBytes: 64 * 1024,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 256 * 1024,
  timeoutMs: 120_000,
  maxRepairTurns: 1 as const,
});

export interface SpikeExecution {
  readonly proposalId: string;
  readonly proposalArtifactSha256: string;
  readonly measurements: ExperimentMeasurements;
}

export async function runGovernedProposalSpike(options: {
  readonly fixture: VerifiedFixtureInput;
  readonly promptText: string;
  readonly runtime: PiProposalRuntime;
  readonly disposableBoundary: DisposableProposalBoundary;
}): Promise<SpikeExecution> {
  let cleaned = false;
  try {
    const request = buildBoundedRequest(options.fixture, options.promptText);
    const result = await options.runtime.generate(request);
    assertRuntimeBounds(request, result);
    const diagnostics = validateProposalOutput(request, result.output);
    if (diagnostics.length !== 0) throw new Error(`Untrusted proposal output failed validation: ${diagnostics.join('; ')}`);
    const submission = buildSubmission(request, result.output);
    const persisted = await options.disposableBoundary.submitAndReplay(submission);
    await options.disposableBoundary.cleanup();
    cleaned = true;
    return {
      ...persisted,
      measurements: {
        schemaPass: true,
        evidenceSemanticPass: true,
        inventedClaimCodeCount: countInventedClaimCodes(request, result.output),
        forbiddenAuthorityFieldCount: countForbiddenAuthorityFields(result.output),
        repairTurns: result.repairTurns,
        elapsedMs: result.elapsedMs,
        inputBytes: result.inputBytes,
        outputBytes: result.outputBytes,
        stdoutBytes: result.stdoutBytes,
        stderrBytes: result.stderrBytes,
        processExit: result.processExit,
        operatorSteps: 3,
        qualitativeUsefulnessScore: scoreUsefulness(submission),
        reportedTokens: result.reportedTokens ?? null,
        reportedCostUsd: result.reportedCostUsd ?? null,
        disposableCleanup: true,
      },
    };
  } finally {
    if (!cleaned) await options.disposableBoundary.cleanup();
  }
}

export function buildBoundedRequest(fixture: VerifiedFixtureInput, promptText: string): BoundedPiProposalRequest {
  const audit = validateResearchEvidenceAudit(fixture.verifiedAudit.audit);
  if (fixture.verifiedAudit.auditId !== audit.auditId) throw new Error('Verified audit ID mismatch');
  if (!/^[0-9a-f]{64}$/.test(fixture.verifiedAudit.outputArtifactSha256)) throw new Error('Invalid verified audit digest');
  const claims = audit.output.claims.map(({ code, claimText, assessment, reasoning, uncertainty }) => ({
    code, claimText, assessment, reasoning, uncertainty,
  }));
  if (new Set(claims.map(({ code }) => code)).size !== claims.length) throw new Error('Verified audit has duplicate claim codes');
  const request: BoundedPiProposalRequest = {
    prompt: {
      id: 'experiment:governed-pi-proposal', version: 1,
      sha256: createHash('sha256').update(Buffer.from(promptText, 'utf8')).digest('hex'),
      text: promptText,
    },
    outputContract: { id: 'analysis_backed_proposal_v1', version: '1.0.0' },
    trusted: {
      proposalKey: fixture.proposalKey,
      proposalVersion: fixture.proposalVersion,
      objective: fixture.objective,
      requestedNextStep: 'request_human_review',
    },
    sourceAudit: {
      auditId: audit.auditId,
      outputArtifactSha256: fixture.verifiedAudit.outputArtifactSha256,
      summary: audit.output.summary,
      claims,
      unansweredQuestions: audit.output.unansweredQuestions.map(({ question, whyMaterial }) => ({ question, whyMaterial })),
      overallAssessment: audit.output.overallAssessment,
      limitations: audit.output.limitations,
    },
    limits: {
      maxInputBytes: SPIKE_LIMITS.maxInputBytes,
      maxOutputBytes: SPIKE_LIMITS.maxOutputBytes,
      timeoutMs: SPIKE_LIMITS.timeoutMs,
      maxRepairTurns: SPIKE_LIMITS.maxRepairTurns,
    },
  };
  if (Buffer.byteLength(JSON.stringify(request)) > SPIKE_LIMITS.maxInputBytes) throw new Error('Verified audit exceeds bounded Pi input limit');
  return request;
}

function assertRuntimeBounds(request: BoundedPiProposalRequest, result: Awaited<ReturnType<PiProposalRuntime['generate']>>): void {
  if (result.repairTurns > request.limits.maxRepairTurns) throw new Error('Runtime exceeded repair-turn limit');
  if (result.inputBytes > request.limits.maxInputBytes || result.outputBytes > request.limits.maxOutputBytes ||
      result.stdoutBytes > SPIKE_LIMITS.maxStdoutBytes || result.stderrBytes > SPIKE_LIMITS.maxStderrBytes ||
      result.elapsedMs > request.limits.timeoutMs) {
    throw new Error('Runtime result exceeded configured bounds');
  }
}

function scoreUsefulness(submission: AnalysisBackedProposalSubmission): number {
  const links = submission.proposal.evidenceLinks;
  const clarity = submission.proposal.title.length > 0 && submission.proposal.summary.length > 0 ? 1 : 0;
  const faithfulSemantics = links.length > 0 ? 1 : 0;
  const usefulQuestions = submission.proposal.openQuestions.length > 0 ? 1 : 0;
  const noUnsupportedConclusion = countForbiddenAuthorityFields(submission.proposal) === 0 ? 1 : 0;
  return clarity + faithfulSemantics + usefulQuestions + noUnsupportedConclusion;
}

export function directTemplateProposal(request: BoundedPiProposalRequest): AnalysisBackedProposalSubmission['proposal'] {
  const output = {
    title: 'Đề xuất rà soát bằng chứng nghiên cứu',
    summary: 'Trình các nhận định đã kiểm toán cho con người xem xét trong phạm vi nguồn đã cung cấp.',
    rationale: 'Tách bằng chứng hỗ trợ, rủi ro và bất định trước mọi quyết định tiếp theo.',
    evidenceLinks: request.sourceAudit.claims.map((claim) => ({
      claimCode: claim.code,
      use: claim.assessment === 'supported' ? 'support' as const
        : claim.assessment === 'contradicted' ? 'risk' as const
          : 'uncertainty' as const,
      note: `Sử dụng theo đánh giá ${claim.assessment} của kiểm toán đã xác minh.`,
    })),
    openQuestions: request.sourceAudit.unansweredQuestions.length > 0
      ? request.sourceAudit.unansweredQuestions.map(({ question }) => question)
      : ['Cần thêm nguồn độc lập nào trước khi con người xem xét?'],
  };
  return buildSubmission(request, output).proposal;
}

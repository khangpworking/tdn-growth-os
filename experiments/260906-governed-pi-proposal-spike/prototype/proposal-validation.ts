import type { AnalysisBackedProposalSubmission } from '../../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import { validateAnalysisBackedProposalSubmission } from '../../../src/modules/orchestrator/index.js';
import type { BoundedPiProposalRequest } from './types.js';

export const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  'proposalId', 'state', 'createdAt', 'sourceAuditArtifactSha256', 'producer',
  'approval', 'approver', 'role', 'hold', 'action', 'command', 'url', 'tools',
  'provider', 'model', 'prompt', 'credentials', 'sql', 'path', 'task', 'transition',
]);

export function buildSubmission(request: BoundedPiProposalRequest, output: unknown): AnalysisBackedProposalSubmission {
  return validateAnalysisBackedProposalSubmission({
    contractVersion: '1.0.0',
    proposalKey: request.trusted.proposalKey,
    proposalVersion: request.trusted.proposalVersion,
    proposalType: 'research_evidence_review_v1',
    sourceAuditId: request.sourceAudit.auditId,
    objective: request.trusted.objective,
    proposal: output,
    requestedNextStep: request.trusted.requestedNextStep,
  });
}

export function validateProposalOutput(request: BoundedPiProposalRequest, output: unknown): readonly string[] {
  const diagnostics: string[] = [];
  try {
    const submission = buildSubmission(request, output);
    const claims = new Map(request.sourceAudit.claims.map((claim) => [claim.code, claim.assessment]));
    const seen = new Set<string>();
    for (const link of submission.proposal.evidenceLinks) {
      if (seen.has(link.claimCode)) diagnostics.push(`duplicate claimCode ${link.claimCode}`);
      seen.add(link.claimCode);
      const assessment = claims.get(link.claimCode);
      if (!assessment) {
        diagnostics.push(`unknown claimCode ${link.claimCode}`);
        continue;
      }
      const allowed = assessment === 'supported' ? ['support']
        : assessment === 'contradicted' ? ['risk']
          : assessment === 'mixed' ? ['support', 'risk', 'uncertainty']
            : ['uncertainty'];
      if (!allowed.includes(link.use)) diagnostics.push(`${link.use} is invalid for ${assessment} claim ${link.claimCode}`);
    }
  } catch (error) {
    diagnostics.push((error as Error).message.slice(0, 1000));
  }
  return diagnostics.slice(0, 24);
}

export function countInventedClaimCodes(request: BoundedPiProposalRequest, output: unknown): number {
  if (!isRecord(output) || !Array.isArray(output.evidenceLinks)) return 0;
  const claims = new Set(request.sourceAudit.claims.map((claim) => claim.code));
  return output.evidenceLinks.filter((link) => isRecord(link) && typeof link.claimCode === 'string' && !claims.has(link.claimCode)).length;
}

export function countForbiddenAuthorityFields(output: unknown): number {
  let count = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!isRecord(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_AUTHORITY_FIELDS.includes(key)) count += 1;
      visit(item);
    }
  };
  visit(output);
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

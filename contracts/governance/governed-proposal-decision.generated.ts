/* Generated from governed-proposal-decision.schema.json. Do not edit by hand. */

export interface GovernedProposalDecision {
  contractVersion: '1.0.0';
  decisionId: string;
  createdAt: string;
  proposal: {
    proposalId: string;
    proposalArtifactSha256: string;
  };
  decisionVersion: number;
  previousState: 'PROPOSED' | 'HOLD';
  resultState: 'APPROVED' | 'REJECTED' | 'HOLD';
  action: 'APPROVE' | 'REJECT' | 'HOLD';
  rationale: string;
  actor: {
    actorId: string;
    roleSnapshot: string;
  };
  requiredCapability: 'governance:proposal-review';
  policy: {
    policyId: 'governance:proposal-review-v1';
    policyVersion: number;
  };
  requestSha256: string;
}

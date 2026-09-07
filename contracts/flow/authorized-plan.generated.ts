/* Generated from authorized-plan.schema.json. Do not edit by hand. */

export interface AuthorizedPlan {
  contractVersion: '1.0.0';
  planId: string;
  planKey: string;
  planType: 'approved_proposal_intake_v1';
  state: 'AUTHORIZED_PLAN';
  createdAt: string;
  sourceProposal: {
    proposalId: string;
    proposalArtifactSha256: string;
  };
  authorization: {
    decisionId: string;
    decisionArtifactSha256: string;
    decisionVersion: number;
    actor: {
      actorId: string;
      roleSnapshot: string;
    };
    policy: {
      policyId: 'governance:proposal-review-v1';
      policyVersion: number;
    };
    approvedAt: string;
  };
  producer: {
    producerId: string;
    producerVersion: number;
  };
  requestedNextStep: 'define_manual_tasks';
  requestSha256: string;
}

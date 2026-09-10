/* Generated from candidate-b7-decision.schema.json. Do not edit by hand. */

export interface CandidateB7Decision {
  contractVersion: '1.0.0';
  decisionId: string;
  decidedAt: string;
  basket: {
    basketId: string;
    basketArtifactSha256: string;
    workspaceId: string;
    basketKey: string;
    basketVersion: number;
  };
  candidate: {
    candidateId: string;
    candidateVersion: number;
    candidateArtifactSha256: string;
    candidateKey: string;
    label: string;
    state: 'EXPLORING';
  };
  decision: 'PASS' | 'HOLD' | 'REJECT';
  actor: {
    actorId: string;
    roleSnapshot: 'OWNER';
  };
  requiredCapability: 'governance:candidate-b7-review';
  policy: {
    policyId: 'governance:candidate-b7-review-v1';
    policyVersion: 1;
  };
  requestSha256: string;
}

/* Generated from product-b8-lane-decision.schema.json. Do not edit by hand. */

export interface ProductB8LaneDecision {
  contractVersion: '1.0.0';
  decisionId: string;
  decisionVersion: number;
  decidedAt: string;
  lane: 'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE';
  decision: 'PASS' | 'HOLD' | 'REJECT';
  productWorkspace: {
    productWorkspaceId: string;
    productWorkspaceArtifactSha256: string;
    productWorkspaceKey: string;
    state: 'ACTIVE';
    entryStep: 'B8';
    title: string;
    source: Source;
  };
  actor: {
    actorId: string;
    roleSnapshot: 'OWNER';
  };
  requiredCapability: 'governance:product-b8-review';
  policy: {
    policyId: 'governance:product-b8-review-v1';
    policyVersion: 1;
  };
  requestSha256: string;
}
export interface Source {
  discoveryWorkspace: {
    workspaceId: string;
  };
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
    summary?: string;
    state: 'EXPLORING';
  };
  b7Decision: {
    contractVersion: '1.0.0';
    decisionId: string;
    decisionArtifactSha256: string;
    decidedAt: string;
    decision: 'PASS';
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
  };
}

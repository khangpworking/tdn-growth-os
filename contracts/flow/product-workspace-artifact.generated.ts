/* Generated from product-workspace-artifact.schema.json. Do not edit by hand. */

export interface ProductWorkspaceArtifact {
  contractVersion: '1.0.0';
  productWorkspaceId: string;
  productWorkspaceKey: string;
  state: 'ACTIVE';
  entryStep: 'B8';
  title: string;
  createdAt: string;
  requestSha256: string;
  source: {
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
  };
}

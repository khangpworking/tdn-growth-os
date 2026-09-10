/* Generated from b8-clearance-artifact.schema.json. Do not edit by hand. */

export interface B8ClearanceArtifact {
  contractVersion: '1.0.0';
  clearanceId: string;
  state: 'READY_FOR_B9';
  clearedAt: string;
  requestSha256: string;
  productWorkspace: ProductWorkspace;
  /**
   * @minItems 4
   * @maxItems 4
   */
  decisions: [DecisionBase, DecisionBase, DecisionBase, DecisionBase];
}
export interface ProductWorkspace {
  productWorkspaceId: string;
  productWorkspaceArtifactSha256: string;
  productWorkspaceKey: string;
  state: 'ACTIVE';
  entryStep: 'B8';
  title: string;
  source: Source;
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
export interface DecisionBase {
  lane: 'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE';
  decisionId: string;
  decisionVersion: number;
  decisionArtifactSha256: string;
  decidedAt: string;
  decision: 'PASS';
  actor: Actor;
  requiredCapability: 'governance:product-b8-review';
  policy: Policy;
}
export interface Actor {
  actorId: string;
  roleSnapshot: 'OWNER';
}
export interface Policy {
  policyId: 'governance:product-b8-review-v1';
  policyVersion: 1;
}

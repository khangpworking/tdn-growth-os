/* Generated from product-b10-decision.schema.json. Do not edit by hand. */

export interface ProductB10Decision {
  contractVersion: '1.0.0';
  decisionId: string;
  decisionNumber: number;
  previousDecisionId: null | string;
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
  decidedAt: string;
  lockedStp: {
    lockId: string;
    lockArtifactSha256: string;
    artifact: LockedStpArtifact;
  };
  productWorkspaceId: string;
  actor: {
    actorId: string;
    roleSnapshot: 'OWNER';
  };
  requiredCapability: 'governance:product-b10-review';
  policy: {
    policyId: 'governance:product-b10-review-v1';
    policyVersion: 1;
  };
  requestSha256: string;
}
export interface LockedStpArtifact {
  contractVersion: '1.0.0';
  lockId: string;
  state: 'LOCKED_STP';
  lockedAt: string;
  requestSha256: string;
  workingStp: {
    workingStpId: string;
    workingDigest: string;
    content: StpContent;
  };
  productWorkspace: {
    productWorkspaceArtifactSha256: string;
    artifact: ProductWorkspaceArtifact;
  };
  b8Clearance: {
    clearanceId: string;
    clearanceArtifactSha256: string;
    state: 'READY_FOR_B9';
  };
  actor: {
    actorId: string;
    roleSnapshot: 'OWNER';
  };
  requiredCapability: 'governance:product-b9-lock';
  policy: {
    policyId: 'governance:product-b9-lock-v1';
    policyVersion: 1;
  };
}
export interface StpContent {
  /**
   * @minItems 1
   * @maxItems 100
   */
  segments: [Segment, ...Segment[]];
  primaryTargetSegmentKey: string;
  /**
   * @maxItems 99
   */
  secondaryTargetSegmentKeys?: string[];
  positioningStatement: string;
}
export interface Segment {
  key: string;
  label: string;
  description?: string;
}
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
  };
}

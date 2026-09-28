/* Generated from content-insight-lock-artifact.schema.json. Do not edit by hand. */

export interface ContentInsightLockArtifact {
  contractVersion: '1.0.0';
  campaignId: string;
  insightVersion: number;
  campaignVersion: number;
  insightArtifactSha256: string;
  campaignArtifactSha256: string;
  b10?: ContentInsightB10Clearance;
  lockedAt: string;
  requestSha256: string;
}
export interface ContentInsightB10Clearance {
  productWorkspaceId: string;
  lockedStpId: string;
  effectiveDecisionId: string;
  effectiveDecisionNumber: number;
  effectiveDecision: 'APPROVE';
}

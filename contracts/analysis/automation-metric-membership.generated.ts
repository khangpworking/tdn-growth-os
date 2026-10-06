/* Generated from automation-metric-membership.schema.json. Do not edit by hand. */

export type AutomationMetricMembershipContract =
  MetricMembershipProposeRequest | MetricMembershipAcceptRequest | MetricMembershipProposal | MetricMembershipReceipt;
export type Uuid = string;
export type Digest = string;

export interface MetricMembershipProposeRequest {
  contractVersion: 'metric-membership-propose-v1';
  requestKey: Uuid;
  pairId: Digest;
  adoptionId: Uuid;
  /**
   * @minItems 1
   * @maxItems 100
   */
  assignments: [MetricMembershipAssignment, ...MetricMembershipAssignment[]];
}
export interface MetricMembershipAssignment {
  recordKey: Digest;
  classification: 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN';
  group: string;
}
export interface MetricMembershipAcceptRequest {
  contractVersion: 'metric-membership-accept-v1';
  requestKey: Uuid;
  proposalId: Uuid;
  /**
   * @minItems 1
   * @maxItems 100
   */
  selectedRecordKeys: [Digest, ...Digest[]];
}
export interface MetricMembershipProposal {
  contractVersion: 'metric-membership-proposal-v1';
  proposalId: Uuid;
  binding: MetricMembershipBinding;
  request: MetricMembershipProposeRequest;
  actorId: string;
  createdAt: string;
}
export interface MetricMembershipBinding {
  workspaceId: Uuid;
  runId: Uuid;
  pairId: Digest;
  adoptionId: Uuid;
  adoptionSha256: Digest;
  preparationSha256: Digest;
  inputSha256: Digest;
  sourcePackageId: Uuid;
  scopeSha256: Digest;
}
export interface MetricMembershipReceipt {
  contractVersion: 'metric-membership-receipt-v1';
  receiptId: Uuid;
  binding: MetricMembershipBinding;
  request: MetricMembershipAcceptRequest;
  proposalSha256: Digest;
  actorId: string;
  actorRole: 'OWNER';
  acceptedAt: string;
}

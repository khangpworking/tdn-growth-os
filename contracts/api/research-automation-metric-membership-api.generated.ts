/* Generated from research-automation-metric-membership-api.schema.json. Do not edit by hand. */

export type ResearchAutomationMetricMembershipApi =
  | ResearchMetricMembershipMutation
  | ResearchMetricMembershipProposal
  | ResearchMetricMembershipReceipt
  | ResearchMetricMembershipReview;
export type Uuid = string;
export type Digest = string;

export interface ResearchMetricMembershipMutation {
  contractVersion: 'metric-membership-mutation-v1';
  kind: 'PROPOSAL' | 'ACCEPTANCE';
  id: Uuid;
  exactRetry: boolean;
}
export interface ResearchMetricMembershipProposal {
  contractVersion: 'metric-membership-proposal-view-v1';
  proposalId: Uuid;
  workspaceId: Uuid;
  runId: Uuid;
  pairId: Digest;
  adoptionId: Uuid;
  createdAt: string;
  /**
   * @minItems 1
   * @maxItems 100
   */
  assignments: [MetricMembershipAssignment, ...MetricMembershipAssignment[]];
}
export interface MetricMembershipAssignment {
  recordKey: string;
  classification: 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN';
  group: string;
}
export interface ResearchMetricMembershipReceipt {
  contractVersion: 'metric-membership-acceptance-view-v1';
  receiptId: Uuid;
  proposalId: Uuid;
  workspaceId: Uuid;
  runId: Uuid;
  acceptedAt: string;
  /**
   * @minItems 1
   * @maxItems 100
   */
  selectedRecordKeys: [Digest, ...Digest[]];
}
export interface ResearchMetricMembershipReview {
  contractVersion: 'metric-membership-review-v1';
  workspaceId: Uuid;
  runId: Uuid;
  pairId: Digest;
  adoptionId: Uuid;
  recordCount: number;
  acceptedCount: number;
  pendingCount: number;
  complete: boolean;
  /**
   * @maxItems 10000
   */
  acceptedReceiptIds: Uuid[];
  /**
   * @maxItems 10000
   */
  records: {
    recordKey: Digest;
    title: string;
    category: string;
    shopId: string;
    listingId: string;
    locator: string;
    state: 'PENDING' | 'ACCEPTED';
    classification: null | 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN';
    group: string | null;
    proposalId: Uuid | null;
  }[];
}

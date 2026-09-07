/* Generated from governed-proposal-review-request.schema.json. Do not edit by hand. */

export interface GovernedProposalReviewRequest {
  contractVersion: '1.0.0';
  proposalId: string;
  decisionVersion: number;
  action: 'APPROVE' | 'REJECT' | 'HOLD';
  rationale: string;
  expectedPreviousState: 'PROPOSED' | 'HOLD';
}

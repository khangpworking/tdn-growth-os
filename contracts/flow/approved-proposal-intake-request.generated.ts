/* Generated from approved-proposal-intake-request.schema.json. Do not edit by hand. */

export interface ApprovedProposalIntakeRequest {
  contractVersion: '1.0.0';
  planKey: string;
  planType: 'approved_proposal_intake_v1';
  sourceProposalId: string;
  approvedDecisionId: string;
  requestedNextStep: 'define_manual_tasks';
}

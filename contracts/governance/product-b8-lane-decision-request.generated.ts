/* Generated from product-b8-lane-decision-request.schema.json. Do not edit by hand. */

export interface ProductB8LaneDecisionRequest {
  contractVersion: '1.0.0';
  productWorkspaceId: string;
  lane: 'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE';
  expectedVersion: number;
  decision: 'PASS' | 'HOLD' | 'REJECT';
}

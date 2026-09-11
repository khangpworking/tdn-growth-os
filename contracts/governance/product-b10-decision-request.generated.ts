/* Generated from product-b10-decision-request.schema.json. Do not edit by hand. */

export interface ProductB10DecisionRequest {
  contractVersion: '1.0.0';
  lockedStpId: string;
  previousDecisionId: null | string;
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
}

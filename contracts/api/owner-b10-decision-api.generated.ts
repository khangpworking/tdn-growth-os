/* Generated from owner-b10-decision-api.schema.json. Do not edit by hand. */

export type OwnerB10DecisionApiContract = OwnerB10DecisionRequest | OwnerB10DecisionReceipt;
export type Uuid = string;

export interface OwnerB10DecisionRequest {
  contractVersion: '1.0.0';
  lockedStpId: Uuid;
  previousDecisionId: null | Uuid;
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
}
export interface OwnerB10DecisionReceipt {
  contractVersion: '1.0.0';
  decisionId: Uuid;
  decisionNumber: number;
  previousDecisionId: null | Uuid;
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
  decidedAt: string;
  readyForB11: boolean;
  exactRetry: boolean;
}

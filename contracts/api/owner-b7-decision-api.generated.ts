/* Generated from owner-b7-decision-api.schema.json. Do not edit by hand. */

export type OwnerB7DecisionApiContract = OwnerB7DecisionRequest | OwnerB7DecisionReceipt | OwnerB7ApiErrorResponse;
export type Uuid = string;

export interface OwnerB7DecisionRequest {
  contractVersion: '1.0.0';
  candidateId: Uuid;
  candidateVersion: number;
  decision: 'PASS' | 'HOLD' | 'REJECT';
}
export interface OwnerB7DecisionReceipt {
  contractVersion: '1.0.0';
  decisionId: Uuid;
  workspaceId: Uuid;
  basketId: Uuid;
  candidateId: Uuid;
  candidateVersion: number;
  decision: 'PASS' | 'HOLD' | 'REJECT';
  decidedAt: string;
  exactRetry: boolean;
}
export interface OwnerB7ApiErrorResponse {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'method_not_allowed'
      | 'conflict'
      | 'integrity_error';
    message: string;
  };
}

/* Generated from owner-b8-decision-api.schema.json. Do not edit by hand. */

export type OwnerB8DecisionApiContract = OwnerB8DecisionRequest | OwnerB8DecisionReceipt | OwnerApiErrorResponse;
export type Uuid = string;

export interface OwnerB8DecisionRequest {
  contractVersion: '1.0.0';
  lane: 'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE';
  expectedVersion: number;
  decision: 'PASS' | 'HOLD' | 'REJECT';
}
export interface OwnerB8DecisionReceipt {
  contractVersion: '1.0.0';
  productWorkspaceId: Uuid;
  decisionId: Uuid;
  decisionVersion: number;
  lane: 'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE';
  decision: 'PASS' | 'HOLD' | 'REJECT';
  deduplicated: boolean;
}
export interface OwnerApiErrorResponse {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'method_not_allowed'
      | 'payload_too_large'
      | 'unsupported_media_type'
      | 'conflict'
      | 'integrity_error';
    message: string;
  };
}

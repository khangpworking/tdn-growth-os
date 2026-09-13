/* Generated from owner-product-workspace-api.schema.json. Do not edit by hand. */

export type OwnerProductWorkspaceApiContract =
  OwnerProductWorkspaceRequest | OwnerProductWorkspaceReceipt | OwnerProductWorkspaceApiErrorResponse;
export type Uuid = string;

export interface OwnerProductWorkspaceRequest {
  contractVersion: '1.0.0';
  productWorkspaceKey: string;
}
export interface OwnerProductWorkspaceReceipt {
  contractVersion: '1.0.0';
  productWorkspaceId: Uuid;
  productWorkspaceKey: string;
  workspaceId: Uuid;
  basketId: Uuid;
  candidateId: Uuid;
  candidateVersion: number;
  b7DecisionId: Uuid;
  state: 'ACTIVE';
  entryStep: 'B8';
  title: string;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerProductWorkspaceApiErrorResponse {
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

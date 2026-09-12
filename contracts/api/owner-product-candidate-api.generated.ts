/* Generated from owner-product-candidate-api.schema.json. Do not edit by hand. */

export type OwnerProductCandidateApiContract =
  OwnerProductCandidateCreateRequest | OwnerProductCandidateRevisionRequest | OwnerProductCandidateReceipt;
export type CandidateKey = string;
export type Label = string;
export type Summary = string;
export type Uuid = string;

export interface OwnerProductCandidateCreateRequest {
  contractVersion: '1.0.0';
  candidateKey: CandidateKey;
  label: Label;
  summary?: Summary;
}
export interface OwnerProductCandidateRevisionRequest {
  contractVersion: '1.0.0';
  expectedVersion: number;
  label: Label;
  summary?: Summary;
}
export interface OwnerProductCandidateReceipt {
  contractVersion: '1.0.0';
  candidateId: Uuid;
  workspaceId: Uuid;
  candidateKey: CandidateKey;
  state: 'EXPLORING';
  version: number;
  label: Label;
  summary?: Summary;
  createdAt: string;
  exactRetry: boolean;
}

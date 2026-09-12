/* Generated from owner-candidate-basket-api.schema.json. Do not edit by hand. */

export type OwnerCandidateBasketApiContract = OwnerCandidateBasketRequest | OwnerCandidateBasketReceipt;
export type BasketKey = string;
export type Version = number;
export type Uuid = string;

export interface OwnerCandidateBasketRequest {
  contractVersion: '1.0.0';
  basketKey: BasketKey;
  version: Version;
  /**
   * @minItems 1
   */
  candidates: [Selection, ...Selection[]];
}
export interface Selection {
  candidateId: Uuid;
  candidateVersion: Version;
}
export interface OwnerCandidateBasketReceipt {
  contractVersion: '1.0.0';
  basketId: Uuid;
  workspaceId: Uuid;
  basketKey: BasketKey;
  version: Version;
  frozenAt: string;
  candidateCount: number;
  exactRetry: boolean;
}

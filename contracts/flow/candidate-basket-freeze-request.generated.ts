/* Generated from candidate-basket-freeze-request.schema.json. Do not edit by hand. */

export interface CandidateBasketFreezeRequest {
  contractVersion: '1.0.0';
  workspaceId: string;
  basketKey: string;
  version: number;
  /**
   * @minItems 1
   */
  candidates: [
    {
      candidateId: string;
      candidateVersion: number;
    },
    ...{
      candidateId: string;
      candidateVersion: number;
    }[],
  ];
}

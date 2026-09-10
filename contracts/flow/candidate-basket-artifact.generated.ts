/* Generated from candidate-basket-artifact.schema.json. Do not edit by hand. */

export interface CandidateBasketArtifact {
  contractVersion: '1.0.0';
  basketId: string;
  workspaceId: string;
  basketKey: string;
  version: number;
  frozenAt: string;
  requestSha256: string;
  /**
   * @minItems 1
   */
  candidates: [
    {
      candidateId: string;
      candidateKey: string;
      candidateVersion: number;
      candidateArtifactSha256: string;
      label: string;
      summary?: string;
      state: 'EXPLORING';
    },
    ...{
      candidateId: string;
      candidateKey: string;
      candidateVersion: number;
      candidateArtifactSha256: string;
      label: string;
      summary?: string;
      state: 'EXPLORING';
    }[],
  ];
}

/* Generated from product-candidate-artifact.schema.json. Do not edit by hand. */

export interface ProductCandidateArtifact {
  contractVersion: '1.0.0';
  candidateId: string;
  workspaceId: string;
  candidateKey: string;
  state: 'EXPLORING';
  version: number;
  label: string;
  summary?: string;
  createdAt: string;
  requestSha256: string;
}

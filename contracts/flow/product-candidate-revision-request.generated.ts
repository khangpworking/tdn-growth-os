/* Generated from product-candidate-revision-request.schema.json. Do not edit by hand. */

export interface ProductCandidateRevisionRequest {
  contractVersion: '1.0.0';
  candidateId: string;
  expectedVersion: number;
  label: string;
  summary?: string;
}

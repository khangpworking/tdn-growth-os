/* Generated from candidate-b7-decision-request.schema.json. Do not edit by hand. */

export interface CandidateB7DecisionRequest {
  contractVersion: '1.0.0';
  basketId: string;
  candidateId: string;
  candidateVersion: number;
  decision: 'PASS' | 'HOLD' | 'REJECT';
}

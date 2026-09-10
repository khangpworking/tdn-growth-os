import type { CandidateB7Decision } from '../../../contracts/governance/candidate-b7-decision.generated.js';
import type { CandidateB7DecisionService, EffectiveCandidateB7Decision } from './candidate-b7-decision-service.js';

export interface CandidateB7DecisionReader {
  readEffectiveDecision(basketId: string, candidateId: string, candidateVersion: number): Promise<EffectiveCandidateB7Decision>;
}
export class GovernanceCandidateB7DecisionReader implements CandidateB7DecisionReader {
  readonly #service: CandidateB7DecisionService;
  constructor(service: CandidateB7DecisionService) { this.#service = service; }
  readEffectiveDecision(basketId: string, candidateId: string, candidateVersion: number): Promise<EffectiveCandidateB7Decision> { return this.#service.readEffectiveDecision(basketId, candidateId, candidateVersion); }
  readVerifiedDecision(decisionId: string): Promise<CandidateB7Decision> { return this.#service.replay(decisionId); }
}

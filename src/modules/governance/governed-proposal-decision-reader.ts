import type {
  EffectiveGovernedProposalDecision,
  GovernedProposalDecisionService,
} from './governed-proposal-decision-service.js';

export type VerifiedGovernedProposalDecision = EffectiveGovernedProposalDecision;

export interface GovernedProposalDecisionReader {
  readEffectiveDecision(proposalId: string): Promise<VerifiedGovernedProposalDecision>;
}

export class GovernanceProposalDecisionReader implements GovernedProposalDecisionReader {
  readonly #decisions: GovernedProposalDecisionService;

  constructor(decisions: GovernedProposalDecisionService) {
    this.#decisions = decisions;
  }

  async readEffectiveDecision(proposalId: string): Promise<VerifiedGovernedProposalDecision> {
    return this.#decisions.readEffectiveDecision(proposalId);
  }
}

import type { AnalysisBackedProposal } from '../../../contracts/orchestrator/analysis-backed-proposal.generated.js';
import type { AnalysisBackedProposalService } from './analysis-backed-proposal-service.js';

export interface VerifiedAnalysisBackedProposal {
  readonly proposalId: string;
  readonly proposalArtifactSha256: string;
  readonly proposal: AnalysisBackedProposal;
}

export interface AnalysisBackedProposalReader {
  readVerifiedProposal(proposalId: string): Promise<VerifiedAnalysisBackedProposal>;
}

export class OrchestratorAnalysisBackedProposalReader implements AnalysisBackedProposalReader {
  readonly #proposals: AnalysisBackedProposalService;

  constructor(proposals: AnalysisBackedProposalService) {
    this.#proposals = proposals;
  }

  async readVerifiedProposal(proposalId: string): Promise<VerifiedAnalysisBackedProposal> {
    return {
      proposalId,
      proposalArtifactSha256: this.#proposals.getProposalArtifactSha256(proposalId),
      proposal: await this.#proposals.replay(proposalId),
    };
  }
}

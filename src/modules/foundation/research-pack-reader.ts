import type { VerifiedFinalizedResearchPack } from './research-pack-service.js';
import type { ResearchPackService } from './research-pack-service.js';

export interface FinalizedResearchPackReader {
  readFinalizedResearchPack(researchPackId: string): Promise<VerifiedFinalizedResearchPack>;
}

export class FoundationResearchPackReader implements FinalizedResearchPackReader {
  readonly #researchPacks: ResearchPackService;

  constructor(researchPacks: ResearchPackService) {
    this.#researchPacks = researchPacks;
  }

  readFinalizedResearchPack(researchPackId: string): Promise<VerifiedFinalizedResearchPack> {
    return this.#researchPacks.readVerified(researchPackId);
  }
}

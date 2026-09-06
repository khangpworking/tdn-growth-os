import type { ResearchEvidenceIndexResult } from '../../../contracts/analysis/research-evidence-index-result.generated.js';
import type { ResearchEvidenceIndexService } from './research-evidence-index-service.js';

export interface VerifiedResearchEvidenceIndexResult {
  readonly resultId: string;
  readonly resultArtifactSha256: string;
  readonly result: ResearchEvidenceIndexResult;
}

export interface ResearchEvidenceIndexResultReader {
  readVerifiedResearchEvidenceIndexResult(resultId: string): Promise<VerifiedResearchEvidenceIndexResult>;
}

export class AnalysisResearchEvidenceIndexResultReader implements ResearchEvidenceIndexResultReader {
  readonly #results: ResearchEvidenceIndexService;

  constructor(results: ResearchEvidenceIndexService) {
    this.#results = results;
  }

  async readVerifiedResearchEvidenceIndexResult(resultId: string): Promise<VerifiedResearchEvidenceIndexResult> {
    return {
      resultId,
      resultArtifactSha256: this.#results.getResultArtifactSha256(resultId),
      result: await this.#results.replay(resultId),
    };
  }
}

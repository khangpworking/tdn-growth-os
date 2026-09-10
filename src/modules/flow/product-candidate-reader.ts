import type { ProductCandidateArtifact } from '../../../contracts/flow/product-candidate-artifact.generated.js';
import type { ProductCandidateService } from './product-candidate-service.js';

export interface ProductCandidateReader {
  readVerifiedCandidate(candidateId: string, version?: number): Promise<ProductCandidateArtifact>;
}

export class FlowProductCandidateReader implements ProductCandidateReader {
  readonly #service: ProductCandidateService;

  constructor(service: ProductCandidateService) {
    this.#service = service;
  }

  readVerifiedCandidate(candidateId: string, version?: number): Promise<ProductCandidateArtifact> {
    return this.#service.readCandidate(candidateId, version);
  }
}

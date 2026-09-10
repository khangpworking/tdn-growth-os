import type { CandidateBasketArtifact } from '../../../contracts/flow/candidate-basket-artifact.generated.js';
import type { CandidateBasketService } from './candidate-basket-service.js';

export interface CandidateBasketReader {
  readVerifiedBasket(basketId: string): Promise<CandidateBasketArtifact>;
}

export class FlowCandidateBasketReader implements CandidateBasketReader {
  readonly #service: CandidateBasketService;

  constructor(service: CandidateBasketService) {
    this.#service = service;
  }

  readVerifiedBasket(basketId: string): Promise<CandidateBasketArtifact> {
    return this.#service.readBasket(basketId);
  }
}

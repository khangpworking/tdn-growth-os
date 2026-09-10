import type { ProductB8LaneDecision } from '../../../contracts/governance/product-b8-lane-decision.generated.js';
import type { ProductB8LaneDecisionService, ProductB8Status } from './product-b8-lane-decision-service.js';

export interface ProductB8DecisionByIdReader {
  readVerifiedDecision(decisionId: string): Promise<ProductB8LaneDecision>;
}
export interface ProductB8StatusReader {
  readStatus(productWorkspaceId: string): Promise<ProductB8Status>;
}
export class GovernanceProductB8Reader implements ProductB8DecisionByIdReader, ProductB8StatusReader {
  readonly #service: ProductB8LaneDecisionService;
  constructor(service: ProductB8LaneDecisionService) { this.#service = service; }
  readVerifiedDecision(decisionId: string): Promise<ProductB8LaneDecision> { return this.#service.replay(decisionId); }
  readStatus(productWorkspaceId: string): Promise<ProductB8Status> { return this.#service.readStatus(productWorkspaceId); }
}

import type { ProductB10Decision } from '../../../contracts/governance/product-b10-decision.generated.js';
import type { ProductB10DecisionService, ProductB10History, ProductB10Status } from './product-b10-decision-service.js';

export interface ProductB10DecisionByIdReader {
  readVerifiedDecision(decisionId: string): Promise<ProductB10Decision>;
}
export interface ProductB10EffectiveStatusReader {
  readStatusByLockedStp(lockedStpId: string): Promise<ProductB10Status>;
  readStatusByProductWorkspace(productWorkspaceId: string): Promise<ProductB10Status>;
}
export interface ProductB10HistoryReader {
  readHistoryByProductWorkspace(productWorkspaceId: string): Promise<ProductB10History>;
}
export class GovernanceProductB10Reader implements ProductB10DecisionByIdReader, ProductB10EffectiveStatusReader, ProductB10HistoryReader {
  readonly #service: ProductB10DecisionService;
  constructor(service: ProductB10DecisionService) { this.#service = service; }
  readVerifiedDecision(decisionId: string): Promise<ProductB10Decision> { return this.#service.replay(decisionId); }
  readStatusByLockedStp(lockedStpId: string): Promise<ProductB10Status> { return this.#service.readStatusByLockedStp(lockedStpId); }
  readStatusByProductWorkspace(productWorkspaceId: string): Promise<ProductB10Status> { return this.#service.readStatusByProductWorkspace(productWorkspaceId); }
  readHistoryByProductWorkspace(productWorkspaceId: string): Promise<ProductB10History> { return this.#service.readHistoryByProductWorkspace(productWorkspaceId); }
}

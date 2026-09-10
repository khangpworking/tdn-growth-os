import type { ProductWorkspaceArtifact } from '../../../contracts/flow/product-workspace-artifact.generated.js';
import type { ProductWorkspaceService } from './product-workspace-service.js';

export interface ProductWorkspaceReader {
  readVerifiedProductWorkspace(productWorkspaceId: string): Promise<ProductWorkspaceArtifact>;
}

export class FlowProductWorkspaceReader implements ProductWorkspaceReader {
  readonly #service: ProductWorkspaceService;

  constructor(service: ProductWorkspaceService) { this.#service = service; }

  readVerifiedProductWorkspace(productWorkspaceId: string): Promise<ProductWorkspaceArtifact> {
    return this.#service.replay(productWorkspaceId);
  }
}

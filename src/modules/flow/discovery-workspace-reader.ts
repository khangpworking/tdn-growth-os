import type { DiscoveryWorkspaceArtifact } from '../../../contracts/flow/discovery-workspace-artifact.generated.js';
import type { DiscoveryWorkspaceService } from './discovery-workspace-service.js';

export interface DiscoveryWorkspaceReader {
  readVerifiedWorkspace(workspaceId: string): Promise<DiscoveryWorkspaceArtifact>;
}

export class FlowDiscoveryWorkspaceReader implements DiscoveryWorkspaceReader {
  readonly #service: DiscoveryWorkspaceService;

  constructor(service: DiscoveryWorkspaceService) {
    this.#service = service;
  }

  readVerifiedWorkspace(workspaceId: string): Promise<DiscoveryWorkspaceArtifact> {
    return this.#service.readWorkspace(workspaceId);
  }
}

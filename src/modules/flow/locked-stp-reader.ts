import type { LockedStpArtifact } from '../../../contracts/flow/locked-stp-artifact.generated.js';
import type { StpService, ProductB9ReadStatus } from './stp-service.js';

export interface LockedStpReader {
  readVerifiedLockedStp(lockId: string): Promise<LockedStpArtifact>;
}
export interface ProductB9StatusReader {
  readStatusByProductWorkspace(productWorkspaceId: string): Promise<ProductB9ReadStatus>;
}
export class FlowLockedStpReader implements LockedStpReader, ProductB9StatusReader {
  readonly #service: StpService;
  constructor(service: StpService) { this.#service = service; }
  readVerifiedLockedStp(lockId: string): Promise<LockedStpArtifact> { return this.#service.replayLocked(lockId); }
  readStatusByProductWorkspace(productWorkspaceId: string): Promise<ProductB9ReadStatus> { return this.#service.readStatusByProductWorkspace(productWorkspaceId); }
}

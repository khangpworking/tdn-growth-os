import type { LockedStpArtifact } from '../../../contracts/flow/locked-stp-artifact.generated.js';
import type { StpService } from './stp-service.js';

export interface LockedStpReader {
  readVerifiedLockedStp(lockId: string): Promise<LockedStpArtifact>;
}
export class FlowLockedStpReader implements LockedStpReader {
  readonly #service: StpService;
  constructor(service: StpService) { this.#service = service; }
  readVerifiedLockedStp(lockId: string): Promise<LockedStpArtifact> { return this.#service.replayLocked(lockId); }
}

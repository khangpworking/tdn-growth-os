import type { B8ClearanceArtifact } from '../../../contracts/flow/b8-clearance-artifact.generated.js';
import type { B8ClearanceService } from './b8-clearance-service.js';

export interface B8ClearanceReader {
  readVerifiedClearance(clearanceId: string): Promise<B8ClearanceArtifact>;
}
export class FlowB8ClearanceReader implements B8ClearanceReader {
  readonly #service: B8ClearanceService;
  constructor(service: B8ClearanceService) { this.#service = service; }
  readVerifiedClearance(clearanceId: string): Promise<B8ClearanceArtifact> { return this.#service.replay(clearanceId); }
}

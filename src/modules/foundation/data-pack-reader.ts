import type { DataPackManifest } from '../../../contracts/foundation/data-pack-manifest.generated.js';
import type { DataPackService } from './data-pack-service.js';

export interface VerifiedFinalizedDataPack {
  readonly dataPackId: string;
  readonly manifestArtifactSha256: string;
  readonly manifest: DataPackManifest;
}

export interface FinalizedDataPackReader {
  readFinalizedDataPack(dataPackId: string): Promise<VerifiedFinalizedDataPack>;
}

export class FoundationDataPackReader implements FinalizedDataPackReader {
  readonly #dataPacks: DataPackService;

  constructor(dataPacks: DataPackService) {
    this.#dataPacks = dataPacks;
  }

  async readFinalizedDataPack(dataPackId: string): Promise<VerifiedFinalizedDataPack> {
    return {
      dataPackId,
      manifestArtifactSha256: this.#dataPacks.getFinalizedManifestArtifactSha256(dataPackId),
      manifest: await this.#dataPacks.replay(dataPackId),
    };
  }
}

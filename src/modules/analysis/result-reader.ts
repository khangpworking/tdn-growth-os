import type { MarketSnapshotResult } from '../../../contracts/analysis/market-snapshot-result.generated.js';
import type { MarketSnapshotService } from './market-snapshot-service.js';

export interface VerifiedMarketSnapshotResult {
  readonly resultId: string;
  readonly resultArtifactSha256: string;
  readonly result: MarketSnapshotResult;
}

export interface MarketSnapshotResultReader {
  readVerifiedResult(resultId: string): Promise<VerifiedMarketSnapshotResult>;
}

export class AnalysisResultReader implements MarketSnapshotResultReader {
  readonly #results: MarketSnapshotService;

  constructor(results: MarketSnapshotService) {
    this.#results = results;
  }

  async readVerifiedResult(resultId: string): Promise<VerifiedMarketSnapshotResult> {
    return {
      resultId,
      resultArtifactSha256: this.#results.getResultArtifactSha256(resultId),
      result: await this.#results.replay(resultId),
    };
  }
}

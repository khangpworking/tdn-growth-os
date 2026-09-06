import type { MarketSnapshotInterpretationOutput } from '../../../contracts/analysis/market-snapshot-interpretation-output.generated.js';
import type { MarketSnapshotResult } from '../../../contracts/analysis/market-snapshot-result.generated.js';
import type { ResearchEvidenceIndexResult } from '../../../contracts/analysis/research-evidence-index-result.generated.js';

export interface AiGatewayRequest {
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly prompt: {
    readonly id: string;
    readonly version: number;
    readonly text: string;
    readonly sha256: string;
  };
  readonly input: {
    readonly resultId: string;
    readonly resultArtifactSha256: string;
    readonly result: MarketSnapshotResult | ResearchEvidenceIndexResult;
  };
  readonly output: {
    readonly schemaVersion: string;
    readonly jsonSchema: Readonly<Record<string, unknown>>;
  };
  readonly limits: {
    readonly timeoutMs: number;
    readonly maxOutputTokens: number;
  };
  readonly tools: readonly [];
}

export interface AiGatewayResponse {
  readonly output: unknown;
  readonly providerRequestId?: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
  readonly latencyMs?: number;
}

export interface AiGateway {
  execute(request: AiGatewayRequest): Promise<AiGatewayResponse>;
}

export type StructuredInterpretationOutput = MarketSnapshotInterpretationOutput;

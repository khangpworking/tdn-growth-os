/* Generated from market-snapshot-interpretation.schema.json. Do not edit by hand. */

export interface MarketSnapshotInterpretation {
  contractVersion: '1.0.0';
  interpretationId: string;
  completedAt: string;
  sourceResult: {
    resultId: string;
    resultArtifactSha256: string;
  };
  gateway: {
    providerId: string;
    modelId: string;
    providerRequestId?: string;
    inputTokenCount?: number;
    outputTokenCount?: number;
    latencyMs?: number;
  };
  prompt: {
    promptId: string;
    promptVersion: number;
    promptSha256: string;
  };
  outputSchemaVersion: '1.0.0';
  output: MarketSnapshotInterpretationOutput;
}
export interface MarketSnapshotInterpretationOutput {
  summary: string;
  /**
   * @minItems 1
   * @maxItems 12
   */
  findings:
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ]
    | [
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
        {
          code: string;
          statement: string;
          /**
           * @minItems 1
           * @maxItems 12
           */
          citations:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string, string, string];
        },
      ];
  /**
   * @maxItems 12
   */
  uncertainties:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string];
}

/* Generated from research-generation-api.schema.json. Do not edit by hand. */

export type ResearchGenerationApiContract =
  ResearchGenerationRequest | ResearchGenerationInputs | ResearchGenerationReceipt;
export type Uuid = string;
export type Digest = string;

export interface ResearchGenerationRequest {
  contractVersion: '1.0.0';
  workspaceId: Uuid;
  selectionId: Digest;
  requestKey: string;
}
export interface ResearchGenerationInputs {
  contractVersion: '1.0.0';
  workspaceId: Uuid;
  catalogSha256: Digest;
  choices: ResearchGenerationChoice[];
}
export interface ResearchGenerationChoice {
  selectionId: Digest;
  packageId: Uuid;
  packageManifestSha256: Digest;
  sourceLabel: string;
  packageVersion: number;
  sourceName: string;
  period: {
    start: string;
    end: string;
    basis: string;
  };
  workbookPath: string;
  manifestPath: string;
  labelsPath: string | null;
  eligibility: 'VALIDATE_ON_CREATE';
  limitations: string[];
}
export interface ResearchGenerationReceipt {
  contractVersion: '1.0.0';
  requestKey: Uuid;
  workspaceId: Uuid;
  reportId: Uuid;
  version: 1;
  semanticVersionId: Digest;
  profile: 'prepared-report-v1' | 'source-backed-v1';
  exactRetry: boolean;
  reviewState: 'UNREVIEWED';
  interpretationState: 'NONE';
  limitations: string[];
}

/* Generated from capture-relevance.schema.json. Do not edit by hand. */

export interface CaptureRelevanceRecord {
  contractVersion: 'capture-relevance-record-v1';
  promptVersion: string;
  modelIdentity: string;
  configuration: CaptureRelevanceConfiguration;
  decisions: CaptureRelevanceDecision[];
  methodNotes: {
    batches: number;
    retriedBatches: number;
    failedBatches: number;
    cappedTitles: number;
  };
}
export interface CaptureRelevanceConfiguration {
  contractVersion: 'capture-relevance-configuration-v1';
  providerId: 'cliproxy';
  modelId: string;
  temperature: number | null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface CaptureRelevanceDecision {
  keyword: string;
  titleSha256: string;
  label: 'MAIN' | 'NOT_MAIN' | 'UNSURE' | null;
}

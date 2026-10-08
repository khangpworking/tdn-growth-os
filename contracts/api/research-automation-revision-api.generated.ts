/* Generated from research-automation-revision-api.schema.json. Do not edit by hand. */

export type ResearchAutomationRevisionApiContract =
  | AutomationReportRevisionRequest
  | ResearchAutomationRevisionCancelRequest
  | ResearchAutomationReportVersionList
  | ResearchAutomationReportAttemptList
  | ResearchAutomationRevisionReceipt
  | AutomationMarketPresentationRevisionRequest;
export type Uuid = string;
export type Digest = string;

export interface AutomationReportRevisionRequest {
  contractVersion: 'automation-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: {
    metric:
      | {
          decision: 'KEEP' | 'SKIP';
        }
      | {
          decision: 'USE_PREPARED';
          packageId: string;
        };
    nativeReview:
      | {
          decision: 'KEEP' | 'SKIP';
        }
      | {
          decision: 'USE_PACKAGE';
          packageId: string;
        };
  };
}
export interface ResearchAutomationRevisionCancelRequest {
  contractVersion: 'automation-report-revision-cancel-v1';
  requestKey: string;
}
export interface ResearchAutomationReportVersionList {
  contractVersion: 'automation-report-version-list-v1';
  workspaceId: Uuid;
  runId: Uuid;
  versions: ResearchAutomationReportPair[];
}
export interface ResearchAutomationReportPair {
  pairId: Digest;
  versionNumber: number;
  attemptId: Uuid | null;
  /**
   * @minItems 1
   * @maxItems 2
   */
  outputs: Output[];
}
export interface Output {
  kind: 'MARKET' | 'INSIGHT';
  versionId: Digest;
  pdfAvailable: boolean;
}
export interface ResearchAutomationReportAttemptList {
  contractVersion: 'automation-report-attempt-list-v1';
  workspaceId: Uuid;
  runId: Uuid;
  /**
   * @maxItems 100
   */
  attempts: ResearchAutomationRevisionReceipt[];
}
export interface ResearchAutomationRevisionReceipt {
  attemptId: Uuid;
  attemptNumber: number;
  state: 'QUEUED' | 'RUNNING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';
  pairId: Digest | null;
  exactRetry: boolean;
}
export interface AutomationMarketPresentationRevisionRequest {
  contractVersion: 'automation-market-presentation-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: {
    metric: {
      decision: 'KEEP';
    };
    nativeReview: {
      decision: 'KEEP';
    };
  };
  unitSpecIntakeSha256?: string;
}

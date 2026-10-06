/* Generated from automation-report-revision.schema.json. Do not edit by hand. */

export type Digest = string;

export interface AutomationReportRevisionRequest {
  contractVersion: 'automation-report-revision-v1';
  requestKey: string;
  previousPairId: Digest;
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

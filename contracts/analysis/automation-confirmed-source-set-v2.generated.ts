/* Generated from automation-confirmed-source-set-v2.schema.json. Do not edit by hand. */

export type Digest = string;

/**
 * Immutable explicitly confirmed public review acquisition and source inputs. Admission is not provider authentication, coding approval or complete coverage.
 */
export interface AutomationConfirmedSourceSetV2 {
  contractVersion: 'automation-confirmed-source-set-v2';
  runId: string;
  workspaceId: string;
  executionId: string;
  startSha256: Digest;
  scopeSha256: Digest;
  requestSha256: Digest;
  confirmedAt: string;
  metric:
    | {
        decision: 'ADMITTED';
        sourcePackage: SourceIdentity;
      }
    | {
        decision: 'ABSENT' | 'SKIPPED';
      };
  nativeReview: {
    decision: 'NONE';
  };
  reviewAcquisition: Acquisition;
}
export interface SourceIdentity {
  packageId: string;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
}
export interface Acquisition {
  providerId: 'shopee-public-review';
  maxReviewsPerProduct: number;
  mappingRevision: 'shopee-public-review-row-v1';
  sampleMode: 'STANDARD' | 'TRIAL';
}

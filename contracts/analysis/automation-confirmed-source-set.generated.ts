/* Generated from automation-confirmed-source-set.schema.json. Do not edit by hand. */

export type Digest = string;

/**
 * Immutable first-version inputs frozen with confirmation. Admission is not provider authentication, labels acceptance or complete coverage. Native NONE retains the original explicitly approved collection path; SKIPPED never collects reviews.
 */
export interface AutomationConfirmedSourceSet {
  contractVersion: 'automation-confirmed-source-set-v1';
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
  nativeReview:
    | {
        decision: 'RESOLVED';
        referenceSha256: Digest;
      }
    | {
        decision: 'NONE' | 'SKIPPED';
      };
}
export interface SourceIdentity {
  packageId: string;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
}

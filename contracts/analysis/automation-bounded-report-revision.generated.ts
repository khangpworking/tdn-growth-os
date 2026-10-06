/* Generated from automation-bounded-report-revision.schema.json. Do not edit by hand. */

export type Digest = string;

export interface AutomationBoundedReportRevisionRequest {
  contractVersion: 'automation-bounded-report-revision-v1';
  requestKey: string;
  previousPairId: Digest;
  sources: {
    metric: Keep;
    nativeReview: Keep;
  };
  boundedMethods:
    | BoundedMethodPackageSelection
    | {
        decision: 'SKIP';
      };
}
export interface Keep {
  decision: 'KEEP';
}
/**
 * Exact finalized Foundation package and descriptor path. Package identity is checked; descriptor references verify literal bytes only, not truth, period compatibility or approval.
 */
export interface BoundedMethodPackageSelection {
  decision: 'USE_PACKAGE';
  packageId: string;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
  descriptorPath: string;
}

/* Generated from automation-quote-report-revision.schema.json. Do not edit by hand. */

export type Digest = string;

/**
 * Quote-only report revision. Metric and native review sources are kept unchanged; quote methods either use one exact finalized Foundation package descriptor or are skipped.
 */
export interface AutomationQuoteReportRevisionRequest {
  contractVersion: 'automation-quote-report-revision-v1';
  requestKey: string;
  previousPairId: Digest;
  sources: {
    metric: Keep;
    nativeReview: Keep;
  };
  quoteMethods:
    | QuoteMethodPackageSelection
    | {
        decision: 'SKIP';
      };
}
export interface Keep {
  decision: 'KEEP';
}
/**
 * Exact finalized Foundation package and GenericQuoteUnit descriptor path (descriptor without sourcePackage). Package identity, source bytes and the literal structured-quote profile are checked; this verifies literal declarations only, not provider truth, variant/pack correctness, checkout or approval.
 */
export interface QuoteMethodPackageSelection {
  decision: 'USE_PACKAGE';
  packageId: string;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
  descriptorPath: string;
}

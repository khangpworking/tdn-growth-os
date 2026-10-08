/* Generated from automation-market-presentation-revision.schema.json. Do not edit by hand. */

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

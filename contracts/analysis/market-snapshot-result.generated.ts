/* Generated from market-snapshot-result.schema.json. Do not edit by hand. */

export interface MarketSnapshotResult {
  contractVersion: '1.0.0';
  resultId: string;
  calculationKey: 'market_snapshot_v1';
  calculationVersion: 1;
  completedAt: string;
  dataPack: {
    dataPackId: string;
    packKey: string;
    version: number;
    manifestArtifactSha256: string;
  };
  period: {
    scope: string;
    start: string;
    end: string;
    grain: string;
  };
  coverage: {
    selectedObservationCount: number;
    uniqueProductCount: number;
    periodRevenueObservedProductCount: number;
    periodUnitsSoldObservedProductCount: number;
  };
  totals: {
    periodRevenueVndTotal: string | null;
    periodUnitsSoldTotal: string | null;
  };
  ignoredMetricCodes: string[];
}

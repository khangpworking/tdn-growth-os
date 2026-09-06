/* Generated from json-export.schema.json. Do not edit by hand. */

/**
 * Canonical trust-boundary contract for one synthetic provider-shaped multi-row JSON export.
 */
export interface JsonExportInput {
  contractVersion: '1.0.0';
  source: {
    sourceId: string;
    sourceType: 'provider_export';
    displayName: string;
  };
  ingestion: {
    idempotencyKey: string;
    acquiredAt: string;
    mediaType: 'application/json';
    evidenceGrade: {
      grade: 'synthetic' | 'unverified' | 'provider_reported' | 'corroborated' | 'verified';
      basis: string;
    };
  };
  period: {
    start: string;
    end: string;
    grain: string;
    scope: string;
  };
  /**
   * @minItems 1
   */
  rows: [
    {
      platform: string;
      platformProductId: string;
      productName: string;
      periodRevenueVnd?: number;
      periodUnitsSold?: number;
      lifetimeRevenueVnd?: number;
      revenueGrowth?: {
        value: number;
        unit: 'percent';
        scale: number;
      };
    },
    ...{
      platform: string;
      platformProductId: string;
      productName: string;
      periodRevenueVnd?: number;
      periodUnitsSold?: number;
      lifetimeRevenueVnd?: number;
      revenueGrowth?: {
        value: number;
        unit: 'percent';
        scale: number;
      };
    }[],
  ];
}

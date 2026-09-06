/* Generated from manual-observation.schema.json. Do not edit by hand. */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };

/**
 * Canonical trust-boundary contract for one synthetic/manual Box 1 product observation.
 */
export interface ManualObservationInput {
  contractVersion: '1.0.0';
  source: {
    /**
     * Namespaced source identity, for example manual:synthetic-fixture.
     */
    sourceId: string;
    sourceType: 'manual' | 'provider_export' | 'provider_api';
    displayName: string;
  };
  ingestion: {
    idempotencyKey: string;
    acquiredAt: string;
    mediaType: 'application/json';
    evidenceGrade: {
      grade: 'synthetic' | 'unverified' | 'provider_reported' | 'corroborated' | 'verified';
      /**
       * Explicit justification supplied by the importer; never inferred from source name.
       */
      basis: string;
    };
  };
  product: {
    platform: string;
    platformProductId: string;
    /**
     * Display metadata only; it is not part of product identity.
     */
    productName: string;
  };
  observation: {
    observedAt: string;
    scope: string;
    period: {
      start: string;
      end: string;
      /**
       * Provider/user-declared grain such as day, month, rolling_30d, or custom; never forced to week.
       */
      grain: string;
    };
    /**
     * Revenue for exactly the declared period, in integer VND. Absence means missing; zero is observed zero.
     */
    periodRevenueVnd?: number;
    /**
     * Lifetime revenue in integer VND, kept distinct from period revenue.
     */
    lifetimeRevenueVnd?: number;
    unitsSold?: number;
    revenueGrowth?: {
      value: number;
      unit: 'percent';
      /**
       * Stored value divided by scale gives percentage points; e.g. 1250/100 = 12.50%.
       */
      scale: number;
    };
    /**
     * Relative Trends interest index, explicitly not search volume.
     */
    trendsInterestIndex?: {
      value: number;
      unit: 'relative_interest_index_0_100';
    };
  };
  /**
   * Synthetic/manual source payload persisted byte-for-byte after deterministic canonical JSON serialization.
   */
  rawPayload:
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | {
        [k: string]: JsonValue;
      };
}

/* Generated from automation-market-presentation-method.schema.json. Do not edit by hand. */

export interface AutomationMarketPresentationMethod {
  contractVersion: 'automation-market-presentation-method-v1';
  methodVersion: 'market-presentation-v1';
  binding: {
    workspaceId: string;
    runId: string;
    previousPairId: string;
    scopeSha256: string;
    metric: {
      sourcePackage: {
        packageId: string;
        manifestArtifactSha256: string;
        packageContentSha256: string;
      };
      workbookSha256: string;
      resultSha256: string;
    } | null;
  };
  input: {
    metric: MetricScopeOutput | null;
    /**
     * @maxItems 10000
     */
    rows: Row[];
    unitSpec: {
      sha256: string;
      record: ResearchAutomationUnitSpecIntakeRecord;
    } | null;
  };
  /**
   * @maxItems 6
   */
  findings: {
    id: 'inventory' | 'demand' | 'missing' | 'precision' | 'unit-prices';
    statement: string;
    scope: string;
    sectionId: 'M03' | 'M08';
    pending: boolean;
    /**
     * @minItems 1
     * @maxItems 100
     */
    evidence: {
      sourceSha256: string;
      locator: string;
      label: string;
    }[];
  }[];
  /**
   * @maxItems 500
   */
  unitPrices: {
    rowI: number;
    observation: UnitPriceObservation;
    /**
     * @minItems 1
     * @maxItems 2
     */
    sources: {
      sourceSha256: string;
      locator: string;
    }[];
    value: number | null;
    standard: string;
    comparisonKey: string;
    missing: string | null;
    ownerDeclared: boolean;
  }[];
  advertising: 'UNAVAILABLE_UNCONFIRMED_RETAINED_SEMANTICS';
}
export interface MetricScopeOutput {
  contractVersion: '1.0.0';
  methodVersion: 'metric-scope-v1';
  rounding: 'percent-half-even-2-v1';
  status: 'DRAFT';
  verification: 'NORMALIZED_INPUT_ONLY';
  inputSha256: string;
  input: MetricScopeInput;
  labelIssues: {
    recordIndex: number;
    reason: 'MISSING_LABEL' | 'STALE_LABEL' | 'CODEBOOK_MISMATCH';
  }[];
  /**
   * @minItems 3
   * @maxItems 3
   */
  scopes: Scope[];
  /**
   * @maxItems 2
   */
  comparisons: {
    from: 'all';
    to: 'wide' | 'core';
    revenueDelta: string | null;
    commonShopRanks: {
      shopKey: string;
      fromRank: number;
      toRank: number;
      delta: number;
    }[];
    topShopRetention: {
      k: 1 | 3 | 10;
      commonShopKeys: string[];
    }[];
    removedRecordIndices: number[];
    unitsDelta: string | null;
  }[];
  rendererVersion: 'metric-draft-vi-v1';
}
export interface MetricScopeInput {
  contractVersion: '1.0.0';
  scope: {
    key: string;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    /**
     * Declared acquisition time, or explicit null when unconfirmed. Never inferred from the reporting period or filesystem timestamp.
     */
    acquiredAt: string | null;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  sources: {
    sha256: string;
    label: string;
    representationRole: 'primary' | 'structured' | 'derived';
    evidenceFamily: string;
    provenanceBasis: string;
  }[];
  /**
   * @maxItems 10000
   */
  records: {
    shopId: string;
    listingId: string;
    title: string;
    category: string;
    source: EvidenceRef;
    revenue: Observation;
    units: Observation;
    label: null | Label;
    measurement: {
      profileId: string;
      scopeKey: string;
      platform: 'shopee' | 'tiktok';
      selection: 'ON' | 'OFF' | 'UNSPECIFIED';
      start: string;
      end: string;
      currency: 'VND';
    };
  }[];
  profileId: string;
  labelCodebookVersion: string;
  wideUnknownPolicy: 'include' | 'exclude';
}
export interface EvidenceRef {
  sourceSha256: string;
  locator: string;
}
export interface Observation {
  state: 'missing' | 'observed_zero' | 'observed_value';
  value: string | null;
  precision: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
  source: EvidenceRef;
  displayedValue: string | null;
}
export interface Label {
  classification: 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN';
  group: string;
  contentSha256: string;
  methodVersion: string;
  source: EvidenceRef;
  adjudication: 'human' | 'assistant' | 'unknown';
}
export interface Scope {
  key: 'all' | 'wide' | 'core';
  status: 'CALCULATED' | 'BLOCKED_LABELS';
  recordIndices: number[];
  listingCount: number;
  shopCount: number;
  revenue: Total;
  units: Total;
  warnings: (
    | 'EMPTY_SCOPE'
    | 'MISSING_REVENUE'
    | 'MISSING_UNITS'
    | 'NON_EXACT_REVENUE'
    | 'NON_EXACT_UNITS'
    | 'ZERO_REVENUE'
    | 'LABELS_REQUIRE_ADJUDICATION'
  )[];
  shops: Shop[];
  groups: {
    group: string;
    listingCount: number;
    revenue: Total;
    units: Total;
    revenueShare: Ratio | null;
  }[];
  concentration: {
    k: 1 | 3 | 10;
    usedShopCount: number;
    share: Ratio | null;
  }[];
  withoutTopShop: {
    removedShopKey: string;
    listingCount: number;
    revenue: Total;
    remainingRevenueShare: Ratio | null;
    shops: Shop[];
    concentration: {
      k: 1 | 3 | 10;
      usedShopCount: number;
      share: Ratio | null;
    }[];
  } | null;
}
export interface Total {
  value: string | null;
  observedCount: number;
  missingCount: number;
  nonExactCount: number;
  complete: boolean;
}
export interface Shop {
  shopKey: string;
  revenue: Total;
  units: Total;
}
export interface Ratio {
  numerator: string;
  denominator: string;
  percent: string;
}
export interface Row {
  i: number;
  platform: 'shopee' | 'tiktok';
  listing: string;
  shop: string;
  shopName?: string;
  cat: string;
  rev: number | null;
  units: number | null;
  asp: number | null;
  brand: string;
  title: string;
  start?: string | null;
  label?: string;
}
export interface ResearchAutomationUnitSpecIntakeRecord {
  contractVersion: 'reader-unit-spec-intake-record-v1';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  workbookSha256: string;
  actorId: string;
  request: ResearchAutomationUnitSpecIntakeRequest;
}
export interface ResearchAutomationUnitSpecIntakeRequest {
  contractVersion: 'reader-unit-spec-intake-v1';
  metricPackageId: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: ('shopee' | 'tiktok')[];
  unitPrices: UnitPrices;
}
export interface UnitPrices {
  /**
   * @maxItems 16
   */
  sources: unknown[];
  /**
   * @minItems 1
   */
  records: unknown[];
}
export interface UnitPriceObservation {
  platform: 'shopee' | 'tiktok';
  listing: string;
  variant: string;
  category: {
    label: string;
    kind: 'MASS' | 'VOLUME' | 'COUNT' | 'DURABLE' | 'COMBO';
    massBasis: 'NET' | 'DRAINED' | 'NOT_APPLICABLE';
    countKind: string | null;
    specGroup: string | null;
  };
  price: {
    value: number | null;
    currency: 'VND';
    kind: 'LISTED' | 'PAYMENT' | 'CONDITIONAL_PROMO';
    /**
     * @maxItems 20
     */
    conditions: string[];
  };
  quantity: {
    value: number | null;
    unit: 'g' | 'ml' | 'count' | 'item' | 'combo';
  };
  period: {
    start: string;
    end: string;
  };
}

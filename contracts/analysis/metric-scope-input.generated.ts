/* Generated from metric-scope-input.schema.json. Do not edit by hand. */

export interface MetricScopeInput {
  contractVersion: '1.0.0';
  scope: {
    key: string;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    acquiredAt: string;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  sources: [
    {
      sha256: string;
      label: string;
      representationRole: 'primary' | 'structured' | 'derived';
      evidenceFamily: string;
      provenanceBasis: string;
    },
    ...{
      sha256: string;
      label: string;
      representationRole: 'primary' | 'structured' | 'derived';
      evidenceFamily: string;
      provenanceBasis: string;
    }[],
  ];
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

/* Generated from metric-source-manifest.schema.json. Do not edit by hand. */

export type MetricSourceManifest = {
  [k: string]: unknown;
} & {
  contractVersion: '1.0.0';
  profileId: 'metric-shopee-product-list-sheet1-v1' | 'metric-shopee-product-list-sheet1-v2';
  profileVersion: '1.0.0' | '2.0.0';
  source: {
    sha256: string;
    label: string;
    provenanceBasis: string;
    evidenceFamily: string;
    sheetName: 'Sheet1';
    headerSha256:
      | '8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba'
      | 'b5b493190917fac69bd1e2cf1aa618aae175a7fd314ec635e44bcf29aab6f7ac';
    lastRow: number;
  };
  scope: Scope;
  precision: {
    revenue: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
    units: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
  };
  labelCodebookVersion: string;
  wideUnknownPolicy: 'include' | 'exclude';
};

export interface Scope {
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
}

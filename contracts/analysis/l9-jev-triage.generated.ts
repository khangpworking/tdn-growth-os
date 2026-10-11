/* Generated from l9-jev-triage.schema.json. Do not edit by hand. */

export interface L9JevTriageSidecar {
  contractVersion: 'l9-jev-triage-v1';
  dataVersion: string;
  category: string;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: [string, ...string[]];
  /**
   * @maxItems 500
   */
  exclusions: {
    term: string;
    reason: string;
  }[];
  model: string;
  status: 'DISABLED' | 'COMPLETED' | 'UNAVAILABLE';
  /**
   * @maxItems 5000
   */
  auditRows: {
    recordId: string;
    model: string;
    choice: ('ABOUT_PRODUCT' | 'NOT_ABOUT_PRODUCT' | 'UNRESOLVED') | null;
    confidence: number | null;
    gateOutcome: 'INCLUDED' | 'EXCLUDED' | 'UNCHANGED' | 'NO_DECISION';
    reason: ('đúng sản phẩm (máy phân loại)' | 'không nói về sản phẩm (máy phân loại)') | null;
  }[];
  /**
   * @maxItems 1
   */
  runNotes: [] | ['L9_JEV_UNAVAILABLE'];
}

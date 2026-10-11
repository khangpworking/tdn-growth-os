/* Generated from l9-jev-triage.schema.json. Do not edit by hand. */

export type IncludedAudit = AuditBase & {
  choice?: 'ABOUT_PRODUCT';
  confidence?: number;
  gateOutcome?: 'INCLUDED';
  reason?: 'đúng sản phẩm (máy phân loại)';
  [k: string]: unknown;
};
export type ExcludedAudit = AuditBase & {
  choice?: 'NOT_ABOUT_PRODUCT';
  confidence?: number;
  gateOutcome?: 'EXCLUDED';
  reason?: 'không nói về sản phẩm (máy phân loại)';
  [k: string]: unknown;
};
export type UnchangedAudit = AuditBase & {
  gateOutcome?: 'UNCHANGED';
  reason?: null;
  [k: string]: unknown;
};
export type NoDecisionAudit = AuditBase & {
  gateOutcome?: 'NO_DECISION';
  reason?: null;
  [k: string]: unknown;
};

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
  l9Fingerprint: string;
  /**
   * @maxItems 24000
   */
  auditRows: (IncludedAudit | ExcludedAudit | UnchangedAudit | NoDecisionAudit)[];
  /**
   * @maxItems 1
   */
  runNotes: [] | ['L9_JEV_UNAVAILABLE'];
}
export interface AuditBase {
  recordId: string;
  model: string;
  choice: ('ABOUT_PRODUCT' | 'NOT_ABOUT_PRODUCT' | 'UNRESOLVED') | null;
  confidence: number | null;
  gateOutcome: 'INCLUDED' | 'EXCLUDED' | 'UNCHANGED' | 'NO_DECISION';
  reason: ('đúng sản phẩm (máy phân loại)' | 'không nói về sản phẩm (máy phân loại)') | null;
}

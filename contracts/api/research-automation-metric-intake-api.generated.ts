/* Generated from research-automation-metric-intake-api.schema.json. Do not edit by hand. */

/**
 * Multipart metadata and safe receipt for a bounded operator-supplied original export. This prepares an exact source, not scope confirmation, provider authentication or report execution.
 */
export type ResearchAutomationMetricIntakeApi =
  | ResearchAutomationMetricPrepareRequest
  | ResearchAutomationMetricPrepareReceipt
  | ResearchAutomationPreparedMetricList;
/**
 * @maxItems 5
 */
export type ExactShopeeUrls = string[];

export interface ResearchAutomationMetricPrepareRequest {
  contractVersion: 'automation-metric-prepare-v1';
  requestKey: string;
  expectedRevision: number;
  scope: ResearchAutomationPreparedScope;
  sourceLabel: string;
  sourceContext: string;
  measurementPeriod: {
    startDate: string;
    endDate: string;
    basis: string;
  };
  selection: 'ON' | 'OFF' | 'UNSPECIFIED';
  acquiredAt: string | null;
  precision: {
    revenue: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
    units: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
  };
}
export interface ResearchAutomationPreparedScope {
  definition: string;
  /**
   * @maxItems 30
   */
  includeTerms: string[];
  /**
   * @maxItems 30
   */
  excludeTerms: string[];
  /**
   * @maxItems 4
   */
  selectedProductIds: string[];
  /**
   * @maxItems 8
   */
  peerProductIds: string[];
  exactShopeeUrls?: ExactShopeeUrls;
}
export interface ResearchAutomationMetricPrepareReceipt {
  contractVersion: 'automation-metric-prepared-v1';
  requestKey: string;
  packageId: string;
  state: 'PREPARED_NOT_ADMITTED';
  exactRetry: boolean;
  recordCount: number;
  sourceLabel: string;
  measurementPeriod: {
    startDate: string;
    endDate: string;
    basis: string;
  };
  acquiredAt: string | null;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
}
export interface ResearchAutomationPreparedMetricList {
  contractVersion: 'automation-prepared-metric-list-v1';
  workspaceId: string;
  runId: string;
  /**
   * @maxItems 100
   */
  sources: ResearchAutomationPreparedMetricEntry[];
}
export interface ResearchAutomationPreparedMetricEntry {
  packageId: string;
  recordCount: number;
  request: ResearchAutomationMetricPrepareRequest;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
}

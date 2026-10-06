/* Generated from research-automation-source-status-api.schema.json. Do not edit by hand. */

/**
 * Read-only board of research data sources. Built from executor configuration and stored history only; reading it never calls a provider and never reveals a credential value.
 */
export type ResearchAutomationSourceStatusApiContract = ResearchAutomationSourceStatus;
export type Uuid = string;
export type Timestamp = string;
export type ResearchAutomationSourceId = 'KALODATA' | 'SERPAPI' | 'APIFY_SHOPEE' | 'METRIC';
/**
 * READY: configured and used by runs. CONFIGURED_NOT_WIRED: credential present but runs do not call it yet. NOT_CONFIGURED: credential or spending cap missing. MANUAL_IMPORT: data arrives only as an owner upload. EXECUTOR_DISABLED: this server cannot run research at all.
 */
export type ResearchAutomationSourceState =
  'READY' | 'CONFIGURED_NOT_WIRED' | 'NOT_CONFIGURED' | 'MANUAL_IMPORT' | 'EXECUTOR_DISABLED';
export type ResearchAutomationCredentialState = 'CONFIGURED' | 'MISSING' | 'NOT_REQUIRED';

export interface ResearchAutomationSourceStatus {
  contractVersion: 'research-automation-source-status-v1';
  workspaceId: Uuid;
  checkedAt: Timestamp;
  executorEnabled: boolean;
  /**
   * @maxItems 4
   */
  sources:
    | []
    | [ResearchAutomationSourceStatusEntry]
    | [ResearchAutomationSourceStatusEntry, ResearchAutomationSourceStatusEntry]
    | [ResearchAutomationSourceStatusEntry, ResearchAutomationSourceStatusEntry, ResearchAutomationSourceStatusEntry]
    | [
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
      ];
}
export interface ResearchAutomationSourceStatusEntry {
  source: ResearchAutomationSourceId;
  state: ResearchAutomationSourceState;
  credential: ResearchAutomationCredentialState;
  wiredIntoRuns: boolean;
  paid: boolean;
  /**
   * Latest stored capture or finalized upload in this workspace.
   */
  lastDataAt: Timestamp | null;
  /**
   * Stored captures or finalized uploads in this workspace.
   */
  dataCount: number;
  /**
   * Latest recorded provider usage in this workspace; null for manual imports.
   */
  lastUsageAt: Timestamp | null;
}

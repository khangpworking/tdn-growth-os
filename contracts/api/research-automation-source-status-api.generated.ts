/* Generated from research-automation-source-status-api.schema.json. Do not edit by hand. */

/**
 * Read-only board of research data sources. Built from executor configuration and stored history only; reading it never calls a provider and never reveals a credential value.
 */
export type ResearchAutomationSourceStatusApiContract =
  ResearchAutomationSourceStatus | ResearchAutomationRunPdfStates | ResearchAutomationAttachPdfRequest;
export type Uuid = string;
export type Timestamp = string;
export type ResearchAutomationSourceId = 'KALODATA' | 'SERPAPI' | 'APIFY_SHOPEE' | 'METRIC' | 'PAGEINDEX';
/**
 * READY: configured and used by runs. CONFIGURED_NOT_WIRED: credential present but runs do not call it yet. NOT_CONFIGURED: credential or spending cap missing. MANUAL_IMPORT: data arrives only as an owner upload. EXECUTOR_DISABLED: this server cannot run research at all.
 */
export type ResearchAutomationSourceState =
  'READY' | 'CONFIGURED_NOT_WIRED' | 'NOT_CONFIGURED' | 'MANUAL_IMPORT' | 'EXECUTOR_DISABLED';
export type ResearchAutomationCredentialState = 'CONFIGURED' | 'MISSING' | 'NOT_REQUIRED';
export type Count = number;
export type ResearchAutomationPdfState =
  'INDEXING' | 'READY' | 'FAILED' | 'SKIPPED_LOW_BALANCE' | 'SKIPPED_USAGE_LIMIT' | 'DISABLED';

export interface ResearchAutomationSourceStatus {
  contractVersion: 'research-automation-source-status-v1';
  workspaceId: Uuid;
  checkedAt: Timestamp;
  executorEnabled: boolean;
  /**
   * @maxItems 5
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
      ]
    | [
        ResearchAutomationSourceStatusEntry,
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
   * Stored captures or uploads; null if the PDF ledger is unavailable.
   */
  dataCount: Count | null;
  /**
   * Latest recorded provider usage in this workspace; null for manual imports.
   */
  lastUsageAt: Timestamp | null;
  pageindex?: ResearchAutomationPageIndexDetail;
}
/**
 * Document-indexing connector detail. Present only on the PAGEINDEX entry. Money is integer micro-dollars.
 */
export interface ResearchAutomationPageIndexDetail {
  /**
   * Whether new PDFs are currently sent for indexing.
   */
  automaticState: 'INDEXING_PDFS' | 'PAUSED_LOW_BALANCE' | 'DISABLED';
  /**
   * PDFs ever uploaded for indexing.
   */
  documentsSent: Count | null;
  /**
   * Estimated remaining credit, or null when unknown.
   */
  balanceMicroDollars: number | null;
  /**
   * When the estimate was computed.
   */
  balanceCheckedAt: Timestamp | null;
  /**
   * Vendor billing page.
   */
  billingUrl: string | null;
  /**
   * Stored pages that accrue monthly cost.
   */
  activePages: Count | null;
  /**
   * Full-month active-page cost at the current page count.
   */
  estimatedMonthlyCostMicroDollars: number | null;
  usageLimited: boolean;
}
export interface ResearchAutomationRunPdfStates {
  contractVersion: 'research-automation-run-pdfs-v1';
  workspaceId: Uuid;
  runId: Uuid;
  paused: boolean;
  usageLimited: boolean;
  documents: ResearchAutomationPdfDocument[];
}
export interface ResearchAutomationPdfDocument {
  fileName: string;
  sourceSha256: string;
  state: ResearchAutomationPdfState;
  cloudDocId: string | null;
}
export interface ResearchAutomationAttachPdfRequest {
  contractVersion: 'research-automation-pdf-attach-v1';
  fileName: string;
}

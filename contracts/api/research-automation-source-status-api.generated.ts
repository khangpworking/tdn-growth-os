/* Generated from research-automation-source-status-api.schema.json. Do not edit by hand. */

/**
 * Read-only board of research data sources. Built from executor configuration and stored history only; reading it never calls a provider and never reveals a credential value.
 */
export type ResearchAutomationSourceStatusApiContract =
  ResearchAutomationSourceStatus | ResearchAutomationRunPdfStates | ResearchAutomationAttachPdfRequest;
export type Uuid = string;
export type Timestamp = string;
export type ResearchAutomationSourceId =
  | 'KALODATA'
  | 'SERPAPI'
  | 'APIFY_SHOPEE'
  | 'METRIC'
  | 'PAGEINDEX'
  | 'KALODATA_VIDEO_FILE'
  | 'APIFY_TIKTOK_COMMENTS'
  | 'VIDEO_READING'
  | 'META_AD_LIBRARY'
  | 'OFFICIAL_STATS'
  | 'WORLD_BANK';
/**
 * READY: configured and used by runs. CONFIGURED_NOT_WIRED: credential present but runs do not call it yet. NOT_CONFIGURED: credential or spending cap missing. MANUAL_IMPORT: data arrives only as an owner upload. NOT_BUILT: the collector does not exist on this build yet; pendingPackage names the owning package. EXECUTOR_DISABLED: this server cannot run research at all.
 */
export type ResearchAutomationSourceState =
  'READY' | 'CONFIGURED_NOT_WIRED' | 'NOT_CONFIGURED' | 'MANUAL_IMPORT' | 'NOT_BUILT' | 'EXECUTOR_DISABLED';
export type ResearchAutomationCredentialState = 'CONFIGURED' | 'MISSING' | 'NOT_REQUIRED';
export type Count = number;
export type ResearchAutomationRegistryId = string;
export type ResearchAutomationSourceTier = 'A' | 'B' | 'C' | 'D';
export type ResearchAutomationSourceGroup = 'SALES_MARKET' | 'CUSTOMER_VOICE' | 'SELLER_VOICE' | 'MACRO' | 'DOCUMENTS';
export type ResearchAutomationPdfState =
  'INDEXING' | 'READY' | 'FAILED' | 'SKIPPED_LOW_BALANCE' | 'SKIPPED_USAGE_LIMIT' | 'DISABLED';

export interface ResearchAutomationSourceStatus {
  contractVersion: 'research-automation-source-status-v1';
  workspaceId: Uuid;
  checkedAt: Timestamp;
  executorEnabled: boolean;
  /**
   * @maxItems 11
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
      ]
    | [
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
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
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
      ]
    | [
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
        ResearchAutomationSourceStatusEntry,
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
        ResearchAutomationSourceStatusEntry,
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
        ResearchAutomationSourceStatusEntry,
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
  /**
   * Owning package that flips a NOT_BUILT card; null once built.
   */
  pendingPackage?: string | null;
  /**
   * Source registry IDs (input-data-sources-30-sections.md) covered by this card.
   *
   * @minItems 1
   * @maxItems 4
   */
  registryIds?:
    | [ResearchAutomationRegistryId]
    | [ResearchAutomationRegistryId, ResearchAutomationRegistryId]
    | [ResearchAutomationRegistryId, ResearchAutomationRegistryId, ResearchAutomationRegistryId]
    | [
        ResearchAutomationRegistryId,
        ResearchAutomationRegistryId,
        ResearchAutomationRegistryId,
        ResearchAutomationRegistryId,
      ];
  /**
   * Single tier only when every registry ID on this card shares it; mixed connectors keep null with a per-ID tierDetail.
   */
  tier?: ResearchAutomationSourceTier | null;
  /**
   * Per-ID tiers for mixed connectors, e.g. S01: C; S04: B.
   */
  tierDetail?: string | null;
  group?: ResearchAutomationSourceGroup;
  /**
   * The report citation name from the registry.
   */
  reportName?: string | null;
  /**
   * Configured USD charge cap, or null when none is configured. Never defaulted.
   */
  spendCapUsd?: number | null;
  /**
   * Per-operation history rows for multi-operation providers such as SerpApi.
   */
  operations?:
    | []
    | [ResearchAutomationSourceOperation]
    | [ResearchAutomationSourceOperation, ResearchAutomationSourceOperation]
    | [ResearchAutomationSourceOperation, ResearchAutomationSourceOperation, ResearchAutomationSourceOperation]
    | [
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
      ]
    | [
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
      ]
    | [
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
      ]
    | [
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
      ]
    | [
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
        ResearchAutomationSourceOperation,
      ]
    | null;
  pageindex?: ResearchAutomationPageIndexDetail;
}
/**
 * One stored-history row per provider operation. Count unit is stored captures, never mixed with uploads or usage rows. Usage stays provider-level: lastUsageAt is null unless exact per-operation evidence exists.
 */
export interface ResearchAutomationSourceOperation {
  operation: string;
  count: Count;
  /**
   * Latest stored capture for this operation.
   */
  lastDataAt: Timestamp | null;
  /**
   * Latest recorded provider usage for this operation; null when only provider-level usage exists.
   */
  lastUsageAt: Timestamp | null;
  /**
   * @minItems 1
   * @maxItems 4
   */
  registryIds?:
    | [ResearchAutomationRegistryId]
    | [ResearchAutomationRegistryId, ResearchAutomationRegistryId]
    | [ResearchAutomationRegistryId, ResearchAutomationRegistryId, ResearchAutomationRegistryId]
    | [
        ResearchAutomationRegistryId,
        ResearchAutomationRegistryId,
        ResearchAutomationRegistryId,
        ResearchAutomationRegistryId,
      ];
  /**
   * Single tier only when every registry ID on this operation shares it; otherwise null with no aggregate.
   */
  tier?: ResearchAutomationSourceTier | null;
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

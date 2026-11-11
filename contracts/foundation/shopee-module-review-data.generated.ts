/* Generated from shopee-module-review-data.schema.json. Do not edit by hand. */

export type ShopeeModuleReviewData =
  | RunTracking
  | RunTrackingRecord
  | ReviewDataSaveInput
  | ReviewDataExportInput
  | ReviewDataSaved
  | ReviewDataExport
  | ReviewDataLink
  | ReviewDataExportAvailability
  | ReviewDataSource
  | ReviewDataView
  | ReviewDataExportManifest
  | ModuleReviewArchive;

export interface RunTracking {
  primaryKeyword: string | null;
  firstRunAt: string | null;
  timeBasis: 'recorded-first-accepted' | 'not-started' | 'legacy-first-unproven';
  displayTimezone: 'Asia/Ho_Chi_Minh';
  lastKnownStartedAt: string | null;
}
export interface RunTrackingRecord {
  format: 'run-tracking-v1';
  runId: string;
  requestSha256: string;
  primaryKeyword: string;
  createdAt: string | null;
  firstRunAt: string | null;
  firstObservedLaunchAt: string | null;
  historyBasis: 'new-run' | 'legacy-first-unproven';
}
export interface ReviewDataSaveInput {
  sourceSha256: string;
}
export interface ReviewDataExportInput {
  sourceSha256: string;
  format: 'json' | 'txt';
}
export interface ReviewDataSaved {
  format: 'review-data-saved-v1';
  runId: string;
  sourceSha256: string;
  datasetId: string;
  importPolicyVersion: 'module-m3-s05-v1';
  importedAt: string;
  rowCount: number;
  reviewsInserted: number;
  reviewsAlreadyPresent: number;
  runReviewsInserted: number;
  firstVersionDiffers: number;
  reused: boolean;
}
export interface ReviewDataExport {
  format: 'review-data-export-v1';
  runId: string;
  sourceSha256: string;
  exportFormat: 'json' | 'txt';
  exportVersion: 'module-review-export-v1';
  exportSha256: string;
  byteSize: number;
  fileName: string;
  rowCount: number;
  reused: boolean;
}
export interface ReviewDataLink {
  shopId: string;
  itemId: string;
  url: string;
  requested: number | null;
  actual: number | null;
  shortfall: number | null;
  complete: boolean | null;
  status: string;
}
export interface ReviewDataExportAvailability {
  canExport: boolean;
  blockedBy: ReviewDataBlockedReason | null;
  receipt: ReviewDataExport | null;
}
export interface ReviewDataBlockedReason {
  code: string;
}
export interface ReviewDataSource {
  sourceSha256: string;
  kind: 'legacy' | 'custom';
  attemptId: string | null;
  planSha256: string | null;
  status: 'SUCCEEDED' | 'FAILED';
  gateVerdict: ('PASS' | 'FAIL' | 'WAIT_OWNER') | null;
  completedAt: string | null;
  rowBasis: 'published' | 'terminal-retained';
  rowCount: number;
  /**
   * @maxItems 5
   */
  links: ReviewDataLink[];
  canExport: boolean;
  exportBlockedBy: ReviewDataBlockedReason1 | null;
  exportFormats: ReviewDataExportFormats;
  canSaveDb: boolean;
  dbBlockedBy: ReviewDataBlockedReason2 | null;
  importReceipt: ReviewDataSaved | null;
}
export interface ReviewDataBlockedReason1 {
  code: string;
}
export interface ReviewDataExportFormats {
  json: ReviewDataExportAvailability;
  txt: ReviewDataExportAvailability;
}
export interface ReviewDataBlockedReason2 {
  code: string;
}
export interface ReviewDataView {
  format: 'review-data-view-v1';
  runId: string;
  readonly: boolean;
  tracking: RunTracking;
  db: ReviewDataDatabase;
  sources: ReviewDataSource[];
}
export interface ReviewDataDatabase {
  configured: boolean;
  schemaReady: boolean;
  blockedBy: ReviewDataBlockedReason3 | null;
}
export interface ReviewDataBlockedReason3 {
  code: string;
}
export interface ReviewDataExportManifest {
  format: 'review-data-export-cache-v1';
  receipt: ReviewDataExport;
}
export interface ModuleReviewArchive {
  format: 'module-review-archive-v1';
  sourceSha256: string;
  runId: string;
  kind: 'legacy' | 'custom';
  attemptId: string | null;
  planSha256: string | null;
  status: 'SUCCEEDED' | 'FAILED';
  gateVerdict: ('PASS' | 'FAIL' | 'WAIT_OWNER') | null;
  completedAt: string | null;
  rowBasis: 'published' | 'terminal-retained';
  links: ReviewDataLink[];
  /**
   * @maxItems 10000
   */
  rows: {
    [k: string]: unknown;
  }[];
  proof: ModuleReviewProofFile[];
}
export interface ModuleReviewProofFile {
  path: string;
  sha256: string;
  bytesBase64: string;
}

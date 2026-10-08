/* Generated from kalodata-video-intake-v1.schema.json. Do not edit by hand. */

/**
 * Request, validated cited table, receipt and prepared list for one run-bound operator-supplied video/creator export (CSV or XLSX). Preparation stores an unverified, non-independent source only: it is not revision admission, report execution, data collection, transcription, provider authentication or business approval. There is no transcription code path in this package.
 */
export type KalodataVideoIntakeV1 =
  KalodataVideoPrepareRequest | KalodataVideoTable | KalodataVideoPrepareReceipt | KalodataVideoPreparedList;
export type RequestKey = string;
/**
 * Which cited table the uploaded file carries. A CSV file carries exactly one table; an XLSX workbook carries exactly the sheets of the declared tables.
 */
export type TableSelector = 'video' | 'creator' | 'both';
export type SourceLabel = string;
export type AcquiredAt = string | null;
export type Digest = string;
export type MissingDisplay = 'không có dữ liệu';
export type NonEmptyText = string;
export type NullableText = string | null;
export type NullableDecimal = string | null;
export type DateText = string | null;
export type NullableUnitsPer1000Views = string | null;
export type NullableAdShare = string | null;
export type Uuid = string;

export interface KalodataVideoPrepareRequest {
  contractVersion: 'automation-video-prepare-v1';
  requestKey: RequestKey;
  table: TableSelector;
  sourceLabel: SourceLabel;
  acquiredAt: AcquiredAt;
}
/**
 * Validated cited video and creator rows. A null value means the export cell was missing and renders as the missing display text, never as zero. Derived values are never computed over a zero denominator.
 */
export interface KalodataVideoTable {
  contractVersion: 'video-intake-table-v1';
  exportSha256: Digest;
  exportKind: 'csv' | 'xlsx';
  /**
   * @minItems 1
   * @maxItems 2
   */
  tables: ['video' | 'creator'] | ['video' | 'creator', 'video' | 'creator'];
  missingDisplay: MissingDisplay;
  /**
   * @maxItems 5000
   */
  videos: KalodataVideoRow[];
  /**
   * @maxItems 5000
   */
  creators: KalodataCreatorRow[];
}
export interface KalodataVideoRow {
  line: NonEmptyText;
  video: NullableText;
  creator: NullableText;
  revenue: NullableDecimal;
  views: NullableDecimal;
  units: NullableDecimal;
  adSpend: NullableDecimal;
  publishDate: DateText;
  productLink: NullableText;
  unitsPer1000Views: NullableUnitsPer1000Views;
  adShare: NullableAdShare;
}
export interface KalodataCreatorRow {
  line: NonEmptyText;
  creator: NullableText;
  followers: NullableDecimal;
  revenue: NullableDecimal;
  videoCount: NullableDecimal;
}
/**
 * Exact package identity for an explicit later report-block selection. Preparation is inert: no transcription, confirmation, calculation or report execution.
 */
export interface KalodataVideoPrepareReceipt {
  contractVersion: 'automation-video-prepared-v1';
  requestKey: RequestKey;
  table: TableSelector;
  packageId: Uuid;
  state: 'PREPARED_NOT_ADMITTED';
  exactRetry: boolean;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
  videoCount: number;
  creatorCount: number;
  /**
   * @minItems 4
   * @maxItems 4
   */
  files: [KalodataVideoReceiptFile, KalodataVideoReceiptFile, KalodataVideoReceiptFile, KalodataVideoReceiptFile];
  sourceLabel: SourceLabel;
  acquiredAt: string | null;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
}
export interface KalodataVideoReceiptFile {
  path: string;
  sha256: Digest;
  byteSize: number;
  mediaType: string;
}
export interface KalodataVideoPreparedList {
  contractVersion: 'automation-video-prepared-list-v1';
  workspaceId: Uuid;
  runId: Uuid;
  /**
   * @maxItems 100
   */
  sources: KalodataVideoPreparedEntry[];
}
export interface KalodataVideoPreparedEntry {
  packageId: Uuid;
  videoCount: number;
  creatorCount: number;
  request: KalodataVideoPrepareRequest;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
}

/* Generated from video-reading-v1.schema.json. Do not edit by hand. */

/**
 * Exact operator-supplied local segment/on-screen/frame evidence bound to the owning frozen run and video selection. Inert preparation, distinct seller/creator voice; no watch, cloud, transcription, model/coding call or source admission.
 */
export type VideoReadingV1 =
  | VideoReadingPrepareRequest
  | PreparedVideoReading
  | VideoReadingReadView
  | VideoReadingSourceReceipt
  | VideoReadingSourceHistory;

export interface VideoReadingPrepareRequest {
  contractVersion: 'video-reading-prepare-request-v1';
  requestKey: string;
  expectedRevision: number;
  selectionPackage: TikTokSourcePackageIdentity;
  input: OperatorVideoReading;
}
export interface TikTokSourcePackageIdentity {
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
}
export interface OperatorVideoReading {
  videoUrl: string;
  videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO';
  durationSeconds: number;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  segments: OperatorVideoSegment[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  onScreenText: OperatorVideoOnScreenText[];
  /**
   * @minItems 0
   * @maxItems 1000
   */
  frames: OperatorVideoFrame[];
}
export interface OperatorVideoSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
  captionSource: 'NATIVE' | 'SPEECH_TO_TEXT';
}
export interface OperatorVideoOnScreenText {
  startSeconds: number;
  endSeconds: number;
  text: string;
}
export interface OperatorVideoFrame {
  atSeconds: number;
  logicalPath: string;
  sha256: string;
}
export interface PreparedVideoReading {
  contractVersion: 'video-reading-v1';
  registryId: 'S14';
  workspaceId: string;
  runId: string;
  scopeSha256: string;
  sourceSetSha256: string;
  selectionSha256: string;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
  state: 'PREPARED_NOT_ADMITTED';
  voice: 'SELLER' | 'CREATOR';
  input: OperatorVideoReading;
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations: string[];
}
export interface VideoReadingReadView {
  contractVersion: 'video-reading-read-v1';
  registryId: 'S14';
  /**
   * @minItems 0
   * @maxItems 10000
   */
  rows: VideoReadingReadRow[];
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations: string[];
}
export interface VideoReadingReadRow {
  text: string;
  voice: 'SELLER' | 'CREATOR';
  captionSource: 'NATIVE' | 'SPEECH_TO_TEXT';
  startSeconds: number;
  endSeconds: number;
  citation: number | null;
}
export interface VideoReadingSourceReceipt {
  contractVersion: 'video-reading-source-receipt-v1';
  requestKey: string;
  package: TikTokSourcePackageIdentity;
  readingSha256: string;
  exactRetry: boolean;
  state: 'PREPARED_NOT_ADMITTED';
}
export interface VideoReadingSourceHistory {
  contractVersion: 'video-reading-source-history-v1';
  workspaceId: string;
  runId: string;
  /**
   * @minItems 0
   * @maxItems 1000
   */
  sources: VideoReadingSourceReceipt[];
}

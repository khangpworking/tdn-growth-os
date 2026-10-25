/* Generated from video-reading-v3.schema.json. Do not edit by hand. */

/**
 * Automated, unverified S14 seller-video speech reading made by the video-watch lane from one public video of the run's pinned candidate list. The speech is seller voice (review-video creator speech labelled separately), either model transcribed or copied verbatim from the video's own Vietnamese subtitle file, and never verified; it is not customer opinion, not a fact and never admitted as a source by itself. Operator v1/v2 readings are unchanged.
 */
export type VideoReadingV3 = VideoWatchModelAnswer | VideoWatchSubtitleAnswer | AutomatedVideoReading;

/**
 * The exact JSON shape the model must answer with; seconds are relative to the start of the probed media.
 */
export interface VideoWatchModelAnswer {
  aboutProduct: boolean;
  videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO' | 'OTHER';
  /**
   * @minItems 0
   * @maxItems 10000
   */
  segments: VideoWatchAnswerSegment[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  onScreenText: VideoWatchAnswerOnScreenText[];
}
export interface VideoWatchAnswerSegment {
  startSecond: number;
  endSecond: number;
  speech: string;
}
export interface VideoWatchAnswerOnScreenText {
  startSecond: number;
  endSecond: number;
  text: string;
}
/**
 * The exact JSON shape the model must answer with when it reads a video's own subtitle text: only whether the video is about the product and what kind of video it is. The subtitle segments are never taken from the model.
 */
export interface VideoWatchSubtitleAnswer {
  aboutProduct: boolean;
  videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO' | 'OTHER';
}
export interface AutomatedVideoReading {
  contractVersion: 'video-reading-v3';
  registryId: 'S14';
  workspaceId: string;
  runId: string;
  scopeSha256: string;
  /**
   * The run's frozen source set at collection time; null when the run had none yet.
   */
  sourceSetSha256: string | null;
  candidatesSha256: string;
  provenance: 'AUTOMATED_MODEL_UNVERIFIED';
  state: 'PREPARED_NOT_ADMITTED';
  voice: 'SELLER';
  /**
   * MODEL_TRANSCRIBED: the model wrote down the speech from the video. NATIVE_SUBTITLE: the segments are copied verbatim from the video's own Vietnamese subtitle file, the media block describes that file and onScreenText is empty.
   */
  captionSource: 'MODEL_TRANSCRIBED' | 'NATIVE_SUBTITLE';
  video: AutomatedVideoIdentity;
  /**
   * @minItems 0
   * @maxItems 10000
   */
  segments: AutomatedVideoText[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  onScreenText: AutomatedVideoText[];
  media: AutomatedVideoMedia;
  model: AutomatedVideoModel;
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations: string[];
}
export interface AutomatedVideoIdentity {
  videoUrl: string;
  videoId: string;
  origin: 'SELECTION' | 'TOP_SELLING' | 'EXPANDED_SEARCH';
  videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO' | 'OTHER';
  aboutProduct: boolean;
  durationSeconds: number;
}
export interface AutomatedVideoText {
  startSeconds: number;
  endSeconds: number;
  text: string;
}
export interface AutomatedVideoMedia {
  sha256: string;
  byteSize: number;
  durationSeconds: number;
  downloadedAt: string;
}
export interface AutomatedVideoModel {
  modelId: string;
  responseSha256: string;
}

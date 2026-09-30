/* Generated from content-package-create-request.schema.json. Do not edit by hand. */

export type ContentIdeaPromptChoice = ContentIdeaSystemPrompt | ContentIdeaUserPrompt | ContentIdeaFreestylePrompt;
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentCaptionStyle = 'PROFESSIONAL' | 'FRIENDLY';
export type ContentCaptionLength = 'SHORT' | 'MEDIUM' | 'LONG';
export type ContentPosterModel = 'gpt-image-2' | 'gemini-3.1-flash-image';
export type ContentPosterFormat = 'square' | 'portrait' | 'story' | 'landscape';
export type Sha256 = string;
export type ContentPosterReferences = Sha256[];
export type ContentDisplayLevel = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';

export interface ContentPackageCreateRequest {
  contractVersion: '1.0.0';
  campaignId: string;
  requestId: string;
  caption: ContentCaptionSettings;
  poster: ContentPosterSettings;
  /**
   * @minItems 1
   */
  rows: [ContentPackageRow, ...ContentPackageRow[]];
}
export interface ContentCaptionSettings {
  prompt: ContentIdeaPromptChoice;
  model: ContentIdeaModel;
  style: ContentCaptionStyle;
  length: ContentCaptionLength;
}
export interface ContentIdeaSystemPrompt {
  source: 'SYSTEM';
  id: string;
  version: number;
}
export interface ContentIdeaUserPrompt {
  source: 'USER';
  promptId: string;
  version: number;
}
export interface ContentIdeaFreestylePrompt {
  source: 'FREESTYLE';
  creativeText: string;
}
export interface ContentPosterSettings {
  prompt: ContentIdeaPromptChoice;
  model: ContentPosterModel;
  format: ContentPosterFormat;
  referenceMediaSha256s: ContentPosterReferences;
  includeLogo: boolean;
}
export interface ContentPackageRow {
  angleId: string;
  caption?: ContentPackageRowCaption;
  poster?: ContentPackageRowPoster;
  display?: ContentPackageRowDisplay;
}
export interface ContentPackageRowCaption {
  style?: ContentCaptionStyle;
  length?: ContentCaptionLength;
}
export interface ContentPackageRowPoster {
  referenceMediaSha256s?: ContentPosterReferences;
}
export interface ContentPackageRowDisplay {
  caption?: ContentCaptionDisplayOverride;
  poster?: ContentPosterDisplayOverride;
}
export interface ContentCaptionDisplayOverride {
  name?: ContentDisplayLevel;
  tagline?: ContentDisplayLevel;
  hotline?: ContentDisplayLevel;
  web?: ContentDisplayLevel;
  address?: ContentDisplayLevel;
}
export interface ContentPosterDisplayOverride {
  name?: boolean;
  logo?: boolean;
  tagline?: boolean;
  hotline?: boolean;
  web?: boolean;
  address?: boolean;
}

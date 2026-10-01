/* Generated from content-package-artifact.schema.json. Do not edit by hand. */

export type Version = number;
export type Sha256 = string;
export type ContentDisplayLevel = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';
export type ContentIdeaPromptUsed =
  ContentIdeaSystemPromptUsed | ContentIdeaUserPromptUsed | ContentIdeaFreestylePromptUsed;
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentCaptionStyle = 'PROFESSIONAL' | 'FRIENDLY';
export type ContentCaptionLength = 'SHORT' | 'MEDIUM' | 'LONG';
export type ContentPosterModel = 'gpt-image-2' | 'gemini-3.1-flash-image';
export type ContentPosterFormat = 'square' | 'portrait' | 'story' | 'landscape';

export interface ContentPackageArtifact {
  contractVersion: '1.0.0';
  packageId: string;
  campaignId: string;
  campaignVersion: Version;
  angleId: string;
  insightVersion: Version;
  brand: ContentPackageBrandRef;
  items: ContentPackageItemRef[];
  requestId: string;
  requestSha256: Sha256;
  purposes: string[];
  display: ContentPackageDisplay;
  caption: ContentPackageCaptionPin;
  poster: ContentPackagePosterPin;
  footer: string;
  createdAt: string;
}
export interface ContentPackageBrandRef {
  brandId: string;
  version: Version;
}
export interface ContentPackageItemRef {
  itemId: string;
  itemVersion: Version;
  tierKeys?: string[];
}
export interface ContentPackageDisplay {
  caption: ContentCaptionDisplay;
  poster: ContentPosterDisplay;
}
export interface ContentCaptionDisplay {
  name: ContentDisplayLevel;
  tagline: ContentDisplayLevel;
  hotline: ContentDisplayLevel;
  web: ContentDisplayLevel;
  address: ContentDisplayLevel;
}
export interface ContentPosterDisplay {
  name: boolean;
  logo: boolean;
  tagline: boolean;
  hotline: boolean;
  web: boolean;
  address: boolean;
}
export interface ContentPackageCaptionPin {
  prompt: ContentIdeaPromptUsed;
  model: ContentIdeaModel;
  style: ContentCaptionStyle;
  length: ContentCaptionLength;
}
export interface ContentIdeaSystemPromptUsed {
  source: 'SYSTEM';
  id: string;
  version: number;
  name: string;
  creativeTextSha256: string;
}
export interface ContentIdeaUserPromptUsed {
  source: 'USER';
  promptId: string;
  version: number;
  name: string;
  creativeTextSha256: string;
}
export interface ContentIdeaFreestylePromptUsed {
  source: 'FREESTYLE';
  name: string;
  creativeTextSha256: string;
  creativeText: string;
}
export interface ContentPackagePosterPin {
  prompt: ContentIdeaPromptUsed;
  model: ContentPosterModel;
  format: ContentPosterFormat;
  referenceMediaSha256s: Sha256[];
  includeLogo: boolean;
  logoMediaSha256?: Sha256;
}

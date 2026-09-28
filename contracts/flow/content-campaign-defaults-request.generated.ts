/* Generated from content-campaign-defaults-request.schema.json. Do not edit by hand. */

export type ContentIdeaPromptChoice = ContentIdeaSystemPrompt | ContentIdeaUserPrompt | ContentIdeaFreestylePrompt;
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentCaptionStyle = 'PROFESSIONAL' | 'FRIENDLY';
export type ContentCaptionLength = 'SHORT' | 'MEDIUM' | 'LONG';
export type ContentPosterModel = 'gpt-image-2' | 'gemini-3.1-flash-image';
export type ContentPosterFormat = 'square' | 'portrait' | 'story' | 'landscape';
export type ContentPosterReferences = string[];
export interface ContentCampaignDefaultsRequest {
  contractVersion: '1.0.0';
  campaignId: string;
  expectedVersion: number;
  defaults: ContentCampaignPackageDefaults;
}
export interface ContentCampaignPackageDefaults {
  caption: ContentCaptionSettings;
  poster: ContentPosterSettings;
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

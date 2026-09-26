/* Generated from content-api.schema.json. Do not edit by hand. */

export type ContentApiContract =
  | ContentBrandListResponse
  | ContentBrandDetailResponse
  | ContentCatalogListResponse
  | ContentCatalogDetailResponse
  | ContentPromptListResponse
  | ContentPromptDetailResponse
  | ContentSystemPromptDetailResponse
  | ContentApiErrorResponse;
export type Uuid = string;
export type DateTime = string;
export type ContentVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';
export type Sha256 = string;
export type ContentCatalogItemType = 'PHYSICAL' | 'SERVICE';
export type ContentPromptType = 'BIG_IDEA' | 'ANGLE' | 'CAPTION' | 'POSTER';
export type ContentPromptModel =
  'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';

export interface ContentBrandListResponse {
  contractVersion: '1.0.0';
  brands: ContentBrandSummary[];
}
export interface ContentBrandSummary {
  brandId: Uuid;
  brandKey: string;
  version: number;
  brandName: string;
  updatedAt: DateTime;
}
export interface ContentBrandDetailResponse {
  contractVersion: '1.0.0';
  brand: ContentBrandRecord;
  /**
   * @minItems 1
   */
  history: [ContentBrandHistoryItem, ...ContentBrandHistoryItem[]];
}
export interface ContentBrandRecord {
  brandId: Uuid;
  brandKey: string;
  version: number;
  profile: ContentProfile;
  displayRules: ContentDisplayRules;
  logoMediaSha256?: Sha256;
  createdAt: DateTime;
}
export interface ContentProfile {
  brandName: string;
  tagline?: string;
  hotline?: string;
  website?: string;
  fanpage?: string;
  address?: string;
}
export interface ContentDisplayRules {
  sales: ContentElementRules;
  trust: ContentElementRules;
  education: ContentElementRules;
  entertainment: ContentElementRules;
  engagement: ContentElementRules;
}
export interface ContentElementRules {
  name: ContentVisibility;
  logo: ContentVisibility;
  tagline: ContentVisibility;
  hotline: ContentVisibility;
  web: ContentVisibility;
  address: ContentVisibility;
}
export interface ContentBrandHistoryItem {
  version: number;
  brandName: string;
  createdAt: DateTime;
}
export interface ContentCatalogListResponse {
  contractVersion: '1.0.0';
  brandId: Uuid;
  items: ContentCatalogItemSummary[];
}
export interface ContentCatalogItemSummary {
  itemId: Uuid;
  itemKey: string;
  version: number;
  itemType: 'PHYSICAL' | 'SERVICE';
  name: string;
  tierNames: string[];
  photoCount: number;
  updatedAt: DateTime;
}
export interface ContentCatalogDetailResponse {
  contractVersion: '1.0.0';
  item: ContentCatalogItemRecord;
  /**
   * @minItems 1
   */
  history: [ContentCatalogHistoryItem, ...ContentCatalogHistoryItem[]];
}
export interface ContentCatalogItemRecord {
  itemId: Uuid;
  brandId: Uuid;
  itemKey: string;
  version: number;
  item: ContentCatalogItemContent;
  createdAt: DateTime;
}
export interface ContentCatalogItemContent {
  itemType: ContentCatalogItemType;
  name: string;
  description?: string;
  /**
   * @maxItems 8
   */
  tiers:
    | []
    | [ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ];
  /**
   * @maxItems 12
   */
  photos:
    | []
    | [ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ];
}
export interface ContentCatalogTier {
  tierKey: string;
  name: string;
  priceText?: string;
  /**
   * @maxItems 12
   */
  inclusions:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string];
}
export interface ContentCatalogPhoto {
  mediaSha256: string;
  posterDefault: boolean;
}
export interface ContentCatalogHistoryItem {
  version: number;
  name: string;
  createdAt: DateTime;
}
export interface ContentPromptListResponse {
  contractVersion: '1.0.0';
  systemPrompts: ContentSystemPromptSummary[];
  prompts: ContentPromptSummary[];
}
export interface ContentSystemPromptSummary {
  id: string;
  promptType: ContentPromptType;
  version: number;
  name: string;
  description?: string;
  recommendedModel: string;
  tags: string[];
  isDefault: boolean;
}
export interface ContentPromptSummary {
  promptId: Uuid;
  promptKey: string;
  promptType: ContentPromptType;
  version: number;
  name: string;
  recommendedModel: string;
  tags: string[];
  updatedAt: DateTime;
  deleted?: ContentPromptDeletion;
}
export interface ContentPromptDeletion {
  deletedAt: DateTime;
  restorableUntil: DateTime;
}
export interface ContentPromptDetailResponse {
  contractVersion: '1.0.0';
  prompt: ContentPromptRecord;
  /**
   * @minItems 1
   */
  history: [ContentPromptHistoryItem, ...ContentPromptHistoryItem[]];
  lifecycle: ContentPromptLifecycleState;
  systemLayer: ContentPromptSystemLayer;
}
export interface ContentPromptRecord {
  promptId: Uuid;
  promptKey: string;
  promptType: ContentPromptType;
  version: number;
  prompt: ContentPromptContent;
  duplicatedFrom?: ContentPromptLineage;
  createdAt: DateTime;
}
export interface ContentPromptContent {
  name: string;
  description?: string;
  creativeText: string;
  recommendedModel: ContentPromptModel;
  /**
   * @maxItems 8
   */
  tags:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
  demoInput?: string;
  demoOutput?: string;
}
export interface ContentPromptLineage {
  kind: 'SYSTEM' | 'USER';
  id: string;
  version: number;
}
export interface ContentPromptHistoryItem {
  version: number;
  name: string;
  createdAt: DateTime;
}
export interface ContentPromptLifecycleState {
  sequence: number;
  deleted?: ContentPromptDeletion;
}
export interface ContentPromptSystemLayer {
  promptType: ContentPromptType;
  version: number;
  sha256: Sha256;
  text: string;
}
export interface ContentSystemPromptDetailResponse {
  contractVersion: '1.0.0';
  systemPrompt: ContentSystemPromptRecord;
  systemLayer: ContentPromptSystemLayer;
}
export interface ContentSystemPromptRecord {
  id: string;
  promptType: ContentPromptType;
  version: number;
  sha256: Sha256;
  prompt: ContentPromptContent;
  isDefault: boolean;
}
export interface ContentApiErrorResponse {
  error: {
    code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error';
    message: string;
  };
}

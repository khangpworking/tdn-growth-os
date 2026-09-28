/* Generated from content-api.schema.json. Do not edit by hand. */

export type ContentApiContract =
  | ContentBrandListResponse
  | ContentBrandDetailResponse
  | ContentCatalogListResponse
  | ContentCatalogDetailResponse
  | ContentPromptListResponse
  | ContentPromptDetailResponse
  | ContentSystemPromptDetailResponse
  | ContentCampaignListResponse
  | ContentCampaignDetailResponse
  | ContentInsightDetailResponse
  | ContentIdeaListResponse
  | ContentPackageListResponse
  | ContentPackageDetailResponse
  | ContentAiStatusResponse
  | ContentApiErrorResponse;
export type Uuid = string;
export type DateTime = string;
export type ContentVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';
export type Sha256 = string;
export type ContentCatalogItemType = 'PHYSICAL' | 'SERVICE';
export type ContentPromptType = 'BIG_IDEA' | 'ANGLE' | 'CAPTION' | 'POSTER';
export type ContentPromptModel =
  'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';
export type ContentInsightSource = ContentInsightTypedSource | ContentInsightStpSource;
export type ContentIdeaKind = 'BIG_IDEA' | 'ANGLE';
/**
 * @maxItems 6
 */
export type ContentIdeaPurposes =
  | []
  | [ContentIdeaPurpose]
  | [ContentIdeaPurpose, ContentIdeaPurpose]
  | [ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose]
  | [ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose]
  | [ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose]
  | [ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose, ContentIdeaPurpose];
export type ContentIdeaPurpose = string;
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentPurposeKind = 'EDUCATION' | 'ENTERTAINMENT' | 'SALES' | 'TRUST' | 'ENGAGEMENT';
export type ContentPosterFormat = 'square' | 'portrait' | 'story' | 'landscape';
export type ContentIdeaPromptChoice = ContentIdeaSystemPrompt | ContentIdeaUserPrompt | ContentIdeaFreestylePrompt;
export type ContentCaptionStyle = 'PROFESSIONAL' | 'FRIENDLY';
export type ContentCaptionLength = 'SHORT' | 'MEDIUM' | 'LONG';
export type ContentPosterModel = 'gpt-image-2' | 'gemini-3.1-flash-image';
export type ContentPosterReferences = string[];
export type ContentPackageVersionSource = 'GENERATED' | 'MANUAL' | 'RESTORE';
export type ContentPackagePart = 'CAPTION' | 'POSTER';

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
export interface ContentCampaignListResponse {
  contractVersion: '1.0.0';
  campaigns: ContentCampaignSummary[];
}
export interface ContentCampaignSummary {
  campaignId: Uuid;
  campaignKey: string;
  brandId: Uuid;
  version: number;
  name: string;
  items: ContentCampaignItemSummary[];
  updatedAt: DateTime;
  deleted?: ContentCampaignDeletion;
}
export interface ContentCampaignItemSummary {
  itemId: Uuid;
  itemVersion: number;
  name: string;
  tierNames: string[];
}
export interface ContentCampaignDeletion {
  deletedAt: DateTime;
  restorableUntil: DateTime;
}
export interface ContentCampaignDetailResponse {
  contractVersion: '1.0.0';
  campaign: ContentCampaignRecord;
  items: ContentCampaignItemView[];
  /**
   * @minItems 1
   */
  history: [ContentCampaignHistoryItem, ...ContentCampaignHistoryItem[]];
  lifecycle: ContentCampaignLifecycleState;
}
export interface ContentCampaignRecord {
  campaignId: Uuid;
  campaignKey: string;
  brandId: Uuid;
  version: number;
  campaign: ContentCampaignContent;
  createdAt: DateTime;
}
export interface ContentCampaignContent {
  name: string;
  objective: string;
  /**
   * @minItems 1
   * @maxItems 12
   */
  items:
    | [ContentCampaignItemRef]
    | [ContentCampaignItemRef, ContentCampaignItemRef]
    | [ContentCampaignItemRef, ContentCampaignItemRef, ContentCampaignItemRef]
    | [ContentCampaignItemRef, ContentCampaignItemRef, ContentCampaignItemRef, ContentCampaignItemRef]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ];
  researchProductWorkspaceId?: string;
}
export interface ContentCampaignItemRef {
  itemId: string;
  itemVersion: number;
  /**
   * @minItems 1
   * @maxItems 8
   */
  tierKeys?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
}
export interface ContentCampaignItemView {
  itemId: Uuid;
  itemVersion: number;
  itemKey: string;
  itemType: 'PHYSICAL' | 'SERVICE';
  name: string;
  tiers: ContentCampaignTierView[];
}
export interface ContentCampaignTierView {
  tierKey: string;
  name: string;
}
export interface ContentCampaignHistoryItem {
  version: number;
  name: string;
  createdAt: DateTime;
}
export interface ContentCampaignLifecycleState {
  sequence: number;
  deleted?: ContentCampaignDeletion;
}
export interface ContentInsightDetailResponse {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  campaignVersion: number;
  campaignDeleted: boolean;
  latest?: ContentInsightRecord;
  history: ContentInsightHistoryItem[];
  lock?: ContentInsightLockView;
  gate: ContentInsightGate;
  stpSuggestion?: ContentInsightStpSuggestion;
}
export interface ContentInsightRecord {
  version: number;
  insight: ContentInsightContent;
  createdAt: DateTime;
}
export interface ContentInsightContent {
  customer: string;
  painPoint: string;
  insight: string;
  source: ContentInsightSource;
}
export interface ContentInsightTypedSource {
  kind: 'TYPED';
}
export interface ContentInsightStpSource {
  kind: 'STP';
  lockedStpId: string;
}
export interface ContentInsightHistoryItem {
  version: number;
  sourceKind: 'TYPED' | 'STP';
  createdAt: DateTime;
}
export interface ContentInsightLockView {
  insightVersion: number;
  campaignVersion: number;
  lockedAt: DateTime;
  b10?: ContentInsightB10Clearance;
}
export interface ContentInsightB10Clearance {
  productWorkspaceId: string;
  lockedStpId: string;
  effectiveDecisionId: string;
  effectiveDecisionNumber: number;
  effectiveDecision: 'APPROVE';
}
export interface ContentInsightGate {
  required: boolean;
  ready: boolean;
  productWorkspaceId?: Uuid;
  effectiveDecision?: 'APPROVE' | 'HOLD' | 'REJECT';
  reason?: string;
}
export interface ContentInsightStpSuggestion {
  lockedStpId: Uuid;
  customer: string;
  insight: string;
}
export interface ContentIdeaListResponse {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  campaignName: string;
  campaignDeleted: boolean;
  insightLocked: boolean;
  insightVersion?: number;
  ideas: ContentIdeaListEntry[];
  purposeTags: ContentPurposeTagEntry[];
}
export interface ContentIdeaListEntry {
  ideaId: Uuid;
  kind: ContentIdeaKind;
  parentIdeaId?: Uuid;
  code: string;
  concept: string;
  expression?: string;
  name?: string;
  developing: boolean;
  deleted: boolean;
  restorableUntil?: DateTime;
  hiddenByParent?: true;
  stateSequence: number;
  purposes: ContentIdeaPurposes;
  model: ContentIdeaModel;
  promptLabel: string;
  createdAt: DateTime;
}
export interface ContentPurposeTagEntry {
  tagId: Uuid;
  label: string;
  displayLike: ContentPurposeKind;
  createdAt: DateTime;
}
export interface ContentPackageListResponse {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  campaignName: string;
  campaignDeleted: boolean;
  insightLocked: boolean;
  defaults?: ContentPackageDefaultsView;
  packages: ContentPackageListEntry[];
}
export interface ContentPackageDefaultsView {
  version: number;
  defaults: ContentCampaignPackageDefaults;
  createdAt: DateTime;
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
export interface ContentPackageListEntry {
  packageId: Uuid;
  angleId: Uuid;
  code: string;
  deleted: boolean;
  restorableUntil?: DateTime;
  stateSequence: number;
  captionVersion: number;
  posterVersion: number;
  captionPreview?: string;
  posterFormat: ContentPosterFormat;
  createdAt: DateTime;
}
export interface ContentPackageDetailResponse {
  contractVersion: '1.0.0';
  packageId: Uuid;
  campaignId: Uuid;
  campaignName: string;
  campaignDeleted: boolean;
  angleId: Uuid;
  code: string;
  deleted: boolean;
  restorableUntil?: DateTime;
  stateSequence: number;
  settings: ContentPackageSettingsView;
  footer: string;
  captions: ContentCaptionVersionView[];
  posters: ContentPosterVersionView[];
  attempts: ContentPackageAttemptView[];
  createdAt: DateTime;
}
export interface ContentPackageSettingsView {
  brandId: Uuid;
  purposes: string[];
  captionPromptName: string;
  captionModel: 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
  captionStyle: 'PROFESSIONAL' | 'FRIENDLY';
  captionLength: 'SHORT' | 'MEDIUM' | 'LONG';
  posterPromptName: string;
  posterModel: 'gpt-image-2' | 'gemini-3.1-flash-image';
  posterFormat: ContentPosterFormat;
  includeLogo: boolean;
  logoMediaSha256?: Sha256;
  referenceMediaSha256s: Sha256[];
  captionDisplay: ContentCaptionDisplayView;
  posterDisplay: ContentPosterDisplayView;
}
export interface ContentCaptionDisplayView {
  name: ContentVisibility;
  tagline: ContentVisibility;
  hotline: ContentVisibility;
  web: ContentVisibility;
  address: ContentVisibility;
}
export interface ContentPosterDisplayView {
  name: boolean;
  logo: boolean;
  tagline: boolean;
  hotline: boolean;
  web: boolean;
  address: boolean;
}
export interface ContentCaptionVersionView {
  version: number;
  source: ContentPackageVersionSource;
  attemptId?: Uuid;
  restoredFromVersion?: number;
  post: string;
  footer: string;
  text: string;
  factCheck: ContentBrandFactCheckView[];
  createdAt: DateTime;
}
export interface ContentBrandFactCheckView {
  element: 'name' | 'tagline' | 'hotline' | 'website' | 'fanpage' | 'address' | 'price';
  state: 'MATCH' | 'NOT_MENTIONED' | 'HIDDEN' | 'MISMATCH';
  found: string[];
}
export interface ContentPosterVersionView {
  version: number;
  source: ContentPackageVersionSource;
  attemptId?: Uuid;
  restoredFromVersion?: number;
  mediaType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  sizeMatchesFormat: boolean;
  captionVersion: number;
  createdAt: DateTime;
}
export interface ContentPackageAttemptView {
  attemptId: Uuid;
  part: ContentPackagePart;
  state: string;
  errorCode: string | null;
  retryOf: Uuid | null;
  model: string;
  createdAt: DateTime;
  closedAt: DateTime | null;
}
export interface ContentAiStatusResponse {
  contractVersion: '1.0.0';
  configured: boolean;
  checkedAt: DateTime | null;
  error?:
    | 'ai_not_configured'
    | 'model_not_allowed'
    | 'request_too_large'
    | 'timeout'
    | 'network_error'
    | 'gateway_http_error'
    | 'malformed_envelope'
    | 'response_too_large'
    | 'invalid_image'
    | 'schema_mismatch';
  models: ContentAiModelAvailability[];
}
export interface ContentAiModelAvailability {
  id: 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';
  kind: 'text' | 'image';
  available: boolean;
}
export interface ContentApiErrorResponse {
  error: {
    code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error';
    message: string;
  };
}

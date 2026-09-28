/* Generated from owner-content-idea-api.schema.json. Do not edit by hand. */

export type OwnerContentIdeaApiContract =
  | OwnerContentIdeaGenerateRequest
  | OwnerContentIdeaStateRequest
  | OwnerContentPurposeTagRequest
  | OwnerContentIdeaReceipt
  | OwnerContentIdeaStateReceipt
  | OwnerContentPurposeTagReceipt
  | OwnerContentIdeaApiErrorResponse;
export type Uuid = string;
export type ContentIdeaKind = 'BIG_IDEA' | 'ANGLE';
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentIdeaPromptChoice = ContentIdeaSystemPrompt | ContentIdeaUserPrompt | ContentIdeaFreestylePrompt;export type OwnerContentIdeaStateAction = 'DEVELOP' | 'STOP' | 'DELETE' | 'RESTORE' | 'PURPOSES';
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
export type ContentIdeaPurpose = string;export type OwnerContentPurposeKind = 'EDUCATION' | 'ENTERTAINMENT' | 'SALES' | 'TRUST' | 'ENGAGEMENT';
export type OwnerContentIdeaAiFailureReason =
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

export interface OwnerContentIdeaGenerateRequest {
  contractVersion: '1.0.0';
  requestId: Uuid;
  kind: ContentIdeaKind;
  parentIdeaId?: Uuid;
  model: ContentIdeaModel;
  plannedCallCount: number;
  prompt: ContentIdeaPromptChoice;
}export interface ContentIdeaSystemPrompt {
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
}export interface OwnerContentIdeaStateRequest {
  contractVersion: '1.0.0';
  expectedSequence: number;
  action: OwnerContentIdeaStateAction;
  purposes?: ContentIdeaPurposes;
}
export interface OwnerContentPurposeTagRequest {
  contractVersion: '1.0.0';
  label: string;
  displayLike: OwnerContentPurposeKind;
}
export interface OwnerContentIdeaReceipt {
  contractVersion: '1.0.0';
  ideaId: Uuid;
  campaignId: Uuid;
  kind: ContentIdeaKind;
  code: string;
  attemptId: Uuid;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentIdeaStateReceipt {
  contractVersion: '1.0.0';
  ideaId: Uuid;
  sequence: number;
  action: OwnerContentIdeaStateAction;
  createdAt: string;
  restorableUntil?: string;
  exactRetry: boolean;
}
export interface OwnerContentPurposeTagReceipt {
  contractVersion: '1.0.0';
  tagId: Uuid;
  label: string;
  displayLike: OwnerContentPurposeKind;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentIdeaApiErrorResponse {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'method_not_allowed'
      | 'conflict'
      | 'integrity_error'
      | 'ai_unavailable'
      | 'ai_failed';
    message: string;
    reason?: OwnerContentIdeaAiFailureReason;
  };
}

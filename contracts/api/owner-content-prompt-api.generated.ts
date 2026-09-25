/* Generated from owner-content-prompt-api.schema.json. Do not edit by hand. */

export type OwnerContentPromptApiContract =
  | OwnerContentPromptCreateRequest
  | OwnerContentPromptRevisionRequest
  | OwnerContentPromptLifecycleRequest
  | OwnerContentPromptReceipt
  | OwnerContentPromptLifecycleReceipt
  | OwnerContentPromptApiErrorResponse;
export type ContentPromptType = 'BIG_IDEA' | 'ANGLE' | 'CAPTION' | 'POSTER';
export type ContentPromptModel =
  'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';
export type Uuid = string;

export interface OwnerContentPromptCreateRequest {
  contractVersion: '1.0.0';
  promptKey: string;
  promptType: ContentPromptType;
  prompt: ContentPromptContent;
  duplicatedFrom?: ContentPromptLineage;
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
export interface OwnerContentPromptRevisionRequest {
  contractVersion: '1.0.0';
  expectedVersion: number;
  prompt: ContentPromptContent;
}
export interface OwnerContentPromptLifecycleRequest {
  contractVersion: '1.0.0';
  action: 'DELETE' | 'RESTORE';
  expectedSequence: number;
}
export interface OwnerContentPromptReceipt {
  contractVersion: '1.0.0';
  promptId: Uuid;
  promptKey: string;
  promptType: ContentPromptType;
  version: number;
  name: string;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentPromptLifecycleReceipt {
  contractVersion: '1.0.0';
  promptId: Uuid;
  sequence: number;
  action: 'DELETE' | 'RESTORE';
  createdAt: string;
  restorableUntil?: string;
  exactRetry: boolean;
}
export interface OwnerContentPromptApiErrorResponse {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'method_not_allowed'
      | 'conflict'
      | 'integrity_error';
    message: string;
  };
}

/* Generated from content-prompt-create-request.schema.json. Do not edit by hand. */

export type PromptKey = string;
export type ContentPromptType = 'BIG_IDEA' | 'ANGLE' | 'CAPTION' | 'POSTER';
export type ContentPromptModel =
  'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';

export interface ContentPromptCreateRequest {
  contractVersion: '1.0.0';
  promptKey: PromptKey;
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

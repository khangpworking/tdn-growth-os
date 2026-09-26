/* Generated from content-prompt-revision-request.schema.json. Do not edit by hand. */

export type ContentPromptModel =
  'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';

export interface ContentPromptRevisionRequest {
  contractVersion: '1.0.0';
  promptId: string;
  expectedVersion: number;
  prompt: ContentPromptContent;
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

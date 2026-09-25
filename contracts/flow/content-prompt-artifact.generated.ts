/* Generated from content-prompt-artifact.schema.json. Do not edit by hand. */

export type ContentPromptType = 'BIG_IDEA' | 'ANGLE' | 'CAPTION' | 'POSTER';
export type ContentPromptModel =
  'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low' | 'gpt-image-2' | 'gemini-3.1-flash-image';

export interface ContentPromptArtifact {
  contractVersion: '1.0.0';
  promptId: string;
  promptKey: string;
  promptType: ContentPromptType;
  version: number;
  prompt: ContentPromptContent;
  duplicatedFrom?: ContentPromptLineage;
  createdAt: string;
  requestSha256: string;
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

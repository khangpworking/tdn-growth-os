/* Generated from content-idea-generate-request.schema.json. Do not edit by hand. */

export type ContentIdeaKind = 'BIG_IDEA' | 'ANGLE';
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentIdeaPromptChoice = ContentIdeaSystemPrompt | ContentIdeaUserPrompt | ContentIdeaFreestylePrompt;

export interface ContentIdeaGenerateRequest {
  contractVersion: '1.0.0';
  campaignId: string;
  requestId: string;
  kind: ContentIdeaKind;
  parentIdeaId?: string;
  model: ContentIdeaModel;
  plannedCallCount: number;
  prompt: ContentIdeaPromptChoice;
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

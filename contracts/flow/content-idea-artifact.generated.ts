/* Generated from content-idea-artifact.schema.json. Do not edit by hand. */

export type ContentIdeaKind = 'BIG_IDEA' | 'ANGLE';
export type ContentIdeaPromptUsed = ContentIdeaSystemPromptUsed | ContentIdeaUserPromptUsed | ContentIdeaFreestylePromptUsed;
export type ContentIdeaModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type ContentIdeaOutput = ContentBigIdeaOutput | ContentAngleOutput;

export interface ContentIdeaArtifact {
  contractVersion: '1.0.0';
  ideaId: string;
  campaignId: string;
  kind: ContentIdeaKind;
  parentIdeaId?: string;
  insightVersion: number;
  requestId: string;
  requestSha256: string;
  prompt: ContentIdeaPromptUsed;
  model: ContentIdeaModel;
  systemLayer: ContentIdeaSystemLayerRef;
  lockedInput: {
    [k: string]: unknown;
  };
  inputBundleSha256: string;
  attemptId: string;
  outputSha256: string;
  output: ContentIdeaOutput;
  createdAt: string;
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
export interface ContentIdeaSystemLayerRef {
  version: number;
  sha256: string;
}
export interface ContentBigIdeaOutput {
  concept: string;
  expression: string;
}
export interface ContentAngleOutput {
  name: string;
  concept: string;
}

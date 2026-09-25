/* Generated from content-prompt-lifecycle-request.schema.json. Do not edit by hand. */

export type ContentPromptLifecycleAction = 'DELETE' | 'RESTORE';

export interface ContentPromptLifecycleRequest {
  contractVersion: '1.0.0';
  promptId: string;
  action: ContentPromptLifecycleAction;
  expectedSequence: number;
}

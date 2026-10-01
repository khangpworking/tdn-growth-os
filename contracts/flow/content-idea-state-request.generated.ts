/* Generated from content-idea-state-request.schema.json. Do not edit by hand. */

export type ContentIdeaStateAction = 'DEVELOP' | 'STOP' | 'DELETE' | 'RESTORE' | 'PURPOSES';
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
  | [
      ContentIdeaPurpose,
      ContentIdeaPurpose,
      ContentIdeaPurpose,
      ContentIdeaPurpose,
      ContentIdeaPurpose,
      ContentIdeaPurpose,
    ];
export type ContentIdeaPurpose = string;

export interface ContentIdeaStateRequest {
  contractVersion: '1.0.0';
  ideaId: string;
  expectedSequence: number;
  action: ContentIdeaStateAction;
  purposes?: ContentIdeaPurposes;
}

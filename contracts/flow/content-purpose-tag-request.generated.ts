/* Generated from content-purpose-tag-request.schema.json. Do not edit by hand. */

export type ContentPurposeKind = 'EDUCATION' | 'ENTERTAINMENT' | 'SALES' | 'TRUST' | 'ENGAGEMENT';

export interface ContentPurposeTagRequest {
  contractVersion: '1.0.0';
  label: string;
  displayLike: ContentPurposeKind;
}

/* Generated from content-brand-create-request.schema.json. Do not edit by hand. */

export type Text240 = string;
export type ContentBrandVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';

export interface ContentBrandCreateRequest {
  contractVersion: '1.0.0';
  brandKey: string;
  profile: ContentBrandProfile;
  displayRules: ContentBrandDisplayRules;
}
export interface ContentBrandProfile {
  brandName: string;
  tagline?: Text240;
  hotline?: string;
  website?: string;
  fanpage?: string;
  address?: string;
}
export interface ContentBrandDisplayRules {
  sales: ContentBrandElementRules;
  trust: ContentBrandElementRules;
  education: ContentBrandElementRules;
  entertainment: ContentBrandElementRules;
  engagement: ContentBrandElementRules;
}
export interface ContentBrandElementRules {
  name: ContentBrandVisibility;
  logo: ContentBrandVisibility;
  tagline: ContentBrandVisibility;
  hotline: ContentBrandVisibility;
  web: ContentBrandVisibility;
  address: ContentBrandVisibility;
}

/* Generated from content-brand-revision-request.schema.json. Do not edit by hand. */

export type ContentBrandVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';

export interface ContentBrandRevisionRequest {
  contractVersion: '1.0.0';
  brandId: string;
  expectedVersion: number;
  profile: ContentBrandProfile;
  displayRules: ContentBrandDisplayRules;
  logoMediaSha256?: string;
}
export interface ContentBrandProfile {
  brandName: string;
  tagline?: string;
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

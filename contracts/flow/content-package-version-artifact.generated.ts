/* Generated from content-package-version-artifact.schema.json. Do not edit by hand. */

export type ContentPackagePart = 'CAPTION' | 'POSTER';
export type ContentPackageVersionSource = 'GENERATED' | 'MANUAL' | 'RESTORE';
export type Sha256 = string;
export type ContentBrandFactElement = 'name' | 'tagline' | 'hotline' | 'website' | 'fanpage' | 'address' | 'price';
export type ContentBrandFactState = 'MATCH' | 'NOT_MENTIONED' | 'HIDDEN' | 'MISMATCH';

export interface ContentPackageVersionArtifact {
  contractVersion: '1.0.0';
  packageId: string;
  part: ContentPackagePart;
  version: number;
  source: ContentPackageVersionSource;
  requestId: string;
  requestSha256: Sha256;
  attemptId?: string;
  providerModel?: string;
  inputBundleSha256?: Sha256;
  outputSha256?: Sha256;
  restoredFromVersion?: number;
  caption?: ContentCaptionVersionBody;
  poster?: ContentPosterVersionBody;
  createdAt: string;
}
export interface ContentCaptionVersionBody {
  lockedInput?: {
    [k: string]: unknown;
  };
  post: string;
  footer: string;
  text: string;
  factCheck: ContentBrandFactCheckRow[];
}
export interface ContentBrandFactCheckRow {
  element: ContentBrandFactElement;
  state: ContentBrandFactState;
  found: string[];
}
export interface ContentPosterVersionBody {
  promptSha256?: Sha256;
  imageSha256: Sha256;
  mediaType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  sizeMatchesFormat: boolean;
  captionVersion: number;
  referenceMediaSha256s: Sha256[];
}

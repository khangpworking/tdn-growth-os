/* Generated from content-package-version-request.schema.json. Do not edit by hand. */

export type ContentPackagePart = 'CAPTION' | 'POSTER';
export type ContentPackageVersionAction = 'MANUAL' | 'RESTORE';

export interface ContentPackageVersionRequest {
  contractVersion: '1.0.0';
  packageId: string;
  requestId: string;
  part: ContentPackagePart;
  expectedVersion: number;
  action: ContentPackageVersionAction;
  post?: string;
  restoreVersion?: number;
}

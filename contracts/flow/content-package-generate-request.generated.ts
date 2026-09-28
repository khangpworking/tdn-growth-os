/* Generated from content-package-generate-request.schema.json. Do not edit by hand. */

export type ContentPackagePart = 'CAPTION' | 'POSTER';

export interface ContentPackageGenerateRequest {
  contractVersion: '1.0.0';
  packageId: string;
  requestId: string;
  part: ContentPackagePart;
  plannedCallCount: number;
  retryOfAttemptId?: string;
}

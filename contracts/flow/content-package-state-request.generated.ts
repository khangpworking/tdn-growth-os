/* Generated from content-package-state-request.schema.json. Do not edit by hand. */

export type ContentPackageStateAction = 'DELETE' | 'RESTORE';

export interface ContentPackageStateRequest {
  contractVersion: '1.0.0';
  packageId: string;
  expectedSequence: number;
  action: ContentPackageStateAction;
}

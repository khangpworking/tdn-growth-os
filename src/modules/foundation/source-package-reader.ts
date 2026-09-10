import type { SourcePackageService, VerifiedFinalizedSourcePackage } from './source-package-service.js';
export interface FinalizedSourcePackageReader { readFinalizedSourcePackage(packageId: string): Promise<VerifiedFinalizedSourcePackage>; }
export class FoundationSourcePackageReader implements FinalizedSourcePackageReader {
  constructor(private readonly service: SourcePackageService) {}
  readFinalizedSourcePackage(packageId: string): Promise<VerifiedFinalizedSourcePackage> { return this.service.readVerified(packageId); }
}

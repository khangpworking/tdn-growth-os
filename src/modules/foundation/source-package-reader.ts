import type { SourcePackageReadBudget, SourcePackageService, VerifiedFinalizedSourcePackage } from './source-package-service.js';
export interface FinalizedSourcePackageReader { readFinalizedSourcePackage(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage>; }
export class FoundationSourcePackageReader implements FinalizedSourcePackageReader {
  constructor(private readonly service: SourcePackageService) {}
  readFinalizedSourcePackage(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage> { return this.service.readVerified(packageId, budget); }
}

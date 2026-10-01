import type { FinalizedSourcePackageSummary, SourcePackageReadBudget, SourcePackageService, VerifiedFinalizedSourcePackage } from './source-package-service.js';
export interface FinalizedSourcePackageReader { readFinalizedSourcePackage(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage>; }
export class FoundationSourcePackageReader implements FinalizedSourcePackageReader {
  constructor(private readonly service: SourcePackageService) {}
  listFinalizedSourcePackages(budget?: SourcePackageReadBudget): Promise<readonly FinalizedSourcePackageSummary[]> { return this.service.listFinalizedSourcePackages(budget); }
  readFinalizedSourcePackage(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage> { return this.service.readVerified(packageId, budget); }
}

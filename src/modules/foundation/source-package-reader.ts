import type { FinalizedSourcePackageEntry, FinalizedSourcePackageSummary, SourceAttachmentOrigin, SourcePackageReadBudget, SourcePackageService, VerifiedFinalizedSourcePackage } from './source-package-service.js';
export interface FinalizedSourcePackageReader { readFinalizedSourcePackage(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage>; }
/** Metadata-only exact selection; callers verify each chosen entry through readFinalizedSourcePackage. */
export interface FinalizedSourcePackageLookup {
  findFinalizedSourcePackagesByKey(packageKey: string): Promise<readonly FinalizedSourcePackageEntry[]>;
  findFinalizedSourcePackagesByMembership(version: number, paths: readonly string[]): Promise<readonly FinalizedSourcePackageEntry[]>;
}
/** Metadata-only selection for authored attachment keys; callers must verify each chosen ID. */
export interface AutomationSourcePackageLookup {
  findAutomationAttachmentPackagesByKeyPrefix(prefix: string): Promise<readonly FinalizedSourcePackageEntry[]>;
}
export interface SourceAttachmentOriginReader {
  readAutomationAttachmentOrigin(packageId: string, budget?: SourcePackageReadBudget): Promise<SourceAttachmentOrigin | undefined>;
}
export class FoundationSourcePackageReader implements FinalizedSourcePackageReader, FinalizedSourcePackageLookup, AutomationSourcePackageLookup, SourceAttachmentOriginReader {
  constructor(private readonly service: SourcePackageService) {}
  listFinalizedSourcePackages(budget?: SourcePackageReadBudget): Promise<readonly FinalizedSourcePackageSummary[]> { return this.service.listFinalizedSourcePackages(budget); }
  async findFinalizedSourcePackagesByKey(packageKey: string): Promise<readonly FinalizedSourcePackageEntry[]> { return this.service.findFinalizedSourcePackagesByKey(packageKey); }
  async findFinalizedSourcePackagesByMembership(version: number, paths: readonly string[]): Promise<readonly FinalizedSourcePackageEntry[]> { return this.service.findFinalizedSourcePackagesByMembership(version, paths); }
  async findAutomationAttachmentPackagesByKeyPrefix(prefix: string): Promise<readonly FinalizedSourcePackageEntry[]> { return this.service.findAutomationAttachmentPackagesByKeyPrefix(prefix); }
  readFinalizedSourcePackage(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage> { return this.service.readVerified(packageId, budget); }
  readAutomationAttachmentOrigin(packageId: string, budget?: SourcePackageReadBudget): Promise<SourceAttachmentOrigin | undefined> { return this.service.readAutomationAttachmentOrigin(packageId, budget); }
}

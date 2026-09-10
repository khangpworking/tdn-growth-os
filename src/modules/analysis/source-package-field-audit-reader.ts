import type { SourcePackageFieldAuditService, VerifiedSourcePackageFieldAudit } from './source-package-field-audit-service.js';
export interface SourcePackageFieldAuditReader { readSourcePackageFieldAuditByDigest(digest:string):Promise<VerifiedSourcePackageFieldAudit>; }
export class AnalysisSourcePackageFieldAuditReader implements SourcePackageFieldAuditReader { constructor(private readonly service:SourcePackageFieldAuditService){} readSourcePackageFieldAuditByDigest(digest:string){return this.service.readByDigest(digest);} }

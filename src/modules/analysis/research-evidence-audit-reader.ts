import type { ResearchEvidenceAudit } from '../../../contracts/analysis/research-evidence-audit.generated.js';
import type { ResearchEvidenceAuditService } from './research-evidence-audit-service.js';

export interface VerifiedResearchEvidenceAudit {
  readonly auditId: string;
  readonly outputArtifactSha256: string;
  readonly audit: ResearchEvidenceAudit;
}

export interface ResearchEvidenceAuditReader {
  readVerifiedResearchEvidenceAudit(auditId: string): Promise<VerifiedResearchEvidenceAudit>;
}

export class AnalysisResearchEvidenceAuditReader implements ResearchEvidenceAuditReader {
  readonly #audits: ResearchEvidenceAuditService;

  constructor(audits: ResearchEvidenceAuditService) {
    this.#audits = audits;
  }

  async readVerifiedResearchEvidenceAudit(auditId: string): Promise<VerifiedResearchEvidenceAudit> {
    return {
      auditId,
      outputArtifactSha256: this.#audits.getOutputArtifactSha256(auditId),
      audit: await this.#audits.replay(auditId),
    };
  }
}

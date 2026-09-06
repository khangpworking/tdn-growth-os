import type { GovernedSkillExecutionRequest } from '../../../../contracts/analysis/governed-skill-execution-request.generated.js';
import type { MarketSnapshotInterpretationService } from '../interpretation-service.js';
import type { ResearchEvidenceAuditService } from '../research-evidence-audit-service.js';
import { AnalysisValidationError, validateGovernedSkillExecutionRequest } from '../validation.js';

export const MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID = 'analysis:market-snapshot-interpretation' as const;
export const MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION = 1 as const;
export const RESEARCH_EVIDENCE_AUDIT_SKILL_ID = 'analysis:research-evidence-audit' as const;
export const RESEARCH_EVIDENCE_AUDIT_SKILL_VERSION = 1 as const;

type SkillId = typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID | typeof RESEARCH_EVIDENCE_AUDIT_SKILL_ID;
type Adapter = 'MarketSnapshotInterpretationService' | 'ResearchEvidenceAuditService';
type InputKind = 'verified market_snapshot_v1 Result' | 'verified research_evidence_index_v1 Result';
type OutputKind = 'immutable market snapshot interpretation reference' | 'immutable research evidence audit reference';

export interface GovernedAnalysisSkillDescriptor {
  readonly skillId: SkillId;
  readonly skillVersion: 1;
  readonly owner: 'Box 2';
  readonly enabled: true;
  readonly adapter: Adapter;
  readonly inputKind: InputKind;
  readonly outputKind: OutputKind;
  readonly authority: {
    readonly readVerifiedResult: true;
    readonly tools: false;
    readonly shell: false;
    readonly arbitraryFilesystem: false;
    readonly network: 'injected AiGateway only';
    readonly approval: false;
    readonly businessMutation: false;
  };
}

interface ReceiptBase {
  readonly contractVersion: '1.0.0';
  readonly skillVersion: 1;
  readonly outputArtifactSha256: string;
  readonly deduplicated: boolean;
}
export interface MarketSnapshotSkillReceipt extends ReceiptBase {
  readonly skillId: typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID;
  readonly interpretationId: string;
}
export interface ResearchEvidenceAuditSkillReceipt extends ReceiptBase {
  readonly skillId: typeof RESEARCH_EVIDENCE_AUDIT_SKILL_ID;
  readonly auditId: string;
}
export type GovernedAnalysisSkillReceipt = MarketSnapshotSkillReceipt | ResearchEvidenceAuditSkillReceipt;

const noAuthority = Object.freeze({
  readVerifiedResult: true,
  tools: false,
  shell: false,
  arbitraryFilesystem: false,
  network: 'injected AiGateway only',
  approval: false,
  businessMutation: false,
} as const);

export const governedAnalysisSkillRegistry = Object.freeze([
  Object.freeze({
    skillId: MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID,
    skillVersion: MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION,
    owner: 'Box 2',
    enabled: true,
    adapter: 'MarketSnapshotInterpretationService',
    inputKind: 'verified market_snapshot_v1 Result',
    outputKind: 'immutable market snapshot interpretation reference',
    authority: noAuthority,
  } satisfies GovernedAnalysisSkillDescriptor),
  Object.freeze({
    skillId: RESEARCH_EVIDENCE_AUDIT_SKILL_ID,
    skillVersion: RESEARCH_EVIDENCE_AUDIT_SKILL_VERSION,
    owner: 'Box 2',
    enabled: true,
    adapter: 'ResearchEvidenceAuditService',
    inputKind: 'verified research_evidence_index_v1 Result',
    outputKind: 'immutable research evidence audit reference',
    authority: noAuthority,
  } satisfies GovernedAnalysisSkillDescriptor),
] as const);

export class GovernedAnalysisSkillExecutor {
  readonly #interpretation: MarketSnapshotInterpretationService;
  readonly #audit: ResearchEvidenceAuditService | undefined;

  constructor(interpretation: MarketSnapshotInterpretationService, audit?: ResearchEvidenceAuditService) {
    this.#interpretation = interpretation;
    this.#audit = audit;
  }

  async execute(untrustedInput: { readonly skillId: typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID }): Promise<MarketSnapshotSkillReceipt>;
  async execute(untrustedInput: { readonly skillId: typeof RESEARCH_EVIDENCE_AUDIT_SKILL_ID }): Promise<ResearchEvidenceAuditSkillReceipt>;
  async execute(untrustedInput: unknown): Promise<GovernedAnalysisSkillReceipt>;
  async execute(untrustedInput: unknown): Promise<GovernedAnalysisSkillReceipt> {
    const request = validateGovernedSkillExecutionRequest(untrustedInput);
    const descriptor = resolveSkill(request);
    if (descriptor.skillId === MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID) {
      const execution = await this.#interpretation.interpret({ contractVersion: request.contractVersion, resultId: request.input.resultId });
      return {
        contractVersion: '1.0.0', skillId: descriptor.skillId, skillVersion: descriptor.skillVersion,
        interpretationId: execution.interpretationId, outputArtifactSha256: execution.outputArtifactSha256,
        deduplicated: execution.deduplicated,
      };
    }
    if (!this.#audit) throw new AnalysisValidationError('Research evidence audit skill adapter is not configured');
    const execution = await this.#audit.audit({ contractVersion: request.contractVersion, resultId: request.input.resultId });
    return {
      contractVersion: '1.0.0', skillId: descriptor.skillId, skillVersion: descriptor.skillVersion,
      auditId: execution.auditId, outputArtifactSha256: execution.outputArtifactSha256,
      deduplicated: execution.deduplicated,
    };
  }
}

function resolveSkill(request: GovernedSkillExecutionRequest): GovernedAnalysisSkillDescriptor {
  const descriptor = governedAnalysisSkillRegistry.find(
    (entry) => entry.skillId === request.skillId && entry.skillVersion === request.skillVersion,
  );
  if (!descriptor) throw new AnalysisValidationError(`Unknown or disabled analysis skill: ${request.skillId}@${request.skillVersion}`);
  return descriptor;
}

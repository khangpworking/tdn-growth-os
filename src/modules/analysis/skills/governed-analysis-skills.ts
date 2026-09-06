import type { GovernedSkillExecutionRequest } from '../../../../contracts/analysis/governed-skill-execution-request.generated.js';
import type { MarketSnapshotInterpretationService } from '../interpretation-service.js';
import { AnalysisValidationError, validateGovernedSkillExecutionRequest } from '../validation.js';

export const MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID = 'analysis:market-snapshot-interpretation' as const;
export const MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION = 1 as const;

export interface GovernedAnalysisSkillDescriptor {
  readonly skillId: typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID;
  readonly skillVersion: typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION;
  readonly owner: 'Box 2';
  readonly enabled: true;
  readonly adapter: 'MarketSnapshotInterpretationService';
  readonly inputKind: 'verified market_snapshot_v1 Result';
  readonly outputKind: 'immutable market snapshot interpretation reference';
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

export interface GovernedAnalysisSkillReceipt {
  readonly contractVersion: '1.0.0';
  readonly skillId: typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID;
  readonly skillVersion: typeof MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION;
  readonly interpretationId: string;
  readonly outputArtifactSha256: string;
  readonly deduplicated: boolean;
}

export const governedAnalysisSkillRegistry = Object.freeze([
  Object.freeze({
    skillId: MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID,
    skillVersion: MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION,
    owner: 'Box 2',
    enabled: true,
    adapter: 'MarketSnapshotInterpretationService',
    inputKind: 'verified market_snapshot_v1 Result',
    outputKind: 'immutable market snapshot interpretation reference',
    authority: Object.freeze({
      readVerifiedResult: true,
      tools: false,
      shell: false,
      arbitraryFilesystem: false,
      network: 'injected AiGateway only',
      approval: false,
      businessMutation: false,
    }),
  } satisfies GovernedAnalysisSkillDescriptor),
] as const);

export class GovernedAnalysisSkillExecutor {
  readonly #interpretation: MarketSnapshotInterpretationService;

  constructor(interpretation: MarketSnapshotInterpretationService) {
    this.#interpretation = interpretation;
  }

  async execute(untrustedInput: unknown): Promise<GovernedAnalysisSkillReceipt> {
    const request = validateGovernedSkillExecutionRequest(untrustedInput);
    const descriptor = resolveSkill(request);
    const execution = await this.#interpretation.interpret({
      contractVersion: request.contractVersion,
      resultId: request.input.resultId,
    });
    return {
      contractVersion: '1.0.0',
      skillId: descriptor.skillId,
      skillVersion: descriptor.skillVersion,
      interpretationId: execution.interpretationId,
      outputArtifactSha256: execution.outputArtifactSha256,
      deduplicated: execution.deduplicated,
    };
  }
}

function resolveSkill(request: GovernedSkillExecutionRequest): GovernedAnalysisSkillDescriptor {
  const descriptor = governedAnalysisSkillRegistry.find(
    (entry) => entry.skillId === request.skillId && entry.skillVersion === request.skillVersion,
  );
  if (!descriptor) {
    throw new AnalysisValidationError(`Unknown or disabled analysis skill: ${request.skillId}@${request.skillVersion}`);
  }
  return descriptor;
}

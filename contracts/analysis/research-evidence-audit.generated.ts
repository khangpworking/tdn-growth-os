/* Generated from research-evidence-audit.schema.json. Do not edit by hand. */

/**
 * @minItems 1
 * @maxItems 12
 */
export type Citations =
  | [string]
  | [string, string]
  | [string, string, string]
  | [string, string, string, string]
  | [string, string, string, string, string]
  | [string, string, string, string, string, string]
  | [string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string, string, string, string];
/**
 * @maxItems 12
 */
export type OptionalCitations =
  | []
  | [string]
  | [string, string]
  | [string, string, string]
  | [string, string, string, string]
  | [string, string, string, string, string]
  | [string, string, string, string, string, string]
  | [string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string, string, string]
  | [string, string, string, string, string, string, string, string, string, string, string, string];

export interface ResearchEvidenceAudit {
  contractVersion: '1.0.0';
  auditId: string;
  completedAt: string;
  sourceResult: {
    resultId: string;
    resultArtifactSha256: string;
  };
  gateway: {
    providerId: string;
    modelId: string;
    providerRequestId?: string;
    inputTokenCount?: number;
    outputTokenCount?: number;
    latencyMs?: number;
  };
  prompt: {
    promptId: string;
    promptVersion: number;
    promptSha256: string;
  };
  outputSchemaVersion: '1.0.0';
  output: ResearchEvidenceAuditOutput;
}
export interface ResearchEvidenceAuditOutput {
  summary: string;
  /**
   * @minItems 1
   * @maxItems 24
   */
  claims: [
    {
      code: string;
      claimText: string;
      claimType: 'factual' | 'attribution' | 'inference' | 'opinion' | 'framing';
      assessment: 'supported' | 'contradicted' | 'mixed' | 'insufficient_evidence';
      reasoning: string;
      claimCitations: Citations;
      supportingCitations: OptionalCitations;
      contradictingCitations: OptionalCitations;
      uncertainty: string;
    },
    ...{
      code: string;
      claimText: string;
      claimType: 'factual' | 'attribution' | 'inference' | 'opinion' | 'framing';
      assessment: 'supported' | 'contradicted' | 'mixed' | 'insufficient_evidence';
      reasoning: string;
      claimCitations: Citations;
      supportingCitations: OptionalCitations;
      contradictingCitations: OptionalCitations;
      uncertainty: string;
    }[],
  ];
  /**
   * @maxItems 12
   */
  unansweredQuestions:
    | []
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ]
    | [
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
        {
          question: string;
          whyMaterial: string;
          triggerCitations?: OptionalCitations;
        },
      ];
  overallAssessment:
    | 'supported_within_pack'
    | 'supported_but_incomplete'
    | 'insufficient_evidence'
    | 'potentially_misleading_within_pack';
  /**
   * @minItems 1
   * @maxItems 12
   */
  limitations:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string];
}

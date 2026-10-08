/* Generated from research-automation-insight-model-api.schema.json. Do not edit by hand. */

/**
 * Explicit OWNER model proposal, never annotation acceptance or report regeneration. Unknown dispatch must not be retried under a new identity automatically.
 */
export type ResearchAutomationInsightModelApi =
  InsightModelRequest | ResearchInsightModelResponse | InsightDefaultModelRequest;
export type ResearchInsightModelResponse =
  | {
      contractVersion: Version;
      status: 'PROPOSED';
      executionId: Uuid;
      proposal: ResearchInsightCodingMutation;
    }
  | {
      contractVersion: Version;
      status: 'NOT_DISPATCHED';
      reason: 'AI_NOT_CONFIGURED' | 'INSUFFICIENT_EVIDENCE';
    }
  | {
      contractVersion: Version;
      status: 'PREPARED';
      executionId: Uuid;
    }
  | {
      contractVersion: Version;
      status: 'INVALID';
      executionId: Uuid;
      code: 'RESPONSE_NOT_TEXT' | 'RESPONSE_TOO_LARGE' | 'RESPONSE_NOT_JSON' | 'INVALID_INSIGHT_CODING_RESPONSE';
    }
  | {
      contractVersion: Version;
      status: 'DISPATCH_UNKNOWN';
      executionId: Uuid;
      code: 'INTERRUPTED_AFTER_CLAIM' | 'TRANSPORT_OUTCOME_AMBIGUOUS' | 'RESPONSE_NOT_RETAINED';
    };
export type Version = 'insight-model-response-v1';
export type Uuid = string;
export type InsightDefaultModelRequest = {
  contractVersion: 'insight-default-model-request-v1';
  requestKey: Uuid;
  binding: InsightSourceBinding;
  defaultRuleId: Uuid | null;
  defaultRuleSha256: string | null;
  previousProposalId: Uuid | null;
  previousProposalSha256: string | null;
  /**
   * @minItems 1
   * @maxItems 100
   */
  recordIndexes: [number, ...number[]];
} & {
  [k: string]: unknown;
};

export interface InsightModelRequest {
  contractVersion: 'insight-model-request-v1';
  requestKey: string;
  adoptionId: string;
  previousProposalId: string | null;
  /**
   * @minItems 1
   * @maxItems 100
   */
  recordIndexes: [number, ...number[]];
}
export interface ResearchInsightCodingMutation {
  contractVersion: 'insight-coding-mutation-v1';
  kind: 'ADOPTION' | 'PROPOSAL' | 'RECEIPT';
  evidenceId: Uuid;
  exactRetry: boolean;
}
export interface InsightSourceBinding {
  workspaceId: Uuid;
  runId: Uuid;
  pairId: string;
  scopeSha256: string;
  reportSha256: string;
  sourceKind: 'NATIVE' | 'EXACT_SHOPEE';
  sourcePackageSha256: string;
  inputSha256: string;
}

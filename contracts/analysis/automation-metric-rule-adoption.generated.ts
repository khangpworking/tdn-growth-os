/* Generated from automation-metric-rule-adoption.schema.json. Do not edit by hand. */

export type AutomationMetricRuleAdoptionContract =
  | AutomationMetricRuleAdoptionRequest
  | AutomationMetricRuleAdoptionArtifact
  | AutomationMetricRuleAdoptionReceipt
  | AutomationMetricRuleAdoptionList;
export type Uuid = string;
export type Text = string;
export type Digest = string;

export interface AutomationMetricRuleAdoptionRequest {
  contractVersion: 'automation-metric-rule-adopt-v1';
  requestKey: Uuid;
  expectedRevision: number;
  rulebook: AutomationMetricRulebook;
}
export interface AutomationMetricRulebook {
  ruleId: string;
  revision: number;
  title: string;
  definitions: {
    CORE_CANDIDATE: Text;
    ADJACENT: Text;
    OUTSIDE: Text;
    UNKNOWN: Text;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  groups: [
    {
      key: string;
      label: string;
      definition: Text;
    },
    ...{
      key: string;
      label: string;
      definition: Text;
    }[],
  ];
  wideUnknownPolicy: 'exclude';
}
export interface AutomationMetricRuleAdoptionArtifact {
  contractVersion: 'automation-metric-rule-adoption-v1';
  adoptionId: Uuid;
  workspaceId: Uuid;
  runId: Uuid;
  startSha256: Digest;
  scopeSha256: Digest;
  request: AutomationMetricRuleAdoptionRequest;
  rulebookSha256: Digest;
  actorId: string;
  actorRole: 'OWNER';
  adoptedAt: string;
}
export interface AutomationMetricRuleAdoptionReceipt {
  contractVersion: 'automation-metric-rule-receipt-v1';
  adoptionId: Uuid;
  workspaceId: Uuid;
  runId: Uuid;
  adoptedAt: string;
  rulebook: AutomationMetricRulebook;
  exactRetry: boolean;
}
export interface AutomationMetricRuleAdoptionList {
  contractVersion: 'automation-metric-rule-list-v1';
  workspaceId: Uuid;
  runId: Uuid;
  adoptions: AutomationMetricRuleAdoptionReceipt[];
}

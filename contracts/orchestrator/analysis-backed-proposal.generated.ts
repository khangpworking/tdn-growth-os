/* Generated from analysis-backed-proposal.schema.json. Do not edit by hand. */

export interface AnalysisBackedProposal {
  contractVersion: '1.0.0';
  proposalId: string;
  proposalKey: string;
  proposalVersion: number;
  proposalType: 'research_evidence_review_v1';
  state: 'PROPOSED';
  createdAt: string;
  sourceAudit: {
    auditId: string;
    outputArtifactSha256: string;
  };
  producer: {
    producerId: string;
    producerVersion: number;
  };
  objective: Objective;
  proposal: Proposal;
  requestedNextStep: 'request_human_review';
}
export interface Objective {
  code: string;
  statement: string;
}
export interface Proposal {
  title: string;
  summary: string;
  rationale: string;
  /**
   * @minItems 1
   * @maxItems 24
   */
  evidenceLinks: [
    {
      claimCode: string;
      use: 'support' | 'risk' | 'uncertainty';
      note: string;
    },
    ...{
      claimCode: string;
      use: 'support' | 'risk' | 'uncertainty';
      note: string;
    }[],
  ];
  /**
   * @maxItems 12
   */
  openQuestions:
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
}

/* Generated from analysis-backed-proposal-submission.schema.json. Do not edit by hand. */

export interface AnalysisBackedProposalSubmission {
  contractVersion: '1.0.0';
  proposalKey: string;
  proposalVersion: number;
  proposalType: 'research_evidence_review_v1';
  sourceAuditId: string;
  objective: {
    code: string;
    statement: string;
  };
  proposal: {
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
  };
  requestedNextStep: 'request_human_review';
}

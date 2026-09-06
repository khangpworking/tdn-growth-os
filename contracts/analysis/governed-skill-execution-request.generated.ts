/* Generated from governed-skill-execution-request.schema.json. Do not edit by hand. */

export type GovernedSkillExecutionRequest =
  | {
      contractVersion: '1.0.0';
      skillId: 'analysis:market-snapshot-interpretation';
      skillVersion: 1;
      input: ResultInput;
    }
  | {
      contractVersion: '1.0.0';
      skillId: 'analysis:research-evidence-audit';
      skillVersion: 1;
      input: ResultInput;
    };

export interface ResultInput {
  resultId: string;
}

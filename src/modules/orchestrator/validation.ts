import { createRequire } from 'node:module';
import proposalSchema from '../../../contracts/orchestrator/analysis-backed-proposal.schema.json' with { type: 'json' };
import type { AnalysisBackedProposal } from '../../../contracts/orchestrator/analysis-backed-proposal.generated.js';
import submissionSchema from '../../../contracts/orchestrator/analysis-backed-proposal-submission.schema.json' with { type: 'json' };
import type { AnalysisBackedProposalSubmission } from '../../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(submissionSchema);
const validateSubmission = ajv.getSchema<AnalysisBackedProposalSubmission>(submissionSchema.$id)!;
const validateProposal = ajv.compile<AnalysisBackedProposal>(proposalSchema);

export class OrchestratorValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid orchestrator input: ${details}`);
    this.details = details;
  }
}

export function validateAnalysisBackedProposalSubmission(value: unknown): AnalysisBackedProposalSubmission {
  if (!validateSubmission(value)) {
    throw new OrchestratorValidationError(ajv.errorsText(validateSubmission.errors, { separator: '; ' }));
  }
  return value as AnalysisBackedProposalSubmission;
}

export function validateAnalysisBackedProposal(value: unknown): AnalysisBackedProposal {
  if (!validateProposal(value)) {
    throw new OrchestratorValidationError(ajv.errorsText(validateProposal.errors, { separator: '; ' }));
  }
  return value as AnalysisBackedProposal;
}

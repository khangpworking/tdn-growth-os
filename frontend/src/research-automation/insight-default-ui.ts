import type { InsightDefaultModelRequest } from '../../../contracts/analysis/automation-insight-model.generated';
import type { InsightDefaultCodingProposeRequest } from '../../../contracts/analysis/automation-insight-coding.generated';
import type { View } from './insight-coding-ui';
import { canonical } from './insight-coding-ui';
export function defaultProposals(view: View) {
  return view.evidence.flatMap(evidence => evidence.kind === 'PROPOSAL' && evidence.request.contractVersion === 'insight-coding-default-propose-v1'
    ? [{ evidence, request: evidence.request as InsightDefaultCodingProposeRequest }] : []);
}
export function verifiedDefaultProposal(view: View, body: InsightDefaultModelRequest, proposalId: string) {
  if (canonical(view.context.binding) !== canonical(body.binding)) return null;
  const found = defaultProposals(view).find(item => item.evidence.evidenceId === proposalId);
  if (!found || found.request.requestKey !== body.requestKey || found.request.previousProposalId !== body.previousProposalId ||
    found.request.previousProposalSha256 !== body.previousProposalSha256 || canonical(found.request.recordIndexes) !== canonical(body.recordIndexes) ||
    (body.defaultRuleId !== null && (found.request.defaultRuleId !== body.defaultRuleId || found.request.defaultRuleSha256 !== body.defaultRuleSha256))) return null;
  const root = view.evidence.find(item => item.evidenceId === found.request.defaultRuleId && item.kind === 'DEFAULT_RULE' &&
    item.request.contractVersion === 'insight-coding-default-rule-v1' && item.sha256 === found.request.defaultRuleSha256);
  if (!root || (body.defaultRuleId === null && root.request.contractVersion === 'insight-coding-default-rule-v1' && root.request.originatingRequestKey !== body.requestKey)) return null;
  return found;
}

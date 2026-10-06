import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-classified-metric.schema.json' with { type: 'json' };
import requestSchema from '../../../../contracts/analysis/automation-classified-report-revision.schema.json' with { type: 'json' };
import membershipSchema from '../../../../contracts/analysis/automation-metric-membership.schema.json' with { type: 'json' };
import inputSchema from '../../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import outputSchema from '../../../../contracts/analysis/metric-scope-output.schema.json' with { type: 'json' };
import type { AutomationClassifiedMetricSnapshot } from '../../../../contracts/analysis/automation-classified-metric.generated.js';
import type { MetricAcceptanceSelection } from '../../../../contracts/analysis/automation-classified-report-revision.generated.js';
import type { MetricScopeInput } from '../../../../contracts/analysis/metric-scope-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { calculateMetricScopes, metricLabelFingerprint, validateMetricScopeInput } from '../metric-scope-calculator.js';
import { AutomationMetricMembership } from './metric-membership.js';
import { ResearchAutomationIntegrityError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
for (const dependency of [requestSchema, membershipSchema, inputSchema, outputSchema]) ajv.addSchema(dependency);
const valid = ajv.compile<AutomationClassifiedMetricSnapshot>(schema);
const bytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const digest = (value: unknown): string => createHash('sha256').update(bytes(value)).digest('hex');
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

/** Receipt projection and existing integer arithmetic; no classifier, provider or legacy-sidecar promotion. */
export class AutomationClassifiedMetric {
  constructor(private readonly memberships: AutomationMetricMembership) {}

  async project(workspaceId: string, runId: string, pairId: string, selection: MetricAcceptanceSelection, current = false) {
    const resolved = await this.memberships.resolveSelection(workspaceId, runId, pairId, selection, current);
    const { context, records, assignments, receipts } = resolved;
    const proof = { contractVersion: 'metric-accepted-calculation-proof-v1', binding: context.binding,
      rulebookSha256: context.adoption.rulebookSha256,
      receipts: receipts.map(receipt => ({ receiptId: receipt.receiptId, sha256: digest(receipt),
        proposalId: receipt.request.proposalId, proposalSha256: receipt.proposalSha256, selectedRecordKeys: receipt.request.selectedRecordKeys })) };
    const proofSha256 = digest(proof);
    const input: MetricScopeInput = { ...context.input, labelCodebookVersion: context.adoption.rulebookSha256, wideUnknownPolicy: 'exclude',
      sources: [...context.input.sources, { sha256: proofSha256, label: 'Explicit OWNER Metric classification receipts',
        representationRole: 'derived', evidenceFamily: 'metric-membership-acceptance',
        provenanceBasis: 'Application-verified selected receipts and adopted rule; not independent market evidence or provider authenticity.' }],
      records: [...records].map(([key, record]) => {
        const accepted = assignments.get(key)!;
        return { ...record, label: { classification: accepted.assignment.classification, group: accepted.assignment.group,
          contentSha256: metricLabelFingerprint(context.input.scope.platform, record), methodVersion: context.adoption.rulebookSha256,
          source: { sourceSha256: proofSha256, locator: `/receipts/${accepted.receiptIndex}/selectedRecordKeys/${accepted.selectionIndex}` }, adjudication: 'human' } };
      }) };
    return { input: validateMetricScopeInput(input), binding: context.binding, proofBytes: bytes(proof), proofSha256,
      selection: { adoptionId: selection.adoptionId, receiptIds: receipts.map(receipt => receipt.receiptId) as MetricAcceptanceSelection['receiptIds'] } };
  }

  async calculate(workspaceId: string, runId: string, pairId: string, selection: MetricAcceptanceSelection) {
    const projected = await this.project(workspaceId, runId, pairId, selection);
    const snapshot: AutomationClassifiedMetricSnapshot = { contractVersion: 'automation-classified-metric-v1', binding: projected.binding,
      selection: projected.selection, proofSha256: projected.proofSha256, result: calculateMetricScopes(projected.input) };
    if (!valid(snapshot)) throw new ResearchAutomationIntegrityError('Classified Metric calculation failed its contract.');
    return { snapshot, proofBytes: projected.proofBytes };
  }

  /** Reconstruct provenance only. Opening a historical report never runs the calculator. */
  async verify(value: unknown, workspaceId: string, runId: string, pairId: string, selection: MetricAcceptanceSelection) {
    if (!valid(value)) throw new ResearchAutomationIntegrityError('Stored classified Metric snapshot is invalid.');
    const expected = await this.project(workspaceId, runId, pairId, selection);
    if (!equal(value.binding, expected.binding) || !equal(value.selection, expected.selection) || value.proofSha256 !== expected.proofSha256 ||
        !equal(value.result.input, expected.input) || value.result.inputSha256 !== digest(expected.input) || value.result.methodVersion !== 'metric-scope-v1' ||
        value.result.labelIssues.length || value.result.scopes.some(scope => scope.status !== 'CALCULATED'))
      throw new ResearchAutomationIntegrityError('Stored classified Metric result differs from its accepted source universe.');
    return expected.proofBytes;
  }
}

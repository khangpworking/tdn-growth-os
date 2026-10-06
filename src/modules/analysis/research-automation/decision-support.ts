import type { AutomationI14EvidenceAdmission } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import type { AutomationSourceClaim } from './source-claims.js';
import { boundLocatedClaimRow, type AutomationI14EvidenceAdmissionInput } from './i14-evidence-admission.js';
import { verifyLocatedInsightMethods } from '../located-insight-methods.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

/** These checks admit source input for an unreviewed relation draft, not a verified pattern. */
export function decisionAdditionalSupport(
  claims: readonly AutomationSourceClaim[], admission: AutomationI14EvidenceAdmission,
  input: AutomationI14EvidenceAdmissionInput,
) {
  const output = input.locatedMethodOutput === null ? null : verifyLocatedInsightMethods(input.locatedMethodOutput).output;
  const anchors = new Map(admission.anchors.map(anchor => [anchor.claimId, anchor]));
  const observations = new Set<string>();
  const behaviors = new Map<string, {
    eventKind: 'ACTION_REPORTED' | 'ATTEMPT_REPORTED' | 'COMPLETION_REPORTED';
    attribution: 'SOURCE_LOGGED' | 'SELF_REPORTED'; quote: string; contextClaimRefs: string[];
  }>();
  const present = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;
  for (const claim of claims) {
    if (claim.sectionId === 'M05') {
      const { observation: o } = claim;
      // The caller replayed the frozen source/method. UNKNOWN period or precision
      // stays visible; it does not prevent a literal, non-temporal observation.
      if (o.basis === 'SOURCE_OBSERVED' && present(o.measure?.literal) && present(o.measure?.definition) && present(o.unit)
          && (present(o.measure?.entityLabel) || present(o.scope.universe) || present(o.scope.frame))) observations.add(claim.claimId);
      continue;
    }
    if (claim.sectionId !== 'I04') continue;
    const row = boundLocatedClaimRow(claim, output);
    if (!('span' in row) || !['ACTION_REPORTED', 'ATTEMPT_REPORTED', 'COMPLETION_REPORTED'].includes(row.eventKind)
        || !['SOURCE_LOGGED', 'SELF_REPORTED'].includes(row.attribution) || row.qualifiers.length || row.provenance.disagreement !== null) continue;
    const contextClaimRefs = claims.filter(context => {
      const anchor = anchors.get(context.claimId);
      if (!anchor || context.source.sha256 !== claim.source.sha256 || context.source.logicalPath !== claim.source.logicalPath
          || context.source.recordLocator !== claim.source.recordLocator || context.source.locator !== claim.source.locator
          || canonicalJson(context.source.package) !== canonicalJson(claim.source.package)
          || context.source.attribution !== claim.source.attribution || !present(claim.source.attribution)
          || context.declaration?.provenance.disagreement !== null) return false;
      return anchor.contextFields.some(({ field, span }) => ['situation', 'task', 'setting'].includes(field)
        && span.start >= row.span.start && span.end <= row.span.end);
    }).map(context => context.claimId);
    if (contextClaimRefs.length) behaviors.set(claim.claimId, {
      eventKind: row.eventKind as 'ACTION_REPORTED' | 'ATTEMPT_REPORTED' | 'COMPLETION_REPORTED',
      attribution: row.attribution as 'SOURCE_LOGGED' | 'SELF_REPORTED', quote: row.span.quote, contextClaimRefs,
    });
  }
  return { observations, behaviors };
}

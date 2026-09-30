import { createHash } from 'node:crypto';
import type { ReportVersionRecord } from '../../../contracts/analysis/report-version-record.generated.js';
import type { SectionPacket, VersionedReportPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

export const REPORT_INPUT_READINESS_PROFILE = 'report-input-readiness-v1' as const;

export type ReportInputState = 'PRESENT' | 'ABSENT' | 'INVALID';

export interface ReportInputEvidenceRef {
  readonly kind: 'PACKET_POINTER' | 'REPORT_ARTIFACT' | 'REPORT_RECORD';
  readonly locator: string;
  readonly sha256: string;
}

export interface ReportInputCheck {
  readonly inputId: string;
  readonly state: ReportInputState;
  readonly blocking: boolean;
  readonly codes: readonly string[];
  readonly evidenceRefs: readonly ReportInputEvidenceRef[];
}

export type NormalizedProjectionReadiness =
  | { readonly state: 'PRESENT'; readonly normalizedInputSha256: string; readonly rowCount: number; readonly sourceCount: number }
  | { readonly state: 'ABSENT'; readonly normalizedInputSha256: string }
  | { readonly state: 'INVALID'; readonly normalizedInputSha256: string };

interface ReadinessContext {
  readonly record: ReportVersionRecord;
  readonly packet: VersionedReportPacket;
  readonly artifacts: ReadonlyMap<string, { readonly sha256: string }>;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly sections: ReadonlyMap<string, SectionPacket>;
  readonly normalizedProjection: NormalizedProjectionReadiness;
}

type Evaluator = (context: ReadinessContext) => ReportInputCheck;

const optionalInputs = new Set(['optional-owner-declared-tablet-count']);

const packetRef = (packet: VersionedReportPacket, locator: string): ReportInputEvidenceRef => ({
  kind: 'PACKET_POINTER', locator, sha256: packet.packetId,
});

const recordRef = (locator: string, sha256: string): ReportInputEvidenceRef => ({
  kind: 'REPORT_RECORD', locator, sha256,
});

type ArtifactCheck =
  | { readonly state: 'ABSENT' }
  | { readonly state: 'INVALID'; readonly ref: ReportInputEvidenceRef }
  | { readonly state: 'PRESENT'; readonly ref: ReportInputEvidenceRef; readonly bytes: Uint8Array };

function artifactCheck(context: ReadinessContext, fileName: string): ArtifactCheck {
  const artifact = context.artifacts.get(fileName);
  if (artifact === undefined) return { state: 'ABSENT' };
  const ref = { kind: 'REPORT_ARTIFACT', locator: fileName, sha256: artifact.sha256 } as const;
  const bytes = context.files.get(fileName);
  if (bytes === undefined || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
    return { state: 'INVALID', ref };
  }
  return { state: 'PRESENT', ref, bytes };
}

const result = (
  inputId: string,
  state: ReportInputState,
  codes: readonly string[],
  evidenceRefs: readonly ReportInputEvidenceRef[] = [],
): ReportInputCheck => ({ inputId, state, blocking: state !== 'PRESENT' && !optionalInputs.has(inputId), codes, evidenceRefs });

function exactArtifact(
  inputId: string,
  fileName: string,
  expectedSha256: (context: ReadinessContext) => string | undefined,
  presentCode: string,
  absentCode: string,
): Evaluator {
  return context => {
    const artifact = artifactCheck(context, fileName);
    if (artifact.state === 'ABSENT') return result(inputId, 'ABSENT', [absentCode]);
    if (artifact.state === 'INVALID') return result(inputId, 'INVALID', ['ARTIFACT_BYTES_MISSING_OR_MISMATCHED'], [artifact.ref]);
    const expected = expectedSha256(context);
    if (expected !== undefined && artifact.ref.sha256 !== expected) {
      return result(inputId, 'INVALID', ['ARTIFACT_DIGEST_MISMATCH'], [artifact.ref]);
    }
    return result(inputId, 'PRESENT', [presentCode], [artifact.ref]);
  };
}

function methodArtifact(inputId: string, sectionId: string, absentCode: string): Evaluator {
  return context => {
    const section = context.sections.get(sectionId);
    const method = section?.methodArtifact;
    if (method === undefined) return result(inputId, 'ABSENT', [absentCode]);
    const artifact = artifactCheck(context, method.fileName);
    if (artifact.state === 'ABSENT') return result(inputId, 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED']);
    if (artifact.state === 'INVALID' || artifact.ref.sha256 !== method.sha256) {
      return result(inputId, 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED'], [artifact.ref]);
    }
    return result(inputId, 'PRESENT', ['EXACT_METHOD_ARTIFACT_REPLAYED'], [artifact.ref]);
  };
}

const absent = (inputId: string, code: string): Evaluator => () => result(inputId, 'ABSENT', [code]);

function normalizedMetricRows(context: ReadinessContext): ReportInputCheck {
  const artifact = artifactCheck(context, 'normalized-input.json');
  if (artifact.state === 'ABSENT') return result('normalized-metric-rows', 'ABSENT', ['NORMALIZED_ROWS_NOT_BOUND']);
  if (artifact.state === 'INVALID') return result('normalized-metric-rows', 'INVALID', ['ARTIFACT_BYTES_MISSING_OR_MISMATCHED'], [artifact.ref]);
  const projectionRef = recordRef(
    `/analysis_metric_dataset_origins/${context.record.reportId}/${context.record.version}`,
    context.normalizedProjection.normalizedInputSha256,
  );
  if (context.normalizedProjection.state === 'ABSENT') {
    return result('normalized-metric-rows', 'ABSENT', ['QUERYABLE_NORMALIZED_ROWS_NOT_BOUND'], [artifact.ref]);
  }
  if (context.normalizedProjection.state === 'INVALID') {
    return result('normalized-metric-rows', 'INVALID', ['QUERYABLE_NORMALIZED_ROWS_INVALID'], [artifact.ref, projectionRef]);
  }
  if (context.normalizedProjection.normalizedInputSha256 !== artifact.ref.sha256) {
    return result('normalized-metric-rows', 'INVALID', ['QUERYABLE_NORMALIZED_ROWS_DIGEST_MISMATCH'], [artifact.ref, projectionRef]);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes)); }
  catch { return result('normalized-metric-rows', 'INVALID', ['NORMALIZED_INPUT_INVALID_JSON'], [artifact.ref]); }
  const contentSha256 = createHash('sha256').update(canonicalJson(parsed)).digest('hex');
  return contentSha256 === context.packet.inputSha256
    ? result('normalized-metric-rows', 'PRESENT', ['QUERYABLE_NORMALIZED_ROWS_REPLAYED'], [artifact.ref, projectionRef])
    : result('normalized-metric-rows', 'INVALID', ['NORMALIZED_INPUT_CONTENT_DIGEST_MISMATCH'], [artifact.ref]);
}

function quoteInput(inputId: string): Evaluator {
  return context => {
    const method = context.sections.get('M08')?.methodArtifact;
    const quoteSource = context.record.selectedSources.find(source => source.role === 'tabletQuoteSource');
    const quoteInputSource = context.record.selectedSources.find(source => source.role === 'tabletQuoteInput');
    if (method === undefined || quoteSource === undefined || quoteInputSource === undefined) {
      return result(inputId, 'ABSENT', ['EXACT_TABLET_QUOTE_INPUT_NOT_BOUND']);
    }
    const methodArtifact = artifactCheck(context, method.fileName);
    if (methodArtifact.state === 'ABSENT') return result(inputId, 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED']);
    if (methodArtifact.state === 'INVALID' || methodArtifact.ref.sha256 !== method.sha256) {
      return result(inputId, 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED'], [methodArtifact.ref]);
    }
    return result(inputId, 'PRESENT', ['SINGLE_DECLARED_QUOTE_BOUND_UNVERIFIED'], [
      methodArtifact.ref,
      recordRef(`/selectedSources/${quoteSource.ordinal}`, quoteSource.sha256),
      recordRef(`/selectedSources/${quoteInputSource.ordinal}`, quoteInputSource.sha256),
    ]);
  };
}

function m08DeclaredField(inputId: string, field: 'observation-time' | 'tablet-count'): Evaluator {
  return context => {
    const method = context.sections.get('M08')?.methodArtifact;
    if (method === undefined) return result(inputId, 'ABSENT', ['EXACT_TABLET_QUOTE_INPUT_NOT_BOUND']);
    const artifact = artifactCheck(context, method.fileName);
    if (artifact.state === 'ABSENT') return result(inputId, 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED']);
    if (artifact.state === 'INVALID' || artifact.ref.sha256 !== method.sha256) {
      return result(inputId, 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED'], [artifact.ref]);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes)); }
    catch { return result(inputId, 'INVALID', ['M08_METHOD_ARTIFACT_INVALID_JSON'], [artifact.ref]); }
    if (!parsed || typeof parsed !== 'object' || !('quote' in parsed) || !parsed.quote || typeof parsed.quote !== 'object') {
      return result(inputId, 'INVALID', ['M08_METHOD_ARTIFACT_INVALID_SHAPE'], [artifact.ref]);
    }
    const quote = parsed.quote as Record<string, unknown>;
    if (field === 'observation-time') {
      const timeKnown = quote.observationTimeState === 'KNOWN' &&
        (typeof quote.observedAt === 'string' || typeof quote.observationPeriod === 'string');
      return timeKnown
        ? result(inputId, 'PRESENT', ['PRICE_STATE_AND_OBSERVATION_TIME_EXPLICIT'], [artifact.ref])
        : result(inputId, 'ABSENT', ['OBSERVATION_TIME_UNKNOWN'], [artifact.ref]);
    }
    const packCount = quote.packCount;
    const ownerDeclared = Boolean(packCount && typeof packCount === 'object' &&
      'provenance' in packCount && packCount.provenance && typeof packCount.provenance === 'object' &&
      'kind' in packCount.provenance && packCount.provenance.kind === 'OWNER_DECLARED');
    return ownerDeclared
      ? result(inputId, 'PRESENT', ['OWNER_DECLARED_TABLET_COUNT_BOUND'], [artifact.ref])
      : result(inputId, 'ABSENT', ['OWNER_DECLARED_TABLET_COUNT_NOT_RECORDED'], [artifact.ref]);
  };
}

const evaluators: Readonly<Record<string, Evaluator>> = {
  'source-manifest': exactArtifact('source-manifest', 'source-package-manifest.json', context => context.record.sourcePackageManifestSha256, 'EXACT_SOURCE_MANIFEST_BOUND', 'SOURCE_MANIFEST_NOT_BOUND'),
  'source-package-manifest': exactArtifact('source-package-manifest', 'source-package-manifest.json', context => context.record.sourcePackageManifestSha256, 'EXACT_SOURCE_MANIFEST_BOUND', 'SOURCE_MANIFEST_NOT_BOUND'),
  'normalized-metric-rows': normalizedMetricRows,
  'normalization-receipt': exactArtifact('normalization-receipt', 'receipt.json', () => undefined, 'NORMALIZATION_RECEIPT_BOUND', 'NORMALIZATION_RECEIPT_NOT_BOUND'),
  'metric-result': exactArtifact('metric-result', 'metric-result.json', context => context.packet.metricResultSha256, 'METRIC_RESULT_BOUND', 'METRIC_RESULT_NOT_BOUND'),
  'validated-metrics': exactArtifact('validated-metrics', 'metric-result.json', context => context.packet.metricResultSha256, 'DETERMINISTIC_METRIC_RESULT_REPLAYED', 'VALIDATED_METRICS_NOT_BOUND'),
  scope: context => result('scope', 'PRESENT', ['EXACT_SCOPE_BOUND'], [packetRef(context.packet, '/scope')]),
  'source-scope': context => result('source-scope', 'PRESENT', ['EXACT_SCOPE_BOUND'], [packetRef(context.packet, '/scope')]),
  'source-bound-claims': context => context.packet.claims.length === 0
    ? result('source-bound-claims', 'ABSENT', ['NO_SOURCE_BOUND_FACT_CLAIMS'])
    : result('source-bound-claims', 'PRESENT', ['DETERMINISTIC_FACT_CLAIMS_BOUND'], [packetRef(context.packet, '/claims')]),
  'owner-question': absent('owner-question', 'OWNER_BUSINESS_QUESTION_NOT_RECORDED'),
  'owner-review': absent('owner-review', 'OWNER_REVIEW_NOT_RECORDED'),
  'domain-specific-evidence': absent('domain-specific-evidence', 'DOMAIN_EVIDENCE_NOT_BOUND'),
  'case-locators': absent('case-locators', 'CONSUMER_CASE_LOCATORS_NOT_BOUND'),
  'adjudication-provenance': absent('adjudication-provenance', 'CONSUMER_CASE_ADJUDICATION_NOT_BOUND'),
  'comparable-groups': absent('comparable-groups', 'COMPARABLE_GROUPS_NOT_BOUND'),
  denominators: absent('denominators', 'COMPARABLE_GROUP_DENOMINATORS_NOT_BOUND'),
  'compatible-daily-series': absent('compatible-daily-series', 'COMPATIBLE_DAILY_SERIES_NOT_BOUND'),
  'held-out-horizon': absent('held-out-horizon', 'HELD_OUT_HORIZON_NOT_BOUND'),
  'existing-relevant-outcomes': absent('existing-relevant-outcomes', 'RELEVANT_OUTCOMES_NOT_BOUND'),
  'measurement-design': absent('measurement-design', 'MEASUREMENT_DESIGN_NOT_BOUND'),
  'exact-raw-quote-source-and-locator': quoteInput('exact-raw-quote-source-and-locator'),
  'canonical-tablet-quote-input': quoteInput('canonical-tablet-quote-input'),
  'explicit-price-state-and-observation-time': m08DeclaredField('explicit-price-state-and-observation-time', 'observation-time'),
  'optional-owner-declared-tablet-count': m08DeclaredField('optional-owner-declared-tablet-count', 'tablet-count'),
  'verified-locators': methodArtifact('verified-locators', 'M13', 'VERIFIED_LOCATORS_NOT_BOUND'),
  'exact-source-package-lineage': methodArtifact('exact-source-package-lineage', 'M13', 'EXACT_SOURCE_LINEAGE_NOT_BOUND'),
  'verified-locators-and-denominators': methodArtifact('verified-locators-and-denominators', 'I03', 'VERIFIED_METHOD_CONTEXT_NOT_BOUND'),
  'resolved-fact-claim-pointers': context => {
    const method = context.sections.get('I17')?.methodArtifact;
    if (method === undefined || context.packet.claims.length === 0) {
      return result('resolved-fact-claim-pointers', 'ABSENT', ['RESOLVED_FACT_POINTERS_NOT_BOUND']);
    }
    const artifact = artifactCheck(context, method.fileName);
    if (artifact.state === 'ABSENT') return result('resolved-fact-claim-pointers', 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED']);
    if (artifact.state === 'INVALID' || artifact.ref.sha256 !== method.sha256) {
      return result('resolved-fact-claim-pointers', 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED'], [artifact.ref]);
    }
    return result('resolved-fact-claim-pointers', 'PRESENT', ['FACT_POINTERS_RESOLVED_BY_I17'], [artifact.ref, packetRef(context.packet, '/claims')]);
  },
  'verified-method-artifacts': context => {
    const required = ['M02', 'M13', 'I03'] as const;
    const refs: ReportInputEvidenceRef[] = [];
    for (const sectionId of required) {
      const method = context.sections.get(sectionId)?.methodArtifact;
      if (method === undefined) return result('verified-method-artifacts', 'ABSENT', [`${sectionId}_METHOD_ARTIFACT_NOT_BOUND`]);
      const artifact = artifactCheck(context, method.fileName);
      if (artifact.state === 'ABSENT') return result('verified-method-artifacts', 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED']);
      if (artifact.state === 'INVALID' || artifact.ref.sha256 !== method.sha256) {
        return result('verified-method-artifacts', 'INVALID', ['METHOD_ARTIFACT_MISSING_OR_MISMATCHED'], [artifact.ref]);
      }
      refs.push(artifact.ref);
    }
    return result('verified-method-artifacts', 'PRESENT', ['UPSTREAM_METHOD_ARTIFACTS_REPLAYED'], refs);
  },
  'frozen-label-decisions': context => {
    const source = context.record.selectedSources.find(candidate => candidate.role === 'labels');
    if (source === undefined) return result('frozen-label-decisions', 'ABSENT', ['LABEL_DECISIONS_NOT_BOUND']);
    const ref = recordRef(`/selectedSources/${source.ordinal}`, source.sha256);
    const labelsBlocked = context.packet.sections.some(section => section.blockers.some(code => code.includes('BLOCKED_LABELS')));
    return labelsBlocked
      ? result('frozen-label-decisions', 'INVALID', ['LABEL_DECISIONS_DO_NOT_COVER_REQUIRED_SCOPE'], [ref])
      : result('frozen-label-decisions', 'PRESENT', ['FROZEN_LABEL_SOURCE_BOUND'], [ref]);
  },
};

/**
 * Evaluates catalog prerequisites only. It does not calculate a section,
 * authenticate a provider, or upgrade a packet delivery state.
 */
export function buildReportInputReadiness(
  record: ReportVersionRecord,
  packet: VersionedReportPacket,
  requiredInputs: readonly string[],
  files: ReadonlyMap<string, Uint8Array>,
  normalizedProjection: NormalizedProjectionReadiness,
): readonly ReportInputCheck[] {
  const context: ReadinessContext = {
    record,
    packet,
    artifacts: new Map(record.artifacts.map(artifact => [artifact.fileName, artifact])),
    files,
    sections: new Map(packet.sections.map(section => [section.sectionId, section])),
    normalizedProjection,
  };
  return requiredInputs.map(inputId => {
    const evaluate = evaluators[inputId];
    if (evaluate === undefined) throw new TypeError(`Report input readiness: UNKNOWN_INPUT_ID ${inputId}`);
    return evaluate(context);
  });
}

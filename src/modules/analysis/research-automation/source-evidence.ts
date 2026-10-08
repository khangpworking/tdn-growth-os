import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-source-evidence.schema.json' with { type: 'json' };
import filterSchema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import appendixSchema from '../../../../contracts/analysis/source-appendix-projection.schema.json' with { type: 'json' };
import type { AutomationSourceEvidence } from '../../../../contracts/analysis/automation-source-evidence.generated.js';
import type { KeywordListDraftRecord } from '../keyword-list-draft-record.js';
import { buildSourceAppendixProjection, type SourceAppendixUsage } from '../source-appendix-projection.js';
import { filterSerpApiResults } from './serpapi-l9-filter.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { ResearchAutomationIntegrityError, type CaptureRecord, type StepWebResult } from './model.js';
export type { AutomationSourceEvidence } from '../../../../contracts/analysis/automation-source-evidence.generated.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); ajv.addSchema([filterSchema, appendixSchema]);
const validate = ajv.compile<AutomationSourceEvidence>(schema);
export function checkSourceEvidence(value: unknown): asserts value is AutomationSourceEvidence {
  if (!validate(value)) throw new ResearchAutomationIntegrityError('Source evidence packet failed canonical schema validation');
  if (value.draftDigest === null ? value.admission !== null || value.unavailableReason === null : value.admission === null || value.unavailableReason !== null) throw new ResearchAutomationIntegrityError('Source evidence availability is inconsistent');
  if (value.admission && (value.admission.dataVersion !== value.admission.result.dataVersion || canonicalJson(value.admission.includedRecordIds) !== canonicalJson(value.admission.result.results.filter(r => r.decision === 'INCLUDED').map(r => r.recordId)))) throw new ResearchAutomationIntegrityError('Source evidence admitted IDs differ from decisions');
}
export function buildSourceEvidence(input: {
  draft: KeywordListDraftRecord | null; draftDigest: string | null;
  unavailableReason: AutomationSourceEvidence['unavailableReason'];
  webResults: readonly StepWebResult[]; captures: readonly CaptureRecord[];
  additionalUsages?: readonly SourceAppendixUsage[];
  usedCaptureDigests?: readonly string[];
}): AutomationSourceEvidence {
  const webCaptures = input.captures.filter(c => c.stepId === 'COLLECTION');
  const located = input.webResults.map(row => {
    const capture = webCaptures.find(c => c.ordinal === row.captureIndex);
    if (!capture || capture.provider !== 'serpapi') throw new ResearchAutomationIntegrityError('Web result capture lineage is unavailable');
    return { captureId: capture.artifactSha256, position: row.position, title: row.title, snippet: row.snippet };
  });
  const admission = input.draft ? filterSerpApiResults({ results: located, filter: input.draft.output }) : null;
  const usages: SourceAppendixUsage[] = [...(input.additionalUsages ?? [])];
  for (const capture of [...input.captures].sort((a, b) => a.stepId.localeCompare(b.stepId) || a.ordinal - b.ordinal)) {
    const registryId = capture.provider === 'kalodata' ? 'S02' : capture.provider === 'serpapi'
      ? capture.operation === 'serpapi.google.trends' ? 'S20' : 'S19' : null;
    const used = registryId === 'S02' ? input.draft?.salesNameRefs.some(ref => ref.captureDigest === capture.artifactSha256) || input.usedCaptureDigests?.includes(capture.artifactSha256)
      : registryId === 'S19' ? admission && located.some(row => row.captureId === capture.artifactSha256) : false;
    if (!used || !registryId || usages.some(u => u.registryId === registryId && u.binding.ref === capture.artifactSha256)) continue;
    const rows = admission?.result.results.filter(row => row.recordId.startsWith(`${capture.artifactSha256}#`)) ?? [];
    const byReason: Record<string, number> = {};
    for (const row of rows) if (row.decision !== 'INCLUDED') byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
    usages.push({ registryId, binding: { kind: 'capture', ref: capture.artifactSha256 }, l10SourceType: null,
      l9: registryId === 'S19' && admission ? { excluded: rows.filter(r => r.decision === 'EXCLUDED').length,
        unclear: rows.filter(r => r.decision === 'UNCLEAR').length, byReason } : null });
  }
  const packet: AutomationSourceEvidence = { contractVersion: 'automation-source-evidence-v1', draftDigest: input.draftDigest,
    admission, unavailableReason: input.unavailableReason, sourceAppendix: buildSourceAppendixProjection({ usages }) };
  checkSourceEvidence(packet); return packet;
}
/** Recompute decisions from retained inputs, then compare the complete packet, not merely its version. */
export function verifySourceEvidence(packet: AutomationSourceEvidence, input: Parameters<typeof buildSourceEvidence>[0]): void {
  checkSourceEvidence(packet);
  if (canonicalJson(packet) !== canonicalJson(buildSourceEvidence(input))) throw new ResearchAutomationIntegrityError('Retained source evidence differs from exact replay');
}
export function admitWebResults(packet: AutomationSourceEvidence, results: readonly StepWebResult[], captures: readonly CaptureRecord[]): StepWebResult[] {
  checkSourceEvidence(packet);
  const included = new Set(packet.admission?.includedRecordIds ?? []);
  const collection = captures.filter(c => c.stepId === 'COLLECTION');
  return results.filter(row => {
    const capture = collection.find(c => c.ordinal === row.captureIndex);
    return capture !== undefined && included.has(`${capture.artifactSha256}#${row.position}`);
  });
}

/** Registry membership follows verified owning-method identity, never filenames or URL guesses. Unknown future source families remain outside this mapping. */
export function sourceEvidenceForReport(packet: AutomationSourceEvidence, input: Pick<import('./service.js').ResearchAutomationReportInput,
  'reviewSample' | 'privateReviewCorpus' | 'metricMethods' | 'metricClassified' | 'reviewCorpus' | 'collection' | 'nativeReview' | 'locatedReview' | 'insightLiteral'>, kind: 'MARKET' | 'INSIGHT'): AutomationSourceEvidence {
  checkSourceEvidence(packet);
  const usages: SourceAppendixUsage[] = packet.sourceAppendix.rows.map(row => ({ registryId: row.registryId, binding: row.binding,
    l9: row.l9Excluded === null || row.l9Unclear === null ? null : { excluded: row.l9Excluded, unclear: row.l9Unclear, byReason: row.l9Reasons }, l10SourceType: row.l10SourceType }));
  const add = (registryId: SourceAppendixUsage['registryId'], kind: SourceAppendixUsage['binding']['kind'], ref: string) => {
    if (!usages.some(row => row.registryId === registryId && row.binding.kind === kind && row.binding.ref === ref)) usages.push({ registryId,
      binding: { kind, ref }, l9: null, l10SourceType: null });
  };
  if (kind === 'MARKET' && input.metricMethods) add('S01', 'package', input.metricMethods.originalSourcePackage.manifestArtifactSha256);
  if (kind === 'INSIGHT') {
    if (input.reviewSample && input.collection?.privateShopee && input.reviewSample.collection.collectionSha256 !== input.collection.privateShopee.collectionSha256) throw new ResearchAutomationIntegrityError('Used review sample differs from exact retained collection');
    if ((input.privateReviewCorpus || input.reviewSample) && input.collection?.privateShopee) add('S05', 'capture', input.collection.privateShopee.collectionSha256);
    if ((input.reviewCorpus || input.locatedReview || input.insightLiteral) && input.collection?.exactShopee) add('S05', 'capture', input.collection.exactShopee.collectionSha256);
    if (input.nativeReview) add('S27', 'package', input.nativeReview.nativeSource.sourcePackage.manifestArtifactSha256);
    else if (input.insightLiteral && input.collection?.nativeReview) add('S27', 'package', input.collection.nativeReview.sourcePackage.manifestArtifactSha256);
    // The literal snapshot is source-replayed by the owning service before this
    // projection; only statement pointers actually consumed by its seller view
    // contribute captures. Do not attribute unrelated detail captures.
    if (input.insightLiteral) for (const pointer of input.insightLiteral.sellerLayer.statementPointers) {
      const index = Number(pointer.slice('/input/sellerStatements/'.length));
      const statement = input.insightLiteral.input.sellerStatements[index];
      if (!statement) throw new ResearchAutomationIntegrityError('Literal seller source usage lacks its verified statement');
      add('S02', 'capture', statement.sourceSha256);
    }
  }
  return { ...packet, sourceAppendix: buildSourceAppendixProjection({ usages }) };
}

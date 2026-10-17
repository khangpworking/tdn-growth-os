import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-source-evidence.schema.json' with { type: 'json' };
import filterSchema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import appendixSchema from '../../../../contracts/analysis/source-appendix-projection.schema.json' with { type: 'json' };
import jevTriageSchema from '../../../../contracts/analysis/l9-jev-triage.schema.json' with { type: 'json' };
import type { AutomationSourceEvidence } from '../../../../contracts/analysis/automation-source-evidence.generated.js';
import type { RetainedKeywordListDraftRecord } from '../keyword-list-draft-record.js';
import { buildSourceAppendixProjection, type SourceAppendixUsage } from '../source-appendix-projection.js';
import { filterSerpApiResults } from './serpapi-l9-filter.js';
import { applyL9JevTriage, l9JevTriageMatches, triageL9WithJev, unavailableL9JevTriage, type L9JevTriageSidecar } from './l9-jev-triage.js';
import { TypesafeJevClient } from '../../../platform/ai/typesafe-jev-client.js';
import type { SerpApiL9FilterOutput } from './serpapi-l9-filter.js';
import { classifyWebPage } from './web-page-type.js';
import { searchInterestRenderable } from './search-interest.js';
import { worldBankRenderableRows } from './world-bank-lane.js';
import { comtradeRenderable } from './comtrade-lane.js';
import { searchAdsOkBrands } from './google-ads-lane.js';
import { officialStatsRenderableRows } from './official-statistics-lane.js';
import { pdfExcerptDocuments, type PdfExcerpt } from './pdf-excerpt.js';
import { sellerVideoPackages, type SellerVideos } from './seller-video.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { ResearchAutomationIntegrityError, type CaptureRecord, type StepWebResult } from './model.js';
export type { AutomationSourceEvidence } from '../../../../contracts/analysis/automation-source-evidence.generated.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); ajv.addSchema([filterSchema, appendixSchema, jevTriageSchema]);
const validate = ajv.compile<AutomationSourceEvidence>(schema);
export function checkSourceEvidence(value: unknown): asserts value is AutomationSourceEvidence {
  if (!validate(value)) throw new ResearchAutomationIntegrityError('Source evidence packet failed canonical schema validation');
  if (value.draftDigest === null ? value.admission !== null || value.unavailableReason === null : value.admission === null || value.unavailableReason !== null) throw new ResearchAutomationIntegrityError('Source evidence availability is inconsistent');
  if (value.draftFailureCode !== undefined && value.unavailableReason !== 'DRAFT_FAILED') throw new ResearchAutomationIntegrityError('Source evidence failure code is inconsistent');
  if (value.admission && (value.admission.dataVersion !== value.admission.result.dataVersion || canonicalJson(value.admission.includedRecordIds) !== canonicalJson(value.admission.result.results.filter(r => r.decision === 'INCLUDED').map(r => r.recordId)))) throw new ResearchAutomationIntegrityError('Source evidence admitted IDs differ from decisions');
}
export function buildSourceEvidence(input: {
  draft: RetainedKeywordListDraftRecord | null; draftDigest: string | null;
  unavailableReason: AutomationSourceEvidence['unavailableReason'];
  /** Diagnostic only: the closed cause of DRAFT_FAILED. It is not derived from inputs, so replay carries it from the packet. */
  draftFailureCode?: AutomationSourceEvidence['draftFailureCode'];
  webResults: readonly StepWebResult[]; captures: readonly CaptureRecord[];
  additionalUsages?: readonly SourceAppendixUsage[];
  usedCaptureDigests?: readonly string[];
  jevTriage?: L9JevTriageSidecar;
  /** New builds only: split admitted search rows into S13 / S26 / S19. Stored packets omit it and replay unchanged. */
  pageTypes?: boolean;
}): AutomationSourceEvidence {
  const webCaptures = input.captures.filter(c => c.stepId === 'COLLECTION');
  const located = input.webResults.map(row => {
    const capture = webCaptures.find(c => c.ordinal === row.captureIndex);
    if (!capture || capture.provider !== 'serpapi') throw new ResearchAutomationIntegrityError('Web result capture lineage is unavailable');
    return { captureId: capture.artifactSha256, position: row.position, title: row.title, snippet: row.snippet };
  });
  const pageType = new Map(input.webResults.map((row, i) => [`${located[i]!.captureId}#${row.position}`, classifyWebPage(row)]));
  const admission = input.draft ? filterSerpApiResults({ results: located, filter: input.draft.output }) : null;
  const retainedJevTriage = admission && input.jevTriage && !l9JevTriageMatches(admission.result, input.jevTriage)
    ? unavailableL9JevTriage(input.draft!.output, admission.result) : input.jevTriage;
  const applied = admission ? applyL9JevTriage(admission.result, retainedJevTriage ?? null) : new Map();
  const usages: SourceAppendixUsage[] = [...(input.additionalUsages ?? [])];
  // The owning service replayed each cell against its original confirmed
  // package before calling this method. A card or an unconsumed upload adds no use.
  if (input.draft?.contractVersion === 'l9-keyword-list-draft-record-v3') for (const ref of input.draft.salesNameRefs) {
    if (!('kind' in ref)) continue;
    const manifest = ref.sourcePackage.manifestArtifactSha256;
    if (!usages.some(row => row.registryId === 'S01' && row.binding.kind === 'package' && row.binding.ref === manifest))
      usages.push({ registryId: 'S01', binding: { kind: 'package', ref: manifest }, l9: null, l10SourceType: null });
  }
  for (const capture of [...input.captures].sort((a, b) => a.stepId.localeCompare(b.stepId) || a.ordinal - b.ordinal)) {
    const registryId = capture.provider === 'kalodata' ? 'S02' : capture.provider === 'serpapi'
      ? capture.operation === 'serpapi.google.trends' ? 'S20' : 'S19' : null;
    const used = registryId === 'S02' ? input.draft?.salesNameRefs.some(ref => 'captureDigest' in ref && ref.captureDigest === capture.artifactSha256) || input.usedCaptureDigests?.includes(capture.artifactSha256)
      : registryId === 'S19' ? admission && located.some(row => row.captureId === capture.artifactSha256) : false;
    if (!used || !registryId || usages.some(u => u.registryId === registryId && u.binding.ref === capture.artifactSha256)) continue;
    const rows = admission?.result.results.filter(row => row.recordId.startsWith(`${capture.artifactSha256}#`)) ?? [];
    const appliedRows = rows.map(row => ({ row, decision: applied.get(row.recordId)! }));
    const byReason: Record<string, number> = {};
    for (const { row, decision } of appliedRows) if (decision.decision !== 'INCLUDED') byReason[decision.reason] = (byReason[decision.reason] ?? 0) + 1;
    usages.push({ registryId, binding: { kind: 'capture', ref: capture.artifactSha256 }, l10SourceType: null,
      l9: registryId === 'S19' && admission ? { excluded: appliedRows.filter(({ decision }) => decision.decision === 'EXCLUDED').length,
        unclear: appliedRows.filter(({ decision }) => decision.decision === 'UNCLEAR').length, byReason } : null });
    // The same capture carries S19 for L9 accounting; a typed row adds one more use per type, never a second L9 bucket.
    if (registryId === 'S19' && input.pageTypes) for (const typed of ['S13', 'S26'] as const)
      if (appliedRows.some(({ row, decision }) => decision.decision === 'INCLUDED' && pageType.get(row.recordId) === typed))
        usages.push({ registryId: typed, binding: { kind: 'capture', ref: capture.artifactSha256 }, l10SourceType: null, l9: null });
  }
  const packet: AutomationSourceEvidence = { contractVersion: 'automation-source-evidence-v1', draftDigest: input.draftDigest,
    admission, unavailableReason: input.unavailableReason, ...(input.draftFailureCode ? { draftFailureCode: input.draftFailureCode } : {}), sourceAppendix: buildSourceAppendixProjection({ usages }),
    ...(retainedJevTriage ? { jevTriage: retainedJevTriage } : {}), ...(input.pageTypes ? { webPageTypes: true as const } : {}) };
  checkSourceEvidence(packet); return packet;
}
/** Recompute decisions from retained inputs, then compare the complete packet, not merely its version. */
export function verifySourceEvidence(packet: AutomationSourceEvidence, input: Parameters<typeof buildSourceEvidence>[0]): void {
  checkSourceEvidence(packet);
  if (canonicalJson(packet) !== canonicalJson(buildSourceEvidence({ ...input, pageTypes: packet.webPageTypes === true, ...(packet.draftFailureCode ? { draftFailureCode: packet.draftFailureCode } : {}) }))) throw new ResearchAutomationIntegrityError('Retained source evidence differs from exact replay');
}
export function admitWebResults(packet: AutomationSourceEvidence, results: readonly StepWebResult[], captures: readonly CaptureRecord[], jevTriage: L9JevTriageSidecar | null = null): StepWebResult[] {
  checkSourceEvidence(packet);
  const applied = packet.admission ? applyL9JevTriage(packet.admission.result, jevTriage) : new Map();
  const included = new Set([...applied].filter(([, row]) => row.decision === 'INCLUDED').map(([recordId]) => recordId));
  const collection = captures.filter(c => c.stepId === 'COLLECTION');
  return results.filter(row => {
    const capture = collection.find(c => c.ordinal === row.captureIndex);
    return capture !== undefined && included.has(`${capture.artifactSha256}#${row.position}`);
  });
}

function sourceEvidenceAdmission(input: Parameters<typeof buildSourceEvidence>[0]): SerpApiL9FilterOutput | null {
  if (!input.draft) return null;
  const webCaptures = input.captures.filter(c => c.stepId === 'COLLECTION');
  const located = input.webResults.map(row => {
    const capture = webCaptures.find(c => c.ordinal === row.captureIndex);
    if (!capture || capture.provider !== 'serpapi') throw new ResearchAutomationIntegrityError('Web result capture lineage is unavailable');
    return { captureId: capture.artifactSha256, position: row.position, title: row.title, snippet: row.snippet };
  });
  return filterSerpApiResults({ results: located, filter: input.draft.output });
}

/** Build the same frozen web L9 result that is retained in source evidence. */
export async function triageSourceEvidenceL9(input: {
  readonly draft: RetainedKeywordListDraftRecord | null;
  readonly webResults: readonly StepWebResult[];
  readonly captures: readonly CaptureRecord[];
  readonly client: TypesafeJevClient;
}): Promise<L9JevTriageSidecar | null> {
  const admission = sourceEvidenceAdmission({ draft: input.draft, draftDigest: null, unavailableReason: null,
    webResults: input.webResults, captures: input.captures });
  return admission ? triageL9WithJev({ data: input.draft!.output, result: admission.result, client: input.client }) : null;
}

/** Registry membership follows verified owning-method identity, never filenames or URL guesses. Unknown future source families remain outside this mapping. */
export function sourceEvidenceForReport(packet: AutomationSourceEvidence, input: Pick<import('./service.js').ResearchAutomationReportInput,
  'reviewSample' | 'privateReviewCorpus' | 'metricMethods' | 'metricClassified' | 'reviewCorpus' | 'collection' | 'nativeReview' | 'locatedReview' | 'insightLiteral'> & { readonly captures?: readonly CaptureRecord[]; readonly pdfExcerpts?: readonly PdfExcerpt[]; readonly sellerVideos?: SellerVideos | null }, kind: 'MARKET' | 'INSIGHT'): AutomationSourceEvidence {
  checkSourceEvidence(packet);
  const usages: SourceAppendixUsage[] = packet.sourceAppendix.rows.map(row => ({ registryId: row.registryId, binding: row.binding,
    l9: row.l9Excluded === null || row.l9Unclear === null ? null : { excluded: row.l9Excluded, unclear: row.l9Unclear, byReason: row.l9Reasons }, l10SourceType: row.l10SourceType }));
  const add = (registryId: SourceAppendixUsage['registryId'], kind: SourceAppendixUsage['binding']['kind'], ref: string) => {
    if (!usages.some(row => row.registryId === registryId && row.binding.kind === kind && row.binding.ref === ref)) usages.push({ registryId,
      binding: { kind, ref }, l9: null, l10SourceType: null });
  };
  if (kind === 'MARKET' && input.metricMethods) add('S01', 'package', input.metricMethods.originalSourcePackage.manifestArtifactSha256);
  // S20 is used only when the Market report draws the stored series (same predicate as the renderers).
  const interest = input.collection?.searchInterest;
  if (kind === 'MARKET' && searchInterestRenderable(interest)) {
    const capture = input.captures?.find(c => c.stepId === 'COLLECTION' && c.ordinal === interest.captureIndex);
    if (!capture || capture.provider !== 'serpapi' || capture.operation !== 'serpapi.google.trends') throw new ResearchAutomationIntegrityError('Search interest capture lineage is unavailable');
    add('S20', 'capture', capture.artifactSha256);
  }
  // S23 is used only for the country-level rows the Market report draws (same predicate as both renderers); each needs both stored captures.
  if (kind === 'MARKET') for (const item of worldBankRenderableRows(input.collection?.worldBank)) {
    const find = (index: number) => input.captures?.find(c => c.stepId === 'COLLECTION' && c.ordinal === index);
    const observation = find(item.captureIndex), metadata = find(item.metadataCaptureIndex);
    if (!observation || observation.provider !== 'world-bank' || observation.operation !== 'worldbank.observations'
      || !metadata || metadata.provider !== 'world-bank' || metadata.operation !== 'worldbank.metadata') throw new ResearchAutomationIntegrityError('World Bank capture lineage is unavailable');
    add('S23', 'capture', observation.artifactSha256);
  }
  // S21 is used only when the Market report draws table 5.4 (same predicate as both renderers), once per stored workbook that has a drawn row.
  if (kind === 'MARKET') for (const index of new Set(officialStatsRenderableRows(input.collection?.officialStats).map(row => row.captureIndex))) {
    const capture = input.captures?.find(c => c.stepId === 'COLLECTION' && c.ordinal === index);
    if (!capture || capture.provider !== 'official-stats' || capture.operation !== 'officialstats.download') throw new ResearchAutomationIntegrityError('Official statistics capture lineage is unavailable');
    add('S21', 'capture', capture.artifactSha256);
  }
  // S24 is used only when the Market report draws the country-level trade table (same predicate as both renderers), once per stored response.
  if (kind === 'MARKET' && comtradeRenderable(input.collection?.comtrade)) for (const call of input.collection!.comtrade!.calls) {
    const capture = input.captures?.find(c => c.stepId === 'COLLECTION' && c.ordinal === call.captureIndex);
    if (!capture || capture.provider !== 'comtrade' || capture.operation !== 'comtrade.data') throw new ResearchAutomationIntegrityError('UN Comtrade capture lineage is unavailable');
    add('S24', 'capture', capture.artifactSha256);
  }
  // S17 is used only for brand rows drawn in Market, once per stored response.
  if (kind === 'MARKET') for (const brand of searchAdsOkBrands(input.collection?.searchAds)) {
    const capture = input.captures?.find(c => c.stepId === 'COLLECTION' && c.ordinal === brand.captureIndex);
    if (!capture || capture.truncated || capture.provider !== 'serpapi' || capture.operation !== 'serpapi.google_ads.transparency' || capture.retrievedAt !== brand.retrievedAt)
      throw new ResearchAutomationIntegrityError('Search ads capture lineage is unavailable');
    add('S17', 'capture', capture.artifactSha256);
  }
  // S25 is used only when the Market report draws at least one verified document excerpt, once per document; the marker lets older packets verify unchanged.
  const excerpts = kind === 'MARKET' ? input.pdfExcerpts ?? [] : [];
  for (const sha of pdfExcerptDocuments(excerpts)) add('S25', 'package', sha);
  // S02/S14 are used only when the Market report draws the owner/operator video uploads (table, seller speech), once per package.
  const videos = kind === 'MARKET' ? sellerVideoPackages(input.sellerVideos) : { table: [], readings: [] };
  for (const sha of videos.table) add('S02', 'package', sha);
  for (const sha of videos.readings) add('S14', 'package', sha);
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
  return { ...packet, ...(excerpts.length ? { pdfExcerpts: true as const } : {}), ...(videos.table.length || videos.readings.length ? { sellerVideos: true as const } : {}), sourceAppendix: buildSourceAppendixProjection({ usages }) };
}

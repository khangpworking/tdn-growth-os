import { createHash } from 'node:crypto';
import type { FactObservation } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import { buildReportSemanticContent } from './report-semantic-content.js';
import { canonicalJson } from '../foundation/canonical-json.js';

/**
 * Presentation-only citation projection for an already verified report.
 *
 * This module deliberately does not search, fetch, parse a provider response,
 * or decide whether a source is true.  It only projects identities and
 * lineages that are already retained by SourceBackedReportBundle.  A
 * retrieval adapter (for example PageIndex) may supply a candidate, but the
 * caller must verify that candidate against the exact retained bytes before a
 * quote can enter this projection.
 */

const DIGEST = /^[0-9a-f]{64}$/;
const SHA256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const identity = (value: unknown): string => SHA256(Buffer.from(canonicalJson(value), 'utf8'));

export type ReportCitationLocator =
  | { readonly kind: 'pdf'; readonly page: number; readonly fragment: string | null }
  | { readonly kind: 'xlsx'; readonly sheet: string; readonly cell: string }
  | { readonly kind: 'json-pointer'; readonly pointer: string }
  | { readonly kind: 'source-locator'; readonly value: string };

export interface ReportCitationArtifact {
  readonly kind: 'calculation' | 'source' | 'report';
  readonly logicalPath: string;
  readonly sha256: string;
}

export interface ReportCitationSource {
  readonly sourceSha256: string;
  readonly packageId: string;
  readonly logicalPath: string;
  readonly exportPath: string;
  readonly label: string;
  readonly role: string;
}

export interface ReportCitationQuoteCandidate {
  /** Existing retained claim/source identifier supplied by a model or adapter. */
  readonly referenceId: string;
  readonly sourceSha256: string;
  readonly locator: string | ReportCitationLocator;
  readonly provider?: 'pageindex' | 'manual' | 'other';
  /** Untrusted candidate text. It is never accepted without quoteVerifier. */
  readonly quote?: string;
}

export interface ReportCitationQuoteVerification {
  readonly quote: string;
  /** Required echoes bind the verifier result to exact retained identity. */
  readonly sourceSha256: string;
  readonly locator: string | ReportCitationLocator;
}

/**
 * Application-owned byte verifier. It must inspect `source.bytes` and return
 * identity echoes; the adapter does not treat model/provider output as proof.
 */
export type ReportCitationQuoteVerifier = (
  candidate: ReportCitationQuoteCandidate,
  source: { readonly metadata: ReportCitationSource; readonly bytes: Uint8Array },
) => ReportCitationQuoteVerification | null;

export interface ReportCitationEntry {
  readonly number: number;
  readonly citationId: string;
  readonly reportSemanticVersionId: string;
  readonly role: 'CALCULATION' | 'SOURCE_EVIDENCE' | 'RETRIEVAL_CANDIDATE';
  readonly artifact: ReportCitationArtifact;
  readonly source: ReportCitationSource | null;
  readonly locator: ReportCitationLocator;
  readonly quote: string | null;
  readonly quoteVerification: 'NONE' | 'EXTERNAL_VERIFIER_ATTESTED';
}

export interface ReportCitationReference {
  readonly referenceId: string;
  readonly claimId: string | null;
  readonly citationNumbers: readonly number[];
  readonly calculationCitationNumbers: readonly number[];
  readonly sourceCitationNumbers: readonly number[];
  readonly candidateCitationNumbers: readonly number[];
}

export interface ReportCitationProjection {
  readonly contractVersion: 'report-citations-v1';
  readonly report: {
    readonly semanticVersionId: string;
    readonly packetId: string;
    readonly packetSha256: string;
    readonly reportSha256: string;
    readonly envelopeSha256: string;
    readonly sourcePackageId: string;
    readonly sourcePackageManifestSha256: string;
    readonly workspaceId: string;
    readonly workspaceSnapshotSha256: string;
  };
  /** Numbering is derived from canonical citation identity, never input order. */
  readonly citations: readonly ReportCitationEntry[];
  readonly references: readonly ReportCitationReference[];
  readonly retainedReferenceIds: readonly string[];
  readonly limitations: readonly string[];
}

interface RetainedSource {
  readonly metadata: ReportCitationSource;
  readonly bytes: Buffer;
}

interface CitationDraft {
  readonly semanticVersionId: string;
  readonly role: ReportCitationEntry['role'];
  readonly artifact: ReportCitationArtifact;
  readonly source: ReportCitationSource | null;
  readonly locator: ReportCitationLocator;
  readonly quote: string | null;
  readonly quoteVerification: 'NONE' | 'EXTERNAL_VERIFIER_ATTESTED';
}

interface SelectedReference {
  readonly referenceId: string;
  readonly claim: FactObservation | null;
}

function fail(code: string): never {
  throw new TypeError(`report citations: ${code}`);
}

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) fail(`INVALID_${label.toUpperCase()}_DIGEST`);
}

function normalizeQuote(value: string, label: string): string {
  if (value.trim() !== value || value.length === 0 || value.length > 20_000) {
    fail(`${label}_NOT_EXACT_TEXT`);
  }
  return value;
}

function locatorKey(locator: ReportCitationLocator): string {
  return canonicalJson(locator);
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Converts known source locator forms to a small rendering vocabulary. The
 * raw locator is retained when its form is not known; it is never guessed.
 */
export function normalizeReportCitationLocator(value: string | ReportCitationLocator): ReportCitationLocator {
  if (typeof value !== 'string') {
    if (value.kind === 'pdf') {
      if (!Number.isSafeInteger(value.page) || value.page < 1) fail('INVALID_PDF_PAGE');
      return { kind: 'pdf', page: value.page, fragment: value.fragment === null ? null : normalizeQuote(value.fragment, 'PDF_FRAGMENT') };
    }
    if (value.kind === 'xlsx') {
      if (!value.sheet || !value.cell) fail('INVALID_XLSX_LOCATOR');
      return { kind: 'xlsx', sheet: value.sheet, cell: value.cell };
    }
    if (value.kind === 'json-pointer') {
      if (!value.pointer.startsWith('/') || value.pointer.includes('\n')) fail('INVALID_JSON_POINTER');
      return { kind: 'json-pointer', pointer: value.pointer };
    }
    if (value.kind === 'source-locator') {
      return { kind: 'source-locator', value: normalizeQuote(value.value, 'SOURCE_LOCATOR') };
    }
    fail('UNKNOWN_LOCATOR_KIND');
  }
  if (value.length === 0 || value.trim() !== value || value.length > 2_000) fail('INVALID_LOCATOR');
  if (value.startsWith('/')) return { kind: 'json-pointer', pointer: value };
  const xlsx = /^([^!\r\n]+)!((?:\$?[A-Z]{1,3}\$?[1-9][0-9]*)(?::(?:\$?[A-Z]{1,3}\$?[1-9][0-9]*))?)$/.exec(value);
  if (xlsx) return { kind: 'xlsx', sheet: xlsx[1]!, cell: xlsx[2]! };
  const pdf = /^(?:pdf(?:\s*[:/#]\s*)?)?(?:page|p)\s*[:=#-]?\s*([1-9][0-9]*)(?:\s*[#:]\s*(.*))?$/iu.exec(value);
  if (pdf) return { kind: 'pdf', page: Number(pdf[1]), fragment: pdf[2] === undefined ? null : normalizeQuote(pdf[2], 'PDF_FRAGMENT') };
  return { kind: 'source-locator', value };
}

function pointerToken(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolvePointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) fail('INVALID_JSON_POINTER');
  let current: unknown = root;
  for (const token of pointer.slice(1).split('/').map(pointerToken)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) fail(`UNRESOLVABLE_POINTER:${pointer}`);
      const index = Number(token);
      if (index >= current.length) fail(`UNRESOLVABLE_POINTER:${pointer}`);
      current = current[index];
    } else if (current !== null && typeof current === 'object' && token in current) {
      current = (current as Record<string, unknown>)[token];
    } else {
      fail(`UNRESOLVABLE_POINTER:${pointer}`);
    }
  }
  return current;
}

function assertFile(bundle: SourceBackedReportBundle, logicalPath: string, expectedSha256: string): Buffer {
  const bytes = bundle.files.get(logicalPath);
  if (!bytes) fail(`MISSING_ARTIFACT:${logicalPath}`);
  if (SHA256(bytes) !== expectedSha256) fail(`ARTIFACT_DIGEST_MISMATCH:${logicalPath}`);
  return bytes;
}

function artifact(
  bundle: SourceBackedReportBundle,
  kind: ReportCitationArtifact['kind'],
  logicalPath: string,
  expectedSha256: string,
): ReportCitationArtifact {
  assertDigest(expectedSha256, logicalPath);
  assertFile(bundle, logicalPath, expectedSha256);
  return { kind, logicalPath, sha256: expectedSha256 };
}

function retainedSources(bundle: SourceBackedReportBundle): Map<string, RetainedSource> {
  const sources = new Map<string, RetainedSource>();
  const mappings = bundle.envelope.rawByteMappings;
  for (const selected of bundle.envelope.selectedSources) {
    assertDigest(selected.sha256, 'source');
    const matches = mappings.filter(mapping => mapping.packageId === bundle.envelope.sourcePackage.packageId &&
      mapping.logicalPath === selected.logicalPath && mapping.exportPath === selected.exportPath &&
      mapping.packageFileSha256 === selected.sha256 && mapping.rawByteSha256 === selected.sha256);
    if (matches.length > 1) fail(`AMBIGUOUS_SOURCE:${selected.sha256}`);
    const mapping = matches[0];
    if (!mapping) continue;
    const bytes = bundle.files.get(mapping.exportPath);
    if (!bytes || SHA256(bytes) !== selected.sha256 || SHA256(bytes) !== mapping.rawByteSha256) {
      fail(`SOURCE_BYTES_MISMATCH:${selected.sha256}`);
    }
    const source: ReportCitationSource = {
      sourceSha256: selected.sha256,
      packageId: bundle.envelope.sourcePackage.packageId,
      logicalPath: selected.logicalPath,
      exportPath: selected.exportPath,
      label: selected.logicalPath,
      role: selected.role,
    };
    const existing = sources.get(selected.sha256);
    if (existing && canonicalJson(existing.metadata) !== canonicalJson(source)) fail(`AMBIGUOUS_SOURCE:${selected.sha256}`);
    sources.set(selected.sha256, { metadata: source, bytes: Buffer.from(bytes) });
  }
  return sources;
}

function sourceForReference(sourceSha256: string, sources: ReadonlyMap<string, RetainedSource>): RetainedSource {
  assertDigest(sourceSha256, 'source');
  const source = sources.get(sourceSha256);
  if (!source) fail(`SOURCE_NOT_RETAINED:${sourceSha256}`);
  return source;
}

function claimSourceRefs(
  claim: FactObservation,
  result: SourceBackedReportBundle['result'],
): readonly { readonly sourceSha256: string; readonly locator: string }[] {
  const membership = resolvePointer(result, claim.membershipPointer);
  if (!Array.isArray(membership) || membership.some(value => !Number.isSafeInteger(value))) fail(`CLAIM_MEMBERSHIP_NOT_EXACT:${claim.claimId}`);
  const refs: { sourceSha256: string; locator: string }[] = [];
  for (const index of membership as number[]) {
    const record = result.input.records[index];
    if (!record) fail(`CLAIM_MEMBERSHIP_NOT_FOUND:${claim.claimId}`);
    if (claim.statementKind === 'OBSERVED_REVENUE' || claim.statementKind === 'TOP_SHOP_SHARE') refs.push(record.revenue.source);
    else if (claim.statementKind === 'OBSERVED_UNITS') refs.push(record.units.source);
    else refs.push(record.source);
  }
  return refs;
}

function claimDrafts(
  claim: FactObservation,
  bundle: SourceBackedReportBundle,
  semanticVersionId: string,
  resultArtifact: ReportCitationArtifact,
  sources: ReadonlyMap<string, RetainedSource>,
  limitations: Set<string>,
): CitationDraft[] {
  const actual = resolvePointer(bundle.result, claim.metricPointer);
  if (canonicalJson(actual) !== canonicalJson(claim.value)) fail(`CLAIM_VALUE_MISMATCH:${claim.claimId}`);
  const drafts: CitationDraft[] = [{
    semanticVersionId,
    role: 'CALCULATION',
    artifact: resultArtifact,
    source: null,
    locator: normalizeReportCitationLocator(claim.metricPointer),
    quote: null,
    quoteVerification: 'NONE',
  }];
  for (const ref of claimSourceRefs(claim, bundle.result)) {
    const retained = sources.get(ref.sourceSha256);
    if (!retained) {
      limitations.add('RAW_SOURCE_BYTES_NOT_RETAINED_FOR_ALL_CLAIM_LINEAGE');
      continue;
    }
    drafts.push({
      semanticVersionId,
      role: 'SOURCE_EVIDENCE',
      artifact: { kind: 'source', logicalPath: retained.metadata.exportPath, sha256: retained.metadata.sourceSha256 },
      source: retained.metadata,
      locator: normalizeReportCitationLocator(ref.locator),
      quote: null,
      quoteVerification: 'NONE',
    });
  }
  return drafts;
}

function candidateDraft(
  candidate: ReportCitationQuoteCandidate,
  semanticVersionId: string,
  sources: ReadonlyMap<string, RetainedSource>,
  verifier: ReportCitationQuoteVerifier | undefined,
  role: Extract<ReportCitationEntry['role'], 'SOURCE_EVIDENCE' | 'RETRIEVAL_CANDIDATE'>,
): CitationDraft {
  const retained = sourceForReference(candidate.sourceSha256, sources);
  const locator = normalizeReportCitationLocator(candidate.locator);
  if (candidate.provider === 'pageindex' && !verifier) fail('PAGEINDEX_QUOTE_NOT_VERIFIED');
  let quote: string | null = null;
  let quoteVerification: 'NONE' | 'EXTERNAL_VERIFIER_ATTESTED' = 'NONE';
  if (candidate.quote !== undefined || candidate.provider === 'pageindex') {
    if (!verifier) fail('QUOTE_NOT_VERIFIED');
    const verified = verifier(candidate, { metadata: retained.metadata, bytes: retained.bytes });
    if (!verified) fail('QUOTE_NOT_VERIFIED');
    quote = normalizeQuote(verified.quote, 'QUOTE');
    if (verified.sourceSha256 !== candidate.sourceSha256) fail('QUOTE_SOURCE_MISMATCH');
    if (locatorKey(normalizeReportCitationLocator(verified.locator)) !== locatorKey(locator)) fail('QUOTE_LOCATOR_MISMATCH');
    // The adapter checks identity echoes only. It does not parse PDF/XLSX
    // bytes itself, so the status intentionally names the external attestor.
    quoteVerification = 'EXTERNAL_VERIFIER_ATTESTED';
  }
  return {
    semanticVersionId,
    role,
    artifact: { kind: 'source', logicalPath: retained.metadata.exportPath, sha256: retained.metadata.sourceSha256 },
    source: retained.metadata,
    locator,
    quote,
    quoteVerification,
  };
}

function matchesClaimSourceLineage(
  candidate: ReportCitationQuoteCandidate,
  claim: FactObservation,
  result: SourceBackedReportBundle['result'],
): boolean {
  const locator = locatorKey(normalizeReportCitationLocator(candidate.locator));
  return claimSourceRefs(claim, result).some(ref => ref.sourceSha256 === candidate.sourceSha256 &&
    locatorKey(normalizeReportCitationLocator(ref.locator)) === locator);
}

function draftKey(draft: CitationDraft): string {
  return canonicalJson({
    semanticVersionId: draft.semanticVersionId,
    role: draft.role,
    artifact: draft.artifact,
    source: draft.source,
    locator: draft.locator,
    quote: draft.quote,
    quoteVerification: draft.quoteVerification,
  });
}

function buildReferenceIds(
  requested: readonly (string | { readonly referenceId: string })[] | undefined,
  claims: readonly FactObservation[],
): readonly SelectedReference[] {
  const available = new Map(claims.map(claim => [claim.claimId, claim]));
  const ids = requested === undefined ? claims.map(claim => claim.claimId) : requested.map(value => typeof value === 'string' ? value : value.referenceId);
  if (new Set(ids).size !== ids.length) fail('DUPLICATE_REFERENCE_ID');
  return ids.map(referenceId => {
    const claim = available.get(referenceId);
    if (!claim) fail(`UNKNOWN_REFERENCE_ID:${referenceId}`);
    return { referenceId, claim };
  });
}

/**
 * Builds a deterministic numbered citation view from one exact report bundle.
 * References are claim IDs (the only model-facing selectors in this slice);
 * unknown IDs, stale IDs and unverified retrieval candidates fail closed.
 */
export function buildReportCitationProjection(options: {
  readonly bundle: SourceBackedReportBundle;
  /** Must match canonical semantic-content.json, its payload hash and this
   * bundle's source/calculation layers. The owner verifies outer extensions. */
  readonly semanticVersionId?: string;
  readonly references?: readonly (string | { readonly referenceId: string })[];
  readonly candidates?: readonly ReportCitationQuoteCandidate[];
  readonly quoteVerifier?: ReportCitationQuoteVerifier;
}): ReportCitationProjection {
  const semantic = buildReportSemanticContent(options.bundle).content;
  const semanticVersionId = options.semanticVersionId ?? semantic.semanticVersionId;
  assertDigest(semanticVersionId, 'semantic_version');
  if (options.semanticVersionId !== undefined) {
    const bytes = options.bundle.files.get('semantic-content.json');
    if (!bytes) fail('SEMANTIC_CONTENT_MISSING');
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { fail('SEMANTIC_CONTENT_INVALID'); }
    if (!content || typeof content !== 'object' || Array.isArray(content)) fail('SEMANTIC_CONTENT_INVALID');
    const { semanticVersionId: storedId, ...payload } = content;
    if (!bytes.equals(Buffer.from(`${canonicalJson(content)}\n`, 'utf8')) ||
        storedId !== semanticVersionId ||
        SHA256(Buffer.from(canonicalJson(payload), 'utf8')) !== semanticVersionId ||
        canonicalJson(content.sourceLayer) !== canonicalJson(semantic.sourceLayer) ||
        canonicalJson(content.calculationLayer) !== canonicalJson(semantic.calculationLayer)) {
      fail('SEMANTIC_CONTENT_BINDING_MISMATCH');
    }
  }
  const bundle = options.bundle;
  const resultArtifact = artifact(bundle, 'calculation', 'metric-result.json', bundle.envelope.artifacts.metricResultSha256);
  artifact(bundle, 'calculation', 'packet.json', bundle.envelope.artifacts.packetSha256);
  artifact(bundle, 'report', 'report.md', bundle.envelope.artifacts.reportSha256);
  // Packet IDs are owned by A3; this adapter carries the exact supplied ID
  // and never recomputes or selects a latest packet.
  if (!bundle.packet.packetId || !DIGEST.test(bundle.packet.packetId)) fail('INVALID_PACKET_ID');
  const sourceMap = retainedSources(bundle);
  const selected = buildReferenceIds(options.references, bundle.packet.claims);
  const candidates = options.candidates ?? [];
  const selectedSet = new Set(selected.map(item => item.referenceId));
  const limitations = new Set<string>([
    'PRESENTATION_PROJECTION_ONLY;_NOT_SOURCE_TRUTH',
    'AI_INTERPRETATION_AND_HUMAN_DECISIONS_REMAIN_SEPARATE',
    'QUOTE_TEXT_REQUIRES_EXTERNAL_VERIFIER_ATTESTATION',
  ]);
  const draftsByReference = new Map<string, CitationDraft[]>();
  for (const item of selected) draftsByReference.set(item.referenceId,
    claimDrafts(item.claim!, bundle, semanticVersionId, resultArtifact, sourceMap, limitations));

  const candidateDrafts = new Map<string, CitationDraft[]>();
  for (const candidate of candidates) {
    if (!selectedSet.has(candidate.referenceId)) fail(`CANDIDATE_REFERENCE_NOT_SELECTED:${candidate.referenceId}`);
    if (candidate.referenceId !== candidate.referenceId.trim() || candidate.referenceId.length === 0) fail('INVALID_CANDIDATE_REFERENCE_ID');
    const claim = selected.find(item => item.referenceId === candidate.referenceId)?.claim;
    if (!claim) fail(`UNKNOWN_CANDIDATE_REFERENCE_ID:${candidate.referenceId}`);
    const role = matchesClaimSourceLineage(candidate, claim, bundle.result) ? 'SOURCE_EVIDENCE' : 'RETRIEVAL_CANDIDATE';
    const draft = candidateDraft(candidate, semanticVersionId, sourceMap, options.quoteVerifier, role);
    const list = candidateDrafts.get(candidate.referenceId) ?? [];
    list.push(draft);
    candidateDrafts.set(candidate.referenceId, list);
  }

  const allDrafts = [...draftsByReference.values(), ...candidateDrafts.values()].flat();
  const uniqueDrafts = [...new Map(allDrafts.map(draft => [draftKey(draft), draft])).values()]
    .sort((left, right) => codeUnitCompare(draftKey(left), draftKey(right)));
  const numberByKey = new Map(uniqueDrafts.map((draft, index) => [draftKey(draft), index + 1]));
  const citations = uniqueDrafts.map((draft, index): ReportCitationEntry => ({
    number: index + 1,
    citationId: `C${index + 1}`,
    reportSemanticVersionId: semanticVersionId,
    role: draft.role,
    artifact: draft.artifact,
    source: draft.source,
    locator: draft.locator,
    quote: draft.quote,
    quoteVerification: draft.quoteVerification,
  }));
  const refs = selected.map(item => {
    const claimDraft = draftsByReference.get(item.referenceId) ?? [];
    const candidate = candidateDrafts.get(item.referenceId) ?? [];
    const calc = claimDraft.filter(draft => draft.artifact.logicalPath === 'metric-result.json').map(draft => numberByKey.get(draftKey(draft))!);
    const source = [...claimDraft, ...candidate].filter(draft => draft.role === 'SOURCE_EVIDENCE').map(draft => numberByKey.get(draftKey(draft))!);
    const candidateNumbers = candidate.map(draft => numberByKey.get(draftKey(draft))!);
    return {
      referenceId: item.referenceId,
      claimId: item.claim?.claimId ?? null,
      citationNumbers: [...new Set([...calc, ...source])].sort((a, b) => a - b),
      calculationCitationNumbers: [...new Set(calc)].sort((a, b) => a - b),
      sourceCitationNumbers: [...new Set(source)].sort((a, b) => a - b),
      candidateCitationNumbers: [...new Set(candidateNumbers)].sort((a, b) => a - b),
    } satisfies ReportCitationReference;
  }).sort((left, right) => codeUnitCompare(left.referenceId, right.referenceId));
  const envelopeSha256 = SHA256(bundle.envelopeBytes);
  assertDigest(bundle.envelope.artifacts.packetSha256, 'packet');
  return {
    contractVersion: 'report-citations-v1',
    report: {
      semanticVersionId,
      packetId: bundle.packet.packetId,
      packetSha256: bundle.envelope.artifacts.packetSha256,
      reportSha256: bundle.envelope.artifacts.reportSha256,
      envelopeSha256,
      sourcePackageId: bundle.envelope.sourcePackage.packageId,
      sourcePackageManifestSha256: bundle.envelope.sourcePackage.manifestArtifactSha256,
      workspaceId: bundle.envelope.workspace.workspaceId,
      workspaceSnapshotSha256: bundle.envelope.workspace.snapshotSha256,
    },
    citations,
    references: refs,
    retainedReferenceIds: [...new Set(bundle.packet.claims.map(claim => claim.claimId))].sort(),
    limitations: [...limitations].sort(),
  };
}

/** Alias kept explicit for callers that describe this as a preview adapter. */
export const buildReportCitationPreview = buildReportCitationProjection;
export const projectReportCitations = buildReportCitationProjection;

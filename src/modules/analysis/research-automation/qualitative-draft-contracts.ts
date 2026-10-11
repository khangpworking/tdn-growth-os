import { createRequire } from 'node:module';
import type { Ajv2020 as AjvType } from 'ajv/dist/2020.js';
import schema from '../../../../contracts/analysis/automation-qualitative-draft-v1.schema.json' with { type: 'json' };
import type {
  AutomationQualitativeDraft,
  QualitativeDraftBinding,
  QualitativeDraftClassification,
  QualitativeDraftEvidenceCard,
  QualitativeDraftLocator,
  QualitativeDraftQuote,
  QualitativeDraftSourceIdentity,
  QualitativeDraftSourceRecord,
} from '../../../../contracts/analysis/automation-qualitative-draft-v1.generated.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import type { TikTokCommentCorpus } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema(schema);
const validateDraft = ajv.compile<AutomationQualitativeDraft>({ $ref: schema.$id + '#/$defs/draft' });

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const digest = /^[a-f0-9]{64}$/;

export interface QualitativeSourceBoundary {
  readonly binding: QualitativeDraftBinding;
  readonly source: QualitativeDraftSourceIdentity;
  readonly records: readonly QualitativeDraftSourceRecord[];
}

export class QualitativeDraftContractError extends TypeError {
  constructor(message = 'Invalid source-bound qualitative draft.') {
    super(message);
    this.name = 'QualitativeDraftContractError';
  }
}

export function registerQualitativeDraftSchema(ajvInstance: AjvType): void {
  if (!ajvInstance.getSchema(schema.$id)) ajvInstance.addSchema(schema);
}

export function qualitativeDraftValid(value: unknown): value is AutomationQualitativeDraft {
  return validateDraft(value);
}

function fail(message = 'INVALID_QUALITATIVE_DRAFT'): never { throw new QualitativeDraftContractError(message); }

function checkLocator(value: unknown): asserts value is QualitativeDraftLocator {
  if (!value || typeof value !== 'object' || !digest.test((value as QualitativeDraftLocator).pageSha256)) fail();
}

function checkQuote(value: QualitativeDraftQuote, source: ReadonlyMap<number, QualitativeDraftSourceRecord>, members?: ReadonlySet<number>): void {
  const row = source.get(value.recordIndex);
  checkLocator(value.locator);
  if (!row || row.recordId !== value.recordId || !same(row.locator, value.locator) || members && !members.has(value.recordIndex) ||
    row.admission !== 'INCLUDED' || row.text === null || value.start >= value.end || value.end > row.text.length ||
    row.text.slice(value.start, value.end) !== value.text) fail('QUALITATIVE_QUOTE_NOT_IN_RETAINED_SOURCE');
  // Offsets are JavaScript UTF-16 offsets; never retain a half-surrogate span.
  for (const offset of [value.start, value.end]) if (offset > 0 && offset < row.text.length &&
    /[\uD800-\uDBFF]/.test(row.text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(row.text[offset]!)) fail('QUALITATIVE_QUOTE_SPLITS_CODE_POINT');
}

function checkAttribute(attribute: { quotes: readonly QualitativeDraftQuote[]; value: string }, source: ReadonlyMap<number, QualitativeDraftSourceRecord>, members: ReadonlySet<number>, literal = true): void {
  if (attribute.quotes.length === 0 || literal && !attribute.quotes.some(quote => quote.text === attribute.value)) fail('QUALITATIVE_ATTRIBUTE_UNSUPPORTED');
  for (const quote of attribute.quotes) checkQuote(quote, source, members);
}

function expectedCounts(source: QualitativeSourceBoundary, classifications: readonly QualitativeDraftClassification[]) {
  const included = source.records.filter(row => row.admission === 'INCLUDED').length;
  const excluded = source.records.filter(row => row.admission === 'EXCLUDED').length;
  const unclear = source.records.filter(row => row.admission === 'UNCLEAR').length;
  const classified = classifications.filter(row => row.status === 'CLASSIFIED').length;
  return { included, excluded, unclear, classified, unclassified: included - classified };
}

/**
 * Structural schema validation is deliberately followed by source replay. The
 * caller supplies a source boundary already authenticated by Foundation/P9;
 * this function only authenticates exact bytes, membership and semantic closure.
 */
export function checkQualitativeDraft(value: unknown, boundary: QualitativeSourceBoundary): AutomationQualitativeDraft {
  if (!validateDraft(value)) fail();
  const draft = value;
  if (!same(draft.binding, boundary.binding) || !same(draft.source, boundary.source) || draft.records.length !== boundary.records.length ||
    draft.policy.status !== 'PROPOSED_AWAITING_REVIEW' || draft.policy.reliability.state !== 'UNAVAILABLE' ||
    draft.policy.reliability.code !== 'U11_STATISTIC_UNAVAILABLE' || draft.policy.releaseEligibility !== 'UNAVAILABLE' ||
    draft.policy.mainConclusionUse !== 'EXCLUDED') fail('QUALITATIVE_POLICY_MISMATCH');
  const source = new Map<number, QualitativeDraftSourceRecord>();
  for (const [index, row] of boundary.records.entries()) {
    const candidate = draft.records[index];
    if (!candidate || candidate.recordIndex !== index || !same(candidate, row)) fail('QUALITATIVE_SOURCE_REPLAY_MISMATCH');
    if (source.has(candidate.recordIndex)) fail('QUALITATIVE_DUPLICATE_RECORD');
    source.set(candidate.recordIndex, candidate);
  }
  const classifications = new Map<number, QualitativeDraftClassification>();
  for (const classification of draft.classifications) {
    const row = source.get(classification.recordIndex);
    if (!row || classifications.has(classification.recordIndex) || row.recordId !== classification.recordId) fail('QUALITATIVE_CLASSIFICATION_MEMBERSHIP_MISMATCH');
    if (row.admission !== 'INCLUDED') fail('QUALITATIVE_NON_CUSTOMER_CLASSIFIED');
    classifications.set(classification.recordIndex, classification);
    if (classification.status === 'CLASSIFIED') {
      if (!['HIGH', 'MEDIUM'].includes(classification.confidence) || !classification.situation || !classification.journey ||
        !classification.topic || !classification.statedSentiment || classification.uncertainty !== null || classification.quotes.length === 0) fail('QUALITATIVE_CLASSIFICATION_NOT_CONFIDENT');
    } else {
      if (!['LOW', 'AMBIGUOUS', 'UNAVAILABLE'].includes(classification.confidence) || classification.situation !== null ||
        classification.journey !== null || classification.topic !== null || classification.statedSentiment !== null || !classification.uncertainty) fail('QUALITATIVE_UNCLASSIFIED_STATE_MISMATCH');
    }
    for (const quote of classification.quotes) checkQuote(quote, source);
  }
  const eligibleIndexes = boundary.records.filter(row => row.admission === 'INCLUDED').map(row => row.recordIndex);
  if (!same([...classifications.keys()].sort((a, b) => a - b), eligibleIndexes)) fail('QUALITATIVE_CLASSIFICATION_COVERAGE_MISMATCH');
  if (!same(draft.counts, expectedCounts(boundary, draft.classifications))) fail('QUALITATIVE_COUNTS_MISMATCH');

  const cards = new Map<string, QualitativeDraftEvidenceCard>();
  for (const card of draft.cards) {
    if (cards.has(card.cardId)) fail('QUALITATIVE_DUPLICATE_CARD');
    const members = new Set(card.recordIndexes);
    if (members.size !== card.recordIndexes.length || card.quotes.length < 2 || new Set(card.quotes.map(quote => quote.recordIndex)).size < 2 ||
      [...members].some(index => classifications.get(index)?.status !== 'CLASSIFIED')) fail('QUALITATIVE_CARD_MEMBERSHIP_MISMATCH');
    for (const quote of card.quotes) checkQuote(quote, source, members);
    checkAttribute(card.situation, source, members);
    if (card.journey) checkAttribute(card.journey, source, members, false);
    for (const attribute of card.attributes) checkAttribute(attribute, source, members);
    if (card.authorEvidence === 'VERIFIED_DISTINCT_AUTHORS') {
      const authors = [...members].map(index => source.get(index)!.author).filter(author => author.state === 'VERIFIED_HASHED');
      if (authors.length !== members.size || new Set(authors.map(author => author.hash)).size < 2) fail('QUALITATIVE_AUTHOR_PROOF_MISMATCH');
    } else if (!/chưa xác minh|not verified|UNAVAILABLE|không có/i.test(card.identityLimitation)) fail('QUALITATIVE_IDENTITY_LIMITATION_MISSING');
    cards.set(card.cardId, card);
  }
  return draft;
}

const authorState = (value: { state: 'HASHED' | 'MISSING' | 'INVALID'; hash: string | null }): QualitativeDraftSourceRecord['author'] =>
  value.state === 'HASHED' && value.hash && digest.test(value.hash) ? { state: 'VERIFIED_HASHED', hash: value.hash } :
    { state: value.state === 'INVALID' ? 'INVALID' : value.state === 'MISSING' ? 'MISSING' : 'UNAVAILABLE', hash: null };

export function qualitativeShopeeSource(view: PrivateReviewReportView, binding: QualitativeDraftBinding): QualitativeSourceBoundary {
  const source: QualitativeDraftSourceIdentity = { platform: 'SHOPEE', sourceType: 'S05_LOCATED_REVIEW', sourceSha256: view.corpus.artifactSha256,
    sourcePackageId: null, sourceManifestSha256: null, sourceContentSha256: null };
  const records = view.records.map((row, recordIndex): QualitativeDraftSourceRecord => ({ recordIndex, recordId: row.recordId,
    text: row.text, locator: { owner: row.locator.collectionId, pageSha256: row.locator.pageSha256, pageIndex: row.locator.pageIndex,
      rowIndex: row.locator.rowIndex, textPointer: row.locator.textPointer }, sourceHash: row.locator.pageSha256, author: { state: 'UNAVAILABLE', hash: null },
    admission: row.admission === 'SELECTED_TEXT' && row.textState === 'READABLE' ? 'INCLUDED' : row.admission === 'NO_READABLE_TEXT' ? 'UNCLEAR' : 'EXCLUDED',
    admissionReason: row.admission === 'SELECTED_TEXT' && row.textState === 'READABLE' ? null : row.admission }));
  return { binding, source, records };
}

export function qualitativeTikTokSource(corpus: TikTokCommentCorpus, corpusSha256: string, binding: QualitativeDraftBinding, packageIdentity: {
  packageId: string; manifestArtifactSha256: string; packageContentSha256: string;
}): QualitativeSourceBoundary {
  const source: QualitativeDraftSourceIdentity = { platform: 'TIKTOK', sourceType: 'S07_TIKTOK_COMMENT', sourceSha256: corpusSha256,
    sourcePackageId: packageIdentity.packageId, sourceManifestSha256: packageIdentity.manifestArtifactSha256, sourceContentSha256: packageIdentity.packageContentSha256 };
  const records = corpus.records.map((row, recordIndex): QualitativeDraftSourceRecord => {
    const ref = row.versions[0]?.sourceRefs[0]; if (!ref) fail('QUALITATIVE_TIKTOK_SOURCE_REFERENCE_MISSING');
    return { recordIndex, recordId: row.recordId, text: row.text, locator: { owner: row.videoUrl, pageSha256: ref.pageSha256,
      pageIndex: ref.pageIndex, rowIndex: ref.rowIndex, textPointer: ref.textPointer }, sourceHash: ref.pageSha256, author: authorState(row.authorIdentity),
      admission: row.disposition, admissionReason: row.dispositionReason };
  });
  if (!digest.test(source.sourceSha256)) fail('QUALITATIVE_TIKTOK_SOURCE_DIGEST_REQUIRED');
  return { binding, source, records };
}

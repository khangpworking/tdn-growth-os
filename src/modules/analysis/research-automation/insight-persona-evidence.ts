import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import locatedSchema from '../../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import type { AutomationPrivateShopeeSource } from '../../../../contracts/analysis/automation-private-shopee-source.generated.js';
import type { PrivateShopeeCollectionReader, VerifiedPrivateShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { privateReviewCorpus, privateReviewReportView } from './private-review-contracts.js';
import { buildPrivateReviewReportView, readPrivateReviewCollection, verifyPrivateReviewCorpus, type PrivateReviewBinding } from './private-review-corpus.js';

type Input = LocatedInsightMethods['input'];
type Span = Input['i04'][number]['span'];
/** Provisional pure selection using existing canonical quote/locator types, never a wire/persisted contract. */
export type PersonaQuoteSelection = Pick<Input['i04'][number], 'recordIndex' | 'span'> &
  Pick<PrivateReviewReportView['records'][number], 'recordId' | 'locator'>;
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
ajv.addSchema(locatedSchema);
const spanValid = ajv.compile<Span>({ $ref: `${locatedSchema.$id}#/$defs/span` });
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function fail(code: string): never { throw new TypeError(`INVALID_INSIGHT_PERSONA_EVIDENCE:${code}`); }

/**
 * Source-first read-only evidence handle. Its caller must authenticate the frozen
 * run/report selection. Existing Foundation/corpus/view owners verify retention;
 * private identities stay in closures, not the model/public projection. This
 * proves source membership and minimums, never semantic truth, approval or U11
 * release. S07 is unsupported until its reviewed owning source is integrated.
 */
export async function readPrivatePersonaEvidence(input: {
  reader: PrivateShopeeCollectionReader; retainedCorpus: unknown; retainedView: unknown; corpusSha256: string;
  binding: PrivateReviewBinding; request: VerifiedPrivateShopeeCollection['request']; marker: AutomationPrivateShopeeSource;
}) {
  const { reader, ...selection } = input;
  const frozen = structuredClone(selection);
  const retained = privateReviewCorpus(frozen.retainedCorpus);
  if (hash(retained) !== frozen.corpusSha256) fail('CORPUS_DIGEST_MISMATCH');
  const source = await readPrivateReviewCollection(reader, retained.collection, frozen.request, frozen.marker);
  const corpus = verifyPrivateReviewCorpus(retained, source, frozen.binding);
  const view = privateReviewReportView(frozen.retainedView);
  if (!same(view, buildPrivateReviewReportView(corpus))) fail('VIEW_REPLAY_MISMATCH');
  const firstUnits = new Map<string, { fingerprint: string; recordIndex: number }>();
  const records = view.records.map((record, recordIndex) => {
    const native = corpus.projection.records[recordIndex]!;
    const key = native.reviewId === null ? canonicalJson(['locator', record.locator.pageSha256, record.locator.textPointer])
      : canonicalJson(['native', native.reviewId]);
    const fingerprint = canonicalJson({ shopId: native.shopId, itemId: native.itemId, comment: native.comment,
      createdAt: native.createdAt, rating: native.rating, region: native.region,
      authorIdentity: native.authorIdentity, admission: native.admission });
    const first = firstUnits.get(key);
    if (first && first.fingerprint !== fingerprint) fail('SOURCE_NATIVE_IDENTITY_CONFLICT');
    if (!first) firstUnits.set(key, { fingerprint, recordIndex });
    const disposition = first ? 'EXCLUDED' as const : record.text === null ? 'UNREADABLE' as const
      : record.admission === 'SELECTED_TEXT' ? 'INCLUDED' as const : 'EXCLUDED' as const;
    return { recordIndex, recordId: record.recordId, locator: record.locator, text: record.text, rating: record.rating,
      sourceProduct: { shopId: record.shopId, itemId: record.itemId },
      sourceDate: { literal: record.createdAt, eligibility: 'UNKNOWN' as const }, disposition,
      exclusionReason: first ? 'SOURCE_NATIVE_ALIAS' : disposition === 'INCLUDED' ? null : record.admission,
      aliasOfRecordIndex: first?.recordIndex ?? null };
  });
  const eligibleIndexes = records.filter(record => record.disposition === 'INCLUDED').map(record => record.recordIndex);
  const eligible = new Set(eligibleIndexes);
  // Fallback is a property of the whole admitted source, not a model-selected
  // subset. Known repeated hashes or invalid/mixed identity cannot evade E4.
  const identityAbsent = eligibleIndexes.length > 0 && eligibleIndexes.every(index =>
    corpus.projection.records[index]!.authorIdentity.state === 'MISSING');
  const publicSource = { evidenceVersion: 'persona-private-source-evidence-v1' as const,
    binding: corpus.binding, corpus: view.corpus, viewSha256: hash(view), platform: 'SHOPEE' as const, sourceType: 'S05' as const,
    capture: { ...view.capture, stopReason: source.packet.actor.stopReason }, records, eligibleRecordIndexes: eligibleIndexes,
    // P7-03: bounded taxonomy preparation only. Source-order sampling is
    // explicit and not random or representative of a wider population.
    taxonomySample: { version: 'retained-source-order-first-300-v1' as const, recordIndexes: eligibleIndexes.slice(0, 300) },
    sourceDateEligibility: 'UNKNOWN' as const,
    limits: ['UNDATED_QUALITATIVE_CONTEXT_ONLY', 'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA',
      'SOURCE_REPORTED_AUTHORS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE', 'NO_CROSS_PLATFORM_JOIN_OR_SUM', 'U11_RELEASE_UNAVAILABLE'] };

  function quote(selection: PersonaQuoteSelection) {
    const index = selection.recordIndex;
    if (!Number.isSafeInteger(index) || !eligible.has(index)) fail('QUOTE_RECORD_NOT_ELIGIBLE');
    const record = records[index]!;
    if (record.recordId !== selection.recordId || !same(record.locator, selection.locator)) fail('QUOTE_SOURCE_BINDING_MISMATCH');
    const span = selection.span;
    if (!spanValid(span) || span.start >= span.end || span.end > record.text!.length ||
      record.text!.slice(span.start, span.end) !== span.quote) fail('QUOTE_SPAN_MISMATCH');
    for (const offset of [span.start, span.end]) if (offset > 0 && offset < record.text!.length &&
      /[\uD800-\uDBFF]/.test(record.text![offset - 1]!) && /[\uDC00-\uDFFF]/.test(record.text![offset]!)) fail('QUOTE_SPLITS_SURROGATE_PAIR');
    // Display always has the full unchanged record as well as the selected span;
    // a substring alone cannot hide negation, qualifiers or contrary evidence.
    return structuredClone({ recordIndex: index, recordId: record.recordId, locator: record.locator,
      text: record.text!, selectedSpan: span, sourceDate: record.sourceDate });
  }
  function authorMinimum(indexes: readonly number[], minimum: number) {
    const hashes = new Set(indexes.flatMap(index => {
      const author = corpus.projection.records[index]!.authorIdentity;
      return author.state === 'HASHED' ? [author.hash!] : [];
    }));
    if (hashes.size >= minimum) return 'MET_WITH_SOURCE_AUTHOR_PROOF' as const;
    if (identityAbsent && new Set(indexes.map(index => records[index]!.text!)).size >= minimum)
      return 'MET_WITH_DISTINCT_CONTENT_FALLBACK' as const;
    return 'INSUFFICIENT' as const;
  }
  function card(selections: readonly PersonaQuoteSelection[]) {
    const quotes = selections.map(quote);
    const indexes = [...new Set(quotes.map(row => row.recordIndex))];
    const authorEvidence = authorMinimum(indexes, 2); // P7-05, never a people inference from contents.
    const eligible = indexes.length >= 2 && authorEvidence !== 'INSUFFICIENT';
    const canonicalSelections = quotes.map(row => [row.recordIndex, row.selectedSpan.start, row.selectedSpan.end]).sort((a, b) =>
      a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!);
    return { cardId: hash(['persona-card-source-members-v1', view.corpus.artifactSha256,
      [...new Set(canonicalSelections.map(canonicalJson))]]), eligible, quotes, recordIndexes: indexes,
      authorEvidence, identityLimitation: identityAbsent ? 'nguồn không có mã người viết; chưa xác minh là 5 người' as const : null };
  }
  function persona(cards: readonly (readonly PersonaQuoteSelection[])[]) {
    const evaluated = cards.map(card);
    const distinctCards = [...new Map(evaluated.map(row => [row.cardId, row])).values()].filter(row => row.eligible);
    const indexes = [...new Set(distinctCards.flatMap(row => row.recordIndexes))];
    const authorEvidence = authorMinimum(indexes, 5); // Ultimate E4.
    const products = new Set(indexes.map(index => canonicalJson(records[index]!.sourceProduct)));
    const broaderScopeEligible = products.size >= 3; // Ultimate §6.3, not title/brand guessing.
    const blockers = [...(distinctCards.length >= 3 ? [] : ['PERSONA_REQUIRES_THREE_EVIDENCE_CARDS']),
      ...(authorEvidence === 'INSUFFICIENT' ? ['PERSONA_REQUIRES_FIVE_SOURCE_AUTHORS_OR_ABSENT_ID_CONTENTS'] : []),
      ...(broaderScopeEligible ? [] : ['PERSONA_BROADER_SCOPE_REQUIRES_THREE_SOURCE_PRODUCTS'])];
    return { eligible: blockers.length === 0, cards: distinctCards, rejectedCards: evaluated.filter(row => !row.eligible),
      recordIndexes: indexes, authorEvidence, broaderScopeEligible,
      sampleSize: { numerator: indexes.length, denominator: eligibleIndexes.length },
      sampleSizeLabel: `${indexes.length}/${eligibleIndexes.length} bản ghi trong mẫu — đề xuất, chờ chủ duyệt`,
      label: 'Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật' as const,
      identityLimitation: identityAbsent ? 'nguồn không có mã người viết; chưa xác minh là 5 người' as const : null,
      blockers, status: 'PROPOSED' as const, releaseEligibility: 'UNAVAILABLE' as const };
  }
  return { publicSource: () => structuredClone(publicSource), quote, card, persona };
}

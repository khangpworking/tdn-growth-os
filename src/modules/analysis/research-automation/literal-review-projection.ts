import type { LocatedInsightMethods, Span } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';
import type { LiteralFamily, LiteralLocatedRecordCoding, LiteralReviewPending, LiteralReviewUnit } from './literal-review-coding.js';

type Input = LocatedInsightMethods['input'];
type Candidates = LiteralLocatedRecordCoding['candidates'];
type Key = keyof Candidates;
type Candidate = Candidates[Key][number];
export type LiteralProjectionCoding = Pick<LiteralLocatedRecordCoding, 'records' | 'candidates' | 'pending'> & {
  units: { recordIndex: number; eligibility: LiteralReviewUnit['eligibility'] | 'EXCLUDED'; textFlags: 'NON_NFC_TEXT'[] }[];
};
interface CandidateReference { family: LiteralFamily; candidateIndex: number; recordIndex: number }
export interface LiteralReviewProjection {
  policyRevision: 'literal-source-bound-v1';
  candidates: Candidates;
  pending: LiteralReviewPending[];
  admitted: (CandidateReference & { spans: Span[] })[];
  blocked: (CandidateReference & { reasons: string[]; pendingIndexes: number[] })[];
  coverage: {
    recordsWithAdmittedCandidates: number;
    admittedSpans: number;
    families: Record<LiteralFamily, { admittedCandidates: number; admittedRecords: number; admittedSpans: number }>;
  };
}
const METHODS: [Key, LiteralFamily][] = [['i02', 'I02'], ['i04', 'I04'], ['i05', 'I05'], ['i07', 'I07'], ['i08', 'I08']];
const SHARED_AMBIGUITY = new Set<LiteralReviewPending['reason']>([
  'INFORMAL_OR_UNACCENTED_MARKER', 'QUESTION_SENTENCE', 'CONDITIONAL_SCOPE', 'FUTURE_OR_INTENT_SCOPE',
  'TENSE_OR_MODALITY_MIXED', 'QUOTED_TEXT_SCOPE', 'AMBIGUOUS_RESULT_LINKER', 'NEGATION_SCOPE_UNCLEAR',
]);
export class LiteralReviewProjectionError extends TypeError {}
function fail(code: string): never { throw new LiteralReviewProjectionError(code); }
function spans(value: unknown): Span[] {
  if (Array.isArray(value)) return value.flatMap(spans);
  if (!value || typeof value !== 'object') return [];
  if ('start' in value && 'end' in value && 'quote' in value) return [value as Span];
  return Object.values(value).flatMap(spans);
}
function checkSpan(text: string | null, span: Span): void {
  if (typeof text !== 'string' || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 ||
      span.start >= span.end || span.end > text.length || text.slice(span.start, span.end) !== span.quote)
    fail('LITERAL_PROJECTION_SOURCE_SPAN_MISMATCH');
  for (const offset of [span.start, span.end])
    if (offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!))
      fail('LITERAL_PROJECTION_SOURCE_SPAN_MISMATCH');
}
const overlap = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

/** Projects source-bound declarations; the caller binds the accepted authority tuple. */
export function projectLiteralReviewCandidates(unannotatedDescriptor: unknown, coding: LiteralProjectionCoding): LiteralReviewProjection {
  const descriptor = validateLocatedInsightInput(unannotatedDescriptor);
  if ([descriptor.i02, descriptor.i04, descriptor.i05, descriptor.i06, descriptor.i07, descriptor.i08, descriptor.i09,
    descriptor.corpora, descriptor.i13Mentions].some(rows => rows.length)) fail('LITERAL_PROJECTION_REQUIRE_UNANNOTATED_INPUT');
  if (canonicalJson(descriptor.records) !== canonicalJson(coding.records)) fail('LITERAL_PROJECTION_RECORDS_MISMATCH');
  const frozen = JSON.parse(canonicalJson(coding)) as LiteralProjectionCoding;
  const units = new Map(frozen.units.map(unit => [unit.recordIndex, unit]));
  if (units.size !== frozen.units.length || units.size !== descriptor.records.length ||
      frozen.units.some(unit => !Number.isInteger(unit.recordIndex) || !descriptor.records[unit.recordIndex]))
    fail('LITERAL_PROJECTION_UNITS_MISMATCH');
  const pendingByRecord = new Map<number, { row: LiteralReviewPending; pendingIndex: number }[]>();
  frozen.pending.forEach((row, pendingIndex) => {
    const record = descriptor.records[row.recordIndex];
    if (!Number.isInteger(row.recordIndex) || !record || !METHODS.some(([, family]) => row.family === family))
      fail('LITERAL_PROJECTION_PENDING_REFERENCE_INVALID');
    for (const span of [row.span, row.trigger]) if (span) checkSpan(record.text, span);
    const entries = pendingByRecord.get(row.recordIndex) ?? [];
    entries.push({ row, pendingIndex }); pendingByRecord.set(row.recordIndex, entries);
  });
  const candidates: Candidates = { i02: [], i04: [], i05: [], i07: [], i08: [] };
  const admitted: LiteralReviewProjection['admitted'] = [];
  const blocked: LiteralReviewProjection['blocked'] = [];
  for (const [key, family] of METHODS) {
    const rows: Candidate[] = frozen.candidates[key];
    // These dimensions mirror the existing Located validator's clause conflict contract.
    const dimensions = rows.map(row => {
      const record = descriptor.records[row.recordIndex];
      if (!Number.isInteger(row.recordIndex) || !record) fail('LITERAL_PROJECTION_CANDIDATE_REFERENCE_INVALID');
      if (row.provenance.basis !== 'DECLARED' || row.provenance.adjudication !== null || row.provenance.disagreement !== null ||
          typeof row.provenance.coderRole !== 'string' || !row.provenance.coderRole.trim()) fail('LITERAL_PROJECTION_PROVENANCE_INVALID');
      const readingSpans = spans(row);
      if (!readingSpans.length) fail('LITERAL_PROJECTION_SOURCE_SPAN_REQUIRED');
      for (const span of readingSpans) checkSpan(record.text, span);
      const clause = 'reasonClause' in row ? row.reasonClause : 'obstacleClause' in row ? row.obstacleClause : 'span' in row ? row.span : null;
      const dimension = clause ? canonicalJson([record.sourceSha256, record.locator, clause.start, clause.end]) : null;
      const code = 'polarity' in row ? canonicalJson([row.polarity, row.target, row.speakerAttribution]) :
        'eventKind' in row ? canonicalJson([row.eventKind, row.attribution]) :
          'reasonFacet' in row ? canonicalJson([row.reasonFacet, row.reasonPolarity, row.speakerBasis]) :
            'barrierFacet' in row ? canonicalJson(row.barrierFacet) : null;
      return { dimension, code };
    });
    const codes = new Map<string, Set<string>>();
    for (const { dimension, code } of dimensions) if (dimension && code)
      codes.set(dimension, (codes.get(dimension) ?? new Set()).add(code));
    rows.forEach((row, candidateIndex) => {
      const record = descriptor.records[row.recordIndex]!;
      const unit = units.get(row.recordIndex)!;
      const readingSpans = [...new Map(spans(row).map(span => [canonicalJson(span), span])).values()];
      const reasons: string[] = [];
      const pendingIndexes: number[] = [];
      if (record.disposition !== 'INCLUDED' || unit.eligibility !== 'ELIGIBLE' || !record.text || !/\S/u.test(record.text))
        reasons.push('RECORD_NOT_ELIGIBLE');
      if (unit.textFlags.includes('NON_NFC_TEXT') || (record.text !== null && record.text !== record.text.normalize('NFC')))
        reasons.push('NON_NFC_TEXT');
      const dimension = dimensions[candidateIndex]!.dimension;
      if (dimension && codes.get(dimension)!.size > 1) reasons.push('CONFLICTING_CANDIDATE_CODES');
      for (const { row: pending, pendingIndex } of pendingByRecord.get(row.recordIndex) ?? []) {
        if (pending.reason === 'NO_RULE_MATCH') continue;
        const shared = pending.reason === 'NON_NFC_TEXT' || SHARED_AMBIGUITY.has(pending.reason);
        if (pending.family !== family && !shared) continue;
        if (pending.reason === 'NON_NFC_TEXT' || pending.span === null || readingSpans.some(span => overlap(span, pending.span!))) {
          reasons.push(pending.reason); pendingIndexes.push(pendingIndex);
        }
      }
      const reference = { family, candidateIndex, recordIndex: row.recordIndex };
      if (reasons.length) blocked.push({ ...reference, reasons: [...new Set(reasons)], pendingIndexes });
      else {
        // The discriminated method key owns the candidate's existing annotation type.
        (candidates[key] as Candidate[]).push(row);
        admitted.push({ ...reference, spans: readingSpans });
      }
    });
  }
  validateLocatedInsightInput({ ...descriptor, ...candidates });
  const spanKeys = (rows: typeof admitted): Set<string> => new Set(rows.flatMap(row => row.spans.map(span =>
    canonicalJson([descriptor.records[row.recordIndex]!.sourceSha256, descriptor.records[row.recordIndex]!.locator, span.start, span.end]))));
  const recordKeys = (rows: typeof admitted): Set<string> => new Set(rows.map(row => {
    const record = descriptor.records[row.recordIndex]!;
    return canonicalJson([record.sourceSha256, record.locator]);
  }));
  const families = {} as LiteralReviewProjection['coverage']['families'];
  for (const [, family] of METHODS) {
    const rows = admitted.filter(row => row.family === family);
    families[family] = { admittedCandidates: rows.length, admittedRecords: recordKeys(rows).size, admittedSpans: spanKeys(rows).size };
  }
  return { policyRevision: 'literal-source-bound-v1', candidates, pending: frozen.pending, admitted, blocked,
    coverage: { recordsWithAdmittedCandidates: recordKeys(admitted).size, admittedSpans: spanKeys(admitted).size, families } };
}

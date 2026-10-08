import { createHash } from 'node:crypto';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { LiteralReviewInput, LiteralSellerInput } from './research-automation/insight-literal-source.js';

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export type InsightLiteralInput = {
  binding: { workspaceId: string; runId: string; scopeSha256: string; previousPairId: string };
  reviews: LiteralReviewInput[]; sellerStatements: LiteralSellerInput[];
};

/** Literal counts never map stars to sentiment or add seller statements to
 * customer coding. Identity remains the retained source hash plus row locator. */
export function buildInsightLiteralEvidence(input: InsightLiteralInput) {
  const seen = new Map<string, LiteralReviewInput>();
  const reviews = input.reviews.filter(row => {
    const ref = row.sourceRefs[0]!;
    const key = canonicalJson([ref.sourceSha256, ref.rowLocator]);
    const previous = seen.get(key);
    if (previous) {
      if (canonicalJson(previous) !== canonicalJson(row)) throw new TypeError('LITERAL_REFERENCE_CONFLICT');
      return false;
    }
    seen.set(key, row); return true;
  });
  const selected = reviews.flatMap((row, index) => row.admitted ? [{ row, pointer: `/input/reviews/${index}` }] : []);
  const pointers = (test: (row: LiteralReviewInput) => boolean) => selected.filter(item => test(item.row)).map(item => item.pointer);
  const count = (recordPointers: string[]) => ({ recordCount: recordPointers.length, recordPointers });
  const withField = pointers(row => row.rating.fieldPresent);
  const stars = { state: !selected.length ? 'NO_USABLE_RECORDS' as const : !withField.length ? 'SOURCE_FIELD_ABSENT' as const : 'AVAILABLE' as const,
    bins: withField.length ? [1, 2, 3, 4, 5].map(value => ({ value, ...count(pointers(row => row.rating.state === 'VALID' && row.rating.value === value)) })) : [],
    absentField: count(pointers(row => row.rating.state === 'ABSENT')),
    missingValue: count(pointers(row => row.rating.state === 'MISSING')), invalidValue: count(pointers(row => row.rating.state === 'INVALID')),
    textlessUnknown: count(pointers(row => row.textState === 'EMPTY')), unreadableText: count(pointers(row => row.textState === 'UNREADABLE')) };
  const byText = new Map<string, string[]>();
  for (const { row, pointer } of selected) if (row.textState === 'READABLE') byText.set(row.text!, [...(byText.get(row.text!) ?? []), pointer]);
  const duplicateTexts = [...byText].flatMap(([text, recordPointers]) => recordPointers.length > 1
    ? [{ textSha256: createHash('sha256').update(text).digest('hex'), recordPointers,
      label: 'trùng nguyên văn, có thể cùng một người' as const }] : []);
  const body = { contractVersion: 'insight-literal-evidence-v1' as const, methodId: 'insight-literal-evidence' as const,
    methodVersion: '1.0.0' as const, input: structuredClone({ ...input, reviews }),
    selectedRecordCount: selected.length, selectedRecordPointers: selected.map(item => item.pointer), excludedRecordPointers: reviews.flatMap((row, index) => row.admitted ? [] : [`/input/reviews/${index}`]),
    stars, duplicateTexts,
    sellerLayer: { state: input.sellerStatements.length ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
      statementPointers: input.sellerStatements.map((_, index) => `/input/sellerStatements/${index}`),
      blockers: input.sellerStatements.length ? [] : ['TYPED_RETAINED_SELLER_SOURCE_REQUIRED'],
      customerCodingMembership: [] as string[] },
    limitations: ['SOURCE_RECORDS_NOT_UNIQUE_PEOPLE', 'STARS_NOT_TEXT_SENTIMENT', 'SELLER_WORDING_NOT_CUSTOMER_EVIDENCE',
      'NO_SELLER_TARGET_INFERENCE_OR_CROSS_PLATFORM_JOIN', 'RETAINED_FIELD_PROVENANCE_NOT_SELLER_AUTHENTICITY'] };
  return { ...body, methodOutputId: hash(body) };
}
export type InsightLiteralEvidence = ReturnType<typeof buildInsightLiteralEvidence>;

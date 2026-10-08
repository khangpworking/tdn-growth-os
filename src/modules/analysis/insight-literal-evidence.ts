import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/insight-literal-evidence.schema.json' with { type: 'json' };
import type { InsightLiteralEvidence } from '../../../contracts/analysis/insight-literal-evidence.generated.js';
export type { InsightLiteralEvidence } from '../../../contracts/analysis/insight-literal-evidence.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
type LiteralReviewInput = InsightLiteralEvidence['input']['reviews'][number];
type InsightLiteralInput = InsightLiteralEvidence['input'];
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = require('ajv-formats') as typeof import('ajv-formats').default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv); ajv.addSchema(schema);
const validateInput = ajv.getSchema<InsightLiteralInput>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<InsightLiteralEvidence>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');


/** Literal counts never map stars to sentiment or add seller statements to
 * customer coding. Identity remains the retained source hash plus row locator. */
export function buildInsightLiteralEvidence(untrusted: unknown): InsightLiteralEvidence {
  if (Buffer.byteLength(canonicalJson(untrusted)) > MAX_BYTES || !validateInput(untrusted)) throw new TypeError('LITERAL_INPUT_INVALID');
  const input = untrusted as InsightLiteralInput;
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
  const body: Omit<InsightLiteralEvidence, 'methodOutputId'> = { contractVersion: 'insight-literal-evidence-v1' as const, methodId: 'insight-literal-evidence' as const,
    methodVersion: '1.0.0' as const, input: structuredClone({ ...input, reviews }),
    selectedRecordCount: selected.length, selectedRecordPointers: selected.map(item => item.pointer), excludedRecordPointers: reviews.flatMap((row, index) => row.admitted ? [] : [`/input/reviews/${index}`]),
    stars, duplicateTexts,
    sellerLayer: { state: input.sellerStatements.length ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
      statementPointers: input.sellerStatements.map((_, index) => `/input/sellerStatements/${index}`),
      blockers: input.sellerStatements.length ? [] : ['TYPED_RETAINED_SELLER_SOURCE_REQUIRED'],
      customerCodingMembership: [] as string[] },
    limitations: ['SOURCE_RECORDS_NOT_UNIQUE_PEOPLE', 'STARS_NOT_TEXT_SENTIMENT', 'SELLER_WORDING_NOT_CUSTOMER_EVIDENCE',
      'NO_SELLER_TARGET_INFERENCE_OR_CROSS_PLATFORM_JOIN', 'RETAINED_FIELD_PROVENANCE_NOT_SELLER_AUTHENTICITY'] };
  const output = { ...body, methodOutputId: hash(body) };
  if (Buffer.byteLength(canonicalJson(output)) > MAX_BYTES || !validateOutput(output)) throw new TypeError('LITERAL_OUTPUT_INVALID');
  return output;
}

/** Shape/hash/method replay alone is not source authentication; the owning
 * bridge additionally rebuilds from verified retained source bytes. */
export function verifyInsightLiteralEvidence(value: unknown): InsightLiteralEvidence {
  if (Buffer.byteLength(canonicalJson(value)) > MAX_BYTES || !validateOutput(value)) throw new TypeError('LITERAL_OUTPUT_INVALID');
  const rebuilt = buildInsightLiteralEvidence((value as InsightLiteralEvidence).input);
  if (canonicalJson(value) !== canonicalJson(rebuilt)) throw new TypeError('LITERAL_METHOD_REPLAY_MISMATCH');
  return rebuilt;
}

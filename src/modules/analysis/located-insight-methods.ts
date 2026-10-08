import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import type { LocatedInsightMethods } from '../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { buildInsightCorpusCounts } from './insight-corpus-counts.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
type Input = LocatedInsightMethods['input'];
type Span = Input['i04'][number]['span'];
type Provenance = Input['i04'][number]['provenance'];
type Section = LocatedInsightMethods['sections']['I02'];
type MethodKey = 'i02' | 'i04' | 'i05' | 'i06' | 'i07' | 'i08' | 'i09';
type Annotation = Input[MethodKey][number];
type Located = { row: Annotation; pointer: string; recordPointer: string };
const validateInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<LocatedInsightMethods>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;
const methodKeys: MethodKey[] = ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09'];
const briefFields = ['questionText', 'decisionToInform', 'intendedAudience', 'scope', 'knownConstraints'] as const;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const pending = (p: Provenance): boolean => p.basis === 'PENDING_AI' || p.disagreement !== null;
const unique = (values: string[]): string[] => [...new Set(values)];
const facetOrder = ['PRICE_COST', 'ACCESS_AVAILABILITY', 'FIT_NEED', 'PRODUCT_ATTRIBUTE', 'INFORMATION_TRUST', 'OTHER_EXPLICIT', 'UNCLEAR'];

export class LocatedInsightValidationError extends TypeError {}
function fail(code: string): never { throw new LocatedInsightValidationError(code); }
function recordKey(input: Input, index: number): string {
  const row = input.records[index];
  if (!row) fail('UNKNOWN_RECORD_INDEX');
  return canonicalJson([row.sourceSha256, row.locator]);
}

function checkSpan(text: string, span: Span): void {
  if (span.start >= span.end || span.end > text.length || text.slice(span.start, span.end) !== span.quote) {
    fail('SPAN_QUOTE_MISMATCH');
  }
  // Offsets may use UTF-16 but cannot cut a surrogate pair in half.
  for (const offset of [span.start, span.end]) {
    if (offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!)) {
      fail('SPAN_SPLITS_SURROGATE_PAIR');
    }
  }
}

function checkRelation(relation: Input['i07'][number]['relation'], spans: Span[]): void {
  for (const span of [...spans, relation.link]) {
    if (span.start < relation.context.start || span.end > relation.context.end) fail('RELATION_CONTEXT_EXCLUDES_EVIDENCE');
  }
  if (spans.length === 2 && spans[0]!.start === spans[1]!.start && spans[0]!.end === spans[1]!.end) {
    fail('RELATION_REQUIRES_DISTINCT_SPANS');
  }
}

function validateCore(untrusted: unknown): Input {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('INPUT_TOO_LARGE');
  if (!validateInput(untrusted)) fail(`INVALID_LOCATED_INSIGHT_INPUT:${ajv.errorsText(validateInput.errors)}`);
  const input = JSON.parse(serialized) as Input;
  const paths = new Set<string>();
  const sources = new Set<string>();
  for (const source of input.sources) {
    if (paths.has(source.logicalPath)) fail('DUPLICATE_SOURCE_PATH');
    if (source.logicalPath.startsWith('/') || source.logicalPath.includes('\\') || /^[a-z]:/i.test(source.logicalPath) ||
      source.logicalPath.split('/').some(part => part === '' || part === '.' || part === '..')) fail('INVALID_SOURCE_LOGICAL_PATH');
    paths.add(source.logicalPath);
    sources.add(source.sha256);
  }
  const records = new Map<string, string>();
  for (const [index, record] of input.records.entries()) {
    if (!sources.has(record.sourceSha256)) fail('UNKNOWN_EVIDENCE_SOURCE');
    if ((record.disposition === 'UNREADABLE') !== (record.text === null)) fail('RECORD_READABILITY_MISMATCH');
    if (record.disposition !== 'INCLUDED' && record.dispositionReason === null) fail('RECORD_DISPOSITION_REASON_REQUIRED');
    const key = recordKey(input, index);
    const bytes = canonicalJson(record);
    if (records.has(key) && records.get(key) !== bytes) fail('CONFLICTING_RECORD_REFERENCE');
    records.set(key, bytes);
  }
  function checkTree(value: unknown, recordIndex?: number): void {
    if (Array.isArray(value)) { value.forEach(item => checkTree(item, recordIndex)); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (typeof object.recordIndex === 'number') recordIndex = object.recordIndex;
    if (recordIndex !== undefined && !input.records[recordIndex]) fail('UNKNOWN_RECORD_INDEX');
    if ('start' in object && 'end' in object && 'quote' in object) {
      const text = recordIndex === undefined ? undefined : input.records[recordIndex]?.text;
      if (typeof text !== 'string') fail('UNREADABLE_SPAN_REFERENCE');
      // AJV already validated the complete input tree against the closed span schema.
      checkSpan(text, object as unknown as Span);
    }
    if ('basis' in object && object.basis === 'HUMAN_REVIEWED' && object.adjudication === null) fail('ADJUDICATION_DECLARATION_REQUIRED');
    if ('state' in object && 'span' in object) {
      if (object.state === 'SOURCE_STATED' && object.span === null) fail('SOURCE_STATED_SPAN_REQUIRED');
      if ((object.state === 'NOT_STATED' || object.state === 'UNKNOWN' || object.state === 'UNLOCATED') && object.span !== null) fail('FIELD_STATE_SPAN_MISMATCH');
    }
    for (const [key, child] of Object.entries(object)) {
      if (key === 'firstSpan') {
        if (child !== null) checkTree(child, object.firstRecordIndex as number);
      } else checkTree(child, recordIndex);
    }
  }
  checkTree(input);
  if (input.brief) {
    for (const field of briefFields) {
      const value = input.brief[field];
      if ((value.state === 'UNSET') !== (value.text === null)) fail('OWNER_FIELD_STATE_MISMATCH');
    }
  }
  for (const key of methodKeys) {
    for (const row of input[key]) {
      if (input.records[row.recordIndex]!.disposition !== 'INCLUDED') fail('ANNOTATION_RECORD_NOT_INCLUDED');
    }
    located(input, key);
  }
  for (const row of input.i06) if (row.relation) checkRelation(row.relation, [row.firstEvent, row.secondEvent]);
  for (const row of input.i07) checkRelation(row.relation, [row.choiceText, row.reasonClause]);
  for (const row of input.i08) checkRelation(row.relation, [row.attemptedTask, row.obstacleClause]);
  for (const row of input.i09) {
    if (row.relation) {
      if (!row.desiredState || !row.currentState) fail('GAP_RELATION_REQUIRES_BOTH_STATES');
      checkRelation(row.relation, [row.desiredState, row.currentState]);
    }
  }
  return input;
}

/** Validates normalized declarations and exact in-record spans, not original package bytes or semantic coding truth. */
export function validateLocatedInsightInput(untrusted: unknown): Input {
  const input = validateCore(untrusted);
  buildInsightCorpusCounts(input);
  return input;
}

function located(input: Input, key: MethodKey): Located[] {
  const seen = new Set<string>();
  const dimensions = new Map<string, string>();
  const rows: Located[] = [];
  const firstRecordIndex = new Map<string, number>();
  input.records.forEach((_, index) => {
    const identity = recordKey(input, index);
    if (!firstRecordIndex.has(identity)) firstRecordIndex.set(identity, index);
  });
  input[key].forEach((row, index) => {
    const recordIdentity = recordKey(input, row.recordIndex);
    const fingerprint = canonicalJson({ ...row, recordIndex: recordIdentity });
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    const clause = 'reasonClause' in row ? row.reasonClause : 'obstacleClause' in row ? row.obstacleClause : 'span' in row ? row.span : null;
    if (clause && !pending(row.provenance)) {
      const dimension = canonicalJson([recordIdentity, clause.start, clause.end]);
      const code = 'polarity' in row ? canonicalJson([row.polarity, row.target, row.speakerAttribution]) :
        'eventKind' in row ? canonicalJson([row.eventKind, row.attribution]) :
          'reasonFacet' in row ? canonicalJson([row.reasonFacet, row.reasonPolarity, row.speakerBasis]) :
            'barrierFacet' in row ? row.barrierFacet : null;
      if (dimensions.has(dimension) && dimensions.get(dimension) !== code) fail('CONFLICTING_CLAUSE_CODE');
      if (code) dimensions.set(dimension, code);
    }
    rows.push({ row, pointer: `/input/${key}/${index}`, recordPointer: `/input/records/${firstRecordIndex.get(recordIdentity)!}` });
  });
  const sourceOrder = new Map(input.sources.map((source, index) => [source.sha256, index]));
  return rows.sort((a, b) => {
    const left = input.records[a.row.recordIndex]!;
    const right = input.records[b.row.recordIndex]!;
    const facet = (row: Annotation): number => 'reasonFacet' in row ? facetOrder.indexOf(row.reasonFacet) :
      'barrierFacet' in row ? facetOrder.indexOf(row.barrierFacet) : 0;
    return sourceOrder.get(left.sourceSha256)! - sourceOrder.get(right.sourceSha256)! || compare(left.locator, right.locator) ||
      facet(a.row) - facet(b.row) ||
      (('span' in a.row ? a.row.span.start : 0) - ('span' in b.row ? b.row.span.start : 0)) || compare(a.pointer, b.pointer);
  });
}

function summary(input: Input, rows: Located[], sectionId: 'I02' | 'I04' | 'I05' | 'I06' | 'I07' | 'I08' | 'I09'): Section {
  const accepted = rows.filter(({ row }) => !pending(row.provenance));
  const recordPointers = unique(accepted.map(row => row.recordPointer));
  const pendingAnnotationPointers = rows.filter(({ row }) => pending(row.provenance)).map(row => row.pointer);
  const base = {
    recordPointers, annotationPointers: accepted.map(row => row.pointer), pendingAnnotationPointers,
    locatedRecordCount: recordPointers.length, semanticValidation: 'DECLARED_NOT_VERIFIED' as const,
    blockers: [...(accepted.length ? [] : ['NO_LOCATED_ANNOTATIONS']), ...(pendingAnnotationPointers.length ? ['CODING_PENDING'] : []),
      ...(input.question === null ? ['QUESTION_UNSET'] : [])],
  };
  // U-03 draft eligibility is additive, opt-in and scoped to the I02 summary:
  // without the flag the output keeps the historical accepted-only bytes
  // exactly. Draft rows are all disagreement-free rows on INCLUDED records:
  // eligible accepted rows plus eligible retained AI proposals, deduplicated
  // by stable record identity. Disagreements stay pending and provenance is
  // never rewritten to approved. Record INCLUDED membership is enforced by
  // input validation; the pointers below reuse the same stable identity.
  if (sectionId !== 'I02' || input.draftCountsVersion !== 'draft-counts-v1') return { ...base };
  const draft = rows.filter(({ row }) => row.provenance.disagreement === null);
  const draftRecordPointers = unique(draft.map(row => row.recordPointer));
  return { ...base, draftRecordPointers, draftAnnotationPointers: draft.map(row => row.pointer),
    draftLocatedRecordCount: draftRecordPointers.length,
    draftLabel: 'đề xuất, chờ chủ duyệt', draftCountsVersion: 'draft-counts-v1' as const };
}

/** U-02 (E7): input semantics version. Absence retains 1.0.0 bytes exactly. */
type SemanticsVersion = '1.0.0' | '1.1.0';
const WORKING_QUESTION_LABEL = 'câu hỏi làm việc do AI đề xuất, chờ chủ duyệt';

function businessQuestion(input: Input, version: SemanticsVersion): LocatedInsightMethods['sections']['I01'] {
  const unresolvedFields = briefFields.filter(field => !input.brief || input.brief[field].state === 'UNSET');
  const briefPointer = input.brief ? '/input/brief' : null;
  const briefSha256 = input.brief ? createHash('sha256').update(canonicalJson(input.brief)).digest('hex') : null;
  if (version === '1.0.0') return {
    briefPointer, briefSha256, unresolvedFields, reviewState: 'DECLARED_NOT_AUTHENTICATED',
    blockers: [...(unresolvedFields.includes('questionText') ? ['I01_OWNER_QUESTION_REQUIRED'] : []),
      ...unresolvedFields.filter(field => field !== 'questionText').map(field => `I01_${field.toUpperCase()}_UNSET`)],
  };
  // 1.1.0: a missing owner question is no longer a hard stop. A labelled AI-proposed working question stands in and
  // names every owner field the owner still has to add (the question plus the supplementary brief fields); the owner
  // question, when supplied, is carried as OWNER_SUPPLIED instead. The proposal never filters or selects evidence.
  const questionUnset = unresolvedFields.includes('questionText');
  const supplementaryFields = unresolvedFields.filter(field => field !== 'questionText');
  const ownerText = input.brief?.questionText.text ?? null;
  const proposal = input.workingQuestionProposal ?? null;
  return {
    briefPointer, briefSha256,
    unresolvedFields: supplementaryFields,
    reviewState: 'DECLARED_NOT_AUTHENTICATED',
    workingQuestion: {
      state: questionUnset ? 'AI_PROPOSED_AWAITING_OWNER' : 'OWNER_SUPPLIED',
      label: questionUnset ? WORKING_QUESTION_LABEL : null,
      text: questionUnset ? proposal : ownerText,
      ownerFieldsToAdd: questionUnset ? ['questionText', ...supplementaryFields] : supplementaryFields,
    },
    blockers: supplementaryFields.map(field => `I01_${field.toUpperCase()}_UNSET`),
  };
}

/** Located coding is retained as declared coding; no NLP classifier or authority flag promotes a suggestion. */
export function buildLocatedInsightMethods(untrustedInput: unknown): { output: LocatedInsightMethods; bytes: Buffer } {
  const input = validateCore(untrustedInput);
  // U-02: an omitted semanticsVersion is the historical 1.0.0 (hard owner-question blocker, no working question).
  const version: SemanticsVersion = input.semanticsVersion ?? '1.0.0';
  // U-03 draft eligibility is defined against current method semantics only.
  if (input.draftCountsVersion !== undefined && version !== '1.1.0') fail('DRAFT_REQUIRES_CURRENT_SEMANTICS');
  const corpus = buildInsightCorpusCounts(input);
  const i02 = located(input, 'i02'); const i04 = located(input, 'i04'); const i05 = located(input, 'i05');
  const i06 = located(input, 'i06'); const i07 = located(input, 'i07'); const i08 = located(input, 'i08'); const i09 = located(input, 'i09');
  const polarities = new Map<string, Set<Input['i05'][number]['polarity']>>();
  for (const item of i05) {
    if (pending(item.row.provenance)) continue;
    const codes = polarities.get(item.recordPointer) ?? new Set<Input['i05'][number]['polarity']>();
    codes.add((item.row as Input['i05'][number]).polarity);
    polarities.set(item.recordPointer, codes);
  }
  const recordPolarities: LocatedInsightMethods['sections']['I05']['recordPolarities'] = [...polarities].map(([recordPointer, values]) => ({
    recordPointer,
    polarity: values.has('MIXED') || (values.has('POSITIVE') && values.has('NEGATIVE')) ? 'MIXED' :
      values.size === 1 ? [...values][0]! : 'UNCLEAR',
  }));
  const sequences: LocatedInsightMethods['sections']['I06']['sequences'] = i06.flatMap(({ row, pointer }) => {
    if (pending(row.provenance) || !(row as Input['i06'][number]).relation) return [];
    return [{ annotationPointer: pointer, sequenceBasis: 'SOURCE_EXPLICIT_SAME_RECORD', identityScope: 'RECORD_LOCAL', sequenceState: 'SOURCE_STATED_ORDER' }];
  });
  const candidates: LocatedInsightMethods['sections']['I09']['candidates'] = i09.flatMap(({ row, pointer }) => {
    if (pending(row.provenance)) return [];
    const gap = row as Input['i09'][number];
    const state = gap.desiredState && gap.currentState && gap.relation ? 'EXPLICIT_GAP' :
      gap.desiredState && !gap.currentState ? 'DESIRE_ONLY' : !gap.desiredState && gap.currentState ? 'CURRENT_STATE_ONLY' :
        gap.desiredState || gap.currentState ? 'RELATION_UNCLEAR' : 'UNLOCATED';
    return [{ annotationPointer: pointer, state, unmetNeedCandidate: state === 'EXPLICIT_GAP' }];
  });
  const body: Omit<LocatedInsightMethods, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'located-insight-methods', methodVersion: version, input,
    sections: {
      I01: businessQuestion(input, version), I02: summary(input, i02, 'I02'), I04: summary(input, i04, 'I04'),
      I05: { ...summary(input, i05, 'I05'), recordPolarities },
      I06: { ...summary(input, i06, 'I06'), sequences, blockers: unique([...summary(input, i06, 'I06').blockers,
        ...(i06.some(({ row }) => !(row as Input['i06'][number]).relation) ? ['I06_EVENT_ORDER_UNRESOLVED'] : [])]) },
      I07: summary(input, i07, 'I07'), I08: summary(input, i08, 'I08'),
      I09: { ...summary(input, i09, 'I09'), candidates, blockers: unique([...summary(input, i09, 'I09').blockers,
        ...(candidates.some(row => !row.unmetNeedCandidate) ? ['I09_INCOMPLETE_GAP_EVIDENCE'] : [])]) },
      ...corpus,
    },
    limitations: [
      'NORMALIZED_DECLARATIONS_REQUIRE_RETAINED_SOURCE_BYTE_VERIFICATION',
      'POINTER_VALIDATION_IS_NOT_SEMANTIC_VERIFICATION_OR_OWNER_APPROVAL',
      'DECLARED_AND_HUMAN_REVIEWED_ARE_RETAINED_PROVENANCE_NOT_AUTHENTICATED_AUTHORITY',
      'PENDING_AI_AND_UNRESOLVED_DISAGREEMENTS_ARE_NOT_ACCEPTED_CODES',
      'FULL_RECORD_CONTEXT_RETAINS_NEGATION_CONDITIONS_HEARSAY_AND_ATTRIBUTION',
      'RECORD_LOCAL_RELATIONS_ARE_DECLARED_CODING_NOT_INDEPENDENTLY_OBSERVED_JOURNEYS',
      'LOCATED_RECORDS_NOT_PEOPLE_POPULATION_PREVALENCE_MARKET_SIZE_OR_CAUSAL_EFFECT',
      'CORPUS_RATIOS_ONLY_FOR_THE_EXPLICIT_FROZEN_CORPUS',
      'I13_EXACT_LITERAL_PHRASE_COUNTS_ONLY_NO_ALIAS_OR_SEMANTIC_CATEGORY_MAPPING',
    ],
  };
  const output: LocatedInsightMethods = { ...body, methodOutputId: createHash('sha256').update(canonicalJson(body)).digest('hex') };
  if (!validateOutput(output)) fail(`INVALID_LOCATED_INSIGHT_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.byteLength > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  return { output, bytes };
}

export function verifyLocatedInsightMethods(untrustedOutput: unknown): { output: LocatedInsightMethods; bytes: Buffer } {
  if (!validateOutput(untrustedOutput)) fail(`INVALID_LOCATED_INSIGHT_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const rebuilt = buildLocatedInsightMethods((untrustedOutput as LocatedInsightMethods).input);
  if (canonicalJson(untrustedOutput) !== canonicalJson(rebuilt.output)) fail('LOCATED_INSIGHT_REPLAY_MISMATCH');
  return rebuilt;
}

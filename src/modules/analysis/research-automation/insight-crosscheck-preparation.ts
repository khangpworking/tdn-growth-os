import { createHash } from 'node:crypto';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { InsightProposedAnnotations } from '../../../../contracts/analysis/automation-insight-coding.generated.js';
import type { InsightCrosscheckBlindedInput, InsightCrosscheckLiteralRow } from '../../../../contracts/analysis/automation-insight-crosscheck.generated.js';
import { retainedDefaultAnnotations } from './insight-default-coding.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';

type Input = LocatedInsightMethods['input'];
export const CROSSCHECK_SAMPLE_VERSION = 'sha256-ranked-source-records-v1';
export const CROSSCHECK_PROJECTION_VERSION = 'insight-crosscheck-blinded-v1';
export const CROSSCHECK_SAMPLE_LIMIT = 200; // Ultimate E11; not a reliability statistic.
const MODEL_BATCH_LIMIT = 100; // Existing semantic-coding transport/validation boundary.
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const identity = (record: Input['records'][number]) => canonicalJson([record.sourceSha256, record.locator]);

/** Exact source-native membership; no first-model prediction affects sampling eligibility. */
export function crosscheckEligibleRecords(input: Input): number[] {
  validateLocatedInsightInput(input);
  const seen = new Set<string>();
  return input.records.flatMap((record, index) => {
    if (record.disposition !== 'INCLUDED' || record.text === null || record.text.trim() === '') return [];
    const key = identity(record);
    if (seen.has(key)) return [];
    seen.add(key);
    return [index];
  });
}

/** Frozen algorithm and caller seed select all <=200, else200, without replacement. */
export function sampleCrosscheckRecords(input: Input, seed: string): number[] {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new TypeError('INVALID_CROSSCHECK_SEED');
  const eligible = crosscheckEligibleRecords(input);
  if (eligible.length <= CROSSCHECK_SAMPLE_LIMIT) return eligible;
  return eligible.map(recordIndex => ({ recordIndex, key: identity(input.records[recordIndex]!),
    score: hash([CROSSCHECK_SAMPLE_VERSION, seed, input.records[recordIndex]!.sourceSha256, input.records[recordIndex]!.locator]) }))
    .sort((a, b) => a.score < b.score ? -1 : a.score > b.score ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    .slice(0, CROSSCHECK_SAMPLE_LIMIT).map(row => row.recordIndex).sort((a, b) => a - b);
}

/** Closed projection by construction; original codebook digest includes the omitted trace fields. */
export function blindedCrosscheckBatch(input: Input, recordIndexes: readonly number[]): InsightCrosscheckBlindedInput {
  const eligible = new Set(crosscheckEligibleRecords(input));
  if (recordIndexes.length < 1 || recordIndexes.length > MODEL_BATCH_LIMIT || new Set(recordIndexes).size !== recordIndexes.length ||
    recordIndexes.some(index => !eligible.has(index))) throw new TypeError('INVALID_CROSSCHECK_BATCH');
  const selected = new Set(recordIndexes);
  return { projectionVersion: CROSSCHECK_PROJECTION_VERSION,
    codebookSha256: hash(input.corpora.map(corpus => corpus.codebook)),
    question: input.question, inclusionRule: input.inclusionRule, adjudicationRule: input.adjudicationRule,
    records: recordIndexes.map(recordIndex => {
      const record = input.records[recordIndex]!;
      return { recordIndex, sourceSha256: record.sourceSha256, locator: record.locator, text: record.text! };
    }),
    corpora: input.corpora.map((corpus, corpusIndex) => ({ corpusIndex, sectionId: corpus.sectionId,
      recordIndexes: corpus.recordIndexes.filter(index => selected.has(index)), multiCode: corpus.multiCode,
      codes: corpus.codebook.codes.map(({ code, label, phrase }) => ({ code, label, phrase })) }))
      .filter(corpus => corpus.recordIndexes.length > 0) };
}

const families = ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions'] as const;

/** Literal evidence beside the same frozen source, without matching or adjudicating individual annotations. */
export function literalCrosscheckRows(input: Input, recordIndexes: readonly number[], second: InsightProposedAnnotations): InsightCrosscheckLiteralRow[] {
  const eligible = new Set(crosscheckEligibleRecords(input));
  if (recordIndexes.length > CROSSCHECK_SAMPLE_LIMIT || new Set(recordIndexes).size !== recordIndexes.length ||
    recordIndexes.some(index => !eligible.has(index))) throw new TypeError('INVALID_CROSSCHECK_SAMPLE');
  return recordIndexes.map(recordIndex => {
    const record = input.records[recordIndex]!;
    // Retain first rows at every alias of this exact pointer. A sampled representative must not erase evidence.
    const aliases = new Set(input.records.flatMap((row, index) => identity(row) === identity(record) ? [index] : []));
    const first = structuredClone(retainedDefaultAnnotations(input)), next = structuredClone(second);
    for (const family of families) {
      Object.assign(first, { [family]: (first[family] ?? []).filter(row => aliases.has(row.recordIndex)) });
      Object.assign(next, { [family]: (next[family] ?? []).filter(row => aliases.has(row.recordIndex)) });
    }
    const firstCorpora = input.corpora.map((corpus, corpusIndex) => ({ corpusIndex,
      assignments: structuredClone(corpus.assignments.filter(row => aliases.has(row.recordIndex))),
      dispositions: structuredClone(corpus.dispositions.filter(row => aliases.has(row.recordIndex))) }));
    const secondCorpora = input.corpora.map((_, corpusIndex) => {
      const coding = second.corpora.find(corpus => corpus.corpusIndex === corpusIndex);
      return { corpusIndex, assignments: structuredClone(coding?.assignments.filter(row => aliases.has(row.recordIndex)) ?? []),
        dispositions: structuredClone(coding?.dispositions.filter(row => aliases.has(row.recordIndex)) ?? []) };
    });
    first.corpora = firstCorpora; next.corpora = secondCorpora;
    // Byte inequality is a literal listing only. It is never an agreement rate, statistical unit or alignment rule.
    const literalDifferences: InsightCrosscheckLiteralRow['literalDifferences'] = families.filter(family => canonicalJson(first[family]) !== canonicalJson(next[family]));
    if (canonicalJson(firstCorpora) !== canonicalJson(secondCorpora)) literalDifferences.push('corpora');
    return { recordIndex, sourceSha256: record.sourceSha256, locator: record.locator, text: record.text!,
      first, second: next, literalDifferences };
  });
}

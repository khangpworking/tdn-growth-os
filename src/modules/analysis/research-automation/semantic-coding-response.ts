import privateSourceSchema from '../../../../contracts/analysis/private-insight-source-projection.schema.json' with { type: 'json' };
import { registerPrivateReviewSchemas } from './private-review-contracts.js';
import { createRequire } from 'node:module';
import codingSchema from '../../../../contracts/analysis/automation-insight-coding.schema.json' with { type: 'json' };
import locatedSchema from '../../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import selectionSchema from '../../../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import type { InsightProposedAnnotations } from '../../../../contracts/analysis/automation-insight-coding.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: false });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
registerPrivateReviewSchemas(ajv); ajv.addSchema(privateSourceSchema);
for (const schema of [locatedSchema, selectionSchema, codingSchema]) ajv.addSchema(schema);
const validate = ajv.compile<InsightProposedAnnotations>({ $ref: `${codingSchema.$id}#/$defs/annotations` });
const families = ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions'] as const;
function invalid(): never { throw new TypeError('INVALID_INSIGHT_CODING_RESPONSE'); }
const pending = (disagreement: string | null) => ({ basis: 'PENDING_AI' as const, coderRole: 'semantic-coding-model-v1', adjudication: null, disagreement });

/** Structural and exact-source checks only. A valid candidate is still unreviewed. */
export function validateSemanticCodingResponse(value: unknown, input: LocatedInsightMethods['input'], recordIndexes: readonly number[]): InsightProposedAnnotations {
  if (Buffer.byteLength(canonicalJson(value)) > 8 * 1024 * 1024 || !validate(value) || families.some(family => value[family] === undefined)) invalid();
  if (recordIndexes.length < 1 || recordIndexes.length > 100 || new Set(recordIndexes).size !== recordIndexes.length) invalid();
  for (const index of recordIndexes) {
    const record = input.records[index];
    if (!Number.isSafeInteger(index) || !record || record.disposition !== 'INCLUDED' || record.text === null) invalid();
  }
  const batch = new Set(recordIndexes);
  const annotations = structuredClone(value);
  const composed = structuredClone(input);
  for (const family of families) {
    for (const row of annotations[family]!) {
      if (!batch.has(row.recordIndex)) invalid();
      row.provenance = pending(row.provenance.disagreement);
    }
    Object.assign(composed, { [family]: annotations[family] });
  }
  // Never let inherited source assignments or a shrunken batch become the model's corpus.
  for (const corpus of composed.corpora) { corpus.assignments = []; corpus.dispositions = []; }
  const seen = new Set<number>();
  for (const coding of annotations.corpora) {
    const corpus = composed.corpora[coding.corpusIndex];
    if (!corpus || seen.has(coding.corpusIndex)) invalid();
    seen.add(coding.corpusIndex);
    for (const row of [...coding.assignments, ...coding.dispositions]) {
      if (!batch.has(row.recordIndex) || !corpus.recordIndexes.includes(row.recordIndex)) invalid();
      row.provenance = pending(row.provenance.disagreement);
    }
    corpus.assignments = coding.assignments; corpus.dispositions = coding.dispositions;
  }
  validateLocatedInsightInput(composed);
  return annotations;
}

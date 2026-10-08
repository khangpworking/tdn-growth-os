import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';
import type { Ajv2020 as AjvType } from 'ajv/dist/2020.js';
import schema from '../../../../contracts/analysis/automation-insight-persona.schema.json' with { type: 'json' };
import apiSchema from '../../../../contracts/api/research-automation-insight-persona-api.schema.json' with { type: 'json' };
import locatedSchema from '../../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import selectionSchema from '../../../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import codingSchema from '../../../../contracts/analysis/automation-insight-coding.schema.json' with { type: 'json' };
import modelSchema from '../../../../contracts/analysis/automation-insight-model.schema.json' with { type: 'json' };
import type { PersonaSource, PersonaBinding, PersonaModelRequest, PersonaTaxonomy, PersonaClassificationResponse,
  PersonaSynthesisResponse, PersonaQuoteSelection, PersonaAttribute, PersonaAdmission, PersonaModelInput, PersonaPrompt,
  PersonaRetainedCandidates, PersonaEvidence, PersonaSnapshot } from '../../../../contracts/analysis/automation-insight-persona.generated.js';
import type { InsightModelConfiguration } from '../../../../contracts/analysis/automation-insight-model.generated.js';
import type { ResearchPersonaView, ResearchPersonaModelResponse } from '../../../../contracts/api/research-automation-insight-persona-api.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { registerPrivateReviewSchemas } from './private-review-contracts.js';

/** Canonical schemas validate structure only. The source owner must separately
 * authenticate Foundation/CAS and private author proof before passing a source. */
export function registerPersonaSchemas(ajv: AjvType): void {
  registerPrivateReviewSchemas(ajv);
  for (const item of [locatedSchema, selectionSchema, codingSchema, modelSchema, schema, apiSchema])
    if (!ajv.getSchema(item.$id)) ajv.addSchema(item);
}
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: false });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
registerPersonaSchemas(ajv);
function codec<T>(name: string, api = false): ValidateFunction<T> {
  return ajv.compile<T>({ $ref: `${api ? apiSchema.$id : schema.$id}#/$defs/${name}` });
}
export const personaSourceValid = codec<PersonaSource>('source');
export const personaBindingValid = codec<PersonaBinding>('binding');
export const personaRequestValid = codec<PersonaModelRequest>('request');
export const personaTaxonomyValid = codec<PersonaTaxonomy>('taxonomy');
export const personaClassificationResponseValid = codec<PersonaClassificationResponse>('classificationResponse');
export const personaSynthesisResponseValid = codec<PersonaSynthesisResponse>('synthesisResponse');
export const personaAdmissionValid = codec<PersonaAdmission>('admission');
export const personaInputValid = codec<PersonaModelInput>('input');
export const personaPromptValid = codec<PersonaPrompt>('prompt');
export const personaConfigurationValid = codec<InsightModelConfiguration>('configuration');
export const personaCandidatesValid = codec<PersonaRetainedCandidates>('candidates');
export const personaEvidenceValid = codec<PersonaEvidence>('evidence');
export const personaSnapshotValid = codec<PersonaSnapshot>('snapshot');
export const personaViewValid = codec<ResearchPersonaView>('view', true);
export const personaResponseValid = codec<ResearchPersonaModelResponse>('response', true);
export const personaDigest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function fail(): never { throw new TypeError('INVALID_INSIGHT_PERSONA_CONTRACT'); }

export function checkPersonaSource(value: unknown): PersonaSource {
  if (!personaSourceValid(value)) fail();
  const ids = new Set<string>();
  for (const [index, row] of value.records.entries()) {
    if (row.recordIndex !== index || ids.has(row.recordId)) fail();
    ids.add(row.recordId);
    if (row.disposition === 'INCLUDED' && (row.text === null || !row.text.trim() || row.exclusionReason !== null ||
      row.aliasOfRecordIndex !== null || row.sourceProduct.shopId === null || row.sourceProduct.itemId === null)) fail();
    if (row.disposition !== 'INCLUDED' && row.exclusionReason === null) fail();
    if (row.aliasOfRecordIndex !== null && (row.aliasOfRecordIndex >= index || row.disposition !== 'EXCLUDED' ||
      row.exclusionReason !== 'SOURCE_NATIVE_ALIAS')) fail();
  }
  const eligible = value.records.filter(row => row.disposition === 'INCLUDED').map(row => row.recordIndex);
  if (!same(eligible, value.eligibleRecordIndexes) || !same(eligible.slice(0, 300), value.taxonomySample.recordIndexes)) fail();
  return value;
}
export function checkPersonaBinding(binding: unknown, source: PersonaSource): PersonaBinding {
  if (!personaBindingValid(binding)) fail();
  for (const key of Object.keys(source.binding) as (keyof PersonaSource['binding'])[])
    if (binding[key] !== source.binding[key]) fail();
  if (binding.corpusSha256 !== source.corpus.artifactSha256 || binding.collectionId !== source.corpus.collectionId ||
    binding.collectionSha256 !== source.corpus.collectionSha256 || binding.sourceRequestSha256 !== source.corpus.requestSha256 ||
    binding.viewSha256 !== source.viewSha256 || binding.sourceSha256 !== personaDigest(source)) fail();
  return binding;
}
export function checkPersonaQuote(selection: PersonaQuoteSelection, source: PersonaSource): void {
  const row = source.records[selection.recordIndex];
  const span = selection.span;
  if (!codecQuote(selection) || !row || row.disposition !== 'INCLUDED' || row.text === null || row.recordId !== selection.recordId ||
    !same(row.locator, selection.locator) || span.start >= span.end || span.end > row.text.length ||
    row.text.slice(span.start, span.end) !== span.quote) fail();
  for (const offset of [span.start, span.end]) if (offset > 0 && offset < row.text.length &&
    /[\uD800-\uDBFF]/.test(row.text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(row.text[offset]!)) fail();
}
const codecQuote = codec<PersonaQuoteSelection>('quoteSelection');
export function checkPersonaAttribute(attribute: PersonaAttribute, source: PersonaSource, members: ReadonlySet<number>): void {
  if (!codecAttribute(attribute)) fail();
  for (const selection of attribute.quotes) {
    checkPersonaQuote(selection, source);
    if (!members.has(selection.recordIndex)) fail();
  }
}
const codecAttribute = codec<PersonaAttribute>('attribute');
export function checkPersonaTaxonomy(value: unknown, source: PersonaSource): PersonaTaxonomy {
  if (!personaTaxonomyValid(value)) fail();
  const sample = new Set(source.taxonomySample.recordIndexes);
  for (const codes of [value.topics, value.journeys]) {
    if (new Set(codes.map(row => row.code)).size !== codes.length) fail();
    for (const row of codes) for (const selection of row.examples) {
      checkPersonaQuote(selection, source);
      if (!sample.has(selection.recordIndex)) fail();
    }
  }
  return value;
}
export function checkPersonaClassifications(value: unknown, source: PersonaSource, taxonomy: PersonaTaxonomy,
  expectedIndexes: readonly number[]): PersonaClassificationResponse {
  if (!personaClassificationResponseValid(value) || value.codebookSha256 !== personaDigest(taxonomy) ||
    !same(value.records.map(row => row.recordIndex), expectedIndexes)) fail();
  const eligible = new Set(source.eligibleRecordIndexes);
  if (new Set(expectedIndexes).size !== expectedIndexes.length || expectedIndexes.some(index => !eligible.has(index))) fail();
  for (const row of value.records) {
    if (row.status === 'CLASSIFIED' && (!taxonomy.topics.some(code => code.code === row.topic) ||
      !taxonomy.journeys.some(code => code.code === row.journey) || row.uncertainty !== null)) fail();
    for (const quote of row.quotes) {
      if (quote.recordIndex !== row.recordIndex) fail();
      checkPersonaQuote(quote, source);
    }
  }
  return value;
}
/** Location/codebook/membership guards, not semantic truth or author proof.
 * The evidence closure separately enforces card/persona source minimums. */
export function checkPersonaSynthesis(value: unknown, source: PersonaSource, taxonomy: PersonaTaxonomy,
  classifiedIndexes: ReadonlySet<number>): PersonaSynthesisResponse {
  if (!personaSynthesisResponseValid(value) || value.codebookSha256 !== personaDigest(taxonomy)) fail();
  const cards = new Map<string, Set<number>>();
  for (const card of value.cards) {
    if (cards.has(card.cardKey) || card.situation.kind !== 'SITUATION') fail();
    const members = new Set(card.quotes.map(row => row.recordIndex));
    if (members.size < 2) fail();
    for (const quote of card.quotes) {
      checkPersonaQuote(quote, source);
      if (!classifiedIndexes.has(quote.recordIndex)) fail();
    }
    checkPersonaAttribute(card.situation, source, members);
    for (const attribute of card.attributes) checkPersonaAttribute(attribute, source, members);
    cards.set(card.cardKey, members);
  }
  for (const persona of value.personas) {
    const members = new Set<number>();
    for (const key of persona.cardKeys) {
      const card = cards.get(key); if (!card) fail();
      for (const index of card) members.add(index);
    }
    for (const attribute of persona.attributes) checkPersonaAttribute(attribute, source, members);
  }
  return value;
}

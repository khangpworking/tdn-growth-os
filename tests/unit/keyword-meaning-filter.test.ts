import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import filterSchema from '../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import {
  filterKeywordMeanings,
  KEYWORD_MEANING_FILTER_CONTRACT,
  KEYWORD_MEANING_FILTER_DATA_CONTRACT,
  KeywordMeaningFilterInputError,
  validatesKeywordMeaningFilterResult,
  type KeywordMeaningFilterData,
} from '../../src/modules/analysis/keyword-meaning-filter.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addSchema(filterSchema);
const validateData = ajv.compile({ $ref: `${(filterSchema as { $id: string }).$id}#/$defs/data` });

function thachDuaData(): KeywordMeaningFilterData {
  return {
    contractVersion: KEYWORD_MEANING_FILTER_DATA_CONTRACT,
    dataVersion: 'l9-thach-dua-v1',
    category: 'thạch dừa synthetic',
    provenance: 'OPERATOR_SUPPLIED',
    keywords: ['thạch dừa'],
    exclusions: [
      { term: 'thạch dứa', reason: 'Thạch làm từ dứa, khác thạch dừa lên men' },
      { term: 'thử thách', reason: 'Chữ Thạch trong tên riêng, không phải sản phẩm' },
    ],
  };
}

test('diacritic keywords admit exact meaning and exclusions win over substrings', () => {
  const result = filterKeywordMeanings(thachDuaData(), [
    { recordId: 'rec-1', text: 'Thạch dừa An Nhiên ăn rất ngon' },
    { recordId: 'rec-2', text: 'Review thạch dứa đóng hộp' },
    { recordId: 'rec-3', text: 'Thạch dừa ngon nhưng thạch dứa cũng được' },
    { recordId: 'rec-4', text: 'Thử thách ăn thạch dừa 7 ngày' },
  ]);
  assert.deepEqual(result.results.map(row => [row.recordId, row.decision, row.reason]), [
    ['rec-1', 'INCLUDED', 'MATCHED_KEYWORD'],
    ['rec-2', 'EXCLUDED', 'EXCLUDED_TERM'],
    ['rec-3', 'EXCLUDED', 'EXCLUDED_TERM'],
    ['rec-4', 'EXCLUDED', 'EXCLUDED_TERM'],
  ]);
  assert.equal(result.results[1]?.excludedBy, 'thạch dứa');
  assert.equal(result.results[1]?.matchedKeyword, null);
  assert.equal(result.results[0]?.matchedKeyword, 'thạch dừa');
  assert.deepEqual(result.accounting, { included: 1, excluded: 3, unclear: 0, byReason: { EXCLUDED_TERM: 3 } });
});

test('undiacritized text resolves only from its own marked context', () => {
  const data = thachDuaData();
  const unresolved = filterKeywordMeanings(data, [{ recordId: 'u-1', text: 'thach dua an ngon' }]);
  assert.equal(unresolved.results[0]?.decision, 'UNCLEAR');
  assert.equal(unresolved.results[0]?.reason, 'UNRESOLVED_UNDIACRITICIZED');
  const resolved = filterKeywordMeanings(data, [{
    recordId: 'u-2', text: 'thach dua an ngon', contextText: 'Video review thạch dừa An Nhiên',
  }]);
  assert.deepEqual([resolved.results[0]?.decision, resolved.results[0]?.reason, resolved.results[0]?.matchedKeyword],
    ['INCLUDED', 'RESOLVED_BY_CONTEXT', 'thạch dừa']);
  // A context about the look-alike does not resolve the other way.
  const contradicted = filterKeywordMeanings(data, [{
    recordId: 'u-3', text: 'thạch dừa ăn ngon', contextText: 'Bài so sánh thạch dứa đóng hộp',
  }]);
  assert.deepEqual([contradicted.results[0]?.decision, contradicted.results[0]?.reason],
    ['EXCLUDED', 'EXCLUDED_CONTEXT']);
});

test('brand collisions and absent context stay out of main counts', () => {
  const data: KeywordMeaningFilterData = { ...thachDuaData(),
    keywords: ['Fan House'], exclusions: [{ term: 'Fanhouse F', reason: 'Thương hiệu quạt, khác ngành thạch dừa' }] };
  const result = filterKeywordMeanings(data, [
    { recordId: 'b-1', text: 'Thạch dừa Fan House chính hãng' },
    { recordId: 'b-2', text: 'Quạt Fanhouse F mát nhanh' },
    { recordId: 'b-3', text: 'Bình giữ nhiệt rất tốt' },
    { recordId: 'b-4', text: '   ' },
  ]);
  assert.deepEqual(result.results.map(row => [row.recordId, row.decision, row.reason]), [
    ['b-1', 'INCLUDED', 'MATCHED_KEYWORD'],
    ['b-2', 'EXCLUDED', 'EXCLUDED_TERM'],
    ['b-3', 'UNCLEAR', 'NO_KEYWORD_MATCH'],
    ['b-4', 'UNCLEAR', 'EMPTY_TEXT'],
  ]);
  assert.deepEqual(result.accounting, { included: 1, excluded: 1, unclear: 2,
    byReason: { EXCLUDED_TERM: 1, NO_KEYWORD_MATCH: 1, EMPTY_TEXT: 1 } });
});

test('an explicit accented look-alike never resolves into the keyword meaning', () => {
  // No exclusion lists thạch dứa: the accented text itself proves a different product.
  const data: KeywordMeaningFilterData = { ...thachDuaData(), exclusions: [] };
  const result = filterKeywordMeanings(data, [{
    recordId: 'neg-1', text: 'Review thạch dứa đóng hộp rất ngon', contextText: 'So sánh thạch dừa và thạch dứa',
  }]);
  assert.equal(result.results[0]?.decision, 'UNCLEAR');
  assert.equal(result.results[0]?.reason, 'UNLISTED_ACCENTED_LOOKALIKE');
  assert.equal(result.results[0]?.matchedKeyword, null);
  assert.equal(result.accounting.included, 0);
});

test('frozen results bind exact input references and exclusion reasons', () => {
  const data = thachDuaData();
  const result = filterKeywordMeanings(data, [
    { recordId: 'f-1', text: 'Thạch dừa An Nhiên', contextText: 'Video gốc' },
    { recordId: 'f-2', text: 'thạch dứa hộp', contextText: null },
  ]);
  assert.deepEqual(result.keywords, ['thạch dừa']);
  assert.deepEqual(result.exclusions, data.exclusions);
  assert.equal(result.results[0]?.text, 'Thạch dừa An Nhiên');
  assert.equal(result.results[0]?.contextText, 'Video gốc');
  assert.equal(result.results[1]?.excludedBy, 'thạch dứa');
  assert.equal(result.results[1]?.exclusionReason, 'Thạch làm từ dứa, khác thạch dừa lên men');
  assert.equal(result.results[1]?.contextText, null);
});

test('record identifiers keep their original bytes', () => {
  const decomposed = 'é-1'; // e + U+0301 COMBINING ACUTE ACCENT, must stay byte-exact
  assert.ok(decomposed !== decomposed.normalize('NFC'), 'fixture must be non-NFC');
  const result = filterKeywordMeanings(thachDuaData(), [{ recordId: decomposed, text: 'thạch dừa' }]);
  assert.equal(result.results[0]?.recordId, decomposed);
  assert.notEqual(result.results[0]?.recordId, decomposed.normalize('NFC'));
});

test('record identity, order and replay are stable', () => {
  const data = thachDuaData();
  const records = [
    { recordId: 'zeta', text: 'thạch dừa' },
    { recordId: 'alpha', text: 'thạch dứa' },
  ];
  const first = filterKeywordMeanings(data, records);
  const second = filterKeywordMeanings(data, records);
  assert.deepEqual(second, first);
  assert.deepEqual(first.results.map(row => row.recordId), ['zeta', 'alpha']);
  assert.equal(first.contractVersion, KEYWORD_MEANING_FILTER_CONTRACT);
  assert.equal(first.dataVersion, 'l9-thach-dua-v1');
  assert.equal(first.category, 'thạch dừa synthetic');
});

test('frozen results validate against the canonical schema and reject tampering', () => {
  const data = thachDuaData();
  assert.equal(validateData(data), true);
  assert.equal(validateData({ ...data, keywords: [] as unknown as string[] }), false, 'Empty keywords fail canonical validation');
  const result = filterKeywordMeanings(data, [
    { recordId: 's-1', text: 'thạch dừa' },
    { recordId: 's-2', text: 'thạch dứa' },
  ]);
  assert.equal(validatesKeywordMeaningFilterResult(result), true);
  assert.equal(validatesKeywordMeaningFilterResult({ ...result, results: [] }), true);
  assert.equal(validatesKeywordMeaningFilterResult({ ...result, contractVersion: 'wrong-v1' }), false);
  const tampered = JSON.parse(JSON.stringify(result)) as typeof result;
  (tampered.results[0] as unknown as Record<string, unknown>).decision = 'MAYBE';
  assert.equal(validatesKeywordMeaningFilterResult(tampered), false);
  const dropped = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
  delete (dropped.results as Array<Record<string, unknown>>)[1]?.exclusionReason;
  assert.equal(validatesKeywordMeaningFilterResult(dropped), false, 'A dropped exclusion reason fails validation');
});

test('record trust boundary validates canonically and provenance stays distinct and frozen', () => {
  const data = thachDuaData();
  const records = [
    { recordId: 'p-1', text: 'thạch dừa' },
    { recordId: 'p-2', text: '' },
    { recordId: 'p-3', text: 'x'.repeat(10001) },
  ];
  assert.throws(() => filterKeywordMeanings(data, records.slice(2)), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings(data, [{ recordId: '', text: 'x' }]), KeywordMeaningFilterInputError);
  const ok = filterKeywordMeanings(data, records.slice(0, 2));
  assert.equal(ok.results[1]?.reason, 'EMPTY_TEXT');
  // Provenance binds into the frozen result without changing decisions; model
  // drafting is not implemented, only kept distinct.
  const modeled = filterKeywordMeanings({ ...data, provenance: 'MODEL_DRAFTED' }, records.slice(0, 2));
  assert.equal(modeled.provenance, 'MODEL_DRAFTED');
  assert.deepEqual(modeled.results.map(row => [row.decision, row.reason]),
    ok.results.map(row => [row.decision, row.reason]));
  assert.equal(validatesKeywordMeaningFilterResult(modeled), true);
});

test('invalid data and record identity violations fail closed', () => {
  const data = thachDuaData();
  assert.throws(() => filterKeywordMeanings({ ...data, contractVersion: 'wrong-v1' } as unknown as KeywordMeaningFilterData, []), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings({ ...data, keywords: [] } as unknown as KeywordMeaningFilterData, []), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings({ ...data, keywords: ['thạch dừa', 'THẠCH DỪA'] }, []), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings(data, [
    { recordId: 'dup', text: 'thạch dừa' }, { recordId: 'dup', text: 'thạch dừa' },
  ]), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings(data, [{ recordId: '', text: 'thạch dừa' }]), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings(data, [{ recordId: 'x', text: 'x'.repeat(10001) }]), KeywordMeaningFilterInputError);
  assert.throws(() => filterKeywordMeanings({ ...data, exclusions: [{ term: '', reason: 'empty' }] }, []), KeywordMeaningFilterInputError);
});

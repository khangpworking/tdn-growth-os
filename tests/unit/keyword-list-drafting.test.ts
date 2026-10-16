import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftKeywordLists,
  KEYWORD_LIST_DRAFT_CONTRACT,
  KeywordListDraftError,
  KeywordModelOutputError,
  type KeywordListDraftRequest,
  type KeywordListDraftTransport,
} from '../../src/modules/analysis/keyword-list-drafting.js';
import { validatesKeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';

function request(overrides: Partial<KeywordListDraftRequest> = {}): KeywordListDraftRequest {
  return {
    contractVersion: KEYWORD_LIST_DRAFT_CONTRACT,
    dataVersion: 'l9-thach-dua-v1',
    category: 'thạch dừa synthetic',
    seeds: { productNames: ['Thạch dừa An Nhiên 350g'], includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'] },
    ...overrides,
  };
}

function transport(lists: { keywords: unknown[]; exclusions: unknown[] }): KeywordListDraftTransport {
  return { draftLists: async () => ({ keywords: [...lists.keywords], exclusions: [...lists.exclusions] }) };
}

test('drafting freezes validated MODEL_DRAFTED lists with exact term bytes', async () => {
  const seen: unknown[] = [];
  const recording: KeywordListDraftTransport = {
    draftLists: async input => {
      seen.push(input);
      return { keywords: ['thạch dừa', 'Thạch Dừa An Nhiên'], exclusions: [{ term: 'thạch dứa', reason: 'khác sản phẩm' }] };
    },
  };
  const data = await draftKeywordLists(recording, request());
  assert.equal(data.contractVersion, 'l9-keyword-data-v1');
  assert.equal(data.provenance, 'MODEL_DRAFTED');
  assert.deepEqual(data.keywords, ['thạch dừa', 'Thạch Dừa An Nhiên']);
  assert.deepEqual(data.exclusions, [{ term: 'thạch dứa', reason: 'khác sản phẩm' }]);
  assert.equal(validatesKeywordMeaningFilterData(data), true);
  assert.deepEqual(seen, [{ productNames: ['Thạch dừa An Nhiên 350g'], includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'] }]);
});

test('drafting appends omitted scope seeds without replacing model bytes', async () => {
  const data = await draftKeywordLists(transport({
    keywords: ['Thạch Dừa An Nhiên'],
    exclusions: [{ term: 'khác sản phẩm', reason: 'Synthetic model exclusion' }],
  }), request());
  assert.deepEqual(data.keywords, ['thạch dừa', 'Thạch Dừa An Nhiên']);
  assert.deepEqual(data.exclusions, [
    { term: 'khác sản phẩm', reason: 'Synthetic model exclusion' },
    { term: 'thạch dứa', reason: 'SCOPE_EXCLUDE_TERM' },
  ]);
});

test('drafting fails closed on malformed, empty or duplicate transport output', async () => {
  const cases: { keywords: unknown[]; exclusions: unknown[] }[] = [
    { keywords: [], exclusions: [] },
    { keywords: ['thạch dừa', 'THẠCH DỪA'], exclusions: [] },
    { keywords: ['  '], exclusions: [] },
    { keywords: ['thạch dừa'], exclusions: [{ term: '', reason: 'empty' }] },
  ];
  for (const lists of cases) {
    await assert.rejects(draftKeywordLists(transport(lists), request({ seeds: { productNames: ['Synthetic product'], includeTerms: [], excludeTerms: [] } })), KeywordListDraftError);
  }
  await assert.rejects(
    draftKeywordLists({ draftLists: async () => { throw new Error('synthetic transport boom'); } }, request()),
    KeywordListDraftError);
  await assert.rejects(
    draftKeywordLists({ draftLists: async () => null as never }, request()),
    KeywordListDraftError);
});

test('drafting rejects missing or null keyword and exclusion arrays as domain errors', async () => {
  await assert.rejects(
    draftKeywordLists({ draftLists: async () => ({ exclusions: [] } as never) }, request()),
    KeywordListDraftError);
  await assert.rejects(
    draftKeywordLists({ draftLists: async () => ({ keywords: null, exclusions: [] } as never) }, request()),
    KeywordListDraftError);
  await assert.rejects(
    draftKeywordLists({ draftLists: async () => ({ keywords: [] } as never) }, request()),
    KeywordListDraftError);
  await assert.rejects(
    draftKeywordLists({ draftLists: async () => ({ keywords: [], exclusions: null } as never) }, request()),
    KeywordListDraftError);
});

test('drafting rejects invalid requests and seeds without calling transport', async () => {
  let calls = 0;
  const counting: KeywordListDraftTransport = { draftLists: async input => { calls++; return { keywords: ['a'], exclusions: [] }; } };
  for (const bad of [
    { ...request(), contractVersion: 'wrong-v1' },
    { ...request(), dataVersion: '' },
    { ...request(), seeds: { productNames: [], includeTerms: [], excludeTerms: [] } },
    { ...request(), seeds: { productNames: ['x'.repeat(501)], includeTerms: [], excludeTerms: [] } },
  ]) {
    await assert.rejects(draftKeywordLists(counting, bad as KeywordListDraftRequest), KeywordListDraftError);
  }
  assert.equal(calls, 0);
});

test('drafting is deterministic across reruns', async () => {
  const fake = transport({ keywords: ['thạch dừa'], exclusions: [] });
  assert.deepEqual(await draftKeywordLists(fake, request()), await draftKeywordLists(fake, request()));
});

test('drafting failures carry a closed reason split by error class', async () => {
  const reason = async (t: KeywordListDraftTransport) => (await draftKeywordLists(t, request()).then(() => undefined, (error: unknown) => error)) as KeywordListDraftError;
  assert.equal((await reason({ draftLists: async () => { throw new Error('synthetic dispatch failure'); } })).reason, 'TRANSPORT_FAILED');
  assert.equal((await reason({ draftLists: async () => { throw new KeywordModelOutputError('synthetic prose'); } })).reason, 'OUTPUT_INVALID');
  assert.equal((await reason({ draftLists: async () => ({ keywords: 'x' } as never) })).reason, 'OUTPUT_INVALID');
  assert.equal((await reason(transport({ keywords: [''], exclusions: [] }))).reason, 'DATA_INVALID');
  const invalid = await draftKeywordLists(transport({ keywords: [], exclusions: [] }), { ...request(), category: '' }).then(() => undefined, (error: unknown) => error) as KeywordListDraftError;
  assert.equal(invalid.reason, 'REQUEST_INVALID');
});

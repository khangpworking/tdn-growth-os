import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterSerpApiResults,
  serpApiResultRecordId,
} from '../../src/modules/analysis/research-automation/serpapi-l9-filter.js';
import type { WebDiscoveryResult } from '../../src/modules/analysis/research-automation/providers.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';

function filter(): KeywordMeaningFilterData {
  return {
    contractVersion: 'l9-keyword-data-v1', dataVersion: 'l9-test-v1', category: 'synthetic',
    provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'],
    exclusions: [{ term: 'thạch dứa', reason: 'khác sản phẩm' }],
  };
}

function result(overrides: Partial<WebDiscoveryResult> & { url: string; position: number; captureId?: string }): WebDiscoveryResult {
  return {
    captureId: 'cap-1', title: '', displayedLink: null, snippet: null, source: null,
    date: null, retrievedAt: '2026-01-01T00:00:00.000Z', semantics: 'CURRENT_WEB_SNAPSHOT_NOT_PERIOD_EVIDENCE',
    ...overrides,
  };
}

test('record identity binds the retained capture and position, never the URL text', () => {
  assert.equal(serpApiResultRecordId(result({ url: 'https://example.test/a', position: 1 })), 'cap-1#1');
  assert.equal(
    serpApiResultRecordId(result({ url: 'https://example.test/a', position: 1, captureId: 'cap-2' })),
    'cap-2#1',
    'Same URL in another retained capture is a different record',
  );
});

test('included rows stay eligible while excluded and unclear rows carry reasons out of counts', () => {
  const output = filterSerpApiResults({ filter: filter(), results: [
    result({ url: 'https://example.test/a', position: 1, title: 'Thạch dừa An Nhiên chính hãng' }),
    result({ url: 'https://example.test/b', position: 2, title: 'Review thạch dứa đóng hộp' }),
    result({ url: 'https://example.test/c', position: 3, title: 'Tin thị trường chung' }),
    result({ url: 'https://example.test/d', position: 4, title: '' }),
  ] });
  assert.equal(output.contractVersion, 'serpapi-l9-filter-v1');
  assert.deepEqual(output.includedRecordIds, ['cap-1#1']);
  assert.deepEqual(output.result.results.map(row => [row.recordId, row.decision, row.reason]), [
    ['cap-1#1', 'INCLUDED', 'MATCHED_KEYWORD'],
    ['cap-1#2', 'EXCLUDED', 'EXCLUDED_TERM'],
    ['cap-1#3', 'UNCLEAR', 'NO_KEYWORD_MATCH'],
    ['cap-1#4', 'UNCLEAR', 'EMPTY_TEXT'],
  ]);
  assert.deepEqual(output.result.accounting, { included: 1, excluded: 1, unclear: 2,
    byReason: { EXCLUDED_TERM: 1, NO_KEYWORD_MATCH: 1, EMPTY_TEXT: 1 } });
  assert.equal(output.result.results[1]?.excludedBy, 'thạch dứa');
});

test('duplicate provider identities fail closed without partial output', () => {
  assert.throws(() => filterSerpApiResults({ filter: filter(), results: [
    result({ url: 'https://example.test/a', position: 1, title: 'x' }),
    result({ url: 'https://example.test/other', position: 1, title: 'y' }),
  ] }), /duplicate result identity/);
  assert.throws(() => filterSerpApiResults({ filter: filter(), results: 'nope' as unknown as [] }), /must be a list/);
});

test('filtering is deterministic across reruns', () => {
  const input = { filter: filter(), results: [] as never[] };
  assert.deepEqual(filterSerpApiResults(input), filterSerpApiResults(input));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPANDED_SEARCH_MAX_QUERIES, SearchCallBudget, buildExpandedQueries, expandedSearchCacheKey,
} from '../../src/modules/analysis/research-automation/expanded-search-queries.js';

const PRODUCTS = ['bình giữ nhiệt An Nhiên', 'nồi chiên An Nhiên'];
const BRANDS = ['An Nhiên'];

test('buildExpandedQueries fills product templates, then brands, then adjacent product pairs', () => {
  assert.deepEqual(buildExpandedQueries({ confirmedProducts: PRODUCTS, confirmedBrands: BRANDS }), [
    'bình giữ nhiệt An Nhiên review',
    'bình giữ nhiệt An Nhiên có tốt không',
    'bình giữ nhiệt An Nhiên lỗi',
    'nồi chiên An Nhiên review',
    'nồi chiên An Nhiên có tốt không',
    'nồi chiên An Nhiên lỗi',
    'An Nhiên review',
    'bình giữ nhiệt An Nhiên hay nồi chiên An Nhiên',
  ]);
});

test('buildExpandedQueries trims and collapses, drops empty and over-long names, and dedupes case-insensitively', () => {
  const overLong = `bình giữ nhiệt An Nhiên${' x'.repeat(50)}`;
  const queries = buildExpandedQueries({
    confirmedProducts: ['  bình   giữ nhiệt An Nhiên  ', 'BÌNH GIỮ NHIỆT AN NHIÊN', '', '   ', overLong],
    confirmedBrands: ['An Nhiên'],
  });
  assert.deepEqual(queries, [
    'bình giữ nhiệt An Nhiên review',
    'bình giữ nhiệt An Nhiên có tốt không',
    'bình giữ nhiệt An Nhiên lỗi',
    'An Nhiên review',
  ]);
});

test('buildExpandedQueries caps the expanded set at ten queries', () => {
  const products = ['alpha An Nhiên', 'beta An Nhiên', 'gamma An Nhiên', 'delta An Nhiên'];
  const queries = buildExpandedQueries({ confirmedProducts: products, confirmedBrands: [] });
  assert.equal(queries.length, EXPANDED_SEARCH_MAX_QUERIES);
  assert.deepEqual(queries, [
    'alpha An Nhiên review', 'alpha An Nhiên có tốt không', 'alpha An Nhiên lỗi',
    'beta An Nhiên review', 'beta An Nhiên có tốt không', 'beta An Nhiên lỗi',
    'gamma An Nhiên review', 'gamma An Nhiên có tốt không', 'gamma An Nhiên lỗi',
    'delta An Nhiên review',
  ]);
});

test('every expanded query only reuses words from the confirmed inputs and the fixed templates', () => {
  const products = ['bình giữ nhiệt An Nhiên', 'nồi chiên Lộc Tân'];
  const brands = ['An Nhiên'];
  const queries = buildExpandedQueries({ confirmedProducts: products, confirmedBrands: brands });
  const names = [...products, ...brands];
  const allowed = new Set(names.flatMap(name => name.split(' ')).concat(['review', 'có', 'tốt', 'không', 'lỗi', 'hay']));
  assert.ok(queries.length > 0);
  for (const query of queries) {
    assert.ok(names.some(name => query.startsWith(`${name} `)), `invented name: ${query}`);
    for (const token of query.split(' ')) assert.ok(allowed.has(token), `invented word: ${token} in ${query}`);
  }
});

test('buildExpandedQueries returns nothing without confirmed names', () => {
  assert.deepEqual(buildExpandedQueries({ confirmedProducts: [], confirmedBrands: [] }), []);
  assert.deepEqual(buildExpandedQueries({ confirmedProducts: ['', '   '], confirmedBrands: [''] }), []);
});

test('expandedSearchCacheKey depends on the query and the retrieval day and never carries a key', () => {
  assert.equal(
    expandedSearchCacheKey('bình giữ nhiệt An Nhiên review', '2026-10-07'),
    expandedSearchCacheKey('bình giữ nhiệt An Nhiên review', '2026-10-07'),
  );
  assert.notEqual(
    expandedSearchCacheKey('bình giữ nhiệt An Nhiên review', '2026-10-07'),
    expandedSearchCacheKey('nồi chiên An Nhiên review', '2026-10-07'),
  );
  assert.notEqual(
    expandedSearchCacheKey('bình giữ nhiệt An Nhiên review', '2026-10-07'),
    expandedSearchCacheKey('bình giữ nhiệt An Nhiên review', '2026-10-08'),
  );
  assert.equal(expandedSearchCacheKey('bình giữ nhiệt An Nhiên review', '2026-10-07').includes('test-key-not-real'), false);
});

test('SearchCallBudget caps trends at four and search at ten and never queues or retries', () => {
  const budget = new SearchCallBudget();
  for (let index = 0; index < 4; index += 1) assert.equal(budget.take('trends'), true, `trends take ${index}`);
  assert.equal(budget.take('trends'), false);
  for (let index = 0; index < 10; index += 1) assert.equal(budget.take('search'), true, `search take ${index}`);
  assert.equal(budget.take('search'), false);
  assert.equal(budget.take('trends'), false);

  const small = new SearchCallBudget({ trends: 1, search: 2 });
  assert.equal(small.take('trends'), true);
  assert.equal(small.take('trends'), false);
  assert.equal(small.take('search'), true);
  assert.equal(small.take('search'), true);
  assert.equal(small.take('search'), false);
});

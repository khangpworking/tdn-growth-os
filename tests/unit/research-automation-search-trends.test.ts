import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bytesContainSecret, type ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import {
  SEARCH_TRENDS_LIMITS, fetchTrends, parseTrends, planTrendsRequests, trendsCacheKey,
  type TrendsDataType, type TrendsRequest,
} from '../../src/modules/analysis/research-automation/search-trends.js';

const KEY = 'test-key-not-real';
const NOW = Date.parse('2026-10-07T00:00:00.000Z');
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'search-trends');

function fixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

interface FakeTransport extends ProviderTransport { readonly calls: URL[] }

function fakeTransport(handler: (url: URL) => Response | Promise<Response>): FakeTransport {
  const calls: URL[] = [];
  return {
    calls,
    fetch: (async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      return handler(url);
    }) as typeof fetch,
    sleep: async () => {},
    now: () => NOW,
  };
}

function request(dataType: TrendsDataType, keywords: readonly string[] = ['bình giữ nhiệt An Nhiên']): TrendsRequest {
  return { dataType, keywords };
}

test('trends plan dedupes case- and whitespace-insensitively, keeps five keywords, and stays inside the per-run cap', () => {
  const plan = planTrendsRequests([
    '  Bình giữ nhiệt   An Nhiên ', 'bình giữ nhiệt an nhiên', 'nồi chiên An Nhiên',
    'Kem chống nắng An Nhiên', 'Sữa rửa mặt An Nhiên', 'Máy sấy An Nhiên', 'Bàn ủi An Nhiên',
  ]);
  const keywords = ['Bình giữ nhiệt An Nhiên', 'nồi chiên An Nhiên', 'Kem chống nắng An Nhiên', 'Sữa rửa mặt An Nhiên', 'Máy sấy An Nhiên'];
  assert.deepEqual(plan, [
    { dataType: 'TIMESERIES', keywords },
    { dataType: 'RELATED_QUERIES', keywords: [keywords[0]] },
    { dataType: 'RELATED_QUERIES', keywords: [keywords[1]] },
    { dataType: 'GEO_MAP_0', keywords: [keywords[0]] },
  ]);
  assert.ok(plan.length <= SEARCH_TRENDS_LIMITS.maxCallsPerRun);
});

test('trends plan covers a single keyword and returns nothing for empty input', () => {
  assert.deepEqual(planTrendsRequests([]), []);
  assert.deepEqual(planTrendsRequests(['', '   ']), []);
  assert.deepEqual(planTrendsRequests(['bình giữ nhiệt An Nhiên']), [
    { dataType: 'TIMESERIES', keywords: ['bình giữ nhiệt An Nhiên'] },
    { dataType: 'RELATED_QUERIES', keywords: ['bình giữ nhiệt An Nhiên'] },
    { dataType: 'GEO_MAP_0', keywords: ['bình giữ nhiệt An Nhiên'] },
  ]);
});

test('parseTrends reads the timeseries as a 0-100 index and keeps "<1" and missing values null', () => {
  const facts = parseTrends('TIMESERIES', fixture('timeseries'));
  if (facts?.kind !== 'TIMESERIES') assert.fail('expected TIMESERIES facts');
  assert.equal(facts.unit, 'INDEX_0_100');
  assert.deepEqual(facts.series.map(series => series.keyword), ['bình giữ nhiệt An Nhiên', 'nồi chiên An Nhiên']);
  const [first, second] = facts.series;
  assert.equal(first!.points.length, 52);
  assert.equal(second!.points.length, 52);
  assert.equal(first!.points[0]!.index, 42);
  assert.equal(second!.points[0]!.index, 18);
  assert.deepEqual(first!.points.filter(point => point.index === null).map(point => point.period), ['2025-12-14', '2026-07-12']);
  assert.equal(second!.points.filter(point => point.index === null).length, 1);
  for (const series of facts.series) {
    for (const point of series.points) {
      if (point.index !== null) assert.ok(Number.isInteger(point.index) && point.index >= 0 && point.index <= 100);
    }
  }
});

test('parseTrends keeps related top indexes numeric and rising labels verbatim', () => {
  const facts = parseTrends('RELATED_QUERIES', fixture('related'));
  if (facts?.kind !== 'RELATED_QUERIES') assert.fail('expected RELATED_QUERIES facts');
  assert.equal(facts.keyword, 'bình giữ nhiệt An Nhiên');
  assert.deepEqual(facts.top, [
    { query: 'bình giữ nhiệt An Nhiên 1 lít', index: 100 },
    { query: 'bình giữ nhiệt An Nhiên giá', index: 72 },
    { query: 'bình giữ nhiệt An Nhiên chính hãng', index: 65 },
  ]);
  assert.deepEqual(facts.rising.map(rising => rising.label), ['Breakout', '+250%']);
});

test('parseTrends maps interest by region and keeps the missing region index null', () => {
  const facts = parseTrends('GEO_MAP_0', fixture('geo'));
  if (facts?.kind !== 'GEO_MAP_0') assert.fail('expected GEO_MAP_0 facts');
  assert.equal(facts.unit, 'INDEX_0_100');
  assert.equal(facts.keyword, 'bình giữ nhiệt An Nhiên');
  assert.equal(facts.regions.length, 5);
  assert.equal(facts.regions.find(region => region.region === 'Hà Nội')!.index, 100);
  assert.equal(facts.regions.find(region => region.region === 'Đà Nẵng')!.index, null);
  assert.equal(facts.regions.filter(region => region.index === null).length, 1);
});

test('parseTrends rejects an unrecognised shape instead of guessing', () => {
  const bad = fixture('bad-shape');
  for (const dataType of ['TIMESERIES', 'RELATED_QUERIES', 'GEO_MAP_0'] as const) {
    assert.equal(parseTrends(dataType, bad), null);
  }
  for (const data of [null, 42, 'not json', [], undefined]) assert.equal(parseTrends('TIMESERIES', data), null);
});

test('fetchTrends makes no call without a key and none after an abort', async () => {
  const withoutKey = fakeTransport(() => jsonResponse(fixture('timeseries')));
  const notConfigured = await fetchTrends(null, withoutKey, request('TIMESERIES'), {});
  assert.equal(notConfigured.status, 'NOT_CONFIGURED');
  assert.equal(notConfigured.captures.length, 0);
  assert.equal(withoutKey.calls.length, 0);

  const abortController = new AbortController();
  abortController.abort();
  const aborted = fakeTransport(() => jsonResponse(fixture('timeseries')));
  const cancelled = await fetchTrends(KEY, aborted, request('TIMESERIES'), { signal: abortController.signal });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.captures.length, 0);
  assert.equal(aborted.calls.length, 0);
});

test('fetchTrends records one HTTP error capture and never retries', async () => {
  const transport = fakeTransport(() => jsonResponse({ error: 'synthetic failure' }, 500));
  const result = await fetchTrends(KEY, transport, request('TIMESERIES'), {});
  assert.equal(result.status, 'FAILED');
  assert.equal(result.facts, null);
  assert.equal(transport.calls.length, 1);
  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0]!.outcome, 'HTTP_ERROR');
  assert.equal(result.captures[0]!.httpStatus, 500);
});

test('fetchTrends marks an unrecognised 200 payload invalid and does not retry', async () => {
  const transport = fakeTransport(() => jsonResponse(fixture('bad-shape')));
  const result = await fetchTrends(KEY, transport, request('TIMESERIES'), {});
  assert.equal(result.status, 'FAILED');
  assert.equal(result.facts, null);
  assert.equal(transport.calls.length, 1);
  assert.equal(result.captures[0]!.outcome, 'INVALID_PAYLOAD');
});

test('fetchTrends sends the documented params, keeps the key out of the capture, and returns typed facts', async () => {
  const transport = fakeTransport(() => jsonResponse(fixture('timeseries')));
  const result = await fetchTrends(KEY, transport, request('TIMESERIES'), {});
  assert.equal(result.status, 'OK');
  if (result.facts?.kind !== 'TIMESERIES') assert.fail('expected TIMESERIES facts');
  assert.equal(transport.calls.length, 1);

  const url = transport.calls[0]!;
  // The host is pinned by the shared transport guard; here we pin the documented path.
  assert.equal(url.protocol, 'https:');
  assert.equal(url.pathname, '/search.json');
  assert.equal(url.searchParams.get('api_key'), KEY);
  assert.equal(url.searchParams.get('engine'), 'google_trends');
  assert.equal(url.searchParams.get('q'), 'bình giữ nhiệt An Nhiên');
  assert.equal(url.searchParams.get('data_type'), 'TIMESERIES');
  assert.equal(url.searchParams.get('geo'), 'VN');
  assert.equal(url.searchParams.get('hl'), 'vi');
  assert.equal(url.searchParams.get('date'), 'today 12-m');

  const capture = result.captures[0]!;
  assert.equal(capture.outcome, 'OK');
  assert.equal(capture.billing, 'PAID_SEARCH_UNLESS_CACHED');
  assert.equal(capture.endpoint.includes('?'), false);
  assert.equal('api_key' in capture.requestParameters, false);
  assert.equal(bytesContainSecret(Buffer.from(JSON.stringify(capture.requestParameters)), KEY), false);
  assert.ok(capture.responseBytes);
  assert.equal(bytesContainSecret(capture.responseBytes!, KEY), false);
});

test('fetchTrends refuses a credential echo and keeps no response bytes', async () => {
  const transport = fakeTransport(() => jsonResponse({ echo: KEY }));
  const result = await fetchTrends(KEY, transport, request('TIMESERIES'), {});
  assert.equal(result.status, 'FAILED');
  const capture = result.captures[0]!;
  assert.equal(capture.outcome, 'CREDENTIAL_ECHO_REFUSED');
  assert.equal(capture.responseBytes, null);
  assert.equal(bytesContainSecret(Buffer.from(JSON.stringify(capture)), KEY), false);
});

test('trendsCacheKey depends on the request and the retrieval day and never carries the key', () => {
  const base = request('TIMESERIES', ['bình giữ nhiệt An Nhiên', 'nồi chiên An Nhiên']);
  const same = request('TIMESERIES', ['bình giữ nhiệt An Nhiên', 'nồi chiên An Nhiên']);
  assert.equal(trendsCacheKey(base, '2026-10-07'), trendsCacheKey(same, '2026-10-07'));
  assert.notEqual(trendsCacheKey(base, '2026-10-07'), trendsCacheKey(base, '2026-10-08'));
  assert.notEqual(trendsCacheKey(base, '2026-10-07'), trendsCacheKey(request('GEO_MAP_0', base.keywords), '2026-10-07'));
  assert.notEqual(trendsCacheKey(base, '2026-10-07'), trendsCacheKey(request('TIMESERIES', ['bình giữ nhiệt An Nhiên']), '2026-10-07'));
  assert.equal(trendsCacheKey(base, '2026-10-07').includes(KEY), false);
});

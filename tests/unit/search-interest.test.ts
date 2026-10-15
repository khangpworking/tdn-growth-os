import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSearchInterestSource, searchInterestChartPoints, searchInterestCoversPeriod, searchInterestDocument, searchInterestRenderable, searchInterestUsage,
  SEARCH_INTEREST_MIN_POINTS, SEARCH_INTEREST_WINDOW_DAYS, searchTrendsEnabled, type SearchInterestAttempt,
} from '../../src/modules/analysis/research-automation/search-interest.js';
import type { TrendsCallResult } from '../../src/modules/analysis/research-automation/search-trends.js';
import { MAX_SEARCH_INTEREST_POINTS } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_OTHER_KEYWORD, SYNTHETIC_TRENDS_KEYWORD, syntheticSearchInterest, syntheticTrendsSource, syntheticWeeks, type SyntheticTrendsMode } from '../helpers/search-interest-synthetic.js';

const NOW = Date.parse('2026-10-02T00:00:00.000Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function called(mode: SyntheticTrendsMode = 'ok'): Promise<{ result: TrendsCallResult; calls: URL[] }> {
  const calls: URL[] = [];
  return { result: await syntheticTrendsSource(url => calls.push(url), mode).collect(SYNTHETIC_TRENDS_KEYWORD), calls };
}
const asCalled = (result: TrendsCallResult): SearchInterestAttempt => ({ kind: 'CALLED', keyword: SYNTHETIC_TRENDS_KEYWORD, result });

test('only the exact value "1" turns the flag on', () => {
  assert.equal(searchTrendsEnabled({ TDN_RESEARCH_SEARCH_TRENDS_ENABLED: '1' }), true);
  for (const value of [undefined, '', '0', 'true', 'TRUE', 'yes', ' 1', '1 ', '01', 'on']) assert.equal(searchTrendsEnabled({ TDN_RESEARCH_SEARCH_TRENDS_ENABLED: value }), false, String(value));
  assert.equal(searchTrendsEnabled({}), false);
});

test('the period guard covers a common 12-month report and rejects what the fixed window cannot hold', () => {
  assert.equal(searchInterestCoversPeriod({ startDate: '2025-10-01', endDate: '2026-09-30' }, NOW), true);
  assert.equal(searchInterestCoversPeriod({ startDate: '2026-09-01', endDate: '2026-10-02' }, NOW), true);
  const edge = iso(NOW - SEARCH_INTEREST_WINDOW_DAYS * DAY);
  assert.equal(searchInterestCoversPeriod({ startDate: edge, endDate: '2026-09-30' }, NOW), true, 'the first allowed day');
  assert.equal(searchInterestCoversPeriod({ startDate: iso(NOW - (SEARCH_INTEREST_WINDOW_DAYS + 1) * DAY), endDate: '2026-09-30' }, NOW), false, 'one day earlier');
  assert.equal(searchInterestCoversPeriod({ startDate: '2024-01-01', endDate: '2024-12-31' }, NOW), false);
  assert.equal(searchInterestCoversPeriod({ startDate: '2026-01-01', endDate: '2027-03-31' }, NOW), false, 'a period that ends in the future');
  assert.equal(searchInterestCoversPeriod({ startDate: '2026-09-01', endDate: '2026-10-03' }, NOW), true, 'one day of clock slack');
  assert.equal(searchInterestCoversPeriod({ startDate: '2026-09-01', endDate: '2026-10-04' }, NOW), false);
  assert.equal(searchInterestCoversPeriod({ startDate: 'not-a-date', endDate: '2026-09-30' }, NOW), false);
});

test('the real client makes exactly one request, never retries a failure, and never calls without a key', async () => {
  for (const mode of ['ok', 'http-error', 'thin', 'invalid'] as const) {
    const { result, calls } = await called(mode);
    assert.equal(calls.length, 1, mode);
    assert.equal(result.captures.length, 1, mode);
    assert.equal(calls[0]!.searchParams.get('data_type'), 'TIMESERIES');
  }
  let n = 0;
  const unkeyed = createSearchInterestSource(null, { fetch: (async () => { n++; return new Response('{}'); }) as typeof fetch, sleep: async () => {}, now: () => NOW });
  const result = await unkeyed.collect(SYNTHETIC_TRENDS_KEYWORD);
  assert.deepEqual([result.status, result.captures.length, n], ['NOT_CONFIGURED', 0, 0]);
  const empty = await syntheticTrendsSource(() => assert.fail('no request for an empty keyword')).collect('   ');
  assert.deepEqual([empty.status, empty.captures.length], ['FAILED', 0]);
});

test('a skipped or thrown attempt stores a reason code and no points', () => {
  assert.deepEqual(searchInterestDocument({ kind: 'SKIPPED', keyword: SYNTHETIC_TRENDS_KEYWORD, reason: 'PERIOD_NOT_COVERED' }, null),
    { status: 'SKIPPED', reason: 'PERIOD_NOT_COVERED', keyword: SYNTHETIC_TRENDS_KEYWORD, geo: 'VN', unit: 'INDEX_0_100', window: 'LAST_12_MONTHS', retrievedAt: null, points: [], captureIndex: null });
  const thrown = searchInterestDocument({ kind: 'THROWN', keyword: SYNTHETIC_TRENDS_KEYWORD }, 4);
  assert.deepEqual([thrown.status, thrown.reason, thrown.captureIndex, thrown.retrievedAt, thrown.points], ['FAILED', 'PROVIDER_FAILED', null, null, []], 'a thrown call has no capture to point at');
});

test('a good answer is stored as a dated index series pointing at its capture', async () => {
  const { result } = await called();
  const stored = searchInterestDocument(asCalled(result), 5);
  assert.deepEqual([stored.status, stored.reason, stored.captureIndex, stored.retrievedAt], ['COLLECTED', null, 5, result.captures[0]!.completedAt]);
  assert.equal(stored.points.length, 52);
  assert.deepEqual(stored.points[0], syntheticWeeks()[0]);
  assert.equal(stored.points.find(point => point.period === syntheticWeeks()[5]!.period)?.index, null, 'a blank week is kept as null, not 0');
  assert.equal(searchInterestRenderable(stored), true);
});

test('a failed, invalid or thin answer keeps its capture pointer and stores a reason code', async () => {
  for (const [mode, reason] of [['http-error', 'PROVIDER_FAILED'], ['invalid', 'PROVIDER_FAILED'], ['thin', 'EMPTY_SERIES']] as const) {
    const { result } = await called(mode);
    const stored = searchInterestDocument(asCalled(result), 2);
    assert.deepEqual([stored.status, stored.reason, stored.captureIndex, stored.points], ['FAILED', reason, 2, []], mode);
    assert.equal(searchInterestRenderable(stored), false, mode);
  }
  const { result } = await called();
  assert.equal(searchInterestDocument(asCalled({ ...result, status: 'CANCELLED', facts: null }), 1).reason, 'CANCELLED');
  const noCapture = searchInterestDocument(asCalled({ status: 'NOT_CONFIGURED', facts: null, captures: [] }), null);
  assert.deepEqual([noCapture.reason, noCapture.captureIndex, noCapture.retrievedAt], ['PROVIDER_FAILED', null, null]);
});

test('the stored series matches the keyword, ignores case and Unicode form, and is capped', async () => {
  const { result } = await called();
  const facts = (series: { keyword: string; points: { period: string; index: number | null }[] }[]): TrendsCallResult => ({ ...result, facts: { kind: 'TIMESERIES', unit: 'INDEX_0_100', series } });
  const other = { keyword: 'khác', points: syntheticWeeks(10, '2025-01-05') };
  const wanted = { keyword: 'Bình  Giữ Nhiệt'.normalize('NFD').replace(/\s+/gu, ' '), points: syntheticWeeks(8) };
  const stored = searchInterestDocument(asCalled(facts([other, wanted])), 1);
  assert.deepEqual(stored.points, syntheticWeeks(8).map(point => ({ period: point.period, index: point.index })), 'the matching series, not the first');
  const long = searchInterestDocument(asCalled(facts([{ keyword: SYNTHETIC_TRENDS_KEYWORD, points: syntheticWeeks(MAX_SEARCH_INTEREST_POINTS + 20) }])), 1);
  assert.equal(long.points.length, MAX_SEARCH_INTEREST_POINTS);
  assert.equal(long.points.at(-1)!.period, syntheticWeeks(MAX_SEARCH_INTEREST_POINTS + 20).at(-1)!.period, 'the latest weeks are kept');
});

test('an answer for a different query is never stored, even when it is well formed and is the only series', async () => {
  const { result, calls } = await called('other-keyword');
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'OK', 'the client itself stays keyword-agnostic');
  assert.deepEqual(result.facts?.kind === 'TIMESERIES' ? result.facts.series.map(item => item.keyword) : null, [SYNTHETIC_OTHER_KEYWORD]);
  const stored = searchInterestDocument(asCalled(result), 3);
  assert.deepEqual([stored.status, stored.reason, stored.captureIndex, stored.retrievedAt, stored.points], ['FAILED', 'PROVIDER_FAILED', 3, result.captures[0]!.completedAt, []]);
  assert.equal(searchInterestRenderable(stored), false);
});

test('only an exact echoed query matches: case, Unicode form and spacing are folded, diacritics are not', async () => {
  const { result } = await called();
  const only = (keyword: string, wanted = SYNTHETIC_TRENDS_KEYWORD) => searchInterestDocument({ kind: 'CALLED', keyword: wanted, result: { ...result, facts: { kind: 'TIMESERIES', unit: 'INDEX_0_100', series: [{ keyword, points: syntheticWeeks(8) }] } } }, 1);
  for (const echoed of ['BÌNH GIỮ NHIỆT', ' bình  giữ nhiệt ', SYNTHETIC_TRENDS_KEYWORD.normalize('NFD'), 'Bình Giữ Nhiệt'.normalize('NFD')]) assert.equal(only(echoed).status, 'COLLECTED', echoed);
  assert.equal(only(SYNTHETIC_TRENDS_KEYWORD, 'BÌNH giữ  nhiệt'.normalize('NFD')).status, 'COLLECTED', 'the requested side is folded the same way');
  for (const echoed of ['binh giu nhiet', 'bình giữ nhiệt inox', 'bình giữ', 'bình giữ nhiệt,nồi chiên', SYNTHETIC_OTHER_KEYWORD]) {
    const stored = only(echoed);
    assert.deepEqual([stored.status, stored.reason, stored.points, searchInterestRenderable(stored)], ['FAILED', 'PROVIDER_FAILED', [], false], echoed);
  }
});

test('a series with no echoed keyword, or several for the same query, is never used and never replaced by another series', async () => {
  const { result } = await called();
  const series = (...keywords: string[]) => asCalled({ ...result, facts: { kind: 'TIMESERIES', unit: 'INDEX_0_100', series: keywords.map(keyword => ({ keyword, points: syntheticWeeks(8) })) } });
  for (const keywords of [[''], ['', SYNTHETIC_OTHER_KEYWORD], [SYNTHETIC_OTHER_KEYWORD, 'binh giu nhiet'], []]) {
    const stored = searchInterestDocument(series(...keywords), 2);
    assert.deepEqual([stored.status, stored.reason, stored.points, stored.captureIndex], ['FAILED', 'PROVIDER_FAILED', [], 2], JSON.stringify(keywords));
  }
  const twice = searchInterestDocument(series(SYNTHETIC_TRENDS_KEYWORD, SYNTHETIC_TRENDS_KEYWORD.toUpperCase()), 2);
  assert.deepEqual([twice.status, twice.reason, twice.points], ['FAILED', 'PROVIDER_FAILED', []], 'two series for one query are ambiguous');
  assert.equal(searchInterestDocument(series(SYNTHETIC_OTHER_KEYWORD, SYNTHETIC_TRENDS_KEYWORD), 2).status, 'COLLECTED', 'the matching one among several still wins');
});

test('the real client turns a missing echoed query or a malformed period series into a failed answer with one capture', async () => {
  for (const mode of ['no-echo', 'bad-period', 'repeated-period'] as const) {
    const { result, calls } = await called(mode);
    assert.equal(calls.length, 1, mode);
    assert.deepEqual([result.status, result.facts, result.captures.length, result.captures[0]!.outcome], ['FAILED', null, 1, 'INVALID_PAYLOAD'], mode);
    const stored = searchInterestDocument(asCalled(result), 4);
    assert.deepEqual([stored.status, stored.reason, stored.captureIndex, stored.points, searchInterestRenderable(stored)], ['FAILED', 'PROVIDER_FAILED', 4, [], false], mode);
  }
});

test('a series is rendered only when collected, anchored to a capture, and has enough real points', () => {
  assert.equal(searchInterestRenderable(syntheticSearchInterest()), true);
  assert.equal(searchInterestRenderable(undefined), false);
  assert.equal(searchInterestRenderable(null), false);
  assert.equal(searchInterestRenderable(syntheticSearchInterest({ status: 'FAILED', reason: 'PROVIDER_FAILED' })), false);
  assert.equal(searchInterestRenderable(syntheticSearchInterest({ captureIndex: null })), false);
  const sparse = (real: number) => syntheticSearchInterest({ points: syntheticWeeks(10).map((point, i) => ({ period: point.period, index: i < real ? 50 : null })) });
  assert.equal(searchInterestRenderable(sparse(SEARCH_INTEREST_MIN_POINTS - 1)), false, 'blank weeks do not count');
  assert.equal(searchInterestRenderable(sparse(SEARCH_INTEREST_MIN_POINTS)), true);
});

test('usage counts the paid request and any ambiguous outcome from the captures', async () => {
  const ok = await called();
  assert.deepEqual(searchInterestUsage(ok.result.captures), { provider: 'SERPAPI', usage: { requestsIssued: 1, paidRequestsIssued: 1, ambiguousPaidRequests: 0, credits: { status: 'UNKNOWN' } } });
  const timeout = { ...ok.result.captures[0]!, outcome: 'TIMEOUT_AMBIGUOUS' } as typeof ok.result.captures[number];
  assert.equal(searchInterestUsage([timeout]).usage.ambiguousPaidRequests, 1);
  assert.equal(searchInterestUsage([]).usage.requestsIssued, 0);
});

test('chart labels are short dates, widen on a collision, and keep unknown period text', () => {
  const labels = (periods: string[]) => searchInterestChartPoints(syntheticSearchInterest({ points: periods.map((period, i) => ({ period, index: i })) })).map(point => point.label);
  assert.deepEqual(labels(['2025-10-05', '2025-10-12']), ['05/10', '12/10']);
  assert.deepEqual(labels(['2025-10-05', '2026-10-05']), ['05/10/25', '05/10/26'], 'the same day in two years gets a year');
  assert.deepEqual(labels(['Oct 5 – 11, 2025', 'Oct 12 – 18, 2025']), ['Oct 5 – 11, 2025', 'Oct 12 – 18, 2025']);
  assert.deepEqual(labels(['same', 'same']), ['same (1)', 'same (2)'], 'labels stay unique');
  const points = searchInterestChartPoints(syntheticSearchInterest());
  assert.equal(points.length, 52);
  assert.equal(points[5]!.value, null, 'a blank week stays a gap');
  assert.equal(Math.max(...points.map(point => point.value ?? 0)), 100);
});

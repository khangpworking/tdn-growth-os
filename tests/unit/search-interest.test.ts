import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSearchInterestSource, searchInterestChartPoints, searchInterestCoversPeriod, searchInterestDocument, searchInterestReadingPoints, searchInterestRenderable, searchInterestUsage,
  searchInterestPeriodSkip, searchInterestRange, searchInterestSourceText, SEARCH_INTEREST_MIN_POINTS, searchTrendsEnabled, type SearchInterestAttempt,
} from '../../src/modules/analysis/research-automation/search-interest.js';
import type { TrendsCallResult } from '../../src/modules/analysis/research-automation/search-trends.js';
import { MAX_SEARCH_INTEREST_POINTS } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_SERP_KEY } from '../helpers/research-synthetic-sources.js';
import { SYNTHETIC_OTHER_KEYWORD, SYNTHETIC_TRENDS_KEYWORD, syntheticSearchInterest, syntheticTrendsBody, syntheticTrendsSource, syntheticWeeks, type SyntheticTrendsMode } from '../helpers/search-interest-synthetic.js';

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

test('requested report periods are accepted with explicit provider range gates', () => {
  assert.equal(searchInterestPeriodSkip({ startDate: '2024-01-01', endDate: '2024-12-31' }, NOW), null);
  assert.equal(searchInterestCoversPeriod({ startDate: '2024-01-01', endDate: '2024-12-31' }, NOW), true);
  assert.equal(searchInterestPeriodSkip({ startDate: '2003-12-31', endDate: '2004-01-02' }, NOW), 'PERIOD_BEFORE_PROVIDER_START');
  assert.equal(searchInterestPeriodSkip({ startDate: '2026-09-01', endDate: '2026-10-04' }, NOW), 'PERIOD_IN_FUTURE');
  assert.equal(searchInterestPeriodSkip({ startDate: '2026-10-02', endDate: '2026-09-01' }, NOW), 'PERIOD_INVALID');
  assert.equal(searchInterestPeriodSkip({ startDate: 'bad', endDate: '2026-09-01' }, NOW), 'PERIOD_INVALID');
  assert.deepEqual(searchInterestRange({ startDate: '2024-01-01', endDate: '2026-10-03' }, NOW), { startDate: '2024-01-01', endDate: '2026-10-02' });
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

test('called evidence records the requested range and sends it to the provider', async () => {
  const calls: URL[] = [];
  const range = { startDate: '2024-01-01', endDate: '2024-12-31' };
  const result = await syntheticTrendsSource(url => calls.push(url)).collect(SYNTHETIC_TRENDS_KEYWORD, {}, range);
  assert.equal(calls[0]!.searchParams.get('date'), '2024-01-01 2024-12-31');
  const doc = searchInterestDocument({ kind: 'CALLED', keyword: SYNTHETIC_TRENDS_KEYWORD, result, range }, 1);
  assert.deepEqual(doc.requestedRange, range);
  assert.equal(doc.window, 'REQUESTED_RANGE');
  assert.match(searchInterestSourceText(doc), /01\/01\/2024 đến 31\/12\/2024/u);
  const bad = await syntheticTrendsSource(() => assert.fail('invalid range must not call')).collect(SYNTHETIC_TRENDS_KEYWORD, {}, { startDate: 'bad', endDate: '2024-01-01' });
  assert.equal(bad.captures.length, 0);
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

test('chart points use completed weeks and Vietnamese date ranges without changing the stored series', () => {
  const stored = syntheticSearchInterest({ retrievedAt: '2026-10-19T09:00:00.000Z', points: [
    { period: '2025-10-12', index: 10 },
    { period: '29 thg 9 – 5 thg 10, 2025', index: null },
    { period: '29 thg 12, 2025 – 4 thg 1, 2026', index: 30 },
    { period: '29 thg 12 – 4 thg 1, 2026', index: 31 },
    { period: '11 – 17 thg 10, 2026', index: 40 },
    { period: '18 – 24 thg 10, 2026', index: 99 },
    { period: '2026-10-18', index: 98 },
  ] });
  const bytes = JSON.stringify(stored);
  assert.deepEqual(searchInterestChartPoints(stored), [
    { label: '12–18/10/2025', value: 10 }, { label: '29/09–05/10/2025', value: null },
    { label: '29/12/2025–04/01/2026', value: 30 }, { label: '29/12/2025–04/01/2026', value: 31 },
    { label: '11–17/10/2026', value: 40 },
  ]);
  assert.equal(JSON.stringify(stored), bytes, 'rendering never rewrites retained evidence');
  assert.equal(searchInterestChartPoints(syntheticSearchInterest()).length, 51, 'the in-progress ISO week is withheld');
});

test('week parsing fails closed for invalid dates, unknown labels and an absent retrieval date', () => {
  const chart = (period: string, retrievedAt: string | null = '2026-10-18T16:59:59Z') =>
    searchInterestChartPoints(syntheticSearchInterest({ retrievedAt, points: [{ period, index: 50 }] }));
  assert.deepEqual(chart('12 – 18 thg 10, 2026'), [], 'the ending day has not finished');
  assert.deepEqual(chart('11 – 17 thg 10, 2026'), [{ label: '11–17/10/2026', value: 50 }]);
  assert.deepEqual(chart('2025-09-29–2025-10-05'), [{ label: '29/09–05/10/2025', value: 50 }]);
  for (const period of ['unknown', '<img src=x>', '30 thg 2 – 8 thg 3, 2026', '2026-02-30', '1 – 18 thg 10, 2026'])
    assert.deepEqual(chart(period), [], period);
  assert.deepEqual(chart('2025-10-12', null), []);
});


test('completed weeks use the Vietnam retrieval day at midnight and at the year boundary', () => {
  const points = [{ period: '12 – 18 thg 10, 2026', index: 50 }];
  const chart = (retrievedAt: string) => searchInterestChartPoints(syntheticSearchInterest({ retrievedAt, points }));
  assert.deepEqual(chart('2026-10-18T16:59:59.999Z'), [], 'still Sunday in Vietnam');
  assert.deepEqual(chart('2026-10-18T17:00:00Z'), [{ label: '12–18/10/2026', value: 50 }], 'Monday in Vietnam');
  assert.deepEqual(chart('2026-10-19T00:00:00+07:00'), chart('2026-10-18T17:00:00Z'));
  assert.deepEqual(chart('invalid-date'), []);
  for (const period of ['29 thg 12, 2025 – 4 thg 1, 2026', '29 thg 12 – 4 thg 1, 2026']) {
    const source = syntheticSearchInterest({ retrievedAt: '2026-01-04T17:00:00Z', points: [{ period, index: 50 }] });
    assert.deepEqual(searchInterestChartPoints(source), [{ label: '29/12/2025–04/01/2026', value: 50 }]);
    assert.deepEqual(searchInterestChartPoints({ ...source, retrievedAt: '2026-01-04T16:59:59Z' }), []);
  }
});


test('SRC1 row 4 / Round 2 dates: invalid and impossible periods are rejected; valid leap day is accepted', () => {
  assert.equal(searchInterestPeriodSkip({ startDate: '2024-02-29', endDate: '2024-03-01' }, NOW), null);
  for (const period of [
    { startDate: '2024-02-02', endDate: '2024-02-01' },
    { startDate: 'not-a-date', endDate: '2024-03-01' },
    { startDate: '2024-01-01', endDate: 'not-a-date' },
    { startDate: '2024-02-30', endDate: '2024-03-01' },
    { startDate: '2023-02-29', endDate: '2023-03-01' },
    { startDate: '2024-01-01', endDate: '2024-02-30' },
    { startDate: '2024-04-31', endDate: '2024-05-01' },
  ]) {
    const reason = searchInterestPeriodSkip(period, NOW);
    assert.equal(reason, 'PERIOD_INVALID', JSON.stringify(period));
    const doc = searchInterestDocument({ kind: 'SKIPPED', keyword: SYNTHETIC_TRENDS_KEYWORD, reason: reason! }, null);
    assert.equal(doc.status, 'SKIPPED');
    assert.equal(doc.captureIndex, null);
    assert.equal(searchInterestUsage([]).usage.requestsIssued, 0);
  }
});

test('SRC1 Round 3 row 1: requested-range daily points display individual dates; weekly points retain seven-day labels', async () => {
  const range = { startDate: '2026-09-01', endDate: '2026-09-05' };
  const indices = [20, null, 100, 40, 30];
  for (const localized of [false, true]) {
    const points = indices.map((index, i) => ({ period: localized ? `${i + 1} thg 9, 2026` : `2026-09-0${i + 1}`, index }));
    let calls = 0;
    const source = createSearchInterestSource(SYNTHETIC_SERP_KEY, {
      fetch: (async () => { calls++; return new Response(syntheticTrendsBody(SYNTHETIC_TRENDS_KEYWORD, points)); }) as typeof fetch,
      sleep: async () => assert.fail('no wait is needed'), now: () => NOW,
    });
    const result = await source.collect(SYNTHETIC_TRENDS_KEYWORD, {}, range);
    assert.equal(calls, 1);
    const stored = searchInterestDocument({ kind: 'CALLED', keyword: SYNTHETIC_TRENDS_KEYWORD, result, range }, 1);
    assert.equal(stored.status, 'COLLECTED');
    assert.deepEqual(stored.points, points, 'retain the provider labels as evidence');
    const bytes = JSON.stringify(stored);
    const expected = indices.map((index, i) => ({ period: `0${i + 1}/09/2026`, index }));
    assert.deepEqual(searchInterestReadingPoints(stored), expected);
    assert.deepEqual(searchInterestChartPoints(stored), expected.map(point => ({ label: point.period, value: point.index })));
    assert.equal(JSON.stringify(stored), bytes, 'rendering leaves retained evidence unchanged');
  }
  const weekly = syntheticSearchInterest({ window: 'REQUESTED_RANGE', requestedRange: { startDate: '2026-09-01', endDate: '2026-09-30' },
    points: [{ period: '2026-09-01', index: 20 }, { period: '2026-09-08', index: 100 }] });
  assert.deepEqual(searchInterestChartPoints(weekly), [{ label: '01–07/09/2026', value: 20 }, { label: '08–14/09/2026', value: 100 }]);
});

test('SRC1 Round 3 row 3: completed days follow Vietnam time; today remains hidden', () => {
  for (const localized of [false, true]) {
    const points = [
      { period: localized ? '30 thg 12, 2025' : '2025-12-30', index: null },
      { period: localized ? '31 thg 12, 2025' : '2025-12-31', index: 40 },
      { period: localized ? '1 thg 1, 2026' : '2026-01-01', index: 100 },
    ];
    const chart = (retrievedAt: string) => searchInterestChartPoints(syntheticSearchInterest({ window: 'REQUESTED_RANGE',
      requestedRange: { startDate: '2025-12-30', endDate: '2026-01-01' }, retrievedAt, points }));
    assert.deepEqual(chart('2025-12-31T16:59:59.999Z'), [{ label: '30/12/2025', value: null }]);
    const completed = [{ label: '30/12/2025', value: null }, { label: '31/12/2025', value: 40 }];
    assert.deepEqual(chart('2025-12-31T17:00:00.000Z'), completed, 'the previous day completes at Vietnam midnight');
    assert.deepEqual(chart('2026-01-01T00:00:00+07:00'), completed, 'equivalent timestamps give the same days');
    assert.deepEqual(chart('2026-01-01T16:59:59.999Z'), completed, 'the unfinished day is still hidden');
    assert.deepEqual(chart('2026-01-01T17:00:00.000Z'), [...completed, { label: '01/01/2026', value: 100 }]);
  }
});

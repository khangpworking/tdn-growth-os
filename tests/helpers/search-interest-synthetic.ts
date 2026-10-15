import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import type { StepSearchInterest } from '../../src/modules/analysis/research-automation/model.js';
import { createSearchInterestSource, searchInterestDocument, type SearchInterestSource } from '../../src/modules/analysis/research-automation/search-interest.js';
import { SYNTHETIC_SERP_KEY } from './research-synthetic-sources.js';

export const SYNTHETIC_TRENDS_KEYWORD = 'bình giữ nhiệt';
const WEEK = 7 * 86_400_000;

/** Weekly synthetic index points: one peak of 100, one blank week, ISO dates. */
export function syntheticWeeks(count = 52, first = '2025-10-05'): { period: string; index: number | null }[] {
  const start = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({ period: new Date(start + i * WEEK).toISOString().slice(0, 10), index: i === 5 ? null : i === 30 ? 100 : 20 + (i * 7) % 45 }));
}

export function syntheticTrendsBody(keyword: string, points: readonly { period: string; index: number | null }[]): string {
  return JSON.stringify({
    search_parameters: { engine: 'google_trends', q: keyword, data_type: 'TIMESERIES', geo: 'VN', hl: 'vi', date: 'today 12-m' },
    interest_over_time: { timeline_data: points.map(point => ({ date: point.period, timestamp: String(Date.parse(`${point.period}T00:00:00Z`) / 1000),
      values: [{ query: keyword, value: point.index === null ? '<1' : String(point.index), extracted_value: point.index ?? 0 }] })) },
  });
}

/** `other-keyword`: a well-formed series echoed for a different query; `no-echo`: values without any echoed query;
 * `bad-period`: one point without a date; `repeated-period`: one week listed twice. */
export type SyntheticTrendsMode = 'ok' | 'http-error' | 'thin' | 'invalid' | 'other-keyword' | 'no-echo' | 'bad-period' | 'repeated-period';
/** A different word, not a re-cased or re-composed form of the requested keyword. */
export const SYNTHETIC_OTHER_KEYWORD = 'nồi chiên không dầu';

type TimelineEntry = { date?: string; timestamp: string; values: { query?: string; value: string; extracted_value: number }[] };

/** The synthetic answer for a mode, as the provider would send it; `null` for the modes that are not a 200 answer. */
export function syntheticTrendsMode(mode: SyntheticTrendsMode, keyword: string): string | null {
  if (mode === 'http-error') return null;
  if (mode === 'other-keyword') return syntheticTrendsBody(SYNTHETIC_OTHER_KEYWORD, syntheticWeeks());
  const body = JSON.parse(syntheticTrendsBody(keyword, mode === 'thin' ? syntheticWeeks(2) : syntheticWeeks())) as { interest_over_time: { timeline_data: TimelineEntry[] } };
  const timeline = body.interest_over_time.timeline_data;
  if (mode === 'no-echo') for (const entry of timeline) for (const item of entry.values) delete item.query;
  if (mode === 'bad-period') delete timeline[10]!.date;
  if (mode === 'repeated-period') timeline[11] = { ...timeline[11]!, date: timeline[10]!.date! };
  return JSON.stringify(body);
}

/** The real trends client over a synthetic transport; no network, one answer per call. */
export function syntheticTrendsSource(onCall: (url: URL) => void, mode: SyntheticTrendsMode = 'ok', keyword = SYNTHETIC_TRENDS_KEYWORD): SearchInterestSource {
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      onCall(new URL(String(input)));
      if (mode === 'http-error') return new Response(JSON.stringify({ error: 'synthetic failure' }), { status: 500, headers: { 'content-type': 'application/json' } });
      if (mode === 'invalid') return new Response(JSON.stringify({ interest_over_time: { timeline_data: { unexpected: true } } }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(syntheticTrendsMode(mode, keyword), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return createSearchInterestSource(SYNTHETIC_SERP_KEY, transport);
}

/** A stored COLLECTED series as the step document keeps it. */
export function syntheticSearchInterest(overrides: Partial<StepSearchInterest> = {}): StepSearchInterest {
  return { ...searchInterestDocument({ kind: 'SKIPPED', keyword: SYNTHETIC_TRENDS_KEYWORD, reason: 'PERIOD_NOT_COVERED' }, null),
    status: 'COLLECTED', reason: null, retrievedAt: '2026-10-02T00:00:01.000Z', points: syntheticWeeks(), captureIndex: 1, ...overrides };
}

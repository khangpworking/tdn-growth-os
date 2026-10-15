import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { createExpandedSearchSource, type ExpandedSearchSource } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import { SYNTHETIC_SERP_KEY } from './research-synthetic-sources.js';

/** The page every synthetic search returns, so the plain row and an extra row share one URL. */
export const SYNTHETIC_SHARED_URL = 'https://example.test/brand';
/** `site-less`: the extra answers carry no `site:` echo; `http-error`: every extra search fails; `bad-answer`: an answer without the echoed query. */
export type SyntheticExpandedMode = 'ok' | 'http-error' | 'bad-answer';

/** One synthetic answer per kind, chosen from the request the way the real provider would have been asked. */
export function syntheticExpandedOrganic(url: URL): unknown[] {
  const q = url.searchParams.get('q') ?? '';
  const kind = q.includes('site:shopee.vn') ? 'shopee' : q.includes('site:tiktok.com') ? 'tiktok' : 'window';
  return [
    { position: 1, title: `Bình giữ nhiệt ${kind} chính hãng`, link: `https://example.test/${kind}/1`, snippet: `Mô tả ${kind} một` },
    { position: 2, title: 'Bình giữ nhiệt chính hãng', link: SYNTHETIC_SHARED_URL, snippet: 'Cùng một trang' },
    { position: 3, title: `Bình giữ nhiệt ${kind} giá tốt`, link: `https://example.test/${kind}/3`, snippet: `Mô tả ${kind} ba` },
  ];
}

/** The real expanded-search source over a synthetic transport; no network. */
export function syntheticExpandedSource(onCall: (url: URL) => void, mode: SyntheticExpandedMode = 'ok'): ExpandedSearchSource {
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      onCall(url);
      if (mode === 'http-error') return new Response(JSON.stringify({ error: 'synthetic failure' }), { status: 500, headers: { 'content-type': 'application/json' } });
      const body = mode === 'bad-answer' ? { organic_results: syntheticExpandedOrganic(url) } : { search_parameters: { q: url.searchParams.get('q') }, organic_results: syntheticExpandedOrganic(url) };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return createExpandedSearchSource(SYNTHETIC_SERP_KEY, transport);
}

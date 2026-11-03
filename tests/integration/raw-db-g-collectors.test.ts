import assert from 'node:assert/strict';
import test from 'node:test';
import { BASES, googleCollectorRun, type Reply } from '../fixtures/raw-db-g-collectors.js';

const isSuggest = (url: URL) => url.hostname === 'suggestqueries.google.com';
const isFollowup = (url: URL) => url.searchParams.get('engine') === 'google_ai_overview';
const searchAnswer = (url: URL, ai_overview: unknown) => ({ search_parameters: { q: url.searchParams.get('q') }, organic_results: [], ai_overview });

// Each C row has one primary test; fixtures use the real lanes over fake transport, never a provider network.
test('RAWDB-G C1: absent flags and every non-1 value make no suggestion requests or Overview follow-ups', async t => {
  for (const value of [undefined, '0', 'true', '01', ' 1', '1 '] as const) {
    const f = await googleCollectorRun(t, { flags: value === undefined ? {} : { suggest: value, overview: value },
      answer: url => ({ body: searchAnswer(url, { page_token: 'synthetic-token' }) }) });
    assert.ok(f.requests.some(r => r.url.searchParams.get('engine') === 'google'), 'positive control: S19 ran');
    assert.deepEqual(f.requests.filter(r => isSuggest(r.url) || isFollowup(r.url)), [], `flag ${String(value)}`);
    assert.deepEqual(f.captures.filter(c => c.operation === 'google.suggest' || c.operation === 'serpapi.google_ai_overview'), []);
  }
});

test('RAWDB-G C2: Market-only runs skip S19b even when its flag is 1', async t => {
  const f = await googleCollectorRun(t, { reports: ['MARKET'], flags: { suggest: '1' } });
  assert.deepEqual(f.requests.filter(r => isSuggest(r.url)), []);
  assert.deepEqual(f.captures.filter(c => c.operation === 'google.suggest'), []);
});

test('RAWDB-G C3: two bases yield exactly 48 ordered Vietnamese prefixes, spaced by 1s, with exact persisted captures', async t => {
  // The third term challenges the two-base/48-call cap; the fixture does not claim an owner receipt for it.
  const f = await googleCollectorRun(t, { reports: ['MARKET', 'INSIGHT'], flags: { suggest: '1' }, keywords: [...BASES, 'ignored third term'] });
  const requests = f.requests.filter(r => isSuggest(r.url));
  const expected = BASES.flatMap(base => [base, ...'a b c d đ e g h i k l m n o p q r s t u v x y'.split(' ').map(letter => `${base} ${letter}`)]);
  assert.equal(requests.length, 48);
  assert.deepEqual(requests.map(r => r.url.searchParams.get('q')), expected);
  for (const [i, r] of requests.entries()) {
    assert.equal(r.url.origin, 'https://suggestqueries.google.com');
    assert.equal(r.url.pathname, '/complete/search');
    assert.deepEqual([...r.url.searchParams.keys()].sort(), ['client', 'gl', 'hl', 'q']);
    assert.equal(r.url.searchParams.get('client'), 'firefox');
    assert.equal(r.url.searchParams.get('hl'), 'vi');
    assert.equal(r.url.searchParams.get('gl'), 'vn');
    if (i > 0) assert.ok(r.started - requests[i - 1]!.ended >= 1_000, 'one second after the preceding response');
  }
  const captures = f.captures.filter(c => c.operation === 'google.suggest');
  assert.equal(captures.length, 48);
  for (const [i, capture] of captures.entries()) {
    assert.deepEqual([capture.step_id, capture.provider, capture.operation, capture.media_type, capture.truncated],
      ['COLLECTION', 'google-suggest', 'google.suggest', 'application/json', 0n]);
    assert.deepEqual(await f.artifacts.read(capture.sha), requests[i]!.bytes, 'capture keeps whitespace and exact body bytes');
  }
});

test('RAWDB-G C4: a block, non-JSON or three consecutive failures stop S19b without retries or loss of earlier captures', async t => {
  const scenarios: { replies: Reply[]; calls: number; saved: number }[] = [
    { replies: [{}, { status: 429, body: { error: 'synthetic blocked' } }], calls: 2, saved: 1 },
    { replies: [{}, { status: 403, body: { error: 'synthetic forbidden' } }], calls: 2, saved: 1 },
    { replies: [{}, { raw: '<html>synthetic block</html>' }], calls: 2, saved: 1 },
    { replies: [{ status: 500 }, {}, { status: 500 }, { status: 500 }, { status: 500 }], calls: 5, saved: 1 },
  ];
  for (const scenario of scenarios) {
    let suggestCalls = 0;
    const f = await googleCollectorRun(t, { flags: { suggest: '1' }, answer: url => isSuggest(url) ? scenario.replies[suggestCalls++] ?? {} : {} });
    const requests = f.requests.filter(r => isSuggest(r.url));
    assert.equal(requests.length, scenario.calls);
    assert.equal(new Set(requests.map(r => r.url.searchParams.get('q'))).size, scenario.calls, 'no prefix retried');
    const captures = f.captures.filter(c => c.operation === 'google.suggest');
    assert.equal(captures.length, scenario.saved, 'failed calls store no capture');
    const success = requests[scenario.replies.findIndex(reply => (reply.status ?? 200) === 200 && reply.raw === undefined)];
    assert.ok(success, 'a valid earlier response reached the collector');
    assert.deepEqual(await f.artifacts.read(captures[0]!.sha), success.bytes);
  }
});

test('RAWDB-G C5: inline answers need no call; token-only answers fetch once per token, with a two-call cap and exact captures', async t => {
  let searchIndex = 0;
  const f = await googleCollectorRun(t, { expanded: true, flags: { overview: '1' }, answer: url => {
    if (isFollowup(url)) return { body: { search_parameters: { page_token: url.searchParams.get('page_token') }, ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'Synthetic fetched answer' }] } } };
    const index = searchIndex++;
    return { body: searchAnswer(url, index === 0
      ? { page_token: 'inline-token-must-not-be-fetched', text_blocks: [{ type: 'paragraph', snippet: 'Synthetic inline answer' }] }
      : { page_token: `synthetic-token-${index}` }) };
  } });
  const followups = f.requests.filter(r => isFollowup(r.url));
  assert.equal(searchIndex, 4, 'one plain plus three expanded S19 responses challenge the follow-up cap');
  assert.deepEqual(followups.map(r => r.url.searchParams.get('page_token')), ['synthetic-token-1', 'synthetic-token-2']);
  for (const request of followups) {
    assert.equal(request.url.origin, 'https://serpapi.com');
    assert.ok(f.requests.some(r => r.url.searchParams.get('engine') === 'google'
      && JSON.parse(r.bytes.toString()).ai_overview.page_token === request.url.searchParams.get('page_token')), 'follow-up token came from this run');
  }
  const captures = f.captures.filter(c => c.operation === 'serpapi.google_ai_overview');
  assert.equal(captures.length, 2);
  for (const [i, capture] of captures.entries()) {
    assert.equal(capture.provider, 'serpapi');
    assert.equal(capture.step_id, 'COLLECTION');
    assert.deepEqual(await f.artifacts.read(capture.sha), followups[i]!.bytes);
    assert.equal(JSON.parse((await f.artifacts.read(capture.sha)).toString()).search_parameters.page_token, `synthetic-token-${i + 1}`);
  }
});

test('RAWDB-G C6: failed Overview follow-ups preserve the run and record paid request usage with unknown cost, never zero', async t => {
  const f = await googleCollectorRun(t, { flags: { overview: '1' }, answer: url => isFollowup(url)
    ? { status: 500, body: { error: 'synthetic follow-up unavailable' } }
    : { body: searchAnswer(url, { page_token: 'synthetic-failing-token' }) } });
  assert.equal(f.requests.filter(r => isFollowup(r.url)).length, 1, 'no paid retry');
  const usage = f.usage.filter(row => row.provider === 'serpapi');
  assert.equal(usage.reduce((n, row) => n + Number(row.request_count), 0), 2, 'one S19 call plus its failed paid follow-up');
  assert.equal(usage.length, 2, 'the follow-up has its own usage record like the existing optional SerpApi lanes');
  for (const row of usage) assert.deepEqual([row.cost_state, row.cost_unit, row.cost_amount], ['UNKNOWN', null, null]);
});

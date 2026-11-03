import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { BASES, RUN, WORKSPACE, googleCollectorRun, type Reply } from '../fixtures/raw-db-g-collectors.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationMarketMethodBridge, type AutomationMarketMethodInput } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import type { CaptureRecord } from '../../src/modules/analysis/research-automation/model.js';

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
    { replies: [{}, { status: 429, raw: 'x'.repeat(256 * 1024 + 1) }], calls: 2, saved: 1 },
    { replies: [{}, { status: 403, raw: 'x'.repeat(256 * 1024 + 1) }], calls: 2, saved: 1 },
    { replies: [{}, { raw: '<html>synthetic block</html>' }], calls: 2, saved: 1 },
    { replies: [{ status: 500 }, {}, { status: 500 }, { status: 500 }, { status: 500 }], calls: 5, saved: 1 },
    { replies: [{}, ...Array.from({ length: 3 }, () => ({ raw: 'x'.repeat(256 * 1024 + 1) }))], calls: 4, saved: 1 },
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

test('RAWDB-G review: explicit owner-confirmed start presets supply one or two S19b bases', async t => {
  for (const presetKeywords of [[BASES[0]], [...BASES]]) {
    const f = await googleCollectorRun(t, { flags: { suggest: '1' }, presetKeywords });
    const prefixes = f.requests.filter(r => isSuggest(r.url)).map(r => r.url.searchParams.get('q'));
    assert.equal(prefixes.length, presetKeywords.length * 24);
    assert.deepEqual(prefixes.filter((_, index) => index % 24 === 0), presetKeywords);
    const usage = f.usage.filter(row => row.provider === 'google-suggest');
    assert.equal(usage.length, 1);
    assert.deepEqual([usage[0]!.request_count, usage[0]!.cost_state, usage[0]!.cost_amount], [BigInt(prefixes.length), 'KNOWN', '0']);
  }
});

test('RAWDB-G review: HTTP 200 Overview errors and invalid answers retain paid usage without captures', async t => {
  const token = 'synthetic-error-token';
  const replies: Reply[] = [
    { body: { search_parameters: { page_token: token }, error: 'Synthetic expired token' } },
    { body: { search_parameters: { page_token: token }, search_metadata: { status: 'Error' }, ai_overview: {} } },
    { body: { search_parameters: { page_token: token } } },
    { body: { search_parameters: { page_token: 'synthetic-wrong-token' }, ai_overview: {} } },
    { raw: '<html>synthetic invalid response</html>' },
  ];
  for (const reply of replies) {
    const f = await googleCollectorRun(t, { flags: { overview: '1' }, answer: url => isFollowup(url) ? reply : { body: searchAnswer(url, { page_token: token }) } });
    assert.equal(f.requests.filter(r => isFollowup(r.url)).length, 1);
    assert.deepEqual(f.captures.filter(c => c.operation === 'serpapi.google_ai_overview'), []);
    const usage = f.usage.filter(row => row.provider === 'serpapi');
    assert.equal(usage.reduce((n, row) => n + Number(row.request_count), 0), 2);
    for (const row of usage) assert.equal(row.cost_state, 'UNKNOWN');
  }
});

test('RAWDB-G review: collected raw answers leave Market and Insight HTML byte-identical and readable', async t => {
  const answer = (url: URL): Reply => isSuggest(url) ? {}
    : isFollowup(url) ? { body: { search_parameters: { page_token: url.searchParams.get('page_token') }, ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'Synthetic answer' }] } } }
      : { body: searchAnswer(url, { page_token: 'synthetic-report-token' }) };
  const off = await googleCollectorRun(t, { reports: ['MARKET', 'INSIGHT'], answer });
  const on = await googleCollectorRun(t, { reports: ['MARKET', 'INSIGHT'], flags: { suggest: '1', overview: '1' }, answer });
  assert.equal(on.captures.filter(c => c.operation === 'google.suggest').length, 24);
  assert.equal(on.captures.filter(c => c.operation === 'serpapi.google_ai_overview').length, 1);
  for (const kind of ['MARKET', 'INSIGHT'] as const) {
    const html = (f: typeof off) => f.db.prepare('SELECT html_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?').get(RUN, kind) as { sha: string };
    assert.equal(html(on).sha, html(off).sha, `${kind} exact HTML digest`);
    await on.service.readReport(WORKSPACE, RUN, kind);
  }
});

test('RAWDB-G review: raw collectors cannot exhaust or change the frozen Market method package', async t => {
  const f = await googleCollectorRun(t, { reports: ['MARKET'] });
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const period = { startDate: '2026-09-01', endDate: '2026-09-30' };
  const request = Buffer.from(JSON.stringify({ region: 'VN', language: 'vi-VN', currency: 'VND', product_id: '12345', date_range: '2026-09-01~2026-09-30' }));
  const response = Buffer.from(JSON.stringify({ success: true, data: { product_id: '12345', product_region: 'vn', revenue: 1250.5, sales_volumn: 0 } }));
  const envelope = { contractVersion: 'research-automation-capture-v1', captureId: 'kalodata-0002', provider: 'KALODATA', operation: 'kalodata.product.detail',
    billing: 'PAID_CREDITS', method: 'POST', endpoint: 'https://www.kalodata.com/openapi/v1/tiktok/product/detail', requestParameters: JSON.parse(request.toString()),
    requestBodyBytesBase64: request.toString('base64'), queryWindow: period, pageNumber: null, productRef: 'kalodata:12345',
    requestedAt: '2026-10-02T00:00:00.000Z', completedAt: '2026-10-02T00:00:01.000Z', outcome: 'OK', httpStatus: 200,
    responseBytesBase64: response.toString('base64'), responseSha256: hash(response), responseByteLength: response.length, providerCode: null };
  const detail = await f.artifacts.put(Buffer.from(canonicalJson(envelope)));
  const capture: CaptureRecord = { stepId: 'COLLECTION', ordinal: 0, artifactSha256: detail.sha256, mediaType: 'application/vnd.tdn.research-automation.capture+json',
    provider: 'kalodata', operation: 'kalodata.product.detail', retrievedAt: envelope.completedAt, window: period, truncated: false };
  // Five near-limit search answers occupy about 53 MiB as envelopes, below the existing 64 MiB method budget.
  const searches = await Promise.all([1, 2].map(async index => {
    const searchBytes = Buffer.from(JSON.stringify({ organic_results: [], ai_overview: { page_token: `synthetic-budget-token-${index}` }, padding: 'x'.repeat(8 * 1024 * 1024 - 512) }));
    return f.artifacts.put(Buffer.from(canonicalJson({ ...envelope, provider: 'SERPAPI', operation: 'serpapi.google.search', billing: 'PAID_SEARCH_UNLESS_CACHED',
      method: 'GET', endpoint: 'https://serpapi.com/search.json', requestParameters: { engine: 'google', q: BASES[0] }, requestBodyBytesBase64: null,
      queryWindow: null, productRef: null, responseBytesBase64: searchBytes.toString('base64'), responseSha256: hash(searchBytes), responseByteLength: searchBytes.length })));
  }));
  const storedRun = f.db.prepare('SELECT start_request_sha256 startSha,scope_request_sha256 scopeSha FROM analysis_research_automation_runs WHERE run_id=?').get(RUN) as { startSha: string; scopeSha: string };
  const input: AutomationMarketMethodInput = { runId: RUN,
    start: JSON.parse((await f.artifacts.read(storedRun.startSha)).toString()), scope: JSON.parse((await f.artifacts.read(storedRun.scopeSha)).toString()),
    collection: { contractVersion: 'research-automation-step-result-v1', runId: RUN, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [],
      comparables: [{ productId: 'kalodata:12345', provider: 'kalodata', metric: 'GMV_VND', value: '1250.5', window: period, captureIndex: 0 }], coverage: [], limitations: [] },
    captures: [capture, ...Array.from({ length: 5 }, (_, index) => ({ ...capture, ordinal: index + 1, artifactSha256: searches[index % 2]!.sha256, provider: 'serpapi', operation: 'serpapi.google.search', window: null }))] };
  const bridge = new AutomationMarketMethodBridge({ db: f.db, artifactStore: f.artifacts, now: () => new Date('2026-10-02T00:00:00.000Z') });
  const baseline = await bridge.execute(input);
  assert.ok(baseline, 'positive control: existing captures fit and yield verified methods');
  const raw = await Promise.all([1, 2].map(index => f.artifacts.put(Buffer.from(JSON.stringify({ search_parameters: { page_token: `synthetic-budget-token-${index}` },
    ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'Synthetic answer' }] }, padding: 'x'.repeat(8 * 1024 * 1024 - 512) })))));
  const withRaw = { ...input, captures: [...input.captures, ...[6, 7].map((ordinal, index) => ({ ...capture, ordinal, artifactSha256: raw[index]!.sha256,
    mediaType: 'application/json', provider: 'serpapi', operation: 'serpapi.google_ai_overview', window: null }))] };
  // These two valid <=8 MiB raw answers would push the old bridge above its 64 MiB bound.
  assert.deepEqual(await bridge.execute(withRaw), baseline);
  await bridge.verify(baseline, withRaw);
});

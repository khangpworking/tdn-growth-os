import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { FakeClock, FakeTransport, ORIGIN, assertNoRawLeak, streamedResponse, successfulScript, temporaryPublicStore, type Exchange } from '../helpers/shopee-public-fakes.js';
import { AT, IDS, PRODUCTS, RAW_SENTINELS, READY, RESULT_A, RESULT_B, RESULT_C, SHARED_ID, TOKEN, WRONG_SOURCE_RESULT, SECRET_ECHO_RESULT, ENCODED_SECRET_ECHO_RESULT, job, result, row } from '../fixtures/shopee-public-results.js';

// BEGIN PHASE-2 BINDING: only this section adapts source names/signatures/projections.
// The contract specifies behavior, not these test-facade function/property names.
import { ShopeePublicReviewCollector } from '../../src/platform/collectors/shopee-public-reviews.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { researchAutomationProviderConfigFromEnv } from '../../src/modules/analysis/research-automation/providers.js';
import { sanitizeProjection, corpusProjection, classifyProjection, receiptProjection, withCollectorCrash, observeBudgets, journalProjection } from '../helpers/shopee-public-binding.js';
type OpenOptions = { journalRoot: string; fetch: typeof fetch; clock: FakeClock; cap?: number; signal?: AbortSignal; sourceSet?: string; requestDigest?: string; mapping?: string; faultAt?: string };
interface Session { run(products?: readonly unknown[]): Promise<any>; requestsIssued(): number }
const bindings = {
  config: researchAutomationProviderConfigFromEnv as (env: NodeJS.ProcessEnv) => any,
  publicConfig: (config: any): any => config.shopeePublicReviews,
  open(options: OpenOptions): Session {
    let collector: ShopeePublicReviewCollector;
    return { run: async (products = PRODUCTS.slice(0, 1)) => {
      if (options.mapping) {
        const files = await (await import('../helpers/shopee-public-fakes.js')).retainedFiles(options.journalRoot);
        for (const [name,bytes] of files) if (name.endsWith('.json')) { const j=JSON.parse(bytes.toString()); j.mappingRevision=options.mapping; await fs.writeFile(path.join(options.journalRoot,name),JSON.stringify(j)); }
      }
      return withCollectorCrash(options.faultAt, async injected => {
        collector = new ShopeePublicReviewCollector({ token: TOKEN, baseUrl: ORIGIN, journalRoot: options.journalRoot,
          maxReviewsPerProduct: options.cap ?? 20, fetch: injected ?? options.fetch, sleep: options.clock.sleep, clock: options.clock.now,
          confirmedSourceSetSha256: options.sourceSet ?? 'a'.repeat(64) });
        return collector.collect(products as any, options.requestDigest ?? 'b'.repeat(64), 'synthetic-run', options.signal);
      },options.fetch);
    }, requestsIssued: () => collector.requestsIssued() };
  },
  sanitize: sanitizeProjection,
  corpus: corpusProjection,
  classify: classifyProjection,
  receipts: receiptProjection,
  observeRequestBudgets: observeBudgets,
  journalIntent: journalProjection,
};
// END PHASE-2 BINDING. Expected values below come solely from decision.md.

const enabled = { TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED: '1', TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN: TOKEN };
const setting = 'TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT';
const baseSetting = 'TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL';

async function s05Journal(journalRoot: string) {
  const name = (await fs.readdir(journalRoot, { recursive: true })).find(name => name.endsWith('.json'));
  assert.ok(name);
  const file = path.join(journalRoot, name);
  return { file, value: JSON.parse(await fs.readFile(file, 'utf8')) };
}

test('S05 row 1: baseline tolerates foreign and malformed rows but rejects non-array or oversized lists', async t => {
  const rows = [job(1, 'invented', { request: { url: 'https://example.invalid/item', max_comments: 20 } }),
    job(2, 'invented'), { id: IDS[0] }, null, 'synthetic-row', [], { id: 'invalid-id' }];
  for (const [list, accepted] of [[rows, true], [{ jobs: [] }, false], [Array(101).fill(null), false]] as const) {
    const store = await temporaryPublicStore(t), clock = new FakeClock();
    const script = accepted ? successfulScript() : successfulScript().slice(0, 2);
    script[1]!.body = list;
    const transport = new FakeTransport(script), client = bindings.open({ ...store, clock, fetch: transport.fetch });
    const value = await client.run(); transport.done();
    assert.equal(transport.posts().length, accepted ? 1 : 0);
    assert.equal(value.listings[0].stopCode, accepted ? null : 'SHOPEE_REVIEW_INVALID_RESPONSE');
    assert.equal(value.listings[0].requestCount, accepted ? 8 : 2);
    assert.equal(client.requestsIssued(), transport.calls.length);
    const { value: journal } = await s05Journal(store.journalRoot);
    assert.deepEqual(journal.baselineIds, accepted ? [IDS[1], IDS[2], IDS[0]] : []);
    assert.equal(journal.intentAt, accepted ? AT : null);
    assert.equal(journal.deadline, accepted ? '2026-02-01T00:40:00.000Z' : null);
  }
});

test('S05 row 2: baseline retains UUID ids from invalid bodies and excludes unusable ids', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript();
  script[1]!.body = [{ id: IDS[1] }, job(2, 'invented'), { id: '' }, { id: 42 },
    { id: 'not-a-uuid' }, {}, null, [IDS[0]]];
  const transport = new FakeTransport(script);
  const value = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done();
  assert.equal(value.listings[0].stopCode, null); assert.equal(transport.posts().length, 1);
  assert.deepEqual((await s05Journal(store.journalRoot)).value.baselineIds, [IDS[1], IDS[2]]);
});

test('S05 row 3: recovery finds our job among foreign and malformed rows and rejects two matches', async t => {
  for (const duplicate of [false, true]) {
    const store = await temporaryPublicStore(t), clock = new FakeClock();
    const script = successfulScript().slice(0, 2);
    script.push({ method: 'POST', path: '/jobs', error: new TypeError('synthetic disconnect') },
      { method: 'GET', path: '/jobs?limit=100', body: [job(1), null, { id: IDS[2] },
        job(2, 'invented', { request: { url: 'https://example.invalid/item', max_comments: 20 } }),
        job(0, 'queued', { request: { url: `https://shopee.vn/synthetic-i.${PRODUCTS[0].shopId}.${PRODUCTS[0].itemId}`, max_comments: 20 } }),
        ...(duplicate ? [job(0, 'queued', { id: IDS[2] })] : [])] });
    if (!duplicate) script.push(...successfulScript().slice(3));
    const transport = new FakeTransport(script), client = bindings.open({ ...store, clock, fetch: transport.fetch });
    const value = await client.run(); transport.done();
    assert.equal(value.listings[0].stopCode, duplicate ? 'SUBMISSION_UNCERTAIN' : null);
    assert.equal(value.listings[0].jobId, duplicate ? null : IDS[0]);
    assert.equal(transport.posts().length, 1);
    assert.equal(value.listings[0].requestCount, transport.calls.length);
    const replay = new FakeTransport([]);
    await bindings.open({ ...store, clock, fetch: replay.fetch }).run(); replay.done();
  }
});

test('S05 row 4: invalid new rows claiming our URL refuse recovery while baseline and foreign rows are ignored', async t => {
  for (const kind of ['new', 'baseline', 'foreign', 'missing-id'] as const) {
    const store = await temporaryPublicStore(t), clock = new FakeClock();
    const invalid = job(0, 'invented', { id: kind === 'missing-id' ? 'invalid-id' : IDS[1],
      request: { url: kind === 'foreign' ? PRODUCTS[1].productUrl : PRODUCTS[0].productUrl, max_comments: 20 } });
    const refused = kind === 'new' || kind === 'missing-id';
    const script = successfulScript().slice(0, 2);
    script[1]!.body = kind === 'baseline' ? [{ id: IDS[1] }] : [];
    script.push({ method: 'POST', path: '/jobs', status: 503 },
      { method: 'GET', path: '/jobs?limit=100', body: [invalid, job()] });
    if (!refused) script.push(...successfulScript().slice(3));
    const transport = new FakeTransport(script);
    const value = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done();
    assert.equal(value.listings[0].stopCode, refused ? 'SUBMISSION_UNCERTAIN' : null, kind);
    assert.equal(transport.posts().length, 1);
  }
});

test('S05 row 5: recovery preserves raw 100-row window, created_at window and future-time refusals', async t => {
  const old = job(1, 'queued', { created_at: '2026-01-31T23:59:57.999Z' });
  const recent = Array.from({ length: 99 }, (_, n) => job(1, 'queued', {
    id: `20000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}` }));
  const cases: Array<[string, unknown[], boolean, number]> = [
    ['complete-window', [job(), ...recent.slice(0, 98), old], true, 0],
    ['full-window', [job(), ...recent], false, 0],
    // Malformed rows still count toward the raw window limit.
    ['full-window-with-malformed', [job(), ...Array(99).fill(null)], false, 0],
    ['too-old', [job(0, 'queued', { created_at: '2026-01-31T23:59:57.999Z' })], false, 0],
    ['outside-submit-window', [job(0, 'queued', { created_at: '2026-02-01T00:00:12.001Z' })], false, 15000],
    ['future', [job(0, 'queued', { created_at: '2026-02-01T00:00:02.001Z' })], false, 0],
    ['foreign-future', [job(), job(1, 'queued', { created_at: '2026-02-01T00:00:02.001Z' })], false, 0],
  ];
  const actual: unknown[] = [], expected: unknown[] = [];
  for (const [name, rows, accepted, advance] of cases) {
    const store = await temporaryPublicStore(t), clock = new FakeClock();
    const script = successfulScript().slice(0, 2);
    script.push({ method: 'POST', path: '/jobs', status: 503 },
      { method: 'GET', path: '/jobs?limit=100', body: rows, inspect: () => clock.advance(advance) });
    // A terminal status makes an incorrectly adopted job observable without a polling loop.
    const transport = new FakeTransport([...script, { method: 'GET', path: `/jobs/${IDS[0]}`, body: job(0, 'failed') }]);
    const value = await bindings.open({ ...store, clock, fetch: transport.fetch }).run();
    assert.equal(transport.unlisted.length, 0); assert.equal(transport.posts().length, 1);
    actual.push([name, value.listings[0].stopCode, transport.calls.length]);
    expected.push([name, accepted ? null : 'SUBMISSION_UNCERTAIN', accepted ? 5 : 4]);
  }
  assert.deepEqual(actual, expected);
});

test('S05 row 6: old journals with UUID baselineIds still verify and malformed ids are rejected', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript(); script[1]!.body = [job(1)];
  const transport = new FakeTransport(script);
  const first = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done();
  const { file, value: journal } = await s05Journal(store.journalRoot);
  assert.equal(journal.contractVersion, 'shopee-public-journal-v1');
  assert.deepEqual(journal.baselineIds, [IDS[1]]);
  const replay = new FakeTransport([]);
  assert.deepEqual(await bindings.open({ ...store, clock, fetch: replay.fetch }).run(), { ...first, reused: true }); replay.done();
  await fs.writeFile(file, canonicalJson({ ...journal, baselineIds: ['invalid-id'] }));
  const invalid = new FakeTransport([]);
  await assert.rejects(bindings.open({ ...store, clock, fetch: invalid.fetch }).run()); invalid.done();
});

test('S1 disabled ignores malformed companions and exposes no public configuration', () => {
  const expected = bindings.config({});
  for (const flag of [undefined, '0']) {
    const value = bindings.config({ ...(flag === undefined ? {} : { TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED: flag }),
      TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN: '\n', [setting]: '01', [baseSetting]: 'invalid' });
    assert.deepEqual(value, expected); assert.equal(bindings.publicConfig(value), undefined);
  }
});
test('S1 enabled caps and trial semantics use the frozen effective integer', () => {
  assert.equal(bindings.publicConfig(bindings.config(enabled)).maxReviewsPerProduct, 300);
  for (const cap of [1, 20, 21, 299, 300]) {
    const config = bindings.config({ ...enabled, [setting]: String(cap) });
    assert.equal(bindings.publicConfig(config).maxReviewsPerProduct, cap);
    assert.equal(config.autorunTestReviewCap, undefined);
    if (cap <= 20) assert.equal(bindings.config({ ...enabled, [setting]: String(cap), TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' }).autorunTestReviewCap, cap);
    else assert.throws(() => bindings.config({ ...enabled, [setting]: String(cap), TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' }));
  }
  for (const value of ['0', '301', '1.5', '1e2', '+1', '-1', '01', '', ' ', ' 20', '20 ']) assert.throws(() => bindings.config({ ...enabled, [setting]: value }), JSON.stringify(value));
  for (const value of ['', 'true', '01', '2', ' ']) assert.throws(() => bindings.config({ ...enabled, TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED: value }));
});
test('S1 token validation and mutually exclusive complete collectors never echo secrets', () => {
  for (const value of [undefined, '', ' ', 'x y', '\n', '\u007f', 'é', 'x'.repeat(513)]) {
    assert.throws(() => bindings.config({ ...enabled, TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN: value }), (e: any) => {
      assert.doesNotMatch(String(e), /synthetic-secret|\u007f|é/u); return true;
    });
  }
  assert.doesNotThrow(() => bindings.config({ ...enabled, TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN: 'x'.repeat(512) }));
  assert.doesNotThrow(() => bindings.config({ ...enabled, TDN_APIFY_TOKEN: 'synthetic-shared-token' }));
  assert.throws(() => bindings.config({ ...enabled, TDN_APIFY_TOKEN: 'synthetic-shared-token', TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '1' }));
});
test('S1 literal loopback origins only; URL normalization must not broaden the allowlist', () => {
  for (const url of [ORIGIN, ORIGIN + '/', 'http://[::1]:8877', 'http://[::1]:8877/']) assert.doesNotThrow(() => bindings.config({ ...enabled, [baseSetting]: url }));
  const lan = [192, 168, 1, 2].join('.'), wildcard = Array(4).fill(0).join('.');
  for (const url of ['http://localhost:8877', 'http://example.invalid:8877', `http://${lan}:8877`, `http://${wildcard}:8877`,
    'http://127.1:8877', 'http://2130706433:8877', 'http://0177.0.0.1:8877', 'http://0x7f000001:8877',
    'http://127.0.0.1:8878', 'https://127.0.0.1:8877', `${ORIGIN}/path`, `${ORIGIN}?q=1`, `${ORIGIN}#x`, 'http://user:password@127.0.0.1:8877']) assert.throws(() => bindings.config({ ...enabled, [baseSetting]: url }));
});

test('S2 serial ready/preflight/POST/poll/result/consistency protocol and dispatch counter', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(20);
  const transport = new FakeTransport(successfulScript([20, 20, 20]), () => clock.milliseconds);
  const client = bindings.open({ ...store, clock, fetch: transport.fetch });
  const collected = await client.run(PRODUCTS);
  transport.done(); assert.equal(transport.calls.length, 24); assert.equal(client.requestsIssued(), 24);
  assert.equal(transport.posts().length, 3);
  assert.deepEqual(transport.posts().map(c => JSON.parse(String(c.init.body)).url), PRODUCTS.map(p => p.productUrl));
  assert.ok(clock.sleeps.length >= 6); assert.ok(clock.sleeps.every(ms => ms === 3000));
  for (const id of IDS) {
    const polls = transport.calls.filter(c => new URL(c.url).pathname === `/jobs/${id}`);
    assert.equal(polls[1]!.at - polls[0]!.at, 3000); assert.equal(polls[2]!.at - polls[1]!.at, 3000);
  }
  for (const call of transport.calls) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`); assert.equal(headers.has('origin'), false);
    assert.equal(headers.get('content-type'), call.method === 'POST' && new URL(call.url).pathname === '/jobs' ? 'application/json' : null);
    assert.equal(call.init.redirect, 'error'); assert.equal(call.init.cache, 'no-store'); assert.ok(call.init.signal instanceof AbortSignal);
  }
  assert.equal(bindings.receipts(collected).length, 3);
  await assertNoRawLeak(store.root, RAW_SENTINELS);
  for (const [name] of await (await import('../helpers/shopee-public-fakes.js')).retainedFiles(store.journalRoot)) {
    assert.equal((await fs.stat(path.join(store.journalRoot, name))).mode & 0o777, 0o600);
  }
  assert.equal((await fs.stat(store.journalRoot)).mode & 0o777, 0o700);
});
for (const browser of ['starting', 'browser_error', 'awaiting_user_login', 'needs_login', 'needs_verification', 'unknown']) test(`S2 non-ready health ${browser} stops all products`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const transport = new FakeTransport([{ method: 'GET', path: '/health', body: { ...READY, browser } }]);
  const collected = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(PRODUCTS);
  assert.equal(bindings.classify(bindings.receipts(collected), 20).outcome, 'PROVIDER_BLOCKED');
  transport.done(); assert.equal(transport.calls.length, 1); assert.equal(transport.posts().length, 0);
});
for (const status of [401, 403, 404, 409, 422, 429]) test(`S2 HTTP ${status} stops without retry`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const transport = new FakeTransport([{ method: 'GET', path: '/health', status, body: { detail: 'synthetic untrusted error' } }]);
  const client = bindings.open({ ...store, clock, fetch: transport.fetch });
  const collected = await client.run(PRODUCTS); transport.done(); assert.equal(client.requestsIssued(), 1); assert.equal(transport.calls.length, 1);
  assert.equal(bindings.classify(bindings.receipts(collected), 20).outcome, 'PROVIDER_BLOCKED');
});
test('S05 row 7: retryable GET permits at most two dispatches with accurate counters; success and non-retryable errors dispatch once', async t => {
  for (const kind of ['success', 'non-retryable', '5xx', 'transport', 'timeout', 'retry-success'] as const) {
    const store = await temporaryPublicStore(t), clock = new FakeClock();
    const statusPath = `/jobs/${IDS[0]}`;
    const retryable = !['success', 'non-retryable'].includes(kind);
    const accepted = kind === 'success' || kind === 'retry-success';
    const failure: Exchange = kind === 'transport' ? { method: 'GET', path: statusPath, error: new TypeError('synthetic disconnect') }
      : kind === 'timeout' ? { method: 'GET', path: statusPath, error: new DOMException('synthetic timeout', 'TimeoutError') }
      : { method: 'GET', path: statusPath, status: kind === 'non-retryable' ? 422 : 503 };
    const terminal: Exchange = { method: 'GET', path: statusPath, body: job(0, 'failed') };
    const script = successfulScript().slice(0, 3);
    script.push(...(kind === 'success' ? [terminal] : kind === 'retry-success' ? [failure, terminal]
      : retryable ? [failure, { ...failure }] : [failure]));
    const transport = new FakeTransport(script), client = bindings.open({ ...store, clock, fetch: transport.fetch });
    const value = await client.run(); transport.done();
    const count = retryable ? 5 : 4;
    assert.equal(transport.calls.filter(call => call.method === 'GET' && new URL(call.url).pathname === statusPath).length, retryable ? 2 : 1, kind);
    assert.deepEqual(clock.sleeps, retryable ? [3000] : [], kind);
    assert.equal(transport.posts().length, 1, kind);
    assert.equal(client.requestsIssued(), count, kind);
    assert.equal(value.listings[0].requestCount, count, kind);
    assert.equal(value.listings[0].requestCountUncertain, false, kind);
    assert.equal(value.listings[0].stopCode, accepted ? null : kind === 'timeout' ? 'SHOPEE_REVIEW_TIMEOUT' : kind === 'transport' ? 'SHOPEE_REVIEW_TRANSPORT' : kind === 'non-retryable' ? 'SHOPEE_REVIEW_HTTP_422' : 'SHOPEE_REVIEW_HTTP_5XX', kind);
    const { value: journal } = await s05Journal(store.journalRoot);
    assert.equal(journal.requestCount, count, kind);
    assert.equal(journal.terminal.requestCount, count, kind);
    assert.equal(journal.terminal.stopCode, value.listings[0].stopCode, kind);
  }
});
for (const operation of ['health', 'list', 'submit', 'status', 'cancel', 'result']) test(`S2 ${operation} request/body deadline budget`, async () => {
  for (const remaining of [100000, 1250]) {
    const actual = await bindings.observeRequestBudgets(operation, remaining);
    const expected = Math.min(operation === 'result' ? 30000 : 10000, remaining);
    assert.equal(actual.request, expected); assert.equal(actual.body, expected); assert.ok(actual.sleep <= remaining);
  }
});
test('S2 optional checkpoint metadata is absent and complete never becomes true before terminal', () => {
  const safe = bindings.sanitize({ job_id: IDS[0], product_url: PRODUCTS[0].productUrl, complete: false, records: [row()], excluded: [], pages: [] });
  assert.equal(safe.complete, false); assert.equal(safe.expectedWithComments, null);
  assert.equal(JSON.stringify(safe).includes('synthetic-author-only'), false);
});
for (const change of [{ state: 'invented' }, { id: IDS[1] }, { request: { url: PRODUCTS[1].productUrl, max_comments: 20 } },
  { request: { url: PRODUCTS[0].productUrl, max_comments: 21 } }, { created_at: '2026-02-02T00:00:00.000Z' }]) test(`S2 invalid poll identity/state ${JSON.stringify(change)} stops`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript().slice(0, 4); script[3]!.body = job(0, 'running', change);
  const transport = new FakeTransport(script); const collected = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(PRODUCTS);
  assert.equal(bindings.classify(bindings.receipts(collected), 20).outcome, 'PROVIDER_BLOCKED');
  transport.done(); assert.equal(transport.posts().length, 1);
});
test('S2 response bound cancels streaming reader even without Content-Length', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const streamed = streamedResponse(Array.from({ length: 10 }, () => new Uint8Array(1024 * 1024).fill(32)));
  const transport = new FakeTransport([{ method: 'GET', path: '/health', response: () => streamed.response }]);
  const collected = await bindings.open({ ...store, clock, fetch: transport.fetch }).run();
  assert.equal(bindings.classify(bindings.receipts(collected), 20).outcome, 'PROVIDER_BLOCKED');
  assert.equal(streamed.cancelled, true); assert.ok(streamed.chunksRead < 10); assert.equal(transport.calls.length, 1);
});
for (const response of [() => new Response('{}', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }),
  () => new Response('{invalid'), () => new Response(null, { status: 302, headers: { location: 'https://example.invalid/' } })]) test('S2 length/malformed/redirect rejection never follows a URL', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const transport = new FakeTransport([{ method: 'GET', path: '/health', response }]);
  const collected = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done(); assert.equal(transport.calls.length, 1);
  assert.equal(bindings.classify(bindings.receipts(collected), 20).outcome, 'PROVIDER_BLOCKED');
});

const crashPoints = ['before-intent', 'after-intent-before-dispatch', 'after-accepted-before-id', 'after-202-before-fsync', 'after-durable-id-before-poll', 'during-poll', 'after-terminal-snapshot'] as const;
for (const faultAt of crashPoints) test(`S3 restart from disk at ${faultAt} never double submits`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const firstTransport = new FakeTransport(successfulScript());
  await assert.rejects(bindings.open({ ...store, clock, fetch: firstTransport.fetch, faultAt }).run());
  const before = firstTransport.posts().length;
  store.reopen();
  const known = ['after-durable-id-before-poll', 'during-poll'].includes(faultAt);
  const script: Exchange[] = faultAt === 'after-terminal-snapshot' ? [] : faultAt === 'before-intent' ? successfulScript() : known ? successfulScript().slice(3) :
    [{ method: 'GET', path: '/jobs?limit=100', body: [job()] }, ...successfulScript().slice(3)];
  const transport = new FakeTransport(script);
  await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done();
  assert.ok(before + transport.posts().length <= 1);
});
for (const [name, candidates] of [
  ['none', []], ['two', [job(), job(0, 'queued', { id: '10000000-0000-4000-8000-000000000099' })]],
  ['wrong-cap', [job(0, 'queued', {}, 21)]], ['wrong-url', [job(1)]],
  ['too-old', [job(0, 'queued', { created_at: '2026-01-31T23:59:57.999Z' })]], ['future', [job(0, 'queued', { created_at: '2026-02-01T00:00:12.001Z' })]],
  ['malformed', {}],
] as const) test(`S3 unresolved submit ${name} stops and never resubmits`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript().slice(0, 3); script[2] = { method: 'POST', path: '/jobs', status: 503 };
  script.push({ method: 'GET', path: '/jobs?limit=100', body: candidates });
  const transport = new FakeTransport(script);
  const value = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(PRODUCTS); transport.done();
  assert.equal(transport.posts().length, 1); assert.equal(bindings.receipts(value)[0].stopReason, 'SUBMISSION_UNCERTAIN');
  const replay = new FakeTransport([]); await bindings.open({ ...store, clock, fetch: replay.fetch }).run(PRODUCTS);
  assert.equal(replay.calls.length, 0);
});
test('S3 one new canonical URL/cap/window candidate is adopted and persisted before polling', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript(); script[2] = { method: 'POST', path: '/jobs', error: new TypeError('synthetic disconnect') };
  script.splice(3, 0, { method: 'GET', path: '/jobs?limit=100', body: [job()] });
  const transport = new FakeTransport(script); await bindings.open({ ...store, clock, fetch: transport.fetch }).run();
  transport.done(); assert.equal(transport.posts().length, 1);
});
test('S3 frozen request/cap/mapping/source-set mismatch refuses reuse', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const transport = new FakeTransport(successfulScript()); await bindings.open({ ...store, clock, fetch: transport.fetch }).run();
  for (const changed of [{ cap: 7 }, { mapping: 'different-mapping' }, { requestDigest: 'c'.repeat(64) }, { sourceSet: 'd'.repeat(64) }]) {
    const replay = new FakeTransport([]);
    await assert.rejects(bindings.open({ ...store, clock, fetch: replay.fetch, ...changed }).run()); assert.equal(replay.calls.length, 0);
  }
});
test('S3 terminal evidence is immutable when server has subsequently resumed', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const transport = new FakeTransport(successfulScript()); const first = await bindings.open({ ...store, clock, fetch: transport.fetch }).run();
  store.reopen(); const replay = new FakeTransport([]);
  assert.deepEqual(bindings.receipts(await bindings.open({ ...store, clock, fetch: replay.fetch }).run()), bindings.receipts(first)); assert.equal(replay.calls.length, 0);
});
for (const failure of ['baseline-id', 'truncated-list', 'unavailable-list', 'clock-reversed']) test(`S3 reconciliation rejects ${failure}`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript().slice(0, 3);
  if (failure === 'baseline-id') script[1]!.body = [job()];
  script[2] = { method: 'POST', path: '/jobs', status: 503 };
  const candidates = failure === 'truncated-list' ? Array.from({ length: 100 }, (_, n) => job(0, 'queued', { id: `20000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`, created_at: '2026-02-01T00:00:20.000Z' })) : [job()];
  script.push({ method: 'GET', path: '/jobs?limit=100', ...(failure === 'unavailable-list' ? { status: 401 } : { body: candidates }),
    ...(failure === 'clock-reversed' ? { inspect: () => clock.advance(-10000) } : {}) });
  const transport = new FakeTransport(script); const value = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(PRODUCTS);
  transport.done(); assert.equal(transport.posts().length, 1); assert.equal(bindings.receipts(value)[0].stopReason, 'SUBMISSION_UNCERTAIN');
});
for (const fault of ['corrupt', 'symlink', 'conflicting-file']) test(`S3 ${fault} journal refuses reuse without HTTP`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  await bindings.open({ ...store, clock, fetch: new FakeTransport(successfulScript()).fetch }).run();
  const files = await (await import('../helpers/shopee-public-fakes.js')).retainedFiles(store.journalRoot);
  const first = [...files.keys()].find(name => name.endsWith('.json')); assert.ok(first);
  const target = path.join(store.journalRoot, first);
  if (fault === 'corrupt') await fs.writeFile(target, '{invalid');
  else if (fault === 'symlink') { const bytes = await fs.readFile(target); await fs.unlink(target); const linked = path.join(store.root, 'synthetic-linked.json'); await fs.writeFile(linked, bytes); await fs.symlink(linked, target); }
  else { const value = JSON.parse((await fs.readFile(target)).toString()); await fs.writeFile(target, JSON.stringify({ ...value, maxReviewsPerProduct: 7 })); }
  const transport = new FakeTransport([]); await assert.rejects(bindings.open({ ...store, clock, fetch: transport.fetch }).run()); assert.equal(transport.calls.length, 0);
});
for (const count of [1, 3, 5]) test(`S2 persisted deadlines include queue and restart for ${count} selected products`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const selected = Array.from({ length: count }, (_, n) => ({ shopId: String(91001 + n), itemId: String(92001 + n), productUrl: `https://shopee.vn/product/${91001 + n}/${92001 + n}` }));
  const script = successfulScript().slice(0, 4);
  script[3]!.inspect = () => clock.advance(40 * 60 * 1000);
  script.push({ method: 'POST', path: `/jobs/${IDS[0]}/cancel`, status: 202, body: job(0, 'running', { cancel_requested: true }) });
  const transport = new FakeTransport(script); const first = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(selected);
  transport.done(); assert.equal(transport.posts().length, 1);
  const receipt = bindings.receipts(first)[0]; assert.equal(receipt.stopReason, 'TIMEOUT');
  const intent = await bindings.journalIntent(store.journalRoot);
  assert.equal(Date.parse(intent.deadlineAt) - Date.parse(intent.intentAt), 2400000);
  assert.equal(Date.parse(intent.acquisitionDeadlineAt) - Date.parse(intent.firstIntentAt), count * 2400000);
  assert.ok(Date.parse(intent.acquisitionDeadlineAt) - Date.parse(intent.firstIntentAt) <= 12000000);
  store.reopen(); const replay = new FakeTransport([]); await bindings.open({ ...store, clock, fetch: replay.fetch }).run(selected); assert.equal(replay.calls.length, 0);
});

for (const cancelStatus of [202, 409, 401, 500, 'timeout'] as const) test(`S5 abort in poll has one independent cancel (${cancelStatus}) and no later fetch`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(), controller = new AbortController();
  const script = successfulScript().slice(0, 4);
  script[3]!.inspect = () => controller.abort();
  script.push({ method: 'POST', path: `/jobs/${IDS[0]}/cancel`, ...(cancelStatus === 'timeout' ? { error: new DOMException('synthetic timeout', 'TimeoutError') } : { status: cancelStatus, body: job(0, 'running', { cancel_requested: true }) }), inspect(call) {
    assert.ok(call.init.signal); assert.equal(call.init.signal.aborted, false, 'cleanup uses its own signal');
  } });
  const transport = new FakeTransport(script), client = bindings.open({ ...store, clock, fetch: transport.fetch, signal: controller.signal });
  await client.run(PRODUCTS); transport.done(); assert.equal(transport.calls.length, 5); assert.equal(client.requestsIssued(), 5);
  assert.equal(transport.calls.filter(c => new URL(c.url).pathname.endsWith('/cancel')).length, 1);
  store.reopen(); const replay = new FakeTransport([]); await bindings.open({ ...store, clock, fetch: replay.fetch }).run(PRODUCTS); assert.equal(replay.calls.length, 0);
});
test('S5 abort in the journal/dispatch gap does not count an undispatched request as exact usage', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(), abort = new AbortController();
  const transport = new FakeTransport([]), rename = fs.rename;
  fs.rename = async (from, to) => {
    await rename(from, to);
    if (String(to).endsWith('.json')) {
      const journal = JSON.parse(await fs.readFile(to, 'utf8'));
      if (journal.requestCount === 1 && journal.requestCountUncertain) abort.abort();
    }
  };
  try {
    const session = bindings.open({ ...store, clock, fetch: transport.fetch, signal: abort.signal });
    const value = await session.run(); transport.done();
    assert.equal(transport.calls.length, 0); assert.equal(session.requestsIssued(), 0);
    assert.equal(value.listings[0].requestCount, 0); assert.equal(value.listings[0].requestCountUncertain, false);
    assert.equal(value.listings[0].stopCode, 'OWNER_ABORTED');
  } finally { fs.rename = rename; }
});

test('S5 abort before submit makes no HTTP invocation', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(), controller = new AbortController(); controller.abort();
  const transport = new FakeTransport([]); await bindings.open({ ...store, clock, fetch: transport.fetch, signal: controller.signal }).run(); assert.equal(transport.calls.length, 0);
});
test('S5 abort while submit has no ID never guesses a cancel or replacement', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(), controller = new AbortController();
  const script = successfulScript().slice(0, 3); script[2] = { method: 'POST', path: '/jobs', inspect: () => controller.abort(), error: new DOMException('synthetic abort', 'AbortError') };
  const transport = new FakeTransport(script), client = bindings.open({ ...store, clock, fetch: transport.fetch, signal: controller.signal });
  await client.run(PRODUCTS); transport.done(); assert.equal(transport.posts().length, 1); assert.equal(transport.calls.length, 3);
  assert.equal(client.requestsIssued(), 3);
});
test('S5 abort during bounded sleep stops before another poll', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(), controller = new AbortController();
  const original = clock.sleep;
  let polled = false;
  clock.sleep = async (ms, signal) => { if (polled) controller.abort(); return original(ms, signal); };
  const script = successfulScript().slice(0, 4);
  script[3]!.inspect = () => { polled = true; };
  script.push({ method: 'POST', path: `/jobs/${IDS[0]}/cancel`, status: 202, body: job(0, 'running', { cancel_requested: true }) });
  const transport = new FakeTransport(script); await bindings.open({ ...store, clock, fetch: transport.fetch, signal: controller.signal }).run(); transport.done();
  assert.equal(transport.calls.at(-1)!.method, 'POST'); assert.equal(transport.calls.length, 5);
});
test('S5 abort during result stream preserves only previously validated checkpoint', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(), controller = new AbortController();
  const script = successfulScript().slice(0, 3);
  script.push({ method: 'GET', path: `/jobs/${IDS[0]}`, body: job(0, 'running', { result_available: true, collected: 1 }) },
    { method: 'GET', path: `/jobs/${IDS[0]}/result`, body: result(0, [row()], { complete: false }) },
    { method: 'GET', path: `/jobs/${IDS[0]}`, body: job(0, 'succeeded', { result_available: true, collected: 2 }) },
    { method: 'GET', path: `/jobs/${IDS[0]}/result`, response: () => new Response(new ReadableStream({ pull(stream) {
      stream.enqueue(new TextEncoder().encode('{"records":[')); controller.abort(); stream.error(new DOMException('synthetic abort', 'AbortError'));
    } })) });
  const transport = new FakeTransport(script); const value = await bindings.open({ ...store, clock, fetch: transport.fetch, signal: controller.signal }).run(PRODUCTS);
  transport.done(); assert.equal(bindings.receipts(value)[0].admittedReviewRecords, 1);
  assert.equal(transport.posts().length, 1); await assertNoRawLeak(store.root, RAW_SENTINELS);
});
for (const state of ['succeeded', 'partial', 'failed', 'cancelled', 'interrupted', 'needs_login', 'needs_verification']) for (const available of [false, true]) test(`S2 terminal ${state} availability=${available} fetches at most one result`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const terminal = job(0, state, { result_available: available, collected: available ? 1 : 0 });
  const script = successfulScript().slice(0, 3); script.push({ method: 'GET', path: `/jobs/${IDS[0]}`, body: terminal });
  if (available) script.push({ method: 'GET', path: `/jobs/${IDS[0]}/result`, body: result(0, [row()], { complete: state === 'succeeded' }) });
  if (available && state === 'succeeded') script.push({ method: 'GET', path: `/jobs/${IDS[0]}`, body: terminal });
  const transport = new FakeTransport(script); await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done();
  assert.equal(transport.calls.filter(c => c.url.endsWith('/result')).length, available ? 1 : 0);
});
test('S2 succeeded consistency read rejects concurrent resume without chasing another generation', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const script = successfulScript(); script[7]!.body = job(0, 'running', { updated_at: '2026-02-01T00:00:01.000Z' });
  const transport = new FakeTransport(script); const value = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); transport.done();
  assert.equal(bindings.classify(bindings.receipts(value), 20).outcome, 'PROVIDER_BLOCKED'); assert.equal(transport.posts().length, 1);
});

function receipt(count: number, state = 'succeeded', values: Record<string, unknown> = {}) {
  return { state, complete: true, stopReason: 'RECORD_LIMIT', admittedReviewRecords: count, resultAvailable: true, providerMessage: null, ...values };
}
for (const [counts, expected] of [[[20, 20, 20], 'OK'], [[20, 7, 0], 'PARTIAL_LISTINGS'], [[0, 0, 0], 'PROVIDER_BLOCKED']] as const) test(`S6 outcome counts ${counts} -> ${expected}`, () => {
  const actual = bindings.classify(counts.map(n => receipt(n)), 20); assert.equal(actual.outcome, expected); assert.equal(actual.providerMessage, null);
});
for (const state of ['partial', 'failed', 'cancelled', 'interrupted', 'needs_login', 'needs_verification']) for (const n of [0, 20]) test(`S6 ${state} with ${n} admitted rows follows precedence`, () => {
  const expected = state.startsWith('needs_') || n === 0 ? 'PROVIDER_BLOCKED' : 'PARTIAL_LISTINGS';
  const actual = bindings.classify([receipt(n, state, { error: 'time limit succeeded synthetic error' })], 20);
  assert.equal(actual.outcome, expected); assert.equal(actual.providerMessage, null);
});
for (const reason of ['RECORD_LIMIT', 'EXPECTED_COUNT_REACHED', 'LAST_PAGE', 'OTHER_OR_MISSING', null]) for (const n of [0, 7, 20]) test(`S6 succeeded ${reason} count ${n}`, () => {
  const actual = bindings.classify([receipt(n, 'succeeded', { stopReason: reason })], 20);
  assert.equal(actual.outcome, n === 0 ? 'PROVIDER_BLOCKED' : n === 20 && reason !== 'OTHER_OR_MISSING' && reason !== null ? 'OK' : 'PARTIAL_LISTINGS');
});
test('S6 complete=false, short cap=300, observed deadline and error-text independence', () => {
  assert.equal(bindings.classify([receipt(20, 'succeeded', { complete: false })], 20).outcome, 'PARTIAL_LISTINGS');
  assert.equal(bindings.classify([receipt(20, 'succeeded', { stopReason: 'LAST_PAGE' })], 300).outcome, 'PARTIAL_LISTINGS');
  assert.equal(bindings.classify([receipt(0, 'TIMEOUT', { appObservedTimeout: true })], 20).outcome, 'PROVIDER_TIMEOUT_NO_REVIEWS');
  assert.equal(bindings.classify([receipt(20), receipt(0, 'needs_login')], 20).outcome, 'PROVIDER_BLOCKED');
  assert.deepEqual(bindings.classify([receipt(7, 'failed', { error: 'time limit' })], 20), bindings.classify([receipt(7, 'failed', { error: 'arbitrary untrusted prose' })], 20));
});
for (const [code, extra, empty, kept] of [
  ['HEALTH_NOT_READY', {}, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED'],
  ...[401, 403, 404, 409, 422, 429].map(status => [`HTTP_${status}`, { httpStatus: status }, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED']),
  ['PROTOCOL_ERROR', {}, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED'], ['OVERSIZE', {}, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED'],
  ['CREDENTIAL_ECHO_REFUSED', {}, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED'], ['UNKNOWN_STATE', {}, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED'],
  ['RESULT_UNAVAILABLE', {}, 'PROVIDER_BLOCKED', 'PROVIDER_BLOCKED'],
  ['SUBMISSION_UNCERTAIN', {}, 'PROVIDER_BLOCKED', 'PARTIAL_LISTINGS'],
  ['SUBMISSION_UNCERTAIN', { appObservedTimeout: true }, 'PROVIDER_TIMEOUT_NO_REVIEWS', 'PARTIAL_LISTINGS'],
  ['GET_RETRIES_EXHAUSTED', {}, 'PROVIDER_BLOCKED', 'PARTIAL_LISTINGS'],
  ['TIMEOUT', { appObservedTimeout: true }, 'PROVIDER_TIMEOUT_NO_REVIEWS', 'PARTIAL_LISTINGS'],
  ['OWNER_ABORTED', {}, 'PROVIDER_BLOCKED', 'PARTIAL_LISTINGS'],
] as const) for (const n of [0, 7]) test(`S6 app condition ${code} with ${n} rows`, () => {
  const actual = bindings.classify([receipt(n, 'failed', { appStopCode: code, ...extra as object })], 20);
  assert.equal(actual.outcome, n === 0 ? empty : kept); assert.equal(actual.providerMessage, null);
});

test('S7 three-product mapping preserves bytes and scoped identity while rebuilding distinct counts', () => {
  const captures = [RESULT_A, RESULT_B, RESULT_C].map((value, p) => bindings.sanitize(value, p));
  const corpus = bindings.corpus(captures);
  assert.equal(corpus.contractVersion, 'research-review-corpus-v2'); assert.equal(corpus.mappingRevision, 'shopee-public-review-row-v1');
  assert.deepEqual(corpus.counts, { sourceRows: 10, uniqueScopedGroups: 8, equalDuplicates: 1, conflictingGroups: 1,
    quarantinedRows: 5, admittedReviewRecords: 4, readableCommentRecords: 3, attributesOnlyRecords: 1,
    emptyComments: 2, unreadableComments: 1, missingRatings: 1, invalidRatings: 1, sourceExcludedIds: 2 });
  const scoped = corpus.recordGroups.filter((g: any) => g.reviewId === SHARED_ID);
  assert.equal(scoped.length, 3); assert.equal(scoped[0].sourceRefs.length, 2);
  assert.equal(scoped[0].comment, '  Synthetic comment A\n<&>  '); assert.deepEqual(scoped[0].attributes, [' Material A ', 'Size A\n']);
  assert.equal(scoped[0].variation, '  Variant A\n'); assert.equal(scoped[0].createdAt, '2024-02-29T23:07:00+07:00');
  assert.equal(scoped[1].reviewId, SHARED_ID); assert.equal(scoped[1].comment, 'Synthetic comment B'); assert.equal(scoped[1].ratingStar, null);
  assert.equal(scoped[1].createdAt, '2026-01-05T08:09:00+07:00');
  const conflict = corpus.recordGroups.find((g: any) => g.reviewId === 'B-conflict');
  assert.equal(conflict.disposition, 'UNRESOLVED_CONFLICT'); assert.equal(conflict.sourceRefs.length, 2);
  assert.equal(corpus.recordGroups.find((g: any) => g.reviewId === 'A-attributes').textState, 'EMPTY');
  assert.equal(JSON.stringify(corpus).includes(RAW_SENTINELS[2]), false);
});
for (const [display, expected] of [['2024-02-29 23:07', '2024-02-29T23:07:00+07:00'], ['2023-02-29 12:00', null], ['2026-04-31 12:00', null], ['2026-01-01 24:00', null], ['2 ngày trước', null], ['', null]] as const) test(`S7 strict calendar conversion ${JSON.stringify(display)} is host-TZ independent`, () => {
  const previous = process.env.TZ;
  try { for (const tz of ['UTC', 'Pacific/Honolulu', 'Asia/Ho_Chi_Minh']) {
    process.env.TZ = tz; const safe = bindings.sanitize(result(0, [row(0, { posted_at_local: display })]));
    assert.equal(safe.rows[0].postedAtLocal, display); assert.equal(safe.rows[0].createdAt, expected);
    if (expected === null) assert.ok(safe.rows[0].admissionReasons.includes('SOURCE_TIME_NOT_PARSED'));
  } } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('S7 wrong result or row URL refuses attribution; secret echo is fixed-code and never persisted', async t => {
  for (const value of [WRONG_SOURCE_RESULT, result(0, [row()], { product_url: PRODUCTS[1].productUrl })]) assert.throws(() => bindings.sanitize(value));
  for (const value of [SECRET_ECHO_RESULT, ENCODED_SECRET_ECHO_RESULT]) {
    const store = await temporaryPublicStore(t), clock = new FakeClock();
    const script = successfulScript().slice(0, 7); script[6]!.body = value;
    const transport = new FakeTransport(script);
    const errors: string[] = [];
    try { const collected = await bindings.open({ ...store, clock, fetch: transport.fetch }).run(); errors.push(JSON.stringify(collected)); }
    catch (error) { errors.push(String(error)); }
    assert.match(errors.join(''), /CREDENTIAL_ECHO_REFUSED/u); transport.done();
    await assertNoRawLeak(store.root, RAW_SENTINELS, errors);
  }
});
test('S7 exclusion overlap conflicts; exclusion diagnostics never manufacture records', () => {
  const safe = bindings.sanitize(result(0, [row()], { excluded: [{ review_id: SHARED_ID, reason: 'empty_or_media_only' }, { review_id: 'excluded-only', reason: 'invented' }] }));
  const corpus = bindings.corpus([safe]); assert.equal(corpus.counts.admittedReviewRecords, 0);
  assert.equal(corpus.recordGroups.find((g: any) => g.reviewId === SHARED_ID).disposition, 'UNRESOLVED_CONFLICT');
  assert.equal(corpus.recordGroups.some((g: any) => g.reviewId === 'excluded-only'), false);
});
test('S7 schema text/locator/cap bounds reject without truncation or compensation', () => {
  for (const values of [{ comment: 'x'.repeat(65537) }, { attributes: ['x'.repeat(65537)] }, { attributes: Array(101).fill('x') },
    { variation: 'x'.repeat(4097) }, { comment: 'é'.repeat(32769) }, { page: 501 }, { page: 0 }]) assert.throws(() => bindings.sanitize(result(0, [row(0, values)])));
  assert.throws(() => bindings.sanitize(result(0, Array.from({ length: 21 }, (_, n) => row(0, { review_id: `synthetic-${n}` })))));
  for (const id of [null, '', 12, 'x'.repeat(2001)]) {
    const safe = bindings.sanitize(result(0, [row(0, { review_id: id })]));
    assert.equal(safe.rows[0].reviewId, null); assert.equal(bindings.corpus([safe]).counts.admittedReviewRecords, 0);
  }
  const safe = bindings.sanitize(result(0, [row(0, { review_id: 'synthetic-nonnumeric-id', unexpected: 'synthetic-unknown-field' })]));
  assert.equal(safe.rows[0].reviewId, 'synthetic-nonnumeric-id'); assert.equal(JSON.stringify(safe).includes('synthetic-unknown-field'), false);
});

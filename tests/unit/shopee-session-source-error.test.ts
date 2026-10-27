import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ShopeePublicReviewCollector } from '../../src/platform/collectors/shopee-public-reviews.js';
import { classifyPublicExactShopee } from '../../src/modules/analysis/research-automation/exact-shopee-outcome.js';
import { PUBLIC_REVIEW_FORBIDDEN_NAMES } from '../../src/modules/analysis/research-automation/public-review-report.js';
import { publicScenario } from '../helpers/shopee-public-scenario.js';
import { FakeClock, FakeTransport, ORIGIN, SESSION_READY, successfulScript, temporaryPublicStore, type Exchange } from '../helpers/shopee-public-fakes.js';
import { AT, IDS, PRODUCTS, READY, TOKEN, job } from '../fixtures/shopee-public-results.js';

const selected = PRODUCTS.map(product => ({ ...product, platform: 'shopee' as const }));
const stale = { state: 'ready', authenticated: null, checked_at: '2026-01-31T23:49:00.000Z' };
function collector(journalRoot: string, clock: FakeClock, fetch: typeof globalThis.fetch) {
  return new ShopeePublicReviewCollector({ token: TOKEN, baseUrl: ORIGIN, journalRoot, fetch,
    confirmedSourceSetSha256: 'a'.repeat(64), maxReviewsPerProduct: 20, clock: clock.now, sleep: clock.sleep });
}
function outcome(value: Awaited<ReturnType<ShopeePublicReviewCollector['collect']>>) {
  return classifyPublicExactShopee({ receipts: value.listings, counts: PRODUCTS.map(product => ({
    listingUrl: product.productUrl, reviews: 0 })), maxReviewsPerProduct: 20 });
}

// /health intentionally lies, exactly as after a collector restart. The old code
// can submit a real synthetic job, so reverting detection fails on the outcome,
// rather than on an unscripted mock or a missing new export.
test('SHP detection regression: restarted collector with stale ready cannot submit after needs_login', async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const calls: string[] = [], unlisted: string[] = [];
  const responses: Record<string, () => Response> = {
    'GET /health': () => Response.json(READY),
    'GET /session': () => Response.json(stale),
    'POST /session/check': () => Response.json({ state: 'needs_login', authenticated: false, checked_at: AT }),
    'GET /jobs?limit=100': () => Response.json([]),
    'POST /jobs': () => Response.json(job(), { status: 202 }),
    [`GET /jobs/${IDS[0]}`]: () => Response.json(job(0, 'needs_login')),
  };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    calls.push(key);
    if (url.origin !== ORIGIN || !responses[key] || calls.filter(call => call === key).length > 1) {
      unlisted.push(key); throw new Error('Unlisted synthetic invocation');
    }
    return responses[key]();
  };
  t.after(() => assert.deepEqual(unlisted, [], 'application must not swallow an unlisted invocation'));
  const value = await collector(store.journalRoot, clock, fetch).collect(selected, 'b'.repeat(64), 'stale-ready');
  assert.equal(calls.filter(call => call === 'POST /jobs').length, 0, 'stale ready must not authorize a job submission');
  assert.equal(outcome(value), 'SHOPEE_LOGIN_REQUIRED');
  assert.equal(value.listings[0]!.stopCode, 'HUMAN_LOGIN_REQUIRED');
  assert.deepEqual(value.listings.slice(1).map(row => row.state), ['NOT_SUBMITTED', 'NOT_SUBMITTED']);
  assert.deepEqual(calls, ['GET /session', 'POST /session/check']);
});

for (const age of [0, 2 * 60_000, 10 * 60_000]) test(`SHP fresh authenticated ready age=${age} submits all products without a check or login`, async t => {
  const store = await temporaryPublicStore(t), clock = new FakeClock(30);
  const script = successfulScript([20, 20, 20]);
  script[0]!.body = { ...SESSION_READY, checked_at: new Date(clock.milliseconds - age).toISOString() };
  const transport = new FakeTransport(script);
  const value = await collector(store.journalRoot, clock, transport.fetch).collect(selected, 'b'.repeat(64), 'fresh-session');
  transport.done();
  assert.deepEqual(value.listings.map(row => row.state), ['succeeded', 'succeeded', 'succeeded']);
  assert.equal(transport.posts().length, 3);
  assert.deepEqual(transport.calls.filter(call => new URL(call.url).pathname.startsWith('/session')).map(call => [call.method, new URL(call.url).pathname]), [['GET', '/session']]);
});

for (const view of [stale, { ...SESSION_READY, checked_at: '2026-01-31T23:49:59.999Z' },
  { ...SESSION_READY, authenticated: false }, { ...SESSION_READY, checked_at: null }]) {
  test(`SHP untrusted session ${JSON.stringify(view)} checks once across three products`, async t => {
    const store = await temporaryPublicStore(t), clock = new FakeClock(30);
    const script = successfulScript([20, 20, 20]);
    script.splice(0, 1, { method: 'GET', path: '/session', body: view },
      { method: 'POST', path: '/session/check', body: { ...SESSION_READY } });
    const transport = new FakeTransport(script);
    const value = await collector(store.journalRoot, clock, transport.fetch).collect(selected, 'b'.repeat(64), 'checked-session');
    transport.done(); assert.equal(transport.posts().length, 3);
    assert.deepEqual(value.listings.map(row => row.state), ['succeeded', 'succeeded', 'succeeded']);
    assert.equal(transport.calls.filter(call => new URL(call.url).pathname === '/session/check').length, 1);
  });
}

const blockedCases: Array<{ name: string; read?: Partial<Exchange>; check: Partial<Exchange>; code: string; human: boolean; phrase: RegExp }> = [
  { name: 'needs_login', check: { body: { state: 'needs_login' } }, code: 'SHOPEE_LOGIN_REQUIRED', human: true, phrase: /mất đăng nhập Shopee/u },
  { name: 'awaiting_user_login', check: { body: { state: 'awaiting_user_login' } }, code: 'SHOPEE_LOGIN_REQUIRED', human: true, phrase: /mất đăng nhập Shopee/u },
  { name: 'needs_verification', check: { body: { state: 'needs_verification' } }, code: 'SHOPEE_VERIFICATION_REQUIRED', human: true, phrase: /yêu cầu xác minh/u },
  { name: 'HTTP 409', check: { status: 409 }, code: 'SHOPEE_COLLECTOR_DOWN', human: false, phrase: /không phản hồi/u },
  { name: 'network', read: { error: new TypeError('synthetic offline') }, check: { error: new TypeError('synthetic offline') }, code: 'SHOPEE_COLLECTOR_DOWN', human: false, phrase: /không phản hồi/u },
  { name: 'HTTP 503', read: { status: 503 }, check: { status: 503 }, code: 'SHOPEE_COLLECTOR_DOWN', human: false, phrase: /không phản hồi/u },
];
for (const row of blockedCases) test(`SHP named source error ${row.name} continues to report without automatic login`, async t => {
  const f = await publicScenario(t, { reports: ['MARKET'] });
  f.transport.exchanges.splice(0, f.transport.exchanges.length,
    { method: 'GET', path: '/session', body: stale, ...row.read },
    { method: 'POST', path: '/session/check', ...row.check });
  await f.confirmPublic(); await f.finish(); f.transport.done();
  const run = await f.service.getRun(f.workspaceId, f.runId);
  assert.equal(run.status, 'DRAFT_READY');
  assert.ok(run.outputs?.market, 'source loss does not wait or refuse report creation');
  const limitation = run.blockers.find((entry: { code: string }) => entry.code === row.code);
  assert.ok(limitation, 'read projection carries the named source error');
  assert.equal(limitation.scope, 'SOURCE'); assert.match(limitation.message, row.phrase);
  const step = await f.collectionStep();
  const document = JSON.parse((await new ContentAddressedArtifactStore(f.artifactRoot).read(step.result_sha256)).toString());
  assert.equal(document.exactShopeeOutcome.outcome, row.code);
  assert.match(document.limitations.find((entry: { code: string }) => entry.code === row.code).message, row.phrase);
  assert.equal(document.coverage.find((entry: { provider: string }) => entry.provider === 'shopee-public-review').state, 'FAILED');
  const context = await f.retainedReviewContext();
  assert.equal(context.humanBlocked, row.human);
  assert.deepEqual((await f.receipts()).slice(1).map((entry: { state: string }) => entry.state), ['NOT_SUBMITTED', 'NOT_SUBMITTED']);
  const html = await f.readReport();
  assert.match(html, row.phrase);
  assert.match(html, /không lấy được đánh giá vì/u);
  const publicText = limitation.message + html;
  for (const name of PUBLIC_REVIEW_FORBIDDEN_NAMES) assert.equal(publicText.toLowerCase().includes(name.toLowerCase()), false);
  assert.equal(f.transport.posts().length, 0);
  assert.deepEqual(f.transport.calls.map((call: { method: string; url: string }) => [call.method, new URL(call.url).pathname]), [['GET', '/session'], ['POST', '/session/check']]);
});

for (const [state, code] of [['needs_login', 'SHOPEE_LOGIN_REQUIRED'], ['needs_verification', 'SHOPEE_VERIFICATION_REQUIRED']] as const)
  test(`SHP job ${state} after a succeeded product preserves reviews and never submits the third product`, async t => {
    const f = await publicScenario(t, { reports: ['MARKET'], counts: [20, 7, 0] });
    const script: Exchange[] = f.transport.exchanges;
    // The second job exposes the human condition and its retained partial result.
    script[12]!.body = { ...(script[12]!.body as object), state };
    script[13]!.body = { ...(script[13]!.body as object), complete: false };
    script.splice(14);
    await f.confirmPublic(); await f.finish(); f.transport.done();
    assert.equal(await f.statusCode(), 'DRAFT_READY');
    assert.equal((await f.outcome()).outcome, code);
    const human = state === 'needs_login' ? 'HUMAN_LOGIN_REQUIRED' : 'HUMAN_VERIFICATION_REQUIRED';
    assert.deepEqual((await f.receipts()).map((row: { state: string }) => row.state), ['succeeded', human, 'NOT_SUBMITTED']);
    assert.equal((await f.receipts())[1].stopCode, human);
    const context = await f.retainedReviewContext();
    assert.equal(context.humanBlocked, true);
    assert.deepEqual(context.outcome.listings.map((row: { reviews: number }) => row.reviews), [20, 7, 0]);
    assert.deepEqual(f.transport.posts().map((call: { init: RequestInit }) => JSON.parse(String(call.init.body)).url), PRODUCTS.slice(0, 2).map(row => row.productUrl));
    assert.equal(f.transport.calls.filter((call: { url: string }) => new URL(call.url).pathname === '/session/login').length, 0);
    assert.match(await f.readReport(), state === 'needs_login' ? /mất đăng nhập Shopee/u : /yêu cầu xác minh/u);
  });

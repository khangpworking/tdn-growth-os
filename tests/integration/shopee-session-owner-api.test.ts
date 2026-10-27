import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { sessionApi, sessionRun, ownerOrigin } from '../helpers/shopee-session-api.js';
import { AT, TOKEN } from '../fixtures/shopee-public-results.js';
import type { Exchange } from '../helpers/shopee-public-fakes.js';

const body = (kind: 'login' | 'confirm', requestKey = randomUUID()) => ({
  contractVersion: `research-automation-shopee-session-${kind}-v1`, requestKey,
});
const check = (state: string): Exchange => ({ method: 'POST', path: '/session/check', body: { state, checked_at: AT } });
const background: Exchange = { method: 'POST', path: '/session/background', body: { state: 'ready', checked_at: AT } };

async function ownerJournals(databasePath: string) {
  const directory = path.join(path.dirname(databasePath), 'research-automation-shopee-session-journal');
  return Promise.all((await fs.readdir(directory)).map(async name => {
    const raw = await fs.readFile(path.join(directory, name), 'utf8');
    assert.equal(raw.includes(TOKEN), false, 'owner journal leaked collector token');
    assert.equal(raw.includes(encodeURIComponent(TOKEN)), false, 'owner journal leaked encoded collector token');
    return JSON.parse(raw) as { requestKey: string; requestKind: string; requestCount: number; requestCountUncertain: boolean };
  }));
}

test('SHP F2: owner login reservation and request journal are durable before dispatch and accepted afterward', async t => {
  const f = await sessionRun(t), login = body('login');
  const usage = f.db.prepare('SELECT * FROM analysis_research_automation_usage').all();
  let reserved: unknown, beforeDispatch: Awaited<ReturnType<typeof ownerJournals>> | undefined;
  const api = sessionApi(t, f, [{ method: 'POST', path: '/session/login', response: async () => {
    // A separate SQLite connection observes the committed intent at the remote boundary.
    reserved = f.db.prepare('SELECT state,checked_at,accepted_at FROM research_automation_shopee_sessions WHERE request_key=?').all(login.requestKey);
    // Read the journal only when it exists so the pre-fix control fails on the missing reservation.
    try { beforeDispatch = await ownerJournals(f.databasePath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return Response.json({ state: 'awaiting_user_login', checked_at: AT });
  } }]);
  const receipt = await api.request('shopee-session/login', login);
  assert.deepEqual(reserved, [{ state: 'DISPATCHING', checked_at: null, accepted_at: null }], 'owner command must be durably reserved before collector dispatch');
  assert.equal(receipt.status, 201);
  assert.deepEqual(receipt.body, { contractVersion: 'research-automation-shopee-session-v1', state: 'AWAITING_USER_LOGIN', checkedAt: AT, exactRetry: false });
  assert.deepEqual(beforeDispatch?.map(({ requestKey, requestKind, requestCount, requestCountUncertain }) => ({ requestKey, requestKind, requestCount, requestCountUncertain })),
    [{ requestKey: login.requestKey, requestKind: 'LOGIN', requestCount: 1, requestCountUncertain: true }]);
  const stored = f.db.prepare('SELECT state,checked_at,reserved_at,accepted_at FROM research_automation_shopee_sessions WHERE request_key=?').get(login.requestKey) as {
    state: string; checked_at: string; reserved_at: string; accepted_at: string;
  };
  assert.equal(stored.state, receipt.body.state); assert.equal(stored.checked_at, receipt.body.checkedAt);
  assert.ok(Number.isFinite(Date.parse(stored.reserved_at)) && Date.parse(stored.accepted_at) >= Date.parse(stored.reserved_at));
  const [journal] = await ownerJournals(f.databasePath);
  assert.equal(journal?.requestCount, 1); assert.equal(journal?.requestCountUncertain, false);
  assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_usage').all(), usage, 'owner calls must not change collection usage evidence');
});

test('SHP F2: failed receipt persistence survives restart without redispatch and a new confirm resolves the session', async t => {
  const f = await sessionRun(t), login = body('login');
  const usage = f.db.prepare('SELECT * FROM analysis_research_automation_usage').all();
  const api = sessionApi(t, f, [{ method: 'POST', path: '/session/login', body: { state: 'awaiting_user_login', checked_at: AT } }]);
  // Fail receipt persistence in either implementation: UPDATE now, INSERT before FIX3.
  f.db.exec(`CREATE TRIGGER shopee_fail_receipt_insert BEFORE INSERT ON research_automation_shopee_sessions
    WHEN NEW.state <> 'DISPATCHING' BEGIN SELECT RAISE(ABORT,'synthetic receipt write failure'); END;
    CREATE TRIGGER shopee_fail_receipt_update BEFORE UPDATE ON research_automation_shopee_sessions
    BEGIN SELECT RAISE(ABORT,'synthetic receipt write failure'); END;`);
  assert.equal((await api.request('shopee-session/login', login)).status, 500);
  assert.equal(api.transport.calls.length, 1);
  f.db.exec('DROP TRIGGER shopee_fail_receipt_insert; DROP TRIGGER shopee_fail_receipt_update;');
  await api.close();
  // Allow an extra call in the negative control so it fails on the duplicate side effect,
  // rather than an unlisted fake invocation swallowed by the session client.
  const restarted = sessionApi(t, f, []);
  restarted.transport.exchanges.push({ method: 'POST', path: '/session/login', body: { state: 'awaiting_user_login', checked_at: AT } });
  const replay = await restarted.request('shopee-session/login', login);
  const replayCalls = restarted.transport.calls.length;
  restarted.transport.exchanges.length = 0;
  assert.equal(replayCalls, 0, 'a reserved request key must never open login twice after restart');
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, { contractVersion: 'research-automation-shopee-session-v1', state: 'DISPATCHING', checkedAt: null, exactRetry: true });
  const confirm = body('confirm'), observations: unknown[] = [];
  const observe = async () => {
    const journals = await ownerJournals(f.databasePath);
    const journal = journals.find(entry => entry.requestKey === confirm.requestKey);
    observations.push({ requestCount: journal?.requestCount, uncertain: journal?.requestCountUncertain,
      state: (f.db.prepare('SELECT state FROM research_automation_shopee_sessions WHERE request_key=?').get(confirm.requestKey) as { state: string } | undefined)?.state });
    return Response.json({ state: 'ready', checked_at: AT });
  };
  restarted.transport.exchanges.push({ method: 'POST', path: '/session/check', response: observe },
    { method: 'POST', path: '/session/background', response: observe });
  const resolved = await restarted.request('shopee-session/confirm', confirm);
  assert.equal(resolved.status, 201); assert.equal(resolved.body.state, 'READY'); assert.equal(resolved.body.checkedAt, AT);
  assert.deepEqual(observations, [{ requestCount: 1, uncertain: true, state: 'DISPATCHING' }, { requestCount: 2, uncertain: true, state: 'DISPATCHING' }]);
  const journals = await ownerJournals(f.databasePath);
  const confirmed = journals.find(entry => entry.requestKey === confirm.requestKey);
  assert.equal(confirmed?.requestCount, 2); assert.equal(confirmed?.requestCountUncertain, false);
  assert.equal(journals.find(entry => entry.requestKey === login.requestKey)?.requestCount, 1);
  assert.equal(restarted.transport.calls.length, 2);
  assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_usage').all(), usage, 'repair controls must remain separate from collection usage evidence');
});

for (const state of ['needs_login', 'needs_verification', 'down']) test(`SHP owner repair regression: ${state} login and confirm replay stored receipts across API restart`, async t => {
  const f = await sessionRun(t, state);
  const api = sessionApi(t, f, [{ method: 'POST', path: '/session/login', body: { state: 'awaiting_user_login', checked_at: AT } }, check('ready'), background]);
  const read = await api.request('', undefined, { method: 'GET', prefix: 'api', authorization: null });
  assert.equal(read.status, 200);
  const code = state === 'needs_login' ? 'SHOPEE_LOGIN_REQUIRED' : state === 'needs_verification' ? 'SHOPEE_VERIFICATION_REQUIRED' : 'SHOPEE_COLLECTOR_DOWN';
  assert.ok(read.body.blockers.some((entry: { code: string; scope: string }) => entry.code === code && entry.scope === 'SOURCE'));
  assert.equal(api.transport.calls.length, 0, 'the public read API cannot repair a session');
  const login = body('login'), confirm = body('confirm');
  const accepted = await api.request('shopee-session/login', login);
  assert.equal(accepted.status, 201);
  assert.deepEqual(accepted.body, { contractVersion: 'research-automation-shopee-session-v1', state: 'AWAITING_USER_LOGIN', checkedAt: AT, exactRetry: false });
  const confirmed = await api.request('shopee-session/confirm', confirm);
  assert.equal(confirmed.status, 201);
  assert.deepEqual(confirmed.body, { contractVersion: 'research-automation-shopee-session-v1', state: 'READY', checkedAt: AT, exactRetry: false });
  api.transport.done();
  // A new application handle must replay the durable ledger without a collector.
  await api.close();
  const restarted = sessionApi(t, f, []);
  for (const [action, request, stored] of [['login', login, accepted], ['confirm', confirm, confirmed]] as const) {
    const replay = await restarted.request(`shopee-session/${action}`, request);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, { ...stored.body, exactRetry: true });
  }
  assert.equal(restarted.transport.calls.length, 0);
});

test('SHP owner routes enforce auth, exact Origin, owner writes and method before any collector call', async t => {
  const f = await sessionRun(t);
  const api = sessionApi(t, f, []);
  for (const kind of ['login', 'confirm'] as const) {
    for (const [options, status] of [
      [{ authorization: null }, 401], [{ authorization: 'Bearer wrong-owner' }, 401],
      [{ origin: null }, 403], [{ origin: 'http://example.invalid' }, 403],
      [{ origin: ownerOrigin + '/' }, 403], [{ method: 'GET' }, 405],
      [{ prefix: 'api' }, 404],
    ] as const) assert.equal((await api.request(`shopee-session/${kind}`, body(kind), options)).status, status);
  }
  const disabled = sessionApi(t, f, [], false);
  for (const kind of ['login', 'confirm'] as const)
    assert.equal((await disabled.request(`shopee-session/${kind}`, body(kind))).status, 403);
  assert.equal(api.transport.calls.length, 0); assert.equal(disabled.transport.calls.length, 0);
});

for (const state of ['OK', 'PROVIDER_BLOCKED']) test(`SHP owner repair rejects outcome ${state} and wrong workspace without touching collector`, async t => {
  const f = await sessionRun(t, state);
  const api = sessionApi(t, f, []);
  for (const kind of ['login', 'confirm'] as const) {
    assert.equal((await api.request(`shopee-session/${kind}`, body(kind))).status, 409);
    assert.equal((await api.request(`shopee-session/${kind}`, body(kind), { workspaceId: randomUUID() })).status, 404);
  }
  assert.equal(api.transport.calls.length, 0);
});

for (const [state, expected] of [['needs_login', 'LOGIN_REQUIRED'], ['needs_verification', 'VERIFICATION_REQUIRED'], ['unknown', 'COLLECTOR_DOWN']] as const)
  test(`SHP confirm ${state} never calls background or login`, async t => {
    const f = await sessionRun(t);
    const api = sessionApi(t, f, [check(state)]);
    const request = body('confirm');
    const response = await api.request('shopee-session/confirm', request);
    assert.equal(response.status, 201); assert.equal(response.body.state, expected);
    const replay = await api.request('shopee-session/confirm', request);
    assert.equal(replay.status, 200); assert.deepEqual(replay.body, { ...response.body, exactRetry: true });
    assert.equal(api.transport.calls.length, 1);
  });

test('SHP owner request validation and conflicting request keys never repeat a collector action', async t => {
  const f = await sessionRun(t);
  const api = sessionApi(t, f, [{ method: 'POST', path: '/session/login', body: { state: 'awaiting_user_login' } }]);
  for (const request of [{ ...body('login'), requestKey: 'invalid' }, { ...body('login'), token: TOKEN }, body('confirm')])
    assert.equal((await api.request('shopee-session/login', request)).status, 400);
  const login = body('login');
  assert.equal((await api.request('shopee-session/login', login)).status, 201);
  const conflict = await api.request('shopee-session/confirm', body('confirm', login.requestKey));
  assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'request_key_conflict');
  assert.equal(api.transport.calls.length, 1);
});

test('SHP collector token echoes and thrown errors cannot reach responses, receipts or logs', async t => {
  const f = await sessionRun(t), logs: string[] = [];
  for (const method of ['log', 'warn', 'error'] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
  const api = sessionApi(t, f, [
    { method: 'POST', path: '/session/login', body: { state: 'awaiting_user_login', debug: TOKEN } },
    { method: 'POST', path: '/session/check', body: { state: 'ready', debug: encodeURIComponent(TOKEN) } },
    { method: 'POST', path: '/session/login', error: new Error(TOKEN) },
  ]);
  const responses = [];
  for (const kind of ['login', 'confirm', 'login'] as const) {
    const request = body(kind), response = await api.request(`shopee-session/${kind}`, request);
    assert.equal(response.status, 201); assert.equal(response.body.state, 'COLLECTOR_DOWN');
    responses.push(response, await api.request(`shopee-session/${kind}`, request));
  }
  const receipts = f.db.prepare('SELECT * FROM research_automation_shopee_sessions').all();
  assert.equal(receipts.length, 3);
  for (const value of [...responses.map(row => row.wire), JSON.stringify(receipts), ...logs])
    for (const secret of [TOKEN, encodeURIComponent(TOKEN)]) assert.equal(value.includes(secret), false, 'collector credential escaped');
  assert.equal(api.transport.calls.length, 3);
});

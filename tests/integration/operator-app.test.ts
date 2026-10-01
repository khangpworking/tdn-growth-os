import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openOperatorApp, operatorAppConfigurationFromEnvironment, type OperatorAppConfiguration } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/database.js';

const roots: string[] = [];
let nextPort = 18787;
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(enabled = false): OperatorAppConfiguration {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-operator-app-')); roots.push(root);
  const databasePath = path.join(root, 'workspace.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const frontendDist = path.join(root, 'frontend', 'dist');
  fs.mkdirSync(path.join(frontendDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.js'), 'globalThis.TDN=true;');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.css'), 'body{}');
  const opened = openDatabase({ databasePath }); opened.db.close();
  return { databasePath, artifactRoot, frontendDist, version: '0.1.0', host: '127.0.0.1', port: nextPort++, ownerWritesEnabled: enabled,
    ...(enabled ? { ownerToken: 'strong-owner-token-12345678901234567890', ownerActorId: 'owner:local' } : {}) };
}
async function serve(configuration: OperatorAppConfiguration, run: (origin: string) => Promise<void>): Promise<void> {
  const application = openOperatorApp(configuration);
  application.server.listen(configuration.port, configuration.host); await once(application.server, 'listening');
  try { await run(application.origin); } finally { await application.close(); }
}
const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('one loopback server serves production files, health, read API, and safely disables OWNER writes', async () => {
  const configuration = fixture(); const before = digest(configuration.databasePath);
  await serve(configuration, async (origin) => {
    const index = await fetch(`${origin}/`); assert.equal(index.status, 200); assert.match(index.headers.get('content-type')!, /^text\/html/); assert.match(await index.text(), /assets\/app\.js/);
    const asset = await fetch(`${origin}/assets/app.js`); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type')!, /^text\/javascript/);
    const head = await fetch(`${origin}/assets/app.css`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    for (const method of ['GET', 'HEAD']) {
      const favicon = await fetch(`${origin}/favicon.ico`, { method });
      assert.equal(favicon.status, 204); assert.equal(await favicon.text(), '');
      assert.equal(favicon.headers.get('x-content-type-options'), 'nosniff');
    }
    const route = await fetch(`${origin}/market/example`); assert.equal(route.status, 404); assert.doesNotMatch(await route.text(), /doctype html/);
    const demo = await fetch(`${origin}/?mode=demo`); assert.equal(demo.status, 200); assert.match(await demo.text(), /doctype html/);
    const health = await fetch(`${origin}/healthz`); assert.deepEqual(await health.json(), { status: 'ok', version: '0.1.0', ownerWritesEnabled: false, localTestOwner: false });
    const portfolio = await fetch(`${origin}/api/workspaces`); assert.equal(portfolio.status, 200); assert.deepEqual(await portfolio.json(), { contractVersion: '1.0.0', workspaces: [] });
    const missingTarget = await fetch(`${origin}/api/report-review-targets/${'f'.repeat(64)}`);
    assert.equal(missingTarget.status, 404);
    assert.deepEqual(await missingTarget.json(), { error: { code: 'not_found', message: 'Review target not found' } });
    const localSession = await fetch(`${origin}/owner-api/local-test-session`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(localSession.status, 403);
    assert.deepEqual(await localSession.json(), { error: { code: 'forbidden', message: 'OWNER writes are disabled' } });
    const owner = await fetch(`${origin}/owner-api/workspaces`, { method: 'POST' }); assert.equal(owner.status, 403); assert.deepEqual(await owner.json(), { error: { code: 'forbidden', message: 'OWNER writes are disabled' } });
    assert.equal((await fetch(`${origin}/api/unknown`)).status, 404); assert.equal((await fetch(`${origin}/owner-api/unknown`)).status, 403);
  });
  assert.equal(digest(configuration.databasePath), before, 'health, static, and read requests preserve SQLite bytes');
});

test('enabled OWNER handler uses the internally derived same origin and existing authorization', async () => {
  const configuration = fixture(true);
  const application = openOperatorApp(configuration);
  assert.equal(application.origin, `http://127.0.0.1:${configuration.port}`);
  application.server.listen(configuration.port, configuration.host); await once(application.server, 'listening');
  const actual = application.origin;
  try {
    const unauthorized = await fetch(`${actual}/owner-api/workspaces`, { method: 'POST', headers: { origin: application.origin, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unauthorized.status, 401);
    const wrongOrigin = await fetch(`${actual}/owner-api/workspaces`, { method: 'POST', headers: { origin: 'http://127.0.0.1:9999' } });
    assert.equal(wrongOrigin.status, 403);
    const health = await fetch(`${actual}/healthz`); assert.deepEqual(await health.json(), { status: 'ok', version: '0.1.0', ownerWritesEnabled: true, localTestOwner: false });
    const grant = await fetch(`${actual}/owner-api/local-test-session`, { method: 'POST', headers: { origin: actual, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(grant.status, 403, 'enabled manual OWNER mode must not grant automatic access');
    assert.doesNotMatch(await grant.text(), /strong-owner-token/);
  } finally { await application.close(); }
});

test('static boundary rejects traversal, encoded separators, maps, directories, unknown assets, and mutation methods', async () => {
  const configuration = fixture(); fs.writeFileSync(path.join(configuration.frontendDist, 'assets', 'app.js.map'), '{}');
  await serve(configuration, async (origin) => {
    for (const target of ['/assets/missing.js', '/missing.ico', '/assets/app.js.map', '/assets/', '/..%2fpackage.json', '/%2e%2e/package.json', '/assets%5capp.js']) {
      const response = await fetch(origin + target); assert.ok([400, 404].includes(response.status), `${target}: ${response.status}`); assert.doesNotMatch(await response.text(), /doctype html/);
    }
    const post = await fetch(`${origin}/`, { method: 'POST' }); assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
    assert.equal((await fetch(`${origin}/favicon.ico`, { method: 'POST' })).status, 405);
    const unknownApi = await fetch(`${origin}/api/not-a-route`); assert.equal(unknownApi.status, 404); assert.match(unknownApi.headers.get('content-type')!, /^application\/json/);
  });
});

test('configuration is validated before opening or listening and never requires a separate CORS origin', () => {
  const configuration = fixture();
  const defaults = { frontendDist: configuration.frontendDist, version: '0.1.0' };
  const base = { TDN_WORKSPACE_DB: configuration.databasePath, TDN_ARTIFACT_ROOT: configuration.artifactRoot };
  assert.deepEqual(operatorAppConfigurationFromEnvironment(base, defaults), { ...configuration, port: 8787 });
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OPERATOR_APP_HOST: '0.0.0.0' }, defaults), /must be exactly/);
  for (const port of ['0', '65536', '1e3', ' 8787', '8787.0']) assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OPERATOR_APP_PORT: port }, defaults), /integer/);
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OWNER_API_ENABLED: 'yes' }, defaults), /exactly true or false/);
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'weak1', TDN_OWNER_API_ACTOR_ID: 'owner:local' }, defaults), /strong/);
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'strong-owner-token-12345678901234567890' }, defaults), /ACTOR_ID/);
  assert.throws(() => operatorAppConfigurationFromEnvironment(base, { ...defaults, frontendDist: path.join(configuration.frontendDist, 'missing') }), /frontend\/dist is missing/);
  fs.writeFileSync(path.join(configuration.frontendDist, 'index.html'), '<script src="./../assets/app.js"></script>');
  assert.throws(() => operatorAppConfigurationFromEnvironment(base, defaults), /missing or escaping asset/);
  assert.equal('TDN_OWNER_API_ALLOWED_ORIGIN' in operatorAppConfigurationFromEnvironment(base, { ...defaults, frontendDist: fixture().frontendDist }), false);
});

test('opt-in local OWNER session issues one ephemeral token and preserves the normal OWNER boundary', async () => {
  const configuration = fixture(true);
  const localConfiguration: OperatorAppConfiguration = { ...configuration, localTestOwner: true };
  const before = digest(configuration.databasePath);
  const application = openOperatorApp(localConfiguration);
  application.server.listen(localConfiguration.port, localConfiguration.host); await once(application.server, 'listening');
  try {
    const health = await fetch(`${application.origin}/healthz`);
    assert.deepEqual(await health.json(), { status: 'ok', version: '0.1.0', ownerWritesEnabled: true, localTestOwner: true });

    const session = (init: RequestInit = {}) => fetch(`${application.origin}/owner-api/local-test-session`, {
      ...init,
      headers: { 'content-type': 'application/json', origin: application.origin, ...(init.headers ?? {}) },
    });
    const missingOrigin = await fetch(`${application.origin}/owner-api/local-test-session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missingOrigin.status, 403);
    for (const init of [
      { headers: { origin: 'http://127.0.0.1:1' } },
      { headers: { 'sec-fetch-site': 'cross-site' } },
      { headers: { 'x-forwarded-host': application.origin } },
    ]) {
      const response = await session({ method: 'POST', body: '{}', ...init });
      assert.equal(response.status, 403);
      assert.doesNotMatch(await response.text(), /strong-owner-token/);
    }
    for (const method of ['GET', 'OPTIONS']) {
      const response = await session({ method });
      assert.equal(response.status, 405);
      assert.equal(await response.text(), JSON.stringify({ error: { code: 'method_not_allowed', message: 'Only POST is supported' } }));
    }
    const badBody = await session({ method: 'POST', body: '{"unexpected":true}' });
    assert.equal(badBody.status, 400);
    const oversized = await session({ method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(1024) }) });
    assert.equal(oversized.status, 400);
    const badContentType = await fetch(`${application.origin}/owner-api/local-test-session`, {
      method: 'POST', headers: { origin: application.origin, 'content-type': 'text/plain' }, body: '{}',
    });
    assert.equal(badContentType.status, 400);

    const first = await session({ method: 'POST', body: '{}' });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.headers.get('access-control-allow-origin'), null);
    const issued = await first.json() as { contractVersion: string; token: string };
    assert.deepEqual(Object.keys(issued).sort(), ['contractVersion', 'token']);
    assert.equal(issued.contractVersion, '1.0.0');
    assert.match(issued.token, /^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7e]{32,512}$/);
    assert.notEqual(issued.token, localConfiguration.ownerToken);
    assert.equal(digest(configuration.databasePath), before, 'issuing a local session does not mutate the database');

    const second = await session({ method: 'POST', body: '{}' });
    assert.deepEqual(await second.json(), issued, 'one app instance reuses its process-scoped session token');

    const headers = { origin: application.origin, 'content-type': 'application/json' };
    const ownerMissingOrigin = await fetch(`${application.origin}/owner-api/workspaces`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${issued.token}` }, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'missing-origin', title: 'Denied' }) });
    assert.equal(ownerMissingOrigin.status, 403, 'local mode requires Origin on mutating OWNER routes');
    const ownerCrossSite = await fetch(`${application.origin}/owner-api/workspaces`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${issued.token}`, 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'cross-site', title: 'Denied' }) });
    assert.equal(ownerCrossSite.status, 403, 'local mode rejects cross-site OWNER routes');
    const ownerForwarded = await fetch(`${application.origin}/owner-api/workspaces`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${issued.token}`, 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'forwarded', title: 'Denied' }) });
    assert.equal(ownerForwarded.status, 403, 'local mode rejects proxied OWNER routes');
    const ownerGetWrongOrigin = await fetch(`${application.origin}/owner-api/research-generation/inputs?workspaceId=${'f'.repeat(64)}`, { headers: { authorization: `Bearer ${issued.token}`, origin: 'http://127.0.0.1:1' } });
    assert.equal(ownerGetWrongOrigin.status, 403, 'a supplied wrong Origin is denied on safe OWNER reads');
    const persistent = await fetch(`${application.origin}/owner-api/workspaces`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${localConfiguration.ownerToken}` }, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'local-session', title: 'Local session' }) });
    assert.equal(persistent.status, 401, 'configured persistent token is not accepted in local test mode');
    const missing = await fetch(`${application.origin}/owner-api/workspaces`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'local-session', title: 'Local session' }) });
    assert.equal(missing.status, 401, 'OWNER routes still require a bearer token');
    const created = await fetch(`${application.origin}/owner-api/workspaces`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${issued.token}` }, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'local-session', title: 'Local session' }) });
    assert.equal(created.status, 201);
    const createdReceipt = await created.json() as { workspaceId: string; workspaceKey: string };
    assert.equal(createdReceipt.workspaceKey, 'local-session');
    const ownerGetWithoutOrigin = await fetch(`${application.origin}/owner-api/research-generation/inputs?workspaceId=${createdReceipt.workspaceId}`, { headers: { authorization: `Bearer ${issued.token}` } });
    assert.equal(ownerGetWithoutOrigin.status, 200, 'same-origin safe OWNER reads may omit Origin');

    const wrongHost = await fetch(`${application.origin}/owner-api/local-test-session`, { method: 'POST', headers: { ...headers, host: `127.0.0.1:${localConfiguration.port + 1}` }, body: '{}' });
    assert.equal(wrongHost.status, 400);
  } finally { await application.close(); }
});

test('local OWNER mode requires enabled writes and the environment switch is exact', () => {
  const configuration = fixture();
  const defaults = { frontendDist: configuration.frontendDist, version: '0.1.0' };
  const base = { TDN_WORKSPACE_DB: configuration.databasePath, TDN_ARTIFACT_ROOT: configuration.artifactRoot };
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OWNER_API_LOCAL_TEST: 'yes' }, defaults), /exactly true or false/);
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_OWNER_API_LOCAL_TEST: 'true' }, defaults), /requires OWNER writes/);
  const enabled = operatorAppConfigurationFromEnvironment({ ...base, TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_LOCAL_TEST: 'true', TDN_OWNER_API_ACTOR_ID: 'owner:local' }, defaults);
  assert.equal(enabled.localTestOwner, true);
  assert.equal(enabled.ownerToken, undefined);
});

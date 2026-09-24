import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/database.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const brandId = '55555555-5555-4555-8555-000000000001';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const displayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
};
const profile = { brandName: 'Canxi Việt', hotline: '0900 000 000' };
const createBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile, displayRules, ...patch });
const revisionBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, profile: { ...profile, hotline: '0900 111 222' }, displayRules, ...patch });
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  openDatabase({ databasePath }).db.close();
  return { root, databasePath, artifactRoot };
}
async function listen(handler: http.RequestListener): Promise<{ base: string; close(): Promise<void> }> {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
async function serveBoth(state: ReturnType<typeof fixture>, run: (read: string, owner: string) => Promise<void>) {
  let tick = 0;
  const owner = openContentOwnerApi({ ...state, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', uuid: () => brandId, now: () => new Date(Date.UTC(2027, 0, 1, 0, 0, tick++)) });
  const read = openContentReadApi(state);
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  try { await run(readServer.base, ownerServer.base); } finally { await ownerServer.close(); await readServer.close(); owner.close(); read.close(); }
}
function brandRows(databasePath: string): { brands: bigint; revisions: bigint } {
  const db = new BetterSqlite3(databasePath); db.defaultSafeIntegers(true);
  const value = db.prepare('SELECT (SELECT count(*) FROM flow_content_brands) brands, (SELECT count(*) FROM flow_content_brand_revisions) revisions').get() as { brands: bigint; revisions: bigint };
  db.close(); return value;
}

test('OWNER create and revision return closed receipts with exact retries and conflicts', async () => {
  const state = fixture();
  await serveBoth(state, async (_read, owner) => {
    const created = await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody() });
    assert.equal(created.status, 201);
    const receipt = await created.json() as Record<string, unknown>;
    assert.deepEqual({ ...receipt, createdAt: '<t>' }, { contractVersion: '1.0.0', brandId, brandKey: 'canxi-viet', version: 1, brandName: 'Canxi Việt', createdAt: '<t>', exactRetry: false });
    const retry = await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody() });
    assert.equal(retry.status, 200); assert.equal(((await retry.json()) as { exactRetry: boolean }).exactRetry, true);
    assert.equal((await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody({ profile: { brandName: 'Khác' } }) })).status, 409);
    const revised = await fetch(`${owner}/owner-api/content/brands/${brandId}/revisions`, { method: 'POST', headers, body: revisionBody() });
    assert.equal(revised.status, 201); assert.equal(((await revised.json()) as { version: number }).version, 2);
    const revisionRetry = await fetch(`${owner}/owner-api/content/brands/${brandId}/revisions`, { method: 'POST', headers, body: revisionBody() });
    assert.equal(revisionRetry.status, 200);
    assert.equal((await fetch(`${owner}/owner-api/content/brands/${brandId}/revisions`, { method: 'POST', headers, body: revisionBody({ profile: { brandName: 'Stale' } }) })).status, 409);
    assert.equal((await fetch(`${owner}/owner-api/content/brands/55555555-5555-4555-8555-00000000ffff/revisions`, { method: 'POST', headers, body: revisionBody() })).status, 404);
  });
  assert.deepEqual(brandRows(state.databasePath), { brands: 1n, revisions: 2n });
});

test('OWNER boundary rejects bad auth, origin, content type, size, method and body without writing', async () => {
  const state = fixture();
  await serveBoth(state, async (_read, owner) => {
    const url = `${owner}/owner-api/content/brands`;
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body: createBody() })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, origin: 'http://evil.example' }, body: createBody() })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: createBody() })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', headers, body: createBody({ profile: { brandName: 'x'.repeat(5000) } }) })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', headers, body: createBody({ extra: 1 }) })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', headers, body: '{not json' })).status, 400);
    assert.equal((await fetch(url, { method: 'GET', headers })).status, 405);
    assert.equal((await fetch(`${owner}/owner-api/content/brands/not-a-uuid/revisions`, { method: 'POST', headers, body: revisionBody() })).status, 400);
    assert.equal((await fetch(`${owner}/owner-api/content/unknown`, { method: 'POST', headers, body: createBody() })).status, 404);
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(preflight.status, 204);
  });
  assert.deepEqual(brandRows(state.databasePath), { brands: 0n, revisions: 0n });
});

test('read API lists and details verified brands and fails closed', async () => {
  const state = fixture();
  await serveBoth(state, async (read, owner) => {
    assert.deepEqual(await (await fetch(`${read}/api/content/brands`)).json(), { contractVersion: '1.0.0', brands: [] });
    await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody() });
    await fetch(`${owner}/owner-api/content/brands/${brandId}/revisions`, { method: 'POST', headers, body: revisionBody() });
    const list = await (await fetch(`${read}/api/content/brands`)).json() as { brands: Record<string, unknown>[] };
    assert.equal(list.brands.length, 1);
    assert.deepEqual({ ...list.brands[0], updatedAt: '<t>' }, { brandId, brandKey: 'canxi-viet', version: 2, brandName: 'Canxi Việt', updatedAt: '<t>' });
    const detail = await (await fetch(`${read}/api/content/brands/${brandId}`)).json() as { brand: Record<string, unknown>; history: { version: number }[] };
    assert.deepEqual(Object.keys(detail.brand).sort(), ['brandId', 'brandKey', 'createdAt', 'displayRules', 'profile', 'version']);
    assert.deepEqual(detail.brand.profile, { ...profile, hotline: '0900 111 222' });
    assert.deepEqual(detail.history.map((item) => item.version), [1, 2]);
    assert.equal((await fetch(`${read}/api/content/brands/55555555-5555-4555-8555-00000000ffff`)).status, 404);
    assert.equal((await fetch(`${read}/api/content/brands/not-a-uuid`)).status, 400);
    assert.equal((await fetch(`${read}/api/content/brands`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${read}/api/content/brands?x=1`)).status, 400);
  });
  const db = new BetterSqlite3(state.databasePath);
  const { digest } = db.prepare('SELECT brand_artifact_sha256 digest FROM flow_content_brand_revisions WHERE version = 2').get() as { digest: string };
  db.close();
  const file = path.join(state.artifactRoot, 'sha256', digest.slice(0, 2), digest);
  fs.chmodSync(file, 0o600); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('0900 111 222', '0900 999 999'));
  const read = openContentReadApi(state); const server = await listen(read.handler);
  try {
    const tampered = await fetch(`${server.base}/api/content/brands/${brandId}`);
    assert.equal(tampered.status, 500);
    assert.deepEqual(await tampered.json(), { error: { code: 'integrity_error', message: 'Stored content data failed integrity verification' } });
  } finally { await server.close(); read.close(); }
});

test('an exact retry restores a committed brand artifact that was never published', async () => {
  const state = fixture();
  await serveBoth(state, async (read, owner) => {
    await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody() });
    const db = new BetterSqlite3(state.databasePath);
    const { digest } = db.prepare('SELECT brand_artifact_sha256 digest FROM flow_content_brand_revisions WHERE version = 1').get() as { digest: string };
    db.close();
    const file = path.join(state.artifactRoot, 'sha256', digest.slice(0, 2), digest);
    fs.rmSync(file);
    assert.equal((await fetch(`${read}/api/content/brands/${brandId}`)).status, 500);
    const changed = await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody({ profile: { brandName: 'Khác' } }) });
    assert.equal(changed.status, 409);
    assert.equal(fs.existsSync(file), false);
    const retry = await fetch(`${owner}/owner-api/content/brands`, { method: 'POST', headers, body: createBody() });
    assert.equal(retry.status, 200);
    assert.equal(fs.existsSync(file), true);
    assert.equal((await fetch(`${read}/api/content/brands/${brandId}`)).status, 200);
  });
  assert.deepEqual(brandRows(state.databasePath), { brands: 1n, revisions: 1n });
});

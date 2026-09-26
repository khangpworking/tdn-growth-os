import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import BetterSqlite3 from 'better-sqlite3';
import ownerContentPromptApiSchema from '../../contracts/api/owner-content-prompt-api.schema.json' with { type: 'json' };
import contentPromptCreateSchema from '../../contracts/flow/content-prompt-create-request.schema.json' with { type: 'json' };
import { openDatabase } from '../../src/platform/db/database.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003'] as const;
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };
const content = (patch: Record<string, unknown> = {}) => ({ name: 'Tết gia đình', creativeText: 'Viết như người con xa nhà nghĩ về bố mẹ ngày Tết.', recommendedModel: 'gpt-5.6-luna', tags: ['Tết'], ...patch });
const createBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', promptKey: 'tet-gia-dinh', promptType: 'BIG_IDEA', prompt: content(), ...patch });
const revisionBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, prompt: content({ name: 'Tết đoàn viên' }), ...patch });
const lifecycleBody = (action: string, expectedSequence: number) => JSON.stringify({ contractVersion: '1.0.0', action, expectedSequence });

async function listen(handler: http.RequestListener): Promise<{ base: string; close(): Promise<void> }> {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
async function serve(run: (read: string, owner: string, state: { databasePath: string; artifactRoot: string; advance(days: number): void }) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-prompt-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  openDatabase({ databasePath }).db.close();
  const clock = { now: Date.UTC(2027, 0, 1) }; const queue: string[] = [...ids];
  const now = () => new Date(clock.now);
  const owner = openContentOwnerApi({ databasePath, artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', uuid: () => queue.shift()!, now });
  const read = openContentReadApi({ databasePath, artifactRoot, now });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  try { await run(readServer.base, ownerServer.base, { databasePath, artifactRoot, advance: (days) => { clock.now += days * 86_400_000; } }); }
  finally { await ownerServer.close(); await readServer.close(); owner.close(); read.close(); }
}
function counts(databasePath: string): Record<string, number> {
  const db = new BetterSqlite3(databasePath);
  const value = db.prepare(`SELECT (SELECT count(*) FROM flow_content_prompts) prompts, (SELECT count(*) FROM flow_content_prompt_revisions) revisions,
    (SELECT count(*) FROM flow_content_prompt_lifecycle) lifecycle, (SELECT count(*) FROM artifact_manifests) manifests`).get() as Record<string, number>;
  db.close(); return value;
}
const post = (url: string, body: string) => fetch(url, { method: 'POST', headers, body });

test('the library lists read-only system prompts with their system layers', async () => {
  await serve(async (read) => {
    const list = await (await fetch(`${read}/api/content/prompts`)).json() as { systemPrompts: { id: string; promptType: string; isDefault: boolean }[]; prompts: unknown[] };
    assert.deepEqual(list.systemPrompts.map((entry) => [entry.promptType, entry.isDefault]), [['BIG_IDEA', true], ['BIG_IDEA', false], ['ANGLE', true], ['ANGLE', false], ['CAPTION', true], ['CAPTION', false], ['POSTER', true]]);
    assert.deepEqual(list.prompts, []);
    const detail = await (await fetch(`${read}/api/content/system-prompts/system-caption-facebook`)).json() as { systemPrompt: { sha256: string; prompt: { creativeText: string; recommendedModel: string } }; systemLayer: { promptType: string; text: string } };
    assert.match(detail.systemPrompt.prompt.creativeText, /Senior Vietnamese Social Copywriter/);
    assert.match(detail.systemPrompt.sha256, /^[0-9a-f]{64}$/);
    assert.equal(detail.systemLayer.promptType, 'CAPTION');
    assert.match(detail.systemLayer.text, /OUTPUT TUYỆT ĐỐI/);
    assert.equal((await fetch(`${read}/api/content/system-prompts/system-khong-co`)).status, 404);
    assert.equal((await fetch(`${read}/api/content/system-prompts/Bad_Id`)).status, 400);
  });
});

test('OWNER prompt create, revision and duplicate return receipts, retries and conflicts', async () => {
  await serve(async (read, owner) => {
    const created = await post(`${owner}/owner-api/content/prompts`, createBody());
    assert.equal(created.status, 201);
    const receipt = await created.json() as Record<string, unknown>;
    assert.deepEqual({ ...receipt, createdAt: '<t>' }, { contractVersion: '1.0.0', promptId: ids[0], promptKey: 'tet-gia-dinh', promptType: 'BIG_IDEA', version: 1, name: 'Tết gia đình', createdAt: '<t>', exactRetry: false });
    assert.equal((await post(`${owner}/owner-api/content/prompts`, createBody())).status, 200);
    assert.equal((await post(`${owner}/owner-api/content/prompts`, createBody({ prompt: content({ name: 'Khác' }) }))).status, 409);
    const revisionUrl = `${owner}/owner-api/content/prompts/${ids[0]}/revisions`;
    assert.equal((await post(revisionUrl, revisionBody())).status, 201);
    assert.equal((await post(revisionUrl, revisionBody())).status, 200);
    assert.equal((await post(revisionUrl, revisionBody({ prompt: content({ name: 'Stale' }) }))).status, 409);
    assert.equal((await post(`${owner}/owner-api/content/prompts/aaaaaaaa-aaaa-4aaa-8aaa-00000000ffff/revisions`, revisionBody())).status, 404);
    const duplicate = await post(`${owner}/owner-api/content/prompts`, createBody({ promptKey: 'ban-sao-he-thong', duplicatedFrom: { kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 } }));
    assert.equal(duplicate.status, 201);
    const detail = await (await fetch(`${read}/api/content/prompts/${ids[1]}`)).json() as { prompt: { duplicatedFrom?: unknown }; history: unknown[]; lifecycle: unknown; systemLayer: { promptType: string } };
    assert.deepEqual([detail.prompt.duplicatedFrom, detail.history.length, detail.lifecycle, detail.systemLayer.promptType], [{ kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 }, 1, { sequence: 0 }, 'BIG_IDEA']);
    const list = await (await fetch(`${read}/api/content/prompts`)).json() as { prompts: { promptId: string; version: number; name: string }[] };
    assert.deepEqual(list.prompts.map((entry) => [entry.promptId, entry.version, entry.name]), [[ids[0], 2, 'Tết đoàn viên'], [ids[1], 1, 'Tết gia đình']]);
  });
});

test('invalid OWNER prompt requests are rejected without writing', async () => {
  await serve(async (_read, owner, state) => {
    assert.equal((await post(`${owner}/owner-api/content/prompts`, createBody())).status, 201);
    const before = counts(state.databasePath);
    const rejected: [string, string, number][] = [
      [`${owner}/owner-api/content/prompts`, createBody({ promptKey: 'poster-sai', promptType: 'POSTER' }), 400],
      [`${owner}/owner-api/content/prompts`, createBody({ promptKey: 'thua', extra: 1 }), 400],
      [`${owner}/owner-api/content/prompts`, createBody({ promptKey: 'nguon-sai', duplicatedFrom: { kind: 'SYSTEM', id: 'system-angle-social', version: 1 } }), 400],
      [`${owner}/owner-api/content/prompts`, createBody({ promptKey: 'nguon-sai-2', duplicatedFrom: { kind: 'USER', id: ids[0], version: 5 } }), 400],
      [`${owner}/owner-api/content/prompts/${ids[0]}/revisions`, revisionBody({ prompt: content({ recommendedModel: 'gpt-image-2' }) }), 400],
      [`${owner}/owner-api/content/prompts/${ids[0]}/lifecycle`, lifecycleBody('RESTORE', 0), 409],
      [`${owner}/owner-api/content/prompts/${ids[0]}/lifecycle`, lifecycleBody('ARCHIVE', 0), 400],
      [`${owner}/owner-api/content/prompts/not-a-uuid/lifecycle`, lifecycleBody('DELETE', 0), 400],
      [`${owner}/owner-api/content/prompts`, '{', 400],
    ];
    for (const [url, body, status] of rejected) assert.equal((await post(url, body)).status, status, body);
    assert.equal((await fetch(`${owner}/owner-api/content/prompts`, { method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body: createBody({ promptKey: 'khong-token' }) })).status, 401);
    assert.deepEqual(counts(state.databasePath), before);
  });
});

test('prompts are deleted, restorable for 30 days, then drop out of the library', async () => {
  await serve(async (read, owner, state) => {
    await post(`${owner}/owner-api/content/prompts`, createBody());
    const lifecycleUrl = `${owner}/owner-api/content/prompts/${ids[0]}/lifecycle`;
    const deleted = await post(lifecycleUrl, lifecycleBody('DELETE', 0));
    assert.equal(deleted.status, 201);
    assert.deepEqual(await deleted.json(), { contractVersion: '1.0.0', promptId: ids[0], sequence: 1, action: 'DELETE', createdAt: '2027-01-01T00:00:00.000Z', restorableUntil: '2027-01-31T00:00:00.000Z', exactRetry: false });
    assert.equal((await post(lifecycleUrl, lifecycleBody('DELETE', 0))).status, 200);
    assert.equal((await post(`${owner}/owner-api/content/prompts/${ids[0]}/revisions`, revisionBody())).status, 409);
    let list = await (await fetch(`${read}/api/content/prompts`)).json() as { prompts: { deleted?: unknown }[] };
    assert.deepEqual(list.prompts[0]!.deleted, { deletedAt: '2027-01-01T00:00:00.000Z', restorableUntil: '2027-01-31T00:00:00.000Z' });
    state.advance(10);
    assert.equal((await post(lifecycleUrl, lifecycleBody('RESTORE', 1))).status, 201);
    list = await (await fetch(`${read}/api/content/prompts`)).json() as { prompts: { deleted?: unknown }[] };
    assert.equal(list.prompts[0]!.deleted, undefined);
    assert.equal((await post(lifecycleUrl, lifecycleBody('DELETE', 2))).status, 201);
    state.advance(31);
    list = await (await fetch(`${read}/api/content/prompts`)).json() as { prompts: { deleted?: unknown }[] };
    assert.deepEqual(list.prompts, []);
    assert.equal((await post(lifecycleUrl, lifecycleBody('RESTORE', 3))).status, 409);
    const detail = await (await fetch(`${read}/api/content/prompts/${ids[0]}`)).json() as { lifecycle: { sequence: number; deleted?: unknown } };
    assert.equal(detail.lifecycle.sequence, 3);
  });
});

test('prompt writes are refused without writing when the prompt history fails verification', async () => {
  await serve(async (read, owner, state) => {
    await post(`${owner}/owner-api/content/prompts`, createBody());
    const db = new BetterSqlite3(state.databasePath);
    const { digest } = db.prepare('SELECT prompt_artifact_sha256 digest FROM flow_content_prompt_revisions WHERE version = 1').get() as { digest: string };
    db.close();
    const file = path.join(state.artifactRoot, 'sha256', digest.slice(0, 2), digest);
    fs.chmodSync(file, 0o600); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Tết gia đình', 'Tet gia dinh'));
    const before = counts(state.databasePath);
    assert.equal((await post(`${owner}/owner-api/content/prompts/${ids[0]}/revisions`, revisionBody())).status, 500);
    assert.equal((await post(`${owner}/owner-api/content/prompts/${ids[0]}/lifecycle`, lifecycleBody('DELETE', 0))).status, 500);
    assert.equal((await post(`${owner}/owner-api/content/prompts`, createBody({ promptKey: 'ban-sao', duplicatedFrom: { kind: 'USER', id: ids[0], version: 1 } }))).status, 500);
    assert.deepEqual(counts(state.databasePath), before);
    assert.equal((await fetch(`${read}/api/content/prompts/${ids[0]}`)).status, 500);
    assert.equal((await fetch(`${read}/api/content/prompts`)).status, 500);
  });
});

test('an exact create retry is refused when a later prompt revision fails verification', async () => {
  await serve(async (_read, owner, state) => {
    await post(`${owner}/owner-api/content/prompts`, createBody());
    assert.equal((await post(`${owner}/owner-api/content/prompts/${ids[0]}/revisions`, revisionBody())).status, 201);
    const db = new BetterSqlite3(state.databasePath);
    const { digest } = db.prepare('SELECT prompt_artifact_sha256 digest FROM flow_content_prompt_revisions WHERE version = 2').get() as { digest: string };
    db.close();
    const file = path.join(state.artifactRoot, 'sha256', digest.slice(0, 2), digest);
    fs.chmodSync(file, 0o600); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Tết đoàn viên', 'Tet doan vien'));
    const before = counts(state.databasePath);
    const retried = await post(`${owner}/owner-api/content/prompts`, createBody());
    assert.equal(retried.status, 500);
    assert.deepEqual(await retried.json(), { error: { code: 'integrity_error', message: 'Stored content data failed integrity verification' } });
    assert.equal((await post(`${owner}/owner-api/content/prompts`, createBody({ prompt: content({ name: 'Khác' }) }))).status, 409, 'a changed create is still a key conflict');
    assert.deepEqual(counts(state.databasePath), before);
  });
});

test('the OWNER prompt contract accepts real requests and rejects invalid nested prompts', () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
  ajv.addSchema(contentPromptCreateSchema); ajv.addSchema(ownerContentPromptApiSchema);
  const create = ajv.getSchema(`${ownerContentPromptApiSchema.$id}#/$defs/createRequest`)!;
  assert.equal(create(JSON.parse(createBody())), true);
  assert.equal(create(JSON.parse(createBody({ prompt: { name: 'X' } }))), false);
  assert.equal(create(JSON.parse(createBody({ prompt: content({ recommendedModel: 'gpt-4' }) }))), false);
  assert.equal(create(JSON.parse(createBody({ duplicatedFrom: { kind: 'SYSTEM', id: '../etc', version: 1 } }))), false);
});

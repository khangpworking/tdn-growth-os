import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { MAX_JSON_ARTIFACT_BYTES } from '../../src/modules/analysis/research-automation/model.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { metaOwningFixture, metaWorkspaceId as workspaceId, metaRunId as runId } from '../helpers/meta-page-fixture.js';
const hash = (v: Uint8Array): string => createHash('sha256').update(v).digest('hex');
async function files(root: string): Promise<string[]> {
  try { return (await fs.readdir(root, { recursive: true })).sort(); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
test('actual derived source member exact8MiB fits complete retained package; +4-byte member and +1-byte HTTP body reject before DB/staging/CAS publication', async t => {
  // Authentic numeric shop source of a different literal length yields exact canonical member equality without a budget test API.
  const f = await metaOwningFixture(t, '10000');
  const emptyHtml = { ...f.request, htmlBase64: '' };
  const desiredEncodedSize = MAX_JSON_ARTIFACT_BYTES - Buffer.byteLength(canonicalJson(emptyHtml));
  assert.equal(desiredEncodedSize % 4, 0);
  const size = desiredEncodedSize / 4 * 3;
  const html = Buffer.concat([f.raw.html, Buffer.alloc(size - f.raw.html.length, 32)]);
  const capture = { ...f.raw.capture, htmlSha256: hash(html) };
  const request = { ...f.request, htmlBase64: html.toString('base64'), visibleFieldsBase64: Buffer.from(JSON.stringify(capture)).toString('base64') };
  assert.equal(Buffer.byteLength(canonicalJson(request)), MAX_JSON_ARTIFACT_BYTES);
  let stagingCalls = 0, casPuts = 0;
  const originalOwnership = f.staging.withOwnership.bind(f.staging), originalPut = f.staging.put.bind(f.staging);
  f.staging.withOwnership = async operation => { stagingCalls++; return originalOwnership(operation); };
  f.staging.put = async bytes => { casPuts++; return originalPut(bytes); };
  const biggerHtml = Buffer.concat([html, Buffer.from('x')]);
  const bigger = { ...request, requestKey: randomUUID(), htmlBase64: biggerHtml.toString('base64'),
    visibleFieldsBase64: Buffer.from(JSON.stringify({ ...capture, htmlSha256: hash(biggerHtml) })).toString('base64') };
  assert.equal(Buffer.byteLength(canonicalJson(bigger)), MAX_JSON_ARTIFACT_BYTES + 4);
  const before = f.db.prepare('SELECT total_changes() n').get(), beforeFiles = await files(f.artifactRoot);
  await assert.rejects(f.service.prepareMetaPageSource(workspaceId, runId, bigger, { role: 'OWNER' }), /META_SOURCE_SIZE_INVALID/);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.deepEqual(await files(f.artifactRoot), beforeFiles);
  assert.equal(stagingCalls, 0); assert.equal(casPuts, 0);
  const prepared = await f.service.prepareMetaPageSource(workspaceId, runId, request, { role: 'OWNER' });
  const member = f.db.prepare("SELECT byte_size n FROM foundation_source_package_files WHERE package_id=? AND logical_path='request/prepare.json'").get(prepared.prepared.packageId) as { n: number | bigint };
  assert.equal(Number(member.n), MAX_JSON_ARTIFACT_BYTES);
  assert.deepEqual(await f.service.readMetaPageSource(workspaceId, runId, prepared.prepared.packageId), prepared);
  const beforeRetry = { changes: f.db.prepare('SELECT total_changes() n').get(), stagingCalls, casPuts };
  assert.deepEqual(await f.service.prepareMetaPageSource(workspaceId, runId, request, { role: 'OWNER' }), prepared);
  assert.deepEqual({ changes: f.db.prepare('SELECT total_changes() n').get(), stagingCalls, casPuts }, beforeRetry);
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = (probe.address() as AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve())); const origin = `http://127.0.0.1:${port}`, token = 'synthetic-budget-owner-1234567890-abcdefghijklmnop';
  const app = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: 'owner:synthetic-budget' } });
  const server = http.createServer(app.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  try {
    const post = (body: string) => fetch(`${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/meta-page`,
      { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
    assert.equal((await post(canonicalJson(request))).status, 201, 'exact complete request body equality preserves the retained retry');
    const bodyBefore = f.db.prepare('SELECT total_changes() n').get(), filesBefore = await files(f.artifactRoot);
    assert.equal((await post(canonicalJson(request) + ' ')).status, 413);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), bodyBefore); assert.deepEqual(await files(f.artifactRoot), filesBefore);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await app.close(); }
  assert.ok(!(await files(path.join(f.artifactRoot, '.owner-api-requests'))).length);
});

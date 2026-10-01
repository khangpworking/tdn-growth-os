import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { createR2MediaArchive, R2ArchiveError, R2MediaArchive } from '../../src/platform/artifacts/r2-media-archive.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { archiveRetainedMedia } from '../../src/modules/flow/retained-media-archive.js';
import { registerContentManifest } from '../../src/modules/flow/content-artifacts.js';
import { syntheticPng } from '../helpers/content-images.js';

async function fixture() {
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  let requests = 0;
  let puts = 0;
  let fail = false;
  let corrupt = false;
  const server = http.createServer(async (req, res) => {
    requests++;
    if (req.method === 'PUT') puts++;
    if (fail) { res.writeHead(503); res.end('SYNTHETIC_SECRET_DO_NOT_LOG'); return; }
    const key = new URL(req.url!, 'http://localhost').pathname;
    if (req.method === 'PUT') {
      assert.equal(req.headers['if-none-match'], '*');
      assert.equal(req.headers['cache-control'], 'private, no-store');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (objects.has(key)) { res.writeHead(412); res.end(); return; }
      objects.set(key, { bytes: Buffer.concat(chunks), type: String(req.headers['content-type']) });
      res.writeHead(200); res.end(); return;
    }
    const object = objects.get(key);
    if (!object) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': object.type, 'content-length': object.bytes.length });
    const payload = Buffer.from(object.bytes);
    if (corrupt) payload[0] = payload[0]! ^ 1;
    res.end(payload);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const client = new S3Client({
    endpoint: `http://127.0.0.1:${address.port}`, region: 'auto', forcePathStyle: true,
    credentials: { accessKeyId: 'synthetic-access-key', secretAccessKey: 'synthetic-secret-key' },
    maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return {
    archive: new R2MediaArchive(client, 'tdn-media'), objects,
    get requests() { return requests; }, get puts() { return puts; },
    set fail(value: boolean) { fail = value; }, set corrupt(value: boolean) { corrupt = value; },
    async close() { client.destroy(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

test('private archive creates one digest object, verifies exact retries and rejects corrupt existing bytes', async () => {
  const state = await fixture();
  try {
    const bytes = syntheticPng();
    const digest = hash(bytes);
    const first = await state.archive.copy(bytes, digest, 'image/png');
    assert.equal(first.status, 'copied');
    assert.equal(first.key, `tdn/v1/media/sha256/${digest.slice(0, 2)}/${digest}`);
    assert.equal((await state.archive.copy(bytes, digest, 'image/png')).status, 'verified_existing');
    assert.equal(state.objects.size, 1);
    const retained = [...state.objects.values()][0]!;
    assert.deepEqual(retained.bytes, bytes);
    state.corrupt = true;
    await assert.rejects(state.archive.copy(bytes, digest, 'image/png'), (error: unknown) => error instanceof R2ArchiveError && error.code === 'integrity');
    assert.deepEqual(retained.bytes, bytes);
  } finally { await state.close(); }
});

test('invalid inputs make no request and provider failure is sanitized with no SDK retry', async () => {
  const state = await fixture();
  try {
    const bytes = syntheticPng();
    await assert.rejects(state.archive.copy(bytes, '0'.repeat(64), 'image/png'), R2ArchiveError);
    await assert.rejects(state.archive.copy(Buffer.alloc(8 * 1024 * 1024 + 1), '0'.repeat(64), 'image/png'), R2ArchiveError);
    assert.equal(state.requests, 0);
    state.fail = true;
    await assert.rejects(state.archive.copy(bytes, hash(bytes), 'image/png'), (error: unknown) =>
      error instanceof R2ArchiveError && error.message === 'Private R2 media archive failed: unavailable');
    assert.equal(state.puts, 1);
    assert.equal(state.objects.size, 0);
  } finally { await state.close(); }
});

test('explicit retained-media copy keeps SQLite and local bytes unchanged and refuses ineligible artifacts', async () => {
  const state = await fixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-r2-'));
  const db = openDatabase({ databasePath: path.join(root, 'tdn.sqlite') }).db;
  try {
    const local = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
    const bytes = syntheticPng();
    const stored = await local.put(bytes);
    registerContentManifest(db, stored, '2026-10-02T00:00:00.000Z', 'image/png');
    db.pragma('query_only = ON');
    const changes = db.prepare('SELECT total_changes() changes').get();
    const manifests = db.prepare('SELECT * FROM artifact_manifests').all();
    const receipt = await archiveRetainedMedia(db, local, state.archive, stored.sha256);
    assert.equal(receipt.status, 'copied');
    assert.deepEqual(db.prepare('SELECT total_changes() changes').get(), changes);
    assert.deepEqual(db.prepare('SELECT * FROM artifact_manifests').all(), manifests);
    assert.deepEqual(await local.read(stored.sha256), bytes);
    await assert.rejects(archiveRetainedMedia(db, local, state.archive, 'a'.repeat(64)), R2ArchiveError);
    db.pragma('query_only = OFF');
    db.prepare("UPDATE artifact_manifests SET retention_status = 'eligible_for_deletion' WHERE sha256 = ?").run(stored.sha256);
    db.pragma('query_only = ON');
    await assert.rejects(archiveRetainedMedia(db, local, state.archive, stored.sha256), R2ArchiveError);
    assert.equal(state.puts, 1);
  } finally { db.close(); await state.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('production archive is opt-in, bucket-restricted and rejects endpoint-like account configuration', () => {
  assert.throws(() => createR2MediaArchive({}), R2ArchiveError);
  const env = { TDN_R2_ENABLED: 'true', TDN_R2_ACCOUNT_ID: 'a'.repeat(32), TDN_R2_ACCESS_KEY_ID: 'b'.repeat(32), TDN_R2_SECRET_ACCESS_KEY: 'c'.repeat(64), TDN_R2_BUCKET: 'tdn-media' };
  for (const override of [{ TDN_R2_ACCOUNT_ID: 'http://localhost' }, { TDN_R2_BUCKET: 'other' }, { TDN_R2_ENABLED: 'false' }]) {
    assert.throws(() => createR2MediaArchive({ ...env, ...override }), R2ArchiveError);
  }
  const connection = createR2MediaArchive(env);
  connection.close();
});

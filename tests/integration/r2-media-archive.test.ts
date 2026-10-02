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
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { createFakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import { ContentMediaMirror } from '../../src/api/content-media-mirror.js';
import { createPackageFixture, fixtureBrandId, fixtureCampaignId, imageReply, textReply } from '../helpers/content-package-fixture.js';

const ownerToken = 'synthetic-r2-owner-token-with-32-characters-123';
const origin = 'http://127.0.0.1:5173';
const ownerHeaders = { authorization: `Bearer ${ownerToken}`, origin, 'content-type': 'application/json' };
async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { base: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

async function fixture() {
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  let requests = 0;
  let puts = 0;
  let fail = false;
  let corrupt = false;
  let beforeGet: (() => Promise<void>) | undefined;
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
    await beforeGet?.();
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
    set beforeGet(value: (() => Promise<void>) | undefined) { beforeGet = value; },
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

test('web uploads copy only committed media; R2 failure preserves local success and exact retry repairs the copy', async () => {
  const remote = await fixture();
  const local = await createPackageFixture();
  const owner = openContentOwnerApi({ ...local, writeEnabled: true, token: ownerToken, allowedOrigin: origin, actorId: 'owner:synthetic', mediaArchive: remote.archive });
  const read = openContentReadApi(local);
  const writer = await serve(owner.handler); const reader = await serve(read.handler);
  try {
    const bytes = syntheticPng(128, 64);
    const url = `${writer.base}/owner-api/content/brands/${fixtureBrandId}/media/photo`;
    const headers = { ...ownerHeaders, 'content-type': 'image/png' };
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body: new Uint8Array(bytes) })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers, body: 'not an image' })).status, 400);
    assert.equal(remote.requests, 0);
    remote.fail = true;
    const created = await fetch(url, { method: 'POST', headers, body: new Uint8Array(bytes) });
    assert.equal(created.status, 201);
    const receipt = await created.json() as { mediaSha256: string; exactRetry: boolean };
    assert.equal(receipt.mediaSha256, hash(bytes)); assert.equal(receipt.exactRetry, false);
    assert.equal(owner.mediaArchiveStatus!().lastCopy, 'failed');
    assert.equal(remote.puts, 1);
    const counts = local.db.prepare('SELECT (SELECT count(*) FROM flow_content_media) media, (SELECT count(*) FROM artifact_manifests) manifests').get();
    const preview = await fetch(`${reader.base}/api/content/brands/${fixtureBrandId}/media/${receipt.mediaSha256}`);
    assert.equal(preview.status, 200); assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes);
    assert.equal(remote.requests, 1, 'read API never initiates an archive copy');
    remote.fail = false;
    const retry = await fetch(url, { method: 'POST', headers, body: new Uint8Array(bytes) });
    assert.equal(retry.status, 200); assert.equal((await retry.json() as { exactRetry: boolean }).exactRetry, true);
    assert.equal(owner.mediaArchiveStatus!().lastCopy, 'verified');
    assert.equal(owner.mediaArchiveStatus!().failedCopyAttemptsSinceStart, 1, 'a successful repair never erases the earlier failure signal');
    assert.deepEqual(local.db.prepare('SELECT (SELECT count(*) FROM flow_content_media) media, (SELECT count(*) FROM artifact_manifests) manifests').get(), counts);
    assert.deepEqual([...remote.objects.values()][0]!.bytes, bytes);
    assert.equal(remote.objects.size, 1, 'existing fixture images were not backfilled');
  } finally { await writer.close(); await reader.close(); owner.close(); read.close(); local.close(); await remote.close(); }
});

test('web poster generation mirrors the exact committed image; retry never generates another image', async () => {
  const remote = await fixture(); const local = await createPackageFixture();
  const gateway = createFakeCreativeGateway({ text: [textReply('{"post":"Synthetic R2 caption"}')], image: [imageReply()] });
  const owner = openContentOwnerApi({ ...local, writeEnabled: true, token: ownerToken, allowedOrigin: origin, actorId: 'owner:synthetic', gateway, mediaArchive: remote.archive });
  const writer = await serve(owner.handler);
  const post = (url: string, body: unknown) => fetch(`${writer.base}${url}`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify(body) });
  try {
    const created = await post(`/owner-api/content/campaigns/${fixtureCampaignId}/packages`, {
      contractVersion: '1.0.0', requestId: '71000000-0000-4000-8000-000000000001', rows: [{ angleId: local.angleIds[0] }],
      caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
      poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [], includeLogo: false },
    });
    assert.equal(created.status, 201);
    const { packages } = await created.json() as { packages: { packageId: string }[] };
    const url = `/owner-api/content/packages/${packages[0]!.packageId}/generate`;
    assert.equal((await post(url, { contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 2, requestId: '71000000-0000-4000-8000-000000000002' })).status, 201);
    assert.equal(remote.requests, 0, 'caption has no media copy');
    const body = { contractVersion: '1.0.0', part: 'POSTER', plannedCallCount: 2, requestId: '71000000-0000-4000-8000-000000000003' };
    assert.equal((await post(url, body)).status, 201);
    const { bytes } = await local.packages.readPosterImage(packages[0]!.packageId, 1);
    assert.deepEqual([...remote.objects.values()][0]!.bytes, bytes);
    const attempts = local.db.prepare('SELECT count(*) n FROM flow_content_ai_attempts').get();
    assert.equal((await post(url, body)).status, 200);
    assert.equal(remote.objects.size, 1);
    assert.deepEqual(local.db.prepare('SELECT count(*) n FROM flow_content_ai_attempts').get(), attempts);
    assert.equal(owner.mediaArchiveStatus!().lastCopy, 'verified');
  } finally { await writer.close(); owner.close(); local.close(); await remote.close(); }
});

test('mirror drain waits for an in-flight verification even without a connected HTTP client', async () => {
  const remote = await fixture(); const local = await createPackageFixture();
  let release!: () => void; let observed!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { observed = resolve; });
  remote.beforeGet = async () => { observed(); await waiting; };
  try {
    const bytes = syntheticPng(); const artifact = await local.artifacts.put(bytes);
    registerContentManifest(local.db, artifact, '2026-10-02T00:00:00.000Z', 'image/png');
    const mirror = new ContentMediaMirror(local.db, local.artifactRoot, remote.archive);
    const copy = mirror.copy(artifact.sha256);
    await entered;
    let drained = false;
    const drain = mirror.drain().then(() => { drained = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(drained, false, 'shutdown cannot close SQLite/SDK during verification');
    release(); await copy; await drain;
    assert.equal(drained, true); assert.equal(mirror.status.lastCopy, 'verified');
  } finally { release(); local.close(); await remote.close(); }
});

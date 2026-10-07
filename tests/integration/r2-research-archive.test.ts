import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { R2ArchiveError } from '../../src/platform/artifacts/r2-media-archive.js';
import {
  createR2ResearchArchive,
  R2ResearchArchive,
  RESEARCH_ARCHIVE_MAX_BYTES,
  RESEARCH_ARCHIVE_TYPES,
  type ResearchType,
} from '../../src/platform/artifacts/r2-research-archive.js';

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

interface RecordedPut {
  key: string;
  type?: string | undefined;
  cache?: string | undefined;
  noneMatch?: string | undefined;
  metaSha?: string | undefined;
  length?: number | undefined;
  body: Buffer;
}

function openStub() {
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  const puts: RecordedPut[] = [];
  const state = {
    objects,
    puts,
    sends: 0,
    failSend: undefined as unknown,
    corrupt: undefined as 'bytes' | 'length' | 'type' | undefined,
    client: new S3Client({
      region: 'auto',
      credentials: { accessKeyId: 'synthetic-access-key', secretAccessKey: 'synthetic-secret-key' },
    }),
    archive: undefined as unknown as R2ResearchArchive,
    close(): void { state.client.destroy(); },
  };
  (state.client as unknown as { send: (command: unknown) => Promise<unknown> }).send =
    async (command: unknown): Promise<unknown> => {
      state.sends++;
      if (command instanceof PutObjectCommand) {
        const input = command.input;
        const key = String(input.Key);
        const body = Buffer.from(input.Body as Buffer);
        puts.push({
          key, type: input.ContentType, cache: input.CacheControl,
          noneMatch: input.IfNoneMatch, metaSha: input.Metadata?.['sha256'],
          length: input.ContentLength, body,
        });
        if (state.failSend) throw state.failSend;
        if (objects.has(key)) {
          throw Object.assign(new Error('Precondition Failed'), { $metadata: { httpStatusCode: 412 } });
        }
        objects.set(key, { bytes: body, type: String(input.ContentType) });
        return { $metadata: { httpStatusCode: 200 } };
      }
      if (command instanceof GetObjectCommand) {
        const key = String(command.input.Key);
        if (state.failSend) throw state.failSend;
        const stored = objects.get(key);
        if (!stored) throw Object.assign(new Error('Not Found'), { $metadata: { httpStatusCode: 404 } });
        const payload = Buffer.from(stored.bytes);
        let length = stored.bytes.length;
        let type = stored.type;
        if (state.corrupt === 'bytes') payload[0] = payload[0]! ^ 1;
        if (state.corrupt === 'length') length += 1;
        if (state.corrupt === 'type') type = 'text/html';
        return {
          Body: Readable.from([payload]), ContentLength: length, ContentType: type,
          $metadata: { httpStatusCode: 200 },
        };
      }
      throw new Error('unexpected command');
    };
  state.archive = new R2ResearchArchive(state.client, 'tdn-media');
  return state;
}

function payloadFor(type: ResearchType): Buffer {
  return Buffer.from(`synthetic research payload for ${type}`);
}

test('research archive copies each allowed type under its own prefix with a conditional private put', async () => {
  const state = openStub();
  try {
    assert.equal(RESEARCH_ARCHIVE_MAX_BYTES, 32 * 1024 * 1024);
    assert.deepEqual([...RESEARCH_ARCHIVE_TYPES], [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'application/json',
      'image/jpeg',
      'image/png',
    ]);
    for (const mediaType of RESEARCH_ARCHIVE_TYPES) {
      const bytes = payloadFor(mediaType);
      const sha = hash(bytes);
      const receipt = await state.archive.copy(bytes, sha, mediaType);
      assert.equal(receipt.status, 'copied');
      assert.equal(receipt.key, `tdn/v1/research/sha256/${sha.slice(0, 2)}/${sha}`);
      assert.equal(receipt.sha256, sha);
      assert.equal(receipt.byteSize, bytes.length);
    }
    assert.equal(state.puts.length, RESEARCH_ARCHIVE_TYPES.length);
    assert.equal(state.objects.size, RESEARCH_ARCHIVE_TYPES.length);
    for (const [index, mediaType] of RESEARCH_ARCHIVE_TYPES.entries()) {
      const bytes = payloadFor(mediaType);
      const sha = hash(bytes);
      const put = state.puts[index]!;
      assert.equal(put.key, `tdn/v1/research/sha256/${sha.slice(0, 2)}/${sha}`);
      assert.ok(put.key.startsWith('tdn/v1/research/sha256/'));
      assert.equal(put.type, mediaType);
      assert.equal(put.cache, 'private, no-store');
      assert.equal(put.noneMatch, '*');
      assert.equal(put.metaSha, sha);
      assert.equal(put.length, bytes.length);
      assert.deepEqual(put.body, bytes);
    }
  } finally { state.close(); }
});

test('existing research object verifies without overwrite', async () => {
  const state = openStub();
  try {
    const bytes = payloadFor('application/pdf');
    const sha = hash(bytes);
    const key = `tdn/v1/research/sha256/${sha.slice(0, 2)}/${sha}`;
    state.objects.set(key, { bytes: Buffer.from(bytes), type: 'application/pdf' });
    const receipt = await state.archive.copy(bytes, sha, 'application/pdf');
    assert.equal(receipt.status, 'verified_existing');
    assert.equal(receipt.key, key);
    assert.equal(state.puts.length, 1);
    assert.equal(state.objects.size, 1);
    assert.deepEqual(state.objects.get(key)!.bytes, bytes);
  } finally { state.close(); }
});

test('corrupt read-back reports integrity and never copies', async () => {
  for (const corrupt of ['bytes', 'length', 'type'] as const) {
    const state = openStub();
    try {
      state.corrupt = corrupt;
      const bytes = payloadFor('application/json');
      await assert.rejects(
        state.archive.copy(bytes, hash(bytes), 'application/json'),
        (error: unknown) => error instanceof R2ArchiveError && error.code === 'integrity',
      );
    } finally { state.close(); }
  }
});

test('provider failure is sanitized and never leaks secrets or endpoints', async () => {
  const state = openStub();
  try {
    const secret = 'SYNTHETIC_SECRET_VALUE_0000';
    const endpoint = 'https://synthetic-endpoint.invalid/0000';
    state.failSend = Object.assign(new Error(`boom ${secret} at ${endpoint}`), {
      $metadata: { httpStatusCode: 503 },
    });
    const bytes = payloadFor('application/pdf');
    await assert.rejects(
      state.archive.copy(bytes, hash(bytes), 'application/pdf'),
      (error: unknown) => {
        assert.ok(error instanceof R2ArchiveError && error.code === 'unavailable');
        assert.equal(error.message, 'Private R2 media archive failed: unavailable');
        assert.ok(!error.message.includes(secret));
        assert.ok(!error.message.includes(endpoint));
        return true;
      },
    );
    assert.equal(state.puts.length, 1);
  } finally { state.close(); }
});

test('invalid inputs make no request', async () => {
  const state = openStub();
  try {
    const bytes = payloadFor('application/json');
    const sha = hash(bytes);
    const cases: Array<{ name: string; input: Buffer; digest: string; type: ResearchType }> = [
      { name: 'disallowed type', input: bytes, digest: sha, type: 'text/html' as unknown as ResearchType },
      { name: 'empty', input: Buffer.alloc(0), digest: '0'.repeat(64), type: 'application/json' },
      { name: 'oversize', input: Buffer.alloc(RESEARCH_ARCHIVE_MAX_BYTES + 1), digest: '0'.repeat(64), type: 'application/pdf' },
      { name: 'bad sha', input: bytes, digest: 'not-a-sha', type: 'application/json' },
      { name: 'mismatched sha', input: bytes, digest: '0'.repeat(64), type: 'application/json' },
    ];
    for (const entry of cases) {
      await assert.rejects(
        state.archive.copy(entry.input, entry.digest, entry.type),
        (error: unknown) => error instanceof R2ArchiveError && error.code === 'invalid_input',
        entry.name,
      );
    }
    assert.equal(state.sends, 0);
    assert.equal(state.puts.length, 0);
    assert.equal(state.objects.size, 0);
  } finally { state.close(); }
});

test('caller mutation after copy does not change the uploaded bytes', async () => {
  const state = openStub();
  try {
    const original = payloadFor('application/pdf');
    const bytes = Buffer.from(original);
    const pending = state.archive.copy(bytes, hash(bytes), 'application/pdf');
    bytes.fill(0x61);
    const receipt = await pending;
    assert.equal(receipt.status, 'copied');
    assert.deepEqual(state.puts[0]!.body, original);
  } finally { state.close(); }
});

test('research archive rejects a bucket other than tdn-media', () => {
  const client = new S3Client({
    region: 'auto',
    credentials: { accessKeyId: 'synthetic-access-key', secretAccessKey: 'synthetic-secret-key' },
  });
  try {
    assert.throws(() => new R2ResearchArchive(client, 'other'), R2ArchiveError);
  } finally { client.destroy(); }
});

test('production research archive is opt-in with validated env', () => {
  const env = {
    TDN_R2_ENABLED: 'true',
    TDN_R2_ACCOUNT_ID: '0'.repeat(32),
    TDN_R2_ACCESS_KEY_ID: 'SYNTHETICKEY1234',
    TDN_R2_SECRET_ACCESS_KEY: 'SYNTHETICSECRET000000000000000000',
    TDN_R2_BUCKET: 'tdn-media',
  };
  assert.throws(() => createR2ResearchArchive({}), R2ArchiveError);
  const bad: Record<string, string>[] = [
    { TDN_R2_ENABLED: 'false' },
    { TDN_R2_ACCOUNT_ID: 'http://localhost' },
    { TDN_R2_ACCOUNT_ID: 'short' },
    { TDN_R2_ACCESS_KEY_ID: 'short' },
    { TDN_R2_SECRET_ACCESS_KEY: 'short' },
    { TDN_R2_BUCKET: 'other' },
  ];
  for (const override of bad) {
    assert.throws(() => createR2ResearchArchive({ ...env, ...override }), R2ArchiveError);
  }
  for (const name of ['TDN_R2_ENABLED', 'TDN_R2_ACCOUNT_ID', 'TDN_R2_ACCESS_KEY_ID', 'TDN_R2_SECRET_ACCESS_KEY', 'TDN_R2_BUCKET'] as const) {
    const missing = { ...env };
    delete missing[name];
    assert.throws(() => createR2ResearchArchive(missing), R2ArchiveError, name);
  }
  const connection = createR2ResearchArchive(env);
  connection.close();
});

test('research archive exposes no delete, remove or list method', () => {
  const names = Object.getOwnPropertyNames(R2ResearchArchive.prototype).sort();
  assert.deepEqual(names, ['constructor', 'copy']);
});

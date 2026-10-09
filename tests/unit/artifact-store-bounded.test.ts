import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createHash, Hash } from 'node:crypto';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';

async function fixture(t: TestContext, bytes = Buffer.from('Synthetic exact retained evidence')) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tdn-artifact-bounded-'));
  const store = new ContentAddressedArtifactStore(root);
  const saved = await store.put(bytes);
  t.after(async () => { t.mock.restoreAll(); await fsp.rm(root, { recursive: true, force: true }); });
  return { store, saved, bytes };
}

const closures = new WeakMap<number[], number[]>();
function trackDescriptors(t: TestContext): number[] {
  const descriptors: number[] = [];
  const closed: number[] = [];
  closures.set(descriptors, closed);
  const close = fs.close;
  t.mock.method(fs, 'close', (fd: number, callback: (error: NodeJS.ErrnoException | null) => void) => {
    closed.push(fd); return close(fd, callback);
  });
  const open = fs.open;
  t.mock.method(fs, 'open', (file: fs.PathLike, flags: string, callback: (error: NodeJS.ErrnoException | null, fd: number) => void) =>
    open(file, flags, (error, fd) => { if (!error) descriptors.push(fd); callback(error, fd); }));
  return descriptors;
}
function assertClosed(descriptors: number[]): void {
  assert.ok(descriptors.length > 0);
  assert.deepEqual(closures.get(descriptors)?.slice().sort(), descriptors.slice().sort(), 'every opened descriptor closes exactly once');
  for (const fd of descriptors) assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
}

test('bounded caller reads exact bytes at the limit, including empty artifacts; invalid limits reject', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), f.bytes);
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length - 1 }), ArtifactIntegrityError);
  for (const maxBytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(f.store.read(f.saved.sha256, { maxBytes }), RangeError);
  const empty = await f.store.put(Buffer.alloc(0));
  assert.deepEqual(await f.store.read(empty.sha256, { maxBytes: 0 }), Buffer.alloc(0));
  await assert.rejects(f.store.read('invalid', { maxBytes: 1 }), TypeError);
});

test('bounded caller detects same-size corruption on every read and exact restoration succeeds', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), f.bytes);
  const damaged = Buffer.from(f.bytes); damaged[0] = damaged[0]! ^ 1;
  await fsp.writeFile(f.saved.absolutePath, damaged);
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), /Artifact digest mismatch/);
  await fsp.writeFile(f.saved.absolutePath, f.bytes);
  assert.deepEqual(await f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), f.bytes);
});

test('bounded caller rejects missing and nonregular artifacts and oversized files before allocation/read', async t => {
  const f = await fixture(t);
  await assert.rejects(f.store.read('0'.repeat(64), { maxBytes: 10 }), { code: 'ENOENT' });
  const descriptors = trackDescriptors(t);
  const alloc = t.mock.method(Buffer, 'alloc');
  const read = t.mock.method(fs, 'read');
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: 0 }), /Artifact exceeds read limit/);
  assert.equal(alloc.mock.callCount(), 0); assert.equal(read.mock.callCount(), 0);
  assertClosed(descriptors);
  await fsp.unlink(f.saved.absolutePath); await fsp.mkdir(f.saved.absolutePath);
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), /Artifact is not a regular file/);
  assert.equal(alloc.mock.callCount(), 0); assert.equal(read.mock.callCount(), 0);
  assertClosed(descriptors);
});

test('bounded reads handle actual partial IO with explicit offsets and close successful descriptors', async t => {
  const f = await fixture(t); const descriptors = trackDescriptors(t); const read = fs.read; const offsets: number[] = [];
  t.mock.method(fs, 'read', (fd: number, buffer: Buffer, offset: number, length: number, position: number,
    callback: (error: NodeJS.ErrnoException | null, bytesRead: number, buffer: Buffer) => void) => {
    assert.equal(offset, position); offsets.push(position);
    return read(fd, buffer, offset, Math.min(length, 3), position, callback);
  });
  assert.deepEqual(await f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), f.bytes);
  assert.deepEqual(offsets, Array.from({ length: Math.ceil(f.bytes.length / 3) }, (_, index) => index * 3));
  assertClosed(descriptors);
});

test('bounded reads reject truncation and growth during IO without retaining an open descriptor', async t => {
  const f = await fixture(t); const descriptors = trackDescriptors(t); const read = fs.read;
  let mutation: 'truncate' | 'grow' = 'truncate';
  t.mock.method(fs, 'read', (fd: number, buffer: Buffer, offset: number, length: number, position: number,
    callback: (error: NodeJS.ErrnoException | null, bytesRead: number, buffer: Buffer) => void) => {
    if (mutation === 'truncate') fs.truncateSync(f.saved.absolutePath, 0);
    else fs.appendFileSync(f.saved.absolutePath, '!');
    return read(fd, buffer, offset, length, position, callback);
  });
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), /Artifact truncated while reading/);
  assertClosed(descriptors);
  await fsp.writeFile(f.saved.absolutePath, f.bytes); mutation = 'grow';
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), /Artifact changed while reading/);
  assertClosed(descriptors);
});

test('bounded reads propagate stat/read errors and preserve close-error precedence', async t => {
  const f = await fixture(t); const descriptors = trackDescriptors(t);
  const statError = new Error('injected descriptor stat error');
  t.mock.method(fs, 'fstat', (_fd: number, callback: (error: Error) => void) => { queueMicrotask(() => callback(statError)); });
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === statError);
  assertClosed(descriptors); t.mock.restoreAll();
  const readDescriptors = trackDescriptors(t), readError = new Error('injected IO error');
  t.mock.method(fs, 'read', (_fd: number, _buffer: Buffer, _offset: number, _length: number, _position: number,
    callback: (error: Error) => void) => { queueMicrotask(() => callback(readError)); });
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === readError);
  assertClosed(readDescriptors);
  const close = fs.close, closeError = new Error('injected close error');
  t.mock.method(fs, 'close', (fd: number, callback: (error: Error) => void) => close(fd, () => callback(closeError)));
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === closeError);
  assertClosed(readDescriptors);
});

test('bounded IO stays asynchronous and simultaneous reads preserve independent identities and buffers', async t => {
  const f = await fixture(t), otherBytes = Buffer.from('Different frozen member'); const other = await f.store.put(otherBytes);
  const descriptors = trackDescriptors(t), read = fs.read; let yielded = false;
  t.mock.method(fs, 'read', (fd: number, buffer: Buffer, offset: number, length: number, position: number,
    callback: (error: NodeJS.ErrnoException | null, bytesRead: number, buffer: Buffer) => void) => {
    setImmediate(() => { yielded = true; read(fd, buffer, offset, length, position, callback); });
  });
  const [first, second] = await Promise.all([f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), f.store.read(other.sha256, { maxBytes: otherBytes.length })]);
  assert.equal(yielded, true); assert.deepEqual(first, f.bytes); assert.deepEqual(second, otherBytes);
  first[0] = first[0]! ^ 1;
  assert.equal(createHash('sha256').update(second).digest('hex'), other.sha256);
  assert.deepEqual(await f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), f.bytes);
  assertClosed(descriptors);
});


test('synchronous allocation, hash and descriptor-IO exceptions reject and close exactly once', async t => {
  const f = await fixture(t);
  for (const operation of ['allocate', 'hash', 'stat-invocation', 'read-invocation'] as const) {
    const descriptors = trackDescriptors(t), injected = new Error(`synchronous ${operation} failure`);
    if (operation === 'allocate') t.mock.method(Buffer, 'alloc', () => { throw injected; });
    else if (operation === 'hash') t.mock.method(Hash.prototype, 'update', () => { throw injected; });
    else if (operation === 'stat-invocation') t.mock.method(fs, 'fstat', () => { throw injected; });
    else t.mock.method(fs, 'read', () => { throw injected; });
    await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === injected);
    assertClosed(descriptors);
    t.mock.restoreAll();
  }
});

test('post-read stat and successful-read close failures propagate; failed open never closes an unopened descriptor', async t => {
  const f = await fixture(t);
  const stat = fs.fstat; const descriptors = trackDescriptors(t); let stats = 0;
  const statError = new Error('post-read stat failed');
  t.mock.method(fs, 'fstat', (fd: number, callback: (error: NodeJS.ErrnoException | null, value?: fs.Stats) => void) => {
    if (++stats === 2) { queueMicrotask(() => callback(statError)); return; }
    return stat(fd, callback);
  });
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === statError);
  assertClosed(descriptors); t.mock.restoreAll();
  const closeDescriptors = trackDescriptors(t), close = fs.close, closeError = new Error('successful read close failed');
  t.mock.method(fs, 'close', (fd: number, callback: (error: Error) => void) => close(fd, () => callback(closeError)));
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === closeError);
  assertClosed(closeDescriptors); t.mock.restoreAll();
  const openError = new Error('synchronous open invocation failed');
  t.mock.method(fs, 'open', () => { throw openError; }); const closeSpy = t.mock.method(fs, 'close');
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === openError);
  assert.equal(closeSpy.mock.callCount(), 0);
});

test('synchronous close invocation failure rejects once and overrides a failed read', async t => {
  const f = await fixture(t); const descriptors = trackDescriptors(t);
  const readError = new Error('read failure before close invocation');
  const closeError = new Error('synchronous close invocation failure');
  t.mock.method(fs, 'read', (_fd: number, _buffer: Buffer, _offset: number, _length: number, _position: number,
    callback: (error: Error) => void) => { queueMicrotask(() => callback(readError)); });
  const close = t.mock.method(fs, 'close', (fd: number) => { fs.closeSync(fd); throw closeError; });
  await assert.rejects(f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }), error => error === closeError);
  assert.equal(close.mock.callCount(), 1);
  for (const fd of descriptors) assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
});

test('actual unpatched bounded IO yields to unrelated event-loop work before a meaningful read completes', async t => {
  const f = await fixture(t, Buffer.alloc(4 * 1024 * 1024, 0x5a));
  let completed = false;
  const reading = f.store.read(f.saved.sha256, { maxBytes: f.bytes.length }).then(bytes => { completed = true; return bytes; });
  assert.equal(completed, false, 'actual IO must not complete synchronously');
  const progressedDuringRead = await new Promise<boolean>(resolve => setImmediate(() => resolve(!completed)));
  assert.equal(progressedDuringRead, true, 'unrelated event-loop work progresses while actual descriptor IO is pending');
  assert.deepEqual(await reading, f.bytes);
  assert.equal(completed, true);
});

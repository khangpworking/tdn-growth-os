import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SourcePackageService, SourcePackageReadLimitError } from '../../src/modules/foundation/source-package-service.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const binding = 'a'.repeat(64);
const now = () => new Date('2026-10-09T00:00:00Z');
async function setup(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-source-budget-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const store = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const service = new SourcePackageService({ db, artifactStore: store, now });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, db, store, service };
}
function fixture(size = 4096, extra = 0) {
  const data = Buffer.alloc(size, 61);
  const files = new Map<string, Uint8Array>([['frames/c.png', data], ['frames/a.png', data],
    ['frames/b.png', extra ? Buffer.alloc(size + extra, 62) : data]]);
  const input = { contractVersion: '1.0.0', packageKey: 'synthetic:budget-package', version: 1,
    sourceLabel: 'Synthetic exact owner budget', sourceAcquiredAt: null,
    files: [...files].map(([path, bytes]) => ({ path, sha256: sha(bytes), byteSize: bytes.byteLength,
      mediaType: 'image/png', evidenceFamily: 'synthetic-budget', representationRole: 'derived',
      independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic fixture' })) };
  return { input, files };
}
async function actualManifestSize(t: TestContext, data: ReturnType<typeof fixture>) {
  const state = await setup(t);
  const result = await state.service.intakeAutomationAttachment(data.input, data.files, binding);
  return (await state.store.read(result.manifestArtifactSha256)).length;
}
const limit = (code: string) => (error: unknown) => error instanceof SourcePackageReadLimitError && error.code === code;

test('trusted intake counts actual canonical manifest and each logical member at exact total and one-byte overflow', async t => {
  const data = fixture(), manifestSize = await actualManifestSize(t, data);
  const budget = { maxFileBytes: 8192, maxTotalBytes: 3 * 4096 + manifestSize };
  const exact = await setup(t);
  const result = await exact.service.intakeAutomationAttachment(data.input, data.files, binding, budget);
  const stored = await exact.service.readVerified(result.packageId, budget);
  assert.equal((await exact.store.read(result.manifestArtifactSha256)).length + stored.files.reduce((sum, file) => sum + file.bytes.length, 0), budget.maxTotalBytes);
  assert.equal(new Set(stored.files.map(file => file.sha256)).size, 1);
  for (const candidate of [fixture(4096, 1), data]) {
    const state = await setup(t), before = Buffer.from(state.db.serialize());
    const changes = state.db.prepare('SELECT total_changes() n').get();
    const calls: number[] = [], put = state.store.put.bind(state.store);
    state.store.put = async bytes => { calls.push(bytes.byteLength); return put(bytes); };
    await assert.rejects(state.service.intakeAutomationAttachment(candidate.input, candidate.files, binding,
      candidate === data ? { ...budget, maxTotalBytes: budget.maxTotalBytes - 1 } : budget), limit('TOTAL_SIZE_LIMIT'));
    assert.deepEqual(state.db.serialize(), before); assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), changes);
    assert.deepEqual(calls, [...candidate.files].sort(([a], [b]) => a.localeCompare(b)).map(([, bytes]) => bytes.byteLength));
    assert.equal(state.service.findFinalizedSourcePackagesByKey(candidate.input.packageKey).length, 0);
  }
});

test('manifest itself obeys maxFile; early member/logical-duplicate/invalid budget refusals put no CAS bytes', async t => {
  const small = fixture(256), manifestSize = await actualManifestSize(t, small);
  const exact = await setup(t);
  const budget = { maxFileBytes: manifestSize, maxTotalBytes: 3 * 256 + manifestSize };
  const result = await exact.service.intakeAutomationAttachment(small.input, small.files, binding, budget);
  await exact.service.readVerified(result.packageId, budget);
  const state = await setup(t), before = Buffer.from(state.db.serialize());
  let puts = 0; const put = state.store.put.bind(state.store);
  state.store.put = async bytes => { puts++; return put(bytes); };
  await assert.rejects(state.service.intakeAutomationAttachment(small.input, small.files, binding,
    { ...budget, maxFileBytes: manifestSize - 1 }), limit('FILE_SIZE_LIMIT'));
  assert.equal(puts, 3); assert.deepEqual(state.db.serialize(), before);
  const large = fixture(), largeManifestSize = await actualManifestSize(t, large);
  for (const invalid of [
    { maxFileBytes: 4095, maxTotalBytes: 30000 },
    // A CAS digest is shared, but three logical members consume three sizes.
    { maxFileBytes: 4096, maxTotalBytes: 4096 + largeManifestSize },
    { maxFileBytes: -1, maxTotalBytes: 30000 },
    { maxFileBytes: 4096, maxTotalBytes: 4095 },
  ]) {
    const other = await setup(t), snapshot = Buffer.from(other.db.serialize());
    other.store.put = async () => { assert.fail('early budget refusal wrote CAS'); };
    await assert.rejects(other.service.intakeAutomationAttachment(large.input, large.files, binding, invalid));
    assert.deepEqual(other.db.serialize(), snapshot);
  }
});

test('optional budget is fixed across awaited puts and exact cold retry remains read-only', async t => {
  const data = fixture(), manifestSize = await actualManifestSize(t, data);
  const state = await setup(t), budget = { maxFileBytes: 8192, maxTotalBytes: 3 * 4096 + manifestSize - 1 };
  const before = Buffer.from(state.db.serialize()), put = state.store.put.bind(state.store);
  state.store.put = async bytes => { budget.maxTotalBytes = 1000000; return put(bytes); };
  await assert.rejects(state.service.intakeAutomationAttachment(data.input, data.files, binding, budget), limit('TOTAL_SIZE_LIMIT'));
  assert.deepEqual(state.db.serialize(), before);
  const exact = await setup(t), validBudget = { maxFileBytes: 8192, maxTotalBytes: 3 * 4096 + manifestSize };
  const first = await exact.service.intakeAutomationAttachment(data.input, data.files, binding, validBudget);
  exact.db.pragma('query_only = ON'); exact.store.put = async () => { assert.fail('retry wrote CAS'); };
  const cold = new SourcePackageService({ db: exact.db, artifactStore: exact.store, now: () => { assert.fail('retry called clock'); } });
  const snapshot = Buffer.from(exact.db.serialize()), changes = exact.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await cold.intakeAutomationAttachment(data.input, data.files, binding, validBudget), { ...first, deduplicated: true, databaseMutations: 0 });
  await assert.rejects(cold.intakeAutomationAttachment(data.input, data.files, binding,
    { ...validBudget, maxTotalBytes: validBudget.maxTotalBytes - 1 }), limit('TOTAL_SIZE_LIMIT'));
  assert.deepEqual(exact.db.serialize(), snapshot); assert.deepEqual(exact.db.prepare('SELECT total_changes() n').get(), changes);
});

test('budget refusal preserves request-scoped ownership/recovery; exact restoration stages original bytes only', async t => {
  const data = fixture(), state = await setup(t);
  const stage = new RequestScopedArtifactStore(path.join(state.root, 'artifacts'));
  const service = new SourcePackageService({ db: state.db, artifactStore: stage, now });
  const { first, manifestSize } = await stage.withOwnership(async () => {
    const first = await service.intakeAutomationAttachment(data.input, data.files, binding);
    return { first, manifestSize: (await stage.read(first.manifestArtifactSha256)).length };
  });
  const budget = { maxFileBytes: 8192, maxTotalBytes: 3 * 4096 + manifestSize };
  // Ownership exit removes this synthetic committed attachment's unpublished stage.
  const retryStage = new RequestScopedArtifactStore(path.join(state.root, 'artifacts'));
  const retry = new SourcePackageService({ db: state.db, artifactStore: retryStage, now: () => { assert.fail('recovery clock'); } });
  const before = Buffer.from(state.db.serialize()), changes = state.db.prepare('SELECT total_changes() n').get();
  let puts = 0; const put = retryStage.put.bind(retryStage);
  retryStage.put = async bytes => { puts++; return put(bytes); };
  await assert.rejects(retry.intakeAutomationAttachment(data.input, data.files, binding, budget), /No request-scoped artifact operation/);
  await retryStage.withOwnership(async () => {
    await assert.rejects(retry.intakeAutomationAttachment(data.input, data.files, binding,
      { ...budget, maxTotalBytes: budget.maxTotalBytes - 1 }), limit('TOTAL_SIZE_LIMIT'));
    assert.equal(puts, 0);
    assert.deepEqual(await retry.intakeAutomationAttachment(data.input, data.files, binding, budget), { ...first, deduplicated: true, databaseMutations: 0 });
    await retryStage.publishOwned();
  });
  assert.deepEqual((await state.service.readVerified(first.packageId, budget)).files.map(file => file.bytes), [...data.files].sort(([a], [b]) => a.localeCompare(b)).map(([, bytes]) => bytes));
  assert.deepEqual(state.db.serialize(), before); assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), changes);
});

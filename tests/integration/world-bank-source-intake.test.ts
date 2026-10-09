import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../../src/platform/db/index.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { AutomationWorldBankSourceIntake, verifyPreparedWorldBankSource, readConfirmedWorldBankSource, readWorldBankHistory, WORLD_BANK_DISPLAY_PATH, WorldBankSourceRejection } from '../../src/modules/analysis/research-automation/world-bank-intake.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';

const binding = { workspaceId: '00000000-0000-4000-8000-000000000001', runId: '00000000-0000-4000-8000-000000000002',
  startSha256: '1'.repeat(64), scopeSha256: '2'.repeat(64), sourceSetSha256: '3'.repeat(64) };
const now = () => new Date('2026-07-14T00:00:00Z');
class CountingStore extends RequestScopedArtifactStore {
  puts = 0;
  override async put(bytes: Uint8Array) { this.puts++; return super.put(bytes); }
}
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-synthetic-'));
  const db = openDatabase({ databasePath: path.join(root, 'fixture.sqlite'), now }).db;
  const artifacts = new CountingStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const intake = new AutomationWorldBankSourceIntake(artifacts, db, now);
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts,
    now: () => { throw new Error('retained read must not use clock'); } }));
  const input = { contractVersion: 'automation-world-bank-prepare-v1', requestKey: 'fixture', sourceLabel: 'Synthetic retained indicator',
    acquiredAt: now().toISOString(), sourceUrl: worldBankFixture().sourceUrl, metadataUrl: worldBankFixture().metadataUrl };
  return { root, db, artifacts, intake, reader, input };
}
test('real Foundation immutable preparation/exact retry preserves original bytes and cold query-only source replay', async t => {
  const f = await fixture(t), raw = worldBankFixture();
  const prepared = await f.intake.prepare(f.input, raw.observations, raw.metadata, binding);
  assert.equal(prepared.state, 'PREPARED_NOT_ADMITTED'); assert.equal(prepared.exactRetry, false);
  const first = await verifyPreparedWorldBankSource(f.reader, prepared.source, binding);
  assert.deepEqual(first.source.files.find(file => file.path === 'macro/observations.json')!.bytes, raw.observations);
  const before = f.db.prepare('SELECT total_changes() n').get(); const puts = f.artifacts.puts;
  const retry = await new AutomationWorldBankSourceIntake(f.artifacts, f.db, () => { throw new Error('exact retry clock'); })
    .prepare(f.input, raw.observations, raw.metadata, binding);
  assert.deepEqual(retry, { ...prepared, exactRetry: true });
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.artifacts.puts, puts);
  f.db.pragma('query_only=ON');
  assert.deepEqual(await verifyPreparedWorldBankSource(f.reader, prepared.source, binding), first);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.artifacts.puts, puts);
  for (const key of ['workspaceId', 'runId', 'startSha256', 'scopeSha256', 'sourceSetSha256'] as const) {
    const corrupt = { ...binding, [key]: key.endsWith('Id') ? '00000000-0000-4000-8000-000000000099' : '9'.repeat(64) };
    await assert.rejects(verifyPreparedWorldBankSource(f.reader, prepared.source, corrupt), WorldBankSourceRejection);
  }
  await assert.rejects(verifyPreparedWorldBankSource(f.reader, { ...prepared.source, packageContentSha256: '9'.repeat(64) }, binding), WorldBankSourceRejection);
  const file = first.source.files.find(member => member.path === 'macro/observations.json')!;
  const location = path.join(f.root, 'artifacts', 'sha256', file.sha256.slice(0, 2), file.sha256);
  await fs.writeFile(location, Buffer.from('corrupted synthetic bytes'));
  await assert.rejects(verifyPreparedWorldBankSource(f.reader, prepared.source, binding));
  await fs.writeFile(location, raw.observations);
  assert.deepEqual(await verifyPreparedWorldBankSource(f.reader, prepared.source, binding), first);
});
test('invalid endpoint/country/value/metadata/oversize reject before any Foundation write or CAS put', async t => {
  const f = await fixture(t), raw = worldBankFixture();
  const before = f.db.prepare('SELECT total_changes() n').get();
  for (const [input, observations, metadata] of [
    [{ ...f.input, sourceUrl: 'https://example.invalid/unreviewed' }, raw.observations, raw.metadata],
    [f.input, Buffer.from(raw.observations.toString().replace('"VN"', '"US"')), raw.metadata],
    [f.input, worldBankFixture('SP.POP.TOTL', ['1', 'null']).observations, raw.metadata],
    [f.input, raw.observations, Buffer.from('{}')],
    [f.input, Buffer.alloc(8 * 1024 * 1024 + 1), raw.metadata],
  ] as const) await assert.rejects(f.intake.prepare(input, observations, metadata, binding), WorldBankSourceRejection);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.artifacts.puts, 0);
});
test('explicit confirmation retains original revision, cited display/history, exact retry and authenticated query-only read', async t => {
  const f = await fixture(t), raw = worldBankFixture();
  const prepared = await f.intake.prepare(f.input, raw.observations, raw.metadata, binding);
  assert.deepEqual(await readWorldBankHistory(f.reader, binding), { contractVersion: 'automation-world-bank-history-v1', sources: [] });
  await assert.rejects(readConfirmedWorldBankSource(f.reader, prepared.source, binding), WorldBankSourceRejection);
  const confirm = { contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'confirmation', source: prepared.source };
  const view = await f.intake.confirm(confirm, binding, 'synthetic-owner');
  const retained = await readConfirmedWorldBankSource(f.reader, view.confirmationSource, binding);
  assert.deepEqual(retained.view, view);
  assert.match(retained.display.toString(), /Ngân hàng Thế giới \(World Bank Open Data\)/);
  assert.match(retained.display.toString(), /12345678901234567890\.123456789/);
  assert.match(retained.display.toString(), /chưa có số liệu/); assert.match(retained.display.toString(), /chưa có đơn vị trong nguồn/);
  assert.match(retained.display.toString(), /2025, cập nhật 2026-07-13/);
  assert.ok(!retained.display.includes(Buffer.from('synthetic-owner')));
  assert.ok(!retained.display.includes(Buffer.from(view.confirmationSource.packageId)));
  const before = f.db.prepare('SELECT total_changes() n').get(); const puts = f.artifacts.puts;
  assert.deepEqual(await new AutomationWorldBankSourceIntake(f.artifacts, f.db, () => { throw new Error('retry clock'); })
    .confirm(confirm, binding, 'synthetic-owner'), view);
  await assert.rejects(f.intake.confirm(confirm, binding, 'different-owner'), WorldBankSourceRejection);
  await assert.rejects(f.intake.confirm({ ...confirm, source: { ...confirm.source, manifestArtifactSha256: '9'.repeat(64) } }, binding, 'synthetic-owner'), WorldBankSourceRejection);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.artifacts.puts, puts);
  f.db.pragma('query_only=ON');
  assert.deepEqual(await readConfirmedWorldBankSource(f.reader, view.confirmationSource, binding), retained);
  assert.deepEqual((await readWorldBankHistory(f.reader, binding)).sources, [view]);
  const stored = await f.reader.readFinalizedSourcePackage(view.confirmationSource.packageId);
  const display = stored.files.find(member => member.path === WORLD_BANK_DISPLAY_PATH)!;
  const location = path.join(f.root, 'artifacts', 'sha256', display.sha256.slice(0, 2), display.sha256);
  await fs.writeFile(location, Buffer.from('corrupt synthetic retained display'));
  await assert.rejects(readConfirmedWorldBankSource(f.reader, view.confirmationSource, binding));
  await fs.writeFile(location, retained.display);
  assert.deepEqual(await readConfirmedWorldBankSource(f.reader, view.confirmationSource, binding), retained);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.artifacts.puts, puts);
});
test('new revision keeps both original source/display bytes; changed request identity and ordinary package substitution fail closed', async t => {
  const f = await fixture(t), raw = worldBankFixture();
  const first = await f.intake.prepare(f.input, raw.observations, raw.metadata, binding);
  const old = await f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'confirm-first', source: first.source }, binding, 'synthetic-owner');
  const oldRead = await readConfirmedWorldBankSource(f.reader, old.confirmationSource, binding);
  const updated = Buffer.from(raw.observations.toString().replace('12345678901234567890.123456789', '19.25').replace('2026-07-13', '2026-08-13'));
  const before = f.db.prepare('SELECT total_changes() n').get(), puts = f.artifacts.puts;
  await assert.rejects(f.intake.prepare(f.input, updated, raw.metadata, binding), WorldBankSourceRejection);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.artifacts.puts, puts);
  const second = await f.intake.prepare({ ...f.input, requestKey: 'revision-two' }, updated, raw.metadata, binding);
  const newer = await f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'confirm-second', source: second.source }, binding, 'synthetic-owner');
  const history = await readWorldBankHistory(f.reader, binding);
  assert.equal(history.sources.length, 2); assert.ok(history.sources.some(source => source.confirmationSource.packageId === newer.confirmationSource.packageId));
  assert.deepEqual(await readConfirmedWorldBankSource(f.reader, old.confirmationSource, binding), oldRead);
  const original = await f.reader.readFinalizedSourcePackage(first.source.packageId);
  const ordinary = new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now });
  const forged = await ordinary.intake({ contractVersion: '1.0.0', packageKey: 'synthetic:ordinary-forgery', version: 1,
    sourceLabel: original.manifest.sourceLabel, sourceAcquiredAt: original.manifest.sourceAcquiredAt, files: original.manifest.files },
    new Map(original.files.map(file => [file.path, file.bytes])));
  await assert.rejects(verifyPreparedWorldBankSource(f.reader, { packageId: forged.packageId,
    manifestArtifactSha256: forged.manifestArtifactSha256, packageContentSha256: forged.packageContentSha256 }, binding),
    (e: unknown) => e instanceof WorldBankSourceRejection && e.code === 'ORIGIN_MISMATCH');
});

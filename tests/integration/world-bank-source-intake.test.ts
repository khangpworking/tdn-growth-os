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

test('derived file and complete package boundaries use independently measured Foundation bytes before any writes', async t => {
  const f = await fixture(t);
  const limit = 8 * 1024 * 1024, totalLimit = 17 * 1024 * 1024;
  function source(unitLength: number, padding = 0, emptyFootnotes = false) {
    const raw = worldBankFixture('SP.POP.TOTL', Array<string>(1000).fill('1'));
    const observations = JSON.parse(raw.observations.toString()) as [unknown, { unit: string; footnote?: string }[]];
    const metadata = JSON.parse(raw.metadata.toString()) as [unknown, { unit: string; padding: string }[]];
    metadata[1][0]!.unit = 'u'.repeat(unitLength); metadata[1][0]!.padding = 'x'.repeat(padding);
    for (const row of observations[1]) { row.unit = metadata[1][0]!.unit; if (emptyFootnotes) row.footnote = ''; }
    return { ...raw, observations: Buffer.from(JSON.stringify(observations)), metadata: Buffer.from(JSON.stringify(metadata)) };
  }
  async function stored(raw: ReturnType<typeof source>, key: string) {
    const receipt = await f.intake.prepare({ ...f.input, requestKey: key }, raw.observations, raw.metadata, binding);
    const source = await f.reader.readFinalizedSourcePackage(receipt.source.packageId);
    const manifestBytes = await f.artifacts.read(receipt.source.manifestArtifactSha256);
    return { receipt, source, manifestBytes, total: manifestBytes.length + source.files.reduce((sum, file) => sum + file.bytes.length, 0) };
  }
  async function refused(raw: ReturnType<typeof source>, key: string, code: string) {
    const changes = f.db.prepare('SELECT total_changes() n').get(), puts = f.artifacts.puts;
    const before = f.db.prepare('SELECT count(*) n FROM foundation_source_packages').get();
    await assert.rejects(f.intake.prepare({ ...f.input, requestKey: key }, raw.observations, raw.metadata, binding),
      (error: unknown) => error instanceof WorldBankSourceRejection && error.code === code);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.artifacts.puts, puts);
    assert.deepEqual(f.db.prepare('SELECT count(*) n FROM foundation_source_packages').get(), before);
  }
  // Observe the real retained descriptor rather than calculating the guard's envelope.
  const baseFile = source(2500, 0, true);
  const fileWitness = await stored(baseFile, 'file-size-witness-0');
  const witnessSize = fileWitness.source.files.find(file => file.path === 'normalized/world-bank-source.json')!.bytes.length;
  const observations = JSON.parse(baseFile.observations.toString()) as [unknown, { footnote: string }[]];
  let extra = limit - witnessSize;
  for (const row of observations[1]) { const take = Math.min(10000, extra); row.footnote = 'x'.repeat(take); extra -= take; }
  assert.equal(extra, 0);
  const exactFile = { ...baseFile, observations: Buffer.from(JSON.stringify(observations)) };
  assert.equal('file-size-witness-0'.length, 'file-size-exact-fit'.length);
  const fitFile = await stored(exactFile, 'file-size-exact-fit');
  assert.equal(fitFile.source.files.find(file => file.path === 'normalized/world-bank-source.json')!.bytes.length, limit);
  const last = observations[1].find(row => row.footnote.length < 10000)!; last.footnote += 'x';
  await refused({ ...exactFile, observations: Buffer.from(JSON.stringify(observations)) }, 'file-size-overflow0', 'OUTPUT_FILE_SIZE_LIMIT');
  // Padding is inert original metadata, not a reserve used by implementation.
  // Real manifest bytes measure all UUID/digest/timestamp/file metadata overhead.
  const baseTotal = source(2500, 7000000);
  const totalWitness = await stored(baseTotal, 'aggregate-witness-0');
  const exactTotal = source(2500, 7000000 + totalLimit - totalWitness.total);
  assert.equal('aggregate-witness-0'.length, 'aggregate-exact-fit'.length);
  const fitTotal = await stored(exactTotal, 'aggregate-exact-fit');
  assert.equal(fitTotal.total, totalLimit);
  assert.ok(fitTotal.source.files.every(file => file.bytes.length <= limit));
  assert.equal(fitTotal.manifestBytes.length, totalWitness.manifestBytes.length);
  await refused(source(2500, 7000000 + totalLimit - totalWitness.total + 1), 'aggregate-overflow0', 'OUTPUT_TOTAL_SIZE_LIMIT');
  // The exact input-file boundary also stays supported, without raising a cap.
  const small = worldBankFixture();
  const metadata = JSON.parse(small.metadata.toString()) as [unknown, { padding: string }[]];
  metadata[1][0]!.padding = '';
  metadata[1][0]!.padding = 'x'.repeat(limit - Buffer.byteLength(JSON.stringify(metadata)));
  const exactInput = { ...small, metadata: Buffer.from(JSON.stringify(metadata)) };
  assert.equal(exactInput.metadata.length, limit);
  const inputFit = await stored(exactInput, 'input-size-exact-0');
  assert.equal(inputFit.source.files.find(file => file.path === 'macro/metadata.json')!.bytes.length, limit);
  metadata[1][0]!.padding += 'x';
  await refused({ ...exactInput, metadata: Buffer.from(JSON.stringify(metadata)) }, 'input-size-overflow', 'FILE_SIZE_LIMIT');
  // Independently observe real cited HTML, then preserve every source row and
  // grow literal escaped footnotes to its exact file boundary (no truncation).
  const baseDisplay = source(500, 0, true);
  const displayWitness = await stored(baseDisplay, 'display-witness-00');
  const witnessView = await f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1',
    requestKey: 'display-witness-00', source: displayWitness.receipt.source }, binding, 'synthetic-owner');
  const witnessDisplay = (await readConfirmedWorldBankSource(f.reader, witnessView.confirmationSource, binding)).display;
  const displayRows = JSON.parse(baseDisplay.observations.toString()) as [unknown, { footnote: string }[]];
  const displayExtra = limit - witnessDisplay.length;
  let ampersands = Math.floor(displayExtra / 5);
  for (const row of displayRows[1]) { const take = Math.min(10000, ampersands); row.footnote = '&'.repeat(take); ampersands -= take; }
  assert.equal(ampersands, 0);
  displayRows[1].find(row => row.footnote.length < 9996)!.footnote += 'x'.repeat(displayExtra % 5);
  const displayFit = await stored({ ...baseDisplay, observations: Buffer.from(JSON.stringify(displayRows)) }, 'display-exact-fit0');
  const displayFitView = await f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1',
    requestKey: 'display-exact-fit0', source: displayFit.receipt.source }, binding, 'synthetic-owner');
  assert.equal((await readConfirmedWorldBankSource(f.reader, displayFitView.confirmationSource, binding)).display.length, limit);
  displayRows[1].find(row => row.footnote.length < 10000)!.footnote += 'x';
  const displayOver = await stored({ ...baseDisplay, observations: Buffer.from(JSON.stringify(displayRows)) }, 'display-overflow00');
  const beforeDisplayReject = f.db.prepare('SELECT total_changes() n').get(), displayPuts = f.artifacts.puts;
  await assert.rejects(f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1',
    requestKey: 'display-overflow00', source: displayOver.receipt.source }, binding, 'synthetic-owner'),
  (error: unknown) => error instanceof WorldBankSourceRejection && error.code === 'OUTPUT_FILE_SIZE_LIMIT');
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeDisplayReject); assert.equal(f.artifacts.puts, displayPuts);
  // Accepted exact boundaries authenticate on cold reads, with no clock/write.
  f.db.pragma('query_only=ON');
  for (const item of [fitFile, fitTotal, inputFit]) await verifyPreparedWorldBankSource(f.reader, item.receipt.source, binding);
  assert.equal((await readConfirmedWorldBankSource(f.reader, displayFitView.confirmationSource, binding)).display.length, limit);
});

test('original oversized preparation and display leave the owning Foundation connection and healthy source unchanged', async t => {
  const f = await fixture(t), healthyRaw = worldBankFixture();
  const prepared = await f.intake.prepare(f.input, healthyRaw.observations, healthyRaw.metadata, binding);
  const view = await f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'healthy', source: prepared.source }, binding, 'synthetic-owner');
  const healthy = await readConfirmedWorldBankSource(f.reader, view.confirmationSource, binding);
  const snapshot = () => (f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
    .map(({ name }) => [name, f.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]);
  function large(unitLength: number) {
    const raw = worldBankFixture('SP.POP.TOTL', Array<string>(1000).fill('1'));
    const observations = JSON.parse(raw.observations.toString()) as [unknown, { unit: string }[]];
    const metadata = JSON.parse(raw.metadata.toString()) as [unknown, { unit: string }[]];
    metadata[1][0]!.unit = '&'.repeat(unitLength);
    for (const row of observations[1]) row.unit = metadata[1][0]!.unit;
    return { ...raw, observations: Buffer.from(JSON.stringify(observations)), metadata: Buffer.from(JSON.stringify(metadata)) };
  }
  let tables = snapshot(), changes = f.db.prepare('SELECT total_changes() n').get(), puts = f.artifacts.puts;
  const descriptor = large(4000);
  assert.equal(descriptor.observations.length, 4203132); assert.equal(descriptor.metadata.length, 4290);
  for (let retry = 0; retry < 2; retry++) {
    await assert.rejects(f.intake.prepare({ ...f.input, requestKey: 'prepare-descriptor' }, descriptor.observations, descriptor.metadata, binding),
      (error: unknown) => error instanceof WorldBankSourceRejection && error.code === 'OUTPUT_FILE_SIZE_LIMIT');
    assert.deepEqual(snapshot(), tables); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.artifacts.puts, puts);
  }
  const display = large(2000);
  assert.equal(display.observations.length, 2203132); assert.equal(display.metadata.length, 2290);
  const displayPrepared = await f.intake.prepare({ ...f.input, requestKey: 'confirm-display' }, display.observations, display.metadata, binding);
  tables = snapshot(); changes = f.db.prepare('SELECT total_changes() n').get(); puts = f.artifacts.puts;
  for (let retry = 0; retry < 2; retry++) {
    await assert.rejects(f.intake.confirm({ contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'confirm-display', source: displayPrepared.source }, binding, 'synthetic-owner'),
      (error: unknown) => error instanceof WorldBankSourceRejection && error.code === 'OUTPUT_FILE_SIZE_LIMIT');
    assert.deepEqual(snapshot(), tables); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.artifacts.puts, puts);
  }
  f.db.pragma('query_only=ON');
  assert.deepEqual(await readConfirmedWorldBankSource(f.reader, view.confirmationSource, binding), healthy);
  assert.deepEqual((await readWorldBankHistory(f.reader, binding)).sources, [view]);
  assert.deepEqual(snapshot(), tables); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.artifacts.puts, puts);
});

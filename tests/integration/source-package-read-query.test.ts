import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import BetterSqlite3 from 'better-sqlite3';
import type { SourcePackageIntakeRequest } from '../../contracts/foundation/source-package-intake-request.generated.js';
import { ContentAddressedArtifactStore, type ArtifactReadOptions } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';

const hash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date('2026-10-02T00:00:00.000Z');
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-source-read-query-'));
  const databasePath = path.join(root, 'test.sqlite');
  const db = openDatabase({ databasePath, now }).db;
  const writer = new BetterSqlite3(databasePath); writer.defaultSafeIntegers(true);
  const artifactRoot = path.join(root, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  t.after(async () => { writer.close(); db.close(); await fs.rm(root, { recursive: true, force: true }); });
  async function retain(key: string, profile: string) {
    const members = new Map([
      ['source/text.txt', Buffer.from('Literal synthetic evidence; approval remains pending.\n')],
      ['display/source.html', Buffer.from('<blockquote>Literal synthetic evidence.</blockquote>\n')],
      ['profiles/source.json', Buffer.from(profile)],
    ]);
    const fileMetadata: SourcePackageIntakeRequest['files'][number][] = [...members].map(([logicalPath, bytes]) => ({
      path: logicalPath, sha256: hash(bytes), byteSize: bytes.length,
      mediaType: logicalPath.endsWith('.html') ? 'text/html' : logicalPath.endsWith('.json') ? 'application/json' : 'text/plain',
      evidenceFamily: 'synthetic', representationRole: 'primary', independence: 'non_independent',
      providerProvenance: 'synthetic', provenanceBasis: 'Generated isolated fixture',
    }));
    return packages.intake({ contractVersion: '1.0.0', packageKey: key, version: 1, sourceAcquiredAt: null,
      sourceLabel: 'Synthetic source read authentication', files: [fileMetadata[0]!, ...fileMetadata.slice(1)] }, members);
  }
  async function snapshot() {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
      .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]);
    const cas: [string, string][] = [];
    for (const name of await fs.readdir(artifactRoot, { recursive: true })) {
      const filename = path.join(artifactRoot, name);
      if ((await fs.stat(filename)).isFile()) cas.push([name, hash(await fs.readFile(filename))]);
    }
    return { tables: JSON.stringify(tables, (_key, value: unknown) => typeof value === 'bigint' ? String(value) : value),
      tableCount: tables.length, changes: db.prepare('SELECT total_changes() n').get(), cas: cas.sort() };
  }
  return { db, writer, artifacts, packages, retain, snapshot };
}

test('current source/profile bytes and every manifest/member reauthenticate on warm query-only reads', async t => {
  const f = await fixture(t);
  const first = await f.retain('query-read:first', '{"profile":"original","approval":false}');
  const second = await f.retain('query-read:second', '{"profile":"changed","approval":false}');
  const a = await f.packages.readVerified(first.packageId), b = await f.packages.readVerified(second.packageId);
  assert.notDeepEqual(a.files.find(file => file.path === 'profiles/source.json')!.bytes, b.files.find(file => file.path === 'profiles/source.json')!.bytes);
  const forbidden = () => { throw new Error('Immutable reads cannot write or call the clock'); };
  t.mock.method(f.artifacts, 'put', forbidden);
  const reader = new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now: forbidden });
  f.db.pragma('query_only=ON'); const before = await f.snapshot();
  assert.equal(before.tableCount, 102);
  for (const expected of [a, b, a]) assert.deepEqual(await reader.readVerified(expected.packageId), expected);
  for (const digest of new Set([first.manifestArtifactSha256, ...a.files.map(file => file.sha256)])) {
    const filename = f.artifacts.pathForDigest(digest), bytes = await fs.readFile(filename);
    await fs.writeFile(filename, 'Synthetic out-of-band corruption');
    try { await assert.rejects(reader.readVerified(first.packageId), /Artifact digest mismatch/); }
    finally { await fs.writeFile(filename, bytes); }
    assert.deepEqual(await reader.readVerified(first.packageId), a);
  }
  assert.deepEqual(await f.snapshot(), before);
});

test('after an awaited manifest read, member metadata is queried again from the independent connection', async t => {
  for (const column of ['media_type', 'relative_path', 'contract_version', 'byte_size'] as const) await t.test(column, async child => {
    const f = await fixture(child), receipt = await f.retain('query-read:midawait', '{"profile":"original"}');
    const original = await f.packages.readVerified(receipt.packageId);
    const member = original.files.find(file => file.path === 'source/text.txt')!;
    const saved = f.writer.prepare(`SELECT ${column} value FROM artifact_manifests WHERE sha256=?`).get(member.sha256) as { value: string | bigint };
    const corrupt = column === 'byte_size' ? BigInt(saved.value) + 1n : column === 'media_type' ? 'application/octet-stream' : column === 'relative_path' ? 'foreign/path' : '2.0.0';
    const update = f.writer.prepare(`UPDATE artifact_manifests SET ${column}=? WHERE sha256=?`);
    const read = f.artifacts.read.bind(f.artifacts); let injected = false;
    child.mock.method(f.artifacts, 'put', () => { throw new Error('No immutable put'); });
    child.mock.method(f.artifacts, 'read', async (digest: string, options?: ArtifactReadOptions) => {
      const bytes = await read(digest, options);
      if (!injected && digest === receipt.manifestArtifactSha256) { injected = true; update.run(corrupt, member.sha256); }
      return bytes;
    });
    const reader = new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now: () => { throw new Error('No immutable clock'); } });
    f.db.pragma('query_only=ON'); const before = await f.snapshot();
    try {
      await assert.rejects(reader.readVerified(receipt.packageId), column === 'byte_size' ? /Artifact size mismatch/ : /Artifact manifest mismatch/);
      assert.equal(injected, true, 'the independent mutation must occur after the actual awaited manifest read');
      const corruptBefore = await f.snapshot(); await assert.rejects(reader.readVerified(receipt.packageId), /Artifact (size|manifest) mismatch/);
      assert.deepEqual(await f.snapshot(), corruptBefore); assert.deepEqual(corruptBefore.changes, before.changes); assert.deepEqual(corruptBefore.cas, before.cas);
    } finally { update.run(saved.value, member.sha256); }
    assert.deepEqual(await reader.readVerified(receipt.packageId), original); assert.deepEqual(await f.snapshot(), before);
  });
});

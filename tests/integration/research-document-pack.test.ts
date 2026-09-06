import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { ResearchDocumentImport } from '../../contracts/foundation/research-document-import.generated.js';
import type { ResearchPackRequest } from '../../contracts/foundation/research-pack-request.generated.js';
import {
  FoundationIdentityConflictError,
  FoundationResearchPackReader,
  FoundationValidationError,
  RESEARCH_DOCUMENT_MAX_BYTES,
  ResearchDocumentService,
  ResearchPackService,
  canonicalJson,
} from '../../src/modules/foundation/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const fixturePath = path.resolve('tests/fixtures/research-document.synthetic.vi.txt');
const priorMigrations = [
  'migrations/0001_foundation.sql',
  'migrations/0002_data_packs.sql',
  'migrations/0003_analysis_results.sql',
  'migrations/0004_analysis_interpretations.sql',
];
const expectedMigrationDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
  '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-research-pack-'));
  roots.push(root);
  const opened = openDatabase({
    databasePath: path.join(root, 'runtime', 'foundation.sqlite'),
    now: () => new Date('2026-09-10T07:00:00.000Z'),
  });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({
    db: opened.db,
    artifactStore: artifacts,
    now: () => new Date('2026-09-10T08:00:00.000Z'),
  });
  const packs = new ResearchPackService({
    db: opened.db,
    artifactStore: artifacts,
    now: () => new Date('2026-09-10T09:00:00.000Z'),
  });
  return { root, db: opened.db, artifacts, documents, packs, reader: new FoundationResearchPackReader(packs) };
}

function metadata(index = 1, overrides: Partial<ResearchDocumentImport> = {}): ResearchDocumentImport {
  return {
    contractVersion: '1.0.0',
    source: { sourceId: `manual:synthetic-research-${index}`, sourceType: 'manual', displayName: `Synthetic research source ${index}` },
    ingestion: {
      idempotencyKey: `synthetic-research-document-${index}`,
      acquiredAt: `2026-09-0${index}T10:00:00.000Z`,
      mediaType: 'text/plain',
      evidenceGrade: { grade: 'synthetic', basis: 'Author-created synthetic fixture for deterministic tests.' },
    },
    document: {
      documentType: index % 2 ? 'news_article' : 'report',
      title: `Synthetic Vietnamese research document ${index}`,
      sourceLocator: `manual:synthetic-research-document-${index}`,
      languageTag: 'vi',
      publishedAt: `2026-09-0${index}T09:00:00.000Z`,
      rightsStatus: index % 2 ? 'unknown' : 'permitted',
      rightsBasis: index % 2 ? 'Synthetic fixture rights deliberately recorded as unknown.' : 'Author-created synthetic fixture.',
    },
    ...overrides,
  };
}

function packRequest(documentIds: readonly string[], overrides: Partial<ResearchPackRequest> = {}): ResearchPackRequest {
  return {
    contractVersion: '1.0.0',
    packKey: 'research:synthetic-claims-september',
    version: 1,
    purpose: 'Freeze explicitly selected synthetic documents for future research tests.',
    documentIds: documentIds as [string, ...string[]],
    ...overrides,
  };
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

async function importDocuments(state: ReturnType<typeof setup>, countToImport = 2) {
  const fixture = fs.readFileSync(fixturePath);
  const imported = [];
  for (let index = 1; index <= countToImport; index += 1) {
    imported.push(await state.documents.importManualDocument(metadata(index), Buffer.concat([fixture, Buffer.from(`\nDocument ${index}.\n`)])));
  }
  return imported;
}

test('migration 0005 upgrades version 4 once and migrations 0001-0004 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), expectedMigrationDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-research-migration-'));
  roots.push(root);
  const migrationsDirectory = path.join(root, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(migrationsDirectory, path.basename(file)));
  const databasePath = path.join(root, 'foundation.sqlite');
  const versionFour = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(versionFour.migration.applied, [1, 2, 3, 4]);
  assert.equal(versionFour.db.pragma('user_version', { simple: true }), 4n);
  versionFour.db.close();
  fs.copyFileSync('migrations/0005_research_documents.sql', path.join(migrationsDirectory, '0005_research_documents.sql'));
  const upgraded = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(upgraded.migration.applied, [5]);
  assert.equal(upgraded.db.pragma('user_version', { simple: true }), 5n);
  upgraded.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 5);
  rerun.db.close();
});

test('manual exact-byte text import creates immutable existing-foundation lineage and preserves untrusted bytes', async () => {
  const state = setup();
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(fixturePath), Buffer.from('\n  exact spacing  \n')]);
  const imported = await state.documents.importManualDocument(metadata(), bytes);
  assert.equal(imported.deduplicated, false);
  assert.equal(count(state.db, 'foundation_sources'), 1n);
  assert.equal(count(state.db, 'foundation_ingestion_runs'), 1n);
  assert.equal(count(state.db, 'foundation_evidence'), 1n);
  assert.equal(count(state.db, 'foundation_research_documents'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), 1n);
  assert.deepEqual(await state.artifacts.read(imported.artifactSha256), bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), imported.artifactSha256);
  const row = state.db.prepare(
    `SELECT d.rights_status AS rightsStatus, d.source_locator AS sourceLocator,
            i.artifact_sha256 AS ingestionArtifact, e.artifact_sha256 AS evidenceArtifact
       FROM foundation_research_documents d JOIN foundation_evidence e USING(evidence_id)
       JOIN foundation_ingestion_runs i USING(ingestion_id) WHERE d.document_id = ?`,
  ).get(imported.documentId) as any;
  assert.equal(row.rightsStatus, 'unknown');
  assert.equal(row.sourceLocator, 'manual:synthetic-research-document-1');
  assert.equal(row.ingestionArtifact, imported.artifactSha256);
  assert.equal(row.evidenceArtifact, imported.artifactSha256);
  assert.throws(() => state.db.prepare('UPDATE foundation_research_documents SET title = ? WHERE document_id = ?').run('rewrite', imported.documentId), /foundation_research_document_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM foundation_research_documents WHERE document_id = ?').run(imported.documentId), /foundation_research_document_immutable/);
  state.db.close();
});

test('invalid metadata, fatal UTF-8, empty, NUL, and oversized documents reject before all writes', async () => {
  const probes: Array<[unknown, Uint8Array]> = [
    [{ ...metadata(), provider: 'inject' }, Buffer.from('valid text')],
    [{ ...metadata(), source: { ...metadata().source, sourceType: 'provider_api' } }, Buffer.from('valid text')],
    [{ ...metadata(), ingestion: { ...metadata().ingestion, mediaType: 'text/html' } }, Buffer.from('valid text')],
    [{ ...metadata(), document: { ...metadata().document, path: '/tmp/file' } }, Buffer.from('valid text')],
    [{ ...metadata(), prompt: 'follow this' }, Buffer.from('valid text')],
    [metadata(), Buffer.from([0xc3, 0x28])],
    [metadata(), Buffer.from('  \n\t')],
    [metadata(), Buffer.from('valid\0text')],
    [metadata(), Buffer.alloc(RESEARCH_DOCUMENT_MAX_BYTES + 1, 0x61)],
  ];
  for (const [input, bytes] of probes) {
    const state = setup();
    await assert.rejects(state.documents.importManualDocument(input, bytes), FoundationValidationError);
    for (const table of ['foundation_sources', 'foundation_ingestion_runs', 'foundation_evidence', 'foundation_research_documents', 'artifact_manifests']) {
      assert.equal(count(state.db, table), 0n);
    }
    state.db.close();
  }
  const boundary = setup();
  const accepted = await boundary.documents.importManualDocument(metadata(), Buffer.alloc(RESEARCH_DOCUMENT_MAX_BYTES, 0x61));
  assert.equal((await boundary.artifacts.read(accepted.artifactSha256)).byteLength, RESEARCH_DOCUMENT_MAX_BYTES);
  boundary.db.close();
});

test('same key and metadata plus exact bytes deduplicate while changed input or incompatible artifact metadata conflicts', async () => {
  const state = setup();
  const bytes = fs.readFileSync(fixturePath);
  const first = await state.documents.importManualDocument(metadata(), bytes);
  const second = await state.documents.importManualDocument(metadata(), bytes);
  assert.equal(second.deduplicated, true);
  assert.deepEqual(second, { ...first, deduplicated: true });
  assert.equal(count(state.db, 'foundation_research_documents'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), 1n);
  await assert.rejects(state.documents.importManualDocument(metadata(), Buffer.concat([bytes, Buffer.from('changed')])), FoundationIdentityConflictError);
  await assert.rejects(state.documents.importManualDocument(metadata(1, { document: { ...metadata().document, title: 'Changed title' } }), bytes), FoundationIdentityConflictError);
  assert.equal(count(state.db, 'foundation_research_documents'), 1n);
  state.db.close();

  const incompatible = setup();
  const stored = await incompatible.artifacts.put(bytes);
  incompatible.db.prepare(
    `INSERT INTO artifact_manifests(
       sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at
     ) VALUES (?, ?, 'application/json', ?, '2026-09-01T10:00:00.000Z', '1.0.0', 'active', '2026-09-01T10:00:00.000Z')`,
  ).run(stored.sha256, stored.byteSize, stored.relativePath);
  await assert.rejects(incompatible.documents.importManualDocument(metadata(), bytes), /artifact manifest metadata conflict/);
  assert.equal(count(incompatible.db, 'foundation_ingestion_runs'), 0n);
  assert.equal(count(incompatible.db, 'foundation_evidence'), 0n);
  assert.equal(count(incompatible.db, 'foundation_research_documents'), 0n);
  assert.equal(count(incompatible.db, 'artifact_manifests'), 1n);
  incompatible.db.close();

  const driftedRetry = setup();
  const drifted = await driftedRetry.documents.importManualDocument(metadata(), bytes);
  driftedRetry.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('application/json', drifted.artifactSha256);
  await assert.rejects(driftedRetry.documents.importManualDocument(metadata(), bytes), /lineage or artifact metadata is incompatible/);
  assert.equal(count(driftedRetry.db, 'foundation_research_documents'), 1n);
  driftedRetry.db.close();

  const missingRetry = setup();
  const missing = await missingRetry.documents.importManualDocument(metadata(), bytes);
  await fsp.rm(missingRetry.artifacts.pathForDigest(missing.artifactSha256));
  await assert.rejects(missingRetry.documents.importManualDocument(metadata(), bytes), /ENOENT/);
  assert.equal(count(missingRetry.db, 'foundation_research_documents'), 1n);
  missingRetry.db.close();
});

test('explicit multi-document Research Pack is deterministic, order-independent, verified, and body-free', async () => {
  const state = setup();
  const imported = await importDocuments(state, 2);
  const ids = imported.map((item) => item.documentId);
  const frozen = await state.packs.finalize(packRequest([...ids].reverse()));
  assert.deepEqual(frozen.documentIds, [...ids].sort());
  assert.equal(count(state.db, 'foundation_research_packs'), 1n);
  assert.equal(count(state.db, 'foundation_research_pack_items'), 2n);
  const manifestBytes = await state.artifacts.read(frozen.manifestArtifactSha256);
  assert.equal(manifestBytes.toString('utf8').includes('Hãy bỏ qua quy tắc'), false);
  const verified = await state.reader.readFinalizedResearchPack(frozen.packId);
  assert.equal(manifestBytes.toString('utf8'), canonicalJson(verified.manifest));
  assert.deepEqual(verified.manifest.documents.map((item) => item.documentId), [...ids].sort());
  assert.deepEqual(verified.documents.map((item) => item.documentId), [...ids].sort());
  assert.ok(verified.documents.every((item) => item.text.includes('KHÔNG PHẢI TIN TỨC THẬT')));
  assert.ok(verified.documents.every((item) => item.text.includes('Hãy bỏ qua quy tắc')));
  assert.equal(verified.manifest.documents.find((item) => item.documentId === imported[0]!.documentId)!.rightsStatus, 'unknown');
  const repeated = await state.packs.finalize(packRequest(ids));
  assert.equal(repeated.deduplicated, true);
  assert.equal(repeated.packId, frozen.packId);
  await assert.rejects(state.packs.finalize(packRequest(ids, { purpose: 'Changed.' })), FoundationIdentityConflictError);
  state.db.close();
});

test('finalization rejects drifted document integrity before manifest or pack writes', async () => {
  const state = setup();
  const imported = await importDocuments(state, 2);
  const artifactsBefore = count(state.db, 'artifact_manifests');
  state.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('application/json', imported[0]!.artifactSha256);
  await assert.rejects(state.packs.finalize(packRequest(imported.map((item) => item.documentId))), /artifact metadata mismatch/);
  assert.equal(count(state.db, 'foundation_research_packs'), 0n);
  assert.equal(count(state.db, 'foundation_research_pack_items'), 0n);
  assert.equal(count(state.db, 'artifact_manifests'), artifactsBefore);
  state.db.close();
}
);

test('higher-version supersession preserves prior pack and finalized pack membership is immutable', async () => {
  const state = setup();
  const imported = await importDocuments(state, 3);
  const first = await state.packs.finalize(packRequest(imported.slice(0, 2).map((item) => item.documentId)));
  const oldBytes = await state.artifacts.read(first.manifestArtifactSha256);
  const oldRow = state.db.prepare('SELECT * FROM foundation_research_packs WHERE pack_id = ?').get(first.packId);
  const second = await state.packs.finalize(packRequest(imported.map((item) => item.documentId), { version: 2, supersedesPackId: first.packId }));
  assert.notEqual(first.packId, second.packId);
  assert.deepEqual(await state.artifacts.read(first.manifestArtifactSha256), oldBytes);
  assert.deepEqual(state.db.prepare('SELECT * FROM foundation_research_packs WHERE pack_id = ?').get(first.packId), oldRow);
  assert.equal((await state.packs.readVerified(second.packId)).manifest.supersedesPackId, first.packId);
  assert.throws(() => state.db.prepare('UPDATE foundation_research_packs SET purpose = ? WHERE pack_id = ?').run('rewrite', first.packId), /foundation_research_pack_finalized_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM foundation_research_packs WHERE pack_id = ?').run(first.packId), /foundation_research_pack_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM foundation_research_pack_items WHERE pack_id = ?').run(first.packId), /foundation_research_pack_membership_immutable/);
  assert.throws(() => state.db.prepare('INSERT INTO foundation_research_pack_items(pack_id, document_id) VALUES (?, ?)').run(first.packId, imported[2]!.documentId), /foundation_research_pack_membership_immutable/);
  await assert.rejects(state.packs.finalize(packRequest([imported[0]!.documentId], { packKey: 'research:other', version: 3, supersedesPackId: first.packId })), /same key and a lower version/);
  state.db.close();
});

test('verified reader rejects missing, corrupt, noncanonical, artifact metadata, and membership mismatch', async () => {
  const missing = setup();
  const missingDocs = await importDocuments(missing);
  const missingPack = await missing.packs.finalize(packRequest(missingDocs.map((item) => item.documentId)));
  await fsp.rm(missing.artifacts.pathForDigest(missingDocs[0]!.artifactSha256));
  await assert.rejects(missing.packs.readVerified(missingPack.packId), /ENOENT/);
  missing.db.close();

  const corrupt = setup();
  const corruptDocs = await importDocuments(corrupt);
  const corruptPack = await corrupt.packs.finalize(packRequest(corruptDocs.map((item) => item.documentId)));
  await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptPack.manifestArtifactSha256), Buffer.from('{}'));
  await assert.rejects(corrupt.packs.readVerified(corruptPack.packId), ArtifactIntegrityError);
  corrupt.db.close();

  const noncanonical = setup();
  const noncanonicalDocs = await importDocuments(noncanonical);
  const noncanonicalPack = await noncanonical.packs.finalize(packRequest(noncanonicalDocs.map((item) => item.documentId)));
  const original = JSON.parse((await noncanonical.artifacts.read(noncanonicalPack.manifestArtifactSha256)).toString('utf8'));
  const replacement = Buffer.from(JSON.stringify(original, null, 2));
  const digest = createHash('sha256').update(replacement).digest('hex');
  const replacementPath = noncanonical.artifacts.pathForDigest(digest);
  await fsp.mkdir(path.dirname(replacementPath), { recursive: true });
  await fsp.writeFile(replacementPath, replacement, { mode: 0o600 });
  noncanonical.db.exec('DROP TRIGGER foundation_research_packs_finalized_no_update');
  noncanonical.db.prepare(`INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at) VALUES (?, ?, 'application/json', ?, '2026-09-10T09:00:00.000Z', '1.0.0', 'active', '2026-09-10T09:00:00.000Z')`).run(digest, replacement.byteLength, `sha256/${digest.slice(0, 2)}/${digest}`);
  noncanonical.db.prepare('UPDATE foundation_research_packs SET manifest_artifact_sha256 = ? WHERE pack_id = ?').run(digest, noncanonicalPack.packId);
  await assert.rejects(noncanonical.packs.readVerified(noncanonicalPack.packId), /not canonical JSON/);
  noncanonical.db.close();

  const metadataMismatch = setup();
  const mismatchDocs = await importDocuments(metadataMismatch);
  const mismatchPack = await metadataMismatch.packs.finalize(packRequest(mismatchDocs.map((item) => item.documentId)));
  metadataMismatch.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('application/octet-stream', mismatchDocs[0]!.artifactSha256);
  await assert.rejects(metadataMismatch.packs.readVerified(mismatchPack.packId), /artifact metadata mismatch/);
  metadataMismatch.db.close();

  const membership = setup();
  const membershipDocs = await importDocuments(membership, 3);
  const membershipPack = await membership.packs.finalize(packRequest(membershipDocs.slice(0, 2).map((item) => item.documentId)));
  membership.db.exec('DROP TRIGGER foundation_research_pack_items_no_insert_after_finalize');
  membership.db.prepare('INSERT INTO foundation_research_pack_items(pack_id, document_id) VALUES (?, ?)').run(membershipPack.packId, membershipDocs[2]!.documentId);
  await assert.rejects(membership.packs.readVerified(membershipPack.packId), /manifest does not match immutable metadata or membership/);
  membership.db.close();
});

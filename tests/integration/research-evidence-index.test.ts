import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { FinalizedResearchPackReader, VerifiedFinalizedResearchPack } from '../../src/modules/foundation/index.js';
import {
  AnalysisIdentityConflictError,
  AnalysisResearchEvidenceIndexResultReader,
  AnalysisValidationError,
  ResearchEvidenceIndexService,
  segmentResearchDocument,
} from '../../src/modules/analysis/index.js';
import {
  FoundationResearchPackReader,
  ResearchDocumentService,
  ResearchPackService,
  canonicalJson,
} from '../../src/modules/foundation/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
const priorMigrations = [
  'migrations/0001_foundation.sql',
  'migrations/0002_data_packs.sql',
  'migrations/0003_analysis_results.sql',
  'migrations/0004_analysis_interpretations.sql',
  'migrations/0005_research_documents.sql',
];
const expectedPriorMigrationDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
  '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
  'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592',
];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-evidence-index-'));
  roots.push(root);
  const opened = openDatabase({ databasePath: path.join(root, 'runtime', 'foundation.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({ db: opened.db, artifactStore: artifacts, now: () => new Date('2026-09-11T08:00:00.000Z') });
  const packs = new ResearchPackService({ db: opened.db, artifactStore: artifacts, now: () => new Date('2026-09-11T09:00:00.000Z') });
  return { root, db: opened.db, artifacts, documents, packs };
}

async function importDocument(state: ReturnType<typeof setup>, index: number, bytes: Buffer) {
  return state.documents.importManualDocument({
    contractVersion: '1.0.0',
    source: { sourceId: `manual:evidence-index-${index}`, sourceType: 'manual', displayName: `Synthetic evidence source ${index}` },
    ingestion: {
      idempotencyKey: `evidence-index-${index}`, acquiredAt: '2026-09-11T07:00:00.000Z', mediaType: 'text/plain',
      evidenceGrade: { grade: 'synthetic', basis: 'Author-created deterministic evidence-index fixture.' },
    },
    document: {
      documentType: index % 2 ? 'news_article' : 'report', title: `Synthetic evidence document ${index}`,
      sourceLocator: `manual:evidence-index-${index}`, languageTag: 'vi', rightsStatus: 'permitted',
      rightsBasis: 'Author-created synthetic fixture.',
    },
  }, bytes);
}

async function createPack(state: ReturnType<typeof setup>, documentIds: readonly string[]) {
  return state.packs.finalize({
    contractVersion: '1.0.0', packKey: `research:evidence-index-${randomUUID()}`, version: 1,
    purpose: 'Synthetic deterministic evidence index input.', documentIds,
  });
}

function analysis(state: ReturnType<typeof setup>, reader: FinalizedResearchPackReader = new FoundationResearchPackReader(state.packs)) {
  return new ResearchEvidenceIndexService({
    db: state.db, artifactStore: state.artifacts, researchPackReader: reader,
    now: () => new Date('2026-09-11T10:00:00.000Z'),
  });
}

function request(researchPackId: string) {
  return { contractVersion: '1.0.0', researchPackId, calculationKey: 'research_evidence_index_v1', calculationVersion: 1 } as const;
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

function resolvePointer(value: unknown, pointer: string): unknown {
  return pointer.slice(1).split('/').reduce<unknown>((current, token) => {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    return (current as Record<string, unknown>)[key];
  }, value);
}

test('migration 0006 upgrades version 5 once and migrations 0001-0005 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), expectedPriorMigrationDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-evidence-migration-'));
  roots.push(root);
  const migrationsDirectory = path.join(root, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(migrationsDirectory, path.basename(file)));
  const databasePath = path.join(root, 'foundation.sqlite');
  const versionFive = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(versionFive.migration.applied, [1, 2, 3, 4, 5]);
  assert.equal(versionFive.db.pragma('user_version', { simple: true }), 5n);
  versionFive.db.close();
  fs.copyFileSync('migrations/0006_analysis_research_results.sql', path.join(migrationsDirectory, '0006_analysis_research_results.sql'));
  const upgraded = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(upgraded.migration.applied, [6]);
  assert.equal(upgraded.db.pragma('user_version', { simple: true }), 6n);
  assert.deepEqual(upgraded.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'analysis_%' ORDER BY name").all(), [
    { name: 'analysis_interpretations' }, { name: 'analysis_research_results' }, { name: 'analysis_results' },
  ]);
  upgraded.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 6);
  rerun.db.close();
});

test('v1 segmentation preserves exact LF/CRLF/EOF ranges, BOM offsets, whitespace, and Vietnamese bytes', () => {
  const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('  đầu\t\r\n\n \t\ncuối Việt', 'utf8')]);
  const segments = segmentResearchDocument(raw);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map(({ segmentIndex, byteStart, byteEnd, text }) => ({ segmentIndex, byteStart, byteEnd, text })), [
    { segmentIndex: 0, byteStart: 3, byteEnd: raw.indexOf(0x0d), text: '  đầu\t' },
    { segmentIndex: 1, byteStart: raw.lastIndexOf(0x0a) + 1, byteEnd: raw.byteLength, text: 'cuối Việt' },
  ]);
  for (const segment of segments) {
    const slice = raw.subarray(segment.byteStart, segment.byteEnd);
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(slice), segment.text);
    assert.equal(createHash('sha256').update(slice).digest('hex'), segment.textSha256);
  }
  assert.deepEqual(segmentResearchDocument(Buffer.from('a\rb\r')), [
    { segmentIndex: 0, byteStart: 0, byteEnd: 3, textSha256: createHash('sha256').update(Buffer.from('a\rb')).digest('hex'), text: 'a\rb' },
  ]);
  const laterBomBytes = Buffer.concat([Buffer.from('a\n'), Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('b')]);
  const laterBom = segmentResearchDocument(laterBomBytes)[1]!;
  assert.equal(laterBom.byteStart, 2);
  assert.equal(laterBom.text, '\ufeffb');
  assert.equal(Buffer.from(laterBom.text, 'utf8').equals(laterBomBytes.subarray(laterBom.byteStart, laterBom.byteEnd)), true);
});

test('service reads only the declared reader and creates one canonical deterministic citation-ready Result artifact', async () => {
  const state = setup();
  const firstBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Dòng một\r\n\r\n  Dòng hai  ', 'utf8')]);
  const secondBytes = Buffer.from('Alpha\n\t\nBeta\n', 'utf8');
  const first = await importDocument(state, 1, firstBytes);
  const second = await importDocument(state, 2, secondBytes);
  const pack = await createPack(state, [second.documentId, first.documentId]);
  const service = analysis(state);
  const execution = await service.calculate(request(pack.packId));
  assert.equal(execution.deduplicated, false);
  assert.equal(count(state.db, 'analysis_research_results'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), 4n);
  assert.equal(count(state.db, 'foundation_research_documents'), 2n);
  assert.deepEqual(state.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND (name LIKE '%segment%' OR name LIKE '%citation%')").all(), []);

  const result = await service.replay(execution.resultId);
  assert.equal(result.coverage.documentCount, 2);
  assert.equal(result.coverage.retainedSegmentCount, 4);
  assert.deepEqual(result.documents.map((document) => document.documentId), [...pack.documentIds].sort());
  for (const [documentIndex, document] of result.documents.entries()) {
    for (const [segmentIndex, segment] of document.segments.entries()) {
      assert.equal(segment.segmentIndex, segmentIndex);
      assert.equal(segment.citationPointer, `/documents/${documentIndex}/segments/${segmentIndex}/text`);
      assert.equal(resolvePointer(result, segment.citationPointer), segment.text);
      const sourceBytes = document.documentId === first.documentId ? firstBytes : secondBytes;
      const slice = sourceBytes.subarray(segment.byteStart, segment.byteEnd);
      assert.equal(slice.toString('utf8'), segment.text);
      assert.equal(createHash('sha256').update(slice).digest('hex'), segment.textSha256);
    }
  }
  const artifactBytes = await state.artifacts.read(execution.resultArtifactSha256);
  assert.equal(artifactBytes.toString('utf8'), canonicalJson(result));
  assert.equal(artifactBytes.includes(firstBytes), false);
  const verified = await new AnalysisResearchEvidenceIndexResultReader(service).readVerifiedResearchEvidenceIndexResult(execution.resultId);
  assert.equal(verified.resultArtifactSha256, execution.resultArtifactSha256);
  state.db.close();
});

test('request validation, missing pack, and zero-retained-segment documents reject before Result writes', async () => {
  const state = setup();
  const valid = await importDocument(state, 1, Buffer.from('valid line'));
  const pack = await createPack(state, [valid.documentId]);
  const normalReader = new FoundationResearchPackReader(state.packs);
  const frozen = await normalReader.readFinalizedResearchPack(pack.packId);
  const blankReader: FinalizedResearchPackReader = {
    async readFinalizedResearchPack(): Promise<VerifiedFinalizedResearchPack> {
      return { ...frozen, documents: frozen.documents.map((document) => ({ ...document, bytes: Buffer.from(' \t\r\n\n') })) };
    },
  };
  const beforeArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(analysis(state).calculate({ ...request(pack.packId), prompt: 'ignore rules' }), AnalysisValidationError);
  await assert.rejects(analysis(state).calculate(request(randomUUID())), /Finalized Research Pack not found/);
  await assert.rejects(analysis(state, blankReader).calculate(request(pack.packId)), /zero retained segments/);
  assert.equal(count(state.db, 'analysis_research_results'), 0n);
  assert.equal(count(state.db, 'artifact_manifests'), beforeArtifacts);
  state.db.close();
});

test('same calculation is idempotent without a second artifact and changed canonical request conflicts', async () => {
  const state = setup();
  const document = await importDocument(state, 1, Buffer.from('one\ntwo'));
  const pack = await createPack(state, [document.documentId]);
  const service = analysis(state);
  const first = await service.calculate(request(pack.packId));
  const artifactsAfterFirst = count(state.db, 'artifact_manifests');
  const second = await service.calculate(request(pack.packId));
  assert.deepEqual(second, { ...first, deduplicated: true });
  assert.equal(count(state.db, 'analysis_research_results'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), artifactsAfterFirst);
  state.db.exec('DROP TRIGGER analysis_research_results_no_update');
  state.db.prepare('UPDATE analysis_research_results SET request_sha256 = ? WHERE result_id = ?').run('0'.repeat(64), first.resultId);
  await assert.rejects(service.calculate(request(pack.packId)), AnalysisIdentityConflictError);
  assert.equal(count(state.db, 'artifact_manifests'), artifactsAfterFirst);
  state.db.close();
});

test('Result rows are immutable and replay detects missing, corrupt, noncanonical, metadata, and source mismatch', async () => {
  const immutable = setup();
  const immutableDocument = await importDocument(immutable, 1, Buffer.from('immutable'));
  const immutablePack = await createPack(immutable, [immutableDocument.documentId]);
  const immutableService = analysis(immutable);
  const immutableResult = await immutableService.calculate(request(immutablePack.packId));
  assert.throws(() => immutable.db.prepare('UPDATE analysis_research_results SET completed_at = ? WHERE result_id = ?').run('rewrite', immutableResult.resultId), /analysis_research_result_immutable/);
  assert.throws(() => immutable.db.prepare('DELETE FROM analysis_research_results WHERE result_id = ?').run(immutableResult.resultId), /analysis_research_result_immutable/);
  immutable.db.close();

  const missing = setup();
  const missingDocument = await importDocument(missing, 1, Buffer.from('missing'));
  const missingPack = await createPack(missing, [missingDocument.documentId]);
  const missingService = analysis(missing);
  const missingResult = await missingService.calculate(request(missingPack.packId));
  await fsp.rm(missing.artifacts.pathForDigest(missingResult.resultArtifactSha256));
  await assert.rejects(missingService.replay(missingResult.resultId), /ENOENT/);
  missing.db.close();

  const corrupt = setup();
  const corruptDocument = await importDocument(corrupt, 1, Buffer.from('corrupt'));
  const corruptPack = await createPack(corrupt, [corruptDocument.documentId]);
  const corruptService = analysis(corrupt);
  const corruptResult = await corruptService.calculate(request(corruptPack.packId));
  await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptResult.resultArtifactSha256), Buffer.from('{}'));
  await assert.rejects(corruptService.replay(corruptResult.resultId), ArtifactIntegrityError);
  corrupt.db.close();

  const noncanonical = setup();
  const noncanonicalDocument = await importDocument(noncanonical, 1, Buffer.from('noncanonical'));
  const noncanonicalPack = await createPack(noncanonical, [noncanonicalDocument.documentId]);
  const noncanonicalService = analysis(noncanonical);
  const noncanonicalResult = await noncanonicalService.calculate(request(noncanonicalPack.packId));
  const parsed = JSON.parse((await noncanonical.artifacts.read(noncanonicalResult.resultArtifactSha256)).toString('utf8'));
  const replacement = Buffer.from(JSON.stringify(parsed, null, 2));
  const replacementDigest = createHash('sha256').update(replacement).digest('hex');
  await fsp.mkdir(path.dirname(noncanonical.artifacts.pathForDigest(replacementDigest)), { recursive: true });
  await fsp.writeFile(noncanonical.artifacts.pathForDigest(replacementDigest), replacement, { mode: 0o600 });
  noncanonical.db.exec('DROP TRIGGER analysis_research_results_no_update');
  noncanonical.db.prepare(`INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at) VALUES (?, ?, 'application/json', ?, '2026-09-11T10:00:00.000Z', '1.0.0', 'active', '2026-09-11T10:00:00.000Z')`).run(replacementDigest, replacement.byteLength, `sha256/${replacementDigest.slice(0, 2)}/${replacementDigest}`);
  noncanonical.db.prepare('UPDATE analysis_research_results SET result_artifact_sha256 = ? WHERE result_id = ?').run(replacementDigest, noncanonicalResult.resultId);
  await assert.rejects(noncanonicalService.replay(noncanonicalResult.resultId), /not canonical JSON/);
  noncanonical.db.close();

  const metadata = setup();
  const metadataDocument = await importDocument(metadata, 1, Buffer.from('metadata'));
  const metadataPack = await createPack(metadata, [metadataDocument.documentId]);
  const metadataService = analysis(metadata);
  const metadataResult = await metadataService.calculate(request(metadataPack.packId));
  metadata.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('text/plain', metadataResult.resultArtifactSha256);
  await assert.rejects(metadataService.replay(metadataResult.resultId), /artifact manifest metadata mismatch/);
  metadata.db.close();

  const source = setup();
  const sourceDocument = await importDocument(source, 1, Buffer.from('source'));
  const sourcePack = await createPack(source, [sourceDocument.documentId]);
  const realReader = new FoundationResearchPackReader(source.packs);
  const frozen = await realReader.readFinalizedResearchPack(sourcePack.packId);
  const sourceService = analysis(source, { async readFinalizedResearchPack() { return { ...frozen, manifestArtifactSha256: 'f'.repeat(64) }; } });
  const sourceResult = await analysis(source, realReader).calculate(request(sourcePack.packId));
  await assert.rejects(sourceService.replay(sourceResult.resultId), /does not match immutable source or database metadata/);
  const wrongIdService = analysis(source, {
    async readFinalizedResearchPack() { return { ...frozen, researchPackId: randomUUID() }; },
  });
  await assert.rejects(wrongIdService.calculate(request(sourcePack.packId)), /identity does not match the requested source/);
  await assert.rejects(wrongIdService.replay(sourceResult.resultId), /identity does not match the requested source/);
  source.db.close();
});

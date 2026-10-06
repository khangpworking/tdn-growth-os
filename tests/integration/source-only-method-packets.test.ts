import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildVerifiedMethodPacketSources } from '../../src/modules/analysis/report-method-packets-extension.js';
import { reportMethodPacketsFixture } from '../helpers/report-method-packets-fixture.js';

// Owns the no-Metric delivery boundary. Existing prepared-report coverage always
// supplies a Metric workbook/result and cannot prove an independent source works.
test('retained source-only method package executes bounded gates read-only, without Metric or synthesis authority', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-source-only-gates-'));
  const now = () => new Date('2026-10-04T00:00:00.000Z');
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  const reader = new FoundationSourcePackageReader(packages);
  const fixture = reportMethodPacketsFixture();
  const descriptorBytes = Buffer.from(canonicalJson({ ...fixture.descriptor, decisions: null }));
  const descriptor = fixture.files.find(file => file.path === fixture.logicalPath)!;
  const selectedFiles = fixture.files.filter(file => file.path === fixture.gateSourcePath ||
    file.path === 'method-packets/advanced-profile.md' || file.path === 'method-packets/adoption.md');
  selectedFiles.push({ ...descriptor, bytes: descriptorBytes, byteSize: descriptorBytes.length,
    sha256: createHash('sha256').update(descriptorBytes).digest('hex') });
  const fileMetadata = selectedFiles.map(({ bytes: _bytes, ...file }) => file);
  const receipt = await packages.intake({ contractVersion: '1.0.0', packageKey: 'synthetic:source-only-gates', version: 1,
    sourceAcquiredAt: null, sourceLabel: 'Synthetic non-Metric gate source',
    files: [fileMetadata[0]!, ...fileMetadata.slice(1)] }, new Map(selectedFiles.map(file => [file.path, file.bytes])));

  const changes = db.prepare('SELECT total_changes() changes').get();
  db.pragma('query_only = ON');
  const retained = await reader.readFinalizedSourcePackage(receipt.packageId);
  const built = buildVerifiedMethodPacketSources(fixture.logicalPath, retained);
  assert.equal(built.input.decisions, null);
  assert.ok(built.gates);
  assert.equal(built.gates.sections.M10.forecasts, null);
  assert.deepEqual(built.gates.sections.M10.partitions[0]!.observedZeroDates, ['2026-01-02']);
  assert.equal(built.gates.sections.I11.publicationStatus, 'NOT_AUTHORIZED');
  assert.deepEqual(built.gates.sections.I12.presencePointers, ['/input/i12/records/0']);
  assert.deepEqual(built.gates.sections.I12.exposurePointers, ['/input/i12/records/1']);
  assert.deepEqual(built.gates.sections.I12.outcomePointers, ['/input/i12/records/2']);
  assert.equal(built.gates.sections.I12.rates, null);
  assert.equal(built.gates.sections.I16.executionState, 'NOT_EXECUTED');
  assert.equal(built.gates.sections.I16.estimate, null);
  assert.equal(built.evidence.get(fixture.gateSourcePath)!.sha256,
    built.gates.input.i12!.records[0]!.source.sha256);
  assert.deepEqual(db.prepare('SELECT total_changes() changes').get(), changes);
  const replay = buildVerifiedMethodPacketSources(fixture.logicalPath, await reader.readFinalizedSourcePackage(receipt.packageId));
  assert.equal(canonicalJson(replay.gates), canonicalJson(built.gates));
});

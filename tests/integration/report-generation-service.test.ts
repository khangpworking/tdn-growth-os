import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ReportGenerationService, ResearchGenerationIntegrityError } from '../../src/modules/analysis/report-generation-service.js';
import { ReportVersionService, ReportVersionIdentityConflictError } from '../../src/modules/analysis/report-version-service.js';
import { SourcePackageService } from '../../src/modules/foundation/index.js';
import { preparedReportFixture, mutationSnapshot, byteDigest } from '../helpers/prepared-report-fixture.js';

type Fixture = Awaited<ReturnType<typeof preparedReportFixture>>;
function generation(state: Fixture, artifactStore = new RequestScopedArtifactStore(state.artifactRoot)) {
  return new ReportGenerationService({ db: state.db, artifactStore, ...state.dependencies, catalogBytes: state.catalogBytes });
}

// This adapter owns profile admission and stage publication. The existing A10
// tests independently own report-version recovery and corruption semantics.
test('missing optional labels produce an explicitly source-backed partial report', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const service = generation(state);
  const workspaceId = state.sourceRequest.workspaceId;
  const choice = (await service.inputs(workspaceId)).choices.find(item => item.workbookPath === 'metric/workbook-alias.xlsx' && item.labelsPath === null)!;
  const request = { contractVersion: '1.0.0', workspaceId, selectionId: choice.selectionId, requestKey: 'fe99a3db-1c81-4e96-a7dd-16dbbe213b33' };
  const countBefore = state.db.prepare('SELECT count(*) count FROM analysis_section_artifacts').get();
  const receipt = await service.create(request);
  assert.equal(receipt.profile, 'source-backed-v1');
  assert.ok(receipt.limitations.includes('M03_PREPARED_METHOD_NOT_EXECUTED'));
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_section_artifacts').get(), countBefore);
  const reader = new ReportVersionService({ db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies });
  const record = await reader.readVersion(receipt.reportId, 1);
  assert.equal(record.artifacts.some(file => file.fileName === 'assembly-snapshot.json'), false);
  const createRequest = JSON.parse((await reader.readArtifact(receipt.reportId, 1, 'create-request.json')).bytes.toString('utf8'));
  assert.equal(createRequest.sourceRequest.labelsPath, null);
  const before = mutationSnapshot(state);
  assert.deepEqual(await service.create(request), { ...receipt, exactRetry: true });
  assert.deepEqual(mutationSnapshot(state), before);
});

test('an unrelated corrupt package cannot block exact retry of a committed report', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const service = generation(state);
  const workspaceId = state.sourceRequest.workspaceId;
  const choice = (await service.inputs(workspaceId)).choices.find(item => item.labelsPath !== null)!;
  const request = { contractVersion: '1.0.0', workspaceId, selectionId: choice.selectionId, requestKey: '0c116cd5-bfbb-42a7-a64c-a81456d22458' };
  const receipt = await service.create(request);
  const unrelatedBytes = Buffer.from('Unrelated synthetic package evidence.\n', 'utf8');
  const unrelatedSha256 = byteDigest(unrelatedBytes);
  await new SourcePackageService({ db: state.db, artifactStore: state.artifacts }).intake({
    contractVersion: '1.0.0', packageKey: 'synthetic:unrelated-retry-package', version: 1,
    sourceAcquiredAt: null, sourceLabel: 'Unrelated synthetic package',
    files: [{
      path: 'unrelated.txt', sha256: unrelatedSha256, byteSize: unrelatedBytes.length, mediaType: 'text/plain',
      evidenceFamily: 'synthetic-unrelated', representationRole: 'primary', independence: 'non_independent',
      providerProvenance: 'synthetic', provenanceBasis: 'Synthetic unrelated retry isolation evidence',
    }],
  }, new Map([['unrelated.txt', unrelatedBytes]]));
  const damaged = Buffer.from('Damaged unrelated evidence.\n', 'utf8');
  await fs.writeFile(state.artifacts.pathForDigest(unrelatedSha256), damaged);
  const before = mutationSnapshot(state);
  // Discovery still reports corruption honestly; the selected committed report is independent.
  await assert.rejects(service.inputs(workspaceId), /digest mismatch/i);
  assert.deepEqual(await generation(state).create(request), { ...receipt, exactRetry: true });
  assert.deepEqual(mutationSnapshot(state), before);
  assert.deepEqual(await fs.readFile(state.artifacts.pathForDigest(unrelatedSha256)), damaged);
});

test('a committed preparation with interrupted publication is recovered without inventing a report or changing its source identity', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  class InterruptedPublication extends RequestScopedArtifactStore {
    override async publishOwned(): Promise<void> { throw new Error('Synthetic interrupted publication'); }
  }
  const interrupted = generation(state, new InterruptedPublication(state.artifactRoot));
  const workspaceId = state.sourceRequest.workspaceId;
  const choice = (await interrupted.inputs(workspaceId)).choices.find(item => item.workbookPath === 'metric/workbook-alias.xlsx' && item.labelsPath !== null)!;
  const request = { contractVersion: '1.0.0', workspaceId, selectionId: choice.selectionId, requestKey: '3b5b6f94-ea0c-460c-990b-9f89d41426f8' };
  await assert.rejects(interrupted.create(request), /Synthetic interrupted publication/);
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 0n });
  const committed = state.db.prepare('SELECT preparation_sha256 FROM analysis_metric_input_preparations WHERE workbook_path = ?').get(choice.workbookPath);
  assert.ok(committed);
  assert.deepEqual(await fs.readdir(`${state.artifactRoot}/.owner-api-requests`), []);
  const receipt = await generation(state).create(request);
  assert.equal(receipt.profile, 'prepared-report-v1');
  assert.deepEqual(state.db.prepare('SELECT preparation_sha256 FROM analysis_metric_input_preparations WHERE workbook_path = ?').get(choice.workbookPath), committed);
  const reader = new ReportVersionService({ db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies });
  assert.ok((await reader.readArtifact(receipt.reportId, 1, 'report.html')).bytes.length > 100);
});

test('source corruption blocks generation without creating a report or replacing the damaged bytes', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const service = generation(state);
  const workspaceId = state.sourceRequest.workspaceId;
  const choice = (await service.inputs(workspaceId)).choices.find(item => item.labelsPath !== null)!;
  const workbook = state.artifacts.pathForDigest(state.preparation.result.selectedSources.workbook.sha256);
  const damaged = Buffer.from('synthetic damaged evidence');
  await fs.writeFile(workbook, damaged);
  const before = mutationSnapshot(state);
  await assert.rejects(service.create({ contractVersion: '1.0.0', workspaceId, selectionId: choice.selectionId, requestKey: '67639645-e8a6-45bf-bd79-01a81b2c7502' }), /digest mismatch/i);
  assert.deepEqual(mutationSnapshot(state), before);
  assert.deepEqual(await fs.readFile(workbook), damaged);
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 0n });
  assert.throws(() => new ReportGenerationService({ db: state.db, artifactStore: new RequestScopedArtifactStore(state.artifactRoot), ...state.dependencies, catalogBytes: Buffer.from('{}') }), ResearchGenerationIntegrityError);
});

test('a conflicting retry with unpublished request bytes cannot retain intermediate evidence, while the original request recovers', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  class InterruptedReportPublication extends RequestScopedArtifactStore {
    override async publishOwned(): Promise<void> {
      if (state.db.prepare('SELECT report_id FROM analysis_report_versions').get()) {
        throw new Error('Synthetic interrupted report publication');
      }
      await super.publishOwned();
    }
  }
  const interrupted = generation(state, new InterruptedReportPublication(state.artifactRoot));
  const workspaceId = state.sourceRequest.workspaceId;
  const choices = (await interrupted.inputs(workspaceId)).choices;
  const original = choices.find(item => item.workbookPath === 'metric/workbook-alias.xlsx' && item.labelsPath === null)!;
  const changed = choices.find(item => item.workbookPath === original.workbookPath && item.labelsPath !== null)!;
  const request = { contractVersion: '1.0.0', workspaceId, selectionId: original.selectionId, requestKey: '5e180210-427b-449f-8e91-bce475caed52' };
  await assert.rejects(interrupted.create(request), /Synthetic interrupted report publication/);
  const committed = state.db.prepare(`
    SELECT report_id reportId, semantic_version_id semanticVersionId, request_artifact_sha256 requestSha256
    FROM analysis_report_versions
  `).get() as { reportId: string; semanticVersionId: string; requestSha256: string };
  assert.ok(committed);
  await assert.rejects(state.artifacts.read(committed.requestSha256), { code: 'ENOENT' });

  const service = generation(state);
  const before = mutationSnapshot(state);
  await assert.rejects(service.create({ ...request, selectionId: changed.selectionId }), ReportVersionIdentityConflictError);
  assert.deepEqual(mutationSnapshot(state), before, 'A rejected selection must not add intermediate rows, manifests or artifact files');
  await assert.rejects(state.artifacts.read(committed.requestSha256), { code: 'ENOENT' });

  const recovered = await service.create(request);
  assert.equal(recovered.reportId, committed.reportId);
  assert.equal(recovered.semanticVersionId, committed.semanticVersionId);
  assert.equal(recovered.profile, 'source-backed-v1');
  assert.equal(recovered.exactRetry, true);
  const afterRecovery = mutationSnapshot(state);
  assert.deepEqual(afterRecovery.changes, before.changes);
  assert.deepEqual(afterRecovery.manifests, before.manifests);
  const reader = new ReportVersionService({ db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies });
  const saved = JSON.parse((await reader.readArtifact(recovered.reportId, 1, 'create-request.json')).bytes.toString('utf8'));
  assert.equal(saved.sourceRequest.workbookPath, original.workbookPath);
  assert.equal(saved.sourceRequest.labelsPath, null);
});

test('method input inventory is explicit and selected descriptors reach the retained request', async t => {
  const state = await preparedReportFixture(false, true, true, true);
  t.after(state.cleanup);
  const service = generation(state);
  const workspaceId = state.sourceRequest.workspaceId;
  const choice = (await service.inputs(workspaceId)).choices.find(item => item.labelsPath !== null)!;
  assert.ok(choice.methodInputs);
  assert.deepEqual(Object.keys(choice.methodInputs!).sort(), ['descriptiveMethods', 'locatedInsightMethods', 'methodPackets']);
  assert.equal(choice.methodInputs!.descriptiveMethods.length, 1);
  assert.equal(choice.methodInputs!.locatedInsightMethods.length, 1);
  const methodPacket = choice.methodInputs!.methodPackets.find(item => item.logicalPath === state.methods!.logicalPath)!;
  assert.ok(methodPacket, 'Choose the exact valid descriptor rather than the first schema-valid candidate');
  const methodSelectionIds = {
    descriptiveMethods: choice.methodInputs!.descriptiveMethods[0]!.methodSelectionId,
    locatedInsightMethods: choice.methodInputs!.locatedInsightMethods[0]!.methodSelectionId,
    methodPackets: methodPacket.methodSelectionId,
  };
  const legacyReceipt = await service.create({
    contractVersion: '1.0.0' as const, workspaceId, selectionId: choice.selectionId,
    requestKey: 'd1e22c92-3cf4-43f6-a170-6efde5d0da27',
  });
  const legacyReader = new ReportVersionService({ db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies });
  const legacySaved = JSON.parse((await legacyReader.readArtifact(legacyReceipt.reportId, 1, 'create-request.json')).bytes.toString('utf8')) as Record<string, unknown>;
  assert.equal(Object.hasOwn(legacySaved, 'descriptiveMethodsPath'), false);
  assert.equal(Object.hasOwn(legacySaved, 'locatedInsightMethodsPath'), false);
  assert.equal(Object.hasOwn(legacySaved, 'methodPacketsPath'), false);
  const beforeEmptyRetry = mutationSnapshot(state);
  const emptyRetry = await service.create({
    contractVersion: '1.0.0' as const, workspaceId, selectionId: choice.selectionId,
    requestKey: 'd1e22c92-3cf4-43f6-a170-6efde5d0da27',
    methodSelectionIds: { descriptiveMethods: null, locatedInsightMethods: null, methodPackets: null },
  });
  assert.deepEqual(emptyRetry, { ...legacyReceipt, exactRetry: true });
  assert.deepEqual(mutationSnapshot(state), beforeEmptyRetry);
  const request = {
    contractVersion: '1.0.0' as const, workspaceId, selectionId: choice.selectionId,
    requestKey: 'c84a4e54-8f2d-4df6-9e99-01a2cbdab2c7', methodSelectionIds,
  };
  const receipt = await service.create(request);
  const reader = new ReportVersionService({ db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies });
  const saved = JSON.parse((await reader.readArtifact(receipt.reportId, 1, 'create-request.json')).bytes.toString('utf8')) as Record<string, unknown>;
  assert.equal(saved.descriptiveMethodsPath, choice.methodInputs!.descriptiveMethods[0]!.logicalPath);
  assert.equal(saved.locatedInsightMethodsPath, choice.methodInputs!.locatedInsightMethods[0]!.logicalPath);
  assert.equal(saved.methodPacketsPath, state.methods!.logicalPath);
});

test('changed method selection conflicts before writes while missing request publication recovers the exact request', async t => {
  const state = await preparedReportFixture(false, true, true, true);
  t.after(state.cleanup);
  class InterruptedReportPublication extends RequestScopedArtifactStore {
    override async publishOwned(): Promise<void> {
      if (state.db.prepare('SELECT report_id FROM analysis_report_versions').get()) {
        throw new Error('Synthetic interrupted method report publication');
      }
      await super.publishOwned();
    }
  }
  const interrupted = generation(state, new InterruptedReportPublication(state.artifactRoot));
  const workspaceId = state.sourceRequest.workspaceId;
  const choice = (await interrupted.inputs(workspaceId)).choices.find(item => item.labelsPath === null)!;
  const methodInputs = choice.methodInputs!;
  const request = {
    contractVersion: '1.0.0' as const, workspaceId, selectionId: choice.selectionId,
    requestKey: 'b99469c1-47ac-4bf5-8f28-5c2168f170ad', methodSelectionIds: {
      descriptiveMethods: methodInputs.descriptiveMethods[0]!.methodSelectionId,
      locatedInsightMethods: methodInputs.locatedInsightMethods[0]!.methodSelectionId,
      methodPackets: methodInputs.methodPackets.find(item => item.logicalPath === state.methods!.logicalPath)!.methodSelectionId,
    },
  };
  await assert.rejects(interrupted.create(request), /Synthetic interrupted method report publication/);
  const committed = state.db.prepare(`
    SELECT request_sha256 canonicalRequestSha256, request_artifact_sha256 requestArtifactSha256
    FROM analysis_report_versions
  `).get() as { canonicalRequestSha256: string; requestArtifactSha256: string };
  assert.ok(committed);
  await assert.rejects(state.artifacts.read(committed.requestArtifactSha256), { code: 'ENOENT' });
  const beforeConflict = mutationSnapshot(state);
  const { methodSelectionIds: _discarded, ...legacyRequest } = request;
  await assert.rejects(generation(state).create(legacyRequest), ReportVersionIdentityConflictError);
  assert.deepEqual(mutationSnapshot(state), beforeConflict);
  const recovered = await generation(state).create(request);
  assert.equal(recovered.exactRetry, true);
  assert.equal(recovered.profile, 'source-backed-v1');
  assert.equal((await generation(state).create(request)).exactRetry, true);
});

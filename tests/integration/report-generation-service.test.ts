import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ReportGenerationService, ResearchGenerationIntegrityError } from '../../src/modules/analysis/report-generation-service.js';
import { ReportVersionService } from '../../src/modules/analysis/report-version-service.js';
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

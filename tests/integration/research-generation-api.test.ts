import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { ResearchGenerationInputs, ResearchGenerationReceipt } from '../../contracts/api/research-generation-api.generated.js';
import { openResearchGenerationApi, type ResearchGenerationApiApplication } from '../../src/api/research-generation-api.js';
import { openReportApi } from '../../src/api/report-api.js';
import { ReportVersionService } from '../../src/modules/analysis/report-version-service.js';
import { preparedReportFixture, mutationSnapshot } from '../helpers/prepared-report-fixture.js';

const token = 'synthetic-owner-token-1234567890-test-only';
const requestKey = '83dc02ef-a2c1-40cc-a28e-2c8d7e93bfe5';

// Owns HTTP admission and the actual web-to-retained-report journey. Arithmetic,
// section rendering and ledger recovery have their existing owner-boundary tests.
test('OWNER source selection creates a retained report and recovers a lost response with the same request key', async t => {
  const state = await preparedReportFixture(false, true, true, true, true);
  t.after(state.cleanup);
  let app: ResearchGenerationApiApplication;
  const reads = openReportApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot });
  const server = http.createServer((request, response) => (request.url?.startsWith('/api/') ? reads : app).handler(request, response));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  app = openResearchGenerationApi({
    databasePath: state.databasePath, artifactRoot: state.artifactRoot,
    writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:test',
  });
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); app.close(); reads.close(); });
  const workspaceId = state.sourceRequest.workspaceId;
  const inputsUrl = `${origin}/owner-api/research-generation/inputs?workspaceId=${workspaceId}`;
  const reportsUrl = `${origin}/owner-api/research-generation/reports`;
  const headers = { authorization: `Bearer ${token}`, origin, 'content-type': 'application/json' };
  const before = mutationSnapshot(state);

  assert.equal((await fetch(inputsUrl)).status, 401);
  assert.equal((await fetch(inputsUrl, { headers: { ...headers, origin: 'https://untrusted.example' } })).status, 403);
  // Node fetch rewrites Host; use the native HTTP client to exercise a real
  // mismatched authority at the server boundary.
  const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = http.get(inputsUrl, { headers: { ...headers, host: 'untrusted.example' } }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal((await fetch(inputsUrl, { method: 'POST', headers })).status, 405);
  assert.equal((await fetch(`${inputsUrl}&workspaceId=${workspaceId}`, { headers })).status, 400);
  const sourceResponse = await fetch(inputsUrl, { headers });
  assert.equal(sourceResponse.status, 200);
  assert.equal(sourceResponse.headers.get('cache-control'), 'no-store');
  const inventory = await sourceResponse.json() as ResearchGenerationInputs;
  const choice = inventory.choices.find(item => item.workbookPath === 'metric/workbook-alias.xlsx' && item.labelsPath !== null);
  assert.ok(choice, 'The retained source alias must be selectable by its exact member identity');
  assert.equal(choice.sourceLabel, 'Synthetic integrated report package');
  assert.deepEqual(choice.period, { start: '2026-08-17', end: '2026-09-15', basis: 'Synthetic declared period' });
  assert.equal(JSON.stringify(inventory).includes(state.directory), false);
  assert.deepEqual(mutationSnapshot(state), before, 'Inventory and rejected HTTP admission must not mutate evidence');

  const body = { contractVersion: '1.0.0', workspaceId, selectionId: choice.selectionId, requestKey };
  for (const invalidBody of [{ ...body, workbookPath: '/private/server.xlsx' }, { ...body, requestKey: 'invented-id' }]) {
    assert.equal((await fetch(reportsUrl, { method: 'POST', headers, body: JSON.stringify(invalidBody) })).status, 400);
  }
  assert.equal((await fetch(reportsUrl, { method: 'POST', headers, body: 'x'.repeat(4097) })).status, 400);
  assert.equal((await fetch(reportsUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status, 401);
  assert.deepEqual(mutationSnapshot(state), before);

  const createdResponse = await fetch(reportsUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(createdResponse.status, 201, await responseDiagnostic(createdResponse));
  const created = await createdResponse.json() as ResearchGenerationReceipt;
  assert.equal(created.profile, 'prepared-report-v1');
  assert.equal(created.exactRetry, false);
  assert.equal(created.reviewState, 'UNREVIEWED');
  const reader = new ReportVersionService({ db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies });
  const record = await reader.readVersion(created.reportId, 1);
  assert.equal(record.previousSemanticVersionId, null);
  const retainedRequest = JSON.parse((await reader.readArtifact(created.reportId, 1, 'create-request.json')).bytes.toString('utf8'));
  assert.equal(retainedRequest.sourceRequest.workbookPath, 'metric/workbook-alias.xlsx');
  assert.ok(record.artifacts.some(file => file.fileName === 'assembly-snapshot.json'));
  assert.ok((await reader.readArtifact(created.reportId, 1, 'report.html')).bytes.length > 100);

  const beforeRead = mutationSnapshot(state);
  const htmlResponse = await fetch(`${origin}/api/reports/${created.reportId}/versions/1/files/report.html`);
  assert.equal(htmlResponse.status, 200);
  assert.equal(htmlResponse.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
  assert.deepEqual(Buffer.from(await htmlResponse.arrayBuffer()), (await reader.readArtifact(created.reportId, 1, 'report.html')).bytes);
  assert.equal(reads.diagnostics().queryOnly, true);
  assert.deepEqual(mutationSnapshot(state), beforeRead);

  app.close();
  app = openResearchGenerationApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:test' });
  const beforeRetry = mutationSnapshot(state);
  const retriedResponse = await fetch(reportsUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(retriedResponse.status, 200, await responseDiagnostic(retriedResponse));
  assert.deepEqual(await retriedResponse.json(), { ...created, exactRetry: true });
  const otherChoice = inventory.choices.find(item => item.workbookPath === choice.workbookPath && item.labelsPath === null)!;
  const conflict = await fetch(reportsUrl, { method: 'POST', headers, body: JSON.stringify({ ...body, selectionId: otherChoice.selectionId }) });
  assert.equal(conflict.status, 409);
  assert.deepEqual(mutationSnapshot(state), beforeRetry);
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 1n });

  // This boundary owns actionable HTTP errors, not the consumer's claim arithmetic.
  // Imported mismatches must not be confused with damaged stored bytes.
  for (const [index, logicalPath] of [state.methods!.sourceDriftPath, state.methods!.claimDriftPath].entries()) {
    const candidate = choice.methodInputs!.methodPackets.find(item => item.logicalPath === logicalPath)!;
    assert.ok(candidate, 'Schema-valid but incompatible inputs must remain explicit candidates');
    const rejected = await fetch(reportsUrl, { method: 'POST', headers, body: JSON.stringify({
      ...body, requestKey: `a3c3dc8a-6b8f-4aed-8bea-66bbdcb0740${index}`,
      methodSelectionIds: { descriptiveMethods: null, locatedInsightMethods: null, methodPackets: candidate.methodSelectionId },
    }) });
    assert.equal(rejected.status, 422, await responseDiagnostic(rejected));
    assert.deepEqual(await rejected.json(), { error: {
      code: 'method_input_rejected', family: 'methodPackets',
      message: 'The selected method input does not match its declared evidence; choose another input or none',
    } });
    assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 1n });
  }
  const semanticCandidate = choice.methodInputs!.methodPackets.find(item => item.logicalPath === state.methods!.semanticInvalidPath);
  assert.ok(semanticCandidate, 'A schema-valid but semantically invalid decision input must remain an explicit candidate');
  const semanticRejected = await fetch(reportsUrl, { method: 'POST', headers, body: JSON.stringify({
    ...body, requestKey: 'a3c3dc8a-6b8f-4aed-8bea-66bbdcb07402',
    methodSelectionIds: { descriptiveMethods: null, locatedInsightMethods: null, methodPackets: semanticCandidate.methodSelectionId },
  }) });
  assert.equal(semanticRejected.status, 422, await responseDiagnostic(semanticRejected));
  assert.deepEqual(await semanticRejected.json(), { error: {
    code: 'method_input_rejected', family: 'methodPackets',
    message: 'The selected method input does not match its declared evidence; choose another input or none',
  } });
  assert.deepEqual(state.db.prepare('SELECT count(*) count FROM analysis_report_versions').get(), { count: 1n });
  const descriptor = state.methods!.files.find(item => item.path === state.methods!.logicalPath)!;
  await fs.writeFile(state.artifacts.pathForDigest(descriptor.sha256), Buffer.from('synthetic corrupt method bytes'));
  const corrupted = await fetch(inputsUrl, { headers });
  assert.equal(corrupted.status, 500);
  assert.deepEqual(await corrupted.json(), { error: { code: 'integrity_error', message: 'Stored research evidence failed verification' } });
});

async function responseDiagnostic(response: Response): Promise<string> {
  return response.ok ? '' : response.clone().text();
}

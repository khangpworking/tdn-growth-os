import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

for (const fault of ['gate', 'renderer'] as const) {
test(`RENDERFAIL-209: ${fault} failure logs only diagnostic fields and never publishes HTML`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-gate-209-'));
  const now = () => new Date('2026-10-12T00:00:00.000Z');
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'gate-209', title: 'Synthetic gate fixture' });
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, now, uuid: () => runId, workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces),
    source: syntheticProductSource(),
    renderer: (input, kind) => {
      if (fault === 'renderer') throw Object.assign(new TypeError('SYNTHETIC_RENDER_FAILURE'), {
        request: { body: 'synthetic-private-body', headers: 'synthetic-private-headers' },
        products: ['synthetic-private-product'], cause: new Error('synthetic-private-cause'),
      });
      return { ...buildResearchAutomationReport(input, kind), html: Buffer.from('<p>OpenAI</p>', 'utf8') };
    },
  });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const renderFailures: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { renderFailures.push(args.map(String).join(' ')); });

  await service.start(workspaceId, {
    contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'synthetic', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'],
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const run = await service.getRun(workspaceId, runId);
    if (run.status === 'AWAITING_SCOPE') break;
    await service.processNext();
  }
  const awaiting = await service.getRun(workspaceId, runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  await service.confirmScope(workspaceId, runId, {
    contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic product scope', includeTerms: [], excludeTerms: [],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [],
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const run = await service.getRun(workspaceId, runId);
    if (run.status === 'FAILED') break;
    await service.processNext();
  }
  const failed = await service.getRun(workspaceId, runId);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.steps.find(step => step.stepId === 'REPORTS')?.code, 'REPORT_RENDER_FAILED');
  assert.equal(failed.outputs?.market, undefined);
  assert.equal((db.prepare("SELECT count(*) AS count FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind='MARKET'").get(runId) as { count: bigint }).count, 0n);
  assert.deepEqual(await service.listReportVersions(workspaceId, runId), []);

  // RENDERFAIL-209: the stored blocker keeps its safe wording, so the original
  // class and message are the only server-side record of why rendering stopped.
  const logged = renderFailures.filter(line => line.includes('"event":"research_automation_report_failed"'))
    .map(line => JSON.parse(line) as { event: string; runId: string; stage: string; errorName: string; errorMessage: string });
  assert.equal(logged.length, 1);
  assert.deepEqual(logged[0], {
    event: 'research_automation_report_failed', runId, stage: 'RENDER', errorName: 'TypeError',
    errorMessage: fault === 'gate' ? 'MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME' : 'SYNTHETIC_RENDER_FAILURE',
  });
  assert.doesNotMatch(JSON.stringify(logged), /synthetic-private/);
  assert.doesNotMatch(JSON.stringify(failed), /SYNTHETIC_RENDER_FAILURE|MARKET_BUSINESS_GATE_FAILED|synthetic-private/);
});
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-12T00:00:00.000Z');
const organic = [
  { position: 1, title: 'Thạch dừa trong mẫu', link: 'https://example.test/included', snippet: 'Nguồn mẫu' },
  { position: 2, title: 'thach dua', link: 'https://example.test/jev-included', snippet: 'Chưa rõ nghĩa' },
  { position: 3, title: 'Tin khác', link: 'https://example.test/jev-excluded', snippet: 'Nguồn khác' },
];
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

function salesSource(): AutomationSourcePort {
  const source = syntheticProductSource();
  return { ...source,
    quickSearch: async (input, options) => {
      const result = await source.quickSearch(input, options);
      const responseBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Thạch dừa từ nguồn bán hàng"}]}');
      return { ...result, result: { ...result.result, captures: result.result.captures.map(capture => ({ ...capture,
        responseBytes, responseSha256: sha(responseBytes), responseByteLength: responseBytes.length })) } };
    },
    collect: async (input, options) => { const result = await source.collect(input, options); return { ...result, result: { ...result.result, captures: [] } }; },
  };
}

function jevClient(failing = false): TypesafeJevClient {
  return new TypesafeJevClient({ enabled: true, apiKey: 'synthetic-key', model: 'jev-1.13.0' }, async (_url, init) => {
    if (failing) throw new Error('synthetic Jev outage');
    const body = JSON.parse(String((init as RequestInit).body)) as { state: Record<string, { recordText: string }> };
    const answers = Object.fromEntries(Object.entries(body.state).map(([id, state]) => [id, {
      type: 'choice', choice: state.recordText.startsWith('Tin khác') ? 'NOT_ABOUT_PRODUCT' : 'ABOUT_PRODUCT',
      probabilities: { ABOUT_PRODUCT: state.recordText.startsWith('Tin khác') ? 0.02 : 0.97, NOT_ABOUT_PRODUCT: state.recordText.startsWith('Tin khác') ? 0.97 : 0.02, UNRESOLVED: 0.01 }, confidence: 0.95,
    }]));
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers }));
  });
}

async function run(t: TestContext, l9Jev?: TypesafeJevClient) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-jev-209b-live-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'jev-live', title: 'Synthetic Jev live run' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => runId, now,
    source: salesSource(), webSource: syntheticWebSource(() => {}, organic), renderer: buildResearchAutomationReport,
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => ({ keywords: ['Thạch dừa'], exclusions: [] }) } },
    ...(l9Jev ? { l9Jev } : {}) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY', keyword: 'Thạch dừa',
    requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision,
    definition: 'Synthetic frozen scope', includeTerms: ['Thạch dừa'], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 5 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  const row = db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { sha: string };
  const step = JSON.parse((await artifacts.read(row.sha)).toString('utf8')) as StepResultDocument;
  const report = await service.readReport(workspaceId, runId, 'MARKET');
  return { service, step, report, stepSha: row.sha, html: report.bytes.toString('utf8') };
}

test('Market COLLECTION retains Jev sidecar, applies moved web decisions, and labels them', async t => {
  const result = await run(t, jevClient());
  assert.equal(result.step.sourceEvidence?.jevTriage?.status, 'COMPLETED');
  assert.equal(result.step.sourceEvidence?.jevTriage?.auditRows.length, 2);
  const document = new JSDOM(result.html).window.document;
  const webRows = document.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr');
  assert.equal(webRows.length, 2, 'deterministic inclusion plus Jev inclusion are admitted');
  assert.match(result.html, /đúng sản phẩm \(máy phân loại\)/);
  assert.match(result.html, /không nói về sản phẩm \(máy phân loại\)/);
  assert.doesNotMatch(document.body.textContent ?? '', /Jev|TypeSafe|api\.typesafe/i);
});

test('Jev failure completes the run and records the unavailable note without changing deterministic admission', async t => {
  const result = await run(t, jevClient(true));
  assert.deepEqual(result.step.sourceEvidence?.jevTriage?.runNotes, ['L9_JEV_UNAVAILABLE']);
  assert.equal(new JSDOM(result.html).window.document.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr').length, 1);
  assert.doesNotMatch(new JSDOM(result.html).window.document.body.textContent ?? '', /đúng sản phẩm \(máy phân loại\)|không nói về sản phẩm \(máy phân loại\)/);
});

test('flag-off service output retains the pre-Jev fixed hashes', async t => {
  const result = await run(t);
  // PR #410: capture responseHeaders change identity only; verified against the header-only revert.
  assert.equal(result.stepSha, '276dcf565d4e62ead7ae205e92d8d68ba832e57ae15554269a849eb8e9287329');
  // WEBTITLE-209 re-froze the report bytes only: the copied web title is now wrapped in <q data-quote>.
  // c2 PR3 re-froze the report bytes only: owner Q4 (R-L14): the M12 evidence inventory now writes the full proposal label sentence; that sentence is the only byte change.
  assert.equal(sha(result.report.bytes), '40d3004d3e9f0fe621f7b615ba5e77c9c934becb78f17171c7deb801d875ce3c');
});

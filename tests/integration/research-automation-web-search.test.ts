import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [
  { position: 2, title: 'Bình giữ nhiệt nên mua', link: 'https://example.test/guide', snippet: 'So sánh dung tích', source: 'Báo Mẫu', date: '3 ngày trước' },
  { position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' },
  { position: 3, title: 'Không an toàn', link: 'javascript:alert(1)' },
];

/** Starts a run, confirms the scope (the product card when a product source exists) and stops before collection. */
async function confirmed(t: TestContext, sources: { source?: AutomationSourcePort; webSource?: AutomationSourcePort }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-web-search-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'web-search', title: 'Synthetic web search run' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, ...sources });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'bình giữ nhiệt', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const selected = sources.source ? [SYNTHETIC_CARD_ID] : [];
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: selected, peerProductIds: [], exactShopeeUrls: [] });
  const read = async () => {
    const run = await service.getRun(workspaceId, runId);
    const step = db.prepare(`SELECT state, message_code code, result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { state: string; code: string | null; sha: string | null };
    const document = step.sha ? JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument : null;
    const usage = db.prepare('SELECT ordinal, provider, operation, request_count n FROM analysis_research_automation_usage WHERE run_id=? ORDER BY ordinal').all(runId)
      .map(row => { const value = row as { ordinal: bigint | number; provider: string; operation: string; n: bigint | number }; return { ...value, ordinal: Number(value.ordinal), n: Number(value.n) }; });
    const captures = db.prepare('SELECT ordinal, provider, artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id=? ORDER BY ordinal').all(runId, 'COLLECTION')
      .map(row => { const value = row as { ordinal: bigint | number; provider: string; sha: string }; return { ...value, ordinal: Number(value.ordinal) }; });
    return { run, step, document, usage, captures };
  };
  return { service, artifacts, read };
}

async function runToDraft(t: TestContext, sources: { source?: AutomationSourcePort; webSource?: AutomationSourcePort }) {
  const f = await confirmed(t, sources);
  for (let i = 0; i < 10 && (await f.service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'DRAFT_READY');
  return { ...state, artifacts: f.artifacts };
}

test('confirmed products run one web search beside the product lane, offset past its captures', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(url => calls.push(url), organic) });
  assert.equal(calls.length, 1, 'one paid search per run');
  assert.equal(calls[0]!.searchParams.get('q'), 'bình giữ nhiệt');
  assert.equal(calls[0]!.searchParams.get('num'), '10');
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.ok(f.document);
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.provider]), [[0, 'kalodata'], [1, 'serpapi']]);
  assert.deepEqual(f.document.webResults?.map(w => [w.position, w.url, w.captureIndex]), [[2, 'https://example.test/guide', 1], [1, 'https://example.test/brand', 1]],
    'provider order is kept; the reader page sorts');
  assert.equal(f.document.webResults?.[0]?.snippet, 'So sánh dung tích');
  assert.deepEqual(f.document.webResults?.map(w => [w.site, w.published]), [['Báo Mẫu', '3 ngày trước'], [null, null]], 'page name and date are kept for citing');
  assert.ok(f.document.coverage.some(c => c.provider === 'kalodata'));
  assert.ok(f.document.coverage.some(c => c.provider === 'serpapi'));
  assert.equal((await f.artifacts.read(f.captures[1]!.sha)).toString('utf8').includes(SYNTHETIC_SERP_KEY), false, 'the key never reaches a capture');
  assert.deepEqual(f.usage.filter(u => u.provider === 'serpapi').map(u => u.n), [1]);
  assert.equal(f.run.blockers.some(b => b.code === 'SERPAPI_NOT_EXECUTED' || b.code === 'KALODATA_NOT_EXECUTED'), false);
});

test('without confirmed products the collection is skipped and no paid web search is made', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { webSource: syntheticWebSource(url => calls.push(url), organic) });
  assert.equal(calls.length, 0);
  assert.equal(f.step.state, 'SKIPPED');
  assert.equal(f.step.code, 'NO_APPROVED_PRODUCT_REFS');
  assert.deepEqual(f.usage, []);
  assert.deepEqual(f.captures, []);
});

test('a failed web search keeps the product lane, is recorded as unsettled usage, and the run still reaches a draft', async t => {
  const failing: AutomationSourcePort = { id: 'SERPAPI',
    quickSearch: async () => { throw new Error('not used'); },
    collect: async () => { throw new Error('synthetic transport failure'); } };
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: failing });
  assert.equal(f.step.state, 'PARTIAL');
  assert.equal(f.document?.webResults, undefined);
  assert.ok(f.document?.coverage.some(c => c.provider === 'kalodata'));
  assert.ok(f.document?.coverage.some(c => c.provider === 'serpapi' && c.state === 'FAILED'));
  assert.deepEqual(f.usage.filter(u => u.provider === 'serpapi').map(u => [u.operation, u.n]), [['unsettled-collection', 0]]);
  assert.deepEqual(f.captures.map(c => c.provider), ['kalodata']);
});

test('cancelling during the web search cancels the collection and keeps no web results', async t => {
  let webStarted!: () => void;
  const started = new Promise<void>(resolve => { webStarted = resolve; });
  const hanging: AutomationSourcePort = { id: 'SERPAPI',
    quickSearch: async () => { throw new Error('not used'); },
    collect: async (_input, options) => {
      webStarted();
      return new Promise<never>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
    } };
  const f = await confirmed(t, { source: syntheticProductSource(), webSource: hanging });
  const collecting = f.service.processNext();
  await started;
  const running = await f.service.getRun(workspaceId, runId);
  assert.equal(running.status, 'COLLECTING');
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: running.revision });
  await collecting;
  for (let i = 0; i < 5 && (await f.service.getRun(workspaceId, runId)).status !== 'CANCELLED'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'CANCELLED');
  assert.equal(state.step.state, 'CANCELLED');
  assert.equal(state.document?.webResults, undefined);
  assert.equal(state.run.steps.find(s => s.stepId === 'REPORTS')?.state, 'SKIPPED');
});

test('without a web source an empty product selection is still skipped without any provider call', async t => {
  const f = await runToDraft(t, {});
  assert.equal(f.step.state, 'SKIPPED');
  assert.equal(f.step.code, 'NO_APPROVED_PRODUCT_REFS');
  assert.deepEqual(f.usage, []);
  assert.ok(f.run.blockers.some(b => b.code === 'SERPAPI_NOT_EXECUTED'));
});

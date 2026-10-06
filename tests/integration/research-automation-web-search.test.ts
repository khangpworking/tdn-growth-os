import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { bindResearchAutomationProvider, type AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const serpKey = 'synthetic-serp-key-not-live';

function serpSource(onCall: (url: URL) => void, organic: unknown[]): AutomationSourcePort {
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      onCall(new URL(String(input)));
      return new Response(JSON.stringify({ organic_results: organic }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return bindResearchAutomationProvider(createResearchAutomationProviderRegistry({ kalodataSecretKey: null, serpApiKey: serpKey, apifyTokenConfigured: false }, transport).get('SERPAPI'));
}

async function runToDraft(t: TestContext, webSource?: AutomationSourcePort) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-web-search-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'web-search', title: 'Synthetic web search run' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, ...(webSource ? { webSource } : {}) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'bình giữ nhiệt', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic web-only scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  const run = await service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY');
  const step = db.prepare(`SELECT state, message_code code, result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { state: string; code: string | null; sha: string | null };
  const document = step.sha ? JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument : null;
  const usage = db.prepare('SELECT ordinal, provider, operation, request_count n FROM analysis_research_automation_usage WHERE run_id=? ORDER BY ordinal').all(runId)
    .map(row => { const value = row as { ordinal: bigint | number; provider: string; operation: string; n: bigint | number }; return { ...value, ordinal: Number(value.ordinal), n: Number(value.n) }; });
  const captures = db.prepare('SELECT ordinal, provider, artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id=? ORDER BY ordinal').all(runId, 'COLLECTION') as Array<{ ordinal: number; provider: string; sha: string }>;
  return { run, step, document, usage, captures, artifacts };
}

test('a run with no approved products still collects web search results beside the product lane', async t => {
  const calls: URL[] = [];
  const organic = [
    { position: 2, title: 'Bình giữ nhiệt nên mua', link: 'https://example.test/guide', snippet: 'So sánh dung tích' },
    { position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' },
    { position: 3, title: 'Không an toàn', link: 'javascript:alert(1)' },
  ];
  const f = await runToDraft(t, serpSource(url => calls.push(url), organic));
  assert.equal(calls.length, 1, 'one paid search per run');
  assert.equal(calls[0]!.searchParams.get('q'), 'bình giữ nhiệt');
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.ok(f.document);
  assert.deepEqual(f.document.webResults?.map(w => [w.position, w.url, w.captureIndex]), [[2, 'https://example.test/guide', 0], [1, 'https://example.test/brand', 0]], 'provider order is kept; the reader page sorts');
  assert.equal(f.document.webResults?.[0]?.snippet, 'So sánh dung tích');
  assert.ok(f.document.limitations.some(l => l.code === 'NO_APPROVED_PRODUCT_REFS'), 'product detail stays visibly unrequested');
  assert.ok(f.document.coverage.some(c => c.provider === 'serpapi'));
  assert.deepEqual(f.captures.map(c => [Number(c.ordinal), c.provider]), [[0, 'serpapi']]);
  assert.equal((await f.artifacts.read(f.captures[0]!.sha)).toString('utf8').includes(serpKey), false, 'the key never reaches a capture');
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.n]), [[2, 'serpapi', 1]]);
  assert.equal(f.run.blockers.some(b => b.code === 'SERPAPI_NOT_EXECUTED'), false);
  assert.ok(f.run.blockers.some(b => b.code === 'KALODATA_NOT_EXECUTED'));
});

test('a failed web search is recorded as unsettled usage and the run still reaches a draft', async t => {
  const failing: AutomationSourcePort = { id: 'SERPAPI',
    quickSearch: async () => { throw new Error('not used'); },
    collect: async () => { throw new Error('synthetic transport failure'); } };
  const f = await runToDraft(t, failing);
  assert.equal(f.step.state, 'FAILED');
  assert.equal(f.step.code, 'PROVIDER_FAILED');
  assert.equal(f.document?.webResults, undefined);
  assert.ok(f.document?.coverage.some(c => c.provider === 'serpapi' && c.state === 'FAILED'));
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.operation, u.n]), [[2, 'serpapi', 'unsettled-collection', 0]]);
  assert.deepEqual(f.captures, []);
});

test('without a web source an empty product selection is still skipped without any provider call', async t => {
  const f = await runToDraft(t);
  assert.equal(f.step.state, 'SKIPPED');
  assert.equal(f.step.code, 'NO_APPROVED_PRODUCT_REFS');
  assert.deepEqual(f.usage, []);
  assert.ok(f.run.blockers.some(b => b.code === 'SERPAPI_NOT_EXECUTED'));
});

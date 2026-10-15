import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ExpandedSearchSource } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { SYNTHETIC_SHARED_URL, syntheticExpandedSource, type SyntheticExpandedMode } from '../helpers/expanded-search-synthetic.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const KEYWORD = 'bình giữ nhiệt';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [{ position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' }];
const COVERED = { startDate: '2025-10-01', endDate: '2026-09-30' };
type Sources = { source?: AutomationSourcePort; webSource?: AutomationSourcePort; expandedSource?: ExpandedSearchSource };

/** Starts a run, confirms the scope (the product card when a product source exists) and stops before collection. */
async function confirmed(t: TestContext, sources: Sources, requestedPeriod: { startDate: string; endDate: string } = COVERED) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-expanded-search-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'expanded-search', title: 'Synthetic expanded search run' });
  const open = (withSources: Sources) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), ...withSources });
  const service = open(sources);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: KEYWORD, requestedPeriod, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const selected = sources.source ? [SYNTHETIC_CARD_ID] : [];
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: selected, peerProductIds: [], exactShopeeUrls: [] });
  const read = async () => {
    const run = await service.getRun(workspaceId, runId);
    const step = db.prepare(`SELECT state, message_code code, result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { state: string; code: string | null; sha: string | null };
    const document = step.sha ? JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument : null;
    const usage = db.prepare('SELECT ordinal, provider, operation, request_count n FROM analysis_research_automation_usage WHERE run_id=? AND step_id=\'COLLECTION\' ORDER BY ordinal').all(runId)
      .map(row => { const value = row as { ordinal: bigint | number; provider: string; operation: string; n: bigint | number }; return { ...value, ordinal: Number(value.ordinal), n: Number(value.n) }; });
    const captures = db.prepare('SELECT ordinal, provider, operation, artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id=? ORDER BY ordinal').all(runId, 'COLLECTION')
      .map(row => { const value = row as { ordinal: bigint | number; provider: string; operation: string; sha: string }; return { ...value, ordinal: Number(value.ordinal) }; });
    return { run, step, document, usage, captures };
  };
  return { service, artifacts, read, open };
}

async function runToDraft(t: TestContext, sources: Sources, requestedPeriod?: { startDate: string; endDate: string }) {
  const f = await confirmed(t, sources, requestedPeriod);
  for (let i = 0; i < 10 && (await f.service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'DRAFT_READY');
  return { ...state, artifacts: f.artifacts, service: f.service, open: f.open };
}

async function reportDocument(f: Awaited<ReturnType<typeof runToDraft>>) {
  const html = (await f.service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  return { html, doc: new JSDOM(html).window.document };
}


const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
void wait;

test('flag on: exactly three extra searches, own captures and ordinals 4/5/6, deduped against the plain row, labelled neutrally', async t => {
  const plain: URL[] = [], extra: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(url => plain.push(url), organic), expandedSource: syntheticExpandedSource(url => extra.push(url)) });
  assert.equal(plain.length, 1);
  assert.equal(extra.length, 3, 'three extra paid searches and no more');
  assert.deepEqual(extra.map(url => url.searchParams.get('q')), [KEYWORD, `${KEYWORD} site:shopee.vn`, `${KEYWORD} site:tiktok.com`]);
  assert.ok(extra[0]!.searchParams.get('tbs')?.startsWith('cdr:1'), 'only the first is dated');
  assert.equal(extra[1]!.searchParams.get('tbs'), null);
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.provider, c.operation]), [[0, 'kalodata', 'kalodata.product.rank'], [1, 'serpapi', 'serpapi.google.search'],
    [2, 'serpapi', 'serpapi.google.search'], [3, 'serpapi', 'serpapi.google.search'], [4, 'serpapi', 'serpapi.google.search']]);
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.n]), [[0, 'kalodata', 1], [2, 'serpapi', 1], [4, 'serpapi', 1], [5, 'serpapi', 1], [6, 'serpapi', 1]]);
  const queries = f.document!.expandedSearch!.queries;
  assert.deepEqual(queries.map(q => [q.kind, q.status, q.reason, q.captureIndex]), [['WINDOW', 'COLLECTED', null, 2], ['SHOPEE', 'COLLECTED', null, 3], ['TIKTOK', 'COLLECTED', null, 4]]);
  assert.deepEqual(queries[0]!.requestedWindow, COVERED);
  assert.equal(queries[1]!.requestedWindow, null);
  for (const q of queries) assert.deepEqual(q.results.map(r => r.url).filter(url => url === SYNTHETIC_SHARED_URL), [], 'the page already in the plain rows is not repeated');
  assert.equal(queries[0]!.results.length, 2);
  assert.equal(f.document!.webResults!.length, 1, 'plain rows are untouched');
  assert.equal(JSON.stringify(f.document).includes('origin'), false, 'the label is derived, never stored per row');

  const { html, doc } = await reportDocument(f);
  const text = doc.body.textContent ?? '';
  for (const label of ['Trong kỳ báo cáo', 'Trên Shopee', 'Trên TikTok Shop']) assert.ok(text.includes(label), label);
  assert.ok(text.includes('kỳ tìm'));
  assert.ok(html.includes('https://example.test/shopee/1'));
  assert.doesNotMatch(reportVisibleText(doc), /site:|tbs|cdr|Google|serpapi/i);
  assert.deepEqual(visibleTextViolations(reportVisibleText(doc)), []);
  assert.deepEqual(providerNameViolations(html), []);
});

test('flag off: no field, no usage row, no capture; the rest of the step document equals a flag-on run', async t => {
  const off = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  assert.equal(JSON.stringify(off.document).includes('expandedSearch'), false);
  assert.deepEqual(off.usage.map(u => u.ordinal), [0, 2]);
  assert.deepEqual(off.captures.map(c => c.ordinal), [0, 1]);
  const html = (await reportDocument(off)).html;
  for (const label of ['Trong kỳ báo cáo', 'Trên Shopee', 'Trên TikTok Shop', 'Lượt tìm']) assert.equal(html.includes(label), false);
  const on = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: syntheticExpandedSource(() => {}) });
  const { expandedSearch, ...rest } = on.document!;
  assert.ok(expandedSearch);
  assert.deepEqual(rest, off.document);
  assert.deepEqual(on.captures.slice(0, 2), off.captures);
  const again = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  assert.equal(again.step.sha, off.step.sha);
  assert.equal((await reportDocument(again)).html, html);
});

for (const mode of ['http-error', 'bad-answer'] as SyntheticExpandedMode[]) {
  test(`extra answers that are ${mode} keep the capture, record PROVIDER_FAILED, never retry and never fail the run`, async t => {
    const extra: URL[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: syntheticExpandedSource(url => extra.push(url), mode) });
    assert.equal(extra.length, 3, 'one request per kind, no retry');
    assert.equal(f.step.state, 'SUCCEEDED');
    assert.deepEqual(f.document!.expandedSearch!.queries.map(q => [q.status, q.reason, q.results.length]), [['FAILED', 'PROVIDER_FAILED', 0], ['FAILED', 'PROVIDER_FAILED', 0], ['FAILED', 'PROVIDER_FAILED', 0]]);
    assert.equal(f.document!.webResults!.length, 1, 'the plain web result is untouched');
    assert.deepEqual(f.usage.filter(u => u.ordinal >= 4).map(u => u.ordinal), [4, 5, 6]);
    const html = (await reportDocument(f)).html;
    assert.equal(html.includes('Trên Shopee'), false);
  });
}

test('a throwing extra source is recorded as unsettled usage and the run still reaches a draft', async t => {
  const failing: ExpandedSearchSource = { id: 'SERPAPI', collect: async () => { throw new Error('synthetic failure'); } };
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: failing });
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.equal(f.document!.expandedSearch, undefined, 'no attempt, nothing stored');
  assert.deepEqual(f.usage.map(u => u.ordinal), [0, 2]);
});

test('without the plain web source the extra searches are not made', async t => {
  const extra: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), expandedSource: syntheticExpandedSource(url => extra.push(url)) });
  assert.equal(extra.length, 0);
  assert.equal(f.document!.expandedSearch, undefined);
});

test('cancelling during the extra searches cancels the collection', async t => {
  let started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: ExpandedSearchSource = { id: 'SERPAPI', collect: (_input, options) => {
    started();
    return new Promise<never>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
  } };
  const f = await confirmed(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: hanging });
  const collecting = f.service.processNext();
  await reached;
  const running = await f.service.getRun(workspaceId, runId);
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: running.revision });
  await collecting;
  for (let i = 0; i < 5 && (await f.service.getRun(workspaceId, runId)).status !== 'CANCELLED'; i++) await f.service.processNext();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'CANCELLED');
});

test('a restart during the extra searches marks the run interrupted and never repeats a paid request', async t => {
  let calls = 0, release!: () => void, started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: ExpandedSearchSource = { id: 'SERPAPI', collect: () => {
    calls++; started();
    return new Promise<never>((_resolve, reject) => { release = () => reject(new Error('synthetic restart')); });
  } };
  const f = await confirmed(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: hanging });
  const collecting = f.service.processNext();
  await reached;
  await f.service.recoverOnStart();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'INTERRUPTED');
  release();
  await collecting;
  for (let i = 0; i < 5; i++) await f.service.processNext();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'INTERRUPTED');
  assert.equal(calls, 1);
});

test('a stored run with extra rows replays the same report without the extra source', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: syntheticExpandedSource(() => {}) });
  const first = (await reportDocument(f)).html;
  assert.ok(first.includes('Trên Shopee'));
  assert.equal((await f.open({}).readReport(workspaceId, runId, 'MARKET')).bytes.toString(), first);
});

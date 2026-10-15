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
import type { SearchInterestSource } from '../../src/modules/analysis/research-automation/search-interest.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { SYNTHETIC_TRENDS_KEYWORD, syntheticTrendsSource, type SyntheticTrendsMode } from '../helpers/search-interest-synthetic.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [{ position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' }];
const COVERED = { startDate: '2025-10-01', endDate: '2026-09-30' };
type Sources = { source?: AutomationSourcePort; webSource?: AutomationSourcePort; trendsSource?: SearchInterestSource };

/** Starts a run, confirms the scope (the product card when a product source exists) and stops before collection. */
async function confirmed(t: TestContext, sources: Sources, requestedPeriod: { startDate: string; endDate: string } = COVERED) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-search-interest-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'search-interest', title: 'Synthetic search interest run' });
  const open = (withSources: Sources) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), ...withSources });
  const service = open(sources);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: SYNTHETIC_TRENDS_KEYWORD, requestedPeriod, reports: ['MARKET'] });
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

test('flag on: one trends request beside the product lane, stored as its own capture, drawn once in the demand section', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => calls.push(url)) });
  assert.equal(calls.length, 1, 'one paid request per run');
  assert.deepEqual([...calls[0]!.searchParams].filter(([key]) => key !== 'api_key'),
    [['engine', 'google_trends'], ['q', SYNTHETIC_TRENDS_KEYWORD], ['data_type', 'TIMESERIES'], ['geo', 'VN'], ['hl', 'vi'], ['date', 'today 12-m']]);
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.ok(f.document);
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.provider, c.operation]), [[0, 'kalodata', 'kalodata.product.rank'], [1, 'serpapi', 'serpapi.google.trends']]);
  const interest = f.document.searchInterest;
  assert.ok(interest);
  assert.deepEqual([interest.status, interest.reason, interest.keyword, interest.geo, interest.unit, interest.window, interest.captureIndex],
    ['COLLECTED', null, SYNTHETIC_TRENDS_KEYWORD, 'VN', 'INDEX_0_100', 'LAST_12_MONTHS', 1]);
  assert.equal(interest.points.length, 52);
  assert.equal(interest.points.filter(point => point.index === null).length, 1, 'a blank week stays empty, never 0');
  assert.equal(Math.max(...interest.points.map(point => point.index ?? 0)), 100);
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.operation, u.n]), [[0, 'kalodata', 'provider.run', 1], [3, 'serpapi', 'provider.run', 1]]);
  assert.equal((await f.artifacts.read(f.captures[1]!.sha)).toString('utf8').includes(SYNTHETIC_SERP_KEY), false, 'the key never reaches a capture');

  const { html, doc } = await reportDocument(f);
  const figure = doc.querySelector('#M05 figure.market-chart')!;
  assert.ok(figure, 'the series sits in the demand section');
  assert.match(figure.querySelector('.exn')!.textContent!, /^Hình 5\.2$/);
  assert.equal(figure.querySelectorAll('.chart.flint').length, 1);
  assert.match(figure.textContent!, /chỉ số tương đối/);
  assert.match(figure.textContent!, /Không phải số lượt tìm kiếm, không phải doanh số/);
  assert.equal(doc.querySelectorAll('#M10 figure').length, 0, 'the forecast section stays without a chart');
  assert.match(doc.querySelector('#M10')!.textContent!, /Chưa đủ dữ liệu/, 'and it is not turned into a forecast');
  assert.match(figure.querySelector('.ex-src .cite')!.textContent!, /^\[\d+\]$/, 'the stored capture is cited');
  assert.doesNotMatch(html, /Google/i);
  assert.deepEqual(visibleTextViolations(reportVisibleText(doc)), []);
  assert.deepEqual(providerNameViolations(html), []);
  assert.deepEqual(citationRegisterViolations(doc), []);
});

test('flag on with the web search: the series follows the web captures and both keep their own usage rows', async t => {
  const webCalls: URL[] = [], trendsCalls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(url => webCalls.push(url), organic), trendsSource: syntheticTrendsSource(url => trendsCalls.push(url)) });
  assert.equal(webCalls.length, 1);
  assert.equal(trendsCalls.length, 1);
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.operation]), [[0, 'kalodata.product.rank'], [1, 'serpapi.google.search'], [2, 'serpapi.google.trends']]);
  assert.equal(f.document?.webResults?.[0]?.captureIndex, 1);
  assert.equal(f.document?.searchInterest?.captureIndex, 2);
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.n]), [[0, 'kalodata', 1], [2, 'serpapi', 1], [3, 'serpapi', 1]]);
  assert.equal(f.step.state, 'SUCCEEDED');
});

test('flag off: no field, no usage row, no capture, no figure; the rest of the step document equals a flag-on run', async t => {
  const off = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  assert.ok(off.document);
  assert.equal('searchInterest' in off.document, false);
  assert.equal(JSON.stringify(off.document).includes('searchInterest'), false);
  assert.deepEqual(off.usage.map(u => u.ordinal), [0, 2]);
  assert.deepEqual(off.captures.map(c => c.ordinal), [0, 1]);
  const { html } = await reportDocument(off);
  assert.equal(html.includes('Hình 5.2'), false);
  assert.equal(html.includes('Mức quan tâm tìm kiếm'), false);

  const on = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), trendsSource: syntheticTrendsSource(() => {}) });
  const { searchInterest, ...rest } = on.document!;
  assert.ok(searchInterest);
  assert.deepEqual(rest, off.document, 'the lane adds nothing but its own field');
  assert.deepEqual(on.run.blockers, off.run.blockers);
  assert.deepEqual(on.captures.slice(0, 2), off.captures);
});

test('flag off: a second identical run is byte-identical (the clock and ids are fixed)', async t => {
  const first = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  const second = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  assert.equal(first.step.sha, second.step.sha);
  assert.equal((await reportDocument(first)).html, (await reportDocument(second)).html);
});

test('a period that starts before the provider window is skipped before any paid request', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => calls.push(url)) }, { startDate: '2024-01-01', endDate: '2024-12-31' });
  assert.equal(calls.length, 0);
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual([f.document?.searchInterest?.status, f.document?.searchInterest?.reason, f.document?.searchInterest?.captureIndex, f.document?.searchInterest?.points], ['SKIPPED', 'PERIOD_NOT_COVERED', null, []]);
  assert.deepEqual(f.usage.map(u => u.ordinal), [0]);
  assert.deepEqual(f.captures.map(c => c.ordinal), [0]);
  assert.equal((await reportDocument(f)).html.includes('Hình 5.2'), false);
});

for (const [mode, reason] of [['http-error', 'PROVIDER_FAILED'], ['invalid', 'PROVIDER_FAILED'], ['thin', 'EMPTY_SERIES'],
  ['other-keyword', 'PROVIDER_FAILED'], ['no-echo', 'PROVIDER_FAILED'], ['bad-period', 'PROVIDER_FAILED'], ['repeated-period', 'PROVIDER_FAILED']] as [SyntheticTrendsMode, string][]) {
  test(`a trends answer that is ${mode} keeps the capture, records ${reason}, and never fails the run`, async t => {
    const calls: URL[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), trendsSource: syntheticTrendsSource(url => calls.push(url), mode) });
    assert.equal(calls.length, 1, 'a paid request is never repeated');
    assert.equal(f.step.state, 'SUCCEEDED', 'the series never changes the step outcome');
    assert.deepEqual([f.document?.searchInterest?.status, f.document?.searchInterest?.reason, f.document?.searchInterest?.captureIndex, f.document?.searchInterest?.points], ['FAILED', reason, 2, []]);
    assert.equal(f.document?.webResults?.length, 1, 'the web results are kept');
    assert.deepEqual(f.captures.map(c => c.provider), ['kalodata', 'serpapi', 'serpapi']);
    assert.deepEqual(f.usage.filter(u => u.ordinal === 3).map(u => [u.provider, u.n]), [['serpapi', 1]]);
    assert.equal(f.run.blockers.some(b => b.code === 'SERPAPI_NOT_EXECUTED' || b.code === 'KALODATA_NOT_EXECUTED'), false);
    const { html } = await reportDocument(f);
    assert.equal(html.includes('Hình 5.2'), false, 'a failed series is not drawn');
    assert.equal(html.includes('Mức quan tâm tìm kiếm'), false, 'and the source is not marked as used');
  });
}

test('a throwing trends source is recorded as unsettled usage and the run still reaches a draft', async t => {
  const failing: SearchInterestSource = { id: 'SERPAPI', collect: async () => { throw new Error('synthetic transport failure'); } };
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: failing });
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual([f.document?.searchInterest?.status, f.document?.searchInterest?.reason, f.document?.searchInterest?.captureIndex], ['FAILED', 'PROVIDER_FAILED', null]);
  assert.deepEqual(f.usage.filter(u => u.ordinal === 3).map(u => [u.provider, u.operation, u.n]), [['serpapi', 'unsettled-collection', 0]]);
  assert.deepEqual(f.captures.map(c => c.provider), ['kalodata']);
});

test('without confirmed products the collection is skipped and no trends request is made', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { trendsSource: syntheticTrendsSource(url => calls.push(url)) });
  assert.equal(calls.length, 0);
  assert.equal(f.step.state, 'SKIPPED');
  assert.equal(f.step.code, 'NO_APPROVED_PRODUCT_REFS');
  assert.equal(f.document?.searchInterest, undefined);
  assert.deepEqual(f.usage, []);
  assert.deepEqual(f.captures, []);
});

test('cancelling during the trends request cancels the collection and keeps no series', async t => {
  let started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: SearchInterestSource = { id: 'SERPAPI', collect: (_keyword, options) => {
    started();
    return new Promise<never>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
  } };
  const f = await confirmed(t, { source: syntheticProductSource(), trendsSource: hanging });
  const collecting = f.service.processNext();
  await reached;
  const running = await f.service.getRun(workspaceId, runId);
  assert.equal(running.status, 'COLLECTING');
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: running.revision });
  await collecting;
  for (let i = 0; i < 5 && (await f.service.getRun(workspaceId, runId)).status !== 'CANCELLED'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'CANCELLED');
  assert.equal(state.step.state, 'CANCELLED');
  assert.deepEqual(state.document?.searchInterest?.points ?? [], []);
  assert.equal(state.run.steps.find(s => s.stepId === 'REPORTS')?.state, 'SKIPPED');
});

test('a restart during the trends request marks the run interrupted and never repeats the paid request', async t => {
  let calls = 0, release!: () => void;
  let started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: SearchInterestSource = { id: 'SERPAPI', collect: () => {
    calls++; started();
    return new Promise<never>((_resolve, reject) => { release = () => reject(new Error('synthetic restart')); });
  } };
  const f = await confirmed(t, { source: syntheticProductSource(), trendsSource: hanging });
  const collecting = f.service.processNext();
  await reached;
  await f.service.recoverOnStart();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'INTERRUPTED');
  release();
  await collecting;
  for (let i = 0; i < 5; i++) await f.service.processNext();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'INTERRUPTED', 'an interrupted run is not reopened');
  assert.equal(calls, 1, 'the paid request is never repeated');
});

test('a stored run replays with and without the trends source and gives the same report bytes', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}) });
  const first = (await reportDocument(f)).html;
  assert.ok(first.includes('Hình 5.2'));
  assert.equal((await reportDocument(f)).html, first, 'reading the stored report again is stable');
  const reopened = f.open({});
  assert.equal((await reopened.readReport(workspaceId, runId, 'MARKET')).bytes.toString(), first, 'the flag is not needed to read a stored series');
});

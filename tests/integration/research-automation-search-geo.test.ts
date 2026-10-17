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
import type { SearchGeoSource } from '../../src/modules/analysis/research-automation/search-geo.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { SYNTHETIC_TRENDS_KEYWORD, syntheticTrendsSource } from '../helpers/search-interest-synthetic.js';
import { syntheticGeoSource, type SyntheticGeoMode } from '../helpers/search-geo-synthetic.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [{ position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' }];
const COVERED = { startDate: '2025-10-01', endDate: '2026-09-30' };
type Sources = { source?: AutomationSourcePort; webSource?: AutomationSourcePort; trendsSource?: SearchInterestSource; trendsGeoSource?: SearchGeoSource };

async function confirmed(t: TestContext, sources: Sources, requestedPeriod: { startDate: string; endDate: string } = COVERED) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-search-geo-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'search-geo', title: 'Synthetic search geo run' });
  const open = (withSources: Sources) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), ...withSources });
  const service = open(sources);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: SYNTHETIC_TRENDS_KEYWORD, requestedPeriod, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: sources.source ? [SYNTHETIC_CARD_ID] : [], peerProductIds: [], exactShopeeUrls: [] });
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

const geoParams = [['engine', 'google_trends'], ['q', SYNTHETIC_TRENDS_KEYWORD], ['data_type', 'GEO_MAP_0'], ['geo', 'VN'], ['hl', 'vi'], ['date', 'today 12-m']];

test('flag on: one province-map request after the series, its own capture and usage row, drawn as Bảng 5.2 with its capture cited', async t => {
  const trendsCalls: URL[] = [], geoCalls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => trendsCalls.push(url)), trendsGeoSource: syntheticGeoSource(url => geoCalls.push(url)) });
  assert.equal(trendsCalls.length, 1);
  assert.equal(geoCalls.length, 1, 'exactly one extra paid request');
  assert.deepEqual([...geoCalls[0]!.searchParams].filter(([key]) => key !== 'api_key'), geoParams);
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.provider, c.operation]),
    [[0, 'kalodata', 'kalodata.product.rank'], [1, 'serpapi', 'serpapi.google.trends'], [2, 'serpapi', 'serpapi.google.trends']]);
  const geo = f.document?.searchGeo;
  assert.ok(geo);
  assert.deepEqual([geo.status, geo.reason, geo.keyword, geo.geo, geo.unit, geo.window, geo.captureIndex], ['COLLECTED', null, SYNTHETIC_TRENDS_KEYWORD, 'VN', 'INDEX_0_100', 'LAST_12_MONTHS', 2]);
  assert.equal(geo.provinces.length, 63);
  assert.equal(geo.provinces.filter(item => item.index === null).length, 3, 'a blank province stays empty, never 0');
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.operation, u.n]), [[0, 'kalodata', 'provider.run', 1], [3, 'serpapi', 'provider.run', 1], [16, 'serpapi', 'provider.run', 1]]);
  assert.equal((await f.artifacts.read(f.captures[2]!.sha)).toString('utf8').includes(SYNTHETIC_SERP_KEY), false, 'the key never reaches a capture');

  const { html, doc } = await reportDocument(f);
  const head = [...doc.querySelectorAll('#M05 .exn')].find(item => item.textContent === 'Bảng 5.2');
  assert.ok(head, 'the region table sits in the demand section');
  const block = head.closest('.table-wrap')!;
  assert.equal(block.querySelectorAll('tbody tr').length, 6);
  assert.match(block.querySelector('.ex-src .cite')!.textContent!, /^\[\d+\]$/, 'the stored map is cited');
  const figure = doc.querySelector('#M05 figure.market-chart')!;
  assert.ok(figure.compareDocumentPosition(head) & 4, 'right after Hình 5.2');
  const text = doc.querySelector('#M05')!.textContent!.replace(/\s+/gu, ' ');
  assert.match(text, /Kết quả: vùng nổi bật là Đồng bằng sông Hồng/u);
  for (const lead of ['Thấy gì:', 'Dùng để:', 'Đừng hiểu là:']) assert.ok(text.includes(lead), lead);
  assert.doesNotMatch(html, /Google/i);
  assert.deepEqual(visibleTextViolations(reportVisibleText(doc)), []);
  assert.deepEqual(providerNameViolations(html), []);
  assert.deepEqual(citationRegisterViolations(doc), []);
});

test('flag off: no field, no usage row, no capture and no table; the rest equals a flag-on run', async t => {
  const off = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), trendsSource: syntheticTrendsSource(() => {}) });
  assert.ok(off.document);
  assert.equal(JSON.stringify(off.document).includes('searchGeo'), false);
  assert.deepEqual(off.usage.map(u => u.ordinal), [0, 2, 3]);
  assert.equal((await reportDocument(off)).html.includes('Bảng 5.2'), false);
  const calls: URL[] = [];
  const on = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: syntheticGeoSource(url => calls.push(url)) });
  assert.equal(calls.length, 1);
  const { searchGeo, ...rest } = on.document!;
  assert.equal(searchGeo?.captureIndex, 3, 'the map follows the web and series captures');
  assert.deepEqual(rest, off.document, 'the lane adds nothing but its own field');
  assert.deepEqual(on.run.blockers, off.run.blockers);
  assert.deepEqual(on.captures.slice(0, 3), off.captures);
});

test('the province map is never called without the series lane', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsGeoSource: syntheticGeoSource(url => calls.push(url)) });
  assert.equal(calls.length, 0);
  assert.equal(f.document?.searchGeo, undefined);
});

test('a period before the provider window skips the map before any paid request', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: syntheticGeoSource(url => calls.push(url)) }, { startDate: '2024-01-01', endDate: '2024-12-31' });
  assert.equal(calls.length, 0);
  assert.deepEqual([f.document?.searchGeo?.status, f.document?.searchGeo?.reason, f.document?.searchGeo?.captureIndex], ['SKIPPED', 'PERIOD_NOT_COVERED', null]);
  assert.deepEqual(f.usage.map(u => u.ordinal), [0]);
});

for (const [mode, reason] of [['http-error', 'PROVIDER_FAILED'], ['invalid', 'PROVIDER_FAILED'], ['empty', 'EMPTY_MAP'], ['other-keyword', 'PROVIDER_FAILED']] as [SyntheticGeoMode, string][]) {
  test(`a province map that is ${mode} keeps the capture, records ${reason}, and never fails the run`, async t => {
    const calls: URL[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: syntheticGeoSource(url => calls.push(url), mode) });
    assert.equal(calls.length, 1, 'never repeated');
    assert.equal(f.step.state, 'SUCCEEDED');
    assert.deepEqual([f.document?.searchGeo?.status, f.document?.searchGeo?.reason, f.document?.searchGeo?.captureIndex, f.document?.searchGeo?.provinces], ['FAILED', reason, 2, []]);
    assert.equal(f.document?.searchInterest?.status, 'COLLECTED', 'the series is kept');
    assert.deepEqual(f.usage.filter(u => u.ordinal === 16).map(u => [u.provider, u.n]), [['serpapi', 1]]);
    const { html } = await reportDocument(f);
    assert.equal(html.includes('Bảng 5.2'), false, 'a failed map is not drawn');
    assert.ok(html.includes('Hình 5.2'), 'the series is still drawn');
  });
}

test('a throwing province-map source is recorded as unsettled usage and the run still reaches a draft', async t => {
  const failing: SearchGeoSource = { id: 'SERPAPI', collect: async () => { throw new Error('synthetic transport failure'); } };
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: failing });
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual([f.document?.searchGeo?.status, f.document?.searchGeo?.reason, f.document?.searchGeo?.captureIndex], ['FAILED', 'PROVIDER_FAILED', null]);
  assert.deepEqual(f.usage.filter(u => u.ordinal === 16).map(u => [u.provider, u.operation, u.n]), [['serpapi', 'unsettled-collection', 0]]);
  assert.deepEqual(f.captures.map(c => c.ordinal), [0, 1]);
});

test('a CANCELLED provider answer without an owner abort only fails the map', async t => {
  let calls = 0;
  const underlying = syntheticGeoSource(() => { calls++; });
  const source: SearchGeoSource = { id: 'SERPAPI', collect: async (keyword, options) => ({ ...await underlying.collect(keyword, options), status: 'CANCELLED', facts: null }) };
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: source });
  assert.equal(calls, 1);
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual([f.document?.searchGeo?.status, f.document?.searchGeo?.reason], ['FAILED', 'CANCELLED']);
  assert.deepEqual(f.usage.filter(row => row.ordinal === 16).map(row => row.n), [1]);
});

test('an owner cancellation during the map still cancels collection and retains the one paid attempt', async t => {
  let calls = 0, started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const underlying = syntheticGeoSource(() => { calls++; });
  const source: SearchGeoSource = { id: 'SERPAPI', collect: async (keyword, options) => {
    const result = await underlying.collect(keyword, options);
    started();
    await new Promise<void>(resolve => options!.signal!.addEventListener('abort', () => resolve(), { once: true }));
    return { ...result, status: 'CANCELLED', facts: null };
  } };
  const f = await confirmed(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: source });
  const collecting = f.service.processNext();
  await reached;
  const running = await f.service.getRun(workspaceId, runId);
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: running.revision });
  await collecting;
  const state = await f.read();
  assert.equal(state.run.status, 'CANCELLED');
  assert.equal(state.step.state, 'CANCELLED');
  assert.equal(state.run.steps.find(step => step.stepId === 'REPORTS')?.state, 'SKIPPED');
  assert.equal(calls, 1);
  assert.deepEqual(state.usage.filter(row => row.ordinal === 16).map(row => row.n), [1]);
});

test('malformed normalized map data keeps its capture and usage without failing collection', async t => {
  const underlying = syntheticGeoSource(() => {});
  const source: SearchGeoSource = { id: 'SERPAPI', collect: async (keyword, options) => ({ ...await underlying.collect(keyword, options),
    facts: { kind: 'GEO_MAP_0', unit: 'INDEX_0_100', keyword, regions: [{ region: null, index: 40 }] } } as unknown as Awaited<ReturnType<SearchGeoSource['collect']>>) };
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: source });
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual([f.document?.searchGeo?.status, f.document?.searchGeo?.reason], ['FAILED', 'PROVIDER_FAILED']);
  assert.equal(f.captures.length, 3);
  assert.deepEqual(f.usage.filter(row => row.ordinal === 16).map(row => row.n), [1]);
});

test('a restart during the province-map request marks the run interrupted and never repeats the paid request', async t => {
  let calls = 0, release!: () => void, started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: SearchGeoSource = { id: 'SERPAPI', collect: () => {
    calls++; started();
    return new Promise<never>((_resolve, reject) => { release = () => reject(new Error('synthetic restart')); });
  } };
  const f = await confirmed(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: hanging });
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

test('a stored run reads the same report without the province-map source', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}), trendsGeoSource: syntheticGeoSource(() => {}) });
  const first = (await reportDocument(f)).html;
  assert.ok(first.includes('Bảng 5.2'));
  assert.equal((await f.open({}).readReport(workspaceId, runId, 'MARKET')).bytes.toString(), first, 'the flag is not needed to read a stored map');
});

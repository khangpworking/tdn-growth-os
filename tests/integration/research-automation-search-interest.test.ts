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
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { createSearchInterestSource, searchInterestChartPoints, searchInterestDocument, searchInterestUsage, SEARCH_INTEREST_FIGURE_TITLE, SEARCH_INTEREST_NOTE, SEARCH_INTEREST_READER_TITLE, type SearchInterestSource } from '../../src/modules/analysis/research-automation/search-interest.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { SYNTHETIC_TRENDS_KEYWORD, syntheticTrendsBody, syntheticTrendsSource, syntheticWeeks, type SyntheticTrendsMode } from '../helpers/search-interest-synthetic.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { headlineInput } from '../helpers/market-headline-fixture.js';

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
  let reportInput: Parameters<typeof buildResearchAutomationReport>[0] | undefined;
  const open = (withSources: Sources) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => { reportInput = input; return buildResearchAutomationReport(input, kind); }, ...withSources });
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
  return { service, artifacts, db, read, open, reportInput: () => reportInput };
}

async function runToDraft(t: TestContext, sources: Sources, requestedPeriod?: { startDate: string; endDate: string }) {
  const f = await confirmed(t, sources, requestedPeriod);
  for (let i = 0; i < 10 && (await f.service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'DRAFT_READY');
  return { ...state, artifacts: f.artifacts, db: f.db, service: f.service, open: f.open, reportInput: f.reportInput };
}

async function reportDocument(f: Awaited<ReturnType<typeof runToDraft>>) {
  const html = (await f.service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  return { html, doc: new JSDOM(html).window.document };
}

async function verifyStoredInterest(f: Awaited<ReturnType<typeof runToDraft>>, searchInterest: unknown) {
  // Exercise the real stored-document reader in this disposable database.
  f.db.exec('DROP TRIGGER IF EXISTS analysis_research_automation_steps_settled');
  const stored = await f.artifacts.put(Buffer.from(canonicalJson({ ...f.document, searchInterest })));
  f.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,'application/vnd.tdn.research-automation.step+json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`)
    .run(stored.sha256, stored.byteSize, stored.relativePath, now().toISOString(), now().toISOString());
  f.db.prepare("UPDATE analysis_research_automation_steps SET result_sha256=? WHERE run_id=? AND step_id='COLLECTION'").run(stored.sha256, runId);
  return f.open({}).readSourceEvidence(workspaceId, runId);
}

test('flag on: one trends request beside the product lane, stored as its own capture, drawn once in the demand section', async t => {
  const calls: URL[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => calls.push(url)) });
  assert.equal(calls.length, 1, 'one paid request per run');
  assert.deepEqual([...calls[0]!.searchParams].filter(([key]) => key !== 'api_key'),
    [['engine', 'google_trends'], ['q', SYNTHETIC_TRENDS_KEYWORD], ['data_type', 'TIMESERIES'], ['geo', 'VN'], ['hl', 'vi'], ['date', '2025-10-01 2026-09-30']]);
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.ok(f.document);
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.provider, c.operation]), [[0, 'kalodata', 'kalodata.product.rank'], [1, 'serpapi', 'serpapi.google.trends']]);
  const interest = f.document.searchInterest;
  assert.ok(interest);
  assert.deepEqual([interest.status, interest.reason, interest.keyword, interest.geo, interest.unit, interest.window, interest.captureIndex],
    ['COLLECTED', null, SYNTHETIC_TRENDS_KEYWORD, 'VN', 'INDEX_0_100', 'REQUESTED_RANGE', 1]);
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

test('SRC1 row 1: historical and current periods send their exact range and bind capture evidence', async t => {
  const identities: string[] = [];
  for (const period of [{ startDate: '2024-01-01', endDate: '2024-12-31' }, { startDate: '2025-10-03', endDate: '2026-10-02' }]) {
    const calls: URL[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => calls.push(url)) }, period);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.searchParams.get('date'), `${period.startDate} ${period.endDate}`);
    assert.notEqual(calls[0]!.searchParams.get('date'), 'today 12-m');
    const interest = f.document!.searchInterest!;
    assert.equal(interest.status, 'COLLECTED');
    assert.equal(interest.window, 'REQUESTED_RANGE');
    assert.deepEqual(interest.requestedRange, period);
    assert.equal(interest.unit, 'INDEX_0_100');
    const capture = f.captures[interest.captureIndex!]!;
    const envelope = JSON.parse((await f.artifacts.read(capture.sha)).toString());
    assert.equal(envelope.requestParameters.date, `${period.startDate} ${period.endDate}`);
    identities.push(capture.sha);
  }
  assert.notEqual(identities[0], identities[1], 'capture hash binds the requested range, even for the same response');
});

test('SRC1 row 2: tomorrow clamps to today; three days ahead skips with no paid request', async t => {
  for (const [endDate, skipped] of [['2026-10-03', false], ['2026-10-05', true]] as const) {
    const calls: URL[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => calls.push(url)) }, { startDate: '2026-09-01', endDate });
    assert.equal(calls.length, skipped ? 0 : 1);
    const interest = f.document!.searchInterest!;
    assert.equal(interest.status, skipped ? 'SKIPPED' : 'COLLECTED');
    assert.equal(interest.reason, skipped ? 'PERIOD_IN_FUTURE' : null);
    assert.deepEqual(f.usage.filter(row => row.ordinal === 3).map(row => row.n), skipped ? [] : [1]);
    if (skipped) assert.equal(interest.captureIndex, null);
    else {
      assert.equal(calls[0]!.searchParams.get('date'), '2026-09-01 2026-10-02');
      assert.deepEqual(interest.requestedRange, { startDate: '2026-09-01', endDate: '2026-10-02' });
    }
  }
});

test('SRC1 row 3: provider start is inclusive; earlier dates skip without paid requests', async t => {
  for (const [startDate, skipped] of [['2004-01-01', false], ['2003-12-31', true]] as const) {
    const calls: URL[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(url => calls.push(url)) }, { startDate, endDate: '2004-01-31' });
    assert.equal(calls.length, skipped ? 0 : 1);
    assert.equal(f.document!.searchInterest!.reason, skipped ? 'PERIOD_BEFORE_PROVIDER_START' : null);
    assert.equal(f.document!.searchInterest!.status, skipped ? 'SKIPPED' : 'COLLECTED');
    assert.deepEqual(f.usage.filter(row => row.ordinal === 3).map(row => row.n), skipped ? [] : [1]);
    if (!skipped) assert.equal(calls[0]!.searchParams.get('date'), '2004-01-01 2004-01-31');
    else assert.equal(f.document!.searchInterest!.captureIndex, null);
  }
});

test('SRC1 row 7: report source names the requested range without provider names or percentages', async t => {
  const period = { startDate: '2024-01-01', endDate: '2024-12-31' };
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}) }, period);
  const { doc } = await reportDocument(f);
  const figure = doc.querySelector('#M05 figure.market-chart')!;
  assert.ok(figure);
  const source = figure.querySelector('.ex-src')!.textContent!;
  assert.match(source, /từ 01\/01\/2024 đến 31\/12\/2024/u);
  assert.doesNotMatch(source, /12 tháng gần đây|%/u);
  assert.deepEqual(providerNameViolations(source), []);
  assert.doesNotMatch(source, /Google/i);
  assert.match(figure.textContent!, /Không phải số lượt tìm kiếm, không phải doanh số/u);
});

test('SRC1 row 6: interest verification rejects malformed ranges and incompatible windows; current and legacy documents verify', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}) });
  const current = f.document!.searchInterest!;
  const { requestedRange: range, ...withoutRange } = current;
  assert.ok(range);
  const legacy = { ...withoutRange, window: 'LAST_12_MONTHS' };
  for (const valid of [current, legacy, searchInterestDocument({ kind: 'SKIPPED', keyword: SYNTHETIC_TRENDS_KEYWORD, reason: 'PERIOD_NOT_COVERED' }, null)])
    await assert.doesNotReject(() => verifyStoredInterest(f, valid));
  for (const invalid of [
    withoutRange,
    { ...current, requestedRange: null },
    { ...current, requestedRange: { startDate: range.startDate } },
    { ...current, requestedRange: { ...range, extra: true } },
    { ...current, requestedRange: { ...range, startDate: 'not-a-date' } },
    { ...current, requestedRange: { ...range, startDate: '2024-02-30' } },
    { ...current, requestedRange: { ...range, endDate: '2023-02-29' } },
    { ...current, requestedRange: { startDate: range.endDate, endDate: range.startDate } },
    { ...legacy, requestedRange: range },
    { ...current, window: 'UNKNOWN_WINDOW' },
  ]) await assert.rejects(() => verifyStoredInterest(f, invalid), /Stored search interest is invalid/u, JSON.stringify(invalid));
});

test('SRC1 Round 3 row 2: daily captions and headlines use ngày; weekly and legacy wording is preserved', async t => {
  const daily = [20, 40, 100, 30].map((index, i) => ({ period: `2026-09-0${i + 1}`, index }));
  const headline = await headlineInput();
  for (const kind of ['daily', 'weekly', 'legacy'] as const) {
    const points = kind === 'daily' ? daily : syntheticWeeks(4, '2026-09-01');
    const source = createSearchInterestSource(SYNTHETIC_SERP_KEY, {
      fetch: (async () => new Response(syntheticTrendsBody(SYNTHETIC_TRENDS_KEYWORD, points))) as typeof fetch,
      sleep: async () => assert.fail('no wait is needed'), now: () => now().getTime(),
    });
    const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: source }, { startDate: '2026-09-01', endDate: '2026-09-30' });
    const input = f.reportInput();
    assert.ok(input?.collection?.searchInterest);
    const { requestedRange: _range, ...stored } = input.collection.searchInterest;
    const interest = kind === 'legacy' ? { ...stored, window: 'LAST_12_MONTHS' as const } : input.collection.searchInterest;
    const collection = { ...input.collection, searchInterest: interest };
    const searchInterestChart = await renderSearchInterestChart(searchInterestChartPoints(interest));
    const readerInput = sync1ReaderFixture('1.4.0');
    readerInput.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
    const reader = await buildMarketReport(computeReaderReportData(readerInput), { ...sync1Options, searchInterest: interest });
    const reports = [
      { name: 'automation', html: buildResearchAutomationReport({ ...input, collection }, 'MARKET').html.toString(), presentation: false },
      { name: 'presentation', html: buildResearchAutomationReport({ ...input, collection, marketPresentation: headline.marketPresentation!,
        metricMethods: headline.metricMethods!, marketPresentationCharts: headline.marketPresentationCharts!, searchInterestChart }, 'MARKET').html.toString(), presentation: true },
      { name: 'reader', html: reader.html, presentation: false },
    ];
    for (const report of reports) {
      const doc = new JSDOM(report.html).window.document;
      const figure = [...doc.querySelectorAll('figure')].find(node => node.hasAttribute('data-search-interest') || node.querySelector('.exn')?.textContent === 'Hình 5.2');
      assert.ok(figure, `${kind}/${report.name}: ${[...doc.querySelectorAll('figure .exn')].map(node => node.textContent).join(', ')}`);
      const title = figure.querySelector('.ext')!.textContent!;
      const note = figure.querySelector('.lim, .ex-note')!.textContent!;
      if (kind === 'daily') {
        assert.match(title, /theo ngày/u);
        assert.match(note, /chỉ so các ngày của cùng chuỗi\. Ngày thiếu số để trống/u);
        assert.doesNotMatch(title + note, /tuần/iu);
      } else {
        assert.equal(title, report.presentation ? SEARCH_INTEREST_READER_TITLE : SEARCH_INTEREST_FIGURE_TITLE);
        assert.ok(note.includes(SEARCH_INTEREST_NOTE), kind);
      }
      if (report.presentation) {
        const findings = doc.querySelector('#M01 ul.market-findings')!.textContent!;
        const unit = kind === 'daily' ? 'ngày' : 'tuần';
        assert.ok(findings.includes(`cao ở ${unit} `), findings);
        if (kind === 'daily') assert.ok(findings.includes('cao ở ngày 03/09/2026, chỉ số 100'), findings);
        assert.ok(findings.includes(`n = 4 ${unit} có số`), findings);
        assert.doesNotMatch(findings, kind === 'daily' ? /cao ở tuần|4 tuần có số/u : /cao ở ngày|4 ngày có số/u);
      }
    }
  }
});

test('SRC1 Round 4 row 1: 180 daily points preserve early peaks, nulls and order through storage, replay and rendering; legacy retains the latest 128', async t => {
  const points = Array.from({ length: 180 }, (_, i) => ({
    period: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10),
    index: i % 53 === 5 ? null : i === 3 ? 100 : i === 53 ? 0 : 20 + (i * 7) % 45,
  }));
  const range = { startDate: points[0]!.period, endDate: points.at(-1)!.period };
  const calls: URL[] = [];
  let result: Awaited<ReturnType<SearchInterestSource['collect']>> | undefined;
  const source = createSearchInterestSource(SYNTHETIC_SERP_KEY, {
    fetch: (async input => { calls.push(new URL(String(input))); return new Response(syntheticTrendsBody(SYNTHETIC_TRENDS_KEYWORD, points)); }) as typeof fetch,
    sleep: async () => assert.fail('no wait is needed'), now: () => now().getTime(),
  });
  const trendsSource: SearchInterestSource = { ...source, collect: async (...args) => { result = await source.collect(...args); return result; } };
  const f = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), trendsSource }, range);
  const interest = f.document!.searchInterest!;
  assert.equal(interest.status, 'COLLECTED');
  assert.equal(interest.window, 'REQUESTED_RANGE');
  assert.deepEqual(interest.requestedRange, range);
  assert.deepEqual(interest.points, points, 'the early peak and blanks survive beside the product and web lanes');
  assert.equal(f.document!.webResults!.length, 1);
  assert.equal(interest.captureIndex, 2);
  const retained = await f.artifacts.read(f.step.sha!);
  assert.deepEqual((JSON.parse(retained.toString()) as StepResultDocument).searchInterest!.points, points);
  await assert.doesNotReject(() => f.open({}).readSourceEvidence(workspaceId, runId), 'a fresh service validates more than 128 stored points');
  assert.deepEqual(f.reportInput()!.collection!.searchInterest!.points, points, 'the report receives the complete stored series');
  const chartPoints = searchInterestChartPoints(interest);
  assert.deepEqual(chartPoints, points.map(point => ({ label: point.period.split('-').reverse().join('/'), value: point.index })));
  assert.equal(chartPoints[3]!.value, 100);
  assert.equal(chartPoints[5]!.value, null);
  assert.equal(chartPoints[53]!.value, 0, 'zero and missing remain distinct');
  const report = await reportDocument(f);
  assert.equal((await f.open({}).readReport(workspaceId, runId, 'MARKET')).bytes.toString(), report.html);
  const headline = await headlineInput();
  const html = buildResearchAutomationReport({ ...f.reportInput()!, marketPresentation: headline.marketPresentation!,
    metricMethods: headline.metricMethods!, marketPresentationCharts: headline.marketPresentationCharts! }, 'MARKET').html.toString();
  const findings = new JSDOM(html).window.document.querySelector('#M01 ul.market-findings')!.textContent!;
  assert.ok(findings.includes('cao ở ngày 04/01/2026, chỉ số 100'), findings);
  assert.ok(findings.includes('n = 176 ngày có số'), findings);
  assert.equal((await f.artifacts.read(f.step.sha!)).equals(retained), true, 'replay and rendering preserve evidence bytes');
  assert.equal(calls.length, 1, 'replay and rendering issue no further request');
  assert.deepEqual(f.usage.filter(row => row.ordinal === 3).map(row => row.n), [1]);

  assert.ok(result);
  const legacy = searchInterestDocument({ kind: 'CALLED', keyword: SYNTHETIC_TRENDS_KEYWORD, result }, interest.captureIndex);
  assert.equal(legacy.window, 'LAST_12_MONTHS');
  assert.equal(legacy.requestedRange, undefined);
  assert.deepEqual(legacy.points, points.slice(-128), 'the custom-range allowance does not change legacy truncation');
  await assert.doesNotReject(() => verifyStoredInterest(f, legacy));
  await assert.rejects(() => verifyStoredInterest(f, { ...legacy, points }), /Stored search interest is invalid/u, 'a legacy document cannot store all 180 points');
});

test('SRC1 Round 4 row 2: 2,048 custom-range points are accepted; 2,049 fail with empty points and oversized stored documents are rejected', async t => {
  // Report starts are capped at 1,096 days; use this run only as a stored-document reader fixture.
  const f = await runToDraft(t, { source: syntheticProductSource(), trendsSource: syntheticTrendsSource(() => {}) });
  for (const count of [2048, 2049]) {
    const points = Array.from({ length: count }, (_, i) => ({
      period: new Date(Date.parse('2020-01-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10),
      index: i === 5 ? null : i === 3 ? 100 : 20 + (i * 7) % 45,
    }));
    const range = { startDate: points[0]!.period, endDate: points.at(-1)!.period };
    const calls: URL[] = [];
    const trendsSource = createSearchInterestSource(SYNTHETIC_SERP_KEY, {
      fetch: (async input => { calls.push(new URL(String(input))); return new Response(syntheticTrendsBody(SYNTHETIC_TRENDS_KEYWORD, points)); }) as typeof fetch,
      sleep: async () => assert.fail('no wait is needed'), now: () => now().getTime(),
    });
    const result = await trendsSource.collect(SYNTHETIC_TRENDS_KEYWORD, {}, range);
    assert.equal(result.status, 'OK', 'the complete provider response reaches the document boundary');
    const interest = searchInterestDocument({ kind: 'CALLED', keyword: SYNTHETIC_TRENDS_KEYWORD, result, range }, 1);
    assert.equal(calls.length, 1, String(count));
    assert.equal(calls[0]!.searchParams.get('date'), `${range.startDate} ${range.endDate}`);
    assert.equal(interest.window, 'REQUESTED_RANGE');
    assert.deepEqual(interest.requestedRange, range);
    assert.equal(interest.captureIndex, 1, 'even a rejected series retains its paid capture');
    assert.deepEqual(searchInterestUsage(result.captures).usage, { requestsIssued: 1, paidRequestsIssued: 1, ambiguousPaidRequests: 0, credits: { status: 'UNKNOWN' } });
    await assert.doesNotReject(() => verifyStoredInterest(f, interest));
    const searchInterestChart = await renderSearchInterestChart(searchInterestChartPoints(interest));
    const html = buildResearchAutomationReport({ ...f.reportInput()!, collection: { ...f.document!, searchInterest: interest }, searchInterestChart }, 'MARKET').html.toString();
    if (count === 2048) {
      assert.deepEqual([interest.status, interest.reason, interest.points], ['COLLECTED', null, points]);
      assert.deepEqual(searchInterestChartPoints(interest).map(point => point.value), points.map(point => point.index));
      assert.ok(html.includes('Hình 5.2'));
    } else {
      assert.deepEqual([interest.status, interest.reason, interest.points], ['FAILED', 'PROVIDER_FAILED', []]);
      assert.deepEqual(searchInterestChartPoints(interest), []);
      assert.equal(html.includes('Hình 5.2'), false, 'an oversized response is not silently truncated and drawn');
    }
    const stored = { ...interest, status: 'COLLECTED', reason: null, points };
    if (count === 2048) await assert.doesNotReject(() => verifyStoredInterest(f, stored));
    else await assert.rejects(() => verifyStoredInterest(f, stored), /Stored search interest is invalid/u);
  }
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

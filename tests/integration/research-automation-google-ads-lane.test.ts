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
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { brandsFromPick, chooseDomain, createGoogleAdsSource, googleAdsEnabled, searchAdsDocument, summarizeResponse, SEARCH_ADS_SOURCE_LABEL, type SearchAdsInput, type SearchAdsSource } from '../../src/modules/analysis/research-automation/google-ads-lane.js';
import { sourceEvidenceForReport, buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { buildMarketReport, computeReaderReportData, lint } from '../../src/modules/analysis/reader-report/index.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { fixture as autorunFixture, startRun as startAutorun, driveUntil, now as autorunNow } from '../helpers/autorun-harness.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const API_KEY = 'synthetic-key-0001';
const ADVERTISER = 'Nhà quảng cáo Mẫu Riêng';

const BRANDS = [
  { label: 'Thương hiệu Mẫu A', key: 'thuonghieumaua' },
  { label: 'Thương hiệu Mẫu B', key: 'thuonghieumaub' },
  { label: 'Thương hiệu Mẫu C', key: 'thuonghieumauc' },
];
const WEB = ['https://thuonghieumau-a.example.vn/san-pham', 'https://www.thuonghieumau-b.example.vn/', 'https://thuonghieumau-c.example.vn/gioi-thieu',
  'https://shopee.vn/thuonghieumau-a', 'https://thuonghieumau-d.example.vn/'];
const INPUT: SearchAdsInput = { brands: BRANDS, webUrls: WEB, periodStartDate: '2025-10-01', periodEndDate: '2026-09-30' };

// 1760000000 = 2025-10-09 (Asia/Ho_Chi_Minh), 1765000000 = 2025-12-06.
const creative = (format: string, extra: Record<string, unknown> = {}) => ({ advertiser_id: 'AR000001', advertiser: ADVERTISER, ad_creative_id: 'CR000001', image: 'https://img.example/x.png',
  link: 'https://ads.example/x', format, first_shown: '1760000000', last_shown: '1765000000', total_days_shown: '40', ...extra });
const okBody = (creatives: unknown[] = [creative('text'), creative('image'), creative('video', { total_days_shown: '12' })]) =>
  ({ search_metadata: { status: 'Success', id: 'abc' }, search_information: { total_results: creatives.length }, ad_creatives: creatives });

type Answer = { status?: number; body?: unknown; raw?: string };
function fake(answer: (url: URL, index: number) => Answer, options: { abortOnSleep?: number } = {}) {
  const urls: URL[] = [], at: number[] = [], sleeps: number[] = [];
  let clock = 1_000_000;
  const controller = new AbortController();
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url); at.push(clock);
      const a = answer(url, urls.length - 1);
      clock += 200;
      return new Response(new Uint8Array(Buffer.from(a.raw ?? JSON.stringify(a.body ?? okBody()))), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      if (options.abortOnSleep === sleeps.length) controller.abort();
      if (signal?.aborted) throw new Error('aborted');
      clock += ms;
    },
    now: () => clock,
  };
  return { transport, urls, at, sleeps, controller };
}

test('the flag is on only for the exact value "1"', () => {
  assert.equal(googleAdsEnabled({ TDN_RESEARCH_GOOGLE_ADS_ENABLED: '1' }), true);
  for (const v of [undefined, '', '0', 'true', ' 1', '1 ']) assert.equal(googleAdsEnabled({ TDN_RESEARCH_GOOGLE_ADS_ENABLED: v }), false, String(v));
});

test('no brands: NO_BRANDS and no call', async () => {
  const f = fake(() => ({}));
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect({ ...INPUT, brands: [] });
  assert.equal(result.status, 'NO_BRANDS');
  assert.equal(f.urls.length, 0);
  assert.equal(result.requests, 0);
});

test('three brands: exactly three pinned GETs, at least 2 s apart, key only on the URL and never in a capture', async () => {
  const f = fake(() => ({}));
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect(INPUT);
  assert.equal(result.status, 'OK');
  assert.equal(f.urls.length, 3);
  assert.deepEqual(f.urls.map(u => `${u.origin}${u.pathname}?${[...u.searchParams].filter(([k]) => k !== 'api_key').map(([k, v]) => `${k}=${v}`).join('&')}`), [
    'https://serpapi.com/search.json?engine=google_ads_transparency_center&region=2704&num=100&text=thuonghieumau-a.example.vn',
    'https://serpapi.com/search.json?engine=google_ads_transparency_center&region=2704&num=100&text=thuonghieumau-b.example.vn',
    'https://serpapi.com/search.json?engine=google_ads_transparency_center&region=2704&num=100&text=thuonghieumau-c.example.vn',
  ]);
  assert.ok(f.urls.every(u => u.searchParams.get('api_key') === API_KEY));
  for (let i = 1; i < f.at.length; i++) assert.ok(f.at[i]! - f.at[i - 1]! >= 2_000, `gap ${i}`);
  assert.equal(result.requests, 3);
  for (const brand of result.brands) {
    assert.equal(brand.status, 'OK');
    assert.ok(brand.capture);
    assert.equal(JSON.stringify(brand.capture, (_k, v) => typeof v === 'object' && v !== null && 'type' in v && v.type === 'Buffer' ? '[bytes]' : v).includes(API_KEY), false);
    assert.equal(brand.capture!.endpoint.includes(API_KEY), false);
  }
  const first = result.brands[0]!;
  assert.equal(first.creativeCount, 3);
  assert.deepEqual(first.formats, { text: 1, image: 1, video: 1 });
  assert.equal(first.firstShown, '2025-10-09');
  assert.equal(first.lastShown, '2025-12-06');
  assert.equal(first.maxDaysShown, 40);
});

test('four brands still make three calls', async () => {
  const f = fake(() => ({}));
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect({ ...INPUT, brands: [...BRANDS, { label: 'Thương hiệu Mẫu D', key: 'thuonghieumaud' }] });
  assert.equal(f.urls.length, 3);
  assert.equal(result.brands.length, 3);
});

test('top three distinct brands come from the pick record by revenue', () => {
  const brands = brandsFromPick({ links: [
    { brand: 'Thương hiệu Mẫu B', revenue: 50 }, { brand: 'thương hiệu mẫu a', revenue: 10 }, { brand: 'Thương hiệu Mẫu A', revenue: 90 },
    { brand: 'Thương hiệu Mẫu C', revenue: 70 }, { brand: 'Thương hiệu Mẫu D', revenue: 1 }, { brand: 'ab', revenue: 999 }, { revenue: 5 },
  ] });
  assert.deepEqual(brands.map(b => b.label), ['Thương hiệu Mẫu A', 'Thương hiệu Mẫu C', 'Thương hiệu Mẫu B']);
  assert.deepEqual(brandsFromPick(null), []);
  assert.deepEqual(brandsFromPick({ links: 'x' }), []);
});

test('no matching domain and ambiguous domain are skipped without a call', async () => {
  const f = fake(() => ({}));
  const web = ['https://thuonghieumau-a.example.vn/', 'https://thuonghieumau-a.example.com/', 'https://khac.example.vn/'];
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect({ ...INPUT, webUrls: web });
  assert.deepEqual(result.brands.map(b => b.status), ['SKIPPED_AMBIGUOUS_DOMAIN', 'SKIPPED_NO_DOMAIN', 'SKIPPED_NO_DOMAIN']);
  assert.equal(f.urls.length, 0);
  assert.equal(result.status, 'NO_DATA');
});

test('marketplace, social and deny-listed hosts are never picked', () => {
  const urls = ['https://shopee.vn/thuonghieumaua', 'https://thuonghieumaua.lazada.vn/', 'https://www.tiktok.com/@thuonghieumaua', 'https://thuonghieumaua.gov.vn/',
    'https://thuonghieumaua.facebook.com/', 'https://thuonghieumaua.example.vn/'];
  assert.deepEqual(chooseDomain('thuonghieumaua', urls), { kind: 'DOMAIN', domain: 'thuonghieumaua.example.vn' });
  assert.deepEqual(chooseDomain('thuonghieumaua', urls, ['thuonghieumaua.example.vn']), { kind: 'NONE' });
  assert.deepEqual(chooseDomain('thuonghieumaua', urls.slice(0, 5)), { kind: 'NONE' });
  for (const suffix of ['vnexpress.net', 'tuoitre.vn', 'dantri.com.vn', 'sendo.vn', 'youtube.com', 'instagram.com', 'wikipedia.org', 'edu.vn', 'gov.vn'])
    assert.deepEqual(chooseDomain('thuonghieumaua', [`https://thuonghieumaua.${suffix}/`]), { kind: 'NONE' }, suffix);
  assert.deepEqual(chooseDomain('thuonghieumaua', [...urls.slice(0, 5), ...Array(2).fill(urls[5]), 'https://thuonghieumaua.example.com/']),
    { kind: 'DOMAIN', domain: 'thuonghieumaua.example.vn' }, 'the host with more web rows wins');
});

test('provider names in brand labels and hosts cannot enter the table', () => {
  for (const name of ['Google', 'SerpApi', 'Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'PageIndex', 'Gemini', 'OpenCLI', 'G o o g l e']) {
    assert.deepEqual(brandsFromPick({ links: [{ brand: `Thương hiệu ${name}`, revenue: 1 }] }), [], name);
    assert.deepEqual(chooseDomain('thuonghieu', [`https://thuonghieu.${name.toLowerCase().replaceAll(' ', '-')}.example/`]), { kind: 'NONE' }, name);
  }
});

test('response values stay strict, invalid creatives are counted, and dates use the Vietnam calendar day', () => {
  const start = String(Date.parse('2026-09-30T17:00:00Z') / 1000);
  const end = String(Date.parse('2026-10-01T16:59:59Z') / 1000);
  const valid = creative('text', { first_shown: start, last_shown: end, total_days_shown: '1' });
  const invalid = [null, creative('banner'), creative('text', { first_shown: Number(start) }), creative('text', { first_shown: ` ${start}` }),
    creative('text', { last_shown: '1' }), creative('text', { total_days_shown: '1.5' }), creative('text', { total_days_shown: '-1' })];
  const summary = summarizeResponse(Buffer.from(JSON.stringify(okBody([valid, ...invalid]))), '2026-10-01', '2026-10-01')!;
  assert.equal(summary.creativeCount, 1);
  assert.equal(summary.invalidCount, invalid.length);
  assert.equal(summary.firstShown, '2026-10-01');
  assert.equal(summary.lastShown, '2026-10-01');
  assert.equal(summary.overlapCount, 1);
  for (const value of [null, [], { search_metadata: { status: 'Error' } }, { ...okBody(), ad_creatives: null },
    { ...okBody(), search_information: { total_results: '3' } }])
    assert.equal(summarizeResponse(Buffer.from(JSON.stringify(value)), '2026-10-01', '2026-10-01'), null);
  assert.equal(summarizeResponse(Buffer.from('{bad'), '2026-10-01', '2026-10-01'), null);
  assert.equal(summarizeResponse(Buffer.from('{"search_metadata":{"status":"Success"}}'), '2026-10-01', '2026-10-01')!.creativeCount, 0);
});

test('a non-200, bad JSON and a bad creative each continue with the next brand', async () => {
  const f = fake((_u, i) => i === 0 ? { status: 500, raw: '{"error":"x"}' } : i === 1 ? { raw: '{bad' } : { body: okBody([creative('text'), creative('banner'), creative('image', { total_days_shown: 'x' })]) });
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect(INPUT);
  assert.equal(f.urls.length, 3, 'no retry and every brand is tried');
  assert.deepEqual(result.brands.map(b => [b.status, b.reason]), [['FAILED', 'HTTP_ERROR'], ['FAILED', 'INVALID_PAYLOAD'], ['OK', null]]);
  assert.equal(result.brands[2]!.creativeCount, 1);
  assert.equal(result.brands[2]!.invalidCount, 2);
  assert.equal(result.status, 'OK');
  assert.equal(result.requests, 3, 'every call is paid');
});

test('an abort during the spacing wait gives CANCELLED and no further call', async () => {
  const f = fake(() => ({}), { abortOnSleep: 1 });
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect(INPUT, { signal: f.controller.signal });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(f.urls.length, 1);
});

test('a response that echoes the key is refused', async () => {
  const escaped = [...API_KEY].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const encoded = [...API_KEY].map(char => `%${char.charCodeAt(0).toString(16)}`).join('');
  for (const raw of [JSON.stringify({ ...okBody(), note: API_KEY }), `{"note":"${escaped}"}`, `{"error":"${encoded}"}`]) {
    const f = fake(() => ({ raw }));
    const result = await createGoogleAdsSource(API_KEY, f.transport).collect({ ...INPUT, brands: [BRANDS[0]!] });
    assert.equal(result.brands[0]!.status, 'FAILED');
    assert.equal(result.brands[0]!.reason, 'CREDENTIAL_ECHO_REFUSED');
    assert.equal(result.brands[0]!.capture!.responseBytes, null);
    assert.equal(result.brands[0]!.capture!.providerCode, null);
    assert.equal(JSON.stringify(result).includes(API_KEY), false);
  }
});

async function runToDraft(t: TestContext, make?: (transport: ProviderTransport) => SearchAdsSource, usePick = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-search-ads-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'search-ads', title: 'Synthetic search-ads run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const f = fake(() => ({}));
  // The run has no auto-run pick record, so a wrapper supplies the synthetic brands and web rows to the real lane.
  const searchAdsSource: SearchAdsSource | undefined = make ? { collect: (input, options) => make(f.transport).collect(usePick ? { ...input, brands: BRANDS, webUrls: WEB } : input, options) } : undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(),
    sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'v1' }, ...(searchAdsSource ? { searchAdsSource } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic insulated container', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const step = db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { sha: string };
  const stepBytes = (await artifacts.read(step.sha)).toString('utf8');
  const document = JSON.parse(stepBytes) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(row => { const v = row as { ordinal: bigint | number; provider: string }; return [Number(v.ordinal), v.provider]; });
  const adCaptures = Number((db.prepare("SELECT count(*) n FROM analysis_research_automation_captures WHERE run_id=? AND operation='serpapi.google_ads.transparency'").get(runId) as { n: bigint }).n);
  const html = (await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  assert.equal((await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString(), html, 'stored reports replay without another request');
  // Inspect every persisted artifact, including capture envelopes and exact response bytes.
  for (const relative of await fs.readdir(path.join(root, 'artifacts'), { recursive: true })) {
    const file = path.join(root, 'artifacts', relative);
    if ((await fs.stat(file)).isFile()) assert.equal((await fs.readFile(file)).includes(Buffer.from(API_KEY)), false, 'no key in retained artifacts');
  }
  return { document, stepBytes, usage, html, stepSha: step.sha, doc: new JSDOM(html).window.document, requests: f.urls.length, adCaptures };
}

test('flag off: no field, no usage row, no table, byte-identical reruns', async t => {
  const first = await runToDraft(t);
  const second = await runToDraft(t);
  assert.equal('searchAds' in first.document, false);
  assert.equal(first.usage.some(([ordinal]) => ordinal === 10), false);
  assert.equal(first.html.includes('Bảng 7.3'), false);
  assert.equal(first.html.includes('Quảng cáo trên công cụ tìm kiếm'), false);
  assert.equal(first.stepSha, second.stepSha);
  assert.equal(first.html, second.html);
  assert.equal(first.requests, 0);
  assert.equal(first.adCaptures, 0);
});

test('flag on: the step stores no advertiser detail and M07 shows table 7.3 after the Meta table position', async t => {
  const on = await runToDraft(t, transport => createGoogleAdsSource(API_KEY, transport));
  assert.equal(on.document.searchAds?.status, 'OK');
  assert.equal(on.document.searchAds?.brands.length, 3);
  assert.ok(on.usage.some(([ordinal, provider]) => ordinal === 10 && provider === 'serpapi'));
  for (const secret of [ADVERTISER, 'AR000001', 'CR000001', 'img.example', 'ads.example', API_KEY]) assert.equal(on.stepBytes.includes(secret), false, secret);
  assert.equal(on.html.includes(ADVERTISER), false);
  assert.equal(on.requests, 3);
  assert.equal(on.adCaptures, 3);
  assert.ok(on.doc.querySelector('#M13')!.textContent!.includes(SEARCH_ADS_SOURCE_LABEL));
  const s17 = [...on.doc.querySelectorAll('#M13 .source-evidence tbody tr')].filter(row => row.firstElementChild?.textContent === 'S17');
  assert.equal(s17.length, 3, 'each retained ad response has its S17 source binding');
  const section = on.doc.querySelector('#M07')!;
  const table = [...section.querySelectorAll('.table-wrap, figure')].find(node => /Bảng 7\.3/u.test(node.textContent!));
  assert.ok(table, 'table 7.3 sits in M07');
  const text = table!.textContent!;
  assert.ok(text.includes('Quảng cáo trên công cụ tìm kiếm (thư viện quảng cáo công khai)'));
  for (const column of ['Thương hiệu', 'Trang web', 'Số mẫu quảng cáo', 'Chữ / Hình / Video', 'Hiện lần đầu – lần cuối', 'Số ngày hiện của mẫu dài ngày']) assert.ok(text.includes(column), column);
  assert.ok(text.includes('thuonghieumau-a.example.vn'));
  assert.ok(text.includes('09/10/2025 – 06/12/2025'));
  assert.equal(text.includes('%'), false);
  assert.equal(/\bGoogle\b/iu.test(on.html), false);
  assert.equal(/serpapi/iu.test(on.html), false);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.deepEqual(visibleTextViolations(reportVisibleText(on.doc)), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(on.html));
  assert.deepEqual(auditMarketReportHtml(on.html).filter(check => !check.ok), []);
});

test('manual runs have NO_BRANDS, no paid call, and a clear notice without a table or used source', async t => {
  const run = await runToDraft(t, transport => createGoogleAdsSource(API_KEY, transport), false);
  assert.equal(run.document.searchAds?.status, 'NO_BRANDS');
  assert.equal(run.requests, 0);
  assert.equal(run.usage.some(([ordinal]) => ordinal === 10), false);
  assert.doesNotMatch(run.doc.querySelector('#M07')!.textContent!, /Bảng 7\.3/u);
  assert.match(run.doc.querySelector('#M07')!.textContent!, /chưa có thương hiệu/u);
  assert.doesNotMatch(run.doc.querySelector('#M13')!.textContent!, /S17/u);
});

test('collection reads the real auto-run pick and only this run\'s plain web rows', async t => {
  const fixture = await autorunFixture(t);
  const autoRunId = await startAutorun(fixture.service);
  await driveUntil(fixture.service, () => (fixture.db.prepare('SELECT status FROM analysis_research_automation_runs WHERE run_id=?').get(autoRunId) as { status: string }).status === 'COLLECTION_QUEUED');
  const artifacts = new ContentAddressedArtifactStore(fixture.artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db: fixture.db, artifactStore: artifacts });
  const f = fake(() => ({}));
  const urls = ['https://branda.example/own', 'https://brandb.example/own', 'https://brandc.example/own', 'https://brandd.example/unused'];
  const lane = createGoogleAdsSource(API_KEY, f.transport);
  const service = new ResearchAutomationService({ db: fixture.db, artifactStore: artifacts, now: autorunNow,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: syntheticProductSource(),
    webSource: syntheticWebSource(() => {}, urls.map((link, i) => ({ position: i + 1, title: 'Trang thử', link }))),
    searchAdsSource: { collect: async (input, options) => {
      assert.deepEqual(input.brands.map(brand => [brand.label, brand.key]), [['Brand A', 'branda'], ['Brand B', 'brandb'], ['Brand C', 'brandc']]);
      assert.deepEqual(input.webUrls, urls);
      return lane.collect(input, options);
    } },
  });
  await service.processNext();
  assert.equal(f.urls.length, 3);
  assert.deepEqual(f.urls.map(url => url.searchParams.get('text')), ['branda.example', 'brandb.example', 'brandc.example']);
  const step = fixture.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(autoRunId) as { sha: string };
  assert.equal(JSON.parse((await artifacts.read(step.sha)).toString()).searchAds.status, 'OK');
  const activity = await service.readSourceActivity(workspaceId);
  assert.equal(activity['search-ads-library'].dataCount, 1, 'activity counts stored steps, not brands');
  assert.equal(activity['search-ads-library'].lastUsageAt, autorunNow().toISOString());
  await service.recoverOnStart();
  assert.equal(f.urls.length, 3, 'restart never repeats paid calls');
});

test('provider failures cannot persist key-bearing errors or response bytes', async t => {
  for (const failure of ['ECHO', 'THROW'] as const) {
    const run = await runToDraft(t, transport => createGoogleAdsSource(API_KEY, {
      ...transport,
      fetch: (async () => {
        if (failure === 'THROW') throw new Error(`request failed: api_key=${API_KEY}`);
        return new Response(JSON.stringify({ error: API_KEY }), { status: 403 });
      }) as typeof fetch,
    }));
    assert.equal(run.document.searchAds?.status, 'NO_DATA');
    assert.ok(run.document.searchAds?.brands.every(brand => brand.status === 'FAILED'));
    assert.equal(run.html.includes(API_KEY), false);
  }
});

test('S17 evidence requires its own capture and only adds sources for drawn Market rows', async () => {
  const f = fake(() => ({}));
  const collected = await createGoogleAdsSource(API_KEY, f.transport).collect(INPUT);
  const searchAds = searchAdsDocument(collected, [0, 1, 2]);
  const packet = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = { collection: { searchAds }, captures: collected.brands.map((brand, ordinal) => ({ stepId: 'COLLECTION', ordinal,
    artifactSha256: String(ordinal + 1).repeat(64), mediaType: 'application/json', provider: 'serpapi', operation: 'serpapi.google_ads.transparency',
    retrievedAt: brand.capture!.completedAt, window: null, truncated: false })) } as unknown as Parameters<typeof sourceEvidenceForReport>[1];
  const market = sourceEvidenceForReport(packet, input, 'MARKET');
  assert.deepEqual(market.sourceAppendix.rows.map(row => [row.registryId, row.reportName, row.tier]), Array(3).fill(['S17', SEARCH_ADS_SOURCE_LABEL, 'B']));
  assert.deepEqual(sourceEvidenceForReport(market, input, 'MARKET'), market);
  assert.deepEqual(sourceEvidenceForReport(packet, input, 'INSIGHT'), packet);
  for (const captures of [[], input.captures!.map(c => ({ ...c, operation: 'serpapi.google.search' })), input.captures!.map(c => ({ ...c, truncated: true }))])
    assert.throws(() => sourceEvidenceForReport(packet, { ...input, captures }, 'MARKET'), /Search ads capture lineage/);
  const failed = { ...searchAds, status: 'NO_DATA' as const, brands: [] };
  assert.deepEqual(sourceEvidenceForReport(packet, { collection: { searchAds: failed } } as unknown as Parameters<typeof sourceEvidenceForReport>[1], 'MARKET'), packet);
});

test('current reader template shows table 7.3 and the M13 source with clean empty values', async () => {
  const f = fake(() => ({ body: { search_metadata: { status: 'Success' } } }));
  const searchAds = searchAdsDocument(await createGoogleAdsSource(API_KEY, f.transport).collect({ ...INPUT,
    brands: INPUT.brands.map(brand => ({ ...brand, label: `${brand.label} Nhất` })) }), [0, 1, 2]);
  const input = sync1ReaderFixture('1.4.0');
  input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const report = await buildMarketReport(computeReaderReportData(input), { ...sync1Options, searchAds });
  const baseline = await buildMarketReport(computeReaderReportData(input), sync1Options);
  const doc = new JSDOM(report.html).window.document;
  const table = [...doc.querySelectorAll('#phan-7 .ex')].find(node => node.querySelector('.exn')?.textContent === 'Bảng 7.3')!;
  assert.ok(table);
  assert.match(table.textContent!, /không có/u);
  assert.doesNotMatch(table.textContent!, /\b0\b|%|Google|SerpApi/iu);
  assert.ok(doc.querySelector('#phu-luc')!.textContent!.includes(SEARCH_ADS_SOURCE_LABEL));
  assert.ok(lint(report.html, { visibleTextRules: true }).every(check => check.ok));
  assert.deepEqual(providerNameViolations(report.html), []);
  assert.deepEqual(auditMarket14(report.html).filter(check => !check.ok).map(check => check.rule),
    auditMarket14(baseline.html).filter(check => !check.ok).map(check => check.rule), 'S17 introduces no fourteen-rule failures');
});

test('flag on, nothing readable: one plain sentence, no table', async t => {
  const f = fake(() => ({ status: 500, raw: '{}' }));
  const on = await runToDraft(t, () => createGoogleAdsSource(API_KEY, f.transport));
  assert.equal(on.document.searchAds?.status, 'NO_DATA');
  assert.equal(on.html.includes('Bảng 7.3'), false);
  assert.match(on.doc.querySelector('#M07')!.textContent!, /chưa lấy được số liệu/u);
});

test('original brand names containing comparative words remain quoted in rows and skip notices', async t => {
  const run = await runToDraft(t, transport => {
    const lane = createGoogleAdsSource(API_KEY, transport);
    return { collect: (input, options) => lane.collect({ ...input, brands: [
      { label: 'Thương hiệu Mẫu Nhất', key: BRANDS[0]!.key }, { label: 'Thương hiệu Mẫu Nhất Nhất', key: 'missingbrand' },
    ] }, options) };
  });
  assert.match(run.doc.querySelector('#M07')!.textContent!, /Thương hiệu Mẫu Nhất Nhất: chưa tìm thấy/u);
  assert.deepEqual(auditMarketReportHtml(run.html).filter(check => !check.ok), []);
});

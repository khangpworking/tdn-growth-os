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
import { brandsFromPick, chooseDomain, createGoogleAdsSource, googleAdsEnabled, type SearchAdsInput, type SearchAdsSource } from '../../src/modules/analysis/research-automation/google-ads-lane.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
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
  const f = fake(() => ({ raw: JSON.stringify({ ...okBody(), note: API_KEY }) }));
  const result = await createGoogleAdsSource(API_KEY, f.transport).collect({ ...INPUT, brands: [BRANDS[0]!] });
  assert.equal(result.brands[0]!.status, 'FAILED');
  assert.equal(result.brands[0]!.reason, 'CREDENTIAL_ECHO_REFUSED');
});

async function runToDraft(t: TestContext, make?: (transport: ProviderTransport) => SearchAdsSource) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-search-ads-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'search-ads', title: 'Synthetic search-ads run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const f = fake(() => ({}));
  // The run has no auto-run pick record, so a wrapper supplies the synthetic brands and web rows to the real lane.
  const searchAdsSource: SearchAdsSource | undefined = make ? { collect: (input, options) => make(f.transport).collect({ ...input, brands: BRANDS, webUrls: WEB }, options) } : undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(), ...(searchAdsSource ? { searchAdsSource } : {}) });
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
  const html = (await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  return { document, stepBytes, usage, html, stepSha: step.sha, doc: new JSDOM(html).window.document, requests: f.urls.length };
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
});

test('flag on: the step stores no advertiser detail and M07 shows table 7.3 after the Meta table position', async t => {
  const on = await runToDraft(t, transport => createGoogleAdsSource(API_KEY, transport));
  assert.equal(on.document.searchAds?.status, 'OK');
  assert.equal(on.document.searchAds?.brands.length, 3);
  assert.ok(on.usage.some(([ordinal, provider]) => ordinal === 10 && provider === 'serpapi'));
  for (const secret of [ADVERTISER, 'AR000001', 'CR000001', 'img.example', 'ads.example', API_KEY]) assert.equal(on.stepBytes.includes(secret), false, secret);
  assert.equal(on.html.includes(ADVERTISER), false);
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

test('flag on, nothing readable: one plain sentence, no table', async t => {
  const f = fake(() => ({ status: 500, raw: '{}' }));
  const on = await runToDraft(t, () => createGoogleAdsSource(API_KEY, f.transport));
  assert.equal(on.document.searchAds?.status, 'NO_DATA');
  assert.equal(on.html.includes('Bảng 7.3'), false);
  assert.match(on.doc.querySelector('#M07')!.textContent!, /chưa lấy được số liệu/u);
});

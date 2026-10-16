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
import { comtradeEnabled, createComtradeSource, type ComtradeModelPort, type ComtradeSource } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const INPUT = { keyword: 'bình giữ nhiệt', description: null, mode: 'CATEGORY', periodEndDate: '2026-09-30' } as const;
const OFFICIAL = 'Vacuum flasks and other vacuum vessels, complete with cases; parts thereof other than glass inners';

type Row = { reporter: string; value: number };
type Answer = { status?: number; rows?: Row[] };
/** Fake data endpoint plus fake clock: requests are answered from `answer(url, index)` and every wait is recorded, never slept. */
function fake(answer: (url: URL, index: number) => Answer, options: { abortOnSleep?: number } = {}) {
  const urls: URL[] = [], at: number[] = [], sleeps: number[] = [];
  let clock = 1_000_000;
  const controller = new AbortController();
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url); at.push(clock);
      const a = answer(url, urls.length - 1);
      const rows = (a.rows ?? []).map(r => ({ period: Number(url.searchParams.get('period')), reporterDesc: r.reporter, flowCode: url.searchParams.get('flowCode'),
        cmdCode: url.searchParams.get('cmdCode'), cmdDesc: OFFICIAL, primaryValue: r.value }));
      clock += 200;
      return new Response(new Uint8Array(Buffer.from(JSON.stringify({ count: rows.length, data: rows }))), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
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
function fakeModel(options: { candidates?: string[]; covers?: boolean } = {}): ComtradeModelPort & { asked: string[] } {
  const asked: string[] = [];
  return { asked, generateText: async request => {
    asked.push(request.systemText);
    if (request.systemText.includes('map a product')) return JSON.stringify({ candidates: options.candidates ?? ['961700'] });
    return JSON.stringify({ covers: options.covers ?? true, reasonVi: 'Sản phẩm thuộc nhóm bình chân không.', descriptionVi: 'Bình chân không đủ vỏ và các bộ phận' });
  } };
}
const MIRROR: Row[] = [{ reporter: 'China', value: 162_100_000 }, { reporter: 'Malaysia', value: 13_400_000 }, { reporter: 'Thailand', value: 12_800_000 }];
const standard = (url: URL): Answer => {
  const own = url.searchParams.get('reporterCode') === '704';
  return { rows: own ? [{ reporter: 'Viet Nam', value: url.searchParams.get('flowCode') === 'M' ? 5_000_000 : 7_000_000 }] : MIRROR };
};

test('the flag is on only for the exact value "1"', () => {
  assert.equal(comtradeEnabled({ TDN_RESEARCH_COMTRADE_ENABLED: '1' }), true);
  for (const v of [undefined, '', '0', 'true', ' 1', '1 ']) assert.equal(comtradeEnabled({ TDN_RESEARCH_COMTRADE_ENABLED: v }), false, String(v));
});

test('happy path: four pinned GETs, mirror first, at least 6 s apart', async () => {
  const f = fake(standard);
  const result = await createComtradeSource({ model: fakeModel(), transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'OK');
  assert.deepEqual(f.urls.map(u => `${u.origin}${u.pathname}?${u.searchParams.toString()}`), [
    'https://comtradeapi.un.org/public/v1/preview/C/A/HS?partnerCode=704&period=2025&cmdCode=961700&flowCode=X&includeDesc=true',
    'https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=704&partnerCode=0&period=2025&cmdCode=961700&flowCode=M&includeDesc=true',
    'https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=704&partnerCode=0&period=2025&cmdCode=961700&flowCode=X&includeDesc=true',
  ]);
  for (let i = 1; i < f.at.length; i++) assert.ok(f.at[i]! - f.at[i - 1]! >= 6_000, `gap ${i}`);
  assert.equal(result.hsCode, '961700');
  assert.equal(result.officialDescription, OFFICIAL);
  assert.equal(result.calls.length, 3);
  assert.equal(result.mirrorReporterCount, 3);
  assert.ok(f.urls.length <= 4);
});

test('an empty mirror year steps back once to Y-1', async () => {
  const f = fake((url, i) => i === 0 ? { rows: [] } : standard(url));
  const result = await createComtradeSource({ model: fakeModel(), transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'OK');
  assert.deepEqual(f.urls.slice(0, 2).map(u => u.searchParams.get('period')), ['2025', '2024']);
  assert.ok(f.at[1]! - f.at[0]! >= 6_000);
  assert.ok(f.urls.length <= 4);
});

test('a 429 waits 65 s and repeats once', async () => {
  const f = fake((url, i) => i === 1 ? { status: 429 } : standard(url));
  const result = await createComtradeSource({ model: fakeModel(), transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'OK');
  assert.ok(f.sleeps.includes(65_000));
  assert.equal(f.urls[1]!.href, f.urls[2]!.href, 'the repeat is the same request');
  assert.ok(f.at[2]! - f.at[1]! >= 65_000);
  assert.equal(f.urls.length, 4, 'the repeat counts against the four-call cap');
});

test('a second 429 gives RATE_LIMITED and keeps the rows already read', async () => {
  const f = fake((url, i) => i >= 1 ? { status: 429 } : standard(url));
  const result = await createComtradeSource({ model: fakeModel(), transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'RATE_LIMITED');
  assert.equal(f.sleeps.filter(ms => ms === 65_000).length, 1, 'only one long wait');
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0]!.rows.length, 3);
});

test('HS rejection: HS_CODE_NOT_CONFIRMED and no figures', async () => {
  const f = fake(standard);
  const result = await createComtradeSource({ model: fakeModel({ covers: false }), transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'HS_CODE_NOT_CONFIRMED');
  assert.equal(result.hsCode, null);
  assert.deepEqual(result.calls, []);
});

test('an abort during a wait gives CANCELLED', async () => {
  const f = fake(standard, { abortOnSleep: 1 });
  const result = await createComtradeSource({ model: fakeModel(), transport: f.transport }).collect(INPUT, { signal: f.controller.signal });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(f.urls.length, 1, 'nothing is requested after the abort');
});

test('no model configured: no request is made', async () => {
  const f = fake(standard);
  const result = await createComtradeSource({ transport: f.transport }).collect(INPUT);
  assert.equal(result.status, 'MODEL_NOT_CONFIGURED');
  assert.equal(f.urls.length, 0);
});

async function runToDraft(t: TestContext, comtradeSource?: ComtradeSource) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-comtrade-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'comtrade', title: 'Synthetic comtrade run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(), ...(comtradeSource ? { comtradeSource } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'bình giữ nhiệt', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const step = db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { sha: string };
  const document = JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(row => { const v = row as { ordinal: bigint | number; provider: string }; return [Number(v.ordinal), v.provider]; });
  const html = (await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  return { document, usage, html, doc: new JSDOM(html).window.document };
}

test('flag off: no field, no usage row, no table', async t => {
  const off = await runToDraft(t);
  assert.equal('comtrade' in off.document, false);
  assert.equal(off.usage.some(([, provider]) => provider === 'comtrade'), false);
  for (const marker of ['Bảng 6.2', 'Thương mại Liên Hợp Quốc', 'Comtrade']) assert.equal(off.html.includes(marker), false, marker);
});

test('flag on: M06 shows the table with no total, no percent sign, no provider name and no "Google"', async t => {
  const f = fake(standard);
  const on = await runToDraft(t, createComtradeSource({ model: fakeModel(), transport: f.transport }));
  assert.equal(on.document.comtrade?.status, 'OK');
  assert.ok(on.usage.some(([ordinal, provider]) => ordinal === 9 && provider === 'comtrade'));
  const section = on.doc.querySelector('#M06')!;
  const table = [...section.querySelectorAll('.table-wrap, figure')].find(node => /Bảng 6\.2/u.test(node.textContent!));
  assert.ok(table, 'the table sits in M06');
  const text = table!.textContent!;
  assert.match(text, /961700/u);
  assert.match(text, /China/u);
  assert.equal(/tổng|total/iu.test(text), false, 'no total row');
  assert.equal(text.includes('%'), false);
  assert.doesNotMatch(on.html, /Google/i);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.deepEqual(visibleTextViolations(reportVisibleText(on.doc)), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(on.html));
  assert.deepEqual(auditMarketReportHtml(on.html).filter(check => !check.ok), []);
});

test('flag on, HS rejected: the report prints no numbers from this source', async t => {
  const f = fake(standard);
  const on = await runToDraft(t, createComtradeSource({ model: fakeModel({ covers: false }), transport: f.transport }));
  assert.equal(on.document.comtrade?.status, 'HS_CODE_NOT_CONFIRMED');
  assert.deepEqual(on.document.comtrade?.rows, []);
  assert.equal(on.html.includes('Bảng 6.2'), false);
  for (const marker of ['Malaysia', 'Thailand', '961700']) assert.equal(on.html.includes(marker), false, marker);
  assert.match(on.doc.querySelector('#M06')!.textContent!, /Chưa xác định chắc chắn mã hàng/u);
});

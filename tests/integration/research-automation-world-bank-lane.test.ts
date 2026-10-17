import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, validWorldBank } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { createWorldBankSource, type WorldBankSource } from '../../src/modules/analysis/research-automation/world-bank-lane.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [{ position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' }];
type Sources = { source?: AutomationSourcePort; webSource?: AutomationSourcePort; worldBankSource?: WorldBankSource };

const CODES = ['NE.CON.PRVT.PC.KD', 'SP.POP.TOTL'] as const;
const VALUES: Record<string, string[]> = { 'NE.CON.PRVT.PC.KD': ['null', '1234.5', '1000', ...Array.from({ length: 63 }, () => '900')], 'SP.POP.TOTL': ['98000000', '97000000'] };
type Mode = 'ok' | 'http-error' | 'transport' | 'timeout' | 'oversize' | 'identity' | 'wrong-indicator' | 'no-rows';
/** The real lane over a synthetic transport; `modes` picks the answer per requested URL. */
function syntheticWorldBank(calls: { url: URL; init: RequestInit | undefined }[], modes: Record<string, Mode> = {}): WorldBankSource {
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const code = CODES.find(c => url.pathname.endsWith(`/${c}`))!;
      const mode = modes[url.pathname] ?? modes[code] ?? 'ok';
      const raw = worldBankFixture(mode === 'wrong-indicator' ? CODES.find(c => c !== code)! : code, VALUES[code]);
      const body = url.pathname.includes('/country/') ? raw.observations : raw.metadata;
      const json = (value: string | Buffer, status = 200) => new Response(new Uint8Array(Buffer.from(value)), { status, headers: { 'content-type': 'application/json' } });
      if (mode === 'http-error') return json('{}', 500);
      if (mode === 'transport') throw new TypeError('synthetic network failure');
      if (mode === 'timeout') return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('synthetic timeout')), { once: true }));
      if (mode === 'oversize') return json(Buffer.alloc(8 * 1024 * 1024 + 1, 32));
      if (mode === 'identity') return json(body.toString().replace('"VN"', '"US"'));
      if (mode === 'no-rows') return json(body.toString().replace(/"value":"?[0-9.]+"?/gu, '"value":null'));
      return json(body);
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return createWorldBankSource(transport, 50);
}

async function confirmed(t: TestContext, sources: Sources) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-world-bank-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'world-bank', title: 'Synthetic world bank run' });
  const open = (withSources: Sources) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), ...withSources });
  const service = open(sources);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'bình giữ nhiệt', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
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

async function runToDraft(t: TestContext, sources: Sources) {
  const f = await confirmed(t, sources);
  for (let i = 0; i < 10 && (await f.service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'DRAFT_READY');
  return { ...state, artifacts: f.artifacts, service: f.service, open: f.open };
}

async function reportDocument(f: Awaited<ReturnType<typeof runToDraft>>) {
  const html = (await f.service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  return { html, doc: new JSDOM(html).window.document };
}

test('flag on: four pinned GETs, both pairs stored as captures, one table in the demand section', async t => {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: syntheticWorldBank(calls) });
  assert.deepEqual(calls.map(c => c.url.href), CODES.flatMap(code => [`https://api.worldbank.org/v2/country/VN/indicator/${code}?format=json&per_page=100`, `https://api.worldbank.org/v2/indicator/${code}?format=json`]));
  for (const c of calls) { assert.equal(c.init?.method, 'GET'); assert.equal(c.init?.redirect, 'error'); assert.deepEqual(c.init?.headers, { accept: 'application/json' }); }
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual(f.captures.map(c => [c.ordinal, c.provider, c.operation]), [[0, 'kalodata', 'kalodata.product.rank'],
    [1, 'world-bank', 'worldbank.observations'], [2, 'world-bank', 'worldbank.metadata'], [3, 'world-bank', 'worldbank.observations'], [4, 'world-bank', 'worldbank.metadata']]);
  assert.deepEqual(f.usage.map(u => [u.ordinal, u.provider, u.n]), [[0, 'kalodata', 1], [7, 'world-bank', 4]]);
  const bank = f.document?.worldBank;
  assert.ok(bank);
  assert.deepEqual(bank.indicators.map(i => [i.code, i.status, i.captureIndex, i.metadataCaptureIndex, i.row?.year, i.row?.value]),
    [['NE.CON.PRVT.PC.KD', 'COLLECTED', 1, 2, '2024', '1234.5'], ['SP.POP.TOTL', 'COLLECTED', 3, 4, '2025', '98000000']], 'the latest non-null year, never carried forward');
  const envelope = JSON.parse((await f.artifacts.read(f.captures[1]!.sha)).toString('utf8')) as { responseBytesBase64: string };
  assert.equal(Buffer.from(envelope.responseBytesBase64, 'base64').equals(worldBankFixture('NE.CON.PRVT.PC.KD', VALUES['NE.CON.PRVT.PC.KD']).observations), true, 'the raw bytes are what is stored');

  const { html, doc } = await reportDocument(f);
  const table = [...doc.querySelectorAll('#M05 .table-wrap, #M05 figure')].find(node => /Bối cảnh vĩ mô cả nước/u.test(node.textContent!));
  assert.ok(table, 'the table sits in the demand section');
  assert.equal(doc.querySelectorAll('#M10 table').length === 0 || !/Bối cảnh vĩ mô cả nước/u.test(doc.querySelector('#M10')!.textContent!), true, 'the forecast section stays without it');
  const text = table!.textContent!;
  assert.match(text, /Ngân hàng Thế giới \(World Bank Open Data\)/u);
  assert.match(text, /CC BY 4\.0/u);
  assert.match(text, /1\.234,5/u);
  assert.match(text, /98\.000\.000/u);
  assert.match(text, /2024/u);
  assert.match(text, /2026-07-13/u, 'the update date is shown');
  assert.match(text, /cả nước Việt Nam, chỉ để làm nền/u);
  assert.match(text, /không so sánh được với số liệu mẫu/u);
  assert.match(text, /nguồn chưa ghi đơn vị/u, 'a missing unit is stated, not invented');
  assert.match(text, /Synthetic estimate note/u, 'the status text is the source own');
  assert.equal(/ước tính/u.test(text.replace(/Synthetic estimate note/u, '')), false, 'no "estimate" label is inferred');
  assert.match(table!.querySelector('.ex-src, .cite')!.outerHTML, /./u);
  assert.ok(table!.querySelectorAll('.cite').length >= 2, 'each row is cited');
  assert.equal(/[÷×]/u.test(text), false, 'no arithmetic sign');
  assert.doesNotMatch(html, /Google/i);
  assert.deepEqual(visibleTextViolations(reportVisibleText(doc)), []);
  assert.deepEqual(providerNameViolations(html), []);
  assert.deepEqual(citationRegisterViolations(doc), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(html), 'the presentation gate passes with S23 drawn');
  const gate = auditMarketReportHtml(html);
  assert.deepEqual(gate.filter(check => !check.ok), []);
  assert.ok(gate.some(check => check.rule === 'WORLD_BANK_NOT_ARITHMETIC' && check.ok), 'the extra check runs once the block is drawn');
  const off = await runToDraft(t, { source: syntheticProductSource() });
  const failing = (page: string) => auditMarket14(page).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  const baseline = failing((await reportDocument(off)).html);
  assert.deepEqual(failing(html).filter(rule => !baseline.includes(rule)), [], 'S23 adds no machine-rule failure the same synthetic report does not already have without it');
});

test('flag on: a 10-year series is stored with gaps kept, ends at the table row, and is drawn as Flint Hình 5.3/5.4 after Bảng 5.3', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: syntheticWorldBank([]) });
  const [pc, pop] = f.document!.worldBank!.indicators;
  assert.deepEqual(pc!.series, Array.from({ length: 10 }, (_, i) => ({ year: String(2015 + i), value: i === 9 ? '1234.5' : i === 8 ? '1000' : '900' })), 'ten years ending at the latest non-null year; the null 2025 is outside the window');
  assert.deepEqual(pop!.series, [{ year: '2024', value: '97000000' }, { year: '2025', value: '98000000' }]);
  for (const item of [pc!, pop!]) assert.deepEqual(item.series!.at(-1), { year: item.row!.year, value: item.row!.value });
  const bank = f.document!.worldBank!;
  assert.equal(validWorldBank(bank), true);
  const old = { ...bank, indicators: bank.indicators.map(({ series: _series, ...rest }) => rest) };
  assert.equal(validWorldBank(old), true, 'a document stored before the series existed still validates');
  const gap = { ...bank, indicators: bank.indicators.map(item => ({ ...item, series: item.series!.map((point, i) => i === 0 ? { ...point, value: null } : point) })) };
  assert.equal(validWorldBank(gap), true, 'a null year inside the window is kept');
  const off = (series: unknown) => validWorldBank({ ...bank, indicators: [{ ...bank.indicators[0]!, series }, bank.indicators[1]] });
  assert.equal(off([...pc!.series!.slice(0, 9), { year: '2024', value: '1' }]), false, 'the last point must equal the table row');
  assert.equal(off([{ year: '2013', value: '1' }, ...pc!.series!]), false, 'never more than ten years');
  assert.equal(off([pc!.series![0], pc!.series![9]]), false, 'years are consecutive');
  assert.equal(off([]), false);
  assert.equal(validWorldBank({ ...bank, indicators: [{ ...bank.indicators[0]!, status: 'FAILED', reason: 'HTTP_ERROR', row: null, retrievedAt: null, captureIndex: null, metadataCaptureIndex: null, sourceSha256: null, metadataSha256: null }] }), false, 'a failed indicator carries no series');
  const { html, doc } = await reportDocument(f);
  const figs = [...doc.querySelectorAll('#M05 figure')].filter(node => /Hình 5\.[34]/u.test(node.textContent!));
  assert.equal(figs.length, 2);
  for (const node of figs) {
    assert.equal(node.querySelector('.chart')!.getAttribute('data-engine'), 'flint');
    assert.match(node.textContent!, /Ngân hàng Thế giới/u);
    assert.match(node.textContent!, /không so sánh được với số liệu mẫu/u);
    assert.doesNotMatch(node.textContent!, /%|Google/u);
  }
  assert.ok(html.indexOf('Bảng 5.3') < html.indexOf('Hình 5.3'));
  assert.deepEqual(visibleTextViolations(reportVisibleText(doc)), [], 'tick labels never read as a long digit run');
  assert.deepEqual(auditMarketReportHtml(html).filter(check => !check.ok), []);
  // This synthetic run has no presentation block (rule 11 already fails on its icons), so compare with the same run without S23.
  const failing = (page: string) => auditMarket14(page, undefined, { requireFlint: true }).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  const baseline = failing((await reportDocument(await runToDraft(t, { source: syntheticProductSource() }))).html);
  assert.deepEqual(failing(html).filter(rule => !baseline.includes(rule)), [], 'the figures add no machine-rule failure under requireFlint');
});

test('the evidence packet marks S23 as used only for what is drawn', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: syntheticWorldBank([]) });
  const { html } = await reportDocument(f);
  assert.equal((html.match(/Ngân hàng Thế giới \(World Bank Open Data\)/gu) ?? []).length >= 3, true);
  const off = await runToDraft(t, { source: syntheticProductSource() });
  assert.equal((await reportDocument(off)).html.includes('World Bank'), false);
});

test('flag off: no field, no usage row, no capture, no table; the rest of the step document equals a flag-on run', async t => {
  const off = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  assert.ok(off.document);
  assert.equal('worldBank' in off.document, false);
  assert.deepEqual(off.usage.map(u => u.ordinal), [0, 2]);
  assert.deepEqual(off.captures.map(c => c.ordinal), [0, 1]);
  const { html } = await reportDocument(off);
  for (const marker of ['Bảng 5.3', 'Bối cảnh vĩ mô', 'World Bank']) assert.equal(html.includes(marker), false, marker);
  assert.equal(auditMarketReportHtml(html).some(check => check.rule === 'WORLD_BANK_NOT_ARITHMETIC'), false, 'the rule list is unchanged');

  const on = await runToDraft(t, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), worldBankSource: syntheticWorldBank([]) });
  const { worldBank, ...rest } = on.document!;
  assert.ok(worldBank);
  assert.deepEqual(rest, off.document, 'the lane adds nothing but its own field');
  assert.deepEqual(on.captures.slice(0, 2), off.captures);
});

test('flag off: a second identical run is byte-identical', async t => {
  const first = await runToDraft(t, { source: syntheticProductSource() });
  const second = await runToDraft(t, { source: syntheticProductSource() });
  assert.equal(first.step.sha, second.step.sha);
  assert.equal((await reportDocument(first)).html, (await reportDocument(second)).html);
});

for (const [mode, reason] of [['http-error', 'HTTP_ERROR'], ['transport', 'TRANSPORT'], ['timeout', 'TIMEOUT'], ['oversize', 'FILE_SIZE_LIMIT'],
  ['identity', 'SOURCE_IDENTITY_MISMATCH'], ['wrong-indicator', 'INDICATOR_NOT_ALLOWED'], ['no-rows', 'NO_OBSERVATION']] as [Mode, string][]) {
  test(`one ${mode} answer drops that indicator with a reason code; the other one is still drawn and nothing is repaired`, async t => {
    const calls: { url: URL; init: RequestInit | undefined }[] = [];
    const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: syntheticWorldBank(calls, { 'NE.CON.PRVT.PC.KD': mode }) });
    assert.equal(f.step.state, 'SUCCEEDED', 'a dropped indicator never fails the step');
    const [dropped, kept] = f.document!.worldBank!.indicators;
    assert.deepEqual([dropped!.status, dropped!.captureIndex, dropped!.row], ['FAILED', null, null]);
    assert.ok(dropped!.reason === reason || (mode === 'identity' || mode === 'wrong-indicator' || mode === 'no-rows') && typeof dropped!.reason === 'string', `${mode} gave ${dropped!.reason}`);
    assert.equal(kept!.status, 'COLLECTED');
    assert.ok(calls.length <= 4, 'never more than the four pinned requests');
    assert.equal(f.captures.filter(c => c.provider === 'world-bank').length, 2, 'only the inspected pair is stored');
    const { html } = await reportDocument(f);
    assert.match(html, /98\.000\.000/u);
    assert.equal(html.includes('Chi tiêu tiêu dùng hộ gia đình'), false, 'the dropped indicator is not drawn');
  });
}

test('every indicator dropped: no table, no source row, no usage claim of S23, run still reaches a draft', async t => {
  const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: syntheticWorldBank([], { 'NE.CON.PRVT.PC.KD': 'http-error', 'SP.POP.TOTL': 'transport' }) });
  assert.deepEqual(f.document!.worldBank!.indicators.map(i => [i.status, i.reason]), [['FAILED', 'HTTP_ERROR'], ['FAILED', 'TRANSPORT']]);
  const { html } = await reportDocument(f);
  assert.equal(html.includes('Bảng 5.3'), false);
  assert.equal(html.includes('World Bank'), false);
});

test('a throwing source is recorded as unsettled usage and the run still reaches a draft', async t => {
  const failing: WorldBankSource = { collect: async () => { throw new Error('synthetic failure'); } };
  const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: failing });
  assert.equal(f.step.state, 'SUCCEEDED');
  assert.deepEqual(f.document!.worldBank!.indicators.map(i => [i.status, i.reason]), [['FAILED', 'PROVIDER_FAILED'], ['FAILED', 'PROVIDER_FAILED']]);
  assert.deepEqual(f.usage.filter(u => u.ordinal === 7).map(u => [u.provider, u.operation, u.n]), [['world-bank', 'unsettled-collection', 0]]);
});

test('a restart during the fetch marks the run interrupted and never repeats the request', async t => {
  let calls = 0, release!: () => void, started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: WorldBankSource = { collect: () => { calls++; started(); return new Promise<never>((_resolve, reject) => { release = () => reject(new Error('synthetic restart')); }); } };
  const f = await confirmed(t, { source: syntheticProductSource(), worldBankSource: hanging });
  const collecting = f.service.processNext();
  await reached;
  await f.service.recoverOnStart();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'INTERRUPTED');
  release();
  await collecting;
  for (let i = 0; i < 5; i++) await f.service.processNext();
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'INTERRUPTED', 'an interrupted run is not reopened');
  assert.equal(calls, 1);
});

test('cancelling during the fetch cancels the collection and keeps nothing', async t => {
  let started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const hanging: WorldBankSource = { collect: options => { started(); return new Promise<never>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true })); } };
  const f = await confirmed(t, { source: syntheticProductSource(), worldBankSource: hanging });
  const collecting = f.service.processNext();
  await reached;
  const running = await f.service.getRun(workspaceId, runId);
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: running.revision });
  await collecting;
  for (let i = 0; i < 5 && (await f.service.getRun(workspaceId, runId)).status !== 'CANCELLED'; i++) await f.service.processNext();
  const state = await f.read();
  assert.equal(state.run.status, 'CANCELLED');
  assert.equal(state.document?.worldBank?.indicators.some(i => i.status === 'COLLECTED') ?? false, false);
});

test('a stored run replays without a fetch and gives the same report bytes with or without the source', async t => {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const f = await runToDraft(t, { source: syntheticProductSource(), worldBankSource: syntheticWorldBank(calls) });
  const first = (await reportDocument(f)).html;
  assert.ok(first.includes('Bảng 5.3'));
  const before = calls.length;
  assert.equal((await reportDocument(f)).html, first);
  const reopened = f.open({});
  assert.equal((await reopened.readReport(workspaceId, runId, 'MARKET')).bytes.toString(), first, 'the flag is not needed to read a stored table');
  assert.equal(calls.length, before, 'reading never fetches');
});

test('the gate refuses a sentence that adds a country figure to a sales figure', () => {
  const base = `<html><body><section id="M05"><p>Dân số cả nước cộng với doanh thu của mẫu là một con số.</p></section></body></html>`;
  const checks = auditMarketReportHtml(base, { presentation: false });
  assert.equal(checks.find(check => check.rule === 'WORLD_BANK_NOT_ARITHMETIC')?.ok, false);
  const negated = base.replace('cộng với', 'không cộng với');
  assert.equal(auditMarketReportHtml(negated, { presentation: false }).find(check => check.rule === 'WORLD_BANK_NOT_ARITHMETIC')?.ok, true);
});

test('WORLD_BANK_NOT_ARITHMETIC: subtraction, derivation and comparison words refuse; negated disclaimers, dates and ranges pass; the search-interest rule is unchanged', () => {
  const verdict = (rule: string, text: string) => auditMarketReportHtml(`<html><body><section id="M05"><p>${text}</p></section></body></html>`, { presentation: false }).find(check => check.rule === rule)?.ok;
  const wb = (text: string) => verdict('WORLD_BANK_NOT_ARITHMETIC', text);
  for (const text of ['Dân số cả nước trừ doanh thu của mẫu.', 'Dân số cả nước có hiệu số với doanh thu của mẫu.', 'Dân số cả nước chênh lệch doanh thu của mẫu.', 'Dân số cả nước bớt doanh thu của mẫu.',
    'Dân số cả nước \u2212 doanh thu của mẫu 5.', 'Dân số cả nước 5 - 3 doanh thu của mẫu.', 'Dân số cả nước bình quân doanh thu của mẫu.', 'Dân số cả nước đầu người doanh thu của mẫu.',
    'Dân số cả nước trên mỗi người doanh thu của mẫu.', 'Dân số cả nước mỗi người doanh thu của mẫu.', 'Dân số cả nước thị phần doanh thu của mẫu.', 'Dân số cả nước quy mô thị trường doanh thu của mẫu.',
    'Dân số cả nước so với doanh thu của mẫu.', 'Dân số cả nước so sánh doanh thu của mẫu.'])
    assert.equal(wb(text), false, text);
  for (const text of ['Dân số cả nước không so sánh được với doanh thu của mẫu.', 'Dân số cả nước không trừ doanh thu của mẫu.', 'Dân số cả nước năm 2024-10 và doanh thu của mẫu 10-20 tuần.',
    'Dân số cả nước chỉ là nền, tách khỏi doanh thu của mẫu.', 'Chi tiêu tiêu dùng hộ gia đình bình quân đầu người ghi riêng.'])
    assert.equal(wb(text), true, text);
  // S20 stays as it was: a subtraction word with the search index and a sales term is not newly flagged.
  assert.equal(verdict('SEARCH_INTEREST_NOT_COUNT', 'Mức quan tâm tìm kiếm trừ doanh thu của mẫu.'), true);
  assert.equal(verdict('SEARCH_INTEREST_NOT_COUNT', 'Mức quan tâm tìm kiếm cộng doanh thu của mẫu.'), false);
});

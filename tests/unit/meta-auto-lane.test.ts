import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { normalizedKey } from '../../src/modules/analysis/research-automation/google-ads-lane.js';
import { assertMarket14MachineRules, auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import {
  classifyFinalUrl, chooseMetaPage, metaBrandKey, metaBrandsFromPick, metaPageCandidates, createMetaAutoSource, META_AUTO_LOGGED_IN_REASON, META_AUTO_MAX_BRANDS, META_AUTO_MAX_OPENS, META_AUTO_SAME_DAY, META_AUTO_SESSION, META_AUTO_SOURCE_LABEL,
  META_AUTO_SPACING_MS, META_AUTO_TABLE_TITLE, metaAutoDocument, metaAutoEnabled, metaAutoReportView, metaAutoUsage, metaLibraryUrlKind, metaPageUrl, metaSearchUrl,
  parseMetaAdPage, validMetaAuto, type MetaAutoClock, type MetaAutoReportView,
} from '../../src/modules/analysis/research-automation/meta-auto-lane.js';
import type { MetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { runMetricCapture } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import { withOpenCliBrowserLock } from '../../src/modules/analysis/research-automation/opencli-browser-lock.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

// Synthetic pages only: no real page, brand, ad or network call. The fake runner never starts a process.
const brand = (label: string) => ({ label, key: normalizedKey(label)! });
const A = brand('Thương hiệu Mẫu A');
const B = brand('Thương hiệu Mẫu B');
const C = brand('Thương hiệu Mẫu C');
const NOW = new Date('2026-10-17T03:00:00.000Z');

const searchHtml = (pages: ReadonlyArray<{ id: string; name: string }>): string => `<html><body>${pages.map(p =>
  `<div><a href="/ads/library/?view_all_page_id=${p.id}&country=VN">${p.name}</a><script>{"page_name":"${p.name}"}</script></div>`).join('<hr>')}</body></html>`;
const pageText = (ads: ReadonlyArray<{ id: string; status?: string; start?: string }>): string => `~${ads.length} results\n${ads.map(ad =>
  `${ad.status ?? 'Active'}\nLibrary ID: ${ad.id}\nStarted running on ${ad.start ?? '1 Mar 2026'}\nPlatforms\n`).join('\n')}`;

interface Page { readonly finalUrl?: string; readonly html: string; readonly text: string }
interface World {
  readonly pages: Map<string, Page>;
  readonly calls: string[][];
  readonly opensAt: number[];
  readonly sleeps: number[];
  readonly envs: Array<Readonly<Record<string, string | undefined>>>;
  readonly options: Array<{ shell: unknown; detached: unknown }>;
  failOn?: (argv: readonly string[]) => 'EXIT' | 'ENVELOPE' | 'THROW' | null;
  onSleep?: () => void;
  chunkSize?: number;
  extractUrl?: string;
  t: number;
}
function world(pages: Record<string, Page> = {}): World {
  return { pages: new Map(Object.entries(pages)), calls: [], opensAt: [], sleeps: [], envs: [], options: [], t: 1_000_000 };
}
function source(w: World, extra: { maxBrands?: number } = {}) {
  let current: Page | null = null, currentUrl = '';
  const runner: MetricOpenCliProcessRunner = async (executable, argv, options) => {
    assert.equal(executable, 'opencli');
    w.calls.push([...argv]); w.envs.push(options.env); w.options.push({ shell: options.shell, detached: options.detached });
    const fail = w.failOn?.(argv) ?? null;
    if (fail === 'THROW') throw new Error('spawn failed');
    const args = argv.slice(2, -2);
    let stdout = '';
    if (args[0] === 'open') { w.opensAt.push(w.t); currentUrl = args[1]!; current = w.pages.get(args[1]!) ?? { html: '<html></html>', text: '' }; }
    else if (args[0] === 'get' && args[1] === 'url') stdout = current?.finalUrl ?? currentUrl;
    else if (args[0] === 'get' && args[1] === 'html') stdout = current?.html ?? '';
    else if (args[0] === 'extract') {
      const start = Number(args[2]); const text = current?.text ?? '';
      const size = w.chunkSize ?? 50;
      const chunk = text.slice(start, start + size);
      stdout = JSON.stringify({ url: w.extractUrl ?? current?.finalUrl ?? currentUrl, content: chunk, next_start_char: start + size < text.length ? start + size : null });
    }
    if (fail === 'ENVELOPE') stdout = JSON.stringify({ error: { code: 'X', message: 'synthetic' } });
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: fail === 'EXIT' ? 1 : 0, stdout, stderr: '' }) };
  };
  const clock: MetaAutoClock = { monotonicMs: () => w.t, sleep: async ms => { w.sleeps.push(ms); w.onSleep?.(); w.t += ms; } };
  return createMetaAutoSource({ createRunner: () => runner, clock, now: () => NOW, env: { PATH: '/usr/bin', SECRET_TOKEN: 'never-passed' }, ...extra });
}
const opens = (w: World): string[] => w.calls.filter(c => c[2] === 'open').map(c => c[3]!);
const closes = (w: World): number => w.calls.filter(c => c[2] === 'close').length;

/** Brand A and B each have one exact-name page with readable ads. */
function twoBrandWorld(overrides: Record<string, Page> = {}): World {
  return world({
    [metaSearchUrl(A.label)]: { html: searchHtml([{ id: '111', name: A.label }, { id: '999', name: 'Cửa hàng khác' }]), text: 'Kết quả tìm kiếm' },
    [metaPageUrl('111')]: { html: '<html></html>', text: pageText([{ id: '5000000001' }, { id: '5000000002', status: 'Inactive', start: 'Apr 10, 2026' }]) },
    [metaSearchUrl(B.label)]: { html: searchHtml([{ id: '222', name: B.label }]), text: 'Kết quả' },
    [metaPageUrl('222')]: { html: '<html></html>', text: pageText([{ id: '5000000003', start: '5 thg 9, 2026' }]) },
    [metaSearchUrl(C.label)]: { html: searchHtml([{ id: '333', name: C.label }]), text: 'Kết quả' },
    [metaPageUrl('333')]: { html: '<html></html>', text: pageText([{ id: '5000000004' }]) },
    ...overrides,
  });
}

test('the flag is on only for the exact value "1"', () => {
  assert.equal(metaAutoEnabled({ TDN_RESEARCH_META_AUTO_ENABLED: '1' }), true);
  for (const v of [undefined, '', '0', 'true', ' 1', '1 ', 'yes']) assert.equal(metaAutoEnabled({ TDN_RESEARCH_META_AUTO_ENABLED: v }), false, String(v));
});

test('flag off: the API builds no lane, and an empty brand list never spawns', async () => {
  const api = await fs.readFile(new URL('../../src/api/research-automation-api.ts', import.meta.url), 'utf8');
  assert.match(api, /const metaAutoSource = configuration\.metaAuto \? createMetaAutoSource\(\) : undefined;/u);
  const operator = await fs.readFile(new URL('../../src/api/operator-app.ts', import.meta.url), 'utf8');
  assert.match(operator, /metaAutoEnabled\(environment\) \? \{ researchMetaAuto: true as const \} : \{\}/u);
  const w = world();
  const result = await source(w).collect({ brands: [] });
  assert.equal(result.status, 'NO_BRANDS');
  assert.equal(w.calls.length, 0);
  assert.equal(result.opens, 0);
});

test('two brands: four opens at least 30 s apart, background window and session on every call, close always called', async () => {
  const w = twoBrandWorld();
  const result = await source(w).collect({ brands: [A, B, C] });
  assert.equal(result.status, 'OK');
  assert.equal(result.opens, 4);
  assert.deepEqual(opens(w), [metaSearchUrl(A.label), metaPageUrl('111'), metaSearchUrl(B.label), metaPageUrl('222')], 'only the first two brands are read');
  for (let i = 1; i < w.opensAt.length; i++) assert.ok(w.opensAt[i]! - w.opensAt[i - 1]! >= META_AUTO_SPACING_MS, `gap ${i}`);
  for (const call of w.calls) {
    assert.deepEqual(call.slice(0, 2), ['browser', META_AUTO_SESSION]);
    assert.deepEqual(call.slice(-2), ['--window', 'background']);
    assert.ok(!call.some(arg => /^(click|type|fill|press|login|eval)$/u.test(arg)), call.join(' '));
  }
  assert.ok(w.options.every(o => o.shell === false && o.detached === true));
  assert.ok(w.envs.every(env => env.SECRET_TOKEN === undefined && env.PATH === '/usr/bin'), 'only the allow-listed environment');
  assert.equal(closes(w), 1);
  assert.equal(w.calls.at(-1)![2], 'close');
  const [a, b] = result.brands;
  assert.equal(a!.status, 'OK'); assert.equal(a!.pageId, '111');
  assert.deepEqual(a!.ads.map(ad => [ad.libraryId, ad.status, ad.startedOn]), [['5000000001', 'ACTIVE', '2026-03-01'], ['5000000002', 'INACTIVE', '2026-04-10']]);
  assert.deepEqual(b!.ads.map(ad => ad.startedOn), ['2026-09-05'], 'Vietnamese date form');
  assert.equal(result.reads.length, 4);
  assert.ok(result.reads.every(r => r.read.retained && r.text !== null && r.fingerprint !== null));
  assert.equal(JSON.stringify(result).includes('<html'), false, 'raw HTML is never kept');
  const doc = metaAutoDocument(result, { packageId: 'p', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) });
  assert.equal(validMetaAuto(doc), true);
  assert.deepEqual(metaAutoUsage(result.opens).usage, { requestsIssued: 4, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } });
});

test('the fifth open is the last: a third brand gets its search but no page open', async () => {
  const w = twoBrandWorld();
  const result = await source(w, { maxBrands: 3 }).collect({ brands: [A, B, C] });
  assert.equal(result.opens, META_AUTO_MAX_OPENS);
  assert.equal(opens(w).length, 5);
  assert.equal(opens(w).includes(metaPageUrl('333')), false);
  assert.equal(result.brands[2]!.status, 'NOT_READ');
  assert.equal(result.brands[2]!.pageId, '333');
  assert.equal(closes(w), 1);
});

test('a wrong host, path, scheme or extra key is rejected', () => {
  assert.equal(metaLibraryUrlKind(metaSearchUrl(A.label)), 'SEARCH');
  assert.equal(metaLibraryUrlKind(metaPageUrl('123')), 'PAGE');
  for (const url of [
    metaSearchUrl(A.label).replace('www.facebook.com', 'facebook.com'), metaSearchUrl(A.label).replace('www.facebook.com', 'www.facebook.com.example'),
    metaSearchUrl(A.label).replace('https:', 'http:'), metaSearchUrl(A.label).replace('/ads/library/', '/ads/library/x/'), `${metaSearchUrl(A.label)}&extra=1`,
    `${metaPageUrl('123')}&q=x`, `${metaPageUrl('123')}#top`, metaPageUrl('123').replace('www.facebook.com', 'www.facebook.com:8443'),
    'https://www.facebook.com/ads/library/?view_all_page_id=abc&country=VN', 'https://www.facebook.com/ads/library/?view_all_page_id=1&country=US', 'not a url',
  ]) assert.equal(metaLibraryUrlKind(url), null, url);
  assert.throws(() => metaPageUrl('12a'));
  assert.equal(classifyFinalUrl('https://www.facebook.com/login/?next=x'), 'LOGIN_REQUIRED');
  assert.equal(classifyFinalUrl('https://www.facebook.com/checkpoint/123'), 'CAPTCHA');
  assert.equal(classifyFinalUrl('https://example.com/ads/library/'), 'BLOCKED');
  assert.equal(classifyFinalUrl(metaPageUrl('1')), null);
});

test('final URLs enforce the full allow-list and stay bound to the requested page, including extract chunks', async () => {
  for (const finalUrl of [`${metaSearchUrl(A.label)}&extra=1`, metaPageUrl('999'),
    metaSearchUrl(A.label).replace('/ads/library/', '/ads/library-other/'), 'https://example.com/login/']) {
    assert.equal(classifyFinalUrl(finalUrl), finalUrl === metaPageUrl('999') ? null : 'BLOCKED');
    const w = twoBrandWorld({ [metaSearchUrl(A.label)]: { finalUrl, html: '', text: 'diagnostic' } });
    const result = await source(w).collect({ brands: [A, B] });
    assert.equal(result.stop, 'BLOCKED');
    assert.equal(result.opens, 1);
    assert.equal(closes(w), 1);
  }
  const w = twoBrandWorld();
  w.extractUrl = `${metaSearchUrl(A.label)}&unexpected=1`;
  const result = await source(w).collect({ brands: [A, B] });
  assert.equal(result.stop, 'BLOCKED');
  assert.equal(result.opens, 1);
});

test('logged-out navigation and script tokens are not login or captcha walls', async () => {
  const ordinary = '<button name="login">Log in</button><script>const captcha = { checkpoint: "/checkpoint/", name: "login" }; const markup = \'<form id="login_form">\';</script>';
  const w = twoBrandWorld({ [metaPageUrl('111')]: { html: ordinary, text: `Log in\n${pageText([{ id: '5000000001' }])}` } });
  const result = await source(w).collect({ brands: [A, B] });
  assert.equal(result.status, 'OK');
  assert.equal(result.opens, 4);
});

test('a known wall or redirect still stops if a later diagnostic command fails', async () => {
  const cases: Array<[Page, string, (argv: readonly string[]) => boolean]> = [
    [{ html: '<form id="login_form"></form>', text: '' }, 'LOGIN_REQUIRED', argv => argv[2] === 'extract'],
    [{ finalUrl: 'https://example.com/', html: '', text: '' }, 'BLOCKED', argv => argv[2] === 'get' && argv[3] === 'html'],
    [{ html: '', text: 'Please solve this captcha\n' + 'x'.repeat(100) }, 'CAPTCHA', argv => argv[2] === 'extract' && argv[4] !== '0'],
  ];
  for (const [page, stop, fails] of cases) {
    const w = twoBrandWorld({ [metaSearchUrl(A.label)]: page });
    w.failOn = argv => fails(argv) ? 'EXIT' : null;
    const result = await source(w).collect({ brands: [A, B] });
    assert.equal(result.stop, stop);
    assert.equal(result.status, 'STOPPED');
    assert.equal(result.opens, 1);
    assert.equal(closes(w), 1);
  }
});

test('page discovery binds names to their own ids and preserves Vietnamese diacritics', () => {
  const markup = '<a href="/ads/library/?view_all_page_id=111&country=VN">Thương hiệu Mẫu Khác</a>'
    + '<script>{"page_name":"Thương hiệu Mẫu A"}</script>';
  assert.deepEqual(chooseMetaPage(metaBrandKey(A.label), metaPageCandidates(markup)), { kind: 'NONE' });
  const paired = '<script>{"page_id":"111","page_name":"Thương hiệu Mẫu A"}</script>';
  assert.deepEqual(chooseMetaPage(metaBrandKey(A.label), metaPageCandidates(paired)), { kind: 'PAGE', pageId: '111' });
  assert.deepEqual(chooseMetaPage(metaBrandKey('Thạch dừa'), [{ pageId: '111', name: 'Thạch dứa' }]), { kind: 'NONE' });
  assert.deepEqual(chooseMetaPage(metaBrandKey('Thạch dừa'), [{ pageId: '111', name: 'Thach dua' }]), { kind: 'NONE' });
});

test('brand selection takes the top two distinct pick brands by revenue, with a diacritic-preserving key', () => {
  const pick = { links: [
    { brand: 'Thương hiệu Mẫu C', revenue: 5 },
    { brand: A.label, revenue: 90 },
    { brand: ` ${A.label} `, revenue: 80 },
    { brand: 'Thuong hieu Mau A', revenue: 70 },
    { brand: B.label, revenue: 60 },
    { brand: 'Có 50% giảm', revenue: 99 },
    { brand: 42, revenue: 100 },
    { revenue: 100 },
  ] };
  assert.deepEqual(metaBrandsFromPick(pick), [{ label: A.label, key: metaBrandKey(A.label) }, { label: B.label, key: metaBrandKey(B.label) }]);
  assert.equal(metaBrandsFromPick(pick)[0]!.key, 'thương hiệu mẫu a');
  assert.ok(metaBrandsFromPick(pick).length <= META_AUTO_MAX_BRANDS);
  assert.deepEqual(metaBrandsFromPick({ links: [{ brand: B.label }, { brand: A.label, revenue: 1 }] }).map(b => b.label), [A.label, B.label]);
  for (const missing of [null, undefined, {}, { links: 'x' }, { links: [] }]) assert.deepEqual(metaBrandsFromPick(missing), []);
});

test('pick revenue ties keep pick order and missing revenue sorts after every finite revenue', () => {
  for (const revenue of [undefined, null, NaN, Infinity, '100']) {
    assert.deepEqual(metaBrandsFromPick({ links: [
      { brand: C.label, revenue }, { brand: B.label, revenue: -2 }, { brand: A.label, revenue: -2 },
    ] }).map(b => b.label), [B.label, A.label]);
  }
});

test('pick brands refuse unsafe report labels before applying the two-brand cap', () => {
  const refused = ['Google', 'SerpApi', 'Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'PageIndex', 'Gemini', 'OpenCLI', 'Có 50% giảm', 'Nhãn\u0000thử'];
  assert.deepEqual(metaBrandsFromPick({ links: [
    ...refused.map(brand => ({ brand, revenue: 999 })), { brand: B.label, revenue: 2 }, { brand: A.label, revenue: 1 },
  ] }).map(b => b.label), [B.label, A.label]);
});

test('parser retains literal UTF-8 spans and refuses conflicting repeated ids', () => {
  const text = 'Nhãn tiếng Việt\nĐang hoạt động\nID thư viện: 000001\nBắt đầu chạy từ 12 tháng 10, 2026\n';
  const result = parseMetaAdPage(text + text);
  assert.ok(result.ok);
  const ad = result.page.ads[0]!;
  assert.equal(result.page.ads.length, 1);
  const bytes = Buffer.from(text + text);
  assert.equal(bytes.subarray(ad.idSpan.start, ad.idSpan.end).toString(), '000001');
  assert.equal(bytes.subarray(ad.statusSpan!.start, ad.statusSpan!.end).toString(), 'Đang hoạt động');
  assert.equal(bytes.subarray(ad.startSpan!.start, ad.startSpan!.end).toString(), '12 tháng 10, 2026');
  assert.equal(ad.startedOn, '2026-10-12');
  const conflicting = parseMetaAdPage(text + text.replace('12 tháng', '13 tháng'));
  assert.ok(conflicting.ok);
  assert.equal(conflicting.page.ads.length, 0);
  assert.equal(conflicting.page.refusedIds, 1);
  assert.equal(parseMetaAdPage('Library ID: 12345678901234567890123456').ok, false, 'never retain a numeric prefix');
});

test('extract retention has a UTF-8 byte cap and a fingerprint without raw HTML', async () => {
  const w = twoBrandWorld({ [metaPageUrl('111')]: { html: '<html>synthetic</html>', text: pageText([{ id: '5000000001' }]) + 'ế'.repeat(600_000) } });
  w.chunkSize = 2_000_000;
  const result = await source(w).collect({ brands: [A] });
  const read = result.reads[1]!;
  assert.equal(result.status, 'OK');
  assert.ok(Buffer.byteLength(read.text!) <= 1024 * 1024);
  assert.equal(read.fingerprint!.textTruncated, true);
  assert.equal(read.fingerprint!.textBytes, Buffer.byteLength(read.text!));
  assert.equal(read.text!.includes('�'), false);
  assert.equal(JSON.stringify(result).includes('<html>synthetic</html>'), false);
});

test('cancel during a running process kills the group and child, closes, and returns CANCELLED', async () => {
  const controller = new AbortController();
  const calls: string[] = [], killed: string[] = [];
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const runner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    calls.push(argv[2]!);
    if (argv[2] === 'close') return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) };
    started();
    return { child: { kill: () => { killed.push('child'); return true; }, killGroup: () => { killed.push('group'); return true; } }, completion: new Promise(() => {}) };
  };
  const collecting = createMetaAutoSource({ createRunner: () => runner }).collect({ brands: [A, B] }, { signal: controller.signal });
  await ready;
  controller.abort();
  const result = await collecting;
  assert.equal(result.status, 'CANCELLED');
  assert.deepEqual(killed, ['group', 'child']);
  assert.deepEqual(calls, ['open', 'close']);
});

test('each stop marker stops the lane at once with no further open', async () => {
  const cases: Array<[Page, string]> = [
    [{ html: '<form id="login_form"></form>', text: 'x' }, 'LOGIN_REQUIRED'],
    [{ html: "<form name='login'></form>", text: 'x' }, 'LOGIN_REQUIRED'],
    [{ html: '<form action="/checkpoint/1">', text: 'x' }, 'CAPTCHA'],
    [{ html: '', text: 'Security checkpoint' }, 'CAPTCHA'],
    [{ html: '', text: 'Please solve this captcha' }, 'CAPTCHA'],
    [{ html: '', text: "You're Temporarily Blocked" }, 'BLOCKED'],
    [{ html: '', text: 'Too many requests' }, 'BLOCKED'],
    [{ html: '', text: 'Rate limit exceeded' }, 'BLOCKED'],
    [{ html: '', text: 'Bạn tạm thời bị chặn' }, 'BLOCKED'],
    [{ html: '', text: 'Quá nhiều yêu cầu' }, 'BLOCKED'],
    [{ finalUrl: 'https://www.facebook.com/login/', html: '', text: 'x' }, 'LOGIN_REQUIRED'],
    [{ finalUrl: 'https://example.com/', html: '', text: 'x' }, 'BLOCKED'],
  ];
  for (const [page, stop] of cases) {
    const w = twoBrandWorld({ [metaSearchUrl(A.label)]: page });
    const result = await source(w).collect({ brands: [A, B] });
    assert.equal(result.status, 'STOPPED', stop);
    assert.equal(result.stop, stop, JSON.stringify(page));
    assert.equal(result.opens, 1, 'no more opens');
    assert.deepEqual(result.brands.map(b => b.status), ['STOPPED', 'NOT_READ']);
    assert.equal(closes(w), 1);
    assert.ok(result.reasonVi && !/\d|%/u.test(result.reasonVi));
    assert.equal(result.reads[0]!.read.retained, true, 'the stopping page text is kept as evidence');
  }
});

test('a logged-in browser stops the lane and keeps nothing', async () => {
  for (const html of ['<script>{"USER_ID":"100012345"}</script>', '<script>{"actorID":"42"}</script>']) {
    const w = twoBrandWorld({ [metaSearchUrl(A.label)]: { html, text: 'secret feed text' } });
    const result = await source(w).collect({ brands: [A, B] });
    assert.equal(result.stop, 'LOGGED_IN_SESSION_PRESENT');
    assert.equal(result.reasonVi, META_AUTO_LOGGED_IN_REASON);
    assert.equal(result.opens, 1);
    assert.equal(result.reads[0]!.read.retained, false);
    assert.equal(result.reads[0]!.text, null);
    assert.equal(result.reads[0]!.read.textSha256, null);
    assert.equal(JSON.stringify(result).includes('secret feed text'), false);
    assert.equal(closes(w), 1);
  }
  const w = twoBrandWorld({ [metaSearchUrl(A.label)]: { html: searchHtml([{ id: '111', name: A.label }]) + '{"USER_ID":"0"}', text: 'x' } });
  assert.equal((await source(w).collect({ brands: [A] })).status, 'OK', 'viewer id 0 is a logged-out page');
});

test('UI_CHANGED keeps the evidence, stops the lane and becomes a plain row', async () => {
  for (const text of ['Trang này không có nhãn quen thuộc nào', pageText([{ id: '5000000001' }, { id: '5000000001', status: 'Inactive' }])]) {
    const w = twoBrandWorld({ [metaPageUrl('111')]: { html: '', text } });
    const result = await source(w).collect({ brands: [A, B] });
    assert.equal(result.stop, 'UI_CHANGED');
    assert.equal(result.status, 'STOPPED');
    assert.equal(result.opens, 2, 'no open after the changed page');
    assert.deepEqual(result.brands.map(b => b.status), ['UI_CHANGED', 'NOT_READ']);
    const read = result.reads[result.brands[0]!.pageRead!]!;
    assert.equal(read.read.outcome, 'UI_CHANGED');
    assert.equal(read.read.retained, true);
    assert.equal(read.text, text);
    const doc = metaAutoDocument(result, { packageId: 'p', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) });
    assert.equal(validMetaAuto(doc), true);
    const view = metaAutoReportView(doc, true)!;
    assert.deepEqual(view.rows.map(r => r.ok), [false, false]);
    assert.ok(view.rows.every(r => r.adCount === null && r.notice && !/\d|%/u.test(r.notice)));
  }
});

test('partial or unknown dates are missing, never guessed', () => {
  const parsed = parseMetaAdPage(pageText([{ id: '6000000001', start: 'Mar 2026' }, { id: '6000000002', start: '31 Feb 2026' }, { id: '6000000003', start: '2026' },
    { id: '6000000004', start: '12 Mar 2026' }]));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.page.ads.map(ad => ad.startedOn), [null, null, null, '2026-03-12']);
  assert.ok(parsed.page.ads.slice(0, 3).every(ad => ad.startSpan === null));
  assert.equal(parsed.page.resultCount, '~4 results');
  for (const start of ['2026-10-12', '12 thg 10 2026', 'Oct. 12, 2026', '12 Oct 2026/2027', '12 Oct 2026 approximately']) {
    const invalid = parseMetaAdPage(pageText([{ id: '6000000001', start }]));
    assert.ok(invalid.ok);
    assert.equal(invalid.page.ads[0]!.startedOn, null, start);
  }
});

test('NOT_FOUND and AMBIGUOUS open no page', async () => {
  const none = twoBrandWorld({ [metaSearchUrl(A.label)]: { html: searchHtml([{ id: '777', name: 'Thương hiệu Mẫu Khác' }]), text: 'x' } });
  const r1 = await source(none).collect({ brands: [A] });
  assert.equal(r1.brands[0]!.status, 'PAGE_NOT_FOUND');
  assert.equal(r1.opens, 1);
  assert.equal(r1.status, 'NO_DATA');
  const two = twoBrandWorld({ [metaSearchUrl(A.label)]: { html: searchHtml([{ id: '111', name: A.label }, { id: '112', name: 'THƯƠNG HIỆU MẪU A' }]), text: 'x' } });
  const r2 = await source(two).collect({ brands: [A] });
  assert.equal(r2.brands[0]!.status, 'PAGE_AMBIGUOUS');
  assert.equal(r2.opens, 1);
  assert.equal(opens(two).some(url => url.includes('view_all_page_id')), false);
  assert.equal(closes(two), 1);
});

test('an error envelope, a non-zero exit or a spawn failure is a failed read, and the next brand is still read', async () => {
  for (const kind of ['ENVELOPE', 'EXIT', 'THROW'] as const) {
    const w = twoBrandWorld();
    let failed = false;
    w.failOn = argv => (!failed && argv[2] === 'get' && argv[3] === 'html' ? ((failed = true), kind) : null);
    const result = await source(w).collect({ brands: [A, B] });
    assert.equal(result.brands[0]!.status, 'READ_FAILED', kind);
    assert.equal(result.reads[0]!.read.outcome, 'FAILED');
    assert.equal(result.reads[0]!.read.retained, false);
    assert.equal(result.brands[1]!.status, 'OK');
    assert.equal(result.status, 'OK');
    assert.equal(closes(w), 1);
  }
});

test('an abort during the spacing wait is CANCELLED, opens nothing more and still closes', async () => {
  const w = twoBrandWorld();
  const controller = new AbortController();
  w.onSleep = () => controller.abort();
  const result = await source(w).collect({ brands: [A, B] }, { signal: controller.signal });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.opens, 1);
  assert.equal(opens(w).length, 1);
  assert.equal(closes(w), 1);
  assert.deepEqual(result.brands.map(b => b.status), ['CANCELLED', 'NOT_READ']);
});

test('the shared browser lock blocks overlap with a Metric command', async t => {
  // A real Metric capture call whose executor is a fake that holds until released (no process, synthetic manifest).
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-auto-lock-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const events: string[] = [];
  let releaseMetric!: () => void, metricStarted!: () => void;
  const metricHeld = new Promise<void>(resolve => { releaseMetric = resolve; });
  const metricRunning = new Promise<void>(resolve => { metricStarted = resolve; });
  const metric = runMetricCapture({ enabledEnv: '1', captureRoot: root, adapterManifestPath: '/synthetic/manifest.json', adapterManifestSha256: 'a'.repeat(64) },
    { runId: '00000000-0000-4000-8000-000000000209', keyword: 'bình giữ nhiệt', requestedPeriod: { startDate: '2025-10-05', endDate: '2026-10-02' } },
    { sourceEnv: { PATH: '/usr/bin' }, execute: async () => { events.push('metric:start'); metricStarted(); await metricHeld; events.push('metric:end');
      return { ok: false, code: 'METRIC_UI_CHANGED', message: 'synthetic', argv: [] } as never; } });
  const w = twoBrandWorld();
  const meta = source(w).collect({ brands: [A] }).then(r => { events.push('meta:end'); return r; });
  try {
    // Capture prepares files before entering the executor; event-loop turns are not a readiness signal.
    const started = await Promise.race([metricRunning.then(() => true), metric.then(() => false)]);
    assert.equal(started, true, 'Metric capture reached the fake executor');
    assert.deepEqual(events, ['metric:start']);
    assert.equal(w.calls.length, 0, 'no browser command while the Metric command holds the lock');
  } finally {
    releaseMetric();
    await Promise.all([metric, meta]);
  }
  const result = await meta;
  assert.equal(result.status, 'OK');
  assert.deepEqual(events, ['metric:start', 'metric:end', 'meta:end']);
  // A cancelled waiter never runs.
  let hold!: () => void;
  const busy = withOpenCliBrowserLock(undefined, () => new Promise<void>(resolve => { hold = resolve; }), () => undefined);
  const controller = new AbortController();
  const w2 = twoBrandWorld();
  const waiting = source(w2).collect({ brands: [A] }, { signal: controller.signal });
  try {
    controller.abort();
    assert.equal((await waiting).status, 'CANCELLED');
  } finally {
    hold(); await busy;
  }
  assert.equal(w2.calls.length, 0);
});

// ---- Market M07 table 7.2 AUTO rows ----

async function reader(metaAuto?: MetaAutoReportView) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(metaAuto ? { metaAuto } : {}) });
}
const visible = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');

test('Market 7.2 AUTO rows: plain words, no %, no bare 0, no provider names, gates unchanged', async () => {
  const w = twoBrandWorld({ [metaPageUrl('222')]: { html: '', text: pageText([{ id: '5000000003', start: '17 Oct 2026' }]) } });
  const result = await source(w).collect({ brands: [A, B] });
  const doc = metaAutoDocument(result, { packageId: 'p', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) });
  const okView = metaAutoReportView(doc, true)!;
  const failed = metaAutoReportView({ ...doc, brands: [doc.brands[0]!, { ...doc.brands[1]!, status: 'PAGE_NOT_FOUND', ads: [], pageId: null, pageRead: null, resultCount: null, resultCountSpan: null }] }, true)!;
  const plain = await reader();
  assert.equal(plain.html.includes(META_AUTO_TABLE_TITLE), false);
  for (const view of [okView, failed, metaAutoReportView(doc, false)!]) {
    const built = await reader(view);
    const page = new JSDOM(built.html).window.document;
    const table = [...page.querySelectorAll('#phan-7 .ex')].find(node => node.textContent!.includes(META_AUTO_TABLE_TITLE))!;
    assert.ok(table, 'table 7.2 is in M07');
    const text = table.textContent!.replace(/\s+/gu, ' ');
    assert.doesNotMatch(text, /%/u);
    assert.doesNotMatch(text.replace(/\[\d+\]/gu, ''), /(?<![\d/.,])0(?![\d/.,])/u, 'no bare 0');
    const noData = built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:');
    assert.doesNotMatch(noData, /Google|Kalodata|Metric\b|SerpApi|OpenCLI|opencli|Apify|PageIndex|Gemini|tdnmeta/iu);
    assert.ok(visible(built.html).includes(META_AUTO_SOURCE_LABEL), 'the M13 source line');
    assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
    assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
    assert.deepEqual(auditMarketReportHtml(built.html, { presentation: false }).filter(item => !item.ok), []);
    const before = auditMarket14(plain.html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
    assert.deepEqual(auditMarket14(built.html).filter(item => item.kind === 'machine' && !item.ok && !before.includes(item.rule)), []);
  }
  const okTable = new JSDOM((await reader(okView)).html).window.document;
  const rows = [...[...okTable.querySelectorAll('#phan-7 .ex')].find(node => node.textContent!.includes(META_AUTO_TABLE_TITLE))!.querySelectorAll('tbody tr')]
    .map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent!.replace(/\s+/gu, ' ').replace(/\s*\[\d+\]/gu, '').trim()));
  assert.deepEqual(rows.map(r => r.slice(1, 4)), [['2', '01/03/2026', '230'], ['1', '17/10/2026', META_AUTO_SAME_DAY]]);
  assert.ok(rows.every(r => r[0]!.includes('(máy tự khớp tên)')));
  const unverified = new JSDOM((await reader(metaAutoReportView(doc, false)!)).html).window.document.body.textContent!;
  assert.match(unverified, /chưa kiểm lại được/u);
});

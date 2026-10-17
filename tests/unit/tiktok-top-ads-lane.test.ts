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
import { createMetaAutoSource, type MetaAutoClock } from '../../src/modules/analysis/research-automation/meta-auto-lane.js';
import type { MetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { runMetricCapture } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import { withOpenCliBrowserLock } from '../../src/modules/analysis/research-automation/opencli-browser-lock.js';
import {
  classifyTikTokFinalUrl, createTikTokTopAdsSource, parseTikTokTopAds, tiktokTopAdsDocument, tiktokTopAdsEnabled, tiktokTopAdsFailed, tiktokTopAdsReportView, tiktokTopAdsUrl,
  tiktokTopAdsUrlKeyword, tiktokTopAdsUsage, validTikTokTopAds, TIKTOK_TOP_ADS_LOGGED_IN_REASON, TIKTOK_TOP_ADS_MAX_OPENS, TIKTOK_TOP_ADS_SESSION,
  TIKTOK_TOP_ADS_SOURCE_LABEL, TIKTOK_TOP_ADS_SPACING_MS, TIKTOK_TOP_ADS_TABLE_TITLE, TIKTOK_TOP_ADS_TEXT_CAP_BYTES, type TikTokTopAdsReportView,
} from '../../src/modules/analysis/research-automation/tiktok-top-ads-lane.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

// Synthetic pages only: no real page, brand, caption or network call. The fake runner never starts a process.
const KEYWORD = 'bình giữ nhiệt';
const NOW = new Date('2026-10-17T03:00:00.000Z');
const URL_VI = tiktokTopAdsUrl(KEYWORD);
const URL_EN = URL_VI.replace('/pc/vi', '/pc/en');
const card = (caption: string, brand = 'Thương hiệu Mẫu A', likes = '1,2K'): string =>
  `Ad caption: ${caption}\nBrand: ${brand}\nIndustry: Đồ gia dụng\nObjective: Lượt xem video\nLikes: ${likes}\nCTR: 3%\nBudget: năm triệu\n`;
const LIST_TEXT = [card('Bình giữ nhiệt mẫu A giữ lạnh cả ngày'), card('Bình giữ nhiệt mẫu B nắp bật', 'Thương hiệu Mẫu B', '850'),
  card('Son môi mẫu C màu đỏ', 'Thương hiệu Mẫu C')].join('\n');

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
  t: number;
}
function world(pages: Record<string, Page> = { [URL_VI]: { html: '<html></html>', text: LIST_TEXT }, [URL_EN]: { html: '<html></html>', text: LIST_TEXT } }): World {
  return { pages: new Map(Object.entries(pages)), calls: [], opensAt: [], sleeps: [], envs: [], options: [], t: 1_000_000 };
}
function source(w: World, plan: (keyword: string) => readonly string[] = () => [URL_VI, URL_EN]) {
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
      stdout = JSON.stringify({ url: current?.finalUrl ?? currentUrl, content: text.slice(start, start + 120), next_start_char: start + 120 < text.length ? start + 120 : null });
    }
    if (fail === 'ENVELOPE') stdout = JSON.stringify({ error: { code: 'X', message: 'synthetic' } });
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: fail === 'EXIT' ? 1 : 0, stdout, stderr: '' }) };
  };
  const clock: MetaAutoClock = { monotonicMs: () => w.t, sleep: async ms => { w.sleeps.push(ms); w.onSleep?.(); w.t += ms; } };
  return createTikTokTopAdsSource({ createRunner: () => runner, clock, now: () => NOW, env: { PATH: '/usr/bin', SECRET_TOKEN: 'never-passed' }, plan });
}
const opens = (w: World): string[] => w.calls.filter(c => c[2] === 'open').map(c => c[3]!);
const closes = (w: World): number => w.calls.filter(c => c[2] === 'close').length;
const EVIDENCE = { packageId: 'p', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) };

test('the flag is on only for the exact value "1"', () => {
  assert.equal(tiktokTopAdsEnabled({ TDN_RESEARCH_TIKTOK_TOPADS_ENABLED: '1' }), true);
  for (const v of [undefined, '', '0', 'true', ' 1', '1 ', 'yes']) assert.equal(tiktokTopAdsEnabled({ TDN_RESEARCH_TIKTOK_TOPADS_ENABLED: v }), false, String(v));
});

test('flag off: the API builds no lane, and an empty keyword never spawns', async () => {
  const api = await fs.readFile(new URL('../../src/api/research-automation-api.ts', import.meta.url), 'utf8');
  assert.match(api, /const tiktokTopAdsSource = configuration\.tiktokTopAds \? createTikTokTopAdsSource\(\) : undefined;/u);
  const operator = await fs.readFile(new URL('../../src/api/operator-app.ts', import.meta.url), 'utf8');
  assert.match(operator, /tiktokTopAdsEnabled\(environment\) \? \{ researchTikTokTopAds: true as const \} : \{\}/u);
  for (const keyword of ['', '   ', '123', 'x'.repeat(200)]) {
    const w = world();
    const result = await source(w).collect({ keyword });
    assert.equal(result.status, 'NO_KEYWORD', keyword);
    assert.equal(result.opens, 0);
    assert.equal(w.calls.length, 0);
  }
});

test('two planned reads: opens at least 30 s apart, session and background window on every call, close last', async () => {
  const w = world();
  const result = await source(w).collect({ keyword: KEYWORD });
  assert.equal(result.status, 'OK');
  assert.equal(result.opens, 2);
  assert.deepEqual(opens(w), [URL_VI, URL_EN]);
  for (let i = 1; i < w.opensAt.length; i++) assert.ok(w.opensAt[i]! - w.opensAt[i - 1]! >= TIKTOK_TOP_ADS_SPACING_MS, `gap ${i}`);
  for (const call of w.calls) {
    assert.deepEqual(call.slice(0, 2), ['browser', TIKTOK_TOP_ADS_SESSION]);
    assert.deepEqual(call.slice(-2), ['--window', 'background']);
    assert.ok(['open', 'wait', 'get', 'extract', 'close'].includes(call[2]!), call.join(' '));
    assert.ok(!call.some(arg => /^(click|type|fill|press|login|eval|scroll)$/u.test(arg)), call.join(' '));
  }
  assert.ok(w.options.every(o => o.shell === false && o.detached === true));
  assert.ok(w.envs.every(env => env.SECRET_TOKEN === undefined && env.PATH === '/usr/bin'), 'only the allow-listed environment');
  assert.equal(closes(w), 1);
  assert.equal(w.calls.at(-1)![2], 'close');
  assert.deepEqual(result.cards.map(c => [c.read, c.caption.text, c.account?.text, c.likes?.text]), [
    [0, 'Bình giữ nhiệt mẫu A giữ lạnh cả ngày', 'Thương hiệu Mẫu A', '1,2K'], [0, 'Bình giữ nhiệt mẫu B nắp bật', 'Thương hiệu Mẫu B', '850'],
    [1, 'Bình giữ nhiệt mẫu A giữ lạnh cả ngày', 'Thương hiệu Mẫu A', '1,2K'], [1, 'Bình giữ nhiệt mẫu B nắp bật', 'Thương hiệu Mẫu B', '850'],
  ]);
  assert.equal(result.droppedCards, 2, 'the unrelated caption is dropped by the meaning filter on each read');
  const text = result.reads[0]!.text!;
  const c = result.cards[0]!;
  assert.equal(Buffer.from(text).subarray(c.caption.span.start, c.caption.span.end).toString(), c.caption.text, 'UTF-8 byte span');
  const doc = tiktokTopAdsDocument(result, EVIDENCE);
  assert.equal(validTikTokTopAds(doc), true);
  assert.deepEqual(tiktokTopAdsUsage(result.opens).usage, { requestsIssued: 2, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } });
  assert.equal(JSON.stringify(result.cards).includes('3%'), false);
  assert.equal(/CTR|Budget|năm triệu/u.test(JSON.stringify(doc)), false, 'CTR and budget lines never surface');
  assert.equal(JSON.stringify(result).includes('<html'), false, 'raw HTML is never kept');
  const noEvidence = tiktokTopAdsDocument(result, null);
  assert.equal(noEvidence.status, 'FAILED');
  assert.deepEqual(noEvidence.cards, []);
  assert.equal(validTikTokTopAds(noEvidence), true);
});

test('the open cap is five, whatever the plan', async () => {
  const w = world();
  const plan = () => Array.from({ length: 8 }, () => URL_VI);
  const result = await source(w, plan).collect({ keyword: KEYWORD });
  assert.equal(result.opens, TIKTOK_TOP_ADS_MAX_OPENS);
  assert.equal(opens(w).length, 5);
  assert.equal(closes(w), 1);
  assert.ok(validTikTokTopAds(tiktokTopAdsDocument(result, EVIDENCE)));
});

test('a wrong host, path, scheme, port, fragment or extra parameter is rejected', async () => {
  assert.equal(tiktokTopAdsUrlKeyword(URL_VI), KEYWORD);
  for (const url of [
    URL_VI.replace('ads.tiktok.com', 'www.tiktok.com'), URL_VI.replace('ads.tiktok.com', 'ads.tiktok.com.example'), URL_VI.replace('https:', 'http:'),
    URL_VI.replace('/inspiration/topads/', '/inspiration/other/'), `${URL_VI}&extra=1`, `${URL_VI}#top`, URL_VI.replace('ads.tiktok.com', 'ads.tiktok.com:8443'),
    URL_VI.replace('region=VN', 'region=US'), URL_VI.replace('period=30', 'period=7'), `${URL_VI}&keyword=x`, 'not a url',
  ]) assert.equal(tiktokTopAdsUrlKeyword(url), null, url);
  assert.equal(classifyTikTokFinalUrl('https://ads.tiktok.com/business/login?redirect=x'), 'LOGIN_REQUIRED');
  assert.equal(classifyTikTokFinalUrl('https://www.tiktok.com/verify/slide'), 'CAPTCHA');
  assert.equal(classifyTikTokFinalUrl('https://example.com/business/creativecenter/inspiration/topads/pc/vi'), 'BLOCKED');
  assert.equal(classifyTikTokFinalUrl(URL_VI), null);
  // A planned URL outside the allow-list is never opened.
  const w = world();
  const result = await source(w, () => [`${URL_VI}&extra=1`]).collect({ keyword: KEYWORD });
  assert.equal(result.opens, 0);
  assert.equal(w.calls.length, 0);
  assert.equal(result.status, 'FAILED');
  // A final URL for another keyword is a block.
  const other = world({ [URL_VI]: { finalUrl: tiktokTopAdsUrl('nồi chiên'), html: '', text: LIST_TEXT } });
  const moved = await source(other).collect({ keyword: KEYWORD });
  assert.equal(moved.stop, 'BLOCKED');
  assert.equal(moved.opens, 1);
  assert.equal(closes(other), 1);
});

test('each stop marker stops the lane at once with no further open', async () => {
  const cases: Array<[Page, string]> = [
    [{ html: '<form id="login-form"></form>', text: LIST_TEXT }, 'LOGIN_REQUIRED'],
    [{ html: '', text: 'Log in to continue' }, 'LOGIN_REQUIRED'],
    [{ html: '', text: 'Vui lòng đăng nhập' }, 'LOGIN_REQUIRED'],
    [{ html: '<div class="captcha_verify_container"></div>', text: LIST_TEXT }, 'CAPTCHA'],
    [{ html: '', text: 'Drag the slider to fit the puzzle' }, 'CAPTCHA'],
    [{ html: '', text: 'Kéo thanh trượt để ghép hình' }, 'CAPTCHA'],
    [{ html: '', text: 'Too many requests' }, 'BLOCKED'],
    [{ html: '', text: 'Bạn tạm thời bị chặn' }, 'BLOCKED'],
    [{ html: '', text: 'Quá nhiều yêu cầu' }, 'BLOCKED'],
    [{ finalUrl: 'https://ads.tiktok.com/business/login', html: '', text: 'x' }, 'LOGIN_REQUIRED'],
    [{ finalUrl: 'https://www.tiktok.com/captcha/verify', html: '', text: 'x' }, 'CAPTCHA'],
    [{ finalUrl: 'https://example.com/', html: '', text: 'x' }, 'BLOCKED'],
  ];
  for (const [page, stop] of cases) {
    const w = world({ [URL_VI]: page, [URL_EN]: { html: '', text: LIST_TEXT } });
    const result = await source(w).collect({ keyword: KEYWORD });
    assert.equal(result.status, 'STOPPED', stop);
    assert.equal(result.stop, stop, JSON.stringify(page));
    assert.equal(result.opens, 1, 'no more opens');
    assert.equal(closes(w), 1);
    assert.deepEqual(result.cards, []);
    assert.ok(result.reasonVi && !/\d|%/u.test(result.reasonVi));
    assert.equal(result.reads[0]!.read.retained, true, 'the stopping page text is kept as evidence');
    assert.ok(validTikTokTopAds(tiktokTopAdsDocument(result, EVIDENCE)));
  }
});

test('script and navigation words are not walls', async () => {
  const ordinary = '<a href="/login">Log in to TikTok</a><script>const captcha_verify = "<div class=\'captcha_verify\'>"; const f = \'<form id="login">\';'
    + ' const advertiser = {"uid":"7000000001","user_id":42,"core_user_id":"9"};</script>';
  const w = world({ [URL_VI]: { html: ordinary, text: `Log in to TikTok\nĐăng nhập vào TikTok\nVerify\nCaptcha\n${LIST_TEXT}` } });
  const result = await source(w, () => [URL_VI]).collect({ keyword: KEYWORD });
  assert.equal(result.status, 'OK');
});

test('a logged-in browser stops the lane and keeps nothing', async () => {
  for (const html of ['<script>{"viewer":{"uid":"7000000001"}}</script>', '<script>{"currentUser":{"user_id":42}}</script>',
    '<script>{"viewerInfo":{"core_user_id":"9"}}</script>', '<script>{"viewer_id":"9"}</script>', '<script>{"isLogin":true}</script>']) {
    const w = world({ [URL_VI]: { html, text: `secret feed text\n${LIST_TEXT}` } });
    const result = await source(w).collect({ keyword: KEYWORD });
    assert.equal(result.stop, 'LOGGED_IN_SESSION_PRESENT');
    assert.equal(result.reasonVi, TIKTOK_TOP_ADS_LOGGED_IN_REASON);
    assert.equal(result.opens, 1);
    assert.equal(result.reads[0]!.read.retained, false);
    assert.equal(result.reads[0]!.text, null);
    assert.equal(result.reads[0]!.read.textSha256, null);
    assert.equal(w.calls.some(c => c[2] === 'extract'), false, 'no visible text is read from a signed-in session');
    assert.equal(JSON.stringify(result).includes('secret feed text'), false);
    assert.equal(closes(w), 1);
  }
  const w = world({ [URL_VI]: { html: '<script>{"uid":"0","user_id":0}</script>', text: LIST_TEXT } });
  assert.equal((await source(w, () => [URL_VI]).collect({ keyword: KEYWORD })).status, 'OK', 'viewer id 0 is a logged-out page');
});

test('UI_CHANGED keeps the evidence, stops the lane and becomes a plain row', async () => {
  const text = 'Trang này không có nhãn quen thuộc nào\nTitle: một dòng lạ';
  const w = world({ [URL_VI]: { html: '', text } });
  const result = await source(w).collect({ keyword: KEYWORD });
  assert.equal(result.stop, 'UI_CHANGED');
  assert.equal(result.status, 'STOPPED');
  assert.equal(result.opens, 1, 'no open after the changed page');
  assert.equal(result.reads[0]!.read.outcome, 'UI_CHANGED');
  assert.equal(result.reads[0]!.read.retained, true);
  assert.equal(result.reads[0]!.text, text);
  assert.equal(result.reads[0]!.fingerprint!.labels.unknown, 1);
  const doc = tiktokTopAdsDocument(result, EVIDENCE);
  assert.equal(validTikTokTopAds(doc), true);
  const view = tiktokTopAdsReportView(doc, true)!;
  assert.deepEqual(view.rows, []);
  assert.ok(view.notice && !/\d|%/u.test(view.notice));
});

test('extract text is capped on a UTF-8 boundary and an incomplete read keeps evidence without listing cards', async () => {
  const text = `${card('Bình giữ nhiệt mẫu A')}\n${'ế'.repeat(TIKTOK_TOP_ADS_TEXT_CAP_BYTES)}`;
  const calls: string[][] = [];
  const runner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    calls.push([...argv]);
    const stdout = argv[2] === 'extract' ? JSON.stringify({ url: URL_VI, content: text, next_start_char: null })
      : argv[2] === 'get' && argv[3] === 'url' ? URL_VI : '';
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout, stderr: '' }) };
  };
  const result = await createTikTokTopAdsSource({ createRunner: () => runner, now: () => NOW }).collect({ keyword: KEYWORD });
  assert.equal(result.stop, 'UI_CHANGED');
  assert.deepEqual(result.cards, []);
  const capture = result.reads[0]!;
  assert.ok(capture.read.retained);
  assert.ok(Buffer.byteLength(capture.text!) <= TIKTOK_TOP_ADS_TEXT_CAP_BYTES);
  assert.doesNotMatch(capture.text!, /\uFFFD/u);
  assert.equal(capture.fingerprint!.textTruncated, true);
  assert.equal(capture.fingerprint!.textBytes, Buffer.byteLength(capture.text!));
  assert.equal(calls.at(-1)![2], 'close');
});

test('each extract chunk checks the final URL before keeping its text', async () => {
  const runner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    const stdout = argv[2] === 'extract' ? JSON.stringify(Number(argv[4]) === 0
      ? { url: URL_VI, content: card('Bình giữ nhiệt mẫu A'), next_start_char: 100 }
      : { url: 'https://example.com/', content: 'OFF_TARGET_PRIVATE_TEXT', next_start_char: null })
      : argv[2] === 'get' && argv[3] === 'url' ? URL_VI : '';
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout, stderr: '' }) };
  };
  const result = await createTikTokTopAdsSource({ createRunner: () => runner }).collect({ keyword: KEYWORD });
  assert.equal(result.stop, 'BLOCKED');
  assert.deepEqual(result.cards, []);
  assert.equal(JSON.stringify(result).includes('OFF_TARGET_PRIVATE_TEXT'), false);
});

test('CTR and budget lines never surface, and a caption carrying a figure is refused', () => {
  const parsed = parseTikTokTopAds(`${card('Bình giữ nhiệt giảm 50% hôm nay')}\n${card('Bình giữ nhiệt CTR cao')}\n${card('Bình giữ nhiệt mẫu D')}`);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.read.refusedCards, 2);
  assert.deepEqual(parsed.read.cards.map(c => c.caption.text), ['Bình giữ nhiệt mẫu D']);
  assert.equal(parsed.labels.forbidden, 6);
  assert.equal(/CTR|Budget|%/u.test(JSON.stringify(parsed.read)), false);
  const odd = parseTikTokTopAds('Ad caption: Bình giữ nhiệt mẫu E\nLikes: rất nhiều\nObjective: hiệu quả cao\n');
  assert.ok(odd.ok);
  if (!odd.ok) return;
  assert.equal(odd.read.cards[0]!.likes, null, 'a like value that is not a count literal is not kept');
  assert.equal(odd.read.cards[0]!.objective, null, 'an effectiveness word is not kept');
});

test('unsafe figures, provider names and markdown syntax never become visible literals', () => {
  for (const value of ['Cost 123 USD', 'Spend 456 USD', 'Google mẫu', 'G o o g l e mẫu', 'Gemini mẫu', 'Metric mẫu',
    '[mẫu](https://example.com)', '[mẫu][nguồn]', '**mẫu**', '*mẫu*', '_mẫu_', '~~mẫu~~', '<b>mẫu</b>']) {
    const parsed = parseTikTokTopAds(card(`Bình giữ nhiệt ${value}`));
    assert.ok(parsed.ok);
    assert.equal(parsed.read.cards.length, 0, value);
    assert.equal(parsed.read.refusedCards, 1);
  }
  const parsed = parseTikTokTopAds('Ad caption: Bình giữ nhiệt mẫu\nBrand: Google mẫu\nIndustry: Metric mẫu\nObjective: Spend 456 USD\n');
  assert.ok(parsed.ok);
  assert.deepEqual([parsed.read.cards[0]!.account, parsed.read.cards[0]!.industry, parsed.read.cards[0]!.objective], [null, null, null]);
});

test('captions that do not match the keyword meaning are counted and never listed', async () => {
  const w = world({ [URL_VI]: { html: '', text: [card('Son môi mẫu C màu đỏ'), card('Nồi chiên mẫu F')].join('\n') } });
  const result = await source(w, () => [URL_VI]).collect({ keyword: KEYWORD });
  assert.equal(result.status, 'NO_DATA');
  assert.deepEqual(result.cards, []);
  assert.equal(result.droppedCards, 2);
  const doc = tiktokTopAdsDocument(result, EVIDENCE);
  assert.ok(validTikTokTopAds(doc));
  const view = tiktokTopAdsReportView(doc, true)!;
  assert.equal(view.droppedCards, 2);
  assert.deepEqual(view.rows, []);
});

test('an error envelope, a non-zero exit or a spawn failure is a failed read, and the next planned read still runs', async () => {
  for (const kind of ['ENVELOPE', 'EXIT', 'THROW'] as const) {
    const w = world();
    let failed = false;
    w.failOn = argv => (!failed && argv[2] === 'get' && argv[3] === 'html' ? ((failed = true), kind) : null);
    const result = await source(w).collect({ keyword: KEYWORD });
    assert.equal(result.reads[0]!.read.outcome, 'FAILED', kind);
    assert.equal(result.reads[0]!.read.retained, false);
    assert.equal(result.status, 'OK');
    assert.ok(result.cards.every(c => c.read === 1));
    assert.equal(closes(w), 1);
  }
  const w = world();
  w.failOn = argv => (argv[2] === 'extract' ? 'EXIT' : null);
  const all = await source(w).collect({ keyword: KEYWORD });
  assert.equal(all.status, 'FAILED');
  assert.equal(closes(w), 1);
});

test('an abort during the spacing wait is CANCELLED, opens nothing more and still closes', async () => {
  const w = world();
  const controller = new AbortController();
  w.onSleep = () => controller.abort();
  const result = await source(w).collect({ keyword: KEYWORD }, { signal: controller.signal });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.opens, 1);
  assert.equal(opens(w).length, 1);
  assert.equal(closes(w), 1);
  assert.deepEqual(result.cards, []);
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
  const collecting = createTikTokTopAdsSource({ createRunner: () => runner }).collect({ keyword: KEYWORD }, { signal: controller.signal });
  await ready;
  controller.abort();
  const result = await collecting;
  assert.equal(result.status, 'CANCELLED');
  assert.deepEqual(killed, ['group', 'child']);
  assert.deepEqual(calls, ['open', 'close']);
});

test('the shared browser lock blocks overlap with a Metric command and a Meta read', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tiktok-top-ads-lock-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  // Metric: a real capture call whose executor is a fake that holds until released (no process, synthetic manifest).
  const events: string[] = [];
  let releaseMetric!: () => void;
  const metricHeld = new Promise<void>(resolve => { releaseMetric = resolve; });
  const metric = runMetricCapture({ enabledEnv: '1', captureRoot: root, adapterManifestPath: '/synthetic/manifest.json', adapterManifestSha256: 'a'.repeat(64) },
    { runId: '00000000-0000-4000-8000-000000000209', keyword: KEYWORD, requestedPeriod: { startDate: '2025-10-05', endDate: '2026-10-02' } },
    { sourceEnv: { PATH: '/usr/bin' }, execute: async () => { events.push('metric:start'); await metricHeld; events.push('metric:end');
      return { ok: false, code: 'METRIC_UI_CHANGED', message: 'synthetic', argv: [] } as never; } });
  const w = world();
  const tiktok = source(w, () => [URL_VI]).collect({ keyword: KEYWORD }).then(r => { events.push('tiktok:end'); return r; });
  for (let i = 0; i < 200 && !events.includes('metric:start'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['metric:start']);
  assert.equal(w.calls.length, 0, 'no browser command while the Metric command holds the lock');
  releaseMetric();
  await metric;
  assert.equal((await tiktok).status, 'OK');
  assert.deepEqual(events, ['metric:start', 'metric:end', 'tiktok:end']);

  // Meta: the Meta auto-read holds the lock while its first command runs.
  let releaseMeta!: () => void, metaStarted!: () => void;
  const metaHeld = new Promise<void>(resolve => { releaseMeta = resolve; });
  const metaRunning = new Promise<void>(resolve => { metaStarted = resolve; });
  const metaRunner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    if (argv[2] === 'open') { metaStarted(); await metaHeld; }
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout: argv[2] === 'extract' ? JSON.stringify({ url: argv[3] ?? '', content: '', next_start_char: null }) : '', stderr: '' }) };
  };
  let mt = 0;
  const metaClock: MetaAutoClock = { monotonicMs: () => mt, sleep: async ms => { mt += ms; } };
  const label = 'Thương hiệu Mẫu A';
  const meta = createMetaAutoSource({ createRunner: () => metaRunner, clock: metaClock, now: () => NOW, env: { PATH: '/usr/bin' } })
    .collect({ brands: [{ label, key: normalizedKey(label)! }] });
  await metaRunning;
  const w2 = world();
  const second = source(w2, () => [URL_VI]).collect({ keyword: KEYWORD });
  for (let i = 0; i < 50; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(w2.calls.length, 0, 'no browser command while the Meta read holds the lock');
  releaseMeta();
  await meta;
  assert.equal((await second).status, 'OK');
  assert.ok(w2.calls.length > 0);

  // A cancelled waiter never runs.
  let hold!: () => void;
  const busy = withOpenCliBrowserLock(undefined, () => new Promise<void>(resolve => { hold = resolve; }), () => undefined);
  const controller = new AbortController();
  const w3 = world();
  const waiting = source(w3).collect({ keyword: KEYWORD }, { signal: controller.signal });
  controller.abort();
  assert.equal((await waiting).status, 'CANCELLED');
  hold(); await busy;
  assert.equal(w3.calls.length, 0);
});

// ---- Market M07 table 7.4 AUTO rows ----

async function reader(tiktokTopAds?: TikTokTopAdsReportView) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(tiktokTopAds ? { tiktokTopAds } : {}) });
}
const visible = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');
const table74 = (html: string): Element | undefined => [...new JSDOM(html).window.document.querySelectorAll('#phan-7 .ex')].find(node => node.textContent!.includes(TIKTOK_TOP_ADS_TABLE_TITLE));

test('Market 7.4 AUTO rows: no %, no bare 0, no provider names, the M13 source line, gates unchanged', async () => {
  const result = await source(world(), () => [URL_VI]).collect({ keyword: KEYWORD });
  const doc = tiktokTopAdsDocument(result, EVIDENCE);
  const okView = tiktokTopAdsReportView(doc, true)!;
  const stopped = await source(world({ [URL_VI]: { html: '', text: 'Too many requests' } }), () => [URL_VI]).collect({ keyword: KEYWORD });
  const stoppedView = tiktokTopAdsReportView(tiktokTopAdsDocument(stopped, EVIDENCE), true)!;
  const unverifiedView = tiktokTopAdsReportView(doc, false)!;
  const plain = await reader();
  assert.equal(plain.html.includes(TIKTOK_TOP_ADS_TABLE_TITLE), false);
  assert.equal(visible(plain.html).includes(TIKTOK_TOP_ADS_SOURCE_LABEL), false);
  assert.equal((await reader()).html, plain.html, 'without a view the report bytes are stable');
  for (const view of [okView, stoppedView, unverifiedView]) {
    const built = await reader(view);
    const table = table74(built.html);
    assert.ok(table, 'table 7.4 is in M07');
    const text = table.textContent!.replace(/\s+/gu, ' ');
    assert.doesNotMatch(text, /%/u);
    assert.doesNotMatch(text.replace(/\[\d+\]/gu, ''), /(?<![\d/.,])0(?![\d/.,])/u, 'no bare 0');
    assert.match(text, /Máy tự đọc trang quảng cáo nổi bật của TikTok ngày 17\/10\/2026, không đăng nhập\./u);
    assert.match(text, /không phải chi tiêu hay hiệu quả/u);
    const noData = built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:');
    assert.doesNotMatch(noData, /Google|Kalodata|Metric\b|SerpApi|OpenCLI|opencli|Apify|PageIndex|Gemini|tdnmeta|tdntiktok/iu);
    assert.equal(visible(built.html).includes(TIKTOK_TOP_ADS_SOURCE_LABEL), true, 'M13 also discloses a stopped or unverified read');
    assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
    assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
    assert.deepEqual(auditMarketReportHtml(built.html, { presentation: false }).filter(item => !item.ok), []);
    const before = auditMarket14(plain.html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
    assert.deepEqual(auditMarket14(built.html).filter(item => item.kind === 'machine' && !item.ok && !before.includes(item.rule)), []);
  }
  const rows = [...table74((await reader(okView)).html)!.querySelectorAll('tbody tr')]
    .map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent!.replace(/\s+/gu, ' ').replace(/\s*\[\d+\]/gu, '').trim()));
  assert.deepEqual(rows, [
    ['Bình giữ nhiệt mẫu A giữ lạnh cả ngày', 'Thương hiệu Mẫu A', 'Đồ gia dụng', 'Lượt xem video', '1,2K lượt thích'],
    ['Bình giữ nhiệt mẫu B nắp bật', 'Thương hiệu Mẫu B', 'Đồ gia dụng', 'Lượt xem video', '850 lượt thích'],
  ]);
  const okText = table74((await reader(okView)).html)!.parentElement!.textContent!;
  assert.match(okText, /không khớp nghĩa với từ khoá sản phẩm/u);
  assert.match(visible((await reader(unverifiedView)).html), /chưa kiểm lại được/u);
});

test('a failure before reading still renders a plain table and M13 without an invented date', async () => {
  for (const doc of [tiktokTopAdsFailed(KEYWORD), tiktokTopAdsFailed(null, 'NO_KEYWORD')]) {
    const view = tiktokTopAdsReportView(doc, false);
    assert.ok(view);
    assert.equal(view.readDate, null);
    assert.deepEqual(view.rows, []);
    const built = await reader(view);
    assert.ok(table74(built.html));
    assert.match(visible(built.html), /Lượt này chưa có bản đọc trang quảng cáo nổi bật của TikTok để kiểm tra/u);
    assert.ok(visible(built.html).includes(TIKTOK_TOP_ADS_SOURCE_LABEL));
    assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
    assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
  }
});

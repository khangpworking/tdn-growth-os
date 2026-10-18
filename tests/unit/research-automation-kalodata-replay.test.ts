import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  assertKalodataReplayNotProduction, assertKalodataReplayScope, buildKalodataReplayIndex, createKalodataReplayTransport,
  KALODATA_REPLAY_ENV, KALODATA_REPLAY_NOTICE_VI, KalodataReplayRefusedError, KalodataReplayScopeMismatchError,
  kalodataReplaySourceRunIdFromEnvironment, withKalodataReplayNotice, type ReplayCaptureEnvelope,
} from '../../src/modules/analysis/research-automation/kalodata-replay.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';

// Synthetic values only.
const HOST = 'https://www.kalodata.com';
const COMMON = { region: 'VN', currency: 'VND' };
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function capture(operation: string, params: Record<string, unknown>, payload: unknown, extra: Partial<ReplayCaptureEnvelope> = {}): ReplayCaptureEnvelope {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return { operation, outcome: 'OK', httpStatus: 200, requestParameters: params, responseBytesBase64: bytes.toString('base64'), responseSha256: sha(bytes), ...extra };
}
const storedRank = capture('kalodata.product.rank', { ...COMMON, keyword: 'thermos', date_range: '2026-09-01~2026-09-30', page_number: 1 }, { success: true, data: [{ product_id: '101' }] });
const storedDetail = capture('kalodata.product.detail', { ...COMMON, product_id: '101', date_range: '2026-09-01~2026-09-30', need_image: 1, need_extra: false }, { success: true, data: { product_id: '101', revenue: 1 } });
const storedYear = capture('kalodata.product.detail', { ...COMMON, product_id: '101', date_range: '2026-07-01~2026-08-29', need_image: 1, need_extra: false }, { success: true, data: { product_id: '101', revenue: 9 } });
const index = () => buildKalodataReplayIndex([
  capture('kalodata.credit.balance', {}, { success: true, data: { totalRemain: 40 } }),
  capture('kalodata.credit.balance', {}, { success: true, data: { totalRemain: 55 } }),
  storedRank, storedDetail, storedYear,
]);

function innerTransport() {
  const calls: string[] = [];
  const transport: ProviderTransport = { now: () => 0, sleep: async () => {}, fetch: (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input)); return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch };
  return { calls, transport };
}
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const json = async (response: Response) => JSON.parse(await response.text()) as Record<string, unknown>;

test('index keeps only OK 2xx captures whose bytes match their sha; balance = highest stored', () => {
  const tampered = { ...storedDetail, responseSha256: '0'.repeat(64) };
  const rejected = capture('kalodata.product.detail', { product_id: '102' }, { success: false, code: 2016 }, { outcome: 'PROVIDER_REJECTED' });
  const built = buildKalodataReplayIndex([tampered, rejected, capture('kalodata.credit.balance', {}, { success: true, data: { totalRemain: 7 } })]);
  assert.equal(built.detail.size, 0);
  assert.equal(built.captures, 1);
  assert.equal(JSON.parse(built.balance!.bytes.toString('utf8')).data.totalRemain, 7);
  assert.equal(JSON.parse(index().balance!.bytes.toString('utf8')).data.totalRemain, 55);
});

test('balance, rank and detail are answered from stored bytes; nothing reaches the inner transport', async () => {
  const { calls, transport } = innerTransport();
  const replay = createKalodataReplayTransport(transport, async () => index());
  const balance = await replay.fetch(`${HOST}/openapi/v1/credit/balance`, { method: 'GET' });
  assert.equal((await json(balance)).success, true);
  const rank = await replay.fetch(`${HOST}/openapi/v1/tiktok/product/rank`, post({ ...COMMON, keyword: 'thermos', date_range: '2026-09-01~2026-09-30', page_number: 1 }));
  assert.equal(Buffer.from(await rank.arrayBuffer()).toString('base64'), storedRank.responseBytesBase64, 'same bytes as stored');
  const year = await replay.fetch(`${HOST}/openapi/v1/tiktok/product/detail`, post({ ...COMMON, product_id: '101', date_range: '2026-07-01~2026-08-29', need_image: 1, need_extra: false }));
  assert.equal(((await json(year)).data as { revenue: number }).revenue, 9, 'exact window match');
  assert.deepEqual(calls, []);
  assert.deepEqual(replay.stats, { replayed: 3, missed: 0, passedThrough: 0 });
});

test('a later recent window is remapped to the stored one (rank first, then detail)', async () => {
  const { calls, transport } = innerTransport();
  const replay = createKalodataReplayTransport(transport, async () => index());
  const later = '2026-09-08~2026-10-07';
  const unmapped = await replay.fetch(`${HOST}/openapi/v1/tiktok/product/detail`, post({ ...COMMON, product_id: '101', date_range: later, need_image: 1, need_extra: false }));
  assert.equal((await json(unmapped)).code, 'KALODATA_REPLAY_MISS', 'no remap before the rank call established it');
  await replay.fetch(`${HOST}/openapi/v1/tiktok/product/rank`, post({ ...COMMON, keyword: 'thermos', date_range: later, page_number: 1 }));
  const mapped = await replay.fetch(`${HOST}/openapi/v1/tiktok/product/detail`, post({ ...COMMON, product_id: '101', date_range: later, need_image: 1, need_extra: false }));
  assert.equal(((await json(mapped)).data as { revenue: number }).revenue, 1);
  assert.deepEqual(calls, []);
});

test('no match fails closed with KALODATA_REPLAY_MISS and never calls the inner transport', async () => {
  const { calls, transport } = innerTransport();
  const replay = createKalodataReplayTransport(transport, async () => index());
  for (const [url, init] of [
    [`${HOST}/openapi/v1/tiktok/product/detail`, post({ ...COMMON, product_id: '999', date_range: '2026-07-01~2026-08-29', need_image: 1, need_extra: false })],
    [`${HOST}/openapi/v1/tiktok/product/rank`, post({ ...COMMON, keyword: 'blender', page_number: 1 })],
    [`${HOST}/openapi/v1/tiktok/shop/rank`, post({})],
    [`${HOST}/openapi/v1/tiktok/product/detail`, { method: 'POST', body: 'not json' }],
    ['https://openapi.kalodata.com/openapi/v1/credit/balance', { method: 'GET' }],
  ] as const) {
    const response = await replay.fetch(url, init);
    assert.equal(response.status, 200);
    assert.deepEqual(await json(response), { success: false, code: 'KALODATA_REPLAY_MISS', message: 'replay miss' });
  }
  const broken = createKalodataReplayTransport(transport, async () => { throw new Error('unreadable'); });
  assert.equal((await json(await broken.fetch(`${HOST}/openapi/v1/credit/balance`, { method: 'GET' }))).code, 'KALODATA_REPLAY_MISS');
  assert.deepEqual(calls, []);
  assert.equal(replay.stats.missed, 5);
});

test('other hosts pass through untouched', async () => {
  const { calls, transport } = innerTransport();
  let loads = 0;
  const replay = createKalodataReplayTransport(transport, async () => { loads++; return index(); });
  const response = await replay.fetch('https://serpapi.com/search.json?q=x', { method: 'GET' });
  assert.deepEqual(await json(response), { ok: true });
  assert.deepEqual(calls, ['https://serpapi.com/search.json?q=x']);
  assert.equal(loads, 0, 'the index is only loaded for sales-data requests');
  assert.equal(replay.stats.passedThrough, 1);
});

test('env flag: unset/empty = off, a UUID = on, anything else refused', () => {
  assert.equal(kalodataReplaySourceRunIdFromEnvironment({}), undefined);
  assert.equal(kalodataReplaySourceRunIdFromEnvironment({ [KALODATA_REPLAY_ENV]: '' }), undefined);
  assert.equal(kalodataReplaySourceRunIdFromEnvironment({ [KALODATA_REPLAY_ENV]: '64b2d8e4-22a7-4eb7-a460-6ed4ce72bd7f' }), '64b2d8e4-22a7-4eb7-a460-6ed4ce72bd7f');
  assert.throws(() => kalodataReplaySourceRunIdFromEnvironment({ [KALODATA_REPLAY_ENV]: 'yes' }), KalodataReplayRefusedError);
});

test('production port and state paths are refused', () => {
  const safe = { databasePath: '/tmp/tdn-replay/1/db.sqlite', artifactRoot: '/tmp/tdn-replay/1/artifacts', port: 8797 };
  assertKalodataReplayNotProduction(safe);
  assert.throws(() => assertKalodataReplayNotProduction({ ...safe, port: 8787 }), /KALODATA_REPLAY_REFUSED/);
  assert.throws(() => assertKalodataReplayNotProduction({ ...safe, databasePath: '/home/u/.local/state/tdn-growth-os/operator-dev-8787-ab099f3/tdn-growth-os-dev.sqlite' }), /KALODATA_REPLAY_REFUSED/);
  assert.throws(() => assertKalodataReplayNotProduction({ ...safe, artifactRoot: 'C:\\x\\operator-dev-8787-ab099f3\\artifacts' }), /KALODATA_REPLAY_REFUSED/);
});

test('scope must equal the source run keyword and period', () => {
  const source = { sourceRunId: '64b2d8e4-22a7-4eb7-a460-6ed4ce72bd7f', keyword: 'quạt điện', period: { startDate: '2025-10-17', endDate: '2026-10-16' } };
  assertKalodataReplayScope(source, ' quạt điện '.normalize('NFD'), { startDate: '2025-10-17', endDate: '2026-10-16' });
  assert.throws(() => assertKalodataReplayScope(source, 'son môi', source.period), KalodataReplayScopeMismatchError);
  assert.throws(() => assertKalodataReplayScope(source, source.keyword, { startDate: '2025-10-05', endDate: '2026-10-02' }), /KALODATA_REPLAY_SCOPE_MISMATCH/);
});

test('notice goes right after <body> and names no provider', () => {
  const html = withKalodataReplayNotice('<!doctype html><html><head></head><body class="x"><h1>T</h1></body></html>').toString('utf8');
  assert.match(html, /<body class="x"><div role="note" data-test-replay="1"[^>]*>Bản chạy thử – dữ liệu bán hàng phát lại từ lần chạy trước, không phải báo cáo thật<\/div><h1>/);
  assert.ok(withKalodataReplayNotice('<p>x</p>').toString('utf8').startsWith('<div role="note"'));
  assert.doesNotMatch(KALODATA_REPLAY_NOTICE_VI, /kalodata|metric|tradeint|dami|nvidia|jev/i);
});

test('operator app: the flag reaches the configuration and unsafe replay starts are refused before anything opens', async () => {
  const { openOperatorApp, operatorAppConfigurationFromEnvironment } = await import('../../src/api/operator-app.js');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-replay-config-'));
  const frontendDist = path.join(root, 'dist');
  fs.mkdirSync(path.join(frontendDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.js'), 'globalThis.TDN=true;');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.css'), 'body{}');
  const defaults = { frontendDist, version: '0.0.0-test' };
  const base = { TDN_WORKSPACE_DB: '/tmp/tdn-replay/1/db.sqlite', TDN_ARTIFACT_ROOT: '/tmp/tdn-replay/1/artifacts', TDN_OWNER_API_ENABLED: 'true',
    TDN_OWNER_API_LOCAL_TEST: 'true', TDN_OWNER_API_ACTOR_ID: 'owner:local', TDN_OPERATOR_APP_PORT: '8797' };
  const on = { ...base, [KALODATA_REPLAY_ENV]: '64b2d8e4-22a7-4eb7-a460-6ed4ce72bd7f' };
  // Successful parsing preloads frontend/dist, whose POSIX mode checks do not hold on Windows (pre-existing; Fedora runs them).
  if (process.platform !== 'win32') {
    assert.ok(!('researchKalodataReplaySourceRunId' in operatorAppConfigurationFromEnvironment(base, defaults)), 'flag off: field absent');
    assert.equal(operatorAppConfigurationFromEnvironment(on, defaults).researchKalodataReplaySourceRunId, '64b2d8e4-22a7-4eb7-a460-6ed4ce72bd7f');
  }
  for (const env of [{ ...on, TDN_OPERATOR_APP_PORT: '8787' }, { ...on, TDN_OWNER_API_ENABLED: 'false', TDN_OWNER_API_LOCAL_TEST: 'false' },
    { ...on, TDN_WORKSPACE_DB: '/home/u/.local/state/tdn-growth-os/operator-dev-8787-ab099f3/tdn-growth-os-dev.sqlite' }]) {
    assert.throws(() => openOperatorApp(operatorAppConfigurationFromEnvironment(env, defaults)), /KALODATA_REPLAY_REFUSED/);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

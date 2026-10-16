import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { StepExpandedQuery, StepVideoWatchCandidate } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import { answerOf, createVideoWatchModel, VIDEO_WATCH_PROMPT } from '../../src/modules/analysis/research-automation/video-watch-gemini.js';
import { buildAutomatedVideoReading, validateModelAnswer, VideoWatchLane, videoWatchCandidates, videoWatchConfigFromEnv, videoWatchEnabled,
  videoWatchLaneFromConfig } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { createProcessRunner, downloadVideo, processSpawnOptions, sweepVideoMedia, ytdlpArgs, VIDEO_WATCH_MAX_BYTES,
  type ProcessRunner } from '../../src/modules/analysis/research-automation/video-watch-media.js';

const RUN = '22222222-2222-4222-8222-222222222222';
const KEY = 'synthetic-proxy-key-0123456789';
const CLIPROXY = { baseUrl: 'http://127.0.0.1:8317', apiKey: KEY };
const MODEL = 'gemini-video-test-1';
const url = (id: string) => `https://www.tiktok.com/@nguoiban.vidu/video/${id}`;
const candidate = (id = '1234567890123456789'): StepVideoWatchCandidate => ({ videoId: id, url: url(id), origin: 'EXPANDED_SEARCH' });
const query = (kind: StepExpandedQuery['kind'], results: { position: number; url: string }[], status: StepExpandedQuery['status'] = 'COLLECTED') =>
  ({ kind, status, reason: null, requestedWindow: null, retrievedAt: null, captureIndex: null, results: results.map(r => ({ ...r, title: 't', snippet: null })) }) as unknown as StepExpandedQuery;
const goodAnswer = { aboutProduct: true, videoKind: 'SELLER_VIDEO', segments: [{ startSecond: 1, endSecond: 3, speech: ' Bình giữ nóng rất lâu ' }],
  onScreenText: [{ startSecond: 0, endSecond: 2, text: 'GIẢM 50%' }] };
const modelBody = (answer: unknown, extra: object[] = []) => JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [...extra, { text: JSON.stringify(answer) }] } }] });

type Call = { url: string; init: RequestInit | undefined };
function transport(calls: Call[], replies: (() => Response | Promise<Response>)[]): ProviderTransport {
  return {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init }); const next = replies.shift(); if (!next) throw new Error('no reply'); return next(); }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
}
const json = (body: string, status = 200) => () => new Response(body, { status, headers: { 'content-type': 'application/json' } });
const media = { bytes: new Uint8Array(Buffer.from('synthetic-video-bytes-0001')), mimeType: 'video/mp4', videoId: '1234567890123456789' };

async function tmp(t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-video-watch-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('flag: on only for exactly "1"', () => {
  for (const value of [undefined, '', '0', 'true', ' 1', '1 ', 'yes']) assert.equal(videoWatchEnabled({ TDN_RESEARCH_VIDEO_WATCH_ENABLED: value }), false, String(value));
  assert.equal(videoWatchEnabled({ TDN_RESEARCH_VIDEO_WATCH_ENABLED: '1' }), true);
});

test('candidates: selection first, then TIKTOK rows in position order, deduped by video id, capped at 10 with the rest recorded', () => {
  const ids = Array.from({ length: 14 }, (_, i) => String(1000 + i));
  const plan = videoWatchCandidates([{ url: url(ids[0]!) }, { url: 'https://example.test/not-a-video' }, { url: url(ids[1]!) }], [
    query('SHOPEE', [{ position: 1, url: url(ids[13]!) }]),
    query('TIKTOK', [{ position: 3, url: url(ids[3]!) }, { position: 1, url: url(ids[1]!) }, { position: 2, url: url(ids[2]!) }, ...ids.slice(4, 13).map((id, i) => ({ position: 4 + i, url: url(id) }))]),
    query('TIKTOK', [{ position: 1, url: url(ids[12]!) }], 'FAILED'),
  ]);
  assert.deepEqual(plan.candidates.map(c => [c.videoId, c.origin]), [[ids[0], 'SELECTION'], [ids[1], 'SELECTION'], [ids[2], 'EXPANDED_SEARCH'], [ids[3], 'EXPANDED_SEARCH'],
    ...ids.slice(4, 10).map(id => [id, 'EXPANDED_SEARCH'])]);
  assert.deepEqual(plan.skipped, ids.slice(10, 13).map(videoId => ({ videoId, reason: 'OVER_10_VIDEOS' })));
  assert.equal(plan.candidatesSha256, videoWatchCandidates([{ url: url(ids[0]!) }, { url: url(ids[1]!) }], [query('TIKTOK', ids.slice(1, 13).map((id, i) => ({ position: i + 1, url: url(id) })))]).candidatesSha256);
  assert.deepEqual(videoWatchCandidates([], undefined).candidates, []);
});

const at = (account: string, id: string) => `https://www.tiktok.com/@${account}/video/${id}`;
test('candidates: spread across accounts round-robin, order inside an account kept, before the cap', () => {
  const four = videoWatchCandidates([], [query('TIKTOK', [['a', '11'], ['a', '12'], ['a', '13'], ['b', '21']].map(([account, id], i) => ({ position: i + 1, url: at(account!, id!) })))]);
  assert.deepEqual(four.candidates.map(c => c.videoId), ['11', '21', '12', '13'], 'a1, b1, a2, a3');
  const twelve = [...['1', '2', '3', '4', '5', '6'].map(n => at('shop.a', `10${n}`)), ...['1', '2', '3', '4'].map(n => at('shop.b', `20${n}`)), at('shop.c', '301'), at('shop.c', '302')];
  const plan = videoWatchCandidates(twelve.slice(0, 2).map(url => ({ url })), [query('TIKTOK', twelve.slice(2).map((url, i) => ({ position: i + 1, url })))]);
  assert.deepEqual(plan.candidates.map(c => c.videoId), ['101', '201', '301', '102', '202', '302', '103', '203', '104', '204']);
  assert.equal(new Set(plan.candidates.map(c => c.url.split('/')[3])).size, 3, 'the 10 kept cover all 3 accounts');
  assert.deepEqual(plan.skipped, [{ videoId: '105', reason: 'OVER_10_VIDEOS' }, { videoId: '106', reason: 'OVER_10_VIDEOS' }], 'the skipped ones are the last-pass ones');
  assert.deepEqual(plan.candidates.slice(0, 2).map(c => c.origin), ['SELECTION', 'EXPANDED_SEARCH']);
  const mixed = videoWatchCandidates([], [query('TIKTOK', [at('ShopA', '1'), at('shopa', '2'), at('other', '3')].map((url, i) => ({ position: i + 1, url })))]);
  assert.deepEqual(mixed.candidates.map(c => c.videoId), ['1', '3', '2'], '@ShopA and @shopa are one account');
});
test('answer check: exact shape, intervals inside the media, ordered speech; text trimmed, never rewritten', () => {
  assert.deepEqual(validateModelAnswer(goodAnswer, 10)!.segments, [{ startSecond: 1, endSecond: 3, speech: 'Bình giữ nóng rất lâu' }]);
  for (const bad of [{ ...goodAnswer, extra: 1 }, { ...goodAnswer, videoKind: 'ADVERT' }, { ...goodAnswer, segments: [{ startSecond: 1, endSecond: 30, speech: 'x' }] },
    { ...goodAnswer, segments: [{ startSecond: 3, endSecond: 4, speech: 'a' }, { startSecond: 2, endSecond: 5, speech: 'b' }] },
    { ...goodAnswer, segments: [{ startSecond: 1, endSecond: 2, speech: '  ' }] }, null, 'text'])
    assert.equal(validateModelAnswer(bad, 10), null, JSON.stringify(bad));
  assert.deepEqual(validateModelAnswer({ ...goodAnswer, segments: [] }, 10)!.segments, [], 'nothing spoken is a valid empty answer');
});

test('answerOf: thought parts are skipped, the rest joined; a non-STOP finish is no answer', () => {
  const answer = JSON.stringify(goodAnswer);
  const body = { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'thinking about {"aboutProduct": false}' }, { text: answer.slice(0, 10) }, { text: answer.slice(10) }] } }] };
  assert.deepEqual(answerOf(body), goodAnswer);
  assert.equal(answerOf({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: answer }] } }] }), undefined);
  assert.equal(answerOf({ candidates: [{ content: { parts: [{ thought: true, text: answer }] } }] }), undefined, 'only thoughts means no answer');
  assert.equal(answerOf({ candidates: [] }), undefined);
});

test('model: one inline generateContent POST to the loopback proxy, gateway headers, speech-only prompt, no Files API', async () => {
  const calls: Call[] = [];
  const model = createVideoWatchModel({ cliproxy: CLIPROXY, modelId: MODEL, transport: transport(calls, [json(modelBody(goodAnswer, [{ thought: true, text: 'x' }]))]) });
  const result = await model.watch(media);
  assert.equal(result.kind, 'ANSWER');
  assert.deepEqual(result.kind === 'ANSWER' && result.answer, goodAnswer);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `http://127.0.0.1:8317/v1beta/models/${MODEL}:generateContent`);
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.equal(calls[0]!.init?.redirect, 'error');
  assert.deepEqual(calls[0]!.init?.headers, { Authorization: `Bearer ${KEY}`, Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'x-goog-api-key': KEY });
  const sent = JSON.parse(String(calls[0]!.init?.body)) as { contents: { parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[]; generationConfig: Record<string, unknown> };
  assert.equal(sent.contents[0]!.parts[0]!.inlineData!.mimeType, 'video/mp4');
  assert.equal(Buffer.from(sent.contents[0]!.parts[0]!.inlineData!.data, 'base64').toString(), 'synthetic-video-bytes-0001');
  assert.equal(sent.contents[0]!.parts[1]!.text, VIDEO_WATCH_PROMPT);
  assert.equal(sent.generationConfig.temperature, 0);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert.ok(sent.generationConfig.responseSchema);
  assert.match(VIDEO_WATCH_PROMPT, /audibly spoken/u);
  assert.match(VIDEO_WATCH_PROMPT, /Never copy on-screen text, captions, timers or numbers/u);
  assert.match(VIDEO_WATCH_PROMPT, /If nothing is spoken, return no segments/u);
  assert.equal(JSON.stringify(sent).includes(KEY), false, 'the key never travels in the body');
  assert.doesNotMatch(calls.map(c => c.url).join(), /upload|files/iu);
});

test('model: captures keep digests, model id, status and raw answer; never the video base64 or the key', async () => {
  const calls: Call[] = [];
  const model = createVideoWatchModel({ cliproxy: CLIPROXY, modelId: MODEL, transport: transport(calls, [json(modelBody(goodAnswer))]) });
  const result = await model.watch(media);
  assert.equal(result.captures.length, 1);
  const capture = result.captures[0]!;
  assert.equal(capture.provider, 'VIDEO-WATCH');
  assert.equal(capture.operation, 'videowatch.generate');
  assert.equal(capture.httpStatus, 200);
  assert.equal(capture.outcome, 'OK');
  assert.equal(capture.endpoint, `/v1beta/models/${MODEL}:generateContent`);
  assert.equal(capture.requestBodyBytes, null);
  assert.equal(capture.responseBytes!.toString(), modelBody(goodAnswer));
  const params = capture.requestParameters as Record<string, unknown>;
  assert.equal(params.model, MODEL);
  assert.match(String(params.requestSha256), /^[a-f0-9]{64}$/u);
  assert.match(String(params.videoSha256), /^[a-f0-9]{64}$/u);
  assert.equal(params.videoByteSize, media.bytes.byteLength);
  const serialized = JSON.stringify({ ...capture, responseBytes: capture.responseBytes?.toString('base64') });
  assert.equal(serialized.includes(Buffer.from(media.bytes).toString('base64')), false, 'no video base64 in a capture');
  assert.equal(serialized.includes('synthetic-video-bytes'), false);
  assert.equal(serialized.includes(KEY), false);
  assert.equal(serialized.includes('127.0.0.1'), false, 'the capture endpoint is the path only');
});

test('model: one retry on 429/5xx/timeout only; 4xx and transport errors fail at once; a key echo is refused', async () => {
  const run = async (replies: (() => Response | Promise<Response>)[]) => { const calls: Call[] = []; const result = await createVideoWatchModel({ cliproxy: CLIPROXY, modelId: MODEL, transport: transport(calls, replies) }).watch(media); return { calls, result }; };
  const r429 = await run([json('{}', 429), json(modelBody(goodAnswer))]);
  assert.equal(r429.result.kind, 'ANSWER'); assert.equal(r429.calls.length, 2); assert.equal(r429.result.requests, 2); assert.equal(r429.result.paidRequests, 2);
  const r500 = await run([json('{}', 503), json('{}', 500)]);
  assert.equal(r500.result.kind === 'FAILED' && r500.result.reason, 'MODEL_FAILED'); assert.equal(r500.calls.length, 2, 'at most one retry');
  const r400 = await run([json('{}', 400), json(modelBody(goodAnswer))]);
  assert.equal(r400.result.kind, 'FAILED'); assert.equal(r400.calls.length, 1);
  const transportError = await run([() => { throw new TypeError('synthetic'); }, json(modelBody(goodAnswer))]);
  assert.equal(transportError.result.kind, 'FAILED'); assert.equal(transportError.calls.length, 1);
  const echo = await run([json(JSON.stringify({ error: `bad key ${KEY}` }), 401)]);
  assert.equal(echo.result.kind === 'FAILED' && echo.result.reason, 'CREDENTIAL_ECHO_REFUSED');
  assert.equal(echo.result.captures[0]!.responseBytes, null, 'the echoed bytes are never stored');
  const invalid = await run([json('not json')]);
  assert.equal(invalid.result.kind === 'FAILED' && invalid.result.reason, 'MODEL_FAILED');
  assert.equal(invalid.result.captures[0]!.outcome, 'INVALID_PAYLOAD');
  const big = await run([() => new Response(Buffer.alloc(1024 * 1024 + 1, 32), { status: 200 })]);
  assert.equal(big.result.kind, 'FAILED'); assert.equal(big.result.captures[0]!.outcome, 'OVERSIZE');
});

test('model: a model id with "/" or a non-gemini id is rejected; errors never echo the key', () => {
  for (const id of ['relay/gemini-2.5-pro', 'gemini-2.5-pro/x', 'gpt-5', 'Gemini-2', '', 'gemini-']) {
    assert.throws(() => createVideoWatchModel({ cliproxy: CLIPROXY, modelId: id }), (error: Error) => !error.message.includes(KEY), id);
    assert.throws(() => videoWatchConfigFromEnv({ TDN_RESEARCH_VIDEO_MEDIA_DIR: path.resolve('/media'), TDN_RESEARCH_VIDEO_WATCH_MODEL: id, TDN_RESEARCH_YTDLP_BIN: 'yt-dlp' }), id);
  }
  assert.throws(() => createVideoWatchModel({ cliproxy: { baseUrl: 'https://203.0.113.5', apiKey: KEY }, modelId: MODEL }), (error: Error) => !error.message.includes(KEY));
});

test('config: CLIProxy missing or unusable never throws; the lane then skips every video as VIDEO_MODEL_NOT_CONFIGURED with no download', async t => {
  const dir = await tmp(t);
  const base = { TDN_RESEARCH_VIDEO_MEDIA_DIR: dir, TDN_RESEARCH_VIDEO_WATCH_MODEL: MODEL, TDN_RESEARCH_YTDLP_BIN: 'yt-dlp' };
  assert.equal(videoWatchConfigFromEnv(base).cliproxy, null);
  assert.equal(videoWatchConfigFromEnv({ ...base, TDN_CLIPROXY_BASE_URL: 'http://127.0.0.1:8317' }).cliproxy, null, 'half configured is not configured');
  assert.equal(videoWatchConfigFromEnv({ ...base, TDN_CLIPROXY_BASE_URL: 'https://example.com', TDN_CLIPROXY_API_KEY: KEY }).cliproxy, null);
  const configured = videoWatchConfigFromEnv({ ...base, TDN_CLIPROXY_BASE_URL: 'http://127.0.0.1:8317', TDN_CLIPROXY_API_KEY: KEY });
  assert.deepEqual(configured.cliproxy, CLIPROXY);
  assert.equal(JSON.stringify(Object.keys(configured)).includes('GEMINI'), false);
  assert.throws(() => videoWatchConfigFromEnv({ ...base, TDN_RESEARCH_VIDEO_MEDIA_DIR: 'relative/dir' }));
  const lane = videoWatchLaneFromConfig(videoWatchConfigFromEnv(base), () => new Date('2026-10-02T00:00:00.000Z'));
  assert.equal(lane.modelId, null);
  let spawned = 0;
  const quiet = new VideoWatchLane({ media: { mediaDir: dir, ytdlpBin: 'yt-dlp', ffprobeBin: 'ffprobe' }, model: null, now: () => new Date('2026-10-02T00:00:00.000Z'),
    runner: async () => { spawned++; return { code: 0, stdout: '', stderr: '', timedOut: false }; } });
  const attempts = await quiet.run({ binding: { workspaceId: 'w', runId: RUN, scopeSha256: 'a'.repeat(64), sourceSetSha256: null, candidatesSha256: 'b'.repeat(64) },
    candidates: [candidate('1001'), candidate('1002')], publish: async () => { throw new Error('never'); } });
  assert.deepEqual(attempts.map(a => [a.reason, a.downloads, a.requests]), [['VIDEO_MODEL_NOT_CONFIGURED', 0, 0], ['VIDEO_MODEL_NOT_CONFIGURED', 0, 0]]);
  assert.equal(spawned, 0);
});

test('lane: a configured fake client goes through the inline transport', async t => {
  const dir = await tmp(t);
  const calls: Call[] = [];
  const lane = videoWatchLaneFromConfig({ mediaDir: dir, ytdlpBin: 'yt-dlp', ffprobeBin: 'ffprobe', modelId: MODEL, cliproxy: CLIPROXY }, () => new Date('2026-10-02T00:00:00.000Z'),
    transport(calls, [json(modelBody(goodAnswer))]));
  assert.equal(lane.modelId, MODEL);
  const model = createVideoWatchModel({ cliproxy: CLIPROXY, modelId: MODEL, transport: transport(calls, [json(modelBody(goodAnswer))]) });
  await model.watch(media);
  assert.ok(calls.every(c => c.url.endsWith(':generateContent') && String(c.init?.body).includes('"inlineData"')));
});

/** A fake yt-dlp/ffprobe: `files` decides what yt-dlp leaves behind, `probe` what ffprobe prints. */
function fakeRunner(seen: { bin: string; args: readonly string[] }[], options: { files?: Record<string, Buffer>; code?: number; stderr?: string; probe?: object | null } = {}): ProcessRunner {
  return async (bin, args) => {
    seen.push({ bin, args });
    if (bin === 'yt-dlp') {
      const template = args[args.indexOf('-o') + 1]!;
      for (const [ext, bytes] of Object.entries(options.files ?? {})) await fs.writeFile(template.replace('%(ext)s', ext), bytes);
      return { code: options.code ?? 0, stdout: '', stderr: options.stderr ?? '', timedOut: false };
    }
    return options.probe === null ? { code: 1, stdout: '', stderr: 'bad', timedOut: false } : { code: 0, stdout: JSON.stringify(options.probe ?? { format: { duration: '12.5', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' }, streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] }), stderr: '', timedOut: false };
  };
}

test('media: fixed yt-dlp arguments with the 14 MB and 180 s filters; a good mp4 is probed and hashed', async t => {
  const dir = await tmp(t);
  const args = ytdlpArgs(path.join(dir, RUN), candidate());
  for (const flag of ['--ignore-config', '--no-cookies', '--no-playlist']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--max-filesize') + 1], '14M');
  assert.equal(args[args.indexOf('-f') + 1], 'b[height<=720][filesize<14M]/b[height<=480]/b');
  assert.equal(args[args.indexOf('--match-filter') + 1], 'duration<=180');
  assert.deepEqual(args.slice(-2), ['--', candidate().url]);
  const seen: { bin: string; args: readonly string[] }[] = [];
  const got = await downloadVideo({ mediaDir: dir, ytdlpBin: 'yt-dlp', ffprobeBin: 'ffprobe' }, fakeRunner(seen, { files: { mp4: Buffer.from('video') } }), () => new Date('2026-10-02T00:00:00.000Z'), RUN, candidate());
  assert.equal(got.ok, true);
  assert.equal(got.ok && got.mimeType, 'video/mp4');
  assert.equal(got.ok && got.media.durationSeconds, 12.5);
  assert.deepEqual(seen.map(s => s.bin), ['yt-dlp', 'ffprobe']);
});

test('media: every failure is a skip code and leaves no file behind', async t => {
  const dir = await tmp(t);
  const config = { mediaDir: dir, ytdlpBin: 'yt-dlp', ffprobeBin: 'ffprobe' };
  const at = () => new Date('2026-10-02T00:00:00.000Z');
  const reason = async (options: Parameters<typeof fakeRunner>[1]) => { const got = await downloadVideo(config, fakeRunner([], options), at, RUN, candidate()); return got.ok ? 'OK' : got.reason; };
  assert.equal(await reason({ code: 1 }), 'DOWNLOAD_FAILED');
  assert.equal(await reason({ stderr: 'video does not pass filter (duration<=180), skipping' }), 'VIDEO_TOO_LONG');
  assert.equal(await reason({ stderr: 'File is larger than max-filesize' }), 'VIDEO_TOO_LARGE');
  assert.equal(await reason({ files: { mp4: Buffer.alloc(VIDEO_WATCH_MAX_BYTES + 1) } }), 'VIDEO_TOO_LARGE');
  assert.equal(await reason({ files: { mkv: Buffer.from('v') } }), 'NOT_A_VIDEO', 'only mp4 and webm are sent');
  assert.equal(await reason({ files: { mp4: Buffer.from('v') }, probe: null }), 'NOT_A_VIDEO');
  assert.equal(await reason({ files: { mp4: Buffer.from('v') }, probe: { format: { duration: '10', format_name: 'matroska,webm' }, streams: [{ codec_type: 'video' }] } }), 'NOT_A_VIDEO', 'container must match the extension');
  assert.equal(await reason({ files: { mp4: Buffer.from('v') }, probe: { format: { duration: '10', format_name: 'mp4' }, streams: [{ codec_type: 'audio' }] } }), 'NOT_A_VIDEO');
  assert.equal(await reason({ files: { mp4: Buffer.from('v') }, probe: { format: { duration: '181', format_name: 'mp4' }, streams: [{ codec_type: 'video' }] } }), 'VIDEO_TOO_LONG');
  assert.equal(await reason({ files: { webm: Buffer.from('v') }, probe: { format: { duration: '10', format_name: 'matroska,webm' }, streams: [{ codec_type: 'video' }] } }), 'OK');
  assert.deepEqual((await fs.readdir(path.join(dir, RUN))).filter(name => name.endsWith('.mp4')), []);
  assert.equal((await downloadVideo(config, fakeRunner([]), at, 'not-a-run', candidate())).ok, false);
});

test('spawn: tools start without a shell, stdin ignored, minimal environment without TDN values', async () => {
  const options = processSpawnOptions();
  assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(options.shell, false);
  const seen: { bin: string; args: string[]; options: Record<string, unknown> }[] = [];
  const fakeSpawn = ((bin: string, args: string[], spawnOptions: Record<string, unknown>) => {
    seen.push({ bin, args, options: spawnOptions });
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => true });
    setImmediate(() => { child.stdout.emit('data', Buffer.from('{"ok":1}')); child.emit('close', 0); });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
  process.env.TDN_SYNTHETIC_SECRET_FOR_TEST = 'never-passed';
  try {
    const result = await createProcessRunner(fakeSpawn)('ffprobe', ['-v', 'error'], { timeoutMs: 5_000, maxBytes: 1024 });
    assert.deepEqual(result, { code: 0, stdout: '{"ok":1}', stderr: '', timedOut: false });
  } finally { delete process.env.TDN_SYNTHETIC_SECRET_FOR_TEST; }
  assert.deepEqual(seen[0]!.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(seen[0]!.options.shell, false);
  assert.equal(Object.keys(seen[0]!.options.env as object).some(name => name.startsWith('TDN_')), false);
});

test('sweep: media older than 45 days by recorded time is removed, newer kept, links and foreign files untouched (fake clock)', async t => {
  const dir = await tmp(t);
  const runDir = path.join(dir, RUN);
  await fs.mkdir(runDir);
  await fs.writeFile(path.join(runDir, '1001.mp4'), 'old');
  await fs.writeFile(path.join(runDir, '1002.mp4'), 'new');
  await fs.writeFile(path.join(runDir, 'notes.txt'), 'keep');
  await fs.writeFile(path.join(runDir, '.video-watch-downloads.json'), JSON.stringify({ '1001.mp4': '2026-08-01T00:00:00.000Z', '1002.mp4': '2026-09-20T00:00:00.000Z' }));
  await fs.mkdir(path.join(dir, 'not-a-run'));
  await fs.writeFile(path.join(dir, 'not-a-run', '1003.mp4'), 'foreign');
  const result = await sweepVideoMedia(dir, new Date('2026-10-02T00:00:00.000Z'));
  assert.deepEqual(result, { deleted: 1, removedDirs: 0 });
  assert.deepEqual((await fs.readdir(runDir)).sort(), ['.video-watch-downloads.json', '1002.mp4', 'notes.txt']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(runDir, '.video-watch-downloads.json'), 'utf8')), { '1002.mp4': '2026-09-20T00:00:00.000Z' });
  await fs.unlink(path.join(runDir, 'notes.txt'));
  assert.deepEqual(await sweepVideoMedia(dir, new Date('2026-11-05T00:00:00.000Z')), { deleted: 1, removedDirs: 1 }, '45 days after 2026-09-20 has passed');
  assert.deepEqual(await fs.readdir(path.join(dir, 'not-a-run')), ['1003.mp4']);
  assert.deepEqual(await sweepVideoMedia(path.join(dir, 'missing'), new Date()), { deleted: 0, removedDirs: 0 });
});

test('reading: v3 contract, unverified model provenance and model-transcribed captions; on-screen text stored separately', () => {
  const answer = validateModelAnswer(goodAnswer, 10)!;
  const prepared = buildAutomatedVideoReading({ workspaceId: '11111111-1111-4111-8111-111111111111', runId: RUN, scopeSha256: 'a'.repeat(64), sourceSetSha256: null, candidatesSha256: 'b'.repeat(64) },
    candidate(), answer, { sha256: 'c'.repeat(64), byteSize: 5, durationSeconds: 10, downloadedAt: '2026-10-02T00:00:00.000Z' }, { modelId: MODEL, responseSha256: 'd'.repeat(64) });
  assert.equal(prepared.reading.contractVersion, 'video-reading-v3');
  assert.equal(prepared.reading.registryId, 'S14');
  assert.equal(prepared.reading.provenance, 'AUTOMATED_MODEL_UNVERIFIED');
  assert.equal(prepared.reading.captionSource, 'MODEL_TRANSCRIBED');
  assert.deepEqual(prepared.reading.segments, [{ startSeconds: 1, endSeconds: 3, text: 'Bình giữ nóng rất lâu' }]);
  assert.deepEqual(prepared.reading.onScreenText, [{ startSeconds: 0, endSeconds: 2, text: 'GIẢM 50%' }]);
});

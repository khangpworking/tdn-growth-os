import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCliproxyCreativeGateway } from '../../src/platform/ai/cliproxy-creative-gateway.js';
import { CreativeAiError } from '../../src/platform/ai/creative-ai-gateway.js';
import { createFakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/api/request-scoped-artifact-store.js';
import { createContentAiAttemptService, type ContentAiAttemptInput, type ContentAiAttemptOutcome } from '../../src/modules/flow/content-ai-attempt-service.js';
import { fixtureImage } from '../helpers/content-images.js';

const SENTINEL = 'content-ai-attempt-sentinel-049';
const roots: string[] = [];
const inputSha = 'c'.repeat(64);
let nextId = 1;

test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function textResult(text = 'creative output') {
  return { text, latencyMs: 17, usage: { inputTokens: 11, outputTokens: 5 }, providerRequestId: 'provider:049' } as const;
}

function imageResult(bytes: Buffer, declaredMediaType?: string) {
  return { bytes, latencyMs: 19, ...(declaredMediaType === undefined ? {} : { declaredMediaType }), usage: { inputTokens: 13, outputTokens: 7 }, providerRequestId: 'image:049' } as const;
}

function input(overrides: Partial<ContentAiAttemptInput> = {}): ContentAiAttemptInput {
  return {
    kind: 'generate', targetType: 'campaign', targetId: 'target-049', promptRef: 'prompt:caption:v1', inputBundleSha256: inputSha,
    plannedActionCallCount: 1, actorId: 'owner:local',
    call: { modality: 'text', request: { model: 'gpt-5.6-sol', systemLayer: 'system', creativeLayer: 'creative', userInput: 'input' } },
    ...overrides,
  };
}

function setup(gateway: Parameters<typeof createContentAiAttemptService>[0]['gateway'], artifactRoot?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-ai-attempt-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite');
  const opened = openDatabase({ databasePath });
  const actualArtifactRoot = artifactRoot ?? path.join(root, 'artifacts');
  const service = createContentAiAttemptService({
    db: opened.db, gateway, artifactRoot: actualArtifactRoot,
    clock: () => new Date(Date.UTC(2026, 8, 27, 10, 0, nextId++)),
    newId: () => `00000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`,
  });
  return { root, databasePath, db: opened.db, artifactRoot: actualArtifactRoot, service };
}

function row(db: ReturnType<typeof openDatabase>['db'], attemptId?: string): Record<string, unknown> {
  return db.prepare('SELECT * FROM flow_content_ai_attempts WHERE attempt_id=?').get(attemptId ?? db.prepare('SELECT attempt_id FROM flow_content_ai_attempts ORDER BY created_at DESC LIMIT 1').pluck().get()) as Record<string, unknown>;
}

function outputFile(root: string, digest: string): string {
  return path.join(root, 'sha256', digest.slice(0, 2), digest);
}

async function runText(state: ReturnType<typeof setup>, value = input(), steps: { persist: (outcome: ContentAiAttemptOutcome, staged: undefined) => unknown; stage?: (outcome: ContentAiAttemptOutcome) => Promise<unknown> } = { persist: () => 'persisted' }) {
  return state.service.run(value, steps as never);
}

const geminiConfiguration = { baseUrl: 'http://127.0.0.1:8317', apiKey: 'gemini-mime-regression-key-049' } as const;

function imageInput(targetId: string): ContentAiAttemptInput {
  return input({
    targetId,
    call: { modality: 'image', request: { model: 'gemini-3.1-flash-image', prompt: 'poster', format: 'square', references: [] } },
  });
}

function geminiTransport(inlineKey: 'inlineData' | 'inline_data', inlineData: Record<string, unknown>): typeof fetch {
  return async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ [inlineKey]: inlineData }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function hasStoredFile(root: string): boolean {
  if (!fs.existsSync(root)) return false;
  return fs.readdirSync(root, { withFileTypes: true }).some((entry) => entry.isDirectory()
    ? hasStoredFile(path.join(root, entry.name))
    : true);
}

test('successful text attempts store exact bytes, register a manifest, persist synchronously and close once', async () => {
  nextId = 1;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('exact text bytes') }] });
  const state = setup(gateway);
  state.db.exec('CREATE TABLE test_domain_writes (value TEXT NOT NULL)');
  try {
    const result = await state.service.run(input(), {
      persist: (outcome) => { state.db.prepare('INSERT INTO test_domain_writes(value) VALUES (?)').run(outcome.outputSha256); return 'saved'; },
    });
    const expected = createHash('sha256').update(Buffer.from('exact text bytes')).digest('hex');
    assert.equal(result.persisted, 'saved');
    assert.equal(result.outcome.outputSha256, expected);
    assert.equal(fs.readFileSync(outputFile(state.artifactRoot, expected), 'utf8'), 'exact text bytes');
    const attempt = row(state.db, result.outcome.attemptId);
    assert.deepEqual({ state: attempt.state, error: attempt.error_code, output: attempt.output_sha256, inputTokens: attempt.input_tokens, outputTokens: attempt.output_tokens, provider: attempt.provider_request_id }, {
      state: 'succeeded', error: null, output: expected, inputTokens: 11n, outputTokens: 5n, provider: 'provider:049',
    });
    assert.equal((state.db.prepare('SELECT count(*) count FROM test_domain_writes').get() as { count: bigint }).count, 1n);
    assert.equal(gateway.calls.filter((call) => call.operation === 'generateText').length, 1);
  } finally { state.db.close(); }
});

test('provider failures and non-CreativeAiError failures close one safe terminal row without a retry', async () => {
  for (const [reply, expectedCode] of [[new CreativeAiError('gateway_http_error', 503), 'gateway_http_error'], [new Error(SENTINEL), 'network_error']] as const) {
    nextId = 20;
    const gateway = createFakeCreativeGateway({ text: [{ error: reply }] });
    const state = setup(gateway);
    try {
      await assert.rejects(runText(state), (error: unknown) => {
        assert.ok(error instanceof CreativeAiError);
        assert.equal(error.code, expectedCode);
        assert.doesNotMatch(error.message, new RegExp(SENTINEL));
        assert.doesNotMatch(error.stack ?? '', new RegExp(SENTINEL));
        assert.equal(Object.hasOwn(error, 'cause'), false);
        return true;
      });
      const attempt = row(state.db);
      assert.deepEqual({ state: attempt.state, error: attempt.error_code, output: attempt.output_sha256 }, { state: 'failed', error: expectedCode, output: null });
      assert.equal(gateway.calls.filter((call) => call.operation === 'generateText').length, 1);
    } finally { state.db.close(); }
  }
});

test('image MIME validation is table-driven: sniffed PNG/JPEG without declaration pass, contradictions and unsupported bytes fail', async () => {
  const cases = [
    { label: 'PNG without declared type', bytes: fixtureImage('rgb.png'), declared: undefined, ok: true, media: 'image/png' },
    { label: 'JPEG without declared type', bytes: fixtureImage('photo-a.jpg'), declared: undefined, ok: true, media: 'image/jpeg' },
    { label: 'PNG declared JPEG', bytes: fixtureImage('rgb.png'), declared: 'image/jpeg', ok: false },
    { label: 'PNG declared WebP', bytes: fixtureImage('rgb.png'), declared: 'image/webp', ok: false },
    { label: 'unsupported bytes', bytes: Buffer.from('not an image'), declared: undefined, ok: false },
  ] as const;
  for (const [index, scenario] of cases.entries()) {
    nextId = 50 + index;
    const gateway = createFakeCreativeGateway({ image: [{ result: imageResult(scenario.bytes, scenario.declared) }] });
    const state = setup(gateway);
    try {
      const value = input({ call: { modality: 'image', request: { model: 'gpt-image-2', prompt: 'poster', format: 'square', references: [] } } });
      if (scenario.ok) {
        const result = await state.service.run(value, { persist: () => 'ok' });
        assert.equal((result.outcome as Extract<ContentAiAttemptOutcome, { modality: 'image' }>).image.mediaType, scenario.media);
        assert.equal(row(state.db, result.outcome.attemptId).state, 'succeeded');
      } else {
        await assert.rejects(state.service.run(value, { persist: () => 'unexpected' }), (error: unknown) => { assert.ok(error instanceof CreativeAiError); assert.equal(error.code, 'invalid_image'); return true; });
        assert.equal(row(state.db).error_code, 'invalid_image');
        assert.equal(row(state.db).output_sha256, null);
      }
    } finally { state.db.close(); }
  }
});

test('Gemini inline MIME declarations that contradict data-URL MIME fail before persistence', async () => {
  const png = fixtureImage('rgb.png');
  const jpeg = fixtureImage('photo-a.jpg');
  const cases = [
    { label: 'camelCase PNG data with JPEG declaration', inlineKey: 'inlineData' as const, mimeKey: 'mimeType', inlineMime: 'image/jpeg', bytes: png, dataUrlMime: 'image/png' },
    { label: 'camelCase JPEG data with PNG declaration', inlineKey: 'inlineData' as const, mimeKey: 'mimeType', inlineMime: 'image/png', bytes: jpeg, dataUrlMime: 'image/jpeg' },
    { label: 'snake_case PNG data with JPEG declaration', inlineKey: 'inline_data' as const, mimeKey: 'mime_type', inlineMime: 'image/jpeg', bytes: png, dataUrlMime: 'image/png' },
  ];

  for (const [index, scenario] of cases.entries()) {
    nextId = 300 + index;
    const encoded = `data:${scenario.dataUrlMime};base64,${scenario.bytes.toString('base64')}`;
    const gateway = createCliproxyCreativeGateway({
      configuration: geminiConfiguration,
      transport: geminiTransport(scenario.inlineKey, { [scenario.mimeKey]: scenario.inlineMime, data: encoded }),
    });
    const state = setup(gateway);
    let stageCalls = 0;
    let persistCalls = 0;
    try {
      await assert.rejects(state.service.run(imageInput(`gemini-contradiction-${index}`), {
        stage: async () => { stageCalls += 1; return 'staged'; },
        persist: () => { persistCalls += 1; return 'persisted'; },
      }), (error: unknown) => {
        assert.ok(error instanceof CreativeAiError);
        assert.equal(error.code, 'malformed_envelope', scenario.label);
        return true;
      });
      assert.equal(row(state.db).state, 'failed', scenario.label);
      assert.equal(row(state.db).error_code, 'malformed_envelope', scenario.label);
      assert.equal(row(state.db).output_sha256, null, scenario.label);
      assert.equal(stageCalls, 0, scenario.label);
      assert.equal(persistCalls, 0, scenario.label);
      assert.equal((state.db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as { count: bigint }).count, 0n, scenario.label);
      assert.equal(hasStoredFile(state.artifactRoot), false, scenario.label);
    } finally { state.db.close(); }
  }
});

test('matching Gemini inline and data-URL MIME declarations persist as the sniffed image type', async () => {
  nextId = 320;
  const png = fixtureImage('rgb.png');
  const data = `data:image/png;base64,${png.toString('base64')}`;
  const gateway = createCliproxyCreativeGateway({
    configuration: geminiConfiguration,
    transport: geminiTransport('inlineData', { mimeType: 'image/png', data }),
  });
  const state = setup(gateway);
  try {
    let persistedMediaType: string | undefined;
    const result = await state.service.run(imageInput('gemini-matching'), {
      persist: (outcome) => {
        if (outcome.modality !== 'image') throw new Error('expected image outcome');
        persistedMediaType = outcome.image.mediaType;
        return 'persisted';
      },
    });
    assert.equal(result.persisted, 'persisted');
    assert.equal(persistedMediaType, 'image/png');
    const attempt = row(state.db, result.outcome.attemptId);
    assert.equal(attempt.state, 'succeeded');
    assert.equal(attempt.output_sha256, result.outcome.outputSha256);
    assert.equal((state.db.prepare('SELECT media_type AS mediaType FROM artifact_manifests WHERE sha256=?').get(result.outcome.outputSha256) as { mediaType: string }).mediaType, 'image/png');
  } finally { state.db.close(); }
});

test('missing Gemini MIME declarations leave image type to service byte sniffing', async () => {
  const png = fixtureImage('rgb.png');
  const jpeg = fixtureImage('photo-a.jpg');
  const cases = [
    { label: 'data URL without inline MIME', inline: { data: `data:image/png;base64,${png.toString('base64')}` }, expected: 'image/png' },
    { label: 'inline MIME with raw base64', inline: { mimeType: 'image/jpeg', data: jpeg.toString('base64') }, expected: 'image/jpeg' },
    { label: 'neither declaration', inline: { data: png.toString('base64') }, expected: 'image/png' },
  ];

  for (const [index, scenario] of cases.entries()) {
    nextId = 340 + index;
    const gateway = createCliproxyCreativeGateway({ configuration: geminiConfiguration, transport: geminiTransport('inlineData', scenario.inline) });
    const state = setup(gateway);
    try {
      const result = await state.service.run(imageInput(`gemini-missing-${index}`), { persist: () => 'persisted' });
      assert.equal((result.outcome as Extract<ContentAiAttemptOutcome, { modality: 'image' }>).image.mediaType, scenario.expected, scenario.label);
      assert.equal(row(state.db, result.outcome.attemptId).state, 'succeeded', scenario.label);
      assert.equal((state.db.prepare('SELECT media_type AS mediaType FROM artifact_manifests WHERE sha256=?').get(result.outcome.outputSha256) as { mediaType: string }).mediaType, scenario.expected, scenario.label);
    } finally { state.db.close(); }
  }
});

test('structured text schema mismatch fails before storage, while a bad output store closes persist_failed without a digest', async () => {
  nextId = 70;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('{"caption":7}') }, { result: textResult('store failure') }] });
  const first = setup(gateway);
  try {
    const value = input({ call: { modality: 'text', request: { model: 'gpt-5.6-sol', systemLayer: 'system', creativeLayer: 'creative', userInput: 'input' }, responseSchema: { type: 'object', required: ['caption'], properties: { caption: { type: 'string' } }, additionalProperties: false } } });
    await assert.rejects(first.service.run(value, { persist: () => 'unexpected' }), (error: unknown) => { assert.ok(error instanceof CreativeAiError); assert.equal(error.code, 'schema_mismatch'); return true; });
    assert.equal(row(first.db).error_code, 'schema_mismatch');
    assert.equal(row(first.db).output_sha256, null);
  } finally { first.db.close(); }

  const artifactFile = path.join(os.tmpdir(), `tdn-content-ai-artifact-file-${process.pid}-${nextId}`); roots.push(artifactFile); fs.writeFileSync(artifactFile, 'not a directory');
  const second = setup(gateway, artifactFile);
  try {
    await assert.rejects(runText(second, input(), { persist: () => 'unexpected' }), /ENOTDIR|not a directory/);
    assert.equal(row(second.db).error_code, 'persist_failed');
    assert.equal(row(second.db).output_sha256, null);
    assert.equal((second.db.prepare('SELECT count(*) count FROM artifact_manifests').get() as { count: bigint }).count, 0n);
  } finally { second.db.close(); }
});

test('stage failure and synchronous persist failure retain the verified output reference; domain writes roll back', async () => {
  nextId = 90;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('stage output') }, { result: textResult('persist output') }] });
  const stageState = setup(gateway); stageState.db.exec('CREATE TABLE test_domain_writes (value TEXT NOT NULL)');
  try {
    await assert.rejects(runText(stageState, input(), { stage: async () => { throw new Error('stage failed'); }, persist: () => 'never' }), /stage failed/);
    const stagedRow = row(stageState.db);
    assert.equal(stagedRow.state, 'failed'); assert.equal(stagedRow.error_code, 'persist_failed'); assert.equal(typeof stagedRow.output_sha256, 'string');
    assert.ok(fs.existsSync(outputFile(stageState.artifactRoot, stagedRow.output_sha256 as string)));
    assert.equal((stageState.db.prepare('SELECT count(*) count FROM test_domain_writes').get() as { count: bigint }).count, 0n);
  } finally { stageState.db.close(); }

  const persistState = setup(gateway); persistState.db.exec('CREATE TABLE test_domain_writes (value TEXT NOT NULL)');
  try {
    await assert.rejects(runText(persistState, input(), { persist: (outcome) => { persistState.db.prepare('INSERT INTO test_domain_writes(value) VALUES (?)').run(outcome.outputSha256); throw new Error('persist failed'); } }), /persist failed/);
    const persistedRow = row(persistState.db);
    assert.equal(persistedRow.state, 'failed'); assert.equal(persistedRow.error_code, 'persist_failed'); assert.equal(typeof persistedRow.output_sha256, 'string');
    assert.ok(fs.existsSync(outputFile(persistState.artifactRoot, persistedRow.output_sha256 as string)));
    assert.equal((persistState.db.prepare('SELECT count(*) count FROM test_domain_writes').get() as { count: bigint }).count, 0n);
  } finally { persistState.db.close(); }
});

test('async persist is rejected before the attempt row and gateway call; a returned promise fails after admission', async () => {
  nextId = 110;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('promise output') }] });
  const state = setup(gateway);
  try {
    await assert.rejects(state.service.run(input(), { persist: (async () => 'bad') as never }), /persist must be synchronous/);
    assert.equal((state.db.prepare('SELECT count(*) count FROM flow_content_ai_attempts').get() as { count: bigint }).count, 0n);
    assert.equal(gateway.calls.length, 0);
  } finally { state.db.close(); }

  const admitted = setup(gateway);
  try {
    await assert.rejects(runText(admitted, input(), { persist: () => Promise.resolve('bad') }), /synchronous|promise/);
    const attempt = row(admitted.db);
    assert.equal(attempt.state, 'failed'); assert.equal(attempt.error_code, 'persist_failed'); assert.equal(typeof attempt.output_sha256, 'string');
    assert.equal(gateway.calls.filter((call) => call.operation === 'generateText').length, 1);
  } finally { admitted.db.close(); }
});

test('plain service-owned output survives request-scoped artifact cleanup after persist throws', async () => {
  nextId = 130;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('published outside scope') }] });
  const state = setup(gateway);
  const scoped = new RequestScopedArtifactStore(state.artifactRoot);
  try {
    await assert.rejects(scoped.withOwnership(() => runText(state, input(), { persist: () => { throw new Error('domain failed'); } })), /domain failed/);
    const attempt = row(state.db);
    assert.equal(attempt.state, 'failed'); assert.equal(attempt.error_code, 'persist_failed');
    assert.ok(fs.existsSync(outputFile(state.artifactRoot, attempt.output_sha256 as string)));
    const ownerRequests = path.join(state.artifactRoot, '.owner-api-requests');
    assert.deepEqual(fs.existsSync(ownerRequests) ? fs.readdirSync(ownerRequests) : [], []);
  } finally { state.db.close(); }
});

test('manifest reuse preserves first-storage timestamps, while registration conflict leaves no claimed output reference', async () => {
  nextId = 150;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('reused bytes') }, { result: textResult('reused bytes') }, { result: textResult('conflicting bytes') }] });
  const state = setup(gateway);
  try {
    const first = await runText(state);
    const digest = first.outcome.outputSha256;
    const firstManifest = state.db.prepare('SELECT acquired_at acquiredAt, created_at createdAt FROM artifact_manifests WHERE sha256=?').get(digest) as { acquiredAt: string; createdAt: string };
    const second = await runText(state, input({ targetId: 'target-050' }));
    assert.equal(second.outcome.outputSha256, digest);
    assert.deepEqual(state.db.prepare('SELECT acquired_at acquiredAt, created_at createdAt FROM artifact_manifests WHERE sha256=?').get(digest), firstManifest);

    const conflictingBytes = Buffer.from('conflicting bytes');
    const conflictingDigest = createHash('sha256').update(conflictingBytes).digest('hex');
    const existing = await new ContentAddressedArtifactStore(state.artifactRoot).put(conflictingBytes);
    state.db.prepare(`INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
      VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)`).run(conflictingDigest, existing.byteSize, existing.relativePath, '2026-09-27T12:00:00.000Z', '2026-09-27T12:00:00.000Z');
    await assert.rejects(runText(state, input({ targetId: 'target-051' }), { persist: () => 'unexpected' }), /manifest metadata mismatch|conflict/);
    const conflictRow = row(state.db);
    assert.equal(conflictRow.error_code, 'persist_failed'); assert.equal(conflictRow.output_sha256, null);
    assert.equal(conflictRow.state, 'failed'); assert.ok(fs.existsSync(outputFile(state.artifactRoot, conflictingDigest)));
  } finally { state.db.close(); }
});

test('escaped provider credentials are rejected before stage or persist, including responseSchema without responseFormat', async () => {
  nextId = 170;
  const escaped = SENTINEL.split('').map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const response = new Response(JSON.stringify({ choices: [{ message: { content: `{"caption":"${escaped}"}` } }] }), { status: 200 });
  const gateway = createCliproxyCreativeGateway({ configuration: { baseUrl: 'http://127.0.0.1:8317', apiKey: SENTINEL }, transport: async () => response });
  const state = setup(gateway);
  let stageCalls = 0; let persistCalls = 0;
  try {
    const value = input({ call: { modality: 'text', request: { model: 'gpt-5.6-sol', systemLayer: 'system', creativeLayer: 'creative', userInput: 'input' }, responseSchema: { type: 'object' } } });
    await assert.rejects(state.service.run(value, { stage: async () => { stageCalls += 1; return 'stage'; }, persist: () => { persistCalls += 1; return 'persist'; } }), (error: unknown) => {
      assert.ok(error instanceof CreativeAiError); assert.equal(error.code, 'malformed_envelope');
      assert.doesNotMatch(error.message, new RegExp(SENTINEL)); assert.doesNotMatch(error.stack ?? '', new RegExp(SENTINEL));
      assert.equal(Object.hasOwn(error, 'cause'), false); return true;
    });
    assert.equal(stageCalls, 0); assert.equal(persistCalls, 0);
    assert.equal(row(state.db).error_code, 'malformed_envelope');
    assert.equal((state.db.prepare('SELECT count(*) count FROM artifact_manifests').get() as { count: bigint }).count, 0n);
  } finally { state.db.close(); }
});

test('input-boundary rejection, running count/sweep, and list ordering stay outside provider dispatch', async () => {
  nextId = 190;
  const gateway = createFakeCreativeGateway({ text: [{ result: textResult('unused') }] });
  const state = setup(gateway);
  try {
    await assert.rejects(runText(state, input({ plannedActionCallCount: '3' as never })), /plannedActionCallCount/);
    assert.equal(gateway.calls.length, 0);
    state.db.prepare(`INSERT INTO flow_content_ai_attempts(attempt_id,kind,modality,target_type,target_id,model,prompt_ref,input_bundle_sha256,planned_action_call_count,state,actor_id,created_at)
      VALUES (?, 'generate', 'text', 'campaign', 'running-a', 'gpt-5.6-sol', 'prompt:a', ?, 1, 'running', 'owner:local', ?),
             (?, 'generate', 'text', 'campaign', 'running-b', 'gpt-5.6-sol', 'prompt:b', ?, 1, 'running', 'owner:local', ?)`)
      .run('00000000-0000-4000-8000-000000000191', inputSha, '2026-09-27T10:00:00.000Z', '00000000-0000-4000-8000-000000000192', inputSha, '2026-09-27T10:00:01.000Z');
    assert.equal(state.service.countRunning(), 2);
    assert.equal(state.service.sweepInterrupted(new Date('2026-09-27T10:00:02.000Z')), 2);
    assert.equal(state.service.countRunning(), 0);
    const listed = state.service.list({ state: 'interrupted', limit: 50 });
    assert.deepEqual(listed.map((attempt) => attempt.errorCode), ['interrupted_by_restart', 'interrupted_by_restart']);
  } finally { state.db.close(); }
});

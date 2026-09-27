import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeAiError, type CreativeAiGateway, type CreativeModelAvailability } from '../../src/platform/ai/creative-ai-gateway.js';
import { CONTENT_AI_NOT_CONFIGURED, createContentAiStatusSource } from '../../src/modules/flow/content-ai-status.js';

function clockState() {
  let milliseconds = Date.parse('2026-09-27T10:00:00.000Z');
  return { now: () => new Date(milliseconds), advance: (amount: number) => { milliseconds += amount; } };
}

function gateway(overrides: Partial<CreativeAiGateway> = {}): CreativeAiGateway {
  return {
    configured: true,
    generateText: async () => ({ text: 'unused', latencyMs: 0 }),
    generateImage: async () => ({ bytes: Buffer.from('unused'), latencyMs: 0 }),
    listModels: async () => [],
    ...overrides,
  };
}

test('not configured status is stable, checkedAt-null, all false, and never calls the gateway', async () => {
  let calls = 0;
  const source = createContentAiStatusSource({
    gateway: gateway({ configured: false, listModels: async () => { calls += 1; return []; } }),
    clock: () => new Date('2026-09-27T10:00:00.000Z'),
  });
  const status = await source.read();
  assert.deepEqual(status, CONTENT_AI_NOT_CONFIGURED);
  assert.equal(status.checkedAt, null);
  assert.equal(status.models.length, 5);
  assert.ok(status.models.every((model) => model.available === false));
  assert.equal(calls, 0);
});

test('configured discovery intersects the allowlist and caches successful reads for five minutes', async () => {
  const time = clockState();
  let calls = 0;
  const listed = [
    { id: 'gpt-5.6-sol' as const, kind: 'text' as const, available: true },
    { id: 'not-allowlisted', kind: 'image', available: true },
  ] as unknown as readonly CreativeModelAvailability[];
  const source = createContentAiStatusSource({ gateway: gateway({ listModels: async () => { calls += 1; return listed; } }), clock: time.now });
  const first = await source.read();
  const cached = await source.read();
  assert.equal(calls, 1);
  assert.strictEqual(cached, first);
  assert.equal(first.configured, true);
  assert.equal(first.error, undefined);
  assert.equal(first.models.filter((model) => model.available).map((model) => model.id).join(','), 'gpt-5.6-sol');
  time.advance(299_999); await source.read(); assert.equal(calls, 1);
  time.advance(1); await source.read(); assert.equal(calls, 2);
});

test('concurrent configured reads share one in-flight listing request', async () => {
  const time = clockState();
  let calls = 0;
  let resolve: ((models: readonly CreativeModelAvailability[]) => void) | undefined;
  const source = createContentAiStatusSource({
    gateway: gateway({ listModels: () => { calls += 1; return new Promise((done) => { resolve = done; }); } }),
    clock: time.now,
  });
  const first = source.read();
  const second = source.read();
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  resolve!([{ id: 'gemini-3.1-flash-image', kind: 'image', available: true }]);
  const [a, b] = await Promise.all([first, second]);
  assert.strictEqual(a, b);
  assert.deepEqual(a.models.filter((model) => model.available).map((model) => model.id), ['gemini-3.1-flash-image']);
});

test('discovery failures degrade to all unavailable and use the thirty-second failure TTL', async () => {
  const time = clockState();
  let calls = 0;
  const source = createContentAiStatusSource({
    gateway: gateway({ listModels: async () => { calls += 1; throw new Error('provider details must not escape'); } }),
    clock: time.now,
  });
  const failed = await source.read();
  assert.deepEqual({ configured: failed.configured, error: failed.error, allUnavailable: failed.models.every((model) => !model.available) }, { configured: true, error: 'network_error', allUnavailable: true });
  await source.read(); assert.equal(calls, 1);
  time.advance(30_000); await source.read(); assert.equal(calls, 2);

  const typed = createContentAiStatusSource({
    gateway: gateway({ listModels: async () => { throw new CreativeAiError('gateway_http_error', 503); } }),
    clock: time.now,
  });
  assert.equal((await typed.read()).error, 'gateway_http_error');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATIVE_AI_ERROR_CODES,
  CREATIVE_AI_ERROR_MESSAGES,
  CreativeAiError,
  CREATIVE_MODEL_ROUTES,
  assertCreativeModelRoutes,
  providerModelFor,
  type CreativeModelRoutes,
} from '../../src/platform/ai/creative-ai-gateway.js';
import {
  createFakeCreativeGateway,
  disabledCreativeGateway,
} from '../../src/platform/ai/fake-creative-gateway.js';

const textRequest = {
  model: 'gpt-5.6-sol' as const,
  systemLayer: 'system',
  creativeLayer: 'creative',
  userInput: 'input',
};

function mutableRoutes(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(CREATIVE_MODEL_ROUTES).map(([model, route]) => [model, { ...route }])) as Record<string, Record<string, unknown>>;
}

test('CreativeAiError has one fixed message per code and never carries a cause', () => {
  for (const code of CREATIVE_AI_ERROR_CODES) {
    const error = new CreativeAiError(code, 502);
    assert.equal(error.name, 'CreativeAiError');
    assert.equal(error.code, code);
    assert.equal(error.message, CREATIVE_AI_ERROR_MESSAGES[code]);
    assert.equal(error.httpStatus, 502);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(error.cause, undefined);
  }
});

test('creative model routes require exactly the allowlisted models and preserve kind and family', () => {
  const missing = mutableRoutes();
  delete missing['gpt-5.6-sol'];
  assert.throws(() => assertCreativeModelRoutes(missing), /routes must list exactly the creative models/);

  const extra = mutableRoutes();
  extra.unexpected = { kind: 'text', family: 'openai-chat', providerModelId: 'unexpected' };
  assert.throws(() => assertCreativeModelRoutes(extra), /routes must list exactly the creative models/);

  for (const [field, value] of [['kind', 'image'], ['family', 'gemini-image']] as const) {
    const changed = mutableRoutes();
    changed['gpt-5.6-sol']![field] = value;
    assert.throws(() => assertCreativeModelRoutes(changed), /route for gpt-5\.6-sol is invalid/);
  }
});

test('creative model routes reject provider ids outside the storage and URL contract', () => {
  for (const providerModelId of ['bad/id', '', 'a'.repeat(129)]) {
    const routes = mutableRoutes();
    routes['gpt-5.6-sol']!.providerModelId = providerModelId;
    assert.throws(() => assertCreativeModelRoutes(routes), /route for gpt-5\.6-sol is invalid/);
  }
});

test('providerModelFor uses the default route table when a gateway has no custom routes', () => {
  const custom: CreativeModelRoutes = {
    ...CREATIVE_MODEL_ROUTES,
    'gemini-3.5-flash-low': { ...CREATIVE_MODEL_ROUTES['gemini-3.5-flash-low'], providerModelId: 'gemini-9.9-flash' },
  };
  assert.equal(providerModelFor({}, 'gemini-3.5-flash-low'), 'gemini-3.8-flash-high');
  assert.equal(providerModelFor({ routes: custom }, 'gemini-3.5-flash-low'), 'gemini-9.9-flash');
});

test('disabledCreativeGateway reports configuration state and the fixed not-configured error for every operation', async () => {
  const gateway = disabledCreativeGateway();
  assert.equal(gateway.configured, false);
  await assert.rejects(gateway.generateText(textRequest), (error: unknown) => {
    assert.ok(error instanceof CreativeAiError);
    assert.equal(error.code, 'ai_not_configured');
    assert.equal(error.message, CREATIVE_AI_ERROR_MESSAGES.ai_not_configured);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
  await assert.rejects(gateway.generateImage({ model: 'gpt-image-2', prompt: 'image', format: 'square', references: [] }), (error: unknown) => {
    assert.ok(error instanceof CreativeAiError);
    assert.equal(error.code, 'ai_not_configured');
    return true;
  });
  await assert.rejects(gateway.listModels(), (error: unknown) => {
    assert.ok(error instanceof CreativeAiError);
    assert.equal(error.code, 'ai_not_configured');
    return true;
  });
});

test('fake gateway consumes scripted replies and records the public calls', async () => {
  const textResult = { text: 'ok', latencyMs: 3 } as const;
  const imageResult = { bytes: Buffer.from('image'), latencyMs: 4 } as const;
  const models = [{ id: 'gpt-5.6-sol' as const, kind: 'text' as const, available: true }];
  const gateway = createFakeCreativeGateway({
    text: [{ result: textResult }],
    image: [{ result: imageResult }],
    models: [{ result: models }],
  });
  assert.equal(gateway.configured, true);
  assert.deepEqual(await gateway.generateText(textRequest), textResult);
  assert.deepEqual(await gateway.generateImage({ model: 'gpt-image-2', prompt: 'image', format: 'square', references: [] }), imageResult);
  assert.deepEqual(await gateway.listModels(), models);
  assert.deepEqual(gateway.calls.map((call) => call.operation), ['generateText', 'generateImage', 'listModels']);
  assert.deepEqual(gateway.calls[0], { operation: 'generateText', request: textRequest });
  await assert.rejects(gateway.generateText(textRequest), /no scripted generateText reply/);
});

test('fake gateway preserves scripted CreativeAiError identity and accepts arbitrary rejected values', async () => {
  const providerError = new CreativeAiError('gateway_http_error', 503);
  const arbitrary = { unsafe: true };
  const gateway = createFakeCreativeGateway({ text: [{ error: providerError }, { error: arbitrary }] });
  await assert.rejects(gateway.generateText(textRequest), (error: unknown) => error === providerError);
  await assert.rejects(gateway.generateText(textRequest), (error: unknown) => error === arbitrary);
});

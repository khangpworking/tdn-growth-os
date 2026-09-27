import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATIVE_AI_ERROR_CODES,
  CREATIVE_AI_ERROR_MESSAGES,
  CreativeAiError,
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

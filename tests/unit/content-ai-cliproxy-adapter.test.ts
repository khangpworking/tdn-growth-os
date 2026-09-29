import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIPROXY_GEMINI_IMAGE_OUTPUT_BYTES,
  CLIPROXY_GPT_IMAGE_OUTPUT_BYTES,
  CLIPROXY_GPT_IMAGE_REFERENCE_BYTES,
  CLIPROXY_HTTP_ERROR_DRAIN_BYTES,
  CLIPROXY_TEXT_REQUEST_BYTES,
  CLIPROXY_TEXT_RESPONSE_BYTES,
  createCliproxyCreativeGateway,
} from '../../src/platform/ai/cliproxy-creative-gateway.js';
import {
  CreativeAiError,
  CREATIVE_MODEL_ROUTES,
  type CreativeImageRequest,
  type CreativeModelRoutes,
  type CreativeTextRequest,
} from '../../src/platform/ai/creative-ai-gateway.js';

const API_KEY = 'cliproxy-sentinel-key-049';
const configuration = { baseUrl: 'http://127.0.0.1:8317', apiKey: API_KEY } as const;

type Call = { readonly url: string; readonly init: RequestInit };

function responseFromChunks(chunks: readonly (Buffer | string)[], status = 200, headers: Record<string, string> = {}) {
  let cancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) { controller.close(); return; }
      const chunk = chunks[index++]!;
      controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    },
    cancel() { cancelled = true; },
  });
  const trackedBody = {
    getReader() {
      const reader = body.getReader();
      return {
        read: reader.read.bind(reader),
        cancel(reason?: unknown) { cancelled = true; return reader.cancel(reason); },
        releaseLock: reader.releaseLock.bind(reader),
      };
    },
    cancel() { cancelled = true; return body.cancel(); },
  };
  const response = { status, ok: status >= 200 && status < 300, headers: new Headers(headers), body: trackedBody } as unknown as Response;
  return { response, get cancelled() { return cancelled; } };
}

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return responseFromChunks([JSON.stringify(value)], status, headers);
}

function transportFor(replies: readonly (Response | Error)[] | ((call: Call, index: number) => Response | Error)) {
  const calls: Call[] = [];
  let index = 0;
  const transport: typeof fetch = async (input, init) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    const reply = typeof replies === 'function' ? replies(call, index) : replies[index];
    index += 1;
    if (!reply) throw new Error('test transport reply missing');
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { calls, transport };
}

function headerValue(init: RequestInit, name: string): string | null {
  const headers = new Headers(init.headers);
  return headers.get(name);
}

async function jsonBody(init: RequestInit): Promise<Record<string, unknown>> {
  assert.equal(typeof init.body, 'string');
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

async function formEntries(init: RequestInit): Promise<Array<{ name: string; value: string; filename?: string; bytes?: Buffer }>> {
  assert.ok(init.body instanceof FormData);
  const entries: Array<{ name: string; value: string; filename?: string; bytes?: Buffer }> = [];
  for (const [name, value] of (init.body as FormData).entries()) {
    if (typeof value === 'string') entries.push({ name, value });
    else entries.push({ name, value: '', filename: value.name, bytes: Buffer.from(await value.arrayBuffer()) });
  }
  return entries;
}

function assertSafeError(error: unknown, code: string, httpStatus?: number): asserts error is CreativeAiError {
  assert.ok(error instanceof CreativeAiError);
  assert.equal(error.code, code);
  if (httpStatus === undefined) assert.equal(error.httpStatus, undefined);
  else assert.equal(error.httpStatus, httpStatus);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  const secret = new RegExp(API_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  assert.doesNotMatch(error.message, secret);
  assert.doesNotMatch(error.stack ?? '', secret);
  for (const key of Object.getOwnPropertyNames(error)) {
    const value = (error as unknown as Record<string, unknown>)[key];
    assert.doesNotMatch(typeof value === 'string' ? value : JSON.stringify(value) ?? '', secret);
  }
}

const textRequest: CreativeTextRequest = {
  model: 'gpt-5.6-sol',
  systemLayer: 'system layer',
  creativeLayer: 'creative layer',
  userInput: 'write a caption',
  maxOutputTokens: 321,
  responseFormat: { name: 'caption', jsonSchema: { type: 'object', properties: { caption: { type: 'string' } } } },
};
const { responseFormat: textResponseFormatForTests, ...textRequestWithoutResponseFormat } = textRequest;
void textResponseFormatForTests;

test('text requests use the fixed OpenAI envelope, limits, headers, usage and latency', async () => {
  const reply = jsonResponse({
    id: 'provider-request-049',
    choices: [{ message: { content: 'caption text' } }],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: -1 },
  });
  const state = transportFor([reply.response]);
  let ticks = 1000;
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport, now: () => (ticks += 37) });
  const result = await gateway.generateText(textRequest);

  assert.deepEqual(result, { text: 'caption text', usage: { inputTokens: 12, outputTokens: 7 }, latencyMs: 37, providerRequestId: 'provider-request-049' });
  assert.equal(state.calls.length, 1);
  const call = state.calls[0]!;
  assert.equal(call.url, `${configuration.baseUrl}/v1/chat/completions`);
  assert.equal(call.init.method, 'POST');
  assert.equal(headerValue(call.init, 'authorization'), `Bearer ${API_KEY}`);
  assert.equal(headerValue(call.init, 'accept'), 'application/json');
  assert.equal(headerValue(call.init, 'content-type'), 'application/json; charset=utf-8');
  assert.equal(headerValue(call.init, 'x-goog-api-key'), null);
  assert.equal(call.init.redirect, 'error');
  const body = await jsonBody(call.init);
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'system layer' },
    { role: 'system', content: 'creative layer' },
    { role: 'user', content: 'write a caption' },
  ]);
  assert.equal(body.model, 'gpt-5.6-sol');
  assert.equal(body.temperature, 0.7);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 321);
  assert.deepEqual(body.response_format, {
    type: 'json_schema',
    json_schema: { name: 'caption', schema: textRequest.responseFormat!.jsonSchema, strict: true },
  });
});

test('Gemini text keeps the product model while sending its routed provider model', async () => {
  const reply = jsonResponse({ id: 'gemini-provider-request-049', choices: [{ message: { content: 'gemini caption' } }] });
  const state = transportFor([reply.response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  const request: CreativeTextRequest = { ...textRequest, model: 'gemini-3.5-flash-low' };
  const result = await gateway.generateText(request);

  assert.equal(result.text, 'gemini caption');
  const body = await jsonBody(state.calls[0]!.init);
  assert.equal(body.model, 'gemini-3.8-flash-high');
});

test('custom routes send their provider ids in text bodies and Gemini image URL paths', async () => {
  const routes: CreativeModelRoutes = {
    ...CREATIVE_MODEL_ROUTES,
    'gemini-3.5-flash-low': { ...CREATIVE_MODEL_ROUTES['gemini-3.5-flash-low'], providerModelId: 'gemini-9.9-flash' },
    'gemini-3.1-flash-image': { ...CREATIVE_MODEL_ROUTES['gemini-3.1-flash-image'], providerModelId: 'gemini-9.9-flash-image' },
  };
  const state = transportFor([
    jsonResponse({ choices: [{ message: { content: 'custom route text' } }] }).response,
    jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('custom route image').toString('base64') } }] } }] }).response,
  ]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport, routes });

  await gateway.generateText({ ...textRequest, model: 'gemini-3.5-flash-low' });
  await gateway.generateImage({ model: 'gemini-3.1-flash-image', prompt: 'custom route poster', format: 'square', references: [] });

  const textBody = await jsonBody(state.calls[0]!.init);
  assert.equal(textBody.model, 'gemini-9.9-flash');
  assert.equal(state.calls[1]!.url, `${configuration.baseUrl}/v1beta/models/gemini-9.9-flash-image:generateContent`);
});

test('ordinary non-JSON creative text remains valid', async () => {
  const state = transportFor([jsonResponse({ choices: [{ message: { content: 'a sentence with no JSON contract' } }] }).response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  const result = await gateway.generateText(textRequestWithoutResponseFormat);
  assert.equal(result.text, 'a sentence with no JSON contract');
});

test('text scans parsed output even without responseFormat and rejects escaped secrets', async () => {
  const escapedKey = API_KEY.split('').map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const content = `{"caption":"${escapedKey}"}`;
  const state = transportFor([jsonResponse({ choices: [{ message: { content } }] }).response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  await assert.rejects(
    gateway.generateText({ ...textRequestWithoutResponseFormat, responseSchema: { type: 'object' } } as unknown as CreativeTextRequest),
    (error: unknown) => { assertSafeError(error, 'malformed_envelope'); return true; },
  );
});

test('envelope keys, provider ids, and transport failures never leak the key', async () => {
  const envelopeKey = jsonResponse({ choices: [{ message: { content: 'ok' } }], [API_KEY]: 'value' });
  const providerId = jsonResponse({ choices: [{ message: { content: 'ok' } }], id: API_KEY });
  const escapedTransport = new Error(`provider said ${API_KEY}`);
  const cases: Array<{ reply: Response | Error; code: string }> = [
    { reply: envelopeKey.response, code: 'malformed_envelope' },
    { reply: providerId.response, code: 'malformed_envelope' },
    { reply: escapedTransport, code: 'network_error' },
  ];
  for (const scenario of cases) {
    const state = transportFor([scenario.reply]);
    const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
    await assert.rejects(gateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, scenario.code); return true; });
  }
});

test('GPT image generation and edit requests preserve the image contract', async () => {
  const generated = jsonResponse({ id: 'image-049', data: [{ b64_json: '' }, { b64_json: Buffer.from('generated-image').toString('base64') }] });
  const edited = jsonResponse({ data: [{ b64_json: Buffer.from('edited-image').toString('base64') }] });
  const state = transportFor([generated.response, edited.response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  const generatedResult = await gateway.generateImage({ model: 'gpt-image-2', prompt: 'make a square', format: 'square', references: [] });
  const editedResult = await gateway.generateImage({
    model: 'gpt-image-2', prompt: 'edit the source', format: 'portrait',
    references: [{ bytes: Buffer.from('source-png'), mediaType: 'image/png' }],
  });
  assert.deepEqual(generatedResult.bytes, Buffer.from('generated-image'));
  assert.equal(generatedResult.providerRequestId, 'image-049');
  assert.deepEqual(editedResult.bytes, Buffer.from('edited-image'));
  assert.equal(state.calls[0]!.url, `${configuration.baseUrl}/v1/images/generations`);
  assert.equal(state.calls[1]!.url, `${configuration.baseUrl}/v1/images/edits`);
  assert.equal(headerValue(state.calls[0]!.init, 'content-type'), 'application/json; charset=utf-8');
  assert.equal(headerValue(state.calls[1]!.init, 'accept'), 'application/json');
  assert.equal(headerValue(state.calls[1]!.init, 'content-type'), null);
  const generationBody = await jsonBody(state.calls[0]!.init);
  assert.deepEqual(generationBody, { model: 'gpt-image-2', prompt: 'make a square', n: 1, size: '1088x1088', response_format: 'b64_json' });
  const editEntries = await formEntries(state.calls[1]!.init);
  assert.deepEqual(editEntries.map(({ name, value, filename }) => ({ name, value, filename })), [
    { name: 'image', value: '', filename: 'source.png' },
    { name: 'prompt', value: 'edit the source', filename: undefined },
    { name: 'model', value: 'gpt-image-2', filename: undefined },
    { name: 'n', value: '1', filename: undefined },
    { name: 'size', value: '1088x1360', filename: undefined },
    { name: 'response_format', value: 'b64_json', filename: undefined },
  ]);
  assert.deepEqual(editEntries[0]!.bytes, Buffer.from('source-png'));
});

test('GPT multi-reference edits and Gemini inline parts retain reference order and auth', async () => {
  const response = jsonResponse({ data: [{ b64_json: Buffer.from('gpt-many').toString('base64') }] });
  const geminiResponse = jsonResponse({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: `data:image/jpeg;base64,${Buffer.from('gemini').toString('base64')}` } }] } }] });
  const state = transportFor([response.response, geminiResponse.response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  await gateway.generateImage({
    model: 'gpt-image-2', prompt: 'many', format: 'landscape', references: [
      { bytes: Buffer.from('one'), mediaType: 'image/png' },
      { bytes: Buffer.from('two'), mediaType: 'image/jpeg' },
    ],
  });
  const geminiResult = await gateway.generateImage({
    model: 'gemini-3.1-flash-image', prompt: 'gemini', format: 'story', references: [
      { bytes: Buffer.from('a'), mediaType: 'image/png' },
      { bytes: Buffer.from('b'), mediaType: 'image/jpeg' },
    ],
  });
  const gptEntries = await formEntries(state.calls[0]!.init);
  assert.deepEqual(gptEntries.filter((entry) => entry.name === 'image[]').map((entry) => [entry.filename, entry.bytes?.toString()]), [['source-1.png', 'one'], ['source-2.jpg', 'two']]);
  assert.equal(state.calls[1]!.url, `${configuration.baseUrl}/v1beta/models/gemini-3.1-flash-image:generateContent`);
  assert.equal(headerValue(state.calls[1]!.init, 'x-goog-api-key'), API_KEY);
  const geminiBody = await jsonBody(state.calls[1]!.init);
  const parts = ((geminiBody.contents as Array<{ parts: unknown[] }>)[0]!.parts) as Array<Record<string, unknown>>;
  assert.deepEqual(parts.map((part) => Object.keys(part)), [['inlineData'], ['inlineData'], ['text']]);
  assert.deepEqual((parts[0]!.inlineData as Record<string, unknown>).data, Buffer.from('a').toString('base64'));
  assert.deepEqual((parts[1]!.inlineData as Record<string, unknown>).data, Buffer.from('b').toString('base64'));
  assert.deepEqual(geminiResult.bytes, Buffer.from('gemini'));
  assert.equal(geminiResult.declaredMediaType, 'image/jpeg');
});

test('model discovery intersects provider ids with the five allowlisted models', async () => {
  const state = transportFor([jsonResponse({ data: [{ id: 'gpt-5.6-sol' }, { id: 'not-allowlisted' }, { id: 'gemini-3.1-flash-image' }] }).response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  const models = await gateway.listModels();
  assert.deepEqual(models.map(({ id, kind, available }) => ({ id, kind, available })), [
    { id: 'gpt-5.6-sol', kind: 'text', available: true },
    { id: 'gpt-5.6-luna', kind: 'text', available: false },
    { id: 'gemini-3.5-flash-low', kind: 'text', available: false },
    { id: 'gpt-image-2', kind: 'image', available: false },
    { id: 'gemini-3.1-flash-image', kind: 'image', available: true },
  ]);
  assert.equal(state.calls[0]!.url, `${configuration.baseUrl}/v1/models`);
  assert.equal(state.calls[0]!.init.method, 'GET');
});

test('model discovery uses the routed provider id and preserves the other four provider ids', async () => {
  const routes = [
    { productId: 'gpt-5.6-sol', providerId: 'gpt-5.6-sol', kind: 'text' },
    { productId: 'gpt-5.6-luna', providerId: 'gpt-5.6-luna', kind: 'text' },
    { productId: 'gpt-image-2', providerId: 'gpt-image-2', kind: 'image' },
    { productId: 'gemini-3.1-flash-image', providerId: 'gemini-3.1-flash-image', kind: 'image' },
    { productId: 'gemini-3.5-flash-low', providerId: 'gemini-3.8-flash-high', kind: 'text' },
  ] as const;

  for (const route of routes) {
    const state = transportFor([jsonResponse({ data: [{ id: route.providerId }] }).response]);
    const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
    const models = await gateway.listModels();
    assert.deepEqual(models.filter((model) => model.available), [{ id: route.productId, kind: route.kind, available: true }], route.productId);
  }

  const oldIdOnly = transportFor([jsonResponse({ data: [{ id: 'gemini-3.5-flash-low' }] }).response]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: oldIdOnly.transport });
  const models = await gateway.listModels();
  assert.deepEqual(models.filter((model) => model.available), []);
});

test('model and request-size validation happens before transport', async () => {
  const state = transportFor([]);
  const gateway = createCliproxyCreativeGateway({ configuration, transport: state.transport });
  await assert.rejects(gateway.generateText({ ...textRequest, model: 'gpt-image-2' } as unknown as CreativeTextRequest), (error: unknown) => { assertSafeError(error, 'model_not_allowed'); return true; });
  await assert.rejects(gateway.generateText({ ...textRequest, userInput: 'x'.repeat(CLIPROXY_TEXT_REQUEST_BYTES) }), (error: unknown) => { assertSafeError(error, 'request_too_large'); return true; });
  await assert.rejects(gateway.generateImage({ model: 'gpt-image-2', prompt: 'too many', format: 'square', references: Array.from({ length: 5 }, () => ({ bytes: Buffer.from('x'), mediaType: 'image/png' as const })) }), (error: unknown) => { assertSafeError(error, 'request_too_large'); return true; });
  await assert.rejects(gateway.generateImage({ model: 'gpt-image-2', prompt: 'too many bytes', format: 'square', references: [{ bytes: Buffer.alloc(CLIPROXY_GPT_IMAGE_REFERENCE_BYTES + 1), mediaType: 'image/png' }] }), (error: unknown) => { assertSafeError(error, 'request_too_large'); return true; });
  assert.equal(state.calls.length, 0);
});

test('timeout, network, HTTP, malformed, and oversized responses use fixed safe codes and cancel abandoned bodies', async () => {
  const originalTimeout = AbortSignal.timeout;
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => AbortSignal.abort(new DOMException('adapter timer fired', 'TimeoutError')) });
  try {
    const timeoutTransport: typeof fetch = async (_input, init) => {
      assert.equal((init?.signal as AbortSignal).aborted, true);
      throw Object.assign(new Error(`timeout ${API_KEY}`), { name: 'AbortError' });
    };
    const timeoutGateway = createCliproxyCreativeGateway({ configuration, transport: timeoutTransport });
    await assert.rejects(timeoutGateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'timeout'); return true; });
  } finally {
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: originalTimeout });
  }

  const redirectTransport: typeof fetch = async () => { throw new TypeError(`redirect ${API_KEY}`); };
  const redirectGateway = createCliproxyCreativeGateway({ configuration, transport: redirectTransport });
  await assert.rejects(redirectGateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'network_error'); return true; });

  const http = responseFromChunks([API_KEY.repeat(1000)], 502);
  const httpState = transportFor([http.response]);
  const httpGateway = createCliproxyCreativeGateway({ configuration, transport: httpState.transport });
  await assert.rejects(httpGateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'gateway_http_error', 502); return true; });
  assert.equal(http.cancelled, true);

  const malformedGateway = createCliproxyCreativeGateway({ configuration, transport: transportFor([responseFromChunks(['not json']).response]).transport });
  await assert.rejects(malformedGateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'malformed_envelope'); return true; });

  const declared = responseFromChunks(['small'], 200, { 'content-length': String(CLIPROXY_TEXT_RESPONSE_BYTES + 1) });
  const declaredGateway = createCliproxyCreativeGateway({ configuration, transport: transportFor([declared.response]).transport });
  await assert.rejects(declaredGateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'response_too_large'); return true; });
  assert.equal(declared.cancelled, true);

  const streamed = responseFromChunks([Buffer.alloc(CLIPROXY_TEXT_RESPONSE_BYTES), Buffer.from('overflow')]);
  const streamedGateway = createCliproxyCreativeGateway({ configuration, transport: transportFor([streamed.response]).transport });
  await assert.rejects(streamedGateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'response_too_large'); return true; });
  assert.equal(streamed.cancelled, true);
  assert.ok(CLIPROXY_HTTP_ERROR_DRAIN_BYTES <= CLIPROXY_TEXT_RESPONSE_BYTES);
});

test('provider TimeoutError before the adapter timer fires is a network error', async () => {
  const providerTimeoutTransport: typeof fetch = async () => {
    throw new DOMException(`provider timeout ${API_KEY}`, 'TimeoutError');
  };
  const gateway = createCliproxyCreativeGateway({ configuration, transport: providerTimeoutTransport });
  await assert.rejects(gateway.generateText(textRequest), (error: unknown) => { assertSafeError(error, 'network_error'); return true; });
});

test('decoded image output is bounded and never returns bytes containing the key', async () => {
  const tooLarge = Buffer.alloc(CLIPROXY_GPT_IMAGE_OUTPUT_BYTES + 1, 0x01);
  const largeGateway = createCliproxyCreativeGateway({ configuration, transport: transportFor([jsonResponse({ data: [{ b64_json: tooLarge.toString('base64') }] }).response]).transport });
  await assert.rejects(largeGateway.generateImage({ model: 'gpt-image-2', prompt: 'large', format: 'square', references: [] }), (error: unknown) => { assertSafeError(error, 'response_too_large'); return true; });

  const secretBytesGateway = createCliproxyCreativeGateway({ configuration, transport: transportFor([jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from(API_KEY).toString('base64') } }] } }] }).response]).transport });
  await assert.rejects(secretBytesGateway.generateImage({ model: 'gemini-3.1-flash-image', prompt: 'secret', format: 'square', references: [] }), (error: unknown) => { assertSafeError(error, 'malformed_envelope'); return true; });
  assert.equal(CLIPROXY_GEMINI_IMAGE_OUTPUT_BYTES, CLIPROXY_GPT_IMAGE_OUTPUT_BYTES);
});

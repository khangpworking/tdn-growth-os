import { Buffer } from 'node:buffer';
import {
  CREATIVE_IMAGE_FORMATS,
  CREATIVE_MODEL_ROUTES,
  CREATIVE_MODELS,
  CreativeAiError,
  assertCreativeModelRoutes,
  type CreativeAiErrorCode,
  type CreativeAiGateway,
  type CreativeImageRequest,
  type CreativeImageResult,
  type CreativeModel,
  type CreativeModelAvailability,
  type CreativeModelRoutes,
  type CreativeTextRequest,
  type CreativeTextResult,
  type CreativeUsage,
} from './creative-ai-gateway.js';
import { assertCliproxyConfiguration, type CliproxyConfiguration } from './cliproxy-configuration.js';

export const CLIPROXY_TEXT_REQUEST_BYTES = 1 * 1024 * 1024;
export const CLIPROXY_TEXT_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CLIPROXY_TEXT_TIMEOUT_MS = 120 * 1000;

export const CLIPROXY_GPT_IMAGE_REFERENCE_BYTES = 20 * 1024 * 1024;
export const CLIPROXY_GPT_IMAGE_REQUEST_BYTES = 48 * 1024 * 1024;
export const CLIPROXY_GPT_IMAGE_RESPONSE_BYTES = 30 * 1024 * 1024;
export const CLIPROXY_GPT_IMAGE_OUTPUT_BYTES = 8 * 1024 * 1024;
export const CLIPROXY_GPT_IMAGE_TIMEOUT_MS = 25 * 60 * 1000;

export const CLIPROXY_GEMINI_IMAGE_REFERENCE_BYTES = 7 * 1024 * 1024;
export const CLIPROXY_GEMINI_IMAGE_REQUEST_BYTES = 16 * 1024 * 1024;
export const CLIPROXY_GEMINI_IMAGE_RESPONSE_BYTES = 30 * 1024 * 1024;
export const CLIPROXY_GEMINI_IMAGE_OUTPUT_BYTES = 8 * 1024 * 1024;
export const CLIPROXY_GEMINI_IMAGE_TIMEOUT_MS = 6 * 60 * 1000;

export const CLIPROXY_MODELS_RESPONSE_BYTES = 1 * 1024 * 1024;
export const CLIPROXY_MODELS_TIMEOUT_MS = 10 * 1000;
export const CLIPROXY_MAX_REFERENCES = 4;
export const CLIPROXY_HTTP_ERROR_DRAIN_BYTES = 4 * 1024;

type AdapterFailureCode = Exclude<
  CreativeAiErrorCode,
  'ai_not_configured' | 'invalid_image' | 'schema_mismatch'
>;

class AdapterFailure extends Error {
  readonly code: AdapterFailureCode;
  readonly httpStatus: number | undefined;

  constructor(code: AdapterFailureCode, httpStatus?: number) {
    super(code);
    this.name = 'AdapterFailure';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function fail(code: AdapterFailureCode, httpStatus?: number): never {
  throw new AdapterFailure(code, httpStatus);
}

function safeAdapterError(error: unknown): CreativeAiError {
  if (error instanceof AdapterFailure) return new CreativeAiError(error.code, error.httpStatus);
  if (error instanceof CreativeAiError) return new CreativeAiError(error.code, error.httpStatus);
  return new CreativeAiError('network_error');
}

function safeCall<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => { throw safeAdapterError(error); });
}

function containsSecret(value: unknown, secret: string): boolean {
  if (typeof value === 'string') return value.includes(secret);
  if (Array.isArray(value)) return value.some((entry) => containsSecret(entry, secret));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([key, entry]) => key.includes(secret) || containsSecret(entry, secret));
  }
  return false;
}

function containsSecretBytes(bytes: Buffer, secret: string): boolean {
  return bytes.includes(Buffer.from(secret, 'utf8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function header(response: Response, name: string): string | null {
  try {
    return response.headers?.get?.(name) ?? null;
  } catch {
    return null;
  }
}

function declaredLength(response: Response): number | undefined {
  const raw = header(response, 'content-length');
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

type UnknownBody = {
  readonly getReader?: () => {
    read(): Promise<{ readonly done: boolean; readonly value?: unknown }>;
    cancel?(reason?: unknown): Promise<unknown> | unknown;
    releaseLock?(): void;
  };
  readonly cancel?: () => Promise<unknown> | unknown;
  readonly destroy?: () => void;
  readonly [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
};

function responseBody(response: Response): UnknownBody | null {
  return response.body as unknown as UnknownBody | null;
}

async function cancelBody(body: UnknownBody | null): Promise<void> {
  if (!body) return;
  try {
    if (typeof body.cancel === 'function') {
      await body.cancel();
      return;
    }
  } catch {
    // A failed cancellation must not replace the safe adapter error.
  }
  try { body.destroy?.(); } catch { /* best effort */ }
}

async function cancelReader(reader: { cancel?(reason?: unknown): Promise<unknown> | unknown }): Promise<void> {
  try { await reader.cancel?.(); } catch { /* best effort */ }
}

function chunkBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error('response chunk is not bytes');
}

function responseStatus(response: Response): number {
  const status = Number(response.status);
  return Number.isInteger(status) ? status : 0;
}

function successful(response: Response): boolean {
  const status = responseStatus(response);
  return status >= 200 && status < 300;
}

async function discardErrorBody(response: Response): Promise<void> {
  const body = responseBody(response);
  if (!body) return;

  if (typeof body.getReader === 'function') {
    let reader: ReturnType<NonNullable<UnknownBody['getReader']>> | undefined;
    try {
      reader = body.getReader();
      let total = 0;
      while (total < CLIPROXY_HTTP_ERROR_DRAIN_BYTES) {
        const next = await reader.read();
        if (next.done) break;
        total += chunkBytes(next.value).byteLength;
      }
    } catch {
      // The HTTP error is authoritative even if draining the body fails.
    } finally {
      if (reader) await cancelReader(reader);
      try { reader?.releaseLock?.(); } catch { /* best effort */ }
      if (!reader) await cancelBody(body);
    }
    return;
  }

  if (typeof body[Symbol.asyncIterator] === 'function') {
    try {
      let total = 0;
      for await (const value of body as AsyncIterable<unknown>) {
        total += chunkBytes(value).byteLength;
        if (total >= CLIPROXY_HTTP_ERROR_DRAIN_BYTES) break;
      }
    } catch {
      // The HTTP error is authoritative even if draining the body fails.
    } finally {
      await cancelBody(body);
    }
    return;
  }

  await cancelBody(body);
}

async function readBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const body = responseBody(response);
  const declared = declaredLength(response);
  if (declared !== undefined && declared > maxBytes) {
    await cancelBody(body);
    fail('response_too_large');
  }
  if (!body) return Buffer.alloc(0);

  if (typeof body.getReader === 'function') {
    let reader: ReturnType<NonNullable<UnknownBody['getReader']>>;
    try {
      reader = body.getReader();
    } catch {
      await cancelBody(body);
      fail(signal.aborted ? 'timeout' : 'network_error');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader!.read();
        if (next.done) break;
        const bytes = chunkBytes(next.value);
        total += bytes.byteLength;
        if (total > maxBytes) {
          await cancelReader(reader!);
          fail('response_too_large');
        }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks, total);
    } catch (error) {
      if (error instanceof AdapterFailure) throw error;
      await cancelReader(reader!);
      fail(signal.aborted ? 'timeout' : 'network_error');
    } finally {
      try { reader!.releaseLock?.(); } catch { /* best effort */ }
    }
  }

  if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const value of body as AsyncIterable<unknown>) {
        const bytes = chunkBytes(value);
        total += bytes.byteLength;
        if (total > maxBytes) {
          await cancelBody(body);
          fail('response_too_large');
        }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks, total);
    } catch (error) {
      if (error instanceof AdapterFailure) throw error;
      await cancelBody(body);
      fail(signal.aborted ? 'timeout' : 'network_error');
    }
  }

  await cancelBody(body);
  fail('network_error');
}

async function requestResponse(
  transport: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ readonly response: Response; readonly signal: AbortSignal }> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await transport(url, { ...init, redirect: 'error', signal });
    return { response, signal };
  } catch {
    fail(signal.aborted ? 'timeout' : 'network_error');
  }
}

async function requestJson(
  transport: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  responseBytes: number,
  secret: string,
): Promise<unknown> {
  const { response, signal } = await requestResponse(transport, url, init, timeoutMs);
  if (!successful(response)) {
    await discardErrorBody(response);
    fail('gateway_http_error', responseStatus(response));
  }
  const bytes = await readBody(response, responseBytes, signal);
  if (containsSecretBytes(bytes, secret)) fail('malformed_envelope');
  let envelope: unknown;
  try {
    envelope = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    fail('malformed_envelope');
  }
  if (containsSecret(envelope, secret)) fail('malformed_envelope');
  return envelope;
}

function jsonHeaders(apiKey: string, gemini = false): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    ...(gemini ? { 'x-goog-api-key': apiKey } : {}),
  };
}

function commonHeaders(apiKey: string, gemini = false): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    ...(gemini ? { 'x-goog-api-key': apiKey } : {}),
  };
}

function stringifyBody(value: unknown): string {
  try {
    const result = JSON.stringify(value);
    if (typeof result !== 'string') fail('request_too_large');
    return result;
  } catch {
    fail('request_too_large');
  }
}

function routeFor(routes: CreativeModelRoutes, model: unknown, kind: 'text' | 'image') {
  if (typeof model !== 'string' || !Object.hasOwn(routes, model)) fail('model_not_allowed');
  const route = routes[model as CreativeModel];
  if (route.kind !== kind) fail('model_not_allowed');
  return route;
}

function checkRequestBytes(body: string, maxBytes: number): void {
  if (Buffer.byteLength(body, 'utf8') > maxBytes) fail('request_too_large');
}

function parseUsage(value: unknown, inputKey: string, outputKey: string): CreativeUsage | undefined {
  if (!isRecord(value)) return undefined;
  const input = value[inputKey];
  const output = value[outputKey];
  const usage: { inputTokens?: number; outputTokens?: number } = {};
  if (typeof input === 'number' && Number.isSafeInteger(input) && input >= 0) usage.inputTokens = input;
  if (typeof output === 'number' && Number.isSafeInteger(output) && output >= 0) usage.outputTokens = output;
  return Object.keys(usage).length === 0 ? undefined : usage;
}

function providerRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\x21-\x7e]{1,128}$/.test(value) ? value : undefined;
}

function strictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  let padding = 0;
  if (value.endsWith('=')) padding += 1;
  if (value.endsWith('==')) padding += 1;
  const contentLength = value.length - padding;
  if (padding > 2 || contentLength % 4 === 1) return false;
  for (let index = 0; index < contentLength; index += 1) {
    const code = value.charCodeAt(index);
    const alphabet = (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || (code >= 0x30 && code <= 0x39)
      || code === 0x2b || code === 0x2f;
    if (!alphabet) return false;
  }
  for (let index = contentLength; index < value.length; index += 1) if (value[index] !== '=') return false;
  return padding === 0 || (padding === 1 ? contentLength % 4 === 3 : contentLength % 4 === 2);
}

function parseTextEnvelope(envelope: unknown, secret: string): { readonly text: string; readonly usage?: CreativeUsage; readonly providerRequestId?: string } {
  const choices = isRecord(envelope) ? envelope.choices : undefined;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(first) ? first.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content !== 'string' || content.length === 0) fail('malformed_envelope');
  if (containsSecret(content, secret)) fail('malformed_envelope');

  try {
    const parsedText = JSON.parse(content) as unknown;
    if (containsSecret(parsedText, secret)) fail('malformed_envelope');
  } catch (error) {
    if (error instanceof AdapterFailure) throw error;
    // Ordinary creative text is not required to be JSON.
  }

  const usage = isRecord(envelope) ? parseUsage(envelope.usage, 'prompt_tokens', 'completion_tokens') : undefined;
  const id = isRecord(envelope) ? providerRequestId(envelope.id) : undefined;
  return {
    text: content,
    ...(usage ? { usage } : {}),
    ...(id ? { providerRequestId: id } : {}),
  };
}

function base64Value(value: unknown, maxBytes: number, secret: string): { readonly bytes: Buffer; readonly declaredMediaType?: string } {
  if (typeof value !== 'string' || value.length === 0) fail('malformed_envelope');
  let encoded = value;
  let declaredMediaType: string | undefined;
  if (value.startsWith('data:')) {
    const pngPrefix = 'data:image/png;base64,';
    const jpegPrefix = 'data:image/jpeg;base64,';
    if (value.startsWith(pngPrefix)) {
      declaredMediaType = 'image/png';
      encoded = value.slice(pngPrefix.length);
    } else if (value.startsWith(jpegPrefix)) {
      declaredMediaType = 'image/jpeg';
      encoded = value.slice(jpegPrefix.length);
    } else {
      fail('malformed_envelope');
    }
  }
  if (encoded.length > Math.ceil(maxBytes / 3) * 4) fail('response_too_large');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (Math.floor(encoded.length / 4) * 3 - padding > maxBytes) fail('response_too_large');
  if (!strictBase64(encoded)) fail('malformed_envelope');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) fail('malformed_envelope');
  if (bytes.length === 0) fail('malformed_envelope');
  if (bytes.length > maxBytes) fail('response_too_large');
  if (containsSecretBytes(bytes, secret)) fail('malformed_envelope');
  return { bytes, ...(declaredMediaType ? { declaredMediaType } : {}) };
}

function gptImageValue(envelope: unknown): string {
  const data = isRecord(envelope) ? envelope.data : undefined;
  if (!Array.isArray(data)) fail('malformed_envelope');
  const values = data
    .filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.b64_json === 'string' && entry.b64_json.length > 0)
    .map((entry) => entry.b64_json as string);
  if (values.length !== 1) fail('malformed_envelope');
  return values[0]!;
}

function geminiImageValue(envelope: unknown): { readonly encoded: string; readonly declaredMediaType?: string } {
  const candidates = isRecord(envelope) ? envelope.candidates : undefined;
  if (!Array.isArray(candidates)) fail('malformed_envelope');
  const values: Array<{ encoded: string; declaredMediaType?: string }> = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const content = candidate.content;
    const parts = isRecord(content) ? content.parts : undefined;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!isRecord(part)) continue;
      const inline = isRecord(part.inlineData) ? part.inlineData : isRecord(part.inline_data) ? part.inline_data : undefined;
      if (!inline || typeof inline.data !== 'string' || inline.data.length === 0) continue;
      const mediaType = typeof inline.mimeType === 'string'
        ? inline.mimeType
        : typeof inline.mime_type === 'string' ? inline.mime_type : undefined;
      values.push({ encoded: inline.data, ...(mediaType ? { declaredMediaType: mediaType } : {}) });
    }
  }
  if (values.length !== 1) fail('malformed_envelope');
  return values[0]!;
}

function imageUsage(envelope: unknown): CreativeUsage | undefined {
  if (!isRecord(envelope)) return undefined;
  return parseUsage(envelope.usage, 'prompt_tokens', 'completion_tokens')
    ?? parseUsage(envelope.usageMetadata, 'promptTokenCount', 'candidatesTokenCount');
}

function normalizeReferenceBytes(request: CreativeImageRequest): readonly Buffer[] {
  if (!Array.isArray(request.references)) fail('request_too_large');
  return request.references.map((reference) => {
    try {
      return Buffer.isBuffer(reference.bytes) ? reference.bytes : Buffer.from(reference.bytes);
    } catch {
      fail('request_too_large');
    }
  });
}

function referenceFilename(mediaType: string, index: number, multiple: boolean): string {
  const extension = mediaType === 'image/png' ? 'png' : 'jpg';
  return multiple ? `source-${index + 1}.${extension}` : `source.${extension}`;
}

function makeGptEditForm(request: CreativeImageRequest, providerModelId: string, references: readonly Buffer[], format: { readonly gptSize: string }): FormData {
  const form = new FormData();
  const multiple = references.length > 1;
  for (let index = 0; index < references.length; index += 1) {
    const reference = request.references[index]!;
    const field = multiple ? 'image[]' : 'image';
    const blob = new Blob([new Uint8Array(references[index]!)], { type: reference.mediaType });
    form.append(field, blob, referenceFilename(reference.mediaType, index, multiple));
  }
  form.append('prompt', request.prompt);
  form.append('model', providerModelId);
  form.append('n', '1');
  form.append('size', format.gptSize);
  form.append('response_format', 'b64_json');
  return form;
}

async function formDataBytes(form: FormData, url: string): Promise<number> {
  try {
    return (await new Request(url, { method: 'POST', body: form }).arrayBuffer()).byteLength;
  } catch {
    fail('request_too_large');
  }
}

function makeGeminiBody(request: CreativeImageRequest, references: readonly Buffer[], format: { readonly geminiAspectRatio: string }): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = references.map((bytes, index) => ({
    inlineData: { mimeType: request.references[index]!.mediaType, data: bytes.toString('base64') },
  }));
  parts.push({ text: request.prompt });
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      candidateCount: 1,
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: format.geminiAspectRatio },
    },
  };
}

async function generateText(
  request: CreativeTextRequest,
  configuration: CliproxyConfiguration,
  routes: CreativeModelRoutes,
  transport: typeof fetch,
  now: () => number,
): Promise<CreativeTextResult> {
  const route = routeFor(routes, request?.model, 'text');
  const body: Record<string, unknown> = {
    model: route.providerModelId,
    messages: [
      { role: 'system', content: request.systemLayer },
      { role: 'system', content: request.creativeLayer },
      { role: 'user', content: request.userInput },
    ],
    temperature: request.temperature ?? 0.7,
    stream: false,
  };
  if (request.maxOutputTokens !== undefined) {
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 32768) fail('request_too_large');
    body.max_tokens = request.maxOutputTokens;
  }
  if (request.responseFormat !== undefined) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: request.responseFormat.name, schema: request.responseFormat.jsonSchema, strict: true },
    };
  }
  const bodyText = stringifyBody(body);
  checkRequestBytes(bodyText, CLIPROXY_TEXT_REQUEST_BYTES);
  const started = now();
  const envelope = await requestJson(transport, `${configuration.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: jsonHeaders(configuration.apiKey),
    body: bodyText,
  }, CLIPROXY_TEXT_TIMEOUT_MS, CLIPROXY_TEXT_RESPONSE_BYTES, configuration.apiKey);
  const parsed = parseTextEnvelope(envelope, configuration.apiKey);
  const latencyMs = Math.max(0, now() - started);
  return { ...parsed, latencyMs };
}

async function generateImage(
  request: CreativeImageRequest,
  configuration: CliproxyConfiguration,
  routes: CreativeModelRoutes,
  transport: typeof fetch,
  now: () => number,
): Promise<CreativeImageResult> {
  const route = routeFor(routes, request?.model, 'image');
  const format = CREATIVE_IMAGE_FORMATS[request.format];
  if (!format) fail('request_too_large');
  const references = normalizeReferenceBytes(request);
  if (references.length > CLIPROXY_MAX_REFERENCES) fail('request_too_large');
  const referenceBytes = references.reduce((total, bytes) => total + bytes.length, 0);
  const referenceLimit = route.family === 'openai-image' ? CLIPROXY_GPT_IMAGE_REFERENCE_BYTES : CLIPROXY_GEMINI_IMAGE_REFERENCE_BYTES;
  if (referenceBytes > referenceLimit) fail('request_too_large');

  const started = now();
  let envelope: unknown;
  let inlineDeclaredMediaType: string | undefined;
  let timeoutMs: number;
  let responseBytes: number;
  let outputBytes: number;

  if (route.family === 'openai-image') {
    timeoutMs = CLIPROXY_GPT_IMAGE_TIMEOUT_MS;
    responseBytes = CLIPROXY_GPT_IMAGE_RESPONSE_BYTES;
    outputBytes = CLIPROXY_GPT_IMAGE_OUTPUT_BYTES;
    if (references.length === 0) {
      const bodyText = stringifyBody({ model: route.providerModelId, prompt: request.prompt, n: 1, size: format.gptSize, response_format: 'b64_json' });
      checkRequestBytes(bodyText, CLIPROXY_GPT_IMAGE_REQUEST_BYTES);
      envelope = await requestJson(transport, `${configuration.baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: jsonHeaders(configuration.apiKey),
        body: bodyText,
      }, timeoutMs, responseBytes, configuration.apiKey);
    } else {
      const form = makeGptEditForm(request, route.providerModelId, references, format);
      const url = `${configuration.baseUrl}/v1/images/edits`;
      if (await formDataBytes(form, url) > CLIPROXY_GPT_IMAGE_REQUEST_BYTES) fail('request_too_large');
      envelope = await requestJson(transport, url, {
        method: 'POST',
        headers: commonHeaders(configuration.apiKey),
        body: form,
      }, timeoutMs, responseBytes, configuration.apiKey);
    }
    const decoded = base64Value(gptImageValue(envelope), outputBytes, configuration.apiKey);
    const usage = imageUsage(envelope);
    const id = isRecord(envelope) ? providerRequestId(envelope.id) : undefined;
    const latencyMs = Math.max(0, now() - started);
    return {
      bytes: decoded.bytes,
      ...(decoded.declaredMediaType ? { declaredMediaType: decoded.declaredMediaType } : {}),
      ...(usage ? { usage } : {}),
      latencyMs,
      ...(id ? { providerRequestId: id } : {}),
    };
  }

  timeoutMs = CLIPROXY_GEMINI_IMAGE_TIMEOUT_MS;
  responseBytes = CLIPROXY_GEMINI_IMAGE_RESPONSE_BYTES;
  outputBytes = CLIPROXY_GEMINI_IMAGE_OUTPUT_BYTES;
  const bodyText = stringifyBody(makeGeminiBody(request, references, format));
  checkRequestBytes(bodyText, CLIPROXY_GEMINI_IMAGE_REQUEST_BYTES);
  envelope = await requestJson(transport, `${configuration.baseUrl}/v1beta/models/${route.providerModelId}:generateContent`, {
    method: 'POST',
    headers: jsonHeaders(configuration.apiKey, true),
    body: bodyText,
  }, timeoutMs, responseBytes, configuration.apiKey);
  const value = geminiImageValue(envelope);
  inlineDeclaredMediaType = value.declaredMediaType;
  const decoded = base64Value(value.encoded, outputBytes, configuration.apiKey);
  const usage = imageUsage(envelope);
  const id = isRecord(envelope)
    ? providerRequestId(envelope.responseId ?? envelope.response_id)
    : undefined;
  const latencyMs = Math.max(0, now() - started);
  // Two declarations that disagree are a contradictory envelope; either alone is only cross-checked by the service.
  if (decoded.declaredMediaType !== undefined && inlineDeclaredMediaType !== undefined
    && decoded.declaredMediaType !== inlineDeclaredMediaType) fail('malformed_envelope');
  const declaredMediaType = decoded.declaredMediaType ?? inlineDeclaredMediaType;
  return {
    bytes: decoded.bytes,
    ...(declaredMediaType ? { declaredMediaType } : {}),
    ...(usage ? { usage } : {}),
    latencyMs,
    ...(id ? { providerRequestId: id } : {}),
  };
}

async function listModels(
  configuration: CliproxyConfiguration,
  routes: CreativeModelRoutes,
  transport: typeof fetch,
): Promise<readonly CreativeModelAvailability[]> {
  const envelope = await requestJson(transport, `${configuration.baseUrl}/v1/models`, {
    method: 'GET',
    headers: commonHeaders(configuration.apiKey),
  }, CLIPROXY_MODELS_TIMEOUT_MS, CLIPROXY_MODELS_RESPONSE_BYTES, configuration.apiKey);
  const data = isRecord(envelope) ? envelope.data : undefined;
  if (!Array.isArray(data) || data.some((entry) => !isRecord(entry) || typeof entry.id !== 'string')) fail('malformed_envelope');
  const providerIds = new Set(data.map((entry) => (entry as Record<string, unknown>).id as string));
  return CREATIVE_MODELS.map((id) => ({
    id,
    kind: routes[id].kind,
    available: providerIds.has(routes[id].providerModelId),
  }));
}

export function createCliproxyCreativeGateway(options: {
  readonly configuration: CliproxyConfiguration;
  readonly transport?: typeof fetch;
  readonly now?: () => number;
  /** Defaults to `CREATIVE_MODEL_ROUTES`; only provider ids may differ. */
  readonly routes?: CreativeModelRoutes;
}): CreativeAiGateway {
  assertCliproxyConfiguration(options.configuration);
  const routes = options.routes === undefined ? CREATIVE_MODEL_ROUTES : assertCreativeModelRoutes(options.routes);
  const transport = options.transport ?? fetch;
  const now = options.now ?? (() => Date.now());
  return {
    configured: true,
    routes,
    generateText: (request) => safeCall(() => generateText(request, options.configuration, routes, transport, now)),
    generateImage: (request) => safeCall(() => generateImage(request, options.configuration, routes, transport, now)),
    listModels: () => safeCall(() => listModels(options.configuration, routes, transport)),
  };
}

// Model client of the video-watch lane, routed through the app's existing CLIProxy (numeric loopback only): per video ONE
// generateContent request with the video sent inline (base64), at most one retry on 429/5xx/timeout. No Files API, so nothing
// stays on the model side to clean up. The CLIProxy key travels only in request headers: never in a URL, a capture, a log line
// or an error message. Captures never hold the video bytes (only their sha256 and size).
import { createHash } from 'node:crypto';
import { assertCliproxyConfiguration, type CliproxyConfiguration } from '../../../platform/ai/cliproxy-configuration.js';
import { bytesContainSecret, CaptureLog, defaultProviderTransport, isRecord, parseJson, type ProviderTransport } from './provider-common.js';
import type { CaptureOutcome, ProviderRawCapture } from './providers.js';

export const VIDEO_WATCH_PROVIDER = 'VIDEO-WATCH' as const;
export const VIDEO_WATCH_CALL_TIMEOUT_MS = 180_000;
export const VIDEO_WATCH_ANSWER_BYTES = 1024 * 1024;
const RETRY_DELAY_MS = 2_000;
/** A plain Gemini model id only: an id with `/` (a relay or other route on the proxy) is never accepted. */
export const VIDEO_WATCH_MODEL_ID = /^gemini-[a-z0-9][a-z0-9.-]{0,63}$/;

/** The fixed instruction. It asks only for what was said and shown, in the video's own language, with times relative to the media start. */
export const VIDEO_WATCH_PROMPT = [
  'You are given one short public marketplace video.',
  'Answer only in the JSON shape required.',
  'aboutProduct: true only when the video is mainly about selling or reviewing one physical product.',
  'videoKind: SELLER_VIDEO when a shop presents its own product, REVIEW_VIDEO when a creator reviews or recommends it, OTHER otherwise.',
  'segments: only the words that are audibly spoken, transcribed verbatim in the original spoken language, never translated, summarised or corrected, in time order, not overlapping, with start and end in seconds from the start of the video.',
  'Never copy on-screen text, captions, timers or numbers shown on screen into speech. If nothing is spoken, return no segments.',
  'onScreenText: text written on screen, exactly as shown, with start and end in seconds.',
  'Leave a list empty when there is nothing to report. Do not add opinions, facts or anything not said or shown.',
].join('\n');

/** The model's JSON answer schema (request side); the stored contract re-validates every answer strictly. */
const interval = (field: string) => ({ type: 'OBJECT', properties: { startSecond: { type: 'NUMBER' }, endSecond: { type: 'NUMBER' }, [field]: { type: 'STRING' } },
  required: ['startSecond', 'endSecond', field], propertyOrdering: ['startSecond', 'endSecond', field] });
export const VIDEO_WATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    aboutProduct: { type: 'BOOLEAN' },
    videoKind: { type: 'STRING', enum: ['SELLER_VIDEO', 'REVIEW_VIDEO', 'OTHER'] },
    segments: { type: 'ARRAY', items: interval('speech') },
    onScreenText: { type: 'ARRAY', items: interval('text') },
  },
  required: ['aboutProduct', 'videoKind', 'segments', 'onScreenText'],
  propertyOrdering: ['aboutProduct', 'videoKind', 'segments', 'onScreenText'],
};

export type VideoWatchModelFailure = 'MODEL_FAILED' | 'CREDENTIAL_ECHO_REFUSED' | 'CANCELLED';
export type VideoWatchModelResult =
  | { readonly kind: 'ANSWER'; readonly answer: unknown; readonly responseSha256: string; readonly captures: readonly ProviderRawCapture[]; readonly requests: number; readonly paidRequests: number }
  | { readonly kind: 'FAILED'; readonly reason: VideoWatchModelFailure; readonly captures: readonly ProviderRawCapture[]; readonly requests: number; readonly paidRequests: number };

export interface VideoWatchModel {
  readonly modelId: string;
  watch(media: { readonly bytes: Uint8Array; readonly mimeType: string; readonly videoId: string }, signal?: AbortSignal): Promise<VideoWatchModelResult>;
}

const sha = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');

type Outcome = { kind: 'RECEIVED'; status: number; bytes: Buffer } | { kind: 'OVERSIZE'; status: number } | { kind: 'TIMEOUT' } | { kind: 'TRANSPORT' } | { kind: 'ABORTED' };

/** One bounded loopback POST (the shared provider request only allows fixed public hosts). Redirects are refused. */
async function loopbackPost(transport: ProviderTransport, url: URL, headers: Record<string, string>, body: string, timeoutMs: number, maxBytes: number,
  signal: AbortSignal | undefined): Promise<Outcome> {
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== '[::1]') || url.username || url.password) return { kind: 'TRANSPORT' };
  if (signal?.aborted) return { kind: 'ABORTED' };
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const classify = (): Outcome => signal?.aborted ? { kind: 'ABORTED' } : timeout.aborted ? { kind: 'TIMEOUT' } : { kind: 'TRANSPORT' };
  let response: Response;
  try { response = await transport.fetch(url, { method: 'POST', headers, body, redirect: 'error', signal: combined }); } catch { return classify(); }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel().catch(() => {}); return { kind: 'OVERSIZE', status: response.status }; }
  if (!response.body) return { kind: 'RECEIVED', status: response.status, bytes: Buffer.alloc(0) };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) return { kind: 'OVERSIZE', status: response.status };
      chunks.push(part.value);
    }
  } catch { return classify(); } finally { await reader.cancel().catch(() => {}); }
  return { kind: 'RECEIVED', status: response.status, bytes: Buffer.concat(chunks) };
}

/** `modelId` must be a plain Gemini id; the CLIProxy key is never echoed in anything this returns or throws. */
export function createVideoWatchModel(options: { readonly cliproxy: CliproxyConfiguration; readonly modelId: string; readonly transport?: ProviderTransport }): VideoWatchModel {
  const transport = options.transport ?? defaultProviderTransport;
  assertCliproxyConfiguration(options.cliproxy);
  if (typeof options.modelId !== 'string' || !VIDEO_WATCH_MODEL_ID.test(options.modelId)) throw new TypeError('TDN_RESEARCH_VIDEO_WATCH_MODEL must be a plain gemini-* model id.');
  const key = options.cliproxy.apiKey, modelId = options.modelId;
  // Same header set as the app's CLIProxy gateway for its Gemini-format route.
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'x-goog-api-key': key };
  const path = `/v1beta/models/${modelId}:generateContent`;
  const url = new URL(`${options.cliproxy.baseUrl}${path}`);
  return {
    modelId,
    async watch(media, signal) {
      const log = new CaptureLog(VIDEO_WATCH_PROVIDER, transport, undefined, 1);
      let requests = 0, paidRequests = 0;
      const fail = (reason: VideoWatchModelFailure): VideoWatchModelResult => ({ kind: 'FAILED', reason, captures: log.captures, requests, paidRequests });
      if (signal?.aborted) return fail('CANCELLED');
      const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: media.mimeType, data: Buffer.from(media.bytes).toString('base64') } }, { text: VIDEO_WATCH_PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: VIDEO_WATCH_RESPONSE_SCHEMA } });
      // The capture keeps only digests of what was sent: never the video bytes and never the key (the body has no key).
      const requestParameters = { model: modelId, requestSha256: sha(body), videoSha256: sha(media.bytes), videoByteSize: media.bytes.byteLength, mimeType: media.mimeType };
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal?.aborted) return fail('CANCELLED');
        const requestedAt = log.timestamp();
        requests++; paidRequests++;
        const outcome = await loopbackPost(transport, url, headers, body, VIDEO_WATCH_CALL_TIMEOUT_MS, VIDEO_WATCH_ANSWER_BYTES, signal);
        const record = (result: CaptureOutcome, status: number | null, bytes: Buffer | null) => log.record({ operation: 'videowatch.generate', billing: 'PAID_CREDITS',
          method: 'POST', endpoint: path, requestParameters, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null }, requestedAt, result, status, bytes, null);
        const retry = async (): Promise<boolean> => {
          if (attempt > 0) return false;
          try { await transport.sleep(RETRY_DELAY_MS, signal); return true; } catch { return false; }
        };
        if (outcome.kind === 'ABORTED') { record('ABORTED_AMBIGUOUS', null, null); return fail('CANCELLED'); }
        if (outcome.kind === 'TIMEOUT') { record('TIMEOUT_AMBIGUOUS', null, null); if (await retry()) continue; return fail(signal?.aborted ? 'CANCELLED' : 'MODEL_FAILED'); }
        if (outcome.kind === 'TRANSPORT') { record('TRANSPORT_AMBIGUOUS', null, null); return fail('MODEL_FAILED'); }
        if (outcome.kind === 'OVERSIZE') { record('OVERSIZE', outcome.status, null); return fail('MODEL_FAILED'); }
        if (bytesContainSecret(outcome.bytes, key)) { record('CREDENTIAL_ECHO_REFUSED', outcome.status, null); return fail('CREDENTIAL_ECHO_REFUSED'); }
        if (outcome.status === 429 || outcome.status >= 500) { record('HTTP_ERROR', outcome.status, outcome.bytes); if (await retry()) continue; return fail(signal?.aborted ? 'CANCELLED' : 'MODEL_FAILED'); }
        if (outcome.status !== 200) { record('HTTP_ERROR', outcome.status, outcome.bytes); return fail('MODEL_FAILED'); }
        const answer = answerOf(parseJson(outcome.bytes));
        record(answer === undefined ? 'INVALID_PAYLOAD' : 'OK', 200, outcome.bytes);
        if (answer === undefined) return fail('MODEL_FAILED');
        return { kind: 'ANSWER', answer, responseSha256: sha(outcome.bytes), captures: log.captures, requests, paidRequests };
      }
      return fail('MODEL_FAILED');
    },
  };
}

/** The first candidate's answer text: parts marked `thought: true` are skipped, the rest joined and parsed as JSON; anything else is no answer. */
export function answerOf(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.candidates) || value.candidates.length < 1) return undefined;
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || (candidate.finishReason !== undefined && candidate.finishReason !== 'STOP') || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return undefined;
  const parts = candidate.content.parts.filter((part): part is { text: string } => isRecord(part) && part.thought !== true && typeof part.text === 'string');
  const text = parts.map(part => part.text).join('');
  if (!text.trim()) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

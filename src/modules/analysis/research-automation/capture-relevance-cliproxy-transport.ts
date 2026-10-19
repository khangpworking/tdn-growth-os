import type { CliproxyConfiguration } from '../../../platform/ai/cliproxy-configuration.js';
import { createInsightCodingCliproxyAi } from './i14-cliproxy-transport.js';
import { CAPTURE_RELEVANCE_PROMPT, captureRelevanceResponse, validateCaptureRelevanceConfiguration,
  type CaptureRelevanceClassifier, type CaptureRelevanceConfiguration } from './capture-relevance.js';
export type { CaptureRelevanceConfiguration } from './capture-relevance.js';

export function captureRelevanceConfiguration(modelId: string): CaptureRelevanceConfiguration {
  const configuration: CaptureRelevanceConfiguration = { contractVersion: 'capture-relevance-configuration-v1', providerId: 'cliproxy', modelId,
    temperature: null, maxOutputTokens: 16384, timeoutMs: 300000, maxResponseBytes: 256 * 1024 };
  if (!validateCaptureRelevanceConfiguration(configuration)) throw new TypeError('Capture relevance requires an explicit valid model identity');
  return Object.freeze(configuration);
}

/** Single-call HTTP mechanics only; batching/retries and retention belong to the capture method. */
export function createCaptureRelevanceCliproxyTransport(options: { cliproxy: CliproxyConfiguration; configuration: CaptureRelevanceConfiguration }): CaptureRelevanceClassifier {
  if (!validateCaptureRelevanceConfiguration(options.configuration)) throw new TypeError('Invalid capture relevance model configuration');
  const configuration = Object.freeze({ ...options.configuration });
  const http = createInsightCodingCliproxyAi({ cliproxy: options.cliproxy, configuration: { ...configuration, contractVersion: 'insight-model-configuration-v1' } });
  return { async classify(input) {
    if (!input.keyword.trim() || !input.items.length || input.items.length > 40 || new Set(input.items.map(row => row.id)).size !== input.items.length)
      throw new TypeError('Invalid capture relevance request');
    const timeout = AbortSignal.timeout(configuration.timeoutMs);
    const signal = input.signal ? AbortSignal.any([timeout, input.signal]) : timeout;
    const result = await http.port.generateText({ configuration: http.configuration, systemText: CAPTURE_RELEVANCE_PROMPT,
      userText: JSON.stringify({ keyword: input.keyword, items: input.items }), signal });
    if (Buffer.byteLength(result.text, 'utf8') > configuration.maxResponseBytes) throw new TypeError('Capture relevance response too large');
    return captureRelevanceResponse(parseCaptureRelevanceModelText(result.text), input.items.map(row => row.id));
  } };
}

/** One surrounding Markdown code fence is tolerated; prose and other wrappers are rejected. */
export function parseCaptureRelevanceModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/u.exec(trimmed);
  try { return JSON.parse(fenced ? fenced[1]! : trimmed); }
  catch { throw new TypeError('Capture relevance model returned invalid JSON'); }
}

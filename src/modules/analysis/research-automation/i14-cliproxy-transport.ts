import privateSourceSchema from '../../../../contracts/analysis/private-insight-source-projection.schema.json' with { type: 'json' };
import { registerPrivateReviewSchemas } from './private-review-contracts.js';
import { createRequire } from 'node:module';
import configurationSchema from '../../../../contracts/analysis/automation-i14-synthesis-configuration.schema.json' with { type: 'json' };
import decisionConfigurationSchema from '../../../../contracts/analysis/automation-decision-synthesis-configuration.schema.json' with { type: 'json' };
import insightModelSchema from '../../../../contracts/analysis/automation-insight-model.schema.json' with { type: 'json' };
import tiktokCodingConfigurationSchema from '../../../../contracts/analysis/tiktok-coding-configuration-v1.schema.json' with { type: 'json' };
import insightCodingSchema from '../../../../contracts/analysis/automation-insight-coding.schema.json' with { type: 'json' };
import locatedInsightSchema from '../../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import insightSelectionSchema from '../../../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import { assertCliproxyConfiguration, type CliproxyConfiguration } from '../../../platform/ai/cliproxy-configuration.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { AutomationI14ExecutionRequest, AutomationI14SynthesisConfiguration } from './i14-synthesis-execution.js';
import type { AutomationDecisionExecutionRequest, AutomationDecisionSynthesisConfiguration } from './decision-synthesis-execution.js';
import type { AutomationDecisionSectionId } from './decision-packets.js';
import type { InsightModelAI, InsightModelConfiguration } from './insight-model-execution.js';
import type { TikTokCodingConfiguration } from '../../../../contracts/analysis/tiktok-coding-configuration-v1.generated.js';
import type { TikTokCodingAI } from './tiktok-coding.js';
import type { AutomationSynthesisTextPort } from './synthesis-execution.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateConfiguration = ajv.compile<AutomationI14SynthesisConfiguration>(configurationSchema);
const validateDecisionConfiguration = ajv.compile<AutomationDecisionSynthesisConfiguration>(decisionConfigurationSchema);
// The Insight configuration is one definition of a schema whose other definitions reference sibling contracts and formats.
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const insightAjv = new Ajv2020({ strict: true, allErrors: true }); addFormats(insightAjv);
registerPrivateReviewSchemas(insightAjv); insightAjv.addSchema(privateSourceSchema);
for (const contract of [locatedInsightSchema, insightSelectionSchema, insightCodingSchema, insightModelSchema]) insightAjv.addSchema(contract);
const validateInsightConfiguration = insightAjv.compile<InsightModelConfiguration>({ $ref: `${insightModelSchema.$id}#/$defs/configuration` });
const validateTikTokCodingConfiguration = ajv.compile<TikTokCodingConfiguration>(tiktokCodingConfigurationSchema);
type SynthesisConfiguration = AutomationI14SynthesisConfiguration | AutomationDecisionSynthesisConfiguration | InsightModelConfiguration | TikTokCodingConfiguration;

/** Recorded provider id for every I14 dispatch through the loopback CLIProxy. */
export const I14_CLIPROXY_PROVIDER_ID = 'cliproxy';
/** Covers the largest retained input after JSON string escaping; checked before any network request. */
const REQUEST_BYTES = 4 * 1024 * 1024;
/** The returned text is bounded by the retained `maxResponseBytes`; the envelope may add escaping and metadata. */
const envelopeBytes = (configuration: SynthesisConfiguration): number => 2 * configuration.maxResponseBytes + 64 * 1024;

export type AutomationI14TransportErrorCode =
  | 'configuration_mismatch' | 'request_too_large' | 'aborted' | 'network_error' | 'gateway_http_error'
  | 'response_too_large' | 'malformed_envelope';
/** Generic transport failure. It never carries the endpoint, credential, request or provider response. */
export class AutomationI14TransportError extends Error {
  constructor(readonly code: AutomationI14TransportErrorCode, readonly httpStatus?: number) {
    super(code);
    this.name = 'AutomationI14TransportError';
  }
}
function fail(code: AutomationI14TransportErrorCode, httpStatus?: number): never {
  throw new AutomationI14TransportError(code, httpStatus);
}

/**
 * The only opt-in I14 configuration: an operator-named model with fixed bounds. The model id records what was
 * requested; it is never selected automatically or checked against a model list, so it does not establish availability.
 * Temperature is not sent, and is retained as null.
 */
export function i14CliproxySynthesisConfiguration(modelId: string): AutomationI14SynthesisConfiguration {
  const configuration: AutomationI14SynthesisConfiguration = Object.freeze({
    contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-configuration', providerId: I14_CLIPROXY_PROVIDER_ID,
    modelId, temperature: null, maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 256 * 1024,
  });
  if (!validateConfiguration(configuration)) throw new TypeError('I14 synthesis requires an explicit provider model id');
  return configuration;
}

/** Each decision section has its own explicit model/configuration; enabling I14 never enables these. */
export function decisionCliproxySynthesisConfiguration(sectionId: AutomationDecisionSectionId, modelId: string): AutomationDecisionSynthesisConfiguration {
  const configuration: AutomationDecisionSynthesisConfiguration = Object.freeze({
    contractVersion: '1.0.0', methodId: 'automation-decision-synthesis-configuration', sectionId,
    providerId: I14_CLIPROXY_PROVIDER_ID, modelId, temperature: null,
    maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 256 * 1024,
  });
  if (!validateDecisionConfiguration(configuration)) throw new TypeError('Decision synthesis requires an explicit section and provider model id');
  return configuration;
}

export function createDecisionCliproxySynthesisAi(options: {
  readonly cliproxy: CliproxyConfiguration;
  readonly configuration: AutomationDecisionSynthesisConfiguration;
}): NonNullable<AutomationDecisionExecutionRequest['ai']> {
  if (!validateDecisionConfiguration(options.configuration) || options.configuration.providerId !== I14_CLIPROXY_PROVIDER_ID)
    throw new TypeError('Decision CLIProxy synthesis requires a valid cliproxy configuration');
  return createBoundSynthesisAi(options);
}

/** Insight semantic coding has its own explicit model; enabling I14 or a decision section never enables it. */
export function insightCodingCliproxyConfiguration(modelId: string): InsightModelConfiguration {
  const configuration: InsightModelConfiguration = Object.freeze({
    contractVersion: 'insight-model-configuration-v1', providerId: I14_CLIPROXY_PROVIDER_ID, modelId, temperature: null,
    maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 256 * 1024,
  });
  if (!validateInsightConfiguration(configuration)) throw new TypeError('Insight coding requires an explicit provider model id');
  return configuration;
}

/** Proposal transport only: the execution owner validates output, and only an explicit human receipt accepts it. */
export function createInsightCodingCliproxyAi(options: {
  readonly cliproxy: CliproxyConfiguration;
  readonly configuration: InsightModelConfiguration;
}): NonNullable<InsightModelAI> {
  if (!validateInsightConfiguration(options.configuration) || options.configuration.providerId !== I14_CLIPROXY_PROVIDER_ID)
    throw new TypeError('Insight coding CLIProxy transport requires a valid cliproxy configuration');
  return createBoundSynthesisAi(options);
}

/** TikTok draft coding has its own explicit model; enabling Insight coding or any other section never enables it. */
export function tiktokCodingCliproxyConfiguration(modelId: string): TikTokCodingConfiguration {
  const configuration: TikTokCodingConfiguration = Object.freeze({
    contractVersion: 'tiktok-coding-configuration-v1', providerId: I14_CLIPROXY_PROVIDER_ID, modelId, temperature: null,
    maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 256 * 1024,
  });
  if (!validateTikTokCodingConfiguration(configuration)) throw new TypeError('TikTok coding requires an explicit provider model id');
  return configuration;
}

/** Proposal transport only: the TikTok coding owner validates output, and only an explicit human receipt accepts it. */
export function createTikTokCodingCliproxyAi(options: {
  readonly cliproxy: CliproxyConfiguration;
  readonly configuration: TikTokCodingConfiguration;
}): NonNullable<TikTokCodingAI> {
  if (!validateTikTokCodingConfiguration(options.configuration) || options.configuration.providerId !== I14_CLIPROXY_PROVIDER_ID)
    throw new TypeError('TikTok coding CLIProxy transport requires a valid cliproxy configuration');
  return createBoundSynthesisAi(options);
}

function containsSecret(value: unknown, secret: string): boolean {
  if (typeof value === 'string') return value.includes(secret);
  if (Array.isArray(value)) return value.some((entry) => containsSecret(entry, secret));
  if (value !== null && typeof value === 'object') return Object.entries(value).some(([key, entry]) => key.includes(secret) || containsSecret(entry, secret));
  return false;
}

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    fail('response_too_large');
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks, total);
      total += next.value.byteLength;
      if (total > maxBytes) fail('response_too_large');
      chunks.push(Buffer.from(next.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AutomationI14TransportError) throw error;
    return fail(signal.aborted ? 'aborted' : 'network_error');
  }
}

/** Return exactly one choice's message content. Reasoning fields, usage, ids and headers are discarded. */
function contentOf(bytes: Buffer, secret: string): string {
  if (bytes.includes(Buffer.from(secret, 'utf8'))) fail('malformed_envelope');
  let envelope: unknown;
  try { envelope = JSON.parse(bytes.toString('utf8')); } catch { fail('malformed_envelope'); }
  if (containsSecret(envelope, secret)) fail('malformed_envelope');
  const choices = (envelope as { choices?: unknown } | null)?.choices;
  const message = Array.isArray(choices) && choices.length === 1 ? (choices[0] as { message?: unknown } | null)?.message : undefined;
  const content = (message as { content?: unknown } | null | undefined)?.content;
  if (typeof content !== 'string' || content.length === 0) return fail('malformed_envelope');
  // A credential may be escaped once more inside JSON content; the retention owner parses that text.
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { return content; }
  if (containsSecret(parsed, secret)) fail('malformed_envelope');
  return content;
}

/**
 * Bounded, single-request I14 text transport through the configured loopback CLIProxy. It sends only the retained
 * system text and input bytes with the exact bound model and limits, follows no redirect, never retries a paid
 * request and aborts the HTTP exchange with the caller's signal. Credentials stay inside this closure.
 */
export function createI14CliproxySynthesisAi(options: {
  readonly cliproxy: CliproxyConfiguration;
  readonly configuration: AutomationI14SynthesisConfiguration;
}): NonNullable<AutomationI14ExecutionRequest['ai']> {
  if (!validateConfiguration(options.configuration) || options.configuration.providerId !== I14_CLIPROXY_PROVIDER_ID)
    throw new TypeError('I14 CLIProxy synthesis requires a valid cliproxy configuration');
  return createBoundSynthesisAi(options);
}

/** Shared HTTP mechanics only. Section adapters retain separate closed configuration contracts. */
function createBoundSynthesisAi<Configuration extends SynthesisConfiguration>(options: {
  readonly cliproxy: CliproxyConfiguration;
  readonly configuration: Configuration;
}): { readonly port: AutomationSynthesisTextPort<Configuration>; readonly configuration: Configuration } {
  assertCliproxyConfiguration(options.cliproxy);
  // Capture a private immutable copy so a caller cannot change the dispatched model after binding.
  const configuration: Configuration = { ...options.configuration };
  Object.freeze(configuration);
  const bound = canonicalJson(configuration);
  const { baseUrl, apiKey } = options.cliproxy;

  const port: AutomationSynthesisTextPort<Configuration> = {
    async generateText(request) {
      const signal = request.signal;
      try {
        // The retention owner passes its retained configuration; a different model or bound is never substituted.
        if (canonicalJson(request.configuration) !== bound) fail('configuration_mismatch');
        const body = JSON.stringify({
          model: configuration.modelId,
          messages: [{ role: 'system', content: request.systemText }, { role: 'user', content: request.userText }],
          max_tokens: configuration.maxOutputTokens,
          ...(configuration.temperature === null ? {} : { temperature: configuration.temperature }),
          stream: false,
        });
        if (Buffer.byteLength(body, 'utf8') > REQUEST_BYTES) fail('request_too_large');
        signal.throwIfAborted();
        let response: Response;
        try {
          response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST', redirect: 'error', signal, body,
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
          });
        } catch {
          return fail(signal.aborted ? 'aborted' : 'network_error');
        }
        if (response.status < 200 || response.status > 299) {
          await response.body?.cancel().catch(() => undefined);
          fail('gateway_http_error', response.status);
        }
        return { text: contentOf(await readBounded(response, envelopeBytes(configuration), signal), apiKey) };
      } catch (error) {
        if (error instanceof AutomationI14TransportError) throw error;
        throw new AutomationI14TransportError(signal.aborted ? 'aborted' : 'network_error');
      }
    },
  };
  return Object.freeze({ port, configuration });
}

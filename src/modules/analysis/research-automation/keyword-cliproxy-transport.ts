import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/keyword-list-draft.schema.json' with { type: 'json' };
import type { KeywordDraftConfiguration } from '../../../../contracts/analysis/keyword-list-draft-record.generated.js';
import type { KeywordListDraftTransport } from '../keyword-list-drafting.js';
import type { CliproxyConfiguration } from '../../../platform/ai/cliproxy-configuration.js';
import { createInsightCodingCliproxyAi } from './i14-cliproxy-transport.js';
export type { KeywordDraftConfiguration } from '../../../../contracts/analysis/keyword-list-draft-record.generated.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema);
const validate = ajv.compile<KeywordDraftConfiguration>({ $ref: `${schema.$id}#/$defs/configuration` });
export function keywordDraftConfiguration(modelId: string): KeywordDraftConfiguration {
  // Same established HTTP safety budgets as the existing bounded research model transport. This grants no other model calls.
  const config: KeywordDraftConfiguration = { contractVersion: 'keyword-draft-configuration-v1', providerId: 'cliproxy', modelId,
    temperature: null, maxOutputTokens: 16384, timeoutMs: 300000, maxResponseBytes: 256 * 1024 };
  if (!validate(config)) throw new TypeError('Keyword drafting requires an explicit valid model identity');
  return Object.freeze(config);
}
export function createKeywordCliproxyTransport(options: { cliproxy: CliproxyConfiguration; configuration: KeywordDraftConfiguration }): KeywordListDraftTransport {
  if (!validate(options.configuration)) throw new TypeError('Invalid keyword model configuration');
  const configuration = Object.freeze({ ...options.configuration });
  // Reuse only the existing single-call HTTP mechanics; no coding ledger, adoption or cross-check policy runs here.
  const http = createInsightCodingCliproxyAi({ cliproxy: options.cliproxy,
    configuration: { ...configuration, contractVersion: 'insight-model-configuration-v1' } });
  return { async draftLists(input) {
    if (!input.prompt || input.modelIdentity !== `${configuration.providerId}:${configuration.modelId}` || input.promptVersion !== 'l9-keyword-prompt-v1') throw new TypeError('Keyword request differs from bound generation identity');
    const timeout = AbortSignal.timeout(configuration.timeoutMs);
    const signal = input.signal ? AbortSignal.any([timeout, input.signal]) : timeout;
    const result = await http.port.generateText({ configuration: http.configuration, systemText: input.prompt, userText: '', signal });
    const output: unknown = JSON.parse(result.text);
    if (!output || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).sort().join(',') !== 'exclusions,keywords') throw new TypeError('Keyword model returned an invalid object');
    return output as Awaited<ReturnType<KeywordListDraftTransport['draftLists']>>;
  } };
}

import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/keyword-list-draft.schema.json' with { type: 'json' };
import type { KeywordListDraftRequest } from '../../../contracts/analysis/keyword-list-draft.generated.js';
import { filterKeywordMeanings, type KeywordMeaningFilterData } from './keyword-meaning-filter.js';
export type { KeywordListDraftRequest } from '../../../contracts/analysis/keyword-list-draft.generated.js';
export type KeywordListDraftSeeds = KeywordListDraftRequest['seeds'];
export const KEYWORD_LIST_DRAFT_CONTRACT = 'l9-keyword-list-draft-v1' as const;
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema);
const validate = ajv.compile<KeywordListDraftRequest>({ $ref: schema.$id });
const validateGeneration = ajv.compile({ $ref: `${schema.$id}#/$defs/generation` });
export interface KeywordListDraftTransport {
  draftLists(input: KeywordListDraftSeeds & { readonly prompt?: string; readonly promptVersion?: string; readonly modelIdentity?: string; readonly signal?: AbortSignal }): Promise<{ readonly keywords: readonly unknown[]; readonly exclusions: readonly unknown[] }>;
}
export class KeywordListDraftError extends Error { readonly code = 'INVALID_KEYWORD_LIST_DRAFT'; }
export async function draftKeywordLists(transport: KeywordListDraftTransport, request: KeywordListDraftRequest,
  generation?: { prompt: string; promptVersion: string; modelIdentity: string }, signal?: AbortSignal): Promise<KeywordMeaningFilterData> {
  if (!validate(request)) throw new KeywordListDraftError('request failed canonical schema validation');
  if (generation && (!validateGeneration(generation) || Buffer.byteLength(generation.prompt) > 65536)) throw new KeywordListDraftError('generation identity or prompt exceeds transport safety budget');
  let drafted: Awaited<ReturnType<KeywordListDraftTransport['draftLists']>>;
  try { drafted = await transport.draftLists({ ...structuredClone(request.seeds), ...(generation ?? {}), ...(signal ? { signal } : {}) }); }
  catch { throw new KeywordListDraftError('draft transport failed without retaining a list'); }
  const output = { contractVersion: 'l9-keyword-data-v1', dataVersion: request.dataVersion, category: request.category,
    provenance: 'MODEL_DRAFTED', keywords: drafted?.keywords, exclusions: drafted?.exclusions } as KeywordMeaningFilterData;
  try { filterKeywordMeanings(output, []); } catch { throw new KeywordListDraftError('drafted lists failed canonical data validation'); }
  return structuredClone(output);
}

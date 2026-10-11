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

function foldedTerm(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

/**
 * Scope terms are owner-provided seeds, not optional model suggestions. Keep
 * the model's exact term/reason bytes when it returns a seed, and append any
 * omitted seeds before the canonical L9 validation.
 */
function retainScopeSeeds(seeds: KeywordListDraftSeeds, drafted: {
  readonly keywords: readonly unknown[];
  readonly exclusions: readonly unknown[];
}): { keywords: readonly unknown[]; exclusions: readonly unknown[] } {
  const modelKeywords = Array.isArray(drafted.keywords) ? [...drafted.keywords] : drafted.keywords;
  const modelKeywordKeys = new Set(modelKeywords.filter((value): value is string => typeof value === 'string').map(foldedTerm));
  const keywords = [
    ...seeds.includeTerms.filter(term => !modelKeywordKeys.has(foldedTerm(term))),
    ...modelKeywords,
  ];
  const modelExclusions = Array.isArray(drafted.exclusions) ? [...drafted.exclusions] : drafted.exclusions;
  const modelExclusionKeys = new Set(modelExclusions.flatMap(value =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { term?: unknown }).term === 'string'
      ? [foldedTerm((value as { term: string }).term)] : []));
  const exclusions = [
    ...modelExclusions,
    ...seeds.excludeTerms.filter(term => !modelExclusionKeys.has(foldedTerm(term))).map(term => ({ term, reason: 'SCOPE_EXCLUDE_TERM' })),
  ];
  return { keywords, exclusions };
}

export async function draftKeywordLists(transport: KeywordListDraftTransport, request: KeywordListDraftRequest,
  generation?: { prompt: string; promptVersion: string; modelIdentity: string }, signal?: AbortSignal): Promise<KeywordMeaningFilterData> {
  if (!validate(request)) throw new KeywordListDraftError('request failed canonical schema validation');
  if (generation && (!validateGeneration(generation) || Buffer.byteLength(generation.prompt) > 65536)) throw new KeywordListDraftError('generation identity or prompt exceeds transport safety budget');
  let drafted: Awaited<ReturnType<KeywordListDraftTransport['draftLists']>>;
  try { drafted = await transport.draftLists({ ...structuredClone(request.seeds), ...(generation ?? {}), ...(signal ? { signal } : {}) }); }
  catch { throw new KeywordListDraftError('draft transport failed without retaining a list'); }
  if (!drafted || typeof drafted !== 'object' || Array.isArray(drafted))
    throw new KeywordListDraftError('draft transport returned a malformed list object');
  const seeded = retainScopeSeeds(request.seeds, drafted);
  const output = { contractVersion: 'l9-keyword-data-v1', dataVersion: request.dataVersion, category: request.category,
    provenance: 'MODEL_DRAFTED', keywords: seeded.keywords, exclusions: seeded.exclusions } as KeywordMeaningFilterData;
  try { filterKeywordMeanings(output, []); } catch { throw new KeywordListDraftError('drafted lists failed canonical data validation'); }
  return structuredClone(output);
}

// Pure deterministic L9 keyword-meaning filter (Ultimate v1.8+, plan U-12).
//
// Every record collected by keyword (search, social posts, comments, ads) is
// classified before counting or quotation: INCLUDED, EXCLUDED with a retained
// reason, or UNCLEAR. Vietnamese diacritics are significant: dropping them
// merges distinct meanings ("thạch dứa" into "thạch dừa"), so matching keeps
// marks and an undiacritized candidate must be resolved by the record's own
// context or stay UNCLEAR. An exact keyword substring alone is not proof of
// meaning when an exclusion term or contradictory context applies.
//
// No I/O, no provider, no model, no randomness: the same input always yields
// the same output. Keyword/exclusion data carries its own version; the result
// carries the code version plus the data version so later appendices (M13/I17)
// can consume exclusion accounting without re-running the filter.
import { createRequire } from 'node:module';
import filterSchema from '../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import type {
  KeywordMeaningExclusion,
  KeywordMeaningFilterData,
  KeywordMeaningFilterResult,
  KeywordMeaningRecord,
  KeywordMeaningRecordResult,
} from '../../../contracts/analysis/keyword-meaning-filter.generated.js';

export type {
  KeywordMeaningDecision,
  KeywordMeaningExclusion,
  KeywordMeaningFilterData,
  KeywordMeaningFilterResult,
  KeywordMeaningReason,
  KeywordMeaningRecord,
  KeywordMeaningRecordResult,
  KeywordListProvenance,
} from '../../../contracts/analysis/keyword-meaning-filter.generated.js';

export const KEYWORD_MEANING_FILTER_CONTRACT = 'keyword-meaning-filter-v1' as const;
export const KEYWORD_MEANING_FILTER_DATA_CONTRACT = 'l9-keyword-data-v1' as const;

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addSchema(filterSchema);
const validateFilterData = ajv.compile<KeywordMeaningFilterData>({ $ref: `${filterSchema.$id}#/$defs/data` });
const validateFilterRecords = ajv.compile<KeywordMeaningRecord[]>({ $ref: `${filterSchema.$id}#/$defs/records` });
const validateFilterResult = ajv.compile<KeywordMeaningFilterResult>({ $ref: `${filterSchema.$id}#/$defs/result` });

/** Canonical schema check for a frozen result; used by tests and future consumers. */
export function validatesKeywordMeaningFilterResult(value: unknown): value is KeywordMeaningFilterResult {
  return validateFilterResult(value);
}

export class KeywordMeaningFilterInputError extends Error {
  readonly code = 'INVALID_KEYWORD_FILTER_INPUT';
}

function fail(message: string): never {
  throw new KeywordMeaningFilterInputError(message);
}

/** Lowercase folded comparison key. Diacritics are preserved; only case folds. */
function foldKey(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/** Diacritic-stripped key used ONLY to detect undiacritized ambiguity, never to match meaning. */
function strippedKey(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function checkData(data: KeywordMeaningFilterData): { keywords: string[]; strippedKeywords: string[]; exclusions: { term: string; folded: string; reason: string }[] } {
  if (!validateFilterData(data)) fail('filter data failed canonical schema validation');
  // Shape and bounds are canonical (AJV); only semantic uniqueness needs code.
  const seen = new Set<string>();
  const keywords = data.keywords.map(term => {
    const clean = term.normalize('NFC');
    const key = foldKey(clean);
    if (seen.has(key)) fail(`duplicate keyword: ${clean}`);
    seen.add(key);
    return clean;
  });
  const exclusions = data.exclusions.map(entry => ({
    term: entry.term.normalize('NFC'), folded: foldKey(entry.term), reason: entry.reason,
  }));
  return { keywords, strippedKeywords: keywords.map(strippedKey), exclusions };
}

function checkRecords(records: readonly KeywordMeaningRecord[]): void {
  if (!validateFilterRecords(records)) fail('records failed canonical schema validation');
  // Only semantic duplicate identity needs code; shape and bounds are canonical.
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    // Identity is byte-exact: never normalize the identifier.
    const id = record.recordId as string;
    if (seen.has(id)) fail(`duplicate recordId: ${id}`);
    seen.add(id);
  }
}

/**
 * Classify a stripped-keyword occurrence against the original span. A span with
 * no marks at all is genuinely undiacritized and may resolve from context; a
 * span that carries different marks (e.g. `dứa` for keyword `dừa`) is an
 * explicit different product even when no exclusion lists it.
 */
function classifyStrippedOccurrence(text: string, strippedKeyword: string, foldedKeyword: string): 'UNDIACRITICIZED' | 'LOOKALIKE' | 'NONE' {
  const points = [...text];
  const chars: string[] = [];
  const map: number[] = [];
  for (const [index, char] of points.entries()) {
    const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const out = base === 'đ' ? 'd' : base === 'Đ' ? 'D' : base;
    for (const piece of out.toLowerCase()) { chars.push(piece); map.push(index); }
  }
  const stripped = chars.join('');
  let from = 0;
  let sawUndiacritized = false;
  for (;;) {
    const found = stripped.indexOf(strippedKeyword, from);
    if (found === -1) break;
    from = found + 1;
    const span = points.slice(map[found]!, map[found + strippedKeyword.length - 1]! + 1).join('');
    if (strippedKey(span) !== strippedKeyword || !/[^\x00-\x7f]/.test(span)) {
      sawUndiacritized = true;
    } else if (foldKey(span) !== foldedKeyword) {
      return 'LOOKALIKE';
    } else {
      sawUndiacritized = true;
    }
  }
  return sawUndiacritized ? 'UNDIACRITICIZED' : 'NONE';
}

/**
 * Classify every record against versioned keyword/exclusion data.
 * Exclusions win over keyword substrings; undiacritized candidates need the
 * record's own context or stay UNCLEAR and out of main counts/quotations.
 */
export function filterKeywordMeanings(data: KeywordMeaningFilterData, records: readonly KeywordMeaningRecord[]): KeywordMeaningFilterResult {
  const prepared = checkData(data);
  checkRecords(records);
  const results: KeywordMeaningRecordResult[] = records.map(record => {
    const recordId = record.recordId as string;
    const rawText = record.text as string;
    const rawContext = typeof record.contextText === 'string' ? (record.contextText as string) : null;
    const text = rawText.normalize('NFC');
    const context = (rawContext ?? '').normalize('NFC');
    const folded = foldKey(text);
    const foldedContext = foldKey(context);
    const frozen = { text: rawText, contextText: rawContext };
    if (text.trim().length === 0) {
      return { recordId, decision: 'UNCLEAR', reason: 'EMPTY_TEXT', matchedKeyword: null, excludedBy: null, exclusionReason: null, ...frozen };
    }
    for (const exclusion of prepared.exclusions) {
      if (folded.includes(exclusion.folded)) {
        return { recordId, decision: 'EXCLUDED', reason: 'EXCLUDED_TERM', matchedKeyword: null,
          excludedBy: exclusion.term, exclusionReason: exclusion.reason, ...frozen };
      }
    }
    for (const exclusion of prepared.exclusions) {
      if (foldedContext.includes(exclusion.folded)) {
        return { recordId, decision: 'EXCLUDED', reason: 'EXCLUDED_CONTEXT', matchedKeyword: null,
          excludedBy: exclusion.term, exclusionReason: exclusion.reason, ...frozen };
      }
    }
    const hit = prepared.keywords.find(keyword => folded.includes(foldKey(keyword)));
    if (hit !== undefined) {
      return { recordId, decision: 'INCLUDED', reason: 'MATCHED_KEYWORD', matchedKeyword: hit, excludedBy: null, exclusionReason: null, ...frozen };
    }
    // Undiacritized text can match several meanings: resolve only from the
    // record's own context, which keeps its marks. An explicitly accented
    // look-alike in the text itself (e.g. thạch dứa for keyword thạch dừa)
    // is a different product even when no exclusion lists it: it stays
    // UNCLEAR and context may never promote it into the keyword's meaning.
    const stripped = strippedKey(text);
    let resolvable = false;
    for (const [index, keyword] of prepared.keywords.entries()) {
      const strippedKeyword = prepared.strippedKeywords[index]!;
      if (!stripped.includes(strippedKeyword) || folded.includes(foldKey(keyword))) continue;
      const verdict = classifyStrippedOccurrence(text, strippedKeyword, foldKey(keyword));
      if (verdict === 'LOOKALIKE') {
        return { recordId, decision: 'UNCLEAR', reason: 'UNLISTED_ACCENTED_LOOKALIKE', matchedKeyword: null,
          excludedBy: null, exclusionReason: null, ...frozen };
      }
      if (verdict === 'UNDIACRITICIZED') resolvable = true;
    }
    if (resolvable) {
      const resolved = prepared.keywords.find(keyword => foldedContext.includes(foldKey(keyword)));
      if (resolved !== undefined) {
        return { recordId, decision: 'INCLUDED', reason: 'RESOLVED_BY_CONTEXT', matchedKeyword: resolved, excludedBy: null, exclusionReason: null, ...frozen };
      }
      return { recordId, decision: 'UNCLEAR', reason: 'UNRESOLVED_UNDIACRITICIZED', matchedKeyword: null, excludedBy: null, exclusionReason: null, ...frozen };
    }
    return { recordId, decision: 'UNCLEAR', reason: 'NO_KEYWORD_MATCH', matchedKeyword: null, excludedBy: null, exclusionReason: null, ...frozen };
  });
  const byReason: Record<string, number> = {};
  let included = 0; let excluded = 0; let unclear = 0;
  for (const row of results) {
    if (row.decision === 'INCLUDED') included++;
    else if (row.decision === 'EXCLUDED') excluded++;
    else unclear++;
    if (row.decision !== 'INCLUDED') byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
  }
  // AJV guarantees at least one keyword, so the tuple cast holds.
  const output: KeywordMeaningFilterResult = { contractVersion: KEYWORD_MEANING_FILTER_CONTRACT, dataVersion: data.dataVersion, category: data.category,
    provenance: data.provenance,
    keywords: prepared.keywords as [string, ...string[]], exclusions: prepared.exclusions.map(({ term, reason }) => ({ term, reason })),
    results, accounting: { included, excluded, unclear, byReason } };
  if (!validateFilterResult(output)) fail('filter result failed canonical schema validation');
  return output;
}

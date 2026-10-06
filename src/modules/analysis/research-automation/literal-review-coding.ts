import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import corpusSchema from '../../../../contracts/analysis/research-review-corpus.schema.json' with { type: 'json' };
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateCorpus = ajv.compile<ResearchReviewCorpus>(corpusSchema);

type LocatedInput = LocatedInsightMethods['input'];
type LocatedRecord = LocatedInput['records'][number];
type Span = LocatedInput['i04'][number]['span'];
type Provenance = LocatedInput['i04'][number]['provenance'];
type Field = LocatedInput['i02'][number]['role'];
type Context = LocatedInput['i02'][number];
type Behavior = LocatedInput['i04'][number];
type Attitude = LocatedInput['i05'][number];
type Reason = LocatedInput['i07'][number];
type Barrier = LocatedInput['i08'][number];
type Facet = Reason['reasonFacet'];
type RecordGroup = ResearchReviewCorpus['records'][number];
type SourceRef = RecordGroup['versions'][number]['sourceRefs'][number];

export const LITERAL_REVIEW_PARSER_REVISION = 'literal-review-parser-v2';
const CODEBOOK_ID: LocatedInput['codebookId'] = 'located-evidence-v1-draft';
const PROFILE_SHA256: LocatedInput['profileSha256'] = '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded';
const ADOPTION_SHA256: LocatedInput['adoptionSha256'] = '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
const RULES_V1 = new URL('../../../../docs/research/literal-review-rules-v1.json', import.meta.url);
const MAX_RULE_BYTES = 256 * 1024;
const LOCATED_ARRAY_LIMIT = 10_000;

export class LiteralReviewCodingValidationError extends TypeError {}
function fail(code: string): never { throw new LiteralReviewCodingValidationError(code); }
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const LEXICON_KEYS = [
  'lexicalCompound', 'informalMarker', 'selfSubject', 'otherPerson', 'possessiveLink', 'speechVerb', 'complementizer',
  'hearsayFrame', 'clauseOpener', 'aspect', 'perfectiveMarker', 'noActionNegator', 'negator', 'conditional', 'futureIntent',
  'attemptMarker', 'completionParticle', 'abilityParticle', 'actionVerb', 'choiceVerb', 'eventBlockedCompound',
  'contrastLinker', 'reasonLinker', 'resultLinker', 'ambiguousResultLinker', 'negatedReasonPrefix', 'obstacleMarker',
  'polarityPositive', 'polarityNegative', 'polarityGap', 'attitudeTarget', 'facetPriceCost', 'facetAccessAvailability',
  'facetProductAttribute', 'facetInformationTrust', 'facetFitOrAttributeAmbiguous', 'facetBlockedCompound', 'contextSituation', 'contextTime',
] as const;
type LexiconKey = typeof LEXICON_KEYS[number];
type Lexicon = Record<LexiconKey, string[][]>;
const TABLE_KEYS = ['rulesetId', 'revision', 'parserRevision', 'codebookId', 'profileSha256', 'adoptionSha256', 'status',
  'language', 'documentation', 'decisionPolicy', 'lexicon'] as const;
const DECISION_POLICY = {
  subjectless: 'UNKNOWN', thirdPartyActor: 'PENDING', noMatch: 'PENDING', notReported: 'DISABLED',
  bareNen: 'PENDING', negatedAttitude: 'PENDING', quotedSentence: 'PENDING',
  contextFields: 'EXACT_PHRASE', numericKgOrK: 'NOT_NEGATION',
  barrier: 'EXPLICIT_ATTEMPT_SAME_VERB_INABILITY_ONLY', absentFields: 'UNKNOWN',
} as const;
// The grammar below assigns each class one positional role; these groups must not share a phrase.
const DISJOINT: LexiconKey[][] = [
  ['contrastLinker', 'reasonLinker', 'resultLinker', 'ambiguousResultLinker'],
  ['facetPriceCost', 'facetAccessAvailability', 'facetProductAttribute', 'facetInformationTrust', 'facetFitOrAttributeAmbiguous'],
  ['negator', 'noActionNegator'], ['selfSubject', 'otherPerson'], ['polarityPositive', 'polarityNegative'],
  ['actionVerb', 'eventBlockedCompound'], ['choiceVerb', 'eventBlockedCompound'],
];
const PHRASE = /^[\p{Ll}\p{Lo}\p{Lm}\p{M}\p{N}]+(?: [\p{Ll}\p{Lo}\p{Lm}\p{M}\p{N}]+){0,5}$/u;
const LINKER_KEYS: LexiconKey[] = ['contrastLinker', 'reasonLinker', 'resultLinker', 'ambiguousResultLinker'];
const FACETS: [LexiconKey, Facet][] = [['facetPriceCost', 'PRICE_COST'], ['facetAccessAvailability', 'ACCESS_AVAILABILITY'],
  ['facetProductAttribute', 'PRODUCT_ATTRIBUTE'], ['facetInformationTrust', 'INFORMATION_TRUST'], ['facetFitOrAttributeAmbiguous', 'UNCLEAR']];
const NEGATORS: LexiconKey[] = ['noActionNegator', 'negator'];

export type LiteralFamily = 'I02' | 'I04' | 'I05' | 'I07' | 'I08';
const FAMILIES: LiteralFamily[] = ['I02', 'I04', 'I05', 'I07', 'I08'];
export type LiteralPendingReason =
  | 'NON_NFC_TEXT' | 'NO_RULE_MATCH' | 'INFORMAL_OR_UNACCENTED_MARKER' | 'QUESTION_SENTENCE' | 'CONDITIONAL_SCOPE'
  | 'FUTURE_OR_INTENT_SCOPE' | 'TENSE_OR_MODALITY_MIXED' | 'NEGATION_SCOPE_UNCLEAR' | 'POST_VERBAL_NEGATION_OR_QUESTION'
  | 'MULTIPLE_NEGATORS' | 'NEGATED_ABILITY_ATTEMPT_OR_COMPLETION' | 'NEGATED_VERB_AMBIGUOUS' | 'UNSUPPORTED_EVENT_PATTERN'
  | 'THIRD_PARTY_ACTOR' | 'UNRECOGNIZED_SUBJECT' | 'MIXED_EVENT_READINGS_IN_CLAUSE' | 'MULTIPLE_EVENTS_IN_CLAUSE'
  | 'INABILITY_WITHOUT_LOCATED_TASK' | 'NOT_YET_NEGATION' | 'MULTIPLE_TARGETS' | 'UNRESOLVED_SPEECH_FRAME'
  | 'THIRD_PARTY_ATTITUDE_HOLDER' | 'REASON_WITHOUT_LOCATED_CHOICE' | 'NEGATED_OR_UNCLEAR_CHOICE' | 'NEGATED_CONDITIONAL_REASON'
  | 'AMBIGUOUS_RESULT_LINKER' | 'TASK_CLAUSE_UNRESOLVED' | 'NO_ACTION_TASK' | 'NEGATED_CONTEXT' | 'HEARSAY_CONTEXT'
  | 'CONFLICTING_RULE_READINGS' | 'QUOTED_TEXT_SCOPE' | 'NEGATED_OBSTACLE' | 'NEGATED_ATTITUDE'
  | 'TASK_OBSTACLE_RELATION_UNVERIFIED' | 'ATTITUDE_HOLDER_UNRESOLVED';
export type LiteralUnitEligibility = 'ELIGIBLE' | 'QUARANTINED' | 'CONFLICTING' | 'EMPTY_TEXT' | 'UNREADABLE_TEXT';
export type LiteralFamilyState = 'CANDIDATE' | 'CANDIDATE_WITH_PENDING' | 'PENDING';
export interface LiteralReviewPending {
  family: LiteralFamily; recordIndex: number; reason: LiteralPendingReason; span: Span | null; trigger: Span | null;
}
export interface LiteralReviewUnit {
  recordIndex: number; groupIndex: number; versionIndex: number;
  identity: RecordGroup['identity']; listingAdmission: RecordGroup['listingAdmission'];
  groupDisposition: RecordGroup['disposition']; occurrenceCount: number;
  rawRowSha256: string; sourceRefs: SourceRef[]; corpusReasons: string[];
  eligibility: LiteralUnitEligibility; exclusionReasons: string[]; textFlags: 'NON_NFC_TEXT'[];
  families: Record<LiteralFamily, LiteralFamilyState> | null;
}
export interface LiteralFamilyCoverage {
  candidateUnits: number; candidateWithPendingUnits: number; pendingUnits: number; candidates: number; pendingItems: number;
}
export interface LiteralReviewCoding {
  contractVersion: 'literal-review-coding-v1';
  codingId: string;
  parserRevision: typeof LITERAL_REVIEW_PARSER_REVISION;
  rules: {
    rulesetId: string; revision: string; sha256: string; byteLength: number; codebookId: LocatedInput['codebookId'];
    profileSha256: LocatedInput['profileSha256']; adoptionSha256: LocatedInput['adoptionSha256'];
    declaredStatus: 'PROPOSAL_PENDING_BUSINESS_REVIEW';
  };
  executionAuthority: 'NONE_RULE_PROPOSAL_ONLY';
  corpus: {
    contractVersion: ResearchReviewCorpus['contractVersion']; mappingRevision: ResearchReviewCorpus['mappingRevision'];
    corpusId: string; corpusBytesSha256: string; collectionId: string; collectionSha256: string; requestSha256: string;
  };
  locatedSource: { sha256: string; locatorTemplate: '/records/{groupIndex}/versions/{versionIndex}/text' };
  records: LocatedRecord[];
  units: LiteralReviewUnit[];
  candidates: { i02: Context[]; i04: Behavior[]; i05: Attitude[]; i07: Reason[]; i08: Barrier[] };
  pending: LiteralReviewPending[];
  unsupported: { family: string; pattern: string; handling: string }[];
  coverage: {
    rawRows: number; sourceRefs: number; recordGroups: number; units: number; eligibleUnits: number; quarantinedUnits: number;
    conflictingUnits: number; emptyTextUnits: number; unreadableUnits: number; nonNfcEligibleUnits: number;
    families: Record<LiteralFamily, LiteralFamilyCoverage>;
  };
  blockers: string[];
  limitations: string[];
}

export interface LiteralLocatedRecordUnit extends Pick<LiteralReviewUnit, 'recordIndex' | 'textFlags' | 'families'> {
  eligibility: 'ELIGIBLE' | 'EXCLUDED' | 'EMPTY_TEXT' | 'UNREADABLE_TEXT';
}
export interface LiteralLocatedRecordCoding extends Pick<LiteralReviewCoding,
  'parserRevision' | 'rules' | 'executionAuthority' | 'records' | 'candidates' | 'pending' | 'unsupported' | 'blockers' | 'limitations'> {
  units: LiteralLocatedRecordUnit[];
  coverage: {
    records: number; eligibleUnits: number; excludedUnits: number; emptyTextUnits: number; unreadableUnits: number;
    nonNfcEligibleUnits: number; families: Record<LiteralFamily, LiteralFamilyCoverage>;
  };
}

// ---------------------------------------------------------------- rule table

interface CompiledRules { rulesetId: string; revision: string; sha256: string; byteLength: number; lex: Lexicon }

function exactObject(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) fail(code);
  return value as Record<string, unknown>;
}

function compileRules(bytes: Buffer): CompiledRules {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_RULE_BYTES) fail('RULE_TABLE_SIZE_INVALID');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('RULE_TABLE_BOM_FORBIDDEN');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('RULE_TABLE_NOT_UTF8'); }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { fail('RULE_TABLE_NOT_JSON'); }
  // JSON.parse keeps the last duplicate key; reject bytes whose reviewed reading could differ from the parsed one.
  for (const key of [...TABLE_KEYS, ...LEXICON_KEYS]) if (text.split(`"${key}"`).length !== 2) fail('RULE_TABLE_DUPLICATE_OR_MISSING_KEY');
  const table = exactObject(raw, TABLE_KEYS, 'RULE_TABLE_SHAPE_INVALID');
  if (canonicalJson(table.decisionPolicy) !== canonicalJson(DECISION_POLICY)) fail('RULE_TABLE_DECISION_POLICY_INVALID');
  if (table.rulesetId !== 'literal-review-rules' || typeof table.revision !== 'string' || !/^v[0-9]+-[a-z0-9-]{1,40}$/.test(table.revision) ||
      table.parserRevision !== LITERAL_REVIEW_PARSER_REVISION || table.codebookId !== CODEBOOK_ID || table.profileSha256 !== PROFILE_SHA256 ||
      table.adoptionSha256 !== ADOPTION_SHA256 || table.status !== 'PROPOSAL_PENDING_BUSINESS_REVIEW' || table.language !== 'vi' ||
      table.documentation !== 'docs/tasks/research-literal-review-coding-v1.md') fail('RULE_TABLE_BINDING_INVALID');
  const lexicon = exactObject(table.lexicon, LEXICON_KEYS, 'RULE_TABLE_LEXICON_SHAPE_INVALID');
  const lex = {} as Lexicon;
  for (const key of LEXICON_KEYS) {
    const phrases = lexicon[key];
    if (!Array.isArray(phrases) || phrases.length === 0 || phrases.length > 300) fail(`RULE_TABLE_CLASS_INVALID:${key}`);
    for (const phrase of phrases) {
      if (typeof phrase !== 'string' || phrase.length > 48 || !PHRASE.test(phrase) || phrase !== phrase.normalize('NFC') || phrase !== fold(phrase)) {
        fail(`RULE_TABLE_PHRASE_INVALID:${key}`);
      }
    }
    if (new Set(phrases).size !== phrases.length) fail(`RULE_TABLE_DUPLICATE_PHRASE:${key}`);
    lex[key] = (phrases as string[]).map(phrase => phrase.split(' '))
      .sort((a, b) => b.length - a.length || compare(a.join(' '), b.join(' ')));
  }
  for (const group of DISJOINT) {
    const seen = new Set<string>();
    for (const key of group) for (const phrase of lex[key]) {
      if (seen.has(phrase.join(' '))) fail(`RULE_TABLE_ROLE_OVERLAP:${key}`);
      seen.add(phrase.join(' '));
    }
  }
  return { rulesetId: table.rulesetId as string, revision: table.revision as string, sha256: sha256(bytes), byteLength: bytes.length, lex };
}

/** Reads the exact repository rule bytes; the digest of these bytes, not the file path, identifies the rule revision. */
export function readLiteralReviewRulesV1(): Buffer {
  return fs.readFileSync(RULES_V1);
}

// ---------------------------------------------------------------- text model

/** Lowercases one UTF-16 code unit at a time and keeps any code unit whose lowercase form changes length, so offsets never move. */
function fold(text: string): string {
  let out = '';
  for (let index = 0; index < text.length; index++) {
    const unit = text[index]!;
    const lower = unit.toLowerCase();
    out += lower.length === 1 ? lower : unit;
  }
  return out;
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const SENTENCE_BREAK = /[.!?;…\r\n。！？]/u;
interface Tok { start: number; end: number; f: string }
interface Range { s: number; e: number }
interface Hit extends Range { key: LexiconKey }
type LinkerKind = 'CONTRAST' | 'REASON' | 'RESULT' | 'AMBIGUOUS_RESULT';
interface Linker extends Range { kind: LinkerKind; negated: boolean }
interface Sentence extends Range { question: boolean; quoted: boolean; clauses: Range[]; linkers: Linker[]; informal: Hit[]; conditional: Hit[] }
interface Doc { text: string; toks: Tok[]; masked: boolean[]; lex: Lexicon; sentences: Sentence[] }
const LINKER_KIND: Partial<Record<LexiconKey, LinkerKind>> = {
  contrastLinker: 'CONTRAST', reasonLinker: 'REASON', resultLinker: 'RESULT', ambiguousResultLinker: 'AMBIGUOUS_RESULT',
};

function adjacent(doc: Doc, index: number): boolean {
  return /^[^\S\r\n]+$/u.test(doc.text.slice(doc.toks[index - 1]!.end, doc.toks[index]!.start));
}

function phraseAt(doc: Doc, index: number, limit: number, phrase: string[], ignoreMask: boolean): boolean {
  if (index < 0 || index + phrase.length > limit) return false;
  for (let k = 0; k < phrase.length; k++) {
    if (doc.toks[index + k]!.f !== phrase[k] || (!ignoreMask && doc.masked[index + k])) return false;
    if (k > 0 && !adjacent(doc, index + k)) return false;
  }
  return true;
}

/** Longest phrase across the given classes; on equal length the earlier class wins. */
function longestAt(doc: Doc, index: number, limit: number, keys: LexiconKey[], ignoreMask = false): Hit | null {
  let best: Hit | null = null;
  for (const key of keys) for (const phrase of doc.lex[key]) {
    if (best && phrase.length <= best.e - best.s) continue;
    if (phraseAt(doc, index, limit, phrase, ignoreMask)) best = { s: index, e: index + phrase.length, key };
  }
  return best;
}

function longestEndingAt(doc: Doc, end: number, floor: number, keys: LexiconKey[]): Hit | null {
  let best: Hit | null = null;
  for (const key of keys) for (const phrase of doc.lex[key]) {
    if (best && phrase.length <= best.e - best.s) continue;
    const start = end - phrase.length;
    if (start >= floor && phraseAt(doc, start, end, phrase, false)) best = { s: start, e: end, key };
  }
  return best;
}

function scan(doc: Doc, range: Range, keys: LexiconKey[], ignoreMask = false): Hit[] {
  const hits: Hit[] = [];
  for (let index = range.s; index < range.e;) {
    const hit = longestAt(doc, index, range.e, keys, ignoreMask);
    if (hit) { hits.push(hit); index = hit.e; } else index++;
  }
  return hits;
}

const skip = (doc: Doc, index: number, limit: number, key: LexiconKey): number => longestAt(doc, index, limit, [key])?.e ?? index;
const verbs = (doc: Doc, range: Range, key: 'actionVerb' | 'choiceVerb'): Hit[] =>
  scan(doc, range, ['eventBlockedCompound', key]).filter(hit => hit.key === key);

function spanOf(doc: Doc, range: Range): Span {
  const start = doc.toks[range.s]!.start; const end = doc.toks[range.e - 1]!.end;
  return { start, end, quote: doc.text.slice(start, end) };
}

function uniqueSpans(spans: Span[]): Span[] {
  const map = new Map(spans.map(span => [`${span.start}:${span.end}`, span]));
  return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function boundary(doc: Doc, index: number): 'SPACE' | 'CLAUSE' | 'SENTENCE' {
  const left = doc.toks[index - 1]!; const right = doc.toks[index]!;
  const separator = doc.text.slice(left.end, right.start);
  if (/^[^\S\r\n]+$/u.test(separator)) return 'SPACE';
  if ((separator === '.' || separator === ',') && /\p{N}$/u.test(left.f) && /^\p{N}/u.test(right.f)) return 'SPACE';
  return SENTENCE_BREAK.test(separator) ? 'SENTENCE' : 'CLAUSE';
}

function splitLinkers(doc: Doc, clausesIn: Range[]): { clauses: Range[]; linkers: Linker[] } {
  const clauses: Range[] = []; const linkers: Linker[] = [];
  for (const clause of clausesIn) {
    let pieceStart = clause.s;
    for (let index = clause.s; index < clause.e;) {
      const hit = longestAt(doc, index, clause.e, LINKER_KEYS);
      if (!hit) { index++; continue; }
      const prefix = hit.key === 'reasonLinker' && hit.s > pieceStart ? longestEndingAt(doc, hit.s, pieceStart, ['negatedReasonPrefix']) : null;
      const negated = prefix !== null && adjacent(doc, hit.s);
      const start = prefix && negated ? prefix.s : hit.s;
      if (start > pieceStart) clauses.push({ s: pieceStart, e: start });
      linkers.push({ s: start, e: hit.e, kind: LINKER_KIND[hit.key]!, negated });
      pieceStart = hit.e; index = hit.e;
    }
    if (clause.e > pieceStart) clauses.push({ s: pieceStart, e: clause.e });
  }
  return { clauses, linkers };
}

function buildDoc(text: string, lex: Lexicon): Doc {
  const folded = fold(text);
  const toks: Tok[] = [];
  for (const match of text.matchAll(WORD)) {
    const start = match.index!; const end = start + match[0].length;
    toks.push({ start, end, f: folded.slice(start, end) });
  }
  const doc: Doc = { text, toks, masked: toks.map(() => false), lex, sentences: [] };
  // Quoted words are not automatically the narrator's own action. An unmatched
  // opener conservatively scopes to the end rather than assigning a speaker.
  const quotes: { start: number; end: number }[] = [];
  const closers: Record<string, string> = { '"': '"', '“': '”', '‘': '’', '«': '»' };
  for (let index = 0; index < text.length; index++) {
    const closer = closers[text[index]!];
    if (!closer) continue;
    const end = text.indexOf(closer, index + 1);
    quotes.push({ start: index, end: end === -1 ? text.length : end + 1 });
    index = end === -1 ? text.length : end;
  }
  for (const hit of scan(doc, { s: 0, e: toks.length }, ['lexicalCompound'], true)) for (let k = hit.s; k < hit.e; k++) doc.masked[k] = true;
  let clauses: Range[] = []; let sentenceStart = 0; let clauseStart = 0;
  for (let index = 1; index <= toks.length; index++) {
    const kind = index === toks.length ? 'SENTENCE' : boundary(doc, index);
    if (kind === 'SPACE') continue;
    clauses.push({ s: clauseStart, e: index }); clauseStart = index;
    if (kind === 'SENTENCE') {
      const tail = text.slice(toks[index - 1]!.end, index === toks.length ? text.length : toks[index]!.start);
      const range = { s: sentenceStart, e: index };
      doc.sentences.push({ ...range, ...splitLinkers(doc, clauses), question: /[?？]/u.test(tail),
        quoted: quotes.some(quote => quote.start < toks[index - 1]!.end && quote.end > toks[sentenceStart]!.start),
        informal: scan(doc, range, ['informalMarker']), conditional: scan(doc, range, ['conditional']) });
      clauses = []; sentenceStart = index;
    }
  }
  return doc;
}

const clauseBefore = (sentence: Sentence, position: number): number => sentence.clauses.findLastIndex(clause => clause.e <= position);
const clauseAfter = (sentence: Sentence, position: number): number => sentence.clauses.findIndex(clause => clause.s >= position);
const linkerBetween = (sentence: Sentence, left: Range, right: Range): boolean =>
  sentence.linkers.some(linker => linker.s >= left.e && linker.e <= right.s);

/** Bare "nên" is not an adopted causal pattern, even before a self subject. */
function modalNen(doc: Doc, sentence: Sentence, clause: Range): Linker | null {
  const linker = sentence.linkers.find(row => row.kind === 'AMBIGUOUS_RESULT' && row.e === clause.s);
  return linker ?? null;
}

function unresolvedInformal(doc: Doc, range: Range): boolean {
  return scan(doc, range, ['informalMarker']).some(hit => {
    const token = doc.toks[hit.s]!;
    // Explicit numeric units/price shorthand are not grammar negators. No
    // conversion or unit interpretation is performed here.
    return !(['kg', 'k'].includes(token.f) && hit.s > range.s && /^\p{N}+$/u.test(doc.toks[hit.s - 1]!.f));
  });
}

// ---------------------------------------------------------------- grammar

type Subject = { kind: 'NONE' } | { kind: 'UNRECOGNIZED' } | { kind: 'SELF' | 'OTHER_PERSON' | 'HEARSAY'; range: Range };

/** Subject slot: opener* then exactly one of self | hearsay frame | other person [possessive] [self] [speech verb [complementizer]]. */
function parseSubject(doc: Doc, range: Range): Subject {
  let index = range.s;
  for (let opener = longestAt(doc, index, range.e, ['clauseOpener']); opener; opener = longestAt(doc, index, range.e, ['clauseOpener'])) index = opener.e;
  if (index === range.e) return { kind: 'NONE' };
  const slot = { s: index, e: range.e };
  if (longestAt(doc, index, range.e, ['selfSubject'])?.e === range.e) return { kind: 'SELF', range: slot };
  const frame = longestAt(doc, index, range.e, ['hearsayFrame']);
  if (frame && skip(doc, frame.e, range.e, 'complementizer') === range.e) return { kind: 'HEARSAY', range: slot };
  const other = longestAt(doc, index, range.e, ['otherPerson']);
  if (other) {
    const next = skip(doc, skip(doc, other.e, range.e, 'possessiveLink'), range.e, 'selfSubject');
    if (next === range.e) return { kind: 'OTHER_PERSON', range: slot };
    const speech = longestAt(doc, next, range.e, ['speechVerb']);
    if (speech && skip(doc, speech.e, range.e, 'complementizer') === range.e) return { kind: 'HEARSAY', range: slot };
  }
  return { kind: 'UNRECOGNIZED' };
}

/** A hearsay frame inside a range, or a whole preceding clause that is only a hearsay frame with no linker in between. */
function hearsayIn(doc: Doc, range: Range): Range | null {
  const frame = scan(doc, range, ['hearsayFrame'])[0];
  if (frame) return { s: frame.s, e: skip(doc, frame.e, range.e, 'complementizer') };
  for (const speech of scan(doc, range, ['speechVerb'])) {
    const subject = parseSubject(doc, { s: range.s, e: skip(doc, speech.e, range.e, 'complementizer') });
    if (subject.kind === 'HEARSAY') return subject.range;
  }
  return null;
}
function priorHearsay(doc: Doc, sentence: Sentence, clauseIndex: number): Range | null {
  const previous = sentence.clauses[clauseIndex - 1];
  const clause = sentence.clauses[clauseIndex]!;
  if (!previous || linkerBetween(sentence, previous, clause)) return null;
  const subject = parseSubject(doc, previous);
  return subject.kind === 'HEARSAY' ? { s: previous.s, e: previous.e } : null;
}

type EventKind = Behavior['eventKind'];
type Attribution = Behavior['attribution'];
type Pending = { kind: 'PENDING'; reason: LiteralPendingReason; trigger: Span };
type EventReading =
  | { kind: 'CANDIDATE'; eventKind: EventKind; attribution: Attribution; subject: Subject; startTok: number; qualifiers: Span[] }
  | Pending | { kind: 'FAILURE'; trigger: Span; subject: Subject };
type ClauseEvent = EventReading | { kind: 'NONE' } | { kind: 'CONSUMED' }
  | { kind: 'CANDIDATE'; eventKind: EventKind; attribution: Attribution; subject: Subject; startTok: number; endTok: number; qualifiers: Span[] };
const pendingOf = (reason: LiteralPendingReason, trigger: Span): Pending => ({ kind: 'PENDING', reason, trigger });

/**
 * One action verb: [subject] [negator | attempt | aspect]* VERB [completion] [... ability].
 * Sentence conditionals and clause future/intent markers remain pending; they never become an action or absence claim.
 */
function readEvent(doc: Doc, sentence: Sentence, clauseIndex: number, verb: Hit, floor: number, inherited: Subject | null): EventReading {
  const clause = sentence.clauses[clauseIndex]!;
  const trigger = spanOf(doc, verb);
  if (sentence.quoted) return pendingOf('QUOTED_TEXT_SCOPE', trigger);
  if (unresolvedInformal(doc, clause)) return pendingOf('INFORMAL_OR_UNACCENTED_MARKER', trigger);
  if (sentence.question) return pendingOf('QUESTION_SENTENCE', trigger);
  if (modalNen(doc, sentence, clause)) return pendingOf('AMBIGUOUS_RESULT_LINKER', trigger);
  const future = scan(doc, clause, ['futureIntent']);
  if (sentence.conditional.length || future.length) {
    if (scan(doc, clause, ['perfectiveMarker']).length) return pendingOf('TENSE_OR_MODALITY_MIXED', trigger);
    return pendingOf(sentence.conditional.length ? 'CONDITIONAL_SCOPE' : 'FUTURE_OR_INTENT_SCOPE', trigger);
  }
  let index = verb.s; let attempt: Hit | null = null; const negators: Hit[] = [];
  for (let hit = longestEndingAt(doc, index, floor, [...NEGATORS, 'attemptMarker', 'aspect']); hit;
    hit = longestEndingAt(doc, index, floor, [...NEGATORS, 'attemptMarker', 'aspect'])) {
    if (hit.key === 'attemptMarker') { if (attempt) return pendingOf('UNSUPPORTED_EVENT_PATTERN', trigger); attempt = hit; }
    else if (hit.key !== 'aspect') negators.push(hit);
    index = hit.s;
  }
  if (scan(doc, { s: floor, e: index }, NEGATORS).length) return pendingOf('NEGATION_SCOPE_UNCLEAR', trigger);
  const post = { s: verb.e, e: clause.e };
  if (scan(doc, post, NEGATORS).length) return pendingOf('POST_VERBAL_NEGATION_OR_QUESTION', trigger);
  if (negators.length > 1) return pendingOf('MULTIPLE_NEGATORS', trigger);
  const ability = scan(doc, post, ['abilityParticle']).length > 0;
  const completion = longestAt(doc, verb.e, clause.e, ['completionParticle']);
  const negator = negators[0];
  let subject = inherited ?? parseSubject(doc, { s: clause.s, e: index });
  let startTok = clause.s;
  const prior = subject.kind === 'NONE' ? priorHearsay(doc, sentence, clauseIndex) : null;
  if (prior) { subject = { kind: 'HEARSAY', range: prior }; startTok = prior.s; }
  if (subject.kind === 'OTHER_PERSON') return pendingOf('THIRD_PARTY_ACTOR', trigger);
  if (subject.kind === 'UNRECOGNIZED') return pendingOf('UNRECOGNIZED_SUBJECT', trigger);
  let eventKind: EventKind;
  if (negator?.key === 'noActionNegator') {
    if (ability || attempt || completion) return pendingOf('NEGATED_ABILITY_ATTEMPT_OR_COMPLETION', trigger);
    eventKind = 'NO_ACTION_EXPLICIT';
  } else if (negator) {
    return ability && !attempt && !completion ? { kind: 'FAILURE', trigger: spanOf(doc, clause), subject } : pendingOf('NEGATED_VERB_AMBIGUOUS', trigger);
  } else if (attempt && completion) return pendingOf('UNSUPPORTED_EVENT_PATTERN', trigger);
  else eventKind = attempt ? 'ATTEMPT_REPORTED' : completion ? 'COMPLETION_REPORTED' : 'ACTION_REPORTED';
  const attribution: Attribution = subject.kind === 'SELF' ? 'SELF_REPORTED' : subject.kind === 'HEARSAY' ? 'OTHER_REPORTED' : 'UNKNOWN';
  const qualifiers = [negator, attempt, completion].filter((hit): hit is Hit => hit !== null && hit !== undefined).map(hit => spanOf(doc, hit));
  if (subject.kind === 'HEARSAY') qualifiers.push(spanOf(doc, subject.range));
  return { kind: 'CANDIDATE', eventKind, attribution, subject, startTok, qualifiers: uniqueSpans(qualifiers) };
}

/** The first verb heads the clause; a later verb is coordinated only when separated by openers/aspect/attempt words, otherwise it is embedded context. */
function clauseEvent(doc: Doc, sentence: Sentence, clauseIndex: number): ClauseEvent {
  const clause = sentence.clauses[clauseIndex]!;
  const found = verbs(doc, clause, 'actionVerb');
  if (!found.length) return { kind: 'NONE' };
  const head = readEvent(doc, sentence, clauseIndex, found[0]!, clause.s, null);
  const readings: EventReading[] = [head];
  const headSubject: Subject = head.kind === 'CANDIDATE' ? head.subject : { kind: 'NONE' };
  for (let k = 1; k < found.length; k++) {
    const gap = { s: found[k - 1]!.e, e: found[k]!.s };
    const covered = scan(doc, gap, ['clauseOpener', 'aspect', 'attemptMarker', 'completionParticle', ...NEGATORS])
      .reduce((total, hit) => total + hit.e - hit.s, 0);
    if (covered === gap.e - gap.s) readings.push(readEvent(doc, sentence, clauseIndex, found[k]!, gap.s, headSubject));
  }
  const pending = readings.find((reading): reading is Pending => reading.kind === 'PENDING');
  if (pending) return pending;
  if (new Set(readings.map(reading => reading.kind)).size > 1) return pendingOf('MIXED_EVENT_READINGS_IN_CLAUSE', spanOf(doc, clause));
  if (head.kind === 'CANDIDATE') {
    const candidates = readings as Extract<EventReading, { kind: 'CANDIDATE' }>[];
    if (new Set(candidates.map(row => `${row.eventKind}:${row.attribution}`)).size > 1) return pendingOf('MULTIPLE_EVENTS_IN_CLAUSE', spanOf(doc, clause));
    return { ...head, startTok: Math.min(...candidates.map(row => row.startTok)), endTok: clause.e,
      qualifiers: uniqueSpans(candidates.flatMap(row => row.qualifiers)) };
  }
  return head;
}

function compatibleFailureActors(doc: Doc, task: Subject, failure: Subject): boolean {
  // Local subject elision may continue an explicit self/unknown action, but
  // cannot identify the person in a hearsay frame or a different named actor.
  if (failure.kind === 'NONE') return task.kind === 'SELF' || task.kind === 'NONE';
  if (task.kind !== 'SELF' || failure.kind !== 'SELF') return false;
  const words = (range: Range) => doc.toks.slice(range.s, range.e).map(token => token.f).join(' ');
  return words(task.range) === words(failure.range);
}

function compatibleFailureTasks(doc: Doc, task: Range, failure: Range): boolean {
  const taskVerb = verbs(doc, task, 'actionVerb')[0];
  const failedVerb = verbs(doc, failure, 'actionVerb')[0];
  if (!taskVerb || !failedVerb) return false;
  const words = (range: Range) => doc.toks.slice(range.s, range.e).map(token => token.f).join(' ');
  const attempted = words(taskVerb); const failed = words(failedVerb);
  if (attempted !== failed && !attempted.startsWith(`${failed} `)) return false;
  const remainder = (verb: Hit, clause: Range): string => {
    let start = verb.e; let end = clause.e;
    for (let hit = longestAt(doc, start, end, ['abilityParticle', 'completionParticle']); hit;
      hit = longestAt(doc, start, end, ['abilityParticle', 'completionParticle'])) start = hit.e;
    for (let hit = longestEndingAt(doc, end, start, ['abilityParticle', 'completionParticle']); hit;
      hit = longestEndingAt(doc, end, start, ['abilityParticle', 'completionParticle'])) end = hit.s;
    return words({ s: start, e: end });
  };
  const failedObject = remainder(failedVerb, failure);
  // An omitted object may continue this local task. An explicit object must
  // match exactly; no noun aliases, category inference or distant coreference.
  return !failedObject || remainder(taskVerb, task) === failedObject;
}

/** Contrast-linked failure or obstacle after an attempt/action stays a qualifier of that event; the full quote covers both clauses. */
function sentenceEvents(doc: Doc, sentence: Sentence): { raw: ClauseEvent[]; events: ClauseEvent[] } {
  const raw = sentence.clauses.map((_, index) => clauseEvent(doc, sentence, index));
  const events = [...raw];
  for (const linker of sentence.linkers) {
    if (linker.kind !== 'CONTRAST') continue;
    const before = clauseBefore(sentence, linker.s); const after = clauseAfter(sentence, linker.e);
    if (before === -1 || after === -1) continue;
    const task = events[before]!; const next = events[after]!; const obstacleClause = sentence.clauses[after]!;
    const obstacle = !obstacleGuard(doc, sentence, obstacleClause, next) &&
      ((next.kind === 'FAILURE' && task.kind === 'CANDIDATE' && compatibleFailureActors(doc, task.subject, next.subject) &&
        compatibleFailureTasks(doc, sentence.clauses[before]!, obstacleClause)) ||
        (next.kind === 'NONE' && scan(doc, obstacleClause, ['obstacleMarker']).length > 0));
    if (task.kind === 'CANDIDATE' && 'endTok' in task && task.eventKind !== 'NO_ACTION_EXPLICIT' && obstacle) {
      events[before] = { ...task, endTok: obstacleClause.e, qualifiers: uniqueSpans([...task.qualifiers, spanOf(doc, obstacleClause)]) };
      events[after] = { kind: 'CONSUMED' };
    }
  }
  return { raw, events };
}

function facetOf(doc: Doc, range: Range): Facet {
  const facets = new Set(scan(doc, range, ['facetBlockedCompound', ...FACETS.map(([key]) => key)])
    .filter(hit => hit.key !== 'facetBlockedCompound').map(hit => FACETS.find(([key]) => key === hit.key)![1]));
  return facets.size === 1 ? [...facets][0]! : 'UNCLEAR';
}

function obstacleGuard(doc: Doc, sentence: Sentence, clause: Range, reading: ClauseEvent): LiteralPendingReason | null {
  if (sentence.quoted) return 'QUOTED_TEXT_SCOPE';
  if (scan(doc, clause, ['futureIntent']).length) return 'FUTURE_OR_INTENT_SCOPE';
  const markers = scan(doc, clause, ['obstacleMarker']);
  // Negation inside a declared inability phrase is part of that obstacle;
  // negation outside it denies or qualifies the obstacle and must not flip it.
  if (reading.kind !== 'FAILURE' && scan(doc, clause, NEGATORS)
    .some(negator => !markers.some(marker => marker.s <= negator.s && marker.e >= negator.e))) return 'NEGATED_OBSTACLE';
  return null;
}

// ---------------------------------------------------------------- per-record coding

interface Sink {
  i02: Context[]; i04: Behavior[]; i05: Attitude[]; i07: Reason[]; i08: Barrier[]; pending: LiteralReviewPending[];
}
const UNKNOWN_FIELD = (): Field => ({ state: 'UNKNOWN', span: null });

function codeRecord(doc: Doc, recordIndex: number, provenance: () => Provenance, sink: Sink): void {
  const pend = (family: LiteralFamily, reason: LiteralPendingReason, span: Span | null, trigger: Span | null): void => {
    sink.pending.push({ family, recordIndex, reason, span, trigger });
  };
  for (const sentence of doc.sentences) {
    const { raw, events } = sentenceEvents(doc, sentence);
    // I04
    events.forEach((event, index) => {
      const clause = sentence.clauses[index]!;
      if (event.kind === 'CANDIDATE' && 'endTok' in event) {
        sink.i04.push({ recordIndex, provenance: provenance(), qualifiers: event.qualifiers, counterevidence: [],
          span: spanOf(doc, { s: event.startTok, e: event.endTok }), eventKind: event.eventKind, attribution: event.attribution });
      } else if (event.kind === 'PENDING') pend('I04', event.reason, spanOf(doc, clause), event.trigger);
      else if (event.kind === 'FAILURE') pend('I04', 'INABILITY_WITHOUT_LOCATED_TASK', spanOf(doc, clause), event.trigger);
    });
    // I05
    sentence.clauses.forEach((_, index) => codeAttitude(doc, sentence, index, recordIndex, provenance, sink, pend));
    // I07
    codeReasons(doc, sentence, recordIndex, provenance, sink, pend);
    // I08
    for (const linker of sentence.linkers) {
      if (linker.kind !== 'CONTRAST') continue;
      const before = clauseBefore(sentence, linker.s); const after = clauseAfter(sentence, linker.e);
      if (before === -1 || after === -1) continue;
      const taskClause = sentence.clauses[before]!; const obstacleClause = sentence.clauses[after]!;
      const markers = scan(doc, obstacleClause, ['obstacleMarker']);
      if (!markers.length && raw[after]!.kind !== 'FAILURE') continue;
      const task = raw[before]!;
      if (task.kind === 'NONE') continue;
      const context = spanOf(doc, { s: taskClause.s, e: obstacleClause.e }); const link = spanOf(doc, linker);
      const taskSpan = spanOf(doc, taskClause);
      const deniedObstacle = obstacleGuard(doc, sentence, obstacleClause, raw[after]!);
      if (deniedObstacle) { pend('I08', deniedObstacle, context, link); continue; }
      if (unresolvedInformal(doc, { s: taskClause.s, e: obstacleClause.e })) { pend('I08', 'INFORMAL_OR_UNACCENTED_MARKER', context, link); continue; }
      if (sentence.question) { pend('I08', 'QUESTION_SENTENCE', context, link); continue; }
      if (sentence.conditional.length) { pend('I08', 'CONDITIONAL_SCOPE', context, link); continue; }
      if (task.kind !== 'CANDIDATE' || !('endTok' in task)) { pend('I08', 'TASK_CLAUSE_UNRESOLVED', context, link); continue; }
      if (task.eventKind === 'NO_ACTION_EXPLICIT') { pend('I08', 'NO_ACTION_TASK', context, link); continue; }
      const failure = raw[after]!;
      if (task.eventKind !== 'ATTEMPT_REPORTED' || failure.kind !== 'FAILURE' || !compatibleFailureTasks(doc, taskClause, obstacleClause) ||
        !compatibleFailureActors(doc, task.subject, failure.subject)) {
        pend('I08', 'TASK_OBSTACLE_RELATION_UNVERIFIED', context, link); continue;
      }
      sink.i08.push({ recordIndex, provenance: provenance(),
        qualifiers: uniqueSpans([...task.qualifiers.filter(span => span.end <= taskSpan.end),
          ...markers.map(hit => spanOf(doc, hit))]),
        counterevidence: [], attemptedTask: spanOf(doc, taskClause), obstacleClause: spanOf(doc, obstacleClause),
        relation: { context, link }, barrierFacet: facetOf(doc, obstacleClause), resolutionState: UNKNOWN_FIELD() });
    }
    // I02
    sentence.clauses.forEach(clause => {
      const situation = scan(doc, clause, ['contextSituation']); const time = scan(doc, clause, ['contextTime']);
      if (!situation.length && !time.length) return;
      const span = spanOf(doc, clause); const trigger = spanOf(doc, (situation[0] ?? time[0])!);
      const reason: LiteralPendingReason | null = sentence.quoted ? 'QUOTED_TEXT_SCOPE' : unresolvedInformal(doc, clause) ? 'INFORMAL_OR_UNACCENTED_MARKER' : sentence.question ? 'QUESTION_SENTENCE'
        : modalNen(doc, sentence, clause) ? 'AMBIGUOUS_RESULT_LINKER'
          : sentence.conditional.length ? 'CONDITIONAL_SCOPE' : scan(doc, clause, ['futureIntent']).length ? 'FUTURE_OR_INTENT_SCOPE'
          : scan(doc, clause, NEGATORS).length ? 'NEGATED_CONTEXT'
            : scan(doc, clause, ['speechVerb', 'hearsayFrame']).length ? 'HEARSAY_CONTEXT' : null;
      if (reason) { pend('I02', reason, span, trigger); return; }
      sink.i02.push({ recordIndex, provenance: provenance(), qualifiers: uniqueSpans([...situation, ...time].map(hit => spanOf(doc, hit))),
        counterevidence: [], role: UNKNOWN_FIELD(), task: UNKNOWN_FIELD(), setting: UNKNOWN_FIELD(),
        situation: situation.length ? { state: 'SOURCE_STATED', span: spanOf(doc, situation[0]!) } : UNKNOWN_FIELD(),
        time: time.length ? { state: 'SOURCE_STATED', span: spanOf(doc, time[0]!) } : UNKNOWN_FIELD() });
    });
  }
}

type Pend = (family: LiteralFamily, reason: LiteralPendingReason, span: Span | null, trigger: Span | null) => void;

/** Clause polarity from closed positive/negative phrases with adjacent negation; target and holder are copied only when literal. */
function codeAttitude(doc: Doc, sentence: Sentence, clauseIndex: number, recordIndex: number, provenance: () => Provenance, sink: Sink, pend: Pend): void {
  const clause = sentence.clauses[clauseIndex]!;
  const hits = scan(doc, clause, ['polarityPositive', 'polarityNegative']);
  if (!hits.length) return;
  const span = spanOf(doc, clause); const trigger = spanOf(doc, hits[0]!);
  const guard: LiteralPendingReason | null = sentence.quoted ? 'QUOTED_TEXT_SCOPE' : unresolvedInformal(doc, clause) ? 'INFORMAL_OR_UNACCENTED_MARKER' : sentence.question ? 'QUESTION_SENTENCE'
    : modalNen(doc, sentence, clause) ? 'AMBIGUOUS_RESULT_LINKER'
      : sentence.conditional.length ? 'CONDITIONAL_SCOPE' : scan(doc, clause, ['futureIntent']).length ? 'FUTURE_OR_INTENT_SCOPE' : null;
  if (guard) { pend('I05', guard, span, trigger); return; }
  const polarities = new Set<Attitude['polarity']>(); const qualifiers: Span[] = [];
  for (const hit of hits) {
    let index = hit.s;
    for (let gap = longestEndingAt(doc, index, clause.s, ['polarityGap']); gap; gap = longestEndingAt(doc, index, clause.s, ['polarityGap'])) index = gap.s;
    const negator = longestEndingAt(doc, index, clause.s, NEGATORS);
    if (negator?.key === 'noActionNegator') { pend('I05', 'NOT_YET_NEGATION', span, spanOf(doc, negator)); return; }
    if (negator) { pend('I05', 'NEGATED_ATTITUDE', span, spanOf(doc, negator)); return; }
    const positive = hit.key === 'polarityPositive';
    polarities.add(positive ? 'POSITIVE' : 'NEGATIVE');
  }
  const loose = scan(doc, clause, NEGATORS)[0];
  if (loose) { pend('I05', 'NEGATION_SCOPE_UNCLEAR', span, spanOf(doc, loose)); return; }
  const targets = scan(doc, clause, ['attitudeTarget']);
  if (new Set(targets.map(hit => doc.toks.slice(hit.s, hit.e).map(tok => tok.f).join(' '))).size > 1) { pend('I05', 'MULTIPLE_TARGETS', span, trigger); return; }
  const pre = { s: clause.s, e: hits[0]!.s };
  let speaker = UNKNOWN_FIELD();
  const named = scan(doc, pre, ['selfSubject', 'otherPerson']);
  const frame = hearsayIn(doc, pre) ?? (named.length ? null : priorHearsay(doc, sentence, clauseIndex));
  if (frame) { speaker = { state: 'SOURCE_STATED', span: spanOf(doc, frame) }; qualifiers.push(spanOf(doc, frame)); }
  else if (scan(doc, pre, ['speechVerb']).length) { pend('I05', 'UNRESOLVED_SPEECH_FRAME', span, trigger); return; }
  else if (named.some(hit => hit.key === 'otherPerson')) { pend('I05', 'THIRD_PARTY_ATTITUDE_HOLDER', span, trigger); return; }
  else if (named[0]) {
    if (longestEndingAt(doc, named[0].s, clause.s, ['possessiveLink'])) { pend('I05', 'THIRD_PARTY_ATTITUDE_HOLDER', span, trigger); return; }
    const remainder = { s: named[0].e, e: pre.e };
    if (named[0].s !== clause.s || scan(doc, remainder, ['polarityGap', 'attitudeTarget', 'aspect'])
      .reduce((total, hit) => total + hit.e - hit.s, 0) !== remainder.e - remainder.s) {
      pend('I05', 'ATTITUDE_HOLDER_UNRESOLVED', span, trigger); return;
    }
    speaker = { state: 'SOURCE_STATED', span: spanOf(doc, named[0]) };
  }
  const polarity: Attitude['polarity'] = polarities.size === 1 ? [...polarities][0]! : polarities.has('UNCLEAR') ? 'UNCLEAR' : 'MIXED';
  sink.i05.push({ recordIndex, provenance: provenance(), qualifiers: uniqueSpans(qualifiers), counterevidence: [], span, polarity,
    target: targets[0] ? { state: 'SOURCE_STATED', span: spanOf(doc, targets[0]) } : UNKNOWN_FIELD(), speakerAttribution: speaker });
}

/**
 * Explicit same-sentence relations only:
 *   A: CHOICE [không phải] vì|bởi vì|tại vì REASON
 *   B: vì REASON (cho nên|vì vậy|vì thế|do đó) CHOICE
 *   C: REASON (cho nên|vì vậy|vì thế|do đó) CHOICE.
 * No intervening clause or contrast may be skipped; bare nên stays pending.
 */
function codeReasons(doc: Doc, sentence: Sentence, recordIndex: number, provenance: () => Provenance, sink: Sink, pend: Pend): void {
  const consumed = new Set<Linker>();
  const evaluate = (choiceIndex: number, reasonIndex: number, link: Linker, extra: Linker | null): void => {
    const choice = sentence.clauses[choiceIndex]!; const reason = sentence.clauses[reasonIndex]!;
    const parts: Range[] = [choice, reason, link, ...(extra ? [extra] : [])];
    const context = spanOf(doc, { s: Math.min(...parts.map(part => part.s)), e: Math.max(...parts.map(part => part.e)) });
    const linkSpan = spanOf(doc, link);
    if (sentence.quoted) return pend('I07', 'QUOTED_TEXT_SCOPE', context, linkSpan);
    if (unresolvedInformal(doc, { s: Math.min(choice.s, reason.s), e: Math.max(choice.e, reason.e) })) return pend('I07', 'INFORMAL_OR_UNACCENTED_MARKER', context, linkSpan);
    if (sentence.question) return pend('I07', 'QUESTION_SENTENCE', context, linkSpan);
    if (sentence.conditional.length) return pend('I07', 'CONDITIONAL_SCOPE', context, linkSpan);
    if (link.kind === 'AMBIGUOUS_RESULT' || extra?.kind === 'AMBIGUOUS_RESULT') return pend('I07', 'AMBIGUOUS_RESULT_LINKER', context, linkSpan);
    const verb = verbs(doc, choice, 'choiceVerb')[0];
    if (!verb) return pend('I07', 'REASON_WITHOUT_LOCATED_CHOICE', context, linkSpan);
    if (modalNen(doc, sentence, choice)) return pend('I07', 'AMBIGUOUS_RESULT_LINKER', context, linkSpan);
    if (scan(doc, choice, ['futureIntent']).length) return pend('I07', 'FUTURE_OR_INTENT_SCOPE', context, linkSpan);
    if (scan(doc, choice, NEGATORS).length) return pend('I07', 'NEGATED_OR_UNCLEAR_CHOICE', context, linkSpan);
    let index = verb.s;
    for (let hit = longestEndingAt(doc, index, choice.s, ['aspect', 'attemptMarker']); hit; hit = longestEndingAt(doc, index, choice.s, ['aspect', 'attemptMarker'])) index = hit.s;
    const subject = parseSubject(doc, { s: choice.s, e: index });
    if (subject.kind === 'OTHER_PERSON') return pend('I07', 'THIRD_PARTY_ACTOR', context, linkSpan);
    if (subject.kind === 'UNRECOGNIZED') return pend('I07', 'UNRECOGNIZED_SUBJECT', context, linkSpan);
    const qualifiers: Span[] = extra ? [spanOf(doc, extra)] : [];
    let speakerBasis: Reason['speakerBasis'] = subject.kind === 'SELF' ? 'SELF_STATED' : subject.kind === 'HEARSAY' ? 'OTHER_REPORTED' : 'UNKNOWN';
    if (subject.kind === 'HEARSAY') qualifiers.push(spanOf(doc, subject.range));
    const reasonFrame = hearsayIn(doc, reason);
    if (!reasonFrame && scan(doc, reason, ['speechVerb']).length) return pend('I07', 'UNRESOLVED_SPEECH_FRAME', context, linkSpan);
    if (reasonFrame) { speakerBasis = 'OTHER_REPORTED'; qualifiers.push(spanOf(doc, reasonFrame)); }
    if (scan(doc, reason, NEGATORS).length) return pend('I07', 'NEGATION_SCOPE_UNCLEAR', context, linkSpan);
    sink.i07.push({ recordIndex, provenance: provenance(), qualifiers: uniqueSpans(qualifiers), counterevidence: [],
      choiceText: spanOf(doc, choice), reasonClause: spanOf(doc, reason), relation: { context, link: linkSpan },
      reasonFacet: facetOf(doc, reason), reasonPolarity: link.negated ? 'NEGATED' : 'AFFIRMED',
      speakerBasis, resultState: UNKNOWN_FIELD() });
  };
  for (const link of sentence.linkers) {
    if (link.kind !== 'REASON') continue;
    const reasonIndex = clauseAfter(sentence, link.e);
    if (reasonIndex === -1) continue;
    const reasonEnd = sentence.clauses[reasonIndex]!.e;
    const result = sentence.linkers.find(other => (other.kind === 'RESULT' || other.kind === 'AMBIGUOUS_RESULT') && other.s === reasonEnd &&
      !sentence.linkers.some(middle => middle.kind === 'REASON' && middle.s > link.s && middle.s < other.s));
    if (result) {
      consumed.add(result);
      const choiceIndex = clauseAfter(sentence, result.e);
      if (choiceIndex !== -1) evaluate(choiceIndex, reasonIndex, link, result);
      continue;
    }
    const choiceIndex = clauseBefore(sentence, link.s);
    if (choiceIndex === -1) pend('I07', 'REASON_WITHOUT_LOCATED_CHOICE', spanOf(doc, { s: link.s, e: reasonEnd }), spanOf(doc, link));
    else evaluate(choiceIndex, reasonIndex, link, null);
  }
  for (const link of sentence.linkers) {
    if ((link.kind !== 'RESULT' && link.kind !== 'AMBIGUOUS_RESULT') || consumed.has(link)) continue;
    const reasonIndex = clauseBefore(sentence, link.s); const choiceIndex = clauseAfter(sentence, link.e);
    if (reasonIndex === -1 || choiceIndex === -1) continue;
    evaluate(choiceIndex, reasonIndex, link, null);
  }
}

// ---------------------------------------------------------------- integrity

function checkSpan(text: string, span: Span): void {
  if (span.start < 0 || span.start >= span.end || span.end > text.length || text.slice(span.start, span.end) !== span.quote) fail('INTERNAL_SPAN_MISMATCH');
  for (const offset of [span.start, span.end]) {
    if (offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!)) fail('INTERNAL_SPAN_SPLITS_SURROGATE');
  }
}
function spansIn(value: unknown, out: Span[] = []): Span[] {
  if (Array.isArray(value)) value.forEach(item => spansIn(item, out));
  else if (value && typeof value === 'object') {
    if ('start' in value && 'end' in value && 'quote' in value) out.push(value as Span);
    else Object.values(value).forEach(item => spansIn(item, out));
  }
  return out;
}

/** Mirrors the located method's one-code-per-clause rule: conflicting rule readings for the same clause become pending, never a silent pick. */
function resolveClauseConflicts<T extends { recordIndex: number }>(rows: T[], family: LiteralFamily, clause: (row: T) => Span,
  code: (row: T) => string, pending: LiteralReviewPending[]): T[] {
  const codes = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = canonicalJson([row.recordIndex, clause(row).start, clause(row).end]);
    codes.set(key, (codes.get(key) ?? new Set()).add(code(row)));
  }
  const kept: T[] = []; const seen = new Set<string>(); const reported = new Set<string>();
  for (const row of rows) {
    const key = canonicalJson([row.recordIndex, clause(row).start, clause(row).end]);
    if (codes.get(key)!.size > 1) {
      if (!reported.has(key)) { reported.add(key); pending.push({ family, recordIndex: row.recordIndex, reason: 'CONFLICTING_RULE_READINGS', span: clause(row), trigger: null }); }
      continue;
    }
    const fingerprint = canonicalJson(row);
    if (!seen.has(fingerprint)) { seen.add(fingerprint); kept.push(row); }
  }
  return kept;
}

// ---------------------------------------------------------------- entry point

const UNSUPPORTED: LiteralReviewCoding['unsupported'] = [
  { family: 'I02', pattern: 'ROLE_TASK_SETTING', handling: 'NOT_EVALUATED_EMITTED_AS_UNKNOWN' },
  { family: 'I02', pattern: 'FIELD_ABSENT_FROM_CLOSED_VOCABULARY', handling: 'UNKNOWN_NOT_NOT_STATED' },
  { family: 'I04', pattern: 'SOURCE_LOGGED_ATTRIBUTION', handling: 'NEVER_EMITTED_REVIEW_TEXT_IS_NOT_A_SYSTEM_LOG' },
  { family: 'I04', pattern: 'THIRD_PARTY_ACTOR_REPORTED_BY_REVIEWER', handling: 'PENDING_THIRD_PARTY_ACTOR' },
  { family: 'I04', pattern: 'TASK_AND_INABILITY_IN_ONE_CLAUSE', handling: 'PENDING_INABILITY_WITHOUT_LOCATED_TASK' },
  { family: 'I04', pattern: 'CROSS_RECORD_OR_SEQUENCE_ORDER', handling: 'NOT_CODED_I06_OUT_OF_SCOPE' },
  { family: 'I05', pattern: 'RATING_OR_SILENCE_AS_POLARITY', handling: 'NEVER_USED' },
  { family: 'I05', pattern: 'TARGET_OR_HOLDER_ABSENT_FROM_CLOSED_VOCABULARY', handling: 'UNKNOWN_NOT_NOT_STATED' },
  { family: 'I07', pattern: 'FIT_NEED_AND_OTHER_EXPLICIT_FACETS', handling: 'NEVER_EMITTED_UNCLEAR_INSTEAD' },
  { family: 'I07', pattern: 'RESULT_STATE', handling: 'UNKNOWN' },
  { family: 'I07', pattern: 'LINKERS_DO_NHO_AND_CROSS_SENTENCE_REASONS', handling: 'NOT_RECOGNIZED' },
  { family: 'I08', pattern: 'RESOLUTION_STATE', handling: 'UNKNOWN' },
  { family: 'I08', pattern: 'DISSATISFACTION_WITHOUT_TASK_OBSTACLE_PAIR', handling: 'NOT_CODED' },
  { family: 'ALL', pattern: 'NON_NFC_TEXT', handling: 'PENDING_NON_NFC_TEXT' },
  { family: 'ALL', pattern: 'UNACCENTED_OR_TEENCODE_TEXT', handling: 'PENDING_ONLY_WHEN_A_LISTED_INFORMAL_MARKER_IS_PRESENT_OTHERWISE_NO_RULE_MATCH' },
  { family: 'I06_I09_I10_I13', pattern: 'FAMILY', handling: 'OUT_OF_SCOPE' },
];
const LIMITATIONS = [
  'RULE_PROPOSAL_NOT_BUSINESS_REVIEWED_OR_ACCURACY_TESTED',
  'DECLARED_RULE_GENERATED_PROVENANCE_NOT_HUMAN_REVIEW',
  'CLOSED_LITERAL_VOCABULARY_UNMATCHED_TEXT_IS_PENDING_NOT_ZERO_OR_NOT_REPORTED',
  'NO_MOTIVE_HEALTH_OUTCOME_DEMOGRAPHIC_RATING_SENTIMENT_EXPOSURE_PREVALENCE_OR_JOURNEY_INFERENCE',
  'RELATIONS_REQUIRE_EXPLICIT_SAME_SENTENCE_LINKER',
  'NO_SOURCE_DATE_OR_CAPTURE_TIME_PROJECTED',
  'REVIEW_RECORDS_NOT_UNIQUE_PEOPLE',
];

/** Declared record admission is validated here; source/package byte verification belongs to the caller. */
export function codeLiteralLocatedRecords(untrustedInput: unknown, rulesBytes: Buffer): LiteralLocatedRecordCoding {
  const rules = compileRules(rulesBytes);
  const input = validateLocatedInsightInput(untrustedInput);
  if ([input.i02, input.i04, input.i05, input.i06, input.i07, input.i08, input.i09, input.corpora, input.i13Mentions]
    .some(rows => rows.length !== 0)) fail('LITERAL_DIAGNOSTICS_REQUIRE_UNANNOTATED_INPUT');
  return codeLocatedRecords(input.records, rules);
}

function codeLocatedRecords(sourceRecords: LocatedRecord[], rules: CompiledRules): LiteralLocatedRecordCoding {
  const coderRole = `RULE_GENERATED_DECLARATION ${rules.rulesetId} ${rules.revision} sha256:${rules.sha256} parser:${LITERAL_REVIEW_PARSER_REVISION}`;
  const provenance = (): Provenance => ({ basis: 'DECLARED', coderRole, adjudication: null, disagreement: null });
  const records = sourceRecords.map(record => ({ ...record }));
  const units: LiteralLocatedRecordUnit[] = [];
  const sink: Sink = { i02: [], i04: [], i05: [], i07: [], i08: [], pending: [] };
  for (const [recordIndex, record] of records.entries()) {
    if (recordIndex >= LOCATED_ARRAY_LIMIT) fail('UNIT_INDEX_LIMIT_EXCEEDED');
    const eligibility: LiteralLocatedRecordUnit['eligibility'] = record.text === null ? 'UNREADABLE_TEXT'
      : record.disposition !== 'INCLUDED' ? 'EXCLUDED' : !/\S/u.test(record.text) ? 'EMPTY_TEXT' : 'ELIGIBLE';
    const textFlags: 'NON_NFC_TEXT'[] = eligibility === 'ELIGIBLE' && record.text !== record.text!.normalize('NFC') ? ['NON_NFC_TEXT'] : [];
    units.push({ recordIndex, eligibility, textFlags, families: null });
    if (eligibility !== 'ELIGIBLE') continue;
    if (textFlags.length) { for (const family of FAMILIES) sink.pending.push({ family, recordIndex, reason: 'NON_NFC_TEXT', span: null, trigger: null }); continue; }
    codeRecord(buildDoc(record.text!, rules.lex), recordIndex, provenance, sink);
  }
  const candidates = {
    i02: sink.i02,
    i04: resolveClauseConflicts(sink.i04, 'I04', row => row.span, row => `${row.eventKind}:${row.attribution}`, sink.pending),
    i05: resolveClauseConflicts(sink.i05, 'I05', row => row.span, row => canonicalJson([row.polarity, row.target, row.speakerAttribution]), sink.pending),
    i07: resolveClauseConflicts(sink.i07, 'I07', row => row.reasonClause, row => canonicalJson([row.reasonFacet, row.reasonPolarity, row.speakerBasis]), sink.pending),
    i08: resolveClauseConflicts(sink.i08, 'I08', row => row.obstacleClause, row => row.barrierFacet, sink.pending),
  };
  const byFamily: Record<LiteralFamily, { recordIndex: number }[]> = {
    I02: candidates.i02, I04: candidates.i04, I05: candidates.i05, I07: candidates.i07, I08: candidates.i08,
  };
  const coded = new Set(FAMILIES.flatMap(family => byFamily[family].map(row => `${family}:${row.recordIndex}`)));
  const open = new Set(sink.pending.map(row => `${row.family}:${row.recordIndex}`));
  // An eligible unit with neither a candidate nor a pending item for a family is pending, never zero or NOT_REPORTED.
  for (const unit of units) {
    if (unit.eligibility !== 'ELIGIBLE') continue;
    for (const family of FAMILIES) {
      const key = `${family}:${unit.recordIndex}`;
      if (!coded.has(key) && !open.has(key)) {
        sink.pending.push({ family, recordIndex: unit.recordIndex, reason: 'NO_RULE_MATCH', span: null, trigger: null });
        open.add(key);
      }
    }
  }
  const pendingSeen = new Set<string>();
  const pending = sink.pending.filter(row => {
    const fingerprint = canonicalJson(row);
    if (pendingSeen.has(fingerprint)) return false;
    pendingSeen.add(fingerprint); return true;
  }).sort((a, b) => a.recordIndex - b.recordIndex || FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) ||
    (a.span?.start ?? -1) - (b.span?.start ?? -1) || (a.span?.end ?? -1) - (b.span?.end ?? -1) || compare(a.reason, b.reason) ||
    (a.trigger?.start ?? -1) - (b.trigger?.start ?? -1));
  const families = {} as Record<LiteralFamily, LiteralFamilyCoverage>;
  for (const family of FAMILIES) families[family] = { candidateUnits: 0, candidateWithPendingUnits: 0, pendingUnits: 0, candidates: byFamily[family].length, pendingItems: 0 };
  for (const row of pending) families[row.family].pendingItems++;
  for (const unit of units) {
    if (unit.eligibility !== 'ELIGIBLE') continue;
    const states = {} as Record<LiteralFamily, LiteralFamilyState>;
    for (const family of FAMILIES) {
      const isCoded = coded.has(`${family}:${unit.recordIndex}`);
      const isOpen = open.has(`${family}:${unit.recordIndex}`);
      states[family] = isCoded && !isOpen ? 'CANDIDATE' : isCoded ? 'CANDIDATE_WITH_PENDING' : 'PENDING';
      families[family][states[family] === 'CANDIDATE' ? 'candidateUnits' : states[family] === 'CANDIDATE_WITH_PENDING' ? 'candidateWithPendingUnits' : 'pendingUnits']++;
    }
    unit.families = states;
  }
  for (const [key, rows] of Object.entries(candidates)) {
    for (const row of rows) {
      const text = records[row.recordIndex]!.text;
      if (text === null || records[row.recordIndex]!.disposition !== 'INCLUDED') fail(`INTERNAL_${key.toUpperCase()}_RECORD_NOT_INCLUDED`);
      for (const span of spansIn(row)) checkSpan(text, span);
      if ('relation' in row && row.relation) {
        const evidence = 'choiceText' in row ? [row.choiceText, row.reasonClause] : 'attemptedTask' in row ? [row.attemptedTask, row.obstacleClause] : [];
        for (const span of [...evidence, row.relation.link]) {
          if (span.start < row.relation.context.start || span.end > row.relation.context.end) fail('INTERNAL_RELATION_CONTEXT');
        }
      }
    }
  }
  for (const row of pending) for (const span of [row.span, row.trigger]) if (span) checkSpan(records[row.recordIndex]!.text!, span);
  const count = (eligibility: LiteralLocatedRecordUnit['eligibility']): number => units.filter(unit => unit.eligibility === eligibility).length;
  const blockers = ['LITERAL_RULES_PROPOSAL_NOT_ADOPTED',
    ...(count('ELIGIBLE') === 0 ? ['NO_ELIGIBLE_UNITS'] : []), ...(pending.length ? ['CODING_PENDING'] : []),
    ...(units.some(unit => unit.textFlags.length) ? ['NON_NFC_TEXT_UNITS_PENDING'] : []),
    ...(Object.values(candidates).some(rows => rows.length > LOCATED_ARRAY_LIMIT) ? ['CANDIDATES_EXCEED_LOCATED_INPUT_LIMIT'] : [])];
  return {
    parserRevision: LITERAL_REVIEW_PARSER_REVISION,
    rules: { rulesetId: rules.rulesetId, revision: rules.revision, sha256: rules.sha256, byteLength: rules.byteLength, codebookId: CODEBOOK_ID,
      profileSha256: PROFILE_SHA256, adoptionSha256: ADOPTION_SHA256, declaredStatus: 'PROPOSAL_PENDING_BUSINESS_REVIEW' },
    executionAuthority: 'NONE_RULE_PROPOSAL_ONLY',
    records, units, candidates, pending, unsupported: UNSUPPORTED.map(row => ({ ...row })),
    coverage: { records: records.length, eligibleUnits: count('ELIGIBLE'), excludedUnits: count('EXCLUDED'),
      emptyTextUnits: count('EMPTY_TEXT'), unreadableUnits: count('UNREADABLE_TEXT'),
      nonNfcEligibleUnits: units.filter(unit => unit.textFlags.length).length, families },
    blockers, limitations: [...LIMITATIONS],
  };
}

/** Preserves the existing exact-collection projection and diagnostic identity. */
export function codeLiteralReviews(corpus: { output: ResearchReviewCorpus; bytes: Buffer }, rulesBytes: Buffer): { output: LiteralReviewCoding; bytes: Buffer } {
  const rules = compileRules(rulesBytes);
  if (!validateCorpus(corpus.output)) fail(`INVALID_RESEARCH_REVIEW_CORPUS:${ajv.errorsText(validateCorpus.errors)}`);
  const source = corpus.output;
  if (!Buffer.isBuffer(corpus.bytes) || !corpus.bytes.equals(Buffer.from(`${canonicalJson(source)}\n`))) fail('CORPUS_BYTES_MISMATCH');
  const { corpusId, ...corpusBody } = source;
  if (sha256(canonicalJson(corpusBody)) !== corpusId) fail('CORPUS_ID_MISMATCH');
  const corpusBytesSha256 = sha256(corpus.bytes);
  const records: LocatedRecord[] = []; const units: LiteralReviewUnit[] = [];
  let sourceRefs = 0;
  for (const [groupIndex, group] of source.records.entries()) {
    for (const [versionIndex, version] of group.versions.entries()) {
      const recordIndex = units.length;
      if (recordIndex >= LOCATED_ARRAY_LIMIT) fail('UNIT_INDEX_LIMIT_EXCEEDED');
      if ((version.textState === 'UNREADABLE') !== (version.text === null) ||
          (version.textState === 'READABLE') !== (version.text !== null && /\S/u.test(version.text))) fail('CORPUS_TEXT_STATE_MISMATCH');
      sourceRefs += version.sourceRefs.length;
      const quarantined = group.listingAdmission !== 'SELECTED_LISTING' || group.disposition === 'QUARANTINED';
      const exclusionReasons = [
        ...(group.listingAdmission !== 'SELECTED_LISTING' ? [group.listingAdmission] : group.disposition === 'QUARANTINED' ? ['QUARANTINED'] : []),
        ...(group.disposition === 'UNRESOLVED_CONFLICT' ? ['UNRESOLVED_CONFLICT'] : []),
        ...(version.textState === 'EMPTY' ? ['EMPTY_TEXT'] : version.textState === 'UNREADABLE' ? ['UNREADABLE_TEXT'] : []),
      ];
      const eligibility: LiteralUnitEligibility = quarantined ? 'QUARANTINED' : group.disposition === 'UNRESOLVED_CONFLICT' ? 'CONFLICTING'
        : version.textState === 'EMPTY' ? 'EMPTY_TEXT' : version.textState === 'UNREADABLE' ? 'UNREADABLE_TEXT' : 'ELIGIBLE';
      records.push({
        sourceSha256: corpusBytesSha256, locator: `/records/${groupIndex}/versions/${versionIndex}/text`, text: version.text,
        sourceAttribution: `Shopee review row in ${source.contractVersion}; listing ${group.identity.listingKey ?? 'UNRESOLVED'}; reviewer identity not projected`,
        timeText: null, disposition: version.text === null ? 'UNREADABLE' : eligibility === 'ELIGIBLE' ? 'INCLUDED' : 'EXCLUDED',
        dispositionReason: exclusionReasons.length ? exclusionReasons.join(',') : null,
      });
      units.push({ recordIndex, groupIndex, versionIndex, identity: { ...group.identity }, listingAdmission: group.listingAdmission,
        groupDisposition: group.disposition, occurrenceCount: group.occurrenceCount, rawRowSha256: version.rawRowSha256,
        sourceRefs: version.sourceRefs.map(ref => ({ ...ref })), corpusReasons: [...version.reasons], eligibility, exclusionReasons,
        textFlags: [], families: null });
    }
  }
  if (sourceRefs !== source.coverage.rawRows) fail('SOURCE_REF_CONSERVATION_MISMATCH');
  const coded = codeLocatedRecords(records, rules);
  for (const unit of units) {
    unit.textFlags = coded.units[unit.recordIndex]!.textFlags;
    unit.families = coded.units[unit.recordIndex]!.families;
  }
  const count = (eligibility: LiteralUnitEligibility): number => units.filter(unit => unit.eligibility === eligibility).length;
  const body: Omit<LiteralReviewCoding, 'codingId'> = {
    contractVersion: 'literal-review-coding-v1', parserRevision: coded.parserRevision, rules: coded.rules,
    executionAuthority: coded.executionAuthority,
    corpus: { contractVersion: source.contractVersion, mappingRevision: source.mappingRevision, corpusId, corpusBytesSha256,
      collectionId: source.collectionId, collectionSha256: source.collectionSha256, requestSha256: source.requestSha256 },
    locatedSource: { sha256: corpusBytesSha256, locatorTemplate: '/records/{groupIndex}/versions/{versionIndex}/text' },
    records: coded.records, units, candidates: coded.candidates, pending: coded.pending, unsupported: coded.unsupported,
    coverage: { rawRows: source.coverage.rawRows, sourceRefs, recordGroups: source.records.length, units: units.length,
      eligibleUnits: count('ELIGIBLE'), quarantinedUnits: count('QUARANTINED'), conflictingUnits: count('CONFLICTING'),
      emptyTextUnits: count('EMPTY_TEXT'), unreadableUnits: count('UNREADABLE_TEXT'),
      nonNfcEligibleUnits: coded.coverage.nonNfcEligibleUnits, families: coded.coverage.families },
    blockers: coded.blockers, limitations: coded.limitations,
  };
  const output: LiteralReviewCoding = { ...body, codingId: sha256(canonicalJson(body)) };
  return { output, bytes: Buffer.from(`${canonicalJson(output)}\n`) };
}

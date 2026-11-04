import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import type { TypesafeJevClient, TypesafeJevQuestion } from '../../platform/ai/typesafe-jev-client.js';
import { acquireLabelsLock } from './labels-lock.js';
import { parseCodebook, sha256, storeCodebook } from './review-code-loader.js';

/**
 * The app labels db-v1 product reviews (Shopee S05, TikTok Shop S06) with Jev and writes `review_code` rows with origin APP_JEV (owner F366/F367).
 * Started as a port of the Insight MCP coder (load_codebook checks, select_block, code_reviews caps). Since codebook 2026-11-04.1
 * (owner F439 to F442, R-RV01 to R-RV05) the Jev request and the scoring are the app's own: a shared guide, options per theme,
 * a `choice` per row and the wait row of the waitTheme.
 */

export const DEFAULT_CODEBOOK_FILE = fileURLToPath(new URL('../../../tools/mcp-insight/data/insight-theme-codebook.json', import.meta.url));
export const NO_THEME = 'NO_THEME';
/** The MCP's fixed journey step for review labels (STEP_AFTER_PURCHASE). */
export const STEP_AFTER_PURCHASE = 'Sau mua';
/** Options that never count as a mention (R-RV04); every other option is counted and carries a polarity. */
export const NOT_COUNTED = ['KHONG_NHAC', 'CHUA_DANHGIA'] as const;
const POLARITIES = ['khen', 'che', 'ke', 'khong_ro_huong'] as const;
// Owner rule F310, fixed here like the MCP: a codebook holding one of these themes is rejected.
const EXCLUDED_THEME_CODES = new Set(['T-GIAOHANG', 'T-DONGGOI', 'T-DICHVU']);
const EXCLUDED_THEME_NAMES = ['Giao hàng', 'Đóng gói', 'Dịch vụ shop, tư vấn'];
const THEME_CODE_RE = /^T-[A-Z0-9]+$/;
const BLOCK_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const SCOPE_VERSIONS = new Set(['autorun-scope-record-v1', 'autorun-scope-record-v2']);

export type LabelPolarity = (typeof POLARITIES)[number];
export interface LabelOption { key: string; meaning: string; polarity?: LabelPolarity }
export interface LabelTheme { code: string; name: string; include: string; exclude?: string; options?: LabelOption[] }
export interface LabelBlock { label: string; themes: LabelTheme[]; match: { categoryLabels?: string[] | null; keywords?: string[] | null } }
export interface LabelCodebook {
  version: string; status: string; guide: string; waitTheme: string; core: LabelTheme[]; blocks: Record<string, LabelBlock>;
  options: LabelOption[];
  thresholds: { keep: number; unclear: number; direction: number; probabilitySumTolerance: number };
  limits: { maxQuestionsPerCall: number; maxCallsPerRun: number };
}
export interface BlockSelection {
  codebookVersion: string; blockKey: string | null; matchBasis: 'CATEGORY_LABEL' | 'KEYWORD' | 'NO_MATCH'; matchedTerm: string | null;
  questions: LabelTheme[];
}
/** One labelling request (R-RV02): the review text and customer-filled items, platform, product name, the guide and the questions. */
export interface LabelRequest {
  text: string; attributes: string[]; platform: string; product_name: string | null; guide: string;
  questions: { code: string; name: string; include: string; exclude: string; options: LabelOption[] }[];
}
/** Probabilities by option key of one question. */
export type OptionProbabilities = Record<string, number>;
export interface LabelRow { theme_code: string; p_yes: number; polarity: LabelPolarity; status: 'kept' | 'unclear'; choice: string | null }

export class JevLabelCallFailed extends Error {
  constructor(readonly code: 'JEV_THEME_UNAVAILABLE' | 'JEV_THEME_INVALID') { super(code); }
}

const fail = (why: string): never => { throw new Error(`RAW_DB_CODES_CODEBOOK_INVALID: ${why}`); };
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nz = (text: string) => text.normalize('NFC').toLowerCase();
const fold = (text: string) => text.normalize('NFC').toLowerCase().trim();
const blankString = (value: unknown) => typeof value !== 'string' || !value.trim();
const counted = (key: string) => !(NOT_COUNTED as readonly string[]).includes(key);

function optionsOk(options: unknown): options is LabelOption[] {
  if (!Array.isArray(options) || !options.length || !options.every(o => isRecord(o) && typeof o.key === 'string' && typeof o.meaning === 'string')) return false;
  const keys = options.map(o => o.key as string);
  return new Set(keys).size === keys.length && keys.includes('KHONG_NHAC')
    && options.every(o => !counted(o.key as string) || (POLARITIES as readonly unknown[]).includes(o.polarity));
}
const themeOptions = (book: LabelCodebook, theme: LabelTheme) => theme.options ?? book.options;

function themeOk(theme: unknown): theme is LabelTheme {
  return isRecord(theme) && typeof theme.code === 'string' && THEME_CODE_RE.test(theme.code)
    && !blankString(theme.name) && !blankString(theme.include) && (theme.exclude === undefined || typeof theme.exclude === 'string')
    && (theme.options === undefined || Array.isArray(theme.options));
}

/** The MCP load_codebook checks on the parsed JSON (CODES checks run first through parseCodebook). */
export function parseLabelCodebook(text: string): LabelCodebook {
  parseCodebook(text);
  const book = JSON.parse(text) as Record<string, unknown>;
  if (blankString(book.version) || blankString(book.status)) fail('version or status missing');
  if (blankString(book.guide)) fail('the guide is missing');
  const { core, blocks, options, thresholds, limits } = book;
  if (!Array.isArray(core) || !core.length || !core.every(themeOk)) fail('the core themes are missing or malformed');
  if (!isRecord(blocks) || !Object.entries(blocks).every(([key, block]) => BLOCK_KEY_RE.test(key) && isRecord(block)
    && typeof block.label === 'string' && Array.isArray(block.themes) && block.themes.every(themeOk) && isRecord(block.match))) {
    fail('the blocks are missing or malformed');
  }
  const typedCore = core as LabelTheme[], typedBlocks = blocks as Record<string, LabelBlock>;
  const banned = new Set(EXCLUDED_THEME_NAMES.map(fold));
  for (const theme of [...typedCore, ...Object.values(typedBlocks).flatMap(block => block.themes)]) {
    if (EXCLUDED_THEME_CODES.has(theme.code) || banned.has(fold(theme.name))) fail('a logistics theme dropped by the owner (F310) is listed');
  }
  for (const block of Object.values(typedBlocks)) {
    const codes = [...typedCore, ...block.themes].map(theme => theme.code);
    if (new Set(codes).size !== codes.length) fail('a theme code repeats within one block selection');
  }
  if (!optionsOk(options)) fail('the answer options are missing, lack KHONG_NHAC or a counted option has no valid polarity');
  for (const theme of [...typedCore, ...Object.values(typedBlocks).flatMap(block => block.themes)]) {
    if (theme.options !== undefined && !optionsOk(theme.options)) fail(`the options of ${theme.code} are malformed, lack KHONG_NHAC or a counted option has no valid polarity`);
  }
  const wait = typedCore.find(theme => theme.code === book.waitTheme);
  if (!wait) fail('waitTheme is not a core theme');
  if (!(wait!.options ?? options as LabelOption[]).some(o => o.key === 'CHUA_DANHGIA')) fail('the options of the waitTheme lack CHUA_DANHGIA');
  if (!isRecord(thresholds) || !['keep', 'unclear', 'direction', 'probabilitySumTolerance'].every(k => isNumber(thresholds[k]))) fail('thresholds missing');
  if (!isRecord(limits) || !['maxQuestionsPerCall', 'maxCallsPerRun'].every(k => Number.isInteger(limits[k]) && (limits[k] as number) > 0)) fail('limits missing');
  return book as unknown as LabelCodebook;
}

/** The MCP `_term_matches`: the term as a whole word (letters/digits around it end the match) of the keyword. */
function termMatches(term: string, keyword: string): boolean {
  const escaped = nz(term).trim().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(nz(keyword).trim());
}

/** The MCP select_block without an override: category label first, else the longest matching keyword (earlier block on a tie). */
export function selectBlock(book: LabelCodebook, keywords: readonly string[], category: string | null): BlockSelection {
  let key: string | null = null, basis: BlockSelection['matchBasis'] = 'NO_MATCH', term: string | null = null;
  const entries = Object.entries(book.blocks);
  if (category !== null) {
    const found = entries.find(([, block]) => (block.match.categoryLabels ?? []).includes(category));
    if (found) { key = found[0]; basis = 'CATEGORY_LABEL'; }
  }
  if (key === null) {
    let bestLength = -1;
    for (const [name, block] of entries) {
      for (const candidate of block.match.keywords ?? []) {
        const length = [...nz(candidate).trim()].length;
        // Strictly longer wins, so on a tie the earlier block and earlier keyword stay (the MCP rank (length, -index)).
        if (length > bestLength && keywords.some(k => termMatches(candidate, k))) { bestLength = length; key = name; basis = 'KEYWORD'; term = candidate; }
      }
    }
  }
  const questions = [...book.core, ...(key ? book.blocks[key]!.themes : [])];
  if (questions.length > book.limits.maxQuestionsPerCall) fail('the selected block needs more questions than one call allows');
  return { codebookVersion: book.version, blockKey: key, matchBasis: basis, matchedTerm: term, questions };
}

export function buildRequest(book: LabelCodebook, selection: BlockSelection,
  review: { text: string | null; attributes_json: string | null; platform: string; product_name: string | null }): LabelRequest {
  return { text: review.text ?? '', attributes: attributeItems(review.attributes_json), platform: review.platform, product_name: review.product_name, guide: book.guide,
    questions: selection.questions.map(t => ({ code: t.code, name: t.name, include: t.include, exclude: t.exclude || '', options: themeOptions(book, t).map(o => ({ ...o })) })) };
}

/** R-RV02: one choice question per theme; every question has the same state (no platform, star, group or codebook version). */
export function jevQuestions(request: LabelRequest): TypesafeJevQuestion[] {
  const state = `Sản phẩm đang được đánh giá: ${request.product_name || 'không rõ'}\nLời viết: ${request.text.trim() || '(trống)'}\n`
    + `Các mục khách điền, gồm tên mục và câu trả lời: ${request.attributes.join('; ') || '(trống)'}`;
  return request.questions.map(question => ({ id: question.code, state,
    instructions: `${request.guide}\n\n${question.code} ${question.name}. Tính khi: ${question.include}.${question.exclude ? ` Không tính khi: ${question.exclude}.` : ''}`
      + '\nNội dung có nhắc đến chủ đề này không, và thuộc lựa chọn nào?',
    criteria: Object.fromEntries(question.options.map(o => [o.key, o.meaning])) }));
}

/** R-RV03, the MCP parse_answer with the options of each question: throws JevLabelCallFailed (JEV_THEME_UNAVAILABLE / JEV_THEME_INVALID); returns probabilities by theme in asked order. */
export function parseAnswer(book: LabelCodebook, request: LabelRequest, model: string, status: number | null, raw: Buffer | null): Map<string, OptionProbabilities> {
  if (status !== 200 || raw === null) throw new JevLabelCallFailed('JEV_THEME_UNAVAILABLE');
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new JevLabelCallFailed('JEV_THEME_UNAVAILABLE'); }
  if (!isRecord(payload)) throw new JevLabelCallFailed('JEV_THEME_UNAVAILABLE');
  const invalid = () => new JevLabelCallFailed('JEV_THEME_INVALID');
  if (payload.model !== model || !isRecord(payload.answers)) throw invalid();
  const answers = payload.answers;
  const asked = request.questions.map(q => q.code);
  const sameSet = (keys: string[], expected: readonly string[]) => { const a = new Set(keys), b = new Set(expected); return a.size === b.size && [...a].every(k => b.has(k)); };
  if (!sameSet(Object.keys(answers), asked)) throw invalid();
  const out = new Map<string, OptionProbabilities>();
  for (const { code, options } of request.questions) {
    const answer = answers[code], keys = options.map(o => o.key);
    if (!isRecord(answer) || answer.type !== 'choice' || !keys.includes(answer.choice as string)) throw invalid();
    const probs = answer.probabilities;
    if (!isRecord(probs) || !sameSet(Object.keys(probs), keys) || !Object.values(probs).every(v => isNumber(v) && v >= 0 && v <= 1)) throw invalid();
    if (Math.abs((Object.values(probs) as number[]).reduce((sum, v) => sum + v, 0) - 1) > book.thresholds.probabilitySumTolerance + 1e-9) throw invalid();
    if (!isNumber(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) throw invalid();
    out.set(code, probs as OptionProbabilities);
  }
  return out;
}

// toFixed rounds exact ties upwards; Python round uses ties to even. At 9 decimal places a binary-exact
// midpoint must be an odd multiple of 1/1024 (10^9 = 2^9 * 5^9). Other values use toFixed's exact rounding.
const round9 = (sum: number) => Number.isInteger(sum * 1024) && (sum * 1024) % 2 === 1 ? 2 * Math.round(sum * 1e9 / 2) / 1e9 : Number(sum.toFixed(9));

/**
 * R-RV04, R-RV05: p_yes = the counted options, rounded to 9 decimals like Python round(). The largest counted option (earliest on a
 * tie) sets polarity and choice from the direction threshold. Below unclear only the wait row of the waitTheme is kept.
 */
export function labelRows(book: LabelCodebook, answers: ReadonlyMap<string, OptionProbabilities>): LabelRow[] {
  const { keep, unclear, direction } = book.thresholds;
  const themes = new Map([...book.core, ...Object.values(book.blocks).flatMap(block => block.themes)].map(theme => [theme.code, theme]));
  const rows: LabelRow[] = [];
  for (const [code, probs] of answers) {
    const options = themeOptions(book, themes.get(code)!).filter(o => counted(o.key));
    const pYes = round9(options.reduce((sum, o) => sum + probs[o.key]!, 0));
    if (pYes < unclear) {
      const wait = probs.CHUA_DANHGIA;
      if (code === book.waitTheme && wait !== undefined && wait >= direction) {
        rows.push({ theme_code: code, p_yes: round9(wait), polarity: 'khong_ro_huong', status: 'unclear', choice: 'CHUA_DANHGIA' });
      }
      continue;
    }
    const top = options.reduce((best, o) => probs[o.key]! > probs[best.key]! ? o : best);
    const directed = probs[top.key]! >= direction;
    rows.push({ theme_code: code, p_yes: pYes, polarity: directed ? top.polarity! : 'khong_ro_huong', status: pYes >= keep ? 'kept' : 'unclear', choice: directed ? top.key : null });
  }
  return rows;
}

/** The coding text: db-v1 `text` + each `attributes_json` item as two spaces + item (the CODES and MCP rule). */
export function codingText(text: string | null, attributesJson: string | null): string {
  return (text ?? '') + attributeItems(attributesJson).map(item => `  ${item}`).join('');
}

function attributeItems(attributesJson: string | null): string[] {
  const attributes = attributesJson === null ? [] : JSON.parse(attributesJson) as unknown;
  if (!Array.isArray(attributes) || attributes.some(item => typeof item !== 'string')) throw new Error('RAW_DB_LABELS_INVALID_REVIEW: attributes_json is not a list of strings');
  return attributes as string[];
}

/**
 * The applied scope of a run by the MCP `_scope` rule (the app's usedScope): `<captureRoot>/<runId>/scope.json` when present,
 * else the run keyword. Reads stored run data only.
 */
export async function runScope(db: Database.Database, captureRoot: string, runId: string): Promise<{ keywords: string[]; category: string | null }> {
  const run = db.prepare('SELECT keyword FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { keyword: string } | undefined;
  if (!run) throw new Error(`RAW_DB_RUN_NOT_FOUND: no research run ${runId}`);
  let bytes: string;
  try { bytes = await fs.readFile(path.join(captureRoot, runId, 'scope.json'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { keywords: [run.keyword], category: null };
    throw new Error(`RAW_DB_LABELS_SCOPE_INVALID: the scope record of run ${runId} cannot be read`);
  }
  const invalid = (why: string) => new Error(`RAW_DB_LABELS_SCOPE_INVALID: run ${runId} ${why}`);
  let record: unknown;
  try { record = JSON.parse(bytes); } catch { throw invalid('scope record is not JSON'); }
  if (!isRecord(record) || !SCOPE_VERSIONS.has(record.contractVersion as string) || record.runId !== runId || typeof record.keyword1 !== 'string') {
    throw invalid('scope record does not match the run');
  }
  if (record.category !== undefined && record.category !== null && !isRecord(record.category)) throw invalid('scope record has a malformed category');
  const capture2 = record.capture2;
  if (capture2 !== undefined && capture2 !== null) {
    if (!isRecord(capture2) || !Array.isArray(capture2.keywords) || !capture2.keywords.every(k => typeof k === 'string')
      || !(capture2.category === undefined || capture2.category === null || typeof capture2.category === 'string')
      || !['AWAITING_KEYWORD2', 'PENDING', 'OK', 'CATEGORY_NOT_SELECTABLE'].includes(capture2.outcome as string)) {
      throw invalid('scope record has a malformed second capture');
    }
    if (capture2.outcome === 'OK') return { keywords: [...capture2.keywords as string[]], category: (capture2.category as string | null | undefined) ?? null };
  }
  return { keywords: [record.keyword1], category: null };
}

export interface LabelInput {
  /** One run's reviews, or every run's when absent. */
  runId?: string | undefined;
  /** Lowers the codebook's limits.maxCallsPerRun for this pass. */
  maxCalls?: number | undefined;
  /** Plan only: counts, no Jev call, no write. */
  dryRun?: boolean | undefined;
  codebookFile?: string | undefined;
  /** Root of the stored `<runId>/scope.json` records. */
  captureRoot: string;
}
export interface LabelResult {
  codebookVersion: string; eligible: number; planned: number; called: number; labelled: number; noTheme: number; rowsInserted: number;
  failed: null | { code: string; reviewKey: string };
  /** Eligible reviews not called in this pass (cap or a failed call); a later pass picks them up. */
  skipped: number;
  blocks: { runId: string; blockKey: string | null; matchBasis: string; matchedTerm: string | null; eligible: number }[];
}

interface Candidate { review_key: string; platform: string; text: string | null; attributes_json: string | null; product_name: string | null; run_id: string }

/**
 * One labelling pass. A review is eligible when it is a Shopee or TikTok Shop product review, its coding text is not blank and it has no
 * review_code row for the codebook version (any origin). One review = one Jev call; its rows are written in one transaction
 * after the answer is checked. A failed call writes nothing for that review and stops the pass. The raw Jev response
 * body is stored in the artifact store; its sha256 is the rows' import_sha256.
 * A real pass holds the labelling lock (labels-lock.ts) from before eligible reviews are selected to the end; it throws
 * LabelsBusyError (LABELS_BUSY) when another pass holds it. A dry run takes no lock.
 */
export async function labelReviewsInDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore | null, client: TypesafeJevClient | null,
  input: LabelInput): Promise<LabelResult> {
  const definitionBytes = await fs.readFile(input.codebookFile ?? DEFAULT_CODEBOOK_FILE);
  const definitionJson = definitionBytes.toString('utf8');
  const book = parseLabelCodebook(definitionJson);
  const definitionSha256 = sha256(definitionBytes);
  if (input.maxCalls !== undefined && !(Number.isInteger(input.maxCalls) && input.maxCalls >= 1)) throw new Error('RAW_DB_LABELS_MAX_CALLS_INVALID: --max-calls must be a positive integer');
  if (!input.dryRun && (!client || !artifacts)) throw new Error('RAW_DB_LABELS_JEV_DISABLED: a labelling pass needs the Jev client and the artifact store');
  const release = input.dryRun ? () => {} : acquireLabelsLock(db);
  try { return await labelPass(db, artifacts, client, input, book, definitionJson, definitionSha256); }
  finally { release(); }
}

async function labelPass(db: Database.Database, artifacts: ContentAddressedArtifactStore | null, client: TypesafeJevClient | null, input: LabelInput,
  book: LabelCodebook, definitionJson: string, definitionSha256: string): Promise<LabelResult> {
  const stored = db.prepare('SELECT definition_sha256 FROM codebook WHERE codebook_version=?').get(book.version) as { definition_sha256: string } | undefined;
  if (stored && stored.definition_sha256 !== definitionSha256) throw new Error(`RAW_DB_CODES_CODEBOOK_CHANGED: codebook ${book.version} is stored with a different definition`);

  const candidates = db.prepare(`SELECT r.review_key, r.platform, r.text, r.attributes_json, p.product_name, rr.run_id
    FROM review r JOIN run_review rr ON rr.review_key = r.review_key LEFT JOIN product p ON p.product_key = r.product_key
    WHERE r.platform IN ('shopee','tiktok_shop') AND r.kind = 'product_review' AND (@run IS NULL OR rr.run_id = @run)
      AND NOT EXISTS (SELECT 1 FROM review_code c WHERE c.review_key = r.review_key AND c.codebook_version = @version)
    ORDER BY rr.run_id, r.review_key`).all({ run: input.runId ?? null, version: book.version }) as Candidate[];
  // A review linked to several runs is labelled once, with the block of its first run.
  const seen = new Set<string>();
  const eligible: (Candidate & { coded: string })[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.review_key)) continue;
    seen.add(candidate.review_key);
    const coded = codingText(candidate.text, candidate.attributes_json);
    if (coded.trim()) eligible.push({ ...candidate, coded });
  }
  const selections = new Map<string, BlockSelection>();
  for (const runId of new Set(eligible.map(review => review.run_id))) {
    const scope = await runScope(db, input.captureRoot, runId);
    selections.set(runId, selectBlock(book, scope.keywords, scope.category));
  }
  const cap = Math.min(book.limits.maxCallsPerRun, input.maxCalls ?? Infinity);
  const result: LabelResult = { codebookVersion: book.version, eligible: eligible.length, planned: Math.min(eligible.length, cap), called: 0, labelled: 0,
    noTheme: 0, rowsInserted: 0, failed: null, skipped: 0,
    blocks: [...selections].map(([runId, s]) => ({ runId, blockKey: s.blockKey, matchBasis: s.matchBasis, matchedTerm: s.matchedTerm,
      eligible: eligible.filter(review => review.run_id === runId).length })) };
  if (input.dryRun || !eligible.length) { result.skipped = eligible.length; return result; }

  db.transaction(() => storeCodebook(db, parseCodebook(definitionJson), definitionJson, definitionSha256))();
  const coded = db.prepare('SELECT 1 FROM review_code WHERE review_key=? AND codebook_version=? LIMIT 1');
  const insert = db.prepare(`INSERT INTO review_code(review_key,codebook_version,theme_code,block_key,polarity,journey_step,status,confidence,coder,text_sha256,coded_at,origin,import_sha256,choice)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'APP_JEV',?,?)`);
  for (const review of eligible) {
    if (result.called >= cap) break;
    // Never pay twice: another writer may have coded this review since the plan.
    if (coded.get(review.review_key, book.version)) continue;
    const selection = selections.get(review.run_id)!;
    const request = buildRequest(book, selection, review);
    const codedAt = new Date().toISOString();
    result.called++;
    const response = await client!.answerRaw(jevQuestions(request));
    let rows: LabelRow[];
    try { rows = labelRows(book, parseAnswer(book, request, client!.model, response.status, response.body)); }
    catch (error) {
      if (!(error instanceof JevLabelCallFailed)) throw error;
      result.failed = { code: error.code, reviewKey: review.review_key };
      break;
    }
    const importSha256 = (await artifacts!.put(response.body!)).sha256;
    const textSha256 = sha256(Buffer.from(review.coded, 'utf8'));
    const written = db.transaction(() => {
      if (coded.get(review.review_key, book.version)) return 0;
      if (!rows.length) return insert.run(review.review_key, book.version, NO_THEME, selection.blockKey, null, null, 'kept', null, client!.model, textSha256, codedAt, importSha256, null).changes;
      let changes = 0;
      for (const row of rows) {
        changes += insert.run(review.review_key, book.version, row.theme_code, selection.blockKey, row.polarity, STEP_AFTER_PURCHASE, row.status, row.p_yes,
          client!.model, textSha256, codedAt, importSha256, row.choice).changes;
      }
      return changes;
    })();
    if (!written) continue;
    result.rowsInserted += written;
    result.labelled++;
    if (!rows.length) result.noTheme++;
  }
  result.skipped = result.eligible - result.called;
  return result;
}

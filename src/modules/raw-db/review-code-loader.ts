import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { acquireLabelsLock } from './labels-lock.js';

export interface ReviewCodeLoadInput {
  mcpRunFile: string; codebookFile: string; coder: string;
  /** The caller rolls the import back; it takes no lock. */
  dryRun?: boolean | undefined;
}
/** One MCP row not imported: its review has no db-v1 row, or the stored label span does not hash to the db-v1 text. */
export interface ReviewCodeSkip { reviewId: string; themeCode: string; reason: 'REVIEW_MISSING' | 'TEXT_MISMATCH' }
/** One MCP review none of whose rows were imported, with the reason of its first skipped row. */
export interface ReviewCodeReviewSkip { reviewId: string; reason: ReviewCodeSkip['reason'] }
/**
 * Rows inserted by one call. alreadyCoded: reviews not imported because they already have review_code rows for the
 * version from another source (0 on a same-input reload). reviewsMissing counts MCP reviews, textMismatch labels,
 * reviewsSkipped the reviews left out whole because of a skipped row.
 */
export interface ReviewCodeLoadResult {
  codebookInserted: number; labelsInserted: number; noThemeInserted: number; alreadyCoded: number;
  reviewsMissing: number; textMismatch: number; skipped: ReviewCodeSkip[]; reviewsSkipped: ReviewCodeReviewSkip[];
}

const NO_THEME = 'NO_THEME';
const POLARITIES = new Set(['khen', 'che', 'ke', 'khong_ro_huong']);
const STATUSES = new Set(['kept', 'unclear']);

interface McpReview { review_id: string; platform: string; source_review_id: string }
interface McpLabel { review_id: string; theme_code: string; codebook_version: string; block_key: string | null; block_norm: string;
  p_yes: number; polarity: string; status: string; step: string; text_start: number; text_end: number; text_sha256: string }
interface McpState { review_id: string; codebook_version: string; block_key: string | null; block_norm: string; input_sha256: string }
type Row = [reviewKey: string, version: string, themeCode: string, blockKey: string | null, polarity: string | null, step: string | null,
  status: string, confidence: number | null, coder: string, textSha256: string, codedAt: string, origin: 'MCP_IMPORT', importSha256: string];

/**
 * Imports the theme labels of one Insight MCP run warehouse (`runs/<runId>.sqlite`) into db-v1 `codebook` and
 * `review_code` (owner F361, F362). No AI call. A label is imported only when its span of the review text rebuilt
 * from db-v1 (`text` + each `attributes_json` item as two spaces + item) hashes to the label's `text_sha256`.
 * The run file is read from its bytes and never written. One transaction; skips are counted, not fatal.
 * All or nothing per review (owner F376): one skipped row skips every row of its review, and a review that already has
 * any review_code row for the version is not touched (themes are never added to an existing group).
 * Holds the labelling lock (labels-lock.ts) from before the first app DB read to the end, except in a dry run.
 */
export async function loadReviewCodesToDbV1(db: Database.Database, input: ReviewCodeLoadInput): Promise<ReviewCodeLoadResult> {
  const { mcpRunFile, codebookFile, coder } = input;
  if (!coder.trim()) throw new Error('RAW_DB_CODES_INVALID_ROW: --coder must not be empty');
  const definitionBytes = await fs.readFile(codebookFile);
  const definitionJson = definitionBytes.toString('utf8');
  const codebook = parseCodebook(definitionJson);
  const definitionSha256 = sha256(definitionBytes);

  // Deserialising the hashed bytes means import_sha256 proves exactly the rows read; the file itself is never opened for writing.
  const runBytes = await fs.readFile(mcpRunFile);
  const importSha256 = sha256(runBytes);
  const mcp = new BetterSqlite3(runBytes, { readonly: true });
  let reviews: McpReview[], labels: McpLabel[], states: McpState[], targets: { codebook_version: string; block_norm: string; started_at: string }[];
  try {
    reviews = mcp.prepare('SELECT review_id, platform, source_review_id FROM review ORDER BY review_id').all() as McpReview[];
    labels = mcp.prepare(`SELECT review_id, theme_code, codebook_version, block_key, block_norm, p_yes, polarity, status, step, text_start, text_end, text_sha256
      FROM label ORDER BY review_id, codebook_version, theme_code, block_norm`).all() as McpLabel[];
    states = mcp.prepare(`SELECT review_id, codebook_version, block_key, block_norm, input_sha256 FROM coding_state
      WHERE status='done' AND codebook_version=? ORDER BY review_id, block_norm`).all(codebook.version) as McpState[];
    targets = mcp.prepare('SELECT codebook_version, block_norm, started_at FROM coding_target').all() as typeof targets;
  } finally {
    mcp.close();
  }

  for (const row of [...labels, ...states]) {
    if (row.codebook_version !== codebook.version) {
      throw new Error(`RAW_DB_CODES_CODEBOOK_MISMATCH: run rows use codebook ${row.codebook_version}, file is ${codebook.version}`);
    }
  }
  // coded_at: the earliest start of the MCP coding target for this version and block.
  const codedAt = new Map<string, string>();
  for (const t of targets) {
    if (t.codebook_version !== codebook.version) continue;
    const previous = codedAt.get(t.block_norm);
    if (previous === undefined || Date.parse(t.started_at) < Date.parse(previous)) codedAt.set(t.block_norm, t.started_at);
  }
  const startedAt = (blockNorm: string, reviewId: string) => {
    const at = codedAt.get(blockNorm);
    if (!at) throw new Error(`RAW_DB_CODES_INVALID_ROW: no coding_target for ${codebook.version}/${blockNorm} (review ${reviewId})`);
    return at;
  };

  const release = input.dryRun ? () => {} : acquireLabelsLock(db);
  try { return importRows(db, codebook, definitionJson, definitionSha256, importSha256, coder, reviews, labels, states, startedAt); }
  finally { release(); }
}

function importRows(db: Database.Database, codebook: Codebook, definitionJson: string, definitionSha256: string, importSha256: string, coder: string,
  reviews: McpReview[], labels: McpLabel[], states: McpState[], startedAt: (blockNorm: string, reviewId: string) => string): ReviewCodeLoadResult {
  const byId = new Map(reviews.map(r => [r.review_id, r]));
  const findReview = db.prepare("SELECT review_key, text, attributes_json FROM review WHERE platform=? AND external_id=? AND kind='product_review'");
  const dbReviews = new Map<string, { review_key: string; text: string | null; attributes_json: string | null } | null>();
  const lookup = (reviewId: string) => {
    if (dbReviews.has(reviewId)) return dbReviews.get(reviewId)!;
    const source = byId.get(reviewId);
    if (!source) throw new Error(`RAW_DB_CODES_INVALID_ROW: MCP row for unknown review ${reviewId}`);
    const matches = findReview.all(source.platform, source.source_review_id) as { review_key: string; text: string | null; attributes_json: string | null }[];
    if (matches.length > 1) throw new Error(`RAW_DB_CODES_AMBIGUOUS_REVIEW: ${matches.length} db-v1 reviews for ${source.platform} ${source.source_review_id}`);
    dbReviews.set(reviewId, matches[0] ?? null);
    return matches[0] ?? null;
  };

  const result: ReviewCodeLoadResult = { codebookInserted: 0, labelsInserted: 0, noThemeInserted: 0, alreadyCoded: 0, reviewsMissing: 0, textMismatch: 0,
    skipped: [], reviewsSkipped: [] };
  const missingReviews = new Set<string>();
  // Rows grouped by db-v1 review; a review with a skipped row is dropped whole.
  const groups = new Map<string, Row[]>();
  const skippedReviews = new Map<string, ReviewCodeSkip['reason']>();
  const skip = (reviewId: string, themeCode: string, reason: ReviewCodeSkip['reason']) => {
    result.skipped.push({ reviewId, themeCode, reason });
    if (!skippedReviews.has(reviewId)) skippedReviews.set(reviewId, reason);
  };
  const keys = new Set<string>();
  const add = (row: Row, reviewId: string) => {
    const key = `${row[0]}\0${row[2]}`;
    if (keys.has(key)) throw new Error(`RAW_DB_CODES_INVALID_ROW: review ${reviewId} has theme ${row[2]} twice for codebook ${codebook.version}`);
    keys.add(key);
    const group = groups.get(row[0]);
    if (group) group.push(row); else groups.set(row[0], [row]);
  };

  const labelled = new Set<string>();
  for (const label of labels) {
    labelled.add(label.review_id);
    const allowed = codebook.themes(label.block_key);
    if (!allowed) throw new Error(`RAW_DB_CODES_INVALID_ROW: review ${label.review_id} uses unknown block ${label.block_key}`);
    if (!allowed.has(label.theme_code)) throw new Error(`RAW_DB_CODES_INVALID_ROW: review ${label.review_id} uses unknown theme ${label.theme_code}`);
    if (!POLARITIES.has(label.polarity) || !STATUSES.has(label.status) || typeof label.step !== 'string' || !label.step
      || typeof label.p_yes !== 'number' || !(label.p_yes >= 0 && label.p_yes <= 1) || !/^[0-9a-f]{64}$/.test(label.text_sha256)) {
      throw new Error(`RAW_DB_CODES_INVALID_ROW: label ${label.review_id}/${label.theme_code} has an invalid polarity, status, step, p_yes or text_sha256`);
    }
    const coded = startedAt(label.block_norm, label.review_id);
    const review = lookup(label.review_id);
    if (!review) { missingReviews.add(label.review_id); skip(label.review_id, label.theme_code, 'REVIEW_MISSING'); continue; }
    if (!spanMatches(review, label)) { result.textMismatch++; skip(label.review_id, label.theme_code, 'TEXT_MISMATCH'); continue; }
    add([review.review_key, codebook.version, label.theme_code, label.block_key, label.polarity, label.step, label.status, label.p_yes,
      coder, label.text_sha256, coded, 'MCP_IMPORT', importSha256], label.review_id);
  }
  // Coded with no theme: a done coding_state of this version and no label row for the review. A review whose labels
  // failed the text proof is labelled, so it never becomes NO_THEME.
  const stateSeen = new Set<string>();
  for (const state of states) {
    if (labelled.has(state.review_id)) continue;
    if (stateSeen.has(state.review_id)) throw new Error(`RAW_DB_CODES_INVALID_ROW: review ${state.review_id} has several done coding states for ${codebook.version}`);
    stateSeen.add(state.review_id);
    if (state.block_key !== null && !codebook.themes(state.block_key)) throw new Error(`RAW_DB_CODES_INVALID_ROW: review ${state.review_id} uses unknown block ${state.block_key}`);
    const coded = startedAt(state.block_norm, state.review_id);
    const review = lookup(state.review_id);
    if (!review) { missingReviews.add(state.review_id); skip(state.review_id, NO_THEME, 'REVIEW_MISSING'); continue; }
    add([review.review_key, codebook.version, NO_THEME, state.block_key, null, null, 'kept', null, coder, state.input_sha256, coded, 'MCP_IMPORT', importSha256], state.review_id);
  }
  result.reviewsMissing = missingReviews.size;
  for (const [reviewId, reason] of skippedReviews) {
    result.reviewsSkipped.push({ reviewId, reason });
    const review = dbReviews.get(reviewId);
    if (review) groups.delete(review.review_key);
  }

  const insertCode = db.prepare(`INSERT INTO review_code(review_key,codebook_version,theme_code,block_key,polarity,journey_step,status,confidence,coder,text_sha256,coded_at,origin,import_sha256)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const storedImports = db.prepare('SELECT import_sha256 FROM review_code WHERE review_key=? AND codebook_version=?').pluck();
  return db.transaction((): ReviewCodeLoadResult => {
    result.codebookInserted = storeCodebook(db, codebook, definitionJson, definitionSha256);
    for (const [reviewKey, rows] of groups) {
      // Any stored row means the review is coded for this version: an exact replay of this file adds nothing silently,
      // another source counts once as alreadyCoded.
      const stored = storedImports.all(reviewKey, codebook.version) as string[];
      if (stored.length) { if (stored.some(sha => sha !== importSha256)) result.alreadyCoded++; continue; }
      for (const row of rows) {
        insertCode.run(...row);
        if (row[2] === NO_THEME) result.noThemeInserted++; else result.labelsInserted++;
      }
    }
    return result;
  })();
}

/** The label span [text_start, text_end) in Unicode code points (the MCP's Python indices) of the rebuilt db-v1 text. */
function spanMatches(review: { text: string | null; attributes_json: string | null }, label: McpLabel): boolean {
  let attributes: unknown = [];
  try { if (review.attributes_json !== null) attributes = JSON.parse(review.attributes_json); } catch { return false; }
  if (!Array.isArray(attributes) || attributes.some(item => typeof item !== 'string')) return false;
  const points = [...(review.text ?? '') + (attributes as string[]).map(item => `  ${item}`).join('')];
  const { text_start: start, text_end: end } = label;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end > points.length) return false;
  return sha256(Buffer.from(points.slice(start, end).join(''), 'utf8')) === label.text_sha256;
}

/**
 * Inserts the codebook row when its version is not stored yet; returns the rows inserted (0 or 1). A version already
 * stored with other definition bytes fails with RAW_DB_CODES_CODEBOOK_CHANGED. Call inside the writer's transaction.
 */
export function storeCodebook(db: Database.Database, codebook: Codebook, definitionJson: string, definitionSha256: string): number {
  const stored = db.prepare('SELECT definition_sha256 FROM codebook WHERE codebook_version=?').get(codebook.version) as { definition_sha256: string } | undefined;
  if (stored && stored.definition_sha256 !== definitionSha256) {
    throw new Error(`RAW_DB_CODES_CODEBOOK_CHANGED: codebook ${codebook.version} is stored with a different definition`);
  }
  if (stored) return 0;
  return db.prepare(`INSERT INTO codebook(codebook_version,contract_version,status,approved_by,approved_at,definition_json,definition_sha256,loaded_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(codebook.version, codebook.contractVersion, codebook.status, codebook.approvedBy, codebook.approvedAt,
    definitionJson, definitionSha256, new Date().toISOString()).changes;
}

export interface Codebook { version: string; contractVersion: string; status: 'DRAFT' | 'APPROVED'; approvedBy: string | null; approvedAt: string | null;
  /** Codes allowed for a block: core, the block's themes and otherCode; undefined for an unknown block. */
  themes(blockKey: string | null): Set<string> | undefined }

export function parseCodebook(text: string): Codebook {
  const fail = (why: string): never => { throw new Error(`RAW_DB_CODES_CODEBOOK_INVALID: ${why}`); };
  let json: Record<string, unknown>;
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { return fail('not JSON'); }
  if (!json || typeof json !== 'object' || Array.isArray(json)) fail('not an object');
  const { version, contractVersion, status, approvedBy = null, approvedAt = null, core, blocks = {}, otherCode } = json;
  if (typeof version !== 'string' || !version) fail('version missing');
  if (typeof contractVersion !== 'string' || !contractVersion) fail('contractVersion missing');
  if (status !== 'DRAFT' && status !== 'APPROVED') fail('status must be DRAFT or APPROVED');
  const approved = status === 'APPROVED';
  if (approved ? typeof approvedBy !== 'string' || typeof approvedAt !== 'string' : approvedBy !== null || approvedAt !== null) {
    fail('approvedBy/approvedAt must both be set when APPROVED and both null when DRAFT');
  }
  const codes = (list: unknown, where: string) => {
    if (!Array.isArray(list)) return fail(`${where} must be a list`);
    return list.map(item => typeof (item as { code?: unknown })?.code === 'string' ? (item as { code: string }).code : fail(`${where} has a theme without code`));
  };
  const other = (otherCode as { code?: unknown } | undefined)?.code;
  if (typeof other !== 'string') fail('otherCode.code missing');
  const base = [...codes(core, 'core'), other as string];
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) fail('blocks must be an object');
  const byBlock = new Map(Object.entries(blocks as Record<string, { themes?: unknown }>)
    .map(([key, block]) => [key, new Set([...base, ...codes(block?.themes, `blocks.${key}.themes`)])]));
  const coreOnly = new Set(base);
  return { version: version as string, contractVersion: contractVersion as string, status: status as 'DRAFT' | 'APPROVED',
    approvedBy: approvedBy as string | null, approvedAt: approvedAt as string | null,
    themes: blockKey => blockKey === null ? coreOnly : byBlock.get(blockKey) };
}

export function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

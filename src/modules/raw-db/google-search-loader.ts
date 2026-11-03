import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { MAX_CAPTURE_ENVELOPE_BYTES } from '../analysis/research-automation/model.js';

/** Input: the captures of one app run, or one raw-v1 / kem-raw-v1 file labelled with a run id (for example `kem-2910`). */
export type GoogleLoadInput = { runId: string } | { file: string; runId: string };

/**
 * Rows inserted by one call. Loads are idempotent by capture id: a capture id already stored with the same observation
 * is skipped without counting, so a reload of the same input counts 0 everywhere. A different capture id is always
 * stored, even when its response bytes repeat. alreadyPresent stays in the receipt and is currently always 0.
 */
export interface GoogleLoadResult {
  runId: string; captures: number; rows: number; references?: number; alreadyPresent: number; notCollected?: number;
}

type Value = string | number | null;
interface CaptureFields {
  captureId: string; runId: string; source: 'S19b' | 'S29'; provider: string; operation: string; endpoint: string | null; params: Record<string, unknown>;
  keyword: string | null; requestedAt: string; completedAt: string; httpStatus: number | null; outcome: 'OK' | 'EMPTY' | 'FAILED' | 'NOT_COLLECTED';
  billing: string | null; costUnit: string | null; costAmount: number | null; sha: string; basis: ShaBasis; rawPath: string;
}
/**
 * What response_sha256 covers (KHUON §2.1). Run: the provider's response bytes. S19b file: `raw` re-serialised with
 * JSON.stringify (file key order). S29 file: the whole file record re-serialised (request fields and response together).
 */
type ShaBasis = 'ORIGINAL_BYTES' | 'RETAINED_ENVELOPE' | 'CANONICAL_JSON';
interface PlannedCapture { capture: CaptureFields; rows: Value[][]; references: Value[][] }

const ENVELOPE_CONTRACT = 'research-automation-capture-v1';
const SUGGEST_LETTERS = 'a b c d đ e g h i k l m n o p q r s t u v x y'.split(' ');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Copies Google search suggestions (S19b) into db-v1 `search_suggestion`: one raw_capture per prefix call.
 * Run input reads only the run's `google.suggest` captures through the artifact store (size and digest checked).
 */
export async function loadSearchSuggestionsToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, input: GoogleLoadInput): Promise<GoogleLoadResult> {
  const planned = 'file' in input ? await suggestionsFromFile(input.file, input.runId) : await suggestionsFromRun(db, artifacts, input.runId);
  const { result } = write(db, input.runId, planned, false);
  return result;
}

/**
 * Copies Google AI Overview answers (S29) into db-v1 `ai_overview_block` and `ai_overview_reference`: one raw_capture
 * per S19 response that has an `ai_overview` key. Every S29 row is a hypothesis (Weak level), never evidence.
 */
export async function loadAiOverviewToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, input: GoogleLoadInput): Promise<GoogleLoadResult> {
  const planned = 'file' in input ? await aiOverviewFromFile(input.file, input.runId) : await aiOverviewFromRun(db, artifacts, input.runId);
  const { result, notCollected } = write(db, input.runId, planned, true);
  return { ...result, notCollected };
}

// ---- S19b ----

async function suggestionsFromRun(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<PlannedCapture[]> {
  const run = assertRun(db, runId);
  const captures = runCaptures(db, runId, 'google-suggest', 'google.suggest');
  const bodies: { row: CaptureRow; prefix: string; suggestions: string[]; sha: string }[] = [];
  for (const row of captures) {
    const response = await captureResponse(artifacts, row);
    if (!response) continue; // a failed call carries no suggestions
    const body: unknown = JSON.parse(response.text);
    if (!Array.isArray(body) || typeof body[0] !== 'string' || !Array.isArray(body[1]) || !body[1].every(item => typeof item === 'string'))
      throw new Error(`RAW_DB_SUGGEST_BAD_BODY: capture ${row.stepId}:${row.ordinal} is not [prefix, [suggestions]]`);
    bodies.push({ row, prefix: body[0], suggestions: body[1] as string[], sha: response.sha256 });
  }
  // Base terms: the run keyword plus every prefix the lane extended with " <letter>".
  const prefixes = new Set(bodies.map(b => b.prefix));
  const bases = new Set<string>([run.keyword]);
  for (const prefix of prefixes) {
    const stem = letterStem(prefix);
    if (stem !== null) bases.add(stem);
  }
  return bodies.map(({ row, prefix, suggestions, sha }) => {
    const keyword = longest([...bases].filter(base => prefix === base || letterStem(prefix) === base));
    const captureId = `S19b:${runId}:${row.ordinal}`;
    return suggestionCapture(captureId, runId, keyword, prefix, suggestions, row.retrievedAt, 200, sha, 'ORIGINAL_BYTES', `artifact:${row.artifactSha}`);
  });
}

async function suggestionsFromFile(file: string, runId: string): Promise<PlannedCapture[]> {
  const { declare, records, sha12, relative } = await readRawFile(file, 'S19b');
  const bases = [declare.keyword, ...stringArray(isRecord(declare.origin) ? declare.origin.basePhrases : undefined)].filter((v): v is string => typeof v === 'string' && v.length > 0);
  return records.map((record, index) => {
    const prefix = record.prefix, requestedAt = record.requestedAt, status = record.httpStatus;
    if (typeof prefix !== 'string' || typeof requestedAt !== 'string') throw new Error(`RAW_DB_FILE_BAD_RECORD: S19b record ${index} lacks prefix or requestedAt`);
    const ok = status === 200;
    const suggestions = ok ? stringArray(record.suggestions) : [];
    if (ok && !Array.isArray(record.suggestions)) throw new Error(`RAW_DB_FILE_BAD_RECORD: S19b record ${index} lacks suggestions`);
    const keyword = longest(bases.filter(base => prefix.startsWith(base)));
    if (!('raw' in record)) throw new Error(`RAW_DB_FILE_BAD_RECORD: S19b record ${index} lacks raw`);
    const sha = sha256(JSON.stringify(record.raw));
    const planned = suggestionCapture(`S19b:${sha12}:${index}`, runId, keyword, prefix, suggestions, requestedAt,
      typeof status === 'number' ? status : null, sha, 'CANONICAL_JSON', `file:${relative}#${index}`);
    return ok ? planned : { ...planned, capture: { ...planned.capture, outcome: 'FAILED' } };
  });
}

function suggestionCapture(captureId: string, runId: string, keyword: string | null, prefix: string, suggestions: string[],
  at: string, httpStatus: number | null, sha: string, basis: ShaBasis, rawPath: string): PlannedCapture {
  return {
    capture: { captureId, runId, source: 'S19b', provider: 'google-suggest', operation: 'google.suggest', endpoint: null, params: { prefix }, keyword,
      requestedAt: at, completedAt: at, httpStatus, outcome: suggestions.length ? 'OK' : 'EMPTY', billing: null, costUnit: 'USD', costAmount: 0, sha, basis, rawPath },
    rows: suggestions.map((suggestion, i) => [prefix, i + 1, suggestion, at, captureId]),
    references: [],
  };
}

/** `base` when `prefix` is `base + " " + <suggest letter>`, else null. */
function letterStem(prefix: string): string | null {
  const space = prefix.lastIndexOf(' ');
  return space > 0 && SUGGEST_LETTERS.includes(prefix.slice(space + 1)) ? prefix.slice(0, space) : null;
}

// ---- S29 ----

async function aiOverviewFromRun(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string): Promise<PlannedCapture[]> {
  const run = assertRun(db, runId);
  const followUps = new Map<string, { row: CaptureRow; response: CaptureResponse; overview: Record<string, unknown> }>();
  for (const row of runCaptures(db, runId, 'serpapi', 'serpapi.google_ai_overview')) {
    const response = await captureResponse(artifacts, row);
    if (!response) continue;
    const json: unknown = JSON.parse(response.text);
    const token = isRecord(json) && isRecord(json.search_parameters) ? json.search_parameters.page_token : undefined;
    if (typeof token === 'string' && isRecord(json) && isRecord(json.ai_overview) && !followUps.has(token)) followUps.set(token, { row, response, overview: json.ai_overview });
  }
  const planned: PlannedCapture[] = [];
  for (const row of runCaptures(db, runId, 'serpapi', 'serpapi.google.search')) {
    const response = await captureResponse(artifacts, row);
    if (!response) continue;
    const json: unknown = JSON.parse(response.text);
    if (!isRecord(json) || !('ai_overview' in json)) continue;
    const inline = isRecord(json.ai_overview) ? json.ai_overview : {};
    const query = isRecord(json.search_parameters) && typeof json.search_parameters.q === 'string' ? json.search_parameters.q
      : typeof response.requestParameters?.q === 'string' ? response.requestParameters.q : null;
    if (query === null) throw new Error(`RAW_DB_AIO_QUERY_MISSING: capture ${row.stepId}:${row.ordinal}`);
    const token = typeof inline.page_token === 'string' ? inline.page_token : null;
    const followUp = !hasBlocks(inline) && token !== null ? followUps.get(token) : undefined;
    const answer = hasBlocks(inline) ? inline : followUp && hasBlocks(followUp.overview) ? followUp.overview : null;
    const carrier = followUp && answer === followUp.overview ? followUp : { row, response };
    const state = hasBlocks(inline) ? 'inline' : answer ? 'follow_up' : token !== null ? 'page_token_not_fetched' : 'no_blocks';
    planned.push(overviewCapture({
      captureId: `S29:${runId}:${row.stepId}:${row.ordinal}`, runId, keyword: run.keyword, query, answer,
      params: { query, aiOverviewState: state, pageTokenPresent: token !== null, sharedWithS19: carrier.row === row },
      operation: carrier.row.operation, endpoint: carrier.response.endpoint,
      requestedAt: carrier.response.requestedAt ?? carrier.row.retrievedAt, completedAt: carrier.response.completedAt ?? carrier.row.retrievedAt,
      httpStatus: carrier.response.httpStatus, sha: carrier.response.sha256, basis: 'ORIGINAL_BYTES', rawPath: `artifact:${carrier.row.artifactSha}`,
    }));
  }
  return planned;
}

async function aiOverviewFromFile(file: string, runId: string): Promise<PlannedCapture[]> {
  const { declare, records, sha12, relative } = await readRawFile(file, 'S29');
  const keyword = typeof declare.keyword === 'string' ? declare.keyword : null;
  return records.map((record, index) => {
    const query = record.query, requestedAt = record.requestedAt, state = record.aiOverviewState;
    if (typeof query !== 'string' || typeof requestedAt !== 'string') throw new Error(`RAW_DB_FILE_BAD_RECORD: S29 record ${index} lacks query or requestedAt`);
    const inline = isRecord(record.ai_overview) ? record.ai_overview : {};
    const followUp = isRecord(record.aiOverviewFollowUp) && isRecord(record.aiOverviewFollowUp.ai_overview) ? record.aiOverviewFollowUp.ai_overview : null;
    const answer = state === 'inline' && hasBlocks(inline) ? inline : followUp && hasBlocks(followUp) ? followUp : null;
    const viaFollowUp = answer !== null && answer === followUp;
    return overviewCapture({
      captureId: `S29:${sha12}:${index}`, runId, keyword, query, answer,
      params: { query, aiOverviewState: typeof state === 'string' ? state : null, pageTokenPresent: typeof inline.page_token === 'string',
        sharedWithS19: !viaFollowUp && record.origin !== 'FRESH' },
      operation: viaFollowUp ? 'serpapi.google_ai_overview' : 'serpapi.google.search', endpoint: null,
      requestedAt, completedAt: requestedAt, httpStatus: typeof record.httpStatus === 'number' ? record.httpStatus : null,
      sha: sha256(JSON.stringify(record)), basis: 'RETAINED_ENVELOPE', rawPath: `file:${relative}#${index}`,
    });
  });
}

function overviewCapture(c: { captureId: string; runId: string; keyword: string | null; query: string; answer: Record<string, unknown> | null;
  params: Record<string, unknown>; operation: string; endpoint: string | null; requestedAt: string; completedAt: string; httpStatus: number | null; sha: string; basis: ShaBasis;
  rawPath: string }): PlannedCapture {
  const rows: Value[][] = [];
  const references: Value[][] = [];
  if (c.answer) {
    const push = (type: 'heading' | 'paragraph' | 'list_item', item: Record<string, unknown>): void => {
      rows.push([c.query, rows.length, type, typeof item.snippet === 'string' ? item.snippet : null,
        Array.isArray(item.reference_indexes) ? JSON.stringify(item.reference_indexes) : null, c.captureId]);
    };
    const pushList = (items: unknown): void => {
      if (!Array.isArray(items)) throw new Error(`RAW_DB_AIO_BAD_LIST: ${c.captureId} expected list[]`);
      for (const item of items) {
        if (!isRecord(item)) throw new Error(`RAW_DB_AIO_BAD_LIST: ${c.captureId} expected a list item`);
        if (item.type !== undefined && item.type !== 'heading' && item.type !== 'paragraph' && item.type !== 'list')
          throw new Error(`RAW_DB_AIO_UNKNOWN_BLOCK: ${c.captureId} block ${JSON.stringify(item.type)}`);
        push('list_item', item);
        if ('list' in item) pushList(item.list); // nested bullets follow their parent
      }
    };
    for (const block of c.answer.text_blocks as unknown[]) {
      const type = isRecord(block) ? block.type : undefined;
      if (type === 'heading' || type === 'paragraph') push(type, block as Record<string, unknown>);
      else if (type === 'list') pushList((block as Record<string, unknown>).list);
      else throw new Error(`RAW_DB_AIO_UNKNOWN_BLOCK: ${c.captureId} block ${JSON.stringify(type ?? null)}`);
    }
    const refs = c.answer.references ?? [];
    if (!Array.isArray(refs)) throw new Error(`RAW_DB_AIO_BAD_REFERENCE: ${c.captureId} expected references[]`);
    const indexes = new Set<number>();
    refs.forEach(ref => {
      if (!isRecord(ref) || !Number.isSafeInteger(ref.index) || indexes.has(ref.index as number))
        throw new Error(`RAW_DB_AIO_BAD_REFERENCE: ${c.captureId} expected a unique integer index`);
      indexes.add(ref.index as number);
      const str = (v: unknown): string | null => typeof v === 'string' ? v : null;
      references.push([c.query, ref.index as number, str(ref.title), str(ref.link), str(ref.source), str(ref.snippet), c.captureId]);
    });
  }
  return {
    capture: { captureId: c.captureId, runId: c.runId, source: 'S29', provider: 'serpapi', operation: c.operation, endpoint: c.endpoint, params: c.params,
      keyword: c.keyword, requestedAt: c.requestedAt, completedAt: c.completedAt, httpStatus: c.httpStatus, outcome: c.answer ? 'OK' : 'NOT_COLLECTED',
      billing: 'PAID_SEARCH_UNLESS_CACHED', costUnit: null, costAmount: null, sha: c.sha, basis: c.basis, rawPath: c.rawPath },
    rows, references,
  };
}

function hasBlocks(overview: Record<string, unknown>): boolean {
  return Array.isArray(overview.text_blocks) && overview.text_blocks.length > 0;
}

// ---- shared ----

function write(db: Database.Database, runId: string, planned: PlannedCapture[], aiOverview: boolean): { result: GoogleLoadResult; notCollected: number } {
  const insertCapture = db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,endpoint,request_params_json,keyword,
    requested_at,completed_at,http_status,outcome,billing,cost_unit,cost_amount,response_sha256,raw_path,response_sha256_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const existingCapture = db.prepare('SELECT source_code,response_sha256,requested_at,outcome,operation FROM raw_capture WHERE capture_id=?');
  const insertRow = aiOverview
    ? db.prepare('INSERT INTO ai_overview_block(query,block_seq,block_type,text,reference_indexes,capture_id) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    : db.prepare('INSERT INTO search_suggestion(prefix,rank,suggestion,collected_at,capture_id) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING');
  const insertReference = db.prepare('INSERT INTO ai_overview_reference(query,ref_index,title,link,site,snippet,capture_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING');
  return db.transaction(() => {
    const result: GoogleLoadResult = { runId, captures: 0, rows: 0, alreadyPresent: 0 };
    let references = 0, notCollected = 0;
    for (const { capture: c, rows, references: refs } of planned) {
      // Idempotent by capture id: a stored capture must be this exact observation, and its rows are already there.
      // A different capture id is always stored, even when its response bytes repeat another capture's.
      const existing = existingCapture.get(c.captureId) as { source_code: string; response_sha256: string | null; requested_at: string; outcome: string; operation: string } | undefined;
      if (existing) {
        if (existing.source_code !== c.source || existing.response_sha256 !== c.sha || existing.requested_at !== c.requestedAt || existing.outcome !== c.outcome || existing.operation !== c.operation)
          throw new Error(`RAW_DB_CAPTURE_CONFLICT: ${c.captureId} already identifies a different observation`);
        continue;
      }
      insertCapture.run(c.captureId, c.runId, c.source, c.provider, c.operation, c.endpoint, JSON.stringify(c.params), c.keyword,
        c.requestedAt, c.completedAt, c.httpStatus, c.outcome, c.billing, c.costUnit, c.costAmount, c.sha, c.rawPath, c.basis);
      result.captures++;
      if (c.outcome === 'NOT_COLLECTED') notCollected++;
      // Rows of a new capture are never silently dropped (for example two references with the same index).
      for (const row of rows) {
        if (!insertRow.run(...row).changes) throw new Error(`RAW_DB_DUPLICATE_ROW: ${c.captureId} has a repeated row key`);
        result.rows++;
      }
      for (const ref of refs) {
        if (!insertReference.run(...ref).changes) throw new Error(`RAW_DB_DUPLICATE_ROW: ${c.captureId} repeats reference ${String(ref[1])}`);
        references++;
      }
    }
    if (aiOverview) result.references = references;
    return { result, notCollected };
  })();
}

export interface CaptureRow { stepId: string; ordinal: string; artifactSha: string; provider: string; operation: string; retrievedAt: string; byteSize: number | bigint | null }
interface CaptureResponse { text: string; sha256: string; endpoint: string | null; requestedAt: string | null; completedAt: string | null; httpStatus: number | null;
  requestParameters: Record<string, unknown> | null }

export function assertRun(db: Database.Database, runId: string): { keyword: string } {
  const run = db.prepare('SELECT keyword FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { keyword: string } | undefined;
  if (!run) throw new Error(`RAW_DB_RUN_NOT_FOUND: no research-automation run ${runId}`);
  return run;
}

export function runCaptures(db: Database.Database, runId: string, provider: string, operation: string): CaptureRow[] {
  return (db.prepare(`SELECT c.step_id stepId,c.ordinal ordinal,c.artifact_sha256 artifactSha,c.provider provider,c.operation operation,c.retrieved_at retrievedAt,m.byte_size byteSize
    FROM analysis_research_automation_captures c LEFT JOIN artifact_manifests m ON m.sha256=c.artifact_sha256
    WHERE c.run_id=? AND c.provider=? AND c.operation=? AND c.truncated=0
    ORDER BY CASE c.step_id WHEN 'QUICK_SEARCH' THEN 0 ELSE 1 END, c.ordinal`).all(runId, provider, operation) as CaptureRow[])
    .map(row => ({ ...row, ordinal: String(row.ordinal) }));
}

/**
 * The exact provider response of one capture, or null when the call received nothing. The artifact must match its
 * manifest size and digest; a capture envelope must also match its row and its inner response digest.
 */
async function captureResponse(artifacts: ContentAddressedArtifactStore, row: CaptureRow): Promise<CaptureResponse | null> {
  return (await verifiedCapture(artifacts, row)).response;
}

/**
 * One stored capture, checked as in captureResponse: its envelope (null for a raw-answer capture) and its exact response
 * (null when the call received nothing, for example a failed or rejected call).
 */
export async function verifiedCapture(artifacts: ContentAddressedArtifactStore, row: CaptureRow): Promise<{ envelope: Record<string, unknown> | null; response: CaptureResponse | null }> {
  if (row.byteSize === null) throw new Error(`RAW_DB_ARTIFACT_MISSING: no manifest for capture ${row.stepId}:${row.ordinal}`);
  const bytes = await artifacts.read(row.artifactSha, { maxBytes: MAX_CAPTURE_ENVELOPE_BYTES });
  if (bytes.byteLength !== Number(row.byteSize)) throw new Error(`RAW_DB_ARTIFACT_MISMATCH: stored artifact differs from capture ${row.stepId}:${row.ordinal}`);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.contractVersion !== ENVELOPE_CONTRACT)
    return { envelope: null, response: { text, sha256: row.artifactSha, endpoint: null, requestedAt: null, completedAt: null, httpStatus: null, requestParameters: null } };
  if (String(value.provider).toLowerCase() !== row.provider || String(value.operation).toLowerCase() !== row.operation || value.completedAt !== row.retrievedAt)
    throw new Error(`RAW_DB_ARTIFACT_MISMATCH: capture envelope does not match capture ${row.stepId}:${row.ordinal}`);
  if (value.outcome !== 'OK') return { envelope: value, response: null };
  if (typeof value.responseBytesBase64 !== 'string') throw new Error(`RAW_DB_ARTIFACT_MISMATCH: successful capture ${row.stepId}:${row.ordinal} has no response bytes`);
  const response = Buffer.from(value.responseBytesBase64, 'base64');
  const sha = sha256(response);
  if (response.toString('base64') !== value.responseBytesBase64 || sha !== value.responseSha256 ||
      (value.responseByteLength !== undefined && response.byteLength !== value.responseByteLength))
    throw new Error(`RAW_DB_ARTIFACT_MISMATCH: response bytes differ in capture ${row.stepId}:${row.ordinal}`);
  return { envelope: value, response: {
    text: new TextDecoder('utf-8', { fatal: true }).decode(response), sha256: sha,
    endpoint: typeof value.endpoint === 'string' ? value.endpoint : null,
    requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : null,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    httpStatus: typeof value.httpStatus === 'number' ? value.httpStatus : null,
    requestParameters: isRecord(value.requestParameters) ? value.requestParameters : null,
  } };
}

/** Reads a raw-v1 / kem-raw-v1 file of one source: declare, records, the first 12 hex of the file SHA-256 and its repo-relative path. */
export async function readRawFile(file: string, sourceCode: string): Promise<{ declare: Record<string, unknown>; records: Record<string, unknown>[]; sha12: string; relative: string }> {
  const bytes = await fs.readFile(file);
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const declare = isRecord(value) && isRecord(value.declare) ? value.declare : null;
  if (!declare || (declare.formatVersion !== 'raw-v1' && declare.formatVersion !== 'kem-raw-v1') || declare.sourceCode !== sourceCode)
    throw new Error(`RAW_DB_FILE_WRONG_SOURCE: ${path.basename(file)} is not a raw-v1 ${sourceCode} file`);
  const records = (value as Record<string, unknown>).records;
  if (!Array.isArray(records) || !records.every(isRecord)) throw new Error(`RAW_DB_FILE_BAD_RECORD: ${path.basename(file)} has no records[]`);
  const absolute = path.resolve(file);
  const relative = path.relative(REPO_ROOT, absolute);
  return { declare, records, sha12: sha256(bytes).slice(0, 12), relative: relative.startsWith('..') || path.isAbsolute(relative) ? path.basename(absolute) : relative.split(path.sep).join('/') };
}

function longest(values: string[]): string | null {
  return values.reduce<string | null>((best, v) => best === null || v.length > best.length ? v : best, null);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  if (!value.every(item => typeof item === 'string')) throw new Error('RAW_DB_FILE_BAD_RECORD: expected a list of strings');
  return value as string[];
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

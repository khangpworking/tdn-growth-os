import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import { fixture, workspaceId } from '../helpers/autorun-harness.js';
import { CODES_AT, codesHash, seedCodeReview } from './raw-db-v1-codes.js';

// Golden values come from the actual MCP Python functions, without importing its optional MCP server dependency.
// Regenerate from the repository root (inputs and raw_response stay fixed):
// python3 - <<'PY'
// import ast, hashlib, json, math, re, unicodedata
// from pathlib import Path
// src = Path('tools/mcp-insight/insight_tools.py')
// names = {'_nz','_term_matches','select_block','build_request','_wire_body','_number','parse_answer','label_rows','_CallFailed'}
// constants = {'JEV_MODEL','OPTION_KEYS','POLARITY_BY_OPTION','STEP_AFTER_PURCHASE'}
// nodes = [n for n in ast.parse(src.read_text()).body if
//   isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names or
//   isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
// ns = dict(json=json,math=math,re=re,unicodedata=unicodedata)
// exec(compile(ast.Module(body=nodes,type_ignores=[]),str(src),'exec'),ns)
// bookfile = Path('tools/mcp-insight/data/insight-theme-codebook.json')
// book = json.loads(bookfile.read_text())
// out = Path('tests/fixtures/raw-db-v1-labels.golden.json')
// data = json.loads(out.read_text())
// for c in data['cases']:
//   text = c['text'] + ''.join('  '+a for a in c['attributes'])
//   selection = ns['select_block'](book,[c['keyword']],None)
//   request = ns['build_request'](book,selection,dict(text=text,platform='shopee',product_name=c['product_name']))
//   c['coding_text'],c['text_sha256'],c['wire'] = text,hashlib.sha256(text.encode()).hexdigest(),ns['_wire_body'](request)
//   parsed = ns['parse_answer'](book,request,200,c['raw_response'])
//   c['labels'] = sorted([dict(**r,block_key=selection['blockKey'],step=ns['STEP_AFTER_PURCHASE'])
//     for r in ns['label_rows'](book,parsed)],key=lambda r:r['theme_code'])
// data.update(python_source_sha256=hashlib.sha256(src.read_bytes()).hexdigest(),
//   codebook_sha256=hashlib.sha256(bookfile.read_bytes()).hexdigest(),codebook_version=book['version'],model=ns['JEV_MODEL'])
// out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
// PY
interface GoldenCase {
  id: string; keyword: string; text: string; attributes: string[]; product_name: string;
  coding_text: string; text_sha256: string; wire: unknown; raw_response: string;
  labels: { theme_code: string; p_yes: number; polarity: string; status: string; block_key: string | null; step: string }[];
}
export const labelsGolden = JSON.parse(readFileSync(new URL('./raw-db-v1-labels.golden.json', import.meta.url), 'utf8')) as {
  codebook_version: string; model: string; no_theme_response: string; cases: GoldenCase[];
};
export const labelCodebookText = readFileSync(new URL('../../tools/mcp-insight/data/insight-theme-codebook.json', import.meta.url), 'utf8');
export const LABEL_CAP = (JSON.parse(labelCodebookText) as { limits: { maxCallsPerRun: number } }).limits.maxCallsPerRun;

export async function labelsFixture(t: TestContext, keyword = 'synthetic jar') {
  const f = await fixture(t, 'off');
  const runId = await labelRun(f, keyword);
  return { ...f, runId };
}

export async function labelRun(f: Pick<Awaited<ReturnType<typeof fixture>>, 'service'>, keyword = 'synthetic jar') {
  const receipt = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'CATEGORY', keyword, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['INSIGHT'] });
  return receipt.run.runId;
}

export function seedLabelReview(db: Database.Database, runId: string, id: string, overrides = {}) {
  const key = `S05:${id}`;
  seedCodeReview(db, { review_key: key, external_id: id, text: `Mẫu giả lập ${id} 🧪`, attributes_json: null, ...overrides });
  db.prepare(`INSERT INTO run_review(run_id,review_key,capture_id,source_position)
    SELECT ?,review_key,capture_id,source_position FROM review WHERE review_key=?`).run(runId, key);
  return key;
}

export function seedLabelCodebook(db: Database.Database, version = labelsGolden.codebook_version) {
  const definition = version === labelsGolden.codebook_version ? labelCodebookText :
    JSON.stringify({ ...JSON.parse(labelCodebookText), version });
  db.prepare(`INSERT INTO codebook VALUES (?, 'insight-theme-codebook-v1', 'DRAFT', NULL, NULL, ?, ?, ?)`)
    .run(version, definition, codesHash(definition), CODES_AT);
}

export function seedLabelCode(db: Database.Database, reviewKey: string, origin = 'MCP_IMPORT', version = labelsGolden.codebook_version) {
  const row = { review_key: reviewKey, codebook_version: version, theme_code: 'T-GIA', block_key: null,
    polarity: 'khen', journey_step: 'Sau mua', status: 'kept', confidence: 0.9, coder: 'synthetic-importer',
    text_sha256: codesHash('Mẫu giả lập'), coded_at: CODES_AT, origin, import_sha256: 'a'.repeat(64) };
  db.prepare(`INSERT INTO review_code(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`)
    .run(...Object.values(row));
  return row;
}

export interface LabelReceipt {
  eligible: number; called: number; labelled: number; noTheme: number; rowsInserted: number;
  failed: null | { code: string; reviewKey: string }; skipped: unknown;
}
export interface LabelCall { url: string; method: string; body: unknown; calledAt: string }
type CliFixture = { root: string; databasePath: string; artifactRoot: string };
type ResponseSpec = { raw: string; status?: number; text?: string };

/** Uses only COMMON-Y's public CLI and persisted rows: no assumed labeller export or new production seam. */
export async function labelCli(f: CliFixture, args: string[], responses: ResponseSpec[] = [],
  jev: 'enabled' | 'disabled' | 'missing-key' = 'enabled', model = labelsGolden.model) {
  const id = randomUUID();
  const log = path.join(f.root, `fetch-${id}.jsonl`), config = path.join(f.root, `fetch-${id}.json`);
  await fs.writeFile(log, '');
  await fs.writeFile(config, JSON.stringify({ log, responses }));
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--import',
    fileURLToPath(new URL('./raw-db-v1-labels-fetch.mjs', import.meta.url)), 'scripts/raw-db-load.ts',
    '--db', f.databasePath, '--artifacts', f.artifactRoot, ...args], {
    cwd: path.resolve('.'), encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    // Do not inherit provider credentials, Node preloads or runtime paths.
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC', RAWDB_Y_FETCH_CONFIG: config,
      TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot,
      TDN_RESEARCH_JEV_ENABLED: jev === 'disabled' ? 'false' : 'true',
      ...(jev === 'missing-key' ? {} : { TYPESAFE_API_KEY: 'synthetic-rawdb-y-key' }),
      TDN_RESEARCH_JEV_MODEL: model },
  });
  const calls = (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as LabelCall);
  assert.equal(child.error, undefined, child.error?.message);
  // COMMON-Y pins the LABELS failure receipt, but does not pin its exit status.
  // S05 must still succeed even when automatic labelling reports a failure.
  if (child.stdout.trim() === '') assert.fail(`CLI failed: ${child.stderr}`);
  const value: unknown = JSON.parse(child.stdout.trim());
  const reportedFailure = typeof value === 'object' && value !== null && 'failed' in value && value.failed !== null;
  if (!args.includes('LABELS') || !reportedFailure) assert.equal(child.status, 0, `CLI failed: ${child.stderr || child.stdout}`);
  return { value, calls };
}

export const noThemeResponses = (count: number): ResponseSpec[] =>
  Array.from({ length: count }, () => ({ raw: labelsGolden.no_theme_response }));

export function labelledKeys(db: Database.Database): string[] {
  return db.prepare('SELECT DISTINCT review_key FROM review_code ORDER BY review_key').pluck().all() as string[];
}

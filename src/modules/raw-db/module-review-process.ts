import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type BetterSqlite3 from 'better-sqlite3';
import { createRequire } from 'node:module';
import schema from '../../../contracts/foundation/shopee-module-review-process.schema.json' with { type: 'json' };
import type {
  ReviewProcessCheck, ReviewProcessErrorCode, ReviewProcessFee, ReviewProcessGateFile, ReviewProcessGateSummary, ReviewProcessPlan,
  ReviewProcessReceipt, ReviewProcessSource, ReviewProcessStageAttempt, ReviewProcessStageFile, ReviewProcessStart, ReviewProcessStateRecord,
  ReviewProcessVersions, ReviewProcessView,
} from '../../../contracts/foundation/shopee-module-review-process.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { TypesafeJevClient, typesafeJevConfigurationFromEnvironment } from '../../platform/ai/typesafe-jev-client.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { discoverModuleReviewSources, readRunTracking, reviewDataReadonly, type VerifiedModuleReviewCollection } from '../foundation/shopee-module-review-data.js';
import { ModuleError, safePath } from '../../../scripts/module-pick.js';
import { LabelsBusyError } from './labels-lock.js';
import { configuration, configuredDatabase, moduleProductNames, saveModuleReviewData } from './module-shopee-reviews.js';
import { REVIEW_FILTER_POLICY_VERSION, filterReviewsInDbV1, hasReviewContent, reviewFilterPolicySha256 } from './review-filter.js';
import { DEFAULT_CODEBOOK_FILE, labelReviewsInDbV1, parseLabelCodebook } from './review-labeller.js';
import { assertModuleImportable, moduleImportReceipt } from './shopee-reviews-loader.js';

/**
 * Step 4 of the Shopee module flow (owner F577 to F586, design B): save → Jev filter → Jev label for one verified M3 source,
 * in order, stopping at the first failed stage. Stage status is derived from DB rows; the files under `m4/<sourceSha256>/`
 * hold the worker state, one receipt per stage, the plan with the fee estimate, the final receipt and the two gates.
 * Nothing outside `m4/` is written in the run folder; no existing format is changed.
 */

const MODULES_FILE = fileURLToPath(new URL('../../../skills/tdn-shopee-flow/modules.json', import.meta.url));
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true }); addFormats(ajv); ajv.addSchema(schema);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateReviewProcess<T>(definition: string, value: unknown): T {
  let validate = validators.get(definition);
  if (!validate) { validate = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }); validators.set(definition, validate); }
  if (!validate(value)) throw new ModuleError('REVIEW_PROCESS_INVALID');
  return value as T;
}

export interface ReviewProcessSettings {
  skillVersion: string; labelUnresolved: boolean; maxRetries: number; retryWaitSeconds: number[]; busyWaitSeconds: number;
  feeUsdPerCall: { filter: number; label: number };
}
export async function reviewProcessSettings(): Promise<ReviewProcessSettings> {
  return (JSON.parse(await readFile(MODULES_FILE, 'utf8')) as { reviewProcess: ReviewProcessSettings }).reviewProcess;
}

type Stage = 'save' | 'filter' | 'label';
const IN_CHECKS = ['source_unchanged', 'review_ids_valid', 'not_saved_twice', 'jev_ready_versions_fixed', 'fee_estimate_recorded'] as const;
const CONTRACT_ERRORS = new Set<string>(['JEV_CALL_FAILED', 'JEV_DISABLED', 'REVIEW_SOURCE_CHANGED', 'DB_IMPORT_CONFLICT', 'PRODUCT_NAME_PROVENANCE_MISSING',
  'APP_DB_NOT_CONFIGURED', 'READONLY_ON', 'GATE_FAILED']);
const contractError = (code: string): ReviewProcessErrorCode => (CONTRACT_ERRORS.has(code) ? code : 'GATE_FAILED') as ReviewProcessErrorCode;
const errorCode = (error: unknown): string => error instanceof ModuleError ? error.code : (error as { code?: unknown })?.code === 'LABELS_BUSY' ? 'LABELS_BUSY' : 'GATE_FAILED';
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const round2 = (value: number) => Math.round(value * 100) / 100;
const wait = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));
export const datasetId = (run: string, sourceSha256: string) => `module-m3:${basename(run)}:${sourceSha256}`;
const folder = (sourceSha256: string) => `m4/${sourceSha256}`;

function pidLive(pid: number | null): boolean {
  if (pid === null) return false;
  try { process.kill(pid, 0); } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  return true;
}

async function readOptional<T>(run: string, path: string, definition: string): Promise<T | null> {
  let bytes: string;
  try { bytes = await readFile(await safePath(run, path), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  return validateReviewProcess<T>(definition, JSON.parse(bytes));
}
async function writeAtomic(run: string, path: string, definition: string, value: unknown): Promise<Buffer> {
  validateReviewProcess(definition, value);
  const target = await safePath(run, path), bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.tmp`, handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, target); } catch (error) { await unlink(temp).catch(() => {}); throw error; }
  const directory = await open(dirname(target), 'r'); try { await directory.sync(); } finally { await directory.close(); }
  return bytes;
}

/** Runs created by this release carry `m4/auto.json` (written by new-run); older runs do not start step 4 by themselves. */
export async function reviewProcessAutoRun(run: string): Promise<boolean> {
  return (await readOptional(run, 'm4/auto.json', 'autoRecord')) !== null;
}

async function versions(settings: ReviewProcessSettings, model: string): Promise<ReviewProcessVersions> {
  const bytes = await readFile(DEFAULT_CODEBOOK_FILE);
  return { filterPolicy: REVIEW_FILTER_POLICY_VERSION, filterPolicySha256: reviewFilterPolicySha256(), codebook: parseLabelCodebook(bytes.toString('utf8')).version,
    codebookSha256: sha256(bytes), model, labelUnresolved: settings.labelUnresolved };
}
const allowedOutcomes = (settings: ReviewProcessSettings) => settings.labelUnresolved ? ['KEEP', 'UNRESOLVED'] : ['KEEP'];
const reviewKeys = (source: VerifiedModuleReviewCollection) => source.rows.map(row => `S05:${row.reviewId}`);

/** Calls still needed for this source (rows with content, without a row at the fixed versions). Labels are an upper bound before the filter ends. */
function plannedCalls(db: BetterSqlite3.Database | null, source: VerifiedModuleReviewCollection, v: ReviewProcessVersions, settings: ReviewProcessSettings) {
  const content = source.rows.filter(row => hasReviewContent(row.comment, row.attributes.length ? JSON.stringify(row.attributes) : null)).map(row => `S05:${row.reviewId}`);
  if (!db) return { filter: content.length, label: content.length };
  const rows = db.prepare(`SELECT a.outcome, EXISTS (SELECT 1 FROM review_code c WHERE c.review_key = j.value AND c.codebook_version = @codebook) labelled
    FROM json_each(@keys) j LEFT JOIN review_filter_assessment a ON a.review_key = j.value AND a.policy_version = @policy`)
    .all({ keys: JSON.stringify(content), codebook: v.codebook, policy: v.filterPolicy }) as { outcome: string | null; labelled: number | bigint }[];
  const allowed = allowedOutcomes(settings);
  return { filter: rows.filter(row => row.outcome === null).length,
    label: rows.filter(row => !Number(row.labelled) && (row.outcome === null || allowed.includes(row.outcome))).length };
}
function plan(run: string, db: BetterSqlite3.Database | null, source: VerifiedModuleReviewCollection, v: ReviewProcessVersions, settings: ReviewProcessSettings): ReviewProcessPlan {
  const calls = plannedCalls(db, source, v, settings);
  const filter = round2(calls.filter * settings.feeUsdPerCall.filter), label = round2(calls.label * settings.feeUsdPerCall.label);
  const fee: ReviewProcessFee = { currency: 'USD', filter, label, total: round2(filter + label), basis: 'ESTIMATE' };
  return { format: 'review-process-plan-v1', runId: basename(run), sourceSha256: source.sourceSha256, versions: v, calls, fee,
    planSha256: sha256(canonicalJson({ format: 'review-process-plan-identity-v1', sourceSha256: source.sourceSha256, versions: v })) };
}

interface Counts {
  rows: number; saved: number; assessed: number; keep: number; exclude: number; unresolved: number; noContent: number;
  eligible: number; labelled: number; newLabelsOnNotAllowed: number; olderLabelsOnNotAllowed: number;
}
function counts(db: BetterSqlite3.Database | null, run: string, source: VerifiedModuleReviewCollection, v: ReviewProcessVersions, settings: ReviewProcessSettings, since: string | null): Counts {
  const zero: Counts = { rows: source.rows.length, saved: 0, assessed: 0, keep: 0, exclude: 0, unresolved: 0, noContent: 0, eligible: 0, labelled: 0,
    newLabelsOnNotAllowed: 0, olderLabelsOnNotAllowed: 0 };
  if (!db) return zero;
  const row = db.prepare(`SELECT count(*) saved, count(a.review_key) assessed, coalesce(sum(a.outcome = 'KEEP'), 0) keep, coalesce(sum(a.outcome = 'EXCLUDE'), 0) exclude,
      coalesce(sum(a.outcome = 'UNRESOLVED'), 0) unresolved, coalesce(sum(a.outcome = 'NO_CONTENT'), 0) noContent,
      coalesce(sum(a.outcome IN (SELECT value FROM json_each(@allowed))), 0) eligible,
      coalesce(sum(a.outcome IN (SELECT value FROM json_each(@allowed)) AND EXISTS (SELECT 1 FROM review_code c WHERE c.review_key = rr.review_key AND c.codebook_version = @codebook)), 0) labelled,
      coalesce(sum(a.outcome NOT IN (SELECT value FROM json_each(@allowed)) AND EXISTS (SELECT 1 FROM review_code c WHERE c.review_key = rr.review_key
        AND c.codebook_version = @codebook AND c.origin = 'APP_JEV' AND c.coded_at >= @since)), 0) newer,
      coalesce(sum(a.outcome NOT IN (SELECT value FROM json_each(@allowed)) AND EXISTS (SELECT 1 FROM review_code c WHERE c.review_key = rr.review_key
        AND c.codebook_version = @codebook AND c.coded_at < @since)), 0) older
    FROM run_review rr LEFT JOIN review_filter_assessment a ON a.review_key = rr.review_key AND a.policy_version = @policy
    WHERE rr.run_id = @dataset`).get({ dataset: datasetId(run, source.sourceSha256), policy: v.filterPolicy, codebook: v.codebook,
    allowed: JSON.stringify(allowedOutcomes(settings)), since: since ?? '9999' }) as Record<string, number | bigint>;
  const n = (key: string) => Number(row[key]);
  return { ...zero, saved: n('saved'), assessed: n('assessed'), keep: n('keep'), exclude: n('exclude'), unresolved: n('unresolved'), noContent: n('noContent'),
    eligible: n('eligible'), labelled: n('labelled'), newLabelsOnNotAllowed: n('newer'), olderLabelsOnNotAllowed: n('older') };
}
const savedReceipt = (db: BetterSqlite3.Database | null, source: VerifiedModuleReviewCollection) => {
  if (!db || !moduleImportReceipt(db, source)) return null;
  const row = db.prepare('SELECT receipt_json FROM raw_db_module_review_import WHERE source_sha256=?').get(source.sourceSha256) as { receipt_json: string };
  return JSON.parse(row.receipt_json) as { rowCount: number; reviewsInserted: number; reviewsAlreadyPresent: number; firstVersionDiffers: number };
};

const check = (id: ReviewProcessCheck['id'], ok: boolean, got: string): ReviewProcessCheck => ({ id, ok, level: 'error', got });
function gateFile(run: string, settings: ReviewProcessSettings, sourceSha256: string, checks: ReviewProcessCheck[], error: ReviewProcessErrorCode | null,
  outputSha256: string | null): ReviewProcessGateFile {
  const pass = error === null && checks.every(c => c.ok || c.level === 'warn');
  return { format: 'handoff-v1', module: 'M4', runId: basename(run), skillVersion: settings.skillVersion, verdict: pass ? 'PASS' : 'FAIL',
    inputSha256: sourceSha256, outputSha256, checks, errorCode: pass ? null : error ?? 'GATE_FAILED', next: null };
}

export interface ReviewProcessDeps {
  settings: ReviewProcessSettings;
  /** Null when Jev is disabled or not configured: the input gate then fails with JEV_DISABLED before any write. */
  client: TypesafeJevClient | null;
  /** When given, a different plan identity is refused before any call. */
  planSha256?: string | undefined;
}
export function reviewProcessJevClient(environment: NodeJS.ProcessEnv): TypesafeJevClient | null {
  try { const configuration = typesafeJevConfigurationFromEnvironment(environment); return configuration.enabled ? new TypesafeJevClient(configuration) : null; }
  catch { return null; }
}

async function stageAttempt(run: string, sourceSha256: string, stage: Stage, attempt: ReviewProcessStageAttempt): Promise<void> {
  const path = `${folder(sourceSha256)}/${stage}.json`;
  const prior = await readOptional<ReviewProcessStageFile>(run, path, 'stageFile');
  await writeAtomic(run, path, 'stageFile', { format: 'review-process-stage-v1', runId: basename(run), sourceSha256, stage,
    attempts: [...prior?.attempts ?? [], attempt] } satisfies ReviewProcessStageFile);
}

/**
 * Runs save → filter → label for one verified M3 source and writes the gates and receipts under `m4/<sourceSha256>/`.
 * Each pass runs again while work is left and no call failed (the 1,500-call cap per pass stays). A failed Jev call is
 * retried up to settings.maxRetries times per stage; a retry pays only for the reviews that are left. LABELS_BUSY waits
 * and retries without failing. The caller holds the run lock.
 */
export async function runReviewProcess(run: string, sourceSha256: string, deps: ReviewProcessDeps): Promise<ReviewProcessStateRecord> {
  const { settings, client } = deps, base = folder(sourceSha256);
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new ModuleError('REVIEW_DATA_INVALID', 2);
  const source = (await discoverModuleReviewSources(run)).find(s => s.sourceSha256 === sourceSha256 && s.gateVerdict === 'PASS' && s.status === 'SUCCEEDED');
  if (!source) throw new ModuleError('REVIEW_SOURCE_CHANGED', 23);
  const prior = await readOptional<ReviewProcessStateRecord>(run, `${base}/state.json`, 'stateRecord');
  if (prior?.status === 'RUNNING' && prior.pid !== process.pid && prior.pid !== process.ppid && pidLive(prior.pid)) throw new ModuleError('RUN_BUSY', 24);
  let state: ReviewProcessStateRecord = { format: 'review-process-state-v1', runId: basename(run), sourceSha256, status: 'RUNNING', stage: 'save', pid: process.pid,
    startedAt: now(), finishedAt: null, retries: 0, errorCode: null, waiting: null };
  const publish = async (change: Partial<ReviewProcessStateRecord>) => { state = { ...state, ...change }; await writeAtomic(run, `${base}/state.json`, 'stateRecord', state); };
  await publish({});

  const v = await versions(settings, client?.model ?? 'none');
  let db: BetterSqlite3.Database | null = null, error: string | null = null;
  const lastFailed: Partial<Record<Stage, boolean>> = {};
  try {
    // Input gate (V1 to V5): checked before any write or call.
    const checks: ReviewProcessCheck[] = [check('source_unchanged', true, 'match')];
    try { if (await reviewDataReadonly()) throw new ModuleError('READONLY_ON'); db = configuredDatabase(false); }
    catch (failure) { error = errorCode(failure); }
    let stored: 'new' | 'saved' | null = null, idsError: string | null = null, savedError: string | null = null;
    if (db) {
      try { stored = moduleImportReceipt(db, source) ? 'saved' : 'new'; } catch (failure) { savedError = errorCode(failure); }
      if (stored === 'new') try { assertModuleImportable(db, source, await moduleProductNames(run, source)); } catch (failure) { idsError = errorCode(failure); }
    }
    error ??= idsError ?? savedError;
    checks.push(check('review_ids_valid', db !== null && !idsError, db ? idsError ?? `${source.rows.length} rows` : 'not checked'),
      check('not_saved_twice', db !== null && !savedError, savedError ?? stored ?? error ?? 'not checked'));
    if (!client) error ??= 'JEV_DISABLED';
    checks.push(check('jev_ready_versions_fixed', client !== null, client ? `${v.filterPolicy} / ${v.codebook}` : 'jev disabled'));
    const planned = plan(run, db, source, v, settings);
    if (deps.planSha256 !== undefined && deps.planSha256 !== planned.planSha256) error ??= 'GATE_FAILED';
    await writeAtomic(run, `${base}/plan.json`, 'plan', planned);
    checks.push(check('fee_estimate_recorded', true, `${planned.fee.total} USD`));
    await writeAtomic(run, `${base}/gate-in.json`, 'gateFile', gateFile(run, settings, sourceSha256, checks, error ? contractError(error) : null, planned.planSha256));
    if (error) { state = { ...state, stage: null }; return await finish(); }

    // Stage 4.1 save: idempotent, no call.
    const startedAt = now();
    try {
      const saved = await saveModuleReviewData(run, sourceSha256);
      await stageAttempt(run, sourceSha256, 'save', { startedAt, finishedAt: now(), errorCode: null, passes: [{ ...saved }] });
    } catch (failure) {
      error = errorCode(failure);
      await stageAttempt(run, sourceSha256, 'save', { startedAt, finishedAt: now(), errorCode: error, passes: [] });
      return await finish();
    }
    const artifacts = new ContentAddressedArtifactStore(configuration()!.artifactRoot);
    const keyword = (await readRunTracking(run)).primaryKeyword;
    const passes: Record<'filter' | 'label', () => Promise<{ failed: unknown; called: number; left: number; result: Record<string, unknown> }>> = {
      filter: async () => { const r = await filterReviewsInDbV1(db!, artifacts, client, { runId: datasetId(run, sourceSha256), policyVersion: v.filterPolicy });
        return { failed: r.failed, called: r.called, left: r.notAssessed, result: { ...r } }; },
      label: async () => { const r = await labelReviewsInDbV1(db!, artifacts, client, { runId: datasetId(run, sourceSha256), captureRoot: run,
        scope: { keywords: keyword ? [keyword] : [], category: null }, filterPolicyVersion: v.filterPolicy, filterOutcomes: allowedOutcomes(settings) });
        return { failed: r.failed, called: r.called, left: r.skipped, result: { ...r } }; },
    };
    for (const stage of ['filter', 'label'] as const) {
      await publish({ stage });
      let retries = 0;
      for (;;) {
        const attemptStart = now(), results: Record<string, unknown>[] = [];
        let failed = false;
        for (;;) {
          let pass: Awaited<ReturnType<typeof passes.filter>>;
          try { pass = await passes[stage](); }
          catch (failure) {
            if (!(failure instanceof LabelsBusyError)) throw failure;
            await publish({ waiting: 'LABELS_BUSY' }); await wait(settings.busyWaitSeconds); continue;
          }
          if (state.waiting) await publish({ waiting: null });
          results.push(pass.result);
          if (pass.failed) { failed = true; break; }
          if (!pass.left || !pass.called) break;
        }
        await stageAttempt(run, sourceSha256, stage, { startedAt: attemptStart, finishedAt: now(), errorCode: failed ? 'JEV_CALL_FAILED' : null, passes: results });
        lastFailed[stage] = failed;
        if (!failed) break;
        if (retries >= settings.maxRetries) { error = 'JEV_CALL_FAILED'; return await finish(); }
        await wait(settings.retryWaitSeconds[Math.min(retries, settings.retryWaitSeconds.length - 1)] ?? 0);
        retries++;
        await publish({ retries: state.retries + 1 });
      }
      const c = counts(db, run, source, v, settings, state.startedAt);
      if (stage === 'filter' ? c.assessed !== c.saved : c.labelled !== c.eligible) { error = 'GATE_FAILED'; return await finish(); }
    }
    return await finish();
  } catch (failure) {
    error = errorCode(failure);
    return await finish();
  } finally { db?.close(); }

  /** Output gate (R1 to R6) and the receipt; written on every end so a stop is explained. */
  async function finish(): Promise<ReviewProcessStateRecord> {
    const c = counts(db, run, source!, v, settings, state.startedAt), saved = savedReceipt(db, source!);
    const planned = await readOptional<ReviewProcessPlan>(run, `${base}/plan.json`, 'plan');
    const calls = { filter: 0, label: 0 };
    for (const stage of ['filter', 'label'] as const) {
      const file = await readOptional<ReviewProcessStageFile>(run, `${base}/${stage}.json`, 'stageFile');
      for (const attempt of file?.attempts.filter(a => a.startedAt >= state.startedAt) ?? []) for (const pass of attempt.passes) calls[stage] += (pass as { called: number }).called;
    }
    const receipt: ReviewProcessReceipt = { format: 'review-process-receipt-v1', runId: basename(run), sourceSha256, datasetId: datasetId(run, sourceSha256),
      planSha256: planned?.planSha256 ?? sha256(''), versions: v, fee: planned?.fee ?? { currency: 'USD', filter: 0, label: 0, total: 0, basis: 'ESTIMATE' },
      counts: { rows: c.rows, saved: c.saved, inserted: saved?.reviewsInserted ?? 0, alreadyPresent: saved?.reviewsAlreadyPresent ?? 0,
        firstVersionDiffers: saved?.firstVersionDiffers ?? 0, keep: c.keep, exclude: c.exclude, unresolved: c.unresolved, noContent: c.noContent,
        labelEligible: c.eligible, labelled: c.labelled, unresolvedSkipped: settings.labelUnresolved ? 0 : c.unresolved, olderLabelsOnNotKept: c.olderLabelsOnNotAllowed },
      calls, retries: state.retries, startedAt: state.startedAt, finishedAt: now() };
    const receiptBytes = await writeAtomic(run, `${base}/receipt.json`, 'receipt', receipt);
    const checks = [
      check('all_rows_saved', c.saved === c.rows && saved?.rowCount === c.rows, `${c.saved}/${c.rows}`),
      check('one_filter_result_each', c.saved > 0 && c.assessed === c.saved, `${c.assessed}/${c.saved}`),
      check('kept_all_labelled', c.assessed === c.saved && c.labelled === c.eligible, `${c.labelled}/${c.eligible}`),
      check('no_new_label_on_excluded', c.newLabelsOnNotAllowed === 0, `${c.newLabelsOnNotAllowed}`),
      check('no_failed_jev_call', !lastFailed.filter && !lastFailed.label && error !== 'JEV_CALL_FAILED', error === 'JEV_CALL_FAILED' ? 'failed' : '0'),
      check('receipt_complete', true, `${receipt.counts.labelled} labelled`),
    ];
    const gate = gateFile(run, settings, sourceSha256, checks, error ? contractError(error) : null, sha256(receiptBytes));
    await writeAtomic(run, `${base}/gate.json`, 'gateFile', gate);
    await publish({ status: gate.verdict, finishedAt: now(), pid: null, waiting: null, errorCode: gate.errorCode,
      stage: gate.verdict === 'PASS' ? null : state.stage });
    return state;
  }
}

/** The automatic start after an M3 PASS: only for runs created by this release, only for the source that just passed. */
export async function runReviewProcessAfterM3(run: string, attempt: string, deps: ReviewProcessDeps): Promise<ReviewProcessStateRecord | null> {
  if (!await reviewProcessAutoRun(run)) return null;
  const source = (await discoverModuleReviewSources(run)).find(s => s.gateVerdict === 'PASS' && s.status === 'SUCCEEDED'
    && (attempt === 'legacy' ? s.kind === 'legacy' : s.kind === 'custom' && s.attemptId === attempt));
  return source ? runReviewProcess(run, source.sourceSha256, deps) : null;
}

/** The read-only check before a detached start: the source is a current M3 PASS and its step 4 is not running. */
export async function reviewProcessStartable(run: string, sourceSha256: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new ModuleError('REVIEW_DATA_INVALID', 2);
  if (await reviewDataReadonly()) throw new ModuleError('READONLY_ON');
  const source = (await discoverModuleReviewSources(run)).find(s => s.sourceSha256 === sourceSha256 && s.gateVerdict === 'PASS' && s.status === 'SUCCEEDED');
  if (!source) throw new ModuleError('REVIEW_SOURCE_CHANGED', 23);
  const state = await readOptional<ReviewProcessStateRecord>(run, `${folder(sourceSha256)}/state.json`, 'stateRecord');
  if (state?.status === 'RUNNING' && pidLive(state.pid)) throw new ModuleError('RUN_BUSY', 24);
}

export function reviewProcessStart(run: string, state: ReviewProcessStateRecord): ReviewProcessStart {
  return validateReviewProcess<ReviewProcessStart>('start', { format: 'review-process-start-v1', runId: basename(run), sourceSha256: state.sourceSha256,
    status: state.status, pid: process.pid });
}

function summary(gate: ReviewProcessGateFile | null): ReviewProcessGateSummary | null {
  return gate ? { verdict: gate.verdict, checks: gate.checks } : null;
}

/** Read-only `review-process-view-v1`: no Jev call, no write; the DB is opened read-only. Lists the current M3 PASS sources, newest first. */
export async function reviewProcessView(run: string, settings: ReviewProcessSettings): Promise<ReviewProcessView> {
  const autoRun = await reviewProcessAutoRun(run), v = await versions(settings, 'none');
  let db: BetterSqlite3.Database | null = null;
  try {
    const config = configuration();
    if (config && (await stat(config.artifactRoot)).isDirectory()) db = configuredDatabase(true);
  } catch { db = null; }
  try {
    const sources = (await discoverModuleReviewSources(run)).filter(s => s.gateVerdict === 'PASS' && s.status === 'SUCCEEDED')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    const views: ReviewProcessSource[] = [];
    for (const source of sources) {
      const base = folder(source.sourceSha256);
      const record = await readOptional<ReviewProcessStateRecord>(run, `${base}/state.json`, 'stateRecord');
      const live = record?.status === 'RUNNING' && pidLive(record.pid);
      const state = !record ? (autoRun ? 'IDLE' : 'NOT_APPLICABLE') : live ? 'RUNNING' : record.status === 'RUNNING' ? 'FAIL' : record.status;
      const failedStage = state === 'FAIL' ? record?.stage ?? null : null, runningStage = state === 'RUNNING' ? record!.stage : null;
      const c = counts(db, run, source, v, settings, record?.startedAt ?? null), saved = savedReceipt(db, source);
      const derived = (stage: Stage, done: boolean) => done ? 'PASS' : runningStage === stage ? 'RUNNING' : failedStage === stage ? 'FAIL' : 'IDLE';
      const savePass = saved !== null, filterPass = savePass && c.assessed === c.saved, labelPass = filterPass && c.labelled === c.eligible;
      const planned = await readOptional<ReviewProcessPlan>(run, `${base}/plan.json`, 'plan') ?? plan(run, db, source, v, settings);
      views.push({ sourceSha256: source.sourceSha256, state, errorCode: state === 'FAIL' ? record?.errorCode ?? 'GATE_FAILED' : null,
        startedAt: record?.startedAt ?? null, finishedAt: state === 'RUNNING' ? null : record?.finishedAt ?? null, retries: record?.retries ?? 0,
        canResume: state === 'FAIL' || state === 'NOT_APPLICABLE', fee: planned.fee,
        stages: {
          save: { state: derived('save', savePass), total: c.rows, done: c.saved, inserted: saved?.reviewsInserted ?? 0, alreadyPresent: saved?.reviewsAlreadyPresent ?? 0 },
          filter: { state: derived('filter', filterPass), total: c.rows, done: c.assessed, keep: c.keep, exclude: c.exclude, unresolved: c.unresolved, noContent: c.noContent },
          label: { state: derived('label', labelPass), total: filterPass ? c.eligible : null, done: c.labelled,
            unresolvedSkipped: filterPass ? (settings.labelUnresolved ? 0 : c.unresolved) : null },
        },
        gates: { in: record ? summary(await readOptional<ReviewProcessGateFile>(run, `${base}/gate-in.json`, 'gateFile')) : null,
          out: record && state !== 'RUNNING' ? summary(await readOptional<ReviewProcessGateFile>(run, `${base}/gate.json`, 'gateFile')) : null } });
    }
    return validateReviewProcess<ReviewProcessView>('view', { format: 'review-process-view-v1', runId: basename(run), autoRun,
      labelUnresolved: settings.labelUnresolved, sources: views });
  } finally { db?.close(); }
}


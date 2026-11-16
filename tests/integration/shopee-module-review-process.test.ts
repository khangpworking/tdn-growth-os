/**
 * Step 4 (save → Jev filter → Jev label) contract rows on a real migrated SQLite file and synthetic module runs.
 * Jev is a fake client; any real network call fails the test.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, mock, type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { discoverModuleReviewSources } from '../../src/modules/foundation/shopee-module-review-data.js';
import { saveModuleReviewData } from '../../src/modules/raw-db/module-shopee-reviews.js';
import { labelReviewsInDbV1 } from '../../src/modules/raw-db/review-labeller.js';
import {
  datasetId, reviewProcessSettings, reviewProcessView, runReviewProcess, runReviewProcessAfterM3, validateReviewProcess, type ReviewProcessSettings,
} from '../../src/modules/raw-db/module-review-process.js';
import { REVIEW_FILTER_POLICY_VERSION } from '../../src/modules/raw-db/review-filter.js';
import { LINKS, addCustomAttempt, createModuleRun, moduleRow, writeCanonical } from '../fixtures/shopee-module-review-data.js';
import { labelsGolden, seedLabelCode, seedLabelCodebook, seedLabelReview } from '../fixtures/raw-db-v1-labels.js';
import { holdLabelsLock, until } from '../fixtures/raw-db-v1-y2.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

const MODEL = 'synthetic-jev-review-process';
const POLICY = '2026-11-04.2';
const envKeys = ['TDN_WORKSPACE_DB', 'TDN_ARTIFACT_ROOT', 'SHOPEE_FLOW_STATE', 'TDN_SHOPEE_FLOW_READONLY'] as const;
type Wire = { questions: Record<string, unknown>; state: Record<string, string> };
type Reply = { status: number; body: string } | 'FAIL';

const filterAnswer = (exclude: boolean) => ({ status: 200, body: JSON.stringify({ model: MODEL, answers: {
  LOC: { type: 'choice', choice: exclude ? 'LOAI' : 'GIU', confidence: 0.9,
    probabilities: exclude ? { GIU: 0.05, LOAI: 0.9, RIENG: 0.05 } : { GIU: 0.8, LOAI: 0.1, RIENG: 0.1 } },
  CHE: { type: 'choice', choice: 'KHONG', probabilities: { CO: 0.1, KHONG: 0.9, RIENG: 0 }, confidence: 0.9 } } }) });
const labelAnswer = () => ({ status: 200, body: labelsGolden.no_theme_response.replaceAll(labelsGolden.model, MODEL) });

/** Filter questions carry LOC; label questions carry theme codes. A review whose text holds "off-topic" is excluded. */
function fakeJev(respond: (kind: 'filter' | 'label', wire: Wire, ordinal: number) => Reply = () => 'FAIL', model = MODEL) {
  const calls: { kind: 'filter' | 'label'; text: string }[] = [];
  const client = new TypesafeJevClient({ enabled: true, apiKey: 'synthetic-unused-key', model }, async (_url, init) => {
    const wire = JSON.parse(String(init?.body)) as Wire;
    const kind = 'LOC' in wire.questions ? 'filter' : 'label';
    const text = String(Object.values(wire.state)[0]);
    calls.push({ kind, text });
    const reply = respond(kind, wire, calls.length);
    if (reply === 'FAIL') return new Response('unavailable', { status: 503 });
    return new Response(reply.body, { status: reply.status, headers: { 'content-type': 'application/json' } });
  });
  return { client, calls };
}
const honest = (kind: 'filter' | 'label', wire: Wire): Reply => kind === 'filter' ? filterAnswer(String(Object.values(wire.state)[0]).includes('off-topic')) : labelAnswer();

async function workspace(t: TestContext) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-process-'));
  const databasePath = path.join(base, 'app.sqlite'), artifactRoot = path.join(base, 'artifacts'), stateRoot = path.join(base, 'state');
  await fs.mkdir(artifactRoot); await fs.mkdir(stateRoot);
  const db = new Database(databasePath); applyMigrations(db); db.close();
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { TDN_WORKSPACE_DB: databasePath, TDN_ARTIFACT_ROOT: artifactRoot, SHOPEE_FLOW_STATE: stateRoot });
  delete process.env.TDN_SHOPEE_FLOW_READONLY;
  t.after(async () => {
    for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, databasePath, open: () => new Database(databasePath) };
}

/** A new-release run (m4/auto.json) whose M3 custom attempt passed with the given comments, one list per link (two links). */
async function passedRun(base: string, runId: string, comments: string[][], { auto = true } = {}) {
  const run = await createModuleRun(base, { runId });
  await addCustomAttempt(run, { rowsByLink: comments.map((texts, link) => texts.map((comment, i) =>
    moduleRow(LINKS[link]!, `${runId}-${link}-${i}`, { comment, attributes: [], sourceRow: i, ratingStar: 5 }))) });
  if (auto) await writeCanonical(path.join(run.runDir, 'm4', 'auto.json'), { format: 'review-process-auto-v1', runId, createdAt: '2026-11-16T00:00:00.000Z' });
  const [source] = await discoverModuleReviewSources(run.runDir);
  return { runDir: run.runDir, sourceSha256: source!.sourceSha256 };
}
async function settings(change: Partial<ReviewProcessSettings> = {}): Promise<ReviewProcessSettings> {
  return { ...await reviewProcessSettings(), retryWaitSeconds: [0], busyWaitSeconds: 0, ...change };
}
const readM4 = async (runDir: string, sha: string, name: string) => JSON.parse(await fs.readFile(path.join(runDir, 'm4', sha, name), 'utf8'));
const scalar = (db: Database.Database, sql: string, ...args: unknown[]) => Number(db.prepare(sql).pluck().get(...args));

test('Q1-1 the labeller with scope labels a module dataset that has no research-run row', async t => {
  const f = await workspace(t);
  const db = f.open(); t.after(() => db.close());
  seedLabelReview(db, 'module-m3:synthetic:dataset', 'scope-a');
  const jev = fakeJev(() => labelAnswer());
  await assert.rejects(labelReviewsInDbV1(db, null, null, { runId: 'module-m3:synthetic:dataset', dryRun: true, captureRoot: f.base }), /RAW_DB_RUN_NOT_FOUND/);
  const result = await labelReviewsInDbV1(db, new ContentAddressedArtifactStore(path.join(f.base, 'artifacts')), jev.client,
    { runId: 'module-m3:synthetic:dataset', captureRoot: f.base, scope: { keywords: ['synthetic jar'], category: null } });
  assert.deepEqual([result.labelled, result.noTheme, jev.calls.length], [1, 1, 1]);
});

test('Q1-2 the labeller with filterPolicyVersion labels only the allowed filter outcomes (KEEP by default, UNRESOLVED when allowed)', async t => {
  const f = await workspace(t);
  const db = f.open(); t.after(() => db.close());
  const run = 'module-m3:synthetic:filtered';
  const keys = ['keep', 'exclude', 'unresolved', 'unassessed'].map(id => seedLabelReview(db, run, id));
  const assess = db.prepare(`INSERT INTO review_filter_assessment(review_key,policy_version,policy_sha256,run_id,outcome,reason,p_keep,p_exclude,p_unresolved,p_complaint,
    rating_star,model,text_sha256,response_sha256,assessed_at) VALUES (?,?,?,?,?,?,0,0,0,0,5,'m',?,?,'2026-11-16T00:00:00.000Z')`);
  for (const [index, outcome] of ['KEEP', 'EXCLUDE', 'UNRESOLVED'].entries()) assess.run(keys[index], POLICY, 'a'.repeat(64), run, outcome, 'JEV_KEEP', 'b'.repeat(64), 'c'.repeat(64));
  const input = { runId: run, captureRoot: f.base, scope: { keywords: [], category: null }, filterPolicyVersion: POLICY, dryRun: true };
  assert.equal((await labelReviewsInDbV1(db, null, null, input)).eligible, 1);
  assert.equal((await labelReviewsInDbV1(db, null, null, { ...input, filterOutcomes: ['KEEP', 'UNRESOLVED'] })).eligible, 2);
  assert.equal((await labelReviewsInDbV1(db, null, null, { runId: run, captureRoot: f.base, scope: input.scope, dryRun: true })).eligible, 4, 'default behaviour unchanged');
});

test('Q1-5 gates and receipt: a full pass saves, filters, labels KEEP only, and writes PASS gates in the contract order', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-pass', [['Good jar', 'off-topic spam'], ['Fine lid', 'Neat cap']]);
  // An older label on a review the filter will exclude (owner rule: review_code rows are immutable).
  await saveModuleReviewData(runDir, sourceSha256);
  const seed = f.open(); seedLabelCodebook(seed); seedLabelCode(seed, 'S05:run-pass-0-1'); seed.close();
  const jev = fakeJev(honest);
  const state = await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: jev.client });
  assert.equal(state.status, 'PASS');
  assert.deepEqual(jev.calls.map(c => c.kind), ['filter', 'filter', 'filter', 'filter', 'label', 'label', 'label'], 'the EXCLUDE review is not labelled');
  const gateIn = await readM4(runDir, sourceSha256, 'gate-in.json'), gate = await readM4(runDir, sourceSha256, 'gate.json');
  assert.deepEqual(gateIn.checks.map((c: { id: string; ok: boolean }) => [c.id, c.ok]), [['source_unchanged', true], ['review_ids_valid', true],
    ['not_saved_twice', true], ['jev_ready_versions_fixed', true], ['fee_estimate_recorded', true]]);
  assert.deepEqual([gate.format, gate.module, gate.verdict, gate.inputSha256, gate.errorCode], ['handoff-v1', 'M4', 'PASS', sourceSha256, null]);
  assert.deepEqual(gate.checks.map((c: { id: string; ok: boolean; got: string }) => [c.id, c.ok, c.got]), [['all_rows_saved', true, '4/4'],
    ['one_filter_result_each', true, '4/4'], ['kept_all_labelled', true, '3/3'], ['no_new_label_on_excluded', true, '0'],
    ['no_failed_jev_call', true, '0'], ['receipt_complete', true, '3 labelled']]);
  const receipt = await readM4(runDir, sourceSha256, 'receipt.json');
  assert.deepEqual(receipt.counts, { rows: 4, saved: 4, inserted: 4, alreadyPresent: 0, firstVersionDiffers: 0, keep: 3, exclude: 1, unresolved: 0,
    noContent: 0, labelEligible: 3, labelled: 3, unresolvedSkipped: 0, olderLabelsOnNotKept: 1 });
  assert.deepEqual(receipt.calls, { filter: 4, label: 3 });
  assert.equal(receipt.fee.basis, 'ESTIMATE');
  const db = f.open(); t.after(() => db.close());
  assert.equal(scalar(db, `SELECT count(*) FROM review_code WHERE origin='APP_JEV' AND review_key = 'S05:run-pass-0-1'`), 0);

  const view = await reviewProcessView(runDir, await settings());
  validateReviewProcess('view', view);
  assert.deepEqual([view.autoRun, view.labelUnresolved, view.sources.length], [true, false, 1]);
  const [source] = view.sources;
  assert.deepEqual([source!.state, source!.errorCode, source!.canResume, source!.gates.out?.verdict], ['PASS', null, false, 'PASS']);
  assert.deepEqual(source!.stages, {
    save: { state: 'PASS', total: 4, done: 4, inserted: 4, alreadyPresent: 0 },
    filter: { state: 'PASS', total: 4, done: 4, keep: 3, exclude: 1, unresolved: 0, noContent: 0 },
    label: { state: 'PASS', total: 3, done: 3, unresolvedSkipped: 0 } });
});

test('Q1-3 and retries: a filter call that keeps failing is retried 3 times, then step 4 stops before labels with gate FAIL', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-fail', [['Good jar'], ['Nice lid']]);
  const jev = fakeJev(() => 'FAIL');
  const state = await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: jev.client });
  assert.deepEqual([state.status, state.stage, state.retries, state.errorCode], ['FAIL', 'filter', 3, 'JEV_CALL_FAILED']);
  assert.deepEqual(jev.calls.map(c => c.kind), ['filter', 'filter', 'filter', 'filter']);
  assert.equal((await readM4(runDir, sourceSha256, 'filter.json')).attempts.length, 4);
  await assert.rejects(fs.stat(path.join(runDir, 'm4', sourceSha256, 'label.json')));
  const gate = await readM4(runDir, sourceSha256, 'gate.json');
  assert.deepEqual([gate.verdict, gate.errorCode], ['FAIL', 'JEV_CALL_FAILED']);
  const [source] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([source!.state, source!.canResume, source!.stages.save.state, source!.stages.filter.state, source!.stages.label.state, source!.stages.label.total],
    ['FAIL', true, 'PASS', 'FAIL', 'IDLE', null]);
});

test('Q1-4 a resume pays only for the reviews left; a run after PASS makes no call and no row', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-resume', [['Good jar', 'Nice lid'], ['Fine box']]);
  const first = fakeJev((kind, wire, n) => n === 2 ? 'FAIL' : honest(kind, wire));
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings({ maxRetries: 0 }), client: first.client })).status, 'FAIL');
  assert.equal(first.calls.length, 2);
  const second = fakeJev(honest);
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: second.client })).status, 'PASS');
  assert.deepEqual(second.calls.map(c => c.kind), ['filter', 'filter', 'label', 'label', 'label'], 'the assessed review is not asked again');
  const db = f.open(); t.after(() => db.close());
  const rows = () => scalar(db, 'SELECT (SELECT count(*) FROM review_filter_assessment) + (SELECT count(*) FROM review_code) + (SELECT count(*) FROM run_review)');
  const before = rows();
  const third = fakeJev(honest);
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: third.client })).status, 'PASS');
  assert.deepEqual([third.calls.length, rows()], [0, before]);
});

test('Q1-6 a disabled Jev is refused before any write; a start whose plan differs from the plan work began under is refused before any call', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-plan', [['Good jar'], ['Nice lid']]);
  const disabled = await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: null });
  assert.deepEqual([disabled.status, disabled.errorCode], ['FAIL', 'JEV_DISABLED']);
  const db = f.open(); t.after(() => db.close());
  assert.equal(scalar(db, 'SELECT count(*) FROM run_review'), 0, 'nothing saved');
  const gateIn = await readM4(runDir, sourceSha256, 'gate-in.json');
  assert.deepEqual(gateIn.checks.find((c: { id: string }) => c.id === 'jev_ready_versions_fixed'), { id: 'jev_ready_versions_fixed', ok: false, level: 'error', got: 'jev disabled' });

  const first = fakeJev(() => 'FAIL');
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings({ maxRetries: 0 }), client: first.client })).errorCode, 'JEV_CALL_FAILED',
    'a refused input gate binds no plan');
  const recorded = await readM4(runDir, sourceSha256, 'plan.json');
  const other = fakeJev(honest, 'synthetic-other-model');
  const changed = await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: other.client });
  assert.deepEqual([changed.status, changed.errorCode, other.calls.length], ['FAIL', 'GATE_FAILED', 0]);
  assert.deepEqual((await readM4(runDir, sourceSha256, 'gate-in.json')).checks.at(-1), { id: 'fee_estimate_recorded', ok: false, level: 'error', got: 'plan changed' });
  assert.deepEqual(await readM4(runDir, sourceSha256, 'plan.json'), recorded, 'the recorded plan is kept');
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: fakeJev(honest).client })).status, 'PASS', 'the same plan resumes');
});

test('filter completion needs the recorded policy hash: assessments under the same version but another policy text never pass the filter stage', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-policy', [['Good jar'], ['Nice lid']]);
  await saveModuleReviewData(runDir, sourceSha256);
  const db = f.open(); t.after(() => db.close());
  const assess = db.prepare(`INSERT INTO review_filter_assessment(review_key,policy_version,policy_sha256,run_id,outcome,reason,p_keep,p_exclude,p_unresolved,p_complaint,
    rating_star,model,text_sha256,response_sha256,assessed_at) VALUES (?,?,?,?,'KEEP','JEV_KEEP',1,0,0,0,5,'m',?,?,'2026-11-16T00:00:00.000Z')`);
  for (const key of ['S05:run-policy-0-0', 'S05:run-policy-1-0']) assess.run(key, REVIEW_FILTER_POLICY_VERSION, 'f'.repeat(64), datasetId(runDir, sourceSha256), 'b'.repeat(64), 'c'.repeat(64));
  const jev = fakeJev(honest);
  const state = await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: jev.client });
  assert.deepEqual([state.status, state.stage, state.errorCode, jev.calls.length], ['FAIL', 'filter', 'GATE_FAILED', 0]);
  const [source] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([source!.state, source!.stages.filter.state, source!.stages.filter.done, source!.stages.label.state], ['FAIL', 'FAIL', 0, 'IDLE']);
});

test('a recorded PASS is shown as PASS only while the output gate passed and every DB-derived stage is complete', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-holds', [['Good jar'], ['Nice lid']]);
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: fakeJev(honest).client })).status, 'PASS');
  assert.equal((await reviewProcessView(runDir, await settings())).sources[0]!.state, 'PASS');
  const moved = path.join(f.base, 'other.sqlite'), other = new Database(moved); applyMigrations(other); other.close();
  process.env.TDN_WORKSPACE_DB = moved;
  const [empty] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([empty!.state, empty!.errorCode, empty!.canResume, empty!.stages.save.state], ['FAIL', 'GATE_FAILED', true, 'FAIL'], 'the DB no longer holds the step-4 rows');
  process.env.TDN_WORKSPACE_DB = f.databasePath;
  const gate = await readM4(runDir, sourceSha256, 'gate.json');
  await writeCanonical(path.join(runDir, 'm4', sourceSha256, 'gate.json'), { ...gate, verdict: 'FAIL', errorCode: 'GATE_FAILED' });
  const [failed] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([failed!.state, failed!.canResume, failed!.gates.out?.verdict], ['FAIL', true, 'FAIL']);
});

test('a recorded PASS needs gate.json outputSha256 to match receipt.json: a missing or changed receipt is FAIL (same rule as runs-progress)', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-receipt', [['Good jar'], ['Nice lid']]);
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: fakeJev(honest).client })).status, 'PASS');
  const file = path.join(runDir, 'm4', sourceSha256, 'receipt.json'), bytes = await fs.readFile(file);
  await fs.writeFile(file, `${bytes.toString('utf8').trimEnd()} \n`);
  const [changed] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([changed!.state, changed!.errorCode, changed!.canResume], ['FAIL', 'GATE_FAILED', true]);
  await fs.unlink(file);
  const [missing] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([missing!.state, missing!.errorCode, missing!.canResume], ['FAIL', 'GATE_FAILED', true]);
  await fs.writeFile(file, bytes);
  assert.equal((await reviewProcessView(runDir, await settings())).sources[0]!.state, 'PASS');
});

test('stages are judged at the recorded plan: changing labelUnresolved after a PASS keeps the view at PASS (same rule as runs-progress)', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-recorded', [['Good jar'], ['unsure lid']]);
  const unsure = { status: 200, body: JSON.stringify({ model: MODEL, answers: {
    LOC: { type: 'choice', choice: 'RIENG', confidence: 0.8, probabilities: { GIU: 0.1, LOAI: 0.1, RIENG: 0.8 } },
    CHE: { type: 'choice', choice: 'KHONG', probabilities: { CO: 0.1, KHONG: 0.9, RIENG: 0 }, confidence: 0.9 } } }) };
  const jev = fakeJev((kind, wire) => kind === 'filter' && String(Object.values(wire.state)[0]).includes('unsure') ? unsure : honest(kind, wire));
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings({ labelUnresolved: false }), client: jev.client })).status, 'PASS');
  const view = await reviewProcessView(runDir, await settings({ labelUnresolved: true }));
  const [source] = view.sources;
  assert.deepEqual([view.labelUnresolved, source!.state, source!.stages.label.state, source!.stages.label.total, source!.stages.label.unresolvedSkipped],
    [true, 'PASS', 'PASS', 1, 1], 'the UNRESOLVED review is not owed a label under the recorded plan');
});

test('a stop of the automatic start before any step-4 state is a FAIL with «Chạy tiếp»; the resume clears it', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-handoff', [['Good jar'], ['Nice lid']]);
  const [m3] = await discoverModuleReviewSources(runDir);
  await assert.rejects(runReviewProcessAfterM3(runDir, '22222222-2222-4222-8222-222222222222', { settings: await settings(), client: null }), /REVIEW_SOURCE_CHANGED/,
    'a passed M3 that is not a verified source is a stop, not a silent skip');
  const slip = JSON.parse(await fs.readFile(path.join(runDir, 'm3-custom', 'attempts', m3!.attemptId!, 'gate.json'), 'utf8'));
  // The link the flow script writes when process-auto fails (shopee_flow.py review_process_after_m3).
  await writeCanonical(path.join(runDir, 'm4', 'm3', `${m3!.attemptId}.json`), { format: 'review-process-link-v1', runId: 'run-handoff', m3: m3!.attemptId,
    m3OutputSha256: slip.outputSha256, sourceSha256: null, errorCode: 'REVIEW_PROCESS_FAILED', recordedAt: '2026-11-16T00:00:00+00:00' });
  const [stopped] = (await reviewProcessView(runDir, await settings())).sources;
  assert.deepEqual([stopped!.state, stopped!.errorCode, stopped!.canResume], ['FAIL', 'GATE_FAILED', true]);
  assert.equal((await runReviewProcess(runDir, sourceSha256, { settings: await settings(), client: fakeJev(honest).client })).status, 'PASS');
  const link = JSON.parse(await fs.readFile(path.join(runDir, 'm4', 'm3', `${m3!.attemptId}.json`), 'utf8'));
  assert.deepEqual([link.sourceSha256, link.errorCode], [sourceSha256, null]);
  assert.equal((await reviewProcessView(runDir, await settings())).sources[0]!.state, 'PASS');
});

test('LABELS_BUSY: while another pass holds the labels lock step 4 waits and then finishes with PASS', async t => {
  const f = await workspace(t);
  const { runDir, sourceSha256 } = await passedRun(f.base, 'run-busy', [['Good jar'], ['Nice lid']]);
  const release = holdLabelsLock({ databasePath: f.databasePath } as Parameters<typeof holdLabelsLock>[0]);
  t.after(release);
  const waited = until(async () => { try { return (await readM4(runDir, sourceSha256, 'state.json')).waiting === 'LABELS_BUSY'; } catch { return false; } },
    'step 4 records LABELS_BUSY', 30_000).then(release);
  const jev = fakeJev(honest);
  const state = await runReviewProcess(runDir, sourceSha256, { settings: await settings({ busyWaitSeconds: 0.2 }), client: jev.client });
  await waited;
  assert.deepEqual([state.status, state.retries, jev.calls.length, state.waiting], ['PASS', 0, 4, null]);
});

test('an old run (no m4/auto.json) reports autoRun false and NOT_APPLICABLE with «Chạy tiếp» available', async t => {
  const f = await workspace(t);
  const { runDir } = await passedRun(f.base, 'run-old', [['Good jar'], ['Nice lid']], { auto: false });
  const view = await reviewProcessView(runDir, await settings());
  assert.deepEqual([view.autoRun, view.sources[0]!.state, view.sources[0]!.canResume, view.sources[0]!.gates], [false, 'NOT_APPLICABLE', true, { in: null, out: null }]);
});

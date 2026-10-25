import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { mock, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import BetterSqlite3 from 'better-sqlite3';
import type { OperatorAppConfiguration } from '../../src/api/operator-app.js';
import { createVideoJobStore, type VideoJobKind, type VideoProjectState } from '../../src/modules/flow/video-jobs.js';
import { createVideoService } from '../../src/modules/flow/video-service.js';
import { openDatabase } from '../../src/platform/db/database.js';

// The operator has no runner option. Capture a fake spawn at the existing platform
// boundary before loading its default runner; restore the builtin immediately.
// No real ffmpeg, module-loader flags, or new production hooks are needed.
const realSpawn = childProcess.spawn;
let nextChild: childProcess.ChildProcess | undefined;
let platformCalls = 0;
let loadingModules = true;
const spawnMock = mock.method(childProcess, 'spawn', ((...args: Parameters<typeof childProcess.spawn>) => {
  // tsx may start its local TypeScript transformer during these imports.
  if (loadingModules) return realSpawn(...args);
  platformCalls++;
  const child = nextChild;
  nextChild = undefined;
  if (!child) throw new Error('Unexpected outside dispatch');
  return child;
}) as typeof childProcess.spawn);
syncBuiltinESMExports();
const { openOperatorApp } = await import('../../src/api/operator-app.js');
const { VideoWorker } = await import('../../src/modules/flow/video-worker.js');
const { createVideoProcessRunner } = await import('../../src/platform/video-process-runner.js');
loadingModules = false;
spawnMock.mock.restore();
syncBuiltinESMExports();

const CREATED = '2026-10-25T00:00:00.000Z';
const RESTARTED = '2026-10-25T01:00:00.000Z';

// Same migrated SQLite and minimal production-frontend setup as
// tests/integration/operator-app.test.ts (the brief's unit path does not exist).
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-video-jobs-'));
  const databasePath = path.join(root, 'workspace.sqlite');
  const { db } = openDatabase({ databasePath });
  db.defaultSafeIntegers(false);
  t.after(() => {
    if (db.open) db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const frontendDist = path.join(root, 'frontend', 'dist');
  fs.mkdirSync(path.join(frontendDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.js'), 'globalThis.TDN=true;');
  let sequence = 0;
  const service = createVideoService({
    db, clock: () => new Date(CREATED),
    newId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  });
  const store = createVideoJobStore({ db, clock: () => new Date(CREATED) });
  const configuration = (ownerWritesEnabled = true): OperatorAppConfiguration => ({
    databasePath, artifactRoot: path.join(root, 'artifacts'), frontendDist,
    version: '0.1.0', host: '127.0.0.1', port: 18787, ownerWritesEnabled,
    ...(ownerWritesEnabled ? {
      ownerToken: 'synthetic-owner-token-055-12345678901234567890', ownerActorId: 'owner:local',
    } : {}),
  });
  const enqueue = (kind: VideoJobKind, entryState: VideoProjectState = 'stop_2') => {
    const project = service.createProject({ title: `Synthetic ${kind}` });
    store.updateProjectState(project.projectId, entryState);
    return service.startJob(project.projectId, kind);
  };
  const job = (jobId: string) => db.prepare('SELECT * FROM flow_video_jobs WHERE job_id = ?').get(jobId) as Record<string, unknown>;
  const project = (projectId: string) => db.prepare('SELECT * FROM flow_video_projects WHERE project_id = ?').get(projectId) as Record<string, unknown>;
  const snapshot = () => ({
    jobs: db.prepare('SELECT * FROM flow_video_jobs ORDER BY job_id').all(),
    projects: db.prepare('SELECT * FROM flow_video_projects ORDER BY project_id').all(),
  });
  const closedControls = () => {
    const succeeded = enqueue('import');
    service.claimNextJob(); service.finishJob(succeeded.jobId);
    const failed = enqueue('voice');
    service.claimNextJob(); service.failJob(failed.jobId, 'process_failed');
    const cancelled = enqueue('render');
    service.claimNextJob(); service.cancelJob(cancelled.jobId);
    return [succeeded, failed, cancelled];
  };
  return { db, databasePath, service, store, configuration, enqueue, job, project, snapshot, closedControls };
}

async function until(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate() && Date.now() < deadline) await delay(5);
  assert.ok(predicate(), description);
}

for (const [kind, entryState] of [
  ['import', 'stop_1'], ['voice', 'stop_2'], ['render', 'stop_3'],
] as const) {
  test(`T1 ${kind}: executor sweeps before serving; viewer and non-running rows are unchanged`, async t => {
    const state = fixture(t);
    const controls = state.closedControls();
    const abandoned = state.enqueue(kind, entryState);
    state.service.claimNextJob();
    controls.push(state.enqueue('import', 'stop_1'));
    const before = state.snapshot();
    const controlRows = controls.map(job => ({ job: state.job(job.jobId), project: state.project(job.projectId) }));

    // Hold normal queue draining at the existing wake boundary so this test
    // observes prepareDatabase's sweep, including the queued negative control.
    const wake = t.mock.method(VideoWorker.prototype, 'wake', () => {});
    const dispatchesBefore = platformCalls;
    const viewer = openOperatorApp(state.configuration(false), { clock: () => new Date(RESTARTED) });
    const afterViewer = state.snapshot();
    await viewer.close();
    const executor = openOperatorApp(state.configuration(), { clock: () => new Date(RESTARTED) });
    try {
      // Proof: opening the executor returns only after the abandoned row and
      // project are repaired, before a caller can start serving requests.
      const repaired = state.job(abandoned.jobId);
      assert.deepEqual({
        listening: executor.server.listening,
        state: repaired.state, reason: repaired.error_code,
        finishedAt: repaired.finished_at,
        projectState: state.project(abandoned.projectId).state,
      }, {
        listening: false, state: 'interrupted', reason: 'interrupted_by_restart',
        finishedAt: RESTARTED, projectState: entryState,
      });

      // Negative control: read-only startup changes nothing; the executor
      // preserves every field of terminal/queued controls and never dispatches.
      assert.deepEqual(afterViewer, before);
      assert.deepEqual(controls.map(job => ({ job: state.job(job.jobId), project: state.project(job.projectId) })), controlRows);
      assert.deepEqual(state.snapshot().jobs.map(row => (row as { job_id: string }).job_id),
        before.jobs.map(row => (row as { job_id: string }).job_id));
      assert.equal(platformCalls, dispatchesBefore);
    } finally {
      await executor.close();
      wake.mock.restore();
    }
  });
}

// Each case owns a distinct outside-call failure mechanism. Both use actual
// local Node children, independent of ffmpeg installation or provider access.
for (const failure of [
  { name: 'timeout', script: 'setTimeout(() => {}, 60_000)', timeoutMs: 250, code: 'timeout' },
  { name: 'non-zero exit', script: 'process.exit(7)', timeoutMs: 5_000, code: 'process_failed' },
] as const) {
  test(`T6 ${failure.name}: fail only that job, continue the queue, never retry`, async t => {
    const state = fixture(t);
    const controls = state.closedControls();
    const before = controls.map(job => ({ job: state.job(job.jobId), project: state.project(job.projectId) }));
    const failing = state.enqueue('render', 'stop_3');
    const following = state.enqueue('import', 'stop_1');
    const idsBefore = state.snapshot().jobs.map(row => (row as { job_id: string }).job_id);
    const run = createVideoProcessRunner(realSpawn);
    let calls = 0;
    const worker = new VideoWorker({
      db: state.db, service: state.service, timeoutMs: failure.timeoutMs,
      runner: (_bin, _args, options) => {
        const call = calls++;
        if (call > 1) throw new Error('Unexpected retry or extra dispatch');
        return run(process.execPath, ['-e', call === 0 ? failure.script : ''], options);
      },
    });
    try {
      await worker.start();
      await until(() => state.job(following.jobId).state === 'succeeded', 'the worker must run the next job after an outside-call failure');
    } finally {
      await worker.close();
    }

    // Negative control: exactly the two requested calls, no replacement jobs,
    // no fallback/provider dispatch, and unrelated rows remain unchanged.
    assert.equal(calls, 2);
    assert.deepEqual(state.snapshot().jobs.map(row => (row as { job_id: string }).job_id), idsBefore);
    assert.deepEqual(controls.map(job => ({ job: state.job(job.jobId), project: state.project(job.projectId) })), before);

    // Proof: real timeout/exit failure is durable and the next job succeeds.
    assert.deepEqual({
      failedState: state.job(failing.jobId).state,
      error: state.job(failing.jobId).error_code,
      restoredProject: state.project(failing.projectId).state,
      nextState: state.job(following.jobId).state,
      nextError: state.job(following.jobId).error_code,
    }, {
      failedState: 'failed', error: failure.code, restoredProject: 'stop_3',
      nextState: 'succeeded', nextError: null,
    });
  });
}

test('T7 graceful close waits for stopped work; uncertain stop retains executor authority', async t => {
  await t.test('proof: abort, wait, close connections, then allow the next executor', async t => {
    const state = fixture(t);
    const queued = state.enqueue('render', 'stop_3');
    const connections = new Set<BetterSqlite3.Database>();
    const pragma = BetterSqlite3.prototype.pragma;
    const observeConnections = t.mock.method(BetterSqlite3.prototype, 'pragma', function (
      this: BetterSqlite3.Database, ...args: Parameters<BetterSqlite3.Database['pragma']>
    ) {
      connections.add(this);
      return pragma.apply(this, args);
    });
    // An unspawned ChildProcess supplies the real runner's normal events. Killing
    // it acknowledges abort, but completion remains gated by the close event.
    const child = new childProcess.ChildProcess();
    let aborted = false;
    t.mock.method(child, 'kill', () => { aborted = true; return true; });
    nextChild = child;
    const application = openOperatorApp(state.configuration());
    const lockPath = `${state.databasePath}.executor.lock`;
    const lockBefore = fs.readFileSync(lockPath);
    let closeSettled = false;
    const closing = application.close();
    void closing.then(() => { closeSettled = true; }, () => { closeSettled = true; });
    try {
      await until(() => aborted, 'operator close must abort its active outside call');
      await new Promise<void>(resolve => setImmediate(resolve));
      const whileStopping = {
        closeSettled, jobState: state.job(queued.jobId).state,
        connectionOpen: [...connections].some(db => db.open),
        lockUnchanged: fs.readFileSync(lockPath).equals(lockBefore),
      };
      child.emit('close', null, 'SIGKILL');
      await closing;
      const afterStopping = {
        jobState: state.job(queued.jobId).state,
        reason: state.job(queued.jobId).error_code,
        projectState: state.project(queued.projectId).state,
        connectionsClosed: connections.size > 0 && [...connections].every(db => !db.open),
        lockExists: fs.existsSync(lockPath),
      };
      const successor = openOperatorApp(state.configuration());
      await successor.close();

      assert.deepEqual(whileStopping, {
        closeSettled: false, jobState: 'running', connectionOpen: true, lockUnchanged: true,
      });
      assert.deepEqual(afterStopping, {
        jobState: 'interrupted', reason: 'interrupted_by_restart', projectState: 'stop_3',
        connectionsClosed: true, lockExists: false,
      });
    } finally {
      child.emit('close', null, 'SIGKILL');
      await closing;
      nextChild = undefined;
      observeConnections.mock.restore();
    }
  });

  await t.test('negative control: failed worker close reports failure and refuses another executor', async t => {
    const state = fixture(t);
    const application = openOperatorApp(state.configuration());
    const lockPath = `${state.databasePath}.executor.lock`;
    const lockBefore = fs.readFileSync(lockPath);
    const realClose = VideoWorker.prototype.close;
    let worker: InstanceType<typeof VideoWorker> | undefined;
    const failStop = t.mock.method(VideoWorker.prototype, 'close', async function (this: InstanceType<typeof VideoWorker>) {
      worker = this;
      throw new Error('Synthetic video worker stop failure');
    });
    try {
      await assert.rejects(application.close(), /Synthetic video worker stop failure/);
      assert.deepEqual(fs.readFileSync(lockPath), lockBefore);
      assert.throws(() => openOperatorApp(state.configuration()), { name: 'ExecutorLockHeldError' });
      assert.deepEqual(fs.readFileSync(lockPath), lockBefore);
    } finally {
      failStop.mock.restore();
      // This fixture has no active work. Release only its in-process worker
      // guard; the failed app's real lock is removed with its temp directory.
      if (worker) await realClose.call(worker);
    }
  });
});

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import BetterSqlite3 from 'better-sqlite3';
import { openOperatorApp, type OperatorAppConfiguration } from '../../src/api/operator-app.js';
import { createVideoJobStore, type VideoJobKind, type VideoProjectState } from '../../src/modules/flow/video-jobs.js';
import { createVideoService } from '../../src/modules/flow/video-service.js';
import { VideoWorker } from '../../src/modules/flow/video-worker.js';
import { createVideoProcessRunner } from '../../src/platform/video-process-runner.js';
import { openDatabase } from '../../src/platform/db/database.js';

// Intercept the existing platform boundary only for lifecycle cases. Imports
// stay ordinary, so the test harness never captures a mocked builtin.
let nextChild: childProcess.ChildProcess | undefined;
let platformCalls = 0;
function interceptSpawn(t: TestContext): void {
  const interception = t.mock.method(childProcess, 'spawn', (() => {
    platformCalls++;
    const child = nextChild;
    nextChild = undefined;
    if (!child) throw new Error('Unexpected outside dispatch');
    return child;
  }) as typeof childProcess.spawn);
  syncBuiltinESMExports();
  t.after(() => { interception.mock.restore(); syncBuiltinESMExports(); });
}

const CREATED = '2026-10-25T00:00:00.000Z';
const RESTARTED = '2026-10-25T01:00:00.000Z';

// Same migrated SQLite and minimal production-frontend setup as
// tests/integration/operator-app.test.ts (the brief's unit path does not exist).
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-video-jobs-'));
  const databasePath = path.join(root, 'workspace.sqlite');
  const { db } = openDatabase({ databasePath });
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

// A real child and grandchild in the runner's group, with ignored grandchild
// pipes: waiting for the leader's close alone cannot prove the group stopped.
const GROUP_SCRIPT = `
  const { spawn } = require('node:child_process');
  const fs = require('node:fs');
  const member = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', process.argv[1]], { stdio: 'ignore' });
  fs.writeFileSync(process.argv[1] + '.tmp', JSON.stringify({ pids: [process.pid, member.pid], tdn: Object.keys(process.env).filter(k => k.startsWith('TDN_')) }));
  fs.renameSync(process.argv[1] + '.tmp', process.argv[1]);
  setInterval(() => {}, 1000);
`;

function processGroupFixture(t: TestContext, databasePath: string) {
  const ready = path.join(path.dirname(databasePath), 'group-ready.json');
  let observed: { pids: number[]; tdn: string[] } | undefined;
  const read = () => observed = JSON.parse(fs.readFileSync(ready, 'utf8')) as { pids: number[]; tdn: string[] };
  const running = (pid: number): boolean => {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      return !['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]!);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  };
  const previous = process.env.TDN_VIDEO_REVIEW_CANARY;
  process.env.TDN_VIDEO_REVIEW_CANARY = 'synthetic-environment-canary';
  t.after(() => {
    if (previous === undefined) delete process.env.TDN_VIDEO_REVIEW_CANARY;
    else process.env.TDN_VIDEO_REVIEW_CANARY = previous;
    // On a failing regression, stop only processes still carrying this
    // fixture's unique argument, never a PID that may have been reused.
    const owned = observed ?? (fs.existsSync(ready) ? read() : undefined);
    for (const pid of owned?.pids ?? []) {
      if (!running(pid)) continue;
      try {
        if (fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(ready)) process.kill(pid, 'SIGKILL');
      } catch (error) {
        if (!['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code!)) throw error;
      }
    }
  });
  return { ready, read, running };
}

test('migration 0060 and store enforce job state and progress with production integer reads', t => {
  const state = fixture(t);
  const project = state.service.createProject({ title: 'Synthetic state constraints' });
  assert.equal(project.version, 1);
  state.db.prepare('UPDATE flow_video_projects SET hidden = 1 WHERE project_id = ?').run(project.projectId);
  assert.equal(state.service.getProject(project.projectId)?.hidden, true);
  assert.throws(() => state.service.startJob(project.projectId, 'render'), /hidden/);
  state.db.prepare('UPDATE flow_video_projects SET hidden = 0 WHERE project_id = ?').run(project.projectId);
  const job = state.service.startJob(project.projectId, 'render');
  state.service.claimNextJob();
  assert.throws(() => state.db.prepare(`UPDATE flow_video_jobs SET state = 'succeeded', finished_at = ? WHERE job_id = ?`).run(RESTARTED, job.jobId), /constraint/);
  state.store.setProgress(job.jobId, 10);
  assert.equal(state.service.listJobs(project.projectId)[0]?.progress, 10);
  assert.equal(state.store.countRunning(), 1);
  const following = state.enqueue('import');
  assert.throws(() => state.service.claimNextJob(), /UNIQUE constraint failed/);
  assert.equal(state.job(following.jobId).state, 'queued');
  for (const change of [
    'progress = NULL',
    'progress = 9',
    `state = 'succeeded', progress = 100, started_at = '${RESTARTED}', finished_at = '${RESTARTED}'`,
  ]) {
    assert.throws(() => state.db.prepare(`UPDATE flow_video_jobs SET ${change} WHERE job_id = ?`).run(job.jobId), /constraint|transition_invalid/);
    assert.equal(state.service.getJob(job.jobId)?.state, 'running');
  }
  state.service.finishJob(job.jobId);
  assert.equal(state.service.getJob(job.jobId)?.progress, 100);
  assert.throws(() => state.db.prepare("UPDATE flow_video_jobs SET state = 'queued', started_at = NULL, finished_at = NULL, progress = NULL WHERE job_id = ?").run(job.jobId), /transition_invalid/);
});

for (const [kind, entryState] of [
  ['import', 'stop_1'], ['voice', 'stop_2'], ['render', 'stop_3'],
] as const) {
  test(`T1 ${kind}: executor sweeps before serving; viewer and non-running rows are unchanged`, async t => {
    const state = fixture(t);
    interceptSpawn(t);
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
  { name: 'timeout', script: GROUP_SCRIPT, timeoutMs: 2_000, code: 'timeout' },
  { name: 'non-zero exit', script: 'process.exit(7)', timeoutMs: 5_000, code: 'process_failed' },
] as const) {
  test(`T6 ${failure.name}: fail only that job, continue the queue, never retry`, async t => {
    const state = fixture(t);
    const controls = state.closedControls();
    const before = controls.map(job => ({ job: state.job(job.jobId), project: state.project(job.projectId) }));
    const failing = state.enqueue('render', 'stop_3');
    const following = state.enqueue('import', 'stop_1');
    const group = process.platform === 'linux' && failure.name === 'timeout' ? processGroupFixture(t, state.databasePath) : undefined;
    const idsBefore = state.snapshot().jobs.map(row => (row as { job_id: string }).job_id);
    const run = createVideoProcessRunner();
    let calls = 0;
    const worker = new VideoWorker({
      db: state.db, service: state.service,
      runner: (_bin, _args, options) => {
        const call = calls++;
        if (call > 1) throw new Error('Unexpected retry or extra dispatch');
        const observer = new BetterSqlite3(state.databasePath, { readonly: true });
        try {
          const claimed = call === 0 ? failing : following;
          assert.equal((observer.prepare('SELECT state FROM flow_video_jobs WHERE job_id = ?').get(claimed.jobId) as { state: string }).state, 'running', 'the claim must be committed before outside work');
        } finally { observer.close(); }
        const script = call === 0 ? (failure.name === 'timeout' && !group ? 'setTimeout(() => {}, 60_000)' : failure.script) : '';
        return run(process.execPath, ['-e', script, ...(group && call === 0 ? [group.ready] : [])], { ...options, timeoutMs: failure.timeoutMs });
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
    if (group) {
      const observed = group.read();
      assert.deepEqual(observed.tdn, [], 'the child must receive no TDN_* values');
      assert.equal(observed.pids.length, 2);
      await until(() => observed.pids.every(pid => !group.running(pid)), 'timeout must stop the entire process group');
      assert.throws(() => process.kill(observed.pids[0]!, 0), { code: 'ESRCH' }, 'the direct child must be reaped');
    }
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
  await t.test('owner cancel stops the running process group and stays cancelled through shutdown', { skip: process.platform !== 'linux' }, async t => {
    const state = fixture(t);
    const group = processGroupFixture(t, state.databasePath);
    const queued = state.enqueue('render', 'stop_3');
    let worker: VideoWorker;
    const service = createVideoService({ db: state.db, onCancel: jobId => worker.cancel(jobId) });
    const run = createVideoProcessRunner();
    let calls = 0;
    worker = new VideoWorker({
      db: state.db, service,
      runner: (_bin, _args, options) => { calls++; return run(process.execPath, ['-e', GROUP_SCRIPT, group.ready], options); },
    });
    try {
      worker.start();
      await until(() => fs.existsSync(group.ready), 'the real process group must start before owner cancel');
      const observed = group.read();
      assert.ok(observed.pids.every(group.running), 'both processes must be live before cancel');
      service.cancelJob(queued.jobId);
      await worker.close();
      await until(() => observed.pids.every(pid => !group.running(pid)), 'owner cancel must stop the entire process group');
      assert.throws(() => process.kill(observed.pids[0]!, 0), { code: 'ESRCH' }, 'the direct child must be reaped');
      assert.deepEqual(observed.tdn, []);
      assert.equal(calls, 1, 'cancel must never dispatch a retry');
      assert.equal(state.job(queued.jobId).state, 'cancelled');
      assert.equal(state.job(queued.jobId).error_code, 'cancelled_by_owner');
      assert.equal(state.project(queued.projectId).state, 'stop_3');
    } finally { await worker.close(); }
  });

  await t.test('a post-spawn error cannot acknowledge that the child stopped', async t => {
    const nativeSpawn = childProcess.spawn;
    let child: childProcess.ChildProcess | undefined;
    const observeSpawn = t.mock.method(childProcess, 'spawn', ((...args: Parameters<typeof childProcess.spawn>) => {
      child = nativeSpawn(...args);
      return child;
    }) as typeof childProcess.spawn);
    syncBuiltinESMExports();
    const controller = new AbortController();
    let settled = false;
    const running = createVideoProcessRunner()(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 5_000, maxBytes: 1024, signal: controller.signal,
    });
    void running.then(() => { settled = true; }, () => { settled = true; });
    try {
      assert.ok(child?.pid);
      child.emit('error', new Error('Synthetic post-spawn error'));
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(settled, false, 'an error event while the real child is live must not settle the runner');
      assert.doesNotThrow(() => process.kill(child!.pid!, 0));
      controller.abort();
      await assert.rejects(running, { name: 'VideoProcessAbortedError' });
      assert.throws(() => process.kill(child!.pid!, 0), { code: 'ESRCH' });
    } finally {
      controller.abort();
      // Also clean up if a regression incorrectly settled the runner early.
      if (child?.exitCode === null && child.signalCode === null) {
        const stopped = new Promise<void>(resolve => child!.once('close', () => resolve()));
        child.kill('SIGKILL');
        await stopped;
      }
      await running.catch(() => undefined);
      observeSpawn.mock.restore(); syncBuiltinESMExports();
    }
  });

  interceptSpawn(t);
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

  await t.test('negative control: failed interruption reports failure and retains the connection and executor lock', async t => {
    const state = fixture(t);
    const queued = state.enqueue('render', 'stop_3');
    // Fail the real shutdown transition at SQLite, rather than supplying a
    // rejected close() that bypasses the worker's own error handling.
    state.db.exec(`CREATE TRIGGER synthetic_stop_failure BEFORE UPDATE ON flow_video_jobs
      WHEN NEW.state = 'interrupted' BEGIN SELECT RAISE(ABORT, 'synthetic_stop_failure'); END`);
    const child = new childProcess.ChildProcess();
    let aborted = false;
    t.mock.method(child, 'kill', () => { aborted = true; return true; });
    nextChild = child;
    const connections = new Set<BetterSqlite3.Database>();
    const pragma = BetterSqlite3.prototype.pragma;
    const observeConnections = t.mock.method(BetterSqlite3.prototype, 'pragma', function (
      this: BetterSqlite3.Database, ...args: Parameters<BetterSqlite3.Database['pragma']>
    ) {
      connections.add(this);
      return pragma.apply(this, args);
    });
    const application = openOperatorApp(state.configuration());
    const lockPath = `${state.databasePath}.executor.lock`;
    const lockBefore = fs.readFileSync(lockPath);
    const closing = application.close();
    await until(() => aborted, 'shutdown must abort the runner before settling interruption');
    child.emit('close', null, 'SIGKILL');
    try {
      await assert.rejects(closing, /synthetic_stop_failure/);
      assert.equal(state.job(queued.jobId).state, 'running');
      assert.ok([...connections].some(db => db.open), 'failed worker close must keep its connection open');
      assert.deepEqual(fs.readFileSync(lockPath), lockBefore);
      assert.throws(() => openOperatorApp(state.configuration()), { name: 'ExecutorLockHeldError' });
      assert.deepEqual(fs.readFileSync(lockPath), lockBefore);
    } finally {
      child.emit('close', null, 'SIGKILL');
      await closing.catch(() => undefined);
      for (const db of connections) if (db.open) db.close();
      observeConnections.mock.restore();
      nextChild = undefined;
    }
  });

  await t.test('startup failure waits for active work before closing connections and releasing authority', async t => {
    const state = fixture(t);
    const queued = state.enqueue('render', 'stop_3');
    const child = new childProcess.ChildProcess();
    let aborted = false;
    t.mock.method(child, 'kill', () => { aborted = true; return true; });
    nextChild = child;
    const start = VideoWorker.prototype.start;
    const failStart = t.mock.method(VideoWorker.prototype, 'start', function (this: InstanceType<typeof VideoWorker>) {
      void start.call(this);
      throw new Error('Synthetic startup failure');
    });
    const lockPath = `${state.databasePath}.executor.lock`;
    try {
      assert.throws(() => openOperatorApp(state.configuration()), /Synthetic startup failure/);
      await until(() => aborted, 'startup cleanup must abort any work already dispatched');
      assert.ok(fs.existsSync(lockPath), 'startup cleanup must await the runner before releasing authority');
      assert.equal(state.job(queued.jobId).state, 'running');
      assert.throws(() => openOperatorApp(state.configuration()), { name: 'ExecutorLockHeldError' });
      child.emit('close', null, 'SIGKILL');
      await until(() => !fs.existsSync(lockPath), 'a clean startup rollback must release authority');
      assert.equal(state.job(queued.jobId).state, 'interrupted');
      failStart.mock.restore();
      const successor = openOperatorApp(state.configuration());
      await successor.close();
    } finally {
      child.emit('close', null, 'SIGKILL');
      failStart.mock.restore();
      nextChild = undefined;
    }
  });
});

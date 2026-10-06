import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import type Database from 'better-sqlite3';
import type { AutomationI14SynthesisConfiguration } from '../../contracts/analysis/automation-i14-synthesis-configuration.generated.js';
import {
  AutomationI14ExecutionError, AutomationI14ExecutionIntegrityError, AutomationI14SynthesisExecutions,
  type AutomationI14TextPort,
} from '../../src/modules/analysis/research-automation/i14-synthesis-execution.js';
import {
  pausedI14Parent, syntheticI14Input, validI14Response,
} from '../helpers/i14-execution-fixture.js';

const configuration: AutomationI14SynthesisConfiguration = {
  contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-configuration', providerId: 'synthetic', modelId: 'synthetic-model',
  temperature: null, maxOutputTokens: 100, timeoutMs: 1000, maxResponseBytes: 65536,
};

function portFor(input: ReturnType<typeof syntheticI14Input>): { readonly port: AutomationI14TextPort; readonly calls: () => number } {
  let count = 0;
  const port: AutomationI14TextPort = { async generateText() { count += 1; return { text: JSON.stringify(validI14Response(input)) }; } };
  return { port, calls: () => count };
}

function executionRow(db: Database.Database): {
  execution_id: string; state: string; admission_sha256: string; input_sha256: string; prompt_sha256: string; configuration_sha256: string; candidates_sha256: string | null;
} {
  return db.prepare(`SELECT execution_id, state, admission_sha256, input_sha256, prompt_sha256, configuration_sha256, candidates_sha256
    FROM analysis_research_automation_ai_executions`).get() as {
      execution_id: string; state: string; admission_sha256: string; input_sha256: string; prompt_sha256: string; configuration_sha256: string; candidates_sha256: string | null;
    };
}

test('settled I14 execution replays after the REPORTS parent is terminal and current configuration is invalid', async t => {
  const parent = await pausedI14Parent();
  t.after(async () => parent.cleanup());
  const input = syntheticI14Input();
  const { port, calls } = portFor(input);
  const execution = new AutomationI14SynthesisExecutions({ db: parent.db, artifactStore: parent.artifacts, now: () => new Date('2026-10-02T00:00:00.000Z') });

  const first = await execution.execute({ parent: parent.parent, admission: input, ai: { port, configuration } });
  assert.equal(first.status, 'VALID');
  assert.equal(calls(), 1);
  parent.release();
  await parent.reportPromise;
  assert.equal((await parent.service.getRun(input.run.workspaceId, input.run.runId)).status, 'DRAFT_READY');

  const invalidCurrentConfiguration = { ...configuration, timeoutMs: 999 } as AutomationI14SynthesisConfiguration;
  const replay = await execution.execute({ parent: parent.parent, admission: { ...input, admissionVersion: '1.1.0' },
    ai: { port, configuration: invalidCurrentConfiguration } });
  assert.equal(replay.status, 'VALID');
  assert.equal(replay.dispatched, false);
  assert.equal(first.status, 'VALID');
  assert.deepEqual(replay.candidates.bytes, first.candidates.bytes, 'A newer admission rule must not rewrite an existing execution');
  assert.equal(replay.candidates.artifact.admission.methodVersion, '1.0.0');
  assert.equal(calls(), 1, 'settled replay must not call the transport');
});

test('retained manifest corruption prevents a PREPARED retry from dispatching', async t => {
  const parent = await pausedI14Parent();
  t.after(async () => parent.cleanup());
  const input = syntheticI14Input();
  const { port, calls } = portFor(input);
  const execution = new AutomationI14SynthesisExecutions({ db: parent.db, artifactStore: parent.artifacts, now: () => new Date('2026-10-02T00:00:00.000Z') });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(execution.execute({ parent: parent.parent, admission: input, ai: { port, configuration }, signal: cancelled.signal }));
  const row = executionRow(parent.db);
  assert.equal(row.state, 'PREPARED');
  const prepared = await parent.service.getRun(input.run.workspaceId, input.run.runId);
  assert.deepEqual(prepared.aiActivity, { i14: {
    states: { prepared: 1, dispatching: 0, completed: 0, dispatchUnknown: 0 },
    outcomes: { valid: 0, invalid: 0 }, billing: { state: 'NOT_DISPATCHED' },
  } });
  parent.db.prepare(`UPDATE artifact_manifests SET retention_status='held' WHERE sha256=?`).run(row.configuration_sha256);
  await assert.rejects(execution.execute({ parent: parent.parent, admission: input, ai: { port, configuration } }), (error: unknown) => error instanceof AutomationI14ExecutionIntegrityError);
  assert.equal(calls(), 0, 'retained-artifact failure must happen before the port call');
});

test('restart recovery settles a claimed I14 dispatch as unknown and never calls the transport', async t => {
  const parent = await pausedI14Parent();
  t.after(async () => parent.cleanup());
  const input = syntheticI14Input();
  const { port, calls } = portFor(input);
  const execution = new AutomationI14SynthesisExecutions({ db: parent.db, artifactStore: parent.artifacts, now: () => new Date('2026-10-02T00:00:00.000Z') });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(execution.execute({ parent: parent.parent, admission: input, ai: { port, configuration }, signal: cancelled.signal }));
  const row = executionRow(parent.db);
  parent.db.prepare(`UPDATE analysis_research_automation_ai_executions SET state='DISPATCHING', dispatch_claimed_at=? WHERE execution_id=?`)
    .run('2026-10-02T00:00:01.000Z', row.execution_id);
  const claimed = await parent.service.getRun(input.run.workspaceId, input.run.runId);
  assert.deepEqual(claimed.aiActivity?.i14?.states, { prepared: 0, dispatching: 1, completed: 0, dispatchUnknown: 0 });
  assert.deepEqual(claimed.aiActivity?.i14?.billing, { state: 'UNKNOWN' });
  assert.equal(execution.recoverInterruptedDispatches(), 1);
  const recovered = await execution.execute({ parent: parent.parent, admission: input, ai: null });
  assert.deepEqual(recovered, { status: 'DISPATCH_UNKNOWN', executionId: row.execution_id, dispatched: false, unknownCode: 'INTERRUPTED_AFTER_CLAIM' });
  assert.equal(calls(), 0);
  const uncertain = await parent.service.getRun(input.run.workspaceId, input.run.runId);
  assert.deepEqual(uncertain.aiActivity?.i14?.states, { prepared: 0, dispatching: 0, completed: 0, dispatchUnknown: 1 });
  assert.deepEqual(uncertain.aiActivity?.i14?.billing, { state: 'UNKNOWN' });
  assert.deepEqual(uncertain.usage, claimed.usage, 'An unconfirmed dispatch cannot become a source request or known charge');
});

test('candidate artifact corruption is detected during settled replay and an incompatible parent is rejected', async t => {
  const parent = await pausedI14Parent();
  t.after(async () => parent.cleanup());
  const input = syntheticI14Input();
  const { port, calls } = portFor(input);
  const execution = new AutomationI14SynthesisExecutions({ db: parent.db, artifactStore: parent.artifacts, now: () => new Date('2026-10-02T00:00:00.000Z') });
  const first = await execution.execute({ parent: parent.parent, admission: input, ai: { port, configuration } });
  assert.equal(first.status, 'VALID');
  const row = executionRow(parent.db);
  assert.ok(row.candidates_sha256);
  await fs.writeFile(parent.artifacts.pathForDigest(row.candidates_sha256!), Buffer.from('tampered'));
  await assert.rejects(execution.execute({ parent: parent.parent, admission: input, ai: null }), (error: unknown) => error instanceof AutomationI14ExecutionIntegrityError);
  assert.equal(calls(), 1);
  const otherParent = { kind: 'INITIAL_REPORTS' as const, runId: '44444444-4444-4444-8444-444444444444' };
  await assert.rejects(execution.execute({ parent: otherParent, admission: input, ai: null }), (error: unknown) => error instanceof AutomationI14ExecutionError && error.code === 'PARENT_RUN_MISMATCH');
});

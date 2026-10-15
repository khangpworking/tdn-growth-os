import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import schema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import { AUTORUN_CAPTURE_STOP_CODES, autorunRequestKey, buildRevisionValue } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { runMetricCapture } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import type { MetricCaptureRejectionCode } from '../../src/modules/analysis/research-automation/metric-capture-intake.js';
import { ResearchAutomationConflictError } from '../../src/modules/analysis/research-automation/model.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { SYNTHETIC_CARD_ID } from '../helpers/research-synthetic-sources.js';
import { attemptCount, attemptRequestCount, autorun, drain, driveUntil, fixture, keyword, rewindStartKey, startRun, untilIdle, workspaceId, writeCaptureFiles } from '../helpers/autorun-harness.js';
import { AUTORUN_DENY_LIST, AUTORUN_PHASE_TEXT, AUTORUN_STOP_TEXT } from '../../frontend/src/research-automation/autorun-text.js';

// Synthetic fixtures only; no process is spawned (fake capture runner or a fake executor).
const Ajv = AjvModule.default;
const addFormats = addFormatsModule.default;
const ajv = new Ajv({ allErrors: true, strict: true }); addFormats(ajv);
ajv.addSchema(schema);
const validateRun = ajv.compile({ $ref: `${schema.$id}#/$defs/run` });
const retryBody = (requestKey: string = randomUUID()) => ({ contractVersion: 'research-automation-autorun-retry-v1', requestKey });
const isConflict = (error: unknown) => error instanceof ResearchAutomationConflictError;
const timeout = { ok: false as const, code: 'TIMEOUT' as const, detail: 'capture stopped: TIMEOUT', executorCalls: 1 };

// ---------- PRESENT ----------

test('PRESENT: DRAFT_READY asks for exactly one presentation revision on the latest pair, then DONE once committed', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  await driveUntil(f.service, () => autorun(f.db, runId)?.phase === 'PRESENT');
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const latest = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  await drain(f.service);
  assert.equal(f.service.revisions.length, 1);
  assert.deepEqual(f.service.revisions[0], buildRevisionValue({ runId, previousPairId: latest.pairId }));
  assert.equal((f.service.revisions[0] as { contractVersion: string }).contractVersion, 'automation-market-presentation-revision-v1');
  assert.equal(attemptCount(f.db, runId), 1);
  assert.equal(attemptRequestCount(f.db, autorunRequestKey(runId, 'revision')), 1);
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.phase, row.stopCode], ['DONE', null]);
  assert.ok(row.revisionAttemptId);
  assert.deepEqual(f.db.prepare('SELECT state FROM analysis_research_automation_attempts WHERE attempt_id=?').get(row.revisionAttemptId), { state: 'COMMITTED' });
  // More passes never send a second request.
  await drain(f.service);
  assert.equal(f.service.revisions.length, 1);
});

test('PRESENT: an owner revision made first stops the step as OWNER_REVISION_EXISTS without a second attempt', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  await driveUntil(f.service, () => autorun(f.db, runId)?.phase === 'PRESENT');
  const latest = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  await f.service.requestReportRevision(workspaceId, runId, { ...buildRevisionValue({ runId, previousPairId: latest.pairId }), requestKey: '66666666-6666-4666-8666-666666666666' });
  await drain(f.service);
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.phase, row.stopCode], ['STOPPED', 'OWNER_REVISION_EXISTS']);
  assert.equal(attemptCount(f.db, runId), 1, 'only the owner attempt exists');
  assert.equal(attemptRequestCount(f.db, autorunRequestKey(runId, 'revision')), 0);
  assert.equal(f.service.revisions.length, 1, 'only the owner request was sent');
});

test('PRESENT: a failed request stops as PRESENTATION_FAILED and the draft stays readable', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  f.service.failRevision = true;
  await drain(f.service);
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.phase, row.stopCode], ['STOPPED', 'PRESENTATION_FAILED']);
  assert.ok(!row.stopDetail || (row.stopDetail.length <= 300 && !/[\\/]/.test(row.stopDetail)), 'stop detail is short and path-free');
  const run = await f.service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY');
  assert.ok(run.outputs?.market, 'the draft report is still listed');
  assert.ok((await f.service.listReportVersions(workspaceId, runId)).length >= 1);
  assert.equal(attemptCount(f.db, runId), 0);
  assert.equal(run.autoRun?.canRetry, false, 'a presentation stop is not a capture retry');
});

test('PRESENT: an attempt that ends without committing stops as PRESENTATION_FAILED', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  await driveUntil(f.service, () => { const row = autorun(f.db, runId); return row?.phase === 'PRESENT' && row.state === 'RUNNING' && row.revisionAttemptId !== null; });
  const attemptId = autorun(f.db, runId)!.revisionAttemptId!;
  await f.service.cancelReportRevision(workspaceId, runId, attemptId, '77777777-7777-4777-8777-777777777777');
  await drain(f.service);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'PRESENTATION_FAILED']);
  assert.equal(attemptCount(f.db, runId), 1);
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
});

test('PRESENT: a restart after the request was accepted reuses that attempt and never sends a duplicate', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  f.service.hangAfterRevision = true;
  for (let i = 0; i < 80 && f.service.revisions.length === 0; i++) {
    const step = f.service.processNext();
    let moved = await Promise.race([step, new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 200))]);
    if (moved === 'hung' && f.service.revisions.length > 0) break;
    if (moved === 'hung') moved = await step; // a slow step (e.g. rendering), not the simulated death
    if (!moved) await f.service.settleAutoRunCaptures();
  }
  assert.equal(f.service.revisions.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['PRESENT', 'RUNNING']);
  assert.equal(attemptCount(f.db, runId), 1);
  const restarted = f.make();
  await restarted.recoverOnStart();
  await drain(restarted);
  assert.equal(restarted.revisions.length, 0, 'the restarted worker sends nothing new');
  assert.equal(attemptCount(f.db, runId), 1);
  assert.equal(attemptRequestCount(f.db, autorunRequestKey(runId, 'revision')), 1);
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
});

// ---------- projection ----------

test('projection: flag off has no autoRun and is byte-identical to a service without the option', async t => {
  const off = await fixture(t, 'off');
  const absent = await fixture(t, 'absent');
  const offRun = await startRun(off.service); rewindStartKey();
  const absentRun = await startRun(absent.service);
  await drain(off.service); await drain(absent.service);
  const a = await off.service.getRun(workspaceId, offRun), b = await absent.service.getRun(workspaceId, absentRun);
  assert.equal('autoRun' in a, false);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(await off.service.listRuns(workspaceId)), JSON.stringify(await absent.service.listRuns(workspaceId)));
});

test('projection: flag on validates against the schema with linksFound and canRetry', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  const first = await f.service.getRun(workspaceId, runId);
  assert.ok(validateRun(first), JSON.stringify(validateRun.errors));
  assert.deepEqual(first.autoRun, { phase: 'WAITING_SCOPE', state: 'QUEUED', canRetry: false });
  await drain(f.service);
  const done = await f.service.getRun(workspaceId, runId);
  assert.ok(validateRun(done), JSON.stringify(validateRun.errors));
  assert.deepEqual(done.autoRun, { phase: 'DONE', state: 'QUEUED', linksFound: 3, canRetry: false });
  const serialized = JSON.stringify(done.autoRun);
  assert.equal(/[\\/]/.test(serialized), false, 'no paths in the projection');
});

test('projection: a capture stop on an open run can retry; other stops cannot', async t => {
  const f = await fixture(t, 'on', () => timeout);
  const runId = await startRun(f.service);
  await drain(f.service);
  const stopped = await f.service.getRun(workspaceId, runId);
  assert.ok(validateRun(stopped), JSON.stringify(validateRun.errors));
  assert.equal(stopped.status, 'AWAITING_SCOPE');
  assert.equal(stopped.autoRun?.phase, 'STOPPED'); assert.equal(stopped.autoRun?.stopCode, 'TIMEOUT'); assert.equal(stopped.autoRun?.canRetry, true);
  assert.equal(stopped.autoRun?.linksFound, undefined);
  // The owner confirming by hand ends the run's scope wait: the capture stop is no longer retryable.
  await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: stopped.revision, definition: 'Synthetic owner scope', includeTerms: [keyword], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  assert.equal((await f.service.getRun(workspaceId, runId)).autoRun?.canRetry, false);
});

// ---------- retry ----------

test('retry: allowed only when canRetry, one more capture call, exact retry is a no-op, otherwise conflict', async t => {
  let calls = 0;
  const f = await fixture(t, 'on', () => (++calls === 1 ? timeout : 'ok'));
  const runId = await startRun(f.service);
  // Not stopped yet: conflict.
  await assert.rejects(f.service.retryAutoRunCapture(workspaceId, runId, retryBody()), isConflict);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1, 'a stopped capture is never retried automatically');
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  const body = retryBody();
  await assert.rejects(f.service.retryAutoRunCapture(workspaceId, runId, { ...body, extra: 1 }), (e: unknown) => !isConflict(e), 'invalid body is a validation error');
  const receipt = await f.service.retryAutoRunCapture(workspaceId, runId, body);
  assert.equal(receipt.exactRetry, false);
  assert.deepEqual(receipt.run.autoRun, { phase: 'CAPTURE', state: 'QUEUED', canRetry: false });
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.stopCode, row.stopDetail, Number(row.captureReady)], [null, null, 0]);
  const again = await f.service.retryAutoRunCapture(workspaceId, runId, body);
  assert.equal(again.exactRetry, true);
  assert.equal((f.db.prepare('SELECT count(*) n FROM research_automation_autorun_retries WHERE run_id=?').get(runId) as { n: bigint }).n, 1n);
  // Same key on another run, or a new key while queued: conflict.
  await assert.rejects(f.service.retryAutoRunCapture(workspaceId, randomUUID(), body), isConflict);
  await assert.rejects(f.service.retryAutoRunCapture(workspaceId, runId, retryBody()), isConflict);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 2, 'exactly one more capture call');
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
  await assert.rejects(f.service.retryAutoRunCapture(workspaceId, runId, retryBody()), isConflict);
  assert.equal(f.capture.calls.length, 2);
});

test('retry: non-capture stops and flag off are conflicts', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  const awaiting = await f.service.getRun(workspaceId, runId);
  await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic owner scope', includeTerms: [keyword], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  f.capture.release(runId);
  await drain(f.service);
  assert.equal(autorun(f.db, runId)!.stopCode, 'SCOPE_CHANGED_BY_OWNER');
  await assert.rejects(f.service.retryAutoRunCapture(workspaceId, runId, retryBody()), isConflict);
  const off = await fixture(t, 'off');
  const offRun = await startRun(off.service);
  await drain(off.service);
  await assert.rejects(off.service.retryAutoRunCapture(workspaceId, offRun, retryBody()), isConflict);
});

test('retry: the old capture folder is set aside and never reused', async t => {
  let executions = 0;
  const f = await fixture(t, 'on', undefined, () => (config, request) => runMetricCapture(
    { ...(config as { captureRoot: string; enabledEnv: string }), adapterManifestPath: 'synthetic-manifest.json', adapterManifestSha256: 'a'.repeat(64) }, request, {
      sourceEnv: {},
      createProcessRunner: () => (async () => { throw new Error('no process may be spawned'); }) as never,
      execute: async input => {
        executions++;
        const spec = JSON.parse(await fs.readFile(input.specPath, 'utf8')) as { period: { startDate: string; endDate: string } };
        if (executions === 1) {
          await fs.mkdir(input.outputDir, { recursive: true });
          await writeCaptureFiles(input.outputDir, request.runId, spec.period);
          await fs.writeFile(path.join(input.outputDir, 'old-marker.txt'), 'first attempt');
          return { ok: false, code: 'TIMEOUT', message: 'synthetic timeout', argv: [] };
        }
        assert.equal(await fs.stat(path.join(input.outputDir)).then(() => true, () => false), false, 'run1 is empty before the new attempt');
        await writeCaptureFiles(input.outputDir, request.runId, spec.period);
        return { ok: true, stdout: '', stderr: '', argv: [] };
      },
    }));
  const runId = await startRun(f.service);
  await drain(f.service);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'TIMEOUT']);
  await f.service.retryAutoRunCapture(workspaceId, runId, retryBody());
  await drain(f.service);
  assert.equal(executions, 2);
  const runDir = path.join(f.capture.captureRoot, runId);
  assert.equal(await fs.readFile(path.join(runDir, 'run1.failed-1', 'old-marker.txt'), 'utf8'), 'first attempt');
  assert.equal(await fs.stat(path.join(runDir, 'run1', 'old-marker.txt')).then(() => true, () => false), false);
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
});

test('retry route: OWNER POST returns 202, exact retry 200, and 409 when not retryable', async t => {
  // The API's own runner has no tool manifest configured, so its capture stops at once (no process).
  const f = await fixture(t, 'on', () => ({ ok: false, code: 'EXECUTOR_NOT_CONFIGURED', detail: 'not configured', executorCalls: 0 }));
  const runId = await startRun(f.service);
  await drain(f.service);
  assert.equal((await f.service.getRun(workspaceId, runId)).autoRun?.canRetry, true);
  const other = await startRun(f.service);
  const otherRun = await f.service.getRun(workspaceId, other);
  await f.service.cancel(workspaceId, other, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: otherRun.revision });
  await drain(f.service);
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, token = 'synthetic-autorun-owner-token-123456-abcdefghijklmnopqrstuvwxyz';
  const api = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin: base,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: base, actorId: 'owner:synthetic' },
    metricAutoRun: { captureRoot: path.join(f.root, 'api-captures') } },
    { now: () => Date.now(), sleep: async () => {}, fetch: async () => { throw new Error('no provider call expected'); } });
  const server = http.createServer(api.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  try {
    const post = (id: string, body: unknown, authorization = true) => fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${id}/auto-run/retry`, {
      method: 'POST', headers: { Origin: base, ...(authorization ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const body = retryBody();
    assert.equal((await post(runId, body, false)).status, 401);
    assert.equal((await post(runId, { ...body, contractVersion: 'other' })).status, 400);
    assert.equal((await post(other, retryBody())).status, 409, 'a cancelled run cannot retry');
    const accepted = await post(runId, body);
    assert.equal(accepted.status, 202, await accepted.clone().text());
    const receipt = await accepted.json() as { exactRetry: boolean; run: { runId: string } };
    assert.deepEqual([receipt.exactRetry, receipt.run.runId], [false, runId]);
    const repeat = await post(runId, body);
    assert.equal(repeat.status, 200);
    assert.equal((await repeat.json() as { exactRetry: boolean }).exactRetry, true);
    assert.equal((f.db.prepare('SELECT count(*) n FROM research_automation_autorun_retries WHERE run_id=?').get(runId) as { n: bigint }).n, 1n);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await api.close();
  }
});

// ---------- owner text ----------

test('owner text covers every phase and every stop code, with no provider or tool name and no percent', () => {
  const intake: MetricCaptureRejectionCode[] = ['CAPTURE_OVERSIZE', 'CAPTURE_INVALID_JSON', 'CAPTURE_SCHEMA_INVALID', 'CAPTURE_MANIFEST_INVALID',
    'CAPTURE_GATE_NOT_CLEARED', 'CAPTURE_DIGEST_MISMATCH', 'CAPTURE_SCOPE_MISMATCH', 'CAPTURE_PRODUCTS_MISSING', 'CAPTURE_INTEGRITY_FAILED'];
  const service = ['CAPTURE_FILES_MISSING', 'CAPTURE_PREPARE_FAILED', 'PICK_FAILED', 'CONFIRM_FAILED', 'CONFIRM_REJECTED', 'NO_PRINCIPAL_PRODUCTS',
    'SCOPE_CHANGED_BY_OWNER', 'OWNER_REVISION_EXISTS', 'PRESENTATION_FAILED', 'RUN_FAILED', 'RUN_CANCELLED', 'RUN_INTERRUPTED', 'CANCELLED'];
  for (const code of [...AUTORUN_CAPTURE_STOP_CODES, ...intake, ...service]) assert.ok(AUTORUN_STOP_TEXT[code], `text for ${code}`);
  const phases = (schema.$defs.autoRun.properties.phase.enum as string[]).filter(phase => phase !== 'STOPPED');
  for (const phase of phases) assert.ok((AUTORUN_PHASE_TEXT as Record<string, string>)[phase], `text for ${phase}`);
  for (const text of [...Object.values(AUTORUN_STOP_TEXT), ...Object.values(AUTORUN_PHASE_TEXT)]) {
    assert.equal(text.includes('%'), false);
    for (const word of AUTORUN_DENY_LIST) assert.equal(text.toLowerCase().includes(word.toLowerCase()), false, `${word} in ${text}`);
  }
});

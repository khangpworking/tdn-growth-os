import assert from 'node:assert/strict';
import test from 'node:test';
import { autorunRequestKey } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { SYNTHETIC_CARD_ID } from '../helpers/research-synthetic-sources.js';
import { autorun, drain, dump, fixture, keyword, requestCount, rewindStartKey, startRun, untilIdle, workspaceId } from '../helpers/autorun-harness.js';

// Synthetic fixtures only: no real keyword, product, shop or customer data; no process is spawned.

test('flag off: no auto-run row, no capture, and the projection and database match a service without the option', async t => {
  const off = await fixture(t, 'off');
  const absent = await fixture(t, 'absent');
  const offRun = await startRun(off.service); rewindStartKey();
  const absentRun = await startRun(absent.service);
  await drain(off.service); await drain(absent.service);
  assert.equal(offRun, absentRun);
  assert.equal(off.capture.calls.length, 0);
  assert.equal((off.db.prepare('SELECT count(*) n FROM research_automation_autorun').get() as { n: bigint }).n, 0n);
  assert.deepEqual(await off.service.getRun(workspaceId, offRun), await absent.service.getRun(workspaceId, absentRun));
  assert.deepEqual(dump(off.db), dump(absent.db));
});

test('happy path: capture, prepare, pick and confirm with SKIP review, then PRESENT and DONE once the presentation is committed', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  assert.equal(autorun(f.db, runId)!.phase, 'WAITING_SCOPE');
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual({ runId: f.capture.calls[0]!.runId, keyword: f.capture.calls[0]!.keyword }, { runId, keyword });
  const row = autorun(f.db, runId)!;
  assert.deepEqual({ phase: row.phase, state: row.state, stopCode: row.stopCode }, { phase: 'DONE', state: 'QUEUED', stopCode: null });
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  // DONE now follows the presentation step: exactly one committed revision attempt.
  assert.deepEqual(f.db.prepare(`SELECT state FROM analysis_research_automation_attempts WHERE run_id=?`).all(runId), [{ state: 'COMMITTED' }]);
  assert.equal(f.service.confirms.length, 1);
  const body = f.service.confirms[0] as { requestKey: string; sources: { nativeReview: string; metric: { decision: string; packageId: string } }; exactShopeeUrls: string[]; selectedProductIds: string[] };
  assert.equal(body.requestKey, autorunRequestKey(runId, 'confirm'));
  assert.equal(body.sources.nativeReview, 'SKIP');
  assert.deepEqual(body.sources.metric, { decision: 'USE_PREPARED', packageId: row.packageId });
  assert.deepEqual(body.selectedProductIds, [SYNTHETIC_CARD_ID]);
  // Fewer than five eligible links still continues; the unrelated row is never picked.
  assert.deepEqual(body.exactShopeeUrls, ['https://shopee.vn/product/201/101', 'https://shopee.vn/product/202/102', 'https://shopee.vn/product/203/103']);
  assert.ok(row.pickId && /^[0-9a-f]{64}$/.test(row.pickId));
  const manifest = f.db.prepare('SELECT media_type mediaType FROM artifact_manifests WHERE sha256=?').get(row.pickId) as { mediaType: string } | undefined;
  assert.equal(manifest?.mediaType, 'application/json', 'pick record is a registered content-addressed artifact');
});

test('restart during CAPTURE stops the row as CAPTURE_INTERRUPTED and never re-runs the capture', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CAPTURE', 'RUNNING']);
  const restarted = f.make();
  await restarted.recoverOnStart();
  const stopped = autorun(f.db, runId)!;
  assert.deepEqual([stopped.phase, stopped.stopCode], ['STOPPED', 'CAPTURE_INTERRUPTED']);
  assert.ok(stopped.stopDetail!.length <= 300 && !/[\\/]/.test(stopped.stopDetail!), 'stop detail is short and path-free');
  await drain(restarted);
  // The old process finishing late cannot revive the stopped row.
  f.capture.release(runId); await f.service.settleAutoRunCaptures();
  assert.equal(autorun(f.db, runId)!.stopCode, 'CAPTURE_INTERRUPTED');
  assert.equal(f.capture.calls.length, 1);
});

test('restart during CONFIRM replays the same request key without a duplicate confirmation', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  f.service.hangAfterConfirm = true;
  // Drive until the confirm is accepted but the process "dies" before the write-back.
  for (let i = 0; i < 50 && f.service.confirms.length === 0; i++) {
    const step = f.service.processNext();
    const moved = await Promise.race([step, new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 200))]);
    if (moved === 'hung') break;
    if (!moved) await f.service.settleAutoRunCaptures();
  }
  assert.equal(f.service.confirms.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CONFIRM', 'RUNNING']);
  const confirmKey = autorunRequestKey(runId, 'confirm');
  assert.equal(requestCount(f.db, confirmKey), 1);
  const restarted = f.make();
  await restarted.recoverOnStart();
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CONFIRM', 'QUEUED']);
  await drain(restarted);
  assert.equal(restarted.confirms.length, 1);
  assert.equal((restarted.confirms[0] as { requestKey: string }).requestKey, confirmKey);
  assert.deepEqual(restarted.confirms[0], f.service.confirms[0], 'replay sends the exact recorded request');
  assert.equal(requestCount(f.db, confirmKey), 1);
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
  assert.equal(f.capture.calls.length, 1);
});

test('owner confirming by hand first stops the auto-run as SCOPE_CHANGED_BY_OWNER', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  const awaiting = await f.service.getRun(workspaceId, runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic owner scope', includeTerms: [keyword], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  f.capture.release(runId);
  await drain(f.service);
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.phase, row.stopCode], ['STOPPED', 'SCOPE_CHANGED_BY_OWNER']);
  assert.equal(f.service.confirms.length, 1, 'only the owner confirmation was sent');
  assert.equal(requestCount(f.db, autorunRequestKey(runId, 'confirm')), 0);
});

test('cancel during capture aborts it and stops the row as CANCELLED', async t => {
  const f = await fixture(t, 'on', () => 'abortable');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.signals[0]!.aborted, false);
  const run = await f.service.getRun(workspaceId, runId);
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: run.revision });
  assert.equal(f.capture.signals[0]!.aborted, true);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'CANCELLED']);
  await drain(f.service);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'CANCELLED'], 'the cancel wins over the late capture result');
  assert.equal(f.capture.calls.length, 1);
});

test('two runs: only one capture runs at a time', async t => {
  let first: string | undefined;
  const f = await fixture(t, 'on', runId => { first ??= runId; return runId === first ? 'hold' : 'ok'; });
  const a = await startRun(f.service);
  const b = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.calls.length, 1);
  const waiting = f.capture.calls[0]!.runId === a ? b : a;
  assert.deepEqual([autorun(f.db, waiting)!.phase, autorun(f.db, waiting)!.state], ['CAPTURE', 'QUEUED']);
  f.capture.release(f.capture.calls[0]!.runId);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 2);
  assert.equal(f.capture.maxActive, 1);
  assert.equal(autorun(f.db, a)!.phase, 'DONE');
  assert.equal(autorun(f.db, b)!.phase, 'DONE');
});

test('a login stop also stops the other queued captures of the workspace', async t => {
  const f = await fixture(t, 'on', () => ({ ok: false, code: 'METRIC_LOGIN_REQUIRED', detail: 'login required', executorCalls: 1 }));
  const a = await startRun(f.service);
  const b = await startRun(f.service);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  for (const runId of [a, b]) assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'METRIC_LOGIN_REQUIRED']);
  for (const runId of [a, b]) assert.equal((await f.service.getRun(workspaceId, runId)).status, 'AWAITING_SCOPE', 'the run stays open for the owner');
});

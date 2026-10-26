import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, startRun, workspaceId, autorun, drain } from '../helpers/autorun-harness.js';
import { metricV3Defaults } from '../../src/shared/metric-v3-preset.js';
import { planScope } from '../../src/modules/analysis/research-automation/autorun-scope.js';
import { runMetricCapture } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';

test('V3S1 owner preset survives restart, reaches capture unchanged once, rejects invalid rows and preserves the preparation boundary', async t => {
  const calls: any[] = [];
  const f = await fixture(t, 'on', undefined, () => async (_config, request) => {
    calls.push(request);
    return { ok: true, captureDir: join(f.capture.captureRoot, request.runId, 'v3'), period: request.requestedPeriod!, executorCalls: 0 };
  });
  const runId = await startRun(f.service);
  // Synthetic saved first lookup; no live executor or provider is used.
  // Stop before processNext can launch a capture, then resume from the actual wait boundary.
  while ((await f.service.getRun(workspaceId, runId)).status !== 'AWAITING_SCOPE') await f.service.processNext();
  f.db.prepare("UPDATE research_automation_autorun SET phase='STOPPED',phase_state='QUEUED',stop_code='KEYWORD2_AWAITING' WHERE run_id=?").run(runId);
  const dir = join(f.capture.captureRoot, runId);
  await mkdir(join(dir, 'run1'), { recursive: true });
  await writeFile(join(dir, 'run1', 'raw-responses.json'), JSON.stringify({ responses: [] }));
  const scope = planScope({ runId, keyword1: 'canxi viên',
    category: { reason: 'DOMINANT', category: { id: 'c2140822537', label: 'Thực phẩm chức năng' }, top: null, threshold: 0.7, productType: null, interviewMatch: null, shares: null },
    keyword2: { chosen: { term: 'calcium', source: 'TITLE', titles: 5, titleShare: 0.5, brands: 3, revenue: 100, kept: true }, candidates: [], titleCount: 10, modelVariants: 'NOT_CONFIGURED' } });
  await writeFile(join(dir, 'scope.json'), JSON.stringify(scope));
  // Keyword 2 may equal the original keyword 1 after the owner changes keyword 1.
  const preset = metricV3Defaults('canxi dạng viên', 'canxi viên', '2026-01-30');
  for (const mutate of [
    (p: any) => { p.preset.keywords[0] = ''; },
    (p: any) => { p.preset.category.id = 'c999'; },
    (p: any) => { p.preset.category.children[0].id = 'c999'; },
    (p: any) => { p.preset.smartQuery = false; },
    (p: any) => { p.preset.keywords[1] = 'different'; },
  ]) {
    const invalid = structuredClone(preset); mutate(invalid);
    await assert.rejects(f.service.retryAutoRunCapture(workspaceId, runId, { contractVersion: 'research-automation-autorun-keyword-v1', requestKey: randomUUID(), keyword2: 'canxi viên', metricV3Preset: invalid }));
    assert.equal(autorun(f.db, runId)?.stopCode, 'KEYWORD2_AWAITING');
    assert.equal(calls.length, 0);
  }
  const answer = { contractVersion: 'research-automation-autorun-keyword-v1', requestKey: randomUUID(), keyword2: 'canxi viên', metricV3Preset: preset };
  const receipt = await f.service.retryAutoRunCapture(workspaceId, runId, answer);
  assert.equal(receipt.exactRetry, false);
  assert.equal(calls.length, 0, 'acceptance queues work without executing it');
  const restarted = f.make();
  assert.equal((await restarted.retryAutoRunCapture(workspaceId, runId, answer)).exactRetry, true);
  await drain(restarted);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].metricV3Preset, preset);
  assert.equal(calls[0].second, undefined, 'the full preset uses the v3 capture path');
  // Exercise the real runner's admission guards: a fake capture returning OK alone
  // cannot prove the edited keyword and both windows are accepted by the runner.
  const capture = await runMetricCapture({ enabledEnv: '1', captureRoot: f.capture.captureRoot }, calls[0], {
    sourceEnv: {},
    createProcessRunner: () => async (_executable, argv) => ({
      child: { kill: () => true },
      completion: Promise.resolve({ exitCode: 0, stderr: '', stdout: JSON.stringify(
        argv[2] === 'tab' ? { page: 'ABC123' } : argv[5]?.includes('ready:') ? { ready: true } : { stop: 'CAPTURE_LOGIN_REQUIRED' },
      ) }),
    }),
  });
  assert.equal(capture.ok, false);
  assert.equal(!capture.ok && capture.code, 'CAPTURE_LOGIN_REQUIRED', 'confirmed scope must reach the fake browser, past keyword and period guards');
  assert.equal(capture.executorCalls, 1);
  assert.equal(autorun(f.db, runId)?.stopCode, 'CAPTURE_V3_PREPARE_UNSUPPORTED');
  await assert.rejects(restarted.retryAutoRunCapture(workspaceId, runId, { ...answer, requestKey: randomUUID() }));
  assert.equal(calls.length, 1);
});

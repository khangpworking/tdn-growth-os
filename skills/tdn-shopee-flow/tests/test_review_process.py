"""Step 4 (save -> Jev filter -> Jev label) rows of shopee_flow.py: automatic start after an M3 PASS, the
«Chạy tiếp» hand-off and runs-progress. A fake `node` records every step-4 call; no TS, DB writer or Jev runs."""
import hashlib
import json
import os
import pathlib
import sqlite3
import stat
import shutil
import sys
import time

from test_flow import FAKE_NODE, RUN_ID, SCRIPT, FlowTest, request_payload, write_json

SHA = 'a' * 64
ATTEMPT = '11111111-1111-4111-8111-111111111111'

STEP4_NODE = FAKE_NODE.replace(
    "elif script.endswith(('module-review-sampling.ts', 'module-review-data.ts')) and os.environ.get('REAL_TS_SAMPLING') == '1':",
    '''elif script.endswith('module-review-data.ts') and args[index + 1].startswith('process'):
    with open(os.environ['STEP4_LOG'], 'a', encoding='utf8') as log:
        log.write(json.dumps([args[index + 1], pathlib.Path(args[index + 2]).name, *args[index + 3:]]) + '\\n')
    if os.environ.get('STEP4_FAIL'):
        print(json.dumps({'format': 'error-v1', 'code': os.environ['STEP4_FAIL'], 'message': os.environ['STEP4_FAIL']}))
        sys.exit(20)
    if args[index + 1] == 'process-views':
        views = json.loads(pathlib.Path(os.environ['STEP4_VIEWS']).read_text()) if os.environ.get('STEP4_VIEWS') else {}
        error = {'format': 'error-v1', 'code': 'REVIEW_DATA_FAILED', 'message': 'REVIEW_DATA_FAILED'}
        print(json.dumps([views.get(pathlib.Path(run).name, error) for run in args[index + 2:]]))
        sys.exit(0)
    if args[index + 1] == 'process':
        time.sleep(float(os.environ.get('STEP4_SLEEP', '0')))
        print(json.dumps({'format': 'review-process-start-v1', 'runId': pathlib.Path(args[index + 2]).name,
                          'sourceSha256': args[index + 3], 'status': 'PASS', 'pid': os.getpid()}))
    else:
        print(json.dumps({'format': 'review-process-check-v1'}))
elif script.endswith('module-review-sampling.ts') and args[index + 1] in ('reserve', 'execute'):
    run = pathlib.Path(args[index + 2])
    attempt = '11111111-1111-4111-8111-111111111111'
    if args[index + 1] == 'reserve':
        print(json.dumps({'attemptId': attempt}))
    else:
        verdict = os.environ.get('FAKE_M3_VERDICT', 'PASS')
        write(run / 'm3-custom' / 'attempts' / attempt / 'gate.json', {
            'format': 'handoff-v1', 'module': 'M3', 'runId': run.name, 'skillVersion': 'custom-review-sampling-v1',
            'verdict': verdict, 'inputSha256': None, 'outputSha256': None, 'checks': [], 'errorCode': None if verdict == 'PASS' else 'SOURCE_JOB_FAILED', 'next': None})
        print(json.dumps({'attemptId': attempt, 'status': 'SUCCEEDED' if verdict == 'PASS' else 'FAILED'}))
elif script.endswith(('module-review-sampling.ts', 'module-review-data.ts')) and os.environ.get('REAL_TS_SAMPLING') == '1':''')
STEP4_NODE = STEP4_NODE.replace("elif script.endswith('module-collect-public.ts'):", '''elif script.endswith('module-collect-public.ts') and os.environ.get('FAKE_M3_VERDICT') == 'FAIL':
    run = pathlib.Path(args[index + 1])
    write(run / 'm3' / 'reviews.json', [])
    write(run / 'm3' / 'outcome.json', {'format': 'm3-outcome-v1', 'verdict': 'FAILED', 'errorCode': 'SOURCE_JOB_FAILED'})
elif script.endswith('module-collect-public.ts'):''')
assert STEP4_NODE.count('FAKE_M3_VERDICT') == 2


def slip(module, run_id, input_sha=None, output_sha=None, verdict='PASS'):
    return {'format': 'handoff-v1', 'module': module, 'runId': run_id, 'skillVersion': '1.0.0', 'verdict': verdict,
            'inputSha256': input_sha, 'outputSha256': output_sha, 'checks': [], 'errorCode': None,
            'next': {'M1': 'M2', 'M2': 'M3'}.get(module) if verdict == 'PASS' else None}


class ReviewProcessFlowTest(FlowTest):
    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(STEP4_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        self.log = pathlib.Path(self._tmp.name) / 'step4.log'

    def env(self, extra=None):
        env = super().env(extra)
        env['TDN_WORKSPACE_DB'] = str(pathlib.Path(self._tmp.name) / 'app.db')
        env['STEP4_LOG'] = str(self.log)
        return env

    def step4_calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def mark_auto(self, run):
        write_json(run / 'm4' / 'auto.json', {'format': 'review-process-auto-v1', 'runId': run.name, 'createdAt': '2026-11-16T00:00:00+00:00'})

    def passed_m2(self, run):
        write_json(run / 'm2' / 'selection.json', {'format': 'selection-v1', 'runId': run.name})
        digest = hashlib.sha256((run / 'm2' / 'selection.json').read_bytes()).hexdigest()
        write_json(run / 'gates' / 'm2.json', slip('M2', run.name, None, digest))


class AutoRunTests(ReviewProcessFlowTest):
    def test_full_flow_starts_step4_after_m3_pass_and_not_after_m3_fail(self):
        run = self.make_run(request=request_payload(cap=5))
        self.mark_auto(run)
        rc, payload, stderr = self.command('run', '--run', RUN_ID, extra_env={'FAKE_M3_VERDICT': 'FAIL'})
        self.assertNotEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['stoppedAt'], 'm3', payload)
        self.assertEqual(self.step4_calls(), [])
        for path in ('m1', 'm2', 'm3', 'gates', 'executions'):
            shutil.rmtree(run / path, ignore_errors=True)
        write_json(run / 'state.json', {'format': 'state-v1', 'runId': RUN_ID, 'status': 'IDLE', 'mode': None, 'module': None,
                                        'pid': None, 'startedAt': None, 'endedAt': None, 'errorCode': None, 'failedCheck': None})
        rc, payload, stderr = self.command('run', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual((payload['status'], payload['stoppedAt']), ('DONE', None), 'the run result keeps its old meaning')
        self.assertEqual(json.loads((run / 'state.json').read_text())['status'], 'DONE')
        self.assertEqual(self.step4_calls(), [['process-auto', RUN_ID, 'legacy']])

    def test_review_attempt_path_starts_step4_after_a_passing_attempt_only(self):
        for run_id in (RUN_ID, 'b2c3d4e5'):
            run = self.make_run(run_id=run_id)
            self.mark_auto(run)
            self.passed_m2(run)
        rc, payload, stderr = self.command('m3', '--run', RUN_ID, '--plan-sha256', SHA, extra_env={'FAKE_M3_VERDICT': 'FAIL'})
        self.assertEqual((rc, payload.get('status'), self.step4_calls()), (20, 'FAILED', []), (payload, stderr))
        rc, payload, stderr = self.command('m3', '--run', 'b2c3d4e5', '--plan-sha256', SHA)
        self.assertEqual((rc, payload.get('status')), (0, 'SUCCEEDED'), (payload, stderr))
        self.assertEqual(self.step4_calls(), [['process-auto', 'b2c3d4e5', ATTEMPT]])

    def test_a_failed_automatic_start_shows_step4_fail_with_a_resumable_source_and_keeps_the_m3_result(self):
        run = self.make_run(request=request_payload(cap=5))
        self.mark_auto(run)
        rc, payload, stderr = self.command('run', '--run', RUN_ID, extra_env={'STEP4_FAIL': 'REVIEW_SOURCE_CHANGED'})
        self.assertEqual((rc, payload['status']), (0, 'DONE'), (payload, stderr))
        self.assertEqual(self.step4_calls(), [['process-auto', RUN_ID, 'legacy']])
        link = json.loads((run / 'm4' / 'm3' / 'legacy.json').read_text())
        self.assertEqual((link['format'], link['m3'], link['sourceSha256'], link['errorCode']),
                         ('review-process-link-v1', 'legacy', None, 'REVIEW_SOURCE_CHANGED'))
        self.assertEqual(link['m3OutputSha256'], json.loads((run / 'gates' / 'm3.json').read_text())['outputSha256'])
        rc, progress, _ = self.command('runs-progress')
        mine = next(r for r in progress['runs'] if r['runId'] == RUN_ID)
        self.assertEqual((mine['steps'], mine['finished']), (['PASS', 'PASS', 'PASS', 'FAIL'], False))

    def test_new_runs_carry_the_auto_marker_and_runs_without_it_never_start_step4(self):
        run = self.make_run(request=request_payload(cap=5))
        rc, payload, stderr = self.command('run', '--run', RUN_ID)
        self.assertEqual((rc, payload['status']), (0, 'DONE'), (payload, stderr))
        self.assertEqual(self.step4_calls(), [])
        self.assertFalse((run / 'm4').exists(), 'nothing is written for an old run')
        self.write_preset()
        rc, payload, stderr = self.command('new-run', '--stdin', stdin=json.dumps({'presetId': 'kem', 'endDate': '2026-11-10'}))
        self.assertEqual(rc, 0, (payload, stderr))
        marker = json.loads((self.runs / payload['runId'] / 'm4' / 'auto.json').read_text())
        self.assertEqual((marker['format'], marker['runId']), ('review-process-auto-v1', payload['runId']))


class ResumeTests(ReviewProcessFlowTest):
    def test_process_review_data_detaches_a_worker_that_keeps_the_run_lock(self):
        run = self.make_run()
        rc, payload, stderr = self.command('process-review-data', '--run', RUN_ID, '--source-sha256', SHA, '--detach',
                                           extra_env={'STEP4_SLEEP': '3'})
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(set(payload), {'format', 'runId', 'sourceSha256', 'status', 'pid'})
        self.assertEqual((payload['format'], payload['runId'], payload['sourceSha256'], payload['status']),
                         ('review-process-start-v1', RUN_ID, SHA, 'RUNNING'))
        state = json.loads((run / 'm4' / SHA / 'state.json').read_text())
        self.assertEqual((state['status'], state['pid']), ('RUNNING', payload['pid']))
        self.assertEqual(sorted(p.name for p in run.iterdir()), ['.module.lock', 'm4', 'request.json', 'state.json'], 'step 4 writes only under m4/')
        self.assertEqual(len(list((run / 'm4' / 'logs').glob('*-review-process.log'))), 1)
        rc, busy, _ = self.command('process-review-data', '--run', RUN_ID, '--source-sha256', SHA)
        self.assertEqual((rc, busy['code']), (24, 'RUN_BUSY'))
        deadline = time.time() + 20
        while len(self.step4_calls()) < 2 and time.time() < deadline:
            time.sleep(0.1)
        self.assertEqual(self.step4_calls(), [['process-check', RUN_ID, SHA], ['process', RUN_ID, SHA]])
        rc, invalid, _ = self.command('process-review-data', '--run', RUN_ID, '--source-sha256', 'not-a-sha')
        self.assertEqual((rc, invalid['code']), (2, 'REVIEW_DATA_INVALID'))


class RunsProgressTests(ReviewProcessFlowTest):
    """runs-progress takes step 4 from the TS view (one node call); the PASS rule itself is tested on the TS side."""

    def passed_steps(self, run):
        for module in ('m1', 'm2', 'm3'):
            write_json(run / 'gates' / f'{module}.json', slip(module.upper(), run.name))
        write_json(run / 'm3' / 'reviews.json', [])

    def views(self, **runs):
        """One canned review-process-view-v1 per run id: a list of source states, or (states, running stage)."""
        value = {}
        for run_id, states in runs.items():
            states, running = states if isinstance(states, tuple) else (states, None)
            sources = []
            for state in states:
                stage = lambda name, done, total: {'state': 'RUNNING' if running == name and state == 'RUNNING' else 'IDLE', 'done': done, 'total': total}
                sources.append({'sourceSha256': SHA, 'state': state, 'stages': {'save': stage('save', 4, 6), 'filter': stage('filter', 2, 7),
                                                                                'label': stage('label', 1, 3)}})
            value[run_id] = {'format': 'review-process-view-v1', 'runId': run_id, 'autoRun': True, 'labelUnresolved': False, 'sources': sources}
        path = pathlib.Path(self._tmp.name) / 'views.json'
        path.write_text(json.dumps(value))
        return {'STEP4_VIEWS': str(path)}

    def progress(self, extra=None):
        rc, payload, stderr = self.command('runs-progress', extra_env=extra)
        self.assertEqual(rc, 0, (payload, stderr))
        return payload

    def test_step3_is_running_only_while_its_attempt_worker_is_live(self):
        for worker, pid, expected in (('dead', self.dead_pid, 'FAIL'), ('live', os.getpid(), 'RUNNING')):
            with self.subTest(worker=worker):
                run_id = f'run-m3-{worker}'
                run = self.make_run(run_id=run_id)
                for module in ('M1', 'M2'):
                    write_json(run / 'gates' / f'{module.lower()}.json', slip(module, run_id))
                write_json(run / 'executions' / 'm3.json', {
                    'module': 'M3', 'sequence': 1, 'status': 'RUNNING', 'pid': self.dead_pid,
                    'attemptId': ATTEMPT})
                write_json(run / 'm3-custom' / 'attempts' / ATTEMPT / 'state.json', {
                    'format': 'review-attempt-state-v1', 'runId': run_id, 'status': 'RUNNING', 'pid': pid})
                state_bytes = (run / 'state.json').read_bytes()
                attempt = run / 'm3-custom' / 'attempts' / ATTEMPT / 'state.json'
                attempt_bytes = attempt.read_bytes()

                progress = next(row for row in self.progress()['runs'] if row['runId'] == run_id)
                self.assertEqual(progress['steps'], ['PASS', 'PASS', expected, 'NOT_APPLICABLE'])
                self.assertFalse(progress['finished'])
                if worker == 'live':
                    self.assertEqual(progress['active']['step'], 3)
                else:
                    self.assertIsNone(progress['active'])
                self.assertEqual((run / 'state.json').read_bytes(), state_bytes)
                self.assertEqual(attempt.read_bytes(), attempt_bytes)
        self.assertEqual(self.step4_calls(), [])

    def test_runs_progress_reports_four_steps_the_active_stage_and_finished(self):
        old, done, live, saving, labelling = (self.make_run(run_id=r) for r in ('old00001', 'done0001', 'live0001', 'save0001', 'labl0001'))
        for run in (old, done, live, saving, labelling):
            self.passed_steps(run)
        for run in (done, live, saving, labelling):
            self.mark_auto(run)
        payload = self.progress(self.views(done0001=['PASS'], live0001=(['RUNNING'], 'filter'), save0001=(['RUNNING'], 'save'),
                                           labl0001=(['RUNNING'], 'label')))
        self.assertEqual(set(payload), {'format', 'generatedAt', 'runs'})
        self.assertEqual(payload['format'], 'runs-progress-v1')
        runs = {r['runId']: r for r in payload['runs']}
        for value in runs.values():
            self.assertEqual(set(value), {'runId', 'steps', 'active', 'finished', 'changedAt'})
        self.assertEqual((runs['old00001']['steps'], runs['old00001']['finished']), (['PASS', 'PASS', 'PASS', 'NOT_APPLICABLE'], True))
        self.assertEqual((runs['done0001']['steps'], runs['done0001']['finished']), (['PASS', 'PASS', 'PASS', 'PASS'], True))
        self.assertEqual((runs['live0001']['steps'], runs['live0001']['finished']), (['PASS', 'PASS', 'PASS', 'RUNNING'], False))
        self.assertEqual(runs['live0001']['active'], {'step': 4, 'stage': 'filter', 'done': 2, 'total': 7}, 'filter counts of the view, not save.done')
        self.assertEqual(runs['save0001']['active'], {'step': 4, 'stage': 'save', 'done': 4, 'total': 6}, 'the view knows the save total')
        self.assertEqual(runs['labl0001']['active'], {'step': 4, 'stage': 'label', 'done': 1, 'total': 3})
        self.assertIsNone(runs['old00001']['active'])
        calls = self.step4_calls()
        self.assertEqual([(c[0], sorted(pathlib.Path(r).name for r in c[1:])) for c in calls],
                         [('process-views', ['done0001', 'labl0001', 'live0001', 'save0001'])], 'one node call, only for runs with step-4 files')

    def test_step4_is_the_worst_source_of_the_ts_view_and_never_pass_without_the_view(self):
        cases = {'idle0001': (['PASS', 'IDLE'], 'IDLE'), 'fail0001': (['PASS', 'FAIL', 'RUNNING'], 'FAIL'), 'none0001': ([], 'IDLE'),
                 'pass0001': (['PASS', 'PASS'], 'PASS'), 'error001': (None, 'FAIL')}
        for run_id in cases:
            run = self.make_run(run_id=run_id)
            self.passed_steps(run)
            self.mark_auto(run)
        env = self.views(**{run_id: states for run_id, (states, _) in cases.items() if states is not None})
        runs = {r['runId']: r for r in self.progress(env)['runs']}
        for run_id, (_, expected) in cases.items():
            self.assertEqual((runs[run_id]['steps'][3], runs[run_id]['finished']), (expected, expected == 'PASS'), run_id)
        runs = {r['runId']: r for r in self.progress({**env, 'STEP4_FAIL': 'REVIEW_DATA_FAILED'})['runs']}
        self.assertEqual({r['steps'][3] for r in runs.values()}, {'FAIL'}, 'a failed node call never shows PASS')

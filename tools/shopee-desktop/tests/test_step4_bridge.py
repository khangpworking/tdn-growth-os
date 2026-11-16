"""Step 4 bridge routes: review-process, process-review-data, runs-progress and notify.

Payloads are the CONTRACT-STEP4 examples; no SSH, provider, database or network
call is made. Set STEP4_PAYLOAD_FIXTURES to a directory holding payloads recorded
from the step 4 backend (review-process.json, runs-progress.json) to validate
real payloads too.
"""
import copy
import json
import os
import pathlib
import sys
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app as app  # noqa: E402

SOURCE = 'c' * 64
CONFIG = {
    'remoteScript': '$HOME/synthetic/shopee-cli.py',
    'runsRoot': None, 'presetsRoot': None, 'remoteEnvFile': None, 'timeoutSeconds': 30,
}


def review_process_view():
    return {
        'format': 'review-process-view-v1', 'runId': 'a1b2c3d4', 'autoRun': True, 'labelUnresolved': False,
        'sources': [{
            'sourceSha256': SOURCE, 'state': 'RUNNING', 'errorCode': None,
            'startedAt': '2026-11-08T02:31:00Z', 'finishedAt': None, 'retries': 0, 'canResume': False,
            'fee': {'currency': 'USD', 'filter': 0.31, 'label': 2.6, 'total': 2.91, 'basis': 'ESTIMATE'},
            'stages': {
                'save': {'state': 'PASS', 'total': 531, 'done': 531, 'inserted': 412, 'alreadyPresent': 119},
                'filter': {'state': 'RUNNING', 'total': 531, 'done': 240, 'keep': 228, 'exclude': 5,
                           'unresolved': 3, 'noContent': 4},
                'label': {'state': 'IDLE', 'total': None, 'done': 0, 'unresolvedSkipped': None},
            },
            'gates': {'in': {'verdict': 'PASS', 'checks': [
                {'id': 'source_unchanged', 'ok': True, 'level': 'error', 'got': 'match'}]}, 'out': None},
        }],
    }


def review_process_start():
    return {'format': 'review-process-start-v1', 'runId': 'a1b2c3d4', 'sourceSha256': SOURCE,
            'status': 'RUNNING', 'pid': 12345}


def runs_progress():
    return {
        'format': 'runs-progress-v1', 'generatedAt': '2026-11-16T09:00:00Z',
        'runs': [{'runId': 'a1b2c3d4', 'steps': ['PASS', 'PASS', 'PASS', 'RUNNING'],
                  'active': {'step': 4, 'stage': 'filter', 'done': 240, 'total': 531},
                  'finished': False, 'changedAt': '2026-11-16T08:59:40Z'}],
    }


def answering(value):
    api = app.Api()
    api._remote = lambda *args, **kwargs: {'ok': True, 'data': copy.deepcopy(value)}
    return api


class Step4BridgeTest(unittest.TestCase):
    def test_review_process_accepts_the_contract_example_and_rejects_an_added_key(self):
        value = review_process_view()
        self.assertEqual(answering(value).reviewProcess('a1b2c3d4'), {'ok': True, 'data': value})
        for added in (lambda v: v.update(extra=1),
                      lambda v: v['sources'][0].update(extra=1),
                      lambda v: v['sources'][0]['stages']['filter'].update(extra=1),
                      lambda v: v['sources'][0]['gates']['in']['checks'][0].update(path='/x')):
            changed = review_process_view()
            added(changed)
            self.assertEqual(answering(changed).reviewProcess('a1b2c3d4')['error']['code'], 'REMOTE_OUTPUT_INVALID')

    def test_review_process_rejects_values_outside_the_contract_enums(self):
        for change in (lambda s: s.update(state='DONE'),
                       lambda s: s.update(state='FAIL', errorCode='LABELS_BUSY'),
                       lambda s: s.update(canResume=True),
                       lambda s: s['fee'].update(basis='INVOICE'),
                       lambda s: s['gates']['in']['checks'][0].update(id='kept_all_labelled')):
            value = review_process_view()
            change(value['sources'][0])
            self.assertEqual(answering(value).reviewProcess('a1b2c3d4')['error']['code'], 'REMOTE_OUTPUT_INVALID')

    def test_resume_sends_the_exact_source_detached_and_validates_the_start_reply(self):
        api = app.Api()
        _, lines = api._remote_plan('processReviewData', run_id='a1b2c3d4', config=CONFIG, source_sha256=SOURCE)
        self.assertTrue(lines[-1].endswith(
            'process-review-data --run a1b2c3d4 --source-sha256 ' + SOURCE + ' --detach'))
        value = review_process_start()
        self.assertEqual(answering(value).processReviewData('a1b2c3d4', SOURCE), {'ok': True, 'data': value})
        added = dict(value, extra=1)
        self.assertEqual(answering(added).processReviewData('a1b2c3d4', SOURCE)['error']['code'],
                         'REMOTE_OUTPUT_INVALID')
        self.assertEqual(answering(value).processReviewData('a1b2c3d4', 'not-a-sha')['error']['code'], 'ARG_INVALID')

    def test_runs_progress_accepts_the_contract_example_and_rejects_an_added_key(self):
        value = runs_progress()
        self.assertEqual(answering(value).runsProgress(), {'ok': True, 'data': value})
        for added in (lambda v: v.update(extra=1),
                      lambda v: v['runs'][0].update(name='kem'),
                      lambda v: v['runs'][0]['active'].update(eta=5),
                      lambda v: v['runs'][0].update(steps=['PASS', 'PASS', 'PASS', 'DONE']),
                      lambda v: v['runs'][0]['active'].update(step=3)):
            changed = runs_progress()
            added(changed)
            self.assertEqual(answering(changed).runsProgress()['error']['code'], 'REMOTE_OUTPUT_INVALID')

    def progress_code(self, steps, active, finished, changed_at='2026-11-16T08:59:40Z'):
        value = runs_progress()
        value['runs'][0].update(steps=steps, active=active, finished=finished, changedAt=changed_at)
        result = answering(value).runsProgress()
        return 'OK' if result['ok'] else result['error']['code']

    def test_runs_progress_finished_follows_the_contract_definition(self):
        for steps, finished, code in (
                (['PASS', 'PASS', 'PASS', 'PASS'], True, 'OK'),
                (['PASS', 'PASS', 'PASS', 'NOT_APPLICABLE'], True, 'OK'),
                (['PASS', 'PASS', 'FAIL', 'NOT_APPLICABLE'], False, 'OK'),
                (['PASS', 'PASS', 'PASS', 'PASS'], False, 'REMOTE_OUTPUT_INVALID'),
                (['PASS', 'PASS', 'FAIL', 'NOT_APPLICABLE'], True, 'REMOTE_OUTPUT_INVALID'),
                (['PASS', 'PASS', 'PASS', 'FAIL'], True, 'REMOTE_OUTPUT_INVALID')):
            self.assertEqual(self.progress_code(steps, None, finished), code, (steps, finished))
        running = {'step': 1, 'stage': None, 'done': None, 'total': None}
        self.assertEqual(self.progress_code(['RUNNING', 'IDLE', 'IDLE', 'IDLE'], running, True),
                         'REMOTE_OUTPUT_INVALID')

    def test_runs_progress_active_is_the_running_step(self):
        step3 = {'step': 3, 'stage': None, 'done': 320, 'total': 1500}
        self.assertEqual(self.progress_code(['PASS', 'PASS', 'RUNNING', 'IDLE'], step3, False), 'OK')
        for steps, active in ((['PASS', 'PASS', 'PASS', 'IDLE'], step3),
                              (['PASS', 'PASS', 'RUNNING', 'IDLE'], None),
                              (['PASS', 'RUNNING', 'IDLE', 'IDLE'], step3)):
            self.assertEqual(self.progress_code(steps, active, False), 'REMOTE_OUTPUT_INVALID', (steps, active))

    def test_runs_progress_has_at_most_one_running_step(self):
        step4 = {'step': 4, 'stage': 'filter', 'done': 240, 'total': 531}
        self.assertEqual(self.progress_code(['PASS', 'PASS', 'RUNNING', 'RUNNING'], step4, False),
                         'REMOTE_OUTPUT_INVALID')

    def test_runs_progress_requires_changed_at(self):
        self.assertEqual(self.progress_code(['PASS', 'PASS', 'PASS', 'PASS'], None, True, None),
                         'REMOTE_OUTPUT_INVALID')

    def test_gate_checks_follow_the_contract_order(self):
        def check(check_id):
            return {'id': check_id, 'ok': True, 'level': 'error', 'got': '0'}
        for side, ids, ok in (
                ('in', ['source_unchanged', 'not_saved_twice', 'fee_estimate_recorded'], True),
                ('out', ['all_rows_saved', 'one_filter_result_each', 'kept_all_labelled', 'no_new_label_on_excluded',
                         'no_failed_jev_call', 'receipt_complete'], True),
                ('in', ['review_ids_valid', 'source_unchanged'], False),
                ('out', ['all_rows_saved', 'all_rows_saved'], False)):
            value = review_process_view()
            value['sources'][0]['gates'][side] = {'verdict': 'PASS', 'checks': [check(i) for i in ids]}
            result = answering(value).reviewProcess('a1b2c3d4')
            self.assertEqual(result['ok'], ok, (side, ids))

    def test_step4_errors_cross_as_a_static_code_only(self):
        api = app.Api()
        api._remote = lambda *args, **kwargs: {'ok': False, 'error': {'code': 'RUN_BUSY', 'message': 'server text'}}
        self.assertEqual(api.processReviewData('a1b2c3d4', SOURCE),
                         {'ok': False, 'error': {'code': 'RUN_BUSY', 'message': 'RUN_BUSY'}})

    def test_notify_is_a_no_op_off_windows(self):
        with mock.patch.object(app.sys, 'platform', 'linux'), mock.patch.object(app.subprocess, 'run') as run:
            self.assertEqual(app.Api().notify('Lượt hoàn tất', 'kem: cả 4 bước đạt.'),
                             {'ok': True, 'data': {'shown': False}})
        run.assert_not_called()

    def test_windows_toast_passes_text_only_through_the_environment(self):
        title = "Bước 4 dừng vì lỗi'; Remove-Item x; <b>"
        body = 'kem $(calc) `n "quoted"'
        done = mock.Mock(returncode=0, stdout=b'', stderr=b'')
        with mock.patch.object(app.sys, 'platform', 'win32'), \
                mock.patch.object(app.subprocess, 'run', return_value=done) as run:
            self.assertEqual(app.Api().notify(title, body), {'ok': True, 'data': {'shown': True}})
        argv, options = run.call_args.args[0], run.call_args.kwargs
        self.assertTrue(argv[0].endswith('powershell.exe'))
        self.assertEqual(argv[1:6], ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand'])
        self.assertEqual(len(argv), 7)
        self.assertNotIn('shell', options)
        self.assertEqual((options['env']['TDN_TOAST_TITLE'], options['env']['TDN_TOAST_BODY']), (title, body))
        self.assertFalse(any('Remove-Item' in part or 'calc' in part for part in argv))

    @unittest.skipUnless(os.environ.get('STEP4_PAYLOAD_FIXTURES'), 'step 4 backend fixtures not provided')
    def test_recorded_real_payloads_validate(self):
        root = pathlib.Path(os.environ['STEP4_PAYLOAD_FIXTURES'])
        view = json.loads((root / 'review-process.json').read_text(encoding='utf8'))
        self.assertEqual(answering(view).reviewProcess(view['runId']), {'ok': True, 'data': view})
        progress = json.loads((root / 'runs-progress.json').read_text(encoding='utf8'))
        self.assertEqual(answering(progress).runsProgress(), {'ok': True, 'data': progress})


if __name__ == '__main__':
    unittest.main()

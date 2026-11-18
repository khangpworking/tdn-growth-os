"""`run-view` rows of shopee_flow.py: one streaming node process for every part (outputs included),
each part equal to the single command, a slow part that never discards info or finished parts, and
the exit code and error object each single command gives. A fake `node` serves canned parts and logs
each call."""
import argparse
import contextlib
import io
import json
import pathlib
import stat
import subprocess
import sys
from unittest import mock

from test_flow import RUN_ID, ROOT, SCRIPT, FlowTest, load_flow_script, request_payload

RUNVIEW_NODE = '''#!/usr/bin/env python3
import json, os, pathlib, sys, time

args = sys.argv[1:]
script = pathlib.Path(next(a for a in args if a.endswith('.ts'))).name
index = args.index(next(a for a in args if a.endswith('.ts')))
name = pathlib.Path(args[index + 1 if script == 'module-run-view.ts' else index + 2]).name
with open(os.environ['RUNVIEW_LOG'], 'a', encoding='utf8') as log:
    log.write(json.dumps([script, *args[index + 1:]]) + '\\n')

def sampling():
    return {'format': 'review-sampling-view-v1', 'runId': name, 'readonly': True, 'm2Digest': None, 'links': [],
            'defaultInput': {}, 'plans': [], 'counts': [], 'countRefresh': None, 'attempts': [], 'blockedBy': None}

def views():
    return {'sampling': sampling(),
            'reviewData': {'format': 'review-data-view-v1', 'runId': name, 'readonly': True, 'tracking': {},
                           'db': {'configured': False, 'schemaReady': False, 'blockedBy': None}, 'sources': []},
            'process': {'format': 'review-process-view-v1', 'runId': name, 'autoRun': False,
                        'labelUnresolved': False, 'sources': []},
            'stats': {'format': 'review-stats-v1', 'runId': name, 'sources': []},
            'insights': {'format': 'review-insights-v2', 'runId': name, 'codebookVersion': 'synthetic-v1', 'sources': []},
            'outputs': {'format': 'module-outputs-v1', 'runId': name}}

def emit(part, value=None, error=None, exit_code=20):
    line = {'part': part, 'ok': error is None}
    if error is None:
        line['value'] = value
    else:
        line.update(error=error, exitCode=exit_code)
    print(json.dumps(line), flush=True)

if script == 'module-run-view.ts':
    parts = ['sampling', 'reviewData', 'process']
    if '--result' in args[index + 2:]:
        parts += ['stats', 'insights']
    parts += ['outputs']
    for part in parts:
        if part == os.environ.get('RUNVIEW_STALL'):
            time.sleep(90)
        if part == os.environ.get('RUNVIEW_FAIL'):
            code = os.environ.get('RUNVIEW_CODE') or 'REVIEW_DATA_FAILED'
            emit(part, error={'code': code, 'message': code}, exit_code=int(os.environ.get('RUNVIEW_EXIT') or 20))
        else:
            emit(part, views()[part])
elif script == 'module-review-sampling.ts':
    print(json.dumps(sampling()))
elif script == 'module-metric-output.ts':
    if os.environ.get('RUNVIEW_OUTPUT_FAIL'):
        sys.exit(3)
    print(json.dumps(views()['outputs']))
elif script == 'module-review-data.ts':
    action = args[index + 1]
    if action == 'insight-comments':
        value = {'format': 'review-insight-comments-v1', 'bucket': args[index + 3],
                 'theme': args[index + 4] if len(args) > index + 4 else None, 'comments': []}
    else:
        value = {'view': views()['reviewData'], 'stats': views()['stats'],
                 'insights-summary': views()['insights'],
                 'insights': {'format': 'review-insights-v1', 'runId': name, 'codebookVersion': 'synthetic-v1', 'sources': []},
                 'process-view': views()['process']}[action]
    print(json.dumps(value))
else:
    sys.exit(3)
'''


class RunViewTest(FlowTest):
    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(RUNVIEW_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        self.log = pathlib.Path(self._tmp.name) / 'runview.log'

    def env(self, extra=None):
        env = super().env(extra)
        env['RUNVIEW_LOG'] = str(self.log)
        return env

    def calls(self):
        if not self.log.exists():
            return []
        return [[pathlib.Path(part).name if '/' in part else part for part in json.loads(line)]
                for line in self.log.read_text().splitlines()]

    def run_view(self, *flags, extra_env=None):
        return self.command('run-view', '--run', RUN_ID, *flags, extra_env=extra_env)

    def test_each_part_equals_the_single_command_and_run_view_starts_one_node(self):
        run = self.make_run(request=request_payload(cap=5))
        (run / 'm3-custom').mkdir()
        rc, view, stderr = self.run_view('--result')
        self.assertEqual(rc, 0, (view, stderr))
        self.assertEqual(set(view), {'format', 'runId', 'parts', 'errors'})
        self.assertEqual((view['format'], view['runId'], view['errors']), ('run-view-v1', RUN_ID, {}))
        self.assertEqual(self.calls(), [['module-run-view.ts', RUN_ID, '--result']],
                         'one node start for every part, outputs included')
        expected = {
            'info': self.command('run-info', '--run', RUN_ID)[1],
            'sampling': self.command('review-sampling', '--run', RUN_ID)[1],
            'reviewData': self.command('review-data', '--run', RUN_ID)[1],
            'outputs': self.command('outputs', '--run', RUN_ID)[1],
            'process': self.command('review-process', '--run', RUN_ID)[1],
            'stats': self.command('review-stats', '--run', RUN_ID)[1],
            'insights': self.command('review-insights', '--run', RUN_ID, '--summary')[1],
        }
        self.assertEqual(set(view['parts']), set(expected))
        for name, value in expected.items():
            self.assertEqual(view['parts'][name], value, name)

    def test_without_result_only_the_five_base_parts_are_built(self):
        run = self.make_run()
        (run / 'm3-custom').mkdir()
        rc, view, stderr = self.run_view()
        self.assertEqual(rc, 0, (view, stderr))
        self.assertEqual(set(view['parts']), {'info', 'sampling', 'reviewData', 'outputs', 'process'})
        self.assertEqual(self.calls(), [['module-run-view.ts', RUN_ID]],
                         'no --result, no source of stats/insights')

    def test_a_failed_part_stays_an_error_and_the_other_parts_still_return(self):
        run = self.make_run(request=request_payload(cap=5))
        (run / 'm3-custom').mkdir()
        rc, view, stderr = self.run_view('--result', extra_env={'RUNVIEW_FAIL': 'outputs',
                                                                'RUNVIEW_CODE': 'MODULE_OUTPUT_INVALID'})
        self.assertEqual(rc, 0, (view, stderr))
        self.assertNotIn('outputs', view['parts'])
        self.assertEqual(view['errors'], {'outputs': {'code': 'MODULE_OUTPUT_INVALID', 'message': 'MODULE_OUTPUT_INVALID'}})
        for name in ('info', 'sampling', 'reviewData', 'process', 'stats', 'insights'):
            self.assertIn(name, view['parts'])

    def test_a_stalled_part_keeps_info_and_every_finished_part(self):
        run = self.make_run(request=request_payload(cap=5))
        (run / 'm3-custom').mkdir()
        rc, view, stderr = self.run_view('--result', extra_env={'RUNVIEW_STALL': 'stats'})
        self.assertEqual(rc, 0, (view, stderr))
        self.assertEqual(set(view['parts']), {'info', 'sampling', 'reviewData', 'process'})
        self.assertEqual(view['parts']['info'], self.command('run-info', '--run', RUN_ID)[1])
        self.assertEqual(view['errors'], {
            'stats': {'code': 'REVIEW_DATA_FAILED', 'message': 'REVIEW_DATA_FAILED'},
            'insights': {'code': 'REVIEW_DATA_FAILED', 'message': 'REVIEW_DATA_FAILED'},
            'outputs': {'code': 'MODULE_OUTPUT_TIMEOUT', 'message': 'MODULE_OUTPUT_TIMEOUT'}})

    def test_an_invalid_node_command_keeps_the_exit_code_and_error_run_info_gives(self):
        run = self.make_run(request=request_payload(cap=5))
        (run / 'm3-custom').mkdir()
        flow = load_flow_script()
        config = json.loads((ROOT / 'skills/tdn-shopee-flow/modules.json').read_text())
        config['params']['nodeCommand'] = []
        outputs = []
        with contextlib.redirect_stdout(io.StringIO()) as out:
            with mock.patch.object(flow, 'module_config', return_value=(ROOT, config)), \
                 mock.patch.object(flow, 'module_run_folder', return_value=run):
                for command, namespace in (('run-info', argparse.Namespace(cmd='run-info', run_id=RUN_ID)),
                                           ('run-view', argparse.Namespace(run_id=RUN_ID, result=False))):
                    try:
                        (flow.cmd_flow_query if command == 'run-info' else flow.cmd_run_view)(namespace)
                    except SystemExit as exit_signal:
                        outputs.append((exit_signal.code, json.loads(out.getvalue())))
                    out.seek(0)
                    out.truncate()
        self.assertEqual(outputs[0], outputs[1], 'run-view reports the info error run-info gives')
        self.assertEqual(outputs[1], (20, {'format': 'error-v1', 'code': 'NODE_COMMAND_INVALID',
                                           'message': 'NODE_COMMAND_INVALID'}))

    def test_a_node_start_failure_reports_the_same_error_objects_as_the_single_commands(self):
        run = self.make_run()
        empty = pathlib.Path(self._tmp.name) / 'empty-bin'
        empty.mkdir()
        rc, view, stderr = self.run_view(extra_env={'PATH': str(empty)})
        self.assertEqual(rc, 0, (view, stderr))
        self.assertEqual(set(view['parts']), {'info'})
        self.assertEqual(view['errors'], {
            'sampling': {'code': 'REVIEW_INPUT_INVALID', 'message': 'REVIEW_INPUT_INVALID'},
            'reviewData': {'code': 'REVIEW_DATA_FAILED', 'message': 'REVIEW_DATA_FAILED'},
            'process': {'code': 'REVIEW_DATA_FAILED', 'message': 'REVIEW_DATA_FAILED'},
            'outputs': {'code': 'FLOW_INPUT_INVALID', 'message': 'Invalid or unreadable flow input.'}})
        rc, outputs, stderr = self.command('outputs', '--run', RUN_ID, extra_env={'PATH': str(empty)})
        self.assertEqual((rc, outputs), (2, {'format': 'error-v1', 'code': 'FLOW_INPUT_INVALID',
                                             'message': 'Invalid or unreadable flow input.'}), stderr)

    def test_a_sampling_failure_keeps_the_exit_code_the_sampling_command_gives(self):
        run = self.make_run(request=request_payload(cap=5))
        (run / 'm3-custom').mkdir()
        rc, payload, stderr = self.run_view(extra_env={'RUNVIEW_FAIL': 'sampling', 'RUNVIEW_CODE': 'REVIEW_PLAN_INVALID',
                                                       'RUNVIEW_EXIT': '2'})
        self.assertEqual((rc, payload), (2, {'format': 'error-v1', 'code': 'REVIEW_PLAN_INVALID',
                                             'message': 'REVIEW_PLAN_INVALID'}), stderr)

    def test_run_view_prints_vietnamese_text_as_utf8(self):
        run = self.make_run(request=request_payload(cap=5))
        (run / 'm3-custom').mkdir()
        proc = subprocess.run([sys.executable, str(SCRIPT), 'run-view', '--run', RUN_ID],
                              capture_output=True, text=True, env=self.env(), timeout=90)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('kem chống nắng', proc.stdout)

    def test_an_unreadable_run_makes_the_info_error_the_command_error(self):
        run = self.make_run()
        (run / 'request.json').unlink()
        (run / 'request.json').symlink_to(self._tmp.name)
        rc, payload, stderr = self.run_view()
        self.assertEqual((rc, payload), (2, {'format': 'error-v1', 'code': 'FLOW_INPUT_INVALID',
                                             'message': 'Invalid or unreadable flow input.'}), stderr)


class InsightCommentsCliTest(FlowTest):
    """The two Python-side widths of the insights command: the v1 action stays, v2 and comments are new actions."""

    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(RUNVIEW_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        self.log = pathlib.Path(self._tmp.name) / 'runview.log'
        self.make_run()

    def env(self, extra=None):
        env = super().env(extra)
        env['RUNVIEW_LOG'] = str(self.log)
        return env

    def actions(self):
        if not self.log.exists():
            return []
        return [[pathlib.Path(part).name if '/' in part else part for part in json.loads(line)]
                for line in self.log.read_text().splitlines()]

    def test_summary_selects_the_v2_action_and_keeps_v1_as_the_default(self):
        rc, value, stderr = self.command('review-insights', '--run', RUN_ID)
        self.assertEqual((rc, value['format']), (0, 'review-insights-v1'), stderr)
        rc, value, stderr = self.command('review-insights', '--run', RUN_ID, '--summary')
        self.assertEqual((rc, value['format']), (0, 'review-insights-v2'), stderr)
        self.assertEqual(self.actions(), [['module-review-data.ts', 'insights', RUN_ID],
                                          ['module-review-data.ts', 'insights-summary', RUN_ID]])

    def test_comment_list_takes_the_bucket_and_optional_theme_after_the_run(self):
        rc, value, stderr = self.command('review-insight-comments', '--run', RUN_ID, '--bucket', 'abc:all')
        self.assertEqual((rc, value['format']), (0, 'review-insight-comments-v1'), stderr)
        rc, value, stderr = self.command('review-insight-comments', '--run', RUN_ID, '--bucket', 'abc:all', '--theme', 'price')
        self.assertEqual((rc, value), (0, {'format': 'review-insight-comments-v1', 'bucket': 'abc:all',
                                           'theme': 'price', 'comments': []}), stderr)
        self.assertEqual(self.actions(), [['module-review-data.ts', 'insight-comments', RUN_ID, 'abc:all'],
                                          ['module-review-data.ts', 'insight-comments', RUN_ID, 'abc:all', 'price']])

    def test_a_missing_bucket_is_a_usage_error_in_the_json_shape(self):
        rc, value, stderr = self.command('review-insight-comments', '--run', RUN_ID)
        self.assertEqual((rc, value['code']), (2, 'USAGE'), stderr)
        self.assertEqual(self.actions(), [])

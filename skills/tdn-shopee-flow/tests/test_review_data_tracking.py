"""Run tracking and offline review-data commands.

Every case owns a temp runs/state/presets root and a fake `node`; no capture,
browser, service or provider is reached. The race case pauses the real new-run
process inside its own tracking publish via a test-supervised audit hook. That
is test instrumentation, not a production seam.
"""
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys
import time
import unittest

HERE = pathlib.Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from test_flow import END, PRESET, RUN_ID, SCRIPT, FlowTest, sha_folder, write_json  # noqa: E402

FAKE_NODE = '''#!/usr/bin/env python3
import json, os, pathlib, sys, uuid

pathlib.Path(os.environ['NODE_MARKER']).touch()
args = sys.argv[1:]
script = next(a for a in args if a.endswith('.ts'))
index = args.index(script)
action = args[index + 1]
run = pathlib.Path(args[index + 2])
run_id = run.name

if script.endswith('module-review-sampling.ts'):
    if action == 'reserve':
        print(json.dumps({'format': 'review-attempt-control-v1', 'runId': run_id,
                          'kind': args[index + 3], 'attemptId': str(uuid.uuid4()),
                          'status': 'RUNNING', 'pid': None, 'errorCode': None}))
    elif action == 'execute':
        print(json.dumps({'format': 'review-attempt-control-v1', 'runId': run_id,
                          'kind': args[index + 3], 'attemptId': args[index + 4],
                          'status': 'SUCCEEDED', 'pid': None, 'errorCode': None}))
    elif action == 'view':
        print(json.dumps({'format': 'review-sampling-view-v1', 'links': [], 'plans': []}))
    else:
        raise SystemExit('unexpected sampling action: ' + action)
elif script.endswith('module-review-data.ts'):
    if action == 'read':
        sys.stdout.buffer.write(b'synthetic-export-bytes')
    elif action == 'view':
        print(json.dumps({'format': 'review-data-view-v1'}))
    elif action == 'stats':
        print(json.dumps({'format': 'review-stats-v1'}))
    elif action == 'save':
        print(json.dumps({'format': 'review-data-saved-v1'}))
    elif action == 'export':
        print(json.dumps({'format': 'review-data-export-v1'}))
    else:
        raise SystemExit('unexpected review-data action: ' + action)
else:
    raise SystemExit('unexpected module script: ' + script)
'''

REPLACE_HOOK = '''import os, sys, time

directory = os.environ.get('TRACKING_RACE_DIR')
if directory:
    pending = os.path.join(directory, 'pending')
    release = os.path.join(directory, 'release')

    def hook(event, args):
        if event == 'os.rename' and len(args) >= 2:
            source, target = args[0], args[1]
            if (isinstance(target, str) and target.endswith('run-tracking.json')
                    and isinstance(source, str) and source.endswith('.tmp')):
                with open(pending, 'w') as marker:
                    marker.write(target)
                while not os.path.exists(release):
                    time.sleep(0.01)

    sys.addaudithook(hook)
'''


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manual_selection(run_id=RUN_ID):
    return {
        'format': 'selection-v1', 'runId': run_id, 'source': 'manual',
        'pickRuleVersion': 'manual', 'metricInputSha256': None,
        'links': [{'rank': 1, 'productBaseId': '1__200__100', 'shopId': '100', 'itemId': '200',
                   'url': 'https://shopee.vn/product/100/200', 'brand': None, 'revenue': 1000.0,
                   'reason': 'Manual synthetic pick'}],
        'counts': {'walked': 1, 'deleted': 0, 'notIncluded': 0, 'tokenGuardRejected': 0,
                   'eligible': 1, 'picked': 1, 'maskedRows': 0, 'maskedAboveLowestPick': 0},
    }


class TrackingTest(FlowTest):
    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(FAKE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)

    def cli(self, *args, input_text=None, env=None):
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], input=input_text,
                              capture_output=True, text=True, env=env or self.env(), timeout=90)
        try:
            payload = json.loads(proc.stdout) if proc.stdout.strip() else None
        except ValueError:
            payload = None
        return proc.returncode, payload, proc

    def tracking(self, run):
        path = pathlib.Path(run) / 'run-tracking.json'
        return json.loads(path.read_text(encoding='utf8')) if path.exists() else None

    def new_run(self):
        self.write_preset()
        rc, payload, proc = self.cli('new-run', '--stdin', input_text=json.dumps({
            'presetId': 'kem', 'endDate': END, 'reviewCapPerLink': 50}))
        self.assertEqual(rc, 0, (payload, proc.stderr))
        return self.runs / payload['runId']

    def gate_slip(self, module, input_sha, output_sha, run_id=RUN_ID):
        return {'format': 'handoff-v1', 'module': module, 'runId': run_id,
                'skillVersion': 'synthetic-tracking-v1', 'verdict': 'PASS',
                'inputSha256': input_sha, 'outputSha256': output_sha,
                'checks': [{'id': 'synthetic_fixture', 'ok': True, 'got': True}],
                'errorCode': None, 'next': None}


class NewRunTrackingTests(TrackingTest):
    def test_new_run_records_not_started_and_queries_change_no_file(self):
        run = self.new_run()
        record = self.tracking(run)
        self.assertEqual(record, {
            'format': 'run-tracking-v1', 'runId': run.name,
            'requestSha256': sha_file(run / 'request.json'), 'primaryKeyword': 'kem chống nắng',
            'createdAt': record['createdAt'], 'firstRunAt': None,
            'firstObservedLaunchAt': None, 'historyBasis': 'new-run'})
        self.assertIsInstance(record['createdAt'], str)
        before = sha_folder(self.runs), sha_folder(self.state)
        rc, info, proc = self.cli('run-info', '--run', run.name)
        self.assertEqual(rc, 0, (info, proc.stderr))
        self.assertEqual(info['tracking'], {
            'primaryKeyword': 'kem chống nắng', 'firstRunAt': None, 'timeBasis': 'not-started',
            'displayTimezone': 'Asia/Ho_Chi_Minh', 'lastKnownStartedAt': None})
        rc, listed, proc = self.cli('runs')
        self.assertEqual(rc, 0, (listed, proc.stderr))
        entry = next(item for item in listed['runs'] if item['runId'] == run.name)
        self.assertEqual(entry['tracking'], info['tracking'])
        self.assertEqual((sha_folder(self.runs), sha_folder(self.state)), before)
        self.assert_no_subprocess()

    def test_first_accepted_launch_freezes_new_run_first_run_at(self):
        run = self.new_run()
        before = self.tracking(run)
        manual = pathlib.Path(self._tmp.name) / 'manual-selection.json'
        write_json(manual, manual_selection(run.name))
        rc, payload, proc = self.cli('m2', '--run', run.name, '--manual', str(manual))
        self.assertEqual(rc, 0, (payload, proc.stderr))
        self.assertEqual(payload['verdict'], 'PASS')
        record = self.tracking(run)
        self.assertEqual(record['historyBasis'], 'new-run')
        self.assertIsNone(record['firstObservedLaunchAt'])
        self.assertIsInstance(record['firstRunAt'], str)
        self.assertEqual(record['requestSha256'], before['requestSha256'])
        self.assert_no_subprocess()

        rc, info, proc = self.cli('run-info', '--run', run.name)
        self.assertEqual(rc, 0, (info, proc.stderr))
        self.assertEqual(info['tracking']['timeBasis'], 'recorded-first-accepted')
        self.assertEqual(info['tracking']['firstRunAt'], record['firstRunAt'])
        self.assertEqual(info['tracking']['primaryKeyword'], 'kem chống nắng')
        self.assertEqual(info['tracking']['displayTimezone'], 'Asia/Ho_Chi_Minh')
        self.assertEqual(info['tracking']['lastKnownStartedAt'], info['state']['startedAt'])

        frozen = (run / 'run-tracking.json').read_bytes()
        rc, payload, proc = self.cli('m2', '--run', run.name, '--manual', str(manual))
        self.assertEqual(rc, 0, (payload, proc.stderr))
        self.assertEqual((run / 'run-tracking.json').read_bytes(), frozen,
                         'a later accepted launch never moves the first accepted time')
        self.assert_no_subprocess()


class LegacyTrackingTests(TrackingTest):
    def test_legacy_run_first_launch_records_observed_time_only(self):
        run = self.make_run()
        manual = pathlib.Path(self._tmp.name) / 'manual-selection.json'
        write_json(manual, manual_selection())
        self.assertIsNone(self.tracking(run))
        rc, payload, proc = self.cli('m2', '--run', RUN_ID, '--manual', str(manual))
        self.assertEqual(rc, 0, (payload, proc.stderr))
        record = self.tracking(run)
        self.assertEqual(record['historyBasis'], 'legacy-first-unproven')
        self.assertIsNone(record['firstRunAt'])
        self.assertIsNone(record['createdAt'])
        self.assertIsInstance(record['firstObservedLaunchAt'], str)
        self.assertEqual(record['requestSha256'], sha_file(run / 'request.json'))
        self.assert_no_subprocess()

        rc, info, proc = self.cli('run-info', '--run', RUN_ID)
        self.assertEqual(rc, 0, (info, proc.stderr))
        self.assertEqual(info['tracking']['timeBasis'], 'legacy-first-unproven')
        self.assertIsNone(info['tracking']['firstRunAt'])
        recorded = (run / 'run-tracking.json').read_bytes()
        rc, payload, proc = self.cli('m2', '--run', RUN_ID, '--manual', str(manual))
        self.assertEqual(rc, 0, (payload, proc.stderr))
        self.assertEqual((run / 'run-tracking.json').read_bytes(), recorded,
                         'the first observed legacy launch is never rewritten')
        self.assert_no_subprocess()


class RefusedLaunchTests(TrackingTest):
    def test_busy_readonly_and_invalid_starts_never_accept(self):
        busy = self.make_run('busy0001', state={
            'format': 'state-v1', 'runId': 'busy0001', 'status': 'RUNNING', 'mode': 'flow',
            'module': 'M1', 'pid': os.getpid(), 'startedAt': '2026-11-10T01:00:00Z',
            'endedAt': None, 'errorCode': None, 'failedCheck': None})
        rc, payload, proc = self.cli('run', '--run', 'busy0001')
        self.assertEqual(rc, 24, (payload, proc.stderr))
        self.assertEqual(payload['errorCode'], 'RUN_BUSY')
        self.assertIsNone(self.tracking(busy))
        self.assert_no_subprocess()

        readonly = self.make_run('readonly1')
        env = self.env()
        env['TDN_SHOPEE_FLOW_READONLY'] = '1'
        rc, payload, proc = self.cli('run', '--run', 'readonly1', env=env)
        self.assertEqual(rc, 20, (payload, proc.stderr))
        self.assertEqual(payload['stoppedAt'], 'entry')
        self.assertIsNone(self.tracking(readonly))
        self.assert_no_subprocess()

        refusal = self.make_run('invalid01')
        manual = pathlib.Path(self._tmp.name) / 'invalid-selection.json'
        write_json(manual, {**manual_selection('invalid01'), 'metricInputSha256': 'a' * 64})
        rc, payload, proc = self.cli('m2', '--run', 'invalid01', '--manual', str(manual))
        self.assertEqual(rc, 20, (payload, proc.stderr))
        self.assertEqual(payload['errorCode'], 'MANUAL_SELECTION_INVALID')
        self.assertIsNone(self.tracking(refusal))
        self.assert_no_subprocess()

        missing = self.make_run('missing01')
        rc, payload, proc = self.cli('m1', '--run', 'missing01')
        self.assertEqual(rc, 22, (payload, proc.stderr))
        self.assertEqual(payload['errorCode'], 'GATE_NOT_PASSED')
        self.assertIsNone(self.tracking(missing))
        self.assert_no_subprocess()

    def test_successful_count_reserve_and_offline_review_data_never_accept(self):
        counts = self.make_run('counts01')
        selection = {'format': 'selection-v1', 'runId': 'counts01', 'source': 'manual',
                     'pickRuleVersion': 'manual', 'metricInputSha256': None,
                     'links': manual_selection()['links'], 'counts': manual_selection()['counts']}
        write_json(counts / 'm2/selection.json', selection)
        write_json(counts / 'gates/m2.json', self.gate_slip(
            'M2', None, sha_file(counts / 'm2/selection.json'), 'counts01'))
        rc, payload, proc = self.cli('review-counts', '--run', 'counts01')
        self.assertEqual(rc, 0, (payload, proc.stderr))
        self.assertEqual(payload['status'], 'SUCCEEDED')
        self.assertIsNone(self.tracking(counts), 'a count reserve is not a run launch')
        self.assertTrue(self.marker.exists(), 'the count path reached its node boundary')

        offline = self.make_run('offline1')
        for args, input_text, expected in (
                (('review-data', '--run', 'offline1'), None, 'review-data-view-v1'),
                (('review-stats', '--run', 'offline1'), None, 'review-stats-v1'),
                (('review-sampling', '--run', 'offline1'), None, 'review-sampling-view-v1'),
                (('save-review-data', '--run', 'offline1', '--stdin'), '{"synthetic":true}', 'review-data-saved-v1'),
                (('export-review-data', '--run', 'offline1', '--stdin'), '{"format":"json"}', 'review-data-export-v1')):
            rc, value, proc = self.cli(*args, input_text=input_text)
            self.assertEqual(rc, 0, (value, proc.stderr))
            self.assertEqual(value['format'], expected)
            self.assertIsNone(self.tracking(offline), f'{args[0]} must not launch a run')
        rc, value, proc = self.cli('read-review-export', '--run', 'offline1',
                                   '--export-sha256', 'a' * 64)
        self.assertEqual(rc, 0, (value, proc.stderr))
        self.assertEqual(proc.stdout, 'synthetic-export-bytes')
        self.assertIsNone(self.tracking(offline))


class CreationLaunchRaceTests(TrackingTest):
    def test_creation_lock_refuses_a_concurrent_launch_without_erasing_it(self):
        base = pathlib.Path(self._tmp.name)
        race = base / 'race'
        hook = base / 'hook'
        race.mkdir()
        hook.mkdir()
        (hook / 'sitecustomize.py').write_text(REPLACE_HOOK, encoding='utf8')
        self.write_preset()
        env = self.env()
        env['PYTHONPATH'] = f'{hook}{os.pathsep}{env["PYTHONPATH"]}' if env.get('PYTHONPATH') else str(hook)
        env['TRACKING_RACE_DIR'] = str(race)
        env['TDN_WORKSPACE_DB'] = str(base / 'app.db')
        creation = subprocess.Popen([sys.executable, str(SCRIPT), 'new-run', '--stdin'],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True, env=env)
        released = False

        def release():
            nonlocal released
            if not released:
                (race / 'release').touch()
                released = True

        self.addCleanup(release)
        self.addCleanup(lambda: creation.kill() if creation.poll() is None else None)
        try:
            creation.stdin.write(json.dumps({'presetId': 'kem', 'endDate': END, 'reviewCapPerLink': 50}))
            creation.stdin.close()
            creation.stdin = None
            deadline = time.monotonic() + 20
            while not (race / 'pending').exists():
                if creation.poll() is not None:
                    out, err = creation.communicate()
                    self.fail(f'new-run exited before publishing tracking: {out} {err}')
                if time.monotonic() > deadline:
                    self.fail('new-run never reached its tracking publish')
                time.sleep(0.005)
            runs = [path for path in self.runs.iterdir() if (path / 'request.json').exists()]
            self.assertEqual(len(runs), 1)
            run = runs[0]
            self.assertFalse((run / 'run-tracking.json').exists())
            self.assertTrue((run / '.module.lock').exists(), 'creation owns the launch admission lock')
            self.assertTrue(any(path.name.startswith('.tracking-') and path.name.endswith('.tmp')
                                for path in run.iterdir()), 'new-run is paused before its tracking replace')

            launch_env = self.env()
            launch_env['TDN_WORKSPACE_DB'] = str(base / 'app.db')
            early = subprocess.run([sys.executable, str(SCRIPT), 'run', '--run', run.name],
                                   capture_output=True, text=True, env=launch_env, timeout=90)
            self.assertEqual(early.returncode, 24, (early.stdout, early.stderr))
            self.assertEqual(json.loads(early.stdout)['errorCode'], 'RUN_BUSY')
            self.assertIsNone(self.tracking(run), 'a refused concurrent launch writes no tracking')
            self.assertFalse((run / 'gates' / 'entry.json').exists())

            release()
            out, err = creation.communicate(timeout=30)
            self.assertEqual(creation.returncode, 0, (out, err))
            self.assertEqual(json.loads(out)['runId'], run.name)
            created = self.tracking(run)
            self.assertEqual(created['historyBasis'], 'new-run')
            self.assertIsNone(created['firstRunAt'])

            retried = subprocess.run([sys.executable, str(SCRIPT), 'run', '--run', run.name],
                                     capture_output=True, text=True, env=launch_env, timeout=90)
            self.assertNotEqual(retried.returncode, 0, retried.stdout)
            final = self.tracking(run)
            self.assertEqual(final['historyBasis'], 'new-run')
            self.assertIsNone(final['firstObservedLaunchAt'])
            self.assertIsNotNone(final['firstRunAt'],
                                 'the admitted launch must set and keep the first accepted time')
            self.assertEqual(final['requestSha256'], sha_file(run / 'request.json'))
            rc, info, proc = self.cli('run-info', '--run', run.name)
            self.assertEqual(rc, 0, (info, proc.stderr))
            self.assertEqual(info['tracking']['timeBasis'], 'recorded-first-accepted')
        finally:
            release()
            if creation.poll() is None:
                creation.kill()
                creation.communicate()


if __name__ == '__main__':
    unittest.main()

"""Transport regressions for the review sampling bridge routes.

Each case runs the real `Api` through its real subprocess transport, but points
`remoteScript` at a fake recorder. That proves the exact shell argv and stdin
payload the bridge builds without starting a run, a worker or a service call.
"""
import json
import os
import pathlib
import stat
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
APP_DIR = HERE.parent
ROOT = APP_DIR.parents[1]

sys.path.insert(0, str(APP_DIR))
import tdn_shopee_app  # noqa: E402

UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
PLAN = 'c' * 64

FAKE_REMOTE = r'''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
payload = None
if '--stdin' in args:
    try:
        payload = json.loads(sys.stdin.read())
    except ValueError:
        payload = None
with open(os.environ['BRIDGE_LOG'], 'a', encoding='utf-8') as handle:
    handle.write(json.dumps({'args': args, 'payload': payload}, sort_keys=True) + '\n')
if os.environ.get('BRIDGE_BAD_OUTPUT') == '1':
    print(json.dumps({'format': 'wrong-v1'}))
    raise SystemExit(0)

def arg(name):
    return next((args[i + 1] for i, item in enumerate(args) if item == name), None)

action, run = args[0], next((a for a in args[1:] if not a.startswith('-')), None)
if action == 'save-review-plan':
    out = {'format': 'review-plan-saved-v1', 'runId': run, 'planSha256': 'b' * 64, 'plan': {}}
elif action == 'review-sampling':
    out = {'format': 'review-sampling-view-v1', 'runId': run}
elif action == 'review-counts':
    out = {'format': 'review-counts-start-v1', 'runId': run, 'attemptId': PAYLOAD_ID,
           'status': 'RUNNING', 'pid': 4242}
elif action == 'm3' and arg('--plan-sha256'):
    out = {'format': 'review-attempt-start-v1', 'runId': run, 'planSha256': arg('--plan-sha256'),
           'attemptId': PAYLOAD_ID, 'status': 'RUNNING', 'pid': 4242}
elif action == 'm3':
    out = {'format': 'module-result-v1', 'runId': run, 'verdict': 'PASS'}
elif action in ('stop-review-attempt', 'reconcile-review-attempt'):
    out = {'format': 'review-attempt-control-v1', 'runId': run, 'kind': arg('--kind'),
           'attemptId': arg('--attempt'),
           'status': 'RUNNING' if action == 'reconcile-review-attempt' else 'STOP_REQUESTED',
           'pid': None, 'errorCode': None}
else:
    print(json.dumps({'format': 'error-v1', 'code': 'UNEXPECTED', 'message': 'UNEXPECTED'}))
    raise SystemExit(2)
print(json.dumps(out))
'''.replace('PAYLOAD_ID', repr(UUID))


class SamplingBridgeTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = pathlib.Path(self._tmp.name)
        self.runs, self.presets, self.state = (self.base / name for name in ('runs', 'presets', 'state'))
        for folder in (self.runs, self.presets, self.state):
            folder.mkdir()
        self.log = self.base / 'bridge.jsonl'
        remote = self.base / 'fake-remote.py'
        remote.write_text(FAKE_REMOTE, encoding='utf-8')
        remote.chmod(remote.stat().st_mode | stat.S_IXUSR)
        config = self.base / 'config.json'
        config.write_text(json.dumps({
            'sshCommand': ['bash', '-s'],
            'remoteScript': str(remote),
            'runsRoot': str(self.runs),
            'presetsRoot': str(self.presets),
            'timeoutSeconds': 60,
        }), encoding='utf-8')
        patch = mock.patch.dict(os.environ, {
            'TDN_SHOPEE_APP_CONFIG': str(config),
            'SHOPEE_FLOW_STATE': str(self.state),
            'BRIDGE_LOG': str(self.log),
            'PYTHONDONTWRITEBYTECODE': '1',
        })
        patch.start()
        self.addCleanup(patch.stop)
        self.addCleanup(os.environ.pop, 'BRIDGE_BAD_OUTPUT', None)
        os.environ.pop('BRIDGE_BAD_OUTPUT', None)
        self.api = tdn_shopee_app.Api()

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text(encoding='utf-8').splitlines()]

    def assert_argv(self, expected):
        self.assertEqual(self.calls()[-1]['args'], expected)

    def test_save_plan_sends_exact_four_keys_and_accepts_the_2000_cap(self):
        value = {'mode': 'stars', 'stars': [2, 1], 'totalPerLink': 2000, 'allocation': 'equal-stars'}
        result = self.api.saveReviewPlan('run-1', value)
        self.assertEqual(result, {'ok': True, 'data': {
            'format': 'review-plan-saved-v1', 'runId': 'run-1', 'planSha256': 'b' * 64, 'plan': {}}})
        call = self.calls()[-1]
        self.assertEqual(call['args'], ['save-review-plan', '--run', 'run-1', '--stdin'])
        self.assertEqual(call['payload'], {**value, 'stars': [1, 2]})
        self.assertEqual(set(call['payload']), {'mode', 'stars', 'totalPerLink', 'allocation'})

    def test_invalid_plan_inputs_never_reach_the_remote(self):
        cases = (
            {'mode': 'all', 'stars': [], 'totalPerLink': 2001, 'allocation': 'pooled'},
            {'mode': 'all', 'stars': [], 'totalPerLink': 0, 'allocation': 'pooled'},
            {'mode': 'all', 'stars': [], 'totalPerLink': True, 'allocation': 'pooled'},
            {'mode': 'stars', 'stars': [], 'totalPerLink': 10, 'allocation': 'pooled'},
            {'mode': 'all', 'stars': [1], 'totalPerLink': 10, 'allocation': 'pooled'},
            {'mode': 'stars', 'stars': [1, 1], 'totalPerLink': 10, 'allocation': 'pooled'},
            {'mode': 'all', 'stars': [], 'totalPerLink': 10, 'allocation': 'equal-stars'},
            {'mode': 'all', 'stars': [], 'totalPerLink': 10, 'allocation': 'pooled', 'extra': 1},
        )
        for value in cases:
            with self.subTest(value=value):
                self.assertEqual(self.api.saveReviewPlan('run-1', value), {
                    'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(self.calls(), [])

    def test_launch_passes_the_optional_plan_digest_exactly(self):
        result = self.api.runModule('run-1', 'm3', PLAN)
        self.assertTrue(result['ok'])
        self.assertEqual(result['data']['planSha256'], PLAN)
        self.assert_argv(['m3', '--run', 'run-1', '--plan-sha256', PLAN, '--detach'])

        self.log.unlink()
        self.assertTrue(self.api.runModule('run-1', 'm3')['ok'])
        self.assert_argv(['m3', '--run', 'run-1', '--detach'])
        self.assertEqual(self.calls()[-1]['payload'], None)

    def test_launch_rejects_a_plan_outside_m3_or_a_bad_digest(self):
        for module, digest in (('m2', PLAN), ('m3', 'C' * 64), ('m3', 'c' * 63)):
            with self.subTest(module=module, digest=digest):
                expected = 'ARG_INVALID'
                result = self.api.runModule('run-1', module, digest)
                self.assertEqual(result, {'ok': False, 'error': {'code': expected, 'message': expected}})
        self.assertEqual(self.calls(), [])

    def test_stop_and_reconcile_keep_the_exact_kind_and_attempt_id(self):
        stop = self.api.stopReviewAttempt('run-1', 'custom', UUID)
        self.assertTrue(stop['ok'])
        self.assertEqual(stop['data']['status'], 'STOP_REQUESTED')
        self.assert_argv(['stop-review-attempt', '--run', 'run-1', '--kind', 'custom', '--attempt', UUID])

        reconcile = self.api.reconcileReviewAttempt('run-1', 'counts', UUID)
        self.assertTrue(reconcile['ok'])
        self.assert_argv(['reconcile-review-attempt', '--run', 'run-1', '--kind', 'counts',
                          '--attempt', UUID, '--detach'])

    def test_control_rejects_unknown_kind_and_malformed_attempt(self):
        for kind, attempt in (('other', UUID), ('custom', ''), ('custom', '../escape'), ('custom', None)):
            with self.subTest(kind=kind, attempt=attempt):
                result = self.api.stopReviewAttempt('run-1', kind, attempt)
                self.assertEqual(result, {'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(self.calls(), [])

    def test_sampling_view_and_counts_refresh_use_their_own_routes(self):
        self.assertTrue(self.api.reviewSampling('run-1')['ok'])
        self.assert_argv(['review-sampling', '--run', 'run-1'])

        self.assertTrue(self.api.refreshReviewCounts('run-1')['ok'])
        self.assert_argv(['review-counts', '--run', 'run-1', '--detach'])

    def test_wrong_remote_shape_is_refused(self):
        os.environ['BRIDGE_BAD_OUTPUT'] = '1'
        self.assertEqual(self.api.reviewSampling('run-1'), {
            'ok': False, 'error': {'code': 'REMOTE_OUTPUT_INVALID', 'message': 'REMOTE_OUTPUT_INVALID'}})

    def test_invalid_run_ids_never_reach_the_remote(self):
        for value in (None, '', '../run', 'run\n1'):
            with self.subTest(value=value):
                self.assertEqual(self.api.reviewSampling(value), {
                    'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(self.calls(), [])


class RealCliArgumentTest(unittest.TestCase):
    """The bridge's own argv must satisfy the real argparse and save a plan."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs, self.presets, self.state = (base / name for name in ('runs', 'presets', 'state'))
        for folder in (self.runs, self.presets, self.state):
            folder.mkdir()
        run = self.runs / 'smoke-m3-001'
        run.mkdir()
        selection = {
            'format': 'selection-v1', 'runId': run.name, 'source': 'manual', 'pickRuleVersion': 'manual',
            'metricInputSha256': None,
            'links': [{
                'rank': 1, 'productBaseId': '1__200__100', 'shopId': '100', 'itemId': '200',
                'url': 'https://shopee.vn/product/100/200', 'brand': None, 'revenue': 1000,
                'reason': 'Synthetic link',
            }],
            'counts': {'walked': 1, 'deleted': 0, 'notIncluded': 0, 'tokenGuardRejected': 0,
                       'eligible': 1, 'picked': 1, 'maskedRows': 0, 'maskedAboveLowestPick': 0},
        }
        request = {'format': 'request-v1', 'preset': {'keywords': ['kem chống nắng']},
                   'windows': [{'id': '30d', 'period': {'startDate': '2026-10-01', 'endDate': '2026-10-31'}}],
                   'reviewCapPerLink': 300}
        for relative, value in (('request.json', request), ('m2/selection.json', selection),
                                ('m1/scope.json', {'format': 'scope-v1', 'runId': run.name, 'captureNumber': 1})):
            path = run / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value), encoding='utf-8')
        request_sha = self.sha(run / 'request.json')
        selection_sha = self.sha(run / 'm2/selection.json')
        m1_sha = self.sha(run / 'm1/scope.json')
        slips = {'entry': (None, request_sha), 'm1': (request_sha, m1_sha), 'm2': (m1_sha, selection_sha)}
        for name, (input_sha, output_sha) in slips.items():
            path = run / 'gates' / f'{name}.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({
                'format': 'handoff-v1', 'module': name.upper(), 'runId': run.name,
                'skillVersion': 'synthetic-bridge-real-v1', 'verdict': 'PASS',
                'inputSha256': input_sha, 'outputSha256': output_sha, 'checks': [], 'errorCode': None,
                'next': None}), encoding='utf-8')
        env_file = base / 'remote.env'
        env_file.write_text(f'export SHOPEE_FLOW_STATE="{self.state}"\n', encoding='utf-8')
        self.config = base / 'config.json'
        self.config.write_text(json.dumps({
            'sshCommand': ['bash', '-s'],
            'remoteScript': str(ROOT / 'skills/tdn-shopee-flow/scripts/shopee_flow.py'),
            'runsRoot': str(self.runs), 'presetsRoot': str(self.presets),
            'remoteEnvFile': str(env_file), 'timeoutSeconds': 120,
        }), encoding='utf-8')
        patch = mock.patch.dict(os.environ, {
            'TDN_SHOPEE_APP_CONFIG': str(self.config), 'PYTHONDONTWRITEBYTECODE': '1',
        })
        patch.start()
        self.addCleanup(patch.stop)
        self.run = run
        self.api = tdn_shopee_app.Api()

    @staticmethod
    def sha(path):
        import hashlib
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def test_save_and_view_use_the_real_cli_parser(self):
        view = self.api.reviewSampling('smoke-m3-001')
        self.assertTrue(view['ok'], view)
        saved = self.api.saveReviewPlan('smoke-m3-001', {
            'mode': 'all', 'stars': [], 'totalPerLink': 350, 'allocation': 'pooled',
        })
        self.assertTrue(saved['ok'], saved)
        self.assertEqual(saved['data']['format'], 'review-plan-saved-v1')
        self.assertEqual(saved['data']['runId'], 'smoke-m3-001')
        plan_file = self.run / 'm3-custom/plans' / f"{saved['data']['planSha256']}.json"
        self.assertTrue(plan_file.is_file(), 'the real CLI saved the plan artifact')
        self.assertEqual(json.loads(plan_file.read_text())['policy']['totalPerLink'], 350)
        self.assertEqual(json.loads((self.run / 'request.json').read_text())['reviewCapPerLink'], 300)


if __name__ == '__main__':
    unittest.main()

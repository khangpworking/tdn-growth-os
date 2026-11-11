"""Offline CLI tests for custom review sampling.

The real `shopee_flow.py` runs against a synthetic M2 PASS run. Cases stop at
validation, the read-only guard, a changed M2 digest, or a missing collector
configuration, so no capture, browser, service or provider is reached.
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
RUN_ID = 'run-sampling-001'
LINKS = (
    {'rank': 1, 'shopId': '100', 'itemId': '200', 'revenue': 1000.0},
    {'rank': 2, 'shopId': '300', 'itemId': '400', 'revenue': 500.0},
)


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha_folder(folder):
    names = sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file())
    return hashlib.sha256(''.join(f'{name}\t{sha_file(folder / name)}\n' for name in names).encode()).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def sampling_digest(value):
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


class SamplingCliTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs, self.state = base / 'runs', base / 'state'
        self.runs.mkdir()
        self.state.mkdir()
        self.run = self.runs / RUN_ID
        self.run.mkdir()
        self.write_fixture()

    def env(self, extra=None):
        env = {key: value for key, value in os.environ.items()
               if not key.startswith('TDN_') and not key.startswith('SHOPEE_FLOW_')}
        env.update({'SHOPEE_FLOW_RUNS': str(self.runs), 'SHOPEE_FLOW_STATE': str(self.state),
                    'PYTHONDONTWRITEBYTECODE': '1'})
        env.update(extra or {})
        return env

    def cli(self, *args, input_text=None, extra_env=None):
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], input=input_text,
                              capture_output=True, text=True, env=self.env(extra_env), timeout=120)
        payload = json.loads(proc.stdout) if proc.stdout.strip() else None
        return proc.returncode, payload

    def slip(self, module, input_sha, output_sha):
        return {'format': 'handoff-v1', 'module': module, 'runId': RUN_ID,
                'skillVersion': 'synthetic-sampling-cli-v1', 'verdict': 'PASS',
                'inputSha256': input_sha, 'outputSha256': output_sha,
                'checks': [{'id': 'synthetic_fixture', 'ok': True, 'got': True}],
                'errorCode': None, 'next': None}

    def write_fixture(self, revenue_shift=0.0, cap=300):
        request = {'format': 'request-v1', 'preset': {'keywords': ['kem chống nắng']},
                   'windows': [{'id': '30d', 'period': {'startDate': '2026-10-01', 'endDate': '2026-10-31'}}],
                   'reviewCapPerLink': cap}
        write_json(self.run / 'request.json', request)
        request_sha = sha_file(self.run / 'request.json')
        write_json(self.run / 'm1/scope.json', {'format': 'scope-v1', 'runId': RUN_ID, 'captureNumber': 1})
        m1_sha = sha_folder(self.run / 'm1')
        selection = {
            'format': 'selection-v1', 'runId': RUN_ID, 'source': 'manual',
            'pickRuleVersion': 'manual', 'metricInputSha256': None,
            'links': [{'rank': link['rank'], 'shopId': link['shopId'], 'itemId': link['itemId'],
                       'productBaseId': f"1__{link['itemId']}__{link['shopId']}",
                       'url': f"https://shopee.vn/product/{link['shopId']}/{link['itemId']}",
                       'brand': None, 'revenue': link['revenue'] + revenue_shift,
                       'reason': f"Synthetic link {link['rank']}"} for link in LINKS],
            'counts': {'walked': 9, 'deleted': 0, 'notIncluded': 2, 'tokenGuardRejected': 0,
                       'eligible': 7, 'picked': len(LINKS), 'maskedRows': 0, 'maskedAboveLowestPick': 0},
        }
        write_json(self.run / 'm2/selection.json', selection)
        selection_sha = sha_file(self.run / 'm2/selection.json')
        write_json(self.run / 'gates/entry.json', self.slip('ENTRY', None, request_sha))
        write_json(self.run / 'gates/m1.json', self.slip('M1', request_sha, m1_sha))
        write_json(self.run / 'gates/m2.json', self.slip('M2', m1_sha, selection_sha))
        write_json(self.run / 'state.json', {
            'format': 'state-v1', 'runId': RUN_ID, 'status': 'IDLE', 'mode': None, 'module': None,
            'pid': None, 'startedAt': None, 'endedAt': None, 'errorCode': None, 'failedCheck': None})
        return selection, selection_sha

    def view(self):
        code, payload = self.cli('review-sampling', '--run', RUN_ID)
        self.assertEqual(code, 0)
        self.assertEqual(payload['format'], 'review-sampling-view-v1')
        return payload

    def save(self, mode, stars, total, allocation):
        return self.cli('save-review-plan', '--run', RUN_ID, '--stdin',
                        input_text=json.dumps({'mode': mode, 'stars': stars,
                                               'totalPerLink': total, 'allocation': allocation}))

    def plans(self):
        folder = self.run / 'm3-custom/plans'
        return sorted(folder.glob('*.json')) if folder.is_dir() else []

    def test_view_and_save_are_offline_and_keep_upstream_bytes(self):
        request_bytes = (self.run / 'request.json').read_bytes()
        selection_bytes = (self.run / 'm2/selection.json').read_bytes()
        view = self.view()
        self.assertEqual(view['defaultInput'], {'mode': 'with-comments', 'stars': [],
                                                'totalPerLink': 300, 'allocation': 'pooled'})
        self.assertEqual([link['url'] for link in view['links']],
                         ['https://shopee.vn/product/100/200', 'https://shopee.vn/product/300/400'])
        self.assertEqual(view['plans'], [])

        code, saved = self.save('all', [], 350, 'pooled')
        self.assertEqual((code, saved['format']), (0, 'review-plan-saved-v1'))
        code, balanced = self.save('stars', [5, 4, 3, 2, 1], 2000, 'equal-stars')
        self.assertEqual((code, balanced['format']), (0, 'review-plan-saved-v1'))
        self.assertEqual(balanced['plan']['policy']['order'], 'native-filter-ascending-stars-v1')
        self.assertEqual(balanced['plan']['policy']['stars'], [1, 2, 3, 4, 5])
        self.assertEqual(balanced['plan']['targets'], [{'star': star, 'target': 400} for star in range(1, 6)])
        self.assertEqual(balanced['plan']['links'], view['links'])

        self.assertEqual(len(self.plans()), 2)
        self.assertEqual(len(self.view()['plans']), 2)
        self.assertEqual((self.run / 'request.json').read_bytes(), request_bytes,
                         'a custom plan never mutates the legacy request cap of 300')
        self.assertEqual((self.run / 'm2/selection.json').read_bytes(), selection_bytes)
        self.assertFalse((self.run / 'review-counts').exists())
        self.assertFalse((self.run / 'm3-custom/attempts').exists())

    def test_plan_rejects_2001_before_it_is_written(self):
        code, payload = self.save('all', [], 2001, 'pooled')
        self.assertNotEqual(code, 0)
        self.assertEqual(payload['format'], 'error-v1')
        self.assertEqual(self.plans(), [])

    def test_changed_m2_rejects_the_old_plan(self):
        code, saved = self.save('stars', [1, 2], 4, 'pooled')
        self.assertEqual(code, 0)
        plan_sha = saved['planSha256']
        self.write_fixture(revenue_shift=1.0)

        self.assertEqual(self.view()['plans'], [], 'the old plan no longer matches the M2 digest')
        code, payload = self.cli('m3', '--run', RUN_ID, '--plan-sha256', plan_sha)
        self.assertEqual(code, 23)
        self.assertEqual(payload, {'format': 'error-v1', 'code': 'REVIEW_PLAN_CHANGED',
                                   'message': 'REVIEW_PLAN_CHANGED'})
        self.assertFalse((self.run / 'm3-custom/attempts').exists())

    def test_readonly_marker_keeps_offline_save_but_blocks_launch(self):
        code, saved = self.save('stars', [1], 4, 'pooled')
        self.assertEqual(code, 0)
        marker = self.state / 'shopee-flow' / 'READONLY'
        marker.parent.mkdir(parents=True)
        marker.write_text('', encoding='utf-8')

        self.assertTrue(self.view()['readonly'])
        self.assertEqual(self.save('all', [], 10, 'pooled')[0], 0, 'offline save stays available')
        code, payload = self.cli('m3', '--run', RUN_ID, '--plan-sha256', saved['planSha256'])
        self.assertEqual(code, 20)
        self.assertEqual(payload, {'format': 'error-v1', 'code': 'READONLY_ON', 'message': 'READONLY_ON'})
        self.assertFalse((self.run / 'm3-custom/attempts').exists())

    def test_reconcile_refuses_a_terminal_attempt_without_resubmitting(self):
        selection, m2_sha = self.write_fixture()
        attempt = '33333333-3333-4333-8333-333333333333'
        base = self.run / 'review-counts' / attempt
        frozen = {
            'format': 'shopee-review-attempt-v1', 'kind': 'counts', 'attemptId': attempt, 'runId': RUN_ID,
            'createdAt': '2026-11-10T00:00:00.000Z', 'm2Digest': m2_sha,
            'requestSha256': sha_file(self.run / 'request.json'), 'planSha256': None,
            'links': [{'shopId': link['shopId'], 'itemId': link['itemId'], 'url': link['url']}
                      for link in selection['links']]}
        write_json(base / 'attempt.json', frozen)
        write_json(base / 'state.json', {'format': 'shopee-review-attempt-state-v1',
                                         'attemptSha256': sampling_digest(frozen), 'status': 'SUCCEEDED',
                                         'pid': None, 'errorCode': None, 'outputSha256': None})
        request_bytes = (self.run / 'request.json').read_bytes()

        code, payload = self.cli('reconcile-review-attempt', '--run', RUN_ID, '--kind', 'counts',
                                 '--attempt', attempt)
        self.assertEqual(code, 0)
        self.assertEqual(payload, {'format': 'review-attempt-control-v1', 'runId': RUN_ID, 'kind': 'counts',
                                   'attemptId': attempt, 'status': 'SUCCEEDED', 'pid': None,
                                   'errorCode': None})
        self.assertEqual(sorted(p.name for p in base.iterdir()), ['attempt.json', 'state.json'])
        self.assertEqual((self.run / 'request.json').read_bytes(), request_bytes)

    def test_reconcile_after_m2_change_cleans_the_frozen_attempt_and_publishes_nothing(self):
        selection, m2_sha = self.write_fixture()
        code, saved = self.save('stars', [1], 4, 'pooled')
        self.assertEqual(code, 0)
        attempt_id = '44444444-4444-4444-8444-444444444444'
        base = self.run / 'm3-custom/attempts' / attempt_id
        frozen = {
            'format': 'shopee-review-attempt-v1', 'kind': 'custom', 'attemptId': attempt_id, 'runId': RUN_ID,
            'createdAt': '2026-11-10T00:00:00.000Z', 'm2Digest': m2_sha,
            'requestSha256': sha_file(self.run / 'request.json'), 'planSha256': saved['planSha256'],
            'links': [{'shopId': link['shopId'], 'itemId': link['itemId'], 'url': link['url']}
                      for link in selection['links']]}
        write_json(base / 'attempt.json', frozen)
        write_json(base / 'state.json', {'format': 'shopee-review-attempt-state-v1',
                                         'attemptSha256': sampling_digest(frozen), 'status': 'RUNNING',
                                         'pid': None, 'errorCode': None, 'outputSha256': None})

        self.write_fixture(revenue_shift=1.0)
        request_bytes = (self.run / 'request.json').read_bytes()
        selection_bytes = (self.run / 'm2/selection.json').read_bytes()
        code, payload = self.cli('reconcile-review-attempt', '--run', RUN_ID, '--kind', 'custom',
                                 '--attempt', attempt_id)
        self.assertEqual(code, 20)
        self.assertEqual((payload['format'], payload['status'], payload['errorCode']),
                         ('review-attempt-control-v1', 'FAILED', 'REVIEW_PLAN_CHANGED'))
        self.assertEqual(list((base / 'journal').glob('*.json')), [], 'no job is resubmitted or synthesised')
        self.assertEqual(json.loads((base / 'output/reviews.json').read_text()), [],
                         'nothing is published against changed upstream inputs')
        self.assertEqual(json.loads((base / 'gate.json').read_text())['verdict'], 'FAIL')
        self.assertEqual((self.run / 'request.json').read_bytes(), request_bytes)
        self.assertEqual((self.run / 'm2/selection.json').read_bytes(), selection_bytes)

    def test_missing_collector_configuration_fails_the_launch_before_any_journal(self):
        code, saved = self.save('stars', [1], 4, 'pooled')
        self.assertEqual(code, 0)
        request_bytes = (self.run / 'request.json').read_bytes()
        selection_bytes = (self.run / 'm2/selection.json').read_bytes()

        code, payload = self.cli('m3', '--run', RUN_ID, '--plan-sha256', saved['planSha256'])
        self.assertEqual(code, 20)
        self.assertEqual((payload['format'], payload['status'], payload['errorCode']),
                         ('review-attempt-control-v1', 'FAILED', 'COLLECTOR_NOT_CONFIGURED'))
        self.assertEqual((self.run / 'request.json').read_bytes(), request_bytes)
        self.assertEqual((self.run / 'm2/selection.json').read_bytes(), selection_bytes)
        journals = list((self.run / 'm3-custom/attempts').rglob('journal/*.json'))
        self.assertEqual(journals, [], 'no job journal is created without a collector')


if __name__ == '__main__':
    unittest.main()

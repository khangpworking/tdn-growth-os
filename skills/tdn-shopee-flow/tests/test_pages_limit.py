"""Contract rows for the step 3 page limit (shopee-review-policy-v2).

The two 3a4f7056 rows run the deployed version's own shopee_flow.py from Git;
they are skipped only when that commit is not in the clone (a shallow CI checkout).
"""
import io
import json
import pathlib
import subprocess
import sys
import tarfile
import tempfile

from test_flow import END, RUN_ID, ROOT, FlowTest, configured_request_payload

DEPLOYED = '3a4f7056'
PAGES_INPUT = {'mode': 'stars', 'stars': [3, 2], 'limitBy': 'pages', 'pagesPerLink': 10, 'allocation': 'pooled'}
PAGES_POLICY = {
    'format': 'shopee-review-policy-v2', 'limitBy': 'pages', 'mode': 'stars', 'stars': [2, 3],
    'pagesPerLink': 10, 'totalPerLink': 2000, 'allocation': 'pooled',
    'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1',
}


def pages_request(**policy):
    request = configured_request_payload()
    request['collectionPolicy'] = {**PAGES_POLICY, **policy}
    return request


class PagesLimitTests(FlowTest):
    def create(self, payload, script=None):
        if script is None:
            return self.command('new-run', '--stdin', stdin=json.dumps(payload))
        proc = subprocess.run([sys.executable, str(script), 'new-run', '--stdin'], capture_output=True, text=True,
                              env=self.env(), input=json.dumps(payload), timeout=90)
        return proc.returncode, json.loads(proc.stdout) if proc.stdout.strip() else None, proc.stderr

    def entry_policy_check(self, script=None):
        args = ['gate', 'entry', '--run', RUN_ID]
        if script is None:
            rc, slip, stderr = self.command(*args)
        else:
            proc = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True, env=self.env(), timeout=90)
            rc, slip, stderr = proc.returncode, json.loads(proc.stdout), proc.stderr
        self.assertIsInstance(slip, dict, (rc, stderr))
        return slip, next(c for c in slip['checks'] if c['id'] == 'collection_policy')

    def deployed_script(self):
        known = subprocess.run(['git', '-C', str(ROOT), 'cat-file', '-e', DEPLOYED + '^{commit}'], capture_output=True)
        if known.returncode:
            self.skipTest(f'{DEPLOYED} is not in this clone')
        archive = subprocess.run(['git', '-C', str(ROOT), 'archive', DEPLOYED, 'skills/tdn-shopee-flow', 'contracts'],
                                 capture_output=True, check=True).stdout
        folder = pathlib.Path(tempfile.mkdtemp(dir=self._tmp.name))
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(folder, filter='data')
        return folder / 'skills/tdn-shopee-flow/scripts/shopee_flow.py'

    def test_pages_mode_is_written_as_policy_v2_and_passes_the_entry_policy_check(self):
        self.write_preset()
        rc, payload, stderr = self.create({'presetId': 'kem', 'endDate': END, 'collectionPolicy': PAGES_INPUT})
        self.assertEqual(rc, 0, (payload, stderr))
        run, request = self.read_request(payload)
        self.assertEqual(request['collectionPolicy'], PAGES_POLICY)
        self.make_run(request=request)
        _, check = self.entry_policy_check()
        self.assertEqual(check, {'id': 'collection_policy', 'ok': True, 'got': {'valid': True, 'pagesPerLink': 10}})
        self.assert_no_subprocess()

    def test_invalid_pages_inputs_are_refused_before_any_run(self):
        self.write_preset()
        cases = ({**PAGES_INPUT, 'pagesPerLink': 0}, {**PAGES_INPUT, 'pagesPerLink': 101},
                 {**PAGES_INPUT, 'pagesPerLink': True}, {**PAGES_INPUT, 'allocation': 'equal-stars'},
                 {**PAGES_INPUT, 'totalPerLink': 300}, {**PAGES_INPUT, 'stars': []},
                 {**PAGES_INPUT, 'mode': 'all'}, {**PAGES_INPUT, 'limitBy': 'count'})
        for policy in cases:
            with self.subTest(policy=policy):
                rc, payload, _ = self.create({'presetId': 'kem', 'endDate': END, 'collectionPolicy': policy})
                self.assertEqual((rc, payload['code']), (2, 'NEW_RUN_INPUT_INVALID'))
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_the_entry_gate_refuses_an_invalid_pages_policy(self):
        for change in ({'pagesPerLink': 101}, {'totalPerLink': 300}, {'allocation': 'equal-stars'}, {'stars': [3, 2]},
                       {'limitBy': 'count'}):
            with self.subTest(change=change):
                self.make_run(request=pages_request(**change))
                slip, check = self.entry_policy_check()
                self.assertEqual(check['ok'], False)
                self.assertNotEqual(slip['verdict'], 'PASS')

    def test_count_mode_request_bytes_match_the_deployed_writer(self):
        deployed = self.deployed_script()
        self.write_preset()
        for policy in ({'mode': 'stars', 'stars': [3, 2], 'totalPerLink': 500, 'allocation': 'equal-stars'}, None):
            value = {'presetId': 'kem', 'endDate': END, **({'collectionPolicy': policy} if policy else {})}
            with self.subTest(policy=policy):
                runs = []
                for script in (deployed, None):
                    rc, payload, stderr = self.create(value, script)
                    self.assertEqual(rc, 0, (payload, stderr))
                    runs.append((self.runs / payload['runId'] / 'request.json').read_bytes())
                self.assertEqual(runs[1], runs[0])

    def test_the_deployed_version_refuses_a_pages_mode_run(self):
        deployed = self.deployed_script()
        self.make_run(request=pages_request())
        slip, check = self.entry_policy_check(deployed)
        self.assertEqual(check, {'id': 'collection_policy', 'ok': False, 'got': {'valid': False, 'totalPerLink': None}})
        self.assertNotEqual(slip['verdict'], 'PASS')
        self.write_preset()
        rc, payload, _ = self.create({'presetId': 'kem', 'endDate': END, 'collectionPolicy': PAGES_INPUT}, deployed)
        self.assertEqual((rc, payload['code']), (2, 'NEW_RUN_INPUT_INVALID'))

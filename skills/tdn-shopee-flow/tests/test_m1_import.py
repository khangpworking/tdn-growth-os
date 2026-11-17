"""Contract tests for `m1-import --stdin`: the user-page products response becomes a flat m1/ run."""
import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'shopee_flow.py'

IMPORT_ID = '3f6c2a1e-8b9d-4c1e-9f00-1234567890ab'
SCOPE = {'start_date': '20261014', 'end_date': '20261112',
         'include_query': {'queries': ['synthetic term']}, 'platforms': [1, 2]}
POLICY = {'mode': 'with-comments', 'stars': [], 'totalPerLink': 50, 'allocation': 'pooled'}
FULL_POLICY = {'format': 'shopee-review-policy-v1', **POLICY,
               'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'}
WINDOW = {'id': 'selected', 'period': {'startDate': '2026-10-14', 'endDate': '2026-11-12'}, 'intervalDays': 7}


def products(count=5):
    return [{'product_base_id': f'1__{7100 + i}__{71 + i}', 'product_name': f'Synthetic product {i + 1}',
             'shop_base_id': str(71 + i), 'platform_id': 1, 'revenue_custom': 1000 - i * 10,
             'brand': 'Synthetic Brand', 'final_brand': 'Synthetic Brand'} for i in range(count)]


def payload(**over):
    value = {'format': 'metric-user-page-import-v1', 'importId': IMPORT_ID, 'keyword': 'synthetic term',
             'capturedAt': '2026-11-17T15:00:00+07:00', 'collectionPolicy': POLICY, 'scope': SCOPE,
             'response': {'urlPath': '/v2/market/analytics/products/', 'method': 'POST', 'status': 200,
                          'requestBody': {**SCOPE, 'limit': 100, 'page': 0, 'sort_by': 'revenue_custom__desc'},
                          'body': {'status': 'success', 'code': 0, 'data': {'products': products()}}}}
    value.update(over)
    return value


class M1ImportTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs, self.state, self.presets, self.bin = base / 'runs', base / 'state', base / 'presets', base / 'bin'
        for folder in (self.runs, self.state, self.presets, self.bin):
            folder.mkdir(parents=True)
        # The M1 gate asks the offline TS reader for verify-capture; that reader is scripted here.
        node = self.bin / 'node'
        node.write_text('#!/usr/bin/env python3\nimport json\nprint(json.dumps({"valid": True}))\n', encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)

    def env(self, extra=None):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE',
                                                         'SHOPEE_FLOW_PRESETS', 'PYTHONPATH')}
        env.update({'SHOPEE_FLOW_RUNS': str(self.runs), 'SHOPEE_FLOW_STATE': str(self.state),
                    'SHOPEE_FLOW_PRESETS': str(self.presets), 'PYTHONDONTWRITEBYTECODE': '1',
                    'PATH': f'{self.bin}{os.pathsep}{env.get("PATH", "")}'})
        if extra:
            env.update(extra)
        return env

    def command(self, *args, stdin=None, extra_env=None):
        data = stdin.encode('utf8') if isinstance(stdin, str) else stdin
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True,
                              env=self.env(extra_env), input=data, timeout=90)
        out = json.loads(proc.stdout) if proc.stdout.strip() else None
        return proc.returncode, out

    def imported(self, value=None):
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(value or payload()))
        self.assertEqual(rc, 0, out)
        return out, self.runs / out['runId']

    def run_dirs(self):
        return sorted(path for path in self.runs.iterdir() if path.name != '.imports.lock')

    def test_import_writes_the_contract_request_flat_m1_and_both_gates(self):
        out, run = self.imported()
        self.assertEqual(out, {'format': 'metric-user-page-import-result-v1', 'runId': run.name,
                               'reused': False, 'gates': {'entry': 'PASS', 'm1': 'PASS'}})
        request = json.loads((run / 'request.json').read_text())
        self.assertEqual(request, {'format': 'request-v2', 'preset': {'keywords': ['synthetic term']},
                                   'windows': [WINDOW], 'collectionPolicy': FULL_POLICY, 'principalTitles': [],
                                   'selectionPolicy': 'metric-products-unique-v2',
                                   'metricSource': {'format': 'user-page-v1', 'scope': SCOPE, 'importId': IMPORT_ID}})
        raw_path, part_path = run / 'm1/selected/raw-responses.json', run / 'm1/selected/manifest.json'
        raw = json.loads(raw_path.read_text())
        self.assertEqual(raw, [{**payload()['response'], 'requestBody': payload()['response']['requestBody'],
                                'responseOrder': 0}])
        part = json.loads(part_path.read_text())
        self.assertEqual({k: part[k] for k in ('contractVersion', 'captureMethod', 'capturedAt', 'window',
                                               'sourceMap', 'captureGate')},
                         {'contractVersion': 'metric-user-page-window-v1', 'captureMethod': 'user-page',
                          'capturedAt': '2026-11-17T15:00:00+07:00', 'window': WINDOW,
                          'sourceMap': {'products': 'raw-responses.json#/0/body/data'}, 'captureGate': 'PASSED'})
        self.assertEqual(part['files'], [{'path': 'raw-responses.json',
                                          'sha256': hashlib.sha256(raw_path.read_bytes()).hexdigest(),
                                          'byteSize': raw_path.stat().st_size}])
        outer = json.loads((run / 'm1/manifest.json').read_text())
        self.assertEqual(outer, {'contractVersion': 'metric-v3-capture-v1',
                                 'windows': [{'window': 'selected', 'path': 'selected/manifest.json',
                                              'sha256': hashlib.sha256(part_path.read_bytes()).hexdigest()}]})
        self.assertEqual(json.loads((run / 'm1-import.json').read_text())['importId'], IMPORT_ID)
        self.assertEqual(json.loads((run / 'run-tracking.json').read_text())['requestSha256'],
                         hashlib.sha256((run / 'request.json').read_bytes()).hexdigest())
        self.assertEqual(json.loads((run / 'm4/auto.json').read_text())['format'], 'review-process-auto-v1')
        for gate in ('entry', 'm1'):
            slip = json.loads((run / f'gates/{gate}.json').read_text())
            self.assertEqual([slip['format'], slip['verdict'], slip['runId']], ['handoff-v1', 'PASS', run.name])

    def test_the_same_payload_reuses_the_run_and_a_changed_one_conflicts(self):
        first, run = self.imported()
        again, same = self.imported()
        self.assertEqual([again['runId'], again['reused'], same], [first['runId'], True, run])
        changed = payload(keyword='another synthetic term')
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(changed))
        self.assertEqual((rc, out), (20, {'format': 'error-v1', 'code': 'IMPORT_ID_CONFLICT',
                                          'message': 'IMPORT_ID_CONFLICT'}))

    def test_input_is_validated_before_any_run_is_created(self):
        cases = [
            ('too large', ' ' * (8 * 1024 * 1024 + 1), 2, 'IMPORT_TOO_LARGE'),
            ('wrong request body', json.dumps(payload(response={**payload()['response'], 'requestBody': {**SCOPE, 'limit': 10}})), 2, 'IMPORT_INPUT_INVALID'),
            ('duplicate key', json.dumps(payload())[:-1] + ', "keyword": "again"}', 2, 'IMPORT_INPUT_INVALID'),
        ]
        for name, text, rc_want, code in cases:
            rc, out = self.command('m1-import', '--stdin', stdin=text)
            self.assertEqual((rc, out['code']), (rc_want, code), name)
        self.assertEqual(list(self.runs.iterdir()), [], 'no run folder for refused input')

    def test_a_response_without_shopee_rows_is_refused_with_its_own_code(self):
        value = payload()
        value['response']['body']['data']['products'] = [{'product_base_id': '2__1__1'}]
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(value))
        self.assertEqual((rc, out['code']), (20, 'IMPORT_NO_SHOPEE_ROWS'))
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_one_changed_m1_file_blocks_the_reuse(self):
        # The Python gate trusts the declared window digests; the offline TS reader hashes the raw
        # bytes (proved with the real reader outside this stub). Here the folder digest still moves.
        _, run = self.imported()
        raw = run / 'm1/selected/raw-responses.json'
        raw.write_bytes(raw.read_bytes().replace(b'"status": 200', b'"status": 201'))
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload()))
        self.assertEqual((rc, out['code']), (20, 'GATE_NOT_PASSED'))

    def test_a_changed_window_manifest_fails_the_gate(self):
        _, run = self.imported()
        part = run / 'm1/selected/manifest.json'
        part.write_bytes(part.read_bytes() + b' ')
        rc, slip = self.command('gate', 'm1', '--run', run.name)
        self.assertEqual((rc, slip['verdict']), (20, 'FAIL'))

    def test_a_changed_request_fails_the_gate_with_input_changed(self):
        _, run = self.imported()
        request = json.loads((run / 'request.json').read_text())
        request['preset']['keywords'] = ['changed synthetic term']
        (run / 'request.json').write_text(json.dumps(request))
        rc, slip = self.command('gate', 'm1', '--run', run.name)
        self.assertEqual((rc, slip['verdict'], slip['errorCode']), (23, 'FAIL', 'GATE_INPUT_CHANGED'))

    def test_an_interrupted_import_is_completed_by_resending_the_same_package(self):
        node = self.bin / 'node'
        working = node.read_text(encoding='utf8')
        node.write_text('#!/usr/bin/env python3\nimport sys\nsys.exit(1)\n', encoding='utf8')
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload()))
        # The M1 gate could not finish, but the published receipt must not block the retry.
        self.assertEqual((rc, out['code']), (20, 'GATE_NOT_PASSED'))
        [run] = self.run_dirs()
        self.assertEqual(json.loads((run / 'm1-import.json').read_text())['importId'], IMPORT_ID)
        self.assertEqual(json.loads((run / 'gates/entry.json').read_text())['verdict'], 'PASS')
        # The reported crash state: the entry gate is PASS and the M1 folder was never written.
        shutil.rmtree(run / 'm1')
        (run / 'gates/m1.json').unlink()
        node.write_text(working, encoding='utf8')
        completed, same = self.imported()
        self.assertEqual([completed['runId'], completed['reused'], same], [run.name, True, run])
        for gate in ('entry', 'm1'):
            slip = json.loads((run / f'gates/{gate}.json').read_text())
            self.assertEqual([slip['verdict'], slip['runId']], ['PASS', run.name])
        again, _ = self.imported()
        self.assertEqual([again['runId'], again['reused']], [run.name, True])

    def test_deeply_nested_input_is_refused_as_invalid_without_a_run(self):
        # Deep enough to trip the interpreter's recursion guard below the 8 MB cap on any Python.
        deep = '[' * 100000 + '0' + ']' * 100000
        scope = '{"start_date":"20261014","end_date":"20261112","nested":' + deep + '}'
        request_body = ('{"start_date":"20261014","end_date":"20261112","nested":' + deep +
                        ',"limit":100,"page":0,"sort_by":"revenue_custom__desc"}')
        nested = ('{"format":"metric-user-page-import-v1","importId":"' + IMPORT_ID +
                  '","keyword":"synthetic term","capturedAt":"2026-11-17T15:00:00+07:00",'
                  '"collectionPolicy":' + json.dumps(POLICY) + ',"scope":' + scope +
                  ',"response":{"urlPath":"/v2/market/analytics/products/","method":"POST","status":200,'
                  '"requestBody":' + request_body + ',"body":{"status":"success","code":0,"data":{"products":' +
                  json.dumps(products()) + '}}}}')
        for name, text in (('envelope', deep), ('scope', nested)):
            rc, out = self.command('m1-import', '--stdin', stdin=text)
            self.assertEqual((rc, out), (2, {'format': 'error-v1', 'code': 'IMPORT_INPUT_INVALID',
                                             'message': 'IMPORT_INPUT_INVALID'}), name)
        self.assertEqual(list(self.runs.iterdir()), [], 'no run folder for refused input')

    def test_readonly_refuses_before_reading_the_payload(self):
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload()),
                               extra_env={'TDN_SHOPEE_FLOW_READONLY': '1'})
        self.assertEqual((rc, out['code']), (2, 'READONLY_ON'))
        self.assertEqual(list(self.runs.iterdir()), [])


if __name__ == '__main__':
    unittest.main()

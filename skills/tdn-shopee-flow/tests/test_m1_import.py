"""Contract tests for `m1-import --stdin`: the user-page products response becomes a flat m1/ run."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

from test_gates import CAPTURE_CHECK_IDS, request_payload, selected_request

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
        self.reset()

    def reset(self):
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
        return sorted(path for path in self.runs.iterdir()
                      if path.is_dir() and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', path.name))

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

    def test_product_selection_is_written_to_the_request(self):
        # F644: top N and all are part of the request; an absent field stays absent (top 5).
        for selection in ({'mode': 'top', 'count': 1}, {'mode': 'top', 'count': 8}, {'mode': 'all'}):
            with self.subTest(selection):
                self.reset()
                _, run = self.imported(payload(productSelection=selection))
                self.assertEqual(json.loads((run / 'request.json').read_text())['productSelection'], selection)

    def test_a_changed_product_selection_conflicts_like_any_other_payload_change(self):
        self.imported()
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload(productSelection={'mode': 'all'})))
        self.assertEqual((rc, out['code']), (20, 'IMPORT_ID_CONFLICT'),
                         'the payload hash covers productSelection')

    def test_invalid_product_selection_is_refused_before_any_run(self):
        cases = [
            ('not an object', 'top', 'IMPORT_INPUT_INVALID'),
            ('explicit null', None, 'IMPORT_INPUT_INVALID'),
            ('zero count', {'mode': 'top', 'count': 0}, 'IMPORT_INPUT_INVALID'),
            ('count above 100', {'mode': 'top', 'count': 101}, 'IMPORT_INPUT_INVALID'),
            ('fractional count', {'mode': 'top', 'count': 2.5}, 'IMPORT_INPUT_INVALID'),
            ('boolean count', {'mode': 'top', 'count': True}, 'IMPORT_INPUT_INVALID'),
            ('missing count', {'mode': 'top'}, 'IMPORT_INPUT_INVALID'),
            ('unknown mode', {'mode': 'some'}, 'IMPORT_INPUT_INVALID'),
            ('all with a count', {'mode': 'all', 'count': 5}, 'IMPORT_INPUT_INVALID'),
            ('extra key', {'mode': 'top', 'count': 5, 'x': 1}, 'IMPORT_INPUT_INVALID'),
        ]
        for name, selection, code in cases:
            with self.subTest(name):
                rc, out = self.command('m1-import', '--stdin',
                                       stdin=json.dumps(payload(productSelection=selection)))
                self.assertEqual((rc, out['code']), (2, code), name)
        self.assertEqual(list(self.runs.iterdir()), [], 'no run folder for refused input')

    def test_a_user_page_import_passes_entry_without_capture_spec_checks(self):
        _, run = self.imported()
        entry = json.loads((run / 'gates/entry.json').read_text())
        self.assertEqual(entry['verdict'], 'PASS')
        self.assertFalse([c for c in entry['checks'] if c['id'].startswith('capture_spec_')])
        self.assertFalse([c for c in entry['checks'] if not c['ok']])

    def test_a_request_with_another_capture_source_keeps_the_capture_spec_checks(self):
        # Only the request m1-import writes skips the capture checks; a metricSource next to
        # a captureSpec / metricInput, or on a request-v1, keeps the original FAIL path.
        mixed = selected_request()
        mixed['metricInput']['preset']['smartQuery'] = False
        mixed['metricSource'] = {'format': 'user-page-v1', 'scope': SCOPE, 'importId': IMPORT_ID}
        invalid_v1 = request_payload(capture_spec={'windows': 'not-a-list'})
        invalid_v1['metricSource'] = {}
        cases = (
            ('mixed sources', mixed, 'CAPTURE_SMART_QUERY_MISMATCH', 'capture_spec_smart_query'),
            ('request-v1 with an empty metric source', invalid_v1, 'CAPTURE_SPEC_INVALID', 'capture_spec_present'),
        )
        for name, request, error, failed in cases:
            with self.subTest(name):
                run = self.runs / f'gate-entry-{error.lower()}'
                run.mkdir()
                (run / 'request.json').write_text(json.dumps(request), encoding='utf8')
                rc, slip = self.command('gate', 'entry', '--run', run.name)
                self.assertEqual((rc, slip['verdict'], slip['errorCode']), (20, 'FAIL', error))
                checks = {c['id']: c for c in slip['checks']}
                self.assertEqual({i for i in checks if i.startswith('capture_spec_')}, set(CAPTURE_CHECK_IDS))
                self.assertFalse(checks[failed]['ok'], checks[failed])
                self.assertFalse([c for c in slip['checks'] if c.get('level') == 'warn'])

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

    def test_a_non_finite_number_is_refused_without_a_run(self):
        # `1e999` parses to infinity in Python; the import error vocabulary must still apply.
        scope_json = json.dumps(SCOPE)
        request_body = {**SCOPE, 'limit': 100, 'page': 0, 'sort_by': 'revenue_custom__desc'}
        text = json.dumps(payload())
        text = text.replace(scope_json, scope_json[:-1] + ',"x":1e999}', 1)
        text = text.replace(json.dumps(request_body), json.dumps(request_body)[:-1] + ',"x":1e999}', 1)
        self.assertEqual(text.count('1e999'), 2, 'both scope and requestBody carry the literal')
        rc, out = self.command('m1-import', '--stdin', stdin=text)
        self.assertEqual((rc, out), (2, {'format': 'error-v1', 'code': 'IMPORT_INPUT_INVALID',
                                         'message': 'IMPORT_INPUT_INVALID'}))
        self.assertEqual(list(self.runs.iterdir()), [], 'no run folder for refused input')

    def test_a_captured_at_outside_the_manifest_date_time_is_refused_without_a_run(self):
        # The manifest's RFC 3339 date-time (ajv-formats) rejects the basic ISO form, and its
        # timezone colon is part of the optional minutes group, so a dangling colon is invalid.
        for captured in ('20261117T150000+0700', '2026-11-17T15:00:00+07:'):
            rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload(capturedAt=captured)))
            self.assertEqual((rc, out), (2, {'format': 'error-v1', 'code': 'IMPORT_INPUT_INVALID',
                                             'message': 'IMPORT_INPUT_INVALID'}), captured)
            self.assertEqual(list(self.runs.iterdir()), [], 'no run folder for refused input')

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

    def test_a_failed_recheck_does_not_let_a_resend_repair_a_completed_import(self):
        # The receipt's completed marker, not the replaceable gate slips, says this import finished.
        _, run = self.imported()
        request = json.loads((run / 'request.json').read_text())
        request['preset']['keywords'] = ['changed synthetic term']
        (run / 'request.json').write_text(json.dumps(request))
        rc, slip = self.command('gate', 'm1', '--run', run.name)
        self.assertEqual((rc, slip['verdict'], slip['errorCode']), (23, 'FAIL', 'GATE_INPUT_CHANGED'))
        raw_path = run / 'm1/selected/raw-responses.json'
        raw_before = raw_path.read_bytes()
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload()))
        self.assertEqual((rc, out['code']), (20, 'GATE_NOT_PASSED'))
        self.assertEqual(json.loads((run / 'request.json').read_text())['preset']['keywords'],
                         ['changed synthetic term'], 'the resend repaired nothing')
        self.assertEqual(raw_path.read_bytes(), raw_before)
        self.assertEqual(json.loads((run / 'gates/m1.json').read_text())['verdict'], 'FAIL')

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

    def load_flow_module(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('shopee_flow_under_test', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        saved, sys.dont_write_bytecode = sys.dont_write_bytecode, True
        try:
            spec.loader.exec_module(module)
        finally:
            sys.dont_write_bytecode = saved
        return module

    def published_runs(self):
        return [path.name for path in self.run_dirs()]

    @staticmethod
    def write_key(path, runs):
        """The run-relative record a temp write publishes, from its atomic-write temp name."""
        temp = pathlib.PurePosixPath(str(path))
        gate = re.fullmatch(r'\.(entry|m1)-[0-9a-f]{32}\.tmp', temp.name)
        if gate:
            return f'gates/{gate.group(1)}.json'
        name = re.sub(r'\.[0-9a-f]{32}\.tmp$', '', temp.name)
        parts = pathlib.Path(path).resolve().relative_to(runs.resolve()).parts
        return f'.imports/{name}' if parts[0] == '.imports' else '/'.join(parts[1:-1] + (name,))

    def crash_before(self, target, occurrence=1):
        """Terminate the import immediately before one durable write of its path."""
        import io
        from unittest import mock
        with mock.patch.dict(os.environ, self.env(), clear=True):
            module = self.load_flow_module()
            write_new, write_tracking = module.write_new, module.flow_write_tracking
            written = [0]

            def terminate(path, text, mode=0o600):
                if self.write_key(path, self.runs) == target:
                    written[0] += 1
                    if written[0] == occurrence:
                        raise SystemExit(137)
                return write_new(path, text, mode)

            def terminate_tracking(run, value):
                if target == 'run-tracking.json':
                    raise SystemExit(137)
                return write_tracking(run, value)

            module.write_new, module.flow_write_tracking = terminate, terminate_tracking
            with mock.patch('sys.stdin', io.TextIOWrapper(io.BytesIO(json.dumps(payload()).encode('utf8')))):
                with self.assertRaises(SystemExit):
                    module.flow_m1_import()
        if target.startswith('.imports/'):
            self.assertEqual(self.run_dirs(), [], 'terminated before the reservation')
            self.assertFalse((self.runs / target).exists())
            return
        [crashed] = self.run_dirs()
        if target == 'm1-import.json' and occurrence == 2:
            receipt = json.loads((crashed / target).read_text())
            self.assertNotIn('completed', receipt, 'terminated before the completed receipt')
            return
        self.assertFalse((crashed / target).exists(), 'terminated before the write')

    def test_every_interrupted_import_write_is_repaired_by_the_same_package(self):
        # Termination immediately before each durable write leaves a reserveable run; the identical
        # resend must publish exactly one complete run, both gates and the step-4 auto record.
        points = [
            ('reservation', f'.imports/{IMPORT_ID}.json', 1),
            ('request', 'request.json', 1),
            ('state', 'state.json', 1),
            ('run tracking', 'run-tracking.json', 1),
            ('step-4 auto record', 'm4/auto.json', 1),
            ('pending receipt', 'm1-import.json', 1),
            ('entry gate', 'gates/entry.json', 1),
            ('raw responses', 'm1/selected/raw-responses.json', 1),
            ('window manifest', 'm1/selected/manifest.json', 1),
            ('m1 root manifest', 'm1/manifest.json', 1),
            ('m1 gate', 'gates/m1.json', 1),
            ('completed receipt', 'm1-import.json', 2),
        ]
        for label, target, occurrence in points:
            with self.subTest(stopped_before=label):
                self.reset()
                self.crash_before(target, occurrence)
                completed, run = self.imported()
                self.assertEqual(completed['reused'], label != 'reservation', label)
                self.assertEqual(self.published_runs(), [run.name], 'one run for the importId')
                reservation = json.loads((self.runs / '.imports' / f'{IMPORT_ID}.json').read_text())
                self.assertEqual(reservation['runId'], run.name, 'no duplicate run was reserved')
                self.assertEqual(json.loads((run / 'request.json').read_text())['metricSource']['importId'], IMPORT_ID)
                state = json.loads((run / 'state.json').read_text())
                self.assertEqual([state['format'], state['runId']], ['state-v1', run.name])
                tracking = json.loads((run / 'run-tracking.json').read_text())
                self.assertEqual(tracking['requestSha256'], hashlib.sha256((run / 'request.json').read_bytes()).hexdigest())
                auto = json.loads((run / 'm4/auto.json').read_text())
                self.assertEqual([auto['format'], auto['runId']], ['review-process-auto-v1', run.name],
                                 'step 4 hands off by itself')
                receipt = json.loads((run / 'm1-import.json').read_text())
                self.assertEqual([receipt['importId'], receipt['completed']], [IMPORT_ID, True])
                for gate in ('entry', 'm1'):
                    slip = json.loads((run / f'gates/{gate}.json').read_text())
                    self.assertEqual([slip['verdict'], slip['runId']], ['PASS', run.name])
                again, same = self.imported()
                self.assertEqual([again['runId'], again['reused'], same], [run.name, True, run])

    def test_a_changed_package_conflicts_with_an_interrupted_imports_reservation(self):
        # The reservation holds the original payload hash, so a different package conflicts even
        # while the interrupted run has no receipt of its own yet.
        self.crash_before('m1-import.json', 1)
        [crashed] = self.run_dirs()
        reservation = json.loads((self.runs / '.imports' / f'{IMPORT_ID}.json').read_text())
        self.assertEqual(reservation['runId'], crashed.name)
        rc, out = self.command('m1-import', '--stdin', stdin=json.dumps(payload(keyword='another synthetic term')))
        self.assertEqual((rc, out['code']), (20, 'IMPORT_ID_CONFLICT'))
        self.assertEqual(self.run_dirs(), [crashed])

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

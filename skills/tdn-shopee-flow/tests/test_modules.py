"""Contract tests for the standalone module commands of shopee_flow.py (B2).

Each test owns a temp run folder and calls the real command line:

    python3 shopee_flow.py m1|m2|m3 --run <runId>

Every case stops at a blocking rule, the read-only guard, or the manual path,
so the command never reaches a real capture or collection. A fake `node` on
PATH records any subprocess start; the tests assert that record is absent.
"""
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
MODULES = json.loads((ROOT / 'skills' / 'tdn-shopee-flow' / 'modules.json').read_bytes())
M2_RULE = next(m['ruleVersion'] for m in MODULES['modules'] if m['id'] == 'M2')
RUN_ID = 'run-modules-001'

PERIODS = {
    '30d': {'startDate': '2026-10-12', 'endDate': '2026-11-10'},
    '12m': {'startDate': '2025-11-11', 'endDate': '2026-11-10'},
}


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha_folder(folder):
    names = sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file())
    text = ''.join(f'{name}\t{sha_file(folder / name)}\n' for name in names)
    return hashlib.sha256(text.encode('utf8')).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf8')


def request_payload(cap=300, capture_spec=True):
    value = {
        'format': 'request-v1',
        'preset': {'keywords': ['kem chống nắng']},
        'principalTitles': [],
        'windows': [{'id': wid, 'period': dict(period), 'intervalDays': 7 if wid == '30d' else 30}
                    for wid, period in PERIODS.items()],
        'reviewCapPerLink': cap,
    }
    if capture_spec:
        value['captureSpec'] = {
            'contractVersion': 'metric-v3-capture-spec-v2',
            'preset': {'keywords': ['kem chống nắng']},
            'windows': [{'id': wid, 'period': dict(period), 'intervalDays': 7 if wid == '30d' else 30}
                        for wid, period in PERIODS.items()],
        }
    return value


def selection_payload(source='manual', links=None):
    links = [{
        'rank': 1, 'productBaseId': '1__11111111111__222222222',
        'shopId': '222222222', 'itemId': '11111111111',
        'url': 'https://shopee.vn/product/222222222/11111111111',
        'brand': 'Synthetic brand', 'revenue': 1000,
        'reason': 'Hạng 1, doanh thu kỳ 1.000, thương hiệu Synthetic brand',
    }] if links is None else links
    return {
        'format': 'selection-v1', 'runId': RUN_ID, 'source': source,
        'pickRuleVersion': 'manual' if source == 'manual' else M2_RULE,
        'metricInputSha256': None if source == 'manual' else 'a' * 64,
        'links': links,
        'counts': {'walked': 5, 'deleted': 0, 'notIncluded': 2, 'tokenGuardRejected': 0,
                   'eligible': 3, 'picked': len(links), 'maskedRows': 0, 'maskedAboveLowestPick': 0},
    }


class ModuleTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs = base / 'runs'
        self.state = base / 'state'
        self.bin = base / 'bin'
        self.marker = base / 'node-called'
        self.runs.mkdir()
        self.state.mkdir()
        self.bin.mkdir()
        # A subprocess start would resolve `node` from PATH and leave this record.
        node = self.bin / 'node'
        node.write_text('#!/bin/sh\ntouch "$NODE_MARKER"\n', encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        self.run = self.runs / RUN_ID
        self.run.mkdir()

    def env(self):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE',
                                                         'SHOPEE_FLOW_PRESETS', 'NODE_MARKER')}
        env['SHOPEE_FLOW_RUNS'] = str(self.runs)
        env['SHOPEE_FLOW_STATE'] = str(self.state)
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        env['NODE_MARKER'] = str(self.marker)
        env['PATH'] = f'{self.bin}{os.pathsep}{env.get("PATH", "")}'
        return env

    def module(self, name, *extra):
        proc = subprocess.run([sys.executable, str(SCRIPT), name, '--run', RUN_ID, *extra],
                              capture_output=True, text=True, env=self.env(), timeout=60)
        payload = json.loads(proc.stdout) if proc.stdout.strip() else None
        return proc.returncode, payload, proc.stderr

    def slip(self, module, verdict, output_sha=None, error=None):
        write_json(self.run / 'gates' / f'{module}.json', {
            'format': 'handoff-v1', 'module': module.upper(), 'runId': RUN_ID,
            'skillVersion': '1.0.0', 'verdict': verdict,
            'inputSha256': None, 'outputSha256': output_sha,
            'checks': [], 'errorCode': error,
            'next': {'entry': 'M1', 'm1': 'M2', 'm2': 'M3'}.get(module) if verdict == 'PASS' else None,
        })

    def write_request(self, **kw):
        write_json(self.run / 'request.json', request_payload(**kw))

    def entry_pass(self):
        self.write_request()
        self.slip('entry', 'PASS', sha_file(self.run / 'request.json'))

    def m1_folder(self, rows=None):
        folder = self.run / 'm1'
        write_json(folder / 'raw-responses.json', {'rows': [] if rows is None else rows})
        write_json(folder / '30d' / 'raw-responses.json', {'rows': []})
        write_json(folder / '30d' / 'manifest.json', {'contractVersion': 'metric-v3-window-capture-v2'})
        write_json(folder / '12m' / 'raw-responses.json', {'rows': []})
        write_json(folder / '12m' / 'manifest.json', {'contractVersion': 'metric-v3-window-capture-v2'})
        write_json(folder / 'manifest.json', {'contractVersion': 'metric-v3-capture-v1', 'windows': []})
        return folder

    def m1_pass(self):
        self.entry_pass()
        folder = self.m1_folder()
        self.slip('m1', 'PASS', sha_folder(folder))
        return folder

    def m2_selection(self, **kw):
        value = selection_payload(**kw)
        write_json(self.run / 'm2' / 'selection.json', value)
        return value

    def m2_pass(self, **kw):
        self.m1_pass()
        self.m2_selection(**kw)
        self.slip('m2', 'PASS', sha_file(self.run / 'm2' / 'selection.json'))

    def guard_on(self):
        guard = self.state / 'shopee-flow' / 'READONLY'
        guard.parent.mkdir(parents=True, exist_ok=True)
        guard.write_text('on', encoding='utf8')

    def assert_no_subprocess(self):
        self.assertFalse(self.marker.exists(), 'a subprocess was started')

    def assert_stop(self, name, code, error, output_folder):
        rc, payload, stderr = self.module(name)
        self.assertEqual(rc, code, (payload, stderr))
        self.assertIsInstance(payload, dict, stderr)
        self.assertEqual(payload.get('format'), 'module-result-v1', payload)
        self.assertEqual(payload.get('errorCode'), error, payload)
        self.assertFalse((self.run / output_folder).exists(), output_folder)
        self.assert_no_subprocess()
        return payload


class BlockingRuleTests(ModuleTest):
    """D14 step 2: the slip of the step before, then the input hash."""

    def test_m1_slip_missing_is_22(self):
        self.write_request()
        self.assert_stop('m1', 22, 'GATE_NOT_PASSED', 'm1')

    def test_m2_slip_missing_is_22(self):
        self.m1_folder()
        self.assert_stop('m2', 22, 'GATE_NOT_PASSED', 'm2')

    def test_m3_slip_missing_is_22(self):
        self.m1_folder()
        self.m2_selection()
        self.assert_stop('m3', 22, 'GATE_NOT_PASSED', 'm3')

    def test_m1_slip_fail_is_22(self):
        self.write_request()
        self.slip('entry', 'FAIL', sha_file(self.run / 'request.json'))
        self.assert_stop('m1', 22, 'GATE_NOT_PASSED', 'm1')

    def test_m2_slip_fail_is_22(self):
        folder = self.m1_folder()
        self.slip('m1', 'FAIL', sha_folder(folder))
        self.assert_stop('m2', 22, 'GATE_NOT_PASSED', 'm2')

    def test_m3_slip_fail_is_22(self):
        self.m1_folder()
        self.m2_selection()
        self.slip('m2', 'FAIL', sha_file(self.run / 'm2' / 'selection.json'))
        self.assert_stop('m3', 22, 'GATE_NOT_PASSED', 'm3')

    def test_m1_input_changed_is_23(self):
        self.entry_pass()
        self.write_request(cap=200)
        self.assert_stop('m1', 23, 'GATE_INPUT_CHANGED', 'm1')

    def test_m2_input_changed_is_23(self):
        folder = self.m1_pass()
        write_json(folder / 'run1' / 'late-file.json', {'late': True})
        self.assert_stop('m2', 23, 'GATE_INPUT_CHANGED', 'm2')

    def test_m3_input_changed_is_23(self):
        self.m2_pass()
        self.m2_selection(links=[])
        self.assert_stop('m3', 23, 'GATE_INPUT_CHANGED', 'm3')


class GuardTests(ModuleTest):
    """D14 step 3: m1 and m3 stop on the guard; m2 is offline."""

    def test_m1_guard_on_is_readonly_20(self):
        self.entry_pass()
        self.guard_on()
        self.assert_stop('m1', 20, 'READONLY_ON', 'm1')

    def test_m3_guard_on_is_readonly_20(self):
        self.m2_pass()
        self.guard_on()
        self.assert_stop('m3', 20, 'READONLY_ON', 'm3')

    def test_m2_guard_on_is_not_guarded(self):
        selection = self.m2_selection()
        manual = pathlib.Path(self._tmp.name) / 'manual-selection.json'
        write_json(manual, selection)
        self.guard_on()
        rc, payload, stderr = self.module('m2', '--manual', str(manual))
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['verdict'], 'PASS')
        self.assert_no_subprocess()


class CaptureSpecTests(ModuleTest):
    """D15 + R2: entry warns, m1 stops hard without a capture spec."""

    def test_m1_without_capture_spec_is_capture_spec_missing(self):
        self.write_request(capture_spec=False)
        self.slip('entry', 'PASS', sha_file(self.run / 'request.json'))
        self.assert_stop('m1', 20, 'CAPTURE_SPEC_MISSING', 'm1')


class ManualTests(ModuleTest):
    """D16: m2 --manual copies a valid file and refuses an invalid one."""

    def test_manual_valid_is_copied_and_passes_gate(self):
        selection = self.m2_selection()
        manual = pathlib.Path(self._tmp.name) / 'manual-selection.json'
        write_json(manual, selection)
        rc, payload, stderr = self.module('m2', '--manual', str(manual))
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['verdict'], 'PASS')
        self.assertEqual(payload['failedChecks'], [])
        written = json.loads((self.run / 'm2' / 'selection.json').read_text())
        self.assertEqual(written, selection)
        self.assert_no_subprocess()

    def test_manual_invalid_is_refused(self):
        write_json(self.run / 'm2' / 'selection.json', {'sentinel': True})
        bad = selection_payload(source='auto')
        manual = pathlib.Path(self._tmp.name) / 'manual-selection.json'
        write_json(manual, bad)
        rc, payload, stderr = self.module('m2', '--manual', str(manual))
        self.assertEqual(rc, 20, (payload, stderr))
        self.assertEqual(payload['errorCode'], 'MANUAL_SELECTION_INVALID')
        self.assertEqual(json.loads((self.run / 'm2' / 'selection.json').read_text()), {'sentinel': True})
        self.assert_no_subprocess()


if __name__ == '__main__':
    unittest.main()

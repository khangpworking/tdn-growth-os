"""Contract tests for the flow commands of shopee_flow.py (B3, contract 5 and 6).

Each test owns temp runs, state and presets roots. The `run` command is only
called on a run whose first verdict is not PASS, or while a run is busy, so no
module subprocess starts. A fake `node` on PATH records any start.
"""
import argparse
import contextlib
import fcntl
import hashlib
import http.server
import importlib.util
import io
import json
import os
import pathlib
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
import uuid
from unittest import mock
import datetime as dt

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
MODULES = json.loads((ROOT / 'skills' / 'tdn-shopee-flow' / 'modules.json').read_bytes())
END = '2026-11-10'

PRESET = {
    'format': 'preset-v1',
    'presetId': 'kem',
    'label': 'Kem chống nắng',
    'principalTitles': ['Kem chống nắng mẫu A'],
    'preset': {
        'contractVersion': 'metric-v3-capture-spec-v2',
        'preset': {
            'keywords': ['kem chống nắng'], 'smartQuery': True,
            'category': {'id': 'c2035652732', 'label': 'Sức Khoẻ', 'children': [
                {'id': 'c407923064', 'label': 'Chăm sóc sức khỏe'},
                {'id': 'c1221630203', 'label': 'Dinh dưỡng thể thao, protein'},
                {'id': 'c1110582659', 'label': 'Sức khỏe khác'},
                {'id': 'c2140822537', 'label': 'Thực phẩm chức năng'},
            ]},
            'usefulFilters': {'fake': True, 'gifts': True, 'deleted': True},
            'advancedFilter': {'firstField': 'rating_count', 'operator': '>', 'firstRate': 1,
                               'secondField': 'order_count', 'secondRate': 0.02},
            'shopTypes': ['mall', 'regular'], 'platforms': ['shopee', 'lazada', 'tiki', 'tiktok'],
            'aiNormalisation': False, 'customizeCategory': False, 'exclusions': [],
        },
    },
    'source': 'manual',
}

CAPTURE_SPEC = {
    'contractVersion': 'metric-v3-capture-spec-v2',
    'preset': PRESET['preset']['preset'],
    'windows': [
        {'id': '30d', 'period': {'startDate': '2026-10-12', 'endDate': END}, 'intervalDays': 7},
        {'id': '12m', 'period': {'startDate': '2025-11-11', 'endDate': END}, 'intervalDays': 30},
    ],
}

RUN_ID = 'a1b2c3d4'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf8')


def sha_folder(folder):
    names = sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file())
    text = ''.join(f'{name}\t{hashlib.sha256((folder / name).read_bytes()).hexdigest()}\n' for name in names)
    return hashlib.sha256(text.encode('utf8')).hexdigest()


def request_payload(cap=300, keywords=None):
    return {
        'format': 'request-v1',
        'preset': {'keywords': ['kem chống nắng'] if keywords is None else keywords},
        'principalTitles': ['Kem chống nắng mẫu A'],
        'windows': [{'id': '30d', 'period': {'startDate': '2026-10-12', 'endDate': END}, 'intervalDays': 7},
                    {'id': '12m', 'period': {'startDate': '2025-11-11', 'endDate': END}, 'intervalDays': 30}],
        'reviewCapPerLink': cap,
        'captureSpec': CAPTURE_SPEC,
    }


def configured_request_payload(total=500):
    return {
        'format': 'request-v2',
        'preset': {'keywords': ['kem chống nắng']},
        'principalTitles': ['Kem chống nắng mẫu A'],
        'windows': [{'id': '30d', 'period': {'startDate': '2026-10-12', 'endDate': END}, 'intervalDays': 7},
                    {'id': '12m', 'period': {'startDate': '2025-11-11', 'endDate': END}, 'intervalDays': 30}],
        'collectionPolicy': {
            'format': 'shopee-review-policy-v1', 'mode': 'stars', 'stars': [2, 3],
            'totalPerLink': total, 'allocation': 'pooled',
            'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1',
        },
        'captureSpec': CAPTURE_SPEC,
    }


METRIC_START = '2026-10-12'
METRIC_END = '2026-10-28'
CATEGORY_CHILDREN = (
    {'id': 'c407923064', 'label': 'Chăm sóc sức khỏe'},
    {'id': 'c1221630203', 'label': 'Dinh dưỡng thể thao, protein'},
    {'id': 'c1110582659', 'label': 'Sức khỏe khác'},
    {'id': 'c2140822537', 'label': 'Thực phẩm chức năng'},
)
METRIC_OPTIONS = {
    'smartQuery': True,
    'usefulFilters': {'fake': True, 'gifts': True, 'deleted': True},
    'shopTypes': ['mall', 'regular'],
    'categoryIds': [child['id'] for child in CATEGORY_CHILDREN],
    'aiNormalisation': False,
    'customizeCategory': False,
    'smartExclusion': False,
}
CAPTURE_CHECK_IDS = tuple('capture_spec_' + name for name in (
    'present', 'schema', 'confirmed_input', 'keywords', 'platforms', 'category', 'filters', 'shops',
    'smart_query', 'ai', 'custom_category', 'smart_exclusion', 'advanced_filter', 'exclusions', 'window'))


def selected_spec(options=None, start=METRIC_START, end=METRIC_END):
    """Expected capture spec for the desktop's selected-window creation input."""
    options = json.loads(json.dumps(METRIC_OPTIONS if options is None else options))
    fields = {
        'keywords': ['kem chống nắng'],
        'platforms': ['shopee', 'lazada', 'tiki', 'tiktok'],
        'category': {'id': 'c2035652732', 'label': 'Sức Khoẻ',
                     'children': [dict(child) for child in CATEGORY_CHILDREN if child['id'] in options['categoryIds']]},
        'advancedFilter': {'firstField': 'rating_count', 'operator': '>', 'firstRate': 1,
                           'secondField': 'order_count', 'secondRate': 0.02},
        'exclusions': [],
        **{key: value for key, value in options.items() if key != 'categoryIds'},
    }
    window = {'id': 'selected', 'period': {'startDate': start, 'endDate': end}, 'intervalDays': 7}
    return {'contractVersion': 'metric-v3-capture-spec-v3', 'preset': fields, 'windows': [window]}


def selected_request_payload():
    spec = selected_spec()
    return {
        'format': 'request-v2', 'preset': {'keywords': ['kem chống nắng']},
        'principalTitles': ['Kem chống nắng mẫu A'], 'windows': json.loads(json.dumps(spec['windows'])),
        'collectionPolicy': configured_request_payload()['collectionPolicy'],
        'captureSpec': spec,
        'metricInput': {'format': 'shopee-metric-input-v1', 'preset': json.loads(json.dumps(spec['preset'])),
                        'window': json.loads(json.dumps(spec['windows'][0]))},
    }


CLOCK_JAIL = '''"""Test harness: freezes one instant for a child CLI process, no production seam."""
import datetime as _datetime
import os

_frozen = _datetime.datetime.fromisoformat(os.environ['TEST_FROZEN_UTC'])


class _FrozenDate(_datetime.date):
    @classmethod
    def today(cls):
        return cls.fromtimestamp(_frozen.timestamp())


class _FrozenDatetime(_datetime.datetime):
    @classmethod
    def now(cls, tz=None):
        return _frozen.astimezone(tz) if tz is not None else _frozen.replace(tzinfo=None)


_datetime.date = _FrozenDate
_datetime.datetime = _FrozenDatetime
'''


class FlowTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(dir=SCRIPT.parents[3])
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs = base / 'runs'
        self.state = base / 'state'
        self.presets = base / 'presets'
        self.bin = base / 'bin'
        self.marker = base / 'node-called'
        self.legacy_marker = base / 'legacy-collect-called'
        for folder in (self.runs, self.state, self.presets, self.bin):
            folder.mkdir(parents=True)
        node = self.bin / 'node'
        node.write_text('#!/bin/sh\ntouch "$NODE_MARKER"\n', encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        finished = subprocess.Popen([sys.executable, '-c', 'pass'])
        finished.wait()
        self.dead_pid = finished.pid

    def env(self, extra=None):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE',
                                                         'SHOPEE_FLOW_PRESETS', 'NODE_MARKER',
                                                         'LEGACY_MARKER', 'REAL_TS_SAMPLING',
                                                         'TEST_FROZEN_UTC', 'PYTHONPATH')}
        env['SHOPEE_FLOW_RUNS'] = str(self.runs)
        env['SHOPEE_FLOW_STATE'] = str(self.state)
        env['SHOPEE_FLOW_PRESETS'] = str(self.presets)
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        env['NODE_MARKER'] = str(self.marker)
        env['LEGACY_MARKER'] = str(self.legacy_marker)
        env['REAL_TS_SAMPLING'] = '0'
        env['PATH'] = f'{self.bin}{os.pathsep}{env.get("PATH", "")}'
        if extra:
            env.update(extra)
        return env

    def command(self, *args, stdin=None, extra_env=None):
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True,
                              env=self.env(extra_env), input=stdin, timeout=90)
        payload = json.loads(proc.stdout) if proc.stdout.strip() else None
        return proc.returncode, payload, proc.stderr

    def assert_no_subprocess(self):
        self.assertFalse(self.marker.exists(), 'a module subprocess was started')

    def read_request(self, payload):
        run = self.runs / payload['runId']
        return run, json.loads((run / 'request.json').read_text())

    def write_preset(self, preset_id='kem', **over):
        value = json.loads(json.dumps(PRESET))
        value['presetId'] = preset_id
        value.update(over)
        write_json(self.presets / f'{preset_id}.json', value)
        return value

    def make_run(self, run_id=RUN_ID, request=None, state=None, gates=()):
        run = self.runs / run_id
        write_json(run / 'request.json', request_payload() if request is None else request)
        write_json(run / 'state.json', {
            'format': 'state-v1', 'runId': run_id, 'status': 'IDLE', 'mode': None, 'module': None,
            'pid': None, 'startedAt': None, 'endedAt': None, 'errorCode': None, 'failedCheck': None,
        } if state is None else state)
        for name, slip in gates:
            write_json(run / 'gates' / f'{name}.json', slip)
        return run


def load_flow_script():
    spec = importlib.util.spec_from_file_location('shopee_flow_contract', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PrerequisiteBarrierTests(FlowTest):
    """The shared B1/B2 barrier reads one receipt for identity, verdict and output hash."""

    def test_one_receipt_read_cannot_mix_a_pass_verdict_with_another_hash(self):
        flow = load_flow_script()
        run = self.runs / RUN_ID
        passed = {'format': 'handoff-v1', 'runId': RUN_ID, 'module': 'M1', 'verdict': 'PASS',
                  'outputSha256': 'a' * 64}
        failed = {**passed, 'verdict': 'FAIL'}
        receipts = []

        def changing(path):
            receipts.append(path)
            return passed if len(receipts) == 1 else failed

        with mock.patch.object(flow, 'gate_read', changing):
            result = flow.gate_prerequisite(run, 'm1', 'a' * 64)
        self.assertEqual(result, (None, 0))
        self.assertEqual(len(receipts), 1, 'the verdict and the output hash must come from the same receipt')


class MetricDateAvailabilityTests(FlowTest):
    """Explicit calendar observation through the real CLI and synthetic opencli."""

    def setUp(self):
        super().setUp()
        self.opencli_bin = self.runs.parent / 'opencli-bin'
        self.opencli_bin.mkdir()
        self.opencli_log = self.runs.parent / 'opencli.log'

    def install_opencli(self, *, available_date=None, read_state='{}'):
        result = json.dumps({'availableDate': available_date}) if available_date else '{}'
        script = f'''#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]
with open({str(self.opencli_log)!r}, 'a', encoding='utf-8') as log:
    log.write(' '.join(args) + '\\n')
if 'tab' in args and 'new' in args:
    print(json.dumps({{'page': 'abc123'}}))
elif 'eval' in args:
    expression = args[-1]
    call = json.loads(expression[expression.rfind(')(') + 2:-1])
    kind = call.get('kind')
    if kind == 'availableDate':
        print({result!r})
    elif kind:
        print('{{}}')
    else:
        print({read_state!r})
else:
    print('{{}}')
'''
        opencli = self.opencli_bin / 'opencli'
        opencli.write_text(script, encoding='utf-8')
        opencli.chmod(opencli.stat().st_mode | stat.S_IXUSR)

    def availability(self, end_date, **extra_env):
        env = {'PATH': f'{self.opencli_bin}{os.pathsep}{os.environ.get("PATH", "")}'}
        env.update(extra_env)
        return self.command('metric-date-availability', '--end-date', end_date, extra_env=env)

    def test_reports_the_exact_available_and_unavailable_calendar_wire_without_a_run(self):
        self.install_opencli(available_date='2026-11-09')
        rc, payload, stderr = self.availability('2026-11-09')
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload, {
            'format': 'metric-date-availability-v1', 'requestedEndDate': '2026-11-09',
            'lastSelectableDate': '2026-11-09', 'available': True, 'errorCode': None})

        rc, payload, stderr = self.availability('2026-11-11')
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload, {
            'format': 'metric-date-availability-v1', 'requestedEndDate': '2026-11-11',
            'lastSelectableDate': '2026-11-09', 'available': False,
            'errorCode': 'CAPTURE_PERIOD_NOT_SELECTABLE'})
        self.assertEqual(list(self.runs.iterdir()), [], 'the calendar observation creates no run')
        log = self.opencli_log.read_text(encoding='utf-8')
        self.assertEqual(log.count('tab new'), 2, 'one owned calendar tab per observation')
        self.assertIn('availableDate', log)

    def test_refuses_invalid_input_and_readonly_before_any_calendar_process(self):
        self.install_opencli(available_date='2026-11-09')
        rc, payload, _ = self.availability('2026-13-01')
        self.assertEqual((rc, payload), (2, {
            'format': 'error-v1', 'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}))
        self.assertFalse(self.opencli_log.exists(), 'invalid input never spawns the calendar check')

        rc, payload, _ = self.availability('2026-11-09', TDN_SHOPEE_FLOW_READONLY='1')
        self.assertEqual((rc, payload), (20, {
            'format': 'error-v1', 'code': 'READONLY_ON', 'message': 'READONLY_ON'}))
        self.assertFalse(self.opencli_log.exists(), 'READONLY refuses before the calendar check')
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_calendar_failure_is_static_and_never_invents_a_last_date_or_run(self):
        self.install_opencli(read_state=json.dumps({'stop': 'CAPTURE_LOGIN_REQUIRED'}))
        rc, payload, stderr = self.availability('2026-11-11')
        self.assertEqual(rc, 20, (payload, stderr))
        self.assertEqual(payload, {
            'format': 'error-v1', 'code': 'CAPTURE_LOGIN_REQUIRED',
            'message': 'CAPTURE_LOGIN_REQUIRED'})
        self.assertNotIn('lastSelectableDate', payload)
        self.assertEqual(list(self.runs.iterdir()), [])


class NewRunTests(FlowTest):
    def create(self, payload):
        return self.command('new-run', '--stdin', stdin=json.dumps(payload))

    def test_legacy_cap_input_maps_to_request_v2_default_policy(self):
        preset = self.write_preset()
        rc, payload, stderr = self.create({'presetId': 'kem', 'endDate': END, 'reviewCapPerLink': 50})
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'new-run-v1', payload)
        run_id = payload.get('runId')
        self.assertRegex(run_id, r'^[0-9a-f]{8}$')
        run, request = self.read_request(payload)
        self.assertEqual(request['format'], 'request-v2')
        self.assertNotIn('reviewCapPerLink', request)
        self.assertEqual(request['collectionPolicy'], {
            'format': 'shopee-review-policy-v1', 'mode': 'with-comments', 'stars': [],
            'totalPerLink': 50, 'allocation': 'pooled',
            'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'})
        self.assertEqual(request['preset']['keywords'], preset['preset']['preset']['keywords'])
        self.assertEqual([w['id'] for w in request['windows']], ['30d', '12m'])
        for window in request['windows']:
            self.assertEqual(window['period']['endDate'], END)
        self.assertEqual(request['captureSpec']['windows'][0]['id'], '30d')
        self.assertEqual(request['captureSpec']['windows'][1]['id'], '12m')
        self.assertEqual(request['principalTitles'], preset['principalTitles'])
        state = json.loads((run / 'state.json').read_text())
        self.assertEqual(state['format'], 'state-v1')
        self.assertEqual(state['runId'], run_id)
        self.assertEqual(state['status'], 'IDLE')
        self.assertFalse((run / 'gates' / 'entry.json').exists())
        self.assert_no_subprocess()

    def test_collection_policy_500_with_stars_2_3_is_saved_canonically(self):
        self.write_preset()
        rc, payload, stderr = self.create({
            'presetId': 'kem', 'endDate': END,
            'collectionPolicy': {'mode': 'stars', 'stars': [3, 2], 'totalPerLink': 500,
                                 'allocation': 'pooled'}})
        self.assertEqual(rc, 0, (payload, stderr))
        _, request = self.read_request(payload)
        self.assertEqual(request['format'], 'request-v2')
        self.assertNotIn('reviewCapPerLink', request)
        self.assertEqual(request['collectionPolicy'], {
            'format': 'shopee-review-policy-v1', 'mode': 'stars', 'stars': [2, 3],
            'totalPerLink': 500, 'allocation': 'pooled',
            'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'})
        self.assert_no_subprocess()

    def test_new_run_without_a_cap_or_policy_uses_the_default_300(self):
        self.write_preset()
        rc, payload, stderr = self.create({'presetId': 'kem', 'endDate': END})
        self.assertEqual(rc, 0, (payload, stderr))
        _, request = self.read_request(payload)
        self.assertEqual(request['collectionPolicy'], {
            'format': 'shopee-review-policy-v1', 'mode': 'with-comments', 'stars': [],
            'totalPerLink': 300, 'allocation': 'pooled',
            'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'})
        self.assert_no_subprocess()

    def test_new_run_rejects_ambiguous_or_invalid_collection_policy(self):
        self.write_preset()
        before = set(self.runs.iterdir())
        cases = (
            {'presetId': 'kem', 'endDate': END, 'reviewCapPerLink': 300,
             'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 300, 'allocation': 'pooled'}},
            {'presetId': 'kem', 'endDate': END,
             'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 0, 'allocation': 'pooled'}},
            {'presetId': 'kem', 'endDate': END,
             'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 2001, 'allocation': 'pooled'}},
            {'presetId': 'kem', 'endDate': END,
             'collectionPolicy': {'mode': 'stars', 'stars': [], 'totalPerLink': 10, 'allocation': 'pooled'}},
            {'presetId': 'kem', 'endDate': END,
             'collectionPolicy': {'mode': 'all', 'stars': [1], 'totalPerLink': 10, 'allocation': 'pooled'}},
            {'presetId': 'kem', 'endDate': END,
             'collectionPolicy': {'mode': 'all', 'stars': [], 'totalPerLink': 10, 'allocation': 'equal-stars'}},
        )
        for value in cases:
            with self.subTest(value=value):
                rc, payload, _ = self.create(value)
                self.assertEqual(rc, 2, payload)
                self.assertEqual(payload, {'format': 'error-v1', 'code': 'NEW_RUN_INPUT_INVALID',
                                           'message': 'NEW_RUN_INPUT_INVALID'})
        self.assertEqual(set(self.runs.iterdir()), before)
        self.assert_no_subprocess()

    def test_selected_window_options_roundtrip_into_the_saved_request(self):
        preset = self.write_preset()
        options = {
            'smartQuery': False,
            'usefulFilters': {'fake': False, 'gifts': True, 'deleted': False},
            'shopTypes': ['regular'],
            'categoryIds': ['c2140822537', 'c407923064'],
            'aiNormalisation': True,
            'customizeCategory': True,
            'smartExclusion': True,
        }
        rc, payload, stderr = self.create({
            'presetId': 'kem', 'startDate': METRIC_START, 'endDate': METRIC_END, 'metricOptions': options,
            'collectionPolicy': {'mode': 'stars', 'stars': [3, 2], 'totalPerLink': 500, 'allocation': 'pooled'}})
        self.assertEqual(rc, 0, (payload, stderr))
        run, request = self.read_request(payload)
        expected = selected_spec(options)
        self.assertEqual(request['format'], 'request-v2')
        self.assertEqual(request['captureSpec'], expected)
        self.assertEqual(request['windows'], expected['windows'])
        self.assertEqual(request['metricInput'], {
            'format': 'shopee-metric-input-v1',
            'preset': expected['preset'],
            'window': expected['windows'][0],
        })
        self.assertEqual(request['preset']['keywords'], preset['preset']['preset']['keywords'])
        self.assertEqual(request['principalTitles'], preset['principalTitles'])
        self.assertNotIn('reviewCapPerLink', request)
        self.assertEqual(request['collectionPolicy']['stars'], [2, 3])
        self.assertEqual(request['selectionPolicy'], 'metric-products-top-v3')
        self.assertEqual(json.loads((run / 'request.json').read_text()), request)
        self.assert_no_subprocess()

    def test_partial_or_invalid_selected_inputs_create_no_run(self):
        self.write_preset()
        before = set(self.runs.iterdir())
        # The completed-day cutoff follows the supported desktop calendar, not the host's.
        today = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date()

        def value(start=METRIC_START, end=METRIC_END, options=None):
            return {'presetId': 'kem', 'startDate': start, 'endDate': end,
                    'metricOptions': {**json.loads(json.dumps(METRIC_OPTIONS)), **(options or {})}}

        missing = json.loads(json.dumps(METRIC_OPTIONS))
        missing.pop('smartExclusion')
        cases = (
            ('start only', {'presetId': 'kem', 'endDate': METRIC_END,
                            'metricOptions': json.loads(json.dumps(METRIC_OPTIONS))}, 'NEW_RUN_INPUT_INVALID'),
            ('options only', {'presetId': 'kem', 'startDate': METRIC_START, 'endDate': METRIC_END},
             'NEW_RUN_INPUT_INVALID'),
            ('reverse dates', value(start=METRIC_END, end=METRIC_START), 'NEW_RUN_INPUT_INVALID'),
            ('end not completed today', value(start=(today - dt.timedelta(days=17)).isoformat(),
                                             end=today.isoformat()), 'NEW_RUN_INPUT_INVALID'),
            ('empty groups', value(options={'categoryIds': []}), 'METRIC_OPTIONS_INVALID'),
            ('unknown group', value(options={'categoryIds': ['c999']}), 'METRIC_OPTIONS_INVALID'),
            ('empty shops', value(options={'shopTypes': []}), 'METRIC_OPTIONS_INVALID'),
            ('extra option', value(options={'keywords': ['kem chống nắng']}), 'METRIC_OPTIONS_INVALID'),
            ('missing option', {'presetId': 'kem', 'startDate': METRIC_START, 'endDate': METRIC_END,
                                'metricOptions': missing}, 'METRIC_OPTIONS_INVALID'),
        )
        for name, input_value, expected in cases:
            with self.subTest(name):
                rc, payload, _ = self.create(input_value)
                self.assertEqual(rc, 2, (name, payload))
                self.assertEqual(payload, {'format': 'error-v1', 'code': expected, 'message': expected}, name)
        self.assertEqual(set(self.runs.iterdir()), before)
        self.assert_no_subprocess()


class SelectedDateBoundaryTests(FlowTest):
    """The selected-window cutoff follows the supported desktop calendar (Asia/Bangkok, UTC+07)."""

    def create_at(self, frozen_utc, tz, payload):
        jail = pathlib.Path(self._tmp.name) / f'clock-{uuid.uuid4().hex[:8]}'
        jail.mkdir()
        (jail / 'sitecustomize.py').write_text(CLOCK_JAIL, encoding='utf8')
        return self.command('new-run', '--stdin', stdin=json.dumps(payload),
                            extra_env={'PYTHONPATH': str(jail), 'TEST_FROZEN_UTC': frozen_utc, 'TZ': tz})

    def selected(self, start, end):
        return {'presetId': 'kem', 'startDate': start, 'endDate': end,
                'metricOptions': json.loads(json.dumps(METRIC_OPTIONS))}

    def test_accepts_the_last_completed_desktop_day_across_the_midnight_gap(self):
        self.write_preset()
        for tz in ('UTC', '<+07>-7'):
            with self.subTest(tz):
                rc, payload, stderr = self.create_at(
                    '2026-11-11T17:30:00+00:00', tz, self.selected('2026-11-10', '2026-11-11'))
                self.assertEqual(rc, 0, (tz, payload, stderr))
                _, request = self.read_request(payload)
                window = {'startDate': '2026-11-10', 'endDate': '2026-11-11'}
                self.assertEqual(request['windows'][0]['period'], window)
                self.assertEqual(request['captureSpec']['windows'][0]['period'], window)
                self.assertEqual(request['metricInput']['window']['period'], window)
                self.assert_no_subprocess()

    def test_refuses_the_same_end_before_the_desktop_day_completes(self):
        self.write_preset()
        before = set(self.runs.iterdir())
        for tz in ('UTC', '<+07>-7'):
            with self.subTest(tz):
                rc, payload, _ = self.create_at(
                    '2026-11-11T16:30:00+00:00', tz, self.selected('2026-11-10', '2026-11-11'))
                self.assertEqual(rc, 2, (tz, payload))
                self.assertEqual(payload, {'format': 'error-v1', 'code': 'NEW_RUN_INPUT_INVALID',
                                           'message': 'NEW_RUN_INPUT_INVALID'})
        self.assertEqual(set(self.runs.iterdir()), before)
        self.assert_no_subprocess()

    def test_refuses_unfinished_future_malformed_or_reversed_desktop_dates(self):
        self.write_preset()
        before = set(self.runs.iterdir())
        cases = (
            ('desktop day not completed', self.selected('2026-11-11', '2026-11-12')),
            ('future end', self.selected('2026-11-11', '2026-11-13')),
            ('malformed end', self.selected('2026-11-10', '2026-02-30')),
            ('reversed range', self.selected('2026-11-11', '2026-11-10')),
        )
        for name, payload in cases:
            with self.subTest(name):
                rc, result, _ = self.create_at('2026-11-11T17:30:00+00:00', 'UTC', payload)
                self.assertEqual(rc, 2, (name, result))
                self.assertEqual(result, {'format': 'error-v1', 'code': 'NEW_RUN_INPUT_INVALID',
                                          'message': 'NEW_RUN_INPUT_INVALID'})
        self.assertEqual(set(self.runs.iterdir()), before)
        self.assert_no_subprocess()

    def test_legacy_creation_keeps_two_periods_without_the_completed_day_cutoff(self):
        self.write_preset()
        for tz in ('UTC', '<+07>-7'):
            with self.subTest(tz):
                rc, payload, stderr = self.create_at(
                    '2026-11-11T16:30:00+00:00', tz, {'presetId': 'kem', 'endDate': '2026-11-11'})
                self.assertEqual(rc, 0, (tz, payload, stderr))
                _, request = self.read_request(payload)
                self.assertEqual([window['id'] for window in request['windows']], ['30d', '12m'])
                for window in request['windows']:
                    self.assertEqual(window['period']['endDate'], '2026-11-11')
                self.assertEqual(request['captureSpec']['windows'][1]['id'], '12m')
                self.assert_no_subprocess()


class ReadOnlyCommandTests(FlowTest):
    def test_presets_format(self):
        self.write_preset('kem')
        self.write_preset('ao', label='Áo mẫu', preset=PRESET['preset'])
        rc, payload, stderr = self.command('presets')
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'presets-v1', payload)
        entries = sorted(payload['presets'], key=lambda item: item['presetId'])
        self.assertEqual([item['presetId'] for item in entries], ['ao', 'kem'])
        for item in entries:
            self.assertEqual(set(item), {'presetId', 'label', 'keywords', 'categoryLabel', 'source'})
        kem = next(item for item in entries if item['presetId'] == 'kem')
        self.assertEqual(kem['label'], 'Kem chống nắng')
        self.assertEqual(kem['keywords'], ['kem chống nắng'])
        self.assertEqual(kem['source'], 'manual')
        self.assertTrue(kem['categoryLabel'])

    def test_runs_lists_newest_first_and_changes_no_file(self):
        legacy_request = request_payload()
        configured_request = configured_request_payload()
        older = self.make_run('aaaaaaaa', request=legacy_request,
                              state={'format': 'state-v1', 'runId': 'aaaaaaaa', 'status': 'IDLE', 'createdAt': '2026-11-08T01:00:00Z'})
        newer = self.make_run('bbbbbbbb', request=configured_request,
                              state={'format': 'state-v1', 'runId': 'bbbbbbbb', 'status': 'STOPPED', 'createdAt': '2026-11-09T01:00:00Z'})
        older, newer = str(older), str(newer)
        before = sha_folder(self.runs)
        rc, payload, stderr = self.command('runs')
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'runs-v1', payload)
        ids = [item['runId'] for item in payload['runs']]
        self.assertEqual(ids, ['bbbbbbbb', 'aaaaaaaa'])
        for item in payload['runs']:
            self.assertEqual(set(item), {'runId', 'createdAt', 'product', 'request', 'status',
                                         'lastGate', 'lastVerdict', 'errorCode', 'tracking', 'execution'})
            self.assertEqual(item['execution']['format'], 'run-execution-view-v1')
            self.assertEqual(item['tracking'], {
                'primaryKeyword': 'kem chống nắng', 'firstRunAt': None,
                'timeBasis': 'legacy-first-unproven', 'displayTimezone': 'Asia/Ho_Chi_Minh',
                'lastKnownStartedAt': None})
        by_id = {item['runId']: item for item in payload['runs']}
        for run_id, source in (('aaaaaaaa', legacy_request), ('bbbbbbbb', configured_request)):
            self.assertEqual(by_id[run_id]['request'],
                             {k: v for k, v in source.items() if k != 'captureSpec'})
            self.assertNotIn('captureSpec', by_id[run_id]['request'])
        self.assertEqual(by_id['aaaaaaaa']['request']['reviewCapPerLink'], 300)
        self.assertNotIn('collectionPolicy', by_id['aaaaaaaa']['request'])
        self.assertEqual(by_id['bbbbbbbb']['request']['collectionPolicy']['totalPerLink'], 500)
        self.assertEqual(by_id['bbbbbbbb']['request']['collectionPolicy']['stars'], [2, 3])
        self.assertNotIn('reviewCapPerLink', by_id['bbbbbbbb']['request'])
        self.assertEqual(sha_folder(self.runs), before)
        self.assertTrue(older and newer)
        self.assert_no_subprocess()

    def test_run_info_format_and_changes_no_file(self):
        run = self.make_run(gates=(('entry', {
            'format': 'handoff-v1', 'module': 'ENTRY', 'runId': RUN_ID, 'skillVersion': '1.0.0',
            'verdict': 'PASS', 'inputSha256': None, 'outputSha256': 'f' * 64,
            'checks': [{'id': 'capture_spec_present', 'ok': False, 'got': 'absent', 'level': 'warn'}],
            'errorCode': None, 'next': 'M1'}),))
        before = sha_folder(run)
        rc, payload, stderr = self.command('run-info', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'run-info-v1', payload)
        self.assertEqual(payload['runId'], RUN_ID)
        self.assertIsInstance(payload['readonly'], bool)
        self.assertEqual(payload['tracking'], {
            'primaryKeyword': 'kem chống nắng', 'firstRunAt': None,
            'timeBasis': 'legacy-first-unproven', 'displayTimezone': 'Asia/Ho_Chi_Minh',
            'lastKnownStartedAt': None})
        self.assertNotIn('captureSpec', payload['request'])
        self.assertEqual([m['id'] for m in payload['modules']], ['M1', 'M2', 'M3'])
        blocked_codes = {None, 'GATE_NOT_PASSED', 'GATE_INPUT_CHANGED', 'RUN_BUSY', 'READONLY_ON'}
        for module in payload['modules']:
            self.assertIsInstance(module['canRun'], bool)
            self.assertIn(module['blockedBy']['code'] if module['blockedBy'] else None, blocked_codes)
        self.assertEqual(set(payload['gates']), {'entry', 'm1', 'm2', 'm3'})
        self.assertEqual(payload['gates']['entry']['verdict'], 'PASS')
        self.assertIsNone(payload['gates']['m1'])
        self.assertIsNone(payload['selection'])
        self.assertEqual(sha_folder(run), before)

    def test_library_format(self):
        rc, payload, stderr = self.command('library')
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'library-v1', payload)
        self.assertEqual(payload['modules'], MODULES)
        skills = {item['name']: item for item in payload['skills']}
        for module in MODULES['modules']:
            self.assertIn(module['skill'], skills)
            self.assertEqual(skills[module['skill']]['version'], module['skillVersion'])
            self.assertTrue(skills[module['skill']]['text'].strip())
        flow = MODULES['flow']
        self.assertIn(flow['skill'], skills)
        self.assertEqual(skills[flow['skill']]['version'], flow['skillVersion'])


SAMPLING_SERVE_NODE = '''#!/usr/bin/env python3
import json, os, pathlib, sys

args = sys.argv[1:]
script = next(a for a in args if a.endswith('.ts'))
action, rest = args[args.index(script) + 1], args[args.index(script) + 2:]
with open(os.environ['NODE_MARKER'], 'a', encoding='utf8') as log:
    log.write(action + '\\n')


def view_bytes(target):
    """What the single `view` command prints and exits with for one target."""
    run = pathlib.Path(target)
    if run.name == 'badrun':
        return 2, json.dumps({'format': 'error-v1', 'code': 'REVIEW_PLAN_INVALID',
                              'message': 'REVIEW_PLAN_INVALID'}) + '\\n'
    return 0, json.dumps({
        'format': 'review-sampling-view-v1', 'runId': run.name, 'readonly': False,
        'm2Digest': None, 'links': [], 'plans': [], 'counts': [], 'countRefresh': None,
        'blockedBy': None,
        'attempts': [{
            'attemptId': f'{run.name}-attempt', 'sequence': 1, 'createdAt': '2026-11-01T00:00:00Z',
            'status': 'SUCCEEDED', 'executionId': None, 'receiptMatchesCurrentInputs': False,
            'gate': None, 'errorCode': None, 'automatic': True,
        }],
    }) + '\\n'


SERVE_ONLY_ANSWERS = {
    'nanstdout': {'exitCode': 0, 'stdout': 'not json\\n'},
    'emptystdout': {'exitCode': 0, 'stdout': '{}\\n'},
    'errshape': {'exitCode': 20, 'stdout': json.dumps(
        {'format': 'error-v1', 'code': 'REVIEW_COMMAND_FAILED', 'message': 'REVIEW_COMMAND_FAILED'}) + '\\n'},
    'wrongrun': {'exitCode': 0, 'stdout': json.dumps(
        {'format': 'review-sampling-view-v1', 'runId': 'someoneelse', 'attempts': []}) + '\\n'},
}


if action == 'serve-views':
    if os.environ.get('SERVE_BROKEN') == '1':
        print('not json', flush=True)
        raise SystemExit(0)
    served, hung = 0, False
    with open(os.environ['NODE_MARKER'] + '.serverpid', 'a', encoding='utf8') as log:
        log.write(str(os.getpid()) + '\\n')
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if os.environ.get('SERVE_DIES') == '1' and served:
            raise SystemExit(1)
        with open(os.environ['NODE_MARKER'] + '.stdin', 'a', encoding='utf8') as log:
            log.write(line + '\\n')
        target = json.loads(line)
        if hung or pathlib.Path(target).name == 'hang':
            hung = True  # alive but never answers again; the client must bound its wait
            continue
        name = pathlib.Path(target).name
        answer = SERVE_ONLY_ANSWERS.get(name)
        if answer is None:
            exit_code, stdout = view_bytes(target)
            answer = {'exitCode': exit_code, 'stdout': stdout}
        print(json.dumps(answer), flush=True)
        served += 1
elif action == 'view':
    pid_log = pathlib.Path(os.environ['NODE_MARKER'] + '.serverpid')
    for pid in (pid_log.read_text().split() if pid_log.exists() else []):
        try:
            os.kill(int(pid), 0)
            state = 'alive'
        except ProcessLookupError:
            state = 'gone'
        with open(os.environ['NODE_MARKER'] + '.serverstate', 'a', encoding='utf8') as log:
            log.write(state + '\\n')
    exit_code, stdout = view_bytes(rest[0])
    sys.stdout.write(stdout)
    raise SystemExit(exit_code)
else:
    raise SystemExit('unexpected sampling action')
'''


class RunsSamplingStreamTests(FlowTest):
    """F647 round 2: the run list streams each run's sampling view through one long-lived node process."""

    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(SAMPLING_SERVE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)

    def sampled_run(self, run_id):
        run = self.make_run(run_id)
        (run / 'm3-custom').mkdir()
        return run

    def starts(self):
        return self.marker.read_text().splitlines() if self.marker.exists() else []

    def asked_paths(self):
        log = self.marker.with_name(self.marker.name + '.stdin')
        return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def runs_in_process(self, flow, per_run_views=False, extra_env=None):
        output = io.StringIO()
        patcher = (mock.patch.object(flow.SamplingViewServer, 'view', lambda server, run: flow.review_sampling_script(
            server.repo, server.config, 'view', run)) if per_run_views else contextlib.nullcontext())
        with mock.patch.dict(os.environ, self.env(extra_env), clear=True), patcher, contextlib.redirect_stdout(output):
            flow.cmd_flow_query(argparse.Namespace(cmd='runs'))
        return output.getvalue()

    def command_in_process(self, flow, order, raw=False):
        real_iterdir = pathlib.Path.iterdir

        def iterdir(path):
            items = list(real_iterdir(path))
            if path == self.runs:
                items.sort(key=lambda item: order.index(item.name) if item.name in order else len(order))
            return iter(items)

        output = io.StringIO()
        with mock.patch.dict(os.environ, self.env(), clear=True), \
                mock.patch.object(pathlib.Path, 'iterdir', iterdir), contextlib.redirect_stdout(output):
            try:
                flow.cmd_flow_query(argparse.Namespace(cmd='runs'))
            except SystemExit as error:
                return error.code, output.getvalue() if raw else json.loads(output.getvalue())
        return 0, output.getvalue() if raw else json.loads(output.getvalue())

    def test_runs_starts_node_once_and_matches_the_per_run_view_output(self):
        first, second = self.sampled_run('aaaaaaaa'), self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        new_bytes = self.runs_in_process(flow)
        self.assertEqual(self.starts(), ['serve-views'], 'one node start serves every run')
        self.assertEqual(sorted(self.asked_paths()), sorted([str(first), str(second)]))
        self.marker.unlink()
        old_bytes = self.runs_in_process(flow, per_run_views=True)
        self.assertEqual(len(self.starts()), 2, 'the old path starts node per run')
        self.assertEqual(new_bytes, old_bytes, 'streaming the views changes no byte of the runs answer')
        payload = json.loads(new_bytes)
        self.assertEqual(payload['format'], 'runs-v1')
        attempts = {item['runId']: item['execution']['modules']['M3']['attemptId'] for item in payload['runs']}
        self.assertEqual(attempts, {'aaaaaaaa': 'aaaaaaaa-attempt', 'bbbbbbbb': 'bbbbbbbb-attempt'})

    def test_each_view_is_asked_at_the_run_s_place_in_the_listing(self):
        self.sampled_run('aaaaaaaa')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        rc, payload = self.command_in_process(flow, order=['bbbbbbbb', 'aaaaaaaa'])
        self.assertEqual(rc, 0, payload)
        self.assertEqual([pathlib.Path(path).name for path in self.asked_paths()], ['bbbbbbbb', 'aaaaaaaa'])

    def test_one_failing_view_still_fails_the_runs_command(self):
        self.sampled_run('aaaaaaaa')
        self.sampled_run('badrun')
        rc, payload, stderr = self.command('runs')
        self.assertEqual(rc, 2, (payload, stderr))
        self.assertEqual(payload.get('code'), 'REVIEW_PLAN_INVALID', payload)

    def test_an_earlier_receipt_error_still_wins_over_a_later_sampling_error(self):
        receipt_id = '11111111-1111-4111-8111-111111111111'
        run = self.make_run('receipt')
        write_json(run / 'executions' / f'{receipt_id}.json', {
            'format': 'shopee-module-execution-v1', 'runId': 'receipt', 'executionId': receipt_id,
            'sequence': 1, 'module': 'M1', 'kind': 'module', 'attemptId': None,
            'requestSha256': None, 'inputSha256': None, 'startedAt': '2026-11-01T00:00:00Z',
            'endedAt': None, 'status': 'FAILED', 'pid': None, 'gateSha256': None, 'errorCode': None,
            'previousGateSha256': 'a' * 64,
        })
        self.sampled_run('badrun')
        flow = load_flow_script()
        expected = (20, {'format': 'error-v1', 'code': 'EXECUTION_RECEIPT_CHANGED',
                         'message': 'EXECUTION_RECEIPT_CHANGED'})
        self.assertEqual(self.command_in_process(flow, order=['receipt', 'badrun']), expected)

    def test_an_earlier_receipt_error_still_wins_over_a_later_symlinked_request(self):
        receipt_id = '11111111-1111-4111-8111-111111111111'
        receipt = self.make_run('receipt')
        write_json(receipt / 'executions' / f'{receipt_id}.json', {
            'format': 'shopee-module-execution-v1', 'runId': 'receipt', 'executionId': receipt_id,
            'sequence': 1, 'module': 'M1', 'kind': 'module', 'attemptId': None,
            'requestSha256': None, 'inputSha256': None, 'startedAt': '2026-11-01T00:00:00Z',
            'endedAt': None, 'status': 'FAILED', 'pid': None, 'gateSha256': None, 'errorCode': None,
            'previousGateSha256': 'a' * 64,
        })
        linked = self.make_run('symrun')
        (linked / 'request.json').unlink()
        os.symlink(receipt / 'request.json', linked / 'request.json')
        flow = load_flow_script()
        expected = (20, {'format': 'error-v1', 'code': 'EXECUTION_RECEIPT_CHANGED',
                         'message': 'EXECUTION_RECEIPT_CHANGED'})
        self.assertEqual(self.command_in_process(flow, order=['receipt', 'symrun']), expected,
                         'the earlier run keeps its error even though a later run has a symlinked request')
        self.assertEqual(self.command_in_process(flow, order=['symrun', 'receipt']),
                         (2, {'format': 'error-v1', 'code': 'FLOW_INPUT_INVALID',
                              'message': 'Invalid or unreadable flow input.'}))

    def test_a_server_spawn_error_falls_back_to_the_per_run_views(self):
        self.sampled_run('aaaaaaaa')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        new_bytes = self.runs_in_process(flow)
        self.marker.unlink()
        with mock.patch.object(flow.SamplingViewServer, '_spawn', side_effect=OSError('no process')):
            fallback_bytes = self.runs_in_process(flow)
        self.assertEqual(self.starts(), ['view', 'view'], 'the spawn failure falls back for this and later runs')
        self.assertEqual(fallback_bytes, new_bytes)

    def test_a_server_that_dies_midway_falls_back_to_the_per_run_views(self):
        self.sampled_run('aaaaaaaa')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        new_bytes = self.runs_in_process(flow)
        self.marker.unlink()
        died_bytes = self.runs_in_process(flow, extra_env={'SERVE_DIES': '1'})
        starts = self.starts()
        self.assertEqual(starts.count('serve-views'), 1)
        self.assertEqual(starts.count('view'), 1, 'only the unanswered run goes back to its own process')
        self.assertEqual(died_bytes, new_bytes)

    def test_a_broken_server_falls_back_to_per_run_views(self):
        self.sampled_run('aaaaaaaa')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        new_bytes = self.runs_in_process(flow)
        self.marker.unlink()
        broken_bytes = self.runs_in_process(flow, extra_env={'SERVE_BROKEN': '1'})
        self.assertEqual(self.starts(), ['serve-views', 'view', 'view'],
                         'one broken server, then one view per run')
        self.assertEqual(broken_bytes, new_bytes)

    def attempt_ids(self, payload):
        return {item['runId']: item['execution']['modules']['M3'].get('attemptId') for item in payload['runs']}

    def test_a_server_stdout_that_is_not_json_falls_back_to_the_per_run_views(self):
        self.sampled_run('nanstdout')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        rc, payload = self.command_in_process(flow, order=['nanstdout', 'bbbbbbbb'])
        self.assertEqual(rc, 0, payload)
        self.assertEqual(self.starts(), ['serve-views', 'view', 'view'],
                         'a non-JSON stdout is a malformed answer; this and later runs use their own process')
        self.assertEqual(self.attempt_ids(payload), {'nanstdout': 'nanstdout-attempt', 'bbbbbbbb': 'bbbbbbbb-attempt'},
                         'the per-run result is used, not the server answer')

    def test_a_server_stdout_with_an_empty_object_falls_back_to_the_per_run_views(self):
        self.sampled_run('emptystdout')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        rc, payload = self.command_in_process(flow, order=['emptystdout', 'bbbbbbbb'])
        self.assertEqual(rc, 0, payload)
        self.assertEqual(self.starts(), ['serve-views', 'view', 'view'],
                         'a {} stdout is not a view; this and later runs use their own process')
        self.assertEqual(self.attempt_ids(payload), {'emptystdout': 'emptystdout-attempt', 'bbbbbbbb': 'bbbbbbbb-attempt'},
                         'the per-run result is used, not the server answer')

    def test_a_nonzero_exit_answer_uses_the_per_run_view_and_keeps_the_server(self):
        self.sampled_run('errshape')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        rc, payload = self.command_in_process(flow, order=['errshape', 'bbbbbbbb'])
        self.assertEqual(rc, 0, payload)
        self.assertEqual(self.starts(), ['serve-views', 'view'],
                         'only the nonzero-exit run goes to its own process; the server serves the next run')
        self.assertEqual(self.attempt_ids(payload), {'errshape': 'errshape-attempt', 'bbbbbbbb': 'bbbbbbbb-attempt'},
                         'the per-run result decides, and the error envelope is not propagated')

    def test_a_server_answer_for_another_run_falls_back_to_the_per_run_views(self):
        self.sampled_run('wrongrun')
        self.sampled_run('bbbbbbbb')
        flow = load_flow_script()
        rc, payload = self.command_in_process(flow, order=['wrongrun', 'bbbbbbbb'])
        self.assertEqual(rc, 0, payload)
        self.assertEqual(self.starts(), ['serve-views', 'view', 'view'],
                         'a view for another run is malformed; this and later runs use their own process')
        self.assertEqual(self.attempt_ids(payload), {'wrongrun': 'wrongrun-attempt', 'bbbbbbbb': 'bbbbbbbb-attempt'},
                         'the per-run result is used, not the server answer')

    def test_an_unresponsive_server_falls_back_after_the_answer_wait_bound(self):
        self.sampled_run('aaaaaaaa')
        self.sampled_run('hang')
        flow = load_flow_script()
        order = ['hang', 'aaaaaaaa']  # the hung run first, so a later run must also use its own process
        with mock.patch.object(flow, 'SAMPLING_VIEW_ANSWER_TIMEOUT', 0.2):
            hung = self.command_in_process(flow, order=order, raw=True)
        self.assertEqual(self.starts(), ['serve-views', 'view', 'view'],
                         'a server that stops answering is closed after the bound, then every run uses its own process')
        self.assertEqual(self.marker.with_name(self.marker.name + '.serverstate').read_text().split(), ['gone', 'gone'],
                         'the hung server process has ended before each per-run view starts')
        self.marker.unlink()
        per_run = mock.patch.object(flow.SamplingViewServer, 'view', lambda server, run: flow.review_sampling_script(
            server.repo, server.config, 'view', run))
        with per_run:
            old = self.command_in_process(flow, order=order, raw=True)
        self.assertEqual(hung, old, 'same exit code and the same stdout bytes as the per-run path')

    def test_gate_hash_reads_the_evidence_again(self):
        flow = load_flow_script()
        self.assertFalse(hasattr(flow, '_GATE_HASH_MEMO'))
        run = self.make_run()
        evidence = run / 'evidence.txt'
        evidence.write_text('one', encoding='utf8')
        first = flow.gate_hash(run, 'evidence.txt')
        evidence.write_text('two', encoding='utf8')
        self.assertNotEqual(first, flow.gate_hash(run, 'evidence.txt'))


class CaptureSpecReviewTests(FlowTest):
    """Read-only review of the actual saved spec member and its independent digests."""

    def test_capture_specs_returns_the_exact_saved_member_and_digests(self):
        run = self.make_run(request=selected_request_payload())
        before = sha_folder(run)
        rc, payload, stderr = self.command('capture-specs', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['format'], 'capture-specs-view-v1')
        self.assertEqual(payload['runId'], RUN_ID)
        self.assertEqual(payload['specDigestBasis'], 'request-member-utf8')
        self.assertTrue(payload['inputsMatch'])
        self.assertIsNone(payload['errorCode'])
        raw = (run / 'request.json').read_bytes()
        text = raw.decode('utf-8')
        self.assertIn(payload['captureSpecJson'], text, 'the review returns the retained member text verbatim')
        self.assertEqual(payload['requestSha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(payload['specSha256'], hashlib.sha256(payload['captureSpecJson'].encode('utf-8')).hexdigest())
        self.assertEqual(json.loads(payload['captureSpecJson']), payload['captureSpec'])
        self.assertEqual(payload['captureSpec'], selected_request_payload()['captureSpec'])
        checks = {check['id']: check for check in payload['checks']}
        self.assertEqual(len(checks), len(CAPTURE_CHECK_IDS) + 1)
        for identifier in (*CAPTURE_CHECK_IDS, 'capture_spec_request_identity'):
            self.assertEqual(set(checks[identifier]), {'id', 'ok', 'got', 'errorCode'}, identifier)
            self.assertTrue(checks[identifier]['ok'], (identifier, checks[identifier]))
            self.assertIs(checks[identifier]['got'], True, identifier)
        self.assertEqual(sha_folder(run), before, 'review performs no write')

    def test_capture_specs_names_the_failing_check_without_rebuilding_the_spec(self):
        request = selected_request_payload()
        request['metricInput']['preset']['smartQuery'] = False
        self.make_run(request=request)
        rc, payload, stderr = self.command('capture-specs', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertFalse(payload['inputsMatch'])
        self.assertEqual(payload['errorCode'], 'CAPTURE_SMART_QUERY_MISMATCH')
        self.assertEqual([check['id'] for check in payload['checks'] if not check['ok']],
                         ['capture_spec_smart_query'])
        self.assertEqual(payload['captureSpec'], request['captureSpec'])

    def test_capture_specs_request_identity_is_independent_of_the_spec_digest(self):
        run = self.make_run(request=selected_request_payload())
        write_json(run / 'run-tracking.json', {
            'format': 'run-tracking-v1', 'runId': RUN_ID, 'requestSha256': '0' * 64,
            'primaryKeyword': 'kem chống nắng', 'createdAt': None, 'firstRunAt': None,
            'firstObservedLaunchAt': None, 'historyBasis': 'new-run',
        })
        rc, payload, stderr = self.command('capture-specs', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        checks = {check['id']: check for check in payload['checks']}
        self.assertFalse(checks['capture_spec_request_identity']['ok'])
        self.assertEqual(checks['capture_spec_request_identity']['errorCode'], 'RUN_TRACKING_CHANGED')
        self.assertTrue(all(check['ok'] for identifier, check in checks.items()
                            if identifier != 'capture_spec_request_identity'))
        self.assertFalse(payload['inputsMatch'])
        self.assertEqual(payload['errorCode'], 'RUN_TRACKING_CHANGED')
        self.assertEqual(payload['requestSha256'],
                         hashlib.sha256((run / 'request.json').read_bytes()).hexdigest())

    def test_capture_specs_missing_request_is_an_error_not_a_reconstruction(self):
        run = self.make_run()
        (run / 'request.json').unlink()
        rc, payload, stderr = self.command('capture-specs', '--run', RUN_ID)
        self.assertEqual(rc, 2, (payload, stderr))
        self.assertEqual(payload, {'format': 'error-v1', 'code': 'FLOW_INPUT_INVALID',
                                   'message': 'Invalid or unreadable flow input.'})


class SelectedWindowFlowTests(FlowTest):
    """Flow admission and dispatch for one saved selected Metric window."""

    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(FAKE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)

    def env(self, extra=None):
        env = super().env(extra)
        env['TDN_WORKSPACE_DB'] = str(pathlib.Path(self._tmp.name) / 'app.db')
        return env

    def test_m1_dispatches_only_the_saved_selected_window(self):
        self.make_run(request=selected_request_payload())
        rc, entry, stderr = self.command('gate', 'entry', '--run', RUN_ID)
        self.assertEqual(rc, 0, (entry, stderr))
        self.assertEqual(entry['verdict'], 'PASS', entry)
        rc, payload, stderr = self.command('m1', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['verdict'], 'PASS', payload)
        run = self.runs / RUN_ID
        self.assertEqual(json.loads((run / 'capture-spec.json').read_text()), selected_spec())
        self.assertTrue((run / 'm1' / 'selected' / 'manifest.json').is_file())
        for legacy in ('30d', '12m', 'run1'):
            self.assertFalse((run / 'm1' / legacy).exists(), legacy)

    def test_changed_confirmation_blocks_a_fresh_m1_despite_a_matching_entry_pass(self):
        self.make_run(request=selected_request_payload())
        request = json.loads((self.runs / RUN_ID / 'request.json').read_text())
        request['metricInput']['preset']['smartQuery'] = False
        write_json(self.runs / RUN_ID / 'request.json', request)
        # A stored PASS whose hash matches the current request still cannot authorize
        # drifted confirmed inputs; only a fresh capture check can.
        digest = hashlib.sha256((self.runs / RUN_ID / 'request.json').read_bytes()).hexdigest()
        write_json(self.runs / RUN_ID / 'gates' / 'entry.json', {
            'format': 'handoff-v1', 'module': 'ENTRY', 'runId': RUN_ID, 'skillVersion': '1.0.0',
            'verdict': 'PASS', 'inputSha256': None, 'outputSha256': digest, 'checks': [],
            'errorCode': None, 'next': 'M1'})
        rc, payload, stderr = self.command('m1', '--run', RUN_ID)
        self.assertEqual(rc, 20, (payload, stderr))
        self.assertEqual(payload['errorCode'], 'CAPTURE_SMART_QUERY_MISMATCH', payload)
        self.assertFalse((self.runs / RUN_ID / 'm1').exists(), 'no capture executor may start for drifted inputs')
        self.assertFalse((self.runs / RUN_ID / 'capture-spec.json').exists())


class SecondStepTwoTests(FlowTest):
    """K2 (owner decision 13/11/2026): only a passed v2 step 2 refuses a new start; the fake pick script shows a start."""

    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(FAKE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)

    def m1_passed(self, policy):
        request = selected_request_payload()
        if policy:
            request['selectionPolicy'] = policy
        run = self.make_run(request=request)
        write_json(run / 'm1' / 'selected' / 'raw-responses.json', {'rows': []})
        write_json(run / 'gates' / 'm1.json', {
            'format': 'handoff-v1', 'module': 'M1', 'runId': RUN_ID, 'skillVersion': '1.0.0', 'verdict': 'PASS',
            'inputSha256': None, 'outputSha256': sha_folder(run / 'm1'), 'checks': [], 'errorCode': None, 'next': 'M2'})
        return run

    def m2_slip(self, run, verdict):
        write_json(run / 'm2' / 'selection.json', {'synthetic': 'earlier result'})
        write_json(run / 'gates' / 'm2.json', {
            'format': 'handoff-v1', 'module': 'M2', 'runId': RUN_ID, 'skillVersion': '1.0.0', 'verdict': verdict,
            'inputSha256': sha_folder(run / 'm1'), 'outputSha256': hashlib.sha256((run / 'm2' / 'selection.json').read_bytes()).hexdigest(),
            'checks': [], 'errorCode': None if verdict == 'PASS' else 'PICK_JEV_UNAVAILABLE',
            'next': 'M3' if verdict == 'PASS' else None})

    def assert_started(self, run):
        rc, payload, stderr = self.command('m2', '--run', RUN_ID)
        self.assertNotEqual(payload.get('errorCode'), 'M2_ALREADY_PASSED', (payload, stderr))
        self.assertIn('executionId', payload, payload)
        selection = json.loads((run / 'm2' / 'selection.json').read_text())
        self.assertEqual(selection.get('format'), 'selection-v1', 'the step-2 script ran and wrote its result')

    def test_v2_step_two_runs_again_when_it_failed_or_has_no_result(self):
        run = self.m1_passed('metric-products-unique-v2')
        self.assert_started(run)
        self.m2_slip(run, 'FAIL')
        self.assert_started(run)

    def test_v1_and_legacy_runs_still_run_step_two_after_it_passed(self):
        for policy in ('metric-products-unique-v1', None):
            with self.subTest(policy=policy):
                run = self.m1_passed(policy)
                self.m2_slip(run, 'PASS')
                self.assert_started(run)
                shutil.rmtree(run)


class ConnectionTests(FlowTest):
    def test_connection_reports_guard_state_and_changes_no_file(self):
        guard = self.state / 'shopee-flow' / 'READONLY'
        env = self.env()
        env['HOME'] = self._tmp.name

        def connection():
            proc = subprocess.run([sys.executable, str(SCRIPT), 'connection'], capture_output=True,
                                  text=True, env=env, timeout=90)
            return proc.returncode, json.loads(proc.stdout), proc.stderr

        before = sha_folder(self.runs), sha_folder(self.state)
        rc, payload, stderr = connection()
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'connection-v1', payload)
        self.assertIs(payload.get('readonly'), False)
        self.assertEqual(payload.get('runsRoot'), '~/runs')
        self.assertEqual((sha_folder(self.runs), sha_folder(self.state)), before)

        guard.parent.mkdir(parents=True)
        guard.write_text('on', encoding='utf8')
        before = sha_folder(self.runs), sha_folder(self.state)
        rc, payload, stderr = connection()
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'connection-v1', payload)
        self.assertIs(payload.get('readonly'), True)
        self.assertEqual((sha_folder(self.runs), sha_folder(self.state)), before)
        self.assert_no_subprocess()

    def test_app_latest(self):
        """| ~/.local/state/tdn-shopee-modules/app-latest.json        | app-latest prints                        |
        |-----------------------------------------------------------|------------------------------------------|
        | missing                                                   | {"format":"app-latest-v1","version":null}|
        | {"version":"1.10.0"} (READONLY on too)                    | that version, exit 0                     |
        | bad JSON / "1.0" / "01.0.0" / an extra key / over 4 KB    | FLOW_INPUT_INVALID, exit 2               |
        """
        env = self.env()
        env['HOME'] = env['USERPROFILE'] = self._tmp.name
        latest = pathlib.Path(self._tmp.name) / '.local/state/tdn-shopee-modules/app-latest.json'

        def app_latest():
            proc = subprocess.run([sys.executable, str(SCRIPT), 'app-latest'], capture_output=True,
                                  text=True, env=env, timeout=90)
            return proc.returncode, json.loads(proc.stdout)

        latest.unlink(missing_ok=True)
        self.assertEqual(app_latest(), (0, {'format': 'app-latest-v1', 'version': None}))
        latest.parent.mkdir(parents=True, exist_ok=True)
        latest.write_text('{"version":"1.10.0"}', encoding='utf8')
        guard = self.state / 'shopee-flow' / 'READONLY'
        guard.parent.mkdir(parents=True, exist_ok=True)
        guard.write_text('on', encoding='utf8')
        self.assertEqual(app_latest(), (0, {'format': 'app-latest-v1', 'version': '1.10.0'}))
        for text in ('{"version":', '{"version":"1.0"}', '{"version":"01.0.0"}', '{"version":"1.0.0","x":1}',
                     '{"version":"1.0.0"}' + ' ' * 4096):
            with self.subTest(text[:30]):
                latest.write_text(text, encoding='utf8')
                rc, payload = app_latest()
                self.assertEqual((rc, payload.get('code')), (2, 'FLOW_INPUT_INVALID'))
        self.assert_no_subprocess()


class RunTests(FlowTest):
    def test_run_stops_at_entry_and_does_not_call_m1(self):
        self.make_run(request=request_payload(keywords=[]))
        rc, payload, stderr = self.command('run', '--run', RUN_ID)
        self.assertEqual(rc, 20, (payload, stderr))
        self.assertEqual(payload.get('format'), 'run-result-v1', payload)
        self.assertEqual(payload['runId'], RUN_ID)
        self.assertEqual(payload['stoppedAt'], 'entry')
        self.assertNotEqual(payload['status'], 'DONE')
        self.assertFalse((self.runs / RUN_ID / 'm1').exists())
        self.assert_no_subprocess()

    def test_second_start_while_running_is_busy(self):
        self.make_run(state={'format': 'state-v1', 'runId': RUN_ID, 'status': 'RUNNING', 'mode': 'flow',
                             'module': 'M1', 'pid': os.getpid(), 'startedAt': '2026-11-10T01:00:00Z',
                             'endedAt': None, 'errorCode': None, 'failedCheck': None})
        rc, payload, stderr = self.command('run', '--run', RUN_ID)
        self.assertEqual(rc, 24, (payload, stderr))
        self.assertEqual(payload.get('code') or payload.get('errorCode'), 'RUN_BUSY', payload)
        self.assert_no_subprocess()
        state = json.loads((self.runs / RUN_ID / 'state.json').read_text())
        self.assertEqual(state['status'], 'RUNNING')

    def test_dead_pid_marks_interrupted_and_continues(self):
        self.make_run(request=request_payload(keywords=[]),
                      state={'format': 'state-v1', 'runId': RUN_ID, 'status': 'RUNNING', 'mode': 'flow',
                             'module': 'M1', 'pid': self.dead_pid, 'startedAt': '2026-11-10T01:00:00Z',
                             'endedAt': None, 'errorCode': None, 'failedCheck': None})
        rc, payload, stderr = self.command('m1', '--run', RUN_ID)
        self.assertEqual(rc, 22, (payload, stderr))
        self.assertEqual(payload.get('errorCode'), 'GATE_NOT_PASSED', payload)
        state = json.loads((self.runs / RUN_ID / 'state.json').read_text())
        self.assertEqual(state['status'], 'STOPPED')
        self.assertEqual(state['errorCode'], 'RUN_INTERRUPTED')
        self.assertFalse((self.runs / RUN_ID / 'm1').exists())
        self.assert_no_subprocess()


FAKE_NODE = '''#!/usr/bin/env python3
import hashlib, json, os, pathlib, sys, time

args = sys.argv[1:]
script = next(a for a in args if a.endswith('.ts'))
index = args.index(script)
LINKS = [('11111111111', '222222222'), ('33333333333', '444444444')]


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf8')


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha_folder(folder):
    names = sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file())
    text = ''.join(f'{name}\\t{sha_file(folder / name)}\\n' for name in names)
    return hashlib.sha256(text.encode('utf8')).hexdigest()


def review_row(review_id, item, shop, row):
    return {
        'reviewId': review_id, 'shopId': shop, 'itemId': item,
        'postedAtLocal': '2026-11-01 10:00', 'createdAt': '2026-11-01T10:00:00+07:00',
        'variation': None, 'ratingStar': 5, 'ratingState': 'VALID',
        'comment': 'Synthetic review text for tests.', 'attributes': [], 'contentType': 'COMMENT',
        'sourcePage': 1, 'sourceUrl': f'https://shopee.vn/product/{shop}/{item}',
        'sourceRow': row, 'admissionReasons': [],
    }


if script.endswith('capture-metric-preset.ts'):
    out = pathlib.Path(args[index + 2])
    request = json.loads((out.parent / 'request.json').read_text())
    refs = []
    for window in request['windows']:
        wid = window['id']
        write(out / wid / 'manifest.json', {'contractVersion': 'metric-v3-window-capture-v2',
                                            'captureGate': 'PASSED',
                                            'window': {'id': wid, 'period': window['period']}})
        write(out / wid / 'raw-responses.json',
              {'rows': [{'product_base_id': f'1__{item}__{shop}'} for item, shop in LINKS]})
        refs.append({'window': wid, 'path': f'{wid}/manifest.json',
                     'sha256': sha_file(out / wid / 'manifest.json')})
    write(out / 'manifest.json', {'contractVersion': 'metric-v3-capture-v1', 'windows': refs})
elif script.endswith('module-pick.ts'):
    if os.environ.get('PICK_DELAY_MS'):
        time.sleep(int(os.environ['PICK_DELAY_MS']) / 1000)
    run = pathlib.Path(args[index + 1])
    repo = pathlib.Path(script).resolve().parents[1]
    config = json.loads((repo / 'skills/tdn-shopee-flow/modules.json').read_text())
    rule = next(m['ruleVersion'] for m in config['modules'] if m['id'] == 'M2')
    write(run / 'm2' / 'selection.json', {
        'format': 'selection-v1', 'runId': run.name, 'source': 'auto', 'pickRuleVersion': rule,
        'metricInputSha256': sha_folder(run / 'm1'),
        'links': [{'rank': i + 1, 'productBaseId': f'1__{item}__{shop}', 'shopId': shop, 'itemId': item,
                   'url': f'https://shopee.vn/product/{shop}/{item}', 'brand': 'Synthetic brand',
                   'revenue': 1000 * (i + 1),
                   'reason': f'Hạng {i + 1}, doanh thu kỳ {1000 * (i + 1)}, thương hiệu Synthetic brand'}
                  for i, (item, shop) in enumerate(LINKS)],
        'counts': {'walked': 9, 'deleted': 0, 'notIncluded': 3, 'tokenGuardRejected': 0, 'eligible': 6,
                   'picked': len(LINKS), 'maskedRows': 0, 'maskedAboveLowestPick': 0},
    })
elif script.endswith('module-collect-public.ts'):
    pathlib.Path(os.environ['LEGACY_MARKER']).touch()
    run = pathlib.Path(args[index + 1])
    rows = [review_row(f'rv-1-{i}', *LINKS[0], i) for i in range(5)]
    rows += [review_row(f'rv-2-{i}', *LINKS[1], i) for i in range(2)]
    write(run / 'm3' / 'reviews.json', rows)
    write(run / 'm3' / 'outcome.json',
          {'format': 'm3-outcome-v1', 'verdict': 'PARTIAL_LISTINGS', 'errorCode': None})
elif script.endswith(('module-review-sampling.ts', 'module-review-data.ts')) and os.environ.get('REAL_TS_SAMPLING') == '1':
    real = os.environ['TDN_REAL_NODE']
    os.execv(real, [real, *sys.argv[1:]])
elif script.endswith('module-review-sampling.ts'):
    if args[index + 1] != 'idle':
        raise SystemExit('unexpected sampling action')
    print(json.dumps({'format': 'review-idle-v1'}))
else:
    raise SystemExit('unexpected module script')
'''


class PartialOutcomeFlowTests(FlowTest):
    """S13/S14: M3 with PARTIAL_LISTINGS and at least one row per link lets the flow reach DONE."""

    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(FAKE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)

    def env(self, extra=None):
        env = super().env(extra)
        env['TDN_WORKSPACE_DB'] = str(pathlib.Path(self._tmp.name) / 'app.db')
        return env

    def test_flow_ends_done_when_m3_keeps_partial_rows(self):
        self.make_run(request=request_payload(cap=5))
        rc, payload, stderr = self.command('run', '--run', RUN_ID)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'run-result-v1', payload)
        self.assertEqual(payload['status'], 'DONE', payload)
        self.assertIsNone(payload['stoppedAt'], payload)
        state = json.loads((self.runs / RUN_ID / 'state.json').read_text())
        self.assertEqual(state['status'], 'DONE')
        slip = json.loads((self.runs / RUN_ID / 'gates' / 'm3.json').read_text())
        self.assertEqual(slip['verdict'], 'PASS', slip)
        self.assertEqual(slip['module'], 'M3')
        checks = {c['id']: c for c in slip['checks']}
        self.assertTrue(checks['verdict_ok']['ok'])
        self.assertEqual(checks['verdict_ok']['got'], 'PARTIAL_LISTINGS')
        self.assertTrue(checks['min_reviews_per_link']['ok'])
        self.assertEqual(checks['links_below_cap']['got'], {'belowCap': 1, 'cap': 5})
        self.assertEqual(checks['links_below_cap']['level'], 'warn')
        rows = json.loads((self.runs / RUN_ID / 'm3' / 'reviews.json').read_text())
        self.assertEqual(len(rows), 7)


USER_PAGE_NODE = '''#!/usr/bin/env python3
"""Fake TS boundary for a user-page run: M2 pick, M3 attempt, step 4."""
import hashlib, json, os, pathlib, sys, uuid

args = sys.argv[1:]
script_path = pathlib.Path(next(a for a in args if a.endswith('.ts')))
script = script_path.name
index = args.index(str(script_path))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf8')


if script == 'capture-metric-preset.ts':
    raise SystemExit('M1 must not run for a user-page run')
if script == 'module-metric-output.ts':
    action = args[index + 1]
    if action == 'verify-capture':
        print(json.dumps({'valid': True}))
    elif action == 'verify-selection':
        print(json.dumps({'linksMatchSourceOrder': True, 'requestedDistinct': True, 'requested': 5,
                          'fiveDistinct': True, 'selectedCount': 5}))
    else:
        raise SystemExit('unexpected metric action')
elif script == 'module-pick.ts':
    run = pathlib.Path(args[index + 1])
    config = json.loads((script_path.parents[1] / 'skills/tdn-shopee-flow/modules.json').read_text())
    rule = next(m['ruleVersion'] for m in config['modules'] if m['id'] == 'M2')
    raw = json.loads((run / 'm1/selected/raw-responses.json').read_text())
    links = []
    for rank, product in enumerate(raw[0]['body']['data']['products'][:5], 1):
        _, item, shop = product['product_base_id'].split('__')
        links.append({'rank': rank, 'productBaseId': product['product_base_id'], 'shopId': shop, 'itemId': item,
                      'url': f'https://shopee.vn/product/{shop}/{item}', 'brand': 'Synthetic brand',
                      'revenue': 1000 - rank, 'reason': f'Hạng {rank}'})
    write(run / 'm2' / 'selection.json', {
        'format': 'selection-v1', 'runId': run.name, 'source': 'auto', 'pickRuleVersion': rule,
        'metricInputSha256': json.loads((run / 'gates' / 'm1.json').read_text())['outputSha256'],
        'links': links, 'counts': {'walked': 5, 'deleted': 0, 'notIncluded': 0, 'tokenGuardRejected': 0,
                                   'eligible': 5, 'picked': 5, 'maskedRows': 0, 'maskedAboveLowestPick': 0}})
    pathlib.Path(os.environ['USER_PAGE_PICK_MARKER']).touch()
elif script == 'module-review-sampling.ts':
    action, run = args[index + 1], pathlib.Path(args[index + 2])
    if action == 'idle':
        print(json.dumps({'format': 'review-idle-v1'}))
    elif action == 'configured-reserve':
        attempt = str(uuid.uuid4())
        write(run / 'm3-custom' / 'attempts' / attempt / 'attempt.json',
              {'format': 'shopee-review-attempt-v1', 'runId': run.name, 'attemptId': attempt, 'kind': 'automatic'})
        sha = lambda rel: hashlib.sha256((run / rel).read_bytes()).hexdigest()
        write(run / 'm3-custom' / 'automatic.json', {
            'format': 'shopee-automatic-review-binding-v1', 'runId': run.name,
            'requestSha256': sha('request.json'), 'm2Digest': sha('m2/selection.json'), 'attemptId': attempt})
        print(json.dumps({'format': 'review-attempt-reserve-v1', 'attemptId': attempt}))
    elif action == 'execute':
        attempt = args[index + 4]
        write(run / 'm3-custom' / 'attempts' / attempt / 'gate.json',
              {'format': 'handoff-v1', 'module': 'M3', 'runId': run.name, 'verdict': 'PASS', 'checks': [],
               'errorCode': None})
        write(run / 'm3-custom' / 'attempts' / attempt / 'state.json',
              {'format': 'shopee-review-attempt-state-v1', 'runId': run.name, 'status': 'SUCCEEDED',
               'errorCode': None})
        print(json.dumps({'format': 'review-attempt-result-v1', 'attemptId': attempt, 'status': 'SUCCEEDED',
                          'errorCode': None}))
    else:
        raise SystemExit('unexpected sampling action')
elif script == 'module-review-data.ts':
    run = pathlib.Path(args[index + 2])
    pathlib.Path(os.environ['USER_PAGE_STEP4_MARKER']).touch()
    print(json.dumps({'format': 'review-process-auto-result-v1', 'runId': run.name, 'status': 'DONE'}))
else:
    raise SystemExit('unexpected module script')
'''

USER_PAGE_IMPORT_ID = '3f6c2a1e-8b9d-4c1e-9f00-1234567890ab'


def user_page_payload(import_id=USER_PAGE_IMPORT_ID):
    scope = {'start_date': '20261014', 'end_date': '20261112',
             'include_query': {'queries': ['synthetic term']}, 'platforms': [1, 2]}
    products = [{'product_base_id': f'1__{7100 + i}__{71 + i}', 'product_name': f'Synthetic product {i + 1}',
                 'shop_base_id': str(71 + i), 'platform_id': 1, 'revenue_custom': 1000 - i * 10,
                 'brand': 'Synthetic Brand', 'final_brand': 'Synthetic Brand'} for i in range(5)]
    return {'format': 'metric-user-page-import-v1', 'importId': import_id, 'keyword': 'synthetic term',
            'capturedAt': '2026-11-17T15:00:00+07:00',
            'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 50, 'allocation': 'pooled'},
            'scope': scope,
            'response': {'urlPath': '/v2/market/analytics/products/', 'method': 'POST', 'status': 200,
                         'requestBody': {**scope, 'limit': 100, 'page': 0, 'sort_by': 'revenue_custom__desc'},
                         'body': {'status': 'success', 'code': 0, 'data': {'products': products}}}}


class UserPageRunTests(FlowTest):
    """A run created by m1-import: `run` continues M2 -> M3 -> step 4 and never starts M1."""

    def setUp(self):
        super().setUp()
        node = self.bin / 'node'
        node.write_text(USER_PAGE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        self.pick_marker = pathlib.Path(self._tmp.name) / 'pick-called'
        self.step4_marker = pathlib.Path(self._tmp.name) / 'step4-called'

    def env(self, extra=None):
        env = super().env(extra)
        env['USER_PAGE_PICK_MARKER'] = str(self.pick_marker)
        env['USER_PAGE_STEP4_MARKER'] = str(self.step4_marker)
        return env

    def imported(self, import_id=USER_PAGE_IMPORT_ID):
        rc, payload, stderr = self.command('m1-import', '--stdin', stdin=json.dumps(user_page_payload(import_id)))
        self.assertEqual(rc, 0, (payload, stderr))
        return payload['runId']

    def executions(self, run_id):
        folder = self.runs / run_id / 'executions'
        records = [json.loads(path.read_text()) for path in folder.glob('*.json')
                   if re.fullmatch(r'[a-f0-9-]{36}\.json', path.name)]
        return sorted(records, key=lambda record: record['sequence'])

    def test_run_starts_at_m3_when_the_import_run_already_passed_m2(self):
        run_id = self.imported('7a1b2c3d-0000-4000-8000-000000000003')
        rc, payload, stderr = self.command('m2', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        self.pick_marker.unlink()
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['status'], 'DONE')
        self.assertFalse(self.pick_marker.exists(), 'M2 was not re-run')
        self.assertEqual([record['module'] for record in self.executions(run_id)], ['M2', 'M3'])
        self.assertTrue(self.step4_marker.exists(), 'step 4 still runs after M3')

    def test_detached_run_continuation_starts_at_m2(self):
        run_id = self.imported('7a1b2c3d-0000-4000-8000-000000000002')
        run = self.runs / run_id
        rc, payload, stderr = self.command('run', '--run', run_id, '--detach')
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual((payload['format'], payload['runId']), ('detached-v1', run_id))
        state = json.loads((run / 'state.json').read_text())
        self.assertEqual((state['status'], state['mode'], state['module']), ('RUNNING', 'flow', 'M2'))
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and not self.step4_marker.exists():
            time.sleep(0.05)
        self.assertTrue(self.step4_marker.exists(), 'step 4 ran in the detached worker')
        state = json.loads((run / 'state.json').read_text())
        self.assertEqual(state['status'], 'DONE', state)
        self.assertEqual([record['module'] for record in self.executions(run_id)], ['M2', 'M3'])

    def test_run_continues_m2_then_m3_then_step4_and_never_starts_m1(self):
        run_id = self.imported()
        run = self.runs / run_id
        m1_bytes = (run / 'gates' / 'm1.json').read_bytes()
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual((payload['format'], payload['runId'], payload['status'], payload['stoppedAt'],
                          payload['errorCode'], payload['failedCheck']),
                         ('run-result-v1', run_id, 'DONE', None, None, None))
        self.assertEqual([record['module'] for record in self.executions(run_id)], ['M2', 'M3'])
        self.assertFalse((run / 'm1' / 'capture-spec.json').exists(), 'M1 was not re-run')
        self.assertEqual((run / 'gates' / 'm1.json').read_bytes(), m1_bytes, 'the import m1 gate is untouched')
        self.assertTrue(self.pick_marker.exists(), 'M2 ran')
        self.assertTrue(self.step4_marker.exists(), 'step 4 ran after M3')
        state = json.loads((run / 'state.json').read_text())
        self.assertEqual((state['status'], state['module'], state['mode']), ('DONE', 'M3', 'flow'))
        self.assertEqual(json.loads((run / 'gates' / 'm2.json').read_text())['verdict'], 'PASS')

    def test_pending_modules_are_selected_after_the_run_lock(self):
        """Another command finishes M2 while this run waits for the lock: the continuation must start at M3."""
        run_id = self.imported('7a1b2c3d-0000-4000-8000-000000000004')
        run = self.runs / run_id
        selection = {
            'format': 'selection-v1', 'runId': run_id, 'source': 'auto',
            'pickRuleVersion': next(m['ruleVersion'] for m in MODULES['modules'] if m['id'] == 'M2'),
            'metricInputSha256': None,
            'links': [{'rank': rank, 'productBaseId': f'1__{7200 + rank}__{72 + rank}',
                       'shopId': str(72 + rank), 'itemId': str(7200 + rank),
                       'url': f'https://shopee.vn/product/{72 + rank}/{7200 + rank}',
                       'brand': 'Synthetic Brand', 'revenue': 1000 - rank, 'reason': f'Hạng {rank}'}
                      for rank in range(1, 6)],
            'counts': {'walked': 5, 'deleted': 0, 'notIncluded': 0, 'tokenGuardRejected': 0,
                       'eligible': 5, 'picked': 5, 'maskedRows': 0, 'maskedAboveLowestPick': 0},
        }
        published, real_flock = [], fcntl.flock

        def finish_m2_then_lock(fd, operation):
            if not published:
                published.append(True)
                selection['metricInputSha256'] = sha_folder(run / 'm1')
                (run / 'm2').mkdir(mode=0o700, exist_ok=True)
                (run / 'm2' / 'selection.json').write_bytes(json.dumps(selection).encode('utf8'))
                write_json(run / 'gates' / 'm2.json', {
                    'format': 'handoff-v1', 'module': 'M2', 'runId': run_id, 'skillVersion': 'test',
                    'verdict': 'PASS', 'inputSha256': sha_folder(run / 'm1'),
                    'outputSha256': hashlib.sha256((run / 'm2' / 'selection.json').read_bytes()).hexdigest(),
                    'checks': [], 'errorCode': None, 'next': None})
            return real_flock(fd, operation)

        out = io.StringIO()
        with mock.patch.dict(os.environ, self.env(), clear=False):
            flow = load_flow_script()
            ns = types.SimpleNamespace(cmd='run', run_id=run_id, detach=False, manual=None, plan_sha256=None,
                                       worker_lock_fd=None, worker_ready_fd=None)
            with mock.patch('fcntl.flock', finish_m2_then_lock):
                try:
                    with contextlib.redirect_stdout(out):
                        flow.cmd_module(ns)
                except SystemExit as exited:
                    code = exited.code
        self.assertEqual(code, 0, out.getvalue())
        result = json.loads(out.getvalue())
        self.assertEqual((result['status'], result['errorCode']), ('DONE', None), result)
        self.assertFalse(self.pick_marker.exists(), 'the M2 that finished under the lock was not attempted again')
        self.assertEqual([record['module'] for record in self.executions(run_id)], ['M3'])
        self.assertTrue(self.step4_marker.exists(), 'the continuation reached step 4')

    def test_run_refuses_when_the_m1_gate_is_not_pass_and_executes_nothing(self):
        for import_id, break_gate in ((USER_PAGE_IMPORT_ID, 'unlink'),
                                      ('7a1b2c3d-0000-4000-8000-000000000001', 'fail')):
            with self.subTest(m1=break_gate):
                run_id = self.imported(import_id)
                run = self.runs / run_id
                if break_gate == 'unlink':
                    (run / 'gates' / 'm1.json').unlink()
                else:
                    slip = json.loads((run / 'gates' / 'm1.json').read_text())
                    write_json(run / 'gates' / 'm1.json', {**slip, 'verdict': 'FAIL'})
                rc, payload, stderr = self.command('run', '--run', run_id)
                self.assertEqual(rc, 22, (payload, stderr))
                self.assertEqual(payload['stoppedAt'], 'entry')
                self.assertEqual(payload['errorCode'], 'GATE_NOT_PASSED')
                self.assertEqual(self.executions(run_id), [], 'nothing was admitted')
                self.assertFalse((run / 'm2' / 'selection.json').exists(), 'M2 did not run')
                self.assertFalse(self.pick_marker.exists(), 'no module subprocess started')

    def test_run_after_m3_was_collected_refuses_with_the_existing_error(self):
        run_id = self.imported('7a1b2c3d-0000-4000-8000-000000000005')
        run = self.runs / run_id
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        binding = run / 'm3-custom' / 'automatic.json'
        binding_bytes = binding.read_bytes()
        attempts = sorted((run / 'm3-custom' / 'attempts').iterdir())
        self.step4_marker.unlink()

        rc, payload, stderr = self.command('run', '--run', run_id)

        self.assertEqual(rc, 20, (payload, stderr))
        self.assertEqual((payload['status'], payload['stoppedAt'], payload['errorCode']),
                         ('STOPPED', 'm3', 'AUTOMATIC_COLLECTION_EXISTS'))
        self.assertEqual([record['module'] for record in self.executions(run_id)], ['M2', 'M3'],
                         'no new execution was admitted')
        self.assertEqual(binding.read_bytes(), binding_bytes, 'the automatic binding is unchanged')
        self.assertEqual(sorted((run / 'm3-custom' / 'attempts').iterdir()), attempts,
                         'M3 was not collected again')
        self.assertFalse((run / 'gates' / 'm3.json').exists(), 'no new M3 receipt was written')
        self.assertFalse(self.step4_marker.exists(), 'step 4 did not start again')


class _SamplingState:
    """A local collector transport serving synthetic, schema-valid sample results."""

    def __init__(self):
        self.jobs = {}
        self.mode = 'ok'
        self.delay = 0.0
        self.lock = threading.Lock()

    def now(self):
        return dt.datetime.now(dt.timezone.utc).isoformat()

    def job(self, body):
        job_id = str(uuid.uuid4())
        at = self.now()
        value = {'id': job_id, 'request': body, 'state': 'succeeded', 'created_at': at,
                 'updated_at': at, 'result_available': True, 'collected': 2}
        with self.lock:
            self.jobs[job_id] = value
        return value

    def result(self, job):
        request = job['request']
        policy = request['sampling']['policy']
        record = []
        pages, groups = [], []
        for star in policy['stars']:
            review_id = 'r-' + job['id'][:8] + '-' + str(star)
            record.append({
                'review_id': review_id, 'author': 'Tổng hợp', 'posted_at_local': '2026-11-01 09:00',
                'variation': '', 'stars': star, 'comment': 'Sản phẩm tổng hợp dùng tốt.',
                'attributes': ['Màu: đen'], 'content_type': 'comment',
                'review_text': 'Sản phẩm tổng hợp dùng tốt.',
                'source_filter': str(star), 'source_url': request['url'], 'page': 1,
            })
            pages.append({'filter': str(star), 'page': 1, 'cards': 1, 'collected': 1, 'ids': [review_id]})
            groups.append({'filter': str(star), 'stopReason': 'exhausted'})
        observed = self.now()
        counts = {'stars': {str(star): {'status': 'observed', 'value': star * 3} for star in range(1, 6)},
                  'withComments': {'status': 'observed', 'value': 5}}
        return {'job_id': job['id'], 'product_url': request['url'], 'complete': True,
                'sampling': request['sampling'], 'observed_at': observed,
                'source_counts_observed_at': observed, 'records': record, 'pages': pages,
                'groups': groups, 'source_counts': counts, 'stop_reason': 'exhausted'}


class _SamplingHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def send(self, status, value):
        body = json.dumps(value).encode('utf8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        state = self.server.sampling
        now = state.now()
        if self.path == '/session':
            return self.send(200, {'state': 'ready', 'authenticated': True, 'checked_at': now})
        if self.path == '/jobs?limit=100':
            return self.send(200, list(state.jobs.values()))
        found = re.fullmatch(r'/jobs/([0-9a-f-]+)', self.path)
        if found:
            job = state.jobs.get(found.group(1))
            return self.send(200, job) if job else self.send(404, {})
        found = re.fullmatch(r'/jobs/([0-9a-f-]+)/result', self.path)
        if found:
            job = state.jobs.get(found.group(1))
            return self.send(200, state.result(job)) if job else self.send(404, {})
        return self.send(404, {})

    def do_POST(self):
        state = self.server.sampling
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) or b'{}')
        if self.path != '/jobs':
            return self.send(404, {})
        if state.delay:
            time.sleep(state.delay)
        if state.mode == 'fail' or state.mode == 'fail-after-one' and state.jobs:
            return self.send(400, {'error': 'synthetic upstream refusal'})
        return self.send(202, state.job(body))


class _SamplingTransport:
    """Serves the fixed collector port on IPv4 or IPv6 loopback; the provider accepts both."""

    def __init__(self, port=8877, host='127.0.0.1'):
        self.sampling = _SamplingState()
        server_class = type('_SamplingServer', (http.server.ThreadingHTTPServer,),
                            {'address_family': socket.AF_INET6 if ':' in host else socket.AF_INET})
        self.server = server_class((host, port), _SamplingHandler)
        self.server.sampling = self.sampling
        self.port = self.server.server_address[1]
        self.url = f'http://{f"[{host}]" if ":" in host else host}:{self.port}'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class ConfiguredFlowTests(FlowTest):
    """The real orchestrator: request-v2 -> synthetic M2 -> real TS plan/binding/attempt."""

    def setUp(self):
        super().setUp()
        self.real_node = shutil.which('node')
        if not self.real_node or not (ROOT / 'node_modules' / 'tsx').is_dir():
            self.skipTest('real node with tsx is unavailable for the TS sampling boundary')
        node = self.bin / 'node'
        node.write_text(FAKE_NODE, encoding='utf8')
        node.chmod(node.stat().st_mode | stat.S_IXUSR)
        try:
            self.transport = _SamplingTransport()
        except OSError:
            self.skipTest('127.0.0.1:8877 is unavailable for the local collector transport')
        self.addCleanup(self.transport.close)

    def env(self, extra=None):
        env = super().env(extra)
        env['TDN_WORKSPACE_DB'] = str(pathlib.Path(self._tmp.name) / 'app.db')
        env['TDN_REAL_NODE'] = self.real_node
        env['REAL_TS_SAMPLING'] = '1'
        env['TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED'] = '1'
        env['TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN'] = 'synthetic-token'
        env['TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL'] = 'http://127.0.0.1:8877'
        return env

    def create(self, total=500, stars=(3, 2)):
        self.write_preset()
        rc, payload, stderr = self.command('new-run', '--stdin', stdin=json.dumps({
            'presetId': 'kem', 'endDate': END,
            'collectionPolicy': {'mode': 'stars', 'stars': list(stars), 'totalPerLink': total,
                                 'allocation': 'pooled'}}))
        self.assertEqual(rc, 0, (payload, stderr))
        return payload['runId']

    def info(self, run_id):
        rc, payload, stderr = self.command('run-info', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        return payload

    def attempts(self, run_id):
        folder = self.runs / run_id / 'm3-custom' / 'attempts'
        return sorted(folder.iterdir()) if folder.is_dir() else []

    def spawn(self, *args):
        return subprocess.Popen([sys.executable, str(SCRIPT), *args], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, env=self.env())

    def test_configured_flow_reserves_and_executes_one_real_custom_attempt(self):
        run_id = self.create()
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload['status'], 'DONE', payload)
        self.assertFalse(self.legacy_marker.exists(), 'the legacy collector is never dispatched for request-v2')

        attempts = self.attempts(run_id)
        self.assertEqual(len(attempts), 1)
        attempt_id = attempts[0].name
        binding = json.loads((self.runs / run_id / 'm3-custom' / 'automatic.json').read_text())
        metadata = json.loads((attempts[0] / 'attempt.json').read_text())
        self.assertEqual(binding['attemptId'], attempt_id)
        self.assertEqual(metadata['executionId'], binding['executionId'])
        self.assertEqual(metadata['sequence'], binding['sequence'])
        self.assertGreaterEqual(metadata['sequence'], 1)
        self.assertEqual(metadata['planSha256'], binding['planSha256'])
        self.assertTrue((self.runs / run_id / 'm3-custom' / 'plans' / f"{binding['planSha256']}.json").is_file())
        self.assertEqual(len(metadata['links']), 2)

        slip = json.loads((attempts[0] / 'gate.json').read_text())
        self.assertEqual(slip['verdict'], 'PASS', slip)
        self.assertEqual(slip['inputSha256'], binding['planSha256'], slip)
        rows = json.loads((attempts[0] / 'output' / 'reviews.json').read_text())
        self.assertEqual(len(rows), 4, 'two links, two selected stars each')

        rc, data, stderr = self.command('review-data', '--run', run_id)
        self.assertEqual(rc, 0, (data, stderr))
        self.assertEqual(data['format'], 'review-data-view-v1', data)
        self.assertEqual(len(data['sources']), 1, data['sources'])
        source = data['sources'][0]
        self.assertEqual((source['kind'], source['attemptId'], source['planSha256']),
                         ('custom', attempt_id, binding['planSha256']), source)
        self.assertEqual((source['status'], source['gateVerdict']), ('SUCCEEDED', 'PASS'), source)
        self.assertEqual((source['rowCount'], source['rowBasis']), (4, 'published'), source)
        self.assertTrue(source['canExport'], source)

        rc, exported, stderr = self.command(
            'export-review-data', '--run', run_id, '--stdin',
            stdin=json.dumps({'sourceSha256': source['sourceSha256'], 'format': 'json'}))
        self.assertEqual(rc, 0, (exported, stderr))
        self.assertEqual((exported['sourceSha256'], exported['rowCount']),
                         (source['sourceSha256'], 4), exported)
        raw = subprocess.run([sys.executable, str(SCRIPT), 'read-review-export', '--run', run_id,
                              '--export-sha256', exported['exportSha256']],
                             capture_output=True, env=self.env(), timeout=120)
        self.assertEqual(raw.returncode, 0, raw.stderr)
        self.assertEqual(hashlib.sha256(raw.stdout).hexdigest(), exported['exportSha256'],
                         'the read bytes are the exported exact source')
        archive = json.loads(raw.stdout)
        self.assertEqual((archive['format'], archive['sourceSha256'], len(archive['rows'])),
                         ('module-review-archive-v1', source['sourceSha256'], 4), archive['format'])
        self.assertEqual([row['reviewId'] for row in archive['rows']],
                         [row['reviewId'] for row in rows], 'the export keeps the collected rows verbatim')

        rc, sampling, stderr = self.command('review-sampling', '--run', run_id)
        self.assertEqual(rc, 0, (sampling, stderr))
        marked = [a for a in sampling['attempts'] if a.get('automatic')]
        self.assertEqual([a['attemptId'] for a in marked], [attempt_id],
                         'the saved automatic binding is the only attempt marked automatic')

        info = self.info(run_id)
        view = info['execution']['modules']['M3']
        self.assertEqual(view['status'], 'SUCCEEDED')
        self.assertEqual(view['attemptId'], attempt_id)
        self.assertEqual(view['executionId'], binding['executionId'])
        self.assertEqual(view['sequence'], binding['sequence'])
        self.assertEqual(view['basis'], 'custom-attempt')
        self.assertEqual(view['currentGate']['verdict'], 'PASS')
        runs_item = self.command('runs')[1]['runs'][0]
        self.assertEqual(runs_item['execution']['modules']['M3']['attemptId'], attempt_id)

        binding_bytes = (self.runs / run_id / 'm3-custom' / 'automatic.json').read_bytes()
        rc, refused, stderr = self.command('m3', '--run', run_id)
        self.assertEqual(rc, 20, (refused, stderr))
        self.assertEqual(refused.get('code') or refused.get('errorCode'), 'AUTOMATIC_COLLECTION_EXISTS', refused)
        self.assertEqual(len(self.attempts(run_id)), 1)
        self.assertEqual((self.runs / run_id / 'm3-custom' / 'automatic.json').read_bytes(), binding_bytes)

    def test_second_launch_is_busy_while_m1_stays_passed_and_m2_runs(self):
        run_id = self.create()
        env = self.env()
        env['PICK_DELAY_MS'] = '1500'
        first = subprocess.Popen([sys.executable, str(SCRIPT), 'run', '--run', run_id],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        try:
            deadline = time.monotonic() + 30
            while True:
                modules = self.info(run_id)['modules']
                if next(m for m in modules if m['id'] == 'M2')['execution']['status'] == 'RUNNING':
                    break
                self.assertLess(time.monotonic(), deadline, 'M2 never reported RUNNING')
                time.sleep(0.05)
            m1 = next(m for m in self.info(run_id)['modules'] if m['id'] == 'M1')['execution']
            m2 = next(m for m in self.info(run_id)['modules'] if m['id'] == 'M2')['execution']
            self.assertEqual((m1['status'], m1['currentGate']['verdict']), ('SUCCEEDED', 'PASS'))
            self.assertEqual((m2['status'], m2['currentGate']), ('RUNNING', None))

            started = time.monotonic()
            rc, busy, stderr = self.command('run', '--run', run_id)
            self.assertEqual(rc, 24, (busy, stderr))
            self.assertEqual(busy.get('code') or busy.get('errorCode'), 'RUN_BUSY', busy)
            self.assertLess(time.monotonic() - started, 10, 'the second launch must not block on the first')
        finally:
            out, err = first.communicate(timeout=90)
        self.assertEqual(first.returncode, 0, (out, err))
        self.assertEqual(json.loads(out)['status'], 'DONE')

    def test_step3_rerun_after_a_failed_automatic_attempt_starts_fresh_only_when_it_saved_no_review(self):
        # Owner L4b: 0 saved reviews -> «chạy lại bước 3» binds a fresh automatic attempt for the same plan.
        run_id = self.create()
        self.transport.sampling.mode = 'fail'
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertNotEqual(rc, 0, (payload, stderr))
        binding = self.runs / run_id / 'm3-custom' / 'automatic.json'
        first = json.loads(binding.read_text())
        # A real step 3 failure (nothing passed before it) still shows FAIL.
        self.assertEqual(self.info(run_id)['execution']['modules']['M3']['status'], 'FAILED')
        steps = next(r for r in self.command('runs-progress')[1]['runs'] if r['runId'] == run_id)['steps']
        self.assertEqual(steps[2], 'FAIL', steps)
        self.transport.sampling.mode = 'ok'
        rc, payload, stderr = self.command('m3', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        second = json.loads(binding.read_text())
        self.assertNotEqual(second['attemptId'], first['attemptId'])
        self.assertEqual(second['planSha256'], first['planSha256'], 'the same plan')
        history = self.runs / run_id / 'm3-custom' / 'automatic-history' / f"{first['attemptId']}.json"
        self.assertEqual(json.loads(history.read_text()), first, 'the failed binding is kept as history')
        self.assertEqual(len(self.attempts(run_id)), 2)
        self.assertEqual(self.info(run_id)['execution']['modules']['M3']['status'], 'SUCCEEDED')

        # One saved review keeps today's block, so «Lượt này đã lấy bình luận rồi» stays true.
        run_id = self.create()
        self.transport.sampling.jobs.clear()
        self.transport.sampling.mode = 'fail-after-one'
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertNotEqual(rc, 0, (payload, stderr))
        binding = self.runs / run_id / 'm3-custom' / 'automatic.json'
        binding_bytes = binding.read_bytes()
        rows = [row for path in (self.attempts(run_id)[0] / 'journal').glob('*.json')
                for row in ((json.loads(path.read_text()).get('result') or {}).get('rows') or [])]
        self.assertGreaterEqual(len(rows), 1, 'the failed automatic attempt saved reviews')
        self.transport.sampling.mode = 'ok'
        rc, refused, stderr = self.command('m3', '--run', run_id)
        self.assertEqual(rc, 20, (refused, stderr))
        self.assertEqual(refused.get('code') or refused.get('errorCode'), 'AUTOMATIC_COLLECTION_EXISTS', refused)
        self.assertEqual(len(self.attempts(run_id)), 1)
        self.assertEqual(binding.read_bytes(), binding_bytes)

    def test_a_later_failed_extra_attempt_shows_only_in_the_attempt_list_while_step3_and_the_run_stay_passed(self):
        run_id = self.create()
        rc, payload, stderr = self.command('run', '--run', run_id)
        self.assertEqual(rc, 0, (payload, stderr))
        binding_bytes = (self.runs / run_id / 'm3-custom' / 'automatic.json').read_bytes()

        rc, saved, stderr = self.command('save-review-plan', '--run', run_id, '--stdin', stdin=json.dumps({
            'mode': 'all', 'stars': [], 'totalPerLink': 10, 'allocation': 'pooled'}))
        self.assertEqual(rc, 0, (saved, stderr))
        self.transport.sampling.mode = 'fail'
        self.transport.sampling.delay = 2.0
        worker = self.spawn('m3', '--run', run_id, '--plan-sha256', saved['planSha256'])
        try:
            deadline = time.monotonic() + 30
            while True:
                view = self.info(run_id)['execution']['modules']['M3']
                if view['status'] == 'RUNNING':
                    break
                self.assertLess(time.monotonic(), deadline, 'the explicit attempt never reported RUNNING')
                time.sleep(0.05)
            self.assertIsNone(view['currentGate'], 'a running explicit attempt replaces the old PASS')
            self.assertEqual(view['historicalGate']['verdict'], 'PASS')
        finally:
            out, err = worker.communicate(timeout=90)
        self.assertNotEqual(worker.returncode, 0, (out, err))
        # Owner L5: the failed extra attempt shows only in the attempt list; step 3, the run detail, the run list
        # and the status line keep the passed step 3 (no error code that the detail would show).
        automatic_id = json.loads(binding_bytes)['attemptId']
        view = self.info(run_id)['execution']['modules']['M3']
        self.assertEqual((view['status'], view['errorCode'], view['attemptId']), ('SUCCEEDED', None, automatic_id), view)
        self.assertEqual(view['currentGate']['verdict'], 'PASS')
        self.assertEqual(len(self.attempts(run_id)), 2, 'the failed extra attempt is a separate immutable attempt')
        self.assertEqual((self.runs / run_id / 'm3-custom' / 'automatic.json').read_bytes(), binding_bytes)
        run = self.command('runs')[1]['runs'][0]
        self.assertEqual((run['status'], run['execution']['status'], run['errorCode']), ('SUCCEEDED', 'SUCCEEDED', None), run['execution'])
        rc, progress, stderr = self.command('runs-progress')
        self.assertEqual(rc, 0, (progress, stderr))
        steps = next(r for r in progress['runs'] if r['runId'] == run_id)['steps']
        self.assertEqual(steps[:3], ['PASS', 'PASS', 'PASS'], steps)
        sampling = self.command('review-sampling', '--run', run_id)[1]
        by_id = {a['attemptId']: a for a in sampling['attempts']}
        self.assertIs(by_id[automatic_id].get('automatic'), True, 'the saved automatic binding stays marked automatic')
        extra = next(a for a in sampling['attempts'] if a['attemptId'] != automatic_id)
        self.assertEqual((extra['status'], extra.get('automatic')), ('FAILED', False), 'the attempt list shows the failed extra attempt')


if __name__ == '__main__':
    unittest.main()

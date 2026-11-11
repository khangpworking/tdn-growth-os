"""Contract tests for the flow commands of shopee_flow.py (B3, contract 5 and 6).

Each test owns temp runs, state and presets roots. The `run` command is only
called on a run whose first verdict is not PASS, or while a run is busy, so no
module subprocess starts. A fake `node` on PATH records any start.
"""
import hashlib
import http.server
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
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
        self._tmp = tempfile.TemporaryDirectory()
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
        if state.mode == 'fail':
            return self.send(400, {'error': 'synthetic upstream refusal'})
        return self.send(202, state.job(body))


class _SamplingTransport:
    def __init__(self):
        self.sampling = _SamplingState()
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 8877), _SamplingHandler)
        self.server.sampling = self.sampling
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

    def test_a_later_failed_explicit_attempt_keeps_current_failed_over_the_earlier_pass(self):
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
        view = self.info(run_id)['execution']['modules']['M3']
        self.assertEqual(view['status'], 'FAILED')
        self.assertEqual((view['currentGate']['verdict'], view['currentGate']['errorCode']),
                         ('FAIL', 'REVIEW_HTTP_400'), view['currentGate'])
        self.assertEqual(view['historicalGate']['verdict'], 'PASS')
        self.assertNotEqual(view.get('attemptId'), json.loads(binding_bytes)['attemptId'])
        self.assertEqual(len(self.attempts(run_id)), 2, 'the failed extra attempt is a separate immutable attempt')
        self.assertEqual((self.runs / run_id / 'm3-custom' / 'automatic.json').read_bytes(), binding_bytes)
        run = self.command('runs')[1]['runs'][0]
        self.assertNotEqual(run['execution']['modules']['M3']['status'], 'SUCCEEDED')
        sampling = self.command('review-sampling', '--run', run_id)[1]
        by_id = {a['attemptId']: a for a in sampling['attempts']}
        self.assertIs(by_id[json.loads(binding_bytes)['attemptId']].get('automatic'), True,
                      'the saved automatic binding stays marked automatic')
        self.assertIs(by_id[view['attemptId']].get('automatic'), False,
                      'the explicit failed attempt is never marked automatic')


if __name__ == '__main__':
    unittest.main()

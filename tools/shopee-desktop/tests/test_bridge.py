"""Bridge contract tests against the real Shopee flow CLI.

The bridge is the only place that turns a page request into the CLI stdin
contract, so these cases call the real `Api` with a local sshCommand that runs
the real CLI and Node builder. They cover the bridge-to-CLI UTF-8 handoff,
backend error mapping and the rule that saving never creates a run.
"""
import datetime as dt
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
APP_DIR = HERE.parent
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
HEALTH = 'c2035652732'
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


def completed_date(days_ago=1):
    return (dt.date.today() - dt.timedelta(days=days_ago)).isoformat()


def selected_capture_spec(start, end, options):
    fields = {
        'keywords': ['kem chống nắng'],
        'platforms': ['shopee', 'lazada', 'tiki', 'tiktok'],
        'category': {'id': HEALTH, 'label': 'Sức Khoẻ',
                     'children': [dict(child) for child in CATEGORY_CHILDREN if child['id'] in options['categoryIds']]},
        'advancedFilter': {'firstField': 'rating_count', 'operator': '>', 'firstRate': 1,
                           'secondField': 'order_count', 'secondRate': 0.02},
        'exclusions': [],
        **{key: value for key, value in options.items() if key != 'categoryIds'},
    }
    window = {'id': 'selected', 'period': {'startDate': start, 'endDate': end}, 'intervalDays': 7}
    return {'contractVersion': 'metric-v3-capture-spec-v3', 'preset': fields, 'windows': [window]}

sys.path.insert(0, str(APP_DIR))
import tdn_shopee_app  # noqa: E402


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = pathlib.Path(self._tmp.name)
        self.runs = self.base / 'runs'
        self.presets = self.base / 'presets'
        self.state = self.base / 'state'
        for folder in (self.runs, self.presets, self.state):
            folder.mkdir(parents=True)
        config = self.base / 'config.json'
        config.write_text(json.dumps({
            'sshCommand': ['bash', '-s'],
            'remoteScript': str(SCRIPT),
            'runsRoot': str(self.runs),
            'presetsRoot': str(self.presets),
            'timeoutSeconds': 120,
        }), encoding='utf-8')
        patch = mock.patch.dict(os.environ, {
            'TDN_SHOPEE_APP_CONFIG': str(config),
            'SHOPEE_FLOW_STATE': str(self.state),
            'PYTHONDONTWRITEBYTECODE': '1',
        })
        patch.start()
        self.addCleanup(patch.stop)
        self.opencli_bin, self.opencli_log = self.install_opencli()
        path = mock.patch.dict(os.environ, {
            'PATH': f'{self.opencli_bin}{os.pathsep}{os.environ.get("PATH", "")}'})
        path.start()
        self.addCleanup(path.stop)
        self.api = tdn_shopee_app.Api()

    def add(self, **value):
        return self.api.addProduct(value)

    def test_large_unicode_handoff_preserves_every_title(self):
        titles = [f'{n:02d}' + 'ế' * 498 for n in range(30)]
        result = self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                          keyword='kem chống nắng', categoryId=HEALTH, principalTitles=titles)
        self.assertEqual(result, {'ok': True, 'data': {
            'format': 'add-product-v1', 'presetId': 'kem-chong-nang-abc',
            'label': 'Kem chống nắng ABC'}})
        saved = json.loads((self.presets / 'kem-chong-nang-abc.json').read_text(encoding='utf-8'))
        self.assertEqual(saved['principalTitles'], titles)
        self.assertEqual(list(self.runs.iterdir()), [], 'saving a product must not create a run')

    def test_new_run_sends_the_collection_policy_and_saves_request_v2(self):
        saved = self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                         keyword='kem chống nắng', categoryId=HEALTH)
        self.assertTrue(saved['ok'], saved)
        result = self.api.newRun({
            'presetId': 'kem-chong-nang-abc', 'endDate': completed_date(),
            'collectionPolicy': {'mode': 'stars', 'stars': [2, 3], 'totalPerLink': 500,
                                 'allocation': 'pooled'}})
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['data']['entry']['verdict'], 'PASS')
        run = self.runs / result['data']['runId']
        request = json.loads((run / 'request.json').read_text(encoding='utf-8'))
        self.assertEqual(request['format'], 'request-v2')
        self.assertNotIn('reviewCapPerLink', request)
        self.assertEqual(request['collectionPolicy'], {
            'format': 'shopee-review-policy-v1', 'mode': 'stars', 'stars': [2, 3],
            'totalPerLink': 500, 'allocation': 'pooled',
            'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'})

    def test_new_run_passes_a_pages_limit_and_refuses_an_invalid_one_before_the_remote(self):
        saved = self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                         keyword='kem chống nắng', categoryId=HEALTH)
        self.assertTrue(saved['ok'], saved)
        pages = {'mode': 'with-comments', 'stars': [], 'limitBy': 'pages', 'pagesPerLink': 10, 'allocation': 'pooled'}
        result = self.api.newRun({'presetId': 'kem-chong-nang-abc', 'endDate': completed_date(), 'collectionPolicy': pages})
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['data']['entry']['verdict'], 'PASS', result)
        request = json.loads((self.runs / result['data']['runId'] / 'request.json').read_text(encoding='utf-8'))
        self.assertEqual((request['collectionPolicy']['format'], request['collectionPolicy']['pagesPerLink']),
                         ('shopee-review-policy-v2', 10))
        before = list(self.runs.iterdir())
        for policy in ({**pages, 'pagesPerLink': 101}, {**pages, 'pagesPerLink': 0},
                       {**pages, 'allocation': 'equal-stars'}, {**pages, 'totalPerLink': 300}):
            with self.subTest(policy=policy):
                with mock.patch.object(tdn_shopee_app, '_load_config') as load:
                    refused = self.api.newRun({'presetId': 'kem-chong-nang-abc', 'endDate': completed_date(),
                                               'collectionPolicy': policy})
                self.assertEqual(refused, {'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
                load.assert_not_called()
        self.assertEqual(list(self.runs.iterdir()), before)

    def test_new_run_roundtrips_selected_metric_options_and_reads_capture_specs(self):
        saved = self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                         keyword='kem chống nắng', categoryId=HEALTH)
        self.assertTrue(saved['ok'], saved)
        start, end = completed_date(17), completed_date()
        options = {
            'smartQuery': False,
            'usefulFilters': {'fake': False, 'gifts': True, 'deleted': False},
            'shopTypes': ['regular'],
            'categoryIds': ['c2140822537', 'c407923064'],
            'aiNormalisation': True,
            'customizeCategory': True,
            'smartExclusion': True,
        }
        result = self.api.newRun({
            'presetId': 'kem-chong-nang-abc', 'startDate': start, 'endDate': end,
            'metricOptions': options,
            'collectionPolicy': {'mode': 'stars', 'stars': [2, 3], 'totalPerLink': 500,
                                 'allocation': 'pooled'}})
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['data']['entry']['verdict'], 'PASS', result)
        run_id = result['data']['runId']
        run = self.runs / run_id
        request = json.loads((run / 'request.json').read_text(encoding='utf-8'))
        expected = selected_capture_spec(start, end, options)
        self.assertEqual(request['format'], 'request-v2')
        self.assertEqual(request['captureSpec'], expected)
        self.assertEqual(request['windows'], expected['windows'])
        self.assertEqual(request['metricInput'], {
            'format': 'shopee-metric-input-v1', 'preset': expected['preset'], 'window': expected['windows'][0]})
        review = self.api.captureSpecs(run_id)
        self.assertTrue(review['ok'], review)
        data = review['data']
        self.assertEqual(data['format'], 'capture-specs-view-v1')
        self.assertEqual(data['runId'], run_id)
        self.assertEqual(data['specDigestBasis'], 'request-member-utf8')
        self.assertTrue(data['inputsMatch'])
        self.assertIsNone(data['errorCode'])
        self.assertEqual(data['captureSpec'], expected)
        self.assertEqual(json.loads(data['captureSpecJson']), expected)
        raw = (run / 'request.json').read_bytes()
        self.assertIn(data['captureSpecJson'], raw.decode('utf-8'))
        self.assertEqual(data['specSha256'], hashlib.sha256(data['captureSpecJson'].encode('utf-8')).hexdigest())
        self.assertEqual(data['requestSha256'], hashlib.sha256(raw).hexdigest())
        checks = {check['id']: check for check in data['checks']}
        self.assertTrue(checks['capture_spec_request_identity']['ok'])
        self.assertTrue(all(check['ok'] for check in checks.values()))

    def test_new_run_rejects_partial_or_invalid_metric_inputs_before_config_or_ssh(self):
        policy = {'mode': 'stars', 'stars': [2, 3], 'totalPerLink': 500, 'allocation': 'pooled'}
        base = {'presetId': 'kem', 'startDate': completed_date(17), 'endDate': completed_date(),
                'metricOptions': METRIC_OPTIONS, 'collectionPolicy': policy}
        cases = (
            ('start without options', {key: value for key, value in base.items() if key != 'metricOptions'}),
            ('options without start', {key: value for key, value in base.items() if key != 'startDate'}),
            ('selected input without a policy', {key: value for key, value in base.items() if key != 'collectionPolicy'}),
            ('start after end', {**base, 'startDate': dt.date.today().isoformat()}),
            ('empty shops', {**base, 'metricOptions': {**METRIC_OPTIONS, 'shopTypes': []}}),
            ('unknown group', {**base, 'metricOptions': {**METRIC_OPTIONS, 'categoryIds': ['c999']}}),
            ('extra option', {**base, 'metricOptions': {**METRIC_OPTIONS, 'keywords': ['kem chống nắng']}}),
        )
        for label, value in cases:
            with self.subTest(label=label):
                with mock.patch.object(tdn_shopee_app, '_load_config') as load:
                    result = self.api.newRun(value)
                self.assertEqual(result, {'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
                load.assert_not_called()
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_new_run_rejects_legacy_cap_and_policy_together_before_the_remote(self):
        before = list(self.runs.iterdir())
        result = self.api.newRun({
            'presetId': 'kem', 'endDate': completed_date(), 'reviewCapPerLink': 300,
            'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 300,
                                 'allocation': 'pooled'}})
        self.assertEqual(result, {'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(list(self.runs.iterdir()), before)

    def selected_payload(self, end_date, start_date):
        return {
            'presetId': 'kem-chong-nang-abc', 'startDate': start_date, 'endDate': end_date,
            'metricOptions': METRIC_OPTIONS,
            'collectionPolicy': {'mode': 'stars', 'stars': [2, 3], 'totalPerLink': 500,
                                 'allocation': 'pooled'},
        }

    def install_opencli(self, *, available_date=None, read_state='{}'):
        fakebin = self.base / 'opencli-bin'
        fakebin.mkdir(exist_ok=True)
        log = self.base / 'opencli.log'
        if available_date is None:
            available = "print(json.dumps({'availableDate': call['date']}))"
        else:
            available = f"print({json.dumps({'availableDate': available_date})!r})"
        script = f'''#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]
with open({str(log)!r}, 'a', encoding='utf-8') as record:
    record.write(' '.join(args) + '\\n')
if 'tab' in args and 'new' in args:
    print(json.dumps({{'page': 'abc123'}}))
elif 'eval' in args:
    expression = args[-1]
    call = json.loads(expression[expression.rfind(')(') + 2:-1])
    kind = call.get('kind')
    if kind == 'availableDate':
        {available}
    elif kind:
        print('{{}}')
    else:
        print({read_state!r})
else:
    print('{{}}')
'''
        opencli = fakebin / 'opencli'
        opencli.write_text(script, encoding='utf-8')
        os.chmod(opencli, 0o700)
        return fakebin, log

    def test_selected_create_probes_once_then_sends_the_unchanged_exact_period(self):
        self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                 keyword='kem chống nắng', categoryId=HEALTH)
        start, end = completed_date(29), completed_date()
        self.install_opencli(available_date=end)
        result = self.api.newRun(self.selected_payload(end, start))
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['data']['entry']['verdict'], 'PASS', result)
        run = self.runs / result['data']['runId']
        request = json.loads((run / 'request.json').read_text(encoding='utf-8'))
        self.assertEqual(request['captureSpec'], selected_capture_spec(start, end, METRIC_OPTIONS))
        self.assertEqual(request['windows'], [{
            'id': 'selected', 'period': {'startDate': start, 'endDate': end}, 'intervalDays': 7}])
        self.assertEqual(self.opencli_log.read_text(encoding='utf-8').count('tab new'), 1,
                         'Create probes the calendar once before creating the run')

    def test_unavailable_latest_date_returns_the_exact_detail_and_creates_no_run(self):
        self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                 keyword='kem chống nắng', categoryId=HEALTH)
        start, end, last = completed_date(29), completed_date(), completed_date(3)
        self.install_opencli(available_date=last)
        result = self.api.newRun(self.selected_payload(end, start))
        self.assertEqual(result, {'ok': False, 'error': {
            'code': 'CAPTURE_PERIOD_NOT_SELECTABLE', 'message': 'CAPTURE_PERIOD_NOT_SELECTABLE',
            'detail': {'format': 'metric-date-availability-v1', 'requestedEndDate': end,
                       'lastSelectableDate': last, 'available': False,
                       'errorCode': 'CAPTURE_PERIOD_NOT_SELECTABLE'}}})
        self.assertEqual(list(self.runs.iterdir()), [], 'an unavailable end date creates no run')
        self.assertEqual(self.opencli_log.read_text(encoding='utf-8').count('tab new'), 1)

    def test_calendar_failure_stops_before_creation_without_inventing_dates(self):
        self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                 keyword='kem chống nắng', categoryId=HEALTH)
        self.install_opencli(read_state=json.dumps({'stop': 'CAPTURE_LOGIN_REQUIRED'}))
        result = self.api.newRun(self.selected_payload(completed_date(), completed_date(29)))
        self.assertEqual(result, {'ok': False, 'error': {
            'code': 'CAPTURE_LOGIN_REQUIRED', 'message': 'CAPTURE_LOGIN_REQUIRED'}})
        self.assertEqual(list(self.runs.iterdir()), [], 'a calendar failure creates no run')

    def test_legacy_create_skips_the_calendar_probe(self):
        self.add(presetId='kem-chong-nang-abc', label='Kem chống nắng ABC',
                 keyword='kem chống nắng', categoryId=HEALTH)
        result = self.api.newRun({
            'presetId': 'kem-chong-nang-abc', 'endDate': completed_date(),
            'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 300,
                                 'allocation': 'pooled'}})
        self.assertTrue(result['ok'], result)
        self.assertFalse(self.opencli_log.exists(), 'legacy create never probes the calendar')

    def test_calendar_transport_uses_150_seconds_while_config_stays_30(self):
        (self.base / 'config.json').write_text(json.dumps({
            'sshCommand': ['bash', '-s'], 'remoteScript': str(SCRIPT),
            'runsRoot': str(self.runs), 'presetsRoot': str(self.presets),
            'timeoutSeconds': 30,
        }), encoding='utf-8')
        seen = []

        def timeout(command, **options):
            seen.append(options['timeout'])
            raise subprocess.TimeoutExpired(command, options['timeout'])

        with mock.patch.object(tdn_shopee_app.subprocess, 'run', side_effect=timeout):
            result = self.api.newRun(self.selected_payload(completed_date(), completed_date(29)))
            other = self.api.listRuns()
        self.assertEqual(result, {'ok': False, 'error': {
            'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT'}})
        self.assertEqual(other, {'ok': False, 'error': {
            'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT'}})
        self.assertEqual(seen, [150, 30], 'only the calendar action gets the 150 s transport')
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_new_run_rejects_an_unfinished_local_day_before_config_or_ssh(self):
        policy = {'mode': 'stars', 'stars': [2, 3], 'totalPerLink': 500,
                  'allocation': 'pooled'}
        for label, end_date, code in (
            ('today', dt.date.today().isoformat(), 'END_DATE_NOT_COMPLETED'),
            ('tomorrow', (dt.date.today() + dt.timedelta(days=1)).isoformat(),
             'END_DATE_NOT_COMPLETED'),
            ('malformed calendar date', '2026-13-01', 'ARG_INVALID'),
        ):
            with self.subTest(label=label):
                with mock.patch.object(tdn_shopee_app, '_load_config') as load:
                    result = self.api.newRun({
                        'presetId': 'kem', 'endDate': end_date, 'collectionPolicy': policy,
                    })
                self.assertEqual(result, {
                    'ok': False, 'error': {'code': code, 'message': code}})
                load.assert_not_called()

    def test_backend_rejections_map_to_codes(self):
        cases = (
            ({'presetId': 'kem-chong-nang', 'label': 'Kem', 'keyword': 'kem',
              'categoryId': 'c407923064'}, 'PRODUCT_CATEGORY_UNSUPPORTED'),
            ({'presetId': '../escape', 'label': 'Kem', 'keyword': 'kem',
              'categoryId': HEALTH}, 'PRODUCT_INPUT_INVALID'),
        )
        for value, code in cases:
            with self.subTest(code=code):
                self.assertEqual(self.add(**value),
                                 {'ok': False, 'error': {'code': code, 'message': code}})
        self.assertEqual(list(self.presets.iterdir()), [])

    def test_invalid_requests_never_reach_the_cli(self):
        cases = (
            {'presetId': 'kem'},
            {'presetId': 'kem', 'label': 'Kem', 'keyword': 'kem',
             'categoryId': HEALTH, 'extra': 1},
            {'presetId': 'kem', 'label': 'Kem', 'keyword': 'kem',
             'categoryId': HEALTH, 'keyword2': ' '},
            {'presetId': 'kem', 'label': 'Kem', 'keyword': 'kem',
             'categoryId': HEALTH, 'principalTitles': ['Kem', '  ']},
        )
        for value in cases:
            with self.subTest(value=value):
                self.assertEqual(self.add(**value),
                                 {'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})


if __name__ == '__main__':
    unittest.main()

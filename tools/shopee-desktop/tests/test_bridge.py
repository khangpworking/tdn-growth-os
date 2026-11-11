"""Bridge contract tests against the real Shopee flow CLI.

The bridge is the only place that turns a page request into the CLI stdin
contract, so these cases call the real `Api` with a local sshCommand that runs
the real CLI and Node builder. They cover the bridge-to-CLI UTF-8 handoff,
backend error mapping and the rule that saving never creates a run.
"""
import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
APP_DIR = HERE.parent
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
HEALTH = 'c2035652732'

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
            'presetId': 'kem-chong-nang-abc', 'endDate': '2026-11-10',
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

    def test_new_run_rejects_legacy_cap_and_policy_together_before_the_remote(self):
        before = list(self.runs.iterdir())
        result = self.api.newRun({
            'presetId': 'kem', 'endDate': '2026-11-10', 'reviewCapPerLink': 300,
            'collectionPolicy': {'mode': 'with-comments', 'stars': [], 'totalPerLink': 300,
                                 'allocation': 'pooled'}})
        self.assertEqual(result, {'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(list(self.runs.iterdir()), before)

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

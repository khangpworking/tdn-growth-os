"""review-insights route and review-insights-v1 validator coverage for the approved desktop bridge.

Synthetic payloads; no SSH, provider, database or network call is made. Set
REVIEW_INSIGHTS_THEME_FIXTURES to a directory holding payloads recorded from the
theme-summary backend (.tmp-review-insights-{output,empty,small}.json) to validate
real payloads too. Recordings made before theme summaries are intentionally rejected.
"""
import copy
import json
import os
import pathlib
import sys
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app as app  # noqa: E402

CONFIG = {
    'remoteScript': '/home/pkhang/lanes/shopee-1511-edges/deploy-16d04581-r1/candidate/installation/shopee-cli.py',
    'runsRoot': '$HOME/.local/state/tdn-shopee-modules/runs',
    'presetsRoot': '$HOME/.local/state/tdn-shopee-modules/presets',
    'remoteEnvFile': '$HOME/.local/state/tdn-shopee-modules/env',
    'timeoutSeconds': 60,
}


def comment(review_id='review-a1'):
    return {
        'id': review_id, 'text': 'Kem thấm nhanh', 'rating': 5,
        'date': '2026-11-03T03:04:00+07:00', 'productName': 'Kem A',
        'url': 'https://shopee.vn/product/201/101',
        'tags': [{'code': 'T-CONGDUNG', 'name': 'Kết quả sau khi dùng', 'polarity': 'khen',
                  'status': 'kept', 'choice': 'CO_HIEUQUA'}],
    }


def bucket():
    item = comment()
    return {
        'summary': {'status': 'READY', 'text': 'Đã gắn nhãn Jev cho 1 trong 1 bình luận.',
                    'model': 'jev-derived-v1', 'generatedAt': '2026-11-10T00:05:00.000Z'},
        'themes': [{'code': 'T-CONGDUNG', 'name': 'Kết quả sau khi dùng', 'count': 1, 'unclearCount': 0,
                    'share': 1.0, 'polarityCounts': {'khen': 1, 'che': 0, 'ke': 0, 'khong_ro_huong': 0},
                    'summary': {'status': 'READY',
                                'text': 'Chỉ có 1 bình luận đủ bằng chứng cho chủ đề này: “Kem thấm nhanh” (khen).',
                                'model': 'jev-extractive-theme-v1',
                                'generatedAt': '2026-11-10T00:05:00.000Z'},
                    'comments': [item]}],
        'comments': [item],
    }


def payload():
    return {
        'format': 'review-insights-v1', 'runId': '45a1797b', 'codebookVersion': '2026-11-04.1',
        'sources': [{
            'sourceSha256': 'a' * 64, 'kind': 'legacy', 'status': 'SUCCEEDED',
            'completedAt': '2026-11-10T00:05:00.000Z', 'all': bucket(),
            'links': [{'shopId': '201', 'itemId': '101', 'url': 'https://shopee.vn/product/201/101',
                       'insights': bucket()}],
        }],
    }


def invalid(mutate):
    value = payload()
    mutate(value)
    return value


class ReviewInsightsBridgeTests(unittest.TestCase):
    def call(self, value, run_id='45a1797b'):
        api = app.Api()
        api._remote = lambda *args, **kwargs: {'ok': True, 'data': value}
        return api.reviewInsights(run_id)

    def assert_invalid(self, value):
        self.assertEqual(self.call(value),
                         {'ok': False, 'error': {'code': 'REMOTE_OUTPUT_INVALID', 'message': 'REMOTE_OUTPUT_INVALID'}})

    def test_route_and_plan_map_the_review_insights_command(self):
        self.assertEqual(app._COMMANDS['reviewInsights'], ('review-insights', '--run'))
        api = app.Api()
        _, lines = api._remote_plan('reviewInsights', '45a1797b', config=dict(CONFIG))
        self.assertEqual(lines[0], 'export PYTHONDONTWRITEBYTECODE=1')
        self.assertIn(f'python3 "{CONFIG["remoteScript"]}" review-insights --run 45a1797b', lines)
        self.assertNotIn('--stdin', ' '.join(lines))
        for bad in (None, '', '../run', 'run id', 45):
            with self.assertRaises(app._BridgeFailure) as caught:
                api._remote_plan('reviewInsights', bad, config=dict(CONFIG))
            self.assertEqual(caught.exception.code, 'ARG_INVALID')

    def test_valid_payload_is_returned_unchanged(self):
        value = payload()
        self.assertEqual(self.call(value), {'ok': True, 'data': value})

    def test_empty_and_unavailable_theme_summaries_are_accepted(self):
        for status in ('EMPTY', 'UNAVAILABLE'):
            with self.subTest(status):
                value = payload()
                summary = {'status': status, 'text': None, 'model': None, 'generatedAt': None}
                for bucket_value in (value['sources'][0]['all'], value['sources'][0]['links'][0]['insights']):
                    bucket_value['themes'][0]['summary'] = dict(summary)
                self.assertEqual(self.call(value), {'ok': True, 'data': value})

    def test_malformed_payloads_are_rejected(self):
        cases = {
            'extra top-level key': lambda v: v.update(extra=True),
            'wrong format': lambda v: v.update(format='review-insights-v0'),
            'run id mismatch': lambda v: v.update(runId='45a1797c'),
            'empty codebook': lambda v: v.update(codebookVersion=''),
            'invalid source hash': lambda v: v['sources'][0].update(sourceSha256='g' * 64),
            'kind not a name': lambda v: v['sources'][0].update(kind='snap shot'),
            '101 links': lambda v: v['sources'][0].update(links=v['sources'][0]['links'] * 101),
            'polarity not a name': lambda v: v['sources'][0]['all']['comments'][0]['tags'][0].update(polarity=None),
            'tag status not a name': lambda v: v['sources'][0]['all']['comments'][0]['tags'][0].update(status=''),
            'bad rating': lambda v: v['sources'][0]['all']['comments'][0].update(rating=6),
            'bad comment url': lambda v: v['sources'][0]['all']['comments'][0].update(url='https://example.com/x'),
            'extra tag field': lambda v: v['sources'][0]['all']['comments'][0]['tags'][0].update(extra=1),
            '51 themes': lambda v: v['sources'][0]['all'].update(themes=v['sources'][0]['all']['themes'] * 51),
            '51 tags on a comment': lambda v: v['sources'][0]['all']['comments'][0].update(
                tags=v['sources'][0]['all']['comments'][0]['tags'] * 51),
            'share above one': lambda v: v['sources'][0]['all']['themes'][0].update(share=2),
            'summary status not a name': lambda v: v['sources'][0]['all']['summary'].update(status=1),
            'summary text too long': lambda v: v['sources'][0]['all']['summary'].update(text='x' * 4001),
            'theme summary missing': lambda v: v['sources'][0]['all']['themes'][0].pop('summary'),
            'theme summary not an object': lambda v: v['sources'][0]['all']['themes'][0].update(summary=[]),
            'theme summary extra key': lambda v: v['sources'][0]['all']['themes'][0]['summary'].update(extra=1),
            'theme summary status not a name': lambda v: v['sources'][0]['all']['themes'][0]['summary'].update(status='DO NE'),
            'theme summary text too long': lambda v: v['sources'][0]['all']['themes'][0]['summary'].update(text='x' * 4001),
            'theme summary model too long': lambda v: v['sources'][0]['all']['themes'][0]['summary'].update(model='x' * 201),
            'theme summary generatedAt too long': lambda v: v['sources'][0]['all']['themes'][0]['summary'].update(generatedAt='x' * 129),
            'sources not a list': lambda v: v.update(sources={}),
        }
        for name, mutate in cases.items():
            with self.subTest(name):
                self.assert_invalid(invalid(mutate))

    def test_display_only_values_new_to_this_app_and_50_topics_pass(self):
        """#5: a new label kind / status / source kind, or up to 50 topics and 50 labels, keeps the result tab."""
        def mutate(value):
            source = value['sources'][0]
            source.update(kind='snapshot', status='PARTIAL')
            tag = source['all']['comments'][0]['tags'][0]
            tag.update(polarity='positive', status='uncertain')
            source['all']['comments'][0]['tags'] = [dict(tag, code='T-N%d' % index) for index in range(50)]
            source['all']['summary']['status'] = 'DONE'
            theme = source['all']['themes'][0]
            theme['summary']['status'] = 'DONE'
            theme['polarityCounts']['trung_lap'] = 0
            source['all']['themes'] = [dict(theme, code='T-N%d' % index) for index in range(50)]
        value = invalid(mutate)
        self.assertEqual(self.call(value), {'ok': True, 'data': value})

    def test_a_topic_missing_one_of_its_four_counts_is_rejected(self):
        """#5: new count names may be added, but khen / che / ke / khong_ro_huong must all be there."""
        for missing in ('khen', 'che', 'ke', 'khong_ro_huong'):
            with self.subTest(missing=missing):
                self.assert_invalid(invalid(lambda value: value['sources'][0]['all']['themes'][0]['polarityCounts'].pop(missing)))

    def test_more_than_two_hundred_comments_are_rejected(self):
        def mutate(value):
            value['sources'][0]['all']['comments'] = [comment(f'review-{index}') for index in range(201)]
        self.assert_invalid(invalid(mutate))

    def test_remote_failure_exposes_only_the_static_code(self):
        api = app.Api()
        api._remote = lambda *args, **kwargs: {
            'ok': False, 'error': {'code': 'REVIEW_DATA_FAILED', 'message': '/home/pkhang/private/path'}}
        result = api.reviewInsights('45a1797b')
        self.assertEqual(result, {'ok': False,
                                  'error': {'code': 'REVIEW_DATA_FAILED', 'message': 'REVIEW_DATA_FAILED'}})
        self.assertNotIn('pkhang', json.dumps(result))
        api._remote = lambda *args, **kwargs: {'ok': False, 'error': {'code': 'not a code', 'message': 'x'}}
        self.assertEqual(api.reviewInsights('45a1797b')['error']['code'], 'REMOTE_OUTPUT_INVALID')

    def test_invoke_maps_invalid_json_failure_and_timeout(self):
        api = app.Api()
        result = mock.Mock(returncode=0, stdout=b'not-json', stderr=b'private ssh diagnostics')
        with mock.patch.object(app.subprocess, 'run', return_value=result):
            with self.assertRaises(app._BridgeFailure) as caught:
                api._invoke('reviewInsights', CONFIG, ['export X=1'], ['ssh'], token=None)
        self.assertEqual(caught.exception.code, 'REMOTE_OUTPUT_INVALID')
        result = mock.Mock(returncode=255, stdout=b'', stderr=b'private')
        with mock.patch.object(app.subprocess, 'run', return_value=result):
            with self.assertRaises(app._BridgeFailure) as caught:
                api._invoke('reviewInsights', CONFIG, ['export X=1'], ['ssh'], token=None)
        self.assertEqual(caught.exception.code, 'SSH_FAILED')
        with mock.patch.object(app.subprocess, 'run',
                               side_effect=app.subprocess.TimeoutExpired('ssh', 60)):
            with self.assertRaises(app._BridgeFailure) as caught:
                api._invoke('reviewInsights', CONFIG, ['export X=1'], ['ssh'], token=None)
        self.assertEqual(caught.exception.code, 'SSH_TIMEOUT')

    @unittest.skipUnless(os.environ.get('REVIEW_INSIGHTS_THEME_FIXTURES'), 'theme-summary fixtures not provided')
    def test_recorded_real_payloads_validate(self):
        root = pathlib.Path(os.environ['REVIEW_INSIGHTS_THEME_FIXTURES'])
        for name, run_id in (('.tmp-review-insights-output.json', '45a1797b'),
                             ('.tmp-review-insights-small.json', 'abc55ffa'),
                             ('.tmp-review-insights-empty.json', 'c9139655')):
            with self.subTest(name):
                value = json.loads((root / name).read_text(encoding='utf8'))
                self.assertEqual(self.call(value, run_id), {'ok': True, 'data': value})


if __name__ == '__main__':
    unittest.main()

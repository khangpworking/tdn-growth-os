"""F647 wave 2 bridge: run-view parts, the insights summary and comments on demand (CONTRACT-F647-wave2 §4)."""

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app  # noqa: E402

RUN = 'run-1'
SHA = 'a' * 64
SUMMARY = {'status': 'EMPTY', 'text': None, 'model': None, 'generatedAt': None}
COMMENT = {'id': 'r1', 'text': 'Dùng tốt', 'rating': 5, 'date': None, 'productName': None,
           'url': 'https://shopee.vn/product/1/2', 'tags': []}
THEME = {'code': 'T-CONGDUNG', 'name': 'Công dụng', 'count': 1, 'unclearCount': 0, 'share': 1,
         'polarityCounts': {'khen': 1, 'che': 0, 'ke': 0, 'khong_ro_huong': 0}, 'summary': SUMMARY}


def source(bucket):
    return {'sourceSha256': SHA, 'kind': 'legacy', 'status': 'SUCCEEDED', 'completedAt': None,
            'all': bucket, 'links': []}


INSIGHTS_V2 = {'format': 'review-insights-v2', 'runId': RUN, 'codebookVersion': 'v1', 'sources': [source(
    {'key': SHA + ':all', 'summary': SUMMARY, 'themes': [dict(THEME, commentCount=1)], 'commentCount': 1})]}
INSIGHTS_V1 = {'format': 'review-insights-v1', 'runId': RUN, 'codebookVersion': 'v1', 'sources': [source(
    {'summary': SUMMARY, 'themes': [dict(THEME, comments=[COMMENT])], 'comments': [COMMENT]})]}
PARTS = {
    'info': {'format': 'run-info-v1', 'runId': RUN},
    'sampling': {'format': 'review-sampling-view-v1', 'runId': RUN},
    'reviewData': {'format': 'review-data-view-v1', 'runId': RUN, 'readonly': False, 'tracking': {}, 'db': {},
                   'sources': []},
    'outputs': {'format': 'module-outputs-v1', 'runId': RUN},
    'process': {'format': 'review-process-view-v1', 'runId': RUN, 'autoRun': False, 'labelUnresolved': False,
                'sources': []},
    'stats': {'format': 'review-stats-v1', 'runId': RUN, 'sources': []},
    'insights': INSIGHTS_V2,
}


def view(parts, errors=None):
    return {'ok': True, 'data': {'format': 'run-view-v1', 'runId': RUN, 'parts': parts, 'errors': errors or {}}}


class RunViewBridgeTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()      # the disk copy never touches this PC's real app folder
        self.addCleanup(folder.cleanup)
        config = pathlib.Path(folder.name) / 'config.json'
        config.write_text(json.dumps({'sshCommand': ['ssh', 'runs.example'], 'remoteScript': '$HOME/tdn/shopee_flow.py',
                                      'timeoutSeconds': 5}), encoding='utf-8')
        env = mock.patch.dict(os.environ, {'TDN_SHOPEE_APP_CONFIG': str(config)})
        env.start()
        self.addCleanup(env.stop)
        self.api = tdn_shopee_app.Api()
        self.calls = []
        self.answer = None
        patch = mock.patch.object(self.api, '_remote', self.fake_remote)
        patch.start()
        self.addCleanup(patch.stop)

    def fake_remote(self, action, run_id=None, flags=(), **_):
        self.calls.append((action, run_id, tuple(flags)))
        return self.answer

    def test_run_view_rows(self):
        """| reply                                             | page gets                                         |
        |---------------------------------------------------|---------------------------------------------------|
        | 5 parts, no --result                              | each part as its single call's ok reply           |
        | 7 parts with --result                             | stats and the v2 summary too                      |
        | a part in `errors`                                | that part = its single call's error, others ok    |
        | a part failing its single call's check            | that part REMOTE_OUTPUT_INVALID, others ok        |
        | the info error (RUN_NOT_FOUND)                    | the command error                                 |
        | a part missing / an unknown part                  | REMOTE_OUTPUT_INVALID                             |
        """
        five = {name: PARTS[name] for name in ('info', 'sampling', 'reviewData', 'outputs', 'process')}
        with self.subTest('five parts'):
            self.answer = view(five)
            result = self.api.runView(RUN, False)
            self.assertEqual(self.calls[-1], ('runView', RUN, ()))
            self.assertEqual(result['data']['parts'], {name: {'ok': True, 'data': part} for name, part in five.items()})
        with self.subTest('with --result'):
            self.answer = view(PARTS)
            result = self.api.runView(RUN, True)
            self.assertEqual(self.calls[-1], ('runView', RUN, ('--result',)))
            self.assertEqual(result['data']['parts']['insights'], {'ok': True, 'data': INSIGHTS_V2})
            self.assertEqual(result['data']['parts']['stats'], {'ok': True, 'data': PARTS['stats']})
        with self.subTest('a part in errors'):
            parts = dict(five)
            del parts['sampling']
            self.answer = view(parts, {'sampling': {'code': 'SAMPLING_UNAVAILABLE', 'message': 'Not yet.'}})
            result = self.api.runView(RUN, False)['data']['parts']
            self.assertEqual(result['sampling'], {'ok': False, 'error': {'code': 'SAMPLING_UNAVAILABLE', 'message': 'Not yet.'}})
            self.assertTrue(result['reviewData']['ok'])
        with self.subTest('a part failing its check'):
            self.answer = view(dict(PARTS, insights=INSIGHTS_V1))     # v1 where the summary belongs
            result = self.api.runView(RUN, True)['data']['parts']
            self.assertEqual(result['insights']['error']['code'], 'REMOTE_OUTPUT_INVALID')
            self.assertTrue(result['stats']['ok'])
        with self.subTest('info error'):
            self.answer = tdn_shopee_app._error('RUN_NOT_FOUND', 'No run.')
            self.assertEqual(self.api.runView(RUN, False), tdn_shopee_app._error('RUN_NOT_FOUND', 'No run.'))
        for name, parts in (('missing', {k: v for k, v in five.items() if k != 'process'}),
                            ('unknown', dict(five, extra={}))):
            with self.subTest(name):
                self.answer = view(parts)
                self.assertEqual(self.api.runView(RUN, False)['error']['code'], 'REMOTE_OUTPUT_INVALID')

    def test_insights_summary_and_comments(self):
        """| call                                   | reply                          | page gets                  |
        |----------------------------------------|--------------------------------|----------------------------|
        | reviewInsightsSummary                  | v2                             | ok, asked with --summary   |
        | reviewInsightsSummary                  | v1 (comment lists)             | REMOTE_OUTPUT_INVALID      |
        | reviewInsightComments bucket + theme   | its list                       | ok, --bucket and --theme   |
        | reviewInsightComments                  | another theme echoed back      | REMOTE_OUTPUT_INVALID      |
        | reviewInsightComments bad bucket key   | (not sent)                     | ARG_INVALID                |
        """
        self.answer = {'ok': True, 'data': INSIGHTS_V2}
        self.assertTrue(self.api.reviewInsightsSummary(RUN)['ok'])
        self.assertEqual(self.calls[-1], ('reviewInsightsSummary', RUN, ('--summary',)))
        self.answer = {'ok': True, 'data': INSIGHTS_V1}
        self.assertEqual(self.api.reviewInsightsSummary(RUN)['error']['code'], 'REMOTE_OUTPUT_INVALID')
        reply = {'format': 'review-insight-comments-v1', 'bucket': SHA + ':all', 'theme': 'T-CONGDUNG', 'comments': [COMMENT]}
        self.answer = {'ok': True, 'data': reply}
        self.assertEqual(self.api.reviewInsightComments(RUN, SHA + ':all', 'T-CONGDUNG'), {'ok': True, 'data': reply})
        self.assertEqual(self.calls[-1], ('reviewInsightComments', RUN, ('--bucket', SHA + ':all', '--theme', 'T-CONGDUNG')))
        self.answer = {'ok': True, 'data': dict(reply, theme='T-GIA')}
        self.assertEqual(self.api.reviewInsightComments(RUN, SHA + ':all', 'T-CONGDUNG')['error']['code'],
                         'REMOTE_OUTPUT_INVALID')
        sent = len(self.calls)
        self.assertEqual(self.api.reviewInsightComments(RUN, 'a b', None)['error']['code'], 'ARG_INVALID')
        self.assertEqual(len(self.calls), sent)


class OlderServerTest(unittest.TestCase):
    def test_an_unknown_command_is_usage(self):
        """An older server's argparse exits 2 with nothing on stdout: run-view answers USAGE (the page falls back)."""
        api = tdn_shopee_app.Api()
        config = {'timeoutSeconds': 30}
        done = subprocess.CompletedProcess([], 2, stdout=b'', stderr=b'usage: ...')
        with mock.patch.object(tdn_shopee_app.subprocess, 'run', return_value=done):
            with self.assertRaises(tdn_shopee_app._BridgeFailure) as raised:
                api._invoke('runView', config, [], ['ssh'])
            self.assertEqual(raised.exception.code, 'USAGE')
            with self.assertRaises(tdn_shopee_app._BridgeFailure) as raised:
                api._invoke('reviewData', config, [], ['ssh'])     # an old command keeps its rule
            self.assertEqual(raised.exception.code, 'REMOTE_OUTPUT_INVALID')


if __name__ == '__main__':
    unittest.main()

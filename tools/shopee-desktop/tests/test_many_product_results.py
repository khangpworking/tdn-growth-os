"""The result tab of a run with more than 5 products (live fault 26/11, run 6db31548: 10 products, all 4 steps
PASS, the tab showed «Máy chủ trả về dữ liệu lỗi»). The server lets a run pick 1 to 100 products, so the review
counts, the review insights and its summary must pass the same number of links. Synthetic payloads; no network."""

import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app as app  # noqa: E402

RUN = 'run-1'
SHA = 'a' * 64
SUMMARY = {'status': 'EMPTY', 'text': None, 'model': None, 'generatedAt': None}
NUMBERS = {'commentCount': 2, 'averageStar': 4.5, 'starCounts': {'1': 0, '2': 0, '3': 0, '4': 1, '5': 1},
           'firstCommentAt': None, 'lastCommentAt': None}
THEME = {'code': 'T-CONGDUNG', 'name': 'Kết quả sau khi dùng', 'count': 0, 'unclearCount': 0, 'share': 0,
         'polarityCounts': {'khen': 0, 'che': 0, 'ke': 0, 'khong_ro_huong': 0}, 'summary': SUMMARY}


def ids(n):
    return [(str(100 + i), str(1000 + i)) for i in range(n)]


def url(shop, item):
    return f'https://shopee.vn/product/{shop}/{item}'


def source(all_value, links):
    return {'sourceSha256': SHA, 'kind': 'custom', 'status': 'SUCCEEDED', 'completedAt': None,
            'all': all_value, 'links': links}


def stats(n):
    links = [dict(NUMBERS, shopId=shop, itemId=item, url=url(shop, item)) for shop, item in ids(n)]
    return {'format': 'review-stats-v1', 'runId': RUN, 'sources': [source(NUMBERS, links)]}


def insights_v1(n):
    bucket = {'summary': SUMMARY, 'themes': [dict(THEME, comments=[])], 'comments': []}
    links = [{'shopId': shop, 'itemId': item, 'url': url(shop, item), 'insights': bucket} for shop, item in ids(n)]
    return {'format': 'review-insights-v1', 'runId': RUN, 'codebookVersion': '2026-11-04.1',
            'sources': [source(bucket, links)]}


def insights_v2(n):
    def bucket(key):
        return {'key': key, 'summary': SUMMARY, 'themes': [dict(THEME, commentCount=0)], 'commentCount': 0}
    links = [{'shopId': shop, 'itemId': item, 'url': url(shop, item), 'insights': bucket(f'{SHA}:{shop}:{item}')}
             for shop, item in ids(n)]
    return {'format': 'review-insights-v2', 'runId': RUN, 'codebookVersion': '2026-11-04.1',
            'sources': [source(bucket(SHA + ':all'), links)]}


PARTS = {
    'info': {'format': 'run-info-v1', 'runId': RUN},
    'sampling': {'format': 'review-sampling-view-v1', 'runId': RUN},
    'reviewData': {'format': 'review-data-view-v1', 'runId': RUN, 'readonly': False, 'tracking': {}, 'db': {},
                   'sources': []},
    'outputs': {'format': 'module-outputs-v1', 'runId': RUN},
    'process': {'format': 'review-process-view-v1', 'runId': RUN, 'autoRun': False, 'labelUnresolved': False,
                'sources': []},
}


class ManyProductResultsTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()      # the run-view disk copy never touches this PC's app folder
        self.addCleanup(folder.cleanup)
        config = pathlib.Path(folder.name) / 'config.json'
        config.write_text(json.dumps({'sshCommand': ['ssh', 'runs.example'], 'remoteScript': '$HOME/tdn/shopee_flow.py',
                                      'timeoutSeconds': 5}), encoding='utf-8')
        env = mock.patch.dict(os.environ, {'TDN_SHOPEE_APP_CONFIG': str(config)})
        env.start()
        self.addCleanup(env.stop)
        self.api = app.Api()
        self.answer = None
        patch = mock.patch.object(self.api, '_remote', lambda *args, **kwargs: self.answer)
        patch.start()
        self.addCleanup(patch.stop)

    def reply(self, call, value):
        self.answer = {'ok': True, 'data': value}
        return getattr(self.api, call)(RUN)

    def test_single_calls_pass_every_product_the_server_allows(self):
        """| call                  | products in the reply | page gets              |
        |-----------------------|-----------------------|------------------------|
        | reviewStats           | 6, 10, 100            | the reply unchanged    |
        | reviewInsights        | 6, 10, 100            | the reply unchanged    |
        | reviewInsightsSummary | 6, 10, 100            | the reply unchanged    |
        | each of the three     | 101 (over the limit)  | REMOTE_OUTPUT_INVALID  |
        """
        for call, make in (('reviewStats', stats), ('reviewInsights', insights_v1),
                           ('reviewInsightsSummary', insights_v2)):
            for n in (6, 10, 100):
                with self.subTest(call=call, products=n):
                    value = make(n)
                    self.assertEqual(self.reply(call, value), {'ok': True, 'data': value})
            with self.subTest(call=call, products=101):
                self.assertEqual(self.reply(call, make(101))['error']['code'], 'REMOTE_OUTPUT_INVALID')

    def test_run_view_of_a_ten_product_run_opens_its_result(self):
        """| run view --result of a 10-product run | the review counts and the insights parts are ok, unchanged |"""
        parts = dict(PARTS, stats=stats(10), insights=insights_v2(10))
        self.answer = {'ok': True, 'data': {'format': 'run-view-v1', 'runId': RUN, 'parts': parts, 'errors': {}}}
        result = self.api.runView(RUN, True)
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['data']['parts']['stats'], {'ok': True, 'data': parts['stats']})
        self.assertEqual(result['data']['parts']['insights'], {'ok': True, 'data': parts['insights']})


if __name__ == '__main__':
    unittest.main()

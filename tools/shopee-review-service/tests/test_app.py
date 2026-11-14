"""Contract tests for the review service job input and crawl state (page limit).

Run with the service's own Python environment (fastapi + pydantic from
requirements.lock.txt). No browser, Shopee page or network is used: the worker
gets a fake page that records the crawler config and returns a fixed result.
"""
import asyncio
import hashlib
import importlib
import json
import os
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://shopee.vn/product/100/200'
ATTEMPT = '00000000-0000-4000-8000-0000000000aa'


def load_app(data_dir):
    os.environ['APP_DATA_DIR'] = data_dir
    os.environ['SHOPEE_API_TOKEN'] = 'synthetic-token-' + 'x' * 32
    os.environ['TDN_SHOPEE_FLOW_READONLY'] = '0'
    os.environ['SHOPEE_FLOW_STATE'] = data_dir
    sys.path.insert(0, str(ROOT))
    try:
        return importlib.import_module('app')
    finally:
        sys.path.remove(str(ROOT))


def policy_v2(pages=10):
    return {'format': 'shopee-review-policy-v2', 'limitBy': 'pages', 'mode': 'with-comments', 'stars': [],
            'pagesPerLink': pages, 'totalPerLink': 2000, 'allocation': 'pooled',
            'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'}


def policy_v1(total=300):
    return {'format': 'shopee-review-policy-v1', 'mode': 'with-comments', 'stars': [], 'totalPerLink': total,
            'allocation': 'pooled', 'textRule': 'comment-or-attributes-v1', 'order': 'native-filter-ascending-stars-v1'}


def sampling(policy):
    digest = hashlib.sha256(json.dumps(policy, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    return {'attemptId': ATTEMPT, 'planSha256': 'a' * 64, 'policySha256': digest, 'policy': policy}


class FakeLocator:
    first = property(lambda self: self)

    async def wait_for(self, **_):
        return None

    async def scroll_into_view_if_needed(self):
        return None


class FakePage:
    """Records the crawler config; the crawler script returns `result`."""

    def __init__(self, result):
        self.result, self.config = result, None

    def locator(self, _):
        return FakeLocator()

    async def evaluate(self, expression, arg=None):
        if arg is not None:
            self.config = arg
            return None
        if expression.startswith('(async () =>'):
            return self.result
        return None


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.app = load_app(cls._tmp.name)
        cls.app.initialize_db()

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def job_input(self, **value):
        return self.app.JobInput.model_validate_json(json.dumps({'url': URL, **value}))

    def test_a_job_without_a_page_limit_keeps_its_stored_bytes(self):
        stored = self.job_input(max_comments=20).model_dump_json(exclude_none=True)
        self.assertEqual(stored, json.dumps({'url': URL, 'max_comments': 20}, separators=(',', ':')))
        stored = self.job_input(max_comments=300, sampling=sampling(policy_v1())).model_dump_json(exclude_none=True)
        self.assertNotIn('max_pages', json.loads(stored))

    def test_page_limit_is_an_integer_from_1_to_500(self):
        for pages in (1, 500):
            self.assertEqual(self.job_input(max_comments=20, max_pages=pages).max_pages, pages)
        for pages in (0, 501, True, '10', 10.0):
            with self.subTest(pages=pages), self.assertRaises(Exception):
                self.job_input(max_comments=20, max_pages=pages)

    def test_a_sampling_job_binds_its_page_limit_to_the_policy(self):
        accepted = self.job_input(max_comments=2000, max_pages=10, sampling=sampling(policy_v2(10)))
        self.assertEqual((accepted.max_pages, accepted.sampling.policy.pagesPerLink), (10, 10))
        refused = (
            {'max_comments': 2000, 'sampling': sampling(policy_v2(10))},                   # pages policy, no limit
            {'max_comments': 2000, 'max_pages': 9, 'sampling': sampling(policy_v2(10))},   # other limit
            {'max_comments': 300, 'max_pages': 10, 'sampling': sampling(policy_v1())},     # count policy with a limit
            {'max_comments': 2000, 'max_pages': 101, 'sampling': sampling(policy_v2(101))},  # above the policy max
            {'max_comments': 300, 'max_pages': 10, 'sampling': sampling({**policy_v2(10), 'totalPerLink': 300})},
        )
        for value in refused:
            with self.subTest(value=value), self.assertRaises(Exception):
                self.job_input(**value)

    def test_an_explicit_500_page_limit_and_other_stops_keep_their_mapping(self):
        state = self.app.crawl_state
        self.assertEqual(state({'url': URL, 'max_pages': 500}, {'stop_reason': 'page_limit', 'error': None}), 'partial')
        for stopped in ('record_limit', 'expected_count_reached', 'last_page', 'exhausted'):
            self.assertEqual(state({'url': URL}, {'stop_reason': stopped, 'error': None}), 'succeeded')
        self.assertEqual(state({'url': URL}, {'stop_reason': 'repeated_page', 'error': None}), 'partial')
        self.assertEqual(state({'url': URL, 'max_pages': 10}, {'stop_reason': 'cancelled', 'error': None}), 'cancelled')
        self.assertIsNone(state({'url': URL, 'max_pages': 10}, {'stop_reason': 'control_changed', 'error': 'CONTROL_CHANGED'}))

    def run_job(self, payload, result):
        app = self.app
        job_id = f'job-{len(payload)}-{payload.get("max_pages")}'
        with app.db() as connection:
            connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                               (job_id, json.dumps(payload), 'queued', app.now(), app.now()))
        worker, page = app.BrowserWorker(), FakePage(result)
        worker.page = page

        async def ready(_url):
            return {'state': 'ready'}
        worker.navigate_product = ready
        asyncio.run(worker.run_job(job_id))
        return page.config, app.get_job(job_id)['state']

    def test_the_worker_passes_max_pages_to_the_crawler_and_maps_its_stop(self):
        result = {'stop_reason': 'page_limit', 'error': None, 'records': [], 'pages': [{'page': 1}]}
        config, state = self.run_job({'url': URL, 'max_comments': 20, 'max_pages': 7}, result)
        self.assertEqual((config['maxPages'], config['limit'], state), (7, 20, 'succeeded'))
        config, state = self.run_job({'url': URL, 'max_comments': 20}, result)
        self.assertEqual((config['maxPages'], state), (500, 'partial'), 'existing callers keep 500 pages and partial')


if __name__ == '__main__':
    unittest.main()

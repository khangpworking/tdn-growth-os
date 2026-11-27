"""Contract tests for the review service job input and crawl state (page limit).

Run with the service's own Python environment (fastapi + pydantic from
requirements.lock.txt). No browser, Shopee page or network is used: the worker
gets a fake page that records the crawler config and returns a fixed result.
"""
import asyncio
from contextlib import redirect_stdout, suppress
import gc
import hashlib
import importlib
import io
import json
import os
import pathlib
import shutil
import signal
import socket
import sys
import tempfile
import time
import types
import unittest
import uuid
import warnings
from unittest import mock

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

    def __init__(self, page=None, selector=''):
        self.page, self.selector = page, selector

    async def wait_for(self, **_):
        if self.page and self.selector == '.product-ratings' and self.page.wait_error:
            if self.page.during_wait is not None:
                self.page.during_wait()
            if self.page.after_timeout is not None:
                self.page.body_text, self.page.url = self.page.after_timeout
            raise self.page.wait_error
        return None

    async def scroll_into_view_if_needed(self):
        return None

    async def count(self):
        if self.page and self.page.during_title_check is not None:
            check, self.page.during_title_check = self.page.during_title_check, None
            check()
        return self.page.h1 if self.page else 1

    async def inner_text(self):
        if self.page and self.page.during_observe is not None:
            observe, self.page.during_observe = self.page.during_observe, None
            observe()
        return self.page.body_text if self.page else ''

    async def all_inner_texts(self):
        return list(self.page.headings) if self.page else []


class FakePage:
    """Records the crawler config; the crawler script returns `result`."""

    def __init__(self, result, h1=1, body_text='', wait_error=None, headings=(), after_timeout=None, during_wait=None,
                 during_observe=None):
        self.result, self.config, self.crawls = result, None, 0
        self.h1, self.body_text, self.wait_error = h1, body_text, wait_error
        self.headings, self.after_timeout = list(headings), after_timeout
        self.during_wait, self.during_observe = during_wait, during_observe
        self.during_title_check = None
        self.url = URL

    def locator(self, selector):
        return FakeLocator(self, selector)

    async def evaluate(self, expression, arg=None):
        if arg is not None:
            self.config = arg
            return None
        if expression.startswith('(async () =>'):
            self.crawls += 1
            return self.result
        return None

    def is_closed(self):
        return False

    def set_default_timeout(self, _ms):
        return None


class FakeContext:
    """A browser context that counts its closes; `close_error` makes the close fail."""

    def __init__(self, page=None, close_error=None):
        self.pages, self.closes, self.close_error = [page] if page else [], 0, close_error

    async def close(self):
        self.closes += 1
        if self.close_error:
            raise self.close_error


def fake_cloakbrowser(launch):
    module = types.ModuleType('cloakbrowser')
    module.launch_persistent_context_async = launch
    return mock.patch.dict(sys.modules, {'cloakbrowser': module})


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

    def test_status_polls_close_every_job_database_connection(self):
        # Live 17/11: every poll left one jobs.sqlite3 connection open until the fd limit gave HTTP 500.
        app, job_id = self.app, 'job-connection-leak'
        with app.db() as connection:
            connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                               (job_id, json.dumps({'url': URL}), 'queued', app.now(), app.now()))
        database = str(pathlib.Path(self._tmp.name, 'jobs.sqlite3').resolve())

        def open_files():
            if not os.path.isdir('/proc/self/fd'):
                return 0
            count = 0
            for fd in os.listdir('/proc/self/fd'):
                with suppress(OSError):
                    count += os.readlink(os.path.join('/proc/self/fd', fd)) == database
            return count

        gc.collect()
        before = open_files()
        gc.disable()
        try:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter('always', ResourceWarning)
                for _ in range(100):
                    app.get_job(job_id)
                    app.update_job(job_id, page=1)
                    app.list_jobs(limit=5)
                leaked = open_files() - before
                gc.collect()
        finally:
            gc.enable()
        self.assertEqual(leaked, 0, 'open jobs.sqlite3 connections after 300 calls')
        self.assertEqual([str(w.message) for w in caught if issubclass(w.category, ResourceWarning)], [])

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

    def run_job_with_page(self, payload, page, during_wait=None, during_observe=None, during_title_check=None, worker=None):
        app, job_id = self.app, str(uuid.uuid4())
        with app.db() as connection:
            connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                               (job_id, json.dumps(payload), 'queued', app.now(), app.now()))
        if during_wait is not None:
            page.during_wait = lambda: during_wait(job_id)
        if during_observe is not None:
            page.during_observe = lambda: during_observe(job_id)
        if during_title_check is not None:
            page.during_title_check = lambda: during_title_check(job_id)
        worker = worker or app.BrowserWorker()
        worker.page = page

        async def ready(_url):
            return {'state': 'ready'}
        worker.navigate_product = ready
        asyncio.run(worker.run_job(job_id))
        return app.get_job(job_id)

    def test_sampling_and_count_jobs_report_a_missing_product_as_product_unavailable(self):
        for payload in ({'url': URL, 'max_comments': 300, 'sampling': sampling(policy_v1())},
                        {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}):
            with self.subTest(kind=payload.get('kind', 'sampling')):
                page = FakePage({'stop_reason': 'exhausted', 'error': None}, h1=0)
                job = self.run_job_with_page(payload, page)
                self.assertEqual((job['state'], job['error']), ('failed', 'PRODUCT_UNAVAILABLE'))
                self.assertEqual(page.crawls, 0, 'a dead product is never crawled')

    def test_a_stop_during_the_product_title_check_wins_over_product_unavailable(self):
        payload = {'url': URL, 'max_comments': 300, 'sampling': sampling(policy_v1())}
        for stop, expected in (('cancel', ('cancelled', None)), ('readonly', ('cancelled', 'READONLY_ON'))):
            with self.subTest(stop=stop):
                page, flags = FakePage({}, h1=0), {'readonly': False}

                def stop_during_title_check(job_id):
                    if stop == 'cancel':
                        self.app.update_job(job_id, cancel_requested=1)
                    else:
                        flags['readonly'] = True

                with mock.patch.object(self.app, 'sampling_readonly', lambda: flags['readonly']):
                    job = self.run_job_with_page(payload, page, during_title_check=stop_during_title_check)
                self.assertEqual((job['state'], job['error']), expected,
                                 'a stop that arrived during the title check is not a dead link')
                self.assertEqual(page.crawls, 0)

    def test_product_content_with_the_unavailable_phrase_is_still_a_product(self):
        payload = {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}
        page = FakePage({}, h1=1, headings=['Sản phẩm không tồn tại trong hình'],
                        body_text='Mô tả: sản phẩm không tồn tại trong hình. Hỏi đáp: không tìm thấy sản phẩm nào tốt hơn.')
        job = self.run_job_with_page(payload, page)
        self.assertEqual(job['state'], 'succeeded')
        self.assertEqual(page.crawls, 1, 'a valid product is collected, not skipped')

    def test_a_ratings_wait_timeout_reports_ratings_missing(self):
        payload = {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}
        page = FakePage({}, wait_error=TimeoutError('synthetic wait timeout'))
        job = self.run_job_with_page(payload, page)
        self.assertEqual((job['state'], job['error']), ('failed', 'RATINGS_MISSING'))
        self.assertEqual(page.crawls, 0)

    def test_a_session_that_changes_during_the_ratings_wait_stops_for_the_human(self):
        payload = {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}
        for body, state in (('Log in to continue', 'needs_login'), ('Please verify you are human', 'needs_verification')):
            with self.subTest(state=state):
                page = FakePage({}, wait_error=TimeoutError('synthetic wait timeout'), after_timeout=(body, URL))
                job = self.run_job_with_page(payload, page)
                self.assertEqual(job['state'], state)
                self.assertNotEqual(job['error'], 'RATINGS_MISSING')
                self.assertEqual(page.crawls, 0)

    def test_a_cancelled_ratings_wait_keeps_the_cancellation_state(self):
        payload = {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}
        page = FakePage({}, wait_error=TimeoutError('synthetic wait timeout'))
        job = self.run_job_with_page(payload, page,
                                     during_wait=lambda job_id: self.app.update_job(job_id, cancel_requested=1))
        self.assertEqual((job['state'], job['error']), ('cancelled', None))
        self.assertEqual(page.crawls, 0)

    def test_cancellation_during_session_observation_wins_over_the_timeout_classification(self):
        payload = {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}
        page = FakePage({}, wait_error=TimeoutError('synthetic wait timeout'))
        job = self.run_job_with_page(payload, page,
                                     during_observe=lambda job_id: self.app.update_job(job_id, cancel_requested=1))
        self.assertEqual((job['state'], job['error']), ('cancelled', None))
        self.assertEqual(page.crawls, 0)

    def test_other_sampling_failures_stay_source_action_failed(self):
        payload = {'url': URL, 'max_comments': 300, 'sampling': sampling(policy_v1())}
        page = FakePage({}, wait_error=RuntimeError('synthetic failure'))
        job = self.run_job_with_page(payload, page)
        self.assertEqual((job['state'], job['error']), ('failed', 'SOURCE_ACTION_FAILED'))

    def test_a_plain_job_keeps_todays_error_text_when_the_ratings_block_never_appears(self):
        page = FakePage({}, wait_error=TimeoutError('synthetic wait timeout'))
        job = self.run_job_with_page({'url': URL, 'max_comments': 20}, page)
        self.assertEqual(job['state'], 'failed')
        self.assertTrue(job['error'].startswith('TimeoutError:'), job['error'])

    def test_cancel_then_resume_executes_the_job_once_after_draining_stale_queue_items(self):
        app = self.app
        result = {'stop_reason': 'last_page', 'error': None,
                  'records': [{'id': 'review-1'}], 'pages': [{'page': 1}]}

        async def drain(worker):
            task = asyncio.create_task(worker.run())
            try:
                await asyncio.wait_for(worker.queue.join(), 5)
            finally:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

        async def scenario():
            worker = app.BrowserWorker()
            page = FakePage(result)
            worker.page = page
            worker.navigate_product = lambda _url: asyncio.sleep(0, result={'state': 'ready'})
            worker.ensure_browser = lambda: asyncio.sleep(0)
            with mock.patch.object(app, 'worker', worker):
                self.assertTrue(worker.queue.empty(), 'this scenario starts with its own idle worker')

                payload = app.JobInput.model_validate_json(json.dumps({'url': URL}))
                job = await app.create_job(payload)
                self.assertEqual((await app.cancel_job(job['id']))['state'], 'cancelled')
                self.assertEqual((await app.resume_job(job['id']))['state'], 'queued')
                self.assertEqual(worker.queue.qsize(), 2, 'cancel leaves the stale reference until the worker drains it')

                await drain(worker)
                self.assertEqual(page.crawls, 1, 'one created run executes exactly once after cancel and resume')
                final = app.get_job(job['id'])
                self.assertEqual(final['state'], 'succeeded')
                stored = json.loads((app.DATA / 'results' / f"{job['id']}.json").read_text(encoding='utf-8'))
                self.assertEqual((stored['job_id'], stored['complete']), (job['id'], True))
                self.assertEqual(stored['records'], result['records'])

                page.crawls = 0
                cancelled = await app.create_job(payload)
                self.assertEqual((await app.cancel_job(cancelled['id']))['state'], 'cancelled')
                await drain(worker)
                self.assertEqual(page.crawls, 0, 'a cancelled queued job without resume never runs')
                self.assertEqual(app.get_job(cancelled['id'])['state'], 'cancelled')
                self.assertFalse((app.DATA / 'results' / f"{cancelled['id']}.json").exists())

        asyncio.run(scenario())

    # Browser recovery (live 27/11: a job failed, the session check after it failed too, and the old Chrome kept the profile).
    COUNTS = {'kind': 'counts', 'url': URL, 'request_key': ATTEMPT}

    def failed_job_with_broken_session_check(self, context):
        """A count job fails, then the session check after it raises; returns the worker."""
        worker = self.app.BrowserWorker()
        worker.context = context

        def broken(_job_id):
            raise RuntimeError('synthetic session check failure')
        self.run_job_with_page(self.COUNTS, FakePage({}, wait_error=RuntimeError('synthetic failure')),
                               during_observe=broken, worker=worker)
        return worker

    def test_a_failed_job_whose_session_check_also_fails_closes_the_old_browser(self):
        context = FakeContext()
        worker = self.failed_job_with_broken_session_check(context)
        self.assertEqual(context.closes, 1, 'the old browser is closed, not just dropped')
        self.assertIsNone(worker.context)

    def test_a_close_that_fails_or_hangs_ends_only_the_processes_of_this_profile(self):
        app, profile = self.app, self.app.DATA / 'profile'

        async def hang(awaitable, timeout):
            awaitable.close()
            raise asyncio.TimeoutError()
        for case in ('fails', 'hangs'):
            with self.subTest(case=case):
                table = {101: ['chrome', f'--user-data-dir={profile}'],
                         102: ['chrome', f'--user-data-dir={profile}-old'],
                         103: ['chrome', '--user-data-dir=/tmp/another-profile'],
                         104: ['bash'], 105: []}
                kills = []

                def kill(pid, sig):
                    kills.append((pid, sig))
                    table.pop(pid, None)
                context = FakeContext(close_error=RuntimeError('synthetic close failure') if case == 'fails' else None)
                timeout = mock.patch.object(app.asyncio, 'wait_for', hang) if case == 'hangs' else suppress()
                started = time.monotonic()
                with mock.patch.object(app, 'read_cmdlines', lambda: dict(table), create=True), \
                        mock.patch.object(app.os, 'kill', kill), timeout:
                    worker = self.failed_job_with_broken_session_check(context)
                self.assertEqual(kills, [(101, signal.SIGTERM)], 'only the exact --user-data-dir of this profile is signalled')
                self.assertIsNone(worker.context)
                self.assertLess(time.monotonic() - started, 1)

    def test_a_stale_profile_lock_is_cleared_before_a_launch(self):
        app, profile, host = self.app, self.app.DATA / 'profile', socket.gethostname()
        names = ('SingletonLock', 'SingletonCookie', 'SingletonSocket')
        for case, target, live in (('dead pid on this host', f'{host}-424242', False),
                                   ('live browser of this profile', f'{host}-424243', True),
                                   ('another host', 'another-host-424244', False)):
            with self.subTest(case=case):
                shutil.rmtree(profile, ignore_errors=True)
                profile.mkdir(parents=True)
                os.symlink(target, profile / 'SingletonLock')
                os.symlink('synthetic-cookie', profile / 'SingletonCookie')
                os.symlink('/tmp/synthetic-socket', profile / 'SingletonSocket')
                pid = int(target.rsplit('-', 1)[1])
                table = {pid: ['chrome', f'--user-data-dir={profile}']} if live else {}
                kills, at_launch = [], {}

                def kill(killed, sig):
                    kills.append((killed, sig, os.path.lexists(profile / 'SingletonLock')))
                    table.pop(killed, None)

                async def launch(_path, **_):
                    at_launch.update({name: os.path.lexists(profile / name) for name in names})
                    return FakeContext(FakePage({}))
                with fake_cloakbrowser(launch), mock.patch.object(app, 'read_cmdlines', lambda: dict(table), create=True), \
                        mock.patch.object(app.os, 'kill', kill):
                    asyncio.run(app.BrowserWorker().ensure_browser())
                if case == 'another host':
                    self.assertEqual((kills, at_launch), ([], dict.fromkeys(names, True)), 'a lock from another host is left alone')
                else:
                    self.assertEqual(at_launch, dict.fromkeys(names, False), 'the lock files are gone before the launch')
                    self.assertEqual(kills, [(pid, signal.SIGTERM, True)] if live else [],
                                     'a live holder of this profile is ended first, then the files go')
        shutil.rmtree(profile, ignore_errors=True)

    def test_an_old_or_busy_browser_is_replaced_between_jobs_and_a_young_one_is_kept(self):
        app = self.app
        result = {'stop_reason': 'last_page', 'error': None, 'records': [], 'pages': [{'page': 1}]}

        async def scenario(started_ago, jobs_before, job_count):
            worker, old = app.BrowserWorker(), FakeContext()
            worker.context, worker.page = old, FakePage(result)
            worker.browser_started, worker.browser_jobs = time.monotonic() - started_ago, jobs_before
            seen = []

            async def navigate(_url):
                await worker.ensure_browser()
                seen.append(('old' if worker.context is old else 'new', old.closes))
                return {'state': 'ready'}
            worker.navigate_product = navigate

            async def launch(_path, **_):
                return FakeContext(FakePage(result))
            for _ in range(job_count):
                job_id = str(uuid.uuid4())
                with app.db() as connection:
                    connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                                       (job_id, json.dumps({'url': URL}), 'queued', app.now(), app.now()))
                worker.queue.put_nowait({'kind': 'job', 'job_id': job_id})
            with fake_cloakbrowser(launch), mock.patch.object(app, 'read_cmdlines', lambda: {}, create=True):
                task = asyncio.create_task(worker.run())
                try:
                    await asyncio.wait_for(worker.queue.join(), 5)
                finally:
                    task.cancel()
                    with suppress(asyncio.CancelledError):
                        await task
            return seen
        hours = 3600
        self.assertEqual(asyncio.run(scenario(6 * hours + 60, 0, 1)), [('new', 1)], 'older than 6 h: replaced before the job')
        self.assertEqual(asyncio.run(scenario(60, 199, 2)), [('old', 0), ('new', 1)],
                         'the 200th job runs on the open browser; it is replaced before the next job, never during one')
        self.assertEqual(asyncio.run(scenario(60, 0, 2)), [('old', 0), ('old', 0)], 'a young browser is kept')

    def test_a_failed_count_job_logs_its_real_exception_and_keeps_the_public_error(self):
        output = io.StringIO()
        with redirect_stdout(output):
            job = self.run_job_with_page(self.COUNTS, FakePage({}, wait_error=RuntimeError('synthetic failure')))
        self.assertIn(f"[job] {job['id']} RuntimeError: synthetic failure\n", output.getvalue())
        self.assertEqual((job['state'], job['error']), ('failed', 'SOURCE_ACTION_FAILED'))

    def test_deep_health_probes_the_open_browser_and_plain_health_keeps_its_keys(self):
        from fastapi.testclient import TestClient
        app, client = self.app, TestClient(self.app.app)
        auth = {'Authorization': f'Bearer {app.TOKEN}'}

        def health(worker, query='?deep=1'):
            with mock.patch.object(app, 'worker', worker):
                return client.get('/health' + query, headers=auth).json()

        def open_worker(page):
            worker = app.BrowserWorker()
            worker.context, worker.page = FakeContext(page), page
            return worker

        class BrokenPage(FakePage):
            async def evaluate(self, expression, arg=None):
                raise RuntimeError('synthetic dead page')

        self.assertEqual(client.get('/health?deep=1').status_code, 401, 'the deep check needs the token')
        busy = open_worker(FakePage({}))
        busy.active_job = 'job-active'
        self.assertEqual(health(busy).get('deep'), 'busy')

        async def refuse(_path, **_):
            raise RuntimeError('synthetic launch failure')
        failed = app.BrowserWorker()
        with fake_cloakbrowser(refuse), mock.patch.object(app, 'read_cmdlines', lambda: {}, create=True):
            with self.assertRaises(RuntimeError):
                asyncio.run(failed.ensure_browser())
        value = health(failed)
        self.assertEqual(value.get('deep'), 'failed')
        self.assertIn('RuntimeError: synthetic launch failure', value.get('browser_error') or '')
        self.assertEqual(health(open_worker(FakePage({}))).get('deep'), 'ok')
        self.assertEqual(health(open_worker(BrokenPage({}))).get('deep'), 'failed')
        plain = health(open_worker(FakePage({})), '')
        self.assertLessEqual({'status', 'browser', 'active_job', 'queued'}, set(plain))
        self.assertNotIn('deep', plain, 'plain /health does not probe the browser')


if __name__ == '__main__':
    unittest.main()

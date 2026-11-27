"""Contract tests for the review service job input and crawl state (page limit).

Run with the service's own Python environment (fastapi + pydantic from
requirements.lock.txt). No browser, Shopee page or network is used: the worker
gets a fake page that records the crawler config and returns a fixed result.
"""
import asyncio
from contextlib import ExitStack, redirect_stdout, suppress
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


class StubbornContext(FakeContext):
    """A close that never finishes and swallows every cancel until the test sets `released`."""
    released = False

    async def close(self):
        self.closes += 1
        while not self.released:
            try:
                await asyncio.sleep(0.01)
            except asyncio.CancelledError:
                pass


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

    def failed_job_with_broken_session_check(self, context, worker=None):
        """A count job fails, then the session check after it raises; returns the worker and the job."""
        worker = worker or self.app.BrowserWorker()
        worker.context = context

        def broken(_job_id):
            raise RuntimeError('synthetic session check failure')
        job = self.run_job_with_page(self.COUNTS, FakePage({}, wait_error=RuntimeError('synthetic failure')),
                                     during_observe=broken, worker=worker)
        return worker, job

    def test_a_failed_job_whose_session_check_also_fails_closes_the_old_browser(self):
        context = FakeContext()
        worker, _job = self.failed_job_with_broken_session_check(context)
        self.assertEqual(context.closes, 1, 'the old browser is closed, not just dropped')
        self.assertIsNone(worker.context)

    def processes(self, table, reused_on_open=None, observe=tuple):
        """Patches /proc reads, pidfds and os.kill. `table` is what /proc shows now; a PID in `reused_on_open`
        gets that command line right after its pidfd opens. Each signal is logged as (pid, sig, 'pidfd'|'kill', *observe())."""
        app, kills, held, closed, reused = self.app, [], {}, set(), reused_on_open or {}
        real_close = os.close

        def pidfd_open(pid, *_flags):
            if pid not in table:
                raise ProcessLookupError(pid)
            fd = os.open(os.devnull, os.O_RDONLY)
            held[fd] = pid
            if pid in reused:
                table[pid] = reused[pid]
            return fd

        def pidfd_send_signal(fd, sig, *_rest):
            kills.append((held[fd], sig, 'pidfd', *observe()))
            table.pop(held[fd], None)

        def kill(pid, sig):
            kills.append((pid, sig, 'kill', *observe()))
            table.pop(pid, None)

        def close(fd):
            if fd in held:
                closed.add(fd)
            real_close(fd)
        stack = ExitStack()
        for target, name, value in ((app, 'read_cmdlines', lambda: dict(table)),
                                    (app, 'read_cmdline', lambda pid: list(table.get(int(pid), []))),
                                    (app.os, 'pidfd_open', pidfd_open), (signal, 'pidfd_send_signal', pidfd_send_signal),
                                    (app.os, 'kill', kill), (app.os, 'close', close)):
            stack.enter_context(mock.patch.object(target, name, value, create=True))
        self.addCleanup(lambda: self.assertEqual(set(held), closed, 'every pidfd is closed'))
        return kills, stack

    def test_a_close_that_fails_signals_only_this_profiles_browser_through_its_pidfd(self):
        profile = self.app.DATA / 'profile'
        flag = f'--user-data-dir={profile}'
        table = {101: ['/opt/cloakbrowser/chrome', flag, '--headless=new'],
                 102: ['/usr/bin/python3', 'helper.py', flag],                       # not a browser
                 103: ['/opt/cloakbrowser/chrome', flag],                            # PID reused after its pidfd opened
                 104: ['/opt/cloakbrowser/chrome', f'{flag}-old'],
                 105: ['/opt/cloakbrowser/chrome', '--user-data-dir=/tmp/another-profile'],
                 106: ['bash'], 107: []}
        kills, patched = self.processes(table, reused_on_open={103: ['/usr/bin/sleep', '1000']})
        started = time.monotonic()
        with patched:
            worker, _job = self.failed_job_with_broken_session_check(FakeContext(close_error=RuntimeError('synthetic close failure')))
        self.assertEqual(kills, [(101, signal.SIGTERM, 'pidfd')],
                         'only a Chromium binary with the exact profile argument, checked after its pidfd opened, is signalled')
        self.assertIsNone(worker.context)
        self.assertLess(time.monotonic() - started, 1)

    def test_a_failed_cleanup_after_a_failed_job_still_ends_the_job_failed(self):
        def scan_fails():
            raise PermissionError('synthetic /proc scan failure')
        output = io.StringIO()
        with mock.patch.object(self.app, 'read_cmdlines', scan_fails, create=True), redirect_stdout(output):
            _worker, job = self.failed_job_with_broken_session_check(FakeContext(close_error=RuntimeError('synthetic close failure')))
        self.assertEqual((job['state'], job['error']), ('failed', 'SOURCE_ACTION_FAILED'), 'the job is not left running')
        self.assertIn('[browser] reset failed: PermissionError: synthetic /proc scan failure', output.getvalue())

    def test_a_close_that_ignores_cancellation_still_frees_the_worker_within_the_limit(self):
        app, profile = self.app, self.app.DATA / 'profile'
        kills, patched = self.processes({101: ['/opt/cloakbrowser/chrome', f'--user-data-dir={profile}']})
        real_wait, real_wait_for, limit = asyncio.wait, asyncio.wait_for, 0.05

        # The 10 s close limit, shortened so the test is fast; the close never finishes and swallows every cancel.
        async def wait(fs, *, timeout=None, return_when=asyncio.ALL_COMPLETED):
            return await real_wait(fs, timeout=limit if timeout is None else min(timeout, limit), return_when=return_when)

        async def wait_for(awaitable, timeout):
            return await real_wait_for(awaitable, limit if timeout is None else min(timeout, limit))
        context, worker, freed = StubbornContext(), app.BrowserWorker(), []
        original = worker.run_job

        async def timed(job_id):
            started = time.monotonic()
            try:
                await original(job_id)
            finally:
                freed.append(time.monotonic() - started)
                context.released = True
        worker.run_job = timed
        started = time.monotonic()
        with patched, mock.patch.object(app.asyncio, 'wait', wait), \
                mock.patch.object(app.asyncio, 'wait_for', wait_for):
            self.failed_job_with_broken_session_check(context, worker)
        self.assertEqual(context.closes, 1)
        self.assertLess(freed[0], 1, 'the worker does not wait for a close that ignores cancellation')
        self.assertEqual(kills, [(101, signal.SIGTERM, 'pidfd')], 'the browser of this profile is killed instead')
        self.assertIsNone(worker.context)
        self.assertLess(time.monotonic() - started, 2)

    def test_a_close_cancelled_midway_still_ends_this_profiles_browser_and_the_cancel_propagates(self):
        profile = self.app.DATA / 'profile'
        kills, patched = self.processes({101: ['/opt/cloakbrowser/chrome', f'--user-data-dir={profile}']})
        context, worker = StubbornContext(), self.app.BrowserWorker()
        original = worker.run_job

        async def cancelled_during_close(job_id):
            task = asyncio.ensure_future(original(job_id))
            try:
                for _ in range(100):
                    if context.closes or task.done():
                        break
                    await asyncio.sleep(0.01)
                task.cancel()   # the service shuts down while the close runs
                await task
            finally:
                context.released = True
        worker.run_job = cancelled_during_close
        with patched, self.assertRaises(asyncio.CancelledError):
            self.failed_job_with_broken_session_check(context, worker)
        self.assertEqual(kills, [(101, signal.SIGTERM, 'pidfd')])

    def test_a_renewal_that_raises_still_runs_the_dequeued_job(self):
        app = self.app
        worker = app.BrowserWorker()
        worker.context = FakeContext(FakePage(self.RESULT), close_error=RuntimeError('synthetic close failure'))
        worker.page = FakePage(self.RESULT)
        worker.browser_started, worker.browser_jobs = time.monotonic(), 200
        [job_id] = self.queue_jobs(worker, 1)

        def scan_fails():
            raise PermissionError('synthetic /proc scan failure')
        output = io.StringIO()
        with redirect_stdout(output):
            self.drain_with_launches(worker, cmdlines=scan_fails)
        self.assertIn(app.get_job(job_id)['state'], app.TERMINAL, 'the job ran to an end, it is not left queued')
        self.assertIn('[browser] renew failed', output.getvalue())

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
                kills, patched = self.processes(table, observe=lambda: (os.path.lexists(profile / 'SingletonLock'),))
                at_launch = {}

                async def launch(_path, **_):
                    at_launch.update({name: os.path.lexists(profile / name) for name in names})
                    return FakeContext(FakePage({}))
                with fake_cloakbrowser(launch), patched:
                    asyncio.run(app.BrowserWorker().ensure_browser())
                if case == 'another host':
                    self.assertEqual((kills, at_launch), ([], dict.fromkeys(names, True)), 'a lock from another host is left alone')
                else:
                    self.assertEqual(at_launch, dict.fromkeys(names, False), 'the lock files are gone before the launch')
                    self.assertEqual(kills, [(pid, signal.SIGTERM, 'pidfd', True)] if live else [],
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

        class JobStartsDuringProbe(FakePage):
            async def evaluate(self, expression, arg=None):
                started.active_job = 'job-started-during-probe'
                raise RuntimeError('synthetic navigation during the probe')
        started = open_worker(JobStartsDuringProbe({}))
        self.assertEqual(health(started).get('deep'), 'busy', 'a job that started during the probe is busy, not failed')
        self.assertTrue(started.queue.empty(), 'a busy probe queues no recovery')
        plain = health(open_worker(FakePage({})), '')
        self.assertLessEqual({'status', 'browser', 'active_job', 'queued'}, set(plain))
        self.assertNotIn('deep', plain, 'plain /health does not probe the browser')

    RESULT = {'stop_reason': 'last_page', 'error': None, 'records': [], 'pages': [{'page': 1}]}

    def queue_jobs(self, worker, count):
        app, ids = self.app, []
        for _ in range(count):
            job_id = str(uuid.uuid4())
            with app.db() as connection:
                connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                                   (job_id, json.dumps({'url': URL}), 'queued', app.now(), app.now()))
            worker.queue.put_nowait({'kind': 'job', 'job_id': job_id})
            ids.append(job_id)
        return ids

    def drain_with_launches(self, worker, cmdlines=lambda: {}):
        """Runs the worker until its queue is empty; each launch gives a new FakeContext. Returns (launched, seen)."""
        app, launched, seen = self.app, [], []

        async def launch(_path, **_):
            launched.append(FakeContext(FakePage(self.RESULT)))
            return launched[-1]

        async def navigate(_url):
            await worker.ensure_browser()
            seen.append(worker.context)
            return {'state': 'ready'}
        worker.navigate_product = navigate

        async def scenario():
            task = asyncio.create_task(worker.run())
            try:
                await asyncio.wait_for(worker.queue.join(), 30)
            finally:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        with fake_cloakbrowser(launch), mock.patch.object(app, 'read_cmdlines', cmdlines, create=True):
            asyncio.run(scenario())
        return launched, seen

    def test_a_failed_idle_probe_queues_one_recovery_that_the_worker_runs_between_jobs(self):
        from fastapi.testclient import TestClient
        app, client = self.app, TestClient(self.app.app)

        class DeadProbePage(FakePage):
            async def evaluate(self, expression, arg=None):
                if expression == '1':
                    raise RuntimeError('synthetic dead page')
                return await super().evaluate(expression, arg)
        worker, old = app.BrowserWorker(), FakeContext()
        worker.context, worker.page = old, DeadProbePage(self.RESULT)
        self.queue_jobs(worker, 1)
        with mock.patch.object(app, 'worker', worker):
            for _ in range(2):
                self.assertEqual(client.get('/health?deep=1', headers={'Authorization': f'Bearer {app.TOKEN}'}).json().get('deep'), 'failed')
        self.assertEqual([item['kind'] for item in list(worker.queue._queue)], ['job', 'recover'], 'two failed probes queue one recovery')
        closes_during_job = []
        original = worker.run_job

        async def run_job(job_id):
            closes_during_job.append(old.closes)
            await original(job_id)
            closes_during_job.append(old.closes)
        worker.run_job = run_job
        launched, seen = self.drain_with_launches(worker)
        self.assertEqual((seen, closes_during_job), ([old], [0, 0]), 'the queued job runs whole on the open browser')
        self.assertEqual((old.closes, len(launched), worker.context is launched[0]), (1, 1, True),
                         'after the job, the recovery closes the old browser and launches a new one')

    def test_the_first_job_on_a_fresh_browser_counts_so_renewal_comes_after_200_jobs(self):
        worker, old = self.app.BrowserWorker(), FakeContext()
        worker.context, worker.page = old, FakePage(self.RESULT)
        worker.browser_started, worker.browser_jobs = time.monotonic(), 200
        worker.queue = asyncio.Queue()   # 201 jobs in one go; the service queue holds 20
        self.queue_jobs(worker, 201)
        launched, seen = self.drain_with_launches(worker)
        self.assertEqual(len(launched), 2, 'the due browser is renewed, then its successor after its own 200 jobs')
        self.assertEqual([seen.count(context) for context in launched], [200, 1])


if __name__ == '__main__':
    unittest.main()

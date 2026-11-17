"""Step 1 on the user's own Chrome: listener, frozen filter, import payload, bridge.

Offline only. Tabs are fakes that record every CDP method; no Chrome, Metric, Shopee or
Jev is reached. The real-Chrome check is test_metric_browser_cdp.py.
"""
import base64
import json
import pathlib
import re
import sys
import tempfile
import threading
import time
import unittest
import uuid
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_metric_browser as mb  # noqa: E402
import tdn_shopee_app  # noqa: E402

PRODUCTS = 'https://apiv4.metric.vn/v2/market/analytics/products/'
POLICY = {'mode': 'with-comments', 'stars': [], 'totalPerLink': 300, 'allocation': 'pooled'}


def page_body(**extra):
    body = {
        'start_date': '20261001', 'end_date': '20261031',
        'include_query': {'queries': ['canxi'], 'is_smart_queries': True, 'bee_categories': ['c1'],
                          'platforms': [1, 2], 'official_types': [1, 0], 'brands': [],
                          'is_remove_bad_product': True, 'composite_compare_lst': [[]]},
        'exclude_query': {'queries': [], 'is_smart_queries': False},
        'use_ai_normalized': False, 'is_filter_gift': True, 'notIncludeDeletedProduct': True,
        'page': 2, 'limit': 20, 'sort_by': 'sold_custom__desc', 'fields': None,
    }
    body.update(extra)
    return body


def products(n):
    return [{'product_base_id': f'1__{i}', 'revenue_custom': 1000 - i} for i in range(n)]


class FakeTab:
    """Records CDP calls. `answers` maps a method to a value or a callable(**params)."""
    created = []

    def __init__(self, target, answers=None):
        self.id = target['id']
        self.target = target
        self.calls = []
        self.listeners = {}
        self.started = False
        self.stopped = False
        self.answers = answers or {}
        FakeTab.created.append(self)

    def set_listener(self, event, callback):
        self.listeners[event] = callback

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def call_method(self, method, **params):
        params.pop('_timeout', None)
        self.calls.append((method, params))
        answer = self.answers.get(method, {})
        return answer(**params) if callable(answer) else answer

    def methods(self):
        return [m for m, _ in self.calls]

    def emit(self, **event):
        self.listeners['Network.requestWillBeSent'](**event)

    def products_request(self, body, request_id='r1', inline=True):
        request = {'url': PRODUCTS, 'method': 'POST'}
        if inline:
            request['postData'] = json.dumps(body)
        else:
            request['hasPostData'] = True
        self.emit(requestId=request_id, request=request, type='Fetch', frameId=self.id)


def target(tid, url, kind='page'):
    return {'id': tid, 'type': kind, 'url': url, 'webSocketDebuggerUrl': f'ws://127.0.0.1:1/devtools/page/{tid}'}


class World:
    """A fake /json/list plus the tabs the listener created."""

    def __init__(self, targets, answers=None):
        self.targets = targets
        self.answers = answers or {}
        self.now = 0.0
        self.tabs = []

    def factory(self, t):
        tab = FakeTab(t, self.answers)
        self.tabs.append(tab)
        return tab

    def listener(self):
        return mb.MetricListener(9, tab_factory=self.factory, list_targets=lambda: self.targets,
                                 clock=lambda: self.now)

    def live(self, tid):
        return [t for t in self.tabs if t.id == tid and not t.stopped]


class HostFilterTest(unittest.TestCase):
    def test_only_metric_page_targets_are_attached(self):
        world = World([
            target('a', 'https://metric.vn/analytics'),
            target('b', 'https://www.metric.vn/analytics/products'),
            target('c', 'https://accounts.google.com/signin'),
            target('d', 'https://metric.vn.example.com/'),
            target('e', 'https://metric.vn/sw.js', kind='service_worker'),
            target('f', 'https://metric.vn/frame', kind='iframe'),
            target('g', 'chrome://newtab/'),
            target('h', 'https://apiv4.metric.vn/x'),
        ])
        listener = world.listener()
        self.assertTrue(listener.poll())
        self.assertEqual(listener.attached_ids(), ['a', 'b'])
        for tab in world.tabs:
            self.assertEqual(tab.methods(), ['Network.enable'])
            self.assertTrue(tab.started)

    def test_a_new_metric_tab_is_attached_on_the_next_poll_and_a_closed_one_is_dropped(self):
        world = World([target('a', 'https://metric.vn/analytics')])
        listener = world.listener()
        listener.poll()
        world.targets = world.targets + [target('b', 'https://metric.vn/analytics')]
        listener.poll()
        self.assertEqual(listener.attached_ids(), ['a', 'b'])
        world.targets = [target('b', 'https://metric.vn/analytics')]
        listener.poll()
        self.assertEqual(listener.attached_ids(), ['b'])
        self.assertTrue(world.tabs[0].stopped)

    def test_chrome_gone_stops_every_tab(self):
        world = World([target('a', 'https://metric.vn/analytics')])
        listener = world.listener()
        listener.poll()

        def gone():
            raise OSError('refused')
        listener._list_targets = gone
        self.assertFalse(listener.poll())
        self.assertFalse(listener.chrome_open)
        self.assertTrue(world.tabs[0].stopped)

    def test_fresh_chrome_attaches_to_blank_before_navigating(self):
        world = World([target('x', 'chrome://newtab/'), target('a', 'about:blank')])
        listener = world.listener()
        self.assertTrue(listener.attach_blank_and_open())
        tab = world.tabs[0]
        self.assertEqual(tab.id, 'a')
        self.assertEqual(tab.calls, [('Network.enable', {}), ('Page.navigate', {'url': 'https://metric.vn/analytics'})])
        self.assertIn('Network.requestWillBeSent', tab.listeners)


class LifecycleTest(unittest.TestCase):
    """stop_all() is final, even while a poll pass is waiting on /json/list."""

    def blocked_world(self):
        world = World([])
        listing = threading.Event()
        release = threading.Event()

        def list_targets():
            listing.set()
            release.wait(5)
            return [target('a', 'https://metric.vn/analytics')]
        listener = mb.MetricListener(9, tab_factory=world.factory, list_targets=list_targets,
                                     clock=lambda: world.now)
        return world, listener, listing, release

    def test_a_poll_in_flight_cannot_attach_after_stop_all(self):
        world, listener, listing, release = self.blocked_world()
        listener.start(interval=0.01)
        self.assertTrue(listing.wait(5))
        stopper = threading.Thread(target=listener.stop_all)
        stopper.start()
        time.sleep(0.05)
        release.set()            # the pending pass now sees a Metric tab
        stopper.join(10)
        self.assertFalse(stopper.is_alive())
        self.assertFalse(listener._thread.is_alive())   # poll drained
        self.assertEqual(listener.attached_ids(), [])
        self.assertTrue(all(tab.stopped or not tab.started for tab in world.tabs))
        self.assertFalse(listener.poll())
        listener.start()
        self.assertFalse(listener._thread.is_alive())
        self.assertIsNone(listener._attach(target('b', 'https://metric.vn/analytics')))

    def test_an_attach_racing_stop_all_stops_its_own_connection(self):
        world = World([])
        listener = world.listener()
        started = threading.Event()
        proceed = threading.Event()

        def factory(t):
            tab = FakeTab(t)
            original = tab.start

            def start():
                original()
                started.set()
                proceed.wait(5)      # stop_all runs while this connection is being opened
            tab.start = start
            world.tabs.append(tab)
            return tab
        listener._tab_factory = factory
        attaching = threading.Thread(target=lambda: listener._attach(target('a', 'https://metric.vn/x')))
        attaching.start()
        self.assertTrue(started.wait(5))
        listener.stop_all()
        proceed.set()
        attaching.join(5)
        self.assertEqual(listener.attached_ids(), [])
        self.assertTrue(world.tabs[0].stopped)
        self.assertEqual(world.tabs[0].methods(), [])   # never Network.enable

    def test_session_confirmed_drains_and_a_new_open_gets_a_new_listener(self):
        world, listener, listing, release = self.blocked_world()
        launcher = mock.Mock(is_alive=lambda port: True, saved_port=lambda: 9)
        launcher.open_chrome.return_value = {'port': 9, 'browserName': 'Google Chrome', 'reused': True}
        made = []

        def factory(port):
            made.append(mb.MetricListener(port, tab_factory=world.factory,
                                          list_targets=lambda: [target('a', 'https://metric.vn/analytics')]))
            return made[-1]
        session = mb.MetricSession(tempfile.gettempdir(), launcher=launcher, listener_factory=factory)
        session.listener = listener
        listener.start(interval=0.01)
        self.assertTrue(listing.wait(5))
        stopper = threading.Thread(target=session.confirmed)
        stopper.start()
        time.sleep(0.05)
        release.set()
        stopper.join(10)
        self.assertIsNone(session.listener)
        self.assertTrue(listener.closed)
        self.assertEqual(listener.attached_ids(), [])
        session.open_metric()                       # «Mở Metric» again: a fresh listener
        self.assertEqual(len(made), 1)
        self.assertIs(session.listener, made[0])
        self.assertEqual(made[0].attached_ids(), ['a'])
        session.close()
        self.assertEqual(made[0].attached_ids(), [])


class DetachTest(unittest.TestCase):
    def setUp(self):
        self.world = World([target('a', 'https://metric.vn/analytics')])
        self.listener = self.world.listener()
        self.listener.poll()
        self.tab = self.world.tabs[0]
        self.tab.products_request(page_body())

    def leave(self, url='https://accounts.google.com/o/oauth2'):
        self.tab.emit(requestId='n', type='Document', frameId='a', request={'url': url, 'method': 'GET'})

    def test_main_frame_leaving_metric_detaches_at_once_and_keeps_the_filter(self):
        self.leave()
        self.assertTrue(self.tab.stopped)
        self.assertEqual(self.listener.attached_ids(), [])
        self.assertEqual(self.listener.latest()['body'], page_body())

    def test_a_subframe_or_metric_navigation_does_not_detach(self):
        self.tab.emit(requestId='s', type='Document', frameId='child', request={'url': 'https://accounts.google.com/x'})
        self.tab.emit(requestId='m', type='Document', frameId='a', request={'url': 'https://www.metric.vn/analytics'})
        self.assertFalse(self.tab.stopped)

    def test_reattach_only_after_the_tab_is_seen_away_and_back(self):
        self.leave()
        self.listener.poll()                     # navigation not committed: list still says Metric
        self.assertEqual(self.listener.attached_ids(), [])
        self.world.targets = [target('a', 'https://accounts.google.com/signin')]
        self.listener.poll()
        self.assertEqual(self.listener.attached_ids(), [])
        self.world.targets = [target('a', 'https://metric.vn/analytics')]
        self.listener.poll()
        self.assertEqual(self.listener.attached_ids(), ['a'])
        self.assertEqual(len(self.world.tabs), 2)
        self.assertIsNot(self.world.tabs[1], self.tab)
        self.assertEqual(self.listener.latest()['body'], page_body())

    def test_a_cancelled_navigation_reattaches_after_the_grace_time(self):
        self.leave()
        self.world.now = mb.REATTACH_GRACE_SECONDS + 1
        self.listener.poll()
        self.assertEqual(self.listener.attached_ids(), ['a'])

    def test_a_tab_seen_off_metric_by_the_poll_is_detached(self):
        self.world.targets = [target('a', 'https://example.com/')]
        self.listener.poll()
        self.assertTrue(self.tab.stopped)

    def test_events_from_a_stopped_tab_are_ignored(self):
        self.leave()
        self.tab.products_request(page_body(end_date='20261030'))
        self.assertEqual(self.listener.latest()['body']['end_date'], '20261031')


class ProductsRequestTest(unittest.TestCase):
    def setUp(self):
        self.world = World([target('a', 'https://metric.vn/analytics'), target('b', 'https://metric.vn/analytics')],
                           answers={'Network.getRequestPostData': lambda requestId: {'postData': json.dumps(page_body(end_date='20261020'))}})
        self.listener = self.world.listener()
        self.listener.poll()
        self.a, self.b = self.world.tabs

    def test_inline_post_data_is_kept_per_tab_and_the_newest_wins(self):
        self.a.products_request(page_body())
        self.b.products_request(page_body(start_date='20260901'))
        latest = self.listener.latest()
        self.assertEqual((latest['targetId'], latest['body']['start_date']), ('b', '20260901'))
        self.a.products_request(page_body(start_date='20260801'))
        self.assertEqual(self.listener.latest()['targetId'], 'a')

    def test_missing_body_is_read_with_get_request_post_data(self):
        self.a.products_request(None, request_id='big', inline=False)
        self.assertIn(('Network.getRequestPostData', {'requestId': 'big'}), self.a.calls)
        self.assertEqual(self.listener.latest()['body']['end_date'], '20261020')

    def test_other_requests_are_ignored(self):
        for request in ({'url': PRODUCTS, 'method': 'GET'},
                        {'url': PRODUCTS.replace('products', 'shops'), 'method': 'POST', 'postData': '{}'},
                        {'url': PRODUCTS + '?x=1', 'method': 'POST', 'postData': '{}'},
                        {'url': PRODUCTS, 'method': 'POST', 'postData': 'not json'},
                        {'url': PRODUCTS, 'method': 'POST', 'postData': '[1]'}):
            self.a.emit(requestId='z', type='Fetch', frameId='a', request=request)
        self.assertIsNone(self.listener.latest())

    def top100_evaluate(self, tab, emit=True):
        """A fake in-page call that (optionally) sends the app's own request on `tab`."""
        def evaluate(expression, awaitPromise, returnByValue):
            arg = json.loads(expression[expression.index(')({') + 2:-1])
            if emit:
                tab.products_request(arg['requestBody'], request_id='app-1')
                return {'result': {'value': {'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200,
                                             'requestBody': arg['requestBody'],
                                             'body': {'status': 'success', 'data': {'products': []}}}}}
            return {'result': {'value': {'stop': 'CAPTURE_LOGIN_REQUIRED'}}}
        tab.answers['Runtime.evaluate'] = evaluate

    def test_the_apps_own_request_is_ignored_only_during_its_invocation(self):
        self.a.products_request(page_body())
        frozen = self.listener.freeze()
        self.top100_evaluate(self.a)
        self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertEqual(self.listener.latest()['body'], page_body())   # own request not taken
        self.assertEqual(self.listener._own, {})
        # Afterwards the user views exactly that top-100 filter: it is recorded, on either tab.
        top = mb.top_products_body(page_body())
        self.b.products_request(top, request_id='user-b')
        self.assertEqual((self.listener.latest()['targetId'], self.listener.latest()['body']), ('b', top))
        self.a.products_request(top, request_id='user-a')
        self.assertEqual(self.listener.latest()['targetId'], 'a')

    def test_a_failed_capture_leaves_no_suppression_behind(self):
        filter_a = page_body(start_date='20260901')
        self.a.products_request(filter_a)
        frozen = self.listener.freeze()
        self.top100_evaluate(self.a, emit=False)
        with self.assertRaises(mb.MetricFailure):
            self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertEqual(self.listener._own, {})
        self.b.products_request(page_body(start_date='20260801'))             # user views B
        self.a.products_request(mb.top_products_body(filter_a), request_id='u')  # then A again, top-100 view
        self.assertEqual(self.listener.latest()['body'], mb.top_products_body(filter_a))

    def test_suppression_covers_only_the_invocation_tab(self):
        self.a.products_request(page_body())
        frozen = self.listener.freeze()
        top = mb.top_products_body(page_body())

        def evaluate(expression, awaitPromise, returnByValue):
            self.b.products_request(top, request_id='user-b')       # user on tab b, same moment
            return {'result': {'value': {'stop': 'CAPTURE_LOGIN_REQUIRED'}}}
        self.a.answers['Runtime.evaluate'] = evaluate
        with self.assertRaises(mb.MetricFailure):
            self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertEqual(self.listener.latest()['targetId'], 'b')

    def test_suppression_waits_for_queued_events_before_ending(self):
        self.a.products_request(page_body())
        frozen = self.listener.freeze()
        top = mb.top_products_body(page_body())
        queued = []

        def evaluate(expression, awaitPromise, returnByValue):
            queued.append(lambda: self.a.products_request(top, request_id='app-1'))  # still in the queue
            return {'result': {'value': {'urlPath': PRODUCTS[len('https://apiv4.metric.vn'):], 'method': 'POST',
                                         'status': 200, 'requestBody': top,
                                         'body': {'status': 'success', 'data': {'products': []}}}}}
        self.a.answers['Runtime.evaluate'] = evaluate
        self.a.drain_events = lambda timeout: [event() for event in queued]
        self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertEqual(self.listener.latest()['body'], page_body())

    def test_a_delayed_older_body_never_replaces_a_newer_request(self):
        release = threading.Event()
        entered = threading.Event()

        def slow_body(requestId):
            entered.set()
            release.wait(5)
            return {'postData': json.dumps(page_body(end_date='20261001'))}   # older filter, tab a
        self.a.answers['Network.getRequestPostData'] = slow_body
        older = threading.Thread(target=lambda: self.a.emit(
            requestId='old', type='Fetch', frameId='a', timestamp=100.0,
            request={'url': PRODUCTS, 'method': 'POST', 'hasPostData': True}))
        older.start()
        self.assertTrue(entered.wait(5))
        self.b.emit(requestId='new', type='Fetch', frameId='b', timestamp=101.0,
                    request={'url': PRODUCTS, 'method': 'POST', 'postData': json.dumps(page_body(end_date='20261031'))})
        self.assertEqual(self.listener.latest()['targetId'], 'b')
        release.set()
        older.join(5)
        latest = self.listener.latest()
        self.assertEqual((latest['targetId'], latest['body']['end_date']), ('b', '20261031'))

    def test_without_timestamps_the_order_is_the_order_received(self):
        release = threading.Event()
        self.a.answers['Network.getRequestPostData'] = lambda requestId: (
            release.wait(5), {'postData': json.dumps(page_body(end_date='20261001'))})[1]
        older = threading.Thread(target=lambda: self.a.products_request(None, request_id='old', inline=False))
        older.start()
        time.sleep(0.05)
        self.b.products_request(page_body(end_date='20261031'), request_id='new')
        release.set()
        older.join(5)
        self.assertEqual(self.listener.latest()['targetId'], 'b')

    def test_an_older_event_on_the_same_tab_does_not_replace_a_newer_one(self):
        self.a.emit(requestId='2', type='Fetch', frameId='a', timestamp=50.0,
                    request={'url': PRODUCTS, 'method': 'POST', 'postData': json.dumps(page_body(end_date='20261031'))})
        self.a.emit(requestId='1', type='Fetch', frameId='a', timestamp=40.0,
                    request={'url': PRODUCTS, 'method': 'POST', 'postData': json.dumps(page_body(end_date='20261001'))})
        self.assertEqual(self.listener.latest()['body']['end_date'], '20261031')

    def test_runtime_enable_is_never_sent(self):
        self.a.products_request(page_body())
        frozen = self.listener.freeze()
        self.a.answers['Runtime.evaluate'] = {'result': {'type': 'object', 'value': {'stop': 'CAPTURE_LOGIN_REQUIRED'}}}
        with self.assertRaises(mb.MetricFailure):
            self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        for tab in self.world.tabs:
            self.assertNotIn('Runtime.enable', tab.methods())


class FreezeAndRequestTest(unittest.TestCase):
    SOURCE = 'async function requestV3InPage({ urlPath, requestBody }) { return 1; }'

    def setUp(self):
        self.world = World([target('a', 'https://metric.vn/analytics')])
        self.listener = self.world.listener()
        self.listener.poll()
        self.tab = self.world.tabs[0]

    def test_nothing_seen_refuses(self):
        with self.assertRaises(mb.MetricFailure) as caught:
            self.listener.freeze()
        self.assertEqual(caught.exception.code, 'METRIC_NOT_SEEN')

    def test_the_click_freezes_the_filter_and_only_limit_page_sort_change(self):
        self.tab.products_request(page_body())
        frozen = self.listener.freeze()
        self.tab.products_request(page_body(start_date='20200101'))   # after the click
        seen = {}

        def evaluate(expression, awaitPromise, returnByValue):
            seen.update(expression=expression, awaitPromise=awaitPromise, returnByValue=returnByValue)
            arg = json.loads(expression[len('(' + self.SOURCE + ')('):-1])
            return {'result': {'type': 'object', 'value': {
                'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200, 'requestBody': arg['requestBody'],
                'body': {'status': 'success', 'data': {'products': products(3)}}}}}
        self.tab.answers['Runtime.evaluate'] = evaluate
        response = self.listener.fetch_top_products(frozen, self.SOURCE)
        self.assertTrue(seen['awaitPromise'] and seen['returnByValue'])
        sent = response['requestBody']
        expected = dict(page_body(), limit=100, page=0, sort_by='revenue_custom__desc')
        self.assertEqual(sent, expected)
        self.assertEqual(json.dumps(sent, sort_keys=True), json.dumps(expected, sort_keys=True))
        self.assertEqual(response['urlPath'], '/v2/market/analytics/products/')

    def test_a_page_stop_code_takes_a_screenshot_into_the_evidence_folder(self):
        self.tab.products_request(page_body())
        frozen = self.listener.freeze()
        self.tab.answers['Runtime.evaluate'] = {'result': {'value': {'stop': 'CAPTURE_PAGE_SESSION_UNAVAILABLE'}}}
        self.tab.answers['Page.captureScreenshot'] = {'data': base64.b64encode(b'\x89PNG fake').decode()}
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(mb.MetricFailure) as caught:
                self.listener.fetch_top_products(frozen, self.SOURCE, screenshot_dir=folder)
            files = list(pathlib.Path(folder).iterdir())
            self.assertEqual(len(files), 1)
            self.assertRegex(files[0].name, r'^metric-loi_\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.png$')
            self.assertEqual(files[0].read_bytes(), b'\x89PNG fake')
        self.assertEqual(caught.exception.code, 'CAPTURE_PAGE_SESSION_UNAVAILABLE')
        self.assertEqual(caught.exception.detail, {'screenshotSaved': True})

    def test_no_screenshot_on_success_and_a_detached_tab_is_refused(self):
        self.tab.products_request(page_body())
        frozen = self.listener.freeze()
        self.tab.emit(requestId='n', type='Document', frameId='a', request={'url': 'https://accounts.google.com/'})
        with self.assertRaises(mb.MetricFailure) as caught:
            self.listener.fetch_top_products(frozen, self.SOURCE)
        self.assertEqual(caught.exception.code, 'METRIC_TAB_GONE')
        self.assertNotIn('Page.captureScreenshot', self.tab.methods())


class PayloadContractTest(unittest.TestCase):
    def response(self, n=5, scope=None):
        scope = mb.scope_of(page_body()) if scope is None else scope
        return {'urlPath': '/v2/market/analytics/products/', 'method': 'POST', 'status': 200,
                'requestBody': dict(scope, limit=100, page=0, sort_by='revenue_custom__desc'),
                'body': {'status': 'success', 'data': {'products': products(n)}}}

    def build(self, **overrides):
        scope = mb.scope_of(page_body())
        values = dict(import_id=str(uuid.uuid4()), keyword='canxi', captured_at='2026-11-17T15:00:00.000Z',
                      collection_policy=POLICY, scope=scope, response=self.response(scope=scope))
        values.update(overrides)
        return mb.build_import_payload(**values)

    def code(self, **overrides):
        with self.assertRaises(mb.MetricFailure) as caught:
            self.build(**overrides)
        return caught.exception.code

    def test_payload_has_exactly_the_contract_shape(self):
        payload = self.build()
        self.assertEqual(set(payload), {'format', 'importId', 'keyword', 'capturedAt', 'collectionPolicy', 'scope', 'response'})
        self.assertEqual(payload['format'], 'metric-user-page-import-v1')
        self.assertRegex(payload['importId'], r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
        self.assertEqual(set(payload['response']), {'urlPath', 'method', 'status', 'requestBody', 'body'})
        self.assertNotIn('limit', payload['scope'])
        self.assertNotIn('page', payload['scope'])
        self.assertNotIn('sort_by', payload['scope'])
        self.assertIn('fields', payload['scope'])
        self.assertEqual(mb.canonical(payload['response']['requestBody']),
                         mb.canonical(dict(payload['scope'], limit=100, page=0, sort_by='revenue_custom__desc')))
        self.assertRegex(payload['capturedAt'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$')
        json.dumps(payload, allow_nan=False)

    def test_now_iso_matches_the_contract_example(self):
        self.assertRegex(mb.now_iso(), r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$')

    def test_contract_rules_are_enforced_before_sending(self):
        scope = mb.scope_of(page_body())
        self.assertEqual(self.code(import_id='not-a-uuid'), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(import_id=str(uuid.uuid4()).upper()), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(import_id=str(uuid.uuid1())), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(keyword=' canxi'), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(keyword='x' * 121), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(keyword=''), 'IMPORT_INPUT_INVALID')
        bad = dict(scope, start_date='20261101')
        self.assertEqual(self.code(scope=bad, response=self.response(scope=bad)), 'IMPORT_INPUT_INVALID')
        bad = dict(scope, end_date='2026-10-31')
        self.assertEqual(self.code(scope=bad, response=self.response(scope=bad)), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(scope=dict(scope, limit=100)), 'IMPORT_INPUT_INVALID')
        self.assertEqual(self.code(response=self.response(n=101)), 'METRIC_RESPONSE_INVALID')
        changed = self.response()
        changed['requestBody']['use_ai_normalized'] = True
        self.assertEqual(self.code(response=changed), 'METRIC_RESPONSE_INVALID')
        failed = self.response()
        failed['body']['status'] = 'error'
        self.assertEqual(self.code(response=failed), 'METRIC_RESPONSE_INVALID')
        extra = dict(self.response(), responseOrder=0)
        self.assertEqual(self.code(response=extra), 'METRIC_RESPONSE_INVALID')

    def test_too_large_is_refused_locally(self):
        big = self.response()
        big['body']['data']['products'] = [{'product_base_id': '1__1', 'name': 'x' * (mb.IMPORT_MAX_BYTES + 1)}]
        self.assertEqual(self.code(response=big), 'IMPORT_TOO_LARGE')

    def test_zero_products_is_left_to_the_server(self):
        self.assertEqual(self.build(response=self.response(n=0))['response']['body']['data']['products'], [])

    def test_keyword_and_summary(self):
        self.assertEqual(mb.keyword_of(page_body()), 'canxi')
        none = page_body()
        none['include_query']['queries'] = []
        self.assertIsNone(mb.keyword_of(none))
        self.assertEqual(mb.filter_summary(page_body()),
                         {'period': '01/10/2026 – 31/10/2026', 'platforms': 'Shopee, Lazada', 'keyword': 'canxi'})


class SharedScriptTest(unittest.TestCase):
    def test_the_shared_file_yields_the_function_without_export(self):
        source = mb.request_in_page_source()
        self.assertTrue(source.startswith('async function requestV3InPage({ urlPath, requestBody })'))
        self.assertTrue(source.endswith('}'))
        self.assertNotIn('export ', source)
        self.assertIn('AbortSignal.timeout(45000)', source)
        expression = mb.evaluate_expression(source, {'urlPath': '/x', 'requestBody': {'a': 'ă'}})
        self.assertTrue(expression.startswith('(async function requestV3InPage('))
        self.assertTrue(expression.endswith(')({"urlPath": "/x", "requestBody": {"a": "ă"}})'))

    def test_the_exe_spec_bundles_that_same_file(self):
        spec = (HERE.parent / 'TDN-Shopee-Flow.spec').read_text(encoding='utf-8')
        self.assertIn("'../opencli-metric/clis/metric/request-in-page.js'", spec)
        self.assertIn("'vendor_pychrome'", spec)
        self.assertEqual(mb.shared_js_path().resolve(),
                         (HERE.parents[1] / 'opencli-metric' / 'clis' / 'metric' / 'request-in-page.js').resolve())


class VendorTest(unittest.TestCase):
    def test_licence_kept_and_only_websocket_client_is_imported(self):
        folder = HERE.parent / 'vendor_pychrome'
        self.assertIn('Copyright (c) 2017, fate0', (folder / 'LICENSE').read_text(encoding='utf-8'))
        self.assertIn('0.2.4', (folder / 'SOURCE.md').read_text(encoding='utf-8'))
        imports = set()
        for path in folder.glob('*.py'):
            for line in path.read_text(encoding='utf-8').splitlines():
                found = re.match(r'\s*(?:import|from)\s+([A-Za-z_][\w.]*)', line)
                if found:
                    imports.add(found.group(1).split('.')[0])
        stdlib = {'__future__', 'os', 'json', 'logging', 'warnings', 'threading', 'functools', 'queue', 'Queue',
                  'urllib'}
        self.assertEqual(imports - stdlib, {'websocket'})
        browser = (folder / 'browser.py').read_text(encoding='utf-8')
        for gone in ('def new_tab', 'def close_tab', 'def activate_tab', 'requests.', 'import requests', '/json/close'):
            self.assertNotIn(gone, browser)


class LauncherTest(unittest.TestCase):
    ENV = {'ProgramFiles': 'P', 'ProgramFiles(x86)': 'X', 'LOCALAPPDATA': 'L', 'METRICA_BROWSER': 'evil.exe'}

    def test_discovery_order_is_browser_js_order_without_env_hooks(self):
        seen = []

        def exists(path):
            seen.append(path)
            return False
        with self.assertRaises(mb.MetricFailure) as caught:
            mb.get_browser_info(self.ENV, exists)
        import os
        self.assertEqual(seen, [os.path.join('P', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                                os.path.join('X', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                                os.path.join('L', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                                os.path.join('X', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
                                os.path.join('P', 'Microsoft', 'Edge', 'Application', 'msedge.exe')])
        self.assertEqual(caught.exception.message,
                         'Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy. Hãy cài Google Chrome.')
        found = mb.get_browser_info(self.ENV, lambda p: 'Edge' in p)
        self.assertEqual(found['label'], 'Microsoft Edge')

    def launcher(self, folder, alive):
        spawned = []
        launcher = mb.ChromeLauncher(folder, browser_info=lambda: {'label': 'Google Chrome', 'path': 'chrome.exe'},
                                     spawn=spawned.append, sleep=lambda s: None)
        return launcher, spawned

    def test_open_chrome_uses_the_same_flags_and_saves_the_port(self):
        with tempfile.TemporaryDirectory() as folder:
            launcher, spawned = self.launcher(folder, True)
            with mock.patch.object(mb.ChromeLauncher, 'is_alive', staticmethod(lambda port: True)), \
                    mock.patch.object(mb.ChromeLauncher, 'is_app_chrome', lambda self, port: False), \
                    mock.patch.object(mb, '_http_json', lambda url, timeout: {
                        'webSocketDebuggerUrl': 'ws://127.0.0.1:1/devtools/browser/b1'}):
                opened = launcher.open_chrome('about:blank')
            args = spawned[0]
            port = opened['port']
            self.assertEqual(args, ['chrome.exe', f'--user-data-dir={pathlib.Path(folder) / "metric-chrome-profile"}',
                                    f'--remote-debugging-port={port}', '--remote-debugging-address=127.0.0.1',
                                    '--no-first-run', '--no-default-browser-check', '--start-maximized', 'about:blank'])
            self.assertEqual(launcher.saved_port(), port)
            self.assertEqual(launcher.port_file().read_text(encoding='utf-8'), f'{port}\n/devtools/browser/b1\n')
            self.assertEqual(opened, {'port': port, 'browserName': 'Google Chrome', 'reused': False})

    def test_a_running_app_chrome_is_reused(self):
        with tempfile.TemporaryDirectory() as folder:
            launcher, spawned = self.launcher(folder, True)
            launcher.port_file().write_text('4567', encoding='utf-8')
            with mock.patch.object(mb.ChromeLauncher, 'is_app_chrome', lambda self, port: port == 4567):
                opened = launcher.open_chrome()
            self.assertEqual(opened, {'port': 4567, 'browserName': 'Chrome của app (đang mở)', 'reused': True})
            self.assertEqual(spawned, [])

    def test_twenty_seconds_without_a_port_gives_the_browser_js_message(self):
        with tempfile.TemporaryDirectory() as folder:
            launcher, _ = self.launcher(folder, False)
            sleeps = []
            launcher._sleep = sleeps.append
            with mock.patch.object(mb.ChromeLauncher, 'is_alive', staticmethod(lambda port: False)), \
                    mock.patch.object(mb.ChromeLauncher, 'is_app_chrome', lambda self, port: False):
                with self.assertRaises(mb.MetricFailure) as caught:
                    launcher.open_chrome()
            self.assertEqual(sleeps, [0.5] * 40)
            self.assertIn('Đã mở Chrome nhưng không kết nối được.', caught.exception.message)

    def test_a_saved_port_of_another_chrome_is_not_ours(self):
        with tempfile.TemporaryDirectory() as folder:
            launcher, _ = self.launcher(folder, True)
            launcher.port_file().write_text('4567\n/devtools/browser/abc\n', encoding='utf-8')
            self.assertEqual(launcher.saved_port(), 4567)
            version = {'webSocketDebuggerUrl': 'ws://127.0.0.1:4567/devtools/browser/other'}
            with mock.patch.object(mb, '_http_json', lambda url, timeout: version):
                self.assertFalse(launcher.is_app_chrome(4567))
                version['webSocketDebuggerUrl'] = 'ws://127.0.0.1:4567/devtools/browser/abc'
                self.assertTrue(launcher.is_app_chrome(4567))
                self.assertFalse(launcher.is_app_chrome(4568))

    def test_short_error_keeps_the_first_line(self):
        self.assertEqual(mb.short_error(Exception('\x1b[31mBoom\x1b[0m\nCall log: x')), 'Boom')


class FakeSession(mb.MetricSession):
    def __init__(self, folder):
        super().__init__(folder, launcher=mock.Mock(is_alive=lambda port: True, saved_port=lambda: 1))
        self.fetches = 0
        world = World([target('a', 'https://metric.vn/analytics')])
        self.listener = world.listener()
        self.listener.poll()
        self.tab = world.tabs[0]
        self.tab.products_request(page_body())

        def evaluate(expression, awaitPromise, returnByValue):
            self.fetches += 1
            arg = json.loads(expression[expression.index(')({') + 2:-1])
            return {'result': {'value': {'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200,
                                         'requestBody': arg['requestBody'],
                                         'body': {'status': 'success', 'data': {'products': products(5)}}}}}
        self.tab.answers['Runtime.evaluate'] = evaluate


class BridgeTest(unittest.TestCase):
    CONFIG = {'sshCommand': ['ssh'], 'remoteScript': '$HOME/repo/shopee_flow.py', 'timeoutSeconds': 30}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.api = tdn_shopee_app.Api()
        self.session = FakeSession(self.tmp.name)
        self.api._metric = self.session
        self.remote_calls = []
        self.answers = []
        patches = [mock.patch.object(tdn_shopee_app, '_load_config', lambda: dict(self.CONFIG)),
                   mock.patch.object(tdn_shopee_app, '_evidence_folder', lambda: pathlib.Path(self.tmp.name)),
                   mock.patch.object(self.api, '_remote', self.fake_remote)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def fake_remote(self, action, run_id=None, payload=None, config=None, **_):
        self.remote_calls.append((action, run_id, payload))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    OK_IMPORT = {'ok': True, 'data': {'format': 'metric-user-page-import-result-v1', 'runId': 'a1b2c3d4',
                                      'reused': False, 'gates': {'entry': 'PASS', 'm1': 'PASS'}}}
    OK_M2 = {'ok': True, 'data': {'format': 'detached-v1', 'runId': 'a1b2c3d4', 'pid': 1}}

    def test_m1_import_plan_sends_the_payload_on_stdin(self):
        payload = {'format': 'metric-user-page-import-v1', 'keyword': 'cà phê'}
        _, lines = tdn_shopee_app.Api._remote_plan(self.api, 'm1Import', payload=payload, config=dict(self.CONFIG))
        self.assertEqual(tdn_shopee_app._COMMANDS['m1Import'], ('m1-import', '--stdin'))
        command = lines[-1]
        self.assertTrue(command.endswith('| base64 -d | python3 "$HOME/repo/shopee_flow.py" m1-import --stdin'))
        encoded = re.match(r"printf '%s' '([A-Za-z0-9+/=]+)'", command).group(1)
        self.assertEqual(json.loads(base64.b64decode(encoded).decode('utf-8')), payload)

    def test_click_imports_then_starts_step_2_and_never_run(self):
        self.answers = [self.OK_IMPORT, self.OK_M2]
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(result, {'ok': True, 'data': {'runId': 'a1b2c3d4', 'reused': False, 'step2': {'ok': True}}})
        self.assertEqual([c[0] for c in self.remote_calls], ['m1Import', 'm2'])
        self.assertEqual(self.remote_calls[1][1], 'a1b2c3d4')
        sent = self.remote_calls[0][2]
        self.assertEqual(sent['keyword'], 'canxi')
        self.assertEqual(sent['collectionPolicy'], POLICY)
        self.assertIsNone(self.session.pending)
        self.assertIsNone(self.session.listener)       # listening stopped once the run exists
        self.assertTrue(self.session.tab.stopped)
        self.assertNotIn('Runtime.enable', self.session.tab.methods())

    def test_a_failed_send_keeps_the_payload_and_resend_does_not_ask_metric_again(self):
        self.answers = [tdn_shopee_app._BridgeFailure('SSH_TIMEOUT')]
        first = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(first['error'], {'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT', 'detail': {'pending': True}})
        kept = self.session.pending
        self.assertIsNotNone(kept)
        again = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(again['error']['code'], 'METRIC_IMPORT_PENDING')
        self.answers = [self.OK_IMPORT, self.OK_M2]
        self.assertTrue(self.api.resendMetricImport()['ok'])
        self.assertEqual(self.session.fetches, 1)
        self.assertIs(self.remote_calls[1][2], kept)
        self.assertEqual(self.remote_calls[0][2]['importId'], self.remote_calls[1][2]['importId'])

    def test_a_final_server_refusal_drops_the_payload(self):
        self.answers = [{'ok': False, 'error': {'code': 'IMPORT_NO_SHOPEE_ROWS', 'message': 'IMPORT_NO_SHOPEE_ROWS'}}]
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(result['error']['detail'], {'pending': False})
        self.assertIsNone(self.session.pending)

    def test_a_wrong_server_answer_keeps_the_payload(self):
        self.answers = [{'ok': True, 'data': {'format': 'metric-user-page-import-result-v1', 'runId': 'a1',
                                              'reused': False, 'gates': {'entry': 'PASS', 'm1': 'FAIL'}}}]
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(result['error']['code'], 'REMOTE_OUTPUT_INVALID')
        self.assertIsNotNone(self.session.pending)

    def test_double_click_is_refused_while_busy(self):
        self.session.busy.acquire()
        try:
            result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        finally:
            self.session.busy.release()
        self.assertEqual(result['error']['code'], 'METRIC_BUSY')
        self.assertEqual(self.remote_calls, [])
        self.assertEqual(self.session.fetches, 0)

    def test_no_keyword_needs_the_typed_name(self):
        body = page_body()
        body['include_query']['queries'] = []
        self.session.tab.products_request(body)
        self.assertTrue(self.api.metricBrowserState()['data']['needsKeyword'])
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(result['error']['code'], 'METRIC_KEYWORD_REQUIRED')
        self.assertEqual(self.session.fetches, 0)
        self.answers = [self.OK_IMPORT, self.OK_M2]
        self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY, 'keyword': '  Tên lượt  '})['ok'])
        self.assertEqual(self.remote_calls[0][2]['keyword'], 'Tên lượt')

    def test_invalid_policy_is_refused_before_metric(self):
        result = self.api.takeMetricReviews({'collectionPolicy': dict(POLICY, totalPerLink=0)})
        self.assertEqual(result['error']['code'], 'ARG_INVALID')
        self.assertEqual(self.session.fetches, 0)

    def test_state_shows_the_last_filter_in_plain_words(self):
        state = self.api.metricBrowserState()
        self.assertEqual(state['data']['filter'], {'period': '01/10/2026 – 31/10/2026', 'platforms': 'Shopee, Lazada',
                                                   'keyword': 'canxi'})
        self.assertTrue(state['data']['seen'])
        self.assertTrue(state['data']['chromeOpen'])
        self.assertFalse(state['data']['needsKeyword'])
        self.assertNotIn('body', json.dumps(state))


if __name__ == '__main__':
    unittest.main()

"""Step 1 on the user's own Chrome: listener, frozen filter, import payload, bridge.

Offline only. Tabs are fakes that record every CDP method; no Chrome, Metric, Shopee or
Jev is reached. The real-Chrome check is test_metric_browser_cdp.py.
"""
import base64
import importlib.util
import json
import os
import pathlib
import re
import subprocess
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

REAL_SHOT_FOLDER = tdn_shopee_app._metric_shot_folder
REAL_EVIDENCE_FOLDER = tdn_shopee_app._evidence_folder

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

    lost = False    # the socket died by itself (set by a test)

    def connection_lost(self):
        return self.lost and not self.stopped

    def call_method(self, method, **params):
        params.pop('_timeout', None)
        self.calls.append((method, params))
        answer = self.answers.get(method, {})
        return answer(**params) if callable(answer) else answer

    def methods(self):
        return [m for m, _ in self.calls]

    def emit(self, **event):
        self.listeners['Network.requestWillBeSent'](**event)

    def products_request(self, body, request_id='r1', inline=True, script='https://metric.vn/_nuxt/app.js',
                         timestamp=None):
        """A products request; `script` is the initiator frame's URL (the page by default)."""
        request = {'url': PRODUCTS, 'method': 'POST'}
        if inline:
            request['postData'] = json.dumps(body)
        else:
            request['hasPostData'] = True
        event = dict(requestId=request_id, request=request, type='Fetch', frameId=self.id,
                     initiator={'type': 'script', 'stack': {'callFrames': [{'functionName': 'f', 'url': script}]}})
        if timestamp is not None:
            event['timestamp'] = timestamp
        self.emit(**event)


def parse_call(expression):
    """(request argument, sourceURL) of an expression built by evaluate_expression."""
    code, _, script = expression.partition('\n//# sourceURL=')
    return json.loads(code[code.index(')({') + 2:-1]), script or None


def wait_until(check, label, seconds=5):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if check():
            return
        time.sleep(0.005)
    raise AssertionError('timeout: ' + label)


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

    def test_session_close_drains_and_a_new_open_gets_a_new_listener(self):
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
        stopper = threading.Thread(target=session.close)
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
        self.assertTrue(all(tab.stopped for tab in world.tabs if tab.started))


class AutoWatchTest(unittest.TestCase):
    """view() starts listening by itself once per app start, while nothing has listened yet."""

    def setUp(self):
        self.world = World([target('a', 'https://metric.vn/analytics')])
        self.app_chrome = True
        self.port = 9
        self.made = []
        self.poll_errors = []            # each /json/list raises the next one (OSError / ValueError: poll handles it)
        self.on_identity = None          # runs inside is_app_chrome (the check before the attach)
        self.listing = None              # (entered, release, error): the next /json/list waits, then raises / answers

        def is_app_chrome(port):
            if self.on_identity:
                self.on_identity()
            return self.app_chrome
        launcher = mock.Mock(is_alive=lambda port: True, saved_port=lambda: self.port, is_app_chrome=is_app_chrome)
        launcher.open_chrome.side_effect = lambda url: {'port': self.port, 'browserName': 'Google Chrome',
                                                        'reused': True}

        def list_targets():
            if self.listing:
                entered, release, error = self.listing
                self.listing = None
                entered.set()
                release.wait(5)
                if error:
                    raise error
            if self.poll_errors:
                raise self.poll_errors.pop(0)
            return self.world.targets

        def factory(port):
            listener = mb.MetricListener(port, tab_factory=self.world.factory, list_targets=list_targets,
                                         clock=lambda: self.world.now)
            self.made.append(listener)
            return listener
        self.session = mb.MetricSession(tempfile.gettempdir(), launcher=launcher, listener_factory=factory)
        self.addCleanup(self.session.close)

    def navigations(self):
        return [c for tab in self.world.tabs for c in tab.calls if c[0] == 'Page.navigate']

    def test_the_apps_open_chrome_is_watched_once_without_navigation(self):
        first = self.session.view()
        self.assertEqual(len(self.made), 1)
        self.assertEqual(self.made[0].port, 9)
        self.assertTrue(first['chromeOpen'])
        self.assertTrue(first['listening'])
        self.assertFalse(first['seen'])
        self.assertEqual(self.navigations(), [])
        self.world.tabs[0].products_request(page_body())
        again = self.session.view()
        self.assertEqual(len(self.made), 1)                 # later views reuse it
        self.assertTrue(again['seen'])
        self.assertEqual([t.methods() for t in self.world.tabs], [['Network.enable']])

    def test_a_chrome_the_app_did_not_start_is_never_watched(self):
        self.app_chrome = False
        state = self.session.view()
        self.assertEqual(self.made, [])
        self.assertIsNone(self.session.listener)
        self.assertFalse(state['listening'])
        self.port = None                                     # no saved port at all
        self.app_chrome = True
        self.assertFalse(self.session.view()['listening'])
        self.assertEqual(self.made, [])

    def test_after_a_run_is_created_listening_goes_on(self):
        # Owner 25/11 «keep listening»: the next run needs no «Mở Metric».
        self.session.view()
        listener = self.made[0]
        self.session.pending = {'keyword': 'k', 'scope': {}}
        self.session.confirmed()
        self.assertIsNone(self.session.pending)
        state = self.session.view()
        self.assertTrue(state['listening'])
        self.assertIsNone(state['pending'])
        self.assertIs(self.session.listener, listener)
        self.assertFalse(listener.closed)
        self.world.tabs[0].products_request(page_body(), request_id='r2')
        self.assertTrue(self.session.view()['seen'])
        self.assertEqual(len(self.made), 1)

    def test_after_close_nothing_listens_again(self):
        self.session.close()
        self.assertFalse(self.session.view()['listening'])
        self.assertEqual(self.made, [])

    def test_a_listener_that_stopped_itself_is_not_replaced(self):
        self.session.view()
        self.made[0].stop_all()                              # for example Chrome was closed
        self.assertFalse(self.session.view()['listening'])
        self.assertEqual(len(self.made), 1)

    def test_a_failed_start_is_not_retried_and_open_metric_then_listens(self):
        cases = {'poll timeout (handled by poll)': lambda: self.poll_errors.append(OSError('timed out')),
                 'poll bad answer (handled by poll)': lambda: self.poll_errors.append(ValueError('bad json')),
                 'poll crash': lambda: self.poll_errors.append(RuntimeError('boom'))}
        for name, arrange in cases.items():
            with self.subTest(name):
                self.setUp()
                arrange()
                self.assertFalse(self.session.view()['listening'])
                self.assertFalse(self.session.view()['listening'])   # one try per app start
                self.assertEqual(len(self.made), 1)
                self.session.open_metric()
                self.assertTrue(self.session.view()['listening'])
                self.assertEqual(self.navigations(), [])

    def test_a_port_saved_during_the_check_is_not_attached(self):
        def new_chrome():
            self.on_identity = None
            self.port = 10                                   # «Mở Metric» saved another Chrome meanwhile
        self.on_identity = new_chrome
        self.session.view()
        self.assertEqual(self.made, [])
        self.session.view()
        self.assertEqual([listener.port for listener in self.made], [10])

    def test_a_state_read_while_open_metric_opens_chrome_never_auto_attaches(self):
        seen = []

        def slow_open(url):                                  # the page polls while Chrome is opening
            seen.append((self.session.view()['listening'], len(self.made)))
            return {'port': self.port, 'browserName': 'Google Chrome', 'reused': False}
        self.session.launcher.open_chrome.side_effect = slow_open
        self.session.open_metric()
        self.assertEqual(seen, [(False, 0)])
        self.assertEqual(len(self.made), 1)                  # only «Mở Metric»'s own listener
        self.assertTrue(self.session.view()['listening'])

    def test_open_metric_after_auto_watch_keeps_the_same_listener(self):
        self.session.view()
        self.session.open_metric()
        self.assertEqual(len(self.made), 1)
        self.assertIs(self.session.listener, self.made[0])
        self.assertEqual(self.navigations(), [])           # the Metric tab is already there: no about:blank
        self.assertEqual(self.made[0].attached_ids(), ['a'])

    def test_a_failing_auto_start_never_tears_down_what_open_metric_adopted(self):
        entered, release, adopted = threading.Event(), threading.Event(), threading.Event()
        self.listing = (entered, release, RuntimeError('boom'))
        viewer = threading.Thread(target=self.session.view)
        viewer.start()
        self.assertTrue(entered.wait(5))                    # the auto-watch poll is waiting on /json/list
        listener = self.made[0]
        original = listener.attach_blank_and_open

        def attach(url):                                     # open_metric() is past its creation step
            adopted.set()
            return original(url)
        listener.attach_blank_and_open = attach
        opener = threading.Thread(target=self.session.open_metric)
        opener.start()
        self.assertTrue(adopted.wait(5))
        release.set()                                        # the auto-watch poll now fails
        viewer.join(10)
        opener.join(10)
        self.assertFalse(viewer.is_alive() or opener.is_alive())
        self.assertEqual(len(self.made), 1)
        self.assertIs(self.session.listener, listener)
        self.assertFalse(listener.closed)
        self.assertEqual(listener.attached_ids(), ['a'])

    def test_the_app_closed_while_the_auto_start_runs_ends_auto_watch(self):
        for name in ('close',):
            with self.subTest(name):
                self.setUp()
                entered, release = threading.Event(), threading.Event()
                self.listing = (entered, release, None)      # the start-up poll then answers normally
                viewer = threading.Thread(target=self.session.view)
                viewer.start()
                self.assertTrue(entered.wait(5))
                getattr(self.session, name)()
                release.set()
                viewer.join(10)
                self.assertFalse(viewer.is_alive())
                self.assertIsNone(self.session.listener)
                self.assertTrue(self.made[0].closed)
                self.assertEqual(self.made[0].attached_ids(), [])
                for _ in range(2):
                    self.assertFalse(self.session.view()['listening'])
                self.assertEqual(len(self.made), 1)


class CaptureFreezeContractTest(unittest.TestCase):
    """MetricSession.capture() freezes exactly the newest request; never an older one.

    | row | newest request                       | capture()                                    |
    |-----|--------------------------------------|----------------------------------------------|
    | A   | body lookup still blocked            | METRIC_FILTER_PENDING, Metric not asked      |
    | A2  | body arrives within the wait         | uses that newest filter                      |
    | B   | body lookup failed                   | METRIC_FILTER_UNAVAILABLE, stays so          |
    | C   | newest on the other tab, pending     | refused; the older tab is never used         |
    """
    FILTER_A = page_body(start_date='20260801')
    FILTER_B = page_body(start_date='20260901')

    def setUp(self):
        self.world = World([target('a', 'https://metric.vn/analytics'), target('b', 'https://metric.vn/analytics')])
        self.listener = self.world.listener()
        self.listener.body_wait_seconds = 0.3
        self.listener.poll()
        self.a, self.b = self.world.tabs
        self.answers = self.a.answers = self.b.answers = {}    # one answer table for both tabs
        self.addCleanup(self.listener.stop_all)
        self.session = mb.MetricSession(tempfile.gettempdir(),
                                        launcher=mock.Mock(is_alive=lambda port: True, saved_port=lambda: 9))
        self.session.listener = self.listener
        self.evaluated = []

        def evaluate(expression, awaitPromise, returnByValue):
            arg, _ = parse_call(expression)
            self.evaluated.append(arg['requestBody'])
            return {'result': {'value': {'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200,
                                         'requestBody': arg['requestBody'],
                                         'body': {'status': 'success', 'data': {'products': products(5)}}}}}
        self.answers['Runtime.evaluate'] = evaluate
        self.a.products_request(self.FILTER_A, request_id='A')

    def blocked_body(self, body):
        release = threading.Event()
        self.addCleanup(release.set)
        self.answers['Network.getRequestPostData'] = lambda requestId: (
            release.wait(5), {'postData': json.dumps(body)})[1]
        return release

    def capture_code(self):
        with self.assertRaises(mb.MetricFailure) as caught:
            self.session.capture(POLICY)
        return caught.exception.code

    def test_row_a_a_blocked_lookup_refuses_and_never_imports_the_older_filter(self):
        release = self.blocked_body(self.FILTER_B)
        self.a.products_request(None, request_id='B', inline=False)
        started = time.monotonic()
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_PENDING')
        self.assertGreaterEqual(time.monotonic() - started, 0.25)    # waited, bounded
        self.assertEqual(self.evaluated, [])
        self.assertIsNone(self.session.pending)
        release.set()
        wait_until(lambda: self.listener._newest['state'] == 'resolved', 'B body')
        payload = self.session.capture(POLICY)
        self.assertEqual(payload['scope']['start_date'], '20260901')

    def test_row_a2_a_body_arriving_within_the_wait_is_used(self):
        release = self.blocked_body(self.FILTER_B)
        self.a.products_request(None, request_id='B', inline=False)
        self.listener.body_wait_seconds = 3
        threading.Timer(0.1, release.set).start()
        payload = self.session.capture(POLICY)
        self.assertEqual(payload['scope']['start_date'], '20260901')
        self.assertEqual(self.evaluated[0]['start_date'], '20260901')

    def test_row_b_a_failed_lookup_refuses_until_a_new_request(self):
        def broken(requestId):
            raise RuntimeError('No resource with given identifier found')
        self.answers['Network.getRequestPostData'] = broken
        self.a.products_request(None, request_id='B', inline=False)
        wait_until(lambda: self.listener._newest['state'] == 'failed', 'lookup failed')
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_UNAVAILABLE')
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_UNAVAILABLE')   # never falls back to A
        self.assertEqual(self.evaluated, [])
        self.a.products_request(page_body(start_date='20261001'), request_id='C')
        self.assertEqual(self.session.capture(POLICY)['scope']['start_date'], '20261001')

    def test_row_c_the_newest_request_on_the_other_tab_is_waited_for_not_the_older_tab(self):
        release = self.blocked_body(self.FILTER_B)
        self.b.products_request(None, request_id='B', inline=False)
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_PENDING')
        self.assertNotIn('Runtime.evaluate', self.a.methods())
        release.set()
        wait_until(lambda: self.listener._newest['state'] == 'resolved', 'B body')
        payload = self.session.capture(POLICY)
        self.assertEqual(payload['scope']['start_date'], '20260901')
        self.assertIn('Runtime.evaluate', self.b.methods())
        self.assertNotIn('Runtime.evaluate', self.a.methods())

    def test_an_unreadable_inline_body_is_refused_too(self):
        self.a.emit(requestId='bad', type='Fetch', frameId='a',
                    request={'url': PRODUCTS, 'method': 'POST', 'postData': 'not json'})
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_UNAVAILABLE')


class GatedTab(FakeTab):
    """A fake tab whose start() waits for the test, to hold an attachment in progress."""
    gate = None
    entered = None

    def start(self):
        super().start()
        if GatedTab.entered is not None:
            GatedTab.entered.set()
        if GatedTab.gate is not None:
            GatedTab.gate.wait(5)


class ConcurrencyTableTest(unittest.TestCase):
    """Interleavings the review asked for, one row each:

    | row | interleaving                        | must hold                                          |
    |-----|-------------------------------------|----------------------------------------------------|
    | 1   | navigation during a body fetch      | detach at once; callback thread never blocks       |
    | 2   | overlapping discovery               | one connection per tab; losers stopped             |
    | 3   | shutdown during attach              | stop_all waits; the late connection is stopped     |
    | 4   | user request during capture         | recorded, even when the capture then fails         |
    | 5   | delayed older body                  | never replaces the newer request                   |
    """

    def setUp(self):
        GatedTab.gate = None
        GatedTab.entered = None
        self.addCleanup(setattr, GatedTab, 'gate', None)
        self.addCleanup(setattr, GatedTab, 'entered', None)

    def gated_world(self, targets):
        world = World(targets)

        def factory(t):
            tab = GatedTab(t, world.answers)
            world.tabs.append(tab)
            return tab
        world.factory = factory
        return world

    # row 1
    def test_row1_navigation_during_a_body_fetch_detaches_at_once(self):
        world = World([target('a', 'https://metric.vn/analytics')])
        release = threading.Event()
        world.answers['Network.getRequestPostData'] = lambda requestId: (
            release.wait(5), {'postData': json.dumps(page_body())})[1]
        listener = world.listener()
        listener.poll()
        tab = world.tabs[0]
        self.addCleanup(release.set)
        self.addCleanup(listener.stop_all)
        tab.products_request(None, request_id='big', inline=False)   # returns at once: no blocking
        tab.emit(requestId='nav', type='Document', frameId='a', request={'url': 'https://accounts.google.com/'})
        self.assertTrue(tab.stopped)
        self.assertEqual(listener.attached_ids(), [])
        release.set()
        time.sleep(0.05)
        self.assertIsNone(listener.latest())   # a body that arrives for a stopped connection is dropped

    @unittest.skipUnless(importlib.util.find_spec('websocket'), 'needs websocket-client for the vendored Tab')
    def test_row1_through_the_real_vendored_dispatch_thread(self):
        from vendor_pychrome import Tab
        release = threading.Event()
        self.addCleanup(release.set)

        class OfflineTab(Tab):
            """The real pychrome dispatch thread, with the socket replaced by an answer table."""
            def start(self):
                self._started = True
                self.status = self.status_started
                self._stopped.clear()
                self._handle_event_th.start()

            def stop(self):
                self.status = self.status_stopped
                self._stopped.set()
                return True

            def _send(self, message, timeout=None):
                if message['method'] == 'Network.getRequestPostData':
                    release.wait(5)
                    return {'result': {'postData': json.dumps(page_body())}}
                return {'result': {}}
        tabs = []

        def factory(t):
            tabs.append(OfflineTab(**t))
            return tabs[-1]
        listener = mb.MetricListener(9, tab_factory=factory, list_targets=lambda: [target('a', 'https://metric.vn/x')])
        self.addCleanup(listener.stop_all)
        listener.poll()
        tab = tabs[0]
        request = {'url': PRODUCTS, 'method': 'POST', 'hasPostData': True}
        tab.event_queue.put({'method': 'Network.requestWillBeSent',
                             'params': {'requestId': 'big', 'type': 'Fetch', 'frameId': 'a', 'request': request}})
        tab.event_queue.put({'method': 'Network.requestWillBeSent',
                             'params': {'requestId': 'nav', 'type': 'Document', 'frameId': 'a',
                                        'request': {'url': 'https://accounts.google.com/', 'method': 'GET'}}})
        wait_until(lambda: listener.attached_ids() == [], 'detach while the body lookup still waits')
        self.assertTrue(tab._stopped.is_set())
        self.assertFalse(release.is_set())

    # row 2
    def test_row2_overlapping_discovery_opens_one_connection_per_tab(self):
        world = self.gated_world([target('b', 'https://metric.vn/analytics')])
        GatedTab.gate = threading.Event()
        GatedTab.entered = threading.Event()
        listener = world.listener()
        background = threading.Thread(target=listener.poll)
        background.start()
        self.assertTrue(GatedTab.entered.wait(5))          # background pass is opening tab b
        foreground = threading.Thread(target=listener.poll)  # «Mở Metric» again
        foreground.start()
        time.sleep(0.05)
        GatedTab.gate.set()
        background.join(5)
        foreground.join(5)
        self.assertEqual(listener.attached_ids(), ['b'])
        self.assertEqual(len(world.tabs), 1)
        listener.stop_all()
        self.assertTrue(all(tab.stopped for tab in world.tabs))

    def test_row2_a_reservation_blocks_a_second_socket_even_outside_discovery(self):
        world = self.gated_world([])
        GatedTab.gate = threading.Event()
        GatedTab.entered = threading.Event()
        listener = world.listener()
        first = threading.Thread(target=lambda: listener._attach(target('b', 'https://metric.vn/x')))
        first.start()
        self.assertTrue(GatedTab.entered.wait(5))
        self.assertIsNone(listener._attach(target('b', 'https://metric.vn/x')))   # reserved: no socket
        GatedTab.gate.set()
        first.join(5)
        self.assertEqual(len(world.tabs), 1)
        self.assertEqual(listener.attached_ids(), ['b'])
        listener.stop_all()
        self.assertTrue(world.tabs[0].stopped)

    # row 3
    def test_row3_shutdown_during_attach_waits_and_stops_the_late_connection(self):
        world = self.gated_world([])
        GatedTab.gate = threading.Event()
        GatedTab.entered = threading.Event()
        listener = world.listener()
        attaching = threading.Thread(target=lambda: listener._attach(target('a', 'https://metric.vn/x')))
        attaching.start()
        self.assertTrue(GatedTab.entered.wait(5))
        stopper = threading.Thread(target=listener.stop_all)
        stopper.start()
        time.sleep(0.05)
        self.assertTrue(stopper.is_alive())        # waits for the attachment in progress
        GatedTab.gate.set()
        stopper.join(5)
        attaching.join(5)
        self.assertFalse(stopper.is_alive())
        self.assertEqual(listener.attached_ids(), [])
        self.assertTrue(world.tabs[0].stopped)
        self.assertEqual(world.tabs[0].methods(), [])   # never Network.enable

    # row 4
    def test_row4_user_request_during_a_capture_that_then_fails_is_recorded(self):
        world = World([target('a', 'https://metric.vn/analytics')])
        listener = world.listener()
        listener.poll()
        tab = world.tabs[0]
        filter_a = page_body(start_date='20260901')
        tab.products_request(filter_a, request_id='u1')
        frozen = listener.freeze()

        def evaluate(expression, awaitPromise, returnByValue):
            # while the in-page call waits: the user views B, then A again in its top-100 view
            tab.products_request(page_body(start_date='20260801'), request_id='u2')
            tab.products_request(mb.top_products_body(filter_a), request_id='u3')
            return {'result': {'value': {'stop': 'CAPTURE_LOGIN_REQUIRED'}}}
        tab.answers['Runtime.evaluate'] = evaluate
        with self.assertRaises(mb.MetricFailure):
            listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertEqual(listener.latest()['body'], mb.top_products_body(filter_a))

    def test_row4_only_the_request_initiated_by_the_evaluated_script_is_the_apps(self):
        world = World([target('a', 'https://metric.vn/analytics'), target('b', 'https://metric.vn/analytics')])
        listener = world.listener()
        listener.poll()
        a, b = world.tabs
        a.products_request(page_body(), request_id='u1')
        frozen = listener.freeze()
        top = mb.top_products_body(page_body())
        seen = {}

        def evaluate(expression, awaitPromise, returnByValue):
            arg, script = parse_call(expression)
            seen['script'] = script
            a.products_request(arg['requestBody'], request_id='app', script=script)    # the app's own
            return {'result': {'value': {'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200,
                                         'requestBody': arg['requestBody'],
                                         'body': {'status': 'success', 'data': {'products': []}}}}}
        a.answers['Runtime.evaluate'] = evaluate
        listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertRegex(seen['script'], r'^tdn-app-request-[0-9a-f]{32}\.js$')
        self.assertEqual(listener.latest()['body'], page_body())           # own request not taken
        a.products_request(top, request_id='app-late', script=seen['script'])   # a late event of that call
        self.assertEqual(listener.latest()['body'], page_body())
        b.products_request(top, request_id='u2')                           # identical body from the user
        self.assertEqual((listener.latest()['targetId'], listener.latest()['body']), ('b', top))
        a.products_request(top, request_id='u3')
        self.assertEqual(listener.latest()['targetId'], 'a')

    # row 5
    def test_row5_a_delayed_older_body_never_replaces_a_newer_request(self):
        world = World([target('a', 'https://metric.vn/analytics'), target('b', 'https://metric.vn/analytics')])
        release = threading.Event()
        asked = threading.Event()

        def slow_body(requestId):
            asked.set()
            release.wait(5)
            return {'postData': json.dumps(page_body(end_date='20261001'))}   # older filter, tab a
        world.answers['Network.getRequestPostData'] = slow_body
        listener = world.listener()
        listener.poll()
        a, b = world.tabs
        self.addCleanup(listener.stop_all)
        a.products_request(None, request_id='old', inline=False, timestamp=100.0)
        self.assertTrue(asked.wait(5))
        b.products_request(page_body(end_date='20261031'), request_id='new', timestamp=101.0)
        self.assertEqual(listener.latest()['targetId'], 'b')
        release.set()
        wait_until(lambda: len([c for c in a.calls if c[0] == 'Network.getRequestPostData']) == 1, 'lookup')
        time.sleep(0.05)
        latest = listener.latest()
        self.assertEqual((latest['targetId'], latest['body']['end_date']), ('b', '20261031'))

    def test_row5_without_timestamps_arrival_order_decides(self):
        world = World([target('a', 'https://metric.vn/analytics'), target('b', 'https://metric.vn/analytics')])
        release = threading.Event()
        world.answers['Network.getRequestPostData'] = lambda requestId: (
            release.wait(5), {'postData': json.dumps(page_body(end_date='20261001'))})[1]
        listener = world.listener()
        listener.poll()
        a, b = world.tabs
        self.addCleanup(listener.stop_all)
        a.products_request(None, request_id='old', inline=False)
        b.products_request(page_body(end_date='20261031'), request_id='new')
        release.set()
        time.sleep(0.1)
        self.assertEqual(listener.latest()['targetId'], 'b')

    def test_row5_an_older_event_on_the_same_tab_does_not_replace_a_newer_one(self):
        world = World([target('a', 'https://metric.vn/analytics')])
        listener = world.listener()
        listener.poll()
        a = world.tabs[0]
        a.products_request(page_body(end_date='20261031'), request_id='2', timestamp=50.0)
        a.products_request(page_body(end_date='20261001'), request_id='1', timestamp=40.0)
        self.assertEqual(listener.latest()['body']['end_date'], '20261031')


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

    def test_missing_body_is_read_by_the_body_worker(self):
        self.addCleanup(self.listener.stop_all)
        self.a.products_request(None, request_id='big', inline=False)
        wait_until(lambda: self.listener.latest() is not None, 'body published')
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
            arg, _ = parse_call(expression)
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

    def test_the_full_page_shot_covers_the_whole_page_and_never_raises(self):
        self.tab.products_request(page_body())
        frozen = self.listener.freeze()
        self.tab.answers['Page.captureScreenshot'] = {'data': base64.b64encode(b'synthetic screenshot').decode()}
        with tempfile.TemporaryDirectory() as folder:
            for width, height, ratio, extension in ((1280, 5400, 1, 'webp'), (1280, 16383, 1, 'webp'),
                    (1280, 16384, 1, 'png'), (16384, 5400, 1, 'png'),
                    (1280, 8191, 2, 'webp'), (1280, 8192, 2, 'png'), (8192, 4000, 2, 'png')):
                with self.subTest(width=width, height=height, ratio=ratio):
                    self.tab.answers['Page.getLayoutMetrics'] = {
                        'cssContentSize': {'x': 0, 'y': 0, 'width': width, 'height': height},
                        'contentSize': {'width': width * ratio, 'height': height * ratio}}
                    path = self.listener.full_page_shot(frozen['targetId'], pathlib.Path(folder) / 'metric')
                    self.assertRegex(path.name, r'^metric-\d{4}-\d\d-\d\d-\d{6}(-\d+)?\.' + extension + '$')
                    self.assertEqual(path.read_bytes(), b'synthetic screenshot')
                    shot = [params for method, params in self.tab.calls if method == 'Page.captureScreenshot'][-1]
                    expected = {'format': extension, 'captureBeyondViewport': True,
                                'clip': {'x': 0, 'y': 0, 'width': width, 'height': height, 'scale': 1}}
                    if extension == 'webp':
                        expected['quality'] = 80
                    self.assertEqual(shot, expected)
                    session = mb.MetricSession(folder)
                    session.pending_shot = path
                    linked = session.link_shot('run-synthetic')
                    self.assertEqual(linked.name, f'run-synthetic-metric-full-page.{extension}')
                    self.assertEqual(linked.read_bytes(), b'synthetic screenshot')
                    linked.unlink()

            def broken(**_):
                raise RuntimeError('capture failed')
            self.tab.answers['Page.captureScreenshot'] = broken
            self.assertIsNone(self.listener.full_page_shot(frozen['targetId'], folder))
            self.assertIsNone(self.listener.full_page_shot(frozen['targetId'], None))

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

    def test_run_name_rows(self):
        """| search keyword on Metric | import keyword                          |
        |--------------------------|-----------------------------------------|
        | present                  | the keyword, trimmed                    |
        | missing / blank          | Metric DD/MM–DD/MM/YYYY (same year)      |
        |                          | Metric DD/MM/YYYY–DD/MM/YYYY (two years) |
        | longer than 120 chars    | cut to 120, trimmed                     |"""
        def name(queries, start='20261014', end='20261112'):
            body = page_body(start_date=start, end_date=end)
            body['include_query']['queries'] = queries
            return mb.run_name(mb.scope_of(body))
        self.assertEqual(name(['  viên uống canxi ']), 'viên uống canxi')
        self.assertEqual(name([]), 'Metric 14/10–12/11/2026')
        self.assertEqual(name(['   ']), 'Metric 14/10–12/11/2026')
        self.assertEqual(name([], start='20251201', end='20260115'), 'Metric 01/12/2025–15/01/2026')
        long = name(['k' * 119 + ' ' + 'x' * 30])
        self.assertEqual(long, 'k' * 119)
        self.assertEqual(name(['y' * 300]), 'y' * 120)
        for value in (name([]), long, name(['y' * 300])):
            self.assertTrue(1 <= len(value) <= 120 and value == value.strip())


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
        self.assertIn("(os.path.join(here, 'vendor_pychrome', 'LICENSE'), 'third_party/pychrome')", spec)
        self.assertIn("(os.path.join(here, 'vendor_pychrome', 'SOURCE.md'), 'third_party/pychrome')", spec)
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
        super().__init__(folder, launcher=mock.Mock(is_alive=lambda port: True, saved_port=lambda: 9,
                                                     is_app_chrome=lambda port: True))
        self.fetches = 0
        self.rows = products(5)    # what Metric answers to the in-page top-100 request
        world = World([target('a', 'https://metric.vn/analytics')])
        self.listener = world.listener()
        self.listener.poll()
        self.tab = world.tabs[0]
        self.tab.products_request(page_body())

        def evaluate(expression, awaitPromise, returnByValue):
            self.fetches += 1
            arg, _ = parse_call(expression)
            return {'result': {'value': {'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200,
                                         'requestBody': arg['requestBody'],
                                         'body': {'status': 'success', 'data': {'products': self.rows}}}}}
        self.tab.answers['Runtime.evaluate'] = evaluate
        self.tab.answers['Page.getLayoutMetrics'] = {'cssContentSize': {'width': 1280, 'height': 4000}}
        self.tab.answers['Page.captureScreenshot'] = {'data': base64.b64encode(b'\x89PNG click').decode()}


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
        self.shots = pathlib.Path(self.tmp.name) / 'metric'
        patches = [mock.patch.object(tdn_shopee_app, '_load_config', lambda: dict(self.CONFIG)),
                   mock.patch.object(tdn_shopee_app, '_evidence_folder', lambda: pathlib.Path(self.tmp.name)),
                   mock.patch.object(tdn_shopee_app, '_metric_shot_folder', lambda: self.shots),
                   mock.patch.object(tdn_shopee_app, '_choice_path',
                                     lambda: pathlib.Path(self.tmp.name) / 'product-selection.json'),
                   mock.patch.object(tdn_shopee_app, '_run_sort_path',
                                     lambda: pathlib.Path(self.tmp.name) / 'run-sort.json'),
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
    OK_FLOW = {'ok': True, 'data': {'format': 'detached-v1', 'runId': 'a1b2c3d4', 'pid': 1}}

    def test_fewer_than_five_shopee_products_send_and_keep_nothing(self):
        """| Metric answer (top 100)                 | click                                   |
        |-----------------------------------------|-----------------------------------------|
        | 4 Shopee                                | warning N=4; nothing sent or kept       |
        | 0 products                              | warning N=0                             |
        | 6 rows, 4 Shopee (2 other platforms)    | warning N=4                             |
        | 6 rows, 4 distinct Shopee (1 repeated)  | warning N=4                             |
        | 5 Shopee                                | imported, step 2 started (unchanged)    |"""
        shopee = lambda i: {'product_base_id': f'1__{i}', 'revenue_custom': 100 - i}
        other = lambda i: {'product_base_id': f'2__{i}', 'revenue_custom': 50 - i}
        rows = [('4 Shopee', [shopee(i) for i in range(4)], 4),
                ('0 products', [], 0),
                ('6 rows, 4 Shopee', [shopee(0), other(0), shopee(1), shopee(2), other(1), shopee(3)], 4),
                ('repeated Shopee id', [shopee(0), shopee(1), shopee(1), shopee(2), shopee(3), other(0)], 4)]
        for label, answer, count in rows:
            with self.subTest(label):
                self.session.rows = answer
                result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
                self.assertEqual(result['error']['code'], 'METRIC_TOO_FEW_SHOPEE')
                self.assertEqual(result['error']['detail'], {'shopeeProducts': count, 'needed': 5})
                self.assertEqual(self.remote_calls, [])               # no m1-import, no run
                self.assertIsNone(self.session.pending)               # nothing for «Gửi lại»
                self.assertFalse(self.session.busy.locked())          # can click again at once
                self.assertIsNotNone(self.session.listener)           # still listening on Metric
        self.session.rows = [shopee(i) for i in range(5)]
        self.answers = [self.OK_IMPORT, self.OK_FLOW]
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertTrue(result['ok'])
        self.assertEqual([c[0] for c in self.remote_calls], ['m1Import', 'flow'])
        self.assertEqual(len(self.remote_calls[0][2]['response']['body']['data']['products']), 5)

    def test_module_outputs_pass_link_issues_through_and_old_runs_unchanged(self):
        """CONTRACT-link-check section 5: `linkIssues` is optional; the bridge neither requires nor rewrites it."""
        issue = {'stage': 'm2', 'productBaseId': '1__1__2', 'url': 'https://shopee.vn/product/2/1',
                 'reason': 'PRODUCT_UNAVAILABLE', 'at': '2026-11-18T05:30:00Z', 'replacedBy': '1__3__4'}
        for label, extra in (('new run', {'linkIssues': [issue]}), ('empty', {'linkIssues': []}), ('old run', {})):
            with self.subTest(label):
                data = {'format': 'module-outputs-v1', 'runId': 'a1b2c3d4', 'm1': {}, 'm2': {}, **extra}
                self.answers = [{'ok': True, 'data': json.loads(json.dumps(data))}]
                self.assertEqual(self.api.moduleOutputs('a1b2c3d4'), {'ok': True, 'data': data})

    def test_run_sort_is_kept_on_this_pc(self):
        """F648: the run list order, one row each:
        | step                          | lastRunSort              |
        |-------------------------------|--------------------------|
        | nothing kept yet              | None                     |
        | remember «Cũ nhất trước»      | oldest                   |
        | remember anything else        | ARG_INVALID, oldest kept |
        """
        self.assertEqual(self.api.lastRunSort()['data'], {'runSort': None})
        self.assertTrue(self.api.rememberRunSort('oldest')['ok'])
        self.assertEqual(self.api.lastRunSort()['data'], {'runSort': 'oldest'})
        self.assertEqual(self.api.rememberRunSort('price')['error']['code'], 'ARG_INVALID')
        self.assertEqual(self.api.lastRunSort()['data'], {'runSort': 'oldest'})

    def test_product_selection_rows(self):
        """CONTRACT-F644 §5, one row each:
        | choice sent              | Shopee products | result                                                  |
        |--------------------------|-----------------|---------------------------------------------------------|
        | top 8                    | 7               | METRIC_TOO_FEW_SHOPEE {7, needed 8}; nothing sent/kept  |
        | top 8                    | 8               | m1-import has productSelection top 8; «Gửi lại» = same  |
        | all                      | 0               | METRIC_TOO_FEW_SHOPEE {0, needed 1}; nothing sent       |
        | all                      | 1               | m1-import has productSelection all                      |
        | top 0, 101, "5", True, all+count, other mode | – | ARG_INVALID; Metric not asked            |
        A valid choice is remembered when the form changes (Terra r1 #4); an invalid one is refused, not kept."""
        shopee = lambda n: [{'product_base_id': f'1__{i}', 'revenue_custom': 100 - i} for i in range(n)]
        top8, every = {'mode': 'top', 'count': 8}, {'mode': 'all'}
        for label, choice, count in (('top 8, 7', top8, 7), ('all, 0', every, 0)):
            with self.subTest(label):
                self.session.rows = shopee(count)
                result = self.api.takeMetricReviews({'collectionPolicy': POLICY, 'productSelection': choice})
                self.assertEqual(result['error']['code'], 'METRIC_TOO_FEW_SHOPEE')
                self.assertEqual(result['error']['detail'],
                                 {'shopeeProducts': count, 'needed': 8 if choice is top8 else 1})
                self.assertEqual(self.remote_calls, [])
                self.assertIsNone(self.session.pending)
        with self.subTest('top 8, 8 and the resend'):
            self.session.rows = shopee(8)
            self.answers = [tdn_shopee_app._BridgeFailure('SSH_TIMEOUT')]
            self.assertFalse(self.api.takeMetricReviews({'collectionPolicy': POLICY, 'productSelection': top8})['ok'])
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.resendMetricImport()['ok'])
            self.assertEqual(self.remote_calls[0][2]['productSelection'], top8)
            self.assertEqual(self.remote_calls[1][2], self.remote_calls[0][2])    # the same payload, same importId
        with self.subTest('all, 1'):
            self.setUp_fresh()
            self.session.rows = shopee(1)
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY, 'productSelection': every})['ok'])
            self.assertEqual(self.remote_calls[0][2]['productSelection'], every)
        with self.subTest('remembered on change'):
            self.assertEqual(self.api.rememberProductSelection(top8)['ok'], True)
            self.assertEqual(self.api.rememberProductSelection({'mode': 'top', 'count': 0})['error']['code'], 'ARG_INVALID')
            self.assertEqual(self.api.lastProductSelection()['data'], {'productSelection': top8})
            self.assertEqual(self.api.rememberProductSelection(every)['ok'], True)    # the latest wins
            self.assertEqual(self.api.lastProductSelection()['data'], {'productSelection': every})
            self.assertEqual(list(pathlib.Path(self.tmp.name).glob('*.part')), [])  # each write's own temp, gone
        for bad in ({'mode': 'top', 'count': 0}, {'mode': 'top', 'count': 101}, {'mode': 'top', 'count': '5'},
                    {'mode': 'top', 'count': True}, {'mode': 'all', 'count': 5}, {'mode': 'best'}, None):
            with self.subTest(bad=bad):
                self.setUp_fresh()
                result = self.api.takeMetricReviews({'collectionPolicy': POLICY, 'productSelection': bad})
                self.assertEqual(result['error']['code'], 'ARG_INVALID')
                self.assertEqual(self.session.fetches, 0)
                self.assertEqual(self.remote_calls, [])

    def test_delete_run_rows(self):
        """CONTRACT-F644 §4, one row each:
        | server answer                         | result                                   | picture on this PC |
        |---------------------------------------|------------------------------------------|--------------------|
        | run-delete-v1, deleted                | ok                                       | deleted            |
        | RUN_ACTIVE                            | RUN_ACTIVE                               | stays              |
        | another shape                         | REMOTE_OUTPUT_INVALID                    | stays              |
        | run-delete-v1, deleted, leftover true | ok (F644 §2 round 3)                     | deleted            |
        | leftover false or not a boolean       | REMOTE_OUTPUT_INVALID                    | stays              |
        The command is `delete-run --run <id>`, not detached."""
        picture = self.shots / 'a1b2c3d4-metric-full-page.png'
        deleted = {'format': 'run-delete-v1', 'runId': 'a1b2c3d4', 'deleted': True}
        for label, answer, code in (
                ('RUN_ACTIVE', {'ok': False, 'error': {'code': 'RUN_ACTIVE', 'message': 'RUN_ACTIVE'}}, 'RUN_ACTIVE'),
                ('shape', {'ok': True, 'data': dict(deleted, deleted=False)}, 'REMOTE_OUTPUT_INVALID'),
                ('leftover false', {'ok': True, 'data': dict(deleted, leftover=False)}, 'REMOTE_OUTPUT_INVALID'),
                ('leftover text', {'ok': True, 'data': dict(deleted, leftover='yes')}, 'REMOTE_OUTPUT_INVALID'),
                ('leftover', {'ok': True, 'data': dict(deleted, leftover=True)}, None),
                ('deleted', {'ok': True, 'data': dict(deleted)}, None)):
            with self.subTest(label):
                self.shots.mkdir(exist_ok=True)
                picture.write_bytes(b'\x89PNG')
                self.answers = [answer]
                self.remote_calls = []
                result = self.api.deleteRun('a1b2c3d4')
                self.assertEqual(self.remote_calls, [('deleteRun', 'a1b2c3d4', None)])
                if code is None:
                    self.assertEqual(result, {'ok': True, 'data': dict(answer['data'], localShotDeleted=True)})
                    self.assertFalse(picture.exists())
                else:
                    self.assertEqual(result['error']['code'], code)
                    self.assertTrue(picture.exists())
        _, lines = tdn_shopee_app.Api._remote_plan(self.api, 'deleteRun', run_id='a1b2c3d4', config=dict(self.CONFIG))
        self.assertTrue(lines[-1].endswith('shopee_flow.py" delete-run --run a1b2c3d4'))

    def test_save_metric_picture_rows(self):
        """CONTRACT-F644 §3, one row each:
        | picture source                 | dialog | result                                                      |
        |--------------------------------|--------|-------------------------------------------------------------|
        | local picture                  | a path | a copy there; the original stays; name «<run name>-<id>.png» |
        | local picture                  | cancel | nothing written                                             |
        | none here, server full page    | a path | the server picture (full-page, its sha256) written there    |
        | none here, no server picture   | –      | EVIDENCE_LOCAL_MISSING, no dialog                           |
        | local, 120-character run name  | a path | the name is cut, «-<runId>.png» kept (Terra r1 #3)          |
        |   same, name starting with «.» | a path | cleaned first, then cut: the whole suffix kept (r2 #2)      |"""
        out = pathlib.Path(self.tmp.name) / 'out'
        out.mkdir()
        self.shots.mkdir()
        original = self.shots / 'a1b2c3d4-metric-full-page.png'
        original.write_bytes(b'\x89PNG local')
        dialog = mock.Mock(return_value=str(out / 'chosen.png'))
        with mock.patch.object(tdn_shopee_app, '_choose_save_path', dialog), \
                mock.patch.object(tdn_shopee_app, '_downloads_folder', lambda: 'DOWNLOADS'):
            with self.subTest('local'):
                result = self.api.saveMetricShot('a1b2c3d4', 'Canxi: hộp/30', None)
                self.assertEqual(result['data'], {'format': 'metric-shot-save-v1', 'runId': 'a1b2c3d4',
                                                  'saved': True, 'cancelled': False, 'fileName': 'chosen.png'})
                dialog.assert_called_once_with('Canxi_ hộp_30-a1b2c3d4.png', 'DOWNLOADS')
                self.assertEqual((out / 'chosen.png').read_bytes(), b'\x89PNG local')
                self.assertEqual(original.read_bytes(), b'\x89PNG local')
            with self.subTest('cancel'):
                dialog.return_value = None
                result = self.api.saveMetricShot('a1b2c3d4', 'Canxi', None)
                self.assertEqual((result['data']['saved'], result['data']['cancelled']), (False, True))
                self.assertEqual(sorted(p.name for p in out.iterdir()), ['chosen.png'])
            with self.subTest('server'):
                original.unlink()
                dialog.return_value = str(out / 'server.png')
                digest = 'a' * 64
                descriptor = {'available': True, 'kind': 'full-page', 'sha256': digest, 'byteSize': 4,
                              'mediaType': 'image/png', 'fileName': 'full-page.png', 'errorCode': None}
                self.answers = [{'ok': True, 'data': {'format': 'module-outputs-v1', 'runId': 'a1b2c3d4',
                                                      'm1': {'evidence': {'fullPage': descriptor}}}}]
                streamed = []
                with mock.patch.object(self.api, '_stream_export',
                                       lambda *args, **kw: streamed.append((args, kw))):
                    self.assertTrue(self.api.saveMetricShot('a1b2c3d4', 'Canxi', digest)['data']['saved'])
                self.assertEqual(streamed, [(('a1b2c3d4', digest, 4, out / 'server.png'), {'evidence_kind': 'full-page'})])
            with self.subTest('none'):
                dialog.reset_mock()
                self.assertEqual(self.api.saveMetricShot('a1b2c3d4', 'Canxi', None)['error']['code'],
                                 'EVIDENCE_LOCAL_MISSING')
                dialog.assert_not_called()
            for label, name in (('long name', 'x' * 120), ('long name starting with a dot', '.' + 'x' * 119)):
                with self.subTest(label):
                    original.write_bytes(b'\x89PNG local')
                    dialog.return_value = None
                    self.api.saveMetricShot('a1b2c3d4', name, None)
                    suggested = dialog.call_args[0][0]
                    self.assertTrue(suggested.endswith('x-a1b2c3d4.png'), suggested)
                    self.assertFalse(suggested.startswith('.'), suggested)
                    self.assertLessEqual(len(suggested), 120)

    def shot_files(self):
        return sorted(path.name for path in self.shots.iterdir() if path.suffix in ('.webp', '.png')) if self.shots.exists() else []

    def test_every_click_keeps_one_full_page_shot_on_this_pc(self):
        """| click outcome                     | shots on this PC                  | sent to the server       |
        |-----------------------------------|-----------------------------------|--------------------------|
        | run created                       | <runId>-metric-full-page.webp      | payload without the shot |
        | fewer than 5 Shopee products      | metric-<time>.webp                 | nothing                  |
        | Metric stops (page error)         | metric-<time>.webp, said in error  | nothing                  |
        | send fails, then «Gửi lại»        | the same shot, linked on success  | same payload             |
        | the shot itself fails             | none; the capture still works     | payload                  |"""
        stamped = r'^metric-\d{4}-\d\d-\d\d-\d{6}(-\d+)?\.webp$'
        with self.subTest('run created'):
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual(self.shot_files(), ['a1b2c3d4-metric-full-page.webp'])
            self.assertEqual((self.shots / 'a1b2c3d4-metric-full-page.webp').read_bytes(), b'\x89PNG click')
            sent = json.dumps(self.remote_calls[0][2])
            self.assertNotIn('png', sent)
            self.assertNotIn('shot', sent.lower())
        for label, setup, code in (
                ('fewer than 5 Shopee products', lambda: setattr(self.session, 'rows', products(4)), 'METRIC_TOO_FEW_SHOPEE'),
                ('Metric stops', lambda: self.session.tab.answers.__setitem__(
                    'Runtime.evaluate', {'result': {'value': {'stop': 'CAPTURE_LOGIN_REQUIRED'}}}), 'CAPTURE_LOGIN_REQUIRED')):
            with self.subTest(label):
                self.setUp_fresh()
                setup()
                result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
                self.assertEqual(result['error']['code'], code)
                self.assertEqual(len(self.shot_files()), 1)
                self.assertRegex(self.shot_files()[0], stamped)
                self.assertEqual(self.remote_calls, [])
                if code.startswith('CAPTURE_'):
                    self.assertEqual(result['error']['detail'], {'screenshotSaved': True})
        with self.subTest('send fails, then resend'):
            self.setUp_fresh()
            self.answers = [tdn_shopee_app._BridgeFailure('SSH_TIMEOUT')]
            self.assertFalse(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertRegex(self.shot_files()[0], stamped)
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.resendMetricImport()['ok'])
            self.assertEqual(self.shot_files(), ['a1b2c3d4-metric-full-page.webp'])
            self.assertEqual(self.session.tab.methods().count('Page.captureScreenshot'), 1)
        with self.subTest('the shot fails'):
            self.setUp_fresh()

            def broken(**_):
                raise RuntimeError('capture failed')
            self.session.tab.answers['Page.captureScreenshot'] = broken
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual(self.shot_files(), [])

    def test_review_r1_rows(self):
        """Terra r1 on PR #501, one row each:
        | # | situation                                       | expected                                         |
        |---|-------------------------------------------------|--------------------------------------------------|
        | 1 | newest filter still loading (pending body)      | refused METRIC_FILTER_PENDING, picture taken     |
        | 2 | earlier evidence files and shots exist          | all kept after the click (no cleanup)            |
        | 3 | evidence/metric is a junction/symlink           | no picture written there; import goes on         |
        | 4 | page size unknown (getLayoutMetrics fails)      | no picture (never a viewport one); import goes on |
        | 5 | the shot folder cannot be made (OSError)        | no picture; import goes on                       |"""
        stamped = r'^metric-\d{4}-\d\d-\d\d-\d{6}(-\d+)?\.webp$'
        with self.subTest('1 filter still loading'):
            release = threading.Event()
            self.addCleanup(release.set)
            self.session.listener.body_wait_seconds = 0.1
            self.session.tab.answers['Network.getRequestPostData'] = lambda requestId: (
                release.wait(5), {'postData': json.dumps(page_body())})[1]
            self.session.tab.products_request(None, request_id='slow', inline=False)
            result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
            self.assertEqual(result['error']['code'], 'METRIC_FILTER_PENDING')
            self.assertEqual(result['error']['detail'], {'screenshotSaved': True})
            self.assertEqual(len(self.shot_files()), 1)
            self.assertRegex(self.shot_files()[0], stamped)
            self.assertEqual(self.remote_calls, [])
            release.set()
        with self.subTest('2 earlier evidence stays'):
            self.setUp_fresh()
            root = pathlib.Path(self.tmp.name) / 'profile'
            evidence = root / 'evidence'
            (evidence / 'metric').mkdir(parents=True)
            (evidence / 'full-page.png').write_bytes(b'old evidence')
            (evidence / 'metric' / 'run1-metric-full-page.png').write_bytes(b'old shot')
            with mock.patch.object(tdn_shopee_app, '_config_path', lambda: root / 'config.json'), \
                    mock.patch.object(tdn_shopee_app, '_metric_shot_folder', REAL_SHOT_FOLDER), \
                    mock.patch.object(tdn_shopee_app, '_evidence_folder', REAL_EVIDENCE_FOLDER):
                self.answers = [self.OK_IMPORT, self.OK_FLOW]
                self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual((evidence / 'full-page.png').read_bytes(), b'old evidence')
            self.assertEqual(sorted(p.name for p in (evidence / 'metric').iterdir()),
                             ['a1b2c3d4-metric-full-page.webp', 'run1-metric-full-page.png'])
        with self.subTest('3 linked shot folder'):
            self.setUp_fresh()
            elsewhere = pathlib.Path(self.tmp.name) / 'elsewhere'
            elsewhere.mkdir()
            if self.shots.exists():
                self.shots.rmdir()
            made = subprocess.run(['cmd', '/c', 'mklink', '/J', str(self.shots), str(elsewhere)],
                                  capture_output=True) if sys.platform == 'win32' else None
            if made is None:
                os.symlink(elsewhere, self.shots, target_is_directory=True)
            elif made.returncode != 0:
                self.skipTest('cannot make a junction here')
            drop_link = os.rmdir if sys.platform == 'win32' else os.unlink     # the link only, never its target
            self.addCleanup(lambda: mb._is_link(self.shots) and drop_link(self.shots))
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual(list(elsewhere.iterdir()), [])
            drop_link(self.shots)
        with self.subTest('4 page size unknown'):
            self.setUp_fresh()

            def no_metrics(**_):
                raise RuntimeError('no layout')
            self.session.tab.answers['Page.getLayoutMetrics'] = no_metrics
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual(self.shot_files(), [])
            self.assertNotIn('Page.captureScreenshot', self.session.tab.methods())
            self.setUp_fresh()
            self.session.tab.answers['Page.getLayoutMetrics'] = {'cssContentSize': {'width': 0, 'height': 900}}
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertNotIn('Page.captureScreenshot', self.session.tab.methods())
        with self.subTest('5 shot folder cannot be made'):
            self.setUp_fresh()
            def unreadable():
                raise PermissionError('evidence folder unreadable')
            with mock.patch.object(tdn_shopee_app, '_metric_shot_folder', unreadable):
                self.answers = [self.OK_IMPORT, self.OK_FLOW]
                self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual([c[0] for c in self.remote_calls], ['m1Import', 'flow'])

    def test_review_r2_rows(self):
        """Terra r2 on PR #501, one row each:
        | # | situation                                                   | expected                                        |
        |---|-------------------------------------------------------------|-------------------------------------------------|
        | 1 | a new products request (other filter) arrives during the shot | the import uses the click's request and filter |
        |   | on the same tab (r3: the page may show the new filter)        | the picture stays unlinked: no run picture     |
        |   | same tab, right after the click record, before the shot (r4)  | the picture stays unlinked: no run picture     |
        | 2 | `evidence/metric` is a junction/symlink holding the run picture | no local picture found, nothing opened         |"""
        with self.subTest('1 later request during the shot'):
            click_answer = self.session.tab.answers['Page.captureScreenshot']

            def shot_while_metric_moves(**params):
                self.session.tab.products_request(page_body(start_date='20261015'), request_id='later')
                return click_answer
            self.session.tab.answers['Page.captureScreenshot'] = shot_while_metric_moves
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            sent = self.remote_calls[0][2]
            self.assertEqual(sent['scope']['start_date'], '20261001')          # the click's filter
            self.assertEqual(sent['response']['requestBody']['start_date'], '20261001')
            files = self.shot_files()
            self.assertNotIn('a1b2c3d4-metric-full-page.webp', files)       # never linked to this run
            self.assertEqual(len(files), 1)
            self.assertRegex(files[0], r'^metric-\d{4}-\d\d-\d\d-\d{6}(-\d+)?\.webp$')
            self.assertEqual(self.api.localMetricShot('a1b2c3d4')['data']['exists'], False)
        with self.subTest('1b later request between the click record and the shot'):
            self.setUp_fresh()
            listener = self.session.listener
            take_record = listener.click_record

            def record_then_metric_moves():
                record = take_record()
                self.session.tab.products_request(page_body(start_date='20261020'), request_id='between')
                return record
            with mock.patch.object(listener, 'click_record', record_then_metric_moves):
                self.answers = [self.OK_IMPORT, self.OK_FLOW]
                self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
            self.assertEqual(self.remote_calls[0][2]['scope']['start_date'], '20261001')
            files = self.shot_files()
            self.assertEqual(len(files), 1)
            self.assertNotIn('a1b2c3d4-metric-full-page.webp', files)
        with self.subTest('2 junction on metric'):
            self.setUp_fresh()
            elsewhere = pathlib.Path(self.tmp.name) / 'elsewhere'
            elsewhere.mkdir()
            (elsewhere / 'a1b2c3d4-metric-full-page.png').write_bytes(b'\x89PNG')
            if self.shots.exists():
                self.shots.rmdir()
            made = subprocess.run(['cmd', '/c', 'mklink', '/J', str(self.shots), str(elsewhere)],
                                  capture_output=True) if sys.platform == 'win32' else None
            if made is None:
                os.symlink(elsewhere, self.shots, target_is_directory=True)
            elif made.returncode != 0:
                self.skipTest('cannot make a junction here')
            drop_link = os.rmdir if sys.platform == 'win32' else os.unlink
            self.addCleanup(lambda: mb._is_link(self.shots) and drop_link(self.shots))
            opened = []
            with mock.patch.object(tdn_shopee_app, '_open_local_file', opened.append):
                self.assertEqual(self.api.localMetricShot('a1b2c3d4')['data']['exists'], False)
                self.assertEqual(self.api.openLocalMetricShot('a1b2c3d4')['error']['code'], 'EVIDENCE_LOCAL_MISSING')
            self.assertEqual(opened, [])

    def test_a_missing_server_config_still_keeps_the_click_picture(self):
        """Terra r5 on PR #501: | config cannot be read | CONFIG_INVALID, 1 picture kept, payload kept for «Gửi lại» |"""
        with mock.patch.object(tdn_shopee_app, '_load_config',
                               mock.Mock(side_effect=tdn_shopee_app._BridgeFailure('CONFIG_INVALID'))):
            result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(result['error']['code'], 'CONFIG_INVALID')
        self.assertEqual(len(self.shot_files()), 1)
        self.assertRegex(self.shot_files()[0], r'^metric-\d{4}-\d\d-\d\d-\d{6}(-\d+)?\.webp$')
        self.assertEqual(self.remote_calls, [])
        self.assertIsNotNone(self.session.pending)
        self.answers = [self.OK_IMPORT, self.OK_FLOW]
        self.assertTrue(self.api.resendMetricImport()['ok'])
        self.assertEqual(self.shot_files(), ['a1b2c3d4-metric-full-page.webp'])

    def setUp_fresh(self):
        """A new click world in the same test: new session, empty shot folder, no remote calls."""
        for path in self.shot_files():
            (self.shots / path).unlink()
        self.session = FakeSession(self.tmp.name)
        self.api._metric = self.session
        self.remote_calls = []
        self.answers = []

    def test_the_run_picture_opens_from_this_pc(self):
        """| local shot for the run | localMetricShot | openLocalMetricShot          |
        |------------------------|-----------------|------------------------------|
        | present                | exists          | opens that file              |
        | absent                 | not exists      | EVIDENCE_LOCAL_MISSING       |"""
        opened = []
        with mock.patch.object(tdn_shopee_app, '_open_local_file', opened.append):
            self.assertEqual(self.api.localMetricShot('a1b2c3d4')['data']['exists'], False)
            self.assertEqual(self.api.openLocalMetricShot('a1b2c3d4')['error']['code'], 'EVIDENCE_LOCAL_MISSING')
            self.shots.mkdir()
            (self.shots / 'a1b2c3d4-metric-full-page.png').write_bytes(b'\x89PNG')
            self.assertEqual(self.api.localMetricShot('a1b2c3d4')['data'],
                             {'format': 'local-metric-shot-v1', 'runId': 'a1b2c3d4', 'exists': True})
            self.assertTrue(self.api.openLocalMetricShot('a1b2c3d4')['ok'])
        self.assertEqual(opened, [self.shots / 'a1b2c3d4-metric-full-page.png'])
        self.assertEqual(self.remote_calls, [])

    def test_m1_import_plan_sends_the_payload_on_stdin(self):
        payload = {'format': 'metric-user-page-import-v1', 'keyword': 'cà phê'}
        _, lines = tdn_shopee_app.Api._remote_plan(self.api, 'm1Import', payload=payload, config=dict(self.CONFIG))
        self.assertEqual(tdn_shopee_app._COMMANDS['m1Import'], ('m1-import', '--stdin'))
        command = lines[-1]
        self.assertTrue(command.endswith('| base64 -d | python3 "$HOME/repo/shopee_flow.py" m1-import --stdin'))
        encoded = re.match(r"printf '%s' '([A-Za-z0-9+/=]+)'", command).group(1)
        self.assertEqual(json.loads(base64.b64decode(encoded).decode('utf-8')), payload)

    def test_click_imports_then_starts_the_whole_flow_not_m2(self):
        self.answers = [self.OK_IMPORT, self.OK_FLOW]
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(result, {'ok': True, 'data': {'runId': 'a1b2c3d4', 'reused': False, 'step2': {'ok': True}}})
        self.assertEqual([c[0] for c in self.remote_calls], ['m1Import', 'flow'])   # `run --run <id> --detach`
        self.assertEqual(self.remote_calls[1][1], 'a1b2c3d4')
        _, lines = tdn_shopee_app.Api._remote_plan(self.api, 'flow', run_id='a1b2c3d4', config=dict(self.CONFIG))
        self.assertTrue(lines[-1].endswith('shopee_flow.py" run --run a1b2c3d4 --detach'))
        sent = self.remote_calls[0][2]
        self.assertEqual(sent['keyword'], 'canxi')
        self.assertEqual(sent['collectionPolicy'], POLICY)
        self.assertIsNone(self.session.pending)
        self.assertIsNotNone(self.session.listener)    # owner 25/11 «keep listening»: it goes on after the run
        self.assertFalse(self.session.tab.stopped)
        self.assertEqual(self.session.listener.attached_ids(), ['a'])
        self.assertIsNone(self.session.pending)
        self.assertNotIn('Runtime.enable', self.session.tab.methods())

    def test_after_a_run_the_next_clicks_need_no_open_metric(self):
        """Owner 25/11 «keep listening» + «Allow new run»; one click each, no «Mở Metric» between:
        | click                          | sent to m1-import                         |
        |--------------------------------|-------------------------------------------|
        | 1. filter «canxi»              | keyword canxi, import id A                |
        | 2. filter changed to «dau ca»  | keyword dau ca, import id B (new run)     |
        | 3. same filter «dau ca» again  | keyword dau ca, import id C (new run)     |"""
        self.answers = [self.OK_IMPORT, self.OK_FLOW]
        self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
        self.session.tab.products_request(page_body(include_query={**page_body()['include_query'],
                                                                   'queries': ['dau ca']}), request_id='r2')
        for _ in range(2):
            self.answers = [self.OK_IMPORT, self.OK_FLOW]
            self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
        imports = [c[2] for c in self.remote_calls if c[0] == 'm1Import']
        self.assertEqual([p['keyword'] for p in imports], ['canxi', 'dau ca', 'dau ca'])
        self.assertEqual(len({p['importId'] for p in imports}), 3)
        self.assertEqual([c[0] for c in self.remote_calls], ['m1Import', 'flow'] * 3)
        self.assertEqual(self.session.listener.attached_ids(), ['a'])
        self.assertIsNone(self.session.pending)

    def test_a_failed_send_keeps_the_payload_and_resend_does_not_ask_metric_again(self):
        self.answers = [tdn_shopee_app._BridgeFailure('SSH_TIMEOUT')]
        first = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(first['error'], {'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT', 'detail': {'pending': True}})
        kept = self.session.pending
        self.assertIsNotNone(kept)
        again = self.api.takeMetricReviews({'collectionPolicy': POLICY})
        self.assertEqual(again['error']['code'], 'METRIC_IMPORT_PENDING')
        self.answers = [self.OK_IMPORT, self.OK_FLOW]
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

    def test_no_search_keyword_never_blocks_the_capture(self):
        body = page_body()
        body['include_query']['queries'] = []
        self.session.tab.products_request(body)
        self.answers = [self.OK_IMPORT, self.OK_FLOW]
        self.assertTrue(self.api.takeMetricReviews({'collectionPolicy': POLICY})['ok'])
        self.assertEqual(self.remote_calls[0][2]['keyword'], 'Metric 01/10–31/10/2026')

    def test_a_typed_name_is_no_longer_accepted(self):
        result = self.api.takeMetricReviews({'collectionPolicy': POLICY, 'keyword': 'Tên lượt'})
        self.assertEqual(result['error']['code'], 'ARG_INVALID')
        self.assertEqual(self.session.fetches, 0)

    def test_invalid_policy_is_refused_before_metric(self):
        result = self.api.takeMetricReviews({'collectionPolicy': dict(POLICY, totalPerLink=0)})
        self.assertEqual(result['error']['code'], 'ARG_INVALID')
        self.assertEqual(self.session.fetches, 0)

    def test_state_has_only_what_the_card_shows(self):
        state = self.api.metricBrowserState()
        self.assertEqual(set(state['data']), {'chromeOpen', 'listening', 'seen', 'busy', 'pending'})
        self.assertTrue(state['data']['seen'])
        self.assertTrue(state['data']['chromeOpen'])
        self.assertNotIn('body', json.dumps(state))


class LostLinkTest(unittest.TestCase):
    """The link to a Metric tab dies by itself (owner PC 25/11: 0 connections, the app still «attached»).

    | row | situation                                              | expected                                             |
    |-----|--------------------------------------------------------|------------------------------------------------------|
    | 1   | link drops, tab still on Metric                        | next poll: old link stopped, a new link attached     |
    | 2   | filter seen before the drop, nothing new after         | capture: METRIC_FILTER_UNAVAILABLE, Metric not asked |
    | 3   | a new filter after the reconnect                       | capture uses that new filter                         |
    | 4   | link drops between freeze and the Metric request       | METRIC_FILTER_UNAVAILABLE, nothing sent on dead link |
    | 5   | link drops during the Metric request                   | METRIC_FILTER_UNAVAILABLE                            |
    | 6   | live link, the request itself fails                    | METRIC_EVALUATE_FAILED (unchanged)                   |
    | 7   | link drops on tab A, newest filter is on live tab B    | capture uses B                                       |
    | 8   | real vendored Tab: socket closed by Chrome / by stop() | connection_lost() True / False                       |
    """
    FILTER_OLD = page_body(start_date='20260801')
    FILTER_NEW = page_body(start_date='20260901')

    def setUp(self):
        self.world = World([target('a', 'https://metric.vn/analytics'), target('b', 'https://metric.vn/analytics')])
        self.listener = self.world.listener()
        self.listener.body_wait_seconds = 0.3
        self.listener.poll()
        self.a, self.b = self.world.tabs
        self.answers = self.world.answers
        self.a.answers = self.b.answers = self.answers
        self.addCleanup(self.listener.stop_all)
        self.session = mb.MetricSession(tempfile.gettempdir(),
                                        launcher=mock.Mock(is_alive=lambda port: True, saved_port=lambda: 9))
        self.session.listener = self.listener
        self.evaluated = []

        def evaluate(expression, awaitPromise, returnByValue):
            arg, _ = parse_call(expression)
            self.evaluated.append(arg['requestBody'])
            return {'result': {'value': {'urlPath': arg['urlPath'], 'method': 'POST', 'status': 200,
                                         'requestBody': arg['requestBody'],
                                         'body': {'status': 'success', 'data': {'products': products(5)}}}}}
        self.answers['Runtime.evaluate'] = evaluate

    def capture_code(self):
        with self.assertRaises(mb.MetricFailure) as caught:
            self.session.capture(POLICY)
        return caught.exception.code

    def new_link(self, tid):
        live = self.world.live(tid)
        self.assertEqual(len(live), 1, tid + ': one live link')
        return live[0]

    def test_row1_a_dropped_link_is_replaced_on_the_next_poll(self):
        self.a.lost = True
        self.listener.poll()
        self.assertTrue(self.a.stopped)
        self.assertEqual(self.listener.attached_ids(), ['a', 'b'])
        self.assertIsNot(self.new_link('a'), self.a)
        self.assertEqual(self.new_link('a').methods(), ['Network.enable'])

    def test_row2_3_the_filter_from_before_the_drop_is_never_used(self):
        self.a.products_request(self.FILTER_OLD, request_id='old')
        self.a.lost = True
        self.listener.poll()
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_UNAVAILABLE')
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_UNAVAILABLE')
        self.assertIsNone(self.listener.latest())
        self.assertEqual(self.evaluated, [])
        self.new_link('a').products_request(self.FILTER_NEW, request_id='new')
        self.assertEqual(self.session.capture(POLICY)['scope']['start_date'], '20260901')
        self.assertEqual(self.evaluated[0]['start_date'], '20260901')

    def test_row4_a_drop_after_the_freeze_never_asks_the_dead_link(self):
        self.a.products_request(self.FILTER_OLD, request_id='old')
        frozen = self.listener.freeze()
        self.a.lost = True
        with self.assertRaises(mb.MetricFailure) as caught:
            self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
        self.assertEqual(caught.exception.code, 'METRIC_FILTER_UNAVAILABLE')
        self.assertNotIn('Runtime.evaluate', self.a.methods())
        self.assertTrue(self.a.stopped)
        self.assertEqual(self.listener.attached_ids(), ['b'])
        self.listener.poll()
        self.assertEqual(self.listener.attached_ids(), ['a', 'b'])
        self.assertEqual(self.capture_code(), 'METRIC_FILTER_UNAVAILABLE')

    def test_row5_6_a_failed_request_is_named_by_whether_the_link_died(self):
        for dies, code in ((True, 'METRIC_FILTER_UNAVAILABLE'), (False, 'METRIC_EVALUATE_FAILED')):
            with self.subTest(dies=dies):
                tab = self.new_link('a')
                tab.products_request(self.FILTER_OLD, request_id='r-' + str(dies))
                frozen = self.listener.freeze()

                def failing(expression, awaitPromise, returnByValue, tab=tab, dies=dies):
                    tab.lost = dies
                    raise RuntimeError('socket closed' if dies else 'Calling Runtime.evaluate timeout')
                tab.answers = {'Runtime.evaluate': failing}
                with self.assertRaises(mb.MetricFailure) as caught:
                    self.listener.fetch_top_products(frozen, 'async function requestV3InPage() {}')
                self.assertEqual(caught.exception.code, code)
                self.assertEqual(tab.stopped, dies)
                self.listener.poll()

    def test_row7_a_drop_on_one_tab_keeps_the_newer_filter_of_the_live_tab(self):
        self.a.products_request(self.FILTER_OLD, request_id='old', timestamp=1.0)
        self.b.products_request(self.FILTER_NEW, request_id='new', timestamp=2.0)
        self.a.lost = True
        self.listener.poll()
        self.assertEqual(self.session.capture(POLICY)['scope']['start_date'], '20260901')
        self.assertNotIn('Runtime.evaluate', self.a.methods())

    @unittest.skipUnless(importlib.util.find_spec('websocket'), 'needs websocket-client for the vendored Tab')
    def test_row8_the_vendored_tab_tells_a_dropped_socket_from_its_own_stop(self):
        import websocket
        from vendor_pychrome import Tab

        class Socket:
            def __init__(self):
                self.closed = threading.Event()

            def settimeout(self, _):
                pass

            def recv(self):
                if self.closed.wait(0.05):
                    raise websocket.WebSocketConnectionClosedException('closed')
                raise websocket.WebSocketTimeoutException('idle')

            def close(self):
                self.closed.set()

        for chrome_closes, expected in ((True, True), (False, False)):
            with self.subTest(chrome_closes=chrome_closes):
                sock = Socket()
                with mock.patch.object(websocket, 'create_connection', return_value=sock), \
                        mock.patch('vendor_pychrome.tab.logger'):
                    tab = Tab(**target('a', 'https://metric.vn/analytics'))
                    tab.start()
                    self.assertFalse(tab.connection_lost())
                    if chrome_closes:
                        sock.close()
                    else:
                        tab.stop()
                    wait_until(lambda: not tab._recv_th.is_alive(), 'receive loop ended')
                    self.assertEqual(tab.connection_lost(), expected)


if __name__ == '__main__':
    unittest.main()

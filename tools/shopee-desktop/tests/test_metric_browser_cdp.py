"""Real local Chrome, local test pages on 127.0.0.1. No Metric, Shopee or Jev.

Test-only overrides: the listener's allowed host is 127.0.0.1 and its products URL is the
local server; `localhost` (same server, different host name) plays "another site". Chrome
runs headless with a throw-away profile and is killed at the end (the app never closes it).

Skipped when Chrome/Edge or `websocket-client` is not installed.
"""
import http.server
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_metric_browser as mb  # noqa: E402

try:
    BROWSER = mb.get_browser_info()
except mb.MetricFailure:
    BROWSER = None   # not a Windows machine with Chrome/Edge: nothing real to drive
try:
    import websocket  # noqa: F401
    from vendor_pychrome import Tab
    WEBSOCKET = True
except ImportError:
    WEBSOCKET = False


class RequirementsTest(unittest.TestCase):
    def test_websocket_client_is_installed_where_chrome_is(self):
        """Not a silent skip: with Chrome present the real test needs websocket-client
        (tools/shopee-desktop/requirements.txt)."""
        if BROWSER is None:
            self.skipTest('no Chrome or Edge on this machine')
        self.assertTrue(WEBSOCKET, 'pip install -r tools/shopee-desktop/requirements.txt (websocket-client)')

PAGE = '''<!doctype html><meta charset="utf-8"><title>local metric</title>
<body style="background:#fff">local page
<script>
window.sent = 0;
window.send = function () {
  window.sent += 1;
  var q = new URLSearchParams(location.search);
  return fetch('/v2/market/analytics/products/', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({start_date: '20261001', end_date: q.get('end') || '20261031', page: 1, limit: 20,
      sort_by: 'sold_custom__desc', fields: null,
      include_query: {queries: [q.get('kw') || 'canxi'], platforms: [1]}})});
};
send();
</script>'''


class Handler(http.server.BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *args):
        pass

    def do_GET(self):
        body = (PAGE if self.path.startswith('/app.html') else '<!doctype html><title>other</title>other').encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        Handler.seen.append(json.loads(self.rfile.read(length) or b'null'))
        body = json.dumps({'status': 'success', 'data': {'products': [{'product_base_id': '1__1'}]}}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class QuietServer(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass   # Chrome being killed at the end resets its keep-alive sockets


def wait_for(check, label, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        value = check()
        if value:
            return value
        time.sleep(0.1)
    raise AssertionError('timeout: ' + label)


@unittest.skipIf(BROWSER is None or not WEBSOCKET, 'needs Chrome or Edge and websocket-client')
class RealChromeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = QuietServer(('127.0.0.1', 0), Handler)
        cls.http_port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.folder = tempfile.mkdtemp()
        cls.procs = []

        def spawn(args):   # test-only: headless, so no window appears during the test
            cls.procs.append(subprocess.Popen(args[:-1] + ['--headless=new', args[-1]],
                                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        cls.launcher = mb.ChromeLauncher(cls.folder, spawn=spawn)
        cls.opened = cls.launcher.open_chrome('about:blank')

    @classmethod
    def tearDownClass(cls):
        for proc in cls.procs:
            if sys.platform == 'win32':
                subprocess.run(['taskkill', '/T', '/F', '/PID', str(proc.pid)], capture_output=True)
            else:
                proc.kill()
            proc.wait(10)
        cls.server.shutdown()
        shutil.rmtree(cls.folder, ignore_errors=True)

    def url(self, path, host='127.0.0.1'):
        return f'http://{host}:{self.http_port}{path}'

    def targets(self):
        with urllib.request.urlopen(f'http://127.0.0.1:{self.opened["port"]}/json/list', timeout=5) as r:
            return json.loads(r.read())

    def controller(self, target_id):
        """Test-only second connection that drives the page like a user would."""
        target = next(t for t in self.targets() if t['id'] == target_id)
        tab = Tab(**target)
        tab.start()
        self.addCleanup(tab.stop)
        return tab

    def test_listen_two_tabs_leave_and_return_then_one_evaluate(self):
        self.assertFalse(self.opened['reused'])
        self.assertTrue(self.launcher.is_app_chrome(self.opened['port']))
        self.assertEqual(self.launcher.open_chrome()['reused'], True)   # second click reuses it

        sent_methods = []

        def factory(target):
            tab = Tab(**target)
            original = tab.call_method

            def recording(method, *args, **kwargs):
                sent_methods.append(method)
                return original(method, *args, **kwargs)
            tab.call_method = recording
            return tab
        listener = mb.MetricListener(self.opened['port'], hosts={'127.0.0.1'},
                                     api_origin=self.url(''), tab_factory=factory)
        self.addCleanup(listener.stop_all)

        # New Chrome: attach to about:blank, then navigate; the first request is not missed.
        self.assertTrue(listener.attach_blank_and_open(self.url('/app.html?end=20261031')))
        first = wait_for(listener.latest, 'first products request')
        first_id = first['targetId']
        self.assertEqual(first['body']['end_date'], '20261031')

        # A second tab (opened by the test through /json/new) is found by the next poll.
        request = urllib.request.Request(f'http://127.0.0.1:{self.opened["port"]}/json/new?' +
                                         urllib.parse.quote(self.url('/app.html?end=20261030&kw=kem'), safe=''),
                                         method='PUT')
        with urllib.request.urlopen(request, timeout=5) as r:
            second_id = json.loads(r.read())['id']
        wait_for(lambda: any(t['id'] == second_id and t['url'].startswith('http') for t in self.targets()), 'tab 2 loaded')
        listener.poll()
        self.assertEqual(listener.attached_ids(), sorted([first_id, second_id]))
        self.controller(second_id).call_method('Runtime.evaluate', expression='send()', awaitPromise=True, _timeout=10)
        latest = wait_for(lambda: (listener.latest() or {}).get('targetId') == second_id and listener.latest(), 'tab 2 request')
        self.assertEqual((latest['body']['end_date'], mb.keyword_of(latest['body'])), ('20261030', 'kem'))

        # Tab 1 leaves for another host: detached at once, not re-attached while away, back on return.
        drive = self.controller(first_id)
        drive.call_method('Page.navigate', url=self.url('/other.html', host='localhost'), _timeout=10)
        wait_for(lambda: first_id not in listener.attached_ids(), 'detach on leaving')
        wait_for(lambda: any(t['id'] == first_id and 'localhost' in t['url'] for t in self.targets()), 'away committed')
        listener.poll()
        self.assertNotIn(first_id, listener.attached_ids())
        drive.call_method('Page.navigate', url=self.url('/app.html?end=20261029'), _timeout=10)
        wait_for(lambda: any(t['id'] == first_id and '127.0.0.1' in t['url'] for t in self.targets()), 'back')
        listener.poll()
        self.assertIn(first_id, listener.attached_ids())
        drive.call_method('Runtime.evaluate', expression='send()', awaitPromise=True, _timeout=10)
        latest = wait_for(lambda: (listener.latest() or {}).get('targetId') == first_id and listener.latest(), 'tab 1 again')
        self.assertEqual(latest['body']['end_date'], '20261029')

        # One evaluate with the real shared function: on a non-Metric origin it stops by itself.
        frozen = listener.freeze()
        shots = pathlib.Path(self.folder) / 'evidence' / 'metric'
        shots.parent.mkdir()
        picture = listener.full_page_shot(frozen, shots)     # real Chrome: full page, beyond the viewport
        self.assertEqual(picture.read_bytes()[:8], b'\x89PNG\r\n\x1a\n')
        self.assertEqual(list(shots.glob('metric-*.png')), [picture])
        with self.assertRaises(mb.MetricFailure) as caught:
            listener.fetch_top_products(frozen, mb.request_in_page_source(), screenshot_saved=True)
        self.assertEqual(caught.exception.code, 'CAPTURE_ORIGIN_CHANGED')
        self.assertEqual(caught.exception.detail, {'screenshotSaved': True})

        # The same path with a local stand-in function: the reply comes back by value and the
        # app's own request is not taken as the user's filter.
        stand_in = ('async function requestV3InPage({ urlPath, requestBody }) {'
                    " const r = await fetch(urlPath, {method: 'POST', headers: {'Content-Type': 'application/json'},"
                    ' body: JSON.stringify(requestBody)});'
                    " return { urlPath, method: 'POST', status: r.status, requestBody, body: await r.json() }; }")
        before = listener.latest()
        Handler.seen.clear()
        response = listener.fetch_top_products(frozen, stand_in)
        self.assertEqual(response['requestBody'], mb.top_products_body(frozen['body']))
        self.assertEqual(Handler.seen, [mb.top_products_body(frozen['body'])])
        self.assertEqual(response['body']['status'], 'success')
        time.sleep(0.5)
        self.assertEqual(listener.latest()['seq'], before['seq'])

        # Suppression ended with that call: the user sending the identical body is recorded.
        top = json.dumps(mb.top_products_body(frozen['body']))
        drive.call_method('Runtime.evaluate', awaitPromise=True, _timeout=10, expression=(
            "fetch('/v2/market/analytics/products/', {method: 'POST', headers: {'Content-Type': "
            "'application/json'}, body: JSON.stringify(" + top + ")}).then(r => r.status)"))
        wait_for(lambda: listener.latest()['seq'] != before['seq'], 'identical user request recorded')
        self.assertEqual(listener.latest()['body'], mb.top_products_body(frozen['body']))

        self.assertNotIn('Runtime.enable', sent_methods)
        self.assertIn('Network.enable', sent_methods)
        listener.stop_all()
        self.assertEqual(listener.attached_ids(), [])
        self.assertEqual(len([t for t in self.targets() if t['type'] == 'page']), 2)   # no tab closed


if __name__ == '__main__':
    unittest.main()

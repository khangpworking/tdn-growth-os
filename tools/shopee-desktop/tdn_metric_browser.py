"""Step 1: the user's own Chrome on Metric, and the products request it sends.

Two parts:

1. ``ChromeLauncher``: a 1:1 port of MetricA ``src/browser.js`` (``getBrowserInfo``,
   ``profileDir``, ``portFile``, ``freePort``, ``isAlive``, ``savedPort``, ``openChrome``).
   Same discovery order, same flags, same 20 s wait, same reuse rule and the same
   Vietnamese messages. The ``METRICA_BROWSER`` / ``METRICA_EXTRA_ARGS`` environment hooks
   are dropped. Added: the saved port must still be the Chrome the app started (the port
   file also keeps that Chrome's browser socket id, unique per Chrome process).
2. ``MetricListener``: attaches (vendored pychrome, one socket per tab) only to ``page``
   targets on ``metric.vn`` / ``www.metric.vn``, keeps the last products ``postData`` per
   tab, detaches as soon as a tab's main frame navigates to another host, and re-attaches
   when the tab is back on Metric. It never calls ``Runtime.enable``, never closes Chrome
   and never closes, opens or focuses a tab.

Request bodies stay in memory only. Nothing here logs or prints them.
"""
import base64
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid

METRIC_HOSTS = frozenset({'metric.vn', 'www.metric.vn'})
START_URL = 'https://metric.vn/analytics'
API_ORIGIN = 'https://apiv4.metric.vn'
PRODUCTS_PATH = '/v2/market/analytics/products/'
TOP_PRODUCTS = {'limit': 100, 'page': 0, 'sort_by': 'revenue_custom__desc'}
IMPORT_FORMAT = 'metric-user-page-import-v1'
IMPORT_MAX_BYTES = 8 * 1024 * 1024
EVALUATE_TIMEOUT = 60          # > the 45 s HTTP timeout inside requestV3InPage
POLL_SECONDS = 2
REATTACH_GRACE_SECONDS = 15
PLATFORM_NAMES = {1: 'Shopee', 2: 'Lazada', 3: 'Tiki', 8: 'TikTok'}
_JS_NAME = 'request-in-page.js'
_JS_START = 'export async function requestV3InPage('


class MetricFailure(Exception):
    """A static code for the page; ``message`` is an optional Vietnamese sentence."""

    def __init__(self, code, message=None, detail=None):
        super().__init__(code)
        self.code = code
        self.message = message
        self.detail = detail


# ---------------------------------------------------------------- browser.js port

def _exists(path):
    try:
        return bool(path) and os.path.exists(path)
    except (OSError, ValueError):
        return False


def get_browser_info(env=None, exists=_exists):
    """Chrome first, then Edge (same Chromium core, present on Windows). browser.js order."""
    env = os.environ if env is None else env
    pf = env.get('ProgramFiles') or 'C:\\Program Files'
    pf86 = env.get('ProgramFiles(x86)') or 'C:\\Program Files (x86)'
    local = env.get('LOCALAPPDATA') or ''
    candidates = [
        ('Google Chrome', os.path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe')),
        ('Google Chrome', os.path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ]
    if local:
        candidates.append(('Google Chrome', os.path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')))
    candidates.append(('Microsoft Edge', os.path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')))
    candidates.append(('Microsoft Edge', os.path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')))
    for label, path in candidates:
        if exists(path):
            return {'label': label, 'path': path}
    raise MetricFailure('CHROME_NOT_FOUND',
                        'Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy. Hãy cài Google Chrome.')


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(('127.0.0.1', 0))
        return server.getsockname()[1]


def _http_json(url, timeout):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        if response.status != 200:
            raise OSError('status')
        return json.loads(response.read().decode('utf-8'))


class ChromeLauncher:
    """Opens the real Chrome with the app's own profile and a local debug port."""

    def __init__(self, base_dir, browser_info=get_browser_info, spawn=None, sleep=time.sleep):
        self.base_dir = Path(base_dir)
        self._browser_info = browser_info
        self._spawn = spawn or self._spawn_detached
        self._sleep = sleep

    def profile_dir(self):
        return self.base_dir / 'metric-chrome-profile'

    def port_file(self):
        return self.base_dir / 'metric-debug-port.txt'

    def saved_port(self):
        try:
            return int(self.port_file().read_text(encoding='utf-8').splitlines()[0].strip()) or None
        except (OSError, ValueError, IndexError):
            return None

    @staticmethod
    def is_alive(port):
        """``/json/version`` answers within 1.5 s (browser.js ``isAlive``)."""
        if not port:
            return False
        try:
            _http_json(f'http://127.0.0.1:{port}/json/version', 1.5)
            return True
        except (OSError, ValueError):
            return False

    @staticmethod
    def _browser_socket(port):
        version = _http_json(f'http://127.0.0.1:{port}/json/version', 1.5)
        url = version.get('webSocketDebuggerUrl') if isinstance(version, dict) else None
        return urllib.parse.urlsplit(url).path if isinstance(url, str) else None

    def is_app_chrome(self, port):
        """Alive, and still the Chrome the app started: the port file keeps the port and that
        Chrome's browser socket path (``/devtools/browser/<id>``, new for every Chrome process)."""
        if not port:
            return False
        try:
            version = _http_json(f'http://127.0.0.1:{port}/json/version', 1.5)
            lines = self.port_file().read_text(encoding='utf-8').splitlines()
        except (OSError, ValueError):
            return False
        socket_url = version.get('webSocketDebuggerUrl') if isinstance(version, dict) else None
        if len(lines) < 2 or not isinstance(socket_url, str):
            return False
        return lines[0].strip() == str(port) and urllib.parse.urlsplit(socket_url).path == lines[1].strip()

    @staticmethod
    def _spawn_detached(args):
        options = {'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL,
                   'close_fds': True}
        if sys.platform == 'win32':
            options['creationflags'] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            options['start_new_session'] = True
        subprocess.Popen(args, **options)

    def open_chrome(self, start_url='about:blank'):
        """Open the real Chrome (or reuse the one already open). Returns {port, browserName, reused}."""
        old = self.saved_port()
        if self.is_app_chrome(old):
            return {'port': old, 'browserName': 'Chrome của app (đang mở)', 'reused': True}
        info = self._browser_info()
        profile = self.profile_dir()
        profile.mkdir(parents=True, exist_ok=True)
        port = free_port()
        args = [
            info['path'],
            f'--user-data-dir={profile}',
            f'--remote-debugging-port={port}',
            '--remote-debugging-address=127.0.0.1',
            '--no-first-run',
            '--no-default-browser-check',
            '--start-maximized',
            start_url,
        ]
        try:
            self._spawn(args)
        except OSError:
            raise MetricFailure('CHROME_START_FAILED', 'Không mở được Chrome trên máy này.') from None
        for _ in range(40):  # wait for the debug port, at most 20 s
            if self.is_alive(port):
                try:
                    socket_path = self._browser_socket(port)
                except (OSError, ValueError):
                    socket_path = None
                self.port_file().write_text(f'{port}\n{socket_path or ""}\n', encoding='utf-8')
                return {'port': port, 'browserName': info['label'], 'reused': False}
            self._sleep(0.5)
        raise MetricFailure(
            'CHROME_START_FAILED',
            'Đã mở Chrome nhưng không kết nối được. Nếu cửa sổ Chrome của app đang mở từ trước, '
            'hãy đóng hết cửa sổ đó rồi bấm "Mở Metric" lại.')


def short_error(error):
    """metricScraper.js ``shortError``: first line only, no colour codes."""
    text = str(getattr(error, 'message', None) or error)
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    return re.split(r'\n|Call log:', text)[0].strip()


# ---------------------------------------------------------------- pure request helpers

def host_of(url):
    try:
        return (urllib.parse.urlsplit(url).hostname or '').lower()
    except (TypeError, ValueError):
        return ''


def is_metric_page(url, hosts=METRIC_HOSTS):
    try:
        parts = urllib.parse.urlsplit(url)
    except (TypeError, ValueError):
        return False
    return parts.scheme in ('https', 'http') and (parts.hostname or '').lower() in hosts


def canonical(value):
    """Sorted keys, types kept, compact. Matches the contract's normalised comparison."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def scope_of(body):
    if not isinstance(body, dict):
        raise MetricFailure('METRIC_FILTER_INVALID')
    return {k: copy.deepcopy(v) for k, v in body.items() if k not in TOP_PRODUCTS}


def top_products_body(body):
    """The page's own body with only limit/page/sort_by changed."""
    request = scope_of(body)
    request.update(TOP_PRODUCTS)
    return request


def keyword_of(body):
    query = body.get('include_query') if isinstance(body, dict) else None
    queries = query.get('queries') if isinstance(query, dict) else None
    if isinstance(queries, list) and queries and isinstance(queries[0], str):
        keyword = queries[0].strip()
        if 1 <= len(keyword) <= 120:
            return keyword
    return None


def _date_text(value):
    if isinstance(value, str) and len(value) == 8 and value.isdigit():
        return f'{value[6:8]}/{value[4:6]}/{value[0:4]}'
    return None


def filter_summary(body):
    """Plain view of the last filter: period, platforms, keyword."""
    start, end = _date_text(body.get('start_date')), _date_text(body.get('end_date'))
    query = body.get('include_query') if isinstance(body.get('include_query'), dict) else {}
    platforms = query.get('platforms')
    names = []
    if isinstance(platforms, list):
        for value in platforms:
            name = PLATFORM_NAMES.get(value) if type(value) is int else None
            if name and name not in names:
                names.append(name)
    return {'period': f'{start} – {end}' if start and end else None,
            'platforms': ', '.join(names) if names else None,
            'keyword': keyword_of(body)}


def _valid_scope(scope):
    start, end = scope.get('start_date'), scope.get('end_date')
    for value in (start, end):
        if not (isinstance(value, str) and len(value) == 8 and value.isdigit()):
            return False
        try:
            dt.date(int(value[:4]), int(value[4:6]), int(value[6:]))
        except ValueError:
            return False
    return start <= end


def build_import_payload(*, import_id, keyword, captured_at, collection_policy, scope, response):
    """The exact `metric-user-page-import-v1` stdin object (CONTRACT-m1-import.md)."""
    try:
        if uuid.UUID(import_id).version != 4 or str(uuid.UUID(import_id)) != import_id:
            raise MetricFailure('IMPORT_INPUT_INVALID')
    except (TypeError, ValueError, AttributeError):
        raise MetricFailure('IMPORT_INPUT_INVALID') from None
    if not isinstance(keyword, str) or keyword != keyword.strip() or not 1 <= len(keyword) <= 120:
        raise MetricFailure('IMPORT_INPUT_INVALID')
    if not isinstance(scope, dict) or set(scope) & set(TOP_PRODUCTS) or not _valid_scope(scope):
        raise MetricFailure('IMPORT_INPUT_INVALID')
    if not isinstance(response, dict) or set(response) != {'urlPath', 'method', 'status', 'requestBody', 'body'}:
        raise MetricFailure('METRIC_RESPONSE_INVALID')
    expected = dict(copy.deepcopy(scope), **TOP_PRODUCTS)
    body = response['body']
    products = body.get('data', {}).get('products') if isinstance(body, dict) and isinstance(body.get('data'), dict) else None
    if (response['urlPath'] != PRODUCTS_PATH or response['method'] != 'POST' or response['status'] != 200 or
            canonical(response['requestBody']) != canonical(expected) or body.get('status') != 'success' or
            not isinstance(products, list) or len(products) > 100):
        raise MetricFailure('METRIC_RESPONSE_INVALID')
    payload = {'format': IMPORT_FORMAT, 'importId': import_id, 'keyword': keyword, 'capturedAt': captured_at,
               'collectionPolicy': copy.deepcopy(collection_policy), 'scope': copy.deepcopy(scope),
               'response': {k: response[k] for k in ('urlPath', 'method', 'status', 'requestBody', 'body')}}
    if len(canonical(payload).encode('utf-8')) > IMPORT_MAX_BYTES:
        raise MetricFailure('IMPORT_TOO_LARGE')
    return payload


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def shared_js_path():
    """The shared in-page function: bundled next to the app, else the repository copy."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / _JS_NAME
    here = Path(__file__).resolve().parent
    return here.parent / 'opencli-metric' / 'clis' / 'metric' / _JS_NAME


def request_in_page_source(path=None):
    """`async function requestV3InPage(...) {...}` from the shared file, without `export`."""
    text = Path(path or shared_js_path()).read_text(encoding='utf-8')
    start = text.find(_JS_START)
    if start < 0:
        raise MetricFailure('METRIC_SCRIPT_MISSING')
    return text[start + len('export '):].strip()


def evaluate_expression(source, request):
    return '(' + source + ')(' + json.dumps(request, ensure_ascii=False, allow_nan=False) + ')'


# ---------------------------------------------------------------- tab listener

def _default_tab_factory(target):
    from vendor_pychrome import Tab
    return Tab(**target)


class _TabState:
    __slots__ = ('target_id', 'tab', 'last', 'away_since', 'seen_away')

    def __init__(self, target_id):
        self.target_id = target_id
        self.tab = None
        self.last = None          # {'body', 'seq', 'key', 'at'}
        self.away_since = None    # detached because the main frame left Metric
        self.seen_away = False


class MetricListener:
    """Listens to Metric tabs only. ``hosts`` / ``api_origin`` exist for tests on 127.0.0.1."""

    def __init__(self, port, *, hosts=METRIC_HOSTS, api_origin=API_ORIGIN, tab_factory=_default_tab_factory,
                 list_targets=None, clock=time.monotonic):
        self.port = port
        self.hosts = frozenset(hosts)
        self.products_url = api_origin.rstrip('/') + PRODUCTS_PATH
        self._tab_factory = tab_factory
        self._list_targets = list_targets or self._json_list
        self._clock = clock
        self._lock = threading.RLock()
        self._tabs = {}
        self._seq = 0
        self._last_ts = None
        # target id -> the app's own in-page request while that one invocation runs:
        # {'body': canonical body, 'requestId': set once its network event is seen}
        self._own = {}
        self._closed = False      # stop_all() is final: nothing attaches afterwards
        self._frozen = None
        self._thread = None
        self._stop = threading.Event()
        self.chrome_open = True

    # -- discovery

    def _json_list(self):
        return _http_json(f'http://127.0.0.1:{self.port}/json/list', 2)

    @property
    def closed(self):
        return self._closed

    def _attach(self, target, navigate=None):
        """Listener first, then start, then Network.enable: nothing sent before we listen.

        Registration and the closed check happen under the same lock as stop_all(), so a
        connection is either registered before stop_all() collects the tabs (and is stopped
        there) or sees the listener closed and stops itself. Returns None when closed."""
        target_id = target['id']
        if self._closed:
            return None
        tab = self._tab_factory(target)
        tab.set_listener('Network.requestWillBeSent',
                         lambda **event: self._on_request(target_id, tab, event))
        tab.start()
        with self._lock:
            closed = self._closed
            if not closed:
                entry = self._tabs.setdefault(target_id, _TabState(target_id))
                entry.tab = tab
                entry.away_since = None
                entry.seen_away = False
        if closed:
            try:
                tab.stop()
            except Exception:
                pass
            return None
        try:
            tab.call_method('Network.enable', _timeout=10)
            if navigate:
                tab.call_method('Page.navigate', url=navigate, _timeout=10)
        except Exception:
            self._detach(target_id, tab)
            raise
        return tab

    def _detach(self, target_id, tab=None, away=False):
        with self._lock:
            entry = self._tabs.get(target_id)
            if entry is None or (tab is not None and entry.tab is not tab):
                tab_to_stop = tab
            else:
                tab_to_stop = entry.tab
                entry.tab = None
                if away:
                    entry.away_since = self._clock()
                    entry.seen_away = False
        if tab_to_stop is not None:
            try:
                tab_to_stop.stop()
            except Exception:
                pass

    def attach_blank_and_open(self, start_url=START_URL):
        """Fresh Chrome: attach to its about:blank page, then navigate it to Metric."""
        for target in self._list_targets():
            if target.get('type') == 'page' and target.get('url') == 'about:blank' and target.get('webSocketDebuggerUrl'):
                return self._attach(target, navigate=start_url) is not None
        return False

    def poll(self):
        """One pass over /json/list. Returns False when Chrome no longer answers or listening stopped."""
        if self._closed:
            return False
        try:
            targets = self._list_targets()
        except (OSError, ValueError):
            self.chrome_open = False
            self.stop_all()
            return False
        self.chrome_open = True
        now = self._clock()
        live = {}
        for target in targets if isinstance(targets, list) else []:
            if isinstance(target, dict) and target.get('type') == 'page' and isinstance(target.get('id'), str):
                live[target['id']] = target
        with self._lock:
            gone = [tid for tid in self._tabs if tid not in live]
        for target_id in gone:
            self._detach(target_id)
            with self._lock:
                self._tabs.pop(target_id, None)
        for target_id, target in live.items():
            on_metric = is_metric_page(target.get('url'), self.hosts)
            with self._lock:
                entry = self._tabs.get(target_id)
                attached = entry is not None and entry.tab is not None
                if entry is not None and entry.away_since is not None:
                    if not on_metric:
                        entry.seen_away = True
                    elif not entry.seen_away and now - entry.away_since < REATTACH_GRACE_SECONDS:
                        continue   # the navigation away has not committed yet
            if attached and not on_metric:
                self._detach(target_id, away=True)
            elif not attached and on_metric and target.get('webSocketDebuggerUrl'):
                try:
                    self._attach(target)
                except Exception:
                    pass
        return not self._closed

    def start(self, interval=POLL_SECONDS):
        with self._lock:
            if self._closed or (self._thread is not None and self._thread.is_alive()):
                return
            self._thread = threading.Thread(target=self._loop, args=(interval,), daemon=True)
            self._thread.start()

    def _loop(self, interval):
        while not self._stop.is_set():
            if not self.poll():
                return
            self._stop.wait(interval)

    def stop_all(self, drain_seconds=5):
        """Stop listening for good: no new attachment, the poll pass drained, every
        connection stopped. Chrome and its tabs stay open."""
        self._stop.set()
        with self._lock:
            self._closed = True
            entries = list(self._tabs.values())
        for entry in entries:
            self._detach(entry.target_id)
        thread = self._thread
        if thread is not None and thread is not threading.current_thread() and thread.is_alive():
            thread.join(drain_seconds)
        with self._lock:   # whatever a pass registered before it saw the flag
            entries = [entry for entry in self._tabs.values() if entry.tab is not None]
        for entry in entries:
            self._detach(entry.target_id)

    def attached_ids(self):
        with self._lock:
            return sorted(tid for tid, entry in self._tabs.items() if entry.tab is not None)

    # -- events (pychrome runs each tab's callbacks on that tab's own thread)

    def _on_request(self, target_id, tab, event):
        request = event.get('request') if isinstance(event.get('request'), dict) else {}
        if event.get('type') == 'Document' and event.get('frameId') == target_id:
            if not is_metric_page(request.get('url'), self.hosts):
                self._detach(target_id, tab, away=True)
            return
        if request.get('method') != 'POST' or request.get('url') != self.products_url:
            return
        # Order is fixed when the event is received (CDP timestamp, then arrival), before the
        # body lookup below can block: a slow older body never displaces a newer request.
        with self._lock:
            if self._closed:
                return
            self._seq += 1
            seq = self._seq
            stamp = event.get('timestamp')
            if isinstance(stamp, (int, float)) and not isinstance(stamp, bool):
                self._last_ts = stamp if self._last_ts is None else max(self._last_ts, stamp)
            else:
                stamp = self._last_ts if self._last_ts is not None else 0.0
            key = (float(stamp), seq)
        request_id = event.get('requestId')
        post_data = request.get('postData')
        if post_data is None and request.get('hasPostData'):
            try:
                post_data = tab.call_method('Network.getRequestPostData',
                                            requestId=request_id, _timeout=5).get('postData')
            except Exception:
                return
        try:
            body = json.loads(post_data) if isinstance(post_data, str) else None
        except ValueError:
            return
        if not isinstance(body, dict):
            return
        with self._lock:
            own = self._own.get(target_id)
            if own is not None and (own['requestId'] == request_id or
                                    (own['requestId'] is None and own['body'] == canonical(body))):
                own['requestId'] = request_id
                return  # the app's own top-100 request of the invocation running on this tab
            entry = self._tabs.get(target_id)
            if entry is None or entry.tab is not tab:
                return
            if entry.last is None or key > entry.last['key']:
                entry.last = {'body': body, 'seq': seq, 'key': key, 'at': now_iso()}

    # -- the button

    def latest(self):
        with self._lock:
            best = None
            for entry in self._tabs.values():
                if entry.last and (best is None or entry.last['key'] > best.last['key']):
                    best = entry
            return None if best is None else {'targetId': best.target_id, 'seq': best.last['seq'],
                                              'body': copy.deepcopy(best.last['body'])}

    def freeze(self):
        """Copy the newest filter at the moment of the click."""
        with self._lock:
            frozen = self.latest()
            if frozen is None:
                raise MetricFailure('METRIC_NOT_SEEN')
            self._frozen = frozen
            return copy.deepcopy(frozen)

    def fetch_top_products(self, frozen, source, screenshot_dir=None):
        """One in-page request on the frozen tab. Returns the response dict or raises MetricFailure."""
        request = {'urlPath': PRODUCTS_PATH, 'requestBody': top_products_body(frozen['body'])}
        target_id = frozen['targetId']
        with self._lock:
            entry = self._tabs.get(target_id)
            tab = entry.tab if entry else None
            if tab is None:
                raise MetricFailure('METRIC_TAB_GONE')
            # Suppress only this invocation's own request, on this tab.
            self._own[target_id] = {'body': canonical(request['requestBody']), 'requestId': None}
        try:
            return self._evaluate(tab, source, request, screenshot_dir)
        finally:
            # Events received before the evaluate answer may still be queued: handle them
            # first, then end the suppression, so a later identical user request counts.
            drain = getattr(tab, 'drain_events', None)
            if drain is not None:
                try:
                    drain(5)
                except Exception:
                    pass
            with self._lock:
                self._own.pop(target_id, None)

    def _evaluate(self, tab, source, request, screenshot_dir):
        try:
            answer = tab.call_method('Runtime.evaluate', expression=evaluate_expression(source, request),
                                     awaitPromise=True, returnByValue=True, _timeout=EVALUATE_TIMEOUT)
        except Exception:
            raise self._failure(tab, screenshot_dir, 'METRIC_EVALUATE_FAILED') from None
        result = answer.get('result') if isinstance(answer, dict) else None
        value = result.get('value') if isinstance(result, dict) else None
        if not isinstance(answer, dict) or answer.get('exceptionDetails') or not isinstance(value, dict):
            raise self._failure(tab, screenshot_dir, 'METRIC_EVALUATE_FAILED')
        stop = value.get('stop')
        if isinstance(stop, str):
            code = stop if re.fullmatch(r'CAPTURE_[A-Z_]{1,56}', stop) else 'METRIC_EVALUATE_FAILED'
            raise self._failure(tab, screenshot_dir, code)
        return value

    def _failure(self, tab, folder, code):
        saved = self._screenshot(tab, folder) is not None
        return MetricFailure(code, detail={'screenshotSaved': True} if saved else None)

    @staticmethod
    def _screenshot(tab, folder):
        """saveDebug port: on failure only, keep a picture of the tab. Never raises."""
        if folder is None:
            return None
        try:
            shot = tab.call_method('Page.captureScreenshot', format='png', _timeout=10)
            data = base64.b64decode(shot['data'], validate=True)
            stamp = dt.datetime.now().strftime('%Y-%m-%d-%H-%M-%S')
            path = Path(folder) / f'metric-loi_{stamp}.png'
            with open(path, 'xb') as handle:
                handle.write(data)
            return path
        except Exception:
            return None


class MetricSession:
    """What the bridge holds: launcher + listener + the import payload until the server confirms."""

    def __init__(self, base_dir, js_path=None, launcher=None, listener_factory=None):
        self.launcher = launcher or ChromeLauncher(base_dir)
        self._listener_factory = listener_factory or (lambda port: MetricListener(port))
        self._js_path = js_path
        self.listener = None
        self.pending = None           # the import payload, until the server confirms it
        self.busy = threading.Lock()  # blocks double clicks
        self._lock = threading.Lock()

    def chrome_open(self):
        return self.launcher.is_alive(self.launcher.saved_port())

    def open_metric(self):
        opened = self.launcher.open_chrome('about:blank')
        with self._lock:
            if self.listener is not None and (self.listener.closed or self.listener.port != opened['port']):
                self.listener.stop_all()
                self.listener = None
            if self.listener is None:
                self.listener = self._listener_factory(opened['port'])
            listener = self.listener
        listener.chrome_open = True
        navigated = False
        try:
            navigated = listener.attach_blank_and_open(START_URL)
        except Exception:
            navigated = False
        listener.poll()
        listener.start()
        return dict(opened, navigated=navigated)

    def view(self):
        listener = self.listener
        latest = listener.latest() if listener is not None else None
        summary = filter_summary(latest['body']) if latest else None
        pending = self.pending
        return {
            'chromeOpen': self.chrome_open(),
            'listening': bool(listener is not None and listener.attached_ids()),
            'seen': latest is not None,
            'filter': summary,
            'needsKeyword': bool(latest) and not (summary and summary['keyword']),
            'busy': self.busy.locked(),
            'pending': None if pending is None else {'keyword': pending['keyword'], 'period': filter_summary(pending['scope'])['period']},
        }

    def capture(self, collection_policy, keyword_input=None, screenshot_dir=None):
        """Freeze, ask Metric once, build the payload and keep it as pending. Caller holds ``busy``."""
        if self.pending is not None:
            raise MetricFailure('METRIC_IMPORT_PENDING')
        listener = self.listener
        if listener is None:
            raise MetricFailure('METRIC_NOT_SEEN')
        frozen = listener.freeze()
        scope = scope_of(frozen['body'])
        keyword = keyword_of(scope)
        if keyword is None:
            keyword = keyword_input.strip() if isinstance(keyword_input, str) else ''
            if not 1 <= len(keyword) <= 120:
                raise MetricFailure('METRIC_KEYWORD_REQUIRED')
        if not _valid_scope(scope):
            raise MetricFailure('METRIC_FILTER_INVALID')
        response = listener.fetch_top_products(frozen, request_in_page_source(self._js_path), screenshot_dir)
        payload = build_import_payload(import_id=str(uuid.uuid4()), keyword=keyword, captured_at=now_iso(),
                                       collection_policy=collection_policy, scope=scope, response=response)
        self.pending = payload
        return payload

    def confirmed(self):
        """The server created the run: drop the payload and stop listening. Chrome stays open."""
        self.pending = None
        with self._lock:
            listener, self.listener = self.listener, None
        if listener is not None:
            listener.stop_all()

    def close(self):
        with self._lock:
            listener, self.listener = self.listener, None
        if listener is not None:
            listener.stop_all()

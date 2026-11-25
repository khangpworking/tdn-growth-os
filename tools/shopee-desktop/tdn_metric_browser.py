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
import collections
import copy
import datetime as dt
import json
import os
from pathlib import Path
import queue
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
BODY_WAIT_SECONDS = 5          # the click waits this long for the newest request's body
_JS_NAME = 'request-in-page.js'
_JS_START = 'export async function requestV3InPage('


SHOT_FOLDER = 'metric'      # sub-folder of the app's evidence folder (its cleanup keeps sub-folders)
SHOT_TIMEOUT = 30


def _is_link(path):
    """A symlink, junction or other reparse point (never followed for a picture). Missing: False."""
    try:
        if os.path.islink(path):
            return True
        return bool(getattr(os.lstat(path), 'st_file_attributes', 0) & 0x400)
    except FileNotFoundError:
        return False


def plain_path(root, path):
    """The one rule for the local Metric pictures: True only when no part from ``root`` (the evidence
    folder) down to ``path`` is a symlink, junction or other reparse point. Parts that do not exist yet
    are fine (to be created); ``path`` must be inside ``root``. Never raises."""
    try:
        root, path = Path(root), Path(path)
        relative = path.relative_to(root)
        part = root
        for name in ('',) + relative.parts:
            part = part / name if name else part
            if _is_link(part):
                return False
        return True
    except (ValueError, OSError):
        return False


SHOT_EXTENSIONS = ('webp', 'png')   # app 1.2.0 takes WebP; PNG when the page is too big for WebP (and older pictures)
SHOT_WEBP_QUALITY = 80
SHOT_WEBP_MAX_SIDE = 16383          # WebP cannot be larger than this on either side (pixels)


def run_shot_name(run_id, extension='webp'):
    """The local full-page Metric shot linked to a run (until it is kept online)."""
    return f'{run_id}-metric-full-page.{extension}'


def shot_format(metrics, width, height):
    """'webp', or 'png' when the picture would be larger than WebP allows on one side (device pixels)."""
    try:
        css = metrics.get('cssContentSize') or {}
        device = metrics.get('contentSize') or {}
        ratio = float(device['width']) / float(css['width']) if css.get('width') and device.get('width') else 1.0
        ratio = ratio if 0 < ratio < 16 else 1.0
    except (TypeError, ValueError, KeyError, ZeroDivisionError):
        ratio = 1.0
    return 'png' if max(width, height) * ratio > SHOT_WEBP_MAX_SIDE else 'webp'


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


KEYWORD_MAX = 120   # contract: the import keyword is 1-120 characters, trimmed


def keyword_of(body):
    """The page's search keyword (first query), trimmed and cut to 120 characters; None when empty."""
    query = body.get('include_query') if isinstance(body, dict) else None
    queries = query.get('queries') if isinstance(query, dict) else None
    if isinstance(queries, list) and queries and isinstance(queries[0], str):
        keyword = queries[0].strip()[:KEYWORD_MAX].strip()
        if keyword:
            return keyword
    return None


PRODUCT_SELECTION_MAX = 100


def valid_product_selection(value):
    """`productSelection` of the m1-import payload (CONTRACT-F644 §1): {"mode":"top","count":1..100}
    or {"mode":"all"}."""
    if not isinstance(value, dict):
        return False
    if value.get('mode') == 'all':
        return set(value) == {'mode'}
    count = value.get('count')
    return (value.get('mode') == 'top' and set(value) == {'mode', 'count'} and type(count) is int and
            1 <= count <= PRODUCT_SELECTION_MAX)


def needed_shopee_products(selection):
    """Fewest Shopee products step 2 can work with: N for top N (5 without a choice), 1 for all."""
    if selection is None:
        return 5
    return 1 if selection['mode'] == 'all' else selection['count']


def shopee_product_count(response):
    """Distinct ``product_base_id`` values starting with ``1__`` (Shopee), the server's rule."""
    body = response.get('body') if isinstance(response, dict) else None
    data = body.get('data') if isinstance(body, dict) else None
    products = data.get('products') if isinstance(data, dict) else None
    ids = set()
    for product in products if isinstance(products, list) else ():
        value = product.get('product_base_id') if isinstance(product, dict) else None
        if isinstance(value, str) and value.startswith('1__'):
            ids.add(value)
    return len(ids)


def _date_text(value):
    if isinstance(value, str) and len(value) == 8 and value.isdigit():
        return f'{value[6:8]}/{value[4:6]}/{value[0:4]}'
    return None


def period_text(body):
    start, end = _date_text(body.get('start_date')), _date_text(body.get('end_date'))
    return f'{start} – {end}' if start and end else None


def run_name(scope):
    """The import keyword: the page's search keyword, else «Metric DD/MM–DD/MM/YYYY» from the period
    («Metric DD/MM/YYYY–DD/MM/YYYY» when the two dates fall in different years). Scope dates are valid."""
    keyword = keyword_of(scope)
    if keyword is not None:
        return keyword
    start, end = _date_text(scope['start_date']), _date_text(scope['end_date'])
    if start[6:] == end[6:]:
        return f'Metric {start[:5]}–{end}'
    return f'Metric {start}–{end}'


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


def build_import_payload(*, import_id, keyword, captured_at, collection_policy, scope, response,
                         product_selection=None):
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
    if product_selection is not None:
        if not valid_product_selection(product_selection):
            raise MetricFailure('IMPORT_INPUT_INVALID')
        payload['productSelection'] = copy.deepcopy(product_selection)
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


def evaluate_expression(source, request, script_url=None):
    """`(function)(request)`; `script_url` names the evaluated script (`//# sourceURL`), so the
    request it sends is recognisable by its CDP initiator stack."""
    expression = '(' + source + ')(' + json.dumps(request, ensure_ascii=False, allow_nan=False) + ')'
    return expression + ('\n//# sourceURL=' + script_url if script_url else '')


# ---------------------------------------------------------------- tab listener

def _default_tab_factory(target):
    from vendor_pychrome import Tab
    return Tab(**target)


class _TabState:
    __slots__ = ('target_id', 'tab', 'phase', 'token', 'last', 'away_since', 'seen_away')

    def __init__(self, target_id):
        self.target_id = target_id
        self.tab = None           # the one live connection (phase 'attached')
        self.phase = None         # None | 'attaching' | 'attached'
        self.token = None         # owner of an 'attaching' reservation
        self.last = None          # {'body', 'seq', 'key', 'at'}
        self.away_since = None    # detached because the main frame left Metric
        self.seen_away = False


_APP_SCRIPT = 'tdn-app-request-{}.js'


class MetricListener:
    """Listens to Metric tabs only. ``hosts`` / ``api_origin`` exist for tests on 127.0.0.1.

    Single owner, one lock (``_lock``):
    - discovery (``poll``, ``attach_blank_and_open``) runs one pass at a time
      (``_discovery``) and reserves a target under ``_lock`` before opening its socket, so a
      tab never gets two connections; a connection that loses its reservation, or opens
      after ``stop_all()``, stops itself;
    - CDP callbacks never block: navigation is handled and the tab detached on the spot,
      a request's order is taken on arrival, and a missing body is fetched by the one
      body worker thread;
    - the app's own in-page request is recognised by its CDP initiator (the evaluated
      script's unique ``sourceURL``), never by its body;
    - ``stop_all()`` is final: it waits for attachments in progress, drains the poll
      thread and the body worker, and stops every connection. Chrome and its tabs stay open.
    """

    def __init__(self, port, *, hosts=METRIC_HOSTS, api_origin=API_ORIGIN, tab_factory=_default_tab_factory,
                 list_targets=None, clock=time.monotonic):
        self.port = port
        self.hosts = frozenset(hosts)
        self.products_url = api_origin.rstrip('/') + PRODUCTS_PATH
        self._tab_factory = tab_factory
        self._list_targets = list_targets or self._json_list
        self._clock = clock
        self._lock = threading.RLock()
        self._idle = threading.Condition(self._lock)   # attachments in progress reach zero
        self._discovery = threading.Lock()             # one discovery pass at a time
        self._tabs = {}
        self._attaching = 0
        self._seq = 0
        self._last_ts = None
        # The newest user products request across all Metric tabs, recorded on arrival:
        # {'targetId', 'key', 'requestId', 'state': 'pending'|'resolved'|'failed', 'body'}.
        # The click freezes exactly this one; it never falls back to an older request.
        self._newest = None
        self._tab_newest = {}      # targetId -> order key of that tab's newest user products request
        self._body_state = threading.Condition(self._lock)
        self.body_wait_seconds = BODY_WAIT_SECONDS
        self._app_scripts = collections.deque(maxlen=64)   # sourceURLs of the app's own calls
        self._closed = False
        self._frozen = None
        self._thread = None
        self._stop = threading.Event()
        self._bodies = queue.Queue()
        self._worker = None
        self.chrome_open = True

    @property
    def closed(self):
        return self._closed

    # -- discovery and connections

    def _json_list(self):
        return _http_json(f'http://127.0.0.1:{self.port}/json/list', 2)

    def _reserve(self, target_id):
        """Under the lock: claim the target for one new connection, or None."""
        with self._lock:
            if self._closed:
                return None
            entry = self._tabs.setdefault(target_id, _TabState(target_id))
            if entry.phase is not None:
                return None
            entry.phase = 'attaching'
            entry.token = object()
            self._attaching += 1
            return entry.token

    def _attach(self, target, navigate=None):
        """Reserve, open, then publish. Listener first, then start, then Network.enable."""
        target_id = target['id']
        token = self._reserve(target_id)
        if token is None:
            return None
        tab = None
        published = False
        try:
            tab = self._tab_factory(target)
            tab.set_listener('Network.requestWillBeSent',
                             lambda **event: self._on_request(target_id, tab, event))
            tab.start()
            with self._lock:
                entry = self._tabs.get(target_id)
                if not self._closed and entry is not None and entry.token is token:
                    entry.tab = tab
                    entry.phase = 'attached'
                    entry.token = None
                    entry.away_since = None
                    entry.seen_away = False
                    published = True
        finally:
            with self._lock:
                entry = self._tabs.get(target_id)
                if not published and entry is not None and entry.token is token:
                    entry.phase = None
                    entry.token = None
                self._attaching -= 1
                self._idle.notify_all()
            if not published and tab is not None:
                self._stop_tab(tab)
        if not published:
            return None
        try:
            tab.call_method('Network.enable', _timeout=10)
            if navigate:
                tab.call_method('Page.navigate', url=navigate, _timeout=10)
        except Exception:
            self._detach(target_id, tab)
            raise
        return tab

    @staticmethod
    def _stop_tab(tab):
        try:
            tab.stop()
        except Exception:
            pass

    def _detach(self, target_id, tab=None, away=False):
        """Stop the target's connection (or the given stale one). Never blocks on CDP."""
        with self._lock:
            entry = self._tabs.get(target_id)
            if entry is None or (tab is not None and entry.tab is not tab):
                tab_to_stop = tab
            else:
                tab_to_stop = entry.tab
                if entry.phase == 'attached':
                    entry.tab = None
                    entry.phase = None
                if away:
                    entry.away_since = self._clock()
                    entry.seen_away = False
        if tab_to_stop is not None:
            self._stop_tab(tab_to_stop)

    def attach_blank_and_open(self, start_url=START_URL):
        """Fresh Chrome: attach to its about:blank page, then navigate it to Metric."""
        with self._discovery:
            for target in self._list_targets():
                if (target.get('type') == 'page' and target.get('url') == 'about:blank' and
                        target.get('webSocketDebuggerUrl')):
                    return self._attach(target, navigate=start_url) is not None
            return False

    def poll(self):
        """One discovery pass over /json/list. False when Chrome no longer answers or listening stopped."""
        with self._discovery:
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
                gone = [tid for tid, entry in self._tabs.items() if tid not in live and entry.phase != 'attaching']
            for target_id in gone:
                self._detach(target_id)
                with self._lock:
                    entry = self._tabs.get(target_id)
                    if entry is not None and entry.phase is None:
                        del self._tabs[target_id]
            for target_id, target in live.items():
                on_metric = is_metric_page(target.get('url'), self.hosts)
                with self._lock:
                    entry = self._tabs.get(target_id)
                    phase = entry.phase if entry is not None else None
                    if entry is not None and entry.away_since is not None and phase is None:
                        if not on_metric:
                            entry.seen_away = True
                        elif not entry.seen_away and now - entry.away_since < REATTACH_GRACE_SECONDS:
                            continue   # the navigation away has not committed yet
                if phase == 'attached' and not on_metric:
                    self._detach(target_id, away=True)
                elif phase is None and on_metric and target.get('webSocketDebuggerUrl'):
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

    def stop_all(self, wait_seconds=10):
        """Final: no new connection, attachments in progress finished, poll and body worker
        drained, every connection stopped. Chrome and its tabs stay open."""
        self._stop.set()
        with self._lock:
            self._closed = True
            stopping = []
            for entry in self._tabs.values():
                if entry.phase == 'attached':
                    stopping.append(entry.tab)
                    entry.tab = None
                    entry.phase = None
        for tab in stopping:
            self._stop_tab(tab)
        deadline = time.monotonic() + wait_seconds
        with self._lock:
            while self._attaching and time.monotonic() < deadline:
                self._idle.wait(deadline - time.monotonic())
        current = threading.current_thread()
        for thread in (self._thread, self._worker):
            if thread is self._worker and thread is not None:
                self._bodies.put(None)
            if thread is not None and thread is not current and thread.is_alive():
                thread.join(max(0.0, deadline - time.monotonic()))

    def attached_ids(self):
        with self._lock:
            return sorted(tid for tid, entry in self._tabs.items() if entry.phase == 'attached')

    # -- events: pychrome runs these on the tab's dispatch thread; nothing here may block

    def _is_app_request(self, initiator):
        stack = initiator.get('stack') if isinstance(initiator, dict) else None
        while isinstance(stack, dict):
            for frame in stack.get('callFrames') or []:
                if isinstance(frame, dict) and frame.get('url') in self._app_scripts:
                    return True
            stack = stack.get('parent')
        return False

    def _on_request(self, target_id, tab, event):
        request = event.get('request') if isinstance(event.get('request'), dict) else {}
        if event.get('type') == 'Document' and event.get('frameId') == target_id:
            if not is_metric_page(request.get('url'), self.hosts):
                self._detach(target_id, tab, away=True)
            return
        if request.get('method') != 'POST' or request.get('url') != self.products_url:
            return
        with self._lock:
            entry = self._tabs.get(target_id)
            if self._closed or entry is None or entry.tab is not tab:
                return   # a stopped or replaced connection
            if self._is_app_request(event.get('initiator')):
                return   # the app's own top-100 request
            # Order is fixed on arrival (CDP timestamp, then arrival), before any body lookup.
            self._seq += 1
            stamp = event.get('timestamp')
            if isinstance(stamp, (int, float)) and not isinstance(stamp, bool):
                self._last_ts = stamp if self._last_ts is None else max(self._last_ts, stamp)
            else:
                stamp = self._last_ts if self._last_ts is not None else 0.0
            key = (float(stamp), self._seq)
            record = {'targetId': target_id, 'key': key, 'requestId': event.get('requestId'),
                      'state': 'pending', 'body': None}
            if self._newest is None or key > self._newest['key']:
                self._newest = record
            if target_id not in self._tab_newest or key > self._tab_newest[target_id]:
                self._tab_newest[target_id] = key
        post_data = request.get('postData')
        if post_data is None and request.get('hasPostData'):
            self._fetch_body_later(target_id, tab, record)
            return
        self._publish(target_id, tab, post_data, record)

    def _settle(self, record, state, body=None):
        """Under the lock: the request's body is known (or will never be); wake a waiting click."""
        record['state'] = state
        record['body'] = body
        self._body_state.notify_all()

    def _publish(self, target_id, tab, post_data, record):
        try:
            body = json.loads(post_data) if isinstance(post_data, str) else None
        except ValueError:
            body = None
        with self._lock:
            entry = self._tabs.get(target_id)
            if not isinstance(body, dict) or self._closed or entry is None or entry.tab is not tab:
                self._settle(record, 'failed')
                return
            self._settle(record, 'resolved', body)
            key = record['key']
            if entry.last is None or key > entry.last['key']:
                entry.last = {'body': body, 'seq': key[1], 'key': key, 'at': now_iso()}

    def _fetch_body_later(self, target_id, tab, record):
        with self._lock:
            if self._closed:
                self._settle(record, 'failed')
                return
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._body_loop, daemon=True)
                self._worker.start()
        self._bodies.put((target_id, tab, record))

    def _body_loop(self):
        while True:
            item = self._bodies.get()
            if item is None or self._closed:
                with self._lock:   # nobody will look these bodies up any more
                    while item is not None:
                        self._settle(item[2], 'failed')
                        try:
                            item = self._bodies.get_nowait()
                        except queue.Empty:
                            item = None
                return
            target_id, tab, record = item
            with self._lock:
                entry = self._tabs.get(target_id)
                current = entry is not None and entry.tab is tab
                if not current:
                    self._settle(record, 'failed')
            if not current:
                continue
            try:
                answer = tab.call_method('Network.getRequestPostData', requestId=record['requestId'], _timeout=5)
            except Exception:
                answer = None
            self._publish(target_id, tab, answer.get('postData') if isinstance(answer, dict) else None, record)

    # -- the button

    def latest(self):
        with self._lock:
            best = None
            for entry in self._tabs.values():
                if entry.last and (best is None or entry.last['key'] > best.last['key']):
                    best = entry
            return None if best is None else {'targetId': best.target_id, 'seq': best.last['seq'],
                                              'body': copy.deepcopy(best.last['body'])}

    def click_record(self):
        """At the click, atomically: the newest products request seen on any Metric tab (its record,
        with its tab). Everything after the click works on THIS record, never a later one."""
        with self._lock:
            return self._newest

    def freeze(self, record=None):
        """Freeze exactly the click's request (``record``; default: the newest one now).

        Its body may still be on the way (body worker): wait up to ``body_wait_seconds``
        (the caller's thread, never a CDP dispatch thread). Still pending, or the body could
        not be read: refuse. Never fall back to another request."""
        with self._lock:
            if record is None:
                record = self._newest
            if record is None:
                raise MetricFailure('METRIC_NOT_SEEN')
            deadline = time.monotonic() + self.body_wait_seconds
            while record['state'] == 'pending' and not self._closed:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self._body_state.wait(remaining)
            if record['state'] == 'pending':
                raise MetricFailure('METRIC_FILTER_PENDING')
            if record['state'] != 'resolved':
                raise MetricFailure('METRIC_FILTER_UNAVAILABLE')
            frozen = {'targetId': record['targetId'], 'seq': record['key'][1], 'body': copy.deepcopy(record['body'])}
            self._frozen = frozen
            return copy.deepcopy(frozen)

    def fetch_top_products(self, frozen, source, screenshot_saved=False):
        """One in-page request on the frozen tab. Returns the response dict or raises MetricFailure.

        ``screenshot_saved``: the click's full-page shot exists, so a failure can say so."""
        request = {'urlPath': PRODUCTS_PATH, 'requestBody': top_products_body(frozen['body'])}
        script = _APP_SCRIPT.format(uuid.uuid4().hex)
        with self._lock:
            entry = self._tabs.get(frozen['targetId'])
            tab = entry.tab if entry is not None and entry.phase == 'attached' else None
            if tab is None:
                raise MetricFailure('METRIC_TAB_GONE')
            # Unique per call and never reused, so it can stay listed: a late queued event of
            # this call is still recognised, and no user request ever carries it.
            self._app_scripts.append(script)
        try:
            answer = tab.call_method('Runtime.evaluate', expression=evaluate_expression(source, request, script),
                                     awaitPromise=True, returnByValue=True, _timeout=EVALUATE_TIMEOUT)
        except Exception:
            raise self._failure(screenshot_saved, 'METRIC_EVALUATE_FAILED') from None
        result = answer.get('result') if isinstance(answer, dict) else None
        value = result.get('value') if isinstance(result, dict) else None
        if not isinstance(answer, dict) or answer.get('exceptionDetails') or not isinstance(value, dict):
            raise self._failure(screenshot_saved, 'METRIC_EVALUATE_FAILED')
        stop = value.get('stop')
        if isinstance(stop, str):
            code = stop if re.fullmatch(r'CAPTURE_[A-Z_]{1,56}', stop) else 'METRIC_EVALUATE_FAILED'
            raise self._failure(screenshot_saved, code)
        return value

    @staticmethod
    def _failure(screenshot_saved, code):
        return MetricFailure(code, detail={'screenshotSaved': True} if screenshot_saved else None)

    def tab_newest_key(self, target_id):
        """Order key of the newest user products request seen on that tab (None: none yet)."""
        with self._lock:
            return self._tab_newest.get(target_id)

    def shot_target(self, record):
        """The tab to picture: the click record's tab; with no request seen yet, the first attached
        Metric tab. None when that tab is not attached."""
        with self._lock:
            attached = [tid for tid, entry in self._tabs.items() if entry.phase == 'attached']
        if record is not None:
            return record['targetId'] if record['targetId'] in attached else None
        return attached[0] if attached else None

    def full_page_shot(self, target_id, folder):
        """At the click: one full-page picture of that Metric tab, saved on this PC only as
        ``metric-<local YYYY-MM-DD-HHMMSS>.webp`` (WebP quality 80; ``.png`` when a side is over 16383 px). Never raises; a failed shot never blocks the capture.
        Failed shot (None): no folder, a linked folder, no attached tab, or no valid full-page size."""
        if folder is None or target_id is None:
            return None
        with self._lock:
            entry = self._tabs.get(target_id)
            tab = entry.tab if entry is not None and entry.phase == 'attached' else None
        if tab is None:
            return None
        try:
            folder = Path(folder)
            root = folder.parent                     # the evidence folder
            if not plain_path(root, folder):
                return None
            # Full page only: the page size must be known, else it is a failed shot.
            metrics = tab.call_method('Page.getLayoutMetrics', _timeout=10)
            size = metrics.get('cssContentSize') or metrics.get('contentSize')
            width, height = float(size['width']), float(size['height'])
            if not (0 < width < 1e6 and 0 < height < 1e6):
                return None
            kind = shot_format(metrics, width, height)
            options = {'quality': SHOT_WEBP_QUALITY} if kind == 'webp' else {}
            shot = tab.call_method('Page.captureScreenshot', format=kind, captureBeyondViewport=True,
                                   clip={'x': 0, 'y': 0, 'width': width, 'height': height, 'scale': 1},
                                   _timeout=SHOT_TIMEOUT, **options)
            data = base64.b64decode(shot['data'], validate=True)
            folder.mkdir(exist_ok=True)
            stamp = dt.datetime.now().strftime('%Y-%m-%d-%H%M%S')
            for number in range(100):
                path = folder / (f'metric-{stamp}.{kind}' if number == 0 else f'metric-{stamp}-{number}.{kind}')
                if not plain_path(root, path):
                    return None
                try:
                    with open(path, 'xb') as handle:
                        handle.write(data)
                    return path
                except FileExistsError:
                    continue
            return None
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
        self.pending_shot = None      # the full-page shot of that click (local path), for «Gửi lại»
        self.busy = threading.Lock()  # blocks double clicks
        self._lock = threading.Lock()
        self._auto = True             # auto-watch allowed: once per app start, before anything listened
        self._gen = 0                 # bumped by open_metric / confirmed / close

    def chrome_open(self):
        return self.launcher.is_alive(self.launcher.saved_port())

    def open_metric(self):
        opened = self.launcher.open_chrome('about:blank')
        with self._lock:
            self._gen += 1
            self._auto = False   # from now on the user drives listening
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

    def _auto_watch(self):
        """Once per app start, while nothing has listened yet: the app's own Chrome is already open on
        its saved port (the app restarted after «Mở Metric»), so attach a listener to it. No navigation,
        no new tab, Chrome never closed; another Chrome on that port is never attached. One try only:
        it never replaces, stops or retries a listener. If the try fails, «Mở Metric» works as before
        (it replaces a closed listener). Identity is checked by is_app_chrome() just before the attach,
        the same window as open_metric()'s reuse."""
        with self._lock:
            if not self._auto or self.listener is not None:
                return
            gen = self._gen
        port = self.launcher.saved_port()
        if not port or not self.launcher.is_app_chrome(port):
            return
        with self._lock:
            if (not self._auto or self.listener is not None or self._gen != gen
                    or self.launcher.saved_port() != port):
                return
            self._auto = False
            listener = self.listener = self._listener_factory(port)
        listener.chrome_open = True
        try:
            if listener.poll():
                listener.start()
        except Exception:
            pass   # not listening: the card shows «Chưa mở Metric» and «Mở Metric» takes over

    def view(self):
        try:
            self._auto_watch()
        except Exception:
            pass
        listener = self.listener
        latest = listener.latest() if listener is not None else None
        pending = self.pending
        return {
            'chromeOpen': self.chrome_open(),
            'listening': bool(listener is not None and listener.attached_ids()),
            'seen': latest is not None,
            'busy': self.busy.locked(),
            'pending': None if pending is None else {'keyword': pending['keyword'], 'period': period_text(pending['scope'])},
        }

    def capture(self, collection_policy, screenshot_dir=None, product_selection=None):
        """Freeze, shoot the full Metric page, ask Metric once, build the payload and keep it as pending
        (with its shot). Caller holds ``busy``. ``screenshot_dir``: where the click's shot is saved."""
        if self.pending is not None:
            raise MetricFailure('METRIC_IMPORT_PENDING')
        listener = self.listener
        if listener is None:
            raise MetricFailure('METRIC_NOT_SEEN')
        # Every click keeps one full-page shot on this PC, taken first: success, too few Shopee
        # products, and every refusal or failure after this point (filter still loading too).
        # The click's request is snapshotted ONCE; the picture is of its tab and the import is built
        # from that same record, even if Metric sends a later request while the picture is taken.
        record = listener.click_record()
        target = listener.shot_target(record)
        shot = listener.full_page_shot(target, screenshot_dir)
        # The page may have changed since the click (the user picked another filter on that tab, even
        # right after the click record was taken): unless the tab's newest request is still the click's
        # own request, the picture stays an unlinked metric-<time>.png and this run gets no local picture.
        linkable = (shot is not None and record is not None and
                    listener.tab_newest_key(target) == record['key'])
        try:
            if record is None:
                raise MetricFailure('METRIC_NOT_SEEN')
            frozen = listener.freeze(record)  # its body: pending / unavailable handling, 5 s wait
            scope = scope_of(frozen['body'])
            if not _valid_scope(scope):
                raise MetricFailure('METRIC_FILTER_INVALID')
        except MetricFailure as failure:
            if shot is not None and failure.detail is None:
                failure.detail = {'screenshotSaved': True}
            raise
        keyword = run_name(scope)
        response = listener.fetch_top_products(frozen, request_in_page_source(self._js_path),
                                               screenshot_saved=shot is not None)
        payload = build_import_payload(import_id=str(uuid.uuid4()), keyword=keyword, captured_at=now_iso(),
                                       collection_policy=collection_policy, scope=scope, response=response,
                                       product_selection=product_selection)
        count = shopee_product_count(response)
        needed = needed_shopee_products(product_selection)
        if count < needed:
            # Step 2 would always fail: send nothing, keep nothing for «Gửi lại».
            raise MetricFailure('METRIC_TOO_FEW_SHOPEE', detail={'shopeeProducts': count, 'needed': needed})
        self.pending = payload
        self.pending_shot = shot if linkable else None
        return payload

    def drop_pending(self):
        """Forget the payload; its shot stays on disk under its click-time name."""
        self.pending = None
        self.pending_shot = None

    def link_shot(self, run_id):
        """The server returned the run: the kept shot becomes ``<runId>-metric-full-page.<webp|png>``. Never raises."""
        shot, self.pending_shot = self.pending_shot, None
        if shot is None:
            return None
        target = shot.with_name(run_shot_name(run_id, shot.suffix.lstrip('.') or 'png'))
        try:
            root = shot.parent.parent
            if not (plain_path(root, shot) and plain_path(root, target)):
                return None
            os.replace(shot, target)
        except OSError:
            return None
        return target

    def confirmed(self):
        """The server created the run: drop the payload and stop listening. Chrome stays open."""
        self.pending = None
        self.pending_shot = None
        with self._lock:
            self._gen += 1
            self._auto = False
            listener, self.listener = self.listener, None
        if listener is not None:
            listener.stop_all()

    def close(self):
        with self._lock:
            self._gen += 1
            self._auto = False
            listener, self.listener = self.listener, None
        if listener is not None:
            listener.stop_all()

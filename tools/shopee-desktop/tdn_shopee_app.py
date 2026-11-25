"""Desktop transport for the Shopee flow CLI; workflow decisions stay remote."""
import argparse
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
import shutil
import socket
import ssl
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time

import tdn_metric_browser
import tdn_shopee_transport


_RUN_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}')
_PLAN_SHA = re.compile(r'[0-9a-f]{64}')
_INSIGHT_ID = re.compile(r'[A-Za-z0-9._:-]{1,128}')   # run-view wave 2: insight bucket keys and theme codes
_REMOTE_PATH = re.compile(r'(\$HOME/)?[A-Za-z0-9_./-]+')
_STATIC_ERROR = re.compile(r'[A-Z][A-Z0-9_]{0,63}')
_SHOP_ITEM_ID = re.compile(r'[1-9][0-9]{0,19}')
_SHOPEE_LINK = re.compile(r"https://shopee\.vn/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{0,2000}")
EXPORT_MAX_BYTES = 64 * 1024 * 1024
EXPORT_ERROR_MAX_BYTES = 64 * 1024
_MAX_RUN_LINKS = 100  # the server's productSelection.count limit (shopee_flow.py)
_COMMANDS = {
    'connection': ('connection',),
    'presets': ('presets',),
    'runs': ('runs',),
    'status': ('run-info', '--run'),
    'captureSpecs': ('capture-specs', '--run'),
    'moduleOutputs': ('outputs', '--run'),
    'readModuleEvidence': ('evidence', '--run'),
    'library': ('library',),
    'new': ('new-run', '--stdin'),
    'metricDateAvailability': ('metric-date-availability', '--end-date'),
    'addProduct': ('add-product', '--stdin'),
    'm1Import': ('m1-import', '--stdin'),
    'entry': ('gate', 'entry', '--run'),
    'flow': ('run', '--run'),
    'm1': ('m1', '--run'),
    'm2': ('m2', '--run'),
    'm3': ('m3', '--run'),
    'reviewSampling': ('review-sampling', '--run'),
    'refreshReviewCounts': ('review-counts', '--run'),
    'saveReviewPlan': ('save-review-plan', '--run'),
    'stopReviewAttempt': ('stop-review-attempt', '--run'),
    'reconcileReviewAttempt': ('reconcile-review-attempt', '--run'),
    'reviewData': ('review-data', '--run'),
    'reviewStats': ('review-stats', '--run'),
    'reviewInsights': ('review-insights', '--run'),
    'saveReviewData': ('save-review-data', '--run'),
    'exportReviewData': ('export-review-data', '--run'),
    'readReviewExport': ('read-review-export', '--run'),
    'reviewProcess': ('review-process', '--run'),
    'processReviewData': ('process-review-data', '--run'),
    'runsProgress': ('runs-progress',),
    'deleteRun': ('delete-run', '--run'),
    # F647 wave 2: one call per run open, insights summary first, comments on demand.
    'runView': ('run-view', '--run'),
    'reviewInsightsSummary': ('review-insights', '--run'),
    'reviewInsightComments': ('review-insight-comments', '--run'),
    # F654: the newest desktop app version the server knows of (notify only).
    'appLatest': ('app-latest',),
    # App 1.2.0: the Metric picture is kept online for 10 days (signed by the server, sent straight from here).
    'metricShotUploadUrl': ('metric-shot-upload-url', '--run'),
    'metricShotConfirm': ('metric-shot-confirm', '--run'),
    'metricShotViewUrl': ('metric-shot-view-url', '--run'),
}
# Commands an older server does not know: argparse exits 2 with nothing on stdout -> USAGE.
_WAVE2_COMMANDS = frozenset({'runView', 'reviewInsightsSummary', 'reviewInsightComments', 'appLatest',
                             'metricShotUploadUrl', 'metricShotConfirm', 'metricShotViewUrl'})
# Commands that only read. Every other command (a write, start, save, delete, detached run, gate) moves the
# mutation counter: a prefetch read started before it is never joined.
_READ_ONLY_COMMANDS = frozenset({
    'connection', 'presets', 'runs', 'library', 'status', 'captureSpecs', 'moduleOutputs', 'readModuleEvidence',
    'metricDateAvailability', 'reviewSampling', 'reviewData', 'reviewStats', 'reviewInsights', 'reviewProcess',
    'runsProgress', 'runView', 'reviewInsightsSummary', 'reviewInsightComments', 'readReviewExport', 'appLatest',
    'metricShotViewUrl'})
# The online Metric picture (app 1.2.0).
_SHOT_TYPES = {'.webp': 'image/webp', '.png': 'image/png'}
_SHOT_MAX_BYTES = 32 * 1024 * 1024
_SHOT_PUT_SECONDS = 60
_SHOT_RETRY_SECONDS = 60          # at most one upload attempt per run in this time
_SHOT_STATES = frozenset({'AVAILABLE', 'EXPIRED', 'NOT_UPLOADED'})
_R2_URL = re.compile(r'https://[A-Za-z0-9]{1,64}\.r2\.cloudflarestorage\.com/[A-Za-z0-9._~/%-]{1,600}\?[A-Za-z0-9._~%&=-]{1,2000}')
_UTC_TEXT = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z')
_RUN_VIEW_PARTS = ('info', 'sampling', 'reviewData', 'outputs', 'process')
_RUN_VIEW_RESULT_PARTS = ('stats', 'insights')
# Step 4 formats (review-process-view-v1, review-process-start-v1, runs-progress-v1).
_STEP4_STATES = frozenset({'IDLE', 'RUNNING', 'PASS', 'FAIL'})
_STEP4_SOURCE_STATES = _STEP4_STATES | {'NOT_APPLICABLE'}
_STEP4_ERRORS = frozenset({
    'JEV_CALL_FAILED', 'JEV_DISABLED', 'REVIEW_SOURCE_CHANGED', 'DB_IMPORT_CONFLICT',
    'PRODUCT_NAME_PROVENANCE_MISSING', 'APP_DB_NOT_CONFIGURED', 'READONLY_ON', 'GATE_FAILED',
})
_STEP4_GATE_CHECKS = {
    'in': ('source_unchanged', 'review_ids_valid', 'not_saved_twice', 'jev_ready_versions_fixed',
           'fee_estimate_recorded'),
    'out': ('all_rows_saved', 'one_filter_result_each', 'kept_all_labelled', 'no_new_label_on_excluded',
            'no_failed_jev_call', 'receipt_complete'),
}
_STEP4_STAGE_COUNTS = {
    'save': ('total', 'inserted', 'alreadyPresent'),
    'filter': ('total', 'keep', 'exclude', 'unresolved', 'noContent'),
    'label': ('total', 'unresolvedSkipped'),
}
_PROGRESS_STEP_STATES = frozenset({'IDLE', 'RUNNING', 'PASS', 'FAIL', 'WAIT_OWNER', 'NOT_APPLICABLE'})
_STAMP_MAX = 64
_NOTIFY_TITLE_MAX = 120
_NOTIFY_BODY_MAX = 400
_NOTIFY_CONTROL = re.compile(r'[\x00-\x1f\x7f]+')
# Constant WinRT toast script. Title and body arrive only through environment
# variables and become XML text nodes, so no caller text is parsed as code or XML.
_TOAST_SCRIPT = '''$ErrorActionPreference = 'Stop'
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text/><text/><text placement="attribution"/></binding></visual></toast>')
$texts = $xml.GetElementsByTagName('text')
$null = $texts.Item(0).AppendChild($xml.CreateTextNode($env:TDN_TOAST_TITLE))
$null = $texts.Item(1).AppendChild($xml.CreateTextNode($env:TDN_TOAST_BODY))
$null = $texts.Item(2).AppendChild($xml.CreateTextNode('TDN Shopee Flow'))
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)
'''


class _BridgeFailure(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _error(code, message=None):
    return {'ok': False, 'error': {'code': code, 'message': code if message is None else message}}


# Download formats -> file extension. 'labelled-json' = every collected comment with its Jev labels.
REVIEW_FILE_FORMATS = {'json': 'json', 'txt': 'txt', 'labelled-json': 'json'}


def _safe_filename(name, export_format):
    fallback = f'shopee-reviews.{export_format}'
    if not isinstance(name, str):
        return fallback
    base = re.split(r'[\\/]', name)[-1]
    base = re.sub(r'[\x00-\x1f<>:"|?*]', '_', base).strip().rstrip('. ')
    if not base or base in ('.', '..'):
        base = fallback
    if not base.lower().endswith('.' + export_format):
        base += '.' + export_format
    stem, extension = os.path.splitext(base)
    if stem.upper() in {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5',
                        'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4',
                        'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}:
        stem = '_' + stem
    if base.startswith('.'):
        stem = '_' + stem
    if len(stem) > 120 - len(extension):
        stem = stem[:120 - len(extension)]
    return stem + extension


def _real_directory(path):
    """True only for a real directory: not a symlink, not a Windows junction or other reparse point."""
    try:
        info = os.lstat(path)
    except OSError:
        return False
    reparse = getattr(info, 'st_reparse_tag', 0) or (getattr(info, 'st_file_attributes', 0) & 0x400)
    return stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and not reparse


def _evidence_folder():
    """The app's own evidence folder next to config.json (per user). Older regular files directly inside are
    removed first; links are never followed, and a file a viewer still holds open (Windows lock) stays."""
    folder = _config_path().parent / 'evidence'
    try:
        folder.mkdir(mode=0o700, exist_ok=True)
    except OSError:
        raise _BridgeFailure('EVIDENCE_OPEN_FAILED') from None
    if not _real_directory(folder):
        raise _BridgeFailure('EVIDENCE_OPEN_FAILED')
    with os.scandir(folder) as entries:
        for entry in entries:
            try:
                if entry.is_symlink() or not entry.is_file(follow_symlinks=False):
                    continue
                if getattr(entry.stat(follow_symlinks=False), 'st_file_attributes', 0) & 0x400:
                    continue
                os.unlink(entry.path)
            except OSError:
                pass
    return folder


def _metric_shot_folder():
    """Where click-time full-page Metric shots live: a sub-folder of the evidence folder, so the
    evidence cleanup (regular files directly inside only) keeps them. Not created here."""
    return _config_path().parent / 'evidence' / tdn_metric_browser.SHOT_FOLDER


def _prepare_metric_shot_folder():
    """The click's shot folder, made if needed WITHOUT the evidence cleanup (earlier evidence and shots
    stay). None when it cannot be made, or the folder or its parent is a link/junction: no picture then."""
    try:
        folder = _metric_shot_folder()
        for path in (folder.parent, folder):
            if not tdn_metric_browser.plain_path(folder.parent, path):
                return None
            path.mkdir(mode=0o700, exist_ok=True)
        return folder if tdn_metric_browser.plain_path(folder.parent, folder) else None
    except (OSError, _BridgeFailure):
        return None


def _delete_sent_shot(path, digest):
    """Delete the local picture only when it is still the very file whose bytes were sent online.
    1. The folder chain has no link/junction. 2. The file is moved atomically to a unique hidden name in the
    same folder, so the user-visible name can no longer be swapped under us. 3. That name is opened, hashed
    through the same handle, and its lstat identity (inode / Windows file index + device) must equal the
    handle's fstat: a link or a replaced file fails here. 4. The chain is checked again, then the hidden name
    is deleted. Any mismatch or error moves the file back (never over a file that appeared meanwhile).
    Residual (accepted for a single-user desktop app): a same-user process able to swap the folder in the
    final instant between the last check and the unlink could still redirect the unlink. Returns True when
    deleted."""
    path = Path(path)
    folder, root = path.parent, path.parent.parent
    try:
        if not (tdn_metric_browser.plain_path(root, path) and path.is_file()):
            return False
    except OSError:
        return False
    hidden = folder / f'.sent-{os.urandom(8).hex()}{path.suffix}'
    try:
        os.rename(path, hidden)
    except OSError:
        return False
    deleted = False
    try:
        with open(hidden, 'rb') as handle:
            pinned = os.fstat(handle.fileno())
            hasher = hashlib.sha256()
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                hasher.update(chunk)
        current = os.lstat(hidden)
        same = (hasher.hexdigest() == digest and stat.S_ISREG(current.st_mode) and current.st_ino != 0 and
                (current.st_ino, current.st_dev) == (pinned.st_ino, pinned.st_dev) and
                not getattr(current, 'st_file_attributes', 0) & 0x400)
        if same and tdn_metric_browser.plain_path(root, hidden):
            os.unlink(hidden)
            deleted = True
    except OSError:
        deleted = False
    finally:
        if not deleted:
            try:
                if not os.path.lexists(path):
                    os.rename(hidden, path)
            except OSError:
                pass
    return deleted


def _open_local_file(path):
    if sys.platform == 'win32':
        os.startfile(str(path))
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(path)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _publish_without_replacing(temp_path, destination):
    """Copy a verified file to `destination`, or to `name (N).ext` when that name is taken."""
    stem, extension = os.path.splitext(destination.name)
    for number in range(1000):
        candidate = destination if number == 0 else destination.with_name(f'{stem} ({number}){extension}')
        try:
            target = open(candidate, 'xb')
        except FileExistsError:
            continue
        try:
            with target, open(temp_path, 'rb') as source:
                shutil.copyfileobj(source, target)
                target.flush()
                os.fsync(target.fileno())
        except OSError:
            try:
                candidate.unlink()
            except OSError:
                pass
            raise _BridgeFailure('SAVE_FAILED') from None
        try:
            temp_path.unlink()
        except OSError:
            pass
        return candidate
    raise _BridgeFailure('SAVE_FAILED')


def _downloads_folder():
    """The user's Downloads folder when it exists, else None (the dialog then opens where it likes)."""
    folder = Path.home() / 'Downloads'
    return str(folder) if folder.is_dir() else None


def _choose_save_path(file_name, directory=None):
    try:
        import webview
    except ImportError:
        raise _BridgeFailure('SAVE_DIALOG_UNAVAILABLE') from None
    try:
        dialog_type = getattr(webview, 'SAVE_DIALOG', None)
        if dialog_type is None:
            dialog_type = getattr(getattr(webview, 'FileDialog', None), 'SAVE')
        windows = getattr(webview, 'windows', None)
        window = windows[0] if windows else None
        options = {'save_filename': file_name}
        if directory is not None:
            options['directory'] = directory
        if window is not None and hasattr(window, 'create_file_dialog'):
            selected = window.create_file_dialog(dialog_type, **options)
        else:
            selected = webview.create_file_dialog(dialog_type, **options)
    except Exception:
        raise _BridgeFailure('SAVE_DIALOG_FAILED') from None
    if isinstance(selected, (list, tuple)):
        selected = selected[0] if selected else None
    if selected is None or selected == '':
        return None
    if not isinstance(selected, (str, os.PathLike)):
        raise _BridgeFailure('SAVE_DIALOG_FAILED')
    return os.fspath(selected)


def _choose_save_folder():
    try:
        import webview
    except ImportError:
        raise _BridgeFailure('SAVE_DIALOG_UNAVAILABLE') from None
    try:
        dialog_type = getattr(webview, 'FOLDER_DIALOG', None)
        if dialog_type is None:
            dialog_type = getattr(getattr(webview, 'FileDialog', None), 'FOLDER')
        windows = getattr(webview, 'windows', None)
        window = windows[0] if windows else None
        if window is not None and hasattr(window, 'create_file_dialog'):
            selected = window.create_file_dialog(dialog_type)
        else:
            selected = webview.create_file_dialog(dialog_type)
    except Exception:
        raise _BridgeFailure('SAVE_DIALOG_FAILED') from None
    if isinstance(selected, (list, tuple)):
        selected = selected[0] if selected else None
    if selected is None or selected == '':
        return None
    if not isinstance(selected, (str, os.PathLike)):
        raise _BridgeFailure('SAVE_DIALOG_FAILED')
    return os.fspath(selected)


# ---- The HTTPS tunnel, inside this process -------------------------------------------------------------
# A config whose sshCommand starts with the tunnel client (tdn-tunnel-client.exe --url ... --token ...) is sent
# here as that client sends it: one POST of the script to <url>/run on a new connection, no retry, and the
# answer read as frames of 1 byte kind + 4 byte big-endian length + data (O stdout, E stderr, K keepalive,
# X exit code). Starting the client program costs about 0.5 s per call; this does not. A transport failure is
# exit 255 (SSH_FAILED) as with the client; the call's time limit is SSH_TIMEOUT. The token is only sent in the
# Authorization header; it is never logged or put in an error.
_TUNNEL_CLIENT_NAMES = frozenset({'tdn-tunnel-client', 'tdn-tunnel-client.exe'})
# One SSL context for the process (loading the Windows certificate store once) and the last TLS session of each
# relay, given to the next connection so its handshake can resume.
_TUNNEL_TLS = {'context': None, 'sessions': {}}
_TUNNEL_TLS_LOCK = threading.Lock()
_TUNNEL_SILENCE_SECONDS = 60     # keepalives come every 15 s; 60 s of silence means the link is dead


class _TunnelTimeout(Exception):
    pass


def _tunnel_target(argv):
    """The --url / --token / --resolve-ip of a tunnel client argv, or None (not the tunnel client)."""
    if not argv or Path(argv[0].replace('\\', '/')).name.lower() not in _TUNNEL_CLIENT_NAMES:
        return None
    values = {}
    rest = list(argv[1:])
    while rest:
        word = rest.pop(0)
        for name in ('--url', '--token', '--resolve-ip'):
            if word == name and rest:
                values[name] = rest.pop(0)
            elif word.startswith(name + '='):
                values[name] = word[len(name) + 1:]
    if not values.get('--url') or not values.get('--token'):
        return None          # the client itself would stop on its arguments: keep running it as before
    return values


class _TunnelStream:
    """The bytes of one TLS socket. Every blocking read waits at most until the call's deadline (`wait`)."""

    def __init__(self, sock, wait):
        self.sock, self.wait, self.buf = sock, wait, b''

    def more(self):
        self.sock.settimeout(self.wait())
        data = self.sock.recv(65536)
        if not data:
            raise EOFError
        self.buf += data

    def line(self):
        while b'\r\n' not in self.buf:
            if len(self.buf) > 65536:
                raise ValueError('header line too long')
            self.more()
        line, _, self.buf = self.buf.partition(b'\r\n')
        return line

    def exact(self, size):
        while len(self.buf) < size:
            self.more()
        data, self.buf = self.buf[:size], self.buf[size:]
        return data


class _TunnelBody:
    """The HTTP body of the answer: chunked, Content-Length, or read until the relay closes (HTTP/1.0 or
    Connection: close). Only the bytes already received are taken, so a slow relay still meets the deadline."""

    def __init__(self, stream, headers):
        self.stream, self.buf, self.left = stream, b'', 0
        if 'chunked' in headers.get('transfer-encoding', '').lower():
            self.mode = 'chunked'
        elif 'content-length' in headers:
            self.mode, self.left = 'length', int(headers['content-length'])
        else:
            self.mode = 'close'

    def more(self):
        stream = self.stream
        if self.mode == 'chunked' and not self.left:
            self.left = int(stream.line().split(b';')[0].strip(), 16)
            if not self.left:
                raise EOFError
        if self.mode == 'length' and not self.left:
            raise EOFError
        if not stream.buf:
            stream.more()
        take = stream.buf if self.mode == 'close' else stream.buf[:self.left]
        stream.buf = stream.buf[len(take):]
        self.buf += take
        if self.mode != 'close':
            self.left -= len(take)
            if self.mode == 'chunked' and not self.left:
                stream.exact(2)              # the CRLF after a chunk

    def exact(self, size):
        while len(self.buf) < size:
            self.more()
        data, self.buf = self.buf[:size], self.buf[size:]
        return data


class _TunnelCall:
    """One tunnel call run on a worker thread. The caller waits once, until the deadline; past it the call is
    abandoned: its socket is shut and closed, and a socket the worker opens later is closed at once."""

    def __init__(self, deadline):
        self.deadline = deadline
        self.abandoned = False
        self.lock = threading.Lock()
        self.sock = None
        self.done = threading.Event()
        self.result = None

    def wait(self):
        """The time a blocking step may take (a backstop: the caller's deadline is the limit)."""
        remaining = self.deadline - time.monotonic()
        if remaining <= 0 or self.abandoned:
            raise _TunnelTimeout()
        return min(_TUNNEL_SILENCE_SECONDS, remaining)

    def keep(self, sock):
        with self.lock:
            if self.abandoned:
                sock.close()
                raise _TunnelTimeout()
            self.sock = sock

    def abandon(self):
        with self.lock:
            self.abandoned = True
            sock, self.sock = self.sock, None
        if sock is not None:
            try:
                socket.socket.shutdown(sock, socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

    def close(self):
        with self.lock:
            sock, self.sock = self.sock, None
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass


def _tunnel_run(target, script, timeout):
    """(exit code, stdout bytes) of one tunnel call; raises _TunnelTimeout at the call's time limit.

    The whole call (name lookup, connect, TLS, request, headers, every frame) runs on a daemon worker thread;
    this thread waits for it once, until one wall-clock deadline. Past it the call is abandoned and
    SSH_TIMEOUT comes back at once; the worker's late result is dropped."""
    call = _TunnelCall(time.monotonic() + timeout)

    def work():
        try:
            call.result = ('ok', _tunnel_exchange(target, script, call))
        except _TunnelTimeout:
            call.result = ('timeout', None)
        except Exception:        # never let a worker error escape: it is a transport failure
            call.result = ('ok', (255, b''))
        finally:
            call.close()
            call.done.set()

    threading.Thread(target=work, name='tdn-tunnel-call', daemon=True).start()
    if not call.done.wait(max(0.0, call.deadline - time.monotonic())):
        call.abandon()
        raise _TunnelTimeout()
    kind, value = call.result
    if kind == 'timeout':
        raise _TunnelTimeout()
    return value


def _tunnel_exchange(target, script, call):
    """The worker's part of one tunnel call: (exit code, stdout bytes)."""
    url = urlsplit(target['--url'])
    if url.scheme != 'https' or not url.hostname:
        return 255, b''
    try:
        port = url.port or 443
    except ValueError:
        return 255, b''
    host = url.hostname if port == 443 else '%s:%d' % (url.hostname, port)
    request = ('POST /run HTTP/1.1\r\nHost: %s\r\nAuthorization: Bearer %s\r\n'
               'Content-Type: text/plain; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n'
               % (host, target['--token'], len(script))).encode('latin-1') + script
    out = []
    try:
        raw = socket.create_connection((target.get('--resolve-ip') or url.hostname, port), call.wait())
        call.keep(raw)
        with _TUNNEL_TLS_LOCK:
            if _TUNNEL_TLS['context'] is None:
                _TUNNEL_TLS['context'] = ssl.create_default_context()
            context, session = _TUNNEL_TLS['context'], _TUNNEL_TLS['sessions'].get((url.hostname, port))
        sock = context.wrap_socket(raw, server_hostname=url.hostname, do_handshake_on_connect=False,
                                   session=session)
        call.keep(sock)
        sock.settimeout(call.wait())
        sock.do_handshake()
        sock.settimeout(call.wait())
        sock.sendall(request)
        stream = _TunnelStream(sock, call.wait)
        status = stream.line().split(None, 2)
        if len(status) < 2 or not status[0].startswith(b'HTTP/') or status[1] != b'200':
            return 255, b''
        headers = {}
        while True:
            line = stream.line()
            if not line:
                break
            name, _, value = line.decode('latin-1').partition(':')
            headers[name.strip().lower()] = value.strip()
        body = _TunnelBody(stream, headers)
        while True:
            kind, size = struct.unpack('>cI', body.exact(5))
            data = body.exact(size) if size else b''
            if kind == b'O':
                out.append(data)
            elif kind == b'X':
                code = struct.unpack('>i', data)[0]
                if sock.session is not None:
                    with _TUNNEL_TLS_LOCK:
                        _TUNNEL_TLS['sessions'][(url.hostname, port)] = sock.session
                return (code if 0 <= code <= 254 else 1), b''.join(out)
            elif kind not in (b'E', b'K'):
                return 255, b''
    except (OSError, EOFError, struct.error, ValueError):
        if call.abandoned or call.deadline - time.monotonic() <= 0.05:
            raise _TunnelTimeout() from None
        return 255, b''          # a dead link (60 s without a byte), a refusal or a broken answer


def _config_path():
    override = os.environ.get('TDN_SHOPEE_APP_CONFIG')
    if override is not None:
        path = Path(override)
        if not override or not path.is_absolute():
            raise _BridgeFailure('CONFIG_INVALID')
        return path
    appdata = os.environ.get('APPDATA')
    if not appdata:
        raise _BridgeFailure('CONFIG_MISSING')
    return Path(appdata) / 'tdn-shopee-flow' / 'config.json'


def _choice_path():
    """The last «Sản phẩm bán chạy» choice, next to config.json (the web view keeps no storage)."""
    return _config_path().parent / 'product-selection.json'


def _run_sort_path():
    """The last run list order («Mới tạo trước» / «Cũ nhất trước»), next to config.json."""
    return _config_path().parent / 'run-sort.json'


RUN_SORTS = ('newest', 'oldest')
_SEMVER = re.compile(r'(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})')


def _update_dismissed_path():
    """The app version whose «Có bản mới» banner was closed, next to config.json."""
    return _config_path().parent / 'app-update-dismissed.json'


def _app_build():
    """This app's own version: app-version.json baked in by the build (version + short git sha), or the VERSION
    file when run from source. A missing or bad value is None (no label, no update check)."""
    try:
        if getattr(sys, 'frozen', False):
            value = json.loads((Path(sys._MEIPASS) / 'app-version.json').read_text(encoding='utf-8'))
        else:
            value = {'version': (Path(__file__).resolve().parent / 'VERSION').read_text(encoding='utf-8').strip(),
                     'commit': None}
    except (OSError, ValueError):
        value = {}
    version = value.get('version') if isinstance(value, dict) else None
    commit = value.get('commit') if isinstance(value, dict) else None
    return {'version': version if isinstance(version, str) and _SEMVER.fullmatch(version) else None,
            'commit': commit if isinstance(commit, str) and re.fullmatch(r'[0-9a-f]{4,40}', commit) else None}


def _write_choice(path, value, prefix):
    """Best effort: a failed write only means the default choice next time."""
    temp = None
    try:
        handle, temp = tempfile.mkstemp(prefix=prefix, suffix='.part', dir=str(path.parent))
        with os.fdopen(handle, 'w', encoding='utf-8') as out:
            out.write(json.dumps(value))
        os.replace(temp, path)
        temp = None
    except (OSError, _BridgeFailure):
        pass
    finally:
        if temp is not None:
            try:
                os.unlink(temp)
            except OSError:
                pass


# ---- The run-view disk copy (shown at an open while the fresh read runs; never used for a write) ---------
# %APPDATA%\tdn-shopee-flow\run-view-cache\<server key>\<runId>.json: the checked --result answer of a run that is
# not RUNNING / UNCERTAIN, all parts ok. The server key is a hash of where the runs live (tunnel host or SSH
# command, remote script, runs folder); the tunnel token is never part of it, nor of the file.
RUN_VIEW_COPY_FORMAT = 'run-view-copy-v1'
RUN_VIEW_COPY_MAX_FILES = 300
RUN_VIEW_COPY_MAX_BYTES = 50 * 1024 * 1024
_RUN_VIEW_COPY_LOCK = threading.Lock()
_APP_VERSION = []


def _app_version():
    """This build of the app: the EXE's size and time, or the bridge and page sources when run from source."""
    if not _APP_VERSION:
        digest = hashlib.sha256(RUN_VIEW_COPY_FORMAT.encode('ascii'))
        try:
            if getattr(sys, 'frozen', False):
                info = os.stat(sys.executable)
                digest.update(b'%d:%d' % (info.st_size, info.st_mtime_ns))
            else:
                here = Path(__file__).resolve().parent
                for name in ('tdn_shopee_app.py', 'index.html'):
                    digest.update((here / name).read_bytes())
        except OSError:
            digest.update(b'unknown')
        _APP_VERSION.append(digest.hexdigest()[:16])
    return _APP_VERSION[0]


def _run_view_copy_root():
    return _config_path().parent / 'run-view-cache'


def _server_key(config):
    """16 hex of sha256(where the runs live). Never the token: only the tunnel's host and port are used."""
    network = config.get('network')
    argv = config.get('sshCommand') or []
    tunnel = _tunnel_target(argv)
    if network and network.get('enabled'):
        place = 'native:' + json.dumps({key: value for key, value in network.items()
                                        if not re.search(r'token|secret|password|key', key, re.I)},
                                       sort_keys=True, default=str)
    elif tunnel is not None:
        url = urlsplit(tunnel['--url'])
        try:
            place = 'tunnel:%s:%s' % (url.hostname, url.port or 443)
        except ValueError:
            place = 'tunnel:%s' % url.hostname
    else:
        words, skip = [], False
        for word in argv:
            if skip:
                skip = False
                continue
            if word == '--token':
                skip = True
                continue
            if not word.startswith('--token='):
                words.append(word)
        place = 'ssh:' + json.dumps(words)
    text = '\0'.join([place, config.get('remoteScript') or '', config.get('runsRoot') or ''])
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]


def _copy_sig(info):
    """`status:revision` of the run's execution (the list row has the same two values), or None."""
    execution = info.get('execution') if isinstance(info, dict) else None
    if not isinstance(execution, dict) or not isinstance(execution.get('status'), str) or \
            type(execution.get('revision')) is not int:
        return None
    return '%s:%d' % (execution['status'], execution['revision'])


def _load_config():
    path = _config_path()
    try:
        config = json.loads(path.read_text(encoding='utf-8-sig'))
    except FileNotFoundError:
        raise _BridgeFailure('CONFIG_MISSING') from None
    except (OSError, ValueError):
        raise _BridgeFailure('CONFIG_INVALID') from None
    allowed = {'sshCommand', 'remoteScript', 'runsRoot', 'presetsRoot', 'remoteEnvFile',
               'timeoutSeconds', 'network'}
    if not isinstance(config, dict) or set(config) - allowed:
        raise _BridgeFailure('CONFIG_INVALID')
    network = config.get('network')
    if network is not None:
        try:
            network = tdn_shopee_transport.normalize_network(network)
        except tdn_shopee_transport.TransportError:
            raise _BridgeFailure('CONFIG_INVALID') from None
    native = bool(network and network.get('enabled'))
    if not native:
        command = config.get('sshCommand')
        if (not isinstance(command, list) or not command or
                not all(isinstance(arg, str) and arg.strip() and '\x00' not in arg for arg in command)):
            raise _BridgeFailure('CONFIG_INVALID')
    for key in ('remoteScript', 'runsRoot', 'presetsRoot', 'remoteEnvFile'):
        value = config.get(key)
        if value is None and key != 'remoteScript':
            continue
        if not isinstance(value, str) or not _REMOTE_PATH.fullmatch(value):
            raise _BridgeFailure('CONFIG_INVALID')
    timeout = config.get('timeoutSeconds', 30)
    if type(timeout) is not int or timeout <= 0:
        raise _BridgeFailure('CONFIG_INVALID')
    result = {**config, 'timeoutSeconds': timeout}
    if network is not None:
        result['network'] = network
    return result


class Api:
    """Only these public methods are exposed to the page."""

    _CONNECTION_FAILURE_CODES = frozenset({
        'SSH_FAILED', 'SSH_TIMEOUT', 'NOT_SENT', 'NO_CANDIDATE', 'NETWORK_UNAVAILABLE',
        'LAN_SCOPE_TOO_BROAD', 'HOST_PROBE_UNAVAILABLE', 'HOST_IDENTITY_MISMATCH',
        'HOST_KEY_MISSING',
    })

    def __init__(self):
        self._prefetch = threading.Condition()
        self._prefetch_queue = []
        self._prefetch_current = None      # {'runId', 'done', 'reply'} of the prefetch read out
        self._prefetch_running = False
        self._user_calls = 0               # page calls out (the prefetch waits for none)
        self._mutations = 0                # write/start/save/delete commands sent (each moves it, before and after)
        self._copy_generation = {}         # runId -> times its copy was removed (a read started before saves nothing)
        self._reads_out = {}               # runId -> run-view reads out (the list removes their copy-to-be too)
        self._listed = None                # runIds of the newest run list (None: no list yet)
        self._copies_off = False           # a run-view answered USAGE: no copy is given for the rest of the session
        self._transport = None
        self._transport_key = None
        self._transport_lock = threading.Lock()
        self._connection_condition = threading.Condition()
        self._connection_inflight = False
        self._connection_result = None
        self._connection_failure = None
        self._connection_failure_at = 0.0
        self._connection_attempts = 0
        self._metric = None
        self._metric_lock = threading.Lock()
        self._shot_uploads = set()         # runIds whose Metric picture is being sent online
        self._shot_attempts = {}           # runId -> monotonic time of the last upload attempt
        self._shot_generation = {}         # runId -> number of finished upload attempts (sent or failed)
        self._shot_uploads_lock = threading.Lock()

    def _connection_backoff(self):
        return min(15, 2 ** min(self._connection_attempts, 4))

    def _safe(self, operation):
        try:
            return operation()
        except _BridgeFailure as error:
            return _error(error.code)
        except Exception:
            # Never expose exception text, SSH diagnostics or configuration to JS.
            return _error('REMOTE_OUTPUT_INVALID')

    def _run_id(self, run_id):
        if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
            raise _BridgeFailure('ARG_INVALID')
        return run_id

    def _transport_for(self, config):
        network = config.get('network')
        if not network or not network.get('enabled'):
            return None
        key = hashlib.sha256(json.dumps(network, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
        with self._transport_lock:
            if self._transport is None or self._transport_key != key:
                try:
                    self._transport = tdn_shopee_transport.NativeTransport(network)
                except tdn_shopee_transport.TransportError:
                    raise _BridgeFailure('CONFIG_INVALID') from None
                self._transport_key = key
            return self._transport

    def _invalidate_native(self, token):
        if token is None:
            return
        transport, generation = token
        with self._transport_lock:
            if self._transport is not transport:
                return
            transport.invalidate(generation)

    def _dispatch_argv(self, config):
        transport = self._transport_for(config)
        if transport is None:
            return config['sshCommand'], None
        endpoint, generation = transport.dispatch_token()
        if endpoint is None:
            raise _BridgeFailure('NOT_SENT')
        try:
            return transport.argv_for(endpoint), (transport, generation)
        except tdn_shopee_transport.TransportError as error:
            self._invalidate_native((transport, generation))
            raise _BridgeFailure(error.code) from None

    def _remote_plan(self, action, run_id=None, payload=None, config=None, plan_sha256=None,
                     kind=None, attempt_id=None, export_sha256=None, source_sha256=None, flags=()):
        words = list(_COMMANDS[action])
        if action == 'metricDateAvailability':
            words.append(self._metric_end_date(payload))
        if action in ('status', 'captureSpecs', 'moduleOutputs', 'readModuleEvidence', 'entry', 'flow', 'm1', 'm2', 'm3',
                      'reviewSampling', 'refreshReviewCounts', 'saveReviewPlan',
                      'stopReviewAttempt', 'reconcileReviewAttempt', 'reviewData', 'reviewStats', 'reviewInsights',
                      'saveReviewData', 'exportReviewData', 'readReviewExport', 'reviewProcess',
                      'processReviewData', 'deleteRun', 'runView', 'reviewInsightsSummary', 'reviewInsightComments',
                      'metricShotUploadUrl', 'metricShotConfirm', 'metricShotViewUrl'):
            words.append(self._run_id(run_id))
        words.extend(flags)              # wave 2 flags, built and checked by the caller
        if action in ('saveReviewPlan', 'saveReviewData', 'exportReviewData'):
            words.append('--stdin')
        if action in ('stopReviewAttempt', 'reconcileReviewAttempt'):
            words.extend(['--kind', kind, '--attempt', attempt_id])
        if action == 'm3' and plan_sha256 is not None:
            words.extend(['--plan-sha256', plan_sha256])
        if action == 'readReviewExport':
            words.extend(['--export-sha256', export_sha256])
        if action == 'readModuleEvidence':
            if kind not in ('full-page', 'top-products', 'raw'):
                raise _BridgeFailure('ARG_INVALID')
            words.extend(['--kind', kind, '--output-sha256', self._sha256(export_sha256)])
        if action == 'processReviewData':
            words.extend(['--source-sha256', self._sha256(source_sha256)])
        if action in ('flow', 'm1', 'm2', 'm3', 'refreshReviewCounts', 'reconcileReviewAttempt',
                      'processReviewData'):
            words.append('--detach')
        config = _load_config() if config is None else config
        lines = ['export PYTHONDONTWRITEBYTECODE=1']
        for key, name in (('runsRoot', 'SHOPEE_FLOW_RUNS'), ('presetsRoot', 'SHOPEE_FLOW_PRESETS')):
            if config.get(key) is not None:
                lines.append(f'export {name}="{config[key]}"')
        env_file = config.get('remoteEnvFile')
        if env_file is not None:
            lines.append(f'if [ -f "{env_file}" ]; then set -a; . "{env_file}"; set +a; fi')
        command = f'python3 "{config["remoteScript"]}" ' + ' '.join(words)
        if action in ('new', 'addProduct', 'm1Import', 'saveReviewPlan', 'saveReviewData', 'exportReviewData'):
            encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False, allow_nan=False,
                                                  separators=(',', ':')).encode('utf-8')).decode('ascii')
            command = f"printf '%s' '{encoded}' | base64 -d | " + command
        lines.append(command)
        return config, lines

    def _remote(self, action, run_id=None, payload=None, config=None, plan_sha256=None,
                kind=None, attempt_id=None, export_sha256=None, source_sha256=None, flags=()):
        config, lines = self._remote_plan(action, run_id=run_id, payload=payload, config=config,
                                          plan_sha256=plan_sha256, kind=kind, attempt_id=attempt_id,
                                          export_sha256=export_sha256, source_sha256=source_sha256,
                                          flags=flags)
        argv, token = self._dispatch_argv(config)
        return self._invoke(action, config, lines, argv, token=token)

    def _invoke(self, action, config, lines, argv, *, token=None, timeout=None):
        user = threading.current_thread().name != 'tdn-run-view-prefetch'
        mutation = action not in _READ_ONLY_COMMANDS
        with self._prefetch:
            if user:
                self._user_calls += 1
            if mutation:
                self._mutations += 1
        try:
            return self._invoke_now(action, config, lines, argv, token=token, timeout=timeout)
        finally:
            with self._prefetch:
                if user:
                    self._user_calls -= 1
                if mutation:
                    self._mutations += 1
                self._prefetch.notify_all()

    def _invoke_now(self, action, config, lines, argv, *, token=None, timeout=None):
        options = {'input': ('\n'.join(lines) + '\n').encode('utf-8'), 'capture_output': True,
                   'timeout': timeout if timeout is not None else (
                       150 if action in ('metricDateAvailability', 'm1Import') else config['timeoutSeconds'])}
        if sys.platform == 'win32':
            options['creationflags'] = subprocess.CREATE_NO_WINDOW
        tunnel = _tunnel_target(argv)
        try:
            if tunnel is not None:
                try:
                    code, stdout = _tunnel_run(tunnel, options['input'], options['timeout'])
                except _TunnelTimeout:
                    raise subprocess.TimeoutExpired(argv[:1], options['timeout']) from None
                result = subprocess.CompletedProcess(argv[:1], code, stdout=stdout, stderr=b'')
            else:
                result = subprocess.run(argv, **options)
        except subprocess.TimeoutExpired:
            self._invalidate_native(token)
            raise _BridgeFailure('SSH_TIMEOUT') from None
        except OSError:
            self._invalidate_native(token)
            raise _BridgeFailure('SSH_FAILED') from None
        except UnicodeError:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID') from None
        if result.returncode == 255:
            self._invalidate_native(token)
            raise _BridgeFailure('SSH_FAILED')
        if action in _WAVE2_COMMANDS and result.returncode == 2 and not result.stdout.strip():
            raise _BridgeFailure('USAGE')    # an older server: unknown command
        try:
            output = json.loads(result.stdout.decode('utf-8'), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (ValueError, TypeError):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID') from None
        if not isinstance(output, dict):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        form = output.get('format')
        if form == 'error-v1':
            if not isinstance(output.get('code'), str) or not isinstance(output.get('message'), str):
                raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
            return _error(output['code'], output['message'])
        if action == 'entry' and result.returncode in (0, 20) and form == 'handoff-v1':
            return {'ok': True, 'data': output}
        if result.returncode != 0:
            if form in ('module-result-v1', 'run-result-v1'):
                code = output.get('errorCode')
                if not isinstance(code, str):
                    code = 'GATE_FAILED'
                return {'ok': False, 'error': {'code': code, 'message': code, 'detail': output}}
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': output}

    def _probe_connection(self):
        config = _load_config()
        transport = self._transport_for(config)
        if transport is None:
            return self._remote('connection', config=config)
        deadline = time.monotonic() + config['network']['lan']['wallSeconds']
        _, lines = self._remote_plan('connection', config=config)

        def attempt(endpoints):
            failure = None
            for endpoint in endpoints:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, _BridgeFailure('SSH_TIMEOUT')
                try:
                    argv = transport.argv_for(endpoint)
                except tdn_shopee_transport.TransportError as error:
                    raise _BridgeFailure(error.code) from None
                try:
                    result = self._invoke('connection', config, lines, argv, timeout=remaining)
                except _BridgeFailure as error:
                    if error.code not in ('SSH_FAILED', 'SSH_TIMEOUT'):
                        raise
                    failure = error
                    continue
                if result.get('ok'):
                    data = result.get('data')
                    if (isinstance(data, dict) and data.get('format') == 'connection-v1' and
                            type(data.get('readonly')) is bool and isinstance(data.get('runsRoot'), str) and
                            data['runsRoot']):
                        transport.activate(endpoint)
                        return result, None
                failure = _BridgeFailure('REMOTE_OUTPUT_INVALID')
            return None, failure

        try:
            candidates = transport.find_candidates(deadline)
        except tdn_shopee_transport.TransportError as error:
            raise _BridgeFailure(error.code) from None
        result, last = attempt(candidates)
        if result is None and transport.active_endpoint() is not None and deadline - time.monotonic() > 0:
            # The cached endpoint passed the pin check but failed its
            # authenticated probe: spend the remaining budget on one full
            # rediscovery instead of reusing it.
            transport.invalidate(None)
            try:
                candidates = transport.find_candidates(deadline)
            except tdn_shopee_transport.TransportError as error:
                raise _BridgeFailure(error.code) from None
            result, failure = attempt(candidates)
            last = failure or last
        if result is not None:
            return result
        if last is not None:
            raise last
        raise _BridgeFailure(transport.last_code or 'NO_CANDIDATE')

    def connection(self):
        with self._connection_condition:
            if self._connection_inflight:
                while self._connection_inflight:
                    self._connection_condition.wait()
                return self._connection_result
            now = time.monotonic()
            if (self._connection_failure is not None and
                    now - self._connection_failure_at < self._connection_backoff()):
                return self._connection_failure
            self._connection_inflight = True
        answer = None
        try:
            answer = self._connection_answer()
        finally:
            with self._connection_condition:
                self._connection_inflight = False
                if answer is None:
                    answer = {'ok': True, 'data': {'connected': False, 'readonly': None,
                                                   'runsRoot': None, 'reason': 'REMOTE_OUTPUT_INVALID'}}
                self._connection_result = answer
                self._connection_condition.notify_all()
        return answer

    def _connection_answer(self):
        result = self._safe(self._probe_connection)
        if result['ok']:
            data = result['data']
            if (data.get('format') == 'connection-v1' and type(data.get('readonly')) is bool and
                    isinstance(data.get('runsRoot'), str) and data['runsRoot']):
                self._connection_failure = None
                self._connection_attempts = 0
                return {'ok': True, 'data': {'connected': True, 'readonly': data['readonly'],
                                             'runsRoot': data['runsRoot']}}
            reason = 'REMOTE_OUTPUT_INVALID'
        else:
            reason = result['error']['code']
        answer = {'ok': True, 'data': {'connected': False, 'readonly': None, 'runsRoot': None,
                                       'reason': reason}}
        if reason in self._CONNECTION_FAILURE_CODES:
            self._connection_attempts += 1
            self._connection_failure = answer
            self._connection_failure_at = time.monotonic()
        else:
            self._connection_failure = None
        return answer

    def presets(self):
        return self._safe(lambda: self._remote('presets'))

    def listRuns(self):
        return self._safe(self._list_runs)

    def _list_runs(self):
        result = self._remote('runs')
        data = result.get('data') if result['ok'] else None
        if isinstance(data, dict) and data.get('format') == 'runs-v1' and isinstance(data.get('runs'), list):
            listed = {row.get('runId') for row in data['runs'] if isinstance(row, dict)}
            with self._prefetch:                  # a read still out for an unlisted run saves nothing either
                self._listed = listed
                for run_id in [run_id for run_id in self._reads_out if run_id not in listed]:
                    self._copy_generation[run_id] = self._copy_generation.get(run_id, 0) + 1
            self._drop_copies(lambda run_id: run_id not in listed)       # runs gone from the newest list
        return result

    def captureSpecs(self, runId):
        return self._safe(lambda: self._remote('captureSpecs', run_id=self._run_id(runId)))

    def moduleOutputs(self, runId):
        return self._safe(lambda: self._remote('moduleOutputs', run_id=self._run_id(runId)))

    def openModuleEvidence(self, runId, kind, sha256):
        return self._safe(lambda: self._open_module_evidence(runId, kind, sha256))

    _EVIDENCE_NAMES = {'full-page': ('m1', 'fullPage', 'full-page.png', 'image/png'),
                       'top-products': ('m2', 'topProducts', 'top-products.png', 'image/png'),
                       'raw': ('m1', 'raw', 'raw-responses.json', 'application/json')}

    def _evidence_descriptor(self, run_id, kind, digest):
        """The server's descriptor of a saved evidence file, checked against ``kind`` and ``digest``."""
        if kind not in self._EVIDENCE_NAMES:
            raise _BridgeFailure('ARG_INVALID')
        result = self._remote('moduleOutputs', run_id=run_id)
        if not result['ok']:
            raise _BridgeFailure(result['error']['code'])
        data = result['data']
        module, key, file_name, media_type = self._EVIDENCE_NAMES[kind]
        if data.get('format') != 'module-outputs-v1' or data.get('runId') != run_id:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        descriptor = data.get(module, {}).get('evidence', {}).get(key)
        if not isinstance(descriptor, dict) or set(descriptor) != {'available', 'kind', 'sha256', 'byteSize', 'mediaType', 'fileName', 'errorCode'}:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        if descriptor['available'] is False:
            failure = descriptor.get('errorCode')
            raise _BridgeFailure(failure if isinstance(failure, str) and _STATIC_ERROR.fullmatch(failure) else 'EVIDENCE_UNAVAILABLE')
        if (descriptor['available'] is not True or descriptor['kind'] != kind or descriptor['sha256'] != digest or
                descriptor['fileName'] != file_name or descriptor['mediaType'] != media_type or descriptor['errorCode'] is not None or
                type(descriptor['byteSize']) is not int or not 1 <= descriptor['byteSize'] <= EXPORT_MAX_BYTES):
            raise _BridgeFailure('EVIDENCE_IDENTITY_MISMATCH')
        return descriptor

    def _open_module_evidence(self, run_id, kind, digest):
        run_id, digest = self._run_id(run_id), self._sha256(digest)
        if kind not in self._EVIDENCE_NAMES:
            raise _BridgeFailure('ARG_INVALID')
        try:
            descriptor = self._evidence_descriptor(run_id, kind, digest)
        except _BridgeFailure as failure:
            return _error(failure.code)
        file_name = self._EVIDENCE_NAMES[kind][2]
        try:
            folder = _evidence_folder()
            destination = self._stream_export(run_id, digest, descriptor['byteSize'], folder / file_name,
                                              evidence_kind=kind, keep_existing=True)
            _open_local_file(destination)
        except OSError:
            raise _BridgeFailure('EVIDENCE_OPEN_FAILED') from None
        return {'ok': True, 'data': {'format': 'module-evidence-open-v1', 'runId': run_id,
                                     'kind': kind, 'sha256': digest, 'opened': True}}

    # ---- The full-page Metric shot taken on this PC at the click; kept online 10 days once the run exists ----

    def _local_metric_shot(self, run_id):
        """The run's local picture (``.webp``, else an older ``.png``), or None: missing, or any part from
        evidence/ down is a link/junction."""
        folder = _metric_shot_folder()
        run_id = self._run_id(run_id)
        for extension in tdn_metric_browser.SHOT_EXTENSIONS:
            path = folder / tdn_metric_browser.run_shot_name(run_id, extension)
            try:
                if tdn_metric_browser.plain_path(folder.parent, path) and path.is_file():
                    return path
            except OSError:
                continue
        return None

    def uploadMetricShot(self, runId=None):
        """Send the run's local picture online in the background (never blocks the page). Returns at once."""
        return self._safe(lambda: self._start_metric_shot_upload(self._run_id(runId)))

    def _start_metric_shot_upload(self, run_id):
        """One worker per run, and at most one attempt per run every 60 s on every start path. The first
        attempt after the run was created is always allowed (``_send_metric_import`` clears the time)."""
        with self._shot_uploads_lock:
            started = self._claim_shot_upload(run_id)
        if started:
            self._spawn_shot_upload(run_id)
        return {'ok': True, 'data': {'format': 'metric-shot-upload-start-v1', 'runId': run_id, 'started': started}}

    def _claim_shot_upload(self, run_id):
        """Caller holds ``_shot_uploads_lock``. True (and the run marked as uploading) when a start is allowed."""
        now = time.monotonic()
        last = self._shot_attempts.get(run_id)
        started = (run_id not in self._shot_uploads and
                   (last is None or now - last >= _SHOT_RETRY_SECONDS) and
                   self._local_metric_shot(run_id) is not None)
        if started:
            self._shot_uploads.add(run_id)
            self._shot_attempts[run_id] = now
        return started

    def _spawn_shot_upload(self, run_id):
        threading.Thread(target=self._metric_shot_upload_worker, args=(run_id,),
                         name='tdn-metric-shot-upload', daemon=True).start()

    def _metric_shot_upload_worker(self, run_id):
        try:
            self._upload_metric_shot(run_id)
        except Exception:
            pass          # any failure: the local picture stays; a later details load tries again
        finally:
            with self._shot_uploads_lock:
                self._shot_uploads.discard(run_id)
                self._shot_generation[run_id] = self._shot_generation.get(run_id, 0) + 1   # one per finished attempt

    def _upload_metric_shot(self, run_id):
        """upload-url -> PUT straight to storage -> confirm -> delete the local file. True when kept online."""
        local = self._local_metric_shot(run_id)
        content_type = _SHOT_TYPES.get(local.suffix.lower()) if local is not None else None
        if content_type is None:
            return False
        data = local.read_bytes()
        if not 1 <= len(data) <= _SHOT_MAX_BYTES:
            return False
        digest = hashlib.sha256(data).hexdigest()
        key = f'metric-shots/{run_id}/{digest}.{local.suffix.lower()[1:]}'     # one immutable key per content
        size = str(len(data))
        result = self._remote('metricShotUploadUrl', run_id=run_id,
                              flags=('--content-type', content_type, '--bytes', size, '--sha256', digest))
        if result['ok']:
            signed = result['data']
            if (set(signed) != {'format', 'runId', 'url', 'key', 'contentType', 'expiresInSeconds'} or
                    signed['format'] != 'metric-shot-upload-v1' or signed['runId'] != run_id or
                    signed['key'] != key or signed['contentType'] != content_type or
                    not isinstance(signed['url'], str) or not _R2_URL.fullmatch(signed['url'])):
                return False
            import urllib.error, urllib.request
            # The URL signs the body hash: storage refuses any other bytes under this key.
            request = urllib.request.Request(signed['url'], data=data, method='PUT',
                                             headers={'Content-Type': content_type,
                                                      'x-amz-content-sha256': digest})
            try:
                with urllib.request.urlopen(request, timeout=_SHOT_PUT_SECONDS) as response:
                    if not 200 <= response.status < 300:
                        return False
            except urllib.error.HTTPError as error:
                error.close()        # refused by storage: release its body; the picture stays here
                return False
        elif result['error'].get('code') != 'METRIC_SHOT_ALREADY_UPLOADED':
            return False      # R2_NOT_CONFIGURED, an older server, offline...: the picture stays on this PC
        confirmed = self._remote('metricShotConfirm', run_id=run_id,
                                 flags=('--key', key, '--sha256', digest, '--bytes', size))
        record = confirmed.get('data') if confirmed['ok'] else None
        if (not isinstance(record, dict) or record.get('format') != 'metric-shot-r2-v1' or
                record.get('runId') != run_id or record.get('key') != key or
                record.get('sha256') != digest or record.get('byteSize') != len(data)):
            return False
        _delete_sent_shot(local, digest)      # kept online: the local copy goes, only if it is that very file
        return True

    def _metric_shot_online(self, run_id):
        """``metric-shot-view-v1`` checked, or None when the server cannot say (offline, not set up, older)."""
        try:
            result = self._remote('metricShotViewUrl', run_id=run_id)
        except _BridgeFailure:
            return None
        if not result['ok']:
            return None
        view = result['data']
        if view.get('format') != 'metric-shot-view-v1' or view.get('runId') != run_id or view.get('state') not in _SHOT_STATES:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        if view['state'] == 'NOT_UPLOADED':
            return {'state': 'NOT_UPLOADED'}
        if not isinstance(view.get('deleteAfter'), str) or not _UTC_TEXT.fullmatch(view['deleteAfter']):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        if view['state'] == 'EXPIRED':
            return {'state': 'EXPIRED', 'deleteAfter': view['deleteAfter']}
        if (not isinstance(view.get('url'), str) or not _R2_URL.fullmatch(view['url']) or
                view.get('contentType') not in _SHOT_TYPES.values() or
                type(view.get('byteSize')) is not int or not 1 <= view['byteSize'] <= _SHOT_MAX_BYTES):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'state': 'AVAILABLE', 'deleteAfter': view['deleteAfter'], 'url': view['url'],
                'contentType': view['contentType'], 'byteSize': view['byteSize']}

    def metricShotState(self, runId=None):
        """One read per opening of the run's details: is there a picture on this PC, and what the server keeps
        online. A local picture of a run with no online copy yet is sent again in the background (refused
        within 60 s of the last attempt)."""
        return self._safe(lambda: self._metric_shot_state(self._run_id(runId)))

    def _metric_shot_state(self, run_id):
        with self._shot_uploads_lock:
            before = self._shot_generation.get(run_id, 0)
        online = self._metric_shot_online(run_id)
        # The retry decision and the local/uploading snapshot are one locked step after the server read.
        with self._shot_uploads_lock:
            started = (online is not None and online['state'] in ('NOT_UPLOADED', 'AVAILABLE') and
                       self._claim_shot_upload(run_id))
            changed = self._shot_generation.get(run_id, 0) != before
            uploading, local = run_id in self._shot_uploads, self._local_metric_shot(run_id) is not None
        if started:
            self._spawn_shot_upload(run_id)
        if changed:
            # An upload finished while the server was asked: ask once more so the one answer is coherent.
            online = self._metric_shot_online(run_id)
            with self._shot_uploads_lock:
                uploading, local = run_id in self._shot_uploads, self._local_metric_shot(run_id) is not None
        data = {'format': 'metric-shot-state-v1', 'runId': run_id, 'local': local,
                'state': online['state'] if online is not None else None, 'uploading': uploading}
        if online is not None and 'deleteAfter' in online:
            data['deleteAfter'] = online['deleteAfter']
        return {'ok': True, 'data': data}

    def viewMetricShot(self, runId=None, sha256=None, oldKnown=False):
        """«Xem ảnh Metric», source chosen now: the local picture in the app's own viewer (a data URL, nothing
        written), else a 15-minute online link, else the server's old full-page picture (``sha256``, opened as
        before). The page passes the old picture's digest whenever the run has one; ``oldKnown`` true = the page
        has the step results, so a null digest means «no old picture» and nothing is looked up here."""
        return self._safe(lambda: self._view_metric_shot(self._run_id(runId), sha256, oldKnown))

    def _view_metric_shot(self, run_id, digest=None, old_known=False):
        if type(old_known) is not bool:
            raise _BridgeFailure('ARG_INVALID')
        failure = None
        try:
            result = self._view_metric_shot_new(run_id)
        except _BridgeFailure as error:
            failure, result = error, {'ok': False}
        if result.get('ok') and result['data']['state'] in ('LOCAL', 'AVAILABLE'):
            return result
        if digest is None and not old_known:
            digest = self._old_full_page_digest(run_id)     # the page had no outputs: look for it here
        if digest is not None:
            return self._open_module_evidence(run_id, 'full-page', digest)      # an old run's server picture
        if failure is not None:
            raise failure
        return result

    def _old_full_page_digest(self, run_id):
        """The old server full-page picture's sha256 from one ``moduleOutputs`` read, or None when the run has
        none. A failed read raises its own error code (never «no picture»)."""
        result = self._remote('moduleOutputs', run_id=run_id)
        if not result['ok']:
            raise _BridgeFailure(result['error'].get('code') or 'REMOTE_OUTPUT_INVALID')
        data = result['data']
        if not isinstance(data, dict) or data.get('format') != 'module-outputs-v1' or data.get('runId') != run_id:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        m1 = data.get('m1') if isinstance(data.get('m1'), dict) else {}
        evidence = m1.get('evidence') if isinstance(m1.get('evidence'), dict) else {}
        descriptor = evidence.get('fullPage')
        if (isinstance(descriptor, dict) and descriptor.get('available') is True and
                isinstance(descriptor.get('sha256'), str) and _PLAN_SHA.fullmatch(descriptor['sha256'])):
            return descriptor['sha256']
        return None

    def _view_metric_shot_new(self, run_id):
        base = {'format': 'metric-shot-open-v1', 'runId': run_id}
        local = self._local_metric_shot(run_id)
        if local is not None:
            content_type = _SHOT_TYPES.get(local.suffix.lower())
            try:
                data = local.read_bytes()
            except OSError:
                raise _BridgeFailure('EVIDENCE_OPEN_FAILED') from None
            if content_type is not None and 1 <= len(data) <= _SHOT_MAX_BYTES:
                src = f'data:{content_type};base64,' + base64.b64encode(data).decode('ascii')
                return {'ok': True, 'data': dict(base, state='LOCAL', src=src)}
        online = self._metric_shot_online(run_id)
        if online is None:
            raise _BridgeFailure('EVIDENCE_LOCAL_MISSING')
        if online['state'] != 'AVAILABLE':
            return {'ok': True, 'data': dict(base, state=online['state'], **(
                {'deleteAfter': online['deleteAfter']} if 'deleteAfter' in online else {}))}
        return {'ok': True, 'data': dict(base, state='AVAILABLE', src=online['url'], deleteAfter=online['deleteAfter'])}

    def localMetricShot(self, runId=None):
        return self._safe(lambda: {'ok': True, 'data': {'format': 'local-metric-shot-v1', 'runId': self._run_id(runId),
                                                         'exists': self._local_metric_shot(runId) is not None}})

    def openLocalMetricShot(self, runId=None):
        return self._safe(lambda: self._open_local_metric_shot(runId))

    def _open_local_metric_shot(self, run_id):
        path = self._local_metric_shot(run_id)      # checked again right before opening
        if path is None:
            raise _BridgeFailure('EVIDENCE_LOCAL_MISSING')
        try:
            _open_local_file(path)
        except OSError:
            raise _BridgeFailure('EVIDENCE_OPEN_FAILED') from None
        return {'ok': True, 'data': {'format': 'local-metric-shot-open-v1', 'runId': self._run_id(run_id), 'opened': True}}

    # ---- «Tải ảnh»: a copy of the Metric picture, same source order as «Xem ảnh Metric» ----

    def saveMetricShot(self, runId=None, name=None, sha256=None, online=False, oldKnown=False):
        return self._safe(lambda: self._save_metric_shot(runId, name, sha256, online, oldKnown))

    def _save_metric_shot(self, run_id, name, digest, online=False, old_known=False):
        """The run's local picture, else the online copy (``online`` true), else the server's old full-page
        picture (``digest``), saved where the user picks. Default name ``<run name>-<runId>.<webp|png>`` in
        Downloads. The original stays."""
        run_id = self._run_id(run_id)
        if name is not None and not isinstance(name, str):
            raise _BridgeFailure('ARG_INVALID')
        if type(online) is not bool or type(old_known) is not bool:
            raise _BridgeFailure('ARG_INVALID')
        local = self._local_metric_shot(run_id)
        descriptor = None
        remote = None
        extension = local.suffix.lower()[1:] if local is not None else 'png'
        online_state = None
        if local is None and online:
            try:
                remote = self._metric_shot_online(run_id)
            except _BridgeFailure:
                remote = None            # an invalid answer: fall back to the old picture, as «Xem ảnh» does
            online_state = remote['state'] if remote is not None else None
            if online_state == 'AVAILABLE':
                extension = 'webp' if remote['contentType'] == 'image/webp' else 'png'
            else:
                remote = None
        if local is None and remote is None:
            if digest is None and online and not old_known:
                digest = self._old_full_page_digest(run_id)     # the page had no outputs: look for it here
            if digest is None:
                # Nothing to save; the page shows why («đã tự xóa sau 10 ngày» / «không có ảnh Metric»).
                raise _BridgeFailure('METRIC_SHOT_' + online_state if online_state in ('EXPIRED', 'NOT_UPLOADED')
                                     else 'EVIDENCE_LOCAL_MISSING')
            digest = self._sha256(digest)
            descriptor = self._evidence_descriptor(run_id, 'full-page', digest)
        # Clean the name first, then cut it so the whole «-<runId>.<ext>» always fits in 120 characters.
        suffix = f'-{run_id}.{extension}'
        name = re.sub(r'[\\/]', '_', name.strip()) if isinstance(name, str) else ''
        stem = os.path.splitext(_safe_filename(name, extension))[0] if name else ''
        stem = stem[:120 - len(suffix)].rstrip('. ')
        suggested = stem + suffix if stem else _safe_filename(run_id, extension)
        selected = _choose_save_path(suggested, _downloads_folder())
        if selected is None:
            return {'ok': True, 'data': {'format': 'metric-shot-save-v1', 'runId': run_id,
                                         'saved': False, 'cancelled': True, 'fileName': suggested}}
        destination = Path(selected)
        if descriptor is not None:
            self._stream_export(run_id, digest, descriptor['byteSize'], destination, evidence_kind='full-page')
        elif remote is not None:
            fresh = self._metric_shot_online(run_id)       # a new 15-minute link: the dialog may have stayed open
            if fresh is None or fresh['state'] != 'AVAILABLE':
                raise _BridgeFailure('SAVE_FAILED')
            self._download_metric_shot(fresh['url'], fresh['byteSize'], destination)
        else:
            self._copy_local_file(local, destination)
        return {'ok': True, 'data': {'format': 'metric-shot-save-v1', 'runId': run_id,
                                     'saved': True, 'cancelled': False, 'fileName': destination.name}}

    @staticmethod
    def _download_metric_shot(url, byte_size, destination):
        """GET the online picture into a temp file next to ``destination``; exactly ``byte_size`` bytes."""
        import urllib.error, urllib.request
        folder = destination.parent
        if not folder.is_dir():
            raise _BridgeFailure('SAVE_FAILED')
        try:
            handle, temp_name = tempfile.mkstemp(prefix='.tdn-shopee-', suffix='.part', dir=str(folder))
        except OSError:
            raise _BridgeFailure('SAVE_FAILED') from None
        temp_path = Path(temp_name)
        try:
            written = 0
            with os.fdopen(handle, 'wb') as out, urllib.request.urlopen(url, timeout=_SHOT_PUT_SECONDS) as response:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > byte_size:
                        raise ValueError('too long')
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            if written != byte_size:
                raise ValueError('short')
            os.replace(temp_path, destination)
        except (OSError, ValueError) as failure:
            if isinstance(failure, urllib.error.HTTPError):
                failure.close()      # release the refused response's body
            try:
                temp_path.unlink()
            except OSError:
                pass
            raise _BridgeFailure('SAVE_FAILED') from None

    @staticmethod
    def _copy_local_file(source, destination):
        folder = destination.parent
        if not folder.is_dir():
            raise _BridgeFailure('SAVE_FAILED')
        try:
            handle, temp_name = tempfile.mkstemp(prefix='.tdn-shopee-', suffix='.part', dir=str(folder))
        except OSError:
            raise _BridgeFailure('SAVE_FAILED') from None
        temp_path = Path(temp_name)
        try:
            with os.fdopen(handle, 'wb') as out, open(source, 'rb') as data:
                shutil.copyfileobj(data, out)
                out.flush()
                os.fsync(out.fileno())
            os.replace(temp_path, destination)
        except OSError:
            try:
                temp_path.unlink()
            except OSError:
                pass
            raise _BridgeFailure('SAVE_FAILED') from None

    # ---- «Xóa lượt» (`delete-run --run <id>`, not detached) ----

    def deleteRun(self, runId=None):
        return self._safe(lambda: self._delete_run(runId))

    def _delete_run(self, run_id):
        run_id = self._run_id(run_id)
        result = self._remote('deleteRun', run_id=run_id)
        if not result['ok']:
            return result
        data = result['data']
        # `leftover: true`: the run is deleted, only its hidden folder is left for the next sweep (F644 §2).
        base = {key: value for key, value in data.items() if key != 'leftover'} if isinstance(data, dict) else data
        if (base != {'format': 'run-delete-v1', 'runId': run_id, 'deleted': True} or
                ('leftover' in data and data['leftover'] is not True)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        self._forget_copy(run_id)
        # The run is gone on the server (its online picture too, best effort there): its picture on this PC
        # goes too (its path is checked for links/junctions first).
        for _ in tdn_metric_browser.SHOT_EXTENSIONS:
            local = self._local_metric_shot(run_id)
            if local is None:
                break
            try:
                local.unlink()
            except OSError:
                break
        return {'ok': True, 'data': dict(data, localShotDeleted=self._local_metric_shot(run_id) is None)}

    def newRun(self, input=None):
        return self._safe(lambda: self._new_run(input))

    @staticmethod
    def _metric_end_date(value):
        if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
            raise _BridgeFailure('ARG_INVALID')
        try:
            dt.date.fromisoformat(value)
        except ValueError:
            raise _BridgeFailure('ARG_INVALID') from None
        return value

    def _metric_date_availability(self, end_date, config=None):
        end_date = self._metric_end_date(end_date)
        result = self._remote('metricDateAvailability', payload=end_date, config=config)
        if not result['ok']:
            return result
        data = result['data']
        if (set(data) != {'format', 'requestedEndDate', 'lastSelectableDate', 'available', 'errorCode'} or
                data['format'] != 'metric-date-availability-v1' or data['requestedEndDate'] != end_date or
                type(data['available']) is not bool):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        try:
            last = self._metric_end_date(data['lastSelectableDate'])
        except _BridgeFailure:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID') from None
        if (last > end_date or data['available'] != (last == end_date) or
                data['errorCode'] != (None if data['available'] else 'CAPTURE_PERIOD_NOT_SELECTABLE')):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def _new_run(self, value):
        if not isinstance(value, dict) or not isinstance(value.get('presetId'), str) or \
                not isinstance(value.get('endDate'), str):
            raise _BridgeFailure('ARG_INVALID')
        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value['endDate']):
            raise _BridgeFailure('ARG_INVALID')
        try:
            end_date = dt.date.fromisoformat(value['endDate'])
        except ValueError:
            raise _BridgeFailure('ARG_INVALID') from None
        # The form and bridge share the desktop host's local calendar day.
        # Historical requests and remote gate rules are not rewritten here.
        if end_date >= dt.date.today():
            raise _BridgeFailure('END_DATE_NOT_COMPLETED')
        has_policy = 'collectionPolicy' in value
        has_cap = 'reviewCapPerLink' in value
        allowed = {'presetId', 'endDate'}
        if 'startDate' in value or 'metricOptions' in value:
            start = value.get('startDate')
            if not isinstance(start, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', start):
                raise _BridgeFailure('ARG_INVALID')
            try:
                if dt.date.fromisoformat(start) > end_date:
                    raise _BridgeFailure('ARG_INVALID')
            except ValueError:
                raise _BridgeFailure('ARG_INVALID') from None
            self._validate_metric_options(value.get('metricOptions'))
            allowed.update(('startDate', 'metricOptions'))
        if has_policy and has_cap:
            raise _BridgeFailure('ARG_INVALID')
        if has_policy:
            allowed.add('collectionPolicy')
            self._validate_collection_policy(value['collectionPolicy'])
        elif has_cap:
            allowed.add('reviewCapPerLink')
            cap = value['reviewCapPerLink']
            if type(cap) is not int or cap < 1 or cap > 300:
                raise _BridgeFailure('ARG_INVALID')
        else:
            raise _BridgeFailure('ARG_INVALID')
        if set(value) != allowed:
            raise _BridgeFailure('ARG_INVALID')
        config = _load_config()
        if 'startDate' in value:
            availability = self._metric_date_availability(value['endDate'], config=config)
            if not availability['ok']:
                return availability
            if not availability['data']['available']:
                return {'ok': False, 'error': {'code': 'CAPTURE_PERIOD_NOT_SELECTABLE',
                        'message': 'CAPTURE_PERIOD_NOT_SELECTABLE', 'detail': availability['data']}}
        created = self._remote('new', payload=value, config=config)
        if not created['ok']:
            return created
        data = created['data']
        if data.get('format') != 'new-run-v1':
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        run_id = data.get('runId')
        if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        def created_without_entry(code):
            code = code if isinstance(code, str) and _STATIC_ERROR.fullmatch(code) else 'REMOTE_OUTPUT_INVALID'
            return {'ok': True, 'data': {'runId': run_id, 'entry': None,
                                         'entryError': {'code': code, 'message': code}}}

        try:
            entry = self._remote('entry', run_id=run_id, config=config)
        except _BridgeFailure as error:
            return created_without_entry(error.code)
        if entry['ok'] and entry['data'].get('format') == 'handoff-v1':
            return {'ok': True, 'data': {'runId': run_id, 'entry': entry['data']}}
        if entry['ok']:
            return created_without_entry('REMOTE_OUTPUT_INVALID')
        return created_without_entry(entry.get('error', {}).get('code'))

    @staticmethod
    def _validate_metric_options(options):
        # Early transport validation; the CLI validates the canonical saved-spec schema.
        fields = {'smartQuery', 'usefulFilters', 'shopTypes', 'categoryIds',
                  'aiNormalisation', 'customizeCategory', 'smartExclusion'}
        if not isinstance(options, dict) or set(options) != fields:
            raise _BridgeFailure('ARG_INVALID')
        if any(type(options[k]) is not bool for k in ('smartQuery', 'aiNormalisation', 'customizeCategory', 'smartExclusion')):
            raise _BridgeFailure('ARG_INVALID')
        filters = options['usefulFilters']
        if not isinstance(filters, dict) or set(filters) != {'fake', 'gifts', 'deleted'} or any(type(v) is not bool for v in filters.values()):
            raise _BridgeFailure('ARG_INVALID')
        for key, allowed in [('shopTypes', {'mall', 'regular'}),
                             ('categoryIds', {'c407923064', 'c1221630203', 'c1110582659', 'c2140822537'})]:
            values = options[key]
            if (not isinstance(values, list) or not values or any(not isinstance(v, str) or v not in allowed for v in values) or
                    len(set(values)) != len(values)):
                raise _BridgeFailure('ARG_INVALID')

    @staticmethod
    def _validate_collection_policy(policy):
        # Pages mode limits Shopee review pages per link; it has no comment count and no equal-stars split.
        pages = isinstance(policy, dict) and policy.get('limitBy') == 'pages'
        fields = {'mode', 'stars', 'limitBy', 'pagesPerLink', 'allocation'} if pages else {'mode', 'stars', 'totalPerLink', 'allocation'}
        if not isinstance(policy, dict) or set(policy) != fields:
            raise _BridgeFailure('ARG_INVALID')
        if (policy['mode'] not in ('all', 'with-comments', 'stars') or
                policy['allocation'] not in (('pooled',) if pages else ('pooled', 'equal-stars'))):
            raise _BridgeFailure('ARG_INVALID')
        total = policy['pagesPerLink'] if pages else policy['totalPerLink']
        if type(total) is not int or total < 1 or total > (100 if pages else 2000):
            raise _BridgeFailure('ARG_INVALID')
        stars = policy['stars']
        if not isinstance(stars, list) or any(type(star) is not int or star < 1 or star > 5 for star in stars):
            raise _BridgeFailure('ARG_INVALID')
        if stars != sorted(set(stars)):
            raise _BridgeFailure('ARG_INVALID')
        if policy['mode'] == 'stars':
            if not stars:
                raise _BridgeFailure('ARG_INVALID')
        elif stars:
            raise _BridgeFailure('ARG_INVALID')
        if policy['allocation'] == 'equal-stars' and policy['mode'] != 'stars':
            raise _BridgeFailure('ARG_INVALID')

    def addProduct(self, input=None):
        return self._safe(lambda: self._add_product(input))

    def _add_product(self, value):
        fields = {'presetId', 'label', 'keyword', 'keyword2', 'categoryId', 'principalTitles'}
        if not isinstance(value, dict) or set(value) - fields:
            raise _BridgeFailure('ARG_INVALID')
        for key in ('presetId', 'label', 'keyword', 'categoryId'):
            if not isinstance(value.get(key), str) or not value[key].strip():
                raise _BridgeFailure('ARG_INVALID')
        if 'keyword2' in value:
            if not isinstance(value['keyword2'], str) or not value['keyword2'].strip():
                raise _BridgeFailure('ARG_INVALID')
        if 'principalTitles' in value:
            titles = value['principalTitles']
            if (not isinstance(titles, list) or
                    not all(isinstance(title, str) and title.strip() for title in titles)):
                raise _BridgeFailure('ARG_INVALID')
        created = self._remote('addProduct', payload=value)
        if not created['ok']:
            return created
        data = created['data']
        if (data.get('format') != 'add-product-v1' or
                not isinstance(data.get('presetId'), str) or not isinstance(data.get('label'), str)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': data}

    def status(self, runId=None):
        return self._safe(lambda: self._remote('status', run_id=runId))

    def runFlow(self, runId=None):
        return self._safe(lambda: self._remote('flow', run_id=runId))

    def runModule(self, runId=None, module=None, planSha256=None):
        return self._safe(lambda: self._run_module(runId, module, planSha256))

    def _run_module(self, run_id, module, plan_sha256):
        if not isinstance(module, str) or module not in ('m1', 'm2', 'm3'):
            raise _BridgeFailure('ARG_INVALID')
        if plan_sha256 is None:
            return self._remote(module, run_id=run_id)
        if module != 'm3':
            raise _BridgeFailure('ARG_INVALID')
        plan_sha256 = self._plan_sha(plan_sha256)
        result = self._remote('m3', run_id=run_id, plan_sha256=plan_sha256)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-attempt-start-v1' or data.get('runId') != run_id or
                data.get('planSha256') != plan_sha256 or not isinstance(data.get('attemptId'), str) or
                data.get('status') != 'RUNNING' or type(data.get('pid')) is not int):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def reviewSampling(self, runId=None):
        return self._safe(lambda: self._review_sampling(runId))

    def _review_sampling(self, run_id):
        return self._check_review_sampling(run_id, self._remote('reviewSampling', run_id=run_id))

    @staticmethod
    def _check_review_sampling(run_id, result):
        if not result['ok']:
            return result
        if result['data'].get('format') != 'review-sampling-view-v1':
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def refreshReviewCounts(self, runId=None):
        return self._safe(lambda: self._refresh_review_counts(runId))

    def _refresh_review_counts(self, run_id):
        result = self._remote('refreshReviewCounts', run_id=run_id)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-counts-start-v1' or data.get('runId') != run_id or
                not isinstance(data.get('attemptId'), str) or data.get('status') != 'RUNNING' or
                type(data.get('pid')) is not int):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def saveReviewPlan(self, runId=None, input=None):
        return self._safe(lambda: self._save_review_plan(runId, input))

    def _save_review_plan(self, run_id, value):
        payload = self._review_plan_input(value)
        result = self._remote('saveReviewPlan', run_id=run_id, payload=payload)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-plan-saved-v1' or data.get('runId') != run_id or
                not isinstance(data.get('planSha256'), str) or not _PLAN_SHA.fullmatch(data['planSha256']) or
                not isinstance(data.get('plan'), dict)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def stopReviewAttempt(self, runId=None, kind=None, attemptId=None):
        return self._safe(lambda: self._review_control('stopReviewAttempt', runId, kind, attemptId))

    def reconcileReviewAttempt(self, runId=None, kind=None, attemptId=None):
        return self._safe(lambda: self._review_control('reconcileReviewAttempt', runId, kind, attemptId))

    def _review_control(self, action, run_id, kind, attempt_id):
        if kind not in ('counts', 'custom'):
            raise _BridgeFailure('ARG_INVALID')
        if not isinstance(attempt_id, str) or not _RUN_ID.fullmatch(attempt_id):
            raise _BridgeFailure('ARG_INVALID')
        result = self._remote(action, run_id=run_id, kind=kind, attempt_id=attempt_id)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-attempt-control-v1' or data.get('runId') != run_id or
                data.get('kind') != kind or data.get('attemptId') != attempt_id or
                data.get('status') not in ('STOP_REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNCERTAIN') or
                (data.get('pid') is not None and type(data.get('pid')) is not int) or
                (data.get('errorCode') is not None and not isinstance(data.get('errorCode'), str))):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def _plan_sha(self, value):
        if not isinstance(value, str) or not _PLAN_SHA.fullmatch(value):
            raise _BridgeFailure('ARG_INVALID')
        return value

    def _review_plan_input(self, value):
        keys = {'mode', 'stars', 'totalPerLink', 'allocation'}
        if not isinstance(value, dict) or set(value) != keys:
            raise _BridgeFailure('ARG_INVALID')
        mode, stars, total, allocation = value['mode'], value['stars'], value['totalPerLink'], value['allocation']
        if not isinstance(mode, str) or mode not in ('all', 'with-comments', 'stars'):
            raise _BridgeFailure('ARG_INVALID')
        if not isinstance(allocation, str) or allocation not in ('pooled', 'equal-stars'):
            raise _BridgeFailure('ARG_INVALID')
        if type(total) is not int or not 1 <= total <= 2000:
            raise _BridgeFailure('ARG_INVALID')
        if not isinstance(stars, list) or any(type(star) is not int or not 1 <= star <= 5 for star in stars):
            raise _BridgeFailure('ARG_INVALID')
        if len(set(stars)) != len(stars):
            raise _BridgeFailure('ARG_INVALID')
        if mode == 'stars' and not stars:
            raise _BridgeFailure('ARG_INVALID')
        if mode != 'stars' and stars:
            raise _BridgeFailure('ARG_INVALID')
        if allocation == 'equal-stars' and mode != 'stars':
            raise _BridgeFailure('ARG_INVALID')
        return {'mode': mode, 'stars': sorted(stars), 'totalPerLink': total, 'allocation': allocation}

    def reviewData(self, runId=None):
        return self._safe(lambda: self._review_data(runId))

    def _review_data(self, run_id):
        return self._check_review_data(run_id, self._remote('reviewData', run_id=run_id))

    @staticmethod
    def _check_review_data(run_id, result):
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-data-view-v1' or data.get('runId') != run_id or
                type(data.get('readonly')) is not bool or not isinstance(data.get('tracking'), dict) or
                not isinstance(data.get('db'), dict) or not isinstance(data.get('sources'), list)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def reviewStats(self, runId=None):
        return self._safe(lambda: self._review_stats(runId))

    def _review_stats(self, run_id):
        return self._check_review_stats(run_id, self._remote('reviewStats', run_id=run_id))

    def _check_review_stats(self, run_id, result):
        if not result['ok']:
            # Numbers only: never forward server error text or detail, just a static code.
            code = result.get('error', {}).get('code')
            raise _BridgeFailure(code if isinstance(code, str) and _STATIC_ERROR.fullmatch(code) else 'REMOTE_OUTPUT_INVALID')
        data = result['data']
        if (set(data) != {'format', 'runId', 'sources'} or data['format'] != 'review-stats-v1' or
                data['runId'] != run_id or not isinstance(data['sources'], list) or
                not all(self._review_stats_source(source) for source in data['sources'])):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    @staticmethod
    def _review_stats_numbers(value, extra=()):
        """Closed review-stats-v1 numbers: any key outside the contract (comment text, user) fails."""
        keys = {'commentCount', 'averageStar', 'starCounts', 'firstCommentAt', 'lastCommentAt'}
        if not isinstance(value, dict) or set(value) != keys | set(extra):
            return False
        average, stars = value['averageStar'], value['starCounts']
        return (type(value['commentCount']) is int and value['commentCount'] >= 0 and
                (average is None or (type(average) in (int, float) and 1 <= average <= 5)) and
                isinstance(stars, dict) and set(stars) == {'1', '2', '3', '4', '5'} and
                all(type(count) is int and count >= 0 for count in stars.values()) and
                all(value[key] is None or isinstance(value[key], str) for key in ('firstCommentAt', 'lastCommentAt')))

    def _review_stats_source(self, source):
        if not isinstance(source, dict) or set(source) != {'sourceSha256', 'kind', 'status', 'completedAt', 'all', 'links'}:
            return False
        links = source['links']
        return (isinstance(source['sourceSha256'], str) and _PLAN_SHA.fullmatch(source['sourceSha256']) is not None and
                source['kind'] in ('legacy', 'custom') and source['status'] in ('SUCCEEDED', 'FAILED') and
                (source['completedAt'] is None or isinstance(source['completedAt'], str)) and
                self._review_stats_numbers(source['all']) and isinstance(links, list) and len(links) <= _MAX_RUN_LINKS and
                all(self._review_stats_numbers(link, ('shopId', 'itemId', 'url')) and
                    all(isinstance(link[key], str) and _SHOP_ITEM_ID.fullmatch(link[key]) for key in ('shopId', 'itemId')) and
                    isinstance(link['url'], str) and len(link['url']) <= 2000 and
                    _SHOPEE_LINK.fullmatch(link['url']) is not None
                    for link in links) and
                len({(link['shopId'], link['itemId']) for link in links}) == len(links) and
                len({link['url'] for link in links}) == len(links))

    def reviewInsights(self, runId=None):
        return self._safe(lambda: self._review_insights(runId))

    def _review_insights(self, run_id):
        """Read the Jev themes, AI summary and bounded comment examples for one run.

        This is deliberately a separate contract from review-stats-v1: the stats
        reader is numbers-only, while this surface is the explicit, user-facing
        drilldown that is allowed to carry review text and tag evidence.
        """
        return self._check_review_insights(run_id, self._remote('reviewInsights', run_id=run_id))

    @staticmethod
    def _review_insights_summary(value):
        if not isinstance(value, dict) or set(value) != {'status', 'text', 'model', 'generatedAt'}:
            return False
        return (value['status'] in ('READY', 'EMPTY', 'UNAVAILABLE') and
                (value['text'] is None or (isinstance(value['text'], str) and len(value['text']) <= 4000)) and
                (value['model'] is None or (isinstance(value['model'], str) and len(value['model']) <= 200)) and
                (value['generatedAt'] is None or (isinstance(value['generatedAt'], str) and len(value['generatedAt']) <= 128)))

    @staticmethod
    def _review_insights_comment_tag(value):
        if not isinstance(value, dict) or set(value) != {'code', 'name', 'polarity', 'status', 'choice'}:
            return False
        return (isinstance(value['code'], str) and re.fullmatch(r'T-[A-Z0-9]+', value['code']) is not None and
                isinstance(value['name'], str) and bool(value['name']) and
                value['polarity'] in ('khen', 'che', 'ke', 'khong_ro_huong') and
                value['status'] in ('kept', 'unclear') and
                (value['choice'] is None or isinstance(value['choice'], str)))

    @classmethod
    def _review_insights_comment(cls, value):
        if not isinstance(value, dict) or set(value) != {'id', 'text', 'rating', 'date', 'productName', 'url', 'tags'}:
            return False
        return (isinstance(value['id'], str) and bool(value['id']) and len(value['id']) <= 256 and
                isinstance(value['text'], str) and len(value['text']) <= 4000 and
                (value['rating'] is None or (type(value['rating']) is int and 1 <= value['rating'] <= 5)) and
                (value['date'] is None or isinstance(value['date'], str)) and
                (value['productName'] is None or isinstance(value['productName'], str)) and
                (value['url'] is None or (_SHOPEE_LINK.fullmatch(value['url']) is not None and len(value['url']) <= 2000)) and
                isinstance(value['tags'], list) and len(value['tags']) <= 10 and
                all(cls._review_insights_comment_tag(tag) for tag in value['tags']))

    @classmethod
    def _review_insights_bucket(cls, value, summary=False):
        """v1 holds the comment lists; the v2 summary holds `key` and a `commentCount` in place of each list."""
        if summary:
            if (not isinstance(value, dict) or set(value) != {'key', 'summary', 'themes', 'commentCount'} or
                    not isinstance(value['key'], str) or _INSIGHT_ID.fullmatch(value['key']) is None or
                    type(value['commentCount']) is not int or not 0 <= value['commentCount'] <= 200):
                return False
            themes = value['themes']
            comments = None
            list_key = 'commentCount'
        else:
            if not isinstance(value, dict) or set(value) != {'summary', 'themes', 'comments'}:
                return False
            themes = value['themes']
            comments = value['comments']
            list_key = 'comments'
            if not isinstance(comments, list) or len(comments) > 200:
                return False
        if not isinstance(themes, list) or len(themes) > 10:
            return False
        for theme in themes:
            if (not isinstance(theme, dict) or
                    set(theme) != {'code', 'name', 'count', 'unclearCount', 'share', 'polarityCounts', 'summary', list_key}):
                return False
            if summary:
                if type(theme['commentCount']) is not int or not 0 <= theme['commentCount'] <= value['commentCount']:
                    return False
                theme = dict(theme, comments=[])
            polarity = theme['polarityCounts']
            if (not isinstance(theme['code'], str) or re.fullmatch(r'T-[A-Z0-9]+', theme['code']) is None or
                    not isinstance(theme['name'], str) or not theme['name'] or
                    type(theme['count']) is not int or theme['count'] < 0 or
                    type(theme['unclearCount']) is not int or theme['unclearCount'] < 0 or
                    not (isinstance(theme['share'], (int, float)) and 0 <= theme['share'] <= 1) or
                    not cls._review_insights_summary(theme['summary']) or
                    not isinstance(polarity, dict) or set(polarity) != {'khen', 'che', 'ke', 'khong_ro_huong'} or
                    any(type(count) is not int or count < 0 for count in polarity.values()) or
                    not isinstance(theme['comments'], list) or
                    (comments is not None and len(theme['comments']) > len(comments)) or
                    not all(cls._review_insights_comment(comment) for comment in theme['comments'])):
                return False
        return cls._review_insights_summary(value['summary']) and all(cls._review_insights_comment(comment) for comment in comments or [])

    @classmethod
    def _review_insights_source(cls, source, summary=False):
        if not isinstance(source, dict) or set(source) != {'sourceSha256', 'kind', 'status', 'completedAt', 'all', 'links'}:
            return False
        links = source['links']
        return (isinstance(source['sourceSha256'], str) and _PLAN_SHA.fullmatch(source['sourceSha256']) is not None and
                source['kind'] in ('legacy', 'custom') and source['status'] in ('SUCCEEDED', 'FAILED') and
                (source['completedAt'] is None or isinstance(source['completedAt'], str)) and
                cls._review_insights_bucket(source['all'], summary) and isinstance(links, list) and len(links) <= _MAX_RUN_LINKS and
                all(isinstance(link, dict) and set(link) == {'shopId', 'itemId', 'url', 'insights'} and
                    isinstance(link['shopId'], str) and _SHOP_ITEM_ID.fullmatch(link['shopId']) is not None and
                    isinstance(link['itemId'], str) and _SHOP_ITEM_ID.fullmatch(link['itemId']) is not None and
                    isinstance(link['url'], str) and _SHOPEE_LINK.fullmatch(link['url']) is not None and
                    cls._review_insights_bucket(link['insights'], summary) for link in links) and
                len({(link['shopId'], link['itemId']) for link in links}) == len(links) and
                len({link['url'] for link in links}) == len(links))

    def reviewInsightsSummary(self, runId=None):
        return self._safe(lambda: self._review_insights_summary_view(runId))

    def _review_insights_summary_view(self, run_id):
        result = self._remote('reviewInsightsSummary', run_id=run_id, flags=('--summary',))
        return self._check_review_insights(run_id, result, summary=True)

    def _check_review_insights(self, run_id, result, summary=False):
        if not result['ok']:
            code = result.get('error', {}).get('code')
            raise _BridgeFailure(code if isinstance(code, str) and _STATIC_ERROR.fullmatch(code) else 'REMOTE_OUTPUT_INVALID')
        data = result['data']
        if (set(data) != {'format', 'runId', 'codebookVersion', 'sources'} or
                data.get('format') != ('review-insights-v2' if summary else 'review-insights-v1') or
                data.get('runId') != run_id or
                not isinstance(data.get('codebookVersion'), str) or not data['codebookVersion'] or
                not isinstance(data.get('sources'), list) or
                not all(self._review_insights_source(source, summary) for source in data['sources'])):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def reviewInsightComments(self, runId=None, bucket=None, theme=None):
        return self._safe(lambda: self._review_insight_comments(runId, bucket, theme))

    def _review_insight_comments(self, run_id, bucket, theme):
        if not isinstance(bucket, str) or _INSIGHT_ID.fullmatch(bucket) is None:
            raise _BridgeFailure('ARG_INVALID')
        if theme is not None and (not isinstance(theme, str) or _INSIGHT_ID.fullmatch(theme) is None):
            raise _BridgeFailure('ARG_INVALID')
        flags = ('--bucket', bucket) + (('--theme', theme) if theme is not None else ())
        result = self._remote('reviewInsightComments', run_id=run_id, flags=flags)
        if not result['ok']:
            code = result.get('error', {}).get('code')
            raise _BridgeFailure(code if isinstance(code, str) and _STATIC_ERROR.fullmatch(code) else 'REMOTE_OUTPUT_INVALID')
        data = result['data']
        if (set(data) != {'format', 'bucket', 'theme', 'comments'} or data['format'] != 'review-insight-comments-v1' or
                data['bucket'] != bucket or data['theme'] != theme or not isinstance(data['comments'], list) or
                len(data['comments']) > 200 or
                not all(self._review_insights_comment(comment) for comment in data['comments'])):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def runView(self, runId=None, result=False, join=False):
        return self._safe(lambda: self._run_view(runId, result, join))

    def _run_view(self, run_id, with_result, join=False):
        run_id = self._run_id(run_id)
        if type(with_result) is not bool or type(join) is not bool:
            raise _BridgeFailure('ARG_INVALID')
        if with_result:
            with self._prefetch:
                self._prefetch_queue = [row for row in self._prefetch_queue if row['runId'] != run_id]
                # Only the first read of a row open (`join`) may take the prefetch read of that run, and only
                # when no write/start/save/delete was sent since it started. Every other read is its own call.
                current = self._prefetch_current
                joined = current if (join and current and current['runId'] == run_id and
                                     current['mutations'] == self._mutations) else None
            if joined is not None:
                joined['done'].wait()
                with self._prefetch:          # a write begun or ended during the wait: that read is older
                    fresh = joined['mutations'] == self._mutations
                if fresh and joined['reply'] is not None and joined['reply']['ok']:
                    return joined['reply']
        return self._read_run_view(run_id, with_result)

    def _run_view_checks(self, run_id):
        return {
            'info': lambda single: single,
            'sampling': lambda single: self._check_review_sampling(run_id, single),
            'reviewData': lambda single: self._check_review_data(run_id, single),
            'outputs': lambda single: single,
            'process': lambda single: self._check_review_process(run_id, single),
            'stats': lambda single: self._check_review_stats(run_id, single),
            'insights': lambda single: self._check_review_insights(run_id, single, summary=True),
        }

    def _read_run_view(self, run_id, with_result):
        """One call for a run open: each part goes through the same check as its single call, and a part in
        `errors` comes back as that call's error. The page gets {part: single-call reply}. A --result answer of a
        settled run is kept as the disk copy; RUN_NOT_FOUND removes it."""
        config = _load_config()            # one config for the call and for its copy's server key
        key = _server_key(config)
        with self._prefetch:
            generation = self._reserve_read(run_id)
        try:
            return self._read_run_view_now(run_id, with_result, generation, config, key)
        finally:
            self._end_read(run_id)

    def _reserve_read(self, run_id):
        """Under self._prefetch: the read is out (a newest list without the run moves its generation)."""
        self._reads_out[run_id] = self._reads_out.get(run_id, 0) + 1
        return self._copy_generation.get(run_id, 0)

    def _end_read(self, run_id):
        with self._prefetch:
            self._reads_out[run_id] -= 1
            if not self._reads_out[run_id]:
                del self._reads_out[run_id]

    def _read_run_view_now(self, run_id, with_result, generation, config, key):
        reply = self._remote('runView', run_id=run_id, config=config, flags=('--result',) if with_result else ())
        if not reply['ok']:
            if reply['error'].get('code') == 'RUN_NOT_FOUND':
                self._forget_copy(run_id)
            if reply['error'].get('code') == 'USAGE':
                self._copies_off = True       # the server cannot refresh a copy: none is given again
            return reply                  # the info error is the command error (RUN_NOT_FOUND, USAGE, …)
        data = reply['data']
        names = _RUN_VIEW_PARTS + (_RUN_VIEW_RESULT_PARTS if with_result else ())
        parts, errors = data.get('parts'), data.get('errors')
        if (set(data) != {'format', 'runId', 'parts', 'errors'} or data['format'] != 'run-view-v1' or
                data['runId'] != run_id or not isinstance(parts, dict) or not isinstance(errors, dict) or
                not set(parts) | set(errors) <= set(names) or set(parts) & set(errors) or 'info' not in parts or
                not all(isinstance(part, dict) for part in parts.values())):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        checks = self._run_view_checks(run_id)
        out = {}
        for name in names:
            if name in parts:
                single = {'ok': True, 'data': parts[name]}
            elif name in errors:
                error = errors[name]
                if (not isinstance(error, dict) or not isinstance(error.get('code'), str) or
                        not isinstance(error.get('message'), str)):
                    raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
                single = _error(error['code'], error['message'])
            else:
                raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
            out[name] = self._safe(lambda check=checks[name], single=single: check(single))
        view = {'format': 'run-view-v1', 'runId': run_id, 'parts': out}
        if with_result:
            self._save_copy(run_id, view, generation, key)
        return {'ok': True, 'data': view}

    # ---- The disk copy ----

    def _copy_path(self, run_id, key=None):
        key = _server_key(_load_config()) if key is None else key
        return _run_view_copy_root() / key / (run_id + '.json')

    def _checked_copy(self, run_id, view):
        """The view's parts after the same checks as a fresh read, or None (a part missing or failing)."""
        if (not isinstance(view, dict) or view.get('format') != 'run-view-v1' or view.get('runId') != run_id or
                not isinstance(view.get('parts'), dict)):
            return None
        checks = self._run_view_checks(run_id)
        out = {}
        for name in _RUN_VIEW_PARTS + _RUN_VIEW_RESULT_PARTS:
            part = view['parts'].get(name)
            if not isinstance(part, dict) or part.get('ok') is not True or 'data' not in part:
                return None
            checked = self._safe(lambda check=checks[name], data=part['data']: check({'ok': True, 'data': data}))
            if not checked['ok']:
                return None
            out[name] = checked
        info, outputs = out['info']['data'], out['outputs']['data']
        if (not isinstance(info, dict) or info.get('runId') != run_id or not isinstance(info.get('modules'), list) or
                not isinstance(outputs, dict) or outputs.get('format') != 'module-outputs-v1' or
                outputs.get('runId') != run_id):
            return None
        return out

    def _save_copy(self, run_id, view, generation, key):
        """Best effort: keep the checked --result answer of a settled run (all parts ok, nothing RUNNING or
        UNCERTAIN) under the server key of the config its read used (`key`). Temp file + os.replace; a failed
        write only means no copy."""
        parts = self._checked_copy(run_id, view)
        if parts is None:
            return
        info = parts['info']['data']
        state = info.get('state') if isinstance(info.get('state'), dict) else {}
        sig = _copy_sig(info)
        if sig is None or info['execution']['status'] in ('RUNNING', 'UNCERTAIN') or \
                state.get('status') in ('RUNNING', 'UNCERTAIN'):
            return
        record = {'format': RUN_VIEW_COPY_FORMAT, 'appVersion': _app_version(), 'savedAt': time.time(), 'sig': sig,
                  'view': {'format': 'run-view-v1', 'runId': run_id, 'parts': parts}}
        temp = None
        try:
            path = self._copy_path(run_id, key)
            with _RUN_VIEW_COPY_LOCK:
                path.parent.mkdir(parents=True, exist_ok=True)
                handle, temp = tempfile.mkstemp(prefix='.copy-', suffix='.part', dir=str(path.parent))
                with os.fdopen(handle, 'w', encoding='utf-8') as out:
                    out.write(json.dumps(record, ensure_ascii=False, separators=(',', ':')))
                if _server_key(_load_config()) != key:
                    return                     # the config moved to another server during the read
                with self._prefetch:
                    if self._copy_generation.get(run_id, 0) != generation:
                        return                 # removed (deleted, gone, unlisted) since this read started
                    os.replace(temp, path)
                temp = None
            self._trim_copies()
        except (OSError, _BridgeFailure, ValueError):
            pass
        finally:
            if temp is not None:
                try:
                    os.unlink(temp)
                except OSError:
                    pass

    def _read_copy(self, run_id):
        """The saved record, or None. A file of another app version or that fails a check is removed."""
        try:
            path = self._copy_path(run_id)
            with _RUN_VIEW_COPY_LOCK:
                try:
                    record = json.loads(path.read_text(encoding='utf-8'))
                except FileNotFoundError:
                    return None
                except ValueError:
                    record = None
                parts = None
                if (isinstance(record, dict) and record.get('format') == RUN_VIEW_COPY_FORMAT and
                        record.get('appVersion') == _app_version() and isinstance(record.get('sig'), str)):
                    parts = self._checked_copy(run_id, record.get('view'))
                if parts is None:
                    path.unlink()
                    return None
            return {'sig': record['sig'], 'savedAt': record.get('savedAt'),
                    'view': {'format': 'run-view-v1', 'runId': run_id, 'parts': parts}}
        except (OSError, _BridgeFailure):
            return None

    def _forget_copy(self, run_id):
        """The run is gone: its copy goes, and a read of it still out saves nothing."""
        with self._prefetch:
            self._copy_generation[run_id] = self._copy_generation.get(run_id, 0) + 1
        self._drop_copies(lambda gone: gone == run_id)

    def _drop_copies(self, match):
        """Remove this server's copies whose runId matches (best effort); each removal moves the run's generation."""
        try:
            folder = self._copy_path('x').parent
            with _RUN_VIEW_COPY_LOCK:
                for path in folder.glob('*.json') if folder.is_dir() else []:
                    if match(path.stem):
                        with self._prefetch:
                            self._copy_generation[path.stem] = self._copy_generation.get(path.stem, 0) + 1
                        try:
                            path.unlink()
                        except OSError:
                            pass
        except (OSError, _BridgeFailure):
            pass

    def _trim_copies(self):
        """Above 300 files or 50 MB (all servers together), the oldest copies go first."""
        with _RUN_VIEW_COPY_LOCK:
            files = []
            for path in _run_view_copy_root().glob('*/*.json'):
                try:
                    info = path.stat()
                except OSError:
                    continue
                files.append((info.st_mtime_ns, info.st_size, path))
            files.sort()
            total = sum(size for _, size, _ in files)
            while files and (len(files) > RUN_VIEW_COPY_MAX_FILES or total > RUN_VIEW_COPY_MAX_BYTES):
                _, size, path = files.pop(0)
                total -= size
                try:
                    path.unlink()
                except OSError:
                    pass

    def runViewCached(self, runId=None):
        """The disk copy of a run's view for the page to show while the fresh read runs; no network call."""
        return self._safe(lambda: self._run_view_cached(runId))

    def _run_view_cached(self, run_id):
        run_id = self._run_id(run_id)
        record = None if self._copies_off else self._read_copy(run_id)
        return {'ok': True, 'data': None if record is None else record['view']}

    # ---- Prefetch: the visible settled rows, one read at a time, into the disk copy ----

    def prefetchRunViews(self, rows=None):
        """Queue the page's visible settled rows ([{runId, sig}], at most 12) and return at once."""
        return self._safe(lambda: self._prefetch_run_views(rows))

    def _prefetch_run_views(self, rows):
        """The page's newest visible queue replaces the one before; an empty list clears it."""
        if not isinstance(rows, list) or len(rows) > 12:
            raise _BridgeFailure('ARG_INVALID')
        queue = []
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get('sig'), str) or len(row['sig']) > 64 or
                    not isinstance(row.get('runId'), str)):
                raise _BridgeFailure('ARG_INVALID')
            queue.append({'runId': self._run_id(row['runId']), 'sig': row['sig']})
        with self._prefetch:
            self._prefetch_queue = queue       # the newest list decides
            if queue and not self._prefetch_running:
                self._prefetch_running = True
                threading.Thread(target=self._prefetch_worker, name='tdn-run-view-prefetch', daemon=True).start()
            self._prefetch.notify_all()
        return {'ok': True, 'data': {'format': 'run-view-prefetch-v1', 'queued': len(queue)}}

    def _prefetch_worker(self):
        while True:
            with self._prefetch:
                if not self._prefetch_queue:
                    self._prefetch_running = False
                    return
                row = self._prefetch_queue[0]
                generation = self._copy_generation.get(row['runId'], 0)
            # Read only, before the reserve step: is the copy already of this status:revision?
            saved = self._read_copy(row['runId'])
            try:
                config = _load_config()
                key = _server_key(config)
            except _BridgeFailure:
                config = key = None
            with self._prefetch:
                # The one reserve step, just before the remote call: no page call out, the row still first in
                # the newest queue, the run still listed, its copy not removed since; then the read is out.
                while self._prefetch_queue and self._user_calls > 0:
                    self._prefetch.wait(1.0)
                if not self._prefetch_queue or self._prefetch_queue[0] is not row:
                    continue                           # a newer queue: start again from its first row
                self._prefetch_queue.pop(0)
                if (config is None or (saved is not None and saved['sig'] == row['sig']) or
                        (self._listed is not None and row['runId'] not in self._listed) or
                        self._copy_generation.get(row['runId'], 0) != generation):
                    continue
                self._reserve_read(row['runId'])
                entry = {'runId': row['runId'], 'done': threading.Event(), 'reply': None, 'mutations': self._mutations}
                self._prefetch_current = entry
            try:
                entry['reply'] = self._safe(
                    lambda: self._read_run_view_now(row['runId'], True, generation, config, key))
            finally:
                self._end_read(row['runId'])
                with self._prefetch:
                    if entry['reply'] is not None and not entry['reply']['ok'] and \
                            entry['reply']['error'].get('code') == 'USAGE':
                        self._prefetch_queue = []      # an older server: no run-view, nothing to keep
                    self._prefetch_current = None
                    self._prefetch.notify_all()
                entry['done'].set()

    def saveReviewData(self, runId=None, input=None):
        return self._safe(lambda: self._save_review_data(runId, input))

    def _save_review_data(self, run_id, value):
        payload = self._review_source_input(value)
        result = self._remote('saveReviewData', run_id=run_id, payload=payload)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-data-saved-v1' or data.get('runId') != run_id or
                data.get('sourceSha256') != payload['sourceSha256'] or
                not isinstance(data.get('datasetId'), str) or not data['datasetId'] or
                data.get('importPolicyVersion') != 'module-m3-s05-v1' or
                not isinstance(data.get('importedAt'), str) or
                any(type(data.get(key)) is not int or data[key] < 0 for key in
                    ('rowCount', 'reviewsInserted', 'reviewsAlreadyPresent', 'runReviewsInserted',
                     'firstVersionDiffers')) or
                type(data.get('reused')) is not bool):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def reviewProcess(self, runId=None):
        return self._safe(lambda: self._review_process(runId))

    def _review_process(self, run_id):
        return self._check_review_process(run_id, self._remote('reviewProcess', run_id=run_id))

    def _check_review_process(self, run_id, result):
        if not result['ok']:
            # Static code only: never forward server error text or detail.
            code = result.get('error', {}).get('code')
            raise _BridgeFailure(code if isinstance(code, str) and _STATIC_ERROR.fullmatch(code) else 'REMOTE_OUTPUT_INVALID')
        data = result['data']
        if (set(data) != {'format', 'runId', 'autoRun', 'labelUnresolved', 'sources'} or
                data['format'] != 'review-process-view-v1' or data['runId'] != run_id or
                type(data['autoRun']) is not bool or type(data['labelUnresolved']) is not bool or
                not isinstance(data['sources'], list) or
                not all(self._review_process_source(source) for source in data['sources'])):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': data}

    def processReviewData(self, runId=None, sourceSha256=None):
        return self._safe(lambda: self._process_review_data(runId, sourceSha256))

    def _process_review_data(self, run_id, source_sha256):
        source_sha256 = self._sha256(source_sha256)
        data = self._step4_remote('processReviewData', run_id=run_id, source_sha256=source_sha256)
        if (set(data) != {'format', 'runId', 'sourceSha256', 'status', 'pid'} or
                data['format'] != 'review-process-start-v1' or data['runId'] != run_id or
                data['sourceSha256'] != source_sha256 or data['status'] != 'RUNNING' or
                type(data['pid']) is not int):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': data}

    def runsProgress(self):
        return self._safe(self._runs_progress)

    def _runs_progress(self):
        data = self._step4_remote('runsProgress')
        if (set(data) != {'format', 'generatedAt', 'runs'} or data['format'] != 'runs-progress-v1' or
                not self._stamp(data['generatedAt'], nullable=False) or not isinstance(data['runs'], list) or
                not all(self._progress_run(run) for run in data['runs'])):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': data}

    def _step4_remote(self, action, **kwargs):
        result = self._remote(action, **kwargs)
        if not result['ok']:
            # Static code only: never forward server error text or detail.
            code = result.get('error', {}).get('code')
            raise _BridgeFailure(code if isinstance(code, str) and _STATIC_ERROR.fullmatch(code) else 'REMOTE_OUTPUT_INVALID')
        return result['data']

    @staticmethod
    def _stamp(value, nullable=True):
        if value is None:
            return nullable
        return isinstance(value, str) and 0 < len(value) <= _STAMP_MAX

    @staticmethod
    def _count(value, nullable=True):
        if value is None:
            return nullable
        return type(value) is int and value >= 0

    @staticmethod
    def _fee(value):
        if value is None:
            return True
        keys = {'currency', 'filter', 'label', 'total', 'basis'}
        return (isinstance(value, dict) and set(value) == keys and value['currency'] == 'USD' and
                value['basis'] == 'ESTIMATE' and
                all(type(value[key]) in (int, float) and value[key] >= 0 for key in ('filter', 'label', 'total')))

    @classmethod
    def _step4_gate(cls, value, side):
        if value is None:
            return True
        allowed = _STEP4_GATE_CHECKS[side]
        if (not isinstance(value, dict) or set(value) != {'verdict', 'checks'} or
                value['verdict'] not in ('PASS', 'FAIL') or not isinstance(value['checks'], list)):
            return False
        if not all(isinstance(check, dict) and set(check) == {'id', 'ok', 'level', 'got'} and
                   check['id'] in allowed and type(check['ok']) is bool and
                   check['level'] in ('error', 'warn') and
                   isinstance(check['got'], str) and len(check['got']) <= 200
                   for check in value['checks']):
            return False
        # Contract order, each id at most once.
        order = [allowed.index(check['id']) for check in value['checks']]
        return all(a < b for a, b in zip(order, order[1:]))

    @classmethod
    def _review_process_source(cls, source):
        keys = {'sourceSha256', 'state', 'errorCode', 'startedAt', 'finishedAt', 'retries', 'canResume',
                'fee', 'stages', 'gates'}
        if not isinstance(source, dict) or set(source) != keys:
            return False
        stages, gates = source['stages'], source['gates']
        if not isinstance(stages, dict) or set(stages) != set(_STEP4_STAGE_COUNTS):
            return False
        for name, counts in _STEP4_STAGE_COUNTS.items():
            stage = stages[name]
            if (not isinstance(stage, dict) or set(stage) != {'state', 'done', *counts} or
                    stage['state'] not in _STEP4_STATES or not cls._count(stage['done'], nullable=False) or
                    not all(cls._count(stage[key]) for key in counts)):
                return False
        state = source['state']
        return (isinstance(source['sourceSha256'], str) and _PLAN_SHA.fullmatch(source['sourceSha256']) is not None and
                state in _STEP4_SOURCE_STATES and
                (source['errorCode'] in _STEP4_ERRORS if state == 'FAIL' else source['errorCode'] is None) and
                cls._stamp(source['startedAt']) and cls._stamp(source['finishedAt']) and
                cls._count(source['retries'], nullable=False) and type(source['canResume']) is bool and
                (not source['canResume'] or state in ('FAIL', 'NOT_APPLICABLE')) and
                cls._fee(source['fee']) and
                isinstance(gates, dict) and set(gates) == {'in', 'out'} and
                cls._step4_gate(gates['in'], 'in') and cls._step4_gate(gates['out'], 'out'))

    @classmethod
    def _progress_run(cls, run):
        keys = {'runId', 'steps', 'active', 'finished', 'changedAt'}
        if not isinstance(run, dict) or set(run) != keys:
            return False
        steps, active = run['steps'], run['active']
        if not isinstance(steps, list) or len(steps) != 4 or not all(step in _PROGRESS_STEP_STATES for step in steps):
            return False
        # At most one step runs; active is that step, and null only when no step runs.
        if steps.count('RUNNING') > 1 or (active is None) != ('RUNNING' not in steps):
            return False
        if active is not None:
            if not isinstance(active, dict) or set(active) != {'step', 'stage', 'done', 'total'}:
                return False
            step = active['step']
            if type(step) is not int or not 1 <= step <= 4 or steps[step - 1] != 'RUNNING':
                return False
            if (active['stage'] not in ('save', 'filter', 'label') if step == 4 else active['stage'] is not None):
                return False
            if not cls._count(active['done']) or not cls._count(active['total']):
                return False
        finished = steps[3] == 'PASS' or (steps[3] == 'NOT_APPLICABLE' and steps[:3] == ['PASS'] * 3)
        return (isinstance(run['runId'], str) and _RUN_ID.fullmatch(run['runId']) is not None and
                run['finished'] is finished and cls._stamp(run['changedAt'], nullable=False))

    def notify(self, title=None, body=None):
        return self._safe(lambda: self._notify(title, body))

    def _notify(self, title, body):
        """Show one native Windows toast; a no-op that answers ok anywhere else."""
        if not isinstance(title, str) or not isinstance(body, str):
            raise _BridgeFailure('ARG_INVALID')
        title = _NOTIFY_CONTROL.sub(' ', title).strip()[:_NOTIFY_TITLE_MAX]
        body = _NOTIFY_CONTROL.sub(' ', body).strip()[:_NOTIFY_BODY_MAX]
        if not title:
            raise _BridgeFailure('ARG_INVALID')
        if sys.platform != 'win32':
            return {'ok': True, 'data': {'shown': False}}
        root = os.environ.get('SystemRoot') or 'C:\\Windows'
        shell = os.path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        script = base64.b64encode(_TOAST_SCRIPT.encode('utf-16-le')).decode('ascii')
        env = dict(os.environ, TDN_TOAST_TITLE=title, TDN_TOAST_BODY=body)
        try:
            result = subprocess.run([shell, '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
                                     '-EncodedCommand', script],
                                    env=env, capture_output=True, timeout=20,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except (OSError, subprocess.TimeoutExpired):
            raise _BridgeFailure('NOTIFY_FAILED') from None
        if result.returncode != 0:
            raise _BridgeFailure('NOTIFY_FAILED')
        return {'ok': True, 'data': {'shown': True}}

    def exportReviewData(self, runId=None, input=None):
        return self._safe(lambda: self._export_review_data(runId, input))

    def _export_review_data(self, run_id, value):
        payload = self._review_export_input(value)
        result = self._remote('exportReviewData', run_id=run_id, payload=payload)
        if not result['ok']:
            return result
        receipt = result['data']
        self._check_export_receipt(receipt, run_id, payload)
        suggested = _safe_filename(receipt['fileName'], payload['format'])
        selected = _choose_save_path(suggested)
        if selected is None:
            return {'ok': True, 'data': {'receipt': receipt, 'fileName': suggested,
                                         'saved': False, 'cancelled': True}}
        destination = Path(selected)
        self._stream_export(run_id, receipt['exportSha256'], receipt['byteSize'], destination)
        return {'ok': True, 'data': {'receipt': receipt, 'fileName': destination.name,
                                     'saved': True, 'cancelled': False}}

    def exportReviewFiles(self, runId=None, input=None):
        return self._safe(lambda: self._export_review_files(runId, input))

    def _export_review_files(self, run_id, value):
        if (not isinstance(value, dict) or set(value) != {'sourceSha256', 'formats'} or
                not isinstance(value['formats'], list) or not value['formats'] or
                len(set(value['formats'])) != len(value['formats']) or
                any(item not in REVIEW_FILE_FORMATS for item in value['formats'])):
            raise _BridgeFailure('ARG_INVALID')
        source = self._sha256(value['sourceSha256'])
        files, prepared = {}, []
        for export_format in value['formats']:
            payload = {'sourceSha256': source, 'format': export_format}
            try:
                result = self._remote('exportReviewData', run_id=run_id, payload=payload)
                if not result['ok']:
                    raise _BridgeFailure(result['error']['code'])
                self._check_export_receipt(result['data'], run_id, payload)
            except _BridgeFailure as error:
                files[export_format] = {'format': export_format, 'saved': False, 'fileName': None,
                                        'errorCode': error.code}
                continue
            prepared.append((export_format, result['data']))
        if prepared:
            folder = _choose_save_folder()
            if folder is None:
                return {'ok': True, 'data': {'cancelled': True,
                                             'files': [files[item] for item in value['formats'] if item in files]}}
            for export_format, receipt in prepared:
                destination = Path(folder) / _safe_filename(receipt['fileName'], REVIEW_FILE_FORMATS[export_format])
                try:
                    destination = self._stream_export(run_id, receipt['exportSha256'], receipt['byteSize'],
                                                      destination, keep_existing=True)
                except _BridgeFailure as error:
                    files[export_format] = {'format': export_format, 'saved': False, 'fileName': None,
                                            'errorCode': error.code}
                    continue
                files[export_format] = {'format': export_format, 'saved': True,
                                        'fileName': destination.name, 'errorCode': None}
        return {'ok': True, 'data': {'cancelled': False,
                                     'files': [files[item] for item in value['formats']]}}

    def openShopeeLink(self, url=None):
        return self._safe(lambda: self._open_shopee_link(url))

    def _open_shopee_link(self, url):
        if not isinstance(url, str) or not _SHOPEE_LINK.fullmatch(url):
            raise _BridgeFailure('LINK_NOT_ALLOWED')
        import webbrowser
        try:
            opened = webbrowser.open(url, new=2)
        except Exception:
            opened = False
        if not opened:
            raise _BridgeFailure('LINK_OPEN_FAILED')
        return {'ok': True, 'data': {'opened': True}}

    def _review_source_input(self, value):
        if not isinstance(value, dict) or set(value) != {'sourceSha256'}:
            raise _BridgeFailure('ARG_INVALID')
        return {'sourceSha256': self._sha256(value['sourceSha256'])}

    def _review_export_input(self, value):
        if not isinstance(value, dict) or set(value) != {'sourceSha256', 'format'}:
            raise _BridgeFailure('ARG_INVALID')
        if value['format'] not in ('json', 'txt'):
            raise _BridgeFailure('ARG_INVALID')
        return {'sourceSha256': self._sha256(value['sourceSha256']), 'format': value['format']}

    def _sha256(self, value):
        if not isinstance(value, str) or not _PLAN_SHA.fullmatch(value):
            raise _BridgeFailure('ARG_INVALID')
        return value

    def _check_export_receipt(self, receipt, run_id, payload):
        keys = {'format', 'runId', 'sourceSha256', 'exportFormat', 'exportVersion',
                'exportSha256', 'byteSize', 'fileName', 'rowCount', 'reused'}
        if (not isinstance(receipt, dict) or set(receipt) != keys or
                receipt.get('format') != 'review-data-export-v1' or
                receipt.get('runId') != run_id or
                receipt.get('sourceSha256') != payload['sourceSha256'] or
                receipt.get('exportFormat') != payload['format'] or
                receipt.get('exportVersion') != 'module-review-export-v1' or
                not isinstance(receipt.get('exportSha256'), str) or
                not _PLAN_SHA.fullmatch(receipt['exportSha256']) or
                type(receipt.get('byteSize')) is not int or
                not 0 <= receipt['byteSize'] <= EXPORT_MAX_BYTES or
                not isinstance(receipt.get('fileName'), str) or not receipt['fileName'] or
                type(receipt.get('rowCount')) is not int or receipt['rowCount'] < 0 or
                type(receipt.get('reused')) is not bool):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')

    def _stream_export(self, run_id, digest, byte_size, destination, evidence_kind=None, keep_existing=False):
        folder = destination.parent
        if not folder.is_dir():
            raise _BridgeFailure('SAVE_FAILED')
        config, lines = self._remote_plan('readModuleEvidence' if evidence_kind else 'readReviewExport',
                                          run_id=run_id, export_sha256=digest, kind=evidence_kind)
        argv, token = self._dispatch_argv(config)
        try:
            handle, temp_name = tempfile.mkstemp(prefix='.tdn-shopee-', suffix='.part', dir=str(folder))
        except OSError:
            raise _BridgeFailure('SAVE_FAILED') from None
        temp_path = Path(temp_name)
        try:
            out = os.fdopen(handle, 'wb')
        except OSError:
            try:
                os.close(handle)
            except OSError:
                pass
            try:
                temp_path.unlink()
            except OSError:
                pass
            raise _BridgeFailure('SAVE_FAILED') from None
        process = None
        stderr = None
        timed_out = []
        timer = None
        succeeded = False
        try:
            stderr = tempfile.TemporaryFile()
            options = {'stdin': subprocess.PIPE, 'stdout': subprocess.PIPE, 'stderr': stderr}
            if sys.platform == 'win32':
                options['creationflags'] = subprocess.CREATE_NO_WINDOW
            try:
                process = subprocess.Popen(argv, **options)
                process.stdin.write(('\n'.join(lines) + '\n').encode('utf-8'))
                process.stdin.close()
            except OSError:
                self._invalidate_native(token)
                raise _BridgeFailure('SSH_FAILED') from None

            def stop_for_timeout():
                timed_out.append(True)
                try:
                    process.kill()
                except OSError:
                    pass

            timer = threading.Timer(config['timeoutSeconds'], stop_for_timeout)
            timer.start()
            total = 0
            hasher = hashlib.sha256()
            while True:
                try:
                    chunk = process.stdout.read(1024 * 1024)
                except OSError:
                    self._invalidate_native(token)
                    raise _BridgeFailure('SSH_FAILED') from None
                if not chunk:
                    break
                total += len(chunk)
                if total > byte_size or total > EXPORT_MAX_BYTES:
                    process.kill()
                    raise _BridgeFailure('EXPORT_SIZE_MISMATCH')
                hasher.update(chunk)
                try:
                    out.write(chunk)
                except OSError:
                    raise _BridgeFailure('SAVE_FAILED') from None
            try:
                out.flush()
                os.fsync(out.fileno())
                out.close()
            except OSError:
                raise _BridgeFailure('SAVE_FAILED') from None
            out = None
            returncode = process.wait()
            timer.cancel()
            timer = None
            if timed_out:
                self._invalidate_native(token)
                raise _BridgeFailure('SSH_TIMEOUT')
            if returncode == 255:
                self._invalidate_native(token)
                raise _BridgeFailure('SSH_FAILED')
            if returncode != 0:
                stderr.seek(0)
                error_text = stderr.read(EXPORT_ERROR_MAX_BYTES).decode('utf-8', 'replace')
                code = next((line.strip() for line in error_text.splitlines()
                             if _STATIC_ERROR.fullmatch(line.strip())), '')
                raise _BridgeFailure(code or 'REMOTE_OUTPUT_INVALID')
            if total != byte_size:
                raise _BridgeFailure('EXPORT_SIZE_MISMATCH')
            if not hmac.compare_digest(hasher.hexdigest(), digest):
                raise _BridgeFailure('EXPORT_DIGEST_MISMATCH')
            try:
                if keep_existing:
                    destination = _publish_without_replacing(temp_path, destination)
                else:
                    os.replace(temp_path, destination)
            except OSError:
                raise _BridgeFailure('SAVE_FAILED') from None
            succeeded = True
        finally:
            if timer is not None:
                timer.cancel()
            if out is not None:
                try:
                    out.close()
                except OSError:
                    pass
            if process is not None and process.poll() is None:
                try:
                    process.kill()
                    process.wait()
                except OSError:
                    pass
            if process is not None:
                for stream in (process.stdin, process.stdout):
                    if stream is not None:
                        try:
                            stream.close()
                        except OSError:
                            pass
            if stderr is not None:
                try:
                    stderr.close()
                except OSError:
                    pass
            if not succeeded:
                try:
                    temp_path.unlink()
                except OSError:
                    pass
        return destination

    def library(self):
        return self._safe(lambda: self._remote('library'))

    # ---- Step 1: the user's own Chrome on Metric (tdn_metric_browser) ----

    # Server answers that will never succeed with the same payload: drop it.
    _IMPORT_FINAL_ERRORS = frozenset({'IMPORT_INPUT_INVALID', 'IMPORT_TOO_LARGE', 'IMPORT_ID_CONFLICT',
                                      'IMPORT_NO_SHOPEE_ROWS'})

    def _metric_session(self):
        with self._metric_lock:
            if self._metric is None:
                base = _config_path().parent
                try:
                    base.mkdir(parents=True, exist_ok=True)
                except OSError:
                    raise _BridgeFailure('CONFIG_INVALID') from None
                self._metric = tdn_metric_browser.MetricSession(base)
            return self._metric

    def _metric_safe(self, operation):
        def run():
            try:
                return operation()
            except tdn_metric_browser.MetricFailure as failure:
                result = _error(failure.code, failure.message)
                if failure.detail:
                    result['error']['detail'] = dict(failure.detail)
                return result
        return self._safe(run)

    def lastProductSelection(self):
        return self._safe(self._last_product_selection)

    @staticmethod
    def _last_product_selection():
        try:
            value = json.loads(_choice_path().read_text(encoding='utf-8'))
        except (OSError, ValueError):
            value = None
        if not tdn_metric_browser.valid_product_selection(value):
            value = None
        return {'ok': True, 'data': {'productSelection': value}}

    def rememberProductSelection(self, value=None):
        return self._safe(lambda: self._remember_product_selection(value))

    @staticmethod
    def _remember_product_selection(value):
        """Kept when the form's choice changes. Best effort: a failed write only means the form opens
        with Top 5 next time."""
        if not tdn_metric_browser.valid_product_selection(value):
            raise _BridgeFailure('ARG_INVALID')
        try:
            path = _choice_path()
        except _BridgeFailure:
            return {'ok': True, 'data': {'productSelection': value}}
        _write_choice(path, value, '.product-selection-')
        return {'ok': True, 'data': {'productSelection': value}}

    # ---- F654: the app version, and the newest one on the server (notify only) ----

    def appVersion(self):
        return self._safe(self._app_version_view)

    @staticmethod
    def _app_version_view():
        try:
            dismissed = json.loads(_update_dismissed_path().read_text(encoding='utf-8'))
        except (OSError, ValueError, _BridgeFailure):
            dismissed = None
        build = _app_build()
        return {'ok': True, 'data': {'version': build['version'], 'commit': build['commit'],
                                     'dismissed': dismissed if isinstance(dismissed, str) and
                                     _SEMVER.fullmatch(dismissed) else None}}

    def appLatest(self):
        return self._safe(self._app_latest)

    def _app_latest(self):
        result = self._remote('appLatest')
        if not result['ok']:
            return result
        data = result['data']
        version = data.get('version')
        if (set(data) != {'format', 'version'} or data['format'] != 'app-latest-v1' or
                not (version is None or (isinstance(version, str) and _SEMVER.fullmatch(version)))):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def dismissAppUpdate(self, version=None):
        return self._safe(lambda: self._dismiss_app_update(version))

    @staticmethod
    def _dismiss_app_update(version):
        """The banner of this version stays closed (a newer version shows it again). Best effort."""
        if not isinstance(version, str) or not _SEMVER.fullmatch(version):
            raise _BridgeFailure('ARG_INVALID')
        try:
            path = _update_dismissed_path()
        except _BridgeFailure:
            return {'ok': True, 'data': {'dismissed': version}}
        _write_choice(path, version, '.app-update-')
        return {'ok': True, 'data': {'dismissed': version}}

    def lastRunSort(self):
        return self._safe(self._last_run_sort)

    @staticmethod
    def _last_run_sort():
        try:
            value = json.loads(_run_sort_path().read_text(encoding='utf-8'))
        except (OSError, ValueError, _BridgeFailure):
            value = None
        return {'ok': True, 'data': {'runSort': value if value in RUN_SORTS else None}}

    def rememberRunSort(self, value=None):
        return self._safe(lambda: self._remember_run_sort(value))

    @staticmethod
    def _remember_run_sort(value):
        if value not in RUN_SORTS:
            raise _BridgeFailure('ARG_INVALID')
        try:
            path = _run_sort_path()
        except _BridgeFailure:
            return {'ok': True, 'data': {'runSort': value}}
        _write_choice(path, value, '.run-sort-')
        return {'ok': True, 'data': {'runSort': value}}

    def metricBrowserState(self):
        return self._metric_safe(lambda: {'ok': True, 'data': self._metric_session().view()})

    def openMetric(self):
        return self._metric_safe(self._open_metric)

    def _open_metric(self):
        opened = self._metric_session().open_metric()
        return {'ok': True, 'data': {'reused': opened['reused'], 'browserName': opened['browserName'],
                                     'navigated': opened['navigated']}}

    def takeMetricReviews(self, input=None):
        return self._metric_safe(lambda: self._take_metric_reviews(input))

    def _take_metric_reviews(self, value):
        if (not isinstance(value, dict) or 'collectionPolicy' not in value or
                set(value) - {'collectionPolicy', 'productSelection'}):
            raise _BridgeFailure('ARG_INVALID')
        self._validate_collection_policy(value['collectionPolicy'])
        selection = value.get('productSelection')
        if 'productSelection' in value:
            if not tdn_metric_browser.valid_product_selection(selection):
                raise _BridgeFailure('ARG_INVALID')
        session = self._metric_session()
        if not session.busy.acquire(blocking=False):
            raise tdn_metric_browser.MetricFailure('METRIC_BUSY')
        try:
            # The click's picture comes first, before the server config is read: a missing or invalid
            # config still leaves the picture (and the kept payload for «Gửi lại») on this PC.
            session.capture(value['collectionPolicy'], screenshot_dir=_prepare_metric_shot_folder(),
                            product_selection=selection)
            config = _load_config()
            return self._send_metric_import(session, config)
        finally:
            session.busy.release()

    def resendMetricImport(self):
        return self._metric_safe(self._resend_metric_import)

    def _resend_metric_import(self):
        session = self._metric_session()
        if not session.busy.acquire(blocking=False):
            raise tdn_metric_browser.MetricFailure('METRIC_BUSY')
        try:
            return self._send_metric_import(session, _load_config())
        finally:
            session.busy.release()

    def discardMetricImport(self):
        return self._metric_safe(self._discard_metric_import)

    def _discard_metric_import(self):
        session = self._metric_session()
        if not session.busy.acquire(blocking=False):
            raise tdn_metric_browser.MetricFailure('METRIC_BUSY')
        try:
            session.drop_pending()
            return {'ok': True, 'data': {'pending': None}}
        finally:
            session.busy.release()

    def _send_metric_import(self, session, config):
        """Send the kept payload (same importId every time). Metric is never asked again here."""
        payload = session.pending
        if payload is None:
            raise tdn_metric_browser.MetricFailure('METRIC_NOTHING_PENDING')
        try:
            result = self._remote('m1Import', payload=payload, config=config)
        except _BridgeFailure as failure:
            return {'ok': False, 'error': {'code': failure.code, 'message': failure.code, 'detail': {'pending': True}}}
        if not result['ok']:
            code = result['error'].get('code')
            if code in self._IMPORT_FINAL_ERRORS:
                session.drop_pending()
            result['error']['detail'] = {'pending': session.pending is not None}
            return result
        data = result['data']
        if (set(data) != {'format', 'runId', 'reused', 'gates'} or
                data['format'] != 'metric-user-page-import-result-v1' or
                not isinstance(data['runId'], str) or not _RUN_ID.fullmatch(data['runId']) or
                type(data['reused']) is not bool or data['gates'] != {'entry': 'PASS', 'm1': 'PASS'}):
            return {'ok': False, 'error': {'code': 'REMOTE_OUTPUT_INVALID', 'message': 'REMOTE_OUTPUT_INVALID',
                                           'detail': {'pending': True}}}
        run_id = data['runId']
        session.link_shot(run_id)        # the click's shot becomes <runId>-metric-full-page.webp|png
        with self._shot_uploads_lock:    # the first upload after the run exists is always allowed
            self._shot_attempts.pop(run_id, None)
        session.confirmed()
        try:
            # The whole flow (`run --run <id> --detach`): on a user-page run the server runs M2 -> M3 -> step 4.
            step2 = self._remote('flow', run_id=run_id, config=config)
        except _BridgeFailure as failure:
            step2 = _error(failure.code)
        step2 = {'ok': True} if step2['ok'] else {'ok': False, 'error': {'code': step2['error'].get('code'),
                                                                          'message': step2['error'].get('code')}}
        return {'ok': True, 'data': {'runId': run_id, 'reused': data['reused'], 'step2': step2}}

    def _close_metric(self):
        """App closing: stop listening on every tab. Chrome and its tabs stay open."""
        session = self._metric
        if session is not None:
            session.close()


def main():
    parser = argparse.ArgumentParser(description='TDN Shopee Flow desktop')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        result = Api().connection()
        print(json.dumps(result, ensure_ascii=True))
        return 0 if result['data']['connected'] else 1
    import webview
    folder = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
    api = Api()
    webview.create_window('TDN Shopee Flow', url=str(folder / 'index.html'), js_api=api, width=1280, height=820,
                          text_select=True)  # owner 25/11: text can be selected and copied
    try:
        webview.start()
    finally:
        api._close_metric()
    return 0


if __name__ == '__main__':
    sys.exit(main())

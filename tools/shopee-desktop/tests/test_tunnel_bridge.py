"""F647 wave 3 (7a): a tunnel config is sent from the bridge process itself, against a fake HTTPS relay."""

import http.server
import json
import pathlib
import shutil
import ssl
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app  # noqa: E402

TOKEN = 'synthetic-token-7a'
CONNECTION = {'format': 'connection-v1', 'readonly': False, 'runsRoot': '/srv/runs'}


def frame(kind, data=b''):
    return kind + struct.pack('>I', len(data)) + data


class Relay(http.server.BaseHTTPRequestHandler):
    """Answers with the frames the test sets in `server.reply`: a list (chunked; a float pauses, a tuple
    (delay, bytes) sends the bytes one by one), an int HTTP status, or ('close', version, frames): an answer
    whose end is the relay closing the connection (HTTP/1.0, or HTTP/1.1 with Connection: close)."""

    protocol_version = 'HTTP/1.1'

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        self.server.seen.append({'path': self.path, 'auth': self.headers.get('Authorization'), 'body': body})
        reply = self.server.reply
        if isinstance(reply, tuple) and reply[0] == 'close':
            self.close_connection = True
            head = reply[1] + ' 200 OK\r\n' + ('Connection: close\r\n' if reply[1] == 'HTTP/1.1' else '') + '\r\n'
            self.wfile.write(head.encode('latin-1') + b''.join(reply[2]))
            self.wfile.flush()
            return
        if isinstance(reply, int):
            self.send_response(reply)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Transfer-Encoding', 'chunked')
        self.end_headers()
        for item in reply:
            if isinstance(item, float):
                time.sleep(item)
                continue
            if isinstance(item, tuple):
                for byte in item[1]:
                    time.sleep(item[0])
                    try:
                        self.wfile.write(b'1\r\n%c\r\n' % byte)
                        self.wfile.flush()
                    except OSError:
                        return
                continue
            self.wfile.write(b'%x\r\n%s\r\n' % (len(item), item))
            self.wfile.flush()
        self.wfile.write(b'0\r\n\r\n')

    def log_message(self, *args):
        pass


class TunnelBridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        openssl = shutil.which('openssl')
        if not openssl:
            raise unittest.SkipTest('openssl is needed to make the test certificate')
        cls.folder = tempfile.TemporaryDirectory()
        cert = pathlib.Path(cls.folder.name) / 'cert.pem'
        key = pathlib.Path(cls.folder.name) / 'key.pem'
        subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
                        '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Relay)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(cert), str(key))
        cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
        cls.server.seen = []
        cls.server.reply = []
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.trusted = ssl.create_default_context(cafile=str(cert))

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.folder.cleanup()

    def setUp(self):
        self.server.seen.clear()
        trust = mock.patch.object(tdn_shopee_app.ssl, 'create_default_context', return_value=self.trusted)
        trust.start()
        self.addCleanup(trust.stop)
        self.api = tdn_shopee_app.Api()

    def config(self, client='C:\\TDN\\tdn-tunnel-client.exe', port=None, timeout=5):
        port = port or self.server.server_address[1]
        return {'sshCommand': [client, '--url', f'https://localhost:{port}', '--token', TOKEN,
                               '--resolve-ip', '127.0.0.1'],
                'remoteScript': '$HOME/tdn/shopee_flow.py', 'timeoutSeconds': timeout}

    def call(self, action='connection', run_id=None, **config):
        return self.api._safe(lambda: self.api._remote(action, run_id=run_id, config=self.config(**config)))

    def test_tunnel_rows(self):
        """| relay answer                                        | page gets                                 |
        |-----------------------------------------------------|-------------------------------------------|
        | O frames (JSON in 2 pieces), E, K, X 0               | ok; no program started; POST /run, token  |
        |                                                      | in the header only, the script as body    |
        | a frame of an unknown kind                           | SSH_FAILED                                |
        | HTTP 503                                             | SSH_FAILED                                |
        | nobody listening                                     | SSH_FAILED                                |
        | the answer ends when the relay closes (HTTP/1.1      | ok                                        |
        | Connection: close, and HTTP/1.0)                     |                                           |
        | frames stop past the call's time limit               | SSH_TIMEOUT                               |
        | bytes keep coming slowly past the call's time limit  | SSH_TIMEOUT, at the limit                 |
        | run-view: X 2, nothing on stdout (an older server)   | USAGE                                     |
        | (any of the above)                                   | the token is in no reply                  |
        """
        text = json.dumps(CONNECTION).encode('utf-8')
        replies = []
        with mock.patch.object(tdn_shopee_app.subprocess, 'run', side_effect=AssertionError('program started')):
            with self.subTest('ok'):
                self.server.reply = [frame(b'O', text[:10]), frame(b'K'), frame(b'E', b'note'),
                                     frame(b'O', text[10:]), frame(b'X', struct.pack('>i', 0))]
                result = self.call()
                replies.append(result)
                self.assertEqual(result, {'ok': True, 'data': CONNECTION})
                seen = self.server.seen[-1]
                self.assertEqual(seen['path'], '/run')
                self.assertEqual(seen['auth'], 'Bearer ' + TOKEN)
                self.assertIn(b'python3 "$HOME/tdn/shopee_flow.py" connection', seen['body'])
                self.assertNotIn(TOKEN.encode('utf-8'), seen['body'])
            with self.subTest('unknown frame'):
                self.server.reply = [frame(b'Z', b'?'), frame(b'X', struct.pack('>i', 0))]
                replies.append(self.call())
                self.assertEqual(replies[-1]['error']['code'], 'SSH_FAILED')
            with self.subTest('503'):
                self.server.reply = 503
                replies.append(self.call())
                self.assertEqual(replies[-1]['error']['code'], 'SSH_FAILED')
            with self.subTest('nobody listening'):
                import socket
                spare = socket.socket()
                spare.bind(('127.0.0.1', 0))
                port = spare.getsockname()[1]
                spare.close()
                replies.append(self.call(port=port))
                self.assertEqual(replies[-1]['error']['code'], 'SSH_FAILED')
            for version in ('HTTP/1.1', 'HTTP/1.0'):
                with self.subTest('closed by the relay', version=version):
                    self.server.reply = ('close', version, [frame(b'O', text), frame(b'X', struct.pack('>i', 0))])
                    replies.append(self.call())
                    self.assertEqual(replies[-1], {'ok': True, 'data': CONNECTION})
            with self.subTest('slow bytes'):
                self.server.reply = [(0.1, frame(b'O', b'x' * 40))]
                started = time.monotonic()
                replies.append(self.call(timeout=1))
                self.assertEqual(replies[-1]['error']['code'], 'SSH_TIMEOUT')
                self.assertLess(time.monotonic() - started, 2.0)
            with self.subTest('time limit'):
                self.server.reply = [frame(b'K'), 2.5, frame(b'X', struct.pack('>i', 0))]
                started = time.monotonic()
                replies.append(self.call(timeout=1))
                self.assertEqual(replies[-1]['error']['code'], 'SSH_TIMEOUT')
                self.assertLess(time.monotonic() - started, 2.0)
            with self.subTest('older server'):
                self.server.reply = [frame(b'E', b'usage: ...'), frame(b'X', struct.pack('>i', 2))]
                replies.append(self.call('runView', run_id='run-1'))
                self.assertEqual(replies[-1]['error']['code'], 'USAGE')
        self.assertNotIn(TOKEN, json.dumps(replies))

    def test_a_real_ssh_config_still_runs_its_program(self):
        done = subprocess.CompletedProcess([], 0, stdout=json.dumps(CONNECTION).encode('utf-8'), stderr=b'')
        with mock.patch.object(tdn_shopee_app.subprocess, 'run', return_value=done) as run:
            config = {'sshCommand': ['ssh', '-T', 'fedora'], 'remoteScript': '$HOME/tdn/shopee_flow.py',
                      'timeoutSeconds': 5}
            self.assertEqual(self.api._remote('connection', config=config), {'ok': True, 'data': CONNECTION})
        self.assertEqual(run.call_args.args[0], ['ssh', '-T', 'fedora'])
        self.assertEqual(self.server.seen, [])


if __name__ == '__main__':
    unittest.main()

"""Owner-boundary proof for native endpoint recovery in the desktop bridge.

Every case drives the real `Api` (and the real `_stream_export`) against the
published `tdn_shopee_transport` module. Only native boundaries are faked:
PowerShell adapter enumeration, ssh-keyscan, ssh, TCP sockets and the export
process. No network, SSH, provider, runtime data or user key material is used.
"""
import base64
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
APP_DIR = HERE.parent
sys.path.insert(0, str(APP_DIR))
import tdn_shopee_app  # noqa: E402

REMOTE_SCRIPT = '$HOME/skills/tdn-shopee-flow/scripts/shopee_flow.py'
RUNS_ROOT = '/home/fedora/tdn-growth-os/runs'
HOST_BLOB = base64.b64encode(b'tdn-fixture-host-key-material-0001').decode('ascii')
HOST_PIN = base64.b64encode(hashlib.sha256(base64.b64decode(HOST_BLOB)).digest()).decode('ascii').rstrip('=')
OTHER_BLOB = base64.b64encode(b'tdn-fixture-impostor-key-material-0001').decode('ascii')


def completed(argv, returncode, stdout=b'', stderr=b''):
    return subprocess.CompletedProcess(argv, returncode, stdout=stdout, stderr=stderr)


def key_line(address, blob=HOST_BLOB):
    return f'{address} ssh-ed25519 {blob}\n'


class RecordingStream(io.BytesIO):
    def close(self):
        pass


class Proc:
    def __init__(self, argv, content, returncode):
        self.argv = list(argv)
        self.stdin = RecordingStream()
        self.stdout = RecordingStream()
        self.stdout.write(content)
        self.stdout.seek(0)
        self.stderr = io.BytesIO()
        self.returncode = returncode

    def wait(self):
        return self.returncode

    def poll(self):
        return self.returncode

    def kill(self):
        pass


class FakeSocket:
    def __init__(self, boundary, _family, _kind):
        self._boundary = boundary
        self._timeout = None

    def settimeout(self, timeout):
        self._timeout = timeout

    def bind(self, address):
        self._boundary.bind_sources.append(address[0])

    def connect_ex(self, address):
        self._boundary.tcp_targets.append(address[0])
        if address[0] in self._boundary.open_hosts:
            return 0
        if self._boundary.tcp_blackhole:
            boundary = self._boundary
            with boundary.socket_lock:
                boundary.active_sockets += 1
                boundary.max_active = max(boundary.max_active, boundary.active_sockets)
            try:
                time.sleep(max(0.0, float(self._timeout or 0)))
                raise TimeoutError('connect timed out')
            finally:
                with boundary.socket_lock:
                    boundary.active_sockets -= 1
        return 111

    def close(self):
        pass


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


class Boundary:
    def __init__(self, *, scopes, key_outputs, open_hosts, ssh_path, keyscan_path,
                 legacy_path=None, clock=None):
        self.scopes = scopes
        self.key_outputs = key_outputs
        self.open_hosts = set(open_hosts)
        self.ssh_path = ssh_path
        self.keyscan_path = keyscan_path
        self.legacy_path = legacy_path
        self.clock = clock
        self.tcp_blackhole = False
        self.active_sockets = 0
        self.max_active = 0
        self.socket_lock = threading.Lock()
        self.keyscan_timeout = False
        self.keyscan_delays = {}
        self.inventory_delay = 0.0
        self.ssh_timeout = False
        self.ssh = self.answer
        self.calls = []
        self.powershell_calls = []
        self.keyscan_calls = []
        self.ssh_calls = []
        self.popens = []
        self.mutation_dispatches = 0
        self.tcp_targets = []
        self.bind_sources = []
        self.popen_content = b''
        self.popen_returncode = 0
        self.connection_payload = {'format': 'connection-v1', 'readonly': True, 'runsRoot': RUNS_ROOT}

    def advance(self, seconds):
        if self.clock is not None:
            self.clock.now += seconds

    def answer(self, argv, text):
        if 'stop-review-attempt' in text:
            self.mutation_dispatches += 1
            raise subprocess.TimeoutExpired(argv, 30)
        if 'connection' in text:
            return completed(argv, 0, json.dumps(self.connection_payload).encode())
        return completed(argv, 0, b'{}')

    def run(self, argv, **kwargs):
        executable = argv[0]
        if executable == 'powershell.exe':
            self.calls.append(('powershell', kwargs))
            self.powershell_calls.append(list(argv))
            self.advance(self.inventory_delay)
            return completed(argv, 0, json.dumps(self.scopes).encode())
        if executable == self.keyscan_path:
            self.calls.append(('keyscan', kwargs))
            self.keyscan_calls.append(list(argv))
            self.advance(self.keyscan_delays.get(argv[-1], 0))
            if self.keyscan_timeout:
                budget = int(argv[argv.index('-T') + 1]) if '-T' in argv else 1
                self.advance(budget)
                raise subprocess.TimeoutExpired(argv, budget + 1)
            return completed(argv, 0, self.key_outputs.get(argv[-1], '').encode())
        if executable == self.ssh_path or (self.legacy_path and executable == self.legacy_path):
            self.calls.append(('ssh', kwargs))
            payload = kwargs.get('input') or b''
            self.ssh_calls.append((list(argv), payload))
            if self.ssh_timeout:
                timeout = kwargs.get('timeout')
                self.advance(timeout if isinstance(timeout, (int, float)) else 30)
                raise subprocess.TimeoutExpired(argv, timeout or 30)
            return self.ssh(argv, payload.decode('utf-8', 'replace'))
        raise AssertionError(f'unexpected executable {executable!r}')

    def socket_factory(self, family, kind):
        return FakeSocket(self, family, kind)

    def popen_factory(self, argv, **_options):
        process = Proc(argv, self.popen_content, self.popen_returncode)
        self.popens.append((list(argv), process))
        return process


class NativeCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = pathlib.Path(self._tmp.name)
        self.ssh_path = str(self.dir / 'ssh.exe')
        self.keyscan_path = str(self.dir / 'ssh-keyscan.exe')
        self.identity = str(self.dir / 'id_ed25519')
        self.known_hosts = str(self.dir / 'known_hosts')
        self.alias = 'fedora-host'
        self.user = 'fedora'
        pathlib.Path(self.known_hosts).write_bytes(
            f'{self.alias} ssh-ed25519 {HOST_BLOB}\n'.encode('ascii'))

    def network(self, *, seed, candidates=(), lan=None, connect_timeout=1, probe_timeout=1):
        return {
            'enabled': True,
            'sshExecutable': self.ssh_path,
            'keyscanExecutable': self.keyscan_path,
            'user': self.user,
            'port': 22,
            'identityFile': self.identity,
            'knownHostsFile': self.known_hosts,
            'hostAlias': self.alias,
            'hostIdentity': {'keyType': 'ssh-ed25519', 'publicKey': HOST_BLOB, 'sha256': HOST_PIN},
            'seedTarget': seed,
            'candidates': list(candidates),
            'connectTimeoutSeconds': connect_timeout,
            'probeTimeoutSeconds': probe_timeout,
            'lan': lan if lan is not None else {
                'enabled': True, 'maxHosts': 254, 'maxOpenHosts': 8,
                'concurrency': 8, 'wallSeconds': 10,
            },
        }

    def use_config(self, *, network=None, ssh_command=None, name='config.json', timeout_seconds=5):
        config = {'remoteScript': REMOTE_SCRIPT, 'timeoutSeconds': timeout_seconds}
        if ssh_command is not None:
            config['sshCommand'] = ssh_command
        if network is not None:
            config['network'] = network
        path = self.dir / name
        path.write_text(json.dumps(config), encoding='utf-8')
        env = mock.patch.dict(os.environ, {'TDN_SHOPEE_APP_CONFIG': str(path)})
        env.start()
        self.addCleanup(env.stop)

    def boundary(self, *, scopes, key_outputs, open_hosts=(), legacy=None, clock=None):
        stub = Boundary(scopes=scopes, key_outputs=key_outputs, open_hosts=open_hosts,
                        ssh_path=self.ssh_path, keyscan_path=self.keyscan_path,
                        legacy_path=legacy, clock=clock)
        for target, replacement in (
                ('subprocess.run', stub.run),
                ('subprocess.Popen', stub.popen_factory),
                ('socket.socket', stub.socket_factory)):
            patcher = mock.patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        if clock is not None:
            patcher = mock.patch('time.monotonic', clock)
            patcher.start()
            self.addCleanup(patcher.stop)
        return stub

    def assert_pinned_argv(self, argv):
        self.assertIn('StrictHostKeyChecking=yes', argv)
        self.assertIn(f'UserKnownHostsFile={self.known_hosts}', argv)
        self.assertIn(f'HostKeyAlias={self.alias}', argv)
        self.assertIn('HostKeyAlgorithms=ssh-ed25519', argv)
        self.assertIn('UpdateHostKeys=no', argv)
        self.assertIn('BatchMode=yes', argv)
        self.assertIn('IdentitiesOnly=yes', argv)
        self.assertNotIn('StrictHostKeyChecking=no', argv)
        self.assertNotIn('StrictHostKeyChecking=accept-new', argv)


def physical(address='192.168.1.5', *, prefix=24, gateway=None, metric=10, if_index=7):
    return {
        'alias': 'Ethernet',
        'description': 'Realtek PCIe GbE Family Controller',
        'hardware': True,
        'virtual': False,
        'ifIndex': if_index,
        'address': address,
        'prefix': prefix,
        'gateway': gateway or address.rsplit('.', 1)[0] + '.1',
        'metric': metric,
    }


class NativeRecoveryTests(NativeCase):
    def test_stale_known_endpoint_recovers_pinned_lan_host_shared_with_dispatch(self):
        clock = Clock()
        names = ['stale-host.local'] + [f'host-{index}.local' for index in range(7)]
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={
                '192.168.1.44': key_line('192.168.1.44'),
                '192.168.1.77': key_line('192.168.1.77', OTHER_BLOB),
            },
            open_hosts={'192.168.1.44', '192.168.1.77'},
            clock=clock,
        )
        stub.keyscan_delays = {'192.168.1.99': 1.0}
        stub.keyscan_delays.update({name: 1.0 for name in names})
        self.use_config(network=self.network(seed='192.168.1.99', candidates=names,
                                            lan={'wallSeconds': 6}))
        api = tdn_shopee_app.Api()

        result = api.connection()

        self.assertEqual({'ok': True, 'data': {'connected': True, 'readonly': True, 'runsRoot': RUNS_ROOT}}, result)
        self.assertLessEqual(clock.now, 6)
        self.assertEqual(len(stub.ssh_calls), 1)
        argv, text = stub.ssh_calls[0]
        self.assertEqual(argv[-3], '192.168.1.44')
        self.assertIn(b'connection', text)
        self.assert_pinned_argv(argv)
        self.assertEqual(set(stub.bind_sources), {'192.168.1.5'})
        self.assertTrue(all(target.startswith('192.168.1.') for target in stub.tcp_targets))
        probed = [call[-1] for call in stub.keyscan_calls]
        self.assertIn('192.168.1.99', probed)
        self.assertIn('stale-host.local', probed)
        self.assertIn('192.168.1.44', probed)

        keyscans_before = len(stub.keyscan_calls)
        self.assertTrue(api.presets()['ok'])

        self.assertEqual(len(stub.keyscan_calls), keyscans_before)
        self.assertEqual(len(stub.ssh_calls), 2)
        argv, text = stub.ssh_calls[1]
        self.assertEqual(argv[-3], '192.168.1.44')
        self.assertIn(b'presets', text)
        self.assert_pinned_argv(argv)

    def test_virtual_wsl_adapter_never_becomes_the_scan_source(self):
        stub = self.boundary(
            scopes=[
                {
                    'alias': 'vEthernet (WSL)',
                    'description': 'Hyper-V Virtual Ethernet Adapter',
                    'hardware': True,
                    'virtual': True,
                    'ifIndex': 33,
                    'address': '172.28.0.1',
                    'prefix': 20,
                    'gateway': '172.28.0.1',
                    'metric': 5,
                },
                physical('192.168.10.23', gateway='192.168.10.1', metric=25),
            ],
            key_outputs={'192.168.10.60': key_line('192.168.10.60')},
            open_hosts={'192.168.10.60'},
        )
        self.use_config(network=self.network(seed='10.9.9.9'))
        result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'])
        self.assertEqual(set(stub.bind_sources), {'192.168.10.23'})
        self.assertTrue(stub.tcp_targets)
        self.assertTrue(all(target.startswith('192.168.10.') for target in stub.tcp_targets))
        self.assertFalse(any(target.startswith('172.28.') for target in stub.tcp_targets))
        self.assertEqual(stub.ssh_calls[0][0][-3], '192.168.10.60')

    def test_pin_mismatch_refuses_before_rpc_and_rewrites_no_pin(self):
        before = pathlib.Path(self.known_hosts).read_bytes()
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50', OTHER_BLOB)},
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        result = tdn_shopee_app.Api().connection()

        self.assertEqual({'connected': False, 'readonly': None, 'runsRoot': None,
                          'reason': 'HOST_IDENTITY_MISMATCH'}, result['data'])
        self.assertEqual(stub.ssh_calls, [])
        self.assertEqual(len(stub.keyscan_calls), 1)
        self.assertEqual(pathlib.Path(self.known_hosts).read_bytes(), before)
        rendered = json.dumps(result)
        for secret in ('192.168.1.50', self.user, self.identity, HOST_BLOB):
            self.assertNotIn(secret, rendered)

    def test_keyscan_match_then_ssh_host_key_failure_is_not_replayed(self):
        before = pathlib.Path(self.known_hosts).read_bytes()
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50')},
        )
        rejected = completed(
            ['ssh'], 255, b'',
            b'Host key verification failed: 192.168.1.50 user fedora key /home/fedora/.ssh/id_ed25519\n')
        stub.ssh = lambda argv, text: rejected
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        result = tdn_shopee_app.Api().connection()

        self.assertEqual({'connected': False, 'readonly': None, 'runsRoot': None,
                          'reason': 'SSH_FAILED'}, result['data'])
        self.assertEqual(len(stub.ssh_calls), 1)
        self.assertEqual(len(stub.keyscan_calls), 1)
        self.assertEqual(pathlib.Path(self.known_hosts).read_bytes(), before)
        rendered = json.dumps(result)
        for secret in ('192.168.1.50', self.user, self.identity):
            self.assertNotIn(secret, rendered)

    def test_dispatch_needs_active_endpoint_and_rechecks_pin(self):
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50')},
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        api = tdn_shopee_app.Api()

        early = api.presets()
        self.assertEqual({'ok': False, 'error': {'code': 'NOT_SENT', 'message': 'NOT_SENT'}}, early)
        self.assertEqual(stub.ssh_calls, [])
        self.assertEqual(stub.keyscan_calls, [])

        self.assertTrue(api.connection()['data']['connected'])
        self.assertEqual(len(stub.ssh_calls), 1)

        pathlib.Path(self.known_hosts).write_bytes(
            f'{self.alias} ssh-ed25519 {OTHER_BLOB}\n'.encode('ascii'))
        gated = api.presets()

        self.assertEqual('HOST_KEY_MISSING', gated['error']['code'])
        self.assertEqual(len(stub.ssh_calls), 1)

    def test_ambiguous_mutation_timeout_is_never_redispatched(self):
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50')},
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        api = tdn_shopee_app.Api()
        self.assertTrue(api.connection()['data']['connected'])

        result = api.stopReviewAttempt('run-1', 'counts', 'attempt-1')

        self.assertEqual({'ok': False, 'error': {'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT'}}, result)
        self.assertEqual(stub.mutation_dispatches, 1)
        self.assertEqual(sum(1 for _argv, text in stub.ssh_calls if b'stop-review-attempt' in text), 1)

        self.assertTrue(api.connection()['data']['connected'])

        self.assertEqual(stub.mutation_dispatches, 1)
        self.assertEqual(sum(1 for _argv, text in stub.ssh_calls if b'stop-review-attempt' in text), 1)

    def test_stream_export_reuses_active_endpoint_without_restart(self):
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50')},
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        api = tdn_shopee_app.Api()
        self.assertTrue(api.connection()['data']['connected'])

        content = b'{"format":"review-data-export-v1","rows":[]}\n'
        digest = hashlib.sha256(content).hexdigest()
        stub.popen_content = content
        destination = self.dir / 'export.json'

        api._stream_export('run-1', digest, len(content), destination)

        self.assertEqual(destination.read_bytes(), content)
        self.assertEqual(len(stub.popens), 1)
        argv, process = stub.popens[0]
        self.assertEqual(argv[-3], '192.168.1.50')
        self.assert_pinned_argv(argv)
        self.assertIn(b'read-review-export', process.stdin.getvalue())
        self.assertIn(b'run-1', process.stdin.getvalue())

        second = self.dir / 'export-2.json'
        stub.popen_returncode = 255
        with self.assertRaises(tdn_shopee_app._BridgeFailure) as caught:
            api._stream_export('run-1', digest, len(content), second)

        self.assertEqual('SSH_FAILED', caught.exception.code)
        self.assertEqual(len(stub.popens), 2)
        self.assertFalse(second.exists())
        transport = api._transport_for(tdn_shopee_app._load_config())
        self.assertIsNone(transport.active_endpoint())
        self.assertTrue(api.connection()['data']['connected'])
        self.assertEqual(transport.active_endpoint().address, '192.168.1.50')

    def test_legacy_and_disabled_network_keep_the_exact_ssh_command(self):
        legacy = self.boundary(scopes=[], key_outputs={}, legacy='bash')
        self.use_config(ssh_command=['bash', '-s'], name='legacy.json')
        result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'])
        self.assertEqual([call[0] for call in legacy.ssh_calls], [['bash', '-s']])
        self.assertEqual(legacy.powershell_calls, [])
        self.assertEqual(legacy.keyscan_calls, [])

        disabled = self.boundary(scopes=[], key_outputs={}, legacy='bash')
        self.use_config(network={'enabled': False}, ssh_command=['bash', '-s'], name='disabled.json')
        result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'])
        self.assertEqual([call[0] for call in disabled.ssh_calls], [['bash', '-s']])
        self.assertEqual(disabled.powershell_calls, [])

    def test_native_mode_ignores_retained_legacy_command_without_fallback(self):
        command = ['bash', '-s']
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50')},
            legacy='bash',
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}),
                        ssh_command=list(command), name='mixed.json')
        before = (self.dir / 'mixed.json').read_bytes()
        result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'])
        self.assertEqual(len(stub.ssh_calls), 1)
        self.assertEqual(stub.ssh_calls[0][0][0], self.ssh_path)
        self.assertEqual(stub.ssh_calls[0][0][-3], '192.168.1.50')
        self.assertFalse(any(argv[0] == 'bash' for argv, _text in stub.ssh_calls))
        self.assertEqual((self.dir / 'mixed.json').read_bytes(), before)

        offline = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50', OTHER_BLOB)},
            legacy='bash',
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}),
                        ssh_command=list(command), name='mixed-offline.json')
        result = tdn_shopee_app.Api().connection()

        self.assertEqual('HOST_IDENTITY_MISMATCH', result['data']['reason'])
        self.assertEqual(offline.ssh_calls, [])

    def test_connection_deadline_bounds_authenticated_probe_attempts(self):
        clock = Clock()
        names = [f'host-{index}.local' for index in range(7)]
        keys = {'192.168.1.99': key_line('192.168.1.99')}
        keys.update({name: key_line(name) for name in names})
        stub = self.boundary(scopes=[physical()], key_outputs=keys, clock=clock)
        stub.ssh_timeout = True
        self.use_config(network=self.network(seed='192.168.1.99', candidates=names,
                                            lan={'wallSeconds': 6}, probe_timeout=3),
                        timeout_seconds=30)
        result = tdn_shopee_app.Api().connection()

        self.assertEqual('SSH_TIMEOUT', result['data']['reason'])
        self.assertLessEqual(clock.now, 6)
        self.assertEqual(len(stub.ssh_calls), 1)
        self.assertTrue(all(kwargs.get('timeout') <= 6
                            for kind, kwargs in stub.calls if kind == 'ssh'))

    def test_cold_healthy_known_host_does_not_pay_lan_inventory(self):
        # Physical adapter inventory costs ~2.4s on the Windows desktop; a cold
        # connection to a known host with a matching pin must not wait for it.
        clock = Clock()
        seed = '192.168.1.50'
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={seed: key_line(seed)},
            clock=clock,
        )
        stub.inventory_delay = 2.4
        self.use_config(network=self.network(seed=seed))

        result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'], result)
        self.assertLess(clock.now, 2.0, 'cold healthy connection paid the LAN inventory cost')
        self.assertEqual(stub.powershell_calls, [])
        self.assertEqual(stub.tcp_targets, [])
        self.assertEqual([call[-1] for call in stub.keyscan_calls], [seed])
        self.assertEqual(stub.keyscan_calls[0][1:3], ['-t', 'ed25519'])
        self.assertEqual(seed, stub.ssh_calls[-1][0][-3])
        self.assert_pinned_argv(stub.ssh_calls[0][0])

    def test_healthy_poll_reverifies_active_endpoint_without_full_scan(self):
        clock = Clock()
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.44': key_line('192.168.1.44')},
            open_hosts={'192.168.1.44'},
            clock=clock,
        )
        self.use_config(network=self.network(seed='192.168.1.99'))
        api = tdn_shopee_app.Api()
        self.assertTrue(api.connection()['data']['connected'])
        probes = len(stub.tcp_targets)
        keyscans = len(stub.keyscan_calls)

        clock.now += 5
        self.assertTrue(api.connection()['data']['connected'])

        self.assertEqual(len(stub.tcp_targets), probes)
        self.assertGreater(len(stub.keyscan_calls), keyscans)
        self.assertEqual(stub.ssh_calls[-1][0][-3], '192.168.1.44')

    def test_cached_endpoint_authenticates_before_slow_stale_names_starve_deadline(self):
        clock = Clock()
        cached = '192.168.1.44'
        names = [f'host-{index}.local' for index in range(8)]
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={cached: key_line(cached)},
            open_hosts={cached},
            clock=clock,
        )
        self.use_config(network=self.network(seed='192.168.1.99', candidates=names,
                                            lan={'wallSeconds': 6}, probe_timeout=1),
                        timeout_seconds=30)
        api = tdn_shopee_app.Api()
        self.assertTrue(api.connection()['data']['connected'])
        transport = api._transport_for(tdn_shopee_app._load_config())
        self.assertEqual(cached, transport.active_endpoint().address)
        keyscans = len(stub.keyscan_calls)

        clock.now += 1.0
        stub.keyscan_delays = {'192.168.1.99': 1.0}
        stub.keyscan_delays.update({name: 1.0 for name in names})

        result = api.connection()

        self.assertTrue(result['data']['connected'], result)
        self.assertEqual(cached, transport.active_endpoint().address)
        self.assertEqual(cached, stub.ssh_calls[-1][0][-3])
        self.assertLessEqual(len(stub.keyscan_calls) - keyscans, 2)

    def test_concurrent_connection_probes_do_not_overlap(self):
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50')},
        )
        first_entered = threading.Event()
        second_entered = threading.Event()
        release = threading.Event()

        def ssh(argv, _text):
            if first_entered.is_set():
                second_entered.set()
            first_entered.set()
            release.wait(5)
            return completed(argv, 0, json.dumps(stub.connection_payload).encode())

        stub.ssh = ssh
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        api = tdn_shopee_app.Api()
        results = []
        threads = [threading.Thread(target=lambda: results.append(api.connection()))]
        threads[0].start()
        self.assertTrue(first_entered.wait(5))
        threads.append(threading.Thread(target=lambda: results.append(api.connection())))
        threads[1].start()
        second_entered.wait(0.3)
        release.set()
        for thread in threads:
            thread.join(5)
            self.assertFalse(thread.is_alive())

        self.assertFalse(second_entered.is_set())
        self.assertEqual(2, len(results))
        self.assertTrue(all(result['data']['connected'] for result in results))

    def test_repeated_failed_discovery_is_backed_off_at_api_boundary(self):
        clock = Clock()
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.50': key_line('192.168.1.50', OTHER_BLOB)},
            clock=clock,
        )
        self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}))
        api = tdn_shopee_app.Api()

        first = api.connection()
        scans = len(stub.keyscan_calls)
        clock.now += 0.8
        second = api.connection()

        self.assertEqual('HOST_IDENTITY_MISMATCH', first['data']['reason'])
        self.assertEqual(first['data'], second['data'])
        self.assertEqual(len(stub.keyscan_calls), scans)

    def test_windows_probes_use_hidden_creation_flags(self):
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={'192.168.1.44': key_line('192.168.1.44')},
            open_hosts={'192.168.1.44'},
        )
        self.use_config(network=self.network(seed='192.168.1.99'))
        hidden = 0x08000000
        with mock.patch.object(subprocess, 'CREATE_NO_WINDOW', hidden, create=True), \
                mock.patch('sys.platform', 'win32'):
            result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'])
        self.assertEqual({'powershell', 'keyscan', 'ssh'}, {kind for kind, _kwargs in stub.calls})
        for kind, kwargs in stub.calls:
            self.assertEqual(hidden, kwargs.get('creationflags'), kind)

    def test_app_private_pin_file_trusts_only_the_exact_key(self):
        cases = {
            'exact-pin.json': f'{self.alias} ssh-ed25519 {HOST_BLOB}\n'.encode('ascii'),
            'extra-key.json': (f'{self.alias} ssh-ed25519 {HOST_BLOB}\n'
                               f'{self.alias} ssh-ed25519 {OTHER_BLOB}\n').encode('ascii'),
            'authority.json': (
                f'@cert-authority {self.alias} ssh-ed25519 {HOST_BLOB}\n').encode('ascii'),
            'wildcard.json': (f'{self.alias} ssh-ed25519 {HOST_BLOB}\n'
                              f'* ssh-ed25519 {OTHER_BLOB}\n').encode('ascii'),
            'comma-alias.json': (f'{self.alias} ssh-ed25519 {HOST_BLOB}\n'
                                 f'{self.alias},other ssh-ed25519 {OTHER_BLOB}\n').encode('ascii'),
        }
        expected = {'exact-pin.json': True, 'extra-key.json': False, 'authority.json': False,
                    'wildcard.json': False, 'comma-alias.json': False}
        for name, contents in cases.items():
            with self.subTest(name=name):
                pathlib.Path(self.known_hosts).write_bytes(contents)
                stub = self.boundary(
                    scopes=[physical()],
                    key_outputs={'192.168.1.50': key_line('192.168.1.50')},
                )
                self.use_config(network=self.network(seed='192.168.1.50', lan={'enabled': False}),
                                name=name)
                result = tdn_shopee_app.Api().connection()

                self.assertEqual(expected[name], result['data']['connected'])
                self.assertEqual(contents, pathlib.Path(self.known_hosts).read_bytes())
                if not expected[name]:
                    self.assertEqual('HOST_KEY_MISSING', result['data']['reason'])
                    self.assertEqual(stub.ssh_calls, [])

    def test_link_local_adapter_is_never_the_scan_source(self):
        stub = self.boundary(
            scopes=[
                {
                    'alias': 'Ethernet 2',
                    'description': 'Intel(R) Ethernet Connection',
                    'hardware': True,
                    'virtual': False,
                    'ifIndex': 9,
                    'address': '169.254.10.5',
                    'prefix': 16,
                    'gateway': '169.254.0.1',
                    'metric': 5,
                },
                physical('192.168.10.23', gateway='192.168.10.1', metric=25),
            ],
            key_outputs={'192.168.10.60': key_line('192.168.10.60')},
            open_hosts={'192.168.10.60'},
        )
        self.use_config(network=self.network(seed='10.9.9.9'))
        result = tdn_shopee_app.Api().connection()

        self.assertTrue(result['data']['connected'])
        self.assertEqual(set(stub.bind_sources), {'192.168.10.23'})
        self.assertTrue(stub.tcp_targets)
        self.assertTrue(all(target.startswith('192.168.10.') for target in stub.tcp_targets))
        self.assertFalse(any(target.startswith('169.254.') for target in stub.tcp_targets))

    def test_late_lan_host_connects_within_wall_despite_blackholed_peers(self):
        pinned = '192.168.1.250'
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={pinned: key_line(pinned)},
            open_hosts={pinned},
        )
        stub.tcp_blackhole = True
        self.use_config(network=self.network(seed='10.9.9.9', candidates=[],
                                            lan={'wallSeconds': 2, 'concurrency': 16},
                                            connect_timeout=3, probe_timeout=1),
                        timeout_seconds=30)

        started = time.monotonic()
        result = tdn_shopee_app.Api().connection()
        elapsed = time.monotonic() - started

        self.assertTrue(result['data']['connected'], result)
        self.assertLess(elapsed, 2.0, f'late host was not reached within the wall: {elapsed:.2f}s')
        self.assertEqual(pinned, stub.ssh_calls[-1][0][-3])
        self.assertIn(pinned, [call[-1] for call in stub.keyscan_calls])
        self.assertIn(pinned, stub.tcp_targets)
        self.assertEqual(0, stub.active_sockets, 'TCP workers joined before discovery returned')
        self.assertLessEqual(stub.max_active, 16)

    def test_late_failure_on_old_endpoint_does_not_clear_new_activation(self):
        old = '192.168.1.10'
        new = '192.168.1.20'
        clock = Clock()
        stub = self.boundary(
            scopes=[physical()],
            key_outputs={old: key_line(old), new: key_line(new)},
            clock=clock,
        )
        entered = threading.Event()
        release = threading.Event()
        self.addCleanup(release.set)
        stub.old_probe_ok = True

        def ssh(argv, text):
            if 'stop-review-attempt' in text:
                stub.mutation_dispatches += 1
                entered.set()
                release.wait(5)
                raise subprocess.TimeoutExpired(argv, 30)
            if 'connection' in text:
                if argv[-3] == old and not stub.old_probe_ok:
                    return completed(argv, 255)
                return completed(argv, 0, json.dumps(stub.connection_payload).encode())
            return completed(argv, 0, b'{}')

        stub.ssh = ssh
        self.use_config(network=self.network(seed=old, candidates=[new], lan={'enabled': False}))
        api = tdn_shopee_app.Api()
        transport = api._transport_for(tdn_shopee_app._load_config())
        first = api.connection()
        self.assertTrue(first['data']['connected'], first)
        self.assertEqual(old, transport.active_endpoint().address)

        results = []
        worker = threading.Thread(target=lambda: results.append(
            api.stopReviewAttempt('run-1', 'counts', 'attempt-1')))
        worker.start()
        self.assertTrue(entered.wait(5))

        clock.now += 1.0
        stub.old_probe_ok = False
        self.assertTrue(api.connection()['data']['connected'])
        self.assertEqual(new, transport.active_endpoint().address)
        scans = len(stub.keyscan_calls)

        release.set()
        worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertEqual({'ok': False, 'error': {'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT'}}, results[0])
        self.assertEqual(1, stub.mutation_dispatches)

        endpoint = transport.active_endpoint()
        self.assertIsNotNone(endpoint)
        self.assertEqual(new, endpoint.address)
        self.assertTrue(api.presets()['ok'])
        self.assertEqual(new, stub.ssh_calls[-1][0][-3])
        self.assertEqual(scans, len(stub.keyscan_calls))
        self.assertEqual(1, stub.mutation_dispatches)


if __name__ == '__main__':
    unittest.main()

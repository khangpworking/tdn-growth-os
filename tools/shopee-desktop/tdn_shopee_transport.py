"""Native Windows endpoint discovery for the Shopee desktop bridge.

The module resolves only a host-key-verified endpoint and builds explicit ssh
argv. It never authenticates to an unverified candidate, never writes global
SSH files, and never carries application payload during discovery.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass


class TransportError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Endpoint:
    address: str
    source: str


_PIN_TYPES = {
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
}
_HOST_NAME = re.compile(
    r'(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)'
    r'(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*')
_ALIAS = re.compile(r'[A-Za-z0-9._-]{1,128}')
_USER = re.compile(r'[A-Za-z0-9._-]{1,64}')
_BASE64 = re.compile(r'[A-Za-z0-9+/]+={0,2}')
_VIRTUAL = (
    'wsl', 'vethernet', 'hyper-v', 'virtualbox', 'vmware', 'loopback',
    'tailscale', 'wireguard', 'openvpn', 'vpn', 'tap-', 'tun', 'docker',
    'default switch', 'bluetooth', 'wi-fi direct', 'npcap', 'zerotier',
    'hamachi', 'radmin', 'virtual',
)
_NETWORK_KEYS = {
    'enabled', 'sshExecutable', 'keyscanExecutable', 'user', 'port',
    'identityFile', 'knownHostsFile', 'hostAlias', 'hostIdentity',
    'seedTarget', 'candidates', 'connectTimeoutSeconds',
    'probeTimeoutSeconds', 'lan',
}
_LAN_KEYS = {'enabled', 'maxHosts', 'maxOpenHosts', 'concurrency', 'wallSeconds'}
_IDENTITY_KEYS = {'keyType', 'publicKey', 'sha256'}
_ENUMERATE = (
    "$ErrorActionPreference='Stop'; "
    "Get-NetIPConfiguration | "
    "Where-Object { $_.IPv4Address -and $_.IPv4DefaultGateway -and "
    "$_.NetAdapter.Status -eq 'Up' } | "
    "ForEach-Object { [pscustomobject]@{ "
    "alias=[string]$_.InterfaceAlias; "
    "description=[string]$_.NetAdapter.InterfaceDescription; "
    "hardware=[bool]$_.NetAdapter.HardwareInterface; "
    "virtual=[bool]$_.NetAdapter.Virtual; "
    "ifIndex=[int]$_.InterfaceIndex; "
    "address=[string]$_.IPv4Address.IPAddress; "
    "prefix=[int]$_.IPv4Address.PrefixLength; "
    "gateway=[string]$_.IPv4DefaultGateway.NextHop; "
    "metric=[int]$_.NetIPv4Interface.InterfaceMetric + [int]$_.IPv4DefaultGateway.RouteMetric } } | "
    "Sort-Object metric,ifIndex | Select-Object -First 8 | "
    "ConvertTo-Json -Compress"
)


def _bad():
    raise TransportError('CONFIG_INVALID')


def _local_path(value):
    if not isinstance(value, str) or not value or '\x00' in value:
        return False
    if any(character in value for character in '\r\n'):
        return False
    return (value.startswith('/') or
            re.match(r'^[A-Za-z]:[\\/]', value) is not None or
            value.startswith('\\\\'))


def _base64_bytes(value, limit):
    if not isinstance(value, str) or not value or len(value) > limit or not _BASE64.fullmatch(value):
        _bad()
    try:
        return base64.b64decode(value, validate=True)
    except ValueError:
        _bad()


def _bounded_int(value, low, high):
    if type(value) is not int or value < low or value > high:
        _bad()
    return value


def normalize_network(value):
    """Validate and normalize the opt-in `network` object.

    Raises TransportError('CONFIG_INVALID') without echoing configured values.
    """
    if not isinstance(value, dict):
        _bad()
    enabled = value.get('enabled', True)
    if type(enabled) is not bool:
        _bad()
    if not enabled:
        if set(value) != {'enabled'}:
            _bad()
        return {'enabled': False}
    if set(value) - _NETWORK_KEYS:
        _bad()
    for key in ('sshExecutable', 'keyscanExecutable', 'identityFile', 'knownHostsFile'):
        if not _local_path(value.get(key)):
            _bad()
    user = value.get('user')
    if not isinstance(user, str) or not _USER.fullmatch(user):
        _bad()
    port = _bounded_int(value.get('port', 22), 1, 65535)
    alias = value.get('hostAlias')
    if not isinstance(alias, str) or not _ALIAS.fullmatch(alias):
        _bad()
    identity = value.get('hostIdentity')
    if not isinstance(identity, dict) or set(identity) != _IDENTITY_KEYS:
        _bad()
    key_type = identity.get('keyType')
    if key_type not in _PIN_TYPES:
        _bad()
    key_blob = _base64_bytes(identity.get('publicKey'), 4096)
    digest = base64.b64encode(hashlib.sha256(key_blob).digest()).decode('ascii').rstrip('=')
    pin = identity.get('sha256')
    if not isinstance(pin, str) or not hmac.compare_digest(pin.rstrip('='), digest):
        _bad()
    try:
        seed = str(ipaddress.IPv4Address(value.get('seedTarget')))
    except (ipaddress.AddressValueError, ValueError, TypeError):
        _bad()
    candidates = value.get('candidates', [])
    if not isinstance(candidates, list) or len(candidates) > 8:
        _bad()
    normalized_candidates = []
    for candidate in candidates:
        if not isinstance(candidate, str):
            _bad()
        try:
            normalized = str(ipaddress.IPv4Address(candidate))
        except (ipaddress.AddressValueError, ValueError):
            if not _HOST_NAME.fullmatch(candidate):
                _bad()
            normalized = candidate
        if normalized not in normalized_candidates:
            normalized_candidates.append(normalized)
    connect_timeout = _bounded_int(value.get('connectTimeoutSeconds', 3), 1, 30)
    probe_timeout = _bounded_int(value.get('probeTimeoutSeconds', 4), 1, 30)
    lan = value.get('lan', {})
    if not isinstance(lan, dict) or set(lan) - _LAN_KEYS:
        _bad()
    lan_enabled = lan.get('enabled', True)
    if type(lan_enabled) is not bool:
        _bad()
    return {
        'enabled': True,
        'sshExecutable': value['sshExecutable'],
        'keyscanExecutable': value['keyscanExecutable'],
        'user': user,
        'port': port,
        'identityFile': value['identityFile'],
        'knownHostsFile': value['knownHostsFile'],
        'hostAlias': alias,
        'hostIdentity': {
            'keyType': key_type,
            'publicKey': identity['publicKey'],
            'sha256': digest,
        },
        'seedTarget': seed,
        'candidates': normalized_candidates,
        'connectTimeoutSeconds': connect_timeout,
        'probeTimeoutSeconds': probe_timeout,
        'lan': {
            'enabled': lan_enabled,
            'maxHosts': _bounded_int(lan.get('maxHosts', 254), 1, 512),
            'maxOpenHosts': _bounded_int(lan.get('maxOpenHosts', 8), 1, 16),
            'concurrency': _bounded_int(lan.get('concurrency', 32), 1, 64),
            'wallSeconds': _bounded_int(lan.get('wallSeconds', 12), 1, 60),
        },
    }


@dataclass(frozen=True)
class _Scope:
    alias: str
    description: str
    if_index: int
    address: str
    prefix: int
    gateway: str
    metric: int


def _virtual(name):
    lowered = (name or '').lower()
    return any(pattern in lowered for pattern in _VIRTUAL)


def _scope_key(scope):
    return (scope.if_index, scope.address, scope.prefix, scope.gateway)


def _text(value):
    if isinstance(value, bytes):
        return value.decode('utf-8-sig', 'replace')
    return value if isinstance(value, str) else ''


def _hidden_flags():
    return subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0


def _usable_ipv4(value):
    try:
        address = ipaddress.IPv4Address(value)
    except (ipaddress.AddressValueError, ValueError, TypeError):
        return None
    if (address.is_loopback or address.is_link_local or address.is_unspecified or
            address.is_multicast or address.is_reserved):
        return None
    return address


class NativeTransport:
    def __init__(self, network):
        self.network = normalize_network(network)
        if not self.network.get('enabled'):
            raise TransportError('CONFIG_INVALID')
        self._lock = threading.Lock()
        self._active = None
        self._generation = 0
        self._scope = None
        self._scope_key_value = None
        self._candidate_cache = None
        self._candidate_cache_at = 0.0
        self._last_code = None
        self._stats = {
            'scope_reads': 0,
            'hosts_enumerated': 0,
            'tcp_probes': 0,
            'open_hosts': 0,
            'keyscans': 0,
        }

    @property
    def last_code(self):
        return self._last_code

    @property
    def stats(self):
        with self._lock:
            return dict(self._stats)

    def active_endpoint(self):
        with self._lock:
            return self._active

    def dispatch_token(self):
        """Capture the endpoint and activation generation an action will use."""
        with self._lock:
            return self._active, self._generation

    def activate(self, endpoint):
        with self._lock:
            self._active = endpoint
            self._generation += 1
            if self._candidate_cache is not None:
                self._candidate_cache = [endpoint] + [
                    item for item in self._candidate_cache if item.address != endpoint.address]
                self._candidate_cache_at = time.monotonic()
            self._last_code = None

    def invalidate(self, generation=None):
        """Clear the endpoint only while the given activation is still current."""
        with self._lock:
            if generation is not None and generation != self._generation:
                return False
            self._active = None
            self._generation += 1
            self._candidate_cache = None
            self._candidate_cache_at = 0.0
            return True

    def find_candidates(self, deadline=None):
        with self._lock:
            now = time.monotonic()
            if deadline is None:
                deadline = now + self.network['lan']['wallSeconds']
            if deadline - now <= 0:
                self._last_code = 'SSH_TIMEOUT'
                return []
            if self._candidate_cache is not None and now - self._candidate_cache_at < 0.75:
                return list(self._candidate_cache)
            self._refresh_scope_locked(deadline)
            if deadline - time.monotonic() <= 0:
                self._last_code = 'SSH_TIMEOUT'
                if self._active is not None or self._candidate_cache is not None:
                    self._generation += 1
                self._active = None
                self._candidate_cache = None
                self._candidate_cache_at = 0.0
                return []
            found = []
            skip = set()
            active = self._active
            if active is not None:
                endpoint = self._verify_target(active.address, active.source, deadline)
                if endpoint is not None:
                    # An already verified endpoint is authenticated first; a
                    # slow seed/name scan must not starve its connection-v1
                    # probe. The caller falls back to fresh discovery if that
                    # authentication fails.
                    self._candidate_cache = [endpoint]
                    self._candidate_cache_at = time.monotonic()
                    self._last_code = None
                    return [endpoint]
                skip.add(active.address)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self._last_code = 'SSH_TIMEOUT'
                return []
            # Speculative seed/name scans may not consume the whole wall: keep
            # the other half for physical-LAN discovery and the authenticated
            # probe, so a cold list of slow unresolved names still falls back.
            known_deadline = time.monotonic() + remaining / 2
            found.extend(self._known_candidates(known_deadline, skip))
            if not found:
                found = self._lan_candidates(deadline)
            self._candidate_cache = list(found)
            self._candidate_cache_at = time.monotonic()
            if found:
                self._last_code = None
            return found

    def argv_for(self, endpoint):
        if not isinstance(endpoint, Endpoint) or not self._known_hosts_has_pin():
            raise TransportError('HOST_KEY_MISSING')
        network = self.network
        null_device = 'NUL' if os.name == 'nt' else '/dev/null'
        args = [
            network['sshExecutable'], '-T', '-p', str(network['port']),
            '-F', null_device,
            '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes',
            '-o', 'UpdateHostKeys=no',
            '-o', f"GlobalKnownHostsFile={null_device}",
            '-o', f"UserKnownHostsFile={network['knownHostsFile']}",
            '-o', f"HostKeyAlias={network['hostAlias']}",
            '-o', f"HostKeyAlgorithms={network['hostIdentity']['keyType']}",
            '-o', f"ConnectTimeout={network['connectTimeoutSeconds']}",
            '-o', 'ConnectionAttempts=1',
            '-o', 'IdentitiesOnly=yes',
            '-o', 'PubkeyAuthentication=yes',
            '-o', 'PasswordAuthentication=no',
            '-o', 'KbdInteractiveAuthentication=no',
            '-o', 'PreferredAuthentications=publickey',
            '-i', network['identityFile'],
            '-l', network['user'],
            endpoint.address,
            'bash', '-s',
        ]
        return args

    def _refresh_scope_locked(self, deadline):
        self._stats['scope_reads'] += 1
        try:
            scope = self._enumerate_scope(deadline - time.monotonic())
        except TransportError as error:
            scope = None
            self._last_code = error.code
        except (OSError, ValueError):
            scope = None
            self._last_code = 'NETWORK_UNAVAILABLE'
        if scope is None:
            if self._scope is not None:
                self._scope = None
                self._scope_key_value = None
                if self._active is not None or self._candidate_cache is not None:
                    self._generation += 1
                self._active = None
                self._candidate_cache = None
            return
        key = _scope_key(scope)
        if key != self._scope_key_value:
            self._scope_key_value = key
            if self._active is not None or self._candidate_cache is not None:
                self._generation += 1
            self._active = None
            self._candidate_cache = None
        self._scope = scope

    def _enumerate_scope(self, remaining):
        if remaining <= 0:
            raise TransportError('SSH_TIMEOUT')
        try:
            result = subprocess.run(
                ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', _ENUMERATE],
                capture_output=True, timeout=min(8, remaining), check=False,
                creationflags=_hidden_flags(),
            )
        except FileNotFoundError:
            raise TransportError('NETWORK_UNAVAILABLE') from None
        except subprocess.TimeoutExpired:
            raise TransportError('SSH_TIMEOUT') from None
        except OSError:
            raise TransportError('NETWORK_UNAVAILABLE') from None
        output = _text(getattr(result, 'stdout', ''))
        if not output.strip():
            raise TransportError('NETWORK_UNAVAILABLE')
        try:
            parsed = json.loads(output)
        except ValueError:
            raise TransportError('NETWORK_UNAVAILABLE') from None
        rows = parsed if isinstance(parsed, list) else [parsed]
        scopes = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                alias = str(row.get('alias') or '')
                description = str(row.get('description') or '')
                if row.get('hardware') is not True or row.get('virtual') is True:
                    continue
                if _virtual(alias) or _virtual(description):
                    continue
                address = _usable_ipv4(row.get('address'))
                gateway = _usable_ipv4(row.get('gateway'))
                prefix = int(row.get('prefix'))
                if_index = int(row.get('ifIndex'))
                metric = int(row.get('metric') or 0)
            except (ValueError, TypeError):
                continue
            if address is None or gateway is None or not 1 <= prefix <= 32:
                continue
            scopes.append(_Scope(alias, description, if_index, str(address), prefix,
                                 str(gateway), metric))
        if not scopes:
            raise TransportError('NETWORK_UNAVAILABLE')
        scopes.sort(key=lambda item: (item.metric, item.if_index, int(ipaddress.IPv4Address(item.address))))
        return scopes[0]

    def _known_candidates(self, deadline, skip):
        targets = []
        seen = set()
        for address in [self.network['seedTarget']] + self.network['candidates']:
            if address not in seen and address not in skip:
                seen.add(address)
                targets.append(address)
        found = []
        for address in targets:
            if time.monotonic() >= deadline:
                self._last_code = 'SSH_TIMEOUT'
                break
            if found and deadline - time.monotonic() <= self.network['probeTimeoutSeconds'] + 1:
                break
            endpoint = self._verify_target(address, 'seed' if address == self.network['seedTarget'] else 'name', deadline)
            if endpoint is not None:
                found.append(endpoint)
        return found

    def _lan_candidates(self, deadline):
        lan = self.network['lan']
        if not lan['enabled']:
            self._last_code = self._last_code or 'NO_CANDIDATE'
            return []
        scope = self._scope
        if scope is None:
            self._last_code = self._last_code or 'NETWORK_UNAVAILABLE'
            return []
        if scope.prefix < 24:
            self._last_code = 'LAN_SCOPE_TOO_BROAD'
            return []
        if deadline - time.monotonic() <= 0:
            self._last_code = 'SSH_TIMEOUT'
            return []
        network = ipaddress.IPv4Network(f'{scope.address}/{scope.prefix}', strict=False)
        hosts = [str(host) for host in network.hosts() if str(host) != scope.address]
        self._stats['hosts_enumerated'] = len(hosts)
        if len(hosts) > lan['maxHosts']:
            self._last_code = 'LAN_SCOPE_TOO_BROAD'
            return []
        sweep_deadline = min(deadline, time.monotonic() + lan['wallSeconds'])
        found = []
        sweep = self._sweep_open(hosts, scope, sweep_deadline)
        try:
            for address in sweep:
                if time.monotonic() >= deadline:
                    self._last_code = 'SSH_TIMEOUT'
                    break
                endpoint = self._verify_target(address, 'lan', deadline)
                if endpoint is not None:
                    # The first pinned host is verified while the rest of the
                    # sweep is still running; closing the generator cancels the
                    # remaining task-owned probes so the authenticated
                    # connection-v1 probe keeps its budget.
                    found.append(endpoint)
                    break
        finally:
            sweep.close()
        if not found:
            self._last_code = self._last_code or 'NO_CANDIDATE'
        return found

    def _sweep_open(self, hosts, scope, deadline):
        """Yield TCP-open hosts as their probes complete.

        The per-probe TCP budget is derived from the remaining discovery wall
        and the number of concurrency batches, so a full /24 of blackholed
        peers cannot consume the wall before a late ascending host is reached;
        the keyscan/authentication reserve is held back. Closing this generator
        cancels queued probes and joins the in-flight ones before returning.
        """
        lan = self.network['lan']
        concurrency = max(1, lan['concurrency'])
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        # Keep keyscan/authentication time back without starving a short
        # discovery wall; the sweep may use at most half of a small wall.
        reserve = min(self.network['probeTimeoutSeconds'] + 1.0, remaining / 2)
        budget = remaining - reserve
        batches = max(1, (len(hosts) + concurrency - 1) // concurrency)
        tcp_timeout = min(self.network['connectTimeoutSeconds'], budget / batches)
        if tcp_timeout <= 0:
            return
        executor = ThreadPoolExecutor(max_workers=concurrency)
        pending = {executor.submit(self._tcp_open, host, scope.address, deadline, tcp_timeout): host
                   for host in hosts}
        opened = 0
        try:
            while pending and opened < lan['maxOpenHosts']:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                done, _ = wait(pending, timeout=remaining, return_when=FIRST_COMPLETED)
                if not done:
                    break
                for future in sorted(done, key=lambda item: pending[item]):
                    host = pending.pop(future)
                    self._stats['tcp_probes'] += 1
                    try:
                        if not future.result():
                            continue
                    except Exception:
                        continue
                    opened += 1
                    yield host
                    if opened >= lan['maxOpenHosts']:
                        break
        finally:
            self._stats['open_hosts'] = opened
            for future in pending:
                future.cancel()
            executor.shutdown(wait=True, cancel_futures=True)

    def _tcp_open(self, host, source, deadline, timeout):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(min(timeout, remaining))
            sock.bind((source, 0))
            return sock.connect_ex((host, self.network['port'])) == 0
        except OSError:
            return False
        finally:
            if sock is not None:
                try:
                    sock.close()
                except OSError:
                    pass

    def _verify_target(self, address, source, deadline):
        remaining = deadline - time.monotonic()
        timeout = min(self.network['probeTimeoutSeconds'], int(remaining))
        if timeout < 1:
            self._last_code = 'SSH_TIMEOUT'
            return None
        try:
            result = subprocess.run(
                [
                    self.network['keyscanExecutable'],
                    '-T', str(timeout),
                    '-p', str(self.network['port']),
                    address,
                ],
                capture_output=True, timeout=min(remaining, timeout + 1), check=False,
                creationflags=_hidden_flags(),
            )
        except FileNotFoundError:
            self._last_code = 'HOST_PROBE_UNAVAILABLE'
            return None
        except subprocess.TimeoutExpired:
            self._last_code = 'SSH_TIMEOUT'
            return None
        except OSError:
            self._last_code = 'HOST_PROBE_UNAVAILABLE'
            return None
        self._stats['keyscans'] += 1
        output = _text(getattr(result, 'stdout', ''))
        saw_type = False
        for line in output.splitlines():
            fields = line.strip().split()
            if len(fields) < 3 or fields[0].startswith('#'):
                continue
            key_type, key = fields[-2], fields[-1]
            if key_type != self.network['hostIdentity']['keyType']:
                continue
            saw_type = True
            try:
                blob = base64.b64decode(key, validate=True)
            except ValueError:
                continue
            digest = base64.b64encode(hashlib.sha256(blob).digest()).decode('ascii').rstrip('=')
            if (hmac.compare_digest(key, self.network['hostIdentity']['publicKey']) and
                    hmac.compare_digest(digest, self.network['hostIdentity']['sha256'])):
                return Endpoint(address, source)
        self._last_code = 'HOST_IDENTITY_MISMATCH' if saw_type or output else self._last_code
        return None

    def _known_hosts_has_pin(self):
        path = self.network['knownHostsFile']
        try:
            with open(path, 'r', encoding='utf-8-sig', errors='replace') as handle:
                data = handle.read(1024 * 1024)
        except OSError:
            return False
        alias = self.network['hostAlias']
        expected = {
            alias,
            f'[{alias}]:{self.network["port"]}',
        }
        matched = 0
        for line in data.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            fields = stripped.split()
            if len(fields) != 3:
                return False
            hosts, key_type, key = fields
            if hosts not in expected:
                return False
            if key_type != self.network['hostIdentity']['keyType'] or \
                    key != self.network['hostIdentity']['publicKey']:
                return False
            matched += 1
        return matched > 0

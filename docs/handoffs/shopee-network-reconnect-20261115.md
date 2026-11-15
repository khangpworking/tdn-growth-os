# Handoff — Shopee desktop native endpoint recovery

Updated: 2026-11-15
Branch/worktree: `feat/shopee-network-reconnect-20261115` · base `16d045818db7083685fd87edc412297594187762`

## Scope

Opt-in native Windows transport discovery for `tools/shopee-desktop`. Absent or
disabled `network` config keeps the existing six-key `sshCommand` legacy
semantics exactly. No remote CLI, service, business bytes, credentials, gates,
evidence, counts, pages or approval rules change.

Ownership:

- Primary writer: `tdn_shopee_transport.py`, `tdn_shopee_app.py`, `index.html`,
  UI harness tests, CI/test-gate wiring, this handoff.
- Secondary: `tools/shopee-desktop/tests/test_connection_recovery.py`
  exclusively. It adds independent transport/API/stream owner-boundary tests.
  Do not edit that file here.

No live network, SSH, known_hosts, config, daemon or deploy action is part of
this change. Root keeps all real addresses/users/keys/pins private.

## Config schema

Top-level keys remain exactly: `sshCommand`, `remoteScript`, `runsRoot`,
`presetsRoot`, `remoteEnvFile`, `timeoutSeconds`, plus optional `network`.

Legacy: omit `network`, or set `{"enabled": false}`; `sshCommand` is required.

Native: `network.enabled` is `true` (default when present). `sshCommand` may be
retained unchanged and is ignored (see below). Exact keys:

```json
{
  "network": {
    "enabled": true,
    "sshExecutable": "<absolute-or-path-to-ssh.exe>",
    "keyscanExecutable": "<absolute-or-path-to-ssh-keyscan.exe>",
    "user": "<fedora-user>",
    "port": 22,
    "identityFile": "<private-key-path>",
    "knownHostsFile": "<app-private-known-hosts-path>",
    "hostAlias": "<stable-logical-alias>",
    "hostIdentity": {
      "keyType": "ssh-ed25519",
      "publicKey": "<base64-host-public-key>",
      "sha256": "<base64-sha256-no-padding>"
    },
    "seedTarget": "<current-private-ipv4>",
    "candidates": ["<known-name>", "<known-name>.local"],
    "connectTimeoutSeconds": 3,
    "probeTimeoutSeconds": 4,
    "lan": {
      "enabled": true,
      "maxHosts": 254,
      "maxOpenHosts": 8,
      "concurrency": 32,
      "wallSeconds": 12
    }
  }
}
```

Validation rejects unknown keys, non-absolute local path shapes, unknown key
types, a `sha256` that does not match `publicKey`, non-IPv4 `seedTarget`,
unsafe names, and out-of-range caps. No private-key material is accepted in
config.

Native with retained legacy command (freeze correction, authority F575/header475,
not closed F574): with `network.enabled=true`, an existing valid `sshCommand` may
stay byte/value-unchanged. It is ignored for dispatch and never used as fallback
when native discovery or the native SSH attempt fails; deleting it is not a
condition of opting in. When `network` is absent or `{"enabled": false}`,
`sshCommand` remains required and is used exactly as before.

Candidate order: the last verified endpoint is re-checked first and, while its
pin still matches, returned alone so its authenticated `connection-v1` probe
runs before any seed/name scan (a slow or stale seed/name list cannot starve a
healthy cached connection). If that authenticated probe fails, the bridge spends
the remaining budget on one bounded rediscovery round over `seedTarget`,
`candidates` and bounded current physical IPv4 LAN TCP/22 candidates. During
fresh discovery an already verified candidate reserves `probeTimeoutSeconds` of
budget so later names cannot starve its probe. The physical source comes from
`Get-NetIPConfiguration` rows carrying `NetAdapter.HardwareInterface` and
`NetAdapter.Virtual`; a row must report `hardware` explicitly true and `virtual`
not true, so missing proof is never treated as physical. Loopback, link-local,
unspecified, multicast and reserved addresses are skipped, as are the existing
WSL/vEthernet/Hyper-V/VirtualBox/VMware/Tailscale/WireGuard/VPN/virtual name
heuristics. Selection is deterministic by interface-plus-route metric, interface
index and address. Only prefixes at least as narrow as /24 are enumerated, and
only when the host count fits `maxHosts`; larger networks return
`LAN_SCOPE_TOO_BROAD` rather than a broad scan. TCP probes bind to the selected
physical source.

LAN sweep budget (actual Windows repair, 2026-11-15): TCP-open hosts are
verified as their probes complete instead of after the whole sweep finishes.
The per-probe TCP timeout is derived from the remaining discovery wall divided
by the number of concurrency batches (`ceil(hosts/concurrency)`), capped by the
ordinary `connectTimeoutSeconds`; a keyscan/authentication reserve of
`probeTimeoutSeconds + 1` is held back (at most half of a short wall). This
keeps a mostly blackholed /24 from spending ~48 s before reaching a late
ascending host while leaving the ordinary native SSH `ConnectTimeout` unchanged.
The first pin-matching host ends discovery; queued probes are cancelled and the
in-flight TCP workers/sockets are joined (bounded by the derived timeout)
before discovery returns, so no probe work leaks into a later attempt. Only
nonpinned hosts continue to be scanned when an earlier open host fails the pin.

All native subprocesses (`powershell.exe`, `ssh-keyscan.exe`) run with
`CREATE_NO_WINDOW` on Windows so automatic health checks never flash a console.
No WSL, route, global SSH config, key or known_hosts mutation occurs.

## Module interface

`tools/shopee-desktop/tdn_shopee_transport.py` (standard library only):

```python
class TransportError(Exception):
    code: str

@dataclass(frozen=True)
class Endpoint:
    address: str
    source: str  # cache | seed | name | lan

def normalize_network(value: dict) -> dict

class NativeTransport:
    def __init__(self, network: dict): ...

    def find_candidates(self, deadline: float | None = None) -> list[Endpoint]
    def activate(self, endpoint: Endpoint) -> None
    def active_endpoint(self) -> Endpoint | None
    def dispatch_token(self) -> tuple[Endpoint | None, int]
    def argv_for(self, endpoint: Endpoint) -> list[str]
    def invalidate(self, generation: int | None = None) -> bool
    @property
    def last_code(self) -> str | None
    @property
    def stats(self) -> dict
```

`find_candidates(deadline)` only returns endpoints whose host key already
matches the configured pin. When no deadline is supplied it uses
`lan.wallSeconds`; the bridge passes one end-to-end monotonic deadline covering
adapter enumeration, TCP probes, keyscan and every authenticated `connection-v1`
attempt. Each subprocess and socket is bounded by the remaining budget; an
expired budget returns `SSH_TIMEOUT` instead of starting another minimum-length
probe or sweep. Key scanning performs no authentication and carries no app
payload. `argv_for()` first requires the configured private known_hosts file to
be exactly the pinned trust for one identity: every non-comment, non-blank
record must be one of the exact configured alias / `[alias]:port` rows with the
configured key type and raw public key. Any other record — hashed, wildcard or
comma alias, marker (`@revoked`, `@cert-authority`), extra key or malformed row —
is refused, because OpenSSH could otherwise trust an unpinned key. The file is
never rewritten. It then returns explicit argv with `StrictHostKeyChecking=yes`,
the private `UserKnownHostsFile`, `HostKeyAlias`,
`HostKeyAlgorithms=<pinned type>`, `UpdateHostKeys=no`, and public-key-only,
non-interactive authentication. No `accept-new`, no check disabling, no global
known-hosts/config mutation.

Static codes: `CONFIG_INVALID`, `NETWORK_UNAVAILABLE`, `LAN_SCOPE_TOO_BROAD`,
`HOST_PROBE_UNAVAILABLE`, `HOST_IDENTITY_MISMATCH`, `HOST_KEY_MISSING`,
`NO_CANDIDATE`, `NOT_SENT`, plus existing `SSH_FAILED`, `SSH_TIMEOUT`,
`REMOTE_OUTPUT_INVALID`.

## Bridge behavior

- `Api.connection()` is the only discovery/retry owner. Native mode runs one
  monotonically bounded attempt (`lan.wallSeconds`) covering enumeration,
  probing and authenticated `connection-v1` attempts, activates the first
  endpoint whose authenticated probe succeeds, and returns the existing shape.
  Concurrent calls share one in-flight attempt and its result. A failed native
  attempt is cached under capped exponential backoff (2, 4, 8, 15 seconds) at
  this boundary too, so neither the UI timer nor a second caller can re-run
  failed discovery immediately.
- All application dispatches, including `new/create`, `run/flow`, `m1/m2/m3`,
  saves, refresh/count starts, stop/reconcile and export, are one-shot. They use
  the shared active endpoint. If no endpoint is active, they return `NOT_SENT`
  without spawning. Ambiguous SSH failures are never replayed; later recovery
  may only read status/history.
- `_stream_export` uses the same active endpoint and never restarts a dropped
  stream. Existing digest/size/temp/atomic publish safety is unchanged.
- Any business transport failure invalidates the active endpoint so the next
  `Api.connection()` rediscovers. A network-scope or network-config change also
  invalidates the endpoint and cached probe. Invalidation is bound to the
  transport instance and activation generation captured at dispatch, so a late
  failure of an action sent on an old endpoint cannot clear a newer verified
  activation (even when the new activation reuses the same address); the old
  attempt is never replayed. The 0.75 s candidate cache keeps the full verified
  order (activated endpoint first) rather than only the activated endpoint, so a
  reconnect inside that window still fails over through the authenticated probe.
- UI automatically retries connection with bounded exponential backoff and one
  in-flight probe. While online it runs one bounded periodic dedicated health
  check (15 s timer, same singleflight promise) so an idle screen notices a
  network move without any user click; a healthy poll refreshes only the
  connection line, while presets/history/selection/detail hydrate on the initial
  and recovered transitions only. An unchanged healthy connection leaves the
  existing error bar, detail DOM and focused editor untouched; controls and
  detail are re-rendered only when `readonly`/`runsRoot` actually change. A
  failed health check stops business polls, disables stale writes and schedules
  the normal reconnect; the entered form, binding, pending module state and
  selection are preserved. Timers are cleared on unload. Recovery never replays
  an action. The header reports static state text only; no new control or
  styling.

## Operational note

With native enabled, an old legacy `sshCommand` IP may remain stale by design.
Operators resolve the host through the native profile/resolver and the verified
endpoint (`Api.connection()`), not the old WSL `sshCommand`. There is no
automatic legacy rewrite; updating the old value is optional cleanup, never part
of recovery.

## Verification ownership

- Primary: module/bridge/UI behavior and existing offline suites, plus ensuring
  the new Python suite is discovered by the existing desktop bridge CI command.
- Secondary: `test_connection_recovery.py` independent transport/API/stream
  owner-boundary proof: shared endpoint, identity gate, TOCTOU closure,
  one-shot dispatch, no replay. Existing export hash/size/temp/timeout tests are
  not duplicated.

Run Python tests with `-B` or `PYTHONDONTWRITEBYTECODE=1`. Remove only
task-created `__pycache__` in this lane when closing.

## Secondary result

`tools/shopee-desktop/tests/test_connection_recovery.py` (19 cases, sha
`1eec5a84…`) drives the real `Api`/`_stream_export` and
patches only `subprocess.run`, `subprocess.Popen` and `socket.socket` with
`unittest.mock`; no constructor injection hooks. Final green: 19 cases
`1eec5a84…` on app `1329dfc3…` / transport `da5d14fd…`
(`*-logs/secondary-py-19-final-budget.log`, 1.358 s). Superseded green: 18 cases
`ed7bf4c6…` on `1329dfc3…`/`271da6d6…`; 17 cases `ee270b4b…` on
`cac9c6c7…`/`7f947a0e…`; 16 cases `9b70b4c3…` on `d7d5e36c…`/`8ebe7cb8…`.
Transport `271da6d6…` is superseded by the LAN-sweep budget repair; Root's live
proof must use `da5d14fd…` once reviewed.

New contracts from the final Sol review, red at the intended guards on
`7f947a0e`/`cac9c6c7` (`/tmp/secondary-python-red-4gaps.log`, 3 failures):

- Cached health budget: after a successful connection to cached endpoint B, a
  deliberately slow stale seed plus 8 slow unresolvable names consume the whole
  wall; `Api.connection` must still authenticate B within the deadline instead
  of returning `SSH_TIMEOUT`. Fails pre-fix with `SSH_TIMEOUT` and no B auth.
- Cold bounded fallback: with no healthy cache, the same slow stale seed/names
  are capped to half of the remaining wall, leaving budget for the physical-LAN
  sweep and its authenticated probe. `Api.connection` still connects through the
  LAN host and total fake-clock time stays within `lan.wallSeconds`; pre-fix the
  known-name phase consumed the wall and LAN was never attempted.
- Exact pin file: the existing negative case now also adds `* <unpinned-key>`
  and `<alias>,other <unpinned-key>` rows next to the exact pin row. OpenSSH
  would trust those extra keys, so the app-private file must refuse before any
  RPC (`HOST_KEY_MISSING`, no SSH call, file unchanged). Both rows currently
  pass the check and connect.

Windows LAN-sweep budget contract (one actual `Api.connection` case, after the
real 12.021 s `SSH_TIMEOUT` with 0 native SSH): fake sockets honor
`settimeout` and blackhole 253 peers while pinned host `192.168.1.250` stays
late in ascending /24 order; `connectTimeoutSeconds` stays 3, concurrency 16,
wall 2 s. Corrected owner derives a per-TCP timeout from the remaining
discovery budget, verifies yielded opens promptly, returns on the exact pin
match, and joins task-owned workers/sockets before discovery returns. Asserts
connected, real elapsed under the wall, SSH/keyscan/scan all on the pinned
host, `active_sockets == 0` and `max_active <= 16`. Red on `271da6d6…` and
early-yield `1f49d271…`: `SSH_TIMEOUT`, ~2.0 s, no pinned auth
(`*-logs/secondary-py-late-red-271.log`, `secondary-py-late-red-earlyyield.log`).
The earlier `.77` keyscan requirement was incidental and is not preserved;
the stale-endpoint case now asserts the pinned/seed hosts that are actually
probed. The duplicated cold slow-name block was removed from the cached test;
the first cold proof remains in the stale-endpoint owner.

Fixture scopes now carry explicit `hardware: true` / `virtual` proof to match
the narrow physical-selection contract; the WSL row is marked virtual.

Prior contracts (still covered): stale-IP LAN recovery shared with dispatch,
WSL adapter exclusion, pin mismatch before RPC with no pin rewrite,
keyscan-match/SSH-mismatch no replay, NOT_SENT without discovery and pin recheck
at dispatch, ambiguous mutation timeout with one dispatch only, export over the
shared endpoint without restart, exact legacy command, native-with-retained
`sshCommand` native-only with no fallback, end-to-end deadline bounds repeated
authenticated-probe timeouts, healthy poll re-verifies without a full LAN scan,
concurrent connection calls never overlap authenticated probes, API-boundary
backoff past the 0.75 s cache, hidden Windows creation flags, link-local never
the scan source, and the lifecycle race below.

Lifecycle race (one canonical case, no retry matrix): a real `stopReviewAttempt`
dispatch is blocked at the fake OS boundary on endpoint A; a dedicated
`Api.connection()` re-verifies A as dead and activates B; the blocked old attempt
then times out with `SSH_TIMEOUT`; exactly one mutation dispatch occurred; the
next `presets` read still uses B with no new keyscan or discovery; a late old
failure never clears B and the action is never replayed. The test advances the
fake monotonic clock 1.0 s after the block so the recovery connection runs past
the 0.75 s candidate-cache window (the cache also keeps verified candidate order
on current sources, so the authenticated probe on A fails and B is activated
normally). Negative control: restoring blind `transport.invalidate()` (or
truncating the cache to the activated endpoint in `activate()`) in a scratch
copy fails at the post-timeout `active_endpoint()` assertion.

Coordination: final affected suites (including Vitest/UI) run only after the
secondary Python file and primary source/UI are frozen, with no concurrent
edits. This green result binds the hashes below; if app/transport change, the
suite must be re-run and hashes re-reported.

## Primary final frozen verification

Actual Windows evidence (Root, 2026-11-15): the approved isolated READONLY
`Api.connection` positive on transport `271da6d6` / app `1329dfc3` returned
`SSH_TIMEOUT` at 12.021 s (outer 12.169 s) with 1 PowerShell, 1 keyscan and 0
native SSH calls on a real profile (one physical /24, valid existing ed25519 pin,
seed = Windows own stale IPv4, no candidates, connect 3 s / probe 1 s, LAN
caps 256/8/16, wall 12 s, RPC timeout 30 s). The orthogonal wrong-pin control
passed in 3.630 s with exact `HOST_IDENTITY_MISMATCH`, 1 keyscan and 0 SSH, all
hidden and no data change. Root cause: `_tcp_sweep` withheld every open host
until all 253 futures (or the whole shared deadline) completed, so ~48 s worst
case preceded any pin verification. The failed positive and both raw results are
preserved; no default config, UI, provider or production mutation was made.

Repair and freeze (2026-11-15, after the Root failure and clarification): the
LAN sweep now yields open hosts as probes complete and verifies the first exact
pin promptly; the per-TCP prefilter timeout is derived from the remaining
discovery wall over concurrency batches, reserving keyscan/authentication time;
queued probes are cancelled and in-flight workers joined before discovery
returns. The ordinary native SSH `ConnectTimeout` is unchanged. The previous
UI closures (healthy poll preserves error bar, detail DOM and focus) stay frozen;
this batch adds only a test-side hydration-gate proof (no product bytes). No
concurrent edits; the binding runs are in
`/home/pkhang/lanes/shopee-network-reconnect-20261115-logs/`.

| File | sha256 |
|---|---|
| `tools/shopee-desktop/tdn_shopee_transport.py` | `da5d14fd…` |
| `tools/shopee-desktop/tdn_shopee_app.py` | `1329dfc3…` |
| `tools/shopee-desktop/index.html` | `a4677f9b…` |
| `tests/integration/shopee-desktop-ui.test.ts` | `b7ebf83f…` |
| `tools/shopee-desktop/tests/test_connection_recovery.py` | `1eec5a84…` |

- `final-python-tests-lan-budget.log`: 70 tests, OK (includes all 19 recovery
  cases).
- `final-ui-tests-hydration-gate.log`: 81 tests, 81 pass, 0 fail on the updated
  UI test `b7ebf83f…` with source `a4677f9b`/`1329dfc3`/`da5d14fd` unchanged.
- App `1329dfc3`, HTML `a4677f9b` and the UI test bytes changed only in the
  test file (`f03b32d5…` → `b7ebf83f…`); Python sources are unchanged from the
  frozen LAN-budget repair. Root's new live positive admission must use
  transport `da5d14fd` with app `1329dfc3`; the old `271da6d6` admission does
  not cover this repair.
- New owner regression `test_late_lan_host_connects_within_wall_despite_blackholed_peers`:
  real monotonic wall, fake OS sockets that honor `settimeout` for blackholed
  peers, concurrency 16, one promptly open pinned host late in ascending /24
  order (`192.168.1.250`) under a 2 s LAN wall. It asserts connection within the
  wall, bounded in-flight sockets, and `active_sockets == 0` when discovery
  returns.
- Raw red/green: `late-lan-red-no-derived-budget.log` fails `SSH_TIMEOUT` at
  2.004 s when the per-TCP timeout falls back to the raw 3 s connect timeout;
  `late-lan-green-derived-budget.log` connects in 1.005 s. The red run used a
  temporary one-line revert restored byte-identically (`sha256sum` verified).
- The duplicate cold-fallback block was removed from the cached-endpoint test;
  the strong first owner cold-fallback proof stays there. The incidental
  `OTHER_BLOB` `.77` keyscan expectation was removed from the stale-endpoint
  test because the pinned host now ends discovery; the separate pin-mismatch
  test owns that gate.
- UI case retains the idle-online journey plus the module-failure/error-bar,
  detail-node and focus preservation with no action replay. Its negative
  control (old unconditional `renderConnection(); clearError();`) fails at
  `timeout waiting for module failure shown in the error bar`.
- The same idle-online case now proves the hydration gate itself: before
  resolving the held status gate it waits until the recovered selected-run
  status call has actually been dispatched to that gate (`statusCalls >= 3`),
  then asserts create (`btnNew`), the M1 module action, the entered draft and
  the run-b selection all keep their pending state while hydration is still
  blocked. Only after those assertions does it resolve the gate, and it then
  asserts create and the M1 action are re-enabled by authoritative hydration.
  Negative control `red-ui-hydration-gate.log` (temporary one-line removal of
  the `!state.connectionHydrating` guard in `renderConnection`, restored
  byte-identically to `a4677f9b…`) fails exactly at
  `create stays disabled while fresh hydration is pending`. The guard already
  exists in the frozen source, so no product change was needed.
- Local runs used a temporary `node_modules` symlink to the main worktree because
  this lane has no installed dependencies; hosted CI performs its own install.
  The symlink is removed after verification and is not part of the diff.
- The hosted gate already runs the existing Python discover command and the UI
  Node test; the new suite is auto-discovered, so no new job or framework was
  added.

Not committed; Root repeats the Windows positive only on this reviewed source.
Final Sol code review / full release CODEPASS still pending.

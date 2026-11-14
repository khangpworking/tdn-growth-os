# Handoff — Shopee bridge: keep the created run identity when entry is unavailable

Updated: 2026-11-15
Worktree/branch: `/home/pkhang/lanes/shopee-edge-bridge-20261115` · `fix/shopee-edge-bridge-20261115` · base `4c9320ba34fe2b9a4b8f314a7c4f309952f62167`

## Completed

`Api._new_run` used to return the entry failure as if creation had failed. Once
`new-run-v1` with a valid `runId` was verified, a transport timeout, explicit
entry error, unsafe code, or malformed handoff made the whole call `ok:false`
and dropped the created identity, so the UI could allow a duplicate create.

The bridge now keeps the exact created `runId` and reports a pinned partial
shape when entry is unavailable after verified creation:

```json
{"ok": true, "data": {"runId": "<exact created id>", "entry": null,
  "entryError": {"code": "<static safe code>", "message": "<same static code>"}}}
```

Normal success is unchanged: `{"ok": true, "data": {"runId": ..., "entry": <handoff-v1>}}`.

## Root cause

Pre-fix `_new_run`:

- `entry = self._remote('entry', ...)`; a `_BridgeFailure` (for example
  `SSH_TIMEOUT`) propagated to `_safe`, whose result is only
  `{"ok": false, "error": {"code": "SSH_TIMEOUT", ...}}` — `run_id` lost.
- `if not entry['ok']: return entry` returned the entry error and also lost the
  verified creation.
- A non-`handoff-v1` entry raised `REMOTE_OUTPUT_INVALID`, again losing identity.

The creation itself had already succeeded remotely; only the entry probe failed.

## Protected invariants

- Every pre-creation failure keeps its existing behavior: argument/date checks,
  calendar availability, config load, new-run transport errors, invalid
  `new-run-v1` format, and invalid `runId` still return or raise exactly as
  before. No partial shape is produced without a verified creation.
- Normal success returns the original handoff shape and the real entry verdict.
- Only existing `_STATIC_ERROR` codes are preserved; anything else falls back to
  `REMOTE_OUTPUT_INVALID`. No raw traceback, SSH text, or remote body reaches JS.
- No fake entry, no fake PASS, no automatic retry, no second create, no automatic
  entry retry. Unrelated programming faults are not caught.
- Gate policy, capture-spec checks, resume eligibility, policy/cap semantics, and
  stored evidence are untouched.

## Changed paths

- `tools/shopee-desktop/tdn_shopee_app.py`
- `tools/shopee-desktop/tests/test_bridge.py`
- `docs/handoffs/shopee-edge-bridge-20261115.md`

## Evidence

Primary owner-boundary test:
`BridgeTest.test_created_run_keeps_its_identity_when_entry_is_unavailable`
drives the real `Api` and real CLI through `bash -s`, intercepting only the
entry transport. Four subtests: transport timeout, explicit entry error, unsafe
entry code (`bad code!` → `REMOTE_OUTPUT_INVALID`), malformed entry format.
Each asserts exactly one new call and one entry call (no retry), the exact
partial shape, the exact created run directory as the only new run, and
`entry: null` (no fake PASS).

Red (pre-fix, intended failure: identity lost, 4 subtest failures):

```sh
python3 -m unittest discover -s tools/shopee-desktop/tests -p 'test_bridge.py' \
  -k keeps_its_identity -v
# FAILED (failures=4); timeout returned ok:false SSH_TIMEOUT, etc.
```

Green (post-fix):

```sh
python3 -m unittest discover -s tools/shopee-desktop/tests -p 'test_bridge.py' \
  -k keeps_its_identity -v
# Ran 1 test ... OK

python3 -m unittest discover -s tools/shopee-desktop/tests -p 'test_bridge.py' -v
# Ran 15 tests ... OK

python3 -m unittest discover -s tools/shopee-desktop/tests -p 'test_*.py' -v
# Ran 51 tests ... OK

git diff --check
# clean
```

Raw red/green outputs are outside Git in
`/home/pkhang/lanes/shopee-edge-bridge-20261115-evidence/`.
`sourceCalls=0`, `productionMutations=0`; no provider, Metric, calendar, Shopee,
Jev, or paid call; no run creation outside isolated temp roots.

## Unresolved

None for the bridge scope. The UI writer owns `index.html` and is covering the
independent consumer contract for the pinned partial shape.

## Next action

Exact Sol review of the unpushed diff. No push, merge, deploy, or restart.

## Business decisions pending

None.

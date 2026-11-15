# Handoff — shopee startup bridge readiness

Updated: 2026-11-15
Worktree/branch: `~/lanes/shopee-startup-bridge-20261115`, `fix/shopee-startup-bridge-20261115`, base `b434d951a38e9aa080e12103b2d60fe4d5f27a73` (tree `63472121727e72bafb671c6c74ce7cdc1a9e3ec3`).

## Completed

Minimal HTML readiness repair in `tools/shopee-desktop/index.html`:

- `bridgePresent()` now requires `window.pywebview.api.connection` to be callable, not merely a truthy `api` object.
- The existing `pywebviewready` listener, 100 ms poll and unchanged 20 s `BRIDGE_WAIT_MS` bound are reused; no retries or new mechanisms.
- `call()`, its error/shape behavior, and all UI hydration, business and static markup are unchanged.
- No Python, transport, test or configuration changes were made by this lane writer.

## Evidence

Controlled Windows phase-hold trace (Root evidence `R/diagnostics/phase-hold-v1/actual-controlled-gui-trace`):

- Entry wrapper `f576_phase_hold_entry.py`: `5e740ed71449b88dd7165d7f59f9c1253ad41c77059f1f0fe1c5745f95ccff7a`.
- Controlled Windows artifact actually launched: `5df0a95e12c2fac6dd93bcdd52a91484ad6c8b506b6d301e00a9b1f8706b61fe` (Root Windows file, not present on Fedora).
- One 500 ms hold observed at 0.502 s, with actual `TypeError: APPLY_ON_UNDEFINED_METHOD`, method `connection`, `methodType`/`connectionType` undefined and `apiKeyCount` 0.

This is explicitly fault-injected 6.2.1 lifecycle proof; it does not establish the natural 62de cause. The natural catch-only run did not reproduce; the original GUI `BRIDGE_ERROR` remains historical held evidence. Readiness after the repair: pywebview sets `api:{}` synchronously before `_createApi`; `_createApi` populates all methods synchronously before `pywebviewready`.

## Verification on the frozen pair

Frozen product HTML `7bb3e7a294e73b77052dc6d42484b2a86b626bfd0cc5acce10f78e57f5cf1ea3`; frozen test `ebe2449eb7e7b749ee860f34283cc185cd4f7c9a237644be12c22b5944f36b0b`.

Full canonical UI suite on Node 22.23.2:

```bash
node --import tsx --test tests/integration/shopee-desktop-ui.test.ts
```

Exit 0; `# tests 82`, `# pass 82`, `# fail 0`, `# cancelled 0`, `# skipped 0`, duration 18166.323421 ms. Raw log outside Git: `~/lanes/shopee-startup-bridge-20261115-logs/f576-frozen-ui-7bb3e7a2-ebe2449e.log`, SHA-256 `0b9d55cbfaf3b1ead491056aad73f71fcfc47a41ac67093e626ad9d1c324b14c`.

Canonical baseline RED on the same test bytes: `~/lanes/shopee-startup-bridge-20261115-logs/f576-bridge-canonical-red.log`, SHA-256 `283bbc813d3a7332bf934a20c42cc507e906c6b74e2e368620b8d207d8622db1`; 1 test, 0 pass, 1 fail at the intended assertion: `the completed bridge was never used after startup; startup surface=BRIDGE_ERROR`.

`git diff --check` passes. Unchanged: `tdn_shopee_app.py` `1329dfc372596b534659cb917c5a30c3633f68f3afa8e94fae317724eb4a7ac9`; `tdn_shopee_transport.py` `dc220c56a8fad4232142427ff6a268c56eaa8c507be655aab88717068f6af95a`.

## Changed paths

- `tools/shopee-desktop/index.html` — before `a4677f9b155cabfac99d6210c34af7dc706fd8dfc5680b961d6a47a34ea407c1`, after `7bb3e7a294e73b77052dc6d42484b2a86b626bfd0cc5acce10f78e57f5cf1ea3`; diff is only the `bridgePresent` predicate.
- `tests/integration/shopee-desktop-ui.test.ts` — secondary-owned canonical owner case; frozen at `ebe2449eb7e7b749ee860f34283cc185cd4f7c9a237644be12c22b5944f36b0b`; not edited here.
- `docs/handoffs/shopee-startup-bridge-readiness-20261115.md` — this handoff.

## Next action

Root builds the normal artifact from the exact commit for one GUI launch alongside the baseline; no further diagnostics. Sol administers Git after exact proof review. No commit, push or production action from this lane.

Business decisions pending: none.

# Localhost testing without manual OWNER unlock

Owner-approved on 2026-10-01. Controlled scope: local authorization transport,
not a new authentication system or a change to business authority.

## Acceptance

- Default operation still requires the existing manual, memory-only token.
- `TDN_OWNER_API_LOCAL_TEST=true` requires OWNER writes enabled, an explicit
  server-owned actor and the existing exact loopback binding.
- The integrated runtime generates a strong ephemeral bearer for its own
  lifetime. A supplied persistent token is not returned to the browser and is
  not the active bearer in this mode. Standalone APIs are unchanged.
- The real frontend learns the mode from health and POSTs an empty JSON object
  to `/owner-api/local-test-session`. The bootstrap requires exact Host/Origin,
  rejects cross-site and forwarded requests, is uncached and does not mutate
  the database or invoke providers. Protected routes still require a bearer.
- Automatic access remains in React memory only. Reload obtains access again;
  bootstrap failure leaves controls locked with a retry action, not demo data.
- Keep the normal unlock form and Lock action outside test mode. In test mode
  show `Test local · OWNER tự động · Thay đổi được lưu thật`; no misleading
  Lock action is shown for a mode that automatically grants access.
- Demo never bootstraps real authority. Startup/page load creates no business
  record, approval, research run, AI call or paid action.
- Preserve domain services, actor capabilities, confirmations, prerequisites,
  lineage/retry semantics, B9 immutable locking and the executor lock.
- No migration, dependency or canonical business-contract change.

## Test authoring gate

The HTTP boundary owns default-off behavior, bootstrap request restrictions,
ephemeral bearer acceptance, rejected credentials and the one explicit
synthetic workspace mutation. Existing domain tests already own B7–B10;
do not duplicate them here. Credible regressions are an exposed grant route,
unguarded transport, reuse of a persistent credential, or bypassed bearer.

The mounted frontend owns pending/failure/retry controls, reload reacquisition,
normal/demo isolation and memory-only state. Existing client tests do not
exercise App effects, so one mounted lifecycle test owns this flow. The client
boundary separately owns rejecting malformed responses. No test-only exports
or application dependency are needed.

One small Linux browser acceptance verifies the browser-generated Origin,
real bundle/runtime integration, one explicit synthetic persisted creation,
reload, normal-mode restoration and desktop/mobile layout. It does not replay
the whole business workflow. Existing full Linux Check remains the release
gate. No tests, typecheck, build or browser execution run on Windows.

## UX direction and limits

Preserve the approved TDN navy/teal/blue Operate surface. ENERGY 1 / RHYTHM 1 /
MOTION 1 for this access strip: predictable status in the existing banner,
no new layout, animation, icon or asset. The functional label distinguishes
test authority from synthetic demo and warns that writes persist. Reuse the
existing keyboard-accessible button and focus treatment for failed-bootstrap
retry. Impeccable context and Antislop are applied during implementation.

Loopback checks are not production authentication and cannot detect a tunnel
that deliberately strips forwarding headers. Do not publish or forward this
runtime. For Cloudflare/domain deployment, disable local testing and design
the separately planned login/access policy first. Testing mode grants access,
not authorization for an agent to call a live provider or alter real records.

## Release

Publish a scoped draft PR and require exact-head Linux proof before merge.
Fedora activation is separate from preparation: preserve the actual database,
artifacts and actor, finish unsaved edits, gracefully stop only the verified
executor, use the established recovery procedure and start the reviewed build
with the flag. This feature adds no schema migration. Turning the flag off
and restarting restores normal manual unlock; retain the old private token
file without exposing its contents.

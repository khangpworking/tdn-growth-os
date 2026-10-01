# Local OWNER testing convenience — PR #105

Repository: `khangpworking/tdn-growth-os`.
Branch: `feature/local-test-owner-session`.
Required starting main: `a5b1757e6805215adb08392930b7025d643f55eb`.

## Scope

The owner approved removing manual token entry for localhost testing only.
`TDN_OWNER_API_LOCAL_TEST=true`, together with enabled OWNER writes and an
explicit server actor, grants process-scoped authority to the same-origin UI.
The normal mode and standalone API behavior remain unchanged.

The persistent token is not returned to the browser or accepted as the active
credential in testing mode. The random process token stays in React memory,
not DOM, cookies or browser storage. Reload obtains access again. Health and
session failure leave controls locked with an in-page retry; workspace drafts
are not discarded by retry.

Business confirmations, exact versions, B7–B10 prerequisites, immutable history,
the B9 lock and the single-executor database lock remain unchanged. Bootstrap
creates no business record or provider/AI call. Persisted user writes remain real.

## Independent review and corrections

A read-only independent logic review found one missing recovery path: health
failure happened before the local-testing flag was known, so the retry button
was hidden. The UI now offers a neutral authority-check retry in that state.
The existing mounted lifecycle test covers unreachable and malformed health,
locked controls, successful retry and preservation of unsaved input.

Initial full Linux Check exposed three older exact health assertions that did
not include the new boolean and a Host test whose fetch client replaced the
supplied Host. The assertions now include the explicit mode. The Host denial
probe uses an actual mismatched wire header via Node HTTP; no guard was relaxed.

## Linux evidence and release gate

On `d3f1e0661e06830936dd28f0f569686431721eea`:

- [Check](https://github.com/khangpworking/tdn-growth-os/actions/runs/36847034146):
  contract generation, strict backend/frontend TypeScript, production build,
  186 frontend tests and 705 repository tests passed.
- [Production browser acceptance](https://github.com/khangpworking/tdn-growth-os/actions/runs/36847034110):
  automatic OWNER, one explicit synthetic workspace creation, reload persistence,
  no browser credential storage, isolated demo, restored normal/manual mode,
  desktop/mobile layout and no page/console errors passed.

The failed-health correction follows this checked head. Before merge, require
both Check and Local OWNER testing acceptance on the exact final PR head.
The acceptance workflow proves the new retry test fails on the reviewed
pre-fix page for the intended reason, in a disposable worktree, and validates
the final production bundle. Final-head links and review disposition belong
in the PR handoff comment; do not reuse the earlier pass as final-head proof.

The approved navy/teal/blue layout, typography, navigation, assets and motion are
unchanged. The access strip reuses existing status and keyboard focus styling;
only a functional warning and retry control were added. Desktop and 390px
mobile screenshots were visually inspected. Static Antislop detection found
no issue in the changed App markup; this is not a whole-application design or
security certification.

No Windows tests, typechecks, build or browser execution were run. No migration,
canonical business contract, domain service, dependency or lockfile was changed.
No live records, credentials, runtime artifacts or private data were committed.

## Fedora boundary

Nothing was merged or activated by this handoff. Prepare a separate release
checkout, but require the separately approved operator update window before
stopping or restarting the active process. Preserve the actual database,
artifact root, actor and private token file. This feature itself adds no schema
migration; any earlier research release schema gap still requires preflight.

Keep exact loopback binding and never forward this testing runtime through a
domain, Cloudflare, LAN listener or tunnel. Header checks cannot detect a proxy
that strips forwarding headers. Restore manual unlock by disabling the flag
and restarting with the existing private token; never print or paste it.

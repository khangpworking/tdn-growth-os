# Task 046 — focused B7–B10 frontend UX correction

Base: fetched `origin/main` at `ab099f33ba1634d60f2209efee9af9637c4ac458`.
Branch/worktree: `feature/046-b7-b10-ux-correction` in dedicated Task 046 worktree.

## Findings

- One shared right sidebar exposed B8 mutations on B9/B10.
- B9 used English/technical states, did not clearly distinguish save from lock, and Save appeared enabled without clearance while its handler returned.
- B10 showed raw `readyForB11` booleans and did not persistently explain the locked-STP prerequisite.
- B7 PASS copy ignored an existing verified product projection; HOLD had no contextual path to the correct family/version form.
- Basket rows mixed labels, versions, decisions, timestamps, identifiers, and actions in one dense block.
- Historical B8 clearance mismatch copy could imply current lane failure even when all current lanes remained PASS with newer IDs.
- Touched dialogs lacked one consistent focus trap/return implementation.

## Corrections and acceptance

- [x] B8 controls render only on B8; B9/B10 use route-specific panels.
- [x] B9 copy covers NOT_STARTED, saved WORKING, local dirty, and LOCKED; Save and Lock explain exact blockers and use matching guards.
- [x] B10 remains viewable before lock but decisions remain disabled; inline copy links back to B9 and explains approved/B11 status.
- [x] HOLD “Xem xét lại” opens the existing basket form for the exact family and next sequential version, with editable preselection and explicit confirmation; opening is state-only.
- [x] B7 product-workspace copy comes from the verified projection.
- [x] Basket content is split into candidate, summary, frozen/current version, decision/time, and action blocks without visible UUIDs in the primary workflow.
- [x] Historical clearance remains valid and copy distinguishes changed IDs from lane outcomes without inventing reapproval.
- [x] Product navigation keeps `aria-current`, scrolls active mobile item into view, respects reduced motion, and all route navigation keeps the dirty-draft guard.
- [x] Shared touched confirmation dialog supports initial Cancel focus, Tab/Shift+Tab containment, Escape/cancel, backdrop cancel, and focus return.
- [x] Demo remains explicitly synthetic and OWNER API calls remain isolated to real mode.

## Boundaries

No database or artifact was opened, migrated, or written. The running operator was not restarted or replaced. No real B7–B10 action was submitted. No backend policy, API, auth, network binding, firewall, provider, or Windows behavior changed.

## Verification

- Frontend typecheck, 55 frontend tests, production build, and 303 backend/unit/integration tests pass.
- One normal release check was run. Its only failing stage was the first backend-test attempt after dependencies had intentionally been installed with lifecycle scripts disabled; rebuilding the local `better-sqlite3` binding made that exact test stage pass in full.
- The bounded Chrome pass used synthetic demo state only at desktop 1440×1000 and mobile 390×844. Screenshots are in `docs/handoffs/046-screenshots/`.

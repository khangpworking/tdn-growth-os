# Shopee desktop feedback and Vietnamese copy

The desktop form defaults to the last completed local calendar day. Its Python
bridge rejects malformed dates and a new run ending today or later before SSH.
`END_DATE_NOT_COMPLETED` identifies that refusal. This uses the desktop host's
local date; historical requests and remote entry/gate rules are unchanged.

The existing `runs-v1.runs[].request` now provides the same frozen request
projection as run details, excluding `captureSpec`. The list can display the
saved periods and quantity alongside the stable keyword/first-start name.
Legacy caps and unknown metadata remain distinguishable.

The owner accepted B1: after a current-draft creation returns a run identity,
lock the product, date, policy and create controls. Keep creation and starting
as two actions. `Tạo lượt khác` opens an editable draft, clears the previous
launch binding/readiness/confirmation and focuses an editable field; it may
retain the saved product. Preserve all old runs and history. A created run
whose entry check fails stays visible and cannot start until its prerequisites
pass. Saving a product followed by failed run creation leaves the draft
editable and retains that product. Late responses from a previous draft must
not lock or select the current draft. Keep asynchronous generation guards even
while fields are locked. Whole-flow confirmation is invalidated by any draft
or binding change and can start only its exact frozen run.

One additional-collection button can call `saveReviewPlan(runId, policy)` then
`runModule(runId, 'm3', exactSavedPlanSha256)`. The UI must invalidate a pending
launch after an edit or run change and prevent double clicks. Immutable plans,
M2/request checks, execution identities, Stop/reconcile and history remain intact.

Progress uses the authoritative execution view and observed counts from the
same attempt's validated checkpoints. An unobserved count stays unknown. No
percentage, ETA or current-link index is available; legacy collection can show
step status without live counts. No new progress endpoint is added.

The owner chose JSON/TXT for this round. CSV/XLSX are deferred by owner; export
formats, dependencies and eligibility are unchanged. Hide/delete/archive
behavior is out of scope; B7 success/completeness criteria remain deferred. All modes remain
text-only, including all star levels and selected stars; existing partial PASS
rules are preserved.

Backend owns the bridge date guard and list metadata. Other owners implement
HTML/copy and all regression tests. Verification uses synthetic isolated data;
no live collection, production write, migration or deployment is authorized.

## Validation before review

The frozen implementation passed 47 DOM integration tests and 28 Python desktop
bridge tests. The Python flow suite ran 97 tests with 3 existing skips and no
failures; repository typecheck passed. Evidence records the assigned worktree
and unchanged source/test hashes. Earlier ambiguous working-directory reads
are excluded from final evidence. Regression proofs use source from base
851cb6f9 with the final tests in an isolated snapshot.

Synthetic browser interaction confirmed initial product summary, exact new-run
tracking, form locking, cancel-before-start and the new-draft focus/reset.
Final headless layout inspection, CI and independent exact-head review are
release checks. Native Windows/WebView2 behavior is not inferred from DOM or
headless results. No production deployment or live collection was performed.

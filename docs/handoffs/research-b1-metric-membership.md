# B1-A: Metric membership proposals and selected acceptance

Checkpoint: 2026-10-04. Unreleased worktree on baseline
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`, existing draft PR #110.
This is backend/API delivery, not classified report delivery or real OWNER acceptance.

## Delivered boundary

- Separate immutable proposal and explicit OWNER-selected receipt. Proposal
  creation never accepts an assignment, starts a worker or changes a report.
- Closed request/artifact and safe response schemas with generated types.
  Actor and timestamp originate from the trusted server context.
- Bind exact workspace, run, report pair, preparation, normalized input,
  source package, confirmed scope and full rule adoption digest.
- Keep all original records visible. Unselected records remain PENDING with
  no effective classification. Accepted UNKNOWN is a disposition, not absence.
- Validate the entire selected batch before writing; reject cross-source keys,
  competing accepted proposals, superseded rules and stale report pairs.
- Overlapping selections from the same proposal retain the first membership
  receipt without double counting. Changed-content retries do not publish files.
- Historical receipt reads verify only the selected membership and its exact
  dependencies. Current coverage verifies every contributing receipt and the
  complete persisted projection. Neither read recalculates nor repairs evidence.
- A new report pair does not silently inherit an old pair's approval, even
  when it reuses the identical preparation. Explicit frozen acceptance references
  for classified report revisions are the next integration step, not present here.
- Request-owned staging publishes only the committed artifact digest. An exact
  authorized retry can restore missing bytes from verified immutable persistence;
  corrupt bytes, missing membership rows and changed requests remain failures.

## Routes

Under `/owner-api/workspaces/:workspaceId/research-automation/runs/:runId`:

- POST `/metric-membership-proposals`
- POST `/metric-membership-receipts`

Under the corresponding read-only `/api` prefix:

- GET `/metric-membership/:pairId/:adoptionId`
- GET `/metric-membership-proposals/:proposalId`
- GET `/metric-membership-receipts/:receiptId`

Writes use existing token/Origin/body-limit boundaries; safe projections omit
actor identities and internal artifact paths. Record keys are source-locator-bound
technical keys, not invented provider/listing IDs.

## Storage and files

Migration `0044_analysis_metric_membership.sql` adds three append-only Analysis
tables with pair-scoped membership and SQL identity guards. SHA-256:
`034dddc40a7130b2be6e84380e01a902e475eaac0b605df8df5ff98ac4df2289`.
Previously tracked migrations remain unchanged. No live migration was run.

Production owner: `src/modules/analysis/research-automation/metric-membership.ts`.
Service/API wiring is in the existing automation service and API. Schemas live
under `contracts/analysis/automation-metric-membership*` and
`contracts/api/research-automation-metric-membership-api*`.

## Verification

Primary behavior owner is the persisted HTTP journey in
`tests/integration/research-automation-api.test.ts`, using actual workbook upload,
scope confirmation, report creation, rule adoption and selection on synthetic
thạch dừa, bình giữ nhiệt and quạt cầm tay inputs. It checks partial/complete
coverage, explicit UNKNOWN, conflicts, overlapping batches, exact retries,
missing-file recovery, immutable old reports and independent report-pair ledgers.

Two credible regressions were reproduced on pre-fix code and then passed:

1. A corrupt later independent receipt incorrectly broke historical receipt reads
   (500 instead of 200). Current whole-universe reads still reject that corruption.
2. A new KEEP report pair silently inherited both accepted rows (2 instead of 0).
   Pair-scoped persistence now leaves the new pair pending until explicitly accepted.

Linux generation passed for both new contracts. Final typecheck and affected
group: **95/95 PASS**, including pair isolation and overlapping selections.
`git diff --check` passed. Evidence log remains outside Git at
`artifacts/research-execution-20261003/b1-membership-tests.log` in the coordinator
workspace. No Windows project checks, full release CI, real labels or real-data
acceptance are claimed.

ZCode GLM-5.3-Flash high completed a small schema-read smoke test, but the bounded
membership review timed out after 240 seconds without findings. It is not an
independent approval. GPT performed the owner-path audit and fixes.

## Next slice, without widening the methodology

1. Add a versioned revision request with an explicit frozen set of acceptance
   receipt references; leave revision v1 and old labels semantics unchanged.
2. Verify full universe coverage against the original exact input and adopted rule.
   Project accepted labels into the existing generic calculator; exclude UNKNOWN
   from WIDE, preserve missing versus zero and source measurement periods.
3. Retain a separate classified snapshot with exact dependency references. Reuse
   existing report attempts, cancellation and atomic Market/Insight pair publication.
   Historical reads verify saved output and dependencies without running methods.
4. Render the bounded classified M03/M04 output in the new pair only. Add independent
   expected totals to the same owner journey; do not claim annual growth or whole-market
   coverage merely because membership is complete.
5. Add the two distinct UI actions (rule adoption and selected acceptance), then
   proceed to Insight's own coding overlay. Do not reuse Metric semantics for quotes.

No UI, classified calculation integration, new real report, merge, deployment,
provider call, or analytical-section completion occurred in this slice.
